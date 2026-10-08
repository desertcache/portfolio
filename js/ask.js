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
// step it shows is real work, and the summary still reports the real compute time. A turn with
// more steps (a follow-up, a typo fixed) takes about the same time, so each step is shorter.
const STEP_MS = 620;
const TRACE_MS = 3100;
const WORD_MS = 22;

// Suggested questions per section of the page (answer-bank ids; each chip asks the answer's own
// first phrasing). Shown when the bar opens with no conversation yet, following the section the
// visitor is reading.
/** @type {Record<string, string[]>} */
const SECTION_CHIPS = {
  top: ['start-here', 'who-is-sam', 'can-he-code'],
  featured: ['copilot', 'rollout', 'rag'],
  work: ['api-migration', 'chatbot', 'measurement'],
  build: ['claude-code', 'power-user', 'mcp'],
  lab: ['starship', 'orb', 'this-box'],
  about: ['career-path', 'emt', 'leadership'],
  stack: ['tech-stack', 'ai-quality', 'data'],
  contact: ['contact', 'resume', 'why-hire'],
};

// Phrases that mean "keep going" (for the plain-matching fallback below): they continue the last
// answer through its first follow-up.
const MORE = /^(?:tell me more|more|go on|keep going|continue|elaborate|what else|anything else|and then|say more)\W*$/i;

/** @typedef {{ id: string, chat?: boolean, asks: string[], answer: string, points?: string[], detail?: string[], next?: string[], link: string | null }} Entry */
/** @typedef {{ entries: Entry[], fallback: string, fallbacks?: string[] }} Bank */
/**
 * A turn, as desertcache/ask's js/converse.js returns it: the trace steps, then the answer's parts
 * (one, or two for a two-part question; `lines` set means only those sentences of the answer), or
 * a message (a "Did you mean" line or a fallback), and the chips to offer next.
 * @typedef {{ type: 'pieces', text: string } | { type: 'vector', vector: Float32Array } | { type: 'ranked', rows: { text: string, score: number, best: boolean }[] }} View
 * @typedef {{ title: string, detail?: string, view?: View }} Step
 * @typedef {{ entry: Entry, aside: string | null, lines: string[] | null }} Part
 * @typedef {{ kind: string, steps: Step[], parts: Part[], message: string | null, suggest: Entry[], ms: number }} Turn
 * @typedef {{ turn(q: string): Turn }} Conversation
 */

/** A score as shown: rounded down, so one just under the bar never reads as the bar. @param {number} x */
const score2 = (x) => (Math.floor(x * 100) / 100).toFixed(2);

/**
 * The answer to show, or null to decline: the same rule as desertcache/ask's js/match.js
 * (bestMatch), kept here too so this page works with an ask deploy that predates it.
 * @param {Ranked[]} ranked
 * @param {number} threshold
 * @param {number} chatMin
 * @returns {Ranked | null}
 */
function localBestMatch(ranked, threshold, chatMin) {
  for (const r of ranked) {
    if (r.score < threshold) return null;
    if (!r.entry.chat || r.score >= chatMin) return r;
  }
  return null;
}
/** @typedef {{ entry: Entry, score: number, matched: string, vector: Float32Array }} Ranked */
/**
 * @typedef {{
 *   entries: Entry[], byId: Map<string, Entry>, fallbacks: string[], starters: Entry[], threshold: number, chatMin: number,
 *   bestMatch(ranked: Ranked[], threshold: number, chatMin: number): Ranked | null,
 *   embedder: { dim: number, pieces(t: string): { text: string, known: boolean }[], embed(t: string): Float32Array },
 *   matcher: { size: number, rank(q: string): Ranked[] },
 *   converse: ((opts: object) => Conversation) | null,
 * }} Engine
 */

/**
 * Plain matching in the Turn shape, for an ask deploy whose js/converse.js is missing or fails:
 * what this bar did before the conversation layer, so one renderer serves both.
 * @param {Engine} eng
 * @returns {Conversation}
 */
function legacyConversation(eng) {
  /** @type {Set<string>} */
  const answered = new Set();
  /** @type {Entry | null} */
  let last = null;
  return {
    turn(q) {
      const t0 = performance.now();
      const follow = MORE.test(q) && last?.next?.length ? eng.byId.get(last.next[0]) ?? null : null;
      const ranked = eng.matcher.rank(follow ? follow.asks[0] : q);
      const best = follow ? ranked.find((r) => r.entry.id === follow.id) ?? null : eng.bestMatch(ranked, eng.threshold, eng.chatMin);
      const ms = performance.now() - t0;
      const top = ranked[0];
      const bar = (/** @type {Ranked} */ r) => (r.entry.chat ? eng.chatMin : eng.threshold);
      /** @type {Step[]} */
      const steps = follow && last
        ? [{ title: 'Picked up the thread', detail: `continuing from “${last.asks[0]}”` }, { title: 'Found the next part of the story', detail: `“${follow.asks[0]}”` }]
        : [
          { title: 'Read your question', view: { type: 'pieces', text: q } },
          { title: `Turned it into ${eng.embedder.dim} numbers`, view: { type: 'vector', vector: top.vector } },
          { title: `Compared it with ${eng.matcher.size} phrasings`, detail: `${eng.entries.length} answers · cosine similarity` },
          { title: 'Ranked the closest answers', view: { type: 'ranked', rows: ranked.slice(0, 3).map((r) => ({ text: r.matched, score: r.score, best: r === best })) } },
          best
            ? { title: 'Confident in the best match', detail: `${score2(best.score)} clears the ${bar(best)} bar${best.entry.chat ? ' for small talk' : ''}` }
            : { title: 'Not confident enough to answer', detail: `${score2(top.score)} is under the ${bar(top)} bar, so it won't guess` },
        ];
      const entry = best ? best.entry : null;
      const aside = follow ? "Here's more on that." : entry && answered.has(entry.id) ? 'Like I said a moment ago:' : null;
      if (entry) { answered.add(entry.id); last = entry; }
      const picked = /** @type {Entry[]} */ ((entry?.next ?? []).map((id) => eng.byId.get(id)).filter(Boolean));
      return {
        kind: entry ? (follow ? 'more' : 'answer') : 'none',
        steps,
        parts: entry ? [{ entry, aside, lines: null }] : [],
        message: entry ? null : eng.fallbacks[Math.floor(Math.random() * eng.fallbacks.length)],
        suggest: entry ? (picked.length ? picked : ranked.slice(1, 3).map((r) => r.entry)) : eng.starters,
        ms,
      };
    },
  };
}

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
  // The conversation layer is newer than the rest; if it can't load, the bar matches plainly.
  const converseP = import(/* @vite-ignore */ `${ASK}js/converse.js`).catch((/** @type {unknown} */ err) => {
    console.warn('[site] conversation layer unavailable, using plain matching:', err);
    return null;
  });
  /** @type {any[]} */
  const [{ createEmbedder }, { createMatcher, bestMatch }, config] = await Promise.all(
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
    fallbacks: bank.fallbacks?.length ? bank.fallbacks : [bank.fallback],
    starters: config.STARTERS.map((/** @type {string} */ id) => byId.get(id)).filter(Boolean),
    threshold: config.THRESHOLD,
    chatMin: config.CHAT_MIN ?? 0.6,
    bestMatch: bestMatch ?? localBestMatch,
    embedder,
    matcher: createMatcher(entries, embedder, config.MATCH_OPTIONS),
    converse: (await converseP)?.createConversation ?? null,
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
 * What a trace step shows under its title: the word pieces, the vector, the ranked matches, or a
 * line of text.
 * @param {Step} s
 * @param {Engine} eng
 * @returns {Node}
 */
function stepDetail(s, eng) {
  const v = s.view;
  if (v?.type === 'pieces') {
    const pieces = eng.embedder.pieces(v.text);
    const box = el('div', 'dock-pieces');
    // A "##" piece continues the word before it ("emt" is em + ##t): drawn joined.
    for (const p of pieces.slice(0, 12)) {
      const cont = p.text.startsWith('##');
      box.append(el('code', [p.known ? '' : 'unk', cont ? 'cont' : ''].join(' ').trim(), cont ? p.text.slice(2) : p.text));
    }
    if (pieces.length > 12) box.append(el('span', 'dock-more-pieces', `+${pieces.length - 12}`));
    return pieces.length ? box : el('span', 'dock-detail', 'No words the model knows.');
  }
  if (v?.type === 'vector') return vectorStrip(v.vector);
  if (v?.type === 'ranked') {
    const list = el('ul', 'dock-matches');
    for (const r of v.rows) {
      const li = el('li', r.best ? 'is-best' : '');
      const bar = el('span', 'dock-bar-fill');
      bar.style.setProperty('--w', `${Math.max(0, Math.min(1, r.score)) * 100}%`);
      li.append(el('span', 'dock-m-text', `“${r.text}”`), bar, el('span', 'dock-m-score', score2(r.score)));
      list.append(li);
    }
    return list;
  }
  return el('span', 'dock-detail', s.detail ?? '');
}

/**
 * The answer: its lead, then either prose paragraphs (detail) or a list (points), whichever shape
 * the bank gives it. Most answers are prose; lists are only for content that is a list.
 * @param {string} lead
 * @param {string[]} [points]
 * @param {string[]} [detail]
 * @param {number} [start] the first word's index, so a second answer's words follow the first's
 */
function answerBlock(lead, points = [], detail = [], start = 0) {
  const box = el('div', 'dock-answer-block');
  const p = el('p', 'dock-answer');
  let i = words(p, lead, start);
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
  // It arrives (`.is-in`) once it won't sit on the hero: see "staying clear of the hero".

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
  // Clicking or tapping anywhere off the bar folds the answers away (they come back on focus).
  document.addEventListener('pointerdown', (e) => {
    if (dock.classList.contains('is-open') && e.target instanceof Node && !dock.contains(e.target)) setOpen(false);
  });
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
  // The Lab's Answer Finder card has an "Ask it something" button that hands you the bar.
  document.querySelectorAll('[data-ask-focus]').forEach((b) => b.addEventListener('click', () => input.focus()));
  // "/" jumps to the bar from anywhere, unless you're already typing somewhere.
  window.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (root.classList.contains('has-modal')) return;
    e.preventDefault();
    input.focus();
  });

  // ---------- staying clear of the hero ----------
  // On laptops and phones the bar would land on the hero's buttons and notes at
  // first paint. Until the first-screen text and buttons have scrolled clear of
  // it, the bar waits out of sight (tucked: see-through and click-through, but
  // still reachable by keyboard and screen reader, and focusing it brings it
  // straight back). Once someone has used it, it stays put.
  const hero = document.getElementById('top');
  let used = false;
  /** @type {Element[]} */
  let guarded = [];
  const pickGuarded = () => {
    // Only what starts on the first screen, so later hero content scrolling
    // under the bar can't make it flicker.
    guarded = hero
      ? [...hero.querySelectorAll('.hero-lede, .hero-cta, .hero-note, .proof')]
        .filter((n) => n.getBoundingClientRect().top + window.scrollY < window.innerHeight)
      : [];
  };
  const coversHero = () => {
    if (!hero || window.scrollY > hero.offsetHeight) return false;
    const h = dock.offsetHeight;
    const w = dock.offsetWidth;
    const top = window.innerHeight - (parseFloat(getComputedStyle(dock).bottom) || 16) - h;
    const left = (window.innerWidth - w) / 2;
    return guarded.some((n) => {
      const r = n.getBoundingClientRect();
      return r.bottom > top - 12 && r.top < top + h && r.right > left && r.left < left + w;
    });
  };
  const place = () => {
    const keep = used || dock.classList.contains('is-open') || dock.contains(document.activeElement);
    const tuck = !keep && coversHero();
    if (!dock.classList.contains('is-in')) {
      if (!tuck) dock.classList.add('is-in');
      return;
    }
    dock.classList.toggle('is-tucked', tuck);
  };
  dock.addEventListener('focusin', () => {
    used = true;
    dock.classList.add('is-in');
    dock.classList.remove('is-tucked');
  });
  pickGuarded();
  requestAnimationFrame(place);
  // The hero's lines rise into place over its first second; look again once they have.
  if (document.readyState === 'complete') setTimeout(place, 900);
  else window.addEventListener('load', () => setTimeout(place, 900), { once: true });
  window.addEventListener('resize', () => { pickGuarded(); place(); }, { passive: true });

  // Over the Lab (always a night room) the glass turns dark too.
  const lab = document.getElementById('lab');
  let ticking = false;
  const tone = () => {
    if (!lab) return;
    const r = lab.getBoundingClientRect();
    const d = dock.getBoundingClientRect();
    dock.classList.toggle('on-night', r.top < d.bottom - 20 && r.bottom > d.top + 20);
  };
  const onFrame = () => { ticking = false; tone(); place(); };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onFrame); } }, { passive: true });
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
  /** @type {Conversation | null} the conversation, started with the first question */
  let convo = null;
  /** The conversation layer from desertcache/ask, or plain matching if it isn't there or fails. @param {Engine} eng */
  const startConversation = (eng) => {
    if (eng.converse) {
      try {
        return eng.converse({
          entries: eng.entries, matcher: eng.matcher, embedder: eng.embedder, threshold: eng.threshold, chatMin: eng.chatMin,
          bestMatch: eng.bestMatch, fallbacks: eng.fallbacks, starters: eng.starters, voice: 'third',
        });
      } catch (err) {
        console.warn('[site] conversation layer failed to start, using plain matching:', err);
      }
    }
    return legacyConversation(eng);
  };
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

      // The conversation decides the turn (a plain match, a follow-up, two questions in one, a typo
      // fixed, a "did you mean") and lists the steps it really took.
      convo ??= startConversation(eng);
      /** @type {Turn} */
      let turn;
      try {
        turn = convo.turn(q);
      } catch (err) {
        console.warn('[site] conversation layer failed, using plain matching:', err);
        convo = legacyConversation(eng);
        turn = convo.turn(q);
      }

      // The trace: what the model actually did, paced to be read.
      const trace = /** @type {HTMLDetailsElement} */ (el('details', 'dock-trace'));
      trace.open = true;
      const sum = el('summary', 'dock-trace-sum');
      const sumText = el('span', '', 'Searching…');
      sum.append(el('span', 'dock-spin'), sumText);
      const steps = el('ol', 'dock-steps');
      trace.append(sum, steps);
      bot.append(trace);
      const pace = Math.min(STEP_MS, TRACE_MS / Math.max(1, turn.steps.length));
      for (const s of turn.steps) {
        const li = el('li', 'dock-step is-running');
        li.append(el('span', 'dock-tick'), el('span', 'dock-step-title', s.title));
        steps.append(li);
        scrollDown();
        await wait(pace);
        li.append(stepDetail(s, eng));
        li.classList.replace('is-running', 'is-done');
      }
      await wait(STEP_MS * 0.7);
      trace.open = false;
      trace.classList.add('is-done');
      sumText.textContent = `Searched ${eng.matcher.size} phrasings · ${turn.ms < 1 ? '<1' : turn.ms.toFixed(1)} ms`;

      // The answer: one part, or two for a two-part question; a part can be one sentence of an
      // answer (a follow-up). With no part, the "did you mean" line or a fallback.
      setOrb('SPEAKING');
      let n = 0;
      /** @type {[HTMLElement, string][]} each answer's "read more" link, added once its words are in */
      const links = [];
      for (const part of turn.parts) {
        if (part.aside) bot.append(el('p', 'dock-aside', part.aside));
        const e = part.entry;
        const { box, words: end } = part.lines ? answerBlock(part.lines.join(' '), [], [], n) : answerBlock(e.answer, e.points, e.detail, n);
        box.style.setProperty('--wms', `${WORD_MS}ms`);
        bot.append(box);
        n = end;
        if (e.link) links.push([box, e.link]);
      }
      if (!turn.parts.length && turn.message) {
        const { box, words: end } = answerBlock(turn.message);
        box.style.setProperty('--wms', `${WORD_MS}ms`);
        bot.append(box);
        n = end;
      }
      scrollDown();
      await wait(n * WORD_MS + 250);
      for (const [box, link] of links) box.after(moreLink(link));
      bot.append(chipRow(turn.suggest));
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
