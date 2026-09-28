// The lord's post: riders on a fixed circuit, carrying each town's posted prices
// to the next town's inn as letters. Letters are exact but only as fresh as the
// ride was long, so the post is how a town's picture of the others catches up.

import { GIVEN_NAMES } from '../data/names.js';
import { finishLeg, newTrip, planJourney, reroute, startLeg } from '../world/journey.js';
import { swapNews } from './knowledge.js';

export const post = {
  id: 'post',

  init(sim) {
    const cfg = sim.data.post;
    if (!cfg) return;
    const rng = sim.rng('post.init');
    const names = rng.shuffle(GIVEN_NAMES.slice());
    const st = (sim.state.post = { byId: {}, order: [] });
    const n = cfg.circuit.length;
    for (let i = 0; i < cfg.riders; i++) {
      const idx = (i * Math.floor(n / cfg.riders)) % n;
      const rider = { id: sim.nextId('p'), name: names[i % names.length], idx, at: cfg.circuit[idx], trip: null, tripNo: 0, deliveries: 0 };
      st.byId[rider.id] = rider;
      st.order.push(rider.id);
      sim.schedule(sim.cal.nextTravelMoment(sim.now) + i * 60, 'post:depart', { id: rider.id, tripNo: 0 });
    }
  },

  handlers: {
    'post:depart': onDepart,
    'post:node': onNode,
    'post:retry': onRetry,
  },
};

export const getRider = (sim, id) => sim.state.post?.byId[id];

function plan(sim, from, dest) {
  return planJourney(sim, from, dest, { speedKmh: sim.data.post.speedKmh, caution: 0.3 });
}

function onDepart(sim, { id, tripNo }) {
  const r = getRider(sim, id);
  if (!r || r.trip || r.tripNo !== tripNo) return;
  const circuit = sim.data.post.circuit;
  const dest = circuit[(r.idx + 1) % circuit.length];
  const p = plan(sim, r.at, dest);
  if (!p) {
    sim.schedule(sim.cal.travelWindow(sim.cal.day(sim.now) + 1)[0], 'post:depart', { id, tripNo });
    return;
  }
  r.tripNo += 1;
  r.trip = newTrip(sim, { tripNo: r.tripNo, from: r.at, dest, plan: p, speedKmh: sim.data.post.speedKmh });
  r.at = null;
  go(sim, r);
}

// Start the next leg, or find another way round, or wait for the road to open.
function go(sim, r) {
  const blocked = startLeg(sim, r.trip, 'post:node', r.id);
  if (!blocked) return;
  const p = plan(sim, r.trip.at, r.trip.dest);
  if (p) {
    reroute(r.trip, p);
    if (!startLeg(sim, r.trip, 'post:node', r.id)) return;
  }
  r.trip.waiting = true;
  sim.schedule(sim.cal.travelWindow(sim.cal.day(sim.now) + 1)[0], 'post:retry', { id: r.id, tripNo: r.tripNo });
}

function onRetry(sim, { id, tripNo }) {
  const r = getRider(sim, id);
  if (!r?.trip || r.trip.tripNo !== tripNo || !r.trip.waiting) return;
  go(sim, r);
}

function onNode(sim, { id, tripNo }) {
  const r = getRider(sim, id);
  if (!r?.trip || r.trip.tripNo !== tripNo || !r.trip.legSeg) return;
  finishLeg(sim, r.trip);
  if (r.trip.at !== r.trip.dest) {
    go(sim, r);
    return;
  }
  const dest = r.trip.dest;
  const from = r.trip.from;
  r.at = dest;
  r.trip = null;
  r.idx = (r.idx + 1) % sim.data.post.circuit.length;
  r.deliveries += 1;
  const { told } = swapNews(sim, r.id, dest, { letters: true });
  if (told) sim.log('post:arrived', { who: r.id, at: dest, from, letters: told });
  const rest = sim.now + sim.data.post.restHours * 60;
  sim.schedule(sim.cal.nextTravelMoment(rest), 'post:depart', { id: r.id, tripNo: r.tripNo });
}
