/**
 * apply-bot — content.js
 * Classic (non-module) content script. Runs on job pages.
 * All JD extraction and form-filling logic is inlined here so no
 * ES module imports are needed (Chrome MV3 content scripts run as
 * classic scripts and do not support top-level import/export).
 */

// ── URL helpers ───────────────────────────────────────────────────────────────

/**
 * Check if a hostname matches a domain or any of its subdomains.
 * E.g. matchesDomain('boards.greenhouse.io', 'greenhouse.io') → true
 *      matchesDomain('evil-greenhouse.io.attacker.com', 'greenhouse.io') → false
 *
 * @param {string} hostname
 * @param {string} domain
 * @returns {boolean}
 */
function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((err) => {
    sendResponse({ success: false, error: err.message });
  });
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'FILL_FORM':
      return handleFillForm();
    case 'INJECT_ANSWERS':
      return handleInjectAnswers(msg.payload);
    case 'DETECT_ATS':
      return { ats: detectAts() };
    default:
      throw new Error('Unknown message: ' + msg.type);
  }
}

// ── Fill form flow ────────────────────────────────────────────────────────────

async function handleFillForm() {
  // 1. Extract JD + job meta
  const { jd, company, title } = extractJobInfo();

  // 2. Collect any custom open-ended questions
  const customQuestions = collectCustomQuestions();

  // 3. Ask service worker to generate answers via Gemini
  const resp = await chrome.runtime.sendMessage({
    type: 'GENERATE_ANSWERS',
    payload: { jd, customQuestions, pageUrl: location.href },
  });

  if (!resp?.success) {
    throw new Error(resp?.error || 'Failed to generate answers');
  }

  const answers = resp.answers;

  // 4. Merge custom answers into flat map
  if (answers.custom_answers && typeof answers.custom_answers === 'object') {
    for (const [q, a] of Object.entries(answers.custom_answers)) {
      answers[q] = a;
    }
  }

  // 5. Fill the form
  const fieldMap = await loadFieldMap();
  const { filled } = fillForm(answers, fieldMap);

  // 6. Log the application
  await chrome.runtime.sendMessage({
    type: 'LOG_APPLICATION',
    payload: {
      company,
      title,
      url: location.href,
      status: 'applied',
      jd_snippet: jd.slice(0, 300),
      answers_generated: true,
    },
  });

  return { success: true, filled, company, title };
}

async function handleInjectAnswers(answers) {
  if (!answers) throw new Error('No answers to inject');
  const fieldMap = await loadFieldMap();
  const { filled } = fillForm(answers, fieldMap);
  return { success: true, filled };
}

// ── Load field-map.json ───────────────────────────────────────────────────────

async function loadFieldMap() {
  try {
    const url = chrome.runtime.getURL('data/field-map.json');
    const res = await fetch(url);
    return await res.json();
  } catch {
    return {};
  }
}

// ── JD extraction (inlined from lib/jd-parser.js) ────────────────────────────

function extractJobInfo() {
  const hostname = location.hostname;
  if (matchesDomain(hostname, 'greenhouse.io')) return extractGreenhouse();
  if (matchesDomain(hostname, 'ashbyhq.com') || matchesDomain(hostname, 'ashby.io')) return extractAshby();
  if (matchesDomain(hostname, 'lever.co')) return extractLever();
  if (matchesDomain(hostname, 'linkedin.com')) return extractLinkedIn();
  if (matchesDomain(hostname, 'workday.com')) return extractWorkday();
  if (matchesDomain(hostname, 'icims.com')) return extractICIMS();
  return extractGenericJobInfo();
}

function extractGreenhouse() {
  return {
    title: qs('#header h1, .app-title, h1')?.textContent?.trim() || '',
    company: qs('#header .company-name, .company')?.textContent?.trim() || document.title,
    jd: qs('#content, #app_body, .content')?.innerText?.trim() || extractGenericText(),
  };
}

function extractAshby() {
  return {
    title: qs('h1[data-testid="job-title"], h1.ashby-job-posting-heading, h1')?.textContent?.trim() || '',
    company: qs('.ashby-application-portal-name, [data-testid="company-name"]')?.textContent?.trim() || document.title,
    jd: qs('.ashby-job-posting-brief-list, .ashby-job-posting-description, main')?.innerText?.trim() || extractGenericText(),
  };
}

function extractLever() {
  return {
    title: qs('.posting-header h2, h2.posting-title')?.textContent?.trim() || '',
    company: qs('.main-header-logo img')?.alt?.trim() || document.title,
    jd: qs('.posting-description, section.page-centered')?.innerText?.trim() || extractGenericText(),
  };
}

function extractLinkedIn() {
  return {
    title: qs('.job-details-jobs-unified-top-card__job-title, h1.t-24')?.textContent?.trim() || '',
    company: qs('.job-details-jobs-unified-top-card__company-name, a.ember-view')?.textContent?.trim() || '',
    jd: qs('#job-details, .jobs-description__content, .jobs-description-content__text')?.innerText?.trim() || extractGenericText(),
  };
}

function extractWorkday() {
  return {
    title: qs('[data-automation-id="jobPostingHeader"], h2.css-9xh9yi')?.textContent?.trim() || '',
    company: document.title.split('|')?.[1]?.trim() || '',
    jd: qs('[data-automation-id="job-description"], .css-qdtm9x')?.innerText?.trim() || extractGenericText(),
  };
}

function extractICIMS() {
  return {
    title: qs('.iCIMS_JobHeaderTitle, #iCIMS_MainColumn h1')?.textContent?.trim() || '',
    company: qs('.iCIMS_CompanyLogo img')?.alt || document.title,
    jd: qs('#iCIMS_JobContent, .iCIMS_JobContent')?.innerText?.trim() || extractGenericText(),
  };
}

function extractGenericJobInfo() {
  return {
    title: qs('h1, h2')?.textContent?.trim() || '',
    company: '',
    jd: extractGenericText(),
  };
}

function extractGenericText() {
  const JD_KEYWORDS = ['responsibilities', 'qualifications', 'requirements', 'experience', 'skills', 'about', 'role', 'position'];
  const candidates = Array.from(document.querySelectorAll(
    'article, section, main, .job-description, [class*="description"], [id*="description"], [class*="posting"], [id*="posting"]'
  ));
  let best = null;
  let bestScore = 0;
  for (const el of candidates) {
    const text = el.innerText || '';
    if (text.length < 200) continue;
    const lower = text.toLowerCase();
    const kwHits = JD_KEYWORDS.filter((kw) => lower.includes(kw)).length;
    const score = kwHits * 100 + text.length;
    if (score > bestScore) { bestScore = score; best = text; }
  }
  return best || document.body.innerText.slice(0, 8000);
}

function qs(selector) {
  try { return document.querySelector(selector); } catch { return null; }
}

// ── Custom question collector (inlined from lib/form-filler.js) ───────────────

function collectCustomQuestions() {
  const STANDARD = [
    'first name', 'last name', 'full name', 'name', 'email', 'phone', 'mobile',
    'address', 'city', 'state', 'zip', 'postal', 'linkedin', 'github', 'portfolio',
    'website', 'resume', 'cv', 'cover letter', 'salary', 'compensation', 'start date',
    'available', 'work authorization', 'visa', 'sponsorship', 'years of experience',
  ];
  const QUESTION_STARTERS = ['why', 'what', 'how', 'describe', 'tell us', 'explain', 'share', 'please provide'];
  const questions = [];

  for (const label of document.querySelectorAll('label, legend, [data-label]')) {
    const text = label.textContent?.trim();
    if (!text || text.length < 10 || text.length > 500) continue;
    const lower = text.toLowerCase();
    if (STANDARD.some((s) => lower.includes(s))) continue;
    if (text.endsWith('?') || QUESTION_STARTERS.some((s) => lower.startsWith(s))) {
      questions.push(text);
    }
  }
  return [...new Set(questions)];
}

// ── Form filler (inlined from lib/form-filler.js) ────────────────────────────

function fillForm(answers, fieldMap) {
  const inputs = Array.from(document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]), textarea, select'
  )).filter((el) => {
    if (el.disabled || el.readOnly) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });

  let filled = 0;
  let skipped = 0;

  for (const input of inputs) {
    const key = resolveFieldKey(input, fieldMap);
    if (!key) { skipped++; continue; }
    const value = answers[key];
    if (value === undefined || value === null || value === '') { skipped++; continue; }
    const didFill = setFieldValue(input, String(value));
    if (didFill) { filled++; highlightField(input); } else { skipped++; }
  }
  return { filled, skipped };
}

function resolveFieldKey(el, fieldMap) {
  const candidates = [
    el.name,
    el.id,
    el.getAttribute('placeholder'),
    el.getAttribute('aria-label'),
    el.getAttribute('data-label'),
    getAssociatedLabelText(el),
  ].filter(Boolean).map((s) => s.toLowerCase().trim());

  for (const candidate of candidates) {
    for (const [pattern, key] of Object.entries(fieldMap)) {
      if (pattern.startsWith('//')) continue; // skip comment keys
      if (candidate.includes(pattern)) return key;
    }
  }
  return null;
}

function getAssociatedLabelText(el) {
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent;
  }
  return el.closest('label')?.textContent || null;
}

function setFieldValue(el, value) {
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();

  if (tag === 'select') return setSelectValue(el, value);

  if (type === 'checkbox') {
    const checked = /true|yes|1/i.test(value);
    if (el.checked !== checked) { el.checked = checked; fireEvents(el, ['change']); }
    return true;
  }

  if (type === 'radio') {
    if (!el.name) return false;
    const radios = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
    for (const radio of radios) {
      if (radio.value.toLowerCase().includes(value.toLowerCase())) {
        radio.checked = true;
        fireEvents(radio, ['change']);
        return true;
      }
    }
    return false;
  }

  // text / textarea / number / email / tel / url
  const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
  fireEvents(el, ['input', 'change', 'blur']);
  return true;
}

function setSelectValue(el, value) {
  const lower = value.toLowerCase();
  for (const opt of el.options) {
    if (opt.value.toLowerCase() === lower || opt.text.toLowerCase() === lower) {
      el.value = opt.value; fireEvents(el, ['change']); return true;
    }
  }
  for (const opt of el.options) {
    if (opt.text.toLowerCase().includes(lower) || lower.includes(opt.text.toLowerCase())) {
      el.value = opt.value; fireEvents(el, ['change']); return true;
    }
  }
  return false;
}

function fireEvents(el, events) {
  for (const type of events) el.dispatchEvent(new Event(type, { bubbles: true }));
}

function highlightField(el) {
  const orig = el.style.outline;
  el.style.outline = '2px solid #4ade80';
  el.style.outlineOffset = '2px';
  setTimeout(() => { el.style.outline = orig; el.style.outlineOffset = ''; }, 3000);
}

// ── ATS detection ─────────────────────────────────────────────────────────────

function detectAts() {
  const host = location.hostname;
  if (matchesDomain(host, 'greenhouse.io')) return 'Greenhouse';
  if (matchesDomain(host, 'ashbyhq.com') || matchesDomain(host, 'ashby.io')) return 'Ashby';
  if (matchesDomain(host, 'lever.co')) return 'Lever';
  if (matchesDomain(host, 'linkedin.com')) return 'LinkedIn Easy Apply';
  if (matchesDomain(host, 'workday.com')) return 'Workday';
  if (matchesDomain(host, 'icims.com')) return 'iCIMS';
  return 'Generic';
}

// ── Auto-detect on load ───────────────────────────────────────────────────────

(function init() {
  const ats = detectAts();
  if (ats !== 'Generic') {
    chrome.runtime.sendMessage({ type: 'ATS_DETECTED', payload: { ats } }).catch(() => {});
  }
})();
