// job-search.js
// Job search panel: pick which sources to query (plug-and-play registry on the
// service-worker side), filter by pay, render a results grid, and save a result
// straight into the tracker.

import { esc, escAttr, sendMessage } from '../../lib/utils.js';
import { isStandaloneView, openExpandedWorkspace } from '../ux/navigation.js';
import { jobPassesPayFilter } from '../../lib/job-search.js';

const lastResultsById = new Map();
const selectedSourceIds = new Set();
let sourceSelectionSeeded = false;

// Unfiltered results from the last query, so pay-filter tweaks re-filter locally
// without re-hitting the network.
let lastRawResults = [];
let lastSources = [];

// ── Pay filter state ─────────────────────────────────────────────────────────

const PAY_RANGES = {
  annual: { min: 0, max: 500, step: 5 },   // values are thousands ($k)
  hourly: { min: 0, max: 200, step: 1 },    // values are $/hr
};
const payFilter = { enabled: false, mode: 'annual', min: 0, max: 500 };
let payDefaultsSeeded = false;

function fmtPayValue(v, mode) {
  return mode === 'hourly' ? `$${v}/hr` : `$${v}k`;
}

function payReadoutText() {
  if (!payFilter.enabled) return 'Any pay';
  const { min, max } = PAY_RANGES[payFilter.mode];
  const lo = fmtPayValue(payFilter.min, payFilter.mode);
  const hi = payFilter.max >= max ? `${fmtPayValue(max, payFilter.mode)}+` : fmtPayValue(payFilter.max, payFilter.mode);
  const open = payFilter.min <= min && payFilter.max >= max;
  return open ? `Any ${payFilter.mode} pay` : `${lo} – ${hi} (${payFilter.mode})`;
}

function syncPayUi() {
  const minEl = document.getElementById('pay-filter-min');
  const maxEl = document.getElementById('pay-filter-max');
  const readout = document.getElementById('pay-filter-readout');
  const { min, max, step } = PAY_RANGES[payFilter.mode];
  [minEl, maxEl].forEach((el) => {
    if (!el) return;
    el.min = String(min);
    el.max = String(max);
    el.step = String(step);
    el.disabled = !payFilter.enabled;
  });
  if (minEl) minEl.value = String(payFilter.min);
  if (maxEl) maxEl.value = String(payFilter.max);
  if (readout) readout.textContent = payReadoutText();
  document.querySelectorAll('.job-pay-mode').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.mode === payFilter.mode);
  });
}

async function seedPayDefaultsFromMemory() {
  if (payDefaultsSeeded) return;
  payDefaultsSeeded = true;
  try {
    const state = await sendMessage({ type: 'GET_STATE' });
    const min = Number(state?.settings?.preferred_salary_min);
    const max = Number(state?.settings?.preferred_salary_max);
    if (Number.isFinite(min) && min > 0) payFilter.min = Math.min(500, Math.round(min / 1000));
    if (Number.isFinite(max) && max > 0) payFilter.max = Math.min(500, Math.round(max / 1000));
  } catch {
    // No settings — leave the full default range.
  }
}

// ── Source filter chips ──────────────────────────────────────────────────────

export async function loadJobSources() {
  let sources = [];
  try {
    const resp = await sendMessage({ type: 'GET_JOB_SOURCES' });
    sources = resp?.sources || [];
  } catch {
    sources = [];
  }
  if (!sourceSelectionSeeded) {
    sources.filter((s) => s.available).forEach((s) => selectedSourceIds.add(s.id));
    sourceSelectionSeeded = true;
  }
  const availableIds = new Set(sources.filter((s) => s.available).map((s) => s.id));
  [...selectedSourceIds].forEach((id) => { if (!availableIds.has(id)) selectedSourceIds.delete(id); });

  renderSourceChips(sources);
  await seedPayDefaultsFromMemory();
  syncPayUi();
  return sources;
}

function renderSourceChips(sources) {
  const container = document.getElementById('job-source-filters');
  if (!container) return;
  if (!sources.length) {
    container.innerHTML = '<span class="helper-text">No sources available.</span>';
    return;
  }
  container.innerHTML = sources.map((s) => {
    const selected = s.available && selectedSourceIds.has(s.id);
    const classes = ['job-source-chip'];
    if (selected) classes.push('is-active');
    if (!s.available) classes.push('is-unavailable');
    const title = s.available ? `Toggle ${s.label}` : `${s.label} — add ${s.requires || 'credentials'} to enable`;
    return `<button type="button" class="${classes.join(' ')}" data-source-id="${escAttr(s.id)}"${s.available ? '' : ' disabled'} aria-pressed="${selected ? 'true' : 'false'}" title="${escAttr(title)}">${esc(s.label)}${s.available ? '' : ' 🔒'}</button>`;
  }).join('');
}

// ── Results ──────────────────────────────────────────────────────────────────

function applyAndRender() {
  const filtered = lastRawResults.filter((j) => jobPassesPayFilter(j, payFilter));
  renderJobSearchResults(filtered, lastSources);
}

export function renderJobSearchResults(results, sources = []) {
  const resultsDiv = document.getElementById('job-search-results');
  if (!resultsDiv) return;

  lastResultsById.clear();
  (results || []).forEach((job) => { if (job?.id) lastResultsById.set(job.id, job); });

  const sourceNote = renderSourceNote(sources);

  if (!results || results.length === 0) {
    const note = payFilter.enabled && lastRawResults.length
      ? '<p class="empty-msg">No jobs match the current pay filter.</p>'
      : '<p class="empty-msg">No jobs found for this search.</p>';
    resultsDiv.innerHTML = sourceNote + note;
    return;
  }

  resultsDiv.innerHTML = sourceNote + results.map((j) => {
    const badges = [
      j.remote ? '<span class="job-badge job-badge-remote">Remote</span>' : '',
      j.employment_type ? `<span class="job-badge">${esc(j.employment_type)}</span>` : '',
      j.salary ? `<span class="job-badge job-badge-salary">${esc(j.salary)}</span>` : '',
      `<span class="job-badge job-badge-source">${esc(j.source || 'Web')}</span>`,
    ].filter(Boolean).join('');
    const ctaLabel = j.atsLabel ? `Apply on ${esc(j.atsLabel)} →` : 'Go to job post →';
    return `
    <div class="job-search-result" data-job-id="${escAttr(j.id)}">
      <div class="job-title">${esc(j.title || 'Untitled role')}</div>
      <div class="job-meta">${esc(j.company || 'Unknown company')} • ${esc(j.location || 'Location n/a')}</div>
      <div class="job-badges">${badges}</div>
      <div class="job-result-actions">
        <a href="${escAttr(j.url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-xs job-link">${ctaLabel}</a>
        <button type="button" class="btn btn-primary btn-xs job-save-btn" data-job-id="${escAttr(j.id)}">＋ Save to Tracker</button>
      </div>
    </div>`;
  }).join('');
}

function renderSourceNote(sources = []) {
  if (!Array.isArray(sources) || !sources.length) return '';
  const parts = sources.map((s) => s.ok ? `${esc(s.name)} (${Number(s.count) || 0})` : `${esc(s.name)} unavailable`);
  return `<p class="job-source-note helper-text">Sources: ${parts.join(' · ')}</p>`;
}

async function saveJobToTracker(jobId, button) {
  const job = lastResultsById.get(jobId);
  if (!job) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const resp = await sendMessage({
      type: 'LOG_APPLICATION',
      payload: {
        company: job.company, title: job.title, url: job.url, status: 'drafted',
        location: job.location, employment_type: job.employment_type, remote: !!job.remote,
        salary_range: job.salary || '', description: job.description || '',
        jd_snippet: (job.description || '').slice(0, 300), answers_generated: false, fill_report: null,
      },
    });
    if (!resp?.success) throw new Error(resp?.error || 'Could not save job.');
    button.textContent = '✓ Saved';
    button.classList.add('is-saved');
  } catch (err) {
    button.disabled = false;
    button.textContent = original;
    console.warn('[apply-bot] Failed to save job to tracker.', err);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initJobSearchHandlers(showScreen) {
  // Job Search lives in the expanded workspace, not the toolbar popup.
  const openPanel = async () => {
    if (!isStandaloneView()) {
      const opened = await openExpandedWorkspace('job-search');
      if (opened) return;
    }
    showScreen('job-search');
    await loadJobSources();
  };
  document.getElementById('job-search-btn')?.addEventListener('click', openPanel);
  document.getElementById('header-job-search-btn')?.addEventListener('click', openPanel);

  const jobSearchInput = document.getElementById('job-search-input');
  const jobSearchSubmitBtn = document.getElementById('job-search-submit-btn');
  const resultsDiv = document.getElementById('job-search-results');

  if (jobSearchSubmitBtn && jobSearchInput) {
    jobSearchSubmitBtn.onclick = async () => {
      const query = jobSearchInput.value.trim();
      if (!selectedSourceIds.size) {
        if (resultsDiv) resultsDiv.innerHTML = '<p class="empty-msg">Select at least one source above.</p>';
        return;
      }
      jobSearchSubmitBtn.disabled = true;
      jobSearchSubmitBtn.textContent = 'Searching…';
      if (resultsDiv) resultsDiv.innerHTML = '<p class="empty-msg">Searching across job boards…</p>';
      try {
        const resp = await sendMessage({ type: 'SEARCH_JOBS', payload: { query, sources: [...selectedSourceIds] } });
        if (!resp?.success) throw new Error(resp?.error || 'Search failed.');
        lastRawResults = resp.jobs || [];
        lastSources = resp.sources || [];
        applyAndRender();
      } catch (err) {
        lastRawResults = [];
        if (resultsDiv) resultsDiv.innerHTML = `<p class="empty-msg">❌ ${esc(err?.message || 'Job search failed.')}</p>`;
      } finally {
        jobSearchSubmitBtn.disabled = false;
        jobSearchSubmitBtn.textContent = 'Search';
      }
    };
    jobSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') jobSearchSubmitBtn.click(); });
  }

  // Source filter chips.
  document.getElementById('job-source-filters')?.addEventListener('click', (event) => {
    const chip = event.target.closest('.job-source-chip');
    if (!chip || chip.disabled) return;
    const id = chip.dataset.sourceId;
    if (!id) return;
    if (selectedSourceIds.has(id)) selectedSourceIds.delete(id); else selectedSourceIds.add(id);
    chip.classList.toggle('is-active', selectedSourceIds.has(id));
    chip.setAttribute('aria-pressed', String(selectedSourceIds.has(id)));
  });

  // Pay filter controls.
  document.getElementById('pay-filter-enabled')?.addEventListener('change', (e) => {
    payFilter.enabled = !!e.target.checked;
    syncPayUi();
    applyAndRender();
  });
  document.querySelectorAll('.job-pay-mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (payFilter.mode === btn.dataset.mode) return;
      payFilter.mode = btn.dataset.mode === 'hourly' ? 'hourly' : 'annual';
      const range = PAY_RANGES[payFilter.mode];
      payFilter.min = range.min;
      payFilter.max = range.max;
      syncPayUi();
      applyAndRender();
    });
  });
  const onPaySlide = () => {
    const minEl = document.getElementById('pay-filter-min');
    const maxEl = document.getElementById('pay-filter-max');
    let lo = Number(minEl?.value);
    let hi = Number(maxEl?.value);
    if (lo > hi) { [lo, hi] = [hi, lo]; if (minEl) minEl.value = String(lo); if (maxEl) maxEl.value = String(hi); }
    payFilter.min = lo;
    payFilter.max = hi;
    const readout = document.getElementById('pay-filter-readout');
    if (readout) readout.textContent = payReadoutText();
    applyAndRender();
  };
  document.getElementById('pay-filter-min')?.addEventListener('input', onPaySlide);
  document.getElementById('pay-filter-max')?.addEventListener('input', onPaySlide);

  // Save-to-Tracker.
  if (resultsDiv) {
    resultsDiv.addEventListener('click', (event) => {
      const saveBtn = event.target.closest('.job-save-btn');
      if (!saveBtn) return;
      const jobId = saveBtn.dataset.jobId || '';
      if (jobId) saveJobToTracker(jobId, saveBtn);
    });
  }

  document.getElementById('job-search-back-btn')?.addEventListener('click', () => {
    if (isStandaloneView()) { window.close(); return; }
    showScreen('main');
  });

  // If we loaded straight into the standalone job-search view, populate it.
  if (isStandaloneView() && new URLSearchParams(window.location.search).get('screen') === 'job-search') {
    loadJobSources();
  }
}
