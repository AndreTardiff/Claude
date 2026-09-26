// The opportunity board: where a wagon load would make the most money right now.
//
// This is the lab's all-seeing view (true prices, perfect knowledge). In step D,
// merchants will score the same kind of trade from their own ageing knowledge.
// Buying and selling move prices as the load changes hands, so a glut market
// can't absorb unlimited goods.

import { routeOptions } from '../world/routes.js';
import { economyIndex, purchaseCost, quote, saleValue } from './pricing.js';

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function tradeOpportunities(sim, { speedKmh = 3.5, load = 30, crew = 3, limit = 10, depart } = {}) {
  const ix = economyIndex(sim.data);
  const markets = sim.state.economy.markets;
  const when = depart ?? sim.now;
  const provisionsPerDay = sim.data.wayfarers?.provisionsPerDay ?? 0.1;
  const routeCache = new Map();
  const bestRoute = (a, b) => {
    const key = `${a}>${b}`;
    if (!routeCache.has(key)) {
      const opts = routeOptions(sim.graph, sim.cal, a, b, when, speedKmh);
      routeCache.set(key, opts.find((o) => !o.estimate.blocked) ?? null);
    }
    return routeCache.get(key);
  };

  const out = [];
  for (const gid of ix.goodIds) {
    for (const a of ix.markets) {
      const qty = Math.min(load, Math.floor(markets[a][gid].stock));
      if (qty < 1) continue;
      const buy = quote(sim, a, gid).price;
      for (const b of ix.markets) {
        if (a === b) continue;
        const sell = quote(sim, b, gid).price;
        if (sell <= buy * 1.05) continue;
        const route = bestRoute(a, b);
        if (!route) continue;
        const days = route.estimate.elapsed / 1440;
        const cost = purchaseCost(sim, a, gid, qty);
        const revenue = saleValue(sim, b, gid, qty);
        const provisions = Math.ceil(days) * crew * provisionsPerDay * quote(sim, a, 'grain').price;
        const profit = revenue - cost - provisions;
        if (profit <= 0) continue;
        out.push({
          good: gid, from: a, to: b, qty, buy, sell, cost, revenue, provisions, profit,
          days, perDay: profit / days, routes: route.routes, path: route.path,
        });
      }
    }
  }
  out.sort((x, y) => y.perDay - x.perDay || byString(x.good, y.good) || byString(x.from, y.from) || byString(x.to, y.to));
  return out.slice(0, limit);
}
