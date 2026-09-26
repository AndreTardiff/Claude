// The browser lab compares its own run against lab/reference.json to prove the
// simulation is identical in Node and in the browser. Keep that file current:
// if this test fails after an intended change to simulation outcomes, run
// `npm run reference` and commit the new file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { referenceRun } from './reference-run.js';

test('lab/reference.json matches the current simulation', () => {
  const stored = JSON.parse(readFileSync(new URL('../lab/reference.json', import.meta.url), 'utf8'));
  const current = referenceRun({ seed: stored.seed, days: stored.days });
  assert.equal(stored.hash, current.hash, 'simulation outcomes changed: run `npm run reference`');
  assert.equal(stored.ticks, current.ticks);
});
