import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, WORLD, activeMerchants, describe, getMerchant, planJourney, tradeCandidates } from '../src/index.js';
import { balance, booksBalance, moneySupply, transfer } from '../src/economy/money.js';

const DAY = 1440;
const at = (day) => 330 + day * DAY;
const withMerchants = (count, extra = {}) => ({ ...WORLD, merchants: { ...WORLD.merchants, count, ...extra } });
const stockOf = (sim, sid, gid) => sim.state.economy.markets[sid][gid].stock;

// Step tick by tick until `pred(newLogEntries, marketsBeforeTheTick)` returns something, or `limit` is reached.
function stepUntil(sim, limit, pred) {
  while (sim.now < limit) {
    const seen = sim.state.log.length;
    const before = JSON.parse(JSON.stringify(sim.state.economy.markets));
    sim.step();
    const hit = pred(sim.state.log.slice(seen), before);
    if (hit) return hit;
  }
  return null;
}

test('merchants open with named houses, wagons, purses and tempers', () => {
  const sim = new Simulation({ seed: 1 });
  const ms = activeMerchants(sim);
  assert.equal(ms.length, WORLD.merchants.count);
  const names = new Set();
  for (const m of ms) {
    names.add(m.name);
    assert.ok(m.wagons >= WORLD.merchants.wagons[0] && m.wagons <= WORLD.merchants.wagons[1]);
    assert.equal(m.capacity, m.wagons * WORLD.merchants.wagonCapacity);
    assert.ok(m.boldness >= 0 && m.boldness <= 1000);
    const purse = balance(sim, `merchant:${m.id}`);
    assert.ok(purse >= WORLD.merchants.purse[0] * 12 && purse <= WORLD.merchants.purse[1] * 12);
  }
  assert.equal(names.size, ms.length, 'no two merchants share a name');
});

test('AT-04: goods travel in the wagons: they leave the market at departure and arrive with the caravan', () => {
  const sim = new Simulation({ seed: 1 });
  // The first caravan carrying something other than grain (grain also moves as provisions).
  const dep = stepUntil(sim, at(80), (entries, before) => {
    const e = entries.find((x) => x.type === 'merchant:departed' && x.good !== 'grain');
    return e ? { e, before } : null;
  });
  assert.ok(dep, 'someone should set out within 80 days');
  const { e, before } = dep;
  const m = getMerchant(sim, e.who);
  const drop = before[e.from][e.good].stock - stockOf(sim, e.from, e.good);
  assert.ok(Math.abs(drop - e.qty) < 1e-6, `${e.from} lost ${drop} ${e.good}, the wagons took ${e.qty}`);
  assert.equal(m.cargo[e.good], e.qty);
  assert.ok(m.trip && m.at === null);

  // Until the caravan arrives, the goods stay in the wagons.
  const arrival = stepUntil(sim, e.t + 20 * DAY, (entries, prev) => {
    if (m.trip) assert.equal(m.cargo[e.good], e.qty, 'cargo never leaves the wagon on the road');
    const sold = entries.find((x) => (x.type === 'merchant:sold' || x.type === 'merchant:unsold') && x.who === m.id);
    return sold ? { sold, prev } : null;
  });
  assert.ok(arrival, 'the caravan should arrive');
  const { sold, prev } = arrival;
  assert.equal(sold.at, e.to);
  const soldQty = sold.type === 'merchant:sold' ? sold.qty : e.qty - sold.qty;
  const rise = stockOf(sim, e.to, e.good) - prev[e.to][e.good].stock;
  assert.ok(Math.abs(rise - soldQty) < 1e-6, `${e.to} gained ${rise} ${e.good}, the caravan sold ${soldQty}`);
});

test('AT-03: word of a shortage draws grain caravans to the town that needs it', () => {
  const sim = new Simulation({ seed: 2 });
  sim.advanceTo(at(20));
  sim.command('lab:spoil', { at: 'copperford', good: 'grain', fraction: 0.95 });
  const shock = sim.now;
  // Grain Copperford's market took in by road, from the town's own daily books.
  let arrived = 0;
  for (let d = 21; d <= 45; d++) {
    sim.advanceTo(at(d));
    arrived += sim.state.economy.today.copperford.road.in.grain ?? 0;
  }
  // A caravan set out for Copperford with grain on news of the shortage (news no older than the shock)…
  const answered = sim.state.log.filter((e) =>
    e.type === 'merchant:departed' && e.to === 'copperford' && e.good === 'grain' && e.t > shock && e.t - e.ageDays * DAY >= shock - 10);
  assert.ok(answered.length > 0, 'no merchant answered the shortage');
  // …and grain reached Copperford's market (as much as the town could pay for).
  assert.ok(arrived >= 5, `only ${arrived} sacks of grain reached Copperford by road`);
  const first = answered[0];
  assert.ok(first.t - shock >= DAY, `a caravan answered ${((first.t - shock) / 60).toFixed(1)} hours after the fire: faster than news can travel?`);
});

test('AT-06: competition compresses margins', () => {
  // The same world with one house or seven: more wagons chase the same gaps.
  const perTrade = (count) => {
    let profit = 0;
    let trades = 0;
    for (const seed of [1, 2, 3]) {
      const sim = new Simulation({ seed, data: withMerchants(count) });
      sim.advanceTo(at(150));
      for (const e of sim.state.log) {
        if (e.type !== 'merchant:sold') continue;
        profit += e.profit;
        trades += 1;
      }
    }
    return { mean: profit / trades, trades };
  };
  const few = perTrade(1);
  const many = perTrade(7);
  assert.ok(many.trades > few.trades * 2, `${many.trades} trades with seven houses, ${few.trades} with one`);
  assert.ok(many.mean < few.mean * 0.8, `profit per trade: ${(few.mean / 12).toFixed(0)} marks alone, ${(many.mean / 12).toFixed(0)} with rivals`);
});

test('AT-07: caution buys safety: timid merchants take the safer road and price in more risk', () => {
  const sim = new Simulation({ seed: 1 });
  // Kingscross to Copperford: the short Blackpine Track through the gorge, or the long King's Road.
  const bold = planJourney(sim, 'kingscross', 'copperford', { speedKmh: WORLD.merchants.speedKmh, caution: 0 });
  const timid = planJourney(sim, 'kingscross', 'copperford', { speedKmh: WORLD.merchants.speedKmh, caution: 1 });
  assert.ok(bold.hours < timid.hours, 'the bold take the quick road');
  assert.ok(timid.exposure < bold.exposure, 'the timid take the safe road');

  // The same trade, valued by the same merchant at either temper.
  sim.advanceTo(at(30));
  const m = activeMerchants(sim).find((x) => x.at);
  const saved = m.boldness;
  m.boldness = 1000;
  const reckless = tradeCandidates(sim, m);
  m.boldness = 0;
  const careful = tradeCandidates(sim, m);
  m.boldness = saved;
  assert.ok(reckless.length && careful.length);
  for (const r of reckless) {
    assert.equal(r.risk, 0, 'the reckless price in no risk');
    const c = careful.find((x) => x.good === r.good && x.to === r.to);
    if (c && c.plan.exposure > 0) assert.ok(c.risk > 0 && c.profit < r.profit + 1e-9, `${r.good} to ${r.to}`);
  }

  // A deadlier gorge: fewer caravans risk the Blackpine Track.
  const viaGorge = (danger) => {
    const data = { ...WORLD, segments: WORLD.segments.map((s) => (s.route === 'blackpine-track' ? { ...s, danger } : s)) };
    let n = 0;
    for (const seed of [1, 2]) {
      const s = new Simulation({ seed, data });
      s.advanceTo(at(150));
      n += s.state.log.filter((e) => e.type === 'merchant:departed' && e.via.includes('blackpine-track')).length;
    }
    return n;
  };
  const safe = viaGorge(0.02);
  const deadly = viaGorge(0.6);
  assert.ok(deadly < safe, `caravans through the gorge: ${safe} when safe, ${deadly} when deadly`);
});

test('AT-13: every decision keeps its reasons, and the parts add up', () => {
  const sim = new Simulation({ seed: 3 });
  sim.advanceTo(at(60));
  let checked = 0;
  for (const m of activeMerchants(sim)) {
    const r = m.reason;
    assert.ok(r, `${m.name} has no reason on record`);
    assert.ok(r.threshold === m.threshold && typeof r.at === 'string');
    for (const c of r.candidates) {
      // Believed takings, less what it costs to buy, carry and insure, is the profit.
      assert.ok(Math.abs(c.revenue - c.cost - c.costs - c.risk - c.profit) < 0.05, JSON.stringify(c));
      assert.ok(c.ageDays >= 0 && ['seen', 'board', 'post', 'rumour'].includes(c.source));
      checked++;
    }
    if (r.choice === null) assert.ok(r.note, 'staying put needs a reason too');
  }
  assert.ok(checked > 0);
  for (const e of sim.state.log.filter((x) => x.type.startsWith('merchant:'))) {
    const text = describe(e, sim);
    assert.ok(text && !/undefined|NaN|\[object/.test(text), `${e.type}: ${text}`);
  }
  const dep = sim.state.log.find((e) => e.type === 'merchant:departed');
  const text = describe(dep, sim);
  assert.ok(text.includes(sim.graph.nodes.get(dep.to).name) && text.toLowerCase().includes(dep.good === 'tools' ? 'tool' : WORLD.economy.goods.find((g) => g.id === dep.good).name.toLowerCase()));
});

test('merchants trade at a profit overall, and sometimes misjudge', () => {
  for (const seed of [1, 7]) {
    const sim = new Simulation({ seed });
    sim.advanceTo(at(200));
    const sales = sim.state.log.filter((e) => e.type === 'merchant:sold');
    const total = sales.reduce((a, e) => a + e.profit, 0);
    assert.ok(sales.length >= 20, `seed ${seed}: only ${sales.length} ventures`);
    assert.ok(total > 0, `seed ${seed}: merchants lost ${-total} bits overall`);
    assert.ok(sales.some((e) => e.profit < 0), `seed ${seed}: nobody ever misjudged a market`);
    assert.equal(moneySupply(sim), booksBalance(sim));
    for (const m of Object.values(sim.state.merchants.byId)) assert.ok(Number.isInteger(balance(sim, `merchant:${m.id}`)));
  }
});

test('a town that cannot pay leaves goods in the wagons, and the merchant does not wait forever', () => {
  const sim = new Simulation({ seed: 1 });
  // The first caravan bound for an inland town: empty that town's tills and purses behind its back.
  const dep = stepUntil(sim, at(80), (entries) => entries.find((x) => x.type === 'merchant:departed' && x.to !== 'saltmouth'));
  assert.ok(dep);
  const town = dep.to;
  for (const account of [`till:${town}`, `purse:${town}`]) transfer(sim, account, 'hoard', balance(sim, account));
  const unsold = stepUntil(sim, dep.t + 20 * DAY, (entries) => entries.find((x) => x.type === 'merchant:unsold' && x.who === dep.who));
  assert.ok(unsold, 'a broke town should not be able to buy the load');
  assert.equal(unsold.at, town);
  // Within a few days the load is either taken elsewhere or let go for what it fetches.
  const moved = stepUntil(sim, unsold.t + 10 * DAY, (entries) =>
    entries.find((x) => x.who === dep.who && (x.type === 'merchant:moving' || (x.type === 'merchant:sold' && x.dumped))));
  assert.ok(moved, 'the merchant should give up on the town');
  assert.equal(moneySupply(sim), booksBalance(sim));
});

test('houses rise and fall: a ruined house is replaced by one a town backs', () => {
  const sim = new Simulation({ seed: 4 });
  sim.advanceTo(at(10));
  // Bleed one idle merchant's purse away (into the ground, so the books still balance).
  const m = activeMerchants(sim).find((x) => x.at && !Object.keys(x.cargo).length);
  assert.ok(m, 'an idle merchant');
  transfer(sim, `merchant:${m.id}`, 'hoard', balance(sim, `merchant:${m.id}`));
  sim.advanceTo(at(150)); // time enough for a town to save up the capital
  assert.equal(getMerchant(sim, m.id).active, false);
  const ruined = sim.state.log.find((e) => e.type === 'merchant:ruined' && e.who === m.id);
  assert.ok(ruined, 'the house should be ruined');
  const founded = sim.state.log.filter((e) => e.type === 'merchant:founded' && e.t > ruined.t);
  assert.ok(founded.length > 0, 'a town should back a new house');
  const fresh = getMerchant(sim, founded[0].who);
  assert.ok(fresh.active && fresh.home === founded[0].at);
  assert.notEqual(fresh.house, m.house, 'the new house has a new name');
  const n = activeMerchants(sim).length;
  assert.ok(n >= WORLD.merchants.count && n <= WORLD.merchants.count + WORLD.merchants.peddlerHouses, `${n} houses`);
  assert.equal(moneySupply(sim), booksBalance(sim));
  for (const e of [ruined, founded[0]]) assert.ok(!/undefined|NaN/.test(describe(e, sim)));
});

test('rich houses spend at home, and the lord borrows from the richest', () => {
  const sim = new Simulation({ seed: 5 });
  sim.advanceTo(at(5));
  const m = activeMerchants(sim)[0];
  const homeBefore = balance(sim, `purse:${m.home}`);
  transfer(sim, 'lab', `merchant:${m.id}`, 3000 * 12);
  sim.advanceTo(at(6));
  assert.ok(m.spent > 0 && balance(sim, `purse:${m.home}`) > homeBefore, 'the household spends in its home town');
  sim.advanceTo(at(21)); // past a new season
  const loan = sim.state.log.find((e) => e.type === 'merchant:forced-loan' && e.who === m.id);
  assert.ok(loan && m.loaned > 0, 'Lord Aldric should "borrow" from a house this rich');
  assert.equal(moneySupply(sim), booksBalance(sim));
});

// ── D3: peddlers and tinkers ────────────────────────────────────────────────

test('peddlers carry a pack where word says it pays, and sell it on arrival', () => {
  let sales = 0;
  let profit = 0;
  for (const seed of [1, 23]) {
    const sim = new Simulation({ seed });
    sim.advanceTo(at(150));
    for (const e of sim.state.log.filter((x) => x.type === 'wayfarer:peddled')) {
      const w = sim.state.wayfarers.byId[e.who];
      const trade = WORLD.wayfarers.trades.find((t) => t.id === w.trade);
      assert.ok(trade.pack && trade.goods.includes(e.good), `${w.trade} sold ${e.good}`);
      assert.ok(e.qty > 0 && e.qty <= trade.pack);
      assert.ok(!/undefined|NaN/.test(describe(e, sim)));
      sales++;
      profit += e.profit;
    }
    // Nobody else ever carries a pack.
    for (const e of sim.state.log.filter((x) => x.type === 'wayfarer:departed' && x.good)) {
      assert.ok(WORLD.wayfarers.trades.find((t) => t.id === sim.state.wayfarers.byId[e.who].trade).pack);
    }
    assert.equal(moneySupply(sim), booksBalance(sim));
  }
  assert.ok(sales >= 10, `only ${sales} packs sold`);
  assert.ok(profit > 0, 'peddling should pay, on the whole');
});

test('a peddler who saves enough trades the pack for a wagon and founds a house', () => {
  const sim = new Simulation({ seed: 1 });
  sim.advanceTo(at(80));
  const e = sim.state.log.find((x) => x.type === 'merchant:founded' && x.peddler);
  assert.ok(e, 'someone should make good');
  const w = sim.state.wayfarers.byId[e.peddler];
  const m = getMerchant(sim, e.who);
  assert.ok(w.retired && w.becameMerchant === m.id && m.wasWayfarer === w.id);
  assert.ok(!sim.state.wayfarers.order.includes(w.id), 'off the road for good');
  assert.ok(m.name.startsWith(w.name) && m.home === e.at);
  assert.equal(balance(sim, `wayfarer:${w.id}`), 0);
  assert.ok(e.bits >= WORLD.merchants.foundCapital * 12);
  assert.ok(describe(e, sim).includes('pack for a wagon'));
});
