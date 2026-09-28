// Merchant houses: who trades on the Copper Road, where they are, and how
// they're doing. Click a name to open the house in the inspector.

import { balance } from '../src/index.js';
import { esc, moneyBits, placeName } from './format.js';

export function createHousesPanel(root, { onSelect }) {
  root.innerHTML = `
    <div class="table-wrap">
      <table class="houses-table">
        <thead><tr><th>House</th><th>Doing</th><th class="num">Wagons</th><th class="num">Purse</th><th class="num">Ventures</th><th class="num">Profit</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <p class="small fallen"></p>`;
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-merchant]');
    if (b) onSelect(b.dataset.merchant);
  });
  let last = '';

  function render(sim) {
    const st = sim.state.merchants;
    if (!st) return;
    const all = st.order.map((id) => st.byId[id]);
    const rows = all.filter((m) => m.active).map((m) => {
      const cargo = Object.entries(m.cargo)[0];
      const what = cargo ? `${Math.round(cargo[1])} ${sim.data.economy.goods.find((g) => g.id === cargo[0]).units}` : null;
      const doing = m.captive ? '<span class="bad">held for ransom</span>'
        : m.trip ? `${what ? `${esc(what)} to` : 'empty to'} ${esc(placeName(sim, m.trip.dest))}`
          : what ? `selling ${esc(what)} in ${esc(placeName(sim, m.at))}` : `in ${esc(placeName(sim, m.at))}`;
      return `<tr>
        <td><button class="linkish" data-merchant="${esc(m.id)}">${esc(m.name)}</button> <span class="dim">${esc(placeName(sim, m.home))}</span></td>
        <td>${doing}</td>
        <td class="num">${m.wagons}</td>
        <td class="num">${moneyBits(balance(sim, `merchant:${m.id}`))}</td>
        <td class="num">${m.trades}${m.losses ? ` <span class="dim">(${m.losses} lost)</span>` : ''}</td>
        <td class="num">${moneyBits(m.profit)}</td>
      </tr>`;
    }).join('');
    const fallen = all.filter((m) => !m.active).map((m) => `<button class="linkish" data-merchant="${esc(m.id)}">${esc(m.name)}</button>`);
    const html = rows + '|' + fallen.join(',');
    if (html === last) return;
    last = html;
    root.querySelector('tbody').innerHTML = rows;
    root.querySelector('.fallen').innerHTML = fallen.length ? `Fallen houses: ${fallen.join(', ')}.` : '';
  }
  return { render };
}
