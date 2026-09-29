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
  for (const n of WORLD.nodes.filter((x) => x.kind !== 'waypoint')) assert.equal(residentsAt(sim, n.id).length, n.residents + (WORLD.mercs.start[n.id] ?? 0));
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
    // Stolen grain is also eaten in the hills.
    const eaten = Object.values(sim.state.raiders.bands).reduce((a, b) => a + (b.eatenLoot ?? 0), 0);
    for (const g of Object.keys(stolen)) {
      const gone = (held[g] ?? 0) + (fenced[g] ?? 0) + (g === 'grain' ? eaten : 0);
      assert.ok(g === 'grain' ? gone >= stolen[g] - 0.01 : Math.abs(stolen[g] - gone) < 0.01, `${g}: stole ${stolen[g]}, hold ${held[g] ?? 0}, fenced ${fenced[g] ?? 0}`);
    }
    assert.equal(moneySupply(sim), booksBalance(sim));
  }
  assert.ok(seen >= 10, `only ${seen} encounters`);
});

test('GATE E: a caravan lost on the road leaves a visible shortage where it was bound', () => {
  // Find a grain caravan whose road runs past a hideout. Replay the world from the day
  // before it set out, twice: once with a strong, merciless band waiting on that road,
  // once without. Where the caravan got through and sold, compare the town it was bound for.
  const watched = new Map(WORLD.raiders.hideouts.flatMap((h) => h.watches.map((s) => [s, h.id])));
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const sim = new Simulation({ seed });
    let before = sim.snapshot();
    for (let d = 5; d < 120; d++) {
      const seen = sim.state.log.length;
      const yesterday = sim.snapshot();
      sim.advanceTo(at(d));
      const dep = sim.state.log.slice(seen).find((e) => e.type === 'merchant:departed' && e.good === 'grain');
      before = yesterday;
      if (!dep) continue;
      const m = getMerchant(sim, dep.who);
      const seg = m.trip?.path.find((s) => watched.has(s));
      if (!seg) continue;
      const replay = (raid, until) => {
        const s = Simulation.restore(before, { data: sim.data });
        if (raid) {
          s.command('lab:band', { hideout: watched.get(seg), members: 12, watch: seg });
          activeBands(s).find((b) => b.hideout === watched.get(seg)).cruelty = 1000;
        }
        s.advanceTo(until);
        return s;
      };
      const horizon = dep.t + 10 * DAY;
      const safe = replay(false, horizon);
      const sold = safe.state.log.find((e) => e.type === 'merchant:sold' && e.who === dep.who && e.at === dep.to && e.t > dep.t && e.t < horizon);
      if (!sold || !safe.state.log.some((e) => e.type === 'merchant:departed' && e.who === dep.who && e.t === dep.t)) continue;
      // Just after the sale would have landed: the town either has the grain or doesn't.
      const raided = replay(true, sold.t + 60);
      const hit = raided.state.log.find((e) => e.type === 'raid:encounter' && e.who === dep.who && e.seg === seg && e.goods.grain > 5 && e.t >= dep.t);
      if (!hit) continue;
      const calm = replay(false, sold.t + 60);
      const stock = (s) => s.state.economy.markets[dep.to].grain.stock;
      assert.ok(stock(calm) > stock(raided) + 5, `${dep.to} grain: ${stock(calm)} safe vs ${stock(raided)} raided`);
      assert.ok(quote(raided, dep.to, 'grain').price > quote(calm, dep.to, 'grain').price, 'dearer where the caravan never came');
      return;
    }
  }
  assert.fail('no grain caravan was ever raided in the replays');
});

test('AT-21: letters taken from the post never reach the next inn', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const sim = new Simulation({ seed });
    sim.command('lab:band', { hideout: 'fen-islands', members: 10, watch: 'estuary-west' });
    // Hour by hour, so the pouch is looked at before the rider reaches the next inn.
    for (let h = 1; h < 90 * 24; h++) {
      const seen = sim.state.log.length;
      sim.advanceTo(at(0) + h * 60);
      const e = sim.state.log.slice(seen).find((x) => x.type === 'raid:encounter' && x.kind === 'rider' && x.outcome === 'robbed');
      if (!e) continue;
      const pouch = sim.state.knowledge.holders[e.who];
      assert.equal(Object.keys(pouch).filter((k) => !k.startsWith('road:') && !k.startsWith('fame:')).length, 0, 'the pouch is empty');
      const band = getBand(sim, e.band);
      assert.ok(Object.keys(sim.state.knowledge.holders[band.id]).some((k) => !k.startsWith('road:') && !k.startsWith('fame:')), 'the band has the letters');
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
      if (fate.type === 'raid:ransomed') assert.ok(fate.bits > 0 && ['house', 'lord', 'town'].includes(fate.payer));
      // (After that, the house may be ruined by the ransom, or taken again: this band is merciless.)
      assert.equal(moneySupply(sim), booksBalance(sim));
      return;
    }
  }
  assert.fail('nobody was ever captured');
});

// ── E3: the raiders' economy ────────────────────────────────────────────────

test('AT-24: a starving winter changes what a band does: it raids a town, moves, or breaks up', () => {
  let changed = 0;
  for (const seed of [1, 2, 3, 4]) {
    const sim = new Simulation({ seed });
    sim.advanceTo(at(29)); // the eve of winter, when the High Pass is snowed shut
    sim.command('lab:band', { hideout: 'saddle-caves', members: 6, watch: 'high-pass-south' });
    const band = activeBands(sim).find((b) => b.hideout === 'saddle-caves');
    band.food = 0;
    band.loot = {};
    transfer(sim, `band:${band.id}`, 'hoard', balance(sim, `band:${band.id}`));
    sim.advanceTo(at(45));
    const log = sim.state.log.filter((e) => e.band === band.id && e.t > at(29));
    assert.ok(!log.some((e) => e.type === 'raid:encounter' && e.seg.startsWith('high-pass') && sim.cal.season(e.t).id === 'winter'), 'nobody travels a closed pass');
    if (log.some((e) => ['raid:town', 'raid:relocated', 'raid:disbanded'].includes(e.type))) changed++;
  }
  assert.ok(changed >= 3, `only ${changed} of 4 starving bands changed their ways`);
});

test('fenced loot turns up cheap in the fence town, through its market', () => {
  let fenced = 0;
  for (const seed of [7, 23]) {
    const sim = new Simulation({ seed });
    let pending = [];
    for (let d = 1; d <= 200; d++) {
      sim.advanceTo(at(d));
      // Fencing happens at midnight, after the day's books close: it shows in the next day's.
      for (const e of pending) {
        if (e.at !== 'saltmouth') assert.ok(sim.state.economy.today[e.at].road.in[e.good] >= e.qty - 0.01, `${e.good} fenced in ${e.at}`);
      }
      pending = sim.state.log.filter((x) => x.type === 'raid:fenced' && x.t > at(d - 1));
      for (const e of pending) {
        fenced++;
        assert.ok(WORLD.raiders.hideouts.some((h) => h.fence === e.at), `${e.at} is some band's fence town`);
        assert.ok(e.bits > 0 && e.bits <= Math.ceil(e.qty * quote(sim, e.at, e.good).base * 12 * 2.5));
      }
      // Tomorrow's check needs tomorrow's books.
      if (pending.length) sim.advanceTo(at(d) + DAY - 330 + 5);
    }
  }
  assert.ok(fenced > 0, 'nothing was ever fenced');
});

test('bands bury coin, and buried coin can come back: the books still balance', () => {
  for (const seed of [2, 7]) {
    const sim = new Simulation({ seed });
    sim.advanceTo(at(250));
    const f = sim.state.coin.flows;
    assert.ok(f.unearthed <= f.hoarded);
    const cached = sim.state.raiders.hoards.reduce((a, h) => a + h.bits, 0);
    assert.ok(cached >= 0 && cached <= f.hoarded);
    for (const e of sim.state.log.filter((x) => x.type === 'raid:unearthed')) assert.ok(!/undefined|NaN/.test(describe(e, sim)));
    assert.equal(moneySupply(sim), booksBalance(sim));
  }
});

test("the lord's patrols: word of raids sends guards, and bands on that road suffer or move", () => {
  let patrols = 0;
  let felt = 0;
  for (const seed of [1, 2, 7, 23]) {
    const sim = new Simulation({ seed });
    sim.advanceTo(at(200));
    for (const e of sim.state.log.filter((x) => x.type === 'lord:patrol')) {
      patrols++;
      const route = WORLD.routes.find((r) => r.id === e.route);
      // Bands watching that road while the patrol rode: a clash, or they moved off it.
      const during = sim.state.log.filter((x) => x.t >= e.t && x.t < e.t + e.days * DAY);
      if (during.some((x) => (x.type === 'raid:patrol-clash' && x.route === e.route) || (x.type === 'raid:moved' && route.segments.includes(x.from)))) felt++;
      assert.ok(!/undefined|NaN/.test(describe(e, sim)));
    }
  }
  assert.ok(patrols >= 2, `${patrols} patrols`);
  assert.ok(felt >= 1, 'no band ever felt a patrol');
});

test('a band that breaks up sends its people home as labourers', () => {
  const sim = new Simulation({ seed: 3 });
  sim.advanceTo(at(12));
  sim.command('lab:band', { hideout: 'gorge-ledges', members: 4 });
  const band = activeBands(sim).find((b) => b.hideout === 'gorge-ledges');
  const people = [...band.members];
  band.starving = WORLD.raiders.food.disbandAfter;
  band.hunger = 0.9;
  band.food = 0;
  transfer(sim, `band:${band.id}`, 'hoard', balance(sim, `band:${band.id}`));
  sim.advanceTo(at(14));
  assert.equal(getBand(sim, band.id).active, false);
  for (const id of people) {
    const r = sim.state.residents.byId[id];
    assert.ok(!r.alive || (r.home && r.profession === 'labourer'), `${r.name}: ${r.home} ${r.profession}`);
  }
  const e = sim.state.log.find((x) => x.type === 'raid:disbanded' && x.band === band.id);
  assert.ok(e && !/undefined|NaN/.test(describe(e, sim)));
});

// ── E4: night and camps ─────────────────────────────────────────────────────

test('surprise closures: nobody knows until they reach the road or hear of it, then they go round or wait', () => {
  const sim = new Simulation({ seed: 1 });
  sim.advanceTo(at(3));
  // Flood the ford by hand.
  const until = sim.now + 3 * DAY;
  for (const seg of ['meadow-east', 'meadow-west']) sim.state.weather.closures[seg] = { event: 'flood', at: 'mill-ford', until, note: 'the Copperwash is over the ford' };
  const before = planJourney(sim, 'kingscross', 'greenhollow', { speedKmh: 3.5, caution: 0.5, holder: 'someone' });
  assert.ok(before.routes.includes('meadow-road'), 'the flood is not known yet');
  sim.advanceTo(at(5));
  // Whoever set out for the ford since has seen it shut, and says so.
  const told = Object.entries(sim.state.knowledge.holders).filter(([, h]) => h['road:meadow-east']?.what === 'closed' || h['road:meadow-west']?.what === 'closed');
  assert.ok(told.length > 0, 'somebody found the ford flooded');
  const [holder] = told[0];
  const after = planJourney(sim, 'kingscross', 'greenhollow', { speedKmh: 3.5, caution: 0.5, holder });
  assert.ok(!after || !after.routes.includes('meadow-road'), 'who knows goes round, or waits');
});

test('the camps experiment: stranded travellers make camp, then leave a hearth or a waystation', () => {
  let camps = 0;
  let ends = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const sim = new Simulation({ seed });
    sim.advanceTo(at(300));
    for (const e of sim.state.log.filter((x) => x.type.startsWith('camp:') && x.type !== 'camp:fireside')) {
      assert.ok(!/undefined|NaN|null/.test(describe(e, sim)), describe(e, sim));
      if (e.type === 'camp:formed') {
        camps++;
        assert.ok(e.people.length >= 2 && sim.graph.nodes.get(e.at).kind === 'waypoint');
      }
      if (e.type === 'camp:dispersed' || e.type === 'camp:waystation') {
        ends++;
        const place = sim.state.places[e.at];
        assert.ok(place && ['hearth', 'waystation', 'empty inn'].includes(place.kind));
      }
    }
  }
  assert.ok(camps >= 2, `${camps} camps in six worlds`);
  assert.ok(ends >= 1, 'no camp ever ended');
});

test('a waystation passes news between travellers who never meet', () => {
  const sim = new Simulation({ seed: 1 });
  sim.advanceTo(at(2));
  sim.state.places['mill-ford'] = { kind: 'waystation', name: "Test's Rest", since: sim.now, lastGuest: sim.now };
  sim.advanceTo(at(40));
  const inn = sim.state.knowledge.holders['inn:mill-ford'];
  assert.ok(inn && Object.keys(inn).length > 0, 'the waystation inn has heard things');
  assert.ok(sim.state.places['mill-ford'].guests > 0);
});

test('night fires: travellers camped together swap news', () => {
  let told = 0;
  for (const seed of [1, 7]) {
    const sim = new Simulation({ seed });
    sim.advanceTo(at(150));
    for (const e of sim.state.log.filter((x) => x.type === 'camp:fireside')) {
      told++;
      assert.ok(!/undefined|NaN|null/.test(describe(e, sim)), describe(e, sim));
      assert.equal(sim.cal.minuteOfDay(e.t), 22 * 60);
    }
  }
  assert.ok(told > 0, 'nobody ever heard of bandits round a fire');
});
