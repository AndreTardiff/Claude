// Journeys: shared travel for anyone who moves along the route graph (post
// riders, caravans; wayfarers keep their older copy of the same logic).
//
// A trip is plain data kept by its owner. The owner's system picks the event
// kind for "reached the next node" and handles closures (wait or replan). Travel
// uses the calendar's travel windows, so nights and short winter days slow
// everyone the same way; segment conditions are read as each leg begins.

import {
  estimateJourney,
  findPaths,
  legMinutes,
  otherEnd,
  pathExposure,
  pathRoutes,
  routesLabel,
  segmentConditions,
} from './routes.js';

import { believedClosed, believedExposure, reportRoad } from '../systems/knowledge.js';
import { surpriseClosure } from './closures.js';

const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Choose a road from `from` to `dest`. Score = hours × (1 + dangerWeight × exposure × caution);
 * exposure is the danger the traveller (`holder`) believes the roads hold;
 * lowest wins. Blocked paths (a closure on the way) are skipped. Keeps the top options as the reason.
 */
export function planJourney(sim, from, dest, { speedKmh, caution = 0.5, dangerWeight = 8, maxSegments = 8, holder = null }) {
  const options = [];
  for (const path of findPaths(sim.graph, from, dest, maxSegments)) {
    if (holder && path.some((seg) => believedClosed(sim, holder, seg))) continue; // heard it's shut
    const est = estimateJourney(sim.graph, sim.cal, from, path, sim.now, speedKmh);
    if (est.blocked) continue;
    const routes = pathRoutes(sim.graph, path);
    const hours = est.elapsed / 60;
    // A traveller judges danger by what they've heard of the roads (step E); without a holder, by reputation alone.
    const exposure = holder ? believedExposure(sim, holder, path) : pathExposure(sim.graph, path);
    const score = hours * (1 + dangerWeight * exposure * caution);
    options.push({ path, routes, label: routesLabel(sim.graph, routes), hours, exposure, score });
  }
  if (!options.length) return null;
  options.sort((a, b) => a.score - b.score || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const best = options[0];
  return {
    path: best.path,
    routes: best.routes,
    hours: best.hours,
    exposure: best.exposure,
    reason: {
      caution: round2(caution),
      options: options.slice(0, 3).map((o) => ({ routes: o.routes, hours: round1(o.hours), exposure: round2(o.exposure), score: round1(o.score) })),
    },
  };
}

export function newTrip(sim, { tripNo, from, dest, plan, speedKmh }) {
  return {
    tripNo,
    from,
    dest,
    path: plan.path,
    routes: plan.routes,
    reason: plan.reason,
    speedKmh,
    departedAt: sim.now,
    leg: 0,
    at: from, // the last node reached
    waiting: false,
    legSeg: null,
    legTo: null,
    legStart: null,
    legEnd: null,
    legMinutes: null,
  };
}

/**
 * Begin the trip's next leg now: schedule `kind` with { id, tripNo } for its end.
 * Returns null when moving, or { seg, note } when the next segment is closed.
 */
export function startLeg(sim, trip, kind, id) {
  const segId = trip.path[trip.leg];
  const season = sim.cal.season(sim.cal.nextTravelMoment(sim.now));
  const surprise = surpriseClosure(sim, segId);
  if (surprise) {
    // They see it for themselves now, and will tell others.
    const base = sim.graph.segments.get(segId).danger;
    reportRoad(sim, id, segId, { danger: base, what: 'closed', until: surprise.until, note: surprise.note });
    return { seg: segId, note: surprise.note, surprise: true };
  }
  const minutes = legMinutes(sim.graph, segId, season.id, trip.speedKmh);
  if (minutes === null) return { seg: segId, note: segmentConditions(sim.graph, segId, season.id).note };
  trip.waiting = false;
  trip.legSeg = segId;
  trip.legTo = otherEnd(sim.graph.segments.get(segId), trip.at);
  trip.legStart = sim.now;
  trip.legMinutes = minutes;
  trip.legEnd = sim.cal.addTravel(sim.now, minutes);
  sim.schedule(trip.legEnd, kind, { id, tripNo: trip.tripNo });
  return null;
}

/** Book the arrival at the end of the current leg. Returns the segment just travelled. */
export function finishLeg(sim, trip) {
  const seg = sim.graph.segments.get(trip.legSeg);
  trip.at = trip.legTo;
  trip.leg += 1;
  trip.legSeg = null;
  return seg;
}

/** Replace the rest of the route from where the trip stands. */
export function reroute(trip, plan) {
  trip.path = plan.path;
  trip.routes = plan.routes;
  trip.reason = plan.reason;
  trip.leg = 0;
}

/** Map position of a trip at render time t (pure). */
export function tripPosition(sim, trip, t) {
  if (!trip.legSeg) {
    const node = sim.graph.nodes.get(trip.at);
    return { x: node.x, y: node.y, node: trip.at, moving: false, camped: true, waiting: trip.waiting };
  }
  const from = sim.graph.nodes.get(trip.at);
  const to = sim.graph.nodes.get(trip.legTo);
  const done = sim.cal.travelBetween(trip.legStart, Math.min(t, trip.legEnd));
  const f = Math.max(0, Math.min(1, done / trip.legMinutes));
  const moving = sim.cal.isTravelTime(t) && f < 1;
  return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, node: null, moving, camped: !moving && f < 1, progress: f };
}
