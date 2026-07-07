// Scene-scoped input. A game registers handlers through this facade; when the
// scene ends, detachAll() removes every DOM listener in one call so games can
// never leak listeners into the menu or the next game.
const GAME_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar',
]);

export function createInput(screen) {
  const canvas = screen.element;
  const held = new Set();
  let listeners = []; // [target, event, fn, options]

  function on(target, event, fn, options) {
    target.addEventListener(event, fn, options);
    listeners.push([target, event, fn, options]);
  }

  function baseKeyDown(e) {
    if (GAME_KEYS.has(e.key)) e.preventDefault();
    held.add(e.key);
  }
  function baseKeyUp(e) {
    held.delete(e.key);
  }

  const api = {
    // --- polling ---
    held(key) { return held.has(key); },
    // --- keyboard events (e.key names) ---
    onKeyDown(fn) { on(document, 'keydown', fn); },
    onKeyUp(fn) { on(document, 'keyup', fn); },
    // --- mouse (logical coordinates) ---
    onMouseMove(fn) {
      on(canvas, 'mousemove', (e) => {
        const p = screen.toLogical(e.clientX, e.clientY);
        fn(p.x, p.y, e);
      });
    },
    onClick(fn) {
      on(canvas, 'click', (e) => {
        const p = screen.toLogical(e.clientX, e.clientY);
        fn(p.x, p.y, e);
      });
    },
    // --- touch helpers ---
    // Swipe: fires on each committed 20px move, then re-arms from the current
    // point, so one continuous drag can steer repeatedly (Snake, Pac-Man).
    onSwipe(fn) {
      let sx = 0, sy = 0, tracking = false;
      on(canvas, 'touchstart', (e) => {
        e.preventDefault();
        tracking = true;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
      }, { passive: false });
      on(canvas, 'touchmove', (e) => {
        e.preventDefault();
        if (!tracking) return;
        const dx = e.touches[0].clientX - sx;
        const dy = e.touches[0].clientY - sy;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
        const dir = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up');
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        fn(dir);
      }, { passive: false });
      on(canvas, 'touchend', () => { tracking = false; });
    },
    // Tap: touchstart anywhere on the canvas (Flappy flap).
    onTap(fn) {
      on(canvas, 'touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        const p = screen.toLogical(t.clientX, t.clientY);
        fn(p.x, p.y);
      }, { passive: false });
    },
    // Drag: logical x/y for both touchstart and touchmove (Breakout paddle).
    onDrag(fn) {
      const handle = (e) => {
        e.preventDefault();
        const t = e.touches[0];
        const p = screen.toLogical(t.clientX, t.clientY);
        fn(p.x, p.y);
      };
      on(canvas, 'touchstart', handle, { passive: false });
      on(canvas, 'touchmove', handle, { passive: false });
    },
    // Raw multi-touch tracking in logical coords (Asteroids control zones).
    trackTouches() {
      const active = new Map(); // identifier -> {x, y}
      const read = (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          active.set(t.identifier, screen.toLogical(t.clientX, t.clientY));
        }
      };
      on(canvas, 'touchstart', read, { passive: false });
      on(canvas, 'touchmove', read, { passive: false });
      on(canvas, 'touchend', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) active.delete(t.identifier);
      }, { passive: false });
      on(canvas, 'touchcancel', (e) => {
        for (const t of e.changedTouches) active.delete(t.identifier);
      });
      return active;
    },
    attach() {
      on(document, 'keydown', baseKeyDown);
      on(document, 'keyup', baseKeyUp);
    },
    detachAll() {
      for (const [target, event, fn, options] of listeners) {
        target.removeEventListener(event, fn, options);
      }
      listeners = [];
      held.clear();
    },
  };

  return api;
}
