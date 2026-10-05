// The learning agent's world: Mesa Lander's physics in a fixed scenario (one mesa
// in a flat desert, the pad on its top), turned into the usual reinforcement-
// learning loop: reset() -> observation, step(action) -> reward and done.
//
// This is the scenario the AI mode draws on screen, nothing hidden: same lander,
// same engines, same landing limits as the player's first level. It differs from
// the player's levels in three stated ways: the world is one mesa wide, every
// attempt starts from a random position and speed above it, and the tank never
// runs dry (burning fuel costs reward instead).
import {
  makeTerrain, makeLander, resetLander, stepLander, altitude,
  LEFT, MAIN, RIGHT, FLYING, LANDED, CRASHED, LOST,
} from './physics.js';

export const AI_WORLD = { W: 560, floor: 440, mesa: { cx: 280, top: 330, topW: 150 }, padWidth: 96 };

export function aiTerrain() {
  return makeTerrain({ W: AI_WORLD.W, floor: AI_WORLD.floor, mesas: [AI_WORLD.mesa], padWidth: AI_WORLD.padWidth });
}

// Where an attempt may begin: [min, max] for each quantity, drawn uniformly.
export const START = {
  x: [100, 460], y: [50, 290], vx: [-45, 45], vy: [0, 35], a: [-0.3, 0.3], w: [-0.4, 0.4],
};

// The four actions the agent chooses between, in the order of the policy's outputs.
export const ACTIONS = ['none', 'left', 'main', 'right'];
export const ACTION_CTL = [0, LEFT, MAIN, RIGHT];

export const OBS_DIM = 9;

// Reward: a score for how the attempt ends, shaping that pays for getting closer,
// slower and more upright, and a small price on running the engines.
export const REWARD = {
  gamma: 0.99,
  land: 30,
  crash: 10, // the worst crash, and drifting out of the world
  crashMin: 3, // a crash at zero speed costs this much; it grows with the impact speed
  crashRef: 120, // px/s at which a crash costs the full amount
  dist: 5, // potential per 200 px from the pad
  speed: 0.5, // potential per 100 px/s
  tilt: 2, // potential per radian
  main: 0.1, // per decision with the main engine on
  side: 0.01, // per decision with a side thruster on
  time: 0.05, // per decision
};

// The agent decides every `skip` ticks (20 times a second at 3) and holds its action in between.
export const SETUP = { skip: 3, maxTicks: 1800 }; // an attempt that has not ended after maxTicks is cut off

const clip = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The agent's view of the lander, scaled to about [-1, 1]. */
export function observe(s, t, out) {
  const dx = s.x - t.pad.cx;
  const alt = altitude(s, t);
  out[0] = clip(dx / 250, -2, 2);
  out[1] = clip(alt / 250, -1, 2);
  out[2] = clip(s.vx / 120, -2, 2);
  out[3] = clip(s.vy / 120, -2, 2);
  out[4] = Math.sin(s.a);
  out[5] = Math.cos(s.a);
  out[6] = clip(s.w / 2, -1.5, 1.5);
  out[7] = clip(dx / 60, -1, 1);
  out[8] = clip(alt / 60, -1, 1);
}

export class MesaEnv {
  /** @param {{ rng: () => number, terrain?: ReturnType<typeof aiTerrain>, skip?: number, maxTicks?: number }} o */
  constructor({ rng, terrain = aiTerrain(), skip = SETUP.skip, maxTicks = SETUP.maxTicks }) {
    this.rng = rng;
    this.terrain = terrain;
    this.skip = skip;
    this.maxTicks = maxTicks;
    this.s = makeLander({ fuel: Infinity });
    this.reward = 0;
    this.done = false;
    this.truncated = false;
    this.outcome = FLYING; // LANDED, CRASHED or LOST once done
    this.phi = 0;
    this.decisions = 0;
  }

  /** Start a new attempt from a random position and speed; writes the observation. */
  reset(out) {
    const r = this.rng;
    const pick = (b) => b[0] + (b[1] - b[0]) * r();
    resetLander(this.s, {
      x: pick(START.x), y: pick(START.y), vx: pick(START.vx), vy: pick(START.vy),
      a: pick(START.a), w: pick(START.w), fuel: Infinity,
    });
    this.done = false;
    this.truncated = false;
    this.outcome = FLYING;
    this.reward = 0;
    this.decisions = 0;
    this.phi = this.potential();
    if (out) observe(this.s, this.terrain, out);
  }

  potential() {
    const s = this.s;
    const dx = (s.x - this.terrain.pad.cx) / 200;
    const alt = altitude(s, this.terrain) / 200;
    const vx = s.vx / 100;
    const vy = s.vy / 100;
    return -(REWARD.dist * Math.sqrt(dx * dx + alt * alt)
      + REWARD.speed * Math.sqrt(vx * vx + vy * vy)
      + REWARD.tilt * Math.abs(s.a));
  }

  /** Hold `action` for one decision (a few ticks); sets reward/done/truncated/outcome. */
  step(action, out) {
    const s = this.s;
    const ctl = ACTION_CTL[action];
    let st = FLYING;
    for (let k = 0; k < this.skip; k++) {
      st = stepLander(s, ctl, this.terrain, 0);
      if (st !== FLYING) break;
    }
    this.decisions++;
    let r = -REWARD.time;
    if (action === 2) r -= REWARD.main;
    else if (action !== 0) r -= REWARD.side;
    const phi = this.potential();
    r += REWARD.gamma * phi - this.phi;
    this.phi = phi;
    this.truncated = false;
    if (st === LANDED) {
      r += REWARD.land;
      this.done = true;
      this.outcome = LANDED;
    } else if (st === CRASHED || st === LOST) {
      // A harder crash costs more, so "almost a landing" is worth something.
      const frac = st === LOST ? 1 : Math.min(1, s.impact.speed / REWARD.crashRef);
      r -= REWARD.crashMin + (REWARD.crash - REWARD.crashMin) * frac;
      this.done = true;
      this.outcome = st;
    } else if (s.t >= this.maxTicks) {
      this.done = true;
      this.truncated = true;
    }
    this.reward = r;
    if (out) observe(s, this.terrain, out);
    return r;
  }
}
