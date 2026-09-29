// Standing orders (spec §13): what a party does when a band steps into the road,
// set before it leaves. Merchants set theirs from their temper and change them
// after a bad day on the road; the player will set their own (step H).
//
//   threatened   fight: refuse a toll and stand if attacked
//                toll:  pay when asked; if attacked, stand (unless outnumbered)
//                flee:  run from anything
//   outnumbered  give way (pay if asked, run if attacked) when the band looks this
//                many times stronger than the party; null: never
//   cargo        drop: running, cut the load loose (the band stops for it: everyone gets away)
//                hold: run with it (a running fight, at worse odds)
//   night        watch: a double watch at the night's camp (15% more in wages; thieves wake it)
//                sleep: the usual single watch

const round3 = (x) => Math.round(x * 1000) / 1000;

/** Orders to match a temper (boldness, permille). */
export function ordersFor(boldness) {
  const caution = (1000 - boldness) / 1000;
  if (caution > 0.7) return { threatened: 'toll', outnumbered: 1.5, cargo: 'drop', night: 'watch' };
  if (caution >= 0.5) return { threatened: 'toll', outnumbered: 2, cargo: 'drop', night: 'watch' };
  if (caution >= 0.3) return { threatened: 'fight', outnumbered: 2, cargo: 'drop', night: 'sleep' };
  return { threatened: 'fight', outnumbered: 3, cargo: 'hold', night: 'sleep' };
}

const WARIER = { fight: 'toll', toll: 'toll', flee: 'flee' };
const BOLDER = { flee: 'toll', toll: 'fight', fight: 'fight' };
const SOONER = { 3: 2, 2: 1.5, 1.5: 1.5 }; // give way to a smaller band than before

/**
 * After an encounter, a merchant may change their orders: a lost fight that cost
 * lives (or their liberty) makes them warier (pay rather than fight, give way to a
 * smaller band; running from everything is a choice only a player makes); a band beaten off with guards along
 * makes a toll-payer bolder. Returns the change, if any.
 */
export function reviseOrders(sim, m, rec) {
  const o = m.orders;
  if (!o) return null;
  let to = null;
  let why = null;
  const hurt = rec.hands.length + rec.guardsDead.length;
  if ((rec.outcome === 'robbed' && (hurt >= 2 || rec.captured)) || rec.outcome === 'murdered') {
    to = WARIER[o.threatened];
    why = rec.captured ? 'taken for ransom' : 'lives lost in a fight they lost';
  } else if (rec.outcome === 'fought off' && rec.guards?.length && o.threatened !== 'fight') {
    to = BOLDER[o.threatened];
    why = 'their guards beat a band off';
  }
  if (!to) return null;
  const was = o.threatened;
  const giveWay = to === WARIER[was] && o.outnumbered !== null ? SOONER[o.outnumbered] : o.outnumbered;
  if (to === was && giveWay === o.outnumbered) return null;
  o.threatened = to;
  o.outnumbered = giveWay;
  if (to !== 'fight') o.cargo = 'drop';
  m.ordersChanged = { t: sim.now, was, to, why };
  sim.log('merchant:orders', { who: m.id, was, to, why, outnumbered: o.outnumbered });
  return { was, to };
}

/** Two months without trouble: a merchant's orders drift back to what their temper would set. */
export function settleOrders(sim, m) {
  const c = m.ordersChanged;
  if (!c || sim.now - c.t < 60 * 1440) return;
  const usual = ordersFor(m.boldness);
  m.ordersChanged = null;
  if (usual.threatened === m.orders.threatened) return;
  const was = m.orders.threatened;
  m.orders = usual;
  sim.log('merchant:orders', { who: m.id, was, to: usual.threatened, why: 'time' });
}

/** What the orders say to do, given how the two sides look to each other. */
export function orderedResponse(orders, approach, att, def) {
  const outnumbered = orders.outnumbered !== null && att >= def * orders.outnumbered;
  if (approach === 'demand') {
    if (orders.threatened === 'flee') return { act: 'run', rule: 'flee' };
    if (orders.threatened === 'toll') return { act: 'pay', rule: 'toll' };
    return outnumbered ? { act: 'pay', rule: 'outnumbered', ratio: round3(att / def) } : { act: 'fight', rule: 'fight' };
  }
  // Attacked.
  if (orders.threatened === 'flee') return { act: 'run', rule: 'flee' };
  if (outnumbered) return { act: 'run', rule: 'outnumbered', ratio: round3(att / def) };
  return { act: 'fight', rule: orders.threatened === 'fight' ? 'fight' : 'stand' };
}
