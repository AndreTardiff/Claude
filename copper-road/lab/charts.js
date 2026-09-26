// SVG charts for the lab, following the dataviz method:
// thin 2px lines, hairline solid grid, one y-axis, emphasis (one town in the
// accent, the rest in context grey), direct end labels in text colours, a
// crosshair tooltip that lists every series, and a table view twin.
// Colours come from CSS custom properties validated against the parchment
// surfaces (see lab.css).

const SVG = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

/** Tiny single-series trend line: context grey, current value marked in the accent. */
export function sparkline(values, { width = 84, height = 22 } = {}) {
  const svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'spark', 'aria-hidden': 'true' });
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) return svg;
  const lo = Math.min(...clean);
  const hi = Math.max(...clean);
  const pad = 4;
  const x = (i) => pad + (i * (width - 2 * pad)) / (values.length - 1);
  const y = (v) => (hi === lo ? height / 2 : height - pad - ((v - lo) * (height - 2 * pad)) / (hi - lo));
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  el('path', { d, class: 'spark-line' }, svg);
  el('circle', { cx: x(values.length - 1), cy: y(values.at(-1)), r: 3, class: 'spark-dot' }, svg);
  return svg;
}

function niceStep(range, target) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/**
 * Price history for one good across towns.
 * update({ days, series: [{ id, name, values, emphasis }], base, unit, formatDay, formatValue, winter })
 */
export function createPriceChart(host) {
  host.classList.add('chart');
  const head = document.createElement('div');
  head.className = 'chart-head';
  const title = document.createElement('p');
  title.className = 'chart-title';
  const legend = document.createElement('p');
  legend.className = 'chart-legend';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'linkish chart-toggle';
  toggle.textContent = 'Show as table';
  head.append(title, toggle);
  const plot = document.createElement('div');
  plot.className = 'chart-plot';
  plot.tabIndex = 0;
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  const tableBox = document.createElement('div');
  tableBox.className = 'table-wrap chart-table';
  tableBox.hidden = true;
  host.replaceChildren(head, legend, plot, tableBox);
  plot.appendChild(tip);

  let data = null;
  let geom = null;
  let focusIndex = null;
  let showTable = false;

  toggle.addEventListener('click', () => {
    showTable = !showTable;
    toggle.textContent = showTable ? 'Show as chart' : 'Show as table';
    plot.hidden = showTable;
    tableBox.hidden = !showTable;
    if (showTable) renderTable();
  });

  function render() {
    if (!data) return;
    const { days, series, base } = data;
    title.textContent = data.title;
    // Legend (always present for two or more series): the emphasised series by
    // name, the rest as context. Line keys mirror the marks.
    legend.replaceChildren();
    const emphasised = series.find((sr) => sr.emphasis);
    const entries = emphasised ? [[emphasised.name, true], ['other markets', false]] : series.map((sr) => [sr.name, false]);
    for (const [label, isEmph] of entries) {
      const item = document.createElement('span');
      item.className = 'legend-item';
      const key = document.createElement('span');
      key.className = isEmph ? 'tip-key emph' : 'tip-key';
      const text = document.createElement('span');
      text.textContent = label;
      item.append(key, text);
      legend.appendChild(item);
    }
    plot.querySelector('svg')?.remove();
    const width = Math.max(260, Math.floor(plot.getBoundingClientRect().width || host.getBoundingClientRect().width));
    const height = 200;
    const m = { l: 40, r: Math.min(144, Math.round(width * 0.3)), t: 16, b: 24 };
    const n = days.length;
    const all = series.flatMap((s) => s.values).filter(Number.isFinite);
    const top = Math.max(base * 1.1, ...all, 1);
    const step = niceStep(top, 4);
    const yMax = Math.ceil(top / step) * step;
    const x = (i) => m.l + (n <= 1 ? 0 : (i * (width - m.l - m.r)) / (n - 1));
    const y = (v) => m.t + (height - m.t - m.b) * (1 - v / yMax);
    geom = { x, y, n, width, height, m };

    const svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': data.title });
    // Winter bands: quiet context for the seasonal pattern.
    for (const [a, b] of data.winter ?? []) {
      el('rect', { x: x(a), y: m.t, width: Math.max(1, x(b) - x(a)), height: height - m.t - m.b, class: 'chart-season' }, svg);
    }
    // Grid and y ticks
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      el('line', { x1: m.l, x2: width - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'chart-axis' : 'chart-grid' }, svg);
      const t = el('text', { x: m.l - 6, y: y(v), class: 'chart-tick', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, svg);
      t.textContent = v >= 1000 ? `${v / 1000}k` : String(Math.round(v * 100) / 100);
    }
    // Base value reference
    el('line', { x1: m.l, x2: width - m.r, y1: y(base), y2: y(base), class: 'chart-base' }, svg);
    const bl = el('text', { x: m.l + 4, y: y(base) - 5, class: 'chart-note' }, svg);
    bl.textContent = `base value ${base}`;
    // X ticks: as many day labels as fit, counted back from today, never crowding.
    const maxTicks = Math.max(2, Math.floor((width - m.l - m.r) / 72));
    const every = Math.max(1, Math.ceil((n - 1) / (maxTicks - 1)));
    for (let i = n - 1; i >= 0; i -= every) {
      if (i !== n - 1 && x(n - 1) - x(i) < 60 && i > n - 1 - every) continue;
      const t = el('text', { x: x(i), y: height - 6, class: 'chart-tick', 'text-anchor': i === n - 1 ? 'end' : 'middle' }, svg);
      t.textContent = data.formatDay(days[i], true);
    }
    // Lines: context first, emphasis on top
    const ordered = [...series].sort((a, b) => Number(a.emphasis) - Number(b.emphasis));
    for (const s of ordered) {
      const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
      el('path', { d, class: s.emphasis ? 'chart-line emph' : 'chart-line' }, svg);
    }
    for (const s of ordered) {
      el('circle', { cx: x(n - 1), cy: y(s.values.at(-1)), r: 4, class: s.emphasis ? 'chart-dot emph' : 'chart-dot' }, svg);
    }
    // Crosshair (hidden until hover/focus)
    el('line', { x1: 0, x2: 0, y1: m.t, y2: height - m.b, class: 'chart-cross', visibility: 'hidden' }, svg);
    plot.insertBefore(svg, tip);

    // End labels, placed once the SVG is in the page so text can be measured.
    // Where lines end close together, one label names them all rather than
    // nudging labels away from their lines.
    const ends = series
      .map((s) => ({ s, y: y(s.values.at(-1)), v: s.values.at(-1) }))
      .sort((a, b) => a.y - b.y);
    const groups = [];
    for (const e of ends) {
      const g = groups.at(-1);
      if (g && e.y - g.at(-1).y < 14) g.push(e);
      else groups.push([e]);
    }
    const room = m.r - 12;
    for (const g of groups) {
      const yMid = g.reduce((acc, e) => acc + e.y, 0) / g.length;
      const emph = g.find((e) => e.s.emphasis);
      const t = el('text', { x: width - m.r + 10, y: yMid, 'dominant-baseline': 'middle', class: emph ? 'chart-label emph' : 'chart-label' }, svg);
      const lo = Math.min(...g.map((e) => e.v));
      const hi = Math.max(...g.map((e) => e.v));
      const value = `${hi - lo > hi * 0.02 ? '~' : ''}${data.formatValue(hi)}`;
      // Degrade gracefully: every name, then one name and a count, then just the
      // value. Never cut a number; the legend, tooltip and table carry the rest.
      const lead = (emph ?? g[0]).s.name;
      const options = [
        `${g.map((e) => e.s.name).join(' · ')} ${value}`,
        g.length > 1 ? `${lead} +${g.length - 1} ${value}` : null,
        value,
      ].filter(Boolean);
      for (const text of options) {
        t.textContent = text;
        if (t.getComputedTextLength() <= room) break;
      }
    }
    if (focusIndex !== null) showAt(Math.min(focusIndex, n - 1));
    if (showTable) renderTable();
  }

  function showAt(i) {
    if (!data || !geom) return;
    focusIndex = i;
    const cross = plot.querySelector('.chart-cross');
    const cx = geom.x(i);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    tip.replaceChildren();
    const h = document.createElement('p');
    h.className = 'tip-head';
    h.textContent = data.formatDay(data.days[i], false);
    tip.appendChild(h);
    const rows = data.series.map((s) => ({ s, v: s.values[i] })).sort((a, b) => b.v - a.v);
    for (const { s, v } of rows) {
      const row = document.createElement('p');
      row.className = s.emphasis ? 'tip-row emph' : 'tip-row';
      const key = document.createElement('span');
      key.className = s.emphasis ? 'tip-key emph' : 'tip-key';
      const val = document.createElement('strong');
      val.textContent = data.formatValue(v);
      const name = document.createElement('span');
      name.className = 'tip-name';
      name.textContent = s.name;
      row.append(key, val, name);
      tip.appendChild(row);
    }
    tip.hidden = false;
    const left = cx + 12 + 150 > geom.width ? cx - 12 - 150 : cx + 12;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${geom.m.t}px`;
  }

  function hide() {
    focusIndex = null;
    tip.hidden = true;
    plot.querySelector('.chart-cross')?.setAttribute('visibility', 'hidden');
  }

  plot.addEventListener('pointermove', (ev) => {
    if (!geom) return;
    const r = plot.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const span = geom.width - geom.m.l - geom.m.r;
    const i = Math.round(((px - geom.m.l) / span) * (geom.n - 1));
    showAt(Math.max(0, Math.min(geom.n - 1, i)));
  });
  plot.addEventListener('pointerleave', hide);
  plot.addEventListener('focus', () => geom && showAt(focusIndex ?? geom.n - 1));
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', (ev) => {
    if (!geom) return;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ev.preventDefault();
      const i = (focusIndex ?? geom.n - 1) + (ev.key === 'ArrowLeft' ? -1 : 1);
      showAt(Math.max(0, Math.min(geom.n - 1, i)));
    }
  });

  function renderTable() {
    if (!data) return;
    const table = document.createElement('table');
    const thead = table.createTHead().insertRow();
    for (const label of ['Day', ...data.series.map((s) => s.name)]) {
      const th = document.createElement('th');
      th.textContent = label;
      if (label !== 'Day') th.className = 'num';
      thead.appendChild(th);
    }
    const body = table.createTBody();
    for (let i = data.days.length - 1; i >= 0; i--) {
      const tr = body.insertRow();
      tr.insertCell().textContent = data.formatDay(data.days[i], false);
      for (const s of data.series) {
        const td = tr.insertCell();
        td.className = 'num';
        td.textContent = data.formatValue(s.values[i]);
      }
    }
    tableBox.replaceChildren(table);
  }

  new ResizeObserver(() => render()).observe(host);

  return {
    update(next) {
      data = next;
      render();
    },
  };
}
