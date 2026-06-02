// generateRandomWheel — Spinner Stand. The wheel has N wedges; player spins,
// answers the wedge it lands on. 6 default — a 6-wedge wheel reads cleanly at
// laptop and phone sizes. We don't expose wedge categories here — the wedges
// just hold round indices; categorisation belongs to a future enrichment pass.
import { generateWrapperPuzzle, type WrapperPuzzle, type WrapperInput } from './wrapperPuzzle';
import { isDirectRun } from './rng';

const DEFAULT_COUNT = 6;
const SEED_NS = 0x5710; // "SPIN" namespace (5710 = SPIN with leetspeak digits)

export function generateRandomWheel(
  input: WrapperInput[],
  opts?: { count?: number; seed?: number },
): WrapperPuzzle | null {
  return generateWrapperPuzzle(input, {
    count: opts?.count ?? DEFAULT_COUNT,
    seed: (opts?.seed ?? 0xC1A0) ^ SEED_NS,
  });
}

if (isDirectRun('generateRandomWheel.ts')) {
  const sample: WrapperInput[] = [
    { word: 'wheel', word_pl: 'koło', partOfSpeech: 'noun', exampleEn: 'Spin the wheel.' },
    { word: 'prize', word_pl: 'nagroda', partOfSpeech: 'noun', exampleEn: 'A small prize.' },
    { word: 'lucky', word_pl: 'szczęśliwy', partOfSpeech: 'adj', exampleEn: 'A lucky number.' },
    { word: 'arrow', word_pl: 'strzałka', partOfSpeech: 'noun', exampleEn: 'The arrow points up.' },
    { word: 'kiosk', word_pl: 'kiosk', partOfSpeech: 'noun', exampleEn: 'A kiosk on the corner.' },
    { word: 'crowd', word_pl: 'tłum', partOfSpeech: 'noun', exampleEn: 'A small crowd gathered.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateRandomWheel(sample, { count: 4, seed: 17 }), null, 2));
}
