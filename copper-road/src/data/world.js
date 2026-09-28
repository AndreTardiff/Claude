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

  // Word of mouth: each retelling moves prices by up to ±6% and costs 15% of the trust.
  knowledge: { rumourNoise: 0.06, rumourTrust: 0.85 },

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
    trades: [
      { id: 'peddler', name: 'peddler', speedKmh: 4 },
      { id: 'tinker', name: 'tinker', speedKmh: 3.5 },
      { id: 'pilgrim', name: 'pilgrim', speedKmh: 4 },
      { id: 'drover', name: 'drover', speedKmh: 3 },
      { id: 'minstrel', name: 'minstrel', speedKmh: 4.5 },
      { id: 'friar', name: 'friar', speedKmh: 4 },
      { id: 'journeyman', name: 'journeyman', speedKmh: 4.5 },
    ],
  },
};
