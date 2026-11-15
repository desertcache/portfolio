'use strict';
// The painted skyline above the homepage footer: one place at five hours. The site shows the one that fits the
// visitor's theme and the time in Phoenix (js/hours.js).
//   MODE=light   first light   (light theme, mornings)        MODE=golden   golden hour (light theme, afternoons)
//   MODE=dark    last light    (dark theme, evenings)         MODE=night    deep night under the Milky Way
//   MODE=monsoon a summer storm at dusk (dark theme, evenings from 15 June to 30 September)
//   MODE=<mode> S=2 node scripts/paint/camelback.js   -> scripts/paint/out/camelback-<morning|golden|dusk|night|monsoon>.png
// The light family melts into #f3ebe6 at the top, the dark family into #150f24.
// then: python scripts/paint/export_assets.py   (writes the files the site serves into assets/painted/)
// Seen from the south, the kneeling camel faces west: head on the left, hump and summit (2,706 ft) on the right.
// Soft pastel, pastel pencil, colour pencil and chalk, drawn in plain JavaScript (engine.js, kit.js). See DEV-NOTES.md.
const E = require('./engine')({ w: 2400, h: 1200, seed: 2706 });
const K = require('./kit')(E);
const { BW, BH, rnd, R, pick, gs, cl, smooth, hx, mix, rampc, r5, jc, vn, fbm, T, stroke, spline, polyIn, discIn, hatch, haze } = E;
const { rect, fnReg, circ, xf, block, tone, edge, dot, ln, twinkle, mark, field, bush, cloud, cloudSpec, sign, run } = K;

const M = { light: 'light', golden: 'golden', dark: 'dark', night: 'night', monsoon: 'monsoon' }[process.env.MODE || 'dark'] || 'dark';
const D = M !== 'light' && M !== 'golden';              // the dark family
const GOLD = M === 'golden', NIGHT = M === 'night', STORM = M === 'monsoon';
const NAME = { light: 'morning', golden: 'golden', dark: 'dusk', night: 'night', monsoon: 'monsoon' }[M];
// Every colour is written once per family, then leaned toward the hour: golden hour warms the lights and purples
// the shadows; deep night cools and dims whatever the sunset had lit; the storm greys the ground and turns the
// warm rims into the pale violet of lightning.
function adapt(q) {
  const k = (q[0] + q[1] + q[2]) / 3, warm = q[0] - q[2] > 0.1;
  if (GOLD) return mix(mix(q, hx('#ff9440'), 0.16), hx('#7a3f86'), k < 0.45 ? 0.16 : 0);
  if (NIGHT) return warm ? [k * 0.42, k * 0.5, k * 0.86] : mix(q, hx('#0e1434'), 0.42);
  if (STORM) return warm ? mix(q, hx('#b8b0e8'), 0.62).map(u => u * 0.85) : mix(q, hx('#252840'), 0.3);
  return q;
}
const toHex = q => '#' + q.map(u => Math.round(cl(u) * 255).toString(16).padStart(2, '0')).join('');
const c = (d, l) => adapt(hx(D ? d : l)), v = (d, l) => toHex(adapt(hx(D ? d : l)));
const BG = hx(D ? '#150f24' : '#f3ebe6'), INK = c('#0d0919', '#4a3f56');
const HZ = 800;                                        // where the mountain meets the valley floor
// Where the light comes from: the east in the morning, the west at golden hour and at dusk, and in the storm
// from its own flashes, which are to the east.
const LX = M === 'light' || STORM ? 1 : -1;
const GLOW = { light: [2130, HZ], golden: [300, HZ - 30], dark: [330, HZ], night: [1500, HZ + 60], monsoon: [140, HZ] }[M];
const LV = LX > 0 ? [0.9, -0.44] : [-0.94, -0.34];

// ---------- the mountain's outline: the portfolio's own skyline, which is real elevation data ----------
// assets/skyline.svg is the site's footer skyline (scripts/build_terrain.py): the horizon looking north from about
// 8 km south-southwest of Camelback, heights doubled. This sheet shows its right-hand 861 units at the same
// proportions, so the painted ridge is the same ridge the site draws. Nothing about its shape is invented here.
const SKP = [...require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'assets', 'skyline.svg'), 'utf8').match(/ d="([^"]+)"/)[1].matchAll(/[ML]\s*([\d.]+)[ ,]([\d.]+)/g)].map(m => [+m[1], 155 - +m[2]]);
const XS0 = 739, KX = BW / (1600 - XS0);
const skyH = sx => { if (sx <= SKP[0][0]) return SKP[0][1]; let i = 1; while (i < SKP.length - 1 && SKP[i][0] < sx) i++; const a = SKP[i - 1], b = SKP[i]; return a[1] + (b[1] - a[1]) * cl((sx - a[0]) / ((b[0] - a[0]) || 1)); };
const own = sx => smooth(1000, 1045, sx) * (1 - smooth(1535, 1570, sx));     // how much of the horizon at this bearing is Camelback itself
const HT = new Float32Array(BW + 3), FAR = new Float32Array(BW + 3);          // Camelback, and the Phoenix Mountains farther off
for (let x = 0; x <= BW + 2; x++) { const sx = Math.min(1600, XS0 + x / KX), h = skyH(sx) * KX, k = own(sx); HT[x] = h * k; FAR[x] = h * (1 - k); }
const farH = x => FAR[cl(Math.round(x), 0, BW + 2)];
const hgt = x => { if (x < 0 || x > BW + 1) return 0; const i = Math.floor(x), f = x - i; return HT[i] + (HT[i + 1] - HT[i]) * f; };
const ridge = x => HZ - hgt(x), slope = x => (hgt(x + 14) - hgt(x - 14)) / 28;        // slope > 0: that stretch faces west
const fgY = x => 950 - 52 * ((x - 1200) / 1200) ** 2 + 14 * (fbm(x / 95, 2, 301, 2) - .5);   // the rise we stand on

// ---------- the place itself, decided once before any paint, so both times of day share it ----------
const L = { trees: [], roofs: [], palms: [], homes: [], shrubs: [], brittle: [] };
for (let i = 0; i < 190; i++) { const t = Math.pow(rnd(), 1.4); L.trees.push({ x: R(-20, BW + 20), y: HZ + t * 98, r: (7 + t * 15) * R(0.7, 1.3) }); }
for (let i = 0; i < 170; i++) { const t = Math.pow(rnd(), 1.2); L.roofs.push({ x: R(0, BW), y: HZ + 6 + t * 84, s: 0.5 + t * 0.9, k: (rnd() * 3) | 0, lit: rnd() < 0.72, w: R(16, 30) }); }
for (let i = 0; i < 28; i++) { const t = rnd(); L.palms.push({ x: R(30, BW - 30), y: HZ + 12 + t * 80, h: (34 + t * 58) * R(0.8, 1.25), lean: gs() * 0.08 }); }
for (let i = 0; i < 90; i++) { const x = R(770, 2260); L.homes.push({ x, up: Math.pow(rnd(), 1.8) * Math.min(64, hgt(x) * 0.3), lit: rnd() < 0.7 }); }
for (let i = 0; i < 46; i++) L.shrubs.push({ x: R(-10, BW + 10), t: rnd(), r: R(16, 30) });
for (let i = 0; i < 20; i++) L.brittle.push({ x: R(40, BW - 40), t: rnd(), r: R(18, 30) });

// ---------- sky ----------
const SKY = ({
  light: [[0, '#f3ebe6'], [0.22, '#f0e8e4'], [0.45, '#e6e4ea'], [0.62, '#f1dfd2'], [0.78, '#f7cbab'], [0.9, '#f5a985'], [1, '#ee9684']],
  golden: [[0, '#f3ebe6'], [0.2, '#f3e6da'], [0.42, '#f1dcc6'], [0.6, '#f6cfa4'], [0.76, '#f9b676'], [0.9, '#f6955c'], [1, '#ea7a58']],
  dark: [[0, '#150f24'], [0.25, '#1d1638'], [0.42, '#33215a'], [0.56, '#5c2f74'], [0.68, '#a8477e'], [0.8, '#e86a6a'], [0.9, '#ff8a4d'], [1, '#ffb066']],
  night: [[0, '#150f24'], [0.3, '#15112e'], [0.6, '#191640'], [0.85, '#221d4e'], [1, '#2f2658']],
  monsoon: [[0, '#150f24'], [0.25, '#191430'], [0.5, '#272042'], [0.7, '#3a2c56'], [0.86, '#583a64'], [1, '#8a4c60']],
})[M].map(([p, h]) => [p, hx(h)]);
// the colour and strength of the glow where the light is, and what the sky far from it leans toward
const GLOWC = { light: ['#fff3d6', 0.72], golden: ['#fff0c4', 0.8], dark: ['#ffd08a', 0.6], night: ['#4a3a6a', 0.35], monsoon: ['#e0703c', 0.5] }[M];
const FARC = hx({ light: '#dccfe0', golden: '#e6c8d0', dark: '#3a2a66', night: '#141230', monsoon: '#221c3c' }[M]);
function skyCol(x, y) {
  const t = cl(y / HZ), dx = (x - GLOW[0]) / 900, dy = (y - GLOW[1]) / 380;
  const col = mix(rampc(SKY, t), hx(GLOWC[0]), Math.exp(-(dx * dx + dy * dy) * 1.8) * GLOWC[1]);
  return mix(col, FARC, cl(Math.abs(x - GLOW[0]) / 1700) * smooth(0.55, 0.95, t) * 0.55);
}
function sky() {
  // the strokes thin out toward the top, so the picture dissolves into the bare page-coloured paper
  field([-20, 24, BW + 20, HZ + 40], skyCol, { pencil: c('#2a1a52', '#b9a2b4'), dens: (x, y) => smooth(34, 300, y) });
  if (NIGHT) return;                 // no sun to light a cloud from below
  haze(GLOW[0], GLOW[1] - 20, 320, 210, hx({ light: '#fff8e6', golden: '#fff0c4', dark: '#ffb066', monsoon: '#e0703c' }[M]), D ? 0.28 : 0.5);
  for (let i = 0; i < 14; i++) {      // thin bars of cloud near the light, lit from underneath
    const y = R(600, 770), x = GLOW[0] + gs() * 520, len = R(140, 460), th = R(3.5, 8), ng = Math.exp(-(((x - GLOW[0]) / 500) ** 2));
    for (let k = 0; k < 4; k++) { const yy = y + R(-th * .4, th * .4); ln(x - len / 2 + R(-40, 40), yy, x + len / 2 * R(.5, 1), yy, T.pastel, jc(mix(c('#6a3f86', '#e6c4cc'), c('#b8527e', '#f4d2c4'), rnd()), 0.03), th, R(0.55, 0.85), { tin: 0.3, tout: 0.4, wob: 2 }); }
    for (let k = 0; k < 3; k++) ln(x - len / 2 + R(-30, 30), y + th * .7, x + len / 2 * R(.4, .8), y + th * .7, T.pastel, jc(mix(c('#ff8f5a', '#fff6e4'), c('#ffe0a0', '#ffffff'), ng * rnd()), 0.03), th * 0.45, R(0.6, 0.9), { tin: 0.3, tout: 0.4, wob: 1.5 });
  }
}
const SC = ['#ffffff', '#e6dcff', '#ffe9d0', '#ffd0e6'].map(hx);
// golden hour: the sun low over the Phoenix Mountains, and fair-weather cloud catching it
function afternoon() {
  haze(300, 548, 300, 250, hx('#fff2c4'), 0.6, 1.6);
  block(discIn(300, 548, 27, 0.03), hx('#fffaf0'), { tool: T.pastel, w: 3, g: 0.8, p: 1.3, len: [10, 40] });
  const hi = ['#e2bcb4', '#f2c8aa', '#fad8b4', '#ffe8c8', '#fff8ea'], lo = ['#d4aeb0', '#eabea6', '#f6ceaa', '#fde0be', '#fff4e0'];
  cloud([[1820, 322, 60], [1904, 296, 72], [1992, 326, 56], [1744, 340, 40]], cloudSpec({ dir: [-0.78, -0.3, 0.55], x0: 1700, x1: 2060, yBase: 372, yTop: 220, hi, lo, seed: 5 }), (x, y) => y < 366 + 10 * (vn(x / 40, 3, 61) - .5));
  cloud([[1238, 232, 34], [1292, 220, 44], [1350, 236, 34]], cloudSpec({ dir: [-0.78, -0.3, 0.55], x0: 1200, x1: 1390, yBase: 262, yTop: 172, hi, lo, seed: 8 }), (x, y) => y < 258 + 8 * (vn(x / 40, 5, 63) - .5));
}
// deep night: no moon, the valley half asleep, and the Milky Way standing up out of the east behind the summit
function deepNight() {
  for (let i = 0; i < 1100; i++) { const y = 96 + Math.pow(rnd(), 1.15) * 580; dot(R(BW), y, R(0.3, 1.0), pick(SC), R(0.4, 1) * cl(1.2 - (y - 96) / 640)); }
  for (let i = 0; i < 30; i++) twinkle(R(BW), 120 + Math.pow(rnd(), 1.2) * 420, R(3.5, 9), pick(SC));
  const A = [520, 150], B = [2260, 640], dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  const P = (t, o) => [A[0] + dx * t + nx * o, A[1] + dy * t + ny * o], up = y => smooth(150, 300, y);
  for (let i = 0; i < 280; i++) { const [x, y] = P(rnd(), gs() * 64); haze(x, y, R(60, 150), R(34, 80), hx(pick(['#5a4aa8', '#7a4a9a', '#4a5ab0', '#8a5a9a'])), 0.05 * up(y), 1.6); }
  for (let i = 0; i < 100; i++) { const [x, y] = P(rnd(), gs() * 26 - 8); haze(x, y, R(30, 80), R(18, 40), hx('#d8c8e8'), 0.05 * up(y), 1.5); }     // its bright core
  for (let i = 0; i < 70; i++) { const [x, y] = P(R(0.05, 0.95), gs() * 20 + 14); haze(x, y, R(30, 90), R(10, 22), hx('#120e26'), 0.1, 1.4); }       // dust lanes
  for (let i = 0; i < 5600; i++) { const [x, y] = P(rnd(), gs() * 58); if (y < 100) continue; dot(x, y, R(0.25, 0.8), pick(SC), R(0.3, 0.9) * smooth(100, 260, y)); }
  stroke([[1010, 250], [1064, 282], [1120, 318]], T.chalk, hx('#fffaf0'), 0.8, 0.95, { tin: 0.7, tout: 0.02, lo: 0.02 }); dot(1120, 318, 1.1, hx('#ffffff'), 1);   // one meteor
}
// monsoon: a thunderhead standing behind the mountain, lit from inside, with the last ember of the day under its edge
function storm() {
  for (let i = 0; i < 160; i++) { const y = 110 + Math.pow(rnd(), 1.3) * 420, x = R(0, 760); dot(x, y, R(0.35, 1.0), pick(SC), R(0.45, 1) * cl(1.15 - (y - 110) / 470) * (1 - smooth(480, 760, x))); }
  const hi = ['#15112a', '#1d1838', '#292148', '#372b56', '#473864'], lo = ['#1c1730', '#31254a', '#573a5e', '#864a5c', '#c2664c'];
  const spec = cloudSpec({ dir: [-0.75, 0.32, 0.55], x0: 640, x1: 2400, yBase: 660, yTop: 190, hi, lo, seed: 12 });
  cloud([[1250, 430, 150], [1500, 380, 190], [1780, 400, 200], [2050, 380, 190], [2310, 420, 180], [1050, 510, 110], [1380, 530, 130], [1650, 550, 140], [1950, 550, 150], [2250, 550, 150], [860, 572, 80]], spec,
    (x, y) => y < 668 + 30 * (fbm(x / 160, 3, 67, 2) - .5));
  for (let i = 0; i < 420; i++) {      // rain, falling out of its eastern half
    const x = R(1640, BW + 60), y = R(560, 700), len = R(90, 220);
    ln(x, y, x - len * 0.2, y + len, T.pastel, jc(mix(hx('#2c2748'), hx('#4a3c62'), rnd()), 0.02), R(2, 6), R(0.2, 0.42), { tin: 0.2, tout: 0.5, wob: 1.5 });
  }
  haze(1120, 400, 330, 210, hx('#b8a8f2'), 0.3, 1.5);      // the flash inside it
  const bolt = (x, y, ey, w, sway) => { const pts = [[x, y]]; while (y < ey) { y += R(10, 26); x += gs() * sway - 1.5; pts.push([x, y]); }
    stroke(pts.map(p => [p[0] + 1.2, p[1]]), T.pastel, hx('#a898ee'), w * 3, 0.5, { tin: 0.02, tout: 0.1 }); stroke(pts, T.chalk, hx('#fbf6ff'), w, 1, { tin: 0.02, tout: 0.1 }); return pts; };
  const main = bolt(1096, 322, 560, 1.5, 10), fork = main[(main.length * 0.4) | 0]; bolt(fork[0], fork[1], fork[1] + 90, 0.8, 13);
  haze(2300, 500, 260, 210, hx('#a898ee'), 0.26, 1.6); bolt(2338, 478, 792, 1.2, 9);      // a second, out to the east
  haze(1716, 330, 200, 120, hx('#9a8ae0'), 0.16, 1.6);                                    // and a flicker with no bolt
}
function dusk() {
  for (let i = 0; i < 520; i++) { const y = 110 + Math.pow(rnd(), 1.3) * 470; dot(R(BW), y, R(0.35, 1.05), pick(SC), R(0.45, 1) * cl(1.15 - (y - 110) / 470)); }
  for (let i = 0; i < 22; i++) twinkle(R(BW), 130 + Math.pow(rnd(), 1.2) * 360, R(3.5, 8.5), pick(SC));
  const mx = 610, my = 316, mr = 24, arc = []; for (let a = 0.68; a <= 3.48; a += 0.14) arc.push([mx + Math.cos(a) * mr, my + Math.sin(a) * mr]);   // a young moon, lit from where the sun went
  haze(mx, my, 76, 76, hx('#ffe6d0'), 0.12, 2);
  stroke(arc, T.chalk, hx('#fff0dc'), 3, 1, { tin: 0.5, tout: 0.5, lo: 0.02 }); stroke(arc.map(p => [p[0] + 0.6, p[1] - 1.2]), T.chalk, hx('#fffaf0'), 1.8, 1, { tin: 0.45, tout: 0.45, lo: 0.02 });
}
function balloon(x, y, r, cols) {
  const env = []; for (let i = 0; i <= 28; i++) { const a = Math.PI * (0.84 + 1.32 * i / 28); env.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  const P = env.concat([[x + r * 0.2, y + r * 1.42], [x - r * 0.2, y + r * 1.42]]), n = cols.length;
  const hw = py => py <= y ? Math.sqrt(Math.max(1, r * r - (py - y) ** 2)) : r * (1 - 0.8 * (py - y) / (r * 1.42));
  block(P, (px, py) => { const u = cl((px - x) / hw(py), -1, 1), k = Math.floor((Math.asin(u) / Math.PI + 0.5) * 8), base = hx(cols[((k % n) + n) % n]); return mix(mix(base, hx('#fffaf0'), cl(u) * 0.3), hx('#8a6f9a'), cl(-u) * 0.4); },
    { w: Math.max(1.1, r * 0.045), g: 0.85, ang: Math.PI / 2, len: [r * 0.3, r * 1.2], p: 1.15 });
  for (let g = 1; g < 8; g++) { const u = Math.sin((g / 8 - .5) * Math.PI), Q = []; for (let py = y - r * 0.98; py <= y + r * 1.4; py += r * 0.12) Q.push([x + u * hw(py), py]); stroke(Q, T.pencil, hx('#7a6690'), 0.4, 0.5, { tin: 0.1, tout: 0.1 }); }
  edge(P, hx('#6a5a7c'), { closed: true, w: 0.55, p: 0.7 });
  for (const sd of [-1, 1]) ln(x + sd * r * 0.2, y + r * 1.42, x + sd * r * 0.13, y + r * 1.62, T.pencil, hx('#5a4a66'), 0.4, 0.8, { wob: 0.1 });
  haze(x, y + r * 1.46, r * 0.34, r * 0.34, hx('#ffb060'), 0.5);
  block(rect(x - r * 0.15, y + r * 1.62, x + r * 0.15, y + r * 1.84), hx('#7a5038'), { w: Math.max(0.8, r * 0.03), single: true, ang: 0, len: [2, 8], p: 1.2, g: 0.8 });
}
function morning() {
  balloon(640, 300, 50, ['#a8401d', '#f6efe8', '#c42c6c', '#f2c230']); balloon(930, 400, 30, ['#3f6420', '#f6efe8', '#f2c230']); balloon(430, 440, 19, ['#c42c6c', '#f6efe8', '#a8401d']);
}

// ---------- far ranges, pale with distance ----------
function farRanges() {      // the rest of the same real horizon: the Phoenix Mountains to the west, a low rise to the east
  const P = [[-10, HZ + 12]]; for (let x = -10; x <= BW + 10; x += 5) P.push([x, HZ - farH(x)]); P.push([BW + 10, HZ + 12]);
  const fs = x => (farH(x + 12) - farH(x - 12)) / 24;
  const dim = NIGHT || STORM;
  block(P, x => { const q = mix(mix(c('#4d2f6c', '#cdb0c4'), c('#33235a', '#e2bfae'), smooth(900, 2300, x)), c('#9a4a78', '#f0d2c4'), dim ? 0 : cl(0.5 - LX * fs(x) * 1.6) * 0.8); return dim ? mix(q, BG, 0.5) : q; }, { w: 2.6, tool: T.pastel, ang: 0.06, len: [20, 80] });
  tone(P, c('#241846', '#b89cb4'), { p: 0.4, gap: 3.2, dens: () => 0.4 });
}

// ---------- Camelback ----------
const MR = r5({ light: ['#6a4a7c', '#96607a', '#c87a62', '#e8a47e', '#f8cea8'], golden: ['#683e78', '#a0546c', '#da7448', '#f39a5a', '#ffca8c'], dark: ['#150f27', '#1a122f', '#201638', '#271a42', '#31204d'],
  night: ['#0c0a1c', '#100d24', '#15122c', '#1a1736', '#221e42'], monsoon: ['#121022', '#1a172e', '#24203c', '#30294a', '#463a5e'] }[M]);
// The mountain's form: which flank a point is on (easing through zero at a summit, so no seam), and spurs that
// run down and outward from the crest, each with a west side and an east side.
const flank = x => Math.tanh((hgt(x + 60) - hgt(x - 60)) / 120 * 4);
const spur = (x, y) => Math.sin(6.283 * ((x + flank(x) * (y - ridge(x)) * 0.9) / 150 + 1.6 * fbm(x / 260, y / 180, 257, 2)));
function mCol(x, y) {
  const h = hgt(x), depth = cl((y - (HZ - h)) / Math.max(50, h));
  const l = 0.5 - LX * flank(x) * 0.26 - LX * spur(x, y) * 0.34 + (0.5 - depth) * 0.1 + (fbm(x / 70, y / 50, 251, 3) - .5) * 0.36;
  let col = rampc(MR, cl(Math.floor(cl(l) * 5 + rnd()) / 5));
  if (x < 1240) col = mix(col, c('#4a2046', '#c05a3a'), 0.22 * smooth(1240, 1150, x));     // the head is redder rock than the hump
  return mix(col, c('#3b2760', '#ecccb8'), Math.pow(depth, 1.6) * (D ? 0.5 : 0.42));        // haze gathers at its foot
}
function mountain() {
  const on = (x, y) => x > 722 && x < 2308 && y > ridge(x) && y < HZ + 26, box = [722, 350, 2308, HZ + 26];
  block(fnReg((x, y) => on(x, y) && spur(x, y) > 0, box), mCol, { w: 2.6, g: 1, ang: Math.PI / 2 + 0.55, len: [14, 50], p: 1.15 });      // strokes run down each side of a spur
  block(fnReg((x, y) => on(x, y) && spur(x, y) <= 0, box), mCol, { w: 2.6, g: 1, ang: Math.PI / 2 - 0.55, len: [14, 50], p: 1.15 });
  for (let i = 0; i < 120; i++) {      // gullies
    const x = R(760, 2280), h = hgt(x); if (h < 40) continue;
    const a = Math.PI / 2 + (slope(x) > 0 ? 1 : -1) * R(0.25, 0.7), y0 = ridge(x) + R(3, h * 0.3), len = R(30, h * 0.6);
    ln(x, y0, x + Math.cos(a) * len, y0 + Math.sin(a) * len, T.pencil, c('#0f0a20', '#6a4a78'), 0.8, R(0.35, 0.6), { wob: 2.5, bow: gs() * 0.05, tin: 0.05, tout: 0.4 });
  }
  for (let i = 0; i < 760; i++) {      // the hump is granite: lumps and boulders
    const x = R(1235, 2290), h = hgt(x); if (h < 30) continue; const y = ridge(x) + R(4, h * 0.82);
    mark(x, y, R(-0.5, 0.5), R(5, 12), R(1.4, 2.6), jc(mix(mCol(x, y), rnd() < 0.5 ? c('#3a2452', '#fbd8b6') : c('#110c22', '#6a4c7c'), R(0.2, 0.5)), 0.02));
  }
  for (let i = 0; i < 240; i++) {      // the head is layered sandstone: short level strokes
    const x = R(760, 1225), h = hgt(x); if (h < 30) continue; const y = ridge(x) + R(6, h * 0.78), len = R(10, 36);
    ln(x - len / 2, y, x + len / 2, y + R(-2, 2), T.pp, jc(mix(mCol(x, y), rnd() < 0.5 ? c('#3c2248', '#f0b48c') : c('#120c24', '#9a4a3c'), 0.5), 0.02), R(0.8, 1.3), R(0.5, 0.8), { wob: 0.6 });
  }
  for (let x = 727; x < 2302; x += 6) {      // light catching the edge that faces it
    if (-LX * slope(x) < 0.05) continue;
    stroke([[x, ridge(x) + 1.2], [x + 7, ridge(x + 7) + 1.2]], T.pp, c('#ff8a4d', '#fff2dc'), M === 'dark' ? 1.3 : 0.9, M === 'dark' ? 0.95 : NIGHT ? 0.35 : STORM ? 0.5 : 0.7, { tin: 0, tout: 0 });
    if (M === 'dark' && rnd() < 0.7) stroke([[x, ridge(x) + 4.5], [x + 7, ridge(x + 7) + 4.5]], T.pp, c('#b8503f', '#b8503f'), 1.6, 0.45, { tin: 0, tout: 0 });
  }
  for (let i = 0; i < 70; i++) { const x = R(770, 2260), y = HZ - R(4, Math.min(72, hgt(x) * 0.32)), s = R(4, 8); ln(x, y, x + R(-0.5, 0.5), y - s, T.pencil, c('#090614', '#4a5a4a'), 0.6, 0.85, { wob: 0.1 }); }   // saguaros, for scale
  if (M === 'dark') for (let x = 1236; x < 1530; x += R(12, 34)) { const y = ridge(x) + R(5, 11); haze(x, y, 6, 6, hx('#ffe6b0'), 0.35); dot(x, y, R(0.6, 1.0), hx('#fff6dc'), 1); }   // headlamps on the trail
}

// ---------- the valley ----------
const awake = (x, y) => !NIGHT || vn(x / 9, y / 9, 97) > 0.52;      // after midnight about half the windows are dark
function roof(r) {
  const w = r.w * r.s, h = 7 * r.s, x = r.x, y = r.y;
  if (D) { if (r.lit && awake(x, y)) { haze(x, y, 9 * r.s, 9 * r.s, hx('#ffc070'), 0.3); block(rect(x - 2.2 * r.s, y - 2.6 * r.s, x + 2.2 * r.s, y + 2.6 * r.s), hx(pick(['#ffdc90', '#ffb060'])), { w: 0.9, single: true, ang: 0, len: [2, 6], p: 1.3, g: 0.8 }); } return; }
  block(rect(x - w / 2, y - h, x + w / 2, y), hx(['#f8f2ea', '#c87850', '#e6ccae'][r.k]), { w: 1.2, g: 0.9, single: true, ang: 0.04, len: [5, 18], p: 1.2 });
  ln(x - w / 2, y + 1, x + w / 2, y + 1, T.pencil, hx('#7a6690'), 0.6, 0.7, { wob: 0.2 });
  block(rect(x - w / 2, y + 1.5, x + w / 2, y + 1.5 + h * 0.9), hx('#e9d6c4'), { w: 1, single: true, ang: 0, len: [4, 12] });
}
function palm(p) {
  const tx = p.x + p.lean * p.h, ty = p.y - p.h;
  ln(p.x, p.y, tx, ty, T.pp, c('#0f0a1e', '#8a6c58'), 1.1 + p.h * 0.006, 1, { bow: p.lean * 0.3, wob: 0.4, tin: 0.02, tout: 0.02 });
  for (let i = 0; i < 13; i++) {      // fronds fan all the way round and droop at the tips
    const a = 0.5 - (Math.PI + 1.0) * i / 12 + gs() * 0.08, len = p.h * R(0.2, 0.3), lit = Math.cos(a) * LX > 0.2;
    stroke(spline([[tx, ty], [tx + Math.cos(a) * len * 0.55, ty + Math.sin(a) * len * 0.6], [tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.75 + len * 0.2]], false, 5), T.pp, lit ? c('#4a2644', '#9cba62') : c('#0f0a1e', '#49683e'), 0.9 + p.h * 0.005, 1, { tin: 0.02, tout: 0.5 });
  }
}
function valley() {
  block(fnReg((x, y) => y > HZ - 5, [-10, HZ - 5, BW + 10, 960]), (x, y) => mix(c('#2b1d48', '#d2bfa6'), c('#191230', '#98a27e'), cl((y - HZ) / 110 + 0.3 * (fbm(x / 120, y / 40, 261, 2) - .5))), { w: 3, tool: T.pastel, ang: 0.05, len: [20, 90] });
  hatch({ box: [722, HZ - 40, 2308, HZ + 14], ang: 0.01, gap: 5, tool: T.pastel, col: c('#4a2e6a', '#eed2c0'), w: 6, p: 0.6, len: [60, 200], wob: 2, dens: (x, y) => smooth(HZ - 40, HZ + 4, y) * 0.7, pd: 1, cj: 0.03 });
  const items = [];
  // trees gather into blocks of canopy with gaps between, the way a neighbourhood looks from a hill
  for (const t of L.trees) if (vn(t.x / 170, t.y / 40, 91) > 0.36) items.push([t.y, () => { for (const [dx, k] of [[-0.7, 0.8], [0.6, 0.85], [0, 1]]) bush(t.x + dx * t.r, t.y - (k - 0.8) * t.r, t.r * k, c('#17122e', '#7f946c'), LX, D ? 0.14 : 0.5, v('#6a3448', '#c6d290'), v('#a8503c', '#e2e0a0'), v('#22304a', '#9cb078'), v('#2a2450', '#6f8a66')); }]);
  for (const r of L.roofs) items.push([r.y, () => roof(r)]);
  for (const p of L.palms) items.push([p.y, () => palm(p)]);
  items.sort((a, b) => a[0] - b[0]); for (const it of items) it[1]();
  for (const h of L.homes) {      // homes climbing the lower slopes
    const y = HZ - 4 - h.up;
    if (D) { if (h.lit && awake(h.x, y)) { haze(h.x, y, 7, 7, hx('#ffc070'), 0.3); dot(h.x, y, R(0.6, 1.1), hx(pick(['#ffe2a0', '#ffb060', '#fff2d0'])), 1); } }
    else { ln(h.x - 4, y, h.x + 4, y, T.pp, hx(pick(['#f8f2ea', '#c87850', '#e6ccae'])), 1.2, 1, { wob: 0.2 }); ln(h.x - 4, y + 1.8, h.x + 4, y + 1.8, T.pencil, hx('#8a6f96'), 0.5, 0.6, { wob: 0.2 }); }
  }
  if (D) for (const [yy, sp] of [[826, 20], [846, 27], [868, 36], [892, 48]]) for (let x = R(sp); x < BW; x += sp * R(0.7, 1.4)) {      // street lamps
    if (rnd() < 0.3) continue; const k = (yy - 820) * 0.08; haze(x, yy, 6 + k, 6 + k, hx('#ffb866'), 0.28); dot(x, yy + R(-1.5, 1.5), 0.6 + k * 0.15, hx(pick(['#ffd890', '#ffb060', '#fff0cc'])), 1);
  }
}

// ---------- the ground we stand on ----------
function groundCol(x, y) {
  const k = cl((y - 900) / 300), n = fbm(x / 140, y / 70, 321, 3);
  return mix(mix(c('#2a1d42', '#e4c2a4'), c('#1c1432', '#cfa58e'), k * 0.8), c('#33214a', '#b98fa0'), smooth(0.52, 0.75, n) * 0.5);
}
function ground() {
  block(fnReg((x, y) => y > fgY(x), [-10, 880, BW + 10, BH + 10]), groundCol, { w: 3.4, g: 1, tool: T.pastel, ang: 0.08, len: [24, 100], cj: 0.03, p: 1.1 });
  for (let x = -10; x < BW; x += R(8, 22)) { const k = D ? 1 - smooth(300, 1300, x) : 1; if (k > 0.05) ln(x, fgY(x) + 1, x + R(10, 26), fgY(x + 18) + 1, T.pp, c('#c8603f', '#fbe6cc'), R(0.8, 1.6), R(0.4, 0.8) * k, { wob: 0.5 }); }   // the crest catches the light nearest its source
  for (let i = 0; i < 5200; i++) {      // gravel
    const x = R(-10, BW + 10), y0 = fgY(x) + 4, y = y0 + Math.pow(rnd(), 0.9) * (BH - y0), k = (y - 900) / 300, light = rnd() < (D ? 0.25 : 0.4);
    mark(x, y, gs() * 0.25, R(3, 9) * (0.6 + k), R(0.7, 1.5) * (0.6 + k * 0.7), jc(mix(groundCol(x, y), light ? c('#3d2a56', '#f6dcc2') : c('#120c24', '#9a6f86'), R(0.3, 0.7)), 0.03), light ? T.pp : T.pencil);
  }
}
// by daylight: long shadows falling away from the sun (west in the morning, east at golden hour), a little toward us
function shadow(x, by, h, w) {
  if (D) return;
  const fx = x - LX * h * (GOLD ? 1.1 : 0.85), P = [[x - w / 2, by - 2], [x + w / 2, by], [fx + w * 0.5, by + h * 0.1 + w * 0.3], [fx - w * 0.4, by + h * 0.1 - w * 0.1]];
  tone(P, hx('#8a6a96'), { p: 0.75, gap: 1.9, ang: 0.12, len: [10, 40] }); tone(P, hx('#a8607a'), { p: 0.4, gap: 3, ang: -0.6, tool: T.pp, w: 1 });
}

// ---------- desert plants ----------
const SAG = (D ? [[0, '#2c2a5e'], [0.12, '#110d21'], [0.5, '#16132b'], [0.72, '#21343c'], [0.9, '#b85e3c'], [1, '#ffab6c']] : [[0, '#3e5468'], [0.25, '#466a5c'], [0.5, '#64905a'], [0.72, '#9cbc70'], [0.9, '#d6d894'], [1, '#f4e8b4']]).map(([p, h]) => [p, adapt(hx(h))]);
const PEAR = r5(D ? ['#100c1f', '#14112a', '#191a30', '#1f2638', '#b85e3c'] : ['#48685a', '#5f8a5c', '#86aa6c', '#a8c482', '#d6dca0']).map(([p, q]) => [p, adapt(q)]);
const ROCK = r5(D ? ['#100c20', '#19122e', '#281a3e', '#3a2450', '#c0603c'] : ['#86586e', '#b46a52', '#d68a62', '#eeb088', '#fad6b4']).map(([p, q]) => [p, adapt(q)]);
const nrm = (P, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1; return [-ty / l, tx / l]; };
// a centreline thickened into a limb with a rounded tip
function band(P, w) {
  const n = P.length, A = [], B = []; let q = [1, 0], ww = w;
  for (let i = 0; i < n; i++) { q = nrm(P, i); ww = w * (0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, i / (n - 1) * 1.1))); A.push([P[i][0] + q[0] * ww / 2, P[i][1] + q[1] * ww / 2]); B.push([P[i][0] - q[0] * ww / 2, P[i][1] - q[1] * ww / 2]); }
  const e = P[n - 1], a0 = Math.atan2(q[1], q[0]), cap = []; for (let k = 1; k < 8; k++) cap.push([e[0] + Math.cos(a0 - k * Math.PI / 8) * ww / 2, e[1] + Math.sin(a0 - k * Math.PI / 8) * ww / 2]);
  return A.concat(cap, B.reverse());
}
// how much a point on a limb faces the light, 0..1
function bandShade(P, w) {
  return (x, y) => {
    let best = 1e18, bi = 0; for (let i = 0; i < P.length; i += 2) { const dx = x - P[i][0], dy = y - P[i][1], d = dx * dx + dy * dy; if (d < best) { best = d; bi = i; } }
    const q = nrm(P, bi), lat = cl(((x - P[bi][0]) * q[0] + (y - P[bi][1]) * q[1]) / (w / 2), -1, 1);
    return cl((q[0] * LV[0] + q[1] * LV[1]) * lat * 0.5 + 0.5 + (rnd() - .5) * 0.1);
  };
}
function limb(P, w) {
  const poly = band(P, w), sh = bandShade(P, w), n = P.length, lit = i => { const q = nrm(P, i); return [q, q[0] * LV[0] + q[1] * LV[1] > 0 ? 1 : -1]; };
  block(poly, (x, y) => rampc(SAG, sh(x, y)), { w: Math.max(1.2, w * 0.045), g: 0.9, ang: Math.PI / 2, len: [w * 0.3, w * 1.4], p: 1.2 });
  for (const f of [-0.62, -0.31, 0, 0.31, 0.62]) stroke(P.map((p, i) => { const q = nrm(P, i); return [p[0] + q[0] * f * w / 2, p[1] + q[1] * f * w / 2]; }), T.pencil, c('#0a0716', '#3f6a54'), Math.max(0.5, w * 0.012), D ? 0.5 : 0.32, { tin: 0.03, tout: 0.1 });   // ribs
  stroke(P.map((p, i) => { const [q, s] = lit(i); return [p[0] + q[0] * s * w * 0.42, p[1] + q[1] * s * w * 0.42]; }), T.pp, c('#ff9a5a', '#f6efc4'), Math.max(0.7, w * 0.03), 0.8, { tin: 0.05, tout: 0.2 });
  edge(poly, c('#0d0919', '#3f5f4e'), { closed: true, w: D ? 0.7 : 0.5, p: D ? 0.8 : 0.55, gap: D ? 0 : 0.15 });
  for (let i = 0; i < n; i += 2) { const [q, s] = lit(i), o = w / 2 + R(0.5, 3); dot(P[i][0] + q[0] * s * o, P[i][1] + q[1] * s * o + R(-2, 2), R(0.3, 0.6), c('#ffc890', '#fffaf0'), R(0.4, 0.8)); }   // spines catching the light
  return P[n - 1];
}
function saguaro(x, by, h, w, arms) {
  shadow(x, by, h, w);
  const lean = (vn(x, by, 5) - .5) * 0.05, trunk = [], tops = []; for (let i = 0; i <= 26; i++) { const t = i / 26; trunk.push([x + lean * t * h + Math.sin(t * 3 + x) * w * 0.05, by - t * h]); }
  for (const a of arms) {
    const ay = by - a.t * h, ax = x + lean * a.t * h, er = a.reach * 0.6, P = [];
    for (let i = 0; i <= 12; i++) { const u = i / 12 * Math.PI / 2; P.push([ax + a.side * a.reach * Math.sin(u), ay - er * (1 - Math.cos(u))]); }
    for (let k = 1; k <= 10; k++) P.push([ax + a.side * a.reach + a.side * Math.sin(k * 0.4) * a.w * 0.04, ay - er - a.rise * k / 10]);
    tops.push([limb(P, a.w), a.w]);
  }
  tops.push([limb(trunk, w), w]);
  if (!D && h > 150) for (const [p, ww] of tops) for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + (k / 3 - .5) * 1.7, px = p[0] + Math.cos(a) * ww * 0.5, py = p[1] + Math.sin(a) * ww * 0.5; dot(px, py, Math.max(1.4, ww * 0.06), hx('#fffaf0'), 1, T.pp); dot(px, py, Math.max(0.6, ww * 0.025), hx('#f2c230'), 1, T.pp); }   // blossoms
}
function ocotillo(x, by, h) {
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i / 11 - .5) * 1.25 + gs() * 0.05, len = h * R(0.72, 1.04), bend = R(-0.13, 0.13) * len, ex = x + Math.cos(a) * len, ey = by + Math.sin(a) * len;
    const P = spline([[x, by], [x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend, by + Math.sin(a) * len * 0.5 + Math.cos(a) * bend], [ex, ey]], false, 8);
    stroke(P, T.pp, c('#0f0a1e', '#55684a'), 1.5, 1, { tin: 0.02, tout: 0.3 }); stroke(P.map(p => [p[0] + LX * 1.1, p[1]]), T.pp, c('#c8603f', '#b9cc8c'), 0.5, 0.7, { tin: 0.1, tout: 0.3 });
    if (!D) for (let k = 0; k < 16; k++) { const p = P[2 + ((rnd() * (P.length - 3)) | 0)]; dot(p[0] + R(-2.5, 2.5), p[1] + R(-2, 2), R(0.6, 1.1), hx(pick(['#6f9a52', '#8fb866', '#4f7a48'])), 0.9, T.pp); }
    for (let k = 0; k < 6; k++) { const t = k / 6; mark(ex - Math.cos(a) * t * 18 + gs() * 1.4, ey - Math.sin(a) * t * 18 + gs() * 1.4, a, R(5, 9), R(1.4, 2.4), adapt(hx(D ? pick(['#b8443a', '#d8603c', '#8a3040']) : pick(['#e0442c', '#f0622c', '#c8302c'])))); }
  }
}
function pear(x, y, s) {
  shadow(x, y + 30 * s, 60 * s, 90 * s);
  for (const [ox, oy, rx, ry, rot] of [[0, 0, 34, 44, 0], [-36, -26, 26, 34, -0.5], [32, -34, 28, 36, 0.45], [-6, -62, 24, 32, -0.1], [58, -4, 22, 28, 0.8], [-58, 2, 20, 26, -0.9]]) {
    const cx = x + ox * s, cy = y + oy * s, P = xf(circ(0, 0, 1, 22).map(p => [p[0] * rx, p[1] * ry]), cx, cy, rot, s);
    block(P, (px, py) => rampc(PEAR, cl(0.5 + ((px - cx) / (rx * s) * LV[0] + (py - cy) / (ry * s) * LV[1]) * 0.55 + (rnd() - .5) * 0.15)), { w: 1.4, g: 0.9, ang: rot + 1.4, len: [6, 22], p: 1.15 });
    edge(P, INK, { closed: true, w: 0.6, p: 0.75 });
    for (let k = 0; k < 14; k++) { const a = R(6.283), q = Math.sqrt(rnd()) * 0.85; dot(cx + Math.cos(a) * q * rx * s, cy + Math.sin(a) * q * ry * s, 0.5, c('#ffc890', '#fffaf0'), 0.6); }
    if (rnd() < 0.7) for (let k = 0; k < 2; k++) { const a = rot - Math.PI / 2 + R(-0.7, 0.7); mark(cx + Math.cos(a) * rx * s * 0.95, cy + Math.sin(a) * ry * s * 1.02, a, 9 * s, 2.6 * s, adapt(hx(D ? pick(['#7a2a56', '#9a3a60']) : pick(['#d0407a', '#e8589a', '#b8306a'])))); }
  }
}
function barrel(x, y, r) {
  shadow(x, y, r * 1.6, r * 1.2);
  const P = circ(0, 0, 1, 24).map(p => [x + p[0] * r * 0.82, y - r + p[1] * r]);
  block(P, px => rampc(PEAR, cl(0.5 + (px - x) / (r * 0.82) * LX * 0.5 + (rnd() - .5) * 0.12)), { w: 1.3, g: 0.9, ang: Math.PI / 2, len: [6, 20], p: 1.15 });
  for (let k = -3; k <= 3; k++) { const u = k / 3.6; stroke(spline([[x + u * r * 0.5, y - r * 1.9], [x + u * r * 0.84, y - r], [x + u * r * 0.5, y - r * 0.08]], false, 6), T.pencil, c('#0a0716', '#2f5a48'), 0.6, 0.6); }
  edge(P, INK, { closed: true, w: 0.6, p: 0.8 });
  for (let k = 0; k < 7; k++) mark(x + (k / 6 - .5) * r * 0.9, y - r * 1.92 + Math.abs(k - 3) * 1.2, -Math.PI / 2 + (k - 3) * 0.2, r * 0.28, r * 0.09, adapt(hx(D ? pick(['#a8843c', '#a8403a']) : pick(['#f2c230', '#e85a2c']))));
}
// a low spreading clump, wider than it is tall
function creosote(x, y, r) {
  shadow(x, y, r * 0.9, r * 2);
  for (const [dx, k] of [[-0.75, 0.75], [0.7, 0.8], [0, 1]]) bush(x + dx * r, y - r * 0.55 * k, r * k * 0.8, c('#141126', '#7a8a5c'), LX, D ? 0.16 : 0.45, v('#6a3448', '#b6c47c'), v('#a8503c', '#d8dc9c'), v('#22304a', '#93a468'), v('#2a2450', '#5f7350'));
}
function brittle(x, y, r) {
  shadow(x, y, r * 1.2, r * 1.4);
  bush(x, y - r * 0.7, r, c('#191630', '#7f927e'), LX, 0.5, v('#a8503c', '#d2dcc0'), v('#f08a50', '#eef0dc'), v('#252c48', '#9fb09a'), v('#2a2450', '#6f8a78'));
  for (let i = 0; i < r * 0.75; i++) {
    const fx = x + R(-r, r) * 0.95, fy = y - r * R(1.0, 1.9); ln(fx + R(-3, 3), y - r * 0.8, fx, fy, T.pencil, c('#0f0a1e', '#6a7a58'), 0.5, 0.7, { wob: 0.3 });
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283; mark(fx + Math.cos(a) * 2.6, fy + Math.sin(a) * 2.2, a, 4.4, 1.3, c('#8a6c3a', '#f4c62c')); }
    dot(fx, fy, 1.2, c('#5a3a2a', '#c8791c'), 1, T.pp);
  }
}
function paloverde(x, by, h) {
  shadow(x, by, h * 0.9, h * 0.5);
  for (const [dx, dy, w] of [[-0.22, -0.62, 3], [0.2, -0.68, 2.6], [0.02, -0.8, 2.4], [-0.42, -0.5, 2], [0.4, -0.52, 2]]) ln(x, by, x + dx * h, by + dy * h, T.pp, c('#0f0a1e', '#8aa650'), w, 1, { bow: gs() * 0.06, wob: 0.6, tin: 0.02, tout: 0.3 });
  for (const [dx, dy, rr] of [[-0.42, -0.62, 0.26], [-0.14, -0.84, 0.3], [0.2, -0.86, 0.28], [0.46, -0.64, 0.25], [0.04, -0.62, 0.3], [-0.3, -0.42, 0.2], [0.34, -0.42, 0.2]])
    bush(x + dx * h, by + dy * h, rr * h, c('#141226', '#8aa24e'), LX, D ? 0.3 : 0.55, v('#a8503c', '#e2dc6a'), v('#f08a50', '#f6e88a'), v('#22304a', '#a6bc5c'), v('#2a2450', '#6f8a48'));
  if (!D) for (let i = 0; i < 160; i++) { const a = R(6.283), q = Math.sqrt(rnd()); dot(x + Math.cos(a) * q * h * 0.62, by - h * 0.66 + Math.sin(a) * q * h * 0.36, R(0.7, 1.4), hx(pick(['#f2d040', '#f8e070', '#e6b830'])), 0.95, T.pp); }   // in bloom
}
function rock(x, y, rx, ry) {
  shadow(x, y + ry * 0.6, ry * 1.6, rx * 1.2);
  const f = fnReg((px, py) => ((px - x) / rx) ** 2 + ((py - y) / ry) ** 2 < 1 + 0.36 * (vn(px / 22 + x, py / 22, 71) - .5), [x - rx * 1.2, y - ry * 1.2, x + rx * 1.2, y + ry * 1.2]);
  block(f, (px, py) => rampc(ROCK, cl(0.5 + (px - x) / rx * LX * 0.38 - (py - y) / ry * 0.3 + (fbm(px / 26, py / 20, 73, 2) - .5) * 0.6)), { w: 2, g: 0.9, ang: 0.5, len: [8, 30], p: 1.15 });
  for (let k = 0; k < 4; k++) { const a = R(-0.6, 0.6) + Math.PI / 2, px = x + R(-rx, rx) * 0.6, py = y + R(-ry, ry) * 0.5; ln(px, py, px + Math.cos(a) * ry * 0.7, py + Math.sin(a) * ry * 0.7, T.pencil, c('#080512', '#5a3a56'), 0.7, 0.65, { wob: 1 }); }
}
const keepClear = (x, y) => (x > 1280 && x < 1500 && y > 960 && y < 1040) || (x > 1760 && x < 1975 && y > 1040 && y < 1140);   // the quail's path, and the signature
function plants() {
  const items = [], add = (y, fn) => items.push([y, fn]);
  // scrub grows in patches with bare ground between, never evenly
  for (const s of L.shrubs) { const y = fgY(s.x) + 26 + s.t * 250, r = s.r * (0.6 + s.t * 0.8); if (!keepClear(s.x, y) && vn(s.x / 230, 7, 93) > 0.42) add(y, () => creosote(s.x, y, r)); }
  for (const b of L.brittle) { const y = fgY(b.x) + 60 + b.t * 220, r = b.r * (0.7 + b.t * 0.6); if (!keepClear(b.x, y) && vn(b.x / 260, 3, 95) > 0.3) add(y, () => brittle(b.x, y, r)); }
  add(1150, () => saguaro(300, 1150, 520, 62, [{ t: 0.36, side: -1, reach: 88, rise: 230, w: 42 }, { t: 0.52, side: 1, reach: 100, rise: 170, w: 44 }, { t: 0.72, side: 1, reach: 44, rise: 30, w: 30 }]));
  add(1165, () => saguaro(2085, 1165, 430, 54, [{ t: 0.42, side: 1, reach: 80, rise: 150, w: 38 }, { t: 0.58, side: -1, reach: 70, rise: 110, w: 34 }]));
  add(1045, () => saguaro(1745, 1045, 190, 28, [{ t: 0.5, side: -1, reach: 36, rise: 54, w: 18 }]));
  add(992, () => saguaro(640, 992, 120, 20, [])); add(985, () => saguaro(968, 985, 86, 16, [])); add(1000, () => saguaro(1540, 1000, 110, 18, [{ t: 0.5, side: 1, reach: 24, rise: 34, w: 12 }]));
  add(1118, () => ocotillo(830, 1118, 250)); add(1150, () => ocotillo(2300, 1150, 300));
  add(1092, () => pear(520, 1092, 1.0)); add(1136, () => pear(1330, 1136, 1.1)); add(1042, () => pear(1990, 1042, 0.8));
  add(1104, () => barrel(1130, 1104, 26)); add(1150, () => barrel(700, 1150, 30));
  add(1062, () => paloverde(1600, 1062, 150));
  add(1170, () => rock(120, 1170, 120, 60)); add(1185, () => rock(2290, 1185, 130, 56)); add(1180, () => rock(1040, 1180, 70, 30)); add(1160, () => rock(1660, 1160, 60, 28));
  items.sort((a, b) => a[0] - b[0]); for (const it of items) it[1]();
  for (let i = 0; i < 260; i++) {      // tufts of dry grass
    const x = R(-10, BW + 10), y = fgY(x) + 10 + Math.pow(rnd(), 0.8) * 250; if (keepClear(x, y)) continue; const k = (y - 900) / 300;
    for (let j = 0; j < 7; j++) { const a = -Math.PI / 2 + gs() * 0.5, len = R(8, 22) * (0.6 + k); ln(x + R(-3, 3), y, x + Math.cos(a) * len, y + Math.sin(a) * len, T.pp, jc(adapt(D ? hx(x < 700 && rnd() < 0.2 ? '#b8583f' : pick(['#2c2044', '#3a2a52', '#4a3460'])) : hx(pick(['#ecd6a0', '#d2b080', '#f6e6bc']))), 0.03), R(0.5, 0.9), R(0.6, 1), { tin: 0.05, tout: 0.5, wob: 0.3, bow: gs() * 0.1 }); }
  }
}

// ---------- who is out at each hour ----------
function quail(x, y, s, adult) {
  shadow(x, y, 16 * s, 22 * s);
  const body = xf(circ(0, 0, 1, 20).map(p => [p[0] * 15, p[1] * 10.5]), x, y - 12 * s, -0.22, s);
  block(body, (px, py) => mix(hx('#6f7890'), hx('#e6d6b8'), smooth(y - 12 * s, y - 3 * s, py) * 0.85), { w: 1.1, g: 0.85, ang: 0.2, len: [4, 14], p: 1.2 });
  for (let k = 0; k < 7; k++) mark(x + R(-6, 8) * s, y - R(6, 13) * s, R(-0.4, 0.2), 6 * s, 1.1 * s, hx(pick(['#8a4a34', '#f4ecd8', '#5a3028'])));
  mark(x - 15 * s, y - 14 * s, -2.6, 9 * s, 2.6 * s, hx('#5a6078'));
  const hx0 = x + 12 * s, hy0 = y - 23 * s;
  block(discIn(hx0, hy0, 6.2 * s, 0.03), hx('#565c72'), { w: 1, g: 0.85, single: true, len: [3, 9], p: 1.2 });
  if (adult) {
    block(discIn(hx0 + 2.4 * s, hy0 + 1.6 * s, 3.4 * s, 0.03), hx('#1e1a26'), { w: 0.8, single: true, len: [2, 6] }); ln(hx0 - 2.5 * s, hy0 - 2.2 * s, hx0 + 4.5 * s, hy0 - 3 * s, T.chalk, hx('#fffaf0'), 0.45 * s, 0.9, { wob: 0.1 });
    mark(hx0 - 0.5 * s, hy0 - 4.6 * s, 0.1, 8 * s, 2 * s, hx('#8a4630'));
    stroke(spline([[hx0 + 1.5 * s, hy0 - 6 * s], [hx0 + 4.5 * s, hy0 - 12.5 * s], [hx0 + 9.5 * s, hy0 - 11 * s]], false, 6), T.pp, hx('#221c2a'), 1.3 * s, 1, { tin: 0.3, tout: 0.02, lo: 0.3 });   // the topknot
  }
  ln(hx0 + 6 * s, hy0 + 0.5 * s, hx0 + 8.6 * s, hy0 + 1.4 * s, T.pencil, hx('#2a2230'), 0.6 * s, 0.9, { wob: 0.05 });
  for (const lx of [-2, 4]) ln(x + lx * s, y - 3 * s, x + (lx + 1.5) * s, y + 1 * s, T.pencil, hx('#3a2e36'), 0.55 * s, 0.9, { wob: 0.1 });
  edge(body, hx('#3a3346'), { closed: true, w: 0.5, p: 0.6, gap: 0.2 });
}
function scorpion(x, y) {      // they glow under the right light; so does the one on the site
  const G = hx('#8ffbe6'); haze(x - 4, y - 6, 30, 22, hx('#48e0c8'), 0.22);
  for (let k = 0; k < 4; k++) dot(x - k * 3.6, y, 1.9 - k * 0.2, G, 1, T.pp);
  stroke(spline([[x - 13, y], [x - 20, y - 4], [x - 22, y - 12], [x - 16, y - 17], [x - 11, y - 14]], false, 6), T.pp, G, 1, 1, { tin: 0.02, tout: 0.3 });
  for (const sd of [-1, 1]) { stroke(spline([[x + 2, y + sd * 1.5], [x + 8, y + sd * 5 - 2], [x + 13, y + sd * 3 - 4]], false, 5), T.pp, G, 0.8, 1); dot(x + 14, y + sd * 3 - 4.5, 1.3, G, 1, T.pp); }
  for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) ln(x - k * 3.2, y, x - k * 3.2 + sd * 1.5 - 1, y + sd * 4.5, T.chalk, G, 0.3, 0.8, { wob: 0.05 });
}
function fauna() {
  if (D) scorpion(1046, 1156);
  else { quail(1318, 1016, 0.7, false); quail(1346, 1011, 0.7, false); quail(1373, 1015, 0.7, false); quail(1424, 1012, 1.5, true); }
}

E.makePaper(BG);
require('fs').mkdirSync(require('path').join(__dirname, 'out'), { recursive: true });      // masters are large and stay out of git
run([['sky', sky], { light: ['morning', morning], golden: ['afternoon', afternoon], dark: ['dusk', dusk], night: ['deep night', deepNight], monsoon: ['storm', storm] }[M], ['far ranges', farRanges], ['mountain', mountain], ['valley', valley], ['ground', ground], ['plants', plants], ['fauna', fauna],
  // signed above the bottom edge: on the site the footer's flowers and its javelina stand along that edge
  ['sign', () => sign(1790, 1112, 2.0, c('#f6e6d8', '#5a3f52'))]], `out/camelback-${NAME}.png`, { finish: { vignette: 0.04 }, after: () => E.matte(BG, (x, y) => smooth(200, 36, y)) });
