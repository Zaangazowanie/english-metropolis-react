// generateSentenceCorrection — sentences with one English-grammar error each.
// The student must spot the wrong span and supply a correction.
//
// Real correction generation needs curated error data. This generator emits a
// sensible default deck by mutating example sentences with simple, predictable
// L1-interference errors common to Polish learners (article omission, wrong
// preposition, third-person -s, plurals). When `errorSpan`/`correction` are
// supplied directly on the input, those take priority.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface SentenceCorrectionItem {
  id: string;
  sentence_with_error: string;
  error_span: [number, number];   // [start, endExclusive] in sentence_with_error
  correction: string;             // text that should replace the span
  acceptedAnswers?: string[];     // alternate accepted corrections
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface SentenceCorrectionPuzzle {
  items: SentenceCorrectionItem[];
}

export interface SentenceCorrectionInput {
  word: string;
  word_pl: string;
  partOfSpeech?: string;
  exampleEn?: string;
  errorSentence?: string;
  errorSpan?: [number, number];
  correction?: string;
  exerciseId?: string;
}

const DEFAULT_COUNT = 6;

// Common Polish-learner error patterns. Each takes a sentence and returns
// {mutated, span, correction, hint} or null when not applicable.
const PATTERNS: Array<(s: string) => null | { mutated: string; span: [number, number]; correction: string; hint: string; hint_pl: string }> = [
  // 1. Drop the article ("the") — very common L1 interference.
  (s) => {
    const m = s.match(/\bthe\s/i);
    if (!m) return null;
    const start = m.index ?? 0;
    const mutated = s.slice(0, start) + s.slice(start + m[0].length);
    return {
      mutated,
      span: [start, start + 1],
      correction: 'the ',
      hint: 'A definite article is missing.',
      hint_pl: 'Brakuje rodzajnika "the".',
    };
  },
  // 2. Third-person singular missing -s ("she walk" → "she walks").
  (s) => {
    const m = s.match(/\b(he|she|it|the\s+\w+)\s+(\w+s)\b/i);
    if (!m) return null;
    const verb = m[2];
    if (verb.endsWith('ss') || verb.endsWith('us')) return null;
    const stem = verb.slice(0, -1);
    const start = m.index! + m[1].length + 1;
    const mutated = s.slice(0, start) + stem + s.slice(start + verb.length);
    return {
      mutated,
      span: [start, start + stem.length],
      correction: verb,
      hint: 'Third-person singular needs -s.',
      hint_pl: 'Trzecia osoba l. poj. wymaga -s.',
    };
  },
  // 3. Wrong preposition ("on" instead of "at").
  (s) => {
    const m = s.match(/\bat\s+(\w+)/i);
    if (!m) return null;
    const start = m.index!;
    const mutated = s.slice(0, start) + 'on ' + m[1] + s.slice(start + m[0].length);
    return {
      mutated,
      span: [start, start + 2],
      correction: 'at',
      hint: 'Wrong preposition. Time/place expression?',
      hint_pl: 'Zły przyimek. Wyrażenie czasu/miejsca?',
    };
  },
  // 4. Plural -s missing ("two book" → "two books").
  (s) => {
    const m = s.match(/\b(two|three|many|several)\s+(\w+s)\b/i);
    if (!m) return null;
    const stem = m[2].slice(0, -1);
    const start = m.index! + m[1].length + 1;
    const mutated = s.slice(0, start) + stem + s.slice(start + m[2].length);
    return {
      mutated,
      span: [start, start + stem.length],
      correction: m[2],
      hint: 'Plural marker is missing.',
      hint_pl: 'Brak końcówki liczby mnogiej (-s).',
    };
  },
];

export function generateSentenceCorrection(
  input: SentenceCorrectionInput[],
  opts?: { count?: number; seed?: number },
): SentenceCorrectionPuzzle | null {
  const count = opts?.count ?? DEFAULT_COUNT;
  const rng = makeRng(opts?.seed ?? 0xC047C7);
  const items: SentenceCorrectionItem[] = [];
  const seen = new Set<string>();

  // 1) Curated items first.
  for (const it of shuffle([...input.filter((i) => i.errorSentence && i.errorSpan && i.correction)], rng)) {
    if (items.length >= count) break;
    const id = `${it.word}-fix`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      sentence_with_error: it.errorSentence!,
      error_span: it.errorSpan!,
      correction: it.correction!,
      hint: 'Spot the mistake and type the correction.',
      hint_pl: 'Znajdź błąd i wpisz poprawkę.',
      exerciseId: it.exerciseId,
    });
  }

  // 2) Fall back to mutating example sentences.
  const candidates = shuffle([...input.filter((i) => !!i.exampleEn)], rng);
  for (const it of candidates) {
    if (items.length >= count) break;
    const src = it.exampleEn!;
    for (const p of PATTERNS) {
      const out = p(src);
      if (!out) continue;
      const id = `${it.word}-${out.span[0]}`;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        sentence_with_error: out.mutated,
        error_span: out.span,
        correction: out.correction,
        hint: out.hint,
        hint_pl: out.hint_pl,
        exerciseId: it.exerciseId,
      });
      break;
    }
  }

  if (items.length === 0) return null;
  return { items };
}

// ---- inline self-test ------------------------------------------------------
if (isDirectRun('generateSentenceCorrection.ts')) {
  const sample: SentenceCorrectionInput[] = [
    { word: 'walk',  word_pl: 'iść',     exampleEn: 'She walks to school every morning.' },
    { word: 'book',  word_pl: 'książka', exampleEn: 'I bought two books at the market.' },
    { word: 'work',  word_pl: 'praca',   exampleEn: 'He arrived at work at nine.' },
    { word: 'tower', word_pl: 'wieża',   exampleEn: 'The tower lights up at night.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateSentenceCorrection(sample, { seed: 7 }), null, 2));
}
