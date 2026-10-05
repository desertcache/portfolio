// UFO Evolution: placeholder until its build lands (neuroevolution: a flock learns to fly).
export default {
  id: 'EVOLVE',
  title: 'UFO Evolution',
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
        ctx.fillText('UFO Evolution: coming soon', W / 2, H / 2);
      },
    };
  },
};
