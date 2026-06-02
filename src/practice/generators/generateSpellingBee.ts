// generateSpellingBee — pick longer words from the input pool to spell aloud
// (and type). Filters out short words and items lacking an audio_url where
// possible, then shuffles deterministically.
//
// Output shape mirrors the shell's interface so the adapter can pass through.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface SpellingBeeWord {
  id: string;
  word: string;
  audio_url?: string;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface SpellingBeePuzzle {
  words: SpellingBeeWord[];
}

export interface SpellingBeeInput {
  word: string;
  word_pl: string;
  partOfSpeech?: string;
  audio_url?: string;
  exampleEn?: string;
  exerciseId?: string;
}

const DEFAULT_COUNT = 8;
const MIN_LEN = 4;

export function generateSpellingBee(
  input: SpellingBeeInput[],
  opts?: { count?: number; minLength?: number; seed?: number },
): SpellingBeePuzzle | null {
  const count = opts?.count ?? DEFAULT_COUNT;
  const minLen = opts?.minLength ?? MIN_LEN;
  const rng = makeRng(opts?.seed ?? 0xBEEEEE);

  const seen = new Set<string>();
  const pool: SpellingBeeInput[] = [];
  for (const it of input) {
    const w = it.word?.trim().toLowerCase();
    if (!w || seen.has(w)) continue;
    if (w.length < minLen) continue;
    if (!/^[a-zA-Z\-' ]+$/.test(it.word)) continue;
    seen.add(w);
    pool.push(it);
  }
  if (pool.length === 0) return null;

  // Prefer words with an audio_url; we fall back to silence + clue otherwise.
  const withAudio = pool.filter((p) => p.audio_url);
  const ranked = [
    ...shuffle([...withAudio], rng),
    ...shuffle([...pool.filter((p) => !p.audio_url)], rng),
  ];

  const picked = ranked.slice(0, Math.min(count, ranked.length));

  return {
    words: picked.map((p) => ({
      id: p.word.toLowerCase(),
      word: p.word.toLowerCase(),
      audio_url: p.audio_url,
      hint: p.exampleEn ? `Used in: "${p.exampleEn}"` : `A ${p.partOfSpeech ?? 'word'}.`,
      hint_pl: `Po polsku: ${p.word_pl}.`,
      exerciseId: p.exerciseId,
    })),
  };
}

// ---- inline self-test ------------------------------------------------------
if (isDirectRun('generateSpellingBee.ts')) {
  const sample: SpellingBeeInput[] = [
    { word: 'rhythm',    word_pl: 'rytm' },
    { word: 'definitely',word_pl: 'zdecydowanie' },
    { word: 'separate',  word_pl: 'oddzielny' },
    { word: 'occasion',  word_pl: 'okazja' },
    { word: 'embarrass', word_pl: 'zawstydzić' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateSpellingBee(sample, { seed: 7 }), null, 2));
}
