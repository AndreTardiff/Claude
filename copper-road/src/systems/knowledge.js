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
// later merchants). A holder keeps only its freshest list per market.
// Travellers and inns swap news when a traveller arrives, so knowledge spreads
// at road speed, and a town's picture of the others is always somewhat out of date.

import { economyIndex, quote } from '../economy/pricing.js';
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
  if (have && (have.t > rec.t || (have.t === rec.t && have.confidence >= rec.confidence))) return false;
  h[rec.at] = rec;
  return true;
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
  const goods = {};
  for (const [gid, g] of Object.entries(rec.goods)) {
    const wobble = 1 + (rng.float() * 2 - 1) * noise;
    goods[gid] = { price: round2(g.price * wobble), stock: round1(g.stock * wobble), desired: g.desired };
  }
  const confidence = Math.round(rec.confidence * sim.data.knowledge.rumourTrust);
  const told = { at: rec.at, t: rec.t, source: 'rumour', confidence, goods };
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
export function swapNews(sim, traveller, sid, { letters = false } = {}) {
  if (!sim.state.knowledge) return { told: 0, heard: 0 };
  const inn = innOf(sid);
  observe(sim, traveller, sid);
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
