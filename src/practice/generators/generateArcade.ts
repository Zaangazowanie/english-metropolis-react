// generateArcade — shared MCQ-round puzzle for the seven arcade shells:
//   Open the Box, Spin the Wheel, Whack-a-Mole, Balloon Pop,
//   Snake, Maze Chase, Battleship.
//
// Each shell renders the same `ArcadePuzzle` shape (rounds of MCQ) but
// uses very different visual mechanics. The generator picks a small set of
// "answer" vocab words, then for each one builds a 4-option MCQ where the
// distractors are sampled from the same vocab pool (preferring same POS or
// same topic for plausible interference, falling back to random).
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';
import { maskAnswerInPrompt } from './maskAnswer';

export interface ArcadeRound {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface ArcadePuzzle {
  rounds: ArcadeRound[];
}

export interface ArcadeInput {
  word: string;
  word_pl: string;
  /** English clue / definition; if absent we fall back to word_pl. */
  clue?: string;
  partOfSpeech?: string;
  topic?: string;
  exerciseId?: string;
}

export interface ArcadeOpts {
  /** How many MCQ rounds to emit. Default 6 (capped at vocab size). */
  count?: number;
  /** Number of options per round including the correct answer. Default 4. */
  optionsPerRound?: number;
  /** Seed for deterministic output. */
  seed?: number;
}

const DEFAULT_COUNT = 6;
const DEFAULT_OPTIONS = 4;
const MIN_OPTIONS = 2;

function pickDistractors(
  pool: ArcadeInput[],
  answer: ArcadeInput,
  needed: number,
  rng: () => number,
): string[] {
  // Prefer same partOfSpeech, then same topic, then random — strip duplicates.
  const seen = new Set<string>([answer.word.toLowerCase()]);
  const picked: string[] = [];

  const tryFrom = (filter: (it: ArcadeInput) => boolean) => {
    const candidates = shuffle(pool.filter(filter), rng);
    for (const c of candidates) {
      if (picked.length >= needed) break;
      const key = c.word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(c.word);
    }
  };

  if (answer.partOfSpeech) tryFrom(it => it !== answer && it.partOfSpeech === answer.partOfSpeech);
  if (answer.topic && picked.length < needed) tryFrom(it => it !== answer && it.topic === answer.topic);
  if (picked.length < needed) tryFrom(it => it !== answer);

  return picked.slice(0, needed);
}

export function generateArcade(input: ArcadeInput[], opts: ArcadeOpts = {}): ArcadePuzzle | null {
  const count = opts.count ?? DEFAULT_COUNT;
  const optionsPerRound = Math.max(MIN_OPTIONS, opts.optionsPerRound ?? DEFAULT_OPTIONS);
  const rng = makeRng(opts.seed ?? 0xDEAD);

  // Need at least optionsPerRound distinct words to build any round.
  const cleaned = input.filter(it => it.word && it.word_pl).filter((it, i, arr) =>
    arr.findIndex(j => j.word.toLowerCase() === it.word.toLowerCase()) === i,
  );
  if (cleaned.length < optionsPerRound) return null;

  // Pick `count` answers (deterministic shuffle).
  const answers = shuffle([...cleaned], rng).slice(0, Math.min(count, cleaned.length));

  const rounds: ArcadeRound[] = [];
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i];
    const distractors = pickDistractors(cleaned, answer, optionsPerRound - 1, rng);
    if (distractors.length < optionsPerRound - 1) continue;

    const optionsRaw = shuffle([answer.word, ...distractors], rng);
    const answerIndex = optionsRaw.findIndex(o => o.toLowerCase() === answer.word.toLowerCase());

    // 2026-05-02 (Ricky, CD audit cross-cutting #19): when the EN clue
    // contains the answer-word literally ("A bridge crosses a river" with
    // answer "bridge"), every arcade shell that uses this generator (Open
    // the Box, Spin the Wheel, Whack-a-Mole, Balloon Pop, Snake, Maze
    // Chase, Battleship) hands the student the answer for free. Mask it
    // before emitting. `maskAnswerInPrompt` catches morphological variants
    // and is a no-op when nothing matches, so the "Translate from Polish:"
    // template is unaffected.
    const promptRaw = answer.clue ?? `Translate from Polish: ${answer.word_pl}`;
    rounds.push({
      id: `r${i + 1}-${answer.word.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      prompt: maskAnswerInPrompt(promptRaw, answer.word),
      options: optionsRaw,
      answerIndex,
      hint: answer.clue ?? answer.word_pl,
      hint_pl: answer.word_pl,
      exerciseId: answer.exerciseId,
    });
  }

  return rounds.length === 0 ? null : { rounds };
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline self-test.
// ─────────────────────────────────────────────────────────────────────────────
if (isDirectRun('generateArcade.ts')) {
  const sample: ArcadeInput[] = [
    { word: 'bridge',     word_pl: 'most',          clue: 'It crosses a river.',         partOfSpeech: 'noun', topic: 'city' },
    { word: 'avenue',     word_pl: 'aleja',         clue: 'A wide tree-lined street.',   partOfSpeech: 'noun', topic: 'city' },
    { word: 'plaza',      word_pl: 'plac',          clue: 'An open public square.',      partOfSpeech: 'noun', topic: 'city' },
    { word: 'tower',      word_pl: 'wieża',         clue: 'A tall narrow building.',     partOfSpeech: 'noun', topic: 'city' },
    { word: 'market',     word_pl: 'targ',          clue: 'Stalls of sellers.',          partOfSpeech: 'noun', topic: 'city' },
    { word: 'station',    word_pl: 'stacja',        clue: 'Trains arrive here.',         partOfSpeech: 'noun', topic: 'transport' },
    { word: 'subway',     word_pl: 'metro',         clue: 'Underground transit.',        partOfSpeech: 'noun', topic: 'transport' },
    { word: 'lantern',    word_pl: 'latarnia',      clue: 'Old style lamp.',             partOfSpeech: 'noun', topic: 'city' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateArcade(sample, { seed: 1, count: 4 }), null, 2));
}
