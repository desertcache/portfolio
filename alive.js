/* alive.js — living-paper details for the v4 homepage.
   Plain JS on purpose: NO precompile step (unlike app-v4.jsx — see DEV-NOTES).
   Everything degrades to nothing: reduced-motion and touch visitors get a
   calm, fully working page. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;

  /* ---------- theme ---------- */
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(t, fade) {
    var root = document.documentElement;
    if (fade && !reduced) {
      root.classList.add('theme-fade');
      setTimeout(function () { root.classList.remove('theme-fade'); }, 500);
    }
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('sb-theme', t); } catch (e) {}
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'dark' ? '#161412' : '#f6f3ee');
    var btn = document.getElementById('theme-toggle');
    if (btn) btn.setAttribute('aria-pressed', String(t === 'dark'));
  }
  function wireToggle() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
    btn.addEventListener('click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });
  }

  /* ---------- cursor ember ---------- */
  function initEmber() {
    if (!finePointer || reduced) return;
    var canvas = document.createElement('canvas');
    canvas.id = 'ember-canvas';
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var parts = [];
    var running = false;
    var lastSpawn = 0;
    function size() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    }
    size();
    window.addEventListener('resize', size);
    function accent() {
      return currentTheme() === 'dark' ? [233, 129, 102] : [185, 68, 43];
    }
    window.addEventListener('pointermove', function (e) {
      var now = performance.now();
      if (now - lastSpawn < 12 || parts.length > 48 || document.hidden) return;
      lastSpawn = now;
      parts.push({
        x: e.clientX, y: e.clientY,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -0.25 - Math.random() * 0.35,
        life: 1,
        r: 0.8 + Math.random() * 1.4
      });
      if (!running) { running = true; requestAnimationFrame(tick); }
    });
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var c = accent();
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.life -= 0.028;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.x += p.vx; p.y += p.vy;
        ctx.beginPath();
        ctx.arc(p.x * dpr, p.y * dpr, p.r * p.life * dpr, 0, 6.2832);
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.5 * p.life).toFixed(3) + ')';
        ctx.fill();
      }
      if (parts.length) { requestAnimationFrame(tick); }
      else { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { parts.length = 0; }
    });
  }

  /* ---------- constellation rules ---------- */
  function initStars() {
    var sections = document.querySelectorAll('section.section, section.contact');
    if (!sections.length) return;
    var io = null;
    if (!reduced && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var stars = en.target.querySelectorAll('.rule-star');
          for (var i = 0; i < stars.length; i++) {
            (function (s, d) { setTimeout(function () { s.classList.add('lit'); }, d); })(stars[i], i * 160);
          }
          io.unobserve(en.target);
        });
      }, { threshold: 0.15 });
    }
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      var wrap = document.createElement('div');
      wrap.className = 'rule-stars';
      var n = 3 + Math.floor(Math.random() * 3);
      for (var i = 0; i < n; i++) {
        var star = document.createElement('span');
        star.className = 'rule-star';
        star.style.left = (4 + Math.random() * 92).toFixed(1) + '%';
        wrap.appendChild(star);
      }
      sec.appendChild(wrap);
      if (io) io.observe(sec);
    }
    if (!reduced) scheduleShooting(sections);
  }
  function scheduleShooting(sections) {
    function once() {
      if (!document.hidden) {
        var sec = sections[Math.floor(Math.random() * sections.length)];
        var star = sec.querySelector('.shooting-star');
        if (!star) {
          star = document.createElement('div');
          star.className = 'shooting-star';
          sec.appendChild(star);
        }
        star.style.left = (5 + Math.random() * 35).toFixed(1) + '%';
        star.classList.remove('go');
        void star.offsetWidth; /* restart CSS animation */
        star.classList.add('go');
      }
      setTimeout(once, 45000 + Math.random() * 30000);
    }
    setTimeout(once, 18000 + Math.random() * 20000);
  }

  /* ---------- orb proximity ---------- */
  function initOrbNotice() {
    if (!finePointer || reduced) return;
    var orb = document.querySelector('.hero-orb');
    if (!orb) return;
    var pending = false;
    var mx = 0, my = 0;
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!pending) { pending = true; requestAnimationFrame(update); }
    });
    function update() {
      pending = false;
      var r = orb.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) {
        orb.style.setProperty('--notice', '0');
        return;
      }
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var d = Math.hypot(mx - cx, my - cy);
      var t = Math.max(0, Math.min(1, 1 - (d - r.width / 2) / 240));
      orb.style.setProperty('--notice', t.toFixed(3));
    }
  }

  /* ---------- receipt count-up ---------- */
  function initCountUp() {
    var receipt = document.querySelector('.receipt');
    if (!receipt) return;
    var targets = [];
    var head = document.querySelector('.receipt-headnum .acc');
    if (head) targets.push(head);
    var stats = document.querySelectorAll('.receipt-stat .v .acc');
    for (var i = 0; i < stats.length; i++) targets.push(stats[i]);
    var jobs = [];
    for (var j = 0; j < targets.length; j++) {
      var m = /^(\d+)(.*)$/.exec(targets[j].textContent.trim());
      if (m) jobs.push({ el: targets[j], n: parseInt(m[1], 10), suffix: m[2] || '' });
    }
    if (!jobs.length || reduced || !('IntersectionObserver' in window)) return;
    jobs.forEach(function (jb) { jb.el.textContent = '0' + jb.suffix; });
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      var t0 = performance.now();
      var dur = 1200;
      function step(now) {
        var p = Math.min(1, (now - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        jobs.forEach(function (jb) {
          jb.el.textContent = Math.round(jb.n * e) + jb.suffix;
        });
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }, { threshold: 0.3 });
    io.observe(receipt);
  }

  /* ---------- STREL-7 transit ---------- */
  function initTransit() {
    if (reduced || !window.matchMedia('(min-width: 1100px)').matches) return;
    var rail = document.createElement('div');
    rail.className = 'transit-rail';
    var ship = document.createElement('div');
    ship.className = 'transit-ship';
    ship.innerHTML = '<svg viewBox="0 0 11 14" aria-hidden="true"><path d="M5.5 14 L0 2.8 L5.5 5.4 L11 2.8 Z"/></svg>';
    document.body.appendChild(rail);
    document.body.appendChild(ship);
    var cur = 0, target = 0, running = false;
    function measure() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      target = max > 0 ? (window.scrollY / max) : 0;
      if (!running) { running = true; requestAnimationFrame(tick); }
    }
    function tick() {
      cur += (target - cur) * 0.12;
      var span = window.innerHeight * 0.7;
      ship.style.transform = 'translateY(' + (cur * span).toFixed(1) + 'px)';
      if (Math.abs(target - cur) > 0.0008) { requestAnimationFrame(tick); }
      else { running = false; }
    }
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    measure();
    var lab = document.getElementById('lab');
    if (lab && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          ship.classList.toggle('docked', entries[i].isIntersecting);
        }
      }, { threshold: 0.25 }).observe(lab);
    }
  }

  /* ---------- warp easter egg ---------- */
  function initWarp() {
    var armed = false;
    window.addEventListener('keydown', function (e) {
      if (e.key !== '`' || armed) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      armed = true;
      var toast = document.createElement('div');
      toast.className = 'warp-toast';
      toast.textContent = 'WARP → STREL-7';
      document.body.appendChild(toast);
      requestAnimationFrame(function () { toast.classList.add('show'); });
      setTimeout(function () { window.location.href = 'starship.html'; }, 700);
    });
  }

  /* ---------- boot: wait for React's DOM (≤ ~5s), then wire ---------- */
  var tries = 0;
  (function boot() {
    var ready = document.getElementById('theme-toggle') && document.querySelector('.receipt');
    if (!ready && tries++ < 300) { requestAnimationFrame(boot); return; }
    wireToggle();
    initEmber();
    initStars();
    initOrbNotice();
    initCountUp();
    initTransit();
    initWarp();
  })();
})();
