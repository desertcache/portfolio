// @ts-check
/**
 * The homepage loops dozens of CSS animations (the beds of flowers swaying,
 * the hawk soaring). Off screen they still cost style and paint work on every
 * frame: the audit measured a desktop page that never went idle and a
 * throttled phone at 80% busy. Each section pauses its own animations while
 * it's out of view (`.is-offscreen` in site.css) and picks them up where they
 * left off when it scrolls back. The hero map and the critters already pause
 * themselves (topo.js, trails.js).
 *
 * Its own file on purpose: a cached module without a new export would stop
 * every module (see DEV-NOTES).
 */
export function initQuietOffscreen() {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.classList.toggle('is-offscreen', !entry.isIntersecting);
  }, { rootMargin: '160px 0px' });
  document.querySelectorAll('main > section, body > footer').forEach((el) => io.observe(el));
}
