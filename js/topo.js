// @ts-check
import { hexToRgb, coordsFor } from './lib.js';

/**
 * The hero's topographic field.
 *
 * Mental model: the fragment shader computes a height for every pixel
 * (domain-warped gradient noise, i.e. fake terrain), then draws a line
 * wherever that height crosses an even step, the way a topo map does.
 * `fwidth` tells us how fast the height changes per pixel, which is what
 * keeps the lines a constant ~1px wide and anti-aliased no matter how steep
 * the terrain gets. The cursor adds a soft hill on top.
 *
 * Cost control, because this runs behind the most important screen:
 *  - one full-screen triangle, no textures, no geometry
 *  - drawing buffer capped at ~2.2 megapixels whatever the display
 *  - ~30fps while idle (the drift is slow), full rate only while the hill moves
 *  - stops entirely when the hero is off screen or the tab is hidden
 *  - reduced motion: one still frame, redrawn only on resize or theme change
 *  - no WebGL: the canvas stays invisible and the paper background shows
 */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform vec2 u_res;     // drawing buffer size, px
uniform float u_time;   // seconds (only advances while animating)
uniform vec3 u_hill;    // xy = hill centre in buffer px (origin bottom-left), z = strength 0..1
uniform vec3 u_line;    // contour colour
uniform vec3 u_accent;  // high ground + the hill
uniform float u_alpha;  // base line opacity
uniform float u_dark;   // 1.0 in dark theme: adds a few stars
uniform float u_px;     // buffer px per CSS px, keeps line width constant

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0)), f - vec2(1.0)), u.x), u.y);
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm3(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = ROT * p; a *= 0.5; }
  return v;
}
float fbm5(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = ROT * p; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.y;           // height-normalised, so terrain doesn't stretch
  float t = u_time * 0.016;
  vec2 p = uv * 1.35 + vec2(3.1, 7.7);
  vec2 warp = vec2(fbm3(p + vec2(0.0, t)), fbm3(p + vec2(5.2, 1.3) - t * 0.8));
  float h = fbm5(p + 0.95 * warp);

  vec2 m = u_hill.xy / u_res.y;
  float d = distance(uv, m);
  float hill = u_hill.z * 0.36 * exp(-d * d / 0.02);
  h += hill;

  float x = h * 15.0;                            // 15 contour steps per unit of height
  float idx = floor(x + 0.5);
  float fw = max(fwidth(x), 1e-4);
  float px = abs(x - idx) / fw;                  // distance to nearest contour, in pixels
  float major = 1.0 - step(0.5, mod(idx, 5.0));  // every fifth line is an index contour
  float w = mix(0.85, 1.5, major) * u_px;
  float cov = 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.6, px);

  float high = clamp(smoothstep(0.04, 0.34, h) + hill * 2.2, 0.0, 1.0);
  vec3 col = mix(u_line, u_accent, high * 0.85);
  float a = cov * u_alpha * mix(1.0, 1.9, major) * mix(1.0, 2.3, high);

  if (u_dark > 0.5) {                            // desert night: sparse, slow-twinkling stars
    vec2 cs = vec2(5.0 * u_px);
    vec2 cell = floor(gl_FragCoord.xy / cs);
    vec2 local = fract(gl_FragCoord.xy / cs) - 0.5;
    float r = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float on = step(0.9972, r);
    float tw = 0.55 + 0.45 * sin(u_time * (0.4 + 1.6 * fract(r * 17.0)) + r * 60.0);
    float sky = smoothstep(0.25, 0.95, gl_FragCoord.y / u_res.y);
    float s = on * tw * sky * smoothstep(0.42, 0.0, length(local)) * 0.7;
    col = mix(col, u_line, s * (1.0 - a));
    a = a + s * (1.0 - a);
  }

  gl_FragColor = vec4(col * a, a);                // premultiplied alpha
}
`;

const MAX_PIXELS = 2.2e6;

/**
 * @param {WebGLRenderingContext} gl
 * @param {number} type
 * @param {string} src
 */
function compile(gl, type, src) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[topo] shader compile failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** @param {WebGLRenderingContext} gl */
function buildProgram(gl) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[topo] program link failed:', gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);
  // one triangle that covers the whole viewport (cheaper than a two-triangle quad)
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  /** @param {string} name */
  const u = (name) => gl.getUniformLocation(prog, name);
  return {
    res: u('u_res'), time: u('u_time'), hill: u('u_hill'), line: u('u_line'),
    accent: u('u_accent'), alpha: u('u_alpha'), dark: u('u_dark'), px: u('u_px'),
  };
}

/**
 * @param {HTMLCanvasElement} canvas
 */
export function initTopo(canvas) {
  const hero = canvas.closest('.hero');
  if (!(hero instanceof HTMLElement)) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: false,
    depth: false, stencil: false, powerPreference: 'low-power',
  });
  if (!gl || !gl.getExtension('OES_standard_derivatives')) return; // paper background it is

  let uniforms = buildProgram(gl);
  if (!uniforms) return;

  const lat = hero.querySelector('[data-lat]');
  const lon = hero.querySelector('[data-lon]');

  const s = {
    // A different stretch of terrain every visit, unless data-seed pins it
    // (scripts/og-card.html does, so the preview image is reproducible).
    time: canvas.dataset.seed !== undefined ? Number(canvas.dataset.seed) || 0 : Math.random() * 400,
    px: 1,
    visible: true,
    raf: 0,
    last: 0,
    lastDraw: 0,
    lastMove: -Infinity,
    lastCoords: 0,
    lost: false,
    // hill position in CSS px relative to the hero; target vs eased value
    hx: 0, hy: 0, tx: 0, ty: 0,
    amt: 0, targetAmt: 0,
    colors: { line: [0, 0, 0], accent: [0, 0, 0], alpha: 0.12, dark: 0 },
  };

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const line = hexToRgb(cs.getPropertyValue('--topo-line'));
    const accent = hexToRgb(cs.getPropertyValue('--topo-accent'));
    const alpha = parseFloat(cs.getPropertyValue('--topo-alpha'));
    if (line) s.colors.line = line;
    if (accent) s.colors.accent = accent;
    if (Number.isFinite(alpha)) s.colors.alpha = alpha;
    s.colors.dark = document.documentElement.getAttribute('data-theme') === 'dark' ? 1 : 0;
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !gl) return;
    const dpr = window.devicePixelRatio || 1;
    s.px = Math.max(0.6, Math.min(dpr, 1.5, Math.sqrt(MAX_PIXELS / (w * h))));
    canvas.width = Math.round(w * s.px);
    canvas.height = Math.round(h * s.px);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw() {
    if (!gl || !uniforms || s.lost) return;
    const c = s.colors;
    gl.uniform2f(uniforms.res, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, s.time);
    // CSS px (top-left origin) → buffer px (bottom-left origin)
    gl.uniform3f(uniforms.hill, s.hx * s.px, canvas.height - s.hy * s.px, s.amt);
    gl.uniform3f(uniforms.line, c.line[0], c.line[1], c.line[2]);
    gl.uniform3f(uniforms.accent, c.accent[0], c.accent[1], c.accent[2]);
    gl.uniform1f(uniforms.alpha, c.alpha);
    gl.uniform1f(uniforms.dark, c.dark);
    gl.uniform1f(uniforms.px, s.px);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.classList.add('is-ready');
  }

  /** Touch screens get no cursor, so the hill wanders on its own. */
  function wander() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const t = s.time * 0.12;
    s.tx = w * (0.68 + 0.2 * Math.sin(t * 1.3));
    s.ty = h * (0.42 + 0.22 * Math.sin(t * 0.9 + 1.2));
    s.targetAmt = 0.75;
  }

  /** @param {number} now */
  function frame(now) {
    s.raf = 0;
    if (!s.visible || s.lost) return;
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const busy = now - s.lastMove < 1800 || Math.abs(s.amt - s.targetAmt) > 0.004;
    // Idle: ~30fps is plenty for terrain drifting this slowly.
    if (busy || now - s.lastDraw >= 32) {
      // advance by real elapsed time, but never jump after a pause
      s.time += Math.min(0.1, s.lastDraw ? (now - s.lastDraw) / 1000 : dt);
      if (!canHover) wander();
      const k = 1 - Math.exp(-dt * 7);           // frame-rate independent easing
      s.hx += (s.tx - s.hx) * k;
      s.hy += (s.ty - s.hy) * k;
      s.amt += (s.targetAmt - s.amt) * (1 - Math.exp(-dt * 3));
      draw();
      s.lastDraw = now;
    }
    s.raf = requestAnimationFrame(frame);
  }

  function start() {
    if (reduced || s.raf || !s.visible || document.hidden || s.lost) return;
    s.last = 0;
    s.raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0;
  }

  // --- wiring ---------------------------------------------------------------
  readColors();
  resize();
  if (!canHover) wander();
  s.hx = s.tx; s.hy = s.ty;
  draw();

  new ResizeObserver(() => { resize(); draw(); }).observe(canvas);

  new IntersectionObserver(([entry]) => {
    s.visible = entry.isIntersecting;
    if (s.visible) start(); else stop();
  }).observe(hero);

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  document.addEventListener('sb:themechange', () => { readColors(); draw(); });

  if (canHover && !reduced) {
    hero.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      s.tx = e.clientX - r.left;
      s.ty = e.clientY - r.top;
      s.targetAmt = 1;
      s.lastMove = performance.now();
      if (s.lastMove - s.lastCoords > 60 && lat && lon) {
        s.lastCoords = s.lastMove;
        const c = coordsFor(s.tx / r.width, s.ty / r.height);
        lat.textContent = c.lat;
        lon.textContent = c.lon;
      }
      start();
    }, { passive: true });
    hero.addEventListener('pointerleave', () => {
      s.targetAmt = 0;
      s.lastMove = performance.now();
    });
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();          // tells the browser we intend to restore
    s.lost = true;
    stop();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    s.lost = false;
    gl.getExtension('OES_standard_derivatives');
    uniforms = buildProgram(gl);
    if (!uniforms) return;
    resize();
    draw();
    start();
  });

  start();
}
