// Public entry point for the simulation core. Runs unchanged in Node and the browser.

export { Simulation, STATE_FORMAT } from './sim/simulation.js';
export { WORLD } from './data/world.js';
export { SYSTEMS } from './systems/index.js';
export { createCalendar, formatClock, formatDuration, parseClock, MINUTES_PER_DAY } from './core/calendar.js';
export { hashValue, stableStringify } from './core/hash.js';
export { Rng, getRng } from './core/rng.js';
export {
  buildGraph,
  estimateJourney,
  findPaths,
  isSettlement,
  legMinutes,
  pathExposure,
  pathKm,
  pathNodes,
  pathRoutes,
  routeOptions,
  routesLabel,
  segmentConditions,
} from './world/routes.js';
export { validateWorld } from './world/validate.js';
export { describe, seasonalRoadNotes } from './narrative/describe.js';
export { getWayfarer, tradeName } from './systems/wayfarers.js';
export { wayfarerPosition } from './view/positions.js';
export {
  economyIndex,
  estimatePurchase,
  estimateSale,
  priceAt,
  priceMultiplier,
  priceOf,
  purchaseCost,
  quote,
  saleValue,
  stockFactor,
} from './economy/pricing.js';
export { tradeOpportunities } from './economy/opportunities.js';
export { residentsAt, visitorsAt, workforce } from './economy/people.js';
export { hungerFactor, marketBand, refreshNeeds, toolFactor } from './systems/economy.js';
export { getResident, killResident, professionName } from './systems/residents.js';
export { balance, booksBalance, formatMoney, moneySupply, toBits, toMarks } from './economy/money.js';
export { belief, innOf, swapNews } from './systems/knowledge.js';
export { getRider } from './systems/post.js';
export { activeMerchants, getMerchant, tradeCandidates } from './systems/merchants.js';
export { activeBands, getBand, threatOf } from './systems/raiders.js';
export { believedDanger } from './systems/knowledge.js';
export { surpriseClosure } from './world/closures.js';
export { planJourney, tripPosition } from './world/journey.js';
export { mintStatus } from './systems/coin.js';
