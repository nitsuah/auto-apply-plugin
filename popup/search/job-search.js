// job-search.js
// Job search panel: pick which sources to query (plug-and-play registry on the
// service-worker side), run the aggregated search, render results, and save a
// result straight into the tracker.

import { esc, escAttr, sendMessage } from '../../lib/utils.js';

// Cache the latest normalized results so "Save to Tracker" can look a job up by
// id without re-stuffing every field into the DOM.
const lastResultsById = new Map();

// Which source ids the user wants to query. Seeded to every available source on
// first load; the user can then pick and choose. Persists for the popup session.
const selectedSourceIds = new Set();
let sourceSelectionSeeded = false;

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
  // Drop any selection that is no longer available (e.g. keys removed).
  const availableIds = new Set(sources.filter((s) => s.available).map((s) => s.id));
  [...selectedSourceIds].forEach((id) => { if (!availableIds.has(id)) selectedSourceIds.delete(id); });

  renderSourceChips(sources);
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
      : `${s.label} — add ${s.requires || 'credentials'} to enable`;
    return `<button type="button" class="${classes.join(' ')}" data-source-id="${escAttr(s.id)}"${s.available ? '' : ' disabled'} aria-pressed="${selected ? 'true' : 'false'}" title="${escAttr(title)}">${esc(s.label)}${s.available ? '' : ' 🔒'}</button>`;
  }).join('');
}

// ── Results ──────────────────────────────────────────────────────────────────

export function renderJobSearchResults(results, sources = []) {
  const resultsDiv = document.getElementById('job-search-results');
  if (!resultsDiv) return;

  lastResultsById.clear();
  (results || []).forEach((job) => { if (job?.id) lastResultsById.set(job.id, job); });

  const sourceNote = renderSourceNote(sources);

  if (!results || results.length === 0) {
    resultsDiv.innerHTML = `${sourceNote}<p class="empty-msg">No jobs found for this search.</p>`;
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
  const parts = sources.map((s) => s.ok
    ? `${esc(s.name)} (${Number(s.count) || 0})`
    : `${esc(s.name)} unavailable`);
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
        company: job.company,
        title: job.title,
        url: job.url,
        status: 'drafted',
        location: job.location,
        employment_type: job.employment_type,
        remote: !!job.remote,
        salary_range: job.salary || '',
        description: job.description || '',
        jd_snippet: (job.description || '').slice(0, 300),
        answers_generated: false,
        fill_report: null,
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
  const openPanel = async () => {
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
        const resp = await sendMessage({
          type: 'SEARCH_JOBS',
          payload: { query, sources: [...selectedSourceIds] },
        });
        if (!resp?.success) throw new Error(resp?.error || 'Search failed.');
        renderJobSearchResults(resp.jobs, resp.sources);
      } catch (err) {
        if (resultsDiv) {
          resultsDiv.innerHTML = `<p class="empty-msg">❌ ${esc(err?.message || 'Job search failed.')}</p>`;
        }
      } finally {
        jobSearchSubmitBtn.disabled = false;
        jobSearchSubmitBtn.textContent = 'Search';
      }
    };
    jobSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') jobSearchSubmitBtn.click();
    });
  }

  // Source filter chip toggles.
  document.getElementById('job-source-filters')?.addEventListener('click', (event) => {
    const chip = event.target.closest('.job-source-chip');
    if (!chip || chip.disabled) return;
    const id = chip.dataset.sourceId;
    if (!id) return;
    if (selectedSourceIds.has(id)) selectedSourceIds.delete(id);
    else selectedSourceIds.add(id);
    chip.classList.toggle('is-active', selectedSourceIds.has(id));
    chip.setAttribute('aria-pressed', String(selectedSourceIds.has(id)));
  });

  // Delegated Save-to-Tracker handler.
  if (resultsDiv) {
    resultsDiv.addEventListener('click', (event) => {
      const saveBtn = event.target.closest('.job-save-btn');
      if (!saveBtn) return;
      const jobId = saveBtn.dataset.jobId || '';
      if (jobId) saveJobToTracker(jobId, saveBtn);
    });
  }

  document.getElementById('job-search-back-btn')?.addEventListener('click', () => showScreen('main'));
}
