// Update date to today and save when status changes to submitted
// --- Job Search Panel Logic ---
function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) {
    el.classList.add('hidden');
  }
  const screen = document.getElementById(name + '-screen');
  if (screen) screen.classList.remove('hidden');
  document.body.dataset.screen = name;
}

function renderJobSearchResults(results) {
  const resultsDiv = document.getElementById('job-search-results');
  if (!resultsDiv) return;
  if (!results || results.length === 0) {
    resultsDiv.innerHTML = '<p class="empty-msg">No jobs found for this search.</p>';
    return;
  }
  resultsDiv.innerHTML = results.map(j => `
    <div class="job-search-result">
      <div class="job-title">${j.title}</div>
      <div class="job-meta">${j.company} • ${j.location}</div>
      <a href="${j.url}" target="_blank" rel="noopener" class="job-link">View job</a>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  // Job Search panel events
  const jobSearchBtn = document.getElementById('job-search-btn');
  if (jobSearchBtn) {
    jobSearchBtn.onclick = () => {
      showScreen('job-search');
    };
  }
  const jobSearchBackBtn = document.getElementById('job-search-back-btn');
  if (jobSearchBackBtn) {
    jobSearchBackBtn.onclick = () => {
      showScreen('main');
    };
  }
  const jobSearchInput = document.getElementById('job-search-input');
  const jobSearchSubmitBtn = document.getElementById('job-search-submit-btn');
  if (jobSearchSubmitBtn && jobSearchInput) {
    jobSearchSubmitBtn.onclick = async () => {
      const query = jobSearchInput.value.trim();
      if (!query) return;
      jobSearchSubmitBtn.disabled = true;
      jobSearchSubmitBtn.textContent = 'Searching...';
      const { searchJobs } = await import('../lib/job-search.js');
      const results = await searchJobs(query);
      renderJobSearchResults(results);
      jobSearchSubmitBtn.disabled = false;
      jobSearchSubmitBtn.textContent = 'Search';
    };
    jobSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') jobSearchSubmitBtn.click();
    });
  }
});
// Helper for date input formatting (YYYY-MM-DD)
function formatDateInput(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// Track expanded state for rejected column
let expandedRejected = false;

// Event delegation for show more/less button
document.addEventListener('click', function (e) {
  if (e.target && e.target.classList.contains('tracker-show-more-rejected')) {
    expandedRejected = !expandedRejected;
    // Re-render tracker UI (assume renderTracker is main entry)
    if (typeof renderTracker === 'function') renderTracker();
  }
});

// Update date to today when status changes to submitted
// SINGLE GLOBAL HANDLER FOR DATE/STATUS ON TRACKER CARDS
document.addEventListener('change', function (e) {
  if (e.target && e.target.matches('input.tracker-card-date-input[data-field="date"]')) {
    const card = e.target.closest('.tracker-card');
    if (card && typeof saveTrackerCard === 'function') {
      saveTrackerCard(card, { showMessage: true });
    }
  }
  if (e.target && e.target.classList.contains('tracker-status-select')) {
    const card = e.target.closest('.tracker-card');
    if (!card) return;
    const newStatus = e.target.value;
    if (newStatus === 'submitted') {
      const today = new Date().toISOString().slice(0, 10);
      let dateInput = card.querySelector('input[data-field="date"]');
      if (dateInput) {
        dateInput.value = today;
      }
      let dateSpan = card.querySelector('span.tracker-card-date');
      if (dateSpan) {
        dateSpan.textContent = today;
      }
      if (typeof saveTrackerCard === 'function') {
        if (dateInput) dateInput.setAttribute('value', today);
        card.setAttribute('data-date', today);
        saveTrackerCard(card, { showMessage: true });
      }
    }
  }
});
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
const expandedMemoryQuestions = new Set();
const trackerViewState = {
  query: '',
  activeOnly: false,
};
const popupQuery = new URLSearchParams(window.location.search);
const DEFAULT_RESUME_DROP_LABEL = '📄 Drop PDF / DOCX / TXT here or click to browse';
const trackerDragState = {
  id: '',
  status: '',
};
const TRACKER_STATUS_META = {
  drafted: {
    label: 'Drafted',
    emoji: '🟡',
    optionHint: 'saved lead / not sent',
    cardHint: 'Saved lead — tailor before sending',
  },
  filled: {
    label: 'Filled',
    emoji: '📝',
    optionHint: 'prepped and ready',
    cardHint: 'Profile is filled — review and send next',
  },
  submitted: {
    label: 'Submitted',
    emoji: '✅',
    optionHint: 'application sent',
    cardHint: 'Application is out the door',
  },
  interview: {
    label: 'Interview',
    emoji: '📅',
    optionHint: 'talking with the team',
    cardHint: 'Active conversations underway',
  },
  offer: {
    label: 'Offer',
    emoji: '🎉',
    optionHint: 'final stage / decision time',
    cardHint: 'Strong signal — decision stage',
  },
  rejected: {
    label: 'Rejected',
    emoji: '❌',
    optionHint: 'closed out / archived',
    cardHint: 'Closed out locally for reference',
  },
};
const TRACKER_STATUS_ORDER = Object.keys(TRACKER_STATUS_META);

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

function setResumeDropLabel(fileName = '') {
  const dropLabel = $('file-drop-label');
  if (!dropLabel) return;
  dropLabel.textContent = fileName ? `📄 ${fileName}` : DEFAULT_RESUME_DROP_LABEL;
}

function setElementsDisabled(container, disabled) {
  if (!container) return;
  container.querySelectorAll('input, textarea, select, button').forEach((el) => {
    el.disabled = disabled;
  });
}

function syncConsentGate() {
  const consentAccepted = $('privacy-consent')?.checked === true;
  $('profile-privacy-section')?.classList.toggle('hidden', consentAccepted);

  const profileGate = $('profile-consent-gated');
  const aiGate = $('ai-consent-gated');
  profileGate?.classList.toggle('consent-locked', !consentAccepted);
  aiGate?.classList.toggle('consent-locked', !consentAccepted);
  setElementsDisabled(profileGate, !consentAccepted);
  setElementsDisabled(aiGate, !consentAccepted);

  $('ai-locked-note')?.classList.toggle('hidden', consentAccepted);
}

function readSettingsForm() {
  return {
    gemini_api_key: $('api-key-input').value.trim(),
    gemini_model: $('gemini-model').value || 'auto',
    preferred_salary_min: Number($('salary-min').value) || null,
    preferred_salary_max: Number($('salary-max').value) || null,
    work_authorization: $('work-auth').value || null,
    preferred_remote: $('prefer-remote').checked,
    privacy_consent: $('privacy-consent').checked,
    privacy_consent_at: $('privacy-consent').checked ? new Date().toISOString() : null,
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  document.body.dataset.standalone = isStandaloneView() ? 'true' : 'false';
  await initTabs();
  await initSetupHandlers();
  await loadMainScreen();
  await initMainHandlers();
  await initTrackerHandlers();
  await initPreviewHandlers();
  await initAiHandlers();
  await initHelpHandlers();
  initStatusNavHandlers();
  await applyInitialRequestedScreen();
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

  fileInput.addEventListener('change', () => {
    setResumeDropLabel(fileInput.files[0]?.name || '');
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
      setResumeDropLabel(file.name);
    }
  });

  $('privacy-consent')?.addEventListener('change', () => {
    syncConsentGate();
    if ($('privacy-consent').checked) {
      setStatus('setup-status', '✅ Privacy accepted. Profile and AI settings are now unlocked.', 'success');
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

  $('download-resume-attachment-btn')?.addEventListener('click', async () => {
    try {
      const resp = await sendMessage({ type: 'GET_RESUME_ATTACHMENT' });
      if (!resp?.success || !resp.attachment) {
        throw new Error(resp?.error || 'No saved resume attachment is available yet.');
      }
      downloadResumeAttachment(resp.attachment);
      setStatus('setup-status', '✅ Downloaded your saved resume copy.', 'success');
    } catch (err) {
      setStatus('setup-status', '❌ ' + err.message, 'error');
    }
  });

  $('remove-resume-attachment-btn')?.addEventListener('click', async () => {
    const confirmed = confirm('Remove the saved local resume attachment preview? Your structured profile details will stay intact.');
    if (!confirmed) return;

    try {
      const resp = await sendMessage({ type: 'REMOVE_RESUME_ATTACHMENT' });
      if (!resp?.success) {
        throw new Error(resp?.error || 'Could not remove the saved attachment.');
      }
      const state = await sendMessage({ type: 'GET_STATE' });
      applyStateToSetupForm(state || {});
      setStatus('setup-status', '✅ Saved resume attachment removed.', 'success');
    } catch (err) {
      setStatus('setup-status', '❌ ' + err.message, 'error');
    }
  });

  $('save-setup-btn').addEventListener('click', handleSaveSetup);
}

async function handleSaveSetup() {
  const settings = readSettingsForm();
  const apiKey = settings.gemini_api_key;
  const state = await sendMessage({ type: 'GET_STATE' });
  const hasExistingResume = !!state?.hasResume;
  const profile = readProfileForm();

  // Determine resume source
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  let resumeRaw = '';
  let resumeMeta = null;

  if (activeTab === 'paste') {
    resumeRaw = $('resume-text').value.trim();
    if (resumeRaw) {
      resumeMeta = {
        name: 'resume-paste.txt',
        type: 'text/plain',
        source: 'paste',
      };
    }
    if (!resumeRaw && !hasExistingResume && !hasAnyProfileValue(profile)) {
      setStatus('setup-status', '⚠️ Paste your resume text or enter key profile fields.', 'error');
      return;
    }
  } else {
    const file = $('resume-file').files[0];
    if (file) {
      resumeRaw = await readFileAsText(file);
      resumeMeta = {
        name: file.name,
        type: file.type || '',
        source: 'upload',
      };
    } else if (!hasExistingResume && !hasAnyProfileValue(profile)) {
      setStatus('setup-status', '⚠️ Upload a resume or enter key profile fields first.', 'error');
      return;
    }
  }

  if (!apiKey && resumeRaw) {
    setStatus('setup-status', '⚠️ Add a Gemini key in the AI panel to parse a new resume upload, or save your profile only.', 'error');
    return;
  }

  if (!settings.privacy_consent) {
    setStatus('setup-status', '⚠️ Please review and accept the privacy note first.', 'error');
    return;
  }

  $('save-setup-btn').disabled = true;
  setStatus(
    'setup-status',
    resumeRaw ? '⏳ Parsing resume with Gemini…' : '⏳ Saving your core profile…'
  );

  try {
    const resp = await sendMessage({ type: 'SAVE_SETUP', payload: { resumeRaw, resumeMeta, settings, profile } });
    if (resp?.success) {
      fillProfileForm(resp?.resume || profile);
      renderResumeAttachment(resp?.resumeAttachment || state?.resumeAttachment || null);
      setStatus(
        'setup-status',
        resumeRaw
          ? '✅ Resume parsed, saved, and attached locally!'
          : (resp?.settingsSavedOnly ? '✅ Preferences saved.' : '✅ Core profile saved!'),
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

async function handleSaveAiSettings() {
  const settings = readSettingsForm();
  if (!settings.privacy_consent) {
    setStatus('ai-status', '⚠️ Accept privacy once in Profile before editing AI settings.', 'error');
    return;
  }

  const profile = readProfileForm();
  $('save-ai-settings-btn').disabled = true;
  setStatus('ai-status', '⏳ Saving AI settings…');

  try {
    const resp = await sendMessage({
      type: 'SAVE_SETUP',
      payload: {
        resumeRaw: '',
        resumeMeta: null,
        settings,
        profile,
      },
    });

    if (!resp?.success) {
      throw new Error(resp?.error || 'Could not save AI settings.');
    }

    await loadMainScreen({ showMain: false });
    showScreen('ai');
    setStatus('ai-status', '✅ AI settings saved.', 'success');
  } catch (err) {
    setStatus('ai-status', '❌ ' + err.message, 'error');
  } finally {
    $('save-ai-settings-btn').disabled = false;
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

  const resumeTooltip = hasResume
    ? `Resume is ready (${resumeName || 'loaded'}). Click to edit Profile.`
    : 'Profile-only mode is active. Click to add or update your resume.';
  setBadgeState('resume-status', hasResume ? 'Ready' : 'Profile only', hasResume ? 'ok' : 'warn', resumeTooltip);
  setStatusRowMeta('resume-row', resumeTooltip);

  const apiTooltip = hasApiKey
    ? 'Gemini is connected for optional AI help. Click to open the AI panel.'
    : 'AI help is optional. Click to add or update your Gemini key in the AI panel.';
  setBadgeState('api-status', hasApiKey ? 'Connected' : 'Optional', hasApiKey ? 'ok' : 'info', apiTooltip);
  setStatusRowMeta('api-row', apiTooltip);

  const completeness = profileCompleteness || { completed: 0, total: 8 };
  const profileReady = completeness.completed >= Math.max(4, completeness.total - 2);
  const profileTooltip = `Your core profile is ${completeness.completed}/${completeness.total} complete. Click to review Profile.`;
  setBadgeState('profile-status', `${completeness.completed}/${completeness.total} complete`, profileReady ? 'ok' : 'warn', profileTooltip);
  setStatusRowMeta('profile-row', profileTooltip);

  const privacyTooltip = privacyConsent
    ? 'Local-first privacy is enabled. Click for EULA, privacy, and reset controls.'
    : 'Privacy review is required. Click for EULA and privacy details.';
  setBadgeState('privacy-status-badge', privacyConsent ? 'Local-first' : 'Review', privacyConsent ? 'ok' : 'warn', privacyTooltip);
  setStatusRowMeta('privacy-row', privacyTooltip);

  const memoryCount = Number(learnedDefaultsCount || 0);
  const memoryTooltip = memoryCount
    ? `${memoryCount} remembered answers are saved. Click to review Memory in Profile.`
    : 'No remembered answers yet. Click to open Memory in Profile.';
  setBadgeState('learned-status', memoryCount ? `${memoryCount} saved` : 'Empty', 'memory', memoryTooltip);
  setStatusRowMeta('learned-row', memoryTooltip);

  const atsMeta = getAtsMeta(currentAts);
  $('ats-row').style.display = 'flex';
  setBadgeState('ats-status', atsMeta.label, atsMeta.tone, atsMeta.tip);
  setStatusRowMeta('ats-row', atsMeta.tip);
  $('ats-hint').classList.toggle('hidden', !atsMeta.hint);
  $('ats-hint').textContent = atsMeta.hint || '';

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
  if ($('header-tracker-count')) {
    $('header-tracker-count').textContent = `${pending} / ${total} active`;
  }
  if ($('header-tracker-btn')) {
    $('header-tracker-btn').title = `${pending} of ${total} tracked applications still active. Open tracker workspace.`;
  }
}

async function initMainHandlers() {
  $('header-home-btn')?.addEventListener('click', async () => {
    await loadMainScreen();
  });

  $('header-tracker-btn')?.addEventListener('click', async () => {
    if (!isStandaloneView()) {
      const opened = await openExpandedWorkspace('tracker');
      if (opened) return;
    }

    await renderTracker();
    showScreen('tracker');
  });

  bindReviewJumpHandlers('fill-report-unresolved', 'fill-status');

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
    if (!isStandaloneView()) {
      const opened = await openExpandedWorkspace('setup', 'core-profile-section');
      if (opened) return;
    }

    showScreen('setup');
    const state = await sendMessage({ type: 'GET_STATE' });
    applyStateToSetupForm(state || {});
    await renderLearnedDefaults();
    scrollToSection('core-profile-section');
  });
}

// ── Tracker screen ────────────────────────────────────────────────────────────

async function initTrackerHandlers() {
  $('view-tracker-btn')?.addEventListener('click', async () => {
    if (!isStandaloneView()) {
      const opened = await openExpandedWorkspace('tracker');
      if (opened) return;
    }

    await renderTracker();
    showScreen('tracker');
  });

  $('tracker-home-btn')?.addEventListener('click', async () => {
    await loadMainScreen();
  });

  $('add-application-btn')?.addEventListener('click', () => toggleTrackerAddForm());
  $('cancel-add-application-btn')?.addEventListener('click', () => toggleTrackerAddForm(false));
  $('import-current-job-btn')?.addEventListener('click', importCurrentPageIntoTrackerForm);
  $('save-new-application-btn')?.addEventListener('click', saveNewApplicationFromForm);
  $('import-csv-btn')?.addEventListener('click', () => $('import-csv-input')?.click());
  $('import-csv-input')?.addEventListener('change', importTrackerCsvFile);

  if ($('new-application-status')) {
    $('new-application-status').innerHTML = renderStatusOptions($('new-application-status').value || 'drafted');
  }

  $('tracker-search-input')?.addEventListener('input', async (event) => {
    trackerViewState.query = event.target.value || '';
    await renderTracker();
    showScreen('tracker');
  });
  $('tracker-scope-toggle')?.addEventListener('click', async () => {
    trackerViewState.activeOnly = !trackerViewState.activeOnly;
    await renderTracker();
    showScreen('tracker');
  });
  $('tracker-clear-filters-btn')?.addEventListener('click', async () => {
    trackerViewState.query = '';
    trackerViewState.activeOnly = false;
    if ($('tracker-search-input')) $('tracker-search-input').value = '';
    await renderTracker();
    showScreen('tracker');
  });

  $('export-csv-btn').addEventListener('click', async () => {
    const resp = await sendMessage({ type: 'GET_STATE' });
    exportCsv(resp?.applications || []);
    setTrackerScreenStatus('✅ Exported the current tracker as CSV.', 'success');
  });

  $('tracker-body').addEventListener('dragstart', handleTrackerDragStart);
  $('tracker-body').addEventListener('dragover', handleTrackerDragOver);
  $('tracker-body').addEventListener('drop', handleTrackerDrop);
  $('tracker-body').addEventListener('dragend', handleTrackerDragEnd);

  $('tracker-body').addEventListener('click', async (event) => {
    if (event.target.closest('.tracker-summary-title-link')) {
      event.stopPropagation();
      return;
    }

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

    const deleteBtn = event.target.closest('.tracker-delete-btn');
    if (deleteBtn) {
      const card = deleteBtn.closest('.tracker-card');
      if (card) {
        await deleteTrackerCard(card);
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
  let date = '';
  const dateInput = card.querySelector('input[data-field="date"]');
  if (dateInput) {
    date = dateInput.value;
  } else {
    const dateSpan = card.querySelector('span.tracker-card-date');
    if (dateSpan) {
      date = dateSpan.textContent;
    }
  }
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
    date: date || '',
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
      saveState.textContent = showMessage ? '✓ Saved' : '✓ Auto-saved';
      saveState.classList.add('ok');
    }
    if (showMessage) {
      setStatus('fill-status', '✅ Tracker entry updated.', 'success');
    }

    const nextStatus = normalizeTrackingStatus(patch.status);
    card.dataset.status = nextStatus;
    card.dataset.sortOrder = String(resp?.entry?.sort_order ?? card.dataset.sortOrder ?? '');
    syncTrackerCardSummary(card, patch);
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

function syncTrackerCardSummary(card, patch = {}) {
  if (!card) return;

  const company = patch.company || 'Unknown company';
  const title = patch.title || 'Untitled role';
  const summaryMeta = [
    patch.location || 'Unknown',
    patch.employment_type || 'Full-time',
    patch.remote ? 'Remote' : 'On-site',
  ].filter(Boolean).join(' • ');
  const summaryNote = patch.verdict || patch.scorecard || (patch.description ? 'Description cached' : 'Click to edit');

  const statusSelect = card.querySelector('.tracker-card-header .tracker-status-select');
  if (statusSelect) {
    statusSelect.value = normalizeTrackingStatus(patch.status);
    statusSelect.dataset.statusTone = normalizeTrackingStatus(patch.status);
  }

  const titleEl = card.querySelector('.tracker-summary-title');
  if (titleEl) titleEl.textContent = company;
  const roleEl = card.querySelector('.tracker-summary-role');
  if (roleEl) roleEl.textContent = title;
  const metaEl = card.querySelector('.tracker-summary-meta');
  if (metaEl) metaEl.textContent = summaryMeta;
  const salaryEl = card.querySelector('.tracker-summary-salary');
  if (salaryEl) {
    salaryEl.textContent = patch.salary_range || 'Pay range not saved yet';
    salaryEl.classList.toggle('hidden', !String(patch.salary_range || '').trim());
  }
  const noteEl = card.querySelector('.tracker-summary-note');
  if (noteEl) noteEl.textContent = summaryNote;
}

function handleTrackerDragStart(event) {
  const card = event.target.closest('.tracker-card');
  if (!card) return;

  trackerDragState.id = card.dataset.id || '';
  trackerDragState.status = card.dataset.status || 'drafted';
  card.classList.add('dragging');

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', trackerDragState.id);
  }
}

function handleTrackerDragOver(event) {
  const dragging = $('tracker-body')?.querySelector('.tracker-card.dragging');
  const container = event.target.closest('.tracker-lane-cards');
  if (!dragging || !container) return;

  event.preventDefault();
  document.querySelectorAll('.tracker-lane-cards.drag-target').forEach((el) => el.classList.remove('drag-target'));
  container.classList.add('drag-target');

  const afterElement = getTrackerDragAfterElement(container, event.clientY);
  if (!afterElement) {
    container.appendChild(dragging);
  } else if (afterElement !== dragging) {
    container.insertBefore(dragging, afterElement);
  }
}

async function handleTrackerDrop(event) {
  const dragging = $('tracker-body')?.querySelector('.tracker-card.dragging');
  const container = event.target.closest('.tracker-lane-cards');
  if (!dragging || !container) return;

  event.preventDefault();
  const movedId = trackerDragState.id;
  const destinationStatus = container.dataset.statusTarget || dragging.dataset.status || 'drafted';

  try {
    await persistTrackerBoardOrder(movedId, destinationStatus);
  } catch (err) {
    setTrackerScreenStatus('❌ ' + err.message, 'error');
  } finally {
    clearTrackerDragState();
  }
}

function handleTrackerDragEnd() {
  clearTrackerDragState();
}

function clearTrackerDragState() {
  trackerDragState.id = '';
  trackerDragState.status = '';
  document.querySelectorAll('.tracker-card.dragging').forEach((card) => card.classList.remove('dragging'));
  document.querySelectorAll('.tracker-lane-cards.drag-target').forEach((lane) => lane.classList.remove('drag-target'));
}

function getTrackerDragAfterElement(container, y) {
  const draggableCards = [...container.querySelectorAll('.tracker-card:not(.dragging)')];
  return draggableCards.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

async function persistTrackerBoardOrder(movedId, destinationStatus) {
  const containers = [...document.querySelectorAll('#tracker-body .tracker-lane-cards')];
  const totalCards = containers.reduce((count, container) => {
    return count + container.querySelectorAll('.tracker-card').length;
  }, 0);

  let nextSortOrder = totalCards;
  const updates = [];

  for (const container of containers) {
    const status = container.dataset.statusTarget || 'drafted';
    const cards = [...container.querySelectorAll('.tracker-card')];
    for (const card of cards) {
      const id = card.dataset.id || '';
      if (!id) continue;

      const sortOrder = nextSortOrder--;
      const currentStatus = card.dataset.status || 'drafted';
      const currentSortOrder = Number(card.dataset.sortOrder || Number.NaN);
      card.dataset.status = status;
      card.dataset.sortOrder = String(sortOrder);

      if (currentStatus !== status || currentSortOrder !== sortOrder) {
        updates.push({ id, status, sort_order: sortOrder });
      }
    }
  }

  if (!updates.length) {
    return;
  }

  setTrackerScreenStatus('⏳ Updating board order…');
  const resp = await sendMessage({
    type: 'REORDER_APPLICATIONS',
    payload: { updates },
  });

  if (!resp?.success) {
    throw new Error(resp?.error || 'Could not reorder the tracker board.');
  }

  await renderTracker();
  await loadMainScreen({ showMain: false });
  showScreen('tracker');

  const movedStatusMeta = getTrackingStatusMeta(destinationStatus);
  setTrackerScreenStatus(
    movedId
      ? `✅ Moved card to ${movedStatusMeta.label} — ${movedStatusMeta.optionHint}.`
      : '✅ Tracker board order updated.',
    'success'
  );
}

function sortTrackerApplications(applications = []) {
  return [...(applications || [])].sort((a, b) => {
    const aOrder = Number(a?.sort_order);
    const bOrder = Number(b?.sort_order);
    const hasA = Number.isFinite(aOrder);
    const hasB = Number.isFinite(bOrder);

    if (hasA || hasB) {
      return (hasB ? bOrder : Number.NEGATIVE_INFINITY) - (hasA ? aOrder : Number.NEGATIVE_INFINITY);
    }

    return String(b?.updated_at || '').localeCompare(String(a?.updated_at || ''));
  });
}

async function renderTracker() {
  const resp = await sendMessage({ type: 'GET_STATE' });
  const apps = sortTrackerApplications(resp?.applications || []);
  const filteredApps = filterTrackerApplications(apps, trackerViewState.query, { activeOnly: trackerViewState.activeOnly });
  const tbody = $('tracker-body');
  tbody.innerHTML = '';
  applyTrackerSummary(apps);

  if ($('tracker-search-input') && $('tracker-search-input').value !== trackerViewState.query) {
    $('tracker-search-input').value = trackerViewState.query;
  }
  syncTrackerFilterUi();

  if (filteredApps.length === 0) {
    $('tracker-empty').textContent = hasActiveTrackerFilters()
      ? 'No tracked applications match the current filters.'
      : 'No applications tracked yet.';
    $('tracker-empty').classList.remove('hidden');
    return;
  }
  $('tracker-empty').classList.add('hidden');

  const lanes = [
    { key: 'drafted', label: '🟡 Drafted', statuses: ['drafted'] },
    { key: 'filled', label: '📝 Filled', statuses: ['filled'] },
    { key: 'submitted', label: '✅ Submitted', statuses: ['submitted'] },
    {
      key: 'later',
      label: '📌 Later stages',
      groups: [
        { key: 'interview', label: '📅 Interview', statuses: ['interview'] },
        { key: 'offer', label: '🎉 Offer', statuses: ['offer'] },
        { key: 'rejected', label: '❌ Rejected', statuses: ['rejected'] },
      ],
    },
  ];

  tbody.innerHTML = lanes.map((lane) => renderTrackerLane(filteredApps, lane)).join('');
}

function getTrackerLaneCount(applications, lane) {
  if (Array.isArray(lane.groups)) {
    return lane.groups.reduce((sum, group) => {
      return sum + applications.filter((app) => group.statuses.includes(normalizeTrackingStatus(app.status))).length;
    }, 0);
  }

  return applications.filter((app) => lane.statuses.includes(normalizeTrackingStatus(app.status))).length;
}

function renderTrackerLane(applications, lane) {
  if (Array.isArray(lane.groups)) {
    const sections = lane.groups.map((group) => {
      let laneApps = applications.filter((app) => group.statuses.includes(normalizeTrackingStatus(app.status)));
      let showMore = false;
      if (group.key === 'rejected' && laneApps.length > 5) {
        showMore = true;
      }
      const visibleApps = (showMore && !expandedRejected) ? laneApps.slice(0, 5) : laneApps;
      const cards = visibleApps.length
        ? visibleApps.map(renderTrackerCard).join('')
        : '<p class="empty-msg tracker-lane-empty">Nothing here yet.</p>';
      let showMoreBtn = '';
      if (showMore) {
        showMoreBtn = `<button class="btn btn-link btn-xs tracker-show-more-rejected" data-status="rejected">${expandedRejected ? 'Show less' : 'Show more'}</button>`;
      }
      return `
        <div class="tracker-lane-group" data-status-target="${escAttr(group.statuses[0])}">
          <div class="tracker-lane-subheader">
            <span class="tracker-lane-subtitle">${group.label}</span>
            <span class="tracker-lane-count">${laneApps.length}</span>
          </div>
          <div class="tracker-lane-cards" data-status-target="${escAttr(group.statuses[0])}">${cards}${showMoreBtn}</div>
        </div>
      `;
    }).join('');

    const total = getTrackerLaneCount(applications, lane);

    return `
      <section class="tracker-lane tracker-lane-stacked">
        <div class="tracker-lane-header">
          <span class="tracker-lane-title">${lane.label}</span>
          <span class="tracker-lane-count">${total}</span>
        </div>
        ${sections}
      </section>
    `;
  }

  const laneApps = applications
    .filter((app) => lane.statuses.includes(normalizeTrackingStatus(app.status)));

  const cards = laneApps.length
    ? laneApps.map(renderTrackerCard).join('')
    : '<p class="empty-msg tracker-lane-empty">Nothing here yet.</p>';

  return `
    <section class="tracker-lane" data-status-target="${escAttr(lane.statuses[0])}">
      <div class="tracker-lane-header">
        <span class="tracker-lane-title">${lane.label}</span>
        <span class="tracker-lane-count">${laneApps.length}</span>
      </div>
      <div class="tracker-lane-cards" data-status-target="${escAttr(lane.statuses[0])}">${cards}</div>
    </section>
  `;
}

function toggleTrackerAddForm(forceOpen) {
  const card = $('tracker-add-card');
  if (!card) return;

  const shouldOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : card.classList.contains('hidden');

  card.classList.toggle('hidden', !shouldOpen);
  const addBtn = $('add-application-btn');
  if (addBtn) {
    addBtn.textContent = shouldOpen ? 'Close add form' : '＋ Add manually';
  }

  if (!shouldOpen) {
    resetTrackerDraftForm();
    return;
  }

  $('new-application-company')?.focus();
}

function resetTrackerDraftForm() {
  $('new-application-company').value = '';
  $('new-application-title').value = '';
  $('new-application-url').value = '';
  $('new-application-status').value = 'drafted';
  $('new-application-location').value = '';
  $('new-application-employment-type').value = 'Full-time';
  $('new-application-remote').checked = false;
  $('new-application-salary-range').value = '';
  $('new-application-description').value = '';
  setTrackerAddStatus('Paste a JD or import the current page, then save.');
}

function setTrackerAddStatus(msg, type = '') {
  const el = $('tracker-add-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
}

function setTrackerScreenStatus(msg, type = '') {
  const el = $('tracker-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
}

function syncTrackerFilterUi() {
  const toggle = $('tracker-scope-toggle');
  if (!toggle) return;

  toggle.textContent = trackerViewState.activeOnly ? 'Active' : 'All';
  toggle.classList.toggle('is-active', trackerViewState.activeOnly);
  toggle.setAttribute('aria-pressed', String(trackerViewState.activeOnly));
  toggle.title = trackerViewState.activeOnly
    ? 'Showing only active pipeline items.'
    : 'Showing every tracked application.';
}

function fillTrackerDraftForm(draft = {}) {
  $('new-application-company').value = draft.company || '';
  $('new-application-title').value = draft.title || '';
  $('new-application-url').value = draft.url || '';
  $('new-application-status').value = draft.status || 'drafted';
  $('new-application-location').value = draft.location || '';
  $('new-application-employment-type').value = draft.employment_type || 'Full-time';
  $('new-application-remote').checked = !!draft.remote;
  $('new-application-salary-range').value = draft.salary_range || '';
  $('new-application-description').value = draft.description || draft.jd || '';
}

function readTrackerDraftForm() {
  return {
    company: $('new-application-company').value.trim(),
    title: $('new-application-title').value.trim(),
    url: $('new-application-url').value.trim(),
    status: $('new-application-status').value || 'drafted',
    location: $('new-application-location').value.trim(),
    employment_type: $('new-application-employment-type').value || 'Full-time',
    remote: $('new-application-remote').checked,
    salary_range: $('new-application-salary-range').value.trim(),
    description: $('new-application-description').value.trim(),
  };
}

async function importCurrentPageIntoTrackerForm() {
  toggleTrackerAddForm(true);
  setTrackerAddStatus('⏳ Importing the current page…');

  try {
    const resp = await sendToActiveTab({ type: 'GET_JOB_INFO' });
    if (!resp?.success || !resp.job) {
      throw new Error(resp?.error || 'Could not read job details from the current page.');
    }

    fillTrackerDraftForm({
      ...resp.job,
      description: resp.job.jd || '',
    });
    setTrackerAddStatus('✅ Current page details imported.', 'success');
  } catch (err) {
    setTrackerAddStatus('❌ ' + err.message, 'error');
  }
}

async function saveNewApplicationFromForm() {
  const saveBtn = $('save-new-application-btn');
  const draft = readTrackerDraftForm();

  if (!draft.company && !draft.title) {
    setTrackerAddStatus('⚠️ Add at least a company or role title first.', 'error');
    return;
  }

  if (saveBtn) saveBtn.disabled = true;
  setTrackerAddStatus('⏳ Saving to tracker…');

  try {
    let derived = {};
    if (draft.description) {
      const resp = await sendMessage({
        type: 'PARSE_APPLICATION_DRAFT',
        payload: { text: draft.description, draft },
      });
      derived = resp?.details || {};
    }

    const payload = {
      ...derived,
      ...draft,
      location: draft.location || derived.location || 'Unknown',
      employment_type: draft.employment_type || derived.employment_type || 'Full-time',
      remote: draft.remote || derived.remote || false,
      salary_range: draft.salary_range || derived.salary_range || '',
      jd_snippet: draft.description.slice(0, 300),
      answers_generated: false,
      fill_report: null,
    };

    const resp = await sendMessage({ type: 'LOG_APPLICATION', payload });
    if (!resp?.success) {
      throw new Error(resp?.error || 'Could not add that tracker entry.');
    }

    resetTrackerDraftForm();
    toggleTrackerAddForm(false);
    await renderTracker();
    await loadMainScreen({ showMain: false });
    showScreen('tracker');
    setStatus('fill-status', '✅ Application added to the tracker.', 'success');
  } catch (err) {
    setTrackerAddStatus('❌ ' + err.message, 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function renderTrackerCard(app) {
  const expanded = expandedTrackerIds.has(app.id);
  const normalizedStatus = normalizeTrackingStatus(app.status);
  const summaryMeta = [
    app.location || 'Unknown',
    app.employment_type || 'Full-time',
    app.remote ? 'Remote' : 'On-site',
  ].filter(Boolean).join(' • ');
  const summaryNote = app.verdict || app.scorecard || (app.description ? 'Description cached' : 'Click to edit');
  const companyLabel = app.url
    ? `<a class="tracker-summary-title-link" href="${escAttr(app.url)}" target="_blank" rel="noopener">${esc(app.company || 'Unknown company')}</a>`
    : esc(app.company || 'Unknown company');

  return `
    <div class="tracker-card${expanded ? ' expanded' : ''}" draggable="true" data-id="${escAttr(app.id)}" data-status="${escAttr(normalizedStatus)}" data-sort-order="${escAttr(String(app.sort_order ?? ''))}">
      <div class="tracker-card-header">
        <div class="tracker-card-summary tracker-card-toggle" role="button" tabindex="0" aria-expanded="${expanded ? 'true' : 'false'}">
          <div class="tracker-summary-copy">
            <div class="tracker-summary-title">${companyLabel}</div>
            <div class="tracker-summary-role">${esc(app.title || 'Untitled role')}</div>
            <div class="tracker-summary-meta">${esc(summaryMeta)}</div>
            <div class="tracker-summary-salary${app.salary_range ? '' : ' hidden'}">${esc(app.salary_range || 'Pay range not saved yet')}</div>
          </div>
        </div>
        <div class="tracker-card-tools tracker-card-tools-right">
          <select class="tracker-status-select" data-field="status" data-status-tone="${escAttr(normalizedStatus)}" aria-label="Update application status">
            ${renderStatusOptions(app.status)}
          </select>
          <div class="tracker-card-note-right">${esc(summaryNote)}</div>
          <span class='tracker-card-date-label'>Date:</span>
          ${expanded
            ? `<input class='tracker-card-date-input' data-field='date' type='date' value='${escAttr(app.date ? formatDateInput(app.date) : '')}' aria-label='Edit application date' />`
            : `<span class='tracker-card-date'>${esc(formatDate(app.date))}</span>`}
        </div>
      </div>
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
          <textarea data-field="description" rows="4" placeholder="Stored job description / notes">${esc(app.description || app.jd_snippet || '')}</textarea>
        </div>
        <div class="tracker-card-actions">
          <span class="tracker-save-state">Auto-save on blur</span>
          <div class="tracker-card-action-buttons">
            <button class="btn btn-ghost btn-sm tracker-delete-btn" data-id="${escAttr(app.id)}">Delete</button>
            <button class="btn btn-secondary btn-sm tracker-save-btn" data-id="${escAttr(app.id)}">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function deleteTrackerCard(card) {
  const id = card?.dataset?.id;
  if (!id) return;

  const company = card.querySelector('.tracker-summary-title')?.textContent?.trim() || 'this application';
  const confirmed = confirm(`Delete ${company} from the tracker? This only removes the local tracker card.`);
  if (!confirmed) return;

  const resp = await sendMessage({
    type: 'DELETE_APPLICATION',
    payload: { id },
  });

  if (!resp?.success) {
    throw new Error(resp?.error || 'Could not delete that tracker entry.');
  }

  expandedTrackerIds.delete(id);
  setTrackerScreenStatus('✅ Tracker entry deleted.', 'success');
  await renderTracker();
  await loadMainScreen({ showMain: false });
  showScreen('tracker');
}

function hasActiveTrackerFilters() {
  return !!String(trackerViewState.query || '').trim() || trackerViewState.activeOnly;
}

function filterTrackerApplications(applications = [], query = '', { activeOnly = false } = {}) {
  const tokens = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return (applications || []).filter((app) => {
    const status = normalizeTrackingStatus(app.status);
    if (activeOnly && !['drafted', 'filled'].includes(status)) {
      return false;
    }

    if (!tokens.length) return true;

    const haystack = [
      app.company,
      app.title,
      app.location,
      app.employment_type,
      app.salary_range,
      app.scorecard,
      app.verdict,
      app.description,
      app.jd_snippet,
    ].join(' ').toLowerCase();

    return tokens.every((token) => haystack.includes(token));
  });
}

function exportCsv(applications) {
  const header = 'Company,Role Title,Status,Date,Employment Type,Remote,Location,Salary Range,Scorecard,Verdict,URL,Notes';
  const rows = applications.map((a) =>
    [
      a.company,
      a.title,
      a.status,
      a.date,
      a.employment_type,
      a.remote ? 'Yes' : 'No',
      a.location,
      a.salary_range,
      a.scorecard,
      a.verdict,
      a.url,
      a.description || a.jd_snippet || '',
    ]
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

async function importTrackerCsvFile(event) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;

  setTrackerScreenStatus('⏳ Importing applications from CSV…');

  try {
    const text = await file.text();
    const resp = await sendMessage({
      type: 'IMPORT_APPLICATIONS_CSV',
      payload: { text },
    });

    if (!resp?.success) {
      throw new Error(resp?.error || 'Could not import the tracker CSV.');
    }

    await renderTracker();
    await loadMainScreen({ showMain: false });
    showScreen('tracker');

    const imported = Number(resp.imported || 0);
    const skipped = Number(resp.skipped || 0);
    const suffix = skipped ? ` (${skipped} skipped)` : '';
    setTrackerScreenStatus(
      `✅ Imported ${imported} application${imported === 1 ? '' : 's'} from CSV${suffix}.`,
      'success'
    );
  } catch (err) {
    setTrackerScreenStatus('❌ ' + err.message, 'error');
  } finally {
    if (input) input.value = '';
  }
}

async function renderLearnedDefaults() {
  const regularContainer = $('learned-defaults-list');
  const sensitiveContainer = $('sensitive-memory-list');
  const ignoredContainer = $('ignored-memory-list');
  const badge = $('memory-count-badge');
  const sensitiveBadge = $('sensitive-memory-count');
  const ignoredBadge = $('ignored-memory-count');
  if (!regularContainer) return;

  try {
    const resp = await sendMessage({ type: 'GET_LEARNED_DEFAULTS' });
    const items = Array.isArray(resp?.items) ? resp.items : [];
    const ignoredItems = Array.isArray(resp?.ignoredItems) ? resp.ignoredItems : [];
    const regularItems = items.filter((item) => !isSensitiveMemoryQuestion(item.question));
    const sensitiveItems = items.filter((item) => isSensitiveMemoryQuestion(item.question));

    if (badge) {
      badge.textContent = `${regularItems.length} saved`;
      badge.className = 'badge badge-memory';
    }
    if (sensitiveBadge) {
      sensitiveBadge.textContent = `${sensitiveItems.length} guarded`;
      sensitiveBadge.className = 'badge badge-memory';
    }
    if (ignoredBadge) {
      ignoredBadge.textContent = `${ignoredItems.length} ignored`;
      ignoredBadge.className = 'badge badge-memory';
    }

    renderMemoryGroup(regularContainer, regularItems, 'No memory saved yet.');
    if (sensitiveContainer) {
      renderMemoryGroup(sensitiveContainer, sensitiveItems, 'No sensitive memory saved.');
    }
    if (ignoredContainer) {
      renderIgnoredMemoryGroup(ignoredContainer, ignoredItems, 'No ignored memory right now.');
    }
  } catch (err) {
    regularContainer.innerHTML = `<p class="empty-msg">Could not load memory. ${esc(err.message)}</p>`;
    if (sensitiveContainer) {
      sensitiveContainer.innerHTML = '<p class="empty-msg">No sensitive memory saved.</p>';
    }
    if (ignoredContainer) {
      ignoredContainer.innerHTML = '<p class="empty-msg">No ignored memory right now.</p>';
    }
  }
}

function renderMemoryGroup(container, items, emptyMessage) {
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<p class="empty-msg">${esc(emptyMessage)}</p>`;
    return;
  }

  container.innerHTML = items.map((item) => {
    const expanded = expandedMemoryQuestions.has(item.question);
    const answerPreview = truncateText(item.answer || 'No saved answer yet.', 92);
    return `
      <div class="memory-item${expanded ? ' expanded' : ''}" data-question="${escAttr(item.question)}">
        <button type="button" class="memory-card-summary memory-toggle-btn" aria-expanded="${expanded ? 'true' : 'false'}" title="${escAttr(item.question)}">
          <div class="memory-card-copy">
            <div class="memory-item-label">Prompt</div>
            <div class="memory-item-question">${esc(truncateText(item.question, 78))}</div>
            <div class="memory-item-preview">${esc(answerPreview)}</div>
          </div>
          <span class="memory-expand-indicator">▾</span>
        </button>
        <div class="memory-card-details">
          <textarea data-field="answer" rows="3">${esc(item.answer || '')}</textarea>
          <div class="memory-item-actions">
            <button class="btn btn-secondary btn-sm memory-save-btn">Save</button>
            <button class="btn btn-ghost btn-sm memory-ignore-btn">Ignore</button>
            <button class="btn btn-ghost btn-sm memory-delete-btn">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderIgnoredMemoryGroup(container, items, emptyMessage) {
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<p class="empty-msg">${esc(emptyMessage)}</p>`;
    return;
  }

  container.innerHTML = items.map((item) => {
    const expanded = expandedMemoryQuestions.has(item.question);
    const answerPreview = truncateText(item.answer || 'Stored answer archived here.', 92);
    return `
      <div class="memory-item ignored-memory-item${expanded ? ' expanded' : ''}" data-question="${escAttr(item.question)}">
        <button type="button" class="memory-card-summary memory-toggle-btn" aria-expanded="${expanded ? 'true' : 'false'}" title="${escAttr(item.question)}">
          <div class="memory-card-copy">
            <div class="memory-item-label">Ignored</div>
            <div class="memory-item-question">${esc(truncateText(item.question, 78))}</div>
            <div class="memory-item-preview">${esc(answerPreview)}</div>
          </div>
          <span class="memory-expand-indicator">▾</span>
        </button>
        <div class="memory-card-details">
          <div class="memory-archived-answer">${esc(item.answer || 'No archived answer available.')}</div>
          <div class="memory-item-actions">
            <button class="btn btn-secondary btn-sm memory-unignore-btn">Delete ignore</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function initAiHandlers() {
  $('ai-back-btn')?.addEventListener('click', () => loadMainScreen());

  $('header-ai-btn')?.addEventListener('click', async () => {
    if (!isStandaloneView()) {
      const opened = await openExpandedWorkspace('ai', 'ai-settings-section');
      if (opened) return;
    }

    const state = await sendMessage({ type: 'GET_STATE' });
    applyStateToSetupForm(state || {});
    showScreen('ai');
  });

  $('save-ai-settings-btn')?.addEventListener('click', handleSaveAiSettings);
}

async function initHelpHandlers() {
  $('help-back-btn')?.addEventListener('click', () => loadMainScreen());

  $('header-help-btn')?.addEventListener('click', async () => {
    if (!isStandaloneView()) {
      const opened = await openExpandedWorkspace('help', 'help-legal-section');
      if (opened) return;
    }

    showScreen('help');
  });

  $('setup-screen')?.addEventListener('click', async (event) => {
    const toggleBtn = event.target.closest('.memory-toggle-btn');
    const saveBtn = event.target.closest('.memory-save-btn');
    const ignoreBtn = event.target.closest('.memory-ignore-btn');
    const unignoreBtn = event.target.closest('.memory-unignore-btn');
    const deleteBtn = event.target.closest('.memory-delete-btn');
    const item = event.target.closest('.memory-item');
    if (!item) return;

    const question = item.dataset.question || '';

    if (toggleBtn) {
      const expanded = item.classList.toggle('expanded');
      toggleBtn.setAttribute('aria-expanded', String(expanded));
      if (expanded) expandedMemoryQuestions.add(question);
      else expandedMemoryQuestions.delete(question);
      return;
    }

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

      if (ignoreBtn) {
        expandedMemoryQuestions.delete(question);
        const resp = await sendMessage({
          type: 'IGNORE_LEARNED_DEFAULT',
          payload: { question },
        });
        if (!resp?.success) throw new Error(resp?.error || 'Could not ignore that memory entry.');
        setStatus('setup-status', '✅ Memory entry moved to the ignore list.', 'success');
        await renderLearnedDefaults();
      }

      if (unignoreBtn) {
        expandedMemoryQuestions.delete(question);
        const resp = await sendMessage({
          type: 'DELETE_IGNORED_LEARNED_DEFAULT',
          payload: { question },
        });
        if (!resp?.success) throw new Error(resp?.error || 'Could not remove that ignored memory entry.');
        setStatus('setup-status', '✅ Memory entry removed from the ignore list and re-enabled.', 'success');
        await renderLearnedDefaults();
      }

      if (deleteBtn) {
        expandedMemoryQuestions.delete(question);
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
    const state = await sendMessage({ type: 'GET_STATE' });
    if (!state?.privacyConsent) {
      if (!isStandaloneView()) {
        const opened = await openExpandedWorkspace('setup', 'profile-privacy-section');
        if (opened) return;
      }

      showScreen('setup');
      await renderLearnedDefaults();
      scrollToSection('profile-privacy-section');
      setStatus('setup-status', 'Review and accept the privacy note once to unlock your profile.', 'error');
      return;
    }

    showScreen('help');
    scrollToSection('help-privacy-section');
    setStatus('help-status', 'Privacy details remain available here anytime.', 'success');
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
  bindReviewJumpHandlers('preview-report-unresolved', 'fill-status');

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

  const unresolved = Array.isArray(report.unresolved) ? report.unresolved : [];
  summaryEl.textContent = unresolved.length ? `${summary} • click any item to jump` : (summary || emptyMessage);

  if (!unresolved.length) {
    listEl.innerHTML = `<li>${esc(emptyMessage)}</li>`;
    return;
  }

  listEl.innerHTML = unresolved.slice(0, 8).map((item) => {
    const payload = encodeURIComponent(JSON.stringify(typeof item === 'string' ? { label: item } : item));
    const fullLabel = getReviewItemLabel(item);
    const shortLabel = truncateText(fullLabel, 96);
    return `
      <li>
        <button type="button" class="review-jump-btn" data-payload="${escAttr(payload)}" title="${escAttr(fullLabel)}">
          ${esc(shortLabel)}
        </button>
      </li>
    `;
  }).join('');
}

function applyStateToSetupForm(state = {}) {
  $('api-key-input').value = state.apiKey || '';

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

  syncConsentGate();
  renderResumeAttachment(state.resumeAttachment || null);
  fillProfileForm(state.profile || {});
}

function renderResumeAttachment(attachment = null) {
  const card = $('resume-attachment-card');
  if (!card) return;

  const fileInput = $('resume-file');
  if (!attachment) {
    card.classList.add('hidden');
    if (!fileInput?.files?.[0]) {
      setResumeDropLabel('');
    }
    return;
  }

  card.classList.remove('hidden');
  $('resume-attachment-name').textContent = attachment.name || 'resume-preview.txt';
  $('resume-attachment-meta').textContent = [
    getResumeAttachmentSourceLabel(attachment.source),
    attachment.updatedAt ? `saved ${formatSavedTimestamp(attachment.updatedAt)}` : 'saved locally',
  ].filter(Boolean).join(' • ');
  $('resume-attachment-preview').textContent = attachment.preview || 'A local preview copy is saved for this browser profile.';

  const downloadBtn = $('download-resume-attachment-btn');
  if (downloadBtn) {
    downloadBtn.textContent = attachment.downloadLabel || 'Download copy';
    downloadBtn.disabled = attachment.hasDownload === false;
  }

  if (!fileInput?.files?.[0]) {
    setResumeDropLabel(attachment.name || '');
  }
}

function downloadResumeAttachment(attachment = {}) {
  const fileName = getResumeAttachmentDownloadName(attachment);
  let href = '';

  if (attachment.downloadMode === 'data-url' && attachment.data) {
    href = attachment.data;
  } else {
    const text = String(attachment.text || attachment.preview || '').trim();
    if (!text) {
      throw new Error('No saved resume preview is available to download yet.');
    }
    const blob = new Blob([text], { type: attachment.mimeType || 'text/plain;charset=utf-8' });
    href = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getResumeAttachmentSourceLabel(source = '') {
  switch (source) {
    case 'paste':
      return 'Pasted text';
    case 'upload':
      return 'Uploaded file';
    default:
      return 'Saved preview';
  }
}

function getResumeAttachmentDownloadName(attachment = {}) {
  const rawName = String(attachment.name || '').trim() || 'resume-preview.txt';
  if (attachment.downloadMode === 'data-url') {
    return rawName;
  }

  if (/\.txt$/i.test(rawName)) {
    return rawName;
  }

  return rawName.replace(/(\.[a-z0-9]+)?$/i, '-preview.txt');
}

function formatSavedTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'recently';
  }
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

function initStatusNavHandlers() {
  $('main-screen')?.addEventListener('click', async (event) => {
    const row = event.target.closest('.status-nav');
    if (!row) return;
    await openStatusTarget(row.dataset.navTarget || '');
  });
}

function isStandaloneView() {
  return popupQuery.get('standalone') === '1';
}

function canOpenExpandedWorkspace() {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id && window.location.protocol !== 'file:';
}

function buildExpandedWorkspaceUrl(screen, sectionId = '') {
  const url = new URL(chrome.runtime.getURL('popup/popup.html'));
  url.searchParams.set('screen', screen);
  url.searchParams.set('standalone', '1');
  if (sectionId) {
    url.searchParams.set('section', sectionId);
  }
  return url.toString();
}

async function openExpandedWorkspace(screen, sectionId = '') {
  if (!canOpenExpandedWorkspace()) {
    return false;
  }

  try {
    const url = buildExpandedWorkspaceUrl(screen, sectionId);
    const baseUrl = chrome.runtime.getURL('popup/popup.html');
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((tab) => {
      if (!tab?.id || !tab.url || !tab.url.startsWith(baseUrl)) return false;
      try {
        const tabUrl = new URL(tab.url);
        return tabUrl.searchParams.get('screen') === screen;
      } catch {
        return false;
      }
    });

    if (existing?.id) {
      await chrome.tabs.update(existing.id, { active: true, url });
      if (typeof existing.windowId === 'number') {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
    } else {
      await chrome.tabs.create({
        url,
        active: true,
      });
    }

    window.close();
    return true;
  } catch {
    return false;
  }
}

async function applyInitialRequestedScreen() {
  const screen = popupQuery.get('screen');
  const sectionId = popupQuery.get('section');
  if (!screen) return;

  if (screen === 'tracker') {
    await renderTracker();
    showScreen('tracker');
    if (sectionId) scrollToSection(sectionId);
    return;
  }

  if (screen === 'setup') {
    showScreen('setup');
    const state = await sendMessage({ type: 'GET_STATE' });
    applyStateToSetupForm(state || {});
    await renderLearnedDefaults();
    if (sectionId) scrollToSection(sectionId);
    return;
  }

  if (screen === 'ai') {
    const state = await sendMessage({ type: 'GET_STATE' });
    applyStateToSetupForm(state || {});
    showScreen('ai');
    if (sectionId) scrollToSection(sectionId);
    return;
  }

  if (screen === 'help') {
    showScreen('help');
    if (sectionId) scrollToSection(sectionId);
  }
}

async function openStatusTarget(target) {
  if (!target) return;

  if (target === 'privacy' || target === 'ats') {
    const helpSection = target === 'ats' ? 'help-ats-section' : 'help-privacy-section';
    if (!isStandaloneView()) {
      const opened = await openExpandedWorkspace('help', helpSection);
      if (opened) return;
    }

    showScreen('help');
    scrollToSection(helpSection);
    return;
  }

  if (target === 'api') {
    if (!isStandaloneView()) {
      const opened = await openExpandedWorkspace('ai', 'ai-settings-section');
      if (opened) return;
    }

    showScreen('ai');
    const state = await sendMessage({ type: 'GET_STATE' });
    applyStateToSetupForm(state || {});
    scrollToSection('ai-settings-section');
    return;
  }

  const sectionMap = {
    resume: 'profile-resume-section',
    profile: 'core-profile-section',
    memory: 'profile-memory-section',
  };

  const sectionId = sectionMap[target];
  if (!isStandaloneView()) {
    const opened = await openExpandedWorkspace('setup', sectionId);
    if (opened) return;
  }

  showScreen('setup');
  const state = await sendMessage({ type: 'GET_STATE' });
  applyStateToSetupForm(state || {});
  await renderLearnedDefaults();
  scrollToSection(sectionId);
}

function scrollToSection(sectionId) {
  if (!sectionId) return;
  requestAnimationFrame(() => {
    $(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function bindReviewJumpHandlers(listId, statusId = 'fill-status') {
  const list = $(listId);
  if (!list || list.dataset.jumpBound === 'true') return;
  list.dataset.jumpBound = 'true';

  list.addEventListener('click', async (event) => {
    const btn = event.target.closest('.review-jump-btn');
    if (!btn) return;

    let payload = { label: btn.textContent.trim() };
    try {
      payload = JSON.parse(decodeURIComponent(btn.dataset.payload || ''));
    } catch {
      // fallback to label only
    }

    try {
      const resp = await sendToActiveTab({ type: 'FOCUS_FIELD', payload });
      if (!resp?.success) throw new Error(resp?.error || 'Could not find that field on the page.');
      setStatus(statusId, `✅ Jumped to “${resp.label || getReviewItemLabel(payload)}” on the page.`, 'success');
      window.close();
    } catch (err) {
      setStatus(statusId, '❌ ' + err.message, 'error');
    }
  });
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

function setBadgeState(elId, text, tone = 'info', title = '') {
  const el = $(elId);
  if (!el) return;
  el.textContent = text;
  el.className = 'badge ' + badgeToneClass(tone);
  if (title) {
    el.title = title;
    el.setAttribute('aria-label', title);
  }
}

function setStatusRowMeta(rowId, title) {
  const el = $(rowId);
  if (!el || !title) return;
  el.title = title;
  el.setAttribute('aria-label', title);
}

function badgeToneClass(tone) {
  switch (tone) {
    case 'ok': return 'badge-ok';
    case 'warn': return 'badge-warn';
    case 'bad': return 'badge-bad';
    case 'memory': return 'badge-memory';
    default: return 'badge-info';
  }
}

function getReviewItemLabel(item) {
  if (typeof item === 'string') return item;

  const label = item?.label || item?.question || item?.field || 'Field to review';
  const reason = String(item?.reason || '').trim();
  if (!reason) return label;

  return `${label} — ${reason}`;
}

function normalizeLookupText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSensitiveMemoryQuestion(question = '') {
  const text = normalizeLookupText(question);
  return /gender|pronoun|sex|sexual orientation|orientation|race|ethnic|ethnicity|hispanic|latino|asian|white|black|african american|native american|pacific islander|non binary|nonbinary|trans|veteran|military|active duty|reserve force|disability|disabled|religion|faith|marital|spouse/.test(text);
}

function truncateText(text, maxLength = 96) {
  const value = String(text || '').trim();
  if (value.length <= maxLength) return value;
  return value.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}

function getAtsMeta(ats) {
  switch (ats) {
    case 'Greenhouse':
    case 'Ashby':
    case 'Lever':
      return {
        label: ats,
        tone: 'ok',
        tip: `${ats} is supported for profile-first autofill. Click for the in-app ATS explainer.`,
        hint: '',
      };
    case 'LinkedIn Easy Apply':
      return {
        label: ats,
        tone: 'warn',
        tip: `${ats} works, but every step should still be reviewed carefully. Click for the in-app ATS explainer.`,
        hint: '',
      };
    case 'Workday':
    case 'iCIMS':
      return {
        label: ats,
        tone: 'warn',
        tip: `${ats} is partially supported. Expect some manual review. Click for the in-app ATS explainer.`,
        hint: 'Partial support — keep review on.',
      };
    case 'Generic':
      return {
        label: 'Generic',
        tone: 'bad',
        tip: 'This page does not look like a strongly supported ATS yet. Click for the in-app ATS explainer.',
        hint: 'Limited support on this page.',
      };
    default:
      return {
        label: 'No job page',
        tone: 'info',
        tip: 'Open a job application page to detect its ATS. Click for the in-app ATS explainer.',
        hint: '',
      };
  }
}

function getTrackingStatusMeta(status) {
  const normalized = normalizeTrackingStatus(status);
  return {
    key: normalized,
    ...(TRACKER_STATUS_META[normalized] || TRACKER_STATUS_META.drafted),
  };
}

function renderStatusOptions(selectedStatus) {
  const current = normalizeTrackingStatus(selectedStatus);

  return TRACKER_STATUS_ORDER.map((value) => {
    const meta = getTrackingStatusMeta(value);
    return `<option value="${value}"${current === value ? ' selected' : ''}>${meta.label}</option>`;
  }).join('');
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

// Standalone demo mode: inject mock data if ?demo=1
const isDemoMode = window.location.search.includes('demo=1');
if (isDemoMode) {
  window.DEMO_PROFILE = {
    name: 'Demo User',
    email: 'demo@example.com',
    resume: 'Demo resume text...'
  };
  window.DEMO_APPLICATIONS = [
    { id: '1', company: 'Acme Corp', title: 'Frontend Engineer', status: 'drafted', location: 'Remote', date: '2026-04-01' },
    { id: '2', company: 'Globex', title: 'Backend Developer', status: 'submitted', location: 'NYC', date: '2026-03-28' },
    { id: '3', company: 'Initech', title: 'DevOps', status: 'interview', location: 'Remote', date: '2026-03-15' }
  ];
  // Patch tracker/profile loading functions to use demo data
  window.getProfile = async () => window.DEMO_PROFILE;
  window.getApplications = async () => window.DEMO_APPLICATIONS;
}

