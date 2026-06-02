// generateFlyingFruit — Orchard Square. Continuous bezier-motion shell where
// fruits float across screen along arc paths; player taps the correct fruit.
// 8 rounds — orchard scenes can support a longer rhythm because the motion
// itself entertains.
import { generateWrapperPuzzle, type WrapperPuzzle, type WrapperInput } from './wrapperPuzzle';
import { isDirectRun } from './rng';

const DEFAULT_COUNT = 8;
const SEED_NS = 0xF0017; // "FRUIT" namespace

export function generateFlyingFruit(
  input: WrapperInput[],
  opts?: { count?: number; seed?: number },
): WrapperPuzzle | null {
  return generateWrapperPuzzle(input, {
    count: opts?.count ?? DEFAULT_COUNT,
    seed: (opts?.seed ?? 0xC1A0) ^ SEED_NS,
  });
}

if (isDirectRun('generateFlyingFruit.ts')) {
  const sample: WrapperInput[] = [
    { word: 'apple', word_pl: 'jabłko', partOfSpeech: 'noun', exampleEn: 'A crunchy apple.' },
    { word: 'pear', word_pl: 'gruszka', partOfSpeech: 'noun', exampleEn: 'A ripe pear.' },
    { word: 'plum', word_pl: 'śliwka', partOfSpeech: 'noun', exampleEn: 'A purple plum.' },
    { word: 'cherry', word_pl: 'wiśnia', partOfSpeech: 'noun', exampleEn: 'A bowl of cherry.' },
    { word: 'grape', word_pl: 'winogrono', partOfSpeech: 'noun', exampleEn: 'A small grape.' },
    { word: 'lemon', word_pl: 'cytryna', partOfSpeech: 'noun', exampleEn: 'A sharp lemon.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateFlyingFruit(sample, { count: 4, seed: 29 }), null, 2));
}
