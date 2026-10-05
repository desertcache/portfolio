// The headless world: Flappy UFO's physics run for a whole flock at once,
// plus the genetic algorithm that breeds the next flock. No drawing here, and
// no Math.random: a seed fully determines every generation, independent of
// how many steps the game runs per frame.
import { mulberry32, hashSeed } from './rng.js';
import { INPUTS, HIDDEN, randomGenome, forward, crossover, mutate } from './brain.js';

// Flappy UFO's numbers (games/flappy.js), so the two feel like siblings. The
// one addition: the gap starts at Flappy's 200px and narrows 2px per pipe to a
// 120px floor, so a flock that masters the easy opening still has room to
// improve and a perfect flier cannot fly forever.
export const PHYS = {
  gravity: 0.15,
  thrust: -4.5,
  speed: 2,
  pipeWidth: 60,
  spacing: 250,
  gapStart: 200,
  gapStep: 2,
  gapMin: 120,
  ufoX: 100,
  radius: 12,
  startY: 200,
};

export const GA = {
  popSize: 60,
  elites: 4,
  tournament: 4,
  mutationRate: 0.12,
  mutationSigma: 0.5,
  resetRate: 0.01,
  pipeBonus: 100, // fitness = frames survived + 100 per pipe passed
  pipeCap: 100, // a generation that clears this many pipes ends as a win
  maxGenerations: 40,
};

export function gapFor(k) {
  return Math.max(PHYS.gapMin, PHYS.gapStart - PHYS.gapStep * k);
}

export function createSim({ W, H, seed, hooks = {} }) {
  const P = PHYS;
  const sim = {
    W, H,
    seed: seed >>> 0,
    gen: 1,
    frame: 0,
    pipesPassed: 0,
    pipeCount: 0,
    pipes: [],
    ufos: [],
    alive: 0,
    history: [], // per finished generation
    record: 0, // best pipes by any UFO in this flock
    recordGen: 0,
    done: false,
  };

  const gaRng = mulberry32(hashSeed(sim.seed, 0xa11ce));
  let courseRng = null;
  const inputs = new Float64Array(INPUTS);

  function makeUfo(genome, elite) {
    return {
      genome,
      elite,
      y: P.startY,
      v: 0,
      alive: true,
      frames: 0,
      pipes: 0,
      fitness: 0,
      flap: false,
      out: 0,
      inputs: new Float64Array(INPUTS),
      hidden: new Float64Array(HIDDEN),
    };
  }

  function spawnPipe(x) {
    const gap = gapFor(sim.pipeCount);
    const top = sim.pipeCount === 0
      ? 200 // Flappy's opening pipe
      : Math.floor(courseRng() * (H - gap - 100)) + 50;
    sim.pipes.push({ x, top, gap, scored: false, index: sim.pipeCount });
    sim.pipeCount++;
  }

  function beginGeneration(genomes, eliteCount) {
    courseRng = mulberry32(hashSeed(sim.seed, sim.gen));
    sim.frame = 0;
    sim.pipesPassed = 0;
    sim.pipeCount = 0;
    sim.pipes = [];
    spawnPipe(W);
    sim.ufos = genomes.map((g, i) => makeUfo(g, i < eliteCount));
    sim.alive = sim.ufos.length;
  }

  function nextPipe() {
    for (let i = 0; i < sim.pipes.length; i++) {
      const p = sim.pipes[i];
      if (p.x + P.pipeWidth > P.ufoX - P.radius) return p;
    }
    return sim.pipes[sim.pipes.length - 1];
  }

  function kill(u) {
    u.alive = false;
    u.fitness = u.frames + GA.pipeBonus * u.pipes;
    sim.alive--;
    if (hooks.onDeath) hooks.onDeath(u);
  }

  function tournament(sorted) {
    let best = null;
    for (let i = 0; i < GA.tournament; i++) {
      const c = sorted[Math.floor(gaRng() * sorted.length)];
      if (!best || c.fitness > best.fitness) best = c;
    }
    return best;
  }

  function endGeneration() {
    for (const u of sim.ufos) {
      if (u.alive) u.fitness = u.frames + GA.pipeBonus * u.pipes;
    }
    const sorted = [...sim.ufos].sort((a, b) => b.fitness - a.fitness);
    let sum = 0;
    for (const u of sorted) sum += u.fitness;
    const stats = {
      gen: sim.gen,
      bestPipes: sorted[0].pipes,
      bestFitness: sorted[0].fitness,
      meanFitness: sum / sorted.length,
      survivors: sim.alive,
      frames: sim.frame,
      cleared10: sorted.filter((u) => u.pipes >= 10).length,
    };
    sim.history.push(stats);
    if (hooks.onGenerationEnd) hooks.onGenerationEnd(stats);

    if (sim.history.length >= GA.maxGenerations) {
      sim.done = true;
      return;
    }

    const genomes = [];
    for (let i = 0; i < GA.elites; i++) genomes.push(Float64Array.from(sorted[i].genome));
    while (genomes.length < GA.popSize) {
      const a = tournament(sorted);
      const b = tournament(sorted);
      const child = crossover(a.genome, b.genome, gaRng);
      mutate(child, gaRng, GA.mutationRate, GA.mutationSigma, GA.resetRate);
      genomes.push(child);
    }
    sim.gen++;
    beginGeneration(genomes, GA.elites);
  }

  // One 60 Hz physics step for the whole flock (Flappy UFO's update order).
  sim.step = function step() {
    if (sim.done) return;
    sim.frame++;
    const p = nextPipe();
    const dx = (p.x + P.pipeWidth - P.ufoX) / W;
    const top = p.top / H;
    const bottom = (p.top + p.gap) / H;

    for (const u of sim.ufos) {
      if (!u.alive) continue;
      const inp = u.inputs;
      inp[0] = u.y / H;
      inp[1] = u.v / 10;
      inp[2] = dx;
      inp[3] = top;
      inp[4] = bottom;
      u.out = forward(u.genome, inp, u.hidden);
      u.flap = u.out > 0.5;
      if (u.flap) u.v = P.thrust;
      u.v += P.gravity;
      u.y += u.v;
      u.frames++;
    }

    for (const pipe of sim.pipes) pipe.x -= P.speed;

    for (const u of sim.ufos) {
      if (!u.alive) continue;
      let dead = u.y > H || u.y < 0;
      if (!dead) {
        for (const pipe of sim.pipes) {
          if (P.ufoX + P.radius > pipe.x && P.ufoX - P.radius < pipe.x + P.pipeWidth) {
            if (u.y - P.radius < pipe.top || u.y + P.radius > pipe.top + pipe.gap) { dead = true; break; }
          }
        }
      }
      if (dead) kill(u);
    }

    for (const pipe of sim.pipes) {
      if (!pipe.scored && pipe.x + P.pipeWidth / 2 < P.ufoX) {
        pipe.scored = true;
        if (sim.alive > 0) {
          sim.pipesPassed++;
          for (const u of sim.ufos) if (u.alive) u.pipes = sim.pipesPassed;
          if (sim.pipesPassed > sim.record) {
            sim.record = sim.pipesPassed;
            sim.recordGen = sim.gen;
            if (hooks.onRecord) hooks.onRecord(sim.record);
          }
        }
      }
    }

    const last = sim.pipes[sim.pipes.length - 1];
    if (last && last.x < W - P.spacing) spawnPipe(W);
    if (sim.pipes[0] && sim.pipes[0].x < -P.pipeWidth) sim.pipes.shift();

    if (sim.alive === 0 || sim.pipesPassed >= GA.pipeCap) endGeneration();
  };

  // The live UFO the panel follows: the first one alive. The population is
  // ordered elites-first (best parent first), so this is the flock's champion
  // until it crashes, then the next in line.
  sim.leader = function leader() {
    for (const u of sim.ufos) if (u.alive) return u;
    return sim.ufos[0];
  };

  const first = [];
  for (let i = 0; i < GA.popSize; i++) first.push(randomGenome(gaRng));
  beginGeneration(first, 0);

  return sim;
}
