// Who is where: residents by settlement, the working population by trade, and
// travellers staying in town. Shared by the residents and economy systems.

export function residentsAt(sim, sid) {
  const st = sim.state.residents;
  if (!st) return [];
  const out = [];
  for (const id of st.order) {
    const r = st.byId[id];
    if (r.alive && r.home === sid) out.push(r);
  }
  return out;
}

/** Wayfarers resting in a settlement (not those just passing through). */
export function visitorsAt(sim, sid) {
  const st = sim.state.wayfarers;
  if (!st) return [];
  const out = [];
  for (const id of st.order) {
    const w = st.byId[id];
    if (!w.trip && w.at === sid) out.push(w);
  }
  return out;
}

/**
 * Working population of a settlement, grouped by trade in data order:
 * [{ profession, count, skill }] where skill is the summed skill (1.0 = one average worker).
 */
export function workforce(sim, sid) {
  const groups = new Map();
  for (const pid of Object.keys(sim.data.economy.professions)) groups.set(pid, { profession: pid, count: 0, skill: 0 });
  for (const r of residentsAt(sim, sid)) {
    const g = groups.get(r.profession);
    g.count += 1;
    g.skill += r.skill / 1000;
  }
  return [...groups.values()].filter((g) => g.count > 0);
}
