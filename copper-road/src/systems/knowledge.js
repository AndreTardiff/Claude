// Knowledge: who knows what about which market, and how old it is (spec §5).
//
// Nobody reads the world's true prices except where they stand. Everyone else
// works from price lists: dated snapshots of a market's prices and stocks, each
// with a source and a confidence.
//
//   seen     observed in person (exact, fresh)
//   board    the town's own posted prices, kept at its inn (exact)
//   post     carried by the lord's post riders (exact, but as old as the ride)
//   rumour   word of mouth: travellers and inns swapping news. Each retelling
//            nudges the prices a little and lowers the confidence.
//
// Holders: every inn ('inn:<town>'), every traveller (wayfarers, post riders,
// merchants), every raider band. A holder keeps only its freshest list per market.
//
// Roads are news too (step E): a traveller who comes along a road reports on it
// ('road:<segment>'): quiet, signs of bandits, or a raid. Reports travel and get
// retold like price lists, and fade from memory, so a road's reputation lags
// what is really waiting on it.
// Travellers and inns swap news when a traveller arrives, so knowledge spreads
// at road speed, and a town's picture of the others is always somewhat out of date.

import { economyIndex, quote } from '../economy/pricing.js';

const DAY = 1440;
import { balance } from '../economy/money.js';

const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;

export const knowledge = {
  id: 'knowledge',

  init(sim) {
    const st = (sim.state.knowledge = { holders: {} });
    // Every inn starts knowing its own board and a rough word of the others,
    // a few days old, so nobody begins completely in the dark.
    const ix = economyIndex(sim.data);
    for (const sid of ix.markets) {
      st.holders[innOf(sid)] = {};
      for (const other of ix.markets) {
        const rec = snapshot(sim, other, other === sid ? 'board' : 'rumour', other === sid ? 1000 : 600);
        if (other !== sid) rec.t = Math.max(0, sim.now - 3 * 1440);
        st.holders[innOf(sid)][other] = rec;
      }
    }
  },

  // Each inn's board (its own town's prices) is refreshed at midnight.
  daily(sim) {
    const ix = economyIndex(sim.data);
    for (const sid of ix.markets) learn(sim, innOf(sid), snapshot(sim, sid, 'board', 1000));
  },
};

export const innOf = (sid) => `inn:${sid}`;

/**
 * A dated price list of one market as it truly is right now, with word of how
 * much coin its traders and households have (marks; none recorded at the
 * Outside, whose ships always pay).
 */
export function snapshot(sim, sid, source = 'seen', confidence = 1000) {
  const ix = economyIndex(sim.data);
  const goods = {};
  for (const gid of ix.goodIds) {
    const q = quote(sim, sid, gid);
    goods[gid] = { price: round2(q.price), stock: round1(q.stock), desired: round1(q.desired) };
  }
  const rec = { at: sid, t: sim.now, source, confidence, goods };
  // How hungry the town is (0–1): what anyone standing there can see (step F: the lord judges by it).
  if (sim.state.economy?.hunger && !ix.isOutside(sid)) rec.hunger = round2(sim.state.economy.hunger[sid] ?? 0);
  if (sim.state.coin && !ix.isOutside(sid)) {
    const marks = (account) => Math.round(balance(sim, account) / sim.data.coin.bitsPerMark);
    rec.coin = { till: marks(`till:${sid}`), purse: marks(`purse:${sid}`) };
  }
  return rec;
}

export function holderOf(sim, holder) {
  const st = sim.state.knowledge;
  if (!st) return null;
  if (!st.holders[holder]) st.holders[holder] = {};
  return st.holders[holder];
}

/** Keep a record if it's fresher than what the holder has (or as fresh but surer). Returns true if kept. */
export function learn(sim, holder, rec) {
  const h = holderOf(sim, holder);
  if (!h) return false;
  const have = h[rec.at];
  // A road seen shut now outranks anything said of it at the same moment.
  const shutNow = rec.road && rec.what === 'closed' && have && have.t === rec.t && have.what !== 'closed';
  if (have && !shutNow && (have.t > rec.t || (have.t === rec.t && have.confidence >= rec.confidence))) return false;
  // Bad news outlives good for a while: "the road was quiet when I came" doesn't
  // undo a raid reported a day or two before.
  if (have && rec.road && rec.what === 'quiet' && have.what !== 'quiet' && rec.t - have.t < sim.data.knowledge.badNewsDays * DAY) return false;
  h[rec.at] = rec;
  return true;
}

export const roadKey = (segId) => `road:${segId}`;

/** A traveller's report on a road they have just come along. */
export function reportRoad(sim, holder, segId, { danger, what, band = null, until = null, note = null, source = 'seen', confidence = 1000 }) {
  if (!sim.state.knowledge) return false;
  const rec = { at: roadKey(segId), road: segId, t: sim.now, source, confidence, danger: round2(danger), what, band };
  if (until !== null) Object.assign(rec, { until, note });
  return learn(sim, holder, rec);
}

/**
 * How dangerous a holder believes a road to be (on the same 0–1 scale as the
 * world data's danger). With no word of it, the road's old reputation; a report
 * pulls it toward what was seen, fading as the report ages.
 */
export function believedDanger(sim, holder, segId) {
  const base = sim.graph.segments.get(segId).danger;
  const rec = holder ? sim.state.knowledge?.holders[holder]?.[roadKey(segId)] : null;
  if (!rec) return base;
  const age = (sim.now - rec.t) / DAY;
  const fade = 1 / (1 + age / sim.data.knowledge.roadMemoryDays);
  return base + (rec.danger - base) * fade * (0.5 + 0.5 * rec.confidence / 1000);
}

/** Has the holder heard that a road is shut (a flood, a rockfall), and not yet that it's open? */
export function believedClosed(sim, holder, segId) {
  const rec = holder ? sim.state.knowledge?.holders[holder]?.[roadKey(segId)] : null;
  return Boolean(rec && rec.what === 'closed' && rec.until > sim.now);
}

/** Believed exposure of a path: danger per 100 km, summed (compare pathExposure in world/routes.js). */
export function believedExposure(sim, holder, path) {
  let e = 0;
  for (const segId of path) e += (believedDanger(sim, holder, segId) * sim.graph.segments.get(segId).km) / 100;
  return e;
}

/** See a market for yourself. */
export function observe(sim, holder, sid) {
  if (!sim.state.knowledge) return;
  learn(sim, holder, snapshot(sim, sid, 'seen', 1000));
}

// Word of mouth: the copy is a little wrong and a little less trusted.
function retell(sim, rec) {
  const noise = sim.data.knowledge.rumourNoise;
  const rng = sim.rng('rumour');
  if (rec.fame) {
    // A tale of a sellsword (or a band) grows in the telling more often than it shrinks.
    const wobble = 1 + (rng.float() * 2 - 0.8) * noise * 3;
    return { ...rec, renown: round2(Math.max(0, rec.renown * wobble)), source: 'rumour', confidence: Math.round(rec.confidence * sim.data.knowledge.rumourTrust) };
  }
  if (rec.deal) {
    // Talk of a good sale: the profit grows in the telling.
    const wobble = 1 + (rng.float() * 2 - 0.7) * noise * 3;
    return { ...rec, profit: round2(rec.profit * wobble), source: 'rumour', confidence: Math.round(rec.confidence * sim.data.knowledge.rumourTrust) };
  }
  if (rec.road) {
    // A road story grows or shrinks in the telling.
    const wobble = 1 + (rng.float() * 2 - 1) * noise * 3;
    const danger = Math.min(1, Math.max(0, rec.danger * wobble));
    return { ...rec, danger: round2(danger), source: 'rumour', confidence: Math.round(rec.confidence * sim.data.knowledge.rumourTrust) };
  }
  const goods = {};
  for (const [gid, g] of Object.entries(rec.goods)) {
    const wobble = 1 + (rng.float() * 2 - 1) * noise;
    goods[gid] = { price: round2(g.price * wobble), stock: round1(g.stock * wobble), desired: g.desired };
  }
  const confidence = Math.round(rec.confidence * sim.data.knowledge.rumourTrust);
  const told = { at: rec.at, t: rec.t, source: 'rumour', confidence, goods };
  if (rec.hunger !== undefined) told.hunger = round2(Math.min(1, Math.max(0, rec.hunger * (1 + (rng.float() * 2 - 1) * noise * 2))));
  if (rec.coin) {
    const wobble = 1 + (rng.float() * 2 - 1) * noise;
    told.coin = { till: Math.round(rec.coin.till * wobble), purse: Math.round(rec.coin.purse * wobble) };
  }
  return told;
}

/**
 * A traveller arrives at a town: they see its market, then swap news with the
 * inn. Word passed by mouth is retold (noisy); `letters` (the post) pass exactly.
 */
export function swapNews(sim, traveller, sid, { letters = false, look = true } = {}) {
  if (!sim.state.knowledge) return { told: 0, heard: 0 };
  const inn = innOf(sid);
  if (look) observe(sim, traveller, sid); // a waystation has no market to look at
  const mine = holderOf(sim, traveller);
  const theirs = holderOf(sim, inn);
  let told = 0;
  let heard = 0;
  for (const market of Object.keys(mine).sort()) {
    const rec = mine[market];
    if (market === sid) continue;
    const have = theirs[market];
    if (have && have.t >= rec.t) continue;
    if (learn(sim, inn, letters ? { ...rec, source: 'post', confidence: Math.min(rec.confidence, 950) } : retell(sim, rec))) told++;
  }
  for (const market of Object.keys(theirs).sort()) {
    const rec = theirs[market];
    if (market === sid) continue;
    const have = mine[market];
    if (have && have.t >= rec.t) continue;
    if (learn(sim, traveller, rec.source === 'board' || rec.source === 'post' ? rec : retell(sim, rec))) heard++;
  }
  return { told, heard };
}

/**
 * What a holder believes about one good in one market, with its age in days and
 * the coin its buyers were said to have (null: the Outside, or not known).
 */
export function belief(sim, holder, sid, gid) {
  const rec = sim.state.knowledge?.holders[holder]?.[sid];
  if (!rec) return null;
  const g = rec.goods[gid];
  return { ...g, ageDays: (sim.now - rec.t) / 1440, source: rec.source, confidence: rec.confidence / 1000, t: rec.t, coin: rec.coin ?? null };
}

/**
 * Two travellers sharing a fire swap what they know: each takes the other's
 * fresher news, retold. Returns the raid reports that changed hands.
 */
export function swapBetween(sim, a, b) {
  if (!sim.state.knowledge) return [];
  const raids = [];
  const give = (from, to) => {
    const mine = holderOf(sim, from);
    const theirs = holderOf(sim, to);
    for (const key of Object.keys(mine).sort()) {
      const rec = mine[key];
      const have = theirs[key];
      if (have && have.t >= rec.t) continue;
      if (learn(sim, to, rec.road || rec.source !== 'board' ? retell(sim, rec) : rec) && rec.what === 'raided') raids.push({ from, to, road: rec.road, band: rec.band });
    }
  };
  give(a, b);
  give(b, a);
  return raids;
}
