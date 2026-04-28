// help.js
// Handles help, privacy, and reset logic

import { showScreen } from './navigation.js';

export function initHelpHandlers() {
  // Show Help panel when Help button clicked
  const helpBtn = document.getElementById('header-help-btn');
  if (helpBtn) helpBtn.onclick = () => showScreen('help');
  // Back button
  const helpBackBtn = document.getElementById('help-back-btn');
  if (helpBackBtn) helpBackBtn.onclick = () => showScreen('main');
}
