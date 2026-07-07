// Per-level difficulty tables, following the values documented in the
// Pac-Man Dossier (Pittman's dissection of the original arcade game).
// Speeds are percentages of the base actor speed (100% ≈ 75.757 px/s,
// i.e. ~1.2626 logical pixels per 60 Hz tick).

export const BASE_SPEED = 75.75757575 / 60; // logical px per tick at 100%

export const FRUIT = {
  cherry: { points: 100 },
  strawberry: { points: 300 },
  peach: { points: 500 },
  apple: { points: 700 },
  grapes: { points: 1000 },
  galaxian: { points: 2000 },
  bell: { points: 3000 },
  key: { points: 5000 },
};

// Fruit by level (1-indexed; level 13+ is always key).
const FRUIT_ORDER = [
  'cherry', 'strawberry', 'peach', 'peach', 'apple', 'apple',
  'grapes', 'grapes', 'galaxian', 'galaxian', 'bell', 'bell', 'key',
];

export function fruitForLevel(level) {
  const name = FRUIT_ORDER[Math.min(level, 13) - 1];
  return { name, points: FRUIT[name].points };
}

// Scatter/chase alternation per level, seconds. Last chase runs forever.
// (The 1/60s scatter in the tables below reproduces the original's final
// "scatter" that is over before it starts, which acts as a reversal trigger.)
const TICK = 1 / 60;
export function wavesForLevel(level) {
  if (level === 1) {
    return [7, 20, 7, 20, 5, 20, 5, Infinity];
  }
  if (level <= 4) {
    return [7, 20, 7, 20, 5, 1033, TICK, Infinity];
  }
  return [5, 20, 5, 20, 5, 1037, TICK, Infinity];
}

// Cruise Elroy: when this many dots remain, Blinky speeds up (stage 1),
// and at half that, speeds up again (stage 2).
function elroyDots(level) {
  if (level === 1) return 20;
  if (level === 2) return 30;
  if (level <= 5) return 40;
  if (level <= 8) return 50;
  if (level <= 11) return 60;
  if (level <= 14) return 80;
  if (level <= 18) return 100;
  return 120;
}

export function levelSpec(level) {
  let speeds;
  if (level === 1) {
    speeds = {
      pac: 0.80, pacDots: 0.71, pacFright: 0.90, pacFrightDots: 0.79,
      ghost: 0.75, ghostFright: 0.50, ghostTunnel: 0.40,
      elroy1: 0.80, elroy2: 0.85,
    };
  } else if (level <= 4) {
    speeds = {
      pac: 0.90, pacDots: 0.79, pacFright: 0.95, pacFrightDots: 0.83,
      ghost: 0.85, ghostFright: 0.55, ghostTunnel: 0.45,
      elroy1: 0.90, elroy2: 0.95,
    };
  } else if (level <= 20) {
    speeds = {
      pac: 1.00, pacDots: 0.87, pacFright: 1.00, pacFrightDots: 0.87,
      ghost: 0.95, ghostFright: 0.60, ghostTunnel: 0.50,
      elroy1: 1.00, elroy2: 1.05,
    };
  } else {
    // Level 21+: Pac-Man slows back down, ghosts stay fast, no fright.
    speeds = {
      pac: 0.90, pacDots: 0.79, pacFright: 0.90, pacFrightDots: 0.79,
      ghost: 0.95, ghostFright: 0.95, ghostTunnel: 0.50,
      elroy1: 1.00, elroy2: 1.05,
    };
  }

  const frightTable = {
    1: [6, 5], 2: [5, 5], 3: [4, 5], 4: [3, 5], 5: [2, 5], 6: [5, 5],
    7: [2, 5], 8: [2, 5], 9: [1, 3], 10: [5, 5], 11: [2, 5], 12: [1, 3],
    13: [1, 3], 14: [3, 5], 15: [1, 3], 16: [1, 3], 17: [0, 0], 18: [1, 3],
  };
  const [frightSeconds, frightFlashes] = level <= 18 ? frightTable[level] : [0, 0];

  // Ghost-house exit dot limits (personal counters), and the timeout that
  // releases the preferred ghost when Pac-Man stops eating dots.
  let dotLimits;
  if (level === 1) dotLimits = { pinky: 0, inky: 30, clyde: 60 };
  else if (level === 2) dotLimits = { pinky: 0, inky: 0, clyde: 50 };
  else dotLimits = { pinky: 0, inky: 0, clyde: 0 };

  return {
    level,
    speeds,
    frightSeconds,
    frightFlashes,
    waves: wavesForLevel(level),
    fruit: fruitForLevel(level),
    elroy1Dots: elroyDots(level),
    elroy2Dots: Math.floor(elroyDots(level) / 2),
    houseDotLimits: dotLimits,
    // Global counter limits used only after a life is lost (Dossier §house).
    globalDotLimits: { pinky: 7, inky: 17, clyde: 32 },
    noDotReleaseSeconds: level <= 4 ? 4 : 3,
  };
}

export const SCORING = {
  dot: 10,
  energizer: 50,
  ghost: [200, 400, 800, 1600], // chain within one energizer
  extraLifeAt: 10000,
};
