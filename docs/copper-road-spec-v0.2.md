# Caravans of the Copper Road
## Simulation Prototype Design Specification — v0.2

*Supersedes v0.1 ([original document](copper-road-spec-v0.1.docx)). Status: prototype design authority. Target: a headless simulation core with a browser prototype (HTML5 canvas). Godot is a later option if we decide to go big.*

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
scarcity = desired_stock / max(current_stock, minimum_stock)
price    = base_value × clamp(scarcity ^ elasticity, lo, hi) × season_mod × event_mod
```
`elasticity` is higher for essential goods. Buying moves stock immediately; selling adds stock before the price is recalculated. Debug overlays show every part of the price.

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

## 11. Raiders as economic actors
| Behaviour | Economic effect |
|---|---|
| **Raid** caravans and couriers | Goods and letters fail to arrive; danger rises |
| **Fence** stolen goods through a disreputable dealer in a town | Cheap goods of that type leak into a nearby market (grey-market price pressure). Stolen letters are sold as information. |
| **Eat** | Raiders consume grain. Empty roads mean hunger, so they raid farms or villages instead, **or disband** |
| **Recruit** from the unemployed | A dead blacksmith leaves an unemployed apprentice, who may turn bandit. NPC life feeds road danger. |
| **Bury hoards** | Coin leaves circulation. Hoard locations can be found through rumour, captured raiders or a lost map. |
| **Fear** | Guard presence, patrols and losses push raiders to other roads |

## 12. Mercenaries
As in v0.1 (experience ledger; a few explicit traits such as Forestwise, Ambush Veteran, Night Fighter, Trusted Pair, Spear Wary), plus:
- **Loyalty to the employer**, shaped by pay, survival and how the player's standing orders treated them ("You told us to die for the medicine").
- Hiring information is imperfect: a mercenary's *claimed* history can differ from their true ledger until you've seen them fight, or checked their references by letter.

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

## 18. The Wending Fair (low-fantasy spitball)

**The rule:** a low-fantasy world where *one* impossible thing is treated as ordinary.

**The Old Carrier** is a tortoise the size of a hill, ancient and slow. For three hundred years a travelling fair, the **Wending Fair**, has lived on its shell: lashed timber stalls, rope bridges, a chapel and a moneychanger's tower. The tortoise follows a **seasonal grazing circuit** between salt licks and river meadows. Nobody steers it. The **Shell-Readers**, a guild of priests, predict its route from its moods.

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
| **H** | Canvas client: world map, ledger panels, inspector | Every outcome can be explained on screen |
| **I** | **Town view**: Ultima VII-style schedules in the player's town | The town visibly lives through a day; every visible action has an economic hook |
| **J** | Reports, letters, place names, save/replay | Seeds replay exactly; stories are readable |
| **K** | Experiment: the Wending Fair | A/B data against the static Kingscross |

The browser page on the site grows with the project: A–G show headless charts and logs; H onward is playable.

## 21. Acceptance tests
**AT-01 to AT-15 are kept from v0.1** (autonomy, price response, merchant response, physical trade, disruption, competition, risk sensitivity, day cycle, persistent death, contextual experience, combat explanation, player parity, debug legibility, performance, interest test).

New tests:
| ID | Test | Pass condition |
|---|---|---|
| AT-16 | Skill gap | A scripted "good" player bot out-earns the median AI merchant by a meaningful margin over 1 year across 20 seeds |
| AT-17 | No dominant strategy | No single fixed route/good policy is the best one in more than ~40% of seeds |
| AT-18 | Information value | A player with a factor in Copperford out-earns an identical player without one, net of the factor's wage |
| AT-19 | Money stability | Over 5 simulated years without a player, total coin stays within bounds and no town goes permanently broke |
| AT-20 | Rubber band | A deliberately dominant merchant's share of wealth plateaus through the levy and forced loans, with no hard cap |
| AT-21 | Letter interception | Stolen letters measurably change a victim's decisions |
| AT-22 | Seasons | Seasonal price cycles are visible, and at least one route is best only in some seasons |
| AT-23 | Every resident works | Removing any resident changes some measurable output (production, service or security) |
| AT-24 | Raider ecology | Unemployment raises raider recruitment; a starving winter shifts raids or disbands a group |

## 22. Continue / revise / kill
The v0.1 table is kept, plus:
| Signal | Response |
|---|---|
| The player mostly fast-forwards between trips | T2 failing: add information decisions, courier redirects and inn scenes before adding content |
| The coin supply drifts or explodes | Tune the mint and sinks before touching anything else |
| The Wending Fair adds confusion without variety | Cut it; keep the static Kingscross |
| The town view is charming but the player ignores it | Tie more information (rumours, hiring, contracts) to being physically present |

## 23. Open questions
1. The player's starting situation: an inherited debt? a family stall? a disgraced factor?
2. The lord of Kingscross: a named character with moods and wants, or a faceless treasury in the prototype?
3. Can the player *become* a raider or fence? (Tempting; probably post-prototype.)
4. How visible should the "ledger" UI metaphor be in the town view?
5. Does the Old Carrier have a name the locals use? (Working suggestion: *Mother Kettle*.)

## 24. Commandment (unchanged)
**Build the laboratory before the empire.** A small world that is already worth watching, understanding and exploiting beats a large one full of systems.
