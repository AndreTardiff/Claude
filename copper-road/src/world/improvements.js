// Town improvements: what the lord's works have added to a settlement, on top
// of its founding data (which never changes). Plain JSON in sim.state.improvements.
//
//   storage   extra storage per good (a granary)
//   farmers   extra farmland, in farmers it can keep busy (new fields)
//   yield     extra yield on every field (drained meadows, a mill)
//   homes     extra room to grow past the founding ceiling (new houses)
//   growUntil a festival's glow: births and newcomers come faster until this time

const EMPTY = { storage: 0, farmers: 0, yield: 0, homes: 0, growUntil: -1 };

export function improvementsOf(sim, sid) {
  return sim.state.improvements?.[sid] ?? EMPTY;
}

export function improve(sim, sid, change) {
  const all = (sim.state.improvements ??= {});
  const cur = (all[sid] ??= { ...EMPTY });
  for (const [k, v] of Object.entries(change)) cur[k] = k === 'growUntil' ? Math.max(cur[k], v) : Math.round((cur[k] + v) * 1000) / 1000;
  return cur;
}

export const storageOf = (sim, sid) => sim.data.economy.storage[sid] + improvementsOf(sim, sid).storage;

export function landOf(sim, sid) {
  const base = sim.data.economy.land?.[sid];
  const imp = improvementsOf(sim, sid);
  if (!base) return imp.farmers ? { farmers: imp.farmers, yield: 1 + imp.yield } : null;
  return { farmers: base.farmers + imp.farmers, yield: base.yield + imp.yield };
}
