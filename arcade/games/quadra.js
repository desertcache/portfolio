// QUADRA: falling-block puzzle. Ten-wide, twenty-tall well, seven four-square
// shapes from a seeded 7-bag, hold, ghost, wall kicks, lock delay with a reset
// cap, DAS/ARR, back-to-back and combo scoring. Flat ink-outlined tiles in a
// desert-night palette (no bevels, no gloss).

// ---------------------------------------------------------------- constants
const COLS = 10;
const ROWS = 22; // two hidden rows above the 20 visible ones
const HID = 2;
const CELL = 24;
const WX = 280; // well left edge (logical px)
const WY = 10; // well top edge (top of the first visible row)
const WW = COLS * CELL;
const WH = (ROWS - HID) * CELL;

const DAS = 9; // ticks before auto-repeat starts
const ARR = 2; // ticks between auto-repeat steps
const LOCK_DELAY = 30; // ticks of grace on the ground
const MAX_RESETS = 15; // move/rotate resets allowed per ground contact
const SOFT_RATE = 0.6; // rows per tick while soft-dropping
const CLEAR_TICKS = 28;
const ENTRY_DELAY = 5;

const INK = '#0b0716';
const NIGHT = '#150f24';
const WELL_BG = '#1d1535';
const GRID = '#2a2045';
const SAND = '#e8d5b0';
const SAND_DIM = '#a89a82';
const GOLD = '#ffb547';
const MONO = 'ui-monospace, "Martian Mono", "SF Mono", Menlo, Consolas, monospace';

// Desert-night palette, one color per shape.
const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const COLORS = {
  I: '#46e0d8', // teal
  O: '#ffb547', // gold
  T: '#ff5c93', // rose
  S: '#8fae6e', // sage
  Z: '#ff7a45', // sunset
  J: '#a8401d', // red rock
  L: '#e8d5b0', // sand
};

const BASE = {
  I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 4, c: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

// SHAPES[type][rot] = four [x, y] cells inside the type's box. Rotating
// clockwise maps (x, y) to (n - 1 - y, x).
const SHAPES = {};
for (const t of TYPES) {
  const { n, c } = BASE[t];
  const rots = [c];
  for (let r = 1; r < 4; r++) rots.push(rots[r - 1].map(([x, y]) => [n - 1 - y, x]));
  SHAPES[t] = rots;
}

// Wall-kick offsets, "from>to" rotation states. Written y-up; converted to
// screen space (y down) when applied.
const KICKS_JLSTZ = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

const LINE_BASE = [0, 100, 300, 500, 800];
const LINE_NAME = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUADRA!'];

function gravity(level) {
  const l = Math.min(Math.max(level, 1), 30);
  const sec = Math.pow(0.8 - (l - 1) * 0.007, l - 1);
  return Math.min(20, 1 / (sec * 60));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------- game
export default {
  id: 'QUADRA',
  title: 'QUADRA',
  mode: 'landscape',
  ownHud: true, // score, level, lines, next and hold live in-canvas
  start(env) {
    const { ctx, W, H } = env;
    const params = new URLSearchParams(location.search);
    const hasTouch = (navigator.maxTouchPoints || 0) > 0;

    let rng = Math.random;
    let seedUsed = null;
    function seedRng(seed) {
      seedUsed = seed;
      rng = mulberry32(seed);
    }
    if (env.debug) seedRng(parseInt(params.get('seed'), 10) || 1337);

    // The state object is exposed in debug mode, so everything lives on it.
    const S = {
      board: [],
      piece: null,
      queue: [],
      hold: null,
      canHold: true,
      score: 0,
      level: 1,
      lines: 0,
      combo: -1,
      b2b: false,
      paused: false,
      over: false,
      ended: false,
      delay: 36,
      acc: 0,
      lockT: 0,
      resets: 0,
      lowest: 0,
      softDown: false,
      clear: null,
      popups: [],
      trails: [],
      frames: 0,
      dieT: 0,
      piecesPlaced: 0,
      quadras: 0,
      lastClear: 0,
      ghostY: 0,
      levelSfxAt: -1,
      tickMsMax: 0,
      tickMsAvg: 0,
      seed: null,
    };

    let dirty = true; // score needs pushing to the cabinet
    let tickMsSum = 0;
    let tickCount = 0;

    function emptyBoard() {
      return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
    }

    function newGame() {
      S.board = emptyBoard();
      S.piece = null;
      S.queue = [];
      S.hold = null;
      S.canHold = true;
      S.score = 0;
      S.level = 1;
      S.lines = 0;
      S.combo = -1;
      S.b2b = false;
      S.paused = false;
      S.over = false;
      S.ended = false;
      S.delay = 36;
      S.acc = 0;
      S.lockT = 0;
      S.resets = 0;
      S.lowest = 0;
      S.clear = null;
      S.popups = [];
      S.trails = [];
      S.dieT = 0;
      S.piecesPlaced = 0;
      S.quadras = 0;
      S.lastClear = 0;
      S.levelSfxAt = -1;
      S.seed = seedUsed;
      refillQueue();
      pushPopup('READY', GOLD, 26, 36);
      dirty = true;
    }

    // ---------------------------------------------------------- randomizer
    function refillQueue() {
      while (S.queue.length < 7) {
        const bag = TYPES.slice();
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        S.queue.push(...bag);
      }
    }

    // --------------------------------------------------------------- sound
    const sfx = {
      move: () => env.audio.play('quadra-move', (h) => h.tone({ f: 250, dur: 0.025, type: 'square', vol: 0.035 })),
      rotate: () => env.audio.play('quadra-rotate', (h) => h.tone({ f: 380, slideTo: 540, dur: 0.045, type: 'triangle', vol: 0.08 })),
      lock: () => env.audio.play('quadra-lock', (h) => h.tone({ f: 160, slideTo: 90, dur: 0.07, type: 'sine', vol: 0.13 })),
      hard: () => env.audio.play('quadra-hard', (h) => {
        h.noise({ dur: 0.09, vol: 0.1, filterFrom: 2600, filterTo: 200 });
        h.tone({ f: 120, slideTo: 55, dur: 0.1, type: 'triangle', vol: 0.15 });
      }),
      hold: () => env.audio.play('quadra-hold', (h) => h.seq([{ f: 330, type: 'triangle', vol: 0.08 }, { f: 495, type: 'triangle', vol: 0.08 }], 0.05)),
      clear: (n) => env.audio.play(`quadra-clear-${n}`, (h) => {
        const notes = [523, 659, 784, 988, 1175, 1319].slice(0, n + 1);
        h.seq(notes.map((f) => ({ f, type: 'square', vol: 0.07 })), 0.055);
      }),
      quadra: () => env.audio.play('quadra-quadra', (h) => {
        h.noise({ dur: 0.35, vol: 0.14, filterFrom: 5000, filterTo: 300 });
        h.seq([523, 659, 784, 1047, 1319, 1568].map((f) => ({ f, type: 'square', vol: 0.09 })), 0.06);
        h.tone({ f: 130, slideTo: 65, dur: 0.3, type: 'sawtooth', vol: 0.12 });
      }),
      levelup: () => env.audio.play('quadra-levelup', (h) => h.seq(
        [523, 659, 784, 1047, 1319].map((f) => ({ f, type: 'triangle', vol: 0.12, dur: 0.12 })), 0.085)),
      over: () => env.audio.play('quadra-over', (h) => {
        h.noise({ dur: 0.4, vol: 0.14 });
        h.tone({ f: 330, slideTo: 50, dur: 0.7, type: 'sawtooth', vol: 0.12 });
      }),
    };

    // --------------------------------------------------------- board logic
    function collides(type, rot, x, y) {
      const cells = SHAPES[type][rot];
      for (let i = 0; i < 4; i++) {
        const cx = x + cells[i][0];
        const cy = y + cells[i][1];
        if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
        if (cy >= 0 && S.board[cy][cx]) return true;
      }
      return false;
    }

    function ghostY(p) {
      let y = p.y;
      while (!collides(p.type, p.rot, p.x, y + 1)) y++;
      return y;
    }

    function pushPopup(text, color, size, life) {
      S.popups.push({ text, color, size, t: 0, life });
      if (S.popups.length > 4) S.popups.shift();
    }

    function place(type) {
      S.piece = { type, rot: 0, x: 3, y: 1 };
      S.acc = 0;
      S.lockT = 0;
      S.resets = 0;
      if (collides(type, 0, 3, 1)) {
        topOut();
        return;
      }
      if (!collides(type, 0, 3, 2)) S.piece.y = 2;
      S.lowest = S.piece.y;
      S.ghostY = ghostY(S.piece);
    }

    function spawnNext() {
      const type = S.queue.shift();
      refillQueue();
      place(type);
    }

    function topOut() {
      if (S.over) return;
      S.over = true;
      S.dieT = 0;
      S.softDown = false;
      env.fx.shake(7, 22);
      for (let c = 0; c < COLS; c++) {
        env.fx.burst(WX + c * CELL + CELL / 2, WY + 6 * CELL, 3, c % 2 ? '#ff7a45' : '#ff5c93', [1, 5], [24, 50]);
      }
      sfx.over();
    }

    function adjust() {
      // A successful move or rotate on the ground buys a fresh lock timer, up to the cap.
      const p = S.piece;
      S.ghostY = ghostY(p);
      if (collides(p.type, p.rot, p.x, p.y + 1) && S.resets < MAX_RESETS) {
        S.lockT = 0;
        S.resets++;
      }
    }

    function tryMove(dx) {
      const p = S.piece;
      if (!p || S.paused || S.over || S.clear) return false;
      if (collides(p.type, p.rot, p.x + dx, p.y)) return false;
      p.x += dx;
      adjust();
      return true;
    }

    function tryRotate(d) {
      const p = S.piece;
      if (!p || S.paused || S.over || S.clear || p.type === 'O') return false;
      const to = (p.rot + d + 4) % 4;
      const table = p.type === 'I' ? KICKS_I : KICKS_JLSTZ;
      const kicks = table[`${p.rot}${to}`];
      for (let i = 0; i < kicks.length; i++) {
        const nx = p.x + kicks[i][0];
        const ny = p.y - kicks[i][1];
        if (!collides(p.type, to, nx, ny)) {
          p.rot = to;
          p.x = nx;
          p.y = ny;
          if (p.y > S.lowest) { S.lowest = p.y; S.resets = 0; }
          adjust();
          sfx.rotate();
          return true;
        }
      }
      return false;
    }

    function hardDrop() {
      const p = S.piece;
      if (!p || S.paused || S.over || S.clear) return;
      const gy = ghostY(p);
      const dist = gy - p.y;
      // Streaks: flat fading bars through the path the piece fell.
      if (dist > 0) {
        for (const [cx, cy] of SHAPES[p.type][p.rot]) {
          S.trails.push({ x: p.x + cx, y0: p.y + cy, y1: gy + cy, color: COLORS[p.type], t: 0 });
        }
      }
      S.score += dist * 2;
      dirty = true;
      p.y = gy;
      env.fx.shake(2, 6);
      sfx.hard();
      lockPiece();
    }

    function doHold() {
      if (!S.piece || S.paused || S.over || S.clear || !S.canHold) return;
      const cur = S.piece.type;
      S.canHold = false;
      if (S.hold === null) {
        S.hold = cur;
        spawnNext();
      } else {
        const swap = S.hold;
        S.hold = cur;
        place(swap);
      }
      sfx.hold();
    }

    function lockPiece() {
      const p = S.piece;
      if (!p) return;
      let allHidden = true;
      for (const [cx, cy] of SHAPES[p.type][p.rot]) {
        const x = p.x + cx;
        const y = p.y + cy;
        if (y >= 0 && y < ROWS) S.board[y][x] = TYPES.indexOf(p.type) + 1;
        if (y >= HID) allHidden = false;
      }
      S.piece = null;
      S.piecesPlaced++;
      S.canHold = true;
      S.acc = 0;
      sfx.lock();
      if (allHidden) {
        topOut();
        return;
      }
      const full = [];
      for (let r = 0; r < ROWS; r++) {
        if (S.board[r].every((v) => v)) full.push(r);
      }
      if (full.length === 0) {
        S.combo = -1;
        S.delay = ENTRY_DELAY;
        return;
      }
      scoreClear(full.length);
      S.clear = { rows: full, t: 0, burst: false, cells: full.map((r) => S.board[r].slice()) };
    }

    function scoreClear(n) {
      const lvl = S.level;
      S.popups = []; // the new clear replaces the old banner
      let pts = LINE_BASE[n] * lvl;
      const hard = n === 4;
      pushPopup(LINE_NAME[n], hard ? GOLD : SAND, hard ? 34 : 24, hard ? 90 : 60);
      if (hard && S.b2b) {
        pts = Math.floor(pts * 1.5);
        pushPopup('BACK-TO-BACK', '#ff7a45', 18, 90);
      }
      S.b2b = hard;
      S.combo++;
      if (S.combo > 0) {
        pts += 50 * S.combo * lvl;
        pushPopup(`COMBO x${S.combo}`, '#46e0d8', 18, 90);
      }
      S.score += pts;
      S.lastClear = n;
      S.lines += n;
      const newLevel = Math.floor(S.lines / 10) + 1;
      dirty = true;
      if (hard) {
        S.quadras++;
        env.fx.shake(6, 18);
        env.fx.hitPause(4);
        sfx.quadra();
      } else {
        sfx.clear(n);
      }
      if (newLevel > S.level) {
        S.level = newLevel;
        pushPopup(`LEVEL ${newLevel}`, '#8fae6e', 24, 80);
        S.levelSfxAt = S.frames + 18; // chime lands just after the clear sound
      }
    }

    function stepClear() {
      const c = S.clear;
      c.t++;
      if (c.t === 8 && !c.burst) {
        c.burst = true;
        const quad = c.rows.length === 4;
        c.rows.forEach((r, i) => {
          for (let col = 0; col < COLS; col++) {
            const color = COLORS[TYPES[c.cells[i][col] - 1]];
            env.fx.burst(WX + col * CELL + CELL / 2, WY + (r - HID) * CELL + CELL / 2,
              quad ? 3 : 2, color, [1, quad ? 5 : 3.5], [16, 38]);
          }
        });
      }
      if (c.t >= CLEAR_TICKS) {
        const set = new Set(c.rows);
        S.board = S.board.filter((_, r) => !set.has(r));
        while (S.board.length < ROWS) S.board.unshift(new Array(COLS).fill(0));
        S.clear = null;
        S.delay = ENTRY_DELAY;
      }
    }

    // ----------------------------------------------------------- DAS / ARR
    let leftDown = false;
    let rightDown = false;
    let dasDir = 0; // -1 left, +1 right, 0 none
    let dasT = 0;
    let lastMoveSfx = -99;

    function stepMove(dir) {
      if (tryMove(dir) && S.frames - lastMoveSfx >= 3) {
        lastMoveSfx = S.frames;
        sfx.move();
      }
    }

    function handleDas() {
      if (!dasDir) return;
      dasT++;
      if (dasT >= DAS && (dasT - DAS) % ARR === 0) stepMove(dasDir);
    }

    env.input.onKeyDown((e) => {
      if (e.repeat || S.ended) return;
      const k = e.key;
      if (k === 'p' || k === 'P') {
        if (!S.over) S.paused = !S.paused;
        return;
      }
      if (S.paused || S.over) return;
      if (k === 'ArrowLeft') {
        leftDown = true;
        dasDir = -1;
        dasT = 0;
        stepMove(-1);
      } else if (k === 'ArrowRight') {
        rightDown = true;
        dasDir = 1;
        dasT = 0;
        stepMove(1);
      } else if (k === 'ArrowUp' || k === 'x' || k === 'X') {
        tryRotate(1);
      } else if (k === 'z' || k === 'Z') {
        tryRotate(-1);
      } else if (k === ' ' || k === 'Spacebar') {
        hardDrop();
      } else if (k === 'c' || k === 'C' || k === 'Shift') {
        doHold();
      }
    });

    env.input.onKeyUp((e) => {
      const k = e.key;
      if (k === 'ArrowLeft') {
        leftDown = false;
        if (dasDir === -1) {
          if (rightDown) { dasDir = 1; dasT = DAS; } else dasDir = 0;
        }
      } else if (k === 'ArrowRight') {
        rightDown = false;
        if (dasDir === 1) {
          if (leftDown) { dasDir = -1; dasT = DAS; } else dasDir = 0;
        }
      }
    });

    // --------------------------------------------------------------- touch
    // tap = rotate, drag = move, swipe down = hard drop, swipe up = hold,
    // two fingers = pause. Polled from trackTouches (it also reports lift-off).
    const touches = env.input.trackTouches();
    let tg = null;
    let twoFingerLatch = false;

    function pollTouch() {
      if (touches.size >= 2) {
        if (!twoFingerLatch) {
          twoFingerLatch = true;
          if (!S.over) S.paused = !S.paused;
        }
        if (tg) tg.consumed = true;
        return;
      }
      if (touches.size === 0) {
        twoFingerLatch = false;
        if (tg) {
          if (!tg.moved && !tg.consumed && S.frames - tg.t0 < 22) {
            if (S.paused) S.paused = false;
            else tryRotate(1);
          }
          tg = null;
        }
        return;
      }
      const cur = touches.values().next().value;
      if (!tg) {
        tg = { sx: cur.x, sy: cur.y, ax: cur.x, ay: cur.y, t0: S.frames, moved: false, consumed: false };
        return;
      }
      if (S.paused || S.over || tg.consumed) return;
      if (Math.abs(cur.x - tg.sx) > 28 || Math.abs(cur.y - tg.sy) > 28) tg.moved = true; // finger jitter allowance
      const step = CELL * 0.85;
      while (cur.x - tg.ax >= step) {
        stepMove(1);
        tg.moved = true;
        tg.ax += CELL;
        tg.ay = cur.y;
      }
      while (tg.ax - cur.x >= step) {
        stepMove(-1);
        tg.moved = true;
        tg.ax -= CELL;
        tg.ay = cur.y;
      }
      const dy = cur.y - tg.ay;
      const dx = cur.x - tg.ax;
      if (Math.abs(dy) > 56 && Math.abs(dx) < Math.abs(dy) * 0.6) {
        tg.consumed = true;
        if (dy > 0) hardDrop();
        else doHold();
      }
    }

    // ------------------------------------------------------------- update
    function fall() {
      const p = S.piece;
      S.softDown = env.input.held('ArrowDown');
      let rate = gravity(S.level);
      if (S.softDown) rate = Math.max(rate, SOFT_RATE);
      S.acc += rate;
      let guard = 0;
      while (S.acc >= 1 && guard++ < 30) {
        if (!collides(p.type, p.rot, p.x, p.y + 1)) {
          p.y++;
          S.acc -= 1;
          if (S.softDown) { S.score += 1; dirty = true; }
          if (p.y > S.lowest) { S.lowest = p.y; S.resets = 0; }
        } else {
          S.acc = 0;
          break;
        }
      }
      S.ghostY = ghostY(p);
      if (collides(p.type, p.rot, p.x, p.y + 1)) {
        S.acc = 0;
        S.lockT += S.softDown ? 5 : 1;
        if (S.lockT >= LOCK_DELAY) lockPiece();
      } else {
        S.lockT = 0;
      }
    }

    function update() {
      for (let i = S.popups.length - 1; i >= 0; i--) {
        if (++S.popups[i].t > S.popups[i].life) S.popups.splice(i, 1);
      }
      if (S.levelSfxAt >= 0 && S.frames >= S.levelSfxAt) {
        S.levelSfxAt = -1;
        sfx.levelup();
      }
      if (S.over) {
        S.dieT++;
        if (S.dieT >= 60 && !S.ended) {
          S.ended = true;
          env.onGameOver(S.score);
        }
        return;
      }
      handleDas();
      if (S.clear) { stepClear(); return; }
      if (!S.piece) {
        if (--S.delay <= 0) spawnNext();
        return;
      }
      fall();
    }

    // ---------------------------------------------------------------- draw
    function setFont(size) {
      ctx.font = `bold ${size}px ${MONO}`;
    }

    // Flat tile: solid fill, a stamped inner square one shade down, thin ink outline.
    function tile(x, y, size, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, size, size);
      const i = Math.round(size * 0.3);
      ctx.fillStyle = 'rgba(11,7,22,0.14)';
      ctx.fillRect(x + i, y + i, size - i * 2, size - i * 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5);
    }

    function ghostTile(x, y, color) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.14;
      ctx.fillRect(x, y, CELL, CELL);
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
      ctx.globalAlpha = 1;
    }

    // Static layer: background, well backdrop and grid, panel frames, labels.
    const bg = document.createElement('canvas');
    bg.width = W;
    bg.height = H;
    {
      const b = bg.getContext('2d');
      b.fillStyle = NIGHT;
      b.fillRect(0, 0, W, H);
      b.fillStyle = INK; // flat offset shadow, drawn-on-paper look
      b.fillRect(WX + 4, WY + 4, WW, WH);
      b.fillStyle = WELL_BG;
      b.fillRect(WX, WY, WW, WH);
      b.strokeStyle = GRID;
      b.lineWidth = 1;
      b.beginPath();
      for (let c = 1; c < COLS; c++) { b.moveTo(WX + c * CELL + 0.5, WY); b.lineTo(WX + c * CELL + 0.5, WY + WH); }
      for (let r = 1; r < ROWS - HID; r++) { b.moveTo(WX, WY + r * CELL + 0.5); b.lineTo(WX + WW, WY + r * CELL + 0.5); }
      b.stroke();
      b.strokeStyle = SAND;
      b.lineWidth = 3;
      b.strokeRect(WX - 1.5, WY - 1.5, WW + 3, WH + 3);
      const frame = (x, y, w, h) => {
        b.fillStyle = INK;
        b.fillRect(x + 4, y + 4, w, h);
        b.fillStyle = WELL_BG;
        b.fillRect(x, y, w, h);
        b.strokeStyle = SAND;
        b.lineWidth = 2;
        b.strokeRect(x + 1, y + 1, w - 2, h - 2);
      };
      b.textBaseline = 'top';
      b.textAlign = 'left';
      b.font = `bold 24px ${MONO}`;
      b.fillStyle = SAND_DIM;
      b.fillText('HOLD', 24, 8);
      frame(24, 38, 228, 100);
      b.fillStyle = SAND_DIM;
      b.fillText('NEXT', 548, 8);
      frame(548, 38, 228, 232);
      ['SCORE', 'LEVEL', 'LINES', 'BEST'].forEach((t, i) => {
        const y = 150 + i * 86;
        frame(24, y, 228, 80);
        b.fillStyle = SAND_DIM;
        b.fillText(t, 36, y + 5);
      });
    }

    function drawMini(type, cx, cy, size, alpha) {
      const { c } = BASE[type];
      let minX = 9, maxX = -1, minY = 9, maxY = -1;
      for (const [x, y] of c) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      const w = (maxX - minX + 1) * size;
      const h = (maxY - minY + 1) * size;
      ctx.globalAlpha = alpha;
      for (const [x, y] of c) {
        tile(Math.round(cx - w / 2 + (x - minX) * size), Math.round(cy - h / 2 + (y - minY) * size), size, COLORS[type]);
      }
      ctx.globalAlpha = 1;
    }

    function fitValue(text, x, y, maxSize, maxW, color) {
      let size = maxSize;
      setFont(size);
      while (size > 14 && ctx.measureText(text).width > maxW) {
        size -= 2;
        setFont(size);
      }
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }

    function drawPanels() {
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      if (S.hold) drawMini(S.hold, 24 + 114, 38 + 50, 22, S.canHold ? 1 : 0.4);
      for (let i = 0; i < 3; i++) {
        drawMini(S.queue[i], 548 + 114, 38 + 8 + 72 * i + 36, 22, 1);
      }
      const vals = [S.score, S.level, S.lines, Math.max(env.pb || 0, S.score)];
      vals.forEach((v, i) => {
        const y = 150 + i * 86;
        fitValue(String(v), 36, y + 33, 44, 204, i === 3 ? SAND_DIM : (i === 0 ? GOLD : SAND));
      });
      setFont(22);
      let sy = 286;
      if (S.b2b) {
        ctx.fillStyle = '#ff7a45';
        ctx.fillText('BACK-TO-BACK', 552, sy);
        sy += 30;
      }
      if (S.combo > 0) {
        ctx.fillStyle = '#46e0d8';
        ctx.fillText(`COMBO x${S.combo}`, 552, sy);
      }
      const hint = hasTouch
        ? ['TAP: ROTATE', 'DRAG: MOVE', 'SWIPE DOWN: DROP', 'SWIPE UP: HOLD', '2 FINGERS: PAUSE']
        : ['ARROWS: MOVE', 'UP / X: ROTATE', 'Z: ROTATE BACK', 'DOWN: SOFT DROP', 'SPACE: HARD DROP', 'C / SHIFT: HOLD', 'P: PAUSE'];
      const hs = hasTouch ? 18 : 14;
      const lh = hasTouch ? 24 : 18;
      setFont(hs);
      ctx.fillStyle = SAND_DIM;
      const top = 488 - hint.length * lh;
      hint.forEach((t, i) => ctx.fillText(t, 552, top + i * lh));
    }

    function cellXY(c, r) {
      return [WX + c * CELL, WY + (r - HID) * CELL];
    }

    function drawBoard() {
      const clearing = S.clear;
      const rowSet = clearing ? new Set(clearing.rows) : null;
      const front = ROWS - 1 - Math.floor(S.dieT / 2.4);
      for (let r = HID; r < ROWS; r++) {
        const isClear = rowSet && rowSet.has(r);
        for (let c = 0; c < COLS; c++) {
          const v = S.board[r][c];
          if (!v) continue;
          const [x, y] = cellXY(c, r);
          if (S.over && r > front) { tile(x, y, CELL, '#3a2f55'); continue; }
          if (isClear) {
            const t = clearing.t;
            if (t < 8) {
              tile(x, y, CELL, (t >> 1) % 2 === 0 ? '#fff4dc' : COLORS[TYPES[v - 1]]);
            } else {
              const p = (t - 8) / (CLEAR_TICKS - 8);
              const d = Math.abs(c - 4.5);
              const k = Math.max(0, Math.min(1, (d - p * 5) * 0.8 + 0.3));
              if (k <= 0.05) continue;
              const s = Math.max(2, Math.round(CELL * k));
              tile(x + (CELL - s) / 2, y + (CELL - s) / 2, s, COLORS[TYPES[v - 1]]);
            }
          } else {
            tile(x, y, CELL, COLORS[TYPES[v - 1]]);
          }
        }
      }
    }

    function drawPiece() {
      const p = S.piece;
      if (!p || S.over) return;
      const color = COLORS[p.type];
      const gy = S.ghostY;
      if (gy !== p.y) {
        for (const [cx, cy] of SHAPES[p.type][p.rot]) {
          const r = gy + cy;
          if (r < HID) continue;
          const [x, y] = cellXY(p.x + cx, r);
          ghostTile(x, y, p.type === 'J' ? '#d4663a' : color);
        }
      }
      // A resting piece darkens as its lock timer runs down.
      const warn = S.lockT > 0 ? S.lockT / LOCK_DELAY : 0;
      for (const [cx, cy] of SHAPES[p.type][p.rot]) {
        const r = p.y + cy;
        if (r < HID) continue;
        const [x, y] = cellXY(p.x + cx, r);
        tile(x, y, CELL, color);
        if (warn > 0) {
          ctx.globalAlpha = warn * 0.45;
          ctx.fillStyle = INK;
          ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
          ctx.globalAlpha = 1;
        }
      }
    }

    function drawTrails() {
      for (let i = S.trails.length - 1; i >= 0; i--) {
        const tr = S.trails[i];
        if (!S.paused) tr.t++;
        if (tr.t > 10) { S.trails.splice(i, 1); continue; }
        const yTop = Math.max(tr.y0, HID);
        if (tr.y1 < HID) continue;
        ctx.globalAlpha = 0.35 * (1 - tr.t / 10);
        ctx.fillStyle = tr.color;
        ctx.fillRect(WX + tr.x * CELL + 5, WY + (yTop - HID) * CELL, CELL - 10, (tr.y1 - yTop) * CELL);
        ctx.globalAlpha = 1;
      }
    }

    function drawPopups() {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      let yc = WY + 3.5 * CELL;
      for (const pp of S.popups) {
        const fade = Math.min(1, (pp.life - pp.t) / 16);
        const slide = (1 - Math.min(pp.t, 8) / 8) * -12;
        const y = yc + pp.size / 2 + slide;
        yc += pp.size + 6;
        setFont(pp.size);
        ctx.globalAlpha = Math.max(0, fade);
        ctx.lineWidth = 6;
        ctx.strokeStyle = INK;
        ctx.strokeText(pp.text, WX + WW / 2, y);
        ctx.fillStyle = pp.color;
        ctx.fillText(pp.text, WX + WW / 2, y);
        ctx.globalAlpha = 1;
      }
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
    }

    function drawPauseOverlay() {
      ctx.fillStyle = 'rgba(21,15,36,0.9)';
      ctx.fillRect(WX, WY, WW, WH);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      setFont(34);
      ctx.fillStyle = GOLD;
      ctx.fillText('PAUSED', WX + WW / 2, WY + 200);
      setFont(16);
      ctx.fillStyle = SAND;
      ctx.fillText(hasTouch ? 'TAP TO RESUME' : 'P TO RESUME', WX + WW / 2, WY + 240);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }

    function draw() {
      ctx.drawImage(bg, 0, 0);
      const o = env.fx.shakeOffset();
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.save();
      ctx.beginPath();
      ctx.rect(WX, WY, WW, WH);
      ctx.clip();
      drawTrails();
      drawBoard();
      drawPiece();
      ctx.restore();
      drawPanels();
      env.fx.updateAndDraw();
      drawPopups();
      if (S.paused) drawPauseOverlay();
      ctx.restore();
    }

    // -------------------------------------------------------- debug hooks
    const letters = { '.': 0, '#': 3 };
    TYPES.forEach((t, i) => { letters[t] = i + 1; });
    const actions = {
      left: () => tryMove(-1),
      right: () => tryMove(1),
      cw: () => tryRotate(1),
      ccw: () => tryRotate(-1),
      hard: () => hardDrop(),
      hold: () => doHold(),
      pause: () => { if (!S.over) S.paused = !S.paused; },
      reset: (seed) => { if (seed != null) seedRng(seed); newGame(); },
      // Rows are strings of 10 chars ('.' empty, a shape letter or '#'), bottom-aligned.
      setBoard: (rows) => {
        S.board = emptyBoard();
        rows.slice().reverse().forEach((row, i) => {
          const r = ROWS - 1 - i;
          for (let c = 0; c < COLS; c++) S.board[r][c] = letters[row[c]] || 0;
        });
        if (S.piece) S.ghostY = ghostY(S.piece);
      },
      setPiece: ({ type, rot = 0, x = 3, y = 0 }) => {
        S.piece = { type, rot, x, y };
        S.acc = 0; S.lockT = 0; S.resets = 0; S.lowest = y;
        S.ghostY = ghostY(S.piece);
      },
      skipDelay: () => { S.delay = 1; },
      setLevel: (n) => { S.level = n; S.lines = (n - 1) * 10; },
      setLines: (n) => { S.lines = n; },
      step: (n = 1) => { for (let i = 0; i < n; i++) { S.frames++; if (!S.paused) update(); } },
      ghost: () => (S.piece ? ghostY(S.piece) : null),
      shapes: () => SHAPES,
      resetTiming: () => { S.tickMsMax = 0; tickMsSum = 0; tickCount = 0; },
    };
    env.expose(S);
    env.exposeActions(actions);

    newGame();

    return {
      tick() {
        if (env.fx.consumePause()) return;
        const t0 = performance.now();
        S.frames++;
        pollTouch();
        if (!S.paused) update();
        draw();
        if (dirty) { env.onScore(S.score); dirty = false; }
        const dt = performance.now() - t0;
        if (dt > S.tickMsMax) S.tickMsMax = dt;
        tickMsSum += dt;
        tickCount++;
        S.tickMsAvg = tickMsSum / tickCount;
      },
    };
  },
};
