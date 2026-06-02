// generateHangman — pick words by length + difficulty, returning an ARRAY of
// HangmanPuzzle (NOT wrapped in an object — matches the brief contract).
//
// Difficulty buckets:
//   easy:   4-6 ASCII letters
//   medium: 6-8 ASCII letters
//   hard:   8+ ASCII letters OR contains a "rare" letter (j/q/x/z)
//
// The function ASCII-folds for length/letter analysis but preserves the
// surface-form word for display, so "łatwo" can still appear in display while
// the comparison happens against "LATWO".
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface HangmanPuzzle {
  word: string;        // surface form for display ("łatwo", "BRIDGE")
  word_pl: string;     // Polish translation, shown as a clue
  hint?: string;       // English hint (e.g. clue text)
  hint_pl?: string;    // Polish hint (overrides word_pl when explicit hint exists)
  maxWrong: number;    // 6 stages of scaffolding by default
}

export interface HangmanInput {
  word: string;
  word_pl: string;
  clue?: string;
}

const DEFAULT_MAX_WRONG = 6;
const RARE_LETTERS = /[jqxz]/i;

function fold(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, '');
}

function passesDifficulty(playable: string, difficulty: 'easy' | 'medium' | 'hard'): boolean {
  if (difficulty === 'easy')   return playable.length >= 4 && playable.length <= 6;
  if (difficulty === 'medium') return playable.length >= 6 && playable.length <= 8;
  // hard: long OR rare-letter
  return playable.length >= 8 || RARE_LETTERS.test(playable);
}

export function generateHangman(
  input: HangmanInput[],
  opts?: { difficulty?: 'easy' | 'medium' | 'hard'; count?: number; seed?: number },
): HangmanPuzzle[] {
  const difficulty = opts?.difficulty ?? 'medium';
  const count = opts?.count ?? 6;
  const rng = makeRng(opts?.seed ?? 0xA47);

  const seen = new Set<string>();
  const pool: HangmanPuzzle[] = [];
  for (const item of input) {
    const playable = fold(item.word);
    if (playable.length < 3) continue;
    if (new Set(playable).size < 3) continue;     // need variety in letters
    if (!passesDifficulty(playable, difficulty)) continue;
    if (seen.has(playable)) continue;
    seen.add(playable);
    pool.push({
      word: item.word,
      word_pl: item.word_pl,
      hint: item.clue,
      hint_pl: item.clue ? undefined : item.word_pl,
      maxWrong: DEFAULT_MAX_WRONG,
    });
  }

  // Fallback — if filter removed everything, ignore difficulty and try again.
  if (pool.length === 0) {
    for (const item of input) {
      const playable = fold(item.word);
      if (playable.length < 3 || new Set(playable).size < 3) continue;
      if (seen.has(playable)) continue;
      seen.add(playable);
      pool.push({
        word: item.word,
        word_pl: item.word_pl,
        hint: item.clue,
        hint_pl: item.clue ? undefined : item.word_pl,
        maxWrong: DEFAULT_MAX_WRONG,
      });
    }
  }

  return shuffle([...pool], rng).slice(0, Math.min(count, pool.length));
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline self-test.
// ─────────────────────────────────────────────────────────────────────────────
if (isDirectRun('generateHangman.ts')) {
  const sample: HangmanInput[] = [
    { word: 'bridge',  word_pl: 'most',     clue: 'It crosses a river.' },
    { word: 'avenue',  word_pl: 'aleja',    clue: 'A wide tree-lined street.' },
    { word: 'plaza',   word_pl: 'plac',     clue: 'An open public square.' },
    { word: 'tower',   word_pl: 'wieża' },
    { word: 'market',  word_pl: 'targ',     clue: 'Stalls of sellers and goods.' },
    { word: 'morning', word_pl: 'rano' },
    { word: 'jazz',    word_pl: 'jazz' },
    { word: 'quiz',    word_pl: 'quiz' },
  ];
  // eslint-disable-next-line no-console
  console.log('easy   →', generateHangman(sample, { difficulty: 'easy',   count: 3, seed: 1 }));
  // eslint-disable-next-line no-console
  console.log('medium →', generateHangman(sample, { difficulty: 'medium', count: 3, seed: 1 }));
  // eslint-disable-next-line no-console
  console.log('hard   →', generateHangman(sample, { difficulty: 'hard',   count: 3, seed: 1 }));
}
