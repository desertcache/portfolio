// @ts-check
import { caseStudyFromHash } from './lib.js';

/**
 * Case studies are real <dialog> elements already in the HTML, so their text
 * is crawlable and readable without JavaScript (CSS shows a targeted dialog
 * inline via :target). This module upgrades them to modals:
 *
 *  - showModal() gives focus trapping, Esc, and an inert page for free
 *  - each open case study gets its own URL (#cs-wfm), so links can be shared
 *  - opening pushes a history entry, so Back (or the phone's back gesture)
 *    closes the modal instead of leaving the site
 *  - prev/next swaps dialogs in place (replaceState, no history pile-up)
 */
export function initCaseStudies() {
  /** @type {Map<string, HTMLDialogElement>} */
  const dialogs = new Map();
  for (const d of document.querySelectorAll('dialog.cs')) {
    if (d instanceof HTMLDialogElement) dialogs.set(d.id.replace(/^cs-/, ''), d);
  }
  if (!dialogs.size || typeof HTMLDialogElement.prototype.showModal !== 'function') return;

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ids = [...dialogs.keys()];

  /** @type {string | null} */
  let current = null;
  let pushed = false;   // true when we added the history entry, so closing can pop it
  let swapping = false; // closing one dialog only to open the next
  /** @type {HTMLElement | null} */
  let returnFocus = null;

  /** @param {string} id */
  const hashFor = (id) => `#cs-${id}`;

  /**
   * @param {string} id
   * @param {'push' | 'replace' | 'none'} history how to reflect it in the URL
   * @param {HTMLElement | null} [trigger] what to hand focus back to on close.
   *   Passed explicitly because Safari doesn't focus links on click, so
   *   document.activeElement can't be trusted to know what was clicked.
   */
  function open(id, history, trigger = null) {
    const next = dialogs.get(id);
    if (!next || current === id) return;
    if (current) {
      swapping = true;
      dialogs.get(current)?.close();
      swapping = false;
    } else {
      returnFocus = trigger;
    }
    current = id;
    next.classList.remove('is-closing');
    next.showModal();
    root.classList.add('has-modal');
    next.querySelector('.cs-sheet')?.scrollTo(0, 0);
    if (history === 'push') {
      window.history.pushState({ cs: id }, '', hashFor(id));
      pushed = true;
    } else if (history === 'replace') {
      window.history.replaceState({ cs: id }, '', hashFor(id));
    }
  }

  /** Animate out, then close. The `close` event below does the bookkeeping. */
  function requestClose() {
    const d = current ? dialogs.get(current) : null;
    if (!d || d.classList.contains('is-closing')) return;
    if (reduced.matches) {
      d.close();
      return;
    }
    d.classList.add('is-closing');
    window.setTimeout(() => d.close(), 200);
  }

  for (const [id, d] of dialogs) {
    // Single cleanup path for every way a dialog can close: button, Esc,
    // backdrop click, Back button, or the browser force-closing it.
    d.addEventListener('close', () => {
      d.classList.remove('is-closing');
      if (swapping || current !== id) return;
      current = null;
      root.classList.remove('has-modal');
      if (location.hash === hashFor(id)) {
        if (pushed) window.history.back();
        else window.history.replaceState(null, '', location.pathname + location.search);
      }
      pushed = false;
      // Arrived by deep link? Hand focus to the matching card instead.
      const target = returnFocus?.isConnected ? returnFocus : document.querySelector(`#card-${id} .card-link`);
      if (target instanceof HTMLElement) target.focus({ preventScroll: returnFocus?.isConnected ?? false });
      returnFocus = null;
    });
    d.addEventListener('cancel', (e) => {
      e.preventDefault(); // play the exit animation instead of vanishing
      requestClose();
    });
    d.addEventListener('click', (e) => {
      if (e.target === d) requestClose(); // the sheet fills the dialog, so this is the backdrop
    });
  }

  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('[data-cs-close]')) {
      e.preventDefault();
      requestClose();
      return;
    }
    const link = e.target.closest('a[data-cs]');
    if (!(link instanceof HTMLElement) || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const id = link.getAttribute('data-cs');
    if (!id || !dialogs.has(id)) return;
    e.preventDefault();
    open(id, current ? 'replace' : 'push', link);
  });

  window.addEventListener('popstate', () => {
    const id = caseStudyFromHash(location.hash, ids);
    if (id) {
      pushed = false;
      open(id, 'none');
    } else if (current) {
      pushed = false;
      dialogs.get(current)?.close();
    }
  });

  const initial = caseStudyFromHash(location.hash, ids);
  if (initial) open(initial, 'none');
}
