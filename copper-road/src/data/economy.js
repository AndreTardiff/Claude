// Economy data for build step B: goods, price curves, what people need, what
// trades produce, who lives where, and the Outside market at Saltmouth.
//
// Units are trade-sized: a wagon carries roughly 20–40 units, so a single
// caravan matters to a town's market. Prices are in marks. Coin itself arrives
// in step C; until then prices are a measure of value and pressure.

export const ECONOMY = {
  // Price = base × local factor × stock factor.
  // The stock factor is a bounded curve of scarcity = desired / stock:
  //   factor(s) = (floor + cap·q·x) / (1 + q·x),  x = s^power,  q = (1 − floor)/(cap − 1)
  // so factor(1) = 1, it rises smoothly to `cap` as stock runs out and falls to
  // `floor` in a glut. Pure arithmetic, identical on every JavaScript engine.
  // Essentials use power 2: they bite harder and sooner when short.
  priceCurves: {
    essential: { floor: 0.3, cap: 5, power: 2 },
    staple: { floor: 0.35, cap: 3.5, power: 1 },
    trade: { floor: 0.4, cap: 2.5, power: 1 },
    luxury: { floor: 0.5, cap: 2, power: 1 },
  },

  // reserveDays: how many days of need a town likes to keep in store. That sets
  // the "desired" stock that prices are measured against.
  goods: [
    { id: 'grain', name: 'Grain', unit: 'sack', units: 'sacks', base: 10, curve: 'essential', reserveDays: 20, spoilPerDay: 0.003 },
    { id: 'ore', name: 'Copper ore', unit: 'load', units: 'loads', base: 12, curve: 'staple', reserveDays: 20 },
    { id: 'tools', name: 'Tools', plural: true, unit: 'tool', units: 'tools', base: 40, curve: 'staple', reserveDays: 30 },
    { id: 'timber', name: 'Timber', unit: 'load', units: 'loads', base: 8, curve: 'staple', reserveDays: 15 },
    { id: 'wool', name: 'Wool', unit: 'bale', units: 'bales', base: 14, curve: 'trade', reserveDays: 20 },
    { id: 'cloth', name: 'Cloth', unit: 'bolt', units: 'bolts', base: 30, curve: 'trade', reserveDays: 40 },
    { id: 'salt', name: 'Salt', unit: 'sack', units: 'sacks', base: 18, curve: 'essential', reserveDays: 30 },
    { id: 'medicine', name: 'Medicine', unit: 'chest', units: 'chests', base: 50, curve: 'essential', reserveDays: 40 },
    { id: 'luxuries', name: 'Luxuries', plural: true, unit: 'crate', units: 'crates', base: 100, curve: 'luxury', reserveDays: 40 },
  ],

  // What every resident (and every visiting traveller) uses per day.
  needs: {
    grain: { perPerson: 0.1 },
    cloth: { perPerson: 0.002 },
    salt: { perPerson: 0.004, season: { spring: 0.5, summer: 0.5, autumn: 3, winter: 1 } }, // autumn: salting meat for winter
    timber: { perPerson: 0.01, season: { spring: 1, summer: 0.5, autumn: 1.5, winter: 3 } }, // firewood
    medicine: { perPerson: 0.005, season: { spring: 1.2, summer: 0.6, autumn: 1, winter: 2.5 } },
  },

  // Trades. produces: raw output; makes + inputs: a recipe (inputs per unit made).
  // elastic trades work harder when their output is dear and slack off in a glut.
  // toolWear: tools used up per worker per day.
  professions: {
    noble: { name: 'noble', plural: 'nobles', uses: { luxuries: 0.1 } },
    farmer: {
      name: 'farmer', plural: 'farmers', produces: 'grain', rate: 1.25, toolWear: 0.01,
      season: { spring: 0.2, summer: 0.6, autumn: 3, winter: 0.2 }, // the harvest comes in autumn
    },
    shepherd: {
      name: 'shepherd', plural: 'shepherds', produces: 'wool', rate: 0.3, toolWear: 0.005,
      season: { spring: 2.5, summer: 0.8, autumn: 0.4, winter: 0.3 }, // shearing in spring
    },
    miner: { name: 'miner', plural: 'miners', produces: 'ore', rate: 0.5, elastic: true, toolWear: 0.02 },
    woodcutter: {
      name: 'woodcutter', plural: 'woodcutters', produces: 'timber', rate: 1.5, elastic: true, toolWear: 0.015,
      season: { winter: 0.7 },
    },
    smith: { name: 'smith', plural: 'smiths', makes: 'tools', rate: 0.3, inputs: { ore: 1, timber: 0.5 }, elastic: true, toolWear: 0.01 },
    weaver: { name: 'weaver', plural: 'weavers', makes: 'cloth', rate: 0.25, inputs: { wool: 1.2 }, elastic: true, toolWear: 0.005 },
    guard: { name: 'guard', plural: 'guards' },
    innkeeper: { name: 'innkeeper', plural: 'innkeepers' },
    healer: { name: 'healer', plural: 'healers' },
    priest: { name: 'priest', plural: 'priests' },
    porter: { name: 'porter', plural: 'porters', toolWear: 0.003 },
    carter: { name: 'carter', plural: 'carters', toolWear: 0.005 },
    crier: { name: 'crier', plural: 'criers' },
    dockhand: { name: 'dockhand', plural: 'dockhands' },
    harbourmaster: { name: 'harbourmaster', plural: 'harbourmasters' },
    labourer: { name: 'labourer', plural: 'labourers', toolWear: 0.005, pool: 1 },
    dependant: { name: 'dependant', plural: 'dependants', pool: 2 }, // children and elders
  },

  // Who lives where. Totals must match each node's `residents`.
  populations: {
    kingscross: {
      noble: 3, smith: 3, weaver: 5, farmer: 2, woodcutter: 1, guard: 5, innkeeper: 2, healer: 1,
      priest: 1, porter: 3, carter: 2, crier: 1, labourer: 4, dependant: 22,
    },
    copperford: { miner: 10, woodcutter: 3, farmer: 1, smith: 1, guard: 2, innkeeper: 1, priest: 1, labourer: 2, dependant: 9 },
    greenhollow: { farmer: 8, shepherd: 4, woodcutter: 1, weaver: 1, innkeeper: 1, priest: 1, healer: 1, labourer: 1, dependant: 7 },
    saltmouth: { dockhand: 6, harbourmaster: 1, innkeeper: 1, guard: 1, labourer: 1, dependant: 2 },
  },

  // Storage per good; anything beyond is sold off cheap or wasted.
  storage: { kingscross: 300, copperford: 200, greenhollow: 200, saltmouth: 400 },

  // Towns start with this many times their desired stock of what they need.
  initialReserve: 2.5,
  initialSurplus: 20, // starting stock of goods a town makes but doesn't use itself

  // Production modifiers.
  makeshift: 0.2, // crafters with no inputs still manage this share of output (scrap, local makeshifts)
  effort: { min: 0.35, max: 1.25 }, // elastic trades: effort = stock factor of their output, clamped
  hungerPenalty: 0.4, // a fully starving town works at 60%
  toolPenalty: 0.4, // a town with no spare tools works at 60%
  toolReserveDays: 10, // spare tools that count as "well equipped"

  // Succession: when a worker dies, someone from the pool takes up the trade.
  succession: { delayDays: 2, startSkill: 350, learnPerDay: 5, trainedSkill: 900 },

  // The Outside: ships keep Saltmouth's stocks near these levels, at world prices.
  // factor < 1: the port sells it cheap; factor > 1: foreign buyers pay well.
  outside: {
    saltmouth: {
      relax: 0.2, // share of the gap to the anchor that ships close each day
      goods: {
        grain: { anchor: 60, factor: 1.1 },
        ore: { anchor: 80, factor: 1.35 },
        tools: { anchor: 20, factor: 1.15 },
        timber: { anchor: 120, factor: 0.85 },
        wool: { anchor: 60, factor: 1.2 },
        cloth: { anchor: 40, factor: 1.3 },
        salt: { anchor: 150, factor: 0.6 },
        medicine: { anchor: 30, factor: 0.75 },
        luxuries: { anchor: 30, factor: 0.8 },
      },
    },
  },

  historyDays: 80, // two prototype years of daily price history
};
