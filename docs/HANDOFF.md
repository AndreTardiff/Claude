# Handoff: where the build is, and what comes next

Read this first when resuming in a fresh session. It's updated at every checkpoint.

**Branch:** `claude/cloud-3qhvri` (also the GitHub Pages branch). Pull it, run `npm test`, then continue from
"Next" below. Project conventions are in `/CLAUDE.md`; the design spec is `docs/copper-road-spec-v0.2.md`.

## Status

| Step | State |
|---|---|
| A: clock, roads, test harness | done |
| B: goods, prices, named workers, seasons | done |
| C: coin, famine and recovery, map tooltips | done |
| **D: merchants, caravans, knowledge, couriers** | **in progress** (see checkpoints) |

## Step D plan (checkpoints)

Each checkpoint ends with all tests green, `npm run reference` rerun, this file updated, and a push.

- [x] **D1: knowledge.** *(done: `src/systems/knowledge.js`, `src/systems/post.js`, `src/world/journey.js`, `test/knowledge.test.js`)* Price lists as dated records (`src/systems/knowledge.js`): who knows what about which
      market, from where (seen, rumour, letter), how old. Inns hold the freshest word each town has heard; travellers
      carry and trade price lists when they arrive; rumours are a little wrong. The lord's post riders ride a circuit
      carrying every town's price board. Tests: knowledge ages, spreads at road speed, rumours are noisy.
- [x] **D2: merchants, caravans and the ships' coin.** *(done: `src/systems/merchants.js`, `test/merchants.test.js`)*
      Five named trading houses with purses, wagons and tempers. Idle in a town: see the market, swap news at the
      inn, score every trade from their own (aged) price lists: believed sale with the stock expected on arrival,
      capped by the coin the town was said to have, discounted for age and trust, less purchase + fee, provisions,
      crew wages, tolls and a risk premium set by their temper. Buy real goods (`load`), hire crew per loaded wagon,
      travel the route graph, pay tolls, sell on arrival (till, then up to a share of household savings; a town
      that can't pay gets a few days, then the load goes elsewhere once, then for whatever it fetches). Houses
      spend beyond their working capital at home, buy wagons, get "borrowed" from by the lord, are ruined when
      broke, and towns with savings back new ones. **Pulled forward from D3:** merchants trade with Saltmouth's
      ships directly: exports bring coin in (`exported`), imports send it out (`imported`); `traderAccount()`.
      Also: `comforts` (households with savings buy cloth, tools, luxuries), road books (`today.road.in/out`),
      price lists carry each town's coin, market-news quiet periods are per story.
- [ ] **D3: peddlers.** Peddler and tinker wayfarers carry a small pack and trade with the merchant logic
      (`tradeCandidates` works for anyone with an account, a place and a capacity).
- [ ] **D4: lab, gate tests, docs.** Caravans on the map with tooltips; merchant inspector ("what they know",
      "why this trade"); knowledge/letters view; gate D test (merchants trade profitably on stale information and
      sometimes misjudge); AT-25 (winter pays); spec §5/§10 "as built"; site progress entry; README/CLAUDE.md.

## Next

Start D3 (peddlers). Build on `src/systems/merchants.js`: `tradeCandidates(sim, m)` scores trades for anyone
with an id (knowledge holder), a place (`at`), a `merchant:<id>`-style account and a capacity; peddlers would
need their own account prefix (`wayfarer:<id>` already exists) and a small pack. Then D4 (lab views, gate D,
AT-25 winter pays, site entry).

Findings from D2 (200 days, seeds 1/7/23):
- Merchants make ~50–60 ventures, ~10% at a loss; famine deaths and emigration fall a lot versus no merchants.
- Coin settles ~7,000–8,600 marks (the ships' export payments are now the biggest source); houses hold 30–40%.
- Kingscross (must buy its bread) stays poorest and still goes hungry at times. Copperford lives on the Mint,
  which idles while merchants' fees and tolls keep the treasury full. Candidate fixes for later: the lord
  spends a full treasury (relief, works), or the Mint buys ore on its own account.
- Merchants are still ~2× too pessimistic on average (expected vs actual profit); fine for now.
- 200 days run in ~300 ms.

## Notes for whoever picks this up

- Money: whole bits, moved only by `transfer()` in `src/economy/money.js`. New flows must be added to the
  identity in `test/coin.test.js` and the Money panel's ledger line.
- Goods: only move via `withdraw`/`deposit` in `src/economy/market.js`.
- Determinism: see `/CLAUDE.md` (no Math.random/pow/Date in `src/`; named RNG streams).
- Before chart work, load the `dataviz` skill.
