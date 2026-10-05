// @ts-check
/**
 * "Ask about my work": the glass bar fixed to the bottom of the page.
 *
 * - The answer finder is desertcache/ask (https://desertcache.github.io/ask/):
 *   a 3.9 MB embedding model that matches a question to answers Sam approved.
 *   Nothing is generated. Its engine modules, bank and model are loaded from
 *   there on first use (focus, hover or tap), so the page stays light until then.
 * - The orb is the real Samantha orb (desertcache/samantha-ui) in controlled,
 *   transparent mode (no disc behind it): LISTENING at rest, THINKING while the trace runs, SPEAKING while the
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
const ORB_SRC = `${ORB_ORIGIN}/samantha-ui/?embed=1&control=1&transparent=1`;
// The trace takes ~3 s on purpose (Sam: thinking that is too fast doesn't read as thinking); every
// step it shows is real work, and the summary still reports the real compute time.
const STEP_MS = 620;
const WORD_MS = 22;

// Suggested questions per section of the page (answer-bank ids; each chip asks the answer's own
// first phrasing). Shown when the bar opens with no conversation yet, following the section the
// visitor is reading.
/** @type {Record<string, string[]>} */
const SECTION_CHIPS = {
  top: ['who-is-sam', 'copilot', 'can-he-code'],
  featured: ['copilot', 'rollout', 'rag'],
  work: ['api-migration', 'chatbot', 'measurement'],
  build: ['claude-code', 'power-user', 'mcp'],
  lab: ['starship', 'orb', 'this-box'],
  about: ['career-path', 'emt', 'leadership'],
  stack: ['tech-stack', 'ai-quality', 'data'],
  contact: ['contact', 'resume', 'why-hire'],
};

/** @typedef {{ id: string, asks: string[], answer: string, points?: string[], detail?: string[], next?: string[], link: string | null }} Entry */
/** @typedef {{ entries: Entry[], fallback: string }} Bank */
/** @typedef {{ entry: Entry, score: number, matched: string, vector: Float32Array }} Ranked */
/**
 * @typedef {{
 *   entries: Entry[], byId: Map<string, Entry>, fallback: string, starters: Entry[], threshold: number,
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
 * @param {Promise<Bank>} bankP the answer bank, fetched on its own so suggestions don't wait for the model
 * @returns {Promise<Engine>}
 */
async function loadEngine(progress, bankP) {
  /** @type {any[]} */
  const [{ createEmbedder }, { createMatcher }, config] = await Promise.all(
    ['js/embed.js', 'js/match.js', 'js/config.js'].map((p) => import(/* @vite-ignore */ ASK + p)),
  );
  const [bank, vocab] = await Promise.all([
    bankP,
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
    byId,
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

/**
 * The answer: its lead, then either prose paragraphs (detail) or a list (points), whichever shape
 * the bank gives it. Most answers are prose; lists are only for content that is a list.
 * @param {string} lead
 * @param {string[]} [points]
 * @param {string[]} [detail]
 */
function answerBlock(lead, points = [], detail = []) {
  const box = el('div', 'dock-answer-block');
  const p = el('p', 'dock-answer');
  let i = words(p, lead, 0);
  box.append(p);
  for (const para of detail) {
    const more = el('p', 'dock-answer');
    i = words(more, para, i);
    box.append(more);
  }
  if (points.length) {
    const ul = el('ul', 'dock-points');
    for (const pt of points) {
      const li = el('li');
      i = words(li, pt, i);
      ul.append(li);
    }
    box.append(ul);
  }
  return { box, words: i };
}

/**
 * Text as words for the CSS stagger (each word takes the next --i), with any email address as a
 * mailto link. Returns the next free index.
 * @param {HTMLElement} p
 * @param {string} text
 * @param {number} i
 */
function words(p, text, i) {
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
  return i;
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

  // ---------- the bank and the engine, loaded on first intent ----------
  /** @type {Promise<Bank> | null} */
  let bank = null;
  const getBank = () => {
    if (!bank) {
      bank = fetch(`${ASK}data/bank.json`).then((r) => r.json());
      bank.catch(() => { bank = null; });
    }
    return bank;
  };
  /** @type {Promise<Engine> | null} */
  let engine = null;
  /** @type {HTMLElement | null} */
  let loadingLine = null;
  const getEngine = () => {
    if (!engine) {
      engine = loadEngine((text) => { if (loadingLine) loadingLine.textContent = text; }, getBank());
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
  input.addEventListener('focus', () => {
    if (log.childElementCount) setOpen(true);
    else showSuggestions();
  });

  // ---------- suggestions that follow the section being read ----------
  let section = 'top';
  /** @type {HTMLElement | null} */
  let suggest = null;
  const renderSuggestions = async () => {
    if (!suggest) return;
    const b = await getBank().catch(() => null);
    if (!b || !suggest) return;
    const byId = new Map(b.entries.map((e) => [e.id, e]));
    const picks = /** @type {Entry[]} */ ((SECTION_CHIPS[section] ?? SECTION_CHIPS.top).map((id) => byId.get(id)).filter(Boolean));
    suggest.querySelector('.dock-chips')?.remove();
    suggest.append(chipRow(picks));
  };
  // The first open, before any question: a greeting and three questions about this part of the page.
  const showSuggestions = () => {
    if (suggest || log.childElementCount) return;
    suggest = el('div', 'dock-msg dock-bot dock-suggest');
    suggest.append(el('p', 'dock-answer', "Ask me anything about Sam's work, or start with this part of the page:"));
    log.append(suggest);
    setOpen(true);
    renderSuggestions();
  };
  if ('IntersectionObserver' in window) {
    // A section counts as "being read" when it crosses the middle band of the screen.
    const seen = new IntersectionObserver((list) => {
      for (const entry of list) {
        if (!entry.isIntersecting || entry.target.id === section) continue;
        section = entry.target.id;
        // Re-pick only while the suggestions are still the whole conversation.
        if (suggest && log.lastElementChild === suggest) renderSuggestions();
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    for (const id of Object.keys(SECTION_CHIPS)) {
      const s = document.getElementById(id);
      if (s) seen.observe(s);
    }
  }
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
      await step('Ranked the closest answers', () => {
        const list = el('ul', 'dock-matches');
        for (const r of ranked.slice(0, 3)) {
          const li = el('li', r === top && hit ? 'is-best' : '');
          const bar = el('span', 'dock-bar-fill');
          bar.style.setProperty('--w', `${Math.max(0, Math.min(1, r.score)) * 100}%`);
          li.append(el('span', 'dock-m-text', `“${r.matched}”`), bar, el('span', 'dock-m-score', r.score.toFixed(2)));
          list.append(li);
        }
        return list;
      });
      // The confidence check: does the best match clear the threshold?
      await step(hit ? 'Confident in the best match' : 'Not confident enough to answer', () => el('span', 'dock-detail', hit
        ? `${top.score.toFixed(2)} clears the ${eng.threshold} bar`
        : `${top.score.toFixed(2)} is under the ${eng.threshold} bar, so it won't guess`));
      await wait(STEP_MS * 0.7);
      trace.open = false;
      trace.classList.add('is-done');
      sumText.textContent = `Searched ${eng.matcher.size} phrasings · ${ms < 1 ? '<1' : ms.toFixed(1)} ms`;

      const entry = hit ? top.entry : null;
      setOrb('SPEAKING');
      const { box, words: n } = answerBlock(entry ? entry.answer : eng.fallback, entry?.points, entry?.detail);
      box.style.setProperty('--wms', `${WORD_MS}ms`);
      bot.append(box);
      scrollDown();
      await wait(n * WORD_MS + 250);
      if (entry?.link) bot.append(moreLink(entry.link));
      // Follow-ups: the two Sam picked for this answer, else the next-closest matches.
      const picked = /** @type {Entry[]} */ ((entry?.next ?? []).map((id) => eng.byId.get(id)).filter(Boolean));
      bot.append(chipRow(entry ? (picked.length ? picked : ranked.slice(1, 3).map((r) => r.entry)) : eng.starters));
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
