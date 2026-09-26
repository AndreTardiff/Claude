// Market board: one settlement's market at a glance, why a price is what it is,
// and how that good's price has moved across every town.

import { economyIndex, priceMultiplier, quote, residentsAt, toolFactor, visitorsAt, professionName } from '../src/index.js';
import { createPriceChart, sparkline } from './charts.js';
import { esc, goodOf, money, pct, placeName, pressure, qty } from './format.js';

const TREND_DAYS = 40;

export function createMarketsPanel(root, { onSelect }) {
  root.innerHTML = `
    <div class="tabs" role="tablist" aria-label="Settlement"></div>
    <p class="market-summary"></p>
    <div class="market-grid">
      <div class="table-wrap">
        <table class="market-table">
          <thead><tr><th>Good</th><th class="num">In store</th><th class="num">Price</th><th>Last ${TREND_DAYS} days</th><th>Yesterday</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="market-detail">
        <div class="why"></div>
        <div class="price-chart"></div>
      </div>
    </div>
    <p class="market-work"></p>`;
  const tabs = root.querySelector('.tabs');
  const tbody = root.querySelector('tbody');
  const chart = createPriceChart(root.querySelector('.price-chart'));
  let current = { town: null, good: null };

  tabs.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-town]');
    if (b) onSelect({ town: b.dataset.town });
  });
  tbody.addEventListener('click', (ev) => {
    const tr = ev.target.closest('[data-good]');
    if (tr) onSelect({ good: tr.dataset.good });
  });
  tbody.addEventListener('keydown', (ev) => {
    const tr = ev.target.closest('[data-good]');
    if (tr && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      onSelect({ good: tr.dataset.good });
    }
  });

  function render(sim, { town, good }, { chartToo = true } = {}) {
    const ix = economyIndex(sim.data);
    if (town !== current.town) {
      tabs.innerHTML = ix.markets
        .map((sid) => `<button type="button" role="tab" data-town="${sid}" aria-selected="${sid === town}">${esc(placeName(sim, sid))}</button>`)
        .join('');
    }
    current = { town, good };
    const outside = ix.isOutside(town);
    const today = sim.state.economy.today[town];
    const hist = sim.state.economy.history;

    // Summary: who lives here, and how well fed and equipped they are.
    const people = residentsAt(sim, town).length;
    const visitors = visitorsAt(sim, town).length;
    if (outside) {
      root.querySelector('.market-summary').innerHTML =
        `<strong>The Outside.</strong> Ships come and go and keep this market near world prices: salt and medicine are cheap here; ore, cloth and wool fetch a good price.`;
    } else {
      const hunger = sim.state.economy.hunger[town];
      const hungerWord = hunger >= 0.6 ? 'famine' : hunger >= 0.25 ? 'hungry' : hunger >= 0.1 ? 'lean' : 'well fed';
      root.querySelector('.market-summary').innerHTML =
        `${people} residents${visitors ? ` and ${visitors} travelling guest${visitors === 1 ? '' : 's'}` : ''} · ` +
        `<span class="${hunger >= 0.25 ? 'bad' : ''}">${hungerWord}</span>${hunger >= 0.1 ? ` (${pct(hunger)} hungry)` : ''} · ` +
        `tools ${pct(toolFactor(sim, town))} of full strength`;
    }

    tbody.innerHTML = ix.goodIds.map((gid) => {
      const g = ix.goods.get(gid);
      const q = quote(sim, town, gid);
      const mult = priceMultiplier(q);
      const p = pressure(mult);
      const store = outside
        ? `${qty(q.stock)}`
        : q.daysLeft === null
          ? `${qty(q.stock)} <span class="dim">not used here</span>`
          : `${qty(q.stock)} <span class="dim">${q.daysLeft >= 999 ? '999+' : Math.round(q.daysLeft)} days</span>`;
      let flows = '';
      if (today) {
        const bits = [];
        if (today.produced[gid]) bits.push(`made ${qty(today.produced[gid])}`);
        const used = (today.used[gid] ?? 0) + (today.consumed[gid] ?? 0);
        if (used) bits.push(`used ${qty(used)}`);
        if (today.unmet[gid]) bits.push(`<span class="bad">short ${qty(today.unmet[gid])}</span>`);
        if (today.lost[gid]) bits.push(`<span class="dim">lost ${qty(today.lost[gid])}</span>`);
        flows = bits.join(' · ');
      }
      return `<tr data-good="${gid}" tabindex="0" class="${gid === good ? 'selected' : ''}" aria-selected="${gid === good}">
        <td>${esc(g.name)} <span class="dim">(${esc(g.units)})</span></td>
        <td class="num">${store}</td>
        <td class="num"><strong>${money(q.price)}</strong> <span class="pressure ${p.cls}" title="${p.word}">${p.glyph} ×${mult.toFixed(1)}</span></td>
        <td class="spark-cell" data-spark="${gid}"></td>
        <td class="flows">${flows || '<span class="dim">—</span>'}</td>
      </tr>`;
    }).join('');
    for (const cell of tbody.querySelectorAll('[data-spark]')) {
      cell.appendChild(sparkline(hist.price[town][cell.dataset.spark].slice(-TREND_DAYS)));
    }

    renderWhy(sim, town, good);

    // Work done yesterday: which trades ran, how hard, and on what.
    const work = root.querySelector('.market-work');
    if (!outside && today?.trades.length) {
      work.innerHTML = '<strong>Yesterday\'s work:</strong> ' + today.trades.map((t) => {
        const notes = [];
        if (t.effort !== 1) notes.push(`effort ${pct(t.effort)}`);
        if (t.makeshift > 0.01) notes.push(`${pct(t.makeshift)} makeshift`);
        return `${esc(professionName(sim, t.profession, t.workers !== 1))} ×${t.workers} made ${qty(t.made)} ${esc(goodOf(sim, t.good).units)}${notes.length ? ` <span class="dim">(${notes.join(', ')})</span>` : ''}`;
      }).join(' · ');
    } else {
      work.textContent = '';
    }

    if (chartToo) renderChart(sim, town, good);
  }

  function renderWhy(sim, town, gid) {
    const ix = economyIndex(sim.data);
    const g = ix.goods.get(gid);
    const q = quote(sim, town, gid);
    const curve = ix.eco.priceCurves[g.curve];
    const name = placeName(sim, town);
    const parts = [`base value <b>${g.base}</b>`];
    if (q.local !== 1) parts.push(`world price <b>×${q.local}</b>`);
    parts.push(`stock pressure <b>×${q.factor.toFixed(2)}</b>`);
    let story;
    if (ix.isOutside(town)) {
      story = `Ships keep about <b>${qty(q.desired)} ${esc(g.units)}</b> here; there are <b>${qty(q.stock)}</b> now. ` +
        (q.local < 1 ? `The wider world sells ${esc(g.name.toLowerCase())} cheap at the port.` : q.local > 1 ? `Foreign buyers pay well for ${esc(g.name.toLowerCase())}.` : '');
    } else if (!(q.desired > 0)) {
      story = `Nobody in ${esc(name)} uses ${esc(g.name.toLowerCase())}, so every ${esc(g.unit)} in store is surplus and the price sits at the curve's floor (×${curve.floor}).`;
    } else {
      story = `${esc(name)} wants <b>${qty(q.desired)} ${esc(g.units)}</b> in store (${g.reserveDays} days at ${qty(q.need)} a day) and has <b>${qty(q.stock)}</b>` +
        ` (${q.daysLeft >= 999 ? '999+' : qty(q.daysLeft)} days). Wanted ÷ held = ${q.scarcity.toFixed(2)}, which the ${esc(g.curve)} curve turns into ×${q.factor.toFixed(2)}` +
        ` (never below ×${curve.floor} or above ×${curve.cap}).`;
    }
    root.querySelector('.why').innerHTML = `
      <h3>${esc(g.name)} in ${esc(name)} <span class="sub">${money(q.price)} marks a ${esc(g.unit)}</span></h3>
      <p class="calc">${parts.join(' × ')} = <b>${money(q.price)}</b></p>
      <p class="story">${story}</p>`;
  }

  function renderChart(sim, town, gid) {
    const ix = economyIndex(sim.data);
    const h = sim.state.economy.history;
    if (!h.days.length) return;
    const g = ix.goods.get(gid);
    const winter = [];
    let start = null;
    h.days.forEach((d, i) => {
      const w = sim.cal.seasonOfDay(d).id === 'winter';
      if (w && start === null) start = i;
      if ((!w || i === h.days.length - 1) && start !== null) {
        winter.push([start, w ? i : i - 1]);
        start = null;
      }
    });
    chart.update({
      title: `${g.name}: price in every market, last ${h.days.length} days (marks a ${g.unit})`,
      days: h.days,
      base: g.base,
      winter,
      series: ix.markets.map((sid) => ({ id: sid, name: placeName(sim, sid), values: h.price[sid][gid], emphasis: sid === town })),
      formatValue: money,
      formatDay: (d, short) => (short ? `Day ${d + 1}` : `Day ${d + 1} · ${sim.cal.format(d * 1440).date}`),
    });
  }

  return { render };
}
