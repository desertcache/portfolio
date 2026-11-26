/* THE LAST INVENTION · formations.js
   Shape generators for the particle universe. Each formation returns, per particle:
   a target position (xyz) with a brightness (w), and three palette weights (A, B, C).
   Particles past HERO form a fixed starfield that never moves, so every morph has depth. */
(() => {
  'use strict';
  const TLI = window.TLI;
  const E = TLI.engine;
  const cache = new Map();
  TLI.formations = { get: () => null, clear: () => cache.clear() };
  if (!E || !E.ok) return;

  const { N, HERO, seeds } = E;
  const TAU = Math.PI * 2;
  const rng = TLI.rng;

  const gauss = (r) => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r()); };
  const dir = (r) => { const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u); return [s * Math.cos(th), u, s * Math.sin(th)]; };
  const make = () => ({ pos: new Float32Array(N * 4), w: new Float32Array(N * 3), anchors: {} });
  const P = (f, i, x, y, z, b) => { const k = i * 4; f.pos[k] = x; f.pos[k + 1] = y; f.pos[k + 2] = z; f.pos[k + 3] = b; };
  const Wt = (f, i, a, b, c) => { const k = i * 3; f.w[k] = a; f.w[k + 1] = b; f.w[k + 2] = c; };
  const defW = (f, i) => { const z = seeds[i * 4 + 2], s = seeds[i * 4 + 3]; if (s > 0.94) Wt(f, i, 0, 0, 1); else Wt(f, i, 1 - z, z, 0); };
  const accent = (i, p) => seeds[i * 4 + 3] > p;
  function euler(t) { // row-major Ry(t1) * Rx(t0) * Rz(t2)
    const [a, b, g] = t;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
    const m = (A, B) => { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return r; };
    return m(m([cb, 0, sb, 0, 1, 0, -sb, 0, cb], [1, 0, 0, 0, ca, -sa, 0, sa, ca]), [cg, -sg, 0, sg, cg, 0, 0, 0, 1]);
  }

  /* ---------- the fixed starfield ---------- */
  const DUST = (() => {
    const r = rng(77), n = N - HERO, a = new Float32Array(n * 4);
    for (let j = 0; j < n; j++) {
      const d = dir(r), rad = 9 + Math.pow(r(), 0.7) * 34;
      a[j * 4] = d[0] * rad * 1.3;
      a[j * 4 + 1] = d[1] * rad * 0.8;
      a[j * 4 + 2] = -Math.abs(d[2]) * rad - 3;
      a[j * 4 + 3] = 0.35 + r() * 0.9;
    }
    return a;
  })();
  function dust(f) {
    for (let i = HERO; i < N; i++) {
      const j = (i - HERO) * 4;
      P(f, i, DUST[j], DUST[j + 1], DUST[j + 2], DUST[j + 3]);
      const z = seeds[i * 4 + 2];
      Wt(f, i, 0.2 + 0.5 * z, 0.8 - 0.5 * z, 0);
    }
    return f;
  }

  /* ---------- text sampled from the display face ---------- */
  const tc = document.createElement('canvas');
  function textPixels(lines) {
    const g = tc.getContext('2d', { willReadFrequently: true });
    const base = 220;
    const metr = lines.map((L) => {
      const px = base * (L.size || 1);
      const family = L.font || (TLI.FONTS && TLI.FONTS.display) || "Unbounded, Bahnschrift, 'Segoe UI', sans-serif";
      const font = `${L.weight || 800} ${px}px ${family}`;
      g.font = font;
      const chars = [...L.t];
      const adv = chars.map((ch) => g.measureText(ch).width);
      const tr = (L.track || 0) * px;
      const w = adv.reduce((s, a) => s + a, 0) + tr * Math.max(0, chars.length - 1);
      return { px, font, chars, adv, tr, w, h: px * (L.lh || 1.12) };
    });
    const maxW = Math.max(...metr.map((m) => m.w));
    const totH = metr.reduce((s, m) => s + m.h, 0);
    const pad = 24;
    // Generous width: some engines measure a variable font narrower than they draw it.
    // The pixels decide the real extent below, so spare room costs nothing.
    tc.width = Math.ceil(maxW * 1.6 + pad * 2);
    tc.height = Math.ceil(totH + pad * 2);
    g.clearRect(0, 0, tc.width, tc.height);
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    const cx = tc.width / 2;
    let y = pad;
    for (const m of metr) {
      g.font = m.font;
      const baseline = y + m.px * 0.9;
      if ('letterSpacing' in g) {
        // let the engine set the whole line, so the width it draws is the width it centres
        // (it adds the spacing after the last letter too, hence the half-step back)
        g.letterSpacing = m.tr + 'px';
        g.textAlign = 'center';
        g.fillText(m.chars.join(''), cx + m.tr / 2, baseline);
        g.letterSpacing = '0px';
        g.textAlign = 'left';
      } else {
        let x = cx - m.w / 2;
        m.chars.forEach((ch, i) => { g.fillText(ch, x, baseline); x += m.adv[i] + m.tr; });
      }
      y += m.h;
    }
    const d = g.getImageData(0, 0, tc.width, tc.height).data;
    const pts = [];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let yy = 0; yy < tc.height; yy += 2) {
      for (let xx = 0; xx < tc.width; xx += 2) {
        if (d[(yy * tc.width + xx) * 4 + 3] > 120) {
          pts.push(xx, yy);
          if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy;
        }
      }
    }
    return { pts, minX, maxX, minY, maxY };
  }
  function text(name, narrow) {
    const spec = (TLI.textSpecs || {})[name];
    if (!spec) return null;
    const f = make(), r = rng(101 + name.length * 7);
    const lines = narrow && spec.linesNarrow ? spec.linesNarrow : spec.lines;
    const px = textPixels(lines);
    const n = px.pts.length / 2;
    if (!n) return null;
    const pw = px.maxX - px.minX + 2, ph = px.maxY - px.minY + 2;
    let worldW = Math.min(spec.maxW || 7.4, E.viewWidth() * (spec.fill || 0.84));
    let sc = worldW / pw;
    if (ph * sc > (spec.maxH || 3.2)) sc = (spec.maxH || 3.2) / ph;
    const cx = (px.minX + px.maxX) / 2, cy = (px.minY + px.maxY) / 2;
    const yOff = narrow && spec.yN != null ? spec.yN : spec.y || 0;
    const nText = Math.floor(HERO * 0.9);
    const halfW = (pw * sc) / 2;
    for (let i = 0; i < HERO; i++) {
      const k = Math.floor(r() * n) * 2;
      const x = (px.pts[k] + (r() - 0.5) * 2 - cx) * sc;
      const y = -(px.pts[k + 1] + (r() - 0.5) * 2 - cy) * sc + yOff;
      const t = (x + halfW) / (2 * halfW);
      if (i < nText) {
        P(f, i, x, y, gauss(r) * 0.025, 0.72 * (0.8 + 0.4 * r()));
        if (accent(i, 0.95)) Wt(f, i, 0, 0, 1); else Wt(f, i, 1 - t, t, 0);
      } else {
        P(f, i, x + gauss(r) * 0.16, y + gauss(r) * 0.16, gauss(r) * 0.25, 0.09);
        Wt(f, i, 1 - t, t, 0);
      }
    }
    f.anchors.textTop = [0, (cy - px.minY) * sc + yOff, 0];
    f.anchors.textBottom = [0, -(px.maxY - cy) * sc + yOff, 0];
    return f;
  }

  /* ---------- an exponential curve made of light ---------- */
  function curveTable(o) {
    const A = (o.top - o.y0) / (Math.exp(o.k * (o.xTop - o.x0)) - 1);
    const fy = (x) => o.y0 + A * (Math.exp(o.k * (x - o.x0)) - 1);
    const xs = [], cum = [];
    let L = 0, px = o.x0, py = fy(o.x0);
    for (let j = 0; j < 2000; j++) {
      const x = o.x0 + ((o.x1 - o.x0) * j) / 1999, y = fy(x);
      if (y > o.top + 0.9) break;
      if (j) L += Math.hypot(x - px, y - py);
      xs.push(x); cum.push(L); px = x; py = y;
    }
    const at = (s) => {
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < s) lo = mid; else hi = mid; }
      const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
      return xs[lo] + (xs[hi] - xs[lo]) * t;
    };
    return { A, fy, at, L, xEnd: xs[xs.length - 1] };
  }
  function curveInto(f, r, o, sx) {
    const c = curveTable(o);
    const nCore = Math.floor(HERO * 0.6), nGlow = Math.floor(HERO * 0.78), nAxis = Math.floor(HERO * 0.88);
    for (let i = 0; i < HERO; i++) {
      if (i < nCore) {
        const s = r() * c.L, x = c.at(s), y = c.fy(x), t = s / c.L;
        P(f, i, x * sx + gauss(r) * 0.018, y + gauss(r) * 0.018, gauss(r) * 0.03, 0.46);
        Wt(f, i, 1 - t, 0.25 + t * 0.4, t * t * 1.2);
      } else if (i < nGlow) {
        const s = r() * c.L, x = c.at(s), y = c.fy(x), t = s / c.L;
        P(f, i, x * sx + gauss(r) * 0.11, y + gauss(r) * 0.11, gauss(r) * 0.14, 0.1);
        Wt(f, i, 1 - t, t, 0.2);
      } else if (i < nAxis) {
        if (r() < 0.62) P(f, i, (o.x0 - 0.25 + r() * (o.x1 - o.x0 + 0.5)) * sx, o.y0 - 0.16 + gauss(r) * 0.006, gauss(r) * 0.01, 0.11);
        else P(f, i, (o.x0 - 0.25) * sx + gauss(r) * 0.006, o.y0 - 0.16 + r() * (o.top - o.y0 + 0.4), gauss(r) * 0.01, 0.09);
        Wt(f, i, 0.4, 0.6, 0);
      } else {
        const x = o.x0 + r() * (Math.min(c.xEnd, o.xTop) - o.x0), yTop = Math.min(c.fy(x), o.top + 0.5);
        P(f, i, x * sx, o.y0 + r() * (yTop - o.y0), gauss(r) * 0.04, 0.045);
        Wt(f, i, 0.7, 0.3, 0);
      }
    }
    return c;
  }

  /* ---------- the robot silhouette ---------- */
  let SIL = null;
  function silhouette() {
    if (SIL) return SIL;
    const c = document.createElement('canvas');
    c.width = 120; c.height = 240;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    const rr = (x, y, w, h, q) => { g.beginPath(); g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q); g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath(); };
    rr(40, 6, 40, 36, 11); g.fill();
    g.fillRect(54, 40, 12, 12);
    g.beginPath(); g.moveTo(28, 54); g.lineTo(92, 54); g.lineTo(84, 128); g.lineTo(36, 128); g.closePath(); g.fill();
    g.lineWidth = 13;
    g.beginPath(); g.moveTo(30, 62); g.lineTo(17, 110); g.lineTo(15, 148); g.stroke();
    g.beginPath(); g.moveTo(90, 62); g.lineTo(103, 110); g.lineTo(105, 148); g.stroke();
    g.lineWidth = 17;
    g.beginPath(); g.moveTo(48, 124); g.lineTo(45, 178); g.lineTo(44, 230); g.stroke();
    g.beginPath(); g.moveTo(72, 124); g.lineTo(75, 178); g.lineTo(76, 230); g.stroke();
    g.globalCompositeOperation = 'destination-out';
    g.fillRect(46, 20, 28, 6);
    g.beginPath(); g.arc(60, 80, 7, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    const d = g.getImageData(0, 0, 120, 240).data, pts = [];
    for (let y = 0; y < 240; y++) for (let x = 0; x < 120; x++) if (d[(y * 120 + x) * 4 + 3] > 128) pts.push(x / 120, y / 240);
    SIL = pts;
    return pts;
  }

  /* ---------- generators ---------- */
  const GEN = {
    text,

    singularity() {
      const f = make(), r = rng(3), core = Math.floor(HERO * 0.8);
      for (let i = 0; i < HERO; i++) {
        if (i < core) {
          const d = dir(r), rad = 0.006 + Math.pow(r(), 3.2) * 0.1;
          P(f, i, d[0] * rad, d[1] * rad, d[2] * rad, 0.045);
          Wt(f, i, 0.15, 0.6, 0.25);
        } else {
          const a = r() * TAU, rad = 0.13 + Math.pow(r(), 1.7) * 0.75;
          P(f, i, Math.cos(a) * rad, gauss(r) * 0.006 * (1 + rad * 4), Math.sin(a) * rad, 0.17 * (1.05 - rad));
          Wt(f, i, 0.75, 0.25, 0);
        }
      }
      return f;
    },

    burst() {
      const f = make(), r = rng(5);
      for (let i = 0; i < HERO; i++) {
        const d = dir(r), rad = 2.6 + Math.pow(r(), 0.55) * 9.5;
        P(f, i, d[0] * rad * 1.2, d[1] * rad * 0.8, d[2] * rad, 0.3 + r() * 0.35);
        defW(f, i);
      }
      return f;
    },

    field() {
      const f = make(), r = rng(13);
      for (let i = 0; i < HERO; i++) {
        const d = dir(r), rad = 5 + Math.pow(r(), 0.8) * 13;
        P(f, i, d[0] * rad * 1.3, d[1] * rad * 0.65, -Math.abs(d[2]) * rad - 2.5, 0.14 + r() * 0.14);
        defW(f, i);
      }
      return f;
    },

    curve(arg, narrow) {
      const f = make(), r = rng(11);
      curveInto(f, r, { x0: -4.5, x1: 3.4, y0: -1.55, k: 1.05, top: 2.7, xTop: 2.75 }, narrow ? 0.5 : 1);
      return f;
    },

    knee(arg, narrow) {
      const f = make(), r = rng(19);
      const o = { x0: -4.7, x1: 3.2, y0: -1.6, k: 1.0, top: 2.9, xTop: 2.85 };
      const sx = narrow ? 0.5 : 1;
      const c = curveInto(f, r, o, sx);
      const xk = o.x0 + Math.log(1 / (c.A * o.k)) / o.k, yk = c.fy(xk);
      const nMark = Math.floor(HERO * 0.05), nRing = Math.floor(HERO * 0.075);
      for (let i = 0; i < nRing; i++) {
        if (i < nMark) { P(f, i, xk * sx + gauss(r) * 0.022, yk + gauss(r) * 0.022, gauss(r) * 0.02, 0.5); Wt(f, i, 0, 0.2, 1); }
        else { const a = r() * TAU; P(f, i, xk * sx + Math.cos(a) * 0.17, yk + Math.sin(a) * 0.17, 0, 0.22); Wt(f, i, 0.2, 0.2, 1); }
      }
      f.anchors.knee = [xk * sx, yk, 0];
      return f;
    },

    neural(arg, narrow) {
      const f = make(), r = rng(17);
      const layers = narrow ? [4, 6, 7, 6, 4] : [5, 8, 10, 8, 5];
      const X = narrow ? 1.6 : 3.4, gap = narrow ? 0.5 : 0.42;
      const nodes = layers.map((n, li) => {
        const x = -X + (2 * X * li) / (layers.length - 1);
        return Array.from({ length: n }, (_, k) => [x, (k - (n - 1) / 2) * gap, (r() - 0.5) * 0.4]);
      });
      const flat = nodes.flat(), edges = [];
      for (let li = 0; li < layers.length - 1; li++) for (const a of nodes[li]) for (const b of nodes[li + 1]) edges.push([a, b]);
      const nNode = Math.floor(HERO * 0.4);
      for (let i = 0; i < HERO; i++) {
        if (i < nNode) {
          const nd = flat[i % flat.length];
          P(f, i, nd[0] + gauss(r) * 0.045, nd[1] + gauss(r) * 0.045, nd[2] + gauss(r) * 0.045, 0.5);
          const t = (nd[0] + X) / (2 * X); Wt(f, i, 1 - t, t, 0.15);
        } else {
          const e = edges[Math.floor(r() * edges.length)], t = r();
          const x = e[0][0] + (e[1][0] - e[0][0]) * t, y = e[0][1] + (e[1][1] - e[0][1]) * t, z = e[0][2] + (e[1][2] - e[0][2]) * t;
          P(f, i, x + gauss(r) * 0.007, y + gauss(r) * 0.007, z, 0.12);
          const tc2 = (x + X) / (2 * X); Wt(f, i, 1 - tc2, tc2, 0);
        }
      }
      return f;
    },

    ring(arg, narrow) {
      const f = make(), r = rng(23), R = narrow ? 1.45 : 2.35;
      for (let i = 0; i < HERO; i++) {
        const a = r() * TAU, glow = i > HERO * 0.8, s = glow ? 0.26 : 0.055;
        const rr = R + gauss(r) * s;
        P(f, i, Math.cos(a) * rr, gauss(r) * s, Math.sin(a) * rr, glow ? 0.09 : 0.4);
        const t = 0.5 + 0.5 * Math.cos(a * 2);
        if (accent(i, 0.95)) Wt(f, i, 0, 0, 1); else Wt(f, i, t, 1 - t, 0);
      }
      return f;
    },

    sphere(arg, narrow) {
      const f = make(), r = rng(29), R = narrow ? 1.15 : 1.55;
      const nS = Math.floor(HERO * 0.6), nV = Math.floor(HERO * 0.85);
      for (let i = 0; i < HERO; i++) {
        if (i < nS) {
          const y = 1 - (2 * (i + 0.5)) / nS, rad = Math.sqrt(1 - y * y), th = i * 2.399963;
          const rr = R * (1 + gauss(r) * 0.01);
          P(f, i, Math.cos(th) * rad * rr, y * rr, Math.sin(th) * rad * rr, 0.34);
          defW(f, i);
        } else if (i < nV) {
          const d = dir(r), rr = R * Math.cbrt(r()) * 0.94;
          P(f, i, d[0] * rr, d[1] * rr, d[2] * rr, 0.13);
          Wt(f, i, 0.3, 0.7, 0);
        } else {
          const d = dir(r), rr = R * (1.04 + Math.pow(r(), 2.4) * 0.95);
          P(f, i, d[0] * rr, d[1] * rr, d[2] * rr, 0.085);
          Wt(f, i, 0.8, 0.2, 0);
        }
      }
      return f;
    },

    gyro(arg, narrow) {
      const f = make(), r = rng(31), s = narrow ? 0.66 : 1;
      const rings = [
        { R: 2.05, m: euler([0.42, 0, 0]), w: [1, 0, 0] },
        { R: 1.62, m: euler([1.25, 0.7, 0]), w: [0, 1, 0] },
        { R: 1.2, m: euler([-0.5, 1.4, 0.5]), w: [0, 0, 1] },
      ];
      const nCore = Math.floor(HERO * 0.07);
      for (let i = 0; i < HERO; i++) {
        if (i < nCore) {
          const d = dir(r), rr = 0.3 * Math.pow(r(), 0.5) * s;
          P(f, i, d[0] * rr, d[1] * rr, d[2] * rr, 0.2); Wt(f, i, 0.34, 0.33, 0.33);
          continue;
        }
        const g = rings[i % 3], m = g.m;
        const a = r() * TAU, glow = r() < 0.18, sd = glow ? 0.16 : 0.032;
        const rad = (g.R + gauss(r) * sd) * s;
        const x0 = Math.cos(a) * rad, y0 = gauss(r) * sd * s, z0 = Math.sin(a) * rad;
        P(f, i, m[0] * x0 + m[1] * y0 + m[2] * z0, m[3] * x0 + m[4] * y0 + m[5] * z0, m[6] * x0 + m[7] * y0 + m[8] * z0, glow ? 0.08 : 0.38);
        Wt(f, i, g.w[0], g.w[1], g.w[2]);
      }
      return f;
    },

    grid(arg, narrow) {
      const f = make(), r = rng(37);
      const target = [0, -1.05, -3.0];
      const halfW = narrow ? 11 : 17, zNear = 2.5, zFar = -48;
      const K = 48;
      const area = 2 * halfW * (zNear - zFar) * (6 / 7);
      const s = Math.sqrt(area / Math.max(1000, HERO - K));
      const xs = [], zs = [];
      let row = 0;
      for (let z = zNear; z > zFar; z -= s, row++) {
        if (row % 7 === 6) continue;
        for (let x = -halfW; x <= halfW; x += s) { xs.push(x + (r() - 0.5) * s * 0.15); zs.push(z + (r() - 0.5) * s * 0.15); }
      }
      const n = xs.length;
      const d2 = new Float32Array(n);
      for (let j = 0; j < n; j++) { const dx = xs[j] - target[0], dz = zs[j] - target[2]; d2[j] = dx * dx + dz * dz * 1.15; }
      const order = Array.from({ length: n }, (_, j) => j).sort((a, b) => d2[a] - d2[b]);
      for (let i = 0; i < HERO; i++) {
        if (i < K) {
          P(f, i, target[0] + gauss(r) * 0.03, target[1] + 0.04 + gauss(r) * 0.03, target[2] + gauss(r) * 0.03, 1.0);
          Wt(f, i, 0.2, 0.3, 0.6);
          continue;
        }
        const j = order[(i - K) % n];
        P(f, i, xs[j], target[1] + gauss(r) * 0.004, zs[j], 0.8);
        defW(f, i);
      }
      f.anchors.genius = target;
      return f;
    },

    river() {
      const f = make(), r = rng(41), R = 9;
      for (let i = 0; i < HERO; i++) {
        const a = r() * TAU, glow = r() < 0.3, sd = glow ? 0.34 : 0.07;
        P(f, i, Math.cos(a) * (R + gauss(r) * sd), gauss(r) * sd * 0.8, Math.sin(a) * (R + gauss(r) * sd), glow ? 0.08 : 0.4);
        defW(f, i);
      }
      return f;
    },

    helix(arg, narrow) {
      const f = make(), r = rng(43);
      const Hh = narrow ? 3.4 : 5.0, turns = 2.4, rad = narrow ? 0.55 : 0.78, rungs = 40;
      const nS = Math.floor(HERO * 0.68), nR = Math.floor(HERO * 0.95);
      for (let i = 0; i < HERO; i++) {
        if (i < nS) {
          const strand = i & 1, u = r();
          const th = u * turns * TAU + (strand ? Math.PI : 0), y = -Hh / 2 + u * Hh;
          const glow = r() < 0.15, sd = glow ? 0.1 : 0.025;
          P(f, i, Math.cos(th) * rad + gauss(r) * sd, y + gauss(r) * sd, Math.sin(th) * rad + gauss(r) * sd, glow ? 0.1 : 0.42);
          if (accent(i, 0.96)) Wt(f, i, 0, 0, 1); else Wt(f, i, strand ? 0.15 : 1, strand ? 1 : 0.15, 0);
        } else if (i < nR) {
          const j = Math.floor(r() * rungs), u = (j + 0.5) / rungs;
          const th = u * turns * TAU, y = -Hh / 2 + u * Hh;
          let t = r(); if (Math.abs(t - 0.5) < 0.05) t += t < 0.5 ? -0.06 : 0.06;
          const ax = Math.cos(th) * rad, az = Math.sin(th) * rad;
          P(f, i, ax - 2 * ax * t + gauss(r) * 0.01, y + gauss(r) * 0.01, az - 2 * az * t + gauss(r) * 0.01, 0.26);
          Wt(f, i, t < 0.5 ? 1 : 0.1, t < 0.5 ? 0.1 : 1, 0.3);
        } else {
          const d = dir(r), rr = 1.6 + r() * 2.5;
          P(f, i, d[0] * rr, d[1] * rr * 1.2, d[2] * rr, 0.07); defW(f, i);
        }
      }
      return f;
    },

    columns(arg, narrow) {
      const f = make(), r = rng(47);
      const n = narrow ? 16 : 28, x0 = narrow ? -2.0 : -4.3, x1 = narrow ? 1.9 : 3.9, base = -1.9, top = 3.5;
      const g = narrow ? 1.45 : 1.27;
      const hs = []; let tot = 0;
      for (let k = 0; k < n; k++) { const h = Math.min(top - base, 0.06 * Math.pow(g, k)); hs.push(h); tot += h + 0.15; }
      const cum = []; let acc = 0; for (const h of hs) { acc += h + 0.15; cum.push(acc / tot); }
      const nCol = Math.floor(HERO * 0.9);
      for (let i = 0; i < HERO; i++) {
        if (i < nCol) {
          const u = r(); let k = 0; while (k < n - 1 && cum[k] < u) k++;
          const x = x0 + ((x1 - x0) * k) / (n - 1), y = base + r() * hs[k];
          const glow = r() < 0.12;
          P(f, i, x + (r() - 0.5) * 0.07 + (glow ? gauss(r) * 0.07 : 0), y, (r() - 0.5) * 0.07 + (glow ? gauss(r) * 0.07 : 0), glow ? 0.09 : 0.32);
          const t = k / (n - 1); Wt(f, i, 1 - t, t, k > n - 4 ? 0.5 : 0);
        } else {
          P(f, i, x0 - 0.3 + r() * (x1 - x0 + 0.6), base - 0.05 + gauss(r) * 0.008, gauss(r) * 0.05, 0.12);
          Wt(f, i, 0.5, 0.5, 0);
        }
      }
      return f;
    },

    robots(arg, narrow) {
      const n = Math.max(1, parseInt(arg || '1', 10) || 1);
      const f = make(), r = rng(53 + n), sil = silhouette(), ns = sil.length / 2;
      const areaW = narrow ? 3.2 : 5.6, areaH = narrow ? 4.0 : 3.7;
      let best = { cols: 1, rows: n, fh: 0 };
      for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        const fh = Math.min((areaH / rows) * 0.86, (areaW / cols) * 0.86 * 2);
        if (fh > best.fh) best = { cols, rows, fh };
      }
      const { cols, rows, fh } = best, fw = fh / 2, cellW = areaW / cols, cellH = areaH / rows;
      const lastCount = n - (rows - 1) * cols;
      const nFig = Math.floor(HERO * 0.93);
      for (let i = 0; i < HERO; i++) {
        if (i < nFig) {
          const k = i % n, row = Math.floor(k / cols), col = k % cols;
          let cx = -areaW / 2 + cellW * (col + 0.5);
          if (row === rows - 1) cx += ((cols - lastCount) * cellW) / 2;
          const cy = areaH / 2 - cellH * (row + 0.5) - 0.1;
          const p = Math.floor(r() * ns);
          const u = sil[p * 2] + (r() - 0.5) / 120, v = sil[p * 2 + 1] + (r() - 0.5) / 240;
          P(f, i, cx + (u - 0.5) * fw, cy + (0.5 - v) * fh, gauss(r) * 0.02, 0.62);
          const hue = (k * 0.618) % 1;
          if (accent(i, 0.95)) Wt(f, i, 0, 0, 1); else Wt(f, i, 1 - hue * 0.55, 0.2 + hue * 0.55, 0);
        } else {
          P(f, i, (r() - 0.5) * areaW * 1.1, -areaH / 2 - 0.2 + gauss(r) * 0.01, gauss(r) * 0.2, 0.08);
          defW(f, i);
        }
      }
      return f;
    },

    sun(arg, narrow) {
      const f = make(), r = rng(59), R = narrow ? 0.62 : 0.85;
      const nCore = Math.floor(HERO * 0.4), nCor = Math.floor(HERO * 0.5);
      for (let i = 0; i < HERO; i++) {
        if (i < nCore) {
          const d = dir(r), rr = R * Math.pow(r(), 0.22);
          P(f, i, d[0] * rr, d[1] * rr, d[2] * rr, 0.42); Wt(f, i, 0.05, 0.45, 0.9);
        } else if (i < nCor) {
          const d = dir(r), rr = R * (1.02 + Math.pow(r(), 3) * 0.65);
          P(f, i, d[0] * rr, d[1] * rr, d[2] * rr, 0.11); Wt(f, i, 0.3, 0.7, 0.2);
        } else {
          const band = r();
          const inc = band < 0.6 ? gauss(r) * 0.07 : (band < 0.8 ? 0.42 : -0.36) + gauss(r) * 0.035;
          const rho = (narrow ? 1.0 : 1.45) + Math.pow(r(), 0.9) * (narrow ? 1.45 : 2.3);
          const a = r() * TAU, x = Math.cos(a) * rho, z = Math.sin(a) * rho;
          P(f, i, x, z * Math.sin(inc) + gauss(r) * 0.01, z * Math.cos(inc), 0.24);
          Wt(f, i, 1, 0.25, accent(i, 0.93) ? 0.8 : 0);
        }
      }
      return f;
    },

    fork(arg, narrow) {
      const f = make(), r = rng(61);
      const sx = narrow ? 0.46 : 1, sy = narrow ? 1.25 : 1;
      const nT = Math.floor(HERO * 0.2);
      for (let i = 0; i < HERO; i++) {
        if (i < nT) {
          const x = -4.6 + r() * 3.4;
          P(f, i, x * sx, gauss(r) * 0.045 * sy, gauss(r) * 0.1, 0.4); Wt(f, i, 0.5, 0.5, 1);
        } else {
          const up = i & 1, u = Math.pow(r(), 0.85);
          const x = -1.2 + u * 5.8, e = u * u * (3 - 2 * u), yc = (up ? 1 : -1) * 2.0 * e;
          const sd = 0.04 + 0.3 * u;
          P(f, i, x * sx, (yc + gauss(r) * sd) * sy, gauss(r) * (0.1 + 0.35 * u), 0.42 * (1 - 0.45 * u));
          if (up) Wt(f, i, 1, 0, 0.15); else Wt(f, i, 0, 1, 0.05);
        }
      }
      return f;
    },

    twin(arg, narrow) {
      const f = make(), r = rng(67);
      const cL = narrow ? [0, 1.55, 0] : [-2.6, 0.05, 0], cR = narrow ? [0, -1.55, 0] : [2.6, 0.05, 0];
      const sc = narrow ? 0.7 : 1;
      const spikes = Array.from({ length: 46 }, () => dir(r));
      for (let i = 0; i < HERO; i++) {
        if (i & 1) {
          const d = dir(r), th = Math.atan2(d[2], d[0]), ph = Math.acos(d[1]);
          const rr = 1.12 * (1 + 0.16 * Math.sin(5 * th) * Math.sin(4 * ph)) * (r() < 0.8 ? 1 : 0.4 + 0.6 * r()) * sc;
          P(f, i, cL[0] + d[0] * rr, cL[1] + d[1] * rr, cL[2] + d[2] * rr, 0.3);
          Wt(f, i, 1, 0, accent(i, 0.9) ? 0.6 : 0);
        } else {
          const s = spikes[Math.floor(r() * spikes.length)];
          const len = (0.15 + Math.pow(r(), 2.2) * 1.9) * sc, j = 0.05 + len * 0.06;
          P(f, i, cR[0] + s[0] * len + gauss(r) * j, cR[1] + s[1] * len + gauss(r) * j, cR[2] + s[2] * len + gauss(r) * j, 0.3);
          Wt(f, i, 0, 1, accent(i, 0.92) ? 0.4 : 0);
        }
      }
      f.anchors.left = cL; f.anchors.right = cR;
      return f;
    },

    code(arg, narrow) {
      const f = make(), r = rng(71);
      let lines = TLI.codeLines;
      if (!lines || lines.length < 50) {
        lines = [];
        for (let j = 0; j < 3200; j++) { const ind = [0, 2, 4, 4, 6, 6, 8][Math.floor(r() * 7)]; lines.push([ind, Math.floor(Math.pow(r(), 0.7) * 70)]); }
      }
      const cols = narrow ? 2 : 6, per = Math.ceil(lines.length / cols);
      const Wd = narrow ? 3.2 : 8.4, Hh = narrow ? 4.6 : 4.3;
      const colW = Wd / cols, lineH = Hh / per, charW = (colW * 0.9) / 100;
      const cum = new Float64Array(lines.length);
      let tot = 0;
      for (let j = 0; j < lines.length; j++) { tot += Math.max(0.5, Math.min(100, lines[j][1])); cum[j] = tot; }
      for (let i = 0; i < HERO; i++) {
        const u = r() * tot;
        let lo = 0, hi = lines.length - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < u) lo = m + 1; else hi = m; }
        const ind = Math.min(40, lines[lo][0]), len = Math.min(100 - ind, Math.max(1, lines[lo][1]));
        const c = Math.floor(lo / per), row = lo % per;
        const x = -Wd / 2 + c * colW + (ind + r() * len) * charW;
        const y = Hh / 2 - (row + 0.5) * lineH;
        P(f, i, x, y + gauss(r) * lineH * 0.12, gauss(r) * 0.015, 0.32);
        if (ind === 0) Wt(f, i, 0.2, 0.3, 1); else Wt(f, i, (ind % 4) / 4 + 0.3, 1 - (ind % 4) / 4, 0);
      }
      return f;
    },

    galaxy(arg, narrow) {
      const f = make(), r = rng(73), arms = 3, sc = narrow ? 0.75 : 1.4;
      const nB = Math.floor(HERO * 0.16);
      for (let i = 0; i < HERO; i++) {
        if (i < nB) {
          const d = dir(r), rr = Math.abs(gauss(r)) * 0.38;
          P(f, i, d[0] * rr * sc, d[1] * rr * 0.6 * sc, d[2] * rr * sc, 0.28); Wt(f, i, 0.1, 0.8, 0.3);
        } else {
          const rad = -Math.log(1 - r() * 0.985) * 1.15;
          const arm = Math.floor(r() * arms);
          const th = (arm * TAU) / arms + Math.log(rad + 0.25) * 2.3 + gauss(r) * (0.19 / (1 + rad * 0.3));
          const y = gauss(r) * 0.08 * (1 + 0.8 / (1 + rad));
          P(f, i, Math.cos(th) * rad * sc, y * sc, Math.sin(th) * rad * sc, 0.25 * Math.max(0.35, 1 - rad / 6));
          const hot = accent(i, 0.9);
          Wt(f, i, hot ? 0 : 1, hot ? 0.2 : 0.15 + 0.3 / (1 + rad), hot ? 1 : 0);
        }
      }
      return f;
    },
  };

  function get(key) {
    const narrow = E.aspect() < 0.9;
    const ck = key + (narrow ? '|n' : '|w');
    if (cache.has(ck)) return cache.get(ck);
    const ix = key.indexOf(':');
    const name = ix < 0 ? key : key.slice(0, ix), arg = ix < 0 ? '' : key.slice(ix + 1);
    const gen = GEN[name];
    if (!gen) { console.warn('[formations] unknown', key); return null; }
    const f = gen(arg, narrow);
    if (!f) return null;
    dust(f);
    cache.set(ck, f);
    return f;
  }

  TLI.formations = { get, clear: () => cache.clear(), has: (k) => !!GEN[k.split(':')[0]] };
  E.onResize((classChanged) => { if (classChanged) cache.clear(); });
})();
