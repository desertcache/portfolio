// Ghost AI, following the behaviors documented in the Pac-Man Dossier:
// per-ghost targeting personalities (including Pinky's and Inky's up-direction
// overflow bug), tile-center decisions with the up>left>down>right tie-break,
// the no-reverse rule, red-zone up restriction, frightened random turns, and
// eyes pathing back to the house.
import { DIRS, tileOf, centerOf, isReverse, resetTileMemory, stepActor, wrapTunnel } from './actors.js';
import { TILE, MAZE_Y, HOUSE } from './maze.js';
import { BASE_SPEED } from './levels.js';
import { GHOST_COLORS } from './sprites.js';

const DIR_ORDER = ['up', 'left', 'down', 'right']; // original tie-break priority

export const SCATTER_TARGETS = {
  blinky: { col: 25, row: -3 },
  pinky: { col: 2, row: -3 },
  inky: { col: 27, row: 32 },
  clyde: { col: 0, row: 32 },
};

const EXIT_Y = MAZE_Y + 11 * TILE + TILE / 2; // corridor above the door

export function createGhost(name) {
  const atHome = name !== 'blinky';
  return {
    name,
    color: GHOST_COLORS[name],
    x: HOUSE.slots[name],
    y: atHome ? HOUSE.centerY : EXIT_Y,
    dir: atHome ? DIRS.up : DIRS.left,
    state: atHome ? 'home' : 'normal', // home | leaving | normal | eyes | entering
    frightened: false,
    elroy: 0, // blinky only: 0 | 1 | 2
    dotCounter: 0, // personal house counter
    animFrame: 0,
  };
}

// The tile this ghost is currently steering toward (also used by the debug
// overlay). Only meaningful in the 'normal' and 'eyes' states.
export function ghostTarget(ghost, world) {
  if (ghost.state === 'eyes') return { col: 13, row: 11 };
  if (ghost.frightened) return null; // random — no target
  const mode = ghost.name === 'blinky' && ghost.elroy > 0 ? 'chase' : world.mode;
  if (mode === 'scatter') return SCATTER_TARGETS[ghost.name];

  const pac = world.pac;
  const pd = pac.dir;
  switch (ghost.name) {
    case 'blinky':
      return { col: pac.col, row: pac.row };
    case 'pinky': {
      let col = pac.col + pd.x * 4;
      let row = pac.row + pd.y * 4;
      if (pd.y === -1) col -= 4; // the original's 16-bit overflow bug
      return { col, row };
    }
    case 'inky': {
      let pcol = pac.col + pd.x * 2;
      let prow = pac.row + pd.y * 2;
      if (pd.y === -1) pcol -= 2; // same overflow bug in the pivot
      const b = tileOf(world.blinky);
      return { col: pcol * 2 - b.col, row: prow * 2 - b.row };
    }
    case 'clyde': {
      const g = tileOf(ghost);
      const d2 = (g.col - pac.col) ** 2 + (g.row - pac.row) ** 2;
      return d2 > 64 ? { col: pac.col, row: pac.row } : SCATTER_TARGETS.clyde;
    }
    default:
      return { col: pac.col, row: pac.row };
  }
}

function speedFor(ghost, world, col, row) {
  const s = world.level.speeds;
  let pct;
  if (ghost.state === 'eyes' || ghost.state === 'entering') pct = 1.6;
  else if (ghost.state === 'home' || ghost.state === 'leaving') pct = 0.45;
  else if (world.maze.isTunnel(col, row)) pct = s.ghostTunnel;
  else if (ghost.frightened) pct = s.ghostFright;
  else if (ghost.name === 'blinky' && ghost.elroy === 2) pct = s.elroy2;
  else if (ghost.name === 'blinky' && ghost.elroy === 1) pct = s.elroy1;
  else pct = s.ghost;
  return BASE_SPEED * pct;
}

function chooseDir(ghost, world, col, row) {
  const maze = world.maze;
  const options = [];
  for (const dirName of DIR_ORDER) {
    const d = DIRS[dirName];
    if (isReverse(d, ghost.dir)) continue;
    const nc = col + d.x;
    const nr = row + d.y;
    const useDoor = ghost.state === 'eyes';
    if (!maze.ghostCanEnter(nc, nr, { useDoor })) continue;
    // Red zone: no turning up during chase/scatter (not fright, not eyes).
    if (dirName === 'up' && !ghost.frightened && ghost.state === 'normal' && maze.isRedZone(col, row)) continue;
    options.push({ d, nc, nr });
  }
  if (options.length === 0) {
    // Dead end (only possible via the no-reverse rule): turn back.
    return { x: -ghost.dir.x, y: -ghost.dir.y };
  }
  if (options.length === 1) return options[0].d;

  if (ghost.frightened && ghost.state === 'normal') {
    return options[Math.floor(world.rng() * options.length)].d;
  }

  const target = ghostTarget(ghost, world) || SCATTER_TARGETS[ghost.name];
  let best = options[0];
  let bestDist = Infinity;
  for (const opt of options) {
    const dist = (opt.nc - target.col) ** 2 + (opt.nr - target.row) ** 2;
    if (dist < bestDist) { // strict: earlier (higher-priority) option wins ties
      bestDist = dist;
      best = opt;
    }
  }
  return best.d;
}

// Force a course reversal (scatter/chase wave change, energizer).
export function reverseGhost(ghost) {
  if (ghost.state !== 'normal') return;
  ghost.dir = { x: -ghost.dir.x, y: -ghost.dir.y };
  resetTileMemory(ghost);
}

export function updateGhost(ghost, world) {
  ghost.animFrame = (ghost.animFrame + 1) % 16;

  switch (ghost.state) {
    case 'home': {
      // Gentle vertical bounce around the house center.
      ghost.y += ghost.dir.y * 0.4;
      if (ghost.y < HOUSE.centerY - 3) ghost.dir = DIRS.down;
      else if (ghost.y > HOUSE.centerY + 3) ghost.dir = DIRS.up;
      return;
    }
    case 'leaving': {
      // Slide to the door column, then rise through the door.
      if (Math.abs(ghost.x - HOUSE.doorX) > 0.5) {
        ghost.x += Math.sign(HOUSE.doorX - ghost.x) * 0.45;
        ghost.dir = ghost.x < HOUSE.doorX ? DIRS.right : DIRS.left;
      } else {
        ghost.x = HOUSE.doorX;
        ghost.dir = DIRS.up;
        ghost.y -= 0.45;
        if (ghost.y <= EXIT_Y) {
          ghost.y = EXIT_Y;
          ghost.dir = DIRS.left;
          ghost.state = 'normal';
          resetTileMemory(ghost);
        }
      }
      return;
    }
    case 'entering': {
      // Drop from the corridor through the door, then revive.
      ghost.dir = DIRS.down;
      ghost.y += 1.6;
      if (ghost.y >= HOUSE.centerY) {
        ghost.y = HOUSE.centerY;
        ghost.frightened = false;
        ghost.state = 'leaving';
      }
      return;
    }
    case 'eyes': {
      // Above the door: switch to the scripted descent.
      const { col, row } = tileOf(ghost);
      if (row === 11 && Math.abs(ghost.x - HOUSE.doorX) < 2 && Math.abs(ghost.y - EXIT_Y) < 2) {
        ghost.x = HOUSE.doorX;
        ghost.y = EXIT_Y;
        ghost.state = 'entering';
        return;
      }
      stepActor(ghost, speedFor(ghost, world, col, row), {
        canEnter: (c, r) => world.maze.ghostCanEnter(c, r, { useDoor: true }),
        chooseDir: (c, r) => chooseDir(ghost, world, c, r),
      });
      wrapTunnel(ghost);
      return;
    }
    case 'normal':
    default: {
      const { col, row } = tileOf(ghost);
      stepActor(ghost, speedFor(ghost, world, col, row), {
        canEnter: (c, r) => world.maze.ghostCanEnter(c, r),
        chooseDir: (c, r) => chooseDir(ghost, world, c, r),
      });
      wrapTunnel(ghost);
    }
  }
}

export function dirName(dir) {
  for (const name of DIR_ORDER) {
    if (DIRS[name].x === dir.x && DIRS[name].y === dir.y) return name;
  }
  return 'left';
}
