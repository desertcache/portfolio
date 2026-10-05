// Mesa Lander: the drawing kit. Flat ink-and-paper, like Roadrunner Crossing: warm paper
// and red-rock fills under confident ink outlines (1.5 to 2.5 px, so the cabinet's CRT
// scanlines cannot swallow them), sage and saguaro green, sunset orange and turquoise
// accents, no gradients and no glow. The static scene is painted once into an offscreen
// canvas from the very same heightfield the physics uses, so what you see is what you hit.
import { LEFT, MAIN, RIGHT } from './physics.js';
import { mulberry32 } from './rng.js';

export const TAU = Math.PI * 2;

export const PAL = {
  ink: '#2b2118',
  ink2: '#4a3a30',
  paper: '#f1e4c4',
  paperHi: '#f8f0da',
  sand: '#e8d5b0',
  sandDark: '#d6bf93',
  sandLine: '#c4a977',
  sage: '#9fb08a',
  sageDark: '#6f8560',
  sageLight: '#c3d0aa',
  cactus: '#7f9c63',
  rock: '#c0603c',
  rockDark: '#a94b2b',
  rockShade: '#8f3b22',
  rockCap: '#e3c79b',
  redrock: '#a8401d',
  mustard: '#dcae45',
  turq: '#3fa7a0',
  turqDark: '#1f7a6e',
  turqLight: '#a5d8d0',
  sunset: '#e8793a',
  crash: '#c8402a',
  sky: ['#c98f86', '#d89d88', '#e6b194', '#efc59f', '#f4d7ad'],
  sun: '#f8e2ae',
  butte: '#cf8a63',
};

export const FONT = {
  ui: 'Archivo, "Helvetica Neue", Arial, sans-serif',
  num: '"Martian Mono", ui-monospace, Menlo, Consolas, monospace',
};

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Blend two #rrggbb colors; t = 0 is a, t = 1 is b. */
export function mix(a, b, t) {
  const A = hex(a);
  const B = hex(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// ---------- text and small shapes ----------

/**
 * Canvas text with the site's fonts. `maxW` squeezes a line that would run too long
 * (the fonts load from the web, so widths shift once they arrive).
 */
export function text(ctx, str, x, y, { size = 14, weight = 600, color = PAL.ink, align = 'left', font = FONT.ui, maxW } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (maxW) ctx.fillText(str, x, y, maxW);
  else ctx.fillText(str, x, y);
}

export function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** A paper label with an ink border. */
export function chip(c, x, y, w, h, { fill = PAL.paper, border = PAL.ink, bw = 2, r = 6, alpha = 1 } = {}) {
  c.globalAlpha = alpha;
  roundRectPath(c, x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = bw;
  c.strokeStyle = border;
  c.stroke();
  c.globalAlpha = 1;
}

/** A small filled triangle pointing left, right, up or down, centered on (x, y). */
export function arrow(c, x, y, dir, s, color) {
  c.beginPath();
  if (dir === 'up') { c.moveTo(x, y - s); c.lineTo(x + s, y + s * 0.7); c.lineTo(x - s, y + s * 0.7); }
  else if (dir === 'down') { c.moveTo(x, y + s); c.lineTo(x + s, y - s * 0.7); c.lineTo(x - s, y - s * 0.7); }
  else if (dir === 'left') { c.moveTo(x - s, y); c.lineTo(x + s * 0.7, y - s); c.lineTo(x + s * 0.7, y + s); }
  else { c.moveTo(x + s, y); c.lineTo(x - s * 0.7, y - s); c.lineTo(x - s * 0.7, y + s); }
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

function inkStyle(c, w = 1.5) {
  c.lineWidth = w;
  c.strokeStyle = PAL.ink;
  c.lineJoin = 'round';
  c.lineCap = 'round';
}

// ---------- the lander ----------

/**
 * Draw the lander: x, y is the center of its body, `a` its tilt in radians (the same
 * sign as the physics), `fire` the engines that burned on the last tick.
 * @param {CanvasRenderingContext2D} c
 */
export function drawLander(c, x, y, a, fire, tick, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.rotate(a);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const flick = (tick % 4) / 4;

  if (fire & MAIN) {
    // a flat flame: orange outside, mustard inside, flickering in length
    const len = 21 + 10 * Math.abs(Math.sin(tick * 1.7)) + 4 * flick;
    c.lineWidth = 1.3;
    c.strokeStyle = PAL.ink;
    c.beginPath();
    c.moveTo(-7, 11); c.lineTo(0, 11 + len); c.lineTo(7, 11);
    c.closePath();
    c.fillStyle = PAL.sunset;
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(-3.8, 11); c.lineTo(0, 11 + len * 0.6); c.lineTo(3.8, 11);
    c.closePath();
    c.fillStyle = PAL.mustard;
    c.fill();
  }

  // legs and foot pads (the feet are the contact points at x = +-16, y = 15)
  c.lineWidth = 2;
  c.strokeStyle = PAL.ink;
  c.beginPath();
  c.moveTo(-8, 3); c.lineTo(-16, 14.5);
  c.moveTo(8, 3); c.lineTo(16, 14.5);
  c.moveTo(-20.5, 15); c.lineTo(-11.5, 15);
  c.moveTo(11.5, 15); c.lineTo(20.5, 15);
  c.stroke();

  // engine bell
  c.beginPath();
  c.moveTo(-4.5, 8); c.lineTo(4.5, 8); c.lineTo(6.5, 12); c.lineTo(-6.5, 12);
  c.closePath();
  c.fillStyle = PAL.ink2;
  c.fill();
  c.lineWidth = 1.5;
  c.stroke();

  // side jets: the left control fires from the right side, and the other way round
  for (const side of [LEFT, RIGHT]) {
    if (!(fire & side)) continue;
    const dir = side === LEFT ? 1 : -1;
    const ln = 8 + 5 * flick;
    c.beginPath();
    c.moveTo(dir * 10, -11); c.lineTo(dir * (10 + ln), -8.5); c.lineTo(dir * 10, -6);
    c.closePath();
    c.fillStyle = PAL.paperHi;
    c.fill();
    c.lineWidth = 1.5;
    c.stroke();
  }

  // body: a rounded cabin
  c.beginPath();
  c.moveTo(-11, 8);
  c.lineTo(-11, -7);
  c.arcTo(-11, -14, 0, -14, 9);
  c.arcTo(11, -14, 11, -7, 9);
  c.lineTo(11, 8);
  c.closePath();
  c.fillStyle = PAL.paperHi;
  c.fill();
  c.lineWidth = 2;
  c.stroke();
  // a sunset stripe and a turquoise window
  c.fillStyle = PAL.sunset;
  c.fillRect(-10, 1.5, 20, 4);
  c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-11, 1.5); c.lineTo(11, 1.5); c.moveTo(-11, 5.5); c.lineTo(11, 5.5); c.stroke();
  c.beginPath(); c.arc(0, -5, 4.6, 0, TAU);
  c.fillStyle = PAL.turq;
  c.fill();
  c.lineWidth = 1.6;
  c.stroke();
  c.beginPath(); c.arc(-1.4, -6.4, 1.2, 0, TAU);
  c.fillStyle = PAL.turqLight;
  c.fill();
  // antenna
  c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(0, -14); c.lineTo(0, -19); c.stroke();
  c.beginPath(); c.arc(0, -20, 1.7, 0, TAU);
  c.fillStyle = PAL.sunset;
  c.fill();
  c.restore();
}

// ---------- scenery ----------

function polygon(c, pts, fill, line = true) {
  c.beginPath();
  pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (line) c.stroke();
}

function butte(g, cx, baseY, w, h, color, rng) {
  // A stepped silhouette in two or three tiers, like the buttes of Sedona.
  const tiers = rng() < 0.5 ? 2 : 3;
  const tierH = h / tiers;
  const left = [];
  const right = [];
  let half = w / 2;
  for (let i = 0; i < tiers; i++) {
    const yb = baseY - tierH * i;
    const yt = baseY - tierH * (i + 1);
    left.push([cx - half, yb], [cx - half, yt]);
    right.push([cx + half, yb], [cx + half, yt]);
    half *= 0.62;
  }
  g.beginPath();
  g.moveTo(cx - w / 2 - 14, baseY);
  for (const p of left) g.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.lineTo(cx + w / 2 + 14, baseY);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.stroke();
}

function saguaro(g, x, baseY, h, rng) {
  const tw = 10 + rng() * 3;
  const fill = PAL.cactus;
  inkStyle(g, 1.6);
  const arm = (side, y, reach, rise) => {
    // a bent arm: out from the trunk, then up
    g.beginPath();
    g.moveTo(x + side * tw * 0.4, y);
    g.lineTo(x + side * (tw * 0.4 + reach), y);
    g.lineTo(x + side * (tw * 0.4 + reach), y - rise);
    g.lineWidth = tw * 0.62 + 3.2;
    g.strokeStyle = PAL.ink;
    g.stroke();
    g.lineWidth = tw * 0.62;
    g.strokeStyle = fill;
    g.stroke();
  };
  if (h > 34) arm(-1, baseY - h * 0.42, tw * 0.9, h * 0.28);
  if (h > 44 && rng() < 0.8) arm(1, baseY - h * 0.55, tw * 0.9, h * 0.24);
  roundRectPath(g, x - tw / 2, baseY - h, tw, h, tw / 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 1.6;
  g.strokeStyle = PAL.ink;
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = PAL.sageDark;
  g.beginPath(); g.moveTo(x - 1.5, baseY - h + 5); g.lineTo(x - 1.5, baseY - 3); g.moveTo(x + 2.2, baseY - h + 6); g.lineTo(x + 2.2, baseY - 3); g.stroke();
}

function boulder(g, x, baseY, w, h) {
  inkStyle(g, 1.5);
  g.beginPath();
  g.moveTo(x - w / 2, baseY);
  g.quadraticCurveTo(x - w / 2, baseY - h, x - w * 0.1, baseY - h);
  g.quadraticCurveTo(x + w / 2, baseY - h, x + w / 2, baseY);
  g.closePath();
  g.fillStyle = '#c9b48f';
  g.fill();
  g.stroke();
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(x - w * 0.15, baseY - h * 0.55); g.lineTo(x + w * 0.08, baseY - h * 0.45); g.stroke();
}

function tuft(g, x, baseY, s) {
  g.lineWidth = 1.5;
  g.strokeStyle = PAL.sageDark;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - s * 0.5, baseY); g.lineTo(x - s * 0.7, baseY - s);
  g.moveTo(x, baseY); g.lineTo(x, baseY - s * 1.25);
  g.moveTo(x + s * 0.5, baseY); g.lineTo(x + s * 0.8, baseY - s * 0.9);
  g.stroke();
}

function mesaPath(g, t, m) {
  const reach = m.topW / 2 + (t.floor - m.top) * m.lean;
  const x0 = Math.max(0, Math.floor(m.cx - reach));
  const x1 = Math.min(t.W, Math.ceil(m.cx + reach));
  g.beginPath();
  g.moveTo(x0, t.floor + 1);
  for (let x = x0; x <= x1; x++) g.lineTo(x, t.h[x]);
  g.lineTo(x1, t.floor + 1);
  g.closePath();
  return [x0, x1];
}

/**
 * Paint a whole static scene: dusk sky, far buttes, the desert floor, each mesa from the
 * heightfield, the painted landing pad, and a little foreground. Returns the canvas.
 * @param {import('./physics.js').Terrain} t
 * @param {{ seed?: number, startBox?: { x0: number, x1: number, y0: number, y1: number } | null }} [opts]
 */
export function buildScene(t, { seed = 1, startBox = null } = {}) {
  const { W, H, floor: F } = t;
  const rng = mulberry32(seed);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  inkStyle(g, 1.5);

  // --- dusk sky: flat bands, a poster sun, a few streaks of cloud ---
  const cuts = [0, 62, 132, 210, 290, F];
  for (let i = 0; i < 5; i++) {
    g.fillStyle = PAL.sky[i];
    g.fillRect(0, cuts[i], W, cuts[i + 1] - cuts[i] + 1);
  }
  const sunX = W * (0.62 + rng() * 0.25);
  const sunY = 168;
  g.beginPath(); g.arc(sunX, sunY, 40, 0, TAU);
  g.fillStyle = PAL.sun; g.fill();
  g.lineWidth = 2; g.strokeStyle = PAL.ink2; g.stroke();
  g.fillStyle = PAL.sky[2];
  for (let i = 0; i < 3; i++) g.fillRect(sunX - 40 + i, sunY + 6 + i * 11, 80 - i * 2, 4);
  g.fillStyle = PAL.paper;
  g.globalAlpha = 0.65;
  for (let i = 0; i < 5; i++) {
    const cx = rng() * W;
    const cy = 40 + rng() * 150;
    const cw = 60 + rng() * 110;
    roundRectPath(g, cx, cy, cw, 7, 3.5);
    g.fill();
  }
  g.globalAlpha = 1;

  // --- far buttes, hazy and thin-lined so they never read as solid ground ---
  g.strokeStyle = PAL.ink2;
  g.lineWidth = 1.4;
  g.globalAlpha = 0.9;
  const hazeA = mix(PAL.butte, PAL.sky[4], 0.45);
  const hazeB = mix(PAL.butte, PAL.sky[4], 0.62);
  let bx = -30 + rng() * 60;
  while (bx < W + 60) {
    const w = 80 + rng() * 90;
    const h = 70 + rng() * 80;
    butte(g, bx + w / 2, F, w, h, rng() < 0.5 ? hazeA : hazeB, rng);
    bx += w * (0.7 + rng() * 0.9);
  }
  g.globalAlpha = 1;

  // --- the desert floor ---
  g.fillStyle = PAL.sand;
  g.fillRect(0, F, W, H - F);
  g.fillStyle = PAL.sandDark;
  g.fillRect(0, F, W, 7);
  g.fillStyle = PAL.sandLine;
  for (let i = 0; i < 26; i++) {
    g.fillRect(rng() * W, F + 14 + rng() * (H - F - 18), 8 + rng() * 16, 2);
  }

  // --- the mesas, straight from the heightfield ---
  inkStyle(g, 2.2);
  for (const m of t.mesas) {
    const [x0, x1] = mesaPath(g, t, m);
    g.fillStyle = PAL.rock;
    g.fill();
    g.save();
    g.clip();
    // strata: flat bands of two reds
    let y = m.top + 8;
    let k = 0;
    while (y < F) {
      const bh = 9 + Math.floor(rng() * 10);
      if (k % 2 === 0) { g.fillStyle = PAL.rockDark; g.fillRect(x0, y, x1 - x0, bh); }
      y += bh;
      k++;
    }
    // the shaded face on the right
    g.fillStyle = PAL.rockShade;
    g.globalAlpha = 0.5;
    g.fillRect(m.cx + m.topW * 0.12, m.top, x1 - m.cx, F - m.top + 2);
    g.globalAlpha = 1;
    // a sand cap on the flat top
    g.fillStyle = PAL.rockCap;
    g.fillRect(m.cx - m.topW / 2, m.top, m.topW, 8);
    g.restore();
    // outline: the skyline of this mesa
    g.beginPath();
    for (let x = x0; x <= x1; x++) (x === x0 ? g.moveTo(x, t.h[x]) : g.lineTo(x, t.h[x]));
    g.lineWidth = 2.4;
    g.strokeStyle = PAL.ink;
    g.stroke();
    // the cap's lower edge
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(m.cx - m.topW / 2, m.top + 8.5); g.lineTo(m.cx + m.topW / 2, m.top + 8.5); g.stroke();
  }
  // the floor line between the mesas
  g.lineWidth = 2.4;
  g.strokeStyle = PAL.ink;
  g.beginPath();
  g.moveTo(0, F);
  for (let x = 0; x <= W; x++) if (t.h[x] >= F - 0.01) g.lineTo(x, F); else g.moveTo(x + 1, F);
  g.stroke();

  // --- the landing pad: a painted strip flush with the top of its mesa ---
  const { x0: px0, x1: px1, y: py } = t.pad;
  g.fillStyle = PAL.turq;
  g.fillRect(px0, py, px1 - px0, 10);
  g.fillStyle = PAL.paperHi;
  for (let x = px0 + 20; x < px1 - 24; x += 16) g.fillRect(x, py + 3.5, 9, 3);
  // chevrons at both ends point in toward the middle
  polygon(g, [[px0 + 3, py + 1.5], [px0 + 11, py + 5], [px0 + 3, py + 8.5]], PAL.paperHi, false);
  polygon(g, [[px1 - 3, py + 1.5], [px1 - 11, py + 5], [px1 - 3, py + 8.5]], PAL.paperHi, false);
  g.lineWidth = 2;
  g.strokeStyle = PAL.ink;
  g.strokeRect(px0, py, px1 - px0, 10);

  // --- a little foreground, kept below the floor line so nothing looks solid in the air ---
  const fgTop = F + 6;
  for (let i = 0; i < 4 + Math.round(W / 220); i++) {
    const x = 24 + rng() * (W - 48);
    saguaro(g, x, H - 4 - rng() * 14, 28 + rng() * 22, rng);
  }
  for (let i = 0; i < 3 + Math.round(W / 300); i++) boulder(g, 30 + rng() * (W - 60), H - 3 - rng() * 12, 22 + rng() * 22, 11 + rng() * 8);
  for (let i = 0; i < 8; i++) tuft(g, 12 + rng() * (W - 24), fgTop + 8 + rng() * (H - fgTop - 12), 6 + rng() * 4);

  // --- the learning agent's start zone, when there is one ---
  if (startBox) {
    const { x0, x1, y0, y1 } = startBox;
    g.save();
    g.setLineDash([7, 6]);
    g.lineWidth = 1.8;
    g.strokeStyle = PAL.ink2;
    g.globalAlpha = 0.5;
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.restore();
  }
  return c;
}

/** Blinking beacons at both ends of the pad (drawn each frame, over the static scene). */
export function drawBeacons(c, pad, tick) {
  const on = Math.floor(tick / 24) % 2 === 0;
  c.lineWidth = 2;
  c.strokeStyle = PAL.ink;
  c.lineCap = 'round';
  for (const x of [pad.x0, pad.x1]) {
    c.beginPath(); c.moveTo(x, pad.y); c.lineTo(x, pad.y - 8); c.stroke();
    c.beginPath(); c.arc(x, pad.y - 11, 4, 0, TAU);
    c.fillStyle = on ? PAL.sunset : PAL.mustard;
    c.fill();
    c.lineWidth = 1.5;
    c.stroke();
    c.lineWidth = 2;
  }
}
