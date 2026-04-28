// preview.js
// Handles preview screen logic and rendering

import { showScreen } from '../ux/navigation.js';
import { bindReviewJumpHandlers } from '../ux/navigation.js';

export function initPreviewHandlers() {
  const backBtn = document.getElementById('preview-back-btn');
  if (backBtn) backBtn.onclick = () => showScreen('main');
  bindReviewJumpHandlers('preview-report-unresolved', 'fill-status');

  const injectBtn = document.getElementById('inject-from-preview-btn');
  if (injectBtn) injectBtn.onclick = async () => {
    const resp = await sendMessage({ type: 'GET_LAST_ANSWERS' });
    if (!resp?.answers) return;
    try {
      await sendToActiveTab({ type: 'INJECT_ANSWERS', payload: resp.answers });
    } catch (err) {
      // tab may not have content script
    }
  };
}

export function renderPreview(answers, report) {
  // ...implementation from popup.js or stub...
}

export function renderFillReport(report) {
  // ...implementation from popup.js or stub...
}

