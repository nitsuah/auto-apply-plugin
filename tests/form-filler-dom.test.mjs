import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { collectCustomQuestions, fillForm } from '../lib/form-filler.js';

function setupDom(html) {
  const dom = new JSDOM(html, { url: 'https://example.com/job' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  global.Event = dom.window.Event;
  global.CSS = dom.window.CSS || { escape: (value) => String(value).replace(/"/g, '\\"') };
  return dom;
}

test('collectCustomQuestions keeps meaningful prompts and filters sensitive/basic fields', () => {
  setupDom(`
    <main>
      <label>First name</label>
      <label>Why are you interested in this role?</label>
      <label>Why are you interested in this role?</label>
      <label>Gender identity</label>
      <legend>Describe a production incident you handled and the outcome?</legend>
    </main>
  `);

  const questions = collectCustomQuestions();
  assert.deepEqual(questions, [
    'Why are you interested in this role?',
    'Describe a production incident you handled and the outcome?',
  ]);
});

test('fillForm populates text/select/checkbox/radio fields and reports unresolved items', () => {
  setupDom(`
    <form>
      <label for="firstName">First name</label>
      <input id="firstName" name="first_name" />

      <label for="email">Email</label>
      <input id="email" name="email" value="already@set.dev" />

      <label for="auth">Work authorization status</label>
      <select id="auth" name="work authorization">
        <option value="">Select...</option>
        <option value="yes">Yes, authorized</option>
        <option value="no">No</option>
      </select>

      <label><input id="relocate" type="checkbox" name="open_relocation" /> Open to relocate</label>

      <fieldset>
        <legend>Will you require visa sponsorship?</legend>
        <label for="sponsor-yes">Yes</label>
        <input id="sponsor-yes" type="radio" name="sponsorship" value="yes" />
        <label for="sponsor-no">No</label>
        <input id="sponsor-no" type="radio" name="sponsorship" value="no" />
      </fieldset>

      <label for="portfolio">Portfolio</label>
      <input id="portfolio" name="portfolio_url" />
    </form>
  `);

  const answers = {
    first_name: 'Austin',
    work_authorization: 'Yes, authorized to work',
    open_relocation: 'yes',
    requires_sponsorship: 'No sponsorship required',
  };

  const fieldMap = {
    'first name': 'first_name',
    'work authorization': 'work_authorization',
    work_auth: 'work_authorization',
    relocate: 'open_relocation',
    sponsorship: 'requires_sponsorship',
  };

  const result = fillForm(answers, fieldMap, { highlight: false });

  assert.equal(document.getElementById('firstName').value, 'Austin');
  assert.equal(document.getElementById('email').value, 'already@set.dev');
  assert.equal(document.getElementById('relocate').checked, true);
  assert.equal(document.getElementById('sponsor-no').checked, true);

  assert.equal(result.filled >= 3, true);
  assert.equal(result.preserved >= 1, true);
  assert.equal(result.unresolved.some((item) => item.label.toLowerCase().includes('portfolio')), true);
});
