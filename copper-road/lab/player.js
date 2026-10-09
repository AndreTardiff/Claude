// Your ledger (step G): play the Copper Road yourself. Everything here goes through
// sim.command(), exactly as the scripted players do, so it replays exactly.
// The forms are built once (so typing isn't interrupted); the ledger above them
// is redrawn as the world moves.

import { balance, describe, economyIndex, quote } from '../src/index.js';
import { botDay } from '../src/bots/trader.js';
import { caravans, netWorth } from '../src/systems/player.js';
import { bandTalk, esc, goodOf, money, moneyBits, placeName, qty } from './format.js';

const ROADS = [['balanced', 'balanced'], ['fast', 'fastest'], ['safe', 'safest']];
const sourceWord = { seen: 'seen', board: 'posted board', post: 'letter', rumour: 'rumour' };
const ageWord = (d) => (d < 0.5 ? 'today' : d < 1.5 ? 'a day old' : `${Math.round(d)} days old`);
const THEN_WORD = { wait: 'wait for orders', home: 'come home', store: 'store it and wait', dissolve: 'back to the yard' };
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const options = (pairs, value) => pairs.map(([v, label]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(label)}</option>`).join('');

export function createPlayerPanel(root, { getSim, onChange, onSelectMerc }) {
  root.innerHTML = `
    <div class="pl-status"></div>
    <div class="pl-forms">
      <h3 class="sub-h">In the market here</h3>
      <div class="tool-row">
        <label>Good <select data-f="good"></select></label>
        <label>Qty <input data-f="qty" type="number" min="1" step="1" value="5" size="4"></label>
        <button type="button" data-act="buy">Buy</button>
        <button type="button" data-act="sell">Sell from store</button>
        <span class="pl-price small"></span>
      </div>
      <h3 class="sub-h">Send a caravan <span class="sub">from your stores where you stand</span></h3>
      <div class="tool-row">
        <label>To <select data-f="to"></select></label>
        <label>Load <select data-f="load"></select></label>
        <label>Qty <input data-f="lqty" type="number" min="0" step="1" value="30" size="4"></label>
        <label>Road <select data-f="road">${options(ROADS, 'balanced')}</select></label>
        <label>Guards <select data-f="guards">${options([['auto', 'as the danger warrants'], ['0', 'none'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], 'auto')}</select></label>
      </div>
      <div class="tool-row">
        <label>If a band stops them <select data-f="threatened">${options([['toll', 'pay the toll'], ['fight', 'fight'], ['flee', 'run']], 'toll')}</select></label>
        <label>Give way at <select data-f="outnumbered">${options([['1.5', '1.5 to 1'], ['2', '2 to 1'], ['3', '3 to 1'], ['never', 'never']], '2')}</select></label>
        <label>Running <select data-f="cargo">${options([['drop', 'cut the load loose'], ['hold', 'hold on to it']], 'drop')}</select></label>
        <label>Night <select data-f="night">${options([['watch', 'double watch'], ['sleep', 'single watch']], 'watch')}</select></label>
      </div>
      <div class="tool-row">
        <label>On arrival <select data-f="sellon">${options([['all', 'sell'], ['none', "don't sell"]], 'all')}</select></label>
        <label>Then <select data-f="then">${options([['wait', 'wait there for orders'], ['home', 'come home'], ['store', 'store what is left there']], 'home')}</select></label>
        <label><input type="checkbox" data-f="ride"> Ride with it yourself</label>
        <button type="button" data-act="dispatch">Send</button>
      </div>
      <h3 class="sub-h">A courier <span class="sub">orders for a caravan far away, and that town's news back</span></h3>
      <div class="tool-row">
        <label>To <select data-f="cto"></select></label>
        <label>For <select data-f="ccar"></select></label>
        <label>Sell <select data-f="csell">${options([['', '(as before)'], ['all', 'sell there'], ['none', "don't sell"]], '')}</select></label>
        <label>Then <select data-f="cthen">${options([['', '(as before)'], ['wait', 'wait'], ['home', 'come home'], ['store', 'store it there']], '')}</select></label>
        <label>Go on to <select data-f="cgo"></select></label>
        <button type="button" data-act="courier">Send a courier</button>
      </div>
      <h3 class="sub-h">Yourself, the changer, the wheelwrights</h3>
      <div class="tool-row">
        <label>Ride to <select data-f="tto"></select></label>
        <label>by the <select data-f="troad">${options(ROADS, 'balanced')}</select> road</label>
        <button type="button" data-act="travel">Ride</button>
        <label>Marks <input data-f="marks" type="number" min="1" step="1" value="50" size="5"></label>
        <button type="button" data-act="borrow">Borrow</button>
        <button type="button" data-act="repay">Repay</button>
        <button type="button" data-act="buy-wagon">Buy a wagon</button>
        <button type="button" data-act="sell-wagon">Sell a wagon</button>
        <button type="button" data-act="hire-factor">Hire a factor here</button>
      </div>
      <div class="tool-row">
        <label><input type="checkbox" data-f="auto"> Let the bot play for you <span class="dim">(the "smart" player bot: rides with its caravan, trades from wherever it stands)</span></label>
      </div>
      <p class="pl-result hint" aria-live="polite"></p>
    </div>`;
  const f = (name) => root.querySelector(`[data-f="${name}"]`);
  const result = root.querySelector('.pl-result');
  let last = '';
  let lastDay = null;
  const optionCache = {};

  // Refill a select's options only when the list changes, keeping the choice.
  function fillSelect(name, pairs) {
    const key = JSON.stringify(pairs);
    if (optionCache[name] === key) return;
    optionCache[name] = key;
    const el = f(name);
    const keep = el.value;
    el.innerHTML = options(pairs, pairs.some(([v]) => v === keep) ? keep : pairs[0]?.[0]);
  }

  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act], [data-merc]');
    if (!b) return;
    if (b.dataset.merc) return onSelectMerc?.(b.dataset.merc);
    const sim = getSim();
    const act = b.dataset.act;
    const seen = sim.state.log.length;
    const n = (name) => Number(f(name).value) || 0;
    if (act === 'buy') sim.command('player:buy', { good: f('good').value, qty: n('qty') });
    if (act === 'sell') sim.command('player:sell', { good: f('good').value, qty: n('qty') });
    if (act === 'dispatch') {
      const load = f('load').value;
      sim.command('player:dispatch', {
        to: f('to').value, good: load || null, qty: load ? n('lqty') : 0, road: f('road').value,
        guards: f('guards').value === 'auto' ? 'auto' : Number(f('guards').value),
        orders: { threatened: f('threatened').value, outnumbered: f('outnumbered').value === 'never' ? null : Number(f('outnumbered').value), cargo: f('cargo').value, night: f('night').value },
        sell: f('sellon').value, then: f('then').value, ride: f('ride').checked,
      });
    }
    if (act === 'courier') {
      const orders = {};
      if (f('csell').value) orders.sell = f('csell').value;
      if (f('cthen').value) orders.then = f('cthen').value;
      if (f('cgo').value) orders.to = f('cgo').value;
      sim.command('player:courier', { to: f('cto').value, caravan: f('ccar').value || null, orders: f('ccar').value ? orders : null });
    }
    if (act === 'travel') sim.command('player:travel', { to: f('tto').value, road: f('troad').value });
    if (act === 'borrow') sim.command('player:borrow', { marks: n('marks') });
    if (act === 'repay') sim.command('player:repay', { marks: n('marks') });
    if (act === 'buy-wagon') sim.command('player:buy-wagon');
    if (act === 'sell-wagon') sim.command('player:sell-wagon');
    if (act === 'hire-factor') sim.command('player:hire-factor');
    if (act === 'car-sell') sim.command('player:orders', { caravan: b.dataset.id, sell: 'all' });
    if (act === 'car-home') sim.command('player:orders', { caravan: b.dataset.id, to: sim.state.player.home, then: 'home' });
    if (act === 'dismiss') sim.command('player:dismiss-factor', { at: b.dataset.at });
    const said = sim.state.log.slice(seen).map((e) => describe(e, sim));
    result.textContent = said.join(' ') || 'Nothing happened.';
    last = '';
    onChange?.();
    render(sim);
  });

  function render(sim) {
    const st = sim.state.player;
    if (!st) return;
    // The bot, if you've handed it the reins: once a day.
    const day = sim.cal.day(sim.now);
    if (f('auto').checked && day !== lastDay) botDay(sim);
    lastDay = day;

    const ix = economyIndex(sim.data);
    const place = (sid) => placeName(sim, sid);
    const goods = ix.goodIds;
    const towns = ix.markets.map((sid) => [sid, place(sid)]);
    const here = st.at;
    fillSelect('good', goods.map((g) => [g, goodOf(sim, g).name]));
    fillSelect('to', towns.filter(([sid]) => sid !== here));
    fillSelect('cto', towns.filter(([sid]) => sid !== here));
    fillSelect('tto', towns.filter(([sid]) => sid !== here));
    fillSelect('cgo', [['', '(stay)'], ...towns]);
    fillSelect('load', [['', '(empty wagons)'], ...Object.entries(st.stores[here] ?? {}).map(([g, s]) => [g, `${goodOf(sim, g).name} (${qty(s.qty)})`])]);
    fillSelect('ccar', [['', '(no orders, just news)'], ...caravans(sim).map((m) => [m.id, `caravan ${m.id} ${m.trip ? `→ ${place(m.trip.dest)}` : `at ${place(m.at)}`}`])]);

    const g = f('good').value;
    const priceHere = here && sim.state.economy.markets[here] ? quote(sim, here, g).price : null;
    root.querySelector('.pl-price').textContent = priceHere !== null ? `${goodOf(sim, g).name} here: ${money(priceHere)} a ${goodOf(sim, g).unit}` : '';

    const d = st.debt;
    const cfg = sim.data.player.debt;
    const due = Math.round(d.principal * (cfg.rate + cfg.installment));
    const master = st.bonded?.house ? sim.state.merchants.byId[st.bonded.house]?.house : null;
    const where = st.bonded ? `<span class="bad">bonded to ${master ? `the house of ${esc(master)}` : 'a rival house'}</span> until ${esc(sim.cal.format(st.bonded.until).stamp)}`
      : st.at ? `in <strong>${esc(place(st.at))}</strong>` : st.with ? 'on the road with your caravan' : 'held by outlaws';
    const cars = caravans(sim).map((m) => {
      const load = Object.entries(m.cargo).map(([gid, q]) => `${qty(q)} ${esc(goodOf(sim, gid).units)}`).join(', ') || 'empty';
      const doing = m.captive ? '<span class="bad">taken by outlaws</span>' : m.trip ? `on the road to ${esc(place(m.trip.dest))}` : `waiting at ${esc(place(m.at))}`;
      const guards = (m.trip?.guards ?? []).map((id) => `<button class="linkish" data-merc="${esc(id)}">${esc(sim.state.mercs.byId[id] ? sim.state.residents.byId[sim.state.mercs.byId[id].resident]?.name : id)}</button>`).join(', ');
      const btns = !m.trip && !m.captive && m.at === st.at ? ` <button type="button" data-act="car-sell" data-id="${esc(m.id)}">Sell here</button> <button type="button" data-act="car-home" data-id="${esc(m.id)}">Send home</button>` : '';
      return `<li><strong>${esc(m.id)}</strong> ${m.wagons} wagon${m.wagons === 1 ? '' : 's'}, ${load}, ${doing}${m.rider ? ' <span class="tag">you ride with it</span>' : ''}${guards ? ` · guards ${guards}` : ''} · then: ${esc(THEN_WORD[m.instructions.then] ?? m.instructions.then)}${btns}</li>`;
    }).join('');
    const stores = Object.entries(st.stores).flatMap(([sid, gs]) => Object.entries(gs).map(([gid, s]) => `<tr><td>${esc(place(sid))}</td><td>${esc(goodOf(sim, gid).name)}</td><td class="num">${qty(s.qty)}</td><td class="num">${s.cost ? moneyBits(s.cost / s.qty) : '<span class="dim">inherited</span>'}</td></tr>`)).join('');
    const known = ix.markets.map((sid) => {
      const rec = sim.state.knowledge?.holders.player?.[sid];
      if (!rec) return `<tr><td>${esc(place(sid))}</td><td colspan="3" class="dim">no word</td></tr>`;
      const age = (sim.now - rec.t) / 1440;
      return `<tr><td>${esc(place(sid))}</td><td>${esc(sourceWord[rec.source] ?? rec.source)}, ${ageWord(age)}</td><td class="num">${money(rec.goods[g]?.price ?? NaN)}</td><td class="num dim">${money(quote(sim, sid, g).price)}</td></tr>`;
    }).join('');
    // Loads you've heard of, on the road or lately arrived (step G+2): word of rivals. News of a
    // departure often arrives after the load does, and still tells you your price list is out of date.
    const mine = new Set(st.caravans);
    const onRoad = Object.values(sim.state.knowledge?.holders.player ?? {}).filter((r) => r.bound && r.eta > sim.now - 5 * 1440).sort((a, b) => b.eta - a.eta || (a.who < b.who ? -1 : 1));
    const bound = onRoad.map((r) => `<li>${mine.has(r.who) ? '<span class="tag">yours</span> ' : ''}${esc(sim.state.merchants.byId[r.who]?.name ?? r.who)}: ${qty(r.qty)} ${esc(goodOf(sim, r.good).units)}${goodOf(sim, r.good).units.toLowerCase() === goodOf(sim, r.good).name.toLowerCase() ? '' : ` of ${esc(goodOf(sim, r.good).name.toLowerCase())}`}, ${esc(place(r.from))} → <strong>${esc(place(r.to))}</strong>, ${r.eta > sim.now ? `due ${esc(sim.cal.format(r.eta).stamp)}` : `should be there by now (${esc(sim.cal.format(r.eta).stamp)})`} <span class="dim">(${esc(sourceWord[r.source] ?? r.source)}, word ${ageWord((sim.now - r.t) / 1440)})</span></li>`).join('');
    // What you've heard of the bands in the hills (step G+3): reckon the roads by it.
    const hideoutName = (hid) => sim.data.raiders?.hideouts.find((h) => h.id === hid)?.band ?? hid;
    const bands = Object.values(sim.state.knowledge?.holders.player ?? {}).filter((r) => r.bandNews).sort((a, b) => b.t - a.t)
      .map((r) => `<li>${esc(hideoutName(r.hideout))}: ${esc(bandTalk(r))} <span class="dim">(${esc(sourceWord[r.source] ?? r.source)}, ${ageWord((sim.now - r.t) / 1440)})</span></li>`).join('');
    const factors = Object.values(st.factors).map((fc) => `<li>${esc(sim.state.residents.byId[fc.resident]?.name ?? fc.resident)} in ${esc(place(fc.at))}: ${fc.reports} letters sent, ${moneyBits(fc.sold)} of your goods sold${fc.skimmed ? ` <span class="dim">(and ${moneyBits(fc.skimmed)} skimmed: only the lab knows)</span>` : ''} <button type="button" data-act="dismiss" data-at="${esc(fc.at)}">Dismiss</button></li>`).join('');
    const ledger = sim.state.log.filter((e) => e.type.startsWith('player:') && e.type !== 'player:refused' || (e.type === 'raid:encounter' && e.player)).slice(-8).reverse()
      .map((e) => `<li><time>${esc(sim.cal.format(e.t).stamp)}</time> ${esc(describe(e, sim))}</li>`).join('');
    const html = `
      <p><strong>${esc(st.name)}</strong>${st.generation > 1 ? ` <span class="dim">(the ${ordinal(st.generation)} of the family to keep this ledger)</span>` : ''}, ${where}.</p>
      <dl class="facts">
        <dt>Purse</dt><dd>${moneyBits(balance(sim, 'player'))}</dd>
        <dt>Owed</dt><dd>${moneyBits(d.principal)} to ${esc(sim.data.player.changer.name)} · about ${moneyBits(due)} due at the season's turn${d.missed ? ` · <span class="bad">${d.missed} payment${d.missed === 1 ? '' : 's'} missed</span>` : ''}${d.collector ? ` · his man ${esc(d.collector)} knows your face` : ''}</dd>
        <dt>Worth</dt><dd>${moneyBits(netWorth(sim))} <span class="dim">(coin, goods at 80% of local price, wagons at half, less the debt)</span></dd>
        <dt>Wagons</dt><dd>${st.wagons}</dd>
        ${st.news && (st.news.wages || st.news.couriers) ? `<dt>News</dt><dd>${moneyBits(st.news.wages + st.news.couriers)} spent on word from elsewhere <span class="dim">(${moneyBits(st.news.wages)} factors' wages, ${moneyBits(st.news.couriers)} couriers)</span></dd>` : ''}
      </dl>
      ${cars ? `<h4>Your caravans</h4><ul class="plain">${cars}</ul>` : ''}
      ${stores ? `<h4>Your stores</h4><div class="table-wrap"><table><thead><tr><th>Where</th><th>Good</th><th class="num">Qty</th><th class="num">Cost each</th></tr></thead><tbody>${stores}</tbody></table></div>` : ''}
      <h4>What you know <span class="sub">${esc(goodOf(sim, g).name.toLowerCase())}, by your price lists (the truth in grey, for the lab)</span></h4>
      <div class="table-wrap"><table><thead><tr><th>Market</th><th>Word</th><th class="num">You think</th><th class="num">Truly</th></tr></thead><tbody>${known}</tbody></table></div>
      ${bound ? `<h4>Loads on the road, by what you've heard</h4><ul class="plain">${bound}</ul>` : ''}
      ${bands ? `<h4>What's said of the bands</h4><ul class="plain">${bands}</ul>` : ''}
      ${factors ? `<h4>Your factors</h4><ul class="plain">${factors}</ul>` : ''}
      ${ledger ? `<h4>Your ledger, lately</h4><ul class="plain">${ledger}</ul>` : ''}`;
    if (html === last) return;
    last = html;
    root.querySelector('.pl-status').innerHTML = html;
  }
  return { render };
}
