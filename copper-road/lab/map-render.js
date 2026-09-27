// Parchment map renderer for the laboratory. Reads simulation state; never changes it.

import { DECOR } from './decor.js';
import { priceMultiplier, quote, segmentConditions, wayfarerPosition } from '../src/index.js';
import { money, pressure } from './format.js';

const TERRAIN_STYLE = {
  road: { width: 2.4, dash: [], color: 'ink' },
  forest: { width: 2, dash: [6, 4], color: 'forestRoad' },
  hills: { width: 2.2, dash: [2, 3], color: 'ink' },
  marsh: { width: 2, dash: [8, 3, 2, 3], color: 'marsh' },
};

// Small deterministic hash for scattering decorations (not simulation randomness).
function scatter(i, j, salt) {
  let h = Math.imul(i * 374761393 + j * 668265263 + salt * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const x = ax + u * dx - px;
  const y = ay + u * dy - py;
  return Math.sqrt(x * x + y * y);
}

function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function createMapRenderer(canvas, world) {
  const ctx = canvas.getContext('2d');
  const map = world.map;
  let W = 0;
  let H = 0;
  let k = 1; // pixels per km
  let colors = null;
  let hits = [];
  const nodeById = new Map(world.nodes.map((n) => [n.id, n]));
  const segs = world.segments.map((s) => ({ ...s, A: nodeById.get(s.a), B: nodeById.get(s.b) }));

  // Decoration scatter points (km), computed once.
  const nearRoad = (x, y, clearance) => segs.some((s) => distToSegment(x, y, s.A.x, s.A.y, s.B.x, s.B.y) < clearance);
  const trees = [];
  for (const f of DECOR.forests) {
    for (let i = 0; i < 60; i++) for (let j = 0; j < 40; j++) {
      const x = i * 4.2 + scatter(i, j, 1) * 3;
      const y = j * 4.2 + scatter(i, j, 2) * 3;
      if (pointInPolygon(x, y, f.points) && !nearRoad(x, y, 2.6)) trees.push([x, y, 0.8 + scatter(i, j, 3) * 0.5]);
    }
  }
  const hillMarks = [];
  for (const h of DECOR.hills) {
    for (let i = 0; i < 30; i++) for (let j = 0; j < 20; j++) {
      const x = i * 8 + scatter(i, j, 4) * 4;
      const y = j * 7 + scatter(i, j, 5) * 4;
      if (pointInPolygon(x, y, h.points) && !nearRoad(x, y, 3.5)) hillMarks.push([x, y]);
    }
  }

  function readColors() {
    const cs = getComputedStyle(canvas);
    const v = (name) => cs.getPropertyValue(name).trim();
    colors = {
      paper: v('--paper'),
      ink: v('--text'),
      muted: v('--muted'),
      accent: v('--accent'),
      border: v('--border'),
      sea: v('--map-sea'),
      seaInk: v('--map-sea-ink'),
      forestFill: v('--map-forest'),
      tree: v('--map-tree'),
      forestRoad: v('--map-forest-road'),
      hillFill: v('--map-hills'),
      hill: v('--map-hill-ink'),
      field: v('--map-field'),
      river: v('--map-river'),
      gorge: v('--map-gorge'),
      marsh: v('--map-marsh'),
      danger: v('--map-danger'),
      flood: v('--map-flood'),
      night: v('--map-night'),
      nightStrength: Number(v('--map-night-strength')) || 0.6,
      highlight: v('--map-highlight'),
      cheap: v('--cheap'),
      dear: v('--dear'),
      vignette: v('--map-vignette'),
    };
  }

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    W = Math.max(280, Math.floor(box.width));
    H = Math.round((W * map.heightKm) / map.widthKm);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    k = W / map.widthKm;
  }

  const path = (pts, close) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
    if (close) ctx.closePath();
  };

  const smoothPath = (pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = ((pts[i][0] + pts[i + 1][0]) / 2) * k;
      const my = ((pts[i][1] + pts[i + 1][1]) / 2) * k;
      ctx.quadraticCurveTo(pts[i][0] * k, pts[i][1] * k, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0] * k, last[1] * k);
  };

  const scaled = (px) => px * Math.min(1.25, Math.max(0.75, W / 900));

  function haloText(text, x, y, font, color, align = 'left', angle = 0) {
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = colors.paper;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawBackground() {
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, colors.vignette);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawGeography() {
    // Fields
    for (const f of DECOR.fields) {
      ctx.save();
      path(f.points, true);
      ctx.clip();
      ctx.strokeStyle = colors.field;
      ctx.lineWidth = 1;
      for (let x = -H; x < W; x += 7) {
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.lineTo(x + H * 0.5, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Sea
    path(DECOR.sea, true);
    ctx.fillStyle = colors.sea;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = colors.seaInk;
    ctx.lineWidth = 1;
    for (let y = 6; y < map.heightKm; y += 7) {
      for (let x = 200; x < map.widthKm; x += 9) {
        const ox = (x + (y % 14 ? 4 : 0)) * k;
        ctx.beginPath();
        ctx.arc(ox, y * k, 2.2 * k, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Hills
    for (const h of DECOR.hills) {
      path(h.points, true);
      ctx.fillStyle = colors.hillFill;
      ctx.fill();
    }
    ctx.strokeStyle = colors.hill;
    ctx.lineWidth = 1.2;
    for (const [x, y] of hillMarks) {
      ctx.beginPath();
      ctx.arc(x * k, y * k + 2.4 * k, 2.6 * k, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    // Forest
    for (const f of DECOR.forests) {
      path(f.points, true);
      ctx.fillStyle = colors.forestFill;
      ctx.fill();
    }
    ctx.fillStyle = colors.tree;
    for (const [x, y, s] of trees) {
      const px = x * k;
      const py = y * k;
      const r = 1.3 * k * s;
      ctx.beginPath();
      ctx.moveTo(px, py - r * 1.6);
      ctx.lineTo(px + r, py + r * 0.6);
      ctx.lineTo(px - r, py + r * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    // Gorge: a narrow jagged chasm with ragged rims.
    const gp = DECOR.gorge.points;
    const left = [];
    const right = [];
    for (let i = 0; i < gp.length - 1; i++) {
      const [ax, ay] = gp[i];
      const [bx, by] = gp[i + 1];
      const len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      for (let d = 0; d < len; d += 1.4) {
        const x = ax + ((bx - ax) * d) / len;
        const y = ay + ((by - ay) * d) / len;
        const taper = Math.min(1, (i === gp.length - 2 ? len - d : len) / 6);
        const wl = (0.55 + scatter(i, Math.floor(d * 10), 6) * 0.55) * taper;
        const wr = (0.55 + scatter(i, Math.floor(d * 10), 7) * 0.55) * taper;
        left.push([x + nx * wl, y + ny * wl]);
        right.push([x - nx * wr, y - ny * wr]);
      }
    }
    const last = gp[gp.length - 1];
    path([...left, last, ...right.reverse()], true);
    ctx.fillStyle = colors.gorge;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.gorge;
    ctx.lineWidth = 1.1;
    ctx.lineJoin = 'miter';
    ctx.stroke();
    // River
    for (const r of DECOR.rivers) {
      ctx.strokeStyle = colors.river;
      ctx.lineCap = 'round';
      ctx.lineWidth = 2.6;
      smoothPath(r.points);
      ctx.stroke();
    }
    // Geography labels
    const italic = (px) => `italic ${scaled(px)}px "EB Garamond", Georgia, serif`;
    for (const r of DECOR.rivers) haloText(r.name, r.label.at[0] * k, r.label.at[1] * k, italic(13), colors.river, 'center', r.label.angle);
    haloText(DECOR.gorge.name, DECOR.gorge.label.at[0] * k, DECOR.gorge.label.at[1] * k, italic(12), colors.gorge, 'center', DECOR.gorge.label.angle);
    for (const f of DECOR.forests) haloText(f.name, f.label[0] * k, f.label[1] * k, `italic 600 ${scaled(14)}px "EB Garamond", Georgia, serif`, colors.tree, 'center');
    for (const h of DECOR.hills) haloText(h.name, h.label.at[0] * k, h.label.at[1] * k, italic(13), colors.hill, 'center', h.label.angle ?? 0);
    const sl = DECOR.seaLabel;
    haloText(sl.text, sl.at[0] * k, sl.at[1] * k, italic(13), colors.seaInk, 'center', sl.angle);
  }

  function drawRoads(sim, seasonId, highlight) {
    const noted = new Set();
    if (highlight) {
      ctx.strokeStyle = colors.highlight;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
      for (const segId of highlight.path) {
        const s = segs.find((x) => x.id === segId);
        path([[s.A.x, s.A.y], [s.B.x, s.B.y]], false);
        ctx.stroke();
      }
    }
    for (const s of segs) {
      const style = TERRAIN_STYLE[s.terrain] ?? TERRAIN_STYLE.road;
      const cond = segmentConditions(sim.graph, s.id, seasonId);
      ctx.save();
      ctx.globalAlpha = cond.closed ? 0.35 : 1;
      ctx.strokeStyle = colors[style.color];
      ctx.lineWidth = style.width;
      ctx.lineCap = 'butt';
      ctx.setLineDash(style.dash);
      path([[s.A.x, s.A.y], [s.B.x, s.B.y]], false);
      ctx.stroke();
      ctx.restore();
      if (cond.note) {
        const mx = ((s.A.x + s.B.x) / 2) * k;
        const my = ((s.A.y + s.B.y) / 2) * k;
        const color = cond.closed ? colors.danger : colors.flood;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        if (cond.closed) {
          ctx.beginPath();
          ctx.moveTo(mx - 4, my - 4);
          ctx.lineTo(mx + 4, my + 4);
          ctx.moveTo(mx + 4, my - 4);
          ctx.lineTo(mx - 4, my + 4);
          ctx.stroke();
        } else {
          ctx.beginPath();
          for (let i = -1; i <= 1; i += 2) {
            ctx.moveTo(mx - 5, my + i * 2.2);
            ctx.quadraticCurveTo(mx - 2.5, my + i * 2.2 - 2, mx, my + i * 2.2);
            ctx.quadraticCurveTo(mx + 2.5, my + i * 2.2 + 2, mx + 5, my + i * 2.2);
          }
          ctx.stroke();
        }
        const key = `${s.route}|${cond.note}`;
        if (!noted.has(key)) {
          noted.add(key);
          haloText(cond.note, mx, my + 12, `italic ${scaled(11.5)}px "EB Garamond", Georgia, serif`, color, 'center');
        }
      }
    }
    ctx.setLineDash([]);
  }

  function drawNodes() {
    for (const n of world.nodes) {
      const x = n.x * k;
      const y = n.y * k;
      ctx.lineWidth = 1.2;
      if (n.kind === 'waypoint') {
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 4, y);
        ctx.closePath();
        ctx.fillStyle = colors.paper;
        ctx.fill();
        ctx.strokeStyle = colors.ink;
        ctx.stroke();
        hits.push({ kind: 'node', id: n.id, x, y, r: 9 });
      } else {
        const r = n.kind === 'village' ? 4.5 : 5.5;
        ctx.beginPath();
        ctx.arc(x, y, r + 3.2, 0, Math.PI * 2);
        ctx.strokeStyle = n.outside ? colors.seaInk : colors.ink;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.outside ? colors.seaInk : colors.ink;
        ctx.fill();
        hits.push({ kind: 'node', id: n.id, x, y, r: 13 });
      }
      const [dx, dy, align] = DECOR.labels[n.id] ?? [8, -8, 'left'];
      if (n.kind === 'waypoint') {
        haloText(n.name, x + dx, y + dy, `italic ${scaled(12.5)}px "EB Garamond", Georgia, serif`, colors.muted, align);
      } else {
        haloText(n.name, x + dx, y + dy, `${scaled(16)}px "IM Fell English SC", Georgia, serif`, colors.ink, align);
      }
    }
  }

  function drawChrome() {
    haloText(DECOR.title, 14, 22, `${scaled(22)}px "IM Fell English SC", Georgia, serif`, colors.ink, 'left');
    haloText('a map of the laboratory', 15, 22 + scaled(19), `italic ${scaled(12.5)}px "EB Garamond", Georgia, serif`, colors.muted, 'left');
    // Scale bar: 20 km
    const x0 = 14;
    const y0 = H - 16;
    const len = 20 * k;
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 4);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + len, y0);
    ctx.lineTo(x0 + len, y0 - 4);
    ctx.moveTo(x0 + len / 2, y0);
    ctx.lineTo(x0 + len / 2, y0 - 3);
    ctx.stroke();
    haloText('20 km', x0 + len + 6, y0 - 2, `italic ${scaled(11.5)}px "EB Garamond", Georgia, serif`, colors.muted, 'left');
    // Compass, out at sea
    const cx = 222 * k;
    const cy = 24 * k;
    const r = 9 * k * 0.9;
    ctx.fillStyle = colors.ink;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.28, cy);
    ctx.lineTo(cx - r * 0.28, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + r * 0.8);
    ctx.stroke();
    haloText('N', cx, cy - r - 7, `${scaled(13)}px "IM Fell English SC", Georgia, serif`, colors.ink, 'center');
    // Frame
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(3.5, 3.5, W - 7, H - 7);
    ctx.strokeRect(6.5, 6.5, W - 13, H - 13);
  }

  function wayfarerSpots(sim, t) {
    const st = sim.state.wayfarers;
    if (!st) return [];
    const spots = [];
    const atNode = new Map();
    for (const id of st.order) {
      const w = st.byId[id];
      const p = wayfarerPosition(sim, w, t);
      if (p.node) {
        if (!atNode.has(p.node)) atNode.set(p.node, []);
        atNode.get(p.node).push({ w, p });
      } else {
        spots.push({ w, x: p.x * k, y: p.y * k, state: p.moving ? 'moving' : 'camped' });
      }
    }
    for (const [nodeId, list] of atNode) {
      const n = nodeById.get(nodeId);
      const ring = n.kind === 'waypoint' ? 9 : 14;
      list.forEach(({ w, p }, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(list.length, 6);
        spots.push({ w, x: n.x * k + Math.cos(a) * ring, y: n.y * k + Math.sin(a) * ring, state: p.waiting ? 'waiting' : 'resting' });
      });
    }
    return spots;
  }

  function drawWayfarers(spots, selectedId) {
    for (const s of spots) {
      if (s.state === 'camped') continue;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.state === 'moving' ? 3.4 : 2.8, 0, Math.PI * 2);
      ctx.fillStyle = s.state === 'moving' ? colors.accent : s.state === 'waiting' ? colors.danger : colors.muted;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.paper;
      ctx.stroke();
      hits.push({ kind: 'wayfarer', id: s.w.id, x: s.x, y: s.y, r: 8 });
    }
    // Campfires glow through the night overlay, so draw them last.
    return () => {
      for (const s of spots) {
        if (s.state !== 'camped') continue;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 7);
        g.addColorStop(0, 'rgba(255, 190, 90, 0.95)');
        g.addColorStop(0.35, 'rgba(240, 130, 40, 0.55)');
        g.addColorStop(1, 'rgba(240, 130, 40, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
        ctx.fill();
        hits.push({ kind: 'wayfarer', id: s.w.id, x: s.x, y: s.y, r: 8 });
      }
      const sel = spots.find((s) => s.w.id === selectedId);
      if (sel) {
        ctx.beginPath();
        ctx.arc(sel.x, sel.y, 7.5, 0, Math.PI * 2);
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
        haloText(sel.w.name, sel.x + 11, sel.y - 9, `600 ${scaled(13)}px "EB Garamond", Georgia, serif`, colors.accent, 'left');
      }
    };
  }

  // Price of one good at each market: a chip with a pressure glyph and the price.
  // Glyph shape and text carry the meaning; colour only reinforces it.
  function drawPriceBadges(sim, gid) {
    if (!gid || !sim.state.economy) return;
    const font = `600 ${scaled(12.5)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    for (const n of world.nodes) {
      if (n.kind === 'waypoint' || !sim.state.economy.markets[n.id]) continue;
      const q = quote(sim, n.id, gid);
      const p = pressure(priceMultiplier(q));
      const [dx, dy, align] = DECOR.badges[n.id] ?? [10, 12, 'left'];
      const text = money(q.price);
      ctx.font = font;
      const tw = ctx.measureText(text).width;
      const gw = scaled(10);
      const w = gw + 4 + tw + 12;
      const h = scaled(12.5) + 8;
      const x0 = n.x * k + dx - (align === 'right' ? w : 0);
      const y0 = n.y * k + dy - h / 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 4);
      else ctx.rect(x0, y0, w, h);
      ctx.fillStyle = colors.paper;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.border;
      ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = p.cls === 'cheap' ? colors.cheap : p.cls === 'dear' ? colors.dear : colors.muted;
      ctx.font = `${scaled(10)}px system-ui, sans-serif`;
      ctx.fillText(p.glyph, x0 + 6, y0 + h / 2 + 0.5);
      ctx.font = font;
      ctx.fillStyle = colors.ink;
      ctx.fillText(text, x0 + 6 + gw + 4, y0 + h / 2 + 0.5);
    }
  }

  function draw({ sim, t, selected, highlight, priceGood }) {
    if (!colors) readColors();
    if (!W) resize();
    hits = [];
    const season = sim.cal.season(Math.floor(t));
    drawBackground();
    drawGeography();
    drawRoads(sim, season.id, highlight);
    drawNodes();
    const spots = wayfarerSpots(sim, t);
    const drawAfterNight = drawWayfarers(spots, selected?.kind === 'wayfarer' ? selected.id : null);
    // Night falls over everything except the campfires.
    const dark = (1 - sim.cal.light(t)) * colors.nightStrength;
    if (dark > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = dark;
      ctx.fillStyle = colors.night;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    drawAfterNight();
    drawPriceBadges(sim, priceGood);
    if (selected?.kind === 'node') {
      const n = nodeById.get(selected.id);
      ctx.beginPath();
      ctx.arc(n.x * k, n.y * k, 13, 0, Math.PI * 2);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    drawChrome();
  }

  /** Topmost thing under a canvas-relative point, preferring travellers over places. */
  function hitTest(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const h of hits) {
      const d = Math.sqrt((h.x - x) * (h.x - x) + (h.y - y) * (h.y - y));
      const score = d - (h.kind === 'wayfarer' ? 4 : 0);
      if (d <= h.r && score < bestD) {
        best = h;
        bestD = score;
      }
    }
    return best;
  }

  /**
   * Everything under the pointer, for hover tooltips: travellers and places
   * first, then roads, then rivers and the gorge, then areas (forest, hills,
   * fields, sea). Returns the topmost thing or null.
   */
  function describeAt(x, y) {
    const top = hitTest(x, y);
    if (top) return top;
    const km = [x / k, y / k];
    const near = 7 / k; // 7 pixels, in km
    let bestSeg = null;
    let bestD = near;
    for (const sg of segs) {
      const d = distToSegment(km[0], km[1], sg.A.x, sg.A.y, sg.B.x, sg.B.y);
      if (d < bestD) {
        bestSeg = sg;
        bestD = d;
      }
    }
    if (bestSeg) return { kind: 'segment', id: bestSeg.id };
    const onLine = (pts) => pts.some((p, i) => i > 0 && distToSegment(km[0], km[1], pts[i - 1][0], pts[i - 1][1], p[0], p[1]) < near);
    for (const r of DECOR.rivers) if (onLine(r.points)) return { kind: 'area', name: r.name, about: r.about };
    if (onLine(DECOR.gorge.points)) return { kind: 'area', name: DECOR.gorge.name, about: DECOR.gorge.about };
    for (const a of [...DECOR.forests, ...DECOR.hills, ...DECOR.fields]) {
      if (a.name && pointInPolygon(km[0], km[1], a.points)) return { kind: 'area', name: a.name, about: a.about };
    }
    if (pointInPolygon(km[0], km[1], DECOR.sea)) return { kind: 'area', name: DECOR.seaLabel.text, about: DECOR.seaAbout };
    return null;
  }

  return { draw, resize, hitTest, describeAt, refreshColors: readColors };
}
