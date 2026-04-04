/**
 * apply-bot — ats/lever.js
 * Lever-specific form field selectors and helpers.
 *
 * Lever forms live at:
 *   jobs.lever.co/*/apply
 */

/**
 * Returns extra Lever-specific selectors.
 * @returns {object}
 */
export function leverExtraSelectors() {
  return {
    'input[name="name"]': 'full_name',
    'input[name="email"]': 'email',
    'input[name="phone"]': 'phone',
    'input[name="org"]': 'current_company',
    'input[name="urls[LinkedIn]"]': 'linkedin',
    'input[name="urls[GitHub]"]': 'github',
    'input[name="urls[Portfolio]"]': 'portfolio',
    'textarea[name="comments"]': 'cover_letter',
  };
}

/**
 * Detect if the current page is a Lever application form.
 * @returns {boolean}
 */
export function isLeverPage() {
  return (
    location.hostname.includes('lever.co') ||
    !!document.querySelector('.lever-apply-form, [class*="lever"]')
  );
}
