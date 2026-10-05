// Drawing for UFO Evolution: the field, the flock, the HUD, the live brain
// panel and the fitness sparkline. Everything here reads simulation state and
// never changes it. Flat colors: the Lab's night room plus sunset accents.
import { drawText } from '../../engine/font.js';
import { makeSprite, makeGlowSprite } from '../../engine/sprites.js';
import { INPUTS, HIDDEN, INPUT_LABELS, layout } from './brain.js';
import { PHYS, GA } from './sim.js';

export const C = {
  bg: '#150f24',
  surface: '#211836',
  panel: 'rgba(21, 15, 36, 0.84)',
  line: 'rgba(245, 238, 242, 0.14)',
  lineStrong: 'rgba(245, 238, 242, 0.28)',
  ink: '#f5eef2',
  ink2: '#cdc1d3',
  ink3: '#a093ab',
  amber: '#ffb547',
  ember: '#ff7a45',
  bloom: '#ff5c93',
  ufo: '#c084fc', // Flappy UFO's purple, so the flock reads as Flappy's kin
  ufoRing: '#e879f9',
  pipe: '#0f9e70',
  pipeLip: '#34d399',
};

// --- cached pixel-font text (drawText is per-pixel fillRects) ---
const textCache = new Map();
export function text(ctx, str, x, y, { color = C.ink, scale = 2, align = 'left', alpha = 1 } = {}) {
  str = String(str);
  const key = `${str}|${color}|${scale}`;
  let spr = textCache.get(key);
  if (!spr) {
    if (textCache.size > 300) textCache.clear();
    const w = Math.max(1, str.length * 8 * scale);
    spr = makeSprite(w, 8 * scale, (g) => drawText(g, str, 0, 0, { color, scale }));
    textCache.set(key, spr);
  }
  let dx = x;
  if (align === 'right') dx = x - spr.width;
  else if (align === 'center') dx = x - spr.width / 2;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(spr, Math.round(dx), Math.round(y));
  if (alpha !== 1) ctx.globalAlpha = 1;
  return spr.width;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function panel(ctx, x, y, w, h, fill = C.panel) {
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// --- layout (800 x 500 logical) ---
export const LAYOUT = {
  hud: { x: 136, y: 10, w: 414, h: 58 },
  brain: { x: 560, y: 10, w: 230, h: 190 },
  spark: { x: 560, y: 208, w: 230, h: 96 },
  speeds: [1, 2, 5, 10].map((m, i) => ({ mult: m, label: `${m}X`, x: 136 + i * 60, y: 452, w: 54, h: 38 })),
  reset: { label: 'RESET', x: 612, y: 452, w: 100, h: 38 },
  end: { label: 'END', x: 718, y: 452, w: 72, h: 38 },
};

export function hit(btn, x, y) {
  return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
}

export function createView(ctx, W, H) {
  const R = PHYS.radius;
  const ufoSprite = makeSprite(R * 2 + 16, R * 2 + 4, (g, w, h) => {
    g.beginPath();
    g.arc(w / 2, h / 2, R, 0, Math.PI * 2);
    g.fillStyle = C.ufo;
    g.fill();
    g.beginPath();
    g.ellipse(w / 2, h / 2 + 2, R + 6, R / 2, 0, 0, Math.PI * 2);
    g.strokeStyle = C.ufoRing;
    g.lineWidth = 2;
    g.stroke();
  });
  const glowPad = 16;
  const leaderSprite = makeGlowSprite(R * 2 + 16, R * 2 + 4, glowPad, C.amber, 14, (g, w, h) => {
    g.beginPath();
    g.arc(w / 2, h / 2, R, 0, Math.PI * 2);
    g.fillStyle = C.amber;
    g.fill();
    g.beginPath();
    g.ellipse(w / 2, h / 2 + 2, R + 6, R / 2, 0, 0, Math.PI * 2);
    g.strokeStyle = C.ember;
    g.lineWidth = 2;
    g.stroke();
  });

  const stars = [
    { count: 40, speed: 0.3, size: 1, alpha: 0.3 },
    { count: 25, speed: 0.6, size: 1.5, alpha: 0.5 },
    { count: 12, speed: 1.0, size: 2, alpha: 0.8 },
  ].map((l) => ({ ...l, stars: Array.from({ length: l.count }, () => ({ x: Math.random() * W, y: Math.random() * H })) }));

  function background(steps) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    const drift = Math.min(steps, 3);
    for (const l of stars) {
      ctx.globalAlpha = l.alpha;
      for (const s of l.stars) {
        s.x -= l.speed * drift;
        if (s.x < 0) s.x += W;
        ctx.fillRect(s.x, s.y, l.size, l.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function pipes(sim) {
    const pw = PHYS.pipeWidth;
    for (const p of sim.pipes) {
      const bottom = p.top + p.gap;
      ctx.fillStyle = C.pipe;
      ctx.fillRect(p.x, 0, pw, p.top);
      ctx.fillRect(p.x, bottom, pw, H - bottom);
      ctx.fillStyle = C.pipeLip;
      ctx.fillRect(p.x, p.top - 3, pw, 3);
      ctx.fillRect(p.x, bottom, pw, 3);
    }
  }

  function flock(sim, leader) {
    const x = PHYS.ufoX;
    const hw = ufoSprite.width / 2;
    const hh = ufoSprite.height / 2;
    ctx.globalAlpha = 0.34;
    for (const u of sim.ufos) {
      if (!u.alive || u === leader) continue;
      ctx.drawImage(ufoSprite, x - hw, u.y - hh);
    }
    ctx.globalAlpha = 1;
    if (!leader || !leader.alive) return;
    // Leader: amber, glowing, with Flappy's squash and stretch and a thrust
    // flame while its network says flap.
    const lean = Math.max(-1, Math.min(1, leader.v / -PHYS.thrust));
    const sx = Math.max(0.9, Math.min(1.15, 1 + lean * 0.15));
    const sy = Math.max(0.9, Math.min(1.15, 1 - lean * 0.15));
    ctx.save();
    ctx.translate(x, leader.y);
    if (leader.flap) {
      ctx.fillStyle = C.ember;
      ctx.beginPath();
      ctx.moveTo(-6, 9);
      ctx.lineTo(6, 9);
      ctx.lineTo(0, 22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.scale(sx, sy);
    ctx.drawImage(leaderSprite, -leaderSprite.width / 2, -leaderSprite.height / 2);
    ctx.restore();
  }

  function rings(list) {
    ctx.lineWidth = 2;
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      const t = r.life / r.max;
      ctx.globalAlpha = t * 0.7;
      ctx.strokeStyle = r.color;
      ctx.beginPath();
      ctx.arc(r.x, r.y, R + (1 - t) * 14, 0, Math.PI * 2);
      ctx.stroke();
      r.life--;
      if (r.life <= 0) list.splice(i, 1);
    }
    ctx.globalAlpha = 1;
  }

  function stat(x, y, label, value, color) {
    text(ctx, label, x, y, { color: C.ink3, scale: 2 });
    text(ctx, value, x, y + 22, { color, scale: 3 });
  }

  function hud(sim, sessionBest, recordFlash) {
    const b = LAYOUT.hud;
    panel(ctx, b.x, b.y, b.w, b.h);
    const x = b.x + 12;
    const y = b.y + 8;
    // GEN | ALIVE / TOTAL | BEST (pipes, this generation) | RECORD (all-time)
    stat(x, y, 'GEN', sim.gen, C.amber);
    stat(x + 64, y, 'ALIVE', `${sim.alive}/${sim.ufos.length}`, C.ink);
    stat(x + 200, y, 'BEST', sim.pipesPassed, C.ink);
    stat(x + 290, y, 'RECORD', sessionBest, recordFlash > 0 && (recordFlash >> 2) % 2 === 0 ? C.bloom : C.amber);
  }

  // The live network of the leading UFO: weights as lines (amber positive,
  // pink negative; thicker and brighter = larger), nodes filled by their
  // current activation.
  function brain(u) {
    const b = LAYOUT.brain;
    panel(ctx, b.x, b.y, b.w, b.h);
    text(ctx, 'BEST BRAIN', b.x + 10, b.y + 8, { color: C.ink, scale: 2 });
    if (!u) return;
    const g = u.genome;
    const top = b.y + 38;
    const bot = b.y + b.h - 14;
    const xi = b.x + 48;
    const xh = b.x + 126;
    const xo = b.x + 196;
    const yi = (i) => top + 4 + (i * (bot - top - 8)) / (INPUTS - 1);
    const yh = (h) => top + (h * (bot - top)) / (HIDDEN - 1);
    const yo = (top + bot) / 2;

    ctx.lineCap = 'round';
    for (let h = 0; h < HIDDEN; h++) {
      for (let i = 0; i < INPUTS; i++) {
        edge(xi, yi(i), xh, yh(h), g[layout.W1 + h * INPUTS + i], u.inputs[i]);
      }
    }
    for (let h = 0; h < HIDDEN; h++) edge(xh, yh(h), xo, yo, g[layout.W2 + h], u.hidden[h]);
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';

    for (let i = 0; i < INPUTS; i++) {
      node(xi, yi(i), 7, Math.max(-1, Math.min(1, u.inputs[i])));
      text(ctx, INPUT_LABELS[i], xi - 12, yi(i) - 4, { color: C.ink3, scale: 1, align: 'right' });
    }
    for (let h = 0; h < HIDDEN; h++) node(xh, yh(h), 6, u.hidden[h]);
    // Output: sigmoid in [0, 1]; lit amber past 0.5 (the flap threshold).
    const o = u.out;
    ctx.beginPath();
    ctx.arc(xo, yo, 10, 0, Math.PI * 2);
    ctx.fillStyle = C.surface;
    ctx.fill();
    ctx.globalAlpha = 0.25 + 0.75 * o;
    ctx.beginPath();
    ctx.arc(xo, yo, 4 + 6 * o, 0, Math.PI * 2);
    ctx.fillStyle = u.flap ? C.amber : C.ink3;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(xo, yo, 10, 0, Math.PI * 2);
    ctx.strokeStyle = u.flap ? C.amber : C.lineStrong;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, 'FLAP', xo, yo + 16, { color: u.flap ? C.amber : C.ink3, scale: 1, align: 'center' });
  }

  function edge(x1, y1, x2, y2, w, a) {
    const mag = Math.min(1, Math.abs(w) / 3);
    const live = 0.35 + 0.65 * Math.min(1, Math.abs(a));
    ctx.globalAlpha = (0.12 + 0.7 * mag) * live;
    ctx.strokeStyle = w >= 0 ? C.amber : C.bloom;
    ctx.lineWidth = 0.6 + 3 * mag;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function node(x, y, r, a) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = C.surface;
    ctx.fill();
    const m = Math.min(1, Math.abs(a));
    if (m > 0.02) {
      ctx.globalAlpha = 0.3 + 0.7 * m;
      ctx.beginPath();
      ctx.arc(x, y, r * (0.35 + 0.65 * m), 0, Math.PI * 2);
      ctx.fillStyle = a >= 0 ? C.amber : C.bloom;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = C.lineStrong;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Best (amber) and mean (muted) fitness per finished generation, on a fixed
  // 40-slot axis so the curve grows left to right toward the finish.
  function sparkline(history, box = LAYOUT.spark, { title = 'BEST FITNESS', scale = 2 } = {}) {
    const b = box;
    panel(ctx, b.x, b.y, b.w, b.h);
    text(ctx, title, b.x + 10, b.y + 8, { color: C.ink, scale });
    const px = b.x + 12;
    const pw = b.w - 24;
    const py = b.y + 14 + 8 * scale;
    const ph = b.y + b.h - 10 - py;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py + ph + 0.5);
    ctx.lineTo(px + pw, py + ph + 0.5);
    ctx.stroke();
    if (!history.length) {
      text(ctx, 'FIRST FLOCK FLYING', px + pw / 2, py + ph / 2 - 4, { color: C.ink3, scale: 1, align: 'center' });
      return;
    }
    let max = 1000;
    for (const s of history) if (s.bestFitness > max) max = s.bestFitness;
    const slots = GA.maxGenerations - 1;
    const X = (i) => px + (i / slots) * pw;
    const Y = (f) => py + ph - (f / max) * ph;
    text(ctx, String(Math.round(max)), px, py - 2, { color: C.ink3, scale: 1 });

    ctx.strokeStyle = C.ink3;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    history.forEach((s, i) => (i ? ctx.lineTo(X(i), Y(s.meanFitness)) : ctx.moveTo(X(i), Y(s.meanFitness))));
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    history.forEach((s, i) => (i ? ctx.lineTo(X(i), Y(s.bestFitness)) : ctx.moveTo(X(i), Y(s.bestFitness))));
    ctx.stroke();
    const last = history[history.length - 1];
    ctx.fillStyle = C.amber;
    ctx.beginPath();
    ctx.arc(X(history.length - 1), Y(last.bestFitness), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function button(btn, active) {
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 6);
    ctx.fillStyle = active ? C.amber : C.panel;
    ctx.fill();
    ctx.strokeStyle = active ? C.amber : C.lineStrong;
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 - 8, { color: active ? C.bg : C.ink, scale: 2, align: 'center' });
  }

  function controls(speed) {
    for (const b of LAYOUT.speeds) button(b, b.mult === speed);
    button(LAYOUT.reset, false);
    button(LAYOUT.end, false);
  }

  function banner(str, alpha, sub) {
    if (alpha <= 0) return;
    text(ctx, str, W / 2 - 40, 200, { color: C.ink, scale: 4, align: 'center', alpha });
    if (sub) text(ctx, sub, W / 2 - 40, 242, { color: C.amber, scale: 2, align: 'center', alpha });
  }

  function summary(lines, sim, blink) {
    ctx.fillStyle = 'rgba(21, 15, 36, 0.72)';
    ctx.fillRect(0, 0, W, H);
    const w = 620;
    const h = 330;
    const x = (W - w) / 2;
    const y = (H - h) / 2 - 10;
    panel(ctx, x, y, w, h, 'rgba(33, 24, 54, 0.97)');
    text(ctx, 'EVOLUTION COMPLETE', W / 2, y + 22, { color: C.amber, scale: 3, align: 'center' });
    lines.forEach((l, i) => text(ctx, l, W / 2, y + 66 + i * 26, { color: i === 0 ? C.ink : C.ink2, scale: 2, align: 'center' }));
    sparkline(sim.history, { x: x + 40, y: y + 66 + lines.length * 26 + 4, w: w - 80, h: 92 }, { title: 'BEST FITNESS PER GEN', scale: 1 });
    if (blink) text(ctx, 'PRESS ANY KEY OR TAP', W / 2, y + h - 24, { color: C.ink3, scale: 2, align: 'center' });
  }

  return { background, pipes, flock, rings, hud, brain, sparkline, controls, banner, summary };
}
