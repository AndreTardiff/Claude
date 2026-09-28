import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, WORLD, describe, quote } from '../src/index.js';
import { belief, learn, snapshot, swapNews } from '../src/systems/knowledge.js';

const DAY = 1440;
const at = (day) => 330 + day * DAY;

test('every inn knows its own board fresh and the other towns only by older word', () => {
  const sim = new Simulation({ seed: 1 });
  sim.advanceTo(at(3));
  for (const sid of ['kingscross', 'copperford', 'greenhollow', 'saltmouth']) {
    const own = belief(sim, `inn:${sid}`, sid, 'grain');
    assert.equal(own.source, 'board');
    assert.ok(own.ageDays < 1);
    for (const other of ['kingscross', 'copperford', 'greenhollow', 'saltmouth'].filter((x) => x !== sid)) {
      const b = belief(sim, `inn:${sid}`, other, 'grain');
      assert.ok(b && b.ageDays > 0.2, `${sid} on ${other}: ${b?.ageDays}`);
    }
  }
});

test('news travels at road speed: a disaster in Copperford reaches Kingscross days later, not at once', () => {
  const sim = new Simulation({ seed: 1 });
  sim.advanceTo(at(5));
  const before = quote(sim, 'copperford', 'grain').price;
  sim.command('lab:spoil', { at: 'copperford', good: 'grain', fraction: 0.9 });
  const shock = sim.now;
  // Half a day later, Kingscross still believes the old price.
  sim.advanceTo(shock + 12 * 60);
  const early = belief(sim, 'inn:kingscross', 'copperford', 'grain');
  assert.ok(early.t < shock, 'no news can have arrived yet');
  // Within ten days, word has come.
  let heard = null;
  for (let h = 12; h <= 240 && !heard; h += 6) {
    sim.advanceTo(shock + h * 60);
    const b = belief(sim, 'inn:kingscross', 'copperford', 'grain');
    if (b.t >= shock) heard = { h, b };
  }
  assert.ok(heard, 'Kingscross should hear within ten days');
  assert.ok(heard.h >= 18, `news took only ${heard.h} hours: faster than any rider`);
  assert.ok(heard.b.price > before * 3, `the news should carry the shock (${before.toFixed(1)} → ${heard.b.price})`);
});

test('word of mouth is a little wrong and a little less trusted; letters are exact', () => {
  const sim = new Simulation({ seed: 2 });
  const rec = snapshot(sim, 'copperford', 'seen', 1000);
  learn(sim, 'tester', { ...rec, t: sim.now + 1 });
  swapNews(sim, 'tester', 'greenhollow');
  const inn = sim.state.knowledge.holders['inn:greenhollow'].copperford;
  assert.equal(inn.source, 'rumour');
  assert.equal(inn.confidence, Math.round(1000 * WORLD.knowledge.rumourTrust));
  let moved = 0;
  for (const [gid, g] of Object.entries(inn.goods)) {
    const truth = rec.goods[gid].price;
    assert.ok(Math.abs(g.price - truth) <= truth * WORLD.knowledge.rumourNoise + 0.01, `${gid}: ${g.price} vs ${truth}`);
    if (Math.abs(g.price - truth) > 0.01) moved++;
  }
  assert.ok(moved > 0, 'a rumour should not be word-perfect');

  learn(sim, 'courier', { ...snapshot(sim, 'saltmouth', 'seen', 1000), t: sim.now + 2 });
  swapNews(sim, 'courier', 'kingscross', { letters: true });
  const letter = sim.state.knowledge.holders['inn:kingscross'].saltmouth;
  assert.equal(letter.source, 'post');
  assert.equal(letter.goods.salt.price, snapshot(sim, 'saltmouth').goods.salt.price);
});

test('a holder keeps only the freshest word per market', () => {
  const sim = new Simulation({ seed: 3 });
  const old = { ...snapshot(sim, 'saltmouth'), t: 100 };
  const newer = { ...snapshot(sim, 'saltmouth'), t: 200 };
  assert.ok(learn(sim, 'h', newer));
  assert.equal(learn(sim, 'h', old), false);
  assert.equal(sim.state.knowledge.holders.h.saltmouth.t, 200);
});

test('the post rides its circuit and delivers letters', () => {
  const sim = new Simulation({ seed: 1 });
  sim.advanceTo(at(30));
  for (const id of sim.state.post.order) {
    const r = sim.state.post.byId[id];
    assert.ok(r.deliveries >= 5, `${r.name} made ${r.deliveries} deliveries`);
  }
  const posts = sim.state.log.filter((e) => e.type === 'post:arrived');
  assert.ok(posts.length > 5);
  for (const e of posts) assert.ok(!/undefined|NaN/.test(describe(e, sim)));
  const postRecords = Object.values(sim.state.knowledge.holders)
    .flatMap((h) => Object.values(h)).filter((r) => r.source === 'post');
  assert.ok(postRecords.length > 0, 'inns hold letters');
});
