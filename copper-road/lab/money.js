// Money panel: how much coin is in circulation, where it sits, and where it
// came from and went. Every bit is accounted for.

import { balance, economyIndex, mintStatus, moneySupply, residentsAt } from '../src/index.js';
import { createPriceChart } from './charts.js';
import { esc, money, moneyBits, placeName } from './format.js';

export function createMoneyPanel(root) {
  root.innerHTML = `
    <div class="tiles"></div>
    <div class="money-grid">
      <div>
        <div class="table-wrap">
          <table class="money-table">
            <thead><tr><th>Town</th><th class="num">Households</th><th class="num">Per head</th><th class="num">Traders' till</th><th class="num">Buried</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <p class="ledger-line"></p>
      </div>
      <div class="money-chart"></div>
    </div>`;
  const chart = createPriceChart(root.querySelector('.money-chart'));
  let lastDay = null;

  function render(sim, force) {
    const c = sim.state.coin;
    const ix = economyIndex(sim.data);
    const supply = moneySupply(sim);
    const mint = mintStatus(sim);
    const buried = Object.values(c.hoards).reduce((a, b) => a + b, 0);
    const mintWord = mint.striking ? 'striking' : { 'treasury full': 'resting: treasury full', 'ore too dear': 'idle: ore too dear', 'no ore': 'idle: no ore', 'no mint-master': 'idle: no mint-master' }[mint.reason] ?? mint.reason;
    const tile = (label, value, sub) => `<div class="tile"><p class="tile-label">${esc(label)}</p><p class="tile-value">${value}</p><p class="tile-sub">${sub}</p></div>`;
    root.querySelector('.tiles').innerHTML = [
      tile('In circulation', moneyBits(supply), `from ${moneyBits(c.opening)} at the start`),
      tile("Lord Aldric's treasury", moneyBits(balance(sim, 'treasury')), `guards paid ${moneyBits(c.lastDay?.wages ?? 0)} yesterday`),
      tile('The Mint at Copperford', moneyBits(c.flows.minted), `struck so far · ${esc(mintWord)}`),
      tile('Buried under floors', moneyBits(buried), 'coin with nothing to buy'),
    ].join('');

    root.querySelector('tbody').innerHTML = ix.markets.map((sid) => {
      const heads = residentsAt(sim, sid).length;
      const purse = balance(sim, `purse:${sid}`);
      return `<tr>
        <td>${esc(placeName(sim, sid))} <span class="dim">${heads} people</span></td>
        <td class="num">${moneyBits(purse)}</td>
        <td class="num">${heads ? moneyBits(purse / heads) : '—'}</td>
        <td class="num">${moneyBits(balance(sim, `till:${sid}`))}</td>
        <td class="num">${moneyBits(c.hoards[sid] ?? 0)}</td>
      </tr>`;
    }).join('');
    const held = (prefix) => Object.entries(c.accounts).filter(([k]) => k.startsWith(prefix)).reduce((a, [, v]) => a + v, 0);
    const f = c.flows;
    root.querySelector('.ledger-line').innerHTML =
      `Wayfarers carry ${moneyBits(held('wayfarer:'))}; merchant houses hold ${moneyBits(held('merchant:'))}. ` +
      `<strong>The books balance:</strong> ${moneyBits(c.opening)} at the start + ${moneyBits(f.minted)} minted` +
      (f.gifted ? ` + ${moneyBits(f.gifted)} from the lab` : '') +
      ` + ${moneyBits(f.exported)} paid by the ships − ${moneyBits(f.imported)} paid to the ships` +
      (f.unearthed ? ` + ${moneyBits(f.unearthed)} dug up` : '') +
      ` − ${moneyBits(f.crown)} to the Crown − ${moneyBits(f.worn)} worn away − ${moneyBits(f.hoarded)} buried = <strong>${moneyBits(supply)}</strong>.`;

    const day = c.history.days.at(-1);
    if ((force || day !== lastDay) && c.history.days.length > 1) {
      lastDay = day;
      chart.update({
        title: `Coin in circulation and in the treasury, last ${c.history.days.length} days (marks)`,
        days: c.history.days,
        base: null,
        contextName: "Lord Aldric's treasury",
        series: [
          { id: 'supply', name: 'In circulation', values: c.history.supply.map((b) => b / 12), emphasis: true },
          { id: 'treasury', name: 'Treasury', values: c.history.treasury.map((b) => b / 12), emphasis: false },
        ],
        winter: [],
        formatValue: money,
        formatDay: (d, short) => (short ? `Day ${d + 1}` : `Day ${d + 1} · ${sim.cal.format(d * 1440).date}`),
      });
    }
  }

  return { render };
}
