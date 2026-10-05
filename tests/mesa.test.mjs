// Mesa Lander: physics, levels, the learner (backprop, PPO gradient, GAE, determinism,
// learning) and a smoke run of both game modes against a fake canvas. Fast and seeded.
// The full learning gate (5 seeds, 60 s each) is scripts/mesa-train-check.mjs, not this.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  DT, PHYS, LIMITS, BODY, LEFT, MAIN, RIGHT, FLYING, LANDED, CRASHED, LOST,
  makeTerrain, makeLander, stepLander, surfaceAt, altitude,
} from '../arcade/games/mesa/physics.js';
import { mulberry32, hashSeed } from '../arcade/games/mesa/rng.js';
import { Mlp } from '../arcade/games/mesa/net.js';
import { Learner, HYPER, policyGrad, softmax } from '../arcade/games/mesa/learn.js';
import { MesaEnv, aiTerrain, START, OBS_DIM, REWARD } from '../arcade/games/mesa/env.js';
import { Flight } from '../arcade/games/mesa/flight.js';
import {
  levelSpec, buildLevel, windAt, scoreLanding, padWidthFor, tankFor, SCREEN, LEAN,
} from '../arcade/games/mesa/levels.js';

// ------------------------------------------------------------------ physics

/** One mesa in the middle of the screen with the pad on its top. */
const world = () => makeTerrain({ mesas: [{ cx: 400, top: 300, topW: 200 }], padWidth: 120 });
const FOOT = BODY.foot.y; // the feet hang this far below the lander's center

function run(s, t, ctl, ticks, wind = 0) {
  let st = FLYING;
  for (let i = 0; i < ticks && st === FLYING; i++) st = stepLander(s, ctl, t, wind);
  return st;
}

test('free fall matches the gravity constant', () => {
  const t = world();
  const s = makeLander({ x: 400, y: 40 });
  run(s, t, 0, 60); // one second
  assert.ok(Math.abs(s.y - (40 + 0.5 * PHYS.gravity)) < 1e-9, `y after 1 s: ${s.y}`);
  assert.ok(Math.abs(s.vy - PHYS.gravity) < 1e-9);
  assert.equal(s.vx, 0);
  assert.equal(s.a, 0);
});

test('a fall onto the pad touches down when d = 1/2 g t^2 says it should', () => {
  const t = world();
  const h = 60; // feet 60 px above the pad
  const s = makeLander({ x: 400, y: t.pad.y - FOOT - h });
  let ticks = 0;
  let st = FLYING;
  while (st === FLYING) { st = stepLander(s, 0, t); ticks++; }
  const expected = Math.sqrt((2 * h) / PHYS.gravity) / DT; // 94.9 ticks
  assert.equal(ticks, Math.ceil(expected));
  assert.equal(st, CRASHED); // 76 px/s is far too fast
  assert.equal(s.cause, 'fast');
  assert.ok(Math.abs(s.impact.vy - PHYS.gravity * ticks * DT) < 1e-9);
});

test('the main engine pushes along the lander\'s own up axis', () => {
  const t = world();
  const up = makeLander({ x: 400, y: 100 });
  run(up, t, MAIN, 60);
  assert.ok(Math.abs(up.vy - (PHYS.gravity - PHYS.thrust)) < 1e-9, 'upright: net 70 px/s^2 upward');
  assert.ok(Math.abs(up.vx) < 1e-9);
  const lean = makeLander({ x: 300, y: 100, a: 0.3 }); // nose to the right
  stepLander(lean, MAIN, t);
  assert.ok(Math.abs(lean.vx - PHYS.thrust * Math.sin(0.3) * DT) < 1e-9, 'a lean sends it right');
  assert.ok(Math.abs(lean.vy - (PHYS.gravity - PHYS.thrust * Math.cos(0.3)) * DT) < 1e-9);
});

test('the side thrusters turn it, shove it a little, and the spin bleeds off', () => {
  const t = makeTerrain({ H: 3000, floor: 2900, mesas: [{ cx: 400, top: 2800, topW: 200 }], padWidth: 100 }); // a long drop
  const l = makeLander({ x: 400, y: 100 });
  run(l, t, LEFT, 30); // half a second
  // continuous model: w = (alpha/k)(1 - e^(-k t)), a = (alpha/k)(t - (1 - e^(-k t))/k)
  const k = PHYS.spinDamp;
  const alpha = -PHYS.torque;
  const w = (alpha / k) * (1 - Math.exp(-k * 0.5));
  const a = (alpha / k) * (0.5 - (1 - Math.exp(-k * 0.5)) / k);
  assert.ok(l.w < 0 && Math.abs(l.w - w) < 0.04 * Math.abs(w), `spin ${l.w} vs ${w}`);
  assert.ok(l.a < 0 && Math.abs(l.a - a) < 0.05 * Math.abs(a), `angle ${l.a} vs ${a}`);
  assert.ok(l.vx < 0 && l.vx > -PHYS.sidePush, 'the thruster also pushes it left');
  const r = makeLander({ x: 400, y: 100 });
  run(r, t, RIGHT, 30);
  assert.ok(Math.abs(r.w + l.w) < 1e-9 && Math.abs(r.a + l.a) < 1e-9, 'right is the mirror of left');
  // let go: the spin dies away
  assert.equal(run(l, t, 0, 300), FLYING);
  assert.ok(Math.abs(l.w) < 0.01, `spin after 5 s: ${l.w}`);
  // a long burn is capped
  const m = makeLander({ x: 400, y: -100, fuel: 5 });
  assert.equal(run(m, t, LEFT, 200), FLYING);
  assert.equal(Math.abs(m.w), PHYS.maxSpin);
});

test('burning uses fuel, and an empty tank means no thrust at all', () => {
  const t = world();
  const s = makeLander({ x: 400, y: 100, fuel: 1 });
  run(s, t, MAIN, 60);
  assert.ok(Math.abs(s.fuel - (1 - PHYS.fuelMain)) < 1e-9);
  assert.ok(Math.abs(s.burn - PHYS.fuelMain) < 1e-9);
  const dry = makeLander({ x: 400, y: 100, fuel: 0 });
  run(dry, t, MAIN | LEFT, 30);
  assert.ok(Math.abs(dry.vy - PHYS.gravity * 0.5) < 1e-9, 'it just falls');
  assert.equal(dry.a, 0);
});

test('a soft, upright touchdown on the pad lands; a hard one crashes', () => {
  const t = world();
  const soft = makeLander({ x: 410, y: t.pad.y - FOOT - 4, vy: 20, vx: 3 });
  const st = run(soft, t, 0, 20);
  assert.equal(st, LANDED);
  assert.equal(soft.status, LANDED);
  assert.equal(soft.cause, '');
  assert.equal(soft.y, t.pad.y - FOOT, 'it settles with both feet on the pad');
  assert.equal(soft.vy, 0);
  const hard = makeLander({ x: 410, y: t.pad.y - FOOT - 4, vy: LIMITS.vy + 30 });
  assert.equal(run(hard, t, 0, 20), CRASHED);
  assert.equal(hard.cause, 'fast');
  // the limits are exact: just under lands, just over crashes
  const edge = (vy) => run(makeLander({ x: 400, y: t.pad.y - FOOT + 0.01, vy: vy - PHYS.gravity * DT }), t, 0, 3);
  assert.equal(edge(LIMITS.vy - 2), LANDED);
  assert.equal(edge(LIMITS.vy + 2), CRASHED);
});

test('a tilted, sliding or spinning touchdown crashes', () => {
  const t = world();
  const touch = (init) => {
    const s = makeLander({ x: 400, y: t.pad.y - FOOT - 3, vy: 15, ...init });
    run(s, t, 0, 20);
    return s;
  };
  const tilted = touch({ a: 0.4 });
  assert.equal(tilted.status, CRASHED);
  assert.equal(tilted.cause, 'tilt', 'tipping over is a crash');
  assert.equal(touch({ a: LIMITS.tilt - 0.03 }).status, LANDED);
  assert.equal(touch({ vx: 45 }).cause, 'slide');
  assert.equal(touch({ w: 1.5, y: t.pad.y - FOOT - 1 }).cause, 'spin');
});

test('touching the pad\'s mesa anywhere else, or the floor, is a crash', () => {
  const t = world();
  // on the mesa top but with a foot past the end of the pad
  const edge = makeLander({ x: t.pad.x1 + 6, y: t.pad.y - FOOT - 3, vy: 15 });
  run(edge, t, 0, 20);
  assert.equal(edge.cause, 'offpad');
  // on the desert floor
  const floor = makeLander({ x: 60, y: t.floor - FOOT - 3, vy: 15 });
  run(floor, t, 0, 20);
  assert.equal(floor.status, CRASHED);
  assert.equal(floor.cause, 'offpad');
});

test('flying into the side of a mesa crashes', () => {
  const t = world();
  // the left face runs from (300, 300) outward and down; fly into it from the left
  const face = surfaceAt(t, 290); // below the top
  assert.ok(face > 300);
  const s = makeLander({ x: 255, y: 330, vx: 90, vy: 0 });
  const st = run(s, t, MAIN, 120); // the engine keeps it from dropping onto the floor
  assert.equal(st, CRASHED);
  assert.equal(s.cause, 'wall');
  assert.ok(s.x > 255 && s.x < 300, `it hit at x = ${s.x}`);
});

test('leaving the screen ends the attempt', () => {
  const t = world();
  for (const init of [{ x: -30, y: 100 }, { x: t.W + 30, y: 100 }, { x: 400, y: -160 }]) {
    const s = makeLander(init);
    assert.equal(stepLander(s, 0, t), LOST);
    assert.equal(s.status, LOST);
    const y = s.y;
    assert.equal(stepLander(s, MAIN, t), LOST, 'it stays over');
    assert.equal(s.y, y);
  }
  // drifting out sideways takes a while, and is detected when it gets there
  const drift = makeLander({ x: 780, y: 50, vx: 100 });
  assert.equal(run(drift, t, 0, 60), LOST);
});

test('the wind pushes sideways and the lander is not weightless', () => {
  const t = world();
  const s = makeLander({ x: 400, y: 100 });
  run(s, t, 0, 60, 6);
  assert.ok(Math.abs(s.vx - 6) < 1e-9);
  assert.ok(Math.abs(altitude(s, t) - (t.pad.y - (s.y + FOOT))) < 1e-9);
});

// ------------------------------------------------------------------- levels

test('levels are deterministic and fair by construction', () => {
  assert.deepEqual(levelSpec(5), levelSpec(5));
  assert.notDeepEqual(levelSpec(5).mesas, levelSpec(6).mesas);
  assert.equal(padWidthFor(1), 120);
  for (let n = 2; n <= 20; n++) {
    assert.ok(padWidthFor(n) <= padWidthFor(n - 1) && padWidthFor(n) >= 54, 'the pad only narrows, to a floor');
    assert.ok(tankFor(n) <= tankFor(n - 1) && tankFor(n) >= 0.65);
  }
  for (let n = 1; n <= 40; n++) {
    const lv = buildLevel(n);
    const t = lv.terrain;
    const pad = t.pad;
    assert.equal(pad.width, lv.padWidth);
    assert.ok(pad.x0 > 0 && pad.x1 < t.W, `level ${n}: the pad is on the screen`);
    // the pad is flat, at the top of its mesa, and there is nothing above it
    for (let x = Math.ceil(pad.x0); x <= Math.floor(pad.x1); x++) assert.equal(t.h[x], pad.y, `level ${n}: pad flat at x=${x}`);
    for (let x = Math.max(0, Math.floor(pad.x0 - 100)); x <= Math.min(t.W, Math.ceil(pad.x1 + 100)); x++) {
      assert.ok(t.h[x] >= pad.y, `level ${n}: nothing taller than the pad within 100 px of it (x=${x})`);
    }
    // mesas do not run into each other
    const reach = (m) => m.topW / 2 + (SCREEN.floor - m.top) * LEAN;
    for (let i = 0; i < lv.mesas.length; i++) {
      for (let j = i + 1; j < lv.mesas.length; j++) {
        const a = lv.mesas[i];
        const b = lv.mesas[j];
        assert.ok(Math.abs(a.cx - b.cx) >= reach(a) + reach(b) + 15, `level ${n}: mesas ${i} and ${j} are apart`);
      }
      assert.ok(lv.mesas[i].top >= 190 && lv.mesas[i].top <= 410);
    }
    // the lander starts in clear air, well away from the pad
    const s = makeLander({ ...lv.start, fuel: lv.tank });
    assert.equal(stepLander(s, 0, t), FLYING);
    assert.ok(altitude(s, t) > 100);
    assert.ok(Math.abs(lv.start.x - pad.cx) >= 200, `level ${n}: starts ${Math.abs(lv.start.x - pad.cx)} px away`);
    assert.ok(lv.wind.amp === 0 ? n < 3 : n >= 3);
  }
});

test('gusts blow both ways, ease in, and never exceed the level\'s strength', () => {
  const calm = levelSpec(2);
  assert.equal(windAt(calm, 300), 0);
  const gusty = levelSpec(6);
  assert.equal(windAt(gusty, 0), 0);
  let lo = 0;
  let hi = 0;
  for (let t = 0; t < 60 * 90; t++) {
    const w = windAt(gusty, t);
    assert.ok(Math.abs(w) <= gusty.wind.amp + 1e-9);
    lo = Math.min(lo, w);
    hi = Math.max(hi, w);
  }
  assert.ok(lo < -1 && hi > 1);
});

test('a landing scores base + softness + accuracy + fuel left', () => {
  const t = buildLevel(3).terrain;
  const perfect = scoreLanding(3, { fuel: 1, impact: { vy: 0, dx: 0 } }, t);
  assert.deepEqual(perfect, { base: 300, soft: 100, aim: 100, fuel: 100, total: 600 });
  const rough = scoreLanding(3, { fuel: 0.25, impact: { vy: LIMITS.vy, dx: 50 } }, t);
  assert.equal(rough.soft, 0);
  assert.equal(rough.aim, 0);
  assert.equal(rough.fuel, 25);
  assert.equal(rough.total, 325);
  const mid = scoreLanding(1, { fuel: 0.5, impact: { vy: LIMITS.vy / 2, dx: 10 } }, buildLevel(1).terrain);
  assert.equal(mid.base, 100);
  assert.equal(mid.soft, 50);
  assert.ok(mid.aim > 60 && mid.aim < 90);
  assert.equal(mid.total, mid.base + mid.soft + mid.aim + mid.fuel);
});

// A scripted test pilot, NOT the learning agent and never shown to anyone: plain feedback
// rules, here only to prove the early levels can be landed inside their tanks.
function pilot(n) {
  const lv = buildLevel(n);
  const t = lv.terrain;
  const pad = t.pad;
  const s = makeLander({ ...lv.start, fuel: lv.tank });
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  let st = FLYING;
  let tick = 0;
  let mode = 'align';
  while (st === FLYING && tick < 60 * 75) {
    tick++;
    const alt = altitude(s, t);
    const ex = pad.cx - s.x;
    let top = pad.y;
    const lo = Math.max(0, Math.min(s.x, pad.cx) - 40);
    const hi = Math.min(t.W, Math.max(s.x, pad.cx) + 40);
    for (let x = lo; x <= hi; x += 4) top = Math.min(top, t.h[x | 0]);
    if (mode === 'align' && Math.abs(ex) < 14 && Math.abs(s.vx) < 14) mode = 'descend';
    if (mode === 'descend' && Math.abs(ex) > 45) mode = 'align';
    let vyT;
    let vxD;
    let aLim;
    if (mode === 'align') {
      vyT = clamp(0.9 * (top - FOOT - 50 - s.y), -50, 40);
      vxD = clamp(1.1 * ex, -90, 90);
      if (s.y + 30 > top - 20) vxD *= 0.25;
      aLim = 0.4;
    } else {
      vyT = Math.min(50, 11 + 0.5 * Math.max(0, alt));
      vxD = clamp(0.9 * ex, -14, 14);
      aLim = 0.12;
    }
    const aCmd = clamp(0.016 * (vxD - s.vx), -aLim, aLim);
    const aErr = aCmd - (s.a + 0.35 * s.w);
    let c = 0;
    if (aErr > 0.04) c |= RIGHT;
    else if (aErr < -0.04) c |= LEFT;
    let main = s.vy > vyT;
    if (Math.abs(vxD - s.vx) > 8 && Math.sign(s.a) === Math.sign(vxD - s.vx) && Math.abs(s.a) > 0.07 && s.vy > vyT - 25) main = true;
    if (Math.abs(s.a) > 0.6) main = false;
    if (main) c |= MAIN;
    st = stepLander(s, c, t, windAt(lv, tick));
  }
  return { st, s, lv };
}

test('the first levels can be landed inside their tanks', () => {
  for (let n = 1; n <= 7; n++) { // each of these leaves the pilot at least 14% of a tank spare
    const { st, s, lv } = pilot(n);
    assert.equal(st, LANDED, `level ${n}: ${s.cause || 'did not land'} with ${s.fuel.toFixed(2)} of ${lv.tank.toFixed(2)} fuel left`);
  }
});

// ------------------------------------------------------------------ learner

function numeric(f, arr, i, h = 1e-5) {
  const o = arr[i];
  arr[i] = o + h;
  const hi = f();
  arr[i] = o - h;
  const lo = f();
  arr[i] = o;
  return (hi - lo) / (2 * h);
}

test('backprop matches finite differences, for the policy and the value network', () => {
  const rng = mulberry32(99);
  for (const nOut of [4, 1]) { // actor, critic
    const net = new Mlp(OBS_DIM, 7, 5, nOut);
    net.init(rng, 1);
    for (let i = 0; i < net.size; i++) if (i % 3 === 0) net.p[i] += (rng() - 0.5) * 0.4; // non-zero biases too
    const x = new Float64Array(OBS_DIM * 2);
    for (let i = 0; i < x.length; i++) x[i] = rng() * 2 - 1;
    const c = Array.from({ length: nOut }, () => rng() * 2 - 1);
    const loss = (xo) => () => {
      const out = net.forward(x, xo);
      let s = 0;
      for (let k = 0; k < nOut; k++) s += c[k] * out[k];
      return s;
    };
    for (const xo of [0, OBS_DIM]) { // a second sample read from the middle of the buffer
      net.g.fill(0);
      net.forward(x, xo);
      net.backward(x, xo, Float64Array.from(c));
      const f = loss(xo);
      for (let i = 0; i < net.size; i++) {
        const num = numeric(f, net.p, i);
        assert.ok(Math.abs(net.g[i] - num) <= 1e-7 + 1e-5 * Math.abs(num), `${nOut} outputs, parameter ${i}: ${net.g[i]} vs ${num}`);
      }
    }
    // gradients add up over samples until they are cleared
    net.g.fill(0);
    net.forward(x, 0); net.backward(x, 0, Float64Array.from(c));
    const once = Array.from(net.g);
    net.forward(x, 0); net.backward(x, 0, Float64Array.from(c));
    for (let i = 0; i < net.size; i++) assert.ok(Math.abs(net.g[i] - 2 * once[i]) < 1e-12);
  }
});

test('the PPO policy gradient matches the loss it claims to optimize', () => {
  // The loss, written out from its definition: clipped surrogate minus an entropy bonus.
  const probsOf = (z) => {
    const m = Math.max(...z);
    const e = z.map((v) => Math.exp(v - m));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / s);
  };
  const loss = (z, a, A, logpOld, clip, ent) => {
    const p = probsOf(z);
    const ratio = Math.exp(Math.log(p[a]) - logpOld);
    const surrogate = Math.min(ratio * A, Math.min(Math.max(ratio, 1 - clip), 1 + clip) * A);
    const H = -p.reduce((s, q) => s + q * Math.log(q), 0);
    return -surrogate - ent * H;
  };
  const cases = [
    { A: 1.3, shift: 0.05 }, // inside the clip, pushed up
    { A: -0.8, shift: -0.05 }, // inside the clip, pushed down
    { A: 1.0, shift: -0.5 }, // ratio far above 1 + clip: no policy gradient, entropy only
    { A: -1.0, shift: 0.5 }, // ratio far below 1 - clip
    { A: 0.7, shift: 0.5 }, // ratio low but advantage positive: still pushed up
  ];
  const probs = new Float64Array(4);
  const dz = new Float64Array(4);
  const info = { ratio: 0, logp: 0, entropy: 0 };
  for (const { A, shift } of cases) {
    for (const a of [0, 2]) {
      const z = [0.3, -0.7, 0.9, 0.1];
      const logpNow = Math.log(probsOf(z)[a]);
      const logpOld = logpNow + shift; // the ratio is e^(-shift)
      softmax(z, probs);
      policyGrad(probs, a, A, logpOld, 0.2, 0.03, 1, dz, info);
      for (let j = 0; j < 4; j++) {
        const num = numeric(() => loss(z, a, A, logpOld, 0.2, 0.03), z, j, 1e-6);
        assert.ok(Math.abs(dz[j] - num) < 1e-6, `A ${A}, shift ${shift}, action ${a}, score ${j}: ${dz[j]} vs ${num}`);
      }
      assert.ok(Math.abs(info.ratio - Math.exp(-shift)) < 1e-9);
      assert.ok(info.entropy > 0 && info.entropy <= Math.log(4) + 1e-12);
    }
  }
});

test('advantages and returns follow the textbook recursion, through episode ends and cut-offs', () => {
  const N = 6;
  const gamma = 0.9;
  const lambda = 0.5;
  const L = new Learner({ seed: 3, hyper: { rollout: N, gamma, lambda, minibatch: 3, epochs: 1 } });
  const rew = [1, -2, 3, 0.5, 2, -1];
  const val = [0.5, 1, -0.5, 2, 1.5, 0.2];
  const done = [0, 1, 0, 0, 1, 0]; // an episode ends after step 1 (a crash) and after step 4 (a time cut-off)
  const boot = [0, 0, 0, 0, 1.25, 0]; // the cut-off is bootstrapped with the next state's value
  const lastVal = 0.8;
  for (let i = 0; i < N; i++) {
    L.bufRew[i] = rew[i]; L.bufVal[i] = val[i]; L.bufDone[i] = done[i]; L.bufBoot[i] = boot[i];
  }
  L.critic.forward = () => new Float64Array([lastVal]); // only the value after the last step is asked for
  L.beginUpdate();
  // reference, written the other way round: one episode segment at a time
  const adv = new Array(N);
  let next = 0;
  for (let i = N - 1; i >= 0; i--) {
    const nextV = done[i] ? boot[i] : i === N - 1 ? lastVal : val[i + 1];
    const delta = rew[i] + gamma * nextV - val[i];
    next = delta + (done[i] ? 0 : gamma * lambda * next);
    adv[i] = next;
  }
  for (let i = 0; i < N; i++) assert.ok(Math.abs(L.ret[i] - (adv[i] + val[i])) < 1e-12, `return ${i}`);
  // the stored advantages are standardized
  const mean = Array.from(L.adv.slice(0, N)).reduce((a, b) => a + b, 0) / N;
  const sd = Math.sqrt(Array.from(L.adv.slice(0, N)).reduce((a, b) => a + (b - mean) ** 2, 0) / N);
  assert.ok(Math.abs(mean) < 1e-9 && Math.abs(sd - 1) < 1e-6);
  const rawMean = adv.reduce((a, b) => a + b, 0) / N;
  const rawSd = Math.sqrt(adv.reduce((a, b) => a + (b - rawMean) ** 2, 0) / N);
  for (let i = 0; i < N; i++) assert.ok(Math.abs(L.adv[i] - (adv[i] - rawMean) / (rawSd + 1e-8)) < 1e-9);
});

const params = (L) => [Array.from(L.actor.p), Array.from(L.critic.p)];

test('a seed reproduces a run exactly, however the work is cut up', () => {
  const grow = (L, step) => { while (L.updates < 2) step(L); return params(L); }; // two rounds of learning
  const a = grow(new Learner({ seed: 5 }), (L) => L.advance());
  const b = grow(new Learner({ seed: 5 }), (L) => L.advance());
  assert.deepEqual(a, b, 'same seed, same numbers');
  const cut = grow(new Learner({ seed: 5 }), (L) => L.work(0.1)); // frame-sized slices instead
  assert.deepEqual(a, cut, 'slicing the work into frames changes nothing');
  const other = grow(new Learner({ seed: 6 }), (L) => L.advance());
  assert.notDeepEqual(a, other, 'a different seed is a different run');
  const fresh = new Learner({ seed: 5 });
  const probs = new Float64Array(4);
  fresh.infer(new Float64Array(OBS_DIM), probs);
  for (const p of probs) assert.ok(Math.abs(p - 0.25) < 0.02, 'a new brain starts out nearly undecided');
});

test('a short seeded run beats the random starting policy', () => {
  // An easy start zone keeps this to about a second; the real one is the training gate's job.
  const saved = JSON.parse(JSON.stringify(START));
  Object.assign(START, { x: [230, 330], y: [200, 290], vx: [-10, 10], vy: [0, 20], a: [-0.1, 0.1], w: [-0.1, 0.1] });
  try {
    const rets = [];
    const lands = [];
    const L = new Learner({ seed: 7, onEpisode(outcome, info) { rets.push(info.ret); lands.push(outcome === LANDED ? 1 : 0); } });
    L.runSteps(25000);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const first = mean(rets.slice(0, 100));
    const last = mean(rets.slice(-100));
    assert.ok(last > first + 5, `average return went ${first.toFixed(2)} -> ${last.toFixed(2)}`);
    const landsFirst = lands.slice(0, 100).reduce((a, b) => a + b, 0);
    const landsLast = lands.slice(-100).reduce((a, b) => a + b, 0);
    assert.ok(landsLast >= landsFirst + 15, `landings in 100 attempts went ${landsFirst} -> ${landsLast}`);
  } finally {
    Object.assign(START, saved);
  }
});

// -------------------------------------------------------- the agent's world

test('the learning world is the one drawn: one mesa, a 96 px pad, a start zone', () => {
  const t = aiTerrain();
  assert.equal(t.W, 560);
  assert.equal(t.mesas.length, 1);
  assert.equal(t.pad.width, 96);
  assert.equal(t.pad.y, 330);
  assert.equal(t.pad.cx, 280);
  // every start in the zone is in clear air
  const env = new MesaEnv({ rng: mulberry32(1), terrain: t });
  const obs = new Float64Array(OBS_DIM);
  for (let i = 0; i < 300; i++) {
    env.reset(obs);
    const s = env.s;
    assert.ok(s.x >= START.x[0] && s.x <= START.x[1] && s.y >= START.y[0] && s.y <= START.y[1]);
    assert.ok(altitude(s, t) > 20, 'every start is above the pad plane');
    for (const v of obs) assert.ok(Number.isFinite(v) && Math.abs(v) <= 2 + 1e-9);
  }
  // same lander, same landing limits as the player's: the physics module is shared
  assert.equal(LIMITS.vy, 40);
});

test('the reward pays for a landing, charges for a crash and a little for fuel', () => {
  const t = aiTerrain();
  const env = new MesaEnv({ rng: mulberry32(2), terrain: t });
  const obs = new Float64Array(OBS_DIM);
  env.reset(obs);
  Object.assign(env.s, { x: t.pad.cx, y: t.pad.y - FOOT - 0.5, vx: 0, vy: 20, a: 0, w: 0 });
  env.phi = env.potential();
  const r = env.step(0, obs);
  assert.equal(env.outcome, LANDED);
  assert.ok(r > REWARD.land - 5, `a landing pays ${r}`);
  env.reset(obs);
  Object.assign(env.s, { x: t.pad.cx, y: t.pad.y - FOOT - 3, vx: 0, vy: 110, a: 0, w: 0 });
  env.phi = env.potential();
  const crash = env.step(0, obs);
  assert.equal(env.outcome, CRASHED);
  assert.ok(crash < -REWARD.crashMin + 1, `a crash costs ${crash}`);
  // idling in the air costs a little; the main engine costs more
  env.reset(obs);
  Object.assign(env.s, { x: t.pad.cx, y: 100, vx: 0, vy: 0, a: 0, w: 0 });
  env.phi = env.potential();
  const idle = env.step(0, obs);
  env.reset(obs);
  Object.assign(env.s, { x: t.pad.cx, y: 100, vx: 0, vy: 0, a: 0, w: 0 });
  env.phi = env.potential();
  const burn = env.step(2, obs);
  assert.ok(Math.abs(idle) < 1 && burn < idle - 0.05, `idle ${idle}, burn ${burn}`);
});

test('the shown flight is a faithful copy of the brain, sampling like the learner', () => {
  const t = aiTerrain();
  const L = new Learner({ seed: 11, terrain: t });
  L.runSteps(4096); // a couple of rounds so the brain is not the starting one
  assert.ok(L.updates >= 1);
  const fly = () => {
    const f = new Flight({ rng: mulberry32(5), terrain: t, hidden: L.h.hidden });
    f.begin(L);
    let guard = 0;
    while (f.tick() === FLYING && guard++ < 4000);
    return f;
  };
  const a = fly();
  const b = fly();
  assert.deepEqual(a.trail, b.trail, 'same brain and same random stream, same flight');
  assert.notEqual(a.status, FLYING);
  assert.equal(a.values.length, a.decisions);
  assert.equal(a.version, L.updates);
  // it decides every third tick: ticks / 3 decisions, give or take the first and last
  assert.ok(Math.abs(a.decisions - a.ticks / 3) <= 2);
  // a copy: training on does not move the frozen brain
  const frozen = Array.from(a.actor.p);
  L.runSteps(2048);
  assert.deepEqual(Array.from(a.actor.p), frozen);
});

// ------------------------------------------------- both modes, on a fake canvas

function fakeCtx() {
  const base = { measureText: (s) => ({ width: String(s).length * 7 }) };
  return new Proxy(base, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function fakeEnv({ learn = false } = {}) {
  const keyDown = [];
  const clicks = [];
  const held = new Set();
  const calls = { score: [], over: [], expose: null, actions: null };
  const env = {
    ctx: fakeCtx(), W: 800, H: 500, debug: true, learn,
    input: {
      held: (k) => held.has(k),
      onKeyDown: (fn) => keyDown.push(fn),
      onKeyUp() {}, onMouseMove() {}, onSwipe() {}, onDrag() {},
      onClick: (fn) => clicks.push(fn),
      onTap: (fn) => clicks.push(fn),
      trackTouches: () => new Map(),
    },
    fx: { shake() {}, hitPause() {}, burst() {}, consumePause: () => false, shakeOffset: () => ({ x: 0, y: 0 }), updateAndDraw() {} },
    audio: { play() {}, setLoop() {}, stopLoop() {} },
    onScore: (s) => calls.score.push(s),
    onGameOver: (s) => calls.over.push(s),
    expose: (s) => { calls.expose = s; },
    exposeActions: (a) => { calls.actions = a; },
  };
  return { env, keyDown, clicks, held, calls };
}

function withFakeDom(fn) {
  const saved = { document: globalThis.document, navigator: globalThis.navigator, location: globalThis.location, Path2D: globalThis.Path2D };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };
  Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 0 }, configurable: true });
  globalThis.location = { search: '?debug=1' };
  globalThis.Path2D = class { moveTo() {} lineTo() {} };
  try {
    return fn();
  } finally {
    globalThis.document = saved.document;
    Object.defineProperty(globalThis, 'navigator', { value: saved.navigator, configurable: true });
    globalThis.location = saved.location;
    globalThis.Path2D = saved.Path2D;
  }
}

test('the game plays through intro, flight, a landing, a crash and game over', async () => {
  const { default: mesa } = await import('../arcade/games/mesa.js');
  assert.equal(mesa.id, 'MESA');
  assert.equal(mesa.title, 'Mesa Lander');
  assert.equal(mesa.mode, 'landscape');
  assert.equal(mesa.ownHud, true);
  withFakeDom(() => {
    const { env, calls } = fakeEnv();
    const scene = mesa.start(env);
    const S = calls.expose;
    const act = calls.actions;
    assert.equal(S.mode, 'play');
    assert.equal(S.level, 1);
    assert.equal(S.landers, 3);
    for (let i = 0; i < 80; i++) scene.tick();
    assert.equal(S.phase, 'play', 'the intro ends by itself');
    const y0 = S.lander.y;
    act.hold({ main: true });
    for (let i = 0; i < 30; i++) scene.tick();
    act.hold(null);
    assert.ok(S.lander.y < y0 + 30 && S.lander.fuel < 1, 'the engine fires and burns fuel');
    // a gentle landing scores and moves on to level 2
    const pad = S.pad;
    act.setState({ x: pad.cx + 4, y: pad.y - FOOT - 4, vx: 2, vy: 18, a: 0, w: 0 });
    for (let i = 0; i < 20; i++) scene.tick();
    assert.equal(S.phase, 'landed');
    assert.equal(S.last.kind, 'landed');
    assert.equal(S.score, S.last.total);
    assert.equal(calls.score.at(-1), S.score);
    for (let i = 0; i < 600 && !(S.level === 2 && S.phase === 'play'); i++) scene.tick();
    assert.equal(S.level, 2, 'the next level follows the celebration');
    assert.equal(S.phase, 'play');
    assert.equal(S.landers, 3);
    assert.ok(S.L.padWidth < 120, 'with a narrower pad');
    // a crash costs a lander
    act.setState({ x: S.pad.cx, y: S.pad.y - FOOT - 4, vy: 120 });
    for (let i = 0; i < 20; i++) scene.tick();
    assert.equal(S.phase, 'crashed');
    assert.equal(S.landers, 2);
    // three crashes end the game with the score
    act.setLanders(1);
    for (let i = 0; i < 150; i++) scene.tick();
    act.setState({ x: S.pad.cx, y: S.pad.y - FOOT - 4, vy: 120 });
    for (let i = 0; i < 400; i++) scene.tick();
    assert.equal(S.phase, 'done');
    assert.deepEqual(calls.over, [S.score], 'the cabinet gets the score once');
    scene.tick(); // after the end, ticks do nothing
    assert.equal(calls.over.length, 1);
  });
});

test('watch it learn: trains inside tick(), shows its brain, and obeys the keys', async () => {
  const { default: mesaAi } = await import('../arcade/games/mesa-ai.js');
  assert.equal(mesaAi.id, 'MESAAI');
  assert.equal(mesaAi.mode, 'landscape');
  assert.equal(mesaAi.ownHud, true);
  withFakeDom(() => {
    const { env, keyDown, clicks, calls } = fakeEnv();
    const scene = mesaAi.start(env);
    const S = calls.expose;
    const act = calls.actions;
    assert.equal(S.mode, 'learn');
    assert.equal(S.speed, 1);
    for (let i = 0; i < 90; i++) scene.tick();
    assert.ok(S.steps > 0 && S.trainAttempts > 0, 'it practiced while the frames ran');
    const p = S.probs;
    assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(Number.isFinite(S.value));
    assert.ok(S.perSec >= 0);
    // keys: 3 sets the speed, R starts over, Esc ends with the landings you watched
    keyDown.forEach((fn) => fn({ key: '3' }));
    assert.equal(S.speed, 3);
    const seed = S.seed;
    keyDown.forEach((fn) => fn({ key: 'r' }));
    assert.notEqual(S.seed, seed);
    assert.equal(S.trainAttempts, 0);
    assert.equal(S.finished, 0);
    // the on-screen buttons do the same
    clicks.forEach((fn) => fn(12 + 66 * 1 + 10, 470)); // the 2x button
    assert.equal(S.speed, 2);
    act.newBrain(42);
    assert.equal(S.seed, 42);
    // train it briefly, then see the numbers move
    const rate = act.runSteps(8192);
    assert.ok(rate >= 0 && S.steps >= 8192);
    act.trainOn(false);
    for (let i = 0; i < 400; i++) scene.tick();
    assert.ok(S.finished >= 1, 'it flew whole attempts on screen');
    keyDown.forEach((fn) => fn({ key: 'Escape' }));
    assert.equal(calls.over.length, 0, 'a few darkening frames come first');
    for (let i = 0; i < 6; i++) scene.tick();
    assert.equal(calls.over.length, 1);
    assert.equal(calls.over[0], S.shownLandings);
    scene.tick();
    assert.equal(calls.over.length, 1);
  });
});

// ------------------------------------------------------------ public wording

test('nothing a visitor reads has an em dash or a trademarked name', () => {
  const dir = new URL('../arcade/games/', import.meta.url);
  const files = ['mesa.js', 'mesa-ai.js', ...readdirSync(new URL('mesa/', dir)).map((f) => `mesa/${f}`)];
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!src.includes(String.fromCharCode(0x2014)), `${f} has an em dash`);
    assert.ok(!/lunar lander/i.test(src), `${f} names a trademark`);
  }
});

test('a seed helper is a pure function of its inputs', () => {
  assert.equal(hashSeed(1, 2), hashSeed(1, 2));
  assert.notEqual(hashSeed(1, 2), hashSeed(2, 1));
  const a = mulberry32(5);
  const b = mulberry32(5);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  assert.equal(HYPER.rollout, 2048);
});
