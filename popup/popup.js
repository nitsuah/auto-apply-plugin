// POPUP.JS - main logic for the popup UI, orchestrating between modules and handling shared state
// Import DOM helpers and escaping functions from utils.js

import { renderJobSearchResults, initJobSearchHandlers } from './job-search.js';
import { normalizeApplicationStatus } from '../lib/tracker.js';
// import { renderLearnedDefaults, renderMemoryGroup, renderIgnoredMemoryGroup } from './memory.js';
import { handleSaveAiSettings, initAiHandlers } from './ai.js';
import { initHelpHandlers } from './help.js';
import { readSettingsForm, handleSaveSetup } from './profile.js';

import { /* utility exports */ } from '../lib/utils.js';
import { showScreen } from './navigation.js';
import { renderTracker, initTrackerHandlers, renderTrackerLane, renderTrackerCard, filterTrackerApplications, sortTrackerApplications, persistTrackerBoardOrder, getTrackerLaneCount, trackerSaveTimers, expandedTrackerIds, trackerViewState, trackerDragState, TRACKER_STATUS_META, TRACKER_STATUS_ORDER } from './tracker.js';

// Consolidate all imports at the top
import { $, esc, escAttr, truncateText, setBadgeState, setStatusRowMeta, badgeToneClass, getAtsMeta, getAtsHint } from '../lib/utils.js';

// add renderFillReport stub so ReferenceError go away
// TODO: Import real renderFillReport from preview.js or implement
function renderFillReport() {}
// add renderLearnedDefaults stub so ReferenceError go away
// TODO: Import real renderLearnedDefaults from memory.js or implement
async function renderLearnedDefaults() {}

// add renderResumeAttachment stub so ReferenceError go away
// TODO: Import real renderResumeAttachment from profile.js or implement
function renderResumeAttachment() {}
// ...existing imports...

// implement real sendMessage for Chrome extension
async function sendMessage(msg) {
  if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
  // Fallback for test: return empty
  return {};
}

// Orchestrate popup logic: wire up modules and initialize UI
document.addEventListener('DOMContentLoaded', () => {
  // Job search panel
  initJobSearchHandlers(showScreen);
  // Tracker panel
  initTrackerHandlers();
  // AI panel
  initAiHandlers();
  // Help panel
  initHelpHandlers();
  // Profile/setup panel
  // (profile logic is now in profile.js)
  // Memory panel
  // (memory logic is now in memory.js)
  // Additional orchestration as needed

});

// ── DOM helpers ───────────────────────────────────────────────────────────────
const expandedMemoryQuestions = new Set();
const popupQuery = new URLSearchParams(window.location.search);
const DEFAULT_RESUME_DROP_LABEL = '📄 Drop PDF / DOCX / TXT here or click to browse';


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
  const retired = apps.filter((a) => normalizeApplicationStatus(a.status) === 'retired').length;
  const pending = apps.filter((a) => ['drafted', 'retired'].includes(normalizeApplicationStatus(a.status))).length;

  if ($('stat-total')) $('stat-total').textContent = total;
  if ($('stat-applied')) $('stat-applied').textContent = retired;
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
    try {
      if (!isStandaloneView()) {
        const opened = await openExpandedWorkspace('tracker');
        if (opened) return;
      }
      await renderTracker();
    } catch (err) {
      setTrackerScreenStatus('❌ Failed to load pipeline: ' + (err?.message || err), 'error');
    } finally {
      showScreen('tracker');
    }
  });

  // Wire up AI and Help header buttons
  $('header-ai-btn')?.addEventListener('click', async () => {
    if (!isStandaloneView()) {
      const opened = await openExpandedWorkspace('ai', 'ai-settings-section');
      if (opened) return;
    }
    showScreen('ai');
    const state = await sendMessage({ type: 'GET_STATE' });
    applyStateToSetupForm(state || {});
    scrollToSection('ai-settings-section');
  });

  $('header-help-btn')?.addEventListener('click', async () => {
    if (!isStandaloneView()) {
      const opened = await openExpandedWorkspace('help');
      if (opened) return;
    }
    showScreen('help');
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
          `${report.retired || 0} retired`,
          report.preserved ? `${report.preserved} kept` : '',
          Array.isArray(report.unresolved) && report.unresolved.length
            ? `${report.unresolved.length} to review`
            : '',
        ].filter(Boolean).join(' • ');

        const message = resp?.warning
          ? `✅ Common fields retired (${summary || 'profile-first mode'}). ${resp.warning}`
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






function formatTrackingStatus(status) {
  switch (normalizeApplicationStatus(status)) {
    case 'submitted':
      return '✅ Submitted';
    case 'retired':
      return '🪦 Retired';
    case 'drafted':
      return '📝 Drafted';
    case 'interview':
      return '💬 Interview';
    default:
      return status;
  }
}
