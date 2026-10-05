// One attempt flown live on screen. The learner trains in the background on its own
// headless copy of the world; this is the picture of it: a frozen copy of the latest
// brain flies one attempt at a time, tick by tick, in the very same world and by the
// very same rules. It samples its actions from the policy exactly as the learner does
// (no "best move only" polish), so the landing rate you watch is the honest one.
//
// Pure module: no DOM, no Math.random. The caller supplies the random stream.
import { MesaEnv, OBS_DIM, SETUP, ACTION_CTL, observe } from './env.js';
import { Mlp } from './net.js';
import { softmax, N_ACTIONS } from './learn.js';
import { stepLander, FLYING } from './physics.js';

/** An attempt that has not ended after SETUP.maxTicks is cut off, as in training. */
export const TIMEOUT = 4;

export class Flight {
  /** @param {{ rng: () => number, terrain: ReturnType<import('./env.js').aiTerrain>, hidden: number }} o */
  constructor({ rng, terrain, hidden }) {
    this.rng = rng;
    this.env = new MesaEnv({ rng, terrain });
    this.terrain = terrain;
    this.s = this.env.s; // the lander
    this.actor = new Mlp(OBS_DIM, hidden, hidden, N_ACTIONS);
    this.critic = new Mlp(OBS_DIM, hidden, hidden, 1);
    this.obs = new Float64Array(OBS_DIM);
    this.probs = new Float64Array(N_ACTIONS).fill(1 / N_ACTIONS);
    this.value = 0; // what the critic expects from here
    this.action = 0; // the action being held
    this.ctl = 0;
    this.status = FLYING; // FLYING, then LANDED / CRASHED / LOST / TIMEOUT
    this.version = 0; // how many rounds of learning the brain had behind it
    this.ticks = 0;
    this.decisions = 0;
    this.since = 0; // ticks since the last decision
    this.trail = []; // x, y, x, y ... one point every other tick
    this.values = []; // the critic's value at each decision
  }

  /** Take a frozen copy of the learner's latest published brain. */
  adopt(learner) {
    this.actor.copyFrom(learner.pubActor);
    this.critic.copyFrom(learner.pubCritic);
    this.version = learner.updates;
  }

  /** Start a new attempt from a random position with the learner's latest brain. */
  begin(learner) {
    this.adopt(learner);
    this.restart();
  }

  /** Start a new attempt with the brain already held (same random stream). */
  restart() {
    this.env.reset(this.obs);
    this.status = FLYING;
    this.ticks = 0;
    this.decisions = 0;
    this.since = 0;
    this.trail = [this.s.x, this.s.y];
    this.values = [];
    this.decide();
  }

  /** Look, then choose: the action probabilities and the value come from the same moment. */
  decide() {
    observe(this.s, this.terrain, this.obs);
    const z = this.actor.forward(this.obs, 0);
    softmax(z, this.probs);
    const u = this.rng();
    let a = 0;
    let c = this.probs[0];
    while (u > c && a < N_ACTIONS - 1) c += this.probs[++a];
    this.action = a;
    this.ctl = ACTION_CTL[a];
    this.value = this.critic.forward(this.obs, 0)[0];
    this.values.push(this.value);
    this.decisions++;
  }

  /** One physics tick (1/60 s). The brain decides every SETUP.skip ticks. Returns the status. */
  tick() {
    if (this.status !== FLYING) return this.status;
    const st = stepLander(this.s, this.ctl, this.terrain, 0);
    this.ticks++;
    if ((this.ticks & 1) === 0 || st !== FLYING) this.trail.push(this.s.x, this.s.y);
    if (st !== FLYING) {
      this.status = st;
    } else if (this.s.t >= this.env.maxTicks) {
      this.status = TIMEOUT;
    } else if (++this.since >= SETUP.skip) {
      this.since = 0;
      this.decide();
    }
    return this.status;
  }
}
