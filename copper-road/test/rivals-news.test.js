// Step G+2: news that ages. A load setting out is news; merchants reckon with what they've
// heard is on its way; arriving after rivals have sold the same good is "beaten to it".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, activeMerchants, describe, tradeCandidates } from '../src/index.js';
import { booksBalance, moneySupply } from '../src/economy/money.js';
import { heardBound, innOf } from '../src/systems/knowledge.js';

const DAY = 1440;
const at = (day) => 330 + day * DAY;

test('a load setting out is news at the inn it leaves from, and the word travels', () => {
  const sim = new Simulation({ seed: 2 });
  let e = null;
  for (let d = 1; d <= 20 && !e; d++) {
    sim.advanceTo(at(d));
    e = sim.state.log.find((x) => x.type === 'merchant:departed' && x.good);
  }
  assert.ok(e, 'some house sets out with a load');
  const rec = sim.state.knowledge.holders[innOf(e.from)][`bound:${e.who}`];
  assert.ok(rec?.bound, 'its inn has heard');
  assert.equal(rec.good, e.good);
  assert.equal(rec.to, e.to);
  assert.ok(rec.eta > rec.t, 'with when it should be there');
  // Within a fortnight word of that departure, or of later ones, has reached other towns.
  sim.advanceTo(at(30));
  const elsewhere = Object.keys(sim.state.knowledge.holders).filter((h) => h.startsWith('inn:') && h !== innOf(e.from)
    && Object.values(sim.state.knowledge.holders[h]).some((r) => r.bound && r.from !== h.slice(4)));
  assert.ok(elsewhere.length >= 2, `word of loads on the road reached ${elsewhere.join(', ')}`);
  assert.ok(Object.values(sim.state.knowledge.holders.player).some((r) => r.bound), 'the player hears of them too');
});

test('a merchant reckons with loads it has heard will get there first, and only those', () => {
  const sim = new Simulation({ seed: 3 });
  sim.advanceTo(at(8));
  const m = activeMerchants(sim).find((x) => x.character?.kind !== 'optimist' && !x.trip);
  assert.ok(m, 'a house in town');
  const before = tradeCandidates(sim, m);
  const c = before.find((x) => x.inbound === 0);
  assert.ok(c, 'a trade with nothing heard of on its road');
  const k = sim.state.knowledge.holders[m.id];
  const plant = (who, eta) => ({ at: `bound:${who}`, t: sim.now, bound: true, who, good: c.good, qty: 30, from: 'nowhere', to: c.to, eta, source: 'rumour', confidence: 850 });
  const listed = k[c.to].t; // when their price list of that market was taken
  const arrive = sim.now + c.days * DAY;
  k['bound:m901'] = plant('m901', Math.round((listed + arrive) / 2)); // there first, not yet in their list
  k['bound:m902'] = plant('m902', listed - 60); // there before the list was taken: already in it
  k['bound:m903'] = plant('m903', Math.round(arrive + 2 * DAY)); // there after them
  k[`bound:${m.id}`] = plant(m.id, Math.round((listed + arrive) / 2)); // their own
  assert.equal(heardBound(sim, m.id).get(`${c.to}:${c.good}`).length, 4);
  const after = tradeCandidates(sim, m).find((x) => x.good === c.good && x.to === c.to);
  assert.equal(after.inbound, 30, 'only the load that will be there first, and is news to them');
  assert.ok(Math.abs(after.expectedStock - c.expectedStock - 30) < 1e-9);
  assert.ok(after.revenue < c.revenue, 'so they expect less for theirs');
});

test('arriving after rivals have sold the same good is being beaten to it, and the chronicle names them', () => {
  let found = null;
  for (const seed of [1, 2, 3, 4]) {
    const sim = new Simulation({ seed });
    sim.advanceTo(at(150));
    const e = sim.state.log.find((x) => x.type === 'merchant:beaten');
    if (!e) continue;
    found = { sim, e };
    // Each named rival sold that good there after the beaten caravan set out.
    const left = sim.state.log.filter((x) => x.type === 'merchant:departed' && x.who === e.who && x.to === e.at && x.good === e.good && x.t <= e.t).at(-1);
    assert.ok(left, 'the beaten caravan set out for there');
    for (const r of e.by) {
      assert.notEqual(r, e.who);
      assert.ok(sim.state.log.some((x) => x.type === 'merchant:sold' && x.who === r && x.at === e.at && x.good === e.good && x.t >= left.t && x.t <= e.t)
        || sim.state.merchants.byId[r]?.player, `${r} sold ${e.good} in ${e.at} first`);
    }
    assert.ok(e.found < e.heard * (1 - sim.data.merchants.beatenBelow), 'and the price had fallen well below what they heard');
    assert.equal(booksBalance(sim), moneySupply(sim));
    break;
  }
  assert.ok(found, 'some caravan is beaten to a market');
  const text = describe(found.e, found.sim);
  assert.match(text, /got there first/);
  assert.ok(!/undefined|NaN/.test(text), text);
});
