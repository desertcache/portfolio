// Mesa Lander, the player's game: fly a lander onto the flat top of a desert mesa.
// Left and right turn it, Up or Space fires the main engine; on a phone, hold the left or
// right edge to turn and the lower middle to thrust. Each landing scores base + softness
// + accuracy + fuel left; the next level has a narrower pad, new mesas and, later, gusts.
// Three landers a game. Physics are shared with the learning agent (physics.js).
import {
  makeLander, resetLander, stepLander, altitude, surfaceAt,
  LEFT, MAIN, RIGHT, FLYING, LANDED, CRASHED, LOST, LIMITS,
} from './physics.js';
import { buildLevel, windAt, scoreLanding, LANDERS, SCREEN } from './levels.js';
import { buildScene, drawLander, drawBeacons, text, chip, arrow, PAL, FONT, TAU } from './art.js';
import { Parts } from './parts.js';
import { createSfx } from './sfx.js';
import { mulberry32, hashSeed } from './rng.js';

const INTRO_TICKS = 70;
const LANDED_TICKS = 170;
const CRASHED_TICKS = 110;
const OVER_TICKS = 80;
const HUD_H = 66;

const WHY = {
  wall: 'Hit the side of a mesa',
  offpad: 'Missed the pad',
  fast: 'Came down too fast',
  slide: 'Sliding sideways',
  tilt: 'Landed tilted',
  spin: 'Still spinning',
  lost: 'Lost contact',
};

const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function startPlay(env) {
  const { ctx, W, H, input, audio } = env;
  const sfx = createSfx(audio);
  const touches = input.trackTouches();
  const hasTouch = (navigator.maxTouchPoints || 0) > 0;
  const rand = env.debug ? mulberry32(hashSeed(1, 0xfa11)) : Math.random;
  const parts = new Parts();

  const S = {
    mode: 'play',
    phase: 'intro', // intro | play | landed | crashed | over | done
    phaseT: 0,
    paused: false,
    level: 1,
    score: 0,
    landers: LANDERS,
    tick: 0, // ticks since the game began
    levelTick: 0, // ticks since this lander was set loose (drives the wind)
    wind: 0,
    windOverride: null,
    held: null, // test hook: controls held by hand instead of the keys
    frozen: false,
    last: null, // the last landing's points, or the last crash's cause
    touchSeen: false,
    lander: null,
    L: null,
    get fuel() { return S.lander.fuel; },
    get altitude() { return altitude(S.lander, S.L.terrain); },
    get pad() { return S.L.terrain.pad; },
    get ctl() { return ctl; },
  };

  let ctl = 0;
  let scene = null;
  let nextLevel = null;
  let ended = false;
  let lowBeepAt = -99;
  let puffAt = -99;
  let zoneHot = { left: false, right: false, thrust: false };
  let shown = 0; // the landing total counted up on screen
  let impact = null; // where the last crash happened

  const streaks = Array.from({ length: 18 }, () => ({ x: rand() * W, y: 70 + rand() * 300, len: 14 + rand() * 28, spd: 0.6 + rand() * 0.9 }));

  function loadLevel(n, preBuilt = null) {
    S.level = n;
    S.L = preBuilt ? preBuilt.level : buildLevel(n);
    scene = preBuilt ? preBuilt.scene : buildScene(S.L.terrain, { seed: S.L.sceneSeed });
    S.lander = makeLander({ ...S.L.start, fuel: S.L.tank });
    S.levelTick = 0;
    S.wind = 0;
    S.phase = 'intro';
    S.phaseT = 0;
    parts.clear();
    impact = null;
    sfx.level();
  }

  function retryLevel() {
    resetLander(S.lander, { ...S.L.start, fuel: S.L.tank });
    S.levelTick = 0;
    S.wind = 0;
    S.phase = 'intro';
    S.phaseT = 0;
    parts.clear();
    impact = null;
  }

  // ---- controls: keys and touch zones ----
  const zoneOf = (p) => {
    if (p.x < W * 0.25) return 'left';
    if (p.x > W * 0.75) return 'right';
    if (p.y > H * 0.55) return 'thrust';
    return null;
  };

  function readControls() {
    if (S.held != null) return S.held;
    zoneHot = { left: false, right: false, thrust: false };
    for (const p of touches.values()) {
      const z = zoneOf(p);
      if (z) zoneHot[z] = true;
    }
    if (touches.size > 0) S.touchSeen = true;
    let c = 0;
    if (input.held('ArrowLeft') || input.held('a') || input.held('A') || zoneHot.left) c |= LEFT;
    if (input.held('ArrowRight') || input.held('d') || input.held('D') || zoneHot.right) c |= RIGHT;
    if (input.held('ArrowUp') || input.held(' ') || input.held('w') || input.held('W') || zoneHot.thrust) c |= MAIN;
    return c;
  }

  input.onKeyDown((e) => {
    if (ended || e.repeat) return;
    if (e.key === 'p' || e.key === 'P') {
      S.paused = !S.paused;
      if (S.paused) sfx.engine(false);
    }
  });

  // ---- what happens ----
  function onLanded() {
    const lander = S.lander;
    const pts = scoreLanding(S.level, lander, S.L.terrain);
    S.score += pts.total;
    env.onScore(S.score);
    S.last = { kind: 'landed', ...pts, level: S.level };
    S.phase = 'landed';
    S.phaseT = 0;
    shown = 0;
    sfx.engine(false);
    sfx.land();
    const pad = S.L.terrain.pad;
    for (let i = 0; i < 34; i++) {
      parts.confetti(pad.cx + (rand() - 0.5) * pad.width * 0.8, pad.y - 14, (rand() - 0.5) * 3.2, -1.2 - rand() * 2.8, rand);
    }
    for (let i = 0; i < 6; i++) parts.dust(lander.x + (rand() < 0.5 ? -14 : 14), pad.y - 2, (rand() - 0.5) * 1.6, -rand() * 0.4, 4 + rand() * 3, 26);
    // Build the next level's scene now, while the celebration plays.
    const lv = buildLevel(S.level + 1);
    nextLevel = { level: lv, scene: buildScene(lv.terrain, { seed: lv.sceneSeed }) };
  }

  function onCrashed(status) {
    const lander = S.lander;
    S.landers--;
    S.phase = 'crashed';
    S.phaseT = 0;
    sfx.engine(false);
    if (status === LOST) {
      S.last = { kind: 'lost', cause: 'lost', why: WHY.lost };
      sfx.lost();
    } else {
      S.last = { kind: 'crashed', cause: lander.cause, why: WHY[lander.cause] || 'Crashed' };
      impact = { x: lander.x, y: lander.y + 10 };
      parts.crash(lander.x, lander.y + 6, rand);
      env.fx.shake(6, 16);
      env.fx.hitPause(3);
      sfx.crash();
    }
  }

  function gameOver() {
    S.phase = 'over';
    S.phaseT = 0;
    sfx.over();
  }

  // ---- one tick of the world ----
  function update() {
    S.tick++;
    const L = S.L;
    const lander = S.lander;
    for (const s of streaks) {
      if (Math.abs(S.wind) > 0.3) {
        s.x += S.wind * s.spd * 0.9;
        if (s.x > W + 40) s.x = -40;
        else if (s.x < -40) s.x = W + 40;
      }
    }
    S.phaseT++;
    if (S.phase === 'intro') {
      if (S.phaseT >= INTRO_TICKS) { S.phase = 'play'; S.phaseT = 0; }
    } else if (S.phase === 'play') {
      ctl = readControls();
      S.levelTick++;
      S.wind = S.windOverride != null ? S.windOverride : windAt(L, S.levelTick);
      const st = S.frozen ? FLYING : stepLander(lander, ctl, L.terrain, S.wind);
      // sound and puffs
      sfx.engine((lander.fire & MAIN) !== 0);
      if ((lander.fire & (LEFT | RIGHT)) && S.tick - puffAt > 8) { puffAt = S.tick; sfx.puff(); }
      if (lander.fuel > 0 && lander.fuel < 0.2 && S.tick - lowBeepAt > 50) { lowBeepAt = S.tick; sfx.low(); }
      exhaust(lander, L);
      if (st === LANDED) onLanded();
      else if (st === CRASHED || st === LOST) onCrashed(st);
    } else if (S.phase === 'landed') {
      if (S.phaseT < 24 && S.phaseT % 4 === 0) {
        const pad = L.terrain.pad;
        for (let i = 0; i < 3; i++) parts.confetti(pad.cx + (rand() - 0.5) * pad.width * 0.7, pad.y - 14, (rand() - 0.5) * 3, -1 - rand() * 2.4, rand);
      }
      if (S.phaseT >= LANDED_TICKS) { loadLevel(S.level + 1, nextLevel); nextLevel = null; }
    } else if (S.phase === 'crashed') {
      if (S.phaseT >= CRASHED_TICKS) {
        if (S.landers > 0) retryLevel();
        else gameOver();
      }
    } else if (S.phase === 'over') {
      if (S.phaseT >= OVER_TICKS) { S.phase = 'done'; S.phaseT = 0; }
    }
    parts.update(L.terrain);
  }

  function exhaust(lander, L) {
    const sin = Math.sin(lander.a);
    const cos = Math.cos(lander.a);
    if ((lander.fire & MAIN) && S.tick % 2 === 0) {
      // a little smoke out of the bell, thrown opposite to the thrust
      const nx = lander.x - sin * 14;
      const ny = lander.y + cos * 14;
      parts.smoke(nx, ny, -sin * 1.5 + lander.vx / 60, cos * 1.5 + lander.vy / 60 + 0.2, 3, 20);
    }
    // near the ground the burn kicks up sand
    const alt = altitude(lander, L.terrain);
    if ((lander.fire & MAIN) && alt < 60 && S.tick % 3 === 0) {
      const gx = lander.x;
      const gy = surfaceAt(L.terrain, gx);
      const dir = rand() < 0.5 ? -1 : 1;
      parts.dust(gx + dir * 6, gy - 2, dir * (1.2 + rand() * 1.4), -rand() * 0.5, 3 + rand() * 3, 26);
    }
  }

  // ---- drawing ----
  const judge = (v, limit) => {
    const a = Math.abs(v);
    return a <= limit ? PAL.turqDark : a <= limit * 1.6 ? '#9a6a10' : PAL.crash;
  };

  function readout(x, label, value, color, dir) {
    text(ctx, label, x, 57, { size: 14, weight: 700, color: PAL.ink2, font: FONT.ui });
    text(ctx, value, x + 80, 57, { size: 20, weight: 700, color, font: FONT.num, maxW: 52 });
    if (dir) arrow(ctx, x + 80 + Math.min(52, ctx.measureText(value).width) + 12, 50, dir, 5.5, color);
  }

  function drawHud() {
    const L = S.L;
    const lander = S.lander;
    ctx.fillStyle = PAL.paper;
    ctx.globalAlpha = 0.94;
    ctx.fillRect(0, 0, W, HUD_H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, HUD_H, W, 2.5);

    text(ctx, `LEVEL ${S.level}`, 14, 28, { size: 20, weight: 800 });
    text(ctx, 'SCORE', 150, 28, { size: 14, weight: 700, color: PAL.ink2 });
    text(ctx, fmt(S.score), 208, 28, { size: 20, weight: 700, font: FONT.num, maxW: 110 });
    // landers left
    for (let i = 0; i < LANDERS; i++) {
      ctx.save();
      ctx.translate(352 + i * 38, 21);
      ctx.scale(0.64, 0.64);
      drawLander(ctx, 0, 0, 0, 0, 0, i < S.landers ? 1 : 0.2);
      ctx.restore();
    }
    // fuel bar: the whole bar is a full tank; this level's tank may be smaller
    text(ctx, 'FUEL', 470, 28, { size: 14, weight: 700, color: PAL.ink2 });
    const bx = 520, by = 10, bw = 262, bh = 20;
    ctx.fillStyle = PAL.sandDark;
    ctx.fillRect(bx, by, bw, bh);
    const f = Math.max(0, lander.fuel);
    ctx.fillStyle = f > 0.35 ? PAL.sage : f > 0.18 ? PAL.mustard : (S.tick % 24 < 12 ? PAL.sunset : PAL.crash);
    ctx.fillRect(bx, by, bw * Math.min(1, f), bh);
    ctx.lineWidth = 2;
    ctx.strokeStyle = PAL.ink;
    ctx.strokeRect(bx, by, bw, bh);
    if (L.tank < 1) {
      ctx.beginPath(); ctx.moveTo(bx + bw * L.tank, by - 1); ctx.lineTo(bx + bw * L.tank, by + bh + 1); ctx.stroke();
    }

    // instruments: green once under the landing limits
    const alt = Math.max(0, Math.round(altitude(lander, L.terrain)));
    readout(14, 'ALTITUDE', String(alt), PAL.ink, null);
    const vx = lander.vx;
    const vy = lander.vy;
    readout(178, 'SIDEWAYS', String(Math.round(Math.abs(vx))), judge(vx, LIMITS.vx), vx < -0.5 ? 'left' : vx > 0.5 ? 'right' : null);
    readout(336, 'FALLING', String(Math.round(Math.abs(vy))), vy <= LIMITS.vy ? PAL.turqDark : judge(vy, LIMITS.vy), vy > 0.5 ? 'down' : vy < -0.5 ? 'up' : null);
    const deg = lander.a * 57.2958;
    readout(494, 'TILT', `${Math.round(Math.abs(deg))}°`, judge(lander.a, LIMITS.tilt), deg < -0.5 ? 'left' : deg > 0.5 ? 'right' : null);
    if (L.wind.amp > 0) {
      const w = S.wind;
      readout(646, 'WIND', String(Math.round(Math.abs(w) * 10) / 10), PAL.ink2, w < -0.2 ? 'left' : w > 0.2 ? 'right' : null);
    }
  }

  // A dotted plumb line from the feet to the ground, ending in a turquoise dot when both
  // feet are over the pad and a red one when they are not: it shows where you would land.
  function drawDropLine() {
    const l = S.lander;
    if (S.phase !== 'play' && S.phase !== 'intro') return;
    const t = S.L.terrain;
    const pad = t.pad;
    const gx = l.x;
    if (gx < 4 || gx > t.W - 4) return;
    const gy = surfaceAt(t, gx);
    const y0 = l.y + 17;
    if (gy - y0 < 6) return;
    const over = gx - 16 >= pad.x0 - 1 && gx + 16 <= pad.x1 + 1 && gy <= pad.y + 0.5;
    ctx.save();
    ctx.setLineDash([2, 6]);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = over ? PAL.turqDark : PAL.ink2;
    ctx.globalAlpha = over ? 0.8 : 0.4;
    ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, gy - 3); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(gx, gy - 2, 3.4, 0, TAU);
    ctx.fillStyle = over ? PAL.turq : PAL.sunset;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
  }

  // A bobbing arrow over the pad while you are still far above it.
  function drawPadMarker() {
    if (S.phase !== 'play' && S.phase !== 'intro') return;
    const pad = S.L.terrain.pad;
    const l = S.lander;
    const dist = Math.hypot(l.x - pad.cx, l.y - pad.y);
    if (dist < 120) return;
    const bob = Math.sin(S.tick * 0.09) * 4;
    ctx.globalAlpha = Math.min(1, (dist - 120) / 60);
    ctx.beginPath();
    ctx.moveTo(pad.cx, pad.y - 26 + bob);
    ctx.lineTo(pad.cx - 9, pad.y - 42 + bob);
    ctx.lineTo(pad.cx + 9, pad.y - 42 + bob);
    ctx.closePath();
    ctx.fillStyle = PAL.sunset;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawZones() {
    if (!S.touchSeen && !hasTouch) return;
    const a = S.touchSeen ? 1 : 0.55;
    const box = (x, y, w, h, hot) => {
      ctx.globalAlpha = (hot ? 0.2 : 0.07) * a;
      ctx.fillStyle = PAL.paperHi;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.5 * a;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = PAL.ink2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.setLineDash([]);
    };
    box(0, HUD_H + 3, W * 0.25, H - HUD_H - 3, zoneHot.left);
    box(W * 0.75, HUD_H + 3, W * 0.25, H - HUD_H - 3, zoneHot.right);
    box(W * 0.25, H * 0.55, W * 0.5, H * 0.45, zoneHot.thrust);
    ctx.globalAlpha = 0.6 * a;
    arrow(ctx, W * 0.125, H * 0.5, 'left', 14, PAL.ink2);
    arrow(ctx, W * 0.875, H * 0.5, 'right', 14, PAL.ink2);
    arrow(ctx, W * 0.5, H * 0.72, 'up', 14, PAL.ink2);
    ctx.globalAlpha = 0.7 * a;
    text(ctx, 'TURN', W * 0.125, H * 0.5 + 34, { size: 13, weight: 700, color: PAL.ink2, align: 'center' });
    text(ctx, 'TURN', W * 0.875, H * 0.5 + 34, { size: 13, weight: 700, color: PAL.ink2, align: 'center' });
    text(ctx, 'THRUST', W * 0.5, H * 0.72 + 36, { size: 13, weight: 700, color: PAL.ink2, align: 'center' });
    ctx.globalAlpha = 1;
  }

  function drawWind() {
    if (Math.abs(S.wind) <= 0.3) return;
    ctx.strokeStyle = PAL.paperHi;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    ctx.globalAlpha = Math.min(0.75, 0.25 + Math.abs(S.wind) / 10);
    const dir = S.wind > 0 ? 1 : -1;
    ctx.beginPath();
    for (const s of streaks) {
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - dir * s.len, s.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Where the lander is when it has left the screen: a marker on the nearest edge.
  function drawOffscreen() {
    const l = S.lander;
    if (S.phase !== 'play') return;
    if (l.y < -10) {
      const x = Math.max(20, Math.min(W - 20, l.x));
      arrow(ctx, x, HUD_H + 14, 'up', 9, PAL.crash);
      text(ctx, `${Math.round(-l.y)} up`, x, HUD_H + 40, { size: 13, weight: 700, color: PAL.crash, align: 'center' });
    } else if (l.x < 12 || l.x > W - 12) {
      const left = l.x < 12;
      const y = Math.max(HUD_H + 20, Math.min(H - 60, l.y));
      arrow(ctx, left ? 14 : W - 14, y, left ? 'left' : 'right', 9, PAL.crash);
    }
  }

  function banner(title, sub, color = PAL.redrock, hint = '') {
    const w = Math.max(320, title.length * 22 + 60, (sub ? sub.length * 8.4 : 0) + 50, (hint ? hint.length * 8.2 : 0) + 50);
    const h = (sub ? 92 : 62) + (hint ? 30 : 0);
    const x = Math.round((W - w) / 2);
    const y = 168; // above every pad (their tops are at 272 and lower) and below the start
    chip(ctx, x, y, w, h, { fill: PAL.paper });
    text(ctx, title, W / 2, y + 40, { size: 30, weight: 800, color, align: 'center', maxW: w - 24 });
    if (sub) text(ctx, sub, W / 2, y + 72, { size: 15, weight: 600, color: PAL.ink2, align: 'center', maxW: w - 24 });
    if (hint) text(ctx, hint, W / 2, y + 102, { size: 15, weight: 700, color: PAL.ink, align: 'center', maxW: w - 24 });
  }

  function drawChips() {
    const L = S.L;
    if (S.phase === 'intro') {
      const sub = L.wind.amp > 0 ? `Pad ${L.padWidth} wide. Gusts blow from the side.` : `Pad ${L.padWidth} wide.`;
      const hint = S.level > 1 ? '' : hasTouch
        ? 'Hold an edge to turn, the lower middle to thrust.'
        : 'Left and right turn. Up or Space fires the engine.';
      banner(`LEVEL ${S.level}`, sub, PAL.turqDark, hint);
    } else if (S.phase === 'play' && S.level === 1 && S.levelTick < 330 && S.lander.fuel > 0.9) {
      chip(ctx, W / 2 - 250, 70, 500, 30, { fill: PAL.paper, alpha: 0.92 });
      text(ctx, 'Touch down gently, upright, on the turquoise pad.', W / 2, 91, { size: 15, weight: 600, align: 'center', maxW: 480 });
    } else if (S.phase === 'landed') {
      const r = S.last;
      const w = 520;
      const x = (W - w) / 2;
      const y = 84; // up in the sky, so the lander on its pad stays in view
      chip(ctx, x, y, w, 150, { fill: PAL.paper });
      text(ctx, 'LANDED', W / 2, y + 42, { size: 32, weight: 800, color: PAL.turqDark, align: 'center' });
      const cols = [['BASE', r.base], ['SOFT', r.soft], ['AIM', r.aim], ['FUEL', r.fuel]];
      cols.forEach(([k, v], i) => {
        const cx = x + 70 + i * 127;
        text(ctx, k, cx, y + 72, { size: 13, weight: 700, color: PAL.ink2, align: 'center' });
        text(ctx, `+${v}`, cx, y + 94, { size: 18, weight: 700, font: FONT.num, align: 'center', maxW: 100 });
      });
      shown = Math.min(r.total, shown + Math.max(6, Math.ceil(r.total / 36)));
      text(ctx, `+${fmt(shown)}`, W / 2, y + 134, { size: 26, weight: 800, font: FONT.num, color: PAL.redrock, align: 'center' });
    } else if (S.phase === 'crashed' && S.phaseT > 6) {
      const r = S.last;
      banner(r.kind === 'lost' ? 'LOST CONTACT' : 'CRASHED',
        `${r.why}. ${S.landers > 0 ? `${S.landers} lander${S.landers === 1 ? '' : 's'} left.` : 'No landers left.'}`,
        PAL.crash);
    } else if (S.phase === 'over') {
      banner('GAME OVER', `Score ${fmt(S.score)} on level ${S.level}`, PAL.crash);
    }
    if (S.paused) {
      ctx.fillStyle = 'rgba(43, 33, 24, 0.35)';
      ctx.fillRect(0, HUD_H + 3, W, H);
      banner('PAUSED', 'Press P to go on.', PAL.ink);
    }
    if (S.phase === 'play' && S.lander.fuel <= 0) {
      chip(ctx, W / 2 - 110, 70, 220, 32, { fill: PAL.crash, border: PAL.ink });
      text(ctx, 'OUT OF FUEL', W / 2, 92, { size: 17, weight: 800, color: PAL.paperHi, align: 'center' });
    }
  }

  function draw() {
    const o = env.fx.shakeOffset();
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.drawImage(scene, 0, 0);
    drawBeacons(ctx, S.L.terrain.pad, S.tick);
    drawPadMarker();
    drawWind();
    drawDropLine();
    if (impact) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = PAL.ink2;
      ctx.beginPath(); ctx.ellipse(impact.x, impact.y + 4, 22, 5, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    parts.draw(ctx, 'under');
    if (S.phase !== 'crashed' && S.phase !== 'over' && S.phase !== 'done') {
      const l = S.lander;
      drawLander(ctx, l.x, l.y, l.a, l.fire, S.tick);
    }
    parts.draw(ctx, 'over');
    ctx.restore();
    drawZones();
    drawOffscreen();
    drawHud();
    drawChips();
    if (S.phase === 'done') {
      // The cabinet's Game Over panel is light text over the frame, so darken it first.
      ctx.fillStyle = `rgba(36, 28, 36, ${Math.min(0.7, 0.35 * S.phaseT).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---- debug hooks ----
  if (env.debug) {
    env.expose(S);
    env.exposeActions({
      /** Put the lander somewhere and let it fly: setState({ x, y, vx, vy, a, w, fuel }). */
      setState(o = {}) {
        const l = S.lander;
        for (const k of ['x', 'y', 'vx', 'vy', 'a', 'w', 'fuel']) if (o[k] != null) l[k] = o[k];
        l.status = FLYING;
        l.cause = '';
        S.phase = 'play';
        S.phaseT = 0;
      },
      setLevel(n) { loadLevel(n); S.phaseT = INTRO_TICKS; },
      setLanders(n) { S.landers = n; },
      setScore(n) { S.score = n; env.onScore(n); },
      setWind(v) { S.windOverride = v; },
      freeze(on = true) { S.frozen = on; },
      /** Hold controls by hand: hold({ left, main, right }) or hold(null) to give the keys back. */
      hold(c) {
        if (c == null) { S.held = null; return; }
        S.held = (c.left ? LEFT : 0) | (c.main ? MAIN : 0) | (c.right ? RIGHT : 0);
      },
      /** Run n ticks of the world with no drawing. */
      sim(n = 1) { for (let i = 0; i < n; i++) update(); finish(); return S.lander.status; },
      end() { S.phase = 'done'; S.phaseT = 3; finish(); },
    });
  }

  // The end of the game: hand the final score to the cabinet exactly once. A few clean
  // frames (no banner) come first, because the cabinet shows the frame before the last one
  // under its own Game Over panel.
  function finish() {
    if (S.phase !== 'done' || S.phaseT < 3 || ended) return;
    ended = true;
    audio.stopLoop();
    env.onGameOver(S.score);
  }

  env.onScore(0);
  loadLevel(1);

  return {
    tick() {
      if (ended) return;
      if (env.fx.consumePause()) return;
      if (!S.paused) update();
      draw();
      finish();
    },
  };
}
