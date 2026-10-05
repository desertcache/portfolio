// Mesa Lander, "watch it learn": one agent teaches itself to land, from scratch, live in
// your browser. The brain is a small neural network trained with PPO (learn.js). It
// practices in a hidden copy of this very world, thousands of fast attempts, and every
// round of learning it publishes its latest brain; the lander you watch is a frozen copy
// of that brain flying one attempt at a time, in real time, by the same rules (flight.js).
//
// Training happens inside tick(), under a time budget of a few milliseconds a frame, so
// the page stays at 60 fps. Keys: 1-4 speed, R new brain from scratch, Esc ends.
import { Learner } from './learn.js';
import { Flight, TIMEOUT } from './flight.js';
import { aiTerrain, START } from './env.js';
import { FLYING, LANDED, CRASHED, LOST, MAIN } from './physics.js';
import { buildScene, drawLander, drawBeacons, text, chip, PAL, TAU, makeCanvas } from './art.js';
import { Parts } from './parts.js';
import { createSfx } from './sfx.js';
import {
  COL_X, paintColumn, drawPips, drawCurve, drawExpect, drawBars, drawFoot, drawButtons, BUTTONS, hit,
} from './panels.js';
import { mulberry32, hashSeed } from './rng.js';

// Milliseconds of learning per tick at speed 1 to 4 (a tick is 1/60 s, about 16.7 ms).
const SPEED_MS = [0, 6, 8.5, 10.5, 12];
// ... but a whole tick (learning plus drawing) is held to this many, so a slow device that
// takes long to draw simply learns less per frame instead of dropping frames.
const TICK_CAP_MS = [0, 11, 12.5, 13.5, 14.5];
// And if the page still slips (the engine has to run ticks back to back to catch up, which
// only happens when a frame came late), the learning share is trimmed until it holds again.
const LATE_GAP_MS = 1; // a tick that starts this soon after the last one ended is a catch-up
const LATE_HIGH = 0.1; // trim the budget when more than this share of recent ticks were catch-ups
const LATE_LOW = 0.03; // give it back below this
const REST_TICKS = 30; // a pause on the result before the next attempt
const MAX_STEPS = 1500000; // after this many decisions the brain stops practicing and just flies
const TRAIL_KEEP = 12; // how many finished attempts leave a trail
const WHY = {
  wall: 'hit the mesa',
  offpad: 'missed the pad',
  fast: 'came in too fast',
  slide: 'was sliding sideways',
  tilt: 'touched down tilted',
  spin: 'was still spinning',
  lost: 'flew away',
  timeout: 'ran out of time',
};
const newSeed = () => (Math.random() * 4294967296) >>> 0;

export function startWatch(env) {
  const { ctx, W, H, input, audio } = env;
  const sfx = createSfx(audio);
  const hasTouch = (navigator.maxTouchPoints || 0) > 0;
  const terrain = aiTerrain();
  const parts = new Parts(160);
  const startBox = { x0: START.x[0], x1: START.x[1], y0: START.y[0], y1: START.y[1] };

  let baseSeed = 1;
  if (env.debug) baseSeed = Number(new URLSearchParams(location.search).get('seed')) >>> 0 || 1;
  else baseSeed = newSeed();
  const rand = env.debug ? mulberry32(hashSeed(baseSeed, 0xfa11)) : Math.random; // looks only

  const S = {
    mode: 'learn',
    speed: 1,
    seed: baseSeed,
    brainNo: 0,
    tick: 0,
    phase: 'fly', // fly | rest
    restT: 0,
    training: true,
    finished: 0, // attempts you have watched to the end
    shownLandings: 0,
    result: null, // how the last watched attempt ended
    budgetMs: SPEED_MS[1],
    tickMs: 0, // a whole tick, learning included (smoothed)
    drawMs: 1.5, // everything but the learning (smoothed)
    late: 0, // share of recent ticks the engine had to run back to back (smoothed)
    tickMsMax: 0,
    perSec: 0, // decisions per second of wall time, for the footer
    learner: null,
    flight: null,
    get attempt() { return S.finished + (S.phase === 'fly' ? 1 : 0); },
    get lander() { return S.flight.s; },
    get value() { return S.flight.value; },
    get probs() { return Array.from(S.flight.probs); },
    get action() { return S.flight.action; },
    get recentLandings() { return recentLandings(); },
    get recentRate() { return S.finished ? recentLandings() / Math.min(20, S.finished) : 0; },
    get trainAttempts() { return S.learner.episodes; },
    get trainRate() { return S.learner.rate(50); },
    get trainRate20() { return S.learner.rate(20); },
    get steps() { return S.learner.steps; },
    get stepsPerSec() { return S.perSec; },
    get updates() { return S.learner.updates; },
    get returns() { return S.learner.returns.slice(-10); },
    get history() { return S.learner.history.slice(-60); },
    get entropy() { return S.learner.stats.ent; },
  };

  let scene = null;
  let ended = false;
  let ring = new Uint8Array(20); // outcomes of the attempts you watched, 1 = landed
  let trails = []; // finished attempts: { path, landed, x, y }
  let flightRng = null;
  let lastEnd = 0;
  let late = 0; // share of recent ticks that were catch-ups (smoothed)
  let share = 1; // the part of the learning budget in use
  let winT = 0;
  let winSteps = 0;
  const crashSpeed = { n: 0, first: [], firstMean: 0, recent: 0 };

  function onEpisode(outcome, info) {
    if (outcome !== CRASHED) return;
    const cs = crashSpeed;
    cs.n++;
    if (cs.first.length < 50) {
      cs.first.push(info.speed);
      cs.firstMean = cs.first.reduce((a, b) => a + b, 0) / cs.first.length;
    }
    cs.recent = cs.n === 1 ? info.speed : cs.recent * 0.97 + info.speed * 0.03;
  }

  function newBrain(seed) {
    S.brainNo++;
    S.seed = seed != null ? seed >>> 0 : (env.debug ? (baseSeed + S.brainNo - 1) >>> 0 : newSeed());
    S.learner = new Learner({ seed: S.seed, terrain, onEpisode });
    flightRng = mulberry32(hashSeed(S.seed, 0xd15));
    S.flight = new Flight({ rng: flightRng, terrain, hidden: S.learner.h.hidden });
    ring = new Uint8Array(20);
    trails = [];
    S.finished = 0;
    S.shownLandings = 0;
    S.result = null;
    crashSpeed.n = 0;
    crashSpeed.first = [];
    crashSpeed.firstMean = 0;
    crashSpeed.recent = 0;
    parts.clear();
    startFlight();
  }

  function startFlight() {
    S.flight.begin(S.learner);
    S.phase = 'fly';
    S.restT = 0;
  }

  function recentLandings() {
    const n = Math.min(20, S.finished);
    let c = 0;
    for (let k = 0; k < n; k++) c += ring[(S.finished - 1 - k) % 20];
    return c;
  }

  // ---- one tick of the shown attempt ----
  function stepFlight() {
    const f = S.flight;
    if (S.phase === 'rest') {
      if (++S.restT >= REST_TICKS) startFlight();
      return;
    }
    const st = f.tick();
    const s = f.s;
    if (S.speed <= 2) {
      if ((s.fire & MAIN) && f.ticks % 2 === 0) {
        const sin = Math.sin(s.a);
        const cos = Math.cos(s.a);
        parts.smoke(s.x - sin * 14, s.y + cos * 14, -sin * 1.5 + s.vx / 60, cos * 1.5 + s.vy / 60 + 0.2, 3, 18);
      }
    }
    if (st !== FLYING) finishFlight(st);
  }

  function finishFlight(st) {
    const f = S.flight;
    const s = f.s;
    const landed = st === LANDED;
    ring[S.finished % 20] = landed ? 1 : 0;
    S.finished++;
    if (landed) {
      S.shownLandings++;
      env.onScore(S.shownLandings);
    }
    const why = st === LOST ? 'lost' : st === TIMEOUT ? 'timeout' : s.cause;
    S.result = {
      landed, why, text: landed ? 'Landed!' : `Crashed: ${WHY[why] || 'crashed'}`, x: s.x, y: s.y, speed: s.impact.speed,
    };
    const path = new Path2D();
    const t = f.trail;
    path.moveTo(t[0], t[1]);
    for (let i = 2; i < t.length; i += 2) path.lineTo(t[i], t[i + 1]);
    trails.push({ path, landed, x: s.x, y: s.y });
    if (trails.length > TRAIL_KEEP) trails.shift();
    if (S.speed <= 2) {
      if (landed) {
        sfx.watchLand();
        for (let i = 0; i < 12; i++) parts.confetti(s.x + (rand() - 0.5) * 40, s.y - 10, (rand() - 0.5) * 2.4, -1 - rand() * 2, rand);
      } else {
        sfx.watchCrash();
        if (st === CRASHED) parts.crash(s.x, s.y + 6, rand);
      }
    }
    S.phase = 'rest';
    S.restT = 0;
  }

  // ---- what to say about it, in plain words ----
  function caption() {
    const n = Math.max(1, S.attempt);
    const L = S.learner;
    // The words describe the brain that is flying: its practice record when it was published,
    // averaged over its last few rounds of learning so one lucky or unlucky window cannot speak.
    const v = S.flight.version;
    let rate = 0;
    if (v > 0) {
      const from = Math.max(0, v - 5);
      for (let i = from; i < v; i++) rate += L.history[i].rate;
      rate /= v - from;
    }
    if (v === 0) return `Attempt ${n}: it has never flown before, so every move is a guess.`;
    const lead = `Attempt ${n}: `;
    if (rate < 0.05) return `${lead}still guessing. It crashes almost every time.`;
    if (rate < 0.25) {
      const cs = crashSpeed;
      const slower = cs.n > 80 && cs.recent < cs.firstMean * 0.8;
      return slower ? `${lead}still crashing, but slower.` : `${lead}still crashing, just as hard.`;
    }
    if (rate < 0.5) return `${lead}it finds the pad now and then.`;
    if (rate < 0.7) return `${lead}it lands more often than not.`;
    if (rate < 0.85) return `${lead}it has learned to land, with a few misses.`;
    return S.training ? `${lead}it lands most of the time.` : `${lead}it lands most of the time. Practice is over.`;
  }

  // ---- drawing ----
  function buildFull() {
    const full = makeCanvas(W, H);
    const g = full.getContext('2d');
    g.drawImage(buildScene(terrain, { seed: 7, startBox }), 0, 0);
    text(g, 'random start spot, speed and tilt', startBox.x0 + 8, startBox.y1 - 8, { size: 13, weight: 600, color: PAL.ink2 });
    paintColumn(g, H);
    return full;
  }

  function drawTrails() {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const n = trails.length;
    for (let i = 0; i < n; i++) {
      const tr = trails[i];
      const age = n - 1 - i; // 0 = the newest
      ctx.globalAlpha = Math.max(0.16, 0.6 - age * 0.04);
      ctx.lineWidth = 3;
      ctx.strokeStyle = tr.landed ? PAL.turq : PAL.crash;
      ctx.stroke(tr.path);
      // where it ended: a ring for a landing, a cross for a crash
      ctx.lineWidth = 2.4;
      if (tr.landed) {
        ctx.beginPath(); ctx.arc(tr.x, tr.y + 14, 5, 0, TAU); ctx.stroke();
      } else {
        const x = tr.x;
        const y = Math.min(tr.y, 440);
        ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawLive() {
    const f = S.flight;
    // the path so far
    const t = f.trail;
    if (S.phase === 'fly' && t.length > 3) {
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.strokeStyle = PAL.ink2;
      ctx.beginPath();
      ctx.moveTo(t[0], t[1]);
      for (let i = 2; i < t.length; i += 2) ctx.lineTo(t[i], t[i + 1]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const crashedNow = S.phase === 'rest' && f.status === CRASHED;
    if (!crashedNow) drawLander(ctx, f.s.x, f.s.y, f.s.a, f.s.fire, S.tick);
  }

  function drawTag() {
    if (S.phase !== 'rest' || !S.result) return;
    const r = S.result;
    const str = r.text;
    ctx.font = '700 15px Archivo, "Helvetica Neue", Arial, sans-serif';
    const w = Math.ceil(ctx.measureText(str).width) + 24;
    const x = Math.max(8, Math.min(COL_X - w - 8, r.x - w / 2));
    const y = Math.max(44, Math.min(380, r.y - 58));
    chip(ctx, x, y, w, 30, { fill: PAL.paperHi, border: r.landed ? PAL.turqDark : PAL.crash });
    text(ctx, str, x + w / 2, y + 21, { size: 15, weight: 700, color: r.landed ? PAL.turqDark : PAL.crash, align: 'center' });
  }

  function drawCaption() {
    const str = caption();
    ctx.font = '800 16px Archivo, "Helvetica Neue", Arial, sans-serif';
    const w = Math.min(COL_X - 20, Math.ceil(ctx.measureText(str).width) + 26);
    chip(ctx, 10, 6, w, 30, { fill: PAL.paper, alpha: 0.96 });
    text(ctx, str, 23, 27, { size: 16, weight: 800, color: PAL.ink, maxW: w - 26 });
  }

  function draw() {
    ctx.drawImage(scene, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, COL_X, H);
    ctx.clip();
    drawBeacons(ctx, terrain.pad, S.tick);
    drawTrails();
    parts.draw(ctx, 'under');
    drawLive();
    parts.draw(ctx, 'over');
    drawTag();
    drawCaption();
    ctx.restore();
    const f = S.flight;
    const L = S.learner;
    drawPips(ctx, ring, S.finished);
    drawCurve(ctx, L.history, L.episodes, L.rate(50));
    drawExpect(ctx, f.values, f.value, S.phase === 'rest' ? (S.result.landed ? 'landed' : 'crashed') : null);
    drawBars(ctx, f.probs, f.action);
    drawFoot(ctx, { attempts: L.episodes, version: f.version, perSec: S.perSec, training: S.training });
    drawButtons(ctx, S.speed, hasTouch);
  }

  // ---- controls ----
  function setSpeed(n) {
    if (n >= 1 && n <= 4) { S.speed = n | 0; }
  }

  // Ending takes three more frames, each a little darker, because the cabinet's Game Over
  // panel is light text over the last frame it shows.
  let endT = -1;
  function end(now = false) {
    if (ended || endT >= 0) return;
    endT = now === true ? 3 : 0;
    if (now === true) finishEnd();
  }
  function finishEnd() {
    if (ended) return;
    ended = true;
    audio.stopLoop();
    env.onGameOver(S.shownLandings);
  }

  input.onKeyDown((e) => {
    if (ended || e.repeat) return;
    const k = e.key;
    if (k === 'Escape' || k === 'q' || k === 'Q') end();
    else if (k === 'r' || k === 'R') newBrain();
    else if (/^[1-4]$/.test(k)) setSpeed(Number(k));
  });
  const press = (x, y) => {
    if (ended) return;
    for (const b of BUTTONS.speeds) if (hit(b, x, y)) return setSpeed(b.speed);
    if (hit(BUTTONS.newBrain, x, y)) return newBrain();
    if (hit(BUTTONS.end, x, y)) return end();
  };
  input.onClick(press);
  input.onTap(press);

  // ---- debug hooks ----
  if (env.debug) {
    env.expose(S);
    env.exposeActions({
      setSpeed,
      newBrain(seed) { newBrain(seed); return S.seed; },
      /** Put the shown lander somewhere: setState({ x, y, vx, vy, a, w }). */
      setState(o = {}) {
        const s = S.flight.s;
        for (const k of ['x', 'y', 'vx', 'vy', 'a', 'w']) if (o[k] != null) s[k] = o[k];
        S.flight.decide();
      },
      /** Train n more decisions right now, with no drawing (for tests). */
      runSteps(n = 2048) { S.learner.runSteps(n); return S.learner.rate(50); },
      trainOn(on = true) { S.training = on; },
      end() { end(true); },
      resetPerf() { S.tickMsMax = 0; },
    });
  }

  env.onScore(0);
  scene = buildFull();
  newBrain(baseSeed);

  return {
    tick() {
      if (ended) return;
      if (endT >= 0) {
        endT++;
        draw();
        ctx.fillStyle = `rgba(36, 28, 36, ${Math.min(0.7, 0.35 * endT).toFixed(2)})`;
        ctx.fillRect(0, 0, W, H);
        if (endT >= 4) finishEnd();
        return;
      }
      const t0 = performance.now();
      S.tick++;
      // Learning gets what is left of the tick after drawing: at most SPEED_MS, and less on
      // a device where drawing is slow, so the page keeps its 60 frames a second.
      if (lastEnd > 0) {
        late += ((t0 - lastEnd < LATE_GAP_MS ? 1 : 0) - late) * 0.03;
        if (late > LATE_HIGH) share = Math.max(0.2, share - 0.03);
        else if (late < LATE_LOW) share = Math.min(1, share + 0.003);
      }
      S.late = late;
      S.budgetMs = Math.max(1, Math.min(SPEED_MS[S.speed], TICK_CAP_MS[S.speed] - S.drawMs) * share);
      if (S.training && S.learner.steps >= MAX_STEPS) S.training = false;
      if (S.training) S.learner.work(S.budgetMs);
      const t1 = performance.now();
      for (let i = 0; i < S.speed; i++) stepFlight();
      parts.update(terrain);
      draw();

      const t2 = performance.now();
      lastEnd = t2;
      const dt = t2 - t0;
      S.drawMs += ((t2 - t1) - S.drawMs) * 0.08;
      S.tickMs = S.tickMs * 0.92 + dt * 0.08;
      if (S.tick > 30 && dt > S.tickMsMax) S.tickMsMax = dt;
      if (t2 - winT >= 700) {
        const steps = S.learner.steps;
        if (winT > 0) S.perSec = S.perSec * 0.5 + ((steps - winSteps) / ((t2 - winT) / 1000)) * 0.5;
        winT = t2;
        winSteps = steps;
      }
    },
  };
}
