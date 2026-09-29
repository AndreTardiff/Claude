// Mercenaries: sellswords, their gear, and what both live through (spec §12–§13).
//
// A sellsword is a named resident (profession 'sellsword') who hires out to
// guard caravans. Each has five stats (strength, agility, discipline, awareness,
// nerve), up to four pieces of gear (weapon, armour, shield, charm), a purse, and
// a ledger of what they have lived through: roads walked by terrain, encounters,
// fights won and lost, ambushes, nights, wounds, kills and the companions beside
// them. Deeds earn points; enough points earn a rank (Green, Blooded, Seasoned,
// Veteran, Captain), and each rank raises the stat their deeds trained most, so
// two Veterans end up different people. A few explicit traits come from
// thresholds on the ledger (Forestwise, Ambush Veteran, Night Fighter…), and
// each changes later fights in a way the after-action report names.
//
// Gear is made by the smiths from goods in the market (used up, paid to the
// traders), wears in fights and is mended, and keeps its own ledger: fights,
// kills, blows turned, owners. Slowly it earns tiers (plain, proven, storied,
// renowned, legendary) that add a small edge, and at 'storied' a name. It outlives
// its owners: a dead guard's gear goes to the band that killed them, or back to
// town on the wagons, where it sits on a rack for the next buyer. Charms work by
// belief: their repute rises with their wearers' luck and falls with their
// deaths, and it is the repute that steadies (or shakes) the wearer. Very rarely
// one really is more than it seems; only the lab can tell. Scute coats, laced
// from the Old Carrier's shed shell plates, are the rarest armour of all.
//
// Merchants hire guards for the danger they believe is on the road (merchants.js);
// guards stand with the crew when a band strikes (raiders.js). Money moves only by
// transfer: wages from the house, bed and board to the town's households, gear to
// the town's traders (or the ships at the Outside).

import { economyIndex, quote } from '../economy/pricing.js';
import { traderAccount, useUp } from '../economy/market.js';
import { balance, toBits, transfer } from '../economy/money.js';
import { residentsAt } from '../economy/people.js';
import { refreshNeeds } from './economy.js';
import { getResident, newName } from './residents.js';

const DAY = 1440;
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const SLOTS = ['weapon', 'armour', 'shield', 'charm'];

export const mercs = {
  id: 'mercs',

  init(sim) {
    const cfg = sim.data.mercs;
    if (!cfg) return;
    sim.state.mercs = { byId: {}, order: [], items: {}, racks: {}, fallen: 0 };
    const rng = sim.rng('mercs.init');
    for (const [sid, n] of Object.entries(cfg.start)) {
      for (let i = 0; i < n; i++) {
        const r = {
          id: sim.nextId('r'), name: newName(sim, rng), home: sid, profession: 'sellsword',
          skill: 1000, learning: false, alive: true, diedAt: null, cause: null,
        };
        sim.state.residents.byId[r.id] = r;
        sim.state.residents.order.push(r.id);
        const g = newMerc(sim, rng, r, sid);
        outfit(sim, g, rng);
      }
    }
    // The region's scute coats: heirlooms, a few at most, on someone's back.
    const order = [...sim.state.mercs.order];
    rng.shuffle(order);
    for (let i = 0; i < cfg.startGear.scutes && i < order.length; i++) {
      const g = sim.state.mercs.byId[order[i]];
      if (g.gear.armour) sim.state.mercs.items[g.gear.armour].holder = { kind: 'lost' };
      equip(sim, g, newItem(sim, 'scute', { at: g.home, rng }));
    }
  },

  daily(sim) {
    if (!sim.state.mercs) return;
    for (const g of activeMercs(sim)) {
      heal(sim, g);
      if (g.trip || g.walking) continue;
      live(sim, g);
      if (!g.active) continue;
      shop(sim, g);
      waitForWork(sim, g);
    }
    recruit(sim);
  },

  handlers: {
    'merc:home': onHome,
  },
};

export const getMerc = (sim, id) => sim.state.mercs?.byId[id];
export const activeMercs = (sim) => (sim.state.mercs?.order ?? []).map((id) => sim.state.mercs.byId[id]).filter((g) => g.active);
export const mercAccount = (g) => `merc:${g.id}`;
export const itemById = (sim, id) => sim.state.mercs?.items[id];
export const nameOf = (sim, g) => getResident(sim, g.resident)?.name ?? g.id;
export const rankOf = (sim, g) => sim.data.mercs.ranks[g.rank];
export const tierOf = (sim, item) => sim.data.mercs.item.tiers[item.tier];
export const gearOf = (sim, g) => SLOTS.map((s) => g.gear[s]).filter(Boolean).map((id) => itemById(sim, id));
export const hasTrait = (g, t) => g.traits.includes(t);

/** A sellsword's name, for the chronicle. */
export const mercName = (sim, id) => {
  const g = getMerc(sim, id);
  return g ? nameOf(sim, g) : 'a sellsword';
};

/**
 * How a piece of gear is spoken of: its name if it has earned one, else whose it is
 * ("Wat Yarrow's spear"), else what it is ("a mail shirt").
 */
export function itemLabel(sim, item, { owner = true, named = true } = {}) {
  if (!item) return 'something';
  if (named && item.name) return item.name;
  const what = item.type === 'charm' ? item.charm : sim.data.mercs.gear[item.type].name;
  if (!owner) return item.type === 'charm' ? what : `${/^[aeiou]/.test(what) ? 'an' : 'a'} ${what}`;
  const last = item.owners[item.owners.length - 1];
  const r = last ? getResident(sim, last) : null;
  return r ? `${r.name}'s ${item.type === 'charm' ? what.replace(/^an? /, '') : what}` : (item.type === 'charm' ? what : `${/^[aeiou]/.test(what) ? 'an' : 'a'} ${what}`);
}

/** A sellsword's day rate, in marks: more for rank. */
export function wageOf(sim, g) {
  const w = sim.data.mercs.wage;
  return round2(w.base + w.perRank * g.rank);
}

// ── People ──────────────────────────────────────────────────────────────────

function newMerc(sim, rng, r, at) {
  const cfg = sim.data.mercs;
  const stats = {};
  const growth = {};
  for (const s of cfg.stats) {
    stats[s] = rng.int(cfg.startStat[0], cfg.startStat[1]);
    growth[s] = 0;
  }
  const g = {
    id: sim.nextId('g'),
    resident: r.id,
    home: r.home,
    at,
    active: true,
    joined: sim.now,
    trip: null, // { merchant, tripNo, from } while hired
    walking: false,
    stats,
    growth, // what their deeds have been training, toward the next rank
    rank: 0,
    deeds: 0, // points toward rank
    ledger: {
      encounters: 0, fights: 0, won: 0, lost: 0, kills: 0, nights: 0, ambushes: 0, spotted: 0, paid: 0, wounds: 0, severe: 0,
      km: { road: 0, forest: 0, hills: 0, marsh: 0 }, fightsIn: { road: 0, forest: 0, hills: 0, marsh: 0 }, with: {}, hires: 0,
    },
    favours: rng.pick(['spear', 'axe', 'sword', 'bow']), // the weapon they'd rather carry
    traits: [],
    pairs: [], // merc ids they're a Trusted Pair with
    gear: { weapon: null, armour: null, shield: null, charm: null },
    wound: null, // { severe, until }
    idleDays: 0,
    brokeDays: 0,
    earned: 0, // bits in wages, all told
    history: [],
  };
  sim.state.mercs.byId[g.id] = g;
  sim.state.mercs.order.push(g.id);
  r.merc = g.id;
  return g;
}

function outfit(sim, g, rng) {
  const cfg = sim.data.mercs.startGear;
  equip(sim, g, newItem(sim, rng.pick(cfg.weapons), { at: g.home, rng }));
  if (rng.chance(cfg.armour)) equip(sim, g, newItem(sim, rng.chance(0.25) ? 'mail' : 'gambeson', { at: g.home, rng }));
  if (rng.chance(cfg.shield)) equip(sim, g, newItem(sim, 'shield', { at: g.home, rng }));
  if (rng.chance(cfg.charm)) equip(sim, g, newItem(sim, 'charm', { at: g.home, rng }));
}

function note(g, t, what) {
  g.history.push({ t, ...what });
  if (g.history.length > 24) g.history.shift();
}

// An idle labourer takes up the sword, while the region has fewer sellswords than it supports.
function recruit(sim) {
  const cfg = sim.data.mercs;
  if (activeMercs(sim).length >= cfg.target) return;
  const rng = sim.rng('mercs');
  if (!rng.chance(cfg.recruitChance)) return;
  const ix = economyIndex(sim.data);
  const pool = [];
  for (const sid of ix.markets) for (const r of residentsAt(sim, sid)) if (r.profession === 'labourer') pool.push(r);
  if (!pool.length) return;
  const r = rng.pick(pool);
  r.profession = 'sellsword';
  r.learning = false;
  const g = newMerc(sim, rng, r, r.home);
  // They bring what they have: an old spear or a cudgel.
  equip(sim, g, newItem(sim, rng.chance(0.5) ? 'spear' : 'club', { at: r.home, rng }));
  refreshNeeds(sim, r.home);
  sim.log('merc:recruit', { who: g.id, at: r.home });
}

function heal(sim, g) {
  if (g.wound && sim.now >= g.wound.until) g.wound = null;
}

// Odd jobs and bed and board while they wait; the rich live well; the long-broke give up the sword.
function live(sim, g) {
  const cfg = sim.data.mercs;
  const acct = mercAccount(g);
  const upkeep = toBits(sim, cfg.upkeep);
  transfer(sim, `till:${g.at}`, acct, toBits(sim, cfg.oddJobs));
  const paid = transfer(sim, acct, `purse:${g.at}`, upkeep);
  g.brokeDays = paid < upkeep ? g.brokeDays + 1 : 0;
  const spare = balance(sim, acct) - toBits(sim, cfg.spendAbove);
  if (spare > 0) transfer(sim, acct, `purse:${g.at}`, spare / 10);
  if (g.brokeDays > cfg.retire.brokeDays) return retire(sim, g, 'broke');
  if (g.deeds >= cfg.retire.deeds && balance(sim, acct) >= toBits(sim, cfg.spendAbove) && g.wound?.severe) retire(sim, g, 'old wounds');
}

function retire(sim, g, why) {
  const r = getResident(sim, g.resident);
  g.active = false;
  g.retired = sim.now;
  // Their gear goes on the rack where they hang it up; the purse goes home with them.
  for (const item of gearOf(sim, g)) toRack(sim, item, g.at ?? g.home);
  g.gear = { weapon: null, armour: null, shield: null, charm: null };
  transfer(sim, mercAccount(g), `purse:${g.home}`, balance(sim, mercAccount(g)));
  if (r) {
    r.profession = 'labourer';
    r.merc = null;
    refreshNeeds(sim, r.home);
  }
  sim.log('merc:retired', { who: g.id, at: g.at ?? g.home, why, rank: g.rank });
}

// Away from home and nobody hiring: walk back.
function waitForWork(sim, g) {
  const cfg = sim.data.mercs;
  g.idleDays += 1;
  if (g.at !== g.home && g.idleDays >= cfg.awayDays) {
    g.walking = true;
    g.at = null;
    sim.schedule(sim.now + cfg.walkHomeDays * DAY, 'merc:home', { id: g.id });
  }
}

function onHome(sim, { id }) {
  const g = getMerc(sim, id);
  if (!g?.walking) return;
  g.walking = false;
  g.at = g.home;
  g.idleDays = 0;
}

/** A sellsword falls. Their gear goes to `taker` (a band, or 'wagon' to be carried to town). */
function fall(sim, g, rec) {
  const r = getResident(sim, g.resident);
  g.active = false;
  g.died = sim.now;
  if (r) {
    r.alive = false;
    r.diedAt = sim.now;
    r.cause = 'fight';
    refreshNeeds(sim, r.home);
  }
  // Their purse goes to their family.
  transfer(sim, mercAccount(g), `purse:${g.home}`, balance(sim, mercAccount(g)));
  sim.state.mercs.fallen += 1;
  rec.guardsDead.push(g.id);
}

// ── Gear ────────────────────────────────────────────────────────────────────

function newItem(sim, type, { at = null, rng = null, maker = null } = {}) {
  const cfg = sim.data.mercs;
  const def = cfg.gear[type];
  const item = {
    id: sim.nextId('i'),
    type,
    slot: def.slot,
    made: sim.now,
    madeAt: at,
    maker,
    holder: { kind: 'lost' },
    cond: 1,
    xp: 0,
    tier: 0,
    name: null,
    deeds: { fights: 0, won: 0, kills: 0, turned: 0, nights: 0, deaths: 0, luck: 0 },
    owners: [], // resident ids, in order
    roads: {}, // fights by route
    statuses: [],
  };
  if (type === 'charm') {
    const r = rng ?? sim.rng('mercs');
    item.charm = r.pick(cfg.charms);
    item.repute = 0; // what people believe it does: −1 cursed … +1 blessed
    item.relic = r.chance(cfg.relicChance); // what it really does (only the lab sees)
  }
  sim.state.mercs.items[item.id] = item;
  return item;
}

function equip(sim, g, item) {
  const old = g.gear[item.slot];
  g.gear[item.slot] = item.id;
  item.holder = { kind: 'merc', id: g.id };
  const r = g.resident;
  if (item.owners[item.owners.length - 1] !== r) item.owners.push(r);
  return old ? itemById(sim, old) : null;
}

function toRack(sim, item, sid) {
  const racks = sim.state.mercs.racks;
  (racks[sid] ??= []).push(item.id);
  item.holder = { kind: 'rack', at: sid };
}

function offRack(sim, item) {
  const sid = item.holder.at;
  sim.state.mercs.racks[sid] = sim.state.mercs.racks[sid].filter((x) => x !== item.id);
}

/** What a piece adds to its bearer's strength (and the parts, for the report). */
export function itemPower(sim, item, ctx = {}) {
  const def = sim.data.mercs.gear[item.type];
  if (item.type === 'charm') return charmPower(sim, item);
  let p = def.power * (0.5 + 0.5 * item.cond) + tierOf(sim, item).bonus;
  if (ctx.terrain && def.terrain?.[ctx.terrain]) p += def.terrain[ctx.terrain];
  if (def.open && (ctx.terrain === 'road' || ctx.terrain === 'hills')) p += def.open;
  if (def.dark && ctx.night) p += def.dark;
  return p;
}

// A charm steadies its wearer as far as its name goes; a true relic does more.
function charmPower(sim, item) {
  const c = sim.data.mercs.charm;
  return item.repute * c.repute + (item.relic ? c.relic : 0);
}

/** New gear, made to order: the goods it takes at this market's prices, with the smith's markup and labour. */
export function priceNew(sim, sid, type) {
  const cfg = sim.data.mercs;
  const def = cfg.gear[type];
  if (!def.make) return def.value ?? null;
  let marks = def.labour ?? 0;
  for (const [gid, qty] of Object.entries(def.make)) marks += quote(sim, sid, gid).price * qty * cfg.markup;
  return round2(marks);
}

function priceUsed(sim, sid, item) {
  const base = priceNew(sim, sid, item.type) ?? 20;
  return round2(base * sim.data.mercs.resale * (0.5 + 0.5 * item.cond) * (1 + 4 * tierOf(sim, item).bonus));
}

function canMake(sim, sid, type) {
  const def = sim.data.mercs.gear[type];
  if (!def.make) return false;
  const markets = sim.state.economy.markets[sid];
  return Object.entries(def.make).every(([gid, qty]) => (markets[gid]?.stock ?? 0) >= qty + 1);
}

// Idle in a town: mend what's worn, and buy better gear when the purse allows,
// new from the smith or second-hand off the rack. One purchase a day.
function shop(sim, g) {
  const sid = g.at;
  if (!sid || !sim.state.economy.markets[sid]) return;
  const cfg = sim.data.mercs;
  const acct = mercAccount(g);
  const keep = toBits(sim, 6);
  const till = traderAccount(sim, sid);
  // Mending.
  for (const item of gearOf(sim, g)) {
    if (item.cond >= 0.7 || !cfg.gear[item.type].wear) continue;
    const cost = toBits(sim, (priceNew(sim, sid, item.type) ?? 20) * 0.3 * (1 - item.cond));
    if (balance(sim, acct) - cost < keep) continue;
    transfer(sim, acct, till, cost);
    item.cond = 1;
  }
  // The best upgrade for the money: most added strength per mark.
  let best = null;
  const have = (slot) => (g.gear[slot] ? itemPower(sim, itemById(sim, g.gear[slot])) : 0);
  for (const [type, def] of Object.entries(cfg.gear)) {
    if (def.slot === 'charm' || !canMake(sim, sid, type)) continue;
    const price = priceNew(sim, sid, type);
    const gain = def.power * (type === g.favours ? 1.3 : 1) - have(def.slot);
    // Worth: added strength against the square root of the price (better gear is worth saving for).
    if (gain > 0.04 && toBits(sim, price) + keep <= balance(sim, acct) && (!best || gain / Math.sqrt(price) > best.value)) best = { type, price, gain, value: gain / Math.sqrt(price) };
  }
  for (const id of sim.state.mercs.racks[sid] ?? []) {
    const item = itemById(sim, id);
    const price = priceUsed(sim, sid, item);
    const gain = itemPower(sim, item) - have(item.slot);
    if (item.slot === 'charm') {
      // A charm is bought for its name: only one said to be lucky, by someone without one.
      if (g.gear.charm || item.repute <= 0.1) continue;
    } else if (gain <= 0.04) continue;
    const value = (gain || 0.05) / Math.sqrt(Math.max(price, 0.5));
    if (toBits(sim, price) + keep <= balance(sim, acct) && (!best || value > best.value)) best = { item, price, gain, value };
  }
  if (!best) return;
  const bits = transfer(sim, acct, till, toBits(sim, best.price));
  let item = best.item;
  if (item) offRack(sim, item);
  else {
    for (const [gid, qty] of Object.entries(cfg.gear[best.type].make)) useUp(sim, sid, gid, qty);
    const smith = residentsAt(sim, sid).find((r) => r.profession === 'smith');
    item = newItem(sim, best.type, { at: sid, maker: smith?.id ?? null });
  }
  const old = equip(sim, g, item);
  if (old) {
    // The old piece goes to the traders for what they'll give.
    const back = transfer(sim, till, acct, toBits(sim, priceUsed(sim, sid, old) * 0.5));
    toRack(sim, old, sid);
    note(g, sim.now, { type: 'sold', item: old.id, bits: back });
  }
  note(g, sim.now, { type: 'bought', item: item.id, bits });
  if (item.name || item.tier > 0) sim.log('merc:bought', { who: g.id, at: sid, item: item.id });
}

// ── Hiring ──────────────────────────────────────────────────────────────────

/** Sellswords free to hire in a town: there, not hurt, not already hired. */
export function forHire(sim, sid) {
  return activeMercs(sim).filter((g) => g.at === sid && !g.trip && !g.walking && !g.wound);
}

/** How much sellswords for hire in a town steady a merchant's nerve: a factor on their caution. */
export function guardedCaution(sim, sid) {
  const cfg = sim.data.mercs?.hire;
  if (!cfg) return 1;
  const cover = Math.min(cfg.max, forHire(sim, sid).length);
  return 1 / (1 + cfg.nerve * cover);
}

/**
 * A merchant setting out hires guards for the danger they believe is on the road:
 * more for more exposure and more wagons, more if timid, fewer if the purse is thin.
 * The best strength for the wage first. Returns the guards' ids.
 */
export function hireGuards(sim, m, { exposure, days, wagons, caution, account, tripNo, from }) {
  const cfg = sim.data.mercs?.hire;
  if (!cfg || exposure < cfg.minExposure) return [];
  const want = Math.min(cfg.max, Math.round(wagons * exposure * cfg.perExposure * (0.6 + caution)));
  if (want <= 0) return [];
  let budget = balance(sim, account) * cfg.maxWageShare;
  const pool = forHire(sim, from)
    .map((g) => ({ g, value: guardPower(sim, g, {}).power / wageOf(sim, g) }))
    .sort((a, b) => b.value - a.value || (a.g.id < b.g.id ? -1 : 1));
  const hired = [];
  for (const { g } of pool) {
    if (hired.length >= want) break;
    const cost = toBits(sim, wageOf(sim, g) * Math.max(1, Math.ceil(days)));
    if (cost > budget) continue;
    budget -= cost;
    g.trip = { merchant: m.id, tripNo, from };
    g.at = null;
    g.idleDays = 0;
    g.ledger.hires += 1;
    hired.push(g.id);
  }
  return hired;
}

export const guardsOf = (sim, trip) => (trip?.guards ?? []).map((id) => getMerc(sim, id)).filter((g) => g?.active);

/** Wages for the trip, paid where it ends. Returns bits paid. */
export function payGuards(sim, trip, days, payer) {
  let total = 0;
  for (const g of guardsOf(sim, trip)) {
    const bits = transfer(sim, payer, mercAccount(g), toBits(sim, wageOf(sim, g) * days));
    g.earned += bits;
    total += bits;
  }
  return total;
}

/** The trip is over: the guards are free where it ended (or wherever they ran back to). */
export function releaseGuards(sim, trip, at) {
  for (const g of guardsOf(sim, trip)) {
    g.trip = null;
    g.at = at;
    g.idleDays = 0;
  }
  // What came back on the wagons (a fallen guard's gear, arms taken from outlaws) goes on the rack.
  for (const id of trip.salvage ?? []) {
    const item = itemById(sim, id);
    toRack(sim, item, at);
    if (item.name) sim.log('item:recovered', { item: item.id, at });
  }
  trip.salvage = [];
  trip.guards = [];
}

/** A leg done: the road goes into every guard's ledger (and trains them a little, if it was a wild one). */
export function guardsOnRoad(sim, trip, segId) {
  const seg = sim.graph.segments.get(segId);
  const grow = sim.data.mercs.deeds.grow.road;
  for (const g of guardsOf(sim, trip)) {
    g.ledger.km[seg.terrain] = round2((g.ledger.km[seg.terrain] ?? 0) + seg.km);
    if (seg.danger >= 0.1) for (const [s, v] of Object.entries(grow)) g.growth[s] = round3(g.growth[s] + (v * seg.km) / 40);
    checkTraits(sim, g);
  }
}

// ── Fighting ────────────────────────────────────────────────────────────────

/**
 * One guard's strength in a fight, and why. `ctx`: { terrain, night, surprised, others }.
 * An unarmed carter counts 1; a green sellsword with a spear and a quilted coat about 1.5;
 * a Veteran in mail with a storied sword about 3.
 */
export function guardPower(sim, g, ctx) {
  const cfg = sim.data.mercs;
  const P = cfg.power;
  const T = cfg.traits;
  const s = g.stats;
  const parts = [];
  const armour = g.gear.armour ? itemById(sim, g.gear.armour) : null;
  const agiCost = armour ? cfg.gear[armour.type].agi ?? 0 : 0;
  let p = P.base + P.perStat.str * (s.str - 3) + P.perStat.agi * (s.agi - 3) + P.perStat.dis * (s.dis - 3) + agiCost;
  for (const slot of ['weapon', 'armour', 'shield']) {
    if (!g.gear[slot]) continue;
    const item = itemById(sim, g.gear[slot]);
    const add = itemPower(sim, item, ctx);
    p += add;
    if (item.name || item.tier >= 2) parts.push({ k: 'item', item: item.id, v: round2(add) });
  }
  let mult = (1 + P.nerve * (s.nerve - 3)) * (1 + P.rank * g.rank);
  if (g.gear.charm) {
    const charm = itemById(sim, g.gear.charm);
    const c = charmPower(sim, charm);
    mult *= 1 + c;
    if (charm.repute >= 0.2 || charm.repute <= -0.2) parts.push({ k: 'charm', item: charm.id, v: round2(c) });
  }
  if (ctx.night) {
    if (hasTrait(g, 'night')) {
      mult *= P.night + T.night.power;
      parts.push({ k: 'trait', trait: 'night' });
    } else mult *= P.night;
  }
  for (const t of ['forestwise', 'hillwise', 'fenwise']) {
    if (hasTrait(g, t) && T[t].terrain === ctx.terrain) {
      mult *= 1 + T[t].power;
      parts.push({ k: 'trait', trait: t });
    }
  }
  if (hasTrait(g, 'bandits')) mult *= 1 + T.bandits.power;
  if (hasTrait(g, 'scarred')) mult *= 1 + T.scarred.power;
  if (ctx.others && g.pairs.some((id) => ctx.others.includes(id))) {
    mult *= 1 + T.pair.power;
    parts.push({ k: 'trait', trait: 'pair' });
  }
  if (ctx.surprised && !hasTrait(g, 'ambush')) mult *= cfg.surprise;
  else if (ctx.surprised) parts.push({ k: 'trait', trait: 'ambush' });
  if (g.wound) mult *= P.wounded;
  return { power: round3(Math.max(0.3, p * mult)), parts };
}

/** Does anyone see the ambush coming? The keenest-eyed guard's chance, from awareness, terrain sense and a bow. */
export function spotAmbush(sim, guards, terrain, rng) {
  const cfg = sim.data.mercs;
  for (const g of guards) {
    let chance = cfg.spotAmbush * g.stats.awa;
    for (const t of ['forestwise', 'hillwise', 'fenwise']) if (hasTrait(g, t) && cfg.traits[t].terrain === terrain) chance += cfg.traits[t].spot;
    const weapon = g.gear.weapon ? itemById(sim, g.gear.weapon) : null;
    if (weapon) chance += cfg.gear[weapon.type].spot ?? 0;
    if (rng.chance(chance)) return g;
  }
  return null;
}

/**
 * The guards' part in an encounter, before the band chooses: strength seen (what
 * the lookouts reckon), strength if taken by surprise, and the notable factors.
 */
export function guardsInFight(sim, guards, { terrain, night }) {
  const ids = guards.map((g) => g.id);
  let seen = 0;
  let surprised = 0;
  const factors = [];
  for (const g of guards) {
    const others = ids.filter((x) => x !== g.id);
    const a = guardPower(sim, g, { terrain, night, others });
    const b = guardPower(sim, g, { terrain, night, others, surprised: true });
    seen += a.power;
    surprised += b.power;
    for (const part of b.parts) factors.push({ ...part, who: g.id });
  }
  return { seen: round2(seen), surprised: round2(surprised), factors };
}

/** Outlaws' gear: one piece per member counts, at part strength. */
export function bandGearPower(sim, band) {
  const items = (band.gear ?? []).map((id) => itemById(sim, id)).filter(Boolean);
  items.sort((a, b) => itemPower(sim, b) - itemPower(sim, a) || (a.id < b.id ? -1 : 1));
  let p = 0;
  for (const item of items.slice(0, band.members.length)) p += itemPower(sim, item) * sim.data.mercs.bandGear;
  return round2(p);
}

/**
 * A blow falls on a guard (the band won, or a hand was to die and a guard stood in front).
 * Armour may turn it; otherwise a wound, or death. Returns true if a guard took it.
 */
export function guardTakesBlow(sim, band, v, rec, rng) {
  const cfg = sim.data.mercs.harm;
  const guards = guardsOf(sim, v.trip);
  if (!guards.length || !rng.chance(cfg.frontLine)) return false;
  const g = rng.pick(guards);
  strike(sim, g, rec, rng, 1);
  return true;
}

// `weight` 1: a killing blow aimed at them; less: the ordinary knocks of a lost fight.
function strike(sim, g, rec, rng, weight) {
  const cfg = sim.data.mercs;
  const armour = g.gear.armour ? itemById(sim, g.gear.armour) : null;
  const shield = g.gear.shield ? itemById(sim, g.gear.shield) : null;
  const charm = g.gear.charm ? itemById(sim, g.gear.charm) : null;
  const turn = (armour ? cfg.gear[armour.type].guard * (0.5 + 0.5 * armour.cond) : 0) + (shield ? cfg.gear.shield.guard : 0);
  let death = (weight >= 1 ? 0.45 : cfg.harm.death) * (1 - Math.min(0.85, turn));
  if (hasTrait(g, 'scarred')) death *= cfg.traits.scarred.death;
  if (charm?.relic) death *= 0.5; // the one thing a true relic does that no one can prove
  const roll = rng.float();
  if (roll < death) {
    rec.guardHarm.push({ who: g.id, fate: 'died' });
    charmBlamed(sim, g, true);
    for (const item of gearOf(sim, g)) item.deeds.deaths += 1;
    fall(sim, g, rec);
    return 'died';
  }
  if (roll < death + (weight >= 1 ? 0.5 : cfg.harm.wound) * (1 - 0.5 * Math.min(0.85, turn))) {
    const severe = rng.chance(cfg.harm.severe);
    g.wound = { severe, until: sim.now + (severe ? cfg.harm.severeDays : cfg.harm.lightDays) * DAY };
    g.ledger.wounds += 1;
    if (severe) {
      g.ledger.severe += 1;
      charmBlamed(sim, g, false);
    }
    rec.guardHarm.push({ who: g.id, fate: severe ? 'badly hurt' : 'hurt' });
    return 'wounded';
  }
  if (armour) armour.deeds.turned += 1;
  return 'turned';
}

/**
 * After an encounter with guards present: the knocks of a lost fight, kills in a
 * won one, the fallen's gear, and every survivor's ledger, rank and traits; and
 * what each piece of gear lived through.
 */
export function afterEncounter(sim, band, v, rec, ctx) {
  const cfg = sim.data.mercs;
  const rng = sim.rng('raids');
  const guards = guardsOf(sim, v.trip);
  const fought = rec.roll !== null;
  const won = rec.outcome === 'fought off';
  const lost = fought && !won;
  const ambushed = fought && ctx.surprised;
  // A lost fight: everyone takes knocks.
  if (lost) for (const g of guardsOf(sim, v.trip)) if (rng.chance(cfg.harm.wound)) strike(sim, g, rec, rng, 0.5);
  // What the dead leave: to the band if it won, back on the wagons if not.
  for (const id of rec.guardsDead) {
    const g = getMerc(sim, id);
    for (const item of gearOf(sim, g)) {
      if (lost || !v.trip) giveBand(sim, band, item, g);
      else salvage(v.trip, item);
    }
    g.gear = { weapon: null, armour: null, shield: null, charm: null };
    if (v.trip) v.trip.guards = v.trip.guards.filter((x) => x !== id);
  }
  const alive = guardsOf(sim, v.trip).filter((g) => guards.includes(g));
  const kills = {};
  for (const id of rec.killers ?? []) kills[id] = 1;
  const D = cfg.deeds;
  for (const g of alive) {
    const L = g.ledger;
    L.encounters += 1;
    const others = alive.filter((o) => o !== g).map((o) => o.id);
    const grow = [];
    let points = D.passive;
    if (fought) {
      L.fights += 1;
      L.fightsIn[ctx.terrain] = (L.fightsIn[ctx.terrain] ?? 0) + 1;
      for (const o of others) L.with[o] = (L.with[o] ?? 0) + 1;
      grow.push('fought');
      if (ctx.night) {
        L.nights += 1;
        grow.push('night');
      }
      if (ambushed) {
        L.ambushes += 1;
        grow.push('ambushed');
      }
      if (won) {
        L.won += 1;
        points = D.won;
        grow.push('won');
      } else {
        L.lost += 1;
        points = D.lost;
        grow.push('lost');
      }
      if (others.length) grow.push('held');
    } else if (rec.response === 'paid') {
      L.paid += 1;
      grow.push('paid');
    }
    if (ctx.spotted === g.id) {
      L.spotted += 1;
      grow.push('spotted');
    }
    if (kills[g.id]) {
      L.kills += 1;
      points += D.kill;
    }
    const hurt = rec.guardHarm.find((h) => h.who === g.id);
    if (hurt) {
      points += D.wounded;
      grow.push('wounded');
    }
    for (const key of grow) for (const [s, v2] of Object.entries(D.grow[key])) g.growth[s] = round3(g.growth[s] + v2);
    g.deeds = round2(g.deeds + points);
    note(g, sim.now, { type: 'encounter', seg: rec.seg, band: band.id, outcome: rec.outcome, fought, kills: kills[g.id] ?? 0, hurt: hurt?.fate ?? null });
    // Their gear lives through it too.
    if (fought) {
      for (const item of gearOf(sim, g)) {
        const def = cfg.gear[item.type];
        if (def.wear) item.cond = round3(Math.max(0.1, item.cond - def.wear * (lost ? 2 : 1)));
        itemDeed(sim, item, { won, kill: item.slot === 'weapon' ? kills[g.id] ?? 0 : 0, night: ctx.night, route: routeOf(sim, rec.seg), survivedLoss: lost });
      }
    }
    rankUp(sim, g);
    checkTraits(sim, g);
  }
  rec.guardKills = Object.keys(kills).length;
  // The band's own gear was in the fight too.
  if (fought) {
    for (const id of band.gear ?? []) itemDeed(sim, itemById(sim, id), { won: !won, kill: rec.guardsDead.length || rec.hands.length ? 1 : 0, night: ctx.night, route: routeOf(sim, rec.seg), owner: false });
  }
  return kills;
}

/** A band sized them up and let them by: a small deed, and it sharpens the eye. */
export function staredDown(sim, band, trip) {
  const D = sim.data.mercs.deeds;
  for (const g of guardsOf(sim, trip)) {
    g.ledger.stared = (g.ledger.stared ?? 0) + 1;
    g.deeds = round2(g.deeds + D.stared);
    for (const [s, v] of Object.entries(D.grow.stared)) g.growth[s] = round3(g.growth[s] + v);
    rankUp(sim, g);
  }
}

/** A won fight: which guards cut an outlaw down (at most two; the crew account for the rest). */
export function rollKillers(sim, guards, rec, rng) {
  const cfg = sim.data.mercs;
  const ctx = { terrain: sim.graph.segments.get(rec.seg).terrain, night: rec.night };
  const out = [];
  for (const g of guards) {
    if (out.length >= 2) break;
    const weapon = g.gear.weapon ? itemById(sim, g.gear.weapon) : null;
    if (rng.chance(cfg.killChance + (weapon ? itemPower(sim, weapon, ctx) * 0.5 : 0))) out.push(g.id);
  }
  return out;
}

/** Outlaws fell: what they carried goes back on the wagons. */
export function outlawsDropGear(sim, band, v, n, rng) {
  if (!v.trip) return;
  for (let i = 0; i < n && (band.gear ?? []).length; i++) {
    if (!rng.chance(band.gear.length / Math.max(1, band.members.length + n))) continue;
    const id = band.gear.pop();
    salvage(v.trip, itemById(sim, id));
  }
}

function salvage(trip, item) {
  (trip.salvage ??= []).push(item.id);
  item.holder = { kind: 'wagon' };
}

function giveBand(sim, band, item, from) {
  if (!band.active || item.cond < 0.2) {
    item.holder = { kind: 'lost' };
    return;
  }
  (band.gear ??= []).push(item.id);
  item.holder = { kind: 'band', id: band.id };
  if (!item.statuses.includes('taken')) item.statuses.push('taken');
  if (item.name || item.tier >= 1) sim.log('item:taken', { item: item.id, band: band.id, from: from.id });
}

/** A band broke up: its gear goes home with its people (onto the rack of the town nearest). */
export function scatterBandGear(sim, band, sid) {
  for (const id of band.gear ?? []) {
    const item = itemById(sim, id);
    if (sid) toRack(sim, item, sid);
    else item.holder = { kind: 'lost' };
  }
  band.gear = [];
}

const routeOf = (sim, segId) => sim.graph.segments.get(segId)?.route ?? null;

// ── What gear lives through ─────────────────────────────────────────────────

function itemDeed(sim, item, { won, kill = 0, night, route, survivedLoss = false }) {
  if (!item) return;
  const cfg = sim.data.mercs.item;
  item.deeds.fights += 1;
  if (won) item.deeds.won += 1;
  if (night) item.deeds.nights += 1;
  item.deeds.kills += kill;
  if (route) item.roads[route] = (item.roads[route] ?? 0) + 1;
  let xp = cfg.fight + (won ? cfg.won : 0) + kill * cfg.kill;
  if (survivedLoss) {
    item.deeds.luck += 1;
    xp += cfg.survived;
  }
  if (item.type === 'charm') return charmDeed(sim, item, { survivedLoss, won });
  // Armour that turned blows: counted as they happen (strike()); the xp for them lands here.
  const turned = item.deeds.turned - (item.turnedCounted ?? 0);
  item.turnedCounted = item.deeds.turned;
  xp += turned * cfg.turned;
  item.xp = round2(item.xp + xp);
  statuses(item);
  const tiers = cfg.tiers;
  while (item.tier + 1 < tiers.length) {
    const next = tiers[item.tier + 1];
    if (item.xp < next.xp || (next.owners && item.owners.length < next.owners)) break;
    item.tier += 1;
    if (item.tier >= cfg.nameAt && !item.name) item.name = nameItem(sim, item);
    sim.log('item:tier', { item: item.id, tier: item.tier, holder: item.holder });
  }
}

// A charm's name follows its wearers' luck: it steadies the next one, or shakes them.
function charmDeed(sim, item, { survivedLoss, won }) {
  const c = sim.data.mercs.charm;
  if (survivedLoss) item.repute += c.lucky * (item.relic ? 1.5 : 1);
  else if (won) item.repute += c.lucky * 0.3;
  item.repute = round3(clamp(item.repute, -1, 1));
  statuses(item);
}

function statuses(item) {
  const add = (s) => !item.statuses.includes(s) && item.statuses.push(s);
  const drop = (s) => (item.statuses = item.statuses.filter((x) => x !== s));
  if (item.deeds.kills >= 1) add('blooded');
  if (item.deeds.luck >= 2 || (item.repute ?? 0) >= 0.3) add('lucky');
  if (item.deeds.deaths >= 2 || (item.repute ?? 0) <= -0.3) {
    add('ill-omened');
    drop('lucky');
  }
}

// "the Blackpine Thorn", "Widow's Edge", "Lucky Quilt": from where it saw most, or its luck.
function nameItem(sim, item) {
  const cfg = sim.data.mercs;
  const rng = sim.rng('mercs.names');
  const noun = rng.pick(cfg.gear[item.type].noun ?? ['Piece']);
  if (item.statuses.includes('ill-omened')) return `Widow's ${noun}`;
  if (item.statuses.includes('lucky') && rng.chance(0.5)) return `Lucky ${noun}`;
  const road = Object.entries(item.roads).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
  const place = cfg.item.places[road];
  return place ? `the ${place} ${noun}` : `the Old ${noun}`;
}

/** A charm's wearer fell or was badly hurt: its name suffers. */
function charmBlamed(sim, g, severe) {
  if (!g.gear.charm) return;
  const item = itemById(sim, g.gear.charm);
  item.repute = round3(clamp(item.repute - (severe ? sim.data.mercs.charm.ill : sim.data.mercs.charm.ill / 3), -1, 1));
  statuses(item);
}

// ── Growth ──────────────────────────────────────────────────────────────────

// Enough deeds for the next rank: the stat their deeds trained most goes up a point.
function rankUp(sim, g) {
  const cfg = sim.data.mercs;
  while (g.rank + 1 < cfg.ranks.length && g.deeds >= cfg.ranks[g.rank + 1].deeds) {
    g.rank += 1;
    const stat = cfg.stats
      .filter((s) => g.stats[s] < cfg.maxStat)
      .sort((a, b) => g.growth[b] - g.growth[a] || cfg.stats.indexOf(a) - cfg.stats.indexOf(b))[0];
    if (stat) {
      g.stats[stat] += 1;
      g.growth[stat] = 0;
    }
    note(g, sim.now, { type: 'rank', rank: g.rank, stat });
    sim.log('merc:rank', { who: g.id, rank: g.rank, stat: stat ?? null });
  }
}

function checkTraits(sim, g) {
  const T = sim.data.mercs.traits;
  const L = g.ledger;
  const gain = (t, extra = {}) => {
    if (g.traits.includes(t)) return;
    g.traits.push(t);
    note(g, sim.now, { type: 'trait', trait: t, ...extra });
    sim.log('merc:trait', { who: g.id, trait: t, ...extra });
  };
  for (const t of ['forestwise', 'hillwise', 'fenwise']) {
    const d = T[t];
    if ((L.fightsIn[d.terrain] ?? 0) >= d.fights || ((L.km[d.terrain] ?? 0) >= d.km && (L.fightsIn[d.terrain] ?? 0) >= 1)) gain(t);
  }
  if (L.ambushes >= T.ambush.ambushes) gain('ambush');
  if (L.nights >= T.night.nights) gain('night');
  if (L.encounters >= T.bandits.encounters) gain('bandits');
  if (L.severe >= T.scarred.severe) gain('scarred');
  for (const [other, n] of Object.entries(L.with)) {
    if (n < T.pair.fights || g.pairs.includes(other)) continue;
    const o = getMerc(sim, other);
    if (!o?.active) continue;
    g.pairs.push(other);
    if (!o.pairs.includes(g.id)) o.pairs.push(g.id);
    if (!g.traits.includes('pair')) g.traits.push('pair');
    if (!o.traits.includes('pair')) o.traits.push('pair');
    note(g, sim.now, { type: 'trait', trait: 'pair', with: other });
    note(o, sim.now, { type: 'trait', trait: 'pair', with: g.id });
    sim.log('merc:pair', { who: g.id, with: other });
  }
}
