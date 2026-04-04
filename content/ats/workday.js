/**
 * apply-bot — ats/workday.js
 * Workday-specific form field selectors and helpers.
 *
 * Workday forms are complex SPAs. Phase 2 — selector coverage is partial.
 */

/**
 * Returns extra Workday-specific selectors.
 * @returns {object}
 */
export function workdayExtraSelectors() {
  return {
    '[data-automation-id="legalNameSection_firstName"]': 'first_name',
    '[data-automation-id="legalNameSection_lastName"]': 'last_name',
    '[data-automation-id="email"]': 'email',
    '[data-automation-id="phone-number"]': 'phone',
    '[data-automation-id="addressSection_city"]': 'location',
    '[data-automation-id="linkedin"]': 'linkedin',
    '[data-automation-id="coverLetter"] textarea': 'cover_letter',
  };
}

/**
 * Detect if the current page is a Workday application form.
 * @returns {boolean}
 */
export function isWorkdayPage() {
  const { hostname } = location;
  return (
    hostname === 'workday.com' || hostname.endsWith('.workday.com') ||
    !!document.querySelector('[data-automation-id="wd-ApplicationStep"]')
  );
}
