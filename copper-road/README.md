# Caravans of the Copper Road: simulation laboratory

The headless simulation core and the browser lab for the prototype described in
[`docs/copper-road-spec-v0.2.md`](../docs/copper-road-spec-v0.2.md).

- **Live lab:** https://andretardiff.github.io/Claude/copper-road/lab/
- **Status:** build steps A (clock, roads), B (goods, prices, named workers, seasons) and C (coin, famine and recovery) are complete. Next: D (merchants and caravans).

## Run it

Needs Node 20 or newer. There are no dependencies to install.

```sh
npm test                                  # all tests, including the step A gate
npm run sim                               # 100 days, seed 1, with a summary and chronicle
npm run sim -- --seed 42 --days 400       # any seed, any length
npm run sim -- --wayfarers 150 --json     # bigger population, machine-readable output
npm run reference                         # refresh lab/reference.json after changing sim outcomes
```

To use the lab locally, serve the repository root (for example `python3 -m http.server`)
and open `/copper-road/lab/`. ES modules don't load from `file://`.

## Layout

```
src/
  core/        rng (seeded, named streams) · calendar (seasons, daylight, travel windows)
               scheduler (event heap) · hash (canonical state fingerprint)
  data/        world.js (map, roads, seasons, travellers) · economy.js (goods, needs,
               trades, populations, the Outside) · names.js
  world/       routes.js (graph, paths, journey estimates) · validate.js
  economy/     pricing.js (price curve, quotes with reasons, trade value) · money.js (bits, accounts, transfers)
               opportunities.js (the opportunity board) · market.js · people.js
  sim/         simulation.js (tick loop, events, hooks, commands, snapshot/restore)
  systems/     almanac · wayfarers (travellers) · residents (named people, succession, famine, migration, growth)
               economy (daily production, consumption, prices, news) · coin (wages, the Mint, taxes, the Crown, hoards)
  narrative/   describe.js (log entries → chronicle text)
  view/        positions.js (map positions; pure, used by the lab)
tools/         run.js (headless CLI with market table) · reference.js
test/          node:test suites; step gates: A in simulation.test.js, B in economy.test.js, C in coin.test.js
lab/           browser laboratory: map-render (canvas map, price badges), markets (market board,
               "why this price?", price chart), opportunities, tools (lab interventions), charts (SVG)
```

## How the simulation works

- **Time** is an integer count of minutes. Each tick (10 minutes) first runs every
  queued event due by its end, in (time, sequence) order. Then hourly, daily and
  seasonal hooks run.
- **All mutable state** is plain JSON in `sim.state`: clock, RNG streams, event
  queue, log and system state. `snapshot()` / `Simulation.restore()` resume the
  exact same future. Static world data is never mutated.
- **Randomness** comes only from named streams (`sim.rng('wayfarers')`), each
  seeded from `hash(seed + name)`. A new stream never disturbs existing ones.
- **Travel** follows the route graph. Travellers move only between dawn and dusk,
  less camp time, so winter journeys run longer on their own. Road conditions
  (floods, snow) are read when a traveller starts each segment. Decisions happen
  at nodes.
- **Reasons are data.** Every choice stores why it was made (for example, a
  wayfarer's scored route options), and the lab's inspector shows it.
- **The log is structured** (ids, not names), so text can be rendered differently
  later (drifting names, spec §17.1).
- **The economy settles once a day at midnight.** Each town's named workers
  produce (skill × season × hunger × tools × effort), everyone eats and uses what
  they need, tools wear, grain spoils, and the Outside's ships pull Saltmouth back
  toward world prices. Prices are a pure function of stock and need: see
  `economy/pricing.js`, whose quotes explain themselves.
- **Money is whole bits** (12 to the copper mark) in named accounts, moved only by
  `transfer()` in `economy/money.js`. The books always balance: circulation =
  opening + minted + gifted − Crown − worn − buried.
- **Outside instructions** (the lab's tools, later the player) go through
  `sim.command(kind, data)`: an ordinary event at the current time, so they
  replay exactly.

## Determinism rules

The same seed must produce the same world in Node and in every browser.
`test/determinism-lint.test.js` enforces these rules in `src/`:

- No `Math.random`, `Date`, `performance.now`, timers or DOM access.
- No `Math.sin/cos/exp/log/pow/…` or `**`. Engines may differ in the last bit.
  Basic arithmetic and `Math.sqrt` are exact. If we need curves, we add
  deterministic versions to `src/core`.
- Iterate in a fixed order (arrays, sorted ids), never over something whose order
  could vary.

The lab's **Determinism check** runs seed 1 for 100 days in the browser and
compares the state hash with `lab/reference.json`, produced by Node.
