async function handleSaveSettingsOnly({ settings } = {}) {
  if (!settings) throw new Error('No settings provided.');
  const data = await chrome.storage.local.get('settings');
  const existing = data.settings || {};
  // Merge, preserving privacy_consent from the existing record so the AI panel
  // (which doesn't render the consent checkbox) can't inadvertently clear it.
  const next = {
    ...existing,
    ...settings,
    privacy_consent: existing.privacy_consent === true,
    privacy_consent_at: existing.privacy_consent_at || null,
  };
  await chrome.storage.local.set({ settings: next });
  return { success: true };
}

async function handleSaveSetup({ resumeRaw, settings, profile = {}, resumeMeta }) {
  const data = await chrome.storage.local.get(['resume']);
  const existingResume = data.resume?.structured || null;
  const existingAttachment = sanitizeResumeAttachment(data.resume?.attachment || null);
  const hasNewResume = typeof resumeRaw === 'string' && resumeRaw.trim() !== '';
  const nextSettings = {
    ...(settings || {}),
    privacy_consent: settings?.privacy_consent === true,
    privacy_consent_at: settings?.privacy_consent
      ? (settings?.privacy_consent_at || new Date().toISOString())
      : null,
  };

  if (!nextSettings.privacy_consent) {
    throw new Error('Please review and accept the privacy note before saving your setup.');
  }

  // Save settings first
  await chrome.storage.local.set({ settings: nextSettings });

