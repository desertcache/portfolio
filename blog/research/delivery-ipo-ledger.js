/* ==========================================================================
   Delivery IPO ledger: the charts on blog/research/delivery-ipo-ledger.html.
   A plain script (no build step, outside js/ so tsc never sees the D3 global),
   loaded with `defer` after the vendored D3. It fetches the daily closes from
   the URL in [data-ledger-src] and draws whichever parts the page has, so the
   link-preview card (scripts/og-delivery-ipo-ledger.html) reuses the
   comparison chart. Text only ever goes in via textContent.
   ========================================================================== */
(function () {
  'use strict';

  const d3 = window.d3;
  const root = document.querySelector('[data-ledger-src]');
  if (!root || !d3) return;

  const OG = document.documentElement.hasAttribute('data-og');
  const DAY = 864e5;
  const YEAR = 365.2425;
  const REGIONS = [['us', 'United States'], ['emea', 'Europe & Middle East'], ['asia', 'Asia']];
  const CCY = { USD: 'US dollars', GBp: 'pence', EUR: 'euros', HKD: 'Hong Kong dollars', INR: 'rupees', AED: 'UAE dirhams' };
  const MINUS = '−';
  const DOT = '·';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const byIdEl = (id) => document.getElementById(id);

  fetch(root.getAttribute('data-ledger-src'), { cache: 'no-cache' })
    .then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(start)
    .catch((err) => {
      console.error('[ledger] data failed to load:', err);
      const status = byIdEl('led-status');
      if (status) status.textContent = 'The price data did not load. Refresh the page to try again; the scoreboard below has every number.';
    });

  function start(DATA) {
    const byId = Object.create(null);
    const toDay = (iso) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY);
    DATA.forEach((s) => {
      let t = 0;
      s.T = s.t.map((d) => (t += d));
      s.C = s.c;
      s.ipoDay = toDay(s.ipoDate);
      s.R = s.C.map((c) => c / s.ipoPrice);
      s.Y = s.T.map((d) => (d - s.ipoDay) / YEAR);
      s.done = s.status !== 'trading' && s.status !== 'pending';
      let hi = 0;
      let lo = 0;
      s.C.forEach((c, i) => {
        if (c > s.C[hi]) hi = i;
        if (c < s.C[lo]) lo = i;
      });
      s.hiI = hi;
      s.loI = lo;
      s.evs = (s.events || []).map(([iso, label]) => ({ iso, day: toDay(iso), label }));
      byId[s.id] = s;
    });

    // ---------- formatting ----------
    const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    const monFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' });
    const fmtDay = (d) => dateFmt.format(new Date(d * DAY));
    const fmtIso = (iso) => fmtDay(toDay(iso));
    const num = (v, max, min) => v.toLocaleString('en-US', { minimumFractionDigits: min == null ? max : min, maximumFractionDigits: max });
    function fmtPrice(s, v) {
      const n = v >= 1 ? num(v, 2) : String(Number(v.toPrecision(3)));
      return s.unit === 'p' ? n + 'p' : s.sym + n;
    }
    function fmtTick(s, v) {
      const n = v >= 100 ? num(v, 0) : v >= 1 ? num(v, 2, 0) : String(Number(v.toPrecision(2)));
      if (s.unit === 'p') return n + 'p';
      return s.ccy === 'AED' ? n : s.sym + n;
    }
    function fmtPct(r) {
      const a = Math.abs(r) * 100;
      const str = a > 99.9 && a < 100 ? a.toFixed(2) : a >= 1000 ? a.toFixed(0) : a.toFixed(1);
      if (Number(str) === 0) return '0.0%';
      return (r >= 0 ? '+' : MINUS) + str + '%';
    }
    const pctTick = (ratio) => (ratio >= 1 ? '+' : MINUS) + Math.round(Math.abs(ratio - 1) * 100) + '%';

    function el(tag, cls, text) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }
    const NS = 'http://www.w3.org/2000/svg';
    function svgEl(tag, attrs) {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    }
    function tagEl(s) {
      const t = el('span', 'led-tag', s.statusText);
      t.dataset.status = s.status;
      return t;
    }
    function store(k, v) {
      if (OG) return;
      try { localStorage.setItem('sb-ledger-' + k, v); } catch (e) { /* storage blocked */ }
    }
    function load(k) {
      try { return localStorage.getItem('sb-ledger-' + k); } catch (e) { return null; }
    }

    // ---------- state ----------
    let sel = 'DASH';
    let mode = 'since';
    let detLog = false;
    let preview = null;
    const hashId = () => (window.location.hash || '').slice(1).toUpperCase();
    const saved = load('sel');
    if (!OG) {
      if (byId[hashId()]) sel = hashId();
      else if (saved && byId[saved]) sel = saved;
      if (load('mode') === 'cal') mode = 'cal';
    }

    // ---------- tooltip ----------
    let TIP = byIdEl('led-tip');
    if (!TIP && !OG) {
      TIP = el('div', 'led-tip');
      TIP.id = 'led-tip';
      TIP.hidden = true;
      document.body.append(TIP);
    }
    function placeTip(ev) {
      if (!TIP) return;
      TIP.hidden = false;
      const pad = 14;
      const w = TIP.offsetWidth;
      const h = TIP.offsetHeight;
      let x = ev.clientX + pad;
      let y = ev.clientY + pad;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
      if (x < 8) x = 8;
      if (y + h > window.innerHeight - 8) y = Math.max(8, ev.clientY - h - pad);
      TIP.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }
    function hideTip() { if (TIP) TIP.hidden = true; }
    window.addEventListener('scroll', hideTip, { passive: true });

    // ---------- picker + legend ----------
    function renderChips() {
      const wrap = byIdEl('led-chips');
      if (!wrap) return;
      wrap.textContent = '';
      for (const [key, label] of REGIONS) {
        const g = el('div', 'led-chipgroup');
        g.setAttribute('role', 'group');
        g.setAttribute('aria-label', label);
        g.append(el('span', 'led-chiplabel', label));
        DATA.filter((s) => s.region === key).forEach((s) => {
          const b = el('button', 'led-chip', s.name);
          b.type = 'button';
          b.dataset.id = s.id;
          b.setAttribute('aria-pressed', String(s.id === sel));
          b.addEventListener('click', () => select(s.id, false));
          g.append(b);
        });
        wrap.append(g);
      }
    }
    function renderLegend() {
      const L = byIdEl('led-legend');
      if (!L) return;
      L.textContent = '';
      const item = (cls, text) => {
        const sp = el('span');
        sp.append(el('i', 'led-key ' + cls), document.createTextNode(text));
        return sp;
      };
      L.append(item('is-sel', byId[sel].name), item('', 'The other 14'), item('is-ipo', 'IPO price'));
    }

    // ---------- comparison chart ----------
    const cmpEl = byIdEl('led-cmp');
    const bisect = d3.bisector((d) => d).center;
    function idxAt(s, v, since) {
      const a = since ? s.Y : s.T;
      const tol = since ? 7 / YEAR : 7;
      if (v < a[0] - tol || v > a[a.length - 1] + tol) return -1;
      return bisect(a, v);
    }
    function drawCompare() {
      if (!cmpEl) return;
      const W = cmpEl.clientWidth;
      if (!W) return;
      const narrow = W < 600;
      const since = mode === 'since';
      const H = OG ? cmpEl.clientHeight || 400 : narrow ? 330 : 440;
      const m = { t: 16, r: narrow ? 76 : 138, b: 30, l: narrow ? 46 : 58 };
      const iw = W - m.l - m.r;
      const ih = H - m.t - m.b;
      const x = since
        ? d3.scaleLinear().domain([0, 9.5]).range([0, iw])
        : d3.scaleUtc().domain([Date.UTC(2014, 2, 1), Date.UTC(2026, 11, 1)]).range([0, iw]);
      const y = d3.scaleLog().domain([0.02, 8]).range([ih, 0]);
      const yv = (r) => y(Math.max(r, 1e-4));
      const xv = (s, i) => (since ? x(s.Y[i]) : x(s.T[i] * DAY));
      preview = null;
      d3.select(cmpEl).selectAll('*').remove();
      const S = byId[sel];
      const svg = d3.select(cmpEl).append('svg')
        .attr('width', W).attr('height', H).attr('viewBox', '0 0 ' + W + ' ' + H)
        .attr('role', 'img')
        .attr('aria-label', "Each stock's daily close as a change from its IPO price, " + (since ? 'aligned by years since listing' : 'by calendar date') + ', log scale. Highlighted: ' + S.name + ', ' + fmtPct(S.stats.ret) + '.');
      svg.append('defs').append('clipPath').attr('id', 'lx-cmp-clip')
        .append('rect').attr('x', 0).attr('y', -2).attr('width', iw).attr('height', ih + 2);
      const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');

      g.append('rect').attr('class', 'lx-under').attr('x', 0).attr('y', y(1)).attr('width', iw).attr('height', ih - y(1));
      const yt = [0.02, 0.1, 0.25, 0.5, 1, 2, 4, 8];
      g.append('g').selectAll('line').data(yt.filter((v) => v !== 1)).join('line')
        .attr('class', 'lx-grid').attr('x1', 0).attr('x2', iw).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
      g.append('g').selectAll('text').data(yt).join('text')
        .attr('class', (d) => (d === 1 ? 'lx-tick lx-tick-ipo' : 'lx-tick'))
        .attr('x', -10).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end')
        .text((d) => (d === 1 ? 'IPO' : pctTick(d)));
      const xt = since ? d3.range(0, 10) : d3.range(2015, 2027, narrow ? 2 : 1).map((yr) => Date.UTC(yr, 0, 1));
      g.append('g').selectAll('line').data(xt).join('line')
        .attr('class', 'lx-grid').attr('x1', (d) => x(d)).attr('x2', (d) => x(d)).attr('y1', 0).attr('y2', ih);
      g.append('g').selectAll('text').data(xt).join('text')
        .attr('class', 'lx-tick').attr('x', (d) => x(d)).attr('y', ih + 20).attr('text-anchor', 'middle')
        .text((d) => (since ? (d === 0 ? 'IPO' : d + 'y') : String(new Date(d).getUTCFullYear())));
      g.append('line').attr('class', 'lx-axis').attr('x1', 0).attr('x2', iw).attr('y1', ih).attr('y2', ih);

      const lines = g.append('g').attr('clip-path', 'url(#lx-cmp-clip)');
      const paths = {};
      DATA.forEach((s) => {
        let d = '';
        for (let i = 0; i < s.C.length; i++) d += (i ? 'L' : 'M') + xv(s, i).toFixed(1) + ',' + yv(s.R[i]).toFixed(1);
        paths[s.id] = d;
      });
      lines.append('g').selectAll('path').data(DATA.filter((s) => s.id !== sel)).join('path')
        .attr('class', 'lx-ctx').attr('d', (s) => paths[s.id]);
      const pv = lines.append('path').attr('class', 'lx-pv').attr('d', '');

      g.append('line').attr('class', 'lx-water').attr('x1', 0).attr('x2', iw).attr('y1', y(1)).attr('y2', y(1));
      g.append('text').attr('class', 'lx-zone lx-halo').attr('x', 8).attr('y', 14).text('▲ ABOVE IPO PRICE');
      g.append('text').attr('class', 'lx-zone lx-halo').attr('x', 8).attr('y', ih - 9).text('▼ BELOW IPO PRICE');

      lines.append('path').attr('class', 'lx-sel').attr('d', paths[sel]);
      const li = S.C.length - 1;
      const ex = xv(S, li);
      const eyRaw = yv(S.R[li]);
      const ey = Math.min(Math.max(eyRaw, 6), ih - 6);
      g.append('circle').attr('class', 'lx-mk').attr('cx', ex).attr('cy', ey).attr('r', 4.5);
      const lab = g.append('text').attr('class', 'lx-end lx-halo').attr('x', ex + 10).attr('y', ey).attr('dy', '0.32em');
      lab.append('tspan').text(S.name + ' ');
      lab.append('tspan').attr('class', 'lx-endv').text(fmtPct(S.stats.ret) + (eyRaw > ih ? ' ↓' : ''));
      if (ex + 10 + lab.node().getComputedTextLength() > iw + m.r - 4) lab.attr('x', ex - 10).attr('text-anchor', 'end');
      if (OG) return;

      const cross = g.append('line').attr('class', 'lx-cross').attr('y1', 0).attr('y2', ih).style('visibility', 'hidden');
      const dot = g.append('circle').attr('class', 'lx-mk lx-mk-pv').attr('r', 4).style('visibility', 'hidden');
      const ov = g.append('rect').attr('class', 'lx-overlay').attr('width', iw).attr('height', ih);
      function onMove(ev) {
        const [px, py] = d3.pointer(ev);
        const xval = x.invert(px);
        const v = since ? xval : xval / DAY;
        const rows = [];
        for (const s of DATA) {
          const i = idxAt(s, v, since);
          if (i < 0) continue;
          rows.push({ s, i, r: s.R[i], py: yv(s.R[i]) });
        }
        let best = null;
        let bd = 18;
        for (const r of rows) {
          const d = Math.abs(r.py - py);
          if (d < bd) { bd = d; best = r; }
        }
        const pid = best ? best.s.id : null;
        if (pid !== preview) {
          preview = pid;
          pv.attr('d', pid && pid !== sel ? paths[pid] : '');
        }
        cross.attr('x1', px).attr('x2', px).style('visibility', 'visible');
        if (best) dot.attr('cx', xv(best.s, best.i)).attr('cy', Math.min(Math.max(best.py, 0), ih)).style('visibility', 'visible');
        else dot.style('visibility', 'hidden');
        tipCompare(ev, xval, rows, since);
      }
      ov.on('pointermove', onMove).on('pointerdown', onMove);
      ov.on('pointerleave', () => {
        preview = null;
        pv.attr('d', '');
        cross.style('visibility', 'hidden');
        dot.style('visibility', 'hidden');
        hideTip();
      });
      ov.on('click', () => { if (preview && preview !== sel) select(preview, false); });
    }
    function tipCompare(ev, xval, rows, since) {
      if (!TIP) return;
      TIP.textContent = '';
      TIP.append(el('div', 'led-tip-h', since ? (xval < 0.02 ? 'IPO day' : xval.toFixed(1) + ' years after listing') : dateFmt.format(new Date(xval))));
      if (!rows.length) {
        TIP.append(el('div', 'led-tip-more', 'None of the 15 was trading here.'));
        placeTip(ev);
        return;
      }
      rows.sort((a, b) => b.r - a.r);
      const compact = window.innerWidth < 600;
      const list = compact ? rows.filter((r) => r.s.id === sel || r.s.id === preview) : rows;
      for (const r of list) {
        const row = el('div', 'led-tip-r' + (r.s.id === sel ? ' is-sel' : '') + (r.s.id === preview && r.s.id !== sel ? ' is-pv' : ''));
        row.append(el('span', 'led-tip-key'), el('span', 'led-tip-v', fmtPct(r.r - 1)), el('span', 'led-tip-n', r.s.name));
        TIP.append(row);
      }
      if (compact) TIP.append(el('div', 'led-tip-more', rows.length + ' of 15 trading at this point'));
      placeTip(ev);
    }

    // ---------- detail chart ----------
    const detEl = byIdEl('led-det');
    function logTicks(y) {
      const [a, b] = y.domain();
      let out = [];
      for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) {
        for (const k of [1, 2, 5]) {
          const v = k * Math.pow(10, e);
          if (v >= a && v <= b) out.push(v);
        }
      }
      if (out.length > 8) out = out.filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9);
      return out;
    }
    function drawDetail() {
      if (!detEl) return;
      const s = byId[sel];
      const W = detEl.clientWidth;
      if (!W) return;
      const narrow = W < 560;
      const H = narrow ? 290 : 380;
      const m = { t: 30, r: 14, b: 30, l: narrow ? 54 : 66 };
      const iw = W - m.l - m.r;
      const ih = H - m.t - m.b;
      const n = s.C.length;
      const t0 = s.T[0];
      const t1 = s.T[n - 1];
      const pad = Math.max(4, (t1 - t0) * 0.012);
      const x = d3.scaleUtc().domain([(t0 - pad) * DAY, (t1 + pad) * DAY]).range([0, iw]);
      const top = Math.max(s.C[s.hiI], s.ipoPrice);
      const bot = Math.min(s.C[s.loI], s.ipoPrice);
      const y = detLog
        ? d3.scaleLog().domain([bot / 1.3, top * 1.25]).range([ih, 0])
        : d3.scaleLinear().domain([0, top * 1.1]).range([ih, 0]).nice(narrow ? 4 : 6);
      d3.select(detEl).selectAll('*').remove();
      const st = s.stats;
      const svg = d3.select(detEl).append('svg')
        .attr('width', W).attr('height', H).attr('viewBox', '0 0 ' + W + ' ' + H)
        .attr('role', 'img')
        .attr('aria-label', s.name + ' daily closes from ' + fmtIso(st.first) + ' to ' + fmtIso(st.lastDate) + '. IPO price ' + fmtPrice(s, s.ipoPrice) + '; ' + (s.done ? 'final' : 'last') + ' close ' + fmtPrice(s, st.last) + ', ' + fmtPct(st.ret) + '.');
      const yI = y(s.ipoPrice);
      const defs = svg.append('defs');
      defs.append('clipPath').attr('id', 'lx-det-u').append('rect').attr('x', 0).attr('y', 0).attr('width', iw).attr('height', Math.max(0, yI));
      defs.append('clipPath').attr('id', 'lx-det-d').append('rect').attr('x', 0).attr('y', yI).attr('width', iw).attr('height', Math.max(0, ih - yI));
      const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');

      const yt = detLog ? logTicks(y) : y.ticks(narrow ? 4 : 6);
      g.append('g').selectAll('line').data(yt).join('line')
        .attr('class', 'lx-grid').attr('x1', 0).attr('x2', iw).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
      g.append('g').selectAll('text').data(yt).join('text')
        .attr('class', 'lx-tick').attr('x', -10).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end')
        .text((d) => fmtTick(s, d));
      const span = (t1 - t0) / YEAR;
      const xt = x.ticks(narrow ? 4 : span > 2.5 ? 8 : 6);
      const xf = span > 2.5 ? d3.utcFormat('%Y') : d3.utcFormat('%b %Y');
      g.append('g').selectAll('text').data(xt).join('text')
        .attr('class', 'lx-tick').attr('x', (d) => x(d)).attr('y', ih + 20).attr('text-anchor', 'middle').text((d) => xf(d));
      g.append('line').attr('class', 'lx-axis').attr('x1', 0).attr('x2', iw).attr('y1', ih).attr('y2', ih);

      const area = d3.area().x((_, i) => x(s.T[i] * DAY)).y0(yI).y1((_, i) => y(s.C[i]));
      g.append('path').attr('class', 'lx-wash-up').attr('clip-path', 'url(#lx-det-u)').attr('d', area(s.C));
      g.append('path').attr('class', 'lx-wash-dn').attr('clip-path', 'url(#lx-det-d)').attr('d', area(s.C));

      s.evs.forEach((e, k) => {
        if (e.day < t0 - pad || e.day > t1 + pad) return;
        const ex = x(e.day * DAY);
        g.append('line').attr('class', 'lx-evline').attr('x1', ex).attr('x2', ex).attr('y1', -4).attr('y2', ih);
        g.append('circle').attr('class', 'lx-evdot').attr('cx', ex).attr('cy', -13).attr('r', 8);
        g.append('text').attr('class', 'lx-evnum').attr('x', ex).attr('y', -13).attr('dy', '0.35em').attr('text-anchor', 'middle').text(k + 1);
      });

      g.append('line').attr('class', 'lx-water').attr('x1', 0).attr('x2', iw).attr('y1', yI).attr('y2', yI);
      g.append('path').attr('class', 'lx-price').attr('d', d3.line().x((_, i) => x(s.T[i] * DAY)).y((_, i) => y(s.C[i]))(s.C));

      // The IPO label sits at the right end of its line (IPO-day pops crowd the
      // left) and is registered first, so the point labels below steer around it.
      const placed = [];
      const ipoLabel = g.append('text').attr('class', 'lx-ipol lx-halo').attr('text-anchor', 'end')
        .attr('x', iw - 6).attr('y', yI < 18 ? yI + 15 : yI - 7)
        .text(s.route === 'SPAC' ? 'SPAC $10' : 'IPO ' + fmtPrice(s, s.ipoPrice));
      placed.push(ipoLabel.node().getBBox());
      function label(i, title, pos) {
        const px = x(s.T[i] * DAY);
        const py = y(s.C[i]);
        g.append('circle').attr('class', 'lx-mk lx-mk-ink').attr('cx', px).attr('cy', py).attr('r', 4.5);
        const right = px < iw * 0.6;
        const t = g.append('text').attr('class', 'lx-lbl lx-halo').attr('text-anchor', right ? 'start' : 'end').attr('x', px + (right ? 9 : -9));
        t.append('tspan').text(title + ' ' + fmtPrice(s, s.C[i]) + ' ');
        t.append('tspan').attr('class', 'lx-lbls').text(monFmt.format(new Date(s.T[i] * DAY)));
        let ty = pos === 'above' ? py - 10 : py + 19;
        if (ty < 12) ty = py + 19;
        if (ty > ih - 6) ty = py - 10;
        t.attr('y', ty);
        for (let k = 0; k < 4; k++) {
          const bb = t.node().getBBox();
          const hit = placed.find((p) => !(bb.x + bb.width < p.x || p.x + p.width < bb.x || bb.y + bb.height < p.y || p.y + p.height < bb.y));
          if (!hit) break;
          ty = pos === 'above' ? hit.y - 5 : hit.y + hit.height + 14;
          ty = Math.min(Math.max(ty, 12), ih - 6);
          t.attr('y', ty);
        }
        placed.push(t.node().getBBox());
      }
      const last = n - 1;
      label(last, s.done ? 'Final' : 'Last', y(s.C[last]) > 60 ? 'above' : 'below');
      if (s.hiI !== last) label(s.hiI, 'Peak', 'above');
      if (s.loI !== last && s.loI !== s.hiI) label(s.loI, 'Low', 'below');

      const cross = g.append('line').attr('class', 'lx-cross').attr('y1', 0).attr('y2', ih).style('visibility', 'hidden');
      const dot = g.append('circle').attr('class', 'lx-mk lx-mk-ink').attr('r', 4).style('visibility', 'hidden');
      const ov = g.append('rect').attr('class', 'lx-overlay').attr('width', iw).attr('height', ih);
      function onMove(ev) {
        const [px] = d3.pointer(ev);
        const d = x.invert(px).getTime() / DAY;
        const i = bisect(s.T, d);
        const cx = x(s.T[i] * DAY);
        const cy = y(s.C[i]);
        cross.attr('x1', cx).attr('x2', cx).style('visibility', 'visible');
        dot.attr('cx', cx).attr('cy', cy).style('visibility', 'visible');
        if (!TIP) return;
        TIP.textContent = '';
        TIP.append(el('div', 'led-tip-h', fmtDay(s.T[i])));
        const k1 = el('div', 'led-tip-kv');
        k1.append(el('span', null, 'Close'), el('b', null, fmtPrice(s, s.C[i])));
        const k2 = el('div', 'led-tip-kv');
        k2.append(el('span', null, 'vs IPO price'), el('b', s.R[i] >= 1 ? 'led-up' : 'led-dn', fmtPct(s.R[i] - 1)));
        TIP.append(k1, k2);
        s.evs.forEach((e, k) => {
          if (Math.abs(e.day - s.T[i]) <= 4) TIP.append(el('div', 'led-tip-ev', (k + 1) + '. ' + e.label));
        });
        placeTip(ev);
      }
      ov.on('pointermove', onMove).on('pointerdown', onMove);
      ov.on('pointerleave', () => {
        cross.style('visibility', 'hidden');
        dot.style('visibility', 'hidden');
        hideTip();
      });
    }

    function renderDetailHead() {
      const s = byId[sel];
      const name = byIdEl('led-dname');
      const meta = byIdEl('led-dmeta');
      const tag = byIdEl('led-dtag');
      if (name) name.textContent = s.name;
      if (meta) meta.textContent = s.ticker + ' ' + DOT + ' ' + s.exchange + (s.ipoExchange ? ' (listed on ' + s.ipoExchange + ')' : '') + ' ' + DOT + ' prices in ' + CCY[s.ccy];
      if (tag) {
        tag.textContent = s.statusText;
        tag.dataset.status = s.status;
      }
    }
    function renderTicket() {
      const T = byIdEl('led-ticket');
      if (!T) return;
      const s = byId[sel];
      const st = s.stats;
      T.textContent = '';
      T.append(
        el('div', 'led-hero-k', (s.done ? 'Final' : 'Last') + ' close vs ' + (s.route === 'SPAC' ? '$10 reference' : 'IPO price')),
        el('div', 'led-hero-v ' + (st.ret >= 0 ? 'led-up' : 'led-dn'), fmtPct(st.ret)),
      );
      const dl = el('dl', 'led-facts');
      const add = (k, v, sub) => {
        const dd = el('dd');
        dd.append(el('span', 'led-fv', v));
        if (sub) dd.append(el('span', 'led-fs', sub));
        dl.append(el('dt', null, k), dd);
      };
      add('Went public', fmtIso(s.ipoDate), (s.route === 'SPAC' ? 'SPAC merger' : 'IPO') + ' on ' + (s.ipoExchange || s.exchange));
      add(s.route === 'SPAC' ? 'Reference price' : 'IPO price', fmtPrice(s, s.ipoPrice), s.route === 'SPAC' ? 'SPAC trust value per share' : null);
      add(st.first === s.ipoDate ? 'Day-one close' : 'First close in data', fmtPrice(s, st.firstClose), fmtPct(st.firstClose / s.ipoPrice - 1) + ' ' + DOT + ' ' + fmtIso(st.first));
      add('Peak close', fmtPrice(s, st.hi), fmtPct(st.hiRet) + ' ' + DOT + ' ' + fmtIso(st.hiDate));
      add('Lowest close', fmtPrice(s, st.lo), fmtPct(st.lo / s.ipoPrice - 1) + ' ' + DOT + ' ' + fmtIso(st.loDate));
      add(s.done ? 'Final close' : 'Last close', fmtPrice(s, st.last), fmtIso(st.lastDate));
      add('Worst drawdown', fmtPct(st.mdd), 'peak to trough');
      const share = st.daysAbove === 0 ? '0%' : st.fracAbove < 0.01 ? '<1%' : Math.round(st.fracAbove * 100) + '%';
      add('Closed at or above IPO', share + ' of days', st.daysAbove.toLocaleString('en-US') + ' of ' + st.n.toLocaleString('en-US') + ' trading days');
      T.append(dl);
      if (s.exit) T.append(el('p', 'led-exit', s.exit));
      if (s.note) T.append(el('p', 'led-note', s.note));
      if (s.evs.length) {
        T.append(el('p', 'led-evh', 'Marked on the chart'));
        const ol = el('ol', 'led-evlist');
        s.evs.forEach((e, k) => {
          const li = el('li');
          li.append(el('span', 'led-evn', String(k + 1)), el('span', 'led-evd', fmtIso(e.iso)), el('span', null, e.label));
          ol.append(li);
        });
        T.append(ol);
      }
    }

    // ---------- small multiples ----------
    function miniSvg(s) {
      const W = 240;
      const H = 64;
      const n = s.C.length;
      const t0 = s.T[0];
      const t1 = s.T[n - 1];
      const top = Math.max(s.C[s.hiI], s.ipoPrice) * 1.06;
      const X = (d) => 1 + (d - t0) / Math.max(1, t1 - t0) * (W - 2);
      const Y = (v) => H - 1 - v / top * (H - 3);
      let line = '';
      for (let i = 0; i < n; i++) line += (i ? 'L' : 'M') + X(s.T[i]).toFixed(1) + ',' + Y(s.C[i]).toFixed(1);
      const yI = Y(s.ipoPrice).toFixed(1);
      const area = line + 'L' + X(t1).toFixed(1) + ',' + yI + 'L' + X(t0).toFixed(1) + ',' + yI + 'Z';
      const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', 'aria-hidden': 'true', class: 'led-mini-svg' });
      const id = 'lx-m-' + s.id;
      const defs = svgEl('defs', {});
      const cu = svgEl('clipPath', { id: id + '-u' });
      cu.append(svgEl('rect', { x: 0, y: 0, width: W, height: yI }));
      const cd = svgEl('clipPath', { id: id + '-d' });
      cd.append(svgEl('rect', { x: 0, y: yI, width: W, height: H - yI }));
      defs.append(cu, cd);
      svg.append(
        defs,
        svgEl('path', { d: area, class: 'lx-wash-up', 'clip-path': 'url(#' + id + '-u)' }),
        svgEl('path', { d: area, class: 'lx-wash-dn', 'clip-path': 'url(#' + id + '-d)' }),
        svgEl('line', { x1: 0, x2: W, y1: yI, y2: yI, class: 'led-mini-ipo' }),
        svgEl('path', { d: line, class: 'led-mini-line' }),
      );
      return svg;
    }
    function renderGrid() {
      const G = byIdEl('led-grid');
      if (!G) return;
      G.textContent = '';
      DATA.forEach((s) => {
        const st = s.stats;
        const b = el('button', 'led-mini');
        b.type = 'button';
        b.dataset.id = s.id;
        b.setAttribute('aria-pressed', String(s.id === sel));
        b.setAttribute('aria-label', s.name + ': IPO ' + fmtIso(s.ipoDate) + ' at ' + fmtPrice(s, s.ipoPrice) + '; ' + (s.done ? 'final' : 'last') + ' close ' + fmtPrice(s, st.last) + ' on ' + fmtIso(st.lastDate) + ', ' + fmtPct(st.ret) + ' against the IPO price. Show its chart.');
        const top = el('span', 'led-mini-top');
        top.append(el('span', 'led-mini-name', s.name), tagEl(s));
        const r1 = el('span', 'led-mini-row r1');
        r1.append(el('span', null, (s.route === 'SPAC' ? 'SPAC ' : 'IPO ') + fmtIso(s.ipoDate)), el('span', 'led-mini-v', fmtPrice(s, s.ipoPrice)));
        const r2 = el('span', 'led-mini-row r2');
        r2.append(el('span', null, (s.done ? 'Final ' : 'Last ') + fmtIso(st.lastDate)), el('span', 'led-mini-v', fmtPrice(s, st.last)));
        b.append(top, el('span', 'led-mini-sub', s.ticker + ' ' + DOT + ' ' + s.exchange), miniSvg(s), r1, r2, el('span', 'led-mini-ret ' + (st.ret >= 0 ? 'led-up' : 'led-dn'), fmtPct(st.ret)));
        b.addEventListener('click', () => select(s.id, true));
        G.append(b);
      });
    }

    // ---------- selection ----------
    function select(id, scroll) {
      if (!byId[id]) return;
      sel = id;
      store('sel', id);
      document.querySelectorAll('.led-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
      document.querySelectorAll('.led-mini').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
      document.querySelectorAll('.led-table tr[data-id]').forEach((r) => r.classList.toggle('is-sel', r.dataset.id === id));
      hideTip();
      renderLegend();
      drawCompare();
      renderDetailHead();
      drawDetail();
      renderTicket();
      const target = byIdEl('led-detail');
      if (scroll && target) target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }

    document.querySelectorAll('.led-seg button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
      b.addEventListener('click', () => {
        mode = b.dataset.mode === 'cal' ? 'cal' : 'since';
        store('mode', mode);
        document.querySelectorAll('.led-seg button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
        drawCompare();
      });
    });
    const logBox = byIdEl('led-log');
    if (logBox) logBox.addEventListener('change', () => { detLog = logBox.checked; drawDetail(); });
    window.addEventListener('hashchange', () => { if (byId[hashId()]) select(hashId(), true); });

    const status = byIdEl('led-status');
    if (status) status.remove();
    renderChips();
    renderGrid();
    select(sel, !OG && Boolean(byId[hashId()]));
    root.classList.add('is-ready');

    if (OG || !('ResizeObserver' in window)) return;
    const lastW = new Map();
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      let dirty = false;
      for (const e of entries) {
        const w = Math.round(e.contentRect.width);
        if (lastW.get(e.target) !== w) { lastW.set(e.target, w); dirty = true; }
      }
      if (!dirty) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { drawCompare(); drawDetail(); });
    });
    if (cmpEl) ro.observe(cmpEl);
    if (detEl) ro.observe(detEl);
  }
})();
