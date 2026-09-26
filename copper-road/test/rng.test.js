import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, createStreamState, getRng } from '../src/core/rng.js';

test('same seed and stream give the same sequence', () => {
  const a = new Rng(createStreamState(42, 'x'));
  const b = new Rng(createStreamState(42, 'x'));
  for (let i = 0; i < 1000; i++) assert.equal(a.u32(), b.u32());
});

test('different seeds or streams diverge', () => {
  const a = new Rng(createStreamState(42, 'x'));
  const b = new Rng(createStreamState(43, 'x'));
  const c = new Rng(createStreamState(42, 'y'));
  const sa = Array.from({ length: 8 }, () => a.u32());
  assert.notDeepEqual(sa, Array.from({ length: 8 }, () => b.u32()));
  assert.notDeepEqual(sa, Array.from({ length: 8 }, () => c.u32()));
});

test('streams are independent: using one never shifts another', () => {
  const streams1 = {};
  const streams2 = {};
  const first = Array.from({ length: 20 }, () => getRng(streams1, 7, 'weather').u32());
  for (let i = 0; i < 50; i++) getRng(streams2, 7, 'raiders').u32(); // an unrelated stream draws first
  const second = Array.from({ length: 20 }, () => getRng(streams2, 7, 'weather').u32());
  assert.deepEqual(first, second);
});

test('state survives a JSON round trip mid-sequence', () => {
  const streams = {};
  const r = getRng(streams, 'seed', 'names');
  for (let i = 0; i < 37; i++) r.u32();
  const copy = JSON.parse(JSON.stringify(streams));
  const next = Array.from({ length: 10 }, () => r.u32());
  const resumed = Array.from({ length: 10 }, () => getRng(copy, 'seed', 'names').u32());
  assert.deepEqual(resumed, next);
});

test('int() stays in range and hits every value', () => {
  const r = new Rng(createStreamState(1, 'int'));
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const v = r.int(-3, 3);
    assert.ok(v >= -3 && v <= 3 && Number.isInteger(v));
    seen.add(v);
  }
  assert.equal(seen.size, 7);
  assert.throws(() => r.int(5, 4));
});

test('float() is roughly uniform', () => {
  const r = new Rng(createStreamState(1, 'float'));
  const buckets = new Array(10).fill(0);
  const n = 20000;
  for (let i = 0; i < n; i++) {
    const f = r.float();
    assert.ok(f >= 0 && f < 1);
    buckets[Math.floor(f * 10)]++;
  }
  for (const b of buckets) assert.ok(Math.abs(b - n / 10) < n / 10 * 0.1, `bucket ${b} is far from ${n / 10}`);
});

test('weighted() respects weights and never picks zero weight', () => {
  const r = new Rng(createStreamState(1, 'w'));
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 9000; i++) counts[r.weighted([['a', 1], ['b', 2], ['c', 0]])]++;
  assert.equal(counts.c, 0);
  assert.ok(counts.b > counts.a * 1.7 && counts.b < counts.a * 2.3, JSON.stringify(counts));
});

test('shuffle() is a permutation', () => {
  const r = new Rng(createStreamState(1, 's'));
  const list = r.shuffle([...'abcdefghij']);
  assert.deepEqual([...list].sort(), [...'abcdefghij']);
});
