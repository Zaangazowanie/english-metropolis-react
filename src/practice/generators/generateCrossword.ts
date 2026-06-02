// generateCrossword — pack a vocab list into a crossword grid.
//
// Algorithm:
//   1. Sort input by word length (longest first) for the seed placement.
//   2. Place the longest word horizontally near the middle of the grid.
//   3. For each remaining candidate, scan every placed cell for a matching letter
//      and try every "this letter of the candidate hits that placed cell"
//      perpendicular crossing. Validate each candidate placement:
//        - Stays in bounds.
//        - Every cell either matches the existing letter or is empty.
//        - The cells immediately before/after the new word are empty (no
//          accidental word extension into adjacent placed letters).
//        - Every NEW (non-crossing) cell has empty perpendicular neighbours
//          (no accidental parallel word formed by sticking two words side-by-side).
//   4. A word that can't be placed is skipped.
//   5. Rejection sampling: try several random orderings (after the longest
//      seed) and keep the densest result (most words placed, ties broken by
//      most crossings).
//
// Tradeoffs:
//   - Greedy + rejection-sampled, not optimal. Generates a usable layout in
//     <10ms for 30 candidates on a 12x12 grid.
//   - Output coordinates are 0-indexed (matches CWPuzzle convention used by
//     buildCells in Crossword.tsx — that helper just expects integer row/col).

import { makeRng, shuffle, isDirectRun } from './rng';

export interface CrosswordWord {
  word: string;
  clue: string;
  clue_pl: string;
}

export interface CrosswordPuzzle {
  size: number;
  words: Array<{
    id: number;
    dir: 'across' | 'down';
    row: number;
    col: number;
    answer: string;
    clue: string;
    clue_pl: string;
  }>;
}

interface PlacedWord {
  answer: string;
  clue: string;
  clue_pl: string;
  dir: 'across' | 'down';
  row: number;
  col: number;
}

interface AttemptResult {
  placed: PlacedWord[];
  crossings: number;
}

const DEFAULT_GRID = 12;
const DEFAULT_MAX_WORDS = 12;
const TRIES = 50;

export function generateCrossword(
  input: CrosswordWord[],
  opts?: { gridSize?: number; maxWords?: number; seed?: number },
): CrosswordPuzzle {
  const size = opts?.gridSize ?? DEFAULT_GRID;
  const maxWords = opts?.maxWords ?? DEFAULT_MAX_WORDS;
  const baseSeed = opts?.seed ?? 0xC40551;

  // Normalise to upper-case ASCII letters and de-dupe.
  const seen = new Set<string>();
  const candidates: CrosswordWord[] = [];
  for (const w of input) {
    const norm = w.word.toUpperCase().replace(/[^A-Z]/g, '');
    if (!norm || norm.length < 3 || norm.length > size || seen.has(norm)) continue;
    seen.add(norm);
    candidates.push({ word: norm, clue: w.clue, clue_pl: w.clue_pl });
  }
  if (candidates.length === 0) return { size, words: [] };

  candidates.sort((a, b) => b.word.length - a.word.length);
  const longest = candidates[0];
  const rest = candidates.slice(1);

  let best: AttemptResult = { placed: [], crossings: 0 };

  for (let attempt = 0; attempt < TRIES; attempt++) {
    const rng = makeRng(baseSeed + attempt);
    const order = shuffle([...rest], rng);

    const grid: string[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ''),
    );

    const seedRow = Math.floor(size / 2);
    const seedCol = Math.max(0, Math.floor((size - longest.word.length) / 2));
    if (seedCol + longest.word.length > size) continue;
    placeWord(grid, longest.word, seedRow, seedCol, 'across');
    const placed: PlacedWord[] = [
      {
        answer: longest.word,
        clue: longest.clue,
        clue_pl: longest.clue_pl,
        dir: 'across',
        row: seedRow,
        col: seedCol,
      },
    ];
    let crossings = 0;

    for (const cand of order) {
      if (placed.length >= maxWords) break;
      const spot = findPlacement(grid, size, cand.word);
      if (!spot) continue;
      placeWord(grid, cand.word, spot.row, spot.col, spot.dir);
      placed.push({
        answer: cand.word,
        clue: cand.clue,
        clue_pl: cand.clue_pl,
        dir: spot.dir,
        row: spot.row,
        col: spot.col,
      });
      crossings += spot.crossings;
    }

    if (
      placed.length > best.placed.length ||
      (placed.length === best.placed.length && crossings > best.crossings)
    ) {
      best = { placed, crossings };
    }

    // Early exit if we've packed everything.
    if (placed.length === Math.min(maxWords, candidates.length)) break;
  }

  return {
    size,
    words: best.placed.map((p, i) => ({
      id: i + 1,
      dir: p.dir,
      row: p.row,
      col: p.col,
      answer: p.answer,
      clue: p.clue,
      clue_pl: p.clue_pl,
    })),
  };
}

// ---- helpers ---------------------------------------------------------------

function placeWord(
  grid: string[][],
  word: string,
  row: number,
  col: number,
  dir: 'across' | 'down',
): void {
  for (let i = 0; i < word.length; i++) {
    const r = dir === 'across' ? row : row + i;
    const c = dir === 'across' ? col + i : col;
    grid[r][c] = word[i];
  }
}

interface Placement {
  row: number;
  col: number;
  dir: 'across' | 'down';
  crossings: number;
}

function findPlacement(grid: string[][], size: number, word: string): Placement | null {
  // Best-fit search: among all valid placements, pick the one with the most
  // crossings (ties broken by first-found).
  let best: Placement | null = null;
  for (let i = 0; i < word.length; i++) {
    const letter = word[i];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] !== letter) continue;
        // Try placing the word so that letter index `i` lands at (r,c).
        for (const dir of ['across', 'down'] as const) {
          const place = tryPlacement(grid, size, word, r, c, i, dir);
          if (place && (!best || place.crossings > best.crossings)) {
            best = place;
          }
        }
      }
    }
  }
  return best;
}

function tryPlacement(
  grid: string[][],
  size: number,
  word: string,
  hitR: number,
  hitC: number,
  hitIdx: number,
  dir: 'across' | 'down',
): Placement | null {
  const startR = dir === 'across' ? hitR : hitR - hitIdx;
  const startC = dir === 'across' ? hitC - hitIdx : hitC;
  const endR = dir === 'across' ? startR : startR + word.length - 1;
  const endC = dir === 'across' ? startC + word.length - 1 : startC;

  if (startR < 0 || startC < 0 || endR >= size || endC >= size) return null;

  // Cell immediately before / after the word must be blank or off-grid:
  // prevents extending an adjacent placed word.
  if (dir === 'across') {
    if (startC - 1 >= 0 && grid[startR][startC - 1] !== '') return null;
    if (endC + 1 < size && grid[startR][endC + 1] !== '') return null;
  } else {
    if (startR - 1 >= 0 && grid[startR - 1][startC] !== '') return null;
    if (endR + 1 < size && grid[endR + 1][startC] !== '') return null;
  }

  let crossings = 0;
  for (let i = 0; i < word.length; i++) {
    const r = dir === 'across' ? startR : startR + i;
    const c = dir === 'across' ? startC + i : startC;
    const cell = grid[r][c];

    if (cell === '') {
      // Empty cell — perpendicular neighbours must also be empty
      // (no parallel-adjacency that would form an unintended word).
      if (dir === 'across') {
        if (r - 1 >= 0 && grid[r - 1][c] !== '') return null;
        if (r + 1 < size && grid[r + 1][c] !== '') return null;
      } else {
        if (c - 1 >= 0 && grid[r][c - 1] !== '') return null;
        if (c + 1 < size && grid[r][c + 1] !== '') return null;
      }
    } else if (cell === word[i]) {
      crossings += 1;
    } else {
      return null;
    }
  }

  if (crossings === 0) return null; // Must intersect at least one placed word.
  return { row: startR, col: startC, dir, crossings };
}

// ---- inline self-test ------------------------------------------------------
// Runs only when the file is executed directly, NOT on import. Vite/SWC
// strip dead code paths so this is free at build time.
//
//   npx tsx src/practice/generators/generateCrossword.ts

if (isDirectRun('generateCrossword.ts')) {
  const sample: CrosswordWord[] = [
    { word: 'METRO', clue: 'Underground city train', clue_pl: 'kolej podziemna' },
    { word: 'TRAM', clue: 'Vehicle on rails', clue_pl: 'pojazd szynowy' },
    { word: 'BRIDGE', clue: 'Crosses a river', clue_pl: 'most' },
    { word: 'GATE', clue: 'Entrance', clue_pl: 'brama' },
    { word: 'AVENUE', clue: 'Wide tree-lined street', clue_pl: 'aleja' },
    { word: 'NIGHT', clue: 'When the city glows', clue_pl: 'noc' },
    { word: 'PLAZA', clue: 'Open public square', clue_pl: 'plac' },
    { word: 'TOWER', clue: 'Tall structure', clue_pl: 'wieża' },
    { word: 'MARKET', clue: 'Where vendors sell', clue_pl: 'targ' },
    { word: 'STREET', clue: 'A road through town', clue_pl: 'ulica' },
  ];
  const out = generateCrossword(sample, { gridSize: 12, maxWords: 10, seed: 42 });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
}
