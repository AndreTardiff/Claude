// The prototype world, as data. Static: never mutated by the simulation.
// Distances are in kilometres, speeds in km/h, times as "HH:MM".
// Map coordinates are kilometres from the top-left corner (x east, y south).
// Rendering-only geography (rivers, forests, coast) lives in lab/decor.js.

import { COIN, ECONOMY } from './economy.js';

export const WORLD = {
  id: 'copper-road-lab',
  version: 1,
  map: { widthKm: 240, heightKm: 160 },

  time: {
    minutesPerTick: 10,
    start: { day: 0, time: '05:30' },
  },

  calendar: {
    daysPerSeason: 10, // spec §16: 10 in the prototype, 30 later
    startYear: 1,
    campMinutes: 30, // making and breaking camp eats into daylight at each end
    twilightMinutes: 45,
    seasons: [
      { id: 'spring', name: 'Spring', dawn: '06:00', dusk: '19:00' },
      { id: 'summer', name: 'Summer', dawn: '05:00', dusk: '21:00' },
      { id: 'autumn', name: 'Autumn', dawn: '06:30', dusk: '18:00' },
      { id: 'winter', name: 'Winter', dawn: '08:00', dusk: '16:00' },
    ],
  },

  terrain: {
    road: { name: 'road', speed: 1.0 },
    forest: { name: 'forest track', speed: 0.9 },
    hills: { name: 'hill path', speed: 0.7 },
    marsh: { name: 'marsh causeway', speed: 0.8 },
  },

  nodes: [
    {
      id: 'kingscross', name: 'Kingscross', kind: 'town', x: 135, y: 85, residents: 55,
      blurb: "Market and craft town, seat of Lord Aldric, and home of your family's stall.",
    },
    {
      id: 'copperford', name: 'Copperford', kind: 'town', x: 70, y: 40, residents: 30,
      blurb: 'Mining town at the head of the Copperwash, and home of the Mint.',
    },
    {
      id: 'greenhollow', name: 'Greenhollow', kind: 'village', x: 45, y: 125, residents: 25,
      blurb: 'Farming village in the valley below the Greyback Hills.',
    },
    {
      id: 'saltmouth', name: 'Saltmouth', kind: 'port', outside: true, x: 222, y: 140, residents: 12,
      blurb: 'Estuary port and the door to the wider world. Ships come and go on their own schedules.',
    },
    {
      id: 'aldrics-bridge', name: "Aldric's Bridge", kind: 'waypoint', x: 95, y: 8,
      blurb: 'The only bridge over the Grey Gorge. Lord Aldric takes a toll.',
      toll: { wagon: 4, foot: 1 },
    },
    {
      id: 'blackpine', name: 'Blackpine Gorge', kind: 'waypoint', x: 110, y: 60,
      blurb: 'Where the forest track drops into the gorge and claws its way out the other side.',
    },
    {
      id: 'mill-ford', name: 'Mill Ford', kind: 'waypoint', x: 95, y: 112,
      blurb: 'Ford across the Copperwash. Knee-deep most of the year; not in spring.',
    },
    {
      id: 'the-saddle', name: 'the Saddle', kind: 'waypoint', x: 52, y: 82,
      blurb: 'Top of the High Pass. Snowbound all winter.',
    },
    {
      id: 'fenwatch', name: 'Fenwatch Ferry', kind: 'waypoint', x: 175, y: 108,
      blurb: 'Rope ferry over the Copperwash where it spreads into the fens.',
      toll: { wagon: 2, foot: 0 },
    },
  ],

  routes: [
    { id: 'kings-road', name: "King's Road", segments: ['kings-road-south', 'kings-road-north'] },
    { id: 'blackpine-track', name: 'Blackpine Track', segments: ['blackpine-east', 'blackpine-west'] },
    { id: 'meadow-road', name: 'Meadow Road', segments: ['meadow-east', 'meadow-west'] },
    { id: 'high-pass', name: 'High Pass', segments: ['high-pass-south', 'high-pass-north'] },
    { id: 'estuary-road', name: 'Estuary Road', segments: ['estuary-west', 'estuary-east'] },
  ],

  // danger: a 0–1 placeholder for how often trouble finds travellers here.
  // Step E replaces it with danger driven by raiders.
  segments: [
    { id: 'kings-road-south', route: 'kings-road', a: 'kingscross', b: 'aldrics-bridge', km: 92, terrain: 'road', danger: 0.03 },
    { id: 'kings-road-north', route: 'kings-road', a: 'aldrics-bridge', b: 'copperford', km: 44, terrain: 'road', danger: 0.03 },
    { id: 'blackpine-east', route: 'blackpine-track', a: 'kingscross', b: 'blackpine', km: 37, terrain: 'forest', danger: 0.25 },
    { id: 'blackpine-west', route: 'blackpine-track', a: 'blackpine', b: 'copperford', km: 46, terrain: 'forest', danger: 0.3 },
    { id: 'meadow-east', route: 'meadow-road', a: 'kingscross', b: 'mill-ford', km: 50, terrain: 'road', danger: 0.04 },
    {
      id: 'meadow-west', route: 'meadow-road', a: 'mill-ford', b: 'greenhollow', km: 54, terrain: 'road', danger: 0.04,
      seasonal: { spring: { speed: 0.5, note: 'Mill Ford is in flood' } },
    },
    {
      id: 'high-pass-south', route: 'high-pass', a: 'greenhollow', b: 'the-saddle', km: 46, terrain: 'hills', danger: 0.12,
      seasonal: { spring: { speed: 0.75, note: 'snowmelt mud' }, winter: { closed: true, note: 'snowbound' } },
    },
    {
      id: 'high-pass-north', route: 'high-pass', a: 'the-saddle', b: 'copperford', km: 48, terrain: 'hills', danger: 0.12,
      seasonal: { spring: { speed: 0.75, note: 'snowmelt mud' }, winter: { closed: true, note: 'snowbound' } },
    },
    { id: 'estuary-west', route: 'estuary-road', a: 'kingscross', b: 'fenwatch', km: 50, terrain: 'road', danger: 0.06 },
    { id: 'estuary-east', route: 'estuary-road', a: 'fenwatch', b: 'saltmouth', km: 62, terrain: 'marsh', danger: 0.1 },
  ],

  economy: ECONOMY,
  coin: COIN,

  // Merchants: the region's trading houses, each with a wagon or two, a purse and a temper.
  merchants: {
    count: 5, // houses the region supports; a ruined house is replaced when a town can back one
    houses: ['Vell', 'Harrow', 'Quennell', 'Ashdown', 'Corbin', 'Lisle', 'Marrow', 'Tallis'],
    homes: ['kingscross', 'greenhollow', 'copperford', 'kingscross', 'saltmouth', 'greenhollow'],
    wagonCapacity: 30, // units per wagon
    wagons: [1, 2], // a house starts with this many
    maxWagons: 3,
    wagonCost: 200, // marks to the home town's wheelwrights for another wagon
    speedKmh: 3.5,
    crewPerWagon: 3,
    crewWage: 0.5, // marks a day per hand, paid where the trip ends
    purse: [150, 400], // opening marks
    threshold: [4, 12], // least profit a day (marks) per loaded wagon worth setting out for
    minLoad: 5, // units: smaller loads aren't worth hitching a wagon for
    keepBack: 0.5, // a market's traders won't sell below this share of the stock the town wants
    reversion: 0.08, // merchants expect a town's shortage or glut to ease by this much a day (hyperbolically)
    orderTrust: 0.85, // how much of a lord's order a merchant counts on filling before rivals do
    stalePerDay: 0.015, // …and discount each day of a price list's age (by arrival) for the uncertainty
    maxStale: 0.4, // …never more than this
    riskWeight: 1, // risk cost = exposure × revenue × riskWeight × caution
    idleDays: 3, // days without a good trade before moving on empty
    restHours: 6, // unloading, haggling and sleep after arriving
    householdShare: 0.25, // a town's households put at most this share of their savings into one load
    sellDays: 2, // days a merchant waits for a town's tills to refill before taking the rest elsewhere
    livingCost: 1, // marks a day a house's household spends at home…
    keepPerWagon: 150, // …plus, beyond this working capital per wagon…
    spendShare: 0.04, // …this share of the rest, each day
    ruinBelow: 40, // marks: a house with empty wagons and less than this is ruined
    foundEvery: 10, // days: at most one new house this often
    peddlerHouses: 1, // extra houses the region makes room for when a peddler saves up for a wagon
    foundCapital: 200, // marks a new house starts with, raised from its town's households
    foundPurseAbove: 20, // marks per head a town must hold beyond that capital to back a new house
    forcedLoanAbove: 1000, // marks: the lord starts "borrowing" from a house this rich…
    forcedLoanShare: 0.2, // …this share of the excess, each season
  },

  // Raiders (step E): bands of outlaws with hideouts near the wild roads. They
  // recruit from the hungry and jobless, watch the road that pays, and rob,
  // extort or steal from those who pass. x/y place the hideouts on the map.
  raiders: {
    hideouts: [
      // forage: sacks of food a day each member finds for themselves (hunting, fishing, snaring), before winter's cut.
      {
        id: 'blackpine-hollows', name: 'the Blackpine hollows', band: 'the Blackpine band', x: 101, y: 66, forage: 0.06,
        watches: ['blackpine-east', 'blackpine-west'], fence: 'kingscross', near: ['kingscross', 'copperford'],
      },
      {
        id: 'saddle-caves', name: 'the caves under the Saddle', band: 'the Saddle band', x: 60, y: 88, forage: 0.05,
        watches: ['high-pass-south', 'high-pass-north'], fence: 'greenhollow', near: ['greenhollow', 'copperford'],
      },
      {
        id: 'fen-islands', name: 'the fen islands', band: 'the Fen band', x: 190, y: 122, forage: 0.07,
        watches: ['estuary-west', 'estuary-east'], fence: 'saltmouth', near: ['kingscross', 'saltmouth'],
      },
      {
        id: 'gorge-ledges', name: 'the ledges of the Grey Gorge', band: 'the Gorge band', x: 101, y: 24, forage: 0.04,
        watches: ['kings-road-north', 'kings-road-south'], fence: 'copperford', near: ['copperford', 'kingscross'],
      },
    ],
    // Living off the land and the road.
    // In autumn they lay in more (winterDays), knowing what's coming.
    food: { perHead: 0.1, keepDays: 5, buyDays: 10, winterDays: 15, winterForage: 0.5, starving: 0.5, disbandAfter: 12 },
    fence: { every: 3, share: 0.5 }, // stolen goods go to the fence town's traders at half the market price
    // Surplus coin: spendShare goes on drink and dice in the fence town, then `share` of what's left is buried.
    hoard: { keepPerHead: 15, keepBase: 40, spendShare: 0.5, share: 0.5, minBury: 20, hiddenDays: 30, findChance: 0.002 },
    // A starving band may fall on a town's granary: guards count for 2.5, every townsman a little.
    town: { raidChance: 0.3, minChance: 0.35, guardStrength: 2.5, folkStrength: 0.05, grainShare: 0.25, grainPerMember: 4, tillShare: 0.2 },
    // Drifters: while fewer than minBands hold the hills, now and then a stranger turns up
    // (a deserter, an outcast, someone off the ships) and joins the smallest band or starts one.
    drifters: { chance: 0.03, minBands: 2 },
    relocateIdleDays: 10, // days with nothing on its roads before a band looks for another hideout
    // The lord's patrols: lookouts spot fewer travellers, fights go worse, and the band may be run down.
    patrol: { spot: 0.4, strength: 1.5, fear: 0.25, clash: 0.15 },
    start: [{ hideout: 'blackpine-hollows', members: 5 }, { hideout: 'fen-islands', members: 4 }],
    maxBands: 4,
    maxMembers: 12,
    minToRaid: 2, // a band needs this many to take the road
    fewDays: 20, // days a band can stay too small to raid before the last of them give up
    // Recruitment: each day, per town, chance × labourers × (1 + hunger × 3) × (1 + poverty × 2).
    // lure: share of those leaving a hungry town (not children or elders) who head for the hills instead.
    recruit: { chance: 0.005, hungerWeight: 3, povertyWeight: 2, poorBelow: 8, newBandHunger: 0.35, lure: 0.4 },
    // Lookouts: chance a band spots a traveller on its road, by how visible they are.
    spot: 0.8,
    visibility: { merchant: 1, wayfarer: 0.5, peddler: 0.75, rider: 0.6 },
    noticeChance: 0.35, // chance a traveller who isn't attacked notices the band's signs
    takeMemory: 0.9, // lookouts' running estimate of each road's takings fades by this a day
    fearMemory: 0.93, // …and so does the fear a bloody road leaves
    watchEvery: 2, // days between a band reconsidering which road to watch
    // Encounters: numbers × nerve, a bounded roll, and tempers on both sides.
    encounter: {
      minLoot: 12, // marks: less isn't worth the trouble (unless the band is desperate)
      maxOdds: 0.45, // a band won't take on travellers with better than this chance of beating it
      desperateHunger: 0.4, // a band this hungry takes any chance
      nightShare: 0.45, // share of ambushes on a leg that runs past dusk that come at the night's camp
      nightEdge: 1.25, // surprise, in the dark
      tollShare: 0.25, // a toll: this share of what they carry
      stealShare: 0.4, // what night thieves get away with, if the watch sleeps
      fleeCaution: 0.7, // the timid cut loose and run
      flee: { rider: 0.8, wayfarer: 0.5 }, // chance of getting away (a caravan that drops its cargo always does)
      captureChance: 0.4, // a merchant whose crew lose a fight may be dragged off (more if timid)
      murderChance: 0.25, // a wayfarer who fights and loses may not live
      letterValue: 20, // marks a band reckons the post's letters are worth to a fence
    },
    ransom: { share: 0.2, min: 50, days: 6, lordGenerosity: 600, townKeepsPerHead: 15, killAbove: 650 },
  },

  // Surprise weather (step E4): chance a day, by season, that a stretch of road shuts
  // without warning, for a few days. `at` is the waypoint travellers get stranded at.
  weather: {
    events: [
      { id: 'flood', at: 'mill-ford', segments: ['meadow-east', 'meadow-west'], seasons: { spring: 0.03, autumn: 0.03 }, days: [2, 4], note: 'the Copperwash is over the ford' },
      { id: 'snow', at: 'the-saddle', segments: ['high-pass-south', 'high-pass-north'], seasons: { autumn: 0.04, spring: 0.02 }, days: [3, 6], note: 'snow has closed the pass' },
      { id: 'rockfall', at: 'blackpine', segments: ['blackpine-east', 'blackpine-west'], seasons: { spring: 0.012, summer: 0.008, autumn: 0.012, winter: 0.015 }, days: [2, 5], note: 'a rockfall blocks the gorge' },
      { id: 'storm', at: 'fenwatch', segments: ['estuary-west', 'estuary-east'], seasons: { autumn: 0.03, winter: 0.04 }, days: [1, 3], note: 'the ferry cannot cross in the storm' },
    ],
    // A camp that held this many days, with this many through it, leaves a waystation behind;
    // a waystation with no guest for this many days closes.
    camps: { waystationDays: 3, waystationPeople: 3, waystationFades: 40 },
    fireKm: 8, // travellers camped within this distance share a fire (and their news)
    fireNewsDays: 8, // the chronicle mentions word of bandits passed round a fire at most this often per road
  },

  // Lord Aldric: temperament, and what he does with a treasury beyond its reserve.
  lord: {
    name: 'Aldric',
    seat: 'kingscross',
    traits: { generosity: [350, 900], ambition: [300, 900], vanity: [250, 850] }, // permille, drawn at the start
    reserve: 250, // marks he keeps back (more when aggrieved); well under the Mint's target, so his spending keeps it striking
    emergencyFloor: 100, // for famine relief he'll go this low
    worksAhead: 3, // days of wages and materials he needs in hand to begin works (they're paid as they go)
    decideEvery: 3, // days between undertakings
    minScore: 0.15,
    abandonAfter: 15, // days a stalled work waits for materials before it's given up
    worksEvery: 40, // days before the same work is built again in the same town
    relief: { hunger: 0.25, premium: 1.6, days: 12, minQty: 8 }, // grain at 1.6× its worth, 12 days of bread
    commission: { goods: ['cloth', 'tools', 'timber'], glutFactor: 0.55, minQty: 6, maxQty: 25, everyDays: 20 },
    festival: { perHead: 1, grainPerHead: 0.3, glowDays: 20 }, // musicians, brewers, cooks; bread and ale
    works: [
      { id: 'granary', name: 'a granary', days: 8, labour: 4, materials: { timber: 16, tools: 2 }, effect: { storage: 100 } },
      { id: 'fields', name: 'new fields', plural: true, days: 10, labour: 5, materials: { tools: 4, timber: 4 }, effect: { farmers: 2, yield: 0.05 } },
      { id: 'houses', name: 'new houses', plural: true, days: 10, labour: 5, materials: { timber: 24, tools: 2 }, effect: { homes: 6 } },
      { id: 'smithy', name: 'a smithy', days: 6, labour: 3, materials: { timber: 8, tools: 3 }, effect: { trade: 'smith' } },
      { id: 'loom-house', name: 'a loom-house', days: 6, labour: 3, materials: { timber: 8, tools: 2 }, effect: { trade: 'weaver' } },
    ],
    steward: { tempted: 800, share: 0.01, noticeAbove: 10 }, // skims 1% a day of anything above 800 marks
    // Patrols (step E): guards ride a road his seat believes dangerous (this much above its old reputation).
    patrol: { minDanger: 0.15, guards: 4, pay: 1, days: 10 },
  },

  // Word of mouth: each retelling moves prices by up to ±6% and costs 15% of the trust.
  // Road reports fade: a raid ten days old weighs half as much. For a few days, bad
  // news isn't undone by someone who came along the road and saw nothing.
  knowledge: { rumourNoise: 0.06, rumourTrust: 0.85, roadMemoryDays: 10, badNewsDays: 3 },

  // The lord's post: riders on a fixed circuit through Kingscross, carrying every
  // town's posted prices to the others' inns as letters (exact, but as old as the ride).
  post: {
    riders: 2,
    speedKmh: 7,
    restHours: 8,
    circuit: ['kingscross', 'copperford', 'kingscross', 'greenhollow', 'kingscross', 'saltmouth'],
  },

  // Step A placeholder travellers. They exercise the clock, the scheduler and the
  // road network. They eat where they stay and buy provisions before each trip.
  // Later they become rumour carriers for the information system.
  wayfarers: {
    count: 12,
    provisionsPerDay: 0.1, // grain per traveller per day on the road
    restDays: [0, 2],
    maxSegments: 8,
    // How strongly a cautious wayfarer avoids danger when choosing a road.
    dangerWeight: 8,
    homeWeight: 40,
    // Peddlers and tinkers are the smallest merchants: a pack of a few units,
    // bought where it's cheap and carried where word says it's dear.
    peddling: {
      minProfit: 3, // marks a trip must be believed to clear to carry a pack
      keepPurse: 5, // marks they never spend on stock
    },
    trades: [
      // earns: marks a day resting (hawking ribbons, mending pots) instead of the usual odd jobs.
      { id: 'peddler', name: 'peddler', speedKmh: 4, pack: 4, goods: ['salt', 'medicine', 'cloth', 'tools'], earns: 1 },
      { id: 'tinker', name: 'tinker', speedKmh: 3.5, pack: 3, goods: ['tools'], earns: 1.5 },
      { id: 'pilgrim', name: 'pilgrim', speedKmh: 4 },
      { id: 'drover', name: 'drover', speedKmh: 3 },
      { id: 'minstrel', name: 'minstrel', speedKmh: 4.5 },
      { id: 'friar', name: 'friar', speedKmh: 4 },
      { id: 'journeyman', name: 'journeyman', speedKmh: 4.5 },
    ],
  },
};
