'use strict';
// Habits of the hand, built on engine.js:   const K = require('./kit')(E);
// Everything here works in drawing units (the w x h given to the engine), never device pixels.
const path = require('path');
module.exports = function createKit(E) {
  const { BW, BH, rnd, R, pick, gs, cl, smooth, hx, mix, rampc, r5, jc, vn, fbm, T, stroke, wline, spline, polyIn, discIn, hatch, outline, smudge, haze } = E;
  const INK = hx('#2a2350');   // a violet-black pencil; pure black looks printed

  // ---------- shapes and regions ----------
  // A region is a test function (x, y) => bool that carries a .box = [x0, y0, x1, y1].
  const xf = (P, cx, cy, rot, sc) => { const c = Math.cos(rot), s = Math.sin(rot); return P.map(p => [cx + (p[0] * c - p[1] * s) * sc, cy + (p[0] * s + p[1] * c) * sc]); };   // place a local-coordinate shape
  const reg = P => typeof P === 'function' ? P : polyIn(P);
  const fnReg = (f, box) => { f.box = box; return f; };
  const ell = (cx, cy, rx, ry) => fnReg((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1, [cx - rx, cy - ry, cx + rx, cy + ry]);
  const circ = (x, y, r, n) => { const P = []; n = n || Math.max(10, Math.round(r * 1.2)); for (let i = 0; i < n; i++) { const a = i / n * 6.283; P.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } return P; };
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

  // ---------- the three moves almost everything is made of ----------
  // 1. block: lay in a shape with opaque pastel pencil, two directions. c is a colour or (x, y) => colour.
  //    o: w stroke radius, g gap multiplier (lower = denser), p pressure (use >1 for light over dark), ang, len, tool, single, dens
  function block(P, c, o) {
    o = o || {}; const f = reg(P), w = o.w || 2, a = o.ang === undefined ? -0.9 : o.ang, base = { box: f.box, in: f, tool: o.tool || T.pp, col: c, w, len: o.len || [16, 60], wob: o.wob === undefined ? 0.7 : o.wob, over: o.over === undefined ? 0.8 : o.over, cj: o.cj, dens: o.dens };
    hatch(Object.assign({}, base, { ang: a, gap: w * (o.g || 1.2), p: o.p || 1 }));
    if (!o.single) hatch(Object.assign({}, base, { ang: a + 1.25, gap: w * (o.g || 1.2) * 1.25, p: (o.p || 1) * 0.9 }));
    return f;
  }
  // 2. tone: glaze a shadow, a warm side, a blush over something already there. dens: (x, y) => 0..1 fades it.
  function tone(P, c, o) {
    o = o || {}; const f = reg(P);
    hatch({ box: f.box, in: f, ang: o.ang === undefined ? -0.95 : o.ang, gap: o.gap || 2.4, tool: o.tool || T.pencil, col: c, w: o.w || 0.9, p: o.p || 0.7, len: o.len || [12, 44], wob: 0.6, over: o.over === undefined ? 0.6 : o.over, cj: o.cj === undefined ? 0.03 : o.cj, dens: o.dens, pd: 1, skip: o.skip });
    return f;
  }
  // 3. edge: a contour drawn in several goes. o: closed, w, p, gap (chance of lifting the pencil), tool
  const edge = (P, c, o) => { o = o || {}; outline(P, o.tool || T.pencil, c || INK, o.w || 0.8, o.p || 0.85, o); };

  // ---------- small marks ----------
  const dot = (x, y, r, c, p, tool) => stroke([[x - 0.3, y - 0.2], [x + 0.3, y + 0.2]], tool || T.chalk, c, r, p, { tin: 0, tout: 0 });
  const ln = (x0, y0, x1, y1, tool, c, w, p, o) => stroke(wline(x0, y0, x1, y1, o && o.wob !== undefined ? o.wob : 0.4, o && o.bow || 0), tool, c, w, p, o);
  function twinkle(x, y, s, c) {
    ln(x - s, y, x + s, y, T.chalk, c, 0.5, 0.95, { tin: 0.5, tout: 0.5, lo: 0.05, wob: 0.15 });
    ln(x, y - s * 1.3, x, y + s * 1.3, T.chalk, c, 0.5, 0.95, { tin: 0.5, tout: 0.5, lo: 0.05, wob: 0.15 });
    dot(x, y, Math.max(0.8, s * 0.13), c, 1);
  }
  // a short pressed mark, fat in the middle: a leaf, a petal, a flick of grass
  const mark = (x, y, a, len, w, c, tool, p) => stroke(wline(x - Math.cos(a) * len / 2, y - Math.sin(a) * len / 2, x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2, 0.2, gs() * 0.12), tool || T.pp, c, w, p || R(0.7, 1), { tin: 0.45, tout: 0.45, lo: 0.1 });

  // ---------- big soft areas: sky, water, a wall of mist ----------
  // Pastel laid on its side twice, rubbed in with a finger, then a lighter second skin so the grain sparkles.
  // o.pencil: a colour to add patchy one-slant pencil hatching on top (keep it; it is what makes a sky look worked on)
  // o.dens: (x, y) => 0..1 thins the whole field out, e.g. toward an edge where it should dissolve into bare paper
  function field(box, colFn, o) {
    o = o || {}; const w = o.w || 12, dn = o.dens, pd = dn ? 1 : 0, pk = o.pencilK === undefined ? 0.28 : o.pencilK;
    hatch({ box, ang: 0.02, gap: w * 0.67, tool: T.pastel, col: colFn, w, p: 1, len: o.len || [180, 460], wob: 3, over: 30, aj: 0.02, dens: dn, pd });
    hatch({ box, ang: -0.07, gap: w * 0.92, tool: T.pastel, col: colFn, w, p: 0.9, len: [160, 400], wob: 3, over: 30, cj: 0.03, dens: dn, pd });
    smudge(box[0], box[1], box[2], box[3], o.rx || 26, o.ry || 10, o.rub === undefined ? 0.85 : o.rub);
    hatch({ box, ang: 0.03, gap: w * 0.83, tool: T.pastel, col: (x, y) => colFn(x + R(-80, 80), y + gs() * 10), w: w * 0.75, p: 0.5, len: [90, 300], wob: 3, over: 20, cj: 0.03, skip: 0.2, dens: dn, pd });
    if (o.pencil) hatch({ box, ang: -0.95, gap: 7, tool: T.pencil, col: (x, y) => mix(colFn(x, y), o.pencil, pk), w: 0.75, p: 0.34, len: [22, 70], wob: 0.8, skip: 0.3, cj: 0.03, dens: (x, y) => (0.15 + 0.75 * smooth(0.35, 0.7, vn(x / 280, y / 170, 77))) * (dn ? dn(x, y) : 1) });
  }

  // ---------- billowing things: cloud, smoke, steam, foam, tree crowns ----------
  // Built from overlapping discs. Each dab asks how much its spot faces the light, then snaps to one of five sticks.
  // A light spec C: { seed, L(x,y)->[x,y,z], kl, kx, ky, gx(x,y), gy(x,y), col(tone, x, y), bias }
  function toneOf(px, py, nx, ny, nz, C, bias) {
    const L = C.L(px, py), l = (nx * L[0] + ny * L[1] + nz * L[2]) * (C.kl || 0.62) + (C.gx(px, py) - .5) * C.kx + (C.gy(px, py) - .45) * C.ky + (fbm(px / 170 + C.seed, py / 170, 3, 3) - .5) * 0.5 + (bias || 0) + (C.bias || 0);
    return cl(Math.floor(smooth(-0.45, 0.8, l) * 5 + rnd()) / 5);
  }
  function puff(x, y, r, C, clip) {
    const d = discIn(x, y, r, 0.1, 31), inn = clip ? (px, py) => d(px, py) && clip(px, py) : d;
    hatch({ box: d.box, in: inn, ang: R(3.14), gap: Math.max(2.2, r * 0.058), tool: T.pastel, col: C.col(toneOf(x, y, 0, 0, 1, C, -0.15), x, y), w: Math.max(2.4, r * 0.085), p: 1, len: [r * 0.5, r * 1.3], wob: 1.5, over: 1.5, cj: 0.015 });
    const n = Math.round(r * r / 70) + 8;
    for (let i = 0; i < n; i++) {
      const a = R(6.283), q = Math.sqrt(rnd()) * 0.96, nx = Math.cos(a) * q, ny = Math.sin(a) * q, nz = Math.sqrt(1 - q * q), px = x + nx * r, py = y + ny * r;
      if (clip && !clip(px, py)) continue;
      // short fat presses of the stick, following the roundness (long thin ones look like fur)
      const c = C.col(toneOf(px, py, nx, ny, nz, C), px, py), len = Math.min(44, r * (0.16 + rnd() * 0.22) * (0.6 + q * 0.5)), rr = q * r, pts = [];
      for (let k = 0; k <= 4; k++) { const t = k / 4 - .5; if (rr > 4) { const aa = a + t * len / rr; pts.push([x + Math.cos(aa) * rr + gs() * 0.4, y + Math.sin(aa) * rr + gs() * 0.4]); } else pts.push([px + t * len, py + gs()]); }
      stroke(pts, T.pastel, jc(c, 0.02), Math.max(2, len * R(0.3, 0.5)), R(0.6, 0.95), { tin: 0.3, tout: 0.3, lo: 0.5 });
    }
  }
  // turn a handful of big hand-placed circles [x, y, r] into a cauliflower of smaller ones, back to front
  function buildPuffs(nodes) {
    const cores = [], puffs = [];
    for (const [x, y, r] of nodes) {
      cores.push({ x, y, r }); const n = Math.round(8 + r / 8);
      for (let i = 0; i < n; i++) {
        const a = R(6.283), d = r * (0.45 + rnd() * 0.6), pr = r * (0.28 + rnd() * 0.32), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.9; puffs.push({ x: px, y: py, r: pr });
        const k = (rnd() * 3.4) | 0; for (let j = 0; j < k; j++) { const b = R(Math.PI * 0.95, Math.PI * 1.9); puffs.push({ x: px + Math.cos(b) * pr * 0.9, y: py + Math.sin(b) * pr * 0.9, r: pr * R(0.3, 0.5) }); }
      }
    }
    cores.sort((a, b) => a.y - b.y); puffs.sort((a, b) => a.y - b.y); return cores.concat(puffs);
  }
  const n3 = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  // A light spec for an ordinary cloud. dir: where the light comes from. x0: the x of its lit edge, x1: its shadowed edge.
  // yBase/yTop: the cloud's foot and crown. hi/lo: five colours, darkest to lightest, for the crown and for the foot.
  function cloudSpec(o) {
    const L = n3(o.dir || [-0.72, -0.36, 0.6]), hi = r5(o.hi), lo = r5(o.lo || o.hi), h = o.yBase - o.yTop;
    return { seed: o.seed || 3, kl: o.kl, kx: o.kx === undefined ? 0.55 : o.kx, ky: o.ky === undefined ? 0.5 : o.ky, L: () => L,
      gx: x => o.x1 === undefined ? 0.5 : 1 - cl((x - o.x0) / (o.x1 - o.x0)), gy: (x, y) => cl((o.yBase - y) / h),
      col: (t, x, y) => mix(rampc(lo, t), rampc(hi, t), smooth(0.05, 0.8, cl((o.yBase - y) / h))) };
  }
  const cloud = (nodes, C, clip) => { for (const p of buildPuffs(nodes)) puff(p.x, p.y, p.r, C, clip); };
  // a scribbled ball of leaves; side = +1 when the light is to its right, k = how many leaves catch it
  // litA/litB: the two colours lit leaves pick between; midA/midB: the two the rest lean toward (hex strings)
  function bush(x, y, r, dark, side, k, litA, litB, midA, midB) {
    const f = discIn(x, y, r, 0.25, 61);
    block(f, dark, { w: Math.max(1.2, r * 0.11), ang: R(3.14), len: [r * 0.4, r], single: r < 10 });
    const n = Math.round(r * r / 9) + 4, la = hx(litA || '#f0a070'), lb = hx(litB || '#ffd890'), ma = midA || '#3f7a70', mb = midB || '#2c4f8a';
    for (let i = 0; i < n; i++) {
      const a = R(6.283), q = Math.sqrt(rnd()), px = x + Math.cos(a) * q * r, py = y + Math.sin(a) * q * r, l = cl((Math.cos(a) * side * 0.7 - Math.sin(a) * 0.6) * q + 0.15);
      const c = l > 0.55 && rnd() < k ? mix(la, lb, rnd()) : mix(dark, hx(rnd() < 0.5 ? ma : mb), l * 0.7 + rnd() * 0.2);
      mark(px, py, R(6.283), R(4, 10) * Math.max(1, r / 14), Math.max(0.8, r * 0.06), c);
    }
  }

  // ---------- signing and running ----------
  // "Claude" in one cursive line. (x, y) is the left end of the baseline; sc 2.3 suits a 1920-wide sheet.
  function sign(x, y, sc, c) {
    sc = sc || 2.3; c = c || hx('#fff2e0');
    const G = [[10, -18], [4, -22], [-2, -16], [-4, -6], [0, 0], [8, -1], [12, -5], [16, -14], [18, -22], [15, -23], [14, -10], [16, -1], [20, -3], [26, -9], [23, -10], [20, -5], [23, -1], [27, -8], [27, -2], [30, -1], [32, -4], [34, -9], [33, -2], [37, -1], [40, -9], [40, -2], [43, -1], [45, -4],
      [50, -9], [47, -10], [44, -5], [47, -1], [51, -10], [52, -22], [51, -8], [53, -1], [56, -3], [61, -7], [60, -10], [57, -6], [60, -1], [66, -3], [72, -8]];
    stroke(spline(G.map(p => [x + p[0] * sc, y + p[1] * sc - p[0] * 0.05 * sc]), false, 6), T.pp, c, 0.33 * sc, 0.95, { tin: 0.02, tout: 0.06, lo: 0.5 });
    ln(x - 3 * sc, y + 3.5 * sc, x + 76 * sc, y - 2.6 * sc, T.pp, c, 0.22 * sc, 0.7, { bow: 0.02, wob: 0.6 });
  }
  // Paint the stages in order, finish the sheet, write the PNG next to the scene file.
  //   node scene.js [out.png] [name:x,y,w,h[:down] ...]   crops are in drawing units; :2 halves the crop
  //   UPTO=<stage name> stops after that stage
  //   o.finish: options for E.finish();  o.after: a function run after finish (e.g. E.matte toward a page colour)
  function run(stages, outName, o) {
    const t0 = Date.now(), upto = process.env.UPTO || '', dir = path.dirname(require.main.filename);
    for (const [name, fn] of stages) { fn(); console.log(name.padEnd(14), ((Date.now() - t0) / 1000).toFixed(1) + 's', E.count() + ' strokes'); if (name === upto) break; }
    E.finish(o && o.finish); if (o && o.after) o.after();
    E.png(path.join(dir, process.argv[2] || outName || 'painting.png'));
    for (const a of process.argv.slice(3)) { const [name, c, d] = a.split(':'); E.png(path.join(dir, name + '.png'), c.split(',').map(Number), +(d || 1)); }
  }
  return { INK, xf, reg, fnReg, ell, circ, rect, block, tone, edge, dot, ln, twinkle, mark, field, toneOf, puff, buildPuffs, n3, cloudSpec, cloud, bush, sign, run };
};
