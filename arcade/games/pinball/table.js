// The Dust Devil table: all geometry as plain data, shared by the physics and the
// art so what you see is what the ball hits. Logical canvas 450 x 720, y down.
// Pure module: no DOM at import time.
//
// Shapes (see physics.js for how each is collided):
//   wall  one-sided straight wall, the ball is kept on the side of (nx, ny)
//   arc   circular wall; 'in' keeps the ball inside the circle, 'band' is a thick rail
//   seg   a capsule (segment with radius), solid on both sides; a post is a seg with a == b
//   gate  a line with a normal: a ball may cross it the way the normal points, never back.
//         kind 'lane' is the shooter lane's mouth, 'orbit' the top of the orbit, 'flap' the flap
//         on the left wall; with solid:false it is only a sensor line (kind 'entry', orbit's foot)
//
// The layout is built around these shots (all measured in tests/pinball.test.mjs): the right
// flipper's outer half throws the ball up the left wall into the orbit, the left flipper's outer
// half hits the drop targets, and the inner half of either shoots the pop bumpers.
export const W = 450;
export const H = 720;
export const BALL_R = 10;

// The arched top: a half circle over the whole width, shooter lane included.
export const ARCH = { cx: 225, cy: 270, r: 211 };
export const WALL_L = 14;
export const WALL_R = 436;
export const MX = 208; // mirror axis of the lower table (between the two flippers)
export const mirror = (x) => 2 * MX - x;

// The shooter lane on the right: the ball rests on the plunger head and is thrown up it,
// round the top-right of the arch, and out through a one-way gate at this angle.
export const LANE = { x0: 408, x1: 436, cx: 422 };
export const GATE_ANGLE = (305 * Math.PI) / 180; // measured from +x, y down: up and to the right of center
export const PLUNGER = { x0: 413, x1: 431, y0: 653, travel: 36, r: 3 };
export const SPAWN = { x: LANE.cx, y: PLUNGER.y0 - PLUNGER.r - BALL_R };
export const DRAIN_Y = 730; // a ball whose center passes this line has left the table

const deg = Math.PI / 180;
// The orbit: a lane on the arch, from where the left wall turns into it (a0) up to its one-way gate (a1).
export const ORBIT = { r: ARCH.r - 36, a0: 190 * deg, a1: 235 * deg };
export const FELT = { y0: 262, y1: 430 };
// A ledge on the right wall, above the right outlane: a ball sliding down the wall (off the lane
// band, or a bumper kick) lands on it and rolls out into the playfield instead of down the outlane.
export const LEDGE = { ax: 402, ay: 444, bx: 372, by: 466 };

const seg = (ax, ay, bx, by, r = 3, mat = 'wall') => ({ k: 'seg', ax, ay, bx, by, r, mat });
const post = (x, y, r, mat = 'post') => ({ k: 'seg', ax: x, ay: y, bx: x, by: y, r, mat });
const norm = (x, y) => { const l = Math.hypot(x, y); return [x / l, y / l]; };

function build() {
  const statics = [];

  // --- the outer boundary: the ball is kept in ---
  // A strip of soft sand up the left wall, just below the orbit: a ball thrown at it from across
  // the table loses its sideways bounce and slides up into the lane instead of rebounding into
  // the rail's end. (It sits before the wall in the list so it answers first.)
  statics.push(seg(WALL_L - 3, FELT.y0, WALL_L - 3, FELT.y1, 3, 'felt'));
  statics.push({ k: 'wall', ax: WALL_L, ay: ARCH.cy, bx: WALL_L, by: 760, nx: 1, ny: 0, mat: 'wall' });
  statics.push({ k: 'wall', ax: WALL_R, ay: ARCH.cy, bx: WALL_R, by: 760, nx: -1, ny: 0, mat: 'wall' });
  statics.push({ k: 'arc', side: 'in', cx: ARCH.cx, cy: ARCH.cy, rad: ARCH.r, a0: Math.PI, a1: 2 * Math.PI, mat: 'wall' });
  statics.push({ k: 'wall', ax: LANE.x0, ay: 700, bx: LANE.x1, by: 700, nx: 0, ny: -1, mat: 'wall' }); // lane floor

  // --- the shooter lane: straight up the right side, then curving left along the arch ---
  // Its inner wall is a straight rail, then an arc concentric with the arch; the lane's
  // mouth (the gate) is where that arc ends.
  statics.push(seg(LANE.x0 - 3, ARCH.cy, LANE.x0 - 3, 706, 3, 'wall'));
  statics.push({ k: 'arc', side: 'band', cx: ARCH.cx, cy: ARCH.cy, rad: ARCH.r - 31, t: 3, a0: GATE_ANGLE, a1: 2 * Math.PI, mat: 'wall' });
  statics.push(post(ARCH.cx + (ARCH.r - 31) * Math.cos(GATE_ANGLE), ARCH.cy + (ARCH.r - 31) * Math.sin(GATE_ANGLE), 3, 'wall'));

  // --- flippers ---
  const FLIP = { len: 64, r0: 9, r1: 5.5, rest: 28 * deg, upAng: 28 * deg, wUp: 17, wDown: 10 };
  const PIV = { x: 126, y: 640 };
  const flippers = [
    { side: 'L', px: PIV.x, py: PIV.y, len: FLIP.len, r0: FLIP.r0, r1: FLIP.r1, rest: FLIP.rest, up: -FLIP.upAng, wUp: FLIP.wUp, wDown: FLIP.wDown },
    { side: 'R', px: mirror(PIV.x), py: PIV.y, len: FLIP.len, r0: FLIP.r0, r1: FLIP.r1, rest: Math.PI - FLIP.rest, up: Math.PI + FLIP.upAng, wUp: FLIP.wUp, wDown: FLIP.wDown },
  ];

  // --- lower table, mirrored: outlane dividers, inlane guides, slingshots ---
  // Each inlane guide runs from the foot of its divider to the flipper pivot and is tangent
  // to the pivot's circle, so guide and resting flipper make one smooth slope. (A guide that
  // meets the pivot at an angle leaves a notch the ball can come to rest in.)
  const DIV = { x: 50, top: 505, foot: 586 };
  const gdx = PIV.x - DIV.x, gdy = PIV.y - DIV.foot;
  const gd = Math.hypot(gdx, gdy);
  const gOff = Math.asin((FLIP.r0 + 3) / gd);
  const gAng = Math.atan2(gdy, gdx) - gOff;
  const gLen = gd * Math.cos(gOff);
  const guideEnd = [DIV.x + Math.cos(gAng) * gLen, DIV.foot + Math.sin(gAng) * gLen];
  // The sling's lower edge runs parallel to the guide, one narrow inlane (34 px between centers) above it.
  const SL_GAP = 34;
  const p0 = [DIV.x + Math.sin(gAng) * SL_GAP, DIV.foot - Math.cos(gAng) * SL_GAP];
  const slAt = (x) => [x, p0[1] + Math.tan(gAng) * (x - p0[0])];
  const SLING_KICK_ANGLE = 62 * deg;
  const SL_B = slAt(84), SL_F = slAt(120), SL_T = [84, 530];
  const slings = [];
  for (const side of ['L', 'R']) {
    const m = side === 'L' ? (x) => x : mirror;
    statics.push(seg(m(DIV.x), DIV.top, m(DIV.x), DIV.foot, 3, 'post')); // outlane divider
    statics.push(seg(m(DIV.x), DIV.foot, m(guideEnd[0]), guideEnd[1], 3, 'wall')); // inlane guide
    statics.push(seg(m(SL_T[0]), SL_T[1], m(SL_B[0]), SL_B[1], 3, 'rubber')); // sling's outer edge
    statics.push(seg(m(SL_B[0]), SL_B[1], m(SL_F[0]), SL_F[1], 3, 'rubber')); // sling's lower edge
    // The rubber face, from the top corner to the inner corner. Its normal points into the playfield.
    const ax = m(SL_T[0]), ay = SL_T[1], bx = m(SL_F[0]), by = SL_F[1];
    let [nx, ny] = norm(by - ay, -(bx - ax));
    if (nx * (MX - (ax + bx) / 2) < 0) { nx = -nx; ny = -ny; }
    // The kick leaves steeper than the face: more up the table than across it.
    const kc = SLING_KICK_ANGLE, kdir = side === 'L' ? 1 : -1;
    // (cx, cy) is the triangle's third corner, for the art.
    slings.push({ side, ax, ay, bx, by, cx: m(SL_B[0]), cy: SL_B[1], r: 3, nx, ny, kx: Math.cos(kc) * kdir, ky: -Math.sin(kc) });
  }

  statics.push(seg(LEDGE.ax, LEDGE.ay, LEDGE.bx, LEDGE.by, 3, 'wall')); // the right-wall ledge

  // --- the orbit: a lane that starts where the left wall turns into the arch ---
  // The right flipper's outer half throws the ball up the left wall; it rebounds into the lane
  // and rides the arch round, through the spinner, to a one-way gate at the top. The rail's
  // lower end is open, so there is nothing to clip. If a ball runs out of steam it falls back
  // down the wall onto a one-way flap and rolls out to the flipper rather than down the outlane.
  const ORBIT_R = ORBIT.r; // the rail along the arch, concentric with it
  const orbitStart = ORBIT.a0;
  const orbitEnd = ORBIT.a1;
  const onArch = (r, phi) => [ARCH.cx + r * Math.cos(phi), ARCH.cy + r * Math.sin(phi)];
  statics.push({ k: 'arc', side: 'band', cx: ARCH.cx, cy: ARCH.cy, rad: ORBIT_R, a0: orbitStart, a1: orbitEnd, t: 3, mat: 'wall' });
  statics.push(post(...onArch(ORBIT_R, orbitStart), 3, 'wall'));
  statics.push(post(...onArch(ORBIT_R, orbitEnd), 3, 'wall'));
  // A sensor across the lane's foot (it does not block): the ball is "in the orbit" once it crosses.
  const entry = {
    ax: onArch(ARCH.r, orbitStart)[0], ay: onArch(ARCH.r, orbitStart)[1],
    bx: onArch(ORBIT_R, orbitStart)[0], by: onArch(ORBIT_R, orbitStart)[1],
    nx: -Math.sin(orbitStart), ny: Math.cos(orbitStart), kind: 'entry', solid: false,
  };
  // The orbit is one-way at the top: a ball shot up it goes through, but anything coming round
  // the arch the other way (a hard plunge) is turned back and drops into the bumpers.
  const orbitGate = {
    ax: onArch(ORBIT_R, orbitEnd)[0], ay: onArch(ORBIT_R, orbitEnd)[1],
    bx: onArch(ARCH.r, orbitEnd)[0], by: onArch(ARCH.r, orbitEnd)[1],
    nx: -Math.sin(orbitEnd), ny: Math.cos(orbitEnd), kind: 'orbit',
  };
  // The flap: blocks a ball falling down the left wall (from above), lets one shot up it through.
  const flap = (() => {
    const ax = WALL_L, ay = 410, bx = 64, by = 438;
    const [dx, dy] = norm(bx - ax, by - ay);
    return { ax, ay, bx, by, nx: dy, ny: -dx, kind: 'flap' };
  })();
  const spinPhi = 205 * deg;
  const spinners = [{
    i: 0, ax: onArch(ARCH.r, spinPhi)[0], ay: onArch(ARCH.r, spinPhi)[1],
    bx: onArch(ORBIT_R + 3, spinPhi)[0], by: onArch(ORBIT_R + 3, spinPhi)[1],
  }];

  // --- top rollover lanes: pins and sensors ---
  const laneXs = [183, 225, 267];
  for (const x of [204, 246, 288]) statics.push(seg(x, 104, x, 128, 4, 'post'));
  statics.push(seg(162, 88, 162, 128, 4, 'post')); // tall: seals the gap under the arch, catches a hard plunge
  const lanes = laneXs.map((x, i) => ({ i, x, y: 116, r: 9 }));

  // --- pop bumpers ---
  const bumpers = [
    { x: 175, y: 192, r: 19 },
    { x: 275, y: 192, r: 19 },
    { x: 225, y: 255, r: 19 },
  ];

  // --- drop targets: a short bank leaning toward the left flipper ---
  const targets = [];
  {
    const top = [348, 300], bot = [364, 380];
    const [dx, dy] = norm(bot[0] - top[0], bot[1] - top[1]);
    const total = Math.hypot(bot[0] - top[0], bot[1] - top[1]);
    const n = 3, half = 9, step = (total - 2 * half - 10) / (n - 1);
    for (let i = 0; i < n; i++) {
      const s = 5 + half + i * step;
      const cx = top[0] + dx * s, cy = top[1] + dy * s;
      targets.push({ i, ax: cx - dx * half, ay: cy - dy * half, bx: cx + dx * half, by: cy + dy * half, r: 5 });
    }
  }

  // --- the one-way gate across the lane's mouth ---
  // A ball may leave the lane through it but never come back: its normal points out
  // along the lane's direction of travel (up and to the left).
  const gate = {
    ax: ARCH.cx + (ARCH.r - 31) * Math.cos(GATE_ANGLE), ay: ARCH.cy + (ARCH.r - 31) * Math.sin(GATE_ANGLE),
    bx: ARCH.cx + ARCH.r * Math.cos(GATE_ANGLE), by: ARCH.cy + ARCH.r * Math.sin(GATE_ANGLE),
    nx: Math.sin(GATE_ANGLE), ny: -Math.cos(GATE_ANGLE), kind: 'lane',
  };

  return {
    W, H, BALL_R, ARCH, WALL_L, WALL_R, MX, LANE, PLUNGER, SPAWN, DRAIN_Y,
    statics, slings, flippers, bumpers, targets, lanes, gates: [gate, entry, orbitGate, flap], spinners, inShooter, onTable,
  };
}

export const TABLE = build();
export default TABLE;

/** Is (x, y) in the shooter lane's channel (before the gate)? Ignores the gate itself. */
export function inShooter(x, y) {
  if (y >= ARCH.cy) return x > LANE.x0 - 1;
  const dx = x - ARCH.cx, dy = y - ARCH.cy;
  if (dx <= 0 || dx * dx + dy * dy < (ARCH.r - 40) * (ARCH.r - 40)) return false;
  let a = Math.atan2(dy, dx);
  if (a < 0) a += 2 * Math.PI;
  return a >= GATE_ANGLE - 0.05;
}

/** Is (x, y) inside the playfield (a ball center there is on the table, or in the drain)? */
export function onTable(x, y) {
  if (y > DRAIN_Y + 40) return true; // below the table: drained, not escaped
  if (y < ARCH.cy) {
    const dx = x - ARCH.cx, dy = y - ARCH.cy;
    return dx * dx + dy * dy <= (ARCH.r + 1) * (ARCH.r + 1);
  }
  return x >= WALL_L - 1 && x <= WALL_R + 1;
}
