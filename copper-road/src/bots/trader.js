// Player bots (step G): scripted players for the T2 acceptance tests (spec §21).
// They play only through sim.command(), from the player's own knowledge, the same
// way a person at the lab's controls would. Deterministic: no randomness of their own.
//
//   smart   weighs every trade it could make from where it stands the way the
//           merchants do (merchants.js tradeCandidates, on the player's price lists),
//           including carrying the stall's own goods to where they're dear, and,
//           unlike the houses, what it could buy at the far end to carry on (a
//           back-haul); with nothing worth carrying, moves on to where the buying
//           looks better (as an idle house does); keeps coin back for the
//           money-changer, and sells what it holds, at a loss if need be, rather
//           than miss a payment; grows to three wagons as a house would, then pays
//           off the note
//   fixed   always the same load on the same road (AT-17: is any policy dominant?)

import { balance, toBits, toMarks } from '../economy/money.js';
import { estimateSale, quote, saleValue } from '../economy/pricing.js';
import { believedCash, bestPlaceToBuy, buyingMargin, stockOnArrival, tradeCandidates } from '../systems/merchants.js';
import { caravans, PLAYER } from '../systems/player.js';
import { belief, heardBound, inboundBefore } from '../systems/knowledge.js';
import { planJourney } from '../world/journey.js';
import { pathKm } from '../world/routes.js';

const idleWagons = (sim) => sim.state.player.wagons - caravans(sim).reduce((a, m) => a + m.wagons, 0);

// A bot's own memory (days idle, towns that had nothing for it, whether it has just roamed),
// kept outside the simulation's state: a bot is a player at the controls, and acts only by commands.
const memories = new WeakMap();
function memoryOf(sim) {
  if (!memories.has(sim)) memories.set(sim, { idle: 0, wanting: {}, roamed: false });
  return memories.get(sim);
}

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
  const mem = memoryOf(sim);
  const cfg = sim.data.merchants;
  const here = st.at;
  const ride = policy.ride !== false;
  if (!ride && st.at !== st.home) return;
  if (!sim.state.economy.markets[here]) return;
  const waiting = caravans(sim).find((c) => !c.trip && !c.captive && c.at === here && c.wagons > 0);
  if (policy.couriers) newsRun(sim, policy);
  // A network of factors (step G+2): one in each market it stands in, but home, once the purse can carry the wages.
  const wanted = policy.factors === 'all' || (Array.isArray(policy.factors) && policy.factors.includes(here));
  if (wanted && here !== st.home && !st.factors[here] && balance(sim, PLAYER) > toBits(sim, policy.factorPurse ?? 200)) sim.command('player:hire-factor');
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
    // No wagon at hand: ride to one of ours waiting elsewhere, else home, where the wagons are.
    const parked = caravans(sim).find((c) => !c.trip && !c.captive && c.at && c.at !== here && c.wagons > 0);
    if (parked) sim.command('player:travel', { to: parked.at, road: 'safe' });
    else if (here !== st.home && !caravans(sim).some((c) => c.trip)) sim.command('player:travel', { to: st.home, road: 'safe' });
    return;
  }
  // Hard up with a spare wagon: sell it to keep the changer paid and trade again.
  if (here === st.home && st.wagons > 1 && idleWagons(sim) > 0 && balance(sim, PLAYER) < keepBack(sim) + toBits(sim, 40)) sim.command('player:sell-wagon');
  // Flush: another wagon (as many as a house may keep). Then, with all the wagons it may keep
  // and more coin than they can use, pay off the changer's note: idle coin earns nothing, and
  // coin piled up only draws the lord's "loans".
  if (policy.expand !== false && here === st.home && st.wagons < cfg.maxWagons && balance(sim, PLAYER) > toBits(sim, 2 * cfg.keepPerWagon * st.wagons + cfg.wagonCost) + keepBack(sim)) sim.command('player:buy-wagon');
  const flush = balance(sim, PLAYER) - toBits(sim, policy.working ?? 600) - keepBack(sim);
  if (policy.repay !== false && here === st.home && st.debt.principal > 0 && st.wagons >= cfg.maxWagons && flush > 0) sim.command('player:repay', { marks: toMarks(sim, flush) });
  // 3. A new venture: buy here and carry (with a margin), or carry what's in store here.
  // Never more than two thirds of the purse on one load: a raid shouldn't end the family.
  const spend = Math.min(balance(sim, PLAYER) - keepBack(sim), Math.round(balance(sim, PLAYER) * (policy.stake ?? 0.67)));
  const me = { id: PLAYER, at: here, capacity: wagons * cfg.wagonCapacity, wagons, boldness: policy.boldness ?? 650, account: PLAYER, threshold: policy.threshold ?? 2 };
  // Each load is ranked by what it makes a day over the trip and a typical next leg, counting
  // part of what the best load bought at the far end should clear (a back-haul).
  const lookahead = policy.lookahead ?? 0.5;
  const margins = new Map();
  const backHaul = (to, days) => {
    if (!margins.has(to)) margins.set(to, buyingMargin(sim, me, to, days, toMarks(sim, Math.max(0, spend))));
    return lookahead * margins.get(to);
  };
  let best = null;
  if (spend > 0) {
    for (const c of tradeCandidates(sim, me)) {
      // Scaled down to the stake (roughly: the profit shrinks with the load).
      const share = Math.min(1, spend / toBits(sim, c.cost + c.fee));
      const qty = Math.floor(c.qty * share);
      const profit = c.profit * share;
      if (qty < 3 || profit < Math.max(12, 0.15 * (c.cost + c.fee) * share)) continue;
      const perDay = (profit + backHaul(c.to, c.days)) / (c.days + 3);
      if (!best || perDay > best.perDay) best = { kind: 'buy', good: c.good, qty, to: c.to, perDay, profit };
    }
  }
  for (const [gid, g] of Object.entries(st.stores[here] ?? {})) {
    const qty = Math.min(g.qty, wagons * cfg.wagonCapacity);
    if (qty < 1) continue;
    const onward = bestMarket(sim, here, gid, qty, wagons);
    const gain = onward ? onward.gain - saleValue(sim, here, gid, qty) : 0;
    if (gain <= 8) continue;
    const perDay = (gain + backHaul(onward.to, onward.days)) / (onward.days + 3);
    if (!best || perDay > best.perDay) best = { kind: 'store', good: gid, qty, to: onward.to, perDay, profit: gain };
  }
  if (!best) {
    // Short of coin for the changer, with goods here nobody would carry: sell them, at a loss if need be.
    if (balance(sim, PLAYER) < keepBack(sim) + toBits(sim, 20)) {
      for (const [gid, g] of Object.entries(st.stores[here] ?? {})) sim.command('player:sell', { good: gid, qty: g.qty });
    }
    // Nothing worth carrying from here: after a couple of days, move on to where the buying
    // looks better (the houses' own reckoning, but not to a town that had nothing for it lately),
    // else home; taking along anything in store here.
    mem.idle += 1;
    if (here === st.home) mem.roamed = false; // home: plan afresh
    if (ride && mem.idle >= 2) {
      const day = Math.floor(sim.now / 1440);
      const wanting = mem.wanting;
      wanting[here] = day;
      const skip = Object.keys(wanting).filter((sid) => day - wanting[sid] < (policy.forget ?? 12));
      // Only on a strong promise, with coin to buy a load when it gets there, and only once
      // between loads (a tour of empty markets eats the purse); else to goods of ours stored
      // elsewhere, worth the trip; else home, and wait there.
      const target = !mem.roamed && spend >= toBits(sim, 100) ? bestPlaceToBuy(sim, { ...me, threshold: me.threshold * 3 }, { skip }) : null;
      const stored = target ? null : storedElsewhere(sim, here);
      const to = target?.to ?? stored ?? (here !== st.home ? st.home : null);
      if (!to) return;
      mem.idle = 0;
      mem.roamed = Boolean(target);
      // What's here to take: the stores, and whatever the waiting caravan still holds (dispatch stores it first).
      const held = {};
      for (const [gid, g] of Object.entries(st.stores[here] ?? {})) held[gid] = g.qty;
      for (const [gid, q] of Object.entries(waiting?.cargo ?? {})) held[gid] = (held[gid] ?? 0) + q;
      const [gid, q] = Object.entries(held).sort((a, b) => quote(sim, here, b[0]).price * b[1] - quote(sim, here, a[0]).price * a[1] || (a[0] < b[0] ? -1 : 1))[0] ?? [];
      const qty = gid ? Math.min(q, wagons * cfg.wagonCapacity) : 0;
      sim.command('player:dispatch', { to, good: gid ?? null, qty, road: policy.road ?? 'balanced', sell: 'none', then: 'wait', ride: true });
    }
    return;
  }
  mem.idle = 0;
  mem.roamed = false;
  if (best.kind === 'buy') sim.command('player:buy', { good: best.good, qty: best.qty });
  const have = st.stores[here]?.[best.good]?.qty ?? 0;
  if (have < 1) return;
  sim.command('player:dispatch', { to: best.to, good: best.good, qty: Math.min(have, best.qty), road: policy.road ?? 'balanced', sell: ride ? 'none' : 'all', then: ride ? 'wait' : 'home', ride });
}

// The town (not this one) where the player's stored goods are worth most at its own prices, if worth the trip.
function storedElsewhere(sim, here) {
  const st = sim.state.player;
  let best = null;
  for (const [sid, goods] of Object.entries(st.stores)) {
    if (sid === here || !sim.state.economy.markets[sid]) continue;
    let marks = 0;
    for (const [gid, g] of Object.entries(goods)) marks += quote(sim, sid, gid).price * g.qty;
    if (marks >= 60 && (!best || marks > best.marks)) best = { sid, marks };
  }
  return best?.sid ?? null;
}

/**
 * Fresh word for the price of a courier (step G+2): with none of its own on the road, send one
 * to the market whose news is oldest, once that news is `courierAge` days old, if the fee is a
 * small share of the purse. The letters come back to wherever the player is by then.
 */
function newsRun(sim, policy) {
  const st = sim.state.player;
  if (Object.values(st.couriers).some((c) => !c.report)) return;
  let stalest = null;
  for (const sid of Object.keys(sim.state.economy.markets)) {
    if (sid === st.at) continue;
    const rec = sim.state.knowledge.holders[PLAYER]?.[sid];
    const age = rec ? (sim.now - rec.t) / 1440 : 99;
    if (!stalest || age > stalest.age) stalest = { sid, age };
  }
  if (!stalest || stalest.age < (policy.courierAge ?? 4)) return;
  const cfg = sim.data.player.courier;
  const plan = planJourney(sim, st.at, stalest.sid, { speedKmh: cfg.speedKmh, caution: 0.6, holder: PLAYER });
  if (!plan) return;
  const fee = Math.max(cfg.min, cfg.perKm * 2 * pathKm(sim.graph, plan.path));
  if (toBits(sim, fee) > balance(sim, PLAYER) * (policy.courierShare ?? 0.03)) return;
  sim.command('player:courier', { to: stalest.sid });
}

// Where a load would fetch most (by the player's price lists), net of the road: { to, gain, perDay }.
function bestMarket(sim, from, gid, qty, wagons) {
  const cfg = sim.data.merchants;
  const bound = heardBound(sim, PLAYER);
  let best = null;
  for (const to of Object.keys(sim.state.economy.markets)) {
    if (to === from) continue;
    const b = belief(sim, PLAYER, to, gid);
    const plan = b && planJourney(sim, from, to, { speedKmh: cfg.speedKmh, caution: 0.5, holder: PLAYER });
    if (!plan) continue;
    const days = plan.hours / 24;
    const inbound = inboundBefore(bound, to, gid, { since: b.t, by: sim.now + (days + 0.5) * 1440 });
    const fetch = Math.min(estimateSale(sim, to, gid, qty, stockOnArrival(sim, to, b, b.ageDays + days) + inbound, b.desired), believedCash(sim, b));
    const costs = Math.ceil(days) * wagons * cfg.crewPerWagon * (cfg.crewWage + 0.1 * quote(sim, from, 'grain').price);
    const gain = fetch * (1 - Math.min(0.5, 0.02 * (b.ageDays + days))) - costs;
    const perDay = gain / Math.max(0.5, days);
    if (!best || gain > best.gain) best = { to, gain, perDay, days };
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

/** What the player has spent on word from elsewhere (bits): factors' wages and couriers' fees. */
export const playerNewsCost = (sim) => (sim.state.player?.news?.wages ?? 0) + (sim.state.player?.news?.couriers ?? 0);

/**
 * Trading profit (bits), counted as a house's is (profit less the overheads of empty
 * wagons): what the player's caravans' ventures made, plus the stores' sales over cost.
 */
export function playerTradeProfit(sim) {
  let bits = 0;
  for (const m of Object.values(sim.state.merchants.byId)) if (m.player) bits += m.profit - m.overheads;
  for (const e of sim.state.log) if (e.type === 'player:sold') bits += e.profit ?? 0;
  return bits;
}
