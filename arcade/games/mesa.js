// Mesa Lander: set a lander down on the flat top of a desert mesa. Left and right turn,
// Up or Space fires the engine, three landers a game. Started with env.learn = true
// (the MESAAI cartridge) the same module shows an agent teaching itself to land instead,
// by reinforcement learning, live in your browser. The work lives in games/mesa/.
import { startPlay } from './mesa/play.js';
import { startWatch } from './mesa/watch.js';

export default {
  id: 'MESA',
  title: 'Mesa Lander',
  mode: 'landscape',
  ownHud: true,
  start(env) {
    return env.learn ? startWatch(env) : startPlay(env);
  },
};
