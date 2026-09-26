import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heapPop, heapPush } from '../src/core/scheduler.js';
import { Rng, createStreamState } from '../src/core/rng.js';

test('pops in time order, ties in scheduling order', () => {
  const heap = [];
  const rng = new Rng(createStreamState(3, 'heap'));
  const events = [];
  for (let seq = 0; seq < 500; seq++) {
    const ev = { t: rng.int(0, 40), seq, kind: 'x', data: {} };
    events.push(ev);
    heapPush(heap, ev);
  }
  const expected = [...events].sort((a, b) => a.t - b.t || a.seq - b.seq);
  const got = [];
  while (heap.length) got.push(heapPop(heap));
  assert.deepEqual(got.map((e) => e.seq), expected.map((e) => e.seq));
});

test('a heap restored from JSON pops identically', () => {
  const heap = [];
  for (let seq = 0; seq < 100; seq++) heapPush(heap, { t: (seq * 7919) % 53, seq, kind: 'x', data: {} });
  for (let i = 0; i < 30; i++) heapPop(heap);
  const copy = JSON.parse(JSON.stringify(heap));
  while (heap.length) assert.deepEqual(heapPop(copy), heapPop(heap));
  assert.equal(copy.length, 0);
});

test('pop on empty returns undefined', () => {
  assert.equal(heapPop([]), undefined);
});
