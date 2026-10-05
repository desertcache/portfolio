// Four in a Row: placeholder until its build lands (a search AI that shows its thinking).
export default {
  id: 'FOUR',
  title: 'Four in a Row',
  mode: 'landscape',
  start(env) {
    env.onScore(0);
    return {
      tick() {
        const { ctx, W, H } = env;
        ctx.fillStyle = '#0f0a1e';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f5eef2';
        ctx.font = '16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Four in a Row: coming soon', W / 2, H / 2);
      },
    };
  },
};
