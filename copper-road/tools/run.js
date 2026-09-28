#!/usr/bin/env node
// Headless run: node copper-road/tools/run.js [--seed 1] [--days 100] [--wayfarers 12] [--chronicle 12] [--json]

import { Simulation, WORLD, balance, describe, economyIndex, formatMoney, moneySupply, quote, residentsAt, routesLabel, tradeOpportunities } from '../src/index.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const seedArg = opt('seed', '1');
const seed = /^-?\d+$/.test(seedArg) ? Number(seedArg) : seedArg;
const days = Number(opt('days', '100'));
const chronicle = Number(opt('chronicle', '12'));
const count = opt('wayfarers', null);
const data = count === null ? WORLD : { ...WORLD, wayfarers: { ...WORLD.wayfarers, count: Number(count) } };

const t0 = performance.now();
const sim = new Simulation({ data, seed });
sim.runDays(days);
const ms = performance.now() - t0;

const counts = {};
const roads = {};
for (const e of sim.state.log) {
  counts[e.type] = (counts[e.type] ?? 0) + 1;
  if (e.type === 'wayfarer:arrived') {
    const key = routesLabel(sim.graph, e.via);
    roads[key] = (roads[key] ?? 0) + 1;
  }
}
const summary = {
  seed,
  days,
  wayfarers: data.wayfarers.count,
  ticks: sim.state.tick,
  ms: Math.round(ms),
  ticksPerSecond: Math.round(sim.state.tick / (ms / 1000)),
  finalTime: sim.cal.format(sim.now).full,
  hash: sim.hash(),
  events: counts,
  roads,
};

if (args.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const arrivals = counts['wayfarer:arrived'] ?? 0;
  console.log(`Caravans of the Copper Road: headless laboratory`);
  console.log(`seed ${seed} · ${days} days · ${summary.wayfarers} wayfarers · ${summary.ticks} ticks`);
  console.log(`ran in ${summary.ms} ms (${summary.ticksPerSecond.toLocaleString('en')} ticks/s)`);
  console.log(`now: ${summary.finalTime}`);
  console.log(`state hash: ${summary.hash}`);
  console.log('');
  console.log('Events:');
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(20)} ${v}`);
  console.log('');
  console.log('Journeys completed, by road:');
  for (const [k, v] of Object.entries(roads).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(40)} ${String(v).padStart(4)}  ${((100 * v) / arrivals).toFixed(0)}%`);
  }
  const ix = economyIndex(sim.data);
  const col = (s, w) => String(s).padStart(w);
  console.log('');
  console.log('Markets (price in marks, days of supply in brackets):');
  console.log('  ' + 'good'.padEnd(11) + ix.markets.map((m) => col(sim.graph.nodes.get(m).name, 17)).join(''));
  for (const gid of ix.goodIds) {
    const cells = ix.markets.map((sid) => {
      const q = quote(sim, sid, gid);
      const days = q.daysLeft === null ? '' : ` (${q.daysLeft >= 999 ? '999+' : q.daysLeft.toFixed(0)}d)`;
      return col(q.price.toFixed(1) + days, 17);
    });
    console.log('  ' + gid.padEnd(11) + cells.join(''));
  }
  console.log('  ' + 'hunger'.padEnd(11) + ix.markets.map((sid) => col(sim.state.economy.hunger[sid].toFixed(2), 17)).join(''));
  console.log('  ' + 'people'.padEnd(11) + ix.markets.map((sid) => col(residentsAt(sim, sid).length, 17)).join(''));
  console.log('  ' + 'purse'.padEnd(11) + ix.markets.map((sid) => col(formatMoney(sim, balance(sim, `purse:${sid}`), { short: true }), 17)).join(''));
  const f = sim.state.coin.flows;
  const m = (b) => formatMoney(sim, b, { short: true });
  console.log('');
  console.log(
    `Money: ${m(moneySupply(sim))} in circulation = ${m(sim.state.coin.opening)} opening + ${m(f.minted)} minted + ${m(f.gifted)} gifted` +
      ` + ${m(f.exported)} from the ships − ${m(f.crown)} Crown − ${m(f.worn)} worn − ${m(f.hoarded)} buried − ${m(f.imported)} to the ships.` +
      ` Treasury ${m(balance(sim, 'treasury'))}.`,
  );
  const opps = tradeOpportunities(sim, { limit: 5 });
  if (opps.length) {
    console.log('');
    console.log('Best trades right now (30 units by wagon, perfect knowledge):');
    for (const o of opps) {
      const from = sim.graph.nodes.get(o.from).name;
      const to = sim.graph.nodes.get(o.to).name;
      console.log(`  ${o.good.padEnd(9)} ${from} ${o.buy.toFixed(1)} → ${to} ${o.sell.toFixed(1)}  ${o.days.toFixed(1)} days  profit ${o.profit.toFixed(0)} marks (${o.perDay.toFixed(0)}/day)`);
    }
  }
  if (chronicle > 0) {
    console.log('');
    console.log(`Last ${chronicle} entries of the chronicle:`);
    for (const e of sim.state.log.slice(-chronicle)) console.log(`  ${sim.cal.format(e.t).stamp.padEnd(15)} ${describe(e, sim)}`);
  }
}
