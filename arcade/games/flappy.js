// Flappy UFO — pilot a UFO through the pipe gaps. One tap/space to flap.

import { makeGlowSprite } from '../engine/sprites.js';

export default {
  id: 'FLAPPY',
  title: 'Flappy UFO',
  mode: 'landscape',
  start(env) {
    const { ctx, W, H } = env;

    ctx.clearRect(0, 0, W, H);

    const gravity = 0.15;
    const jumpThrust = -4.5;
    const speed = 2;
    const pipeWidth = 60;
    const pipeGap = 200;

    let score = 0;
    env.onScore(0);

    const ufo = { x: 100, y: 200, radius: 12, velocity: 0 };
    const pipes = [{ x: W, topHeight: 200 }];

    const starLayers = [
      { count: 40, speed: 0.3, size: 1, alpha: 0.3 },
      { count: 25, speed: 0.6, size: 1.5, alpha: 0.5 },
      { count: 12, speed: 1.0, size: 2, alpha: 0.8 },
    ].map((layer) => ({
      ...layer,
      stars: Array.from({ length: layer.count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
      })),
    }));

    const glowPad = 18;
    const ufoGlow = makeGlowSprite(ufo.radius * 2, ufo.radius * 2, glowPad, '#c084fc', 15, (g, w, h) => {
      g.beginPath();
      g.arc(w / 2, h / 2, ufo.radius, 0, Math.PI * 2);
      g.fillStyle = '#c084fc';
      g.fill();
    });

    const flap = () => {
      ufo.velocity = jumpThrust;
      env.fx.burst(ufo.x, ufo.y + 14, 4, '#e879f9', [0.5, 1.5], [6, 14]);
      env.audio.play('flappy-flap', (h) => h.tone({ f: 320, slideTo: 560, dur: 0.09, type: 'triangle', vol: 0.12 }));
    };

    env.input.onKeyDown((e) => {
      if (e.key === ' ' || e.key === 'ArrowUp') flap();
    });

    env.input.onTap(flap);

    const deathSfx = () => env.audio.play('flappy-death', (h) => {
      h.noise({ dur: 0.3, vol: 0.2 });
      h.tone({ f: 400, slideTo: 60, dur: 0.4, type: 'sawtooth', vol: 0.12 });
    });

    return {
      tick() {
        ctx.clearRect(0, 0, W, H);

        const shake = env.fx.shakeOffset();
        ctx.save();
        ctx.translate(shake.x, shake.y);

        // Parallax starfield, behind everything
        ctx.fillStyle = '#ffffff';
        for (let l = 0; l < starLayers.length; l++) {
          const layer = starLayers[l];
          ctx.globalAlpha = layer.alpha;
          for (let s = 0; s < layer.stars.length; s++) {
            const star = layer.stars[s];
            star.x -= layer.speed;
            if (star.x < 0) star.x += W;
            ctx.fillRect(star.x, star.y, layer.size, layer.size);
          }
        }
        ctx.globalAlpha = 1;

        env.fx.updateAndDraw();

        ufo.velocity += gravity;
        ufo.y += ufo.velocity;

        // UFO with velocity-driven squash & stretch
        const lean = Math.max(-1, Math.min(1, ufo.velocity / -jumpThrust));
        const sx = Math.max(0.9, Math.min(1.15, 1 + lean * 0.15));
        const sy = Math.max(0.9, Math.min(1.15, 1 - lean * 0.15));

        ctx.save();
        ctx.translate(ufo.x, ufo.y);
        ctx.scale(sx, sy);

        ctx.drawImage(ufoGlow, -ufo.radius - glowPad, -ufo.radius - glowPad);

        ctx.beginPath();
        ctx.arc(0, 0, ufo.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#c084fc';
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(0, 2, ufo.radius + 6, Math.floor(ufo.radius / 2), 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#e879f9';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Pipes
        for (let i = 0; i < pipes.length; i++) {
          const p = pipes[i];
          p.x -= speed;

          const bottomY = p.topHeight + pipeGap;

          const topGrad = ctx.createLinearGradient(0, 0, 0, p.topHeight);
          topGrad.addColorStop(0, '#0d9668');
          topGrad.addColorStop(1, '#10b981');
          ctx.fillStyle = topGrad;
          ctx.fillRect(p.x, 0, pipeWidth, p.topHeight);

          const bottomGrad = ctx.createLinearGradient(0, bottomY, 0, H);
          bottomGrad.addColorStop(0, '#10b981');
          bottomGrad.addColorStop(1, '#0d9668');
          ctx.fillStyle = bottomGrad;
          ctx.fillRect(p.x, bottomY, pipeWidth, H - bottomY);

          ctx.fillStyle = '#34d399';
          ctx.fillRect(p.x, p.topHeight - 3, pipeWidth, 3);
          ctx.fillRect(p.x, bottomY, pipeWidth, 3);

          if (ufo.x + ufo.radius > p.x && ufo.x - ufo.radius < p.x + pipeWidth) {
            if (ufo.y - ufo.radius < p.topHeight || ufo.y + ufo.radius > bottomY) {
              env.fx.burst(ufo.x, ufo.y, 40, '#c084fc', [2, 7], [20, 50]);
              env.fx.shake(6, 18);
              deathSfx();
              ctx.restore();
              env.onGameOver(score);
              return;
            }
          }

          if (p.x + pipeWidth / 2 < ufo.x && !p.scored) {
            p.scored = true;
            score++;
            env.onScore(score);
            env.fx.burst(ufo.x + 20, ufo.y, 6, '#34d399', [0.5, 2], [10, 20]);
            env.audio.play('flappy-score', (h) => h.seq([
              { f: 880, type: 'triangle', vol: 0.1 },
              { f: 1318, type: 'triangle', vol: 0.1 },
            ], 0.07));
          }
        }

        const lastPipe = pipes[pipes.length - 1];
        if (lastPipe && lastPipe.x < W - 250) {
          const rHeight = Math.floor(Math.random() * (H - pipeGap - 100)) + 50;
          pipes.push({ x: W, topHeight: rHeight, scored: false });
        }

        if (pipes[0] && pipes[0].x < -pipeWidth) pipes.shift();

        if (ufo.y > H || ufo.y < 0) {
          env.fx.burst(ufo.x, ufo.y, 40, '#c084fc', [2, 7], [20, 50]);
          env.fx.shake(6, 18);
          deathSfx();
          ctx.restore();
          env.onGameOver(score);
          return;
        }

        ctx.restore();
      },
    };
  },
};
