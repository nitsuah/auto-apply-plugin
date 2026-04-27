import {
  $, esc, escAttr, truncateText, setBadgeState, setStatusRowMeta
} from '../lib/utils.js';

import { showScreen } from './navigation.js';

async function trackerSendMessage(msg) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
  }
  return {};
}

function isStandaloneView() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('standalone') === '1';
}

function canOpenExpandedWorkspace() {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id && typeof window !== 'undefined' && window.location.protocol !== 'file:';
}

function buildExpandedWorkspaceUrl(screen, sectionId = '') {
  const url = new URL(chrome.runtime.getURL('popup/popup.html'));
  url.searchParams.set('screen', screen);
  url.searchParams.set('standalone', '1');
  if (sectionId) {
    url.searchParams.set('section', sectionId);
  }
  return url.toString();
}

async function openExpandedWorkspace(screen, sectionId = '') {
  if (!canOpenExpandedWorkspace()) return false;
  try {
    const url = buildExpandedWorkspaceUrl(screen, sectionId);
    const baseUrl = chrome.runtime.getURL('popup/popup.html');
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((tab) => {
      if (!tab?.id || !tab.url || !tab.url.startsWith(baseUrl)) return false;
      try {
        const tabUrl = new URL(tab.url);
        return tabUrl.searchParams.get('screen') === screen;
      } catch {
        return false;
      }
    });

    if (existing?.id) {
      await chrome.tabs.update(existing.id, { active: true, url });
      if (typeof existing.windowId === 'number') {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
    } else {
      await chrome.tabs.create({ url, active: true });
    }

    if (typeof window !== 'undefined') window.close();
    return true;
  } catch {
    return false;
  }
}

import { normalizeApplicationStatus } from '../lib/tracker.js';

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

export async function initTrackerHandlers() {
  $('view-tracker-btn')?.addEventListener('click', async () => {
    if (!isStandaloneView()) {
      const opened = await openExpandedWorkspace('tracker');
      if (opened) return;
    }

    await renderTracker();
    showScreen('tracker');
  });

  $('tracker-home-btn')?.addEventListener('click', async () => {
    await loadMainScreen();
  });

  $('add-application-btn')?.addEventListener('click', () => toggleTrackerAddForm());
  $('cancel-add-application-btn')?.addEventListener('click', () => toggleTrackerAddForm(false));
  $('import-current-job-btn')?.addEventListener('click', importCurrentPageIntoTrackerForm);
  $('save-new-application-btn')?.addEventListener('click', saveNewApplicationFromForm);
  $('import-csv-btn')?.addEventListener('click', () => $('import-csv-input')?.click());
  $('import-csv-input')?.addEventListener('change', importTrackerCsvFile);

  if ($('new-application-status')) {
    $('new-application-status').innerHTML = renderStatusOptions($('new-application-status').value || 'drafted');
  }

  $('tracker-search-input')?.addEventListener('input', async (event) => {
    trackerViewState.query = event.target.value || '';
    await renderTracker();
    showScreen('tracker');
  });
  $('tracker-scope-toggle')?.addEventListener('click', async () => {
    trackerViewState.activeOnly = !trackerViewState.activeOnly;
    await renderTracker();
    showScreen('tracker');
  });
  $('tracker-clear-filters-btn')?.addEventListener('click', async () => {
    trackerViewState.query = '';
    trackerViewState.activeOnly = false;
    if ($('tracker-search-input')) $('tracker-search-input').value = '';
    await renderTracker();
    showScreen('tracker');
  });

  $('export-csv-btn').addEventListener('click', async () => {
    const resp = await trackerSendMessage({ type: 'GET_STATE' });
    exportCsv(resp?.applications || []);
    setTrackerScreenStatus('G�� Exported the current tracker as CSV.', 'success');
  });

  $('tracker-body').addEventListener('dragstart', handleTrackerDragStart);
  $('tracker-body').addEventListener('dragover', handleTrackerDragOver);
  $('tracker-body').addEventListener('drop', handleTrackerDrop);
  $('tracker-body').addEventListener('dragend', handleTrackerDragEnd);

  $('tracker-body').addEventListener('click', async (event) => {
    if (event.target.closest('.tracker-summary-title-link')) {
      event.stopPropagation();
      return;
    }

    const toggleBtn = event.target.closest('.tracker-card-toggle');
    if (toggleBtn) {
      const card = toggleBtn.closest('.tracker-card');
      if (card) {
        const expanded = card.classList.toggle('expanded');
        toggleBtn.setAttribute('aria-expanded', String(expanded));
        const id = card.dataset.id;
        if (expanded) expandedTrackerIds.add(id);
        else expandedTrackerIds.delete(id);
      }
      return;
    }

    const deleteBtn = event.target.closest('.tracker-delete-btn');
    if (deleteBtn) {
      const card = deleteBtn.closest('.tracker-card');
      if (card) {
        await deleteTrackerCard(card);
      }
      return;
    }

    const saveBtn = event.target.closest('.tracker-save-btn');
    if (!saveBtn) return;

    const card = saveBtn.closest('.tracker-card');
    if (!card) return;
    await saveTrackerCard(card, { showMessage: true });
  });

  const autoSave = (event) => {
    const field = event.target.closest?.('[data-field]');
    if (!field) return;
    const card = field.closest('.tracker-card');
    if (!card) return;
    scheduleTrackerSave(card);
  };

  $('tracker-body').addEventListener('change', autoSave, true);
  $('tracker-body').addEventListener('focusout', autoSave, true);
}

function scheduleTrackerSave(card) {
  const id = card?.dataset?.id;
  if (!id) return;

  if (trackerSaveTimers.has(id)) {
    clearTimeout(trackerSaveTimers.get(id));
  }

  const timer = setTimeout(() => {
    saveTrackerCard(card, { showMessage: false }).catch((err) => {
      setStatus('fill-status', 'G�� ' + err.message, 'error');
    });
    trackerSaveTimers.delete(id);
  }, 250);

  trackerSaveTimers.set(id, timer);
}

async function saveTrackerCard(card, { showMessage = false } = {}) {
  const id = card?.dataset?.id;
  if (!id) return;

  const previousStatus = card.dataset.status || 'drafted';
  const saveBtn = card.querySelector('.tracker-save-btn');
  const saveState = card.querySelector('.tracker-save-state');
  let date = '';
  const dateInput = card.querySelector('input[data-field="date"]');
  if (dateInput) {
    date = dateInput.value;
  } else {
    const dateSpan = card.querySelector('span.tracker-card-date');
    if (dateSpan) {
      date = dateSpan.textContent;
    }
  }
  const patch = {
    company: card.querySelector('[data-field="company"]')?.value || '',
    title: card.querySelector('[data-field="title"]')?.value || '',
    status: card.querySelector('[data-field="status"]')?.value || 'drafted',
    location: card.querySelector('[data-field="location"]')?.value || 'Unknown',
    employment_type: card.querySelector('[data-field="employment_type"]')?.value || 'Full-time',
    remote: !!card.querySelector('[data-field="remote"]')?.checked,
    salary_range: card.querySelector('[data-field="salary_range"]')?.value || '',
    scorecard: card.querySelector('[data-field="scorecard"]')?.value || '',
    verdict: card.querySelector('[data-field="verdict"]')?.value || '',
    description: card.querySelector('[data-field="description"]')?.value || '',
    date: date || '',
  };

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'SavingGǪ';
  }
  if (saveState) {
    saveState.textContent = 'SavingGǪ';
    saveState.classList.remove('ok');
  }

  try {
    const resp = await trackerSendMessage({
      type: 'UPDATE_APPLICATION',
      payload: { id, patch },
    });

    if (!resp?.success) {
      throw new Error(resp?.error || 'Could not update tracker entry.');
    }

    card.classList.add('saved-flash');
    if (saveState) {
      saveState.textContent = showMessage ? 'G�� Saved' : 'G�� Auto-saved';
      saveState.classList.add('ok');
    }
    if (showMessage) {
      setStatus('fill-status', 'G�� Tracker entry updated.', 'success');
    }

    const nextStatus = normalizeApplicationStatus(patch.status);
    card.dataset.status = nextStatus;
    card.dataset.sortOrder = String(resp?.entry?.sort_order ?? card.dataset.sortOrder ?? '');
    syncTrackerCardSummary(card, patch);
    await loadMainScreen({ showMain: false });

    if (nextStatus !== normalizeApplicationStatus(previousStatus)) {
      await renderTracker();
      showScreen('tracker');
    }

    setTimeout(() => {
      card.classList.remove('saved-flash');
    }, 1200);
  } catch (err) {
    if (saveState) {
      saveState.textContent = 'Save failed';
      saveState.classList.remove('ok');
    }
    if (showMessage) {
      setStatus('fill-status', 'G�� ' + err.message, 'error');
    }
    throw err;
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  }
}

function syncTrackerCardSummary(card, patch = {}) {
  if (!card) return;

  const company = patch.company || 'Unknown company';
  const title = patch.title || 'Untitled role';
  const summaryMeta = [
    patch.location || 'Unknown',
    patch.employment_type || 'Full-time',
    patch.remote ? 'Remote' : 'On-site',
  ].filter(Boolean).join(' G�� ');
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
  const noteEl = card.querySelector('.tracker-summary-note');
  if (noteEl) noteEl.textContent = summaryNote;
}

function handleTrackerDragStart(event) {
  const card = event.target.closest('.tracker-card');
  if (!card) return;

  trackerDragState.id = card.dataset.id || '';
  trackerDragState.status = card.dataset.status || 'drafted';
  card.classList.add('dragging');

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', trackerDragState.id);
  }
}

function handleTrackerDragOver(event) {
  const dragging = $('tracker-body')?.querySelector('.tracker-card.dragging');
  const container = event.target.closest('.tracker-lane-cards');
  if (!dragging || !container) return;

  event.preventDefault();
  document.querySelectorAll('.tracker-lane-cards.drag-target').forEach((el) => el.classList.remove('drag-target'));
  container.classList.add('drag-target');

  const afterElement = getTrackerDragAfterElement(container, event.clientY);
  if (!afterElement) {
    container.appendChild(dragging);
  } else if (afterElement !== dragging) {
    container.insertBefore(dragging, afterElement);
  }
}

async function handleTrackerDrop(event) {
  const dragging = $('tracker-body')?.querySelector('.tracker-card.dragging');
  const container = event.target.closest('.tracker-lane-cards');
  if (!dragging || !container) return;

  event.preventDefault();
  const movedId = trackerDragState.id;
  const destinationStatus = container.dataset.statusTarget || dragging.dataset.status || 'drafted';

  try {
    await persistTrackerBoardOrder(movedId, destinationStatus);
  } catch (err) {
    setTrackerScreenStatus('G�� ' + err.message, 'error');
  } finally {
    clearTrackerDragState();
  }
}

function handleTrackerDragEnd() {
  clearTrackerDragState();
}

function clearTrackerDragState() {
  trackerDragState.id = '';
  trackerDragState.status = '';
  document.querySelectorAll('.tracker-card.dragging').forEach((card) => card.classList.remove('dragging'));
  document.querySelectorAll('.tracker-lane-cards.drag-target').forEach((lane) => lane.classList.remove('drag-target'));
}

function getTrackerDragAfterElement(container, y) {
  const draggableCards = [...container.querySelectorAll('.tracker-card:not(.dragging)')];
  return draggableCards.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

async function persistTrackerBoardOrder(movedId, destinationStatus) {
  const containers = [...document.querySelectorAll('#tracker-body .tracker-lane-cards')];
  const totalCards = containers.reduce((count, container) => {
    return count + container.querySelectorAll('.tracker-card').length;
  }, 0);

  let nextSortOrder = totalCards;
  const lanes = [
    { key: 'drafted', label: '=��� Drafted', statuses: ['drafted'] },
    { key: 'submitted', label: 'G�� Submitted', statuses: ['submitted'] },
    {
      key: 'later',
      label: '=��� Later stages',
      groups: [
        { key: 'interview', label: '=��� Interview', statuses: ['interview'] },
        { key: 'offer', label: '=��� Offer', statuses: ['offer'] },
      ],
    },
    {
      key: 'final',
      label: '=��� Final stage',
      groups: [
        { key: 'rejected', label: 'G�� Rejected', statuses: ['rejected'] },
        { key: 'filled', label: 'G�� Filled (Closed)', statuses: ['filled'] },
      ],
    },
  ];

  if (!updates.length) {
    return;
  }

  setTrackerScreenStatus('GŦ Updating board orderGǪ');
  const resp = await trackerSendMessage({
    type: 'REORDER_APPLICATIONS',
    payload: { updates },
  });

  if (!resp?.success) {
    throw new Error(resp?.error || 'Could not reorder the tracker board.');
  }

  await renderTracker();
  await loadMainScreen({ showMain: false });
  showScreen('tracker');

  const movedStatusMeta = getTrackingStatusMeta(destinationStatus);
  setTrackerScreenStatus(
    movedId
      ? `G�� Moved card to ${movedStatusMeta.label} G�� ${movedStatusMeta.optionHint}.`
      : 'G�� Tracker board order updated.',
    'success'
  );
}

function sortTrackerApplications(applications = []) {
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

async function renderTracker() {
  const resp = await trackerSendMessage({ type: 'GET_STATE' });
  const apps = sortTrackerApplications(resp?.applications || []);
  const filteredApps = filterTrackerApplications(apps, trackerViewState.query, { activeOnly: trackerViewState.activeOnly });
  const tbody = $('tracker-body');
  tbody.innerHTML = '';
  applyTrackerSummary(apps);

  if ($('tracker-search-input') && $('tracker-search-input').value !== trackerViewState.query) {
    $('tracker-search-input').value = trackerViewState.query;
  }
  syncTrackerFilterUi();

  if (filteredApps.length === 0) {
    $('tracker-empty').textContent = hasActiveTrackerFilters()
      ? 'No tracked applications match the current filters.'
      : 'No applications tracked yet.';
    $('tracker-empty').classList.remove('hidden');
    return;
  }
  $('tracker-empty').classList.add('hidden');

  const lanes = [
    { key: 'drafted', label: '=��� Drafted', statuses: ['drafted'] },
    { key: 'submitted', label: 'G�� Submitted', statuses: ['submitted'] },
    {
      key: 'later',
      label: '=��� Later stages',
      groups: [
        { key: 'interview', label: '=��� Interview', statuses: ['interview'] },
        { key: 'offer', label: '=��� Offer', statuses: ['offer'] },
      ],
    },
    {
      key: 'final',
      label: '=��� Final stage',
      groups: [
        { key: 'rejected', label: 'G�� Rejected', statuses: ['rejected'] },
        { key: 'filled', label: 'G�� Filled (Closed)', statuses: ['filled'] },
      ],
    },
  ];

  tbody.innerHTML = lanes.map((lane) => renderTrackerLane(filteredApps, lane)).join('');
}

function getTrackerLaneCount(applications, lane) {
  if (Array.isArray(lane.groups)) {
    return lane.groups.reduce((sum, group) => {
      return sum + applications.filter((app) => group.statuses.includes(normalizeApplicationStatus(app.status))).length;
    }, 0);
  }

  return applications.filter((app) => lane.statuses.includes(normalizeApplicationStatus(app.status))).length;
}

function renderTrackerLane(applications, lane) {
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

  const laneApps = applications
    .filter((app) => lane.statuses.includes(normalizeApplicationStatus(app.status)));

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

function toggleTrackerAddForm(forceOpen) {
  const card = $('tracker-add-card');
  if (!card) return;

  const shouldOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : card.classList.contains('hidden');

  card.classList.toggle('hidden', !shouldOpen);
  const addBtn = $('add-application-btn');
  if (addBtn) {
    addBtn.textContent = shouldOpen ? 'Close add form' : 'n+� Add manually';
  }

  if (!shouldOpen) {
    resetTrackerDraftForm();
    return;
  }

  // Always default status to drafted when opening add form
  if ($('new-application-status')) {
    $('new-application-status').value = 'drafted';
  }
  $('new-application-company')?.focus();
}

function resetTrackerDraftForm() {
  $('new-application-company').value = '';
  $('new-application-title').value = '';
  $('new-application-url').value = '';
  $('new-application-status').value = 'drafted';
  $('new-application-location').value = '';
  $('new-application-employment-type').value = 'Full-time';
  $('new-application-remote').checked = false;
  $('new-application-salary-range').value = '';
  $('new-application-description').value = '';
  setTrackerAddStatus('Paste a JD or import the current page, then save.');
}

function setTrackerAddStatus(msg, type = '') {
  const el = $('tracker-add-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
}

function setTrackerScreenStatus(msg, type = '') {
  const el = $('tracker-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
}

function syncTrackerFilterUi() {
  const toggle = $('tracker-scope-toggle');
  if (!toggle) return;

  toggle.textContent = trackerViewState.activeOnly ? 'Active' : 'All';
  toggle.classList.toggle('is-active', trackerViewState.activeOnly);
  toggle.setAttribute('aria-pressed', String(trackerViewState.activeOnly));
  toggle.title = trackerViewState.activeOnly
    ? 'Showing only active pipeline items.'
    : 'Showing every tracked application.';
}

function fillTrackerDraftForm(draft = {}) {
  $('new-application-company').value = draft.company || '';
  $('new-application-title').value = draft.title || '';
  $('new-application-url').value = draft.url || '';
  $('new-application-status').value = draft.status || 'drafted';
  $('new-application-location').value = draft.location || '';
  $('new-application-employment-type').value = draft.employment_type || 'Full-time';
  $('new-application-remote').checked = !!draft.remote;
  $('new-application-salary-range').value = draft.salary_range || '';
  $('new-application-description').value = draft.description || draft.jd || '';
}

function readTrackerDraftForm() {
  return {
    company: $('new-application-company').value.trim(),
    title: $('new-application-title').value.trim(),
    url: $('new-application-url').value.trim(),
    status: $('new-application-status').value || 'drafted',
    location: $('new-application-location').value.trim(),
    employment_type: $('new-application-employment-type').value || 'Full-time',
    remote: $('new-application-remote').checked,
    salary_range: $('new-application-salary-range').value.trim(),
    description: $('new-application-description').value.trim(),
  };
}

async function importCurrentPageIntoTrackerForm() {
  toggleTrackerAddForm(true);
  setTrackerAddStatus('GŦ Importing the current pageGǪ');

  try {
    const resp = await sendToActiveTab({ type: 'GET_JOB_INFO' });
    if (!resp?.success || !resp.job) {
      throw new Error(resp?.error || 'Could not read job details from the current page.');
    }

    fillTrackerDraftForm({
      ...resp.job,
      description: resp.job.jd || '',
    });
    setTrackerAddStatus('G�� Current page details imported.', 'success');
  } catch (err) {
    setTrackerAddStatus('G�� ' + err.message, 'error');
  }
}

async function saveNewApplicationFromForm() {
  const saveBtn = $('save-new-application-btn');
  const draft = readTrackerDraftForm();

  if (!draft.company && !draft.title) {
    setTrackerAddStatus('G��n+� Add at least a company or role title first.', 'error');
    return;
  }

  if (saveBtn) saveBtn.disabled = true;
  setTrackerAddStatus('GŦ Saving to trackerGǪ');

  try {
    let derived = {};
    if (draft.description) {
      const resp = await trackerSendMessage({
        type: 'PARSE_APPLICATION_DRAFT',
        payload: { text: draft.description, draft },
      });
      derived = resp?.details || {};
    }

    const payload = {
      ...derived,
      ...draft,
      location: draft.location || derived.location || 'Unknown',
      employment_type: draft.employment_type || derived.employment_type || 'Full-time',
      remote: draft.remote || derived.remote || false,
      salary_range: draft.salary_range || derived.salary_range || '',
      jd_snippet: draft.description.slice(0, 300),
      answers_generated: false,
      fill_report: null,
    };

    const resp = await trackerSendMessage({ type: 'LOG_APPLICATION', payload });
    if (!resp?.success) {
      throw new Error(resp?.error || 'Could not add that tracker entry.');
    }

    resetTrackerDraftForm();
    toggleTrackerAddForm(false);
    await renderTracker();
    await loadMainScreen({ showMain: false });
    showScreen('tracker');
    setStatus('fill-status', 'G�� Application added to the tracker.', 'success');
  } catch (err) {
    setTrackerAddStatus('G�� ' + err.message, 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function renderTrackerCard(app) {
  const expanded = expandedTrackerIds.has(app.id);
  const normalizedStatus = normalizeApplicationStatus(app.status);
  const summaryMeta = [
    app.location || 'Unknown',
    app.employment_type || 'Full-time',
    app.remote ? 'Remote' : 'On-site',
  ].filter(Boolean).join(' G�� ');
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

async function deleteTrackerCard(card) {
  const id = card?.dataset?.id;
  if (!id) return;

  const company = card.querySelector('.tracker-summary-title')?.textContent?.trim() || 'this application';
  const confirmed = confirm(`Delete ${company} from the tracker? This only removes the local tracker card.`);
  if (!confirmed) return;

  const resp = await trackerSendMessage({
    type: 'DELETE_APPLICATION',
    payload: { id },
  });

  if (!resp?.success) {
    throw new Error(resp?.error || 'Could not delete that tracker entry.');
  }

  expandedTrackerIds.delete(id);
  setTrackerScreenStatus('G�� Tracker entry deleted.', 'success');
  await renderTracker();
  await loadMainScreen({ showMain: false });
  showScreen('tracker');
}

function hasActiveTrackerFilters() {
  return !!String(trackerViewState.query || '').trim() || trackerViewState.activeOnly;
}

function filterTrackerApplications(applications = [], query = '', { activeOnly = false } = {}) {
  const tokens = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return (applications || []).filter((app) => {
    const status = normalizeApplicationStatus(app.status);
    // Active means NOT rejected/retired/filled
    if (activeOnly && ['rejected', 'retired', 'filled'].includes(status)) {
      return false;
    }

    if (!tokens.length) return true;

    const haystack = [
      app.company,
      app.title,
      app.location,
      app.employment_type,
      app.salary_range,
      app.scorecard,
      app.verdict,
      app.description,
      app.jd_snippet,
    ].join(' ').toLowerCase();

    return tokens.every((token) => haystack.includes(token));
  });
}

function exportCsv(applications) {
  const header = 'Company,Role Title,Status,Date,Employment Type,Remote,Location,Salary Range,Scorecard,Verdict,URL,Notes';
  const rows = applications.map((a) =>
    [
      a.company,
      a.title,
      a.status,
      a.date,
      a.employment_type,
      a.remote ? 'Yes' : 'No',
      a.location,
      a.salary_range,
      a.scorecard,
      a.verdict,
      a.url,
      a.description || a.jd_snippet || '',
    ]
      .map((v) => '"' + String(v || '').replace(/"/g, '""') + '"')
      .join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'apply-bot-tracker.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function importTrackerCsvFile(event) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;

  setTrackerScreenStatus('GŦ Importing applications from CSVGǪ');

  try {
    const text = await file.text();
    const resp = await trackerSendMessage({
      type: 'IMPORT_APPLICATIONS_CSV',
      payload: { text },
    });

    if (!resp?.success) {
      throw new Error(resp?.error || 'Could not import the tracker CSV.');
    }

    await renderTracker();
    await loadMainScreen({ showMain: false });
    showScreen('tracker');

    const imported = Number(resp.imported || 0);
    const skipped = Number(resp.skipped || 0);
    const suffix = skipped ? ` (${skipped} skipped)` : '';
    setTrackerScreenStatus(
      `G�� Imported ${imported} application${imported === 1 ? '' : 's'} from CSV${suffix}.`,
      'success'
    );
  } catch (err) {
    setTrackerScreenStatus('G�� ' + err.message, 'error');
  } finally {
    if (input) input.value = '';
  }
}


export function getTrackingStatusMeta(status) {
  const normalized = normalizeApplicationStatus(status);
  return {
    key: normalized,
    ...(TRACKER_STATUS_META[normalized] || TRACKER_STATUS_META.drafted),
  };
}