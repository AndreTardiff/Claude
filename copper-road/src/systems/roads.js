// Roads by night and in bad weather (step E4, spec §17.2 and §17.3).
//
// Weather: now and then, without warning, a road shuts: the Copperwash floods
// the ford, early snow closes the pass, a rockfall blocks the gorge, a storm
// stops the ferry. Travellers learn of it by coming to it, or by hearing of it.
//
// Night: at ten each evening, travellers camped close together share a fire,
// and news: prices, and which roads the bands are watching.
//
// Camps: travellers stranded together at a waypoint make camp. When the road
// opens they go on. A camp that was short or small leaves a cold hearth, a
// named mark on the map; one that held for days with enough people becomes a
// waystation: someone stays on to sell beds and bread, and its inn passes news
// between everyone who comes through. A waystation nobody visits closes.

import { tripPosition } from '../world/journey.js';
import { wayfarerPosition } from '../view/positions.js';
import { swapBetween, swapNews } from './knowledge.js';

const DAY = 1440;
const NIGHT_FIRE = 22 * 60; // ten at night

export const roads = {
  id: 'roads',

  init(sim) {
    if (!sim.data.weather) return;
    sim.state.weather = { closures: {} };
    sim.state.camps = {}; // waypoint → camp
    sim.state.places = {}; // waypoint → { kind: 'hearth' | 'waystation' | 'empty inn', name, since, … }
  },

  hourly(sim) {
    if (!sim.state.weather) return;
    if (sim.cal.minuteOfDay(sim.now) === NIGHT_FIRE) firesides(sim);
  },

  daily(sim) {
    if (!sim.state.weather) return;
    weather(sim);
    camps(sim);
    waystations(sim);
  },
};

const waypoint = (sim, id) => sim.graph.nodes.get(id)?.kind === 'waypoint';
const firstName = (name) => String(name).split(' ')[0];

// Everyone on the road, with where they are right now.
function travellers(sim) {
  const out = [];
  for (const id of sim.state.merchants?.order ?? []) {
    const m = sim.state.merchants.byId[id];
    if (m.active && m.trip) out.push({ kind: 'merchant', id, name: m.name, trip: m.trip, pos: tripPosition(sim, m.trip, sim.now) });
  }
  for (const id of sim.state.wayfarers?.order ?? []) {
    const w = sim.state.wayfarers.byId[id];
    if (w.trip) out.push({ kind: 'wayfarer', id, name: w.name, trip: w.trip, pos: wayfarerPosition(sim, w, sim.now) });
  }
  for (const id of sim.state.post?.order ?? []) {
    const r = sim.state.post.byId[id];
    if (r.trip) out.push({ kind: 'rider', id, name: r.name, trip: r.trip, pos: tripPosition(sim, r.trip, sim.now) });
  }
  return out;
}

// ── Weather ─────────────────────────────────────────────────────────────────

function weather(sim) {
  const cfg = sim.data.weather;
  const st = sim.state.weather;
  const rng = sim.rng('weather');
  // Roads reopen.
  for (const [seg, c] of Object.entries(st.closures)) {
    if (c.until > sim.now) continue;
    delete st.closures[seg];
    if (!Object.values(st.closures).some((x) => x.event === c.event && x.at === c.at)) sim.log('weather:opened', { event: c.event, at: c.at });
  }
  // And now and then one shuts.
  const season = sim.cal.season(sim.now).id;
  for (const ev of cfg.events) {
    const chance = ev.seasons[season] ?? 0;
    if (!chance || ev.segments.some((seg) => st.closures[seg]) || !rng.chance(chance)) continue;
    const until = sim.now + rng.int(ev.days[0], ev.days[1]) * DAY;
    for (const seg of ev.segments) st.closures[seg] = { event: ev.id, at: ev.at, until, note: ev.note };
    sim.log('weather:closed', { event: ev.id, at: ev.at, until });
  }
}

// ── Camps and waystations ───────────────────────────────────────────────────

// Who is stuck at a waypoint, waiting for a road to open.
function stranded(sim) {
  const at = new Map();
  for (const t of travellers(sim)) {
    if (!t.trip.waiting || !waypoint(sim, t.trip.at)) continue;
    if (!at.has(t.trip.at)) at.set(t.trip.at, []);
    at.get(t.trip.at).push(t);
  }
  return at;
}

function camps(sim) {
  const cfg = sim.data.weather.camps;
  const st = sim.state;
  const now = stranded(sim);
  for (const [node, people] of now) {
    let camp = st.camps[node];
    if (!camp && people.length >= 2) {
      camp = st.camps[node] = { node, since: sim.now, days: 0, peak: 0, founder: people[0].name, guests: [] };
      sim.log('camp:formed', { at: node, people: people.map((p) => ({ kind: p.kind, id: p.id })) });
    }
    if (!camp) continue;
    camp.days += 1;
    camp.peak = Math.max(camp.peak, people.length);
    for (const p of people) if (!camp.guests.some((g) => g.id === p.id)) camp.guests.push({ kind: p.kind, id: p.id });
  }
  // Camps whose people have all gone on.
  for (const [node, camp] of Object.entries(st.camps)) {
    if ((now.get(node) ?? []).length) continue;
    delete st.camps[node];
    const place = st.places[node];
    if (camp.days >= cfg.waystationDays && camp.guests.length >= cfg.waystationPeople && place?.kind !== 'waystation') {
      // Someone stays on to sell beds and bread to whoever comes next.
      st.places[node] = { kind: 'waystation', name: `${firstName(camp.founder)}'s Rest`, since: sim.now, lastGuest: sim.now, founder: camp.founder };
      sim.log('camp:waystation', { at: node, name: st.places[node].name, days: camp.days, guests: camp.guests.length });
    } else {
      if (!place) st.places[node] = { kind: 'hearth', name: `${firstName(camp.founder)}'s Hearth`, since: sim.now };
      sim.log('camp:dispersed', { at: node, days: camp.days, guests: camp.guests.length, name: st.places[node].name });
    }
  }
}

// A waystation lives on travellers; one nobody visits closes, leaving an empty inn.
function waystations(sim) {
  const cfg = sim.data.weather.camps;
  for (const [node, place] of Object.entries(sim.state.places)) {
    if (place.kind !== 'waystation' || sim.now - place.lastGuest < cfg.waystationFades * DAY) continue;
    place.kind = 'empty inn';
    place.closed = sim.now;
    sim.log('camp:waystation-closed', { at: node, name: place.name });
  }
}

/** A traveller reaches a waypoint: if there's a waystation, they rest a moment and swap news at its inn. */
export function visitWaystation(sim, holder, node) {
  const place = sim.state.places?.[node];
  if (!place || place.kind !== 'waystation') return;
  place.lastGuest = sim.now;
  place.guests = (place.guests ?? 0) + 1;
  swapNews(sim, holder, node, { look: false });
}

// ── Firesides ───────────────────────────────────────────────────────────────

// At night, travellers camped within a short walk of each other share a fire and their news.
function firesides(sim) {
  const reach = sim.data.weather.fireKm;
  const groups = [];
  for (const t of travellers(sim)) {
    const key = t.pos.node ?? t.trip.legSeg ?? t.trip.at;
    const group = groups.find((g) => g.key === key && Math.abs(g.x - t.pos.x) + Math.abs(g.y - t.pos.y) <= reach);
    if (group) group.people.push(t);
    else groups.push({ key, x: t.pos.x, y: t.pos.y, node: t.pos.node ?? null, seg: t.pos.node ? null : t.trip.legSeg, people: [t] });
  }
  for (const g of groups) {
    const heard = [];
    if (g.people.length >= 2) {
      for (let i = 0; i < g.people.length; i++) {
        for (let j = i + 1; j < g.people.length; j++) heard.push(...swapBetween(sim, g.people[i].id, g.people[j].id));
      }
    }
    // A waystation's inn joins in.
    if (g.node && sim.state.places?.[g.node]?.kind === 'waystation') for (const p of g.people) visitWaystation(sim, p.id, g.node);
    // The chronicle hears when word of bandits passed round a fire (once in a while for each road).
    const h = heard.find((x) => sim.now - (sim.state.weather.fireNews?.[x.road] ?? -Infinity) >= sim.data.weather.fireNewsDays * DAY);
    if (h) {
      sim.state.weather.fireNews = { ...(sim.state.weather.fireNews ?? {}), [h.road]: sim.now };
      sim.log('camp:fireside', { at: g.node, seg: g.seg, people: g.people.length, teller: h.from, hearer: h.to, road: h.road, band: h.band ?? null });
    }
  }
}
