// The simulation: fixed ticks plus a discrete event queue.
//
// Each step() advances one tick (data.time.minutesPerTick):
//   1. Run every queued event due by the end of the tick, in (time, seq) order.
//      The clock moves to each event's own time while it runs.
//   2. Set the clock to the end of the tick.
//   3. Run periodic hooks due at that moment, in system order:
//      hourly on the hour, daily at midnight, seasonal at the first midnight of a season.
//
// All mutable state lives in `this.state`: plain JSON data. It includes the
// clock, the RNG streams, the event queue and the log. Snapshots are a JSON copy,
// and restoring one resumes the exact same future. Static world data
// (`this.data`) is never mutated. Its hash is recorded so a snapshot can't be
// restored against different data.

import { createCalendar, parseClock, MINUTES_PER_DAY } from '../core/calendar.js';
import { heapPush, heapPop } from '../core/scheduler.js';
import { getRng } from '../core/rng.js';
import { hashValue } from '../core/hash.js';
import { buildGraph } from '../world/routes.js';
import { validateWorld } from '../world/validate.js';
import { WORLD } from '../data/world.js';
import { SYSTEMS } from '../systems/index.js';

export const STATE_FORMAT = 1;
const MAX_EVENTS_PER_TICK = 100000;

export class Simulation {
  /**
   * @param {object} opts
   * @param {object} [opts.data]    static world definition (default: WORLD)
   * @param {number|string} [opts.seed]
   * @param {object[]} [opts.systems] ordered system list (default: SYSTEMS)
   * @param {object} [opts.state]   existing state to resume (see restore())
   */
  constructor({ data = WORLD, seed = 1, systems = SYSTEMS, state = null } = {}) {
    const errors = validateWorld(data);
    if (errors.length) throw new Error('World data is invalid:\n  ' + errors.join('\n  '));

    this.data = data;
    this.systems = systems;
    this.cal = createCalendar(data.calendar);
    this.graph = buildGraph(data);
    this.minutesPerTick = data.time.minutesPerTick;
    this.dataHash = hashValue(data);

    this.handlers = new Map();
    this.hooks = { hourly: [], daily: [], seasonal: [] };
    for (const sys of systems) {
      for (const [kind, fn] of Object.entries(sys.handlers ?? {})) {
        if (this.handlers.has(kind)) throw new Error(`Two systems handle event "${kind}"`);
        this.handlers.set(kind, fn);
      }
      for (const hook of Object.keys(this.hooks)) if (sys[hook]) this.hooks[hook].push(sys[hook]);
    }

    if (state) {
      if (state.format !== STATE_FORMAT) throw new Error(`Snapshot format ${state.format} is not ${STATE_FORMAT}`);
      if (state.dataHash !== this.dataHash) throw new Error('Snapshot was made with different world data');
      this.state = state;
    } else {
      const start = data.time.start.day * MINUTES_PER_DAY + parseClock(data.time.start.time);
      this.state = {
        format: STATE_FORMAT,
        seed,
        dataHash: this.dataHash,
        time: start,
        tick: 0,
        nextSeq: 0,
        nextId: 1,
        queue: [],
        rng: {},
        log: [],
      };
      for (const sys of systems) sys.init?.(this);
    }
  }

  /** Resume from a snapshot. The snapshot is copied, never shared. */
  static restore(snapshot, opts = {}) {
    return new Simulation({ ...opts, state: JSON.parse(JSON.stringify(snapshot)) });
  }

  get now() {
    return this.state.time;
  }

  get seed() {
    return this.state.seed;
  }

  rng(stream) {
    return getRng(this.state.rng, this.state.seed, stream);
  }

  nextId(prefix) {
    return `${prefix}${this.state.nextId++}`;
  }

  schedule(t, kind, data = {}) {
    if (!Number.isInteger(t)) throw new Error(`schedule(${kind}): time must be a whole minute, got ${t}`);
    if (t < this.state.time) throw new Error(`schedule(${kind}): ${t} is in the past (now ${this.state.time})`);
    if (!this.handlers.has(kind)) throw new Error(`schedule: no system handles "${kind}"`);
    heapPush(this.state.queue, { t, seq: this.state.nextSeq++, kind, data });
  }

  /** Append a structured entry to the world log. Text is rendered later by narrative/describe.js. */
  log(type, fields = {}) {
    const entry = { t: this.state.time, type, ...fields };
    this.state.log.push(entry);
    return entry;
  }

  step() {
    const st = this.state;
    const end = st.time + this.minutesPerTick;
    let n = 0;
    while (st.queue.length && st.queue[0].t <= end) {
      const ev = heapPop(st.queue);
      st.time = ev.t;
      this.handlers.get(ev.kind)(this, ev.data);
      if (++n > MAX_EVENTS_PER_TICK) throw new Error(`More than ${MAX_EVENTS_PER_TICK} events in one tick: runaway scheduling?`);
    }
    st.time = end;
    st.tick += 1;
    if (end % 60 === 0) for (const f of this.hooks.hourly) f(this);
    if (end % MINUTES_PER_DAY === 0) {
      for (const f of this.hooks.daily) f(this);
      if (this.cal.dayOfSeason(end) === 1) for (const f of this.hooks.seasonal) f(this);
    }
  }

  /** Run whole ticks until the clock reaches `t` (never overshooting it). */
  advanceTo(t) {
    while (this.state.time + this.minutesPerTick <= t) this.step();
  }

  runDays(days) {
    this.advanceTo(this.state.time + days * MINUTES_PER_DAY);
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  hash() {
    return hashValue(this.state);
  }
}
