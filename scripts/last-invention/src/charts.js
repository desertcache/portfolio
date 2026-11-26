/* THE LAST INVENTION · charts.js
   2D canvas visuals layered over the particle universe: the time zoom, compute (log to linear),
   the capital-spending bars, METR time horizons with projection, the recursive loop, and world GDP.
   Every number drawn here comes from the data arrays below. */
(() => {
  'use strict';
  const TLI = window.TLI;
  const RM = !!TLI.reducedMotion;
  const C = (TLI.charts = {});

  // A host page can swap the faces (the portfolio build uses the site's own Archivo) via TLI.FONTS.
  const FONTS = TLI.FONTS || {};
  const MONO = FONTS.mono || "'Martian Mono', 'Cascadia Mono', Consolas, monospace";
  const DISP = FONTS.display || "Unbounded, Bahnschrift, 'Segoe UI', sans-serif";
  const SERIF = FONTS.text || "Newsreader, 'Sitka Text', Georgia, serif";
  const INK = [238, 241, 251], INK2 = [182, 189, 212], INK3 = [124, 133, 159], LINE = [196, 208, 255];
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const ease = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).split('').map((d) => (d === '-' ? '⁻' : SUP[+d])).join('');

  const root = document.documentElement;
  const acc = { t: -1, rgb: [143, 211, 255] };
  function accent() {
    const now = performance.now();
    if (now - acc.t > 100) {
      const v = getComputedStyle(root).getPropertyValue('--accent').trim();
      const m = v.match(/rgba?\(([^)]+)\)/);
      if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); acc.rgb = [p[0], p[1], p[2]]; }
      else if (v[0] === '#') { const n = parseInt(v.slice(1, 7), 16); acc.rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
      acc.t = now;
    }
    return acc.rgb;
  }

  /* A canvas that fits its box at device pixel ratio and draws only while its slide is live. */
  function Surface(id) {
    const cv = document.getElementById(id);
    if (!cv) return null;
    const g = cv.getContext('2d');
    const s = { cv, g, w: 0, h: 0, live: false, draw: null };
    let raf = 0, last = 0;
    s.fit = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w !== s.w || h !== s.h || cv.width !== Math.round(w * dpr)) { s.w = w; s.h = h; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const loop = (now) => {
      if (!s.live) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)) * (TLI.timeScale || 1); last = now;
      s.fit();
      g.clearRect(0, 0, s.w, s.h);
      if (s.draw) s.draw(g, s.w, s.h, dt);
    };
    s.start = () => { if (s.live) return; s.live = true; last = performance.now(); raf = requestAnimationFrame(loop); };
    s.stop = () => { s.live = false; cancelAnimationFrame(raf); };
    return s;
  }
  const fsz = (w, h) => Math.max(10, Math.min(14, Math.min(w / 62, h / 30)));
  function glow(g, col, a, width, blur, drawPath) {
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.shadowColor = rgba(col, a * 0.9); g.shadowBlur = blur;
    g.strokeStyle = rgba(col, a * 0.35); g.lineWidth = width * 3.2;
    g.beginPath(); drawPath(); g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = rgba(col, a); g.lineWidth = width;
    g.beginPath(); drawPath(); g.stroke();
    g.restore();
  }
  function dot(g, x, y, r, col, a, halo) {
    g.save();
    if (halo) {
      const grd = g.createRadialGradient(x, y, 0, x, y, r * halo);
      grd.addColorStop(0, rgba(col, 0.45 * a)); grd.addColorStop(1, rgba(col, 0));
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r * halo, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = rgba(col, a); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  const niceStep = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
  function trim(v) { return v >= 100 ? String(Math.round(v)) : v >= 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v * 100) / 100); }
  function fmtYears(y) {
    if (y >= 1e9) return trim(y / 1e9) + ' billion years';
    if (y >= 1e6) return trim(y / 1e6) + ' million years';
    if (y >= 1e4) return Math.round(y / 1e3).toLocaleString('en-US') + ',000 years';
    if (y >= 2) return Math.round(y).toLocaleString('en-US') + ' years';
    if (y >= 1) return trim(y) + ' years';
    return Math.max(1, Math.round(y * 12)) + ' months';
  }
  function token() { let id = 0; return { next: () => ++id, ok: (t) => t === id }; }

  /* ---------- 1 · the time zoom ---------- */
  const EVENTS = [
    [13.8e9, 'Big Bang'], [4.54e9, 'Earth forms'], [3.7e9, 'First life'], [2.4e9, 'Oxygen fills the air'],
    [1.6e9, 'Complex cells'], [538e6, 'Cambrian explosion'], [230e6, 'First dinosaurs'], [66e6, 'Asteroid ends the dinosaurs'],
    [6e6, 'Human line splits from chimps'], [3.3e6, 'First stone tools'], [1e6, 'Control of fire'], [300e3, 'Homo sapiens'],
    [51e3, 'Oldest cave paintings'], [12e3, 'Farming'], [5.2e3, 'Writing'], [2.5e3, 'Philosophy and mathematics'],
    [576, 'Printing press'], [339, "Newton's Principia"], [250, 'Steam engine'], [147, 'Electric light'],
    [123, 'First powered flight'], [81, 'First computer'], [57, 'Moon landing'], [35, 'World Wide Web'],
    [19, 'iPhone'], [14, 'Deep learning breakthrough'], [9, 'Transformer'], [4, 'ChatGPT'],
    [2.2, 'Reasoning models'], [1.35, 'AI gold at the Math Olympiad'], [0.5, 'AI settles open math problems'],
  ];
  C.zoom = (() => {
    const s = Surface('cv-zoom');
    if (!s) return null;
    const L0 = Math.log10(1.6e10), L1 = Math.log10(5.2), K = 10, DUR = RM ? 0.3 : 13.5;
    let T = 0, playing = false, done = true, onDone = null;
    const tk = token();
    const logW = (t) => {
      const u = clamp01(t / DUR) * K, k = Math.floor(u), e = k >= K ? 0 : smooth((u - k) / 0.62);
      return L0 - ((L0 - L1) * Math.min(K, k + e)) / K;
    };
    s.draw = (g, w, h, dt) => {
      if (playing) { T += dt; if (T >= DUR) { T = DUR; playing = false; if (!done) { done = true; if (onDone) onDone(); } } }
      const A = accent(), fs = fsz(w, h), W = Math.pow(10, logW(T));
      const xL = w * 0.02, xN = w * 0.86, yA = h * 0.55, span = xN - xL;
      g.textBaseline = 'alphabetic';
      // window label
      g.font = `500 ${fs * 0.9}px ${MONO}`; g.fillStyle = rgba(A, 0.95); g.textAlign = 'left';
      g.fillText('THE LAST ' + fmtYears(W).toUpperCase(), xL, fs * 1.4);
      g.fillStyle = rgba(INK3, 0.9);
      g.fillText('ZOOM  ×' + Math.round(Math.pow(10, L0 - logW(T))).toLocaleString('en-US'), xL, fs * 3.0);
      // axis
      const grd = g.createLinearGradient(0, 0, xN, 0);
      grd.addColorStop(0, rgba(LINE, 0)); grd.addColorStop(0.15, rgba(LINE, 0.35)); grd.addColorStop(1, rgba(A, 0.8));
      g.strokeStyle = grd; g.lineWidth = 1; g.beginPath(); g.moveTo(0, yA); g.lineTo(xN, yA); g.stroke();
      // ruler
      const st = niceStep(W / 5);
      g.font = `400 ${fs * 0.72}px ${MONO}`; g.textAlign = 'center';
      for (let a = st / 5, n = 0; a < W * 1.02 && n < 80; a += st / 5, n++) {
        const x = xN - (a / W) * span; if (x < xL) break;
        const major = Math.abs(a / st - Math.round(a / st)) < 1e-6;
        g.strokeStyle = rgba(LINE, major ? 0.4 : 0.16);
        g.beginPath(); g.moveTo(x, yA - (major ? 7 : 3)); g.lineTo(x, yA + (major ? 7 : 3)); g.stroke();
        if (major && x > xL + 40 && x < xN - 60) { g.fillStyle = rgba(INK3, 0.75); g.fillText(fmtYears(a).replace(' years', '').replace(' year', '') + ' ago', x, yA + fs * 1.9); }
      }
      // events
      EVENTS.forEach(([age, name], i) => {
        const r = age / W;
        if (r > 1.3) return;
        const x = xN - r * span;
        const a = smooth((r - 0.04) / 0.05) * smooth((x + 30) / (w * 0.12));
        if (a < 0.02) return;
        const lvl = [-1, 1, -2, 2][i % 4];
        const above = lvl < 0, yT = yA + lvl * h * 0.15;
        g.strokeStyle = rgba(A, 0.45 * a); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, yA); g.lineTo(x, yT); g.stroke();
        dot(g, x, yA, 3.2, A, a, 5);
        const right = x > w * 0.66;
        g.textAlign = right ? 'right' : 'left';
        const tx = x + (right ? -8 : 8);
        g.font = `400 ${fs * 1.28}px ${SERIF}`; g.fillStyle = rgba(INK, a);
        g.fillText(name, tx, above ? yT + fs * 0.3 : yT + fs * 1.2);
        g.font = `400 ${fs * 0.76}px ${MONO}`; g.fillStyle = rgba(INK3, a);
        g.fillText(fmtYears(age) + ' ago', tx, above ? yT + fs * 1.65 : yT + fs * 2.55);
      });
      // now marker
      const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 300);
      glow(g, A, 0.9, 1.5, 16, () => { g.moveTo(xN, yA - h * 0.36); g.lineTo(xN, yA + h * 0.36); });
      dot(g, xN, yA, 5, A, 1, 6 * pulse);
      g.font = `600 ${fs * 0.95}px ${MONO}`; g.fillStyle = rgba(INK, 1); g.textAlign = 'left';
      g.fillText('NOW', xN + 12, yA - h * 0.32);
    };
    return {
      enter(cb) {
        onDone = cb; T = 0; done = false; playing = false; s.start();
        const t = tk.next();
        setTimeout(() => { if (tk.ok(t) && s.live) playing = true; }, RM ? 50 : 1100);
      },
      exit() { tk.next(); s.stop(); playing = false; },
      finish() { if (!done) { T = DUR - 0.001; playing = true; } },
      done: () => done,
    };
  })();

  /* ---------- 2 · compute, log then linear ---------- */
  const COMPUTE = [
    [2012.75, 4.7e17, 'AlexNet'], [2017.8, 3.4e23, 'AlphaGo Zero'], [2018.8, 2.85e20, 'BERT'],
    [2019.1, 1.5e21, 'GPT-2'], [2020.4, 3.1e23, 'GPT-3'], [2022.3, 2.5e24, 'PaLM'],
    [2023.2, 2e25, 'GPT-4'], [2023.95, 5e25, 'Gemini Ultra'], [2024.55, 3.8e25, 'Llama 3.1 405B'],
    [2026.67, 9.4e26, 'GPT-6 Astra'],
  ];
  const LABEL_POS = { 'AlexNet': [8, -8, 'left'], 'AlphaGo Zero': [-8, -10, 'right'], 'BERT': [8, 14, 'left'], 'GPT-2': [8, 12, 'left'],
    'GPT-3': [-8, -10, 'right'], 'PaLM': [8, 14, 'left'], 'GPT-4': [-8, -12, 'right'], 'Gemini Ultra': [-8, -14, 'right'],
    'Llama 3.1 405B': [8, 16, 'left'], 'GPT-6 Astra': [-10, -12, 'right'] };
  C.compute = (() => {
    const s = Surface('cv-compute');
    if (!s) return null;
    // least-squares fit in log10 space
    const n = COMPUTE.length;
    const mx = COMPUTE.reduce((a, d) => a + d[0], 0) / n, my = COMPUTE.reduce((a, d) => a + Math.log10(d[1]), 0) / n;
    let sxy = 0, sxx = 0;
    for (const d of COMPUTE) { sxy += (d[0] - mx) * (Math.log10(d[1]) - my); sxx += (d[0] - mx) ** 2; }
    const slope = sxy / sxx, icpt = my - slope * mx;
    const growth = Math.pow(10, slope);
    let T = 0, mode = 0, modeT = 0, modeFrom = 0;
    const X0 = 2011.5, X1 = 2027.6, LG0 = 16, LG1 = 28, LIN1 = 1.0e27;
    s.draw = (g, w, h, dt) => {
      T += dt;
      modeT = Math.min(1, modeT + dt / (RM ? 0.3 : 2.4));
      const m = lerp(modeFrom, mode, ease(modeT));
      const A = accent(), fs = fsz(w, h);
      const pl = Math.max(54, w * 0.1), pr = 14, pt = 16, pb = 34;
      const X = (yr) => pl + ((yr - X0) / (X1 - X0)) * (w - pl - pr);
      const yLog = (v) => h - pb - ((Math.log10(v) - LG0) / (LG1 - LG0)) * (h - pt - pb);
      const yLin = (v) => h - pb - (v / LIN1) * (h - pt - pb);
      const Y = (v) => lerp(yLog(Math.max(v, 1e16)), yLin(v), m);
      // grid: log lines collapse and fade, linear lines fade in
      g.lineWidth = 1; g.font = `400 ${fs * 0.78}px ${MONO}`; g.textAlign = 'right'; g.textBaseline = 'middle';
      for (let k = LG0; k <= LG1; k++) {
        const y = Y(Math.pow(10, k)), a = (1 - m) * (k % 2 === 0 ? 0.22 : 0.09);
        if (a < 0.01) continue;
        g.strokeStyle = rgba(LINE, a); g.beginPath(); g.moveTo(pl, y); g.lineTo(w - pr, y); g.stroke();
        if (k % 2 === 0) { g.fillStyle = rgba(INK3, (1 - m) * 0.9); g.fillText('10' + sup(k), pl - 8, y); }
      }
      for (let k = 0; k <= 4; k++) {
        const v = (k / 4) * LIN1, y = yLin(v), a = m * 0.2;
        if (a < 0.01) continue;
        g.strokeStyle = rgba(LINE, a); g.beginPath(); g.moveTo(pl, y); g.lineTo(w - pr, y); g.stroke();
        g.fillStyle = rgba(INK3, m * 0.9);
        g.fillText(k === 0 ? '0' : (k * 2.5).toFixed(1).replace('.0', '') + '×10' + sup(26), pl - 8, y);
      }
      // x axis
      g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = rgba(INK3, 0.85);
      for (let yr = 2012; yr <= 2026; yr += 2) { const x = X(yr); g.fillText(String(yr), x, h - pb + 10); g.strokeStyle = rgba(LINE, 0.12); g.beginPath(); g.moveTo(x, h - pb); g.lineTo(x, h - pb + 5); g.stroke(); }
      g.strokeStyle = rgba(LINE, 0.35); g.beginPath(); g.moveTo(pl, h - pb); g.lineTo(w - pr, h - pb); g.stroke();
      // trend line (straight in log, a wall in linear)
      const drawP = easeOut(T / 1.8);
      const xa = 2012.2, xb = lerp(xa, 2027.2, drawP);
      glow(g, A, 0.75, 1.6, 14, () => {
        for (let i = 0; i <= 160; i++) {
          const yr = lerp(xa, xb, i / 160), v = Math.pow(10, icpt + slope * yr), y = Math.max(pt - 40, Y(v));
          if (i === 0) g.moveTo(X(yr), y); else g.lineTo(X(yr), y);
        }
      });
      // points + labels
      g.textBaseline = 'alphabetic';
      COMPUTE.forEach((d, i) => {
        const a = smooth((T - 0.35 - i * 0.13) / 0.35);
        if (a <= 0) return;
        const x = X(d[0]), y = Y(d[1]);
        const big = d[2] === 'GPT-6 Astra' || d[2] === 'GPT-3';
        dot(g, x, y, big ? 4.5 : 3.4, d[2] === 'GPT-6 Astra' ? INK : A, a, big ? 6 : 4);
        let la = a * (1 - m);
        if (d[2] === 'GPT-6 Astra') la = a;
        if (d[2] === 'GPT-3') la = a;
        if (la < 0.02) return;
        const lp = LABEL_POS[d[2]] || [8, -8, 'left'];
        g.textAlign = lp[2];
        g.font = `${big ? 600 : 400} ${fs * 0.86}px ${MONO}`;
        g.fillStyle = rgba(big ? INK : INK2, la);
        let lx = x + lp[0], ly = y + lp[1];
        if (d[2] === 'GPT-3') { lx = lerp(lx, x + 10, m); ly = lerp(ly, y - 22, m); g.textAlign = m > 0.5 ? 'left' : lp[2]; }
        g.fillText(d[2] + (d[2] === 'GPT-3' && m > 0.5 ? '  ≈ 0' : ''), lx, ly);
      });
      // GPT-3 pointer in linear mode
      if (m > 0.02) {
        const d = COMPUTE[4], x = X(d[0]), y = Y(d[1]);
        g.strokeStyle = rgba(INK2, m * 0.6); g.beginPath(); g.moveTo(x + 2, y - 4); g.lineTo(x + 8, y - 18); g.stroke();
      }
      // the 2-billion-x span marker (log mode only)
      const sa = smooth((T - 1.9) / 0.6) * (1 - m);
      if (sa > 0.01) {
        const xs = w - pr - 6, y1 = Y(COMPUTE[0][1]), y2 = Y(COMPUTE[n - 1][1]);
        g.strokeStyle = rgba(A, sa * 0.8); g.lineWidth = 1;
        g.beginPath(); g.moveTo(xs, y1); g.lineTo(xs, y2); g.moveTo(xs - 5, y1); g.lineTo(xs + 1, y1); g.moveTo(xs - 5, y2); g.lineTo(xs + 1, y2); g.stroke();
        g.save(); g.translate(xs - 10, (y1 + y2) / 2); g.rotate(-Math.PI / 2);
        g.textAlign = 'center'; g.font = `600 ${fs * 0.86}px ${MONO}`; g.fillStyle = rgba(A, sa);
        g.fillText('×2,000,000,000 IN 14 YEARS', 0, 0); g.restore();
      }
      // fitted growth rate
      g.textAlign = 'left'; g.font = `500 ${fs * 0.82}px ${MONO}`;
      g.fillStyle = rgba(INK3, 0.9 * smooth((T - 1.6) / 0.5));
      g.fillText(m < 0.5 ? `FITTED TREND  ×${growth.toFixed(1)} / YEAR` : 'LINEAR SCALE', pl + 4, pt + fs);
    };
    return {
      growth,
      enter() { T = 0; mode = 0; modeFrom = 0; modeT = 1; s.start(); },
      exit() { s.stop(); },
      step(i, instant) {
        const target = i >= 1 ? 1 : 0;
        if (instant) { mode = target; modeFrom = target; modeT = 1; T = 10; return; }
        if (target === mode) return;
        modeFrom = lerp(modeFrom, mode, ease(modeT)); mode = target; modeT = 0;
      },
    };
  })();

  /* ---------- 3 · the buildout ---------- */
  const CAPEX = [
    { name: 'Manhattan Project', meta: '1942–46 · total', v: 35 },
    { name: 'Apollo program', meta: '1960–73 · total', v: 309 },
    { name: 'AI infrastructure', meta: '2026 alone · four companies', v: 720, hot: true },
  ];
  C.capex = (() => {
    const s = Surface('cv-capex');
    if (!s) return null;
    let T = 0;
    s.draw = (g, w, h, dt) => {
      T += dt;
      const A = accent(), fs = fsz(w, h);
      const max = 760, x0 = 4, x1 = w - 12, rowH = Math.min(h / 3.4, 150), top = (h - rowH * 3) / 2;
      const bh = Math.max(16, rowH * 0.3);
      const X = (v) => x0 + (v / max) * (x1 - x0);
      // apollo multiples
      const ma = smooth((T - 3.2) / 0.8);
      if (ma > 0) {
        for (let k = 1; k <= 2; k++) {
          const x = X(309 * k);
          g.setLineDash([3, 5]); g.strokeStyle = rgba(INK2, 0.45 * ma); g.lineWidth = 1;
          g.beginPath(); g.moveTo(x, top + rowH * 0.15); g.lineTo(x, top + rowH * 3 - rowH * 0.1); g.stroke(); g.setLineDash([]);
          g.font = `500 ${fs * 0.74}px ${MONO}`; g.fillStyle = rgba(INK2, 0.8 * ma); g.textAlign = 'center';
          g.fillText(k === 1 ? '1 APOLLO' : '2 APOLLOS', x, top + rowH * 0.1);
        }
      }
      CAPEX.forEach((d, i) => {
        const t0 = 0.3 + i * 0.7, p = easeOut((T - t0) / (d.hot ? 2.2 : 1.2));
        if (p <= 0) return;
        const yb = top + rowH * i + rowH * 0.42;
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.font = `${d.hot ? 500 : 400} ${fs * 1.18}px ${DISP}`; g.fillStyle = rgba(d.hot ? INK : INK2, Math.min(1, p * 2));
        g.fillText(d.name, x0, yb - 12);
        g.font = `400 ${fs * 0.74}px ${MONO}`; g.fillStyle = rgba(INK3, Math.min(1, p * 2));
        g.fillText(d.meta.toUpperCase(), x0, yb + bh + fs * 1.5);
        const xe = X(d.v * p);
        g.save();
        if (d.hot) { g.shadowColor = rgba(A, 0.7); g.shadowBlur = 26; }
        const grd = g.createLinearGradient(x0, 0, xe, 0);
        if (d.hot) { grd.addColorStop(0, rgba(A, 0.35)); grd.addColorStop(1, rgba(A, 1)); }
        else { grd.addColorStop(0, rgba(LINE, 0.12)); grd.addColorStop(1, rgba(LINE, 0.42)); }
        g.fillStyle = grd;
        g.beginPath(); g.roundRect ? g.roundRect(x0, yb, Math.max(2, xe - x0), bh, 3) : g.rect(x0, yb, Math.max(2, xe - x0), bh); g.fill();
        g.restore();
        const val = '$' + Math.round(d.v * p) + 'B';
        g.font = `${d.hot ? 600 : 400} ${fs * (d.hot ? 1.5 : 1.15)}px ${DISP}`;
        const tw = g.measureText(val).width;
        const inside = xe + tw + 14 > x1;
        g.textAlign = inside ? 'right' : 'left';
        g.fillStyle = inside ? 'rgba(3,4,10,0.92)' : rgba(d.hot ? A : INK, 1);
        g.fillText(val, inside ? xe - 10 : xe + 10, yb + bh * 0.5 + fs * 0.5);
      });
    };
    return { enter() { T = 0; s.start(); }, exit() { s.stop(); } };
  })();

  /* ---------- 4 · METR time horizons ---------- */
  const HZ = [
    [2019.12, 2 / 3600, 'GPT-2'], [2022.2, 36 / 3600, 'GPT-3.5'], [2023.2, 5 / 60, 'GPT-4'],
    [2024.37, 9 / 60, 'GPT-4o'], [2024.8, 28 / 60, 'Claude 3.5 Sonnet'], [2024.96, 39 / 60, 'o1'],
    [2025.15, 59 / 60, 'Claude 3.7 Sonnet'], [2025.3, 1.53, 'o3'], [2025.6, 2.28, 'GPT-5'],
    [2025.9, 4.8, 'Claude Opus 4.5'], [2026.1, 12, 'Claude Opus 4.6'], [2026.35, 17, 'Mythos Preview'],
    [2026.67, 40, 'GPT-6 Astra'], [2026.85, 39, 'Claude Opus 5.5'],
  ];
  const HZ_LABEL = { 'GPT-2': [8, -8, 'left'], 'GPT-3.5': [8, -8, 'left'], 'GPT-4': [8, -8, 'left'], 'o1': [-8, -8, 'right'],
    'Claude 3.7 Sonnet': [-8, -10, 'right'], 'GPT-5': [8, 14, 'left'], 'Claude Opus 4.5': [-8, -10, 'right'],
    'GPT-6 Astra': [-10, 4, 'right'], 'Claude Opus 5.5': [10, 16, 'left'] };
  function fit(points) {
    const n = points.length;
    const mx = points.reduce((a, d) => a + d[0], 0) / n, my = points.reduce((a, d) => a + Math.log2(d[1]), 0) / n;
    let sxy = 0, sxx = 0;
    for (const d of points) { sxy += (d[0] - mx) * (Math.log2(d[1]) - my); sxx += (d[0] - mx) ** 2; }
    const slope = sxy / sxx; // doublings per year
    return { slope, icpt: my - slope * mx, months: 12 / slope, at: (yr) => Math.pow(2, my + slope * (yr - mx)), cross: (hours) => mx + (Math.log2(hours) - my) / slope };
  }
  const FIT_ALL = fit(HZ), FIT_RECENT = fit(HZ.filter((d) => d[0] >= 2024));
  function when(yr) {
    const y = Math.floor(yr), f = yr - y;
    return (f < 0.34 ? 'early ' : f < 0.67 ? 'mid-' : 'late ') + y;
  }
  C.horizonProjection = { month: when(FIT_RECENT.cross(167)), year: when(FIT_RECENT.cross(2000)), months: FIT_RECENT.months, monthsAll: FIT_ALL.months };
  C.horizon = (() => {
    const s = Surface('cv-horizon');
    if (!s) return null;
    let T = 0, proj = 0, projT = 1, projFrom = 0;
    const X0 = 2018.8, X1 = 2029.6, L0 = Math.log2(1 / 3600), L1 = Math.log2(5200);
    const LEVELS = [[1 / 3600, '1 sec'], [1 / 60, '1 min'], [1, '1 hour'], [8, '1 workday'], [40, '1 work week'], [167, '1 work month'], [2000, '1 work year']];
    s.draw = (g, w, h, dt) => {
      T += dt;
      projT = Math.min(1, projT + dt / (RM ? 0.3 : 2.2));
      const P = lerp(projFrom, proj, ease(projT));
      const A = accent(), fs = fsz(w, h);
      const pl = Math.max(80, w * 0.15), pr = 12, pt = 14, pb = 30;
      const X = (yr) => pl + ((yr - X0) / (X1 - X0)) * (w - pl - pr);
      const Y = (hr) => h - pb - ((Math.log2(hr) - L0) / (L1 - L0)) * (h - pt - pb);
      g.lineWidth = 1; g.textBaseline = 'middle';
      LEVELS.forEach(([hr, lab]) => {
        const y = Y(hr), big = hr >= 167;
        g.strokeStyle = rgba(big ? A : LINE, big ? 0.22 * (0.3 + P) : 0.14);
        g.setLineDash(big ? [4, 6] : []);
        g.beginPath(); g.moveTo(pl, y); g.lineTo(w - pr, y); g.stroke();
        g.setLineDash([]);
        g.font = `400 ${fs * 0.76}px ${MONO}`; g.textAlign = 'right';
        g.fillStyle = rgba(big ? A : INK3, big ? 0.5 + 0.5 * P : 0.85);
        g.fillText(lab.toUpperCase(), pl - 8, y);
      });
      g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = rgba(INK3, 0.85); g.font = `400 ${fs * 0.76}px ${MONO}`;
      for (let yr = 2019; yr <= 2029; yr += 2) g.fillText(String(yr), X(yr), h - pb + 10);
      g.strokeStyle = rgba(LINE, 0.35); g.beginPath(); g.moveTo(pl, h - pb); g.lineTo(w - pr, h - pb); g.stroke();
      // long-run fit, faint dashed
      const la = smooth((T - 1.2) / 0.8);
      if (la > 0) {
        g.save(); g.setLineDash([2, 6]); g.strokeStyle = rgba(INK2, 0.35 * la); g.lineWidth = 1;
        g.beginPath(); g.moveTo(X(2019), Y(FIT_ALL.at(2019))); g.lineTo(X(2026.9), Y(FIT_ALL.at(2026.9))); g.stroke(); g.restore();
      }
      // recent fit, glowing
      const ra = easeOut((T - 1.6) / 1.2);
      if (ra > 0) {
        const xb = lerp(2024.2, 2026.9, ra);
        glow(g, A, 0.85, 1.8, 14, () => { g.moveTo(X(2024.2), Y(FIT_RECENT.at(2024.2))); g.lineTo(X(xb), Y(FIT_RECENT.at(xb))); });
      }
      // projection cone and line
      if (P > 0.001) {
        const x0 = 2026.9, h0 = FIT_RECENT.at(x0), xe = lerp(x0, 2029.5, P);
        const yAt = (yr, months) => Y(Math.min(5200, h0 * Math.pow(2, ((yr - x0) * 12) / months)));
        g.fillStyle = rgba(A, 0.08 * P);
        g.beginPath(); g.moveTo(X(x0), Y(h0));
        for (let i = 0; i <= 40; i++) { const yr = lerp(x0, xe, i / 40); g.lineTo(X(yr), Math.max(pt, yAt(yr, 2.6))); }
        for (let i = 40; i >= 0; i--) { const yr = lerp(x0, xe, i / 40); g.lineTo(X(yr), Math.max(pt, yAt(yr, 6))); }
        g.closePath(); g.fill();
        g.save(); g.setLineDash([6, 6]);
        glow(g, A, 0.9, 1.6, 12, () => {
          g.moveTo(X(x0), Y(h0));
          for (let i = 1; i <= 40; i++) { const yr = lerp(x0, xe, i / 40); g.lineTo(X(yr), Math.max(pt, Y(FIT_RECENT.at(yr)))); }
        });
        g.restore();
        [[167, 'WORK MONTH'], [2000, 'WORK YEAR']].forEach(([hr, lab], k) => {
          const yr = FIT_RECENT.cross(hr);
          const a = smooth((P - 0.35 - k * 0.3) / 0.25);
          if (a <= 0 || yr > xe + 0.01) return;
          const x = X(yr), y = Y(hr);
          dot(g, x, y, 5, INK, a, 7);
          g.textAlign = 'right'; g.textBaseline = 'alphabetic';
          g.font = `600 ${fs * 0.9}px ${MONO}`; g.fillStyle = rgba(INK, a);
          g.fillText(when(yr).toUpperCase(), x - 12, y - 8);
          g.font = `400 ${fs * 0.72}px ${MONO}`; g.fillStyle = rgba(A, a);
          g.fillText(lab, x - 12, y + fs * 0.9);
        });
      }
      // points
      g.textBaseline = 'alphabetic';
      HZ.forEach((d, i) => {
        const a = smooth((T - 0.3 - i * 0.09) / 0.3);
        if (a <= 0) return;
        const x = X(d[0]), y = Y(d[1]);
        const latest = d[0] > 2026.5;
        dot(g, x, y, latest ? 4.6 : 3.3, latest ? INK : A, a, latest ? 6 : 4);
        const lp = HZ_LABEL[d[2]];
        if (!lp) return;
        g.textAlign = lp[2]; g.font = `${latest ? 600 : 400} ${fs * 0.8}px ${MONO}`;
        g.fillStyle = rgba(latest ? INK : INK2, a * (1 - P * 0.75));
        g.fillText(d[2], x + lp[0], y + lp[1]);
      });
      g.textAlign = 'left'; g.font = `500 ${fs * 0.8}px ${MONO}`;
      g.fillStyle = rgba(INK3, smooth((T - 2) / 0.6));
      g.fillText(`SINCE 2024: DOUBLING EVERY ${FIT_RECENT.months.toFixed(1)} MONTHS`, pl + 6, pt + fs * 0.6);
    };
    return {
      fitRecent: FIT_RECENT, fitAll: FIT_ALL,
      enter() { T = 0; proj = 0; projFrom = 0; projT = 1; s.start(); },
      exit() { s.stop(); },
      step(i, instant) {
        const target = i >= 1 ? 1 : 0;
        if (instant) { proj = projFrom = target; projT = 1; T = 10; return; }
        if (target === proj) return;
        projFrom = lerp(projFrom, proj, ease(projT)); proj = target; projT = 0;
      },
    };
  })();

  /* ---------- 5 · the recursive loop ---------- */
  C.loop = (() => {
    const s = Surface('cv-loop');
    if (!s) return null;
    let T = 0, gen = 0, speed = 0.12, speedT = 0.12, phase = 0, pulses = [];
    const NODES = ['AI systems', 'do AI research', 'better algorithms, chips, data', 'smarter AI systems'];
    const CYCLE = ['', '18 mo', '9 mo', '4.5 mo', '10 wk', '∞'];
    s.draw = (g, w, h, dt) => {
      T += dt;
      speed += (speedT - speed) * (1 - Math.exp(-dt * 2));
      phase += speed * dt * Math.PI * 2;
      const A = accent(), fs = fsz(w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34;
      const ap = easeOut(T / 1.4);
      // ring
      g.strokeStyle = rgba(LINE, 0.18); g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ap); g.stroke();
      // comet trails travel the ring
      const trails = 3 + Math.min(gen, 5);
      for (let k = 0; k < trails; k++) {
        const a0 = phase + (k / trails) * Math.PI * 2;
        const len = Math.min(2.4, 0.35 + speed * 0.5);
        g.save(); g.lineCap = 'round';
        for (let j = 0; j < 14; j++) {
          const t = j / 14, a = a0 - len * t;
          g.strokeStyle = rgba(A, (1 - t) * 0.8 * ap);
          g.lineWidth = 3 * (1 - t) + 0.5;
          g.beginPath(); g.arc(cx, cy, R, a - len / 14, a); g.stroke();
        }
        g.restore();
        dot(g, cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, 3, INK, ap, 6);
      }
      // nodes
      NODES.forEach((lab, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 2;
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        const na = smooth((T - 0.4 - i * 0.2) / 0.4);
        if (na <= 0) return;
        g.fillStyle = 'rgba(3,4,10,0.9)'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
        g.strokeStyle = rgba(A, na); g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.stroke();
        dot(g, x, y, 3.5, A, na);
        g.font = `400 ${fs * 1.12}px ${SERIF}`; g.fillStyle = rgba(INK, na); g.textBaseline = 'middle';
        if (i === 0) { g.textAlign = 'center'; g.fillText(lab, x, y - 24); }
        else if (i === 2) { g.textAlign = 'center'; g.fillText(lab, x, y + 26); }
        else if (i === 1) { g.textAlign = 'left'; wrapText(g, lab, x + 18, y, w - x - 22, fs * 1.3); }
        else { g.textAlign = 'right'; wrapText(g, lab, x - 18, y, x - 22, fs * 1.3); }
      });
      // pulses
      pulses = pulses.filter((p) => p.t < 1.2);
      pulses.forEach((p) => { p.t += dt; const r = R * (0.2 + p.t * 1.1); g.strokeStyle = rgba(A, Math.max(0, 0.6 * (1 - p.t / 1.2))); g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); });
      // center readout
      const ca = smooth((T - 0.8) / 0.5);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `500 ${fs * 0.8}px ${MONO}`; g.fillStyle = rgba(INK3, ca);
      g.fillText(gen === 0 ? 'GENERATION' : gen >= 5 ? 'GENERATION ∞' : 'GENERATION ' + gen, cx, cy - fs * 1.9);
      g.font = `300 ${fs * (gen >= 5 ? 3.4 : 2.6)}px ${DISP}`; g.fillStyle = rgba(gen >= 5 ? A : INK, ca);
      g.fillText(gen === 0 ? '0' : CYCLE[Math.min(5, gen)], cx, cy + fs * 0.4);
      if (gen > 0 && gen < 5) { g.font = `400 ${fs * 0.72}px ${MONO}`; g.fillStyle = rgba(INK3, ca); g.fillText('TO BUILD THE NEXT', cx, cy + fs * 2.4); }
    };
    function wrapText(g, text, x, y, maxW, lh) {
      const words = text.split(' '), lines = [];
      let line = '';
      for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > maxW && line) { lines.push(line); line = wd; } else line = t; }
      lines.push(line);
      lines.forEach((ln, i) => g.fillText(ln, x, y + (i - (lines.length - 1) / 2) * lh));
    }
    return {
      enter() { T = 0; gen = 0; speed = speedT = 0.12; pulses = []; s.start(); },
      exit() { s.stop(); },
      step(i, instant) {
        gen = Math.min(5, i);
        speedT = 0.12 * Math.pow(2, Math.min(gen, 4)) * (gen >= 5 ? 3 : 1);
        if (instant) { speed = speedT; T = 10; } else pulses.push({ t: 0 });
      },
    };
  })();

  /* ---------- 6 · world GDP and the explosive-growth scenario ---------- */
  const GDP = [[1500, 0.43], [1600, 0.58], [1700, 0.65], [1820, 1.21], [1870, 1.93], [1913, 4.7], [1950, 9.3], [1973, 28], [1990, 46], [2003, 72], [2015, 108], [2025, 145]];
  const gdpAt = (yr) => {
    for (let i = 1; i < GDP.length; i++) if (yr <= GDP[i][0]) { const [x0, y0] = GDP[i - 1], [x1, y1] = GDP[i]; const t = (yr - x0) / (x1 - x0); return Math.exp(lerp(Math.log(y0), Math.log(y1), t)); }
    return GDP[GDP.length - 1][1];
  };
  C.gdp = (() => {
    const s = Surface('cv-gdp');
    if (!s) return null;
    let T = 0, proj = 0, projT = 1, projFrom = 0;
    const X0 = 1500, X1 = 2046, YMAX = 620;
    s.draw = (g, w, h, dt) => {
      T += dt;
      projT = Math.min(1, projT + dt / (RM ? 0.3 : 2.4));
      const P = lerp(projFrom, proj, ease(projT));
      const A = accent(), fs = fsz(w, h);
      const pl = Math.max(52, w * 0.09), pr = 12, pt = 14, pb = 30;
      const X = (yr) => pl + ((yr - X0) / (X1 - X0)) * (w - pl - pr);
      const Y = (v) => h - pb - (v / YMAX) * (h - pt - pb);
      g.lineWidth = 1; g.font = `400 ${fs * 0.76}px ${MONO}`; g.textBaseline = 'middle'; g.textAlign = 'right';
      for (let v = 0; v <= 600; v += 150) {
        const y = Y(v);
        g.strokeStyle = rgba(LINE, v === 0 ? 0.35 : 0.12); g.beginPath(); g.moveTo(pl, y); g.lineTo(w - pr, y); g.stroke();
        g.fillStyle = rgba(INK3, 0.85); g.fillText(v === 0 ? '0' : '$' + v + 'T', pl - 8, y);
      }
      g.textAlign = 'center'; g.textBaseline = 'top';
      for (let yr = 1500; yr <= 2000; yr += 100) g.fillText(String(yr), X(yr), h - pb + 10);
      // history
      const hp = easeOut((T - 0.3) / 2.2);
      if (hp > 0) {
        const xe = lerp(1500, 2025, hp);
        g.save();
        const fillG = g.createLinearGradient(0, Y(150), 0, Y(0));
        fillG.addColorStop(0, rgba(A, 0.22)); fillG.addColorStop(1, rgba(A, 0));
        g.fillStyle = fillG; g.beginPath(); g.moveTo(X(1500), Y(0));
        for (let i = 0; i <= 220; i++) { const yr = lerp(1500, xe, i / 220); g.lineTo(X(yr), Y(gdpAt(yr))); }
        g.lineTo(X(xe), Y(0)); g.closePath(); g.fill(); g.restore();
        glow(g, A, 0.95, 1.8, 14, () => { for (let i = 0; i <= 220; i++) { const yr = lerp(1500, xe, i / 220); const y = Y(gdpAt(yr)); if (i === 0) g.moveTo(X(yr), y); else g.lineTo(X(yr), y); } });
        const ann = smooth((T - 2.4) / 0.6);
        if (ann > 0) {
          g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.font = `400 ${fs * 0.74}px ${MONO}`; g.fillStyle = rgba(INK2, ann);
          g.fillText('INDUSTRIAL REVOLUTION', X(1780), Y(gdpAt(1780)) - 22);
          g.strokeStyle = rgba(INK2, 0.4 * ann); g.beginPath(); g.moveTo(X(1780), Y(gdpAt(1780)) - 16); g.lineTo(X(1780), Y(gdpAt(1780)) - 4); g.stroke();
          dot(g, X(2025), Y(145), 4.5, INK, ann, 6);
          g.textAlign = 'right'; g.fillStyle = rgba(INK, ann); g.font = `600 ${fs * 0.8}px ${MONO}`;
          g.fillText('TODAY  ~$145T', X(2025) - 12, Y(145) + 4);
        }
      }
      // projections
      if (P > 0.001) {
        const xe = lerp(2025, 2046, P);
        g.save(); g.setLineDash([3, 6]); g.strokeStyle = rgba(INK2, 0.6); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(X(2025), Y(145)); for (let i = 1; i <= 40; i++) { const yr = lerp(2025, xe, i / 40); g.lineTo(X(yr), Y(145 * Math.pow(1.03, yr - 2025))); } g.stroke(); g.restore();
        const v30 = (yr) => (yr <= 2030 ? 145 * Math.pow(1.03, yr - 2025) : 145 * Math.pow(1.03, 5) * Math.pow(1.3, yr - 2030));
        let exitYr = null;
        glow(g, INK, 0.95, 2, 18, () => {
          g.moveTo(X(2025), Y(145));
          for (let i = 1; i <= 80; i++) { const yr = lerp(2025, xe, i / 80); const v = v30(yr); g.lineTo(X(yr), Math.max(pt - 30, Y(v))); if (v > YMAX && exitYr === null) exitYr = yr; }
        });
        g.textBaseline = 'alphabetic';
        if (P > 0.6) {
          const a = smooth((P - 0.6) / 0.3);
          g.textAlign = 'right'; g.font = `400 ${fs * 0.76}px ${MONO}`; g.fillStyle = rgba(INK2, a);
          g.fillText('3% A YEAR', X(2046), Y(145 * Math.pow(1.03, 21)) - 10);
          if (exitYr) {
            g.font = `600 ${fs * 0.82}px ${MONO}`; g.fillStyle = rgba(INK, a); g.textAlign = 'right';
            g.fillText('30% A YEAR FROM 2030', X(exitYr) - 12, pt + fs * 2.2);
            g.font = `400 ${fs * 0.72}px ${MONO}`; g.fillStyle = rgba(A, a);
            g.fillText('OFF THE CHART BY ' + Math.ceil(exitYr), X(exitYr) - 12, pt + fs * 3.6);
          }
        }
      }
    };
    return {
      enter() { T = 0; proj = 0; projFrom = 0; projT = 1; s.start(); },
      exit() { s.stop(); },
      step(i, instant) {
        const target = i >= 1 ? 1 : 0;
        if (instant) { proj = projFrom = target; projT = 1; T = 10; return; }
        if (target === proj) return;
        projFrom = lerp(projFrom, proj, ease(projT)); proj = target; projT = 0;
      },
    };
  })();
})();
