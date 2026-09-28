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
// Coin moves only by transfer (bands hold 'band:<id>' accounts); stolen goods
// leave the wagons for the band's loot and reach a market only when fenced.

import { economyIndex, quote } from '../economy/pricing.js';
import { balance, toBits, transfer } from '../economy/money.js';
import { residentsAt } from '../economy/people.js';
import { refreshNeeds } from './economy.js';
import { getResident, killResident, newName } from './residents.js';
import { holderOf, learn, reportRoad } from './knowledge.js';
import { getMerchant, loseCargo, writeOffIfEmpty } from './merchants.js';
import { getWayfarer, losePack } from './wayfarers.js';
import { getRider } from './post.js';

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
    const day = sim.cal.day(sim.now);
    for (const band of activeBands(sim)) {
      for (const seg of Object.keys(band.take)) {
        band.take[seg] = round2(band.take[seg] * cfg.takeMemory);
        band.fear[seg] = round3(band.fear[seg] * cfg.fearMemory);
      }
      if (day % cfg.watchEvery === 0) chooseRoad(sim, band);
    }
    captives(sim);
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

// Who could take to the hills from a hungry town: the idle first, then any able
// worker. Not children or elders, and not the lord's people or the guard.
const STAYS = new Set(['dependant', 'noble', 'mintmaster', 'guard']);
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
  sim.log('raid:recruit', { who: r.id, from: sid, band: band.id, founded: band.members.length === 1, hunger: round2(hunger), poverty: round2(poverty) });
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
  return marks;
}

function victim(sim, kind, id) {
  if (kind === 'merchant') {
    const m = getMerchant(sim, id);
    if (!m?.active || !m.trip) return null;
    return { kind, id, who: m, name: m.name, trip: m.trip, account: `merchant:${id}`, carried: 0.2, cargo: { ...m.cargo }, people: (m.trip.crew ?? 3) + 1, boldness: m.boldness };
  }
  if (kind === 'wayfarer') {
    const w = getWayfarer(sim, id);
    if (!w?.trip || w.retired || w.dead) return null;
    return { kind, id, who: w, name: w.name, trip: w.trip, account: `wayfarer:${id}`, carried: 1, cargo: w.pack ? { [w.pack.good]: w.pack.qty } : {}, people: 1, boldness: w.boldness, peddler: Boolean(w.pack) };
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
    const spot = cfg.spot * cfg.visibility[v.peddler ? 'peddler' : kind] * (n / (n + 3));
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
  const att = band.members.length * moraleOf(band) * (night ? cfg.nightEdge : 1);
  const def = v.people * (1 + 0.3 * (v.boldness / 1000));
  const odds = def / (def + att); // the traveller's chance in a straight fight
  const desperate = band.hunger >= cfg.desperateHunger;
  const rec = {
    t: sim.now, band: band.id, seg, kind: v.kind, id: v.id, night, value: round2(value), att: round2(att), def: round2(def),
    odds: round2(odds), approach: null, response: null, outcome: null, roll: null, goods: {}, bits: 0, hands: [], outlaws: [], captured: false,
  };

  if ((value < cfg.minLoot && !desperate) || (odds > cfg.maxOdds && !desperate)) {
    // Not worth it, or too many to take on: they let them by, and may be seen doing it.
    v.trip.sawBand = band.id;
    return null;
  }
  rec.approach = night && v.kind !== 'rider' && Object.keys(v.cargo).length ? 'steal'
    : v.kind === 'wayfarer' || (band.cruelty < 500 && !desperate) ? 'demand' : 'attack';

  if (rec.approach === 'steal') {
    // The watch may wake. If not, they're gone before dawn with what they could carry.
    const woke = rng.chance(Math.min(0.8, v.people / (v.people + 3)));
    rec.response = woke ? 'woke' : 'slept';
    if (!woke) {
      rec.outcome = 'stolen';
      takeGoods(sim, band, v, rec, cfg.stealShare);
    } else fight(sim, band, v, rec, odds, rng, caution);
  } else if (v.kind === 'rider') {
    rec.response = 'fled';
    if (rng.chance(cfg.flee.rider)) rec.outcome = 'escaped';
    else {
      rec.outcome = 'robbed';
      takeLetters(sim, band, v, rec);
    }
  } else if (rec.approach === 'demand') {
    if (caution >= 0.5 || odds < 0.35) {
      rec.response = 'paid';
      rec.outcome = 'toll';
      payToll(sim, band, v, rec, value * cfg.tollShare);
    } else {
      rec.response = 'refused';
      fight(sim, band, v, rec, odds, rng, caution);
    }
  } else if (caution > cfg.fleeCaution) {
    // Cut loose and run: the goods are the price of getting away.
    rec.response = 'fled';
    if (v.kind === 'merchant' || rng.chance(cfg.flee.wayfarer)) {
      rec.outcome = 'dropped';
      takeGoods(sim, band, v, rec, 1);
    } else fight(sim, band, v, rec, odds * 0.7, rng, caution);
  } else {
    rec.response = 'fought';
    fight(sim, band, v, rec, odds, rng, caution);
  }

  band.raids += rec.outcome === 'fought off' ? 0 : 1;
  const danger = threatOf(sim, band, seg);
  if (v.trip) v.trip.raided = { band: band.id, seg, danger };
  reportRoad(sim, v.id, seg, { danger, what: 'raided', band: band.id }); // they know now, and they'll tell
  const st = sim.state.raiders;
  st.encounters.push(rec);
  if (st.encounters.length > 60) st.encounters.shift();
  sim.log('raid:encounter', {
    band: band.id, kind: v.kind, who: v.id, seg, night, approach: rec.approach, response: rec.response, outcome: rec.outcome,
    goods: rec.goods, bits: rec.bits, hands: rec.hands.length, outlaws: rec.outlaws.length, captured: rec.captured,
    leaderFell: rec.leaderFell ?? false,
  });
  if (v.kind === 'merchant') writeOffIfEmpty(sim, v.who);
  return rec;
}

function fight(sim, band, v, rec, odds, rng, caution) {
  const cfg = sim.data.raiders.encounter;
  rec.roll = round2(rng.float());
  if (rec.roll < odds) {
    rec.outcome = 'fought off';
    killOutlaws(sim, band, rec, 1 + (rng.chance(0.4) ? 1 : 0));
    if (rng.chance(0.25)) killHands(sim, v, rec, 1);
    band.fear[rec.seg] = round3(band.fear[rec.seg] + 0.5 * rec.outlaws.length);
    return;
  }
  rec.outcome = 'robbed';
  takeGoods(sim, band, v, rec, 1);
  takeCoin(sim, band, v, rec);
  if (rng.chance(0.25)) killOutlaws(sim, band, rec, 1);
  if (v.kind === 'wayfarer') {
    if (rng.chance(cfg.murderChance)) {
      rec.outcome = 'murdered';
      murderWayfarer(sim, band, v, rec);
    }
    return;
  }
  if (v.kind === 'merchant') {
    killHands(sim, v, rec, 1 + (rng.chance(0.4) ? 1 : 0));
    if (rng.chance(cfg.captureChance * (0.5 + caution))) capture(sim, band, v, rec);
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
    if (pouch[key].road) continue; // what the rider saw of the roads stays in their head
    learn(sim, band.id, pouch[key]);
    delete pouch[key];
    letters++;
  }
  rec.letters = letters;
}

// Hired hands come from the town the caravan set out from; their deaths are that town's losses.
function killHands(sim, v, rec, n) {
  if (v.kind !== 'merchant') return;
  for (let i = 0; i < n && (v.trip.crew ?? 0) > 1; i++) {
    const pool = residentsAt(sim, v.trip.from).filter((r) => ['labourer', 'porter', 'carter'].includes(r.profession));
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
  if (!band.members.length) disband(sim, band, 'wiped out');
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
      const house = `merchant:${m.id}`;
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
        if (band.cruelty >= cfg.killAbove) {
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
  for (const mid of band.captives) release(sim, band, getMerchant(sim, mid), 'released', {});
  sim.log('raid:disbanded', { band: band.id, why });
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
  sim.log('raid:summoned', { band: band.id, members: band.members.length, lab: true });
}
