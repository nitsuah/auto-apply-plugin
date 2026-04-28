// preview.js
// Handles preview screen logic and rendering

export function initPreviewHandlers() {
  $('preview-back-btn').addEventListener('click', () => showScreen('main'));
  bindReviewJumpHandlers('preview-report-unresolved', 'fill-status');

  $('inject-from-preview-btn').addEventListener('click', async () => {
    const resp = await sendMessage({ type: 'GET_LAST_ANSWERS' });
    if (!resp?.answers) return;
    try {
      await sendToActiveTab({ type: 'INJECT_ANSWERS', payload: resp.answers });
    } catch (err) {
      // tab may not have content script
    }
  });
}

export function renderPreview(answers, report) {
  // ...implementation from popup.js or stub...
}

export function renderFillReport(report) {
  // ...implementation from popup.js or stub...
}

