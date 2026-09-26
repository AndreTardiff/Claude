// Opportunity board: the most profitable wagon loads right now, with perfect knowledge.

import { tradeOpportunities } from '../src/index.js';
import { esc, goodOf, money, placeName, qty } from './format.js';

export function createOpportunityPanel(root, { onHighlight }) {
  root.innerHTML = `
    <div class="table-wrap">
      <table class="opp-table">
        <thead><tr><th>Load</th><th>Buy</th><th>Sell</th><th class="num">Days</th><th class="num">Profit</th><th>Per day</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>`;
  const tbody = root.querySelector('tbody');
  let rows = [];
  let pinned = null;

  tbody.addEventListener('mouseover', (ev) => {
    const tr = ev.target.closest('[data-i]');
    if (tr && !pinned) onHighlight(rows[Number(tr.dataset.i)]);
  });
  tbody.addEventListener('mouseleave', () => {
    if (!pinned) onHighlight(null);
  });
  tbody.addEventListener('click', (ev) => {
    const tr = ev.target.closest('[data-i]');
    if (!tr) return;
    const o = rows[Number(tr.dataset.i)];
    const key = `${o.good}|${o.from}|${o.to}`;
    pinned = pinned === key ? null : key;
    onHighlight(pinned ? o : null, Boolean(pinned));
    for (const r of tbody.querySelectorAll('tr')) r.classList.toggle('pinned', pinned !== null && r === tr);
  });

  function render(sim, { mode }) {
    rows = tradeOpportunities(sim, { speedKmh: mode.kmh, limit: 8 });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="hint">No trade would pay right now.</td></tr>';
      return;
    }
    const best = rows[0].perDay;
    tbody.innerHTML = rows.map((o, i) => {
      const g = goodOf(sim, o.good);
      const key = `${o.good}|${o.from}|${o.to}`;
      const width = Math.max(4, Math.round((o.perDay / best) * 100));
      return `<tr data-i="${i}" class="${pinned === key ? 'pinned' : ''}">
        <td>${qty(o.qty)} ${esc(g.units)} of ${esc(g.name.toLowerCase())}</td>
        <td>${esc(placeName(sim, o.from))} <span class="dim">${money(o.buy)}</span></td>
        <td>${esc(placeName(sim, o.to))} <span class="dim">${money(o.sell)}</span></td>
        <td class="num">${o.days.toFixed(1)}</td>
        <td class="num">${money(o.profit)}</td>
        <td class="bar-cell"><span class="bar" style="width:${width}%"></span><span class="bar-val">${money(o.perDay)}</span></td>
      </tr>`;
    }).join('');
  }

  return { render };
}
