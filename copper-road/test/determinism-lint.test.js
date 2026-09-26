// Guards the simulation core against APIs that break determinism.
//
// - Wall-clock time and Math.random differ between runs.
// - Transcendental Math functions (sin, exp, pow…) and ** are not guaranteed to give
//   bit-identical results across JavaScript engines, so the same seed could diverge
//   between Node and a browser. Basic arithmetic and Math.sqrt are exact (IEEE 754).
//   If the simulation ever needs them, add deterministic versions to src/core.
// - The core must not touch the DOM or timers, so it runs headless.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

const FORBIDDEN = [
  [/\bMath\.random\b/, 'Math.random (use sim.rng)'],
  [/\bDate\.now\b|\bnew Date\b/, 'wall-clock time'],
  [/\bperformance\.now\b/, 'wall-clock time'],
  [/\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b/, 'engine-dependent Math function'],
  [/\*\*/, 'exponent operator (engine-dependent for fractional powers)'],
  [/\b(setTimeout|setInterval|requestAnimationFrame)\b/, 'timers'],
  [/\b(window|document|localStorage)\b/, 'browser globals'],
];

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}

// Remove comments so documentation can mention forbidden things.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const flagged = (code) => stripComments(code).split('\n').some((line) => FORBIDDEN.some(([re]) => re.test(line)));

test('the lint itself catches violations and ignores comments', () => {
  for (const bad of ['const r = Math.random();', 'x = Math.pow(a, 0.5);', 'y = a ** b;', 't = Date.now();', 'document.title = 1;']) {
    assert.ok(flagged(bad), `should flag: ${bad}`);
  }
  for (const ok of ['// never use Math.random here', '/** a ** b */ const z = Math.sqrt(4);', 'const url = "http://x";']) {
    assert.ok(!flagged(ok), `should allow: ${ok}`);
  }
});

test('simulation core uses only deterministic, headless APIs', () => {
  const problems = [];
  for (const file of jsFiles(SRC)) {
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      for (const [re, why] of FORBIDDEN) {
        if (re.test(line)) problems.push(`${file.slice(SRC.length + 1)}:${i + 1}  ${why}\n    ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(problems, [], '\n' + problems.join('\n'));
});
