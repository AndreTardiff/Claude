// Residents: the named people of each settlement.
//
// Everyone has a trade (or is a dependant), a skill and a home. Production in
// the economy system is the sum of their work. When a worker dies the trade
// falls vacant; after a short delay a labourer (or, failing that, a dependant)
// takes it up as an apprentice and learns on the job.
// Step I will give these same people homes and daily schedules.

import { improvementsOf, landOf } from '../world/improvements.js';
import { GIVEN_NAMES, SURNAMES } from '../data/names.js';
import { refreshNeeds } from './economy.js';
import { residentsAt } from '../economy/people.js';
import { economyIndex } from '../economy/pricing.js';

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
    demography(sim);
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

// ── Demography: famine, migration and growth ────────────────────────────────
//
// Population follows food. Famine kills the weakest (dependants first, never the
// nobles) and drives people to better-fed towns; well-fed towns with grain to
// spare grow through births and newcomers. Floors and ceilings keep every town
// alive and bounded, so the region settles toward what its farms can feed
// instead of racing to the bottom.

// Who famine and emigration take first: dependants, then labourers, then the
// trades; food producers last; the lord's household and officials never.
const FOOD = new Set(['farmer', 'shepherd']);
const PROTECTED = new Set(['noble', 'mintmaster']); // the lord's household and officials eat whatever happens
function weakness(sim, r) {
  if (PROTECTED.has(r.profession)) return -1;
  const pool = sim.data.economy.professions[r.profession].pool;
  if (pool) return pool + 1;
  return FOOD.has(r.profession) ? 0 : 1;
}

function pickWeakest(sim, people, rng) {
  const rank = Math.max(...people.map((r) => weakness(sim, r)));
  if (rank < 0) return null;
  return rng.pick(people.filter((r) => weakness(sim, r) === rank));
}

function newName(sim, rng) {
  const used = new Set(sim.state.residents.order.map((id) => sim.state.residents.byId[id].name));
  for (let i = 0; i < 60; i++) {
    const name = `${rng.pick(GIVEN_NAMES)} ${rng.pick(SURNAMES)}`;
    if (!used.has(name)) return name;
  }
  return `${rng.pick(GIVEN_NAMES)} ${rng.pick(SURNAMES)} the Younger`;
}

function demography(sim) {
  const eco = sim.data.economy;
  const d = eco.demography;
  const hunger = sim.state.economy?.hunger;
  if (!d || !hunger) return;
  const ix = economyIndex(sim.data);
  const rng = sim.rng('demography');
  const towns = ix.markets.filter((sid) => !ix.isOutside(sid));
  const founding = (sid) => sim.graph.nodes.get(sid).residents;
  const floor = (sid) => Math.ceil(founding(sid) * d.floor);
  const ceiling = (sid) => Math.floor(founding(sid) * d.ceiling) + improvementsOf(sim, sid).homes;

  for (const sid of towns) {
    const h = hunger[sid];
    let people = residentsAt(sim, sid);

    // Famine deaths: more likely the deeper the famine and the bigger the town.
    if (h >= d.famineHunger && people.length > floor(sid)) {
      const severity = (h - 0.5) / 0.5;
      if (rng.chance(Math.min(1, (d.deathRate * severity * people.length) / 10))) {
        const victim = pickWeakest(sim, people, rng);
        if (victim) killResident(sim, { id: victim.id, cause: 'famine' });
        people = residentsAt(sim, sid);
      }
    }

    // Turning to the land: in a hungry town someone gives up their trade to farm,
    // while there are fields to spare.
    const land = landOf(sim, sid);
    const farmers = people.filter((r) => r.profession === 'farmer').length;
    if (h >= d.migrateHunger && land && farmers < land.farmers && rng.chance(d.toLandChance)) {
      const candidates = people.filter((r) => weakness(sim, r) >= 1);
      if (candidates.length) {
        const r = rng.pick(candidates);
        const was = r.profession;
        if (isTrade(sim, was)) sim.state.residents.vacancies.push({ at: sid, profession: was, since: sim.now, predecessor: r.id });
        r.profession = 'farmer';
        r.skill = eco.succession.startSkill;
        r.learning = true;
        sim.log('resident:to-the-land', { who: r.id, at: sid, was });
        refreshNeeds(sim, sid);
        people = residentsAt(sim, sid);
      }
    }

    // Migration: someone gives up on a hungry town for the best-fed one with room.
    if (h >= d.migrateHunger && people.length > floor(sid) && rng.chance(d.migrateChance)) {
      const dest = towns
        .filter((t) => t !== sid && hunger[t] < 0.1 && residentsAt(sim, t).length < ceiling(t))
        .sort((a, b) => hunger[a] - hunger[b] || (a < b ? -1 : 1))[0];
      const migrant = pickWeakest(sim, people, rng);
      if (migrant && !dest) {
        // Nowhere in the region has room: they take ship at Saltmouth for the wider world.
        if (isTrade(sim, migrant.profession)) sim.state.residents.vacancies.push({ at: sid, profession: migrant.profession, since: sim.now, predecessor: migrant.id });
        migrant.alive = false;
        migrant.diedAt = sim.now;
        migrant.cause = 'emigrated';
        sim.log('resident:emigrated', { who: migrant.id, from: sid });
        refreshNeeds(sim, sid);
      } else if (migrant) {
        const was = migrant.profession;
        if (isTrade(sim, was)) sim.state.residents.vacancies.push({ at: sid, profession: was, since: sim.now, predecessor: migrant.id });
        migrant.home = dest;
        migrant.profession = 'labourer';
        migrant.learning = false;
        sim.log('resident:migrated', { who: migrant.id, from: sid, to: dest, was });
        refreshNeeds(sim, sid);
        refreshNeeds(sim, dest);
      }
    }

    // Growth: births and newcomers where there's food to spare.
    const grain = sim.state.economy.markets[sid].grain;
    const plenty = grain.need > 0 && grain.stock / grain.need >= ix.goods.get('grain').reserveDays;
    const count = residentsAt(sim, sid).length;
    if (h < 0.1 && plenty && count < ceiling(sid)) {
      let chance = count < founding(sid) ? d.growChance * 2 : d.growChance;
      if (improvementsOf(sim, sid).growUntil > sim.now) chance *= 2; // a festival's glow
      if (rng.chance(chance)) {
        const r = {
          id: sim.nextId('r'),
          name: newName(sim, rng),
          home: sid,
          profession: 'dependant',
          skill: rng.int(700, 1100),
          learning: false,
          alive: true,
          diedAt: null,
          cause: null,
        };
        sim.state.residents.byId[r.id] = r;
        sim.state.residents.order.push(r.id);
        sim.log('resident:arrived', { who: r.id, at: sid, born: count >= founding(sid) || rng.chance(0.5) });
        refreshNeeds(sim, sid);
      }
    }
  }
}
