// @ts-check
/**
 * "Ask about my work": the glass bar fixed to the bottom of the page.
 *
 * - The answer finder is desertcache/ask (https://desertcache.github.io/ask/):
 *   a 3.9 MB embedding model that matches a question to answers Sam approved.
 *   Nothing is generated. Its engine modules, bank and model are loaded from
 *   there on first use (focus, hover or tap), so the page stays light until then.
 * - The orb is the real Samantha orb (desertcache/samantha-ui) in controlled
 *   mode: LISTENING at rest, THINKING while the trace runs, SPEAKING while the
 *   answer's words appear. It loads once the page has, except for visitors who
 *   ask their system for reduced motion, who keep the still orb.
 * - The trace under each question is the real matching work, paced so it can
 *   be read; its summary reports the real compute time.
 *
 * The file keeps the name and export of the Lab row it replaced (js/ask.js,
 * initAsk) on purpose: GitHub Pages caches for 10 minutes, and a stale
 * main.js importing a file that no longer exists would break every module.
 */

const ASK = 'https://desertcache.github.io/ask/';
const ORB_ORIGIN = 'https://desertcache.github.io';
const ORB_SRC = `${ORB_ORIGIN}/samantha-ui/?embed=1&control=1`;
const STEP_MS = 300;
const WORD_MS = 16;

/** @typedef {{ id: string, asks: string[], answer: string, link: string | null }} Entry */
/** @typedef {{ entry: Entry, score: number, matched: string, vector: Float32Array }} Ranked */
/**
 * @typedef {{
 *   entries: Entry[], fallback: string, starters: Entry[], threshold: number,
 *   embedder: { dim: number, pieces(t: string): { text: string, known: boolean }[] },
 *   matcher: { size: number, rank(q: string): Ranked[] },
 * }} Engine
 */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** @param {number} ms */
const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

/**
 * @param {string} tag
 * @param {string} [cls]
 * @param {string} [text]
 */
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Load the engine from desertcache/ask once. The module URLs are built at run
 * time, so they are plain dynamic imports with no build step.
 * @param {(text: string) => void} progress
 * @returns {Promise<Engine>}
 */
async function loadEngine(progress) {
  /** @type {any[]} */
  const [{ createEmbedder }, { createMatcher }, config] = await Promise.all(
    ['js/embed.js', 'js/match.js', 'js/config.js'].map((p) => import(/* @vite-ignore */ ASK + p)),
  );
  const [bank, vocab] = await Promise.all([
    fetch(`${ASK}data/bank.json`).then((r) => r.json()),
    fetch(`${ASK}models/vocab.txt`).then((r) => r.text()),
  ]);
  const res = await fetch(`${ASK}models/${config.MODEL}.bin`);
  if (!res.ok || !res.body) throw new Error(`model: ${res.status}`);
  const total = Number(res.headers.get('Content-Length')) || 0;
  const reader = res.body.getReader();
  /** @type {Uint8Array[]} */
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    progress(total ? `Loading the model… ${Math.min(100, Math.round((got / total) * 100))}%` : `Loading the model… ${(got / 1e6).toFixed(1)} MB`);
  }
  const bytes = new Uint8Array(got);
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }

  /** @type {Entry[]} */
  const entries = bank.entries;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const embedder = createEmbedder(bytes.buffer, vocab);
  return {
    entries,
    fallback: bank.fallback,
    starters: config.STARTERS.map((/** @type {string} */ id) => byId.get(id)).filter(Boolean),
    threshold: config.THRESHOLD,
    embedder,
    matcher: createMatcher(entries, embedder, config.MATCH_OPTIONS),
  };
}

/** The query vector as a strip of bars, one per dimension. @param {Float32Array} v */
function vectorStrip(v) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  // Scaled to ~2.5x the RMS, not the max: one large dimension would flatten the rest.
  const rms = Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length) || 1;
  svg.setAttribute('viewBox', `0 0 ${v.length * 2} 24`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'dock-vec');
  svg.setAttribute('aria-hidden', 'true');
  v.forEach((x, i) => {
    const h = Math.max(0.6, Math.min(1, Math.abs(x) / (rms * 2.5)) * 11);
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', String(i * 2));
    r.setAttribute('width', '1.4');
    r.setAttribute('y', String(x >= 0 ? 12 - h : 12));
    r.setAttribute('height', String(h));
    r.setAttribute('class', x >= 0 ? 'pos' : 'neg');
    svg.append(r);
  });
  return svg;
}

/** Answer text word by word (CSS staggers them in), the email as a mailto link. @param {string} text */
function answerText(text) {
  const p = el('p', 'dock-answer');
  let i = 0;
  for (const [k, part] of text.split(/([\w.+-]+@[\w-]+\.[\w.]+)/).entries()) {
    if (k % 2) {
      const a = /** @type {HTMLAnchorElement} */ (el('a', 'w', part));
      a.href = `mailto:${part}`;
      a.style.setProperty('--i', String(i++));
      p.append(a);
      continue;
    }
    for (const word of part.split(/(\s+)/)) {
      if (!word) continue;
      if (/^\s+$/.test(word)) { p.append(word); continue; }
      const s = el('span', 'w', word);
      s.style.setProperty('--i', String(i++));
      p.append(s);
    }
  }
  return { p, words: i };
}

export function initAsk() {
  const dock = document.getElementById('dock');
  const form = /** @type {HTMLFormElement | null} */ (document.getElementById('dock-form'));
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('dock-q'));
  const log = document.getElementById('dock-log');
  const collapse = document.getElementById('dock-collapse');
  const orbSlot = document.getElementById('dock-orb');
  if (!dock || !form || !input || !log || !collapse || !orbSlot) return;
  const root = document.documentElement;

  dock.hidden = false;
  root.classList.add('has-dock');
  requestAnimationFrame(() => dock.classList.add('is-in'));

  // ---------- the orb ----------
  /** @type {HTMLIFrameElement | null} */
  let orb = null;
  /** @param {'LISTENING' | 'THINKING' | 'SPEAKING'} state */
  const setOrb = (state) => {
    dock.dataset.orb = state.toLowerCase();
    orb?.contentWindow?.postMessage({ type: 'orb:state', state }, ORB_ORIGIN);
  };
  const mountOrb = () => {
    if (orb || reduced()) return;
    orb = document.createElement('iframe');
    orb.src = ORB_SRC;
    orb.title = '';
    orb.tabIndex = -1;
    orb.setAttribute('aria-hidden', 'true');
    orbSlot.append(orb);
  };
  window.addEventListener('message', (e) => {
    if (e.origin !== ORB_ORIGIN || !orb || e.source !== orb.contentWindow) return;
    if (e.data?.type === 'orb:ready') {
      orbSlot.classList.add('is-live');
      setOrb(/** @type {any} */ ((dock.dataset.orb || 'listening').toUpperCase()));
    }
  });
  const idle = /** @type {any} */ (window).requestIdleCallback || ((/** @type {() => void} */ f) => setTimeout(f, 200));
  if (document.readyState === 'complete') idle(mountOrb);
  else window.addEventListener('load', () => idle(mountOrb), { once: true });

  // ---------- the engine, loaded on first intent ----------
  /** @type {Promise<Engine> | null} */
  let engine = null;
  /** @type {HTMLElement | null} */
  let loadingLine = null;
  const getEngine = () => {
    if (!engine) {
      engine = loadEngine((text) => { if (loadingLine) loadingLine.textContent = text; });
      engine.catch(() => { engine = null; });
    }
    return engine;
  };
  input.addEventListener('focus', () => { getEngine(); }, { once: true });
  form.addEventListener('pointerenter', () => { getEngine(); }, { once: true });

  // ---------- open / close ----------
  /** @param {boolean} open */
  const setOpen = (open) => {
    dock.classList.toggle('is-open', open);
    collapse.setAttribute('aria-expanded', String(open));
  };
  collapse.addEventListener('click', () => setOpen(false));
  input.addEventListener('focus', () => { if (log.childElementCount) setOpen(true); });
  dock.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dock.classList.contains('is-open')) { setOpen(false); input.focus(); }
  });
  // "/" jumps to the bar from anywhere, unless you're already typing somewhere.
  window.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (root.classList.contains('has-modal')) return;
    e.preventDefault();
    input.focus();
  });

  // Over the Lab (always a night room) the glass turns dark too.
  const lab = document.getElementById('lab');
  let ticking = false;
  const tone = () => {
    ticking = false;
    if (!lab) return;
    const r = lab.getBoundingClientRect();
    const d = dock.getBoundingClientRect();
    dock.classList.toggle('on-night', r.top < d.bottom - 20 && r.bottom > d.top + 20);
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(tone); } }, { passive: true });
  tone();

  // ---------- asking ----------
  const scrollDown = () => log.scrollTo({ top: log.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' });

  /** @param {Entry[]} entries */
  const chipRow = (entries) => {
    const row = el('div', 'dock-chips');
    for (const e of entries) {
      const b = /** @type {HTMLButtonElement} */ (el('button', 'dock-chip', e.asks[0]));
      b.type = 'button';
      b.addEventListener('click', () => ask(e.asks[0]));
      row.append(b);
    }
    return row;
  };

  /** @param {string} link */
  const moreLink = (link) => {
    const external = /^https?:/.test(link);
    const a = /** @type {HTMLAnchorElement} */ (el('a', 'dock-more', external ? 'Open ' : 'Read more '));
    a.href = link;
    if (external) { a.target = '_blank'; a.rel = 'noopener'; }
    // An in-page link: fold the answers away so the section it scrolls to is visible.
    if (link.startsWith('#')) a.addEventListener('click', () => setOpen(false));
    const arrow = el('span', '', external ? '↗' : '→');
    arrow.setAttribute('aria-hidden', 'true');
    a.append(arrow);
    return a;
  };

  let asking = false;
  /** @param {string} raw */
  async function ask(raw) {
    const q = raw.trim();
    if (asking || !q || !log) return;
    asking = true;
    dock?.classList.add('is-busy');
    if (input) input.value = '';
    setOpen(true);

    log.append(el('div', 'dock-msg dock-me', q));
    const bot = el('div', 'dock-msg dock-bot');
    log.append(bot);
    scrollDown();
    setOrb('THINKING');

    try {
      loadingLine = el('p', 'dock-loading', 'Loading the model…');
      bot.append(loadingLine);
      const eng = await getEngine();
      loadingLine.remove();
      loadingLine = null;

      const t0 = performance.now();
      const ranked = eng.matcher.rank(q);
      const ms = performance.now() - t0;
      const top = ranked[0];
      const hit = top.score >= eng.threshold;

      // The trace: what the model actually did, paced to be read.
      const trace = /** @type {HTMLDetailsElement} */ (el('details', 'dock-trace'));
      trace.open = true;
      const sum = el('summary', 'dock-trace-sum');
      const sumText = el('span', '', 'Searching…');
      sum.append(el('span', 'dock-spin'), sumText);
      const steps = el('ol', 'dock-steps');
      trace.append(sum, steps);
      bot.append(trace);
      /** @param {string} title @param {() => Node} detail */
      const step = async (title, detail) => {
        const li = el('li', 'dock-step is-running');
        li.append(el('span', 'dock-tick'), el('span', 'dock-step-title', title));
        steps.append(li);
        scrollDown();
        await wait(STEP_MS);
        li.append(detail());
        li.classList.replace('is-running', 'is-done');
      };

      await step('Read your question', () => {
        const pieces = eng.embedder.pieces(q);
        const box = el('div', 'dock-pieces');
        // A "##" piece continues the word before it ("emt" is em + ##t): drawn joined.
        for (const p of pieces.slice(0, 12)) {
          const cont = p.text.startsWith('##');
          box.append(el('code', [p.known ? '' : 'unk', cont ? 'cont' : ''].join(' ').trim(), cont ? p.text.slice(2) : p.text));
        }
        if (pieces.length > 12) box.append(el('span', 'dock-more-pieces', `+${pieces.length - 12}`));
        return pieces.length ? box : el('span', 'dock-detail', 'No words the model knows.');
      });
      await step(`Turned it into ${eng.embedder.dim} numbers`, () => vectorStrip(top.vector));
      await step(`Compared it with ${eng.matcher.size} phrasings`, () => el('span', 'dock-detail', `${eng.entries.length} answers · cosine similarity`));
      await step(hit ? 'Closest matches' : 'Nothing close enough', () => {
        const list = el('ul', 'dock-matches');
        for (const r of ranked.slice(0, 3)) {
          const li = el('li', r === top && hit ? 'is-best' : '');
          const bar = el('span', 'dock-bar-fill');
          bar.style.setProperty('--w', `${Math.max(0, Math.min(1, r.score)) * 100}%`);
          li.append(el('span', 'dock-m-text', `“${r.matched}”`), bar, el('span', 'dock-m-score', r.score.toFixed(2)));
          list.append(li);
        }
        if (!hit) list.append(el('li', 'dock-m-note', `The best score is under the ${eng.threshold} bar, so it won't guess.`));
        return list;
      });
      await wait(STEP_MS * 0.6);
      trace.open = false;
      trace.classList.add('is-done');
      sumText.textContent = `Searched ${eng.matcher.size} phrasings · ${ms < 1 ? '<1' : ms.toFixed(1)} ms`;

      const entry = hit ? top.entry : null;
      setOrb('SPEAKING');
      const { p, words } = answerText(entry ? entry.answer : eng.fallback);
      p.style.setProperty('--wms', `${WORD_MS}ms`);
      bot.append(p);
      scrollDown();
      await wait(words * WORD_MS + 250);
      if (entry?.link) bot.append(moreLink(entry.link));
      bot.append(chipRow(entry ? ranked.slice(1, 3).map((r) => r.entry) : eng.starters));
      scrollDown();
    } catch (err) {
      console.error('[site] ask failed:', err);
      loadingLine?.remove();
      loadingLine = null;
      const p = el('p', 'dock-answer', 'The model could not load just now. You can reach Sam directly: ');
      const a = /** @type {HTMLAnchorElement} */ (el('a', '', 'batessambates@gmail.com'));
      a.href = 'mailto:batessambates@gmail.com';
      p.append(a);
      bot.append(p);
    } finally {
      setOrb('LISTENING');
      dock?.classList.remove('is-busy');
      asking = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });
}
