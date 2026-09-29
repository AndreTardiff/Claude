// The lord's progress: Lord Aldric rides out into his lands now and then (step F).
//
// He decides from what he has heard (the post's letters and the talk at his
// seat's inn), so news that is old or thin makes him want to go and see for
// himself. A trip is one of his undertakings, weighed with the rest:
//
//   tour    ride to a town with stale or worrying news: see its market, hear its
//           petitions, give alms to the poor, and decide on the spot
//   hunt    a day's hunting in the Blackpine, when he's pleased with himself:
//           glory, or a fall
//   ships   a visit to Saltmouth to see the ships and buy fine things (the coin
//           leaves the region)
//   ride    ride with a patrol down a road whose outlaws have angered him
//
// His party (household guards, hired sellswords, a purse) is the richest mark on
// the road: a band that takes him holds him for a great ransom, and once free he
// wants blood: a bounty on the band, paid for every one of them killed. While he's
// away his steward's fingers grow bolder. Where he stays, his household spends:
// the town's traders sell bread and fine things, its households are paid.
//
// Coin moves by transfer only; his household's food and finery by useUp.

import { balance, toBits, transfer } from '../economy/money.js';
import { residentsAt } from '../economy/people.js';
import { finishLeg, newTrip, planJourney, reroute, startLeg } from '../world/journey.js';
import { swapNews } from './knowledge.js';
import { guardsOnRoad, hireGuards, payGuards, releaseGuards } from './mercs.js';
import { afterLeg, bandAccount, getBand, onLegStart } from './raiders.js';

const DAY = 1440;
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const LORD = 'lord'; // his knowledge holder, and his id on the road
export const LORD_PURSE = 'lord:purse'; // what he carries

const lordOf = (sim) => sim.state.lord;
const caution = (st) => (1000 - st.traits.ambition) / 1000;

/** Is the lord at home and free to decide? */
export const atHome = (st) => !st.away && !st.captive;
export const hurt = (sim, st) => (st.hurtUntil ?? 0) > sim.now;

/** What the lord believes of a town's hunger (0–1), and how old the word is (days). */
export function believedHunger(sim, sid) {
  const rec = sim.state.knowledge?.holders[LORD]?.[sid];
  if (!rec) return { hunger: 0, ageDays: Infinity };
  return { hunger: rec.hunger ?? 0, ageDays: (sim.now - rec.t) / DAY };
}

// ── Choosing a trip ─────────────────────────────────────────────────────────

/** The trips he might make now, scored like his other undertakings. */
export function travelOptions(sim, budget) {
  const st = lordOf(sim);
  const cfg = sim.data.lord.travel;
  if (!cfg || !atHome(st) || hurt(sim, st) || st.at !== st.seat) return [];
  if (sim.now - (st.lastTrip ?? -Infinity) < cfg.everyDays * DAY) return [];
  const cost = round2(cfg.purse * 0.3 + cfg.escort * 1.5 * 4 + cfg.spendPerDay * 2);
  if (cost > budget) return [];
  const t = st.traits;
  const out = [];
  for (const sid of Object.keys(sim.state.economy.markets)) {
    if (sid === st.seat || sim.graph.nodes.get(sid).outside) continue;
    const { hunger, ageDays } = believedHunger(sim, sid);
    if (ageDays < cfg.staleDays && hunger < 0.25) continue;
    const stale = Math.min(1, ageDays / (cfg.staleDays * 2));
    const score = round2((t.generosity / 1000) * (0.1 + 0.5 * hunger + 0.2 * stale) + 0.2 * st.mood.worry);
    const why = hunger >= 0.25 ? `word from ${sid} is of hunger, and he wants to see it for himself` : `no fresh word from ${sid} in ${Math.round(ageDays)} days`;
    out.push({ kind: 'trip', trip: 'tour', at: sid, cost, score, why });
  }
  if (st.mood.pride >= 0.25) {
    out.push({ kind: 'trip', trip: 'hunt', at: cfg.hunt.at, cost, score: round2((t.vanity / 1000) * (0.1 + 0.4 * st.mood.pride)), why: 'he is pleased with the world and wants a day in the Blackpine' });
  }
  const port = Object.keys(sim.state.economy.markets).find((sid) => sim.graph.nodes.get(sid).outside);
  if (port && budget > cfg.ships.luxuries * 2) {
    out.push({ kind: 'trip', trip: 'ships', at: port, cost: cost + cfg.ships.luxuries, score: round2((t.vanity / 1000) * 0.25 * (0.4 + st.mood.pride)), why: 'he has a fancy to see the ships and what they carry' });
  }
  if ((st.mood.anger ?? 0) >= 0.3 && sim.data.lord.patrol) {
    const route = angryRoute(sim);
    if (route) {
      out.push({ kind: 'trip', trip: 'ride', at: route.far, route: route.id, cost: cost + sim.data.lord.patrol.guards * sim.data.lord.patrol.pay * 4, score: round2((t.ambition / 1000) * (0.2 + st.mood.anger)), why: `outlaws have angered him, and he means to ride the ${route.name} himself` });
    }
  }
  return out;
}

// The road his anger points at: where the band that crossed him is said to be, or the worst-spoken road.
function angryRoute(sim) {
  const st = lordOf(sim);
  let best = null;
  for (const route of sim.data.routes) {
    let worst = 0;
    for (const seg of route.segments) worst = Math.max(worst, (sim.state.knowledge?.holders[LORD]?.[`road:${seg}`]?.danger ?? 0) - sim.graph.segments.get(seg).danger);
    const grudge = st.grudge && getBand(sim, st.grudge)?.active && sim.data.raiders.hideouts.find((h) => h.id === getBand(sim, st.grudge).hideout)?.watches.some((s) => route.segments.includes(s));
    const score = worst + (grudge ? 1 : 0);
    if (score > 0.1 && (!best || score > best.score)) best = { id: route.id, name: route.name, score };
  }
  if (!best) return null;
  // Ride to the far end of it from the seat.
  const segs = sim.data.routes.find((r) => r.id === best.id).segments.map((s) => sim.graph.segments.get(s));
  const ends = [segs[0].a, segs[segs.length - 1].b].filter((n) => n !== st.seat && sim.graph.nodes.get(n).kind !== 'waypoint');
  const far = ends[0] ?? segs[segs.length - 1].b;
  return far === st.seat ? null : { ...best, far };
}

// ── On the road ─────────────────────────────────────────────────────────────

export function setOut(sim, o) {
  const st = lordOf(sim);
  const cfg = sim.data.lord.travel;
  const plan = planJourney(sim, st.at, o.at, { speedKmh: cfg.speedKmh, caution: caution(st), holder: LORD });
  if (!plan) return false;
  const rng = sim.rng('lord.travel');
  st.tripNo = (st.tripNo ?? 0) + 1;
  // Sellswords for the road: more if he believes it dangerous.
  const want = Math.min(4, cfg.escort + Math.round(plan.exposure * 6));
  const escort = hireGuards(sim, { id: LORD }, { kind: 'lord', want, days: (plan.hours / 24) * 2 + cfg.stayDays[1], account: 'treasury', tripNo: st.tripNo, from: st.at, exposure: plan.exposure, wagons: 1, caution: caution(st) });
  transfer(sim, 'treasury', LORD_PURSE, toBits(sim, cfg.purse));
  let household = cfg.household;
  if (o.trip === 'ride') {
    // He rides with a patrol: its guards are his company.
    const route = sim.data.routes.find((r) => r.id === o.route);
    const pc = sim.data.lord.patrol;
    if (!(st.patrols ?? []).some((p) => p.route === route.id)) {
      st.patrols = [...(st.patrols ?? []), { route: route.id, segs: route.segments, guards: pc.guards, until: sim.now + pc.days * DAY, mercs: [] }];
      sim.log('lord:patrol', { route: route.id, guards: pc.guards, days: pc.days });
    }
    household += pc.guards;
  }
  st.away = { kind: o.trip, target: o.at, route: o.route ?? null, why: o.why, phase: 'out', since: sim.now, until: null, stays: rng.int(cfg.stayDays[0], cfg.stayDays[1]) };
  st.trip = newTrip(sim, { tripNo: st.tripNo, from: st.at, dest: o.at, plan, speedKmh: cfg.speedKmh });
  st.trip.crew = household;
  st.trip.guards = escort;
  st.at = null;
  sim.log('lord:sets-out', { trip: o.trip, to: o.at, route: o.route ?? null, escort, household, why: o.why });
  go(sim);
  return true;
}

function go(sim) {
  const st = lordOf(sim);
  const cfg = sim.data.lord.travel;
  if (!startLeg(sim, st.trip, 'lord:node', LORD)) return onLegStart(sim, 'lord', LORD, st.trip);
  const plan = planJourney(sim, st.trip.at, st.trip.dest, { speedKmh: cfg.speedKmh, caution: caution(st), holder: LORD });
  if (plan) {
    reroute(st.trip, plan);
    if (!startLeg(sim, st.trip, 'lord:node', LORD)) return onLegStart(sim, 'lord', LORD, st.trip);
  }
  st.trip.waiting = true;
  sim.schedule(sim.cal.travelWindow(sim.cal.day(sim.now) + 1)[0], 'lord:retry', { id: LORD, tripNo: st.trip.tripNo });
}

function onRetry(sim, { tripNo }) {
  const st = lordOf(sim);
  if (!st.trip || st.trip.tripNo !== tripNo || !st.trip.waiting) return;
  go(sim);
}

function onNode(sim, { tripNo }) {
  const st = lordOf(sim);
  if (!st.trip || st.trip.tripNo !== tripNo || !st.trip.legSeg) return;
  const seg = finishLeg(sim, st.trip);
  guardsOnRoad(sim, st.trip, seg.id);
  afterLeg(sim, LORD, seg.id, st.trip);
  if (st.trip.at !== st.trip.dest) return go(sim);
  if (st.away.phase === 'out') arriveThere(sim);
  else arriveHome(sim);
}

// He has come where he was going.
function arriveThere(sim) {
  const st = lordOf(sim);
  const cfg = sim.data.lord.travel;
  const where = st.trip.dest;
  st.at = where;
  st.away.phase = 'staying';
  const kind = st.away.kind;
  const node = sim.graph.nodes.get(where);
  if (kind === 'hunt') {
    const rng = sim.rng('lord.travel');
    const roll = rng.float();
    if (roll < cfg.hunt.hurt) {
      st.hurtUntil = sim.now + cfg.hunt.hurtDays * DAY;
      st.mood.pride = round3(clamp01(st.mood.pride - 0.2));
      sim.log('lord:hunt', { at: where, result: 'hurt', days: cfg.hunt.hurtDays });
    } else if (roll < cfg.hunt.hurt + cfg.hunt.glory) {
      st.mood.pride = round3(clamp01(st.mood.pride + 0.3));
      sim.log('lord:hunt', { at: where, result: 'glory' });
    } else sim.log('lord:hunt', { at: where, result: 'nothing' });
  } else if (node.outside && kind !== 'ships') {
    swapNews(sim, LORD, where);
    sim.log('lord:visit', { at: where, hunger: 0, believed: 0, alms: 0, port: true });
  } else if (node.outside) {
    swapNews(sim, LORD, where);
    const bits = transfer(sim, 'treasury', 'ships', toBits(sim, cfg.ships.luxuries));
    st.spent.travel = (st.spent.travel ?? 0) + bits;
    st.mood.pride = round3(clamp01(st.mood.pride + 0.1));
    sim.log('lord:ships', { at: where, bits });
  } else {
    visitTown(sim, where);
  }
  const leave = sim.cal.travelWindow(sim.cal.day(sim.now) + st.away.stays)[0];
  st.away.until = leave;
  sim.schedule(leave, 'lord:leave', { id: LORD, tripNo: st.trip.tripNo });
}

// A town sees its lord: he sees its market and its hunger with his own eyes,
// hears petitions, gives alms if it's poor, and decides on the spot.
function visitTown(sim, sid) {
  const st = lordOf(sim);
  const cfg = sim.data.lord.travel;
  const before = believedHunger(sim, sid);
  swapNews(sim, LORD, sid);
  const hunger = sim.state.economy.hunger[sid] ?? 0;
  const people = residentsAt(sim, sid).length;
  if (hunger < 0.1) st.mood.pride = round3(clamp01(st.mood.pride + 0.1));
  if (hunger >= 0.25) st.mood.worry = round3(clamp01(st.mood.worry + 0.25));
  let alms = 0;
  const perHead = balance(sim, `purse:${sid}`) / sim.data.coin.bitsPerMark / Math.max(1, people);
  if (st.traits.generosity >= 600 && perHead < 5) {
    alms = transfer(sim, 'treasury', `purse:${sid}`, toBits(sim, cfg.alms * people));
    st.spent.travel = (st.spent.travel ?? 0) + alms;
  }
  sim.log('lord:visit', { at: sid, hunger: round2(hunger), believed: round2(before.hunger), alms });
  st.decideNow = true; // with fresh eyes, today
}

/** Each day he stays somewhere, his household eats and spends there. */
export function whileAway(sim, buyForLord) {
  const st = lordOf(sim);
  if (!st.away || st.away.phase !== 'staying' || !st.at) return;
  const node = sim.graph.nodes.get(st.at);
  if (node.kind === 'waypoint' || node.outside) return;
  const cfg = sim.data.lord.travel;
  let bits = transfer(sim, 'treasury', `purse:${st.at}`, toBits(sim, cfg.spendPerDay));
  for (const [gid, qty] of Object.entries(cfg.eats)) bits += buyForLord(sim, st.at, gid, qty);
  st.spent.travel = (st.spent.travel ?? 0) + bits;
}

function onLeave(sim, { tripNo }) {
  const st = lordOf(sim);
  if (!st.trip || st.trip.tripNo !== tripNo || st.away?.phase !== 'staying') return;
  const cfg = sim.data.lord.travel;
  const plan = planJourney(sim, st.at, st.seat, { speedKmh: cfg.speedKmh, caution: caution(st), holder: LORD });
  if (!plan) {
    sim.schedule(sim.cal.travelWindow(sim.cal.day(sim.now) + 1)[0], 'lord:leave', { id: LORD, tripNo });
    return;
  }
  const guards = st.trip.guards;
  const crew = st.trip.crew;
  const departedAt = st.trip.departedAt;
  st.trip = newTrip(sim, { tripNo, from: st.at, dest: st.seat, plan, speedKmh: cfg.speedKmh });
  st.trip.guards = guards;
  st.trip.crew = crew;
  st.trip.departedAt = departedAt; // the escort is paid for the whole trip
  st.away.phase = 'home';
  st.at = null;
  go(sim);
}

function arriveHome(sim) {
  const st = lordOf(sim);
  const trip = st.trip;
  st.at = st.seat;
  const days = Math.max(1, Math.ceil((sim.now - trip.departedAt) / DAY));
  st.spent.travel = (st.spent.travel ?? 0) + payGuards(sim, trip, days, 'treasury');
  releaseGuards(sim, trip, st.seat);
  transfer(sim, LORD_PURSE, 'treasury', balance(sim, LORD_PURSE));
  sim.log('lord:home', { trip: st.away.kind, days, escort: trip.guards?.length ?? 0 });
  st.trip = null;
  st.away = null;
  st.lastTrip = sim.now;
  swapNews(sim, LORD, st.seat);
}

// ── Taken ───────────────────────────────────────────────────────────────────

/** A band has taken the lord (raiders.js): he is held for a great ransom. */
export function captureLord(sim, band, rec) {
  const st = lordOf(sim);
  const cfg = sim.data.lord.travel.ransom;
  const ransom = Math.max(toBits(sim, cfg.min), Math.round(balance(sim, 'treasury') * cfg.share));
  st.captive = { band: band.id, since: sim.now, ransom, deadline: sim.now + cfg.days * DAY };
  // His household guards who lived straggle home; the purse went with the band.
  st.trip = null;
  st.at = null;
  band.lordHeld = true;
  rec.captured = true;
  rec.ransom = ransom;
}

/**
 * Each day he's held: the steward pays from the treasury if it can, else the seat's
 * households are squeezed; a band that isn't paid by its deadline asks for less.
 */
export function heldForRansom(sim) {
  const st = lordOf(sim);
  const c = st.captive;
  if (!c) return;
  const band = getBand(sim, c.band);
  if (!band?.active) return freed(sim, band, 0, 'escaped');
  let payer = null;
  if (balance(sim, 'treasury') >= c.ransom) payer = 'treasury';
  else if (balance(sim, `purse:${st.seat}`) >= c.ransom) payer = `purse:${st.seat}`;
  if (payer) {
    const bits = transfer(sim, payer, bandAccount(band), c.ransom);
    return freed(sim, band, bits, payer === 'treasury' ? 'treasury' : 'town');
  }
  if (sim.now >= c.deadline) {
    c.ransom = Math.round(c.ransom * 0.6);
    c.deadline = sim.now + 4 * DAY;
  }
}

function freed(sim, band, bits, how) {
  const st = lordOf(sim);
  const cfg = sim.data.lord.travel;
  if (band) band.lordHeld = false;
  st.captive = null;
  st.away = null;
  st.at = st.seat;
  st.lastTrip = sim.now;
  st.mood.anger = 1;
  st.mood.grievance = round3(clamp01(st.mood.grievance + 0.3));
  if (band?.active) {
    st.bounty = { band: band.id, perHead: cfg.bounty.perHead, until: sim.now + cfg.bounty.days * DAY, paid: 0, heads: 0 };
    st.grudge = band.id;
  }
  transfer(sim, LORD_PURSE, 'treasury', balance(sim, LORD_PURSE));
  sim.log('lord:freed', { band: band?.id ?? null, bits, how, bounty: band?.active ? cfg.bounty.perHead : 0 });
}

/** Something a band did has angered him (his post robbed, his party attacked). */
export function angerLord(sim, amount, band) {
  const st = lordOf(sim);
  if (!st) return;
  st.mood.anger = round3(clamp01((st.mood.anger ?? 0) + amount));
  if (band) st.grudge = band.id;
}

/**
 * Outlaws of the band he has a bounty on were killed: the treasury pays whoever did it.
 * `to`: [{ account, heads }]. Returns bits paid.
 */
export function payBounty(sim, band, to) {
  const st = lordOf(sim);
  const b = st?.bounty;
  if (!b || b.band !== band.id || b.until < sim.now) return 0;
  let total = 0;
  for (const { account, heads } of to) {
    if (!(heads > 0)) continue;
    const bits = transfer(sim, 'treasury', account, toBits(sim, b.perHead * heads));
    b.paid += bits;
    b.heads += heads;
    total += bits;
  }
  if (total) st.spent.bounty = (st.spent.bounty ?? 0) + total;
  return total;
}

// The lab sends the lord somewhere (an ordinary event: it shows in the chronicle and replays exactly).
function onLabTrip(sim, { to, trip = 'tour', route = null }) {
  const st = lordOf(sim);
  if (!atHome(st) || st.at !== st.seat || !sim.graph.nodes.get(to)) return;
  if (setOut(sim, { trip, at: to, route, why: 'the experimenter sends him' })) sim.log('lord:lab-trip', { to, trip, lab: true });
}

export const progressHandlers = {
  'lab:lord-trip': onLabTrip,
  'lord:node': onNode,
  'lord:retry': onRetry,
  'lord:leave': onLeave,
};
