import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, WORLD, describe, getMerchant, planJourney, quote } from '../src/index.js';
import { balance, booksBalance, moneySupply, transfer } from '../src/economy/money.js';
import { residentsAt } from '../src/economy/people.js';
import { believedDanger, reportRoad } from '../src/systems/knowledge.js';
import { activeBands, getBand } from '../src/systems/raiders.js';

const DAY = 1440;
const at = (day) => 330 + day * DAY;

test('bands are named people in hideouts by the wild roads, not in any town', () => {
  const sim = new Simulation({ seed: 1 });
  const bands = activeBands(sim);
  assert.equal(bands.length, WORLD.raiders.start.length);
  for (const b of bands) {
    const hideout = WORLD.raiders.hideouts.find((h) => h.id === b.hideout);
    assert.ok(hideout.watches.includes(b.watching));
    assert.ok(b.members.includes(b.leader));
    for (const id of b.members) {
      const r = sim.state.residents.byId[id];
      assert.ok(r.alive && r.home === null && r.profession === 'outlaw' && r.name);
    }
  }
  for (const n of WORLD.nodes.filter((x) => x.kind !== 'waypoint')) assert.equal(residentsAt(sim, n.id).length, n.residents);
});

test('AT-24: hard times fill the bands: hunger and empty purses send the idle to the hills', () => {
  const recruits = (shock) => {
    let n = 0;
    for (const seed of [1, 2, 3, 4]) {
      const sim = new Simulation({ seed });
      sim.advanceTo(at(10));
      if (shock) {
        // Copperford's granary burns and its households are cleaned out (into the ground: the books balance).
        sim.command('lab:spoil', { at: 'copperford', good: 'grain', fraction: 0.95 });
        transfer(sim, 'purse:copperford', 'hoard', balance(sim, 'purse:copperford'));
      }
      sim.advanceTo(at(50));
      n += sim.state.log.filter((e) => e.type === 'raid:recruit' && e.from === 'copperford').length;
    }
    return n;
  };
  const calm = recruits(false);
  const hard = recruits(true);
  assert.ok(hard > calm + 2, `recruits from Copperford: ${calm} in ordinary times, ${hard} after the fire`);
});

test('roads are news: a raid report raises the danger a traveller believes in, then fades', () => {
  const sim = new Simulation({ seed: 2 });
  const seg = 'estuary-west';
  const base = sim.graph.segments.get(seg).danger;
  assert.equal(believedDanger(sim, 'tester', seg), base);
  reportRoad(sim, 'tester', seg, { danger: 0.8, what: 'raided' });
  const fresh = believedDanger(sim, 'tester', seg);
  assert.ok(fresh > 0.7);
  // A traveller who then saw nothing doesn't undo it at once…
  sim.advanceTo(sim.now + DAY);
  assert.equal(reportRoad(sim, 'tester', seg, { danger: base, what: 'quiet' }), false);
  // …and the fright fades with time.
  sim.advanceTo(sim.now + 20 * DAY);
  const old = believedDanger(sim, 'tester', seg);
  assert.ok(old < fresh * 0.5 && old > base, `${fresh} → ${old}`);
  // A route planner that has heard of it goes round.
  reportRoad(sim, 'wary', 'blackpine-east', { danger: 1, what: 'raided' });
  const heard = planJourney(sim, 'kingscross', 'copperford', { speedKmh: 3.5, caution: 0.3, holder: 'wary' });
  const unaware = planJourney(sim, 'kingscross', 'copperford', { speedKmh: 3.5, caution: 0.3, holder: 'unaware' });
  assert.ok(unaware.routes.includes('blackpine-track') && !heard.routes.includes('blackpine-track'), `${unaware.routes} vs ${heard.routes}`);
});

test('encounters: goods move from wagons to the band, every factor is kept, and the books balance', () => {
  let seen = 0;
  for (const seed of [1, 7, 23]) {
    const sim = new Simulation({ seed });
    sim.advanceTo(at(150));
    for (const rec of sim.state.raiders.encounters) {
      seen++;
      assert.ok(['demand', 'attack', 'steal'].includes(rec.approach));
      assert.ok(rec.outcome && rec.att > 0 && rec.def > 0 && rec.odds > 0 && rec.odds < 1);
      if (rec.outcome === 'fought off') assert.deepEqual(rec.goods, {});
    }
    for (const e of sim.state.log.filter((x) => x.type.startsWith('raid:') || x.type === 'merchant:lost')) {
      const text = describe(e, sim);
      assert.ok(text && !/undefined|NaN|null|\[object/.test(text), `${e.type}: ${text}`);
    }
    // Stolen goods sit in the bands' loot until fenced; nothing else holds them.
    const stolen = {};
    for (const e of sim.state.log.filter((x) => x.type === 'raid:encounter')) for (const [g, q] of Object.entries(e.goods)) stolen[g] = (stolen[g] ?? 0) + q;
    const held = {};
    for (const b of Object.values(sim.state.raiders.bands)) for (const [g, q] of Object.entries(b.loot)) held[g] = (held[g] ?? 0) + q;
    const fenced = {};
    for (const e of sim.state.log.filter((x) => x.type === 'raid:fenced')) fenced[e.good] = (fenced[e.good] ?? 0) + e.qty;
    for (const g of Object.keys(stolen)) assert.ok(Math.abs(stolen[g] - (held[g] ?? 0) - (fenced[g] ?? 0)) < 0.01, `${g}: stole ${stolen[g]}, hold ${held[g] ?? 0}, fenced ${fenced[g] ?? 0}`);
    assert.equal(moneySupply(sim), booksBalance(sim));
  }
  assert.ok(seen >= 10, `only ${seen} encounters`);
});

test('GATE E: a caravan lost on the road leaves a visible shortage where it was bound', () => {
  // Find a grain caravan whose road runs past a hideout; replay its trip twice from the
  // moment it sets out: once with a strong, merciless band waiting on that road, once without.
  const watched = new Map(WORLD.raiders.hideouts.flatMap((h) => h.watches.map((s) => [s, h.id])));
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const sim = new Simulation({ seed, data: { ...WORLD } });
    for (let d = 5; d < 120; d++) {
      const seen = sim.state.log.length;
      sim.advanceTo(at(d));
      const dep = sim.state.log.slice(seen).find((e) => e.type === 'merchant:departed' && e.good === 'grain');
      if (!dep) continue;
      const m = getMerchant(sim, dep.who);
      const seg = m.trip?.path.find((s) => watched.has(s));
      if (!seg || m.trip.path.indexOf(seg) < m.trip.leg) continue;
      const snap = sim.snapshot();
      const twin = (raid) => {
        const s = Simulation.restore(snap, { data: sim.data });
        if (raid) {
          s.command('lab:band', { hideout: watched.get(seg), members: 12, watch: seg });
          const band = activeBands(s).find((b) => b.hideout === watched.get(seg));
          band.cruelty = 1000;
        }
        s.advanceTo(s.now + 10 * DAY);
        return s;
      };
      const raided = twin(true);
      const hit = raided.state.log.find((e) => e.type === 'raid:encounter' && e.who === dep.who && e.goods.grain > 5);
      if (!hit) continue;
      const safe = twin(false);
      // Only a fair comparison if, left alone, the caravan would have sold its grain there.
      if (!safe.state.log.some((e) => e.type === 'merchant:sold' && e.who === dep.who && e.at === dep.to && e.t > dep.t)) continue;
      const stock = (s) => s.state.economy.markets[dep.to].grain.stock;
      assert.ok(stock(safe) > stock(raided) + 5, `${dep.to} grain: ${stock(safe)} safe vs ${stock(raided)} raided`);
      assert.ok(quote(raided, dep.to, 'grain').price > quote(safe, dep.to, 'grain').price, 'dearer where the caravan never came');
      return;
    }
  }
  assert.fail('no grain caravan was ever raided in the replays');
});

test('AT-21: letters taken from the post never reach the next inn', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const sim = new Simulation({ seed });
    sim.command('lab:band', { hideout: 'fen-islands', members: 10, watch: 'estuary-west' });
    for (let d = 1; d < 90; d++) {
      const seen = sim.state.log.length;
      sim.advanceTo(at(d));
      const e = sim.state.log.slice(seen).find((x) => x.type === 'raid:encounter' && x.kind === 'rider' && x.outcome === 'robbed');
      if (!e) continue;
      const pouch = sim.state.knowledge.holders[e.who];
      assert.equal(Object.keys(pouch).filter((k) => !k.startsWith('road:')).length, 0, 'the pouch is empty');
      const band = getBand(sim, e.band);
      assert.ok(Object.keys(sim.state.knowledge.holders[band.id]).some((k) => !k.startsWith('road:')), 'the band has the letters');
      return;
    }
  }
  assert.fail('the post was never robbed');
});

test('a merchant taken on the road is held for ransom, and the house pays to get them back', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const sim = new Simulation({ seed });
    sim.command('lab:band', { hideout: 'blackpine-hollows', members: 12, watch: 'blackpine-east' });
    for (const b of activeBands(sim)) b.cruelty = 1000;
    for (let d = 1; d < 120; d++) {
      const seen = sim.state.log.length;
      sim.advanceTo(at(d));
      const e = sim.state.log.slice(seen).find((x) => x.type === 'raid:encounter' && x.captured);
      if (!e) continue;
      const m = getMerchant(sim, e.who);
      assert.ok(m.trip === null, "the caravan's journey ends where they were taken");
      sim.advanceTo(sim.now + (WORLD.raiders.ransom.days + 2) * DAY);
      const fate = sim.state.log.find((x) => ['raid:ransomed', 'raid:released', 'raid:captive-killed'].includes(x.type) && x.who === m.id && x.t > e.t);
      assert.ok(fate, 'a captive is ransomed, released or killed');
      if (fate.type !== 'raid:captive-killed') assert.ok(!m.captive && m.active);
      assert.equal(moneySupply(sim), booksBalance(sim));
      return;
    }
  }
  assert.fail('nobody was ever captured');
});
