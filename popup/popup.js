/**
 * apply-bot — popup.js
 * Handles all UI logic for the extension popup.
 */

// ── Messaging helpers ─────────────────────────────────────────────────────────

/**
 * Send a message to the background service worker and return the response.
 * @param {object} msg
 * @returns {Promise<any>}
 */
async function sendMessage(msg) {
  return chrome.runtime.sendMessage(msg);
}

/**
 * Send a message to the active tab's content script.
 * @param {object} msg
 * @returns {Promise<any>}
 */
async function sendToActiveTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found');
  return chrome.tabs.sendMessage(tab.id, msg);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) {
    el.classList.add('hidden');
  }
  $(name + '-screen').classList.remove('hidden');
}

function setStatus(elId, msg, type = '') {
  const el = $(elId);
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await initTabs();
  await initSetupHandlers();
  await loadMainScreen();
  await initMainHandlers();
  await initTrackerHandlers();
  await initPreviewHandlers();
});

// ── Tab switching (upload vs paste) ──────────────────────────────────────────

async function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  for (const btn of tabBtns) {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-content').forEach((tc) => tc.classList.add('hidden'));
      $('tab-' + target).classList.remove('hidden');
    });
  }
}

// ── Setup screen ─────────────────────────────────────────────────────────────

async function initSetupHandlers() {
  // File drop/change
  const fileInput = $('resume-file');
  const dropZone = $('file-drop-zone');
  const dropLabel = $('file-drop-label');

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) {
      dropLabel.textContent = '📄 ' + fileInput.files[0].name;
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      dropLabel.textContent = '📄 ' + file.name;
    }
  });

  $('save-setup-btn').addEventListener('click', handleSaveSetup);
}

async function handleSaveSetup() {
  const apiKey = $('api-key-input').value.trim();
  if (!apiKey) {
    setStatus('setup-status', '⚠️ API key is required.', 'error');
    return;
  }

  // Determine resume source
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  let resumeRaw = '';

  if (activeTab === 'paste') {
    resumeRaw = $('resume-text').value.trim();
    if (!resumeRaw) {
      setStatus('setup-status', '⚠️ Paste your resume text.', 'error');
      return;
    }
  } else {
    const file = $('resume-file').files[0];
    if (!file) {
      setStatus('setup-status', '⚠️ Please select a resume file.', 'error');
      return;
    }
    resumeRaw = await readFileAsText(file);
  }

  const settings = {
    gemini_api_key: apiKey,
    preferred_salary_min: Number($('salary-min').value) || null,
    preferred_salary_max: Number($('salary-max').value) || null,
    work_authorization: $('work-auth').value || null,
    preferred_remote: $('prefer-remote').checked,
  };

  $('save-setup-btn').disabled = true;
  setStatus('setup-status', '⏳ Parsing resume with Gemini…');

  try {
    const resp = await sendMessage({ type: 'SAVE_SETUP', payload: { resumeRaw, settings } });
    if (resp?.success) {
      setStatus('setup-status', '✅ Setup complete!', 'success');
      setTimeout(() => loadMainScreen(), 800);
    } else {
      setStatus('setup-status', '❌ ' + (resp?.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    setStatus('setup-status', '❌ ' + err.message, 'error');
  } finally {
    $('save-setup-btn').disabled = false;
  }
}

/**
 * Read a File object as plain text (handles PDF/DOCX by extracting text content).
 * For binary formats we send the raw bytes to the background for Gemini to parse.
 */
async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf') ||
        file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
      // For binary files, encode as base64 and let Gemini handle the rest
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result); // ArrayBuffer
      reader.onerror = reject;
      reader.readAsDataURL(file); // base64 data URL
    } else {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    }
  });
}

// ── Main screen ───────────────────────────────────────────────────────────────

async function loadMainScreen() {
  const resp = await sendMessage({ type: 'GET_STATE' });
  const { hasResume, hasApiKey, resumeName, applications, currentAts } = resp || {};

  if (!hasApiKey) {
    showScreen('setup');
    return;
  }

  showScreen('main');

  // Status badges
  $('resume-status').textContent = hasResume
    ? '✅ ' + (resumeName || 'Loaded')
    : '⚠️ Not set';
  $('resume-status').className = 'badge ' + (hasResume ? 'badge-ok' : 'badge-warn');

  $('api-status').textContent = hasApiKey ? '✅ Connected' : '⚠️ Missing';
  $('api-status').className = 'badge ' + (hasApiKey ? 'badge-ok' : 'badge-warn');

  // ATS detection
  if (currentAts) {
    $('ats-row').style.display = 'flex';
    $('ats-status').textContent = currentAts;
  }

  // Tracker stats
  const apps = applications || [];
  $('stat-total').textContent = apps.length;
  $('stat-applied').textContent = apps.filter((a) => a.status === 'applied').length;
  $('stat-pending').textContent = apps.filter((a) => a.status !== 'applied').length;
}

async function initMainHandlers() {
  $('fill-btn').addEventListener('click', async () => {
    $('fill-btn').disabled = true;
    setStatus('fill-status', '⏳ Analyzing page & generating answers…');
    try {
      const resp = await sendToActiveTab({ type: 'FILL_FORM' });
      if (resp?.success) {
        setStatus('fill-status', '✅ Form filled! Review and submit.', 'success');
        await loadMainScreen();
      } else {
        setStatus('fill-status', '❌ ' + (resp?.error || 'Could not fill form.'), 'error');
      }
    } catch (err) {
      setStatus('fill-status', '❌ ' + err.message, 'error');
    } finally {
      $('fill-btn').disabled = false;
    }
  });

  $('preview-btn').addEventListener('click', async () => {
    const resp = await sendMessage({ type: 'GET_LAST_ANSWERS' });
    renderPreview(resp?.answers);
    showScreen('preview');
  });

  $('edit-resume-btn').addEventListener('click', () => {
    showScreen('setup');
    // Pre-fill existing key
    sendMessage({ type: 'GET_STATE' }).then((s) => {
      if (s?.apiKey) $('api-key-input').value = s.apiKey;
    });
  });
}

// ── Tracker screen ────────────────────────────────────────────────────────────

async function initTrackerHandlers() {
  $('view-tracker-btn').addEventListener('click', async () => {
    await renderTracker();
    showScreen('tracker');
  });

  $('back-btn').addEventListener('click', () => showScreen('main'));

  $('export-csv-btn').addEventListener('click', async () => {
    const resp = await sendMessage({ type: 'GET_STATE' });
    exportCsv(resp?.applications || []);
  });
}

async function renderTracker() {
  const resp = await sendMessage({ type: 'GET_STATE' });
  const apps = resp?.applications || [];
  const tbody = $('tracker-body');
  tbody.innerHTML = '';

  if (apps.length === 0) {
    $('tracker-empty').classList.remove('hidden');
    return;
  }
  $('tracker-empty').classList.add('hidden');

  for (const app of apps.slice().reverse()) {
    const tr = document.createElement('tr');
    const statusEmoji = app.status === 'applied' ? '✅ Applied' : '🟡 Pending';
    tr.innerHTML = `
      <td title="${esc(app.company)}">${esc(app.company || '—')}</td>
      <td title="${esc(app.title)}">${esc(app.title || '—')}</td>
      <td>${statusEmoji}</td>
      <td>${esc(formatDate(app.date))}</td>
    `;
    tbody.appendChild(tr);
  }
}

function exportCsv(applications) {
  const header = 'Company,Role,Status,Date,URL';
  const rows = applications.map((a) =>
    [a.company, a.title, a.status, a.date, a.url]
      .map((v) => '"' + String(v || '').replace(/"/g, '""') + '"')
      .join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'apply-bot-tracker.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Preview screen ────────────────────────────────────────────────────────────

function initPreviewHandlers() {
  $('preview-back-btn').addEventListener('click', () => showScreen('main'));

  $('inject-from-preview-btn').addEventListener('click', async () => {
    const resp = await sendMessage({ type: 'GET_LAST_ANSWERS' });
    if (!resp?.answers) return;
    try {
      await sendToActiveTab({ type: 'INJECT_ANSWERS', payload: resp.answers });
    } catch (err) {
      // tab may not have content script
    }
  });
}

function renderPreview(answers) {
  const container = $('preview-content');
  if (!answers || Object.keys(answers).length === 0) {
    container.innerHTML = '<p class="empty-msg">No answers yet. Click "Fill This Application" first.</p>';
    return;
  }
  const fields = Object.entries(answers).map(([key, value]) => `
    <div class="preview-field">
      <div class="preview-field-label">${esc(key)}</div>
      <div class="preview-field-value">${esc(String(value))}</div>
    </div>
  `);
  container.innerHTML = fields.join('');
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format a date string (ISO or any valid date) for display as YYYY-MM-DD.
 * Returns '—' if the value is falsy or not a valid date.
 * @param {string|null|undefined} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).slice(0, 10) || '—';
    return d.toISOString().slice(0, 10);
  } catch {
    return '—';
  }
}
