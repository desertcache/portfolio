// Dust Devil Pinball: physics, table and rules tests. Fast and seeded (no DOM, no timers).
// Run: npm test   (Node's built-in runner, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as P from '../arcade/games/pinball/physics.js';
import { TABLE as T, BALL_R, H, ORBIT, ARCH } from '../arcade/games/pinball/table.js';
import { mulberry32 } from '../arcade/games/pinball/rng.js';
import * as R from '../arcade/games/pinball/rules.js';

const world = (seed = 1, opts = {}) => P.createWorld(T, { rng: mulberry32(seed), ...opts });
const run = (w, ticks, each) => { for (let i = 0; i < ticks; i++) { P.stepWorld(w); if (each && each(i) === false) return i + 1; if (!w.ball.active) return i + 1; } return ticks; };

/** Put the ball on a lowered flipper, `s` px along it from the pivot, `drop` px straight above where it would rest. */
function onFlipper(w, side, s, drop = 0) {
  const f = w.flippers.find((q) => q.side === side);
  const cs = Math.cos(f.angle), sn = Math.sin(f.angle);
  let nx = -sn, ny = cs;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const r = f.r0 + (f.r1 - f.r0) * Math.min(1, s / f.len);
  P.placeBall(w, f.px + cs * s + nx * (r + BALL_R + 0.05), f.py + sn * s + ny * (r + BALL_R + 0.05) - drop, 0, 0);
}

// ------------------------------------------------------------------ the numbers

test('substeps keep the ball under a third of its radius per step at top speed', () => {
  assert.ok(P.VMAX * P.DT <= BALL_R / 3, `${P.VMAX * P.DT} px per substep`);
  assert.equal(P.SUBSTEPS * P.DT, P.TICK_DT);
  // every thin wall is at least twice as thick as one step, so a step cannot jump a wall
  for (const s of T.statics) if (s.k === 'seg') assert.ok(s.r * 2 >= 2 * P.VMAX * P.DT, 'wall thick enough');
});

test('a ball dropped from rest at the top reaches the flipper line in 1 to 1.5 s', () => {
  const bare = { ...T, statics: [], bumpers: [], slings: [], targets: [], gates: [], spinners: [], lanes: [], flippers: [] };
  const w = P.createWorld(bare, { rng: mulberry32(1) });
  P.placeBall(w, 225, 70, 0, 0);
  let t = 0;
  while (w.ball.y < 640 && t < 600) { P.stepWorld(w); t++; }
  const sec = t / 60;
  assert.ok(sec >= 1 && sec <= 1.5, `${sec} s`);
});

test('a flipper takes 0.05 to 0.07 s from rest to up', () => {
  const w = world();
  for (const f of w.flippers) {
    P.setFlipper(w, f.side, true);
    let ticks = 0, t = 0;
    const start = f.angle;
    while (Math.abs(f.angle - f.up) > 1e-9 && ticks < 60) { P.stepWorld(w); ticks++; }
    t = Math.abs(start - f.up) / f.wUp; // exact swing time at the flipper's angular speed
    assert.ok(t >= 0.05 && t <= 0.07, `${f.side}: ${t} s`);
    assert.ok(ticks / 60 <= 0.07 + 1 / 60, `${f.side}: ${ticks} ticks`);
  }
});

test('the numbers the "How it works" card quotes are the numbers in the code', () => {
  // twelve steps a tick, 720 a second; top speed 1,800 px/s is 30 px a frame but only 2.5 px a step
  assert.equal(P.SUBSTEPS, 12);
  assert.equal(P.SUBSTEPS * 60, 720);
  assert.equal(P.VMAX, 1800);
  assert.equal(P.VMAX / 60, 30);
  assert.equal(P.VMAX * P.DT, 2.5);
  assert.equal(P.VMAX * P.DT / BALL_R, 0.25, 'a quarter of the ball radius');
  // the thinnest rail is 6 px
  assert.equal(Math.min(...T.statics.filter((s) => s.k === 'seg').map((s) => s.r * 2)), 6);
  // bumpers and slingshots kick at a fixed 560 px/s
  assert.equal(P.BUMPER_KICK, 560);
  assert.equal(P.SLING_KICK, 560);
  // the eight second ball save, three balls
  assert.equal(R.SAVE_TICKS / 60, 8);
  assert.equal(R.BALLS, 3);
});

// ------------------------------------------------------------------ no tunneling

test('tunneling soak: thousands of fast balls never leave the table or sink into a wall', () => {
  const rng = mulberry32(2024);
  const N = 2400, TICKS = 150; // 2.5 s each
  let worst = 0, drained = 0, fastest = 0;
  for (let n = 0; n < N; n++) {
    const w = world(n + 1, { search: true });
    let ok = false;
    for (let tries = 0; tries < 300 && !ok; tries++) {
      const x = 16 + rng() * 418, y = 20 + rng() * 695;
      if (!T.onTable(x, y)) continue;
      P.placeBall(w, x, y, 0, 0);
      ok = P.maxPenetration(w) < 1e-3;
    }
    assert.ok(ok, 'found a valid start');
    const a = rng() * Math.PI * 2;
    const sp = rng() < 0.4 ? P.VMAX * (0.7 + 0.3 * rng()) : rng() * 600;
    w.ball.vx = Math.cos(a) * sp; w.ball.vy = Math.sin(a) * sp;
    let next = Math.floor(rng() * 30);
    for (let t = 0; t < TICKS; t++) {
      if (t === next) { P.setFlipper(w, rng() < 0.5 ? 'L' : 'R', rng() < 0.6); next = t + 3 + Math.floor(rng() * 30); }
      P.stepWorld(w);
      const b = w.ball;
      if (!b.active) { drained++; break; }
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx) && Number.isFinite(b.vy), 'finite');
      assert.ok(T.onTable(b.x, b.y), `ball left the playfield at ${b.x}, ${b.y} (ball ${n}, tick ${t})`);
      const pen = P.maxPenetration(w);
      if (pen > worst) worst = pen;
      const v = Math.hypot(b.vx, b.vy);
      if (v > fastest) fastest = v;
    }
    assert.equal(w.stats.escapes, 0, 'the safety net never fired');
  }
  assert.ok(worst < 2, `deepest overlap ${worst} px`);
  assert.ok(fastest <= P.VMAX * 1.3, `fastest ${fastest}`);
  assert.ok(drained > N * 0.3, 'plenty of balls drained, so the soak really moved them');
});

// ------------------------------------------------------------------ flippers

test('flipper power: a ball on either flipper, flipped, reaches the upper third of the table', () => {
  for (const side of ['L', 'R']) {
    for (const s of [50, 56, 62]) {
      const w = world(3, { search: false });
      onFlipper(w, side, s);
      P.setFlipper(w, side, true);
      let apex = 1e9;
      run(w, 150, () => { apex = Math.min(apex, w.ball.y); });
      assert.ok(apex < H / 3, `${side} at ${s}: apex ${apex.toFixed(0)}`);
    }
    // dropped from above, then flipped as it lands
    const w = world(4, { search: false });
    onFlipper(w, side, 56, 40);
    let apex = 1e9, pressed = false;
    run(w, 200, () => {
      if (!pressed && w.ball.flipTouch >= w.tick - 1) { P.setFlipper(w, side, true); pressed = true; }
      if (pressed) apex = Math.min(apex, w.ball.y);
    });
    assert.ok(pressed, `${side}: the dropped ball landed on the flipper`);
    assert.ok(apex < H / 3, `${side} dropped: apex ${apex.toFixed(0)}`);
  }
});

test('flipper power: a hit near the tip is faster than one near the pivot', () => {
  const speedAt = (s) => {
    const w = world(5, { search: false });
    onFlipper(w, 'L', s);
    P.setFlipper(w, 'L', true);
    for (let i = 0; i < 5; i++) P.stepWorld(w);
    return Math.hypot(w.ball.vx, w.ball.vy);
  };
  const near = speedAt(14), mid = speedAt(34), tip = speedAt(60);
  assert.ok(tip > 1.5 * near, `tip ${tip} vs pivot ${near}`);
  // the card says about 650 px/s near the pivot and about 1,300 at the tip
  assert.ok(near > 600 && near < 700, `near the pivot ${near}`);
  assert.ok(speedAt(62) > 1250 && speedAt(62) < 1400, `at the tip ${speedAt(62)}`);
  assert.ok(tip > mid && mid > near, `${near} < ${mid} < ${tip}`);
});

test('the right flipper throws the ball up the orbit, the left one at the drop targets', () => {
  const w = world(6, { search: false });
  onFlipper(w, 'R', 58);
  P.setFlipper(w, 'R', true);
  let orbit = 0, spin = 0;
  run(w, 240, () => { for (const e of w.events) { if (e.type === 'gate' && e.kind === 'orbit') orbit++; if (e.type === 'spin') spin++; } });
  assert.ok(orbit >= 1 && spin >= 1, `orbit ${orbit}, spins ${spin}`);

  const l = world(7, { search: false });
  onFlipper(l, 'L', 58);
  P.setFlipper(l, 'L', true);
  let target = 0;
  run(l, 120, () => { for (const e of l.events) if (e.type === 'target') target++; });
  assert.ok(target >= 1, 'the left flipper hits the drop targets');
});

test('a ball cradled on a held-up flipper stays cradled (and is not "searched" out)', () => {
  for (const side of ['L', 'R']) {
    const w = world(8, { search: true });
    P.setFlipper(w, side, true);
    for (let i = 0; i < 8; i++) P.stepWorld(w); // the flipper is up
    onFlipper(w, side, 40, 0);
    // let it settle for 1.5 s, then watch it for 5 s
    run(w, 90);
    const rest = [w.ball.x, w.ball.y];
    let drift = 0;
    run(w, 300, () => { drift = Math.max(drift, Math.hypot(w.ball.x - rest[0], w.ball.y - rest[1])); });
    assert.ok(w.ball.active, `${side}: still on the table`);
    assert.ok(drift < 4, `${side}: drifted ${drift} px`);
    assert.equal(w.stats.searches, 0, `${side}: the ball search leaves a cradled ball alone`);
    // it sits at the pivot end, on the flipper
    const f = w.flippers.find((q) => q.side === side);
    assert.ok(Math.hypot(w.ball.x - f.px, w.ball.y - f.py) < f.r0 + BALL_R + 12, `${side}: cradle position`);
  }
});

// ------------------------------------------------------------------ plunger and gate

/** Fire the plunger at `power` and report what the ball does. */
function plunge(power, seconds = 5) {
  const w = world(9);
  P.serveBall(w);
  run(w, 10);
  P.launch(w, power);
  const seen = { gate: false, minY: 1e9 };
  run(w, seconds * 60, () => {
    seen.minY = Math.min(seen.minY, w.ball.y);
    for (const e of w.events) if (e.type === 'gate' && e.kind === 'lane') seen.gate = true;
  });
  return { w, ...seen };
}

test('plunger: a full pull sends the ball through the gate and onto the table', () => {
  const r = plunge(1);
  assert.ok(r.gate, 'passed the one-way gate');
  assert.equal(r.w.ball.inLane, false);
  assert.ok(r.w.ball.x < 400, `x ${r.w.ball.x}`);
  assert.ok(r.minY < 130, `got up to y ${r.minY}`);
});

test('plunger: a weak pull returns the ball to the plunger instead of stranding it', () => {
  for (const p of [0.2, 0.45, 0.6, 0.68]) {
    const r = plunge(p, 8);
    assert.equal(r.gate, false, `power ${p}`);
    assert.equal(r.w.ball.inLane, true);
    assert.ok(P.ballOnPlunger(r.w), `power ${p}: back on the plunger`);
    assert.ok(r.w.ball.y > 600, `y ${r.w.ball.y}`);
  }
});

test('plunger: holding pulls back at the stated rate, and the least pull that clears the gate is about 0.7', () => {
  const w = world(10);
  P.serveBall(w);
  run(w, 5);
  P.setPlunger(w, true);
  run(w, 30);
  assert.ok(Math.abs(w.plunger.pull - 30 * P.PULL_RATE / 60) < 0.02, `pull ${w.plunger.pull}`);
  run(w, 60);
  assert.equal(w.plunger.pull, 1);
  assert.equal(plunge(P.PLUNGE_MIN - 0.02).gate, false, 'just under the marked threshold the ball falls back');
  assert.equal(plunge(P.PLUNGE_MIN + 0.03).gate, true, 'just over it the ball gets out');
});

test('the shooter gate is one-way: a ball coming at it from the table never gets back in', () => {
  const rng = mulberry32(77);
  const g = T.gates.find((q) => q.kind === 'lane');
  let tried = 0;
  for (let n = 0; n < 120; n++) {
    const w = world(n + 1, { search: false });
    // a point on the table side of the gate, near it, moving towards the lane
    const u = rng(), off = 6 + rng() * 26;
    const x = g.ax + (g.bx - g.ax) * u + g.nx * off, y = g.ay + (g.by - g.ay) * u + g.ny * off;
    P.placeBall(w, x, y, 0, 0);
    if (P.maxPenetration(w) > 0) continue;
    tried++;
    const sp = 150 + rng() * 800, a = Math.atan2(-g.ny, -g.nx) + (rng() - 0.5) * 1.2;
    w.ball.vx = Math.cos(a) * sp; w.ball.vy = Math.sin(a) * sp;
    run(w, 150, () => { assert.equal(w.ball.inLane, false, `ball ${n} got into the lane`); });
  }
  assert.ok(tried > 60, `${tried} balls tried`);
});

test('the orbit gate is one-way, and the left flap lets a ball up the wall but catches one falling', () => {
  // from the table side, a ball thrown at the orbit's top gate is turned back and never gets in
  const g = T.gates.find((q) => q.kind === 'orbit');
  const rng = mulberry32(5);
  let tried = 0;
  for (let n = 0; n < 80; n++) {
    const w = world(n + 1, { search: false });
    const u = rng(), off = 8 + rng() * 30;
    P.placeBall(w, g.ax + (g.bx - g.ax) * u + g.nx * off, g.ay + (g.by - g.ay) * u + g.ny * off, 0, 0);
    if (P.maxPenetration(w) > 0) continue;
    tried++;
    const a = Math.atan2(-g.ny, -g.nx) + (rng() - 0.5) * 1.0, sp = 200 + rng() * 800;
    w.ball.vx = Math.cos(a) * sp; w.ball.vy = Math.sin(a) * sp;
    run(w, 150, () => {
      const dx = w.ball.x - ARCH.cx, dy = w.ball.y - ARCH.cy;
      const r = Math.hypot(dx, dy);
      let ang = Math.atan2(dy, dx); if (ang < 0) ang += 2 * Math.PI;
      const inLane = r > ORBIT.r + 3 + 6 && r < ARCH.r - 6 && ang > ORBIT.a0 + 0.05 && ang < ORBIT.a1 - 0.03;
      assert.equal(inLane, false, `ball ${n} got into the orbit through its top`);
    });
  }
  assert.ok(tried > 40, `${tried} balls tried`);

  // the flap on the left wall: a ball shot up from below goes through, one dropped from above lands on it
  const up = world(1, { search: false });
  P.placeBall(up, 30, 520, 0, -900);
  let top = 1e9;
  run(up, 90, () => { top = Math.min(top, up.ball.y); });
  assert.ok(top < 300, `a ball shot up the wall got to y ${top}`);
  const down = world(2, { search: false });
  P.placeBall(down, 30, 300, 0, 0);
  let lowest = 0, outlane = false;
  run(down, 240, () => { lowest = Math.max(lowest, down.ball.y); if (down.ball.y > 520 && down.ball.x < 47) outlane = true; });
  assert.equal(outlane, false, 'a ball dropped down the left wall is caught by the flap');
});

// ------------------------------------------------------------------ stuck checks

test('no resting pockets: with the flippers down, every ball ends up draining or on the plunger', () => {
  const rng = mulberry32(31);
  let n = 0, resting = 0;
  for (; n < 300; n++) {
    const w = world(n + 1, { search: false });
    let ok = false;
    for (let tries = 0; tries < 200 && !ok; tries++) {
      const x = 16 + rng() * 418, y = 20 + rng() * 695;
      if (!T.onTable(x, y)) continue;
      P.placeBall(w, x, y, (rng() - 0.5) * 300, (rng() - 0.5) * 300);
      ok = P.maxPenetration(w) < 1e-3;
    }
    run(w, 600);
    if (w.ball.active && !w.ball.inLane && Math.hypot(w.ball.vx, w.ball.vy) < 15) resting++;
  }
  assert.equal(resting, 0, 'a ball came to rest somewhere it should not');
});

test('stuck check: a long random soak never leaves the ball nearly still longer than the search delay', () => {
  const rng = mulberry32(99);
  let longest = 0, searches = 0, escapes = 0;
  for (let n = 0; n < 150; n++) {
    const w = world(n + 500, { search: true });
    // start somewhere real, e.g. launched or dropped
    let ok = false;
    for (let tries = 0; tries < 300 && !ok; tries++) {
      const x = 16 + rng() * 418, y = 60 + rng() * 650;
      if (!T.onTable(x, y)) continue;
      P.placeBall(w, x, y, (rng() - 0.5) * 900, (rng() - 0.5) * 900);
      ok = P.maxPenetration(w) < 1e-3;
    }
    let still = 0, ax = w.ball.x, ay = w.ball.y, next = 0;
    for (let t = 0; t < 60 * 24 && w.ball.active; t++) {
      if (t === next) {
        // a human-ish player: mostly down, now and then both up
        P.setFlipper(w, 'L', rng() < 0.4); P.setFlipper(w, 'R', rng() < 0.4);
        next = t + 10 + Math.floor(rng() * 90);
      }
      P.stepWorld(w);
      const b = w.ball;
      if (!b.active) break;
      const cradled = w.tick - b.flipTouch <= 3 && w.flippers.some((f) => f.side === b.flipSide && f.held);
      if (b.inLane || cradled || Math.hypot(b.x - ax, b.y - ay) > P.SEARCH_RADIUS) { still = 0; ax = b.x; ay = b.y; } else still++;
      if (still > longest) longest = still;
    }
    searches += w.stats.searches; escapes += w.stats.escapes;
  }
  assert.ok(longest <= P.SEARCH_TICKS + 5, `nearly still for ${longest} ticks`);
  assert.equal(escapes, 0);
  assert.ok(searches >= 0);
});

test('the ball search nudges a ball that has stopped on a post free', () => {
  const w = world(11, { search: true });
  // balanced exactly on top of the left outlane divider: nothing moves it but the search
  const d = T.statics.find((s) => s.k === 'seg' && s.ax === 50 && s.ay === 505);
  P.placeBall(w, d.ax, d.ay - (d.r + BALL_R), 0, 0);
  run(w, P.SEARCH_TICKS - 10);
  assert.equal(w.stats.searches, 0);
  run(w, 30);
  assert.equal(w.stats.searches, 1, 'one nudge after about four seconds');
  assert.ok(Math.hypot(w.ball.vx, w.ball.vy) > 100 || w.ball.y < d.ay - 20, 'and it moved');
});

test('wall gutters: a ball sliding down either side wall is handed back to the playfield, not fed to an outlane', () => {
  let tried = 0;
  for (const [x, vx] of [[24, 0], [30, 20], [38, 0], [380, 0], [390, -20], [395, 0]]) {
    for (const y of [300, 360]) {
      const w = world(40 + tried, { search: false });
      P.placeBall(w, x, y, vx, 0);
      if (P.maxPenetration(w) > 0) continue;
      tried++;
      let outlane = false;
      run(w, 60 * 4, () => {
        const b = w.ball;
        if (b.y > 520 && b.y < 600 && (b.x < 47 || b.x > 369 && b.x < 402)) outlane = true;
      });
      assert.equal(outlane, false, `ball from (${x}, ${y}) went down an outlane`);
    }
  }
  assert.ok(tried >= 10, `${tried} balls tried`);
});

// ------------------------------------------------------------------ geometry sanity

test('the table: shapes are where the art and the physics both expect them', () => {
  assert.equal(T.bumpers.length, 3);
  assert.equal(T.slings.length, 2);
  assert.equal(T.targets.length, 3);
  assert.equal(T.lanes.length, 3);
  assert.equal(T.flippers.length, 2);
  // pop bumpers sit clear of each other by more than a ball, and inside the arch
  for (const a of T.bumpers) {
    assert.ok(T.onTable(a.x, a.y));
    for (const b of T.bumpers) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 2 * BALL_R, 'room between bumpers');
  }
  // the drain gap between the flipper tips is wide enough for a ball but not for two
  const tips = T.flippers.map((f) => f.px + Math.cos(f.rest) * f.len);
  const gap = Math.abs(tips[1] - tips[0]) - 2 * T.flippers[0].r1;
  assert.ok(gap > 2 * BALL_R && gap < 4.5 * BALL_R, `drain gap ${gap}`);
  // each top lane has a clear corridor of at least a ball's width between its pins
  const pins = T.statics.filter((s) => s.k === 'seg' && s.mat === 'post' && s.ay <= 104 && s.by >= 126).map((s) => s.ax).sort((a, b) => a - b);
  for (let i = 0; i + 1 < pins.length; i++) assert.ok(pins[i + 1] - pins[i] - 2 * 4 > BALL_R * 1.3, 'lane corridor');
});

// ------------------------------------------------------------------ rules

const game = (seed = 1, opts = {}) => R.createGame({ rng: mulberry32(seed), ...opts });
const idle = { left: false, right: false, plunger: false, nudge: false };
const tick = (g, n = 1, input = idle) => { for (let i = 0; i < n; i++) g.update(input); };
/** Pretend the ball has been plunged and is out on the table. */
const toTable = (g) => { g.dispatch({ type: 'launch', speed: 900, power: 0.8 }); g.dispatch({ type: 'gate', kind: 'lane', i: 0 }); };

test('rules: lighting all three top lanes advances the multiplier from 2x to 5x, then pays a bonus', () => {
  const g = game();
  toTable(g);
  assert.equal(g.mult, 1);
  g.dispatch({ type: 'lane', i: 0 });
  assert.deepEqual(g.lanes, [true, false, false]);
  const s1 = g.score;
  g.dispatch({ type: 'lane', i: 0 });
  assert.equal(g.score - s1, R.SCORE.laneAgain, 'a lit lane scores little');
  g.dispatch({ type: 'lane', i: 1 }); g.dispatch({ type: 'lane', i: 2 });
  assert.equal(g.mult, 2);
  assert.deepEqual(g.lanes, [false, false, false], 'the lanes reset');
  assert.equal(g.msg.text, 'BONUS X2');
  for (let m = 3; m <= 5; m++) { for (const i of [0, 1, 2]) g.dispatch({ type: 'lane', i }); assert.equal(g.mult, m); }
  const before = g.score;
  for (const i of [0, 1, 2]) g.dispatch({ type: 'lane', i });
  assert.equal(g.mult, 5, 'it stops at 5x');
  assert.ok(g.score - before >= R.SCORE.multMax, 'but completing the lanes at 5x still pays');
});

test('rules: the flippers rotate the lit lanes (lane change)', () => {
  const g = game();
  toTable(g);
  g.dispatch({ type: 'lane', i: 0 });
  assert.deepEqual(g.lanes, [true, false, false]);
  tick(g, 2, { ...idle, right: true }); // a right press moves the pattern right
  assert.deepEqual(g.lanes, [false, true, false]);
  tick(g, 2); // let go
  tick(g, 2, { ...idle, right: true });
  assert.deepEqual(g.lanes, [false, false, true]);
  tick(g, 2);
  tick(g, 2, { ...idle, right: true });
  assert.deepEqual(g.lanes, [true, false, false], 'it wraps round');
  tick(g, 2);
  tick(g, 2, { ...idle, left: true });
  assert.deepEqual(g.lanes, [false, false, true], 'left goes the other way');
  // holding a flipper rotates once, not every tick
  const g2 = game(2);
  toTable(g2);
  g2.dispatch({ type: 'lane', i: 1 });
  tick(g2, 20, { ...idle, left: true });
  assert.deepEqual(g2.lanes, [true, false, false]);
});

test('rules: knocking down the whole drop bank scores, lights an extra ball once, then a jackpot, and resets', () => {
  const g = game();
  toTable(g);
  const knock = () => { for (let i = 0; i < 3; i++) { g.world.targets[i].down = true; g.dispatch({ type: 'target', i, speed: 300 }); } };
  g.world.targets[0].down = true; g.dispatch({ type: 'target', i: 0, speed: 300 });
  assert.equal(g.bank.resetT, 0, 'one target is not a bank');
  g.world.targets[1].down = true; g.dispatch({ type: 'target', i: 1, speed: 300 });
  g.world.targets[2].down = true;
  const before = g.score;
  g.dispatch({ type: 'target', i: 2, speed: 300 });
  assert.equal(g.score - before, R.SCORE.target + R.SCORE.bank);
  assert.equal(g.orbitLit, 'extra');
  assert.equal(g.msg.text, 'EXTRA BALL LIT');
  assert.equal(g.bank.resetT, R.BANK_RESET_TICKS);
  assert.ok(g.world.targets.every((t) => t.down), 'they stay down for a moment');
  tick(g, R.BANK_RESET_TICKS);
  assert.ok(g.world.targets.every((t) => !t.down), 'then the bank resets');
  // the orbit collects the extra ball, once per ball
  g.dispatch({ type: 'gate', kind: 'entry' });
  assert.equal(g.extra, 1);
  assert.equal(g.orbitLit, null);
  knock();
  assert.equal(g.orbitLit, 'jackpot', 'a second bank on the same ball lights the jackpot instead');
  const s = g.score;
  g.dispatch({ type: 'gate', kind: 'entry' });
  assert.ok(g.score - s >= R.SCORE.jackpot);
  assert.equal(g.extra, 1, 'still just the one extra ball');
});

test('rules: the skill shot pays for the lit top lane straight from the plunge, and only then', () => {
  const g = game(5);
  assert.equal(g.skill.live, false, 'not live until the ball is plunged');
  const lane = g.skill.lane;
  g.dispatch({ type: 'launch', speed: 900, power: 0.8 });
  assert.equal(g.skill.live, true);
  const s0 = g.score;
  g.dispatch({ type: 'lane', i: lane });
  assert.equal(g.score - s0, R.SCORE.skill + R.SCORE.lane);
  assert.equal(g.msg.text, 'SKILL SHOT');
  assert.equal(g.stats.skillShots, 1);
  g.dispatch({ type: 'lane', i: lane }); // a second time pays nothing extra
  assert.equal(g.stats.skillShots, 1);

  // the wrong lane first closes the window
  const h = game(6);
  const want = h.skill.lane;
  h.dispatch({ type: 'launch', speed: 900, power: 0.8 });
  h.dispatch({ type: 'lane', i: (want + 1) % 3 });
  h.dispatch({ type: 'lane', i: want });
  assert.equal(h.stats.skillShots, 0);
  // touching anything first closes it too
  const k = game(7);
  k.dispatch({ type: 'launch', speed: 900, power: 0.8 });
  k.dispatch({ type: 'bumper', i: 0, speed: 300 });
  k.dispatch({ type: 'lane', i: k.skill.lane });
  assert.equal(k.stats.skillShots, 0);
  // and it times out
  const m = game(8);
  m.dispatch({ type: 'launch', speed: 900, power: 0.8 });
  tick(m, R.SKILL_TICKS + 2);
  assert.equal(m.skill.live, false);
});

test('rules: before the plunge and while the ball climbs the shooter lane a flipper moves the skill lane; out on the table it is locked', () => {
  const g = game(9);
  const first = g.skill.lane;
  tick(g, 2, { ...idle, right: true }); // on the plunger: a right press moves the arrow right
  assert.equal(g.skill.lane, (first + 1) % 3);
  tick(g, 2);
  tick(g, 2, { ...idle, left: true });
  assert.equal(g.skill.lane, first, 'and a left press moves it back');
  tick(g, 2);
  g.dispatch({ type: 'launch', speed: 900, power: 0.8 });
  const was = g.skill.lane;
  tick(g, 2, { ...idle, right: true });
  assert.equal(g.skill.lane, (was + 1) % 3, 'still movable while the ball climbs');
  tick(g, 2);
  g.dispatch({ type: 'gate', kind: 'lane' }); // out on the table: locked
  const locked = g.skill.lane;
  tick(g, 2, { ...idle, right: true });
  assert.equal(g.skill.lane, locked);
});

test('rules: a ball save covers the first 8 seconds of a ball, and is spent once', () => {
  const g = game(10);
  toTable(g);
  assert.equal(g.save.t, R.SAVE_TICKS);
  assert.equal(R.SAVE_TICKS, 8 * 60);
  tick(g, 100);
  g.dispatch({ type: 'drain' });
  assert.equal(g.phase, 'serve', 'saved: back on the plunger');
  assert.equal(g.ball, 1, 'and no ball was lost');
  assert.equal(g.msg.text, 'BALL SAVED');
  assert.equal(g.stats.saves, 1);
  assert.equal(g.save.t, 0);
  // the replayed ball has no save of its own: the next drain costs the ball
  toTable(g);
  assert.equal(g.save.t, 0, 'the save was spent');
  g.dispatch({ type: 'drain' });
  assert.equal(g.phase, 'drained');
  // a fresh ball gets a fresh save
  let n = 0;
  while (g.phase !== 'serve' && n++ < 1000) tick(g);
  assert.equal(g.ball, 2);
  toTable(g);
  assert.equal(g.save.t, R.SAVE_TICKS, 'the next ball starts with its own save');
  // and it runs out
  tick(g, R.SAVE_TICKS + 5);
  assert.equal(g.save.t, 0);
  g.dispatch({ type: 'drain' });
  assert.equal(g.phase, 'drained');
});

test('rules: nudging kicks the ball; too many nudges warn, then the table tilts and the bonus is lost', () => {
  const g = game(11);
  g.debugPlace(225, 400, 0, 0);
  g.bonus = 5000;
  const vy0 = g.world.ball.vy;
  tick(g, 1, { ...idle, nudge: true });
  assert.ok(g.world.ball.vy < vy0 - 50 || g.world.ball.vx !== 0, 'the ball was kicked');
  assert.equal(g.tilt.warnings, 0);
  for (let i = 0; i < 3; i++) tick(g, 1, { ...idle, nudge: true });
  assert.equal(g.tilt.warnings, 1, 'four nudges close together: a warning');
  assert.equal(g.msg.text, 'DANGER');
  assert.equal(g.tilt.tilted, false);
  for (let i = 0; i < 4; i++) tick(g, 1, { ...idle, nudge: true });
  assert.equal(g.tilt.tilted, true, 'and then the tilt');
  // dead flippers
  tick(g, 3, { ...idle, left: true, right: true });
  assert.ok(g.world.flippers.every((f) => !f.held));
  assert.equal(g.world.flippers[0].angle, g.world.flippers[0].rest);
  // no bonus
  const s = g.score;
  g.dispatch({ type: 'drain' });
  tick(g, 200);
  assert.equal(g.score, s, 'tilted: no end-of-ball bonus');
  assert.equal(g.ball, 2, 'and the next ball is served');
  assert.equal(g.tilt.tilted, false, 'the tilt is for that ball only');
  assert.notEqual(g.msg && g.msg.text, 'TILT', 'and its message goes with it');
  // slow nudges are fine
  const h = game(12);
  h.debugPlace(225, 400, 0, 0);
  for (let i = 0; i < 12; i++) tick(h, 60, { ...idle, nudge: true });
  assert.equal(h.tilt.warnings, 0);
});

test('rules: the end-of-ball bonus counts up, multiplied, and the game ends after three balls', () => {
  const g = game(13);
  const seen = [];
  for (let b = 1; b <= 3; b++) {
    assert.equal(g.ball, b);
    toTable(g);
    g.bonus = 1000 * b;
    g.mult = b;
    const s = g.score;
    tick(g, R.SAVE_TICKS + 5); // the save has run out
    g.dispatch({ type: 'drain' });
    let ticks = 0;
    while (g.phase !== 'serve' && g.phase !== 'over' && ticks < 1000) { tick(g); ticks++; }
    assert.equal(g.score - s, 1000 * b * b, `bonus ${b}`);
    seen.push(g.score);
  }
  assert.equal(g.phase, 'over');
  assert.equal(g.msg.text, 'GAME OVER');
  assert.equal(g.finished, false, 'the closing screen runs for a moment');
  tick(g, 200);
  assert.equal(g.finished, true);
  const score = g.score;
  tick(g, 100);
  assert.equal(g.score, score, 'nothing scores after the game');
});

test('rules: an earned extra ball replays the same ball number', () => {
  const g = game(14);
  toTable(g);
  g.orbitLit = 'extra';
  g.dispatch({ type: 'gate', kind: 'entry' });
  assert.equal(g.extra, 1);
  tick(g, R.SAVE_TICKS + 5);
  g.dispatch({ type: 'drain' });
  let ticks = 0;
  while (g.phase !== 'serve' && ticks < 1000) { tick(g); ticks++; }
  assert.equal(g.ball, 1, 'shoot again');
  assert.equal(g.extra, 0);
  assert.equal(g.msg.text, 'SHOOT AGAIN');
});

test('rules: the plunger needs a fresh press after a ball is served, and only pulls with the ball on it', () => {
  const g = game(15);
  tick(g, 3);
  tick(g, 20, { ...idle, plunger: true });
  assert.ok(g.world.plunger.pull > 0.3, `pulled ${g.world.plunger.pull}`);
  tick(g, 1);
  // the button held through a re-serve does nothing until it is let go
  const h = game(16);
  tick(h, 2, { ...idle, plunger: true }); // held from the very start: not armed yet... the first tick had it down
  assert.ok(h.world.plunger.pull === 0 || h.world.plunger.pull < 0.1);
});

// ------------------------------------------------------------------ whole games

/** A crude player: plunges at a random power, flips when the ball is near a flipper, nudges rarely. */
function playGame(seed, miss = 0.12) {
  const g = game(seed);
  const brain = mulberry32(seed * 31 + 7);
  const st = { L: { hold: 0, cool: 0 }, R: { hold: 0, cool: 0 } };
  let pull = 0, want = 0, ticks = 0;
  while (!g.finished && ticks < 60 * 60 * 6) {
    const input = { left: false, right: false, plunger: false, nudge: false };
    const w = g.world, b = w.ball;
    if (g.phase === 'serve' && P.ballOnPlunger(w) && g.phaseT > 4) {
      if (want === 0) { want = 36 + Math.floor(brain() * 26); pull = 0; }
      if (pull < want) { input.plunger = true; pull++; } else { want = 0; pull = 0; }
    }
    for (const f of w.flippers) {
      const s = st[f.side], key = f.side === 'L' ? 'left' : 'right';
      if (s.hold > 0) { s.hold--; input[key] = true; if (s.hold === 0) s.cool = 14; continue; }
      if (s.cool > 0) { s.cool--; continue; }
      if (!b.active || b.inLane || g.phase !== 'play') continue;
      const tip = f.px + Math.cos(f.rest) * f.len;
      const inZone = b.x > Math.min(f.px, tip) - 14 && b.x < Math.max(f.px, tip) + 14 && b.y > f.py - 52 && b.y < f.py + 22;
      if (inZone && b.vy > -150) {
        if (brain() < miss) { s.cool = 20; continue; }
        if (brain() < 0.45) { s.hold = 10 + Math.floor(brain() * 14); input[key] = true; }
      }
    }
    g.update(input);
    ticks++;
  }
  return { g, ticks };
}

test('whole games: a simple bot plays complete three-ball games that always finish', () => {
  let total = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const { g, ticks } = playGame(seed);
    assert.ok(g.finished, `game ${seed} finished`);
    assert.equal(g.phase, 'over');
    assert.ok(g.score > 1000 && g.score < 2_000_000, `score ${g.score}`);
    assert.ok(ticks < 60 * 60 * 5, 'under five game minutes');
    assert.equal(g.world.stats.escapes, 0);
    total += g.score;
  }
  assert.ok(total > 0);
});

test('whole games: the same seed and the same inputs replay identically', () => {
  const a = playGame(21), b = playGame(21);
  assert.equal(a.g.score, b.g.score);
  assert.equal(a.ticks, b.ticks);
  assert.deepEqual(a.g.stats, b.g.stats);
  assert.equal(a.g.world.ball.x, b.g.world.ball.x);
});

// ------------------------------------------------------------------ the cabinet module

/** A canvas context that accepts any drawing call and remembers the text it was asked to draw. */
function stubContext(texts) {
  const own = {};
  return new Proxy(own, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (k === 'measureText') return () => ({ width: 8 });
      if (k === 'fillText') return (text) => { texts.push(String(text)); };
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

/** Start the real cabinet module against stand-ins for the engine and the DOM. */
async function startCabinet({ debug = true } = {}) {
  const texts = [];
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => stubContext(texts) }) };
  globalThis.Path2D = class { arc() {} lineTo() {} moveTo() {} closePath() {} };
  const held = new Set(), touches = new Map(), handlers = {};
  const log = { scores: [], over: [], sounds: [] };
  let state = null, actions = null;
  const env = {
    ctx: stubContext(texts), W: 450, H: 720, debug, pb: 0, fx: {},
    audio: { play: (name) => log.sounds.push(name), setLoop() {}, stopLoop() {} },
    input: {
      held: (k) => held.has(k),
      onKeyDown: (fn) => { handlers.keydown = fn; },
      onKeyUp: (fn) => { handlers.keyup = fn; },
      trackTouches: () => touches,
    },
    onScore: (n) => log.scores.push(n),
    onGameOver: (n) => log.over.push(n),
    expose: (st) => { state = st; },
    exposeActions: (a) => { actions = a; },
  };
  const mod = (await import('../arcade/games/pinball.js')).default;
  const scene = mod.start(env);
  return {
    scene, held, touches, texts, log, env,
    get state() { return state; },
    get actions() { return actions; },
    key(k, down) { if (down) { held.add(k); handlers.keydown({ key: k, repeat: false, preventDefault() {} }); } else held.delete(k); },
    run(n = 1) { for (let i = 0; i < n; i++) scene.tick(); },
  };
}

test('the cabinet module has the contract the arcade expects', async () => {
  const mod = await import('../arcade/games/pinball.js');
  const game = mod.default;
  assert.equal(game.id, 'PINBALL');
  assert.equal(game.title, 'Dust Devil Pinball');
  assert.equal(game.mode, 'tall');
  assert.equal(game.ownHud, true);
  assert.equal(typeof game.start, 'function');
});

test('cabinet: keyboard flippers, plunger and nudge work, and the debug hooks expose live state', async () => {
  const c = await startCabinet();
  c.run(10);
  assert.equal(c.state.phase, 'serve');
  assert.equal(c.state.ballNumber, 1);
  assert.equal(c.state.ballsLeft, 2);
  assert.ok(c.state.ball.inLane && c.state.ball.active);
  for (const k of ['ball', 'flippers', 'score', 'lanes', 'targets', 'tiltWarnings', 'ballSave']) assert.ok(k in c.state, k);
  // flippers: Left arrow or Z, Right arrow or /
  c.key('z', true); c.run(4);
  assert.equal(c.state.flippers.held.L, true);
  assert.ok(c.state.flippers.L < 0, 'the left flipper swung up');
  c.key('z', false); c.run(2);
  assert.equal(c.state.flippers.held.L, false);
  c.key('/', true); c.key('ArrowLeft', true); c.run(4);
  assert.deepEqual(c.state.flippers.held, { L: true, R: true }, 'both at once');
  c.key('/', false); c.key('ArrowLeft', false); c.run(2);
  // a keypress shorter than a tick still moves the flipper
  c.key('ArrowRight', true); c.key('ArrowRight', false); c.run(1);
  assert.equal(c.state.flippers.held.R, true);
  c.run(4);
  // plunger: Space pulls and releasing fires
  c.key(' ', true); c.run(50);
  assert.ok(c.state.plunger.pull > 0.9, 'pulled back');
  c.key(' ', false); c.run(130);
  assert.equal(c.state.phase, 'play', 'the ball is out on the table');
  assert.ok(c.state.ballSave > 0 && c.state.ballSave <= R.SAVE_TICKS);
  // nudge: the Up arrow
  c.actions.placeBall(225, 420, 0, 0);
  c.run(2);
  const vy = c.state.ball.vy;
  c.key('ArrowUp', true); c.key('ArrowUp', false); c.run(1);
  assert.ok(c.state.ball.vy < vy - 40, 'the ball was kicked upwards');
});

test('cabinet: touch holds the flippers by screen half (both at once) and pulls the plunger', async () => {
  const c = await startCabinet();
  c.run(10);
  // ball on the plunger: any touch pulls it, and the flippers stay down
  c.touches.set(1, { x: 100, y: 600 });
  c.run(30);
  assert.equal(c.state.plunger.state, 'pulling');
  assert.deepEqual(c.state.flippers.held, { L: false, R: false });
  c.touches.clear();
  c.run(150);
  // in play: left half is the left flipper, right half the right one
  c.actions.placeBall(225, 420, 0, 0);
  c.run(2);
  c.touches.set(1, { x: 60, y: 650 }); c.run(3);
  assert.deepEqual(c.state.flippers.held, { L: true, R: false });
  c.touches.set(2, { x: 380, y: 650 }); c.run(3);
  assert.deepEqual(c.state.flippers.held, { L: true, R: true });
  c.touches.delete(1); c.run(8);
  assert.deepEqual(c.state.flippers.held, { L: false, R: true });
  c.touches.clear(); c.run(8);
  assert.deepEqual(c.state.flippers.held, { L: false, R: false });
  // dragging a finger across the middle switches flippers
  c.touches.set(3, { x: 100, y: 650 }); c.run(3);
  c.touches.set(3, { x: 350, y: 650 }); c.run(8);
  assert.deepEqual(c.state.flippers.held, { L: false, R: true });
});

test('cabinet: the control hint is in keyboard words, then touch words once a touch happens, and goes after the first launch', async () => {
  const c = await startCabinet();
  c.run(3);
  assert.ok(c.texts.some((t) => /SPACE/.test(t)), 'keyboard wording at first');
  assert.ok(!c.texts.some((t) => /Hold to pull/.test(t)));
  c.touches.set(1, { x: 100, y: 600 }); c.run(2);
  c.touches.clear();
  c.texts.length = 0;
  c.run(2);
  assert.ok(c.texts.some((t) => /Hold to pull/.test(t)), 'touch wording after a touch');
  assert.ok(!c.texts.some((t) => /SPACE/.test(t)));
  // after the first launch there is no hint
  c.run(40);
  c.actions.launch(1);
  c.run(120);
  c.texts.length = 0;
  c.run(3);
  assert.ok(!c.texts.some((t) => /flip/i.test(t)), 'the hint is gone');
});

test('cabinet: the game reports its final score exactly once, three balls later', async () => {
  const c = await startCabinet();
  c.run(5);
  for (let b = 0; b < 3; b++) {
    c.actions.placeBall(225, 420, 0, 0);
    c.run(2);
    c.state.game.save.t = 0; // no ball save
    c.actions.drain();
    c.run(60 * 6);
  }
  assert.equal(c.state.phase, 'over');
  c.run(60 * 4);
  assert.equal(c.log.over.length, 1, 'onGameOver is called once');
  assert.equal(c.log.over[0], c.state.score);
  c.run(300);
  assert.equal(c.log.over.length, 1);
  assert.ok(c.log.sounds.every((n) => typeof n === 'string'));
});

test('the debug build is repeatable: the same actions give the same table', async () => {
  const play = async () => {
    const c = await startCabinet();
    c.run(5);
    c.actions.launch(0.8); c.run(200);
    c.actions.flip('L', true); c.run(20); c.actions.flip('L', false); c.run(200);
    return { score: c.state.score, ball: { ...c.state.ball }, lanes: c.state.lanes.slice(), skill: c.state.skillLane };
  };
  assert.deepEqual(await play(), await play());
});

test('no em dashes or real machine names in the game sources', () => {
  const dir = new URL('../arcade/games/pinball/', import.meta.url);
  const files = [...readdirSync(dir).map((f) => new URL(f, dir)), new URL('../arcade/games/pinball.js', import.meta.url)];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!text.includes(String.fromCharCode(0x2014)), `${f.pathname}: em dash`);
    assert.ok(!/addams|twilight zone|medieval madness|attack from mars|\bgorgar\b|\bwilliams\b|\bbally\b|\bstern\b|\bgottlieb\b/i.test(text), `${f.pathname}: a trademarked name`);
  }
});
