import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, WORLD, describe, wayfarerPosition } from '../src/index.js';
import { planRoute } from '../src/systems/wayfarers.js';

const DAY = 1440;

// ── Build step A gate: 100 simulated days run in seconds, deterministically. ──

test('GATE A: 100 days run in well under a few seconds', () => {
  const t0 = performance.now();
  const sim = new Simulation({ seed: 1 });
  sim.runDays(100);
  const ms = performance.now() - t0;
  assert.equal(sim.state.tick, (100 * DAY) / WORLD.time.minutesPerTick);
  assert.ok(ms < 3000, `took ${ms.toFixed(0)} ms`);
});

test('GATE A: the same seed gives the same world, every time', () => {
  const a = new Simulation({ seed: 1234 });
  const b = new Simulation({ seed: 1234 });
  a.runDays(100);
  b.runDays(100);
  assert.equal(a.hash(), b.hash());
  assert.deepEqual(a.state.log, b.state.log);
});

test('GATE A: different seeds give different worlds', () => {
  const hashes = new Set();
  for (const seed of [1, 2, 3, 'copper']) {
    const sim = new Simulation({ seed });
    sim.runDays(30);
    hashes.add(sim.hash());
  }
  assert.equal(hashes.size, 4);
});

test('GATE A: save mid-run, restore, continue: identical to never stopping', () => {
  const straight = new Simulation({ seed: 99 });
  straight.runDays(100);

  const first = new Simulation({ seed: 99 });
  first.runDays(37);
  first.advanceTo(first.now + 7 * 60 + 20); // stop at an awkward mid-day moment
  const saved = JSON.stringify(first.snapshot());
  const resumed = Simulation.restore(JSON.parse(saved));
  resumed.advanceTo(straight.now);

  assert.equal(resumed.hash(), straight.hash());
});

test('a snapshot cannot be restored against different world data', () => {
  const sim = new Simulation({ seed: 1 });
  const other = { ...WORLD, wayfarers: { ...WORLD.wayfarers, count: 3 } };
  assert.throws(() => Simulation.restore(sim.snapshot(), { data: other }), /different world data/);
});

test('invalid world data is refused', () => {
  const bad = structuredClone(WORLD);
  bad.segments[0].a = 'nowhere';
  assert.throws(() => new Simulation({ data: bad }), /World data is invalid/);
});

test('periodic hooks fire on the hour, at midnight and at each new season', () => {
  const seen = { hourly: 0, daily: 0, seasonal: [] };
  const probe = {
    id: 'probe',
    hourly: () => seen.hourly++,
    daily: () => seen.daily++,
    seasonal: (sim) => seen.seasonal.push(sim.cal.season(sim.now).id),
  };
  const sim = new Simulation({ seed: 1, systems: [probe] });
  sim.runDays(41); // start 05:30 on day 0 → 05:30 on day 41
  assert.equal(seen.daily, 41);
  assert.equal(seen.hourly, 41 * 24);
  assert.deepEqual(seen.seasonal, ['summer', 'autumn', 'winter', 'spring']);
});

test('events run in time order within a tick, and the clock shows each event\'s own time', () => {
  const times = [];
  const probe = {
    id: 'probe',
    init: (sim) => {
      sim.schedule(sim.now + 7, 'probe:e', { n: 2 });
      sim.schedule(sim.now + 3, 'probe:e', { n: 1 });
      sim.schedule(sim.now + 7, 'probe:e', { n: 3 });
    },
    handlers: { 'probe:e': (sim, d) => times.push([sim.now - 330, d.n]) },
  };
  const sim = new Simulation({ seed: 1, systems: [probe] });
  sim.step();
  assert.deepEqual(times, [[3, 1], [7, 2], [7, 3]]);
  assert.equal(sim.now, 340);
  assert.throws(() => sim.schedule(sim.now - 1, 'probe:e'), /in the past/);
  assert.throws(() => sim.schedule(sim.now + 1, 'nobody:handles'), /no system handles/);
});

test('state is plain JSON: no functions, classes, NaN or undefined sneak in', () => {
  const sim = new Simulation({ seed: 5 });
  sim.runDays(20);
  const roundTrip = JSON.parse(JSON.stringify(sim.state));
  assert.deepEqual(roundTrip, sim.state);
});

test('wayfarers travel, arrive, and use every road over a year', () => {
  const sim = new Simulation({ seed: 1 });
  sim.runDays(40);
  const arrivals = sim.state.log.filter((e) => e.type === 'wayfarer:arrived');
  assert.ok(arrivals.length > 50, `only ${arrivals.length} arrivals`);
  const roadsUsed = new Set(arrivals.flatMap((e) => e.via));
  for (const r of WORLD.routes) assert.ok(roadsUsed.has(r.id), `nobody used ${r.id}`);
  for (const id of sim.state.wayfarers.order) {
    const w = sim.state.wayfarers.byId[id];
    assert.ok(w.trips > 0, `${w.name} never finished a trip`);
  }
});

test('bold and cautious travellers pick different roads from the same state (AT-07 preview)', () => {
  const sim = new Simulation({ seed: 1 });
  sim.advanceTo(10 * DAY + 6 * 60); // a summer morning
  const traveller = (boldness) => ({ speedKmh: 4, boldness });
  const bold = planRoute(sim, traveller(1000), 'kingscross', 'copperford');
  const timid = planRoute(sim, traveller(0), 'kingscross', 'copperford');
  assert.deepEqual(bold.routes, ['blackpine-track']);
  assert.deepEqual(timid.routes, ['kings-road']);
  // Both considered the same options; only the weighting differs.
  const considered = (p) => p.reason.options.map((o) => o.routes.join('+')).sort();
  assert.deepEqual(considered(bold), considered(timid));
});

test('every road choice records its reasoning', () => {
  const sim = new Simulation({ seed: 2 });
  sim.runDays(10);
  const travelling = sim.state.wayfarers.order.map((id) => sim.state.wayfarers.byId[id]).filter((w) => w.trip);
  assert.ok(travelling.length > 0);
  for (const w of travelling) {
    const r = w.trip.reason;
    assert.ok(r.options.length >= 1);
    assert.deepEqual(r.options[0].routes, w.trip.routes);
    for (let i = 1; i < r.options.length; i++) assert.ok(r.options[i].score >= r.options[i - 1].score);
  }
});

test('a traveller finding the pass closed at the Saddle waits, then goes on in spring', () => {
  const sim = new Simulation({ seed: 1 });
  sim.advanceTo(30 * DAY + 10 * 60); // a winter morning
  const w = sim.state.wayfarers.byId[sim.state.wayfarers.order[0]];
  // Caught by the snow: they are just reaching the Saddle on the way to Copperford.
  w.at = null;
  w.tripNo += 1;
  w.trip = {
    tripNo: w.tripNo, from: 'greenhollow', dest: 'copperford', path: ['high-pass-south', 'high-pass-north'], routes: ['high-pass'],
    reason: { caution: 0, options: [] }, departedAt: sim.now - DAY, leg: 0, at: 'greenhollow', waiting: false,
    legSeg: 'high-pass-south', legTo: 'the-saddle', legStart: sim.now - DAY, legEnd: sim.now, legMinutes: 600,
  };
  sim.schedule(sim.now, 'wayfarer:node', { id: w.id, tripNo: w.tripNo });
  sim.runDays(3);
  const waylaid = sim.state.log.filter((e) => e.type === 'wayfarer:waylaid' && e.who === w.id);
  assert.equal(waylaid.length, 1, 'logged once, not every morning');
  assert.equal(w.trip.at, 'the-saddle');
  assert.match(describe(waylaid[0], sim), /stuck at the Saddle: snowbound/);

  // Spring: they set off from the Saddle at first light on its first day…
  sim.advanceTo(40 * DAY + 7 * 60);
  assert.equal(w.trip.legSeg, 'high-pass-north');
  assert.equal(w.trip.legStart, sim.cal.travelWindow(40)[0]);
  // …and reach Copperford through the snowmelt mud a few days later.
  sim.advanceTo(46 * DAY);
  const arrived = sim.state.log.find((e) => e.type === 'wayfarer:arrived' && e.who === w.id && e.t > 40 * DAY);
  assert.ok(arrived, 'should reach Copperford once the snow melts');
  assert.equal(arrived.at, 'copperford');
});

test('a traveller facing a closed road with another way round reroutes', () => {
  const sim = new Simulation({ seed: 1 });
  sim.advanceTo(30 * DAY + 7 * 60);
  const w = sim.state.wayfarers.byId[sim.state.wayfarers.order[1]];
  w.at = null;
  w.tripNo += 1;
  w.trip = {
    tripNo: w.tripNo, from: 'greenhollow', dest: 'copperford', path: ['high-pass-south', 'high-pass-north'], routes: ['high-pass'],
    reason: { caution: 0, options: [] }, departedAt: sim.now, leg: 0, at: 'greenhollow', waiting: true,
    legSeg: null, legTo: null, legStart: null, legEnd: null, legMinutes: null,
  };
  sim.schedule(sim.now, 'wayfarer:retry', { id: w.id, tripNo: w.tripNo });
  sim.step();
  const rerouted = sim.state.log.find((e) => e.type === 'wayfarer:rerouted' && e.who === w.id);
  assert.ok(rerouted);
  assert.equal(rerouted.via[0], 'meadow-road');
  assert.match(describe(rerouted, sim), /found the way ahead snowbound and turned for the Meadow Road/);
});

test('every log entry has chronicle text', () => {
  const sim = new Simulation({ seed: 3 });
  sim.runDays(45);
  for (const e of sim.state.log) {
    const text = describe(e, sim);
    assert.ok(text && !text.includes('undefined') && text !== e.type, `${e.type}: ${text}`);
  }
});

test('map positions stay on the road between the leg\'s two nodes', () => {
  const sim = new Simulation({ seed: 4 });
  for (let h = 0; h < 24 * 6; h++) {
    sim.advanceTo(sim.now + 60);
    for (const id of sim.state.wayfarers.order) {
      const w = sim.state.wayfarers.byId[id];
      const p = wayfarerPosition(sim, w, sim.now + 5);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      if (w.trip?.legSeg) {
        const a = sim.graph.nodes.get(w.trip.at);
        const b = sim.graph.nodes.get(w.trip.legTo);
        assert.ok(p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9);
      }
    }
  }
});

test('scales to spec-sized populations (150 travellers, a full year)', () => {
  const data = { ...WORLD, wayfarers: { ...WORLD.wayfarers, count: 150 } };
  const t0 = performance.now();
  const sim = new Simulation({ data, seed: 8 });
  sim.runDays(40);
  const ms = performance.now() - t0;
  assert.ok(ms < 5000, `took ${ms.toFixed(0)} ms`);
  // Some may have left the road to found merchant houses; they still count.
  const all = Object.values(sim.state.wayfarers.byId);
  assert.equal(all.length, 150);
  assert.equal(new Set(all.map((w) => w.name)).size, 150);
});
