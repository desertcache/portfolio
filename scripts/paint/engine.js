'use strict';
// A small dry-media renderer in plain JavaScript: toothy paper, sticks of pigment, and a hand that wobbles.
// No canvas, no browser. Every mark is rasterised here, pixel by pixel, against the grain of the paper.
//
//   const E = require('./engine')({ w: 1920, h: 1080, seed: 7 });   // size in drawing units; any aspect ratio
//   S=2 node scene.js                                                // render at twice the size (same picture, finer grain)
const zlib = require('zlib'), fs = require('fs');
module.exports = function createEngine(opts) {
opts = opts || {};
const S = +(process.env.S || opts.scale || 1), BW = opts.w || 1920, BH = opts.h || 1080, W = Math.round(BW * S), H = Math.round(BH * S), N = W * H;
const CR = new Float32Array(N), CG = new Float32Array(N), CB = new Float32Array(N);
const paper = new Float32Array(N), load = new Float32Array(N), sval = new Float32Array(N), sid = new Int32Array(N);
let curId = 0, seed = opts.seed || 20261114, strokes = 0;

function rnd() { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const R = (a, b) => b === undefined ? rnd() * a : a + rnd() * (b - a);
const pick = a => a[(rnd() * a.length) | 0];
function gs() { return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(6.283185307 * rnd()); }
const cl = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const smooth = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hx = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function rampc(st, t) { if (t <= st[0][0]) return st[0][1]; for (let i = 1; i < st.length; i++) if (t <= st[i][0]) { const a = st[i - 1], b = st[i]; return mix(a[1], b[1], (t - a[0]) / (b[0] - a[0])); } return st[st.length - 1][1]; }
const r5 = list => list.map((c, i) => [i / (list.length - 1), hx(c)]);
// no two strokes come from quite the same stick
function jc(c, a) { if (!a) return c; const d = gs() * a; return [cl(c[0] + d + gs() * a * .6), cl(c[1] + d + gs() * a * .6), cl(c[2] + d + gs() * a * .6)]; }
function ih(x, y, s) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function vn(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = ih(xi, yi, s), b = ih(xi + 1, yi, s), c = ih(xi, yi + 1, s), d = ih(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, o) { let t = 0, a = .5, n = 0; for (let i = 0; i < o; i++) { t += a * vn(x, y, s + i * 17); n += a; x *= 2; y *= 2; a *= .5; } return t / n; }

// ---------- paper ----------
// A height map of the tooth, equalised so "pressure 0.4" really does catch about the top 40% of the grain.
function makePaper(tint) {
  const raw = new Float32Array(N); let mn = 1e9, mx = -1e9;
  for (let y = 0; y < H; y++) { const by = y / S; for (let x = 0; x < W; x++) { const bx = x / S;
    const v = 0.46 * vn(bx / 1.15, by / 1.15, 1) + 0.3 * vn(bx / 2.6, by / 2.9, 2) + 0.16 * vn(bx / 6.5, by / 5.5, 3) + 0.08 * vn(bx / 46, by / 3.2, 4);
    raw[y * W + x] = v; if (v < mn) mn = v; if (v > mx) mx = v; } }
  const B = 4096, hist = new Float64Array(B), k = (B - 1) / (mx - mn);
  for (let i = 0; i < N; i++) hist[((raw[i] - mn) * k) | 0]++;
  let acc = 0; for (let b = 0; b < B; b++) { acc += hist[b]; hist[b] = acc / N; }
  for (let i = 0; i < N; i++) {
    const t = hist[((raw[i] - mn) * k) | 0]; paper[i] = t;
    const x = i % W, y = (i / W) | 0, m = 0.93 + 0.14 * t + 0.06 * (vn(x / S / 90, y / S / 90, 6) - .5);
    CR[i] = tint[0] * m; CG[i] = tint[1] * m; CB[i] = tint[2] * m;
  }
}

// ---------- the sticks ----------
// tooth: how much the valleys of the paper resist   gain: how crisply pigment breaks on the grain
// body: 1 = opaque (pastel), lower = waxy glaze that darkens what is under it (colour pencil)
// edge: 0 = hard point, higher = soft shoulder      streak: unevenness across the width of the stick
const T = {
  pastel: { tooth: 0.8, gain: 3.4, op: 0.96, body: 1, fill: 0.4, edge: 0.9, streak: 0.38, sf: 0.33 },
  pp: { tooth: 0.82, gain: 3.6, op: 0.95, body: 1, fill: 0.34, edge: 0.35, streak: 0.15, sf: 0.9 },
  pencil: { tooth: 0.92, gain: 3, op: 0.82, body: 0.42, fill: 0.16, edge: 0, streak: 0, sf: 1 },
  chalk: { tooth: 0.62, gain: 4, op: 0.98, body: 1, fill: 0.3, edge: 0.25, streak: 0, sf: 1 },
  crayon: { tooth: 1.02, gain: 5, op: 0.93, body: 0.92, fill: 0.5, edge: 0.15, streak: 0.25, sf: 1.4 },
};

// One tapered capsule of pigment. Device pixels. The same pixel is never loaded twice by one stroke.
function seg(x0, y0, x1, y1, r0, r1, p0, p1, tl, cr, cg, cb, sd) {
  const rm = (r0 > r1 ? r0 : r1) + 1.5;
  let ax = Math.floor(Math.min(x0, x1) - rm), bx = Math.ceil(Math.max(x0, x1) + rm), ay = Math.floor(Math.min(y0, y1) - rm), by = Math.ceil(Math.max(y0, y1) + rm);
  if (ax < 0) ax = 0; if (ay < 0) ay = 0; if (bx > W - 1) bx = W - 1; if (by > H - 1) by = H - 1; if (ax > bx || ay > by) return;
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy, il2 = l2 > 1e-9 ? 1 / l2 : 0, il = l2 > 1e-9 ? 1 / Math.sqrt(l2) : 0;
  const tooth = tl.tooth, gain = tl.gain, op = tl.op, body = tl.body, fill = tl.fill, edge = tl.edge, stk = tl.streak, sf = tl.sf / S, id = curId;
  for (let y = ay; y <= by; y++) {
    const fy = y + .5 - y0; let i = y * W + ax;
    for (let x = ax; x <= bx; x++, i++) {
      const fx = x + .5 - x0; let u = (fx * dx + fy * dy) * il2; if (u < 0) u = 0; else if (u > 1) u = 1;
      const qx = fx - dx * u, qy = fy - dy * u, d2 = qx * qx + qy * qy, re = r0 + (r1 - r0) * u + .5;
      if (d2 >= re * re) continue;
      const d = Math.sqrt(d2);
      let c = edge > 0 ? Math.pow(1 - d / re, edge) : (re - d > 1 ? 1 : re - d);
      if (stk > 0) c *= 1 - stk + stk * 2 * vn((fx * dy - fy * dx) * il * sf + sd, sd * 0.37, 7);
      c *= p0 + (p1 - p0) * u;
      const ld = load[i];
      let a = (c - (1 - paper[i]) * tooth * (1 - 0.6 * (ld > 1 ? 1 : ld))) * gain; if (a <= 0) continue; if (a > 1) a = 1; a *= op;
      if (sid[i] === id) { const pv = sval[i]; if (a <= pv) continue; sval[i] = a; a = (a - pv) / (1 - pv + 1e-6); } else { sid[i] = id; sval[i] = a; }
      const ab = a * body, m = a - ab; let rr = CR[i], gg = CG[i], bb = CB[i];
      if (m > 0) { rr *= 1 - m * (1 - cr); gg *= 1 - m * (1 - cg); bb *= 1 - m * (1 - cb); }
      CR[i] = rr + (cr - rr) * ab; CG[i] = gg + (cg - gg) * ab; CB[i] = bb + (cb - bb) * ab;
      load[i] = ld + a * fill;
    }
  }
}
// A stroke: pressure eases in and out, the width breathes. Coordinates in drawing units (1920 x 1080).
function stroke(pts, tool, c, w, p, o) {
  const n = pts.length; if (n < 2) return; curId++; strokes++;
  const tin = o && o.tin !== undefined ? o.tin : 0.18, tout = o && o.tout !== undefined ? o.tout : 0.22, lo = o && o.lo !== undefined ? o.lo : 0.3, sd = rnd() * 997, ph = rnd() * 50;
  let pr = 0, pq = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); let e = Math.min(1, tin > 0 ? t / tin : 1, tout > 0 ? (1 - t) / tout : 1); e = lo + (1 - lo) * e * e * (3 - 2 * e);
    const r = w * S * (0.7 + 0.3 * e), q = p * e * (0.9 + 0.2 * vn(t * 3 + ph, ph, 17));
    if (i > 0) seg(pts[i - 1][0] * S, pts[i - 1][1] * S, pts[i][0] * S, pts[i][1] * S, pr, r, pq, q, tool, c[0], c[1], c[2], sd);
    pr = r; pq = q;
  }
}
// A "straight" line as a hand draws it: slightly bowed, slightly wandering.
function wline(x0, y0, x1, y1, wob, bow) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), n = Math.max(2, Math.ceil(L / 6)), nx = -dy / (L || 1), ny = dx / (L || 1), ph = rnd() * 1e3, P = [];
  for (let i = 0; i <= n; i++) { const t = i / n, o = bow * 4 * t * (1 - t) * L + wob * (vn(t * L / 18 + ph, ph, 11) - .5) * 2; P.push([x0 + dx * t + nx * o, y0 + dy * t + ny * o]); }
  return P;
}
function resamp(P, step) {
  const out = [P[0]]; let acc = 0;
  for (let i = 1; i < P.length; i++) { let x0 = P[i - 1][0], y0 = P[i - 1][1]; const x1 = P[i][0], y1 = P[i][1]; let sg = Math.hypot(x1 - x0, y1 - y0);
    while (acc + sg >= step && sg > 1e-9) { const t = (step - acc) / sg; x0 += (x1 - x0) * t; y0 += (y1 - y0) * t; out.push([x0, y0]); sg = Math.hypot(x1 - x0, y1 - y0); acc = 0; } acc += sg; }
  out.push(P[P.length - 1]); return out;
}
function spline(P, closed, k) {
  k = k || 8; const n = P.length, out = [], g = i => closed ? P[((i % n) + n) % n] : P[cl(i, 0, n - 1)], m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) { const a = g(i - 1), b = g(i), c = g(i + 1), d = g(i + 2);
    for (let j = 0; j < k; j++) { const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([0.5 * (2 * b[0] + (-a[0] + c[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (-a[0] + 3 * b[0] - 3 * c[0] + d[0]) * t3),
        0.5 * (2 * b[1] + (-a[1] + c[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * t3)]); } }
  if (!closed) out.push(P[n - 1]); return out;
}
// regions: a test function carrying its own bounding box
function polyIn(P) {
  const n = P.length; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of P) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const f = (x, y) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  f.box = [x0, y0, x1, y1]; f.pts = P; return f;
}
function discIn(cx, cy, r, irr, sd) {
  irr = irr || 0; sd = sd || 31; const sc = Math.max(6, r * 0.35);
  const f = (x, y) => { const dx = x - cx, dy = y - cy; return dx * dx + dy * dy < r * r * (1 + irr * 2 * (vn(x / sc + cx, y / sc, sd) - .5)); };
  f.box = [cx - r * (1 + irr) - 1, cy - r * (1 + irr) - 1, cx + r * (1 + irr) + 1, cy + r * (1 + irr) + 1]; return f;
}
// Fill a region the way a person does: rows of strokes that start and stop, overlap, overshoot, and drift.
function hatch(o) {
  const bx0 = o.box[0], by0 = o.box[1], bx1 = o.box[2], by1 = o.box[3], ang = o.ang || 0, ca = Math.cos(ang), sa = Math.sin(ang), gap = o.gap, ins = o.in;
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const c of [[bx0, by0], [bx1, by0], [bx0, by1], [bx1, by1]]) { const u = c[0] * ca + c[1] * sa, v = -c[0] * sa + c[1] * ca; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
  const ds = o.ds || cl(Math.min(bx1 - bx0, by1 - by0) / 8, 0.7, 3), lmin = o.len ? o.len[0] : 30, lmax = o.len ? o.len[1] : 90, over = o.over === undefined ? 2 : o.over;
  const wob = o.wob === undefined ? 1 : o.wob, p = o.p === undefined ? 0.7 : o.p, aj = o.aj === undefined ? 0.035 : o.aj, cj = o.cj === undefined ? 0.02 : o.cj;
  const emit = (a, b, v) => {
    let s = a - rnd() * over; const e = b + rnd() * over;
    for (;;) {
      const L = lmin + rnd() * (lmax - lmin), t = Math.min(e, s + L);
      if (t - s > 0.8) {
        const mu = (s + t) / 2, mx = mu * ca - v * sa, my = mu * sa + v * ca, dn = o.dens ? o.dens(mx, my) : 1;
        if (dn > 0 && rnd() < dn && !(o.skip && rnd() < o.skip)) {
          const c = typeof o.col === 'function' ? o.col(mx, my) : o.col, jv = gs() * gap * 0.22, da = gs() * aj, h = (t - s) / 2, cd = Math.cos(ang + da), sn = Math.sin(ang + da), ox = mx - jv * sa, oy = my + jv * ca;
          stroke(wline(ox - cd * h, oy - sn * h, ox + cd * h, oy + sn * h, wob, (o.bow || 0) + gs() * 0.012), o.tool, jc(c, cj), o.w * (0.8 + rnd() * 0.4), p * (0.8 + rnd() * 0.4) * (o.pd ? dn : 1), o);
        }
      }
      if (t >= e) break; s = t - rnd() * Math.min(L * 0.2, 6);
    }
  };
  for (let v = v0 + rnd() * gap; v <= v1; v += gap * (0.7 + rnd() * 0.6)) {
    let st = null;
    for (let u = u0; ; u += ds) {
      const x = u * ca - v * sa, y = u * sa + v * ca, inn = u <= u1 && x >= bx0 && x <= bx1 && y >= by0 && y <= by1 && (!ins || ins(x, y));
      if (inn) { if (st === null) st = u; } else if (st !== null) { emit(st, u - ds, v); st = null; }
      if (u > u1) break;
    }
  }
}
// A contour drawn in several goes, lifting the pencil, pressing harder here and there.
function outline(P, tool, c, w, p, o) {
  o = o || {}; const Q = resamp(o.closed ? P.concat([P[0]]) : P, 4), ph = rnd() * 1e3, wob = o.wob === undefined ? 0.8 : o.wob, n = Q.length; if (n < 2) return;
  const M = Q.map((q, i) => { const a = Q[Math.max(0, i - 1)], b = Q[Math.min(n - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1, k = wob * (vn(i / 4 + ph, ph, 13) - .5) * 2; return [q[0] - ty / l * k, q[1] + tx / l * k]; });
  let i = 0;
  for (;;) {
    const len = Math.round(R(o.lmin || 6, o.lmax || 22)), j = Math.min(n - 1, i + len);
    if (j > i && !(o.gap && rnd() < o.gap)) stroke(M.slice(i, j + 1), tool, jc(c, o.cj === undefined ? 0.02 : o.cj), w * (0.8 + rnd() * 0.4), p * (0.7 + rnd() * 0.5), o);
    if (j >= n - 1) break; i = j - (rnd() < 0.5 ? 1 : 0);
  }
}
// Rub with a finger: colour softens and is pushed down into the tooth.
function smudge(x0, y0, x1, y1, rx, ry, k, mask) {
  const ax = Math.max(0, Math.floor(x0 * S)), ay = Math.max(0, Math.floor(y0 * S)), bx = Math.min(W, Math.ceil(x1 * S)), by = Math.min(H, Math.ceil(y1 * S)), w = bx - ax, h = by - ay; if (w < 2 || h < 2) return;
  const RX = Math.max(1, Math.round(rx * S)), RY = Math.max(1, Math.round(ry * S)), a = new Float32Array(w * h), b = new Float32Array(w * h), mk = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mk[y * w + x] = k * (mask ? mask((ax + x) / S, (ay + y) / S) : 1);
  for (const C of [CR, CG, CB]) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = C[(ay + y) * W + ax + x];
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) { let s = 0; const o = y * w; for (let x = -RX; x <= RX; x++) s += a[o + cl(x, 0, w - 1)];
        for (let x = 0; x < w; x++) { b[o + x] = s / (2 * RX + 1); s += a[o + cl(x + RX + 1, 0, w - 1)] - a[o + cl(x - RX, 0, w - 1)]; } }
      for (let x = 0; x < w; x++) { let s = 0; for (let y = -RY; y <= RY; y++) s += b[cl(y, 0, h - 1) * w + x];
        for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * RY + 1); s += b[cl(y + RY + 1, 0, h - 1) * w + x] - b[cl(y - RY, 0, h - 1) * w + x]; } }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const m = mk[y * w + x]; if (m > 0) { const i = (ay + y) * W + ax + x; C[i] += (a[y * w + x] - C[i]) * m; } }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) load[(ay + y) * W + ax + x] += 0.35 * mk[y * w + x];
}
// A soft bloom of pastel dust rubbed outward: uneven, and still broken by the grain.
function haze(cx, cy, rx, ry, c, k, pw) {
  pw = pw || 2; const ax = Math.max(0, Math.floor((cx - rx) * S)), bx = Math.min(W - 1, Math.ceil((cx + rx) * S)), ay = Math.max(0, Math.floor((cy - ry) * S)), by = Math.min(H - 1, Math.ceil((cy + ry) * S));
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    const dx = (x / S - cx) / rx, dy = (y / S - cy) / ry, d = dx * dx + dy * dy; if (d >= 1) continue; const i = y * W + x;
    let a = k * Math.pow(1 - d, pw) * (0.8 + 0.4 * paper[i]) * (0.8 + 0.4 * vn(x / S / 31, y / S / 31, 5)); if (a > 1) a = 1;
    CR[i] += (c[0] - CR[i]) * a; CG[i] += (c[1] - CG[i]) * a; CB[i] += (c[2] - CB[i]) * a;
  }
}
// Last look: raking light on the tooth, a breath of dust, the faint unevenness of a sheet lying on a desk.
// o: vignette (default 0.16; use ~0.04 for a full-bleed web band), relief (0.1), uneven (0.03)
function finish(o) {
  o = o || {}; const vg = o.vignette === undefined ? 0.16 : o.vignette, rl = o.relief === undefined ? 0.1 : o.relief, un = o.uneven === undefined ? 0.03 : o.uneven, ub = o.uneven === undefined ? 0.985 : 1 - o.uneven / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = paper[i], u = x / W - .5, v = y / H - .5;
    const m = (1 + rl * (t - .5)) * (1 - vg * (u * u + v * v) * 2) * (ub + un * vn(x / S / 260, y / S / 260, 8)), n = (ih(x, y, 99) - .5) * 0.018;
    CR[i] = cl(CR[i] * m + n); CG[i] = cl(CG[i] * m + n); CB[i] = cl(CB[i] * m + n);
  }
}
// Blend toward one flat colour wherever fn(x, y) says so (0..1, drawing units). Call after finish(), for art that
// has to melt into a page background: make the paper that colour, thin the strokes toward the edge, then matte it.
function matte(c, fn) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = fn(x / S, y / S); if (a <= 0) continue; if (a > 1) a = 1; const i = y * W + x;
    CR[i] += (c[0] - CR[i]) * a; CG[i] += (c[1] - CG[i]) * a; CB[i] += (c[2] - CB[i]) * a;
  }
}
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); }
// write the sheet (or a crop of it, in drawing units, optionally box-downsampled by an integer factor)
function png(file, crop, down) {
  down = down || 1; const c = crop || [0, 0, BW, BH], ax = Math.round(c[0] * S), ay = Math.round(c[1] * S), w = Math.floor(Math.round(c[2] * S) / down), h = Math.floor(Math.round(c[3] * S) / down);
  const raw = Buffer.alloc((w * 3 + 1) * h), k = 255 / (down * down); let o = 0;
  for (let y = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w; x++) { let r = 0, g = 0, b = 0;
    for (let j = 0; j < down; j++) for (let q = 0; q < down; q++) { const i = (ay + y * down + j) * W + ax + x * down + q; r += CR[i]; g += CG[i]; b += CB[i]; }
    raw[o++] = Math.round(r * k); raw[o++] = Math.round(g * k); raw[o++] = Math.round(b * k); } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 7 })), chunk('IEND', Buffer.alloc(0))]));
  console.log('wrote', file, w + 'x' + h);
}
return { S, BW, BH, W, H, rnd, R, pick, gs, cl, smooth, hx, mix, rampc, r5, jc, vn, fbm, T, makePaper, stroke, wline, resamp, spline, polyIn, discIn, hatch, outline, smudge, haze, finish, matte, png, count: () => strokes };
};
