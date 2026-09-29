// Turns structured log entries into chronicle text.
//
// Log entries store ids (people, places, routes), never display names, so that
// the drifting-names system (spec §17.1) can later render the same event
// differently depending on who is telling it.

import { formatDuration } from '../core/calendar.js';
import { routesLabel } from '../world/routes.js';
import { getWayfarer, tradeName } from '../systems/wayfarers.js';
import { getResident, professionName } from '../systems/residents.js';
import { formatMoney, toBits } from '../economy/money.js';
import { getRider } from '../systems/post.js';
import { getMerchant } from '../systems/merchants.js';
import { getBand } from '../systems/raiders.js';
import { itemById, itemLabel, mercName } from '../systems/mercs.js';

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


const COMMISSION = {
  cloth: ['liveries for his household', 'weavers'],
  tools: ['the garrison armoury', 'smiths'],
  timber: ['repairs at the castle', 'woodcutters'],
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

export function describe(entry, sim) {
  const bandName = (id) => getBand(sim, id)?.name ?? 'a band of outlaws';
  // Where a band was when it happened (bands move), falling back to where it is now.
  const hideout = (id) => sim.data.raiders?.hideouts.find((h) => h.id === (entry.hideout ?? getBand(sim, id)?.hideout))?.name ?? 'the hills';
  const segRoad = (segId) => sim.graph.routes.get(sim.graph.segments.get(segId)?.route)?.name ?? segId;
  const WORKS = (id) => sim.data.lord?.works.find((w) => w.id === id)?.name ?? id;
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
  const trader = (id) => getMerchant(sim, id)?.name ?? id;
  const you = () => sim.state.player?.name ?? 'The player';
  // "12 sacks of grain", "1 sack of grain", "15 tools".
  const amount = (qty, gid) => {
    const g = good(gid);
    const n = Math.max(1, Math.round(qty));
    const units = n === 1 ? g.unit : g.units;
    return g.units.toLowerCase() === g.name.toLowerCase() ? `${n} ${units}` : `${n} ${units} of ${lower(gid)}`;
  };
  const house = (id) => getMerchant(sim, id)?.house ?? id;
  const days = (d) => (d < 1.5 ? 'a day' : `${Math.round(d)} days`);

  switch (entry.type) {
    case 'world:begin':
      return `The world wakes in ${seasonName(entry.season).toLowerCase()}. ${sim.data.wayfarers.count} wayfarers stir in their lodgings.`;
    case 'season:begin': {
      const effects = seasonalRoadNotes(sim, entry.season);
      return `${seasonName(entry.season)} comes to the Copper Road (Year ${entry.year}).` + (effects ? ` ${effects}` : '');
    }
    case 'wayfarer:departed':
      return `${who(entry.who)} set out from ${place(entry.from)} for ${place(entry.dest)} by the ${road(entry.via)}` +
        (entry.good ? `, with ${amount(entry.qty, entry.good)} in the pack.` : '.');
    case 'wayfarer:peddled':
      return `${who(entry.who)} sells ${amount(entry.qty, entry.good)} in ${place(entry.at)} for ${formatMoney(sim, entry.bits)}` +
        (entry.profit >= 0 ? ` (${formatMoney(sim, entry.profit)} to the good).` : `, ${formatMoney(sim, -entry.profit)} less than it cost.`);
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
      const each = `${sim.data.coin ? formatMoney(sim, toBits(sim, entry.price)) : entry.price.toFixed(2) + ' marks'} a ${g.unit}`;
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
      const how = entry.cause === 'lab' ? ', struck down by the experimenter' : entry.cause === 'famine' ? ' of hunger'
        : entry.cause === 'raid' ? ', killed by raiders on the road with a caravan' : '';
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
    case 'resident:migrated':
      return `${person(entry.who)}, once ${article(professionName(sim, entry.was))} ${professionName(sim, entry.was)}, gives up on hungry ${place(entry.from)} and walks to ${place(entry.to)} to find work.`;
    case 'resident:emigrated':
      return `${person(entry.who)} gives up on hungry ${place(entry.from)} and takes ship at Saltmouth for the wider world.`;
    case 'resident:to-the-land':
      return sim.data.economy.professions[entry.was]?.pool
        ? `In hungry ${place(entry.at)}, ${person(entry.who)} goes out to work the fields.`
        : `In hungry ${place(entry.at)}, ${person(entry.who)} puts down the ${professionName(sim, entry.was)}'s tools and turns to the land.`;
    case 'resident:arrived':
      return entry.born ? `A child is born in ${place(entry.at)}: ${person(entry.who)}.` : `Newcomers settle in well-fed ${place(entry.at)}: ${person(entry.who)} and family.`;
    case 'coin:crown':
      return `Lord Aldric sends the Crown its due: ${formatMoney(sim, entry.bits)} ride out of the region under guard.` +
        (entry.short > 0 ? ` He is ${formatMoney(sim, entry.short)} short, and the Crown will remember it.` : '');
    case 'coin:hearth-tax':
      return `The spring hearth tax is gathered: ${formatMoney(sim, entry.bits)} for Lord Aldric's treasury.`;
    case 'coin:unpaid':
      return `Lord Aldric's treasury is empty and his guards go unpaid.`;
    case 'coin:mint':
      if (entry.striking) return `The Mint at ${place(entry.at)} is striking coin again.`;
      return `The Mint at ${place(entry.at)} falls silent: ${entry.reason === 'ore too dear' ? 'ore costs too much to strike' : entry.reason === 'no ore' ? 'there is no ore to strike' : 'there is no mint-master'}.`;
    case 'coin:hoarded':
      return `With little worth buying, ${place(entry.at)}'s households buried ${formatMoney(sim, entry.bits)} under their floors this season.`;
    case 'coin:windfall':
      return `A purse nobody claims turns up in ${place(entry.at)}: ${formatMoney(sim, entry.bits)} for its households.`;
    case 'post:arrived': {
      const rider = getRider(sim, entry.who)?.name ?? entry.who;
      return entry.letters
        ? `${rider} of the lord's post rides into ${place(entry.at)} from ${place(entry.from)} with fresh prices from ${entry.letters} market${entry.letters === 1 ? '' : 's'}.`
        : `${rider} of the lord's post rides into ${place(entry.at)} from ${place(entry.from)}; no news the inn hasn't already heard.`;
    }
    case 'merchant:departed': {
      const hope = entry.expected > 0 ? `counting on ${formatMoney(sim, entry.expected)} profit` : 'hoping to break even';
      const news = entry.ageDays < 0.5 ? 'fresh news' : `news ${days(entry.ageDays)} old`;
      const guards = entry.guards?.length ? `, ${entry.guards.length === 1 ? `${mercName(sim, entry.guards[0])} riding guard` : `${entry.guards.length} sellswords riding guard`}` : '';
      return `${trader(entry.who)} leaves ${place(entry.from)} for ${place(entry.to)} by the ${road(entry.via)} with ${amount(entry.qty, entry.good)}${guards}, ${hope} on ${news}.`;
    }
    case 'merchant:sold': {
      if (entry.dumped) {
        return `${trader(entry.who)} lets the last of the ${lower(entry.good)} go in ${place(entry.at)} for whatever it fetches: ` +
          (entry.profit < 0 ? `a loss of ${formatMoney(sim, -entry.profit)} on the venture.` : `still ${formatMoney(sim, entry.profit)} up on the venture.`);
      }
      const sale = `${trader(entry.who)} sells ${amount(entry.qty, entry.good)} in ${place(entry.at)} for ${formatMoney(sim, entry.sold)}` +
        (entry.lost > 0.05 ? `, the rest (${amount(entry.lost, entry.good)}) lost to robbers on the road` : '');
      if (entry.profit < 0) return `${sale}: a loss of ${formatMoney(sim, -entry.profit)} on news ${days(entry.ageDays)} old.`;
      const hoped = entry.expected > 0 ? ` (hoped for ${formatMoney(sim, entry.expected)})` : '';
      return `${sale}: ${formatMoney(sim, entry.profit)} profit${hoped}.`;
    }
    case 'merchant:unsold':
      return `${place(entry.at)}'s traders can't pay for all of ${trader(entry.who)}'s ${lower(entry.good)}: ${amount(entry.qty, entry.good)} stay unsold.`;
    case 'merchant:moving':
      return entry.good
        ? `${trader(entry.who)} takes the unsold ${lower(entry.good)} on to ${place(entry.to)}.`
        : `Finding no trade worth the road in ${place(entry.from)}, ${trader(entry.who)} moves on to ${place(entry.to)} with empty wagons.`;
    case 'merchant:ruined':
      return `The house of ${house(entry.who)} is ruined: ${trader(entry.who)} pays off the last of the crew and goes home to ${place(getMerchant(sim, entry.who)?.home)}.`;
    case 'merchant:founded':
      if (entry.peddler) return `${who(entry.peddler)} has saved enough to trade the pack for a wagon: ${trader(entry.who)} founds the house of ${house(entry.who)} in ${place(entry.at)}.`;
      return `${place(entry.at)}'s households put ${formatMoney(sim, entry.bits)} behind a new trading house: ${trader(entry.who)} hitches a wagon.`;
    case 'merchant:expanded':
      return `Business is good for the house of ${house(entry.who)}: ${trader(entry.who)} buys a wagon from ${place(entry.at)}'s wheelwrights (${entry.wagons} now).`;
    case 'merchant:order':
      return `${trader(entry.who)} delivers ${amount(entry.qty, entry.good)} to ${place(entry.at)} on Lord Aldric's order, and the treasury pays ${formatMoney(sim, entry.bits)}.`;
    case 'lord:order':
      return `Lord Aldric's criers proclaim it: the treasury will pay ${formatMoney(sim, toBits(sim, entry.price))} a ${good(entry.good).unit} for up to ${amount(entry.qty, entry.good)} brought to hungry ${place(entry.at)}.`;
    case 'lord:order-closed':
      return entry.delivered >= entry.qty - 0.05
        ? `Lord Aldric's order is filled: ${amount(entry.delivered, entry.good)} reached ${place(entry.at)} for ${formatMoney(sim, entry.bits)}.`
        : entry.delivered > 0
          ? `Lord Aldric's order for ${place(entry.at)} lapses with ${amount(entry.delivered, entry.good)} of ${amount(entry.qty, entry.good)} delivered.`
          : `Nobody answered Lord Aldric's call for ${lower(entry.good)} in ${place(entry.at)}; the order lapses.`;
    case 'lord:commission':
      return `Lord Aldric buys ${amount(entry.qty, entry.good)} from ${place(entry.at)} for ${COMMISSION[entry.good]?.[0] ?? 'his household'} (${formatMoney(sim, entry.bits)}), and its ${COMMISSION[entry.good]?.[1] ?? 'makers'} are glad of the work.`;
    case 'lord:festival':
      return `Lord Aldric throws a festival in ${place(entry.at)}: bread, ale and music at the treasury's cost (${formatMoney(sim, entry.bits)}). Nobody goes to bed hungry tonight.`;
    case 'lord:works-begun':
      return `Lord Aldric orders ${WORKS(entry.work)} built in ${place(entry.at)}. Labourers are hired and timber sent for.`;
    case 'lord:saving':
      return `Lord Aldric has set his heart on ${WORKS(entry.work)} for ${place(entry.at)}, and puts coin aside for it.`;
    case 'lord:works-done':
      return `${cap(WORKS(entry.work))} ${sim.data.lord.works.find((w) => w.id === entry.work)?.plural ? 'stand' : 'stands'} finished in ${place(entry.at)}, at a cost of ${formatMoney(sim, entry.bits)} to the treasury.`;
    case 'lord:works-abandoned':
      return `Work on ${WORKS(entry.work)} in ${place(entry.at)} is given up for want of materials.`;
    case 'lord:skimmed':
      return `The accounts at the castle don't add up: someone has had their fingers in Lord Aldric's treasury, ${formatMoney(sim, entry.bits)} this season.`;
    case 'merchant:lost':
      return `${trader(entry.who)} writes off the ${lower(entry.good)} venture: a loss of ${formatMoney(sim, -entry.profit)}.`;
    case 'raid:recruit': {
      const r = getResident(sim, entry.who);
      const why = entry.hunger >= 0.35 ? `with nothing left in hungry ${place(entry.from)}` : entry.poverty >= 0.6 ? `with nothing left in penniless ${place(entry.from)}` : `out of work in ${place(entry.from)}`;
      const was = professionName(sim, r?.was ?? 'labourer');
      return entry.founded
        ? `${person(entry.who)}, ${article(was)} ${was} ${why}, takes to the hills and gathers a band at ${hideout(entry.band)}.`
        : `${person(entry.who)}, ${article(was)} ${was} ${why}, goes off to join ${bandName(entry.band)}.`;
    }
    case 'raid:drifter':
      return entry.founded
        ? `A stranger calling themselves ${person(entry.who)} turns up in ${hideout(entry.band)} and starts gathering a band.`
        : `A stranger calling themselves ${person(entry.who)} turns up at ${hideout(entry.band)} and joins ${bandName(entry.band)}.`;
    case 'raid:moved':
      return `${cap(bandName(entry.band))} ${bandName(entry.band).startsWith('the') ? 'move' : 'moves'} their lookouts to the ${segRoad(entry.to)}.`;
    case 'raid:encounter':
      return encounterText(entry, { place, person, bandName, segRoad, amount, sim });
    case 'raid:ransomed': {
      const by = entry.payer === 'house' ? 'the house pays' : entry.payer === 'lord' ? 'Lord Aldric pays' : `${place(getMerchant(sim, entry.who)?.home)}'s households club together to pay`;
      return `${trader(entry.who)} is set free by ${bandName(entry.band)}: ${by} a ransom of ${formatMoney(sim, entry.bits)}.`;
    }
    case 'raid:released':
      return `${cap(bandName(entry.band))} let ${trader(entry.who)} go without a ransom, penniless, to walk home.`;
    case 'raid:captive-killed':
      return `No ransom came for ${trader(entry.who)}, and ${bandName(entry.band)} don't keep captives they can't sell. The house of ${house(entry.who)} is ended.`;
    case 'raid:disbanded':
      if (entry.why === 'wiped out') return `${cap(bandName(entry.band))} is wiped out.`;
      if (entry.why === 'too few') return `The last of ${bandName(entry.band)} give up the road${entry.home ? ' and drift back to the towns' : ''}.`;
      return `Starving, ${bandName(entry.band)} breaks up.` +
        (entry.home ? ` ${entry.home === 1 ? 'One of them drifts' : `${entry.home} of them drift`} back to the towns to look for work.` : '') +
        (entry.buried ? ' What coin they had stays buried in the hills.' : '');
    case 'raid:fenced': {
      const g = good(entry.good);
      return `Stolen ${lower(entry.good)} turns up cheap in ${place(entry.at)}: ${amount(entry.qty, entry.good)} sold through a fence for ${formatMoney(sim, entry.bits)}, no questions asked.`;
    }
    case 'raid:town':
      return entry.success
        ? `Starving, ${bandName(entry.band)} fall on ${place(entry.at)} in the night and carry off ${amount(entry.grain, 'grain')}${entry.bits ? ` and ${formatMoney(sim, entry.bits)} from the traders` : ''}.` +
          (entry.dead ? ` ${person(entry.dead)} is killed trying to stop them.` : '')
        : `Starving, ${bandName(entry.band)} try to raid ${place(entry.at)} and are beaten off${entry.outlaws ? `, leaving ${entry.outlaws === 1 ? 'one' : entry.outlaws} dead` : ''}.`;
    case 'raid:unearthed': {
      const where = sim.data.raiders?.hideouts.find((h) => h.id === entry.place)?.name ?? 'the hills';
      return `${person(entry.who)} of ${place(entry.at)} turns up a buried pot near ${where}: ${formatMoney(sim, entry.bits)} of outlaws' coin.`;
    }
    case 'raid:relocated': {
      const to = sim.data.raiders?.hideouts.find((h) => h.id === entry.to)?.name ?? 'new hills';
      return `With nothing on their roads, ${bandName(entry.band)} move to ${to}.`;
    }
    case 'raid:patrol-clash': {
      const r = sim.graph.routes.get(entry.route)?.name ?? entry.route;
      return entry.guardsWin
        ? `Lord Aldric's patrol runs down ${bandName(entry.band)} on the ${r}: ${entry.outlaws === 1 ? 'one outlaw' : `${entry.outlaws} outlaws`} will rob no more.${entry.bounty ? ` The bounty pays ${formatMoney(sim, entry.bounty)}.` : ''}${harmText(entry.guardHarm, sim)}`
        : `${cap(bandName(entry.band))} ambush Lord Aldric's patrol on the ${r}${entry.guard ? `; ${person(entry.guard)}, a guard, is killed` : ''}.${harmText(entry.guardHarm, sim)}`;
    }
    case 'weather:closed': {
      const ev = sim.data.weather?.events.find((x) => x.id === entry.event);
      const road = sim.graph.routes.get(sim.graph.segments.get(ev?.segments[0])?.route)?.name ?? 'road';
      return `Without warning, ${ev?.note ?? 'the road is shut'} at ${place(entry.at)}: the ${road} is closed for now.`;
    }
    case 'weather:opened': {
      const ev = sim.data.weather?.events.find((x) => x.id === entry.event);
      const road = sim.graph.routes.get(sim.graph.segments.get(ev?.segments[0])?.route)?.name ?? 'road';
      return `The ${road} is open again at ${place(entry.at)}.`;
    }
    case 'camp:formed': {
      const names = entry.people.map((p) => campName(sim, p));
      return `Stranded at ${place(entry.at)}, ${listOf(names)} make camp together and wait for the road.`;
    }
    case 'camp:dispersed':
      return `The camp at ${place(entry.at)} breaks up as the road opens. A cold hearth is left behind; travellers will call it ${entry.name}.`;
    case 'camp:waystation':
      return `After ${entry.days} days stranded at ${place(entry.at)}, not everyone moves on: someone stays to sell beds and bread to travellers. ${entry.name} is open.`;
    case 'camp:waystation-closed':
      return `Nobody stops at ${entry.name} any more; the waystation at ${place(entry.at)} stands empty.`;
    case 'camp:fireside': {
      const where = entry.at ? `at ${place(entry.at)}` : `on the ${sim.graph.routes.get(sim.graph.segments.get(entry.seg)?.route)?.name ?? 'road'}`;
      const band = entry.band;
      return `Around a campfire ${where}, ${campName(sim, { id: entry.hearer })} hears from ${campName(sim, { id: entry.teller })} of ${band ? bandName(band) : 'bandits'} on the ${sim.graph.routes.get(sim.graph.segments.get(entry.road)?.route)?.name ?? 'road'}.`;
    }
    case 'lord:patrol':
      return `Lord Aldric sends ${entry.guards} guards to ride the ${sim.graph.routes.get(entry.route)?.name ?? entry.route} for ${entry.days} days.`;
    case 'lord:patrol-home':
      return `Lord Aldric's patrol comes home from the ${sim.graph.routes.get(entry.route)?.name ?? entry.route}.`;
    case 'raid:summoned':
      return `The experimenter sends outlaws into ${hideout(entry.band)}: ${bandName(entry.band)} now counts ${entry.members}.`;
    case 'merc:recruit':
      return `${mercName(sim, entry.who)} of ${place(entry.at)} takes up the sword: one more sellsword for hire.`;
    case 'merc:retired':
      return `${mercName(sim, entry.who)} hangs up the sword in ${place(entry.at)}${entry.why === 'broke' ? ', out of work and out of coin' : ', old wounds aching'}.`;
    case 'merc:rank': {
      const rank = sim.data.mercs.ranks[entry.rank]?.name ?? entry.rank;
      return `${mercName(sim, entry.who)} is reckoned ${rank} now${entry.stat ? `, ${STAT_GROWTH[entry.stat]}` : ''}.`;
    }
    case 'merc:trait':
      return `${mercName(sim, entry.who)} ${TRAIT_TEXT[entry.trait] ?? `has become ${entry.trait}`}.`;
    case 'merc:fame': {
      const where = ['They have started to speak of', 'At every inn on the road they tell stories of', 'There are songs now about'][entry.level];
      return `${where} ${mercName(sim, entry.who)}.`;
    }
    case 'raid:infamy': {
      const b = cap(bandName(entry.band));
      return [`${b} have a name on the roads now.`, `${b} are feared the length of the Copper Road.`, `Mothers frighten children with tales of ${bandName(entry.band)}.`][entry.level];
    }
    case 'merc:pair':
      return `${mercName(sim, entry.who)} and ${mercName(sim, entry.with)} have stood together often enough to trust each other with their backs: a Trusted Pair.`;
    case 'merc:bought':
      return `${mercName(sim, entry.who)} buys ${itemLabel(sim, itemById(sim, entry.item), { owner: false })} in ${place(entry.at)}.`;
    case 'item:tier': {
      const item = itemById(sim, entry.item);
      const tier = sim.data.mercs.item.tiers[entry.tier];
      if (item?.name && entry.tier === sim.data.mercs.item.nameAt) return `${itemLabel(sim, item, { named: false })} has seen enough that people have a name for it: ${item.name}.`;
      return `${cap(itemLabel(sim, item))} is ${tier.name} now${tier.id === 'legendary' ? ': they tell stories about it in the inns' : ''}.`;
    }
    case 'item:taken':
      return `${cap(bandName(entry.band))} take ${itemLabel(sim, itemById(sim, entry.item), { owner: false })} from ${mercName(sim, entry.from)}'s body.`;
    case 'item:recovered':
      return `${cap(itemLabel(sim, itemById(sim, entry.item), { owner: false }))} comes back to ${place(entry.at)} on a caravan's wagons.`;
    case 'lord:sets-out': {
      const escort = entry.escort?.length ? `, ${entry.escort.length === 1 ? `${mercName(sim, entry.escort[0])} riding escort` : `${entry.escort.length} sellswords riding escort`}` : '';
      const what = entry.trip === 'hunt' ? `rides out to hunt in ${place(entry.to)}`
        : entry.trip === 'ships' ? `rides to ${place(entry.to)} to see the ships`
          : entry.trip === 'ride' ? `rides out with his patrol down the ${sim.graph.routes.get(entry.route)?.name ?? 'road'}, bound for ${place(entry.to)}`
            : `sets out to see ${place(entry.to)} for himself`;
      return `Lord Aldric ${what}, with ${entry.household} of his household${escort}.`;
    }
    case 'lord:visit': {
      if (entry.port) return `Lord Aldric rides into ${place(entry.at)} at the head of his patrol, and the harbour watches him go by.`;
      const saw = entry.hunger >= 0.25 ? 'finds it hungry' : entry.hunger >= 0.1 ? 'finds bread short' : 'finds it well fed';
      const news = Math.abs(entry.hunger - entry.believed) >= 0.15 ? (entry.hunger > entry.believed ? ', worse than the letters said' : ', better than the letters said') : '';
      return `Lord Aldric rides into ${place(entry.at)} and ${saw}${news}.${entry.alms ? ` He gives ${formatMoney(sim, entry.alms)} in alms.` : ''}`;
    }
    case 'lord:ships':
      return `At ${place(entry.at)}, Lord Aldric looks over the ships and buys ${formatMoney(sim, entry.bits)} of fine things from the Outside.`;
    case 'lord:hunt':
      return entry.result === 'glory' ? `Lord Aldric brings down a great stag in ${place(entry.at)}; they'll talk of it at his table all season.`
        : entry.result === 'hurt' ? `Lord Aldric is thrown from his horse hunting in ${place(entry.at)}, and will keep to his bed for ${entry.days} days.`
          : `Lord Aldric hunts in ${place(entry.at)} and comes back with nothing but mud.`;
    case 'lord:lab-trip':
      return `The experimenter sends Lord Aldric to ${place(entry.to)}.`;
    case 'lord:home':
      return `Lord Aldric is home at Kingscross after ${entry.days} day${entry.days === 1 ? '' : 's'} away.`;
    case 'lord:freed': {
      if (entry.how === 'escaped') return `With ${bandName(entry.band)} broken up, Lord Aldric walks free and comes home in a black mood.`;
      const who = entry.how === 'treasury' ? 'his steward pays' : "Kingscross's households are made to pay";
      return `Lord Aldric is ransomed: ${who} ${formatMoney(sim, entry.bits)} to ${bandName(entry.band)}.${entry.bounty ? ` He puts a price of ${entry.bounty} marks on every head of theirs.` : ''}`;
    }
    case 'merchant:orders':
      if (entry.why === 'time') return `With the roads quiet for a while, ${trader(entry.who)} goes back to the house's old standing orders: ${ORDER_WORDS[entry.to]}.`;
      if (entry.why === 'their guards beat a band off') return `Now that their guards have beaten a band off, ${trader(entry.who)} changes the house's standing orders: ${ORDER_WORDS[entry.to]}.`;
      return `After being ${entry.why === 'taken for ransom' ? 'taken for ransom' : 'badly beaten on the road'}, ${trader(entry.who)} changes the house's standing orders: ${ORDER_WORDS[entry.to]}${entry.outnumbered ? `, and give way to any band ${entry.outnumbered} times their strength` : ''}.`;
    // ── The player (step G) ──
    case 'player:inherits':
      return `${entry.parent} is dead. ${entry.who} inherits the family stall in ${place(entry.at)}, ${entry.porter ? `old ${person(entry.porter)} the porter, ` : ''}and a note for ${formatMoney(sim, entry.debt)} owed to the money-changer.`;
    case 'player:letter':
      return `A letter reaches the family stall from ${entry.from}, with word of prices in ${place(entry.at)}.`;
    case 'player:bought':
      return `${you()} buys ${amount(entry.qty, entry.good)} in ${place(entry.at)} for ${formatMoney(sim, entry.bits)}.`;
    case 'player:sold':
      if (entry.by === 'factor') return `The family's factor in ${place(entry.at)} sells ${amount(entry.qty, entry.good)} for ${formatMoney(sim, entry.bits)}.`;
      return `${you()} sells ${amount(entry.qty, entry.good)} in ${place(entry.at)} for ${formatMoney(sim, entry.bits)}${entry.profit ? `: ${entry.profit >= 0 ? `${formatMoney(sim, entry.profit)} over cost` : `${formatMoney(sim, -entry.profit)} under cost`}` : ''}.`;
    case 'player:dispatched': {
      const load = entry.qty ? `${amount(entry.qty, entry.good)}` : 'empty wagons';
      const guards = entry.guards?.length ? `, ${entry.guards.length === 1 ? `${mercName(sim, entry.guards[0])} riding guard` : `${entry.guards.length} sellswords riding guard`}` : '';
      return `The ${sim.state.player?.family ?? ''} caravan leaves ${place(entry.from)} for ${place(entry.to)} by the ${road(entry.via)} with ${load}${guards}${entry.ride ? `, and ${you()} rides with it` : ''}.`;
    }
    case 'player:travels':
      return `${you()} rides out of ${place(entry.from)} for ${place(entry.to)} by the ${road(entry.via)}.`;
    case 'player:arrived':
      return `${you()} arrives in ${place(entry.at)}.`;
    case 'player:caravan-sold':
      return `The ${sim.state.player?.family ?? ''} caravan sells ${amount(entry.qty, entry.good)} in ${place(entry.at)} for ${formatMoney(sim, entry.bits)}${entry.left ? `; ${amount(entry.left, entry.good)} nobody could pay for` : ''}.`;
    case 'player:factor':
      return `${you()} hires ${person(entry.who)} as the family's factor in ${place(entry.at)}.`;
    case 'player:factor-gone':
      return `${person(entry.who)} is no longer the family's factor in ${place(entry.at)} (${entry.why === 'unpaid' ? 'not paid for days' : entry.why === 'gone' ? 'gone from the town' : 'dismissed'}).`;
    case 'player:wagon-sold':
      return `${you()} sells a wagon back to the wheelwrights of ${place(entry.at)} for ${formatMoney(sim, entry.bits)}.`;
    case 'player:caravan-home':
      return `The family wagons are back in the yard at ${place(entry.at)}.`;
    case 'player:courier':
      return `${you()} pays a courier ${formatMoney(sim, entry.bits)} to ride to ${place(entry.to)}${entry.caravan ? ' with orders for the caravan' : ''}.`;
    case 'player:orders-delivered':
      return `In ${place(entry.at)}, the courier finds the family caravan and hands over the orders.`;
    case 'player:orders-undelivered':
      return `The courier waits in ${place(entry.at)}, but the family caravan never comes; the orders go home undelivered.`;
    case 'player:courier-home':
      if (entry.report) return entry.robbed ? `The factor's letter from ${place(entry.report)} never arrives: the courier was robbed.` : `A letter from the family's factor in ${place(entry.report)} reaches ${place(entry.at)}.`;
      return entry.robbed ? `The courier limps home to ${place(entry.at)}: robbed on the road, the letters gone.` : `The courier is back in ${place(entry.at)} with ${entry.letters} letter${entry.letters === 1 ? '' : 's'} of news.`;
    case 'player:paid':
      return `${you()} pays the money-changer ${formatMoney(sim, entry.bits)}; ${formatMoney(sim, entry.owed)} still owed.`;
    case 'player:missed':
      return `${you()} can't meet the money-changer's due (${formatMoney(sim, entry.due)}); ${sim.data.player.changer.name} makes a note of it.`;
    case 'player:seized':
      return `${sim.data.player.changer.name}'s man, ${entry.collector}, empties the family's strongbox and sells off the stall: ${formatMoney(sim, entry.bits)} taken, ${formatMoney(sim, entry.owed)} still owed.`;
    case 'player:bonded':
      return `Ruined, ${you()} is bound to work off the debt as a factor for a rival house.`;
    case 'player:released':
      return `${you()}'s bond is served; half the debt is written off, and the stall is theirs again.`;
    case 'player:borrowed':
      return `${you()} borrows ${formatMoney(sim, entry.bits)} from the money-changer (${formatMoney(sim, entry.owed)} owed now).`;
    case 'player:repaid':
      return `${you()} repays the money-changer ${formatMoney(sim, entry.bits)} (${formatMoney(sim, entry.owed)} still owed).`;
    case 'player:wagon':
      return `${you()} buys a wagon from the wheelwrights of ${place(entry.at)} (${entry.wagons} now).`;
    case 'player:died':
      return `${entry.who} is dead (${entry.cause === 'raid' ? 'killed by outlaws on the road' : entry.cause}). ${entry.heir} takes up the ledger, the stall and the debt.`;
    case 'player:freed':
      return `${you()} comes home, let go by the outlaws.`;
    case 'player:refused':
      return `${you()} can't ${entry.command.replace('-', ' ')}: ${entry.why}.`;
    case 'player:forced-loan':
      return `Lord Aldric "borrows" ${formatMoney(sim, entry.bits)} from ${you()}.`;
    case 'merchant:forced-loan':
      return `Lord Aldric "borrows" ${formatMoney(sim, entry.bits)} from ${trader(entry.who)}. Nobody expects to see it again.`;
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

const STAT_GROWTH = {
  str: 'stronger in the arm for it',
  agi: 'quicker on their feet for it',
  dis: 'steadier in the line for it',
  awa: 'sharper-eyed for it',
  nerve: 'harder to frighten for it',
};

const TRAIT_TEXT = {
  forestwise: 'has learned the forest: Forestwise, quick to see a bad bend in the trees',
  hillwise: 'has learned the hill paths: Goat-footed, hard to catch on a slope',
  fenwise: 'has learned the fens: Fenwise, at home on the causeways',
  ambush: 'has been ambushed often enough not to freeze: an Ambush Veteran',
  night: 'fights as well in the dark as by day now: a Night Fighter',
  bandits: 'knows the outlaws\' ways by now',
  scarred: 'carries a bad scar now, and a careful streak with it',
};

const ORDER_WORDS = { fight: 'stand and fight', toll: 'pay a toll rather than fight', flee: 'run from any band' };

// Standing orders, where they decided it (spec §13: the report says so).
function orderText(e, whose) {
  const o = e.order;
  if (!o || (e.kind !== 'merchant' && e.kind !== 'lord')) return '';
  if (o.rule === 'watch') return e.response === 'woke' ? ' The double watch woke in time.' : '';
  if (o.cargo === 'drop') return ` Per ${whose} orders, they cut the load loose and ran${o.rule === 'outnumbered' ? ` from a band ${o.ratio.toFixed(1)} times their strength` : ''}; everyone got away.`;
  if (o.cargo === 'hold') return ` Per ${whose} orders, they ran with the load rather than drop it.`;
  if (o.rule === 'outnumbered' && e.outcome === 'toll') return ` Per ${whose} orders, they gave way to a band ${o.ratio.toFixed(1)} times their strength.`;
  if (o.rule === 'toll') return ` Per ${whose} orders: pay rather than fight.`;
  if (o.rule === 'fight' && e.response === 'refused') return ` Per ${whose} orders, they refused to pay.`;
  if (o.rule === 'flee' || o.rule === 'outnumbered') return ` Per ${whose} orders, they ran${o.rule === 'outnumbered' ? ` from a band ${o.ratio.toFixed(1)} times their strength` : ''}.`;
  return '';
}

// Sellswords hurt or killed (a patrol's clash).
function harmText(harm, sim) {
  if (!harm?.length) return '';
  const dead = harm.filter((h) => h.fate === 'died').map((h) => mercName(sim, h.who));
  const hurt = harm.filter((h) => h.fate !== 'died' && !harm.some((x) => x.who === h.who && x.fate === 'died')).map((h) => mercName(sim, h.who));
  return `${dead.length ? ` ${listOf(dead)} ${dead.length === 1 ? 'falls' : 'fall'}.` : ''}${hurt.length ? ` ${listOf(hurt)} ${hurt.length === 1 ? 'is' : 'are'} hurt.` : ''}`;
}

// What the guards did, for the after-action report: who saw it coming, who fell, who was hurt.
function guardsText(e, sim) {
  if (!e.guards?.length) return '';
  const names = (ids) => listOf(ids.map((id) => mercName(sim, id)));
  const out = [];
  const spotted = e.factors?.find((f) => f.k === 'spotted');
  if (spotted) out.push(`${mercName(sim, spotted.who)} saw the ambush coming.`);
  else if (e.factors?.some((f) => f.k === 'surprised')) out.push(`The guards were taken by surprise${e.factors.some((f) => f.k === 'trait' && f.trait === 'ambush') ? `, though ${names([...new Set(e.factors.filter((f) => f.trait === 'ambush').map((f) => f.who))])} kept their heads` : ''}.`);
  const named = [...new Set((e.factors ?? []).filter((f) => f.k === 'item').map((f) => f.item))].map((id) => itemById(sim, id)).filter((i) => i?.name);
  if (named.length) out.push(`${listOf(named.map((i) => i.name))} ${named.length === 1 ? 'was' : 'were'} in the fight.`);
  const traits = (e.factors ?? []).filter((f) => f.k === 'trait' && f.trait !== 'ambush');
  if (traits.length && e.outcome === 'fought off') out.push(`${names([...new Set(traits.map((f) => f.who))])} knew this kind of fight.`);
  const dead = (e.guardHarm ?? []).filter((h) => h.fate === 'died').map((h) => h.who);
  const hurt = (e.guardHarm ?? []).filter((h) => h.fate !== 'died' && !dead.includes(h.who));
  if (dead.length) out.push(`${names(dead)} ${dead.length === 1 ? 'falls' : 'fall'}.`);
  if (hurt.length) out.push(`${names(hurt.map((h) => h.who))} ${hurt.length === 1 ? 'is' : 'are'} ${hurt.every((h) => h.fate === 'badly hurt') ? 'badly hurt' : 'hurt'}.`);
  return out.length ? ` ${out.join(' ')}` : '';
}

// The after-action report of an encounter on the road (spec §13).
function encounterText(e, ctx) {
  const whose = e.kind === 'lord' ? "Lord Aldric's" : e.kind === 'merchant' ? `${getMerchant(ctx.sim, e.who)?.name ?? 'the house'}'s` : 'their';
  return encounterCore(e, ctx) + orderText(e, whose);
}

function encounterCore(e, { place, person, bandName, segRoad, amount, sim }) {
  const band = bandName(e.band);
  const Band = band.charAt(0).toUpperCase() + band.slice(1);
  const road = `the ${segRoad(e.seg)}`;
  const m = e.kind === 'merchant' ? getMerchant(sim, e.who) : null;
  const w = e.kind === 'wayfarer' ? getWayfarer(sim, e.who) : null;
  const r = e.kind === 'rider' ? getRider(sim, e.who) : null;
  const lordly = e.kind === 'lord';
  const name = m ? m.name : w ? `${w.name} the ${tradeName(sim, w)}` : r ? `${r.name} of the lord's post` : lordly ? 'Lord Aldric' : e.kind === 'courier' ? `${sim.state.player?.family ?? 'the family'}'s courier` : e.who;
  // The player's own caravan (step G): named for them if they rode with it.
  const rider = e.rider && sim.state.player ? sim.state.player.died.find((d) => d.t >= e.t)?.name ?? sim.state.player.name : null;
  const party = m?.player ? (rider ? `${rider}'s caravan` : `the ${sim.state.player.family} family's caravan`) : m ? `${m.name}'s caravan` : lordly ? "Lord Aldric's party" : name;
  const goods = Object.entries(e.goods ?? {}).filter(([, q]) => q > 0.05).map(([gid, q]) => amount(q, gid));
  const took = [goods.join(' and '), e.bits ? formatMoney(sim, e.bits) : ''].filter(Boolean).join(' and ');
  const hands = e.hands ? ` ${e.hands === 1 ? `One ${lordly ? 'of his guard' : 'hired hand'} is` : `${e.hands} ${lordly ? 'of his guard' : 'hired hands'} are`} killed.` : '';
  const bounty = e.bounty ? ` The lord's bounty pays ${formatMoney(sim, e.bounty)}.` : '';
  const outlaws = e.outlaws ? ` ${e.outlaws === 1 ? 'One outlaw is' : `${e.outlaws} outlaws are`} left dead${e.leaderFell ? ', their leader among them' : ''}.` : '';
  switch (e.outcome) {
    case 'toll':
      return `On ${road}, ${band} stop ${party} and demand a toll${m ? `; ${m.name} pays` : lordly ? '; Lord Aldric, white with fury, pays' : `. ${name} pays`} ${took || 'what they ask'} rather than fight.`;
    case 'stolen':
      return `In the night, thieves from ${band} creep into ${party === name ? `${name}'s camp` : `the camp of ${party}`} on ${road} and are gone before dawn with ${took || 'what they could carry'}.`;
    case 'escaped':
      return `${Band} try to stop ${name} on ${road}, but the rider spurs through and away, letters safe.`;
    case 'dropped':
      return `Seeing ${band} on ${road}, ${m ? `${m.name}'s crew cut loose and run` : `${name} drops everything and runs`}, leaving ${took || 'the load'} behind.`;
    case 'fought off':
      return `${Band} fall on ${party} on ${road}${e.night ? ' in the dark' : ''} and are driven off.${outlaws}${bounty}${hands}${guardsText(e, sim)}`;
    case 'murdered':
      return `${name} is found dead on ${road}, robbed by ${band} of ${took || 'everything'}.`;
    case 'robbed':
      if (e.kind === 'rider' || e.kind === 'courier') return `${Band} waylay ${name} on ${road} and take the rider's letters.`;
      return `${Band} fall on ${party} on ${road}${e.night ? ' in the dark' : ''}.${e.response === 'fought' || e.response === 'refused' || e.response === 'woke' ? ' They fight and lose.' : e.response === 'fled' ? ' They run, and are caught.' : ''}` +
        `${took ? ` ${took.charAt(0).toUpperCase() + took.slice(1)} ${took.includes(' and ') || /s\b/.test(took) ? 'are' : 'is'} taken.` : ''}${hands}${outlaws}` +
        guardsText(e, sim) + (e.playerDied ? ` ${rider} is killed.` : '') + (e.captured ? (lordly ? ' Lord Aldric himself is dragged off into the hills, to be held for a great ransom.' : ` ${rider ?? m.name} is dragged off to be held for ransom.`) : '');
    default:
      return `${Band} trouble ${name} on ${road}.`;
  }
}

// A traveller's name for the chronicle, whoever they are.
function campName(sim, { id }) {
  const m = getMerchant(sim, id);
  if (m) return m.name;
  const w = getWayfarer(sim, id);
  if (w) return `${w.name} the ${tradeName(sim, w)}`;
  const r = getRider(sim, id);
  if (r) return `${r.name} of the post`;
  return 'a traveller';
}

const listOf = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
