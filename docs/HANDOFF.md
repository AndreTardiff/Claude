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
| D: merchants, caravans, knowledge, couriers | done |

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
- [x] **D3: peddlers and tinkers.** *(done: packs in `src/systems/wayfarers.js`)* Peddlers (4 units: salt,
      medicine, cloth, tools) and tinkers (3 tools) judge a small trade the way merchants do (aged price lists,
      coin on hand, trust; no crew), buy before setting out, sell on arrival, keep what a town can't pay for.
      They earn more resting (hawking, mending), and travellers with money spend it where they stay and after
      a good trip. A peddler who saves a wagon's worth founds a merchant house (one extra house allowed for them).
- [x] **D4: lab, gate tests, docs.** *(done)* Caravans (wagons: solid when loaded) and post riders (diamonds) on
      the map with tooltips and campfires; merchant inspector (status, "why this trade" with every candidate's
      parts, "what they know" beside the truth, ledger); rider inspector; Merchant houses panel; AT-25 (winter:
      fewer ventures, more per venture); spec v0.2.4; site progress entry.

## Next

**Step E: raiders** (Andre: go E with my suggestions: named merchants are captured and ransomed rather than
killed outright; nights get eventful plus a lab toggle to fast-forward quiet nights). Checkpoints:
- [x] **E1–E2** *(done: `src/systems/raiders.js`, `test/raiders.test.js`)*: bands of named outlaws (residents with
      `home: null`, profession `outlaw`) in hideouts by the wild roads; recruitment from the idle, more in hungry,
      broke towns, and hungry able-bodied workers are lured to the hills instead of leaving; lookouts track what each
      road carries and bands watch the best one. Roads are news: travellers report each road (quiet, signs,
      raided) as `road:<segment>` knowledge records that spread, get retold and fade; route planners and merchants'
      risk use *believed* danger (`believedExposure`). Encounters (hooks `onLegStart`/`afterLeg` in merchants,
      wayfarers and post): demand a toll / attack / steal at night; fight, flee or pay; hired hands die (residents of
      the town the caravan left), outlaws die, merchants are captured and ransomed (house, lord or town pays; a cruel
      band kills if nobody does), post letters are stolen. Gate E passes (a raided grain caravan leaves a shortage).
- [ ] **E3**: the raiders' economy: fencing loot (grey market), food and hunger, hoards and unearthing them, farm
      raids when starving, disbanding, moving hideouts; the lord's road patrols. AT-24 second half.
- [ ] **E4**: night and camps: fireside news, night raids (already: `steal`), lab fast-nights toggle; surprise
      closures and the camps experiment (§17.2).
- [ ] **E5**: lab (bands, hideouts, danger shading, band inspector, encounter reports, lab tool to summon a band:
      `lab:band` command exists), spec §11 as built, spec §20 status line (stale), site entry.
Finding so far: without E3's pressures (bands don't eat yet), raiding can be heavy (one world: 52 encounters in
200 days, Copperford down to 20 people).

**Step E0: Lord Aldric as an engaged NPC** (Andre's direction, Sep 28). Built:
`src/systems/lord.js` (traits, moods, decisions every 3 days with reasons; relief orders filled by merchants
and paid by the treasury, cried at inns and carried by the post; commissions for glutted crafts; festivals
that make a town grow faster; works paid as they go: granary, fields, houses, smithy, loom-house, via
`src/world/improvements.js`; saving up for works; the steward skims a fat treasury into a hoard).
Also: the Crown's due is now a quarter of the lord's *income* each season (`coin.treasuryIn`), and the Mint's
treasury target is 800 (the lord's reserve 250 sits well below it, so his spending keeps the Mint striking).
Tests: `test/lord.test.js`.

E0 is done (checkpoint E0b): lab "Lord Aldric" panel (`lab/lord.js`), spec §15.2.1, site entry. Tuning:
the Crown takes a fifth of the lord's non-Mint income each season; he keeps 250 back (100 for relief). Ideas Andre listed for later: bribes, corruption and thieves
(ties to mercenaries), the lord's death and heir (§15.2). Then step E (raiders) per the spec (§20).

Findings from D3: peddling pays mostly on essentials in a shortage (4 sacks of salt into a salt-starved town
fetch 60+ marks a sack). Most peddlers stay poor; one or two a world make good and found houses by day
40–130. With peddlers, Copperford holds ~30–34 people and famine deaths fall to 4–10 per 200 days.

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
