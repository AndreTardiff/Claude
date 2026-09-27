// Small formatting helpers shared by the lab's panels.

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Money, from marks: copper marks and verdigris bits (12 to the mark).
 * "3m 8b" · "11b" · "104m". Past 100 marks the bits stop mattering.
 */
export function money(marks) {
  if (!Number.isFinite(marks)) return '—';
  const sign = marks < 0 ? '−' : '';
  const bits = Math.round(Math.abs(marks) * 12);
  const m = Math.floor(bits / 12);
  const b = bits % 12;
  if (!m && !b) return '0';
  if (m >= 100 || (m && !b)) return `${sign}${m.toLocaleString('en')}m`;
  return sign + (m ? `${m}m ${b}b` : `${b}b`);
}

/** Money from whole bits. */
export const moneyBits = (bits) => money(bits / 12);

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
