
import './utils.js';
export const ARBEITNOW_ENDPOINT = 'https://www.arbeitnow.com/api/job-board-api';
export const ADZUNA_ENDPOINT = 'https://api.adzuna.com/v1/api/jobs';
export const USAJOBS_ENDPOINT = 'https://data.usajobs.gov/api/search';
export const MUSE_ENDPOINT = 'https://www.themuse.com/api/public/jobs';
export const REMOTEOK_ENDPOINT = 'https://remoteok.com/api';
export const JOBICY_ENDPOINT = 'https://jobicy.com/api/v2/remote-jobs';
export const WORKINGNOMADS_ENDPOINT = 'https://www.workingnomads.com/api/exposed_jobs/';
export const REED_ENDPOINT = 'https://www.reed.co.uk/api/1.0/search';
export const JOOBLE_ENDPOINT = 'https://jooble.org/api';
export const HN_ALGOLIA_ENDPOINT = 'https://hn.algolia.com/api/v1/search';
export const WWR_RSS_ENDPOINT = 'https://weworkremotely.com/remote-jobs.rss';
export const REMOTECO_RSS_ENDPOINT = 'https://remote.co/remote-jobs/feed/';
export const LINKEDIN_VOYAGER_ENDPOINT = 'https://www.linkedin.com/voyager/api/jobs/search';
export const INDEED_BASE_URL = 'https://www.indeed.com';

export const INDEED_RSS_ENDPOINT = 'https://www.indeed.com/rss';

const KNOWN_ATS = [
  { pattern: /greenhouse\.io|job-boards\.greenhouse/i, label: 'Greenhouse' },
  { pattern: /lever\.co/i, label: 'Lever' },
  { pattern: /ashbyhq\.com|jobs\.ashby/i, label: 'Ashby' },
  { pattern: /myworkdayjobs|\.workday\.com/i, label: 'Workday' },
  { pattern: /icims\.com/i, label: 'iCIMS' },
  { pattern: /jobvite\.com/i, label: 'Jobvite' },
  { pattern: /phenompeople|phenom\.com/i, label: 'Phenom' },
];

/**
 * Identify a known ATS from a job-post URL so the UI can preferentially surface
 * a direct application link.
 * @param {string} url
 * @returns {string|null}
 */
export function detectAtsLabelFromUrl(url) {
  const text = String(url || '');
  for (const { pattern, label } of KNOWN_ATS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

function cleanText(value, max = 280) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function isRemoteText(...values) {
  return /\bremote\b|\bhybrid\b|work from home|wfh|anywhere/i.test(values.filter(Boolean).join(' '));
}

/**
 * Normalize a Remotive API job into the common schema.
 */
export function normalizeRemotiveJob(raw = {}) {
  const url = String(raw.url || '').trim();
  const location = cleanText(raw.candidate_required_location || 'Remote', 120) || 'Remote';
  return {
    id: `remotive:${raw.id ?? url}`,
    title: cleanText(raw.title, 160),
    company: cleanText(raw.company_name, 120),
    location,
    salary: cleanText(raw.salary, 80),
    remote: true,
    url,
    atsLabel: detectAtsLabelFromUrl(url),
    source: 'Remotive',
    employment_type: cleanText(raw.job_type, 40),
    posted: toIsoDate(raw.publication_date),
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 8).map((t) => cleanText(t, 40)) : [],
    description: cleanText(raw.description, 600),
  };
}

/**
 * Normalize an Arbeitnow API job into the common schema.
 */
export function normalizeArbeitnowJob(raw = {}) {
  const url = String(raw.url || '').trim();
  const tags = Array.isArray(raw.tags) ? raw.tags : [];
  const jobTypes = Array.isArray(raw.job_types) ? raw.job_types : [];
  const remote = raw.remote === true || isRemoteText(raw.location, tags.join(' '));
  return {
    id: `arbeitnow:${raw.slug ?? url}`,
    title: cleanText(raw.title, 160),
    company: cleanText(raw.company_name, 120),
    location: cleanText(raw.location, 120) || (remote ? 'Remote' : 'Unknown'),
    salary: '',
    remote,
    url,
    atsLabel: detectAtsLabelFromUrl(url),
    source: 'Arbeitnow',
    employment_type: cleanText(jobTypes[0], 40),
    posted: toIsoDate(raw.created_at),
    tags: tags.slice(0, 8).map((t) => cleanText(t, 40)),
    description: cleanText(raw.description, 600),
  };
}

const ADZUNA_CURRENCY_SYMBOL = { us: '$', gb: '£', ca: 'CA$', au: 'A$', nz: 'NZ$', de: '€', fr: '€', nl: '€', be: '€', at: '€', in: '₹', sg: 'S$', za: 'R', br: 'R$', mx: 'MX$' };

function formatAdzunaSalary(min, max, country = 'us') {
  const symbol = ADZUNA_CURRENCY_SYMBOL[String(country).toLowerCase()] ?? '';
  const lo = Number(min);
  const hi = Number(max);
  const fmt = (n) => `${symbol}${Math.round(n).toLocaleString()}`;
  if (Number.isFinite(lo) && lo > 0 && Number.isFinite(hi) && hi > 0 && hi !== lo) return `${fmt(lo)} - ${fmt(hi)}`;
  if (Number.isFinite(lo) && lo > 0) return fmt(lo);
  if (Number.isFinite(hi) && hi > 0) return fmt(hi);
  return '';
}

/**
 * Normalize an Adzuna API job into the common schema.
 */
export function normalizeAdzunaJob(raw = {}, country = 'us') {
  const url = String(raw.redirect_url || '').trim();
  const location = cleanText(raw.location?.display_name, 120) || 'Unknown';
  const employmentType = raw.contract_time === 'part_time'
    ? 'Part-time'
    : raw.contract_time === 'full_time' ? 'Full-time' : '';
  return {
    id: `adzuna:${raw.id ?? url}`,
    title: cleanText(raw.title, 160),
    company: cleanText(raw.company?.display_name, 120),
    location,
    salary: formatAdzunaSalary(raw.salary_min, raw.salary_max, country),
    remote: isRemoteText(location, raw.title, raw.description),
    url,
    atsLabel: detectAtsLabelFromUrl(url),
    source: 'Adzuna',
    employment_type: employmentType,
    posted: toIsoDate(raw.created),
    tags: [],
    description: cleanText(raw.description, 600),
  };
}

function formatUsaJobsSalary(rem = {}) {
  const min = Number(rem.MinimumRange);
  const max = Number(rem.MaximumRange);
  const fmt = (n) => `$${Math.round(n).toLocaleString()}`;
  const suffix = rem.RateIntervalCode === 'PH' ? '/hr' : '';
  if (Number.isFinite(min) && min > 0 && Number.isFinite(max) && max > 0 && max !== min) return `${fmt(min)} - ${fmt(max)}${suffix}`;
  if (Number.isFinite(min) && min > 0) return `${fmt(min)}${suffix}`;
  if (Number.isFinite(max) && max > 0) return `${fmt(max)}${suffix}`;
  return '';
}

/**
 * Normalize a USAJOBS SearchResultItem into the common schema.
 */
export function normalizeUsaJobsJob(item = {}) {
  const d = item.MatchedObjectDescriptor || item;
  const url = String(d.PositionURI || '').trim();
  const rem = Array.isArray(d.PositionRemuneration) ? d.PositionRemuneration[0] : null;
  const location = cleanText(d.PositionLocationDisplay, 120) || 'United States';
  const summary = d.UserArea?.Details?.JobSummary || '';
  const schedule = Array.isArray(d.PositionSchedule) ? cleanText(d.PositionSchedule[0]?.Name, 40) : '';
  return {
    id: `usajobs:${item.MatchedObjectId || d.PositionID || url}`,
    title: cleanText(d.PositionTitle, 160),
    company: cleanText(d.OrganizationName, 120),
    location,
    salary: rem ? formatUsaJobsSalary(rem) : '',
    remote: isRemoteText(location, d.PositionTitle, summary),
    url,
    atsLabel: detectAtsLabelFromUrl(url) || 'USAJOBS',
    source: 'USAJOBS',
    employment_type: /part/i.test(schedule) ? 'Part-time' : (schedule ? 'Full-time' : ''),
    posted: toIsoDate(d.PublicationStartDate),
    tags: [],
    description: cleanText(summary, 600),
  };
}

/**
 * Normalize a The Muse API job into the common schema.
 */
export function normalizeMuseJob(raw = {}) {
  const url = String(raw.refs?.landing_page || '').trim();
  const location = cleanText(raw.locations?.[0]?.name, 120) || 'Flexible';
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  return {
    id: `themuse:${raw.id ?? url}`,
    title: cleanText(raw.name, 160),
    company: cleanText(raw.company?.name, 120),
    location,
    salary: '',
    remote: isRemoteText(location, raw.name),
    url,
    atsLabel: detectAtsLabelFromUrl(url),
    source: 'The Muse',
    employment_type: '',
    posted: toIsoDate(raw.publication_date),
    tags: categories.slice(0, 4).map((c) => cleanText(c?.name, 40)).filter(Boolean),
    description: cleanText(raw.contents, 600),
  };
}

/**
 * Normalize a RemoteOK API job into the common schema.
 * RemoteOK returns a JSON array; the first element is always a metadata header.
 */
export function normalizeRemoteOkJob(raw = {}) {
  const url = String(raw.url || '').trim();
  const tags = Array.isArray(raw.tags) ? raw.tags : [];
  const salaryMin = Number(raw.salary_min);
  const salaryMax = Number(raw.salary_max);
  const currency = String(raw.currency || 'USD').toUpperCase();
  let salary = '';
  if (Number.isFinite(salaryMin) && Number.isFinite(salaryMax) && salaryMax > 0 && salaryMax !== salaryMin) {
    const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : `${currency} `;
    salary = `${sym}${Math.round(salaryMin).toLocaleString()} - ${sym}${Math.round(salaryMax).toLocaleString()}`;
  } else if (Number.isFinite(salaryMin) && salaryMin > 0) {
    const sym = currency === 'USD' ? '$' : '';
    salary = `${sym}${Math.round(salaryMin).toLocaleString()}`;
  }
  return {
    id: `remoteok:${raw.id ?? url}`,
    title: cleanText(raw.position || raw.title, 160),
    company: cleanText(raw.company, 120),
    location: cleanText(raw.location, 120) || 'Remote',
    salary,
    remote: true,
    url,
    atsLabel: detectAtsLabelFromUrl(url),
    source: 'Remote OK',
    employment_type: '',
    posted: toIsoDate(raw.epoch ? raw.epoch * 1000 : raw.date),
    tags: tags.slice(0, 8).map((t) => cleanText(t, 40)).filter(Boolean),
    description: cleanText(raw.description, 600),
  };
}

/**
 * Normalize a Jobicy API job into the common schema.
 */
export function normalizeJobicyJob(raw = {}) {
  const url = String(raw.url || '').trim();
  const industries = Array.isArray(raw.jobIndustry) ? raw.jobIndustry : [];
  const types = Array.isArray(raw.jobType) ? raw.jobType : [];
  const salaryMin = Number(raw.annualSalaryMin);
  const salaryMax = Number(raw.annualSalaryMax);
  const currency = String(raw.salaryCurrency || 'USD').toUpperCase();
  let salary = '';
  if (Number.isFinite(salaryMin) && Number.isFinite(salaryMax) && salaryMax > 0 && salaryMax !== salaryMin) {
    const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : `${currency} `;
    salary = `${sym}${Math.round(salaryMin).toLocaleString()} - ${sym}${Math.round(salaryMax).toLocaleString()}`;
  } else if (Number.isFinite(salaryMin) && salaryMin > 0) {
    salary = `$${Math.round(salaryMin).toLocaleString()}`;
  }
  const geo = cleanText(raw.jobGeo, 80) || 'Remote';
  return {
    id: `jobicy:${raw.id ?? url}`,
    title: cleanText(raw.jobTitle, 160),
    company: cleanText(raw.companyName, 120),
    location: geo,
    salary,
    remote: true,
    url,
    atsLabel: detectAtsLabelFromUrl(url),
    source: 'Jobicy',
    employment_type: cleanText(types[0], 40),
    posted: toIsoDate(raw.pubDate),
    tags: industries.slice(0, 6).map((t) => cleanText(t, 40)).filter(Boolean),
    description: cleanText(raw.jobExcerpt || raw.jobDescription, 600),
  };
}

/**
 * Normalize a Working Nomads API job into the common schema.
 */
export function normalizeWorkingNomadsJob(raw = {}) {
  const url = String(raw.url || '').trim();
  return {
    id: `workingnomads:${raw.id ?? url}`,
    title: cleanText(raw.title, 160),
    company: cleanText(raw.company_name, 120),
    location: cleanText(raw.location, 120) || 'Remote',
    salary: cleanText(raw.salary, 80),
    remote: true,
    url,
    atsLabel: detectAtsLabelFromUrl(url),
    source: 'Working Nomads',
    employment_type: '',
    posted: toIsoDate(raw.pub_date),
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 6).map((t) => cleanText(t, 40)).filter(Boolean) : [],
    description: cleanText(raw.description, 600),
  };
}

/**
 * Normalize a Reed.co.uk API job into the common schema.
 */
export function normalizeReedJob(raw = {}) {
  const url = String(raw.jobUrl || raw.applicationUrl || '').trim();
  const min = Number(raw.minimumSalary);
  const max = Number(raw.maximumSalary);
  let salary = '';
  if (Number.isFinite(min) && min > 0 && Number.isFinite(max) && max > 0 && max !== min) {
    salary = `£${Math.round(min).toLocaleString()} - £${Math.round(max).toLocaleString()}`;
  } else if (Number.isFinite(min) && min > 0) {
    salary = `£${Math.round(min).toLocaleString()}`;
  } else if (Number.isFinite(max) && max > 0) {
    salary = `£${Math.round(max).toLocaleString()}`;
  }
  const contractType = String(raw.contractType || '').toLowerCase();
  let employment_type = '';
  if (raw.fullTime) employment_type = 'Full-time';
  else if (raw.partTime) employment_type = 'Part-time';
  else if (/contract/.test(contractType)) employment_type = 'Contract';
  else if (/temp/.test(contractType)) employment_type = 'Temporary';
  return {
    id: `reed:${raw.jobId ?? url}`,
    title: cleanText(raw.jobTitle, 160),
    company: cleanText(raw.employerName, 120),
    location: cleanText(raw.locationName, 120) || 'United Kingdom',
    salary,
    remote: isRemoteText(raw.locationName, raw.jobTitle, raw.jobDescription),
    url,
    atsLabel: detectAtsLabelFromUrl(url),
    source: 'Reed',
    employment_type,
    posted: toIsoDate(raw.date || raw.expirationDate),
    tags: [],
    description: cleanText(raw.jobDescription, 600),
  };
}

/**
 * Normalize a Jooble API job into the common schema.
 */
export function normalizeJoobleJob(raw = {}) {
  const url = String(raw.link || '').trim();
  return {
    id: `jooble:${url || raw.title}`,
    title: cleanText(raw.title, 160),
    company: cleanText(raw.company, 120),
    location: cleanText(raw.location, 120) || 'Unknown',
    salary: cleanText(raw.salary, 80),
    remote: isRemoteText(raw.location, raw.title, raw.snippet),
    url,
    atsLabel: detectAtsLabelFromUrl(url),
    source: 'Jooble',
    employment_type: cleanText(raw.type, 40),
    posted: toIsoDate(raw.updated),
    tags: [],
    description: cleanText(raw.snippet, 600),
  };
}

// ── Utilities ───────────────────────────────────────────────────────────────

function toIsoDate(value) {
  if (value == null || value === '') return '';
  // Arbeitnow uses unix seconds; Remotive uses an ISO/date string.
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const ms = Number(value) * (String(value).length <= 10 ? 1000 : 1);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/**
 * Does a normalized job match every whitespace-delimited token in the query?
 */
export function jobMatchesQuery(job, query) {
  const tokens = String(query || '').toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = [
    job.title, job.company, job.location, job.employment_type,
    (job.tags || []).join(' '), job.description,
  ].join(' ').toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Merge results from multiple sources and drop duplicates. A job is a duplicate
 * if it shares a normalized company+title (or exact URL) with an earlier entry.
 */
export function dedupeJobs(jobs = []) {
  const seen = new Set();
  const out = [];
  for (const job of jobs) {
    if (!job || (!job.title && !job.company && !job.url)) continue;
    const key = normalizeKey(`${job.company}|${job.title}`);
    const urlKey = String(job.url || '').trim().toLowerCase();
    if ((key && seen.has(key)) || (urlKey && seen.has(urlKey))) continue;
    if (key) seen.add(key);
    if (urlKey) seen.add(urlKey);
    out.push(job);
  }
  return out;
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Pay parsing / filtering ──────────────────────────────────────────────────

const ANNUAL_HOURS = 2080; // 40h × 52w, for rough annual↔hourly conversion

/**
 * Parse a salary string into a numeric range + unit.
 * "$130,000 - $176,000" → { min: 130000, max: 176000, hourly: false }
 * "$120k" → { min: 120000, max: 120000 }   "$50/hr" → { hourly: true }
 * @returns {{min:number, max:number, hourly:boolean}|null}
 */
export function parseJobPay(salary) {
  const s = String(salary || '').toLowerCase();
  if (!s) return null;
  const hourly = /\/\s*h|per hour|hourly|an hour/.test(s);
  // Require a $ prefix or an explicit k suffix to avoid matching years, benefit
  // plan numbers (401), or other unrelated digits in the salary string.
  const tokens = s.match(/\$[\d,.]+\s*k?|\b[\d,.]+\s*k\b/g);
  if (!tokens) return null;
  const vals = tokens
    .map((t) => {
      const isK = /k/.test(t);
      const num = Number(t.replace(/[$,k\s]/g, ''));
      return Number.isFinite(num) ? (isK ? num * 1000 : num) : NaN;
    })
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals), hourly };
}

/**
 * Does a job pass a pay filter? Filter values are in thousands for annual mode
 * (90 → $90k) and dollars-per-hour for hourly mode. Jobs with no parseable
 * salary always pass (so they aren't silently hidden) unless `hideUnknown` is
 * set, in which case they are excluded when the filter is active.
 *
 * @param {object} job
 * @param {{enabled:boolean, mode:'annual'|'hourly', min:number, max:number, hideUnknown?:boolean}} filter
 */
export function jobPassesPayFilter(job, filter) {
  if (!filter || !filter.enabled) return true;
  const parsed = parseJobPay(job?.salary);
  if (!parsed) return !filter.hideUnknown;
  const toAnnual = (v, isHourly) => (isHourly ? v * ANNUAL_HOURS : v);
  const toHourly = (v, isHourly) => (isHourly ? v : v / ANNUAL_HOURS);
  let jobMin, jobMax, fMin, fMax;
  if (filter.mode === 'hourly') {
    jobMin = toHourly(parsed.min, parsed.hourly);
    jobMax = toHourly(parsed.max, parsed.hourly);
    fMin = filter.min;
    fMax = filter.max;
  } else {
    jobMin = toAnnual(parsed.min, parsed.hourly);
    jobMax = toAnnual(parsed.max, parsed.hourly);
    fMin = filter.min * 1000;
    fMax = filter.max * 1000;
  }
  return jobMax >= fMin && jobMin <= fMax;
}

export { jobMatchesQuery };
