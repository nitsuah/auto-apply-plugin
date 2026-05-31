// tracker-state.js
// Tracker state variables and helpers

let expandedTrackerIds = new Set();
let trackerViewState = {
  query: '',
  // Default to the Active view (everything except rejected/retired). Users can
  // toggle to "All" to surface the final-stage buckets.
  activeOnly: true,
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
