// consent.js
// Handles privacy consent and related UI logic

export function syncConsentGate() {
  const consentAccepted = $('privacy-consent')?.checked === true;
  $('profile-privacy-section')?.classList.toggle('hidden', consentAccepted);

  const profileGate = $('profile-consent-gated');
  const aiGate = $('ai-consent-gated');
  profileGate?.classList.toggle('consent-locked', !consentAccepted);
  aiGate?.classList.toggle('consent-locked', !consentAccepted);
  setElementsDisabled(profileGate, !consentAccepted);
  setElementsDisabled(aiGate, !consentAccepted);

  $('ai-locked-note')?.classList.toggle('hidden', consentAccepted);
}
