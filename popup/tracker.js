// Tracker constants and meta
export const TRACKER_STATUS_META = {
  drafted: {
    label: 'Drafted',
    emoji: '🟡',
    optionHint: 'saved lead / not sent',
    cardHint: 'Saved lead — tailor before sending',
  },
  retired: {
    label: 'Retired',
    emoji: '⬜',
    optionHint: 'job unlisted / no reply',
    cardHint: 'Job closed or unlisted — not an explicit rejection',
    tone: 'grey',
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

export const TRACKER_STATUS_ORDER = ['drafted', 'submitted', 'interview', 'offer', 'rejected', 'retired'];
// tracker.js
// All tracker board logic, rendering, filtering, and state management


// --- Tracker State ---
let expandedTrackerIds = new Set();
let trackerViewState = {
  query: '',
  activeOnly: false,
};
let trackerDragState = {
  id: '',
  status: '',
};
let trackerSaveTimers = new Map();


// --- Tracker Functions (stubs for all exports) ---
function renderTracker() {
  // TODO: Implement tracker rendering
}

function renderTrackerLane() {
  // TODO: Implement tracker lane rendering
}

function renderTrackerCard() {
  // TODO: Implement tracker card rendering
}

function filterTrackerApplications() {
  // TODO: Implement tracker application filtering
  return [];
}

function sortTrackerApplications() {
  // TODO: Implement tracker application sorting
  return [];
}

function persistTrackerBoardOrder() {
  // TODO: Implement tracker board order persistence
}

function getTrackerLaneCount() {
  // TODO: Implement tracker lane count
  return 0;
}

function getTrackingStatusMeta() {
  // TODO: Implement tracking status meta
  return {};
}

function normalizeTrackingStatus(status) {
  // TODO: Implement status normalization
  return status;
}

// Export all tracker functions
export {
  renderTracker,
  renderTrackerLane,
  renderTrackerCard,
  filterTrackerApplications,
  sortTrackerApplications,
  persistTrackerBoardOrder,
  getTrackerLaneCount,
  getTrackingStatusMeta,
  normalizeTrackingStatus,
  expandedTrackerIds,
  trackerViewState,
  trackerDragState,
  trackerSaveTimers,
  // ...add more as needed
};
