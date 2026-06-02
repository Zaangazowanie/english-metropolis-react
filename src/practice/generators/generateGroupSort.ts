// generateGroupSort — categorize words into 3-4 named buckets.
//
// Algorithm:
//   1. Group input by an attribute, in priority order:
//        a. partOfSpeech (most reliable, single canonical value)
//        b. category (free-form label — e.g. "transport", "buildings")
//        c. topic (first topic in the array, when keywords carry topic[])
//        d. fallback: alphabetical band — A-G / H-N / O-Z
//   2. Rank buckets by size, drop tiny ones (< 2), keep top numCategories.
//   3. Sample itemsPerCategory items per bucket (deterministic shuffle).
//   4. If everything ends up too unbalanced (e.g. one bucket has 8, others
//      have 1 each), fall back to letter-banding so we always emit a playable
//      puzzle.
//
// Output shape (load-bearing — matches Agent 6 brief contract):
//   {
//     categories: [{ id, label, label_pl, emoji? }],
//     items:      [{ id, label, correctCategoryId }],
//   }
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface GroupSortCategory {
  id: string;
  label: string;
  label_pl: string;
  emoji?: string;
}

export interface GroupSortItem {
  id: string;
  label: string;             // the word/phrase the user sees
  correctCategoryId: string;
}

export interface GroupSortPuzzle {
  categories: GroupSortCategory[];
  items: GroupSortItem[];
}

export interface GroupSortInput {
  word: string;
  word_pl: string;
  partOfSpeech?: string;
  topic?: string;
  category?: string;
}

const DEFAULT_CATEGORIES = 3;
const DEFAULT_ITEMS_PER_CATEGORY = 3;
const MIN_PER_BUCKET = 2;

// Polish translations of common partOfSpeech labels (so the UI can show both).
const POS_PL: Record<string, string> = {
  noun: 'rzeczownik',
  verb: 'czasownik',
  adjective: 'przymiotnik',
  adverb: 'przysłówek',
  preposition: 'przyimek',
  pronoun: 'zaimek',
  conjunction: 'spójnik',
  determiner: 'określnik',
  interjection: 'wykrzyknik',
};

const POS_EMOJI: Record<string, string> = {
  noun: '*',         // intentionally non-emoji — emojis are opt-in only
  verb: '*',
  adjective: '*',
};

function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat';
}

type GroupingMode = 'partOfSpeech' | 'category' | 'topic' | 'alpha';

function letterBand(word: string): string {
  const c = word.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').charAt(0) || '';
  if (!c) return 'misc';
  if (c <= 'g') return 'A-G';
  if (c <= 'n') return 'H-N';
  return 'O-Z';
}

function bandToPl(band: string): string {
  if (band === 'A-G') return 'A-G (litery)';
  if (band === 'H-N') return 'H-N (litery)';
  if (band === 'O-Z') return 'O-Z (litery)';
  return 'pozostałe';
}

function pickGroupingMode(input: GroupSortInput[]): GroupingMode {
  const hasPos = input.filter((i) => !!i.partOfSpeech).length;
  const hasCat = input.filter((i) => !!i.category).length;
  const hasTopic = input.filter((i) => !!i.topic).length;
  const half = Math.ceil(input.length / 2);
  if (hasPos >= half) return 'partOfSpeech';
  if (hasCat >= half) return 'category';
  if (hasTopic >= half) return 'topic';
  return 'alpha';
}

function bucketKeyFor(item: GroupSortInput, mode: GroupingMode): string {
  if (mode === 'partOfSpeech') return item.partOfSpeech || '__none';
  if (mode === 'category')     return item.category     || '__none';
  if (mode === 'topic')        return item.topic        || '__none';
  return letterBand(item.word);
}

function labelFor(key: string, mode: GroupingMode): { en: string; pl: string; emoji?: string } {
  if (mode === 'partOfSpeech') {
    return {
      en: key === '__none' ? 'Other' : key.charAt(0).toUpperCase() + key.slice(1),
      pl: POS_PL[key] ?? (key === '__none' ? 'inne' : key),
      emoji: POS_EMOJI[key],
    };
  }
  if (mode === 'category' || mode === 'topic') {
    return { en: key === '__none' ? 'Other' : key, pl: key === '__none' ? 'inne' : key };
  }
  return { en: key, pl: bandToPl(key) };
}

function buildBuckets(
  input: GroupSortInput[],
  mode: GroupingMode,
): Array<{ key: string; words: GroupSortInput[] }> {
  const map = new Map<string, GroupSortInput[]>();
  for (const it of input) {
    const k = bucketKeyFor(it, mode);
    if (k === '__none') continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(it);
  }
  return [...map.entries()].map(([key, words]) => ({ key, words }));
}

export function generateGroupSort(
  input: GroupSortInput[],
  opts?: { numCategories?: number; itemsPerCategory?: number; seed?: number },
): GroupSortPuzzle {
  const numCategories = Math.max(2, Math.min(4, opts?.numCategories ?? DEFAULT_CATEGORIES));
  const itemsPerCategory = Math.max(2, opts?.itemsPerCategory ?? DEFAULT_ITEMS_PER_CATEGORY);
  const rng = makeRng(opts?.seed ?? 0x6504);

  // Dedupe input.
  const seen = new Set<string>();
  const cleaned: GroupSortInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    cleaned.push(it);
  }

  let mode = pickGroupingMode(cleaned);
  let buckets = buildBuckets(cleaned, mode)
    .filter((b) => b.words.length >= MIN_PER_BUCKET)
    .sort((a, b) => b.words.length - a.words.length);

  // Fallback: if we don't have enough buckets, switch to alphabetical.
  if (buckets.length < numCategories) {
    mode = 'alpha';
    buckets = buildBuckets(cleaned, mode)
      .filter((b) => b.words.length >= MIN_PER_BUCKET)
      .sort((a, b) => b.words.length - a.words.length);
  }

  const chosen = buckets.slice(0, numCategories);

  // Build categories + items.
  const categories: GroupSortCategory[] = chosen.map((b) => {
    const lbl = labelFor(b.key, mode);
    const id = slug(b.key);
    return { id, label: lbl.en, label_pl: lbl.pl, emoji: lbl.emoji };
  });

  const items: GroupSortItem[] = [];
  for (let i = 0; i < chosen.length; i++) {
    const cat = categories[i];
    const picked = shuffle([...chosen[i].words], rng).slice(0, itemsPerCategory);
    for (const w of picked) {
      items.push({
        id: `${cat.id}:${slug(w.word)}`,
        label: w.word,
        correctCategoryId: cat.id,
      });
    }
  }

  // Final shuffle so items aren't grouped by category in the output array.
  return { categories, items: shuffle([...items], rng) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline self-test.
// ─────────────────────────────────────────────────────────────────────────────
if (isDirectRun('generateGroupSort.ts')) {
  const sample: GroupSortInput[] = [
    { word: 'bridge',    word_pl: 'most',     partOfSpeech: 'noun' },
    { word: 'tower',     word_pl: 'wieża',    partOfSpeech: 'noun' },
    { word: 'square',    word_pl: 'plac',     partOfSpeech: 'noun' },
    { word: 'walk',      word_pl: 'iść',      partOfSpeech: 'verb' },
    { word: 'cross',     word_pl: 'przejść', partOfSpeech: 'verb' },
    { word: 'climb',     word_pl: 'wspinać się', partOfSpeech: 'verb' },
    { word: 'ancient',   word_pl: 'starożytny', partOfSpeech: 'adjective' },
    { word: 'beautiful', word_pl: 'piękny',  partOfSpeech: 'adjective' },
    { word: 'narrow',    word_pl: 'wąski',   partOfSpeech: 'adjective' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateGroupSort(sample, { numCategories: 3, itemsPerCategory: 2, seed: 11 }), null, 2));
}
