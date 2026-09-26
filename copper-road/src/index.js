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
