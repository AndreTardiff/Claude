// Wayfarers: step A's placeholder travellers.
//
// They wander between settlements on the route graph, exercising the clock,
// the scheduler, seasonal road conditions and rerouting at nodes. Every road
// choice keeps its reasoning for the inspector. Later (the information
// system, step D) they become the rumour carriers of the world.
//
// Lifecycle:  resting ──depart──▶ travelling ──node──▶ … ──node──▶ arrived ─▶ resting
// Events carry the wayfarer's tripNo; a handler ignores events from a trip that is over.

import { GIVEN_NAMES } from '../data/names.js';
import { withdraw } from '../economy/market.js';
import { quote } from '../economy/pricing.js';
import { balance, toBits, transfer } from '../economy/money.js';
import { swapNews } from './knowledge.js';
import {
  estimateJourney,
  findPaths,
  legMinutes,
  otherEnd,
  pathExposure,
  pathRoutes,
  routesLabel,
  segmentConditions,
} from '../world/routes.js';

const ROMAN = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;

export const wayfarers = {
  id: 'wayfarers',

  init(sim) {
    const cfg = sim.data.wayfarers;
    const rng = sim.rng('wayfarers.init');
    const names = rng.shuffle(GIVEN_NAMES.slice());
    const homes = sim.graph.settlements.map((id) => [id, sim.graph.nodes.get(id).residents]);
    const st = (sim.state.wayfarers = { byId: {}, order: [] });

    for (let i = 0; i < cfg.count; i++) {
      const id = sim.nextId('w');
      const gen = Math.floor(i / names.length);
      const base = names[i % names.length];
      const trade = rng.pick(cfg.trades);
      const home = rng.weighted(homes);
      const w = {
        id,
        name: gen ? `${base} ${ROMAN[gen] ?? gen + 1}` : base,
        trade: trade.id,
        speedKmh: trade.speedKmh,
        home,
        boldness: rng.int(0, 1000), // permille: 0 = timid, 1000 = reckless
        at: home,
        tripNo: 0,
        trip: null,
        restingUntil: null,
        trips: 0,
        km: 0,
      };
      st.byId[id] = w;
      st.order.push(id);
      scheduleDeparture(sim, w, rng.int(0, 1));
    }
  },

  handlers: {
    'wayfarer:depart': onDepart,
    'wayfarer:node': onNode,
    'wayfarer:retry': onRetry,
  },
};

export function getWayfarer(sim, id) {
  return sim.state.wayfarers?.byId[id];
}

export function tradeName(sim, w) {
  return sim.data.wayfarers.trades.find((t) => t.id === w.trade)?.name ?? w.trade;
}

function scheduleDeparture(sim, w, restDays) {
  const rng = sim.rng('wayfarers');
  let d = sim.cal.day(sim.now) + restDays;
  // Leave between first light and a couple of hours after.
  let t = sim.cal.travelWindow(d)[0] + rng.int(0, 120);
  if (t <= sim.now) {
    d += 1;
    t = sim.cal.travelWindow(d)[0] + rng.int(0, 120);
  }
  w.restingUntil = t;
  sim.schedule(t, 'wayfarer:depart', { id: w.id, tripNo: w.tripNo });
}

function destinationWeights(sim, w) {
  const cfg = sim.data.wayfarers;
  return sim.graph.settlements
    .filter((id) => id !== w.at)
    .map((id) => [id, sim.graph.nodes.get(id).residents + (id === w.home ? cfg.homeWeight : 0)]);
}

/**
 * Choose the road to take. Score = hours on the road × (1 + dangerWeight × exposure × caution).
 * Lower is better. The top options are kept as the reason for the inspector.
 */
export function planRoute(sim, w, from, dest) {
  const cfg = sim.data.wayfarers;
  const caution = (1000 - w.boldness) / 1000;
  const options = [];
  for (const path of findPaths(sim.graph, from, dest, cfg.maxSegments)) {
    const est = estimateJourney(sim.graph, sim.cal, from, path, sim.now, w.speedKmh);
    if (est.blocked) continue;
    const routes = pathRoutes(sim.graph, path);
    const hours = est.elapsed / 60;
    const exposure = pathExposure(sim.graph, path);
    const score = hours * (1 + cfg.dangerWeight * exposure * caution);
    options.push({ path, routes, label: routesLabel(sim.graph, routes), hours, exposure, score });
  }
  if (!options.length) return null;
  options.sort((a, b) => a.score - b.score || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const best = options[0];
  return {
    path: best.path,
    routes: best.routes,
    hours: best.hours,
    reason: {
      caution: round2(caution),
      options: options.slice(0, 3).map((o) => ({
        routes: o.routes,
        hours: round1(o.hours),
        exposure: round2(o.exposure),
        score: round1(o.score),
      })),
    },
  };
}

function onDepart(sim, { id, tripNo }) {
  const w = getWayfarer(sim, id);
  if (!w || w.trip || w.tripNo !== tripNo) return;
  const from = w.at;
  const dest = sim.rng('wayfarers').weighted(destinationWeights(sim, w));
  const plan = planRoute(sim, w, from, dest);
  if (!plan) {
    sim.log('wayfarer:stranded', { who: id, at: from, dest });
    scheduleDeparture(sim, w, 1);
    return;
  }
  // Provisions for the road come out of the town's market: grain doesn't teleport.
  let wanted = Math.ceil(plan.hours / 24) * sim.data.wayfarers.provisionsPerDay;
  let price = 0;
  if (sim.state.coin && sim.state.economy) {
    // They buy only what their purse can cover.
    price = quote(sim, from, 'grain').price;
    const perUnit = toBits(sim, price);
    if (perUnit > 0) wanted = Math.min(wanted, balance(sim, `wayfarer:${w.id}`) / perUnit);
  }
  const provisions = withdraw(sim, from, 'grain', wanted);
  if (provisions > 0) transfer(sim, `wayfarer:${w.id}`, `till:${from}`, toBits(sim, price * provisions));
  w.tripNo += 1;
  w.at = null;
  w.restingUntil = null;
  w.trip = {
    tripNo: w.tripNo,
    from,
    dest,
    path: plan.path,
    routes: plan.routes,
    reason: plan.reason,
    departedAt: sim.now,
    provisions: Math.round(provisions * 1000) / 1000,
    leg: 0,
    at: from, // the last node reached
    waiting: false,
    legSeg: null,
    legTo: null,
    legStart: null,
    legEnd: null,
    legMinutes: null,
  };
  sim.log('wayfarer:departed', { who: id, from, dest, via: plan.routes });
  startLeg(sim, w);
}

function startLeg(sim, w, depth = 0) {
  const trip = w.trip;
  const segId = trip.path[trip.leg];
  const season = sim.cal.season(sim.cal.nextTravelMoment(sim.now));
  const minutes = legMinutes(sim.graph, segId, season.id, w.speedKmh);
  if (minutes === null) {
    if (depth > 3) throw new Error(`wayfarer ${w.id}: replanning loop at ${trip.at}`);
    blocked(sim, w, segId, season.id, depth);
    return;
  }
  trip.waiting = false;
  trip.legSeg = segId;
  trip.legTo = otherEnd(sim.graph.segments.get(segId), trip.at);
  trip.legStart = sim.now;
  trip.legMinutes = minutes;
  trip.legEnd = sim.cal.addTravel(sim.now, minutes);
  sim.schedule(trip.legEnd, 'wayfarer:node', { id: w.id, tripNo: trip.tripNo });
}

// The next road is closed. Find another way from here, or wait for it to open.
function blocked(sim, w, segId, seasonId, depth) {
  const trip = w.trip;
  const note = segmentConditions(sim.graph, segId, seasonId).note;
  const plan = planRoute(sim, w, trip.at, trip.dest);
  if (plan) {
    sim.log('wayfarer:rerouted', { who: w.id, at: trip.at, blocked: segId, note, via: plan.routes });
    trip.path = plan.path;
    trip.routes = plan.routes;
    trip.reason = plan.reason;
    trip.leg = 0;
    startLeg(sim, w, depth + 1);
    return;
  }
  if (!trip.waiting) sim.log('wayfarer:waylaid', { who: w.id, at: trip.at, blocked: segId, note });
  trip.waiting = true;
  trip.legSeg = null;
  const tomorrow = sim.cal.day(sim.now) + 1;
  sim.schedule(sim.cal.travelWindow(tomorrow)[0], 'wayfarer:retry', { id: w.id, tripNo: trip.tripNo });
}

function onRetry(sim, { id, tripNo }) {
  const w = getWayfarer(sim, id);
  if (!w?.trip || w.trip.tripNo !== tripNo || !w.trip.waiting) return;
  startLeg(sim, w);
}

function onNode(sim, { id, tripNo }) {
  const w = getWayfarer(sim, id);
  if (!w?.trip || w.trip.tripNo !== tripNo || !w.trip.legSeg) return;
  const trip = w.trip;
  w.km += sim.graph.segments.get(trip.legSeg).km;
  trip.at = trip.legTo;
  // Crossing a tolled bridge or ferry: pay the lord, or slip past if the purse is empty.
  const toll = sim.graph.nodes.get(trip.at).toll?.foot ?? 0;
  if (toll && sim.state.coin) {
    const paid = transfer(sim, `wayfarer:${w.id}`, 'treasury', toBits(sim, toll));
    sim.state.coin.today.tolls += paid;
  }
  trip.leg += 1;
  trip.legSeg = null;
  if (trip.at !== trip.dest) {
    startLeg(sim, w);
    return;
  }
  sim.log('wayfarer:arrived', {
    who: id,
    at: trip.dest,
    from: trip.from,
    via: trip.routes,
    minutes: sim.now - trip.departedAt,
  });
  w.at = trip.dest;
  w.trip = null;
  w.trips += 1;
  // Wayfarers are the region's gossip: they trade news at every inn they reach.
  swapNews(sim, w.id, trip.dest);
  const [lo, hi] = sim.data.wayfarers.restDays;
  scheduleDeparture(sim, w, sim.rng('wayfarers').int(lo, hi));
}
