// text.ts — small text helpers shared across practice shells.
//
// `normalise(s)` is the canonical answer-comparison helper for every shell
// that compares a free-text student answer to a target string. It folds
// diacritics, lower-cases, and trims/collapses whitespace so "Café  " and
// "cafe" both compare equal — which is what students intuitively expect for
// English-language exercises.
//
// Used by OpenCloze, SentenceTransform, WordFormation, SentenceCorrection,
// SpellingBee, Unjumble, and the new RankOrder/PictureQuiz/etc.

/**
 * Lower-cases, trims, collapses interior whitespace, and folds diacritics
 * so accented characters compare equal to their base letter.
 *
 *   normalise('  Café  ')     // → 'cafe'
 *   normalise('A   B  C')     // → 'a b c'
 *   normalise('naïve')        // → 'naive'
 */
export function normalise(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
