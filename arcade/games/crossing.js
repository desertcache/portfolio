// Roadrunner Crossing: hop the roadrunner over a desert highway and a flash-flood
// arroyo to the shady spots under the saguaros. Fill all five to clear the level.
// Flat drawn look: ink outlines over paper fills (see ./crossing/art.js).
import { drawText } from '../engine/font.js';
import {
  W, H, TS, COLS, OX, HUD_Y, ROWS, TAU, PAL, RUNNER, VEHICLE_COLORS,
  rowTop, rowCenter, colX, mulberry32, loadSprites, buildBackground, drawHudBase,
  makeVehicle, makeLog, makeRaft, makeWaterTile, drawFruit, slotXs,
} from './crossing/art.js';

const HOP_TICKS = 8;
const START_ROW = ROWS - 1; // 11
const WASH = [1, 2, 3, 4];
const isWash = (r) => r >= 1 && r <= 4;
const SLOT_TOL = 28;

// Lane recipes. v = px per tick at level 1, gap/width ranges in px.
const ROAD_LANES = [
  { row: 6, dir: -1, v: 1.7, kinds: ['car', 'pickup', 'pickup'], gap: [120, 250] },
  { row: 7, dir: 1, v: 1.0, kinds: ['semi', 'pickup'], gap: [140, 270] },
  { row: 8, dir: -1, v: 1.35, kinds: ['rv', 'pickup', 'car'], gap: [130, 260] },
  { row: 9, dir: 1, v: 2.1, kinds: ['car', 'car', 'pickup'], gap: [140, 290] },
  { row: 10, dir: -1, v: 1.5, kinds: ['pickup', 'car', 'semi'], gap: [120, 240] },
];
const WASH_LANES = [
  { row: 1, dir: -1, v: 0.9, kind: 'log', width: [120, 170], gap: [70, 120] },
  { row: 2, dir: 1, v: 1.25, kind: 'raft', width: [60, 90], gap: [70, 115] },
  { row: 3, dir: -1, v: 1.6, kind: 'log', width: [96, 132], gap: [80, 130] },
  { row: 4, dir: 1, v: 0.8, kind: 'log', width: [130, 190], gap: [60, 110] },
];

export default {
  id: 'CROSSING',
  title: 'Roadrunner Crossing',
  mode: 'landscape',
  ownHud: true,
  start(env) {
    const { ctx } = env;
    const rng = env.debug ? mulberry32(0x5eed) : Math.random;
    const rand = (a, b) => a + rng() * (b - a);
    const slotX = slotXs();
    const touchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

    // ---------- art ----------
    let sprites = null;
    let bg = buildBackground(null, 7);
    loadSprites().then((s) => {
      if (!s) return;
      sprites = s;
      bg = buildBackground(s, 7);
    });
    const waterPats = WASH.map((r) => ctx.createPattern(makeWaterTile(100 + r), 'repeat'));

    // ---------- state ----------
    let level = 1;
    let score = 0;
    let lives = 3;
    let nextLifeAt = 10000;
    let phase = 'play'; // play | dying | filled | levelclear | over
    let phaseT = 0;
    let deathCause = '';
    let paused = false;
    let frozen = false;
    let tickN = 0;
    let bannerT = 130;
    let timerMax = 30 * 60;
    let timer = timerMax;
    let bestRow = START_ROW;
    let slots = slotX.map((x) => ({ x, filled: false }));
    let fruit = null; // { slot, life }
    let fruitIn = 420;
    let lanes = [];
    let laneByRow = {};
    let buffer = null; // { dx, dy, age }
    let flick = 0;
    let deferred = null;
    let fling = null; // the bird knocked off the road
    const parts = [];
    const pops = [];
    const perf = { last: 0, max: 0, sum: 0, n: 0 };

    const P = { x: colX(10), row: START_ROW, face: 1, hop: null, land: 0, lastFill: -1 };

    // ---------- lanes ----------
    function timeFor(lv) { return Math.max(20, 32 - 1.5 * (lv - 1)) * 60; }

    function buildLanes(lv) {
      const L = lv - 1;
      const speedMul = Math.min(2.2, 1 + 0.11 * L);
      const roadGap = Math.max(0.62, 1 - 0.07 * L);
      const washGap = Math.min(1.4, 1 + 0.06 * L);
      const washWide = Math.max(0.68, 1 - 0.05 * L);
      lanes = [];
      laneByRow = {};
      for (const def of ROAD_LANES) {
        const objs = [];
        let x = 0;
        while (x < W + 320) {
          const kind = def.kinds[Math.floor(rng() * def.kinds.length)];
          const color = VEHICLE_COLORS[Math.floor(rng() * VEHICLE_COLORS.length)];
          const spr = makeVehicle(kind, color, def.dir);
          objs.push({ x, w: spr.w, spr, kind });
          x += spr.w + Math.max(88, rand(def.gap[0], def.gap[1]) * roadGap);
        }
        lanes.push(finishLane(def, 'road', objs, x, def.v * speedMul));
      }
      for (const def of WASH_LANES) {
        const objs = [];
        let x = 0;
        while (x < W + 320) {
          const w = Math.max(54, Math.round((rand(def.width[0], def.width[1]) * washWide) / 12) * 12);
          const spr = def.kind === 'log' ? makeLog(w, rng) : makeRaft(w, rng);
          objs.push({ x, w: spr.w, spr, kind: def.kind });
          x += spr.w + Math.min(150, Math.max(50, rand(def.gap[0], def.gap[1]) * washGap));
        }
        lanes.push(finishLane(def, 'wash', objs, x, def.v * (1 + 0.08 * L)));
      }
      for (const lane of lanes) laneByRow[lane.row] = lane;
    }

    function finishLane(def, type, objs, total, v) {
      const shift = rng() * total;
      for (const o of objs) o.x = ((o.x + shift) % total) - 220;
      return { row: def.row, dir: def.dir, v, type, objs, total };
    }

    function updateLanes() {
      for (const lane of lanes) {
        const dx = lane.v * lane.dir;
        for (const o of lane.objs) {
          o.x += dx;
          if (lane.dir > 0 && o.x > lane.total - 220) o.x -= lane.total;
          else if (lane.dir < 0 && o.x < -220) o.x += lane.total;
        }
      }
    }

    function platformAt(row, x) {
      const lane = laneByRow[row];
      if (!lane) return null;
      for (const o of lane.objs) if (x > o.x + 7 && x < o.x + o.w - 7) return o;
      return null;
    }

    function hopRow() {
      if (!P.hop) return P.row;
      return P.hop.t / HOP_TICKS < 0.5 ? P.hop.fromRow : P.hop.toRow;
    }

    function hitByTraffic() {
      const lane = laneByRow[hopRow()];
      if (!lane || lane.type !== 'road') return false;
      const x = P.hop ? P.hop.fromX + (P.hop.toX - P.hop.fromX) * (P.hop.t / HOP_TICKS) : P.x;
      for (const o of lane.objs) {
        if (x + 11 > o.x + 3 && x - 11 < o.x + o.w - 3) return true;
      }
      return false;
    }

    // ---------- sound ----------
    const sfx = {
      hop(row, up) {
        env.audio.play('cross-hop', (h) => h.tone({ f: (up ? 300 : 230) + (START_ROW - row) * 26, dur: 0.05, type: 'square', vol: 0.07 }));
      },
      bonk() { env.audio.play('cross-bonk', (h) => h.tone({ f: 120, slideTo: 90, dur: 0.07, type: 'square', vol: 0.08 })); },
      splat() {
        env.audio.play('cross-splat', (h) => {
          h.noise({ dur: 0.22, vol: 0.18 });
          h.tone({ f: 240, slideTo: 50, dur: 0.3, type: 'sawtooth', vol: 0.1 });
        });
      },
      splash() {
        env.audio.play('cross-splash', (h) => {
          h.noise({ dur: 0.4, vol: 0.16, filterFrom: 3200, filterTo: 300 });
          h.tone({ f: 520, slideTo: 180, dur: 0.25, type: 'triangle', vol: 0.09 });
        });
      },
      meep() {
        env.audio.play('cross-meep', (h) => {
          h.tone({ f: 1100, slideTo: 1750, dur: 0.09, type: 'square', vol: 0.08 });
          h.tone({ f: 1250, slideTo: 1900, dur: 0.1, type: 'square', vol: 0.08, at: 0.13 });
        });
      },
      bonus() {
        env.audio.play('cross-bonus', (h) => h.seq([
          { f: 660, type: 'triangle', vol: 0.09 }, { f: 880, type: 'triangle', vol: 0.09 }, { f: 1320, type: 'triangle', vol: 0.09 },
        ], 0.07));
      },
      clear() {
        env.audio.play('cross-clear', (h) => h.seq([
          { f: 523, type: 'square', vol: 0.08 }, { f: 659, type: 'square', vol: 0.08 }, { f: 784, type: 'square', vol: 0.08 },
          { f: 1047, type: 'square', vol: 0.09 }, null, { f: 784, type: 'square', vol: 0.07 }, { f: 1047, type: 'square', vol: 0.1 },
        ], 0.1));
      },
      warn() { env.audio.play('cross-warn', (h) => h.tone({ f: 880, dur: 0.04, type: 'square', vol: 0.06 })); },
      life() {
        env.audio.play('cross-life', (h) => h.seq([
          { f: 784, type: 'triangle', vol: 0.09 }, { f: 988, type: 'triangle', vol: 0.09 }, { f: 1568, type: 'triangle', vol: 0.09 },
        ], 0.08));
      },
      over() {
        env.audio.play('cross-over', (h) => h.seq([
          { f: 392, type: 'sawtooth', vol: 0.08 }, { f: 330, type: 'sawtooth', vol: 0.08 }, { f: 262, type: 'sawtooth', vol: 0.08 }, { f: 196, type: 'sawtooth', vol: 0.09 },
        ], 0.14));
      },
    };

    // ---------- scoring ----------
    function addScore(n) {
      score += n;
      env.onScore(score);
      while (score >= nextLifeAt) {
        nextLifeAt += 10000;
        lives++;
        sfx.life();
        pops.push({ x: W / 2, y: HUD_Y - 40, text: '1UP', life: 70 });
      }
    }

    // ---------- particles (flat: paper blobs with an ink edge) ----------
    function dust(x, y, n, spread = 1) {
      for (let i = 0; i < n; i++) {
        parts.push({ k: 'dust', x: x + (rng() - 0.5) * 10, y, vx: (rng() - 0.5) * 1.2 * spread, vy: -0.15 - rng() * 0.35, r: 2 + rng() * 2.2, life: 20 + rng() * 10, max: 30 });
      }
      if (parts.length > 160) parts.splice(0, parts.length - 160);
    }
    function feathers(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, s = 1.2 + rng() * 2.6;
        parts.push({ k: 'feather', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2, rot: rng() * TAU, vr: (rng() - 0.5) * 0.4, life: 50 + rng() * 20, max: 70 });
      }
    }
    function rings(x, y) {
      for (let i = 0; i < 3; i++) parts.push({ k: 'ring', x, y, r: 1 + i * 4, vr: 0.7, life: 38 + i * 5, max: 38 + i * 5 });
      for (let i = 0; i < 5; i++) parts.push({ k: 'bub', x: x + (rng() - 0.5) * 20, y, vx: (rng() - 0.5) * 0.8, vy: -1.2 - rng() * 1.6, r: 1.6 + rng() * 2, life: 26 + rng() * 14, max: 40 });
    }
    function updateParts() {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life--;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        if (p.k === 'ring') { p.r += p.vr; continue; }
        p.x += p.vx; p.y += p.vy;
        if (p.k === 'feather') { p.vy += 0.07; p.vx *= 0.97; p.rot += p.vr; }
        else if (p.k === 'dust') { p.r += 0.12; }
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        pops[i].life--; pops[i].y -= 0.1;
        if (pops[i].life <= 0) pops.splice(i, 1);
      }
    }

    // ---------- hop / land / die ----------
    function snapX(x) {
      const c = Math.min(COLS - 1, Math.max(0, Math.round((x - OX - TS / 2) / TS)));
      return colX(c);
    }

    function bonk() {
      sfx.bonk();
      env.fx.shake(2, 6);
      dust(P.x, rowCenter(P.row) - 8, 2, 0.6);
    }

    function tryHop(dx, dy) {
      if (paused || phase !== 'play') return;
      if (P.hop) { buffer = { dx, dy, age: 0 }; return; }
      const toRow = P.row + dy;
      if (toRow < 0 || toRow > START_ROW) return;
      let toX = P.x + dx * TS;
      if (dx) {
        const wash = isWash(P.row);
        const lo = wash ? 14 : OX + TS / 2, hi = wash ? W - 14 : OX + COLS * TS - TS / 2;
        if (toX < lo - 1 || toX > hi + 1) return;
        P.face = dx;
      }
      let slot = -1;
      if (toRow === 0) {
        let best = 1e9;
        slotX.forEach((sx, i) => { const d = Math.abs(sx - toX); if (d < best) { best = d; slot = i; } });
        if (best > SLOT_TOL || slots[slot].filled) { bonk(); return; }
        toX = slotX[slot];
      } else if (!isWash(toRow)) {
        toX = snapX(toX);
      }
      const fromY = rowCenter(P.row);
      P.hop = { t: 0, fromX: P.x, fromY, toX, toY: rowCenter(toRow), fromRow: P.row, toRow, slot, dy };
      sfx.hop(toRow, dy <= 0);
      if (!isWash(P.row)) dust(P.x, fromY + 14, 3, 1);
    }

    function land() {
      const h = P.hop;
      P.hop = null;
      P.row = h.toRow;
      P.x = h.toX;
      P.land = 6;
      if (h.toRow < bestRow && h.toRow > 0) { bestRow = h.toRow; addScore(10); }
      if (h.toRow === 0) { fillSlot(h.slot); return; }
      if (isWash(P.row)) {
        if (!platformAt(P.row, P.x)) { kill('water'); return; }
        rings(P.x, rowCenter(P.row) + 12);
      } else {
        dust(P.x, rowCenter(P.row) + 14, 4, 1.4);
      }
    }

    function kill(cause) {
      if (phase !== 'play') return;
      phase = 'dying';
      phaseT = 0;
      deathCause = cause;
      lives--;
      P.hop = null;
      buffer = null;
      const y = rowCenter(P.row);
      if (cause === 'water') {
        sfx.splash();
        rings(P.x, y + 12);
        env.fx.shake(2, 8);
      } else if (cause === 'car') {
        const dir = laneByRow[P.row] ? laneByRow[P.row].dir : 1;
        fling = { x: P.x, y, vx: dir * 2.6, vy: -4.2, rot: 0, vr: dir * 0.32 };
        sfx.splat();
        feathers(P.x, y, 11);
        dust(P.x, y + 12, 6, 2);
        env.fx.shake(5, 14);
        env.fx.hitPause(5);
      } else {
        sfx.splat();
        feathers(P.x, y, 7);
        env.fx.shake(2, 8);
      }
    }

    function fillSlot(i) {
      const s = slots[i];
      s.filled = true;
      P.lastFill = i;
      phase = 'filled';
      phaseT = 0;
      const secs = Math.ceil(timer / 60);
      let pts = 50 + secs * 10;
      let bonus = false;
      if (fruit && fruit.slot === i) { pts += 200; fruit = null; bonus = true; }
      addScore(pts);
      pops.push({ x: s.x, y: 66, text: `+${pts}`, life: 70 });
      sfx.meep();
      if (bonus) deferred = { t: 22, fn: sfx.bonus };
      dust(s.x, 56, 8, 2.2);
      env.fx.shake(1.5, 5);
    }

    function respawn() {
      phase = 'play';
      phaseT = 0;
      P.x = colX(10);
      P.row = START_ROW;
      P.hop = null;
      P.land = 0;
      P.face = 1;
      buffer = null;
      bestRow = START_ROW;
      timer = timerMax;
    }

    function newLevel() {
      slots = slotX.map((x) => ({ x, filled: false }));
      fruit = null;
      fruitIn = 360 + Math.floor(rand(0, 240));
      timerMax = timeFor(level);
      buildLanes(level);
      bannerT = 110;
      respawn();
    }

    function updatePlayer() {
      if (P.hop) {
        P.hop.t++;
        if (P.hop.t >= HOP_TICKS) land();
      }
      if (phase !== 'play') return;
      if (!P.hop) {
        if (isWash(P.row)) {
          if (!platformAt(P.row, P.x)) { kill('water'); return; }
          const lane = laneByRow[P.row];
          if (!frozen) P.x += lane.v * lane.dir;
          if (P.x < 6 || P.x > W - 6) { kill('swept'); return; }
        }
        if (buffer) {
          const b = buffer;
          buffer = null;
          if (b.age <= 8) tryHop(b.dx, b.dy);
        }
      }
      if (buffer) buffer.age++;
      if (hitByTraffic()) { kill('car'); return; }
      if (!P.hop && ++flick > 260) flick = 0;
    }

    // ---------- input ----------
    const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const hopDir = (d) => { const v = DIRS[d]; tryHop(v[0], v[1]); };
    const KEYMAP = {
      ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    };
    env.input.onKeyDown((e) => {
      if (e.repeat) return;
      if (e.key === 'p' || e.key === 'P') { paused = !paused; return; }
      const d = KEYMAP[e.key];
      if (d) hopDir(d);
    });
    // Touch: a drag steers (swipe), a quick tap hops forward. The tap is
    // confirmed when the finger lifts so a swipe never also counts as a tap.
    const touches = env.input.trackTouches();
    let tap = null;
    env.input.onTap(() => { tap = { age: 0 }; });
    env.input.onSwipe((dir) => { tap = null; hopDir(dir); });
    function pollTouch() {
      if (!tap) return;
      if (touches.size === 0 || ++tap.age > 12) { tap = null; tryHop(0, -1); }
    }

    // ---------- phases ----------
    function updatePhase() {
      phaseT++;
      if (phase === 'play') {
        if (!frozen) timer--;
        if (timer > 0 && timer % 60 === 0 && timer <= 300) sfx.warn();
        if (timer <= 0) kill('time');
        // the prickly-pear fruit
        if (fruit) {
          if (--fruit.life <= 0) { fruit = null; fruitIn = 400 + Math.floor(rand(0, 400)); }
        } else if (--fruitIn <= 0) {
          const open = slots.map((s, i) => (s.filled ? -1 : i)).filter((i) => i >= 0);
          if (open.length) fruit = { slot: open[Math.floor(rng() * open.length)], life: 420 };
          fruitIn = 400;
        }
      } else if (phase === 'dying') {
        if (fling) { fling.x += fling.vx; fling.y += fling.vy; fling.vy += 0.4; fling.rot += fling.vr; }
        if (phaseT >= 62) {
          fling = null;
          if (lives <= 0) {
            phase = 'over';
            phaseT = 0;
            sfx.over();
          } else respawn();
        }
      } else if (phase === 'over') {
        // dim the scene, then hand over to the cabinet's game-over screen
        if (phaseT >= 26) { phase = 'ended'; env.onGameOver(score); }
      } else if (phase === 'filled') {
        if (phaseT >= 46) {
          if (slots.every((s) => s.filled)) {
            phase = 'levelclear';
            phaseT = 0;
            sfx.clear();
            addScore(1000);
            pops.push({ x: W / 2, y: 140, text: '+1000', life: 110 });
          } else respawn();
        }
      } else if (phase === 'levelclear') {
        if (phaseT >= 130) { level++; newLevel(); }
      }
      if (deferred && --deferred.t <= 0) { deferred.fn(); deferred = null; }
    }

    // ---------- drawing ----------
    function drawBird(x, yc, o = {}) {
      const { frame = RUNNER.stand, face = 1, sx = 1, sy = 1, rot = 0, up = 0, alpha = 1, flipV = false } = o;
      const spr = sprites && sprites.runner[frame];
      ctx.save();
      if (alpha < 1) ctx.globalAlpha = alpha;
      ctx.translate(x, yc + 14 - up);
      if (rot) ctx.rotate(rot);
      ctx.scale(face * sx, (flipV ? -1 : 1) * sy);
      if (spr) {
        ctx.drawImage(spr.img, -RUNNER.pivot * RUNNER.w, -RUNNER.h, RUNNER.w, RUNNER.h);
      } else {
        ctx.lineWidth = 1.5; ctx.strokeStyle = PAL.ink; ctx.fillStyle = '#ecdccf';
        ctx.beginPath(); ctx.ellipse(0, -14, 14, 7, 0, 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }

    function shadow(x, y, s = 1) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = PAL.ink;
      ctx.beginPath(); ctx.ellipse(x, y, 13 * s, 3.4 * s, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    function drawDeath() {
      const t = phaseT;
      const yc = rowCenter(P.row);
      if (deathCause === 'water') {
        // sink below the waterline: clip away anything under the surface
        ctx.save();
        ctx.beginPath(); ctx.rect(P.x - 40, yc - 40, 80, 40 + 4); ctx.clip();
        drawBird(P.x, yc, { frame: 2, face: P.face, up: -Math.min(26, t * 0.9), rot: t * 0.02 * P.face });
        ctx.restore();
      } else if (deathCause === 'time') {
        // flattened, belly up, then gone
        const a = t < 38 ? 1 : Math.max(0, 1 - (t - 38) / 18);
        drawBird(P.x, yc + 4, { frame: RUNNER.stand, face: P.face, sy: 0.3, sx: 1.12, alpha: a, flipV: true });
      }
    }

    function drawPlayer() {
      if (phase === 'dying' || phase === 'over') { drawDeath(); return; }
      if (phase === 'filled' || phase === 'levelclear') return; // she is in the slot
      const yc = rowCenter(P.row);
      if (P.hop) {
        const h = P.hop, p = h.t / HOP_TICKS;
        const x = h.fromX + (h.toX - h.fromX) * p;
        const y = h.fromY + (h.toY - h.fromY) * p;
        const arc = Math.sin(p * Math.PI) * 9;
        shadow(x, y + 14, 1 - arc / 30);
        const frame = Math.floor(p * RUNNER.runFrames) % RUNNER.runFrames;
        const stretch = 1 + Math.sin(p * Math.PI) * 0.08;
        drawBird(x, y, { frame, face: P.face, sy: stretch, sx: 1 / Math.sqrt(stretch), up: arc, rot: (h.dy < 0 ? -0.1 : h.dy > 0 ? 0.1 : 0) * P.face });
        return;
      }
      shadow(P.x, yc + 14, 1);
      const sq = P.land > 0 ? P.land / 6 : 0;
      const frame = flick > 242 && flick % 8 < 4 ? RUNNER.flick : RUNNER.stand;
      drawBird(P.x, yc, { frame, face: P.face, sx: 1 + sq * 0.14, sy: 1 - sq * 0.16 });
    }

    function drawLane(lane) {
      const cy = rowCenter(lane.row);
      for (const o of lane.objs) {
        if (o.x > W + 4 || o.x + o.w < -4) continue;
        ctx.drawImage(o.spr.c, Math.round(o.x) - 2, Math.round(cy - o.spr.c.height / 2));
      }
    }

    function drawWater() {
      WASH.forEach((r, i) => {
        const lane = laneByRow[r];
        const off = (tickN * lane.v * lane.dir * 0.6) % 120;
        ctx.save();
        ctx.translate(off, rowTop(r));
        ctx.fillStyle = waterPats[i];
        ctx.fillRect(-off, 0, W, TS);
        ctx.restore();
      });
    }

    function drawSlots() {
      slots.forEach((s, i) => {
        if (s.filled) {
          const f = i === P.lastFill && phase === 'filled' && phaseT % 16 > 9 ? RUNNER.flick : RUNNER.stand;
          drawBird(s.x, 44, { frame: f, face: i % 2 ? -1 : 1 });
        } else {
          ctx.save();
          ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.ellipse(s.x, 47, 21, 12, 0, 0, TAU); ctx.stroke();
          ctx.restore();
        }
      });
      if (fruit) {
        const blink = fruit.life < 100 && Math.floor(fruit.life / 6) % 2 === 0;
        if (!blink) drawFruit(ctx, slots[fruit.slot].x, 42 + Math.sin(tickN * 0.1) * 1.5, 1.1);
      }
    }

    function drawPops() {
      for (const p of pops) {
        const w = p.text.length * 24 + 12;
        const x = Math.round(p.x - w / 2), y = Math.round(p.y);
        ctx.fillStyle = PAL.paper;
        ctx.fillRect(x, y, w, 30);
        ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 29);
        drawText(ctx, p.text, p.x, y + 3, { color: PAL.redrock, scale: 3, align: 'center' });
      }
    }

    function drawParts() {
      for (const p of parts) {
        ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.6));
        ctx.lineWidth = 1;
        ctx.strokeStyle = PAL.ink;
        if (p.k === 'dust') {
          ctx.fillStyle = '#f1e4c4';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); ctx.stroke();
        } else if (p.k === 'feather') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = '#ecdccf';
          ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 2.4, 0, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
          ctx.restore();
        } else if (p.k === 'ring') {
          ctx.strokeStyle = '#eef6f0'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.6, p.r * 0.7, 0, 0, TAU); ctx.stroke();
        } else {
          ctx.strokeStyle = '#eef6f0'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    function chip(text, y, scale, color, sub) {
      const w = Math.max(text.length * 8 * scale, sub ? sub.length * 24 : 0) + 36;
      const h = 8 * scale + 20 + (sub ? 36 : 0);
      const x = Math.round((W - w) / 2), yy = Math.round(y);
      ctx.fillStyle = PAL.paper; ctx.fillRect(x, yy, w, h);
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2; ctx.strokeRect(x + 1, yy + 1, w - 2, h - 2);
      drawText(ctx, text, W / 2, yy + 10, { color, scale, align: 'center' });
      if (sub) drawText(ctx, sub, W / 2, yy + 8 * scale + 18, { color: PAL.ink2, scale: 3, align: 'center' });
    }

    function drawHud() {
      drawHudBase(ctx);
      const shown = Math.min(lives, 4);
      const stand = sprites && sprites.runner[RUNNER.stand];
      for (let i = 0; i < shown; i++) {
        if (stand) ctx.drawImage(stand.img, 8 + i * 56, HUD_Y + 5, 52, 34);
      }
      if (lives > 4) drawText(ctx, `+${lives - 4}`, 8 + 4 * 56, HUD_Y + 9, { color: PAL.paper, scale: 3 });
      drawText(ctx, String(score), 258, HUD_Y + 9, { color: PAL.paper, scale: 3, align: 'right' });
      const bx = 280, by = HUD_Y + 11, bw = 360, bh = 20;
      ctx.fillStyle = PAL.hudDeep; ctx.fillRect(bx, by, bw, bh);
      const frac = Math.max(0, timer / timerMax);
      const col = frac > 0.5 ? PAL.sage : frac > 0.25 ? PAL.mustard : (timer % 30 < 15 ? PAL.terracotta : PAL.redrock);
      ctx.fillStyle = col; ctx.fillRect(bx + 2, by + 2, Math.round((bw - 4) * frac), bh - 4);
      ctx.strokeStyle = PAL.paper; ctx.lineWidth = 2; ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
      drawText(ctx, `L${level}`, W - 10, HUD_Y + 9, { color: PAL.paper, scale: 3, align: 'right' });
    }

    function draw() {
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(0, 0, W, H);
      const o = env.fx.shakeOffset();
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.drawImage(bg, 0, 0);
      drawWater();
      for (const lane of lanes) if (lane.type === 'wash') drawLane(lane);
      drawSlots();
      drawPlayerLayer();
      drawParts();
      drawPops();
      ctx.restore();
      drawHud();
      if (phase === 'over' || phase === 'ended') {
        ctx.fillStyle = `rgba(36, 28, 36, ${Math.min(0.7, phaseT * 0.05).toFixed(2)})`;
        ctx.fillRect(0, 0, W, H);
      }

      if (bannerT > 0 && phase === 'play') {
        const sub = level === 1 ? (touchDevice ? 'SWIPE TO HOP, TAP TO GO UP' : 'ARROWS OR WASD TO HOP') : null;
        chip(`LEVEL ${level}`, 200, 5, PAL.redrock, sub);
      }
      if (phase === 'levelclear') chip('LEVEL CLEAR', 200, 5, PAL.sageDark);
      if (paused) chip('PAUSED', 200, 5, PAL.ink, 'PRESS P TO RESUME');
    }

    // The bird is drawn first so vehicles pass over it: a hit reads as a hit.
    function drawPlayerLayer() {
      drawPlayer();
      for (const lane of lanes) if (lane.type === 'road') drawLane(lane);
      if (fling) {
        // knocked clear: spins off over the top of the traffic
        const a = phaseT < 40 ? 1 : Math.max(0, 1 - (phaseT - 40) / 22);
        drawBird(fling.x, fling.y, { frame: 2, face: P.face, rot: fling.rot, alpha: a });
      }
    }

    // ---------- debug ----------
    const exposed = {};
    function expose() {
      if (!env.debug) return;
      Object.assign(exposed, {
        phase, level, score, lives, timer, timerMax, paused, frozen,
        row: P.row, x: P.x, hopping: !!P.hop, bestRow,
        slots: slots.map((s) => s.filled), fruit: fruit && { ...fruit },
        deathCause, tickMs: perf.last, tickMsMax: perf.max, tickMsAvg: perf.n ? perf.sum / perf.n : 0,
        spritesReady: !!sprites,
        lanes: lanes.map((l) => ({ row: l.row, dir: l.dir, v: l.v, objs: l.objs.length })),
      });
      env.expose(exposed);
    }

    if (env.debug && env.exposeActions) {
      env.exposeActions({
        teleport(col, row) { P.hop = null; P.row = row; P.x = colX(col); },
        teleportX(x, row) { P.hop = null; P.row = row; P.x = x; },
        hop(dir) { hopDir(dir); },
        freeze(on = true) { frozen = on; },
        clearTraffic() { for (const l of lanes) if (l.type === 'road') l.objs.length = 0; },
        // put a vehicle right on top of the bird
        ram(kind = 'pickup') {
          const lane = laneByRow[P.row];
          if (!lane || lane.type !== 'road') return false;
          const spr = makeVehicle(kind, '#c8693f', lane.dir);
          lane.objs.push({ x: P.x - spr.w / 2, w: spr.w, spr, kind });
          return true;
        },
        // a single log/raft centered under the bird on its wash row
        platformUnder(width = 120) {
          const lane = laneByRow[P.row];
          if (!lane || lane.type !== 'wash') return false;
          const w = Math.round(width / 12) * 12;
          const spr = lane.row === 2 ? makeRaft(w, rng) : makeLog(w, rng);
          lane.objs.length = 0;
          lane.objs.push({ x: P.x - w / 2, w: spr.w, spr, kind: 'log' });
          return true;
        },
        clearLane(row) { const l = laneByRow[row]; if (l) l.objs.length = 0; },
        setTimer(sec) { timer = Math.round(sec * 60); },
        setLives(n) { lives = n; },
        setScore(n) { score = n; env.onScore(score); },
        setLevel(n) { level = n; newLevel(); },
        spawnFruit(i = 2) { fruit = { slot: i, life: 420 }; },
        fillSlots(idx) { for (const i of idx) slots[i].filled = true; },
        // stand on a log in the top wash row directly below slot i
        stageSlot(i) {
          P.hop = null; P.row = 1; P.x = slotX[i]; P.face = 1;
          const w = 144, spr = makeLog(w, rng);
          laneByRow[1].objs.length = 0;
          laneByRow[1].objs.push({ x: P.x - w / 2, w: spr.w, spr, kind: 'log' });
        },
      });
    }

    // ---------- go ----------
    env.onScore(0);
    buildLanes(1);
    timerMax = timeFor(1);
    timer = timerMax;
    expose();

    return {
      tick() {
        if (env.fx.consumePause()) return;
        const t0 = performance.now();
        if (phase === 'ended') return;
        if (!paused) {
          tickN++;
          pollTouch();
          if (!frozen) updateLanes();
          if (P.land > 0) P.land--;
          updatePlayer();
          updatePhase();
          updateParts();
          if (bannerT > 0) bannerT--;
        }
        draw();
        const dt = performance.now() - t0;
        perf.last = dt;
        perf.sum += dt;
        perf.n++;
        if (tickN > 30 && dt > perf.max) perf.max = dt;
        expose();
      },
    };
  },
};
