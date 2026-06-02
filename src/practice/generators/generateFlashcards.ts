// generateFlashcards — straight EN -> PL flashcards with example sentences.
//
// Algorithm:
//   1. De-dupe by EN word, take 6-12 cards (default 8).
//   2. Each card's `hue` is derived from a deterministic FNV-1a hash of the
//      EN word, mapped into [0, 360). Same word -> same hue across rerenders
//      and across users — UI stays stable.
//   3. If exampleEn / example_pl are missing we synthesise placeholders. This
//      is a stop-gap: ideally the EM Convex schema's `keywords` table should
//      surface canonical example sentences (see `keywords.exampleSentence`
//      field in the schema). When that lands, the placeholder branch should
//      go away.
//
// Tradeoffs:
//   - Hash-derived hue means similar words can collide on the colour wheel.
//     Acceptable for a 6-12 card deck; if collisions get distracting, run a
//     second pass that nudges adjacent hues apart by 30deg.

import { makeRng, hashString, shuffle, isDirectRun } from './rng';

export interface FlashcardsPuzzle {
  cards: Array<{
    en: string;
    pl: string;
    hue: number;
    ex: string;
    ex_pl: string;
  }>;
}

const DEFAULT_COUNT = 8;

export function generateFlashcards(
  input: Array<{ word: string; word_pl: string; exampleEn?: string; example_pl?: string }>,
  opts?: { count?: number; seed?: number },
): FlashcardsPuzzle {
  const count = Math.max(6, Math.min(12, opts?.count ?? DEFAULT_COUNT));
  const rng = makeRng(opts?.seed ?? 0xF1A5);

  const seen = new Set<string>();
  const pool: Array<{ word: string; word_pl: string; exampleEn?: string; example_pl?: string }> = [];
  for (const item of input) {
    const en = item.word.trim().toLowerCase();
    if (!en || seen.has(en) || !item.word_pl) continue;
    seen.add(en);
    pool.push({ ...item, word: en });
  }

  const picked = shuffle([...pool], rng).slice(0, Math.min(count, pool.length));

  return {
    cards: picked.map((c) => ({
      en: c.word,
      pl: c.word_pl,
      hue: hashString(c.word) % 360,
      ex: c.exampleEn ?? `In a sentence: "${c.word}"`,
      ex_pl: c.example_pl ?? `W zdaniu: "${c.word_pl}"`,
    })),
  };
}

// ---- inline self-test ------------------------------------------------------
if (isDirectRun('generateFlashcards.ts')) {
  const sample = [
    { word: 'morning', word_pl: 'rano',    exampleEn: 'Good morning.',     example_pl: 'Dzień dobry.' },
    { word: 'coffee',  word_pl: 'kawa',    exampleEn: 'A coffee, please.', example_pl: 'Poproszę kawę.' },
    { word: 'street',  word_pl: 'ulica' },
    { word: 'bridge',  word_pl: 'most',    exampleEn: 'Across the bridge.', example_pl: 'Przez most.' },
    { word: 'evening', word_pl: 'wieczór' },
    { word: 'window',  word_pl: 'okno' },
    { word: 'tower',   word_pl: 'wieża' },
    { word: 'plaza',   word_pl: 'plac' },
  ];
  const out = generateFlashcards(sample, { count: 6, seed: 9 });
  // eslint-disable-next-line no-console
  console.log(out);
}
