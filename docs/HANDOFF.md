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
| F: mercenaries, experience, encounters, standing orders, the lord's travels | done |
| G: the player (located, trades, dispatches, letters, travels, debt) | done |
| **G+: refine the world against the player (spec §20.1)** | **in progress: G+1–G+3 done; paused before G+4 (Andre)** |
| H: canvas client (small slice first) | after G+ |

## Step G plan (checkpoints)

- [x] **G1** *(done: `src/systems/player.js`, `src/data/player.js`, `test/player.test.js`)*: the player is a person in
      Kingscross with the family stall (stores per town, with cost basis), the family wagon, a purse (`player` account)
      and a note owed to the money-changer (`changer` account; interest and installment each season, two misses and he
      seizes coin and stall; nothing left and still owing: bonded for 30 days, then half written off). Commands:
      `player:buy/sell` (where you stand), `player:dispatch` (a caravan from your stores: good, road fast/balanced/safe,
      guards auto or n, standing orders, sell all/none, then wait/home/store, ride), `player:orders` (in person),
      `player:travel`, `player:courier` (orders to a far caravan; brings back that town's board; can be robbed),
      `player:borrow/repay`, `player:buy-wagon`. Player caravans are merchant records with `player: true` and
      `account: 'player'`: same travel, selling, crews, guards, tolls and encounters; left out of `activeMerchants`.
      Riding with one, you may die (heir takes over) or be taken for ransom. Knowledge holder `player`: the inn where
      you stand, your caravans' crews, letters (mail waits at the courier's town), your own eyes.
- [x] **G2** *(done: factors in player.js, `src/bots/trader.js`, `test/player-bots.test.js`)*: factors (hire in person in
      another town; a mark a day, owed wages pile up and they quit after 12 unpaid days; the board home by courier every
      3 days, robbable; sell your stores there when the price is 10% over its worth; a hidden honesty that skims).
      Also: `player:sell-wagon`; a waiting caravan where you stand is reused by `player:dispatch`. Bots: `smart` (rides
      with its caravan, trades from wherever it stands with the merchants' scoring on the player's own price lists,
      sells only above cost or carries on, stakes at most 2/3 of the purse) and `fixed` (one good, one road).
      **Findings:** AT-17 passes (no fixed policy best in more than 2 of 8 worlds). AT-18 passes (a factor in
      Copperford: more worth across 10 worlds, net of wages; very noisy per world). **AT-16 does not pass yet** (kept
      as a `todo` test): the smart bot beats the median house by 20% in about 2 of 10 worlds; typical year +1,200 marks
      against the median house's +2,900. Reasons: a smaller stake and a debt; the houses already play near-optimally
      on the same information; the player's edges (presence, couriers, factors) aren't worth much yet. This is the T2
      signal the spec asks us to watch (§22): add information decisions, redirects and contracts before content.
- [x] **G3** *(done: `lab/player.js`)*: "Your ledger" panel in the lab: status (purse, debt and next due, worth,
      wagons), caravans (with "sell here" / "send home" when you stand with them), stores, what you know beside the
      truth, factors, your recent ledger; forms for the market, sending a caravan (road, guards, standing orders,
      arrival instructions, ride), couriers, riding, the changer, wagons and factors; "let the bot play"; chronicle
      filter "your family". Spec v0.2.9 (§4.3, §21 findings); site entry. **Step G is done.**

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

## Next: step G+ (spec §20.1), decided with Andre, October 2026

Refine the simulation before building the client, but only the parts the player feels, and measure each change with the
player bots (`src/bots/trader.js`, `test/player-bots.test.js`) and the lab's ledger panel. No new world systems.
Measure with `npm run measure -- --seeds 1-10 [--set '<json overrides>']` (`copper-road/tools/measure.js`): how well
the houses guess, crowding, famine, each character's founding houses, and AT-16's rows for the smart bot.
Checkpoints, each ending tests green, reference regenerated, this file updated, pushed:
- [x] **G+1 Houses with habits and blind spots.** *(done: characters in `src/systems/merchants.js` and
      `merchants.characters` in `src/data/world.js`; `test/characters.test.js`; lab houses panel and inspector;
      `tools/measure.js`; spec v0.2.11 §10.3)*
      - Characters, one of each among the founders, new houses take the scarcest:
        - **creature of habit:** keeps to the first trade that paid, +20%; −10% for goods never carried; reads the
          board every 3rd day; drops the habit after two stings running (a loss, or under half the hope);
        - **optimist:** +15%, risk 0.6×, gullible, lower bar, expands sooner;
        - **pessimist:** −10%, risk 1.3×, skeptic, stale news counts 1.4×, but a lower bar, so it takes small sure
          profits instead of starving idle;
        - **follower:** +35% for a trade with fresh word it paid; good sales are told at the inn as
          `deal:<good>:<town>` records that spread as rumour;
        - **hoarder:** stakes ≤ 45%, lives meanly, expands late.
      - Each candidate carries `bias`; the inspector names the character and tags the bent trades.
      - **Calibration:** houses hoped for 81 marks a sale and made 174. `reversion` 0.08 → 0.05 and `stalePerDay`
        0.015 → 0.01; now they hope ~90 and make ~135, trade more, and fewer starve.
      - **Fixed while measuring:**
        - a caravan coming home put its load in the stall at cost 0 (`stow()` keeps the basis);
        - `refuse()` returned false, so `busy()` never blocked a command;
        - player caravans crewed and guarded empty wagons (now: loaded wagons only, as for houses);
        - the bankrupt loop. The changer now sells spare wagons (never the last), and a bonded player works for
          the richest house at 2 marks a day: half to the changer, half kept;
        - the conservation test now counts the open day's tallies (the lord's midnight feasts);
        - the fence test uses worlds where loot is taken.
      - **The bot** (several failure modes fixed, see spec §20.1): moves on once when idle, then home; sells to make
        the changer's due; grows to 3 wagons like a house, then repays the note; ranks loads with half the best
        back-haul at the far end.
      - **Findings:** every one of 20 years ends ahead (+850 to +2,750 worth), with 3 wagons and the note paid. On
        trading profit the bot is a little ahead of the median house: ~1.14× in the median world, 20% ahead in 9 of
        20 (AT-16 stays `todo`, now on trading profit). The lord's "loans" take 0 to 3,200 marks a year from a flush
        bot. Characters (20 worlds of founders) show risk and return:
        - optimists and followers earn most (medians ~3,200 and ~3,500) and are ruined most (7 of 20 each);
        - hoarders and pessimists earn less (~2,300, ~2,100) and rarely fail (2 and 3);
        - habit houses earn like the careful and fail like the bold (6): stale news, narrow choices.

        A habit rarely breaks, because habits form around trades that work. The bot's worst years (seeds 8, 17, 19)
        are where G+2 should start: which trades did it lose, and to whom?
- [x] **G+2 News that ages.** *(done: `bound:<caravan>` records and `beatenTo()` in `src/systems/merchants.js`,
      `heardBound`/`inboundBefore` in `knowledge.js`, `address()` in `player.js`; `test/rivals-news.test.js`; spec v0.2.12 §5.5)*
      - **Measured first:** with no rival selling the same good at the destination first, a trip made 162 and lost
        15% of the time; with one rival, 53 and 46%; with two or more, a loss on average.
      - **Departures are news:** the inn a load leaves from hears who, what, how much, where to and when due. It
        spreads and is retold. Merchants count loads they've heard will arrive first, and that aren't yet in their
        price list, as stock (optimists count half).
      - **Beaten to it:** `merchant:beaten` names the rivals when a caravan finds the price ≥25% under what it
        heard, after they sold there since it set out.
      - **Letters follow you:** couriers coming back and factors' letters go to where the player is or is bound.
      - **Factors:** 0.5 a day, a letter every other day. The player's news costs are tallied (`st.news`).
      - **Lab:** heard-of loads on each trade's line in "Why this trade?"; "Loads on the road" and the news cost in
        the ledger panel.
      - **Value of information** (scratch bots, spec §5.5 table):
        - the ceiling (fresh truth daily): +75% trading profit;
        - all markets 2 days old: +1,360 a year; 4 days old: nothing (the inns are that stale already);
        - one factor, or a courier habit: break-even;
        - a factor in every market: trading profit +1,090 ± 260 and worth +390 ± 160 net (28 of 40 worlds).
      - **Results:** crowded departures 30% → 15%, losing trips ~21% → ~16%, houses make ~165 a sale (hoping ~80),
        ~10 beaten-to-it entries a world-year.
      - **AT-18:** now a network of factors against none (30 worlds × 360 days); passes. AT-17 passes.
      - **AT-16** (now the network player, earnings net of news): about level with the median house, 20% ahead in
        about a third of the worlds. Still `todo`.
      - **Bot and player fixes found by measuring:**
        - a dead rider's caravan waited at the far town forever (now the crew bring it home);
        - the bot never roamed again after an empty move ended at home;
        - the bot forgot goods it had stored elsewhere.
      - **Bot options:** `factors: 'all'` and `couriers: true`; `npm run measure -- --policy '<json>'`.
      - **Where G+3 and G+4 should look:** the houses got better too (they now read departures). The player's edge
        is information plus back-hauls; what's left is risk (G+3: bands that sometimes attack guarded caravans) and
        rivals reacting (G+4).
- [x] **G+3 Bands weigh targets with more variety.** *(done: `nerveOf`, `bandNews`, `overthrow` in
      `src/systems/raiders.js`; `bandMood` in `knowledge.js`; `test/bands-nerve.test.js`; spec v0.2.13 §11.2)*
      - **Nerve:** the worst odds a band takes on start at 45%:
        - hunger loosens them gradually (+35% at full hunger; desperate still takes anything);
        - a rich load adds up to +15%;
        - a proud leader facing guards adds up to +18%, and attacks rather than demanding a toll;
        - a beating takes up to 25% off (`band.shaken`, fading); everything bounded to 20–72%.
      - **Leaders:** each has a pride. After a bad beating a member may throw the leader down (`raid:leader`), and
        the chronicle gives the motive when guards are taken on.
      - **Band mood is news** (`band:<hideout>` records): from the fence's tavern every 3 days and from anyone who
        meets the band. It is retold and spreads. `believedDanger` multiplies by the mood:
        - starving +60%, hungry +25%, a proud leader +25%;
        - lately beaten −30%, gone −50%;
        - fading over 15 days.
      - **Lab:** the band inspector shows nerve and what each town says of the band; the ledger lists "What's said
        of the bands". Bot option `orders` (standing orders for its caravans).
      - **Measured** (10 world-years):
        - guarded caravans set on 3.5 → 6.3 a year (23% → 32% of caravan encounters); stare-downs 11.3 → 8.6;
        - hands killed 5.9 → 8.8, outlaws 5.9 → 11.1, merchants taken 1.0 → 2.9;
        - "fight" orders lose something 61% → 31%;
        - optimists ruined in 6 of 10 worlds (they price danger low).
      - **Orders for the player** (20 worlds): fight / tolls / run change fights won, ransoms and deaths, but not
        the year's worth. The careful bot meets bands only ~3 times a year.
      - **Knock-ons:**
        - rank thresholds raised a quarter (6/20/45/88) to keep sellsword growth slow (guards fought ~25% more);
        - AT-18 now compares earnings (trade less news) over 40 worlds: the network's net gain is +370 ± 210 a year,
          positive but modest;
        - the AT-09 and AT-21 tests no longer assume what's in the log or the pouch beyond what they check.
      - **AT-16:** the plain bot (20 worlds) is 20% ahead in 10, median world 1.26× the median house. The test's
        network player, net of news costs, is 20% ahead in 3 of 10. Still `todo`.
      - **Paused here at Andre's request.** Suggested: the outside review (spec, HANDOFF, the lab,
        `npm run measure`) either now, to settle how AT-16 should be measured and whether the lord's "loans"
        punish a successful player too hard, or at the G+ exit before H.
- [ ] **G+4 Rivals react.** Houses crowd a paying route (margins close), the last into a glutted town pays for it, houses
      follow the player's visible success. Measure: AT-17 holds, route margins fall with crowding.
- [ ] **Exit:** AT-16 passes (turn the `todo` into a real test), AT-17/18 still pass. Spec and site updated. Then H (small slice).
Pacing (season length, trip times) is measured by play-testing, not changed without numbers.

## Earlier steps

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
- [x] **F5** *(done)*: lab: the lord's party on the map (pennant), lord inspector (where, why, party, what he has
      heard beside the truth, trips weighed), lab tool "Send Lord Aldric to see the town", orders in the merchant
      inspector, fame column and "told of at" in sellsword/band inspectors, band arms and bounty; spec v0.2.8; site.
      **Step F is done.** Parked for later: loyalty to employers, claimed vs true histories when hiring, the lord's
      age, death and heir, thieves and corruption beyond the steward.

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
