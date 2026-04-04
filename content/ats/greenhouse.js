/**
 * apply-bot — ats/greenhouse.js
 * Greenhouse-specific form field selectors and helpers.
 *
 * Greenhouse application forms live at:
 *   boards.greenhouse.io/*/jobs/*
 */

/**
 * Returns a map of extra Greenhouse-specific selectors that may not be
 * caught by the generic field-map.  Each entry is  selector → answer key.
 *
 * @returns {object}
 */
export function greenhouseExtraSelectors() {
  return {
    '#first_name': 'first_name',
    '#last_name': 'last_name',
    '#email': 'email',
    '#phone': 'phone',
    '#job_application_location': 'location',
    '#job_application_linkedin_profile_url': 'linkedin',
    '#job_application_website': 'portfolio',
    'textarea[name*="cover_letter"]': 'cover_letter',
    'input[name*="salary"]': 'salary_expectation',
  };
}

/**
 * Detect if the current page is a Greenhouse application form.
 * @returns {boolean}
 */
export function isGreenhousePage() {
  const { hostname } = location;
  return (
    hostname === 'greenhouse.io' || hostname.endsWith('.greenhouse.io') ||
    !!document.querySelector('meta[content*="greenhouse"]') ||
    !!document.getElementById('application_form')
  );
}
