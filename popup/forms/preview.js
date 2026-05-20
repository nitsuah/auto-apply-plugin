// preview.js
// Handles preview screen logic and rendering

import { $, esc, escAttr, sendMessage, sendToActiveTab } from '../../lib/utils.js';
import { showScreen, bindReviewJumpHandlers } from '../ux/navigation.js';
import { setStatus } from '../ux/state.js';

export function initPreviewHandlers() {
  $('preview-back-btn')?.addEventListener('click', () => showScreen('main'));
  bindReviewJumpHandlers('preview-report-unresolved', 'fill-status');

  $('inject-from-preview-btn')?.addEventListener('click', async () => {
    const resp = await sendMessage({ type: 'GET_LAST_ANSWERS' });
    if (!resp?.answers) return;
    try {
      await sendToActiveTab({ type: 'INJECT_ANSWERS', payload: resp.answers });
    } catch (err) {
      // tab may not have content script
    }
  });
}

/**
 * Render the answer preview screen from a set of answers and a fill report.
 */
export function renderPreview(answers, report) {
  const content = $('preview-content');
  if (!content) return;

  if (!answers || !Object.keys(answers).length) {
    content.innerHTML = '<p class="empty-msg">Generate answers first by clicking "Fill Form".</p>';
    renderPreviewReport(null);
    return;
  }

  const entries = Object.entries(answers);
  content.innerHTML = entries.map(([label, value]) => `
    <div class="preview-item">
      <div class="preview-label">${esc(label)}</div>
      <div class="preview-value">${esc(String(value || ''))}</div>
    </div>
  `).join('');

  renderPreviewReport(report);
}

function renderPreviewReport(report) {
  const card = $('preview-report-card');
  if (!card) return;

  if (!report || !Array.isArray(report.unresolved) || !report.unresolved.length) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  const summary = $('preview-report-summary');
  if (summary) {
    summary.textContent = `${report.unresolved.length} field${report.unresolved.length === 1 ? '' : 's'} may need manual review.`;
  }

  const list = $('preview-report-unresolved');
  if (list) {
    list.innerHTML = report.unresolved.map(item => {
      const label = typeof item === 'string' ? item : (item.label || item.question || item.field || 'Unknown field');
      const reason = typeof item === 'object' ? (item.reason || '') : '';
      const payload = encodeURIComponent(JSON.stringify(item));
      return `<li>
        <button class="btn btn-ghost btn-xs review-jump-btn" data-payload="${escAttr(payload)}">${esc(label)}</button>
        ${reason ? `<span class="review-reason">${esc(reason)}</span>` : ''}
      </li>`;
    }).join('');
  }
}

/**
 * Render the fill report card on the main screen.
 */
export function renderFillReport(report) {
  const card = $('fill-report-card');
  if (!card) return;

  if (!report || (!Array.isArray(report.unresolved) || !report.unresolved.length)) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  const summary = $('fill-report-summary');
  if (summary) {
    const parts = [
      report.filled ? `${report.filled} filled` : '',
      report.preserved ? `${report.preserved} kept` : '',
      report.unresolved.length ? `${report.unresolved.length} to review` : '',
    ].filter(Boolean).join(' • ');
    summary.textContent = parts || 'Review completed.';
  }

  const list = $('fill-report-unresolved');
  if (list) {
    list.innerHTML = report.unresolved.map(item => {
      const label = typeof item === 'string' ? item : (item.label || item.question || item.field || 'Unknown field');
      const reason = typeof item === 'object' ? (item.reason || '') : '';
      const payload = encodeURIComponent(JSON.stringify(item));
      return `<li>
        <button class="btn btn-ghost btn-xs review-jump-btn" data-payload="${escAttr(payload)}">${esc(label)}</button>
        ${reason ? `<span class="review-reason">${esc(reason)}</span>` : ''}
      </li>`;
    }).join('');

    bindReviewJumpHandlers('fill-report-unresolved', 'fill-status');
  }
}
