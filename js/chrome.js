// @ts-check
/**
 * Page chrome: nav state, scroll-spy, copy-to-clipboard, the toast, and two
 * small easter eggs. Nothing here is required to read the page.
 */

/** @type {number | undefined} */
let toastTimer;

/** @param {string} message */
export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-shown');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-shown'), 2400);
}

/** Frosted nav once you leave the top, plus a read-progress hairline. */
export function initNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  let queued = false;
  const update = () => {
    queued = false;
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 8);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    nav.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : '0');
  };
  window.addEventListener('scroll', () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

/**
 * Highlight the nav link for whichever section crosses the middle of the
 * viewport. Sections without a link borrow their neighbour's.
 */
export function initScrollSpy() {
  const links = /** @type {HTMLAnchorElement[]} */ ([...document.querySelectorAll('.nav-links a[href^="#"]')]);
  if (!links.length || !('IntersectionObserver' in window)) return;
  /** @type {Record<string, string>} */
  const alias = { migration: 'work', stack: 'about' };
  const byId = new Map(links.map((a) => [a.hash.slice(1), a]));

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = entry.target.id;
      const active = byId.get(alias[id] ?? id);
      for (const a of links) {
        if (a === active) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      }
    }
  }, { rootMargin: '-45% 0px -54% 0px' });

  for (const section of document.querySelectorAll('main > section[id]')) io.observe(section);
}

/** Copy the email address, with a toast either way. */
export function initCopyEmail() {
  document.addEventListener('click', async (e) => {
    const btn = e.target instanceof Element ? e.target.closest('.copy-email') : null;
    if (!(btn instanceof HTMLElement)) return;
    const email = btn.dataset.email ?? '';
    try {
      await navigator.clipboard.writeText(email);
      btn.classList.add('is-copied');
      window.setTimeout(() => btn.classList.remove('is-copied'), 2000);
      toast('Email address copied');
    } catch {
      toast(`Copy was blocked. It's ${email}`);
    }
  });
}

/** Easter egg carried over from v4: press ` to warp to the starship. */
export function initWarp() {
  window.addEventListener('keydown', (e) => {
    if (e.key !== '`' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.documentElement.classList.contains('has-modal')) return;
    toast('Warping to STREL-7…');
    window.setTimeout(() => { window.location.href = 'starship.html'; }, 650);
  });
}

/** For the engineers who open DevTools on every portfolio. */
export function greet() {
  console.log(
    '%cHi.%c This page is hand-written HTML, CSS, and a few ES modules: no framework, no build step. View source is the documentation.\nPress ` to warp to the starship.',
    'font: italic 22px Georgia, serif; color: #b9442b;',
    'font: 13px/1.5 ui-monospace, monospace;',
  );
}
