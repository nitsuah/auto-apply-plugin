/**
 * apply-bot — form-filler.js
 * Injects generated answers into form fields on the current page.
 * NOTE: This module is used by the background service worker for reference.
 * The content script (content/content.js) has its own inlined version
 * to avoid ES module import constraints in classic content scripts.
 */

// Field map is passed in as a parameter (loaded via fetch in the caller).

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fill form fields with the provided answers.
 *
 * @param {object} answers   Map of semantic key → answer string (from Gemini).
 * @param {object} fieldMap  The field-map.json contents (pattern → key).
 * @param {object} [opts]
 * @param {boolean} [opts.highlight] Visually highlight filled fields.
 * @returns {{ filled: number, skipped: number }}
 */
export function fillForm(answers, fieldMap = {}, opts = {}) {
  const inputs = collectFormFields();
  let filled = 0;
  let skipped = 0;

  for (const input of inputs) {
    const key = resolveFieldKey(input, fieldMap);
    if (!key) { skipped++; continue; }

    const value = answers[key];
    if (!value && value !== 0) { skipped++; continue; }

    const didFill = setFieldValue(input, String(value));
    if (didFill) {
      filled++;
      if (opts.highlight !== false) highlightField(input);
    } else {
      skipped++;
    }
  }

  return { filled, skipped };
}

/**
 * Collect custom (open-ended text) questions from the page.
 * Returns an array of question strings so we can send them to Gemini.
 *
 * @returns {string[]}
 */
export function collectCustomQuestions() {
  const questions = [];
  const labels = document.querySelectorAll('label, legend, [data-label]');

  for (const label of labels) {
    const text = label.textContent?.trim();
    if (!text) continue;
    if (text.length < 10 || text.length > 500) continue;
    if (isStandardField(text)) continue;
    if (text.endsWith('?') || isQuestionLike(text)) {
      questions.push(text);
    }
  }

  return [...new Set(questions)]; // deduplicate
}

// ── Field collection ──────────────────────────────────────────────────────────

function collectFormFields() {
  return Array.from(
    document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]), textarea, select'
    )
  ).filter((el) => {
    // Skip disabled / readonly
    if (el.disabled || el.readOnly) return false;
    // Skip invisible
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  });
}

// ── Field key resolution ──────────────────────────────────────────────────────

/**
 * Resolve a semantic key for a form field by inspecting its attributes and labels.
 * Returns null if no match found.
 *
 * @param {HTMLElement} el
 * @param {object} fieldMap  The field-map.json contents.
 * @returns {string|null}
 */
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
  const parent = el.closest('label');
  if (parent) return parent.textContent;
  return null;
}

// ── Field value injection ─────────────────────────────────────────────────────

/**
 * Set the value of a form field and trigger the appropriate events.
 *
 * @param {HTMLElement} el
 * @param {string} value
 * @returns {boolean} true if the value was set
 */
function setFieldValue(el, value) {
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();

  if (tag === 'select') {
    return setSelectValue(el, value);
  }

  if (type === 'checkbox') {
    const checked = /true|yes|1/i.test(value);
    if (el.checked !== checked) {
      el.checked = checked;
      dispatchEvents(el, ['change']);
    }
    return true;
  }

  if (type === 'radio') {
    const radios = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
    for (const radio of radios) {
      if (radio.value.toLowerCase().includes(value.toLowerCase())) {
        radio.checked = true;
        dispatchEvents(radio, ['change']);
        return true;
      }
    }
    return false;
  }

  // text / textarea / number / email / tel / url
  setNativeInputValue(el, value);
  dispatchEvents(el, ['input', 'change', 'blur']);
  return true;
}

/**
 * Use React/Vue-compatible native input value setter to trigger framework
 * change detection (e.g., React controlled components).
 */
function setNativeInputValue(el, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }
}

function setSelectValue(el, value) {
  const lower = value.toLowerCase();
  for (const opt of el.options) {
    if (opt.value.toLowerCase() === lower || opt.text.toLowerCase() === lower) {
      el.value = opt.value;
      dispatchEvents(el, ['change']);
      return true;
    }
  }
  // Try partial match
  for (const opt of el.options) {
    if (opt.text.toLowerCase().includes(lower) || lower.includes(opt.text.toLowerCase())) {
      el.value = opt.value;
      dispatchEvents(el, ['change']);
      return true;
    }
  }
  return false;
}

function dispatchEvents(el, events) {
  for (const type of events) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }
}

// ── Visual feedback ───────────────────────────────────────────────────────────

function highlightField(el) {
  const original = el.style.outline;
  el.style.outline = '2px solid #4ade80';
  el.style.outlineOffset = '2px';
  setTimeout(() => {
    el.style.outline = original;
    el.style.outlineOffset = '';
  }, 3000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STANDARD_FIELD_PATTERNS = [
  'first name', 'last name', 'full name', 'name',
  'email', 'phone', 'mobile', 'address', 'city', 'state', 'zip', 'postal',
  'linkedin', 'github', 'portfolio', 'website',
  'resume', 'cv', 'cover letter',
  'salary', 'compensation',
  'start date', 'available',
  'work authorization', 'visa', 'sponsorship',
  'years of experience',
];

function isStandardField(text) {
  const lower = text.toLowerCase();
  return STANDARD_FIELD_PATTERNS.some((p) => lower.includes(p));
}

function isQuestionLike(text) {
  const questionStarters = ['why', 'what', 'how', 'describe', 'tell us', 'explain', 'share', 'please provide'];
  const lower = text.toLowerCase();
  return questionStarters.some((s) => lower.startsWith(s));
}
