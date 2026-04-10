/**
 * apply-bot — jd-parser.js
 * Extracts job description text from the current page DOM.
 * Tries ATS-specific selectors first, then falls back to heuristic extraction.
 */

/**
 * Check if a hostname exactly matches a domain or any of its subdomains.
 * @param {string} hostname
 * @param {string} domain
 * @returns {boolean}
 */
function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

/**
 * Extract job description text from the current page.
 * This runs in the content script context (has access to `document`).
 *
 * @returns {{ jd: string, company: string, title: string }}
 */
export function extractJobInfo() {
  const hostname = location.hostname;

  if (matchesDomain(hostname, 'greenhouse.io')) return extractGreenhouse();
  if (matchesDomain(hostname, 'ashbyhq.com') || matchesDomain(hostname, 'ashby.io')) return extractAshby();
  if (matchesDomain(hostname, 'lever.co')) return extractLever();
  if (matchesDomain(hostname, 'linkedin.com')) return extractLinkedIn();
  if (matchesDomain(hostname, 'workday.com')) return extractWorkday();
  if (matchesDomain(hostname, 'icims.com')) return extractICIMS();
  return extractGeneric();
}

// ── ATS-specific extractors ───────────────────────────────────────────────────

function extractGreenhouse() {
  const title = qs('#header h1, .app-title, h1')?.textContent?.trim() || '';
  const company = qs('#header .company-name, .company')?.textContent?.trim() || document.title;
  const jd = qs('#content, #app_body, .content')?.innerText?.trim() || extractGenericText();
  return { title, company, jd };
}

function extractAshby() {
  const title = qs('h1[data-testid="job-title"], h1.ashby-job-posting-heading, h1')?.textContent?.trim() || '';
  const company = qs('.ashby-application-portal-name, [data-testid="company-name"]')?.textContent?.trim() || document.title;
  const jd = qs('.ashby-job-posting-brief-list, .ashby-job-posting-description, main')?.innerText?.trim() || extractGenericText();
  return { title, company, jd };
}

function extractLever() {
  const title = qs('.posting-header h2, h2.posting-title')?.textContent?.trim() || '';
  const company = qs('.main-header-logo img')?.alt?.trim() || document.title;
  const jd = qs('.posting-description, section.page-centered')?.innerText?.trim() || extractGenericText();
  return { title, company, jd };
}

function extractLinkedIn() {
  const title = qs('.job-details-jobs-unified-top-card__job-title, h1.t-24')?.textContent?.trim() || '';
  const company = qs('.job-details-jobs-unified-top-card__company-name, a.ember-view')?.textContent?.trim() || '';
  const jd = qs('#job-details, .jobs-description__content, .jobs-description-content__text')?.innerText?.trim() || extractGenericText();
  return { title, company, jd };
}

function extractWorkday() {
  const title = qs('[data-automation-id="jobPostingHeader"], h2.css-9xh9yi')?.textContent?.trim() || '';
  const company = document.title.split('|')?.[1]?.trim() || '';
  const jd = qs('[data-automation-id="job-description"], .css-qdtm9x')?.innerText?.trim() || extractGenericText();
  return { title, company, jd };
}

function extractICIMS() {
  const title = qs('.iCIMS_JobHeaderTitle, #iCIMS_MainColumn h1')?.textContent?.trim() || '';
  const company = qs('.iCIMS_CompanyLogo img')?.alt || document.title;
  const jd = qs('#iCIMS_JobContent, .iCIMS_JobContent')?.innerText?.trim() || extractGenericText();
  return { title, company, jd };
}

// ── Generic fallback ──────────────────────────────────────────────────────────

function extractGeneric() {
  const title = qs('h1, h2')?.textContent?.trim() || '';
  const company = '';
  const jd = extractGenericText();
  return { title, company, jd };
}

/**
 * Heuristic text extraction: score candidate elements by size and keyword density.
 */
function extractGenericText() {
  const JD_KEYWORDS = ['responsibilities', 'qualifications', 'requirements', 'experience', 'skills', 'about', 'role', 'position'];

  const candidates = Array.from(document.querySelectorAll('article, section, main, .job-description, [class*="description"], [id*="description"], [class*="posting"], [id*="posting"]'));

  let best = null;
  let bestScore = 0;

  for (const el of candidates) {
    const text = el.innerText || '';
    if (text.length < 200) continue;
    const lower = text.toLowerCase();
    const kwHits = JD_KEYWORDS.filter((kw) => lower.includes(kw)).length;
    const score = kwHits * 100 + text.length;
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  }

  return best || document.body.innerText.slice(0, 8000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function qs(selector) {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}
