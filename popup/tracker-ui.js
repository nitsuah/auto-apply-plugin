// Barrel export for filterTrackerApplications (re-export from lib/tracker.js)
import { filterApplicationsForQuery } from '../lib/tracker.js';
import { initTrackerHandlers } from './tracker-handlers.js';

export const filterTrackerApplications = filterApplicationsForQuery;
export { initTrackerHandlers };
// tracker-ui.js
// Tracker UI rendering functions

import { getTrackingStatusMeta, TRACKER_STATUS_ORDER } from './tracker-meta.js';
import { expandedTrackerIds, trackerViewState } from './tracker-state.js';
import { formatDate } from '../lib/utils.js';
import { getApplications } from '../lib/tracker.js';

export async function renderTracker() {
  const trackerBody = document.getElementById('tracker-body');
  if (!trackerBody) return;
  const applications = await getApplications();
  if (!applications.length) {
    trackerBody.innerHTML = '<p class="empty-msg">No applications tracked yet.</p>';
    return;
  }
  trackerBody.innerHTML = applications.map(app => renderTrackerCard(app)).join('');
}

export function renderTrackerLane(status, applications, options = {}) {
  // ...implementation...
}

export function renderTrackerCard(application, options = {}) {
  // Minimal card rendering for now
  return `<div class="tracker-card">
    <div class="tracker-card-header">
      <span class="tracker-card-company">${application.company}</span>
      <span class="tracker-card-title">${application.title}</span>
      <span class="tracker-card-status">${application.status}</span>
    </div>
    <div class="tracker-card-meta">
      <span>${application.location || ''}</span>
      <span>${formatDate(application.date)}</span>
    </div>
  </div>`;
}

// Add more UI rendering functions as needed
