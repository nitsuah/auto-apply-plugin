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
      if (opts.highlight !== false) highlightField(input);
    } else {
      unresolved.push(describeField(input));
    }
  }

  const uniqueUnresolved = [...new Set(unresolved.filter(Boolean))];
  const skipped = preserved + uniqueUnresolved.length;
  console.info(`[apply-bot] Filled ${filled} field(s), preserved ${preserved}, unresolved ${uniqueUnresolved.length}.`);
  return { filled, preserved, skipped, unresolved: uniqueUnresolved };
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
  const sensitivePatterns = ['gender', 'race', 'ethnic', 'disability', 'veteran', 'military', 'lgbt', 'transgender', 'demographic'];

  for (const label of labels) {
    const text = label.textContent?.trim();
    if (!text) continue;
    if (text.length < 10 || text.length > 500) continue;
    if (isStandardField(text)) continue;
    if (sensitivePatterns.some((p) => text.toLowerCase().includes(p))) continue;
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

export function resolveAnswerKeyFromCandidates(candidates, fieldMap = {}, answers = {}) {
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

export function findLearnedAnswer(question, learnedAnswers = {}) {
  const target = normalizeLookupText(question);
  if (!target) return '';

  let bestMatch = { score: 0, value: '' };

  for (const [label, value] of Object.entries(learnedAnswers || {})) {
    const safeValue = String(value || '').trim();
    if (!shouldPersistLearnedValue(label, safeValue)) continue;

    const normalizedLabel = normalizeLookupText(label);
    if (!normalizedLabel) continue;
    if (normalizedLabel === target) return safeValue;

    const score = scoreCandidateSimilarity(target, normalizedLabel);
    if (score > bestMatch.score) {
      bestMatch = { score, value: safeValue };
    }
  }

  return bestMatch.score >= 0.55 ? bestMatch.value : '';
}

export function shouldPersistLearnedValue(label, value) {
  const normalizedLabel = normalizeLookupText(label);
  const safeValue = String(value || '').trim();
  const legalPattern = /agreement|arbitration|terms|conditions|policy|privacy notice|privacy policy|consent|acknowledge|acknowledgement|waiver|release|certify|attest|i confirm|i acknowledge|i understand|have read|read the above|legal/i;

  if (!normalizedLabel || normalizedLabel.length < 6) return false;
  if (!safeValue || safeValue.length > 500) return false;
  if (/gender|race|ethnic|disability|veteran|military|lgbt|transgender|sexual orientation|ssn|social security|date of birth|dob|birthday|age/.test(normalizedLabel)) {
    return false;
  }
  if (/password|resume|cover letter|upload|attach/.test(normalizedLabel)) return false;
  if (/first name|last name|full name|email|phone|mobile|address|city|state|zip|postal|linkedin|github|portfolio|website/.test(normalizedLabel)) {
    return false;
  }
  if (legalPattern.test(normalizedLabel) || legalPattern.test(normalizeLookupText(safeValue))) {
    return false;
  }

  return true;
}

function scoreCandidateSimilarity(left, right) {
  const leftTokens = new Set(normalizeLookupText(left).split(' ').filter((token) => token.length > 2));
  const rightTokens = new Set(normalizeLookupText(right).split(' ').filter((token) => token.length > 2));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap++;
  }

  const jaccard = overlap / Math.max(leftTokens.size, rightTokens.size);
  const containsBoost = left.includes(right) || right.includes(left) ? 0.25 : 0;
  const overlapBoost = overlap >= 2 ? 0.2 : 0;
  const keyBoost = /(clearance|sponsorship|authorization|timezone|salary|relocate|notice|start date|availability)/.test(`${left} ${right}`) && overlap >= 1
    ? 0.15
    : 0;

  return Math.min(1, jaccard + containsBoost + overlapBoost + keyBoost);
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
  const parent = el.closest('label');
  if (parent) return parent.textContent;
  return null;
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
    const checked = /true|yes|1|agree|understand/i.test(value);
    if (el.checked !== checked) {
      el.checked = checked;
      dispatchEvents(el, ['input', 'change', 'click']);
    }
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
        dispatchEvents(radio, ['input', 'change', 'click']);
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
          dispatchEvents(radio, ['input', 'change', 'click']);
          return true;
        }
        if (wantsNo && /(no|false)/.test(radioText)) {
          radio.checked = true;
          dispatchEvents(radio, ['input', 'change', 'click']);
          return true;
        }
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
    const group = el.name
      ? Array.from(document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(el.name)}"]`))
      : [el];
    return group.some((checkbox) => checkbox.checked);
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
