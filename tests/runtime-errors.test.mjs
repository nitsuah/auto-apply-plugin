// test/runtime-errors.test.mjs
import { execSync } from 'child_process';
import assert from 'assert';

try {
  const output = execSync('npx eslint popup/popup.js', { encoding: 'utf8' });
  if (/ReferenceError|is not defined|not a function|not exported/.test(output)) {
    throw new Error('Lint or runtime error detected: ' + output);
  }
} catch (err) {
  if (err.stdout && /ReferenceError|is not defined|not a function|not exported/.test(err.stdout)) {
    throw new Error('Lint or runtime error detected: ' + err.stdout);
  }
  if (err.stderr && /ReferenceError|is not defined|not a function|not exported/.test(err.stderr)) {
    throw new Error('Lint or runtime error detected: ' + err.stderr);
  }
  if (err.status) throw err;
}

assert.ok(true, 'No missing function or export errors found.');
