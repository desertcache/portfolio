// The classic 28×31 maze. Tile legend:
//   '#' wall   '.' dot   'o' energizer   '_' path without a dot
//   '=' ghost-house door   'H' house interior   ' ' void (outside the maze)
// Walls render as rounded contour lines (marching squares over wall tiles,
// inset 2px into the wall) — the same construction the original cabinet's
// tile art approximates, including the double-line outer border.
export const TILE = 8;
export const COLS = 28;
export const ROWS = 31;
export const MAZE_Y = 24; // three 8px HUD rows above the maze

const MAP = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##__________##.#     ',
  '     #.##_###==###_##.#     ',
  '######.##_#HHHHHH#_##.######',
  '______.___#HHHHHH#___.______',
  '######.##_#HHHHHH#_##.######',
  '     #.##_########_##.#     ',
  '     #.##__________##.#     ',
  '     #.##_########_##.#     ',
  '######.##_########_##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......__.......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];

// Ghosts may not turn upward in these tiles while in chase/scatter.
const RED_ZONE = new Set(['12,11', '13,11', '14,11', '15,11', '12,23', '13,23', '14,23', '15,23']);

export const DOOR_TILES = [{ col: 13, row: 12 }, { col: 14, row: 12 }];
export const HOUSE = {
  doorX: 14 * TILE, // pixel x of the door center
  doorRow: 12,
  centerY: MAZE_Y + 14.5 * TILE, // vertical center of the house interior
  slots: { blinky: 14 * TILE, pinky: 14 * TILE, inky: 12 * TILE, clyde: 16 * TILE },
};

export function createMaze() {
  const grid = MAP.map((row) => row.split(''));
  const dots = new Set();
  const energizers = new Set();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === '.') dots.add(`${c},${r}`);
      if (grid[r][c] === 'o') energizers.add(`${c},${r}`);
    }
  }
  const totalDots = dots.size + energizers.size; // 244 in the original

  function tileAt(col, row) {
    if (row < 0 || row >= ROWS) return ' ';
    if (col < 0 || col >= COLS) return row === 14 ? '_' : ' '; // tunnel wraps
    return grid[row][col];
  }

  const isWallChar = (ch) => ch === '#';

  return {
    grid,
    dots,
    energizers,
    totalDots,
    tileAt,

    // Pac-Man walks dots/energizer/plain-path tiles only.
    pacCanEnter(col, row) {
      const t = tileAt(col, row);
      return t === '.' || t === 'o' || t === '_';
    },
    // Ghosts additionally traverse the door and house interior.
    ghostCanEnter(col, row, { useDoor = false } = {}) {
      const t = tileAt(col, row);
      if (t === '=' || t === 'H') return useDoor;
      return t === '.' || t === 'o' || t === '_';
    },
    isRedZone(col, row) {
      return RED_ZONE.has(`${col},${row}`);
    },
    isTunnel(col, row) {
      return row === 14 && (col <= 5 || col >= 22);
    },

    eatAt(col, row) {
      const key = `${col},${row}`;
      if (dots.delete(key)) return 'dot';
      if (energizers.delete(key)) return 'energizer';
      return null;
    },
    get remaining() { return dots.size + energizers.size; },

    reset() {
      dots.clear();
      energizers.clear();
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] === '.') dots.add(`${c},${r}`);
          if (grid[r][c] === 'o') energizers.add(`${c},${r}`);
        }
      }
    },

    walls: prerenderWalls('#2121de'),
    wallsFlash: prerenderWalls('#f8f8ff'),

    drawDots(ctx, { blinkOn = true, color = '#ffb8ae' } = {}) {
      ctx.fillStyle = color;
      for (const key of dots) {
        const [c, r] = key.split(',').map(Number);
        ctx.fillRect(c * TILE + 3, MAZE_Y + r * TILE + 3, 2, 2);
      }
      if (blinkOn) {
        for (const key of energizers) {
          const [c, r] = key.split(',').map(Number);
          ctx.beginPath();
          ctx.arc(c * TILE + 4, MAZE_Y + r * TILE + 4, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  };

  // --- wall contour prerender ---
  function prerenderWalls(color) {
    const canvas = document.createElement('canvas');
    canvas.width = COLS * TILE;
    canvas.height = ROWS * TILE + MAZE_Y + 16;
    const ctx = canvas.getContext('2d');
    ctx.translate(0, MAZE_Y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    const wall = (c, r) => {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      const ch = grid[r][c];
      return isWallChar(ch) || ch === '='; // door participates in the contour
    };

    const IN = 2; // inset from tile boundary into the wall
    const R = 2; // corner radius

    ctx.beginPath();
    // Walk every tile-corner; each corner cell looks at its 2×2 neighborhood.
    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const tl = wall(c - 1, r - 1), tr = wall(c, r - 1);
        const bl = wall(c - 1, r), br = wall(c, r);
        const x = c * TILE, y = r * TILE;
        const n = (tl ? 8 : 0) | (tr ? 4 : 0) | (bl ? 2 : 0) | (br ? 1 : 0);

        switch (n) {
          case 0: case 15: break; // uniform: no boundary here

          // straight horizontal boundaries (wall below or above)
          case 3: line(x - 4, y + IN, x + 4, y + IN); break; // wall below
          case 12: line(x - 4, y - IN, x + 4, y - IN); break; // wall above
          // straight vertical boundaries (wall right or left)
          case 5: line(x + IN, y - 4, x + IN, y + 4); break; // wall right
          case 10: line(x - IN, y - 4, x - IN, y + 4); break; // wall left

          // single-wall corners (convex): tight arc hugging the wall tile
          case 1: corner(x + IN, y + 4, x + IN, y + IN, x + 4, y + IN); break; // BR wall
          case 2: corner(x - 4, y + IN, x - IN, y + IN, x - IN, y + 4); break; // BL wall
          case 4: corner(x + 4, y - IN, x + IN, y - IN, x + IN, y - 4); break; // TR wall
          case 8: corner(x - IN, y - 4, x - IN, y - IN, x - 4, y - IN); break; // TL wall

          // three-wall corners (concave): line wraps around the open tile
          case 7: concave(x, y, -1, -1); break; // open TL
          case 11: concave(x, y, 1, -1); break; // open TR
          case 13: concave(x, y, -1, 1); break; // open BL
          case 14: concave(x, y, 1, 1); break; // open BR

          // diagonal saddles: two independent convex corners
          case 6: // TR + BL walls
            corner(x + 4, y - IN, x + IN, y - IN, x + IN, y - 4);
            corner(x - 4, y + IN, x - IN, y + IN, x - IN, y + 4);
            break;
          case 9: // TL + BR walls
            corner(x - IN, y - 4, x - IN, y - IN, x - 4, y - IN);
            corner(x + IN, y + 4, x + IN, y + IN, x + 4, y + IN);
            break;
          default: break;
        }
      }
    }
    ctx.stroke();

    // Ghost-house door: pink bar replacing the wall line across the gap.
    ctx.fillStyle = '#ffb8ff';
    ctx.fillRect(13 * TILE, 12 * TILE + 3, 2 * TILE, 2);

    return canvas;

    function line(x0, y0, x1, y1) {
      ctx.moveTo(x0 + 0.5, y0 + 0.5);
      ctx.lineTo(x1 + 0.5, y1 + 0.5);
    }
    // Quarter arc via quadratic: from -> control -> to.
    function corner(x0, y0, cx, cy, x1, y1) {
      ctx.moveTo(x0 + 0.5, y0 + 0.5);
      ctx.quadraticCurveTo(cx + 0.5, cy + 0.5, x1 + 0.5, y1 + 0.5);
    }
    // Concave corner: the open tile sits in quadrant (sx, sy) relative to
    // the corner point; both wall lines are inset AWAY from the open tile
    // and joined by a small arc that wraps around it.
    function concave(x, y, sx, sy) {
      const lineX = x - sx * IN;
      const lineY = y - sy * IN;
      ctx.moveTo(x + sx * 4 + 0.5, lineY + 0.5);
      ctx.lineTo(lineX + sx * R + 0.5, lineY + 0.5);
      ctx.quadraticCurveTo(lineX + 0.5, lineY + 0.5, lineX + 0.5, lineY + sy * R + 0.5);
      ctx.lineTo(lineX + 0.5, y + sy * 4 + 0.5);
    }
  }
}
