// Shared juice: particles (ported behavior-identical from the original
// arcade.js), plus screenshake and hit-pause used by the polish pass.
export function createFx(ctx) {
  let particles = [];
  let shakeFrames = 0;
  let shakeMag = 0;
  let pauseFrames = 0;

  return {
    burst(x, y, count, color, speedRange, lifeRange) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);
        const life = lifeRange[0] + Math.random() * (lifeRange[1] - lifeRange[0]);
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          maxLife: life,
          color,
          size: 1 + Math.random() * 2,
        });
      }
    },

    updateAndDraw() {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        if (p.life <= 0) particles.splice(i, 1);
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1.0;
    },

    clear() {
      particles = [];
      shakeFrames = 0;
      pauseFrames = 0;
    },

    get count() { return particles.length; },

    // --- screenshake ---
    shake(magnitude, frames) {
      shakeMag = Math.max(shakeMag, magnitude);
      shakeFrames = Math.max(shakeFrames, frames);
    },
    // Call at the top of a game's draw; returns {x, y} translation to apply.
    shakeOffset() {
      if (shakeFrames <= 0) { shakeMag = 0; return { x: 0, y: 0 }; }
      shakeFrames--;
      return {
        x: (Math.random() - 0.5) * 2 * shakeMag,
        y: (Math.random() - 0.5) * 2 * shakeMag,
      };
    },

    // --- hit-pause (freeze frames) ---
    hitPause(frames) { pauseFrames = Math.max(pauseFrames, frames); },
    // Games call this first in tick(); when true, skip the update this tick.
    consumePause() {
      if (pauseFrames > 0) { pauseFrames--; return true; }
      return false;
    },
  };
}
