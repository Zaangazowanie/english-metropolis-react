// generateUnjumble — words of a sentence shuffled, drag to reorder.
//
// Algorithm:
//   1. Pick 3-5 example sentences from the vocab pool.
//   2. For each, tokenise on whitespace, store the correct order, and emit
//      the words in shuffled order (the shell shows them shuffled and the
//      student drags into the correct order).
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface UnjumbleSentence {
  id: string;
  /** The words in the order the player sees them (shuffled). */
  words: string[];
  /** Indices into `words` in the order they should be assembled. */
  correct_order: number[];
  /** The intended hint to point the player at the right structure. */
  hint: string;
  hint_pl: string;
  /** Polish translation of the assembled sentence — used for the "show
   *  translation" toggle. */
  translation_pl?: string;
  exerciseId?: string;
}

export interface UnjumblePuzzle {
  items: UnjumbleSentence[];
}

export interface UnjumbleInput {
  word: string;
  word_pl: string;
  example?: string;
  example_pl?: string;
  partOfSpeech?: string;
  exerciseId?: string;
}

const DEFAULT_ITEMS = 4;

function tokenise(sentence: string): string[] {
  // Split on whitespace, keep punctuation glued to the previous word so
  // "Open the window." → ["Open", "the", "window."] (3 tokens, not 4).
  return sentence.trim().split(/\s+/).filter(Boolean);
}

export function generateUnjumblePuzzle(
  input: UnjumbleInput[],
  opts?: { numItems?: number; seed?: number },
): UnjumblePuzzle | null {
  const num = Math.max(2, Math.min(8, opts?.numItems ?? DEFAULT_ITEMS));
  const rng = makeRng(opts?.seed ?? 0xC04E);

  const seen = new Set<string>();
  const cleaned: UnjumbleInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    cleaned.push(it);
  }
  if (cleaned.length < 3) return null;

  // Filter to items whose example has 3-9 words (good unjumble length).
  const candidates = cleaned.filter((c) => {
    if (!c.example) return false;
    const tokens = tokenise(c.example);
    return tokens.length >= 3 && tokens.length <= 9;
  });
  if (candidates.length < 2) return null;

  const picked = shuffle([...candidates], rng).slice(0, num);

  const items: UnjumbleSentence[] = picked.map((target, i) => {
    const correctTokens = tokenise(target.example!);
    // Build a permutation of indices [0..N-1] then shuffle.
    const indices = correctTokens.map((_, idx) => idx);
    // Keep shuffling until it's not the identity (else the puzzle is solved).
    let shuffledIdx = shuffle([...indices], rng);
    let attempts = 0;
    while (shuffledIdx.every((v, k) => v === k) && attempts < 10) {
      shuffledIdx = shuffle([...indices], rng);
      attempts++;
    }
    // `words[k]` shown to player = correctTokens[shuffledIdx[k]]
    const wordsShown = shuffledIdx.map((origIdx) => correctTokens[origIdx]);
    // correct_order: indices into wordsShown, in the order they form the
    // intended sentence. shuffledIdx[k] == originalIndex; we need the inverse:
    // for each originalIndex, find its position in shuffledIdx.
    const correct_order: number[] = correctTokens.map((_, origIdx) =>
      shuffledIdx.indexOf(origIdx),
    );
    return {
      id: `uj-${i}-${target.word}`,
      words: wordsShown,
      correct_order,
      hint: `Use "${target.word}" — ${target.partOfSpeech ?? 'word'}.`,
      hint_pl: target.word_pl
        ? `Użyj słowa "${target.word_pl}" — ${target.partOfSpeech ?? 'słowo'}.`
        : 'Ułóż zdanie w odpowiedniej kolejności.',
      translation_pl: target.example_pl,
      exerciseId: target.exerciseId,
    };
  });

  return { items };
}

if (isDirectRun('generateUnjumble.ts')) {
  const sample: UnjumbleInput[] = [
    { word: 'coffee',  word_pl: 'kawa',     example: 'A coffee, please.', example_pl: 'Poproszę kawę.', partOfSpeech: 'noun' },
    { word: 'window',  word_pl: 'okno',     example: 'Open the window.',  example_pl: 'Otwórz okno.',  partOfSpeech: 'noun' },
    { word: 'morning', word_pl: 'rano',     example: 'Good morning to you.', example_pl: 'Dzień dobry tobie.', partOfSpeech: 'noun' },
    { word: 'street',  word_pl: 'ulica',    example: 'I live on this street.', example_pl: 'Mieszkam na tej ulicy.', partOfSpeech: 'noun' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateUnjumblePuzzle(sample, { seed: 27 }), null, 2));
}
