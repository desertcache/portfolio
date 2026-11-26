/* THE LAST INVENTION · slides.js
   What the particle universe does on each slide, plus the small behaviors some slides need.
   A slide's scene is merged over the deck defaults; each entry in steps[] is a delta applied on that click. */
(() => {
  'use strict';
  const TLI = window.TLI;
  const C = TLI.charts || {};

  TLI.textSpecs = {
    title: {
      lines: [
        { t: 'THE LAST', size: 0.4, weight: 500, track: 0.62 },
        { t: 'INVENTION', size: 1, weight: 800, track: 0.035 },
      ],
      maxW: 7.9, fill: 0.86, y: 0.42, yN: 0.62, maxH: 2.5,
    },
  };

  TLI.ACTS = [
    { name: 'Prologue', roman: '·', accent: '#8fd3ff', accent2: '#eef6ff' },
    { name: 'Act I · The Curve', roman: 'I', accent: '#5fd0ff', accent2: '#a6efff' },
    { name: 'Act II · The Loop', roman: 'II', accent: '#b591ff', accent2: '#ff6fd0' },
    { name: 'Act III · Detonation', roman: 'III', accent: '#ffad4d', accent2: '#ffd27a' },
    { name: 'Act IV · The Fork', roman: 'IV', accent: '#ffcd66', accent2: '#ff4a62' },
    { name: 'Act V · You Are Here', roman: 'V', accent: '#f4f6ff', accent2: '#9dbdff' },
  ];

  const field = (pal, extra) => Object.assign(
    { form: 'field', morph: 2.2, spread: 0.7, swirl: 0.7, pal, bright: 0.85, rot: [0.014, 0], turb: 0.02, bloom: 0.7, neb: 0.3 },
    extra || {}
  );
  const $ = (id) => document.getElementById(id);

  TLI.slideDefs = {
    /* ---------- prologue ---------- */
    title: {
      scene: { form: 'text:title', morph: 2.9, spread: 0.75, swirl: 1.5, turb: 0.01, rot: [0, 0], pal: 'p0', size: 0.021, sizeVar: 0.22, bright: 1.1, bloom: 1.35, neb: 0.55, cam: { dist: 6.2 } },
    },
    hook: {
      scene: { form: 'singularity', morph: 2.4, spread: 0.3, swirl: 0.25, rot: [0, 0], flow: 0.55, tilt: [0.34, 0, 0.12], offset: [0, -1.25, 0], offsetM: [0, -1.6, 0], turb: 0.004, pulse: [0.25, 0.45], pal: 'p0', bloom: 1.25, neb: 0.4, cam: { dist: 5.4 } },
      steps: [null, { form: 'burst', morph: 1.3, spread: 0.12, swirl: 0, kick: 'flash', sound: 'boom', flow: 0, rot: [0.05, 0.004], tilt: [0, 0, 0], offset: [0, 0, 0], offsetM: [0, 0, 0], pulse: [0, 1], bloom: 1.0, turb: 0.05, cam: { dist: 6.2 } }],
    },

    /* ---------- act I ---------- */
    'act-1': {
      scene: { form: 'curve', morph: 2.6, spread: 0.7, swirl: 0.9, rot: [0, 0], pal: 'p1', turb: 0.008, size: 0.014, kick: 'warp', sound: 'whoosh', cam: { dist: 6.3 } },
    },
    intervals: {
      scene: field('p1', { bright: 0.7 }),
      enter(ctx) {
        if (!C.zoom) return;
        C.zoom.enter(() => { if (ctx.isCurrent()) ctx.setStep(1); });
        if (ctx.toEnd) C.zoom.finish();
      },
      exit() { if (C.zoom) C.zoom.exit(); },
      next() { if (C.zoom && !C.zoom.done()) { C.zoom.finish(); return true; } return false; },
    },
    compute: { scene: field('p1', { rot: [0.01, 0.002] }), chart: 'compute' },
    buildout: { scene: field('p1', { rot: [-0.012, 0] }), chart: 'capex' },
    ladder: {
      scene: { form: 'neural', morph: 2.4, spread: 0.6, rot: [0.05, 0], wave: [0.9, 2.4, 3.2, [-4, 0, 0]], pal: 'p1', bright: 0.2, offset: [1.2, 0.6, -5], turb: 0.01, bloom: 0.6 },
    },
    horizon: {
      scene: field('p1', { rot: [0.012, -0.002] }),
      chart: 'horizon',
      enter() {
        const p = C.horizonProjection;
        if (!p) return;
        document.querySelectorAll('[data-proj="month"]').forEach((el) => { el.textContent = p.month; });
        document.querySelectorAll('[data-proj="year"]').forEach((el) => { el.textContent = p.year; });
      },
    },
    anchored: { scene: field('p1', { form: 'sphere', bright: 0.24, offset: [4.2, 0.4, -7], offsetM: [0, 1.5, -7], rot: [0.04, 0.01], neb: 0.4 }) },

    /* ---------- act II ---------- */
    'act-2': {
      scene: { form: 'ring', morph: 2.5, spread: 0.6, swirl: 0.8, flow: 0.6, tilt: [1.12, 0, 0.18], pal: 'p2', rot: [0, 0], turb: 0.01, kick: 'warp', sound: 'whoosh', offset: [2.1, 0, 0], offsetM: [0, 0.5, 0], cam: { dist: 6.2 } },
    },
    'last-invention': {
      scene: { form: 'sphere', morph: 2.4, rot: [0.1, 0.02], pal: 'p2', turb: 0.012, offset: [2.7, 0.1, -1], offsetM: [0, 1.7, -1.5], pulse: [0.1, 0.22], bright: 0.95, bloom: 1.0 },
    },
    loop: {
      scene: { form: 'ring', morph: 2.2, flow: 0.5, tilt: [Math.PI / 2, 0, 0], pal: 'p2', offset: [1.6, 0.3, 0], offsetM: [0, 0.4, 0], bright: 0.55, rot: [0, 0], turb: 0.01, bloom: 0.8 },
      chart: 'loop',
      enter(ctx) {
        // centre the particle ring on the 2D loop diagram so it reads as a halo around it
        const cv = $('cv-loop');
        if (!cv) return;
        const place = () => {
          const r = cv.getBoundingClientRect();
          if (!r.width) return;
          const W = innerWidth, H = innerHeight, a = W / H;
          const mul = a < 1.3 ? Math.min(2.4, 1.3 / Math.max(a, 0.35)) : 1;
          const half = 6 * mul * Math.tan(Math.PI / 8);
          const x = ((r.left + r.width / 2) / W * 2 - 1) * half * a;
          const y = -((r.top + r.height / 2) / H * 2 - 1) * half;
          ctx.engine.update({ offset: [x, y, 0], offsetM: [x, y, 0] });
        };
        place();
        ctx.timer(place, 400);
      },
      steps: [null, { flow: 1.0 }, { flow: 1.8 }, { flow: 3.0 }, { flow: 4.6, bright: 0.65 }, { flow: 7.5, bright: 0.85, kick: 'glitch', sound: 'rise' }, {}],
      init() {
        const bar = $('zeno-bar');
        if (!bar || bar.childElementCount) return;
        for (let k = 0; k < 12; k++) {
          const s = document.createElement('i');
          s.style.left = (1 - Math.pow(2, -k)) * 100 + '%';
          s.style.width = Math.pow(2, -(k + 1)) * 100 + '%';
          s.style.setProperty('--n', Math.min(k, 9));
          bar.appendChild(s);
        }
      },
      onStep(i) {
        const segs = document.querySelectorAll('#zeno-bar i');
        segs.forEach((s, k) => {
          const on = i >= 5 ? true : k < i;
          s.style.transitionDelay = i >= 5 && k >= 4 ? (k - 4) * 110 + 'ms' : '0ms';
          s.classList.toggle('on', on);
        });
      },
    },
    engines: {
      scene: { form: 'gyro', morph: 2.4, rot: [0.22, 0.08], pal: 'p2', bright: 0.34, offset: [0, 0.5, -5], turb: 0.01 },
    },
    geniuses: {
      scene: { form: 'grid', morph: 2.6, spread: 0.5, swirl: 0.7, rot: [0, 0], pal: 'p2', reveal: 48, revealRate: 1.6, turb: 0.003, bright: 1.6, size: 0.026, pulse: [0.2, 0.5], bloom: 1.25, cam: { dist: 4.2, pitch: 0.42, target: [0, -1.05, -3.0], rate: 1.2 } },
      steps: [
        null,
        { reveal: 1100, revealRate: 1.1, cam: { dist: 5.2, pitch: 0.45, target: [0, -1.05, -3.4], rate: 1.0 }, sound: 'rise' },
        { reveal: 1e9, revealRate: 0.75, wave: [0.55, 1.2, 2.4, [0, -1.05, -3]], cam: { dist: 7.6, pitch: 0.36, target: [0, -0.6, -7], rate: 0.8 }, sound: 'rise' },
        { cam: { dist: 8.6, pitch: 0.3, target: [0, -0.4, -9.5], rate: 0.6 } },
      ],
    },

    /* ---------- act III ---------- */
    'act-3': {
      scene: { form: 'burst', morph: 1.6, spread: 0.15, swirl: 0.2, kick: ['flash', 'glitch'], sound: 'boom', pal: 'p3', rot: [0.06, 0.01], turb: 0.06, bloom: 1.1, cam: { dist: 6.2 } },
    },
    decade: {
      scene: { form: 'river', morph: 2.6, flow: 0.09, pal: 'p3', offset: [0, -1.4, -9], offsetM: [0, -2.4, -9], rot: [0, 0], bright: 0.9, turb: 0.02 },
      steps: [null, { flow: 0.12 }, { flow: 0.16 }, { flow: 0.22 }, { flow: 0.3 }, { flow: 0.4 }, { flow: 0.55, sound: 'rise' }],
    },
    biology: {
      scene: { form: 'helix', morph: 2.4, rot: [0.35, 0], pal: 'p3', offset: [2.8, 0, -0.5], offsetM: [0, -1.5, -2.5], tilt: [0, 0, 0.22], bright: 0.95, turb: 0.01 },
    },
    economy: {
      scene: { form: 'columns', morph: 2.4, pal: 'p3', bright: 0.13, offset: [-1.5, -0.2, -6], rot: [0, 0], turb: 0.01, bloom: 0.75 },
      chart: 'gdp',
      steps: [null, { bright: 0.2, sound: 'rise' }],
    },
    robots: {
      scene: { form: 'robots:1', morph: 1.9, spread: 0.35, swirl: 0.35, pal: 'p3', rot: [0, 0], turb: 0.004, offset: [1.75, 0.15, 0], offsetM: [0, 0.4, 0], bright: 1.2, sizeVar: 0.45, bloom: 1.05 },
      enter(ctx) {
        const seq = [1, 2, 4, 8, 16, 32, 64];
        const nEl = $('robot-n'), gEl = $('robot-gen');
        const show = (j) => { if (nEl) nEl.textContent = String(seq[j]); if (gEl) gEl.textContent = j === 0 ? 'Year 0' : 'Year ' + j; };
        let k = 0;
        if (ctx.toEnd) { k = seq.length - 1; show(k); ctx.engine.setScene(Object.assign({}, ctx.base, { form: 'robots:64', morph: 1.2 })); return; }
        show(0);
        const tick = () => {
          k++;
          if (k >= seq.length) return;
          ctx.engine.setScene(Object.assign({}, ctx.base, { form: 'robots:' + seq[k], morph: 1.05, spread: 0.3, swirl: 0.3 }));
          show(k);
          if (TLI.audio) TLI.audio.sfx('blip', k);
          ctx.timer(tick, 1300);
        };
        ctx.timer(tick, 2400);
      },
    },
    sun: {
      scene: { form: 'sun', morph: 2.6, flow: 0.32, tilt: [0.42, 0, 0.12], pal: 'ps', offset: [2.7, 0, -0.6], offsetM: [0, -1.5, -2], bloom: 1.6, bright: 1.2, pulse: [0.05, 0.3], rot: [0, 0], turb: 0.008 },
    },

    /* ---------- act IV ---------- */
    'act-4': {
      scene: { form: 'fork', morph: 2.6, pal: 'p4', turb: 0.05, kick: 'warp', sound: 'whoosh', rot: [0, 0], offset: [0.9, -0.95, 0], offsetM: [0, 0.8, 0], cam: { dist: 6.2 } },
    },
    futures: {
      scene: { form: 'twin', morph: 2.4, pal: 'p4', turb: 0.03, rot: [0, 0], offset: [0, 0.45, 0], offsetM: [0, 0.6, 0], cam: { dist: 6.5 } },
    },

    /* ---------- act V ---------- */
    here: {
      scene: { form: 'knee', morph: 2.6, pal: 'p5', kick: 'warp', sound: 'whoosh', rot: [0, 0], turb: 0.006, cam: { dist: 4.9, target: [-0.1, 0.2, 0], rate: 0.9 } },
      enter(ctx) {
        const m = $('here-marker');
        if (!m) return;
        ctx.frame(() => {
          const a = ctx.engine.anchors && ctx.engine.anchors.knee;
          if (!a) return;
          const p = ctx.engine.project(a);
          if (p) m.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        });
        m.classList.add('on');
        ctx.onExit(() => m.classList.remove('on'));
      },
    },
    made: {
      scene: { form: 'code', morph: 2.8, spread: 0.85, swirl: 1.0, pal: 'p5', rot: [0, 0], bright: 0.62, offset: [1.9, 0, -0.8], offsetM: [0, 0, -1.4], turb: 0.005 },
      steps: [null, { bright: 0.7 }, { bright: 0.8 }, { bright: 0.95, sound: 'rise' }],
      enter() {
        const n = (window.TLI_BUILD && window.TLI_BUILD.lines) || 0;
        document.querySelectorAll('[data-lines]').forEach((el) => { if (n) el.textContent = n.toLocaleString('en-US'); });
      },
    },
    finale: {
      scene: { form: 'galaxy', morph: 3.4, spread: 0.6, swirl: 1.3, flow: 0.12, tilt: [1.0, 0, 0.32], pal: 'pg', bloom: 1.3, bright: 1.25, kick: 'warp-long', sound: 'swell', rot: [0, 0], turb: 0.004, offset: [0, 0.3, 0], cam: { dist: 6.6 } },
    },
  };
})();
