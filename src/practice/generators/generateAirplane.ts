// generateAirplane — Aerodrome shell. The plane drifts across a twilight sky;
// 4 clouds enter from the right; player taps the cloud labelled with the
// correct option. 8 rounds matches a typical landing approach length.
import { generateWrapperPuzzle, type WrapperPuzzle, type WrapperInput } from './wrapperPuzzle';
import { isDirectRun } from './rng';

const DEFAULT_COUNT = 8;
const SEED_NS = 0xA12E; // "AIR" namespace (A12E = "AIR-PLANE" mnemonic)

export function generateAirplane(
  input: WrapperInput[],
  opts?: { count?: number; seed?: number },
): WrapperPuzzle | null {
  return generateWrapperPuzzle(input, {
    count: opts?.count ?? DEFAULT_COUNT,
    seed: (opts?.seed ?? 0xC1A0) ^ SEED_NS,
  });
}

if (isDirectRun('generateAirplane.ts')) {
  const sample: WrapperInput[] = [
    { word: 'cloud', word_pl: 'chmura', partOfSpeech: 'noun', exampleEn: 'A small cloud crossed the sun.' },
    { word: 'wing', word_pl: 'skrzydło', partOfSpeech: 'noun', exampleEn: 'The wing trembled in the wind.' },
    { word: 'runway', word_pl: 'pas startowy', partOfSpeech: 'noun', exampleEn: 'The runway was wet.' },
    { word: 'takeoff', word_pl: 'start', partOfSpeech: 'noun', exampleEn: 'A smooth takeoff.' },
    { word: 'altitude', word_pl: 'wysokość', partOfSpeech: 'noun', exampleEn: 'Cruising altitude.' },
    { word: 'descent', word_pl: 'opadanie', partOfSpeech: 'noun', exampleEn: 'The descent was bumpy.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateAirplane(sample, { count: 4, seed: 23 }), null, 2));
}
