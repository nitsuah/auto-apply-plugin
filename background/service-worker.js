/**
 * apply-bot — service-worker.js
 * Handles storage, Gemini API calls, and message routing.
 */

import { callGemini, parseResumeWithGemini, generateAnswers } from '../lib/gemini.js';
import { structureResume } from '../lib/resume-parser.js';
import { addApplication, getApplications } from '../lib/tracker.js';

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

async function handleSaveSetup({ resumeRaw, settings }) {
  // Save settings first
  await chrome.storage.local.set({ settings });

  // Parse resume with Gemini
  const structured = await parseResumeWithGemini(resumeRaw, settings.gemini_api_key);

  await chrome.storage.local.set({
    resume: { raw: resumeRaw, structured },
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
  const data = await chrome.storage.local.get('applications');
  const applications = data.applications || [];
  applications.push({
    id: crypto.randomUUID(),
    ...app,
    date: app.date || new Date().toISOString().slice(0, 10),
  });
  await chrome.storage.local.set({ applications });
  return { success: true };
}

// ── ATS detection from URL ────────────────────────────────────────────────────

function detectAtsFromUrl(url) {
  if (!url) return null;
  if (url.includes('greenhouse.io')) return 'Greenhouse';
  if (url.includes('ashbyhq.com') || url.includes('ashby.io')) return 'Ashby';
  if (url.includes('lever.co')) return 'Lever';
  if (url.includes('linkedin.com/jobs')) return 'LinkedIn Easy Apply';
  if (url.includes('workday.com')) return 'Workday';
  if (url.includes('icims.com')) return 'iCIMS';
  return null;
}
