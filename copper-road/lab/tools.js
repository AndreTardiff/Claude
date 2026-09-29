// Lab tools: the experimenter's hand. Each one runs through sim.command(), so it
// is an ordinary, deterministic world event and shows up in the chronicle.

import { economyIndex, residentsAt, professionName } from '../src/index.js';
import { esc, goodOf, placeName } from './format.js';

export function createToolsPanel(root, { getSim, onChange }) {
  root.innerHTML = `
    <div class="tool-row">
      <label>Town <select data-tool="town"></select></label>
      <label>Good <select data-tool="good"></select></label>
    </div>
    <div class="tool-row">
      <button type="button" data-act="spoil">Spoil 70% of the stock</button>
      <button type="button" data-act="deliver">Deliver 30</button>
      <button type="button" data-act="coin">Give 100 marks</button>
    </div>
    <div class="tool-row">
      <label>Trade <select data-tool="trade"></select></label>
      <button type="button" data-act="death">Strike down a worker</button>
    </div>
    <div class="tool-row">
      <label>Hideout <select data-tool="hideout"></select></label>
      <button type="button" data-act="band">Send 6 outlaws there</button>
    </div>
    <div class="tool-row">
      <button type="button" data-act="lord">Send Lord Aldric to see the town</button>
    </div>
    <p class="tool-result hint" aria-live="polite"></p>`;
  const town = root.querySelector('[data-tool="town"]');
  const good = root.querySelector('[data-tool="good"]');
  const trade = root.querySelector('[data-tool="trade"]');
  const hideout = root.querySelector('[data-tool="hideout"]');
  const result = root.querySelector('.tool-result');

  function fillTrades() {
    const sim = getSim();
    const counts = new Map();
    for (const r of residentsAt(sim, town.value)) {
      if (sim.data.economy.professions[r.profession].pool) continue;
      counts.set(r.profession, (counts.get(r.profession) ?? 0) + 1);
    }
    trade.innerHTML = [...counts]
      .map(([pid, n]) => `<option value="${pid}">${esc(professionName(sim, pid, n !== 1))} (${n})</option>`)
      .join('');
  }

  function fill() {
    const sim = getSim();
    const ix = economyIndex(sim.data);
    const keepTown = town.value;
    const keepGood = good.value;
    town.innerHTML = ix.markets.map((sid) => `<option value="${sid}">${esc(placeName(sim, sid))}</option>`).join('');
    good.innerHTML = ix.goodIds.map((gid) => `<option value="${gid}">${esc(goodOf(sim, gid).name)}</option>`).join('');
    hideout.innerHTML = (sim.data.raiders?.hideouts ?? []).map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join('');
    if (keepTown) town.value = keepTown;
    if (keepGood) good.value = keepGood;
    fillTrades();
  }

  town.addEventListener('change', fillTrades);
  root.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const sim = getSim();
    const before = sim.state.log.length;
    if (act === 'spoil') sim.command('lab:spoil', { at: town.value, good: good.value, fraction: 0.7 });
    if (act === 'deliver') sim.command('lab:deliver', { at: town.value, good: good.value, qty: 30 });
    if (act === 'coin') sim.command('lab:coin', { at: town.value, marks: 100 });
    if (act === 'band') sim.command('lab:band', { hideout: hideout.value, members: 6 });
    if (act === 'lord') {
      const st = sim.state.lord;
      if (st.away || st.captive || town.value === st.seat) result.textContent = st.away || st.captive ? 'Lord Aldric is not at home.' : 'He is already there.';
      else sim.command('lab:lord-trip', { to: town.value, trip: sim.graph.nodes.get(town.value).outside ? 'ships' : 'tour' });
    }
    if (act === 'death') {
      if (!trade.value) {
        result.textContent = 'Nobody in that trade lives there.';
        return;
      }
      sim.command('lab:death', { at: town.value, profession: trade.value });
      fillTrades();
    }
    result.textContent = sim.state.log.length > before ? 'Done: see the chronicle.' : 'Nothing happened: there was nothing to act on.';
    onChange();
  });

  return {
    fill,
    setTown(sid) {
      town.value = sid;
      fillTrades();
    },
    setGood(gid) {
      good.value = gid;
    },
  };
}
