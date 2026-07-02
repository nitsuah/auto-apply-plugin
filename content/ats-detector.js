/**
 * content/ats-detector.js - ATS platform detection
 * Extracted from content.js (lines 899-940)
 */

import { matchesDomain, qs } from './utils.js';

/** Detect ATS platform from current page URL and content */
export function detectAts() {
  const host = location.hostname;
  const path = `${location.pathname} ${location.search}`.toLowerCase();

  if (matchesDomain(host, 'greenhouse.io') && (/\/jobs\/|job_app|application/.test(path) || qs('#application_form, #content'))) return 'Greenhouse';
  if ((matchesDomain(host, 'ashbyhq.com') || matchesDomain(host, 'ashby.io')) && (/\/application|\/jobs\/|\/job\//.test(path) || qs('.ashby-job-posting-description, form'))) return 'Ashby';
  if (matchesDomain(host, 'lever.co') && (/\/postings\/|\/jobs\/|\/apply/.test(path) || qs('.posting-apply, .application-form'))) return 'Lever';
  if (matchesDomain(host, 'linkedin.com') && /\/jobs\/view\//.test(path)) return 'LinkedIn Easy Apply';
  if (matchesDomain(host, 'workday.com') && (/\/job\/|requisition|\/apply/.test(path) || qs('[data-automation-id="jobPostingHeader"]'))) return 'Workday';
  if (matchesDomain(host, 'icims.com') && (/\/jobs\/|\/job\//.test(path) || qs('#iCIMS_JobContent'))) return 'iCIMS';

  // Custom career domains (e.g. samsara.com/company/careers, abnormal.ai/careers)
  // commonly render a third-party ATS natively or embed its form/links. Sniff
  // the page for the ATS's fingerprints so detection still works off-domain.
  const embedded = detectEmbeddedAts();
  if (embedded) return embedded;

  return 'Generic';
}

/** Detect embedded ATS from page markup and URL attributes */
function detectEmbeddedAts() {
  const urlAttrs = [];
  for (const el of document.querySelectorAll('iframe[src], a[href], form[action], script[src], link[href]')) {
    const value = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('action') || '';
    if (value) urlAttrs.push(value.toLowerCase());
  }

  let markup = '';
  try { markup = (document.documentElement.innerHTML || '').slice(0, 60000).toLowerCase(); } catch { /* ignore */ }
  const hay = `${urlAttrs.join(' ')} ${markup}`;

  if (/greenhouse\.io|grnhse|us-greenhouse-mail|job-boards\.greenhouse/.test(hay)) return 'Greenhouse';
  if (/ashbyhq\.com|jobs\.ashby|ashby\.io/.test(hay)) return 'Ashby';
  if (/(?:jobs\.)?lever\.co|lever-client/.test(hay)) return 'Lever';
  if (/myworkdayjobs|\.workday\.com/.test(hay)) return 'Workday';
  if (/icims\.com/.test(hay)) return 'iCIMS';
  if (/jobvite\.com/.test(hay)) return 'Jobvite';
  if (/phenompeople|phenom\.com/.test(hay)) return 'Phenom';
  return null;
}