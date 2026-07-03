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

/**
 * Map of message type to handler function.
 * Adding new message types is now a single-line addition here.
 */
const MESSAGE_HANDLERS = {
  SAVE_SETUP: handleSaveSetup,
  SAVE_SETTINGS_ONLY: handleSaveSettingsOnly,
  GET_STATE: getState,
  GET_RESUME_ATTACHMENT: handleGetResumeAttachment,
  REMOVE_RESUME_ATTACHMENT: handleRemoveResumeAttachment,
  GENERATE_ANSWERS: handleGenerateAnswers,
  GET_LAST_ANSWERS: getLastAnswers,
  SEARCH_JOBS: handleSearchJobs,
  GET_JOB_SOURCES: handleGetJobSources,
  GET_OAUTH_INFO: handleGetOauthInfo,
  LINKEDIN_CONNECT: handleLinkedInConnect,
  SUMMARIZE_JD: handleSummarizeJd,
  LOG_APPLICATION: handleLogApplication,
  PARSE_APPLICATION_DRAFT: handleParseApplicationDraft,
  IMPORT_APPLICATIONS_CSV: handleImportApplicationsCsv,
  UPDATE_APPLICATION: handleUpdateApplication,
  REORDER_APPLICATIONS: handleReorderApplications,
  DELETE_APPLICATION: handleDeleteApplication,
  MARK_LAST_SUBMITTED: handleMarkLastSubmitted,
  SAVE_LEARNED_DEFAULTS: handleSaveLearnedDefaults,
  GET_LEARNED_DEFAULTS: handleGetLearnedDefaults,
  UPDATE_LEARNED_DEFAULT: handleUpdateLearnedDefault,
  IGNORE_LEARNED_DEFAULT: handleIgnoreLearnedDefault,
  DELETE_LEARNED_DEFAULT: handleDeleteLearnedDefault,
  DELETE_IGNORED_LEARNED_DEFAULT: handleDeleteIgnoredLearnedDefault,
  CLEAR_TEMP_DATA: handleClearTempData,
  RESET_ALL_DATA: handleResetAllData,
  ATS_DETECTED: () => ({ success: true }),
  GET_INTERVIEW_PREP: handleGetInterviewPrep,
  SAVE_INTERVIEW_PREP: handleSaveInterviewPrep,
  GENERATE_INTERVIEW_QUESTIONS: handleGenerateInterviewQuestions,
  GENERATE_INTERVIEW_ANSWER: handleGenerateInterviewAnswer,
};

/**
 * Sets up the message router for the service worker.
 * Registers a listener for chrome.runtime.onMessage.
 */
export function setupMessageRouter() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    handleMessage(msg).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // keep channel open for async response
  });
}

/**
 * Dispatches a message to the appropriate handler.
 * @param {Object} msg - The message object with `type` and optional `payload`.
 * @returns {Promise<any>} The handler's return value.
 * @throws {Error} If the message type is unknown.
 */
export async function handleMessage(msg) {
  const handler = MESSAGE_HANDLERS[msg?.type];
  if (!handler) {
    throw new Error('Unknown message type: ' + msg?.type);
  }
  return handler(msg.payload);
}