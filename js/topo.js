// @ts-check
import { hexToRgb } from './lib.js';
import { viewFor, pointAt, shaderUV, decodeHeightmap, readout, scaleBar } from './arizona.js';
import { TERRAIN } from './terrain-data.js';

/**
 * The hero's topographic map: real contour lines around Camelback Mountain.
 *
 * Mental model: scripts/build_terrain.py baked USGS elevation into an image
 * (12 bits per pixel across its red and green channels). The fragment shader
 * reads the elevation under every pixel and draws a line wherever it crosses
 * a round number of feet, the way a USGS quad does: thin lines every 20 ft,
 * stronger ones every 100, a bold index line every 500. `fwidth` says how fast
 * the elevation changes per pixel, which keeps lines ~1px wide and
 * anti-aliased on any slope, and lets a family of lines fade out where it
 * would crowd. The cursor adds a soft hill on top; the view drifts on a slow
 * loop; the legend reads out the real coordinates and elevation under the
 * pointer. js/arizona.js holds the geometry, so it is unit-tested.
 *
 * Cost control, because this runs behind the most important screen:
 *  - one full-screen triangle, one 160 KB texture, fetched after first paint
 *  - drawing buffer capped at ~2.2 megapixels whatever the display
 *  - ~20fps while idle (the drift is slow), full rate only while the hill moves
 *  - stops entirely when the hero is off screen or the tab is hidden
 *  - reduced motion: one still frame; the readout still works, the hill doesn't
 *  - no WebGL, or no heightmap: the canvas stays invisible and paper shows
 */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform vec2 u_res;       // drawing buffer size, px
uniform float u_time;     // seconds (only advances while animating)
uniform vec3 u_hill;      // xy = hill centre in buffer px (origin bottom-left), z = strength 0..1
uniform float u_hillR;    // hill radius (one sigma), buffer px
uniform vec3 u_low;       // contour colour on the desert floor
uniform vec3 u_mid;       // …on the slopes (red rock)
uniform vec3 u_high;      // …at the summits, and wherever the hill lifts the ground
uniform float u_alpha;    // base line opacity
uniform float u_dark;     // 1.0 in dark theme: adds a few stars
uniform float u_px;       // buffer px per CSS px, keeps line width constant
uniform sampler2D u_map;  // the heightmap
uniform vec2 u_mapSize;   // its texels, cols x rows
uniform vec2 u_elev;      // metres at packed value 0 and at 4095
uniform vec2 u_uv0;       // heightmap uv at buffer pixel (0, 0)
uniform vec2 u_duv;       // heightmap uv per buffer pixel

float texel(vec2 ij) {
  vec3 c = texture2D(u_map, (ij + 0.5) / u_mapSize).rgb;
  float v = c.r * 4080.0 + c.g * 15.9375;        // 16*R + G/16, with R and G in 0..255
  return mix(u_elev.x, u_elev.y, v / 4095.0);
}

// Bilinear by hand, on a NEAREST texture: a GPU filtering the two packed
// channels itself may round each to 8 bits, which terraces the lines.
float metres(vec2 uv) {
  vec2 p = uv * u_mapSize - 0.5;
  vec2 i = clamp(floor(p), vec2(0.0), u_mapSize - 2.0);
  vec2 f = clamp(p - i, 0.0, 1.0);
  return mix(mix(texel(i), texel(i + vec2(1.0, 0.0)), f.x),
             mix(texel(i + vec2(0.0, 1.0)), texel(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Colour by elevation, the way a hypsometric map tints: floor, slopes, summit.
vec3 ramp(float ft) {
  vec3 c = mix(u_low, u_mid, smoothstep(1400.0, 1800.0, ft));
  return mix(c, u_high, smoothstep(2350.0, 2650.0, ft));
}

// Coverage of one family of contours, one every step feet, width CSS px wide.
// It fades out where its lines would sit closer than crowd CSS px apart, so
// steep ground keeps its bold lines instead of going solid.
float contour(float ft, float fw, float step, float width, float crowd) {
  float x = ft / step;
  float fx = max(fw / step, 1e-5);
  float d = abs(x - floor(x + 0.5)) / fx;        // buffer px to the nearest line
  float w = width * u_px;
  float cov = 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.6, d);
  if (crowd <= 0.0) return cov;
  return cov * smoothstep(crowd, crowd * 2.0, 1.0 / (fx * u_px));
}

void main() {
  float ground = metres(u_uv0 + gl_FragCoord.xy * u_duv) * 3.28084;   // feet

  // the cursor's hill, sized to the screen rather than the map
  float r = distance(gl_FragCoord.xy, u_hill.xy) / u_hillR;
  float hill = u_hill.z * exp(-0.5 * r * r);
  float ft = ground + hill * 340.0;
  float fw = fwidth(ft);

  float cov = max(max(contour(ft, fw, 20.0, 0.75, 5.0) * 0.55,
                      contour(ft, fw, 100.0, 0.9, 2.5)),
                  contour(ft, fw, 500.0, 1.5, 0.0) * 1.9);

  float high = clamp(smoothstep(1500.0, 2600.0, ground) + hill * 0.8, 0.0, 1.0);
  vec3 col = ramp(ft);                            // the hill climbs the ramp too
  float a = clamp(cov * u_alpha * mix(1.0, 2.3, high), 0.0, 1.0);

  if (u_dark > 0.5) {                            // dusk: sparse, slow-twinkling first stars
    vec2 cs = vec2(5.0 * u_px);
    vec2 cell = floor(gl_FragCoord.xy / cs);
    vec2 local = fract(gl_FragCoord.xy / cs) - 0.5;
    float rnd = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float on = step(0.9972, rnd);
    float tw = 0.55 + 0.45 * sin(u_time * (0.4 + 1.6 * fract(rnd * 17.0)) + rnd * 60.0);
    float sky = smoothstep(0.25, 0.95, gl_FragCoord.y / u_res.y);
    float s = on * tw * sky * smoothstep(0.42, 0.0, length(local)) * 0.7;
    col = mix(col, vec3(1.0, 0.95, 0.9), s * (1.0 - a));
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
    res: u('u_res'), time: u('u_time'), hill: u('u_hill'), hillR: u('u_hillR'),
    low: u('u_low'), mid: u('u_mid'), high: u('u_high'), alpha: u('u_alpha'), dark: u('u_dark'), px: u('u_px'),
    map: u('u_map'), mapSize: u('u_mapSize'), elev: u('u_elev'), uv0: u('u_uv0'), duv: u('u_duv'),
  };
}

/** @typedef {ImageBitmap | HTMLImageElement} Heightmap */

/**
 * Fetch and decode the heightmap with no colour management: the bytes are
 * data, and a colour profile "correcting" them would move mountains.
 * @param {string} url
 * @returns {Promise<Heightmap>}
 */
async function loadHeightmap(url) {
  if ('createImageBitmap' in window) {
    try {
      // Low priority: on a slow phone the stylesheet and fonts should win the race; the map fades in after.
      const res = await fetch(url, /** @type {RequestInit} */ ({ priority: 'low' }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    } catch (err) {
      console.warn('[topo] createImageBitmap path failed, trying <img>:', err);
    }
  }
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {Heightmap} source
 */
function uploadHeightmap(gl, source) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
  // NEAREST + clamp + no mipmaps: legal for a non-power-of-two texture in WebGL 1
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/**
 * The same heightmap as numbers, for the legend's elevation readout. Null if
 * the browser won't hand the pixels back (some privacy modes); the readout
 * then shows coordinates and summits only.
 * @param {Heightmap} source
 * @returns {Uint16Array | null}
 */
function readHeightmap(source) {
  try {
    const c = document.createElement('canvas');
    c.width = TERRAIN.cols;
    c.height = TERRAIN.rows;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);
    return decodeHeightmap(ctx.getImageData(0, 0, TERRAIN.cols, TERRAIN.rows).data, TERRAIN.cols, TERRAIN.rows);
  } catch (err) {
    console.warn('[topo] heightmap readback failed:', err);
    return null;
  }
}

/**
 * The legend's live fields. Writes only what changed, so a moving pointer
 * doesn't cost a layout per event.
 * @param {HTMLElement} hero
 */
function legendFields(hero) {
  /** @param {string} attr */
  const q = (attr) => hero.querySelector(`[${attr}]`);
  const fields = { lat: q('data-lat'), lon: q('data-lon'), elev: q('data-elev'), place: q('data-place') };
  // what the place reads when the pointer is on no named peak
  const place = fields.place?.getAttribute('data-place') ?? '';
  const bar = q('data-scale');
  const barLabel = q('data-scale-label');
  /** @type {Record<string, string>} */
  const last = {};
  return {
    /** @param {{ lat: string, lon: string, elev: string | null, place: string | null }} r */
    show(r) {
      const next = { lat: r.lat, lon: r.lon, elev: r.elev ?? '', place: r.place ?? place };
      for (const [key, el] of Object.entries(fields)) {
        const text = next[/** @type {keyof typeof next} */ (key)];
        if (el && last[key] !== text) {
          el.textContent = text;
          last[key] = text;
        }
      }
    },
    /** @param {number} mpp */
    scale(mpp) {
      const s = scaleBar(mpp);
      if (bar instanceof HTMLElement) bar.style.setProperty('--scale-w', `${s.px}px`);
      if (barLabel && barLabel.textContent !== s.label) barLabel.textContent = s.label;
    },
  };
}

/**
 * @param {HTMLCanvasElement} canvas
 */
export async function initTopo(canvas) {
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

  // The heightmap path is relative to the site root; resolve it from this
  // module so pages in subfolders (scripts/og-card.html) find it too.
  const source = await loadHeightmap(new URL(`../${TERRAIN.src}`, import.meta.url).href);
  if (source.width !== TERRAIN.cols || source.height !== TERRAIN.rows) {
    console.warn('[topo] heightmap size does not match js/terrain-data.js; rerun scripts/build_terrain.py');
    return;
  }
  uploadHeightmap(gl, source);
  const grid = readHeightmap(source);
  const legend = legendFields(hero);
  const home = () => legend.show(readout(TERRAIN, grid, TERRAIN.focus.lat, TERRAIN.focus.lon));

  const s = {
    // data-seed pins the moment (scripts/og-card.html does, for a reproducible
    // preview image); otherwise the loop starts where the framing was designed.
    time: Number(canvas.dataset.seed) || 0,
    px: 1,
    w: 1, h: 1,                    // canvas size, CSS px (read on resize, not per frame)
    view: viewFor(TERRAIN, 1, 1),
    visible: true,
    raf: 0,
    last: 0,
    lastDraw: 0,
    lastMove: -Infinity,
    lastRead: 0,
    lost: false,
    inside: false,
    // hill position in CSS px relative to the hero; target vs eased value
    hx: 0, hy: 0, tx: 0, ty: 0,
    amt: 0, targetAmt: 0,
    /** @type {{ low: number[], mid: number[], high: number[], alpha: number, dark: number }} */
    colors: { low: [0, 0, 0], mid: [0, 0, 0], high: [0, 0, 0], alpha: 0.12, dark: 0 },
  };

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const key of /** @type {const} */ (['low', 'mid', 'high'])) {
      const rgb = hexToRgb(cs.getPropertyValue(`--topo-${key}`));
      if (rgb) s.colors[key] = rgb;
    }
    const alpha = parseFloat(cs.getPropertyValue('--topo-alpha'));
    if (Number.isFinite(alpha)) s.colors.alpha = alpha;
    s.colors.dark = document.documentElement.getAttribute('data-theme') === 'dark' ? 1 : 0;
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !gl) return;
    s.w = w;
    s.h = h;
    const dpr = window.devicePixelRatio || 1;
    s.px = Math.max(0.6, Math.min(dpr, 1.5, Math.sqrt(MAX_PIXELS / (w * h))));
    canvas.width = Math.round(w * s.px);
    canvas.height = Math.round(h * s.px);
    gl.viewport(0, 0, canvas.width, canvas.height);
    legend.scale(viewFor(TERRAIN, w, h, s.time).mpp);
  }

  function draw() {
    if (!gl || !uniforms || s.lost) return;
    const c = s.colors;
    s.view = viewFor(TERRAIN, s.w, s.h, s.time);
    const map = shaderUV(TERRAIN, s.view, canvas.height, s.px);
    gl.uniform2f(uniforms.res, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, s.time);
    // CSS px (top-left origin) → buffer px (bottom-left origin)
    gl.uniform3f(uniforms.hill, s.hx * s.px, canvas.height - s.hy * s.px, s.amt);
    gl.uniform1f(uniforms.hillR, 0.085 * Math.min(s.h, 1000) * s.px);
    gl.uniform3f(uniforms.low, c.low[0], c.low[1], c.low[2]);
    gl.uniform3f(uniforms.mid, c.mid[0], c.mid[1], c.mid[2]);
    gl.uniform3f(uniforms.high, c.high[0], c.high[1], c.high[2]);
    gl.uniform1f(uniforms.alpha, c.alpha);
    gl.uniform1f(uniforms.dark, c.dark);
    gl.uniform1f(uniforms.px, s.px);
    gl.uniform1i(uniforms.map, 0);
    gl.uniform2f(uniforms.mapSize, TERRAIN.cols, TERRAIN.rows);
    gl.uniform2f(uniforms.elev, TERRAIN.elevLoM, TERRAIN.elevHiM);
    gl.uniform2f(uniforms.uv0, map.u0, map.v0);
    gl.uniform2f(uniforms.duv, map.du, map.dv);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.classList.add('is-ready');
  }

  /** What's under the pointer, from the view as last drawn. */
  function readPointer() {
    const p = pointAt(TERRAIN, s.view, s.tx, s.ty);
    legend.show(readout(TERRAIN, grid, p.lat, p.lon));
  }

  /** Touch screens get no cursor, so the hill wanders on its own. */
  function wander() {
    const t = s.time * 0.12;
    s.tx = s.w * (0.68 + 0.2 * Math.sin(t * 1.3));
    s.ty = s.h * (0.42 + 0.22 * Math.sin(t * 0.9 + 1.2));
    s.targetAmt = 0.75;
  }

  /** @param {number} now */
  function frame(now) {
    s.raf = 0;
    if (!s.visible || s.lost) return;
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const busy = now - s.lastMove < 1800 || Math.abs(s.amt - s.targetAmt) > 0.004;
    // Idle: ~20fps is plenty for a map drifting this slowly.
    if (busy || now - s.lastDraw >= 48) {
      // advance by real elapsed time, but never jump after a pause
      s.time += Math.min(0.1, s.lastDraw ? (now - s.lastDraw) / 1000 : dt);
      if (!canHover) wander();
      const k = 1 - Math.exp(-dt * 7);           // frame-rate independent easing
      s.hx += (s.tx - s.hx) * k;
      s.hy += (s.ty - s.hy) * k;
      s.amt += (s.targetAmt - s.amt) * (1 - Math.exp(-dt * 3));
      draw();
      s.lastDraw = now;
      // the ground drifts under a still pointer, so keep its readout honest
      if (s.inside && now - s.lastRead > 250) {
        s.lastRead = now;
        readPointer();
      }
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
  home();

  new ResizeObserver(() => { resize(); draw(); }).observe(canvas);

  new IntersectionObserver(([entry]) => {
    s.visible = entry.isIntersecting;
    if (s.visible) start(); else stop();
  }).observe(hero);

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  document.addEventListener('sb:themechange', () => { readColors(); draw(); });

  if (canHover) {
    hero.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      s.tx = e.clientX - r.left;
      s.ty = e.clientY - r.top;
      s.inside = true;
      const now = performance.now();
      if (now - s.lastRead > 60) {
        s.lastRead = now;
        readPointer();
      }
      if (reduced) return;                        // the readout is information; the hill is motion
      s.targetAmt = 1;
      s.lastMove = now;
      start();
    }, { passive: true });
    hero.addEventListener('pointerleave', () => {
      s.inside = false;
      s.targetAmt = 0;
      s.lastMove = performance.now();
      home();
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
    uploadHeightmap(gl, source);  // textures die with the context
    resize();
    draw();
    start();
  });

  start();
}
