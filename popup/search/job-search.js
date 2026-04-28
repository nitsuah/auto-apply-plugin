// job-search.js
// All job search panel logic, rendering, and state management


/**
 * Render job search results into the job search panel.
 * @param {Array} results
 */
export function renderJobSearchResults(results) {
  const resultsDiv = document.getElementById('job-search-results');
  if (!resultsDiv) return;
  if (!results || results.length === 0) {
    resultsDiv.innerHTML = '<p class="empty-msg">No jobs found for this search.</p>';
    return;
  }
  resultsDiv.innerHTML = results.map(j => `
    <div class="job-search-result">
      <div class="job-title">${j.title}</div>
      <div class="job-meta">${j.company} • ${j.location}</div>
      <a href="${j.url}" target="_blank" rel="noopener" class="job-link">View job</a>
    </div>
  `).join('');
}

/**
 * Initialize job search panel event handlers.
 * @param {Function} showScreen - Function to switch screens
 */
export function initJobSearchHandlers(showScreen) {
  // Job Search panel events
  const jobSearchBtn = document.getElementById('job-search-btn');
  if (jobSearchBtn) {
    jobSearchBtn.onclick = () => {
      showScreen('job-search');
    };
  }
  // Header job search button
  const headerJobSearchBtn = document.getElementById('header-job-search-btn');
  if (headerJobSearchBtn) {
    headerJobSearchBtn.onclick = () => {
      showScreen('job-search');
    };
  }
  const jobSearchBackBtn = document.getElementById('job-search-back-btn');
  if (jobSearchBackBtn) {
    jobSearchBackBtn.onclick = () => {
      showScreen('main');
    };
  }
  const jobSearchInput = document.getElementById('job-search-input');
  const jobSearchSubmitBtn = document.getElementById('job-search-submit-btn');
  if (jobSearchSubmitBtn && jobSearchInput) {
    jobSearchSubmitBtn.onclick = async () => {
      const query = jobSearchInput.value.trim();
      if (!query) return;
      jobSearchSubmitBtn.disabled = true;
      jobSearchSubmitBtn.textContent = 'Searching...';
      const { searchJobs } = await import('../../lib/job-search.js');
      const results = await searchJobs(query);
      renderJobSearchResults(results);
      jobSearchSubmitBtn.disabled = false;
      jobSearchSubmitBtn.textContent = 'Search';
    };
    jobSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') jobSearchSubmitBtn.click();
    });
  }
}
