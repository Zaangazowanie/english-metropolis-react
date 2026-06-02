// generateOpenCloze — Cambridge-style passage with multiple [BLANK_n] markers
// the student must fill. Unlike GapFill (multiple-choice from a bank), Open
// Cloze requires the student to *type* the answer — typically a function
// word (article, preposition, auxiliary, conjunction, pronoun).
//
// Algorithm:
//   1. Filter input keywords by word class — the open-cloze sweet spot is
//      function words (articles, prepositions, etc.). When `partOfSpeech`
//      is provided we prefer those; otherwise we fall back to short words
//      (≤6 letters) that are likely function-word candidates.
//   2. Build a passage by stitching the chosen words' example sentences
//      together. If insufficient sentences are available, we synthesise
//      a short multi-sentence passage from a fixed template.
//   3. Replace each chosen word in the passage with [BLANK_n] and emit a
//      gaps array recording the answer + accepted variants.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface OpenClozeGap {
  id: number;
  answer: string;
  acceptedAnswers?: string[];
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface OpenClozePuzzle {
  passage: string;          // plain text with [BLANK_n] markers (1-indexed)
  passage_pl?: string;      // optional Polish gloss of the passage
  gaps: OpenClozeGap[];
}

export interface OpenClozeInput {
  word: string;
  word_pl: string;
  partOfSpeech?: string;
  exampleEn?: string;
  exerciseId?: string;
}

const FUNCTION_POS = new Set(['article', 'preposition', 'pronoun', 'conjunction', 'determiner', 'auxiliary', 'modal']);
const DEFAULT_GAP_COUNT = 6;

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function findWord(sentence: string, target: string): [number, number] | null {
  if (!sentence || !target) return null;
  const folded = fold(sentence);
  const needle = fold(target);
  if (!needle) return null;
  const re = new RegExp(`(^|[^a-z0-9])(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![a-z0-9])`, 'i');
  const m = folded.match(re);
  if (!m) return null;
  const start = (m.index ?? 0) + (m[1]?.length ?? 0);
  return [start, start + needle.length];
}

export function generateOpenCloze(
  input: OpenClozeInput[],
  opts?: { gapCount?: number; seed?: number },
): OpenClozePuzzle | null {
  const targetGaps = opts?.gapCount ?? DEFAULT_GAP_COUNT;
  const rng = makeRng(opts?.seed ?? 0xC10E5E);

  const seen = new Set<string>();
  const pool: OpenClozeInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    pool.push(it);
  }

  if (pool.length === 0) return null;

  // Prefer function-word candidates; fall back to short words.
  const fnPool = pool.filter((p) => FUNCTION_POS.has((p.partOfSpeech ?? '').toLowerCase()));
  const shortPool = pool.filter((p) => !fnPool.includes(p) && p.word.length <= 6);
  const ranked = [
    ...shuffle([...fnPool], rng),
    ...shuffle([...shortPool], rng),
    ...shuffle([...pool.filter((p) => !fnPool.includes(p) && !shortPool.includes(p))], rng),
  ];

  // Pick subjects with available example sentences first, since we stitch
  // the passage from them. Limit to targetGaps.
  const withExamples = ranked.filter((r) => !!r.exampleEn);
  const subjects = (withExamples.length >= 2 ? withExamples : ranked).slice(0, Math.min(targetGaps, ranked.length));
  if (subjects.length === 0) return null;

  // Build the passage. Each subject contributes one sentence with its
  // target word blanked out.
  const sentences: string[] = [];
  const gaps: OpenClozeGap[] = [];
  let blankIdx = 1;

  for (const subj of subjects) {
    const original = subj.exampleEn ?? `The ${subj.word} sat quietly on the desk.`;
    const range = findWord(original, subj.word);
    let sentence: string;
    if (range) {
      const [s, e] = range;
      sentence = original.slice(0, s) + `[BLANK_${blankIdx}]` + original.slice(e);
    } else {
      // Fall back to appending the blank — rare in real data.
      sentence = `${original} (${subj.word}) → [BLANK_${blankIdx}]`;
    }
    sentences.push(sentence);
    gaps.push({
      id: blankIdx,
      answer: subj.word,
      acceptedAnswers: subj.word.toLowerCase() !== subj.word ? [subj.word.toLowerCase()] : undefined,
      hint: subj.partOfSpeech ? `Part of speech: ${subj.partOfSpeech}.` : `A short common word.`,
      hint_pl: `Po polsku: ${subj.word_pl}.`,
      exerciseId: subj.exerciseId,
    });
    blankIdx++;
  }

  const passage = sentences.join(' ');

  return { passage, gaps };
}

// ---- inline self-test ------------------------------------------------------
if (isDirectRun('generateOpenCloze.ts')) {
  const sample: OpenClozeInput[] = [
    { word: 'the',    word_pl: 'ten',    partOfSpeech: 'article',     exampleEn: 'The dog sat on the mat.' },
    { word: 'in',     word_pl: 'w',      partOfSpeech: 'preposition', exampleEn: 'She works in London.' },
    { word: 'have',   word_pl: 'mieć',   partOfSpeech: 'auxiliary',   exampleEn: 'I have lived here for ten years.' },
    { word: 'which',  word_pl: 'który',  partOfSpeech: 'pronoun',     exampleEn: 'A book which I really enjoyed.' },
    { word: 'for',    word_pl: 'dla',    partOfSpeech: 'preposition', exampleEn: 'A gift for my mother.' },
    { word: 'because',word_pl: 'ponieważ',partOfSpeech: 'conjunction',exampleEn: 'I left early because of the rain.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateOpenCloze(sample, { gapCount: 5, seed: 11 }), null, 2));
}
