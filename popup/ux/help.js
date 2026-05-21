// help.js
// Handles help, privacy, and reset logic

import { $, sendMessage } from '../../lib/utils.js';
import { showScreen } from './navigation.js';
import { setStatus } from './state.js';

export function initHelpHandlers() {
  // Back button
  const helpBackBtn = $('help-back-btn');
  if (helpBackBtn) helpBackBtn.onclick = () => showScreen('main');

  // Review privacy settings -> go to setup/profile
  $('open-privacy-setup-btn')?.addEventListener('click', () => {
    showScreen('setup');
  });

  // Clear temp cache
  $('clear-cache-btn')?.addEventListener('click', async () => {
    try {
      const resp = await sendMessage({ type: 'CLEAR_TEMP_DATA' });
      if (resp?.success) {
        setStatus('help-status', '✅ Temporary cache cleared.', 'success');
      } else {
        setStatus('help-status', '❌ ' + (resp?.error || 'Could not clear cache.'), 'error');
      }
    } catch (err) {
      setStatus('help-status', '❌ ' + err.message, 'error');
    }
  });

  // Delete all local data
  $('reset-data-btn')?.addEventListener('click', async () => {
    const confirmed = confirm('Delete ALL local extension data? This cannot be undone.');
    if (!confirmed) return;
    try {
      const resp = await sendMessage({ type: 'RESET_ALL_DATA' });
      if (resp?.success) {
        setStatus('help-status', '✅ All local data has been deleted. Reload to start fresh.', 'success');
      } else {
        setStatus('help-status', '❌ ' + (resp?.error || 'Could not reset data.'), 'error');
      }
    } catch (err) {
      setStatus('help-status', '❌ ' + err.message, 'error');
    }
  });
}
