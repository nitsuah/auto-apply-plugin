/**
 * apply-bot â€” tracker.js
 * Application tracking helpers.
 * These run in the service worker context using chrome.storage.local.
 */

/**
 * Add or update an application entry in the tracker.
 *
 * @param {object} app
 * @param {string} app.company
 * @param {string} app.title
 * @param {string} app.url
 * @param {string} [app.status]     Defaults to 'filled'.
 * @param {string} [app.jd_snippet] Short snippet of the JD.
 * @returns {Promise<object>} The saved application entry.
 */
export async function addApplication(app) {
  const data = await chrome.storage.local.get('applications');
  const applications = data.applications || [];
  const now = new Date().toISOString();
  const normalizedStatus = normalizeApplicationStatus(app.status || 'filled');
  const existingIdx = applications.findIndex((entry) => entry.url && app.url && entry.url === app.url);
  const existing = existingIdx >= 0 ? applications[existingIdx] : {};

  const entry = {
    id: existingIdx >= 0 ? applications[existingIdx].id : crypto.randomUUID(),
    company: app.company || existing.company || '',
    title: app.title || existing.title || '',
    url: app.url || existing.url || '',
    status: existingIdx >= 0
      ? pickHigherPriorityStatus(applications[existingIdx].status, normalizedStatus)
      : normalizedStatus,
    sort_order: existingIdx >= 0
      ? normalizeSortOrder(applications[existingIdx].sort_order, 0)
      : getNextSortOrder(applications),
    date: normalizeTrackerDate(app.date) || existing.date || now.slice(0, 10),
    updated_at: now,
    jd_snippet: String(app.jd_snippet || existing.jd_snippet || '').slice(0, 300),
    description: String(app.description || existing.description || app.jd_snippet || '').slice(0, 6000),
    location: String(app.location || existing.location || 'Unknown').trim() || 'Unknown',
    employment_type: normalizeEmploymentType(app.employment_type ?? existing.employment_type),
    remote: app.remote !== undefined ? Boolean(app.remote) : Boolean(existing.remote),
    salary_range: String(app.salary_range || existing.salary_range || '').trim(),
    scorecard: String(app.scorecard || existing.scorecard || '').trim(),
    verdict: String(app.verdict || existing.verdict || '').trim(),
    answers_generated: Boolean(app.answers_generated || existing.answers_generated),
    fill_report: app.fill_report || existing.fill_report || null,
  };

  if (existingIdx >= 0) {
    applications[existingIdx] = entry;
  } else {
    applications.push(entry);
  }

  await chrome.storage.local.set({ applications });
  return entry;
}

/**
 * Retrieve all tracked applications.
 * @returns {Promise<object[]>}
 */
export async function getApplications() {
  const data = await chrome.storage.local.get('applications');
  return data.applications || [];
}

/**
 * Update editable fields on an existing application entry.
 *
 * @param {string} id
 * @param {object} patch
 * @returns {Promise<object|null>} The updated application, or null if not found.
 */
export async function updateApplication(id, patch = {}) {
  const data = await chrome.storage.local.get('applications');
  const applications = data.applications || [];
  const idx = applications.findIndex((a) => a.id === id);
  if (idx === -1) return null;

  const current = applications[idx];
  const next = {
    ...current,
    company: patch.company !== undefined ? String(patch.company || '').trim() : current.company,
    title: patch.title !== undefined ? String(patch.title || '').trim() : current.title,
    url: patch.url !== undefined ? String(patch.url || '').trim() : current.url,
    status: patch.status !== undefined ? normalizeApplicationStatus(patch.status) : current.status,
    sort_order: patch.sort_order !== undefined
      ? normalizeSortOrder(patch.sort_order, normalizeSortOrder(current.sort_order, 0))
      : normalizeSortOrder(current.sort_order, 0),
    description: patch.description !== undefined ? String(patch.description || '').slice(0, 6000) : current.description,
    location: patch.location !== undefined ? (String(patch.location || '').trim() || 'Unknown') : (current.location || 'Unknown'),
    employment_type: patch.employment_type !== undefined ? normalizeEmploymentType(patch.employment_type) : normalizeEmploymentType(current.employment_type),
    remote: patch.remote !== undefined ? Boolean(patch.remote) : Boolean(current.remote),
    salary_range: patch.salary_range !== undefined ? String(patch.salary_range || '').trim() : current.salary_range,
    scorecard: patch.scorecard !== undefined ? String(patch.scorecard || '').trim() : current.scorecard,
    verdict: patch.verdict !== undefined ? String(patch.verdict || '').trim() : current.verdict,
    updated_at: new Date().toISOString(),
  };

  applications[idx] = next;
  await chrome.storage.local.set({ applications });
  return next;
}

/**
 * Update the status of an existing application.
 *
 * @param {string} id
 * @param {string} status
 * @returns {Promise<boolean>} true if found and updated.
 */
export async function updateApplicationStatus(id, status) {
  const updated = await updateApplication(id, { status });
  return !!updated;
}

export async function deleteApplication(id) {
  const data = await chrome.storage.local.get('applications');
  const applications = data.applications || [];
  const idx = applications.findIndex((entry) => entry.id === id);
  if (idx === -1) return null;

  const [removed] = applications.splice(idx, 1);
  await chrome.storage.local.set({ applications });
  return removed || null;
}

export async function importApplicationsFromCsv(csvText = '') {
  const parsed = parseApplicationsCsv(csvText);
  const saved = [];

  for (const item of parsed.items) {
    saved.push(await addApplication(item));
  }

  return {
    imported: saved.length,
    skipped: parsed.skipped,
    warnings: parsed.warnings,
    items: saved,
  };
}

export function filterApplicationsForQuery(applications = [], query = '', options = {}) {
  const tokens = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const activeOnly = !!options.activeOnly;

  return (applications || []).filter((app) => {
    const status = normalizeApplicationStatus(app?.status);
    if (activeOnly && !['drafted', 'filled'].includes(status)) {
      return false;
    }

    if (!tokens.length) {
      return true;
    }

    const haystack = [
      app?.company,
      app?.title,
      app?.location,
      app?.employment_type,
      app?.salary_range,
      app?.scorecard,
      app?.verdict,
      app?.description,
      app?.jd_snippet,
    ].join(' ').toLowerCase();

    return tokens.every((token) => haystack.includes(token));
  });
}

export function parseApplicationsCsv(csvText = '') {
  const rows = parseCsvRows(csvText);
  if (!rows.length) {
    return { items: [], skipped: 0, warnings: ['CSV file is empty.'] };
  }

  const [headerRow, ...dataRows] = rows;
  const headerMap = buildCsvHeaderMap(headerRow);
  const items = [];
  let skipped = 0;

  for (const row of dataRows) {
    const hasContent = row.some((cell) => String(cell || '').trim());
    if (!hasContent) {
      skipped++;
      continue;
    }

    const company = getCsvValue(row, headerMap, ['company', 'employer', 'organization', 'organisation']);
    const title = getCsvValue(row, headerMap, ['role title', 'role', 'title', 'job title', 'position']);
    const url = getCsvValue(row, headerMap, ['url', 'job url', 'application url', 'link', 'job link']);
    const description = getCsvValue(row, headerMap, ['notes', 'description', 'job description', 'jd', 'details']);

    if (!company && !title && !url && !description) {
      skipped++;
      continue;
    }

    const remoteValue = getCsvValue(row, headerMap, ['remote', 'remote hybrid', 'remote or hybrid', 'remote status']);
    const remote = parseRemoteFlag(remoteValue, description);
    const location = getCsvValue(row, headerMap, ['location', 'city', 'office', 'work location']) || (remote ? 'Remote' : 'Unknown');

    items.push({
      company,
      title,
      url,
      status: normalizeApplicationStatus(getCsvValue(row, headerMap, ['status', 'stage', 'pipeline stage']) || 'submitted'),
      date: normalizeTrackerDate(getCsvValue(row, headerMap, ['date', 'applied date', 'application date', 'submitted date'])),
      employment_type: normalizeEmploymentType(getCsvValue(row, headerMap, ['employment type', 'employment', 'job type', 'type']) || title || description),
      remote,
      location,
      salary_range: getCsvValue(row, headerMap, ['salary range', 'salary', 'compensation', 'pay range']),
      scorecard: getCsvValue(row, headerMap, ['scorecard', 'fit score', 'score']),
      verdict: getCsvValue(row, headerMap, ['verdict', 'priority', 'outcome']),
      description,
      jd_snippet: description.slice(0, 300),
      answers_generated: false,
      fill_report: null,
    });
  }

  const warnings = items.length
    ? []
    : ['No valid application rows were found. Use columns like Company, Role Title, Status, Date, URL, Location, or Notes.'];

  return { items, skipped, warnings };
}

export function normalizeApplicationStatus(status) {
  const value = String(status || '').toLowerCase().trim();
  if (!value) return 'drafted';
  if (value === 'applied') return 'submitted';
  return value;
}

export function isTerminalApplicationStatus(status) {
  const normalized = normalizeApplicationStatus(status);
  return ['submitted', 'interview', 'offer', 'rejected'].includes(normalized);
}

export function normalizeEmploymentType(value) {
  const text = String(value || '').toLowerCase().trim();
  if (!text) return 'Full-time';
  if (text.includes('part')) return 'Part-time';
  if (text.includes('contract')) return 'Contract';
  if (text.includes('intern')) return 'Internship';
  if (text.includes('temp')) return 'Temporary';
  return 'Full-time';
}

export function deriveTrackerDetailsFromText(text = '', seed = {}) {
  const raw = String(text || '');
  const normalized = raw.replace(/\s+/g, ' ').trim();
  const locationMatch = raw.match(/(?:location|based in|work location|office location)\s*:?\s*([^\n|]+)/i);
  const salaryMatch = raw.match(/\$\s?\d[\d,]*(?:\.\d+)?\s*(?:k|K|\/hr|\/year)?\s*(?:-|â€“|to)\s*\$?\s?\d[\d,]*(?:\.\d+)?\s*(?:k|K|\/hr|\/year)?/);

  const location = String(seed.location || locationMatch?.[1] || '').trim() || (/\bremote\b/i.test(raw) ? 'Remote' : 'Unknown');
  const salary_range = String(seed.salary_range || salaryMatch?.[0] || '').replace(/\s+/g, ' ').trim();
  const remote = seed.remote !== undefined ? Boolean(seed.remote) : /\bremote\b|hybrid|work from home|wfh/i.test(raw);

  return {
    location,
    employment_type: normalizeEmploymentType(`${seed.employment_type || ''} ${seed.title || ''} ${normalized}`),
    remote,
    salary_range,
  };
}

function normalizeSortOrder(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getNextSortOrder(applications = []) {
  return applications.reduce((max, entry) => {
    return Math.max(max, normalizeSortOrder(entry?.sort_order, 0));
  }, 0) + 1024;
}

function pickHigherPriorityStatus(currentStatus, nextStatus) {
  const order = {
    drafted: 0,
    filled: 1,
    submitted: 2,
    interview: 3,
    offer: 4,
    rejected: 4,
  };

  const current = normalizeApplicationStatus(currentStatus);
  const next = normalizeApplicationStatus(nextStatus);
  return (order[next] ?? 0) >= (order[current] ?? 0) ? next : current;
}

function normalizeTrackerDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  let match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
}

function parseRemoteFlag(value, fallbackText = '') {
  const text = `${String(value || '').trim()} ${String(fallbackText || '').trim()}`.toLowerCase();
  if (!text) return false;
  if (/\b(no|false|onsite|on-site)\b/.test(text)) return false;
  return /\b(yes|true|remote|hybrid|wfh|work from home)\b/.test(text);
}

function buildCsvHeaderMap(headerRow = []) {
  return Object.fromEntries(
    headerRow
      .map((value, index) => [normalizeCsvHeader(value), index])
      .filter(([key]) => key)
  );
}

function getCsvValue(row = [], headerMap = {}, aliases = []) {
  for (const alias of aliases) {
    const index = headerMap[normalizeCsvHeader(alias)];
    if (index === undefined) continue;
    return String(row[index] || '').trim();
  }
  return '';
}

function normalizeCsvHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCsvRows(csvText = '') {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index++) {
    const char = csvText[index];

    if (inQuotes) {
      if (char === '"' && csvText[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    if (char !== '\r') {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}