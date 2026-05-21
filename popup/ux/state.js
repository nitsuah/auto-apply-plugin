// state.js
// Handles state loading, syncing, and badge/status helpers

import { $, setBadgeState, setStatusRowMeta } from '../../lib/utils.js';

const DEFAULT_RESUME_DROP_LABEL = '📄 Drop PDF / DOCX / TXT here or click to browse';

function setStatus(elId, msg, type = '') {
  const el = $(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
}

function setResumeDropLabel(fileName = '') {
  const dropLabel = $('file-drop-label');
  if (!dropLabel) return;
  dropLabel.textContent = fileName ? `📄 ${fileName}` : DEFAULT_RESUME_DROP_LABEL;
}

function setElementsDisabled(container, disabled) {
  if (!container) return;
  container.querySelectorAll('input, textarea, select, button').forEach((el) => {
    el.disabled = disabled;
  });
}

export {
  DEFAULT_RESUME_DROP_LABEL,
  setStatus,
  setResumeDropLabel,
  setElementsDisabled,
  setBadgeState,
  setStatusRowMeta,
};