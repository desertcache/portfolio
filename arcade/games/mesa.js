// Mesa Lander: set a lander down on a mesa top. With env.learn = true (MESAAI) an
// agent learns to land from scratch instead. Placeholder scene until the game
// lands: the cabinet wiring (mode, tiles, deck, deep links) is real.
export default {
  id: 'MESA',
  title: 'Mesa Lander',
  mode: 'landscape',
  ownHud: true,
  start(env) {
    const { ctx, W, H } = env;
    const label = env.learn ? 'WATCH IT LEARN' : 'MESA LANDER';
    return {
      tick() {
        ctx.fillStyle = '#f3ead8';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#b5523b';
        ctx.fillRect(W / 2 - 90, H - 140, 180, 140);
        ctx.fillStyle = '#2b2118';
        ctx.font = '600 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, W / 2, H / 3);
      },
    };
  },
};
