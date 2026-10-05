// Dust Devil Pinball physics: one rolling ball on a tilted table, stepped at 60 Hz in fixed
// substeps. Pure module (no DOM), so Node tests drive exactly the code the browser runs.
//
// How the ball is kept honest:
//  * Every 1/60 s tick is cut into SUBSTEPS slices. At the speed limit the ball moves 2.5 px a
//    slice, a quarter of its 10 px radius, and every wall is at least 6 px thick, so it can never
//    jump over one between two checks. (Half-plane walls and the arch cannot be jumped at all:
//    a ball found on the wrong side is pushed back in.)
//  * After each slice the ball is pushed out of whatever it overlaps along the contact normal,
//    then its velocity is corrected from its speed *relative to the surface at the contact
//    point*. A flipper's surface moves at (angular speed x distance from the pivot), so a hit
//    near the tip is faster than one near the pivot, and a ball resting on a flipper that swings
//    up is thrown with the flipper's own speed.
//  * Moving parts (flippers, plunger) are kinematic: they move first, the ball is resolved
//    against them after. Friction only acts on a ball that is sliding, so a rolling ball never
//    sticks to a surface or balances on the top of a post.
import { BALL_R, TABLE } from './table.js';

export { BALL_R };
export const GRAVITY = 760; // px/s^2: the table's tilt, a rolling ball included
export const SUBSTEPS = 12;
export const TICK_DT = 1 / 60;
export const DT = TICK_DT / SUBSTEPS;
export const VMAX = 1800; // px/s: speed limit (2.5 px per substep)
export const DRAG = 0.1; // 1/s: a hair of rolling resistance
export const REST_V = 40; // approach speeds below this don't bounce
export const ROLL_V = 6; // px/s: sliding slower than this is rolling, which has no friction
export const ITERATIONS = 4;

// Surfaces: e = restitution (bounciness), mu = friction against the surface.
export const MAT = {
  wall: { e: 0.5, mu: 0.012 },
  post: { e: 0.55, mu: 0.012 },
  rubber: { e: 0.62, mu: 0.04 },
  flipper: { e: 0.3, mu: 0.06 },
  target: { e: 0.3, mu: 0.012 },
  plunger: { e: 0.05, mu: 0.02 },
  gate: { e: 0.15, mu: 0.01 },
  felt: { e: 0.15, mu: 0.03 }, // the sand-drift strip up the left wall: a ball hitting it slides on instead of bouncing off
};

export const BUMPER_KICK = 560; // px/s: a pop bumper throws the ball away at this speed
export const BUMPER_MIN = 40; // ...if it arrives at least this fast
export const SLING_KICK = 560;
export const SLING_MIN = 90;
export const TARGET_MIN = 60;
export const PULL_RATE = 1.25; // plunger pull, fraction of full travel per second
export const PLUNGE_MIN = 0.7; // the least pull that clears the shooter gate (the meter turns green here); tested
export const PLUNGER_OMEGA = 36; // rad/s: spring stiffness. launch speed = travel * pull * omega
export const SEARCH_TICKS = 240; // 4 s of barely moving before the ball is nudged free
export const SEARCH_RADIUS = 3; // px

const hit = { nx: 0, ny: 0, depth: 0, qx: 0, qy: 0, t: 0, r: 0 };

/** Does the ball at (px, py) overlap the capsule a-b (radius ra at a, rb at b)? Fills `hit`. */
function capsule(px, py, ax, ay, bx, by, ra, rb) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = 0;
  if (l2 > 1e-12) {
    t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const qx = ax + dx * t, qy = ay + dy * t;
  const r = ra + (rb - ra) * t;
  const ex = px - qx, ey = py - qy;
  const d2 = ex * ex + ey * ey;
  const lim = BALL_R + r;
  if (d2 >= lim * lim) return false;
  const d = Math.sqrt(d2);
  if (d > 1e-6) {
    hit.nx = ex / d; hit.ny = ey / d;
  } else if (l2 > 1e-12) {
    const l = Math.sqrt(l2);
    hit.nx = dy / l; hit.ny = -dx / l;
  } else {
    hit.nx = 0; hit.ny = -1;
  }
  hit.depth = lim - d; hit.qx = qx; hit.qy = qy; hit.t = t; hit.r = r;
  return true;
}

/**
 * Push the ball out along (nx, ny) by `depth`, then fix its velocity from its speed
 * relative to a surface moving at (svx, svy). Returns the approach speed (0 if it was
 * already moving away).
 */
function respond(b, nx, ny, depth, mat, svx, svy) {
  b.x += nx * depth;
  b.y += ny * depth;
  const rvx = b.vx - svx, rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const e = -vn < REST_V ? 0 : mat.e;
  const tvx = rvx - vn * nx, tvy = rvy - vn * ny;
  const tl = Math.sqrt(tvx * tvx + tvy * tvy);
  let fx = 0, fy = 0;
  // Friction only slows a ball that is sliding. A real ball rolls, so it never sticks to a surface:
  // without this threshold a ball set down within a pixel of the top of a rubber post stays there.
  if (tl > ROLL_V) {
    const cut = Math.min(tl, mat.mu * (1 + e) * -vn) / tl;
    fx = -tvx * cut; fy = -tvy * cut;
  }
  const bounce = -e * vn;
  b.vx = svx + tvx + fx + nx * bounce;
  b.vy = svy + tvy + fy + ny * bounce;
  return -vn;
}

function prepStatic(s) {
  const out = { ...s, m: MAT[s.mat] || MAT.wall };
  const pad = BALL_R + 2;
  if (s.k === 'seg') {
    out.x0 = Math.min(s.ax, s.bx) - s.r - pad; out.x1 = Math.max(s.ax, s.bx) + s.r + pad;
    out.y0 = Math.min(s.ay, s.by) - s.r - pad; out.y1 = Math.max(s.ay, s.by) + s.r + pad;
  } else if (s.k === 'wall') {
    out.dx = s.bx - s.ax; out.dy = s.by - s.ay; out.len2 = out.dx * out.dx + out.dy * out.dy;
    out.x0 = -1e9; out.x1 = 1e9; out.y0 = -1e9; out.y1 = 1e9;
  } else if (s.k === 'arc') {
    const rr = s.rad + (s.t || 0) + pad;
    out.x0 = s.cx - rr; out.x1 = s.cx + rr; out.y0 = s.cy - rr; out.y1 = s.cy + rr;
  }
  return out;
}

/** Fresh dynamic state for a table. */
export function createWorld(table = TABLE, { rng = Math.random, search = true } = {}) {
  const w = {
    table,
    rng,
    search,
    tick: 0,
    ball: {
      x: table.SPAWN.x, y: table.SPAWN.y, vx: 0, vy: 0, active: false, inLane: true,
      flipTouch: -99, flipSide: '', ax: 0, ay: 0, still: 0,
    },
    statics: table.statics.map(prepStatic),
    flippers: table.flippers.map((f) => ({ ...f, angle: f.rest, omega: 0, held: false, cool: 0 })),
    plunger: {
      ...table.PLUNGER, y: table.PLUNGER.y0, vy: 0, pull: 0, held: false, state: 'idle', t: 0, s0: 0,
    },
    bumpers: table.bumpers.map((b) => ({ ...b, flash: 0, cool: 0 })),
    slings: table.slings.map((s) => ({ ...s, flash: 0, cool: 0 })),
    targets: table.targets.map((t) => ({ ...t, down: false, flash: 0 })),
    gates: table.gates.map((g) => ({ ...g, open: 0 })),
    spinners: table.spinners.map((s) => ({ ...s, angle: 0, omega: 0, acc: 0 })),
    lanes: table.lanes.map((l) => ({ ...l, inside: false })),
    events: [],
    hitSpeed: 0, // hardest wall hit this tick, for the click sound
    stats: { searches: 0, escapes: 0, maxSpeed: 0, ticks: 0 },
  };
  w.ball.ax = w.ball.x; w.ball.ay = w.ball.y;
  w.laneGate = w.gates.find((g) => g.kind === 'lane') || null;
  return w;
}

/** Put the ball anywhere, in play. */
export function placeBall(w, x, y, vx = 0, vy = 0) {
  const b = w.ball;
  b.x = x; b.y = y; b.vx = vx; b.vy = vy;
  b.active = true; b.still = 0; b.ax = x; b.ay = y;
  for (const l of w.lanes) l.inside = (x - l.x) * (x - l.x) + (y - l.y) * (y - l.y) < l.r * l.r;
  updateInLane(w);
}

/** The ball back on the plunger, ready to launch. */
export function serveBall(w) {
  const p = w.plunger;
  p.y = p.y0; p.vy = 0; p.pull = 0; p.state = 'idle'; p.held = false;
  placeBall(w, w.table.SPAWN.x, w.table.SPAWN.y, 0, 0);
}

export function setFlipper(w, side, held) {
  for (const f of w.flippers) if (f.side === side) f.held = !!held;
}
export function setPlunger(w, held) { w.plunger.held = !!held; }

/** A jolt to the ball: the table is nudged. */
export function nudge(w, dvx, dvy) {
  const b = w.ball;
  if (!b.active || b.inLane) return false;
  b.vx += dvx; b.vy += dvy;
  return true;
}

/** Raise every drop target again (the bank resets). */
export function resetTargets(w) {
  for (const t of w.targets) { t.down = false; t.flash = 14; }
}

/** Fire the plunger at once with the given pull (0..1). */
export function launch(w, power) {
  const p = w.plunger;
  p.pull = Math.max(0, Math.min(1, power));
  p.y = p.y0 + p.travel * p.pull;
  p.state = 'pulling';
  p.held = false;
}

/**
 * Is the ball resting on the plunger head (wherever the head is, pulled back or not), moving with
 * it? Once the head fires and the ball leaves it, or while it is in flight, this is false.
 */
export function ballOnPlunger(w) {
  const b = w.ball, p = w.plunger;
  if (!b.active || !b.inLane) return false;
  const seat = p.y - p.r - BALL_R; // where a ball sitting on the head has its centre
  return Math.abs(b.y - seat) < 6 && Math.abs(b.vy - p.vy) < 90 && Math.abs(b.vx) < 60;
}

function gateSide(g, x, y) { return (x - g.ax) * g.nx + (y - g.ay) * g.ny; }

/** Did the ball's path (x0,y0)->(x1,y1) cross the gate's own segment from its open side to its blocked side? */
function gateCrossed(g, x0, y0, x1, y1) {
  const s0 = gateSide(g, x0, y0), s1 = gateSide(g, x1, y1);
  if (!(s0 <= 0 && s1 > 0)) return false;
  const t = s0 / (s0 - s1);
  const ix = x0 + (x1 - x0) * t, iy = y0 + (y1 - y0) * t;
  const u = ((ix - g.ax) * (g.bx - g.ax) + (iy - g.ay) * (g.by - g.ay)) / ((g.bx - g.ax) ** 2 + (g.by - g.ay) ** 2);
  return u >= -0.1 && u <= 1.1;
}

// The ball is "in the shooter lane" while it is in the lane's channel and has not yet
// passed the lane's one-way gate. (The orbit's flap and gate are other gates entirely.)
function updateInLane(w) {
  const b = w.ball;
  let lane = w.table.inShooter(b.x, b.y);
  if (lane && w.laneGate && gateSide(w.laneGate, b.x, b.y) > 0) lane = false;
  b.inLane = lane;
}

// ---------------------------------------------------------------- moving parts

function advanceParts(w) {
  for (const f of w.flippers) {
    const target = f.held ? f.up : f.rest;
    const diff = target - f.angle;
    if (Math.abs(diff) < 1e-9) { f.omega = 0; continue; }
    const speed = f.held ? f.wUp : f.wDown;
    const step = speed * DT;
    if (Math.abs(diff) <= step) { f.omega = diff / DT; f.angle = target; }
    else { f.omega = Math.sign(diff) * speed; f.angle += Math.sign(diff) * step; }
  }

  const p = w.plunger;
  if (p.state === 'firing') {
    p.t += DT;
    const phase = PLUNGER_OMEGA * p.t;
    if (phase >= Math.PI / 2) {
      p.vy = (p.y0 - p.y) / DT;
      p.y = p.y0; p.state = 'idle'; p.pull = 0;
      p.fired = true;
    } else {
      const ny = p.y0 + p.travel * p.s0 * Math.cos(phase);
      p.vy = (ny - p.y) / DT; p.y = ny;
    }
  } else if (p.held) {
    p.state = 'pulling';
    p.pull = Math.min(1, p.pull + PULL_RATE * DT);
    const ny = p.y0 + p.travel * p.pull;
    p.vy = (ny - p.y) / DT; p.y = ny;
  } else if (p.state === 'pulling') {
    if (p.pull < 0.02) { p.state = 'idle'; p.pull = 0; p.y = p.y0; p.vy = 0; }
    else { p.state = 'firing'; p.t = 0; p.s0 = p.pull; p.vy = 0; p.fired = false; }
  } else {
    p.vy = 0;
  }

  for (const s of w.spinners) {
    if (s.omega !== 0) {
      const decay = 1 - 0.9 * DT;
      s.omega *= decay;
      const fr = 1.5 * DT;
      if (Math.abs(s.omega) <= fr) s.omega = 0; else s.omega -= Math.sign(s.omega) * fr;
      s.angle += s.omega * DT;
      s.acc += Math.abs(s.omega) * DT;
      while (s.acc >= Math.PI) {
        s.acc -= Math.PI;
        w.events.push({ type: 'spin', i: s.i, omega: s.omega });
      }
    }
  }
}

// ----------------------------------------------------------------- contacts

function note(w, speed) { if (speed > w.hitSpeed) w.hitSpeed = speed; }

function resolveStatics(w) {
  const b = w.ball;
  let any = false;
  for (const s of w.statics) {
    if (b.x < s.x0 || b.x > s.x1 || b.y < s.y0 || b.y > s.y1) continue;
    if (s.k === 'seg') {
      if (!capsule(b.x, b.y, s.ax, s.ay, s.bx, s.by, s.r, s.r)) continue;
      note(w, respond(b, hit.nx, hit.ny, hit.depth, s.m, 0, 0));
      any = true;
    } else if (s.k === 'wall') {
      const rx = b.x - s.ax, ry = b.y - s.ay;
      const t = (rx * s.dx + ry * s.dy) / s.len2;
      if (t < 0 || t > 1) continue;
      const dist = rx * s.nx + ry * s.ny;
      if (dist >= BALL_R) continue;
      note(w, respond(b, s.nx, s.ny, BALL_R - dist, s.m, 0, 0));
      any = true;
    } else if (s.k === 'arc') {
      const dx = b.x - s.cx, dy = b.y - s.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let nx, ny, depth;
      if (s.side === 'in') {
        if (dist + BALL_R <= s.rad) continue;
        depth = dist + BALL_R - s.rad;
        nx = -dx / dist; ny = -dy / dist;
      } else { // band: a thick rail, ball on either side
        const off = dist - s.rad;
        if (Math.abs(off) >= s.t + BALL_R) continue;
        if (off >= 0) { depth = s.t + BALL_R - off; nx = dx / dist; ny = dy / dist; }
        else { depth = s.t + BALL_R + off; nx = -dx / dist; ny = -dy / dist; }
      }
      let a = Math.atan2(dy, dx);
      if (a < 0) a += 2 * Math.PI;
      if (a < s.a0 || a > s.a1) continue;
      note(w, respond(b, nx, ny, depth, s.m, 0, 0));
      any = true;
    }
  }
  return any;
}

function resolveGates(w) {
  const b = w.ball;
  let any = false;
  for (const g of w.gates) {
    if (g.solid === false) continue; // a sensor line only
    if (gateSide(g, b.x, b.y) <= 0) continue; // on the open side: it passes
    if (!capsule(b.x, b.y, g.ax, g.ay, g.bx, g.by, 1.5, 1.5)) continue;
    const vn = b.vx * g.nx + b.vy * g.ny;
    if (vn >= 0) { g.open = 1; continue; } // moving through the permitted way
    note(w, respond(b, g.nx, g.ny, hit.depth, MAT.gate, 0, 0));
    any = true;
  }
  return any;
}

function resolveBumpers(w) {
  const b = w.ball;
  let any = false;
  for (let i = 0; i < w.bumpers.length; i++) {
    const m = w.bumpers[i];
    if (!capsule(b.x, b.y, m.x, m.y, m.x, m.y, m.r, m.r)) continue;
    any = true;
    const vn = b.vx * hit.nx + b.vy * hit.ny;
    if (vn < -BUMPER_MIN && m.cool <= 0) {
      b.x += hit.nx * hit.depth; b.y += hit.ny * hit.depth;
      const tvx = b.vx - vn * hit.nx, tvy = b.vy - vn * hit.ny;
      b.vx = tvx * 0.3 + hit.nx * BUMPER_KICK;
      b.vy = tvy * 0.3 + hit.ny * BUMPER_KICK;
      m.cool = 4; m.flash = 12;
      w.events.push({ type: 'bumper', i, speed: -vn });
    } else {
      note(w, respond(b, hit.nx, hit.ny, hit.depth, MAT.rubber, 0, 0));
    }
  }
  return any;
}

function resolveSlings(w) {
  const b = w.ball;
  let any = false;
  for (let i = 0; i < w.slings.length; i++) {
    const s = w.slings[i];
    if (!capsule(b.x, b.y, s.ax, s.ay, s.bx, s.by, s.r, s.r)) continue;
    any = true;
    const front = (b.x - s.ax) * s.nx + (b.y - s.ay) * s.ny > 0;
    const vn = b.vx * s.nx + b.vy * s.ny;
    if (front && vn < -SLING_MIN && s.cool <= 0) {
      b.x += hit.nx * hit.depth; b.y += hit.ny * hit.depth;
      const tvx = b.vx - vn * s.nx, tvy = b.vy - vn * s.ny;
      b.vx = tvx * 0.4 + s.kx * SLING_KICK;
      b.vy = tvy * 0.4 + s.ky * SLING_KICK;
      s.cool = 6; s.flash = 10;
      w.events.push({ type: 'sling', i, speed: -vn });
    } else {
      note(w, respond(b, hit.nx, hit.ny, hit.depth, MAT.rubber, 0, 0));
    }
  }
  return any;
}

function resolveTargets(w) {
  const b = w.ball;
  let any = false;
  for (let i = 0; i < w.targets.length; i++) {
    const t = w.targets[i];
    if (t.down) continue;
    if (!capsule(b.x, b.y, t.ax, t.ay, t.bx, t.by, t.r, t.r)) continue;
    any = true;
    const speed = respond(b, hit.nx, hit.ny, hit.depth, MAT.target, 0, 0);
    if (speed > TARGET_MIN) {
      t.down = true; t.flash = 14;
      w.events.push({ type: 'target', i, speed });
    }
    note(w, speed);
  }
  return any;
}

function resolveFlippers(w) {
  const b = w.ball;
  let any = false;
  for (const f of w.flippers) {
    const c = Math.cos(f.angle), s = Math.sin(f.angle);
    const tx = f.px + f.len * c, ty = f.py + f.len * s;
    if (!capsule(b.x, b.y, f.px, f.py, tx, ty, f.r0, f.r1)) continue;
    any = true;
    // The surface under the ball moves at omega x (contact point - pivot).
    const rx = hit.qx + hit.nx * hit.r - f.px, ry = hit.qy + hit.ny * hit.r - f.py;
    const svx = -f.omega * ry, svy = f.omega * rx;
    const speed = respond(b, hit.nx, hit.ny, hit.depth, MAT.flipper, svx, svy);
    b.flipTouch = w.tick; b.flipSide = f.side;
    if (speed > 120 && f.cool <= 0) {
      f.cool = 8;
      w.events.push({ type: 'flipper-hit', side: f.side, speed, along: hit.t });
    }
  }
  return any;
}

function resolvePlunger(w) {
  const b = w.ball, p = w.plunger;
  if (b.x < p.x0 - 20 || b.y < p.y - 40) return false;
  if (!capsule(b.x, b.y, p.x0, p.y, p.x1, p.y, p.r, p.r)) return false;
  note(w, respond(b, hit.nx, hit.ny, hit.depth, MAT.plunger, 0, p.vy));
  return true;
}

function resolve(w) {
  for (let it = 0; it < ITERATIONS; it++) {
    let any = resolveStatics(w);
    if (resolveGates(w)) any = true;
    if (resolveBumpers(w)) any = true;
    if (resolveSlings(w)) any = true;
    if (resolveTargets(w)) any = true;
    if (resolveFlippers(w)) any = true;
    if (resolvePlunger(w)) any = true;
    if (!any) break;
  }
}

// ------------------------------------------------------------------ sensors

function crossing(x0, y0, x1, y1, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const s0 = dx * (y0 - ay) - dy * (x0 - ax);
  const s1 = dx * (y1 - ay) - dy * (x1 - ax);
  if ((s0 > 0 && s1 > 0) || (s0 < 0 && s1 < 0) || (s0 === 0 && s1 === 0)) return 0;
  const t = s0 / (s0 - s1);
  const ix = x0 + (x1 - x0) * t, iy = y0 + (y1 - y0) * t;
  const u = ((ix - ax) * dx + (iy - ay) * dy) / (dx * dx + dy * dy);
  if (u < 0 || u > 1) return 0;
  return s1 > s0 ? 1 : -1;
}

function sensors(w, x0, y0) {
  const b = w.ball;
  for (const l of w.lanes) {
    const dx = b.x - l.x, dy = b.y - l.y;
    const inside = dx * dx + dy * dy < l.r * l.r;
    if (inside && !l.inside) w.events.push({ type: 'lane', i: l.i, vy: b.vy });
    l.inside = inside;
  }
  for (const s of w.spinners) {
    const dir = crossing(x0, y0, b.x, b.y, s.ax, s.ay, s.bx, s.by);
    if (dir !== 0) {
      // The vane takes its spin from the ball, which slows a little.
      const speed = Math.hypot(b.vx, b.vy);
      s.omega += dir * Math.min(speed, 1200) * 0.05 * (s.omega * dir > 0 ? 0.5 : 1);
      s.omega = Math.max(-60, Math.min(60, s.omega));
      b.vx *= 0.93; b.vy *= 0.93;
      w.events.push({ type: 'spinner', i: s.i, dir, speed });
    }
  }
  for (let i = 0; i < w.gates.length; i++) {
    const g = w.gates[i];
    if (gateCrossed(g, x0, y0, b.x, b.y)) w.events.push({ type: 'gate', i, kind: g.kind, vx: b.vx, vy: b.vy });
  }
}

// --------------------------------------------------------------------- step

function substep(w) {
  advanceParts(w);
  const b = w.ball;
  if (!b.active) return;
  const x0 = b.x, y0 = b.y;
  b.vy += GRAVITY * DT;
  const k = 1 - DRAG * DT;
  b.vx *= k; b.vy *= k;
  const sp2 = b.vx * b.vx + b.vy * b.vy;
  if (sp2 > VMAX * VMAX) {
    const s = VMAX / Math.sqrt(sp2);
    b.vx *= s; b.vy *= s;
  }
  b.x += b.vx * DT; b.y += b.vy * DT;
  resolve(w);
  sensors(w, x0, y0);
}

function nudgeFree(w) {
  const b = w.ball;
  w.stats.searches++;
  const r = w.rng();
  b.vx += (w.rng() - 0.5) * 360;
  b.vy -= 260 + r * 220;
  b.y -= 1.5;
  w.events.push({ type: 'search' });
}

function afterTick(w) {
  const b = w.ball;
  w.stats.ticks++;
  for (const f of w.flippers) if (f.cool > 0) f.cool--;
  for (const m of w.bumpers) { if (m.cool > 0) m.cool--; if (m.flash > 0) m.flash--; }
  for (const s of w.slings) { if (s.cool > 0) s.cool--; if (s.flash > 0) s.flash--; }
  for (const t of w.targets) if (t.flash > 0) t.flash--;
  for (const g of w.gates) g.open = Math.max(0, g.open - 0.1);
  if (!b.active) return;

  const sp = Math.hypot(b.vx, b.vy);
  if (sp > w.stats.maxSpeed) w.stats.maxSpeed = sp;

  updateInLane(w);
  if (b.y > w.table.DRAIN_Y) {
    b.active = false;
    w.events.push({ type: 'drain' });
    return;
  }
  if (!w.table.onTable(b.x, b.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
    // Safety net: should never happen. Put the ball back on the plunger and count it.
    w.stats.escapes++;
    w.events.push({ type: 'escape', x: b.x, y: b.y });
    serveBall(w);
    return;
  }

  // Plunger: report a launch the tick the head reaches its stop with the ball above it.
  const p = w.plunger;
  if (p.fired) {
    p.fired = false;
    if (b.inLane && b.vy < -250) w.events.push({ type: 'launch', speed: -b.vy, power: p.s0 });
  }

  // Ball search: barely moving outside the lane, and not cradled on a held flipper.
  if (b.inLane) { b.still = 0; b.ax = b.x; b.ay = b.y; return; }
  const cradled = w.tick - b.flipTouch <= 3 && w.flippers.some((f) => f.side === b.flipSide && f.held);
  const dx = b.x - b.ax, dy = b.y - b.ay;
  if (dx * dx + dy * dy > SEARCH_RADIUS * SEARCH_RADIUS || cradled) {
    b.ax = b.x; b.ay = b.y; b.still = 0;
  } else if (++b.still >= SEARCH_TICKS && w.search) {
    b.still = 0;
    nudgeFree(w);
  }
}

/** Advance the world one 60 Hz tick. Events of the tick are left in w.events. */
export function stepWorld(w) {
  w.events.length = 0;
  w.hitSpeed = 0;
  w.tick++;
  for (let i = 0; i < SUBSTEPS; i++) substep(w);
  afterTick(w);
}

// ------------------------------------------------------------ test helpers

/** Deepest overlap (px) between the ball and any solid right now; 0 if clear. */
export function maxPenetration(w) {
  const b = w.ball;
  let worst = 0;
  const take = (d) => { if (d > worst) worst = d; };
  for (const s of w.statics) {
    if (s.k === 'seg') { if (capsule(b.x, b.y, s.ax, s.ay, s.bx, s.by, s.r, s.r)) take(hit.depth); }
    else if (s.k === 'wall') {
      const rx = b.x - s.ax, ry = b.y - s.ay;
      const t = (rx * s.dx + ry * s.dy) / s.len2;
      if (t >= 0 && t <= 1) take(BALL_R - (rx * s.nx + ry * s.ny));
    } else if (s.k === 'arc') {
      const dx = b.x - s.cx, dy = b.y - s.cy;
      const dist = Math.hypot(dx, dy);
      let a = Math.atan2(dy, dx); if (a < 0) a += 2 * Math.PI;
      if (a < s.a0 || a > s.a1) continue;
      if (s.side === 'in') take(dist + BALL_R - s.rad);
      else { const off = Math.abs(dist - s.rad); take(s.t + BALL_R - off); }
    }
  }
  for (const m of w.bumpers) if (capsule(b.x, b.y, m.x, m.y, m.x, m.y, m.r, m.r)) take(hit.depth);
  for (const s of w.slings) if (capsule(b.x, b.y, s.ax, s.ay, s.bx, s.by, s.r, s.r)) take(hit.depth);
  for (const t of w.targets) if (!t.down && capsule(b.x, b.y, t.ax, t.ay, t.bx, t.by, t.r, t.r)) take(hit.depth);
  for (const f of w.flippers) {
    const tx = f.px + f.len * Math.cos(f.angle), ty = f.py + f.len * Math.sin(f.angle);
    if (capsule(b.x, b.y, f.px, f.py, tx, ty, f.r0, f.r1)) take(hit.depth);
  }
  return worst;
}

/** The two end centers of a flipper at its current angle. */
export function flipperTip(f) {
  return { x: f.px + f.len * Math.cos(f.angle), y: f.py + f.len * Math.sin(f.angle) };
}
