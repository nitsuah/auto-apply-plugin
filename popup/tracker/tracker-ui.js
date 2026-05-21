// tracker-ui.js
// Tracker board rendering: lanes, cards, sorting, filtering

import { $, esc, escAttr, sendMessage, formatDate, formatDateInput, formatSavedTimestamp, renderStatusOptions, renderEmploymentTypeOptions } from '../../lib/utils.js';
import { normalizeApplicationStatus } from '../../lib/tracker.js';
import { expandedTrackerIds, trackerViewState } from './tracker-state.js';
import { getTrackingStatusMeta, TRACKER_STATUS_ORDER } from './tracker-meta.js';

const selectedFinalStageBubbleIds = new Set();

const VERDICT_OPTIONS = [
  { value: 'strong_yes', label: 'Strong yes' },
  { value: 'lean_yes', label: 'Lean yes' },
  { value: 'neutral', label: 'Neutral / maybe' },
  { value: 'lean_no', label: 'Lean no' },
  { value: 'no', label: 'No, not a fit' },
  { value: 'research', label: 'Need more research' },
];

const USA_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida',
  'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine',
  'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska',
  'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas',
  'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia',
];

const NA_COUNTRIES = ['Canada', 'Mexico', 'Bermuda', 'Greenland', 'Bahamas', 'Costa Rica', 'Panama'];

// Re-export filterTrackerApplications from lib
export { filterApplicationsForQuery as filterTrackerApplications } from '../../lib/tracker.js';

// ── Sorting ─────────────────────────────────────────────────────────────────

export function sortTrackerApplications(applications = []) {
  return [...(applications || [])].sort((a, b) => {
    const aDate = parseSortableDate(a?.date);
    const bDate = parseSortableDate(b?.date);
    if (aDate !== bDate) {
      return bDate - aDate;
    }

    const aUpdated = parseSortableDateTime(a?.updated_at);
    const bUpdated = parseSortableDateTime(b?.updated_at);
    if (aUpdated !== bUpdated) {
      return bUpdated - aUpdated;
    }

    const aOrder = Number(a?.sort_order);
    const bOrder = Number(b?.sort_order);
    const hasA = Number.isFinite(aOrder);
    const hasB = Number.isFinite(bOrder);
    if (hasA || hasB) {
      return (hasB ? bOrder : Number.NEGATIVE_INFINITY) - (hasA ? aOrder : Number.NEGATIVE_INFINITY);
    }

    return String(b?.id || '').localeCompare(String(a?.id || ''));
  });
}

function parseSortableDate(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const ms = Date.parse(`${text}T00:00:00`);
  return Number.isFinite(ms) ? ms : 0;
}

function parseSortableDateTime(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : 0;
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

const SECTION_VISIBLE_CARD_COUNT = 4;
const expandedFinalStages = {
  rejected: false,
  retired: false,
};
const finalDockExpanded = {
  rejected: false,
  retired: false,
};

export function toggleFinalStageGroup(status) {
  const normalized = normalizeApplicationStatus(status);
  if (!Object.prototype.hasOwnProperty.call(expandedFinalStages, normalized)) return;
  expandedFinalStages[normalized] = !expandedFinalStages[normalized];
}

export function selectFinalStageBubble(id) {
  const value = String(id || '').trim();
  if (!value) return;
  selectedFinalStageBubbleIds.add(value);
}

export function toggleFinalStageBubbleSelection(id) {
  const value = String(id || '').trim();
  if (!value) return;
  if (selectedFinalStageBubbleIds.has(value)) {
    selectedFinalStageBubbleIds.delete(value);
    return;
  }
  selectedFinalStageBubbleIds.add(value);
}

export function clearFinalStageBubbleSelections() {
  selectedFinalStageBubbleIds.clear();
}

export function toggleFinalDockLane(status) {
  const normalized = normalizeApplicationStatus(status);
  if (!Object.prototype.hasOwnProperty.call(finalDockExpanded, normalized)) return;
  finalDockExpanded[normalized] = !finalDockExpanded[normalized];
}

export async function renderTracker() {
  const previousInline = $('tracker-status-inline');
  const previousInlineText = previousInline?.textContent || '';
  const previousInlineClass = previousInline?.className || 'tracker-status-inline';

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
    {
      key: 'early',
      label: '🟡 Drafts',
      groups: [
        { key: 'drafted', label: '🟡 Drafted', statuses: ['drafted'] },
        { key: 'pending', label: '⏳ Pending', statuses: ['pending'] },
      ],
    },
    { key: 'submitted', label: '✅ Submitted', statuses: ['submitted'] },
    {
      key: 'later',
      label: '📅 Later stages',
      groups: [
        { key: 'interview', label: '📅 Interview', statuses: ['interview'] },
        { key: 'offer', label: '🎉 Offer', statuses: ['offer'] },
      ],
    },
    { key: 'rejected', label: '❌ Rejected', statuses: ['rejected'], finalStage: true },
    { key: 'retired', label: '⬜ Retired', statuses: ['retired'], finalStage: true },
  ];

  const primaryLanes = lanes.filter((lane) => !lane.finalStage);
  const finalLanes = lanes.filter((lane) => lane.finalStage);

  tbody.innerHTML = `
    <div class="tracker-list-main">${primaryLanes.map((lane) => renderTrackerLane(filteredApps, lane)).join('')}</div>
    <div id="tracker-status-inline" class="tracker-status-inline tracker-status-inline-docked" role="status" aria-live="polite"></div>
    <div class="tracker-list-final-dock">${finalLanes.map((lane) => renderTrackerLane(filteredApps, lane)).join('')}</div>
  `;

  const inline = $('tracker-status-inline');
  if (inline) {
    inline.textContent = previousInlineText;
    const hasState = /\bsuccess\b|\berror\b/.test(previousInlineClass);
    inline.className = `tracker-status-inline tracker-status-inline-docked${hasState && /\bsuccess\b/.test(previousInlineClass) ? ' success' : ''}${hasState && /\berror\b/.test(previousInlineClass) ? ' error' : ''}`;
  }
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
      const laneApps = applications.filter((app) => group.statuses.includes(normalizeApplicationStatus(app.status)));
      const statusTone = group.statuses[0] || group.key;
      const cards = renderSectionCardsWithOverflow(laneApps, statusTone);
      return `
        <div class="tracker-lane-group" data-status-target="${escAttr(group.statuses[0])}">
          <div class="tracker-lane-subheader">
            <span class="tracker-lane-subtitle">${group.label}</span>
            <span class="tracker-lane-count">${laneApps.length}</span>
          </div>
          <div class="tracker-lane-cards" data-status-target="${escAttr(group.statuses[0])}">${cards}</div>
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
  const isFinalStageLane = lane.finalStage === true;
  if (isFinalStageLane) {
    const laneStatus = lane.statuses[0] || lane.key;
    const isExpandedDock = !!finalDockExpanded[laneStatus];
    const bubbles = laneApps.length
      ? laneApps.map((app) => renderFinalStageBubble(app)).join('') + renderFinalStageClearBubble()
      : '<p class="empty-msg tracker-lane-empty">Nothing here yet.</p>';

    const expandedCards = laneApps.filter((app) => selectedFinalStageBubbleIds.has(String(app.id || '')));
    const expandedMarkup = expandedCards.length
      ? `<div class="tracker-final-expanded">${expandedCards.map((app) => renderTrackerCard(app, { forceCollapsed: true })).join('')}</div>`
      : '';

    const hint = laneApps.length && isExpandedDock
      ? `<p class="tracker-final-hint">${expandedCards.length ? 'Select more bubbles to stack preview cards, or use Clear to reset.' : 'Click a bubble to open a read-only card preview.'}</p>`
      : '';

    return `
      <section class="tracker-lane tracker-lane-final tracker-lane-final-dock${isExpandedDock ? '' : ' is-collapsed'}" data-status-target="${escAttr(lane.statuses[0])}">
        <div class="tracker-lane-header">
          <span class="tracker-lane-title">${lane.label}</span>
          <div class="tracker-lane-header-actions">
            <span class="tracker-lane-count">${laneApps.length}</span>
            <button class="btn btn-ghost btn-xs tracker-final-dock-toggle" data-final-dock-toggle="${escAttr(laneStatus)}" type="button">${isExpandedDock ? 'Collapse' : 'Expand'}</button>
          </div>
        </div>
        <div class="tracker-final-bubble-list">${bubbles}</div>
        ${hint}
        ${isExpandedDock ? expandedMarkup : ''}
      </section>
    `;
  }
  const statusTone = lane.statuses[0] || lane.key;
  const cards = renderSectionCardsWithOverflow(laneApps, statusTone);

  return `
    <section class="tracker-lane${isFinalStageLane ? ` tracker-lane-final tracker-lane-final-${escAttr(statusTone)}` : ''}" data-status-target="${escAttr(lane.statuses[0])}">
      <div class="tracker-lane-header">
        <span class="tracker-lane-title">${lane.label}</span>
        <span class="tracker-lane-count">${laneApps.length}</span>
      </div>
      <div class="tracker-lane-cards" data-status-target="${escAttr(lane.statuses[0])}">${cards}</div>
    </section>
  `;
}

function renderSectionCardsWithOverflow(apps = [], statusTone = '') {
  if (!apps.length) {
    return '<p class="empty-msg tracker-lane-empty">Nothing here yet.</p>';
  }

  const visible = apps.slice(0, SECTION_VISIBLE_CARD_COUNT);
  const overflow = apps.slice(SECTION_VISIBLE_CARD_COUNT);
  const cards = visible.map(renderTrackerCard).join('');

  if (!overflow.length) {
    return cards;
  }

  const bubbles = overflow.map((app) => renderOverflowBubble(app, statusTone)).join('');
  return `${cards}<div class="tracker-overflow-bubbles">${bubbles}</div>`;
}

function renderOverflowBubble(app, statusTone = '') {
  const initial = getCompanyInitial(app.company);
  const title = `${String(app.company || 'Unknown company')} — ${String(app.title || 'Untitled role')}`;
  return `<span class="tracker-overflow-bubble" data-status-tone="${escAttr(statusTone)}" title="${escAttr(title)}" aria-label="Overflow card ${escAttr(title)}">${esc(initial)}</span>`;
}

// ── Render card ─────────────────────────────────────────────────────────────

export function renderTrackerCard(app, options = {}) {
  const forceCollapsed = options.forceCollapsed === true;
  const expanded = forceCollapsed ? false : expandedTrackerIds.has(app.id);
  const summaryToggleClass = forceCollapsed ? '' : ' tracker-card-toggle';
  const summaryRole = forceCollapsed ? '' : ' role="button" tabindex="0"';
  const normalizedStatus = normalizeApplicationStatus(app.status);
  const pay = resolvePayBand(app);
  const locationUi = getLocationUiState(app.location);
  const scoreUi = getScorecardUiState(app.scorecard);
  const summaryMeta = [
    app.location || 'Unknown',
    app.employment_type || 'Full-time',
    app.remote ? 'Remote' : 'On-site',
  ].filter(Boolean).join(' · ');
  const summaryNote = getVerdictLabel(app.verdict) || app.scorecard || (app.description ? 'Description cached' : 'Click to edit');
  const salaryText = formatPayDisplay(pay.min, pay.max, app.salary_range);
  const scoreDisplay = getScoreDisplay(app.scorecard);
  const companyLabel = app.url
    ? `<a class="tracker-summary-title-link" href="${escAttr(app.url)}" target="_blank" rel="noopener">${esc(app.company || 'Unknown company')}</a>`
    : esc(app.company || 'Unknown company');

  return `
    <div class="tracker-card${expanded ? ' expanded' : ''}" draggable="${expanded ? 'false' : 'true'}" data-id="${escAttr(app.id)}" data-status="${escAttr(normalizedStatus)}" data-sort-order="${escAttr(String(app.sort_order ?? ''))}">
      <div class="tracker-card-header">
        <div class="tracker-card-summary${summaryToggleClass}"${summaryRole} aria-expanded="${expanded ? 'true' : 'false'}">
          <div class="tracker-summary-copy">
            <div class="tracker-summary-title">${companyLabel}</div>
            <div class="tracker-summary-role">${esc(app.title || 'Untitled role')}</div>
            <div class="tracker-summary-meta">${esc(summaryMeta)}</div>
            <div class="tracker-summary-salary${salaryText ? '' : ' hidden'}">${esc(salaryText || 'Pay range not saved yet')}</div>
            <div class="tracker-summary-insights">
              <div class="tracker-summary-insight">
                <span class="tracker-summary-label">Sentiment</span>
                <span class="tracker-summary-value">${esc(getVerdictLabel(app.verdict) || 'Neutral / maybe')}</span>
              </div>
              <div class="tracker-summary-insight">
                <span class="tracker-summary-label">Score</span>
                ${scoreDisplay
                  ? `<span class="tracker-score-stars${scoreDisplay.isZero ? ' is-zero' : ''}" aria-label="Score ${escAttr(scoreDisplay.raw)}">${esc(scoreDisplay.stars)}</span><span class="tracker-score-raw${scoreDisplay.isZero ? ' is-zero' : ''}">${esc(scoreDisplay.raw)}</span>`
                  : `<span class="tracker-summary-value">${esc(app.scorecard || 'Not scored')}</span>`}
              </div>
            </div>
          </div>
        </div>
        <div class="tracker-card-tools tracker-card-tools-right">
          <select class="tracker-status-select" data-field="status" data-status-tone="${escAttr(normalizedStatus)}" aria-label="Update application status">
            ${renderStatusOptions(app.status)}
          </select>
          <div class="tracker-card-meta-row">
            <span class="tracker-card-date-label">Submitted:</span>
            <span class="tracker-card-date tracker-card-submitted">${esc(formatDate(app.date) || '—')}</span>
          </div>
          <div class="tracker-card-meta-row">
            <span class="tracker-card-date-label">Updated:</span>
            <span class="tracker-card-date tracker-card-updated">${esc(formatSavedTimestamp(app.updated_at) || '—')}</span>
          </div>
        </div>
      </div>
      <div class="tracker-card-details">
        <div class="tracker-card-fields">
          <div class="tracker-card-core-grid">
            <label class="tracker-field-label">
              <span>Company</span>
              <input class="tracker-field-company" data-field="company" type="text" value="${escAttr(app.company || '')}" placeholder="Company name" />
            </label>
            <label class="tracker-field-label">
              <span>Role</span>
              <input class="tracker-field-title" data-field="title" type="text" value="${escAttr(app.title || '')}" placeholder="Role title" />
            </label>
          </div>

          <div class="tracker-card-groups-grid">
            <div class="tracker-context-box">
              <div class="location-editor tracker-field-location">
                <select data-field="location_select" class="tracker-location-select" aria-label="Location">
                  ${renderLocationOptions(locationUi.selectValue)}
                </select>
                <input data-field="location_other" type="text" class="tracker-location-other${locationUi.selectValue === 'other' ? '' : ' hidden'}" value="${escAttr(locationUi.otherText)}" placeholder="Custom location" />
              </div>
              <div class="inline-fields compact-fields tracker-field-employment">
                <select data-field="employment_type">
                  ${renderEmploymentTypeOptions(app.employment_type)}
                </select>
                <label class="checkbox-row" style="margin-top:0">
                  <input data-field="remote" type="checkbox" ${app.remote ? 'checked' : ''} />
                  Remote
                </label>
              </div>
            </div>

            <div class="pay-editor tracker-score-pay">
              <div class="pay-editor-row">
                <label class="pay-label">Pay min</label>
                <input type="range" data-pay-range="min" min="0" max="500000" step="5000" value="${escAttr(String(pay.min || 0))}" />
                <input data-field="pay_min" type="number" min="0" step="5000" value="${escAttr(String(pay.min || ''))}" placeholder="0" />
              </div>
              <div class="pay-editor-row">
                <label class="pay-label">Pay max</label>
                <input type="range" data-pay-range="max" min="0" max="500000" step="5000" value="${escAttr(String(pay.max || Math.max(pay.min || 0, 0)))}" />
                <input data-field="pay_max" type="number" min="0" step="5000" value="${escAttr(String(pay.max || ''))}" placeholder="0" />
              </div>
            </div>

            <div class="tracker-score-verdict">
              <label class="tracker-field-label">
                <span>Sentiment</span>
                <select data-field="verdict" aria-label="Interest verdict">
                  ${renderVerdictOptions(app.verdict)}
                </select>
              </label>
              <label class="tracker-field-label">
                <span>Scorecard</span>
                <div class="tracker-scorecard-editor">
                  <select data-field="scorecard_select" aria-label="Scorecard stars">
                    ${renderScorecardOptions(scoreUi.selectValue)}
                  </select>
                  <input data-field="scorecard_other" type="text" class="tracker-scorecard-other${scoreUi.selectValue === 'other' ? '' : ' hidden'}" value="${escAttr(scoreUi.otherText)}" placeholder="Custom score text" />
                </div>
              </label>
              <label class="tracker-field-label">
                <span>Job URL</span>
                <input class="tracker-field-url" data-field="url" type="url" value="${escAttr(app.url || '')}" placeholder="Job URL" />
              </label>
            </div>

            <div class="tracker-date-box">
              <label class="tracker-date-editor-label">
                <span>Submitted date</span>
                <input class="tracker-card-date-input" data-field="date" type="date" value="${escAttr(app.date ? formatDateInput(app.date) : '')}" aria-label="Edit submission date" />
              </label>
              <label class="tracker-date-editor-label">
                <span>Last updated</span>
                <input type="text" value="${escAttr(formatSavedTimestamp(app.updated_at) || '—')}" readonly />
              </label>
            </div>
          </div>

          <textarea class="tracker-field-description" data-field="description" rows="4" placeholder="Stored job description / notes">${esc(app.description || app.jd_snippet || '')}</textarea>
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
  const summaryNote = getVerdictLabel(patch.verdict) || patch.scorecard || (patch.description ? 'Description cached' : 'Click to edit');

  const statusSelect = card.querySelector('.tracker-card-header .tracker-status-select');
  if (statusSelect) {
    statusSelect.value = normalizeApplicationStatus(patch.status);
    statusSelect.dataset.statusTone = normalizeApplicationStatus(patch.status);
  }

  const titleEl = card.querySelector('.tracker-summary-title');
  if (titleEl) {
    if (String(patch.url || '').trim()) {
      titleEl.innerHTML = `<a class="tracker-summary-title-link" href="${escAttr(String(patch.url || '').trim())}" target="_blank" rel="noopener">${esc(company)}</a>`;
    } else {
      titleEl.textContent = company;
    }
  }
  const roleEl = card.querySelector('.tracker-summary-role');
  if (roleEl) roleEl.textContent = title;
  const metaEl = card.querySelector('.tracker-summary-meta');
  if (metaEl) metaEl.textContent = summaryMeta;
  const salaryEl = card.querySelector('.tracker-summary-salary');
  const salaryText = formatPayDisplay(patch.pay_min, patch.pay_max, patch.salary_range);
  if (salaryEl) {
    salaryEl.textContent = salaryText || 'Pay range not saved yet';
    salaryEl.classList.toggle('hidden', !String(salaryText || '').trim());
  }
  const noteEl = card.querySelector('.tracker-card-note-right');
  if (noteEl) noteEl.textContent = summaryNote;

  const sentimentEl = card.querySelector('.tracker-summary-insight .tracker-summary-value');
  if (sentimentEl) sentimentEl.textContent = getVerdictLabel(patch.verdict) || 'Neutral / maybe';

  const scoreInsightEl = card.querySelector('.tracker-summary-insights .tracker-summary-insight:last-child');
  if (scoreInsightEl) {
    const scoreDisplay = getScoreDisplay(patch.scorecard);
    if (scoreDisplay) {
      scoreInsightEl.innerHTML = `<span class="tracker-summary-label">Score</span><span class="tracker-score-stars${scoreDisplay.isZero ? ' is-zero' : ''}" aria-label="Score ${escAttr(scoreDisplay.raw)}">${esc(scoreDisplay.stars)}</span><span class="tracker-score-raw${scoreDisplay.isZero ? ' is-zero' : ''}">${esc(scoreDisplay.raw)}</span>`;
    } else {
      scoreInsightEl.innerHTML = `<span class="tracker-summary-label">Score</span><span class="tracker-summary-value">${esc(patch.scorecard || 'Not scored')}</span>`;
    }
  }

  const submittedEl = card.querySelector('.tracker-card-submitted');
  if (submittedEl) submittedEl.textContent = formatDate(patch.date) || '—';

  const updatedEl = card.querySelector('.tracker-card-updated');
  if (updatedEl) updatedEl.textContent = formatSavedTimestamp(patch.updated_at) || '—';
}

function getVerdictLabel(value = '') {
  const normalized = String(value || '').trim();
  const match = VERDICT_OPTIONS.find((option) => option.value === normalized);
  return match ? match.label : normalized;
}

function getScoreDisplay(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const zeroText = /\bzero\b|\b0\s*stars?\b/i.test(raw);
  if (zeroText) {
    return { stars: '☆☆☆☆☆', raw: 'ZERO stars', isZero: true };
  }

  const ratioMatch = raw.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  let score = 0;
  let max = 0;

  if (ratioMatch) {
    score = Number(ratioMatch[1]);
    max = Number(ratioMatch[2]);
  } else {
    const numMatch = raw.match(/\d+(?:\.\d+)?/);
    if (!numMatch) return null;
    score = Number(numMatch[0]);
    max = score <= 5 ? 5 : 10;
  }

  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) {
    return null;
  }

  const normalized = Math.max(0, Math.min(5, Math.round((score / max) * 5)));
  const stars = '★'.repeat(normalized) + '☆'.repeat(Math.max(0, 5 - normalized));
  return {
    stars,
    raw: normalized === 0 ? 'ZERO stars' : raw,
    isZero: normalized === 0,
  };
}

function renderFinalStageBubble(app) {
  const initial = getCompanyInitial(app.company);
  const isExpanded = selectedFinalStageBubbleIds.has(String(app.id || ''));
  const title = `${String(app.company || 'Unknown company')} — ${String(app.title || 'Untitled role')}`;
  return `<button class="tracker-final-bubble${isExpanded ? ' is-expanded' : ''}" data-expand-card-id="${escAttr(app.id)}" title="${escAttr(title)}" aria-pressed="${isExpanded ? 'true' : 'false'}" type="button">${esc(initial)}</button>`;
}

function renderFinalStageClearBubble() {
  const hasSelections = selectedFinalStageBubbleIds.size > 0;
  return `<button class="tracker-final-bubble tracker-final-bubble-clear${hasSelections ? ' is-active' : ''}" data-clear-final-bubbles="true" title="Clear all expanded bubble previews" aria-label="Clear all bubble selections" type="button">×</button>`;
}

function getCompanyInitial(company = '') {
  const text = String(company || '').trim();
  if (!text) return '?';
  const first = text.match(/[A-Za-z0-9]/);
  return first ? first[0].toUpperCase() : '?';
}

function getScorecardUiState(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return { selectValue: '', otherText: '' };

  if (/\bzero\b|\b0\s*stars?\b/i.test(raw)) {
    return { selectValue: '0', otherText: '' };
  }

  const ratioMatch = raw.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (ratioMatch) {
    const score = Number(ratioMatch[1]);
    const max = Number(ratioMatch[2]);
    if (Number.isFinite(score) && Number.isFinite(max) && max > 0) {
      const stars = Math.max(0, Math.min(5, Math.round((score / max) * 5)));
      return { selectValue: String(stars), otherText: '' };
    }
  }

  const numericOnly = raw.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (numericOnly) {
    const score = Number(numericOnly[1]);
    if (Number.isFinite(score)) {
      const stars = Math.max(0, Math.min(5, Math.round(score)));
      return { selectValue: String(stars), otherText: '' };
    }
  }

  return { selectValue: 'other', otherText: raw };
}

function renderScorecardOptions(current = '') {
  const normalized = String(current || '');
  const options = [
    { value: '', label: 'Not scored' },
    { value: '5', label: '★★★★★ 5 stars' },
    { value: '4', label: '★★★★☆ 4 stars' },
    { value: '3', label: '★★★☆☆ 3 stars' },
    { value: '2', label: '★★☆☆☆ 2 stars' },
    { value: '1', label: '★☆☆☆☆ 1 star' },
    { value: '0', label: '☆☆☆☆☆ ZERO stars (red flag)' },
    { value: 'other', label: 'Other (custom text)' },
  ];
  return options.map((option) => {
    const selected = option.value === normalized ? ' selected' : '';
    return `<option value="${escAttr(option.value)}"${selected}>${esc(option.label)}</option>`;
  }).join('');
}

function renderVerdictOptions(current = '') {
  const normalized = String(current || '').trim();
  const hasKnown = VERDICT_OPTIONS.some((option) => option.value === normalized);
  return VERDICT_OPTIONS.map((option) => {
    const selected = option.value === (hasKnown ? normalized : 'neutral') ? ' selected' : '';
    return `<option value="${escAttr(option.value)}"${selected}>${esc(option.label)}</option>`;
  }).join('');
}

function resolvePayBand(app = {}) {
  const min = parsePayValue(app.pay_min);
  const max = parsePayValue(app.pay_max);
  if (min || max) {
    return {
      min: min || 0,
      max: max || Math.max(min || 0, 0),
    };
  }

  const parsed = parsePayBandFromText(app.salary_range);
  return {
    min: parsed.min || 0,
    max: parsed.max || 0,
  };
}

function parsePayValue(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : 0;
}

function parsePayBandFromText(text = '') {
  const numbers = String(text || '').match(/\d[\d,]*/g) || [];
  if (!numbers.length) return { min: 0, max: 0 };
  const parsed = numbers.map((value) => Number(String(value).replace(/,/g, ''))).filter((n) => Number.isFinite(n));
  if (!parsed.length) return { min: 0, max: 0 };
  if (parsed.length === 1) return { min: parsed[0], max: parsed[0] };
  return { min: Math.min(parsed[0], parsed[1]), max: Math.max(parsed[0], parsed[1]) };
}

function formatPayDisplay(min, max, fallback = '') {
  const safeMin = parsePayValue(min);
  const safeMax = parsePayValue(max);
  if (safeMin && safeMax) return `$${safeMin.toLocaleString()} - $${safeMax.toLocaleString()}`;
  if (safeMin) return `$${safeMin.toLocaleString()}`;
  if (safeMax) return `$${safeMax.toLocaleString()}`;
  const fallbackText = String(fallback || '').trim();
  return fallbackText;
}

function getLocationUiState(location = '') {
  const normalized = String(location || '').trim();
  if (!normalized) {
    return { selectValue: 'United States', otherText: '' };
  }

  if (normalized === 'United States' || USA_STATES.includes(normalized) || NA_COUNTRIES.includes(normalized)) {
    return { selectValue: normalized, otherText: '' };
  }

  return {
    selectValue: 'other',
    otherText: normalized,
  };
}

function renderLocationOptions(selectedValue = '') {
  const current = String(selectedValue || 'United States');
  const renderOption = (value, label = value) => {
    const selected = value === current ? ' selected' : '';
    return `<option value="${escAttr(value)}"${selected}>${esc(label)}</option>`;
  };

  const usOptions = USA_STATES.map((state) => renderOption(state)).join('');
  const naOptions = NA_COUNTRIES.map((country) => renderOption(country)).join('');

  return `
    ${renderOption('United States')}
    <optgroup label="USA states">${usOptions}</optgroup>
    <optgroup label="North America">${naOptions}</optgroup>
    ${renderOption('other', 'Other (custom)')}
  `;
}
