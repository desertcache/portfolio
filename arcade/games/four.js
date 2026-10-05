// Four in a Row: seven columns, six rows, against a search AI whose thinking
// is on screen. The panel on the right is the live state of the real search
// (four/engine.js): positions evaluated, depth, best move so far, how it rates
// each column, and a plain-English read of the move it prefers (four/read.js).
// The search is time-sliced (about 3 ms a tick) so frames never block.
import { Board, Search, Table, LEVELS, COLS, ROWS, PROVEN, makeRng } from './four/engine.js';
import { explain } from './four/read.js';

const HUMAN = 1, AI = 2;
const COLOR = { 1: '#ffb547', 2: '#ff5c93' };
const BG = '#150f24';
const SURFACE = '#211836';
const BOARD = '#2a1f47';
const HOLE = '#120c20';
const INK = '#f5eef2', INK2 = '#cdc1d3', INK3 = '#a093ab';
const LINE = 'rgba(245, 238, 242, 0.12)';
const ACCENT = '#ff7a45';
const MONO = '"Martian Mono", ui-monospace, Menlo, Consolas, monospace';
const SANS = 'Archivo, "Helvetica Neue", Arial, sans-serif';

// Board geometry (logical 800x500).
const CELL = 58, R = 23;
const BX = 28, BY = 122;
const BW = COLS * CELL, BH = ROWS * CELL;
const PREVIEW_Y = BY - 30;
// Thinking panel.
const PX = 462, PY = 16, PW = 322, PH = 468;

const SLICE_MS = 3; // search budget per tick
const MIN_THINK_TICKS = 48; // 0.8 s, so visitors can watch it think
const WALL_CAP_TICKS = 270; // 4.5 s safety valve on slow devices (not in debug)
const OVER_TICKS = 200; // the result shows this long before the game-over screen

const LEVEL_KEYS = ['easy', 'normal', 'hard'];
const LEVEL_INFO = {
  easy: 'Looks two turns ahead and sometimes plays a hunch',
  normal: 'Looks six turns ahead',
  hard: 'Searches deep, often all the way to the last disc',
};
// Win: base by difficulty plus a bonus for every move under 21. Draw: a quarter
// of base. Loss: points for each move survived.
const SCORE = {
  easy: { base: 100, per: 5, surv: 1 },
  normal: { base: 300, per: 15, surv: 2 },
  hard: { base: 1000, per: 50, surv: 5 },
};

let lastLevel = 1; // remembered across Play again

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const cx = (c) => BX + c * CELL + CELL / 2;
const cy = (r) => BY + (ROWS - 1 - r) * CELL + CELL / 2;

export default {
  id: 'FOUR',
  title: 'Four in a Row',
  mode: 'landscape',
  ownHud: true,
  start(env) {
    const { ctx, W, H, input, fx, audio } = env;
    const debug = !!env.debug;
    const params = new URLSearchParams(location.search);

    let seed = debug ? (Number(params.get('seed')) || 1) : (Math.random() * 2147483647) | 0;
    let rng = makeRng(seed);
    const tt = new Table(19);
    let board = new Board();
    let levelKey = LEVEL_KEYS[lastLevel];
    let selIdx = lastLevel;
    let state = 'select'; // select | player | drop | think | over
    let cursor = 3;
    let falling = null;
    let afterDrop = null;
    let search = null;
    let thinkTicks = 0;
    let lastDepthSound = 0;
    let winner = -1;
    let winLine = null;
    let overTicks = 0;
    let finalScore = 0;
    let gameOverSent = false;
    let playerMoves = 0;
    let score = 0;
    let moveLog = [];
    let turbo = false;
    let frame = 0;
    let maxTickMs = 0;
    let maxTickAt = '';
    let thinkMaxTickMs = 0;
    let ghostX = cx(3);
    const panel = {
      mode: 'idle', // idle | thinking | played
      status: '',
      nodes: 0,
      shownNodes: 0,
      depth: 0,
      best: -1,
      scores: new Array(COLS).fill(null),
      stale: new Array(COLS).fill(false),
      examining: -1,
      read: '',
      readKey: '',
    };
    env.onScore(0);

    // --- sound ---
    function clack(hit, row) {
      const k = hit === 0 ? 1 : 0.45 / hit;
      audio.play('four-clack', (h) => {
        h.noise({ dur: 0.045, vol: 0.2 * k, filterFrom: 3800, filterTo: 600 });
        h.tone({ f: 150 + row * 14, dur: 0.07, type: 'triangle', vol: 0.14 * k });
      });
    }
    function blip(f, vol = 0.04) {
      audio.play('four-blip', (h) => h.tone({ f, dur: 0.035, type: 'sine', vol }));
    }

    // --- game flow ---
    function resetPanel(status) {
      panel.mode = 'idle';
      panel.status = status;
      panel.nodes = panel.shownNodes = panel.depth = 0;
      panel.best = -1;
      panel.scores.fill(null);
      panel.stale.fill(false);
      panel.examining = -1;
      panel.read = '';
      panel.readKey = '';
    }

    function newGame(key, s) {
      if (!LEVEL_KEYS.includes(key)) return false;
      levelKey = key;
      lastLevel = selIdx = LEVEL_KEYS.indexOf(key);
      if (s != null) seed = s >>> 0;
      rng = makeRng(seed);
      board = new Board();
      tt.clear();
      search = null;
      falling = afterDrop = null;
      winner = -1;
      winLine = null;
      overTicks = 0;
      gameOverSent = false;
      playerMoves = 0;
      score = 0;
      moveLog = [];
      cursor = 3;
      fx.clear();
      env.onScore(0);
      resetPanel('Waiting for you');
      state = 'player';
      return true;
    }

    function choose(i) {
      blip(660, 0.06);
      newGame(LEVEL_KEYS[i]);
    }

    function drop(c, p) {
      if (c < 0 || c >= COLS || !board.canPlay(c)) return false;
      const r = board.h[c];
      const win = board.play(c, p);
      moveLog.push(c);
      falling = { c, r, p, y: PREVIEW_Y, vy: 2, ty: cy(r), hits: 0 };
      afterDrop = { win, p };
      if (p === HUMAN) {
        playerMoves++;
        score = playerMoves * SCORE[levelKey].surv;
        env.onScore(score);
      }
      state = 'drop';
      if (turbo) land();
      return true;
    }

    function humanDrop(c) {
      if (state !== 'player') return false;
      cursor = c;
      return drop(c, HUMAN);
    }

    function stepFalling() {
      const f = falling;
      f.vy += 0.9;
      f.y += f.vy;
      if (f.y >= f.ty) {
        f.y = f.ty;
        if (f.vy > 2.5 && f.hits < 3) {
          clack(f.hits, f.r);
          if (f.hits === 0) fx.burst(cx(f.c), f.ty + R, 6, COLOR[f.p], [0.5, 1.6], [10, 18]);
          f.vy = -f.vy * 0.28;
          f.hits++;
        } else {
          land();
        }
      }
    }

    function land() {
      if (turbo && falling && falling.hits === 0) clack(0, falling.r);
      falling = null;
      const { win, p } = afterDrop;
      afterDrop = null;
      if (win) endGame(p);
      else if (board.full()) endGame(0);
      else if (p === HUMAN) startThink();
      else state = 'player';
    }

    function startThink() {
      search = new Search(board, AI, LEVELS[levelKey], tt, rng);
      thinkTicks = 0;
      lastDepthSound = 0;
      panel.mode = 'thinking';
      panel.status = 'Thinking';
      panel.nodes = panel.shownNodes = 0;
      panel.scores.fill(null);
      panel.stale.fill(false);
      state = 'think';
      syncPanel();
    }

    function syncPanel() {
      const s = search;
      panel.nodes = s.nodes;
      panel.depth = s.done ? (s.partialDepth || s.completedDepth) : s.depth;
      panel.best = s.done ? s.choice : s.best;
      panel.examining = s.done ? -1 : s.curRoot;
      for (let c = 0; c < COLS; c++) {
        const fresh = !s.done && s.iterScores[c] != null;
        panel.scores[c] = fresh ? s.iterScores[c] : s.scores[c];
        panel.stale[c] = !s.done && !fresh && s.scores[c] != null;
      }
      const sc = s.done ? s.scores[s.choice] : s.bestScore;
      const key = `${panel.best}:${sc}:${s.done}:${s.blundered}`;
      if (key !== panel.readKey && (s.completedDepth > 0 || s.done)) {
        panel.readKey = key;
        panel.read = explain(board, AI, panel.best, sc, { blundered: s.blundered, done: s.done });
      }
    }

    function stepThink() {
      const t0 = performance.now();
      if (turbo) search.run(null);
      else search.run(() => performance.now() - t0 > SLICE_MS);
      thinkTicks++;
      if (!debug && !search.done && thinkTicks > WALL_CAP_TICKS) search.stop();
      syncPanel();
      if (!turbo && search.completedDepth > lastDepthSound && thinkTicks % 3 === 0) {
        lastDepthSound = search.completedDepth;
        blip(280 + Math.min(lastDepthSound, 24) * 22, 0.025);
      }
      if (search.done && (turbo || thinkTicks >= MIN_THINK_TICKS)) {
        const c = search.choice;
        panel.mode = 'played';
        panel.status = `Played column ${c + 1}`;
        panel.shownNodes = panel.nodes;
        drop(c, AI);
      }
    }

    function endGame(w) {
      winner = w;
      state = 'over';
      overTicks = 0;
      winLine = board.winLine();
      const S = SCORE[levelKey];
      if (w === HUMAN) finalScore = S.base + Math.max(0, 21 - playerMoves) * S.per;
      else if (w === 0) finalScore = Math.round(S.base / 4);
      else finalScore = playerMoves * S.surv;
      score = finalScore;
      env.onScore(score);
      if (winLine) {
        for (const i of winLine) {
          fx.burst(cx(Math.floor(i / ROWS)), cy(i % ROWS), 14, COLOR[w], [1, 3], [18, 34]);
        }
      }
      if (w === HUMAN) {
        fx.shake(4, 12);
        audio.play('four-win', (h) => h.seq([{ f: 523 }, { f: 659 }, { f: 784 }, { f: 1047, dur: 0.25 }], 0.1));
      } else if (w === AI) {
        audio.play('four-lose', (h) => h.tone({ f: 330, slideTo: 90, dur: 0.5, type: 'sawtooth', vol: 0.1 }));
      } else {
        audio.play('four-draw', (h) => h.seq([{ f: 440 }, { f: 440 }], 0.14));
      }
    }

    function sendGameOver() {
      if (gameOverSent) return;
      gameOverSent = true;
      env.onGameOver(finalScore);
    }

    // --- input ---
    const colAt = (x) => (x >= BX && x < BX + BW ? Math.floor((x - BX) / CELL) : -1);
    const BTN_Y = [PY + 98, PY + 192, PY + 286];
    const BTN_H = 82;
    function buttonAt(x, y) {
      if (x < PX + 16 || x > PX + PW - 16) return -1;
      for (let i = 0; i < 3; i++) if (y >= BTN_Y[i] && y <= BTN_Y[i] + BTN_H) return i;
      return -1;
    }
    function pointer(x, y) {
      if (state === 'select') {
        const i = buttonAt(x, y);
        if (i >= 0) choose(i);
      } else if (state === 'over') {
        if (overTicks > 40) sendGameOver();
      } else {
        const c = colAt(x);
        if (c >= 0) {
          cursor = c;
          if (state === 'player') humanDrop(c);
        }
      }
    }
    input.onMouseMove((x, y) => {
      if (state === 'select') {
        const i = buttonAt(x, y);
        if (i >= 0) selIdx = i;
      } else {
        const c = colAt(x);
        if (c >= 0) cursor = c;
      }
    });
    input.onClick(pointer);
    input.onTap(pointer);
    input.onKeyDown((e) => {
      const k = e.key;
      const go = k === 'Enter' || k === ' ' || k === 'Spacebar';
      if (go) e.preventDefault();
      if (state === 'select') {
        if (k === 'ArrowUp' || k === 'ArrowLeft') { selIdx = (selIdx + 2) % 3; blip(520); }
        else if (k === 'ArrowDown' || k === 'ArrowRight') { selIdx = (selIdx + 1) % 3; blip(520); }
        else if (go) choose(selIdx);
        else if (k >= '1' && k <= '3') choose(Number(k) - 1);
        return;
      }
      if (state === 'over') {
        if (go && overTicks > 40) sendGameOver();
        return;
      }
      if (k === 'ArrowLeft') { cursor = (cursor + COLS - 1) % COLS; blip(520, 0.03); }
      else if (k === 'ArrowRight') { cursor = (cursor + 1) % COLS; blip(520, 0.03); }
      else if (state === 'player' && go) humanDrop(cursor);
      else if (state === 'player' && k >= '1' && k <= '7') humanDrop(Number(k) - 1);
    });

    // --- debug hooks (they only reach window with ?debug=1) ---
    env.expose({
      get state() { return state; },
      get level() { return levelKey; },
      get seed() { return seed; },
      get ply() { return board.ply; },
      get moves() { return moveLog.slice(); },
      get grid() {
        const rows = [];
        for (let r = ROWS - 1; r >= 0; r--) {
          let s = '';
          for (let c = 0; c < COLS; c++) s += '.XO'[board.cells[c * ROWS + r]];
          rows.push(s);
        }
        return rows;
      },
      get winner() { return winner; },
      get winLine() { return winLine ? winLine.slice() : null; },
      get score() { return score; },
      get playerMoves() { return playerMoves; },
      get turbo() { return turbo; },
      get maxTickMs() { return maxTickMs; },
      get maxTickAt() { return maxTickAt; },
      get thinkMaxTickMs() { return thinkMaxTickMs; },
      get thinkTicks() { return thinkTicks; },
      get search() {
        if (!search) return null;
        return {
          nodes: search.nodes, depth: search.depth, completedDepth: search.completedDepth,
          best: search.best, bestScore: search.bestScore, choice: search.choice,
          scores: search.scores.slice(), done: search.done, blundered: search.blundered,
        };
      },
      get panel() {
        return {
          mode: panel.mode, status: panel.status, nodes: panel.nodes, depth: panel.depth,
          best: panel.best, scores: panel.scores.slice(), read: panel.read,
        };
      },
    });
    env.exposeActions({
      newGame: (key, s) => newGame(key, s),
      select: (i) => { if (state === 'select') choose(i); },
      drop: (c) => humanDrop(c),
      setTurbo: (on) => { turbo = !!on; },
      resetTiming: () => { maxTickMs = 0; thinkMaxTickMs = 0; },
      // Set up a position from 1-based column digits, players alternating from
      // you. With an odd count the AI is to move and starts thinking.
      load: (digits) => {
        newGame(levelKey);
        for (const ch of String(digits)) {
          const c = Number(ch) - 1;
          const p = (board.ply % 2) + 1;
          if (!(c >= 0 && c < COLS) || !board.canPlay(c) || board.play(c, p)) return false;
          moveLog.push(c);
          if (p === HUMAN) playerMoves++;
        }
        if (board.ply % 2 === 1) startThink();
        return true;
      },
      // What the AI would play here, searched synchronously (does not move).
      aiPick: () => {
        const s = new Search(board, AI, LEVELS[levelKey], new Table(18), makeRng(seed));
        s.run(null);
        return { choice: s.choice, scores: s.scores.slice(), depth: s.completedDepth, nodes: s.nodes };
      },
    });

    // --- drawing ---
    function text(str, x, y, { size = 14, font = SANS, weight = 500, color = INK, align = 'left' } = {}) {
      ctx.font = `${weight} ${size}px ${font}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(str, x, y);
    }
    function label(str, x, y, align = 'left', color = INK3) {
      text(str.toUpperCase(), x, y, { size: 13, font: MONO, weight: 500, color, align });
    }
    function wrap(str, maxW, size, weight = 600) {
      ctx.font = `${weight} ${size}px ${SANS}`;
      const lines = [];
      let line = '';
      for (const w of str.split(' ')) {
        const t = line ? `${line} ${w}` : w;
        if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
      }
      if (line) lines.push(line);
      return lines;
    }
    function disc(x, y, p, alpha = 1, r = R) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLOR[p];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (r > 12) {
        // flat inner ring, no gloss
        ctx.strokeStyle = 'rgba(21, 15, 36, 0.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r - 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawHeader() {
      if (state === 'over') {
        const msg = winner === HUMAN ? 'You win' : winner === AI ? 'The AI wins' : 'Draw';
        text(msg, BX, 50, { size: 36, weight: 800, color: winner === 0 ? INK : COLOR[winner] });
        const sub = winner === HUMAN
          ? `+${fmt(finalScore)} points · four in ${playerMoves} moves`
          : winner === AI
            ? `${fmt(finalScore)} points for ${playerMoves} moves survived`
            : `${fmt(finalScore)} points · the board is full`;
        text(sub, BX, 76, { size: 16, weight: 500, color: INK2 });
        if (overTicks > 40) text('Click, tap or press Enter to continue', BX, 100, { size: 13, color: INK3 });
        return;
      }
      label('Four in a Row', BX, 30, 'left', ACCENT);
      const lx = BX + BW;
      text('AI', lx, 30, { size: 13, font: MONO, color: INK2, align: 'right' });
      disc(lx - 30, 25, AI, 1, 7);
      text('You', lx - 46, 30, { size: 13, font: MONO, color: INK2, align: 'right' });
      disc(lx - 90, 25, HUMAN, 1, 7);
      let msg = '';
      if (state === 'select') msg = 'Pick an opponent';
      else if (state === 'player') msg = 'Your move';
      else if (state === 'think') msg = 'The AI is thinking';
      else if (state === 'drop') msg = falling && falling.p === AI ? `The AI plays column ${falling.c + 1}` : 'Your move';
      text(msg, BX, 60, { size: 22, weight: 700, color: state === 'think' ? COLOR[AI] : INK });
      if (state !== 'select') {
        text(`Score ${fmt(score)}`, lx, 60, { size: 14, font: MONO, color: INK2, align: 'right' });
      }
    }

    function drawBoard() {
      // column highlight under the cursor on your turn
      if (state === 'player') {
        ctx.fillStyle = 'rgba(255, 181, 71, 0.08)';
        ctx.fillRect(BX + cursor * CELL, PREVIEW_Y - R - 4, CELL, BY + BH - PREVIEW_Y + R + 4);
      }
      ctx.fillStyle = BOARD;
      roundRect(BX - 6, BY - 6, BW + 12, BH + 12, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 122, 69, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (state === 'player') {
        ctx.fillStyle = 'rgba(255, 181, 71, 0.12)';
        ctx.fillRect(BX + cursor * CELL + 2, BY - 2, CELL - 4, BH + 4);
      }

      const fallIdx = falling ? falling.c * ROWS + falling.r : -1;
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const i = c * ROWS + r;
          const v = board.cells[i];
          if (v === 0 || i === fallIdx) {
            ctx.fillStyle = HOLE;
            ctx.beginPath();
            ctx.arc(cx(c), cy(r), R, 0, Math.PI * 2);
            ctx.fill();
          } else {
            disc(cx(c), cy(r), v, winLine && !winLine.includes(i) ? 0.32 : 1);
          }
        }
      }
      // the four
      if (winLine) {
        const pulse = 3 + Math.sin(frame * 0.15) * 2;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        for (const i of winLine) {
          ctx.beginPath();
          ctx.arc(cx(Math.floor(i / ROWS)), cy(i % ROWS), R + pulse, 0, Math.PI * 2);
          ctx.stroke();
        }
        const a = winLine[0], b = winLine[3];
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx(Math.floor(a / ROWS)), cy(a % ROWS));
        ctx.lineTo(cx(Math.floor(b / ROWS)), cy(b % ROWS));
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
      if (falling) disc(cx(falling.c), falling.y, falling.p);

      // preview disc: yours on your turn, the AI's current favorite while it thinks
      if (state === 'player') {
        disc(cx(cursor), PREVIEW_Y, HUMAN, 0.9);
      } else if (state === 'think' && panel.best >= 0) {
        ghostX += (cx(panel.best) - ghostX) * 0.25;
        disc(ghostX, PREVIEW_Y, AI, 0.45 + 0.15 * Math.sin(frame * 0.12));
      }
      if (state !== 'think') ghostX = cx(cursor);

      for (let c = 0; c < COLS; c++) {
        text(String(c + 1), cx(c), BY + BH + 24, {
          size: 13, font: MONO, color: state === 'player' && c === cursor ? COLOR[HUMAN] : INK3, align: 'center',
        });
      }
    }

    function drawSelect(x0) {
      label('Choose your opponent', x0, PY + 32, 'left', ACCENT);
      const intro = wrap('The AI searches ahead before every move, and this panel shows its work.', PW - 36, 15, 500);
      intro.forEach((ln, i) => text(ln, x0, PY + 58 + i * 19, { size: 15, color: INK2 }));
      for (let i = 0; i < 3; i++) {
        const y = BTN_Y[i];
        const on = i === selIdx;
        ctx.fillStyle = on ? 'rgba(255, 122, 69, 0.14)' : 'rgba(245, 238, 242, 0.04)';
        roundRect(x0 - 2, y, PW - 32, BTN_H, 10);
        ctx.fill();
        ctx.strokeStyle = on ? ACCENT : LINE;
        ctx.lineWidth = on ? 2 : 1;
        ctx.stroke();
        const key = LEVEL_KEYS[i];
        text(`${i + 1}`, x0 + 12, y + 32, { size: 14, font: MONO, color: on ? ACCENT : INK3 });
        text(LEVELS[key].name, x0 + 38, y + 33, { size: 22, weight: 700, color: INK });
        wrap(LEVEL_INFO[key], PW - 90, 14, 500).slice(0, 2)
          .forEach((ln, k) => text(ln, x0 + 38, y + 55 + k * 18, { size: 14, color: INK2 }));
      }
      wrap('Click or tap a level, or press 1, 2 or 3. You drop first.', PW - 36, 14, 500)
        .forEach((ln, i) => text(ln, x0, PY + 410 + i * 18, { size: 14, color: INK3 }));
    }

    function drawPanel() {
      ctx.fillStyle = SURFACE;
      roundRect(PX, PY, PW, PH, 12);
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.stroke();
      const x0 = PX + 18, x1 = PX + PW - 18;
      if (state === 'select') { drawSelect(x0); return; }

      label("The AI's search", x0, PY + 30, 'left', ACCENT);
      label(LEVELS[levelKey].name, x1, PY + 30, 'right', COLOR[HUMAN]);
      const thinking = panel.mode === 'thinking';
      const dots = thinking ? '.'.repeat(1 + (Math.floor(frame / 12) % 3)) : '';
      text(panel.status + dots, x0, PY + 58, { size: 19, weight: 700, color: thinking ? COLOR[AI] : INK });

      // counters (the shown count eases up to the real one)
      if (thinking) panel.shownNodes += Math.ceil((panel.nodes - panel.shownNodes) * 0.35);
      else panel.shownNodes = panel.nodes;
      label('Positions', x0, PY + 88);
      text(fmt(panel.shownNodes), x0, PY + 116, { size: 26, font: MONO, weight: 600, color: INK });
      label('Depth', x1, PY + 88, 'right');
      text(panel.depth ? String(panel.depth) : '-', x1, PY + 116, { size: 26, font: MONO, weight: 600, color: INK, align: 'right' });

      label(panel.mode === 'played' ? 'Its move' : 'Best move so far', x0, PY + 146);
      text(panel.best >= 0 ? `Column ${panel.best + 1}` : '-', x0, PY + 172, {
        size: 20, weight: 700, color: panel.best >= 0 ? COLOR[AI] : INK3,
      });

      // per-column ratings: up is good for the AI, down is good for you
      label('How it rates each column', x0, PY + 202);
      const bw = 30, gap = (PW - 36 - bw * COLS) / (COLS - 1);
      const mid = PY + 266, half = 46;
      for (let c = 0; c < COLS; c++) {
        const x = x0 + c * (bw + gap);
        ctx.fillStyle = 'rgba(245, 238, 242, 0.05)';
        ctx.fillRect(x, mid - half, bw, half * 2);
        const s = panel.scores[c];
        if (s != null) {
          const v = s >= PROVEN ? 1 : s <= -PROVEN ? -1 : Math.tanh(s / 90);
          const h = Math.max(2, Math.abs(v) * half);
          ctx.globalAlpha = panel.stale[c] ? 0.35 : 1;
          ctx.fillStyle = v >= 0 ? COLOR[AI] : COLOR[HUMAN];
          if (v >= 0) ctx.fillRect(x, mid - h, bw, h);
          else ctx.fillRect(x, mid, bw, h);
          ctx.globalAlpha = 1;
          if (Math.abs(v) === 1) {
            text(v > 0 ? 'WIN' : 'LOSS', x + bw / 2, v > 0 ? mid - half - 6 : mid + half + 13, {
              size: 10, font: MONO, weight: 700, color: v > 0 ? COLOR[AI] : COLOR[HUMAN], align: 'center',
            });
          }
        } else if (!board.canPlay(c)) {
          text('FULL', x + bw / 2, mid + 4, { size: 9, font: MONO, color: INK3, align: 'center' });
        }
        if (c === panel.best && s != null) {
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 3, mid - half - 3, bw + 6, half * 2 + 6);
        }
        const numY = mid + half + 30;
        text(String(c + 1), x + bw / 2, numY, { size: 13, font: MONO, color: c === panel.best ? INK : INK3, align: 'center' });
        if (c === panel.examining) {
          ctx.fillStyle = INK;
          ctx.beginPath();
          ctx.moveTo(x + bw / 2, numY + 5);
          ctx.lineTo(x + bw / 2 - 5, numY + 12);
          ctx.lineTo(x + bw / 2 + 5, numY + 12);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.fillStyle = 'rgba(245, 238, 242, 0.3)';
      ctx.fillRect(x0, mid, PW - 36, 1);
      text('Up: good for the AI. Down: good for you.', x0, mid + half + 56, { size: 12, color: INK3 });

      label('Read', x0, PY + 404);
      const lines = panel.read ? wrap(panel.read, PW - 36, 17, 600) : [];
      if (!lines.length) lines.push(panel.mode === 'idle' ? 'Its reasoning shows here once it moves' : 'Reading the board');
      lines.slice(0, 2).forEach((ln, i) => text(ln, x0, PY + 428 + i * 21, {
        size: 17, weight: 600, color: panel.read ? INK : INK3,
      }));
    }

    function draw() {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      const shake = fx.shakeOffset();
      ctx.save();
      ctx.translate(shake.x, shake.y);
      drawHeader();
      drawBoard();
      ctx.restore();
      drawPanel();
      fx.updateAndDraw();
    }

    return {
      tick() {
        const t0 = performance.now();
        const wasThinking = state === 'think';
        frame++;
        if (state === 'drop' && falling) stepFalling();
        else if (state === 'think') stepThink();
        else if (state === 'over') {
          overTicks++;
          if (overTicks >= (turbo ? 2 : OVER_TICKS)) {
            draw();
            sendGameOver();
            return;
          }
        }
        draw();
        const dt = performance.now() - t0;
        if (dt > maxTickMs) { maxTickMs = dt; maxTickAt = `${wasThinking ? 'think' : state} frame ${frame}`; }
        if (wasThinking && dt > thinkMaxTickMs) thinkMaxTickMs = dt;
      },
    };
  },
};
