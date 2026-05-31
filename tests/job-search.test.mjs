import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeRemotiveJob,
  normalizeArbeitnowJob,
  normalizeAdzunaJob,
  normalizeUsaJobsJob,
  dedupeJobs,
  jobMatchesQuery,
  detectAtsLabelFromUrl,
  searchJobs,
  listJobSources,
  resolveActiveSources,
  parseJobPay,
  jobPassesPayFilter,
} from '../lib/job-search.js';

test('normalizeRemotiveJob maps the common schema and strips HTML', () => {
  const job = normalizeRemotiveJob({
    id: 42,
    url: 'https://remotive.com/remote-jobs/software-dev/widget-eng-42',
    title: 'Senior Engineer',
    company_name: 'Widget Co',
    candidate_required_location: 'USA Only',
    salary: '$120k - $150k',
    job_type: 'full_time',
    publication_date: '2026-05-30T10:00:00',
    tags: ['react', 'node'],
    description: '<p>Build <b>things</b>&amp; ship</p>',
  });

  assert.equal(job.id, 'remotive:42');
  assert.equal(job.title, 'Senior Engineer');
  assert.equal(job.company, 'Widget Co');
  assert.equal(job.location, 'USA Only');
  assert.equal(job.salary, '$120k - $150k');
  assert.equal(job.remote, true);
  assert.equal(job.source, 'Remotive');
  assert.deepEqual(job.tags, ['react', 'node']);
  assert.equal(job.description, 'Build things & ship');
});

test('normalizeArbeitnowJob infers remote and reads unix timestamps', () => {
  const job = normalizeArbeitnowJob({
    slug: 'acme-dev',
    company_name: 'Acme',
    title: 'Backend Dev',
    description: 'Cool role',
    remote: true,
    url: 'https://boards.greenhouse.io/acme/jobs/123',
    tags: ['go'],
    job_types: ['full_time'],
    location: 'Berlin',
    created_at: 1748000000,
  });

  assert.equal(job.id, 'arbeitnow:acme-dev');
  assert.equal(job.remote, true);
  assert.equal(job.source, 'Arbeitnow');
  assert.equal(job.atsLabel, 'Greenhouse');
  assert.match(job.posted, /^20\d\d-/);
});

test('normalizeAdzunaJob maps schema, salary range, and employment type', () => {
  const job = normalizeAdzunaJob({
    id: 9,
    title: 'Data Engineer',
    company: { display_name: 'Initech' },
    location: { display_name: 'Remote, US' },
    salary_min: 110000,
    salary_max: 140000,
    contract_time: 'full_time',
    redirect_url: 'https://www.adzuna.com/land/ad/9',
    created: '2026-05-28T00:00:00Z',
    description: 'Pipelines',
  });

  assert.equal(job.id, 'adzuna:9');
  assert.equal(job.company, 'Initech');
  assert.equal(job.source, 'Adzuna');
  assert.equal(job.salary, '$110,000 - $140,000');
  assert.equal(job.employment_type, 'Full-time');
  assert.equal(job.remote, true);
});

test('normalizeUsaJobsJob maps the nested federal-job descriptor', () => {
  const job = normalizeUsaJobsJob({
    MatchedObjectId: 'ABC123',
    MatchedObjectDescriptor: {
      PositionTitle: 'IT Specialist',
      OrganizationName: 'Department of Commerce',
      PositionURI: 'https://www.usajobs.gov/job/123',
      PositionLocationDisplay: 'Washington, DC',
      PositionRemuneration: [{ MinimumRange: '90000', MaximumRange: '120000', RateIntervalCode: 'PA' }],
      PositionSchedule: [{ Name: 'Full-Time' }],
      PublicationStartDate: '2026-05-15',
      UserArea: { Details: { JobSummary: 'Serve the public.' } },
    },
  });

  assert.equal(job.id, 'usajobs:ABC123');
  assert.equal(job.title, 'IT Specialist');
  assert.equal(job.company, 'Department of Commerce');
  assert.equal(job.source, 'USAJOBS');
  assert.equal(job.salary, '$90,000 - $120,000');
  assert.equal(job.employment_type, 'Full-time');
  assert.equal(job.atsLabel, 'USAJOBS');
});

test('USAJOBS source is registered and gated on email + key', () => {
  const sources = listJobSources({});
  assert.ok(sources.find((s) => s.id === 'usajobs'));
  assert.equal(sources.find((s) => s.id === 'usajobs').available, false);

  const withCreds = listJobSources({ usajobs: { email: 'me@example.com', apiKey: 'k' } });
  assert.equal(withCreds.find((s) => s.id === 'usajobs').available, true);
});

test('detectAtsLabelFromUrl recognizes known applicant tracking systems', () => {
  assert.equal(detectAtsLabelFromUrl('https://jobs.lever.co/foo/bar'), 'Lever');
  assert.equal(detectAtsLabelFromUrl('https://acme.icims.com/jobs/9'), 'iCIMS');
  assert.equal(detectAtsLabelFromUrl('https://example.com/careers/9'), null);
});

test('jobMatchesQuery requires every token to appear somewhere', () => {
  const job = normalizeRemotiveJob({ title: 'React Engineer', company_name: 'Globex', tags: ['frontend'] });
  assert.equal(jobMatchesQuery(job, 'react'), true);
  assert.equal(jobMatchesQuery(job, 'react frontend'), true);
  assert.equal(jobMatchesQuery(job, 'react rust'), false);
  assert.equal(jobMatchesQuery(job, ''), true);
});

test('dedupeJobs removes same company+title and same url duplicates', () => {
  const jobs = [
    { title: 'Engineer', company: 'Acme', url: 'https://a.com/1' },
    { title: 'engineer', company: 'ACME', url: 'https://b.com/2' }, // dup by company+title
    { title: 'Designer', company: 'Acme', url: 'https://a.com/1' }, // dup by url
    { title: 'Designer', company: 'Globex', url: 'https://c.com/3' },
  ];
  const out = dedupeJobs(jobs);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'Engineer');
  assert.equal(out[1].company, 'Globex');
});

test('searchJobs merges sources, dedupes, sorts by recency, and reports source status', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('remotive.com')) {
      return {
        ok: true,
        json: async () => ({ jobs: [
          { id: 1, url: 'https://remotive.com/1', title: 'Platform Engineer', company_name: 'Acme', publication_date: '2026-05-20T00:00:00' },
        ] }),
      };
    }
    return {
      ok: true,
      json: async () => ({ data: [
        { slug: 'acme-plat', url: 'https://x.com/2', title: 'Platform Engineer', company_name: 'Acme', remote: true, created_at: 1700000000, location: 'Remote' },
        { slug: 'glx-fe', url: 'https://x.com/3', title: 'Frontend Engineer', company_name: 'Globex', remote: true, created_at: 1780272000, location: 'Remote' },
      ] }),
    };
  };

  const { jobs, sources } = await searchJobs('engineer', { fetchImpl });

  // Acme Platform Engineer appears in both sources → deduped to one.
  assert.equal(jobs.length, 2);
  // Newest (Globex, created_at 1748000000) sorts first.
  assert.equal(jobs[0].company, 'Globex');
  assert.equal(sources.find((s) => s.name === 'Remotive').ok, true);
  assert.equal(sources.find((s) => s.name === 'Arbeitnow').count, 2);
});

test('searchJobs includes Adzuna only when credentials are supplied', async () => {
  let adzunaCalled = false;
  const fetchImpl = async (url) => {
    if (url.includes('api.adzuna.com')) {
      adzunaCalled = true;
      return { ok: true, json: async () => ({ results: [
        { id: 7, title: 'ML Engineer', company: { display_name: 'Initech' }, location: { display_name: 'Remote' }, redirect_url: 'https://adzuna/7', created: '2026-05-29T00:00:00Z' },
      ] }) };
    }
    if (url.includes('remotive.com')) return { ok: true, json: async () => ({ jobs: [] }) };
    return { ok: true, json: async () => ({ data: [] }) };
  };

  const withoutCreds = await searchJobs('engineer', { fetchImpl });
  assert.equal(adzunaCalled, false);
  assert.equal(withoutCreds.sources.some((s) => s.name === 'Adzuna'), false);

  const withCreds = await searchJobs('engineer', {
    fetchImpl,
    config: { adzuna: { appId: 'id', appKey: 'key', country: 'us' } },
  });
  assert.equal(adzunaCalled, true);
  assert.equal(withCreds.sources.find((s) => s.name === 'Adzuna').ok, true);
  assert.ok(withCreds.jobs.some((j) => j.source === 'Adzuna'));
});

test('listJobSources reports availability based on supplied credentials', () => {
  const noKeys = listJobSources({});
  assert.equal(noKeys.find((s) => s.id === 'remotive').available, true);
  assert.equal(noKeys.find((s) => s.id === 'adzuna').available, false);

  const withKeys = listJobSources({ adzuna: { appId: 'a', appKey: 'b' } });
  assert.equal(withKeys.find((s) => s.id === 'adzuna').available, true);
});

test('resolveActiveSources honors the sources allow-list and availability', () => {
  // Allow-list narrows to one source.
  const only = resolveActiveSources({}, ['remotive']).map((s) => s.id);
  assert.deepEqual(only, ['remotive']);

  // Unavailable sources are dropped even if explicitly listed.
  const dropped = resolveActiveSources({}, ['adzuna', 'arbeitnow']).map((s) => s.id);
  assert.deepEqual(dropped, ['arbeitnow']);

  // No allow-list → every available source.
  const all = resolveActiveSources({}).map((s) => s.id);
  assert.deepEqual(all, ['remotive', 'arbeitnow']);
});

test('searchJobs only queries the selected sources', async () => {
  const hits = [];
  const fetchImpl = async (url) => {
    if (url.includes('remotive.com')) { hits.push('remotive'); return { ok: true, json: async () => ({ jobs: [] }) }; }
    if (url.includes('arbeitnow.com')) { hits.push('arbeitnow'); return { ok: true, json: async () => ({ data: [] }) }; }
    return { ok: true, json: async () => ({}) };
  };
  await searchJobs('dev', { fetchImpl, sources: ['arbeitnow'] });
  assert.deepEqual(hits, ['arbeitnow']);
});

test('parseJobPay reads ranges, k-suffixes, and hourly rates', () => {
  assert.deepEqual(parseJobPay('$130,000 - $176,000'), { min: 130000, max: 176000, hourly: false });
  assert.deepEqual(parseJobPay('$120k'), { min: 120000, max: 120000, hourly: false });
  assert.equal(parseJobPay('$50/hr').hourly, true);
  assert.equal(parseJobPay(''), null);
  assert.equal(parseJobPay('competitive'), null);
});

test('jobPassesPayFilter overlaps ranges and keeps unknown-salary jobs', () => {
  const annual = { enabled: true, mode: 'annual', min: 100, max: 200 }; // $100k–$200k
  assert.equal(jobPassesPayFilter({ salary: '$130,000 - $176,000' }, annual), true);
  assert.equal(jobPassesPayFilter({ salary: '$60,000' }, annual), false);
  assert.equal(jobPassesPayFilter({ salary: '' }, annual), true); // unknown → keep
  assert.equal(jobPassesPayFilter({ salary: '$60,000' }, { enabled: false }), true); // disabled

  // Hourly mode converts an hourly posting and compares in $/hr.
  const hourly = { enabled: true, mode: 'hourly', min: 40, max: 80 };
  assert.equal(jobPassesPayFilter({ salary: '$50/hr' }, hourly), true);
  assert.equal(jobPassesPayFilter({ salary: '$20/hr' }, hourly), false);
});

test('searchJobs throws only when every source fails', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(() => searchJobs('engineer', { fetchImpl }), /unavailable/i);
});
