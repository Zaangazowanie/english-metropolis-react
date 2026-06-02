// generateFindTheMatch — Lost & Found office. Same data shape as Concentration
// but the shell renders all cards face-up; the player just spots the pair.
//
// Default 6 rounds — slightly more than Concentration because no flipping
// reduces cognitive load.
//
// 2026-05-02 (Ricky): generator-side scrub for CD audit §5 Lost & Found.
// generateMultipleChoice's blankExample falls back to a leaking
// "{sentence} → fits 'X'?" template when the example sentence holds an
// inflected form the strict regex can't match (pickpocket → pickpockets,
// flag → flagged, dependency → dependencies). Find the Match is a clue→word
// pair-match — the answer must NEVER appear in the clue card body. We rewrite
// each round's prompt here at the generator boundary so any path into the
// shell (Convex-adapter or vocab-pool) gets the clean clue. The shell still
// runs the same rewriter as belt-and-suspenders.
import { generateWrapperPuzzle, type WrapperPuzzle, type WrapperInput } from './wrapperPuzzle';
import { isDirectRun } from './rng';
import { maskAnswerInPrompt } from './maskAnswer';

const DEFAULT_COUNT = 6;
const SEED_NS = 0xF14D; // "FIND" namespace

const FITS_RE = /→\s*fits\s*['"`]?([^'"`?]+)['"`]?\?/i;

// 2026-05-02 (Ricky, CD audit cross-cutting #19): the per-shell rewriter
// only handles the cosmetic "→ which option fits?" replacement now —
// `generateMultipleChoice` already runs `maskAnswerInPrompt` on its
// emitted prompt, so the inflection / lemma scrub at this level acts as
// belt-and-suspenders. We still chain `maskAnswerInPrompt` after the FITS
// rewrite to be defensive about any future generator path that bypasses
// the upstream mask.
function rewriteFitsTemplateForClue(prompt: string, answer: string): string {
  if (!prompt || !answer) return prompt;
  if (!FITS_RE.test(prompt)) return prompt;
  return prompt.replace(FITS_RE, '→ which option fits?');
}

export function generateFindTheMatch(
  input: WrapperInput[],
  opts?: { count?: number; seed?: number },
): WrapperPuzzle | null {
  const puzzle = generateWrapperPuzzle(input, {
    count: opts?.count ?? DEFAULT_COUNT,
    seed: (opts?.seed ?? 0xC1A0) ^ SEED_NS,
  });
  if (!puzzle) return null;
  return {
    rounds: puzzle.rounds.map((r) => {
      const ans = r.options[r.answerIndex] ?? '';
      // Two-pass: first the cosmetic FITS template rewrite, then the shared
      // morphology-aware masker as a final scrub. Both are idempotent / no-op
      // when nothing matches.
      const cleaned = rewriteFitsTemplateForClue(r.prompt, ans);
      return { ...r, prompt: maskAnswerInPrompt(cleaned, ans) };
    }),
  };
}

if (isDirectRun('generateFindTheMatch.ts')) {
  const sample: WrapperInput[] = [
    { word: 'umbrella', word_pl: 'parasol', partOfSpeech: 'noun', exampleEn: 'A red umbrella was left behind.' },
    { word: 'glove', word_pl: 'rękawica', partOfSpeech: 'noun', exampleEn: 'I lost a glove on the bus.' },
    { word: 'wallet', word_pl: 'portfel', partOfSpeech: 'noun', exampleEn: 'My wallet is missing.' },
    { word: 'scarf', word_pl: 'szalik', partOfSpeech: 'noun', exampleEn: 'The scarf is wool.' },
    { word: 'key', word_pl: 'klucz', partOfSpeech: 'noun', exampleEn: 'A small brass key.' },
    { word: 'phone', word_pl: 'telefon', partOfSpeech: 'noun', exampleEn: 'The phone rang twice.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateFindTheMatch(sample, { count: 4, seed: 11 }), null, 2));
}
