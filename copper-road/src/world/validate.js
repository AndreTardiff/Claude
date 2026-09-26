// World-data validation. The simulation refuses to start on bad data, and the
// tests assert the shipped world has no errors. Returns a list of messages.

import { parseClock } from '../core/calendar.js';
import { buildGraph, isSettlement, segmentConditions } from './routes.js';

export function validateWorld(data) {
  const errors = [];
  const err = (msg) => errors.push(msg);

  // Time and calendar
  const mpt = data.time?.minutesPerTick;
  if (!Number.isInteger(mpt) || mpt < 1 || 60 % mpt !== 0) {
    err(`time.minutesPerTick must be a whole number of minutes dividing 60 (got ${mpt})`);
  }
  let seasons = [];
  try {
    const cal = data.calendar;
    if (!Number.isInteger(cal.daysPerSeason) || cal.daysPerSeason < 1) err('calendar.daysPerSeason must be ≥ 1');
    seasons = cal.seasons ?? [];
    if (!seasons.length) err('calendar needs at least one season');
    const camp = cal.campMinutes ?? 0;
    for (const s of seasons) {
      const dawn = parseClock(s.dawn);
      const dusk = parseClock(s.dusk);
      if (dusk - dawn - 2 * camp <= 0) err(`season ${s.id}: no travelling time left between dawn and dusk`);
    }
    const start = data.time.start.day * 1440 + parseClock(data.time.start.time);
    if (Number.isInteger(mpt) && start % mpt !== 0) err('time.start must fall on a tick boundary');
  } catch (e) {
    err(`calendar: ${e.message}`);
  }
  const seasonIds = new Set(seasons.map((s) => s.id));

  // Terrain
  for (const [id, t] of Object.entries(data.terrain ?? {})) {
    if (!(t.speed > 0)) err(`terrain ${id}: speed must be > 0`);
  }

  // Nodes
  const nodeIds = new Set();
  for (const n of data.nodes) {
    if (nodeIds.has(n.id)) err(`duplicate node id ${n.id}`);
    nodeIds.add(n.id);
    if (!(n.x >= 0 && n.x <= data.map.widthKm && n.y >= 0 && n.y <= data.map.heightKm)) {
      err(`node ${n.id} lies outside the map`);
    }
    if (!['town', 'village', 'port', 'waypoint'].includes(n.kind)) err(`node ${n.id}: unknown kind ${n.kind}`);
  }
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));

  // Segments
  const segIds = new Set();
  for (const s of data.segments) {
    if (segIds.has(s.id)) err(`duplicate segment id ${s.id}`);
    segIds.add(s.id);
    const a = nodeById.get(s.a);
    const b = nodeById.get(s.b);
    if (!a || !b) {
      err(`segment ${s.id}: unknown endpoint`);
      continue;
    }
    if (s.a === s.b) err(`segment ${s.id} joins a node to itself`);
    if (!data.terrain[s.terrain]) err(`segment ${s.id}: unknown terrain ${s.terrain}`);
    if (!(s.km > 0)) err(`segment ${s.id}: km must be > 0`);
    // A road can wind, but it can't be shorter than the straight line on the map.
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const straight = Math.sqrt(dx * dx + dy * dy);
    if (s.km < straight - 0.5) err(`segment ${s.id}: ${s.km} km is shorter than the ${straight.toFixed(1)} km straight line`);
    if (!(s.danger >= 0 && s.danger <= 1)) err(`segment ${s.id}: danger must be within 0–1`);
    for (const [sid, mod] of Object.entries(s.seasonal ?? {})) {
      if (!seasonIds.has(sid)) err(`segment ${s.id}: unknown season ${sid}`);
      if (mod.speed !== undefined && !(mod.speed > 0)) err(`segment ${s.id}: seasonal speed must be > 0`);
    }
  }

  // Routes: each lists contiguous segments that name it back.
  const claimed = new Map();
  for (const r of data.routes) {
    let prevEnds = null;
    for (const segId of r.segments) {
      const s = data.segments.find((x) => x.id === segId);
      if (!s) {
        err(`route ${r.id}: unknown segment ${segId}`);
        continue;
      }
      if (s.route !== r.id) err(`segment ${segId} is listed by route ${r.id} but names route ${s.route}`);
      if (claimed.has(segId)) err(`segment ${segId} belongs to two routes`);
      claimed.set(segId, r.id);
      if (prevEnds && !prevEnds.includes(s.a) && !prevEnds.includes(s.b)) err(`route ${r.id}: ${segId} does not continue the road`);
      prevEnds = [s.a, s.b];
    }
  }
  for (const s of data.segments) if (!claimed.has(s.id)) err(`segment ${s.id} is not part of any route`);

  // Every settlement must be reachable from every other in every season.
  if (!errors.length) {
    const graph = buildGraph(data);
    const settlements = data.nodes.filter(isSettlement).map((n) => n.id);
    for (const season of seasons) {
      const seen = new Set([settlements[0]]);
      const stack = [settlements[0]];
      while (stack.length) {
        const cur = stack.pop();
        for (const { seg, to } of graph.adj.get(cur)) {
          if (seen.has(to) || segmentConditions(graph, seg, season.id).closed) continue;
          seen.add(to);
          stack.push(to);
        }
      }
      for (const id of settlements) if (!seen.has(id)) err(`${id} is cut off in ${season.id}`);
    }
  }

  // Wayfarers
  const wf = data.wayfarers;
  if (wf) {
    if (!Number.isInteger(wf.count) || wf.count < 0) err('wayfarers.count must be a whole number ≥ 0');
    if (!wf.trades?.length) err('wayfarers.trades must not be empty');
    for (const t of wf.trades ?? []) if (!(t.speedKmh > 0)) err(`wayfarer trade ${t.id}: speed must be > 0`);
    const [lo, hi] = wf.restDays ?? [];
    if (!(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 0 && hi >= lo)) err('wayfarers.restDays must be [min, max] whole days');
  }

  return errors;
}
