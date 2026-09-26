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

  // Economy
  const eco = data.economy;
  if (eco) {
    const goodIds = new Set();
    for (const g of eco.goods) {
      if (goodIds.has(g.id)) err(`duplicate good ${g.id}`);
      goodIds.add(g.id);
      if (!(g.base > 0)) err(`good ${g.id}: base value must be > 0`);
      if (!eco.priceCurves[g.curve]) err(`good ${g.id}: unknown price curve ${g.curve}`);
      if (!(g.reserveDays > 0)) err(`good ${g.id}: reserveDays must be > 0`);
    }
    for (const [id, c] of Object.entries(eco.priceCurves)) {
      if (!(c.floor > 0 && c.floor < 1 && c.cap > 1)) err(`price curve ${id}: need 0 < floor < 1 < cap`);
      if (c.power !== 1 && c.power !== 2) err(`price curve ${id}: power must be 1 or 2`);
    }
    const checkSeason = (where, season) => {
      for (const [sid, mult] of Object.entries(season ?? {})) {
        if (!seasonIds.has(sid)) err(`${where}: unknown season ${sid}`);
        if (!(mult >= 0)) err(`${where}: seasonal multiplier must be ≥ 0`);
      }
    };
    for (const [gid, need] of Object.entries(eco.needs)) {
      if (!goodIds.has(gid)) err(`needs: unknown good ${gid}`);
      if (!(need.perPerson > 0)) err(`needs.${gid}: perPerson must be > 0`);
      checkSeason(`needs.${gid}`, need.season);
    }
    for (const [pid, p] of Object.entries(eco.professions)) {
      const out = p.produces ?? p.makes;
      if (out && !goodIds.has(out)) err(`profession ${pid}: unknown output ${out}`);
      if (out && !(p.rate > 0)) err(`profession ${pid}: rate must be > 0`);
      if (p.produces && p.makes) err(`profession ${pid}: produces and makes are exclusive`);
      for (const gid of Object.keys(p.inputs ?? {})) if (!goodIds.has(gid)) err(`profession ${pid}: unknown input ${gid}`);
      for (const gid of Object.keys(p.uses ?? {})) if (!goodIds.has(gid)) err(`profession ${pid}: unknown use ${gid}`);
      if (p.inputs && !p.makes) err(`profession ${pid}: inputs need a 'makes' recipe`);
      checkSeason(`profession ${pid}`, p.season);
    }
    for (const n of data.nodes) {
      if (n.kind === 'waypoint') continue;
      const pop = eco.populations[n.id];
      if (!pop) {
        err(`settlement ${n.id} has no population`);
        continue;
      }
      let total = 0;
      for (const [pid, count] of Object.entries(pop)) {
        if (!eco.professions[pid]) err(`population ${n.id}: unknown profession ${pid}`);
        if (!Number.isInteger(count) || count < 0) err(`population ${n.id}.${pid}: count must be a whole number`);
        total += count;
      }
      if (total !== n.residents) err(`population ${n.id} totals ${total} but the node says ${n.residents} residents`);
      if (!(eco.storage[n.id] > 0)) err(`settlement ${n.id} has no storage capacity`);
    }
    for (const [sid, o] of Object.entries(eco.outside ?? {})) {
      if (!nodeById.get(sid)?.outside) err(`outside market ${sid} is not an outside node`);
      if (!(o.relax > 0 && o.relax <= 1)) err(`outside market ${sid}: relax must be within (0, 1]`);
      for (const [gid, a] of Object.entries(o.goods)) {
        if (!goodIds.has(gid)) err(`outside market ${sid}: unknown good ${gid}`);
        if (!(a.anchor > 0 && a.factor > 0)) err(`outside market ${sid}.${gid}: anchor and factor must be > 0`);
      }
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
