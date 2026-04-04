/**
 * apply-bot — gemini.js
 * Thin wrapper around the Gemini REST API (gemini-2.0-flash).
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';

// ── Core API call ─────────────────────────────────────────────────────────────

/**
 * Call the Gemini generateContent endpoint.
 * On a 429 response, throws a user-friendly error immediately:
 *   - Daily quota violations show a "try again tomorrow" message.
 *   - Per-minute throttling shows the suggested wait time.
 * No silent sleep/retry is performed in the service worker because Chrome MV3
 * service workers time out after ~30 s of inactivity and cannot reliably hold
 * a long setTimeout open.
 *
 * @param {string} apiKey
 * @param {string|Array} prompt  Plain string or array of parts (for multi-modal).
 * @param {object} [opts]
 * @param {string} [opts.model]
 * @param {object} [opts.generationConfig]
 * @returns {Promise<string>} The text response from Gemini.
 */
export async function callGemini(apiKey, prompt, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;

  const parts = Array.isArray(prompt) ? prompt : [{ text: prompt }];

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      ...opts.generationConfig,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const errText = await res.text();
    throw buildRateLimitError(errText);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

/**
 * Parse the retry delay (in ms) from a Gemini 429 error response body.
 * The body may contain a RetryInfo detail with a `retryDelay` like "39s".
 *
 * @param {string} errText  Raw response body text.
 * @returns {number|null}   Delay in milliseconds, or null if not parseable.
 */
function parseRetryDelay(errText) {
  try {
    const errData = JSON.parse(errText);
    const retryInfo = errData?.error?.details?.find(
      (d) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
    );
    if (retryInfo?.retryDelay) {
      const seconds = parseFloat(String(retryInfo.retryDelay).replace(/s$/i, ''));
      if (!isNaN(seconds)) return Math.ceil(seconds) * 1000;
    }
  } catch {
    // Ignore JSON parse errors — fall through to return null
  }
  return null;
}

/**
 * Return true if any QuotaFailure violation is a per-day limit.
 * Daily quota exhaustion cannot be resolved by waiting a few seconds.
 *
 * @param {string} errText  Raw response body text.
 * @returns {boolean}
 */
function hasDailyQuotaViolation(errText) {
  try {
    const errData = JSON.parse(errText);
    const quotaFailure = errData?.error?.details?.find(
      (d) => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure'
    );
    return quotaFailure?.violations?.some((v) => {
      const id = String(v.quotaId || '').toLowerCase();
      return id.includes('perday') || id.includes('per_day');
    }) ?? false;
  } catch {
    return false;
  }
}

/**
 * Build a user-friendly Error for a Gemini 429 rate-limit response.
 * Distinguishes daily quota exhaustion from transient per-minute throttling.
 *
 * @param {string} errText  Raw 429 response body.
 * @returns {Error}
 */
function buildRateLimitError(errText) {
  if (hasDailyQuotaViolation(errText)) {
    return new Error(
      'Gemini daily free-tier quota exceeded. ' +
        'Your daily quota resets once per day. ' +
        'Visit https://ai.dev/rate-limit to check usage or upgrade your plan.'
    );
  }

  const retryMs = parseRetryDelay(errText);
  const hint = retryMs
    ? `Please wait ${Math.ceil(retryMs / 1000)} s and try again.`
    : 'You may have exceeded your free-tier quota. Check https://ai.dev/rate-limit.';
  return new Error(`Gemini rate limit reached (429). ${hint}`);
}

// ── Resume parsing ────────────────────────────────────────────────────────────

/**
 * Parse a raw resume (text or base64 data URL) into a structured object.
 *
 * @param {string} resumeRaw   Plain text or base64 data: URL for PDF/DOCX.
 * @param {string} apiKey
 * @param {string} [model]     Optional model override (defaults to DEFAULT_MODEL).
 * @returns {Promise<object>}
 */
export async function parseResumeWithGemini(resumeRaw, apiKey, model) {
  let parts;

  if (resumeRaw.startsWith('data:')) {
    // Binary file — send as inline data part
    const [header, b64data] = resumeRaw.split(',');
    const mimeType = header.replace('data:', '').replace(';base64', '');
    parts = [
      {
        inlineData: {
          mimeType,
          data: b64data,
        },
      },
      {
        text: RESUME_PARSE_PROMPT,
      },
    ];
  } else {
    parts = [{ text: `Resume:\n${resumeRaw}\n\n${RESUME_PARSE_PROMPT}` }];
  }

  const raw = await callGemini(apiKey, parts, { model });
  return parseJsonResponse(raw);
}

const RESUME_PARSE_PROMPT = `
Extract ALL information from this resume and return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "name": "",
  "email": "",
  "phone": "",
  "location": "",
  "linkedin": "",
  "github": "",
  "portfolio": "",
  "summary": "",
  "skills": [],
  "experience": [
    {
      "company": "",
      "title": "",
      "start": "",
      "end": "",
      "description": ""
    }
  ],
  "education": [
    {
      "institution": "",
      "degree": "",
      "field": "",
      "year": ""
    }
  ],
  "certifications": [],
  "languages": [],
  "years_of_experience": 0
}
`.trim();

// ── Answer generation ─────────────────────────────────────────────────────────

/**
 * Generate tailored application answers for a specific job.
 *
 * @param {object} params
 * @param {object} params.resume        Structured resume object.
 * @param {string} params.jd            Job description text.
 * @param {string[]} params.customQuestions  Any extra form questions.
 * @param {object} params.settings      User settings (salary, auth, etc.).
 * @param {string} params.apiKey
 * @param {string} [params.model]       Optional Gemini model override.
 * @returns {Promise<object>} Map of field name → answer string.
 */
export async function generateAnswers({ resume, jd, customQuestions, settings, apiKey, model }) {
  const customQSection = customQuestions.length
    ? `Custom questions to answer:\n${customQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : '';

  const prompt = `
You are helping ${resume.name || 'a candidate'} apply for a job.

RESUME (structured):
${JSON.stringify(resume, null, 2)}

JOB DESCRIPTION:
${jd}

${customQSection}

USER PREFERENCES:
- Work authorization: ${settings.work_authorization || 'Not specified'}
- Preferred remote: ${settings.preferred_remote ? 'Yes' : 'No'}
- Salary range: ${settings.preferred_salary_min || '?'}–${settings.preferred_salary_max || '?'}

Generate honest, specific, tailored responses. Match the JD's language. Reference specific JD requirements.
Never fabricate experience. Be confident and direct. Keep answers concise (3-4 sentences for essays).

Return ONLY valid JSON (no markdown fences) with these fields:
{
  "why_company": "...",
  "why_role": "...",
  "relevant_accomplishment": "...",
  "cover_letter": "...",
  "years_of_experience": "...",
  "work_authorization": "${settings.work_authorization || ''}",
  "salary_expectation": "${settings.preferred_salary_min || ''}",
  "preferred_location": "${resume.location || ''}",
  "linkedin": "${resume.linkedin || ''}",
  "github": "${resume.github || ''}",
  "portfolio": "${resume.portfolio || ''}",
  "custom_answers": {}
}

For each custom question, add an entry in "custom_answers" with the question as the key and your answer as the value.
`.trim();

  const raw = await callGemini(apiKey, prompt, { model });
  const answers = parseJsonResponse(raw);

  // Merge static fields directly from resume so they're always accurate
  return {
    ...answers,
    first_name: (resume.name || '').split(' ')[0] || '',
    last_name: (resume.name || '').split(' ').slice(1).join(' ') || '',
    full_name: resume.name || '',
    email: resume.email || '',
    phone: resume.phone || '',
    location: resume.location || '',
    linkedin: resume.linkedin || answers.linkedin || '',
    github: resume.github || answers.github || '',
    portfolio: resume.portfolio || answers.portfolio || '',
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Strip optional markdown code fences and parse JSON.
 * @param {string} raw
 * @returns {object}
 */
export function parseJsonResponse(raw) {
  let cleaned = raw.trim();
  // Remove ```json ... ``` or ``` ... ``` fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Gemini returned invalid JSON: ' + cleaned.slice(0, 200));
  }
}
