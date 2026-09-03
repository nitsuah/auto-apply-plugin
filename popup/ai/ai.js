// ai.js
// Handles AI settings, Gemini integration, and related UI logic

import { $, sendMessage } from '../../lib/utils.js';
import { showScreen } from '../ux/navigation.js';
import { setStatus } from '../ux/state.js';

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
    reed_api_key: $('reed-api-key')?.value.trim() || '',
    jooble_api_key: $('jooble-api-key')?.value.trim() || '',
    linkedin_client_id: $('linkedin-client-id')?.value.trim() || '',
    linkedin_client_secret: $('linkedin-client-secret')?.value.trim() || '',
    google_client_id: $('google-client-id')?.value.trim() || '',
    google_client_secret: $('google-client-secret')?.value.trim() || '',
    custom_job_sources: customJobSources.slice(),
  };
}

// ── Custom job sources (user-configured RSS boards) ─────────────────────────

let customJobSources = [];

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'source';
}

/**
 * Render the saved custom job sources as a removable list. Also used to
 * hydrate the in-memory list from stored settings on load.
 * @param {Array<{id:string,label:string,url:string}>} sources
 */
export function renderCustomJobSourcesList(sources = []) {
  customJobSources = Array.isArray(sources) ? sources.slice() : [];
  const list = $('custom-job-sources-list');
  if (!list) return;
  list.innerHTML = customJobSources.map((s) => `
    <li class="custom-source-item" data-id="${escAttr(s.id)}">
      <span class="custom-source-item-label">${escHtml(s.label)}</span>
      <span class="custom-source-item-url">${escHtml(s.url)}</span>
      <button type="button" class="btn btn-ghost btn-xs custom-source-remove-btn" data-remove-id="${escAttr(s.id)}" aria-label="Remove ${escHtml(s.label)}">✕</button>
    </li>
  `).join('');
}

function escHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escAttr(value) {
  return escHtml(value);
}

async function persistCustomJobSources() {
  await sendMessage({ type: 'SAVE_SETTINGS_ONLY', payload: { settings: { custom_job_sources: customJobSources } } });
}

async function addCustomJobSource() {
  const nameInput = $('custom-source-name');
  const urlInput = $('custom-source-url');
  const name = nameInput?.value.trim() || '';
  const url = urlInput?.value.trim() || '';
  if (!name || !url) {
    setStatus('custom-source-status', '❌ Enter both a name and an RSS feed URL.', 'error');
    return;
  }

  let origin;
  try {
    origin = `${new URL(url).origin}/*`;
  } catch {
    setStatus('custom-source-status', '❌ That doesn’t look like a valid URL.', 'error');
    return;
  }

  try {
    const granted = typeof chrome !== 'undefined' && chrome.permissions
      ? await chrome.permissions.request({ origins: [origin] })
      : true;
    if (!granted) {
      setStatus('custom-source-status', '❌ Permission denied — the extension needs access to this site to fetch its feed.', 'error');
      return;
    }
  } catch (err) {
    setStatus('custom-source-status', '❌ ' + (err?.message || 'Could not request site permission.'), 'error');
    return;
  }

  const id = `custom-${slugify(name)}-${Date.now().toString(36)}`;
  customJobSources.push({ id, label: name, url });
  try {
    await persistCustomJobSources();
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
    renderCustomJobSourcesList(customJobSources);
    setStatus('custom-source-status', `✅ Added "${name}".`, 'success');
  } catch (err) {
    customJobSources.pop();
    setStatus('custom-source-status', '❌ ' + (err?.message || 'Failed to save custom source.'), 'error');
  }
}

async function removeCustomJobSource(id) {
  const next = customJobSources.filter((s) => s.id !== id);
  const removed = customJobSources.find((s) => s.id === id);
  customJobSources = next;
  try {
    await persistCustomJobSources();
    renderCustomJobSourcesList(customJobSources);
    setStatus('custom-source-status', `Removed "${removed?.label || id}".`, '');
  } catch (err) {
    setStatus('custom-source-status', '❌ ' + (err?.message || 'Failed to remove custom source.'), 'error');
  }
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

async function connectGoogle() {
  const btn = $('connect-google-btn');
  if (btn) btn.disabled = true;
  try {
    setStatus('google-status', '⏳ Saving credentials…');
    await sendMessage({ type: 'SAVE_SETTINGS_ONLY', payload: { settings: readAiSettings() } });

    setStatus('google-status', '⏳ Opening Google sign-in…');
    const resp = await sendMessage({ type: 'GOOGLE_CONNECT' });
    if (!resp?.success) throw new Error(resp?.error || 'Google connect failed.');

    const profile = resp.profile || {};
    if (profile.full_name && $('profile-full-name')) $('profile-full-name').value = profile.full_name;
    if (profile.email && $('profile-email')) $('profile-email').value = profile.email;
    setStatus('google-status', `✅ Imported ${profile.full_name || 'your profile'} — open Profile to review and Save.`, 'success');
  } catch (err) {
    setStatus('google-status', '❌ ' + (err?.message || 'Google connect failed.'), 'error');
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
  $('connect-google-btn')?.addEventListener('click', connectGoogle);

  // Custom job sources — add via button, remove via event delegation on the list.
  $('add-custom-source-btn')?.addEventListener('click', addCustomJobSource);
  $('custom-job-sources-list')?.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('[data-remove-id]');
    if (!removeBtn) return;
    removeCustomJobSource(removeBtn.dataset.removeId);
  });
}
