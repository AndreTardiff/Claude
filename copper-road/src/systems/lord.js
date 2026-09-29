// Lord Aldric: the region's lord as an engaged character (spec §15.2).
//
// He has a temperament (fixed traits drawn at the start) and moods that move
// with the state of his lands: worry when towns go hungry, pride when all is
// well and the treasury full, grievance when the Crown takes its due. Every few
// days he weighs what to do with whatever the treasury holds beyond its reserve:
//
//   relief       a standing order: the treasury pays a good price for grain
//                delivered to a hungry town. Merchants hear of it at the inns.
//   commission   he buys a glutted craft's goods for his household and garrison
//                (liveries, tools), which keeps its workers busy
//   festival     food and drink for a town, and pay for its musicians, brewers
//                and cooks; a feasting town grows faster for a while
//   works        paid labour, timber and tools over days, leaving something
//                lasting: a granary, new fields, new houses, a workshop
//   patrol       guards ride a road his seat has heard is dangerous (step E);
//                bands see them and move off, or get run down
//   trip         he rides out himself: a tour, a hunt, the ships, or a ride with
//                a patrol (step F, progress.js)
//
// He judges by what he has heard (step F): the post's letters and the talk at
// the inn where he is, kept as his own knowledge ('lord'), not the truth. News
// from a town that is old or worrying is a reason to go and see.
// Spending brings the treasury down, so the Mint strikes again and buys ore.
// A fat treasury also tempts his steward, who skims a little and buries it.
// Every choice keeps its reasons (the options, their scores, his mood).
//
// Coin moves only by transfer, goods only by load/unload/useUp.

import { economyIndex, purchaseCost, quote } from '../economy/pricing.js';
import { round3, unload, useUp } from '../economy/market.js';
import { balance, toBits, toMarks, transfer } from '../economy/money.js';
import { residentsAt } from '../economy/people.js';
import { improve, improvementsOf, landOf, storageOf } from '../world/improvements.js';
import { refreshNeeds } from './economy.js';
import { belief, believedDanger, swapNews } from './knowledge.js';
import { hireGuards, payGuards, releaseGuards } from './mercs.js';
import { LORD, atHome, believedHunger, heldForRansom, hurt, progressHandlers, setOut, travelOptions, whileAway } from './progress.js';

const DAY = 1440;
const round2 = (x) => Math.round(x * 100) / 100;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const lord = {
  id: 'lord',

  init(sim) {
    const cfg = sim.data.lord;
    if (!cfg) return;
    const rng = sim.rng('lord.init');
    const traits = {};
    for (const [k, [lo, hi]] of Object.entries(cfg.traits)) traits[k] = rng.int(lo, hi);
    sim.state.lord = {
      name: cfg.name,
      seat: cfg.seat,
      traits, // permille
      mood: { worry: 0, pride: 0, grievance: 0 }, // 0–1
      orders: [],
      projects: [],
      patrols: [], // { route, segs, guards, until }
      nextDecision: sim.cal.day(sim.now) + cfg.decideEvery,
      reason: null,
      spent: { relief: 0, commission: 0, festival: 0, works: 0, patrol: 0 },
      skimmed: 0,
      skimmedSeason: 0,
      done: [], // finished works, for the inspector
      saving: null, // { work, at, since } while he puts coin aside for works
      crownSeen: 0,
      at: cfg.seat, // where he is (null on the road)
      away: null, // a trip in hand (progress.js)
      trip: null,
      tripNo: 0,
      lastTrip: sim.now,
      captive: null,
      hurtUntil: 0,
      bounty: null, // { band, perHead, until, paid, heads }
      grudge: null, // the band that last crossed him
      decideNow: false,
      tripReason: null,
    };
    sim.state.lord.mood.anger = 0;
  },

  daily(sim) {
    const st = sim.state.lord;
    if (!st) return;
    // What he hears where he is (the inn, or his own eyes).
    if (st.at && sim.state.knowledge) swapNews(sim, LORD, st.at, { look: Boolean(sim.state.economy.markets[st.at]) });
    updateMood(sim);
    runOrders(sim);
    runProjects(sim);
    runPatrols(sim);
    whileAway(sim, buyForLord);
    heldForRansom(sim);
    steward(sim);
    const day = sim.cal.day(sim.now);
    if (st.captive || hurt(sim, st)) return; // held by outlaws, or abed with a hunting fall: nothing is decided
    if (day >= st.nextDecision || st.decideNow) {
      st.decideNow = false;
      decide(sim);
      st.nextDecision = day + sim.data.lord.decideEvery;
    }
  },

  handlers: progressHandlers,

  seasonal(sim) {
    const st = sim.state.lord;
    if (!st) return;
    // The Crown's due rankles (the lord runs after coin, so this season's is already paid).
    const crown = sim.state.coin?.flows.crown ?? 0;
    if (crown > (st.crownSeen ?? 0)) st.mood.grievance = round3(clamp01(st.mood.grievance + 0.15));
    st.crownSeen = crown;
    if (st.skimmedSeason >= toBits(sim, sim.data.lord.steward.noticeAbove)) {
      sim.log('lord:skimmed', { bits: st.skimmedSeason });
    }
    st.skimmedSeason = 0;
  },
};

export const getLord = (sim) => sim.state.lord;

// A market as he has heard of it: price, stock, and how glutted (the price against its worth).
function heardQuote(sim, sid, gid) {
  const b = belief(sim, LORD, sid, gid);
  if (!b) return null;
  const q = quote(sim, sid, gid); // only its fixed worth and local factor
  return { price: b.price, stock: b.stock, factor: b.price / (q.base * q.local), ageDays: b.ageDays };
}
const heads = (sim, sid) => residentsAt(sim, sid).length;
const towns = (sim) => {
  const ix = economyIndex(sim.data);
  return ix.markets.filter((sid) => !ix.isOutside(sid));
};

/**
 * What the lord can spend (marks): whatever the treasury holds beyond his
 * reserve, less what open orders and the next few days of works will need.
 * For famine relief he'll dig down to the emergency floor.
 */
export function purseOfLord(sim, { emergency = false } = {}) {
  const cfg = sim.data.lord;
  const st = sim.state.lord;
  const reserve = emergency ? cfg.emergencyFloor : cfg.reserve * (1 + 0.5 * st.mood.grievance); // a sore lord keeps more back
  return Math.max(0, toMarks(sim, balance(sim, 'treasury')) - reserve - committed(sim));
}

// Coin already promised: open orders, and the next few days of each work in hand (marks).
function committed(sim) {
  const cfg = sim.data.lord;
  const st = sim.state.lord;
  let marks = 0;
  for (const o of st.orders) marks += o.remaining * o.price;
  for (const p of st.patrols ?? []) marks += (Math.max(0, p.until - sim.now) / DAY) * p.guards * sim.data.lord.patrol.pay;
  for (const p of st.projects) marks += Math.min(cfg.worksAhead, p.days - p.progress) * p.labour;
  return marks;
}

// ── Mood ────────────────────────────────────────────────────────────────────

function updateMood(sim) {
  const st = sim.state.lord;
  let worst = 0;
  for (const sid of towns(sim)) worst = Math.max(worst, believedHunger(sim, sid).hunger);
  const full = toMarks(sim, balance(sim, 'treasury')) / sim.data.coin.mint.treasuryTarget;
  // Moods drift toward what he sees, a little each day.
  st.mood.worry = round3(st.mood.worry * 0.8 + clamp01(worst / 0.6) * 0.2);
  st.mood.pride = round3(st.mood.pride * 0.9 + clamp01((1 - worst / 0.25) * Math.min(1, full)) * 0.1);
  st.mood.grievance = round3(st.mood.grievance * 0.94);
  st.mood.anger = round3((st.mood.anger ?? 0) * 0.95);
}

// ── Deciding ────────────────────────────────────────────────────────────────

/** Every undertaking the lord could start today, scored. Highest wins if he can afford it. */
export function lordOptions(sim) {
  const cfg = sim.data.lord;
  const st = sim.state.lord;
  const t = st.traits;
  const budget = purseOfLord(sim);
  const out = [];
  const busy = (kind, at) => st.orders.some((o) => o.kind === kind && o.at === at) || st.projects.some((p) => p.at === at);

  for (const sid of towns(sim)) {
    const people = heads(sim, sid);
    if (!people) continue;
    const heard = believedHunger(sim, sid);
    const h = heard.hunger;

    // Relief: grain for a hungry town, paid for by the treasury.
    if (h >= cfg.relief.hunger && !st.orders.some((o) => o.kind === 'relief' && o.at === sid)) {
      const price = round2(quote(sim, sid, 'grain').base * cfg.relief.premium);
      const qty = Math.floor(Math.min(people * 0.1 * cfg.relief.days, purseOfLord(sim, { emergency: true }) / price));
      if (qty >= cfg.relief.minQty) {
        out.push({ kind: 'relief', at: sid, good: 'grain', qty, price, cost: round2(qty * price), score: round2((t.generosity / 1000) * (0.5 + h) * (1 + st.mood.worry)), why: heard.ageDays < 1 ? `${sid} is hungry` : `word is that ${sid} is hungry (${Math.round(heard.ageDays)} days old)` });
      }
    }

    // Commission: prop up a glutted craft by buying its goods for the household and garrison.
    for (const gid of cfg.commission.goods) {
      const q = heardQuote(sim, sid, gid);
      if (!q) continue;
      const lastTime = st.lastCommission?.[`${sid}:${gid}`] ?? -Infinity;
      if (q.factor > cfg.commission.glutFactor || q.stock < cfg.commission.minQty || sim.now - lastTime < cfg.commission.everyDays * DAY) continue;
      const qty = Math.floor(Math.min(q.stock * 0.5, cfg.commission.maxQty, budget / Math.max(q.price, 0.01)));
      if (qty < cfg.commission.minQty) continue;
      const cost = purchaseCost(sim, sid, gid, qty);
      out.push({ kind: 'commission', at: sid, good: gid, qty, cost: round2(cost), score: round2((t.vanity / 1000) * 0.4 + (t.generosity / 1000) * (1 - q.factor) * 0.6), why: `${gid} piles up unsold` });
    }

    // Festival: a fed town, a full treasury, a vain lord.
    if (h < 0.1 && !busy('festival', sid)) {
      const cost = round2(people * (cfg.festival.perHead + cfg.festival.grainPerHead * (heardQuote(sim, sid, 'grain')?.price ?? quote(sim, sid, 'grain').base)));
      if (cost <= budget) {
        const seat = sid === st.seat ? 1.3 : 1;
        out.push({ kind: 'festival', at: sid, cost, score: round2((t.vanity / 1000) * (0.3 + st.mood.pride) * seat), why: 'a fed town and a full treasury' });
      }
    }

    // Works: something lasting, where the town needs it.
    for (const w of cfg.works) {
      if (busy('works', sid)) break;
      const built = st.done.findLast((d) => d.work === w.id && d.at === sid);
      if (built && sim.now - built.t < cfg.worksEvery * DAY) continue;
      const need = worksNeed(sim, sid, w, h);
      if (!need) continue;
      const cost = round2(w.days * w.labour + materialsCost(sim, sid, w));
      // Paid as it goes: a few days in hand will do. Short of that, he may save up for it.
      const affordable = (cost * cfg.worksAhead) / w.days <= budget;
      out.push({ kind: 'works', work: w.id, at: sid, cost, affordable, score: round2((t.ambition / 1000) * need.weight), why: need.why });
    }
  }
  // Patrols: guards for a road his seat has heard is dangerous.
  const pc = cfg.patrol;
  if (pc) {
    for (const route of sim.data.routes) {
      if ((st.patrols ?? []).some((p) => p.route === route.id)) continue;
      let worst = 0;
      for (const seg of route.segments) worst = Math.max(worst, believedDanger(sim, `inn:${st.seat}`, seg) - sim.graph.segments.get(seg).danger);
      if (worst < pc.minDanger) continue;
      const cost = round2(pc.guards * pc.pay * pc.days);
      if (cost > budget) continue;
      out.push({ kind: 'patrol', at: st.seat, route: route.id, cost, score: round2(((t.ambition + t.generosity) / 2000) * (0.4 + worst) * 1.2), why: `word in ${st.seat} is of raiders on the ${route.name}` });
    }
  }
  out.sort((a, b) => b.score - a.score || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0) || (a.kind < b.kind ? -1 : 1));
  return out;
}

/** The lord's patrol on a road, if one is riding it now. */
export function patrolOn(sim, segId) {
  return sim.state.lord?.patrols?.find((p) => p.segs.includes(segId) && p.until > sim.now) ?? null;
}

function runPatrols(sim) {
  const st = sim.state.lord;
  const pc = sim.data.lord.patrol;
  const keep = [];
  for (const p of st.patrols ?? []) {
    if (p.until <= sim.now) {
      if (p.mercs?.length || p.salvage?.length) {
        const trip = { guards: p.mercs, salvage: p.salvage ?? [] };
        st.spent.patrol += payGuards(sim, trip, Math.max(1, Math.round((sim.now - (p.since ?? sim.now)) / DAY)), 'treasury');
        releaseGuards(sim, trip, st.seat);
      }
      sim.log('lord:patrol-home', { route: p.route });
      continue;
    }
    // Extra pay for the guards on the road, spent at home.
    st.spent.patrol += transfer(sim, 'treasury', `purse:${st.seat}`, toBits(sim, p.guards * pc.pay));
    keep.push(p);
  }
  st.patrols = keep;
}

// Does this town need this work, and how much? Null if not.
// His reeves report the stores and the fields; hunger is what he has heard.
function worksNeed(sim, sid, w, hunger) {
  const eco = sim.state.economy;
  const people = heads(sim, sid);
  if (w.effect.storage) {
    const lost = Object.values(eco.today[sid]?.lost ?? {}).reduce((a, b) => a + b, 0);
    const fullest = Math.max(...Object.values(eco.markets[sid]).map((m) => m.stock));
    if (fullest > storageOf(sim, sid) * 0.8 || lost > 2) return { weight: 0.8, why: 'its stores are full to the rafters' };
  }
  if (w.effect.farmers) {
    const land = landOf(sim, sid);
    const farmers = residentsAt(sim, sid).filter((r) => r.profession === 'farmer').length;
    if (land && farmers >= land.farmers && hunger >= 0.1) return { weight: 1, why: 'every field is worked and still it goes hungry' };
  }
  if (w.effect.homes) {
    const d = sim.data.economy.demography;
    const ceiling = Math.floor(sim.graph.nodes.get(sid).residents * d.ceiling) + improvementsOf(sim, sid).homes;
    if (people >= ceiling - 1 && hunger < 0.1) return { weight: 0.9, why: 'it is full to bursting and well fed' };
  }
  if (w.effect.trade) {
    const p = sim.data.economy.professions[w.effect.trade];
    const out = p.produces ?? p.makes;
    const q = quote(sim, sid, out);
    const pool = residentsAt(sim, sid).some((r) => r.profession === 'labourer');
    const inputs = Object.keys(p.inputs ?? {}).every((g) => eco.markets[sid][g].stock > 5);
    if (q.factor > 1.6 && pool && inputs) return { weight: 0.7 + (q.factor - 1.6) * 0.3, why: `${out} is dear and a new workshop would pay` };
  }
  return null;
}

function materialsCost(sim, sid, w) {
  let marks = 0;
  for (const [gid, qty] of Object.entries(w.materials)) marks += quote(sim, sid, gid).price * qty;
  return marks;
}

function decide(sim) {
  const cfg = sim.data.lord;
  const st = sim.state.lord;
  considerTrip(sim);
  const options = lordOptions(sim);
  // Once he has set his heart on a work, he keeps to it while it's still needed,
  // unless something more pressing (relief) comes first.
  const saved = st.saving && options.find((o) => o.kind === 'works' && o.work === st.saving.work && o.at === st.saving.at);
  if (saved && options[0].kind !== 'relief') options.splice(options.indexOf(saved), 1), options.unshift(saved);
  const best = options[0];
  st.reason = {
    t: sim.now,
    budget: round2(purseOfLord(sim)),
    mood: { ...st.mood },
    // Only the fields each kind has (state stays plain JSON: no undefined).
    options: options.slice(0, 5).map((o) => Object.fromEntries(
      Object.entries({ kind: o.kind, trip: o.trip, work: o.work, route: o.route, at: o.at, good: o.good, qty: o.qty, cost: o.cost, score: o.score, why: o.why, affordable: o.affordable !== false })
        .filter(([, v]) => v !== undefined),
    )),
    choice: null,
    note: null,
  };
  if (!best || best.score < cfg.minScore) {
    st.reason.note = best ? 'nothing worth the coin' : purseOfLord(sim) < 1 ? 'the treasury has nothing to spare' : 'nothing needs doing';
    return;
  }
  if (best.affordable === false) {
    // Saving up: no festivals or trinkets until the works can begin.
    st.reason.note = `saving for ${sim.data.lord.works.find((w) => w.id === best.work).name} in ${best.at}`;
    if (!st.saving || st.saving.work !== best.work || st.saving.at !== best.at) {
      st.saving = { work: best.work, at: best.at, since: sim.now };
      sim.log('lord:saving', { at: best.at, work: best.work });
    }
    return;
  }
  st.saving = null;
  st.reason.choice = 0;
  if (best.kind === 'relief') postOrder(sim, best);
  else if (best.kind === 'commission') commission(sim, best);
  else if (best.kind === 'festival') festival(sim, best);
  else if (best.kind === 'works') beginWorks(sim, best);

  else if (best.kind === 'patrol') {
    const route = sim.data.routes.find((r) => r.id === best.route);
    const pc = sim.data.lord.patrol;
    // Sellswords waiting at his seat ride with the guard (step F), paid when they come home.
    const id = sim.nextId('pt');
    const mercs = st.at === st.seat ? hireGuards(sim, { id }, { kind: 'patrol', want: pc.sellswords ?? 0, days: pc.days, account: 'treasury', tripNo: 0, from: st.seat, exposure: 1, wagons: 1, caution: 0.5 }) : [];
    st.patrols = [...(st.patrols ?? []), { id, route: route.id, segs: route.segments, guards: pc.guards, until: sim.now + pc.days * DAY, since: sim.now, mercs }];
    sim.log('lord:patrol', { route: route.id, guards: pc.guards, days: pc.days, mercs });
  }
}

// A trip is weighed apart from the spending (step F): he can fund works and still ride
// out. Cheap enough to take from the emergency purse; taken now and then, not whenever it scores.
function considerTrip(sim) {
  const st = sim.state.lord;
  const cfg = sim.data.lord.travel;
  if (!cfg) return;
  const trips = travelOptions(sim, purseOfLord(sim, { emergency: true })).sort((a, b) => b.score - a.score || (a.at < b.at ? -1 : 1));
  st.tripReason = trips.length ? { t: sim.now, options: trips.slice(0, 4).map(({ trip, at, route, score, why }) => ({ trip, at, route: route ?? null, score, why })), choice: null } : st.tripReason ?? null;
  const best = trips[0];
  if (!best || best.score < cfg.minScore || !sim.rng('lord.travel').chance(cfg.chance)) return;
  if (setOut(sim, best)) st.tripReason.choice = 0;
}

// ── Orders: the treasury pays for goods delivered ───────────────────────────

function postOrder(sim, o) {
  const st = sim.state.lord;
  const order = {
    id: sim.nextId('o'),
    kind: o.kind,
    at: o.at,
    good: o.good,
    qty: o.qty,
    remaining: o.qty,
    price: o.price,
    posted: sim.now,
    expires: sim.now + sim.data.lord.relief.days * DAY,
    // Cried at the lord's seat and in the town itself; the post carries it further.
    cried: [...new Set([st.seat, o.at])].sort(),
    delivered: 0,
    paid: 0,
  };
  st.orders.push(order);
  sim.log('lord:order', { kind: o.kind, at: o.at, good: o.good, qty: o.qty, price: o.price });
}

function runOrders(sim) {
  const st = sim.state.lord;
  const keep = [];
  for (const o of st.orders) {
    if (o.remaining > 0.05 && sim.now < o.expires) {
      keep.push(o);
      continue;
    }
    sim.log('lord:order-closed', { at: o.at, good: o.good, delivered: round3(o.delivered), qty: o.qty, bits: o.paid });
  }
  st.orders = keep;
}

/** The open order a traveller standing in `town` has heard of for `good` delivered to `dest`, if any. */
export function knownOrder(sim, town, dest, good) {
  return sim.state.lord?.orders.find((o) => o.at === dest && o.good === good && o.remaining > 0.05 && o.cried.includes(town)) ?? null;
}

/** The post cries every open order in each town it reaches. */
export function cryOrders(sim, town) {
  for (const o of sim.state.lord?.orders ?? []) if (!o.cried.includes(town)) o.cried = [...o.cried, town].sort();
}

/**
 * Deliver goods against an open order in this town: the treasury pays the
 * order's price and the goods go into the town's market. Returns what was taken.
 */
export function fillOrder(sim, sid, gid, qty, account) {
  const o = sim.state.lord?.orders.find((x) => x.at === sid && x.good === gid && x.remaining > 0.05);
  if (!o) return { qty: 0, bits: 0 };
  let take = Math.min(qty, o.remaining);
  const affordable = balance(sim, 'treasury') / Math.max(1, toBits(sim, o.price));
  take = Math.floor(Math.min(take, affordable) * 10) / 10;
  if (!(take > 0)) return { qty: 0, bits: 0 };
  const bits = transfer(sim, 'treasury', account, toBits(sim, take * o.price));
  unload(sim, sid, gid, take);
  o.remaining = round3(o.remaining - take);
  o.delivered = round3(o.delivered + take);
  o.paid += bits;
  sim.state.lord.spent.relief += bits;
  return { qty: take, bits };
}

// ── Commissions and festivals: the lord buys, and the town is paid ──────────

export function buyForLord(sim, sid, gid, qty) {
  const cost = purchaseCost(sim, sid, gid, qty);
  const got = useUp(sim, sid, gid, qty);
  return transfer(sim, 'treasury', `till:${sid}`, toBits(sim, cost * (got / Math.max(qty, 1e-9))));
}

function commission(sim, o) {
  const st = sim.state.lord;
  st.lastCommission = { ...(st.lastCommission ?? {}), [`${o.at}:${o.good}`]: sim.now };
  const bits = buyForLord(sim, o.at, o.good, o.qty);
  sim.state.lord.spent.commission += bits;
  sim.log('lord:commission', { at: o.at, good: o.good, qty: o.qty, bits });
}

function festival(sim, o) {
  const cfg = sim.data.lord.festival;
  const people = heads(sim, o.at);
  const food = buyForLord(sim, o.at, 'grain', people * cfg.grainPerHead);
  const service = transfer(sim, 'treasury', `purse:${o.at}`, toBits(sim, people * cfg.perHead));
  improve(sim, o.at, { growUntil: sim.now + cfg.glowDays * DAY });
  sim.state.lord.spent.festival += food + service;
  sim.log('lord:festival', { at: o.at, bits: food + service });
}

// ── Works: labour and materials over days, then something lasting ─────────

function beginWorks(sim, o) {
  const w = sim.data.lord.works.find((x) => x.id === o.work);
  sim.state.lord.projects.push({ id: sim.nextId('j'), work: w.id, at: o.at, days: w.days, labour: w.labour, progress: 0, stalled: 0, begun: sim.now, paid: 0 });
  sim.log('lord:works-begun', { at: o.at, work: w.id });
}

function runProjects(sim) {
  const st = sim.state.lord;
  const keep = [];
  for (const p of st.projects) {
    const w = sim.data.lord.works.find((x) => x.id === p.work);
    // Today's share of the materials, from the town's market.
    const short = Object.entries(w.materials).some(([gid, qty]) => sim.state.economy.markets[p.at][gid].stock < qty / w.days) ||
      toMarks(sim, balance(sim, 'treasury')) < sim.data.lord.emergencyFloor + w.labour * 2;
    if (short) {
      p.stalled += 1;
      if (p.stalled >= sim.data.lord.abandonAfter) {
        sim.log('lord:works-abandoned', { at: p.at, work: p.work });
        continue;
      }
      keep.push(p);
      continue;
    }
    for (const [gid, qty] of Object.entries(w.materials)) p.paid += buyForLord(sim, p.at, gid, qty / w.days);
    p.paid += transfer(sim, 'treasury', `purse:${p.at}`, toBits(sim, w.labour));
    p.progress += 1;
    if (p.progress < p.days) {
      keep.push(p);
      continue;
    }
    st.spent.works += p.paid;
    if (w.effect.trade) {
      // A new workshop: a labourer takes up the trade (through the usual succession).
      sim.state.residents.vacancies.push({ at: p.at, profession: w.effect.trade, since: sim.now - 30 * DAY, predecessor: null });
    } else {
      const { trade, ...change } = w.effect;
      improve(sim, p.at, change);
    }
    refreshNeeds(sim, p.at);
    st.done.push({ work: p.work, at: p.at, t: sim.now, bits: p.paid });
    if (st.done.length > 12) st.done.shift();
    sim.log('lord:works-done', { at: p.at, work: p.work, bits: p.paid });
  }
  st.projects = keep;
}

// ── The steward's fingers ───────────────────────────────────────────────────

function steward(sim) {
  const cfg = sim.data.lord.steward;
  const st = sim.state.lord;
  const excess = balance(sim, 'treasury') - toBits(sim, cfg.tempted);
  if (excess <= 0) return;
  // While the cat's away (step F).
  const bolder = atHome(st) ? 1 : sim.data.lord.travel?.stewardAway ?? 1;
  const taken = transfer(sim, 'treasury', 'hoard', excess * cfg.share * bolder);
  if (!taken) return;
  const hoards = sim.state.coin.hoards;
  hoards[st.seat] = (hoards[st.seat] ?? 0) + taken; // buried somewhere near the castle
  st.skimmed += taken;
  st.skimmedSeason += taken;
}
