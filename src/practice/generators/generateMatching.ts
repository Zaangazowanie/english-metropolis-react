// generateMatching — EN<->PL pairs distributed across 3 metro "lines".
//
// Algorithm:
//   1. De-dupe input by EN word.
//   2. Take 8-12 (clamped to 3 * pairsPerLine).
//   3. Distribute round-robin across the three line colours (magenta, violet,
//      amber). The shell limits each line to 3-4 pairs cleanly.
//
// Notes:
//   - We deliberately don't try to group by partOfSpeech here — partOfSpeech
//     isn't carried through the function input signature, and the round-robin
//     gives a balanced colour spread regardless. If a future caller wants
//     subject-grouping, expose a `groupKey` field on the input items and
//     bucket by that field before round-robin.
//   - The shell's component (Matching.tsx) renders LINE_COLORS for these
//     three keys, so any new colour name added here would also need a UI
//     change.

import { makeRng, shuffle, isDirectRun } from './rng';

export type LineColor = 'magenta' | 'violet' | 'amber';

export interface MatchingPuzzle {
  pairs: Array<{ en: string; pl: string; line: LineColor }>;
}

const LINE_COLORS: LineColor[] = ['magenta', 'violet', 'amber'];
const DEFAULT_PAIRS_PER_LINE = 3;

export function generateMatching(
  input: Array<{ word: string; word_pl: string }>,
  opts?: { pairsPerLine?: number; seed?: number },
): MatchingPuzzle {
  const perLine = Math.max(1, Math.min(4, opts?.pairsPerLine ?? DEFAULT_PAIRS_PER_LINE));
  const target = perLine * LINE_COLORS.length; // 3..12
  const rng = makeRng(opts?.seed ?? 0xC1A0);

  const seen = new Set<string>();
  const pool: Array<{ en: string; pl: string }> = [];
  for (const item of input) {
    const en = item.word.trim().toLowerCase();
    if (!en || seen.has(en) || !item.word_pl) continue;
    seen.add(en);
    pool.push({ en, pl: item.word_pl });
  }

  const picked = shuffle([...pool], rng).slice(0, Math.min(target, pool.length));
  const pairs = picked.map((p, i) => ({
    en: p.en,
    pl: p.pl,
    line: LINE_COLORS[i % LINE_COLORS.length],
  }));

  return { pairs };
}

// ---- inline self-test ------------------------------------------------------
if (isDirectRun('generateMatching.ts')) {
  const sample = [
    { word: 'apple',   word_pl: 'jabłko' },
    { word: 'bread',   word_pl: 'chleb' },
    { word: 'water',   word_pl: 'woda' },
    { word: 'morning', word_pl: 'rano' },
    { word: 'evening', word_pl: 'wieczór' },
    { word: 'street',  word_pl: 'ulica' },
    { word: 'square',  word_pl: 'plac' },
    { word: 'bridge',  word_pl: 'most' },
    { word: 'metro',   word_pl: 'metro' },
  ];
  const out = generateMatching(sample, { pairsPerLine: 3, seed: 11 });
  // eslint-disable-next-line no-console
  console.log(out);
}
