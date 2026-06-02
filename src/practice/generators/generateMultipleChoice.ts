// generateMultipleChoice — pick a vocab word and surround it with 3 plausible
// distractors drawn from the same input pool, keeping (where possible) the
// same partOfSpeech so the question discriminates on meaning rather than
// surface form.
//
// Algorithm:
//   1. De-dupe input by surface form.
//   2. Shuffle the pool deterministically with the supplied seed.
//   3. Take `count` items as the question subjects.
//   4. For each subject, pick 3 distractors. Prefer same partOfSpeech (when
//      available) and same length bucket. Fall back to any remaining word.
//   5. Construct the prompt from the example sentence (with the keyword
//      blanked out as `___`) or a synthetic fallback.
//   6. Shuffle the option order and remember the answer index.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';
import { maskAnswerInPrompt } from './maskAnswer';

export interface MultipleChoiceQuestion {
  id: string;
  prompt: string;
  prompt_pl?: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface MultipleChoicePuzzle {
  questions: MultipleChoiceQuestion[];
}

export interface MultipleChoiceInput {
  word: string;
  word_pl: string;
  partOfSpeech?: string;
  exampleEn?: string;
  exampleEn_pl?: string;
  exerciseId?: string;
}

const DEFAULT_COUNT = 8;
const OPTIONS_PER_Q = 4;

function syntheticPrompt(word: string): string {
  return `Choose the word that best fits: "I learned the word ___ yesterday."`;
}

function blankExample(sentence: string, word: string): string {
  // Diacritic + case-insensitive replacement of the first whole-word match.
  const folded = sentence.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const needle = word.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const re = new RegExp(`(^|[^a-zA-Z0-9])(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![a-zA-Z0-9])`, 'i');
  const m = folded.match(re);
  // 2026-05-02 (Ricky, CD audit cross-cutting #19): the previous fallback
  // template `${sentence} → fits "${word}"?` literally pasted the answer
  // into the suffix, which leaked through every wrapper shell (Quiz Show,
  // Concentration, Find the Match, Random Cards / Wheel, Aerodrome,
  // Orchard Square). The new fallback strips the answer reference and
  // relies on the caller's `maskAnswerInPrompt` pass to scrub inflected
  // forms inside the sentence body. The "→ which option fits?" tail keeps
  // the discoverability cue without echoing the answer.
  if (!m) return `${sentence}  →  which option fits?`;
  const start = (m.index ?? 0) + (m[1]?.length ?? 0);
  return sentence.slice(0, start) + '___' + sentence.slice(start + needle.length);
}

function pickDistractors(
  pool: MultipleChoiceInput[],
  subject: MultipleChoiceInput,
  rng: () => number,
  needed: number,
): string[] {
  const subjPos = subject.partOfSpeech?.toLowerCase();
  const sameLen = (w: string) => Math.abs(w.length - subject.word.length) <= 2;
  const candidates = pool.filter((c) => c.word.toLowerCase() !== subject.word.toLowerCase());
  const samePos = candidates.filter((c) => subjPos && c.partOfSpeech?.toLowerCase() === subjPos);
  const sameBucket = candidates.filter((c) => sameLen(c.word));
  const ranked = [
    ...shuffle([...samePos], rng),
    ...shuffle([...sameBucket.filter((c) => !samePos.includes(c))], rng),
    ...shuffle([...candidates.filter((c) => !samePos.includes(c) && !sameBucket.includes(c))], rng),
  ];
  const out: string[] = [];
  const seen = new Set<string>([subject.word.toLowerCase()]);
  for (const c of ranked) {
    const k = c.word.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c.word);
    if (out.length >= needed) break;
  }
  return out;
}

export function generateMultipleChoice(
  input: MultipleChoiceInput[],
  opts?: { count?: number; seed?: number },
): MultipleChoicePuzzle | null {
  const count = opts?.count ?? DEFAULT_COUNT;
  const rng = makeRng(opts?.seed ?? 0xC401CE);

  const seen = new Set<string>();
  const pool: MultipleChoiceInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || !it.word_pl || seen.has(k)) continue;
    seen.add(k);
    pool.push(it);
  }

  // Need at least 4 unique words to form a single 4-option MCQ.
  if (pool.length < OPTIONS_PER_Q) return null;

  const subjects = shuffle([...pool], rng).slice(0, Math.min(count, pool.length));
  const questions: MultipleChoiceQuestion[] = [];

  for (const subj of subjects) {
    const distractors = pickDistractors(pool, subj, rng, OPTIONS_PER_Q - 1);
    if (distractors.length < OPTIONS_PER_Q - 1) continue; // not enough vocab

    const all = shuffle([subj.word, ...distractors], rng);
    const answerIndex = all.findIndex((w) => w.toLowerCase() === subj.word.toLowerCase());
    const promptRaw = subj.exampleEn
      ? blankExample(subj.exampleEn, subj.word)
      : syntheticPrompt(subj.word);
    // 2026-05-02 (Ricky, CD audit cross-cutting #19): belt-and-suspenders pass.
    // `blankExample` only catches the lemma form via a strict word-boundary
    // regex, so an inflected example ("Her resilience kept her focused" vs
    // answer "resilience" → matches; but "Her dependencies grew" vs answer
    // "dependency" → falls back to the leaking "{sentence} → fits 'X'?"
    // template, which Find the Match's adapter currently scrubs but every
    // other wrapper shell does not). `maskAnswerInPrompt` handles morphology
    // (-y↔-ies, -ed/-ing, doubled-consonant CVC, stem-prefix fallback) and
    // is a no-op when nothing matches, so it's safe to chain after
    // `blankExample` and `syntheticPrompt`.
    const prompt = maskAnswerInPrompt(promptRaw, subj.word);

    questions.push({
      id: subj.word,
      prompt,
      prompt_pl: subj.exampleEn_pl,
      options: all,
      answerIndex,
      hint: subj.partOfSpeech ? `Part of speech: ${subj.partOfSpeech}.` : `Try the word that fits the meaning of the sentence.`,
      hint_pl: `Po polsku: ${subj.word_pl}.`,
      exerciseId: subj.exerciseId,
    });
  }

  if (questions.length === 0) return null;
  return { questions };
}

// ---- inline self-test ------------------------------------------------------
if (isDirectRun('generateMultipleChoice.ts')) {
  const sample: MultipleChoiceInput[] = [
    { word: 'bridge', word_pl: 'most', partOfSpeech: 'noun', exampleEn: 'We crossed the bridge at sunset.' },
    { word: 'avenue', word_pl: 'aleja', partOfSpeech: 'noun', exampleEn: 'A wide avenue lined with trees.' },
    { word: 'metro',  word_pl: 'metro', partOfSpeech: 'noun', exampleEn: 'Take the metro to the centre.' },
    { word: 'street', word_pl: 'ulica', partOfSpeech: 'noun', exampleEn: 'The street was empty after midnight.' },
    { word: 'plaza',  word_pl: 'plac', partOfSpeech: 'noun', exampleEn: 'The plaza was full of tourists.' },
    { word: 'walk',   word_pl: 'iść', partOfSpeech: 'verb', exampleEn: 'I walk to work.' },
    { word: 'drive',  word_pl: 'jechać', partOfSpeech: 'verb', exampleEn: 'I drive on weekends.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateMultipleChoice(sample, { count: 4, seed: 7 }), null, 2));
}
