/**
 * apply-bot — service-worker.js
 * Handles storage, Gemini API calls, and message routing.
 */

import { parseResumeWithGemini, generateAnswers } from '../lib/gemini.js';
import {
  findLearnedAnswer,
  getLearnedMemoryKey,
  isIgnoredLearnedPrompt,
  shouldPersistLearnedValue,
} from '../lib/form-filler.js';
import { structureResume } from '../lib/resume-parser.js';
import {
  addApplication,
  deleteApplication,
  deriveTrackerDetailsFromText,
  importApplicationsFromCsv,
  isTerminalApplicationStatus,
  updateApplication,
  updateApplicationStatus,
} from '../lib/tracker.js';

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((err) => {
    sendResponse({ success: false, error: err.message });
  });
  return true; // keep channel open for async response
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'SAVE_SETUP':
      return handleSaveSetup(msg.payload);
    case 'GET_STATE':
      return getState();
    case 'GET_RESUME_ATTACHMENT':
      return handleGetResumeAttachment();
    case 'REMOVE_RESUME_ATTACHMENT':
      return handleRemoveResumeAttachment();
    case 'GENERATE_ANSWERS':
      return handleGenerateAnswers(msg.payload);
    case 'GET_LAST_ANSWERS':
      return getLastAnswers();
    case 'LOG_APPLICATION':
      return handleLogApplication(msg.payload);
    case 'PARSE_APPLICATION_DRAFT':
      return handleParseApplicationDraft(msg.payload);
    case 'IMPORT_APPLICATIONS_CSV':
      return handleImportApplicationsCsv(msg.payload);
    case 'UPDATE_APPLICATION':
      return handleUpdateApplication(msg.payload);
    case 'REORDER_APPLICATIONS':
      return handleReorderApplications(msg.payload);
    case 'DELETE_APPLICATION':
      return handleDeleteApplication(msg.payload);
    case 'MARK_LAST_SUBMITTED':
      return handleMarkLastSubmitted();
    case 'SAVE_LEARNED_DEFAULTS':
      return handleSaveLearnedDefaults(msg.payload);
    case 'GET_LEARNED_DEFAULTS':
      return handleGetLearnedDefaults();
    case 'UPDATE_LEARNED_DEFAULT':
      return handleUpdateLearnedDefault(msg.payload);
    case 'IGNORE_LEARNED_DEFAULT':
      return handleIgnoreLearnedDefault(msg.payload);
    case 'DELETE_LEARNED_DEFAULT':
      return handleDeleteLearnedDefault(msg.payload);
    case 'DELETE_IGNORED_LEARNED_DEFAULT':
      return handleDeleteIgnoredLearnedDefault(msg.payload);
    case 'CLEAR_TEMP_DATA':
      return handleClearTempData();
    case 'RESET_ALL_DATA':
      return handleResetAllData();
    case 'ATS_DETECTED':
      return { success: true }; // acknowledged — no action needed
    default:
      throw new Error('Unknown message type: ' + msg.type);
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// Maximum plain-text excerpt length stored alongside the structured resume.
// A lightweight preview/downloadable copy can also be kept locally for the
// Profile workspace without disturbing the main popup flow.
const MAX_RESUME_EXCERPT_LENGTH = 1000;
const MAX_RESUME_ATTACHMENT_PREVIEW_LENGTH = 1200;
const MAX_RESUME_ATTACHMENT_DATA_LENGTH = 1_500_000;
const MAX_RESUME_ATTACHMENT_TEXT_LENGTH = 200_000;

async function handleSaveSetup({ resumeRaw, settings, profile, resumeMeta }) {
  const data = await chrome.storage.local.get(['resume']);
  const existingResume = data.resume?.structured || null;
  const existingAttachment = sanitizeResumeAttachment(data.resume?.attachment || null);
  const hasNewResume = typeof resumeRaw === 'string' && resumeRaw.trim() !== '';
  const nextSettings = {
    ...(settings || {}),
    privacy_consent: settings?.privacy_consent === true,
    privacy_consent_at: settings?.privacy_consent
      ? (settings?.privacy_consent_at || new Date().toISOString())
      : null,
  };

  if (!nextSettings.privacy_consent) {
    throw new Error('Please review and accept the privacy note before saving your setup.');
  }

  // Save settings first
  await chrome.storage.local.set({ settings: nextSettings });

  let structured = existingResume ? structureResume(existingResume) : null;

  if (hasNewResume) {
    if (!nextSettings.gemini_api_key) {
      throw new Error('Add a Gemini API key to parse a new resume upload, or save your core profile without parsing.');
    }
    const parsedResume = await parseResumeWithGemini(resumeRaw, nextSettings.gemini_api_key, nextSettings.gemini_model);
    const parsedStructured = structureResume(parsedResume);
    structured = structured
      ? mergeStructuredResume(structured, parsedStructured)
      : parsedStructured;
  }

  if (!structured && hasAnyProfileData(profile)) {
    structured = structureResume({});
  }

  if (!structured) {
    return {
      success: true,
      resume: null,
      settingsSavedOnly: true,
      resumeAttachment: getResumeAttachmentSummary(data.resume || {}),
    };
  }

  // Only persist sensitive fields if opted in
  const safeProfile = { ...profile };
  if (!profile.sensitive_optin) {
    safeProfile.gender = '';
    safeProfile.race = '';
    safeProfile.veteran = '';
    safeProfile.disability = '';
    safeProfile.pronouns_sensitive = '';
  }
  structured = applyProfileOverrides(structured, safeProfile, nextSettings);

  const shouldPersistResumePreview = hasNewResume || data.resume?.attachmentRemoved !== true;
  const resumePreviewText = shouldPersistResumePreview
    ? (
        hasNewResume
          ? buildResumePreviewText({
              resumeRaw,
              structured,
              fallbackPreview: data.resume?.excerpt || '',
            })
          : buildResumePreviewText({
              structured,
              fallbackPreview: data.resume?.excerpt || '',
            })
      )
    : '';

  const resumeExcerpt = resumePreviewText
    ? resumePreviewText.slice(0, MAX_RESUME_EXCERPT_LENGTH)
    : null;
  const nextAttachment = hasNewResume
    ? buildResumeAttachment({
        resumeRaw,
        resumeMeta,
        structured,
        previewText: resumePreviewText,
      })
    : existingAttachment;

  await chrome.storage.local.set({
    resume: {
      structured,
      excerpt: resumeExcerpt,
      attachment: nextAttachment,
      attachmentRemoved: hasNewResume ? false : data.resume?.attachmentRemoved === true,
    },
  });

  return {
    success: true,
    resume: structured,
    resumeAttachment: getResumeAttachmentSummary({
      structured,
      excerpt: resumeExcerpt,
      attachment: nextAttachment,
      attachmentRemoved: hasNewResume ? false : data.resume?.attachmentRemoved === true,
    }),
  };
}

async function getState() {
  const data = await chrome.storage.local.get([
    'resume',
    'settings',
    'applications',
    'lastAnswers',
    'lastFillReport',
    'lastTrackedApplicationId',
    'learnedDefaults',
    'ignoredLearnedDefaults',
  ]);
  const settings = data.settings || {};
  const resume = data.resume || {};
  const applications = data.applications || [];
  const lastAnswers = data.lastAnswers || null;
  const ignoredLearnedDefaults = sanitizeIgnoredLearnedDefaultsMap(data.ignoredLearnedDefaults || {});
  const learnedDefaults = sanitizeLearnedDefaultsMap(data.learnedDefaults || {}, ignoredLearnedDefaults);
  if (
    Object.keys(learnedDefaults).length !== Object.keys(data.learnedDefaults || {}).length ||
    Object.keys(ignoredLearnedDefaults).length !== Object.keys(data.ignoredLearnedDefaults || {}).length
  ) {
    await chrome.storage.local.set({
      learnedDefaults: trimLearnedDefaultsMap(learnedDefaults),
      ignoredLearnedDefaults: trimIgnoredLearnedDefaultsMap(ignoredLearnedDefaults),
    });
  }

  const lastTrackedApplicationId = data.lastTrackedApplicationId || null;
  const lastTrackedApplication = applications.find((app) => app.id === lastTrackedApplicationId) || null;
  const lastFillReport = lastTrackedApplication && !isTerminalApplicationStatus(lastTrackedApplication.status)
    ? (data.lastFillReport || null)
    : null;

  // Try to detect ATS from the active tab URL
  let currentAts = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) currentAts = detectAtsFromUrl(tab.url);
  } catch (_) {
    // Not a tab context (e.g. options page) — ignore
  }

  const profile = getProfileFromResume(resume.structured, settings);
  const resumeAttachment = getResumeAttachmentSummary(resume);

  return {
    hasApiKey: !!settings.gemini_api_key,
    hasResume: !!resume.structured,
    apiKey: settings.gemini_api_key,
    geminiModel: settings.gemini_model || null,
    resumeName: resumeAttachment?.name || resume.structured?.name || null,
    resumeAttachment,
    settings,
    privacyConsent: !!settings.privacy_consent,
    profile,
    profileCompleteness: getProfileCompleteness(profile),
    learnedDefaultsCount: Object.keys(learnedDefaults).length,
    applications,
    lastAnswers,
    lastFillReport,
    lastTrackedApplicationId,
    currentAts,
  };
}

async function handleGenerateAnswers({ jd, customQuestions, pageUrl }) {
  const data = await chrome.storage.local.get(['resume', 'settings', 'learnedDefaults', 'ignoredLearnedDefaults']);
  const settings = data.settings || {};
  const resume = data.resume || {};
  const ignoredLearnedDefaults = sanitizeIgnoredLearnedDefaultsMap(data.ignoredLearnedDefaults || {});
  const learnedDefaults = sanitizeLearnedDefaultsMap(data.learnedDefaults || {}, ignoredLearnedDefaults);

  if (!resume.structured) throw new Error('Profile not set up yet');

  const deterministicAnswers = buildDeterministicAnswers({
    resume: resume.structured,
    settings,
    pageUrl,
    customQuestions: customQuestions || [],
    learnedDefaults,
  });

  let answers = { ...deterministicAnswers };
  let warning = null;

  const shouldUseAi = !!settings.gemini_api_key && (String(jd || '').trim() || (customQuestions || []).length);
  if (shouldUseAi) {
    try {
      const aiAnswers = await generateAnswers({
        resume: sanitizeResumeForAi(resume.structured),
        jd,
        customQuestions: customQuestions || [],
        settings,
        apiKey: settings.gemini_api_key,
        model: settings.gemini_model,
      });
      answers = {
        ...deterministicAnswers,
        ...aiAnswers,
      };
    } catch (err) {
      warning = `AI fallback unavailable: ${err.message}. Filled the core profile fields only.`;
      console.warn('[apply-bot] Falling back to deterministic answers only.', err);
    }
  }

  // Persist last answers for preview
  await chrome.storage.local.set({ lastAnswers: answers });

  return { success: true, answers, warning, usedAi: shouldUseAi && !warning };
}

async function getLastAnswers() {
  const data = await chrome.storage.local.get(['lastAnswers', 'lastFillReport']);
  return {
    answers: data.lastAnswers || null,
    report: data.lastFillReport || null,
  };
}

async function handleGetResumeAttachment() {
  const data = await chrome.storage.local.get('resume');
  const attachment = getSavedResumeAttachment(data.resume || {});
  if (!attachment) {
    throw new Error('No saved resume attachment is available yet.');
  }

  return { success: true, attachment };
}

async function handleRemoveResumeAttachment() {
  const data = await chrome.storage.local.get('resume');
  const resume = data.resume || {};

  await chrome.storage.local.set({
    resume: {
      ...resume,
      excerpt: null,
      attachment: null,
      attachmentRemoved: true,
    },
  });

  return { success: true };
}

async function handleLogApplication(app) {
  const entry = await addApplication(app);
  await chrome.storage.local.set({
    lastFillReport: app.fill_report || null,
    lastTrackedApplicationId: entry.id,
  });
  return { success: true, entry };
}

async function handleParseApplicationDraft({ text, draft } = {}) {
  return {
    success: true,
    details: deriveTrackerDetailsFromText(text, draft || {}),
  };
}

async function handleImportApplicationsCsv({ text } = {}) {
  const csvText = String(text || '');
  if (!csvText.trim()) {
    throw new Error('Choose a CSV file to import first.');
  }

  const result = await importApplicationsFromCsv(csvText);
  if (!result.imported) {
    throw new Error(result.warnings?.[0] || 'No valid application rows were found in that CSV.');
  }

  return {
    success: true,
    imported: result.imported,
    skipped: result.skipped,
    warnings: result.warnings || [],
  };
}

async function handleUpdateApplication({ id, patch }) {
  if (!id) throw new Error('Application id is required');
  const entry = await updateApplication(id, patch || {});
  if (!entry) {
    throw new Error('Could not find that tracked application.');
  }

  const data = await chrome.storage.local.get('lastTrackedApplicationId');
  if (data.lastTrackedApplicationId === id && isTerminalApplicationStatus(entry.status)) {
    await chrome.storage.local.set({
      lastFillReport: null,
      lastTrackedApplicationId: null,
    });
  }

  return { success: true, entry };
}

async function handleReorderApplications({ updates } = {}) {
  const items = Array.isArray(updates) ? updates : [];
  if (!items.length) {
    return { success: true, updated: 0 };
  }

  const updatedEntries = [];
  for (const item of items) {
    if (!item?.id) continue;
    const entry = await updateApplication(item.id, {
      status: item.status,
      sort_order: item.sort_order,
    });
    if (entry) {
      updatedEntries.push(entry);
    }
  }

  return {
    success: true,
    updated: updatedEntries.length,
    entries: updatedEntries,
  };
}

async function handleDeleteApplication({ id } = {}) {
  if (!id) throw new Error('Application id is required');
  const removed = await deleteApplication(id);
  if (!removed) {
    throw new Error('Could not find that tracked application to delete.');
  }

  const data = await chrome.storage.local.get('lastTrackedApplicationId');
  if (data.lastTrackedApplicationId === id) {
    await chrome.storage.local.set({
      lastFillReport: null,
      lastTrackedApplicationId: null,
    });
  }

  return { success: true, removed };
}

async function handleMarkLastSubmitted() {
  const data = await chrome.storage.local.get('lastTrackedApplicationId');
  const id = data.lastTrackedApplicationId;

  if (!id) {
    throw new Error('No recent autofill session to mark as submitted yet.');
  }

  const updated = await updateApplicationStatus(id, 'submitted');
  if (!updated) {
    throw new Error('Could not find the recent application entry to update.');
  }

  await chrome.storage.local.set({
    lastFillReport: null,
    lastTrackedApplicationId: null,
  });

  return { success: true };
}

async function handleSaveLearnedDefaults({ entries } = {}) {
  const incomingEntries = entries && typeof entries === 'object' ? entries : {};
  const data = await chrome.storage.local.get(['learnedDefaults', 'ignoredLearnedDefaults']);
  const ignoredLearnedDefaults = sanitizeIgnoredLearnedDefaultsMap(data.ignoredLearnedDefaults || {});
  const learnedDefaults = sanitizeLearnedDefaultsMap({
    ...(data.learnedDefaults || {}),
  }, ignoredLearnedDefaults);

  let saved = 0;
  for (const [label, value] of Object.entries(incomingEntries)) {
    const question = String(label || '').trim();
    const answer = String(value || '').trim();
    if (!shouldPersistLearnedValue(question, answer)) continue;
    if (isIgnoredLearnedPrompt(question, ignoredLearnedDefaults)) continue;

    delete learnedDefaults[question];
    learnedDefaults[question] = answer;
    saved++;
  }

  const trimmedLearnedDefaults = trimLearnedDefaultsMap(sanitizeLearnedDefaultsMap(learnedDefaults, ignoredLearnedDefaults));
  await chrome.storage.local.set({
    learnedDefaults: trimmedLearnedDefaults,
    ignoredLearnedDefaults: trimIgnoredLearnedDefaultsMap(ignoredLearnedDefaults),
  });
  return { success: true, saved };
}

async function handleGetLearnedDefaults() {
  const data = await chrome.storage.local.get(['learnedDefaults', 'ignoredLearnedDefaults']);
  const ignoredLearnedDefaults = sanitizeIgnoredLearnedDefaultsMap(data.ignoredLearnedDefaults || {});
  const learnedDefaults = sanitizeLearnedDefaultsMap(data.learnedDefaults || {}, ignoredLearnedDefaults);

  await chrome.storage.local.set({
    learnedDefaults,
    ignoredLearnedDefaults: trimIgnoredLearnedDefaultsMap(ignoredLearnedDefaults),
  });

  return {
    success: true,
    items: Object.entries(learnedDefaults).map(([question, answer]) => ({ question, answer })),
    ignoredItems: Object.values(trimIgnoredLearnedDefaultsMap(ignoredLearnedDefaults)),
  };
}

async function handleUpdateLearnedDefault({ question, answer } = {}) {
  const key = String(question || '').trim();
  const value = String(answer || '').trim();
  if (!shouldPersistLearnedValue(key, value)) {
    throw new Error('That remembered answer is not eligible to be stored.');
  }

  const data = await chrome.storage.local.get(['learnedDefaults', 'ignoredLearnedDefaults']);
  const ignoredLearnedDefaults = sanitizeIgnoredLearnedDefaultsMap(data.ignoredLearnedDefaults || {});
  if (isIgnoredLearnedPrompt(key, ignoredLearnedDefaults)) {
    throw new Error('That memory entry is currently ignored. Delete it from the ignore list to re-enable it.');
  }

  const learnedDefaults = sanitizeLearnedDefaultsMap({ ...(data.learnedDefaults || {}) }, ignoredLearnedDefaults);
  learnedDefaults[key] = value;
  await chrome.storage.local.set({ learnedDefaults: trimLearnedDefaultsMap(learnedDefaults) });
  return { success: true };
}

async function handleIgnoreLearnedDefault({ question } = {}) {
  const key = String(question || '').trim();
  if (!key) throw new Error('Memory question is required.');

  const data = await chrome.storage.local.get(['learnedDefaults', 'ignoredLearnedDefaults']);
  const ignoredLearnedDefaults = sanitizeIgnoredLearnedDefaultsMap(data.ignoredLearnedDefaults || {});
  const learnedDefaults = sanitizeLearnedDefaultsMap(data.learnedDefaults || {}, ignoredLearnedDefaults);
  const entry = findStoredLearnedEntry(learnedDefaults, key);
  if (!entry) {
    throw new Error('Could not find that memory entry to ignore.');
  }

  delete learnedDefaults[entry.question];
  ignoredLearnedDefaults[getLearnedMemoryKey(entry.question)] = {
    question: entry.question,
    answer: entry.answer,
    ignored_at: new Date().toISOString(),
  };

  await chrome.storage.local.set({
    learnedDefaults: trimLearnedDefaultsMap(learnedDefaults),
    ignoredLearnedDefaults: trimIgnoredLearnedDefaultsMap(ignoredLearnedDefaults),
  });
  return { success: true };
}

async function handleDeleteLearnedDefault({ question } = {}) {
  const key = String(question || '').trim();
  const data = await chrome.storage.local.get('learnedDefaults');
  const learnedDefaults = { ...(data.learnedDefaults || {}) };
  delete learnedDefaults[key];
  await chrome.storage.local.set({ learnedDefaults: trimLearnedDefaultsMap(learnedDefaults) });
  return { success: true };
}

async function handleDeleteIgnoredLearnedDefault({ question } = {}) {
  const key = getLearnedMemoryKey(question);
  if (!key) return { success: true };

  const data = await chrome.storage.local.get(['learnedDefaults', 'ignoredLearnedDefaults']);
  const ignoredLearnedDefaults = sanitizeIgnoredLearnedDefaultsMap(data.ignoredLearnedDefaults || {});
  const learnedDefaults = sanitizeLearnedDefaultsMap(data.learnedDefaults || {}, ignoredLearnedDefaults);
  const archivedEntry = ignoredLearnedDefaults[key] || null;

  delete ignoredLearnedDefaults[key];

  if (archivedEntry?.question && shouldPersistLearnedValue(archivedEntry.question, archivedEntry.answer || '')) {
    learnedDefaults[archivedEntry.question] = String(archivedEntry.answer || '').trim();
  }

  await chrome.storage.local.set({
    learnedDefaults: trimLearnedDefaultsMap(sanitizeLearnedDefaultsMap(learnedDefaults, ignoredLearnedDefaults)),
    ignoredLearnedDefaults: trimIgnoredLearnedDefaultsMap(ignoredLearnedDefaults),
  });
  return { success: true };
}

async function handleClearTempData() {
  await chrome.storage.local.remove([
    'applicationDrafts',
    'lastAnswers',
    'lastFillReport',
    'lastTrackedApplicationId',
  ]);
  return { success: true };
}

async function handleResetAllData() {
  await chrome.storage.local.clear();
  return { success: true };
}

// ── ATS detection from URL ────────────────────────────────────────────────────

/**
 * Check if a hostname exactly matches a domain or any of its subdomains.
 * @param {string} hostname
 * @param {string} domain
 * @returns {boolean}
 */
function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

function detectAtsFromUrl(url) {
  if (!url) return null;
  try {
    const { hostname, pathname, search } = new URL(url);
    const path = `${pathname} ${search}`.toLowerCase();

    if (matchesDomain(hostname, 'greenhouse.io') && /\/jobs\/|job_app|application/.test(path)) return 'Greenhouse';
    if ((matchesDomain(hostname, 'ashbyhq.com') || matchesDomain(hostname, 'ashby.io')) && /\/application|\/jobs\/|\/job\//.test(path)) return 'Ashby';
    if (matchesDomain(hostname, 'lever.co') && /\/postings\/|\/jobs\/|\/apply/.test(path)) return 'Lever';
    if (matchesDomain(hostname, 'linkedin.com') && /\/jobs\/view\//.test(path)) return 'LinkedIn Easy Apply';
    if (matchesDomain(hostname, 'workday.com') && /\/job\/|requisition|\/apply/.test(path)) return 'Workday';
    if (matchesDomain(hostname, 'icims.com') && /\/jobs\/|\/job\//.test(path)) return 'iCIMS';
  } catch {
    // Invalid URL — ignore
  }
  return null;
}

function hasAnyProfileData(profile = {}) {
  return Object.entries(profile || {}).some(
    ([key, value]) => key !== 'sensitive_optin' && String(value || '').trim()
  );
}

function sanitizeResumeAttachment(attachment = null) {
  if (!attachment || typeof attachment !== 'object') return null;

  const name = String(attachment.name || '').trim();
  const preview = String(attachment.preview || '').trim().slice(0, MAX_RESUME_ATTACHMENT_PREVIEW_LENGTH);
  const data = typeof attachment.data === 'string' ? attachment.data : '';
  const text = typeof attachment.text === 'string' ? attachment.text : '';
  const downloadMode = attachment.downloadMode === 'data-url' && data ? 'data-url' : 'text';

  if (!name && !preview && !data && !text) {
    return null;
  }

  return {
    name: name || 'resume-preview.txt',
    mimeType: String(attachment.mimeType || '').trim() || (downloadMode === 'data-url' ? 'application/octet-stream' : 'text/plain'),
    source: String(attachment.source || 'saved').trim() || 'saved',
    updatedAt: attachment.updatedAt || null,
    preview,
    downloadMode,
    data: downloadMode === 'data-url' ? data : '',
    text: downloadMode === 'text' ? text.slice(0, MAX_RESUME_ATTACHMENT_TEXT_LENGTH) : '',
  };
}

function extractDataUrlMimeType(dataUrl = '') {
  const match = String(dataUrl || '').match(/^data:([^;,]+)[;,]/i);
  return match?.[1] || '';
}

function buildResumeDownloadText(structured = {}, previewText = '') {
  const experience = Array.isArray(structured?.experience) ? structured.experience : [];
  const education = Array.isArray(structured?.education) ? structured.education : [];
  const skills = Array.isArray(structured?.skills) ? structured.skills : [];

  const lines = [
    structured?.name || '',
    [structured?.email, structured?.phone, structured?.location].filter(Boolean).join(' • '),
    structured?.summary || '',
    structured?.current_title
      ? `${structured.current_title}${structured?.current_company ? ` @ ${structured.current_company}` : ''}`
      : '',
    skills.length ? `Skills: ${skills.slice(0, 16).join(', ')}` : '',
    experience.length ? 'Experience:' : '',
    ...experience.slice(0, 3).map((item) => [item?.title, item?.company].filter(Boolean).join(' — ')),
    education.length ? 'Education:' : '',
    ...education.slice(0, 2).map((item) => [item?.degree, item?.institution || item?.school].filter(Boolean).join(' — ')),
    previewText || '',
  ].filter(Boolean);

  return lines.join('\n').trim().slice(0, MAX_RESUME_ATTACHMENT_TEXT_LENGTH);
}

function buildResumePreviewText({ resumeRaw = '', structured = {}, fallbackPreview = '' } = {}) {
  const raw = String(resumeRaw || '').trim();
  if (raw && !raw.startsWith('data:')) {
    return raw.replace(/\r\n/g, '\n').slice(0, MAX_RESUME_ATTACHMENT_PREVIEW_LENGTH);
  }

  const preview = String(fallbackPreview || buildResumeDownloadText(structured, '') || '').trim();
  return preview.slice(0, MAX_RESUME_ATTACHMENT_PREVIEW_LENGTH);
}

function getSavedResumeAttachment(resume = {}) {
  if (resume?.attachmentRemoved === true) {
    return null;
  }

  const storedAttachment = sanitizeResumeAttachment(resume?.attachment || null);
  if (storedAttachment) {
    return storedAttachment;
  }

  const preview = buildResumePreviewText({
    structured: resume?.structured || {},
    fallbackPreview: resume?.excerpt || '',
  });
  if (!preview) {
    return null;
  }

  return sanitizeResumeAttachment({
    name: 'resume-preview.txt',
    mimeType: 'text/plain',
    source: 'saved',
    updatedAt: null,
    preview,
    downloadMode: 'text',
    text: buildResumeDownloadText(resume?.structured || {}, preview),
  });
}

function buildResumeAttachment({ resumeRaw = '', resumeMeta = {}, structured = {}, previewText = '' } = {}) {
  const raw = String(resumeRaw || '');
  if (!raw.trim()) {
    return null;
  }

  const meta = resumeMeta && typeof resumeMeta === 'object' ? resumeMeta : {};
  const isDataUrl = raw.startsWith('data:');
  const source = meta.source === 'paste' ? 'paste' : 'upload';
  const attachment = {
    name: String(meta.name || (source === 'paste' ? 'resume-paste.txt' : 'resume-upload')).trim() || 'resume-preview.txt',
    mimeType: isDataUrl
      ? (extractDataUrlMimeType(raw) || String(meta.type || '').trim() || 'application/octet-stream')
      : (String(meta.type || '').trim() || 'text/plain'),
    source,
    updatedAt: new Date().toISOString(),
    preview: String(previewText || '').trim().slice(0, MAX_RESUME_ATTACHMENT_PREVIEW_LENGTH),
    downloadMode: 'text',
    data: '',
    text: '',
  };

  if (isDataUrl && raw.length <= MAX_RESUME_ATTACHMENT_DATA_LENGTH) {
    attachment.downloadMode = 'data-url';
    attachment.data = raw;
    return sanitizeResumeAttachment(attachment);
  }

  attachment.text = (
    !isDataUrl && raw.length <= MAX_RESUME_ATTACHMENT_TEXT_LENGTH
      ? raw
      : buildResumeDownloadText(structured, previewText)
  ).slice(0, MAX_RESUME_ATTACHMENT_TEXT_LENGTH);

  return sanitizeResumeAttachment(attachment);
}

function getResumeAttachmentSummary(resume = {}) {
  const attachment = getSavedResumeAttachment(resume);
  if (!attachment) {
    return null;
  }

  return {
    name: attachment.name,
    source: attachment.source,
    updatedAt: attachment.updatedAt,
    preview: attachment.preview,
    hasDownload: !!(attachment.data || attachment.text || attachment.preview),
    downloadLabel: attachment.downloadMode === 'data-url' ? 'Download copy' : 'Download preview',
  };
}

function sanitizeLearnedDefaultsMap(map = {}, ignoredMap = {}) {
  return Object.fromEntries(
    Object.entries(map || {}).filter(([label, value]) => {
      return shouldPersistLearnedValue(label, value) && !isIgnoredLearnedPrompt(label, ignoredMap);
    })
  );
}

function sanitizeIgnoredLearnedDefaultsMap(map = {}) {
  return Object.fromEntries(
    Object.entries(map || {}).map(([key, value]) => {
      const question = String(value?.question || key || '').trim();
      const answer = String(value?.answer || value || '').trim();
      const normalizedKey = getLearnedMemoryKey(question);
      return [normalizedKey, {
        question,
        answer,
        ignored_at: value?.ignored_at || null,
      }];
    }).filter(([key, value]) => key && value.question)
  );
}

function trimLearnedDefaultsMap(map = {}) {
  return Object.fromEntries(Object.entries(map || {}).slice(-75));
}

function trimIgnoredLearnedDefaultsMap(map = {}) {
  return Object.fromEntries(
    Object.entries(map || {})
      .sort((a, b) => String(b[1]?.ignored_at || '').localeCompare(String(a[1]?.ignored_at || '')))
      .slice(0, 100)
  );
}

function findStoredLearnedEntry(map = {}, question = '') {
  const normalizedKey = getLearnedMemoryKey(question);
  const exact = Object.entries(map || {}).find(([label]) => getLearnedMemoryKey(label) === normalizedKey);
  if (!exact) return null;
  return { question: exact[0], answer: String(exact[1] || '').trim() };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function firstNonEmptyNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

function mergeStructuredResume(existingResume, incomingResume) {
  const existing = structureResume(existingResume || {});
  const incoming = structureResume(incomingResume || {});

  return {
    ...existing,
    ...incoming,
    name: firstNonEmpty(incoming.name, existing.name),
    email: firstNonEmpty(incoming.email, existing.email),
    phone: firstNonEmpty(incoming.phone, existing.phone),
    location: firstNonEmpty(incoming.location, existing.location),
    address_line1: firstNonEmpty(incoming.address_line1, existing.address_line1),
    city: firstNonEmpty(incoming.city, existing.city),
    state_region: firstNonEmpty(incoming.state_region, existing.state_region),
    postal_code: firstNonEmpty(incoming.postal_code, existing.postal_code),
    linkedin: firstNonEmpty(incoming.linkedin, existing.linkedin),
    github: firstNonEmpty(incoming.github, existing.github),
    portfolio: firstNonEmpty(incoming.portfolio, existing.portfolio),
    pronouns: firstNonEmpty(incoming.pronouns, existing.pronouns),
    current_company: firstNonEmpty(incoming.current_company, existing.current_company),
    current_title: firstNonEmpty(incoming.current_title, existing.current_title),
    summary: firstNonEmpty(incoming.summary, existing.summary),
    years_of_experience: Math.max(Number(existing.years_of_experience) || 0, Number(incoming.years_of_experience) || 0),
    skills: incoming.skills?.length ? incoming.skills : existing.skills,
    experience: incoming.experience?.length ? incoming.experience : existing.experience,
    education: incoming.education?.length ? incoming.education : existing.education,
    certifications: incoming.certifications?.length ? incoming.certifications : existing.certifications,
    languages: incoming.languages?.length ? incoming.languages : existing.languages,
  };
}

function applyProfileOverrides(resume, profile = {}, settings = {}) {
  const next = structureResume({ ...(resume || {}) });
  next.name = firstNonEmpty(profile.full_name, profile.name, next.name);
  next.email = firstNonEmpty(profile.email, next.email);
  next.phone = firstNonEmpty(profile.phone, next.phone);
  next.location = firstNonEmpty(profile.location, next.location);
  next.address_line1 = firstNonEmpty(profile.address_line1, next.address_line1, next.address);
  next.city = firstNonEmpty(profile.city, next.city);
  next.state_region = firstNonEmpty(profile.state_region, profile.state, next.state_region, next.state);
  next.postal_code = firstNonEmpty(profile.postal_code, profile.zip, next.postal_code, next.zip);
  next.linkedin = firstNonEmpty(profile.linkedin, next.linkedin);
  next.github = firstNonEmpty(profile.github, next.github);
  next.portfolio = firstNonEmpty(profile.portfolio, next.portfolio);
  next.pronouns = firstNonEmpty(profile.pronouns, profile.pronouns_sensitive, next.pronouns);
  next.sensitive_optin = profile.sensitive_optin === true;
  next.gender = next.sensitive_optin ? firstNonEmpty(profile.gender, next.gender) : '';
  next.race = next.sensitive_optin ? firstNonEmpty(profile.race, next.race) : '';
  next.veteran = next.sensitive_optin ? firstNonEmpty(profile.veteran, next.veteran) : '';
  next.disability = next.sensitive_optin ? firstNonEmpty(profile.disability, next.disability) : '';
  next.pronouns_sensitive = next.sensitive_optin ? firstNonEmpty(profile.pronouns_sensitive, next.pronouns_sensitive) : '';
  next.current_company = firstNonEmpty(profile.current_company, next.current_company, next.experience?.[0]?.company);
  next.current_title = firstNonEmpty(profile.current_title, next.current_title, next.experience?.[0]?.title);
  next.years_of_experience = firstNonEmptyNumber(profile.years_of_experience, next.years_of_experience);
  next.why_company_default = firstNonEmpty(profile.why_company_default, next.why_company_default);
  next.why_role_default = firstNonEmpty(profile.why_role_default, next.why_role_default);
  next.additional_info_default = firstNonEmpty(profile.additional_info_default, next.additional_info_default);
  next.start_date = firstNonEmpty(profile.start_date, next.start_date);
  next.requires_sponsorship = firstNonEmpty(profile.requires_sponsorship, next.requires_sponsorship);

  if (!Array.isArray(next.experience)) next.experience = [];
  if (next.current_company || next.current_title) {
    if (!next.experience[0]) next.experience[0] = { company: '', title: '', start: '', end: 'Present', description: '' };
    next.experience[0].company = firstNonEmpty(next.current_company, next.experience[0].company);
    next.experience[0].title = firstNonEmpty(next.current_title, next.experience[0].title);
  }

  if (settings.work_authorization && !next.work_authorization) {
    next.work_authorization = settings.work_authorization;
  }

  return next;
}

function getProfileFromResume(resume = {}, settings = {}) {
  const currentExperience = Array.isArray(resume?.experience) ? resume.experience[0] || {} : {};
  const base = {
    full_name: resume?.name || '',
    email: resume?.email || '',
    phone: resume?.phone || '',
    location: resume?.location || '',
    address_line1: resume?.address_line1 || '',
    city: resume?.city || '',
    state_region: resume?.state_region || '',
    postal_code: resume?.postal_code || '',
    linkedin: resume?.linkedin || '',
    github: resume?.github || '',
    portfolio: resume?.portfolio || '',
    current_company: resume?.current_company || currentExperience.company || '',
    current_title: resume?.current_title || currentExperience.title || '',
    years_of_experience: resume?.years_of_experience ? String(resume.years_of_experience) : '',
    pronouns: resume?.pronouns || '',
    why_company_default: resume?.why_company_default || '',
    why_role_default: resume?.why_role_default || '',
    additional_info_default: resume?.additional_info_default || '',
    start_date: resume?.start_date || '',
    requires_sponsorship: resume?.requires_sponsorship || '',
    work_authorization: settings.work_authorization || '',
  };
  // Only surface sensitive fields if opted in
  if (resume?.sensitive_optin) {
    base.sensitive_optin = true;
    base.gender = resume.gender || '';
    base.race = resume.race || '';
    base.veteran = resume.veteran || '';
    base.disability = resume.disability || '';
    base.pronouns_sensitive = resume.pronouns_sensitive || '';
  } else {
    base.sensitive_optin = false;
    base.gender = '';
    base.race = '';
    base.veteran = '';
    base.disability = '';
    base.pronouns_sensitive = '';
  }
  return base;
}

function getProfileCompleteness(profile = {}) {
  const requiredKeys = ['full_name', 'email', 'phone', 'location', 'linkedin', 'current_company', 'current_title', 'work_authorization'];
  const completed = requiredKeys.filter((key) => String(profile[key] || '').trim()).length;
  return { completed, total: requiredKeys.length };
}

function buildDeterministicAnswers({ resume, settings, customQuestions = [], learnedDefaults = {} }) {
  const profile = getProfileFromResume(resume, settings);
  const fullName = profile.full_name;
  const salaryMin = settings.preferred_salary_min ? String(settings.preferred_salary_min) : '';
  const salaryMax = settings.preferred_salary_max ? String(settings.preferred_salary_max) : '';
  const safeLearnedDefaults = Object.fromEntries(
    Object.entries(learnedDefaults || {}).filter(([label, value]) => shouldPersistLearnedValue(label, value))
  );

  const baseAnswers = {
    first_name: fullName.split(' ')[0] || '',
    last_name: fullName.split(' ').slice(1).join(' ') || '',
    full_name: fullName,
    name: fullName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    address: profile.address_line1,
    address_line1: profile.address_line1,
    city: profile.city,
    state: profile.state_region,
    state_region: profile.state_region,
    zip: profile.postal_code,
    postal_code: profile.postal_code,
    linkedin: profile.linkedin,
    github: profile.github,
    portfolio: profile.portfolio,
    current_company: profile.current_company,
    current_title: profile.current_title,
    years_of_experience: profile.years_of_experience || '',
    pronouns: profile.pronouns,
    // Only include sensitive fields if opted in
    ...(profile.sensitive_optin ? {
      gender: profile.gender,
      race: profile.race,
      veteran: profile.veteran,
      disability: profile.disability,
      pronouns_sensitive: profile.pronouns_sensitive,
    } : {}),
    work_authorization: settings.work_authorization || '',
    preferred_location: profile.location,
    salary_expectation: [salaryMin, salaryMax].filter(Boolean).join(' - '),
    desired_salary_min: salaryMin,
    desired_salary_max: salaryMax,
    remote_preference: settings.preferred_remote ? 'Remote' : '',
    start_date: profile.start_date || '',
    availability: profile.start_date || '',
    why_company: profile.why_company_default || '',
    why_role: profile.why_role_default || '',
    additional_information: profile.additional_info_default || '',
    accommodations: profile.additional_info_default || '',
    sponsorship: profile.requires_sponsorship || '',
    requires_sponsorship: profile.requires_sponsorship || '',
  };

  return {
    ...baseAnswers,
    ...safeLearnedDefaults,
    custom_answers: buildDefaultCustomAnswers(customQuestions, baseAnswers, safeLearnedDefaults),
  };
}

function buildDefaultCustomAnswers(customQuestions = [], baseAnswers = {}, learnedDefaults = {}) {
  const customAnswers = {};

  for (const question of customQuestions) {
    const text = String(question || '').trim();
    const lower = text.toLowerCase();
    let answer = findLearnedAnswer(text, learnedDefaults);

    if (answer) {
      customAnswers[text] = answer;
      continue;
    }

    if (/legally authorized|authorized to work|eligible to work|work authorization/.test(lower)) {
      answer = wantsBinaryAnswer(lower) ? 'Yes' : baseAnswers.work_authorization;
    } else if (/sponsorship|sponsor|visa transfer|relocation assistance/.test(lower)) {
      const needsSponsorship = /^yes$/i.test(baseAnswers.requires_sponsorship || '');
      answer = wantsBinaryAnswer(lower) ? (needsSponsorship ? 'Yes' : 'No') : (baseAnswers.requires_sponsorship || 'No');
    } else if (/beginning of .*salary|salary range.*beginning|minimum salary/.test(lower)) {
      answer = baseAnswers.desired_salary_min;
    } else if (/end of .*salary|salary range.*end|maximum salary/.test(lower)) {
      answer = baseAnswers.desired_salary_max;
    } else if (/salary|compensation|annual base/.test(lower)) {
      answer = baseAnswers.salary_expectation;
    } else if (/why .*company|what makes you excited|why 1password|why do you want to work/.test(lower)) {
      answer = baseAnswers.why_company;
    } else if (/why .*role|good fit|why this role|strong candidate/.test(lower)) {
      answer = baseAnswers.why_role;
    } else if (/years? of (professional )?experience|how many years/.test(lower)) {
      answer = baseAnswers.years_of_experience;
    } else if (/gender|gender identity|sex at birth/.test(lower)) {
      answer = baseAnswers.gender || '';
    } else if (/race|ethnicity|ethnic background/.test(lower)) {
      answer = baseAnswers.race || '';
    } else if (/veteran|protected veteran|military service/.test(lower)) {
      answer = baseAnswers.veteran || '';
    } else if (/disability|disability status/.test(lower)) {
      answer = baseAnswers.disability || '';
    } else if (/cybersecurity saas/.test(lower)) {
      answer = wantsBinaryAnswer(lower) ? 'Yes' : baseAnswers.why_role;
    } else if (/size of company|most recently worked for/.test(lower)) {
      answer = '101-999';
    } else if (/what brought you to this job posting|how did you hear/.test(lower)) {
      answer = 'Company careers page';
    } else if (/current job title|job title/.test(lower)) {
      answer = baseAnswers.current_title;
    } else if (/current company|current employer|most recently/.test(lower)) {
      answer = baseAnswers.current_company;
    } else if (/start date|when can you start|availability|notice period/.test(lower)) {
      answer = baseAnswers.start_date || baseAnswers.availability;
    } else if (/pronouns/.test(lower)) {
      answer = baseAnswers.pronouns;
    } else if (/additional information|accommodations/.test(lower)) {
      answer = baseAnswers.additional_information;
    } else if (/background check|recruiting privacy|i understand|i agree/.test(lower)) {
      answer = wantsBinaryAnswer(lower) ? 'Yes' : 'I understand';
    }

    if (answer) {
      customAnswers[text] = answer;
    }
  }

  return customAnswers;
}

function sanitizeResumeForAi(resume = {}) {
  const safeResume = { ...(resume || {}) };
  delete safeResume.sensitive_optin;
  delete safeResume.gender;
  delete safeResume.race;
  delete safeResume.veteran;
  delete safeResume.disability;
  delete safeResume.pronouns_sensitive;
  return safeResume;
}

function wantsBinaryAnswer(text) {
  return /^(do|are|can|will|have|did|would|should|is)\b/.test(String(text || '').trim());
}
