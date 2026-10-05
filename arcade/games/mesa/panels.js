// The learning view's right-hand column and buttons: what the agent has done lately, its
// learning curve, what it expects, what it is about to do. Flat ink-and-paper cards.
// Cards are painted once into the scene (paintColumn); the numbers and curves are drawn
// each frame (the draw* functions). Everything reads state and never changes it.
import { PAL, FONT, TAU, text, roundRectPath, arrow } from './art.js';

export const COL_X = 560; // the world is 560 wide, the column takes the other 240
const CX = 568; // cards sit 8 px in from the column's edge
const CW = 224;

export const CARD = {
  pips: { x: CX, y: 8, w: CW, h: 78 },
  curve: { x: CX, y: 94, w: CW, h: 120 },
  expect: { x: CX, y: 222, w: CW, h: 100 },
  bars: { x: CX, y: 330, w: CW, h: 106 },
  foot: { x: CX, y: 442, w: CW, h: 52 },
};

export const BUTTONS = {
  speeds: [1, 2, 3, 4].map((m, i) => ({ speed: m, label: `${m}x`, x: 12 + i * 66, y: 452, w: 60, h: 42 })),
  newBrain: { id: 'new', x: 286, y: 452, w: 160, h: 42 },
  end: { id: 'end', x: 458, y: 452, w: 82, h: 42 },
};

// A press counts a few px outside the drawn button: fingers are bigger than the screen's pixels.
export function hit(b, x, y, slop = 3) {
  return x >= b.x - slop && x <= b.x + b.w + slop && y >= b.y - slop && y <= b.y + b.h + slop;
}

const OUT = { landed: PAL.turq, crashed: PAL.crash };

/** The right-hand column's paper and cards, painted once into the scene canvas. */
export function paintColumn(g, H) {
  g.fillStyle = PAL.paper;
  g.fillRect(COL_X, 0, 800 - COL_X, H);
  g.fillStyle = PAL.ink;
  g.fillRect(COL_X - 1, 0, 3, H);
  for (const c of Object.values(CARD)) {
    roundRectPath(g, c.x, c.y, c.w, c.h, 8);
    g.fillStyle = PAL.paperHi;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = PAL.ink;
    g.stroke();
  }
}

const title = (ctx, c, str) => text(ctx, str, c.x + 10, c.y + 22, { size: 13, weight: 700, color: PAL.ink2, maxW: c.w - 20 });

const fmt = (n) => Math.round(n).toLocaleString('en-US');

/** The last 20 attempts you watched, as a strip of pips and a count. */
export function drawPips(ctx, ring, finished) {
  const c = CARD.pips;
  title(ctx, c, 'THE LAST 20 ATTEMPTS');
  const n = Math.min(20, finished);
  const pw = 8;
  const gap = 2.4;
  let landed = 0;
  for (let i = 0; i < 20; i++) {
    const x = c.x + 10 + i * (pw + gap);
    const y = c.y + 32;
    const k = i - (20 - n); // oldest at the left, newest at the right
    ctx.beginPath();
    roundRectPath(ctx, x, y, pw, 18, 2);
    if (k >= 0) {
      const v = ring[(finished - n + k) % 20];
      if (v) landed++;
      ctx.fillStyle = v ? OUT.landed : OUT.crashed;
      ctx.fill();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
  }
  if (n === 0) {
    text(ctx, 'waiting for the first one', c.x + 10, c.y + 72, { size: 16, weight: 700, color: PAL.ink2, maxW: c.w - 20 });
    return;
  }
  text(ctx, String(landed), c.x + 10, c.y + 74, { size: 26, weight: 700, font: FONT.num, color: PAL.turqDark });
  const w = ctx.measureText(String(landed)).width;
  text(ctx, `of ${n} landed`, c.x + 16 + w, c.y + 74, { size: 16, weight: 700, color: PAL.ink, maxW: c.w - 28 - w });
}

function niceMax(n) {
  let m = 1000;
  while (m < n * 1.02) m *= m < 4000 ? 2 : 2.5;
  return m;
}

/** The practice landing rate (last 50 practice attempts) against practice attempts so far. */
export function drawCurve(ctx, history, episodes, rate) {
  const c = CARD.curve;
  text(ctx, 'PRACTICE LANDING RATE', c.x + 10, c.y + 22, { size: 13, weight: 700, color: PAL.ink2, maxW: 142 });
  text(ctx, `${Math.round(rate * 100)}%`, c.x + c.w - 10, c.y + 24, { size: 18, weight: 700, font: FONT.num, color: PAL.turqDark, align: 'right', maxW: 56 });
  const x0 = c.x + 44;
  const x1 = c.x + c.w - 12;
  const y0 = c.y + 36; // 100%
  const y1 = c.y + 90; // 0%
  const xmax = niceMax(episodes);
  const X = (e) => x0 + (e / xmax) * (x1 - x0);
  const Y = (r) => y1 - r * (y1 - y0);
  // axes and the 50% line
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = PAL.sandLine;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(x0, Y(0.5)); ctx.lineTo(x1, Y(0.5)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = PAL.ink2;
  ctx.beginPath(); ctx.moveTo(x0, y0 - 2); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
  text(ctx, '100%', c.x + 38, y0 + 5, { size: 13, weight: 600, color: PAL.ink2, align: 'right' });
  text(ctx, '50%', c.x + 38, Y(0.5) + 5, { size: 13, weight: 600, color: PAL.ink2, align: 'right' });
  text(ctx, '0%', c.x + 38, y1 + 5, { size: 13, weight: 600, color: PAL.ink2, align: 'right' });
  text(ctx, '0', x0, y1 + 20, { size: 13, weight: 600, color: PAL.ink2 });
  text(ctx, `${fmt(xmax)} attempts`, x1, y1 + 20, { size: 13, weight: 600, color: PAL.ink2, align: 'right' });
  // the curve: one point after every round of learning, thinned if the run gets long
  const stride = Math.max(1, Math.ceil(history.length / 160));
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PAL.turqDark;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  for (let i = stride - 1; i < history.length; i += stride) ctx.lineTo(X(history[i].episodes), Y(history[i].rate));
  ctx.lineTo(X(episodes), Y(rate));
  ctx.stroke();
  ctx.beginPath(); ctx.arc(X(episodes), Y(rate), 4, 0, TAU);
  ctx.fillStyle = PAL.turq;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke();
}

export const VALUE_RANGE = [-12, 32]; // the critic's value, from "expects a crash" to "expects a landing"

/** The critic's value as a needle on a gauge, and its value through the current attempt. */
export function drawExpect(ctx, values, value, outcome) {
  const c = CARD.expect;
  title(ctx, c, 'WHAT IT EXPECTS');
  const sign = value >= 0 ? '+' : '-';
  text(ctx, `${sign}${Math.abs(value).toFixed(1)}`, c.x + c.w - 10, c.y + 23, { size: 16, weight: 700, font: FONT.num, color: PAL.ink, align: 'right' });
  const gx = c.x + 12;
  const gw = 20;
  const gy0 = c.y + 34;
  const gy1 = c.y + c.h - 12;
  const [lo, hi] = VALUE_RANGE;
  const Y = (v) => gy1 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (gy1 - gy0);
  // three flat zones: a crash, a toss-up, a landing
  const zones = [[hi, 10, PAL.turqLight], [10, 0, PAL.sand], [0, lo, '#e6a58f']];
  for (const [a, b, col] of zones) {
    ctx.fillStyle = col;
    ctx.fillRect(gx, Y(a), gw, Y(b) - Y(a));
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.ink;
  ctx.strokeRect(gx, gy0, gw, gy1 - gy0);
  // the needle
  const ny = Y(value);
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(gx - 3, ny); ctx.lineTo(gx + gw + 3, ny); ctx.stroke();
  arrow(ctx, gx + gw + 9, ny, 'left', 5.5, PAL.ink);
  // the trace of this attempt
  const tx0 = gx + gw + 26;
  const tx1 = c.x + c.w - 10;
  const n = values.length;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = PAL.sandLine;
  ctx.beginPath(); ctx.moveTo(tx0, Y(0)); ctx.lineTo(tx1, Y(0)); ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, 'landing', tx1, gy0 + 11, { size: 12, weight: 600, color: PAL.turqDark, align: 'right' });
  text(ctx, 'crash', tx1, gy1 - 3, { size: 12, weight: 600, color: PAL.crash, align: 'right' });
  if (n > 1) {
    const span = Math.max(160, n);
    const X = (i) => tx0 + (i / span) * (tx1 - tx0);
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PAL.ink;
    ctx.beginPath();
    for (let i = 0; i < n; i++) (i ? ctx.lineTo(X(i), Y(values[i])) : ctx.moveTo(X(i), Y(values[i])));
    ctx.stroke();
    ctx.beginPath(); ctx.arc(X(n - 1), Y(values[n - 1]), 3.6, 0, TAU);
    ctx.fillStyle = outcome === 'landed' ? PAL.turq : outcome === 'crashed' ? PAL.crash : PAL.sunset;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

const ACTION_COLORS = [PAL.sandLine, PAL.turq, PAL.sunset, PAL.turq];
const ACTION_NAMES = ['idle', 'left', 'main', 'right'];

/** The policy's four action probabilities, with the one it just picked marked. */
export function drawBars(ctx, probs, chosen) {
  const c = CARD.bars;
  title(ctx, c, 'WHAT IT WILL DO');
  for (let i = 0; i < 4; i++) {
    const y = c.y + 34 + i * 17.5;
    const on = i === chosen;
    text(ctx, ACTION_NAMES[i], c.x + 22, y + 11, { size: 13, weight: on ? 800 : 600, color: PAL.ink });
    if (on) arrow(ctx, c.x + 14, y + 6.5, 'right', 4.2, PAL.ink);
    const bx = c.x + 66;
    const bw = 108;
    ctx.fillStyle = PAL.sand;
    ctx.fillRect(bx, y, bw, 13);
    ctx.fillStyle = ACTION_COLORS[i];
    ctx.fillRect(bx, y, bw * probs[i], 13);
    ctx.lineWidth = on ? 2.2 : 1.5;
    ctx.strokeStyle = PAL.ink;
    ctx.strokeRect(bx, y, bw, 13);
    text(ctx, `${Math.round(probs[i] * 100)}%`, c.x + c.w - 10, y + 11, { size: 13, weight: 700, font: FONT.num, color: PAL.ink, align: 'right' });
  }
}

/** Practice counters and what this world is. */
export function drawFoot(ctx, info) {
  const c = CARD.foot;
  const lines = [
    `${fmt(info.attempts)} practice attempts`,
    info.training ? `brain v${info.version} · ${info.perSec >= 1000 ? `${(info.perSec / 1000).toFixed(1)}k` : fmt(info.perSec)} decisions/s` : `brain v${info.version} · practice is over`,
    'free fuel, but burning it costs points',
  ];
  lines.forEach((l, i) => text(ctx, l, c.x + 10, c.y + 15 + i * 16, { size: 13, weight: i === 0 ? 700 : 600, color: i === 0 ? PAL.ink : PAL.ink2, maxW: c.w - 20 }));
}

function button(ctx, b, label, { active = false, size = 18 } = {}) {
  roundRectPath(ctx, b.x, b.y, b.w, b.h, 7);
  ctx.fillStyle = active ? PAL.sunset : PAL.paper;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke();
  text(ctx, label, b.x + b.w / 2, b.y + b.h / 2 + size * 0.34, { size, weight: 800, color: PAL.ink, align: 'center', maxW: b.w - 12 });
}

export function drawButtons(ctx, speed, touch) {
  for (const b of BUTTONS.speeds) button(ctx, b, b.label, { active: b.speed === speed, size: 19 });
  button(ctx, BUTTONS.newBrain, touch ? 'NEW BRAIN' : 'NEW BRAIN (R)', { size: 15 });
  button(ctx, BUTTONS.end, touch ? 'END' : 'END (ESC)', { size: 15 });
}
