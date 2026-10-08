// The player (step G, spec §4, §5, §15): a person in one place.
//
// You inherit the family stall in Kingscross and the family's debt to the
// money-changer, both at once. You know your own town's market (you're standing
// in it); everything else reaches you as it reaches everyone: by letter, by
// hearsay at the inn, from your caravans' crews when they come home, or by going
// to see. Everything you do is a command (sim.command), run through the same
// event machinery as the rest of the world:
//
//   player:buy / player:sell      trade in the market where you stand (goods go
//                                 to and from your stores in that town)
//   player:dispatch               send a caravan from your stores: a good, a road,
//                                 guards, standing orders, what to do on arrival;
//                                 ride with it yourself if you like
//   player:orders                 new orders for a caravan standing where you are
//   player:travel                 ride somewhere yourself
//   player:courier                pay a rider to carry orders to a caravan in
//                                 another town, and bring back that town's board
//   player:borrow / player:repay  the money-changer's note
//   player:buy-wagon              another wagon from the wheelwrights
//
// Your caravans are merchant records with `player: true` (merchants.js), so they
// travel, sell, pay crews and tolls, hire guards and meet bands by the very same
// code as the trading houses. Riding with one, you can be killed or taken; if
// you die, your heir (the next of the family) takes up the ledger, the stores and
// the debt. Miss the changer's payments and he seizes what he can; broke with
// nothing left to seize, you work off your debt as a bonded factor for a season.
//
// Money moves by transfer only; goods by load/unload.

import { purchaseCost, quote, saleValue } from '../economy/pricing.js';
import { load, round3, traderAccount, unload } from '../economy/market.js';
import { balance, toBits, transfer } from '../economy/money.js';
import { residentsAt } from '../economy/people.js';
import { finishLeg, newTrip, planJourney, reroute, startLeg } from '../world/journey.js';
import { pathKm } from '../world/routes.js';
import { holderOf, learn, snapshot, swapBetween, swapNews } from './knowledge.js';
import { accountOf, activeMerchants, buyProvisions, getMerchant, sellCargo, sellable, travel } from './merchants.js';
import { hireGuards } from './mercs.js';
import { ordersFor } from './orders.js';
import { afterLeg, onLegStart } from './raiders.js';

const DAY = 1440;

export const PLAYER = 'player'; // the player's account and knowledge holder

export const player = {
  id: 'player',

  init(sim) {
    const cfg = sim.data.player;
    if (!cfg || !sim.state.merchants) return;
    const rng = sim.rng('player.init');
    const porter = residentsAt(sim, cfg.home).find((r) => r.profession === 'porter');
    const st = (sim.state.player = {
      family: cfg.family,
      name: `${rng.pick(cfg.given)} ${cfg.family}`,
      generation: 1,
      home: cfg.home,
      at: cfg.home,
      with: null, // the caravan they ride with
      wagons: cfg.wagons,
      caravans: [], // merchant ids of their caravans
      stores: { [cfg.home]: {} }, // per town: { good: { qty, cost (bits) } }
      debt: { principal: toBits(sim, cfg.debt.principal), missed: 0, paid: 0, interest: 0, collector: null },
      bonded: null, // until when, if bankrupt
      couriers: {},
      factors: {}, // by town: { id, resident, at, since, honesty (hidden), sellAbove, unpaid, skimmed, sold, reports }
      mail: {}, // letters waiting at a town for the player to come and read them
      porter: porter?.id ?? null,
      ledger: [],
      died: [],
      nextId: 1,
    });
    // The stall's stock was always the family's, not the market's.
    for (const [gid, qty] of Object.entries(cfg.stall)) st.stores[cfg.home][gid] = { qty, cost: toBits(sim, quote(sim, cfg.home, gid).base * qty) };
    // Letters from the parent's old contacts, still on the road.
    for (const c of cfg.contacts) sim.schedule(sim.now + c.arrives * DAY, 'player:contact', { at: c.at, ageDays: c.ageDays, from: c.from });
    sim.log('player:inherits', { who: st.name, parent: cfg.parent, at: cfg.home, debt: st.debt.principal, porter: st.porter });
    entry(sim, 'inherited', { parent: cfg.parent, debt: st.debt.principal });
  },

  daily(sim) {
    const st = sim.state.player;
    if (!st) return;
    const cfg = sim.data.player;
    // Where you are, you hear the talk at the inn (and read any letters waiting there).
    if (st.at && sim.state.knowledge) {
      swapNews(sim, PLAYER, st.at, { look: Boolean(sim.state.economy.markets[st.at]) });
      readMail(sim, st.at);
    }
    // Wagons standing idle away from home pay for stabling.
    for (const m of caravans(sim)) {
      if (!m.trip && !m.captive && m.at && m.at !== st.home) transfer(sim, PLAYER, `purse:${m.at}`, toBits(sim, cfg.stableFee * Math.max(1, m.wagons)));
    }
    // The changer's household lives on the interest.
    const spare = balance(sim, 'changer') - toBits(sim, cfg.changer.spendAbove);
    if (spare > 0) transfer(sim, 'changer', `purse:${st.home}`, spare / 10);
    if (st.bonded) {
      if (sim.now >= st.bonded.until) release(sim);
      else bondedDay(sim);
    }
    for (const f of Object.values(st.factors)) factorDay(sim, f);
  },

  // The money-changer's due, and the lord's "loans" from the rich (the same rubber band as the houses).
  seasonal(sim) {
    const st = sim.state.player;
    if (!st) return;
    payChanger(sim);
    const mc = sim.data.merchants;
    const excess = balance(sim, PLAYER) - toBits(sim, mc.forcedLoanAbove);
    if (excess > 0) {
      const taken = transfer(sim, PLAYER, 'treasury', excess * mc.forcedLoanShare);
      if (taken) {
        sim.log('player:forced-loan', { bits: taken });
        entry(sim, 'forced-loan', { bits: taken });
      }
    }
  },

  handlers: {
    'player:buy': onBuy,
    'player:sell': onSell,
    'player:dispatch': onDispatch,
    'player:orders': onOrders,
    'player:travel': onTravel,
    'player:courier': onCourier,
    'player:borrow': onBorrow,
    'player:repay': onRepay,
    'player:buy-wagon': onBuyWagon,
    'player:sell-wagon': onSellWagon,
    'player:contact': onContact,
    'player:courier-node': onCourierNode,
    'player:courier-wait': onCourierWait,
    'player:hire-factor': onHireFactor,
    'player:dismiss-factor': onDismissFactor,
  },
};

export const getPlayer = (sim) => sim.state.player;
export const caravans = (sim) => (sim.state.player?.caravans ?? []).map((id) => getMerchant(sim, id)).filter((m) => m?.active);
export const getCourier = (sim, id) => sim.state.player?.couriers[id];
const nextId = (st, prefix) => `${prefix}${st.nextId++}`;

// The player's own ledger (for the panel): every deal, trip, letter and payment.
function entry(sim, type, fields) {
  const st = sim.state.player;
  st.ledger.push({ t: sim.now, type, ...fields });
  if (st.ledger.length > 80) st.ledger.shift();
}

// Logs why a command can't be done; true, so a guard reads `if (busy(sim, kind)) return;`.
function refuse(sim, command, why) {
  sim.log('player:refused', { command, why });
  return true;
}

// Bonded, taken, or on the road: some things can't be done from here.
function busy(sim, command) {
  const st = sim.state.player;
  if (st.bonded) return refuse(sim, command, 'bonded');
  if (captiveCaravan(sim)) return refuse(sim, command, 'captive');
  if (!st.at) return refuse(sim, command, 'on the road');
  return false;
}

const captiveCaravan = (sim) => caravans(sim).find((m) => m.captive && m.rider);
const idleWagons = (sim) => sim.state.player.wagons - caravans(sim).reduce((a, m) => a + m.wagons, 0);

// ── Stores ─────────────────────────────────────────────────────────────────

function store(st, sid) {
  return (st.stores[sid] ??= {});
}

function addStore(st, sid, gid, qty, cost) {
  const s = store(st, sid);
  const have = s[gid] ?? { qty: 0, cost: 0 };
  s[gid] = { qty: round3(have.qty + qty), cost: have.cost + Math.round(cost) };
}

// A caravan's load into your stores where it stands, keeping what it cost.
function stow(sim, m) {
  const st = sim.state.player;
  const v = m.venture;
  for (const [gid, q] of Object.entries(m.cargo)) addStore(st, m.at, gid, q, v?.good === gid && v.qty > 0 ? Math.round((v.bought * q) / v.qty) : 0);
  m.cargo = {};
}

// Take from a store; returns the cost basis of what was taken.
function takeStore(st, sid, gid, qty) {
  const s = store(st, sid);
  const have = s[gid];
  if (!have || have.qty < qty - 1e-9) return null;
  const cost = Math.round((have.cost * qty) / have.qty);
  const left = round3(have.qty - qty);
  if (left > 0.001) s[gid] = { qty: left, cost: have.cost - cost };
  else delete s[gid];
  return cost;
}

// ── Trading where you stand ─────────────────────────────────────────────────

function onBuy(sim, { good, qty }) {
  if (busy(sim, 'buy')) return;
  const st = sim.state.player;
  const sid = st.at;
  const m = sim.state.economy.markets[sid]?.[good];
  if (!m) return refuse(sim, 'buy', 'no market');
  qty = Math.floor(Math.min(qty, m.stock) * 10) / 10;
  if (!(qty > 0)) return refuse(sim, 'buy', 'none to buy');
  const cost = purchaseCost(sim, sid, good, qty);
  const bits = toBits(sim, cost);
  const fee = toBits(sim, cost * sim.data.coin.marketFee);
  if (balance(sim, PLAYER) < bits + fee) return refuse(sim, 'buy', 'not enough coin');
  const got = load(sim, sid, good, qty);
  const paid = transfer(sim, PLAYER, traderAccount(sim, sid), bits);
  const tax = transfer(sim, PLAYER, 'treasury', fee);
  if (sim.state.coin) sim.state.coin.today.fees += tax;
  addStore(st, sid, good, got, paid + tax);
  sim.log('player:bought', { at: sid, good, qty: got, bits: paid + tax });
  entry(sim, 'bought', { at: sid, good, qty: got, bits: paid + tax });
}

function onSell(sim, { good, qty }) {
  if (busy(sim, 'sell')) return;
  const st = sim.state.player;
  const sid = st.at;
  const have = st.stores[sid]?.[good]?.qty ?? 0;
  qty = Math.min(qty, have);
  if (!(qty > 0)) return refuse(sim, 'sell', 'none in store');
  if (!sellFromStore(sim, sid, good, qty, 'player')) refuse(sim, 'sell', 'nobody can pay');
}

// Sell from your stores in a town to its market (you, or your factor there). Returns true if anything sold.
function sellFromStore(sim, sid, good, qty, by) {
  const st = sim.state.player;
  const buyer = traderAccount(sim, sid);
  const outside = buyer === 'ships';
  const till = outside ? Infinity : balance(sim, buyer);
  const money = outside ? Infinity : till + Math.floor(balance(sim, `purse:${sid}`) * sim.data.merchants.householdShare);
  let sell = outside ? qty : sellable(sim, sid, good, qty, money);
  if (qty - sell < 0.1) sell = qty;
  if (!(sell > 0)) return false;
  const bits = Math.min(toBits(sim, saleValue(sim, sid, good, sell)), money);
  if (bits > till) transfer(sim, `purse:${sid}`, buyer, bits - till);
  const paid = transfer(sim, buyer, PLAYER, bits);
  const cost = takeStore(st, sid, good, sell);
  unload(sim, sid, good, sell);
  sim.log('player:sold', { at: sid, good, qty: sell, bits: paid, profit: paid - cost, by });
  entry(sim, 'sold', { at: sid, good, qty: sell, bits: paid, profit: paid - cost, by });
  return true;
}

// ── Caravans ────────────────────────────────────────────────────────────────

const CAUTION = { fast: 0.1, balanced: 0.5, safe: 0.95 };

/**
 * Send a caravan from where you stand: `good`/`qty` from your stores there (or
 * none: an empty run), to `to`, by the `road` you prefer (fast, balanced, safe),
 * with `guards` ('auto' by believed danger, or a number), standing `orders`, and
 * on arrival `sell` ('all' or 'none') and `then` ('wait', 'home' or 'store').
 * `ride`: go with it yourself.
 */
function onDispatch(sim, { to, good = null, qty = 0, wagons = null, road = 'balanced', guards = 'auto', orders = null, sell = 'all', then = 'wait', ride = false }) {
  if (busy(sim, 'dispatch')) return;
  hearInn(sim);
  const st = sim.state.player;
  const cfg = sim.data.merchants;
  const from = st.at;
  if (!sim.graph.nodes.get(to) || to === from) return refuse(sim, 'dispatch', 'no such place');
  // A caravan of yours waiting here can be loaded and sent on; at home, wagons in the yard too.
  const waiting = caravans(sim).find((c) => !c.trip && !c.captive && c.at === from && c.wagons > 0);
  // Unload what it carries into your stores here, keeping what it cost.
  if (waiting) stow(sim, waiting);
  qty = good ? Math.min(qty, st.stores[from]?.[good]?.qty ?? 0) : 0;
  const need = Math.max(1, Math.ceil(qty / cfg.wagonCapacity));
  const spare = (waiting?.wagons ?? 0) + (from === st.home ? idleWagons(sim) : 0);
  wagons = Math.max(need, wagons ?? need, waiting?.wagons ?? 0);
  if (wagons > spare) return refuse(sim, 'dispatch', 'not enough wagons');
  const caution = CAUTION[road] ?? 0.5;
  const plan = planJourney(sim, from, to, { speedKmh: cfg.speedKmh, caution, holder: PLAYER });
  if (!plan) return refuse(sim, 'dispatch', 'no road');
  const standing = orders ?? ordersFor(Math.round((1 - caution) * 1000));
  const m = waiting ?? newCaravan(sim, { at: from, wagons, caution, orders: standing, sell, then });
  if (waiting) {
    Object.assign(m, { wagons, capacity: wagons * cfg.wagonCapacity, crew: wagons * cfg.crewPerWagon, boldness: Math.round((1 - caution) * 1000), orders: standing, instructions: { sell, then }, venture: null });
  }
  const cost = qty > 0 ? takeStore(st, from, good, qty) : 0;
  if (qty > 0) m.cargo[good] = qty;
  // The caravan knows what you know.
  copyKnowledge(sim, PLAYER, m.id);
  // As for the houses: crew for the loaded wagons (the empty ones are roped behind), and
  // guards as the danger to the load warrants (none for empty wagons) unless you say how many.
  const crew = need * cfg.crewPerWagon;
  const days = plan.hours / 24;
  const hired = guards === 'auto'
    ? hireGuards(sim, m, { exposure: plan.exposure, days, wagons: qty > 0 ? need : 0, caution, account: PLAYER, tripNo: m.tripNo + 1, from })
    : hireGuards(sim, m, { want: Math.max(0, Math.min(4, guards | 0)), exposure: plan.exposure, days, wagons, caution, account: PLAYER, tripNo: m.tripNo + 1, from });
  const food = buyProvisions(sim, m, from, days, crew + hired.length);
  m.venture = qty > 0
    ? { good, qty, from, to, departedAt: sim.now, bought: cost, provisions: food, tolls: 0, wages: 0, sold: 0, soldQty: 0, at: null, carried: false, dumped: false, expected: 0, believedPrice: 0, ageDays: 0, source: 'player' }
    : null;
  if (ride) mount(sim, m);
  sim.log('player:dispatched', { who: m.id, from, to, good, qty, wagons, guards: hired, ride, via: plan.routes, sell, then });
  entry(sim, 'dispatched', { caravan: m.id, from, to, good, qty, ride });
  travel(sim, m, to, plan, crew, hired);
}

// Ride somewhere yourself (on horseback, alone).
function onTravel(sim, { to, road = 'balanced' }) {
  if (busy(sim, 'travel')) return;
  hearInn(sim);
  const st = sim.state.player;
  if (!sim.graph.nodes.get(to) || to === st.at) return refuse(sim, 'travel', 'no such place');
  const caution = CAUTION[road] ?? 0.5;
  const plan = planJourney(sim, st.at, to, { speedKmh: sim.data.player.travelKmh, caution, holder: PLAYER });
  if (!plan) return refuse(sim, 'travel', 'no road');
  const m = newCaravan(sim, { at: st.at, wagons: 0, caution, orders: ordersFor(Math.round((1 - caution) * 1000)), sell: 'none', then: 'dissolve', speedKmh: sim.data.player.travelKmh });
  copyKnowledge(sim, PLAYER, m.id);
  mount(sim, m);
  sim.log('player:travels', { from: st.at, to, via: plan.routes });
  entry(sim, 'travels', { to });
  travel(sim, m, to, plan, 0, []);
}

function mount(sim, m) {
  const st = sim.state.player;
  m.rider = true;
  m.name = st.name; // it's your caravan the bands see now
  st.with = m.id;
  st.at = null;
}

function newCaravan(sim, { at, wagons, caution, orders, sell, then, speedKmh = null }) {
  const st = sim.state.player;
  const cfg = sim.data.merchants;
  const ms = sim.state.merchants;
  const m = {
    id: sim.nextId('m'),
    name: `the ${st.family} family`,
    house: st.family,
    home: st.home,
    active: true,
    founded: sim.now,
    at,
    wagons,
    capacity: wagons * cfg.wagonCapacity,
    crew: wagons * cfg.crewPerWagon,
    boldness: Math.round((1 - caution) * 1000),
    threshold: 0,
    cargo: {},
    venture: null,
    trip: null,
    tripNo: 0,
    idle: 0,
    stuck: 0,
    reason: null,
    trades: 0,
    profit: 0,
    losses: 0,
    overheads: 0,
    spent: 0,
    loaned: 0,
    ledger: [],
    orders,
    player: true, // run by the player's commands, not merchant AI
    account: PLAYER,
    instructions: { sell, then },
    rider: false,
    speedKmh,
  };
  ms.byId[m.id] = m;
  ms.order.push(m.id);
  st.caravans.push(m.id);
  return m;
}

function copyKnowledge(sim, from, to) {
  const src = holderOf(sim, from);
  for (const key of Object.keys(src ?? {}).sort()) learn(sim, to, src[key]);
}

/** A player's caravan has reached its destination (called by merchants.js before selling). */
export function playerCaravanArrived(sim, m) {
  const st = sim.state.player;
  if (m.rider) {
    // You get down where it stops, and see the town for yourself.
    m.rider = false;
    m.name = `the ${st.family} family`;
    st.with = null;
    st.at = m.at;
    swapBetween(sim, PLAYER, m.id);
    swapNews(sim, PLAYER, m.at, { look: Boolean(sim.state.economy.markets[m.at]) });
    sim.log('player:arrived', { at: m.at });
    entry(sim, 'arrived', { at: m.at });
  } else if (st.at === m.at) {
    swapBetween(sim, PLAYER, m.id); // the crew's news, when they come in
  }
}

/** Sell what's in a player's wagons here (the merchants' own selling), and note what it fetched. */
export function sellForPlayer(sim, m) {
  const before = { ...m.cargo };
  const coin = balance(sim, PLAYER);
  sellCargo(sim, m);
  const bits = balance(sim, PLAYER) - coin;
  for (const [gid, qty] of Object.entries(before)) {
    const sold = round3(qty - (m.cargo[gid] ?? 0));
    if (sold > 0) {
      sim.log('player:caravan-sold', { who: m.id, at: m.at, good: gid, qty: sold, bits, left: m.cargo[gid] ?? 0 });
      entry(sim, 'caravan-sold', { caravan: m.id, at: m.at, good: gid, qty: sold, bits });
    }
  }
}

/**
 * A player's caravan standing idle (merchants.js calls this instead of the AI):
 * orders a courier brought, else its standing instruction for after arrival.
 */
export function playerCaravanIdle(sim, m) {
  const st = sim.state.player;
  if (st.at === m.at) swapBetween(sim, PLAYER, m.id);
  const ins = m.instructions ?? {};
  if (ins.then === 'dissolve' || (m.at === st.home && ins.then !== 'wait-here')) return dissolve(sim, m);
  if (ins.then === 'store') {
    stow(sim, m);
    ins.then = 'wait';
  }
  if (ins.then === 'home') {
    ins.then = 'dissolve';
    ins.sell = 'none';
    return goTo(sim, m, st.home);
  }
  // Otherwise it waits here for orders (from you, if you're here, or by courier).
}

// Home again: the wagons go back in the yard, anything unsold into the stall.
function dissolve(sim, m) {
  const st = sim.state.player;
  stow(sim, m);
  m.active = false;
  st.caravans = st.caravans.filter((id) => id !== m.id);
  if (st.at === m.at) swapBetween(sim, PLAYER, m.id);
  sim.log('player:caravan-home', { who: m.id, at: m.at });
}

function goTo(sim, m, dest) {
  const cfg = sim.data.merchants;
  const plan = planJourney(sim, m.at, dest, { speedKmh: m.speedKmh ?? cfg.speedKmh, caution: (1000 - m.boldness) / 1000, holder: m.id });
  if (!plan) return false;
  // Crew for the loaded wagons, guards for the load (as in dispatch).
  const qty = Object.values(m.cargo).reduce((a, q) => a + q, 0);
  const loaded = qty > 0 ? Math.min(m.wagons, Math.ceil(qty / cfg.wagonCapacity)) : 0;
  const crew = m.wagons ? Math.max(1, loaded) * cfg.crewPerWagon : 0;
  const hired = loaded ? hireGuards(sim, m, { exposure: plan.exposure, days: plan.hours / 24, wagons: loaded, caution: (1000 - m.boldness) / 1000, account: PLAYER, tripNo: m.tripNo + 1, from: m.at }) : [];
  if (crew) buyProvisions(sim, m, m.at, plan.hours / 24, crew + hired.length);
  travel(sim, m, dest, plan, crew, hired);
  return true;
}

/**
 * New orders for a caravan: `to` (go on there), `sell` ('all'/'none'), `then`.
 * Given in person where the caravan stands, or carried by a courier.
 */
function applyOrders(sim, m, { to = null, sell = null, then = null, ride = false }) {
  if (sell) m.instructions.sell = sell;
  if (then) m.instructions.then = then;
  // Sell here first, if that's the order and the wagons are loaded.
  if (sell === 'all' && !m.trip && Object.keys(m.cargo).length && sim.state.economy.markets[m.at]) sellForPlayer(sim, m);
  if (to && to !== m.at) {
    if (ride) mount(sim, m);
    return goTo(sim, m, to);
  }
  if (!m.trip) playerCaravanIdle(sim, m);
  return true;
}

function onOrders(sim, { caravan, ...orders }) {
  if (busy(sim, 'orders')) return;
  const m = getMerchant(sim, caravan);
  if (!m?.player || !m.active || m.trip || m.at !== sim.state.player.at) return refuse(sim, 'orders', 'the caravan is not here');
  applyOrders(sim, m, orders);
  entry(sim, 'orders', { caravan, ...orders });
}

// ── Couriers ────────────────────────────────────────────────────────────────

/**
 * Pay a rider to carry a letter to `to`: orders for a caravan there (or on its way
 * there; they wait a few days for it), and bring back that town's board.
 */
function onCourier(sim, { to, caravan = null, orders = null }) {
  if (busy(sim, 'courier')) return;
  hearInn(sim);
  const st = sim.state.player;
  const cfg = sim.data.player.courier;
  if (!sim.graph.nodes.get(to) || to === st.at) return refuse(sim, 'courier', 'no such place');
  const plan = planJourney(sim, st.at, to, { speedKmh: cfg.speedKmh, caution: 0.6, holder: PLAYER });
  if (!plan) return refuse(sim, 'courier', 'no road');
  const fee = toBits(sim, Math.max(cfg.min, cfg.perKm * 2 * pathKm(sim.graph, plan.path)));
  if (balance(sim, PLAYER) < fee) return refuse(sim, 'courier', 'not enough coin');
  transfer(sim, PLAYER, `purse:${st.at}`, fee);
  const c = { id: nextId(st, 'k'), name: 'a courier', from: st.at, to, caravan, orders, phase: 'out', trip: null, tripNo: 1, robbed: false, delivered: false, fee, waitUntil: null };
  st.couriers[c.id] = c;
  copyKnowledge(sim, PLAYER, c.id);
  c.trip = newTrip(sim, { tripNo: 1, from: st.at, dest: to, plan, speedKmh: cfg.speedKmh });
  sim.log('player:courier', { id: c.id, to, caravan, bits: fee });
  entry(sim, 'courier', { id: c.id, to, caravan, bits: fee });
  courierGo(sim, c);
}

function courierGo(sim, c) {
  if (!startLeg(sim, c.trip, 'player:courier-node', c.id)) return onLegStart(sim, 'courier', c.id, c.trip);
  const plan = planJourney(sim, c.trip.at, c.trip.dest, { speedKmh: sim.data.player.courier.speedKmh, caution: 0.6, holder: c.id });
  if (plan) {
    reroute(c.trip, plan);
    if (!startLeg(sim, c.trip, 'player:courier-node', c.id)) return onLegStart(sim, 'courier', c.id, c.trip);
  }
  // Road shut: try again in the morning.
  sim.schedule(sim.cal.travelWindow(sim.cal.day(sim.now) + 1)[0], 'player:courier-wait', { id: c.id, retry: true });
}

function onCourierNode(sim, { id, tripNo }) {
  const c = getCourier(sim, id);
  if (!c?.trip || c.trip.tripNo !== tripNo || !c.trip.legSeg) return;
  const seg = finishLeg(sim, c.trip);
  afterLeg(sim, c.id, seg.id, c.trip);
  if (c.trip.at !== c.trip.dest) return courierGo(sim, c);
  if (c.phase === 'out') {
    swapNews(sim, c.id, c.to, { look: Boolean(sim.state.economy.markets[c.to]) });
    c.waitUntil = sim.now + sim.data.player.courier.waitDays * DAY;
    return deliverOrWait(sim, c);
  }
  courierHome(sim, c);
}

function onCourierWait(sim, { id, retry = false }) {
  const c = getCourier(sim, id);
  if (!c) return;
  if (retry) return courierGo(sim, c);
  deliverOrWait(sim, c);
}

// At the far town: hand the letter to the caravan if it's there, wait a while if it's on its way, then ride home.
function deliverOrWait(sim, c) {
  const m = c.caravan ? getMerchant(sim, c.caravan) : null;
  if (m && !c.robbed && c.orders) {
    if (m.active && !m.trip && m.at === c.to && !m.captive) {
      applyOrders(sim, m, c.orders);
      c.delivered = true;
      sim.log('player:orders-delivered', { id: c.id, caravan: m.id, at: c.to });
    } else if (m.active && m.trip?.dest === c.to && sim.now < c.waitUntil) {
      sim.schedule(sim.now + 360, 'player:courier-wait', { id: c.id });
      return;
    }
  }
  if (!c.delivered && c.orders && !c.robbed) sim.log('player:orders-undelivered', { id: c.id, caravan: c.caravan, at: c.to });
  // Home, with the board of the town (fresh when they left it).
  swapNews(sim, c.id, c.to, { look: Boolean(sim.state.economy.markets[c.to]) });
  c.phase = 'back';
  const plan = planJourney(sim, c.to, c.from, { speedKmh: sim.data.player.courier.speedKmh, caution: 0.6, holder: c.id });
  if (!plan) return courierHome(sim, c);
  c.trip = newTrip(sim, { tripNo: 2, from: c.to, dest: c.from, plan, speedKmh: sim.data.player.courier.speedKmh });
  courierGo(sim, c);
}

// ── Factors ─────────────────────────────────────────────────────────────────

/** Hire a factor in the town where you stand (not your own: you're there yourself). */
function onHireFactor(sim, { sellAbove = null } = {}) {
  if (busy(sim, 'hire-factor')) return;
  const st = sim.state.player;
  const cfg = sim.data.player.factor;
  const at = st.at;
  if (at === st.home || !sim.state.economy.markets[at]) return refuse(sim, 'hire-factor', 'not here');
  if (st.factors[at]) return refuse(sim, 'hire-factor', 'you have one here');
  const rng = sim.rng('player');
  const pool = residentsAt(sim, at).filter((r) => ['labourer', 'innkeeper', 'porter', 'dockhand', 'weaver', 'priest'].includes(r.profession));
  if (!pool.length) return refuse(sim, 'hire-factor', 'nobody to hire');
  const r = rng.pick(pool);
  const f = { id: nextId(st, 'f'), resident: r.id, at, since: sim.now, honesty: rng.int(cfg.honesty[0], cfg.honesty[1]), sellAbove: sellAbove ?? cfg.sellAbove, unpaid: 0, skimmed: 0, sold: 0, reports: 0, lastReport: sim.now };
  st.factors[at] = f;
  swapNews(sim, f.id, at);
  sim.log('player:factor', { who: r.id, at });
  entry(sim, 'factor', { who: r.id, at });
}

function onDismissFactor(sim, { at }) {
  const st = sim.state.player;
  if (!st.factors[at]) return refuse(sim, 'dismiss-factor', 'no factor there');
  endFactor(sim, st.factors[at], 'dismissed');
}

function endFactor(sim, f, why) {
  const st = sim.state.player;
  delete st.factors[f.at];
  if (sim.state.knowledge) delete sim.state.knowledge.holders[f.id];
  sim.log('player:factor-gone', { who: f.resident, at: f.at, why });
  entry(sim, 'factor-gone', { at: f.at, why });
}

// A factor's day: paid (or not), they watch the market, sell your goods there when the
// price is right (minus what they skim), and every few days send the board home.
function factorDay(sim, f) {
  const st = sim.state.player;
  const cfg = sim.data.player.factor;
  const r = residentsAt(sim, f.at).find((x) => x.id === f.resident);
  if (!r) return endFactor(sim, f, 'gone');
  // Wages owed pile up; they're paid as soon as there's coin, and the factor quits only after a long wait.
  f.owed = (f.owed ?? 0) + toBits(sim, cfg.wage);
  f.owed -= transfer(sim, PLAYER, `purse:${f.at}`, f.owed);
  f.unpaid = f.owed > 0 ? f.unpaid + 1 : 0;
  if (f.unpaid >= cfg.quitAfter) return endFactor(sim, f, 'unpaid');
  swapNews(sim, f.id, f.at);
  // Selling your stores here on your standing instruction.
  const goods = st.stores[f.at] ?? {};
  for (const gid of Object.keys(goods).sort()) {
    const q = quote(sim, f.at, gid);
    if (q.price < q.base * f.sellAbove) continue;
    const coin = balance(sim, PLAYER);
    const sold = sellFromStore(sim, f.at, gid, goods[gid].qty, 'factor');
    if (!sold) continue;
    // What they keep back for themselves (you'll never know, unless you check the books).
    const got = balance(sim, PLAYER) - coin;
    const skim = Math.round(got * (1 - f.honesty / 1000));
    f.skimmed += transfer(sim, PLAYER, `purse:${f.at}`, skim);
    f.sold += got - skim;
  }
  if (sim.now - f.lastReport >= cfg.reportEvery * DAY) sendReport(sim, f);
}

// A letter home: what the factor has seen and heard, carried by a courier who can be robbed.
function sendReport(sim, f) {
  const st = sim.state.player;
  const cfg = sim.data.player.courier;
  f.lastReport = sim.now;
  const plan = planJourney(sim, f.at, st.home, { speedKmh: cfg.speedKmh, caution: 0.6, holder: f.id });
  if (!plan) return;
  const c = { id: nextId(st, 'k'), name: 'a courier', from: st.home, to: f.at, caravan: null, orders: null, phase: 'back', trip: null, tripNo: 2, robbed: false, delivered: false, fee: 0, waitUntil: null, report: f.at };
  st.couriers[c.id] = c;
  copyKnowledge(sim, f.id, c.id);
  c.trip = newTrip(sim, { tripNo: 2, from: f.at, dest: st.home, plan, speedKmh: cfg.speedKmh });
  f.reports += 1;
  courierGo(sim, c);
}

function courierHome(sim, c) {
  const st = sim.state.player;
  // The letters wait for you at the courier's town.
  const pouch = holderOf(sim, c.id);
  const letters = Object.keys(pouch).sort().filter((k) => !pouch[k].road).map((k) => ({ ...pouch[k], source: pouch[k].source === 'seen' ? 'post' : pouch[k].source }));
  (st.mail[c.from] ??= []).push(...letters);
  delete st.couriers[c.id];
  delete sim.state.knowledge.holders[c.id];
  sim.log('player:courier-home', { id: c.id, at: c.from, robbed: c.robbed, delivered: c.delivered, letters: letters.length, report: c.report ?? null });
  if (st.at === c.from) readMail(sim, c.from);
}

function readMail(sim, sid) {
  const st = sim.state.player;
  const letters = st.mail[sid];
  if (!letters?.length) return;
  for (const rec of letters) learn(sim, PLAYER, rec);
  st.mail[sid] = [];
}

/** A courier's letters were taken on the road (raiders.js). */
export function courierRobbed(sim, id) {
  const c = getCourier(sim, id);
  if (c) c.robbed = true;
}

// Letters from the parent's old contacts, arriving in the first days.
function onContact(sim, { at, ageDays, from }) {
  const st = sim.state.player;
  const rec = snapshot(sim, at, 'post', 900);
  rec.t = Math.max(0, sim.now - ageDays * DAY);
  (st.mail[st.home] ??= []).push(rec);
  if (st.at === st.home) readMail(sim, st.home);
  sim.log('player:letter', { at, from });
}

// ── The money-changer's note ────────────────────────────────────────────────

// Each season: the interest and an installment. Miss twice and he seizes what he can.
function payChanger(sim) {
  const st = sim.state.player;
  const cfg = sim.data.player.debt;
  const d = st.debt;
  if (d.principal <= 0 || st.bonded) return; // a bonded debtor's work is the payment
  const interest = Math.round(d.principal * cfg.rate);
  const due = interest + Math.round(d.principal * cfg.installment);
  const paid = transfer(sim, PLAYER, 'changer', Math.min(due, balance(sim, PLAYER)));
  d.interest += Math.min(paid, interest);
  d.principal -= Math.max(0, paid - interest);
  d.paid += paid;
  if (paid >= due) {
    d.missed = 0;
    sim.log('player:paid', { bits: paid, owed: d.principal });
    entry(sim, 'paid', { bits: paid, owed: d.principal });
    return;
  }
  // Short: the unpaid interest is added to the debt.
  d.principal += Math.max(0, interest - paid);
  d.missed += 1;
  sim.log('player:missed', { bits: paid, due, owed: d.principal, missed: d.missed });
  entry(sim, 'missed', { bits: paid, due, owed: d.principal });
  if (d.missed >= cfg.strikes) seize(sim);
}

// Default: the changer takes the coin, sells off the stall's stock at Kingscross, and
// sells the wagons standing in the yard back to the wheelwrights, all but one: a
// carter's own wagon is his living, and not the changer's to take.
function seize(sim) {
  const st = sim.state.player;
  const d = st.debt;
  const home = st.home;
  let taken = transfer(sim, PLAYER, 'changer', Math.min(d.principal, balance(sim, PLAYER)));
  for (const gid of Object.keys(st.stores[home] ?? {}).sort()) {
    if (taken >= d.principal) break;
    const qty = st.stores[home][gid].qty;
    const bits = Math.min(toBits(sim, saleValue(sim, home, gid, qty) * 0.7), balance(sim, traderAccount(sim, home)));
    takeStore(st, home, gid, qty);
    unload(sim, home, gid, qty);
    taken += transfer(sim, traderAccount(sim, home), 'changer', bits);
  }
  let wagons = 0;
  while (taken < d.principal && st.wagons > 1 && idleWagons(sim) > 0) {
    const got = transfer(sim, `purse:${home}`, 'changer', toBits(sim, sim.data.merchants.wagonCost * 0.5));
    if (!got) break;
    taken += got;
    st.wagons -= 1;
    wagons += 1;
  }
  d.principal = Math.max(0, d.principal - taken);
  d.missed = 0;
  if (!d.collector) d.collector = sim.rng('player').pick(['Brannoc Slye', 'Wat Grimsby', 'Idris Cole']);
  sim.log('player:seized', { bits: taken, owed: d.principal, collector: d.collector, wagons });
  entry(sim, 'seized', { bits: taken, owed: d.principal, wagons });
  // Nothing left and still in debt: bonded to a rival house for a season.
  if (d.principal > 0 && netWorth(sim) < 0) bond(sim);
}

// Bankrupt: a season as a bonded factor for the richest rival house (spec §15).
function bond(sim) {
  const st = sim.state.player;
  const cfg = sim.data.player.bond;
  let house = null;
  for (const m of activeMerchants(sim)) if (!house || balance(sim, accountOf(m)) > balance(sim, accountOf(house))) house = m;
  st.bonded = { since: sim.now, until: sim.now + cfg.days * DAY, owed: st.debt.principal, house: house?.id ?? null, kept: 0 };
  sim.log('player:bonded', { owed: st.debt.principal, days: cfg.days, house: house?.id ?? null });
  entry(sim, 'bonded', { owed: st.debt.principal, house: house?.id ?? null });
}

// The house pays a bonded factor's wage; the changer takes his share against the debt,
// and the rest is the player's to start again with.
function bondedDay(sim) {
  const st = sim.state.player;
  const cfg = sim.data.player.bond;
  const house = getMerchant(sim, st.bonded.house);
  if (!house?.active) return; // the house has gone under: the bond runs on, unpaid
  const wage = transfer(sim, accountOf(house), PLAYER, toBits(sim, cfg.wage));
  const share = transfer(sim, PLAYER, 'changer', Math.min(Math.round(wage * cfg.toChanger), st.debt.principal));
  st.debt.principal -= share;
  st.debt.paid += share;
  st.bonded.kept += wage - share;
}

// Bond served: half of what's still owed is written off (a debt is a promise, not coin), and you
// start again from the stall, with the family wagon and what you kept of your wages.
function release(sim) {
  const st = sim.state.player;
  const kept = st.bonded.kept ?? 0;
  st.debt.principal = Math.round(st.debt.principal / 2);
  st.debt.missed = 0;
  st.bonded = null;
  sim.log('player:released', { owed: st.debt.principal, kept });
  entry(sim, 'released', { owed: st.debt.principal, kept });
}

function onBorrow(sim, { marks }) {
  if (busy(sim, 'borrow')) return;
  const st = sim.state.player;
  const cfg = sim.data.player.debt;
  if (st.at !== st.home) return refuse(sim, 'borrow', 'the changer is in Kingscross');
  const limit = Math.min(toBits(sim, cfg.borrowMax), Math.max(0, Math.round(netWorth(sim, { gross: true }) * cfg.borrowFactor)) - st.debt.principal);
  const bits = Math.min(toBits(sim, marks), limit);
  if (!(bits > 0)) return refuse(sim, 'borrow', 'he will lend no more');
  const got = transfer(sim, 'changer', PLAYER, bits);
  st.debt.principal += got;
  sim.log('player:borrowed', { bits: got, owed: st.debt.principal });
  entry(sim, 'borrowed', { bits: got, owed: st.debt.principal });
}

function onRepay(sim, { marks }) {
  if (busy(sim, 'repay')) return;
  const st = sim.state.player;
  if (st.at !== st.home) return refuse(sim, 'repay', 'the changer is in Kingscross');
  const bits = transfer(sim, PLAYER, 'changer', Math.min(toBits(sim, marks), st.debt.principal));
  st.debt.principal -= bits;
  st.debt.paid += bits;
  sim.log('player:repaid', { bits, owed: st.debt.principal });
  entry(sim, 'repaid', { bits, owed: st.debt.principal });
}

function onBuyWagon(sim) {
  if (busy(sim, 'buy-wagon')) return;
  const st = sim.state.player;
  const cost = toBits(sim, sim.data.merchants.wagonCost);
  if (balance(sim, PLAYER) < cost) return refuse(sim, 'buy-wagon', 'not enough coin');
  transfer(sim, PLAYER, `purse:${st.at}`, cost);
  st.wagons += 1;
  sim.log('player:wagon', { at: st.at, wagons: st.wagons });
  entry(sim, 'wagon', { at: st.at, wagons: st.wagons });
}

// Hard up: a wagon standing in the yard goes back to the wheelwrights for half what it cost.
function onSellWagon(sim) {
  if (busy(sim, 'sell-wagon')) return;
  const st = sim.state.player;
  if (st.at !== st.home || idleWagons(sim) < 1) return refuse(sim, 'sell-wagon', 'no wagon in the yard');
  const got = transfer(sim, `purse:${st.at}`, PLAYER, toBits(sim, sim.data.merchants.wagonCost * 0.5));
  st.wagons -= 1;
  sim.log('player:wagon-sold', { at: st.at, bits: got, wagons: st.wagons });
  entry(sim, 'wagon-sold', { bits: got, wagons: st.wagons });
}

// ── Worth, death and heirs ──────────────────────────────────────────────────

/**
 * What the player is worth (bits): coin, stores and cargo at the local market's
 * price, wagons at half what they cost; less the debt (unless `gross`).
 */
export function netWorth(sim, { gross = false } = {}) {
  const st = sim.state.player;
  if (!st) return 0;
  let bits = balance(sim, PLAYER);
  for (const [sid, goods] of Object.entries(st.stores)) {
    for (const [gid, g] of Object.entries(goods)) bits += toBits(sim, quote(sim, sid, gid).price * g.qty * 0.8);
  }
  for (const m of caravans(sim)) {
    const sid = m.at ?? m.trip?.dest ?? st.home;
    for (const [gid, qty] of Object.entries(m.cargo)) bits += toBits(sim, quote(sim, sid, gid).price * qty * 0.8);
  }
  bits += toBits(sim, st.wagons * sim.data.merchants.wagonCost * 0.5);
  return gross ? bits : bits - st.debt.principal;
}

/** The player dies (raiders.js): the next of the family takes up the ledger, the stores and the debt. */
export function playerDies(sim, cause, m = null) {
  const st = sim.state.player;
  const cfg = sim.data.player;
  const was = st.name;
  st.died.push({ name: was, t: sim.now, cause });
  st.generation += 1;
  const rng = sim.rng('player');
  let given = rng.pick(cfg.given);
  if (`${given} ${st.family}` === was) given = cfg.given[(cfg.given.indexOf(given) + 1) % cfg.given.length];
  st.name = `${given} ${st.family}`;
  st.at = st.home;
  st.with = null;
  if (m) m.rider = false;
  sim.log('player:died', { who: was, heir: st.name, cause, generation: st.generation });
  entry(sim, 'died', { who: was, heir: st.name, cause });
}

/** A caravan the player rode with is let go by the band that held it (raiders.js): they walk home. */
export function playerFreed(sim, m) {
  const st = sim.state.player;
  if (!m.rider) return;
  m.rider = false;
  m.name = `the ${st.family} family`;
  st.with = null;
  st.at = m.home;
  entry(sim, 'freed', { at: m.home });
}

// Before a command that looks at the world: what's said at the inn where you stand.
export function hearInn(sim) {
  const st = sim.state.player;
  if (st?.at && sim.state.knowledge) {
    swapNews(sim, PLAYER, st.at, { look: Boolean(sim.state.economy.markets[st.at]) });
    readMail(sim, st.at);
  }
}

/** Is the player riding with this caravan? */
export const riding = (m) => Boolean(m?.player && m.rider);

