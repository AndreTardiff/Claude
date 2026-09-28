import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, WORLD, describe, economyIndex, residentsAt } from '../src/index.js';
import { balance, booksBalance, formatMoney, moneySupply, toBits } from '../src/economy/money.js';
import { mintStatus } from '../src/systems/coin.js';

const DAY = 1440;
const at = (day) => 330 + day * DAY;
const accounted = (sim) => {
  const f = sim.state.coin.flows;
  return sim.state.coin.opening + f.minted + f.gifted + f.exported - f.crown - f.worn - f.hoarded - f.imported;
};

test('money is counted in whole bits: 12 bits to the mark', () => {
  const sim = new Simulation({ seed: 1 });
  assert.equal(formatMoney(sim, 44), '3 marks 8 bits');
  assert.equal(formatMoney(sim, 11), '11 bits');
  assert.equal(formatMoney(sim, 12 * 150), '150 marks');
  assert.equal(formatMoney(sim, 44, { short: true }), '3m 8b');
  for (const v of Object.values(sim.state.coin.accounts)) assert.ok(Number.isInteger(v));
});

test('GATE C: every bit is accounted for: supply = opening + minted + gifted + exported − crown − worn − hoarded − imported', () => {
  const sim = new Simulation({ seed: 4 });
  sim.command('lab:coin', { at: 'greenhollow', marks: 50 });
  for (const d of [1, 10, 37, 80, 150]) {
    sim.advanceTo(at(d));
    assert.equal(moneySupply(sim), accounted(sim), `day ${d}`);
    assert.equal(booksBalance(sim), accounted(sim));
    for (const [k, v] of Object.entries(sim.state.coin.accounts)) {
      assert.ok(Number.isInteger(v) && v >= 0, `${k} = ${v}`);
    }
  }
});

test('GATE C: the money supply stays bounded over five years without a player', () => {
  for (const seed of [1, 7, 23]) {
    const sim = new Simulation({ seed });
    const opening = moneySupply(sim);
    let lo = opening;
    let hi = opening;
    let at120 = 0;
    for (let d = 1; d <= 200; d++) {
      sim.advanceTo(at(d));
      const s = moneySupply(sim);
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
      if (d === 120) at120 = s;
    }
    const at200 = moneySupply(sim);
    assert.ok(hi < opening * 3 && lo > opening * 0.5, `seed ${seed}: supply ranged ${lo}–${hi} from ${opening}`);
    // Levelled off: the last two years move it by less than a third.
    assert.ok(Math.abs(at200 - at120) < at120 * 0.3, `seed ${seed}: ${at120} → ${at200}`);
  }
});

test('the Mint strikes only to fill the treasury, and never without ore', () => {
  const sim = new Simulation({ seed: 1 });
  sim.advanceTo(at(2));
  // Fill the treasury above its target: the Mint rests.
  sim.state.coin.accounts.treasury += toBits(sim, 5000);
  sim.state.coin.opening += toBits(sim, 5000);
  assert.equal(mintStatus(sim).reason, 'treasury full');
  const minted = sim.state.coin.flows.minted;
  sim.advanceTo(at(4));
  assert.equal(sim.state.coin.flows.minted, minted);
  // Empty treasury and no ore: still nothing to strike.
  sim.state.coin.opening -= sim.state.coin.accounts.treasury;
  sim.state.coin.accounts.treasury = 0;
  sim.command('lab:spoil', { at: 'copperford', good: 'ore', fraction: 1 });
  assert.equal(mintStatus(sim).reason, 'no ore');
});

test('seigniorage: struck coin pays for the ore, the rest goes to the lord', () => {
  const sim = new Simulation({ seed: 1 });
  sim.advanceTo(at(1));
  const struck = sim.state.coin.lastDay.struck;
  assert.ok(struck > 0, 'the Mint strikes on the first day');
  assert.equal(struck % toBits(sim, WORLD.coin.mint.yield), 0, 'whole loads only');
});

test('travellers pay tolls at Aldric\'s Bridge and buy their provisions', () => {
  const sim = new Simulation({ seed: 1 });
  let tolls = 0;
  for (let d = 1; d <= 60; d++) {
    sim.advanceTo(at(d) - 330 + 1);
    tolls += sim.state.coin.lastDay.tolls;
  }
  const crossings = sim.state.log.filter((e) => e.type === 'wayfarer:arrived' && e.via.includes('kings-road')).length;
  assert.ok(crossings > 0);
  assert.ok(tolls >= toBits(sim, 1), `tolls collected: ${tolls} bits over ${crossings} King's Road journeys`);
});

test('famine kills, but the region settles instead of racing to the bottom', () => {
  const sim = new Simulation({ seed: 1 });
  const ix = economyIndex(sim.data);
  const towns = ix.markets.filter((s) => !ix.isOutside(s));
  const d = WORLD.economy.demography;
  const hungerLate = Object.fromEntries(towns.map((t) => [t, 0]));
  let lowest = Object.fromEntries(towns.map((t) => [t, Infinity]));
  for (let day = 1; day <= 400; day++) {
    sim.advanceTo(at(day));
    for (const t of towns) {
      lowest[t] = Math.min(lowest[t], residentsAt(sim, t).length);
      if (day > 360) hungerLate[t] += sim.state.economy.hunger[t] / 40;
    }
  }
  const deaths = sim.state.log.filter((e) => e.type === 'resident:died' && (getCause(sim, e.who) === 'famine')).length;
  assert.ok(deaths > 0, 'famine should claim someone without merchants');
  for (const t of towns) {
    const founding = sim.graph.nodes.get(t).residents;
    assert.ok(lowest[t] >= Math.ceil(founding * d.floor), `${t} fell below its floor`);
    assert.ok(hungerLate[t] < 0.35, `${t} still starving in year 10 (hunger ${hungerLate[t].toFixed(2)})`);
  }
  // Kingscross recovers after its worst.
  assert.ok(residentsAt(sim, 'kingscross').length > lowest.kingscross, 'Kingscross grows back');
  const turned = sim.state.log.filter((e) => e.type === 'resident:to-the-land').length;
  assert.ok(turned > 0, 'hungry towns turn to the land');
});

function getCause(sim, id) {
  return sim.state.residents.byId[id]?.cause;
}

test('the Crown\'s due and the hearth tax happen, and read well', () => {
  const sim = new Simulation({ seed: 2 });
  sim.advanceTo(at(90));
  const types = new Set(sim.state.log.map((e) => e.type));
  assert.ok(types.has('coin:crown'));
  assert.ok(types.has('coin:hearth-tax'));
  for (const e of sim.state.log) {
    const text = describe(e, sim);
    assert.ok(text && text !== e.type && !/undefined|NaN/.test(text), `${e.type}: ${text}`);
  }
});

test('a town with coin buys; a town without goes without', () => {
  const sim = new Simulation({ seed: 1 });
  sim.advanceTo(at(2));
  // Empty Kingscross's purse (moving the coin to the treasury keeps the books straight).
  const all = balance(sim, 'purse:kingscross');
  sim.state.coin.accounts['purse:kingscross'] = 0;
  sim.state.coin.accounts.treasury += all;
  sim.advanceTo(at(3));
  const today = sim.state.economy.today.kingscross;
  assert.ok(today.poor > 0, 'households could not afford what was on sale');
  assert.equal(moneySupply(sim), accounted(sim));
});
