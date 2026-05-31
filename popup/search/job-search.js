// job-search.js
// Job search panel: query the aggregator (service worker), render results,
// and let the user open the post or save it straight into the tracker.

import { esc, escAttr, sendMessage } from '../../lib/utils.js';

// Cache the latest normalized results so the "Save to Tracker" button can look
// a job up by id without re-stuffing every field into the DOM.
const lastResultsById = new Map();

/**
 * Render job search results into the job search panel.
 * @param {Array} results
 * @param {Array} [sources] — per-source status from the aggregator
 */
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

/**
 * Initialize job search panel event handlers.
 * @param {Function} showScreen - Function to switch screens
 */
export function initJobSearchHandlers(showScreen) {
  const jobSearchBtn = document.getElementById('job-search-btn');
  if (jobSearchBtn) {
    jobSearchBtn.onclick = () => showScreen('job-search');
  }
  const headerJobSearchBtn = document.getElementById('header-job-search-btn');
  if (headerJobSearchBtn) {
    headerJobSearchBtn.onclick = () => showScreen('job-search');
  }

  const jobSearchInput = document.getElementById('job-search-input');
  const jobSearchSubmitBtn = document.getElementById('job-search-submit-btn');
  const resultsDiv = document.getElementById('job-search-results');

  if (jobSearchSubmitBtn && jobSearchInput) {
    jobSearchSubmitBtn.onclick = async () => {
      const query = jobSearchInput.value.trim();
      jobSearchSubmitBtn.disabled = true;
      jobSearchSubmitBtn.textContent = 'Searching…';
      if (resultsDiv) resultsDiv.innerHTML = '<p class="empty-msg">Searching across job boards…</p>';
      try {
        const resp = await sendMessage({ type: 'SEARCH_JOBS', payload: { query } });
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

  // Delegated Save-to-Tracker handler.
  if (resultsDiv) {
    resultsDiv.addEventListener('click', (event) => {
      const saveBtn = event.target.closest('.job-save-btn');
      if (!saveBtn) return;
      const jobId = saveBtn.dataset.jobId || '';
      if (jobId) saveJobToTracker(jobId, saveBtn);
    });
  }

  const jobSearchBackBtn = document.getElementById('job-search-back-btn');
  if (jobSearchBackBtn) {
    jobSearchBackBtn.onclick = () => showScreen('main');
  }
}
