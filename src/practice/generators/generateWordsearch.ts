// generateWordsearch — place words in a square grid + fill noise.
//
// Algorithm:
//   1. Choose 5-8 words from the input (default 7), normalise to UPPERCASE.
//   2. For each word, attempt up to MAX_TRIES random placements with a
//      direction picked from the allowed set for the difficulty level.
//      Validate: stays in bounds, every cell either empty or matches the
//      letter we want to write (so words may share letters at intersections).
//   3. After all words are placed, fill remaining empty cells with random
//      letters drawn from a frequency-weighted bag built from the actual
//      word letters — keeps the noise looking plausible.
//   4. After noise is placed, scan rows/cols/diagonals for any "word from the
//      list" the player might match by accident along a non-placed line, and
//      mutate one offending cell if found. Cheap heuristic, not exhaustive.
//
// Tradeoffs:
//   - Random placement with retry; not optimal packing.
//   - We index the player-placed direction as one of 8 cardinal directions
//     (right, down, diag-down, diag-up, plus their reverses). Output reports
//     the same `dir` strings the shell expects (we kept the canonical set
//     small — Wordsearch.tsx uses start/end coordinates, but per the spec we
//     emit (row, col, dir) for the upstream Convex layer to translate).

import { makeRng, shuffle, isDirectRun } from './rng';

export type WSDir =
  | 'right'
  | 'down'
  | 'diag-down'
  | 'diag-up'
  | 'left'
  | 'up'
  | 'diag-down-left'
  | 'diag-up-left';

export interface WordsearchPuzzle {
  size: number;
  grid: string[][];
  words: Array<{
    word: string;
    word_pl: string;
    row: number;
    col: number;
    dir: WSDir;
  }>;
}

const DIR_DELTA: Record<WSDir, [number, number]> = {
  right:           [0, 1],
  down:            [1, 0],
  'diag-down':     [1, 1],
  'diag-up':       [-1, 1],
  left:            [0, -1],
  up:              [-1, 0],
  'diag-down-left': [1, -1],
  'diag-up-left':   [-1, -1],
};

const EASY_DIRS:   WSDir[] = ['right', 'down'];
const MEDIUM_DIRS: WSDir[] = ['right', 'down', 'diag-down', 'diag-up'];
const HARD_DIRS:   WSDir[] = ['right', 'down', 'diag-down', 'diag-up', 'left', 'up', 'diag-down-left', 'diag-up-left'];

const DEFAULT_SIZE = 11;
const MAX_TRIES_PER_WORD = 100;

export function generateWordsearch(
  input: Array<{ word: string; word_pl: string }>,
  opts?: { gridSize?: number; difficulty?: 'easy' | 'medium' | 'hard'; count?: number; seed?: number },
): WordsearchPuzzle {
  const size = opts?.gridSize ?? DEFAULT_SIZE;
  const difficulty = opts?.difficulty ?? 'medium';
  const count = opts?.count ?? 7;
  const rng = makeRng(opts?.seed ?? 0xCAFEBABE);

  const dirs = difficulty === 'easy' ? EASY_DIRS : difficulty === 'medium' ? MEDIUM_DIRS : HARD_DIRS;

  // Normalise & filter to words that fit on the grid.
  const seen = new Set<string>();
  const norm: Array<{ word: string; word_pl: string }> = [];
  for (const item of input) {
    const w = item.word.toUpperCase().replace(/[^A-Z]/g, '');
    if (!w || w.length < 3 || w.length > size || seen.has(w)) continue;
    seen.add(w);
    norm.push({ word: w, word_pl: item.word_pl });
  }
  const chosen = shuffle([...norm], rng).slice(0, Math.min(count, norm.length));
  // Place longest first — gives easier early placements room.
  chosen.sort((a, b) => b.word.length - a.word.length);

  const grid: string[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ''),
  );
  const placed: WordsearchPuzzle['words'] = [];

  for (const { word, word_pl } of chosen) {
    let landed: { row: number; col: number; dir: WSDir } | null = null;
    for (let t = 0; t < MAX_TRIES_PER_WORD; t++) {
      const dir = dirs[Math.floor(rng() * dirs.length)];
      const [dr, dc] = DIR_DELTA[dir];
      // Pick start so the whole word stays in bounds.
      const minR = dr < 0 ? -(dr) * (word.length - 1) : 0;
      const maxR = dr > 0 ? size - 1 - dr * (word.length - 1) : size - 1;
      const minC = dc < 0 ? -(dc) * (word.length - 1) : 0;
      const maxC = dc > 0 ? size - 1 - dc * (word.length - 1) : size - 1;
      if (minR > maxR || minC > maxC) continue;
      const row = minR + Math.floor(rng() * (maxR - minR + 1));
      const col = minC + Math.floor(rng() * (maxC - minC + 1));
      if (canPlace(grid, word, row, col, dr, dc)) {
        write(grid, word, row, col, dr, dc);
        landed = { row, col, dir };
        break;
      }
    }
    if (landed) placed.push({ word, word_pl, ...landed });
  }

  // Build a frequency-weighted noise bag from placed letters (fallback to
  // English-frequency string if grid is empty).
  let bag = '';
  for (const row of grid) for (const ch of row) if (ch) bag += ch;
  if (bag.length === 0) bag = 'ETAOINSRHLDCUMWFGYPBVKJXQZ';

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '') {
        grid[r][c] = bag[Math.floor(rng() * bag.length)];
      }
    }
  }

  // Cheap accidental-word sweep: for each placed word, scan all 8 directions
  // for any other unintended copy of that word and mutate one of its noise
  // cells. We only check word strings already in the puzzle (the player will
  // only act on those).
  scrubAccidentals(grid, size, placed.map((p) => p.word), placed, rng, bag);

  return { size, grid, words: placed };
}

// ---- helpers ---------------------------------------------------------------

function canPlace(
  grid: string[][],
  word: string,
  row: number,
  col: number,
  dr: number,
  dc: number,
): boolean {
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const cell = grid[r][c];
    if (cell !== '' && cell !== word[i]) return false;
  }
  return true;
}

function write(
  grid: string[][],
  word: string,
  row: number,
  col: number,
  dr: number,
  dc: number,
): void {
  for (let i = 0; i < word.length; i++) {
    grid[row + dr * i][col + dc * i] = word[i];
  }
}

function isPlacedCell(
  r: number,
  c: number,
  placed: WordsearchPuzzle['words'],
): boolean {
  for (const p of placed) {
    const [dr, dc] = DIR_DELTA[p.dir];
    for (let i = 0; i < p.word.length; i++) {
      if (p.row + dr * i === r && p.col + dc * i === c) return true;
    }
  }
  return false;
}

function scrubAccidentals(
  grid: string[][],
  size: number,
  words: string[],
  placed: WordsearchPuzzle['words'],
  rng: () => number,
  bag: string,
): void {
  const dirs = Object.values(DIR_DELTA);
  let safety = 0;
  let mutated = true;
  while (mutated && safety++ < 5) {
    mutated = false;
    for (const w of words) {
      let count = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          for (const [dr, dc] of dirs) {
            const endR = r + dr * (w.length - 1);
            const endC = c + dc * (w.length - 1);
            if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
            let match = true;
            for (let i = 0; i < w.length; i++) {
              if (grid[r + dr * i][c + dc * i] !== w[i]) { match = false; break; }
            }
            if (!match) continue;
            count += 1;
            if (count > 1) {
              // This is an accidental copy — mutate one of its non-placed cells.
              for (let i = 0; i < w.length; i++) {
                const cr = r + dr * i;
                const cc = c + dc * i;
                if (!isPlacedCell(cr, cc, placed)) {
                  // Pick a different letter.
                  let next = grid[cr][cc];
                  for (let attempt = 0; attempt < 10 && next === grid[cr][cc]; attempt++) {
                    next = bag[Math.floor(rng() * bag.length)];
                  }
                  grid[cr][cc] = next;
                  mutated = true;
                  break;
                }
              }
            }
          }
        }
      }
    }
  }
}

// ---- inline self-test ------------------------------------------------------
if (isDirectRun('generateWordsearch.ts')) {
  const sample = [
    { word: 'metro',    word_pl: 'metro' },
    { word: 'bridge',   word_pl: 'most' },
    { word: 'street',   word_pl: 'ulica' },
    { word: 'square',   word_pl: 'plac' },
    { word: 'avenue',   word_pl: 'aleja' },
    { word: 'tower',    word_pl: 'wieża' },
    { word: 'gate',     word_pl: 'brama' },
    { word: 'plaza',    word_pl: 'plac' },
  ];
  const p = generateWordsearch(sample, { gridSize: 11, difficulty: 'medium', seed: 1 });
  // eslint-disable-next-line no-console
  console.log(p.words);
  // eslint-disable-next-line no-console
  console.log(p.grid.map((row) => row.join(' ')).join('\n'));
}
