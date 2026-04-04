/**
 * apply-bot — ats/ashby.js
 * Ashby-specific form field selectors and helpers.
 *
 * Ashby forms live at:
 *   jobs.ashbyhq.com/*/application
 */

/**
 * Returns extra Ashby-specific selectors.
 * @returns {object}
 */
export function ashbyExtraSelectors() {
  return {
    'input[data-testid="firstName"]': 'first_name',
    'input[data-testid="lastName"]': 'last_name',
    'input[data-testid="email"]': 'email',
    'input[data-testid="phone"]': 'phone',
    'input[data-testid="linkedIn"]': 'linkedin',
    'input[data-testid="website"]': 'portfolio',
    'textarea[data-testid="coverLetter"]': 'cover_letter',
  };
}

/**
 * Detect if the current page is an Ashby application form.
 * @returns {boolean}
 */
export function isAshbyPage() {
  const { hostname } = location;
  return (
    hostname === 'ashbyhq.com' || hostname.endsWith('.ashbyhq.com') ||
    hostname === 'ashby.io' || hostname.endsWith('.ashby.io') ||
    !!document.querySelector('[data-testid="application-form"]')
  );
}
