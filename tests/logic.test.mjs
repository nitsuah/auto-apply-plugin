import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { extractJsonCandidate, parseJsonResponse } from '../lib/gemini.js';
import { resolveAnswerKeyFromCandidates } from '../lib/form-filler.js';
import { structureResume } from '../lib/resume-parser.js';
import { normalizeApplicationStatus } from '../lib/tracker.js';

const fieldMap = JSON.parse(
  await readFile(new URL('../data/field-map.json', import.meta.url), 'utf8')
);

test('extractJsonCandidate pulls JSON out of surrounding text', () => {
  const raw = 'Sure — here you go:\n```json\n{\n  "email": "a@example.com"\n}\n```\nThanks!';
  assert.equal(extractJsonCandidate(raw), '{\n  "email": "a@example.com"\n}');
});

test('parseJsonResponse handles fenced JSON and trailing commas', () => {
  const parsed = parseJsonResponse('```json\n{"name":"Austin","skills":["IT",],}\n```');
  assert.equal(parsed.name, 'Austin');
  assert.deepEqual(parsed.skills, ['IT']);
});

test('parseJsonResponse handles extra prose before a valid object', () => {
  const parsed = parseJsonResponse('Result: {"linkedin":"linkedin.com/in/example","github":"github.com/example"}');
  assert.equal(parsed.linkedin, 'linkedin.com/in/example');
  assert.equal(parsed.github, 'github.com/example');
});

test('parseJsonResponse salvages partial JSON objects', () => {
  const parsed = parseJsonResponse('{"name":"Austin Hardy","city":"Sevierville","state_region":"TN","postal_code":');
  assert.equal(parsed.name, 'Austin Hardy');
  assert.equal(parsed.city, 'Sevierville');
  assert.equal(parsed.state_region, 'TN');
});

test('resolveAnswerKeyFromCandidates maps common ATS salary prompts', () => {
  const key = resolveAnswerKeyFromCandidates(
    ['What is the beginning of your desired annual base salary range?'],
    fieldMap,
    {}
  );
  assert.equal(key, 'desired_salary_min');
});

test('resolveAnswerKeyFromCandidates matches current title and work auth prompts', () => {
  const currentTitleKey = resolveAnswerKeyFromCandidates(['Current job title?'], fieldMap, {});
  const workAuthKey = resolveAnswerKeyFromCandidates(
    ['Are you legally authorized to work in the countries listed in the job posting?'],
    fieldMap,
    {}
  );

  assert.equal(currentTitleKey, 'current_title');
  assert.equal(workAuthKey, 'work_authorization');
});

test('normalizeApplicationStatus keeps tracker semantics honest', () => {
  assert.equal(normalizeApplicationStatus('applied'), 'submitted');
  assert.equal(normalizeApplicationStatus('filled'), 'filled');
  assert.equal(normalizeApplicationStatus(''), 'drafted');
});

test('resolveAnswerKeyFromCandidates can reuse exact saved custom answers', () => {
  const answers = {
    'Why 1Password?': 'I enjoy building reliable internal systems that remove friction for teams.',
  };
  const key = resolveAnswerKeyFromCandidates(['Why 1Password?'], fieldMap, answers);
  assert.equal(key, 'Why 1Password?');
});

test('structureResume derives years of experience when parsed value is zero', () => {
  const resume = structureResume({
    years_of_experience: 0,
    experience: [
      { company: 'Acme', title: 'Engineer', start: '2020', end: 'Present', description: 'Built things' },
    ],
  });

  assert.ok(resume.years_of_experience >= 1);
});
