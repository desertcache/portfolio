// @ts-check
/**
 * Paper gets the finished page. Just before printing, every lazy image starts
 * loading (one that never scrolled into view printed as an empty frame: the
 * card from the Claude Code team, the portrait, the starship), everything that
 * draws itself in on reveal is marked revealed (the work cards' lines and the
 * fleet diagram printed half drawn), and a number still counting up shows its
 * real value. The rest is CSS (@media print in site.css, which also turns
 * transitions off so the revealed state applies at once); the featured diagram
 * draws itself whole (js/flagship.js).
 *
 * Its own file on purpose: a cached main.js that doesn't import it just
 * prints as before (see DEV-NOTES, cache safety).
 */
export function initPrint() {
  window.addEventListener('beforeprint', () => {
    for (const img of document.querySelectorAll('img[loading="lazy"]')) {
      if (img instanceof HTMLImageElement) img.loading = 'eager';
    }
    for (const el of document.querySelectorAll('.reveal')) el.classList.add('in');
    for (const el of document.querySelectorAll('[data-count][data-final]')) {
      if (el instanceof HTMLElement) el.textContent = el.dataset.final ?? el.textContent;
    }
  });
}
