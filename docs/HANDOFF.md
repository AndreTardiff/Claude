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

- [ ] **D1: knowledge.** Price lists as dated records (`src/systems/knowledge.js`): who knows what about which
      market, from where (seen, rumour, letter), how old. Inns hold the freshest word each town has heard; travellers
      carry and trade price lists when they arrive; rumours are a little wrong. The lord's post riders ride a circuit
      carrying every town's price board. Tests: knowledge ages, spreads at road speed, rumours are noisy.
- [ ] **D2: merchants and caravans.** 3–6 named merchants with purses and personalities (`src/systems/merchants.js`).
      Idle in a town: observe prices, absorb rumours, score trades from their own knowledge (spec §8.4: believed
      price, staleness, travel cost, risk, uncertainty), buy real goods, hire crew, set out as a caravan along the
      route graph, pay tolls, sell on arrival (to the till, then households), record profit, repeat. Reasons stored
      for the inspector. Tests: AT-03 (response to a shortage), AT-04 (physical trade), AT-06 (competition
      compresses margins), AT-07 (risk sensitivity), AT-13 (legible reasons), money books still balance.
- [ ] **D3: the Outside and peddlers.** Saltmouth's ships trade for coin: restocking imports sends coin out of the
      region, taking exports brings coin in (new flows `imported` / `exported`; update the money identity).
      Peddler and tinker wayfarers carry a small pack and trade with the same logic.
- [ ] **D4: lab, gate tests, docs.** Caravans on the map with tooltips; merchant inspector ("what they know",
      "why this trade"); knowledge/letters view; gate D test (merchants trade profitably on stale information and
      sometimes misjudge); AT-25 (winter pays); spec §5/§10 "as built"; site progress entry; README/CLAUDE.md.

## Next

Start D1.

## Notes for whoever picks this up

- Money: whole bits, moved only by `transfer()` in `src/economy/money.js`. New flows must be added to the
  identity in `test/coin.test.js` and the Money panel's ledger line.
- Goods: only move via `withdraw`/`deposit` in `src/economy/market.js`.
- Determinism: see `/CLAUDE.md` (no Math.random/pow/Date in `src/`; named RNG streams).
- Before chart work, load the `dataviz` skill.
