// shell-selector.ts
// ─────────────────────────────────────────────────────────────────────────────
// Picks the best 3 practice shells for a given student based on their fossilized
// error categories, frequency, and CEFR level.
//
// Inputs:
//   - NormalisedKB (from kb-reader): the student's error profile
//   - studentLevel: their CEFR band (used as a soft filter)
//
// Output:
//   - PickedShell[]: 3 ranked shells with `weight` and `reason` so the UI can
//     explain "we suggested Gap-fill because you have 4 fossilized present-perfect
//     slips."
//
// Mapping rationale:
//   - grammar-tense / grammar-aspect / grammar-subordination → gapfill, truefalse,
//     dragdrop. These shells focus on form-correction with a single answer slot,
//     which is exactly the shape of "I am read → I have read".
//   - vocabulary / vocabulary-range → flashcards, matching, anagram. These are
//     recall + production drills.
//   - pronunciation → hangman (letter-by-letter spelling), flashcards (with
//     IPA + audio when wired).
//   - collocation → matching, gapfill, dragdrop.
//   - article / determiner → gapfill, dragdrop.
//   - default fallback (unknown category): flashcards, matching, gapfill.
// ─────────────────────────────────────────────────────────────────────────────

import type { NormalisedKB, KBError } from './kb-reader';

export type ShellKey =
  // ── Original 10 (gold-deploy 2026-04-26) ────────────────────────────
  | 'crossword'
  | 'wordsearch'
  | 'gapfill'
  | 'hangman'
  | 'matching'
  | 'flashcards'
  | 'dragdrop'
  | 'groupsort'
  | 'truefalse'
  | 'anagram'
  // ── Selection / exam-standard shells (Agent 1, 2026-05-02) ──────────
  | 'multiplechoice'      // The Bulletin Board — MUST be #1 in user-facing lists
  | 'opencloze'           // The Vellum Atelier
  | 'sentencetransform'   // The Translator's Booth
  | 'wordformation'       // The Mason's Yard
  | 'sentencecorrection'  // The Editor's Office
  | 'spellingbee'         // The Concert Hall
  | 'typingtest'          // The Telegraph Office
  // ── Arcade / game-feel shells (Agent 2, 2026-05-02) ─────────────────
  | 'openthebox'          // The Vault Room
  | 'spinthewheel'        // The Carnival Wheel
  | 'whackamole'          // The Subway Mole
  | 'balloonpop'          // The Rooftop Garden
  | 'snake'               // The Park Path
  | 'mazechase'           // The Backstreets
  | 'battleship'          // The Harbour Grid
  // ── Reading / listening / ordering shells (Agent 3, 2026-05-02) ─────
  | 'readingcomp'         // The Reading Room
  | 'listeningcomp'       // The Listening Booth
  | 'picturequiz'         // The Photography Salon
  | 'speakingcards'       // The Speakeasy
  | 'labelleddiagram'     // The Atrium Schematic
  | 'rankorder'           // The Election Hall
  | 'unjumble'            // The Puzzle Workshop
  // ── MCQ-wrapper variety shells (Agent 4, 2026-05-02) ────────────────
  | 'quizshow'            // The Auditorium
  | 'concentration'       // The Memory Cellar
  | 'findthematch'        // The Lost & Found
  | 'randomcards'         // The Dealer's Table
  | 'randomwheel'         // The Spinner Stand
  | 'airplane'            // The Aerodrome
  | 'flyingfruit';        // The Orchard Square

// Each error category maps to a weighted vote across shells.
// Weights are integers in [1, 5]; higher = stronger fit. Multiple Choice
// is the universal-fallback shell — it weights into every category at 3.
export const CATEGORY_TO_SHELLS: Record<string, Partial<Record<ShellKey, number>>> = {
  // GRAMMAR — form-correction shells
  'grammar-tense':         { multiplechoice: 4, gapfill: 5, truefalse: 4, dragdrop: 3, opencloze: 4, sentencecorrection: 4, sentencetransform: 4 },
  'grammar-aspect':        { multiplechoice: 4, gapfill: 5, truefalse: 4, dragdrop: 3, opencloze: 4, sentencecorrection: 4, sentencetransform: 4 },
  'grammar-subordination': { multiplechoice: 3, gapfill: 4, truefalse: 4, dragdrop: 4, opencloze: 4, unjumble: 4 },
  'grammar-modal':         { multiplechoice: 5, gapfill: 4, truefalse: 4, dragdrop: 3, sentencetransform: 5, sentencecorrection: 3 },
  'grammar-article':       { multiplechoice: 4, gapfill: 5, dragdrop: 4, truefalse: 3, opencloze: 5 },
  'grammar-determiner':    { multiplechoice: 4, gapfill: 5, dragdrop: 4, truefalse: 3, opencloze: 5 },
  'grammar-preposition':   { multiplechoice: 4, gapfill: 5, dragdrop: 4, truefalse: 3, opencloze: 5, balloonpop: 3 },
  'grammar-conditional':   { multiplechoice: 4, gapfill: 4, truefalse: 4, dragdrop: 3, sentencetransform: 4, sentencecorrection: 3 },
  'grammar-passive':       { multiplechoice: 4, gapfill: 4, truefalse: 3, dragdrop: 3, sentencetransform: 5, sentencecorrection: 4 },
  'grammar-agreement':     { multiplechoice: 4, gapfill: 4, truefalse: 4, sentencecorrection: 5 },
  'grammar-wordorder':     { multiplechoice: 3, dragdrop: 5, gapfill: 3, unjumble: 5, rankorder: 3 },

  // VOCABULARY
  'vocabulary':            { multiplechoice: 5, flashcards: 5, matching: 5, anagram: 4, picturequiz: 4, concentration: 4, findthematch: 4, whackamole: 3, balloonpop: 3 },
  'vocabulary-range':      { multiplechoice: 4, flashcards: 5, matching: 5, crossword: 4, picturequiz: 4, randomcards: 3, randomwheel: 3 },
  'vocabulary-precision':  { multiplechoice: 5, flashcards: 4, matching: 4, gapfill: 4, opencloze: 4 },
  'collocation':           { multiplechoice: 4, matching: 5, gapfill: 4, dragdrop: 4, opencloze: 4 },
  'idiom':                 { multiplechoice: 4, matching: 5, flashcards: 4, gapfill: 3, sentencetransform: 3 },
  'phrasal-verb':          { multiplechoice: 4, matching: 4, gapfill: 4, flashcards: 4, sentencetransform: 4 },
  'word-formation':        { multiplechoice: 4, wordformation: 5, gapfill: 3, sentencetransform: 3 },

  // PRONUNCIATION (low-fi support)
  'pronunciation':         { multiplechoice: 3, hangman: 4, flashcards: 4, anagram: 3, spellingbee: 5, speakingcards: 5, listeningcomp: 4 },
  'spelling':              { multiplechoice: 3, hangman: 5, anagram: 4, wordsearch: 3, spellingbee: 5, typingtest: 4 },

  // DISCOURSE
  'discourse':             { multiplechoice: 3, groupsort: 4, truefalse: 4, dragdrop: 3, readingcomp: 5, rankorder: 4, unjumble: 4 },
  'register':              { multiplechoice: 3, matching: 4, truefalse: 4, groupsort: 3, sentencetransform: 4 },

  // SKILLS — new for the integrated comprehension shells
  'reading':               { multiplechoice: 4, readingcomp: 5, opencloze: 4, picturequiz: 3 },
  'listening':             { multiplechoice: 4, listeningcomp: 5, spellingbee: 3, speakingcards: 3 },
  'speaking':              { multiplechoice: 3, speakingcards: 5, picturequiz: 3 },
  'writing':               { multiplechoice: 3, sentencecorrection: 5, sentencetransform: 5, wordformation: 4, opencloze: 4, typingtest: 3 },

  // FALLBACK — Multiple Choice always available because it's the universal
  // shell every grouping can render into.
  unknown:                 { multiplechoice: 4, flashcards: 3, matching: 3, gapfill: 3, picturequiz: 3 },
};

// Levels we treat as "early" — these students benefit more from recognition
// shells (matching, flashcards, picturequiz) than production shells.
const EARLY_LEVELS = new Set(['A1', 'A2', 'B1']);

const RECOGNITION_SHELLS: ShellKey[] = ['multiplechoice', 'matching', 'flashcards', 'wordsearch', 'crossword', 'picturequiz', 'concentration', 'findthematch', 'whackamole', 'balloonpop'];

export interface PickedShell {
  shell: ShellKey;
  weight: number;
  reason: string;          // bilingual-leaning sentence, EN-first
  topErrorIds: string[];   // KB error IDs that drove the pick
}

/**
 * pickShellsForStudent — score every shell, return top N (default 3).
 *
 * Algorithm:
 *   1. For each fossilized error in the KB, look up CATEGORY_TO_SHELLS[category]
 *      and add `categoryWeight * frequencyMultiplier` to that shell's score.
 *      `frequencyMultiplier = min(error.frequency, 5)`.
 *   2. Apply level bias: if the student is on EARLY_LEVELS, boost recognition
 *      shells by +1 each.
 *   3. Ensure variety: if the top picks are all from the same category bucket
 *      (e.g. all "grammar"), swap in the highest-scoring vocabulary shell.
 *   4. Build a human-readable reason from the dominant errors per pick.
 */
export function pickShellsForStudent(
  kb: NormalisedKB,
  studentLevel: string = 'B1',
  picks: number = 3,
): PickedShell[] {
  const scores = new Map<ShellKey, { weight: number; reasons: KBError[] }>();
  const bump = (shell: ShellKey, delta: number, err?: KBError) => {
    const cur = scores.get(shell) ?? { weight: 0, reasons: [] };
    cur.weight += delta;
    if (err && !cur.reasons.find((e) => e.id === err.id)) cur.reasons.push(err);
    scores.set(shell, cur);
  };

  // Score by KB errors.
  for (const err of kb.errors) {
    if (!err.fossilized) continue; // We focus on fossilized patterns.
    const mapping = CATEGORY_TO_SHELLS[err.category] ?? CATEGORY_TO_SHELLS.unknown;
    const freqMult = Math.min(Math.max(err.frequency, 1), 5);
    for (const [shell, baseWeight] of Object.entries(mapping)) {
      bump(shell as ShellKey, (baseWeight ?? 1) * freqMult, err);
    }
  }

  // Empty KB? Seed every shell with the unknown fallback so we always return
  // a sensible default for new students.
  if (scores.size === 0) {
    for (const [shell, w] of Object.entries(CATEGORY_TO_SHELLS.unknown)) {
      bump(shell as ShellKey, (w ?? 1) * 2);
    }
  }

  // Level bias.
  if (EARLY_LEVELS.has(studentLevel.toUpperCase())) {
    for (const s of RECOGNITION_SHELLS) bump(s, 1);
  }

  // Sort by weight desc, ties broken alphabetically for determinism.
  const ranked = [...scores.entries()]
    .map(([shell, info]) => ({ shell, ...info }))
    .sort((a, b) => b.weight - a.weight || a.shell.localeCompare(b.shell));

  // Variety guard: if the top-3 share <2 distinct categories, splice in a
  // diverse pick.
  const top = ranked.slice(0, picks);
  const cats = new Set<string>();
  for (const p of top) for (const r of p.reasons) cats.add(r.category.split('-')[0]);
  if (cats.size < 2 && ranked.length > picks) {
    const seenShellsTop = new Set(top.map((t) => t.shell));
    for (let i = picks; i < ranked.length; i++) {
      const cand = ranked[i];
      const candCats = new Set<string>();
      for (const r of cand.reasons) candCats.add(r.category.split('-')[0]);
      if ([...candCats].some((c) => !cats.has(c)) && !seenShellsTop.has(cand.shell)) {
        top[picks - 1] = cand;
        break;
      }
    }
  }

  return top.slice(0, picks).map((entry): PickedShell => ({
    shell: entry.shell,
    weight: entry.weight,
    reason: makeReason(entry.shell, entry.reasons),
    topErrorIds: entry.reasons.slice(0, 3).map((r) => r.id),
  }));
}

function makeReason(shell: ShellKey, reasons: KBError[]): string {
  if (reasons.length === 0) {
    return `Recommended starter shell.`;
  }
  const top = reasons[0];
  const titleSnippet = top.title.length > 60 ? `${top.title.slice(0, 57)}…` : top.title;
  return `Targets your ${top.category.replace(/-/g, ' ')} pattern: "${titleSnippet}".`;
}
