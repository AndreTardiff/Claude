// Small formatting helpers shared by the lab's panels.

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Marks: 3 sig. figures-ish. 4.21 · 21.4 · 187 */
export function money(x) {
  if (!Number.isFinite(x)) return '—';
  if (x >= 100) return Math.round(x).toLocaleString('en');
  if (x >= 10) return x.toFixed(1);
  return x.toFixed(2);
}

/** Quantities: whole numbers above 10, one decimal below. */
export function qty(x) {
  if (!Number.isFinite(x)) return '—';
  if (Math.abs(x) >= 10) return Math.round(x).toLocaleString('en');
  return x.toFixed(1).replace(/\.0$/, '');
}

export const pct = (x) => `${Math.round(x * 100)}%`;

/** Price pressure relative to base value, as a glyph + word: never colour alone. */
export function pressure(mult) {
  if (mult < 0.8) return { cls: 'cheap', glyph: '▼', word: 'cheap' };
  if (mult > 1.25) return { cls: 'dear', glyph: '▲', word: 'dear' };
  return { cls: 'even', glyph: '●', word: 'near its worth' };
}

export function goodOf(sim, gid) {
  return sim.data.economy.goods.find((g) => g.id === gid);
}

export const placeName = (sim, id) => sim.graph.nodes.get(id)?.name ?? id;
