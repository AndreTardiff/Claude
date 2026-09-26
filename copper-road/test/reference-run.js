// The canonical determinism check shared by the tests, the reference tool and the lab.
import { Simulation } from '../src/index.js';

export const REFERENCE = { seed: 1, days: 100 };

export function referenceRun({ seed = REFERENCE.seed, days = REFERENCE.days } = {}) {
  const sim = new Simulation({ seed });
  sim.runDays(days);
  return { seed, days, ticks: sim.state.tick, hash: sim.hash() };
}
