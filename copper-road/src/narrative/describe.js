// Turns structured log entries into chronicle text.
//
// Log entries store ids (people, places, routes), never display names, so that
// the drifting-names system (spec §17.1) can later render the same event
// differently depending on who is telling it.

import { formatDuration } from '../core/calendar.js';
import { routesLabel } from '../world/routes.js';
import { getWayfarer, tradeName } from '../systems/wayfarers.js';
import { getResident, professionName } from '../systems/residents.js';

// What a lab "spoil" looks like in the world.
const DISASTERS = {
  grain: 'Fire in the granary',
  ore: 'The ore yard flooded',
  tools: 'Thieves broke into the tool store',
  timber: 'The woodyard burned',
  wool: 'Moth and mould got into the wool loft',
  cloth: 'The cloth hall flooded',
  salt: 'Damp ruined the salt store',
  medicine: "The apothecary's stock spoiled",
  luxuries: 'A warehouse fire',
};

const money = (x) => (x >= 100 ? Math.round(x).toString() : x >= 10 ? x.toFixed(1).replace(/\.0$/, '') : x.toFixed(2).replace(/0$/, ''));
const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

export function describe(entry, sim) {
  const place = (id) => sim.graph.nodes.get(id)?.name ?? id;
  const road = (routeIds) => routesLabel(sim.graph, routeIds);
  const who = (id) => {
    const w = getWayfarer(sim, id);
    return w ? `${w.name} the ${tradeName(sim, w)}` : id;
  };
  const seasonName = (id) => sim.cal.seasons.find((s) => s.id === id)?.name ?? id;
  const good = (gid) => sim.data.economy?.goods.find((g) => g.id === gid) ?? { name: gid, unit: 'unit', units: 'units' };
  const lower = (gid) => good(gid).name.toLowerCase();
  const person = (id) => getResident(sim, id)?.name ?? id;

  switch (entry.type) {
    case 'world:begin':
      return `The world wakes in ${seasonName(entry.season).toLowerCase()}. ${sim.data.wayfarers.count} wayfarers stir in their lodgings.`;
    case 'season:begin': {
      const effects = seasonalRoadNotes(sim, entry.season);
      return `${seasonName(entry.season)} comes to the Copper Road (Year ${entry.year}).` + (effects ? ` ${effects}` : '');
    }
    case 'wayfarer:departed':
      return `${who(entry.who)} set out from ${place(entry.from)} for ${place(entry.dest)} by the ${road(entry.via)}.`;
    case 'wayfarer:arrived':
      return `${who(entry.who)} reached ${place(entry.at)} by the ${road(entry.via)}, ${formatDuration(entry.minutes)} out of ${place(entry.from)}.`;
    case 'wayfarer:rerouted':
      return `At ${place(entry.at)}, ${who(entry.who)} found the way ahead ${entry.note ?? 'closed'} and turned for the ${road(entry.via)}.`;
    case 'wayfarer:waylaid':
      return `${who(entry.who)} is stuck at ${place(entry.at)}: ${entry.note ?? 'the road is closed'}.`;
    case 'wayfarer:stranded':
      return `${who(entry.who)} could find no open road from ${place(entry.at)} to ${place(entry.dest)}.`;
    case 'market:news': {
      const g = good(entry.good);
      const each = `${money(entry.price)} marks a ${g.unit}`;
      const days = entry.daysLeft === null ? '' : `${Math.round(entry.daysLeft)} days left`;
      switch (entry.band) {
        case 'low': return `${place(entry.at)} is running low on ${lower(entry.good)}: ${days}, ${each}.`;
        case 'out': return `${place(entry.at)} has all but run out of ${lower(entry.good)} (${each}).`;
        case 'recovered': return `${g.name} ${g.plural ? 'are' : 'is'} back in ${place(entry.at)}'s market: ${Math.round(entry.daysLeft ?? 0)} days in store, ${each}.`;
        case 'harvest':
          return (entry.daysLeft ?? 0) < 7
            ? `The harvest at ${place(entry.at)} is thin: grain still ${each}.`
            : `The harvest is in at ${place(entry.at)}: grain at ${each}, ${Math.round(entry.daysLeft)} days in store.`;
        case 'glut': return `${g.name} ${g.plural ? 'pile' : 'piles'} up unsold in ${place(entry.at)} (${each}).`;
        default: return `${g.name} in ${place(entry.at)}: ${entry.band}.`;
      }
    }
    case 'town:hunger':
      if (entry.band === 'famine') return `Famine in ${place(entry.at)}. Work slows to a crawl.`;
      if (entry.band === 'hungry') return `Hunger in ${place(entry.at)}: bread is short and tempers shorter.`;
      return `${place(entry.at)} eats again.`;
    case 'resident:died': {
      const prof = professionName(sim, entry.profession);
      const how = entry.cause === 'lab' ? ', struck down by the experimenter' : '';
      return `${person(entry.who)}, ${prof} of ${place(entry.at)}, has died${how}.`;
    }
    case 'resident:succeeded': {
      const prof = professionName(sim, entry.profession);
      return `${person(entry.who)}, once ${article(professionName(sim, entry.was))} ${professionName(sim, entry.was)}, takes up ${person(entry.predecessor)}'s trade as ${article(prof)} ${prof} in ${place(entry.at)}.`;
    }
    case 'market:disaster': {
      const g = good(entry.good);
      return `${DISASTERS[entry.good] ?? 'Disaster'} at ${place(entry.at)}: ${Math.round(entry.lost)} ${g.units} of ${lower(entry.good)} lost.`;
    }
    case 'market:windfall': {
      const g = good(entry.good);
      return `A cart nobody ordered delivers ${Math.round(entry.qty)} ${g.units} of ${lower(entry.good)} to ${place(entry.at)}.`;
    }
    default:
      return `${entry.type}`;
  }
}

/** "The High Pass is snowbound." — one sentence per route affected this season. */
export function seasonalRoadNotes(sim, seasonId) {
  const seen = new Map();
  for (const seg of sim.graph.segments.values()) {
    const mod = seg.seasonal?.[seasonId];
    if (!mod) continue;
    const routeName = sim.graph.routes.get(seg.route)?.name ?? seg.route;
    const text = mod.closed ? `the ${routeName} is ${mod.note ?? 'closed'}` : `the ${routeName}: ${mod.note ?? 'slow going'}`;
    if (!seen.has(routeName)) seen.set(routeName, text);
  }
  if (!seen.size) return '';
  const parts = [...seen.values()];
  const sentence = parts.join('; ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}
