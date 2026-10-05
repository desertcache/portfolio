// Mesa Lander, flown by an agent that learns to land from scratch while you watch.
// Same game module, started with env.learn = true; the learner lives in games/mesa/.
import mesa from './mesa.js';

export default {
  ...mesa,
  id: 'MESAAI',
  title: 'Mesa Lander: watch it learn',
  start(env) {
    return mesa.start({ ...env, learn: true });
  },
};
