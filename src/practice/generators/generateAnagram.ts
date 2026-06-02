// generateAnagram — pick scramble-worthy words and shuffle their letters.
//
// Algorithm:
//   1. Filter input by length (default 5-8 letters) and de-dupe.
//   2. Shuffle the candidate pool, take the first `count`.
//   3. For each word, Fisher-Yates shuffle the letters. If the shuffle ends
//      up identical to the original, swap the first two letters so the
//      player isn't handed the answer.
//
// Tradeoffs:
//   - We don't enforce "scramble distance" beyond not-equal, which keeps the
//     code simple. For short words (e.g. PEEP) the scramble can still be
//     trivial; pre-filter on uniqueLetters >= 3 if you care.
//   - Words with duplicated letters are fine — Fisher-Yates is stable on
//     duplicates and the equality check still works.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface AnagramPuzzle {
  word: string;
  word_pl: string;
  scrambledLetters: string[];
  hint: string;
}

const DEFAULT_COUNT = 5;
const DEFAULT_MIN = 5;
const DEFAULT_MAX = 8;

export function generateAnagram(
  input: Array<{ word: string; word_pl: string; clue?: string }>,
  opts?: { count?: number; minLength?: number; maxLength?: number; seed?: number },
): AnagramPuzzle[] {
  const count = opts?.count ?? DEFAULT_COUNT;
  const minLen = opts?.minLength ?? DEFAULT_MIN;
  const maxLen = opts?.maxLength ?? DEFAULT_MAX;
  const rng = makeRng(opts?.seed ?? 0xA1A6);

  const seen = new Set<string>();
  const pool: Array<{ word: string; word_pl: string; clue?: string }> = [];
  for (const item of input) {
    const w = item.word.toUpperCase().replace(/[^A-Z]/g, '');
    if (!w || w.length < minLen || w.length > maxLen) continue;
    // Need at least 2 distinct letters or there's no scramble to make.
    if (new Set(w).size < 2) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    pool.push({ word: w, word_pl: item.word_pl, clue: item.clue });
  }

  const picked = shuffle([...pool], rng).slice(0, Math.min(count, pool.length));

  return picked.map(({ word, word_pl, clue }) => {
    const letters = word.split('');
    let scrambled = shuffle([...letters], rng);
    if (scrambled.join('') === word) {
      // Guarantee a non-trivial scramble by swapping any two distinct positions.
      for (let i = 1; i < scrambled.length; i++) {
        if (scrambled[i] !== scrambled[0]) {
          [scrambled[0], scrambled[i]] = [scrambled[i], scrambled[0]];
          break;
        }
      }
    }
    return {
      word,
      word_pl,
      scrambledLetters: scrambled,
      hint: clue ?? `Polish: ${word_pl}`,
    };
  });
}

// ---- inline self-test ------------------------------------------------------
if (isDirectRun('generateAnagram.ts')) {
  const sample = [
    { word: 'BRIDGE', word_pl: 'most', clue: 'Crosses a river.' },
    { word: 'METRO',  word_pl: 'metro', clue: 'Underground train.' },
    { word: 'STREET', word_pl: 'ulica', clue: 'Road through town.' },
    { word: 'WINDOW', word_pl: 'okno' },
    { word: 'COFFEE', word_pl: 'kawa' },
    { word: 'AVENUE', word_pl: 'aleja' },
    { word: 'AT',     word_pl: 'przy' }, // too short — should be filtered
    { word: 'XX',     word_pl: 'xx' },   // not enough distinct letters
  ];
  const out = generateAnagram(sample, { count: 5, seed: 7 });
  // eslint-disable-next-line no-console
  console.log(out);
}
