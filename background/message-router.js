/**
 * background/message-router.js - Message routing for service worker
 * Extracted from service-worker.js (orig: lines 31-108)
 */

import {
  handleSaveSetup,
  handleSaveSettingsOnly,
  getState,
  handleGetResumeAttachment,
  handleRemoveResumeAttachment,
  handleGenerateAnswers,
  getLastAnswers,
  handleSearchJobs,
  handleGetJobSources,
  handleGetOauthInfo,
  handleLinkedInConnect,
  handleSummarizeJd,
  handleLogApplication,
  handleParseApplicationDraft,
  handleImportApplicationsCsv,
  handleUpdateApplication,
  handleReorderApplications,
  handleDeleteApplication,
  handleMarkLastSubmitted,
  handleSaveLearnedDefaults,
  handleGetLearnedDefaults,
  handleUpdateLearnedDefault,
  handleIgnoreLearnedDefault,
  handleDeleteLearnedDefault,
  handleDeleteIgnoredLearnedDefault,
  handleClearTempData,
  handleResetAllData,
  handleGetInterviewPrep,
  handleSaveInterviewPrep,
  handleGenerateInterviewQuestions,
  handleGenerateInterviewAnswer,
} from './handlers/index.js';

// ── Message router ────────────────────────────────────────────────────────────

export function setupMessageRouter() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    handleMessage(msg).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // keep channel open for async response
  });
}

export async function handleMessage(msg) {
  switch (msg.type) {
    case 'SAVE_SETUP':
      return handleSaveSetup(msg.payload);
    case 'SAVE_SETTINGS_ONLY':
      return handleSaveSettingsOnly(msg.payload);
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
    case 'SEARCH_JOBS':
      return handleSearchJobs(msg.payload);
    case 'GET_JOB_SOURCES':
      return handleGetJobSources();
    case 'GET_OAUTH_INFO':
      return handleGetOauthInfo();
    case 'LINKEDIN_CONNECT':
      return handleLinkedInConnect();
    case 'SUMMARIZE_JD':
      return handleSummarizeJd(msg.payload);
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
    case 'GET_INTERVIEW_PREP':
      return handleGetInterviewPrep(msg.payload);
    case 'SAVE_INTERVIEW_PREP':
      return handleSaveInterviewPrep(msg.payload);
    case 'GENERATE_INTERVIEW_QUESTIONS':
      return handleGenerateInterviewQuestions(msg.payload);
    case 'GENERATE_INTERVIEW_ANSWER':
      return handleGenerateInterviewAnswer(msg.payload);
    default:
      throw new Error('Unknown message type: ' + msg.type);
  }
}