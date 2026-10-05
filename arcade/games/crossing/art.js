// Roadrunner Crossing: art helpers. Everything here is flat: an ink outline
// (about 1.5 px) over a paper fill, in the site's desert palette. The roadrunner
// and the plants are the site's own drawings (assets/fauna.svg, assets/desert.svg),
// re-inked with concrete colors and loaded as images. Vehicles, logs and
// tumbleweeds are drawn with canvas paths into small cached sprites.

export const TAU = Math.PI * 2;

// --- board geometry (logical 800 x 500) ---
export const W = 800;
export const H = 500;
export const TS = 36; // tile size
export const COLS = 22; // 22 * 36 = 792
export const OX = (W - COLS * TS) / 2; // 4
export const GH = 62; // the goal strip is taller: saguaros stand in it
export const HUD_Y = GH + 11 * TS; // 458
export const ROWS = 12; // 0 goal, 1-4 wash, 5 median, 6-10 highway, 11 start
export const rowTop = (r) => (r === 0 ? 0 : GH + (r - 1) * TS);
export const rowCenter = (r) => (r === 0 ? 44 : rowTop(r) + TS / 2);
export const colX = (c) => OX + c * TS + TS / 2;

export const PAL = {
  ink: '#2b2118',
  ink2: '#4a3a30',
  paper: '#f1e4c4',
  sand: '#e8d5b0',
  sandDark: '#d6bf93',
  sandLine: '#c4a977',
  shoulder: '#e0c99b',
  sage: '#9fb08a',
  sageDark: '#6f8560',
  sageLight: '#c3d0aa',
  terracotta: '#c8693f',
  redrock: '#a8401d',
  mustard: '#dcae45',
  asphalt: '#6a5f57',
  asphaltDark: '#5a5049',
  water: '#7aa6a6',
  waterLight: '#bcd9d2',
  waterDeep: '#648f90',
  wood: '#b98a5e',
  woodLight: '#d9b88a',
  weed: '#d8c28e',
  glass: '#cfe0dc',
  hud: '#3b2f38',
  hudDeep: '#241c24',
  skyTop: '#c9928a',
  skyMid: '#dc9f89',
  skyLow: '#eeb99a',
  sun: '#f4d9a6',
  butte: '#cf8a63',
  fruit: '#b8246a',
};

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  const m = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

// ---------- drawing primitives ----------
function inkStyle(c, w = 1.5) {
  c.lineWidth = w;
  c.strokeStyle = PAL.ink;
  c.lineJoin = 'round';
  c.lineCap = 'round';
}
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function fillStroke(c, fill) {
  c.fillStyle = fill;
  c.fill();
  c.stroke();
}
function poly(c, pts, fill) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  fillStroke(c, fill);
}
function circle(c, x, y, r, fill) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  fillStroke(c, fill);
}
function wheel(c, x, y, r) {
  circle(c, x, y, r, PAL.ink2);
  c.lineWidth = 1;
  circle(c, x, y, r * 0.42, PAL.paper);
  c.lineWidth = 1.5;
}

// ---------- vehicles (drawn facing right; flipped for leftward lanes) ----------
export const VEHICLE_COLORS = ['#c8693f', '#8fa57b', '#efe3c6', '#a8401d', '#7a9bab', '#dcae45', '#b9a07a'];

const DRAW = {
  pickup(c, col) {
    const shade = mix(col, PAL.ink, 0.25);
    rr(c, 1, 11, 74, 11, 3); fillStroke(c, col);
    rr(c, 2, 6, 36, 6, 1.5); fillStroke(c, shade);
    poly(c, [[40, 11], [43, 3], [58, 3], [67, 11]], col);
    poly(c, [[45, 10], [46.5, 5], [57, 5], [62, 10]], PAL.glass);
    circle(c, 73, 15, 2, PAL.mustard);
    circle(c, 3, 15, 1.4, '#d5603a');
    wheel(c, 16, 22, 5.5);
    wheel(c, 60, 22, 5.5);
  },
  car(c, col) {
    rr(c, 1, 10, 52, 10, 4); fillStroke(c, col);
    poly(c, [[12, 10], [17, 2], [35, 2], [43, 10]], col);
    poly(c, [[17, 9], [19, 4.5], [33, 4.5], [38, 9]], PAL.glass);
    c.beginPath(); c.moveTo(27, 4.5); c.lineTo(27, 9); c.stroke();
    circle(c, 51.5, 14, 1.8, PAL.mustard);
    circle(c, 2.5, 14, 1.4, '#d5603a');
    wheel(c, 13, 20, 5);
    wheel(c, 41, 20, 5);
  },
  rv(c, col) {
    rr(c, 1, 2, 94, 24, 3); fillStroke(c, PAL.paper);
    c.fillStyle = col; c.fillRect(2, 15, 92, 4);
    c.beginPath(); c.moveTo(2, 15); c.lineTo(94, 15); c.moveTo(2, 19); c.lineTo(94, 19); c.lineWidth = 1; c.stroke(); c.lineWidth = 1.5;
    for (const x of [9, 29, 49]) { rr(c, x, 6, 14, 7, 1.5); fillStroke(c, PAL.glass); }
    rr(c, 70, 7, 12, 18, 1.5); fillStroke(c, mix(PAL.paper, PAL.ink, 0.12));
    poly(c, [[95, 26], [95, 9], [103, 3], [115, 10], [119, 26]], PAL.paper);
    poly(c, [[100, 10], [104, 6], [112, 10], [112, 14], [100, 14]], PAL.glass);
    c.fillStyle = col; c.fillRect(96, 18, 22, 4);
    circle(c, 118, 20, 1.8, PAL.mustard);
    wheel(c, 24, 27, 6);
    wheel(c, 102, 27, 6);
  },
  semi(c, col) {
    const shade = mix(col, PAL.ink, 0.22);
    rr(c, 1, 3, 124, 22, 2); fillStroke(c, col);
    c.lineWidth = 1;
    for (let x = 21; x < 124; x += 20) { c.beginPath(); c.moveTo(x, 4); c.lineTo(x, 24); c.stroke(); }
    c.lineWidth = 1.5;
    c.fillStyle = PAL.paper; c.fillRect(8, 11, 108, 5); c.strokeRect(8, 11, 108, 5);
    c.fillStyle = shade; c.fillRect(8, 16, 108, 2);
    c.fillStyle = PAL.ink2; c.fillRect(125, 19, 6, 5);
    rr(c, 130, 9, 44, 16, 3); fillStroke(c, PAL.terracotta);
    poly(c, [[134, 9], [138, 2], [160, 2], [166, 9]], PAL.terracotta);
    poly(c, [[140, 8], [142, 4], [158, 4], [162, 8]], PAL.glass);
    c.fillStyle = PAL.ink2; c.fillRect(131, 0, 3, 9);
    circle(c, 172, 18, 2, PAL.mustard);
    wheel(c, 14, 26, 5.5);
    wheel(c, 30, 26, 5.5);
    wheel(c, 144, 26, 5.5);
    wheel(c, 160, 26, 5.5);
  },
};
const SIZES = { pickup: [76, 30], car: [54, 26], rv: [120, 34], semi: [176, 33] };

const vehicleCache = new Map();
export function makeVehicle(kind, color, dir) {
  const key = `${kind}|${color}|${dir}`;
  if (vehicleCache.has(key)) return vehicleCache.get(key);
  const [w, h] = SIZES[kind];
  const c = makeCanvas(w + 4, h + 4);
  const g = c.getContext('2d');
  if (dir < 0) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.translate(2, 2);
  inkStyle(g);
  DRAW[kind](g, color);
  const spr = { c, w, h };
  vehicleCache.set(key, spr);
  return spr;
}

// ---------- cottonwood logs and tumbleweed rafts ----------
const platCache = new Map();
export function makeLog(w, rng) {
  const key = `log|${w}`;
  if (platCache.has(key)) return platCache.get(key);
  const h = 26;
  const c = makeCanvas(w + 4, h + 4);
  const g = c.getContext('2d');
  g.translate(2, 2);
  inkStyle(g);
  rr(g, 1, 3, w - 2, 20, 10); fillStroke(g, PAL.wood);
  // bark lines
  g.lineWidth = 1;
  g.strokeStyle = PAL.ink2;
  for (let i = 0; i < Math.max(3, w / 22); i++) {
    const x = 16 + rng() * (w - 44), y = 7 + rng() * 12, l = 8 + rng() * 14;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y); g.stroke();
  }
  // a knot
  g.lineWidth = 1;
  g.beginPath(); g.ellipse(w * (0.35 + rng() * 0.3), 13, 3, 2.2, 0, 0, TAU); g.stroke();
  // the cut ends
  inkStyle(g);
  g.beginPath(); g.ellipse(9, 13, 5, 9, 0, 0, TAU); g.fillStyle = PAL.woodLight; g.fill(); g.stroke();
  g.lineWidth = 1;
  g.beginPath(); g.ellipse(9, 13, 2, 4.5, 0, 0, TAU); g.stroke();
  inkStyle(g);
  g.beginPath(); g.ellipse(w - 9, 13, 5, 9, 0, 0, TAU); g.fillStyle = PAL.woodLight; g.fill(); g.stroke();
  // a snapped branch
  const bx = 24 + rng() * (w - 56);
  poly(g, [[bx, 4], [bx + 3, -1], [bx + 7, 4]], PAL.wood);
  const spr = { c, w, h };
  platCache.set(key, spr);
  return spr;
}

export function makeRaft(w, rng) {
  const key = `raft|${w}`;
  if (platCache.has(key)) return platCache.get(key);
  const h = 32;
  const c = makeCanvas(w + 4, h + 4);
  const g = c.getContext('2d');
  g.translate(2, 2);
  inkStyle(g);
  const n = Math.max(2, Math.round(w / 28));
  const r = 14.5;
  const span = w - 2 * r - 2;
  // a few sticks lashing the weeds together
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(3, 24); g.lineTo(w - 3, 22); g.moveTo(5, 28); g.lineTo(w - 6, 27); g.stroke();
  for (let i = 0; i < n; i++) {
    const cx = r + 1 + (n === 1 ? 0 : (span * i) / (n - 1));
    const cy = 15 + (i % 2 ? 1.5 : -1);
    inkStyle(g);
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = PAL.weed; g.fill(); g.stroke();
    g.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      const a0 = rng() * TAU, rr0 = r * (0.35 + rng() * 0.45);
      g.beginPath(); g.arc(cx + (rng() - 0.5) * 5, cy + (rng() - 0.5) * 5, rr0, a0, a0 + 1.4 + rng()); g.stroke();
    }
  }
  const spr = { c, w, h };
  platCache.set(key, spr);
  return spr;
}

// A tile of wave marks; scrolled with a pattern fill.
export function makeWaterTile(seed) {
  const rng = mulberry32(seed);
  const tw = 120, th = TS;
  const c = makeCanvas(tw, th);
  const g = c.getContext('2d');
  g.strokeStyle = PAL.waterLight;
  g.lineWidth = 1.5;
  g.lineCap = 'round';
  const marks = [[8, 9], [60, 12], [30, 26], [88, 27]];
  for (const [mx, my] of marks) {
    const x = mx + (rng() - 0.5) * 6, w = 14 + rng() * 8;
    g.beginPath();
    g.moveTo(x, my);
    g.quadraticCurveTo(x + w * 0.25, my - 3.5, x + w * 0.5, my);
    g.quadraticCurveTo(x + w * 0.75, my + 3.5, x + w, my);
    g.stroke();
  }
  return c;
}

// ---------- small flat things ----------
export function drawFruit(c, x, y, s = 1) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  inkStyle(c);
  // pad
  c.beginPath(); c.ellipse(0, 7, 8, 5, 0, 0, TAU); c.fillStyle = PAL.sageLight; c.fill(); c.stroke();
  // the red fruit
  c.beginPath(); c.ellipse(0, -1, 7, 9, 0, 0, TAU); c.fillStyle = PAL.fruit; c.fill(); c.stroke();
  c.lineWidth = 1;
  c.strokeStyle = PAL.paper;
  for (const [dx, dy] of [[-2, -3], [2, 0], [-1, 3], [3, -4]]) {
    c.beginPath(); c.moveTo(dx, dy); c.lineTo(dx + 0.01, dy + 1.6); c.stroke();
  }
  c.restore();
}

export function drawBoulder(c, x, y, w, h) {
  inkStyle(c);
  c.beginPath();
  c.moveTo(x - w / 2, y);
  c.quadraticCurveTo(x - w / 2, y - h, x - w * 0.1, y - h);
  c.quadraticCurveTo(x + w / 2, y - h, x + w / 2, y);
  c.closePath();
  c.fillStyle = '#c9b48f';
  c.fill();
  c.stroke();
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(x - w * 0.15, y - h * 0.55); c.lineTo(x + w * 0.05, y - h * 0.45); c.stroke();
}

// ---------- the site's own drawings ----------
const FAUNA_URL = new URL('../../../assets/fauna.svg', import.meta.url);
const DESERT_URL = new URL('../../../assets/desert.svg', import.meta.url);

function symbolParts(text, id) {
  const a = text.indexOf(`<symbol id="${id}"`);
  if (a < 0) return null;
  const open = text.indexOf('>', a);
  const b = text.indexOf('</symbol>', a);
  const head = text.slice(a, open);
  const vb = /viewBox="([^"]+)"/.exec(head)[1].split(/\s+/).map(Number);
  return { vb, inner: text.slice(open + 1, b) };
}

function svgImage(sym, drawW, drawH, vars, frame, lw = 1.1) {
  const scale = drawH / sym.vb[3];
  const v = { '--illo-line': PAL.ink, '--illo-paper': PAL.sageLight, '--illo-w': (lw / scale).toFixed(2), '--draw': 1, ...vars };
  const style = Object.entries(v).map(([k, val]) => `${k}:${val}`).join(';');
  let inner = sym.inner;
  if (frame != null) inner = inner.split('var(--frame,6)').join(String(frame));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sym.vb.join(' ')}" width="${drawW * 2}" height="${drawH * 2}" style="${style}">${inner}</svg>`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ img, w: drawW, h: drawH });
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export const RUNNER = { w: 66, h: 43, pivot: 0.5341, runFrames: 6, stand: 6, flick: 7 };

// [key, symbol id, draw height, paper color]
const PLANT_SPECS = [
  ['saguaro', 'saguaro', 60, '#bccaa0'],
  ['saguaroYoung', 'saguaro-young', 52, '#bccaa0'],
  ['pear', 'prickly-pear', 32, '#b7c995'],
  ['pearSmall', 'prickly-pear', 24, '#b7c995'],
  ['barrel', 'barrel', 28, '#c5cf9d'],
  ['agave', 'agave', 46, '#aebf9a'],
  ['ocotillo', 'ocotillo', 33, 'none'],
  ['palo', 'palo-verde', 30, 'none'],
  ['brittle', 'brittlebush', 18, '#c9d3a4'],
  ['grass', 'grass', 12, 'none'],
  ['butteA', 'sedona', 42, '#d99870'],
  ['butteB', 'sedona', 30, '#cf8a63'],
];

export async function loadSprites() {
  try {
    const [fa, de] = await Promise.all([
      fetch(FAUNA_URL).then((r) => r.text()),
      fetch(DESERT_URL).then((r) => r.text()),
    ]);
    const rr0 = symbolParts(fa, 'roadrunner');
    const jobs = [];
    const runnerVars = { '--illo-paper': '#d9a574', '--illo-far': '0.75', '--illo-eye': PAL.ink };
    for (let f = 0; f < 8; f++) jobs.push(svgImage(rr0, RUNNER.w, RUNNER.h, runnerVars, f, 1.3));
    const plantKeys = [];
    for (const [key, id, h, paper] of PLANT_SPECS) {
      const sym = symbolParts(de, id);
      if (!sym) continue;
      const w = Math.round((h * sym.vb[2]) / sym.vb[3]);
      plantKeys.push(key);
      jobs.push(svgImage(sym, w, h, { '--illo-paper': paper, '--illo-line': PAL.ink2 }, null));
    }
    const out = await Promise.all(jobs);
    const runner = out.slice(0, 8);
    if (runner.some((r) => !r)) return null;
    const plants = {};
    plantKeys.forEach((k, i) => { plants[k] = out[8 + i]; });
    return { runner, plants };
  } catch {
    return null;
  }
}

// ---------- the static board ----------
export function slotXs() {
  return [0, 1, 2, 3, 4].map((i) => (W * (i + 0.5)) / 5);
}

function plantAt(g, sprites, key, x, baseY) {
  const p = sprites && sprites.plants[key];
  if (p) g.drawImage(p.img, Math.round(x - p.w / 2), Math.round(baseY - p.h), p.w, p.h);
}

export function buildBackground(sprites, seed) {
  const rng = mulberry32(seed);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  inkStyle(g);

  // --- dusk sky: flat bands, a low sun, buttes ---
  g.fillStyle = PAL.skyTop; g.fillRect(0, 0, W, 10);
  g.fillStyle = PAL.skyMid; g.fillRect(0, 10, W, 10);
  g.fillStyle = PAL.skyLow; g.fillRect(0, 20, W, 14);
  g.beginPath(); g.arc(612, 30, 13, 0, TAU); g.fillStyle = PAL.sun; g.fill(); g.lineWidth = 1.5; g.stroke();
  if (sprites) {
    const b = sprites.plants;
    for (const [k, x] of [['butteA', 70], ['butteB', 300], ['butteA', 470], ['butteB', 700]]) {
      if (b[k]) g.drawImage(b[k].img, x - b[k].w / 2, 34 - b[k].h + 2, b[k].w, b[k].h);
    }
  }
  // goal ground
  g.fillStyle = PAL.sand; g.fillRect(0, 34, W, GH - 34);
  g.fillStyle = PAL.sandDark; g.fillRect(0, 34, W, 3);
  g.strokeStyle = PAL.ink; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, 34.5); g.lineTo(W, 34.5); g.stroke();

  // shady spots under saguaros
  const xs = slotXs();
  xs.forEach((sx, i) => {
    g.beginPath(); g.ellipse(sx + 6, 50, 34, 9, 0, 0, TAU);
    g.fillStyle = PAL.sandLine; g.fill();
    plantAt(g, sprites, i % 2 ? 'saguaroYoung' : 'saguaro', sx + 28, 55);
  });
  // between the shady spots: rock and brush (not walkable)
  const fillers = ['palo', 'agave', 'ocotillo', 'pear', 'barrel', 'agave'];
  for (let i = 0; i < 4; i++) {
    const mid = (xs[i] + xs[i + 1]) / 2 + 12;
    drawBoulder(g, mid - 22, 58, 26, 14);
    plantAt(g, sprites, fillers[(i * 2 + 1) % fillers.length], mid + 6, 57);
    drawBoulder(g, mid + 26, 58, 22, 11);
  }
  for (const x of [8, 792]) drawBoulder(g, x, 58, 24, 13);

  // --- wash: rows 1-4 ---
  const washTop = rowTop(1), washBot = rowTop(5);
  g.fillStyle = PAL.water; g.fillRect(0, washTop, W, washBot - washTop);
  // lane seams (flat darker bands) so the four lanes read
  g.fillStyle = PAL.waterDeep;
  for (const r of [2, 4]) g.fillRect(0, rowTop(r), W, TS);
  // banks
  g.strokeStyle = PAL.ink; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, washTop + 0.5); g.lineTo(W, washTop + 0.5); g.moveTo(0, washBot - 0.5); g.lineTo(W, washBot - 0.5); g.stroke();

  // --- median: row 5 ---
  g.fillStyle = PAL.sand; g.fillRect(0, rowTop(5), W, TS);
  g.fillStyle = PAL.sandDark; g.fillRect(0, rowTop(5), W, 3);
  const medPlants = ['pear', 'barrel', 'ocotillo', 'palo', 'pear', 'barrel', 'ocotillo', 'palo'];
  let mx = 30 + rng() * 40;
  for (let i = 0; mx < W - 30; i++) {
    plantAt(g, sprites, medPlants[i % medPlants.length], mx, rowTop(5) + TS - 3);
    mx += 80 + rng() * 60;
  }
  for (let i = 0; i < 14; i++) plantAt(g, sprites, 'grass', 10 + rng() * (W - 20), rowTop(5) + 10 + rng() * 22);

  // --- highway: rows 6-10 ---
  const hwTop = rowTop(6), hwBot = rowTop(11);
  g.fillStyle = PAL.asphalt; g.fillRect(0, hwTop, W, hwBot - hwTop);
  g.fillStyle = PAL.asphaltDark;
  for (const r of [7, 9]) g.fillRect(0, rowTop(r), W, TS);
  g.strokeStyle = PAL.ink; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, hwTop + 0.5); g.lineTo(W, hwTop + 0.5); g.moveTo(0, hwBot - 0.5); g.lineTo(W, hwBot - 0.5); g.stroke();
  // dashed lane lines
  g.strokeStyle = PAL.sand; g.lineWidth = 2; g.setLineDash([18, 16]);
  for (const r of [7, 8, 9, 10]) { g.beginPath(); g.moveTo(0, rowTop(r)); g.lineTo(W, rowTop(r)); g.stroke(); }
  g.setLineDash([]);
  // edge lines
  g.strokeStyle = PAL.mustard; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, hwTop + 3); g.lineTo(W, hwTop + 3); g.moveTo(0, hwBot - 3); g.lineTo(W, hwBot - 3); g.stroke();

  // --- start strip: row 11 ---
  g.fillStyle = PAL.shoulder; g.fillRect(0, rowTop(11), W, TS);
  for (let i = 0; i < 10; i++) plantAt(g, sprites, 'grass', 8 + rng() * (W - 16), rowTop(11) + 14 + rng() * 20);
  for (const [k, x] of [['pear', 40], ['barrel', 120], ['barrel', 690], ['pearSmall', 760]]) plantAt(g, sprites, k, x, rowTop(11) + TS - 4);

  return c;
}

export function drawHudBase(g) {
  g.fillStyle = PAL.hud;
  g.fillRect(0, HUD_Y, W, H - HUD_Y);
  g.fillStyle = PAL.ink;
  g.fillRect(0, HUD_Y, W, 2);
}
