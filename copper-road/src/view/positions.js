// Where things are on the map at a (possibly fractional) render time.
// Pure functions of simulation state: rendering never changes the simulation.

export function wayfarerPosition(sim, w, t) {
  const trip = w.trip;
  if (!trip || !trip.legSeg) {
    const nodeId = trip ? trip.at : w.at;
    const node = sim.graph.nodes.get(nodeId);
    return { x: node.x, y: node.y, node: nodeId, moving: false, camped: Boolean(trip), waiting: Boolean(trip?.waiting) };
  }
  const from = sim.graph.nodes.get(trip.at);
  const to = sim.graph.nodes.get(trip.legTo);
  const done = sim.cal.travelBetween(trip.legStart, Math.min(t, trip.legEnd));
  const f = Math.max(0, Math.min(1, done / trip.legMinutes));
  const moving = sim.cal.isTravelTime(t) && f < 1;
  return {
    x: from.x + (to.x - from.x) * f,
    y: from.y + (to.y - from.y) * f,
    node: null,
    moving,
    camped: !moving && f < 1,
    progress: f,
  };
}
