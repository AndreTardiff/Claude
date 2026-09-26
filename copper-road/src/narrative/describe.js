// Turns structured log entries into chronicle text.
//
// Log entries store ids (people, places, routes), never display names, so that
// the drifting-names system (spec §17.1) can later render the same event
// differently depending on who is telling it.

import { formatDuration } from '../core/calendar.js';
import { routesLabel } from '../world/routes.js';
import { getWayfarer, tradeName } from '../systems/wayfarers.js';

export function describe(entry, sim) {
  const place = (id) => sim.graph.nodes.get(id)?.name ?? id;
  const road = (routeIds) => routesLabel(sim.graph, routeIds);
  const who = (id) => {
    const w = getWayfarer(sim, id);
    return w ? `${w.name} the ${tradeName(sim, w)}` : id;
  };
  const seasonName = (id) => sim.cal.seasons.find((s) => s.id === id)?.name ?? id;

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
