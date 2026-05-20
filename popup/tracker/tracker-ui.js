// tracker-ui.js
// Tracker board rendering: lanes, cards, sorting, filtering

import { $, esc, escAttr, sendMessage, formatDate, formatDateInput, renderStatusOptions, renderEmploymentTypeOptions } from '../../lib/utils.js';
import { normalizeApplicationStatus } from '../../lib/tracker.js';
import { expandedTrackerIds, trackerViewState } from './tracker-state.js';
import { getTrackingStatusMeta, TRACKER_STATUS_ORDER } from './tracker-meta.js';

// Re-export filterTrackerApplications from lib
export { filterApplicationsForQuery as filterTrackerApplications } from '../../lib/tracker.js';

// ── Sorting ─────────────────────────────────────────────────────────────────

export function sortTrackerApplications(applications = []) {
  return [...(applications || [])].sort((a, b) => {
    const aOrder = Number(a?.sort_order);
    const bOrder = Number(b?.sort_order);
    const hasA = Number.isFinite(aOrder);
    const hasB = Number.isFinite(bOrder);

    if (hasA || hasB) {
      return (hasB ? bOrder : Number.NEGATIVE_INFINITY) - (hasA ? aOrder : Number.NEGATIVE_INFINITY);
    }

    return String(b?.updated_at || '').localeCompare(String(a?.updated_at || ''));
  });
}

// ── Filter UI sync ──────────────────────────────────────────────────────────

export function hasActiveTrackerFilters() {
  return !!String(trackerViewState.query || '').trim() || trackerViewState.activeOnly;
}

export function syncTrackerFilterUi() {
  const toggle = $('tracker-scope-toggle');
  if (!toggle) return;

  toggle.textContent = trackerViewState.activeOnly ? 'Active' : 'All';
  toggle.classList.toggle('is-active', trackerViewState.activeOnly);
  toggle.setAttribute('aria-pressed', String(trackerViewState.activeOnly));
  toggle.title = trackerViewState.activeOnly
    ? 'Showing only active pipeline items.'
    : 'Showing every tracked application.';
}

// ── Lane count ──────────────────────────────────────────────────────────────

export function getTrackerLaneCount(applications, lane) {
  if (Array.isArray(lane.groups)) {
    return lane.groups.reduce((sum, group) => {
      return sum + applications.filter((app) => group.statuses.includes(normalizeApplicationStatus(app.status))).length;
    }, 0);
  }
  return applications.filter((app) => lane.statuses.includes(normalizeApplicationStatus(app.status))).length;
}

// ── Render tracker board ────────────────────────────────────────────────────

let expandedRejected = false;

export async function renderTracker() {
  const resp = await sendMessage({ type: 'GET_STATE' });
  const apps = sortTrackerApplications(resp?.applications || []);

  const { filterApplicationsForQuery } = await import('../../lib/tracker.js');
  const filteredApps = filterApplicationsForQuery(apps, trackerViewState.query, { activeOnly: trackerViewState.activeOnly });
  const tbody = $('tracker-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  applyTrackerSummary(apps);

  if ($('tracker-search-input') && $('tracker-search-input').value !== trackerViewState.query) {
    $('tracker-search-input').value = trackerViewState.query;
  }
  syncTrackerFilterUi();

  if (filteredApps.length === 0) {
    const emptyEl = $('tracker-empty');
    if (emptyEl) {
      emptyEl.textContent = hasActiveTrackerFilters()
        ? 'No tracked applications match the current filters.'
        : 'No applications tracked yet.';
      emptyEl.classList.remove('hidden');
    }
    return;
  }
  $('tracker-empty')?.classList.add('hidden');

  const lanes = [
    { key: 'drafted', label: '🟡 Drafted', statuses: ['drafted'] },
    { key: 'submitted', label: '✅ Submitted', statuses: ['submitted'] },
    { key: 'pending', label: '⏳ Pending', statuses: ['pending'] },
    {
      key: 'later',
      label: '📅 Later stages',
      groups: [
        { key: 'interview', label: '📅 Interview', statuses: ['interview'] },
        { key: 'offer', label: '🎉 Offer', statuses: ['offer'] },
      ],
    },
    {
      key: 'final',
      label: '📁 Final stage',
      groups: [
        { key: 'rejected', label: '❌ Rejected', statuses: ['rejected'] },
        { key: 'retired', label: '⬜ Retired', statuses: ['retired'] },
      ],
    },
  ];

  tbody.innerHTML = lanes.map((lane) => renderTrackerLane(filteredApps, lane)).join('');
}

function applyTrackerSummary(apps = []) {
  const total = apps.length;
  const active = apps.filter((a) => !['rejected', 'retired'].includes(normalizeApplicationStatus(a.status))).length;

  if ($('stat-total')) $('stat-total').textContent = total;
  if ($('stat-applied')) $('stat-applied').textContent = apps.filter(a => normalizeApplicationStatus(a.status) === 'submitted').length;
  if ($('stat-pending')) $('stat-pending').textContent = active;
  if ($('header-tracker-count')) {
    $('header-tracker-count').textContent = `${active} / ${total} active`;
  }
  if ($('header-tracker-btn')) {
    $('header-tracker-btn').title = `${active} of ${total} tracked applications still active. Open tracker workspace.`;
  }
}

// ── Render lane ─────────────────────────────────────────────────────────────

export function renderTrackerLane(applications, lane) {
  if (Array.isArray(lane.groups)) {
    const sections = lane.groups.map((group) => {
      let laneApps = applications.filter((app) => group.statuses.includes(normalizeApplicationStatus(app.status)));
      let showMore = false;
      if (group.key === 'rejected' && laneApps.length > 5) {
        showMore = true;
      }
      const visibleApps = (showMore && !expandedRejected) ? laneApps.slice(0, 5) : laneApps;
      const cards = visibleApps.length
        ? visibleApps.map(renderTrackerCard).join('')
        : '<p class="empty-msg tracker-lane-empty">Nothing here yet.</p>';
      let showMoreBtn = '';
      if (showMore) {
        showMoreBtn = `<button class="btn btn-link btn-xs tracker-show-more-rejected" data-status="rejected">${expandedRejected ? 'Show less' : 'Show more'}</button>`;
      }
      return `
        <div class="tracker-lane-group" data-status-target="${escAttr(group.statuses[0])}">
          <div class="tracker-lane-subheader">
            <span class="tracker-lane-subtitle">${group.label}</span>
            <span class="tracker-lane-count">${laneApps.length}</span>
          </div>
          <div class="tracker-lane-cards" data-status-target="${escAttr(group.statuses[0])}">${cards}${showMoreBtn}</div>
        </div>
      `;
    }).join('');

    const total = getTrackerLaneCount(applications, lane);

    return `
      <section class="tracker-lane tracker-lane-stacked">
        <div class="tracker-lane-header">
          <span class="tracker-lane-title">${lane.label}</span>
          <span class="tracker-lane-count">${total}</span>
        </div>
        ${sections}
      </section>
    `;
  }

  const laneApps = applications.filter((app) => lane.statuses.includes(normalizeApplicationStatus(app.status)));
  const cards = laneApps.length
    ? laneApps.map(renderTrackerCard).join('')
    : '<p class="empty-msg tracker-lane-empty">Nothing here yet.</p>';

  return `
    <section class="tracker-lane" data-status-target="${escAttr(lane.statuses[0])}">
      <div class="tracker-lane-header">
        <span class="tracker-lane-title">${lane.label}</span>
        <span class="tracker-lane-count">${laneApps.length}</span>
      </div>
      <div class="tracker-lane-cards" data-status-target="${escAttr(lane.statuses[0])}">${cards}</div>
    </section>
  `;
}

// ── Render card ─────────────────────────────────────────────────────────────

export function renderTrackerCard(app) {
  const expanded = expandedTrackerIds.has(app.id);
  const normalizedStatus = normalizeApplicationStatus(app.status);
  const summaryMeta = [
    app.location || 'Unknown',
    app.employment_type || 'Full-time',
    app.remote ? 'Remote' : 'On-site',
  ].filter(Boolean).join(' · ');
  const summaryNote = app.verdict || app.scorecard || (app.description ? 'Description cached' : 'Click to edit');
  const companyLabel = app.url
    ? `<a class="tracker-summary-title-link" href="${escAttr(app.url)}" target="_blank" rel="noopener">${esc(app.company || 'Unknown company')}</a>`
    : esc(app.company || 'Unknown company');

  return `
    <div class="tracker-card${expanded ? ' expanded' : ''}" draggable="true" data-id="${escAttr(app.id)}" data-status="${escAttr(normalizedStatus)}" data-sort-order="${escAttr(String(app.sort_order ?? ''))}">
      <div class="tracker-card-header">
        <div class="tracker-card-summary tracker-card-toggle" role="button" tabindex="0" aria-expanded="${expanded ? 'true' : 'false'}">
          <div class="tracker-summary-copy">
            <div class="tracker-summary-title">${companyLabel}</div>
            <div class="tracker-summary-role">${esc(app.title || 'Untitled role')}</div>
            <div class="tracker-summary-meta">${esc(summaryMeta)}</div>
            <div class="tracker-summary-salary${app.salary_range ? '' : ' hidden'}">${esc(app.salary_range || 'Pay range not saved yet')}</div>
          </div>
        </div>
        <div class="tracker-card-tools tracker-card-tools-right">
          <select class="tracker-status-select" data-field="status" data-status-tone="${escAttr(normalizedStatus)}" aria-label="Update application status">
            ${renderStatusOptions(app.status)}
          </select>
          <div class="tracker-card-note-right">${esc(summaryNote)}</div>
          <span class='tracker-card-date-label'>Date:</span>
          <span class='tracker-card-date'>${esc(formatDate(app.date))}</span>
        </div>
      </div>
      <div class="tracker-card-details">
        <div class="tracker-card-fields">
          <input data-field="company" type="text" value="${escAttr(app.company || '')}" placeholder="Company name" />
          <input data-field="title" type="text" value="${escAttr(app.title || '')}" placeholder="Role title" />
          <input data-field="location" type="text" value="${escAttr(app.location || 'Unknown')}" placeholder="Location" />
          <div class="inline-fields compact-fields">
            <select data-field="employment_type">
              ${renderEmploymentTypeOptions(app.employment_type)}
            </select>
            <label class="checkbox-row" style="margin-top:0">
              <input data-field="remote" type="checkbox" ${app.remote ? 'checked' : ''} />
              Remote
            </label>
            ${expanded ? `<label class="date-row" style="margin-left:10px;font-size:12px;">
              <span style="margin-right:4px;">Submission date</span>
              <input class="tracker-card-date-input" data-field="date" type="date" value="${escAttr(app.date ? formatDateInput(app.date) : '')}" aria-label="Edit submission date" />
            </label>` : ''}
          </div>
          <input data-field="salary_range" type="text" value="${escAttr(app.salary_range || '')}" placeholder="Salary range" />
          <input data-field="scorecard" type="text" value="${escAttr(app.scorecard || '')}" placeholder="Scorecard" />
          <input data-field="verdict" type="text" value="${escAttr(app.verdict || '')}" placeholder="Verdict / notes" />
          <textarea data-field="description" rows="4" placeholder="Stored job description / notes">${esc(app.description || app.jd_snippet || '')}</textarea>
        </div>
        <div class="tracker-card-actions">
          <span class="tracker-save-state">Auto-save on blur</span>
          <div class="tracker-card-action-buttons">
            <button class="btn btn-ghost btn-sm tracker-delete-btn" data-id="${escAttr(app.id)}">Delete</button>
            <button class="btn btn-secondary btn-sm tracker-save-btn" data-id="${escAttr(app.id)}">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Card summary sync ───────────────────────────────────────────────────────

export function syncTrackerCardSummary(card, patch = {}) {
  if (!card) return;

  const company = patch.company || 'Unknown company';
  const title = patch.title || 'Untitled role';
  const summaryMeta = [
    patch.location || 'Unknown',
    patch.employment_type || 'Full-time',
    patch.remote ? 'Remote' : 'On-site',
  ].filter(Boolean).join(' · ');
  const summaryNote = patch.verdict || patch.scorecard || (patch.description ? 'Description cached' : 'Click to edit');

  const statusSelect = card.querySelector('.tracker-card-header .tracker-status-select');
  if (statusSelect) {
    statusSelect.value = normalizeApplicationStatus(patch.status);
    statusSelect.dataset.statusTone = normalizeApplicationStatus(patch.status);
  }

  const titleEl = card.querySelector('.tracker-summary-title');
  if (titleEl) titleEl.textContent = company;
  const roleEl = card.querySelector('.tracker-summary-role');
  if (roleEl) roleEl.textContent = title;
  const metaEl = card.querySelector('.tracker-summary-meta');
  if (metaEl) metaEl.textContent = summaryMeta;
  const salaryEl = card.querySelector('.tracker-summary-salary');
  if (salaryEl) {
    salaryEl.textContent = patch.salary_range || 'Pay range not saved yet';
    salaryEl.classList.toggle('hidden', !String(patch.salary_range || '').trim());
  }
  const noteEl = card.querySelector('.tracker-card-note-right');
  if (noteEl) noteEl.textContent = summaryNote;
}
