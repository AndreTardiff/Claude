// Sellswords: who hires out to guard the roads, what they carry, and what they
// (and their gear) have lived through. Click a name or a piece of gear to open it
// in the inspector.

import { balance, itemById, itemLabel, mercName, rankOf, tierOf } from '../src/index.js';
import { esc, moneyBits, placeName } from './format.js';

const STAT_SHORT = { str: 'S', agi: 'A', dis: 'D', awa: 'W', nerve: 'N' };

/** What a sellsword is doing, in a few words. */
export function mercDoing(sim, g) {
  if (!g.active) return g.died ? 'fallen' : 'retired';
  const hurt = g.wound ? ` <span class="bad">${g.wound.severe ? 'badly hurt' : 'hurt'}</span>` : '';
  if (g.trip?.kind === 'lord') return `riding with Lord Aldric's party${hurt}`;
  if (g.trip?.kind === 'patrol') return `riding with the lord's patrol${hurt}`;
  const m = g.trip ? sim.state.merchants.byId[g.trip.id] : null;
  if (m) return `guarding ${esc(m.name)}'s caravan${m.trip ? ` to ${esc(placeName(sim, m.trip.dest))}` : ''}${hurt}`;
  if (g.walking) return `walking home to ${esc(placeName(sim, g.home))}${hurt}`;
  return `in ${esc(placeName(sim, g.at))}${hurt}`;
}

export function itemButton(sim, item) {
  if (!item) return '';
  const tier = tierOf(sim, item);
  const cls = item.name ? 'named' : item.tier > 0 ? 'tempered' : '';
  const label = item.name ?? (item.type === 'charm' ? item.charm : sim.data.mercs.gear[item.type].name);
  return `<button class="linkish gear ${cls}" data-item="${esc(item.id)}" title="${esc(tier.name)}${item.statuses.length ? ` · ${esc(item.statuses.join(', '))}` : ''}">${esc(label)}</button>`;
}

export function createMercsPanel(root, { onSelect, onSelectItem }) {
  root.innerHTML = `
    <div class="table-wrap">
      <table class="mercs-table">
        <thead><tr><th>Sellsword</th><th>Rank</th><th>Doing</th><th title="strength, agility, discipline, awareness (W), nerve">S A D W N</th><th>Gear</th><th class="num">Fights</th><th class="num">Fame</th><th class="num">Purse</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <h3 class="sub-h">Gear with a story <span class="sub">pieces that have earned a tier, wherever they are now</span></h3>
    <div class="storied"></div>
    <p class="small fallen"></p>`;
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-merc], [data-item]');
    if (!b) return;
    if (b.dataset.merc) onSelect(b.dataset.merc);
    else onSelectItem(b.dataset.item);
  });
  let last = '';

  function render(sim) {
    const st = sim.state.mercs;
    if (!st) return;
    const all = st.order.map((id) => st.byId[id]);
    const rows = all.filter((g) => g.active).map((g) => {
      const traits = g.traits.map((t) => sim.data.mercs.traits[t]?.name ?? t);
      const gear = ['weapon', 'armour', 'shield', 'charm'].map((s) => itemButton(sim, itemById(sim, g.gear[s]))).filter(Boolean).join(' ');
      const L = g.ledger;
      return `<tr>
        <td><button class="linkish" data-merc="${esc(g.id)}">${esc(mercName(sim, g.id))}</button> <span class="dim">${esc(placeName(sim, g.home))}</span>
          ${traits.length ? `<br><span class="traits">${traits.map(esc).join(' · ')}</span>` : ''}</td>
        <td>${esc(rankOf(sim, g).name)}</td>
        <td>${mercDoing(sim, g)}</td>
        <td class="stats">${Object.keys(STAT_SHORT).map((s) => g.stats[s]).join(' ')}</td>
        <td>${gear}</td>
        <td class="num">${L.fights ? `${L.won}–${L.lost}` : '<span class="dim">none</span>'}</td>
        <td class="num">${g.fame ? g.fame.toFixed(0) : '<span class="dim">–</span>'}</td>
        <td class="num">${moneyBits(balance(sim, `merc:${g.id}`))}</td>
      </tr>`;
    }).join('');
    const storied = Object.values(st.items).filter((i) => i.tier > 0 || (i.type === 'charm' && Math.abs(i.repute) >= 0.2))
      .sort((a, b) => b.tier - a.tier || b.xp - a.xp || (a.id < b.id ? -1 : 1)).slice(0, 12)
      .map((i) => {
        const where = i.holder.kind === 'merc' ? `carried by ${esc(mercName(sim, i.holder.id))}`
          : i.holder.kind === 'band' ? `<span class="bad">in the hands of ${esc(sim.state.raiders.bands[i.holder.id]?.name ?? 'outlaws')}</span>`
            : i.holder.kind === 'rack' ? `on a rack in ${esc(placeName(sim, i.holder.at))}`
              : i.holder.kind === 'wagon' ? 'on a caravan\'s wagons' : 'lost';
        return `<li>${itemButton(sim, i)} <span class="dim">${esc(tierOf(sim, i).name)}${i.name ? '' : `, ${esc(itemLabel(sim, i))}`} · ${i.deeds.fights} fights${i.deeds.kills ? `, ${i.deeds.kills} killed` : ''}</span> · ${where}</li>`;
      }).join('');
    const fallen = all.filter((g) => !g.active).map((g) => `<button class="linkish" data-merc="${esc(g.id)}">${esc(mercName(sim, g.id))}</button>${g.died ? ' †' : ''}`);
    const html = rows + '|' + storied + '|' + fallen.join(',');
    if (html === last) return;
    last = html;
    root.querySelector('tbody').innerHTML = rows;
    root.querySelector('.storied').innerHTML = storied ? `<ul class="plain">${storied}</ul>` : '<p class="hint">Nothing yet. Gear earns its story slowly: several fights for the first tier, a great many for a name.</p>';
    root.querySelector('.fallen').innerHTML = fallen.length ? `Fallen and retired: ${fallen.join(', ')}. († died on the road)` : '';
  }
  return { render };
}
