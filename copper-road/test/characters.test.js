// Step G+1: the houses have characters (spec §20.1), habits and blind spots that bend
// how they weigh a trade and read the news. The inspector names the bias.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, WORLD, activeMerchants, describe, tradeCandidates } from '../src/index.js';
import { booksBalance, moneySupply } from '../src/economy/money.js';
import { heardDeal, keepToHabit } from '../src/systems/merchants.js';
import { innOf } from '../src/systems/knowledge.js';

const DAY = 1440;
const at = (day) => 330 + day * DAY;
const KINDS = Object.keys(WORLD.merchants.characters).sort();
const byKind = (sim) => Object.fromEntries(activeMerchants(sim).map((m) => [m.character?.kind, m]));
// The same house weighing trades from its home market, with and without its character.
const reckon = (sim, m, character = m.character) => {
  const key = (c) => `${c.good}>${c.to}`;
  return new Map(tradeCandidates(sim, { ...m, at: m.home, character }).map((c) => [key(c), c]));
};

test('each founding house has a character, one of each kind', () => {
  for (const seed of [1, 2, 3]) {
    const sim = new Simulation({ seed });
    assert.deepEqual(activeMerchants(sim).map((m) => m.character?.kind).sort(), KINDS);
  }
});

test('an optimist expects more of every load and a pessimist less, and each says so', () => {
  const sim = new Simulation({ seed: 4 });
  sim.advanceTo(at(15));
  const houses = byKind(sim);
  for (const [kind, more] of [['optimist', true], ['pessimist', false]]) {
    const m = houses[kind];
    const plain = reckon(sim, m, null);
    const bent = reckon(sim, m);
    assert.ok(bent.size > 0, `${kind}: some trades to weigh`);
    for (const [k, c] of bent) {
      const p = plain.get(k);
      if (!p) continue;
      assert.equal(c.bias, kind === 'optimist' ? 'optimism' : 'pessimism');
      if (more) assert.ok(c.revenue > p.revenue && c.risk / c.revenue < p.risk / p.revenue + 1e-9, `${k}: the optimist counts on more and fears the road less`);
      else assert.ok(c.revenue < p.revenue && c.risk / c.revenue > p.risk / p.revenue - 1e-9, `${k}: the pessimist counts on less and fears the road more`);
    }
  }
});

test('a hoarder never stakes more than its share of the purse on one load', () => {
  const sim = new Simulation({ seed: 5 });
  sim.advanceTo(at(10));
  const m = byKind(sim).hoarder;
  const stake = sim.data.merchants.characters.hoarder.stake;
  const purse = sim.state.coin.accounts[`merchant:${m.id}`] / sim.data.coin.bitsPerMark;
  for (const c of reckon(sim, m).values()) assert.ok(c.cost + c.fee <= purse * stake + 0.01, `${c.qty} ${c.good} for ${(c.cost + c.fee).toFixed(1)} of a ${purse.toFixed(0)}-mark purse`);
});

test('word of a good sale spreads from the inn, and a follower acts on it', () => {
  const sim = new Simulation({ seed: 6 });
  sim.advanceTo(at(60));
  const k = sim.state.knowledge.holders;
  const sold = sim.state.log.filter((e) => e.type === 'merchant:sold' && e.profit > 0);
  assert.ok(sold.length > 0, 'some house has sold at a profit');
  const e = sold[0];
  assert.ok(k[innOf(e.at)][`deal:${e.good}:${e.at}`], 'the sale is talked of at the inn where it was made');
  // Others have heard of somebody's deal, by word of mouth.
  const hearsay = Object.entries(k).filter(([h, recs]) => !h.startsWith('inn:') && Object.values(recs).some((r) => r.deal && r.who !== h && r.source === 'rumour'));
  assert.ok(hearsay.length > 0, 'deals are retold by people who were not there');
  // A follower counts on more from a trade it has fresh word of (and names why).
  const f = byKind(sim).follower;
  const cfg = sim.data.merchants.characters.follower;
  const bent = reckon(sim, f);
  const plain = reckon(sim, f, null);
  for (const [key, c] of bent) {
    const deal = heardDeal(sim, f.id, c.good, c.to);
    const fresh = deal && deal.profit > 0 && deal.who !== f.id && sim.now - deal.t <= cfg.followDays * DAY;
    assert.equal(c.bias, fresh ? 'heard it paid' : null, key);
    if (fresh) {
      assert.ok(c.revenue > plain.get(key).revenue, `${key}: a follower counts on more where others did well`);
    }
  }
  // Fresh word of a deal it hadn't heard of: the follower leans that way at once.
  const early = new Simulation({ seed: 6 });
  early.advanceTo(at(3));
  const f2 = byKind(early).follower;
  const c = [...reckon(early, f2).values()].find((x) => x.bias === null);
  assert.ok(c, 'a trade it has no word of yet');
  early.state.knowledge.holders[f2.id][`deal:${c.good}:${c.to}`] = { at: `deal:${c.good}:${c.to}`, t: early.now, deal: true, good: c.good, from: f2.home, to: c.to, qty: 10, profit: 50, who: 'm999', source: 'rumour', confidence: 600 };
  const after = reckon(early, f2).get(`${c.good}>${c.to}`);
  assert.equal(after.bias, 'heard it paid');
  assert.ok(after.revenue > c.revenue, 'and counts on more from it');
});

test('a creature of habit keeps to the trade it knows, and names the bias', () => {
  for (const seed of [1, 2, 3, 4]) {
    const sim = new Simulation({ seed });
    const m = byKind(sim).habit;
    sim.advanceTo(at(120));
    const fav = m.character.favourite;
    if (!fav) continue;
    // Its favourite is a trade it made at a profit, and it looms larger in its reckoning;
    // goods it has never carried look a little worse than they are.
    assert.ok(sim.state.log.some((e) => e.type === 'merchant:sold' && e.who === m.id && e.good === fav.good && e.profit > 0), `seed ${seed}: a favourite that once paid`);
    for (const c of reckon(sim, m).values()) {
      if (c.good === fav.good && c.to === fav.to) assert.equal(c.bias, 'habit');
      else if (!m.character.carried.includes(c.good)) assert.equal(c.bias, 'unfamiliar');
      else assert.equal(c.bias, null);
    }
    assert.equal(booksBalance(sim), moneySupply(sim));
  }
});

test('a habit is given up only when it stings twice running, for what has paid best since', () => {
  const sim = new Simulation({ seed: 1 });
  const m = byKind(sim).habit;
  const bits = (marks) => marks * sim.data.coin.bitsPerMark;
  const trip = (good, to, profit, expected) => ({ good, from: m.home, to, profit: bits(profit), expected: bits(expected) });
  keepToHabit(sim, m, trip('salt', 'copperford', -10, 20));
  assert.equal(m.character.favourite, null, 'a loss makes no habit');
  keepToHabit(sim, m, trip('grain', 'kingscross', 50, 40));
  assert.deepEqual([m.character.favourite.good, m.character.favourite.to], ['grain', 'kingscross'], 'the first trade that pays');
  m.ledger.push({ ...trip('wool', 'saltmouth', 90, 60), t: sim.now });
  keepToHabit(sim, m, trip('grain', 'kingscross', 15, 40));
  assert.equal(m.character.stings, 1, 'under half what was hoped: it stings');
  keepToHabit(sim, m, trip('wool', 'saltmouth', 30, 40));
  assert.equal(m.character.stings, 1, 'other trades neither sting nor soothe');
  keepToHabit(sim, m, trip('grain', 'kingscross', 45, 40));
  assert.equal(m.character.stings, 0, 'a good trip and all is forgiven');
  keepToHabit(sim, m, trip('grain', 'kingscross', -5, 40));
  keepToHabit(sim, m, trip('grain', 'kingscross', 12, 40));
  assert.deepEqual([m.character.favourite.good, m.character.favourite.to], ['wool', 'saltmouth'], 'twice stung: whatever has paid best since');
  const e = sim.state.log.find((x) => x.type === 'merchant:habit' && x.who === m.id);
  assert.deepEqual([e.was.good, e.now.good], ['grain', 'wool']);
  assert.match(describe(e, sim), /gives up carrying grain to Kingscross/);
});

test('new houses take the character fewest of the active houses have', () => {
  const sim = new Simulation({ seed: 7 });
  sim.advanceTo(at(240));
  const founded = sim.state.log.filter((e) => e.type === 'merchant:founded');
  for (const e of founded) assert.ok(KINDS.includes(sim.state.merchants.byId[e.who].character?.kind), 'every new house has a character');
  const counts = KINDS.map((k) => activeMerchants(sim).filter((m) => m.character?.kind === k).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, `the kinds stay mixed: ${counts.join(' ')}`);
});
