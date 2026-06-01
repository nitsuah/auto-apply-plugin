// ai.js
// Handles AI settings, Gemini integration, and related UI logic

import { $, sendMessage } from '../../lib/utils.js';
import { showScreen } from '../ux/navigation.js';
import { setStatus } from '../ux/state.js';
import { $ } from '../../lib/utils.js';

/** Read only the settings fields that live on the AI panel. */
function readAiSettings() {
  return {
    gemini_api_key: $('api-key-input')?.value.trim() || '',
    gemini_model: $('gemini-model')?.value || 'auto',
    adzuna_app_id: $('adzuna-app-id')?.value.trim() || '',
    adzuna_app_key: $('adzuna-app-key')?.value.trim() || '',
    adzuna_country: $('adzuna-country')?.value || 'us',
    usajobs_email: $('usajobs-email')?.value.trim() || '',
    usajobs_api_key: $('usajobs-api-key')?.value.trim() || '',
    linkedin_client_id: $('linkedin-client-id')?.value.trim() || '',
    linkedin_client_secret: $('linkedin-client-secret')?.value.trim() || '',
  };
}

function getOauthRedirectUri() {
  try {
    return (typeof chrome !== 'undefined' && chrome.identity?.getRedirectURL)
      ? chrome.identity.getRedirectURL()
      : '';
  } catch {
    return '';
  }
}

async function connectLinkedIn() {
  const btn = $('connect-linkedin-btn');
  if (btn) btn.disabled = true;
  try {
    // Persist the latest Client ID/Secret so the service worker can read them.
    setStatus('linkedin-status', '⏳ Saving credentials…');
    await sendMessage({ type: 'SAVE_SETTINGS_ONLY', payload: { settings: readAiSettings() } });

    setStatus('linkedin-status', '⏳ Opening LinkedIn sign-in…');
    const resp = await sendMessage({ type: 'LINKEDIN_CONNECT' });
    if (!resp?.success) throw new Error(resp?.error || 'LinkedIn connect failed.');

    const profile = resp.profile || {};
    if (profile.full_name && $('profile-full-name')) $('profile-full-name').value = profile.full_name;
    if (profile.email && $('profile-email')) $('profile-email').value = profile.email;
    setStatus('linkedin-status', `✅ Imported ${profile.full_name || 'your profile'} — open Profile to review and Save.`, 'success');
  } catch (err) {
    setStatus('linkedin-status', '❌ ' + (err?.message || 'LinkedIn connect failed.'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Save AI settings via the background service worker.
 */
export async function handleSaveAiSettings() {
  try {
    const settings = readAiSettings();
    const resp = await sendMessage({
      type: 'SAVE_SETTINGS_ONLY',
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
  // Back button
  const aiBackBtn = $('ai-back-btn');
  if (aiBackBtn) aiBackBtn.onclick = () => showScreen('main');
  // Save AI settings
  const saveBtn = $('save-ai-settings-btn');
  if (saveBtn) saveBtn.onclick = handleSaveAiSettings;

  // LinkedIn OAuth — show the redirect URL to register, copy, and connect.
  const redirectEl = $('oauth-redirect-uri');
  if (redirectEl) {
    const uri = getOauthRedirectUri();
    redirectEl.textContent = uri || '(open in the installed extension to see this)';
  }
  $('copy-redirect-uri-btn')?.addEventListener('click', async () => {
    const uri = getOauthRedirectUri();
    if (!uri) return;
    try {
      await navigator.clipboard.writeText(uri);
      setStatus('linkedin-status', '✅ Redirect URL copied.', 'success');
    } catch {
      setStatus('linkedin-status', uri, '');
    }
  });
  $('connect-linkedin-btn')?.addEventListener('click', connectLinkedIn);
}
