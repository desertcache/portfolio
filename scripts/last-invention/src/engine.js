/* THE LAST INVENTION · engine.js
   One continuous particle universe, rendered with WebGL2 and no libraries.
   Every slide asks for a "formation". Particles fly from wherever they are to the new shape,
   so the whole talk is a single unbroken piece of motion.
   Post stack: bloom, warp (radial blur), chromatic aberration, nebula, vignette, grain, ACES. */
(() => {
  'use strict';
  const TLI = (window.TLI = window.TLI || {});
  const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  TLI.reducedMotion = RM;

  const canvas = document.getElementById('gl');
  const aspectNow = () => innerWidth / Math.max(1, innerHeight);
  const camMulFor = (a) => (a < 1.3 ? Math.min(2.4, 1.3 / Math.max(a, 0.35)) : 1);

  const stub = {
    ok: false, N: 0, HERO: 0, seeds: new Float32Array(0), anchors: {},
    setScene() {}, update() {}, kick() {}, project() { return null; },
    onFrame() {}, onResize() {}, aspect: aspectNow,
    viewWidth: () => 2 * 6 * camMulFor(aspectNow()) * Math.tan(Math.PI / 8) * aspectNow(),
  };

  let gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      premultipliedAlpha: false, powerPreference: 'high-performance',
    });
  } catch (e) { gl = null; }
  if (!gl) { document.documentElement.classList.add('no-webgl'); TLI.engine = stub; return; }

  const coarse = matchMedia('(pointer: coarse)').matches;
  const minSide = Math.min(screen.width, screen.height);
  const N = coarse || minSide < 640 ? 44000 : 100000;
  const HERO = Math.floor(N * 0.84);
  const hdr = !!gl.getExtension('EXT_color_buffer_float');

  /* ---------- seeds ---------- */
  const mulberry = (a) => () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  TLI.rng = mulberry;
  const seeds = new Float32Array(N * 4);
  { const r = mulberry(1965); for (let i = 0; i < seeds.length; i++) seeds[i] = r(); }

  /* ---------- shaders ---------- */
  const VS_P = `#version 300 es
precision highp float;
layout(location=0) in vec4 aSeed;
layout(location=1) in vec4 aFrom;
layout(location=2) in vec4 aTo;
layout(location=3) in vec3 aWFrom;
layout(location=4) in vec3 aWTo;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat3 uRot;
uniform mat3 uTilt;
uniform vec3 uOffset;
uniform float uMorph, uSpread, uSwirl, uTime, uFlow, uTurb, uExplode;
uniform float uSize, uSizeVar, uFocal, uBright, uPulse, uReveal;
uniform vec3 uColA, uColB, uColC;
uniform vec3 uWave;
uniform vec3 uWaveC;
out vec3 vCol;
out float vA;
float ease(float t){ return t < .5 ? 4.*t*t*t : 1. - pow(-2.*t + 2., 3.) * .5; }
void main(){
  float t = clamp(uMorph * (1. + uSpread) - aSeed.x * uSpread, 0., 1.);
  float e = ease(t);
  vec3 p = mix(aFrom.xyz, aTo.xyz, e);
  float b = mix(aFrom.w, aTo.w, e);
  vec3 w = mix(aWFrom, aWTo, e);
  float arc = sin(3.14159265 * t) * uSwirl;
  p += vec3(sin(aSeed.w * 40. + 1.3), cos(aSeed.y * 37. + .7), sin(aSeed.z * 29. + 2.1)) * arc;
  float fa = uFlow * (.55 + .9 * aSeed.y);
  float c = cos(fa), s = sin(fa);
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  p = uRot * p;
  p += normalize(p + 1e-4) * uExplode * (.4 + aSeed.w);
  float wv = 1. + uWave.x * sin(length(p - uWaveC) * uWave.y - uTime * uWave.z);
  p = uTilt * p + uOffset;
  float tt = uTime * .35;
  p += uTurb * vec3(sin(tt * 1.3 + p.y * 1.7 + aSeed.x * 6.283),
                    sin(tt * 1.1 + p.z * 1.9 + aSeed.y * 6.283),
                    sin(tt * .9 + p.x * 1.5 + aSeed.z * 6.283));
  vec4 mv = uView * vec4(p, 1.);
  gl_Position = uProj * mv;
  float dist = max(-mv.z, .05);
  float tw = .78 + .22 * sin(uTime * (1.2 + aSeed.w * 2.6) + aSeed.z * 61.);
  float sz = uSize * mix(1., .45 + 1.9 * aSeed.y * aSeed.y, uSizeVar) * tw * (1. + uPulse);
  float px = sz * uFocal / dist;
  gl_PointSize = clamp(px, 1., 56.);
  float id = float(gl_VertexID);
  float rev = clamp((uReveal - id) / max(1., uReveal * .06), 0., 1.);
  float ws = max(w.x + w.y + w.z, 1e-3);
  vCol = (uColA * w.x + uColB * w.y + uColC * w.z) / ws;
  vA = b * uBright * max(wv, 0.) * rev * smoothstep(.12, .9, dist) * clamp(px * 1.5, .3, 1.);
}`;

  const FS_P = `#version 300 es
precision mediump float;
in vec3 vCol;
in float vA;
out vec4 o;
void main(){
  vec2 q = gl_PointCoord * 2. - 1.;
  float r2 = dot(q, q);
  if (r2 > 1.) discard;
  float a = (exp(-r2 * 5.) * .85 + exp(-r2 * 22.) * .55) * vA;
  o = vec4(vCol * a, 1.);
}`;

  const VS_Q = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2. - 1., 0., 1.);
}`;

  const FS_DOWN = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThresh;
void main(){
  vec3 c = texture(uTex, vUv + uTexel * vec2(-1., -1.)).rgb
         + texture(uTex, vUv + uTexel * vec2( 1., -1.)).rgb
         + texture(uTex, vUv + uTexel * vec2(-1.,  1.)).rgb
         + texture(uTex, vUv + uTexel * vec2( 1.,  1.)).rgb;
  c *= .25;
  float br = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThresh, uThresh + .7, br);
  o = vec4(c * k, 1.);
}`;

  const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uDir;
void main(){
  vec3 c = texture(uTex, vUv).rgb * .2270270270;
  c += texture(uTex, vUv + uDir * 1.3846153846).rgb * .3162162162;
  c += texture(uTex, vUv - uDir * 1.3846153846).rgb * .3162162162;
  c += texture(uTex, vUv + uDir * 3.2307692308).rgb * .0702702703;
  c += texture(uTex, vUv - uDir * 3.2307692308).rgb * .0702702703;
  o = vec4(c, 1.);
}`;

  const FS_COMP = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime, uBloomAmt, uWarp, uCA, uFlash, uFade, uGrain, uVig, uNeb, uExposure;
uniform vec3 uNebA, uNebB, uBg;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.02 + 17.1; a *= .5; } return v; }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
void main(){
  vec2 c = vUv - .5;
  vec3 col;
  if (uWarp > .002) {
    vec3 acc = vec3(0.); float tot = 0.;
    for (int i = 0; i < 20; i++) {
      float t = float(i) / 19.;
      float s = 1. - uWarp * .45 * t;
      float wgt = 1. - t * .55;
      vec2 d = c * s;
      acc.r += texture(uScene, .5 + d * (1. + uCA * .02)).r * wgt;
      acc.g += texture(uScene, .5 + d).g * wgt;
      acc.b += texture(uScene, .5 + d * (1. - uCA * .02)).b * wgt;
      tot += wgt;
    }
    col = acc / tot;
  } else {
    vec2 off = c * uCA * .022;
    col = vec3(texture(uScene, vUv + off).r, texture(uScene, vUv).g, texture(uScene, vUv - off).b);
  }
  col += texture(uBloom, vUv).rgb * uBloomAmt;
  vec2 q = c * vec2(uRes.x / uRes.y, 1.);
  float n = fbm(q * 1.35 + vec2(uTime * .011, -uTime * .007));
  float n2 = fbm(q * 2.6 + vec2(-uTime * .009, uTime * .012) + n * 1.7);
  float neb = pow(smoothstep(.38, .95, n), 1.5) * (1. - smoothstep(.15, 1.15, length(q)));
  col += mix(uNebA, uNebB, n2) * neb * uNeb;
  col += uBg;
  col = aces(col * uExposure) + uFlash;
  float vig = 1. - smoothstep(.25, 1.2, length(c * vec2(1., 1.12)) * 1.45);
  col *= mix(1., vig, uVig);
  col += (hash(vUv * uRes + fract(uTime * 13.7) * 91.) - .5) * uGrain;
  col *= (1. - uFade);
  o = vec4(col, 1.);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(log); }
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  let PP, PD, PB, PC;
  try {
    PP = program(VS_P, FS_P);
    PD = program(VS_Q, FS_DOWN);
    PB = program(VS_Q, FS_BLUR);
    PC = program(VS_Q, FS_COMP);
  } catch (e) {
    console.error('[engine] shader error', e);
    document.documentElement.classList.add('no-webgl');
    TLI.engine = stub; return;
  }

  /* ---------- particle buffers ---------- */
  const fromA = new Float32Array(N * 4), toA = new Float32Array(N * 4);
  const wFromA = new Float32Array(N * 3), wToA = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { wFromA[i * 3] = 1; wToA[i * 3] = 1; }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  function attrib(loc, size, data, usage) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  }
  attrib(0, 4, seeds, gl.STATIC_DRAW);
  const bFrom = attrib(1, 4, fromA, gl.DYNAMIC_DRAW);
  const bTo = attrib(2, 4, toA, gl.DYNAMIC_DRAW);
  const bWF = attrib(3, 3, wFromA, gl.DYNAMIC_DRAW);
  const bWT = attrib(4, 3, wToA, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(null);
  const quadVao = gl.createVertexArray();
  function upload(buf, data) { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); }

  /* ---------- render targets ---------- */
  let W = 0, H = 0;
  let scale = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 1.6);
  let rtScene = null, rtA = null, rtB = null;
  function target(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }
  function free(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }
  const resizeCbs = [];
  function resize(force) {
    const cw = Math.max(2, Math.round(innerWidth * scale));
    const ch = Math.max(2, Math.round(innerHeight * scale));
    if (!force && cw === W && ch === H && rtScene) return;
    W = cw; H = ch; canvas.width = W; canvas.height = H;
    free(rtScene); free(rtA); free(rtB);
    rtScene = target(W, H);
    rtA = target(Math.max(1, W >> 2), Math.max(1, H >> 2));
    rtB = target(Math.max(1, W >> 2), Math.max(1, H >> 2));
  }
  resize(true);
  let rzTimer = 0, lastAspectClass = aspectNow() < 0.9;
  addEventListener('resize', () => {
    resize();
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => {
      const cls = aspectNow() < 0.9;
      const changed = cls !== lastAspectClass; lastAspectClass = cls;
      resizeCbs.forEach((cb) => cb(changed));
    }, 220);
  });

  /* ---------- palettes ---------- */
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  const PAL = {
    p0: ['#8fd3ff', '#eef6ff', '#ffd2a0', '#0a2442', '#22123e'],
    p1: ['#38c6ff', '#a6efff', '#ffffff', '#05253d', '#0a3434'],
    p2: ['#8758ff', '#ff4fc3', '#cbb8ff', '#1a0a42', '#360a36'],
    p3: ['#ff7418', '#ffc552', '#ff3a5a', '#381104', '#380914'],
    p4: ['#ffcd66', '#ff3350', '#fff3dc', '#2c1a05', '#320712'],
    p5: ['#f4f6ff', '#9dbdff', '#ffcd86', '#0c1430', '#221438'],
    pg: ['#86b4ff', '#ffc497', '#ff6acb', '#081736', '#2a0d38'],
    ps: ['#ff7a22', '#ffd27a', '#fff6e6', '#3a1404', '#2a0a10'],
  };
  for (const k in PAL) PAL[k] = PAL[k].map(hex);
  TLI.palettes = PAL;

  /* ---------- state ---------- */
  const S = {
    morph: 1, dur: 2, spread: 0.6, swirl: 0.5,
    flowPhase: 0, flow: 0, flowT: 0,
    yaw: 0, pitch: 0, rotY: 0, rotYT: 0, rotX: 0, rotXT: 0,
    explode: 0, explodeT: 0,
    turb: 0.03, turbT: 0.03, bright: 1, brightT: 1, size: 0.016, sizeT: 0.016, sizeVar: 1, sizeVarT: 1,
    pulse: 0, pulseT: 0, pulseSpd: 1,
    tilt: [0, 0, 0], tiltT: [0, 0, 0], off: [0, 0, 0], offT: [0, 0, 0],
    wave: [0, 1, 1], waveT: [0, 1, 1], waveC: [0, 0, 0],
    revL: Math.log(N * 2), revLT: Math.log(N * 2), revRate: 2,
    colA: PAL.p0[0].slice(), colB: PAL.p0[1].slice(), colC: PAL.p0[2].slice(),
    colAT: PAL.p0[0], colBT: PAL.p0[1], colCT: PAL.p0[2],
    nebA: PAL.p0[3].slice(), nebB: PAL.p0[4].slice(), nebAT: PAL.p0[3], nebBT: PAL.p0[4],
    bloom: 0.9, bloomT: 0.9, neb: 0.5, nebT: 0.5, exposure: 1.15, exposureT: 1.15,
    vig: 0.9, grain: 0.016,
    cam: { dist: 6, yaw: 0, pitch: 0, t: [0, 0, 0], fov: 45 },
    camT: { dist: 6, yaw: 0, pitch: 0, t: [0, 0, 0], fov: 45 }, camRate: 1.6,
    warp: 0, warpT: -1, warpDur: 1.5, flash: 0, shake: 0, glitch: 0, fade: 0, fadeT: 0,
    mx: 0, my: 0, smx: 0, smy: 0,
  };
  const anchors = {};

  /* ---------- math ---------- */
  function rotMat(yaw, pitch) { // row-major Ry(yaw) * Rx(pitch)
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    return [cy, sy * sx, sy * cx, 0, cx, -sx, -sy, cy * sx, cy * cx];
  }
  function tiltMat(t) { // row-major Ry(t1) * Rx(t0) * Rz(t2)
    const a = t[0], b = t[1], g = t[2];
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
    const rx = [1, 0, 0, 0, ca, -sa, 0, sa, ca];
    const ry = [cb, 0, sb, 0, 1, 0, -sb, 0, cb];
    const rz = [cg, -sg, 0, sg, cg, 0, 0, 0, 1];
    return mul3(mul3(ry, rx), rz);
  }
  function mul3(a, b) {
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return r;
  }
  function toCol(m, out) { out[0] = m[0]; out[1] = m[3]; out[2] = m[6]; out[3] = m[1]; out[4] = m[4]; out[5] = m[7]; out[6] = m[2]; out[7] = m[5]; out[8] = m[8]; return out; }
  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.fill(0); out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
    return out;
  }
  function lookAt(out, e, t, u) {
    let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
    out[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
    out[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
    out[15] = 1;
    return out;
  }

  /* ---------- baking: freeze the current on-screen state into the "from" buffer ---------- */
  function bake() {
    const m = Math.min(1, S.morph), sp = S.spread, sw = S.swirl, fp = S.flowPhase, ex = S.explode;
    const R = rotMat(S.yaw, S.pitch);
    for (let i = 0; i < N; i++) {
      const i4 = i * 4, i3 = i * 3;
      const sx = seeds[i4], sy = seeds[i4 + 1], sz = seeds[i4 + 2], sw4 = seeds[i4 + 3];
      let t = m * (1 + sp) - sx * sp; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      let x = fromA[i4] + (toA[i4] - fromA[i4]) * e;
      let y = fromA[i4 + 1] + (toA[i4 + 1] - fromA[i4 + 1]) * e;
      let z = fromA[i4 + 2] + (toA[i4 + 2] - fromA[i4 + 2]) * e;
      const b = fromA[i4 + 3] + (toA[i4 + 3] - fromA[i4 + 3]) * e;
      const arc = Math.sin(Math.PI * t) * sw;
      if (arc) { x += Math.sin(sw4 * 40 + 1.3) * arc; y += Math.cos(sy * 37 + 0.7) * arc; z += Math.sin(sz * 29 + 2.1) * arc; }
      if (fp) { const a = fp * (0.55 + 0.9 * sy), c = Math.cos(a), s = Math.sin(a); const nx = c * x + s * z; z = -s * x + c * z; x = nx; }
      const rx = R[0] * x + R[1] * y + R[2] * z, ry = R[3] * x + R[4] * y + R[5] * z, rz = R[6] * x + R[7] * y + R[8] * z;
      x = rx; y = ry; z = rz;
      if (ex) { const k = (ex * (0.4 + sw4)) / (Math.hypot(x + 1e-4, y + 1e-4, z + 1e-4)); x += (x + 1e-4) * k; y += (y + 1e-4) * k; z += (z + 1e-4) * k; }
      fromA[i4] = x; fromA[i4 + 1] = y; fromA[i4 + 2] = z; fromA[i4 + 3] = b;
      wFromA[i3] += (wToA[i3] - wFromA[i3]) * e;
      wFromA[i3 + 1] += (wToA[i3 + 1] - wFromA[i3 + 1]) * e;
      wFromA[i3 + 2] += (wToA[i3 + 2] - wFromA[i3 + 2]) * e;
    }
  }

  /* ---------- public: scenes ---------- */
  let currentForm = null, currentCfg = null;
  function setScene(cfg) {
    currentCfg = cfg;
    if (cfg.form && TLI.formations) {
      const f = TLI.formations.get(cfg.form, cfg);
      if (f) {
        bake();
        toA.set(f.pos); wToA.set(f.w);
        upload(bFrom, fromA); upload(bWF, wFromA); upload(bTo, toA); upload(bWT, wToA);
        S.morph = 0;
        S.dur = Math.max(0.2, (cfg.morph != null ? cfg.morph : 2.2) * (RM ? 0.45 : 1));
        S.spread = cfg.spread != null ? cfg.spread : 0.6;
        S.swirl = RM ? 0 : cfg.swirl != null ? cfg.swirl : 0.5;
        S.flowPhase = 0; S.yaw = 0; S.pitch = 0; S.explode = 0;
        // the old shape's spin is baked in above; its speed must not coast on into the new shape,
        // or a still formation inherits an uneven twist and smears at its ends. New speeds ramp up from rest.
        S.flow = 0; S.rotY = 0; S.rotX = 0;
        for (const k in anchors) delete anchors[k];
        Object.assign(anchors, f.anchors || {});
        currentForm = cfg.form;
      }
    }
    update(cfg);
  }
  function update(c) {
    if (!c) return;
    if (c.flow != null) S.flowT = RM ? c.flow * 0.3 : c.flow;
    if (c.rot) { S.rotYT = c.rot[0] * (RM ? 0.3 : 1); S.rotXT = (c.rot[1] || 0) * (RM ? 0.3 : 1); }
    if (c.explode != null) S.explodeT = c.explode;
    if (c.turb != null) S.turbT = RM ? c.turb * 0.3 : c.turb;
    if (c.bright != null) S.brightT = c.bright;
    if (c.size != null) S.sizeT = c.size;
    if (c.sizeVar != null) S.sizeVarT = c.sizeVar;
    if (c.pulse != null) { S.pulseT = RM ? 0 : c.pulse[0]; S.pulseSpd = c.pulse[1] || 1; }
    if (c.tilt) S.tiltT = c.tilt.slice();
    if (c.offset || c.offsetM) {
      const narrow = aspectNow() < 0.9;
      S.offT = (narrow ? c.offsetM || [0, 0, 0] : c.offset || [0, 0, 0]).slice();
    }
    if (c.wave) { S.waveT = [c.wave[0], c.wave[1], c.wave[2]]; if (c.wave[3]) S.waveC = c.wave[3].slice(); }
    if (c.reveal != null) { S.revLT = Math.log(Math.max(1, c.reveal)); S.revRate = c.revealRate || 2; }
    if (c.pal && PAL[c.pal]) {
      const p = PAL[c.pal];
      S.colAT = p[0]; S.colBT = p[1]; S.colCT = p[2]; S.nebAT = p[3]; S.nebBT = p[4];
    }
    if (c.bloom != null) S.bloomT = c.bloom;
    if (c.neb != null) S.nebT = c.neb;
    if (c.exposure != null) S.exposureT = c.exposure;
    if (c.fade != null) S.fadeT = c.fade;
    if (c.cam) {
      const k = c.cam, T = S.camT;
      if (k.dist != null) T.dist = k.dist;
      if (k.yaw != null) T.yaw = k.yaw;
      if (k.pitch != null) T.pitch = k.pitch;
      if (k.target) T.t = k.target.slice();
      if (k.fov != null) T.fov = k.fov;
      S.camRate = k.rate || 1.6;
    }
    if (c.kick) kick(c.kick);
  }
  function kick(type) {
    if (RM) { if (type === 'flash') S.flash = 0.2; return; }
    if (type === 'warp') { S.warpT = 0; S.warpDur = 1.5; }
    else if (type === 'warp-long') { S.warpT = 0; S.warpDur = 2.4; }
    else if (type === 'flash') { S.flash = 1; S.shake = 1; }
    else if (type === 'glitch') { S.glitch = 0.9; }
    else if (type === 'shake') { S.shake = 0.7; }
  }

  /* ---------- per-frame update ---------- */
  const lerp3 = (a, b, k) => { a[0] += (b[0] - a[0]) * k; a[1] += (b[1] - a[1]) * k; a[2] += (b[2] - a[2]) * k; };
  function step(dt, t) {
    const k = (rate) => 1 - Math.exp(-rate * dt);
    S.morph = Math.min(1, S.morph + dt / S.dur);
    S.flow += (S.flowT - S.flow) * k(1.3); S.flowPhase += S.flow * dt;
    S.rotY += (S.rotYT - S.rotY) * k(1.1); S.rotX += (S.rotXT - S.rotX) * k(1.1);
    S.yaw += S.rotY * dt; S.pitch += S.rotX * dt;
    S.explode += (S.explodeT - S.explode) * k(2.2);
    S.turb += (S.turbT - S.turb) * k(1.2);
    S.bright += (S.brightT - S.bright) * k(1.6);
    S.size += (S.sizeT - S.size) * k(1.6);
    S.sizeVar += (S.sizeVarT - S.sizeVar) * k(1.6);
    S.pulse += (S.pulseT - S.pulse) * k(1.5);
    lerp3(S.tilt, S.tiltT, k(1.4)); lerp3(S.off, S.offT, k(1.4)); lerp3(S.wave, S.waveT, k(1.5));
    lerp3(S.colA, S.colAT, k(1.1)); lerp3(S.colB, S.colBT, k(1.1)); lerp3(S.colC, S.colCT, k(1.1));
    lerp3(S.nebA, S.nebAT, k(0.8)); lerp3(S.nebB, S.nebBT, k(0.8));
    S.bloom += (S.bloomT - S.bloom) * k(1.5); S.neb += (S.nebT - S.neb) * k(1);
    S.exposure += (S.exposureT - S.exposure) * k(1.5); S.fade += (S.fadeT - S.fade) * k(3);
    S.revL += (S.revLT - S.revL) * k(S.revRate);
    const c = S.cam, T = S.camT, kr = k(S.camRate);
    c.dist += (T.dist - c.dist) * kr; c.yaw += (T.yaw - c.yaw) * kr; c.pitch += (T.pitch - c.pitch) * kr;
    lerp3(c.t, T.t, kr); c.fov += (T.fov - c.fov) * kr;
    if (S.warpT >= 0) {
      S.warpT += dt;
      const p = S.warpT / S.warpDur;
      if (p >= 1) { S.warpT = -1; S.warp = 0; } else S.warp = Math.pow(Math.sin(Math.PI * Math.pow(p, 0.8)), 2);
    }
    S.flash *= Math.exp(-dt * 3.2); S.shake *= Math.exp(-dt * 2.4); S.glitch = Math.max(0, S.glitch - dt);
    S.smx += (S.mx - S.smx) * k(1.8); S.smy += (S.my - S.smy) * k(1.8);
  }

  /* ---------- render ---------- */
  const proj = new Float32Array(16), view = new Float32Array(16), rot3 = new Float32Array(9), tilt3 = new Float32Array(9);
  let focal = 1, drawCount = N;
  function render(t) {
    const c = S.cam, asp = W / H;
    const dist = c.dist * camMulFor(asp) * (1 - 0.34 * S.warp);
    const jit = S.shake > 0.01 ? S.shake : 0;
    const yaw = c.yaw + S.smx * 0.07 + Math.sin(t * 0.05) * 0.035 + (jit ? (Math.random() - 0.5) * 0.035 * jit : 0);
    const pitch = c.pitch - S.smy * 0.045 + Math.sin(t * 0.037) * 0.02 + (jit ? (Math.random() - 0.5) * 0.035 * jit : 0);
    const eye = [
      c.t[0] + dist * Math.cos(pitch) * Math.sin(yaw),
      c.t[1] + dist * Math.sin(pitch),
      c.t[2] + dist * Math.cos(pitch) * Math.cos(yaw),
    ];
    const fov = ((c.fov + S.warp * 22) * Math.PI) / 180;
    perspective(proj, fov, asp, 0.05, 300);
    lookAt(view, eye, c.t, [0, 1, 0]);
    focal = H / (2 * Math.tan(fov / 2));

    gl.bindFramebuffer(gl.FRAMEBUFFER, rtScene.fb);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const u = PP.u;
    gl.useProgram(PP.p);
    gl.uniformMatrix4fv(u.uProj, false, proj);
    gl.uniformMatrix4fv(u.uView, false, view);
    gl.uniformMatrix3fv(u.uRot, false, toCol(rotMat(S.yaw, S.pitch), rot3));
    gl.uniformMatrix3fv(u.uTilt, false, toCol(tiltMat(S.tilt), tilt3));
    gl.uniform3fv(u.uOffset, S.off);
    gl.uniform1f(u.uMorph, S.morph);
    gl.uniform1f(u.uSpread, S.spread);
    gl.uniform1f(u.uSwirl, S.swirl);
    gl.uniform1f(u.uTime, t);
    gl.uniform1f(u.uFlow, S.flowPhase);
    gl.uniform1f(u.uTurb, S.turb);
    gl.uniform1f(u.uExplode, S.explode);
    gl.uniform1f(u.uSize, S.size);
    gl.uniform1f(u.uSizeVar, S.sizeVar);
    gl.uniform1f(u.uFocal, focal);
    gl.uniform1f(u.uBright, S.bright * (1 + S.warp * 0.6));
    gl.uniform1f(u.uPulse, S.pulse * (0.5 + 0.5 * Math.sin(t * S.pulseSpd * 6.283)));
    gl.uniform1f(u.uReveal, Math.exp(S.revL));
    gl.uniform3fv(u.uColA, S.colA); gl.uniform3fv(u.uColB, S.colB); gl.uniform3fv(u.uColC, S.colC);
    gl.uniform3fv(u.uWave, S.wave); gl.uniform3fv(u.uWaveC, S.waveC);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, drawCount);
    gl.disable(gl.BLEND);

    gl.bindVertexArray(quadVao);
    // bright pass + downsample
    gl.useProgram(PD.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtScene.tex);
    gl.uniform1i(PD.u.uTex, 0);
    gl.uniform2f(PD.u.uTexel, 1 / W, 1 / H);
    gl.uniform1f(PD.u.uThresh, 0.28);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rtA.fb);
    gl.viewport(0, 0, rtA.w, rtA.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // blur ping-pong
    gl.useProgram(PB.p);
    gl.uniform1i(PB.u.uTex, 0);
    const bw = rtA.w, bh = rtA.h;
    const passes = [[1, 0, 1], [0, 1, 1], [1, 0, 2.2], [0, 1, 2.2]];
    for (let i = 0; i < passes.length; i++) {
      const src = i % 2 === 0 ? rtA : rtB, dst = i % 2 === 0 ? rtB : rtA;
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(PB.u.uDir, (passes[i][0] * passes[i][2]) / bw, (passes[i][1] * passes[i][2]) / bh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(PC.p);
    const v = PC.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtScene.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rtA.tex);
    gl.uniform1i(v.uScene, 0); gl.uniform1i(v.uBloom, 1);
    gl.uniform2f(v.uRes, W, H);
    gl.uniform1f(v.uTime, t);
    gl.uniform1f(v.uBloomAmt, S.bloom * (1 + S.warp * 0.8));
    gl.uniform1f(v.uWarp, S.warp);
    const glitchCA = S.glitch > 0 ? (Math.random() < 0.35 ? Math.random() * 3 * S.glitch : 0) : 0;
    gl.uniform1f(v.uCA, S.warp * 1.2 + glitchCA + S.flash * 0.8);
    gl.uniform1f(v.uFlash, S.flash * 0.85);
    gl.uniform1f(v.uFade, S.fade);
    gl.uniform1f(v.uGrain, S.grain);
    gl.uniform1f(v.uVig, S.vig);
    gl.uniform1f(v.uNeb, S.neb);
    gl.uniform1f(v.uExposure, S.exposure);
    gl.uniform3fv(v.uNebA, S.nebA); gl.uniform3fv(v.uNebB, S.nebB);
    gl.uniform3f(v.uBg, 0.004, 0.005, 0.011);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  /* ---------- projection helper for HTML anchored to particles ---------- */
  function project(p) {
    const R = rotMat(S.yaw, S.pitch), T = tiltMat(S.tilt);
    const x = R[0] * p[0] + R[1] * p[1] + R[2] * p[2];
    const y = R[3] * p[0] + R[4] * p[1] + R[5] * p[2];
    const z = R[6] * p[0] + R[7] * p[1] + R[8] * p[2];
    const x2 = T[0] * x + T[1] * y + T[2] * z + S.off[0];
    const y2 = T[3] * x + T[4] * y + T[5] * z + S.off[1];
    const z2 = T[6] * x + T[7] * y + T[8] * z + S.off[2];
    const v = view, pr = proj;
    const vx = v[0] * x2 + v[4] * y2 + v[8] * z2 + v[12];
    const vy = v[1] * x2 + v[5] * y2 + v[9] * z2 + v[13];
    const vz = v[2] * x2 + v[6] * y2 + v[10] * z2 + v[14];
    const cw = -vz;
    if (cw <= 0.001) return null;
    const nx = (pr[0] * vx + pr[8] * vz) / cw, ny = (pr[5] * vy + pr[9] * vz) / cw;
    return { x: (nx * 0.5 + 0.5) * innerWidth, y: (1 - (ny * 0.5 + 0.5)) * innerHeight };
  }

  /* ---------- adaptive quality ---------- */
  let perfAcc = 0, perfN = 0, perfSkip = 90;
  function perf(dt) {
    if (document.hidden) return;
    if (perfSkip > 0) { perfSkip--; return; }
    perfAcc += dt; perfN++;
    if (perfN < 90) return;
    const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
    if (avg > 1 / 36) {
      if (scale > 0.8) { scale = Math.max(0.7, scale * 0.8); resize(true); perfSkip = 60; }
      else if (drawCount > N * 0.45) { drawCount = Math.floor(drawCount * 0.78); perfSkip = 60; }
    }
  }

  /* ---------- loop ---------- */
  const frameCbs = [];
  let last = performance.now() / 1000, raf = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const t = now / 1000;
    const raw = Math.max(0, t - last);
    const dt = Math.min(0.05, raw) * (TLI.timeScale || 1);
    last = t;
    step(dt, t);
    render(t);
    // judge quality only on genuinely live frames; throttled or background tabs skip frames for other reasons
    if (raw < 0.1 && !TLI.timeScale) perf(raw);
    for (let i = 0; i < frameCbs.length; i++) frameCbs[i](dt, t);
  }
  addEventListener('pointermove', (e) => {
    S.mx = (e.clientX / innerWidth) * 2 - 1;
    S.my = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); cancelAnimationFrame(raf);
    document.documentElement.classList.add('no-webgl');
  });

  TLI.engine = {
    ok: true, N, HERO, seeds, anchors, hdr,
    setScene, update, kick, project, bake,
    onFrame: (cb) => frameCbs.push(cb),
    offFrame: (cb) => { const i = frameCbs.indexOf(cb); if (i >= 0) frameCbs.splice(i, 1); },
    onResize: (cb) => resizeCbs.push(cb),
    aspect: () => W / H,
    viewWidth: () => 2 * 6 * camMulFor(W / H) * Math.tan(Math.PI / 8) * (W / H),
    current: () => currentForm,
    currentCfg: () => currentCfg,
    state: S,
    quality: () => ({ scale, drawCount, N }),
    start() { if (!raf) { last = performance.now() / 1000; raf = requestAnimationFrame(loop); } },
    // test hook: run the simulation forward without waiting for frames (used when the tab is throttled)
    advance(sec) { const t0 = performance.now() / 1000; for (let s = 0; s < sec; s += 1 / 60) step(1 / 60, t0 + s); render(t0 + sec); },
  };
})();
