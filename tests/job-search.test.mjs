import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeRemotiveJob,
  normalizeArbeitnowJob,
  dedupeJobs,
  jobMatchesQuery,
  detectAtsLabelFromUrl,
  searchJobs,
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
  assert.equal(job.description, 'Build things& ship');
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
        { slug: 'glx-fe', url: 'https://x.com/3', title: 'Frontend Engineer', company_name: 'Globex', remote: true, created_at: 1748000000, location: 'Remote' },
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

test('searchJobs throws only when every source fails', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(() => searchJobs('engineer', { fetchImpl }), /unavailable/i);
});
