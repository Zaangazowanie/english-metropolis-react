// generateSpeakingCards — prompt cards for the student to read aloud.
//
// The shell uses the browser's MediaRecorder + getUserMedia to capture an
// audio sample so the student can hear themselves play it back. The grader
// is the student themselves (no STT in V1) — they self-rate "I said it well"
// or "Try again". Cards therefore carry target_phrases the shell can render
// as a model answer the student can compare against.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface SpeakingCard {
  id: string;
  prompt: string;
  prompt_pl: string;
  target_phrases: string[];
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface SpeakingCardsPuzzle {
  cards: SpeakingCard[];
}

export interface SpeakingCardsInput {
  word: string;
  word_pl: string;
  example?: string;
  example_pl?: string;
  partOfSpeech?: string;
  exerciseId?: string;
}

const DEFAULT_CARDS = 5;

// Prompt templates seeded from the vocab item. We keep them grammatically
// open-ended so the student can answer in their own voice while still
// hitting the target phrase.
const PROMPT_TEMPLATES_EN = [
  (w: string) => `Tell me about your last "${w}".`,
  (w: string) => `Use "${w}" in a sentence about today.`,
  (w: string) => `Describe a "${w}" you remember well.`,
  (w: string) => `Ask a friend something using the word "${w}".`,
  (w: string) => `Say two sentences about a "${w}".`,
];
const PROMPT_TEMPLATES_PL = [
  (w: string) => `Opowiedz o swoim ostatnim "${w}".`,
  (w: string) => `Użyj "${w}" w zdaniu o dzisiejszym dniu.`,
  (w: string) => `Opisz "${w}", które dobrze pamiętasz.`,
  (w: string) => `Zapytaj przyjaciela o coś, używając słowa "${w}".`,
  (w: string) => `Powiedz dwa zdania o "${w}".`,
];

export function generateSpeakingCardsPuzzle(
  input: SpeakingCardsInput[],
  opts?: { numCards?: number; seed?: number },
): SpeakingCardsPuzzle | null {
  const num = Math.max(3, Math.min(8, opts?.numCards ?? DEFAULT_CARDS));
  const rng = makeRng(opts?.seed ?? 0x5A91);

  // Dedupe.
  const seen = new Set<string>();
  const cleaned: SpeakingCardsInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    cleaned.push(it);
  }
  if (cleaned.length < 3) return null;

  const picked = shuffle([...cleaned], rng).slice(0, num);

  const cards: SpeakingCard[] = picked.map((target, i) => {
    const ti = Math.floor(rng() * PROMPT_TEMPLATES_EN.length);
    const prompt = PROMPT_TEMPLATES_EN[ti](target.word);
    const prompt_pl = PROMPT_TEMPLATES_PL[ti](target.word_pl);
    const targets = [target.example, target.word, `${target.word}…`].filter(
      (s): s is string => Boolean(s),
    );
    return {
      id: `sc-${i}-${target.word}`,
      prompt,
      prompt_pl,
      target_phrases: targets,
      hint: target.example ?? `Say a sentence using "${target.word}".`,
      hint_pl: target.example_pl ?? target.word_pl ?? 'Powiedz zdanie ze słowem.',
      exerciseId: target.exerciseId,
    };
  });

  return { cards };
}

if (isDirectRun('generateSpeakingCards.ts')) {
  const sample: SpeakingCardsInput[] = [
    { word: 'coffee',  word_pl: 'kawa',    example: 'I had a coffee this morning.', example_pl: 'Wypiłem kawę dziś rano.' },
    { word: 'morning', word_pl: 'rano',    example: 'I got up early.', example_pl: 'Wstałem wcześnie.' },
    { word: 'street',  word_pl: 'ulica',   example: 'On the main street.', example_pl: 'Na głównej ulicy.' },
    { word: 'window',  word_pl: 'okno',    example: 'I opened the window.', example_pl: 'Otworzyłem okno.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateSpeakingCardsPuzzle(sample, { seed: 19 }), null, 2));
}
