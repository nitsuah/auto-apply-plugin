// lib/job-search.js
// Multi-source job search aggregation.
//
// Pulls from keyless public job APIs (Remotive + Arbeitnow), normalizes every
// result to one schema, merges, and de-duplicates. Network fetch is injectable
// so the orchestration is unit-testable without hitting the network. Runs in
// the service worker (which has host permissions and is not subject to CORS).

export const REMOTIVE_ENDPOINT = 'https://remotive.com/api/remote-jobs';
export const ARBEITNOW_ENDPOINT = 'https://www.arbeitnow.com/api/job-board-api';
export const ADZUNA_ENDPOINT = 'https://api.adzuna.com/v1/api/jobs';
export const USAJOBS_ENDPOINT = 'https://data.usajobs.gov/api/search';
export const MUSE_ENDPOINT = 'https://www.themuse.com/api/public/jobs';

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
    posted: toIso(raw.publication_date),
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
    posted: toIso(raw.created_at),
    tags: tags.slice(0, 8).map((t) => cleanText(t, 40)),
    description: cleanText(raw.description, 600),
  };
}

function formatAdzunaSalary(min, max) {
  const lo = Number(min);
  const hi = Number(max);
  const fmt = (n) => `$${Math.round(n).toLocaleString()}`;
  if (Number.isFinite(lo) && lo > 0 && Number.isFinite(hi) && hi > 0 && hi !== lo) return `${fmt(lo)} - ${fmt(hi)}`;
  if (Number.isFinite(lo) && lo > 0) return fmt(lo);
  if (Number.isFinite(hi) && hi > 0) return fmt(hi);
  return '';
}

/**
 * Normalize an Adzuna API job into the common schema.
 */
export function normalizeAdzunaJob(raw = {}) {
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
    salary: formatAdzunaSalary(raw.salary_min, raw.salary_max),
    remote: isRemoteText(location, raw.title, raw.description),
    url,
    atsLabel: detectAtsLabelFromUrl(url),
    source: 'Adzuna',
    employment_type: employmentType,
    posted: toIso(raw.created),
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
    posted: toIso(d.PublicationStartDate),
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
    posted: toIso(raw.publication_date),
    tags: categories.slice(0, 4).map((c) => cleanText(c?.name, 40)).filter(Boolean),
    description: cleanText(raw.contents, 600),
  };
}

function toIso(value) {
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
  const tokens = s.match(/\d[\d,.]*\s*k?/g);
  if (!tokens) return null;
  const vals = tokens
    .map((t) => {
      const isK = /k/.test(t);
      const num = Number(t.replace(/[,k\s]/g, ''));
      return Number.isFinite(num) ? (isK ? num * 1000 : num) : NaN;
    })
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals), hourly };
}

/**
 * Does a job pass a pay filter? Filter values are in thousands for annual mode
 * (90 → $90k) and dollars-per-hour for hourly mode. Jobs with no parseable
 * salary always pass (so they aren't silently hidden).
 *
 * @param {object} job
 * @param {{enabled:boolean, mode:'annual'|'hourly', min:number, max:number}} filter
 */
export function jobPassesPayFilter(job, filter) {
  if (!filter || !filter.enabled) return true;
  const parsed = parseJobPay(job?.salary);
  if (!parsed) return true;
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

async function fetchRemotive(query, doFetch, signal) {
  const url = `${REMOTIVE_ENDPOINT}?limit=40${query ? `&search=${encodeURIComponent(query)}` : ''}`;
  const res = await doFetch(url, { signal });
  if (!res.ok) throw new Error(`Remotive responded ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data?.jobs) ? data.jobs : []).map(normalizeRemotiveJob);
}

async function fetchArbeitnow(query, doFetch, signal) {
  const res = await doFetch(ARBEITNOW_ENDPOINT, { signal });
  if (!res.ok) throw new Error(`Arbeitnow responded ${res.status}`);
  const data = await res.json();
  const jobs = (Array.isArray(data?.data) ? data.data : []).map(normalizeArbeitnowJob);
  return query ? jobs.filter((job) => jobMatchesQuery(job, query)) : jobs;
}

async function fetchAdzuna(query, doFetch, signal, cfg = {}) {
  const country = String(cfg.country || 'us').toLowerCase().replace(/[^a-z]/g, '') || 'us';
  const params = new URLSearchParams({
    app_id: cfg.appId,
    app_key: cfg.appKey,
    results_per_page: '40',
    'content-type': 'application/json',
  });
  if (query) params.set('what', query);
  const res = await doFetch(`${ADZUNA_ENDPOINT}/${country}/search/1?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Adzuna responded ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data?.results) ? data.results : []).map(normalizeAdzunaJob);
}

async function fetchMuse(query, doFetch, signal) {
  // The Muse has no free-text param, so pull the first couple of (recent) pages
  // and filter client-side. Adds non-remote US/global breadth beyond the
  // remote-only boards.
  const jobs = [];
  for (const page of [1, 2]) {
    const res = await doFetch(`${MUSE_ENDPOINT}?page=${page}`, { signal });
    if (!res.ok) {
      if (page === 1) throw new Error(`The Muse responded ${res.status}`);
      break;
    }
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    results.forEach((r) => jobs.push(normalizeMuseJob(r)));
    if (!results.length) break;
  }
  return query ? jobs.filter((job) => jobMatchesQuery(job, query)) : jobs;
}

async function fetchUsaJobs(query, doFetch, signal, cfg = {}) {
  const params = new URLSearchParams({ ResultsPerPage: '40' });
  if (query) params.set('Keyword', query);
  // USAJOBS authenticates via the Authorization-Key header and a User-Agent set
  // to the registered email. (Host is set automatically by the browser.)
  const headers = { 'Authorization-Key': cfg.apiKey || '' };
  if (cfg.email) headers['User-Agent'] = cfg.email;
  const res = await doFetch(`${USAJOBS_ENDPOINT}?${params.toString()}`, { signal, headers });
  if (!res.ok) throw new Error(`USAJOBS responded ${res.status}`);
  const data = await res.json();
  const items = data?.SearchResult?.SearchResultItems;
  return (Array.isArray(items) ? items : []).map(normalizeUsaJobsJob);
}

// ── Source registry (plug-and-play) ─────────────────────────────────────────
//
// Add a new job board by appending one entry here. Each source declares:
//   id        stable key used by the UI toggle + `sources` filter
//   label     display name
//   keyless   true if it works with no credentials (enabled by default)
//   requires  human hint for what unlocks it (key/OAuth), shown when unavailable
//   available (config) => boolean  — is it usable given the user's credentials
//   run       (query, ctx) => Promise<normalizedJob[]>
// `ctx` is { doFetch, signal, config } so sources stay testable + uniform.

export const JOB_SOURCES = [
  {
    id: 'remotive',
    label: 'Remotive',
    keyless: true,
    available: () => true,
    run: (q, ctx) => fetchRemotive(q, ctx.doFetch, ctx.signal),
  },
  {
    id: 'arbeitnow',
    label: 'Arbeitnow',
    keyless: true,
    available: () => true,
    run: (q, ctx) => fetchArbeitnow(q, ctx.doFetch, ctx.signal),
  },
  {
    id: 'themuse',
    label: 'The Muse',
    keyless: true,
    available: () => true,
    run: (q, ctx) => fetchMuse(q, ctx.doFetch, ctx.signal),
  },
  {
    id: 'adzuna',
    label: 'Adzuna',
    keyless: false,
    requires: 'Adzuna API keys (AI panel)',
    available: (config) => !!(config?.adzuna?.appId && config?.adzuna?.appKey),
    run: (q, ctx) => fetchAdzuna(q, ctx.doFetch, ctx.signal, ctx.config?.adzuna || {}),
  },
  {
    id: 'usajobs',
    label: 'USAJOBS',
    keyless: false,
    requires: 'USAJOBS email + API key (AI panel)',
    available: (config) => !!(config?.usajobs?.email && config?.usajobs?.apiKey),
    run: (q, ctx) => fetchUsaJobs(q, ctx.doFetch, ctx.signal, ctx.config?.usajobs || {}),
  },
];

/**
 * Describe every registered source and whether it's currently usable, for the
 * UI to render togglable filter chips.
 * @param {object} [config]
 */
export function listJobSources(config = {}) {
  return JOB_SOURCES.map((src) => ({
    id: src.id,
    label: src.label,
    keyless: !!src.keyless,
    available: !!src.available(config),
    requires: src.requires || null,
  }));
}

/**
 * Resolve which sources to actually query: must be available, and (if a
 * `sources` allow-list is given) selected. With no allow-list, every available
 * source runs by default.
 */
export function resolveActiveSources(config = {}, sources) {
  return JOB_SOURCES.filter((src) => {
    if (!src.available(config)) return false;
    if (Array.isArray(sources)) return sources.includes(src.id);
    return true;
  });
}

/**
 * Search jobs across the selected/available sources, normalized + deduped +
 * sorted by recency.
 *
 * @param {string} query
 * @param {{ fetchImpl?: Function, limit?: number, signal?: AbortSignal,
 *           config?: object, sources?: string[] }} [opts]
 * @returns {Promise<{ jobs: object[], sources: object[] }>}
 */
export async function searchJobs(query, { fetchImpl, limit = 40, signal, config = {}, sources } = {}) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  if (!doFetch) throw new Error('No network fetch implementation is available.');

  const q = String(query || '').trim();
  const ctx = { doFetch, signal, config };
  const active = resolveActiveSources(config, sources);
  if (!active.length) {
    return { jobs: [], sources: [] };
  }

  const settled = await Promise.allSettled(active.map((src) => src.run(q, ctx)));
  const jobs = [];
  const sourceStatus = [];
  settled.forEach((result, idx) => {
    const src = active[idx];
    if (result.status === 'fulfilled') {
      jobs.push(...result.value);
      sourceStatus.push({ id: src.id, name: src.label, ok: true, count: result.value.length });
    } else {
      sourceStatus.push({ id: src.id, name: src.label, ok: false, error: result.reason?.message || 'failed' });
    }
  });

  const deduped = dedupeJobs(jobs);
  deduped.sort((a, b) => (Date.parse(b.posted) || 0) - (Date.parse(a.posted) || 0));

  if (!deduped.length && sourceStatus.length && sourceStatus.every((s) => !s.ok)) {
    throw new Error('All selected job sources are unavailable right now. Try again shortly.');
  }

  return { jobs: deduped.slice(0, limit), sources: sourceStatus };
}
