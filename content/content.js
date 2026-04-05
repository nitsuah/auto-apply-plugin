/**
 * apply-bot — content.js
 * Classic (non-module) content script. Runs on job pages.
 * All JD extraction and form-filling logic is inlined here so no
 * ES module imports are needed (Chrome MV3 content scripts run as
 * classic scripts and do not support top-level import/export).
 */

const DRAFT_STORAGE_KEY = 'applicationDrafts';
let draftSaveTimer = null;
let draftRestoreTimer = null;
let draftPersistenceStarted = false;

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
  const warning = resp.warning || null;

  // 4. Merge custom answers into flat map
  if (answers.custom_answers && typeof answers.custom_answers === 'object') {
    for (const [q, a] of Object.entries(answers.custom_answers)) {
      answers[q] = a;
    }
  }

  // 5. Fill the form
  const fieldMap = await loadFieldMap();
  const report = fillForm(answers, fieldMap);

  // 6. Log the application
  await chrome.runtime.sendMessage({
    type: 'LOG_APPLICATION',
    payload: {
      company,
      title,
      url: location.href,
      status: 'filled',
      jd_snippet: jd.slice(0, 300),
      answers_generated: true,
      fill_report: report,
    },
  });

  return { success: true, filled: report.filled, company, title, warning, report };
}

async function handleInjectAnswers(answers) {
  if (!answers) throw new Error('No answers to inject');
  const fieldMap = await loadFieldMap();
  const report = fillForm(answers, fieldMap);
  return { success: true, filled: report.filled, report };
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
  const SENSITIVE = ['gender', 'race', 'ethnic', 'disability', 'veteran', 'military', 'lgbt', 'transgender', 'demographic'];
  const QUESTION_STARTERS = ['why', 'what', 'how', 'describe', 'tell us', 'explain', 'share', 'please provide'];
  const questions = [];

  for (const label of document.querySelectorAll('label, legend, [data-label]')) {
    const text = label.textContent?.trim();
    if (!text || text.length < 10 || text.length > 500) continue;
    const lower = text.toLowerCase();
    if (STANDARD.some((s) => lower.includes(s))) continue;
    if (SENSITIVE.some((s) => lower.includes(s))) continue;
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
  let preserved = 0;
  const unresolved = [];

  for (const input of inputs) {
    const key = resolveFieldKey(input, fieldMap, answers);
    if (!key) {
      unresolved.push(describeField(input));
      continue;
    }

    const value = answers[key];
    if (value === undefined || value === null || value === '') {
      unresolved.push(describeField(input));
      continue;
    }

    if (hasMeaningfulValue(input)) {
      preserved++;
      continue;
    }

    const didFill = setFieldValue(input, String(value));
    if (didFill) {
      filled++;
      highlightField(input);
    } else {
      unresolved.push(describeField(input));
    }
  }

  const uniqueUnresolved = [...new Set(unresolved.filter(Boolean))];
  const skipped = preserved + uniqueUnresolved.length;
  console.info(`[apply-bot] Filled ${filled} field(s), preserved ${preserved}, unresolved ${uniqueUnresolved.length}.`);
  queueDraftSave();
  return { filled, preserved, skipped, unresolved: uniqueUnresolved };
}

function resolveFieldKey(el, fieldMap, answers = {}) {
  const candidates = [
    el.name,
    el.id,
    el.getAttribute('placeholder'),
    el.getAttribute('aria-label'),
    el.getAttribute('data-label'),
    getAssociatedLabelText(el),
    getFieldContextText(el),
  ].filter(Boolean);

  return resolveAnswerKeyFromCandidates(candidates, fieldMap, answers);
}

function resolveAnswerKeyFromCandidates(candidates, fieldMap = {}, answers = {}) {
  const normalizedCandidates = candidates
    .map((value) => normalizeLookupText(value))
    .filter(Boolean);

  for (const candidate of normalizedCandidates) {
    for (const key of Object.keys(answers || {})) {
      const normalizedKey = normalizeLookupText(key);
      if (!normalizedKey || normalizedKey.length < 4) continue;
      if (candidate === normalizedKey) {
        return key;
      }
    }
  }

  const sortedEntries = Object.entries(fieldMap).sort((a, b) => b[0].length - a[0].length);

  for (const candidate of normalizedCandidates) {
    for (const [pattern, key] of sortedEntries) {
      if (pattern.startsWith('//')) continue;
      if (candidate.includes(normalizeLookupText(pattern))) return key;
    }
  }

  for (const candidate of normalizedCandidates) {
    for (const key of Object.keys(answers || {})) {
      const normalizedKey = normalizeLookupText(key);
      if (!normalizedKey || normalizedKey.length < 4) continue;
      if (candidate.includes(normalizedKey) || normalizedKey.includes(candidate)) {
        return key;
      }
    }
  }

  return null;
}

function normalizeLookupText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAssociatedLabelText(el) {
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent;
  }
  return el.closest('label')?.textContent || null;
}

function getFieldContextText(el) {
  const containers = [
    el.closest('fieldset'),
    el.closest('[role="radiogroup"]'),
    el.closest('[role="group"]'),
    el.closest('section'),
    el.parentElement,
  ].filter(Boolean);

  for (const container of containers) {
    const text = container.innerText?.trim();
    if (text && text.length <= 300) return text;
  }

  return null;
}

function setFieldValue(el, value) {
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();

  if (tag === 'select') return setSelectValue(el, value);

  if (type === 'checkbox') {
    const checked = /true|yes|1|agree|understand/i.test(value);
    if (el.checked !== checked) { el.checked = checked; fireEvents(el, ['input', 'change', 'click']); }
    return true;
  }

  if (type === 'radio') {
    if (!el.name) return false;
    const radios = Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`));
    const normalizedValue = normalizeLookupText(value);

    for (const radio of radios) {
      const radioText = normalizeLookupText(`${radio.value} ${getRadioOptionText(radio)}`);
      if (radioText === normalizedValue || radioText.includes(normalizedValue) || normalizedValue.includes(radioText)) {
        radio.checked = true;
        fireEvents(radio, ['input', 'change', 'click']);
        return true;
      }
    }

    const wantsYes = /^(true|yes|y|1|agree|i understand)$/i.test(value);
    const wantsNo = /^(false|no|n|0)$/i.test(value);
    if (wantsYes || wantsNo) {
      for (const radio of radios) {
        const radioText = normalizeLookupText(`${radio.value} ${getRadioOptionText(radio)}`);
        if (wantsYes && /(yes|true|agree|understand)/.test(radioText)) {
          radio.checked = true;
          fireEvents(radio, ['input', 'change', 'click']);
          return true;
        }
        if (wantsNo && /(no|false)/.test(radioText)) {
          radio.checked = true;
          fireEvents(radio, ['input', 'change', 'click']);
          return true;
        }
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

function getRadioOptionText(radio) {
  if (radio.id) {
    const label = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
    if (label) return label.textContent || '';
  }
  return radio.closest('label')?.textContent || radio.parentElement?.textContent || '';
}

function hasMeaningfulValue(el) {
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();

  if (type === 'radio' && el.name) {
    return Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`))
      .some((radio) => radio.checked);
  }

  if (type === 'checkbox') {
    return getCheckboxGroupMembers(el).some((checkbox) => checkbox.checked);
  }

  if (tag === 'select') return !!String(el.value || '').trim();
  return !!String(el.value || '').trim();
}

function describeField(el) {
  return (
    getAssociatedLabelText(el) ||
    el.getAttribute('aria-label') ||
    el.getAttribute('placeholder') ||
    el.name ||
    el.id ||
    'unlabeled field'
  ).trim();
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

// ── Draft caching / restoration ──────────────────────────────────────────────

function initDraftPersistence() {
  if (draftPersistenceStarted) return;
  draftPersistenceStarted = true;

  const handleFieldEvent = (event) => {
    const target = event.target;
    if (isDraftableField(target)) {
      queueDraftSave();
    }
  };

  document.addEventListener('input', handleFieldEvent, true);
  document.addEventListener('change', handleFieldEvent, true);
  document.addEventListener('blur', handleFieldEvent, true);
  window.addEventListener('beforeunload', saveDraftNow);
  window.addEventListener('pageshow', scheduleDraftRestore);

  const observer = new MutationObserver((mutations) => {
    const addedFormFields = mutations.some((mutation) =>
      Array.from(mutation.addedNodes || []).some((node) =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node.matches?.('input, textarea, select') || node.querySelector?.('input, textarea, select'))
      )
    );

    if (addedFormFields) {
      scheduleDraftRestore();
    }
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });

  scheduleDraftRestore();
}

function isDraftableField(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName?.toLowerCase();
  if (!['input', 'textarea', 'select'].includes(tag)) return false;

  const type = (el.getAttribute('type') || '').toLowerCase();
  if (['hidden', 'submit', 'button', 'reset', 'file', 'password'].includes(type)) return false;
  if (el.disabled) return false;
  return true;
}

function getDraftPageKey() {
  try {
    const url = new URL(location.href);
    return `${url.origin}${url.pathname}`.replace(/\/$/, '') || url.origin;
  } catch {
    return location.href.split('#')[0].split('?')[0];
  }
}

function getDraftFieldKey(el) {
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  const base = normalizeLookupText([
    el.name,
    el.id,
    el.getAttribute('placeholder'),
    el.getAttribute('aria-label'),
    el.getAttribute('data-label'),
    getAssociatedLabelText(el),
    getFieldContextText(el),
  ].filter(Boolean).join(' | '));

  if (type === 'radio' || type === 'checkbox') {
    return `${type}:${base || el.name || el.id || 'field'}`;
  }

  return `${tag}:${type || tag}:${base || el.name || el.id || 'field'}`;
}

function getChoiceIdentity(el) {
  return String(getRadioOptionText(el) || el.value || el.id || '').trim();
}

function getCheckboxGroupMembers(el) {
  if (!el) return [];
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (type !== 'checkbox') return [el];

  if (el.name) {
    return Array.from(document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(el.name)}"]`));
  }

  const groupKey = getDraftFieldKey(el);
  return collectDraftableFields().filter((field) => getDraftFieldKey(field) === groupKey);
}

function collectDraftableFields() {
  return Array.from(document.querySelectorAll('input, textarea, select')).filter(isDraftableField);
}

function queueDraftSave() {
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    saveDraftNow().catch((err) => console.warn('[apply-bot] Failed to save page draft.', err));
  }, 150);
}

async function saveDraftNow() {
  if (!chrome?.storage?.local) return;

  const fields = {};
  const processedGroups = new Set();

  for (const el of collectDraftableFields()) {
    const key = getDraftFieldKey(el);
    if (!key) continue;

    const type = (el.getAttribute('type') || '').toLowerCase();
    if ((type === 'radio' || type === 'checkbox') && processedGroups.has(key)) continue;

    if (type === 'radio') {
      processedGroups.add(key);
      const radios = el.name
        ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`))
        : [el];
      const checked = radios.find((radio) => radio.checked);
      if (checked) fields[key] = getChoiceIdentity(checked);
      continue;
    }

    if (type === 'checkbox') {
      processedGroups.add(key);
      const members = getCheckboxGroupMembers(el);
      if (members.length > 1) {
        const selected = members.filter((member) => member.checked).map(getChoiceIdentity).filter(Boolean);
        if (selected.length) fields[key] = selected;
      } else {
        fields[key] = el.checked;
      }
      continue;
    }

    const value = String(el.value || '');
    if (value.trim()) {
      fields[key] = value;
    }
  }

  const data = await chrome.storage.local.get(DRAFT_STORAGE_KEY);
  const drafts = data[DRAFT_STORAGE_KEY] || {};
  drafts[getDraftPageKey()] = {
    updatedAt: new Date().toISOString(),
    fields,
  };

  const entries = Object.entries(drafts).sort((a, b) =>
    String(b[1]?.updatedAt || '').localeCompare(String(a[1]?.updatedAt || ''))
  );
  const trimmedDrafts = Object.fromEntries(entries.slice(0, 50));

  await chrome.storage.local.set({ [DRAFT_STORAGE_KEY]: trimmedDrafts });

  const learnedEntries = collectLearnedAnswerEntries();
  if (Object.keys(learnedEntries).length) {
    chrome.runtime.sendMessage({
      type: 'SAVE_LEARNED_DEFAULTS',
      payload: { entries: learnedEntries },
    }).catch(() => {});
  }
}

function collectLearnedAnswerEntries() {
  const entries = {};
  const processedGroups = new Set();

  for (const el of collectDraftableFields()) {
    const label = describeField(el);
    const key = getDraftFieldKey(el);
    if (!label || label === 'unlabeled field' || !key || processedGroups.has(key)) continue;

    const type = (el.getAttribute('type') || '').toLowerCase();

    if (type === 'radio') {
      processedGroups.add(key);
      const radios = el.name
        ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`))
        : [el];
      const checked = radios.find((radio) => radio.checked);
      if (checked) entries[label] = getChoiceIdentity(checked);
      continue;
    }

    if (type === 'checkbox') {
      processedGroups.add(key);
      const members = getCheckboxGroupMembers(el);
      if (members.length > 1) {
        const selected = members.filter((member) => member.checked).map(getChoiceIdentity).filter(Boolean);
        if (selected.length) entries[label] = selected.join(', ');
      } else if (el.checked) {
        entries[label] = 'Yes';
      }
      continue;
    }

    const value = String(el.value || '').trim();
    if (value) entries[label] = value;
  }

  return entries;
}

function scheduleDraftRestore() {
  if (draftRestoreTimer) clearTimeout(draftRestoreTimer);
  draftRestoreTimer = setTimeout(() => {
    restoreDraftValues().catch((err) => console.warn('[apply-bot] Failed to restore page draft.', err));
  }, 120);
}

async function restoreDraftValues() {
  if (!chrome?.storage?.local) return;

  const data = await chrome.storage.local.get(DRAFT_STORAGE_KEY);
  const draft = data[DRAFT_STORAGE_KEY]?.[getDraftPageKey()];
  if (!draft?.fields) return;

  const processedGroups = new Set();

  for (const el of collectDraftableFields()) {
    const key = getDraftFieldKey(el);
    if (!key || processedGroups.has(key) || !(key in draft.fields)) continue;
    if (hasMeaningfulValue(el)) continue;

    const type = (el.getAttribute('type') || '').toLowerCase();
    const storedValue = draft.fields[key];

    if (type === 'radio') {
      processedGroups.add(key);
      if (storedValue) setFieldValue(el, String(storedValue));
      continue;
    }

    if (type === 'checkbox') {
      processedGroups.add(key);
      if (Array.isArray(storedValue)) {
        const selected = storedValue.map((value) => normalizeLookupText(value));
        for (const member of getCheckboxGroupMembers(el)) {
          const shouldCheck = selected.includes(normalizeLookupText(getChoiceIdentity(member)));
          if (member.checked !== shouldCheck) {
            member.checked = shouldCheck;
            fireEvents(member, ['input', 'change', 'click']);
          }
        }
      } else if (typeof storedValue === 'boolean') {
        if (el.checked !== storedValue) {
          el.checked = storedValue;
          fireEvents(el, ['input', 'change', 'click']);
        }
      }
      continue;
    }

    if (storedValue) {
      setFieldValue(el, String(storedValue));
    }
  }
}

// ── Auto-detect on load ───────────────────────────────────────────────────────

(function init() {
  initDraftPersistence();

  const ats = detectAts();
  if (ats !== 'Generic') {
    chrome.runtime.sendMessage({ type: 'ATS_DETECTED', payload: { ats } }).catch(() => {});
  }
})();
