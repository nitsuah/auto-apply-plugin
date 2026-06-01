// job-search.js
// Job search panel: pick sources (plug-and-play registry), filter by pay,
// render a results grid, and save a result straight into the tracker.

import { esc, escAttr, sendMessage } from '../../lib/utils.js';
import { isStandaloneView, openExpandedWorkspace } from '../ux/navigation.js';
import { jobPassesPayFilter } from '../../lib/job-search.js';

const lastResultsById = new Map();
const selectedSourceIds = new Set();
let sourceSelectionSeeded = false;
let lastRawResults = [];
let lastSources = [];

// ── Pay filter state ─────────────────────────────────────────────────────────

const PAY_RANGES = {
  annual: { min: 0, max: 500, step: 5, unit: 'K' },   // values are thousands ($k)
  hourly: { min: 0, max: 200, step: 1, unit: '$/hr' }, // values are $/hr
};
const payFilter = { mode: 'annual', min: 0, max: 500 };
let payDefaultsSeeded = false;
let prefsLoaded = false;

// ── Persisted preferences (sources + pay filter) ─────────────────────────────

function saveJobPrefs() {
  try {
    chrome.storage?.local?.set?.({
      jobSearchPrefs: {
        sources: [...selectedSourceIds],
        pay: { mode: payFilter.mode, min: payFilter.min, max: payFilter.max },
      },
    });
  } catch {
    // Non-extension context — ignore.
  }
}

async function restoreJobPrefs() {
  try {
    const data = await chrome.storage?.local?.get?.('jobSearchPrefs');
    const prefs = data?.jobSearchPrefs;
    if (!prefs) return;
    if (Array.isArray(prefs.sources)) {
      selectedSourceIds.clear();
      prefs.sources.forEach((id) => selectedSourceIds.add(id));
      sourceSelectionSeeded = true;
    }
    if (prefs.pay && (prefs.pay.mode === 'annual' || prefs.pay.mode === 'hourly')) {
      payFilter.mode = prefs.pay.mode;
      const r = PAY_RANGES[payFilter.mode];
      payFilter.min = Math.min(r.max, Math.max(r.min, Number(prefs.pay.min) || r.min));
      payFilter.max = Math.min(r.max, Math.max(r.min, Number(prefs.pay.max) || r.max));
      payDefaultsSeeded = true;
    }
  } catch {
    // ignore
  }
}

function payIsActive() {
  const r = PAY_RANGES[payFilter.mode];
  return payFilter.min > r.min || payFilter.max < r.max;
}

function fmtPayValue(v, mode) {
  return mode === 'hourly' ? `$${v}` : `$${v}k`;
}

function payReadoutText() {
  if (!payIsActive()) return 'Any pay';
  const r = PAY_RANGES[payFilter.mode];
  const lo = fmtPayValue(payFilter.min, payFilter.mode);
  const hi = payFilter.max >= r.max ? `${fmtPayValue(r.max, payFilter.mode)}+` : fmtPayValue(payFilter.max, payFilter.mode);
  const suffix = payFilter.mode === 'hourly' ? '/hr' : '';
  return `${lo} – ${hi}${suffix}`;
}

function syncPayUi() {
  const r = PAY_RANGES[payFilter.mode];
  const minSlider = document.getElementById('pay-filter-min');
  const maxSlider = document.getElementById('pay-filter-max');
  const minNum = document.getElementById('pay-min-num');
  const maxNum = document.getElementById('pay-max-num');
  [minSlider, maxSlider, minNum, maxNum].forEach((el) => {
    if (!el) return;
    el.min = String(r.min);
    el.max = String(r.max);
    el.step = String(r.step);
  });
  if (minSlider) minSlider.value = String(payFilter.min);
  if (maxSlider) maxSlider.value = String(payFilter.max);
  if (minNum) minNum.value = String(payFilter.min);
  if (maxNum) maxNum.value = String(payFilter.max);
  const unitMin = document.getElementById('pay-unit-min');
  const unitMax = document.getElementById('pay-unit-max');
  if (unitMin) unitMin.textContent = r.unit;
  if (unitMax) unitMax.textContent = r.unit;
  const readout = document.getElementById('pay-filter-readout');
  if (readout) readout.textContent = payReadoutText();
  document.querySelectorAll('.job-pay-mode').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.mode === payFilter.mode);
  });
}

function setPayFromInputs(rawMin, rawMax) {
  const r = PAY_RANGES[payFilter.mode];
  const clamp = (v) => Math.min(r.max, Math.max(r.min, Math.round((Number(v) || 0) / r.step) * r.step));
  let lo = clamp(rawMin);
  let hi = clamp(rawMax);
  if (lo > hi) [lo, hi] = [hi, lo];
  payFilter.min = lo;
  payFilter.max = hi;
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
    // No settings — keep the full default range.
  }
}

// ── Source filter chips ──────────────────────────────────────────────────────

export async function loadJobSources() {
  if (!prefsLoaded) {
    await restoreJobPrefs();
    prefsLoaded = true;
  }
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
    const title = s.available
      ? `Toggle ${s.label}`
      : `${s.label} — click to configure ${s.requires || 'credentials'}`;
    return `<button type="button" class="${classes.join(' ')}" data-source-id="${escAttr(s.id)}" data-available="${s.available ? '1' : '0'}" aria-pressed="${selected ? 'true' : 'false'}" title="${escAttr(title)}">${esc(s.label)}${s.available ? '' : ' 🔒'}</button>`;
  }).join('');
}

// ── Results ──────────────────────────────────────────────────────────────────

function applyAndRender() {
  const filter = { enabled: payIsActive(), mode: payFilter.mode, min: payFilter.min, max: payFilter.max };
  const filtered = lastRawResults.filter((j) => jobPassesPayFilter(j, filter));
  renderJobSearchResults(filtered, lastSources);
}

export function renderJobSearchResults(results, sources = []) {
  const resultsDiv = document.getElementById('job-search-results');
  if (!resultsDiv) return;

  lastResultsById.clear();
  (results || []).forEach((job) => { if (job?.id) lastResultsById.set(job.id, job); });

  const sourceNote = renderSourceNote(sources);

  if (!results || results.length === 0) {
    const note = payIsActive() && lastRawResults.length
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
    const ctaTitle = j.atsLabel ? `Apply on ${j.atsLabel}` : 'Go to job post';
    const desc = j.description ? `<p class="job-desc">${esc(j.description.slice(0, 180))}…</p>` : '';
    return `
    <div class="job-search-result" data-job-id="${escAttr(j.id)}">
      <div class="job-result-top">
        <div class="job-result-headline">
          <div class="job-title">${esc(j.title || 'Untitled role')}</div>
          <div class="job-meta">${esc(j.company || 'Unknown company')} • ${esc(j.location || 'Location n/a')}</div>
        </div>
        <div class="job-result-actions">
          <a href="${escAttr(j.url)}" target="_blank" rel="noopener" class="job-icon-btn" title="${escAttr(ctaTitle)}" aria-label="${escAttr(ctaTitle)}">↗</a>
          <button type="button" class="job-icon-btn job-save-btn" data-job-id="${escAttr(j.id)}" title="Save to Tracker" aria-label="Save to Tracker">💾</button>
        </div>
      </div>
      <div class="job-badges">${badges}</div>
      ${desc}
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
  button.disabled = true;
  button.textContent = '…';
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
    button.textContent = '✓';
    button.classList.add('is-saved');
    button.title = 'Saved to Tracker';
  } catch (err) {
    button.disabled = false;
    button.textContent = '💾';
    console.warn('[apply-bot] Failed to save job to tracker.', err);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initJobSearchHandlers(showScreen) {
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
  document.getElementById('open-job-search-btn')?.addEventListener('click', openPanel);

  const jobSearchInput = document.getElementById('job-search-input');
  const jobSearchSubmitBtn = document.getElementById('job-search-submit-btn');
  const resultsDiv = document.getElementById('job-search-results');

  if (jobSearchSubmitBtn && jobSearchInput) {
    jobSearchSubmitBtn.onclick = async () => {
      const query = jobSearchInput.value.trim();
      if (!selectedSourceIds.size) {
        if (resultsDiv) resultsDiv.innerHTML = '<p class="empty-msg">Select at least one source in Filters.</p>';
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

  // Filters expander (mirrors the tracker's "Add manually" sub-bar pattern).
  document.getElementById('job-filters-toggle')?.addEventListener('click', (event) => {
    const subbar = document.getElementById('job-search-subbar');
    if (!subbar) return;
    const open = subbar.classList.toggle('hidden');
    event.currentTarget.setAttribute('aria-expanded', String(!open));
    event.currentTarget.classList.toggle('is-active', !open);
  });

  // Source chips: toggle available ones; route locked ones to AI settings.
  document.getElementById('job-source-filters')?.addEventListener('click', async (event) => {
    const chip = event.target.closest('.job-source-chip');
    if (!chip) return;
    if (chip.dataset.available === '0') {
      await openExpandedWorkspace('ai', 'ai-settings-section');
      return;
    }
    const id = chip.dataset.sourceId;
    if (!id) return;
    if (selectedSourceIds.has(id)) selectedSourceIds.delete(id); else selectedSourceIds.add(id);
    chip.classList.toggle('is-active', selectedSourceIds.has(id));
    chip.setAttribute('aria-pressed', String(selectedSourceIds.has(id)));
    saveJobPrefs();
  });

  // Pay mode toggle.
  document.querySelectorAll('.job-pay-mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (payFilter.mode === btn.dataset.mode) return;
      payFilter.mode = btn.dataset.mode === 'hourly' ? 'hourly' : 'annual';
      const r = PAY_RANGES[payFilter.mode];
      payFilter.min = r.min;
      payFilter.max = r.max;
      syncPayUi();
      applyAndRender();
      saveJobPrefs();
    });
  });

  // Sliders + number boxes stay in sync; either updates the filter.
  const onPayChange = (source) => {
    const minSlider = document.getElementById('pay-filter-min');
    const maxSlider = document.getElementById('pay-filter-max');
    const minNum = document.getElementById('pay-min-num');
    const maxNum = document.getElementById('pay-max-num');
    if (source === 'num') setPayFromInputs(minNum?.value, maxNum?.value);
    else setPayFromInputs(minSlider?.value, maxSlider?.value);
    syncPayUi();
    applyAndRender();
    saveJobPrefs();
  };
  document.getElementById('pay-filter-min')?.addEventListener('input', () => onPayChange('slider'));
  document.getElementById('pay-filter-max')?.addEventListener('input', () => onPayChange('slider'));
  document.getElementById('pay-min-num')?.addEventListener('change', () => onPayChange('num'));
  document.getElementById('pay-max-num')?.addEventListener('change', () => onPayChange('num'));

  // Save-to-Tracker.
  if (resultsDiv) {
    resultsDiv.addEventListener('click', (event) => {
      const saveBtn = event.target.closest('.job-save-btn');
      if (!saveBtn) return;
      const jobId = saveBtn.dataset.jobId || '';
      if (jobId) saveJobToTracker(jobId, saveBtn);
    });
  }

  document.getElementById('job-search-back-btn')?.addEventListener('click', () => showScreen('main'));

  if (isStandaloneView() && new URLSearchParams(window.location.search).get('screen') === 'job-search') {
    loadJobSources();
  }
}
