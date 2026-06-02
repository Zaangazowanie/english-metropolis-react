// generateRandomCards — Dealer's Table. The shell shows a deck; the player
// draws one card at a time and answers an MCQ on its face. Default 8 rounds —
// a card-shoe with 8 draws keeps the rhythm dramatic without dragging.
import { generateWrapperPuzzle, type WrapperPuzzle, type WrapperInput } from './wrapperPuzzle';
import { isDirectRun } from './rng';

const DEFAULT_COUNT = 8;
const SEED_NS = 0xDEC0; // "DECK" namespace

export function generateRandomCards(
  input: WrapperInput[],
  opts?: { count?: number; seed?: number },
): WrapperPuzzle | null {
  return generateWrapperPuzzle(input, {
    count: opts?.count ?? DEFAULT_COUNT,
    seed: (opts?.seed ?? 0xC1A0) ^ SEED_NS,
  });
}

if (isDirectRun('generateRandomCards.ts')) {
  const sample: WrapperInput[] = [
    { word: 'dealer', word_pl: 'krupier', partOfSpeech: 'noun', exampleEn: 'The dealer cuts the deck.' },
    { word: 'shuffle', word_pl: 'tasować', partOfSpeech: 'verb', exampleEn: 'Please shuffle the cards.' },
    { word: 'bet', word_pl: 'zakład', partOfSpeech: 'noun', exampleEn: 'A small bet on red.' },
    { word: 'chip', word_pl: 'żeton', partOfSpeech: 'noun', exampleEn: 'One chip is worth ten.' },
    { word: 'draw', word_pl: 'dobierać', partOfSpeech: 'verb', exampleEn: 'Draw one card from the top.' },
    { word: 'fold', word_pl: 'pasować', partOfSpeech: 'verb', exampleEn: 'I had to fold this hand.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateRandomCards(sample, { count: 4, seed: 13 }), null, 2));
}
