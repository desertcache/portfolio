/* THE LAST INVENTION · deck.js
   Navigation, steps, HUD, notes, overview, input, text effects and the boot sequence. */
(() => {
  'use strict';
  const TLI = window.TLI;
  const E = TLI.engine;
  const RM = !!TLI.reducedMotion;
  const ACTS = TLI.ACTS;
  const DEFS = TLI.slideDefs || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const slides = $$('.slide');
  const total = slides.length;

  const DEF = {
    morph: 2.2, spread: 0.6, swirl: 0.5, flow: 0, rot: [0.04, 0], explode: 0, turb: 0.03, bright: 1, size: 0.02, sizeVar: 1,
    pulse: [0, 1], tilt: [0, 0, 0], offset: [0, 0, 0], offsetM: null, wave: [0, 1, 1, [0, 0, 0]], reveal: 1e9, revealRate: 2,
    pal: 'p0', bloom: 0.9, neb: 0.5, exposure: 1.15, fade: 0,
    cam: { dist: 6, yaw: 0, pitch: 0, target: [0, 0, 0], fov: 45, rate: 1.6 },
  };
  const merge = (a, b) => { if (!b) return a; const o = Object.assign({}, a, b); o.cam = Object.assign({}, a.cam, b.cam || {}); return o; };
  const defOf = (i) => DEFS[slides[i].id] || {};

  /* ---------- text effects ---------- */
  function split(el) {
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((ch) => {
        if (ch.nodeType === 3) {
          const frag = document.createDocumentFragment();
          ch.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'w';
            Array.from(part).forEach((c) => {
              const s = document.createElement('span');
              s.className = 'ch'; s.textContent = c; s.style.setProperty('--i', i++);
              w.appendChild(s);
            });
            frag.appendChild(w);
          });
          ch.replaceWith(frag);
        } else if (ch.nodeType === 1) walk(ch);
      });
    };
    walk(el);
    el.setAttribute('aria-label', label);
    Array.from(el.children).forEach((c) => c.setAttribute('aria-hidden', 'true'));
  }
  function countUp(el, delay) {
    const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0);
    const fmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (RM) { el.textContent = fmt(to); return; }
    el.textContent = fmt(0);
    const token = (el._tok = (el._tok || 0) + 1);
    setTimeout(() => {
      const t0 = performance.now(), dur = 1500;
      const tick = (now) => {
        if (el._tok !== token) return;
        const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(to * e);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay || 0);
  }
  function countIn(scope, extraDelay) {
    $$('[data-count]', scope).forEach((el) => {
      const host = el.closest('[data-step]');
      if (host && !host.classList.contains('on')) return;
      const d = el.closest('[style*="--d"]');
      const dd = d ? parseFloat(getComputedStyle(d).getPropertyValue('--d')) || 0 : 0;
      countUp(el, (extraDelay || 0) + dd);
    });
  }

  /* ---------- state ---------- */
  let cur = -1, step = 0, maxSteps = [];
  let slideTimers = [], frameCbs = [], exitCbs = [];
  const leaveTimers = new Map();
  slides.forEach((s, i) => {
    const d = defOf(i);
    const domMax = Math.max(0, ...$$('[data-step]', s).map((e) => +e.dataset.step || 0));
    const defMax = d.steps ? d.steps.length - 1 : 0;
    maxSteps[i] = Math.max(domMax, defMax);
  });
  function sceneFor(i, k) {
    const d = defOf(i);
    let sc = merge(DEF, d.scene || { form: 'field' });
    if (d.steps) for (let j = 1; j <= k && j < d.steps.length; j++) sc = merge(sc, d.steps[j]);
    return sc;
  }
  function stripFx(sc) { const o = Object.assign({}, sc); delete o.kick; delete o.sound; return o; }
  function fireFx(cfg) {
    if (!cfg) return;
    const kicks = Array.isArray(cfg.kick) ? cfg.kick : cfg.kick ? [cfg.kick] : [];
    kicks.forEach((k) => E.kick(k));
    if (cfg.sound && TLI.audio) TLI.audio.sfx(cfg.sound);
  }
  function clearSlideHooks() {
    slideTimers.forEach(clearTimeout); slideTimers = [];
    frameCbs.forEach((cb) => E.offFrame && E.offFrame(cb)); frameCbs = [];
    exitCbs.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } }); exitCbs = [];
  }
  function ctxFor(i, extra) {
    return Object.assign({
      engine: E,
      base: stripFx(sceneFor(i, 0)),
      isCurrent: () => cur === i,
      setStep: (k) => { if (cur === i && k !== step) setStep(k); },
      timer: (fn, ms) => { slideTimers.push(setTimeout(() => { if (cur === i) fn(); }, ms)); },
      frame: (fn) => { frameCbs.push(fn); E.onFrame(fn); },
      onExit: (fn) => exitCbs.push(fn),
    }, extra || {});
  }
  const chartOf = (i) => { const d = defOf(i); return d.chart && TLI.charts ? TLI.charts[d.chart] : null; };

  /* ---------- navigation ---------- */
  function go(i, opt = {}) {
    i = Math.max(0, Math.min(total - 1, i));
    if (i === cur && !opt.force) return;
    const prev = cur;
    if (prev >= 0) {
      const ps = slides[prev], pd = defOf(prev);
      clearSlideHooks();
      if (pd.exit) try { pd.exit(); } catch (e) { console.error(e); }
      const pc = chartOf(prev); if (pc) pc.exit();
      ps.classList.remove('is-active');
      ps.classList.add('is-leaving');
      ps.setAttribute('aria-hidden', 'true');
      clearTimeout(leaveTimers.get(ps));
      leaveTimers.set(ps, setTimeout(() => ps.classList.remove('is-leaving'), 700));
    }
    cur = i;
    const s = slides[i], d = defOf(i);
    step = opt.toEnd ? maxSteps[i] : 0;
    clearTimeout(leaveTimers.get(s));
    s.classList.remove('is-leaving');
    $$('[data-step]', s).forEach((el) => el.classList.toggle('on', +el.dataset.step <= step));
    const sc = sceneFor(i, step);
    const warp = !opt.first && sc.kick && /warp/.test(String(sc.kick));
    s.style.setProperty('--enter', opt.first ? '200ms' : warp ? '950ms' : sc.kick ? '700ms' : '420ms');
    void s.offsetWidth;
    s.classList.add('is-active');
    s.removeAttribute('aria-hidden');

    // act colour
    const act = +s.dataset.act || 0;
    const A = ACTS[act] || ACTS[0];
    document.documentElement.style.setProperty('--accent', A.accent);
    document.documentElement.style.setProperty('--accent2', A.accent2);

    // the universe
    E.setScene(stripFx(sc));
    if (!opt.first) fireFx(sc);
    if (TLI.audio) TLI.audio.setAct(act, i / (total - 1));

    // slide behaviors
    const c = chartOf(i);
    if (c) { c.enter(); if (c.step) c.step(step, true); }
    if (d.enter) try { d.enter(ctxFor(i, { toEnd: !!opt.toEnd, first: !!opt.first })); } catch (e) { console.error(e); }
    if (d.onStep) d.onStep(step, true);
    countIn(s, opt.first ? 300 : 700);

    updateHud();
    try { history.replaceState(null, '', '#' + s.id); } catch (e) { /* sandboxed frames may refuse */ }
  }
  function setStep(k) {
    const back = k < step;
    step = Math.max(0, Math.min(maxSteps[cur], k));
    const s = slides[cur], d = defOf(cur);
    $$('[data-step]', s).forEach((el) => {
      const on = +el.dataset.step <= step;
      const was = el.classList.contains('on');
      el.classList.toggle('on', on);
      if (on && !was) countIn(el, 200);
    });
    const sc = sceneFor(cur, step);
    const stepCfg = d.steps && d.steps[step];
    if (stepCfg && stepCfg.form) E.setScene(stripFx(sc));
    else if (back && d.steps && d.steps[step + 1] && d.steps[step + 1].form) E.setScene(stripFx(sc));
    else E.update(stripFx(sc));
    if (!back) fireFx(stepCfg);
    if (!back && TLI.audio && !(stepCfg && stepCfg.sound)) TLI.audio.sfx('tick');
    const c = chartOf(cur); if (c && c.step) c.step(step, false);
    if (d.onStep) d.onStep(step, false);
    updateHud();
  }
  function next() {
    if (overlayOpen()) return;
    const d = defOf(cur);
    if (d.next && d.next(ctxFor(cur))) return;
    if (step < maxSteps[cur]) setStep(step + 1);
    else if (cur < total - 1) go(cur + 1);
  }
  function prev() {
    if (overlayOpen()) return;
    if (step > 0) setStep(step - 1);
    else if (cur > 0) go(cur - 1, { toEnd: true });
  }

  /* ---------- HUD ---------- */
  const hudAct = $('#hud-act'), hudTitle = $('#hud-title'), countCur = $('#count-cur'), pips = $('#pips');
  $('#count-total').textContent = String(total).padStart(2, '0');
  const tickEls = [];
  (function buildTicks() {
    const nav = $('#ticks');
    let grp = null, lastAct = -1;
    slides.forEach((s, i) => {
      const act = +s.dataset.act || 0;
      if (act !== lastAct) {
        grp = document.createElement('div');
        grp.className = 'tick-act'; grp.dataset.act = act;
        const ta = document.createElement('span');
        ta.className = 'ta'; ta.textContent = ACTS[act].roman; ta.setAttribute('aria-hidden', 'true');
        grp.appendChild(ta);
        nav.appendChild(grp);
        lastAct = act;
      }
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tick';
      b.setAttribute('aria-label', `Slide ${i + 1}: ${s.dataset.title}`);
      b.innerHTML = '<i></i>';
      b.addEventListener('click', (e) => { e.stopPropagation(); go(i); });
      grp.appendChild(b);
      tickEls.push(b);
    });
  })();
  function updateHud() {
    const s = slides[cur], act = +s.dataset.act || 0;
    hudAct.textContent = ACTS[act].name;
    hudTitle.textContent = s.dataset.title || '';
    countCur.textContent = String(cur + 1).padStart(2, '0');
    tickEls.forEach((t, i) => { t.classList.toggle('cur', i === cur); t.classList.toggle('past', i < cur); if (i === cur) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current'); });
    $$('.tick-act').forEach((g) => g.classList.toggle('cur', +g.dataset.act === act));
    const m = maxSteps[cur];
    pips.innerHTML = m ? Array.from({ length: m + 1 }, (_, k) => `<i class="${k <= step ? 'on' : ''}"></i>`).join('') : '';
    if (!notesEl.hidden) fillNotes();
    $$('#ov-grid button').forEach((b) => b.classList.toggle('cur', +b.dataset.i === cur));
  }

  /* ---------- notes, overview, toast, fullscreen, sound ---------- */
  const notesEl = $('#notes'), notesText = $('#notes-text'), ov = $('#overview'), toastEl = $('#toast');
  const btnNotes = $('#btn-notes'), btnOv = $('#btn-overview'), btnSound = $('#btn-sound'), btnFull = $('#btn-full');
  function fillNotes() { const n = $('.notes', slides[cur]); notesText.textContent = n ? n.textContent.trim() : ''; }
  function toggleNotes(force) {
    const show = force != null ? force : notesEl.hidden;
    notesEl.hidden = !show; btnNotes.setAttribute('aria-pressed', String(show));
    if (show) fillNotes();
  }
  (function buildOverview() {
    const grid = $('#ov-grid');
    ACTS.forEach((A, act) => {
      const idx = slides.map((s, i) => [s, i]).filter(([s]) => (+s.dataset.act || 0) === act);
      if (!idx.length) return;
      const col = document.createElement('div');
      col.className = 'ov-act'; col.style.setProperty('--ov-c', A.accent);
      col.innerHTML = `<h3>${act === 0 ? 'Prologue' : A.name.split(' · ')[1]}</h3><span class="label">${act === 0 ? 'Opening' : 'Act ' + A.roman}</span>`;
      idx.forEach(([s, i]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.i = i;
        b.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>`;
        b.appendChild(document.createTextNode(s.dataset.title));
        b.addEventListener('click', (e) => { e.stopPropagation(); toggleOverview(false); go(i); });
        col.appendChild(b);
      });
      grid.appendChild(col);
    });
  })();
  function toggleOverview(force) {
    const show = force != null ? force : ov.hidden;
    ov.hidden = !show; btnOv.setAttribute('aria-pressed', String(show));
    if (show) { const b = $(`#ov-grid button[data-i="${cur}"]`); if (b) b.focus({ preventScroll: true }); }
  }
  const overlayOpen = () => !ov.hidden;
  let toastT = 0;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 1800); }
  function toggleFull() {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    const el = d.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) { toast('Full screen is not available here'); return; }
    try { const p = req.call(el); if (p && p.catch) p.catch(() => toast('Full screen is not available here')); } catch (e) { toast('Full screen is not available here'); }
  }
  function toggleSound() {
    if (!TLI.audio) return;
    const on = TLI.audio.toggle(+slides[cur].dataset.act || 0, cur / (total - 1));
    btnSound.setAttribute('aria-pressed', String(on));
    toast(on ? 'Sound on' : 'Sound off');
  }
  btnNotes.addEventListener('click', (e) => { e.stopPropagation(); toggleNotes(); });
  btnOv.addEventListener('click', (e) => { e.stopPropagation(); toggleOverview(); });
  btnSound.addEventListener('click', (e) => { e.stopPropagation(); toggleSound(); });
  btnFull.addEventListener('click', (e) => { e.stopPropagation(); toggleFull(); });
  ov.addEventListener('click', (e) => { if (e.target === ov) toggleOverview(false); });
  notesEl.addEventListener('click', (e) => e.stopPropagation());

  /* ---------- input ---------- */
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (overlayOpen()) { if (k === 'Escape' || k === 'o' || k === 'O' || k === 'g' || k === 'G') { e.preventDefault(); toggleOverview(false); } return; }
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) {
      if (k === 'Enter' && document.activeElement && document.activeElement.tagName === 'BUTTON') return;
      if (k === ' ' && document.activeElement && document.activeElement.tagName === 'BUTTON') return;
      e.preventDefault(); next();
    } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(total - 1); }
    else if (k === 'f' || k === 'F') toggleFull();
    else if (k === 'm' || k === 'M') toggleSound();
    else if (k === 'n' || k === 'N') toggleNotes();
    else if (k === 'o' || k === 'O' || k === 'g' || k === 'G') toggleOverview();
    else if (k === 'Escape') toggleNotes(false);
  });
  const stage = $('#stage');
  let touchX = null, touchY = null, touchT = 0, swiped = false;
  stage.addEventListener('click', (e) => {
    if (swiped) { swiped = false; return; }
    if (e.target.closest('a, button, input, select, textarea')) return;
    const sel = window.getSelection && String(window.getSelection());
    if (sel) return;
    if (e.clientX < innerWidth * 0.22 && e.pointerType === 'touch') prev(); else next();
  });
  stage.addEventListener('touchstart', (e) => { const t = e.touches[0]; touchX = t.clientX; touchY = t.clientY; touchT = performance.now(); swiped = false; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const t = e.changedTouches[0], dx = t.clientX - touchX, dy = t.clientY - touchY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && performance.now() - touchT < 800) { swiped = true; if (dx < 0) next(); else prev(); }
    touchX = null;
  }, { passive: true });
  let wheelAcc = 0, wheelLock = 0;
  addEventListener('wheel', (e) => {
    if (overlayOpen() || e.target.closest('#notes, #overview')) return;
    const now = performance.now();
    if (now < wheelLock) return;
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) > 90) { if (wheelAcc > 0) next(); else prev(); wheelAcc = 0; wheelLock = now + 900; }
  }, { passive: true });
  addEventListener('hashchange', () => {
    const id = location.hash.slice(1), i = slides.findIndex((s) => s.id === id);
    if (i >= 0 && i !== cur) go(i);
  });
  E.onResize((classChanged) => { if (classChanged && cur >= 0) E.setScene(stripFx(sceneFor(cur, step))); });

  /* ---------- boot ---------- */
  function codeLines() {
    const out = [];
    $$('script:not([src]), style').forEach((n) => {
      (n.textContent || '').split('\n').forEach((ln) => out.push([ln.match(/^\s*/)[0].length, ln.trim().length]));
    });
    return out;
  }
  $$('[data-split]').forEach(split);
  Object.values(DEFS).forEach((d) => { if (d.init) d.init(); });
  TLI.codeLines = codeLines();
  TLI.deck = { go, next, prev, setStep, current: () => cur, step: () => step, total };

  const hashId = location.hash.slice(1);
  const startIdx = Math.max(0, slides.findIndex((s) => s.id === hashId));
  E.start();
  E.setScene(Object.assign({}, DEF, { form: 'singularity', morph: 0.8, spread: 0.2, swirl: 0, rot: [0, 0], flow: 0.4, tilt: [0.34, 0, 0.12], pulse: [0.3, 0.5], bloom: 1.2, pal: 'p0', turb: 0.004, cam: Object.assign({}, DEF.cam, { dist: 5.4 }) }));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fontsReady = (async () => {
    try {
      if (document.fonts) {
        const face = (TLI.FONTS && TLI.FONTS.load) || 'Unbounded';
        await Promise.race([
          Promise.all([document.fonts.load('800 100px ' + face), document.fonts.load('500 100px ' + face), document.fonts.ready]),
          wait(2200),
        ]);
      }
    } catch (e) { /* fall back to system faces */ }
  })();
  Promise.all([fontsReady, wait(startIdx === 0 ? 900 : 100)]).then(() => {
    TLI.formations.clear();
    go(startIdx, { first: true });
  });
})();
