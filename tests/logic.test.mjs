import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { extractJsonCandidate, parseJsonResponse } from '../lib/gemini.js';
import {
  findLearnedAnswer,
  isIgnoredLearnedPrompt,
  resolveAnswerKeyFromCandidates,
  shouldPersistLearnedValue,
} from '../lib/form-filler.js';
import { structureResume } from '../lib/resume-parser.js';
import {
  deriveTrackerDetailsFromText,
  isTerminalApplicationStatus,
  normalizeApplicationStatus,
  normalizeEmploymentType,
} from '../lib/tracker.js';

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

test('findLearnedAnswer reuses prior answers for similar prompts', () => {
  const answer = findLearnedAnswer('Will you need security clearance for this role?', {
    'Do you require security clearance?': 'No',
    'What timezone are you in?': 'Eastern',
  });

  assert.equal(answer, 'No');
});

test('shouldPersistLearnedValue avoids sensitive demographic prompts', () => {
  assert.equal(shouldPersistLearnedValue('Gender identity', 'Prefer not to say'), false);
  assert.equal(shouldPersistLearnedValue('Do you require security clearance?', 'No'), true);
});

test('shouldPersistLearnedValue ignores legal acknowledgements and arbitration confirmations', () => {
  assert.equal(
    shouldPersistLearnedValue(
      'I acknowledge that I have opened, read, and understood the Arbitration Agreement.',
      'I confirm I have read the above.'
    ),
    false
  );
});

test('isIgnoredLearnedPrompt blocks ignored outlier prompts until the ignore is removed', () => {
  const ignored = {
    'work authorization countries listed in the job posting': {
      question: 'Are you legally authorized to work in the countries listed in the job posting?',
      answer: 'Yes',
    },
  };

  assert.equal(
    isIgnoredLearnedPrompt('Are you legally authorized to work in the countries listed in the job posting?', ignored),
    true
  );
  assert.equal(isIgnoredLearnedPrompt('What timezone are you in?', ignored), false);
});

test('structureResume preserves explicit demographic opt-in fields', () => {
  const resume = structureResume({
    name: 'Example User',
    sensitive_optin: true,
    gender: 'Male',
    race: 'White',
    veteran: 'No',
    disability: 'No',
    pronouns_sensitive: 'He/him',
  });

  assert.equal(resume.sensitive_optin, true);
  assert.equal(resume.gender, 'Male');
  assert.equal(resume.race, 'White');
  assert.equal(resume.veteran, 'No');
  assert.equal(resume.disability, 'No');
  assert.equal(resume.pronouns_sensitive, 'He/him');
});

test('resolveAnswerKeyFromCandidates maps common demographic prompts when opted in', () => {
  const genderKey = resolveAnswerKeyFromCandidates(['Gender identity'], fieldMap, {});
  const veteranKey = resolveAnswerKeyFromCandidates(['Protected veteran status'], fieldMap, {});

  assert.equal(genderKey, 'gender');
  assert.equal(veteranKey, 'veteran');
});

test('normalizeEmploymentType applies sensible tracker defaults', () => {
  assert.equal(normalizeEmploymentType(''), 'Full-time');
  assert.equal(normalizeEmploymentType('part time'), 'Part-time');
  assert.equal(normalizeEmploymentType('contract'), 'Contract');
});

test('isTerminalApplicationStatus hides fill review after submission-style states', () => {
  assert.equal(isTerminalApplicationStatus('filled'), false);
  assert.equal(isTerminalApplicationStatus('drafted'), false);
  assert.equal(isTerminalApplicationStatus('submitted'), true);
  assert.equal(isTerminalApplicationStatus('interview'), true);
  assert.equal(isTerminalApplicationStatus('offer'), true);
});

test('deriveTrackerDetailsFromText extracts location, salary, remote flag, and employment type from pasted JD text', () => {
  const details = deriveTrackerDetailsFromText(`
    Senior Platform Engineer
    Location: San Francisco, CA
    Compensation: $180,000 - $220,000
    This is a full time hybrid role with occasional work from home flexibility.
  `);

  assert.equal(details.location, 'San Francisco, CA');
  assert.equal(details.salary_range, '$180,000 - $220,000');
  assert.equal(details.employment_type, 'Full-time');
  assert.equal(details.remote, true);
});
