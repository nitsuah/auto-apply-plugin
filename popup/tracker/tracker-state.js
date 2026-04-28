// tracker-state.js
// Tracker state variables and helpers

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

export {
  expandedTrackerIds,
  trackerViewState,
  trackerDragState,
  trackerSaveTimers,
};
