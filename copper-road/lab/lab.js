// The laboratory page: runs the simulation core in the browser with time controls,
// a map, an inspector, the chronicle, the markets, an opportunity board, lab
// tools, a route explorer and a determinism check.

import {
  Simulation,
  WORLD,
  describe,
  economyIndex,
  formatDuration,
  getResident,
  getWayfarer,
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
import { esc, goodOf, pct, placeName, qty } from './format.js';

const $ = (sel) => document.querySelector(sel);

// At 1× one game day lasts ten real minutes (spec §16).
const GAME_MINUTES_PER_SECOND = 1440 / 600;
const SPEEDS = [0, 1, 5, 20, 100];
const CHRONICLE_MAX = 200;
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
    renderT += dt * speed * GAME_MINUTES_PER_SECOND;
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
    li.dataset.kind = family === 'wayfarer' ? 'travel' : 'town';
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
      <dt>Journeys</dt><dd>${w.trips} finished, ${w.km} km walked</dd>
    </dl>
    ${why}`;
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
      <dt>Tools</dt><dd>${pct(toolFactor(sim, id))} of full strength</dd>`;
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
canvas.addEventListener('mousemove', (ev) => {
  const r = canvas.getBoundingClientRect();
  canvas.style.cursor = renderer.hitTest(ev.clientX - r.left, ev.clientY - r.top) ? 'pointer' : 'default';
});
$('#inspector-body').addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-wayfarer], [data-resident], [data-node], [data-market]');
  if (!t) return;
  if (t.dataset.wayfarer) select({ kind: 'wayfarer', id: t.dataset.wayfarer });
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
