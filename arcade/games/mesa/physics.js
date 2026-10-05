// Mesa Lander physics, shared by the player's game and the learning agent.
//
// One rigid body (position, velocity, angle, spin) in a heightfield world, flown
// with three controls: a main engine that pushes along the lander's own up axis,
// and two side thrusters that turn it (and shove it a little sideways). Two feet
// are the only parts that may touch the ground, and only on the pad.
//
// Units: pixels of the 800 x 500 screen and seconds; y grows downward. One call
// to stepLander() is one 1/60 s tick. No DOM, no Math.random: Node imports it.

export const DT = 1 / 60;

// Controls are bit flags so the player can press several at once; the agent
// picks one of four whole actions (none, left, main, right).
export const LEFT = 1;
export const MAIN = 2;
export const RIGHT = 4;

// Where an attempt stands.
export const FLYING = 0;
export const LANDED = 1;
export const CRASHED = 2;
export const LOST = 3; // drifted off the side of the screen or far above the top

export const PHYS = {
  gravity: 48, // px/s^2, always pulling down
  thrust: 118, // px/s^2 along the lander's up axis while the main engine burns
  torque: 5, // rad/s^2 from a side thruster
  sidePush: 6, // px/s^2 sideways shove from a side thruster
  spinDamp: 1.2, // per second: the attitude jets bleed off spin
  maxSpin: 3, // rad/s
  fuelMain: 0.07, // share of a full tank burned per second of main engine
  fuelSide: 0.012, // same, per side thruster
};

// The lander's body in its own frame (x right, y down, origin at the center).
export const BODY = {
  foot: { x: 16, y: 15 }, // the two feet sit at (-16, 15) and (16, 15)
  hull: [[-11, -14], [11, -14], [-11, 8], [11, 8]], // hull corners: any touch is a crash
  reach: 24, // farther than any body point from the center
};

// What a touchdown on the pad may look like.
export const LIMITS = {
  vy: 40, // px/s straight down
  vx: 24, // px/s sideways
  tilt: 0.22, // rad (about 12.6 degrees)
  spin: 1.1, // rad/s
};

const OUT_SIDE = 24; // px past a side edge before the attempt is lost
const OUT_TOP = 150; // px above the top of the screen

/**
 * @typedef {{ W: number, H: number, floor: number, h: Float64Array, topY: number,
 *   pad: { x0: number, x1: number, cx: number, y: number, width: number },
 *   mesas: { cx: number, top: number, topW: number, lean: number }[] }} Terrain
 */

/**
 * Build a heightfield world. `h[x]` is the surface height at each whole pixel;
 * mesas have a flat top and steep, slightly leaning sides, so a lander that
 * drifts into one hits a wall. The landing pad is a stretch of one mesa's top.
 * @param {{ W?: number, H?: number, floor?: number, mesas?: { cx: number, top: number, topW: number, lean?: number }[],
 *   padOn?: number, padWidth?: number, padOffset?: number }} spec
 * @returns {Terrain}
 */
export function makeTerrain(spec = {}) {
  const W = spec.W ?? 800;
  const H = spec.H ?? 500;
  const floor = spec.floor ?? 440;
  const mesas = (spec.mesas ?? []).map((m) => ({ lean: 0.16, ...m }));
  const h = new Float64Array(W + 2).fill(floor);
  for (const m of mesas) {
    const half = m.topW / 2;
    const reach = half + (floor - m.top) * m.lean;
    const x0 = Math.max(0, Math.floor(m.cx - reach));
    const x1 = Math.min(W + 1, Math.ceil(m.cx + reach));
    for (let x = x0; x <= x1; x++) {
      const d = Math.abs(x - m.cx);
      const y = d <= half ? m.top : m.top + (d - half) / m.lean;
      if (y < h[x]) h[x] = y;
    }
  }
  const padMesa = mesas[spec.padOn ?? 0];
  if (!padMesa) throw new Error('makeTerrain needs a mesa for the pad');
  const width = spec.padWidth ?? 96;
  const cx = padMesa.cx + (spec.padOffset ?? 0);
  if (width > padMesa.topW) throw new Error('the pad is wider than its mesa');
  const pad = { x0: cx - width / 2, x1: cx + width / 2, cx, y: padMesa.top, width };
  let topY = floor;
  for (let x = 0; x <= W; x++) if (h[x] < topY) topY = h[x];
  return { W, H, floor, h, topY, pad, mesas };
}

/** Height of the ground surface at x (linear between whole pixels). */
export function surfaceAt(t, x) {
  if (x <= 0) return t.h[0];
  if (x >= t.W) return t.h[t.W];
  const i = x | 0;
  const f = x - i;
  const a = t.h[i];
  return a + (t.h[i + 1] - a) * f;
}

/**
 * A fresh lander. `fuel` is a share of a full tank (Infinity never runs dry).
 * @param {{ x?: number, y?: number, vx?: number, vy?: number, a?: number, w?: number, fuel?: number }} init
 */
export function makeLander(init = {}) {
  return {
    x: init.x ?? 0,
    y: init.y ?? 0,
    vx: init.vx ?? 0,
    vy: init.vy ?? 0,
    a: init.a ?? 0, // tilt in rad: 0 upright, positive leans the nose to the right
    w: init.w ?? 0, // spin in rad/s, positive turns clockwise
    fuel: init.fuel ?? 1,
    burn: 0, // fuel used so far, in tanks
    t: 0, // ticks flown
    fire: 0, // which engines fired on the last tick (LEFT | MAIN | RIGHT)
    status: FLYING,
    cause: '', // why it crashed: wall, offpad, fast, slide, tilt, spin
    impact: { vx: 0, vy: 0, a: 0, w: 0, dx: 0, speed: 0 },
  };
}

/** Put a lander back to a starting state without allocating. */
export function resetLander(s, init = {}) {
  s.x = init.x ?? 0;
  s.y = init.y ?? 0;
  s.vx = init.vx ?? 0;
  s.vy = init.vy ?? 0;
  s.a = init.a ?? 0;
  s.w = init.w ?? 0;
  s.fuel = init.fuel ?? 1;
  s.burn = 0;
  s.t = 0;
  s.fire = 0;
  s.status = FLYING;
  s.cause = '';
  return s;
}

/** Height of the feet above the pad plane, in px (negative: below it). */
export function altitude(s, t) {
  return t.pad.y - (s.y + BODY.foot.y * Math.cos(s.a));
}

/**
 * Advance one tick. `ctl` is any mix of LEFT, MAIN, RIGHT; `wind` is a sideways
 * acceleration in px/s^2. Returns the new status and records it on `s`.
 * @param {ReturnType<typeof makeLander>} s
 * @param {number} ctl
 * @param {Terrain} t
 * @param {number} [wind]
 */
export function stepLander(s, ctl, t, wind = 0) {
  if (s.status !== FLYING) return s.status;
  const sin = Math.sin(s.a);
  const cos = Math.cos(s.a);
  let ax = wind;
  let ay = PHYS.gravity;
  let alpha = 0;
  let fire = 0;
  if (s.fuel > 0) {
    let used = 0;
    if (ctl & MAIN) {
      ax += PHYS.thrust * sin;
      ay -= PHYS.thrust * cos;
      fire |= MAIN;
      used += PHYS.fuelMain;
    }
    if (ctl & LEFT) {
      alpha -= PHYS.torque;
      ax -= PHYS.sidePush * cos;
      ay -= PHYS.sidePush * sin;
      fire |= LEFT;
      used += PHYS.fuelSide;
    }
    if (ctl & RIGHT) {
      alpha += PHYS.torque;
      ax += PHYS.sidePush * cos;
      ay += PHYS.sidePush * sin;
      fire |= RIGHT;
      used += PHYS.fuelSide;
    }
    if (used > 0) {
      used *= DT;
      s.burn += used;
      s.fuel -= used;
      if (s.fuel < 0) s.fuel = 0;
    }
  }
  s.fire = fire;

  // Exact for a constant acceleration over the tick (free fall matches 1/2 g t^2).
  s.x += s.vx * DT + 0.5 * ax * DT * DT;
  s.y += s.vy * DT + 0.5 * ay * DT * DT;
  s.vx += ax * DT;
  s.vy += ay * DT;
  s.a += s.w * DT + 0.5 * alpha * DT * DT;
  s.w += alpha * DT;
  s.w -= s.w * PHYS.spinDamp * DT;
  if (s.w > PHYS.maxSpin) s.w = PHYS.maxSpin;
  else if (s.w < -PHYS.maxSpin) s.w = -PHYS.maxSpin;
  if (s.a > Math.PI) s.a -= 2 * Math.PI;
  else if (s.a < -Math.PI) s.a += 2 * Math.PI;
  s.t++;

  if (s.x < -OUT_SIDE || s.x > t.W + OUT_SIDE || s.y < -OUT_TOP) {
    s.status = LOST;
    return LOST;
  }
  if (s.y + BODY.reach < t.topY) return FLYING; // nothing up here to touch
  return touch(s, t);
}

// Check the body against the ground and judge a first contact: a landing is both
// feet on the pad, slow, upright and not spinning; any other touch is a crash.
function touch(s, t) {
  const sin = Math.sin(s.a);
  const cos = Math.cos(s.a);
  const fx = BODY.foot.x;
  const fy = BODY.foot.y;
  const lx = s.x - fx * cos - fy * sin;
  const ly = s.y - fx * sin + fy * cos;
  const rx = s.x + fx * cos - fy * sin;
  const ry = s.y + fx * sin + fy * cos;
  const feetIn = ly >= surfaceAt(t, lx) || ry >= surfaceAt(t, rx);

  let hullIn = false;
  const hull = BODY.hull;
  for (let i = 0; i < hull.length; i++) {
    const bx = hull[i][0];
    const by = hull[i][1];
    const px = s.x + bx * cos - by * sin;
    const py = s.y + bx * sin + by * cos;
    if (py >= surfaceAt(t, px)) {
      hullIn = true;
      break;
    }
  }
  if (!feetIn && !hullIn) return FLYING;

  const im = s.impact;
  im.vx = s.vx;
  im.vy = s.vy;
  im.a = s.a;
  im.w = s.w;
  im.dx = s.x - t.pad.cx;
  im.speed = Math.hypot(s.vx, s.vy);

  const pad = t.pad;
  const lo = Math.min(lx, rx);
  const hi = Math.max(lx, rx);
  let cause = '';
  if (hullIn) cause = 'wall';
  else if (lo < pad.x0 - 1 || hi > pad.x1 + 1) cause = 'offpad';
  else if (s.vy > LIMITS.vy) cause = 'fast';
  else if (Math.abs(s.vx) > LIMITS.vx) cause = 'slide';
  else if (Math.abs(s.a) > LIMITS.tilt) cause = 'tilt';
  else if (Math.abs(s.w) > LIMITS.spin) cause = 'spin';

  s.fire = 0;
  if (cause) {
    s.status = CRASHED;
    s.cause = cause;
    s.vx = 0;
    s.vy = 0;
    s.w = 0;
    return CRASHED;
  }
  // Touchdown: the legs soak up the last of the tilt and the lander settles.
  s.status = LANDED;
  s.cause = '';
  s.vx = 0;
  s.vy = 0;
  s.w = 0;
  s.a = 0;
  s.y = pad.y - fy;
  return LANDED;
}
