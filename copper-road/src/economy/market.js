// Moving goods in and out of a settlement's market. Stocks never go negative and
// are kept to three decimals so saved states stay tidy.

export const round3 = (x) => Math.round(x * 1000) / 1000;

/** Take up to `qty` from a market. Returns how much was actually taken. */
export function withdraw(sim, sid, gid, qty) {
  const m = sim.state.economy?.markets[sid]?.[gid];
  if (!m || !(qty > 0)) return 0;
  const got = qty < m.stock ? qty : m.stock;
  m.stock = round3(m.stock - got);
  return got;
}

/** Add `qty` to a market. Returns the amount added. */
export function deposit(sim, sid, gid, qty) {
  const m = sim.state.economy?.markets[sid]?.[gid];
  if (!m || !(qty > 0)) return 0;
  m.stock = round3(m.stock + qty);
  return qty;
}
