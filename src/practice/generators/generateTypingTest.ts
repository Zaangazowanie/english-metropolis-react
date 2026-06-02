// generateTypingTest — assemble short telegraph-style phrases for a typing
// drill. The student types the phrase verbatim; we measure WPM + accuracy.
//
// Algorithm:
//   1. Filter input to items with an example sentence.
//   2. Trim each example to a teletype-friendly length (≤ 90 chars), ending
//      at the nearest punctuation boundary.
//   3. Pick `count` phrases. Default target_wpm scales with phrase length
//      so longer phrases don't punish the player.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface TypingTestPhrase {
  id: string;
  target_text: string;
  target_wpm: number;
  hint_pl: string;
  exerciseId?: string;
}

export interface TypingTestPuzzle {
  phrases: TypingTestPhrase[];
}

export interface TypingTestInput {
  word: string;
  word_pl: string;
  exampleEn?: string;
  exampleEn_pl?: string;
  exerciseId?: string;
}

const DEFAULT_COUNT = 5;
const MAX_LEN = 90;
const MIN_LEN = 24;

function trimToBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text.trim();
  const slice = text.slice(0, maxLen);
  const lastPunct = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf(', '), slice.lastIndexOf(' — '), slice.lastIndexOf('? '), slice.lastIndexOf('! '));
  if (lastPunct > 30) return slice.slice(0, lastPunct + 1).trim();
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 30 ? slice.slice(0, lastSpace) : slice).trim();
}

function targetWpmFor(text: string): number {
  // Roughly 22 wpm baseline + 0.06/char up to ~32 wpm at 100 chars.
  const wpm = Math.round(22 + Math.min(10, text.length * 0.10));
  return wpm;
}

export function generateTypingTest(
  input: TypingTestInput[],
  opts?: { count?: number; seed?: number },
): TypingTestPuzzle | null {
  const count = opts?.count ?? DEFAULT_COUNT;
  const rng = makeRng(opts?.seed ?? 0x77E1E6);

  const seen = new Set<string>();
  const pool: { phrase: string; src: TypingTestInput }[] = [];
  for (const it of input) {
    const ex = it.exampleEn?.trim();
    if (!ex || seen.has(ex)) continue;
    if (ex.length < MIN_LEN) continue;
    const phrase = trimToBoundary(ex, MAX_LEN);
    if (phrase.length < MIN_LEN) continue;
    seen.add(phrase);
    pool.push({ phrase, src: it });
  }
  if (pool.length === 0) return null;

  const picked = shuffle([...pool], rng).slice(0, Math.min(count, pool.length));
  const phrases: TypingTestPhrase[] = picked.map(({ phrase, src }, i) => ({
    id: `${src.word}-${i}`,
    target_text: phrase,
    target_wpm: targetWpmFor(phrase),
    hint_pl: src.exampleEn_pl ?? `Po polsku: ${src.word_pl}.`,
    exerciseId: src.exerciseId,
  }));

  return { phrases };
}

// ---- inline self-test ------------------------------------------------------
if (isDirectRun('generateTypingTest.ts')) {
  const sample: TypingTestInput[] = [
    { word: 'metro',  word_pl: 'metro',  exampleEn: 'Take the metro to the city centre after work.' },
    { word: 'bridge', word_pl: 'most',   exampleEn: 'We crossed the bridge at sunset and watched the river.' },
    { word: 'avenue', word_pl: 'aleja',  exampleEn: 'A wide avenue lined with linden trees ran down to the square.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateTypingTest(sample, { seed: 7 }), null, 2));
}
