// Flappy UFO — pilot a UFO through the pipe gaps. One tap/space to flap.

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

    const flap = () => {
      ufo.velocity = jumpThrust;
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
        env.fx.updateAndDraw();

        ufo.velocity += gravity;
        ufo.y += ufo.velocity;

        // UFO body
        ctx.beginPath();
        ctx.arc(ufo.x, ufo.y, ufo.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#c084fc';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#c084fc';
        ctx.fill();

        // UFO ring
        ctx.beginPath();
        ctx.ellipse(ufo.x, ufo.y + 2, ufo.radius + 6, Math.floor(ufo.radius / 2), 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#e879f9';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Pipes
        ctx.fillStyle = '#10b981';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#10b981';

        for (let i = 0; i < pipes.length; i++) {
          const p = pipes[i];
          p.x -= speed;

          ctx.fillRect(p.x, 0, pipeWidth, p.topHeight);
          const bottomY = p.topHeight + pipeGap;
          ctx.fillRect(p.x, bottomY, pipeWidth, H - bottomY);

          if (ufo.x + ufo.radius > p.x && ufo.x - ufo.radius < p.x + pipeWidth) {
            if (ufo.y - ufo.radius < p.topHeight || ufo.y + ufo.radius > bottomY) {
              env.fx.burst(ufo.x, ufo.y, 40, '#c084fc', [2, 7], [20, 50]);
              deathSfx();
              env.onGameOver(score);
              return;
            }
          }

          if (p.x + pipeWidth / 2 < ufo.x && !p.scored) {
            p.scored = true;
            score++;
            env.onScore(score);
            env.audio.play('flappy-score', (h) => h.seq([
              { f: 880, type: 'triangle', vol: 0.1 },
              { f: 1318, type: 'triangle', vol: 0.1 },
            ], 0.07));
          }
        }
        ctx.shadowBlur = 0;

        const lastPipe = pipes[pipes.length - 1];
        if (lastPipe && lastPipe.x < W - 250) {
          const rHeight = Math.floor(Math.random() * (H - pipeGap - 100)) + 50;
          pipes.push({ x: W, topHeight: rHeight, scored: false });
        }

        if (pipes[0] && pipes[0].x < -pipeWidth) pipes.shift();

        if (ufo.y > H || ufo.y < 0) {
          env.fx.burst(ufo.x, ufo.y, 40, '#c084fc', [2, 7], [20, 50]);
          deathSfx();
          env.onGameOver(score);
          return;
        }
      },
    };
  },
};
