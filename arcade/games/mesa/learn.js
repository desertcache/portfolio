// The learner: Proximal Policy Optimization (PPO), written out by hand.
//
//   policy  (actor):  observation -> four action scores -> softmax -> probabilities
//   critic  (value):  observation -> one number, the return it expects from here
//
// It flies attempts in a headless copy of the world (env.js), keeps everything it
// saw for about 2048 decisions, works out for each decision how much better or
// worse than expected things went (generalized advantage estimation), then nudges
// the policy a few times toward the choices that did better, never by too much in
// one go (the clipped objective), and nudges the critic toward what really
// happened. Then it flies the next batch with the improved policy.
//
// The learner is a state machine that does its work in small units (16 decisions,
// or 64 training samples), so a game can hand it a few milliseconds a frame and
// pick up where it left off. The order of every random draw is fixed, so a seed
// reproduces a run exactly no matter how the work was cut into frames.
import { mulberry32, hashSeed } from './rng.js';
import { Mlp, Adam } from './net.js';
import { MesaEnv, OBS_DIM, aiTerrain } from './env.js';
import { LANDED } from './physics.js';

export const N_ACTIONS = 4;

export const HYPER = {
  hidden: 32, // tanh units in each of the two hidden layers
  rollout: 2048, // decisions gathered before each round of learning
  epochs: 6, // passes over those decisions
  minibatch: 256,
  lr: 1.5e-3,
  gamma: 0.99,
  lambda: 0.95,
  clip: 0.2, // how far the policy may move per update (ratio within 1 +/- clip)
  entropy: 0.05, // bonus for staying a little unsure, at the start ...
  entropyEnd: 0.01, // ... and after `entropyUpdates` rounds of learning
  entropyUpdates: 100,
  vfCoef: 0.5,
  maxGradNorm: 0.5,
  targetKl: 0, // 0: never stop an update early
  chunk: 64, // samples per unit of update work
  outGain: 0.01, // the policy starts out nearly uniform
  collectUnit: 16, // decisions per unit of collection work
};

const COLLECT = 0;
const UPDATE = 1;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Learner {
  /**
   * @param {{ seed?: number, hyper?: Partial<typeof HYPER>, terrain?: ReturnType<typeof aiTerrain>,
   *   onEpisode?: (outcome: number, info: { ret: number, decisions: number, speed: number }) => void }} o
   */
  constructor({ seed = 1, hyper = {}, terrain = aiTerrain(), onEpisode = null } = {}) {
    const h = (this.h = { ...HYPER, ...hyper });
    this.seed = seed >>> 0;
    this.rng = mulberry32(hashSeed(this.seed, 0x1a2d));
    this.onEpisode = onEpisode;
    const D = OBS_DIM;

    this.actor = new Mlp(D, h.hidden, h.hidden, N_ACTIONS);
    this.critic = new Mlp(D, h.hidden, h.hidden, 1);
    this.actor.init(this.rng, h.outGain);
    this.critic.init(this.rng, 1);
    this.actorOpt = new Adam(this.actor);
    this.criticOpt = new Adam(this.critic);

    // The brain the game shows is a copy refreshed after each round of learning, so
    // a picture never sees a half-updated network.
    this.pubActor = new Mlp(D, h.hidden, h.hidden, N_ACTIONS);
    this.pubCritic = new Mlp(D, h.hidden, h.hidden, 1);
    this.pubActor.copyFrom(this.actor);
    this.pubCritic.copyFrom(this.critic);

    this.env = new MesaEnv({ rng: this.rng, terrain });
    const N = h.rollout;
    this.bufObs = new Float64Array(N * D);
    this.bufAct = new Int32Array(N);
    this.bufLogp = new Float64Array(N);
    this.bufVal = new Float64Array(N);
    this.bufRew = new Float64Array(N);
    this.bufDone = new Uint8Array(N); // the attempt ended after this decision
    this.bufTerm = new Uint8Array(N); // ... for real (not just cut off by the clock)
    this.bufBoot = new Float64Array(N); // value of the next state after a cut-off
    this.adv = new Float64Array(N);
    this.ret = new Float64Array(N);
    this.perm = new Int32Array(N);
    this.obs = new Float64Array(D);
    this.next = new Float64Array(D);
    this.probs = new Float64Array(N_ACTIONS);
    this.dz = new Float64Array(N_ACTIONS);
    this.dv = new Float64Array(1);

    this.phase = COLLECT;
    this.t = 0; // decisions gathered in this batch
    this.epoch = 0;
    this.mbStart = 0;
    this.mbPos = 0;

    // Progress counters (these are what the screen and the gate report).
    this.steps = 0; // decisions made, all batches
    this.episodes = 0; // attempts finished
    this.landings = 0;
    this.updates = 0;
    this.ticks = 0; // physics ticks flown
    this.ring = new Uint8Array(100); // outcome of the last 100 attempts, 1 = landed
    this.ringN = 0;
    this.epRet = 0;
    this.returns = []; // return of the last attempts (a short window)
    this.history = []; // [{ episodes, steps, rate }] after each round of learning
    this.ustats = { pg: 0, vf: 0, ent: 0, kl: 0, clipFrac: 0, gradA: 0, gradC: 0, n: 0, explVar: 0 };
    this.stats = { ...this.ustats };

    this.env.reset(this.obs);
  }

  /** Share of the last `n` attempts (at most 100) that landed; 0 before any attempt. */
  rate(n = 50) {
    const m = Math.min(n, this.ringN, this.ring.length);
    if (m === 0) return 0;
    let c = 0;
    const len = this.ring.length;
    for (let i = 0; i < m; i++) c += this.ring[(this.ringN - 1 - i) % len];
    return c / m;
  }

  /**
   * The shown brain's view of an observation: action probabilities into `probs`,
   * returns the critic's value. Uses the copy published after the last update.
   */
  infer(obs, probs) {
    const z = this.pubActor.forward(obs, 0);
    softmax(z, probs);
    return this.pubCritic.forward(obs, 0)[0];
  }

  /** Do units of work until `ms` milliseconds have passed; returns the units done. */
  work(ms) {
    const t0 = now();
    let units = 0;
    do {
      this.advance();
      units++;
    } while (now() - t0 < ms);
    return units;
  }

  /** One unit of work: 16 decisions while collecting, or 64 training samples. */
  advance() {
    if (this.phase === COLLECT) {
      const n = Math.min(this.h.collectUnit, this.h.rollout - this.t);
      for (let i = 0; i < n; i++) this.collectStep();
      if (this.t >= this.h.rollout) this.beginUpdate();
    } else {
      this.updateChunk();
    }
  }

  /** Run whole units until at least `n` more decisions have been made (for tests and the gate). */
  runSteps(n) {
    const target = this.steps + n;
    while (this.steps < target) this.advance();
  }

  collectStep() {
    const D = OBS_DIM;
    const i = this.t;
    const obs = this.obs;
    this.bufObs.set(obs, i * D);
    const z = this.actor.forward(obs, 0);
    const probs = this.probs;
    softmax(z, probs);
    const u = this.rng();
    let a = 0;
    let c = probs[0];
    while (u > c && a < N_ACTIONS - 1) c += probs[++a];
    this.bufAct[i] = a;
    this.bufLogp[i] = Math.log(probs[a] + 1e-12);
    this.bufVal[i] = this.critic.forward(obs, 0)[0];

    const env = this.env;
    const r = env.step(a, this.next);
    this.bufRew[i] = r;
    this.epRet += r;
    this.steps++;
    this.t++;
    if (env.done) {
      this.bufDone[i] = 1;
      if (env.truncated) {
        this.bufTerm[i] = 0;
        this.bufBoot[i] = this.critic.forward(this.next, 0)[0];
      } else {
        this.bufTerm[i] = 1;
        this.bufBoot[i] = 0;
      }
      this.finishEpisode();
      env.reset(this.obs);
    } else {
      this.bufDone[i] = 0;
      this.bufTerm[i] = 0;
      this.bufBoot[i] = 0;
      this.obs.set(this.next);
    }
  }

  finishEpisode() {
    const env = this.env;
    const landed = env.outcome === LANDED ? 1 : 0;
    this.ring[this.ringN % this.ring.length] = landed;
    this.ringN++;
    this.episodes++;
    this.landings += landed;
    this.ticks += env.s.t;
    this.returns.push(this.epRet);
    if (this.returns.length > 50) this.returns.shift();
    if (this.onEpisode) {
      this.onEpisode(env.outcome, { ret: this.epRet, decisions: env.decisions, speed: env.s.impact.speed });
    }
    this.epRet = 0;
  }

  // Work out, for every decision, how much better than expected it turned out.
  beginUpdate() {
    const { rollout: N, gamma, lambda } = this.h;
    const lastVal = this.critic.forward(this.obs, 0)[0];
    let adv = 0;
    for (let i = N - 1; i >= 0; i--) {
      let nextV;
      if (this.bufDone[i]) {
        nextV = this.bufBoot[i];
        adv = 0;
      } else {
        nextV = i === N - 1 ? lastVal : this.bufVal[i + 1];
      }
      const delta = this.bufRew[i] + gamma * nextV - this.bufVal[i];
      adv = delta + gamma * lambda * adv;
      this.adv[i] = adv;
      this.ret[i] = adv + this.bufVal[i];
    }
    // Standardize the advantages over the batch.
    let mean = 0;
    for (let i = 0; i < N; i++) mean += this.adv[i];
    mean /= N;
    let varr = 0;
    for (let i = 0; i < N; i++) varr += (this.adv[i] - mean) ** 2;
    const sd = Math.sqrt(varr / N) + 1e-8;
    for (let i = 0; i < N; i++) this.adv[i] = (this.adv[i] - mean) / sd;
    // Explained variance of the critic on this batch (1 is perfect).
    let rm = 0;
    for (let i = 0; i < N; i++) rm += this.ret[i];
    rm /= N;
    let rv = 0;
    let ev = 0;
    for (let i = 0; i < N; i++) {
      rv += (this.ret[i] - rm) ** 2;
      ev += (this.ret[i] - this.bufVal[i]) ** 2;
    }
    this.ustats = { pg: 0, vf: 0, ent: 0, kl: 0, clipFrac: 0, gradA: 0, gradC: 0, n: 0, mb: 0, explVar: rv > 0 ? 1 - ev / rv : 0 };
    for (let i = 0; i < N; i++) this.perm[i] = i;
    this.shuffle();
    // The bonus for staying unsure fades as the rounds go by.
    const fade = Math.min(1, this.updates / Math.max(1, this.h.entropyUpdates));
    this.entCoef = this.h.entropy + (this.h.entropyEnd - this.h.entropy) * fade;
    this.epoch = 0;
    this.mbStart = 0;
    this.mbPos = 0;
    this.epochKl = 0;
    this.epochN = 0;
    this.phase = UPDATE;
  }

  shuffle() {
    const perm = this.perm;
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
  }

  // Train on the next `chunk` samples of the current minibatch.
  updateChunk() {
    const h = this.h;
    const D = OBS_DIM;
    const mbSize = h.minibatch;
    const end = Math.min(this.mbPos + h.chunk, this.mbStart + mbSize);
    const inv = 1 / mbSize;
    const actor = this.actor;
    const critic = this.critic;
    const probs = this.probs;
    const dz = this.dz;
    const dv = this.dv;
    const us = this.ustats;
    const clipLo = 1 - h.clip;
    const clipHi = 1 + h.clip;
    for (let pos = this.mbPos; pos < end; pos++) {
      const i = this.perm[pos];
      const z = actor.forward(this.bufObs, i * D);
      softmax(z, probs);
      const a = this.bufAct[i];
      const logpNew = Math.log(probs[a] + 1e-12);
      const ratio = Math.exp(logpNew - this.bufLogp[i]);
      const A = this.adv[i];
      const active = A >= 0 ? ratio < clipHi : ratio > clipLo;
      const coef = active ? -A * ratio * inv : 0;
      let H = 0;
      for (let j = 0; j < N_ACTIONS; j++) H -= probs[j] * Math.log(probs[j] + 1e-12);
      for (let j = 0; j < N_ACTIONS; j++) {
        dz[j] = coef * ((j === a ? 1 : 0) - probs[j]) + this.entCoef * inv * probs[j] * (Math.log(probs[j] + 1e-12) + H);
      }
      actor.backward(this.bufObs, i * D, dz);

      const v = critic.forward(this.bufObs, i * D)[0];
      const err = v - this.ret[i];
      dv[0] = h.vfCoef * err * inv;
      critic.backward(this.bufObs, i * D, dv);

      us.pg += -Math.min(A * ratio, A * Math.min(Math.max(ratio, clipLo), clipHi));
      us.vf += 0.5 * err * err;
      us.ent += H;
      const kl = ratio - 1 - (logpNew - this.bufLogp[i]);
      us.kl += kl;
      this.epochKl += kl;
      this.epochN++;
      if (ratio < clipLo || ratio > clipHi) us.clipFrac++;
      us.n++;
    }
    this.mbPos = end;
    if (end < this.mbStart + mbSize) return;

    // The minibatch is complete: one optimizer step for each network.
    const lr = h.lr;
    us.gradA += this.actorOpt.step(lr, h.maxGradNorm);
    us.gradC += this.criticOpt.step(lr, h.maxGradNorm);
    us.mb++;
    this.mbStart = end;
    if (end < h.rollout) return;

    // End of an epoch.
    this.epoch++;
    const stop = h.targetKl > 0 && this.epochKl / Math.max(1, this.epochN) > h.targetKl;
    this.epochKl = 0;
    this.epochN = 0;
    if (this.epoch >= h.epochs || stop) {
      this.finishUpdate();
    } else {
      this.shuffle();
      this.mbStart = 0;
      this.mbPos = 0;
    }
  }

  finishUpdate() {
    const us = this.ustats;
    const n = Math.max(1, us.n);
    this.stats = {
      pg: us.pg / n, vf: us.vf / n, ent: us.ent / n, kl: us.kl / n, clipFrac: us.clipFrac / n,
      gradA: us.gradA / Math.max(1, us.mb), gradC: us.gradC / Math.max(1, us.mb), explVar: us.explVar,
    };
    this.updates++;
    this.pubActor.copyFrom(this.actor);
    this.pubCritic.copyFrom(this.critic);
    this.history.push({ episodes: this.episodes, steps: this.steps, rate: this.rate(50) });
    this.phase = COLLECT;
    this.t = 0;
  }
}

/** Softmax of z (length 4) into p, with the usual max-shift for stability. */
export function softmax(z, p) {
  let m = z[0];
  for (let j = 1; j < N_ACTIONS; j++) if (z[j] > m) m = z[j];
  let sum = 0;
  for (let j = 0; j < N_ACTIONS; j++) {
    const e = Math.exp(z[j] - m);
    p[j] = e;
    sum += e;
  }
  const inv = 1 / sum;
  for (let j = 0; j < N_ACTIONS; j++) p[j] *= inv;
}
