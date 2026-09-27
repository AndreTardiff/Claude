// The economy: each settlement's market, settled once a day at midnight.
//
// For every settlement, in data order:
//   1. Needs: what residents, visiting travellers and workshops want per day, for
//      the season. Desired stock = need × the good's reserve days.
//   2. Production: each trade's output = rate × season × summed skill × hunger
//      factor × tool factor × effort. Elastic trades work harder when their output
//      is dear here and slack off in a glut. Crafters use up inputs, and without
//      inputs manage only a makeshift share.
//   3. Consumption: people eat and use what they need if it's there. A grain
//      shortfall feeds a slow-moving hunger level, which slows all work.
//   4. Tools wear out and are replaced from stock; grain spoils a little;
//      anything beyond storage is lost.
// The Outside (Saltmouth) doesn't produce or consume: ships pull its stocks back
// toward fixed anchors, at world prices.
// Then prices and stocks go into the history, and notable changes into the chronicle.
//
// Goods never teleport: stock changes only through work, use, spoilage,
// storage limits, ships at the Outside, travellers' provisions and (later) trade.

import { economyIndex, quote } from '../economy/pricing.js';
import { residentsAt, visitorsAt, workforce } from '../economy/people.js';
import { deposit, round3, withdraw } from '../economy/market.js';
import { balance, toBits, transfer } from '../economy/money.js';

const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const seasonMult = (table, seasonId) => table?.[seasonId] ?? 1;

export const economy = {
  id: 'economy',

  init(sim) {
    const ix = economyIndex(sim.data);
    const eco = ix.eco;
    const st = (sim.state.economy = { markets: {}, hunger: {}, today: {}, news: {}, history: { days: [], price: {}, stock: {} } });
    for (const sid of ix.markets) {
      st.markets[sid] = {};
      for (const gid of ix.goodIds) st.markets[sid][gid] = { stock: 0, need: 0, desired: 0 };
      st.hunger[sid] = 0;
      refreshNeeds(sim, sid);
      const made = new Set(workforce(sim, sid).map((w) => eco.professions[w.profession].produces ?? eco.professions[w.profession].makes));
      for (const gid of ix.goodIds) {
        const m = st.markets[sid][gid];
        if (ix.isOutside(sid)) m.stock = eco.outside[sid].goods[gid]?.anchor ?? 0;
        else if (m.need > 0) m.stock = round3(m.desired * eco.initialReserve);
        else if (made.has(gid)) m.stock = eco.initialSurplus;
      }
      st.history.price[sid] = {};
      st.history.stock[sid] = {};
      for (const gid of ix.goodIds) {
        st.history.price[sid][gid] = [];
        st.history.stock[sid][gid] = [];
      }
      st.news[sid] = { hunger: 'fed' };
      for (const gid of ix.goodIds) {
        st.news[sid][gid] = { band: marketBand(sim, sid, gid), logged: null, day: -99, stock: st.markets[sid][gid].stock };
      }
    }
  },

  daily(sim) {
    settleDay(sim);
  },

  handlers: {
    'lab:spoil': onLabSpoil,
    'lab:deliver': onLabDeliver,
  },
};

/** Recompute a settlement's daily needs and desired stocks for a season. */
export function refreshNeeds(sim, sid, seasonId = sim.cal.season(sim.now).id) {
  const ix = economyIndex(sim.data);
  const eco = ix.eco;
  const markets = sim.state.economy?.markets[sid];
  if (!markets) return;
  if (ix.isOutside(sid)) {
    for (const gid of ix.goodIds) {
      markets[gid].need = 0;
      markets[gid].desired = eco.outside[sid].goods[gid]?.anchor ?? 0;
    }
    return;
  }
  const need = Object.fromEntries(ix.goodIds.map((g) => [g, 0]));
  const heads = residentsAt(sim, sid).length + visitorsAt(sim, sid).length;
  for (const [gid, n] of Object.entries(eco.needs)) need[gid] += n.perPerson * seasonMult(n.season, seasonId) * heads;
  for (const w of workforce(sim, sid)) {
    const p = eco.professions[w.profession];
    for (const [gid, per] of Object.entries(p.uses ?? {})) need[gid] += per * w.count;
    if (p.toolWear) need.tools += p.toolWear * w.count;
    if (p.makes) {
      const capacity = p.rate * seasonMult(p.season, seasonId) * w.skill;
      for (const [gid, perUnit] of Object.entries(p.inputs)) need[gid] += capacity * perUnit;
    }
  }
  for (const gid of ix.goodIds) {
    markets[gid].need = round3(need[gid]);
    markets[gid].desired = round3(need[gid] * ix.goods.get(gid).reserveDays);
  }
}

/** Tool factor: 1 when spare tools cover `toolReserveDays` of wear, falling to 1 − toolPenalty with none. */
export function toolFactor(sim, sid) {
  const eco = sim.data.economy;
  const m = sim.state.economy.markets[sid].tools;
  if (!(m.need > 0)) return 1;
  const cover = Math.min(1, m.stock / (m.need * eco.toolReserveDays));
  return 1 - eco.toolPenalty * (1 - cover);
}

export function hungerFactor(sim, sid) {
  return 1 - sim.data.economy.hungerPenalty * sim.state.economy.hunger[sid];
}

function settleDay(sim) {
  const ix = economyIndex(sim.data);
  const st = sim.state.economy;
  const endedDay = sim.cal.day(sim.now - 1);
  const endedSeason = sim.cal.seasonOfDay(endedDay).id;

  for (const sid of ix.markets) {
    if (ix.isOutside(sid)) {
      relaxOutside(sim, sid);
      continue;
    }
    refreshNeeds(sim, sid, endedSeason);
    const today = { produced: {}, used: {}, consumed: {}, unmet: {}, lost: {}, trades: [], hunger: 0, tools: 1, earned: 0, spent: 0, unpaid: 0, poor: 0 };
    produce(sim, sid, endedSeason, today);
    consume(sim, sid, endedSeason, today);
    decay(sim, sid, today);
    today.hunger = round3(st.hunger[sid]);
    today.tools = round3(toolFactor(sim, sid));
    st.today[sid] = today;
  }

  // Prices during the new day reflect the new day's season (winter wants firewood).
  for (const sid of ix.markets) refreshNeeds(sim, sid);
  recordHistory(sim, endedDay);
  reportNews(sim, endedDay);
}

function produce(sim, sid, seasonId, today) {
  const eco = sim.data.economy;
  const markets = sim.state.economy.markets[sid];
  const common = hungerFactor(sim, sid);
  const tools = toolFactor(sim, sid);
  for (const w of workforce(sim, sid)) {
    const p = eco.professions[w.profession];
    const out = p.produces ?? p.makes;
    if (!out) continue;
    let capacity = p.rate * seasonMult(p.season, seasonId) * w.skill * common;
    if (p.produces === 'grain') capacity *= eco.land?.[sid]?.yield ?? 1;
    if (p.toolWear) capacity *= tools;
    const effort = p.elastic ? clamp(quote(sim, sid, out).factor, eco.effort.min, eco.effort.max) : 1;
    capacity *= effort;
    let fromInputs = capacity;
    if (p.inputs) {
      // Workshops buy their inputs from the market, as far as stock and purse allow.
      let unitCost = 0;
      for (const [gid, perUnit] of Object.entries(p.inputs)) {
        fromInputs = Math.min(fromInputs, markets[gid].stock / perUnit);
        unitCost += perUnit * quote(sim, sid, gid).price;
      }
      if (sim.state.coin && unitCost > 0) fromInputs = Math.min(fromInputs, balance(sim, `purse:${sid}`) / toBits(sim, unitCost));
      for (const [gid, perUnit] of Object.entries(p.inputs)) {
        const price = quote(sim, sid, gid).price;
        const used = withdraw(sim, sid, gid, fromInputs * perUnit);
        today.used[gid] = round3((today.used[gid] ?? 0) + used);
        today.spent += transfer(sim, `purse:${sid}`, `till:${sid}`, toBits(sim, price * used));
      }
    }
    const makeshift = p.inputs ? (capacity - fromInputs) * eco.makeshift : 0;
    const made = fromInputs + makeshift;
    // Farming households keep what the town eats of their own harvest; no coin
    // changes hands for it. The market's traders buy the rest at today's price,
    // if their till can pay.
    let sold = made;
    if (out === 'grain') {
      const kept = Math.min(made, markets.grain.need);
      today.kept = round3(kept);
      sold = made - kept;
    }
    const owed = toBits(sim, quote(sim, sid, out).price * sold);
    const paid = transfer(sim, `till:${sid}`, `purse:${sid}`, owed);
    today.earned += paid;
    today.unpaid += Math.max(0, owed - paid);
    deposit(sim, sid, out, made);
    today.produced[out] = round3((today.produced[out] ?? 0) + made);
    today.trades.push({
      profession: w.profession,
      workers: w.count,
      good: out,
      made: round3(made),
      effort: round3(effort),
      makeshift: p.inputs && capacity > 0 ? round3((capacity - fromInputs) / capacity) : 0,
    });
  }
}

function consume(sim, sid, seasonId, today) {
  const eco = sim.data.economy;
  const st = sim.state.economy;
  const heads = residentsAt(sim, sid).length + visitorsAt(sim, sid).length;
  // Food first, then the rest. Households pay from the town purse; the lord's
  // household (nobles) pays from the treasury.
  const want = [];
  for (const [gid, n] of Object.entries(eco.needs)) want.push({ gid, amount: n.perPerson * seasonMult(n.season, seasonId) * heads, payer: `purse:${sid}` });
  let tools = 0;
  for (const w of workforce(sim, sid)) {
    const p = eco.professions[w.profession];
    for (const [gid, per] of Object.entries(p.uses ?? {})) want.push({ gid, amount: per * w.count, payer: w.profession === 'noble' ? 'treasury' : `purse:${sid}` });
    if (p.toolWear) tools += p.toolWear * w.count;
  }
  if (tools) want.push({ gid: 'tools', amount: tools, payer: `purse:${sid}` });
  const fee = sim.data.coin?.marketFee ?? 0;
  for (const { gid, amount, payer } of want) {
    // Grain the town grew itself today is already the households' own.
    const own = gid === 'grain' && payer === `purse:${sid}` ? Math.min(amount, today.kept ?? 0) : 0;
    let affordable = amount;
    const price = quote(sim, sid, gid).price;
    if (sim.state.coin) {
      const perUnit = toBits(sim, price * (1 + fee));
      if (perUnit > 0) affordable = Math.min(amount, own + balance(sim, payer) / perUnit);
    }
    const got = withdraw(sim, sid, gid, affordable);
    if (got > own && sim.state.coin) {
      const cost = toBits(sim, price * (got - own));
      today.spent += transfer(sim, payer, `till:${sid}`, cost);
      const tax = transfer(sim, payer, 'treasury', cost * fee);
      sim.state.coin.today.fees += tax;
    }
    if (affordable < amount && got === affordable && sim.state.economy.markets[sid][gid].stock > 1e-6) today.poor += 1;
    today.consumed[gid] = round3((today.consumed[gid] ?? 0) + got);
    if (amount - got > 1e-9) today.unmet[gid] = round3((today.unmet[gid] ?? 0) + amount - got);
    if (gid === 'grain') {
      const fed = amount > 0 ? got / amount : 1;
      // Hunger is a slow-moving average, so one lean day doesn't starve a town.
      st.hunger[sid] = round3(st.hunger[sid] * 0.7 + (1 - fed) * 0.3);
    }
  }
}

function decay(sim, sid, today) {
  const ix = economyIndex(sim.data);
  const markets = sim.state.economy.markets[sid];
  const cap = ix.eco.storage[sid];
  for (const gid of ix.goodIds) {
    const m = markets[gid];
    const spoil = ix.goods.get(gid).spoilPerDay ?? 0;
    let lost = spoil ? m.stock * spoil : 0;
    if (m.stock - lost > cap) lost = m.stock - cap;
    if (lost > 0) {
      m.stock = round3(m.stock - lost);
      today.lost[gid] = round3(lost);
    }
  }
}

function relaxOutside(sim, sid) {
  const o = sim.data.economy.outside[sid];
  const markets = sim.state.economy.markets[sid];
  for (const [gid, a] of Object.entries(o.goods)) {
    const m = markets[gid];
    m.stock = round3(m.stock + (a.anchor - m.stock) * o.relax);
  }
}

function recordHistory(sim, day) {
  const ix = economyIndex(sim.data);
  const h = sim.state.economy.history;
  const keep = ix.eco.historyDays;
  h.days.push(day);
  if (h.days.length > keep) h.days.shift();
  for (const sid of ix.markets) {
    for (const gid of ix.goodIds) {
      const prices = h.price[sid][gid];
      const stocks = h.stock[sid][gid];
      prices.push(round2(quote(sim, sid, gid).price));
      stocks.push(round1(sim.state.economy.markets[sid][gid].stock));
      if (prices.length > keep) prices.shift();
      if (stocks.length > keep) stocks.shift();
    }
  }
}

// ── Market news ─────────────────────────────────────────────────────────────

const BAND_RANK = { out: 0, low: 1, fine: 2, plenty: 3, glut: 4 };

/** A market's condition, in words the chronicle can use. */
export function marketBand(sim, sid, gid) {
  const q = quote(sim, sid, gid);
  const reserve = economyIndex(sim.data).goods.get(gid).reserveDays;
  const glutted = q.stock >= 10 && q.factor < 0.5;
  if (q.need > 0.01) {
    if (q.daysLeft < 2) return 'out';
    if (q.daysLeft < reserve * 0.35) return 'low';
    if (glutted && q.daysLeft >= reserve * 3) return 'glut';
    if (q.daysLeft >= reserve * 1.75) return 'plenty';
    return 'fine';
  }
  return glutted ? 'glut' : 'fine';
}

function reportNews(sim, day) {
  const ix = economyIndex(sim.data);
  const eco = ix.eco;
  const st = sim.state.economy;
  const season = sim.cal.seasonOfDay(day).id;
  const harvestDay = season === 'autumn' && (day % sim.cal.daysPerSeason) === 2; // third day of autumn
  for (const sid of ix.markets) {
    if (ix.isOutside(sid)) continue;
    const news = st.news[sid];
    const trades = workforce(sim, sid).map((w) => eco.professions[w.profession]);
    const madeHere = new Set(trades.map((p) => p.produces ?? p.makes).filter(Boolean));
    for (const gid of ix.goodIds) {
      const prev = news[gid];
      const band = marketBand(sim, sid, gid);
      const q = quote(sim, sid, gid);
      let kind = null;
      if ((band === 'low' || band === 'out') && BAND_RANK[band] < BAND_RANK[prev.band]) kind = band;
      // "Back in the market" only when goods actually arrived, not because a
      // change of season made the town want less.
      else if ((prev.band === 'low' || prev.band === 'out') && BAND_RANK[band] >= BAND_RANK.fine && q.stock > prev.stock * 1.25 + 1) kind = 'recovered';
      // "Piles up unsold" only for what the town itself makes.
      else if (band === 'glut' && prev.band !== 'glut' && madeHere.has(gid) && gid !== 'grain') kind = 'glut';
      if (gid === 'grain' && harvestDay && trades.some((p) => p.produces === 'grain')) kind = 'harvest';

      // The same story about the same market is news at most once every 10 days (gluts: 20).
      const quiet = kind && prev.logged === kind && day - prev.day < (kind === 'glut' ? 20 : 10);
      if (kind && !quiet) {
        sim.log('market:news', {
          at: sid,
          good: gid,
          band: kind,
          price: round2(q.price),
          daysLeft: q.daysLeft === null ? null : round1(q.daysLeft),
        });
        prev.logged = kind;
        prev.day = day;
        prev.stock = q.stock;
      } else if (BAND_RANK[band] < BAND_RANK[prev.band]) {
        prev.stock = q.stock;
      }
      prev.band = band;
    }
    const h = st.hunger[sid];
    const hb = h >= 0.6 ? 'famine' : h >= 0.25 ? 'hungry' : h < 0.1 ? 'fed' : news.hunger;
    // A town hovering on a line doesn't make news every other day.
    if (hb !== news.hunger && day - (news.hungerDay ?? -99) >= 10) {
      sim.log('town:hunger', { at: sid, band: hb });
      news.hunger = hb;
      news.hungerDay = day;
    }
  }
}

// ── Lab interventions ───────────────────────────────────────────────────────

function onLabSpoil(sim, { at, good, fraction }) {
  const m = sim.state.economy.markets[at]?.[good];
  if (!m) return;
  const lost = withdraw(sim, at, good, m.stock * fraction);
  sim.log('market:disaster', { at, good, lost: round1(lost), lab: true });
}

function onLabDeliver(sim, { at, good, qty }) {
  const added = deposit(sim, at, good, qty);
  if (added) sim.log('market:windfall', { at, good, qty: added, lab: true });
}
