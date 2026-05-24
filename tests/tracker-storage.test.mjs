import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addApplication,
  deleteApplication,
  getApplications,
  importApplicationsFromCsv,
  updateApplication,
  updateApplicationStatus,
} from '../lib/tracker.js';

function installChromeStorageMock(seed = {}) {
  const state = { ...seed };
  global.chrome = {
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') {
            return { [key]: state[key] };
          }
          if (Array.isArray(key)) {
            return Object.fromEntries(key.map((item) => [item, state[item]]));
          }
          return { ...state };
        },
        async set(value) {
          Object.assign(state, value);
        },
      },
    },
  };
  return state;
}

test('tracker CRUD helpers persist and normalize stored applications', async () => {
  const state = installChromeStorageMock({ applications: [] });

  const saved = await addApplication({
    company: 'Acme',
    title: 'Platform Engineer',
    url: 'https://example.com/jobs/acme',
    status: 'applied',
    salary_range: '$120,000 - $140,000',
    location: 'Remote',
  });

  assert.equal(saved.status, 'submitted');
  assert.equal(saved.pay_min, 120000);
  assert.equal(saved.pay_max, 140000);

  const updated = await updateApplication(saved.id, {
    status: 'interview',
    verdict: 'Strong fit',
    remote: true,
  });

  assert.equal(updated.status, 'interview');
  assert.equal(updated.verdict, 'Strong fit');
  assert.equal(updated.remote, true);

  const statusUpdated = await updateApplicationStatus(saved.id, 'offer');
  assert.equal(statusUpdated, true);

  const apps = await getApplications();
  assert.equal(apps.length, 1);
  assert.equal(apps[0].status, 'offer');

  const imported = await importApplicationsFromCsv(`Company,Role Title,Status,Date,Remote,Location,URL,Notes\nNorthwind,Infra Engineer,Applied,2026-05-01,Yes,Denver,https://example.com/jobs/northwind,Great role`);
  assert.equal(imported.imported, 1);
  assert.equal(state.applications.length, 2);

  const removed = await deleteApplication(saved.id);
  assert.equal(removed.id, saved.id);

  const finalApps = await getApplications();
  assert.equal(finalApps.length, 1);
  assert.equal(finalApps[0].company, 'Northwind');
});
