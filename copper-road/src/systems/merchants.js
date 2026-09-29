// Merchants: the region's traders (spec §8.4, §10).
//
// A merchant idle in a town sees its market and swaps news at the inn, then
// scores every trade they could make from what they *believe* about the other
// markets: a believed sale (from the price list they hold, however old), cut
// for staleness and trust, less the purchase, market fee, provisions, crew
// wages, tolls, and a risk premium their temper sets. The best trade that clears
// their threshold sets them on the road with real goods in a real wagon.
// Nobody tells them what the others are carrying, so they can all pile into the
// same market, and news that was true when it left town can be false on arrival.
//
// Selling: the market's traders pay from their till, and the town's households
// chip in up to a share of their savings. A town that can't pay for the whole
// load gets a few days as its tills refill; then the merchant takes the rest
// elsewhere, once, and after that sells it for whatever it fetches.
//
// Houses rise and fall. A house spends what it holds beyond its working capital
// on its household at home (and on new wagons); the lord "borrows" from the very
// rich; a house that can no longer fill a wagon is ruined, and a town with
// savings to spare backs a new one.
//
// Goods move only by load/unload (counted in the towns' books); coin only by
// transfer. Every decision keeps its candidates and their parts for the inspector.

import { ordersFor, settleOrders } from './orders.js';
import { guardedCaution, guardsOnRoad, hireGuards, payGuards, releaseGuards } from './mercs.js';
import { GIVEN_NAMES, SURNAMES } from '../data/names.js';
import { economyIndex, estimatePurchase, estimateSale, purchaseCost, quote, saleValue } from '../economy/pricing.js';
import { load, round3, traderAccount, unload } from '../economy/market.js';
import { balance, toBits, toMarks, transfer } from '../economy/money.js';
import { residentsAt } from '../economy/people.js';
import { finishLeg, newTrip, planJourney, reroute, startLeg } from '../world/journey.js';
import { pathNodes } from '../world/routes.js';
import { belief, swapNews } from './knowledge.js';
import { fillOrder, knownOrder } from './lord.js';
import { afterLeg, onLegStart } from './raiders.js';
import { visitWaystation } from './roads.js';

const DAY = 1440;
const round2 = (x) => Math.round(x * 100) / 100;
const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const merchants = {
  id: 'merchants',

  init(sim) {
    const cfg = sim.data.merchants;
    if (!cfg) return;
    const rng = sim.rng('merchants.init');
    const names = rng.shuffle(GIVEN_NAMES.slice());
    sim.state.merchants = { byId: {}, order: [], lastFounded: -99 };
    for (let i = 0; i < cfg.count; i++) {
      const m = newMerchant(sim, rng, {
        given: names[i % names.length],
        house: cfg.houses[i % cfg.houses.length],
        home: cfg.homes[i % cfg.homes.length],
        wagons: rng.int(cfg.wagons[0], cfg.wagons[1]),
      });
      sim.schedule(sim.cal.nextTravelMoment(sim.now) + 30 + i * 20, 'merchant:decide', { id: m.id, tripNo: 0 });
    }
  },

  daily(sim) {
    const cfg = sim.data.merchants;
    if (!sim.state.merchants) return;
    for (const m of activeMerchants(sim)) {
      const acct = account(m);
      const keep = toBits(sim, cfg.keepPerWagon * m.wagons);
      // A thriving house buys another wagon from its home town's wheelwrights.
      if (m.wagons < cfg.maxWagons && balance(sim, acct) > 2 * keep + toBits(sim, cfg.wagonCost) && !m.trip && !m.captive) {
        m.spent += transfer(sim, acct, `purse:${m.home}`, toBits(sim, cfg.wagonCost));
        m.wagons += 1;
        m.capacity = m.wagons * cfg.wagonCapacity;
        m.crew = m.wagons * cfg.crewPerWagon;
        sim.log('merchant:expanded', { who: m.id, at: m.home, wagons: m.wagons });
      }
      // The household lives at home: a mark a day, and a share of whatever the
      // house holds beyond its working capital.
      const spare = balance(sim, acct) - keep;
      m.spent += transfer(sim, acct, `purse:${m.home}`, toBits(sim, cfg.livingCost) + (spare > 0 ? spare * cfg.spendShare : 0));
    }
    foundHouse(sim);
  },

  // The rubber band on success: the richer a merchant, the more the lord "borrows".
  seasonal(sim) {
    const cfg = sim.data.merchants;
    if (!sim.state.merchants) return;
    for (const m of activeMerchants(sim)) {
      const excess = balance(sim, account(m)) - toBits(sim, cfg.forcedLoanAbove);
      if (excess <= 0) continue;
      const taken = transfer(sim, account(m), 'treasury', excess * cfg.forcedLoanShare);
      if (taken) {
        m.loaned += taken;
        sim.log('merchant:forced-loan', { who: m.id, bits: taken });
      }
    }
  },

  handlers: {
    'merchant:decide': onDecide,
    'merchant:node': onNode,
    'merchant:retry': onRetry,
  },
};

export const getMerchant = (sim, id) => sim.state.merchants?.byId[id];
export const activeMerchants = (sim) => (sim.state.merchants?.order ?? []).map((id) => sim.state.merchants.byId[id]).filter((m) => m.active);
const account = (m) => `merchant:${m.id}`;
const hasCargo = (m) => Object.keys(m.cargo).length > 0;
const caution = (m) => (1000 - m.boldness) / 1000;
// Crew are hired for the loaded wagons (the empty ones are roped behind).
const wagonsFor = (sim, m, qty) => Math.min(m.wagons, Math.max(1, Math.ceil(qty / sim.data.merchants.wagonCapacity)));

function newMerchant(sim, rng, { given, house, home, wagons }) {
  const cfg = sim.data.merchants;
  const st = sim.state.merchants;
  const m = {
    id: sim.nextId('m'),
    name: `${given} ${house}`,
    house,
    home,
    active: true,
    founded: sim.now,
    at: home,
    wagons,
    capacity: wagons * cfg.wagonCapacity,
    crew: wagons * cfg.crewPerWagon,
    boldness: rng.int(0, 1000), // permille: 0 = timid, 1000 = reckless
    orders: null, // standing orders (orders.js), set from the temper below
    threshold: rng.int(cfg.threshold[0], cfg.threshold[1]), // marks a day worth the road
    cargo: {},
    venture: null,
    trip: null,
    tripNo: 0,
    idle: 0,
    stuck: 0,
    reason: null,
    trades: 0,
    profit: 0, // bits, over all ventures
    losses: 0, // ventures that lost money
    overheads: 0, // bits: wages and tolls on the road with empty wagons
    spent: 0, // bits the household has spent at home (and on wagons)
    loaned: 0, // bits the lord has "borrowed"
    ledger: [],
  };
  m.orders = ordersFor(m.boldness);
  st.byId[m.id] = m;
  st.order.push(m.id);
  return m;
}

// ── Choosing a trade ────────────────────────────────────────────────────────

function pathTolls(sim, from, path, wagons) {
  let marks = 0;
  for (const node of pathNodes(sim.graph, from, path).slice(1)) marks += (sim.graph.nodes.get(node).toll?.wagon ?? 0) * wagons;
  return marks;
}

/** What a market's traders will part with: they keep back a share of what the town wants. */
function spare(sim, stock, desired) {
  return Math.max(0, stock - sim.data.merchants.keepBack * desired);
}

/**
 * What a market is expected to hold on arrival, from a price list `days` old by
 * then: shortages and gluts ease as the town works, eats and trades (the ships
 * at the Outside close theirs faster). Hyperbolic, so it stays plain arithmetic.
 */
export function stockOnArrival(sim, dest, b, days) {
  const ix = economyIndex(sim.data);
  const rate = ix.isOutside(dest) ? ix.eco.outside[dest].relax : sim.data.merchants.reversion;
  return b.desired + (b.stock - b.desired) / (1 + rate * days);
}

/**
 * Coin a market's buyers were said to have for one load (marks), or Infinity at
 * the Outside: the till on each day the merchant would try (it refills as the
 * town buys), and the households' share of their savings each of those days.
 */
export function believedCash(sim, b) {
  if (!b.coin) return Infinity;
  const cfg = sim.data.merchants;
  let purse = b.coin.purse;
  let cash = 0;
  for (let day = 0; day <= cfg.sellDays; day++) {
    cash += b.coin.till + purse * cfg.householdShare;
    purse *= 1 - cfg.householdShare;
  }
  return cash;
}

/** Every trade a merchant could start from where they stand, best first (marks). */
export function tradeCandidates(sim, m) {
  const cfg = sim.data.merchants;
  const ix = economyIndex(sim.data);
  const here = m.at;
  const grainHere = quote(sim, here, 'grain').price;
  const fee = sim.data.coin.marketFee;
  // Keep back enough for a long trip's wages, provisions and tolls.
  const reserve = cfg.crewPerWagon * 5 * (cfg.crewWage + 0.1 * grainHere) + 6 * m.wagons;
  const budget = toMarks(sim, balance(sim, account(m))) - reserve;
  // Sellswords waiting for work here make a bolder road thinkable (step F): the risk they
  // reckon with, and the road they'd take, are judged as if guarded.
  const nerve = caution(m) * guardedCaution(sim, here);
  const plans = new Map();
  for (const dest of ix.markets) {
    if (dest === here) continue;
    const plan = planJourney(sim, here, dest, { speedKmh: cfg.speedKmh, caution: nerve, holder: m.id });
    if (plan) plans.set(dest, plan);
  }
  const out = [];
  if (budget <= 0) return out;
  for (const gid of ix.goodIds) {
    const market = sim.state.economy.markets[here][gid];
    // Buy what the wagons hold and the market can spare, as far as the purse allows
    // (the price climbs as they buy).
    let qty = Math.floor(Math.min(m.capacity, spare(sim, market.stock, market.desired)));
    if (qty < cfg.minLoad) continue;
    let cost = purchaseCost(sim, here, gid, qty);
    if (cost * (1 + fee) > budget) {
      qty = Math.floor((qty * budget) / (cost * (1 + fee)));
      if (qty < cfg.minLoad) continue;
      cost = purchaseCost(sim, here, gid, qty);
    }
    const wagons = wagonsFor(sim, m, qty);
    for (const [dest, plan] of plans) {
      const b = belief(sim, m.id, dest, gid);
      if (!b) continue;
      const days = plan.hours / 24;
      // What the load should fetch: by the price list, aged to the day they'd
      // arrive, and no more than the town's buyers were said to have in coin.
      const age = b.ageDays + days;
      const expectedStock = stockOnArrival(sim, dest, b, age);
      // An order from the lord they've heard of: part of the load sold at his price, paid by the treasury
      // (if rivals don't fill it first). The rest goes to the market as usual.
      const order = knownOrder(sim, here, dest, gid);
      const toOrder = order ? Math.min(qty, order.remaining) : 0;
      const ordered = toOrder * order?.price * cfg.orderTrust || 0;
      const believed = ordered + Math.min(estimateSale(sim, dest, gid, qty - toOrder, expectedStock, b.desired), believedCash(sim, b));
      // Old news is less sure, and so is word of mouth.
      const stale = Math.min(cfg.maxStale, cfg.stalePerDay * age);
      const revenue = believed * (1 - stale) * (0.5 + 0.5 * b.confidence);
      const crewDays = wagons * cfg.crewPerWagon * Math.ceil(days);
      const provisions = crewDays * 0.1 * grainHere;
      const wages = crewDays * cfg.crewWage;
      const tolls = pathTolls(sim, here, plan.path, m.wagons);
      const risk = plan.exposure * revenue * cfg.riskWeight * nerve;
      const profit = revenue - cost * (1 + fee) - provisions - wages - tolls - risk;
      out.push({
        good: gid, to: dest, qty, wagons, days, cost, fee: cost * fee, believedPrice: b.price, ageDays: b.ageDays, source: b.source,
        expectedStock, believed, stale, revenue, provisions, wages, tolls, risk, profit, perDay: profit / Math.max(days, 0.5), plan,
      });
    }
  }
  out.sort((a, b) => b.perDay - a.perDay || byString(a.good, b.good) || byString(a.to, b.to));
  return out;
}

/** Does a candidate clear the merchant's threshold (marks a day for each loaded wagon)? */
export const worthIt = (m, c) => c.perDay >= m.threshold * c.wagons;

const summarise = (c) => ({
  good: c.good, to: c.to, qty: c.qty, wagons: c.wagons, days: round2(c.days), believedPrice: round2(c.believedPrice),
  ageDays: round2(c.ageDays), source: c.source, revenue: round2(c.revenue), cost: round2(c.cost + c.fee),
  costs: round2(c.provisions + c.wages + c.tolls), risk: round2(c.risk), profit: round2(c.profit), perDay: round2(c.perDay), routes: c.plan.routes,
});

function tomorrow(sim, m) {
  sim.schedule(sim.cal.travelWindow(sim.cal.day(sim.now) + 1)[0] + 30, 'merchant:decide', { id: m.id, tripNo: m.tripNo });
}

function onDecide(sim, { id, tripNo }) {
  const m = getMerchant(sim, id);
  if (!m || !m.active || m.trip || m.captive || m.tripNo !== tripNo) return;
  const cfg = sim.data.merchants;
  swapNews(sim, m.id, m.at);
  settleOrders(sim, m);

  // Goods still in the wagons: a market that couldn't pay for them all.
  if (hasCargo(m)) {
    sellCargo(sim, m);
    if (hasCargo(m)) {
      m.stuck += 1;
      if (m.stuck < cfg.sellDays) return tomorrow(sim, m);
      if (!m.venture?.carried) return carryOn(sim, m);
      sellCargo(sim, m, { dump: true });
    }
  }

  if (balance(sim, account(m)) < toBits(sim, cfg.ruinBelow)) return ruin(sim, m);

  // The most profit a day, among the trades where every loaded wagon earns its keep.
  const cands = tradeCandidates(sim, m);
  const pick = cands.findIndex((c) => worthIt(m, c));
  const shown = cands.slice(0, 4);
  if (pick >= 4) shown.push(cands[pick]);
  m.reason = { t: sim.now, at: m.at, threshold: m.threshold, candidates: shown.map(summarise), choice: null, note: null };
  if (pick >= 0) {
    m.reason.choice = Math.min(pick, 4);
    setOut(sim, m, cands[pick]);
    return;
  }
  m.idle += 1;
  m.reason.note = cands.length ? `nothing here clears ${m.threshold} marks a day a wagon` : 'nothing here worth buying';
  if (m.idle >= cfg.idleDays) {
    const target = bestPlaceToBuy(sim, m);
    if (target) {
      m.reason.note += `; moving on to ${target.to}, where the buying looks better`;
      sim.log('merchant:moving', { who: m.id, from: m.at, to: target.to });
      travel(sim, m, target.to, target.plan, cfg.crewPerWagon);
      return;
    }
  }
  tomorrow(sim, m);
}

// Where would an idle merchant rather be? The town where, by what they've heard,
// a wagonload would buy cheapest against what it fetches elsewhere, allowing for
// the trip there. Only worth the road if it beats their threshold.
function bestPlaceToBuy(sim, m) {
  const cfg = sim.data.merchants;
  const ix = economyIndex(sim.data);
  const fee = sim.data.coin.marketFee;
  const budget = toMarks(sim, balance(sim, account(m))) * 0.8;
  let best = null;
  for (const t of ix.markets) {
    if (t === m.at) continue;
    const plan = planJourney(sim, m.at, t, { speedKmh: cfg.speedKmh, caution: caution(m), holder: m.id });
    if (!plan) continue;
    let margin = 0;
    for (const gid of ix.goodIds) {
      const buy = belief(sim, m.id, t, gid);
      if (!buy) continue;
      const qty = Math.floor(Math.min(m.capacity, spare(sim, buy.stock, buy.desired), budget / Math.max(buy.price, 0.01)));
      if (qty < cfg.minLoad) continue;
      const cost = estimatePurchase(sim, t, gid, qty, buy.stock, buy.desired) * (1 + fee);
      for (const u of ix.markets) {
        if (u === t) continue;
        const sell = belief(sim, m.id, u, gid);
        if (!sell) continue;
        const age = sell.ageDays + plan.hours / 24 + 3;
        const stale = Math.min(cfg.maxStale, cfg.stalePerDay * age);
        const fetch = Math.min(estimateSale(sim, u, gid, qty, stockOnArrival(sim, u, sell, age), sell.desired), believedCash(sim, sell));
        margin = Math.max(margin, fetch * (1 - stale) - cost);
      }
    }
    // Days to get there, plus a typical onward trip.
    const perDay = margin / (plan.hours / 24 + 3);
    if (perDay >= m.threshold * m.wagons && (!best || perDay > best.perDay)) best = { to: t, plan, perDay };
  }
  return best;
}

// ── On the road ─────────────────────────────────────────────────────────────

function setOut(sim, m, c) {
  const here = m.at;
  const cost = purchaseCost(sim, here, c.good, c.qty);
  const got = load(sim, here, c.good, c.qty);
  const paid = transfer(sim, account(m), traderAccount(sim, here), toBits(sim, cost));
  const fee = transfer(sim, account(m), 'treasury', toBits(sim, cost * sim.data.coin.marketFee));
  if (sim.state.coin) sim.state.coin.today.fees += fee;
  const crew = c.wagons * sim.data.merchants.crewPerWagon;
  const guards = hireGuards(sim, m, { exposure: c.plan.exposure, days: c.days, wagons: c.wagons, caution: caution(m), account: account(m), tripNo: m.tripNo + 1, from: here });
  const food = buyProvisions(sim, m, here, c.days, crew + guards.length);
  m.cargo = { [c.good]: round3(got) };
  m.stuck = 0;
  m.venture = {
    good: c.good, qty: round3(got), from: here, to: c.to, departedAt: sim.now,
    bought: paid + fee, provisions: food, tolls: 0, wages: 0, sold: 0, soldQty: 0, at: null, carried: false, dumped: false,
    expected: toBits(sim, c.profit), believedPrice: round2(c.believedPrice), ageDays: round2(c.ageDays), source: c.source,
  };
  sim.log('merchant:departed', {
    who: m.id, from: here, to: c.to, good: c.good, qty: round3(got), wagons: c.wagons, via: c.plan.routes,
    expected: m.venture.expected, ageDays: m.venture.ageDays, source: c.source, guards,
  });
  travel(sim, m, c.to, c.plan, crew, guards);
}

// The crew eat on the road: grain bought where they set out.
function buyProvisions(sim, m, sid, days, crew) {
  const wanted = crew * Math.ceil(days) * 0.1;
  const price = quote(sim, sid, 'grain').price;
  const got = load(sim, sid, 'grain', Math.min(wanted, balance(sim, account(m)) / Math.max(1, toBits(sim, price))));
  return got > 0 ? transfer(sim, account(m), traderAccount(sim, sid), toBits(sim, price * got)) : 0;
}

function travel(sim, m, dest, plan, crew, guards = []) {
  m.idle = 0;
  m.tripNo += 1;
  m.trip = newTrip(sim, { tripNo: m.tripNo, from: m.at, dest, plan, speedKmh: sim.data.merchants.speedKmh });
  m.trip.crew = crew;
  m.trip.guards = guards;
  m.at = null;
  go(sim, m);
}

// Start the next leg, find another way round, or wait for the road to open.
function go(sim, m) {
  if (!startLeg(sim, m.trip, 'merchant:node', m.id)) return onLegStart(sim, 'merchant', m.id, m.trip);
  const plan = planJourney(sim, m.trip.at, m.trip.dest, { speedKmh: sim.data.merchants.speedKmh, caution: caution(m), holder: m.id });
  if (plan) {
    reroute(m.trip, plan);
    if (!startLeg(sim, m.trip, 'merchant:node', m.id)) return onLegStart(sim, 'merchant', m.id, m.trip);
  }
  m.trip.waiting = true;
  sim.schedule(sim.cal.travelWindow(sim.cal.day(sim.now) + 1)[0], 'merchant:retry', { id: m.id, tripNo: m.tripNo });
}

function onRetry(sim, { id, tripNo }) {
  const m = getMerchant(sim, id);
  if (!m?.trip || m.trip.tripNo !== tripNo || !m.trip.waiting) return;
  go(sim, m);
}

function onNode(sim, { id, tripNo }) {
  const m = getMerchant(sim, id);
  if (!m?.trip || m.trip.tripNo !== tripNo || !m.trip.legSeg) return;
  const seg = finishLeg(sim, m.trip);
  guardsOnRoad(sim, m.trip, seg.id);
  afterLeg(sim, m.id, seg.id, m.trip);
  visitWaystation(sim, m.id, m.trip.at);
  const toll = (sim.graph.nodes.get(m.trip.at).toll?.wagon ?? 0) * m.wagons;
  if (toll) {
    const paid = transfer(sim, account(m), 'treasury', toBits(sim, toll));
    if (m.venture) m.venture.tolls += paid;
    else m.overheads += paid;
    if (sim.state.coin) sim.state.coin.today.tolls += paid;
  }
  if (m.trip.at !== m.trip.dest) {
    go(sim, m);
    return;
  }
  arrive(sim, m);
}

function arrive(sim, m) {
  const cfg = sim.data.merchants;
  const trip = m.trip;
  m.at = trip.dest;
  m.trip = null;
  m.stuck = 0;
  swapNews(sim, m.id, m.at);
  // The crew are paid off where the trip ends, and spend it there.
  const days = Math.max(1, Math.ceil((sim.now - trip.departedAt) / DAY));
  // Guards are paid their own rates, and are free to hire again from here.
  // A double watch at night (their standing orders) costs more.
  const watch = m.orders?.night === 'watch' ? 1.15 : 1;
  const wages = transfer(sim, account(m), `purse:${m.at}`, toBits(sim, trip.crew * days * cfg.crewWage * watch)) + payGuards(sim, trip, days, account(m));
  releaseGuards(sim, trip, m.at);
  if (m.venture) m.venture.wages += wages;
  else m.overheads += wages;
  if (hasCargo(m)) {
    sellCargo(sim, m);
    const left = Object.entries(m.cargo)[0];
    if (left) sim.log('merchant:unsold', { who: m.id, at: m.at, good: left[0], qty: round3(left[1]) });
  }
  sim.schedule(sim.cal.nextTravelMoment(sim.now + cfg.restHours * 60), 'merchant:decide', { id: m.id, tripNo: m.tripNo });
}

// ── Selling ─────────────────────────────────────────────────────────────────

/** The most of `qty` that `money` bits will pay for in this market (prices fall as the goods go in). */
export function sellable(sim, sid, gid, qty, money) {
  if (toBits(sim, saleValue(sim, sid, gid, qty)) <= money) return qty;
  let lo = 0;
  let hi = qty;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (toBits(sim, saleValue(sim, sid, gid, mid)) <= money) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 10) / 10;
}

/**
 * Sell what's in the wagons to the market's traders. If their till runs short,
 * the town's households chip in, up to a share of their savings; beyond that the
 * goods stay in the wagons, unless the merchant is dumping them for what they fetch.
 * The ships at the Outside can always pay.
 */
function sellCargo(sim, m, { dump = false } = {}) {
  const cfg = sim.data.merchants;
  const sid = m.at;
  const buyer = traderAccount(sim, sid);
  const outside = buyer === 'ships';
  for (const gid of Object.keys(m.cargo).sort()) {
    // First anything the lord has ordered here: the treasury pays his price.
    const fill = fillOrder(sim, sid, gid, m.cargo[gid], account(m));
    if (fill.qty > 0) {
      const left = round3(m.cargo[gid] - fill.qty);
      if (left > 0) m.cargo[gid] = left;
      else delete m.cargo[gid];
      if (m.venture) {
        m.venture.sold += fill.bits;
        m.venture.soldQty = round3(m.venture.soldQty + fill.qty);
        m.venture.at = sid;
      }
      sim.log('merchant:order', { who: m.id, at: sid, good: gid, qty: fill.qty, bits: fill.bits });
      if (!m.cargo[gid]) continue;
    }
    const qty = m.cargo[gid];
    const till = outside ? Infinity : balance(sim, buyer);
    const money = outside ? Infinity : till + Math.floor(balance(sim, `purse:${sid}`) * cfg.householdShare);
    let sell = dump || outside ? qty : sellable(sim, sid, gid, qty, money);
    if (qty - sell < 0.1) sell = qty; // when a load all but sells, the crumbs go with it
    if (!(sell > 0)) continue;
    const bits = Math.min(toBits(sim, saleValue(sim, sid, gid, sell)), money);
    if (bits > till) transfer(sim, `purse:${sid}`, buyer, bits - till);
    const paid = transfer(sim, buyer, account(m), bits);
    unload(sim, sid, gid, sell);
    const left = round3(qty - sell);
    if (left > 0) m.cargo[gid] = left;
    else delete m.cargo[gid];
    if (m.venture) {
      m.venture.sold += paid;
      m.venture.soldQty = round3(m.venture.soldQty + sell);
      m.venture.at = sid;
      if (dump) m.venture.dumped = true;
    }
  }
  if (m.venture && !hasCargo(m)) settle(sim, m);
}

/**
 * Goods taken from the wagons on the road (raiders, step E). Returns what was lost.
 */
export function loseCargo(sim, m, gid, qty) {
  const have = m.cargo[gid] ?? 0;
  let lost = Math.min(have, qty);
  if (!(lost > 0)) return 0;
  if (have - lost < 0.1) lost = have; // the crumbs go too
  const left = round3(have - lost);
  if (left > 0) m.cargo[gid] = left;
  else delete m.cargo[gid];
  if (m.venture) m.venture.lost = round3((m.venture.lost ?? 0) + lost);
  return lost;
}

/** After a robbery: a venture with nothing left to sell is written off. */
export function writeOffIfEmpty(sim, m) {
  if (m.venture && !hasCargo(m)) settle(sim, m);
}

function settle(sim, m) {
  const v = m.venture;
  const costs = v.bought + v.provisions + v.tolls + v.wages;
  const profit = v.sold - costs;
  m.trades += 1;
  m.profit += profit;
  if (profit < 0) m.losses += 1;
  const entry = {
    good: v.good, qty: v.soldQty, from: v.from, to: v.at ?? v.to, days: round2((sim.now - v.departedAt) / DAY),
    sold: v.sold, costs, profit, expected: v.expected, ageDays: v.ageDays, source: v.source, dumped: v.dumped, lost: v.lost ?? 0, t: sim.now,
  };
  m.ledger.push(entry);
  if (m.ledger.length > 12) m.ledger.shift();
  if (v.soldQty > 0) {
    sim.log('merchant:sold', {
      who: m.id, at: v.at, good: v.good, qty: v.soldQty, sold: v.sold, profit, expected: v.expected, ageDays: v.ageDays, dumped: v.dumped, lost: v.lost ?? 0,
    });
  } else {
    sim.log('merchant:lost', { who: m.id, good: v.good, qty: v.lost ?? v.qty, profit });
  }
  m.venture = null;
}

// Goods a market couldn't pay for: take them where they're believed to fetch most.
function carryOn(sim, m) {
  const cfg = sim.data.merchants;
  const [gid, qty] = Object.entries(m.cargo)[0];
  let best = null;
  for (const dest of economyIndex(sim.data).markets) {
    if (dest === m.at) continue;
    const plan = planJourney(sim, m.at, dest, { speedKmh: cfg.speedKmh, caution: caution(m), holder: m.id });
    const b = belief(sim, m.id, dest, gid);
    if (!plan || !b) continue;
    const days = plan.hours / 24;
    const value = Math.min(estimateSale(sim, dest, gid, qty, stockOnArrival(sim, dest, b, b.ageDays + days), b.desired), believedCash(sim, b)) / (1 + days);
    if (!best || value > best.value) best = { dest, plan, value };
  }
  if (!best) {
    sellCargo(sim, m, { dump: true });
    return tomorrow(sim, m);
  }
  m.venture.carried = true;
  m.venture.to = best.dest;
  sim.log('merchant:moving', { who: m.id, from: m.at, to: best.dest, good: gid });
  travel(sim, m, best.dest, best.plan, wagonsFor(sim, m, qty) * cfg.crewPerWagon);
}

// ── Houses rise and fall ────────────────────────────────────────────────────

function ruin(sim, m) {
  m.active = false;
  m.ruinedAt = sim.now;
  // What's left goes home with them.
  transfer(sim, account(m), `purse:${m.home}`, balance(sim, account(m)));
  sim.log('merchant:ruined', { who: m.id, at: m.at, trades: m.trades, profit: m.profit });
}

// When there are fewer houses than the region supports, a new one is founded:
// by a peddler who has saved enough to buy a wagon and leave the pack behind,
// or else by the town with the most savings per head, if it can spare the capital.
function foundHouse(sim) {
  const cfg = sim.data.merchants;
  const st = sim.state.merchants;
  const day = sim.cal.day(sim.now);
  const active = activeMerchants(sim).length;
  if (active >= cfg.count + (cfg.peddlerHouses ?? 0) || day - st.lastFounded < cfg.foundEvery) return;
  const rng = sim.rng('merchants.found');
  // A new name if one's left; failing that, a fallen house's name taken up again.
  const ever = new Set(Object.values(st.byId).map((m) => m.house));
  const taken = new Set(activeMerchants(sim).map((m) => m.house));
  const fresh = cfg.houses.filter((h) => !ever.has(h));
  const free = cfg.houses.filter((h) => !taken.has(h));
  const newHouse = () => (fresh.length ? rng.pick(fresh) : free.length ? rng.pick(free) : rng.pick(SURNAMES.filter((h) => !taken.has(h))));

  const peddler = richestPeddler(sim);
  if (peddler) {
    const w = peddler;
    const m = newMerchant(sim, rng, { given: w.name, house: newHouse(), home: w.at, wagons: cfg.wagons[0] });
    const capital = transfer(sim, `wayfarer:${w.id}`, account(m), balance(sim, `wayfarer:${w.id}`));
    // The peddler leaves the road for good: out of the wayfarers' round, into the ledger of houses.
    w.retired = sim.now;
    w.becameMerchant = m.id;
    m.wasWayfarer = w.id;
    const ws = sim.state.wayfarers;
    ws.order = ws.order.filter((id) => id !== w.id);
    st.lastFounded = day;
    sim.log('merchant:founded', { who: m.id, at: m.home, bits: capital, peddler: w.id });
    sim.schedule(sim.cal.nextTravelMoment(sim.now) + 30, 'merchant:decide', { id: m.id, tripNo: 0 });
    return;
  }

  if (active >= cfg.count) return; // the extra room is only for peddlers made good
  let best = null;
  for (const sid of economyIndex(sim.data).markets) {
    const heads = residentsAt(sim, sid).length;
    const purse = balance(sim, `purse:${sid}`);
    if (!heads || purse < toBits(sim, cfg.foundPurseAbove * heads + cfg.foundCapital)) continue;
    if (!best || purse / heads > best.perHead) best = { sid, perHead: purse / heads };
  }
  if (!best) return;
  const m = newMerchant(sim, rng, { given: rng.pick(GIVEN_NAMES), house: newHouse(), home: best.sid, wagons: cfg.wagons[0] });
  const capital = transfer(sim, `purse:${best.sid}`, account(m), toBits(sim, cfg.foundCapital));
  st.lastFounded = day;
  sim.log('merchant:founded', { who: m.id, at: best.sid, bits: capital });
  sim.schedule(sim.cal.nextTravelMoment(sim.now) + 30, 'merchant:decide', { id: m.id, tripNo: 0 });
}

// A resting peddler or tinker, pack sold, with a wagon's worth of savings.
function richestPeddler(sim) {
  const cfg = sim.data.merchants;
  const need = toBits(sim, cfg.foundCapital + (sim.data.coin.wayfarerComfort ?? 0));
  let best = null;
  for (const id of sim.state.wayfarers?.order ?? []) {
    const w = sim.state.wayfarers.byId[id];
    const trade = sim.data.wayfarers.trades.find((t) => t.id === w.trade);
    if (!trade?.pack || w.trip || !w.at || w.pack) continue;
    const purse = balance(sim, `wayfarer:${id}`);
    if (purse >= need && (!best || purse > best.purse)) best = { w, purse };
  }
  return best?.w ?? null;
}
