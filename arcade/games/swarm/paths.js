// Swarm flight paths. Every path is a chain of cubic Bezier segments written
// as a flat list: [x0,y0, c1x,c1y, c2x,c2y, x1,y1, c1x,c1y, c2x,c2y, x2,y2, ...].
// buildPath samples the chain into an arc-length table so a mover advances at
// a constant speed no matter how the control points are spaced.

export const CX = 400; // playfield center line (mirror axis)
const STEPS = 18; // samples per segment

export function buildPath(pts) {
  const xs = [pts[0]];
  const ys = [pts[1]];
  const len = [0];
  let total = 0;
  for (let i = 2; i + 5 < pts.length; i += 6) {
    const x0 = pts[i - 2], y0 = pts[i - 1];
    const ax = pts[i], ay = pts[i + 1];
    const bx = pts[i + 2], by = pts[i + 3];
    const x1 = pts[i + 4], y1 = pts[i + 5];
    let px = x0, py = y0;
    for (let k = 1; k <= STEPS; k++) {
      const t = k / STEPS;
      const u = 1 - t;
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      const x = w0 * x0 + w1 * ax + w2 * bx + w3 * x1;
      const y = w0 * y0 + w1 * ay + w2 * by + w3 * y1;
      total += Math.hypot(x - px, y - py);
      xs.push(x);
      ys.push(y);
      len.push(total);
      px = x;
      py = y;
    }
  }
  return { xs, ys, len, total };
}

// Reflect a control-point list across the playfield center line.
export function mirror(pts) {
  return pts.map((v, i) => (i % 2 === 0 ? 2 * CX - v : v));
}

export function translate(pts, dx, dy) {
  return pts.map((v, i) => v + (i % 2 === 0 ? dx : dy));
}

// Move `m` (needs s, ci, x, y, ang) `dist` pixels along `path`.
// Returns true once the end of the path is reached.
export function advance(m, path, dist) {
  const { xs, ys, len, total } = path;
  m.s += dist;
  const last = xs.length - 1;
  if (m.s >= total) {
    m.x = xs[last];
    m.y = ys[last];
    m.ang = Math.atan2(ys[last] - ys[last - 1], xs[last] - xs[last - 1]);
    return true;
  }
  while (m.ci < last - 1 && len[m.ci + 1] < m.s) m.ci++;
  const i = m.ci;
  const seg = len[i + 1] - len[i] || 1;
  const f = (m.s - len[i]) / seg;
  const dx = xs[i + 1] - xs[i];
  const dy = ys[i + 1] - ys[i];
  m.x = xs[i] + dx * f;
  m.y = ys[i] + dy * f;
  if (dx !== 0 || dy !== 0) m.ang = Math.atan2(dy, dx);
  return false;
}

// --- Entry choreography (the playfield spans x 140..660) ---

// A: drops in from the top just right of center, curls out to the right and
// climbs back toward the grid. Squad 1 flies it as twin files with its mirror.
export const ENTRY_A = [
  412, -24,
  412, 96, 470, 200, 540, 230,
  612, 262, 642, 168, 588, 136,
  548, 112, 500, 128, 476, 150,
];

// B: sweeps in low from the left edge, climbs, rolls a tight loop and
// lifts up into the formation.
export const ENTRY_B = [
  128, 420,
  250, 432, 340, 372, 340, 282,
  340, 192, 236, 168, 228, 238,
  220, 300, 318, 318, 378, 246,
];

// C: enters high from the right edge, arcs across the field in a long S.
export const ENTRY_C = [
  672, 72,
  560, 50, 440, 112, 402, 202,
  370, 282, 250, 302, 220, 242,
  194, 190, 252, 140, 312, 152,
];

// --- Practice wave fly-throughs (they never settle; they leave) ---

export const PRACTICE_A = [
  300, -24,
  300, 160, 580, 200, 570, 306,
  560, 420, 360, 440, 340, 350,
  320, 250, 520, 168, 690, 136,
];

export const PRACTICE_B = [
  128, 128,
  300, 118, 420, 240, 410, 330,
  400, 430, 252, 430, 252, 340,
  252, 250, 420, 206, 430, -30,
];

// Dive attacks, built per sortie from the diver's slot (x0, y0). `side` is
// the flank it loops toward (-1 left, +1 right), `tx` the x it aims at, `by`
// the player's line, `H` the screen height.
export function divePoints(kind, x0, y0, side, tx, by, H) {
  // Opening loop: pop up out of the grid, curl outward and turn down.
  const lx = x0 + side * 50;
  const ly = y0 + 6;
  const loop = [x0, y0, x0, y0 - 38, x0 + side * 46, y0 - 44, lx, ly];
  if (kind === 'drone') {
    return loop.concat([
      lx, ly + 70, tx - side * 70, by - 150, tx, by - 70,
      tx + side * 40, by - 18, tx + side * 62, by + 12, tx + side * 72, H + 40,
    ]);
  }
  if (kind === 'stinger') {
    // Swoop down at the player, hook a U-turn toward the center and climb home.
    const u = tx < CX ? 1 : -1;
    return loop.concat([
      lx, ly + 80, tx - u * 50, by - 160, tx, by - 84,
      tx + u * 12, by - 22, tx + u * 82, by - 10, tx + u * 92, by - 100,
      tx + u * 102, by - 196, x0, y0 + 150, x0, y0 + 60,
    ]);
  }
  // Warden: a wide flanking arc, a pass across the player, then off the bottom.
  return loop.concat([
    lx + side * 10, ly + 110, tx + side * 120, by - 200, tx + side * 30, by - 120,
    tx - side * 40, by - 60, tx - side * 90, by - 12, tx - side * 80, H + 40,
  ]);
}
