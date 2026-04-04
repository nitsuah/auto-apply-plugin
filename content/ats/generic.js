/**
 * apply-bot — ats/generic.js
 * Generic form detection and filling fallback for any job application form.
 *
 * Used when no specific ATS is detected.
 */

/**
 * Attempt to detect whether the current page looks like a job application form.
 * Heuristic: look for common application-related keywords + form elements.
 *
 * @returns {boolean}
 */
export function isJobApplicationPage() {
  const text = document.body?.innerText?.toLowerCase() || '';
  const hasForm = document.querySelectorAll('form input, form textarea').length >= 2;
  const keywords = ['apply', 'application', 'resume', 'cover letter', 'first name', 'last name', 'email'];
  const keywordHits = keywords.filter((kw) => text.includes(kw)).length;
  return hasForm && keywordHits >= 2;
}

/**
 * Generic selectors that appear on many custom or lesser-known ATS forms.
 * @returns {object}
 */
export function genericExtraSelectors() {
  return {
    'input[name*="first_name"], input[id*="first_name"], input[placeholder*="First name" i]': 'first_name',
    'input[name*="last_name"], input[id*="last_name"], input[placeholder*="Last name" i]': 'last_name',
    'input[type="email"], input[name*="email"], input[id*="email"]': 'email',
    'input[type="tel"], input[name*="phone"], input[id*="phone"]': 'phone',
    'input[name*="linkedin"], input[id*="linkedin"]': 'linkedin',
    'input[name*="github"], input[id*="github"]': 'github',
    'textarea[name*="cover"], textarea[id*="cover"]': 'cover_letter',
    'textarea[name*="why"], textarea[id*="why"]': 'why_company',
  };
}
