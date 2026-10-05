// Dust Devil Pinball drawing. The still table (paper, rails, decals) is painted once into an
// offscreen canvas; each tick only the moving parts are drawn on top of it. Flat ink-and-paper
// style, shapes are read straight from table.js so what you see is what the ball hits.
import { drawText } from '../../engine/font.js';
import { PAL, MONO, TAU, rr, rail, disc, mulberry } from './gfx.js';
import { BALL_R, FELT, ORBIT, GATE_ANGLE } from './table.js';

const DEG = Math.PI / 180;

// ------------------------------------------------------------------ the still table

function scenery(c, T) {
  const rng = mulberry(11);
  // a few stars in the dark corners
  c.fillStyle = PAL.plumLine;
  for (let i = 0; i < 46; i++) {
    const x = rng() * T.W, y = 50 + rng() * 230;
    const d = Math.hypot(x - T.ARCH.cx, y - T.ARCH.cy);
    if (d < T.ARCH.r + 18) continue;
    const s = rng() < 0.25 ? 3 : 2;
    c.fillRect(Math.round(x), Math.round(y), s, s);
  }
  // a saguaro silhouette in the upper left corner
  c.fillStyle = PAL.plumDeep;
  c.strokeStyle = PAL.plumLine;
  c.lineWidth = 1.5;
  rr(c, 22, 92, 11, 58, 5); c.fill(); c.stroke();
  rr(c, 9, 106, 6, 22, 3); c.fill(); c.stroke();
  rr(c, 9, 122, 17, 6, 3); c.fill(); c.stroke();
  rr(c, 36, 100, 6, 24, 3); c.fill(); c.stroke();
  rr(c, 29, 118, 13, 6, 3); c.fill(); c.stroke();
  // and a crescent moon on the right
  c.fillStyle = PAL.sandLine;
  c.beginPath(); c.arc(420, 104, 12, 0, TAU); c.fill();
  c.fillStyle = PAL.plumDeep;
  c.beginPath(); c.arc(425, 100, 11, 0, TAU); c.fill();
}

function speckle(c, T) {
  const rng = mulberry(5);
  c.fillStyle = PAL.sandLine;
  c.globalAlpha = 0.55;
  for (let i = 0; i < 200; i++) {
    const x = T.WALL_L + rng() * (T.WALL_R - T.WALL_L), y = 55 + rng() * (T.H - 55);
    c.fillRect(Math.round(x), Math.round(y), rng() < 0.2 ? 3 : 2, 2);
  }
  c.globalAlpha = 1;
}

function swirl(c, x, y, r, turns, color, width) {
  c.beginPath();
  const n = 90;
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = u * turns * TAU - Math.PI / 2, rad = 3 + u * r;
    const px = x + Math.cos(a) * rad * 1.0, py = y + Math.sin(a) * rad * 0.62;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
  c.stroke();
}

function chevron(c, x, y, ang, size, color, lw = 2.5) {
  c.save();
  c.translate(x, y); c.rotate(ang);
  c.beginPath();
  c.moveTo(-size * 0.6, -size); c.lineTo(size * 0.5, 0); c.lineTo(-size * 0.6, size);
  c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
  c.stroke();
  c.restore();
}

function decals(c, T) {
  const A = T.ARCH, LANE = T.LANE;
  // the orbit lane's floor
  c.beginPath();
  c.arc(A.cx, A.cy, A.r, ORBIT.a0, ORBIT.a1);
  c.arc(A.cx, A.cy, ORBIT.r + 3, ORBIT.a1, ORBIT.a0, true);
  c.closePath();
  c.fillStyle = PAL.turqLight; c.globalAlpha = 0.6; c.fill(); c.globalAlpha = 1;
  // the sand drift up the left wall (soft: a ball thrown at it slides on up into the orbit)
  c.fillStyle = PAL.turqLight; c.globalAlpha = 0.4;
  c.fillRect(T.WALL_L, FELT.y0, 17, FELT.y1 - FELT.y0);
  c.globalAlpha = 1;
  c.fillStyle = PAL.sandLine;
  for (let y = FELT.y0 + 6; y < FELT.y1; y += 9) { c.fillRect(T.WALL_L + 3 + ((y * 7) % 11), y, 2, 2); c.fillRect(T.WALL_L + 9 + ((y * 5) % 6), y + 4, 2, 2); }
  for (const y of [300, 352, 404]) chevron(c, T.WALL_L + 9, y, -Math.PI / 2, 4.2, PAL.turqDark, 2.2);

  // the shooter lane: straight part and the curve round the arch
  c.fillStyle = PAL.sandDark;
  c.fillRect(LANE.x0, A.cy, LANE.x1 - LANE.x0, 700 - A.cy);
  c.beginPath();
  c.arc(A.cx, A.cy, A.r, GATE_ANGLE, TAU);
  c.arc(A.cx, A.cy, A.r - 28, TAU, GATE_ANGLE, true);
  c.closePath(); c.fill();
  for (let y = 650; y > 300; y -= 52) chevron(c, LANE.cx, y, -Math.PI / 2, 6.5, PAL.sandLine, 2.5);

  // a low sun and mesas behind the title: a landscape printed on the playfield
  c.fillStyle = '#efd7a4';
  c.beginPath(); c.arc(208, 452, 58, Math.PI, TAU); c.fill();
  c.fillStyle = '#e6cd9a';
  c.beginPath();
  c.moveTo(14, 452); c.lineTo(14, 432); c.lineTo(34, 432); c.lineTo(42, 420); c.lineTo(78, 420); c.lineTo(88, 432); c.lineTo(110, 432); c.lineTo(118, 446); c.lineTo(130, 452);
  c.moveTo(286, 452); c.lineTo(296, 440); c.lineTo(322, 440); c.lineTo(330, 426); c.lineTo(366, 426); c.lineTo(374, 438); c.lineTo(404, 438); c.lineTo(404, 452);
  c.closePath(); c.fill();
  c.fillStyle = '#ddc48f'; c.fillRect(14, 452, 391, 6);

  // the dust devil, painted large behind the middle of the table
  swirl(c, 208, 520, 70, 2.6, PAL.sand, 7);
  swirl(c, 208, 520, 70, 2.6, PAL.sandDark, 2);
  c.fillStyle = PAL.sandLine;
  for (const [x, y, k] of [[116, 560, 3], [138, 590, 2], [296, 585, 3], [320, 548, 2], [98, 528, 2], [312, 492, 3]]) c.fillRect(x, y, k, k);

  // the title, stamped in the pixel font
  const word = 'DUST DEVIL';
  const sc = 4, w = word.length * 8 * sc, x0 = Math.round(208 - w / 2), y0 = 396;
  c.globalAlpha = 0.9;
  drawText(c, word, x0 + 3, y0 + 3, { color: PAL.sandLine, scale: sc });
  drawText(c, word, x0, y0, { color: PAL.sandDark, scale: sc });
  c.globalAlpha = 1;
  c.fillStyle = PAL.sandLine;
  c.fillRect(x0 + 8, y0 + 38, w - 16, 2);

  // bases under the pop bumpers
  for (const b of T.bumpers) {
    disc(c, b.x, b.y, b.r + 5, PAL.sand, true, 2);
    c.fillStyle = PAL.sandLine;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      c.fillRect(Math.round(b.x + Math.cos(a) * (b.r + 2.6)) - 1, Math.round(b.y + Math.sin(a) * (b.r + 2.6)) - 1, 2, 2);
    }
  }
  // the plate the drop targets stand in
  {
    const t0 = T.targets[0], t2 = T.targets[T.targets.length - 1];
    const cx = (t0.ax + t0.bx + t2.ax + t2.bx) / 4, cy = (t0.ay + t0.by + t2.ay + t2.by) / 4;
    const ang = Math.atan2(t2.by - t0.ay, t2.bx - t0.ax);
    c.save(); c.translate(cx, cy); c.rotate(ang - Math.PI / 2);
    rr(c, -16, -62, 32, 124, 8); c.fillStyle = PAL.sand; c.fill(); c.strokeStyle = PAL.ink; c.lineWidth = 2; c.stroke();
    c.restore();
  }
  // the spinner's plate
  for (const s of T.spinners) {
    disc(c, (s.ax + s.bx) / 2, (s.ay + s.by) / 2, 14.5, PAL.turqLight, true, 2);
  }
  // inlane chevrons, pointing down towards the flippers
  for (const [x, y, a] of [[66, 548, 1.1], [86, 596, 0.5], [350, 548, Math.PI - 1.1], [330, 596, Math.PI - 0.5]]) chevron(c, x, y, a, 7.5, PAL.sandLine, 3);
}

function frame(c, T) {
  const A = T.ARCH;
  // outer frame: the arch and both sides, one thick red-rock rail
  c.beginPath();
  c.moveTo(T.WALL_L - 5, T.H + 10);
  c.lineTo(T.WALL_L - 5, A.cy);
  c.arc(A.cx, A.cy, A.r + 5, Math.PI, TAU);
  c.lineTo(T.WALL_R + 5, T.H + 10);
  rail(c, 3, PAL.redrock);
}

const RAIL_FILL = { wall: PAL.terracotta, rubber: PAL.redrock, post: PAL.sage };

/** Add one wall piece to the current path (a capsule, a post or a rail along an arc). */
function railPath(c, s) {
  if (s.k === 'seg') {
    if (s.ax === s.bx && s.ay === s.by) { c.moveTo(s.ax + 0.01, s.ay); c.lineTo(s.ax, s.ay); } else { c.moveTo(s.ax, s.ay); c.lineTo(s.bx, s.by); }
  } else if (s.k === 'arc' && s.side === 'band') {
    c.moveTo(s.cx + Math.cos(s.a0) * s.rad, s.cy + Math.sin(s.a0) * s.rad);
    c.arc(s.cx, s.cy, s.rad, s.a0, s.a1);
  }
}

/**
 * Draw the rails of one material in two passes, every outline first and then every fill, so where
 * two pieces meet (a straight rail running into an arc) they merge instead of showing the joint.
 */
function drawRails(c, T, mat) {
  const list = T.statics.filter((s) => s.mat === mat && (s.k === 'seg' || (s.k === 'arc' && s.side === 'band')));
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const pass of [0, 1]) {
    for (const s of list) {
      const half = s.k === 'seg' ? s.r : s.t;
      c.beginPath(); railPath(c, s);
      c.strokeStyle = pass === 0 ? PAL.ink : RAIL_FILL[mat];
      c.lineWidth = pass === 0 ? half * 2 + 4 : half * 2;
      c.stroke();
    }
  }
}

function apron(c, T) {
  c.fillStyle = PAL.plum;
  c.fillRect(T.WALL_L, 690, T.LANE.x0 - 3 - T.WALL_L, T.H - 690);
  c.strokeStyle = PAL.ink; c.lineWidth = 2;
  c.beginPath(); c.moveTo(T.WALL_L, 690); c.lineTo(T.LANE.x0 - 3, 690); c.stroke();
  c.fillStyle = PAL.plumLine;
  for (let x = 28; x < 400; x += 18) c.fillRect(x, 700, 8, 2);
}

/** Paint the whole still table into an offscreen canvas. */
export function buildStatic(T) {
  const cv = document.createElement('canvas');
  cv.width = T.W; cv.height = T.H;
  const c = cv.getContext('2d');
  const A = T.ARCH;

  c.fillStyle = PAL.plumDeep; c.fillRect(0, 0, T.W, T.H);
  scenery(c, T);

  const field = new Path2D();
  field.arc(A.cx, A.cy, A.r, Math.PI, TAU);
  field.lineTo(T.WALL_R, T.H); field.lineTo(T.WALL_L, T.H); field.closePath();
  c.fillStyle = PAL.paper; c.fill(field);
  c.save(); c.clip(field);
  speckle(c, T);
  decals(c, T);
  apron(c, T);
  c.restore();

  frame(c, T);

  // the lane floor
  c.beginPath(); c.moveTo(T.LANE.x0, 703); c.lineTo(T.LANE.x1, 703); rail(c, 3, PAL.redrock);

  // slingshot bodies, under their rails
  for (const s of T.slings) {
    c.beginPath(); c.moveTo(s.ax, s.ay); c.lineTo(s.cx, s.cy); c.lineTo(s.bx, s.by); c.closePath();
    c.fillStyle = PAL.sand; c.fill();
  }

  // rails: guides first, then rubber, then posts
  for (const mat of ['wall', 'rubber', 'post']) drawRails(c, T, mat);

  // one-way gates and the flap, drawn as thin hinged ledges
  for (const g of T.gates) {
    const mx = (g.ax + g.bx) / 2, my = (g.ay + g.by) / 2;
    if (g.solid === false) continue;
    c.beginPath(); c.moveTo(g.ax, g.ay); c.lineTo(g.bx, g.by);
    rail(c, 1.6, PAL.mustard, 1.6);
    disc(c, g.ax, g.ay, 2.6, PAL.ink, false);
    // a small arrowhead showing the way through
    const tx = -g.ny, ty = g.nx;
    c.beginPath();
    c.moveTo(mx + g.nx * 15, my + g.ny * 15);
    c.lineTo(mx + g.nx * 7 + tx * 4.5, my + g.ny * 7 + ty * 4.5);
    c.lineTo(mx + g.nx * 7 - tx * 4.5, my + g.ny * 7 - ty * 4.5);
    c.closePath(); c.fillStyle = PAL.ink2; c.fill();
  }
  return cv;
}

// ------------------------------------------------------------------ moving parts

function drawBumper(c, b) {
  const k = b.flash > 0 ? b.flash / 12 : 0;
  const R = b.r * (1 + 0.07 * k);
  if (k > 0) {
    c.beginPath(); c.arc(b.x, b.y, R + 4 + (1 - k) * 9, 0, TAU);
    c.strokeStyle = PAL.paperLight; c.globalAlpha = Math.min(1, k * 1.4); c.lineWidth = 3; c.stroke(); c.globalAlpha = 1;
  }
  disc(c, b.x, b.y, R, k > 0.35 ? PAL.cactusLight : PAL.cactus, true, 2);
  // ribs and spines
  c.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.31;
    c.beginPath(); c.moveTo(b.x + Math.cos(a) * 7, b.y + Math.sin(a) * 7); c.lineTo(b.x + Math.cos(a) * (R - 2.5), b.y + Math.sin(a) * (R - 2.5));
    c.strokeStyle = PAL.cactusDark; c.lineWidth = 1.8; c.stroke();
    c.beginPath(); c.arc(b.x + Math.cos(a + 0.16) * (R - 5.5), b.y + Math.sin(a + 0.16) * (R - 5.5), 1.1, 0, TAU);
    c.fillStyle = PAL.paperLight; c.fill();
  }
  // the barrel cactus flower
  const pr = 4.3 + 1.5 * k;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    c.save(); c.translate(b.x + Math.cos(a) * pr, b.y + Math.sin(a) * pr); c.rotate(a);
    c.beginPath(); c.ellipse(0, 0, 3.6, 2.1, 0, 0, TAU);
    c.fillStyle = k > 0.3 ? '#fff3c4' : PAL.mustardLight; c.fill(); c.strokeStyle = PAL.ink; c.lineWidth = 1.2; c.stroke();
    c.restore();
  }
  disc(c, b.x, b.y, 3.1, PAL.terracotta, true, 1.4);
}

function drawSling(c, s) {
  const k = s.flash > 0 ? s.flash / 10 : 0;
  const mx = (s.ax + s.bx) / 2 + s.nx * 5 * k, my = (s.ay + s.by) / 2 + s.ny * 5 * k;
  c.beginPath(); c.moveTo(s.ax, s.ay); c.quadraticCurveTo(mx * 2 - (s.ax + s.bx) / 2, my * 2 - (s.ay + s.by) / 2, s.bx, s.by);
  c.lineCap = 'round';
  c.strokeStyle = PAL.ink; c.lineWidth = 9; c.stroke();
  c.strokeStyle = k > 0.3 ? PAL.mustardLight : PAL.terraLight; c.lineWidth = 5; c.stroke();
}

function drawTarget(c, t) {
  const cx = (t.ax + t.bx) / 2, cy = (t.ay + t.by) / 2;
  const ang = Math.atan2(t.by - t.ay, t.bx - t.ax);
  const len = Math.hypot(t.bx - t.ax, t.by - t.ay) + 2 * t.r;
  let k = 1;
  if (t.down) k = t.flash > 0 ? t.flash / 14 : 0;
  else if (t.flash > 0) k = 1 - t.flash / 14;
  c.save(); c.translate(cx, cy); c.rotate(ang);
  if (k <= 0.02) {
    // the empty slot
    rr(c, -len / 2, -t.r, len, t.r * 2, 3); c.fillStyle = PAL.sandDark; c.fill(); c.strokeStyle = PAL.ink2; c.lineWidth = 1.5; c.stroke();
  } else {
    const h = t.r * 2 * k;
    c.globalAlpha = 0.25; c.fillStyle = PAL.ink; rr(c, -len / 2 + 2, -h / 2 + 2, len, h, 3); c.fill(); c.globalAlpha = 1;
    rr(c, -len / 2, -h / 2, len, h, 3);
    c.fillStyle = t.flash > 0 && t.down ? PAL.paperLight : PAL.redrock; c.fill(); c.strokeStyle = PAL.ink; c.lineWidth = 2; c.stroke();
    if (h > 6) {
      c.strokeStyle = PAL.terracotta; c.lineWidth = Math.min(2, h * 0.22);
      c.beginPath(); c.moveTo(-len / 2 + 4, -h / 4); c.lineTo(len / 2 - 4, -h / 4); c.stroke();
      c.strokeStyle = PAL.redrockDark; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-len / 2 + 4, h / 5); c.lineTo(len / 2 - 4, h / 5); c.stroke();
    }
  }
  c.restore();
}

/** The dust devil spinner. `a` is the displayed rotation, `fast` 0..1 how fast it is going. */
function drawSpinner(c, s, a, fast) {
  const x = (s.ax + s.bx) / 2, y = (s.ay + s.by) / 2;
  c.save(); c.translate(x, y);
  if (fast > 0.05) {
    c.globalAlpha = 0.35 * fast; c.beginPath(); c.arc(0, 0, 15.5, 0, TAU); c.fillStyle = PAL.paperLight; c.fill(); c.globalAlpha = 1;
  }
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (let k = 0; k < 3; k++) {
    c.beginPath();
    for (let i = 0; i <= 10; i++) {
      const u = i / 10, ang = a + k * (TAU / 3) + u * 1.7, rad = 1.5 + u * 11;
      const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.strokeStyle = PAL.ink; c.lineWidth = 5; c.stroke();
    c.strokeStyle = PAL.turq; c.lineWidth = 2.2; c.stroke();
  }
  c.restore();
}

function flipperPath(c, f) {
  const th = Math.acos((f.r0 - f.r1) / f.len);
  c.beginPath();
  c.moveTo(f.r0 * Math.cos(th), f.r0 * Math.sin(th));
  c.lineTo(f.len + f.r1 * Math.cos(th), f.r1 * Math.sin(th));
  c.arc(f.len, 0, f.r1, th, -th, true);
  c.lineTo(f.r0 * Math.cos(th), -f.r0 * Math.sin(th));
  c.arc(0, 0, f.r0, -th, th - TAU, true);
  c.closePath();
}

function drawFlipper(c, f) {
  c.save(); c.translate(f.px, f.py); c.rotate(f.angle);
  const up = Math.cos(f.angle) > 0 ? -1 : 1; // which local side faces the top of the table
  flipperPath(c, f);
  c.fillStyle = f.held ? PAL.sunset : PAL.terracotta; c.fill();
  c.lineJoin = 'round'; c.strokeStyle = PAL.ink; c.lineWidth = 2; c.stroke();
  c.beginPath(); c.moveTo(f.r0 * 0.5, up * (f.r0 - 3.6)); c.lineTo(f.len - 2, up * (f.r1 - 2.6));
  c.strokeStyle = PAL.terraLight; c.lineWidth = 2; c.lineCap = 'round'; c.stroke();
  disc(c, 0, 0, 3.6, PAL.ink, false);
  disc(c, 0, 0, 1.3, PAL.paperLight, false);
  c.restore();
}

function drawPlunger(c, T, p, pullFrac) {
  const cx = T.LANE.cx;
  const y = p.y;
  // the spring, compressed between the head and the lane floor
  const top = y + 4, bot = 700;
  const coils = 9, amp = 7.5;
  c.beginPath(); c.moveTo(cx, top);
  for (let i = 1; i <= coils; i++) c.lineTo(cx + (i % 2 ? amp : -amp), top + ((bot - top) * (i - 0.5)) / coils);
  c.lineTo(cx, bot);
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = PAL.ink; c.lineWidth = 4.4; c.stroke();
  c.strokeStyle = pullFrac > 0.05 ? PAL.mustard : PAL.sandLine; c.lineWidth = 2; c.stroke();
  // the head
  rr(c, p.x0 - 3.5, y - 4, p.x1 - p.x0 + 7, 8, 3);
  c.fillStyle = PAL.terracotta; c.fill(); c.strokeStyle = PAL.ink; c.lineWidth = 2; c.stroke();
}

function drawBall(c, b, marks) {
  const x = b.x, y = b.y, R = BALL_R;
  c.globalAlpha = 0.3; c.fillStyle = PAL.ink;
  c.beginPath(); c.ellipse(x + 2.5, y + 4, R * 0.95, R * 0.8, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
  disc(c, x, y, R, '#eef0ef', true, 2.2);
  // flat shading: a darker crescent low right, a bright one high left
  c.lineCap = 'round';
  c.beginPath(); c.arc(x, y, R - 3, 10 * DEG, 100 * DEG);
  c.strokeStyle = PAL.silverDark; c.lineWidth = 3.2; c.stroke();
  c.beginPath(); c.arc(x, y, R - 3.2, 190 * DEG, 262 * DEG);
  c.strokeStyle = '#ffffff'; c.lineWidth = 2.2; c.stroke();
  // marks that roll with the ball
  c.fillStyle = PAL.ink2;
  for (const m of marks) {
    if (m[2] < 0.15) continue;
    c.beginPath(); c.arc(x + m[0] * (R - 3), y + m[1] * (R - 3), 0.9 + m[2] * 1.2, 0, TAU); c.fill();
  }
}

// ------------------------------------------------------------------ the view

/**
 * The renderer. `draw(ctx, g, v)` paints one frame: `g` is the rules object, `v` the view
 * state from pinball.js (time, shake, particles, hint, marks, swirl angle).
 */
export function createArt(T) {
  const still = buildStatic(T);
  const mulLabels = ['2X', '3X', '4X', '5X'];

  function laneInserts(c, g, v) {
    const blink = v.calm || Math.floor(v.t / 12) % 2 === 0;
    const showSkill = g.skill.live || (g.phase === 'serve' && !g.skill.taken);
    T.lanes.forEach((l, i) => {
      const lit = g.lanes[i];
      disc(c, l.x, l.y, 9, lit ? PAL.turq : PAL.paperLight, true, 2);
      if (lit) { c.beginPath(); c.arc(l.x - 2.5, l.y - 2.5, 3, 0, TAU); c.fillStyle = PAL.turqLight; c.fill(); }
      if (showSkill && g.skill.lane === i) {
        const col = blink ? PAL.mustard : PAL.sunset;
        c.beginPath(); c.moveTo(l.x - 8, l.y - 31); c.lineTo(l.x + 8, l.y - 31); c.lineTo(l.x, l.y - 17); c.closePath();
        c.fillStyle = col; c.fill(); c.strokeStyle = PAL.ink; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
      }
    });
  }

  function multiplierLamps(c, g) {
    c.font = `bold 11px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    mulLabels.forEach((s, k) => {
      const x = 168 + k * 38, y = 152, lit = g.mult >= k + 2;
      rr(c, x - 15, y - 9, 30, 18, 6);
      c.fillStyle = lit ? PAL.mustard : PAL.paperLight; c.fill();
      c.strokeStyle = PAL.ink; c.lineWidth = 2; c.stroke();
      c.fillStyle = lit ? PAL.ink : '#9a845c'; c.fillText(s, x, y + 0.5);
    });
  }

  function orbitArrows(c, g, v) {
    const A = T.ARCH, r = (A.r + ORBIT.r) / 2;
    const lit = g.orbitLit;
    const pulse = Math.floor(v.t / 6) % 3;
    for (let i = 0; i < 4; i++) {
      const phi = ORBIT.a0 + (7 + i * 11) * DEG;
      const x = A.cx + Math.cos(phi) * r, y = A.cy + Math.sin(phi) * r;
      const ang = phi + Math.PI / 2; // along the lane, towards the top
      let col = PAL.sandLine;
      if (lit) col = (pulse === i % 3 || pulse === (i + 1) % 3) ? (lit === 'extra' ? PAL.mustard : PAL.turqDark) : PAL.sandLine;
      chevron(c, x, y, ang, 4.4, PAL.ink, 4.6);
      chevron(c, x, y, ang, 4.4, col, 2.2);
    }
  }

  function saveShield(c, g, v) {
    if (g.save.t <= 0) return;
    const fade = g.save.t < 120 && !v.calm ? (Math.floor(v.t / 10) % 2 === 0 ? 1 : 0.25) : 1;
    c.globalAlpha = fade;
    c.beginPath(); c.moveTo(T.WALL_L + 6, 686); c.lineTo(T.LANE.x0 - 10, 686);
    c.lineCap = 'round'; c.strokeStyle = PAL.ink; c.lineWidth = 6; c.stroke();
    c.strokeStyle = PAL.turq; c.lineWidth = 2.6; c.stroke();
    c.globalAlpha = 1;
  }

  function particles(c, v) {
    for (const p of v.parts) {
      const k = p.life / p.max;
      c.globalAlpha = Math.max(0, Math.min(1, k * 1.3));
      c.fillStyle = p.color;
      if (p.kind === 'chip') { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2); c.restore(); } else { c.beginPath(); c.arc(p.x, p.y, p.r * (1.4 - k * 0.6), 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
  }

  /** Faint ghosts of where a fast ball just was, so a hard shot can be followed by eye. */
  function trail(c, b, v) {
    if (Math.hypot(b.vx, b.vy) < 450) return;
    const n = v.trail.length / 2;
    for (let i = 0; i < n - 1; i++) {
      c.globalAlpha = 0.1 + 0.09 * i;
      c.fillStyle = PAL.silverDark;
      c.beginPath(); c.arc(v.trail[i * 2], v.trail[i * 2 + 1], BALL_R * (0.55 + 0.1 * i), 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }

  function bigText(c, text, cx, y, sc, color) {
    const w = text.length * 8 * sc, x = Math.round(cx - w / 2);
    drawText(c, text, x + 3, y + 3, { color: PAL.ink, scale: sc });
    drawText(c, text, x, y, { color, scale: sc });
  }

  function hint(c, v) {
    c.font = `bold 11px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = PAL.sand;
    const txt = v.touch ? 'Hold left or right to flip. Hold to pull, let go to launch.' : 'Z and / flip.  Hold SPACE, release to launch.';
    c.fillText(txt, 208, 707, 376); // never wider than the apron, whichever font loaded
  }

  return {
    still,
    draw(c, g, v) {
      const w = g.world;
      c.drawImage(still, 0, 0);

      c.save();
      if (v.shake > 0.05) c.translate(Math.sin(v.t * 2.9) * v.shake, Math.cos(v.t * 3.7) * v.shake * 0.8);

      laneInserts(c, g, v);
      multiplierLamps(c, g);
      orbitArrows(c, g, v);
      for (const t of w.targets) drawTarget(c, t);
      for (const s of T.spinners) drawSpinner(c, s, v.swirl, Math.min(1, Math.abs(w.spinners[0].omega) / 25));
      for (const b of w.bumpers) drawBumper(c, b);
      for (const s of w.slings) drawSling(c, s);
      drawPlunger(c, T, w.plunger, w.plunger.pull);
      saveShield(c, g, v);
      for (const f of w.flippers) drawFlipper(c, f);
      if (w.ball.active) {
        trail(c, w.ball, v);
        drawBall(c, w.ball, v.marks); // the ball rolls over the flippers
      }
      particles(c, v);
      if (!g.launched && g.phase === 'serve') hint(c, v);
      c.restore();

      if (g.tilt.tilted) {
        const on = v.calm || Math.floor(v.t / 24) % 2 === 0;
        c.fillStyle = on ? 'rgba(168,64,29,0.30)' : 'rgba(168,64,29,0.16)'; c.fillRect(T.WALL_L, 56, T.WALL_R - T.WALL_L, T.H - 56);
        if (on) bigText(c, 'TILT', T.MX, 300, 7, PAL.flame);
      }
      if (g.phase === 'over') {
        c.fillStyle = 'rgba(27,20,31,0.55)'; c.fillRect(T.WALL_L, 56, T.WALL_R - T.WALL_L, T.H - 56);
        bigText(c, 'GAME', T.MX, 270, 7, PAL.paper);
        bigText(c, 'OVER', T.MX, 336, 7, PAL.paper);
      }
    },
  };
}
