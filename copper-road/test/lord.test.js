import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, WORLD, describe } from '../src/index.js';
import { balance, booksBalance, moneySupply, transfer } from '../src/economy/money.js';
import { knownOrder, lordOptions } from '../src/systems/lord.js';
import { improvementsOf } from '../src/world/improvements.js';

const DAY = 1440;
const at = (day) => 330 + day * DAY;
const runTo = (seed, day) => {
  const sim = new Simulation({ seed });
  sim.advanceTo(at(day));
  return sim;
};

test('Lord Aldric has a temperament, moods, and reasons for what he does', () => {
  const sim = runTo(1, 30);
  const st = sim.state.lord;
  for (const [k, [lo, hi]] of Object.entries(WORLD.lord.traits)) assert.ok(st.traits[k] >= lo && st.traits[k] <= hi, k);
  for (const v of Object.values(st.mood)) assert.ok(v >= 0 && v <= 1);
  assert.ok(st.reason && typeof st.reason.budget === 'number');
  assert.ok(st.reason.choice !== null || st.reason.note, 'every decision says what it chose or why not');
  for (const o of st.reason.options) assert.ok(o.why && o.score >= 0 && o.cost >= 0);
});

test('famine relief: a hungry town gets a grain order, merchants fill it, the treasury pays', () => {
  let filled = 0;
  let orders = 0;
  for (const seed of [1, 7, 23]) {
    const sim = runTo(seed, 200);
    orders += sim.state.log.filter((e) => e.type === 'lord:order').length;
    for (const e of sim.state.log.filter((x) => x.type === 'merchant:order')) {
      filled += e.qty;
      assert.ok(e.bits > 0 && sim.state.economy.hunger[e.at] !== undefined);
    }
    assert.equal(moneySupply(sim), booksBalance(sim));
  }
  assert.ok(orders >= 3, `${orders} relief orders`);
  assert.ok(filled >= 20, `${filled} sacks delivered on the lord's orders`);
});

test('orders are heard, not known: only in towns where they have been cried', () => {
  const sim = runTo(1, 5);
  const st = sim.state.lord;
  st.orders.push({ id: 'o-test', kind: 'relief', at: 'copperford', good: 'grain', qty: 10, remaining: 10, price: 16, posted: sim.now, expires: sim.now + 10 * DAY, cried: ['copperford', 'kingscross'], delivered: 0, paid: 0 });
  assert.ok(knownOrder(sim, 'kingscross', 'copperford', 'grain'));
  assert.equal(knownOrder(sim, 'greenhollow', 'copperford', 'grain'), null);
  sim.advanceTo(at(12)); // the post rides on and cries it further
  assert.ok(st.orders.length === 0 || st.orders[0].cried.length >= 2);
});

test('works leave something lasting in the town', () => {
  let done = 0;
  for (const seed of [1, 7, 23]) {
    const sim = runTo(seed, 200);
    for (const e of sim.state.log.filter((x) => x.type === 'lord:works-done')) {
      done++;
      const w = WORLD.lord.works.find((x) => x.id === e.work);
      const imp = improvementsOf(sim, e.at);
      if (w.effect.storage) assert.ok(imp.storage >= w.effect.storage);
      if (w.effect.homes) assert.ok(imp.homes >= w.effect.homes);
      if (w.effect.farmers) assert.ok(imp.farmers >= w.effect.farmers);
    }
  }
  assert.ok(done >= 2, `${done} works finished`);
});

test('a rich treasury gets spent, a poor one does not; the steward skims a fat one', () => {
  const sim = runTo(4, 10);
  transfer(sim, 'lab', 'treasury', 3000 * 12);
  const before = balance(sim, 'treasury');
  sim.advanceTo(at(30));
  const spent = Object.values(sim.state.lord.spent).reduce((a, b) => a + b, 0);
  assert.ok(spent > 200 * 12, `spent only ${spent / 12} marks of a windfall`);
  assert.ok(sim.state.lord.skimmed > 0, 'the steward should be tempted');
  assert.ok(balance(sim, 'treasury') < before);
  assert.equal(moneySupply(sim), booksBalance(sim));

  const poor = runTo(4, 10);
  transfer(poor, 'treasury', 'crown', balance(poor, 'treasury'));
  assert.equal(lordOptions(poor).filter((o) => o.kind !== 'works').length, 0, 'nothing to spend, nothing offered');
});

test("the lord's doings all read well in the chronicle", () => {
  for (const seed of [1, 7]) {
    const sim = runTo(seed, 200);
    for (const e of sim.state.log.filter((x) => x.type.startsWith('lord:') || x.type === 'merchant:order' || x.type === 'coin:crown')) {
      const text = describe(e, sim);
      assert.ok(text && text !== e.type && !/undefined|NaN|null/.test(text), `${e.type}: ${text}`);
    }
  }
});

// ── Step F: the lord judges by what he's heard, and rides out ──────────────

test('the lord judges by what he has heard: a famine reaches him late, by letter', async () => {
  const { believedHunger } = await import('../src/systems/progress.js');
  const sim = runTo(1, 5);
  sim.command('lab:spoil', { at: 'copperford', good: 'grain', fraction: 1 });
  let truth = null;
  let heard = null;
  for (let h = 1; h < 40 * 24 && heard === null; h++) {
    sim.advanceTo(at(5) + h * 60);
    if (truth === null && sim.state.economy.hunger.copperford >= 0.2) truth = h;
    if (heard === null && believedHunger(sim, 'copperford').hunger >= 0.2) heard = h;
  }
  assert.ok(truth !== null && heard !== null, 'the famine came, and word of it reached him');
  assert.ok(heard > truth, `he heard (${heard} h) after it began (${truth} h)`);
  assert.ok(heard - truth <= 10 * 24, 'but the post brings it within days');
});

test('the lord rides out now and then, sees for himself, comes home, and pays his escort', () => {
  let trips = 0;
  let seen = 0;
  for (const seed of [1, 7, 23]) {
    const sim = runTo(seed, 300);
    const log = sim.state.log;
    const out = log.filter((e) => e.type === 'lord:sets-out');
    trips += out.length;
    seen += log.filter((e) => e.type === 'lord:visit' && !e.port).length;
    // Every trip ends at home (or with him held), except one still under way.
    const ends = log.filter((e) => e.type === 'lord:home' || (e.type === 'raid:encounter' && e.kind === 'lord' && e.captured)).length;
    assert.ok(ends >= out.length - 1);
    assert.equal(booksBalance(sim), moneySupply(sim));
    const st = sim.state.lord;
    if (!st.away && !st.captive) assert.equal(st.at, st.seat);
    // Escorts are free again once he's home.
    for (const g of Object.values(sim.state.mercs.byId)) if (g.trip?.kind === 'lord') assert.ok(st.trip?.guards.includes(g.id));
  }
  assert.ok(trips >= 12, `only ${trips} trips in three worlds × 300 days`);
  assert.ok(seen >= 6, 'he sees towns with his own eyes');
});

test('a band that takes the lord holds him for a great ransom; freed, he puts a price on their heads', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const sim = runTo(seed, 30);
    if (sim.state.lord.away) continue;
    sim.command('lab:band', { hideout: 'fen-islands', members: 16, watch: 'estuary-west' });
    const band = sim.state.raiders.order.map((id) => sim.state.raiders.bands[id]).find((b) => b.active && b.hideout === 'fen-islands');
    band.cruelty = 1000;
    band.hunger = 0.5; // desperate: they'll take any chance
    sim.command('lab:lord-trip', { to: 'saltmouth', trip: 'ships' });
    let taken = null;
    for (let d = 31; d < 60 && !taken; d++) {
      sim.advanceTo(at(d));
      taken = sim.state.log.find((e) => e.type === 'raid:encounter' && e.kind === 'lord' && e.captured);
    }
    if (!taken) continue;
    assert.ok(sim.state.lord.captive || sim.state.log.some((e) => e.type === 'lord:freed'), 'he is held, or already ransomed');
    for (let d = 60; d < 90 && !sim.state.log.some((e) => e.type === 'lord:freed'); d++) sim.advanceTo(at(d));
    const freed = sim.state.log.find((e) => e.type === 'lord:freed');
    assert.ok(freed, 'he comes home in the end');
    if (freed.how !== 'escaped') {
      assert.ok(freed.bits >= WORLD.lord.travel.ransom.min * WORLD.coin.bitsPerMark * 0.3, 'a great ransom');
      assert.ok(sim.state.lord.bounty?.band === band.id || !band.active, 'a bounty on the band that took him');
    }
    assert.equal(sim.state.lord.at, sim.state.lord.seat);
    assert.ok(sim.state.lord.mood.anger > 0.3 || sim.now - freed.t > 20 * DAY, 'and he is angry');
    assert.equal(booksBalance(sim), moneySupply(sim));
    return;
  }
  assert.fail('the lord was never taken');
});
