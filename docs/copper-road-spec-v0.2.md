# Caravans of the Copper Road
## Simulation Prototype Design Specification — v0.2.13

*v0.2.13 adds: bands that weigh their targets, as built in step G+3 (§11.2): nerve, proud leaders and usurpers, and a band's mood as news. v0.2.12 added: news that ages, as built in step G+2 (§5.5): departures are news, caravans are beaten to markets, letters follow you, and the value of information measured; factors on new terms, and AT-18 as a test of a network of factors (§4.3, §21). v0.2.11 added: the trading houses' characters and the first G+ measurements (§10.3, §20.1), bankruptcy as built (§4.3), and a sounder player bot (§21). v0.2.10 added: step G+ (§20.1), refining the world against the player before the client is built. v0.2.9 added: the player as built in step G (§4.3), with the first T2 findings (§21). v0.2.8 added: standing orders, fame and infamy as news, and Lord Aldric's travels, as built in step F (§12.3, §13.1, §15.2.2). v0.2.7 added: sellswords, gear that remembers, and deed-earned ranks, as built in step F (§12.1–§12.3). v0.2.6 added: raiders as built in step E (§11.1), the camps experiment (§17.2), and nights (§17.3). v0.2.5 added: Lord Aldric as an engaged character (§15.2.1), and the Crown's due as a share of his income (§8.6). v0.2.4 added: knowledge and the lord's post as built in step D1 (§5.4), merchants, caravans, the ships' coin and peddlers as built in steps D2–D3 (§10.1, §10.2). v0.2.3 added: coin and famine as built in step C (§8.6, §8.7) and map tooltips. v0.2.2 added step B's economy as built (§8.5), traveller livelihoods (§10.1), the living map from camps to towns (§17.2) and winter's rewards (§16). v0.2.1 added the player's starting situation, Lord Aldric and drifting names (§15.1, §15.2, §17.1). Supersedes v0.1 ([original document](copper-road-spec-v0.1.docx)). Status: prototype design authority. Target: a headless simulation core with a browser prototype (HTML5 canvas). Godot is a later option if we decide to go big.*

> **What changed in v0.2, in one breath.** The player is now a *person in one place* who learns about the world through letters that travel at road speed. There are two theses to prove, not one: the world must be worth watching, *and* the player's choices must be hard and meaningful. The closed three-town economy is opened with seasons, an Outside port, a copper mint, and money sinks that grow with a merchant's wealth. Every citizen does economic work, and the player's home town gets full Ultima VII-style daily schedules. Raiders fence, starve, recruit and bury treasure. Caravans leave with standing orders. Style modules (place names earned by history, ledger UI, songs, the Wending Fair) are scheduled in, each tied to a prototype question.

---

## 1. Executive summary

*Caravans of the Copper Road* is a merchant-first, low-fantasy living-world simulation. The world keeps moving whether or not the player acts. The player is **a person, standing in one town, holding a ledger**. They grow rich by reading regional conditions from imperfect, ageing information. They move goods, manage routes and risk, and hire people who can survive dangerous roads. Over time they grow from a single stall into a trading House with agents ("factors") in other towns.

Settlements, merchants, mercenaries, raiders, roads and even individual coins build up history through events. The first development target is a **simulation laboratory**, not the full game.

## 2. The two theses

The prototype has to find evidence for both of these. If either fails, the design is revised or killed.

| Thesis | Statement | Primary evidence |
|---|---|---|
| **T1 — The world is worth watching** | An observer can watch 10–20 minutes with no input and describe at least one coherent chain of cause and effect: production → opportunity → caravan → disruption → shortage → price → adaptation. | AT-01…AT-11, AT-15 |
| **T2 — The player's choices are hard and meaningful** | A skilled player clearly out-earns an average AI merchant, but no single strategy dominates. The player spends waiting time making decisions (reading letters, re-ordering caravans, buying information) rather than just fast-forwarding. | AT-16…AT-20 |

T1 without T2 is a screensaver. T2 without T1 is a spreadsheet.

## 3. Design pillars (revised)

| Pillar | Rule |
|---|---|
| **Living autonomous world** | The world never needs the player present to move forward. |
| **Merchant-first strategy** | Combat and characters serve commerce; they are never the main game. |
| **Information is the real currency** | Nobody, the player included, knows current prices anywhere except where they are standing. Knowledge travels physically. |
| **Everyone works** | Every resident contributes to production, consumption, a service or security. No decorative NPCs. |
| **People, not unit stacks** | Named characters remember, change and can die. Growth comes from context, not XP. |
| **History has mechanical meaning** | Every story entry should change future behaviour, value, names or attachment. |
| **Plan, don't micromanage** | The player chooses people, goods, routes, orders and preparation; agents carry them out. |
| **Legible causality** | Every important outcome can be explained through reports and inspectors. |
| **Small systems that combine** | One system that feeds three others beats three standalone systems. |
| **Style is a design tool** | When stuck, turn up the strangeness, but only in ways that change mechanics. |

## 4. The player: a person in one place

### 4.1 Decision
The player is a **physical person** with a location. This was chosen over an all-seeing trade house because it gives the game intrigue, gives the Ultima VII town layer a reason to exist, and makes information valuable.

| | Person in one place (chosen) | All-seeing trade house |
|---|---|---|
| Feels like | *Taipan!* / Ultima VII: you live somewhere and gossip reaches you | *Patrician* / spreadsheet tycoon |
| Information | Local prices are live; everything else arrives by letter, and it's old | Everything visible, always |
| Downtime between trips | Visit the inn for rumours, read mail, meet people, re-plan | Fast-forward |
| Player can die | Yes, if they travel with a caravan | Only abstractly |
| Late game | Naturally grows into the House model through factors | Is already the House model |

### 4.2 The arc: Stall → House
1. **Stall (prototype start).** One person in one town (default: Kingscross) with a small purse and a debt.
2. **Traveller.** The player may ride with their own caravan. They see the road first-hand, gain fresh information, and risk death.
3. **Factors.** The player hires agents in other towns. Factors send reports by letter, can trade on standing instructions, and have their own honesty, skill and ambition. A factor can embezzle, defect to a rival, or become the player's heir.
4. **House (post-prototype).** A network of factors, warehouses and routes, managed through correspondence.

The move from "I know my town" to "I manage people who know their towns" *is* the progression system.

### 4.3 The player, as built in step G
- **Start (§15.1):** the heir to the family stall in Kingscross (8 bolts of cloth, 4 tools, 3 sacks of salt), the family wagon, 40 marks, an old porter, and a 300-mark note owed to Ansel Crabbe the money-changer. Two letters from the parent's old contacts are still on the road.
- **Knowledge:** you see your own town's market and hear its inn. Everything else reaches you by letter (couriers, factors), rumour, your caravans' crews when they come in, or your own eyes when you go.
- **Commands** (everything is `sim.command`, so it replays exactly):
  - buy and sell where you stand; your goods live in stores in each town, with what they cost;
  - send a caravan from your stores: a good, a road (fastest, balanced, safest), guards (as the danger warrants, or 0–4), standing orders (§13.1), and what to do on arrival (sell or not; then wait, come home, or store it there). You can ride with it;
  - give orders to a caravan standing where you are;
  - ride somewhere alone;
  - send a courier with orders for a far caravan (it waits a few days for one on its way) who brings that town's board back, to wherever you are by then or are bound. Couriers can be robbed and the orders lost;
  - borrow and repay (only in Kingscross, only against what you're worth);
  - buy or sell a wagon; hire or dismiss a factor.
- **Same rules:** your caravans are merchant records run by your commands instead of the AI. They travel, sell, pay crews and tolls, hire sellswords and meet bands by the very same code. The lord's "borrowing" from the rich applies to you too.
- **Stakes:**
  - The changer's due each season is interest (2%) plus 4% of the principal. Two missed payments and his man seizes your coin, sells off the stall, and sells any spare wagons in the yard back to the wheelwrights (a named collector). He never takes the family's last wagon: a carter's wagon is his living.
  - Nothing left and still owing: you are bonded as a factor to the richest house for 30 days. It pays 2 marks a day; the changer takes half against the debt, and you keep the rest to start again. When the bond is served, half of what's still owed is written off.
  - Ride with a caravan that loses a fight and you may be killed (15%). Your heir, the next of the family, takes up the ledger, the stores and the debt, and the crew bring the wagons home after the trip. Or you are taken for ransom.
- **Factors** (§4.2 stage 3): hired in person in another town, for half a mark a day on the side of their own trade (unpaid wages pile up; they quit after 12 days).
  - They write every other day with the town's board and its talk, including who has left for where with what (§5.5). The letter goes by courier to wherever you are or are bound, and it can be robbed.
  - They sell your goods stored there when the price is 10% over its worth.
  - Each has a hidden honesty, and some skim.
  - What your news costs (factors' wages, couriers' fees) is kept in your ledger.
- **Player bots** (`src/bots/trader.js`) play by commands only. *smart* rides with its caravan and trades from wherever it stands, using the houses' own scoring on its own price lists. It also weighs what it could buy at the far end to carry on (a back-haul), which the houses don't. It sells only above cost (or carries on), sells at a loss rather than miss the changer's due, and never stakes more than two thirds of its purse. With nothing worth carrying, it moves on once to where the buying looks better, or to goods of its own stored elsewhere, else home to wait. It grows to three wagons as a house would, then pays off the note. Options: keep a factor in every market it trades in (`factors`), or send couriers for news once its lists are four days old (`couriers`). *fixed* carries one good down one road.
- **Same rules, kept honest** (step G+1): your caravans hire crew for their loaded wagons only (the empty ones are roped behind), and sellswords only for a load, as the houses do. A load that comes home keeps its cost in the stall. A command you can't give from where you are (bonded, held, on the road) is refused and does nothing.

## 5. Information system (new core system)

### 5.1 Knowledge records
Every actor (the player, merchants, factors, raiders) holds **knowledge records**, never direct access to world state:

```
KnowledgeRecord
  subject        (settlement:good price | route danger | caravan sighting | person status)
  value          (the observed value)
  observed_at    (sim time when true)
  source         (seen | letter | rumour | factor report | forged)
  confidence     (0–1; rumours low, own eyes high)
```

The UI always shows age and source: *"Grain @ Copperford: 14 — 3 days old — letter from factor Idris."*

### 5.2 How information moves
| Carrier | Speed | Cost | Reliability | Can be intercepted |
|---|---|---|---|---|
| Own eyes (present in town) | Instant | Free | Exact | — |
| Caravan crews returning | Caravan speed | Free | Good | With the caravan |
| Paid courier letter | ~2× caravan speed | Coin | Good | Yes, by raiders |
| Inn rumours | Travel with any traveller | A drink | Noisy, sometimes false | — |
| Factor reports | Courier speed, regular | Wage | Depends on factor's honesty | Yes |
| Posted price boards (town crier) | Local only | Free | Exact but only local | — |

**Letters are physical cargo.** A courier is a tiny caravan. Raiders who stop one may read, destroy or sell its letters, so information can be stolen and even **forged** (post-prototype).

### 5.3 Decisions this creates while waiting
- Send a fast rider to redirect a caravan already on the road ("Don't sell at Copperford — the price collapsed").
- Pay for a courier, or wait for free news.
- Trust a rumour, or send a scout.
- Buy a rival's lost ledger from a fence.

### 5.4 Knowledge, as built in step D1
- **Price lists** are the records: a dated snapshot of one market (price, stock and desired stock of every good, and how much coin its traders and households hold), with a source and a confidence. Every inn and every traveller (wayfarers, post riders, merchants) holds them, and keeps only the freshest list per market.
- **Sources:** *seen* (own eyes), *board* (the town's posted prices, kept at its inn and refreshed at midnight), *post* (letters: exact, but as old as the ride), *rumour* (word of mouth: each retelling nudges prices, stocks and coin by up to ±6% and costs 15% of the trust).
- **Swapping news:** a traveller arriving in a town sees its market, then swaps with the inn; each side takes whatever the other knows that's fresher.
- **The lord's post:** two riders on a fixed circuit through Kingscross (Copperford, Greenhollow and Saltmouth in turn) at 7 km/h, resting 8 hours at each stop.
- **Result:** news of a disaster in Copperford reaches Kingscross in about 4½ days, Greenhollow in about 6, Saltmouth in 8 or more. Every town's picture of the others is always somewhat out of date, and that is what merchants trade on.

### 5.5 News that ages, as built in step G+2
Measuring the houses showed what the news was missing. When nobody else had sold the same good at the destination first, a trip made 162 marks on average and lost money one time in seven. With one rival there first, it made 53 and lost nearly half the time; with two or more, it lost money on average. Nobody could hear who else was on the road.
- **A load setting out is news.** The inn it leaves from hears who is bound where, with how much of what, and when they should be there (a `bound:<caravan>` record). The word spreads like any other and is retold (the size of the load grows or shrinks in the telling). It usually reaches the next town after the load does, but it still tells a merchant that their price list is out of date.
- **Merchants reckon with it.** When weighing a trade, they count as stock already in the market any load they've heard will get there before them that isn't in their price list yet. An optimist counts only half: they'll be there first. The inspector shows the loads heard of on each trade's road; the player's ledger lists the loads you've heard are on the road.
- **Beaten to it.** A caravan that arrives to find the price a quarter or more below what it had heard, after rivals sold the same good there since it set out, has been beaten to it. The chronicle names them: *"Edric Quennell reaches Saltmouth with grain to find Lorcan Ashdown got there first: it fetches 8 marks 7 bits a sack now, not the 11 marks 7 bits they had heard."*
- **Letters follow you.** A courier coming back, and a factor's letter, ride to the town you're in, or the one you're bound for if you're riding with a caravan. If you've moved on by the time they get there, the letters wait at that inn.

**Result.** Departures that crowd onto the same good and town fell from about 30% to 15%. Losing trips fell from about one in five to one in six, and the houses now make about 165 marks a sale where they hoped for 80. About ten caravans a year are beaten to a market.

**The value of information, measured** (the smart bot over a year, in 20 to 40 worlds):

| What the bot is given | Trading profit a year |
|---|---|
| Every market as it truly is, every day (a cheat, for the ceiling) | +1,900 (+75%), ahead in 18 of 20 worlds |
| Every market as it was 2 days ago, every day | +1,360, ahead in 16 of 20 |
| Every market as it was 4 days ago (about as old as the inns' news already is) | +300, within the noise |
| One market, 2 days old, every 3 days | +300 to +380, within the noise |
| A factor in one market | about their wage: break-even |
| Couriers whenever its news is 4 days old (about 45 a year) | about their fees: break-even |
| A factor in every market, writing every other day | trading profit +1,090 ± 260; worth +390 ± 160 net of wages, ahead in 28 of 40 |

News is worth paying for when it's fresh and covers every choice. One town's word, however fresh, rarely changes a decision; a network does. That is the progression the arc promised (§4.2): from knowing your town to managing people who know theirs. The houses rely on the inns and don't keep factors, so a network is an edge only the player can build.

## 6. Prototype scope

### 6.1 Required ("prove now")
- One region: **three towns + one Outside node** (the port of **Saltmouth**, reached by one road). Two or three route choices between the important towns.
- **Seasons (required).** Four seasons of 10 days each in the prototype. They affect harvests, road conditions and demand.
- 7–9 goods (§7.3), plus **coin** as a physical, mintable good.
- ~80–150 persistent NPCs: full schedules in the **player's town**, coarser simulation elsewhere (§9).
- 3–6 AI merchants using the same knowledge system as the player.
- Physical caravans **and couriers** carrying goods and letters.
- 1–3 raider groups that are economic actors (§11).
- 10–15 mercenaries with experience ledgers.
- Automatic encounters with **standing orders** (§13).
- Player: located in one town, can travel with caravans, can hire at most 1–2 factors.
- Bankruptcy, debt and death (§15).
- Event log, letters, after-action reports, full debug tools.
- A headless run mode and deterministic seeds.

### 6.2 Out of scope (unchanged unless noted)
Large maps or procedural worlds; tactical combat; deep politics, marriage or dynasties (a simple **heir** is *in*, §15); crafting trees; player town building; LLM-driven NPCs; complex law, religion or crime; final art and audio; multiplayer or mods.

**Scope gate:** *"Which thesis question (T1 or T2) does this help test?"* If there's no clear answer, defer it.

## 7. The world

### 7.1 Nodes
| Node | Identity | Produces | Needs | Role |
|---|---|---|---|---|
| **Copperford** | Mining town with the **Mint** | Copper ore, **coin** | Grain, timber, tools | Raw surplus; money supply |
| **Greenhollow** | Farming village | Grain, wool, livestock | Tools, cloth, salt | Seasonal food surplus |
| **Kingscross** | Market/craft town; player's home; the lord's seat | Tools, cloth | Food, ore, timber | Demand hub; taxes |
| **Saltmouth** *(Outside)* | Estuary port to the wider world | Salt, medicine, luxuries (imports) | Ore, cloth, wool (exports) | Source and sink of coin and goods |

### 7.2 Routes
- Kingscross ↔ Copperford: **King's Road** (safe, slow, tolled bridge) or **Blackpine Forest track** (fast, dangerous).
- Kingscross ↔ Greenhollow: **Meadow Road** (safe; floods in spring).
- Greenhollow ↔ Copperford: **High Pass** (short; closed in winter).
- Kingscross ↔ Saltmouth: **Estuary Road** (long; the only way to the Outside).

Travel times are long enough that prices change while caravans are on the road (§16).

### 7.3 Goods
| Good | Source | Why it exists |
|---|---|---|
| Grain | Greenhollow (seasonal) | Essential; shortages are easy to read |
| Copper ore | Copperford | Namesake; Kingscross input; export; **minted into coin** |
| Tools | Kingscross | Shortages cut productivity elsewhere |
| Timber | Small local + Outside | Repairs and construction |
| Wool | Greenhollow | Mid-value trade good; Kingscross input |
| Cloth | Kingscross | Value-added export |
| Salt | Saltmouth | Needed to preserve food through winter; a strong seasonal driver |
| Medicine | Saltmouth | Low volume, high value; demand spikes on emergencies |
| Luxuries | Saltmouth | High margin, non-essential; the lord's household wants them |

### 7.4 Seasons
| Season | Effects |
|---|---|
| Spring | Meadow Road floods (slow). Greenhollow plants (low grain output). Wool shearing. |
| Summer | Peak travel. Raiders most active. |
| Autumn | Harvest: grain surplus crashes Greenhollow prices. Salt demand rises (preserving). |
| Winter | High Pass closed. Grain consumption continues, production stops. Medicine demand rises. Raiders go hungry (§11). |

## 8. Economy

### 8.1 Settlement stock model (as v0.1)
Each settlement has, for each good: `current_stock, desired_stock, production, consumption, base_value, local_price`.

```
scarcity     = desired_stock / max(current_stock, 2% of desired_stock)
stock_factor = (floor + cap·q·x) / (1 + q·x),   x = scarcity^power (power 1 or 2),  q = (1 − floor)/(cap − 1)
price        = base_value × local_factor × stock_factor
```
The stock factor is 1 when a town holds exactly what it wants, rises smoothly toward `cap` as stock runs out, and falls toward `floor` in a glut. Essentials (grain, salt, medicine) use power 2 and a wide range (×0.3 to ×5), so shortages bite hard and fast; luxuries stay within ×0.5 to ×2. `local_factor` is 1 in the towns and the world price at the Outside. Seasonality doesn't need its own price term: it arrives through need (winter wants firewood, autumn wants salt) and through production (the harvest). Buying moves stock immediately, and the lab's quotes integrate the price over a trade, so dumping 30 sacks into a small market fetches less than 30 × today's price. Every quote carries its parts for the inspector.

### 8.2 Production comes from people
Production is not a settlement constant. It is **the sum of the workers' output**:
```
production(good) = Σ worker.output × tool_modifier × health/morale × season_mod
```
If the blacksmith dies, tool output falls. If his apprentice takes over, output is lower until the apprentice gains skill.

### 8.3 Money: sources, circulation, sinks
Coin (*copper marks*) is a physical stock in towns, purses and caravans. The money supply is **simulated, not assumed**.

**Sources (coin enters the region)**
| Source | Mechanism |
|---|---|
| **The Mint** (Copperford) | Converts copper ore into coin at a fixed rate on the lord's licence. High ore prices slow minting, so the money supply depends on the mine. |
| **Outside buyers** (Saltmouth) | Foreign ships buy ore, cloth and wool for coin at **world prices**. These drift slowly and occasionally jump ("the southern war wants copper"). |
| **Lord's pay** | Garrison wages paid out from tax revenue (circulation, not creation). |
| **Buried hoards** | Coin raiders bury is removed from circulation. If it's found, the coin comes back (§11). |

**Circulation.** Wages go to workers, workers buy food locally, merchants buy goods, and so on. Every NPC has a purse.

**Sinks (coin leaves the region or is locked away)**
| Sink | Mechanism |
|---|---|
| Outside imports | Salt, medicine and luxuries cost coin paid to Saltmouth ships, which leaves the region. |
| Tolls and market fees | A flat cost per crossing or sale, paid to the lord. |
| **Wealth levy** | An annual tax that is **progressive** on declared wealth. It rises sharply above a threshold. |
| **Forced loans** | When any merchant's wealth passes a share of the regional money supply, the lord demands a "loan". Refusing costs reputation and access to tolls. Repayment is unreliable. |
| Spoilage and wear | Grain rots, coin is clipped, wagons break. |
| Hoarding | Raiders and misers take coin out of circulation. |

The **rubber band on runaway success** is diegetic, not artificial: the richer you get, the more the lord, the guild and rivals want from you. Historically, King Edward III's defaults on his loans helped bring down the great Florentine banking houses of the Bardi and Peruzzi. We want that story available.

### 8.4 Merchant opportunity (revised to use knowledge)
```
expected_revenue = believed_dest_price × qty × (1 - staleness_discount)
purchase_cost    = local_price × qty
travel_cost      = provisions + wages + animals + tolls
risk_cost        = believed_route_danger × cargo_value × risk_weight
info_uncertainty = f(age, confidence) × cargo_value × caution
score            = revenue - purchase - travel - risk - info_uncertainty
```
Merchants act only on **their own knowledge records**. Stale knowledge produces believable mistakes.

### 8.5 Step B as built
- **Named residents** in every town (122 people), each with a trade, a skill and a home. Production is the sum of their work: `rate × season × skill × hunger factor × tool factor × effort`.
- **Elastic trades** (miners, woodcutters, smiths, weavers) work harder when their output is dear locally and slack off in a glut (effort 35%–125%). **Inelastic** ones (farmers, shepherds) bring in what the season gives. Without trade, Copperford's miners idle because nobody nearby wants the ore.
- **Crafters need inputs.** Without ore, Kingscross's smiths manage only 20% makeshift output from scrap. This is the slow restoring force that keeps an interrupted town limping instead of collapsing.
- **Hunger** is a slow average of how much grain went uneaten; a starving town works at 60%. **Tools** wear out and are replaced from stock; a town with no spare tools also works at 60%.
- **Succession:** when a worker dies, a labourer (or a dependant) takes up the trade two days later as an apprentice and learns on the job (AT-09).
- **Storage and spoilage:** grain spoils slowly; anything beyond a town's storage is lost.
- **The Outside:** ships pull Saltmouth's stocks back toward fixed anchors at world prices (salt ×0.6, ore ×1.35 and so on).
- **Travellers are consumers:** wayfarers eat where they stay and buy provisions from the market they leave.
- **Market news** turns band changes (running low, all but out, back in the market, piling up unsold, the harvest) into chronicle entries, at most once per story every ten days.
- **Without merchants (until step D)** the result is the opportunity map the game is built on: Kingscross and Copperford run out of grain in the second year, salt runs out everywhere when autumn salting starts, Greenhollow's tools wear out, and Copperford's ore piles up. The lab's opportunity board prices what fixing that is worth.

### 8.6 Coin, as built in step C (Andre's currency)
**Denominations.** Copper is the heart of it:
| Coin | Worth | What it is |
|---|---|---|
| **Verdigris bit** | ¹⁄₁₂ mark | A sliver of old copper gone green. Small change is the same metal, aged. |
| **Copper mark** | 12 bits | Struck at the Mint in Copperford from the region's own ore. |
| **Scute** | 20 marks | A shed shell plate of the Old Carrier (§18). Nobody mints scutes: only the tortoise makes them, so they arrive with the Wending Fair experiment (K), and forged scutes are a raider's dream. |

Money is counted in whole bits, so every sum is exact on every engine.

**Where coin sits:** each town's households (a purse), its market traders (a till), Lord Aldric's treasury, and every wayfarer's purse. Money only moves by transfer, and five flows cross the edge of circulation: **minted** (the Mint), **gifted** (the lab), **the Crown's due** (leaves the region), **worn** (clipped, lost and worn away) and **buried** (hoards under the floorboards, tallied per town so raiders or the player can dig them up later). At every moment, *money in circulation = opening + minted + gifted − Crown − worn − buried* (a step C test).

**Flows:**
- Traders buy what's made at the day's price and sell what's used, taking a 4% market fee for the lord. They pay out takings above their float to households.
- Households buy food first, then the rest, and only what they can afford. **Poverty is now a cause of hunger alongside empty granaries.** Farming households eat what they grow without coin changing hands.
- The treasury pays the guards (a mark a day each), buys luxuries for the lord's household, gathers a spring hearth tax (a mark a head, never more than a tenth of a town's purse), takes tolls at Aldric's Bridge, and sends the Crown a share of its income each season (*changed in E0:* a fifth of what came in, not counting the Mint's profit, so a lord can't dodge the due by spending first).
- **The Mint strikes coin only to top up the lord's treasury** (to 600 marks; 800 from E0, so his spending keeps it working), and only while ore costs less than 80% of the 16 marks a load yields. The ore's price goes to Copperford's market; the difference (seigniorage) goes to the lord. Early on, the lord's appetite for luxuries is what sets the Mint working. Nobody wrote that as a story, but it's one.
- **Coin with nothing to buy goes under the floorboards:** households holding more than 40 marks a head bury 2% of the excess each day.

**Result (the step C gate):** without a player or merchants, money in circulation rises from about 2,850 marks, levels off between 4,000 and 5,500 within two years, and stays there. In step D, imports from the Outside become the big outflow and exports the big inflow.

### 8.7 Famine, migration and recovery (Andre's rule)
Famine can kill, but the region must settle into an equilibrium rather than race to the bottom.
- **Deaths:** at famine level hunger, the weakest die first (dependants, then labourers, then the trades, with farmers and shepherds last). The lord's household and officials never die of hunger.
- **Turning to the land:** in a hungry town, people give up their trade to farm, up to the town's farmland (Kingscross 5 farmers at 80% yield, Copperford 3 at 60%, Greenhollow 12). Both towns stay grain importers, so merchants have work.
- **Migration:** people leave hungry towns for the best-fed town with room. If nowhere has room, they take ship at Saltmouth for the wider world.
- **Growth:** well-fed towns with grain to spare grow through births and newcomers, faster while below their founding size.
- **Bounds:** no town falls below 40% of its founding size or grows past 120%.

Result, without merchants: Kingscross falls from 55 to the high 30s in its second-year famine, turns to the land, and recovers to the mid-40s, fed. Copperford settles around 20. Greenhollow fills to its ceiling. Hunger ends and stays low.

## 9. Living world: residents and schedules

### 9.1 Goal
Ultima VII: *The Black Gate* and *Serpent Isle* made towns feel inhabited because people kept visible schedules. They opened shops, ate at the inn, went home and slept. We want that feeling, but **every schedule slot has to feed the simulation**.

### 9.2 Every citizen contributes
| Role type | Examples | Economic hook |
|---|---|---|
| Producer | Miner, farmer, smith, weaver, woodcutter | Adds stock (§8.2) |
| Service | Innkeeper, healer, priest, crier, stablehand | Innkeeper creates rumour traffic and rest. Healer reduces injury time. Priest raises morale. Crier posts local prices. Stablehand raises caravan speed. |
| Security | Guards, militia | Lower danger near town; militia muster when the town is attacked |
| Logistics | Porters, carters, couriers | Loading speed; carry letters |
| Dependants | Children, elders | Consume goods; elders are rumour sources; children grow into workers (post-prototype) |
| Idle / unemployed | Anyone who loses a job | **Raider recruitment pool** (§11); migration pressure |

### 9.3 Simulation levels
| Level | Who | Update |
|---|---|---|
| **Full schedule** | Everyone in the **player's current town** | Ultima VII-style: hourly schedule with visible movement between home, work, inn and bed. Needs and events override it. |
| **Regional agent** | Merchants, caravans, couriers, raiders, named mercs, factors | Decision ticks; physical travel on the route graph |
| **Background resident** | Residents of towns the player isn't in | Coarse hourly state (at work / home / asleep); output counted; no pathfinding |
| **Aggregate** | Population-wide modifiers | Daily |

Because the player is *in one place*, only one town at a time needs full detail. When the player travels, the destination town switches up to full detail and the old one switches down. That is cheap and fits the game.

### 9.4 Schedule example (unchanged format)
```
Blacksmith Oswin
  06:00 wake / eat at home     07:00 walk to smithy
  08:00–12:00 work (tools +)   12:00 meal at the Tin Cup inn (hears/spreads rumours)
  13:00–18:00 work             18:00 inn or home
  22:00 sleep
Overrides: town attacked → militia; hunger → buy food; injured → healer; no ore → idle at inn
```

## 10. Merchants and caravans
Same loop as v0.1, with these changes:
- **Knowledge-based** decisions (§8.4).
- Merchants **write and receive letters** and keep contacts.
- Merchants reroute only at route nodes, or when a courier catches up with them.
- **Couriers** are lightweight caravans carrying letters (cargo value ≈ information value).
- Personality parameters as in v0.1, plus **honesty** (for factors and partners) and **ambition** (willingness to pay levies versus hide wealth).

### 10.1 Traveller livelihoods (Andre's idea, staged)
Travellers should live like everyone else: they carry a purse and goods, earn a living, pay for lodging and food, and may get robbed or murdered for what they carry.
| Piece | Step |
|---|---|
| Eat where they stay; buy provisions before a trip | **B (built)** |
| Purses; paying for food, lodging and tolls; wages for work done | **C (built)** |
| Peddling: a wayfarer with a small pack is the smallest merchant (buy cheap, sell dear) | **D (built)**: peddlers carry 4 units (salt, medicine, cloth, tools), tinkers 3 tools; judged like a merchant's trade, with no crew. A peddler who saves a wagon's worth founds a merchant house. |
| Robbery and murder for what they carry; fenced goods and stolen letters | E (raiders) |
| Homes and rent; the prosperous upgrade (cottage → townhouse), the ruined downsize or take to the road | I (town view) |
| A traveller who can't pay for lodging sleeps rough, joins a camp or becomes a raider | E / §17.2 |

### 10.2 Merchants, as built in step D2
**Houses.** Five trading houses, each a named merchant (*Piers Harrow*, *Alys Vell*…) with a home town, one or two wagons of 30 units, a purse of 150–400 marks, a temper (boldness) and a threshold: the least profit a day each loaded wagon must earn to be worth the road (4–12 marks).

**Choosing a trade.** Idle in a town, a merchant sees the market and swaps news at the inn, then scores every good they could buy here against every market they hold a price list for (§8.4, as built):
- *Believed takings:* the sale into that market as the price list describes it, with its shortage or glut expected to ease by arrival (5% a day since step G+1, was 8%; the ships close Saltmouth's gaps faster), and never more than the coin its traders and households were said to have over the days they'd try to sell.
- …discounted 1% for each day the news will be old on arrival (1.5% before G+1; at most 40%) and for trust (rumours count less than letters).
- *Less:* the purchase (the price climbs as they buy), the lord's 4% fee, provisions and crew wages (three hands per loaded wagon, half a mark a day each), tolls, and a risk premium (the road's danger × the takings × their caution). The timid also pick safer, slower roads.
- They take the most profit a day among the trades where every loaded wagon clears their threshold. After three idle days, they move on empty to wherever the buying looks best.

**Physical trade.** Goods leave the market when loaded and arrive only with the caravan (AT-04). Tolls are paid at Aldric's Bridge and Fenwatch Ferry, and the crew are paid off where the trip ends. **Selling:** to the town's traders, with households chipping in up to a quarter of their savings for one load. A town that can't pay for it all gets two days while its tills refill; then the rest goes elsewhere, once; then it's let go for whatever it fetches.

**The ships' coin.** At the Outside, merchants trade with the ships directly: the ships pay coin for exports (coin enters the region) and take coin for imports (coin leaves it). The money identity gains two flows: *money in circulation = opening + minted + gifted + exported − Crown − worn − buried − imported.*

**Houses rise and fall** (the rubber band, §8.3):
- A house's household spends a mark a day at home, plus 4% a day of whatever the house holds beyond its working capital (150 marks a wagon).
- A thriving house buys another wagon from its home town's wheelwrights (200 marks, up to three).
- Lord Aldric "borrows" a fifth of anything a house holds above 1,000 marks, each season.
- A house with empty wagons and less than 40 marks is ruined. While the region has fewer than five houses, the town with the most savings per head backs a new one with 200 marks.

**Comforts.** Households with savings to spare (from 20 marks a head, fully at 60) buy cloth, tools and a little luxury. It keeps coin moving out of towns that grow rich, instead of all of it going under the floor.

**Every decision keeps its reasons:** the top candidates with their parts (believed takings, purchase, carrying costs, risk, profit a day), the choice, or why they stayed put (AT-13).

**Result.** Over 200 days, merchants make 50–60 ventures and lose money on about one in ten, mostly on old news or when rivals got there first. Compared with the same world without them, fewer people die of famine or take ship, and Kingscross and Copperford hold more people. Exports make the ships the region's biggest source of coin, which settles between 7,000 and 8,600 marks, a third of it in the houses' purses. Kingscross, which must buy its bread, stays the poorest town and still goes hungry at times: the next thing to tune.

### 10.3 Characters, as built in step G+1
Each house has a character that bends how it weighs a trade and reads the news. The founding five have one of each; a new house takes whichever the active houses have fewest of. Everyone on the road knows the Vells are creatures of habit: a character is public, so a player can read it and play against it.

| Character | How it bends the reckoning | Its blind spot |
|---|---|---|
| **Creature of habit** | Keeps to the first trade that paid (it counts on 20% more from it) and expects 10% less from any good it has never carried. Reads the inn's board only every third day and otherwise goes by its own lists and eyes. Gives up the habit only when it stings twice running (a loss, or under half what was hoped), for whatever has paid best since. | Stale news, narrow choices |
| **Optimist** | Counts on 15% more from every load, prices the road's danger at 0.6×, takes hearsay at its word, sets out for less, and buys wagons sooner. | Crowds into gaps, loses more trips |
| **Pessimist** | Expects 10% less, prices danger at 1.3×, counts old news and hearsay hard against a trade (squared trust), but takes small, sure profits (a lower bar). | Leaves good trades on the table |
| **Follower** | Counts on 35% more from a trade it has fresh word paid (within 14 days). | Follows others into closing gaps |
| **Hoarder** | Never stakes more than 45% of its purse on one load, its household lives meanly, and it buys wagons late. | Small loads |

**Talk of good sales.** A sale at a profit is talked of at the inn where it was made: a `deal:<good>:<town>` knowledge record (who, what, from where, how much). It spreads and is retold like any news (rumour noise on the profit). Followers act on it.

**In the inspector:** each house's character in words, and a tag on every trade it weighed that its character bent ("the usual trade", "never carried it", "heard it paid", "optimism", "pessimism"). The houses panel shows each house's character.

**Calibration.** Measuring the houses against what they hoped found them twice too gloomy (81 marks hoped a sale, 174 made): they expected shortages to close too fast and discounted news too hard. With 5% a day and 1% a day of age, they hope for about 90 and make about 135. They trade more, and fewer people starve.

**Result (the founding houses of 20 worlds, a year each):** risk and return. Optimists and followers earn the most (median about 3,200 and 3,500 marks) and are ruined most often (7 of 20 each). Hoarders and pessimists earn less (about 2,300 and 2,100) and rarely fail (2 and 3 of 20). Creatures of habit earn as little as the careful (about 2,300) and fail nearly as often as the bold (6 of 20): stale news and narrow choices, a blind spot a player can read. A habit rarely breaks, because habits form around trades that work.

## 11. Raiders as economic actors
| Behaviour | Economic effect |
|---|---|
| **Raid** caravans and couriers | Goods and letters fail to arrive; danger rises |
| **Fence** stolen goods through a disreputable dealer in a town | Cheap goods of that type leak into a nearby market (grey-market price pressure). Stolen letters are sold as information. |
| **Eat** | Raiders consume grain. Empty roads mean hunger, so they raid farms or villages instead, **or disband** |
| **Recruit** from the unemployed | A dead blacksmith leaves an unemployed apprentice, who may turn bandit. NPC life feeds road danger. |
| **Bury hoards** | Coin leaves circulation. Hoard locations can be found through rumour, captured raiders or a lost map. |
| **Fear** | Guard presence, patrols and losses push raiders to other roads |

### 11.1 Raiders, as built in step E
**Bands are people.** Each band is named outlaws in a hideout by the wild roads: the Blackpine hollows, the caves under the Saddle, the fen islands, the ledges of the Grey Gorge. Outlaws are residents who left their towns: idle labourers, more often when their town is hungry and its households broke, and able workers who give up on a starving town and take to the hills instead of the road out. While fewer than two bands hold the hills, the odd stranger turns up (a deserter, someone off the ships). One member leads, with a temper from soft to merciless.

**Roads are news.** Travellers report every road they come along: quiet, signs of bandits (lookouts, a cold camp), or a raid. Reports spread through inns, the post and campfires like price lists, get retold, and fade (a raid ten days old weighs half as much; for a few days, "I saw nothing" doesn't undo a raid). Route planners and merchants judge danger by what they *believe* (§8.4), so a band lying in wait unnoticed catches travellers out, and a road keeps its bad name after the band has gone.

**Lookouts and encounters.** Lookouts see everyone on the roads near the hideout and keep a fading tally of what passes; the band watches the road that pays best, unless it has cost them blood. A band may spot a traveller on its road and weigh what they carry against how many would fight:
- *Demand* a toll (a quarter of the value); the timid or outnumbered pay.
- *Attack*: the traveller fights (numbers × nerve × a bounded roll decide it), or runs and drops the load.
- *Steal*, at night, from the camp, if the watch sleeps.
- *Let pass*: not worth it, or too many.

Hired hands who die are townspeople from where the caravan set out. Merchants who lose are often dragged off and **held for ransom**: their house pays, or a generous Lord Aldric, or their home town; past the deadline a merciless band kills them and a softer one lets them walk home penniless. Letters taken from the post never reach the next inn (AT-21). Every encounter is written up afterwards with its factors (§13).

**Living off the land and the road.** Bands forage (fish in the fens, game in Blackpine, less in winter), eat stolen grain, and buy more through their fence, laying in stores each autumn. Every few days loot goes to a fence in a nearby town at half its price and into that town's market (grey-market pressure). Half of any surplus is drunk and gambled away in the fence town; half is buried in a cache at the hideout. A starving band digs up its own cache; strangers sometimes stumble on old ones (coin comes back: the flow *unearthed*). A starving band raids the weakest town nearby if it has a fair chance, moves to a hideout with open roads, or breaks up, its people drifting home as labourers (AT-24).

**The lord's patrols.** When his seat hears a road is dangerous, Lord Aldric may send four guards to ride it for ten days (§15.2.1). Lookouts spot fewer travellers, fights go worse for the band, it comes to fear the road, and a patrol may run it down.

**Result.** Over 300–400 days, one or two bands of 4–20 hold the hills most of the time; 12–23 encounters per 100 days, a few town raids, occasional ransoms and a handful of deaths. Merchants shift to safer roads when raids become known. Gate E: in a replayed world, a grain caravan robbed on the road leaves its destination measurably shorter of grain and dearer than the same world where it got through.

### 11.2 Bands that weigh their targets, as built in step G+3
Before this step a band let any party pass whose odds of beating it were better than 45%, unless it was starving. Hiring guards was close to a sure thing, standing orders rarely changed an outcome, and sellswords fought about one fight in three of the times they met a band.

**Nerve.** The worst odds a band will take on now move with its situation:
- They start at 45% (62% for a lord worth a great ransom).
- **Hunger** loosens them, a little at a time: up to +35% at full hunger. A desperate band still takes any chance.
- **A prize worth the gamble:** a rich load adds up to +15% (half of that for a load worth 400 marks).
- **A proud leader facing guards** adds up to +18%: they want a name, and they attack rather than ask for a toll.
- **A beating** takes up to 25% off: every outlaw killed shakes them, and it fades over a couple of weeks.
- Everything together stays between 20% and 72%.

**Leaders.** Each band's leader has a pride. After a bad beating, one of them may throw the leader down: a usurper, usually prouder than the one before. The chronicle says so: *"After the beating, Sabine Heath throws down Brannoc Birch and takes the lead of the Fen band: a proud one, out to make a name."* When a band takes on a guarded party, the chronicle says why: *"Their leader wanted a name, guards or no guards."*

**A band's mood is news** (a `band:<hideout>` record). Every few days the band's fence's tavern gets a look at them (lean or flush, cocky or licking their wounds), and anyone they meet learns the same. The word spreads and is retold, and their numbers grow in the telling. Travellers reckon the band's roads by what they've heard:

| What's said of the band | Its roads' danger |
|---|---|
| Starving | +60% |
| Hungry | +25% |
| A proud leader | +25% |
| Lately beaten | −30% |
| Broken up, gone | −50% |

The word fades over about two weeks. Believed danger steers routes, the risk merchants price in, and how many guards they hire, so a starving band's road empties of the careful and fills with guards. The lab's band inspector shows the band's nerve and what each town says of it. The player's ledger lists what's said of the bands.

**Result** (10 world-years, the smart bot playing):

| | Before | After |
|---|---|---|
| Guarded caravans set on, a year | 3.5 (23% of caravan encounters) | 6.3 (32%) |
| Guards staring a band down | 11.3 | 8.6 |
| Hired hands killed / outlaws killed, a year | 5.9 / 5.9 | 8.8 / 11.1 |
| Merchants taken for ransom, a year | 1.0 | 2.9 |
| A caravan under "fight" orders losing something, when met | 61% | 31% |

Bands burn out faster (fewer survive the year), and new leaders rise: seven usurpers in ten years. Characters now pay for their blind spots. Optimists, who price danger at 0.6, were ruined in 6 of 10 worlds; no hoarder was.

For the player, standing orders change how each meeting ends, but not yet the year's sum (20 worlds):

| Orders | Fought off a year | Taken for ransom | Killed | Worth gained |
|---|---|---|---|---|
| Fight | 1.3 | 0.50 | 0.20 | +1,690 |
| Pay tolls | 0.9 | 0.25 | 0.20 | +1,716 |
| Run | 0.3 | 0.25 | 0.10 | +1,693 |

A careful player who hires guards meets a band about three times a year, so orders matter in the moment, not in the ledger's total.

## 12. Mercenaries
As in v0.1 (experience ledger; a few explicit traits such as Forestwise, Ambush Veteran, Night Fighter, Trusted Pair, Spear Wary), plus:
- **Loyalty to the employer**, shaped by pay, survival and how the player's standing orders treated them ("You told us to die for the medicine").
- Hiring information is imperfect: a mercenary's *claimed* history can differ from their true ledger until you've seen them fight, or checked their references by letter.

### 12.1 Sellswords as built (step F)
Andre's direction (September 2026): mercenaries carry gear and level up, RPG-style, but **growth comes from deeds, slowly**, and **what they lived through decides what grows**. Gear levels up the same way, from what *it* lives through. Magic stays low: scute armour, charms that work by belief, and very rare true relics.

- **People.** Sellswords are named residents of the towns (profession *sellsword*), on top of each town's founding population. Five stats from 1 to 10: strength, agility, discipline, awareness, nerve. Each has a purse, a favourite weapon, and a ledger: kilometres walked by terrain, run-ins, fights won and lost (by terrain), ambushes, nights, kills, wounds, companions, and bands stared down. While waiting for work they earn a little at odd jobs, pay for bed and board, mend their gear and buy better. If they're broke long enough, they give up the sword. When fewer than ten are left, an idle labourer takes one up.
- **Hiring.** Merchants hire guards for the danger they *believe* is on the road: more for more exposure, more wagons and a more timid temper, and never more than a quarter of the purse in wages. Sellswords waiting in town make a merchant bolder about the road (T2: guards cost wages but open the short, dangerous way). Guards are paid their own day rate (more for rank) where the trip ends.
- **In the fight.** A carter counts 1; a green sellsword with a spear and a quilted coat about 1.5; a Veteran in mail with a storied sword about 3. The band's lookouts see the guards, so a well-guarded caravan is often just let by, and staring a band down is a small deed. In an attack from cover, a guard may see it coming (awareness, terrain sense, a bow). If none does, the guards fight surprised. Guards stand in front: a blow meant for a hand may fall on a guard, whose armour may turn it. Otherwise they are wounded (light or bad) or killed. In a won fight, guards cut down outlaws. The after-action report names the factors: who saw it coming, which traits and named pieces were in play, who fell.
- **Ranks (deed points).** A fight won 3, a fight lost and survived 2, a toll or run-in ½, a kill 1, a wound 1, a band stared down 0.3. The ranks are Green, then Blooded at 6, Seasoned at 20, Veteran at 45 and Captain at 88 (raised a quarter in step G+3, when bolder bands made fights commoner, so growth stays as slow as intended). Each deed also *trains* stats: fighting trains strength and agility, night trains awareness and nerve, an ambush trains awareness and nerve, standing beside others trains discipline, and a wound trains nerve. **A rank raises the stat trained most, by one**, so two Veterans end up different people. In test runs a guard reaches Blooded in their first year, if at all.
- **Traits** (few, explicit, thresholds on the ledger): Forestwise, Goat-footed and Fenwise (two fights on that terrain, or long travel there and one fight: stronger there and quicker to see an ambush), Ambush Veteran (3 ambushes: not shaken by surprise), Night Fighter (2 night fights), Knows the Outlaw Ways (6 run-ins), Trusted Pair (3 fights beside the same guard: better together), Scarred (a bad wound: a little weaker, much harder to kill). AT-10 is automated: across 100 seeded forest ambushes, a Forestwise guard wins a few more and sees more ambushes coming, never all.

### 12.2 Gear that remembers
- **Made from the economy.** Club, spear, axe, sword and bow; quilted coat and mail shirt; shield; charm. The smith uses up real goods (timber, tools, cloth) from the market and the buyer pays the market's price plus labour to the town's traders. A tools shortage makes arms dear. Gear wears in fights and is mended for coin. Old gear is sold onto the town's rack, second-hand, with its history intact.
- **Tiers from use, slowly.** Each piece earns a record: a fight 1, a win 1, a kill 1.5, a blow turned 1. The tiers are plain, then proven at 6, storied at 16, renowned at 35 and legendary at 70 (legendary also needs two owners). Each tier adds a small edge. At *storied* a piece gets a **name**, taken from the road where it saw most ("the Blackpine Thorn") or from its luck ("Lucky Quilt", "Widow's Edge"). It also carries statuses: blooded, lucky, ill-omened, taken.
- **It outlives its owners.** A dead guard's gear goes to the band that killed them: outlaws' gear adds to their strength, one piece per member, and keeps earning its record in outlaw hands. If the caravan won, the gear goes back on the wagons to the next town's rack. Arms dropped by fallen outlaws are carried back the same way, and when a band breaks up, its arms turn up for sale in its fence town.
- **Scute coats**, laced from the Old Carrier's shed shell plates, are the best armour and never wear. The region starts with one.
- **Charms work by belief.** A charm's *repute* rises when its wearer survives a lost fight and falls when they are badly hurt or killed. The repute steadies or shakes whoever wears it next. Very rarely (4%) a charm is a **true relic** that helps unbelieved and halves its wearer's chance of dying. Only the lab can see which.

### 12.3 Fame and infamy, as built (step F)
- **Renown from deeds:** a band beaten off 1, an outlaw cut down 1, a lord kept safe in a fight 2, a new rank 1, carrying a piece when it earns its name 2. The chronicle notes three thresholds (5: *spoken of*, 15: *famed*, 30: *songs*).
- **It travels as news.** Everyone at a fight learns who fought (a knowledge record `fame:<id>`), and tells it at inns and campfires like prices and road reports, a little embellished in the retelling. So a name is known where the story has reached, and not yet elsewhere.
- **What a name does:** an employer weighs what the town's inn says of a sellsword when hiring, and pays for it (a famous blade's day rate rises, up to a mark more). A band's lookouts hear the talk in their fence's tavern, and **guards whose names they know count for more**, both in the reckoning and in the fight.
- **Infamy:** bands earn it (a robbery 1, a death 1, a merchant taken 3, the lord taken 10), spread the same way. The bounty the lord sets on a band grows with its name.
- **Sellswords on patrol:** when the lord sends a patrol, sellswords waiting at his seat ride with it. They are paid when it comes home, and live through its clashes like any fight.
- **Later:** loyalty to an employer (pay, survival, orders), and hiring on *claimed* histories you can check by letter.

## 13. Automatic encounters and standing orders
Resolution is as in v0.1: automatic, factor-based, with bounded randomness, explained afterwards. **New: standing orders** are set before dispatch:

| Order | Options |
|---|---|
| When threatened | Fight / negotiate toll / flee |
| Flee if outnumbered by | 1.5× / 2× / 3× / never |
| Cargo priority | Protect all / abandon bulk to save valuables / "never lose the medicine" |
| Night travel | Allowed / camp at dusk |
| On bad news (courier) | Continue / return / divert to X |

Orders are shown in the after-action report ("Per your orders, Gregor dropped the grain and ran; 2 guards survived who otherwise would not have"). They also affect mercenary loyalty.

### 13.1 Standing orders, as built (step F)
- **Orders:** *when threatened*: fight (refuse a toll, stand if attacked), toll (pay if asked, stand if attacked), or flee (run from anything). *Give way when outnumbered*: pay or run when the band looks 1.5, 2 or 3 times stronger, or never. *Cargo*: drop (cut the load loose when running, and everyone gets away) or hold (a running fight at worse odds). *Night*: a double watch (15% more wages; thieves wake it more often) or the usual single watch.
- **Who sets them:** merchants set them from their temper; wayfarers and the lord go by temper too, and the player will set their own (step G). Timid merchants pay tolls, give way early and keep a double watch. The boldest fight and give way only at three to one.
- **They change with experience:** a lost fight that cost lives, or a merchant taken for ransom, makes a house warier (pay rather than fight, give way sooner). A band beaten off with guards along makes a toll-payer bolder. Two quiet months later, the orders drift back to the merchant's temper.
- **Reports say so:** "Per Agnes Tallis's orders, they cut the load loose and ran from a band 2.8 times their strength; everyone got away."
- Loyalty (how orders treat the guards) is still to come.

## 14. History, reports, emergent narrative
v0.1 reports stay (dispatch, encounter, market news, personal and item history, world events). New additions:
- **Letters** are the main report format. They are delayed, can be lost, and are written in the sender's voice (generated from templates, not an LLM).
- **Earned place names** (style module, prototype): the map starts sparse. After meaningful repeated events at a route segment, the cartographer names it ("Blackpine Hollow", "Gregor's Ford"). Named places then appear in reports and rumours.

## 15. Stakes: debt, bankruptcy, death, heirs
| State | Trigger | Consequence |
|---|---|---|
| **Debt** | Start of game (a loan from the Kingscross money-changer) and optional borrowing | Interest; collectors; reputation |
| **Default** | Missed payments | Assets seized; a debt collector with a grudge becomes a named antagonist |
| **Bankruptcy** | Net worth below –X, no credit | **Not game over:** you become a bonded factor for a rival for N seasons, then restart from a stall with your knowledge and contacts |
| **Death** | Travelling with a caravan that loses an encounter | Your **heir** (a named relative, or a factor you've named) inherits the ledger, the debts and the mercenaries' loyalty, which may be lower |

### 15.1 Starting situation
The player inherits **the family stall in Kingscross and the family's debt**, both at once. A parent has just died (the first entry in the ledger is theirs). The stall comes with a little stock, one loyal but aging porter, a handful of the parent's old contacts (some of them letters that are still in transit), and a note owed to the Kingscross money-changer. The heir system (above) means this is also how every *later* heir starts: the game is a lineage from the first minute.

### 15.2 The lord: a named character
**Lord Aldric of Kingscross** (working name) is a **regional agent** like a merchant, not a faceless treasury.
| Attribute | Effect |
|---|---|
| **Wants** (2–3 active, shifting) | e.g. *luxuries for his daughter's wedding*, *copper for the Crown's war levy*, *a bridge repaired*. Wants create demand, contracts and favour. |
| **Moods** | Content / anxious / greedy / grieving / ill. Mood scales tolls, the wealth levy, forced-loan appetite and generosity. |
| **Favour** per merchant | Earned by filling wants and paying levies. Spent on licences, toll relief, protection. Lost by refusing forced loans. |
| **Treasury** | Real coin: taxes in, garrison wages and projects out. An empty treasury makes him greedy. |
| **Age and health** | He ages. He can die of old age, illness, a raid, or something less natural. |
| **Succession** | An heir (with different traits and wants) takes over, or, if there is no clear heir, a rival claimant, a Crown steward or a creditor house replaces him. Each successor rewrites the tax and toll rules a little. |

The prototype needs the wants, the moods, the treasury and a simple succession. Politics beyond Kingscross stays out of scope.

#### 15.2.1 Lord Aldric, as built in step E0 (Andre's direction)
A full treasury shouldn't sit still. Aldric spends it, and how he spends it depends on who he is.
- **Temperament:** generosity, ambition and vanity, drawn once. **Moods** drift daily with what he sees: *worry* (the hungriest town), *pride* (fed towns, a full treasury), *grievance* (the Crown's due; a sore lord keeps more back).
- **Every three days** he weighs what he could do with whatever he holds beyond his reserve (250 marks), scores each option by temper × need, and keeps the options, scores and reasons for the inspector:
  - **Relief:** a grain order for a hungry town, at 1.6× grain's worth, paid by the treasury. It is cried at his seat and in the town, and the post carries it to other inns, so merchants hear of it at road speed and carry the grain. For relief he'll dig down to 100 marks.
  - **Commissions:** he buys a glutted craft's goods (liveries from the weavers, tools for the armoury, timber for the castle), which pays its workers.
  - **Festivals:** bread, ale and music for a fed town; its musicians, brewers and cooks are paid, and it grows faster for 20 days.
  - **Works,** paid day by day in wages and materials bought from the town's market, leaving something lasting: a **granary** (more storage), **new fields** (more farmland, a little more yield), **new houses** (room to grow), a **smithy** or **loom-house** (a labourer takes up the trade). An ambitious lord **saves up** for works, forgoing festivals and trinkets. Works stall without materials and are abandoned after 15 days.
- **The steward's fingers:** when the treasury holds more than 800 marks, 1% a day of the excess goes missing and is buried. The skimming is noticed at the season's end. It's the first thread for thieves, bribes and corruption.
- **Why it matters:** his spending pulls the treasury under the Mint's target, so the Mint keeps striking and buying Copperford's ore; relief feeds hungry towns through the merchants; works change what towns can hold and grow. Over 200 days he typically spends ~1,000–1,500 marks on relief and finishes two or three works, and famine deaths fall further.
- **Next, from Andre's list:** bribes, corruption and thieves (with the mercenaries), wants that change with events, his age, death and heir.

#### 15.2.2 Lord Aldric's travels, as built in step F (Andre's direction)
- **He judges by what he has heard.** The lord has his own knowledge: the post's letters and the talk at the inn where he is. Price lists now carry each town's hunger, so a famine reaches him days late, by letter, and old or worrying news makes him want to go and see.
- **Trips** are weighed apart from his spending, at most every 18 days, and taken about half the times one scores well:
  - **tour:** a town with stale or worrying news. He sees its market and hunger for himself, gives alms if it is poor and he is generous, and decides on the spot.
  - **hunt:** a day in the Blackpine when he's pleased with himself. It brings glory (pride) or a fall (eight days abed, nothing decided).
  - **the ships:** a visit to Saltmouth to buy fine things; the coin leaves the region.
  - **ride:** with a patrol, down a road whose outlaws have angered him (his post robbed, his patrol ambushed, himself attacked).
- **His party** is his household guard plus sellswords hired at his seat (more if he believes the road dangerous) and a purse. Where he stays, his household buys bread and fine things in the market and pays the town's households.
- **The richest mark on the road:** a band reckons a lord worth a great ransom and will gamble on worse odds for him. Taken, he is held until the steward pays from the treasury, or the seat's households are squeezed. A band that isn't paid asks for less. Freed, he is furious: a **bounty** on the band (8 marks a head, more for a band with a name, paid to whoever kills them) and a grudge that sends him riding with his patrols.
- **While he's away** his steward's fingers grow three times bolder.
- In test worlds he rides out about once a month. Most trips are tours; bands attack his party a few times a year and have taken him.

**Deferred:** the player turning fence or raider (§23). Revisit when raider ecology (step E) and the player (step G) both exist.

**Goals.** In the prototype the aim is to survive, grow net worth, and not be the one who gets ruined. For the full game (to brainstorm):
- **Ambitions** chosen at the start ("buy back the family mill", "found a road", "ruin the Vell family").
- A **royal charter**.
- An end-of-life **reading of the ledger**: an epitaph generated from your history.

## 16. Time scale
Reference points: *Stardew Valley*'s day lasts about 14 real minutes (a pace that makes schedules readable). A *RimWorld* day is about 17 minutes at 1× (60,000 ticks at 60 per second), and players spend most of the time at higher speeds. *Taipan!* and *Sid Meier's Pirates!* compress travel into near-instant jumps with news on arrival. *Mount & Blade* runs travel on a continuous overworld map.

**Proposal (tunable):**
| Quantity | Value |
|---|---|
| 1 game day at 1× | ~10 real minutes (schedules readable in town) |
| Speeds | Pause, 1×, 5×, 20×, 100× headless / reduced visuals |
| Typical trip | 2–5 game days (the forest track ≈ 60% of the King's Road) |
| Courier | ~2× caravan speed |
| Season | 10 days (prototype); 30 days (later) |
| "Wait until…" | Next letter / caravan arrival / dawn / market day |

So a caravan's round trip is roughly 5–10 minutes at 5×. That's long enough for the world to change and short enough to stay interesting.

**Measured in step A (wagon, 3.5 km/h).** Summer trips between neighbouring towns take 1.5–2.3 days. Winter's short days roughly double every trip. With the High Pass snowed shut, Copperford ↔ Greenhollow takes ~8 days and Greenhollow ↔ Saltmouth ~9. The Blackpine Track takes ~0.7× the King's Road's travelling time (the target was ~0.6; the map's geometry limits it). These are tuning levers, not fixed decisions.

**Winter is harsh, and it pays.** Andre's rule: punishing winter routes are fine if a successful winter run is worth more. Step B shows the reward side emerging on its own. Winter need for firewood (×3) and medicine (×2.5), autumn salting (salt ×3) and the snowed-in High Pass push winter prices up: at Kingscross, firewood runs about 60% dearer than in summer, and medicine two to three times dearer. Step D must confirm that the best winter trips beat the best summer trips per journey (a new acceptance test, AT-25), even though they take longer.

## 17. Style modules
Each module must name the thesis question it tests.

| Module | Description | Serves | When |
|---|---|---|---|
| **Ledger UI** | The whole interface is the merchant's ledger. Closing the book pauses the game. Reports arrive as sealed letters. Price graphs are inked; shortages show as ink bleeding. | T1 legibility, T2 | Prototype (placeholder art) |
| **Earned place names** | The cartographer names places after what happened there | T1 memorable stories | Prototype |
| **Information as cargo** | Letters stolen, sold, forged | T2 | Prototype (forgery later) |
| **Oxen with memory** | Draught animals keep a ledger. A veteran ox refuses Blackpine Hollow, is usually right, and raises crew morale. | T1 attachment | Late prototype (cheap: reuses the ledger) |
| **Marked coins** | Some coins are tracked individually. "Follow the coin" camera. | T1 legibility (and debugging) | Late prototype |
| **Songs** | Kingscross bards turn history into songs that spread at travel speed and can be wrong. Fame changes wages and reputation. | T1 story | Post-prototype |
| **Debts of the dead** | Debts pass to heirs; collectors hold grudges | T2 stakes | Prototype (with §15) |
| **The Wending Fair** | See §18 | T1 anti-stagnation | Experiment K |

### 17.1 Drifting names (a shared system)
Earned place names, the tortoise's nicknames and, later, people's epithets are all one system. A **name** is a claim that spreads like a rumour:
```
Name
  subject      (route segment | place | the Carrier | person)
  text         ("Mother Kettle", "the Old Carrier", "Slowmarch", "Blackpine Hollow")
  origin       (event id or group that coined it)
  popularity   per settlement (0–1), spread by travellers and songs, decays unless reinforced
```
Different towns can call the same thing different names at the same time. Greenhollow farmers say *Mother Kettle*, Kingscross merchants say *the Old Carrier*, and raiders say *Slowmarch*. Events and influence shift the popularity: a trampled harvest might spread *the Grey Ruin* for a season. The map, reports and letters use whichever name is most popular **where the writer lives**, so the names themselves tell you where information came from. The cartographer's map is simply the Kingscross view.

### 17.2 The living map: camps become towns (Andre's idea)
Settlements are born, grow and die. When travellers are stranded (both ways blocked by snow, flood or raiders) they make camp together, especially travellers who share a faction, faith or temper. A camp that nothing feeds disperses and leaves a mark on the map (a cold hearth, a ruined stockade, salvage). A camp that keeps getting supplied, because it sits on a busy road, near a resource or at a safe distance from raiders, grows.

| Stage | Holds on if… | Grows into the next stage when… | Collapse leaves |
|---|---|---|---|
| **Camp** | stranded people have food | a trade flows through, or someone stays to sell to travellers | a cold hearth (a named place) |
| **Waystation** | an inn or trader keeps it supplied | traffic and a water source hold for a season | an empty inn |
| **Outpost** | guards are paid; raiders keep away | the lord or a guild invests; workers settle | a burned stockade (salvage: timber, tools) |
| **Fort / hamlet** | walls and workers | families, a market day, a harvest | ruins (a place-name that outlives it) |
| **Village → town** | as any settlement | population and trade | as any settlement |

Growth runs on the same economy as everything else: people, need, production, storage and a market. A new settlement is a new node on the route graph with its own market. The names system (§17.1) names it, and drifting names can remember it after it's gone ("Oswin's Stockade", long burned).

**Prerequisites.** Step B already keeps each settlement's economy as runtime state, so markets can be created mid-game. The route graph is still static data and must become runtime state too. Camps from *stranded* travellers need closures travellers can't foresee: sudden early snow, flash floods, a raided bridge (weather surprises, step E). Planned closures are avoided by the route planner, so nobody gets stranded today.

**Scope.** Post-prototype, except one experiment after step E: stranded travellers form a camp that either disperses or becomes a waystation. It serves T1 (memorable, legible stories) and tests whether the map can evolve without scripts.

**As built (step E4).** Surprise weather shuts roads without warning (a flood at Mill Ford, snow on the High Pass in autumn, a rockfall in the gorge, a storm that stops the Fenwatch ferry); travellers learn of it by reaching the road or hearing of it. Travellers stranded together at a waypoint make camp. When the road opens, a short or small camp leaves a named cold hearth ("Rook's Hearth"); one that held three days or more with three or more people becomes a waystation ("Rook's Rest") whose inn passes news between everyone who comes through. A waystation nobody visits for forty days closes, leaving an empty inn. The graph itself stays static for now: camps grow at existing waypoints.

### 17.3 Notes from Andre, September 2026 (to fold into later steps)
- **Frontier folk.** Displaced people shouldn't only farm: they can hunt, forage and fish in the wilderness. Where enough of them gather, a camp forms (§17.2), creates demand for supplies, and draws new trade routes. This ties famine (§8.7) directly to the living map.
- **Night needs a job.** At speed, the nightly stall is dull. Options: fast-forward nights automatically when nothing is happening; make night eventful (camps hunt or feast, raiders strike, rumours spread around the fire); or shorten it. The glowing camps are worth keeping. Decide in step E, alongside raiders. *Decided (Andre, step E): both. Night is when bands steal from camps and when travellers camped together share a fire and their news; the lab has a "Skip quiet nights" toggle that runs the dark hours 20× faster.*
- **Study Railroad Tycoon 2 and 3.** They're the classic model of moving goods between producers and consumers, with demand that responds to supply and simple, readable cargo flows. Worth borrowing: per-town demand and supply shown at a glance; cargo value that decays with travel time; and the satisfaction of watching a route you built change a town.

## 18. The Wending Fair (low-fantasy spitball)

**The rule:** a low-fantasy world where *one* impossible thing is treated as ordinary.

**The Old Carrier** (also *Mother Kettle*, *Slowmarch* and whatever else catches on; see §17.1) is a tortoise the size of a hill, ancient and slow. For three hundred years a travelling fair, the **Wending Fair**, has lived on its shell: lashed timber stalls, rope bridges, a chapel and a moneychanger's tower. The tortoise follows a **seasonal grazing circuit** between salt licks and river meadows. Nobody steers it. The **Shell-Readers**, a guild of priests, predict its route from its moods.

**Why it's mechanically good, not just weird**
- **A moving market fixes a static economy.** Route distances, prices and danger shift as the Fair moves. There is no permanent best route.
- **Predictable but uncertain.** Shell-Reader forecasts are information: sold, rumoured and sometimes wrong.
- **Hibernation.** In winter the Carrier sleeps in one place. The Fair becomes a fixed winter town, which is a seasonal economic mode.
- **Fertility wake.** The fields it passes grow a better harvest the next season. Its path changes Greenhollow's output.
- **Shed scutes.** Shell plates fall off periodically: a rare trade good (translucent horn for lanterns and armour).
- **Raiders follow it** like gulls follow a ship. The roads around the Fair are rich and dangerous.
- **Crisis.** If the Carrier falls ill or turns off its circuit, a whole market's worth of supply and demand relocates, which is a world-scale event.

**In the prototype:** Experiment K runs the same seed **with a static Kingscross and with the Wending Fair as a fourth moving node**, and measures price variance, route diversity and T1 interest. Weirdness is added only if it earns its place.

## 19. Technical architecture

### 19.1 Stack
- **Core simulation:** plain JavaScript ES modules. No DOM access, deterministic (seeded PRNG), fixed ticks. It runs identically in **Node** (headless tests, batch experiments) and in the **browser**.
- **Prototype client:** HTML5 canvas and DOM panels, served as static files from GitHub Pages. No build step.
- **Art:** placeholder shapes first, then procedurally generated or hand-pixelled sprites. Python/Pillow scripts are fine for generating spritesheets.
- **Tests:** Node's built-in test runner. Acceptance tests are automated wherever they are measurable.
- **Later:** if we go big, port the proven core rules to Godot. Architecture and tests carry over; code may not.

### 19.2 Modules
`WorldClock · RNG · RouteGraph · Economy (stocks, prices, seasons) · Mint & Treasury (coin sources/sinks) · Knowledge (records, letters, rumours) · Agents (residents, schedules, roles) · MerchantAI · Caravans & Couriers · Danger & Raiders · Encounters (+ standing orders) · Experience · Narrative (log, letters, place names) · Player · DebugTools · Save/Replay`

### 19.3 Principles
Simulation state is separate from rendering. The simulation is data-driven: goods, towns, routes, roles and traits are defined in JSON-like data. Log state transitions, not frames. Saves hold the authoritative state. Every decision stores its **reason** for the inspector.

## 20. Build sequence (revised)
| Step | Target | Gate |
|---|---|---|
| **A** | Headless core: clock, RNG, route graph, 3 towns + Saltmouth, test harness | 100 simulated days run in seconds, deterministically |
| **B** | Stocks, worker-driven production, prices, **seasons** | A forced shortage raises the price and recovers; the autumn harvest crashes grain prices |
| **C** | **Coin**: mint, Outside trade, tolls, levy | The money supply stays bounded over 5 simulated years without a player |
| **D** | Merchants, caravans, **knowledge records and couriers** | Merchants trade profitably on stale information and sometimes make mistakes |
| **E** | Raiders: danger, fencing, hunger, recruitment, hoards | A caravan loss causes a visible shortage; a hungry winter changes raider behaviour |
| **F** | Mercenaries, experience, encounters, **standing orders** | Relevant experience and orders measurably change outcomes |
| **G** | **Player**: located, trades, dispatches, letters, travels, debt | The player plays under the same rules; T2 tests become runnable |
| **G+** | **Refine the world against the player** (§20.1): rival habits, news that ages, bands that weigh targets, rivals that react | AT-16 passes: a skilled player out-earns the houses for reasons you can name |
| **H** | Canvas client: world map, ledger panels, inspector | Every outcome can be explained on screen |
| **I** | **Town view**: Ultima VII-style schedules in the player's town | The town visibly lives through a day; every visible action has an economic hook |
| **J** | Reports, letters, place names, save/replay | Seeds replay exactly; stories are readable |
| **K** | Experiment: the Wending Fair | A/B data against the static Kingscross |

The browser page on the site grows with the project: A–G show headless charts and logs; H onward is playable.

**Status (September 2026):** A to G are complete. D added knowledge records and the lord's post (§5.4), merchant houses and caravans, the ships' coin and peddlers (§10). Between D and E, Lord Aldric became an engaged character who spends his treasury (§15.2.1). E added raider bands, road news, encounters and ransom, the raiders' economy, the lord's patrols, surprise weather, camps and waystations, and news round the night's fires (§11.1, §17.2). F added sellswords, gear that remembers, and deed-earned ranks and traits (§12.1–§12.2), fame and infamy as news (§12.3), standing orders (§13.1), and Lord Aldric judging by what he hears and riding out into his lands (§15.2.2). G added the player: a stall, a debt, caravans, couriers, factors, death and heirs (§4.3); the lab has a panel to play it. G+ (§20.1) refines the world against the player before H (the canvas client). G+1, the houses' characters (§10.3), G+2, news that ages (§5.5), and G+3, bands that weigh their targets (§11.2), are done; G+4 (rivals react) is next.

### 20.1 Step G+: refine the world against the player (decided October 2026)
**Decision (Andre and Claude):** refine the simulation before building the game screen, but refine the parts the player feels, and measure every change with the player (the bots and the lab's ledger panel), not in isolation. The first player bot showed why: steps D–F made a deep, stable world, and none of it gave a skilled player an edge (AT-16). Most of what's wrong with the game lives in the world's rules, and only the player's seat shows which rules.

**Rules for this step:**
- No new world systems (no town view, no Wending Fair, no factions), and no client beyond what play-testing needs.
- Keep the thin play layer (`player:*` commands, the lab panel, the bots). The bots are the regression test for fun.
- Every change names its thesis and the measure that shows it worked.

**The four refinements:**
| # | Refinement | Why (thesis) | Measure |
|---|---|---|---|
| 1 | **Houses with habits and blind spots.** Each house gets a character that bends its scoring: a creature of habit (favourite goods and roads, slow to change), a pessimist or an optimist, a follower who copies whoever just made money, a hoarder of coin. Houses read news more slowly and trust it unevenly. | T2: a well-informed player beats them in ways you can name. T1: houses become characters. | AT-16; the inspector names the bias behind each decision |
| 2 | **News that ages in a way you can exploit.** Fresh word is clearly worth paying for (couriers, factors, being there). Stale word sends houses after opportunities already gone, and the chronicle shows it ("arrived to find three others had beaten them to it"). | T2: information decisions matter. | AT-18 stronger; the value of a courier is measurable |
| 3 | **Bands that weigh targets with more variety.** Desperate bands, proud leaders and a prize worth the gamble mean guarded caravans are sometimes attacked. Sellswords and standing orders face real tests, and risk can be read from news (who's hungry, who's been beaten). | T2: risk management is a choice, not a dice roll. T1: sellswords get stories. | Share of encounters involving guards; orders change outcomes in bot runs |
| 4 | **Rivals react.** Houses crowd a route that's paying and the margin closes. A town glutted by three caravans punishes the last to arrive. Houses notice the player's success and follow it. | T2: no route stays easy. T1: competition you can watch. | AT-17 holds; margins on a route fall as more houses run it |

**Also measured, not built:** pacing (season length and trip times) by play-testing. If the player mostly waits, propose a clock change with numbers before changing it.

**Exit:** AT-16 passes (the smart bot beats the median house by a meaningful margin in most worlds), with the margin explained by the refinements, and AT-17 and AT-18 still pass. Then step H (the client) begins, starting with a small slice: the map, your caravans, a letters inbox, a few verbs, and time that pauses when a decision is needed.

**G+1 results (October 2026).** The characters are built (§10.3). Measuring them with the player first exposed the player's own faults, and those were fixed before anything was tuned:
- A load that came home was put in the stall at no cost, so the bot never sold 30 loads of ore worth 950 marks and went broke.
- The bot bought dear grain for towns that couldn't pay, toured empty markets with a full crew and sellswords, and sat at home with 500 marks when home had nothing to sell outward.
- Refused commands still ran.
- A bankrupt player with nothing but the family wagon was seized for nothing every twenty days, forever.

Now the smart bot ends every one of 20 test years ahead (+850 to +2,750 marks of worth), with three wagons and the note paid. On trading profit it is a little ahead of the median house: about 1.14× in the median world, and 20% ahead in 9 of 20 worlds. AT-16 stays a measurement. Measured by net worth instead, the lord's "loans" from the rich dominate: they took 0 to 3,200 marks a year from a flush bot, which is the rubber band (§8.3) working on the player too. `npm run measure` repeats these numbers for any setting.

**G+2 results (October 2026).** News that ages is built (§5.5). The measurements behind it changed the plan's premise. Information is a strong lever: perfect fresh news is worth +75% to the same player, and news two days old of every market still +50%. But it has to be fresh and cover every choice: one factor, or a habit of couriers, is worth about what it costs. So factors now work for half a mark a day, write every other day, and their letters follow you; a network of them pays (AT-18 now tests that, and passes over 30 worlds).
- Fixed while measuring: an heir was left with no wagon when the parent died on the road (the caravan waited at the far town forever; now the crew bring it home). The bot never roamed again once a single empty move had ended at home. It also forgot goods it had stored in other towns.
- AT-16 stays a measurement. The houses got better too: hearing who is on the road, they crowd half as much and lose less. The player with a network is about level with the median house (20% ahead in about a third of the worlds). G+3 and G+4 remain.

**G+3 results (October 2026).** Bands that weigh their targets are built (§11.2).
- Guarded caravans are set on about twice as often, with a reason the chronicle gives. Leaders rise and fall, and a band's mood steers routes and guard hiring.
- The roads are bloodier. Characters now pay for their blind spots: optimists, who price danger low, were ruined in 6 of 10 worlds.
- Standing orders change how a meeting ends (fights won, ransoms, deaths), but a careful player meets bands only about three times a year, so not the year's total.
- Two knock-ons:
  - Sellswords fought more and rose faster, so the rank thresholds went up a quarter to keep growth slow.
  - The factor network's gain, net of wages, is now real but modest (earnings +370 ± 210 marks a year over 40 worlds). AT-18 measures earnings over 40 worlds instead of net worth over 30.
- AT-16. The bot without a network is 20% ahead of the median house in 10 of 20 worlds; median world 1.26× (it was 0.89–1.01× after G+2), because the houses suffer more from the bolder bands than a careful player does. The test's network player, whose earnings carry its news costs, is 20% ahead in 3 of its 10 worlds. Still a measurement.

## 21. Acceptance tests
**AT-01 to AT-15 are kept from v0.1** (autonomy, price response, merchant response, physical trade, disruption, competition, risk sensitivity, day cycle, persistent death, contextual experience, combat explanation, player parity, debug legibility, performance, interest test).

New tests:
| ID | Test | Pass condition |
|---|---|---|
| AT-16 | Skill gap | A scripted "good" player bot out-earns the median AI merchant by a meaningful margin over 1 year across 20 seeds (earnings: trading profit on both sides, since step G+1) |
| AT-17 | No dominant strategy | No single fixed route/good policy is the best one in more than ~40% of seeds |
| AT-18 | Information value | A player with factors in the other markets out-earns an identical player without them, net of their wages (step G+2: one factor alone is about break-even; measured on earnings over 40 worlds since G+3) |
| AT-19 | Money stability | Over 5 simulated years without a player, total coin stays within bounds and no town goes permanently broke |
| AT-20 | Rubber band | A deliberately dominant merchant's share of wealth plateaus through the levy and forced loans, with no hard cap |
| AT-21 | Letter interception | Stolen letters measurably change a victim's decisions |
| AT-22 | Seasons | Seasonal price cycles are visible, and at least one route is best only in some seasons |
| AT-23 | Every resident works | Removing any resident changes some measurable output (production, service or security) |
| AT-24 | Raider ecology | Unemployment raises raider recruitment; a starving winter shifts raids or disbands a group |
| AT-25 | Winter pays | The best winter trips earn more per journey than the best summer trips, even though they take longer |

**Step G findings (T2):** AT-17 passes: no fixed good-and-road policy was the best in more than 2 of 8 worlds. AT-18 passes: a factor in Copperford leaves the player richer across 10 worlds, net of his wage (very noisy world by world). **AT-16 does not pass yet**: the smart bot beats the median house by 20% in about 2 of 10 worlds (typically +1,200 marks a year against the median house's +2,900). It starts smaller and in debt, and the houses already play near-optimally on the same information. The player's edges (being there, couriers, factors) aren't yet worth much. Per §22, the next moves are information decisions, courier redirects and contracts, not more content.

Automated so far: gates A–E, AT-03, AT-04, AT-06, AT-07, AT-13, AT-21 (letters stolen from the post), AT-24 (both halves), AT-25, AT-10 (Forestwise), AT-17, AT-18 (step G), and AT-16 as a recorded measurement; and before them the step A and B gates, AT-02 (price response to a forced shortage), AT-09 (a death leaves a vacancy that an apprentice fills), the seasonal half of AT-22, and a preview of AT-07 (bold and wary travellers choose different roads).

## 22. Continue / revise / kill
The v0.1 table is kept, plus:
| Signal | Response |
|---|---|
| The player mostly fast-forwards between trips | T2 failing: add information decisions, courier redirects and inn scenes before adding content |
| The coin supply drifts or explodes | Tune the mint and sinks before touching anything else |
| The Wending Fair adds confusion without variety | Cut it; keep the static Kingscross |
| The town view is charming but the player ignores it | Tie more information (rumours, hiring, contracts) to being physically present |

## 23. Open questions
1. How visible should the "ledger" UI metaphor be in the town view?
2. *(Deferred)* Can the player become a fence or raider? Revisit after steps E and G.
3. *(Resolved in v0.2.3)* Famine kills, with recovery (§8.7). Denominations: bits, marks and scutes (§8.6).
4. Prices don't yet respond to how much money is about (no inflation). Worth adding once merchants move coin between towns?
5. Wayfarers earn little (odd jobs while resting) and most end up nearly broke. Step D's peddling should give them a living.

Resolved in v0.2.1: starting situation (§15.1), the lord (§15.2), the Carrier's names (§17.1).

## 24. Commandment (unchanged)
**Build the laboratory before the empire.** A small world that is already worth watching, understanding and exploiting beats a large one full of systems.
