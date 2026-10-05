// A UFO's brain: a fixed-shape feed-forward net, stored as one flat genome so
// crossover and mutation are plain array operations.
//
//   5 inputs -> 8 hidden (tanh) -> 1 output (sigmoid); output > 0.5 = flap.
//
// Genome layout: [W1 (HIDDEN x INPUTS, row per hidden node) | b1 (HIDDEN) |
//                 W2 (HIDDEN) | b2 (1)]
import { gaussian } from './rng.js';

export const INPUTS = 5;
export const HIDDEN = 8;
export const INPUT_LABELS = ['Y', 'VY', 'DX', 'TOP', 'BOT'];

const W1 = 0;
const B1 = W1 + HIDDEN * INPUTS;
const W2 = B1 + HIDDEN;
const B2 = W2 + HIDDEN;
export const GENES = B2 + 1; // 57

export const layout = { W1, B1, W2, B2 };

export function randomGenome(rng) {
  const g = new Float64Array(GENES);
  for (let i = 0; i < GENES; i++) g[i] = gaussian(rng);
  return g;
}

// Runs the net. Writes hidden activations into `hidden` (for the live brain
// panel) and returns the sigmoid output in [0, 1].
export function forward(g, inputs, hidden) {
  let out = g[B2];
  for (let h = 0; h < HIDDEN; h++) {
    let s = g[B1 + h];
    const row = W1 + h * INPUTS;
    for (let i = 0; i < INPUTS; i++) s += g[row + i] * inputs[i];
    const a = Math.tanh(s);
    hidden[h] = a;
    out += g[W2 + h] * a;
  }
  return 1 / (1 + Math.exp(-out));
}

// Uniform crossover, but per hidden neuron: a child inherits each hidden
// node's whole incoming row + bias + outgoing weight from one parent, so
// working feature detectors are not shredded by mixing.
export function crossover(a, b, rng) {
  const c = new Float64Array(GENES);
  for (let h = 0; h < HIDDEN; h++) {
    const src = rng() < 0.5 ? a : b;
    const row = W1 + h * INPUTS;
    for (let i = 0; i < INPUTS; i++) c[row + i] = src[row + i];
    c[B1 + h] = src[B1 + h];
    c[W2 + h] = src[W2 + h];
  }
  c[B2] = rng() < 0.5 ? a[B2] : b[B2];
  return c;
}

// Gaussian mutation: each gene nudged with probability `rate`; a rare gene is
// re-rolled outright so the population cannot fully collapse.
export function mutate(g, rng, rate, sigma, resetRate) {
  for (let i = 0; i < GENES; i++) {
    const r = rng();
    if (r < resetRate) g[i] = gaussian(rng);
    else if (r < resetRate + rate) g[i] += gaussian(rng) * sigma;
  }
  return g;
}
