// generateConcentration — memory-pair grid. 6 pairs (12 cards) by default —
// the cellar's wooden card-table comfortably renders 4×3.
//
// Thin wrapper — defers to generateWrapperPuzzle. Each round becomes one pair:
// prompt-card + correct-answer-card. Distractors are not used by the shell
// (memory pairing only requires the prompt + the correct option) but they're
// preserved on the round so the same data can be replayed in another shell.
import { generateWrapperPuzzle, type WrapperPuzzle, type WrapperInput } from './wrapperPuzzle';
import { isDirectRun } from './rng';

const DEFAULT_COUNT = 6;
const SEED_NS = 0xC0CE; // "CONC" namespace

export function generateConcentration(
  input: WrapperInput[],
  opts?: { count?: number; seed?: number },
): WrapperPuzzle | null {
  return generateWrapperPuzzle(input, {
    count: opts?.count ?? DEFAULT_COUNT,
    seed: (opts?.seed ?? 0xC1A0) ^ SEED_NS,
  });
}

if (isDirectRun('generateConcentration.ts')) {
  const sample: WrapperInput[] = [
    { word: 'cellar', word_pl: 'piwnica', partOfSpeech: 'noun', exampleEn: 'A cool cellar holds the wine.' },
    { word: 'lamp', word_pl: 'lampa', partOfSpeech: 'noun', exampleEn: 'The lamp flickers.' },
    { word: 'memory', word_pl: 'pamięć', partOfSpeech: 'noun', exampleEn: 'A long memory keeps you safe.' },
    { word: 'pair', word_pl: 'para', partOfSpeech: 'noun', exampleEn: 'Find the matching pair.' },
    { word: 'oak', word_pl: 'dąb', partOfSpeech: 'noun', exampleEn: 'A heavy oak table.' },
    { word: 'shadow', word_pl: 'cień', partOfSpeech: 'noun', exampleEn: 'A shadow on the wall.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateConcentration(sample, { count: 4, seed: 9 }), null, 2));
}
