// Moving goods in and out of a settlement's market. Stocks never go negative and
// are kept to three decimals so saved states stay tidy.
//
// Goods that leave or arrive by road (a caravan's cargo, travellers' provisions)
// go through load/unload, and goods the lord's household uses up (feasts,
// commissions, works) through useUp; all three are counted in the day's books
// (sim.state.economy.road: in, out, used), so every change in a town's stock
// stays accounted for.

import { economyIndex } from './pricing.js';

export const round3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Whose coin changes hands when a traveller buys or sells in a market: the town
 * traders' till, or at the Outside, the ships themselves. The ships' purse is the
 * wider world's: what they pay for exports brings coin into the region, what
 * they're paid for imports takes it out.
 */
export function traderAccount(sim, sid) {
  return economyIndex(sim.data).isOutside(sid) ? 'ships' : `till:${sid}`;
}

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

/** Goods leaving a market by road. Returns how much was taken. */
export function load(sim, sid, gid, qty) {
  const got = withdraw(sim, sid, gid, qty);
  tally(sim, sid, 'out', gid, got);
  return got;
}

/** Goods arriving by road. Returns how much was added. */
export function unload(sim, sid, gid, qty) {
  const added = deposit(sim, sid, gid, qty);
  tally(sim, sid, 'in', gid, added);
  return added;
}

/** Goods used up outside the day's settlement: the lord's feasts, commissions and works. */
export function useUp(sim, sid, gid, qty) {
  const got = withdraw(sim, sid, gid, qty);
  tally(sim, sid, 'used', gid, got);
  return got;
}

function tally(sim, sid, dir, gid, qty) {
  const st = sim.state.economy;
  if (!st || !(qty > 0)) return;
  const road = (st.road[sid] ??= { in: {}, out: {}, used: {} });
  road[dir][gid] = round3((road[dir][gid] ?? 0) + qty);
}
