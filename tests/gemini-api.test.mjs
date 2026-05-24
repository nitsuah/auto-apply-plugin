import test from 'node:test';
import assert from 'node:assert/strict';

import { callGemini, generateAnswers, parseResumeWithGemini } from '../lib/gemini.js';

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function textResponse(status, text) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      throw new Error('Not JSON');
    },
    async text() {
      return text;
    },
  };
}

test('callGemini discovers models and falls back when first choice is unavailable', async () => {
  const responses = [
    jsonResponse(200, {
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
      ],
    }),
    textResponse(404, 'not found'),
    jsonResponse(200, {
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    }),
  ];

  const originalFetch = global.fetch;
  global.fetch = async () => responses.shift();

  try {
    const out = await callGemini('api-key-fallback', 'hello', { model: 'auto' });
    assert.equal(out, '{"ok":true}');
  } finally {
    global.fetch = originalFetch;
  }
});

test('callGemini returns user-friendly message for quota limit responses', async () => {
  const responses = [
    jsonResponse(200, {
      models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }],
    }),
    textResponse(429, JSON.stringify({
      error: {
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
          },
        ],
      },
    })),
  ];

  const originalFetch = global.fetch;
  global.fetch = async () => responses.shift();

  try {
    await assert.rejects(
      () => callGemini('api-key-rate-limit', 'hello', { model: 'gemini-2.5-flash' }),
      /daily free-tier quota exceeded/i
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('parseResumeWithGemini parses text and data URLs into structured JSON', async () => {
  const responses = [
    jsonResponse(200, {
      models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }],
    }),
    jsonResponse(200, {
      candidates: [{ content: { parts: [{ text: '{"name":"Taylor","skills":["JS"]}' }] } }],
    }),
    jsonResponse(200, {
      models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }],
    }),
    jsonResponse(200, {
      candidates: [{ content: { parts: [{ text: '{"name":"Jordan","skills":["TS"]}' }] } }],
    }),
  ];

  const originalFetch = global.fetch;
  global.fetch = async () => responses.shift();

  try {
    const fromText = await parseResumeWithGemini('Resume text body', 'api-key-text', 'gemini-2.5-flash');
    const fromDataUrl = await parseResumeWithGemini('data:application/pdf;base64,ZmFrZQ==', 'api-key-binary', 'gemini-2.5-flash');

    assert.equal(fromText.name, 'Taylor');
    assert.equal(fromDataUrl.name, 'Jordan');
  } finally {
    global.fetch = originalFetch;
  }
});

test('generateAnswers merges resume/static fields with model output', async () => {
  const responses = [
    jsonResponse(200, {
      models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }],
    }),
    jsonResponse(200, {
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        why_company: 'Mission fit',
        why_role: 'Strong platform match',
        relevant_accomplishment: 'Improved reliability',
        cover_letter: 'Short cover letter',
        years_of_experience: '7',
        custom_answers: { 'Why us?': 'Because impact.' },
      }) }] } }],
    }),
  ];

  const originalFetch = global.fetch;
  global.fetch = async () => responses.shift();

  try {
    const answers = await generateAnswers({
      apiKey: 'api-key-generate',
      model: 'gemini-2.5-flash',
      jd: 'Platform engineer role focused on reliability and automation.',
      customQuestions: ['Why us?'],
      settings: {
        preferred_salary_min: '150000',
        preferred_salary_max: '180000',
        work_authorization: 'Yes',
        preferred_remote: true,
      },
      resume: {
        name: 'Austin Hardy',
        email: 'austin@example.com',
        phone: '555-555-5555',
        location: 'Nashville, TN',
        linkedin: 'https://linkedin.com/in/austin',
        github: 'https://github.com/austin',
        portfolio: 'https://austin.dev',
        years_of_experience: 8,
        experience: [{ company: 'Acme', title: 'Engineer' }],
      },
    });

    assert.equal(answers.first_name, 'Austin');
    assert.equal(answers.last_name, 'Hardy');
    assert.equal(answers.email, 'austin@example.com');
    assert.equal(answers.current_company, 'Acme');
    assert.equal(answers.current_title, 'Engineer');
    assert.equal(answers.desired_salary_min, '150000');
    assert.equal(answers.desired_salary_max, '180000');
    assert.equal(answers.custom_answers['Why us?'], 'Because impact.');
  } finally {
    global.fetch = originalFetch;
  }
});
