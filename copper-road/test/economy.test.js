import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Simulation,
  WORLD,
  economyIndex,
  describe,
  purchaseCost,
  quote,
  residentsAt,
  saleValue,
  stockFactor,
  tradeOpportunities,
} from '../src/index.js';

const DAY = 1440;
const START = 330; // the world opens at 05:30 on day 0
const at = (day) => START + day * DAY;
const curves = WORLD.economy.priceCurves;

function run(days, setup, seed = 1) {
  const sim = new Simulation({ seed });
  setup?.(sim);
  sim.advanceTo(at(days));
  return sim;
}

// Track a price every day from `from` to `to`, applying `shock` at `from`.
function priceTrail(sid, gid, from, to, shock) {
  const sim = run(from);
  const before = quote(sim, sid, gid).price;
  shock?.(sim);
  const trail = [quote(sim, sid, gid).price];
  for (let d = from + 1; d <= to; d++) {
    sim.advanceTo(at(d));
    trail.push(quote(sim, sid, gid).price);
  }
  return { before, trail, sim };
}

// ── The price curve ─────────────────────────────────────────────────────────

test('price curve: 1 at balance, bounded by floor and cap, rising with scarcity', () => {
  for (const [name, c] of Object.entries(curves)) {
    assert.ok(Math.abs(stockFactor(c, 1) - 1) < 1e-12, `${name} at balance`);
    assert.ok(Math.abs(stockFactor(c, 0) - c.floor) < 1e-12, `${name} in a glut`);
    let prev = 0;
    for (const s of [0, 0.1, 0.5, 0.9, 1, 1.2, 2, 5, 50, 1e6]) {
      const f = stockFactor(c, s);
      assert.ok(f >= c.floor - 1e-12 && f <= c.cap + 1e-12, `${name} ${s}`);
      assert.ok(f >= prev, `${name} rises with scarcity`);
      prev = f;
    }
  }
  // Essentials bite harder than luxuries when stock halves.
  assert.ok(stockFactor(curves.essential, 2) > stockFactor(curves.luxury, 2) + 0.5);
});

test('every quote explains itself: price = base × local × stock factor', () => {
  const sim = run(12);
  const ix = economyIndex(sim.data);
  for (const sid of ix.markets) {
    for (const gid of ix.goodIds) {
      const q = quote(sim, sid, gid);
      assert.ok(Math.abs(q.price - q.base * q.local * q.factor) < 1e-9);
      assert.ok(Number.isFinite(q.price) && q.price > 0);
    }
  }
});

test('big trades move the price as they go', () => {
  const sim = run(3);
  const q = quote(sim, 'kingscross', 'grain');
  assert.ok(purchaseCost(sim, 'kingscross', 'grain', 30) > 30 * q.price, 'buying 30 costs more than 30 × today\'s price');
  assert.ok(saleValue(sim, 'kingscross', 'grain', 30) < 30 * q.price, 'selling 30 fetches less than 30 × today\'s price');
  assert.equal(purchaseCost(sim, 'kingscross', 'grain', 0), 0);
});

// ── Build step B gate ───────────────────────────────────────────────────────

test('GATE B: a forced shortage raises the price, and local work brings it back', () => {
  // Compare with an untouched twin world, so the season's own drift doesn't count.
  for (const [sid, gid, fraction] of [['kingscross', 'tools', 0.9], ['kingscross', 'timber', 0.7]]) {
    const twin = run(5);
    const shocked = run(5);
    shocked.command('lab:spoil', { at: sid, good: gid, fraction });
    const gaps = [];
    for (let d = 5; d <= 25; d++) {
      twin.advanceTo(at(d));
      shocked.advanceTo(at(d));
      gaps.push(quote(shocked, sid, gid).price - quote(twin, sid, gid).price);
    }
    const base = quote(twin, sid, gid).price;
    const peak = gaps[0];
    const least = Math.min(...gaps.slice(1));
    assert.ok(peak > base * 0.5, `${gid}: the shortage should raise the price by half (+${peak.toFixed(1)} on ${base.toFixed(1)})`);
    assert.ok(least < peak * 0.4, `${gid}: most of the rise should be undone within 20 days (gap ${peak.toFixed(1)} → ${least.toFixed(1)})`);
  }
});

test('GATE B: the autumn harvest crashes grain prices where the granary was drawn down', () => {
  // Without merchants, Greenhollow's granary is always full. Draw it down on the
  // last day of summer, as buyers will in step D, and watch the harvest land.
  const { before, trail } = priceTrail('greenhollow', 'grain', 19, 30, (sim) =>
    sim.command('lab:spoil', { at: 'greenhollow', good: 'grain', fraction: 0.85 }));
  const lean = trail[0];
  const harvested = trail.at(-1);
  assert.ok(lean > before * 3, `drawn down: ${before.toFixed(1)} → ${lean.toFixed(1)}`);
  assert.ok(harvested < lean * 0.3, `harvest: ${lean.toFixed(1)} → ${harvested.toFixed(1)}`);
});

test('AT-02: remove 70% of Copperford grain and the price rises, visibly explained', () => {
  const sim = run(4);
  const before = quote(sim, 'copperford', 'grain');
  sim.command('lab:spoil', { at: 'copperford', good: 'grain', fraction: 0.7 });
  const after = quote(sim, 'copperford', 'grain');
  assert.ok(after.price > before.price * 2, `${before.price.toFixed(1)} → ${after.price.toFixed(1)}`);
  assert.ok(after.stock < before.stock * 0.31 && after.scarcity > before.scarcity * 3);
  const entry = sim.state.log.find((e) => e.type === 'market:disaster');
  assert.match(describe(entry, sim), /Fire in the granary at Copperford: \d+ sacks of grain lost/);
});

test('AT-09: a dead smith stays dead, tool output drops, and an apprentice takes over', () => {
  const baseline = run(3);
  const sim = run(3);
  const smiths = () => residentsAt(sim, 'kingscross').filter((r) => r.profession === 'smith');
  const victim = smiths()[0];
  sim.command('lab:death', { id: victim.id });
  assert.equal(victim.alive, false);
  assert.equal(smiths().length, 2);

  baseline.advanceTo(at(4));
  sim.advanceTo(at(4));
  const made = (s) => s.state.economy.today.kingscross.trades.find((t) => t.profession === 'smith').made;
  assert.ok(made(sim) < made(baseline) * 0.8, `tool output ${made(baseline)} → ${made(sim)}`);

  sim.advanceTo(at(7));
  const heir = smiths().find((r) => r.learning);
  assert.ok(heir, 'someone takes up the trade after a few days');
  const log = sim.state.log.find((e) => e.type === 'resident:succeeded');
  assert.equal(log.predecessor, victim.id);
  const skill = heir.skill;
  sim.advanceTo(at(12));
  assert.ok(heir.skill > skill, 'apprentices learn on the job');
  assert.equal(victim.alive, false, 'the dead stay dead');
});

test('production comes from people: lose the farmers and the harvest shrinks', () => {
  const baseline = run(1);
  const sim = run(1);
  for (const r of residentsAt(sim, 'greenhollow').filter((x) => x.profession === 'farmer')) {
    sim.command('lab:death', { id: r.id });
  }
  baseline.advanceTo(at(26)); // mid-autumn: harvest time
  sim.advanceTo(at(26));
  const harvest = (s) => s.state.economy.today.greenhollow.trades.find((t) => t.profession === 'farmer')?.made ?? 0;
  // Their families took over the fields, but as untrained apprentices.
  const apprentices = residentsAt(sim, 'greenhollow').filter((r) => r.profession === 'farmer');
  assert.ok(apprentices.length > 0 && apprentices.every((r) => r.learning));
  assert.ok(harvest(sim) < harvest(baseline) * 0.65, `harvest ${harvest(baseline).toFixed(1)} → ${harvest(sim).toFixed(1)}`);
});

test('seasons move prices: firewood dearest in winter, medicine too', () => {
  const sim = new Simulation({ seed: 1 });
  const priceOn = (day, gid) => {
    sim.advanceTo(at(day));
    return quote(sim, 'kingscross', gid).price;
  };
  const summerTimber = priceOn(15, 'timber');
  const summerMedicine = quote(sim, 'kingscross', 'medicine').price;
  const winterTimber = priceOn(36, 'timber');
  const winterMedicine = quote(sim, 'kingscross', 'medicine').price;
  assert.ok(winterTimber > summerTimber * 1.3, `timber ${summerTimber.toFixed(1)} → ${winterTimber.toFixed(1)}`);
  assert.ok(winterMedicine > summerMedicine * 2, `medicine ${summerMedicine.toFixed(1)} → ${winterMedicine.toFixed(1)}`);
});

test('elastic trades slack off in a glut: Copperford\'s woodcutters idle when timber piles up', () => {
  const sim = run(30);
  const cutters = sim.state.economy.today.copperford.trades.find((t) => t.profession === 'woodcutter');
  assert.ok(cutters.effort < 0.6, `woodcutters working at ${cutters.effort}`);
  const news = sim.state.log.filter((e) => e.type === 'market:news' && e.good === 'timber' && e.at === 'copperford');
  assert.ok(news.some((e) => e.band === 'glut'));
});

// ── Physical goods, stability, the Outside ──────────────────────────────────

test('goods are conserved: every change in stock is accounted for, caravans and provisions included', () => {
  const sim = new Simulation({ seed: 3 });
  const ix = economyIndex(sim.data);
  const start = {};
  for (const sid of ix.markets) start[sid] = Object.fromEntries(ix.goodIds.map((g) => [g, sim.state.economy.markets[sid][g].stock]));
  const flow = {};
  for (let d = 1; d <= 30; d++) {
    sim.advanceTo(at(d) - START + 5); // just after midnight
    for (const [sid, t] of Object.entries(sim.state.economy.today)) {
      flow[sid] ??= {};
      for (const gid of ix.goodIds) {
        flow[sid][gid] = (flow[sid][gid] ?? 0) + (t.produced[gid] ?? 0) - (t.used[gid] ?? 0) - (t.consumed[gid] ?? 0) - (t.lost[gid] ?? 0) +
          (t.road.in[gid] ?? 0) - (t.road.out[gid] ?? 0);
      }
    }
  }
  for (const sid of ix.markets) {
    if (ix.isOutside(sid)) continue;
    for (const gid of ix.goodIds) {
      const change = sim.state.economy.markets[sid][gid].stock - start[sid][gid];
      assert.ok(Math.abs(change - flow[sid][gid]) < 0.05, `${sid} ${gid}: stock moved ${change.toFixed(3)}, flows say ${flow[sid][gid].toFixed(3)}`);
    }
  }
});

test('five years on: no negative stocks, nothing overflows, prices stay on the curve', () => {
  const sim = run(200, null, 11);
  const ix = economyIndex(sim.data);
  for (const sid of ix.markets) {
    for (const gid of ix.goodIds) {
      const m = sim.state.economy.markets[sid][gid];
      const g = ix.goods.get(gid);
      const c = curves[g.curve];
      assert.ok(m.stock >= 0 && m.stock <= WORLD.economy.storage[sid] + 1e-9, `${sid} ${gid} stock ${m.stock}`);
      const q = quote(sim, sid, gid);
      assert.ok(q.price >= g.base * q.local * c.floor - 1e-9 && q.price <= g.base * q.local * c.cap + 1e-9);
      for (const p of sim.state.economy.history.price[sid][gid]) assert.ok(Number.isFinite(p) && p > 0);
    }
    assert.ok(sim.state.economy.hunger[sid] >= 0 && sim.state.economy.hunger[sid] <= 1);
  }
  assert.equal(sim.state.economy.history.days.length, WORLD.economy.historyDays);
});

test('ships keep Saltmouth near world prices, and it recovers fast from a shock', () => {
  const { before, trail } = priceTrail('saltmouth', 'salt', 5, 15, (sim) =>
    sim.command('lab:spoil', { at: 'saltmouth', good: 'salt', fraction: 0.7 }));
  const world = 18 * WORLD.economy.outside.saltmouth.goods.salt.factor;
  assert.ok(Math.abs(before - world) < world * 0.05, `salt at the port ${before} vs world ${world}`);
  assert.ok(trail[0] > before * 2);
  assert.ok(Math.abs(trail.at(-1) - world) < world * 0.15);
});

test('travellers take provisions from the market they leave, and eat where they stay', () => {
  const sim = run(3);
  const departures = sim.state.wayfarers.order.map((id) => sim.state.wayfarers.byId[id]).filter((w) => w.trip);
  assert.ok(departures.length > 0);
  for (const w of departures) assert.ok(w.trip.provisions > 0, `${w.name} left without food`);

  const alone = new Simulation({ data: { ...WORLD, wayfarers: { ...WORLD.wayfarers, count: 0 } }, seed: 1 });
  const crowded = new Simulation({ data: { ...WORLD, wayfarers: { ...WORLD.wayfarers, count: 60 } }, seed: 1 });
  assert.ok(crowded.state.economy.markets.kingscross.grain.need > alone.state.economy.markets.kingscross.grain.need);
});

// ── Residents, news, opportunities ──────────────────────────────────────────

test('every settlement has its full population of named residents', () => {
  const sim = new Simulation({ seed: 2 });
  const names = new Set();
  for (const n of WORLD.nodes.filter((x) => x.kind !== 'waypoint')) {
    const people = residentsAt(sim, n.id);
    assert.equal(people.length, n.residents);
    for (const r of people) names.add(r.name);
  }
  assert.equal(names.size, sim.state.residents.order.length, 'no two residents share a name');
});

test('market news is news: no repeats of the same story within ten days', () => {
  const sim = run(200, null, 5);
  const last = new Map();
  for (const e of sim.state.log.filter((x) => x.type === 'market:news')) {
    const key = `${e.at}|${e.good}|${e.band}`;
    if (last.has(key)) assert.ok(e.t - last.get(key) >= 10 * DAY, `repeated: ${describe(e, sim)}`);
    last.set(key, e.t);
    assert.ok(!describe(e, sim).includes('undefined'));
  }
});

test('the opportunity board finds the trades a merchant would want', () => {
  // In a world without merchants, so the gaps they'd close are still open.
  const sim = new Simulation({ seed: 1, data: { ...WORLD, merchants: { ...WORLD.merchants, count: 0 } } });
  sim.advanceTo(at(60));
  const opps = tradeOpportunities(sim, { limit: 50 });
  assert.ok(opps.length > 5);
  for (let i = 1; i < opps.length; i++) assert.ok(opps[i - 1].perDay >= opps[i].perDay);
  for (const o of opps) {
    assert.ok(Math.abs(o.profit - (o.revenue - o.cost - o.provisions)) < 1e-9);
    assert.ok(o.sell > o.buy && o.days > 0 && o.qty >= 1);
  }
  const has = (good, from, to) => opps.some((o) => o.good === good && o.from === from && (!to || o.to === to));
  assert.ok(has('grain', 'greenhollow'), 'Greenhollow grain to the hungry towns');
  assert.ok(has('salt', 'saltmouth'), 'salt from the Outside');
  assert.ok(opps.some((o) => o.from === 'kingscross' && o.to === 'saltmouth'), 'Kingscross goods to the Outside');
});

test('economy events all have chronicle text', () => {
  const sim = run(4);
  sim.command('lab:spoil', { at: 'kingscross', good: 'salt', fraction: 0.5 });
  sim.command('lab:deliver', { at: 'copperford', good: 'grain', qty: 30 });
  sim.command('lab:death', { at: 'greenhollow', profession: 'shepherd' });
  sim.advanceTo(at(120));
  for (const e of sim.state.log) {
    const text = describe(e, sim);
    assert.ok(text && text !== e.type && !text.includes('undefined') && !text.includes('NaN'), `${e.type}: ${text}`);
  }
});
