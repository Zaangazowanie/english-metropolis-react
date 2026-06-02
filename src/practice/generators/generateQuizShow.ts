// generateQuizShow — TV gameshow rounds. 8 questions by default; the Quiz Show
// shell paces them with a dramatic per-round timer.
//
// Thin wrapper — defers to generateWrapperPuzzle, which itself defers to
// generateMultipleChoice. The seed namespace for this shell starts at 0xQ0
// so two shells fed the same vocab don't draw identical question orderings.
import { generateWrapperPuzzle, type WrapperPuzzle, type WrapperInput } from './wrapperPuzzle';
import { isDirectRun } from './rng';

const DEFAULT_COUNT = 8;
const SEED_NS = 0xC1502; // "QUIZ" namespace

export function generateQuizShow(
  input: WrapperInput[],
  opts?: { count?: number; seed?: number },
): WrapperPuzzle | null {
  return generateWrapperPuzzle(input, {
    count: opts?.count ?? DEFAULT_COUNT,
    seed: (opts?.seed ?? 0xC1A0) ^ SEED_NS,
  });
}

if (isDirectRun('generateQuizShow.ts')) {
  const sample: WrapperInput[] = [
    { word: 'host', word_pl: 'gospodarz', partOfSpeech: 'noun', exampleEn: 'The host welcomed the players.' },
    { word: 'guest', word_pl: 'gość', partOfSpeech: 'noun', exampleEn: 'The guest answered first.' },
    { word: 'curtain', word_pl: 'kurtyna', partOfSpeech: 'noun', exampleEn: 'The curtain rose.' },
    { word: 'spotlight', word_pl: 'reflektor', partOfSpeech: 'noun', exampleEn: 'A spotlight lit the stage.' },
    { word: 'applause', word_pl: 'oklaski', partOfSpeech: 'noun', exampleEn: 'The applause was loud.' },
    { word: 'prize', word_pl: 'nagroda', partOfSpeech: 'noun', exampleEn: 'The prize was a trip.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateQuizShow(sample, { count: 4, seed: 7 }), null, 2));
}
