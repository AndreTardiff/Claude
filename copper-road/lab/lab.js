// The laboratory page: runs the simulation core in the browser with time controls,
// a map, an inspector, the chronicle, the markets, an opportunity board, lab
// tools, a route explorer and a determinism check.

import {
  Simulation,
  WORLD,
  describe,
  economyIndex,
  formatDuration,
  balance,
  getResident,
  getBand,
  nerveOf,
  getMerc,
  getMerchant,
  guardPower,
  itemById,
  itemLabel,
  mercName,
  rankOf,
  tierOf,
  wageOf,
  getRider,
  getWayfarer,
  belief,
  legMinutes,
  tripPosition,
  quote,
  professionName,
  residentsAt,
  routeOptions,
  routesLabel,
  segmentConditions,
  toolFactor,
  tradeName,
  wayfarerPosition,
} from '../src/index.js';
import { createMapRenderer } from './map-render.js';
import { createMarketsPanel } from './markets.js';
import { createOpportunityPanel } from './opportunities.js';
import { createToolsPanel } from './tools.js';
import { createMoneyPanel } from './money.js';
import { createHousesPanel } from './houses.js';
import { createLordPanel } from './lord.js';
import { createMercsPanel, itemButton, mercDoing } from './mercs.js';
import { createPlayerPanel } from './player.js';
import { bandTalk, esc, goodOf, money, moneyBits, pct, placeName, qty } from './format.js';

const $ = (sel) => document.querySelector(sel);

// At 1× one game day lasts ten real minutes (spec §16).
const GAME_MINUTES_PER_SECOND = 1440 / 600;
const SPEEDS = [0, 1, 5, 20, 100];
const CHRONICLE_MAX = 200;
const NIGHT_BOOST = 20;
// Which chronicle filter each kind of entry belongs to.
const FAMILY_KIND = { wayfarer: 'travel', post: 'travel', merchant: 'trade', raid: 'roads', camp: 'roads', weather: 'roads', lord: 'lord', merc: 'blades', item: 'blades', player: 'you' };
const MODES = [
  { id: 'wagon', label: 'Wagon (3.5 km/h)', kmh: 3.5 },
  { id: 'foot', label: 'On foot (4 km/h)', kmh: 4 },
  { id: 'rider', label: 'Rider (7 km/h)', kmh: 7 },
];

const parseSeed = (s) => (/^-?\d+$/.test(String(s).trim()) ? Number(s) : String(s).trim() || 1);

let sim;
let renderT;
let speed = 1;
let lastSpeed = 1;
let selected = null; // { kind: 'wayfarer' | 'node' | 'resident', id }
let highlight = null; // { path, key, pinned }
let market = { town: 'kingscross', good: 'grain' };
let chronicleCount = 0;
let lastPanelUpdate = 0;
let lastRouteHour = -1;
let lastMarketStamp = '';
let reference = null;

const canvas = $('#map');
const renderer = createMapRenderer(canvas, WORLD);

const markets = createMarketsPanel($('#markets'), {
  onSelect(change) {
    market = { ...market, ...change };
    if (change.town) tools.setTown(change.town);
    if (change.good) {
      tools.setGood(change.good);
      $('#price-good').value = change.good;
    }
    renderMarkets(true);
  },
});
const opportunities = createOpportunityPanel($('#opps'), {
  onHighlight(o, pinned) {
    highlight = o ? { path: o.path, key: `opp:${o.good}|${o.from}|${o.to}`, pinned: Boolean(pinned) } : null;
  },
});
const moneyPanel = createMoneyPanel($('#money'));
const housesPanel = createHousesPanel($('#houses'), { onSelect: (id) => select({ kind: 'merchant', id }) });
const playerPanel = createPlayerPanel($('#player'), {
  getSim: () => sim,
  onChange() {
    renderMarkets(true);
    renderInspector();
  },
  onSelectMerc: (id) => select({ kind: 'merc', id }),
});
const mercsPanel = createMercsPanel($('#mercs'), {
  onSelect: (id) => select({ kind: 'merc', id }),
  onSelectItem: (id) => select({ kind: 'item', id }),
});
const lordPanel = createLordPanel($('#lord'), { onSelectTown: (id) => select({ kind: 'node', id }), onSelectLord: () => select({ kind: 'lord', id: 'lord' }) });
const tools = createToolsPanel($('#tools'), {
  getSim: () => sim,
  onChange() {
    renderMarkets(true);
    renderInspector();
  },
});

function newWorld(seed) {
  sim = new Simulation({ seed });
  renderT = sim.now;
  selected = null;
  highlight = null;
  chronicleCount = 0;
  lastMarketStamp = '';
  $('#chronicle-list').replaceChildren();
  $('#seed').value = String(seed);
  $('#hash-result').textContent = '';
  const url = new URL(location.href);
  url.searchParams.set('seed', String(seed));
  history.replaceState(null, '', url);
  tools.fill();
  renderInspector();
  renderRoutes();
  renderMarkets(true);
  moneyPanel.render(sim, true);
  housesPanel.render(sim);
  mercsPanel.render(sim);
  lordPanel.render(sim);
  playerPanel.render(sim);
}

// ── Time ─────────────────────────────────────────────────────────────────────

function setSpeed(s) {
  if (s > 0) lastSpeed = s;
  speed = s;
  for (const b of document.querySelectorAll('[data-speed]')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === s));
}

function jump(minutes) {
  renderT = Math.max(renderT, sim.now) + minutes;
  sim.advanceTo(Math.floor(renderT));
}

function toDawn() {
  const d = sim.cal.day(renderT) + (sim.cal.minuteOfDay(renderT) >= sim.cal.season(renderT).dawnMin ? 1 : 0);
  const dawn = d * 1440 + sim.cal.seasonOfDay(d).dawnMin;
  jump(dawn - renderT);
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  if (speed > 0) {
    // At night the roads are still; "skip quiet nights" runs the dark hours 20× faster
    // (raids, fireside news and anything else still happen, and show in the chronicle).
    const night = $('#fast-nights').checked && sim.cal.light(renderT) < 0.05 ? NIGHT_BOOST : 1;
    renderT += dt * speed * night * GAME_MINUTES_PER_SECOND;
    sim.advanceTo(Math.floor(renderT));
  }
  renderer.draw({ sim, t: renderT, selected, highlight, priceGood: $('#price-good').value || null });
  updateClock();
  updateChronicle();
  if (now - lastPanelUpdate > 250) {
    lastPanelUpdate = now;
    renderInspector();
    const hour = Math.floor(renderT / 60);
    if (hour !== lastRouteHour) {
      renderRoutes();
      opportunities.render(sim, { mode: currentMode() });
    }
    renderMarkets(false);
    moneyPanel.render(sim, false);
    housesPanel.render(sim);
    mercsPanel.render(sim);
    lordPanel.render(sim);
    playerPanel.render(sim);
  }
  requestAnimationFrame(frame);
}

function updateClock() {
  const f = sim.cal.format(Math.floor(renderT));
  $('#clock-date').textContent = `Day ${f.day} · ${f.date}`;
  $('#clock-time').textContent = f.time;
  const light = sim.cal.light(renderT);
  const sky = light > 0.95 ? 'Day' : light < 0.05 ? 'Night' : sim.cal.minuteOfDay(renderT) < 720 ? 'Dawn' : 'Dusk';
  $('#clock-sky').textContent = sky;
  $('#clock-sky').dataset.sky = sky.toLowerCase();
}

// ── Markets ──────────────────────────────────────────────────────────────────

// Re-render when the day turns, the log grows (lab tools, travellers' provisions
// show up as departures) or the selection changes. The chart only redraws on a
// new day or a new selection, so hovering it isn't interrupted.
function renderMarkets(force) {
  const day = sim.state.economy.history.days.at(-1) ?? -1;
  const stamp = `${day}|${sim.state.log.length}|${market.town}|${market.good}`;
  if (!force && stamp === lastMarketStamp) return;
  const chartToo = force || !lastMarketStamp.startsWith(`${day}|`) || !lastMarketStamp.endsWith(`|${market.town}|${market.good}`);
  lastMarketStamp = stamp;
  markets.render(sim, market, { chartToo });
}

// ── Chronicle ────────────────────────────────────────────────────────────────

function updateChronicle() {
  const log = sim.state.log;
  if (log.length === chronicleCount) return;
  const list = $('#chronicle-list');
  const frag = document.createDocumentFragment();
  for (let i = log.length - 1; i >= chronicleCount; i--) {
    const e = log[i];
    const li = document.createElement('li');
    const family = e.type.split(':')[0];
    li.className = `entry entry-${family}${e.lab ? ' entry-lab' : ''}`;
    li.dataset.kind = FAMILY_KIND[family] ?? 'town';
    li.innerHTML = `<time>${esc(sim.cal.format(e.t).stamp)}${e.lab ? ' <span class="tag">lab</span>' : ''}</time> ${esc(describe(e, sim))}`;
    frag.appendChild(li);
  }
  list.prepend(frag);
  chronicleCount = log.length;
  while (list.children.length > CHRONICLE_MAX) list.lastChild.remove();
}

// ── Inspector ────────────────────────────────────────────────────────────────

const dangerWord = (x) => (x < 0.05 ? 'low' : x < 0.15 ? 'moderate' : 'high');
const place = (id) => placeName(sim, id);
const road = (routes) => routesLabel(sim.graph, routes);

function renderInspector() {
  const body = $('#inspector-body');
  if (!selected) {
    body.innerHTML = '<p class="hint">Click a traveller or a place on the map.</p>';
    return;
  }
  if (body.matches(':hover') && body.querySelector('details[open]')) return; // don't yank a list someone is reading
  body.innerHTML =
    selected.kind === 'wayfarer' ? wayfarerHtml(selected.id)
      : selected.kind === 'merchant' ? merchantHtml(selected.id)
      : selected.kind === 'rider' ? riderHtml(selected.id)
      : selected.kind === 'band' ? bandHtml(selected.id)
      : selected.kind === 'merc' ? mercHtml(selected.id)
      : selected.kind === 'lord' ? lordHtml()
      : selected.kind === 'item' ? itemHtml(selected.id)
      : selected.kind === 'resident' ? residentHtml(selected.id)
        : nodeHtml(selected.id);
}

function wayfarerHtml(id) {
  const w = getWayfarer(sim, id);
  if (!w) return '';
  const temper = w.boldness > 700 ? 'bold' : w.boldness < 300 ? 'wary' : 'steady';
  const trip = w.trip;
  let status;
  if (!trip) {
    status = `Resting in <strong>${esc(place(w.at))}</strong>. Leaves ${esc(sim.cal.format(w.restingUntil).stamp)}.`;
  } else if (trip.waiting) {
    status = `Stuck at <strong>${esc(place(trip.at))}</strong>, bound for ${esc(place(trip.dest))}, waiting for the road to open.`;
  } else {
    const p = wayfarerPosition(sim, w, renderT);
    const doing = p.moving ? 'On the road' : 'Camped for the night';
    status = `${doing}: <strong>${esc(place(trip.from))} → ${esc(place(trip.dest))}</strong> by the ${esc(road(trip.routes))}. ` +
      `Next stop ${esc(place(trip.legTo))}, due ${esc(sim.cal.format(trip.legEnd).stamp)}.`;
  }
  let why = '';
  if (trip?.reason) {
    const rows = trip.reason.options.map((o, i) => `
      <tr class="${i === 0 ? 'chosen' : ''}">
        <td>${esc(road(o.routes))}${i === 0 ? ' <span class="tag">chosen</span>' : ''}</td>
        <td class="num">${o.hours}</td>
        <td class="num">${o.exposure.toFixed(2)}</td>
        <td class="num">${o.score}</td>
      </tr>`).join('');
    why = `
      <h4>Why this road?</h4>
      <div class="table-wrap"><table>
        <thead><tr><th>Road</th><th class="num">Hours</th><th class="num">Danger</th><th class="num">Score</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="formula">Score = hours × (1 + ${sim.data.wayfarers.dangerWeight} × danger × caution ${trip.reason.caution}). Lowest wins.</p>`;
  }
  const food = trip ? `<dt>Provisions</dt><dd>${qty(trip.provisions ?? 0)} sacks of grain${trip.provisions ? '' : ' <span class="bad">(none to be had)</span>'}</dd>` : '';
  return `
    <h3>${esc(w.name)} <span class="sub">the ${esc(tradeName(sim, w))}</span></h3>
    <p>${status}</p>
    <dl class="facts">
      <dt>Home</dt><dd>${esc(place(w.home))}</dd>
      <dt>Temper</dt><dd>${temper} (${w.boldness}/1000 bold)</dd>
      <dt>Pace</dt><dd>${w.speedKmh} km/h</dd>
      ${food}
      <dt>Purse</dt><dd>${moneyBits(balance(sim, `wayfarer:${w.id}`))}</dd>
      <dt>Journeys</dt><dd>${w.trips} finished, ${w.km} km walked</dd>
    </dl>
    ${why}`;
}

const temperWord = (b) => (b > 700 ? 'bold' : b < 300 ? 'wary' : 'steady');

// A house's character (step G+1), in words: what it is, and how it bends the house's judgement.
function characterText(m) {
  const kind = m.character?.kind;
  const def = kind ? sim.data.merchants.characters?.[kind] : null;
  if (!def) return null;
  const pct = (x) => `${Math.round(Math.abs(x - 1) * 100)}%`;
  const lower = (gid) => goodOf(sim, gid).name.toLowerCase();
  switch (kind) {
    case 'habit': {
      const fav = m.character.favourite;
      const keeps = fav ? `keeps to ${lower(fav.good)} for ${place(fav.to)}, and counts on ${pct(1 + def.favourite)} more from it` : 'no favourite trade yet (the first that pays will be it)';
      return `${def.name}: ${keeps}; expects ${pct(1 - def.unfamiliar)} less from goods it has never carried; reads the inn's board only every ${def.readEvery} days`;
    }
    case 'optimist': return `${def.name}: counts on ${pct(def.revenue)} more from every load, minds the road less and takes hearsay at its word`;
    case 'pessimist': return `${def.name}: expects ${pct(def.revenue)} less from every load, fears the road more, and doubts old news and hearsay`;
    case 'follower': return `${def.name}: counts on ${pct(1 + def.follow)} more from a trade others are said to have done well by lately`;
    case 'hoarder': return `${def.name}: never stakes more than ${Math.round(def.stake * 100)}% of the purse on one load, and spends little at home`;
    default: return def.name;
  }
}
const BIAS_WORD = { habit: 'the usual trade', unfamiliar: 'never carried it', 'heard it paid': 'heard it paid', optimism: 'optimism', pessimism: 'pessimism' };
const sourceWord = { seen: 'seen', board: 'posted board', post: 'letter', rumour: 'rumour' };
const ageWord = (d) => (d < 0.5 ? 'today' : d < 1.5 ? 'a day old' : `${Math.round(d)} days old`);
const goodUnits = (gid) => goodOf(sim, gid).units;

function tripStatus(trip, whoMoves) {
  if (trip.waiting) return `Stuck at <strong>${esc(place(trip.at))}</strong>, bound for ${esc(place(trip.dest))}, waiting for the road to open.`;
  const p = tripPosition(sim, trip, renderT);
  const where = p.node ? `at ${esc(place(p.node))}` : p.moving ? `on the ${esc(road(trip.routes))}` : 'camped by the road';
  return `${whoMoves} <strong>${esc(place(trip.from))} → ${esc(place(trip.dest))}</strong>, ${where}` +
    (trip.legSeg ? `; next stop ${esc(place(trip.legTo))}, due ${esc(sim.cal.format(trip.legEnd).stamp)}.` : '.');
}

function merchantHtml(id) {
  const m = getMerchant(sim, id);
  if (!m) return '';
  const cargo = Object.entries(m.cargo)[0];
  const load = cargo ? `${qty(cargo[1])} ${esc(goodUnits(cargo[0]))} of ${esc(goodOf(sim, cargo[0]).name.toLowerCase())}` : 'empty wagons';
  let status;
  if (!m.active) status = m.killed ? `Killed by outlaws ${esc(sim.cal.format(m.ruinedAt).stamp)}, no ransom paid. The house is ended.` : `Ruined ${esc(sim.cal.format(m.ruinedAt).stamp)}. The house is closed.`;
  else if (m.captive) status = `<span class="bad">Held for ransom</span> by ${esc(sim.state.raiders.bands[m.captive.band]?.name ?? 'outlaws')}: they want ${moneyBits(m.captive.ransom)} by ${esc(sim.cal.format(m.captive.deadline).stamp)}.`;
  else if (m.trip) status = tripStatus(m.trip, `Carrying ${load}:`);
  else status = cargo ? `In <strong>${esc(place(m.at))}</strong>, trying to sell ${load}.` : `In <strong>${esc(place(m.at))}</strong>, looking for a trade.`;

  // Why this trade: the candidates as last weighed, with their parts.
  let why = '';
  const r = m.reason;
  if (r) {
    const rows = r.candidates.map((c, i) => `
      <tr class="${i === r.choice ? 'chosen' : ''}">
        <td>${qty(c.qty)} ${esc(goodUnits(c.good))} of ${esc(goodOf(sim, c.good).name.toLowerCase())} to ${esc(place(c.to))}${i === r.choice ? ' <span class="tag">chosen</span>' : ''}${c.bias ? ` <span class="tag bias">${esc(BIAS_WORD[c.bias] ?? c.bias)}</span>` : ''}
          <br><span class="dim">${esc(sourceWord[c.source] ?? c.source)}, ${ageWord(c.ageDays)} · ${c.days.toFixed(1)} days on the road${c.inbound > 0 ? ` · heard of ${qty(c.inbound)} more on the way there` : ''}</span></td>
        <td class="num">${money(c.revenue)}</td>
        <td class="num">${money(c.cost)}</td>
        <td class="num">${money(c.costs)}</td>
        <td class="num">${money(c.risk)}</td>
        <td class="num">${money(c.perDay)}</td>
      </tr>`).join('');
    why = `
      <h4>Why this trade? <span class="sub">weighed in ${esc(place(r.at))}, ${esc(sim.cal.format(r.t).stamp)}</span></h4>
      ${rows ? `<div class="table-wrap"><table>
        <thead><tr><th>Trade</th><th class="num">Takings</th><th class="num">Buying</th><th class="num">Carrying</th><th class="num">Risk</th><th class="num">A day</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>` : ''}
      <p class="formula">Takings: what the load should fetch by their price list, with the market expected to recover by arrival and to hold whatever loads they've heard will get there first, no more than the town was said to have in coin, less a share for old news and hearsay${m.character ? ', bent by the house\'s character (tagged)' : ''}. Worth the road at ${m.threshold} marks a day for each loaded wagon.</p>
      ${r.note ? `<p>${esc(r.note)}.</p>` : ''}`;
  }

  // What they know: their price list for every market, next to the truth.
  const gid = cargo?.[0] ?? r?.candidates[0]?.good ?? 'grain';
  const g = goodOf(sim, gid);
  const known = economyIndex(sim.data).markets.map((sid) => {
    const b = belief(sim, m.id, sid, gid);
    const truth = quote(sim, sid, gid).price;
    if (!b) return `<tr><td>${esc(place(sid))}</td><td colspan="3" class="dim">no word</td></tr>`;
    const off = Math.abs(b.price - truth) > truth * 0.15;
    return `<tr><td>${esc(place(sid))}</td><td>${esc(sourceWord[b.source] ?? b.source)}, ${ageWord(b.ageDays)}</td>
      <td class="num">${money(b.price)}</td><td class="num${off ? ' warn' : ''}">${money(truth)}</td></tr>`;
  }).join('');
  const knows = `
    <h4>What they know <span class="sub">${esc(g.name.toLowerCase())}, a ${esc(g.unit)}</span></h4>
    <div class="table-wrap"><table>
      <thead><tr><th>Market</th><th>Word</th><th class="num">They think</th><th class="num">Truly</th></tr></thead>
      <tbody>${known}</tbody>
    </table></div>`;

  const ledger = m.ledger.slice(-6).reverse().map((v) => `
    <tr><td>${qty(v.qty)} ${esc(goodUnits(v.good))}, ${esc(place(v.from))} → ${esc(place(v.to))}${v.dumped ? ' <span class="dim">(let go)</span>' : ''}${v.beaten ? ' <span class="dim">(beaten to it)</span>' : ''}</td>
      <td class="num">${moneyBits(v.sold)}</td>
      <td class="num${v.profit < 0 ? ' bad' : ''}">${moneyBits(v.profit)}</td>
      <td class="num dim">${moneyBits(v.expected)}</td></tr>`).join('');
  const book = ledger ? `
    <h4>Ledger</h4>
    <div class="table-wrap"><table>
      <thead><tr><th>Venture</th><th class="num">Sold for</th><th class="num">Profit</th><th class="num">Hoped</th></tr></thead>
      <tbody>${ledger}</tbody>
    </table></div>` : '';

  return `
    <h3>${esc(m.name)} <span class="sub">house of ${esc(m.house)}, ${esc(place(m.home))}</span></h3>
    <p>${status}</p>
    <dl class="facts">
      <dt>Wagons</dt><dd>${m.wagons} (${m.capacity} units)</dd>
      <dt>Temper</dt><dd>${temperWord(m.boldness)} (${m.boldness}/1000 bold)</dd>
      ${characterText(m) ? `<dt>Character</dt><dd>${esc(characterText(m))}</dd>` : ''}
      <dt>Purse</dt><dd>${moneyBits(balance(sim, `merchant:${m.id}`))}</dd>
      <dt>Ventures</dt><dd>${m.trades}, ${m.losses} at a loss · ${moneyBits(m.profit)} profit</dd>
      <dt>Spent at home</dt><dd>${moneyBits(m.spent)}${m.loaned ? ` · "lent" the lord ${moneyBits(m.loaned)}` : ''}</dd>
      ${m.wasWayfarer ? '<dt>Began as</dt><dd>a peddler on the roads</dd>' : ''}
      ${m.orders ? `<dt>Orders</dt><dd>${esc(ORDER_TEXT[m.orders.threatened])}${m.orders.outnumbered ? `; give way to a band ${m.orders.outnumbered}× their strength` : ''}; running, ${m.orders.cargo === 'drop' ? 'cut the load loose' : 'hold on to the load'}; ${m.orders.night === 'watch' ? 'a double watch at night' : 'a single watch at night'}${m.ordersChanged ? ` <span class="dim">(changed ${esc(sim.cal.format(m.ordersChanged.t).stamp)}: ${esc(m.ordersChanged.why)})</span>` : ''}</dd>` : ''}
      ${m.trip?.guards?.length ? `<dt>Guards</dt><dd>${m.trip.guards.map((gid) => `<button class="linkish" data-merc="${esc(gid)}">${esc(mercName(sim, gid))}</button>`).join(', ')}</dd>` : ''}
    </dl>
    ${why}${knows}${book}`;
}

const ORDER_TEXT = { fight: 'refuse a toll and stand if attacked', toll: 'pay a toll if asked; stand if attacked', flee: 'run from any band' };

// ── Lord Aldric on the road (step F) ───────────────────────────────────────

function lordHtml() {
  const st = sim.state.lord;
  if (!st) return '';
  const cfg = sim.data.lord.travel;
  const where = st.captive ? `<span class="bad">Held for ransom</span> by ${esc(getBand(sim, st.captive.band)?.name ?? 'outlaws')}: they want ${moneyBits(st.captive.ransom)}.`
    : !st.away ? `At home in <strong>${esc(place(st.seat))}</strong>.`
      : st.away.phase === 'staying' ? `At <strong>${esc(place(st.at))}</strong>, leaving ${esc(sim.cal.format(st.away.until).stamp)}.`
        : st.trip ? tripStatus(st.trip, st.away.phase === 'home' ? 'Riding home:' : 'Riding out:') : 'On the road.';
  const escort = (st.trip?.guards ?? []).map((gid) => `<button class="linkish" data-merc="${esc(gid)}">${esc(mercName(sim, gid))}</button>`).join(', ');
  const heard = economyIndex(sim.data).markets.filter((sid) => !sim.graph.nodes.get(sid).outside).map((sid) => {
    const rec = sim.state.knowledge?.holders.lord?.[sid];
    const truth = sim.state.economy.hunger[sid] ?? 0;
    if (!rec) return `<tr><td>${esc(place(sid))}</td><td colspan="3" class="dim">no word</td></tr>`;
    const age = (sim.now - rec.t) / 1440;
    const off = Math.abs((rec.hunger ?? 0) - truth) >= 0.15;
    return `<tr><td>${esc(place(sid))}</td><td>${esc(sourceWord[rec.source] ?? rec.source)}, ${ageWord(age)}</td>
      <td class="num">${pct(rec.hunger ?? 0)}</td><td class="num${off ? ' warn' : ''}">${pct(truth)}</td></tr>`;
  }).join('');
  const tr = st.tripReason;
  const trips = tr?.options.map((o, i) => `<tr class="${i === tr.choice ? 'chosen' : ''}"><td>${esc(TRIP_WORD[o.trip])} ${esc(place(o.at))}${i === tr.choice ? ' <span class="tag">went</span>' : ''}<br><span class="dim">${esc(o.why)}</span></td><td class="num">${o.score.toFixed(2)}</td></tr>`).join('') ?? '';
  const b = st.bounty && st.bounty.until > sim.now ? st.bounty : null;
  return `
    <h3>Lord ${esc(st.name)} <span class="sub">of ${esc(place(st.seat))}</span></h3>
    <p>${where}</p>
    <dl class="facts">
      ${st.away ? `<dt>Why</dt><dd>${esc(st.away.why)}</dd>` : ''}
      ${st.trip ? `<dt>Party</dt><dd>${st.trip.crew} of his household${escort ? `; sellswords ${escort}` : ''}</dd>` : ''}
      ${(st.hurtUntil ?? 0) > sim.now ? `<dt>Abed</dt><dd>after a fall, until ${esc(sim.cal.format(st.hurtUntil).stamp)}</dd>` : ''}
      ${b ? `<dt>Bounty</dt><dd>${b.perHead} marks a head on ${esc(getBand(sim, b.band)?.name ?? 'a band')} until ${esc(sim.cal.format(b.until).stamp)} · ${b.heads} paid for</dd>` : ''}
      <dt>Last trip</dt><dd>${st.lastTrip > 0 ? esc(sim.cal.format(st.lastTrip).stamp) : 'not yet'}; he rides out at most every ${cfg.everyDays} days</dd>
    </dl>
    <h4>What he has heard <span class="sub">hunger, by letter and hearsay, beside the truth</span></h4>
    <div class="table-wrap"><table><thead><tr><th>Town</th><th>Word</th><th class="num">He thinks</th><th class="num">Truly</th></tr></thead><tbody>${heard}</tbody></table></div>
    ${trips ? `<h4>Trips he weighed <span class="sub">${esc(sim.cal.format(tr.t).stamp)}</span></h4>
      <div class="table-wrap"><table><thead><tr><th>Trip</th><th class="num">Score</th></tr></thead><tbody>${trips}</tbody></table></div>
      <p class="formula">A trip is weighed apart from his spending: stale or worrying news, his pride, his anger. At ${cfg.minScore} or more, he goes about half the time.</p>` : ''}`;
}
const TRIP_WORD = { tour: 'See', hunt: 'Hunt at', ships: 'The ships at', ride: 'Ride with the patrol to' };

// ── Sellswords and their gear ────────────────────────────────────────────────

const STAT_NAMES = { str: 'Strength', agi: 'Agility', dis: 'Discipline', awa: 'Awareness', nerve: 'Nerve' };
const TRAIT_ABOUT = {
  forestwise: 'fights better in the forest, and sees ambushes there sooner',
  hillwise: 'fights better on hill paths, and sees ambushes there sooner',
  fenwise: 'fights better in the fens, and sees ambushes there sooner',
  ambush: 'not shaken by surprise',
  night: 'no worse in the dark',
  bandits: 'a little better against outlaws',
  pair: 'better beside their partner',
  scarred: 'a little slower, a lot harder to kill',
};
const HOLDER = (h) => h.kind === 'merc' ? `carried by <button class="linkish" data-merc="${esc(h.id)}">${esc(mercName(sim, h.id))}</button>`
  : h.kind === 'band' ? `<span class="bad">in the hands of ${esc(sim.state.raiders.bands[h.id]?.name ?? 'outlaws')}</span>`
    : h.kind === 'rack' ? `for sale on a rack in ${esc(place(h.at))}`
      : h.kind === 'wagon' ? "on a caravan's wagons" : 'lost';

// Which inns tell stories of someone (a sellsword or a band).
function fameWhere(id) {
  const inns = economyIndex(sim.data).markets.filter((sid) => sim.state.knowledge?.holders[`inn:${sid}`]?.[`fame:${id}`]);
  return inns.length ? ` · told of at the inns of ${esc(inns.map((sid) => place(sid)).join(', '))}` : ' · <span class="dim">nobody tells stories of them yet</span>';
}

function mercHtml(id) {
  const g = getMerc(sim, id);
  if (!g) return '';
  const cfg = sim.data.mercs;
  const next = cfg.ranks[g.rank + 1];
  const top = cfg.stats.filter((s) => g.stats[s] < cfg.maxStat).sort((a, b) => g.growth[b] - g.growth[a])[0];
  const stats = cfg.stats.map((s) => `<tr><td>${STAT_NAMES[s]}</td><td class="num">${g.stats[s]}</td>
    <td class="num dim">${g.growth[s].toFixed(1)}${s === top && g.growth[s] > 0 ? ' <span class="tag">next</span>' : ''}</td></tr>`).join('');
  const gear = ['weapon', 'armour', 'shield', 'charm'].map((slot) => {
    const item = itemById(sim, g.gear[slot]);
    if (!item) return `<tr><td>${slot}</td><td colspan="3" class="dim">none</td></tr>`;
    return `<tr><td>${slot}</td><td>${itemButton(sim, item)}</td><td>${esc(tierOf(sim, item).name)}</td>
      <td class="num">${item.type === 'charm' ? `repute ${item.repute >= 0 ? '+' : ''}${item.repute.toFixed(2)}` : `${Math.round(item.cond * 100)}%`}</td></tr>`;
  }).join('');
  const L = g.ledger;
  const terrains = ['road', 'forest', 'hills', 'marsh'].map((t) => `${t} ${Math.round(L.km[t] ?? 0)} km${L.fightsIn[t] ? ` (${L.fightsIn[t]} fights)` : ''}`).join(' · ');
  const companions = Object.entries(L.with).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([o, n]) => `<button class="linkish" data-merc="${esc(o)}">${esc(mercName(sim, o))}</button> ${n}${g.pairs.includes(o) ? ' <span class="tag">trusted</span>' : ''}`).join(', ');
  const traits = g.traits.map((t) => `<li><strong>${esc(cfg.traits[t]?.name ?? t)}</strong> <span class="dim">${esc(TRAIT_ABOUT[t] ?? '')}</span></li>`).join('');
  const history = g.history.slice(-8).reverse().map((h) => {
    const when = esc(sim.cal.format(h.t).stamp);
    const text = h.type === 'rank' ? `rose to ${cfg.ranks[h.rank].name}${h.stat ? ` (+1 ${STAT_NAMES[h.stat].toLowerCase()})` : ''}`
      : h.type === 'trait' ? `became ${cfg.traits[h.trait]?.name ?? h.trait}${h.with ? ` with ${mercName(sim, h.with)}` : ''}`
        : h.type === 'bought' ? `bought ${itemLabel(sim, itemById(sim, h.item), { owner: false })}`
          : h.type === 'sold' ? `sold ${itemLabel(sim, itemById(sim, h.item), { owner: false })}`
            : `${h.fought ? (h.outcome === 'fought off' ? 'won a fight' : 'lost a fight') : h.outcome === 'toll' ? 'paid a toll' : 'met outlaws'} on the ${road([sim.graph.segments.get(h.seg).route])}${h.kills ? ', killed one' : ''}${h.hurt ? `, ${h.hurt}` : ''}`;
    return `<li><time>${when}</time> ${esc(text)}</li>`;
  }).join('');
  const power = guardPower(sim, g, { terrain: 'road' }).power;
  return `
    <h3>${esc(mercName(sim, g.id))} <span class="sub">${esc(rankOf(sim, g).name)} sellsword of ${esc(place(g.home))}</span></h3>
    <p>${mercDoing(sim, g)}.</p>
    <dl class="facts">
      <dt>Wage</dt><dd>${wageOf(sim, g)} marks a day · earned ${moneyBits(g.earned)} all told · purse ${moneyBits(balance(sim, `merc:${g.id}`))}</dd>
      <dt>Strength</dt><dd>${power.toFixed(2)} in a fight on an open road <span class="dim">(a carter counts 1)</span></dd>
      <dt>Fame</dt><dd>${(g.fame ?? 0).toFixed(0)}${fameWhere(g.id)}</dd>
      <dt>Deeds</dt><dd>${g.deeds.toFixed(1)}${next ? ` of ${next.deeds} for ${esc(next.name)}` : ' (as high as it goes)'}</dd>
      <dt>Fights</dt><dd>${L.fights} (${L.won} won, ${L.lost} lost) of ${L.encounters} run-ins · ${L.kills} killed · ${L.wounds} wounds${L.severe ? ` (${L.severe} bad)` : ''} · ${L.ambushes} ambushes · ${L.nights} at night · ${L.stared ?? 0} stared down</dd>
      <dt>Roads</dt><dd>${terrains}</dd>
      ${companions ? `<dt>Beside</dt><dd>${companions}</dd>` : ''}
      <dt>Favours</dt><dd>the ${esc(cfg.gear[g.favours]?.name ?? g.favours)}</dd>
    </dl>
    ${traits ? `<h4>Traits</h4><ul class="plain">${traits}</ul>` : ''}
    <h4>Stats <span class="sub">and what their deeds have trained since the last rank</span></h4>
    <div class="table-wrap"><table><thead><tr><th>Stat</th><th class="num">Now</th><th class="num">Trained</th></tr></thead><tbody>${stats}</tbody></table></div>
    <p class="formula">A rank comes from deeds (a fight survived 2–3, a kill 1, a band stared down 0.3). It raises the stat trained most, by one.</p>
    <h4>Gear</h4>
    <div class="table-wrap"><table><thead><tr><th>Slot</th><th>Piece</th><th>Tier</th><th class="num">State</th></tr></thead><tbody>${gear}</tbody></table></div>
    ${history ? `<h4>Lately</h4><ul class="plain">${history}</ul>` : ''}`;
}

function itemHtml(id) {
  const item = itemById(sim, id);
  if (!item) return '';
  const cfg = sim.data.mercs;
  const tier = tierOf(sim, item);
  const next = cfg.item.tiers[item.tier + 1];
  const owners = item.owners.map((rid) => esc(sim.state.residents.byId[rid]?.name ?? rid)).join(' → ');
  const roads = Object.entries(item.roads).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${esc(road([r]))} ${n}`).join(' · ');
  const d = item.deeds;
  const kind = item.type === 'charm' ? item.charm : cfg.gear[item.type].name;
  return `
    <h3>${esc(item.name ?? kind)} <span class="sub">${item.name ? `${esc(kind)}, ` : ''}${esc(tier.name)}</span></h3>
    <p>${HOLDER(item.holder)}.</p>
    <dl class="facts">
      ${item.type === 'charm' ? `<dt>Repute</dt><dd>${item.repute >= 0 ? '+' : ''}${item.repute.toFixed(2)}: ${item.repute >= 0.3 ? 'said to be lucky' : item.repute <= -0.3 ? 'said to be cursed' : 'nobody says much about it'}</dd>
        <dt>Truly</dt><dd>${item.relic ? '<strong>a true relic</strong> <span class="dim">(only the lab knows)</span>' : 'a keepsake; it works as far as its wearer believes'}</dd>`
        : `<dt>Record</dt><dd>${item.xp.toFixed(1)}${next ? ` of ${next.xp} for ${esc(next.name)}${next.owners ? ` (and ${next.owners} owners)` : ''}` : ''} · edge +${tier.bonus.toFixed(2)}</dd>
        <dt>State</dt><dd>${cfg.gear[item.type].wear ? `${Math.round(item.cond * 100)}%` : 'does not wear'}</dd>`}
      <dt>Lived through</dt><dd>${d.fights} fights (${d.won} won) · ${d.kills} killed · ${d.turned} blows turned · ${d.nights} at night · ${d.deaths} owners died with it</dd>
      ${item.statuses.length ? `<dt>Known as</dt><dd>${esc(item.statuses.join(', '))}</dd>` : ''}
      ${roads ? `<dt>Where</dt><dd>${roads}</dd>` : ''}
      <dt>Made</dt><dd>${item.madeAt ? `in ${esc(place(item.madeAt))}` : 'nobody remembers where'}${item.maker ? ` by ${esc(sim.state.residents.byId[item.maker]?.name ?? '')}` : ''}, ${esc(sim.cal.format(item.made).stamp)}</dd>
      ${owners ? `<dt>Owners</dt><dd>${owners}</dd>` : ''}
    </dl>
    <p class="formula">Gear earns its record slowly: a fight 1, a win 1, a kill 1.5, a blow turned 1. Tiers at ${cfg.item.tiers.slice(1).map((t) => `${t.xp} (${t.name})`).join(', ')}; named at ${cfg.item.tiers[cfg.item.nameAt].name}.</p>`;
}

const cruelWord = (c) => (c >= 650 ? 'merciless' : c >= 400 ? 'hard' : 'soft for an outlaw');
const hungerWord = (h) => (h >= 0.5 ? 'starving' : h >= 0.25 ? 'hungry' : 'fed');

function bandHtml(id) {
  const b = getBand(sim, id);
  if (!b) return '';
  const cfg = sim.data.raiders;
  const hideout = cfg.hideouts.find((h) => h.id === b.hideout);
  const leader = sim.state.residents.byId[b.leader];
  const members = b.members.map((rid) => {
    const r = sim.state.residents.byId[rid];
    const from = r.from ? `${professionName(sim, r.was ?? 'labourer')} from ${place(r.from)}` : 'a stranger';
    return `<li>${esc(r.name)}${rid === b.leader ? ' <span class="tag">leader</span>' : ''} <span class="dim">${esc(from)}</span></li>`;
  }).join('');
  const loot = Object.entries(b.loot).filter(([, q]) => q > 0.05).map(([gid, q]) => `${qty(q)} ${esc(goodUnits(gid))} of ${esc(goodOf(sim, gid).name.toLowerCase())}`).join(', ');
  const cache = (sim.state.raiders.hoards ?? []).filter((h) => h.band === b.id).reduce((a, h) => a + h.bits, 0);
  const captives = b.captives.map((mid) => `<button class="linkish" data-merchant="${esc(mid)}">${esc(getMerchant(sim, mid).name)}</button>`).join(', ');
  const why = b.reason ? b.reason.options.map((o) => `
    <tr class="${o.seg === b.reason.choice ? 'chosen' : ''}"><td>${esc(road([sim.graph.segments.get(o.seg).route]))} <span class="dim">${esc(place(sim.graph.segments.get(o.seg).a))}–${esc(place(sim.graph.segments.get(o.seg).b))}</span>${o.seg === b.reason.choice ? ' <span class="tag">watching</span>' : ''}</td>
    <td class="num">${money(o.take)}</td><td class="num">${o.fear.toFixed(2)}</td><td class="num">${o.score.toFixed(0)}</td></tr>`).join('') : '';
  const lately = sim.state.log.filter((e) => e.type.startsWith('raid:') && e.band === b.id).slice(-5).reverse()
    .map((e) => `<li><time>${esc(sim.cal.format(e.t).stamp)}</time> ${esc(describe(e, sim))}</li>`).join('');
  // Nerve (step G+3): the worst odds they'd take against a guarded caravan with a middling load.
  const N = cfg.nerve;
  const nerve = b.active ? nerveOf(sim, b, { kind: 'merchant', guards: [{}] }, 300) : null;
  const temper = b.active ? [b.pride >= N.proudAbove ? 'a proud leader, out to make a name' : 'a careful leader', (b.shaken ?? 0) >= 0.3 ? 'shaken by a beating' : null].filter(Boolean).join('; ') : '';
  // What the towns say of them.
  const talk = economyIndex(sim.data).markets.map((sid) => {
    const rec = sim.state.knowledge?.holders[`inn:${sid}`]?.[`band:${b.hideout}`];
    return rec ? `<li>${esc(place(sid))}: ${esc(bandTalk(rec))} <span class="dim">(${esc(sourceWord[rec.source] ?? rec.source)}, ${ageWord((sim.now - rec.t) / 1440)})</span></li>` : '';
  }).join('');
  return `
    <h3>${esc(b.name)} <span class="sub">${b.active ? `at ${esc(hideout.name)}` : 'broken up'}</span></h3>
    <p>${b.active ? `${b.members.length} outlaws${leader ? `, led by ${esc(leader.name)}` : ''}, ${cruelWord(b.cruelty)}, and ${hungerWord(b.hunger)}.` : `Gone since ${esc(sim.cal.format(b.ended).stamp)}.`}</p>
    <dl class="facts">
      <dt>Food</dt><dd>${qty(b.food + (b.loot.grain ?? 0))} sacks in the hideout, and what they hunt</dd>
      <dt>Purse</dt><dd>${moneyBits(balance(sim, `band:${b.id}`))}${cache ? ` · <span class="dim">${moneyBits(cache)} buried (only the lab knows)</span>` : ''}</dd>
      <dt>Loot</dt><dd>${loot || 'nothing waiting for the fence'} · fenced in ${esc(place(hideout.fence))}</dd>
      ${captives ? `<dt>Holding</dt><dd>${captives}</dd>` : ''}
      ${b.active ? `<dt>Nerve</dt><dd>${esc(temper)} · against guards they'd risk a ${pct(nerve.max)} chance of being beaten off${nerve.why.length ? ` <span class="dim">(${esc(nerve.why.join(', '))})</span>` : ''}</dd>` : ''}
      <dt>Record</dt><dd>${b.raids} raids · ${b.lost} of their own dead · ${b.killed} travellers killed</dd>
      <dt>Infamy</dt><dd>${(b.infamy ?? 0).toFixed(0)}${fameWhere(b.id)}</dd>
      ${b.gear?.length ? `<dt>Arms</dt><dd>${b.gear.map((iid) => itemButton(sim, itemById(sim, iid))).join(' ')} <span class="dim">(taken from the road)</span></dd>` : ''}
      ${sim.state.lord?.bounty?.band === b.id && sim.state.lord.bounty.until > sim.now ? `<dt>Bounty</dt><dd class="bad">${sim.state.lord.bounty.perHead} marks a head, from Lord Aldric</dd>` : ''}
      ${b.lordHeld ? '<dt>Holding</dt><dd class="bad">Lord Aldric himself</dd>' : ''}
    </dl>
    ${members ? `<h4>Who they are</h4><ul class="plain">${members}</ul>` : ''}
    ${why ? `<h4>Why this road? <span class="sub">what the lookouts have seen pass lately, and the blood it cost</span></h4>
      <div class="table-wrap"><table><thead><tr><th>Road</th><th class="num">Seen passing</th><th class="num">Fear</th><th class="num">Score</th></tr></thead><tbody>${why}</tbody></table></div>` : ''}
    ${talk ? `<h4>What the towns say of them</h4><ul class="plain">${talk}</ul>` : ''}
    ${lately ? `<h4>Lately</h4><ul class="plain">${lately}</ul>` : ''}`;
}

function riderHtml(id) {
  const r = getRider(sim, id);
  if (!r) return '';
  const circuit = sim.data.post.circuit.map((sid) => place(sid)).join(' → ');
  const status = r.trip ? tripStatus(r.trip, 'Riding') : `Resting in <strong>${esc(place(r.at))}</strong>.`;
  return `
    <h3>${esc(r.name)} <span class="sub">rider of the lord's post</span></h3>
    <p>${status}</p>
    <dl class="facts">
      <dt>Circuit</dt><dd>${esc(circuit)}</dd>
      <dt>Deliveries</dt><dd>${r.deliveries}</dd>
    </dl>
    <p class="hint">Riders carry every town's posted prices to the next inn as letters: exact, but as old as the ride.</p>`;
}

const skillWord = (r) => (r.learning ? 'apprentice, learning' : r.skill >= 1000 ? 'master' : r.skill >= 850 ? 'able' : 'middling');

function residentHtml(id) {
  const r = getResident(sim, id);
  if (!r) return '';
  const fate = r.alive ? 'Alive' : `Died ${esc(sim.cal.format(r.diedAt).stamp)}${r.cause === 'lab' ? ' (struck down by the experimenter)' : ''}`;
  return `
    <h3>${esc(r.name)} <span class="sub">${esc(professionName(sim, r.profession))} of ${esc(place(r.home))}</span></h3>
    <dl class="facts">
      <dt>Skill</dt><dd>${skillWord(r)} (${r.skill}/1000)</dd>
      <dt>Status</dt><dd>${fate}</dd>
    </dl>
    <p class="hint">Step I gives residents homes and daily schedules. For now they work, eat, and take up trades when others die.</p>
    <p><button class="linkish" data-node="${esc(r.home)}">Back to ${esc(place(r.home))}</button></p>`;
}

function nodeHtml(id) {
  const n = sim.graph.nodes.get(id);
  const season = sim.cal.season(Math.floor(renderT));
  const roads = sim.graph.adj.get(id).map(({ seg, to }) => {
    const s = sim.graph.segments.get(seg);
    const c = segmentConditions(sim.graph, seg, season.id);
    const state = c.closed ? `<span class="bad">${esc(c.note ?? 'closed')}</span>` : c.note ? `<span class="warn">${esc(c.note)}</span>` : 'open';
    return `<li>${esc(sim.graph.routes.get(s.route).name)} to ${esc(place(to))}, ${s.km} km: ${state}</li>`;
  }).join('');
  const here = sim.state.wayfarers.order
    .map((wid) => sim.state.wayfarers.byId[wid])
    .filter((w) => w.at === id || (w.trip && !w.trip.legSeg && w.trip.at === id))
    .map((w) => `<button class="linkish" data-wayfarer="${esc(w.id)}">${esc(w.name)}</button>`)
    .concat(Object.values(sim.state.merchants?.byId ?? {})
      .filter((m) => m.active && (m.at === id || (m.trip && !m.trip.legSeg && m.trip.at === id)))
      .map((m) => `<button class="linkish" data-merchant="${esc(m.id)}">${esc(m.name)}</button> <span class="dim">(merchant)</span>`))
    .join(', ');
  const kind = { town: 'Town', village: 'Village', port: 'Port (the Outside)', waypoint: 'Waypoint' }[n.kind];
  const toll = n.toll ? `<dt>Toll</dt><dd>${n.toll.wagon} per wagon, ${n.toll.foot} on foot</dd>` : '';
  let people = '';
  if (n.kind !== 'waypoint') {
    const folk = residentsAt(sim, id);
    const byTrade = new Map();
    for (const r of folk) {
      if (!byTrade.has(r.profession)) byTrade.set(r.profession, []);
      byTrade.get(r.profession).push(r);
    }
    const hunger = sim.state.economy.hunger[id];
    const economyFacts = economyIndex(sim.data).isOutside(id) ? '' : `
      <dt>Hunger</dt><dd>${hunger >= 0.6 ? '<span class="bad">famine</span>' : hunger >= 0.25 ? '<span class="bad">hungry</span>' : hunger >= 0.1 ? 'lean' : 'well fed'} (${pct(hunger)})</dd>
      <dt>Tools</dt><dd>${pct(toolFactor(sim, id))} of full strength</dd>
      <dt>Coin</dt><dd>${moneyBits(balance(sim, `purse:${id}`))} in households, ${moneyBits(balance(sim, `till:${id}`))} in the traders' till</dd>`;
    const vacancies = sim.state.residents.vacancies.filter((v) => v.at === id);
    const lists = [...byTrade].map(([pid, list]) => `
      <details><summary>${list.length} ${esc(professionName(sim, pid, list.length !== 1))}</summary>
        <p>${list.map((r) => `<button class="linkish" data-resident="${esc(r.id)}">${esc(r.name)}</button>${r.learning ? ' <span class="dim">(apprentice)</span>' : ''}`).join(', ')}</p>
      </details>`).join('');
    people = `
      <dl class="facts">
        <dt>Residents</dt><dd>${folk.length}</dd>${economyFacts}
        ${vacancies.length ? `<dt>Vacant</dt><dd>${vacancies.map((v) => esc(professionName(sim, v.profession))).join(', ')}</dd>` : ''}
      </dl>
      <h4>People</h4>
      <div class="people">${lists}</div>
      <p><button class="linkish" data-market="${esc(id)}">Open ${esc(n.name)}'s market board</button></p>`;
  }
  return `
    <h3>${esc(n.name)} <span class="sub">${kind}</span></h3>
    <p>${esc(n.blurb ?? '')}</p>
    ${toll ? `<dl class="facts">${toll}</dl>` : ''}
    ${people}
    <h4>Roads, this ${esc(season.name.toLowerCase())}</h4>
    <ul class="roads">${roads}</ul>
    <h4>Travellers here</h4>
    <p>${here || '<span class="hint">Nobody at the moment.</span>'}</p>`;
}

// ── Route explorer ───────────────────────────────────────────────────────────

const currentMode = () => MODES.find((m) => m.id === $('#route-mode').value) ?? MODES[0];

function renderRoutes() {
  lastRouteHour = Math.floor(renderT / 60);
  const from = $('#route-from').value;
  const to = $('#route-to').value;
  const mode = currentMode();
  const tbody = $('#route-table tbody');
  if (!from || from === to) {
    tbody.innerHTML = '<tr><td colspan="5" class="hint">Pick two different places.</td></tr>';
    return;
  }
  const depart = Math.max(sim.now, Math.floor(renderT));
  const opts = routeOptions(sim.graph, sim.cal, from, to, depart, mode.kmh);
  tbody.innerHTML = opts.map((o, i) => {
    const e = o.estimate;
    const time = e.blocked ? `<span class="bad">${esc(e.blocked.note ?? 'closed')}</span>` : esc(formatDuration(e.elapsed));
    const arrive = e.blocked ? '' : esc(sim.cal.format(e.arrival).stamp);
    const notes = e.blocked ? '' : [...new Set(e.legs.map((l) => l.note).filter(Boolean))].map((n) => `<span class="warn">${esc(n)}</span>`).join(' ');
    const pinned = highlight?.pinned && highlight.key === o.path.join() ? ' pinned' : '';
    return `<tr data-i="${i}" class="${e.blocked ? 'blocked' : ''}${pinned}">
      <td>${esc(o.label)} ${notes}</td>
      <td class="num">${o.km}</td>
      <td>${time}</td>
      <td>${arrive}</td>
      <td>${dangerWord(o.exposure)} <span class="dim">${o.exposure.toFixed(2)}</span></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('tr[data-i]').forEach((tr) => {
    const o = opts[Number(tr.dataset.i)];
    const key = o.path.join();
    tr.addEventListener('mouseenter', () => { if (!highlight?.pinned) highlight = { path: o.path, key, pinned: false }; });
    tr.addEventListener('mouseleave', () => { if (!highlight?.pinned) highlight = null; });
    tr.addEventListener('click', () => {
      highlight = highlight?.pinned && highlight.key === key ? null : { path: o.path, key, pinned: true };
      tbody.querySelectorAll('tr').forEach((r) => r.classList.toggle('pinned', Boolean(highlight?.pinned) && r === tr));
    });
  });
}

function fillSelects() {
  const options = sim.graph.settlements.map((id) => `<option value="${id}">${esc(place(id))}</option>`).join('');
  $('#route-from').innerHTML = options;
  $('#route-to').innerHTML = options;
  $('#route-from').value = 'kingscross';
  $('#route-to').value = 'copperford';
  $('#route-mode').innerHTML = MODES.map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join('');
  $('#price-good').innerHTML = '<option value="">none</option>' +
    economyIndex(sim.data).goodIds.map((gid) => `<option value="${gid}">${esc(goodOf(sim, gid).name)}</option>`).join('');
  $('#price-good').value = market.good;
}

// ── Determinism check ────────────────────────────────────────────────────────

async function loadReference() {
  try {
    const res = await fetch('reference.json', { cache: 'no-store' });
    if (res.ok) reference = await res.json();
  } catch {
    reference = null;
  }
}

function runCheck() {
  const seed = parseSeed($('#seed').value);
  const days = 100;
  const t0 = performance.now();
  const check = new Simulation({ seed });
  check.runDays(days);
  const ms = performance.now() - t0;
  const hash = check.hash();
  let verdict = '';
  if (reference && reference.seed === seed && reference.days === days) {
    verdict = hash === reference.hash
      ? `<p class="good">✓ Identical to the Node.js reference run (${esc(reference.hash)}). Same seed, same world, in your browser and on the server.</p>`
      : `<p class="bad">✗ Differs from the Node.js reference (${esc(reference.hash)}). Determinism is broken on this browser, or the reference is stale.</p>`;
  } else if (reference) {
    verdict = `<p class="hint">The Node.js reference is for seed ${esc(reference.seed)}. Run seed ${esc(reference.seed)} to compare engines.</p>`;
  }
  $('#check-result').innerHTML = `
    <p>Seed ${esc(seed)}: ${days} days (${check.state.tick.toLocaleString('en')} ticks, ${check.state.log.length} chronicle entries) in <strong>${ms.toFixed(0)} ms</strong>.</p>
    <p>State hash <code>${hash}</code></p>${verdict}`;
}

// ── Wiring ───────────────────────────────────────────────────────────────────

function select(target) {
  selected = target;
  if (target?.kind === 'node' && economyIndex(sim.data).markets.includes(target.id)) {
    market = { ...market, town: target.id };
    tools.setTown(target.id);
    renderMarkets(true);
  }
  renderInspector();
}

canvas.addEventListener('click', (ev) => {
  const r = canvas.getBoundingClientRect();
  const hit = renderer.hitTest(ev.clientX - r.left, ev.clientY - r.top);
  select(hit ? { kind: hit.kind, id: hit.id } : null);
});
const tip = document.createElement('div');
tip.className = 'map-tip';
tip.hidden = true;
canvas.parentElement.appendChild(tip);

canvas.addEventListener('mousemove', (ev) => {
  const r = canvas.getBoundingClientRect();
  const x = ev.clientX - r.left;
  const y = ev.clientY - r.top;
  canvas.style.cursor = renderer.hitTest(x, y) ? 'pointer' : 'default';
  const html = tipHtml(renderer.describeAt(x, y));
  if (!html) {
    tip.hidden = true;
    return;
  }
  tip.innerHTML = html;
  tip.hidden = false;
  // Keep the tip inside the map: flip left or up near the edges.
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  tip.style.left = `${x + 14 + w > r.width ? x - 14 - w : x + 14}px`;
  tip.style.top = `${y + 14 + h > r.height ? y - 10 - h : y + 14}px`;
});
canvas.addEventListener('mouseleave', () => { tip.hidden = true; });

// What the pointer is over, in a sentence or two.
function tipHtml(hit) {
  if (!hit) return null;
  const season = sim.cal.season(Math.floor(renderT));
  if (hit.kind === 'wayfarer') {
    const w = getWayfarer(sim, hit.id);
    const t = w.trip;
    const doing = !t ? `resting in ${place(w.at)}`
      : t.waiting ? `stuck at ${place(t.at)}, waiting for the road to open`
        : wayfarerPosition(sim, w, renderT).moving ? `on the ${road(t.routes)} to ${place(t.dest)}` : `camped on the way to ${place(t.dest)}`;
    return `<strong>${esc(w.name)}</strong><p>The ${esc(tradeName(sim, w))}, ${esc(doing)}.</p><p class="dim">Click for why they chose this road.</p>`;
  }
  if (hit.kind === 'merchant') {
    const m = getMerchant(sim, hit.id);
    const cargo = Object.entries(m.cargo)[0];
    const load = cargo ? `${qty(cargo[1])} ${goodUnits(cargo[0])} of ${goodOf(sim, cargo[0]).name.toLowerCase()}` : 'empty wagons';
    const doing = m.captive ? 'held for ransom' : m.trip ? `${load}, bound for ${place(m.trip.dest)}` : cargo ? `selling ${load} in ${place(m.at)}` : `in ${place(m.at)}, looking for a trade`;
    return `<strong>${esc(m.name)}</strong><p>Merchant, ${m.wagons} wagon${m.wagons > 1 ? 's' : ''}: ${esc(doing)}.</p><p class="dim">Click for what they know and why this trade.</p>`;
  }
  if (hit.kind === 'lord') {
    const st = sim.state.lord;
    const doing = st.away?.phase === 'staying' ? `at ${place(st.at)}` : st.away?.phase === 'home' ? 'riding home to Kingscross' : `riding for ${place(st.away?.target)}`;
    return `<strong>Lord ${esc(st.name)}</strong><p>With his household${st.trip?.guards?.length ? ` and ${st.trip.guards.length} sellswords` : ''}, ${esc(doing)}.</p><p class="dim">Click for why he rode out and what he has heard.</p>`;
  }
  if (hit.kind === 'rider') {
    const r = getRider(sim, hit.id);
    const doing = r.trip ? `riding for ${place(r.trip.dest)} with letters` : `resting in ${place(r.at)}`;
    return `<strong>${esc(r.name)}</strong><p>The lord's post, ${esc(doing)}.</p>`;
  }
  if (hit.kind === 'node') {
    const n = sim.graph.nodes.get(hit.id);
    const lines = [];
    if (sim.state.economy.markets[n.id]) {
      const people = residentsAt(sim, n.id).length;
      const h = sim.state.economy.hunger[n.id];
      const good = $('#price-good').value || 'grain';
      const q = quote(sim, n.id, good);
      lines.push(`${people} people${h >= 0.25 ? `, <span class="bad">${h >= 0.6 ? 'starving' : 'hungry'}</span>` : ''}. ${esc(goodOf(sim, good).name)} ${money(q.price)} a ${esc(goodOf(sim, good).unit)}.`);
    }
    if (n.toll) lines.push(`Toll: ${n.toll.wagon} marks a wagon, ${n.toll.foot ? `${n.toll.foot} on foot` : 'free on foot'}.`);
    lines.push(`<span class="dim">${esc(n.blurb ?? '')}</span>`);
    return `<strong>${esc(n.name)}</strong>${lines.map((l) => `<p>${l}</p>`).join('')}`;
  }
  if (hit.kind === 'segment') {
    const sg = sim.graph.segments.get(hit.id);
    const c = segmentConditions(sim.graph, hit.id, season.id);
    const minutes = legMinutes(sim.graph, hit.id, season.id, 3.5);
    const state = c.closed ? `<span class="bad">Closed this ${esc(season.name.toLowerCase())}: ${esc(c.note ?? 'impassable')}.</span>`
      : c.note ? `<span class="warn">This ${esc(season.name.toLowerCase())}: ${esc(c.note)}.</span>` : 'Open.';
    const other = Object.entries(sg.seasonal ?? {}).filter(([sid]) => sid !== season.id)
      .map(([sid, m]) => `${sim.cal.seasons.find((x) => x.id === sid).name.toLowerCase()}: ${m.note ?? (m.closed ? 'closed' : 'slow')}`);
    const surprise = sim.state.weather?.closures?.[hit.id];
    const shut = surprise && surprise.until > sim.now ? `<p class="bad">Shut without warning: ${esc(surprise.note)}, until ${esc(sim.cal.format(surprise.until).stamp)}.</p>` : '';
    const band = Object.values(sim.state.raiders?.bands ?? {}).find((b) => b.active && b.watching === hit.id && b.members.length >= sim.data.raiders.minToRaid);
    const patrol = (sim.state.lord?.patrols ?? []).find((p) => p.until > sim.now && p.segs.includes(hit.id));
    return `<strong>${esc(sim.graph.routes.get(sg.route).name)}</strong>` +
      `<p>${esc(place(sg.a))} – ${esc(place(sg.b))} · ${sg.km} km of ${esc(sg.terrainDef.name)} · ${dangerWord(sg.danger * sg.km / 100)} danger by repute</p>` +
      `<p>${state}${minutes ? ` About ${Math.round(minutes / 60)} hours on the move by wagon.` : ''}</p>` + shut +
      (band ? `<p class="bad">${esc(band.name)} (${band.members.length}) ${band.name.startsWith('the') ? 'are' : 'is'} watching this road. Travellers don't know that unless they've heard.</p>` : '') +
      (patrol ? `<p>Lord Aldric's patrol rides here (${patrol.guards} guards).</p>` : '') +
      (other.length ? `<p class="dim">Other seasons: ${esc(other.join('; '))}.</p>` : '');
  }
  if (hit.kind === 'band') {
    const b = getBand(sim, hit.id);
    const leader = sim.state.residents.byId[b.leader];
    return `<strong>${esc(b.name)}</strong><p>${b.members.length} outlaws${leader ? `, led by ${esc(leader.name)}` : ''}, watching the ${esc(road([sim.graph.segments.get(b.watching).route]))}.</p><p class="dim">Click for who they are, what they've taken, and why this road.</p>`;
  }
  if (hit.kind === 'raid') {
    const e = sim.state.log.findLast((x) => x.type === 'raid:encounter' && x.t === hit.t && x.seg === hit.seg);
    return e ? `<strong>${esc(sim.cal.format(e.t).stamp)}</strong><p>${esc(describe(e, sim))}</p>` : null;
  }
  if (hit.kind === 'place') {
    const p = sim.state.places[hit.id];
    const what = p.kind === 'waystation' ? `A waystation at ${place(hit.id)}, born of a camp of stranded travellers. Its inn passes news between everyone who comes through.`
      : p.kind === 'empty inn' ? `An empty inn at ${place(hit.id)}: once a waystation, until the travellers stopped coming.`
        : `A cold hearth at ${place(hit.id)}, where stranded travellers once camped.`;
    return `<strong>${esc(p.name)}</strong><p>${esc(what)}</p>`;
  }
  if (hit.kind === 'area') return `<strong>${esc(hit.name)}</strong><p>${esc(hit.about ?? '')}</p>`;
  return null;
}
$('#inspector-body').addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-wayfarer], [data-merchant], [data-resident], [data-node], [data-market], [data-merc], [data-item]');
  if (!t) return;
  if (t.dataset.wayfarer) select({ kind: 'wayfarer', id: t.dataset.wayfarer });
  else if (t.dataset.merc) select({ kind: 'merc', id: t.dataset.merc });
  else if (t.dataset.item) select({ kind: 'item', id: t.dataset.item });
  else if (t.dataset.merchant) select({ kind: 'merchant', id: t.dataset.merchant });
  else if (t.dataset.resident) select({ kind: 'resident', id: t.dataset.resident });
  else if (t.dataset.node) select({ kind: 'node', id: t.dataset.node });
  else if (t.dataset.market) {
    market = { ...market, town: t.dataset.market };
    renderMarkets(true);
    $('#markets-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

for (const b of document.querySelectorAll('[data-speed]')) b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)));
$('#step-hour').addEventListener('click', () => jump(60));
$('#step-day').addEventListener('click', () => jump(1440));
$('#to-dawn').addEventListener('click', toDawn);
$('#reset').addEventListener('click', () => newWorld(parseSeed($('#seed').value)));
$('#seed').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') newWorld(parseSeed($('#seed').value)); });
$('#run-check').addEventListener('click', runCheck);
$('#hash-now').addEventListener('click', () => {
  $('#hash-result').innerHTML = `<code>${sim.hash()}</code> at ${esc(sim.cal.format(sim.now).stamp)}`;
});
for (const id of ['#route-from', '#route-to']) $(id).addEventListener('change', () => { highlight = null; renderRoutes(); });
$('#route-mode').addEventListener('change', () => {
  highlight = null;
  renderRoutes();
  opportunities.render(sim, { mode: currentMode() });
});
$('#price-good').addEventListener('change', () => {
  if ($('#price-good').value) {
    market = { ...market, good: $('#price-good').value };
    renderMarkets(true);
  }
});
$('#chronicle-filter').addEventListener('change', () => {
  $('#chronicle-list').dataset.filter = $('#chronicle-filter').value;
});

document.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, select, textarea') || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === ' ') {
    // Space on a button, row or summary belongs to that element.
    if (ev.target.closest('button, a, summary, [tabindex="0"]')) return;
    ev.preventDefault();
    setSpeed(speed ? 0 : lastSpeed);
  } else if (/^[1-5]$/.test(ev.key)) {
    setSpeed(SPEEDS[Number(ev.key) - 1]);
  }
});

new ResizeObserver(() => renderer.resize()).observe(canvas.parentElement);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderer.refreshColors());
document.fonts?.ready.then(() => renderer.resize());

sim = new Simulation({ seed: parseSeed(new URLSearchParams(location.search).get('seed') ?? '1') });
fillSelects();
newWorld(sim.seed);
opportunities.render(sim, { mode: currentMode() });
setSpeed(1);
loadReference();
requestAnimationFrame(frame);
