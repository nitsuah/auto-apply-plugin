// memory.js
// Handles learned defaults, memory, and related UI logic

import { $, esc, escAttr, sendMessage, isSensitiveMemoryQuestion } from '../../lib/utils.js';
import { setStatus } from '../ux/state.js';

/**
 * Fetch and render learned defaults (memory) UI.
 * Splits items into regular vs sensitive lists and renders both.
 */
export async function renderLearnedDefaults() {
  const resp = await sendMessage({ type: 'GET_LEARNED_DEFAULTS' });
  const allMemory = resp?.memory || [];
  const allIgnored = resp?.ignored || [];

  // Split regular vs sensitive
  const regularMemory = allMemory.filter(item => !isSensitiveMemoryQuestion(item.question));
  const sensitiveMemory = allMemory.filter(item => isSensitiveMemoryQuestion(item.question));

  // Main memory list — matches HTML id="learned-defaults-list"
  const container = $('learned-defaults-list');
  if (container) renderMemoryGroup(container, regularMemory, 'No memory saved yet.');

  // Ignored memory list — matches HTML id="ignored-memory-list"
  const ignoredContainer = $('ignored-memory-list');
  if (ignoredContainer) renderIgnoredMemoryGroup(ignoredContainer, allIgnored, 'No ignored memory right now.');

  // Sensitive memory list — matches HTML id="sensitive-memory-list"
  const sensitiveContainer = $('sensitive-memory-list');
  if (sensitiveContainer) renderMemoryGroup(sensitiveContainer, sensitiveMemory, 'No sensitive memory saved.');

  // Update badge counts
  const countBadge = $('memory-count-badge');
  if (countBadge) countBadge.textContent = `${allMemory.length} saved`;
  const ignoredCountBadge = $('ignored-memory-count');
  if (ignoredCountBadge) ignoredCountBadge.textContent = `${allIgnored.length} ignored`;
  const sensitiveCountBadge = $('sensitive-memory-count');
  if (sensitiveCountBadge) sensitiveCountBadge.textContent = `${sensitiveMemory.length} guarded`;
}

/**
 * Render a group of memory items with edit/ignore/delete actions.
 */
export function renderMemoryGroup(container, items, emptyMessage) {
  if (!items.length) {
    container.innerHTML = `<p class="empty-msg">${esc(emptyMessage)}</p>`;
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="memory-item" data-memory-id="${escAttr(item.id)}">
      <div class="memory-q">${esc(item.question)}</div>
      <div class="memory-a">${esc(item.answer)}</div>
      <div class="memory-actions">
        <button class="btn btn-ghost btn-xs memory-edit-btn" data-id="${escAttr(item.id)}" data-question="${escAttr(item.question)}">Edit</button>
        <button class="btn btn-ghost btn-xs memory-ignore-btn" data-id="${escAttr(item.id)}">Ignore</button>
        <button class="btn btn-ghost btn-xs memory-delete-btn" data-id="${escAttr(item.id)}">Delete</button>
      </div>
    </div>
  `).join('');
}

/**
 * Render a group of ignored memory items with restore/delete actions.
 */
export function renderIgnoredMemoryGroup(container, items, emptyMessage) {
  if (!items.length) {
    container.innerHTML = `<p class="empty-msg">${esc(emptyMessage)}</p>`;
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="memory-item ignored" data-memory-id="${escAttr(item.id)}">
      <div class="memory-q">${esc(item.question)}</div>
      <div class="memory-actions">
        <button class="btn btn-ghost btn-xs memory-restore-btn" data-id="${escAttr(item.id)}">Restore</button>
        <button class="btn btn-ghost btn-xs memory-delete-btn" data-id="${escAttr(item.id)}">Delete</button>
      </div>
    </div>
  `).join('');
}

/**
 * Initialize memory list event handlers (edit, ignore, delete, restore).
 */
export function initMemoryHandlers() {
  // Delegated handlers for regular + sensitive memory lists
  const handleMemoryClick = async (event) => {
    const editBtn = event.target.closest('.memory-edit-btn');
    const ignoreBtn = event.target.closest('.memory-ignore-btn');
    const deleteBtn = event.target.closest('.memory-delete-btn');
    const restoreBtn = event.target.closest('.memory-restore-btn');

    if (editBtn) {
      const id = editBtn.dataset.id;
      const question = editBtn.dataset.question || 'Answer';
      const currentAnswer = editBtn.closest('.memory-item')?.querySelector('.memory-a')?.textContent || '';
      const newAnswer = prompt(`Edit your answer for:\n"${question}"`, currentAnswer);
      if (newAnswer !== null && newAnswer.trim()) {
        await editLearnedDefault(id, newAnswer.trim());
        await renderLearnedDefaults();
      }
      return;
    }

    if (ignoreBtn) {
      const id = ignoreBtn.dataset.id;
      await ignoreLearnedDefault(id);
      await renderLearnedDefaults();
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const item = deleteBtn.closest('.memory-item');
      const isIgnored = item?.classList.contains('ignored');
      if (isIgnored) {
        await deleteIgnoredLearnedDefault(id);
      } else {
        await deleteLearnedDefault(id);
      }
      await renderLearnedDefaults();
      return;
    }

    if (restoreBtn) {
      const id = restoreBtn.dataset.id;
      await restoreIgnoredLearnedDefault(id);
      await renderLearnedDefaults();
      return;
    }
  };

  // Bind to all memory list containers
  $('learned-defaults-list')?.addEventListener('click', handleMemoryClick);
  $('ignored-memory-list')?.addEventListener('click', handleMemoryClick);
  $('sensitive-memory-list')?.addEventListener('click', handleMemoryClick);
}

// CRUD functions for memory actions
export async function addLearnedDefault(question, answer) {
  return sendMessage({ type: 'UPDATE_LEARNED_DEFAULT', payload: { question, answer } });
}
export async function editLearnedDefault(id, answer) {
  return sendMessage({ type: 'UPDATE_LEARNED_DEFAULT', payload: { id, answer } });
}
export async function ignoreLearnedDefault(id) {
  return sendMessage({ type: 'IGNORE_LEARNED_DEFAULT', payload: { id } });
}
export async function deleteLearnedDefault(id) {
  return sendMessage({ type: 'DELETE_LEARNED_DEFAULT', payload: { id } });
}
export async function restoreIgnoredLearnedDefault(id) {
  return sendMessage({ type: 'DELETE_IGNORED_LEARNED_DEFAULT', payload: { id } });
}
export async function deleteIgnoredLearnedDefault(id) {
  return sendMessage({ type: 'DELETE_IGNORED_LEARNED_DEFAULT', payload: { id } });
}
