// Route graph: nodes (settlements and waypoints) joined by road segments.
//
// Travel happens on this graph, never by free pathfinding across the map.
// Seasonal conditions (floods, snow) are read from segment data at the moment
// a traveller starts each segment. Decisions happen at nodes; nobody changes
// roads mid-segment.

export const isSettlement = (node) => node.kind !== 'waypoint';

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function buildGraph(data) {
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const routes = new Map(data.routes.map((r) => [r.id, r]));
  const segments = new Map();
  const adj = new Map(data.nodes.map((n) => [n.id, []]));
  for (const s of data.segments) {
    segments.set(s.id, { ...s, terrainDef: data.terrain[s.terrain] });
    adj.get(s.a)?.push({ seg: s.id, to: s.b });
    adj.get(s.b)?.push({ seg: s.id, to: s.a });
  }
  // Fixed neighbour order keeps path enumeration identical everywhere.
  for (const list of adj.values()) list.sort((x, y) => byString(x.seg, y.seg));
  const settlements = data.nodes.filter(isSettlement).map((n) => n.id);
  return { nodes, routes, segments, adj, settlements };
}

export function otherEnd(seg, nodeId) {
  return seg.a === nodeId ? seg.b : seg.a;
}

/** Conditions on a segment in a given season: closed?, effective speed factor, note. */
export function segmentConditions(graph, segId, seasonId) {
  const seg = graph.segments.get(segId);
  const mod = seg.seasonal?.[seasonId];
  return {
    closed: Boolean(mod?.closed),
    speed: seg.terrainDef.speed * (mod?.speed ?? 1),
    note: mod?.note ?? null,
  };
}

/** Whole minutes of travelling needed for a segment, or null if it is closed. */
export function legMinutes(graph, segId, seasonId, speedKmh) {
  const cond = segmentConditions(graph, segId, seasonId);
  if (cond.closed) return null;
  const seg = graph.segments.get(segId);
  return Math.max(1, Math.round((seg.km * 60) / (speedKmh * cond.speed)));
}

/** Every simple path (list of segment ids) from `from` to `to`, in a fixed order. */
export function findPaths(graph, from, to, maxSegments = 8) {
  const out = [];
  if (from === to) return out;
  const visited = new Set([from]);
  const path = [];
  const walk = (node) => {
    if (node === to) {
      out.push(path.slice());
      return;
    }
    if (path.length >= maxSegments) return;
    for (const { seg, to: next } of graph.adj.get(node)) {
      if (visited.has(next)) continue;
      visited.add(next);
      path.push(seg);
      walk(next);
      path.pop();
      visited.delete(next);
    }
  };
  walk(from);
  return out;
}

export function pathNodes(graph, from, path) {
  const nodes = [from];
  let cur = from;
  for (const segId of path) {
    cur = otherEnd(graph.segments.get(segId), cur);
    nodes.push(cur);
  }
  return nodes;
}

/** Named routes a path follows, in order ("Meadow Road" then "Estuary Road"). */
export function pathRoutes(graph, path) {
  const ids = [];
  for (const segId of path) {
    const r = graph.segments.get(segId).route;
    if (ids[ids.length - 1] !== r) ids.push(r);
  }
  return ids;
}

export function routesLabel(graph, routeIds) {
  return routeIds.map((id) => graph.routes.get(id)?.name ?? id).join(', then ');
}

export function pathKm(graph, path) {
  let km = 0;
  for (const segId of path) km += graph.segments.get(segId).km;
  return km;
}

/** Danger exposure: Σ danger × km / 100. A placeholder until raiders exist (step E). */
export function pathExposure(graph, path) {
  let e = 0;
  for (const segId of path) {
    const s = graph.segments.get(segId);
    e += (s.danger * s.km) / 100;
  }
  return e;
}

/**
 * Walk a path leg by leg from `depart`, applying the calendar's travel windows
 * and each segment's conditions for the season in which the leg begins.
 * Returns { legs, arrival, elapsed, moving } or { blocked: {...} }.
 */
export function estimateJourney(graph, cal, from, path, depart, speedKmh) {
  let t = depart;
  let cur = from;
  let moving = 0;
  const legs = [];
  for (const segId of path) {
    const season = cal.season(cal.nextTravelMoment(t));
    const cond = segmentConditions(graph, segId, season.id);
    const next = otherEnd(graph.segments.get(segId), cur);
    if (cond.closed) {
      return { blocked: { seg: segId, at: cur, note: cond.note, season: season.id }, legs, arrival: null };
    }
    const minutes = legMinutes(graph, segId, season.id, speedKmh);
    const arrive = cal.addTravel(t, minutes);
    legs.push({ seg: segId, from: cur, to: next, depart: t, arrive, minutes, note: cond.note });
    moving += minutes;
    t = arrive;
    cur = next;
  }
  return { blocked: null, legs, arrival: t, elapsed: t - depart, moving };
}

/** All ways from A to B for someone leaving at `depart`, fastest first; blocked ones last. */
export function routeOptions(graph, cal, from, to, depart, speedKmh, maxSegments = 8) {
  const opts = findPaths(graph, from, to, maxSegments).map((path) => ({
    path,
    routes: pathRoutes(graph, path),
    label: routesLabel(graph, pathRoutes(graph, path)),
    km: pathKm(graph, path),
    exposure: pathExposure(graph, path),
    estimate: estimateJourney(graph, cal, from, path, depart, speedKmh),
  }));
  opts.sort((a, b) => {
    const ab = a.estimate.blocked ? 1 : 0;
    const bb = b.estimate.blocked ? 1 : 0;
    if (ab !== bb) return ab - bb;
    if (!ab && a.estimate.elapsed !== b.estimate.elapsed) return a.estimate.elapsed - b.estimate.elapsed;
    return byString(a.label, b.label);
  });
  return opts;
}
