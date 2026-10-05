// UFO Evolution: watch a flock of 60 UFOs learn Flappy UFO by neuroevolution.
// Each UFO flies a tiny neural net (5 inputs, 8 tanh hidden, 1 flap output);
// when the whole flock has crashed, a genetic algorithm (elitism, tournament
// selection, per-neuron crossover, Gaussian mutation) breeds the next one.
//
// Controls: 1-4 = speed 1x/2x/5x/10x, R = new flock, Esc/Q = end session;
// on-canvas buttons do the same for touch. Score = most pipes any UFO has
// passed this session. The session ends after 40 generations with a summary.
//
// ?debug=1 seeds evolution (?seed=N, default 1) so runs are reproducible, and
// exposes state plus actions (setSpeed, reset, runGenerations, end) on
// window.__arcade.
import { createSim, GA, PHYS } from './evolve/sim.js';
import { createView, LAYOUT, hit, C } from './evolve/view.js';

const SPEEDS = [1, 2, 5, 10];
const SUMMARY_TICKS = 600; // auto-finish 10 s after "evolution complete"
const SUMMARY_LOCKOUT = 45; // ignore input briefly so a held key cannot skip it

function pickSeed(debug) {
  if (debug) {
    const s = Number(new URLSearchParams(location.search).get('seed'));
    return Number.isFinite(s) && s > 0 ? s >>> 0 : 1;
  }
  return (Math.random() * 4294967296) >>> 0;
}

export default {
  id: 'EVOLVE',
  title: 'UFO Evolution',
  mode: 'landscape',
  ownHud: true,
  start(env) {
    const { ctx, W, H } = env;
    const view = createView(ctx, W, H);

    let speed = 1;
    let sim = null;
    let sessionBest = 0;
    let ended = false;
    let phase = 'run'; // 'run' | 'complete'
    let summaryTicks = 0;
    let summaryLines = [];
    let fastForward = false; // debug runGenerations: skip visuals and sound
    let tickCount = 0;
    let lastRecordSfx = -99;
    let recordFlash = 0;
    let bannerText = '';
    let bannerSub = '';
    let bannerTicks = 0;
    const rings = [];
    const perf = { worstMs: 0, totalMs: 0, ticks: 0, worstSpeed: 1 };

    env.onScore(0);

    const hooks = {
      onDeath(u) {
        if (fastForward || speed > 2 || rings.length > 60) return;
        rings.push({ x: PHYS.ufoX, y: u.y, life: 18, max: 18, color: C.ufo });
      },
      onRecord(record) {
        if (record > sessionBest) {
          sessionBest = record;
          env.onScore(sessionBest);
          if (!fastForward) {
            recordFlash = 32;
            if (tickCount - lastRecordSfx > 8) {
              lastRecordSfx = tickCount;
              env.audio.play('evolve-record', (h) => h.seq([
                { f: 880, type: 'triangle', vol: 0.07 },
                { f: 1318, type: 'triangle', vol: 0.07 },
              ], 0.06));
            }
          }
        }
      },
      onGenerationEnd(stats) {
        if (fastForward) return;
        const cleared = stats.bestPipes >= GA.pipeCap;
        bannerText = `GENERATION ${stats.gen + 1}`;
        bannerSub = cleared ? `COURSE CLEARED: ${stats.survivors} MADE IT` : `LAST BEST: ${stats.bestPipes} PIPES`;
        bannerTicks = 100;
        if (speed <= 2) {
          env.audio.play('evolve-gen', (h) => h.tone({ f: 220, slideTo: 330, dur: 0.18, type: 'triangle', vol: 0.06 }));
        }
      },
    };

    function newFlock(seed) {
      sim = createSim({ W, H, seed: seed ?? pickSeed(env.debug), hooks });
      phase = 'run';
      summaryTicks = 0;
      rings.length = 0;
      bannerText = 'GENERATION 1';
      bannerSub = 'RANDOM BRAINS';
      bannerTicks = 120;
    }

    function enterSummary() {
      phase = 'complete';
      summaryTicks = 0;
      const h = sim.history;
      const first10 = h.find((s) => s.bestPipes >= 10);
      const last = h[h.length - 1];
      summaryLines = [
        `${h.length} GENERATIONS OF 60 UFOS`,
        `FLOCK RECORD: ${sim.record} PIPES, GEN ${sim.recordGen}`,
        first10 ? `FIRST 10-PIPE FLIER: GEN ${first10.gen}` : 'NO UFO REACHED 10 PIPES',
        `FINAL GEN: ${last.cleared10} OF 60 PASSED 10 PIPES`,
      ];
      env.fx.burst(W / 2, 120, 40, C.amber, [1, 4], [30, 60]);
      env.fx.burst(W / 2, 120, 30, C.bloom, [1, 4], [30, 60]);
      env.audio.play('evolve-complete', (h2) => h2.seq([
        { f: 523, type: 'triangle', vol: 0.08 },
        { f: 659, type: 'triangle', vol: 0.08 },
        { f: 784, type: 'triangle', vol: 0.08 },
        { f: 1046, type: 'triangle', vol: 0.09 },
      ], 0.1));
    }

    function end() {
      if (ended) return;
      ended = true;
      env.onGameOver(sessionBest);
    }

    function setSpeed(m) {
      if (SPEEDS.includes(m)) speed = m;
    }

    function reset(seed) {
      newFlock(seed);
      env.audio.play('evolve-reset', (h) => h.tone({ f: 330, slideTo: 165, dur: 0.15, type: 'triangle', vol: 0.06 }));
    }

    env.input.onKeyDown((e) => {
      if (ended) return;
      if (phase === 'complete') {
        if (summaryTicks > SUMMARY_LOCKOUT) end();
        return;
      }
      const k = e.key;
      if (k === 'Escape' || k === 'q' || k === 'Q') end();
      else if (k === 'r' || k === 'R') reset();
      else if (k >= '1' && k <= '4') setSpeed(SPEEDS[Number(k) - 1]);
    });

    const press = (x, y) => {
      if (ended) return;
      if (phase === 'complete') {
        if (summaryTicks > SUMMARY_LOCKOUT) end();
        return;
      }
      for (const b of LAYOUT.speeds) if (hit(b, x, y)) return setSpeed(b.mult);
      if (hit(LAYOUT.reset, x, y)) return reset();
      if (hit(LAYOUT.end, x, y)) return end();
    };
    env.input.onClick(press);
    env.input.onTap(press);

    newFlock();

    const state = {
      get gen() { return sim.gen; },
      get alive() { return sim.alive; },
      get total() { return sim.ufos.length; },
      get genBestPipes() { return sim.pipesPassed; },
      get flockRecord() { return sim.record; },
      get allTimeBest() { return sessionBest; },
      get speed() { return speed; },
      get seed() { return sim.seed; },
      get phase() { return phase; },
      get history() { return sim.history.map((s) => ({ ...s })); },
      get perf() {
        return { worstMs: perf.worstMs, avgMs: perf.ticks ? perf.totalMs / perf.ticks : 0, ticks: perf.ticks, worstSpeed: perf.worstSpeed };
      },
      get leader() {
        const u = sim.leader();
        return u ? { y: u.y, out: u.out, flap: u.flap, inputs: [...u.inputs], hidden: [...u.hidden] } : null;
      },
    };
    env.expose(state);
    env.exposeActions({
      setSpeed,
      reset,
      end,
      resetPerf() { perf.worstMs = 0; perf.totalMs = 0; perf.ticks = 0; },
      // Simulate n whole generations synchronously (no drawing), for tests.
      runGenerations(n = 1) {
        fastForward = true;
        try {
          const target = sim.history.length + n;
          while (!sim.done && sim.history.length < target) sim.step();
        } finally {
          fastForward = false;
        }
        if (sim.done && phase === 'run') enterSummary();
        return state.history;
      },
    });

    return {
      tick() {
        if (ended) return;
        const t0 = performance.now();
        tickCount++;

        if (phase === 'run') {
          for (let i = 0; i < speed && !sim.done; i++) sim.step();
          if (sim.done) enterSummary();
        } else {
          summaryTicks++;
        }

        view.background(phase === 'run' ? speed : 0);
        view.pipes(sim);
        view.rings(rings);
        const leader = sim.leader();
        view.flock(sim, leader);
        view.hud(sim, sessionBest, recordFlash);
        view.brain(leader);
        view.sparkline(sim.history);
        view.controls(speed);
        if (bannerTicks > 0 && phase === 'run') {
          view.banner(bannerText, Math.min(1, bannerTicks / 40), bannerSub);
          bannerTicks--;
        }
        if (recordFlash > 0) recordFlash--;

        if (phase === 'complete') {
          view.summary(summaryLines, sim, (summaryTicks >> 5) % 2 === 0);
          env.fx.updateAndDraw();
          if (summaryTicks >= SUMMARY_TICKS) {
            end();
            return;
          }
        }

        const dt = performance.now() - t0;
        perf.ticks++;
        perf.totalMs += dt;
        if (dt > perf.worstMs) { perf.worstMs = dt; perf.worstSpeed = speed; }
      },
    };
  },
};
