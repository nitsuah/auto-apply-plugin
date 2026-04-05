/**
 * apply-bot — tracker.js
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
    date: existing.date || now.slice(0, 10),
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
  const salaryMatch = raw.match(/\$\s?\d[\d,]*(?:\.\d+)?\s*(?:k|K|\/hr|\/year)?\s*(?:-|–|to)\s*\$?\s?\d[\d,]*(?:\.\d+)?\s*(?:k|K|\/hr|\/year)?/);

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
