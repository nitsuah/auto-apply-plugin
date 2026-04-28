// popup-new.js
// FINAL orchestrator for popup UI, only wires up split modules

import { renderJobSearchResults, initJobSearchHandlers } from './search/job-search.js';
import { handleSaveAiSettings, initAiHandlers } from './ai/ai.js';
import { initHelpHandlers } from './ux/help.js';
import { readSettingsForm, handleSaveSetup } from './ux/profile.js';
import { showScreen, scrollToSection, bindReviewJumpHandlers } from './ux/navigation.js';
import { renderTracker, initTrackerHandlers, renderTrackerLane, renderTrackerCard, filterTrackerApplications } from './tracker/tracker-ui.js';
import { trackerSaveTimers, expandedTrackerIds, trackerViewState, trackerDragState } from './tracker/tracker-state.js';
import { TRACKER_STATUS_META, TRACKER_STATUS_ORDER } from './tracker/tracker-meta.js';
import { setStatus, setResumeDropLabel, setElementsDisabled, setBadgeState, setStatusRowMeta } from './ux/state.js';
import { syncConsentGate } from './ux/consent.js';
import { renderLearnedDefaults } from './forms/memory.js';
import { initPreviewHandlers, renderPreview, renderFillReport } from './forms/preview.js';

// Orchestrate popup logic: wire up modules and initialize UI

document.addEventListener('DOMContentLoaded', () => {
  showScreen('main'); // Always show main/profile screen on popup open
  initJobSearchHandlers(showScreen);
  initTrackerHandlers();
  initAiHandlers();
  initHelpHandlers();

  // Main screen buttons
  const fillBtn = document.getElementById('fill-btn');
  if (fillBtn) fillBtn.onclick = () => showScreen('main'); // TODO: implement fill logic
  const previewBtn = document.getElementById('preview-btn');
  if (previewBtn) previewBtn.onclick = () => showScreen('preview');
  const editProfileBtn = document.getElementById('edit-resume-btn');
  if (editProfileBtn) editProfileBtn.onclick = () => showScreen('main');

  // Status rows
  const resumeRow = document.getElementById('resume-row');
  if (resumeRow) resumeRow.onclick = () => showScreen('main');
  const apiRow = document.getElementById('api-row');
  if (apiRow) apiRow.onclick = () => showScreen('ai');
  const profileRow = document.getElementById('profile-row');
  if (profileRow) profileRow.onclick = () => showScreen('main');
  const privacyRow = document.getElementById('privacy-row');
  if (privacyRow) privacyRow.onclick = () => showScreen('help');
  const memoryRow = document.getElementById('learned-row');
  if (memoryRow) memoryRow.onclick = () => showScreen('main'); // TODO: implement memory screen
  const atsRow = document.getElementById('ats-row');
  if (atsRow) atsRow.onclick = () => alert('ATS explainer coming soon!');
});
