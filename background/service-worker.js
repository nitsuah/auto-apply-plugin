/**
 * apply-bot — service-worker.js
 * Handles storage, Gemini API calls, and message routing.
 */

import { parseResumeWithGemini, generateAnswers } from '../lib/gemini.js';
import { structureResume } from '../lib/resume-parser.js';
import { addApplication } from '../lib/tracker.js';

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
    case 'GENERATE_ANSWERS':
      return handleGenerateAnswers(msg.payload);
    case 'GET_LAST_ANSWERS':
      return getLastAnswers();
    case 'LOG_APPLICATION':
      return handleLogApplication(msg.payload);
    case 'ATS_DETECTED':
      return { success: true }; // acknowledged — no action needed
    default:
      throw new Error('Unknown message type: ' + msg.type);
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// Maximum plain-text excerpt length stored alongside the structured resume.
// Binary uploads (data URLs) are not excerpted to avoid quota issues.
const MAX_RESUME_EXCERPT_LENGTH = 1000;

async function handleSaveSetup({ resumeRaw, settings }) {
  // Save settings first
  await chrome.storage.local.set({ settings });

  // Parse resume with Gemini, then normalize shape/defaults
  const parsedResume = await parseResumeWithGemini(resumeRaw, settings.gemini_api_key, settings.gemini_model);
  const structured = structureResume(parsedResume);

  // Avoid persisting the full raw resume payload — uploaded files may be large
  // base64-encoded PDFs/DOCXs that can exceed chrome.storage quotas.
  // Keep only a short plain-text excerpt when the source is not a data URL.
  const resumeExcerpt =
    typeof resumeRaw === 'string' && !resumeRaw.startsWith('data:')
      ? resumeRaw.slice(0, MAX_RESUME_EXCERPT_LENGTH)
      : null;

  await chrome.storage.local.set({
    resume: { structured, excerpt: resumeExcerpt },
  });

  return { success: true };
}

async function getState() {
  const data = await chrome.storage.local.get(['resume', 'settings', 'applications', 'lastAnswers']);
  const settings = data.settings || {};
  const resume = data.resume || {};
  const applications = data.applications || [];
  const lastAnswers = data.lastAnswers || null;

  // Try to detect ATS from the active tab URL
  let currentAts = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) currentAts = detectAtsFromUrl(tab.url);
  } catch (_) {
    // Not a tab context (e.g. options page) — ignore
  }

  return {
    hasApiKey: !!settings.gemini_api_key,
    hasResume: !!resume.structured,
    apiKey: settings.gemini_api_key,
    geminiModel: settings.gemini_model || null,
    resumeName: resume.structured?.name || null,
    applications,
    lastAnswers,
    currentAts,
  };
}

async function handleGenerateAnswers({ jd, customQuestions, pageUrl }) {
  const data = await chrome.storage.local.get(['resume', 'settings']);
  const settings = data.settings || {};
  const resume = data.resume || {};

  if (!settings.gemini_api_key) throw new Error('Gemini API key not set');
  if (!resume.structured) throw new Error('Resume not parsed yet');

  const answers = await generateAnswers({
    resume: resume.structured,
    jd,
    customQuestions: customQuestions || [],
    settings,
    apiKey: settings.gemini_api_key,
    model: settings.gemini_model,
  });

  // Persist last answers for preview
  await chrome.storage.local.set({ lastAnswers: answers });

  return { success: true, answers };
}

async function getLastAnswers() {
  const data = await chrome.storage.local.get('lastAnswers');
  return { answers: data.lastAnswers || null };
}

async function handleLogApplication(app) {
  await addApplication(app);
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
    const { hostname } = new URL(url);
    if (matchesDomain(hostname, 'greenhouse.io')) return 'Greenhouse';
    if (matchesDomain(hostname, 'ashbyhq.com') || matchesDomain(hostname, 'ashby.io')) return 'Ashby';
    if (matchesDomain(hostname, 'lever.co')) return 'Lever';
    if (matchesDomain(hostname, 'linkedin.com') && url.includes('/jobs')) return 'LinkedIn Easy Apply';
    if (matchesDomain(hostname, 'workday.com')) return 'Workday';
    if (matchesDomain(hostname, 'icims.com')) return 'iCIMS';
  } catch {
    // Invalid URL — ignore
  }
  return null;
}
