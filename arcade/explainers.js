// "How it works" copy for the card under the cabinet, one entry per game id plus
// MENU for the cabinet itself. Every number here is read from the game's code or
// its measured test runs; change the copy when the code changes. Rendered with
// textContent only, and kept free of em dashes (the homepage test rule).

/** @typedef {{ name: string, title: string, body: string, rows: [string, string][] }} Explainer */

/** @type {Record<string, Explainer>} */
export const EXPLAINERS = {
  MENU: {
    name: 'The cabinet',
    title: 'One small engine, twelve games',
    body: 'Every game is a plug-in module on the same tiny engine: a fixed loop of 60 steps a second, a fixed screen (800 by 500, a tall 450 by 720 for the pinball table, or Pac-Man\'s original 224 by 288) scaled to fit yours, and sound synthesized live with Web Audio. There are no sound files, no libraries and no build step. Switching games is instant, and the address bar follows along, so any game can be linked directly.',
    rows: [
      ['Keys', '1 to 9, 0, - and = start a game, A watches the AI play, L watches it learn, [ and ] switch'],
      ['Touch', 'Tap a game below'],
      ['Dependencies', '0'],
    ],
  },
  PACMAN: {
    name: 'Pac-Man',
    title: 'Four ghosts, four rules',
    body: 'A rebuild of the 1980 arcade logic, not a lookalike. Each ghost picks a target tile, and at every intersection it turns toward whichever exit is closest to that target in a straight line. Blinky targets you. Pinky aims four tiles ahead of you, and when you face up also four to the left, the original overflow bug kept on purpose. Inky doubles the line from Blinky through a point two tiles ahead of you. Clyde chases until he gets within eight tiles, then retreats to his corner.',
    rows: [
      ['Keys', 'Arrow keys or WASD'],
      ['Touch', 'Swipe to turn'],
      ['Ghost rules', '4, one per ghost, on the arcade\'s own scatter and chase timer'],
    ],
  },
  PACMANAI: {
    name: 'Watch the AI play',
    title: 'An AI that shows its reasoning',
    body: 'Every time Pac-Man reaches a new tile, the AI replays each ghost\'s real targeting rules a few seconds into the future and works out the earliest moment any ghost could reach every tile. Then it searches for a route that stays ahead of all of them, weighing dots, power pellets, fruit and frightened ghosts, and it turns down any goal it couldn\'t escape from. The line above the maze is its current plan, the line on the board is its route, and red tiles are where a ghost could get there first.',
    rows: [
      ['Keys', 'Arrow keys or WASD take over, O hides the thoughts'],
      ['Touch', 'Swipe to take over'],
      ['Test runs', 'Cleared level 1 in 40 of 40 games, averaging about 38,000 points'],
    ],
  },
  SNAKE: {
    name: 'Neon Snake',
    title: 'A grid and a clock',
    body: 'The board is a grid of 20-pixel cells, and the snake moves one cell every eight game steps. Each apple adds a segment and 10 points, and every 100 points the clock tightens by one step, down to a move every two steps, so the game speeds up exactly as fast as you get good at it. Leave the board and it\'s over.',
    rows: [
      ['Keys', 'Arrow keys'],
      ['Touch', 'Swipe to turn'],
      ['Top speed', 'One cell every 2 steps, 4 times the start'],
    ],
  },
  FLAPPY: {
    name: 'Flappy UFO',
    title: 'Gravity and one button',
    body: 'Gravity adds a little downward speed every step, and a flap replaces whatever speed you had with the same fixed lift. That reset is why the game is about rhythm rather than holding a button: two quick flaps don\'t climb twice as far. Pipes scroll in at a steady pace with a 200-pixel gap at a random height, and three layers of stars drift at different speeds behind them for depth.',
    rows: [
      ['Keys', 'Space or up arrow'],
      ['Touch', 'Tap to flap'],
      ['Gap', '200 pixels, at a random height every time'],
    ],
  },
  BREAKOUT: {
    name: 'Breakout',
    title: 'Aim with the paddle',
    body: 'Where the ball meets the paddle sets where it goes next. Hit it dead center and it rises straight up; hit it near an edge and it leaves at up to 63 degrees. That is the one real skill in Breakout, and it\'s how you aim at the last few bricks. Clear the 8 by 5 wall and it rebuilds with a faster ball.',
    rows: [
      ['Mouse', 'Move to steer'],
      ['Touch', 'Drag to steer'],
      ['Widest angle', '63 degrees off vertical, at the paddle\'s edge'],
    ],
  },
  ASTEROIDS: {
    name: 'Asteroids',
    title: 'Momentum in a wraparound sky',
    body: 'Your ship keeps its momentum, losing only half a percent of its speed each step, so every burn of thrust is a commitment. Everything wraps from one edge of the screen to the other. A large rock splits into two medium ones and a medium into two small ones, each flying off in a random direction, so one good shot can make the sky busier.',
    rows: [
      ['Keys', 'Left and right turn, up thrusts, Space fires'],
      ['Touch', 'Hold the left or right edge to turn, the lower middle to thrust, tap to fire'],
      ['Points', '20 large, 50 medium, 100 small'],
    ],
  },
  FOUR: {
    name: 'Four in a Row',
    title: 'Search you can watch',
    body: 'The AI uses alpha-beta search: it plays out future moves for both sides and skips any line of play it can prove is worse than one it has already found. It remembers positions it has seen, searches the most promising columns first, and deepens one move at a time, so the panel always shows its best answer so far. The bars are how it rates each column: up is good for the AI, down is good for you.',
    rows: [
      ['Keys', 'Click a column, or 1 to 7, or left, right and Enter'],
      ['Touch', 'Tap a column'],
      ['Hard mode', 'Searches 11 to 12 moves deep on its first move'],
    ],
  },
  EVOLVE: {
    name: 'UFO Evolution',
    title: 'Sixty brains, one lesson',
    body: 'Each UFO flies a tiny neural network: five inputs (its height, its speed, the distance to the next pipe, and the top and bottom of the gap), eight hidden neurons, and one output that decides whether to flap. Nobody trains it. When the whole flock has crashed, the four best pilots carry over unchanged, and the rest are bred from winners of small tournaments, mixing their parents\' neurons and adding a little random mutation. The panel shows the current best brain.',
    rows: [
      ['Keys', '1 to 4 set the speed, R starts a new flock, Esc ends'],
      ['Touch', 'Use the buttons on screen'],
      ['Flock', '60 UFOs a generation, 40 generations a session'],
    ],
  },
  CROSSING: {
    name: 'Roadrunner Crossing',
    title: 'Lanes on a loop',
    body: 'Each lane is a loop of vehicles or logs with its own speed and direction, and the gaps are drawn from a range so the pattern never quite repeats. In the arroyo you ride whatever is under you, so you drift with it and can be carried off the edge. Fill all five shady spots to clear a level; each level runs about 11 percent faster, up to 2.2 times the start, with tighter gaps and a shorter clock. The roadrunner and the plants are the same drawings used across this site.',
    rows: [
      ['Keys', 'Arrow keys or WASD hop'],
      ['Touch', 'Swipe to hop, tap to go up'],
      ['Bonus', 'A prickly pear in an open spot is worth 200'],
    ],
  },
  SWARM: {
    name: 'Swarm',
    title: 'Choreography, then chaos',
    body: 'Five squads of eight fly in along curved paths, some in mirrored pairs, and settle into a ten by five formation that sways while they arrive and breathes once they have landed. Then ships peel off to dive: drones swoop through and wrap around, stingers loop back up to their places, and two-hit Wardens dive with escorts and fire a spread. Every fourth wave, starting with the third, is a practice run with no enemy fire and a bonus for your hit ratio.',
    rows: [
      ['Keys', 'Left and right or A and D, Space fires, hold to autofire'],
      ['Touch', 'Drag to move, tap or hold to fire'],
      ['Per wave', '40 ships, each on its own flight path'],
    ],
  },
  QUADRA: {
    name: 'QUADRA',
    title: 'Modern rules, its own name',
    body: 'Pieces come from a 7-bag: every seven pieces hold each shape exactly once, so you never wait long for the long bar. Rotations use the standard wall kicks, trying a few nearby positions before giving up, and a piece that lands waits a moment before it locks so you can still slide it into place. Hold one piece for later, follow the ghost to see where it will land, and chain clears for combo and back-to-back bonuses.',
    rows: [
      ['Keys', 'Left and right move, up or X rotates, Z rotates back, Space drops, C holds'],
      ['Touch', 'Drag to move, tap to rotate, swipe down to drop, swipe up to hold'],
      ['Four lines', '800 points times the level, and 1.5 times that back to back'],
    ],
  },
  PINBALL: {
    name: 'Dust Devil Pinball',
    title: 'Tiny steps, honest walls',
    body: 'Every frame is cut into twelve tiny physics steps, 720 a second, so a fast ball cannot skip a wall. At top speed (1,800 pixels a second) the ball would cover 30 pixels in a single frame, but the rails are only 6 pixels thick, so one big step could drop it on the far side of a wall and push it out the wrong way, which is called tunneling. Twelve steps keep each move to 2.5 pixels, a quarter of the ball\'s own radius, so every wall gets to push back. A flipper is a moving surface: the game works out how fast it is moving at the exact spot the ball touches (its swing speed times the distance from the pivot) and bounces the ball off that, so a hit near the tip leaves much faster than one near the pivot. Pop bumpers and slingshots simply kick the ball away at a fixed 560 pixels a second, and everything else is gravity on a tilted table.',
    rows: [
      ['Keys', 'Z or left arrow flips left, / or right arrow flips right, hold Space and let go to launch, up arrow nudges'],
      ['Touch', 'Hold the left or right half of the screen to flip; while the ball waits, hold anywhere to pull the plunger and let go to launch'],
      ['Flip speed', 'A ball at rest leaves a flipper at about 650 pixels a second near the pivot and 1,300 at the tip'],
    ],
  },
  MESA: {
    name: 'Mesa Lander',
    title: 'Point first, then push',
    body: 'Gravity adds 48 pixels per second of downward speed every second, and the engine pushes along whichever way the lander points, about two and a half times harder than gravity. That is the whole puzzle: to move sideways you must first tilt with the side jets, which also nudge you a little, and only then burn. The jets spin you faster the longer you hold them and the spin fades slowly, so a quick tap overshoots. A landing counts only with both feet on the pad and a gentle touchdown. Each level narrows the pad, from 120 pixels down to 54, and from level 3 gusts push the lander sideways.',
    rows: [
      ['Keys', 'Left and right turn, Up or Space fires the engine, P pauses'],
      ['Touch', 'Hold the left or right edge to turn, the lower middle to thrust'],
      ['Safe touchdown', 'Under 40 px/s down, 24 across and 12.6 degrees of tilt'],
    ],
  },
  MESAAI: {
    name: 'Watch it learn',
    title: 'A lander that teaches itself',
    body: 'Nobody tells this lander how to fly: it starts as a small neural network that picks idle, left, main or right at random, 20 times a second, and it crashes. Each attempt earns a score (a landing pays 30, a crash costs 3 to 10, and getting closer, slower and more upright pays a little), and a second network learns to predict that score from wherever the lander is, which is the needle that sinks before a crash. Every 2,048 decisions the first network is nudged toward the choices that beat the prediction, a method called PPO, one of the reinforcement learning methods that has been used to fine-tune chat models from human feedback. The practice happens out of sight, in the world you see (one mesa, a random start each time, free fuel that costs points), and the lander on screen is a frozen copy of the newest brain rolling the same dice, so the landings you watch are the honest rate.',
    rows: [
      ['Keys', '1 to 4 set the speed, R starts a new brain, Esc ends'],
      ['Touch', 'Use the buttons on screen'],
      ['Learning time', 'About 30 s to land 70% of practice attempts at 1x (23 to 40 s over five seeds, measured in desktop Chrome)'],
    ],
  },
};
