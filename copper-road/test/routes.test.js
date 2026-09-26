import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../src/data/world.js';
import { createCalendar } from '../src/core/calendar.js';
import { validateWorld } from '../src/world/validate.js';
import {
  buildGraph,
  estimateJourney,
  findPaths,
  pathNodes,
  pathRoutes,
  routeOptions,
  segmentConditions,
} from '../src/world/routes.js';

const graph = buildGraph(WORLD);
const cal = createCalendar(WORLD.calendar);
const DAY = 1440;
const SUMMER = 10 * DAY;
const WINTER = 30 * DAY;
const SPRING = 0;
const WAGON = 3.5;

test('the shipped world data is valid', () => {
  assert.deepEqual(validateWorld(WORLD), []);
});

test('validation catches broken data', () => {
  const bad = structuredClone(WORLD);
  bad.segments[0].km = 10; // shorter than the straight line
  bad.segments[1].b = 'atlantis';
  bad.time.minutesPerTick = 7;
  const errors = validateWorld(bad);
  assert.ok(errors.some((e) => e.includes('straight line')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('unknown endpoint')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('minutesPerTick')), errors.join('\n'));
});

test('validation catches a town cut off by the seasons', () => {
  const bad = structuredClone(WORLD);
  bad.segments.find((s) => s.id === 'estuary-east').seasonal = { winter: { closed: true } };
  assert.ok(validateWorld(bad).some((e) => e.includes('saltmouth is cut off in winter')));
});

test('three ways from Kingscross to Copperford', () => {
  const paths = findPaths(graph, 'kingscross', 'copperford');
  const labels = paths.map((p) => pathRoutes(graph, p).join('+')).sort();
  assert.deepEqual(labels, ['blackpine-track', 'kings-road', 'meadow-road+high-pass']);
  for (const p of paths) {
    const nodes = pathNodes(graph, 'kingscross', p);
    assert.equal(nodes[0], 'kingscross');
    assert.equal(nodes.at(-1), 'copperford');
  }
});

test('the Blackpine Track is markedly faster than the King\'s Road, and more dangerous', () => {
  const opts = routeOptions(graph, cal, 'kingscross', 'copperford', SUMMER, WAGON);
  const forest = opts.find((o) => o.label === 'Blackpine Track');
  const kings = opts.find((o) => o.label === "King's Road");
  const ratio = forest.estimate.moving / kings.estimate.moving;
  assert.ok(ratio > 0.55 && ratio < 0.8, `forest/King's travelling-time ratio ${ratio.toFixed(2)}`);
  assert.ok(forest.exposure > kings.exposure * 4);
});

test('the High Pass is closed in winter and slow in spring', () => {
  assert.equal(segmentConditions(graph, 'high-pass-south', 'winter').closed, true);
  assert.equal(segmentConditions(graph, 'high-pass-south', 'summer').closed, false);
  assert.ok(segmentConditions(graph, 'high-pass-south', 'spring').speed < segmentConditions(graph, 'high-pass-south', 'summer').speed);

  const winter = routeOptions(graph, cal, 'greenhollow', 'copperford', WINTER, WAGON);
  const pass = winter.find((o) => o.label === 'High Pass');
  assert.ok(pass.estimate.blocked, 'High Pass should be blocked in winter');
  assert.equal(winter.at(-1).label, 'High Pass', 'blocked options sort last');
  assert.ok(!winter[0].estimate.blocked);

  const summer = routeOptions(graph, cal, 'greenhollow', 'copperford', SUMMER, WAGON);
  assert.equal(summer[0].label, 'High Pass', 'in summer the pass is the quickest way');
});

test('a journey that would reach the pass after winter begins is blocked', () => {
  const path = findPaths(graph, 'greenhollow', 'copperford').find((p) => pathRoutes(graph, p).join() === 'high-pass');
  // Leave late on the last day of autumn: the second leg starts in winter.
  const lastAutumnEvening = 29 * DAY + 16 * 60;
  const est = estimateJourney(graph, cal, 'greenhollow', path, lastAutumnEvening, WAGON);
  assert.ok(est.blocked);
  assert.equal(est.blocked.seg, 'high-pass-north');
  assert.equal(est.blocked.at, 'the-saddle');
});

test('Mill Ford floods in spring and slows the Meadow Road', () => {
  const spring = routeOptions(graph, cal, 'kingscross', 'greenhollow', SPRING + 6 * 60, WAGON);
  const summer = routeOptions(graph, cal, 'kingscross', 'greenhollow', SUMMER + 6 * 60, WAGON);
  const meadowSpring = spring.find((o) => o.label === 'Meadow Road');
  const meadowSummer = summer.find((o) => o.label === 'Meadow Road');
  assert.ok(meadowSpring.estimate.moving > meadowSummer.estimate.moving * 1.3);
  assert.ok(meadowSpring.estimate.legs.some((l) => l.note === 'Mill Ford is in flood'));
});

test('every town pair is connected all year; summer trips between neighbours take 1–5 days (spec §16)', () => {
  const neighbours = [
    ['kingscross', 'copperford'],
    ['kingscross', 'greenhollow'],
    ['kingscross', 'saltmouth'],
    ['greenhollow', 'copperford'],
  ];
  for (const [a, b] of neighbours) {
    const days = routeOptions(graph, cal, a, b, SUMMER + 6 * 60, WAGON)[0].estimate.elapsed / DAY;
    assert.ok(days >= 1 && days <= 5, `summer ${a}→${b} takes ${days.toFixed(1)} days`);
  }
  // Winter is meant to hurt, but no trip should outlast a whole season.
  for (const season of [SPRING, SUMMER, 20 * DAY, WINTER]) {
    for (const a of graph.settlements) {
      for (const b of graph.settlements) {
        if (a === b) continue;
        const best = routeOptions(graph, cal, a, b, season + 6 * 60, WAGON)[0];
        assert.ok(!best.estimate.blocked, `${a}→${b} blocked`);
        const days = best.estimate.elapsed / DAY;
        assert.ok(days < WORLD.calendar.daysPerSeason, `${a}→${b} takes ${days.toFixed(1)} days`);
      }
    }
  }
});
