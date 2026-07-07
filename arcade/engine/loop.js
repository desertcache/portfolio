// Fixed-timestep loop. Game logic always ticks at exactly 60 Hz regardless of
// display refresh rate, so per-tick constants (speeds, timers, cooldowns)
// keep their tuning on 120/144 Hz monitors without any delta-time math.
const TICK_MS = 1000 / 60;
const MAX_CATCHUP_TICKS = 5; // cap the debt after a long stall so we never fast-forward

export function createLoop({ tick, render }) {
  let rafId = null;
  let last = 0;
  let acc = 0;
  let running = false;

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (last === 0) last = now; // first frame after start/resume: no debt
    acc += now - last;
    last = now;
    if (acc > TICK_MS * MAX_CATCHUP_TICKS) acc = TICK_MS * MAX_CATCHUP_TICKS;
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      tick();
      if (!running) return; // tick() may stop the loop (game over)
    }
    render();
  }

  function onVisibility() {
    // Drop accumulated time when the tab is hidden so returning doesn't
    // replay a burst of catch-up ticks.
    if (document.hidden) { last = 0; acc = 0; }
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      acc = 0;
      document.addEventListener('visibilitychange', onVisibility);
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      document.removeEventListener('visibilitychange', onVisibility);
    },
    get running() { return running; },
  };
}
