// generateWordFormation — Cambridge "word formation" exercises.
// Given a base word in CAPITALS at the end of a sentence, derive the right
// part-of-speech form to fit the gap. e.g. "She acted with great ___. (BRAVE)"
// → "bravery".
//
// Real word-formation requires a curated derivation lattice (BRAVE → BRAVERY,
// BRAVELY, BRAVED). When `derivations` is provided on the input we use it;
// otherwise we apply a small set of common suffix templates to produce a
// plausible target form so the deck is non-empty for any vocab pool.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export type TargetPos = 'noun' | 'verb' | 'adj' | 'adv';

export interface WordFormationItem {
  id: string;
  sentence: string;        // contains a single ___ marker
  base_word: string;       // e.g. "BRAVE"
  target_pos: TargetPos;
  answer: string;          // e.g. "bravery"
  acceptedAnswers?: string[];
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface WordFormationPuzzle {
  items: WordFormationItem[];
}

export interface WordFormationInput {
  word: string;
  word_pl: string;
  partOfSpeech?: string;
  exampleEn?: string;
  /** Optional curated derivations: keyed by target POS. */
  derivations?: Partial<Record<TargetPos, string>>;
  exerciseId?: string;
}

const DEFAULT_COUNT = 6;

// Crude suffix templates per target POS. Used as a fallback when the input
// lacks a curated derivation. Order matters — first match wins.
const TEMPLATES: Record<TargetPos, Array<{ when: (w: string) => boolean; build: (w: string) => string }>> = {
  noun: [
    { when: (w) => /e$/i.test(w), build: (w) => w.replace(/e$/i, 'ery') },        // brave → bravery
    { when: (w) => /(act|develop|create|invent|inform|decide)$/i.test(w), build: (w) => `${w}ion` },
    { when: (w) => /happy|busy|easy$/i.test(w), build: (w) => w.replace(/y$/i, 'iness') },
    { when: () => true, build: (w) => `${w}ness` },
  ],
  verb: [
    { when: (w) => /tion$/i.test(w), build: (w) => w.replace(/tion$/i, 'te') },   // creation → create
    { when: (w) => /ness$/i.test(w), build: (w) => w.replace(/iness$/i, 'y') },
    { when: () => true, build: (w) => w },
  ],
  adj: [
    { when: (w) => /ness$/i.test(w), build: (w) => w.replace(/ness$/i, '') },
    { when: (w) => /(care|use|pain|rest|hope)$/i.test(w), build: (w) => `${w}ful` },
    { when: () => true, build: (w) => `${w}ful` },
  ],
  adv: [
    { when: (w) => /y$/i.test(w), build: (w) => w.replace(/y$/i, 'ily') },        // happy → happily
    { when: () => true, build: (w) => `${w}ly` },
  ],
};

const CYCLE: TargetPos[] = ['noun', 'adj', 'adv', 'verb'];

const SENTENCE_TEMPLATES: Record<TargetPos, (form: string) => string> = {
  noun: (form) => `Her work shows great ___. (`,
  verb: (form) => `The team will ___ a new plan next week. (`,
  adj:  (form) => `The morning was unusually ___. (`,
  adv:  (form) => `She handled the meeting ___. (`,
};

function deriveForm(input: WordFormationInput, target: TargetPos): string | null {
  const curated = input.derivations?.[target];
  if (curated) return curated;
  const tmpls = TEMPLATES[target];
  for (const t of tmpls) {
    if (t.when(input.word)) return t.build(input.word.toLowerCase());
  }
  return null;
}

export function generateWordFormation(
  input: WordFormationInput[],
  opts?: { count?: number; seed?: number },
): WordFormationPuzzle | null {
  const count = opts?.count ?? DEFAULT_COUNT;
  const rng = makeRng(opts?.seed ?? 0xF02ED);

  const seen = new Set<string>();
  const pool: WordFormationInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    pool.push(it);
  }
  if (pool.length === 0) return null;

  const picked = shuffle([...pool], rng).slice(0, Math.min(count, pool.length));
  const items: WordFormationItem[] = [];
  let cycleIdx = 0;

  for (const it of picked) {
    // Pick a target POS that DIFFERS from the input's POS where possible.
    const inputPos = (it.partOfSpeech ?? '').toLowerCase();
    let target: TargetPos = CYCLE[cycleIdx++ % CYCLE.length];
    if (inputPos.startsWith('noun') && target === 'noun') target = 'adj';
    if (inputPos.startsWith('adj')  && target === 'adj')  target = 'noun';
    if (inputPos.startsWith('verb') && target === 'verb') target = 'noun';
    if (inputPos.startsWith('adv')  && target === 'adv')  target = 'adj';

    const answer = deriveForm(it, target);
    if (!answer) continue;
    if (answer.toLowerCase() === it.word.toLowerCase()) continue;

    const sentence = SENTENCE_TEMPLATES[target](answer).replace(/\($/, '');

    items.push({
      id: `${it.word}:${target}`,
      sentence,
      base_word: it.word.toUpperCase(),
      target_pos: target,
      answer,
      hint: `Make the ${target} form of ${it.word.toUpperCase()}.`,
      hint_pl: `Utwórz formę ${posPL(target)} od ${it.word.toUpperCase()} (${it.word_pl}).`,
      exerciseId: it.exerciseId,
    });
  }

  if (items.length === 0) return null;
  return { items };
}

function posPL(p: TargetPos): string {
  switch (p) {
    case 'noun': return 'rzeczownika';
    case 'verb': return 'czasownika';
    case 'adj':  return 'przymiotnika';
    case 'adv':  return 'przysłówka';
  }
}

// ---- inline self-test ------------------------------------------------------
if (isDirectRun('generateWordFormation.ts')) {
  const sample: WordFormationInput[] = [
    { word: 'brave',  word_pl: 'odważny', partOfSpeech: 'adj' },
    { word: 'happy',  word_pl: 'szczęśliwy', partOfSpeech: 'adj' },
    { word: 'create', word_pl: 'tworzyć', partOfSpeech: 'verb' },
    { word: 'inform', word_pl: 'informować', partOfSpeech: 'verb' },
    { word: 'careful', word_pl: 'ostrożny', partOfSpeech: 'adj' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateWordFormation(sample, { seed: 7 }), null, 2));
}
