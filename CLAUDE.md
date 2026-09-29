# Project notes for Claude

This repo is Andre's personal site (GitHub Pages, served from branch `claude/cloud-3qhvri`, root folder)
and the home of **Caravans of the Copper Road**, a living-world merchant simulation prototype.

## Roles
- Andre: designer and owner. Chimes in now and then.
- Claude: implementation engineer and design partner. Also keeps the website current:
  update the progress log, stage tracker, and theme as the project moves through stages.

## Resuming work
- `docs/HANDOFF.md` says where the build is and what comes next. Update it and push at every checkpoint
  (tests green, reference regenerated), so a wiped workspace can pick up from the branch.

## Design authority
- `docs/copper-road-spec-v0.2.md` is the current spec (rendered at `spec.html`). Edit the Markdown, not the page.
- Scope gate: every feature must name the thesis it tests (T1: world worth watching; T2: player choices hard and meaningful).
- When hitting a wall, dead end or pivot point, consider dialling up style and weirdness, as long as it changes mechanics.

## Tech conventions (from spec section 19)
- Simulation core: plain JavaScript ES modules, no DOM, deterministic (seeded RNG), fixed ticks.
  Must run identically in Node (headless tests) and the browser.
- Client: HTML5 canvas + DOM panels, static files, no build step. Vendor any library locally under `vendor/`
  (CDNs are unreachable from the dev sandbox).
- Tests: Node's built-in test runner (`node --test`). Automate acceptance tests where measurable.
- Every simulation decision stores a human-readable reason for the inspector.

## Commands
- `npm test`: all tests, including the build-step gates.
- `npm run sim -- --seed 1 --days 100`: headless run with summary and chronicle.
- `npm run reference`: regenerate `copper-road/lab/reference.json` whenever simulation outcomes change
  (a test fails until you do). The lab compares browser runs against it.
- Lab locally: `python3 -m http.server` at the repo root, then open `/copper-road/lab/`.
  Chromium for screenshots lives at `/opt/pw-browsers/chromium-*/chrome-linux*/chrome`.

## Determinism rules (enforced by copper-road/test/determinism-lint.test.js)
- No Math.random, Date, performance.now, timers or DOM in `copper-road/src/`.
- No Math.sin/cos/exp/log/pow or `**` (engine-dependent). Arithmetic and Math.sqrt are fine.
- All mutable state lives in `sim.state` as plain JSON. Randomness comes from named streams: `sim.rng('name')`.
- Log entries store ids, not display names; text is rendered by `narrative/describe.js`.
- Outside instructions (lab tools, later the player) go through `sim.command(kind, data)`, never direct state edits.
- Money never appears or vanishes: whole bits in accounts, moved only by `transfer()` (economy/money.js);
  new coin only from the Mint, the ships (paying for exports), a dug-up hoard (only coin buried first) or the lab,
  and it leaves only via the Crown, wear, hoards or the ships (paid for imports). `booksBalance(sim)` must always
  equal `moneySupply(sim)`.
- Goods never teleport: stock changes only via work, use, spoilage, storage limits, the Outside's ships, and
  the road: caravans' cargo and travellers' provisions go through `load`/`unload` (economy/market.js), which
  count them in the day's books (`today.road.in/out`).
- Whoever trades in a market pays or is paid by `traderAccount(sim, town)`: the town's till, or at the
  Outside, the ships.
- Sellswords (`src/systems/mercs.js`) are residents too; gear is made from market goods via `useUp` and paid for
  by `transfer()`; every item is in exactly one place (a sellsword, a rack, a band, a wagon, or lost). Growth is slow by
  design (Andre): ranks from deeds, the most-trained stat rises; items earn tiers and names through use.
- Lord Aldric judges towns by what he has heard (knowledge holder `lord`), not the truth; his travels live in
  `src/systems/progress.js`. Encounters follow standing orders (`src/systems/orders.js`). Fame and infamy are
  knowledge records (`fame:<id>`) and spread like any news.
- Travellers judge roads by what they believe (`road:<segment>` knowledge records), never by where the bands are;
  only the lab sees the truth.

## Lab charts
- Load the `dataviz` skill before changing chart code. Chart colours live in `copper-road/lab/lab.css`
  (`--chart-*`, `--cheap`, `--dear`) and were validated against the parchment surfaces; re-run the
  skill's validator if you change them.

## Site
- `index.html` + `style.css`: merchant's-ledger theme (parchment / copper, dark mode).
- New progress entries go at the top of the `.log` list; stage pills use `class="done"` / `class="now"`.
