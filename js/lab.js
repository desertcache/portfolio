// @ts-check
import { latestPost, formatPostDate } from './lib.js';

/**
 * The Samantha orb is a separate WebGL app, embedded by iframe. It is only
 * ever loaded once, and never on page load:
 *  - mouse + keyboard visitors: it wakes when the card scrolls near view
 *  - touch, data-saver, or reduced-motion visitors: it waits for a tap
 * Until then a CSS gradient orb stands in for it. The frame shows only once
 * the orb says `orb:ready` (its controlled mode does, see desertcache/samantha-ui
 * useAIState). The frame's `load` event can't be the signal: it also fires
 * for the browser's error page, which used to fade in under the LIVE badge.
 */
export function initOrb() {
  const slot = document.getElementById('orb-slot');
  const src = slot?.dataset.src;
  if (!slot || !src) return;

  /** @type {{ saveData?: boolean } | undefined} */
  const conn = /** @type {any} */ (navigator).connection;
  const auto = matchMedia('(hover: hover) and (pointer: fine)').matches
    && !matchMedia('(prefers-reduced-motion: reduce)').matches
    && !conn?.saveData;

  let mounted = false;
  const mount = () => {
    if (mounted) return;
    mounted = true;
    slot.classList.add('is-loading');
    const frame = document.createElement('iframe');
    frame.src = src;
    frame.title = 'Samantha UI: a live, audio-reactive orb';
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    const origin = new URL(src).origin;
    /** @param {MessageEvent} e */
    const onReady = (e) => {
      if (e.origin !== origin || e.source !== frame.contentWindow || e.data?.type !== 'orb:ready') return;
      window.removeEventListener('message', onReady);
      slot.classList.remove('is-loading');
      slot.classList.add('is-live');
    };
    window.addEventListener('message', onReady);
    slot.appendChild(frame);
  };

  slot.querySelector('.orb-wake')?.addEventListener('click', mount);

  if (auto && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        io.disconnect();
        mount();
      }
    }, { rootMargin: '200px 0px' });
    io.observe(slot);
  }
}

/**
 * Fill the Hill Money Watch card with the newest post from blog/posts.json.
 * The HTML ships with a readable fallback, so any failure here is silent.
 * Text goes in via textContent, never innerHTML: posts.json is written by a
 * separate pipeline and shouldn't be able to inject markup into this page.
 */
export async function initLatestDispatch() {
  const title = document.getElementById('dispatch-title');
  const date = document.getElementById('dispatch-date');
  const card = document.getElementById('dispatch-link');
  if (!title || !date || !card) return;
  try {
    const res = await fetch('blog/posts.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const post = latestPost(await res.json());
    if (!post) return;
    title.textContent = post.title;
    date.textContent = formatPostDate(post.date);
    date.setAttribute('datetime', post.date);
    card.setAttribute('href', `blog/${post.href}`);
  } catch {
    /* offline or malformed JSON: keep the static fallback */
  }
}
