// QUADRA: placeholder until its build lands (falling blocks under its own name).
export default {
  id: 'QUADRA',
  title: 'QUADRA',
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
        ctx.fillText('QUADRA: coming soon', W / 2, H / 2);
      },
    };
  },
};
