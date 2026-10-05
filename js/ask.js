// @ts-check
/**
 * "Ask about my work" is a separate app (desertcache/ask), embedded by iframe
 * like the orb, and like the orb it never loads with the page. Its model is
 * 3.9 MB, so:
 *  - mouse + keyboard visitors: it loads when the card scrolls near view
 *  - touch or data-saver visitors: it waits for a tap
 * Until then a still of the chat's greeting stands in for it.
 *
 * This lives in its own module, not lab.js, on purpose: GitHub Pages caches
 * for 10 minutes, and a stale lab.js missing a new named export would take
 * the whole module graph down. A new file can't be stale.
 */
export function initAsk() {
  const slot = document.getElementById('ask-slot');
  const src = slot?.dataset.src;
  if (!slot || !src) return;

  /** @type {{ saveData?: boolean } | undefined} */
  const conn = /** @type {any} */ (navigator).connection;
  const auto = matchMedia('(hover: hover) and (pointer: fine)').matches && !conn?.saveData;

  let mounted = false;
  const mount = (focus = false) => {
    if (mounted) return;
    mounted = true;
    slot.classList.add('is-loading');
    const frame = document.createElement('iframe');
    frame.src = src;
    frame.title = 'Ask about my work: an on-device answer finder';
    frame.addEventListener('load', () => {
      slot.classList.remove('is-loading');
      slot.classList.add('is-live');
      if (focus) frame.focus();
    });
    slot.appendChild(frame);
  };

  slot.querySelector('.ask-wake')?.addEventListener('click', () => mount(true));

  if (auto && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        io.disconnect();
        mount();
      }
    }, { rootMargin: '300px 0px' });
    io.observe(slot);
  }
}
