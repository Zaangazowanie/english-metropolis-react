// generatePictureQuiz — image + identify-what's-shown MCQ.
//
// Image URL convention (matches the upstream image pipeline — concept-art /
// stock images are batch-fetched per vocab item by /root/news-prep/...
// the practice generator just emits the URL convention):
//
//   /practice-images/<vocabSetId>/<slug(word)>.jpg
//
// Each item also exposes a fallback emoji-based glyph the shell can render
// when the image fails to load (no broken-image icon — the salon should
// never look "empty").
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';
// Note: this is a leaf module used by exercise-adapters.ts indirectly via
// the generators barrel. Importing concretizeDistractors directly from its
// own module avoids the circular path through exercise-adapters.ts.
import { concretizeDistractors } from '../lib/concretize-distractors';

export interface PictureQuizItem {
  id: string;
  image_url: string;
  fallback_glyph: string;
  prompt: string;
  prompt_pl: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface PictureQuizPuzzle {
  items: PictureQuizItem[];
}

export interface PictureQuizInput {
  word: string;
  word_pl: string;
  example?: string;
  example_pl?: string;
  topic?: string;
  exerciseId?: string;
}

const DEFAULT_ITEMS = 5;

// Emoji fallbacks indexed by topic — never a broken-image icon.
const TOPIC_GLYPH: Record<string, string> = {
  food: '🍞', travel: '🚆', weather: '🌧️', clothing: '🧥',
  body: '👁️', animal: '🐦', nature: '🌳', city: '🏙️',
  default: '🖼️',
};

function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

export function generatePictureQuizPuzzle(
  input: PictureQuizInput[],
  opts?: { numItems?: number; seed?: number; vocabSetId?: string },
): PictureQuizPuzzle | null {
  const numItems = Math.max(3, Math.min(8, opts?.numItems ?? DEFAULT_ITEMS));
  const rng = makeRng(opts?.seed ?? 0xF1C5);

  // Dedupe.
  const seen = new Set<string>();
  const cleaned: PictureQuizInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    cleaned.push(it);
  }
  if (cleaned.length < 4) return null;

  const setId = opts?.vocabSetId ?? 'demo';
  const allWords = cleaned.map((c) => c.word);

  const picked = shuffle([...cleaned], rng).slice(0, numItems);

  const items: PictureQuizItem[] = picked.map((target, idx) => {
    const rawDistractors = shuffle(
      allWords.filter((w) => w !== target.word),
      rng,
    ).slice(0, 3);
    // Picture-quiz distractor sanitiser (Ricky 2026-05-02): swap unsolvable
    // abstractions ("resilience", "impose", "adrenaline rush") for concrete
    // depictable nouns from a built-in pool. Never mutates the answer.
    const distractors = concretizeDistractors(rawDistractors, target.word);
    const options = shuffle([target.word, ...distractors], rng);
    const answerIndex = options.indexOf(target.word);
    const glyph = TOPIC_GLYPH[target.topic ?? 'default'] ?? TOPIC_GLYPH.default;
    return {
      id: `pq-${idx}-${slug(target.word)}`,
      image_url: `/practice-images/${setId}/${slug(target.word)}.jpg`,
      fallback_glyph: glyph,
      prompt: `What is shown in this picture?`,
      prompt_pl: `Co jest na obrazku?`,
      options,
      answerIndex,
      hint: target.example ?? `Look closely — it begins with "${target.word.charAt(0).toUpperCase()}".`,
      hint_pl: target.example_pl ?? target.word_pl ?? 'Patrz uważnie.',
      exerciseId: target.exerciseId,
    };
  });

  return { items };
}

if (isDirectRun('generatePictureQuiz.ts')) {
  const sample: PictureQuizInput[] = [
    { word: 'bread',  word_pl: 'chleb',   topic: 'food' },
    { word: 'apple',  word_pl: 'jabłko',  topic: 'food' },
    { word: 'rain',   word_pl: 'deszcz',  topic: 'weather' },
    { word: 'jacket', word_pl: 'kurtka',  topic: 'clothing' },
    { word: 'bridge', word_pl: 'most',    topic: 'city' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generatePictureQuizPuzzle(sample, { seed: 13, vocabSetId: 'sample' }), null, 2));
}
