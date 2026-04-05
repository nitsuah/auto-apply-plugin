/**
 * apply-bot — popup.js
 * Handles all UI logic for the extension popup.
 */

// ── Messaging helpers ─────────────────────────────────────────────────────────

/**
 * Send a message to the background service worker and return the response.
 * @param {object} msg
 * @returns {Promise<any>}
 */
async function sendMessage(msg) {
  return chrome.runtime.sendMessage(msg);
}

/**
 * Send a message to the active tab's content script.
 * @param {object} msg
 * @returns {Promise<any>}
 */
async function sendToActiveTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found');

  await ensureContentScriptReady(tab.id);
  return chrome.tabs.sendMessage(tab.id, msg);
}

async function ensureContentScriptReady(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'DETECT_ATS' });
    return;
  } catch (err) {
    const message = err?.message || String(err);
    if (!/Receiving end does not exist/i.test(message)) {
      if (/Cannot access|extensions gallery|chrome:\/\//i.test(message)) {
        throw new Error('This page cannot be autofilled. Open a job application page and try again.');
      }
      throw err;
    }
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js'],
    });
  } catch (err) {
    const message = err?.message || String(err);
    if (/Cannot access|extensions gallery|chrome:\/\//i.test(message)) {
      throw new Error('This page cannot be autofilled. Open a supported or active application form and try again.');
    }
    throw new Error(`Unable to attach the page helper. ${message}`);
  }

  try {
    await chrome.tabs.sendMessage(tabId, { type: 'DETECT_ATS' });
  } catch (err) {
    const message = err?.message || String(err);
    throw new Error(`The page helper could not connect. Refresh the job form and try again. (${message})`);
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const trackerSaveTimers = new Map();
const expandedTrackerIds = new Set();

function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) {
    el.classList.add('hidden');
  }
  $(name + '-screen').classList.remove('hidden');
  document.body.dataset.screen = name;
}

function setStatus(elId, msg, type = '') {
  const el = $(elId);
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await initTabs();
  await initSetupHandlers();
  await loadMainScreen();
  await initMainHandlers();
  await initTrackerHandlers();
  await initPreviewHandlers();
  await initHelpHandlers();
});

// ── Tab switching (upload vs paste) ──────────────────────────────────────────

async function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  for (const btn of tabBtns) {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-content').forEach((tc) => tc.classList.add('hidden'));
      $('tab-' + target).classList.remove('hidden');
    });
  }
}

// ── Setup screen ─────────────────────────────────────────────────────────────

async function initSetupHandlers() {
  // File drop/change
  const fileInput = $('resume-file');
  const dropZone = $('file-drop-zone');
  const dropLabel = $('file-drop-label');

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) {
      dropLabel.textContent = '📄 ' + fileInput.files[0].name;
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      dropLabel.textContent = '📄 ' + file.name;
    }
  });

  const sensitiveOptin = $('sensitive-optin');
  const sensitiveFields = $('sensitive-fields');
  if (sensitiveOptin && sensitiveFields) {
    const syncSensitiveVisibility = () => {
      sensitiveFields.classList.toggle('hidden', !sensitiveOptin.checked);
    };
    sensitiveOptin.addEventListener('change', syncSensitiveVisibility);
    syncSensitiveVisibility();
  }

  $('save-setup-btn').addEventListener('click', handleSaveSetup);
}

async function handleSaveSetup() {
  const apiKey = $('api-key-input').value.trim();
  const state = await sendMessage({ type: 'GET_STATE' });
  const hasExistingResume = !!state?.hasResume;
  const profile = readProfileForm();

  // Determine resume source
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  let resumeRaw = '';

  if (activeTab === 'paste') {
    resumeRaw = $('resume-text').value.trim();
    if (!resumeRaw && !hasExistingResume && !hasAnyProfileValue(profile)) {
      setStatus('setup-status', '⚠️ Paste your resume text or enter key profile fields.', 'error');
      return;
    }
  } else {
    const file = $('resume-file').files[0];
    if (file) {
      resumeRaw = await readFileAsText(file);
    } else if (!hasExistingResume && !hasAnyProfileValue(profile)) {
      setStatus('setup-status', '⚠️ Upload a resume or enter key profile fields first.', 'error');
      return;
    }
  }

  if (!apiKey && resumeRaw) {
    setStatus('setup-status', '⚠️ Add a Gemini key to parse a new resume upload, or save your profile only.', 'error');
    return;
  }

  if (!$('privacy-consent').checked) {
    setStatus('setup-status', '⚠️ Please review and accept the privacy note first.', 'error');
    return;
  }

  const settings = {
    gemini_api_key: apiKey,
    gemini_model: $('gemini-model').value || 'auto',
    preferred_salary_min: Number($('salary-min').value) || null,
    preferred_salary_max: Number($('salary-max').value) || null,
    work_authorization: $('work-auth').value || null,
    preferred_remote: $('prefer-remote').checked,
    privacy_consent: $('privacy-consent').checked,
    privacy_consent_at: $('privacy-consent').checked ? new Date().toISOString() : null,
  };

  $('save-setup-btn').disabled = true;
  setStatus(
    'setup-status',
    resumeRaw ? '⏳ Parsing resume with Gemini…' : '⏳ Saving your core profile…'
  );

  try {
    const resp = await sendMessage({ type: 'SAVE_SETUP', payload: { resumeRaw, settings, profile } });
    if (resp?.success) {
      fillProfileForm(resp?.resume || profile);
      setStatus(
        'setup-status',
        resumeRaw ? '✅ Resume parsed and profile saved!' : '✅ Core profile saved!',
        'success'
      );
      setTimeout(() => loadMainScreen(), 800);
    } else {
      setStatus('setup-status', '❌ ' + (resp?.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    setStatus('setup-status', '❌ ' + err.message, 'error');
  } finally {
    $('save-setup-btn').disabled = false;
  }
}

/**
 * Read a File object as plain text or, for binary formats (PDF/DOCX), as a
 * base64 data URL for Gemini to parse. Legacy .doc files are rejected.
 */
async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const isPdf = file.type === 'application/pdf';
    const lowerName = file.name.toLowerCase();
    const isDocx = lowerName.endsWith('.docx');
    const isPdfByExt = !isPdf && lowerName.endsWith('.pdf');

    if (isPdf || isPdfByExt || isDocx) {
      // For supported binary files, encode as a base64 data URL and let Gemini handle the rest
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result); // data URL string
      reader.onerror = reject;
      reader.readAsDataURL(file); // base64 data URL
    } else if (lowerName.endsWith('.doc')) {
      reject(new Error('Legacy .doc files are not supported. Please upload a PDF or DOCX file.'));
    } else {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    }
  });
}

// ── Main screen ───────────────────────────────────────────────────────────────

async function loadMainScreen(options = {}) {
  const { showMain = true } = options;
  const resp = await sendMessage({ type: 'GET_STATE' });
  const {
    hasResume,
    hasApiKey,
    resumeName,
    applications,
    currentAts,
    profileCompleteness,
    privacyConsent,
    learnedDefaultsCount,
  } = resp || {};

  applyStateToSetupForm(resp || {});
  await renderLearnedDefaults();

  if (!privacyConsent || (!hasApiKey && !hasResume)) {
    showScreen('setup');
    if (!privacyConsent) {
      setStatus('setup-status', 'Review the privacy note once to continue using apply-bot.');
    }
    return;
  }

  if (showMain) {
    showScreen('main');
  }

  // Status badges
  $('resume-status').textContent = hasResume
    ? '✅ ' + (resumeName || 'Loaded')
    : '⚠️ Profile only';
  $('resume-status').className = 'badge ' + (hasResume ? 'badge-ok' : 'badge-warn');

  $('api-status').textContent = hasApiKey ? '✅ Connected' : '⚠️ Optional';
  $('api-status').className = 'badge ' + (hasApiKey ? 'badge-ok' : 'badge-warn');

  $('privacy-status-badge').textContent = privacyConsent ? '🔒 Local-first' : '⚠️ Review setup';
  $('privacy-status-badge').className = 'badge ' + (privacyConsent ? 'badge-ok' : 'badge-warn');

  const memoryCount = Number(learnedDefaultsCount || 0);
  $('learned-status').textContent = `${memoryCount} saved`;
  $('learned-status').className = 'badge ' + (memoryCount ? 'badge-ok' : 'badge-info');

  const completeness = profileCompleteness || { completed: 0, total: 8 };
  $('profile-status').textContent = `${completeness.completed}/${completeness.total} complete`;
  $('profile-status').className = 'badge ' + (completeness.completed >= Math.max(4, completeness.total - 2) ? 'badge-ok' : 'badge-warn');

  // ATS detection
  if (currentAts) {
    $('ats-row').style.display = 'flex';
    $('ats-status').textContent = currentAts;
    $('ats-hint').classList.remove('hidden');
    $('ats-hint').textContent = getAtsHint(currentAts);
  } else {
    $('ats-row').style.display = 'none';
    $('ats-status').textContent = '';
    $('ats-hint').classList.remove('hidden');
    $('ats-hint').textContent = 'Open a supported job application form to use profile-first autofill.';
  }

  const apps = applications || [];
  applyTrackerSummary(apps);

  renderFillReport(resp?.lastFillReport);
}

function applyTrackerSummary(apps = []) {
  const total = apps.length;
  const filled = apps.filter((a) => normalizeTrackingStatus(a.status) === 'filled').length;
  const pending = apps.filter((a) => ['drafted', 'filled'].includes(normalizeTrackingStatus(a.status))).length;

  if ($('stat-total')) $('stat-total').textContent = total;
  if ($('stat-applied')) $('stat-applied').textContent = filled;
  if ($('stat-pending')) $('stat-pending').textContent = pending;
  if ($('header-stat-total')) $('header-stat-total').textContent = total;
  if ($('header-stat-pending')) $('header-stat-pending').textContent = pending;
  if ($('header-tracker-count')) $('header-tracker-count').textContent = String(total);
}

async function initMainHandlers() {
  $('header-tracker-btn')?.addEventListener('click', async () => {
    await renderTracker();
    showScreen('tracker');
  });


  $('fill-btn').addEventListener('click', async () => {
    $('fill-btn').disabled = true;
    setStatus('fill-status', '⏳ Analyzing page & generating answers…');
    try {
      const resp = await sendToActiveTab({ type: 'FILL_FORM' });
      if (resp?.success) {
        const report = resp.report || {};
        const summary = [
          `${report.filled || 0} filled`,
          report.preserved ? `${report.preserved} kept` : '',
          Array.isArray(report.unresolved) && report.unresolved.length
            ? `${report.unresolved.length} to review`
            : '',
        ].filter(Boolean).join(' • ');

        const message = resp?.warning
          ? `✅ Common fields filled (${summary || 'profile-first mode'}). ${resp.warning}`
          : `✅ Fill complete${summary ? ` — ${summary}` : ''}. Review before submitting.`;
        setStatus('fill-status', message, 'success');
        renderFillReport(report);
        await loadMainScreen();
      } else {
        setStatus('fill-status', '❌ ' + (resp?.error || 'Could not fill form.'), 'error');
      }
    } catch (err) {
      setStatus('fill-status', '❌ ' + err.message, 'error');
    } finally {
      $('fill-btn').disabled = false;
    }
  });

  $('mark-submitted-btn').addEventListener('click', async () => {
    $('mark-submitted-btn').disabled = true;
    try {
      const resp = await sendMessage({ type: 'MARK_LAST_SUBMITTED' });
      if (resp?.success) {
        renderFillReport(null);
        setStatus('fill-status', '✅ Marked the latest tracked application as submitted.', 'success');
        await loadMainScreen();
      } else {
        setStatus('fill-status', '❌ ' + (resp?.error || 'Could not update tracker status.'), 'error');
      }
    } catch (err) {
      setStatus('fill-status', '❌ ' + err.message, 'error');
    } finally {
      $('mark-submitted-btn').disabled = false;
    }
  });

  $('preview-btn').addEventListener('click', async () => {
    const resp = await sendMessage({ type: 'GET_LAST_ANSWERS' });
    renderPreview(resp?.answers, resp?.report);
    showScreen('preview');
  });

  $('edit-resume-btn').addEventListener('click', async () => {
    showScreen('setup');
    const state = await sendMessage({ type: 'GET_STATE' });
    applyStateToSetupForm(state || {});
    await renderLearnedDefaults();
  });
}

// ── Tracker screen ────────────────────────────────────────────────────────────

async function initTrackerHandlers() {
  $('view-tracker-btn')?.addEventListener('click', async () => {
    await renderTracker();
    showScreen('tracker');
  });

  $('back-btn').addEventListener('click', () => showScreen('main'));

  $('export-csv-btn').addEventListener('click', async () => {
    const resp = await sendMessage({ type: 'GET_STATE' });
    exportCsv(resp?.applications || []);
  });

  $('tracker-body').addEventListener('click', async (event) => {
    const toggleBtn = event.target.closest('.tracker-card-toggle');
    if (toggleBtn) {
      const card = toggleBtn.closest('.tracker-card');
      if (card) {
        const expanded = card.classList.toggle('expanded');
        toggleBtn.setAttribute('aria-expanded', String(expanded));
        const id = card.dataset.id;
        if (expanded) expandedTrackerIds.add(id);
        else expandedTrackerIds.delete(id);
      }
      return;
    }

    const saveBtn = event.target.closest('.tracker-save-btn');
    if (!saveBtn) return;

    const card = saveBtn.closest('.tracker-card');
    if (!card) return;
    await saveTrackerCard(card, { showMessage: true });
  });

  const autoSave = (event) => {
    const field = event.target.closest?.('[data-field]');
    if (!field) return;
    const card = field.closest('.tracker-card');
    if (!card) return;
    scheduleTrackerSave(card);
  };

  $('tracker-body').addEventListener('change', autoSave, true);
  $('tracker-body').addEventListener('focusout', autoSave, true);
}

function scheduleTrackerSave(card) {
  const id = card?.dataset?.id;
  if (!id) return;

  if (trackerSaveTimers.has(id)) {
    clearTimeout(trackerSaveTimers.get(id));
  }

  const timer = setTimeout(() => {
    saveTrackerCard(card, { showMessage: false }).catch((err) => {
      setStatus('fill-status', '❌ ' + err.message, 'error');
    });
    trackerSaveTimers.delete(id);
  }, 250);

  trackerSaveTimers.set(id, timer);
}

async function saveTrackerCard(card, { showMessage = false } = {}) {
  const id = card?.dataset?.id;
  if (!id) return;

  const previousStatus = card.dataset.status || 'drafted';
  const saveBtn = card.querySelector('.tracker-save-btn');
  const saveState = card.querySelector('.tracker-save-state');
  const patch = {
    company: card.querySelector('[data-field="company"]')?.value || '',
    title: card.querySelector('[data-field="title"]')?.value || '',
    status: card.querySelector('[data-field="status"]')?.value || 'drafted',
    location: card.querySelector('[data-field="location"]')?.value || 'Unknown',
    employment_type: card.querySelector('[data-field="employment_type"]')?.value || 'Full-time',
    remote: !!card.querySelector('[data-field="remote"]')?.checked,
    salary_range: card.querySelector('[data-field="salary_range"]')?.value || '',
    scorecard: card.querySelector('[data-field="scorecard"]')?.value || '',
    verdict: card.querySelector('[data-field="verdict"]')?.value || '',
    description: card.querySelector('[data-field="description"]')?.value || '',
  };

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
  }
  if (saveState) {
    saveState.textContent = 'Saving…';
    saveState.classList.remove('ok');
  }

  try {
    const resp = await sendMessage({
      type: 'UPDATE_APPLICATION',
      payload: { id, patch },
    });

    if (!resp?.success) {
      throw new Error(resp?.error || 'Could not update tracker entry.');
    }

    card.classList.add('saved-flash');
    if (saveState) {
      saveState.textContent = '✓ Saved';
      saveState.classList.add('ok');
    }
    if (showMessage) {
      setStatus('fill-status', '✅ Tracker entry updated.', 'success');
    }

    const nextStatus = normalizeTrackingStatus(patch.status);
    card.dataset.status = nextStatus;
    await loadMainScreen({ showMain: false });

    if (nextStatus !== normalizeTrackingStatus(previousStatus)) {
      await renderTracker();
      showScreen('tracker');
    }

    setTimeout(() => {
      card.classList.remove('saved-flash');
    }, 1200);
  } catch (err) {
    if (saveState) {
      saveState.textContent = 'Save failed';
      saveState.classList.remove('ok');
    }
    if (showMessage) {
      setStatus('fill-status', '❌ ' + err.message, 'error');
    }
    throw err;
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  }
}

async function renderTracker() {
  const resp = await sendMessage({ type: 'GET_STATE' });
  const apps = resp?.applications || [];
  const tbody = $('tracker-body');
  tbody.innerHTML = '';
  applyTrackerSummary(apps);

  if (apps.length === 0) {
    $('tracker-empty').classList.remove('hidden');
    return;
  }
  $('tracker-empty').classList.add('hidden');

  const lanes = [
    ['drafted', '🟡 Drafted'],
    ['filled', '📝 Filled'],
    ['submitted', '✅ Submitted'],
    ['interview', '📅 Interview'],
    ['offer', '🎉 Offer'],
    ['rejected', '❌ Rejected'],
  ];

  tbody.innerHTML = lanes.map(([status, label]) => {
    const laneApps = apps
      .filter((app) => normalizeTrackingStatus(app.status) === status)
      .slice()
      .reverse();

    const cards = laneApps.length
      ? laneApps.map(renderTrackerCard).join('')
      : '<p class="empty-msg" style="padding:8px 0">Nothing here yet.</p>';

    return `
      <section class="tracker-lane">
        <div class="tracker-lane-header">
          <span class="tracker-lane-title">${label}</span>
          <span class="tracker-lane-count">${laneApps.length}</span>
        </div>
        <div class="tracker-lane-cards">${cards}</div>
      </section>
    `;
  }).join('');
}

function renderTrackerCard(app) {
  const expanded = expandedTrackerIds.has(app.id);
  const summaryMeta = [
    app.location || 'Unknown',
    app.employment_type || 'Full-time',
    app.remote ? 'Remote' : 'On-site',
  ].filter(Boolean).join(' • ');
  const summaryNote = app.verdict || app.scorecard || (app.description ? 'Description cached' : 'Click to edit');

  return `
    <div class="tracker-card${expanded ? ' expanded' : ''}" data-id="${escAttr(app.id)}" data-status="${escAttr(normalizeTrackingStatus(app.status))}">
      <div class="tracker-card-header">
        <span class="badge badge-info">${esc(formatTrackingStatus(app.status))}</span>
        <span class="tracker-card-date">${esc(formatDate(app.date))}</span>
      </div>
      <button type="button" class="tracker-card-summary tracker-card-toggle" aria-expanded="${expanded ? 'true' : 'false'}">
        <div class="tracker-summary-copy">
          <div class="tracker-summary-title">${esc(app.company || 'Unknown company')}</div>
          <div class="tracker-summary-role">${esc(app.title || 'Untitled role')}</div>
          <div class="tracker-summary-meta">${esc(summaryMeta)}</div>
          <div class="tracker-summary-note">${esc(summaryNote)}</div>
        </div>
        <span class="tracker-expand-indicator">▾</span>
      </button>
      <div class="tracker-card-details">
        <div class="tracker-card-fields">
          <input data-field="company" type="text" value="${escAttr(app.company || '')}" placeholder="Company name" />
          <input data-field="title" type="text" value="${escAttr(app.title || '')}" placeholder="Role title" />
          <input data-field="location" type="text" value="${escAttr(app.location || 'Unknown')}" placeholder="Location" />
          <div class="inline-fields compact-fields">
            <select data-field="employment_type">
              ${renderEmploymentTypeOptions(app.employment_type)}
            </select>
            <label class="checkbox-row" style="margin-top:0">
              <input data-field="remote" type="checkbox" ${app.remote ? 'checked' : ''} />
              Remote
            </label>
          </div>
          <input data-field="salary_range" type="text" value="${escAttr(app.salary_range || '')}" placeholder="Salary range" />
          <input data-field="scorecard" type="text" value="${escAttr(app.scorecard || '')}" placeholder="Scorecard" />
          <input data-field="verdict" type="text" value="${escAttr(app.verdict || '')}" placeholder="Verdict / notes" />
          <select data-field="status">
            ${renderStatusOptions(app.status)}
          </select>
          <textarea data-field="description" rows="4" placeholder="Stored job description / notes">${esc(app.description || app.jd_snippet || '')}</textarea>
        </div>
        <div class="tracker-card-actions">
          <a class="tracker-link" href="${escAttr(app.url || '#')}" target="_blank" rel="noopener">Open job ↗</a>
          <span class="tracker-save-state">Auto-save on blur</span>
          <button class="btn btn-secondary btn-sm tracker-save-btn" data-id="${escAttr(app.id)}">Save</button>
        </div>
      </div>
    </div>
  `;
}

function exportCsv(applications) {
  const header = 'Company,Role,Status,Date,Employment Type,Remote,Location,Salary Range,Scorecard,Verdict,URL';
  const rows = applications.map((a) =>
    [a.company, a.title, a.status, a.date, a.employment_type, a.remote ? 'Yes' : 'No', a.location, a.salary_range, a.scorecard, a.verdict, a.url]
      .map((v) => '"' + String(v || '').replace(/"/g, '""') + '"')
      .join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'apply-bot-tracker.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function renderLearnedDefaults() {
  const container = $('learned-defaults-list');
  const badge = $('memory-count-badge');
  if (!container) return;

  try {
    const resp = await sendMessage({ type: 'GET_LEARNED_DEFAULTS' });
    const items = Array.isArray(resp?.items) ? resp.items : [];

    if (badge) {
      badge.textContent = `${items.length} saved`;
    }

    if (!items.length) {
      container.innerHTML = '<p class="empty-msg">No memory saved yet.</p>';
      return;
    }

    container.innerHTML = items.map((item) => `
      <div class="memory-item" data-question="${escAttr(item.question)}">
        <div class="memory-item-label">Prompt</div>
        <div class="memory-item-question">${esc(item.question)}</div>
        <textarea data-field="answer" rows="3">${esc(item.answer || '')}</textarea>
        <div class="memory-item-actions">
          <button class="btn btn-secondary btn-sm memory-save-btn">Save</button>
          <button class="btn btn-ghost btn-sm memory-delete-btn">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p class="empty-msg">Could not load memory. ${esc(err.message)}</p>`;
  }
}

async function initHelpHandlers() {
  $('help-back-btn')?.addEventListener('click', () => loadMainScreen());

  $('header-help-btn')?.addEventListener('click', async () => {
    showScreen('help');
  });

  $('learned-defaults-list')?.addEventListener('click', async (event) => {
    const saveBtn = event.target.closest('.memory-save-btn');
    const deleteBtn = event.target.closest('.memory-delete-btn');
    const item = event.target.closest('.memory-item');
    if (!item) return;

    const question = item.dataset.question || '';
    const answer = item.querySelector('[data-field="answer"]')?.value || '';

    try {
      if (saveBtn) {
        const resp = await sendMessage({
          type: 'UPDATE_LEARNED_DEFAULT',
          payload: { question, answer },
        });
        if (!resp?.success) throw new Error(resp?.error || 'Could not update memory entry.');
        setStatus('setup-status', '✅ Memory entry updated.', 'success');
        await renderLearnedDefaults();
      }

      if (deleteBtn) {
        const resp = await sendMessage({
          type: 'DELETE_LEARNED_DEFAULT',
          payload: { question },
        });
        if (!resp?.success) throw new Error(resp?.error || 'Could not delete memory entry.');
        setStatus('setup-status', '✅ Memory entry deleted.', 'success');
        await renderLearnedDefaults();
      }
    } catch (err) {
      setStatus('setup-status', '❌ ' + err.message, 'error');
    }
  });

  $('open-privacy-setup-btn')?.addEventListener('click', async () => {
    showScreen('setup');
    await renderLearnedDefaults();
    setStatus('setup-status', 'Review or update your profile, privacy, and memory settings below.');
  });

  $('clear-cache-btn')?.addEventListener('click', async () => {
    try {
      const resp = await sendMessage({ type: 'CLEAR_TEMP_DATA' });
      if (!resp?.success) throw new Error(resp?.error || 'Could not clear temporary cache.');
      setStatus('help-status', '✅ Temporary cache cleared. Profile and tracker data were kept.', 'success');
      await loadMainScreen({ showMain: false });
      showScreen('help');
    } catch (err) {
      setStatus('help-status', '❌ ' + err.message, 'error');
    }
  });

  $('reset-data-btn')?.addEventListener('click', async () => {
    const confirmed = confirm('Delete all local apply-bot data on this browser? This clears your profile, tracker, drafts, and saved defaults.');
    if (!confirmed) return;

    try {
      const resp = await sendMessage({ type: 'RESET_ALL_DATA' });
      if (!resp?.success) throw new Error(resp?.error || 'Could not reset local data.');
      setStatus('help-status', '✅ All local data removed from this browser.', 'success');
      await loadMainScreen();
    } catch (err) {
      setStatus('help-status', '❌ ' + err.message, 'error');
    }
  });
}

// ── Preview screen ────────────────────────────────────────────────────────────

function initPreviewHandlers() {
  $('preview-back-btn').addEventListener('click', () => showScreen('main'));

  $('inject-from-preview-btn').addEventListener('click', async () => {
    const resp = await sendMessage({ type: 'GET_LAST_ANSWERS' });
    if (!resp?.answers) return;
    try {
      await sendToActiveTab({ type: 'INJECT_ANSWERS', payload: resp.answers });
    } catch (err) {
      // tab may not have content script
    }
  });
}

function renderPreview(answers, report) {
  const container = $('preview-content');
  renderFillReport(report, {
    cardId: 'preview-report-card',
    summaryId: 'preview-report-summary',
    listId: 'preview-report-unresolved',
    emptyMessage: 'No unresolved fields detected in the latest fill.',
  });

  if (!answers || Object.keys(answers).length === 0) {
    container.innerHTML = '<p class="empty-msg">No answers yet. Click "Fill This Application" first.</p>';
    return;
  }
  const fields = Object.entries(answers).map(([key, value]) => `
    <div class="preview-field">
      <div class="preview-field-label">${esc(key)}</div>
      <div class="preview-field-value">${esc(String(value))}</div>
    </div>
  `);
  container.innerHTML = fields.join('');
}

function renderFillReport(report, opts = {}) {
  const cardId = opts.cardId || 'fill-report-card';
  const summaryId = opts.summaryId || 'fill-report-summary';
  const listId = opts.listId || 'fill-report-unresolved';
  const emptyMessage = opts.emptyMessage || 'No unresolved fields in the latest fill report.';

  const card = $(cardId);
  const summaryEl = $(summaryId);
  const listEl = $(listId);
  if (!card || !summaryEl || !listEl) return;

  const hasReport = !!report && (
    Number(report.filled || 0) > 0 ||
    Number(report.preserved || 0) > 0 ||
    (Array.isArray(report.unresolved) && report.unresolved.length > 0)
  );

  if (!hasReport) {
    card.classList.add('hidden');
    listEl.innerHTML = '';
    if (cardId === 'fill-report-card' && $('mark-submitted-btn')) {
      $('mark-submitted-btn').style.display = 'none';
    }
    return;
  }

  card.classList.remove('hidden');
  if (cardId === 'fill-report-card' && $('mark-submitted-btn')) {
    $('mark-submitted-btn').style.display = 'inline-flex';
  }

  const summary = [
    `${report.filled || 0} filled`,
    report.preserved ? `${report.preserved} kept` : '',
    Array.isArray(report.unresolved) ? `${report.unresolved.length} to review` : '',
  ].filter(Boolean).join(' • ');

  summaryEl.textContent = summary || emptyMessage;

  const unresolved = Array.isArray(report.unresolved) ? report.unresolved : [];
  if (!unresolved.length) {
    listEl.innerHTML = `<li>${esc(emptyMessage)}</li>`;
    return;
  }

  listEl.innerHTML = unresolved.slice(0, 8).map((item) => `<li>${esc(item)}</li>`).join('');
}

function applyStateToSetupForm(state = {}) {
  if (state.apiKey) $('api-key-input').value = state.apiKey;

  const modelSelect = $('gemini-model');
  const savedModel = state.geminiModel || 'auto';
  const hasSavedOption = Array.from(modelSelect.options).some((opt) => opt.value === savedModel);
  modelSelect.value = hasSavedOption ? savedModel : 'auto';

  const settings = state.settings || {};
  $('salary-min').value = settings.preferred_salary_min ?? '';
  $('salary-max').value = settings.preferred_salary_max ?? '';
  $('work-auth').value = settings.work_authorization || '';
  $('prefer-remote').checked = settings.preferred_remote !== false;
  $('privacy-consent').checked = settings.privacy_consent === true;

  fillProfileForm(state.profile || {});
}

function fillProfileForm(profile = {}) {
  $('profile-full-name').value = profile.full_name || profile.name || '';
  $('profile-email').value = profile.email || '';
  $('profile-phone').value = profile.phone || '';
  $('profile-location').value = profile.location || '';
  $('profile-address-line1').value = profile.address_line1 || '';
  $('profile-city').value = profile.city || '';
  $('profile-state-region').value = profile.state_region || profile.state || '';
  $('profile-postal-code').value = profile.postal_code || profile.zip || '';
  $('profile-linkedin').value = profile.linkedin || '';
  $('profile-github').value = profile.github || '';
  $('profile-portfolio').value = profile.portfolio || '';
  $('profile-current-company').value = profile.current_company || '';
  $('profile-current-title').value = profile.current_title || '';
  $('profile-years-of-experience').value = profile.years_of_experience || '';
  $('profile-pronouns').value = profile.pronouns || '';
  $('default-why-company').value = profile.why_company_default || '';
  $('default-why-role').value = profile.why_role_default || '';
  $('default-additional-info').value = profile.additional_info_default || '';
  $('default-start-date').value = profile.start_date || '';
  $('default-sponsorship').value = profile.requires_sponsorship || '';

  const sensitiveEnabled = !!profile.sensitive_optin;
  $('sensitive-optin').checked = sensitiveEnabled;
  $('sensitive-fields').classList.toggle('hidden', !sensitiveEnabled);
  $('profile-gender').value = sensitiveEnabled ? (profile.gender || '') : '';
  $('profile-race').value = sensitiveEnabled ? (profile.race || '') : '';
  $('profile-veteran').value = sensitiveEnabled ? (profile.veteran || '') : '';
  $('profile-disability').value = sensitiveEnabled ? (profile.disability || '') : '';
  $('profile-pronouns-sensitive').value = sensitiveEnabled ? (profile.pronouns_sensitive || '') : '';
}

function readProfileForm() {
  const sensitiveOptin = $('sensitive-optin').checked;
  return {
    full_name: $('profile-full-name').value.trim(),
    email: $('profile-email').value.trim(),
    phone: $('profile-phone').value.trim(),
    location: $('profile-location').value.trim(),
    address_line1: $('profile-address-line1').value.trim(),
    city: $('profile-city').value.trim(),
    state_region: $('profile-state-region').value.trim(),
    postal_code: $('profile-postal-code').value.trim(),
    linkedin: $('profile-linkedin').value.trim(),
    github: $('profile-github').value.trim(),
    portfolio: $('profile-portfolio').value.trim(),
    current_company: $('profile-current-company').value.trim(),
    current_title: $('profile-current-title').value.trim(),
    years_of_experience: $('profile-years-of-experience').value.trim(),
    pronouns: $('profile-pronouns').value.trim(),
    why_company_default: $('default-why-company').value.trim(),
    why_role_default: $('default-why-role').value.trim(),
    additional_info_default: $('default-additional-info').value.trim(),
    start_date: $('default-start-date').value.trim(),
    requires_sponsorship: $('default-sponsorship').value,
    sensitive_optin: sensitiveOptin,
    gender: sensitiveOptin ? $('profile-gender').value : '',
    race: sensitiveOptin ? $('profile-race').value : '',
    veteran: sensitiveOptin ? $('profile-veteran').value : '',
    disability: sensitiveOptin ? $('profile-disability').value : '',
    pronouns_sensitive: sensitiveOptin ? $('profile-pronouns-sensitive').value.trim() : '',
  };
}

function hasAnyProfileValue(profile = {}) {
  return Object.entries(profile).some(([key, value]) => key !== 'sensitive_optin' && String(value || '').trim());
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return esc(str).replace(/'/g, '&#39;');
}

function renderStatusOptions(selectedStatus) {
  const current = normalizeTrackingStatus(selectedStatus);
  const options = [
    ['drafted', 'Drafted'],
    ['filled', 'Filled'],
    ['submitted', 'Submitted'],
    ['interview', 'Interview'],
    ['offer', 'Offer'],
    ['rejected', 'Rejected'],
  ];

  return options.map(([value, label]) => (
    `<option value="${value}"${current === value ? ' selected' : ''}>${label}</option>`
  )).join('');
}

function renderEmploymentTypeOptions(selectedType) {
  const current = String(selectedType || 'Full-time');
  const options = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary'];
  return options.map((label) => (
    `<option value="${label}"${current === label ? ' selected' : ''}>${label}</option>`
  )).join('');
}

function normalizeTrackingStatus(status) {
  const value = String(status || '').toLowerCase().trim();
  if (!value) return 'drafted';
  if (value === 'applied') return 'submitted';
  return value;
}

function formatTrackingStatus(status) {
  switch (normalizeTrackingStatus(status)) {
    case 'submitted':
      return '✅ Submitted';
    case 'filled':
      return '📝 Filled';
    case 'interview':
      return '📅 Interview';
    case 'offer':
      return '🎉 Offer';
    case 'rejected':
      return '❌ Rejected';
    default:
      return '🟡 Drafted';
  }
}

function getAtsHint(ats) {
  switch (ats) {
    case 'Ashby':
      return 'Ashby is supported. Profile fields, saved defaults, and draft restore should all work here.';
    case 'Greenhouse':
      return 'Greenhouse is supported. Fill first, then review unresolved fields before submitting.';
    case 'Lever':
      return 'Lever is supported. Deterministic profile fill should cover the common fields.';
    case 'LinkedIn Easy Apply':
      return 'LinkedIn Easy Apply is partially supported. Review every step carefully before submitting.';
    case 'Workday':
    case 'iCIMS':
      return `${ats} support is improving. Expect partial autofill plus manual review.`;
    default:
      return 'Profile-first autofill is available when the current page looks like a supported application form.';
  }
}

/**
 * Format a date string (ISO or any valid date) for display as YYYY-MM-DD.
 * Returns '—' if the value is falsy or not a valid date.
 * @param {string|null|undefined} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).slice(0, 10) || '—';
    return d.toISOString().slice(0, 10);
  } catch {
    return '—';
  }
}
