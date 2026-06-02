// generateSentenceTransform — Cambridge "key word transformation" exercises.
// Each item gives an original sentence + a key word; the student must rewrite
// the sentence using a target form so it keeps the same meaning.
//
// Real Cambridge transformation generation requires curated source data; this
// generator emits a sensible default deck when given vocab inputs that lack
// `transformOriginal`/`transformTarget` fields, by templating common
// transformations (active↔passive, modal↔possibility, comparative↔superlative)
// from the input keyword's example sentence. When richer fields are provided
// on the input, we use them verbatim.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface SentenceTransformItem {
  id: string;
  original: string;
  key_word: string;
  target_form: string;        // expected sentence (lower-cased reference)
  acceptedAnswers?: string[]; // alternate accepted rewrites
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface SentenceTransformPuzzle {
  items: SentenceTransformItem[];
}

export interface SentenceTransformInput {
  word: string;
  word_pl: string;
  partOfSpeech?: string;
  exampleEn?: string;
  /** Optional — when present we use these verbatim instead of templating. */
  transformOriginal?: string;
  transformKeyWord?: string;
  transformTarget?: string;
  exerciseId?: string;
}

const DEFAULT_COUNT = 6;

const TEMPLATES: Array<{
  pattern: RegExp;
  keyWord: string;
  build: (m: RegExpMatchArray, src: string) => { original: string; target: string; hint: string; hint_pl: string };
}> = [
  {
    pattern: /\b(\w+)\s+is\s+(\w+er)\s+than\b/i,
    keyWord: 'as',
    build: (m, src) => ({
      original: src,
      target: src.replace(m[0], `${m[1]} is not as ${m[2].replace(/er$/, '')} as`),
      hint: `Rewrite using "as ... as" (negative).`,
      hint_pl: `Przekształć z "as ... as" (przeczenie).`,
    }),
  },
  {
    pattern: /\b(I|you|he|she|we|they)\s+(must|have to|need to)\b/i,
    keyWord: 'should',
    build: (m, src) => ({
      original: src,
      target: src.replace(m[0], `${m[1]} should`),
      hint: `Rewrite using "should" instead of necessity.`,
      hint_pl: `Użyj "should" zamiast obowiązku.`,
    }),
  },
  {
    pattern: /\b(can|could|might|may)\b/i,
    keyWord: 'possible',
    build: (m, src) => ({
      original: src,
      target: `It is possible that ${src.replace(m[0], '').trim()}`,
      hint: `Rewrite starting with "It is possible that ...".`,
      hint_pl: `Rozpocznij od "It is possible that ...".`,
    }),
  },
];

export function generateSentenceTransform(
  input: SentenceTransformInput[],
  opts?: { count?: number; seed?: number },
): SentenceTransformPuzzle | null {
  const count = opts?.count ?? DEFAULT_COUNT;
  const rng = makeRng(opts?.seed ?? 0xCA17BE);

  const items: SentenceTransformItem[] = [];
  const seen = new Set<string>();

  // 1) Items with explicit transform fields take priority.
  const explicit = input.filter((i) => i.transformOriginal && i.transformTarget);
  for (const it of shuffle([...explicit], rng)) {
    if (items.length >= count) break;
    const id = (it.transformOriginal ?? '').slice(0, 24);
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id: id || it.word,
      original: it.transformOriginal!,
      key_word: it.transformKeyWord ?? it.word,
      target_form: it.transformTarget!,
      hint: `Rewrite using "${it.transformKeyWord ?? it.word}".`,
      hint_pl: `Przekształć używając "${it.transformKeyWord ?? it.word}".`,
      exerciseId: it.exerciseId,
    });
  }

  // 2) Fall back to template-matching the example sentence.
  for (const it of shuffle([...input.filter((i) => i.exampleEn)], rng)) {
    if (items.length >= count) break;
    const src = it.exampleEn!;
    for (const tmpl of TEMPLATES) {
      const m = src.match(tmpl.pattern);
      if (!m) continue;
      const built = tmpl.build(m, src);
      if (built.original === built.target) continue;
      const id = `${it.word}:${tmpl.keyWord}`;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        original: built.original,
        key_word: tmpl.keyWord,
        target_form: built.target,
        hint: built.hint,
        hint_pl: built.hint_pl,
        exerciseId: it.exerciseId,
      });
      break;
    }
  }

  if (items.length === 0) return null;
  return { items };
}

// ---- inline self-test ------------------------------------------------------
if (isDirectRun('generateSentenceTransform.ts')) {
  const sample: SentenceTransformInput[] = [
    { word: 'tall',  word_pl: 'wysoki', exampleEn: 'My brother is taller than me.' },
    { word: 'must',  word_pl: 'musieć', exampleEn: 'You must wear a helmet here.' },
    { word: 'might', word_pl: 'może',   exampleEn: 'It might rain tomorrow.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateSentenceTransform(sample, { seed: 7 }), null, 2));
}
