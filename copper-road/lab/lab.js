// The laboratory page: runs the simulation core in the browser with time controls,
// a map, an inspector, a route explorer, the chronicle and a determinism check.

import {
  Simulation,
  WORLD,
  describe,
  formatDuration,
  getWayfarer,
  routeOptions,
  routesLabel,
  segmentConditions,
  tradeName,
  wayfarerPosition,
} from '../src/index.js';
import { createMapRenderer } from './map-render.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// At 1× one game day lasts ten real minutes (spec §16).
const GAME_MINUTES_PER_SECOND = 1440 / 600;
const SPEEDS = [0, 1, 5, 20, 100];
const CHRONICLE_MAX = 150;
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
let selected = null; // { kind: 'wayfarer' | 'node', id }
let highlight = null; // { path, key, pinned }
let chronicleCount = 0;
let lastPanelUpdate = 0;
let lastRouteHour = -1;
let reference = null;

const canvas = $('#map');
const renderer = createMapRenderer(canvas, WORLD);

function newWorld(seed) {
  sim = new Simulation({ seed });
  renderT = sim.now;
  selected = null;
  highlight = null;
  chronicleCount = 0;
  $('#chronicle-list').replaceChildren();
  $('#seed').value = String(seed);
  $('#hash-result').textContent = '';
  const url = new URL(location.href);
  url.searchParams.set('seed', String(seed));
  history.replaceState(null, '', url);
  renderInspector();
  renderRoutes();
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
  renderer.draw({ sim, t: renderT, selected, highlight });
  updateClock();
  updateChronicle();
  if (now - lastPanelUpdate > 250) {
    lastPanelUpdate = now;
    renderInspector();
    const hour = Math.floor(renderT / 60);
    if (hour !== lastRouteHour) renderRoutes();
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

// ── Chronicle ────────────────────────────────────────────────────────────────

function updateChronicle() {
  const log = sim.state.log;
  if (log.length === chronicleCount) return;
  const list = $('#chronicle-list');
  const frag = document.createDocumentFragment();
  for (let i = log.length - 1; i >= chronicleCount; i--) {
    const e = log[i];
    const li = document.createElement('li');
    li.className = `entry entry-${e.type.split(':')[0]}`;
    li.innerHTML = `<time>${esc(sim.cal.format(e.t).stamp)}</time> ${esc(describe(e, sim))}`;
    frag.appendChild(li);
  }
  list.prepend(frag);
  chronicleCount = log.length;
  while (list.children.length > CHRONICLE_MAX) list.lastChild.remove();
}

// ── Inspector ────────────────────────────────────────────────────────────────

const dangerWord = (x) => (x < 0.05 ? 'low' : x < 0.15 ? 'moderate' : 'high');
const place = (id) => sim.graph.nodes.get(id)?.name ?? id;
const road = (routes) => routesLabel(sim.graph, routes);

function renderInspector() {
  const body = $('#inspector-body');
  if (!selected) {
    body.innerHTML = '<p class="hint">Click a traveller or a place on the map.</p>';
    return;
  }
  body.innerHTML = selected.kind === 'wayfarer' ? wayfarerHtml(selected.id) : nodeHtml(selected.id);
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
  return `
    <h3>${esc(w.name)} <span class="sub">the ${esc(tradeName(sim, w))}</span></h3>
    <p>${status}</p>
    <dl class="facts">
      <dt>Home</dt><dd>${esc(place(w.home))}</dd>
      <dt>Temper</dt><dd>${temper} (${w.boldness}/1000 bold)</dd>
      <dt>Pace</dt><dd>${w.speedKmh} km/h</dd>
      <dt>Journeys</dt><dd>${w.trips} finished, ${w.km} km walked</dd>
    </dl>
    ${why}`;
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
  const residents = n.residents ? `<dt>Residents</dt><dd>${n.residents} planned (step I)</dd>` : '';
  return `
    <h3>${esc(n.name)} <span class="sub">${kind}</span></h3>
    <p>${esc(n.blurb ?? '')}</p>
    <dl class="facts">${residents}${toll}</dl>
    <h4>Roads, this ${esc(season.name.toLowerCase())}</h4>
    <ul class="roads">${roads}</ul>
    <h4>Travellers here</h4>
    <p>${here || '<span class="hint">Nobody at the moment.</span>'}</p>`;
}

// ── Route explorer ───────────────────────────────────────────────────────────

function renderRoutes() {
  lastRouteHour = Math.floor(renderT / 60);
  const from = $('#route-from').value;
  const to = $('#route-to').value;
  const mode = MODES.find((m) => m.id === $('#route-mode').value) ?? MODES[0];
  const tbody = $('#route-table tbody');
  if (from === to) {
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

function fillRouteSelects() {
  const options = sim.graph.settlements.map((id) => `<option value="${id}">${esc(place(id))}</option>`).join('');
  $('#route-from').innerHTML = options;
  $('#route-to').innerHTML = options;
  $('#route-from').value = 'kingscross';
  $('#route-to').value = 'copperford';
  $('#route-mode').innerHTML = MODES.map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join('');
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
  const id = ev.target.closest('[data-wayfarer]')?.dataset.wayfarer;
  if (id) select({ kind: 'wayfarer', id });
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
for (const id of ['#route-from', '#route-to', '#route-mode']) $(id).addEventListener('change', () => { highlight = null; renderRoutes(); });

document.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, select, textarea') || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === ' ') {
    ev.preventDefault();
    setSpeed(speed ? 0 : lastSpeed);
  } else if (/^[1-5]$/.test(ev.key)) {
    setSpeed(SPEEDS[Number(ev.key) - 1]);
  }
});

new ResizeObserver(() => renderer.resize()).observe(canvas.parentElement);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderer.refreshColors());
document.fonts?.ready.then(() => renderer.resize());

newWorld(parseSeed(new URLSearchParams(location.search).get('seed') ?? '1'));
fillRouteSelects();
renderRoutes();
setSpeed(1);
loadReference();
requestAnimationFrame(frame);
