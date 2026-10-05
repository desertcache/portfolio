// Dust Devil Pinball: one table on the tall screen. Placeholder scene until the
// table lands: the cabinet wiring (mode, tile, deck, deep link) is real.
export default {
  id: 'PINBALL',
  title: 'Dust Devil Pinball',
  mode: 'tall',
  ownHud: true,
  start(env) {
    const { ctx, W, H } = env;
    return {
      tick() {
        ctx.fillStyle = '#f3ead8';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#2b2118';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, W - 20, H - 20);
        ctx.fillStyle = '#2b2118';
        ctx.font = '600 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('DUST DEVIL', W / 2, H / 2);
      },
    };
  },
};
