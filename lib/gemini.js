/**
 * apply-bot — gemini.js
 * Thin wrapper around the Gemini REST API (gemini-2.0-flash).
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';

// ── Core API call ─────────────────────────────────────────────────────────────

/**
 * Call the Gemini generateContent endpoint.
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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

// ── Resume parsing ────────────────────────────────────────────────────────────

/**
 * Parse a raw resume (text or base64 data URL) into a structured object.
 *
 * @param {string} resumeRaw   Plain text or base64 data: URL for PDF/DOCX.
 * @param {string} apiKey
 * @returns {Promise<object>}
 */
export async function parseResumeWithGemini(resumeRaw, apiKey) {
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

  const raw = await callGemini(apiKey, parts);
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
 * @returns {Promise<object>} Map of field name → answer string.
 */
export async function generateAnswers({ resume, jd, customQuestions, settings, apiKey }) {
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

  const raw = await callGemini(apiKey, prompt);
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
