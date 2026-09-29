// Raiders: outlaw bands as economic actors (spec §11).
//
// A band is named people: labourers who gave up on hungry, broke towns and took
// to the hills, led by one of them, living out of a hideout by the wild roads.
// Its lookouts watch the roads near the hideout and keep a running sense of
// what passes on each; every few days the band chooses the road that pays best
// and hasn't cost it too dearly. When a traveller comes along the road it
// watches, the band may spot them, and then weighs what they carry against how
// many would fight:
//
//   demand   a toll, from those who'd rather pay than bleed
//   attack   fall on them; they fight or run, dropping what they carry
//   steal    at night, creep into the camp and take what they can
//   let pass not worth it, or too strong
//
// Fights are settled by numbers, nerve and a bounded roll, and written up after
// (spec §13). Hired hands die, outlaws die, merchants are dragged off and held
// for ransom; letters taken from the lord's post never reach the next inn.
// Travellers report what they met on each road, so a road's reputation spreads
// and fades like any other news (knowledge.js).
//
// Bands have to live (E3): they eat (what they stole, what they forage, what they
// buy through their fence), sell loot cheap through a fence in a nearby town,
// bury coin they don't need, and when they starve they fall on a town's granary,
// move to another hideout, or break up and go home. The lord's patrols make a
// road costly to watch.
//
// Coin moves only by transfer (bands hold 'band:<id>' accounts); stolen goods
// leave the wagons for the band's loot and reach a market only when fenced.

import { economyIndex, quote } from '../economy/pricing.js';
import { load, traderAccount, unload } from '../economy/market.js';
import { balance, toBits, transfer } from '../economy/money.js';
import { residentsAt } from '../economy/people.js';
import { refreshNeeds } from './economy.js';
import { getResident, killResident, newName } from './residents.js';
import { holderOf, learn, reportRoad, swapNews } from './knowledge.js';
import { getMerchant, loseCargo, writeOffIfEmpty } from './merchants.js';
import { getWayfarer, losePack } from './wayfarers.js';
import { getRider } from './post.js';
import { patrolOn } from './lord.js';
import { LORD, LORD_PURSE, angerLord, captureLord, payBounty } from './progress.js';
import { orderedResponse, ordersFor, reviseOrders } from './orders.js';
import { courierRobbed, getCourier, playerDies, playerFreed, riding } from './player.js';
import { accountOf } from './merchants.js';
import { addFame, believedRenown, witnessFame, afterEncounter, bandGearPower, guardTakesBlow, guardsInFight, guardsOf, outlawsDropGear, releaseGuards, rollKillers, scatterBandGear, staredDown, spotAmbush } from './mercs.js';

const DAY = 1440;
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const raiders = {
  id: 'raiders',

  init(sim) {
    const cfg = sim.data.raiders;
    if (!cfg) return;
    sim.state.raiders = { bands: {}, order: [], encounters: [], hoards: [] };
    const rng = sim.rng('raiders.init');
    for (const s of cfg.start) {
      const hideout = hideoutById(sim, s.hideout);
      const band = foundBand(sim, hideout, rng);
      for (let i = 0; i < s.members; i++) join(band, newOutlaw(sim, rng, hideout.near[i % hideout.near.length]));
    }
  },

  daily(sim) {
    const st = sim.state.raiders;
    if (!st) return;
    const cfg = sim.data.raiders;
    recruit(sim);
    drifters(sim);
    const day = sim.cal.day(sim.now);
    for (const band of activeBands(sim)) {
      for (const seg of Object.keys(band.take)) {
        band.take[seg] = round2(band.take[seg] * cfg.takeMemory);
        band.fear[seg] = round3(band.fear[seg] * cfg.fearMemory);
      }
      patrolled(sim, band);
      // Too few to take the road for too long: the last of them give up.
      band.fewDays = band.members.length < cfg.minToRaid ? (band.fewDays ?? 0) + 1 : 0;
      if (band.active && band.fewDays > cfg.fewDays) disband(sim, band, 'too few');
      if (!band.active) continue;
      eat(sim, band);
      if (day % cfg.fence.every === 0) fence(sim, band);
      provision(sim, band);
      bury(sim, band);
      if (band.hunger >= cfg.food.starving) starving(sim, band);
      if (band.active && day % cfg.watchEvery === 0) chooseRoad(sim, band);
    }
    captives(sim);
    unearth(sim);
  },

  handlers: {
    'raid:ambush': onAmbush,
    'lab:band': onLabBand,
  },
};

export const getBand = (sim, id) => sim.state.raiders?.bands[id];
export const activeBands = (sim) => (sim.state.raiders?.order ?? []).map((id) => sim.state.raiders.bands[id]).filter((b) => b.active);
export const hideoutById = (sim, id) => sim.data.raiders.hideouts.find((h) => h.id === id);
export const bandAccount = (band) => `band:${band.id}`;

/** How dangerous a band makes the road it watches (0–1, the world data's scale). */
export function threatOf(sim, band, segId) {
  const n = band.members.length;
  return round2(Math.min(1, sim.graph.segments.get(segId).danger + 0.9 * (n / (n + 4))));
}

/** The band watching a road, if any is strong enough to take it. */
export function bandOn(sim, segId) {
  return activeBands(sim).find((b) => b.watching === segId && b.members.length >= sim.data.raiders.minToRaid) ?? null;
}

// ── Bands and their people ──────────────────────────────────────────────────

function foundBand(sim, hideout, rng) {
  const st = sim.state.raiders;
  const band = {
    id: sim.nextId('b'),
    name: hideout.band,
    hideout: hideout.id,
    active: true,
    founded: sim.now,
    leader: null,
    members: [], // resident ids
    cruelty: rng.int(0, 1000), // the leader's temper: permille
    watching: hideout.watches[0],
    take: Object.fromEntries(hideout.watches.map((s) => [s, 0])), // marks seen passing lately, per road
    fear: Object.fromEntries(hideout.watches.map((s) => [s, 0])), // blood lost there lately
    hunger: 0,
    food: 0, // sacks of grain in the hideout
    loot: {}, // stolen goods, waiting for the fence
    captives: [], // merchant ids held for ransom
    gear: [], // arms and armour taken from the road (item ids, mercs.js)
    raids: 0,
    lost: 0, // members killed
    killed: 0, // travellers killed
    reason: null,
  };
  st.bands[band.id] = band;
  st.order.push(band.id);
  return band;
}

function join(band, r) {
  band.members.push(r.id);
  r.band = band.id;
  if (!band.leader) band.leader = r.id;
}

// A newcomer to the hills with no town behind them (the first outlaws, and the lab's).
function newOutlaw(sim, rng, from) {
  const r = {
    id: sim.nextId('r'),
    name: newName(sim, rng),
    home: null,
    profession: 'outlaw',
    skill: rng.int(700, 1100),
    learning: false,
    alive: true,
    diedAt: null,
    cause: null,
    from,
    was: 'drifter',
  };
  sim.state.residents.byId[r.id] = r;
  sim.state.residents.order.push(r.id);
  return r;
}

// Each day, in every town, the idle may give up and take to the hills: more when
// the town is hungry and its households broke. They join the band nearest them,
// or, when times are hard enough and a hideout is free, start one.
function recruit(sim) {
  const cfg = sim.data.raiders;
  const ix = economyIndex(sim.data);
  const rng = sim.rng('raiders');
  for (const sid of ix.markets) {
    if (ix.isOutside(sid)) continue;
    const idle = residentsAt(sim, sid).filter((r) => r.profession === 'labourer');
    if (!idle.length) continue;
    const { hunger, poverty } = hardTimes(sim, sid);
    const chance = Math.min(0.5, cfg.recruit.chance * idle.length * (1 + cfg.recruit.hungerWeight * hunger) * (1 + cfg.recruit.povertyWeight * poverty));
    if (rng.chance(chance)) enlist(sim, rng.pick(idle), sid, rng);
  }
}

// While the hills are nearly empty, the odd stranger turns up to join or start a band.
function drifters(sim) {
  const cfg = sim.data.raiders;
  const bands = activeBands(sim);
  if (bands.length >= cfg.drifters.minBands) return;
  const rng = sim.rng('raiders');
  if (!rng.chance(cfg.drifters.chance)) return;
  let band = bands.sort((a, b) => a.members.length - b.members.length || (a.id < b.id ? -1 : 1))[0];
  if (!band || band.members.length >= cfg.maxMembers) {
    const taken = new Set(bands.map((b) => b.hideout));
    const free = cfg.hideouts.filter((h) => !taken.has(h.id));
    if (!free.length) return;
    band = foundBand(sim, rng.pick(free), rng);
  }
  const r = newOutlaw(sim, rng, null);
  join(band, r);
  sim.log('raid:drifter', { who: r.id, band: band.id, hideout: band.hideout, founded: band.members.length === 1 });
}

// Who could take to the hills from a hungry town: the idle first, then any able
// worker. Not children or elders, not the lord's people or the guard, nor sellswords.
const STAYS = new Set(['dependant', 'noble', 'mintmaster', 'guard', 'sellsword']);
function ableBodied(sim, sid) {
  const people = residentsAt(sim, sid).filter((r) => !STAYS.has(r.profession));
  const idle = people.filter((r) => r.profession === 'labourer');
  return idle.length ? idle : people;
}

function hardTimes(sim, sid) {
  const cfg = sim.data.raiders;
  const people = residentsAt(sim, sid).length;
  const perHead = balance(sim, `purse:${sid}`) / sim.data.coin.bitsPerMark / Math.max(1, people);
  return { hunger: sim.state.economy.hunger[sid], poverty: clamp01(1 - perHead / cfg.recruit.poorBelow) };
}

// Someone from `sid` goes to the hills: into the nearest band with room, or a new one
// if times are hard enough and a hideout is free. Returns the band, or null.
function enlist(sim, r, sid, rng) {
  const cfg = sim.data.raiders;
  const { hunger, poverty } = hardTimes(sim, sid);
  const near = cfg.hideouts.filter((h) => h.near.includes(sid));
  let band = activeBands(sim)
    .filter((b) => near.some((h) => h.id === b.hideout) && b.members.length < cfg.maxMembers)
    .sort((a, b) => b.raids - a.raids || (a.id < b.id ? -1 : 1))[0];
  if (!band) {
    // Nobody to join: only hard times send people off to start a band of their own.
    if (hunger < cfg.recruit.newBandHunger && poverty < 0.8) return null;
    if (activeBands(sim).length >= cfg.maxBands) return null;
    const free = near.filter((h) => !activeBands(sim).some((b) => b.hideout === h.id));
    if (!free.length) return null;
    band = foundBand(sim, rng.pick(free), rng);
  }
  const was = r.profession;
  // A tradesman who leaves leaves a trade to fill.
  if (!sim.data.economy.professions[was]?.pool) sim.state.residents.vacancies.push({ at: sid, profession: was, since: sim.now, predecessor: r.id });
  r.home = null;
  r.profession = 'outlaw';
  r.from = sid;
  r.was = was;
  r.learning = false;
  join(band, r);
  refreshNeeds(sim, sid);
  sim.log('raid:recruit', { who: r.id, from: sid, band: band.id, hideout: band.hideout, founded: band.members.length === 1, hunger: round2(hunger), poverty: round2(poverty) });
  return band;
}

/**
 * A hungry town is losing people. Some of the able-bodied take to the hills
 * instead of the road out (spec §11: hunger and unemployment feed the bands).
 * True if someone did.
 */
export function lureToHills(sim, sid) {
  if (!sim.state.raiders) return false;
  const rng = sim.rng('raiders');
  if (!rng.chance(sim.data.raiders.recruit.lure)) return false;
  const able = ableBodied(sim, sid);
  return able.length > 0 && Boolean(enlist(sim, rng.pick(able), sid, rng));
}

// Every few days: watch the road that has paid best lately, unless blood spilled
// there makes it not worth it. A little stickiness: moving the lookouts is work.
function chooseRoad(sim, band) {
  const hideout = hideoutById(sim, band.hideout);
  const options = hideout.watches.map((seg) => {
    const score = band.take[seg] * (1 - Math.min(0.9, band.fear[seg])) + (seg === band.watching ? 5 : 0);
    return { seg, take: band.take[seg], fear: band.fear[seg], score: round2(score) };
  });
  options.sort((a, b) => b.score - a.score || (a.seg < b.seg ? -1 : 1));
  const was = band.watching;
  band.watching = options[0].seg;
  band.reason = { t: sim.now, options, choice: band.watching };
  // Only a move to another road is news; shifting along the same one isn't.
  const route = (seg) => sim.graph.segments.get(seg).route;
  if (route(was) !== route(band.watching)) sim.log('raid:moved', { band: band.id, to: band.watching, from: was });
}

// ── On the road ─────────────────────────────────────────────────────────────

// What lookouts would reckon a traveller is worth (marks), at the band's fence's prices.
function visibleValue(sim, band, v) {
  const fence = hideoutById(sim, band.hideout).fence;
  let marks = 0;
  for (const [gid, qty] of Object.entries(v.cargo)) marks += quote(sim, fence, gid).price * qty;
  if (v.account) marks += (balance(sim, v.account) * v.carried) / sim.data.coin.bitsPerMark;
  if (v.letters) marks += sim.data.raiders.encounter.letterValue;
  if (v.kind === 'lord') marks += sim.data.raiders.encounter.lordValue; // what he'd fetch in ransom
  return marks;
}

function victim(sim, kind, id) {
  if (kind === 'merchant') {
    const m = getMerchant(sim, id);
    if (!m?.active || !m.trip) return null;
    return { kind, id, who: m, name: m.name, trip: m.trip, account: accountOf(m), carried: 0.1, cargo: { ...m.cargo }, people: (m.trip.crew ?? 3) + 1, boldness: m.boldness, guards: guardsOf(sim, m.trip), orders: m.orders ?? ordersFor(m.boldness) };
  }
  if (kind === 'wayfarer') {
    const w = getWayfarer(sim, id);
    if (!w?.trip || w.retired || w.dead) return null;
    return { kind, id, who: w, name: w.name, trip: w.trip, account: `wayfarer:${id}`, carried: 1, cargo: w.pack ? { [w.pack.good]: w.pack.qty } : {}, people: 1, boldness: w.boldness, peddler: Boolean(w.pack), orders: ordersFor(w.boldness) };
  }
  if (kind === 'lord') {
    // Lord Aldric's party (step F): his household guards, hired sellswords, a purse, and the man himself.
    const st = sim.state.lord;
    if (!st?.trip || st.captive) return null;
    return { kind, id: LORD, who: st, name: `Lord ${st.name}`, trip: st.trip, account: LORD_PURSE, carried: 1, cargo: {}, people: (st.trip.crew ?? 4) + 1, boldness: st.traits.ambition, guards: guardsOf(sim, st.trip), orders: ordersFor(st.traits.ambition) };
  }
  if (kind === 'courier') {
    // The player's courier (step G): letters, and orders for a caravan.
    const c = getCourier(sim, id);
    if (!c?.trip) return null;
    return { kind, id, who: c, name: c.name, trip: c.trip, account: null, carried: 0, cargo: {}, people: 1, boldness: 600, letters: true };
  }
  if (kind === 'rider') {
    const r = getRider(sim, id);
    if (!r?.trip) return null;
    return { kind, id, who: r, name: r.name, trip: r.trip, account: null, carried: 0, cargo: {}, people: 1, boldness: 600, letters: true };
  }
  return null;
}

/**
 * A traveller has just set off along a road. Every band whose lookouts watch it
 * sees them pass (and learns what the road carries); the band waiting on it may
 * spot them and lie in wait further along, or at the night's camp.
 */
export function onLegStart(sim, kind, id, trip) {
  const st = sim.state.raiders;
  if (!st || !trip?.legSeg) return;
  const cfg = sim.data.raiders;
  const seg = trip.legSeg;
  const v = victim(sim, kind, id);
  if (!v) return;
  let ambush = null;
  for (const band of activeBands(sim)) {
    if (!(seg in band.take)) continue;
    band.take[seg] = round2(band.take[seg] + visibleValue(sim, band, v));
    if (ambush || band.watching !== seg || band.members.length < cfg.minToRaid) continue;
    const rng = sim.rng('raids');
    const n = band.members.length;
    const spot = cfg.spot * cfg.visibility[v.peddler ? 'peddler' : kind] * (n / (n + 3)) * (patrolOn(sim, seg) ? cfg.patrol.spot : 1);
    if (!rng.chance(spot)) continue;
    ambush = { band, ...ambushTime(sim, trip, rng) };
  }
  if (ambush) sim.schedule(ambush.at, 'raid:ambush', { band: ambush.band.id, kind, id, tripNo: trip.tripNo, seg, night: ambush.night });
}

// Somewhere along the day's travel, or at the night's camp if the leg runs past dusk.
function ambushTime(sim, trip, rng) {
  const cfg = sim.data.raiders.encounter;
  const dusk = sim.cal.travelWindow(sim.cal.day(trip.legStart))[1];
  if (trip.legEnd > dusk + 60 && dusk > sim.now && rng.chance(cfg.nightShare)) {
    return { at: Math.min(trip.legEnd - 1, dusk + rng.int(60, 300)), night: true };
  }
  const along = Math.max(1, Math.round(trip.legMinutes * (0.2 + 0.6 * rng.float())));
  return { at: Math.max(sim.now, Math.min(trip.legEnd - 1, sim.cal.addTravel(trip.legStart, along))), night: false };
}

function onAmbush(sim, { band: bandId, kind, id, tripNo, seg, night }) {
  const band = getBand(sim, bandId);
  if (!band?.active || band.watching !== seg || band.members.length < sim.data.raiders.minToRaid) return;
  const v = victim(sim, kind, id);
  if (!v || v.trip.tripNo !== tripNo || v.trip.legSeg !== seg) return;
  resolve(sim, band, v, seg, night);
}

/** The band's morale: hunger saps it, a run of success lifts it. */
export function moraleOf(band) {
  return round2(Math.max(0.4, 1 - 0.5 * band.hunger + Math.min(0.3, band.raids * 0.02)));
}

// Settle an encounter: the band's approach, the traveller's answer, and the
// outcome, with every factor kept for the after-action report.
function resolve(sim, band, v, seg, night) {
  const cfg = sim.data.raiders.encounter;
  const rng = sim.rng('raids');
  const caution = (1000 - v.boldness) / 1000;
  const value = visibleValue(sim, band, v);
  const gearPower = bandGearPower(sim, band);
  const att = (band.members.length * moraleOf(band) + gearPower) * (night ? cfg.nightEdge : 1);
  const patrol = patrolOn(sim, seg);
  // Hired guards (step F) stand with the crew; the lookouts see them all.
  const terrain = sim.graph.segments.get(seg).terrain;
  const guards = v.guards?.length ? guardsInFight(sim, v.guards, { terrain, night }) : null;
  // Guards whose names the band knows: the lookouts think twice, and the outlaws fight less hard.
  if (guards) {
    const F = sim.data.mercs.fame;
    for (const g of v.guards) {
      const dread = Math.min(F.fearMax, believedRenown(sim, band.id, g.id) * F.fear);
      if (dread <= 0) continue;
      guards.seen = round2(guards.seen + dread);
      guards.surprised = round2(guards.surprised + dread);
      guards.factors.push({ k: 'fame', who: g.id, v: round2(dread) });
    }
  }
  const base = v.people * (1 + 0.3 * (v.boldness / 1000)) + (patrol ? patrol.guards * sim.data.raiders.patrol.strength : 0);
  const def = base + (guards?.seen ?? 0);
  const odds = def / (def + att); // the traveller's chance in a straight fight
  const desperate = band.hunger >= cfg.desperateHunger;
  const rec = {
    t: sim.now, band: band.id, seg, kind: v.kind, id: v.id, night, value: round2(value), att: round2(att), def: round2(def), patrol: Boolean(patrol),
    odds: round2(odds), approach: null, response: null, outcome: null, roll: null, goods: {}, bits: 0, hands: [], outlaws: [], captured: false,
    guards: (v.guards ?? []).map((g) => g.id), guardHarm: [], guardsDead: [], guardKills: 0, bandGear: round2(gearPower), factors: [],
  };

  const maxOdds = v.kind === 'lord' ? cfg.lordOdds : cfg.maxOdds;
  if ((value < cfg.minLoot && !desperate) || (odds > maxOdds && !desperate)) {
    // Not worth it, or too many to take on: they let them by, and may be seen doing it.
    v.trip.sawBand = band.id;
    if (v.guards?.length && value >= cfg.minLoot) staredDown(sim, band, v.trip);
    return null;
  }
  rec.approach = night && v.kind !== 'rider' && Object.keys(v.cargo).length ? 'steal'
    : v.kind === 'wayfarer' || (band.cruelty < 500 && !desperate) ? 'demand' : 'attack';
  // An attack from cover: unless a guard sees it coming, the guards fight surprised.
  const ctx = { terrain, night, surprised: false, spotted: null };
  if (guards && rec.approach === 'attack') {
    const spotter = spotAmbush(sim, v.guards, terrain, rng);
    if (spotter) {
      ctx.spotted = spotter.id;
      rec.factors.push({ k: 'spotted', who: spotter.id });
    } else {
      ctx.surprised = true;
      rec.factors.push({ k: 'surprised' });
    }
  }
  if (guards) {
    rec.factors.push({ k: 'guards', n: v.guards.length, v: ctx.surprised ? guards.surprised : guards.seen });
    for (const f of guards.factors) if (ctx.surprised || f.trait !== 'ambush') rec.factors.push(f);
  }
  if (gearPower > 0) rec.factors.push({ k: 'bandGear', v: round2(gearPower) });
  // Taken by surprise, the fight goes as if the guards were weaker than the lookouts reckoned.
  const fightOdds = ctx.surprised ? (base + guards.surprised) / (base + guards.surprised + att) : odds;

  if (rec.approach === 'steal') {
    // The watch may wake (sellswords keep a better one). If not, they're gone before dawn with what they could carry.
    // A double watch, if their orders keep one (step F).
    const doubled = v.orders?.night === 'watch';
    if (doubled) rec.order = { rule: 'watch' };
    const watch = (v.people + (v.guards ?? []).reduce((sum, g) => sum + g.stats.awa / 3, 0)) * (doubled ? 1.5 : 1);
    const woke = rng.chance(Math.min(0.9, watch / (watch + 3)));
    rec.response = woke ? 'woke' : 'slept';
    if (!woke) {
      rec.outcome = 'stolen';
      takeGoods(sim, band, v, rec, cfg.stealShare);
    } else fight(sim, band, v, rec, odds, rng, caution);
  } else if (v.kind === 'rider' || v.kind === 'courier') {
    rec.response = 'fled';
    if (rng.chance(cfg.flee.rider)) rec.outcome = 'escaped';
    else {
      rec.outcome = 'robbed';
      takeLetters(sim, band, v, rec);
    }
  } else {
    // Standing orders (§13) decide: pay, run, or stand and fight.
    const said = orderedResponse(v.orders, rec.approach, att, def);
    rec.order = { rule: said.rule, ...(said.ratio ? { ratio: said.ratio } : {}) };
    if (said.act === 'pay') {
      rec.response = 'paid';
      rec.outcome = 'toll';
      payToll(sim, band, v, rec, value * cfg.tollShare);
    } else if (said.act === 'run') {
      rec.response = 'fled';
      const load = Object.keys(v.cargo).length > 0;
      if (load && v.orders.cargo === 'drop' && (v.kind === 'merchant' || rng.chance(cfg.flee.wayfarer))) {
        // Cut loose and run: the goods are the price of getting away.
        rec.order.cargo = 'drop';
        rec.outcome = 'dropped';
        takeGoods(sim, band, v, rec, 1);
      } else if (!load && rng.chance(cfg.flee.wayfarer)) {
        rec.outcome = 'escaped';
      } else {
        // A running fight, holding on to the load (or caught): worse odds than standing.
        if (load) rec.order.cargo = 'hold';
        fight(sim, band, v, rec, fightOdds * 0.7, rng, caution);
      }
    } else {
      rec.response = rec.approach === 'demand' ? 'refused' : 'fought';
      fight(sim, band, v, rec, rec.approach === 'demand' ? odds : fightOdds, rng, caution);
    }
  }

  if (v.guards?.length) afterEncounter(sim, band, v, rec, ctx);
  // The lord takes it personally: an attack on his party, or on his post.
  if (v.kind === 'lord') angerLord(sim, sim.data.lord.travel.anger + (rec.captured ? 0.5 : 0), band);
  if (v.kind === 'rider' && rec.outcome === 'robbed') angerLord(sim, 0.2, band);
  // A bounty on this band: the treasury pays for every one of them killed.
  if (rec.outlaws.length && v.kind !== 'lord') {
    const killers = rec.killers ?? [];
    rec.bounty = payBounty(sim, band, [
      ...killers.map((id) => ({ account: `merc:${id}`, heads: 1 })),
      ...(v.account ? [{ account: v.account, heads: rec.outlaws.length - killers.length }] : []),
    ]);
  }
  if (rec.captured) releaseGuards(sim, v.trip, v.trip.from); // the guards scatter back the way they came, unpaid
  band.raids += rec.outcome === 'fought off' ? 0 : 1;
  const danger = threatOf(sim, band, seg);
  if (v.trip) v.trip.raided = { band: band.id, seg, danger };
  reportRoad(sim, v.id, seg, { danger, what: 'raided', band: band.id }); // they know now, and they'll tell
  const st = sim.state.raiders;
  st.encounters.push(rec);
  if (st.encounters.length > 60) st.encounters.shift();
  sim.log('raid:encounter', {
    band: band.id, kind: v.kind, who: v.id, seg, night, approach: rec.approach, response: rec.response, outcome: rec.outcome,
    goods: rec.goods, bits: rec.bits, hands: rec.hands.length, outlaws: rec.outlaws.length, captured: rec.captured, bounty: rec.bounty ?? 0,
    leaderFell: rec.leaderFell ?? false, playerDied: rec.playerDied ?? false, player: Boolean(v.who?.player), rider: Boolean(v.who?.player && (v.who.rider || rec.playerDied)), guards: rec.guards, guardHarm: rec.guardHarm, factors: rec.factors, order: rec.order ?? null,
  });
  // Infamy: what the band did, and everyone who met them knows it.
  const I = sim.data.raiders.infamy;
  const infamy = (rec.outcome === 'fought off' || rec.outcome === 'escaped' ? 0 : I.robbery) + (rec.hands.length + rec.guardsDead.length) * I.death +
    (rec.outcome === 'murdered' ? I.death : 0) + (rec.captured ? (v.kind === 'lord' ? I.lord : I.captive) : 0);
  if (infamy) addFame(sim, band, infamy, { band: true });
  witnessFame(sim, v.id, band, { band: true });
  if (v.kind === 'merchant') {
    if (!v.who.player) reviseOrders(sim, v.who, rec); // a bad day changes a merchant's standing orders (the player sets their own)
    writeOffIfEmpty(sim, v.who);
  }
  checkWiped(sim, band);
  return rec;
}

function fight(sim, band, v, rec, odds, rng, caution) {
  const cfg = sim.data.raiders.encounter;
  rec.roll = round2(rng.float());
  if (rec.roll < odds) {
    rec.outcome = 'fought off';
    // Sellswords cut down more of them.
    rec.killers = v.guards?.length ? rollKillers(sim, v.guards, rec, rng) : [];
    const dead = 1 + (rng.chance(0.3) ? 1 : 0) + rec.killers.length;
    killOutlaws(sim, band, rec, dead);
    outlawsDropGear(sim, band, v, rec.outlaws.length, rng);
    if (rng.chance(0.25)) killHands(sim, v, rec, 1, band);
    band.fear[rec.seg] = round3(band.fear[rec.seg] + 0.5 * rec.outlaws.length);
    return;
  }
  rec.outcome = 'robbed';
  takeGoods(sim, band, v, rec, 1);
  takeCoin(sim, band, v, rec);
  if (rng.chance(0.15)) killOutlaws(sim, band, rec, 1);
  if (v.kind === 'wayfarer') {
    if (rng.chance(cfg.murderChance)) {
      rec.outcome = 'murdered';
      murderWayfarer(sim, band, v, rec);
    }
    return;
  }
  if (v.kind === 'merchant') {
    killHands(sim, v, rec, 1 + (rng.chance(0.4) ? 1 : 0), band);
    // The player's caravan (step G): only worth taking if the player rides with it, and the player may die.
    if (riding(v.who) && rng.chance(sim.data.player.deathChance)) {
      rec.playerDied = true;
      playerDies(sim, 'raid', v.who);
    } else if ((!v.who.player || riding(v.who)) && rng.chance(cfg.captureChance * (0.5 + caution))) capture(sim, band, v, rec);
  }
  if (v.kind === 'lord') {
    // His household guards die around him; and the prize is the man himself.
    killHands(sim, v, rec, 1 + (rng.chance(0.5) ? 1 : 0), band);
    if (rng.chance(cfg.captureChance + 0.2)) captureLord(sim, band, rec);
  }
}

// ── What changes hands ──────────────────────────────────────────────────────

function takeGoods(sim, band, v, rec, share) {
  for (const [gid, qty] of Object.entries(v.cargo)) {
    const want = share >= 1 ? qty : Math.floor(qty * share * 10) / 10;
    if (!(want > 0)) continue;
    const got = v.kind === 'merchant' ? loseCargo(sim, v.who, gid, want) : losePack(sim, v.who, want);
    if (!(got > 0)) continue;
    band.loot[gid] = round3((band.loot[gid] ?? 0) + got);
    rec.goods[gid] = round3((rec.goods[gid] ?? 0) + got);
    v.cargo[gid] = round3(qty - got);
  }
}

function takeCoin(sim, band, v, rec) {
  if (!v.account) return;
  rec.bits += transfer(sim, v.account, bandAccount(band), balance(sim, v.account) * v.carried);
}

// A toll: coin first, and goods to make up what the purse can't cover.
function payToll(sim, band, v, rec, marks) {
  const want = toBits(sim, marks);
  const paid = v.account ? transfer(sim, v.account, bandAccount(band), Math.min(want, balance(sim, v.account) * v.carried)) : 0;
  rec.bits += paid;
  const short = want - paid;
  if (short > 0) {
    const value = visibleValue(sim, band, { ...v, account: null, letters: false });
    if (value > 0) takeGoods(sim, band, v, rec, Math.min(1, short / sim.data.coin.bitsPerMark / value));
  }
}

// The lord's post: the letters go to the band (who can read, or sell, what they say).
function takeLetters(sim, band, v, rec) {
  const pouch = holderOf(sim, v.id) ?? {};
  let letters = 0;
  for (const key of Object.keys(pouch).sort()) {
    if (pouch[key].road || pouch[key].fame) continue; // what the rider saw (of the roads, of who's who) stays in their head
    learn(sim, band.id, pouch[key]);
    delete pouch[key];
    letters++;
  }
  rec.letters = letters;
  if (v.kind === 'courier') courierRobbed(sim, v.id); // the player's orders never arrive
}

// Hired hands come from the town the caravan set out from; their deaths are that town's losses.
// Sellswords stand in front: a blow meant for a hand may fall on a guard instead (mercs.js).
function killHands(sim, v, rec, n, band) {
  if (v.kind !== 'merchant' && v.kind !== 'lord') return;
  // A caravan's hands are hired where it set out; the lord's are his seat's guard.
  const home = v.kind === 'lord' ? sim.state.lord.seat : v.trip.from;
  const trades = v.kind === 'lord' ? ['guard'] : ['labourer', 'porter', 'carter'];
  for (let i = 0; i < n && (v.trip.crew ?? 0) > 1; i++) {
    if (guardTakesBlow(sim, band, v, rec, sim.rng('raids'))) continue;
    const pool = residentsAt(sim, home).filter((r) => trades.includes(r.profession));
    const r = pool.length ? sim.rng('raids').pick(pool) : null;
    if (r) killResident(sim, { id: r.id, cause: 'raid' });
    rec.hands.push(r?.id ?? null);
    v.trip.crew -= 1;
  }
}

function killOutlaws(sim, band, rec, n) {
  for (let i = 0; i < n && band.members.length; i++) {
    // The leader goes last.
    const others = band.members.filter((id) => id !== band.leader);
    const id = others.length ? others[others.length - 1] : band.leader;
    const r = getResident(sim, id);
    r.alive = false;
    r.diedAt = sim.now;
    r.cause = 'fight';
    band.members = band.members.filter((x) => x !== id);
    band.lost += 1;
    rec.outlaws.push(id);
    if (id === band.leader) {
      band.leader = band.members[0] ?? null;
      rec.leaderFell = true;
    }
  }
}

// After a fight has been told: a band with nobody left is finished.
function checkWiped(sim, band) {
  if (band.active && !band.members.length) disband(sim, band, 'wiped out');
}

function murderWayfarer(sim, band, v, rec) {
  const w = v.who;
  rec.bits += transfer(sim, v.account, bandAccount(band), balance(sim, v.account));
  w.dead = sim.now;
  w.trip = null;
  w.at = null;
  sim.state.wayfarers.order = sim.state.wayfarers.order.filter((id) => id !== w.id);
  band.killed += 1;
}

// ── Ransom ──────────────────────────────────────────────────────────────────

function capture(sim, band, v, rec) {
  const cfg = sim.data.raiders.ransom;
  const m = v.who;
  takeGoods(sim, band, v, rec, 1);
  const ransom = Math.max(toBits(sim, cfg.min), Math.round(balance(sim, v.account) * cfg.share));
  m.captive = { band: band.id, since: sim.now, ransom, deadline: sim.now + cfg.days * DAY };
  m.trip = null;
  m.at = null;
  band.captives.push(m.id);
  rec.captured = true;
  rec.ransom = ransom;
}

// Each day, for every merchant held: their house pays if it can; failing that
// a generous lord, or the home town's households; past the deadline, a cruel
// leader kills them and a softer one lets them go with nothing.
function captives(sim) {
  const cfg = sim.data.raiders.ransom;
  for (const id of sim.state.raiders.order) {
    const band = sim.state.raiders.bands[id];
    for (const mid of [...band.captives]) {
      const m = getMerchant(sim, mid);
      const c = m.captive;
      const house = accountOf(m);
      const heads = Math.max(1, residentsAt(sim, m.home).length);
      const lord = sim.state.lord;
      let payer = null;
      if (balance(sim, house) >= c.ransom) payer = house;
      else if (lord && lord.traits.generosity >= cfg.lordGenerosity && balance(sim, 'treasury') >= c.ransom + toBits(sim, sim.data.lord.emergencyFloor)) payer = 'treasury';
      else if (balance(sim, `purse:${m.home}`) >= c.ransom + toBits(sim, cfg.townKeepsPerHead * heads)) payer = `purse:${m.home}`;
      if (payer) {
        const bits = transfer(sim, payer, bandAccount(band), c.ransom);
        if (payer === 'treasury' && lord) lord.spent.ransom = (lord.spent.ransom ?? 0) + bits;
        release(sim, band, m, 'ransomed', { bits, payer: payer === house ? 'house' : payer === 'treasury' ? 'lord' : 'town' });
      } else if (sim.now >= c.deadline) {
        if (band.cruelty >= cfg.killAbove && m.player) {
          // The player dies in the hills; the caravan's hands straggle home with the wagons.
          playerDies(sim, 'held for ransom and never paid for', m);
          sim.log('raid:captive-killed', { band: band.id, who: m.id, player: true });
          release(sim, band, m, 'released', {});
        } else if (band.cruelty >= cfg.killAbove) {
          band.captives = band.captives.filter((x) => x !== m.id);
          m.captive = null;
          m.active = false;
          m.ruinedAt = sim.now;
          m.killed = true;
          transfer(sim, house, `purse:${m.home}`, balance(sim, house)); // what's left goes to the family
          band.killed += 1;
          sim.log('raid:captive-killed', { band: band.id, who: m.id });
        } else release(sim, band, m, 'released', {});
      }
    }
  }
}

function release(sim, band, m, how, extra) {
  band.captives = band.captives.filter((x) => x !== m.id);
  m.captive = null;
  if (m.player) playerFreed(sim, m);
  m.at = m.home; // walked home, or was brought there
  sim.schedule(sim.cal.travelWindow(sim.cal.day(sim.now) + 1)[0] + 30, 'merchant:decide', { id: m.id, tripNo: m.tripNo });
  sim.log(`raid:${how}`, { band: band.id, who: m.id, ...extra });
}

// ── After a leg: what the traveller tells of the road ──────────────────────

/**
 * A traveller has come to the end of a road. What they report: the raid they
 * suffered, the signs of a band they noticed (or were let past by), or a quiet road.
 */
export function afterLeg(sim, holder, segId, trip) {
  if (!sim.state.knowledge) return;
  const base = sim.graph.segments.get(segId).danger;
  if (trip?.raided?.seg === segId) {
    reportRoad(sim, holder, segId, { danger: trip.raided.danger, what: 'raided', band: trip.raided.band });
    trip.raided = null;
    trip.sawBand = null;
    return;
  }
  const band = sim.state.raiders ? bandOn(sim, segId) : null;
  if (band && (trip?.sawBand === band.id || sim.rng('raids').chance(sim.data.raiders.noticeChance))) {
    reportRoad(sim, holder, segId, { danger: threatOf(sim, band, segId) * 0.8, what: 'signs', band: band.id });
  } else {
    reportRoad(sim, holder, segId, { danger: base, what: 'quiet' });
  }
  if (trip) trip.sawBand = null;
}

// ── Disbanding ──────────────────────────────────────────────────────────────

function disband(sim, band, why) {
  band.active = false;
  band.ended = sim.now;
  // Anyone still held is let go.
  for (const mid of [...band.captives]) release(sim, band, getMerchant(sim, mid), 'released', {});
  // The rest go home, or somewhere that will feed them, as labourers; failing that, they take ship.
  let home = 0;
  for (const id of [...band.members]) {
    const r = getResident(sim, id);
    const town = homecoming(sim, r);
    if (town) {
      r.home = town;
      r.profession = 'labourer';
      r.band = null;
      refreshNeeds(sim, town);
      home++;
    } else {
      r.alive = false;
      r.diedAt = sim.now;
      r.cause = 'emigrated';
    }
  }
  band.members = [];
  scatterBandGear(sim, band, hideoutById(sim, band.hideout).fence); // their arms turn up for sale in the fence's town
  // Whatever coin is left goes into the ground at the hideout.
  const buried = transfer(sim, bandAccount(band), 'hoard', balance(sim, bandAccount(band)));
  if (buried) addHoard(sim, band, buried);
  sim.log('raid:disbanded', { band: band.id, why, home, buried });
}

// Where an outlaw goes when the band breaks up: back where they came from if it
// will feed them, else the best-fed town with room.
function homecoming(sim, r) {
  const d = sim.data.economy.demography;
  const ix = economyIndex(sim.data);
  const hunger = sim.state.economy.hunger;
  const room = (sid) => residentsAt(sim, sid).length < Math.floor(sim.graph.nodes.get(sid).residents * d.ceiling);
  if (r.from && ix.markets.includes(r.from) && hunger[r.from] < d.migrateHunger && room(r.from)) return r.from;
  return ix.markets.filter((sid) => !ix.isOutside(sid) && hunger[sid] < 0.1 && room(sid)).sort((a, b) => hunger[a] - hunger[b] || (a < b ? -1 : 1))[0] ?? null;
}

// ── Living: food, the fence, the hoard ──────────────────────────────────────

function eat(sim, band) {
  const cfg = sim.data.raiders.food;
  const hideout = hideoutById(sim, band.hideout);
  const n = band.members.length;
  const need = n * cfg.perHead;
  // What they find for themselves: game, fish, snares (less in winter).
  const winter = sim.cal.season(sim.now).id === 'winter';
  let got = Math.min(need, n * hideout.forage * (winter ? cfg.winterForage : 1));
  // Then stolen grain, then grain bought through the fence.
  const fromLoot = Math.min(band.loot.grain ?? 0, need - got);
  if (fromLoot > 0) {
    band.loot.grain = round3(band.loot.grain - fromLoot);
    if (band.loot.grain <= 0) delete band.loot.grain;
    band.eatenLoot = round3((band.eatenLoot ?? 0) + fromLoot);
    got += fromLoot;
  }
  const fromStore = Math.min(band.food, need - got);
  band.food = round3(band.food - fromStore);
  got += fromStore;
  const fed = need > 0 ? got / need : 1;
  band.hunger = round3(band.hunger * 0.7 + (1 - fed) * 0.3);
  band.starving = band.hunger >= cfg.starving ? (band.starving ?? 0) + 1 : 0;
}

// Low on food: buy grain through the fence, as far as the band's coin goes.
function provision(sim, band) {
  const cfg = sim.data.raiders.food;
  const n = band.members.length;
  const have = band.food + (band.loot.grain ?? 0);
  const autumn = sim.cal.season(sim.now).id === 'autumn';
  const keepDays = autumn ? cfg.winterDays : cfg.keepDays;
  const buyDays = autumn ? cfg.winterDays + cfg.keepDays : cfg.buyDays;
  if (have >= n * cfg.perHead * keepDays) return;
  const town = hideoutById(sim, band.hideout).fence;
  const price = quote(sim, town, 'grain').price;
  const market = sim.state.economy.markets[town].grain;
  // Short of coin: dig into the band's own cache first.
  const cache = sim.state.raiders.hoards.find((h) => h.place === band.hideout && h.band === band.id);
  const wanted = toBits(sim, price * n * cfg.perHead * buyDays);
  if (cache && balance(sim, bandAccount(band)) < wanted) {
    const dug = transfer(sim, 'hoard', bandAccount(band), Math.min(cache.bits, wanted));
    cache.bits -= dug;
    if (cache.bits <= 0) sim.state.raiders.hoards = sim.state.raiders.hoards.filter((h) => h !== cache);
  }
  const afford = balance(sim, bandAccount(band)) / Math.max(1, toBits(sim, price));
  const qty = Math.floor(Math.min(n * cfg.perHead * buyDays - have, afford, market.stock * 0.3) * 10) / 10;
  if (!(qty > 0)) return;
  const got = load(sim, town, 'grain', qty);
  transfer(sim, bandAccount(band), traderAccount(sim, town), toBits(sim, price * got));
  band.food = round3(band.food + got);
}

// Every few days, loot goes to a fence in the nearby town, who pays half the
// market price and passes it to the town's traders: cheap goods leak into that market.
function fence(sim, band) {
  const cfg = sim.data.raiders;
  const town = hideoutById(sim, band.hideout).fence;
  // The fence's tavern: the band hears the talk (who guards whom), and lets slip what it knows.
  swapNews(sim, band.id, town, { look: false });
  const buyer = traderAccount(sim, town);
  const keepGrain = band.members.length * cfg.food.perHead * 20; // stolen grain they'll eat themselves
  for (const gid of Object.keys(band.loot).sort()) {
    const spare = gid === 'grain' ? band.loot[gid] - keepGrain : band.loot[gid];
    if (!(spare >= 1)) continue;
    const price = quote(sim, town, gid).price * cfg.fence.share;
    const cash = buyer === 'ships' ? Infinity : balance(sim, buyer);
    const qty = Math.floor(Math.min(spare, cash / Math.max(1, toBits(sim, price))) * 10) / 10;
    if (!(qty >= 1)) continue;
    const bits = transfer(sim, buyer, bandAccount(band), toBits(sim, price * qty));
    unload(sim, town, gid, qty);
    band.loot[gid] = round3(band.loot[gid] - qty);
    if (band.loot[gid] <= 0.001) delete band.loot[gid];
    sim.log('raid:fenced', { band: band.id, at: town, good: gid, qty, bits });
  }
}

// Coin beyond what the band needs to hand: half is drunk and gambled away in the
// fence town (its households are glad of it), half goes into the ground near the hideout.
function bury(sim, band) {
  const cfg = sim.data.raiders.hoard;
  const keep = toBits(sim, cfg.keepPerHead * band.members.length + cfg.keepBase);
  const excess = balance(sim, bandAccount(band)) - keep;
  if (excess < toBits(sim, cfg.minBury)) return;
  band.spent = (band.spent ?? 0) + transfer(sim, bandAccount(band), `purse:${hideoutById(sim, band.hideout).fence}`, excess * cfg.spendShare);
  const bits = transfer(sim, bandAccount(band), 'hoard', (balance(sim, bandAccount(band)) - keep) * cfg.share);
  if (bits) addHoard(sim, band, bits);
}

// Coin goes into the band's cache at the hideout: one hole, topped up, until it's found.
function addHoard(sim, band, bits) {
  const cache = sim.state.raiders.hoards.find((h) => h.place === band.hideout && h.band === band.id);
  if (cache) cache.bits += bits;
  else sim.state.raiders.hoards.push({ id: sim.nextId('h'), place: band.hideout, band: band.id, bits, t: sim.now });
}

// Now and then someone out on the hills stumbles on an old hoard.
function unearth(sim) {
  const cfg = sim.data.raiders.hoard;
  const st = sim.state.raiders;
  const rng = sim.rng('hoards');
  const keep = [];
  for (const h of st.hoards) {
    if (sim.now - h.t < cfg.hiddenDays * DAY || !rng.chance(cfg.findChance)) {
      keep.push(h);
      continue;
    }
    const hideout = hideoutById(sim, h.place);
    const town = rng.pick(hideout.near);
    const outdoors = residentsAt(sim, town).filter((r) => ['shepherd', 'woodcutter', 'farmer', 'miner', 'labourer'].includes(r.profession));
    const finder = outdoors.length ? rng.pick(outdoors) : null;
    if (!finder) {
      keep.push(h);
      continue;
    }
    const bits = transfer(sim, 'hoard', `purse:${town}`, h.bits);
    sim.log('raid:unearthed', { who: finder.id, at: town, place: h.place, bits, band: h.band });
  }
  st.hoards = keep;
}

// ── Starving ────────────────────────────────────────────────────────────────

// A starving band falls on a town's granary, moves to a hideout with open roads,
// or, starved long enough, breaks up.
function starving(sim, band) {
  const cfg = sim.data.raiders;
  const rng = sim.rng('raiders');
  if ((band.starving ?? 0) >= cfg.food.disbandAfter) {
    disband(sim, band, 'starving');
    return;
  }
  const move = betterHideout(sim, band);
  if (move) {
    relocate(sim, band, move);
    return;
  }
  if (rng.chance(cfg.town.raidChance)) raidTown(sim, band, rng);
}

// A free hideout with a road open this season, when every road this band watches is shut or dead.
function betterHideout(sim, band) {
  const cfg = sim.data.raiders;
  const season = sim.cal.season(sim.now).id;
  const open = (seg) => !sim.graph.segments.get(seg).seasonal?.[season]?.closed;
  const here = hideoutById(sim, band.hideout);
  const dead = here.watches.every((seg) => !open(seg)) || Object.values(band.take).every((v) => v < 5);
  if (!dead) return null;
  band.idleDays = (band.idleDays ?? 0) + 1;
  if (band.idleDays < cfg.relocateIdleDays && here.watches.some(open)) return null;
  const taken = new Set(activeBands(sim).map((b) => b.hideout));
  const free = cfg.hideouts.filter((h) => !taken.has(h.id) && h.watches.some(open));
  return free.length ? free.sort((a, b) => b.forage - a.forage || (a.id < b.id ? -1 : 1))[0] : null;
}

function relocate(sim, band, hideout) {
  const from = band.hideout;
  band.hideout = hideout.id;
  band.watching = hideout.watches[0];
  band.take = Object.fromEntries(hideout.watches.map((s) => [s, 0]));
  band.fear = Object.fromEntries(hideout.watches.map((s) => [s, 0]));
  band.idleDays = 0;
  sim.log('raid:relocated', { band: band.id, from, to: hideout.id });
}

// Night raid on the weakest town near the hideout: its guards and townsfolk against the band.
function raidTown(sim, band, rng) {
  const cfg = sim.data.raiders.town;
  const ix = economyIndex(sim.data);
  const towns = hideoutById(sim, band.hideout).near.filter((sid) => !ix.isOutside(sid));
  const defence = (sid) => {
    const people = residentsAt(sim, sid);
    return people.filter((r) => r.profession === 'guard').length * cfg.guardStrength + people.length * cfg.folkStrength;
  };
  const target = towns.sort((a, b) => defence(a) - defence(b) || (a < b ? -1 : 1))[0];
  if (!target) return;
  const att = band.members.length * moraleOf(band);
  const def = defence(target);
  if (att / (att + def) < cfg.minChance) return; // even starving, they won't throw themselves at the walls
  const roll = rng.float();
  const rec = { band: band.id, at: target, success: roll < att / (att + def), grain: 0, bits: 0, dead: null, outlaws: 0 };
  if (rec.success) {
    const market = sim.state.economy.markets[target].grain;
    rec.grain = round3(load(sim, target, 'grain', Math.min(market.stock * cfg.grainShare, band.members.length * cfg.grainPerMember)));
    band.food = round3(band.food + rec.grain);
    rec.bits = transfer(sim, `till:${target}`, bandAccount(band), balance(sim, `till:${target}`) * cfg.tillShare);
    if (rng.chance(0.4)) {
      const people = residentsAt(sim, target).filter((r) => r.profession !== 'noble' && r.profession !== 'mintmaster' && r.profession !== 'dependant');
      const victim = people.find((r) => r.profession === 'guard') ?? (people.length ? rng.pick(people) : null);
      if (victim) rec.dead = killResident(sim, { id: victim.id, cause: 'raid' })?.id ?? null;
    }
    band.raids += 1;
  } else {
    const r = { outlaws: [] };
    killOutlaws(sim, band, r, 1 + (rng.chance(0.4) ? 1 : 0));
    rec.outlaws = r.outlaws.length;
  }
  sim.log('raid:town', rec);
  checkWiped(sim, band);
}

// ── The lord's patrols ──────────────────────────────────────────────────────

// Soldiers on the road the band watches: fear grows, and they may be run down.
function patrolled(sim, band) {
  const cfg = sim.data.raiders.patrol;
  const p = patrolOn(sim, band.watching);
  if (!p) return;
  band.fear[band.watching] = round3(band.fear[band.watching] + cfg.fear);
  const rng = sim.rng('raids');
  if (!rng.chance(cfg.clash)) return;
  const att = band.members.length * moraleOf(band) + bandGearPower(sim, band);
  // Sellswords riding with the patrol (step F) count as the guards they are.
  const trip = { guards: p.mercs ?? [], salvage: p.salvage ?? [] };
  const hired = guardsOf(sim, trip);
  const terrain = sim.graph.segments.get(band.watching).terrain;
  const def = p.guards * cfg.strength + (hired.length ? guardsInFight(sim, hired, { terrain, night: false }).seen : 0);
  const guardsWin = rng.float() < def / (att + def);
  const rec = { band: band.id, route: p.route, guardsWin, outlaws: 0, guard: null, mercs: hired.map((g) => g.id) };
  // What the sellswords live through, as in any fight on the road.
  const fightRec = { t: sim.now, band: band.id, seg: band.watching, night: false, roll: 0, outcome: guardsWin ? 'fought off' : 'robbed', response: 'fought', hands: [], outlaws: [], guardHarm: [], guardsDead: [], killers: [] };
  if (guardsWin) {
    fightRec.killers = hired.length ? rollKillers(sim, hired, fightRec, rng) : [];
    killOutlaws(sim, band, fightRec, 1 + (rng.chance(0.5) ? 1 : 0) + fightRec.killers.length);
    rec.outlaws = fightRec.outlaws.length;
    band.fear[band.watching] = round3(band.fear[band.watching] + 1);
    rec.bounty = payBounty(sim, band, [
      ...fightRec.killers.map((id) => ({ account: `merc:${id}`, heads: 1 })),
      { account: `purse:${sim.state.lord.seat}`, heads: fightRec.outlaws.length - fightRec.killers.length },
    ]);
  } else {
    // Half the time the blow falls where a sellsword stands (the patrol spreads out more than a caravan).
    if (!(hired.length && rng.chance(0.5) && guardTakesBlow(sim, band, { trip }, fightRec, rng))) {
      const guards = residentsAt(sim, sim.state.lord.seat).filter((r) => r.profession === 'guard');
      if (guards.length) rec.guard = killResident(sim, { id: rng.pick(guards).id, cause: 'raid' })?.id ?? null;
    }
    angerLord(sim, 0.2, band);
  }
  if (hired.length) {
    afterEncounter(sim, band, { trip }, fightRec, { terrain, night: false, surprised: false, spotted: null });
    p.mercs = trip.guards;
    p.salvage = trip.salvage;
    rec.guardHarm = fightRec.guardHarm;
  }
  sim.log('raid:patrol-clash', rec);
  checkWiped(sim, band);
}

// ── The lab ─────────────────────────────────────────────────────────────────

// Put a band (or more men) in a hideout, watching one of its roads.
function onLabBand(sim, { hideout: hid, members = 6, watch = null }) {
  const hideout = hideoutById(sim, hid);
  if (!hideout) return;
  const rng = sim.rng('lab');
  let band = activeBands(sim).find((b) => b.hideout === hid);
  if (!band) band = foundBand(sim, hideout, rng);
  for (let i = 0; i < members; i++) join(band, newOutlaw(sim, rng, hideout.near[0]));
  if (watch && hideout.watches.includes(watch)) band.watching = watch;
  sim.log('raid:summoned', { band: band.id, hideout: band.hideout, members: band.members.length, lab: true });
}
