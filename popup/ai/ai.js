// ai.js
// Handles AI settings, Gemini integration, and related UI logic

import { showScreen } from '../ux/navigation.js';

/**
 * Save AI settings from the AI panel form.
 */
export function handleSaveAiSettings() {
  const apiKey = document.getElementById('api-key-input')?.value || '';
  const model = document.getElementById('gemini-model')?.value || '';
  // Save to local storage (simulate)
  window.localStorage.setItem('gemini_api_key', apiKey);
  window.localStorage.setItem('gemini_model', model);
  document.getElementById('ai-status').textContent = '✅ AI settings saved!';
}

/**
 * Initialize all AI panel event handlers and UI logic.
 */
export function initAiHandlers() {
  // Show AI panel when AI button clicked
  const aiBtn = document.getElementById('header-ai-btn');
  if (aiBtn) aiBtn.onclick = () => showScreen('ai');
  // Back button
  const aiBackBtn = document.getElementById('ai-back-btn');
  if (aiBackBtn) aiBackBtn.onclick = () => showScreen('main');
  // Save AI settings
  const saveBtn = document.getElementById('save-ai-settings-btn');
  if (saveBtn) saveBtn.onclick = handleSaveAiSettings;
}
