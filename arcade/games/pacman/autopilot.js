// Autopilot for "Watch the AI play". Every decision is a real search over the
// maze graph:
//  1. Threat fields, two views per ghost, combined per tile:
//     a. Look-ahead: replay the ghost's real targeting tile by tile for about
//        four seconds (Blinky's chase, Pinky's 4-ahead and Inky's pivot, both
//        with the original up-direction overflow bug, Clyde's 8-tile retreat,
//        scatter corners, the up>left>down>right tie-break, red zones, and the
//        reversal at the next scatter/chase flip), against where Pac-Man's
//        last plan says it will be. This is where the ghost is heading.
//     b. Reach: a Dijkstra giving the earliest tick it could reach any tile by
//        any route (no-reverse rule, tunnel and Elroy speeds, fright running
//        out, ghosts still in the house or returning as eyes). Trusted fully
//        for the first few tiles, then discounted, since the look-ahead already
//        covers where it is really going.
//  2. Pac-Man's Dijkstra: cost = travel time + a danger penalty that grows
//     as the margin (ghost arrival minus Pac-Man arrival) on each tile shrinks.
//  3. Goal choice: pellets, a power pellet when threatened, frightened ghosts
//     reachable before fright ends, fruit before it expires. Each candidate
//     must also pass an escape check: from the goal, Pac-Man must still be
//     able to keep moving for several tiles ahead of every ghost.
//  4. If nothing passes, flee toward the tile with the most room to survive.
// The overlay draws exactly these numbers: the chosen path, the per-tile
// margin as a red tint, and the goal as a one-line thought.
import { TILE, MAZE_Y, COLS, ROWS } from './maze.js';
import { BASE_SPEED } from './levels.js';
import { DIRS } from './actors.js';
import { drawText } from '../../engine/font.js';

const N = COLS * ROWS;
const INF = 1e9;
const DIR_LIST = [DIRS.up, DIRS.left, DIRS.down, DIRS.right];
const NAMES = { blinky: 'BLINKY', pinky: 'PINKY', inky: 'INKY', clyde: 'CLYDE' };
const EXIT_COLS = [13, 14];
const EXIT_ROW = 11;

// Tuning (ticks at 60 Hz; one tile is roughly 8 to 10 ticks).
const DEFAULTS = {
  deadly: 10, // margin below this: a collision is likely
  caution: 44, // margin below this costs extra
  deadlyCost: 1500,
  cautionWeight: 3,
  energizerAvoid: 220, // cost to pass a power pellet we want to save
  energizerWant: 320, // bonus for a power pellet when threatened
  threat: 110, // a ghost could reach Pac-Man's tile within this many ticks
  huntBonus: 460,
  huntSlack: 36, // must reach a frightened ghost this long before fright ends
  fruitBonus: 160,
  escDepth: 16, // tiles Pac-Man must be able to keep running after a goal
  escPause: 0.5, // extra ticks per tile in that check (dots slow Pac-Man down)
  fleeDepth: 18,
  escMargin: 8,
  reversePenalty: 6,
  fleeKeep: 20,
  predHorizon: 260, // ticks of ghost look-ahead
  hShort: 40, // worst-case reach is trusted fully this far ahead
  inflate: 3, // and discounted by this factor beyond it
  fleeRadius: 150, // flee mode only scores tiles Pac-Man can reach this soon
  maxChecks: 18,};

const wrapCol = (c) => ((c % COLS) + COLS) % COLS;

export function createAutopilot(maze, tune = null) {
  const T = { ...DEFAULTS, ...(tune || {}) };
  // --- static maze graph ---
  const walk = new Uint8Array(N);
  const nbr = new Int16Array(N * 4).fill(-1);
  const edgeLen = new Uint8Array(N * 4);
  const tunnel = new Uint8Array(N);
  const keyToIdx = new Map();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (maze.pacCanEnter(c, r)) walk[i] = 1;
      keyToIdx.set(`${c},${r}`, i);
      if (r === 14 && (c <= 5 || c >= 22)) tunnel[i] = 1;
    }
  }
  for (let i = 0; i < N; i++) {
    if (!walk[i]) continue;
    const c = i % COLS, r = (i / COLS) | 0;
    for (let k = 0; k < 4; k++) {
      let nc = c + DIR_LIST[k].x;
      const nr = r + DIR_LIST[k].y;
      if (nr === 14) nc = wrapCol(nc);
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const j = nr * COLS + nc;
      if (walk[j]) {
        nbr[i * 4 + k] = j;
        // The tunnel wrap is about three tiles of travel (off one edge, on the other).
        edgeLen[i * 4 + k] = Math.abs(nc - c) > 1 ? 3 : 1;
      }
    }
  }
  const walkList = [];
  for (let i = 0; i < N; i++) if (walk[i]) walkList.push(i);

  // --- scratch buffers (allocated once) ---
  const heapT = new Float64Array(N * 8);
  const heapV = new Int32Array(N * 8);
  let hn = 0;
  const done = new Uint8Array(N);
  const fields = [0, 1, 2, 3].map(() => new Float64Array(N));
  const tgMin = new Float64Array(N);
  const tgWho = new Int8Array(N);
  const cost = new Float64Array(N);
  const time = new Float64Array(N);
  const prev = new Int16Array(N);
  const pellet = new Uint8Array(N); // 1 dot, 2 power pellet
  const margin = new Float32Array(N); // for the overlay
  const seen = new Int32Array(N);
  let seenGen = 1;
  const queue = new Int16Array(N);
  const nextQueue = new Int16Array(N);

  function push(t, v) {
    let i = hn++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapT[p] <= t) break;
      heapT[i] = heapT[p]; heapV[i] = heapV[p];
      i = p;
    }
    heapT[i] = t; heapV[i] = v;
  }
  function pop() {
    const v = heapV[0];
    const t = heapT[--hn];
    const val = heapV[hn];
    let i = 0;
    for (;;) {
      let ch = 2 * i + 1;
      if (ch >= hn) break;
      if (ch + 1 < hn && heapT[ch + 1] < heapT[ch]) ch++;
      if (heapT[ch] >= t) break;
      heapT[i] = heapT[ch]; heapV[i] = heapV[ch];
      i = ch;
    }
    heapT[i] = t; heapV[i] = val;
    return v;
  }

  const idxOf = (x, y) => {
    const r = Math.floor((y - MAZE_Y) / TILE);
    const c = wrapCol(Math.floor(x / TILE));
    return r * COLS + c;
  };

  // --- state shown by the overlay and debug hooks ---
  const st = {
    off: false, // a human took over
    overlay: true,
    path: [],
    goal: -1,
    kind: 'none',
    thought: '',
    color: '#ffffff',
    hasPlan: false,
    lastTile: -1,
    lastPlanTick: -999,
    lastSig: '',
    plans: 0,
    ticks: 0,
    totalMs: 0,
    maxMs: 0,
    warmMaxMs: 0, // worst tick after the first 120 (JIT warm-up excluded)
    over1: 0,
    over2: 0,
    planMs: 0,
    maxPlanMs: 0,
    takeoverTick: 0,
  };

  // Earliest-arrival Dijkstra for one ghost. Seeds are [idx, ticks] pairs.
  // `ticksAt(idx)` is the time to cross one tile starting in tile idx.
  function ghostDijkstra(out, seeds, block, ticksAt) {
    out.fill(INF);
    done.fill(0);
    hn = 0;
    if (block >= 0) { out[block] = 0; done[block] = 1; }
    for (const [i, t] of seeds) {
      if (i >= 0 && t < out[i]) { out[i] = t; push(t, i); }
    }
    while (hn > 0) {
      const u = pop();
      if (done[u]) continue;
      done[u] = 1;
      const tu = out[u];
      const step = ticksAt(u);
      for (let k = 0; k < 4; k++) {
        const v = nbr[u * 4 + k];
        if (v < 0 || done[v]) continue;
        const tv = tu + step * edgeLen[u * 4 + k];
        if (tv < out[v]) { out[v] = tv; push(tv, v); }
      }
    }
  }

  // Ticks until a ghost in or around the house is back out above the door.
  function houseDelay(g, s) {
    if (g.state === 'eyes') {
      const e = idxOf(g.x, g.y);
      const er = (e / COLS) | 0, ec = e % COLS;
      const manhattan = Math.abs(er - EXIT_ROW) + Math.abs(ec - 13.5);
      return (manhattan * TILE) / (1.6 * BASE_SPEED) + 15 + 75;
    }
    if (g.state === 'entering') return 15 + 75;
    const exit = (Math.abs(g.x - s.doorX) + Math.max(0, g.y - s.exitY)) / 0.45;
    if (g.state === 'leaving') return exit;
    // home: waiting on a dot counter or the no-dot timer
    return (s.homeWait[g.name] ?? 240) + exit;
  }

  function ghostField(g, s, out) {
    const sp = s.spec.speeds;
    const F = s.frightTimer;
    const isBlinky = g.name === 'blinky';
    const normalPct = isBlinky && g.elroy === 2 ? sp.elroy2 : isBlinky && g.elroy === 1 ? sp.elroy1 : sp.ghost;
    const vN = BASE_SPEED * normalPct;
    const vT = BASE_SPEED * sp.ghostTunnel;
    const vF = BASE_SPEED * sp.ghostFright;
    const ticksNormal = (i) => TILE / (tunnel[i] ? vT : vN);
    const ticksFright = (i) => TILE / (tunnel[i] ? vT : vF);

    if (g.state === 'normal') {
      const G = idxOf(g.x, g.y);
      const c = Math.floor(g.x / TILE), r = Math.floor((g.y - MAZE_Y) / TILE);
      const cx = c * TILE + TILE / 2, cy = MAZE_Y + r * TILE + TILE / 2;
      const off = (g.x - cx) * g.dir.x + (g.y - cy) * g.dir.y; // >0: past center
      const v = g.frightened ? (tunnel[G] ? vT : vF) : (tunnel[G] ? vT : vN);
      const seeds = [];
      for (let k = 0; k < 4; k++) {
        const j = walk[G] ? nbr[G * 4 + k] : -1;
        if (j < 0) continue;
        const d = DIR_LIST[k];
        if (d.x === -g.dir.x && d.y === -g.dir.y) {
          // Only a scatter/chase flip reverses a ghost in play.
          if (!g.frightened && s.flipIn < INF) seeds.push([j, s.flipIn + (TILE + off) / v]);
        } else if (d.x === g.dir.x && d.y === g.dir.y) {
          seeds.push([j, Math.max(0, TILE - off) / v]);
        } else if (off <= 0.01) {
          seeds.push([j, (TILE - off) / v]);
        }
      }
      // Off-grid (tunnel overrun): let it go both ways along the row.
      if (!walk[G]) {
        const r14 = 14 * COLS;
        seeds.push([r14 + 0, 4], [r14 + COLS - 1, 4]);
      }
      ghostDijkstra(out, seeds, walk[G] ? G : -1, g.frightened ? ticksFright : ticksNormal);
      if (g.frightened) {
        // Harmless until fright ends, then it moves at full speed.
        const ratio = vF / vN;
        for (const i of walkList) {
          const t = out[i];
          if (t >= INF) continue;
          out[i] = t <= F ? F : F + (t - F) * ratio;
        }
      }
      return;
    }

    // In or around the house: it reappears above the door after a delay.
    const delay = houseDelay(g, s);
    const seeds = EXIT_COLS.map((c) => [EXIT_ROW * COLS + c, delay]);
    ghostDijkstra(out, seeds, -1, ticksNormal);
    if (g.frightened && F > 0) {
      for (const i of walkList) if (out[i] < F) out[i] = F;
    }
  }

  // --- look-ahead: replay each ghost's real targeting rules tile by tile ---
  const pred = [0, 1, 2, 3].map(() => new Float64Array(N));
  const blinkyTrack = []; // flat [t, col, row, ...] of Blinky's predicted tiles (Inky needs it)
  let prevPlan = null; // { tiles, times, dirs, tick } from the last plan
  const SCATTER = { blinky: [25, -3], pinky: [2, -3], inky: [27, 32], clyde: [0, 32] };
  const dirIndex = (d) => (d.y === -1 ? 0 : d.x === -1 ? 1 : d.y === 1 ? 2 : 3);

  // Where Pac-Man will be `t` ticks from now, assuming it follows its last plan.
  function pacAt(t, s, tick, out) {
    const pc = wrapCol(Math.floor(s.pac.x / TILE));
    const pr = Math.floor((s.pac.y - MAZE_Y) / TILE);
    out.col = pc; out.row = pr; out.dir = s.pac.dir;
    if (!prevPlan) return out;
    const e = tick - prevPlan.tick + t;
    const { tiles, times, dirs } = prevPlan;
    let i = -1;
    while (i + 1 < tiles.length && times[i + 1] <= e) i++;
    if (i < 0) return out;
    out.col = tiles[i] % COLS; out.row = (tiles[i] / COLS) | 0; out.dir = dirs[i];
    return out;
  }

  function blinkyAt(t, fallback) {
    let c = fallback.c, r = fallback.r;
    for (let k = 0; k < blinkyTrack.length; k += 3) {
      if (blinkyTrack[k] > t) break;
      c = blinkyTrack[k + 1]; r = blinkyTrack[k + 2];
    }
    return { c, r };
  }

  // Mirrors ghostTarget() in ghosts.js, against predicted positions.
  const pp = { col: 0, row: 0, dir: DIRS.left };
  function targetFor(name, mode, c, r, t, s, tick, blinkyNow) {
    if (mode === 'scatter') return SCATTER[name];
    pacAt(t, s, tick, pp);
    const pd = pp.dir;
    switch (name) {
      case 'pinky': return [pp.col + pd.x * 4 - (pd.y === -1 ? 4 : 0), pp.row + pd.y * 4];
      case 'inky': {
        const pcol = pp.col + pd.x * 2 - (pd.y === -1 ? 2 : 0);
        const prow = pp.row + pd.y * 2;
        const b = blinkyAt(t, blinkyNow);
        return [pcol * 2 - b.c, prow * 2 - b.r];
      }
      case 'clyde': {
        const d2 = (c - pp.col) ** 2 + (r - pp.row) ** 2;
        return d2 > 64 ? [pp.col, pp.row] : SCATTER.clyde;
      }
      default: return [pp.col, pp.row];
    }
  }

  // Tile-by-tile replay of one ghost: up>left>down>right tie-break, no
  // reversing, the red-zone rule, and the reversal at the next mode flip.
  function simulateGhost(g, init, s, tick, out, blinkyNow) {
    out.fill(INF);
    const sp = s.spec.speeds;
    const isBlinky = g.name === 'blinky';
    const pct = isBlinky && g.elroy === 2 ? sp.elroy2 : isBlinky && g.elroy === 1 ? sp.elroy1 : sp.ghost;
    const vN = BASE_SPEED * pct;
    const vT = BASE_SPEED * sp.ghostTunnel;
    let { i, dir, t } = init;
    let needDecide = !init.decided;
    let mode = s.mode;
    let flipped = s.flipIn >= INF;
    out[i] = Math.max(0, t);
    for (let guard = 0; guard < 60 && t < T.predHorizon; guard++) {
      if (!flipped && s.flipIn <= t) {
        flipped = true;
        mode = mode === 'scatter' ? 'chase' : 'scatter';
        dir = { x: -dir.x, y: -dir.y };
        needDecide = false;
      }
      const c = i % COLS, r = (i / COLS) | 0;
      if (needDecide) {
        let best = null, bestD = INF, count = 0, only = null;
        const tm = isBlinky && g.elroy > 0 ? 'chase' : mode;
        let target = null;
        for (let k = 0; k < 4; k++) {
          const d = DIR_LIST[k];
          if (d.x === -dir.x && d.y === -dir.y) continue;
          if (nbr[i * 4 + k] < 0) continue;
          if (k === 0 && maze.isRedZone(c, r)) continue;
          count++;
          only = d;
          if (!target) target = targetFor(g.name, tm, c, r, t, s, tick, blinkyNow);
          const dd = (c + d.x - target[0]) ** 2 + (r + d.y - target[1]) ** 2;
          if (dd < bestD) { bestD = dd; best = d; }
        }
        dir = count === 0 ? { x: -dir.x, y: -dir.y } : count === 1 ? only : best;
      }
      needDecide = true;
      const k = dirIndex(dir);
      const j = nbr[i * 4 + k];
      if (j < 0) { dir = { x: -dir.x, y: -dir.y }; continue; }
      t += (TILE * edgeLen[i * 4 + k]) / (tunnel[i] ? vT : vN);
      i = j;
      if (t < out[i]) out[i] = t;
      if (isBlinky) blinkyTrack.push(t, i % COLS, (i / COLS) | 0);
    }
  }

  function predictGhost(g, s, tick, out, blinkyNow) {
    if (g.frightened) { out.fill(INF); return; }
    if (g.state === 'normal') {
      const c = Math.floor(g.x / TILE), r = Math.floor((g.y - MAZE_Y) / TILE);
      const i = r * COLS + wrapCol(c);
      if (!walk[i]) { out.fill(INF); return; }
      const cx = c * TILE + TILE / 2, cy = MAZE_Y + r * TILE + TILE / 2;
      const off = (g.x - cx) * g.dir.x + (g.y - cy) * g.dir.y;
      const sp = s.spec.speeds;
      const v = BASE_SPEED * (tunnel[i] ? sp.ghostTunnel : sp.ghost);
      simulateGhost(g, { i, dir: g.dir, t: -off / v, decided: g._decidedKey === `${c},${r}` }, s, tick, out, blinkyNow);
      return;
    }
    // Leaving/returning ghosts: replay from the exit above the door.
    const delay = houseDelay(g, s);
    simulateGhost(g, { i: EXIT_ROW * COLS + 14, dir: DIRS.left, t: delay, decided: false }, s, tick, out, blinkyNow);
  }

  function penalty(m) {
    if (m < T.deadly) return T.deadlyCost + (T.deadly - m) * 20;
    if (m < T.caution) return (T.caution - m) * T.cautionWeight;
    return 0;
  }

  // How many tiles Pac-Man can keep running from `x` (arriving at t0) while
  // staying ahead of every ghost's earliest arrival.
  function escapeDepth(x, t0, maxD, tileTicks, powerSaves) {
    seenGen++;
    let qn = 1;
    queue[0] = x;
    seen[x] = seenGen;
    let depth = 0;
    for (let d = 1; d <= maxD; d++) {
      const t = t0 + d * tileTicks;
      let nn = 0;
      for (let q = 0; q < qn; q++) {
        const u = queue[q];
        for (let k = 0; k < 4; k++) {
          const v = nbr[u * 4 + k];
          if (v < 0 || seen[v] === seenGen) continue;
          if (tgMin[v] - t < T.escMargin) continue;
          if (powerSaves && pellet[v] === 2) return maxD; // reaching a power pellet first is an escape
          seen[v] = seenGen;
          nextQueue[nn++] = v;
        }
      }
      if (nn === 0) break;
      depth = d;
      for (let q = 0; q < nn; q++) queue[q] = nextQueue[q];
      qn = nn;
    }
    return depth;
  }

  function plan(s, tick) {
    const t0 = performance.now();
    const { pac, ghosts, spec } = s;
    const F = s.frightTimer;

    // Pellet map.
    pellet.fill(0);
    for (const key of s.dots) pellet[keyToIdx.get(key)] = 1;
    for (const key of s.energizers) pellet[keyToIdx.get(key)] = 2;
    const dotsLeft = s.dots.size;

    // Threat fields: the predicted route is trusted; any other route a ghost
    // could take is trusted fully for the first few tiles and discounted after.
    tgMin.fill(INF);
    tgWho.fill(-1);
    blinkyTrack.length = 0;
    const b0 = ghosts.find((g) => g.name === 'blinky');
    const blinkyNow = { c: wrapCol(Math.floor(b0.x / TILE)), r: Math.floor((b0.y - MAZE_Y) / TILE) };
    for (let gi = 0; gi < ghosts.length; gi++) {
      const out = fields[gi];
      const pr = pred[gi];
      ghostField(ghosts[gi], s, out);
      predictGhost(ghosts[gi], s, tick, pr, blinkyNow);
      for (const i of walkList) {
        const w = out[i];
        let eff = w <= T.hShort ? w : T.hShort + (w - T.hShort) * T.inflate;
        if (pr[i] < eff) eff = pr[i];
        out[i] = eff;
        if (eff < tgMin[i]) { tgMin[i] = eff; tgWho[i] = gi; }
      }
    }

    // Pac-Man's Dijkstra (cost = time + danger), from its current tile.
    const P = idxOf(pac.x, pac.y);
    const pc = Math.floor(pac.x / TILE), pr = Math.floor((pac.y - MAZE_Y) / TILE);
    const pcx = pc * TILE + TILE / 2, pcy = MAZE_Y + pr * TILE + TILE / 2;
    const off = (pac.x - pcx) * pac.dir.x + (pac.y - pcy) * pac.dir.y;
    const vFr = BASE_SPEED * spec.speeds.pacFright;
    const vNo = BASE_SPEED * spec.speeds.pac;
    const pacV = (t) => (t < F ? vFr : vNo);
    const threatAtPac = walk[P] ? tgMin[P] : INF;
    const threatened = threatAtPac < T.threat;
    const anyNormalOut = ghosts.some((g) => g.state === 'normal' && !g.frightened);
    const wantEnergizer = (threatened && (F === 0 || F < 90) && anyNormalOut) || dotsLeft === 0;
    const pause = (i) => (pellet[i] === 1 ? 1 : pellet[i] === 2 ? 3 : 0);

    // A pellet on Pac-Man's own tile is eaten on its next step: not a goal.
    if (walk[P] && pellet[P]) pellet[P] = 0;

    cost.fill(INF);
    time.fill(INF);
    prev.fill(-1);
    done.fill(0);
    hn = 0;
    if (!walk[P]) {
      // In the tunnel overrun: just keep going.
      st.hasPlan = false;
      return;
    }
    cost[P] = 0;
    time[P] = 0;
    done[P] = 1;
    margin.fill(INF);
    for (let k = 0; k < 4; k++) {
      const j = nbr[P * 4 + k];
      if (j < 0) continue;
      const d = DIR_LIST[k];
      let px;
      let extra = 0;
      if (d.x === pac.dir.x && d.y === pac.dir.y) px = TILE - off;
      else if (d.x === -pac.dir.x && d.y === -pac.dir.y) { px = TILE + off; extra = T.reversePenalty; }
      else px = TILE + Math.abs(off);
      const tv = Math.max(1, px) / pacV(0) + pause(j);
      const m = tgMin[j] - tv;
      let cv = tv + penalty(m) + extra;
      if (pellet[j] === 2 && !wantEnergizer) cv += T.energizerAvoid;
      if (cv < cost[j]) { cost[j] = cv; time[j] = tv; prev[j] = P; push(cv, j); }
    }
    while (hn > 0) {
      const u = pop();
      if (done[u]) continue;
      done[u] = 1;
      const tu = time[u];
      const step = TILE / pacV(tu);
      for (let k = 0; k < 4; k++) {
        const v = nbr[u * 4 + k];
        if (v < 0 || done[v]) continue;
        const tv = tu + step * edgeLen[u * 4 + k] + pause(v);
        const m = tgMin[v] - tv;
        let cv = cost[u] + (tv - tu) + penalty(m);
        if (pellet[v] === 2 && !wantEnergizer) cv += T.energizerAvoid;
        if (cv < cost[v]) { cost[v] = cv; time[v] = tv; prev[v] = u; push(cv, v); }
      }
    }
    for (const i of walkList) margin[i] = tgMin[i] - time[i];
    margin[P] = tgMin[P];

    // Candidate goals.
    const cands = [];
    let nearestPellet = -1;
    let nearestTime = INF;
    for (const i of walkList) {
      if (pellet[i] === 1 || (pellet[i] === 2 && dotsLeft === 0)) {
        cands.push({ i, score: cost[i], kind: 'dot' });
        if (time[i] < nearestTime) { nearestTime = time[i]; nearestPellet = i; }
      } else if (pellet[i] === 2) {
        // Saved for when a ghost closes in; otherwise a last resort.
        if (wantEnergizer) cands.push({ i, score: cost[i] - T.energizerWant, kind: 'power', noEsc: true });
        else cands.push({ i, score: cost[i] + 400, kind: 'dot' });
      }
    }
    for (let gi = 0; gi < ghosts.length; gi++) {
      const g = ghosts[gi];
      if (g.state !== 'normal' || !g.frightened) continue;
      const i = idxOf(g.x, g.y);
      if (!walk[i] || time[i] > F - T.huntSlack) continue;
      cands.push({ i, score: cost[i] - T.huntBonus, kind: 'hunt', name: g.name });
    }
    if (s.fruit) {
      for (const c of [13, 14]) {
        const i = 17 * COLS + c;
        if (time[i] < s.fruit.timer - 10) cands.push({ i, score: cost[i] - T.fruitBonus, kind: 'fruit' });
      }
    }
    cands.sort((a, b) => a.score - b.score);

    let chosen = null;
    const tileTicks = TILE / vNo + T.escPause;
    const powerSaves = spec.frightSeconds > 0;
    let checks = 0;
    for (const cnd of cands) {
      if (cost[cnd.i] >= T.deadlyCost) continue; // its path crosses a deadly tile
      if (cnd.noEsc || escapeDepth(cnd.i, time[cnd.i], T.escDepth, tileTicks, powerSaves) >= T.escDepth) {
        chosen = cnd;
        break;
      }
      if (++checks >= T.maxChecks) break;
    }

    let kind;
    let goal;
    if (chosen) {
      kind = chosen.kind;
      goal = chosen.i;
      st.fleeGoal = -1;
    } else {
      // Flee: the reachable tile with the most room to keep running.
      let best = -1, bestVal = -INF, keepVal = -INF;
      for (const i of walkList) {
        if (i === P || cost[i] >= T.deadlyCost || time[i] > T.fleeRadius) continue;
        const depth = escapeDepth(i, time[i], T.fleeDepth, tileTicks, powerSaves);
        const val = depth * 12 + Math.min(margin[i], 90) + (pellet[i] === 2 ? 150 : 0) - time[i] * 0.05;
        if (val > bestVal) { bestVal = val; best = i; }
        if (i === st.fleeGoal) keepVal = val;
      }
      // Hysteresis: don't flip between near-equal refuges (that dithers in place).
      if (keepVal > -INF && keepVal >= bestVal - T.fleeKeep) best = st.fleeGoal;
      st.fleeGoal = best;
      if (best >= 0) {
        kind = pellet[best] === 2 ? 'power' : 'flee';
        goal = best;
      } else {
        // Every route is covered: take the neighbor that buys the most time.
        let bv = -INF;
        for (let k = 0; k < 4; k++) {
          const j = nbr[P * 4 + k];
          if (j >= 0 && tgMin[j] - time[j] > bv) { bv = tgMin[j] - time[j]; best = j; }
        }
        kind = 'trapped';
        goal = best;
      }
    }

    // Reconstruct the path and the first move.
    const path = [];
    for (let i = goal; i >= 0 && i !== P && path.length < N; i = prev[i]) path.push(i);
    path.reverse();
    let dir = null;
    if (path.length) {
      for (let k = 0; k < 4; k++) if (nbr[P * 4 + k] === path[0]) dir = DIR_LIST[k];
    }
    // Remember the route so the next plan can predict ghost targets from it.
    const ptiles = [P], ptimes = [0], pdirs = [pac.dir];
    let from = P;
    for (const i of path) {
      let d = pdirs[pdirs.length - 1];
      for (let k = 0; k < 4; k++) if (nbr[from * 4 + k] === i) d = DIR_LIST[k];
      ptiles.push(i); ptimes.push(time[i]); pdirs.push(d);
      from = i;
    }
    prevPlan = { tiles: ptiles, times: ptimes, dirs: pdirs, tick };

    // The thought line, named from what the search found.
    const who = (i) => (i >= 0 && tgWho[i] >= 0 ? NAMES[ghosts[tgWho[i]].name] : null);
    const threatName = who(P);
    const tiles = path.length;
    const tl = (n) => `${n} TILE${n === 1 ? '' : 'S'}`;
    let thought, color;
    switch (kind) {
      case 'hunt':
        thought = `HUNT ${NAMES[chosen.name]} ${tl(tiles)}`;
        color = '#8fb8ff';
        break;
      case 'power':
        thought = threatName ? `FLEE ${threatName} > POWER PELLET` : `GO FOR POWER PELLET ${tl(tiles)}`;
        color = '#ffb8ae';
        break;
      case 'fruit':
        thought = `GRAB FRUIT ${tl(tiles)}`;
        color = '#7dff7d';
        break;
      case 'flee':
        thought = threatName ? `FLEE ${threatName} > OPEN SPACE` : 'FLEE > OPEN SPACE';
        color = '#ff6b6b';
        break;
      case 'trapped':
        thought = threatName ? `CORNERED BY ${threatName}` : 'CORNERED';
        color = '#ff3b3b';
        break;
      default: {
        const skipped = nearestPellet >= 0 && nearestPellet !== goal && time[goal] > nearestTime + 12;
        const danger = who(nearestPellet);
        if (skipped && danger) thought = `AVOID ${danger} > DOT ${tl(tiles)}`;
        else if (threatened && threatName) thought = `DODGE ${threatName} > DOT ${tl(tiles)}`;
        else thought = `NEAREST SAFE DOT ${tl(tiles)}`;
        color = '#f8f8ff';
      }
    }

    st.path = path;
    st.goal = goal;
    st.kind = kind;
    st.thought = thought;
    st.color = color;
    st.dir = dir;
    st.hasPlan = true;
    st.plans++;
    st.lastPlanTick = tick;
    const ms = performance.now() - t0;
    st.planMs = ms;
    if (ms > st.maxPlanMs) st.maxPlanMs = ms;
  }

  // A cheap signature of discrete events that should trigger a replan.
  function signature(s) {
    let sig = s.frightTimer > 0 ? 'F' : 'N';
    sig += s.flipIn < 2 ? 'x' : '';
    for (const g of s.ghosts) sig += g.state[0] + (g.frightened ? 1 : 0);
    if (s.fruit) sig += 'f';
    return sig;
  }

  return {
    get active() { return !st.off; },
    get overlay() { return st.overlay; },
    state: st,
    takeOver(tick) {
      if (st.off) return;
      st.off = true;
      st.takeoverTick = tick;
    },
    toggleOverlay() { st.overlay = !st.overlay; },

    // Called once per play tick before Pac-Man moves. Returns the direction
    // to request (a DIRS entry) or null to leave the current request alone.
    update(s, tick) {
      if (st.off) return null;
      // In the off-screen stretch of the tunnel: keep going, plan on re-entry.
      if (s.pac.x < 0 || s.pac.x >= COLS * TILE) return null;
      const t0 = performance.now();
      const P = idxOf(s.pac.x, s.pac.y);
      const sig = signature(s);
      if (P !== st.lastTile || sig !== st.lastSig || tick - st.lastPlanTick >= 8) {
        plan(s, tick);
        st.lastTile = P;
        st.lastSig = sig;
      }
      const ms = performance.now() - t0;
      st.ticks++;
      st.totalMs += ms;
      if (ms > st.maxMs) st.maxMs = ms;
      if (st.ticks > 120 && ms > st.warmMaxMs) st.warmMaxMs = ms;
      if (ms > 1) st.over1++;
      if (ms > 2) st.over2++;
      return st.hasPlan ? st.dir : null;
    },

    // Danger tint and planned path, drawn between the maze and the actors.
    drawUnder(ctx, pac) {
      if (st.off || !st.overlay || !st.hasPlan) return;
      ctx.save();
      for (const i of walkList) {
        const m = margin[i];
        if (m >= T.caution) continue;
        const k = Math.min(1, (T.caution - m) / T.caution);
        ctx.fillStyle = `rgba(255, 40, 60, ${(0.06 + 0.16 * k).toFixed(3)})`;
        ctx.fillRect((i % COLS) * TILE, MAZE_Y + ((i / COLS) | 0) * TILE, TILE, TILE);
      }
      const path = st.path;
      if (path.length) {
        ctx.strokeStyle = st.color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1;
        ctx.beginPath();
        let lx = Math.round(pac.x), ly = Math.round(pac.y);
        ctx.moveTo(lx + 0.5, ly + 0.5);
        for (const i of path) {
          const x = (i % COLS) * TILE + TILE / 2;
          const y = MAZE_Y + ((i / COLS) | 0) * TILE + TILE / 2;
          if (Math.abs(x - lx) > TILE * 2) ctx.moveTo(x + 0.5, y + 0.5); // tunnel wrap
          else if (x !== lx && y !== ly) { ctx.lineTo(x + 0.5, ly + 0.5); ctx.lineTo(x + 0.5, y + 0.5); }
          else ctx.lineTo(x + 0.5, y + 0.5);
          lx = x; ly = y;
        }
        ctx.stroke();
        // Goal marker: corner brackets around the goal tile.
        const g = path[path.length - 1];
        const gx = (g % COLS) * TILE, gy = MAZE_Y + ((g / COLS) | 0) * TILE;
        ctx.globalAlpha = 1;
        ctx.fillStyle = st.color;
        for (const [x, y] of [[gx - 1, gy - 1], [gx + 6, gy - 1], [gx - 1, gy + 6], [gx + 6, gy + 6]]) {
          ctx.fillRect(x, y, 3, 1);
          ctx.fillRect(x + (x < gx ? 0 : 2), y + (y < gy ? 0 : -2), 1, 3);
        }
      }
      ctx.restore();
    },

    // The thought line in the free HUD row above the maze.
    drawOver(ctx, W, tick, phase) {
      const y = 2 * TILE;
      if (st.off) {
        const age = tick - st.takeoverTick;
        const color = age < 180 ? (Math.floor(age / 15) % 2 === 0 ? '#ffff00' : '#f8f8ff') : '#7a7a8c';
        drawThought(ctx, 'YOU HAVE CONTROL', W / 2, y, color, 'center');
        return;
      }
      if (phase === 'levelclear') return;
      if (phase === 'ready') {
        const msg = Math.floor(tick / 90) % 2 === 0 ? 'ARROW OR SWIPE TO TAKE OVER' : 'O SHOWS OR HIDES THOUGHTS';
        drawThought(ctx, msg, W / 2, y, '#ffff00', 'center');
        return;
      }
      if (!st.overlay) {
        drawThought(ctx, 'AI PLAYING', W / 2, y, '#7a7a8c', 'center');
        return;
      }
      if (st.hasPlan && st.thought) drawThought(ctx, st.thought, W / 2, y, st.color, 'center');
    },

    stats() {
      return {
        kind: st.kind,
        thought: st.thought,
        off: st.off,
        overlay: st.overlay,
        path: st.path.map((i) => ({ col: i % COLS, row: (i / COLS) | 0 })),
        plans: st.plans,
        ticks: st.ticks,
        avgMs: st.ticks ? st.totalMs / st.ticks : 0,
        maxMs: st.maxMs,
        warmMaxMs: st.warmMaxMs,
        over1: st.over1,
        over2: st.over2,
        lastPlanMs: st.planMs,
        maxPlanMs: st.maxPlanMs,
      };
    },
  };
}

// The cabinet font has no '>' or '+'; draw those two glyphs here in the same
// 5x7-in-8px cell style.
const EXTRA_GLYPHS = {
  '>': [0x10, 0x08, 0x04, 0x02, 0x04, 0x08, 0x10],
  '+': [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
};

function drawThought(ctx, text, x, y, color, align = 'left') {
  const str = String(text).toUpperCase();
  const width = str.length * TILE;
  const x0 = align === 'center' ? Math.round(x - width / 2) : x;
  drawText(ctx, str, x0, y, { color });
  ctx.fillStyle = color;
  for (let n = 0; n < str.length; n++) {
    const rows = EXTRA_GLYPHS[str[n]];
    if (!rows) continue;
    const cx = x0 + n * TILE;
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (rows[r] & (1 << (4 - c))) ctx.fillRect(cx + c + 1, y + r + 1, 1, 1);
      }
    }
  }
}
