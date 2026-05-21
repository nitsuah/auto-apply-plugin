// tracker.js
// Barrel module for tracker — re-exports all split modules

import {
  TRACKER_STATUS_META,
  TRACKER_STATUS_ORDER,
  getTrackingStatusMeta
} from './tracker/tracker-meta.js';
import {
  expandedTrackerIds,
  trackerViewState,
  trackerDragState,
  trackerSaveTimers
} from './tracker/tracker-state.js';
import {
  renderTracker,
  renderTrackerLane,
  renderTrackerCard,
  filterTrackerApplications,
  sortTrackerApplications,
  getTrackerLaneCount,
  hasActiveTrackerFilters,
  syncTrackerFilterUi,
  syncTrackerCardSummary,
} from './tracker/tracker-ui.js';
import {
  initTrackerHandlers,
  handleTrackerDragStart,
  handleTrackerDrop,
  handleTrackerDragEnd,
  setLoadMainScreen,
} from './tracker/tracker-handlers.js';
import {
  exportCsv,
  importTrackerCsvFile
} from './tracker/tracker-csv.js';

// Re-export everything for consumers
export {
  renderTracker,
  renderTrackerLane,
  renderTrackerCard,
  filterTrackerApplications,
  sortTrackerApplications,
  getTrackerLaneCount,
  hasActiveTrackerFilters,
  syncTrackerFilterUi,
  syncTrackerCardSummary,
  expandedTrackerIds,
  trackerDragState,
  trackerSaveTimers,
  trackerViewState,
  TRACKER_STATUS_META,
  TRACKER_STATUS_ORDER,
  getTrackingStatusMeta,
  initTrackerHandlers,
  handleTrackerDragStart,
  handleTrackerDrop,
  handleTrackerDragEnd,
  setLoadMainScreen,
  exportCsv,
  importTrackerCsvFile,
};
