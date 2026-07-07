// Neon Snake — classic grid snake with glow trails.

export default {
  id: 'SNAKE',
  title: 'Neon Snake',
  mode: 'landscape',
  start(env) {
    const { ctx, W, H } = env;
    const grid = 20;
    let count = 0;
    let score = 0;
    let speedControl = 8;
    env.onScore(0);

    const snake = {
      x: 160, y: 160,
      dx: grid, dy: 0,
      cells: [],
      maxCells: 4,
    };

    const apple = { x: 320, y: 320 };

    env.input.onKeyDown((e) => {
      if (e.key === 'ArrowLeft' && snake.dx === 0) { snake.dx = -grid; snake.dy = 0; }
      else if (e.key === 'ArrowUp' && snake.dy === 0) { snake.dy = -grid; snake.dx = 0; }
      else if (e.key === 'ArrowRight' && snake.dx === 0) { snake.dx = grid; snake.dy = 0; }
      else if (e.key === 'ArrowDown' && snake.dy === 0) { snake.dy = grid; snake.dx = 0; }
    });

    env.input.onSwipe((dir) => {
      if (dir === 'right' && snake.dx === 0) { snake.dx = grid; snake.dy = 0; }
      else if (dir === 'left' && snake.dx === 0) { snake.dx = -grid; snake.dy = 0; }
      else if (dir === 'down' && snake.dy === 0) { snake.dy = grid; snake.dx = 0; }
      else if (dir === 'up' && snake.dy === 0) { snake.dy = -grid; snake.dx = 0; }
    });

    return {
      tick() {
        if (++count < speedControl) return;
        count = 0;

        ctx.clearRect(0, 0, W, H);
        env.fx.updateAndDraw();

        snake.x += snake.dx;
        snake.y += snake.dy;

        if (snake.x < 0 || snake.x >= W || snake.y < 0 || snake.y >= H) {
          env.fx.burst(snake.x + grid / 2, snake.y + grid / 2, 30, '#3b82f6', [2, 6], [20, 50]);
          env.onGameOver(score);
          return;
        }

        snake.cells.unshift({ x: snake.x, y: snake.y });
        if (snake.cells.length > snake.maxCells) snake.cells.pop();

        // Apple
        ctx.fillStyle = '#ef4444';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ef4444';
        ctx.fillRect(apple.x, apple.y, grid - 1, grid - 1);

        // Snake
        ctx.fillStyle = '#3b82f6';
        ctx.shadowColor = '#3b82f6';

        for (let i = 0; i < snake.cells.length; i++) {
          ctx.fillRect(snake.cells[i].x, snake.cells[i].y, grid - 1, grid - 1);

          if (snake.cells[i].x === apple.x && snake.cells[i].y === apple.y) {
            snake.maxCells++;
            score += 10;
            env.onScore(score);
            if (score % 100 === 0 && speedControl > 2) speedControl--;
            apple.x = Math.floor(Math.random() * (W / grid)) * grid;
            apple.y = Math.floor(Math.random() * (H / grid)) * grid;
          }

          for (let j = i + 1; j < snake.cells.length; j++) {
            if (snake.cells[i].x === snake.cells[j].x && snake.cells[i].y === snake.cells[j].y) {
              env.fx.burst(snake.x + grid / 2, snake.y + grid / 2, 30, '#3b82f6', [2, 6], [20, 50]);
              env.onGameOver(score);
              return;
            }
          }
        }
        ctx.shadowBlur = 0;
      },
    };
  },
};
