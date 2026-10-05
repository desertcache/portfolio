// Pixel-art cartridge icons for the game rail: one 12x12 bitmap per game, in that
// game's own colors, painted once into a small canvas and scaled up with crisp
// pixels. No image files. '.' is transparent; every other character is a key into
// the icon's palette.

/** @typedef {{ palette: Record<string, string>, rows: string[] }} Icon */

/** @type {Record<string, Icon>} */
export const ICONS = {
  PACMAN: {
    palette: { Y: '#ffd23f', w: '#ffb8ae' },
    rows: [
      '....YYYY....',
      '..YYYYYYYY..',
      '.YYYYYYYYYY.',
      '.YYYYYYY....',
      'YYYYYY......',
      'YYYY....w..w',
      'YYYY........',
      'YYYYYY......',
      '.YYYYYYY....',
      '.YYYYYYYYYY.',
      '..YYYYYYYY..',
      '....YYYY....',
    ],
  },
  // Pac-Man with the autopilot's planned route and goal bracket ahead of him.
  PACMANAI: {
    palette: { Y: '#ffd23f', c: '#5eead4' },
    rows: [
      '.......cc.cc',
      '.......c...c',
      '..YYY.......',
      '.YYYYY.c...c',
      'YYYY...cc.cc',
      'YYY.....c...',
      'YYY.....c...',
      'YYYY....c...',
      '.YYYYY..c...',
      '..YYY...c...',
      '.....cccc...',
      '............',
    ],
  },
  SNAKE: {
    palette: { b: '#3b82f6', h: '#93c5fd', r: '#ef4444', g: '#4ade80' },
    rows: [
      '............',
      '.........g..',
      '........rr..',
      '.bbbbb..rr..',
      '.b...b......',
      '.b...b......',
      '.b...bbbbh..',
      '.b..........',
      '.b..........',
      '.bbbbbbbb...',
      '............',
      '............',
    ],
  },
  FLAPPY: {
    palette: { p: '#e879f9', d: '#c4b5fd', s: '#94a3b8', g: '#22c55e', G: '#15803d' },
    rows: [
      'gG......gG..',
      'gG......gG..',
      'gG......gG..',
      'GGG....GGG..',
      '...dd.......',
      '..dddd......',
      '.pppppp.....',
      'ppsppspp....',
      '.pppppp.....',
      'GGG....GGG..',
      'gG......gG..',
      'gG......gG..',
    ],
  },
  BREAKOUT: {
    palette: { r: '#f43f5e', o: '#fb923c', y: '#facc15', g: '#4ade80', w: '#f5eef2', p: '#e879f9' },
    rows: [
      'rrr.rrr.rrr.',
      'ooo.ooo.ooo.',
      'yyy.yyy.....',
      'ggg.........',
      '............',
      '.......ww...',
      '.......ww...',
      '............',
      '............',
      '............',
      '...pppppp...',
      '............',
    ],
  },
  ASTEROIDS: {
    palette: { v: '#a78bfa', c: '#22d3ee', w: '#f5eef2' },
    rows: [
      '.....vvvv...',
      '....v....v..',
      '...v......v.',
      '...v.....v..',
      '....v....v..',
      '.....vvvv...',
      '............',
      '.c..........',
      '.ccc...w....',
      '.ccccc......',
      '.ccc........',
      '.c..........',
    ],
  },
  FOUR: {
    palette: { a: '#ffb547', k: '#ff5c93', f: '#3b2a5e' },
    rows: [
      'ffffffffffff',
      'f..f..f..fkf',
      'f..f..f..fkf',
      'ffffffffffff',
      'f..f..fkkf.f',
      'f..f..fkkf.f',
      'ffffffffffff',
      'f..fkkfaaf.f',
      'f..fkkfaaf.f',
      'ffffffffffff',
      'fkkfaafaaf.f',
      'fkkfaafaaf.f',
    ],
  },
  // The flock climbing: the best pilot (amber) leads two of its descendants.
  EVOLVE: {
    palette: { a: '#ffb547', A: '#fff1c7', p: '#a855f7', P: '#e9d5ff', l: '#5b3f86' },
    rows: [
      '.........AA.',
      '........aaaa',
      '.........l..',
      '.....PP..l..',
      '....pppp....',
      '.....l......',
      '.PP..l......',
      'pppp........',
      '.l..........',
      '.l..........',
      '............',
      '............',
    ],
  },
  CROSSING: {
    palette: { g: '#6f8f4e', G: '#4c6b34', y: '#f4c95d', s: '#8a7a68' },
    rows: [
      '.....g......',
      '....ggg.....',
      '.g..ggg..g..',
      '.g..ggg..g..',
      '.gg.ggg.gg..',
      '..ggggggg...',
      '....ggg.....',
      '....GGG.....',
      'ssssssssssss',
      '............',
      'yy..yy..yy..',
      '............',
    ],
  },
  SWARM: {
    palette: { k: '#ff5c93', a: '#ffb547', w: '#f5eef2' },
    rows: [
      '..k......k..',
      '...k....k...',
      '..kkkkkkkk..',
      '.kkwkkkkwkk.',
      'kkkkkkkkkkkk',
      'k.kkkkkkkk.k',
      'k.k......k.k',
      '...kk..kk...',
      '............',
      '.....a......',
      '....aaa.....',
      '...a.a.a....',
    ],
  },
  QUADRA: {
    palette: { t: '#d4663a', g: '#8fae6b', s: '#e6c89a', i: '#2a1d14' },
    rows: [
      '....ttt.....',
      '.....t......',
      '............',
      '.........s..',
      '.........s..',
      'gg.......ss.',
      'gg.ss.tttss.',
      'gggssstt.ttt',
      'ggggssstggtt',
      'tgggssttggtt',
      'ttggsssgggtt',
      'tttgssggggtt',
    ],
  },
  PINBALL: {
    palette: { G: '#2f4f28', g: '#6f9a4e', y: '#f4c95d', w: '#f1f3f2', s: '#9aa3a8', t: '#d4713f' },
    rows: [
      '...GGG......',
      '..GgggG.....',
      '.GggyggG....',
      '.GgyyygG....',
      '.GggyggG.ww.',
      '..GgggG.wwws',
      '...GGG..wwss',
      '.........ss.',
      '............',
      '.tt......tt.',
      '..ttt..ttt..',
      '....tt.tt...',
    ],
  },
  MESA: {
    palette: { w: '#f8f0da', t: '#3fa7a0', o: '#ff8a3d', R: '#c8693f', r: '#a8401d' },
    rows: [
      '............',
      '.....ww.....',
      '....wttw....',
      '....wwww....',
      '...w.oo.w...',
      '.....oo.....',
      '............',
      '.tttttttttt.',
      '.RRRRRRRRRR.',
      'RRrRRRRrRRRR',
      'RRRrRRRRRrRR',
      'RRRRRRRRRRRR',
    ],
  },
  MESAAI: {
    palette: { w: '#f8f0da', t: '#3fa7a0', c: '#5eead4', k: '#2ec4a6', R: '#c8693f', r: '#a8401d' },
    rows: [
      'c...........',
      '.k..........',
      '..c.........',
      '...k....w...',
      '....c..wtw..',
      '.....kwwwww.',
      '......w...w.',
      '.tttttttttt.',
      '.RRRRRRRRRR.',
      'RRrRRRRrRRRR',
      'RRRrRRRRRrRR',
      'RRRRRRRRRRRR',
    ],
  },
};

const SIZE = 12;

/**
 * Paint one icon into a canvas at 1 canvas pixel per icon pixel; CSS scales it up
 * with `image-rendering: pixelated`.
 * @param {string} id
 * @returns {HTMLCanvasElement}
 */
export function iconCanvas(id) {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  c.className = 'cart-icon';
  c.setAttribute('aria-hidden', 'true');
  const icon = ICONS[id];
  const ctx = c.getContext('2d');
  if (!icon || !ctx) return c;
  icon.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = icon.palette[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return c;
}
