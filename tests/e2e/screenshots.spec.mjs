/**
 * Screenshot capture spec — generates README gallery images.
 *
 * Loads popup.html via file:// URL with an inline chrome mock, navigates
 * to each major screen, and saves PNGs to screenshots/.
 *
 * NOTE: page.exposeFunction does NOT work with file:// URLs (WebSocket bridge
 * is blocked). All mock data must be inlined via addInitScript. Screens may
 * appear empty if the SW message round-trip doesn't complete — that is expected
 * in headless Playwright. For fully-populated gallery shots load the extension
 * in a real Chrome profile.
 *
 * Usage:
 *   docker run --name ss apply-plugin-e2e npx playwright test tests/e2e/screenshots.spec.mjs
 *   docker cp ss:/app/screenshots/. screenshots/
 *   docker rm ss
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from '@playwright/test';

const POPUP_BASE = pathToFileURL(path.resolve(process.cwd(), 'popup/popup.html')).toString();
const POPUP_URL = POPUP_BASE + '?standalone=1';

// ── Inline mock data (must be JSON-serialisable — no functions) ───────────────

const MOCK_STATE = {
  hasResume: true,
  hasApiKey: true,
  apiKey: 'AIzaSy_mock',
  geminiModel: 'gemini-2.5-flash',
  resumeName: 'Alex-Chen-Resume.pdf',
  settings: {
    gemini_api_key: 'AIzaSy_mock',
    gemini_model: 'auto',
    preferred_salary_min: 150000,
    preferred_salary_max: 220000,
    preferred_remote: true,
    work_authorization: 'US Citizen',
    privacy_consent: true,
    privacy_consent_at: '2026-05-15T14:23:00.000Z',
  },
  profile: {
    full_name: 'Alex Chen',
    email: 'alex.chen@email.com',
    phone: '(415) 555-0198',
    location: 'San Francisco, CA',
    linkedin: 'https://linkedin.com/in/alexchen',
    github: 'https://github.com/alexchen',
    current_company: 'Acme Corp',
    current_title: 'Senior Software Engineer',
    years_of_experience: '7',
    work_authorization: 'US Citizen',
    start_date: '2 weeks',
    availability: 'Two weeks notice',
  },
  profileCompleteness: { completed: 8, total: 8 },
  learnedDefaultsCount: 12,
  privacyConsent: true,
  currentAts: null,
  lastAnswers: null,
  lastFillReport: null,
  lastTrackedApplicationId: null,
  resumeAttachment: {
    name: 'Alex-Chen-Resume.pdf',
    source: 'upload',
    updatedAt: '2026-05-10T09:00:00.000Z',
    preview: 'Alex Chen — Senior Software Engineer',
    hasDownload: true,
    downloadLabel: 'Download copy',
  },
  applications: [
    { id: 'a1', company: 'Anthropic', title: 'Staff Engineer', status: 'interviewed', date: '2026-05-20', remote: true, location: 'San Francisco, CA', salary_range: '$200k–$280k', pay_min: 200000, pay_max: 280000, url: 'https://anthropic.com/careers', sentiment: 'excited', score: 5, sort_order: 0 },
    { id: 'a2', company: 'Stripe', title: 'Senior Backend Engineer', status: 'submitted', date: '2026-05-18', remote: false, location: 'San Francisco, CA', salary_range: '$180k–$240k', pay_min: 180000, pay_max: 240000, url: 'https://stripe.com/jobs', sentiment: 'positive', score: 4, sort_order: 1 },
    { id: 'a3', company: 'Linear', title: 'Product Engineer', status: 'drafted', date: '2026-05-22', remote: true, location: 'Remote', salary_range: '$160k–$210k', pay_min: 160000, pay_max: 210000, url: 'https://linear.app/careers', sort_order: 2 },
    { id: 'a4', company: 'Vercel', title: 'Full Stack Engineer', status: 'drafted', date: '2026-05-23', remote: true, location: 'Remote', url: 'https://vercel.com/careers', sort_order: 3 },
    { id: 'a5', company: 'Figma', title: 'Infrastructure Engineer', status: 'rejected', date: '2026-05-08', remote: false, location: 'San Francisco, CA', sort_order: 4 },
  ],
};

const MOCK_SOURCES = [
  { id: 'remotive', label: 'Remotive', keyless: true, available: true, session: false },
  { id: 'arbeitnow', label: 'Arbeitnow', keyless: true, available: true, session: false },
  { id: 'themuse', label: 'The Muse', keyless: true, available: true, session: false },
  { id: 'remoteok', label: 'Remote OK', keyless: true, available: true, session: false },
  { id: 'jobicy', label: 'Jobicy', keyless: true, available: true, session: false },
  { id: 'workingnomads', label: 'Working Nomads', keyless: true, available: true, session: false },
  { id: 'hn-hiring', label: "HN: Who's Hiring", keyless: true, available: true, session: false },
  { id: 'weworkremotely', label: 'We Work Remotely', keyless: true, available: true, session: false },
  { id: 'remoteco', label: 'remote.co', keyless: true, available: true, session: false },
  { id: 'adzuna', label: 'Adzuna', keyless: false, available: false, requires: 'Adzuna API keys', session: false },
  { id: 'usajobs', label: 'USAJOBS', keyless: false, available: false, requires: 'USAJOBS API key', session: false },
  { id: 'reed', label: 'Reed', keyless: false, available: false, requires: 'Reed API key', session: false },
  { id: 'jooble', label: 'Jooble', keyless: false, available: false, requires: 'Jooble API key', session: false },
  { id: 'linkedin', label: 'LinkedIn', keyless: false, available: false, session: true, requires: 'Sign in to LinkedIn in any tab' },
];

const MOCK_LEARNED = [
  { question: 'Years of experience with TypeScript?', answer: '5' },
  { question: 'Are you comfortable with remote work?', answer: 'Yes, fully remote preferred' },
  { question: 'Expected compensation range?', answer: '$150,000–$200,000' },
  { question: 'Do you require visa sponsorship?', answer: 'No' },
];

// ── Mock setup (inline only — exposeFunction crashes file:// pages) ────────────

async function setupMock(page) {
  await page.addInitScript(({ state, sources, learned }) => {
    const noop = () => {};

    function chromeSendMessage(msg, cb) {
      let result;
      if (msg && msg.type === 'GET_STATE') result = state;
      else if (msg && msg.type === 'GET_JOB_SOURCES') result = { success: true, sources };
      else if (msg && msg.type === 'GET_LEARNED_DEFAULTS') result = { success: true, items: learned, ignoredItems: [] };
      else result = { success: true };
      // Defer callback to next tick so callers using Promise.resolve chains work
      if (typeof cb === 'function') {
        setTimeout(() => cb(result), 0);
      }
      return Promise.resolve(result);
    }

    window.chrome = {
      runtime: {
        lastError: null,
        id: 'mock-ext-id',
        sendMessage: chromeSendMessage,
        onMessage: { addListener: noop, removeListener: noop },
        getURL: (p) => `chrome-extension://mock/${p}`,
      },
      storage: {
        local: {
          get: (_k, cb) => { setTimeout(() => { if (typeof cb === 'function') cb({}); }, 0); return Promise.resolve({}); },
          set: (_v, cb) => { setTimeout(() => { if (typeof cb === 'function') cb(); }, 0); return Promise.resolve(); },
          remove: (_k, cb) => { setTimeout(() => { if (typeof cb === 'function') cb(); }, 0); return Promise.resolve(); },
        },
      },
      tabs: { query: async () => [], sendMessage: async () => ({}), create: async () => ({ id: 1 }) },
      scripting: { executeScript: async () => [] },
      cookies: { get: async () => null, getAll: async () => [] },
      identity: { getRedirectURL: () => 'https://mock.chromiumapp.org/callback' },
    };
  }, { state: MOCK_STATE, sources: MOCK_SOURCES, learned: MOCK_LEARNED });
}

async function loadPopup(page) {
  await setupMock(page);
  await page.goto(POPUP_URL);
  // Give the popup time to boot; waitForFunction is fine with file:// (uses CDP).
  await page.waitForFunction(
    () => !!document.querySelector('.screen:not(.hidden)'),
    { timeout: 6000 }
  ).catch(() => {
    // Screen never appeared — chrome mock may not have propagated.
    // Continue anyway; screenshot captures the header shell.
  });
  await page.waitForTimeout(300);
}

// ── Screenshot tests ──────────────────────────────────────────────────────────

test('screenshot: main dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 640 });
  await loadPopup(page);
  await page.screenshot({ path: 'screenshots/main-dashboard.png' });
});

test('screenshot: tracker workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 780 });
  await loadPopup(page);
  const btn = page.locator('#header-tracker-btn');
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForFunction(() => !document.getElementById('tracker-screen')?.classList.contains('hidden'), { timeout: 4000 }).catch(() => {});
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/tracker-workspace.png' });
});

test('screenshot: profile and memory', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 860 });
  await loadPopup(page);
  const btn = page.locator('#header-profile-btn');
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForFunction(() => !document.getElementById('setup-screen')?.classList.contains('hidden'), { timeout: 4000 }).catch(() => {});
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/profile-memory.png' });
});

test('screenshot: job search panel', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 780 });
  await loadPopup(page);
  const btn = page.locator('#header-job-search-btn');
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForFunction(() => !document.getElementById('job-search-screen')?.classList.contains('hidden'), { timeout: 4000 }).catch(() => {});
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/job-search.png' });
});

test('screenshot: AI settings panel', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 780 });
  await loadPopup(page);
  const btn = page.locator('#header-ai-btn');
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForFunction(() => !document.getElementById('ai-screen')?.classList.contains('hidden'), { timeout: 4000 }).catch(() => {});
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/ai-settings.png' });
});
