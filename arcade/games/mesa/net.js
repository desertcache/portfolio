// A small neural network, hand-written: two hidden layers of tanh units, flat
// typed arrays, forward pass and backprop done in tight loops. No libraries.
// The learner uses two of these (a policy and a value estimate) and an Adam
// optimizer over their flat parameter arrays.
import { gaussian } from './rng.js';

export class Mlp {
  /** @param {number} nIn @param {number} n1 @param {number} n2 @param {number} nOut */
  constructor(nIn, n1, n2, nOut) {
    this.nIn = nIn;
    this.n1 = n1;
    this.n2 = n2;
    this.nOut = nOut;
    const sizes = [n1 * nIn, n1, n2 * n1, n2, nOut * n2, nOut];
    this.size = sizes.reduce((a, b) => a + b, 0);
    this.p = new Float64Array(this.size); // all weights and biases, one array
    this.g = new Float64Array(this.size); // their gradients, accumulated by backward()
    let o = 0;
    const take = (n) => { const at = o; o += n; return at; };
    this.oW1 = take(sizes[0]);
    this.oB1 = take(sizes[1]);
    this.oW2 = take(sizes[2]);
    this.oB2 = take(sizes[3]);
    this.oW3 = take(sizes[4]);
    this.oB3 = take(sizes[5]);
    this.a1 = new Float64Array(n1);
    this.a2 = new Float64Array(n2);
    this.out = new Float64Array(nOut);
    this.d1 = new Float64Array(n1);
    this.d2 = new Float64Array(n2);
  }

  /**
   * Gaussian weights scaled by 1/sqrt(fan-in); the output layer gets `outGain`
   * (small for a policy, so it starts out nearly uniform). Biases start at zero.
   */
  init(rng, outGain = 1) {
    const fill = (at, n, fanIn, gain) => {
      const std = gain / Math.sqrt(fanIn);
      for (let i = 0; i < n; i++) this.p[at + i] = gaussian(rng) * std;
    };
    fill(this.oW1, this.n1 * this.nIn, this.nIn, 1);
    fill(this.oW2, this.n2 * this.n1, this.n1, 1);
    fill(this.oW3, this.nOut * this.n2, this.n2, outGain);
  }

  /** Copy another network's parameters into this one. */
  copyFrom(other) {
    this.p.set(other.p);
  }

  /** Forward pass for the input at x[xo ... xo + nIn); leaves the output in this.out. */
  forward(x, xo = 0) {
    const { nIn, n1, n2, nOut, p, a1, a2, out } = this;
    const oW1 = this.oW1, oB1 = this.oB1, oW2 = this.oW2, oB2 = this.oB2, oW3 = this.oW3, oB3 = this.oB3;
    for (let j = 0; j < n1; j++) {
      let s = p[oB1 + j];
      const row = oW1 + j * nIn;
      for (let i = 0; i < nIn; i++) s += p[row + i] * x[xo + i];
      a1[j] = Math.tanh(s);
    }
    for (let k = 0; k < n2; k++) {
      let s = p[oB2 + k];
      const row = oW2 + k * n1;
      for (let j = 0; j < n1; j++) s += p[row + j] * a1[j];
      a2[k] = Math.tanh(s);
    }
    for (let o = 0; o < nOut; o++) {
      let s = p[oB3 + o];
      const row = oW3 + o * n2;
      for (let k = 0; k < n2; k++) s += p[row + k] * a2[k];
      out[o] = s;
    }
    return out;
  }

  /**
   * Backprop for the sample of the last forward() call: adds d(loss)/d(parameter)
   * into this.g given dOut = d(loss)/d(output). `x`/`xo` must be that sample's input.
   */
  backward(x, xo, dOut) {
    const { nIn, n1, n2, nOut, p, g, a1, a2, d1, d2 } = this;
    const oW1 = this.oW1, oB1 = this.oB1, oW2 = this.oW2, oB2 = this.oB2, oW3 = this.oW3, oB3 = this.oB3;
    d2.fill(0);
    for (let o = 0; o < nOut; o++) {
      const go = dOut[o];
      g[oB3 + o] += go;
      const row = oW3 + o * n2;
      for (let k = 0; k < n2; k++) {
        g[row + k] += go * a2[k];
        d2[k] += p[row + k] * go;
      }
    }
    d1.fill(0);
    for (let k = 0; k < n2; k++) {
      const gk = d2[k] * (1 - a2[k] * a2[k]);
      g[oB2 + k] += gk;
      const row = oW2 + k * n1;
      for (let j = 0; j < n1; j++) {
        g[row + j] += gk * a1[j];
        d1[j] += p[row + j] * gk;
      }
    }
    for (let j = 0; j < n1; j++) {
      const gj = d1[j] * (1 - a1[j] * a1[j]);
      g[oB1 + j] += gj;
      const row = oW1 + j * nIn;
      for (let i = 0; i < nIn; i++) g[row + i] += gj * x[xo + i];
    }
  }
}

/** Adam over one network's flat arrays, with optional global-norm gradient clipping. */
export class Adam {
  constructor(net, { beta1 = 0.9, beta2 = 0.999, eps = 1e-5 } = {}) {
    this.net = net;
    this.m = new Float64Array(net.size);
    this.v = new Float64Array(net.size);
    this.beta1 = beta1;
    this.beta2 = beta2;
    this.eps = eps;
    this.t = 0;
  }

  /** One update from net.g (then clears it). Returns the gradient norm before clipping. */
  step(lr, maxNorm = 0) {
    const { p, g, size } = this.net;
    const { m, v, beta1, beta2, eps } = this;
    let norm = 0;
    for (let i = 0; i < size; i++) norm += g[i] * g[i];
    norm = Math.sqrt(norm);
    const scale = maxNorm > 0 && norm > maxNorm ? maxNorm / (norm + 1e-12) : 1;
    this.t++;
    const c1 = 1 - Math.pow(beta1, this.t);
    const c2 = 1 - Math.pow(beta2, this.t);
    const alpha = (lr * Math.sqrt(c2)) / c1;
    for (let i = 0; i < size; i++) {
      const gi = g[i] * scale;
      const mi = beta1 * m[i] + (1 - beta1) * gi;
      const vi = beta2 * v[i] + (1 - beta2) * gi * gi;
      m[i] = mi;
      v[i] = vi;
      p[i] -= (alpha * mi) / (Math.sqrt(vi) + eps * Math.sqrt(c2));
      g[i] = 0;
    }
    return norm;
  }
}
