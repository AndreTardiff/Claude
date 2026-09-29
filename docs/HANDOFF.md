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
| E0: Lord Aldric as an engaged character | done |
| E: raiders, road news, weather, camps | done |
| **F: mercenaries, experience, encounters, standing orders** | **in progress** (F1–F4 sim done; F5 lab and docs next) |

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
- [x] **E3** *(done)*: bands eat (forage by hideout, stolen grain, grain bought through the fence; stock up in
      autumn), fence loot at half price into the fence town's market (grey market), spend half their surplus in the
      fence town and bury half (caches in `raiders.hoards`; a starving band digs its own up; strangers find old ones:
      new money flow `unearthed`), and when starving raid the weakest nearby town (only with a fair chance), move to a
      hideout with open roads, or break up (members go home as labourers). Drifters keep the hills from emptying.
      The lord's patrols (`lord.patrol`): guards ride a road his seat believes dangerous; lookouts spot less, fights
      go worse for bands, bands fear the road and may be run down. Balance (5 worlds × 400 days): 1–2 bands of 4–16,
      12–23 encounters per 100 days, a few town raids, rare breakups.
- [x] **E4** *(done: `src/systems/roads.js`, `src/world/closures.js`)*: surprise weather (flood at Mill Ford, snow on
      the High Pass, rockfall in Blackpine, storm at the Fenwatch ferry) shuts roads without warning; travellers learn
      by reaching them (`road:` record `what: 'closed'`) or hearing of it, and planners skip roads believed shut.
      Stranded travellers at a waypoint make camp; a camp ends as a named cold hearth or, if it held ≥3 days with ≥3
      people, a waystation whose inn (`inn:<waypoint>`) swaps news with everyone passing; unvisited ones close.
      At 22:00 travellers camped within 8 km share a fire and their news (`swapBetween`). Night raids are the
      bands' `steal`. Lab: "Skip quiet nights" (20× at night).
- [x] **E5** *(done)*: lab: hideouts (red triangles, band size), roads a band watches (red), the lord's patrols
      (copper dots), raids of the last three days (red bursts), surprise closures, hearths and waystations; band
      inspector (members and where they came from, food, purse, loot, captives, buried coin, why this road, lately);
      "Send 6 outlaws" lab tool; chronicle filters (merchants, raids & roads, Lord Aldric). Spec v0.2.6 (§11.1,
      §17.2 as built, §17.3 night decided, status); site entry; CLAUDE.md rules.

**Step F (Andre, Sep 29): deed-earned ranks whose stat gains depend on what the sellsword lived through; scute
armour, belief-driven charms and very rare true relics; gear gains tiers and names through use, slowly.**
- [x] **F1–F2 (sim)** *(done: `src/systems/mercs.js`, `src/data/mercs.js`, `test/mercs.test.js`)*: sellswords are
      residents (profession `sellsword`, founding populations unchanged, extra on top); stats, purse (`merc:<id>`), odd
      jobs and board; gear made from market goods (`useUp`) and paid to the till, mended, sold onto town racks. Merchants
      hire guards by believed exposure (and sellswords in town make them bolder); guards add to `def` in `resolve()`,
      may spot ambushes (else fight surprised), take blows meant for hands, kill outlaws; dead guards' gear goes to the
      band (band gear adds to its attack) or back on the wagons to a rack. Ledger → deed points → ranks (the most-trained
      stat +1) and traits (Forestwise, Goat-footed, Fenwise, Ambush Veteran, Night Fighter, Knows the Outlaw Ways,
      Trusted Pair, Scarred). Items: fights/kills/turned blows → xp → tiers (plain…legendary) and a name at storied.
      Charms: repute from wearers' luck; relics hidden. AT-10 (Forestwise) automated.
- [x] **F3** *(done: `lab/mercs.js`, inspectors in `lab/lab.js`)*: Sellswords panel (roster, "gear with a story",
      fallen), sellsword inspector (ledger, what their deeds trained, gear, lately), gear inspector (record, owners,
      roads, a charm's repute and the lab-only truth), guards in the merchant inspector, chronicle filter
      "sellswords & gear"; spec v0.2.7 §12.1–12.3; site entry. Balance (seeds 1/7/23 × 400–500 days): 30–50% of
      departures guarded, guards in 3–6 encounters, 1–3 Blooded, gear reaches "proven" rarely, none named yet.
- [x] **F4a–b** *(done: `src/systems/progress.js`, lord.js)*: the lord judges by what he has heard (knowledge holder
      `lord`; price lists now carry `hunger`); trips weighed apart from spending (`considerTrip`): tour (stale or
      worrying news), hunt (Blackpine), ships (Saltmouth, imports), ride (with a patrol, when angry). Household guards
      + hired sellswords escort him; bands gamble on worse odds for him (`lordOdds`); taken, he is ransomed
      (treasury, else the seat's households) and puts a bounty on the band (paid per head to killers). Patrols hire
      sellswords at the seat. The steward skims more while he's away. Lab command `lab:lord-trip`.
- [x] **F4c–e** *(done: `src/systems/orders.js`, fame in mercs.js, patrols)*: standing orders (threatened fight/toll/flee,
      give way when outnumbered ×N, drop or hold the load, double night watch) replace the temper rules in `resolve()`;
      merchants set them from temper, get warier after a bad day, bolder after guards win, drift back after 60 quiet
      days; reports name the order. Fame: renown from deeds (`addFame`), witnessed as `fame:<id>` knowledge records
      that spread like any news; employers weigh what the inn says, wages rise with fame, lookouts fear known names.
      Bands earn infamy; the bounty grows with it. Racks scrap plain gear after 120 days.
- [ ] **F5**: lab (lord on the map and his trips, orders in the merchant inspector, fame/infamy in panels), spec
      v0.2.8, site entry. Then step F is done. Later: loyalty, claimed vs true histories.
- [ ] (old line) **F4c–e**: standing orders (fight / pay / flee, cargo priority, night travel) replace the temper rules in `resolve()`;
      fame and infamy spread as news; the lord hires sellswords for patrols.

**Earlier plan text: step F (mercenaries, experience, encounters, standing orders)**, spec §12–§13. Raiders give them a job:
merchants hire guards (who add to `def` in `resolve()` in `src/systems/raiders.js`), guards gain experience from
real fights (traits like Forestwise, Night Fighter), and standing orders (fight / pay / flee, cargo priority, night
travel) replace the temper rules in `resolve()`. Andre's parked ideas for F and later: bribes, corruption and
thieves (the steward's skimming and band caches are hooks), bounty on a band, the lord's wants, age, death and heir.

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
