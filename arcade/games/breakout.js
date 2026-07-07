// Breakout — paddle, ball, and a 8x5 brick wall.

export default {
  id: 'BREAKOUT',
  title: 'Breakout',
  mode: 'landscape',
  start(env) {
    const { ctx, W, H } = env;
    ctx.clearRect(0, 0, W, H);

    let score = 0;
    let bricksDestroyed = 0;
    env.onScore(0);

    const paddleW = 100, paddleH = 12;
    let paddleX = (W - paddleW) / 2;

    const ballRadius = 6;
    let ballX = W / 2;
    let ballY = H - 40;
    const ballSpeedBase = 4;
    let ballDX = ballSpeedBase * (Math.random() > 0.5 ? 1 : -1);
    let ballDY = -ballSpeedBase;

    // Brick grid
    const cols = 8, rows = 5;
    const brickPad = 4;
    const brickTopOffset = 40;
    const rowColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
    let bricks = [];

    function buildBricks() {
      bricks = [];
      const brickW = (W - brickPad * (cols + 1)) / cols;
      const brickH = 18;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          bricks.push({
            x: brickPad + c * (brickW + brickPad),
            y: brickTopOffset + r * (brickH + brickPad),
            w: brickW,
            h: brickH,
            color: rowColors[r],
            row: r,
            alive: true,
          });
        }
      }
    }
    buildBricks();

    const movePaddle = (x) => {
      paddleX = Math.max(0, Math.min(W - paddleW, x - paddleW / 2));
    };
    env.input.onMouseMove(movePaddle);
    env.input.onDrag(movePaddle);

    return {
      tick() {
        ctx.clearRect(0, 0, W, H);
        env.fx.updateAndDraw();

        // Move ball
        ballX += ballDX;
        ballY += ballDY;

        // Wall bounces
        if (ballX - ballRadius < 0 || ballX + ballRadius > W) {
          ballDX = -ballDX;
          env.audio.play('breakout-wall', (h) => h.tone({ f: 160, dur: 0.04, vol: 0.08 }));
        }
        if (ballY - ballRadius < 0) {
          ballDY = -ballDY;
          env.audio.play('breakout-wall', (h) => h.tone({ f: 160, dur: 0.04, vol: 0.08 }));
        }

        // Ball below paddle = game over
        if (ballY + ballRadius > H) {
          env.audio.play('breakout-death', (h) => {
            h.noise({ dur: 0.25, vol: 0.16 });
            h.tone({ f: 300, slideTo: 50, dur: 0.4, type: 'sawtooth', vol: 0.12 });
          });
          env.onGameOver(score);
          return;
        }

        // Paddle collision
        if (ballDY > 0 &&
          ballY + ballRadius >= H - 25 - paddleH &&
          ballY + ballRadius <= H - 25 &&
          ballX >= paddleX && ballX <= paddleX + paddleW) {
          // Angle based on hit position
          const hitPos = (ballX - paddleX) / paddleW; // 0..1
          const angle = (hitPos - 0.5) * Math.PI * 0.7; // -63deg to +63deg
          const speed = Math.sqrt(ballDX * ballDX + ballDY * ballDY);
          ballDX = speed * Math.sin(angle);
          ballDY = -speed * Math.cos(angle);
          env.audio.play('breakout-paddle', (h) => h.tone({ f: 220, dur: 0.05, vol: 0.12 }));
        }

        // Brick collisions
        for (let i = 0; i < bricks.length; i++) {
          const b = bricks[i];
          if (!b.alive) continue;

          if (ballX + ballRadius > b.x && ballX - ballRadius < b.x + b.w &&
            ballY + ballRadius > b.y && ballY - ballRadius < b.y + b.h) {
            b.alive = false;
            score += 10;
            bricksDestroyed++;
            env.onScore(score);
            env.fx.burst(b.x + b.w / 2, b.y + b.h / 2, 12, b.color, [1, 3], [15, 30]);
            const brickFreq = [880, 784, 659, 587, 523][b.row];
            env.audio.play('breakout-brick', (h) => h.tone({ f: brickFreq, dur: 0.06, vol: 0.11 }));

            // Speed up every 15 bricks
            if (bricksDestroyed % 15 === 0) {
              const spd = Math.sqrt(ballDX * ballDX + ballDY * ballDY);
              const factor = (spd + 0.5) / spd;
              ballDX *= factor;
              ballDY *= factor;
            }

            // Determine bounce direction
            const overlapLeft = (ballX + ballRadius) - b.x;
            const overlapRight = (b.x + b.w) - (ballX - ballRadius);
            const overlapTop = (ballY + ballRadius) - b.y;
            const overlapBottom = (b.y + b.h) - (ballY - ballRadius);
            const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
            if (minOverlap === overlapTop || minOverlap === overlapBottom) ballDY = -ballDY;
            else ballDX = -ballDX;
            break;
          }
        }

        // All bricks cleared = reset with faster ball
        if (bricks.every(b => !b.alive)) {
          buildBricks();
          const spd = Math.sqrt(ballDX * ballDX + ballDY * ballDY);
          const factor = (spd + 1) / spd;
          ballDX *= factor;
          ballDY *= factor;
        }

        // Draw bricks
        for (let i = 0; i < bricks.length; i++) {
          const b = bricks[i];
          if (!b.alive) continue;
          ctx.fillStyle = b.color;
          ctx.shadowBlur = 6;
          ctx.shadowColor = b.color;
          ctx.fillRect(b.x, b.y, b.w, b.h);
        }
        ctx.shadowBlur = 0;

        // Draw paddle
        ctx.fillStyle = '#e879f9';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#e879f9';
        ctx.fillRect(paddleX, H - 25 - paddleH, paddleW, paddleH);
        ctx.shadowBlur = 0;

        // Draw ball
        ctx.beginPath();
        ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ffffff';
        ctx.fill();
        ctx.shadowBlur = 0;
      },
    };
  },
};
