#!/usr/bin/env node
// Regenerate the reference run that the browser lab compares itself against.
// Run after any change that alters simulation outcomes: npm run reference

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { referenceRun } from '../test/reference-run.js';

const out = fileURLToPath(new URL('../lab/reference.json', import.meta.url));
const ref = referenceRun();
writeFileSync(out, JSON.stringify(ref, null, 2) + '\n');
console.log(`wrote ${out}: seed ${ref.seed}, ${ref.days} days → ${ref.hash}`);
