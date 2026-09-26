// Residents: the named people of each settlement.
//
// Everyone has a trade (or is a dependant), a skill and a home. Production in
// the economy system is the sum of their work. When a worker dies the trade
// falls vacant; after a short delay a labourer (or, failing that, a dependant)
// takes it up as an apprentice and learns on the job.
// Step I will give these same people homes and daily schedules.

import { GIVEN_NAMES, SURNAMES } from '../data/names.js';
import { refreshNeeds } from './economy.js';
import { residentsAt } from '../economy/people.js';

const DAY = 1440;

export const residents = {
  id: 'residents',

  init(sim) {
    const eco = sim.data.economy;
    const rng = sim.rng('residents.init');
    // Every "Given Surname" pairing, shuffled, handed out in order: no duplicates.
    const pairs = [];
    for (let i = 0; i < GIVEN_NAMES.length * SURNAMES.length; i++) pairs.push(i);
    rng.shuffle(pairs);
    let next = 0;
    const st = (sim.state.residents = { byId: {}, order: [], vacancies: [] });
    for (const node of sim.data.nodes) {
      if (node.kind === 'waypoint') continue;
      for (const [profession, count] of Object.entries(eco.populations[node.id])) {
        for (let i = 0; i < count; i++) {
          const p = pairs[next++ % pairs.length];
          const r = {
            id: sim.nextId('r'),
            name: `${GIVEN_NAMES[Math.floor(p / SURNAMES.length)]} ${SURNAMES[p % SURNAMES.length]}`,
            home: node.id,
            profession,
            skill: rng.int(700, 1100), // permille: 1000 is an average worker
            learning: false,
            alive: true,
            diedAt: null,
            cause: null,
          };
          st.byId[r.id] = r;
          st.order.push(r.id);
        }
      }
    }
  },

  daily(sim) {
    learn(sim);
    fillVacancies(sim);
  },

  handlers: {
    'lab:death': onLabDeath,
  },
};

export function getResident(sim, id) {
  return sim.state.residents?.byId[id];
}

export function professionName(sim, pid, plural = false) {
  const p = sim.data.economy.professions[pid];
  return (plural ? p?.plural : p?.name) ?? pid;
}

const isTrade = (sim, pid) => !sim.data.economy.professions[pid]?.pool;

function learn(sim) {
  const { learnPerDay, trainedSkill } = sim.data.economy.succession;
  for (const id of sim.state.residents.order) {
    const r = sim.state.residents.byId[id];
    if (!r.alive || !r.learning) continue;
    r.skill = Math.min(trainedSkill, r.skill + learnPerDay);
    if (r.skill >= trainedSkill) r.learning = false;
  }
}

function fillVacancies(sim) {
  const st = sim.state.residents;
  const { delayDays, startSkill } = sim.data.economy.succession;
  const professions = sim.data.economy.professions;
  const remaining = [];
  for (const v of st.vacancies) {
    if (sim.now - v.since < delayDays * DAY) {
      remaining.push(v);
      continue;
    }
    // Prefer labourers (pool 1), then dependants (pool 2).
    const pool = residentsAt(sim, v.at).filter((r) => professions[r.profession].pool);
    if (!pool.length) {
      remaining.push(v);
      continue;
    }
    const rank = Math.min(...pool.map((r) => professions[r.profession].pool));
    const candidates = pool.filter((r) => professions[r.profession].pool === rank);
    const heir = sim.rng('succession').pick(candidates);
    const was = heir.profession;
    heir.profession = v.profession;
    heir.skill = startSkill;
    heir.learning = true;
    sim.log('resident:succeeded', { who: heir.id, at: v.at, profession: v.profession, was, predecessor: v.predecessor });
    refreshNeeds(sim, v.at);
  }
  st.vacancies = remaining;
}

/** Kill a resident: by id, or a random living worker of a trade in a settlement. */
export function killResident(sim, { id, at, profession, cause = 'lab' }) {
  let r = id ? getResident(sim, id) : null;
  if (!r) {
    const candidates = residentsAt(sim, at).filter((x) => x.profession === profession);
    if (!candidates.length) return null;
    r = sim.rng('lab').pick(candidates);
  }
  if (!r.alive) return null;
  r.alive = false;
  r.diedAt = sim.now;
  r.cause = cause;
  if (isTrade(sim, r.profession)) {
    sim.state.residents.vacancies.push({ at: r.home, profession: r.profession, since: sim.now, predecessor: r.id });
  }
  sim.log('resident:died', { who: r.id, at: r.home, profession: r.profession, cause, lab: cause === 'lab' });
  refreshNeeds(sim, r.home);
  return r;
}

function onLabDeath(sim, data) {
  killResident(sim, { ...data, cause: 'lab' });
}
