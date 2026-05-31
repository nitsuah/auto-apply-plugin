// lib/job-search.js
// Multi-source job search aggregation.
//
// Pulls from keyless public job APIs (Remotive + Arbeitnow), normalizes every
// result to one schema, merges, and de-duplicates. Network fetch is injectable
// so the orchestration is unit-testable without hitting the network. Runs in
// the service worker (which has host permissions and is not subject to CORS).

export const REMOTIVE_ENDPOINT = 'https://remotive.com/api/remote-jobs';
export const ARBEITNOW_ENDPOINT = 'https://www.arbeitnow.com/api/job-board-api';

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

/**
 * Search jobs across all sources, normalized + deduped + sorted by recency.
 *
 * @param {string} query
 * @param {{ fetchImpl?: Function, limit?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ jobs: object[], sources: object[] }>}
 */
export async function searchJobs(query, { fetchImpl, limit = 40, signal } = {}) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  if (!doFetch) throw new Error('No network fetch implementation is available.');

  const q = String(query || '').trim();
  const providers = [
    { name: 'Remotive', run: () => fetchRemotive(q, doFetch, signal) },
    { name: 'Arbeitnow', run: () => fetchArbeitnow(q, doFetch, signal) },
  ];

  const settled = await Promise.allSettled(providers.map((p) => p.run()));
  const jobs = [];
  const sources = [];
  settled.forEach((result, idx) => {
    const name = providers[idx].name;
    if (result.status === 'fulfilled') {
      jobs.push(...result.value);
      sources.push({ name, ok: true, count: result.value.length });
    } else {
      sources.push({ name, ok: false, error: result.reason?.message || 'failed' });
    }
  });

  const deduped = dedupeJobs(jobs);
  deduped.sort((a, b) => (Date.parse(b.posted) || 0) - (Date.parse(a.posted) || 0));

  if (!deduped.length && sources.every((s) => !s.ok)) {
    throw new Error('All job sources are unavailable right now. Try again shortly.');
  }

  return { jobs: deduped.slice(0, limit), sources };
}
