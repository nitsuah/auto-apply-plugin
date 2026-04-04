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

  const entry = {
    id: existingIdx >= 0 ? applications[existingIdx].id : crypto.randomUUID(),
    company: app.company || applications[existingIdx]?.company || '',
    title: app.title || applications[existingIdx]?.title || '',
    url: app.url || applications[existingIdx]?.url || '',
    status: existingIdx >= 0
      ? pickHigherPriorityStatus(applications[existingIdx].status, normalizedStatus)
      : normalizedStatus,
    date: applications[existingIdx]?.date || now.slice(0, 10),
    updated_at: now,
    jd_snippet: (app.jd_snippet || applications[existingIdx]?.jd_snippet || '').slice(0, 300),
    answers_generated: Boolean(app.answers_generated || applications[existingIdx]?.answers_generated),
    fill_report: app.fill_report || applications[existingIdx]?.fill_report || null,
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
