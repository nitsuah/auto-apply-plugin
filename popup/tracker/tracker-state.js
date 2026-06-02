// tracker-state.js
// Tracker state variables and helpers

let expandedTrackerIds = new Set();
let trackerViewState = {
  query: '',
  // Default to the Active view (everything except rejected/retired). Users can
  // toggle to "All" to surface the final-stage buckets.
  activeOnly: true,
  // Sort order within each lane. 'smart' = recency-weighted default; other
  // modes let the user rank by pay, submission date, or last-updated.
  sortMode: 'smart',
};
let trackerDragState = {
  id: '',
  status: '',
  kind: '',
};
let trackerSaveTimers = new Map();

export {
  expandedTrackerIds,
  trackerViewState,
  trackerDragState,
  trackerSaveTimers,
};
