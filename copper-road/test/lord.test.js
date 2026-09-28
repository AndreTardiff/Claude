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
