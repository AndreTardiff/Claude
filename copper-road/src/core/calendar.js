// World calendar: days, seasons, years, daylight and travelling hours.
//
// Simulation time is an integer count of minutes since the world began
// (minute 0 = midnight starting day 0). Everything here is plain integer
// arithmetic so results are identical on every JavaScript engine.
//
// Travellers move only inside each day's travel window: dawn to dusk, less a
// margin for making and breaking camp. Short winter days therefore make every
// journey longer, with no special-case code.

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;

export function parseClock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Bad clock time "${hhmm}" (want HH:MM)`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Bad clock time "${hhmm}"`);
  return h * 60 + min;
}

const pad2 = (n) => String(n).padStart(2, '0');

export function formatClock(minuteOfDay) {
  const m = Math.floor(minuteOfDay);
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function createCalendar(def) {
  const DAY = MINUTES_PER_DAY;
  const camp = def.campMinutes ?? 0;
  const twilight = def.twilightMinutes ?? 45;
  const seasons = def.seasons.map((s, index) => ({
    ...s,
    index,
    dawnMin: parseClock(s.dawn),
    duskMin: parseClock(s.dusk),
  }));
  const dps = def.daysPerSeason;
  const n = seasons.length;

  const day = (t) => Math.floor(t / DAY);
  const minuteOfDay = (t) => t - Math.floor(t / DAY) * DAY;
  const seasonOfDay = (d) => seasons[Math.floor(d / dps) % n];

  const cal = {
    seasons,
    daysPerSeason: dps,
    daysPerYear: dps * n,
    day,
    minuteOfDay,
    seasonOfDay,
    dayStart: (d) => d * DAY,
    season: (t) => seasonOfDay(day(t)),
    year: (t) => def.startYear + Math.floor(day(t) / (dps * n)),
    dayOfSeason: (t) => (day(t) % dps) + 1,

    /** [start, end) of day d's travel window, in absolute minutes. */
    travelWindow(d) {
      const s = seasonOfDay(d);
      return [d * DAY + s.dawnMin + camp, d * DAY + s.duskMin - camp];
    },

    isDaylight(t) {
      const s = cal.season(t);
      const m = minuteOfDay(t);
      return m >= s.dawnMin && m < s.duskMin;
    },

    isTravelTime(t) {
      const [a, b] = cal.travelWindow(day(t));
      return t >= a && t < b;
    },

    /** Light level 0 (night) … 1 (day), ramping through twilight. For rendering only. */
    light(t) {
      const s = cal.season(t);
      const m = minuteOfDay(t);
      const up = (m - (s.dawnMin - twilight)) / (2 * twilight);
      const down = (s.duskMin + twilight - m) / (2 * twilight);
      return Math.max(0, Math.min(1, up, down));
    },

    /** First moment at or after t when a traveller can be moving. */
    nextTravelMoment(t) {
      let d = day(t);
      for (;;) {
        const [a, b] = cal.travelWindow(d);
        if (t < a) return a;
        if (t < b) return t;
        d += 1;
      }
    },

    /** Time at which a traveller leaving at t has done `minutes` of travelling. */
    addTravel(t, minutes) {
      if (minutes <= 0) return t;
      let need = minutes;
      let d = day(t);
      for (;;) {
        const [a, b] = cal.travelWindow(d);
        const start = t > a ? t : a;
        if (start < b) {
          const avail = b - start;
          if (need <= avail) return start + need;
          need -= avail;
        }
        d += 1;
      }
    },

    /** Minutes of travelling time between t0 and t1 (the inverse of addTravel). */
    travelBetween(t0, t1) {
      if (t1 <= t0) return 0;
      let total = 0;
      const last = day(t1);
      for (let d = day(t0); d <= last; d++) {
        const [a, b] = cal.travelWindow(d);
        const lo = a > t0 ? a : t0;
        const hi = b < t1 ? b : t1;
        if (hi > lo) total += hi - lo;
      }
      return total;
    },

    format(t) {
      const d = day(t);
      const s = seasonOfDay(d);
      const dos = (d % dps) + 1;
      const y = def.startYear + Math.floor(d / (dps * n));
      const time = formatClock(minuteOfDay(t));
      return {
        day: d + 1,
        season: s.name,
        date: `${s.name} ${dos}, Year ${y}`,
        time,
        stamp: `Day ${d + 1}, ${time}`,
        full: `Day ${d + 1} · ${s.name} ${dos}, Year ${y} · ${time}`,
      };
    },
  };
  return cal;
}

/** "1 day 6 hours", "5 hours", "40 minutes". */
export function formatDuration(minutes) {
  const m = Math.round(minutes);
  const d = Math.floor(m / MINUTES_PER_DAY);
  const h = Math.floor((m % MINUTES_PER_DAY) / 60);
  const parts = [];
  if (d) parts.push(`${d} day${d === 1 ? '' : 's'}`);
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (!d && !h) parts.push(`${m % 60} minutes`);
  return parts.join(' ');
}
