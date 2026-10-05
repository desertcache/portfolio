// The thinking panel's one-line read: a plain-English account of the move the
// search currently prefers, worked out from the board and the search's score
// (never canned flavor text).
import { COLS, ROWS, WIN, PROVEN } from './engine.js';

export function explain(board, me, col, score, { blundered = false, done = false } = {}) {
  if (col == null || col < 0) return '';
  const you = 3 - me;
  const C = col + 1;
  if (blundered) return `Easy mode: playing a hunch in column ${C}`;
  if (board.wouldWin(col, me)) return `Taking the win in column ${C}`;
  if (board.wouldWin(col, you)) {
    let n = 0;
    for (let c = 0; c < COLS; c++) if (board.wouldWin(c, you)) n++;
    return n >= 2 ? `You have two wins open. Blocking column ${C}` : `Blocking your three in column ${C}`;
  }
  if (score != null && score >= PROVEN) {
    const moves = Math.ceil((WIN - score - board.ply) / 2);
    return `Forced win found: ${moves} move${moves === 1 ? '' : 's'} away`;
  }
  if (score != null && score <= -PROVEN) {
    const moves = Math.ceil((WIN + score - board.ply) / 2);
    return `You can force a win in ${moves}. Making you find it`;
  }

  const mineBefore = board.threatCells(me).length;
  const yoursBefore = board.threatCells(you).length;
  const yourTwosBefore = board.openLines(you, 2);
  board.play(col, me);
  let immediate = 0;
  for (let c = 0; c < COLS; c++) if (board.wouldWin(c, me)) immediate++;
  const mineAfter = board.threatCells(me).length;
  const yoursAfter = board.threatCells(you).length;
  const yourTwosAfter = board.openLines(you, 2);
  board.undo(col);

  if (immediate >= 2) return 'Double threat: you can only block one';
  if (mineAfter > mineBefore && mineAfter >= 2) return 'Setting up a double threat';
  if (yoursAfter < yoursBefore) return `Cutting off your three in column ${C}`;
  if (mineAfter > mineBefore) return `Building a three in column ${C}`;
  // A column the search is steering clear of because it would lift you to a win.
  for (const c of [3, 2, 4, 1, 5, 0, 6]) {
    const r = board.h[c];
    if (c !== col && r + 1 < ROWS && board.isWinCell(c * ROWS + r + 1, you)) {
      return `Staying out of column ${c + 1}: it sets up your win`;
    }
  }
  if (yourTwosAfter <= yourTwosBefore - 2) return `Breaking up your twos in column ${C}`;
  if (board.ply < 2 && col === 3) return 'Center column: it reaches the most fours';
  if (score != null && score > 40) return `Pressing an edge in column ${C}`;
  if (score != null && score < -40) return `Under pressure, holding column ${C}`;
  return done ? `Even game. Column ${C} keeps options open` : `Leaning toward column ${C}`;
}
