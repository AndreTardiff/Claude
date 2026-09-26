# Project notes for Claude

This repo is Andre's personal site (GitHub Pages, served from branch `claude/cloud-3qhvri`, root folder)
and the home of **Caravans of the Copper Road**, a living-world merchant simulation prototype.

## Roles
- Andre: designer and owner. Chimes in now and then.
- Claude: implementation engineer and design partner. Also keeps the website current:
  update the progress log, stage tracker, and theme as the project moves through stages.

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

## Site
- `index.html` + `style.css`: merchant's-ledger theme (parchment / copper, dark mode).
- New progress entries go at the top of the `.log` list; stage pills use `class="done"` / `class="now"`.
