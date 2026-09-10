import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

function setupDom() {
  const dom = new JSDOM(`
    <input id="custom-source-name" />
    <input id="custom-source-url" />
    <div id="custom-source-status"></div>
    <ul id="custom-job-sources-list"></ul>
  `, { url: 'https://example.com/popup' });
  global.window = dom.window;
  global.document = dom.window.document;
  return dom;
}

/** A `chrome` stub whose `runtime.sendMessage` resolves with `response`. */
function chromeThatResolves(response) {
  return {
    runtime: {
      sendMessage: (msg, cb) => cb(response),
    },
  };
}

test('addCustomJobSource only commits and renders the new source once the save succeeds', async () => {
  setupDom();
  global.chrome = chromeThatResolves({ success: true });
  const { addCustomJobSource, renderCustomJobSourcesList } = await import('../popup/ai/ai.js');

  renderCustomJobSourcesList([]);
  document.getElementById('custom-source-name').value = 'JOBS4TN';
  document.getElementById('custom-source-url').value = 'https://jobs4tn.gov/rss';

  await addCustomJobSource();

  const items = document.querySelectorAll('#custom-job-sources-list .custom-source-item');
  assert.equal(items.length, 1);
  assert.match(items[0].querySelector('.custom-source-item-label').textContent, /JOBS4TN/);
  assert.match(document.getElementById('custom-source-status').textContent, /Added/);
});

test('addCustomJobSource does not commit or render when the background save fails', async () => {
  setupDom();
  // sendMessage resolves null on a runtime error/timeout — no thrown rejection.
  global.chrome = chromeThatResolves(null);
  const { addCustomJobSource, renderCustomJobSourcesList } = await import('../popup/ai/ai.js?failcase=1');

  renderCustomJobSourcesList([]);
  document.getElementById('custom-source-name').value = 'JOBS4TN';
  document.getElementById('custom-source-url').value = 'https://jobs4tn.gov/rss';

  await addCustomJobSource();

  const items = document.querySelectorAll('#custom-job-sources-list .custom-source-item');
  assert.equal(items.length, 0, 'a failed save must not leave the UI showing an unpersisted source');
  assert.match(document.getElementById('custom-source-status').textContent, /Failed to save/);
});

test('removeCustomJobSource does not remove the item from the rendered list when the save fails', async () => {
  setupDom();
  global.chrome = chromeThatResolves({ success: true });
  const mod = await import('../popup/ai/ai.js?failcase=2');
  mod.renderCustomJobSourcesList([{ id: 'custom-jobs4tn-1', label: 'JOBS4TN', url: 'https://jobs4tn.gov/rss' }]);

  // Now make the next save (the removal) fail.
  global.chrome = chromeThatResolves(null);
  await mod.removeCustomJobSource('custom-jobs4tn-1');

  const items = document.querySelectorAll('#custom-job-sources-list .custom-source-item');
  assert.equal(items.length, 1, 'a failed removal save must leave the previously-persisted source visible');
  assert.match(document.getElementById('custom-source-status').textContent, /Failed to remove/);
});
