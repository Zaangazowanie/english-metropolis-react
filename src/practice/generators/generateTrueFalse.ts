// generateTrueFalse — produce TRUE/FALSE statements from keyword enrichment.
//
// Source preference (richest signal first):
//   1. falseFriends → "TRUE/FALSE: 'X' in English means the same as 'Y' in
//      Polish" — usually FALSE because that's the whole point of a false friend.
//   2. commonMistakes → "TRUE/FALSE: We say '<wrong form>' in English." — FALSE.
//      We also pair it with the corrected form as a TRUE statement when present.
//   3. usageTip → derive a TRUE statement quoting the tip directly.
//   4. Fallback: "TRUE/FALSE: '<word>' in Polish means '<word_pl>'" (TRUE)
//      paired with "TRUE/FALSE: '<word>' in Polish means '<other_pl>'" (FALSE)
//      using a swapped translation from another keyword.
//
// We balance TRUE/FALSE within ±1 (50/50 target).
//
// Note on `any` types: the spec types `falseFriends` / `commonMistakes` as
// `any[]` because the Convex schema for those enrichment fields is itself
// loosely typed. We narrow at runtime with shape probes.
//
// Output shape (load-bearing — matches Agent 6 brief contract):
//   { statements: [{ id, text, text_pl, answer:boolean, explanation? }] }
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface TrueFalseStatement {
  id: string;
  text: string;
  text_pl: string;
  answer: boolean;
  explanation?: string;
}

export interface TrueFalsePuzzle {
  statements: TrueFalseStatement[];
}

export interface TrueFalseInput {
  word: string;
  word_pl: string;
  // Schema-level `any` — these are loosely-typed enrichment fields in Convex.
  // We probe for common shapes at runtime.
  falseFriends?: any[];
  commonMistakes?: any[];
  usageTip?: string;
}

const DEFAULT_COUNT = 8;

// Probe a falseFriend object for the polish-meaning hook we need.
// Common shapes seen on prod: { en, pl, actualEn } or { word, looksLike, means }.
function readFalseFriend(raw: any): { en: string; trickyPl: string; actualPl?: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const en = (raw.en ?? raw.word ?? raw.english ?? raw.term) as string | undefined;
  const trickyPl = (raw.looksLike ?? raw.misleadsAs ?? raw.pl ?? raw.misled) as string | undefined;
  const actualPl = (raw.actualPl ?? raw.actual ?? raw.means ?? raw.correctPl) as string | undefined;
  if (!en || !trickyPl) return null;
  return { en, trickyPl, actualPl };
}

function readCommonMistake(raw: any): { wrong: string; right: string; explanation?: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const wrong = (raw.wrong ?? raw.said ?? raw.incorrect ?? raw.mistake) as string | undefined;
  const right = (raw.right ?? raw.correct ?? raw.corrected ?? raw.fix) as string | undefined;
  const explanation = (raw.explanation ?? raw.note ?? raw.why) as string | undefined;
  if (!wrong || !right) return null;
  return { wrong, right, explanation };
}

export function generateTrueFalse(
  input: TrueFalseInput[],
  opts?: { count?: number; seed?: number },
): TrueFalsePuzzle {
  const count = opts?.count ?? DEFAULT_COUNT;
  const rng = makeRng(opts?.seed ?? 0x7F71);

  const trueOut: TrueFalseStatement[] = [];
  const falseOut: TrueFalseStatement[] = [];
  let counter = 0;
  const nextId = () => `tf-${++counter}`;

  const shuffled = shuffle([...input], rng);

  // Pass 1 — falseFriends (typically FALSE statements).
  for (const item of shuffled) {
    if (!item.falseFriends?.length) continue;
    for (const raw of item.falseFriends) {
      const ff = readFalseFriend(raw);
      if (!ff) continue;
      // FALSE: "'<en>' in English means the same as '<trickyPl>' in Polish."
      falseOut.push({
        id: nextId(),
        text: `'${ff.en}' in English means the same as '${ff.trickyPl}' in Polish.`,
        text_pl: `'${ff.en}' po angielsku znaczy to samo co '${ff.trickyPl}' po polsku.`,
        answer: false,
        explanation: ff.actualPl
          ? `False friend — '${ff.en}' actually means '${ff.actualPl}', not '${ff.trickyPl}'.`
          : `False friend — looks like '${ff.trickyPl}' but it isn't.`,
      });
      if (trueOut.length + falseOut.length >= count) break;
    }
    if (trueOut.length + falseOut.length >= count) break;
  }

  // Pass 2 — commonMistakes (the wrong form is FALSE, the right form is TRUE).
  for (const item of shuffled) {
    if (!item.commonMistakes?.length) continue;
    for (const raw of item.commonMistakes) {
      const cm = readCommonMistake(raw);
      if (!cm) continue;
      // FALSE: "We say '<wrong>' in English."
      if (falseOut.length <= trueOut.length) {
        falseOut.push({
          id: nextId(),
          text: `In English, we say "${cm.wrong}".`,
          text_pl: `Po angielsku mówimy "${cm.wrong}".`,
          answer: false,
          explanation: cm.explanation ?? `It should be "${cm.right}".`,
        });
      }
      // TRUE: "We say '<right>' in English."
      if (trueOut.length <= falseOut.length && trueOut.length + falseOut.length < count) {
        trueOut.push({
          id: nextId(),
          text: `In English, we say "${cm.right}".`,
          text_pl: `Po angielsku mówimy "${cm.right}".`,
          answer: true,
          explanation: cm.explanation,
        });
      }
      if (trueOut.length + falseOut.length >= count) break;
    }
    if (trueOut.length + falseOut.length >= count) break;
  }

  // Pass 3 — usageTip (TRUE statement quoting the tip).
  for (const item of shuffled) {
    if (!item.usageTip) continue;
    if (trueOut.length + falseOut.length >= count) break;
    if (trueOut.length > falseOut.length + 1) continue;
    trueOut.push({
      id: nextId(),
      text: `About "${item.word}": ${item.usageTip}`,
      text_pl: `Wskazówka o "${item.word}": ${item.usageTip}`,
      answer: true,
      explanation: `From the usage notes for ${item.word} (${item.word_pl}).`,
    });
  }

  // Pass 4 — fallback "X means Y" (TRUE) paired with swapped translations (FALSE).
  if (trueOut.length + falseOut.length < count) {
    const vocab = shuffled.filter((x) => !!x.word_pl);
    for (let i = 0; i < vocab.length && trueOut.length + falseOut.length < count; i++) {
      const w = vocab[i];
      if (trueOut.length <= falseOut.length) {
        trueOut.push({
          id: nextId(),
          text: `"${w.word}" in Polish means "${w.word_pl}".`,
          text_pl: `"${w.word}" po polsku znaczy "${w.word_pl}".`,
          answer: true,
        });
      } else {
        // Swapped translation — FALSE.
        const j = (i + 1 + Math.floor(rng() * Math.max(1, vocab.length - 1))) % vocab.length;
        const other = vocab[j];
        if (other.word_pl === w.word_pl) continue;
        falseOut.push({
          id: nextId(),
          text: `"${w.word}" in Polish means "${other.word_pl}".`,
          text_pl: `"${w.word}" po polsku znaczy "${other.word_pl}".`,
          answer: false,
          explanation: `"${w.word}" actually means "${w.word_pl}".`,
        });
      }
    }
  }

  // Interleave true/false to keep the run roughly balanced and unpredictable.
  const merged = shuffle([...trueOut, ...falseOut], rng).slice(0, count);
  return { statements: merged };
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline self-test.
// ─────────────────────────────────────────────────────────────────────────────
if (isDirectRun('generateTrueFalse.ts')) {
  const sample: TrueFalseInput[] = [
    {
      word: 'eventually',
      word_pl: 'w końcu',
      falseFriends: [{ en: 'eventually', looksLike: 'ewentualnie', actualPl: 'w końcu' }],
    },
    {
      word: 'actually',
      word_pl: 'właściwie',
      falseFriends: [{ en: 'actually', looksLike: 'aktualnie', actualPl: 'w rzeczywistości' }],
    },
    {
      word: 'have',
      word_pl: 'mieć',
      commonMistakes: [{ wrong: 'I have 25 years', right: 'I am 25 years old', explanation: "Use 'be', not 'have', for age." }],
    },
    {
      word: 'bridge',
      word_pl: 'most',
      usageTip: "Use 'cross the bridge', not 'go over the bridge'.",
    },
    { word: 'plaza',  word_pl: 'plac' },
    { word: 'avenue', word_pl: 'aleja' },
    { word: 'tower',  word_pl: 'wieża' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateTrueFalse(sample, { count: 6, seed: 5 }), null, 2));
}
