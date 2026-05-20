// ai.js
// Handles AI settings, Gemini integration, and related UI logic

import { $, sendMessage } from '../../lib/utils.js';
import { showScreen } from '../ux/navigation.js';
import { setStatus } from '../ux/state.js';
import { readSettingsForm } from '../forms/forms.js';

/**
 * Save AI settings via the background service worker.
 */
export async function handleSaveAiSettings() {
  try {
    const settings = readSettingsForm();
    const resp = await sendMessage({
      type: 'SAVE_SETUP',
      payload: { settings },
    });
    if (!resp?.success) throw new Error(resp?.error || 'Failed to save AI settings.');
    setStatus('ai-status', '✅ AI settings saved!', 'success');
  } catch (err) {
    setStatus('ai-status', '❌ ' + (err.message || 'Failed to save AI settings.'), 'error');
  }
}

/**
 * Initialize all AI panel event handlers and UI logic.
 */
export function initAiHandlers() {
  // Show AI panel when AI button clicked
  const aiBtn = $('header-ai-btn');
  if (aiBtn) aiBtn.onclick = () => showScreen('ai');
  // Back button
  const aiBackBtn = $('ai-back-btn');
  if (aiBackBtn) aiBackBtn.onclick = () => showScreen('main');
  // Save AI settings
  const saveBtn = $('save-ai-settings-btn');
  if (saveBtn) saveBtn.onclick = handleSaveAiSettings;
}
