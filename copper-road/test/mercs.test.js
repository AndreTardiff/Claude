// Step F: sellswords, their gear and what both live through (spec §12–§13).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/simulation.js';
import { WORLD } from '../src/data/world.js';
import { booksBalance, moneySupply } from '../src/economy/money.js';
import { activeMercs, getMerc, guardPower, guardsInFight, itemById, spotAmbush } from '../src/systems/mercs.js';


// Every piece of gear is in exactly one place, and that place knows it.
function checkGear(sim) {
  const st = sim.state.mercs;
  const seen = new Map();
  const place = (id, where) => {
    assert.ok(!seen.has(id), `${id} is both ${seen.get(id)} and ${where}`);
    seen.set(id, where);
  };
  for (const id of st.order) {
    const g = st.byId[id];
    for (const [slot, item] of Object.entries(g.gear)) {
      if (!item) continue;
      assert.ok(g.active, `${id} is gone but still holds ${item}`);
      place(item, `${id}.${slot}`);
      assert.deepEqual(st.items[item].holder, { kind: 'merc', id });
      assert.equal(st.items[item].slot, slot);
    }
  }
  for (const [sid, list] of Object.entries(st.racks)) for (const item of list) {
    place(item, `rack:${sid}`);
    assert.deepEqual(st.items[item].holder, { kind: 'rack', at: sid });
  }
  for (const id of sim.state.raiders.order) for (const item of sim.state.raiders.bands[id].gear ?? []) {
    place(item, `band:${id}`);
    assert.deepEqual(st.items[item].holder, { kind: 'band', id });
  }
  const wagons = [...Object.values(sim.state.merchants.byId).map((m) => m.trip), sim.state.lord.trip, ...(sim.state.lord.patrols ?? [])];
  for (const w of wagons) for (const item of w?.salvage ?? []) {
    place(item, 'wagon');
    assert.equal(st.items[item].holder.kind, 'wagon');
  }
  for (const [id, item] of Object.entries(st.items)) if (!seen.has(id)) assert.equal(item.holder.kind, 'lost', `${id} is nowhere`);
}

test('sellswords are named residents of the towns, armed, with a purse and a clean ledger', () => {
  const sim = new Simulation({ seed: 1 });
  const all = activeMercs(sim);
  assert.equal(all.length, Object.values(WORLD.mercs.start).reduce((a, b) => a + b, 0));
  for (const g of all) {
    const r = sim.state.residents.byId[g.resident];
    assert.ok(r.alive && r.profession === 'sellsword' && r.home === g.home && g.at === g.home && r.name);
    assert.ok(g.gear.weapon, 'everyone has a weapon');
    assert.equal(g.rank, 0);
    for (const s of WORLD.mercs.stats) assert.ok(g.stats[s] >= WORLD.mercs.startStat[0] && g.stats[s] <= WORLD.mercs.startStat[1]);
    assert.ok(sim.state.coin.accounts[`merc:${g.id}`] > 0);
  }
  assert.equal(Object.values(sim.state.mercs.items).filter((i) => i.type === 'scute').length, WORLD.mercs.startGear.scutes, 'the scute coats are rare');
  checkGear(sim);
});

test('merchants hire guards for roads they believe dangerous, pay them where the trip ends, and the books balance', () => {
  const sim = new Simulation({ seed: 7 });
  sim.runDays(150);
  const guarded = sim.state.log.filter((e) => e.type === 'merchant:departed' && e.guards?.length);
  assert.ok(guarded.length >= 5, `only ${guarded.length} guarded departures`);
  const paid = activeMercs(sim).filter((g) => g.earned > 0);
  assert.ok(paid.length >= 3, 'several sellswords have earned wages');
  assert.equal(booksBalance(sim), moneySupply(sim));
  // Hired guards are on the road with their employer, not waiting in town.
  for (const g of activeMercs(sim)) {
    if (!g.trip) continue;
    if (g.trip.kind !== 'merchant') continue;
    const m = sim.state.merchants.byId[g.trip.id];
    assert.ok(m.trip?.guards.includes(g.id), `${g.id} is hired but not with the caravan`);
    assert.equal(g.at, null);
  }
  checkGear(sim);
});

test('a guard counts for more than a carter, and more with better gear', () => {
  const sim = new Simulation({ seed: 3 });
  for (const g of activeMercs(sim)) {
    const p = guardPower(sim, g, { terrain: 'road' }).power;
    assert.ok(p > 0.9 && p < 2.5, `${g.id}: ${p}`);
  }
  // The same guard in mail rather than nothing.
  const g = activeMercs(sim)[0];
  const bare = { ...g, gear: { ...g.gear, armour: null } };
  const mailed = { ...g, gear: { ...g.gear, armour: Object.values(sim.state.mercs.items).find((i) => i.type === 'mail')?.id ?? null } };
  if (mailed.gear.armour) assert.ok(guardPower(sim, mailed, {}).power > guardPower(sim, bare, {}).power);
});

test('AT-10: Forestwise gives a modest, visible edge in forest ambushes, not a certainty', () => {
  // Two otherwise equal sellswords; one is Forestwise. 100 seeded forest ambushes each:
  // does the trait show? (v0.1 §23, "validate traits").
  const sim = new Simulation({ seed: 11 });
  const base = activeMercs(sim)[0];
  const plain = { ...base, id: 'plain', traits: [], pairs: [], wound: null };
  const wise = { ...base, id: 'wise', traits: ['forestwise'], pairs: [], wound: null };
  const crew = 4; // three hands and the merchant
  const band = 4.2;
  // The same hundred rolls for both (a fresh twin world each time), so only the trait differs.
  const trial = (g, terrain) => {
    const rng = new Simulation({ seed: 11 }).rng('at10');
    let won = 0;
    let spotted = 0;
    for (let i = 0; i < 100; i++) {
      const saw = spotAmbush(sim, [g], terrain, rng);
      if (saw) spotted++;
      const f = guardsInFight(sim, [g], { terrain, night: false });
      const def = crew + (saw ? f.seen : f.surprised);
      if (rng.float() < def / (def + band)) won++;
    }
    return { won, spotted };
  };
  const a = trial(plain, 'forest');
  const b = trial(wise, 'forest');
  assert.ok(b.won > a.won, `Forestwise won ${b.won}, plain ${a.won}`);
  assert.ok(b.won - a.won <= 25, `an edge, not a rout: ${b.won} vs ${a.won}`);
  assert.ok(b.won < 100, 'never a certainty');
  assert.ok(b.spotted > a.spotted, `sees more ambushes coming: ${b.spotted} vs ${a.spotted}`);
  // On the open road the trait is worth nothing.
  assert.equal(guardPower(sim, wise, { terrain: 'road' }).power, guardPower(sim, plain, { terrain: 'road' }).power);
});

test('growth is slow: ranks come from deeds, raise what the deeds trained, and gear tempers slowly', () => {
  let ranked = 0;
  let fought = 0;
  for (const seed of [1, 7]) {
    const sim = new Simulation({ seed });
    sim.runDays(400);
    checkGear(sim);
    for (const id of sim.state.mercs.order) {
      const g = getMerc(sim, id);
      assert.ok(g.rank <= 2, `${id} rose to rank ${g.rank} in 400 days`);
      if (g.ledger.fights) fought++;
      for (const h of g.history.filter((x) => x.type === 'rank')) {
        ranked++;
        assert.ok(WORLD.mercs.stats.includes(h.stat));
      }
      // Rank follows deeds.
      assert.ok(g.deeds >= WORLD.mercs.ranks[g.rank].deeds);
    }
    for (const item of Object.values(sim.state.mercs.items)) {
      assert.ok(item.tier <= 2, `${item.id} is ${item.tier} after 400 days`);
      if (item.tier > 0) assert.ok(item.deeds.fights >= 2, 'a tier takes several fights');
    }
    assert.equal(booksBalance(sim), moneySupply(sim));
  }
  assert.ok(fought >= 3, `guards fought ${fought} times`);
  assert.ok(ranked >= 1, 'somebody rose a rank');
});

test('charms work by belief: a lucky name steadies the wearer; only a true relic does more', () => {
  const sim = new Simulation({ seed: 2 });
  const g = activeMercs(sim)[0];
  const charm = { id: 'c', type: 'charm', slot: 'charm', repute: 0, relic: false, cond: 1, tier: 0, statuses: [], deeds: {} };
  sim.state.mercs.items.c = charm;
  const withCharm = { ...g, gear: { ...g.gear, charm: 'c' } };
  const bare = guardPower(sim, { ...g, gear: { ...g.gear, charm: null } }, {}).power;
  assert.equal(guardPower(sim, withCharm, {}).power, bare, 'an unknown charm does nothing');
  charm.repute = 0.5;
  const lucky = guardPower(sim, withCharm, {}).power;
  assert.ok(lucky > bare);
  charm.repute = -0.5;
  assert.ok(guardPower(sim, withCharm, {}).power < bare, 'a cursed name shakes them');
  charm.repute = 0;
  charm.relic = true;
  assert.ok(guardPower(sim, withCharm, {}).power > bare, 'a true relic works unbelieved');
  assert.equal(itemById(sim, 'c'), charm);
});

test('same seed, same sellswords: twin worlds agree', () => {
  const a = new Simulation({ seed: 9 });
  const b = new Simulation({ seed: 9 });
  a.runDays(120);
  b.runDays(120);
  assert.deepEqual(a.state.mercs, b.state.mercs);
});

// ── F4: standing orders and fame ────────────────────────────────────────────

test('standing orders decide the answer to a band: fight, pay, or run', async () => {
  const { orderedResponse, ordersFor, reviseOrders } = await import('../src/systems/orders.js');
  const fight = { threatened: 'fight', outnumbered: 2, cargo: 'drop', night: 'sleep' };
  assert.equal(orderedResponse(fight, 'demand', 10, 8).act, 'fight');
  assert.equal(orderedResponse(fight, 'demand', 20, 8).act, 'pay', 'outnumbered: give way');
  assert.equal(orderedResponse(fight, 'attack', 20, 8).act, 'run');
  assert.equal(orderedResponse({ ...fight, threatened: 'toll' }, 'demand', 5, 8).act, 'pay');
  assert.equal(orderedResponse({ ...fight, threatened: 'toll' }, 'attack', 10, 8).act, 'fight', 'attacked, a toll-payer stands');
  assert.equal(orderedResponse({ ...fight, threatened: 'flee' }, 'demand', 1, 8).act, 'run');
  assert.equal(orderedResponse({ ...fight, outnumbered: null }, 'attack', 100, 8).act, 'fight', 'never give way');
  // Tempers set them.
  assert.equal(ordersFor(900).threatened, 'fight');
  assert.equal(ordersFor(100).threatened, 'toll');
  // A merchant taken for ransom becomes warier.
  const sim = new Simulation({ seed: 1 });
  const m = Object.values(sim.state.merchants.byId)[0];
  m.orders = { ...fight };
  reviseOrders(sim, m, { outcome: 'robbed', captured: true, hands: [], guardsDead: [], guards: [] });
  assert.equal(m.orders.threatened, 'toll');
  assert.equal(m.orders.outnumbered, 1.5);
  // In a running world, every merchant's encounter says which order decided it, and loads are only dropped on orders.
  const world = new Simulation({ seed: 9 });
  world.runDays(300);
  const enc = world.state.log.filter((e) => e.type === 'raid:encounter' && e.kind === 'merchant' && e.approach !== 'steal');
  assert.ok(enc.length >= 5);
  for (const e of enc) {
    assert.ok(e.order?.rule, 'the order that decided it is in the report');
    if (e.outcome === 'dropped') assert.equal(e.order.cargo, 'drop');
  }
});

test('fame is news: deeds become renown, the story spreads from inn to inn, and a name costs more', async () => {
  const { believedRenown, wageOf } = await import('../src/systems/mercs.js');
  const { innOf } = await import('../src/systems/knowledge.js');
  for (const seed of [1, 7, 9, 23]) {
    const sim = new Simulation({ seed });
    sim.runDays(400);
    const famous = activeMercs(sim).filter((g) => g.fame >= 2).sort((a, b) => b.fame - a.fame)[0];
    if (!famous) continue;
    const inns = ['kingscross', 'copperford', 'greenhollow', 'saltmouth'].filter((sid) => believedRenown(sim, innOf(sid), famous.id) > 0);
    assert.ok(inns.length >= 2, `the story of ${famous.id} reached ${inns.length} inns`);
    const plain = { ...famous, fame: 0 };
    assert.ok(wageOf(sim, famous) > wageOf(sim, plain), 'a name costs more');
    // Bands have names too.
    assert.ok(Object.values(sim.state.raiders.bands).some((b) => (b.infamy ?? 0) > 0));
    checkGear(sim);
    return;
  }
  assert.fail('nobody became famous');
});
