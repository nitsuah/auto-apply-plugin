import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

test('popup lint output has no missing symbol/runtime signatures', () => {
  const output = execSync('npx eslint popup/popup.js', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.doesNotMatch(
    output,
    /ReferenceError|is not defined|not a function|not exported/i,
    'Unexpected missing symbol/runtime signature in lint output'
  );
});
