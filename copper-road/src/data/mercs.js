// Mercenaries, their gear and what they live through (step F, spec §12–§13).
//
// Growth is slow on purpose: a guard earns a rank from deeds survived, not days
// served, and what they lived through decides which stat the rank raises. Gear
// keeps its own record the same way, and only a piece that has seen a great deal
// earns a name.

export const MERCS = {
  // Sellswords at the start, by the town they live in.
  start: { kingscross: 4, copperford: 2, greenhollow: 1, saltmouth: 3 },
  target: 10, // while fewer are left, an idle labourer may take up the sword
  recruitChance: 0.05, // a day, while under target
  purse: [3, 15], // marks each starts with

  stats: ['str', 'agi', 'dis', 'awa', 'nerve'], // strength, agility, discipline, awareness, nerve (1–10)
  startStat: [2, 5],
  maxStat: 10,

  // Deed points a rank needs. A hard fight survived is worth 2–4, a toll or a sight of a band ½.
  // (Raised a quarter in step G+3, when bolder bands made fights commoner: growth stays slow.)
  ranks: [
    { id: 'green', name: 'Green', deeds: 0 },
    { id: 'blooded', name: 'Blooded', deeds: 6 },
    { id: 'seasoned', name: 'Seasoned', deeds: 20 },
    { id: 'veteran', name: 'Veteran', deeds: 45 },
    { id: 'captain', name: 'Captain', deeds: 88 },
  ],

  wage: { base: 0.9, perRank: 0.35, perFame: 0.04, fameMax: 1 }, // marks a day on the road, paid where the trip ends
  // Fame: renown from deeds, spread as news (knowledge records 'fame:<id>'). Employers pay for a
  // name they've heard of; lookouts think twice about guards whose names they know.
  fame: { won: 1, kill: 1, lord: 2, rank: 1, named: 2, hire: 0.03, fear: 0.04, fearMax: 0.8 },
  upkeep: 0.25, // marks a day for bed and board while waiting for work (to the town's households)
  oddJobs: 0.3, // marks a day for watching the stalls and the inn door, from the town's traders, if they can pay
  spendAbove: 40, // marks: a sellsword with more than this lives well (a tenth of the excess a day)
  awayDays: 4, // days a sellsword waits for work away from home before walking back
  walkHomeDays: 2,
  retire: { brokeDays: 40, deeds: 110 }, // give up the sword: broke and idle this long, or old in deeds and rich

  // Hiring: merchants hire guards for the danger they believe is on the road.
  hire: {
    perExposure: 6, // guards wanted per loaded wagon per unit of believed exposure
    max: 4,
    minExposure: 0.05, // below this, no guards
    maxWageShare: 0.25, // never more than this share of the house's purse on guards' wages
    nerve: 0.25, // each sellsword for hire in town makes a merchant this much less wary of a road (up to max)
  },

  // Fighting strength of one guard (an unarmed carter counts 1).
  power: {
    base: 1,
    perStat: { str: 0.06, agi: 0.05, dis: 0.04 }, // for each point above 3
    nerve: 0.04, // ×(1 + this × (nerve − 3))
    night: 0.82, // everyone fights worse in the dark…
    rank: 0.03, // a little more per rank: knowing how the fight goes
    wounded: 0.6,
  },

  // Chances when a guard is in a fight that goes wrong (armour cuts them).
  harm: { wound: 0.3, death: 0.08, severe: 0.35, lightDays: 6, severeDays: 20, frontLine: 0.6 },
  killChance: 0.18, // each guard's chance to cut down an outlaw in a fight they win (plus their weapon's bite)

  // Deeds: points toward rank, and which stats the moment trains.
  deeds: {
    won: 3, lost: 2, passive: 0.5, kill: 1, wounded: 1, stared: 0.3,
    // growth toward a stat, by what happened
    grow: {
      fought: { str: 1, agi: 0.6 },
      night: { awa: 1, nerve: 0.4 },
      ambushed: { awa: 0.8, nerve: 0.6 },
      spotted: { awa: 0.8 },
      won: { dis: 0.6, nerve: 0.5 },
      lost: { nerve: 0.4, agi: 0.4 },
      wounded: { nerve: 0.8 },
      held: { dis: 0.8 }, // stood firm beside others
      paid: { dis: 0.3 },
      stared: { awa: 0.2, dis: 0.1 }, // a band looked them over and let them by
      road: { str: 0.02, awa: 0.02 }, // per day on a dangerous road
    },
  },

  // Traits: thresholds on the ledger (spec v0.1 §12.3). Few and explicit.
  traits: {
    forestwise: { name: 'Forestwise', terrain: 'forest', fights: 2, km: 400, power: 0.15, spot: 0.15 },
    hillwise: { name: 'Goat-footed', terrain: 'hills', fights: 2, km: 400, power: 0.15, spot: 0.15 },
    fenwise: { name: 'Fenwise', terrain: 'marsh', fights: 2, km: 300, power: 0.15, spot: 0.15 },
    ambush: { name: 'Ambush Veteran', ambushes: 3 },
    night: { name: 'Night Fighter', nights: 2, power: 0.18 },
    bandits: { name: 'Knows the Outlaw Ways', encounters: 6, power: 0.06 },
    pair: { name: 'Trusted Pair', fights: 3, power: 0.1 },
    scarred: { name: 'Scarred', severe: 1, power: -0.04, death: 0.6 },
  },
  surprise: 0.8, // an ambush nobody saw coming: every guard fights at this
  spotAmbush: 0.04, // a guard's chance per point of awareness of seeing it coming

  // Gear. `power` adds to a guard's strength; `wear` is lost a fight (repaired by a smith).
  // `make`: goods the smith uses up, `labour`: marks on top.
  gear: {
    club: { slot: 'weapon', name: 'club', power: 0.12, wear: 0.02, make: { timber: 0.2 }, labour: 0.5, noun: ['Knock', 'Maul'] },
    spear: { slot: 'weapon', name: 'spear', power: 0.3, wear: 0.05, make: { timber: 0.3, tools: 0.15 }, labour: 2, open: 0.08, noun: ['Thorn', 'Reach', 'Needle'] },
    axe: { slot: 'weapon', name: 'axe', power: 0.3, wear: 0.05, make: { tools: 0.3 }, labour: 3, terrain: { forest: 0.1 }, noun: ['Bite', 'Hewer'] },
    sword: { slot: 'weapon', name: 'sword', power: 0.38, wear: 0.04, make: { tools: 0.6 }, labour: 8, noun: ['Tongue', 'Edge', 'Oath'] },
    bow: { slot: 'weapon', name: 'bow', power: 0.26, wear: 0.04, make: { timber: 0.3 }, labour: 9, dark: -0.2, spot: 0.05, noun: ['Whisper', 'Longreach'] },
    gambeson: { slot: 'armour', name: 'quilted coat', power: 0.12, guard: 0.3, wear: 0.05, make: { cloth: 0.6 }, labour: 2, noun: ['Coat', 'Quilt'] },
    mail: { slot: 'armour', name: 'mail shirt', power: 0.22, guard: 0.55, wear: 0.03, make: { tools: 1.2 }, labour: 12, agi: -0.03, noun: ['Shirt', 'Rings'] },
    // Shed plates of the Old Carrier's shell, laced into a coat. Light, and they turn nearly anything.
    scute: { slot: 'armour', name: 'scute coat', power: 0.3, guard: 0.7, wear: 0, rare: true, value: 90, noun: ['Shell', 'Carapace'] },
    shield: { slot: 'shield', name: 'shield', power: 0.1, guard: 0.15, wear: 0.06, make: { timber: 0.6, tools: 0.05 }, labour: 1.5, noun: ['Door', 'Wall'] },
    charm: { slot: 'charm', name: 'charm', power: 0, wear: 0 },
  },
  charms: ["a hare's foot", "a saint's knucklebone", 'a chip of scute on a thong', 'a holed river stone', 'a copper mark bent double', 'a lock of a drowned woman\'s hair'],
  relicChance: 0.04, // a charm that really is more than it seems (only the lab can tell)
  charm: { repute: 0.12, relic: 0.15, lucky: 0.12, ill: 0.25 }, // power per unit of repute; a true relic's own edge
  startGear: { weapons: ['spear', 'spear', 'axe', 'club', 'sword', 'bow'], armour: 0.6, shield: 0.4, charm: 0.3, scutes: 1 },
  markup: 1.25, // what the smith asks over the goods' price
  resale: 0.5, // second-hand gear on a town's rack, by what it would cost new
  scrapAfter: 120, // days plain gear waits on a rack before it goes for scrap

  // What gear lives through, slowly. Points per fight, tier thresholds, and the edge each tier adds.
  item: {
    fight: 1, won: 1, kill: 1.5, turned: 1, survived: 0.5,
    tiers: [
      { id: 'plain', name: 'plain', xp: 0, bonus: 0 },
      { id: 'proven', name: 'proven', xp: 6, bonus: 0.03 },
      { id: 'storied', name: 'storied', xp: 16, bonus: 0.06 },
      { id: 'renowned', name: 'renowned', xp: 35, bonus: 0.1 },
      { id: 'legendary', name: 'legendary', xp: 70, bonus: 0.15, owners: 2 },
    ],
    nameAt: 2, // named at this tier
    // A named piece takes its name from the road where it saw most, or from its luck.
    places: { 'kings-road': 'Kingsway', 'blackpine-track': 'Blackpine', 'meadow-road': 'Millford', 'high-pass': 'Saddle', 'estuary-road': 'Fenwatch' },
  },
  bandGear: 0.5, // gear in outlaw hands counts for this much of its power, one piece per member
};
