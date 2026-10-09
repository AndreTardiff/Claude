// Step G+3: bands weigh their targets with more variety. Hunger, a prize worth the gamble
// and a proud leader loosen their nerve; a beating tightens it. Their mood is news, and
// travellers reckon their roads by it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, WORLD, describe } from '../src/index.js';
import { activeBands, bandNews, nerveOf } from '../src/systems/raiders.js';
import { bandMood, believedDanger, innOf } from '../src/systems/knowledge.js';
import { booksBalance, moneySupply } from '../src/economy/money.js';

const DAY = 1440;
const at = (day) => 330 + day * DAY;
const N = WORLD.raiders.nerve;
const E = WORLD.raiders.encounter;

test('a band takes on worse odds when hungry, for a rich load, or under a proud leader facing guards; less after a beating', () => {
  const sim = new Simulation({ seed: 1 });
  const band = (o = {}) => ({ hunger: 0, pride: 0, shaken: 0, ...o });
  const plain = { kind: 'merchant', guards: [] };
  const guarded = { kind: 'merchant', guards: [{ id: 'g1' }] };
  const base = nerveOf(sim, band(), plain, 0);
  assert.equal(base.max, E.maxOdds, 'its usual caution');
  assert.deepEqual(base.why, []);
  const hungry = nerveOf(sim, band({ hunger: 0.3 }), plain, 0);
  assert.ok(hungry.max > base.max && hungry.why.includes('hungry'));
  const rich = nerveOf(sim, band(), plain, 1200);
  assert.ok(rich.max > base.max && rich.why.includes('prize'), 'a load worth the gamble');
  // A proud leader wants a name: against guards, not against an unguarded wagon.
  assert.equal(nerveOf(sim, band({ pride: 950 }), plain, 0).max, base.max);
  const proud = nerveOf(sim, band({ pride: 950 }), guarded, 0);
  assert.ok(proud.max > base.max && proud.why.includes('pride'));
  assert.equal(nerveOf(sim, band({ pride: N.proudAbove - 1 }), guarded, 0).max, base.max, 'a leader not proud enough');
  const shaken = nerveOf(sim, band({ shaken: 0.8 }), plain, 0);
  assert.ok(shaken.max < base.max && shaken.why.includes('shaken'), 'a beating makes them warier');
  // Everything at once stays bounded; a desperate band takes any chance.
  assert.ok(nerveOf(sim, band({ hunger: 0.39, pride: 1000 }), guarded, 5000).max <= N.max);
  assert.ok(nerveOf(sim, band({ shaken: 1 }), plain, 0).max >= N.min);
  assert.deepEqual(nerveOf(sim, band({ hunger: E.desperateHunger }), plain, 0), { max: 1, why: ['desperate'] });
});

test("a band's mood is news, and travellers reckon its roads by it", () => {
  const sim = new Simulation({ seed: 2 });
  sim.advanceTo(at(10));
  const band = activeBands(sim)[0];
  const hideout = WORLD.raiders.hideouts.find((h) => h.id === band.hideout);
  // The fence's tavern has had a look at them.
  const told = sim.state.knowledge.holders[innOf(hideout.fence)][`band:${band.hideout}`];
  assert.ok(told?.bandNews, 'the fence town talks of the band');
  assert.ok(['starving', 'hungry', 'fed'].includes(told.mood));
  // A holder who hears the band is starving and proudly led reckons its road worse; gone, better.
  const seg = hideout.watches[0];
  const k = sim.state.knowledge.holders;
  k.someone = {};
  const plain = believedDanger(sim, 'someone', seg);
  assert.equal(bandMood(sim, 'someone', seg), 1, 'nothing heard, no change');
  k.someone[`band:${band.hideout}`] = { ...bandNews(sim, band), mood: 'starving', proud: true, shaken: false };
  const worse = believedDanger(sim, 'someone', seg);
  assert.ok(worse > plain * 1.5, `a starving, proud band: ${plain.toFixed(3)} → ${worse.toFixed(3)}`);
  k.someone[`band:${band.hideout}`] = bandNews(sim, band, true);
  assert.ok(believedDanger(sim, 'someone', seg) < plain, 'a band gone: a quieter road');
  // Old word counts for less.
  k.someone[`band:${band.hideout}`] = { ...bandNews(sim, band), mood: 'starving', proud: true, t: sim.now - 30 * DAY };
  const stale = believedDanger(sim, 'someone', seg);
  assert.ok(stale > plain && stale < worse, 'stale word, a smaller worry');
  // Word of the band spreads beyond its fence town.
  sim.advanceTo(at(40));
  const heard = Object.keys(k).filter((h) => h.startsWith('inn:') && Object.values(k[h]).some((r) => r.bandNews));
  assert.ok(heard.length >= 3, `talk of the bands in ${heard.join(', ')}`);
});

test('bands take on guards for their reasons, the chronicle says why, and a beaten band may throw its leader down', () => {
  let motive = null;
  let usurped = null;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const sim = new Simulation({ seed });
    sim.advanceTo(at(200));
    const e = sim.state.log.find((x) => x.type === 'raid:encounter' && x.guards?.length && x.nerve?.some((w) => ['pride', 'prize', 'desperate', 'hungry'].includes(w)));
    if (e && !motive) motive = describe(e, sim);
    const l = sim.state.log.find((x) => x.type === 'raid:leader' && x.how === 'overthrown');
    if (l && !usurped) {
      const b = sim.state.raiders.bands[l.band];
      assert.notEqual(l.who, l.fallen);
      assert.ok(sim.state.residents.byId[l.who], 'the new leader is one of them');
      usurped = describe(l, sim);
      assert.ok(b.pride >= 0 && b.pride <= 1000);
    }
    assert.equal(booksBalance(sim), moneySupply(sim));
    if (motive && usurped) break;
  }
  assert.ok(motive, 'some band takes on a guarded party for a reason the chronicle can name');
  assert.match(motive, /guards/);
  assert.ok(usurped, 'some beaten band throws down its leader');
  assert.match(usurped, /throws down/);
  for (const text of [motive, usurped]) assert.ok(!/undefined|NaN/.test(text), text);
});
