/**
 * apply-bot — ats/icims.js
 * iCIMS-specific form field selectors and helpers.
 */

/**
 * Returns extra iCIMS-specific selectors.
 * @returns {object}
 */
export function icimsExtraSelectors() {
  return {
    '#iCIMS_Candidate_fname': 'first_name',
    '#iCIMS_Candidate_lname': 'last_name',
    '#iCIMS_Candidate_email': 'email',
    '#iCIMS_Candidate_phone': 'phone',
    'input[name*="LinkedIn"]': 'linkedin',
    'textarea[name*="coverLetter"]': 'cover_letter',
  };
}

/**
 * Detect if the current page is an iCIMS application form.
 * @returns {boolean}
 */
export function isICIMSPage() {
  const { hostname } = location;
  return (
    hostname === 'icims.com' || hostname.endsWith('.icims.com') ||
    !!document.getElementById('iCIMS_MainColumn')
  );
}
