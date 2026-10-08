#!/usr/bin/env node
// Measure the world against the player (step G+, spec §20.1): many worlds, a year each.
//
//   node copper-road/tools/measure.js [--seeds 1-10] [--days 360] [--bot smart|none] [--set '<json>']
//
// --set deep-merges into WORLD, e.g. --set '{"merchants":{"reversion":0.04}}'.
// Reports how well the houses guess (hoped against made, per sale), how crowded the roads
// are, famine deaths, each character's founding houses (median profit, trades, ruins) and,
// with the bot, AT-16's rows: the bot's trading profit and worth against the median house,
// its wagons, what the lord "borrowed" from it and the interest it paid.

import { Simulation, WORLD } from '../src/index.js';
import { booksBalance, moneySupply } from '../src/economy/money.js';
import { botDay, playerTradeProfit } from '../src/bots/trader.js';
import { netWorth } from '../src/systems/player.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const range = (s) => s.split(',').flatMap((part) => {
  const [a, b] = part.split('-').map(Number);
  return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
});
const merge = (a, b) => {
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') merge(a[k], v);
    else a[k] = v;
  }
  return a;
};

const seeds = range(opt('seeds', '1-10'));
const days = Number(opt('days', '360'));
const bot = opt('bot', 'smart') !== 'none';
const data = merge(structuredClone(WORLD), JSON.parse(opt('set', '{}')));
const MARK = data.coin.bitsPerMark;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

let hoped = 0;
let made = 0;
let sales = 0;
let departures = 0;
let crowded = 0;
let famine = 0;
const kinds = {};
const rows = [];
for (const seed of seeds) {
  const sim = new Simulation({ seed, data });
  const start = netWorth(sim);
  const founders = new Set(Object.keys(sim.state.merchants.byId));
  for (let d = 0; d < days; d++) {
    sim.runDays(1);
    if (bot) botDay(sim, { kind: 'smart' });
  }
  if (booksBalance(sim) !== moneySupply(sim)) console.log(`seed ${seed}: THE BOOKS DO NOT BALANCE`);
  const log = sim.state.log;
  const left = log.filter((e) => e.type === 'merchant:departed');
  departures += left.length;
  for (const d of left) if (left.some((o) => o !== d && o.good === d.good && o.to === d.to && Math.abs(o.t - d.t) < 4 * 1440)) crowded += 1;
  for (const e of log) {
    if (e.type === 'merchant:sold' && !e.lost) {
      hoped += e.expected;
      made += e.profit;
      sales += 1;
    }
    if (e.type === 'resident:died' && sim.state.residents.byId[e.who]?.cause === 'famine') famine += 1;
  }
  const houses = Object.values(sim.state.merchants.byId).filter((m) => !m.player && founders.has(m.id));
  for (const m of houses) {
    const k = (kinds[m.character?.kind ?? 'none'] ??= { profit: [], trades: [], ruined: 0 });
    k.profit.push((m.profit - m.overheads) / MARK);
    k.trades.push(m.trades);
    if (!m.active) k.ruined += 1;
  }
  if (bot) {
    const st = sim.state.player;
    rows.push({
      seed,
      trade: Math.round(playerTradeProfit(sim) / MARK),
      worth: Math.round((netWorth(sim) - start) / MARK),
      median: Math.round(median(houses.map((m) => (m.profit - m.overheads) / MARK))),
      wagons: st.wagons,
      loans: Math.round(log.filter((e) => e.type === 'player:forced-loan').reduce((a, e) => a + e.bits, 0) / MARK),
      interest: Math.round(st.debt.interest / MARK),
      owed: Math.round(st.debt.principal / MARK),
    });
  }
}

const n = Math.max(1, sales);
console.log(`${seeds.length} worlds × ${days} days${args.includes('--set') ? `, with ${opt('set', '')}` : ''}`);
console.log(`Houses hoped for ${(hoped / n / MARK).toFixed(0)} marks a sale and made ${(made / n / MARK).toFixed(0)} (${sales} sales); ${departures} departures, ${((100 * crowded) / Math.max(1, departures)).toFixed(0)}% crowded (same good, same town, within 4 days); ${famine} famine deaths.`);
console.log('Founding houses by character:');
for (const [k, v] of Object.entries(kinds).sort()) {
  console.log(`  ${k.padEnd(10)} ${String(v.profit.length).padStart(3)} houses, median profit ${median(v.profit).toFixed(0).padStart(6)}, ${(v.trades.reduce((a, b) => a + b, 0) / v.trades.length).toFixed(1).padStart(5)} ventures a house, ${v.ruined} ruined`);
}
if (bot) {
  console.log('The smart bot (marks): trading profit / worth gained / median house; wagons, the lord\'s "loans", interest paid, still owed');
  for (const r of rows) console.log(`  seed ${String(r.seed).padStart(3)}: ${String(r.trade).padStart(6)} / ${String(r.worth).padStart(6)} / ${String(r.median).padStart(6)}; ${r.wagons} wagons, ${r.loans} lent, ${r.interest} interest, ${r.owed} owed`);
  const ahead = rows.filter((r) => r.trade > r.median * 1.2).length;
  const ratio = median(rows.map((r) => r.trade / Math.max(1, r.median)));
  console.log(`AT-16: 20% ahead of the median house in ${ahead} of ${rows.length} worlds (the test asks 7 of 10); median world ${ratio.toFixed(2)}× the median house.`);
}
