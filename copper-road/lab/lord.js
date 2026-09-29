// Lord Aldric: his temper, his mood, what he can spend and what he's doing with it.

import { balance } from '../src/index.js';
import { lordOptions, purseOfLord } from '../src/systems/lord.js';
import { esc, money, moneyBits, placeName } from './format.js';

const traitWord = (x, [lo, mid, hi]) => (x < 450 ? lo : x < 700 ? mid : hi);
const moodWords = (m) => {
  const words = [];
  if (m.worry > 0.5) words.push('worried sick');
  else if (m.worry > 0.2) words.push('uneasy');
  if (m.pride > 0.5) words.push('pleased with himself');
  if (m.grievance > 0.4) words.push('sore at the Crown');
  if ((m.anger ?? 0) > 0.3) words.push('angry at the outlaws');
  return words.length ? words.join(', ') : 'even-tempered';
};

export function createLordPanel(root, { onSelectTown, onSelectLord }) {
  root.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-lord]')) return onSelectLord?.();
    const b = ev.target.closest('[data-node]');
    if (b) onSelectTown(b.dataset.node);
  });
  let last = '';

  function render(sim) {
    const st = sim.state.lord;
    if (!st) return;
    const place = (sid) => `<button class="linkish" data-node="${esc(sid)}">${esc(placeName(sim, sid))}</button>`;
    const works = (id) => sim.data.lord.works.find((w) => w.id === id)?.name ?? id;
    const good = (gid) => sim.data.economy.goods.find((g) => g.id === gid);
    const t = st.traits;
    const r = st.reason;
    const kindWord = (o) =>
      o.kind === 'relief' ? `grain for ${place(o.at)}`
        : o.kind === 'commission' ? `buy ${o.qty} ${esc(good(o.good).units)} from ${place(o.at)}`
          : o.kind === 'festival' ? `a festival in ${place(o.at)}`
            : o.kind === 'patrol' ? `a patrol on the ${esc(sim.graph.routes.get(o.route)?.name ?? o.route)}`
              : `${esc(works(o.work))} for ${place(o.at)}${o.affordable ? '' : ' <span class="dim">(saving)</span>'}`;
    const options = r?.options.map((o, i) => `
      <tr class="${i === r.choice ? 'chosen' : ''}"><td>${kindWord(o)}${i === r.choice ? ' <span class="tag">chosen</span>' : ''}<br><span class="dim">${esc(o.why)}</span></td>
      <td class="num">${money(o.cost)}</td><td class="num">${o.score.toFixed(2)}</td></tr>`).join('') ?? '';
    const orders = st.orders.map((o) => `<li>${Math.round(o.remaining)} of ${o.qty} ${esc(good(o.good).units)} of ${esc(good(o.good).name.toLowerCase())} wanted in ${place(o.at)} at ${money(o.price)} · heard in ${o.cried.map((c) => esc(placeName(sim, c))).join(', ')}</li>`).join('');
    const projects = st.projects.map((p) => `<li>${esc(works(p.work))} in ${place(p.at)}: day ${p.progress} of ${p.days}${p.stalled ? ` <span class="warn">(stalled ${p.stalled} days for materials)</span>` : ''}</li>`).join('');
    const done = st.done.slice(-5).reverse().map((d) => `<li>${esc(works(d.work))}, ${place(d.at)} (${esc(sim.cal.format(d.t).stamp)})</li>`).join('');
    const spent = st.spent;
    const html = `
      <p><strong>Lord ${esc(st.name)}</strong> is ${traitWord(t.generosity, ['close-fisted', 'fair', 'open-handed'])},
        ${traitWord(t.ambition, ['content with his lot', 'ambitious', 'a great builder'])} and ${traitWord(t.vanity, ['modest', 'fond of show', 'vain'])}.
        Today he is ${esc(moodWords(st.mood))}.</p>
      <dl class="facts">
        <dt>Treasury</dt><dd>${moneyBits(balance(sim, 'treasury'))}, of which he'd spend ${money(purseOfLord(sim))}${st.saving ? ` · saving for ${esc(works(st.saving.work))}` : ''}</dd>
        <dt>Where</dt><dd>${st.captive ? '<span class="bad">held for ransom by outlaws</span>' : !st.away ? `at home in ${place(st.seat)}` : st.away.phase === 'staying' ? `at ${place(st.at)}` : `on the road (${esc(st.away.kind)})`} · <button class="linkish" data-lord="1">open him in the inspector</button></dd>
        <dt>Spent so far</dt><dd>relief ${moneyBits(spent.relief)} · commissions ${moneyBits(spent.commission)} · festivals ${moneyBits(spent.festival)} · works ${moneyBits(spent.works)} · patrols ${moneyBits(spent.patrol ?? 0)} · travels ${moneyBits(spent.travel ?? 0)}${spent.ransom ? ` · ransoms ${moneyBits(spent.ransom)}` : ''}${spent.bounty ? ` · bounties ${moneyBits(spent.bounty)}` : ''}</dd>
        ${st.skimmed ? `<dt>Missing</dt><dd>${moneyBits(st.skimmed)} <span class="dim">(the steward's fingers)</span></dd>` : ''}
      </dl>
      ${r ? `<h4>Last decision <span class="sub">${esc(sim.cal.format(r.t).stamp)}</span></h4>
        ${options ? `<div class="table-wrap"><table><thead><tr><th>He weighed</th><th class="num">Cost</th><th class="num">Score</th></tr></thead><tbody>${options}</tbody></table></div>` : ''}
        ${r.note ? `<p>${esc(r.note.replace(/ in (\w+)$/, (m, sid) => ` in ${placeName(sim, sid)}`))}.</p>` : ''}
        <p class="formula">Score: his temper (generosity, ambition, vanity) × what the town needs, raised by worry or pride. Relief may dig down to ${sim.data.lord.emergencyFloor} marks; the rest keeps ${sim.data.lord.reserve} back.</p>` : ''}
      ${orders ? `<h4>Orders cried</h4><ul class="plain">${orders}</ul>` : ''}
      ${projects ? `<h4>Works in hand</h4><ul class="plain">${projects}</ul>` : ''}
      ${done ? `<h4>Works finished</h4><ul class="plain">${done}</ul>` : ''}`;
    if (html === last) return;
    last = html;
    root.innerHTML = html;
  }
  return { render };
}
