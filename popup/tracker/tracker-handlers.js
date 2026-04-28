// tracker-handlers.js
// Tracker event handler functions


import { trackerDragState, trackerViewState, trackerSaveTimers, expandedTrackerIds } from './tracker-state.js';
import { renderTracker } from './tracker-ui.js';
import { exportCsv, importTrackerCsvFile } from './tracker-csv.js';
import { showScreen } from '../ux/navigation.js';

// Helper for status messages
function setTrackerScreenStatus(msg, type = '') {
  const el = document.getElementById('tracker-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
}

export function initTrackerHandlers() {
  const $ = (id) => document.getElementById(id);

  $('view-tracker-btn')?.addEventListener('click', async () => {
    await renderTracker();
    showScreen('tracker');
  });

  $('tracker-home-btn')?.addEventListener('click', async () => {
    showScreen('main');
  });

  $('add-application-btn')?.addEventListener('click', () => toggleTrackerAddForm());
  $('cancel-add-application-btn')?.addEventListener('click', () => toggleTrackerAddForm(false));
  $('import-csv-btn')?.addEventListener('click', () => $('import-csv-input')?.click());
  $('import-csv-input')?.addEventListener('change', importTrackerCsvFile);

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

  $('export-csv-btn')?.addEventListener('click', async () => {
    // Assume getApplications is globally available or imported
    const resp = await window.trackerSendMessage?.({ type: 'GET_STATE' });
    exportCsv(resp?.applications || []);
    setTrackerScreenStatus('✅ Exported the current tracker as CSV.', 'success');
  });

  $('tracker-body')?.addEventListener('dragstart', handleTrackerDragStart);
  $('tracker-body')?.addEventListener('dragover', handleTrackerDragOver);
  $('tracker-body')?.addEventListener('drop', handleTrackerDrop);
  $('tracker-body')?.addEventListener('dragend', handleTrackerDragEnd);

  $('tracker-body')?.addEventListener('click', async (event) => {
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
    // ...add delete/save/expand logic as needed...
  });

  // ...add more event listeners as needed...
}

export function handleTrackerDragStart(event) {
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

export function handleTrackerDragOver(event) {
  const dragging = document.querySelector('.tracker-card.dragging');
  const container = event.target.closest('.tracker-lane-cards');
  if (!dragging || !container) return;
  event.preventDefault();
  document.querySelectorAll('.tracker-lane-cards.drag-target').forEach((el) => el.classList.remove('drag-target'));
  container.classList.add('drag-target');
  // ...add logic for drag position if needed...
}

export async function handleTrackerDrop(event) {
  const dragging = document.querySelector('.tracker-card.dragging');
  const container = event.target.closest('.tracker-lane-cards');
  if (!dragging || !container) return;
  event.preventDefault();
  // ...persist order logic...
  // ...call renderTracker and showScreen('tracker') as needed...
  trackerDragState.id = '';
  trackerDragState.status = '';
  document.querySelectorAll('.tracker-card.dragging').forEach((card) => card.classList.remove('dragging'));
  document.querySelectorAll('.tracker-lane-cards.drag-target').forEach((lane) => lane.classList.remove('drag-target'));
}

export function handleTrackerDragEnd() {
  trackerDragState.id = '';
  trackerDragState.status = '';
  document.querySelectorAll('.tracker-card.dragging').forEach((card) => card.classList.remove('dragging'));
  document.querySelectorAll('.tracker-lane-cards.drag-target').forEach((lane) => lane.classList.remove('drag-target'));
}

// Add more event handler functions as needed (save, delete, expand, etc)
