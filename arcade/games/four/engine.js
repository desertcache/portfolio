// Four in a Row: board model and a time-sliced negamax search.
//
// The board keeps a running count of each player's discs in every one of the
// 69 possible lines of four, so a move updates the heuristic, detects a win and
// updates the Zobrist hash in one pass over the ~13 lines through its cell.
//
// The search is negamax with alpha-beta, a transposition table, iterative
// deepening and move ordering (table move, then history, center first). It runs
// on an explicit stack instead of recursion so it can stop after any node and
// resume on the next frame: Search.run(shouldYield) is called once per tick.
// Results depend only on node counts, never on the clock, so a seeded game
// replays exactly.

export const COLS = 7;
export const ROWS = 6;
export const CELLS = COLS * ROWS;
export const WIN = 1000000; // a win at ply p scores WIN - p (sooner is better)
export const PROVEN = WIN - 100; // |score| above this is a proven result
const INF = 1000000000;

// Cell index: column-major, row 0 at the bottom.
export const cellIndex = (c, r) => c * ROWS + r;

// Center-first column order: the center column belongs to the most fours.
export const CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6];

// --- Lines of four ---
const lines = [];
for (let c = 0; c < COLS; c++) {
  for (let r = 0; r < ROWS; r++) {
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const ec = c + 3 * dc, er = r + 3 * dr;
      if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
      lines.push([0, 1, 2, 3].map((k) => cellIndex(c + k * dc, r + k * dr)));
    }
  }
}
export const LINES = lines; // 69 lines
const NL = lines.length;
// Flattened cell -> lines map.
const cellLineStart = new Int32Array(CELLS + 1);
const cellLineList = [];
for (let i = 0; i < CELLS; i++) {
  cellLineStart[i] = cellLineList.length;
  lines.forEach((ln, w) => { if (ln.includes(i)) cellLineList.push(w); });
}
cellLineStart[CELLS] = cellLineList.length;
const CELL_LINES = Int16Array.from(cellLineList);

// Heuristic weight of a line holding k discs of one player and none of the
// other: lone discs, open twos, open threes (a three with its fourth cell empty
// is a live threat).
const WT = [0, 1, 8, 60, 0];
// Threat parity (zugzwang): late in the game the first player cashes threats
// on odd rows (1st, 3rd, 5th from the bottom) and the second player on even
// rows, so a three whose empty cell sits on its owner's parity counts extra.
export const PARITY = 40;
const LINE_CELLS = Int8Array.from(lines.flat());

// Deterministic Zobrist keys (two 32-bit halves per cell per player).
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export { makeRng };
const zr = makeRng(0xC0FFEE);
const Z1 = new Int32Array(CELLS * 2);
const Z2 = new Int32Array(CELLS * 2);
for (let i = 0; i < CELLS * 2; i++) {
  Z1[i] = (zr() * 4294967296) | 0;
  Z2[i] = (zr() * 4294967296) | 0;
}

export class Board {
  constructor() {
    this.cells = new Int8Array(CELLS); // 0 empty, 1 or 2
    this.h = new Int8Array(COLS); // discs per column
    this.cnt = new Uint8Array(NL * 2); // per line: [player 1 count, player 2 count]
    this.lb = new Int16Array(NL); // per line: current parity bonus (player 1's side)
    this.ev = 0; // heuristic from player 1's side
    this.ply = 0;
    this.h1 = 0;
    this.h2 = 0;
  }

  clone() {
    const b = new Board();
    b.cells.set(this.cells);
    b.h.set(this.h);
    b.cnt.set(this.cnt);
    b.lb.set(this.lb);
    b.ev = this.ev;
    b.ply = this.ply;
    b.h1 = this.h1;
    b.h2 = this.h2;
    return b;
  }

  canPlay(c) { return this.h[c] < ROWS; }

  // Parity bonus of line w as it stands: nonzero only for a live three whose
  // empty cell is on its owner's row parity.
  lineBonus(w) {
    const c1 = this.cnt[w * 2], c2 = this.cnt[w * 2 + 1];
    let owner;
    if (c1 === 3 && c2 === 0) owner = 1;
    else if (c2 === 3 && c1 === 0) owner = 2;
    else return 0;
    let e = LINE_CELLS[w * 4];
    for (let k = 1; k < 4 && this.cells[e] !== 0; k++) e = LINE_CELLS[w * 4 + k];
    const odd = (e % ROWS) % 2 === 0; // 1st, 3rd, 5th row from the bottom
    if (owner === 1) return odd ? PARITY : 0;
    return odd ? 0 : -PARITY;
  }

  // Drop a disc for player p in column c. Returns true if it makes four.
  play(c, p) {
    const i = c * ROWS + this.h[c]++;
    this.cells[i] = p;
    const cnt = this.cnt, lb = this.lb;
    const mine = p - 1, theirs = 2 - p;
    let ev = this.ev, win = false;
    for (let k = cellLineStart[i], e = cellLineStart[i + 1]; k < e; k++) {
      const w = CELL_LINES[k] * 2;
      const a = cnt[w + mine], b = cnt[w + theirs];
      const sign = p === 1 ? 1 : -1;
      if (b === 0) {
        ev += sign * (WT[a + 1] - WT[a]);
        if (a === 3) win = true;
      } else if (a === 0) {
        ev += sign * WT[b]; // the opponent's line is now dead
      }
      cnt[w + mine] = a + 1;
      const wi = w >> 1, nb = this.lineBonus(wi);
      ev += nb - lb[wi];
      lb[wi] = nb;
    }
    this.ev = ev;
    this.ply++;
    this.h1 ^= Z1[i * 2 + mine];
    this.h2 ^= Z2[i * 2 + mine];
    return win;
  }

  undo(c) {
    const i = c * ROWS + --this.h[c];
    const p = this.cells[i];
    this.cells[i] = 0;
    const cnt = this.cnt, lb = this.lb;
    const mine = p - 1, theirs = 2 - p;
    const sign = p === 1 ? 1 : -1;
    let ev = this.ev;
    for (let k = cellLineStart[i], e = cellLineStart[i + 1]; k < e; k++) {
      const w = CELL_LINES[k] * 2;
      const a = cnt[w + mine] - 1, b = cnt[w + theirs];
      if (b === 0) ev -= sign * (WT[a + 1] - WT[a]);
      else if (a === 0) ev -= sign * WT[b];
      cnt[w + mine] = a;
      const wi = w >> 1, nb = this.lineBonus(wi);
      ev += nb - lb[wi];
      lb[wi] = nb;
    }
    this.ev = ev;
    this.ply--;
    this.h1 ^= Z1[i * 2 + mine];
    this.h2 ^= Z2[i * 2 + mine];
  }

  // Would a disc of player p on empty cell i complete four?
  isWinCell(i, p) {
    const cnt = this.cnt, mine = p - 1, theirs = 2 - p;
    for (let k = cellLineStart[i], e = cellLineStart[i + 1]; k < e; k++) {
      const w = CELL_LINES[k] * 2;
      if (cnt[w + mine] === 3 && cnt[w + theirs] === 0) return true;
    }
    return false;
  }

  // Would dropping in column c win for p right now?
  wouldWin(c, p) {
    const r = this.h[c];
    return r < ROWS && this.isWinCell(c * ROWS + r, p);
  }

  // Every empty cell (playable now or not) where p would complete four.
  threatCells(p) {
    const out = [];
    for (let i = 0; i < CELLS; i++) if (this.cells[i] === 0 && this.isWinCell(i, p)) out.push(i);
    return out;
  }

  // Count lines holding k discs of p and none of the opponent.
  openLines(p, k) {
    let n = 0;
    const mine = p - 1, theirs = 2 - p;
    for (let w = 0; w < NL; w++) if (this.cnt[w * 2 + mine] === k && this.cnt[w * 2 + theirs] === 0) n++;
    return n;
  }

  // The four cells of a completed line, or null.
  winLine() {
    for (let w = 0; w < NL; w++) {
      if (this.cnt[w * 2] === 4 || this.cnt[w * 2 + 1] === 4) return LINES[w].slice();
    }
    return null;
  }

  full() { return this.ply === CELLS; }
}

// --- Transposition table (shared across a game; keys are absolute so a
// position scores the same whatever path reached it) ---
const EXACT = 1, LOWER = 2, UPPER = 3;
export class Table {
  constructor(bits = 19) {
    const n = 1 << bits;
    this.mask = n - 1;
    this.k1 = new Int32Array(n);
    this.k2 = new Int32Array(n);
    this.val = new Int32Array(n);
    this.dep = new Int8Array(n);
    this.flag = new Int8Array(n);
    this.move = new Int8Array(n);
  }
  clear() { this.flag.fill(0); }
}

// Difficulty presets. Depth and node caps are the only knobs, so a seeded game
// replays move for move.
export const LEVELS = {
  easy: { name: 'Easy', maxDepth: 2, softCap: 2000, hardCap: 20000, noise: 90, blunder: 0.15 },
  normal: { name: 'Normal', maxDepth: 6, softCap: 40000, hardCap: 200000, noise: 6, blunder: 0 },
  hard: { name: 'Hard', maxDepth: 42, softCap: 320000, hardCap: 1300000, noise: 0, blunder: 0 },
};

const MAXF = CELLS + 2;

export class Search {
  // board: the live position (cloned); me: the side to move (1 or 2).
  constructor(board, me, level, table, rng) {
    this.b = board.clone(); // scratch board the search walks
    this.root = board.clone(); // untouched copy of the position
    this.me = me;
    this.level = level;
    this.tt = table;
    this.rng = rng;
    this.rootPly = board.ply;
    this.nodes = 0;
    this.done = false;
    this.depth = 1; // iteration in progress
    this.completedDepth = 0;
    this.rootMoves = CENTER_ORDER.filter((c) => board.canPlay(c));
    this.ri = 0;
    this.curRoot = -1;
    this.iterScores = new Array(COLS).fill(null); // this iteration, as it fills in
    this.scores = new Array(COLS).fill(null); // last completed iteration
    this.best = this.rootMoves[0];
    this.bestScore = 0;
    this.choice = -1; // final pick (after any noise or blunder)
    this.blundered = false;
    this.hist = new Int32Array(COLS * 2);
    // Explicit stack, structure of arrays.
    this.sp = -1;
    this.fN = new Int8Array(MAXF);
    this.fMi = new Int8Array(MAXF);
    this.fAlpha = new Float64Array(MAXF);
    this.fBeta = new Float64Array(MAXF);
    this.fAlphaOrig = new Float64Array(MAXF);
    this.fBest = new Float64Array(MAXF);
    this.fBestMove = new Int8Array(MAXF);
    this.fDepth = new Int8Array(MAXF);
    this.fP = new Int8Array(MAXF);
    this.mv = new Int8Array(MAXF * COLS);
    if (this.rootMoves.length === 0) this.finish();
  }

  // Open a node for side p. Returns its value if it resolves at once, or NaN
  // after pushing a frame at index sp.
  enter(sp, depth, alpha, beta, p) {
    this.nodes++;
    const b = this.b;
    if (b.ply === CELLS) return 0;
    const o = 3 - p;
    for (let c = 0; c < COLS; c++) if (b.wouldWin(c, p)) return WIN - (b.ply + 1);
    if (depth <= 0) return p === 1 ? b.ev : -b.ev;

    const tt = this.tt;
    let ttMove = -1;
    const alphaOrig = alpha;
    const e = b.h1 & tt.mask;
    if (tt.flag[e] && tt.k1[e] === b.h1 && tt.k2[e] === b.h2) {
      ttMove = tt.move[e];
      if (tt.dep[e] >= depth) {
        const v = tt.val[e], f = tt.flag[e];
        if (f === EXACT) return v;
        if (f === LOWER) { if (v > alpha) alpha = v; } else if (v < beta) beta = v;
        if (alpha >= beta) return v;
      }
    }

    // The opponent's immediate wins: two means we are lost, one must be blocked.
    let forced = -1, threats = 0;
    for (let c = 0; c < COLS; c++) {
      if (b.wouldWin(c, o)) { threats++; forced = c; }
    }
    if (threats >= 2) return -(WIN - (b.ply + 2));

    const base = sp * COLS, mv = this.mv;
    let n = 0;
    if (forced >= 0) {
      mv[base] = forced;
      n = 1;
    } else {
      // Order: table move, then by history (center first on ties), and any move
      // that hands the opponent a winning cell directly above it goes last.
      const hist = this.hist, ho = (p - 1) * COLS;
      let nLate = 0;
      const late = [0, 0, 0, 0, 0, 0, 0];
      for (let k = 0; k < COLS; k++) {
        const c = CENTER_ORDER[k];
        const r = b.h[c];
        if (r >= ROWS) continue;
        if (r + 1 < ROWS && b.isWinCell(c * ROWS + r + 1, o)) { late[nLate++] = c; continue; }
        if (c === ttMove) continue;
        // insertion by history score (stable, so center order breaks ties)
        let j = n;
        const hs = hist[ho + c];
        while (j > 0 && hist[ho + mv[base + j - 1]] < hs) { mv[base + j] = mv[base + j - 1]; j--; }
        mv[base + j] = c;
        n++;
      }
      if (ttMove >= 0 && b.h[ttMove] < ROWS && !(b.h[ttMove] + 1 < ROWS && b.isWinCell(ttMove * ROWS + b.h[ttMove] + 1, o))) {
        for (let j = n; j > 0; j--) mv[base + j] = mv[base + j - 1];
        mv[base] = ttMove;
        n++;
      }
      for (let k = 0; k < nLate; k++) mv[base + n++] = late[k];
    }

    this.fN[sp] = n;
    this.fMi[sp] = 0;
    this.fAlpha[sp] = alpha;
    this.fBeta[sp] = beta;
    this.fAlphaOrig[sp] = alphaOrig;
    this.fBest[sp] = -INF;
    this.fBestMove[sp] = mv[base];
    this.fDepth[sp] = depth;
    this.fP[sp] = p;
    return NaN;
  }

  // A child of frame sp, reached by column c, returned v (from sp's side).
  apply(sp, c, v) {
    if (v > this.fBest[sp]) { this.fBest[sp] = v; this.fBestMove[sp] = c; }
    if (v > this.fAlpha[sp]) {
      this.fAlpha[sp] = v;
      if (v >= this.fBeta[sp]) {
        const d = this.fDepth[sp];
        this.hist[(this.fP[sp] - 1) * COLS + c] += d * d;
      }
    }
  }

  // Start the next root move (or the next iteration). Returns false when the
  // search is finished.
  nextRoot() {
    const b = this.b;
    for (;;) {
      if (this.ri >= this.rootMoves.length) {
        // iteration complete
        this.completedDepth = this.depth;
        this.scores = this.iterScores.slice();
        this.pickBest(this.scores);
        const remaining = CELLS - this.rootPly;
        const L = this.level;
        if (this.depth >= L.maxDepth || this.depth >= remaining || this.bestScore >= PROVEN ||
            this.bestScore <= -PROVEN || this.nodes >= L.softCap || this.rootMoves.length === 1) {
          return false;
        }
        this.depth++;
        const sc = this.scores;
        this.rootMoves.sort((x, y) => sc[y] - sc[x]); // stable: center wins ties
        this.iterScores = new Array(COLS).fill(null);
        this.ri = 0;
      }
      const c = this.rootMoves[this.ri];
      this.curRoot = c;
      if (b.play(c, this.me)) {
        this.nodes++;
        this.iterScores[c] = WIN - b.ply;
        b.undo(c);
        this.ri++;
        continue;
      }
      const v = this.enter(0, this.depth - 1, -INF, INF, 3 - this.me);
      if (v === v) {
        this.iterScores[c] = -v;
        b.undo(c);
        this.ri++;
        continue;
      }
      this.sp = 0;
      return true;
    }
  }

  pickBest(sc) {
    let best = -1, bs = -INF;
    for (const c of this.rootMoves) {
      if (sc[c] != null && sc[c] > bs) { bs = sc[c]; best = c; }
    }
    if (best >= 0) { this.best = best; this.bestScore = bs; }
  }

  // Run until done or until shouldYield() says the slice is spent (checked
  // every 64 nodes). Returns true once the search has finished.
  run(shouldYield) {
    if (this.done) return true;
    const b = this.b;
    const fN = this.fN, fMi = this.fMi, fAlpha = this.fAlpha, fBeta = this.fBeta, mv = this.mv;
    let sp = this.sp;
    let iter = 0;
    for (;;) {
      if (sp < 0) {
        if (!this.nextRoot()) { this.finish(); return true; }
        sp = this.sp;
        continue;
      }
      if ((++iter & 63) === 0) {
        if (this.nodes >= this.level.hardCap) { this.sp = sp; this.abort(); return true; }
        if (shouldYield && shouldYield()) { this.sp = sp; return false; }
      }
      const base = sp * COLS;
      if (fMi[sp] < fN[sp] && fAlpha[sp] < fBeta[sp]) {
        const c = mv[base + fMi[sp]++];
        const p = this.fP[sp];
        let v;
        if (b.play(c, p)) {
          this.nodes++;
          v = WIN - b.ply;
          b.undo(c);
        } else {
          const child = this.enter(sp + 1, this.fDepth[sp] - 1, -fBeta[sp], -fAlpha[sp], 3 - p);
          if (child !== child) { sp++; continue; }
          v = -child;
          b.undo(c);
        }
        this.apply(sp, c, v);
      } else {
        // Frame finished: store it, pop, and hand the value to the parent.
        const val = this.fBest[sp];
        const tt = this.tt;
        const e = b.h1 & tt.mask;
        tt.k1[e] = b.h1;
        tt.k2[e] = b.h2;
        tt.val[e] = val;
        tt.dep[e] = this.fDepth[sp];
        tt.move[e] = this.fBestMove[sp];
        tt.flag[e] = val <= this.fAlphaOrig[sp] ? UPPER : val >= fBeta[sp] ? LOWER : EXACT;
        sp--;
        if (sp < 0) {
          this.iterScores[this.curRoot] = -val;
          b.undo(this.curRoot);
          this.ri++;
          this.sp = -1;
        } else {
          const c = mv[sp * COLS + fMi[sp] - 1];
          b.undo(c);
          this.apply(sp, c, -val);
        }
      }
    }
  }

  // Hard node cap hit mid-iteration: keep the last full iteration, upgraded by
  // the partial one if the previous best was already re-searched at this depth.
  abort() {
    const prevBest = this.best;
    const part = this.iterScores;
    if (part[prevBest] != null) {
      const merged = this.scores.slice();
      for (let c = 0; c < COLS; c++) if (part[c] != null) merged[c] = part[c];
      this.pickBest(part);
      this.scores = merged;
      this.partialDepth = this.depth;
    }
    this.finish();
  }

  // Wall-clock safety valve for slow devices (never used in debug runs).
  stop() { if (!this.done) this.abort(); }

  finish() {
    this.done = true;
    this.sp = -1;
    const moves = this.rootMoves;
    if (moves.length === 0) { this.choice = -1; return; }
    const L = this.level;
    let choice = this.best;
    // Lost against best play: still block a win-in-one if there is one (pick
    // the block that holds out longest), so a human has to find the other win.
    if (this.bestScore <= -PROVEN) {
      const opp = 3 - this.me;
      let bs = -INF;
      for (const c of moves) {
        const s = this.scores[c];
        if (s != null && this.root.wouldWin(c, opp) && s > bs) { bs = s; choice = c; }
      }
      this.best = choice;
      if (bs > -INF) this.bestScore = bs;
    }
    // Easy and Normal shade their ratings with seeded noise; proven results stay.
    if (L.noise > 0 && this.bestScore > -PROVEN) {
      let bs = -INF;
      for (const c of moves) {
        const s = this.scores[c];
        if (s == null) continue;
        const v = Math.abs(s) >= PROVEN ? s : s + (this.rng() * 2 - 1) * L.noise;
        if (v > bs) { bs = v; choice = c; }
      }
    }
    // Easy sometimes plays a hunch, but never walks past a win in one.
    if (L.blunder > 0 && this.rng() < L.blunder && !this.root.wouldWin(choice, this.me)) {
      choice = moves[Math.floor(this.rng() * moves.length)];
      this.blundered = choice !== this.best;
    }
    this.choice = choice;
  }
}
