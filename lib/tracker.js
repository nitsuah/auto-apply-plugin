/**
 * apply-bot — tracker.js
 * Application tracking helpers.
 * These run in the service worker context using chrome.storage.local.
 */

/**
 * Add a new application entry to the tracker.
 *
 * @param {object} app
 * @param {string} app.company
 * @param {string} app.title
 * @param {string} app.url
 * @param {string} [app.status]     Defaults to 'applied'.
 * @param {string} [app.jd_snippet] Short snippet of the JD.
 * @returns {Promise<object>} The saved application entry.
 */
export async function addApplication(app) {
  const data = await chrome.storage.local.get('applications');
  const applications = data.applications || [];

  const entry = {
    id: crypto.randomUUID(),
    company: app.company || '',
    title: app.title || '',
    url: app.url || '',
    status: app.status || 'applied',
    date: new Date().toISOString().slice(0, 10),
    jd_snippet: (app.jd_snippet || '').slice(0, 300),
    answers_generated: app.answers_generated || false,
  };

  applications.push(entry);
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
 * Update the status of an existing application.
 *
 * @param {string} id
 * @param {string} status
 * @returns {Promise<boolean>} true if found and updated.
 */
export async function updateApplicationStatus(id, status) {
  const data = await chrome.storage.local.get('applications');
  const applications = data.applications || [];
  const idx = applications.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  applications[idx].status = status;
  await chrome.storage.local.set({ applications });
  return true;
}
