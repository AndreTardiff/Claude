import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar, formatDuration, parseClock } from '../src/core/calendar.js';
import { WORLD } from '../src/data/world.js';

const cal = createCalendar(WORLD.calendar);
const DAY = 1440;

test('days, seasons and years follow the calendar', () => {
  assert.equal(cal.season(0).id, 'spring');
  assert.equal(cal.season(10 * DAY).id, 'summer');
  assert.equal(cal.season(10 * DAY - 1).id, 'spring');
  assert.equal(cal.season(30 * DAY).id, 'winter');
  assert.equal(cal.season(40 * DAY).id, 'spring');
  assert.equal(cal.year(0), 1);
  assert.equal(cal.year(39 * DAY + 1439), 1);
  assert.equal(cal.year(40 * DAY), 2);
  assert.equal(cal.dayOfSeason(0), 1);
  assert.equal(cal.dayOfSeason(9 * DAY), 10);
  assert.equal(cal.dayOfSeason(10 * DAY), 1);
});

test('format() is human-readable', () => {
  const f = cal.format(12 * DAY + 14 * 60 + 5);
  assert.equal(f.date, 'Summer 3, Year 1');
  assert.equal(f.time, '14:05');
  assert.equal(f.stamp, 'Day 13, 14:05');
  assert.equal(formatDuration(1440 + 6 * 60), '1 day 6 hours');
  assert.equal(formatDuration(40), '40 minutes');
});

test('travel windows follow the seasons, less camp time', () => {
  // Spring: dawn 06:00, dusk 19:00, 30 min camp at each end.
  assert.deepEqual(cal.travelWindow(0), [parseClock('06:30'), parseClock('18:30')]);
  // Winter day 30: dawn 08:00, dusk 16:00.
  assert.deepEqual(cal.travelWindow(30), [30 * DAY + parseClock('08:30'), 30 * DAY + parseClock('15:30')]);
});

test('addTravel skips the night and resumes next morning', () => {
  const start = parseClock('17:30'); // spring day 0, one hour before camp
  const arrive = cal.addTravel(start, 90);
  assert.equal(arrive, DAY + parseClock('07:00')); // 60 min tonight, 30 min tomorrow from 06:30
  // Before first light, travel waits for the window to open.
  assert.equal(cal.addTravel(parseClock('02:00'), 10), parseClock('06:40'));
});

test('travelBetween() is the inverse of addTravel()', () => {
  for (const [t, m] of [[0, 10], [parseClock('17:00'), 600], [25 * DAY + 100, 3000], [33 * DAY + 900, 777]]) {
    const arrive = cal.addTravel(t, m);
    assert.equal(cal.travelBetween(t, arrive), m, `t=${t} m=${m}`);
  }
});

test('winter journeys take longer than summer ones', () => {
  const minutes = 30 * 60;
  const summerDepart = 10 * DAY; // summer day 1, midnight
  const winterDepart = 30 * DAY;
  const summer = cal.addTravel(summerDepart, minutes) - summerDepart;
  const winter = cal.addTravel(winterDepart, minutes) - winterDepart;
  assert.ok(winter > summer * 1.5, `winter ${winter} vs summer ${summer}`);
});

test('light level is 0 at midnight, 1 at noon, between at dawn', () => {
  assert.equal(cal.light(0), 0);
  assert.equal(cal.light(12 * 60), 1);
  const dawn = cal.light(parseClock('06:00'));
  assert.ok(dawn > 0 && dawn < 1);
});
