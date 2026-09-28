// Prices: pure functions of market state. Nothing here changes the simulation.
//
// price = base value × local factor × stock factor
//   base value:   what the good is worth anywhere (data)
//   local factor: world prices at the Outside (ships sell salt cheap, pay well for ore); 1 elsewhere
//   stock factor: a bounded curve of scarcity = desired stock / actual stock (see data/economy.js)
// Every quote carries its parts so the inspector can say why a price is what it is.

// An empty market counts as holding 2% of what it wants, so "sold out" reaches
// near the curve's cap whether the town wants 4 tools or 110 sacks of grain.
const EMPTY_SHARE = 0.02;

const INDEX = new WeakMap();

/** Lookup tables for economy data, built once per world definition. */
export function economyIndex(data) {
  let ix = INDEX.get(data);
  if (ix) return ix;
  const eco = data.economy;
  const goods = new Map(eco.goods.map((g) => [g.id, g]));
  const outside = eco.outside ?? {};
  ix = {
    eco,
    goods,
    goodIds: eco.goods.map((g) => g.id),
    markets: data.nodes.filter((n) => n.kind !== 'waypoint').map((n) => n.id),
    isOutside: (sid) => Boolean(outside[sid]),
    localFactor: (sid, gid) => outside[sid]?.goods[gid]?.factor ?? 1,
  };
  INDEX.set(data, ix);
  return ix;
}

/** The stock factor curve: 1 at scarcity 1, rising to `cap`, falling to `floor`. */
export function stockFactor(curve, scarcity) {
  const x = curve.power === 2 ? scarcity * scarcity : scarcity;
  const q = (1 - curve.floor) / (curve.cap - 1);
  return (curve.floor + curve.cap * q * x) / (1 + q * x);
}

export function scarcityOf(desired, stock) {
  if (!(desired > 0)) return 0;
  const empty = desired * EMPTY_SHARE;
  return desired / (stock > empty ? stock : empty);
}

/**
 * Price of a good in a settlement's market, with the reasoning behind it.
 * `stock` overrides the market's current stock (for "what if I bought 30?").
 */
export function quote(sim, sid, gid, stock) {
  const ix = economyIndex(sim.data);
  const g = ix.goods.get(gid);
  const m = sim.state.economy.markets[sid][gid];
  const s = stock ?? m.stock;
  const scarcity = scarcityOf(m.desired, s);
  const factor = stockFactor(ix.eco.priceCurves[g.curve], scarcity);
  const local = ix.localFactor(sid, gid);
  return {
    sid,
    good: gid,
    price: g.base * local * factor,
    base: g.base,
    local,
    factor,
    scarcity,
    stock: s,
    desired: m.desired,
    need: m.need,
    daysLeft: m.need > 0 ? s / m.need : null,
  };
}

export const priceOf = (sim, sid, gid) => quote(sim, sid, gid).price;

/**
 * The price a market would show at a given stock and desired stock, by the
 * same curve. Merchants use it to estimate a sale from what they *believe*
 * about a distant market, which may be days out of date.
 */
export function priceAt(sim, sid, gid, stock, desired) {
  const ix = economyIndex(sim.data);
  const g = ix.goods.get(gid);
  return g.base * ix.localFactor(sid, gid) * stockFactor(ix.eco.priceCurves[g.curve], scarcityOf(desired, stock));
}

/** Estimated takings for selling `qty` into a market believed to hold `stock` and want `desired`. */
export function estimateSale(sim, sid, gid, qty, stock, desired, steps = 8) {
  if (!(qty > 0)) return 0;
  const h = qty / steps;
  let sum = 0;
  let prev = priceAt(sim, sid, gid, stock, desired);
  for (let i = 1; i <= steps; i++) {
    const cur = priceAt(sim, sid, gid, stock + h * i, desired);
    sum += (prev + cur) / 2;
    prev = cur;
  }
  return sum * h;
}

/** Estimated cost of buying `qty` from a market believed to hold `stock` and want `desired`. */
export function estimatePurchase(sim, sid, gid, qty, stock, desired, steps = 8) {
  const q = Math.min(qty, stock);
  return q > 0 ? estimateSale(sim, sid, gid, q, stock - q, desired, steps) : 0;
}

// Integrate price over a change in stock (trapezoid rule). Buying or selling a
// load moves the price as you go, so a big sale into a small market fetches
// less than the posted price suggests.
function integrate(sim, sid, gid, from, to, steps = 8) {
  const h = (to - from) / steps;
  let sum = 0;
  let prev = quote(sim, sid, gid, from).price;
  for (let i = 1; i <= steps; i++) {
    const cur = quote(sim, sid, gid, from + h * i).price;
    sum += (prev + cur) / 2;
    prev = cur;
  }
  return Math.abs(sum * h);
}

/** Total paid for buying `qty` units (stock falls as you buy). */
export function purchaseCost(sim, sid, gid, qty) {
  const stock = sim.state.economy.markets[sid][gid].stock;
  const q = Math.min(qty, stock);
  return q > 0 ? integrate(sim, sid, gid, stock, stock - q) : 0;
}

/** Total received for selling `qty` units (stock rises as you sell). */
export function saleValue(sim, sid, gid, qty) {
  const stock = sim.state.economy.markets[sid][gid].stock;
  return qty > 0 ? integrate(sim, sid, gid, stock, stock + qty) : 0;
}

/** "×2.1" style multiplier of a quote relative to the good's base value. */
export const priceMultiplier = (q) => q.local * q.factor;
