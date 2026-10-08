// Step G: the player, a person in one place, under the same rules as everyone else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/simulation.js';
import { WORLD } from '../src/data/world.js';
import { balance, booksBalance, moneySupply, toBits } from '../src/economy/money.js';
import { caravans, netWorth } from '../src/systems/player.js';
import { describe } from '../src/narrative/describe.js';

const DAY = 1440;
const at = (day) => 330 + day * DAY;
const P = (sim) => sim.state.player;
const knows = (sim, sid) => sim.state.knowledge.holders.player?.[sid];

test('you begin with the family stall, the family debt, and letters on the road', () => {
  const sim = new Simulation({ seed: 1 });
  const st = P(sim);
  assert.equal(st.at, WORLD.player.home);
  assert.ok(st.name.endsWith(WORLD.player.family));
  assert.equal(st.debt.principal, toBits(sim, WORLD.player.debt.principal));
  assert.equal(st.wagons, WORLD.player.wagons);
  for (const [gid, qty] of Object.entries(WORLD.player.stall)) assert.equal(st.stores.kingscross[gid].qty, qty);
  assert.equal(sim.state.log[0]?.type === 'player:inherits' || sim.state.log.some((e) => e.type === 'player:inherits'), true, 'the ledger opens with the parent\'s death');
  // The contacts' letters arrive in the first days, a few days old.
  sim.advanceTo(at(5));
  const rec = knows(sim, 'greenhollow');
  assert.ok(rec, 'word of Greenhollow');
  assert.ok((sim.now - rec.t) / DAY >= 1, 'and it is old news');
});

test('you trade in the market where you stand, and pay the same prices as anyone', () => {
  const sim = new Simulation({ seed: 2 });
  sim.advanceTo(at(1));
  const st = P(sim);
  const coin = balance(sim, 'player');
  const stock = sim.state.economy.markets.kingscross.grain.stock;
  sim.command('player:buy', { good: 'grain', qty: 5 });
  assert.equal(st.stores.kingscross.grain.qty, 5);
  assert.ok(balance(sim, 'player') < coin);
  assert.ok(Math.abs(sim.state.economy.markets.kingscross.grain.stock - (stock - 5)) < 1e-6, 'real grain left the market');
  sim.command('player:sell', { good: 'grain', qty: 5 });
  assert.ok(!st.stores.kingscross.grain);
  assert.ok(balance(sim, 'player') < coin, 'buying and selling back costs you the spread and the fee');
  // Can't sell what you haven't got, or buy with coin you don't have.
  sim.command('player:sell', { good: 'wool', qty: 3 });
  sim.command('player:buy', { good: 'luxuries', qty: 500 });
  assert.equal(sim.state.log.filter((e) => e.type === 'player:refused').length >= 1, true);
  assert.equal(booksBalance(sim), moneySupply(sim));
});

test('a caravan of yours travels, sells and comes home by the merchants\' own rules', () => {
  const sim = new Simulation({ seed: 3 });
  sim.advanceTo(at(1));
  const st = P(sim);
  const before = balance(sim, 'player');
  sim.command('player:dispatch', { to: 'copperford', good: 'cloth', qty: 8, road: 'safe', sell: 'all', then: 'home' });
  const m = caravans(sim)[0];
  assert.ok(m?.trip, 'on the road');
  assert.equal(st.stores.kingscross.cloth, undefined, 'the cloth went into the wagon');
  assert.equal(st.at, 'kingscross', 'you stayed home');
  sim.advanceTo(at(20));
  assert.equal(caravans(sim).length, 0, 'the wagon is back in the yard');
  const sold = sim.state.log.find((e) => e.type === 'player:caravan-sold' && e.who === m.id && e.at === 'copperford');
  assert.ok(sold, 'the cloth was sold in Copperford');
  assert.ok(balance(sim, 'player') > before - 10, 'and the takings came home to your purse');
  // The crew's news came back with them.
  assert.ok(knows(sim, 'copperford').t > at(2));
  assert.equal(booksBalance(sim), moneySupply(sim));
});

test('ride with your caravan: you see the far town for yourself', () => {
  const sim = new Simulation({ seed: 4 });
  sim.advanceTo(at(1));
  sim.command('player:dispatch', { to: 'greenhollow', good: 'tools', qty: 4, sell: 'all', then: 'wait', ride: true });
  const st = P(sim);
  assert.equal(st.at, null, 'on the road');
  assert.ok(st.with);
  for (let d = 2; d < 15 && st.at !== 'greenhollow'; d++) sim.advanceTo(at(d));
  assert.equal(st.at, 'greenhollow');
  const rec = knows(sim, 'greenhollow');
  assert.ok(sim.now - rec.t < DAY && rec.source === 'seen', 'seen with your own eyes, today');
  // Give the waiting caravan new orders in person: home, empty.
  const m = caravans(sim)[0];
  sim.command('player:orders', { caravan: m.id, to: 'kingscross', ride: true });
  assert.equal(st.at, null);
  sim.advanceTo(at(30));
  assert.equal(st.at, 'kingscross');
});

test('a courier carries your orders to a caravan far away, and brings back that town\'s board', () => {
  const sim = new Simulation({ seed: 5 });
  sim.advanceTo(at(1));
  const st = P(sim);
  sim.command('player:dispatch', { to: 'greenhollow', good: 'cloth', qty: 8, sell: 'none', then: 'wait' });
  const m = caravans(sim)[0];
  sim.advanceTo(at(6));
  assert.equal(m.at, 'greenhollow', 'waiting in Greenhollow, still loaded');
  assert.ok(m.cargo.cloth > 0);
  sim.command('player:courier', { to: 'greenhollow', caravan: m.id, orders: { sell: 'all', then: 'home' } });
  const sent = sim.now;
  for (let d = 7; d < 30 && caravans(sim).length; d++) sim.advanceTo(at(d));
  const delivered = sim.state.log.find((e) => e.type === 'player:orders-delivered');
  const home = sim.state.log.find((e) => e.type === 'player:courier-home');
  if (delivered) {
    assert.ok(sim.state.log.some((e) => e.type === 'player:caravan-sold' && e.who === m.id && e.at === 'greenhollow'), 'sold on your orders');
    assert.equal(caravans(sim).length, 0, 'and came home');
  } else {
    assert.ok(home?.robbed, 'the only way the orders fail: the courier was robbed');
  }
  if (home && !home.robbed) {
    const rec = knows(sim, 'greenhollow');
    assert.ok(rec.t > sent, 'fresh word of Greenhollow, by letter');
  }
  assert.ok(balance(sim, 'player') < toBits(sim, 1000));
  assert.equal(booksBalance(sim), moneySupply(sim));
  assert.equal(st.at, 'kingscross');
});

test('the money-changer: pay each season, or he takes the stall', () => {
  const sim = new Simulation({ seed: 6 });
  // Do nothing at all: the purse runs dry, payments are missed, and the changer seizes what he can.
  for (let d = 1; d <= 90 && !sim.state.log.some((e) => e.type === 'player:seized'); d++) sim.advanceTo(at(d));
  const log = sim.state.log.map((e) => e.type);
  assert.ok(log.includes('player:paid'), 'the first dues are paid');
  assert.ok(log.includes('player:missed'), 'then one is missed');
  assert.ok(log.includes('player:seized'), 'and the stall is seized');
  const st = P(sim);
  assert.ok(!Object.keys(st.stores.kingscross).length, 'the stall is empty');
  assert.ok(st.debt.collector, 'a debt collector with a name');
  assert.equal(booksBalance(sim), moneySupply(sim));
  // Borrowing: only in Kingscross, only against what you're worth.
  const fresh = new Simulation({ seed: 6 });
  fresh.advanceTo(at(1));
  const owed = P(fresh).debt.principal;
  // An heir already owing more than they're worth gets nothing more.
  fresh.command('player:borrow', { marks: 50 });
  assert.equal(P(fresh).debt.principal, owed, 'he lends only against what you have');
  assert.ok(fresh.state.log.some((e) => e.type === 'player:refused' && e.command === 'borrow'));
  fresh.command('player:repay', { marks: 10 });
  assert.equal(P(fresh).debt.principal, owed - toBits(fresh, 10));
  assert.ok(netWorth(fresh, { gross: true }) > 0);
});

test('ruined: bonded to the richest house for a season, paid a wage, then free with half the debt', () => {
  const sim = new Simulation({ seed: 3 });
  sim.advanceTo(at(1));
  const st = P(sim);
  // A note far beyond anything the family owns (set by hand: the changer would never lend it).
  st.debt.principal = toBits(sim, 5000);
  for (let d = 2; d <= 60 && !st.bonded; d++) sim.advanceTo(at(d));
  assert.ok(st.bonded, 'two missed dues, the seizure, and then the bond');
  const house = sim.state.merchants.byId[st.bonded.house];
  assert.ok(house?.active, 'to a trading house');
  assert.match(describe(sim.state.log.find((e) => e.type === 'player:bonded'), sim), new RegExp(`house of ${house.house}`));
  assert.equal(st.wagons, 1, 'the family wagon is not the changer\'s to take');
  const owed = st.debt.principal;
  // While bonded you can't trade for yourself.
  const seen = sim.state.log.length;
  sim.command('player:buy', { good: 'grain', qty: 1 });
  assert.ok(sim.state.log.slice(seen).some((e) => e.type === 'player:refused' && e.why === 'bonded'));
  assert.ok(!sim.state.log.slice(seen).some((e) => e.type === 'player:bought'));
  sim.advanceTo(st.bonded.until + DAY);
  assert.equal(st.bonded, null, 'the bond is served');
  const freed = sim.state.log.find((e) => e.type === 'player:released');
  assert.ok(freed.kept > 0, 'with something kept of the wages to start again');
  assert.ok(freed.owed <= owed / 2, 'and half the debt (less what the wages paid) written off');
  assert.match(describe(freed, sim), /wages kept/);
  assert.equal(booksBalance(sim), moneySupply(sim));
});

test('a caravan that comes home keeps what its load cost, and a refused command does nothing', () => {
  const sim = new Simulation({ seed: 5 });
  sim.advanceTo(at(1));
  const st = P(sim);
  // Buy in Kingscross, ride to Copperford and straight back with the load unsold.
  sim.command('player:buy', { good: 'salt', qty: 4 });
  const cost = st.stores.kingscross.salt.cost;
  sim.command('player:dispatch', { to: 'copperford', good: 'salt', qty: 4, sell: 'none', then: 'home', ride: true });
  // On the road, nothing can be done from the saddle.
  const seen = sim.state.log.length;
  sim.command('player:buy', { good: 'grain', qty: 1 });
  assert.ok(sim.state.log.slice(seen).some((e) => e.type === 'player:refused' && e.why === 'on the road'));
  assert.ok(!sim.state.log.slice(seen).some((e) => e.type === 'player:bought'));
  for (let d = 2; d <= 20 && !sim.state.log.some((e) => e.type === 'player:caravan-home'); d++) sim.advanceTo(at(d));
  const back = st.stores.kingscross.salt;
  assert.ok(back, 'the salt is back in the stall');
  assert.ok(Math.abs(back.cost - cost) <= 1, `at what it cost (${back.cost} against ${cost} bits)`);
});

test('ride through a merciless band and you may die: your heir takes up the ledger and the debt', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const sim = new Simulation({ seed });
    sim.advanceTo(at(1));
    sim.command('lab:band', { hideout: 'blackpine-hollows', members: 16, watch: 'blackpine-east' });
    for (const b of Object.values(sim.state.raiders.bands)) {
      b.cruelty = 1000;
      b.hunger = 0.6;
    }
    const was = P(sim).name;
    sim.command('player:dispatch', { to: 'copperford', good: 'tools', qty: 4, road: 'fast', guards: 0, orders: { threatened: 'fight', outnumbered: null, cargo: 'hold', night: 'sleep' }, ride: true });
    sim.advanceTo(at(12));
    const died = sim.state.log.find((e) => e.type === 'player:died');
    if (!died) continue;
    const st = P(sim);
    assert.equal(died.who, was);
    assert.notEqual(st.name, was, 'a new name at the head of the family');
    assert.equal(st.generation, 2);
    assert.ok(st.debt.principal > 0, 'the debt is inherited');
    assert.equal(st.at, st.home);
    assert.ok(describe(died, sim).includes(st.name));
    assert.equal(booksBalance(sim), moneySupply(sim));
    return;
  }
  assert.fail('the player never died riding through a merciless band');
});
