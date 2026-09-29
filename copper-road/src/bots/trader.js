// Player bots (step G): scripted players for the T2 acceptance tests (spec §21).
// They play only through sim.command(), from the player's own knowledge, the same
// way a person at the lab's controls would. Deterministic: no randomness of their own.
//
//   smart   weighs every trade it could make from home the way the merchants do
//           (merchants.js tradeCandidates, on the player's price lists), including
//           carrying the stall's own goods to where they're dear; keeps coin back
//           for the money-changer; buys a second wagon when it can
//   fixed   always the same load on the same road (AT-17: is any policy dominant?)

import { balance, toBits, toMarks } from '../economy/money.js';
import { estimateSale, quote, saleValue } from '../economy/pricing.js';
import { believedCash, stockOnArrival, tradeCandidates } from '../systems/merchants.js';
import { caravans, PLAYER } from '../systems/player.js';
import { belief } from '../systems/knowledge.js';
import { planJourney } from '../world/journey.js';

const idleWagons = (sim) => sim.state.player.wagons - caravans(sim).reduce((a, m) => a + m.wagons, 0);

// What the next payment to the changer will be (bits), plus a cushion.
function keepBack(sim) {
  const st = sim.state.player;
  const d = sim.data.player.debt;
  const due = Math.round(st.debt.principal * (d.rate + d.installment));
  return due + toBits(sim, 8);
}

/** One day of play. Call after each simulated day. */
export function botDay(sim, policy = { kind: 'smart' }) {
  const st = sim.state.player;
  if (!st || st.bonded || !st.at) return;
  if (policy.kind === 'fixed') {
    if (st.at === st.home && idleWagons(sim) >= 1) fixedDay(sim, policy);
    return;
  }
  smartDay(sim, policy);
}

// Wagons the player could send from where they stand: the yard at home, or a caravan waiting here.
function wagonsHere(sim) {
  const st = sim.state.player;
  const waiting = caravans(sim).find((c) => !c.trip && !c.captive && c.at === st.at && c.wagons > 0);
  return (waiting?.wagons ?? 0) + (st.at === st.home ? idleWagons(sim) : 0);
}

// The smart player rides with their caravan and trades from wherever they stand,
// the way the houses do, with two advantages of being there: they sell only when
// the price they can see beats what the load cost (else carry it on), and they
// buy only with a margin of safety over what their price lists promise.
function smartDay(sim, policy) {
  const st = sim.state.player;
  const cfg = sim.data.merchants;
  const here = st.at;
  const ride = policy.ride !== false;
  if (!ride && st.at !== st.home) return;
  if (!sim.state.economy.markets[here]) return;
  const waiting = caravans(sim).find((c) => !c.trip && !c.captive && c.at === here && c.wagons > 0);
  // 1. A load that has just come in: sell it here, or carry it on.
  if (waiting && Object.keys(waiting.cargo).length) {
    const [gid, qty] = Object.entries(waiting.cargo)[0];
    const basis = waiting.venture?.qty ? waiting.venture.bought / waiting.venture.qty / sim.data.coin.bitsPerMark : 0;
    const now = saleValue(sim, here, gid, qty);
    const onward = bestMarket(sim, here, gid, qty, waiting.wagons);
    const stale = waiting.venture && sim.now - waiting.venture.departedAt > 15 * 1440;
    if (stale || now >= basis * qty * 1.05 || !onward || onward.gain < now + 10) {
      sim.command('player:orders', { caravan: waiting.id, sell: 'all' });
    } else {
      sim.command('player:dispatch', { to: onward.to, good: gid, qty, road: policy.road ?? 'balanced', sell: 'none', then: 'wait', ride });
      return;
    }
  }
  // 2. Anything in store here that fetches more than it cost.
  for (const [gid, g] of Object.entries(st.stores[here] ?? {})) {
    if (here === st.home && !g.cost) continue; // the stall's own stock is worth carrying (below)
    if (saleValue(sim, here, gid, g.qty) > (g.cost / sim.data.coin.bitsPerMark) * 1.05) sim.command('player:sell', { good: gid, qty: g.qty });
  }
  const wagons = wagonsHere(sim);
  if (wagons < 1) {
    // Stranded without a wagon (having ridden out alone): home, where the wagons are.
    if (here !== st.home && !caravans(sim).some((c) => c.trip)) sim.command('player:travel', { to: st.home, road: 'safe' });
    return;
  }
  // Hard up with a spare wagon: sell it to keep the changer paid and trade again.
  if (here === st.home && st.wagons > 1 && idleWagons(sim) > 0 && balance(sim, PLAYER) < keepBack(sim) + toBits(sim, 40)) sim.command('player:sell-wagon');
  if (policy.expand !== false && here === st.home && st.wagons < 2 && balance(sim, PLAYER) > toBits(sim, cfg.wagonCost * 3) + keepBack(sim)) sim.command('player:buy-wagon');
  // 3. A new venture: buy here and carry (with a margin), or carry what's in store here.
  // Never more than two thirds of the purse on one load: a raid shouldn't end the family.
  const spend = Math.min(balance(sim, PLAYER) - keepBack(sim), Math.round(balance(sim, PLAYER) * (policy.stake ?? 0.67)));
  const me = { id: PLAYER, at: here, capacity: wagons * cfg.wagonCapacity, wagons, boldness: policy.boldness ?? 650, account: PLAYER };
  let best = null;
  if (spend > 0) {
    for (const c of tradeCandidates(sim, me)) {
      // Scaled down to the stake (roughly: the profit shrinks with the load).
      const share = Math.min(1, spend / toBits(sim, c.cost + c.fee));
      const qty = Math.floor(c.qty * share);
      const profit = c.profit * share;
      if (qty < 3 || profit < Math.max(12, 0.15 * (c.cost + c.fee) * share)) continue;
      if (!best || c.perDay * share > best.perDay) best = { kind: 'buy', good: c.good, qty, to: c.to, perDay: c.perDay * share, profit };
    }
  }
  for (const [gid, g] of Object.entries(st.stores[here] ?? {})) {
    const qty = Math.min(g.qty, wagons * cfg.wagonCapacity);
    if (qty < 1) continue;
    const onward = bestMarket(sim, here, gid, qty, wagons);
    const gain = onward ? onward.gain - saleValue(sim, here, gid, qty) : 0;
    if (gain > 8 && (!best || onward.perDay > best.perDay)) best = { kind: 'store', good: gid, qty, to: onward.to, perDay: onward.perDay, profit: gain };
  }
  if (!best) {
    // Nothing worth carrying from here: after a couple of days, ride home.
    st.botIdle = (st.botIdle ?? 0) + 1;
    if (ride && here !== st.home && st.botIdle >= 2) {
      st.botIdle = 0;
      sim.command('player:dispatch', { to: st.home, road: policy.road ?? 'balanced', sell: 'none', then: 'wait', ride: true });
    }
    return;
  }
  st.botIdle = 0;
  if (best.kind === 'buy') sim.command('player:buy', { good: best.good, qty: best.qty });
  const have = st.stores[here]?.[best.good]?.qty ?? 0;
  if (have < 1) return;
  sim.command('player:dispatch', { to: best.to, good: best.good, qty: Math.min(have, best.qty), road: policy.road ?? 'balanced', sell: ride ? 'none' : 'all', then: ride ? 'wait' : 'home', ride });
}

// Where a load would fetch most (by the player's price lists), net of the road: { to, gain, perDay }.
function bestMarket(sim, from, gid, qty, wagons) {
  const cfg = sim.data.merchants;
  let best = null;
  for (const to of Object.keys(sim.state.economy.markets)) {
    if (to === from) continue;
    const b = belief(sim, PLAYER, to, gid);
    const plan = b && planJourney(sim, from, to, { speedKmh: cfg.speedKmh, caution: 0.5, holder: PLAYER });
    if (!plan) continue;
    const days = plan.hours / 24;
    const fetch = Math.min(estimateSale(sim, to, gid, qty, stockOnArrival(sim, to, b, b.ageDays + days), b.desired), believedCash(sim, b));
    const costs = Math.ceil(days) * wagons * cfg.crewPerWagon * (cfg.crewWage + 0.1 * quote(sim, from, 'grain').price);
    const gain = fetch * (1 - Math.min(0.5, 0.02 * (b.ageDays + days))) - costs;
    const perDay = gain / Math.max(0.5, days);
    if (!best || gain > best.gain) best = { to, gain, perDay };
  }
  return best;
}

function fixedDay(sim, { good, to }) {
  const st = sim.state.player;
  const cfg = sim.data.merchants;
  const spend = toMarks(sim, balance(sim, PLAYER) - keepBack(sim));
  const price = quote(sim, st.home, good).price;
  const qty = Math.floor(Math.min(cfg.wagonCapacity, spend / (price * 1.2)));
  if (qty >= 3) sim.command('player:buy', { good, qty });
  const have = st.stores[st.home]?.[good]?.qty ?? 0;
  if (have >= 1) sim.command('player:dispatch', { to, good, qty: Math.min(have, cfg.wagonCapacity), sell: 'all', then: 'home' });
}

/** Trading profit (bits): what the player's caravans' ventures made, plus the stall's sales over cost. */
export function playerTradeProfit(sim) {
  let bits = 0;
  for (const m of Object.values(sim.state.merchants.byId)) if (m.player) bits += m.profit;
  for (const e of sim.state.log) if (e.type === 'player:sold') bits += e.profit ?? 0;
  return bits;
}
