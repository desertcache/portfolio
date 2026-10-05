// Pac-Man, played by an AI that shows its reasoning. Same game module, started with
// env.autopilot = true; the autopilot and its overlay live in games/pacman/.
import pacman from './pacman/index.js';

export default {
  ...pacman,
  id: 'PACMANAI',
  title: 'Pac-Man: watch the AI play',
  start(env) {
    return pacman.start({ ...env, autopilot: true });
  },
};
