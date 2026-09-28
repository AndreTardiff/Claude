// Surprise closures (step E): a flood at the ford, early snow on the pass, a
// rockfall in the gorge, a storm that stops the ferry. Unlike the seasons'
// closures (in the world data, known to all), these happen without warning, and
// travellers learn of them only by coming to them or hearing of them.

/** The surprise closure on a road right now, if any: { until, note, event }. */
export function surpriseClosure(sim, segId) {
  const c = sim.state.weather?.closures?.[segId];
  return c && c.until > sim.now ? c : null;
}
