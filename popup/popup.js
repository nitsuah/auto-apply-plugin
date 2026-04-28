// popup-new.js
// FINAL orchestrator for popup UI, only wires up split modules

import { renderJobSearchResults, initJobSearchHandlers } from './search/job-search.js';
import { handleSaveAiSettings, initAiHandlers } from './ai/ai.js';
import { initHelpHandlers } from './ux/help.js';
import { readSettingsForm, handleSaveSetup } from './ux/profile.js';
import { showScreen, scrollToSection, bindReviewJumpHandlers } from './ux/navigation.js';
import { renderTracker, initTrackerHandlers, renderTrackerLane, renderTrackerCard, filterTrackerApplications } from './tracker-ui.js';
import { trackerSaveTimers, expandedTrackerIds, trackerViewState, trackerDragState } from './tracker-state.js';
import { TRACKER_STATUS_META, TRACKER_STATUS_ORDER } from './tracker-meta.js';
import { setStatus, setResumeDropLabel, setElementsDisabled, setBadgeState, setStatusRowMeta } from './ux/state.js';
import { syncConsentGate } from './ux/consent.js';
import { renderLearnedDefaults } from './forms/memory.js';
import { initPreviewHandlers, renderPreview, renderFillReport } from './forms/preview.js';

// Orchestrate popup logic: wire up modules and initialize UI

document.addEventListener('DOMContentLoaded', () => {
  initJobSearchHandlers(showScreen);
  initTrackerHandlers();
  initAiHandlers();
  initHelpHandlers();
  // Profile/setup panel logic is in profile.js
  // Memory panel logic is in memory.js
  // Additional orchestration as needed
});

// All DOM helpers, state, and navigation are now in their respective modules.
// All screen logic is now split into forms/, ux/, ai/, and tracker-*.js modules.
