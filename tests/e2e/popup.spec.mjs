import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';

function installChromeMock() {
  const noop = () => {};
  return {
    runtime: {
      lastError: null,
      sendMessage: (_msg, cb) => cb?.({ ok: true }),
      onMessage: { addListener: noop, removeListener: noop },
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://example.com/job' }],
      sendMessage: (_tabId, _msg, cb) => cb?.({ ok: true }),
    },
    scripting: {
      executeScript: async () => [],
    },
    storage: {
      local: {
        get: (_keys, cb) => {
          if (typeof cb === 'function') cb({});
          return Promise.resolve({});
        },
        set: (_value, cb) => {
          if (typeof cb === 'function') cb();
          return Promise.resolve();
        },
      },
    },
  };
}


test('popup renders shell and primary workspace actions', async ({ page }) => {
  await page.addInitScript(() => {
    window.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_msg, cb) => cb?.({ ok: true }),
        onMessage: { addListener: () => {}, removeListener: () => {} },
      },
      tabs: {
        query: async () => [{ id: 1, url: 'https://example.com/job' }],
        sendMessage: (_tabId, _msg, cb) => cb?.({ ok: true }),
      },
      scripting: { executeScript: async () => [] },
      storage: {
        local: {
          get: (_keys, cb) => {
            if (typeof cb === 'function') cb({});
            return Promise.resolve({});
          },
          set: (_value, cb) => {
            if (typeof cb === 'function') cb();
            return Promise.resolve();
          },
        },
      },
    };
  });
  const popupUrl = pathToFileURL(path.resolve(process.cwd(), 'popup/popup.html')).toString();
  await page.goto(popupUrl);

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#header-job-search-btn')).toBeVisible();
  await expect(page.locator('#header-tracker-btn')).toBeVisible();
  await expect(page.locator('#header-ai-btn')).toBeVisible();
  await expect(page.locator('#header-help-btn')).toBeVisible();
});

test('setup profile workspace remains visible for first-load state', async ({ page }) => {
  await page.addInitScript(() => {
    window.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_msg, cb) => cb?.({ ok: true }),
        onMessage: { addListener: () => {}, removeListener: () => {} },
      },
      tabs: {
        query: async () => [{ id: 1, url: 'https://example.com/job' }],
        sendMessage: (_tabId, _msg, cb) => cb?.({ ok: true }),
      },
      scripting: { executeScript: async () => [] },
      storage: {
        local: {
          get: (_keys, cb) => {
            if (typeof cb === 'function') cb({});
            return Promise.resolve({});
          },
          set: (_value, cb) => {
            if (typeof cb === 'function') cb();
            return Promise.resolve();
          },
        },
      },
    };
  });
  const popupUrl = pathToFileURL(path.resolve(process.cwd(), 'popup/popup.html')).toString();
  await page.goto(popupUrl);

  await expect(page.locator('#setup-screen')).toHaveCount(1);
  await expect(page.locator('#profile-resume-section')).toHaveCount(1);
  await expect(page.locator('#profile-privacy-section')).toHaveCount(1);
});
