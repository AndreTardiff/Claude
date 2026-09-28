// Coin: the region's money, where it comes from and where it goes.
//
// Every day, after the markets settle:
//   - the treasury pays the guards' wages into their towns' purses
//   - the Mint at Copperford buys ore from the market and strikes coin, while ore
//     is cheap enough and the lord's treasury wants filling; the ore's price goes
//     to the market, the rest (seigniorage) to the treasury
//   - resting wayfarers earn a little at odd jobs, paid by the town's households
//   - a sliver of every balance is clipped, lost or worn away
// Each new season the Crown takes its share of the treasury (money leaves the
// region), and each spring the lord collects a hearth tax from every town.
// Market payments themselves happen inside the economy's daily settlement.

import { economyIndex, quote } from '../economy/pricing.js';
import { balance, moneySupply, toBits, transfer } from '../economy/money.js';
import { residentsAt } from '../economy/people.js';
import { withdraw } from '../economy/market.js';

const HISTORY = 80;

export const coin = {
  id: 'coin',

  init(sim) {
    const c = sim.data.coin;
    const ix = economyIndex(sim.data);
    const rng = sim.rng('coin.init');
    const accounts = {};
    for (const sid of ix.markets) {
      accounts[`purse:${sid}`] = toBits(sim, c.start.purse.perHead * residentsAt(sim, sid).length);
      accounts[`till:${sid}`] = toBits(sim, c.start.till[sid] ?? 0);
    }
    accounts.treasury = toBits(sim, c.start.treasury);
    for (const id of sim.state.wayfarers?.order ?? []) {
      accounts[`wayfarer:${id}`] = toBits(sim, rng.int(c.start.wayfarer[0], c.start.wayfarer[1]));
    }
    const purse = sim.data.merchants?.purse;
    for (const id of sim.state.merchants?.order ?? []) {
      accounts[`merchant:${id}`] = toBits(sim, rng.int(purse[0], purse[1]));
    }
    sim.state.coin = {
      accounts,
      flows: { minted: 0, gifted: 0, exported: 0, crown: 0, worn: 0, hoarded: 0, imported: 0 },
      hoards: {},
      hoardedThisSeason: {},
      opening: 0,
      today: { wages: 0, unpaidWages: 0, struck: 0, fees: 0, tolls: 0 },
      mintState: undefined,
      mintReason: null,
      history: { days: [], supply: [], treasury: [] },
    };
    sim.state.coin.opening = moneySupply(sim);
  },

  daily(sim) {
    const st = sim.state.coin;
    payWages(sim);
    payOutTills(sim);
    runMint(sim);
    oddJobs(sim);
    hoard(sim);
    wearCoin(sim);
    const day = sim.cal.day(sim.now - 1);
    const h = st.history;
    h.days.push(day);
    h.supply.push(moneySupply(sim));
    h.treasury.push(balance(sim, 'treasury'));
    if (h.days.length > HISTORY) {
      h.days.shift();
      h.supply.shift();
      h.treasury.shift();
    }
    // Market fees and tolls are counted as they happen; start a fresh tally.
    st.lastDay = st.today;
    st.today = { wages: 0, unpaidWages: 0, struck: 0, fees: 0, tolls: 0 };
  },

  seasonal(sim) {
    const c = sim.data.coin;
    // Last season's buried coin, town by town.
    for (const [sid, bits] of Object.entries(sim.state.coin.hoardedThisSeason)) {
      if (bits >= toBits(sim, 10)) sim.log('coin:hoarded', { at: sid, bits });
    }
    sim.state.coin.hoardedThisSeason = {};
    // The Crown's due: a share of what the lord holds above his reserve leaves the region.
    const above = balance(sim, 'treasury') - toBits(sim, c.crownReserve);
    if (above > 0) {
      const sent = transfer(sim, 'treasury', 'crown', above * c.crownShare);
      if (sent) sim.log('coin:crown', { bits: sent });
    }
    // Hearth tax, first day of spring.
    if (sim.cal.season(sim.now).id === 'spring') {
      const ix = economyIndex(sim.data);
      let total = 0;
      for (const sid of ix.markets) {
        // A mark a head, but never more than a tenth of what the town holds.
        const due = Math.min(toBits(sim, c.hearthTax * residentsAt(sim, sid).length), balance(sim, `purse:${sid}`) * 0.1);
        total += transfer(sim, `purse:${sid}`, 'treasury', due);
      }
      if (total) sim.log('coin:hearth-tax', { bits: total });
    }
  },

  handlers: {
    'lab:coin': (sim, { at, marks }) => {
      const given = transfer(sim, 'lab', `purse:${at}`, toBits(sim, marks));
      if (given) sim.log('coin:windfall', { at, bits: given, lab: true });
    },
  },
};

function payWages(sim) {
  const c = sim.data.coin;
  const st = sim.state.coin;
  const ix = economyIndex(sim.data);
  for (const sid of ix.markets) {
    const guards = residentsAt(sim, sid).filter((r) => r.profession === 'guard').length;
    if (!guards) continue;
    const owed = toBits(sim, c.guardWage * guards);
    const paid = transfer(sim, 'treasury', `purse:${sid}`, owed);
    st.today.wages += paid;
    st.today.unpaidWages += owed - paid;
  }
  if (st.today.unpaidWages > 0 && !st.guardsUnpaid) {
    sim.log('coin:unpaid', { bits: st.today.unpaidWages });
    st.guardsUnpaid = true;
  } else if (st.today.unpaidWages === 0) {
    st.guardsUnpaid = false;
  }
}

/** Why the Mint is or isn't striking today, for the inspector and the chronicle. */
export function mintStatus(sim) {
  const m = sim.data.coin.mint;
  const masters = residentsAt(sim, m.at).filter((r) => r.profession === m.profession);
  const orePrice = quote(sim, m.at, 'ore').price;
  const limit = m.yield * m.maxOrePrice;
  const stock = sim.state.economy.markets[m.at].ore.stock;
  if (!masters.length) return { striking: false, reason: 'no mint-master', orePrice, limit };
  if (stock < 1) return { striking: false, reason: 'no ore', orePrice, limit };
  if (orePrice > limit) return { striking: false, reason: 'ore too dear', orePrice, limit };
  // The lord strikes coin to fill his treasury, not for its own sake.
  const needed = toBits(sim, m.treasuryTarget) - balance(sim, 'treasury');
  if (needed <= 0) return { striking: false, reason: 'treasury full', orePrice, limit };
  const perLoad = toBits(sim, m.yield - orePrice);
  const skill = masters.reduce((a, r) => a + r.skill / 1000, 0);
  const loads = Math.min(Math.floor(m.loadsPerDay * skill), Math.floor(stock), Math.ceil(needed / Math.max(1, perLoad)));
  return { striking: true, reason: 'striking', orePrice, limit, loads };
}

function runMint(sim) {
  const m = sim.data.coin.mint;
  const st = sim.state.coin;
  const status = mintStatus(sim);
  if (status.striking && status.loads > 0) {
    const loads = withdraw(sim, m.at, 'ore', status.loads);
    const today = sim.state.economy.today[m.at];
    if (today) today.used.ore = Math.round(((today.used.ore ?? 0) + loads) * 1000) / 1000;
    const struck = toBits(sim, m.yield * loads);
    const orePaid = Math.min(struck, toBits(sim, status.orePrice * loads));
    transfer(sim, 'mint', `till:${m.at}`, orePaid);
    transfer(sim, 'mint', 'treasury', struck - orePaid);
    st.today.struck = struck;
  }
  // The chronicle hears about the Mint when it stops for a real reason (not just
  // a full treasury) or starts again, at most once every ten days.
  const state = status.striking || status.reason === 'treasury full' ? 'working' : status.reason;
  const day = sim.cal.day(sim.now);
  if (state !== st.mintState && day - (st.mintDay ?? -99) >= 10) {
    if (st.mintState !== undefined) sim.log('coin:mint', { at: m.at, striking: state === 'working', reason: status.reason });
    st.mintState = state;
    st.mintDay = day;
  }
  st.mintReason = status.reason;
}

// Traders keep a working float; what they take in beyond it goes home to be spent.
function payOutTills(sim) {
  const c = sim.data.coin;
  for (const sid of economyIndex(sim.data).markets) {
    const excess = balance(sim, `till:${sid}`) - toBits(sim, c.start.till[sid] ?? 0);
    if (excess > 0) transfer(sim, `till:${sid}`, `purse:${sid}`, excess * c.tillPayout);
  }
}

// Coin with nothing to buy goes under the floorboards.
function hoard(sim) {
  const c = sim.data.coin;
  const st = sim.state.coin;
  for (const sid of economyIndex(sim.data).markets) {
    const excess = balance(sim, `purse:${sid}`) - toBits(sim, c.hoardAbove * residentsAt(sim, sid).length);
    if (excess <= 0) continue;
    const buried = transfer(sim, `purse:${sid}`, 'hoard', excess * c.hoardRate);
    st.hoards[sid] = (st.hoards[sid] ?? 0) + buried;
    st.hoardedThisSeason[sid] = (st.hoardedThisSeason[sid] ?? 0) + buried;
  }
}

function oddJobs(sim) {
  const pay = toBits(sim, sim.data.coin.wayfarerEarnings);
  for (const id of sim.state.wayfarers?.order ?? []) {
    const w = sim.state.wayfarers.byId[id];
    if (!w.trip && w.at) transfer(sim, `purse:${w.at}`, `wayfarer:${id}`, pay);
  }
}

function wearCoin(sim) {
  const rate = sim.data.coin.wearPerDay;
  for (const [account, bits] of Object.entries(sim.state.coin.accounts)) {
    const lost = Math.floor(bits * rate);
    if (lost > 0) transfer(sim, account, 'wear', lost);
  }
}
