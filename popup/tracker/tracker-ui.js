// Barrel export for filterTrackerApplications (re-export from lib/tracker.js)
import { filterApplicationsForQuery } from '../../lib/tracker.js';
import { expandedTrackerIds, trackerViewState } from './tracker-state.js';
import { getTrackingStatusMeta, TRACKER_STATUS_ORDER } from './tracker-meta.js';
import { formatDate } from '../../lib/utils.js';

export const filterTrackerApplications = filterApplicationsForQuery;

// Render the tracker board with lanes and cards
export async function renderTracker() {
  const trackerBody = document.getElementById('tracker-body');
  if (!trackerBody) return;
  // Assume getApplications is globally available or imported
  const resp = await window.trackerSendMessage?.({ type: 'GET_STATE' });
  const applications = resp?.applications || [];
  const filteredApps = filterApplicationsForQuery(applications, trackerViewState.query, { activeOnly: trackerViewState.activeOnly });
  trackerBody.innerHTML = '';
  if (!filteredApps.length) {
    trackerBody.innerHTML = '<p class="empty-msg">No applications tracked yet.</p>';
    return;
  }
  // Render lanes
  const lanes = [
    { key: 'drafted', label: '🟡 Drafted', statuses: ['drafted'] },
    { key: 'submitted', label: '✅ Submitted', statuses: ['submitted'] },
    { key: 'interview', label: '📅 Interview', statuses: ['interview'] },
    { key: 'offer', label: '🎉 Offer', statuses: ['offer'] },
    { key: 'rejected', label: '❌ Rejected', statuses: ['rejected'] },
    { key: 'retired', label: '⬜ Retired', statuses: ['retired'] },
  ];
  trackerBody.innerHTML = lanes.map(lane => renderTrackerLane(lane, filteredApps)).join('');
}

// Render a single lane with cards
export function renderTrackerLane(lane, applications) {
  const apps = applications.filter(app => lane.statuses.includes((app.status || '').toLowerCase()));
  return `
    <div class="tracker-lane" data-status="${lane.key}">
      <div class="tracker-lane-header">${lane.label} <span class="tracker-lane-count">${apps.length}</span></div>
      <div class="tracker-lane-cards" data-status-target="${lane.key}">
        ${apps.map(app => renderTrackerCard(app)).join('')}
      </div>
    </div>
  `;
}

// Render a single tracker card
export function renderTrackerCard(application) {
  const meta = getTrackingStatusMeta(application.status);
  return `
    <div class="tracker-card" data-id="${application.id}" data-status="${application.status}">
      <div class="tracker-card-header">
        <span class="tracker-card-company">${application.company}</span>
        <span class="tracker-card-title">${application.title}</span>
        <span class="tracker-card-status">${meta.emoji} ${meta.label}</span>
        <button class="tracker-card-toggle" aria-expanded="${expandedTrackerIds.has(application.id)}">${expandedTrackerIds.has(application.id) ? '−' : '+'}</button>
      </div>
      <div class="tracker-card-meta">
        <span>${application.location || ''}</span>
        <span>${formatDate(application.date)}</span>
      </div>
      <!-- Add more fields/actions as needed -->
    </div>
  `;
}
