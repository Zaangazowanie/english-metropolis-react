// adapters.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-shell adapters that translate the generators' output (in
// `src/practice/generators/*`) into the internal shapes each shell renders.
//
// Each adapter is small and pure — given a generator puzzle, it returns the
// same shape the shell uses for its built-in `*_PUZZLE` / `*_DECK` constant.
//
// We keep adapters here (NOT inside each shell) so the shells stay decoupled
// from generator internals: when a generator's output shape changes, only
// this file is touched.
//
// FIX-A (2026-04-30) — wired up by StudentPractice.tsx so the per-student
// practice page mounts the GENERATED puzzle, not the design-canvas sample.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CrosswordPuzzle,
  WordsearchPuzzle,
  GapFillPuzzle,
  HangmanPuzzle,
  MatchingPuzzle,
  FlashcardsPuzzle,
  DragDropPuzzle,
  GroupSortPuzzle,
  TrueFalsePuzzle,
  AnagramPuzzle,
} from '../generators';

// ───────────────────────────────────────────────────────────────
// Shell-internal shapes — mirrored from each shell's *_PUZZLE constant.
// We re-declare them here so adapters can be tested without importing
// the React shells (which pull in DOM types).
// ───────────────────────────────────────────────────────────────

export interface ShellCrosswordWord {
  id: number;
  dir: 'across' | 'down';
  row: number;
  col: number;
  answer: string;
  clue: string;
  clue_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  shell .tsx files don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

export interface ShellCrosswordPuzzle {
  size: number;
  words: ShellCrosswordWord[];
}

export interface ShellWordsearchWord {
  word: string;
  clue: string;
  clue_pl: string;
  start: [number, number];
  end: [number, number];
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  shell .tsx files don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

export interface ShellWordsearchPuzzle {
  size: number;
  words: ShellWordsearchWord[];
  // Pre-built grid (with noise letters baked in by the generator). The shell
  // will use this directly when supplied; falls back to its built-in
  // buildWSGrid() when omitted (so the design-canvas demo still works).
  grid?: string[][];
}

export interface ShellGapFillGap {
  id: number;
  options: string[];
  answer: string;
  clue: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  shell .tsx files don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
  /** Convex `exercises.questions[i].explanationPL` — full post-answer rule
   *  with D2-augmented `<strong>` markup. Surfaces in PracticeReview's rule
   *  callouts. Added 2026-05-02 (D3-GapFill); the shell falls back to the
   *  scene's hint_pl when this is absent (vocab-generator path). */
  explanationPL?: string;
}

export interface ShellGapFillScene {
  id: string;
  shopName: string;
  shopName_pl: string;
  sign: Array<string | { gap: number }>;
  gaps: ShellGapFillGap[];
  hint_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  shell .tsx files don't carry it; only adapter-produced puzzles do.
   *  Mirrors the gap's exerciseId when a scene contains exactly one gap from
   *  one exercise (the typical case for adapter-produced GapFill). */
  exerciseId?: string;
}

export interface ShellGapFillPuzzle {
  scenes: ShellGapFillScene[];
}

export interface ShellHangmanPuzzle {
  word: string;
  clue: string;
  clue_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  shell .tsx files don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

export interface ShellMatchingPair {
  en: string;
  pl: string;
  line: 'magenta' | 'violet' | 'amber';
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  shell .tsx files don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

export interface ShellMatchingPuzzle {
  pairs: ShellMatchingPair[];
}

export interface ShellFlashcard {
  en: string;
  pl: string;
  hue: number;
  ex: string;
  ex_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  shell .tsx files don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
  /** Optional image URL. When absent or empty, the Flashcards shell hides
   *  the image slot entirely (no fake placeholder) and switches Bajla's
   *  copy to a text-only prompt — Kelly audit item #10 (Ricky 2026-05-02). */
  image_url?: string;
}

export interface ShellFlashcardsPuzzle {
  cards: ShellFlashcard[];
}

// DragDrop shell uses a sentence-with-gaps structure. The generator emits
// bins/items. The adapter rebuilds a synthetic sentence-deck: one scene per
// bin, where the sentence is "<binLabel>: ___" and the answers are the
// items belonging to that bin. The pool is the union of all items so the
// player must pick the right one.
export interface ShellDragDropScene {
  sentence: Array<string | { drop: number }>;
  answers: string[];
  pool: string[];
  hint: string;
  hint_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  shell .tsx files don't carry it; only adapter-produced puzzles do.
   *  One scene = one bin = items drawn from one or more exercises sharing a
   *  subCategory; this records the *first* contributing exerciseId. */
  exerciseId?: string;
}

export interface ShellDragDropPuzzle {
  scenes: ShellDragDropScene[];
}

export interface ShellGroupSortPuzzle {
  title: string;
  groups: Array<{ id: string; name: string; color: string }>;
  items: Array<{
    word: string;
    group: string;
    /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles
     *  in shell .tsx files don't carry it; only adapter-produced puzzles do. */
    exerciseId?: string;
  }>;
}

export interface ShellTrueFalseQuestion {
  q: string;
  q_pl: string;
  ans: boolean;
  fact: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  shell .tsx files don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

export interface ShellTrueFalsePuzzle {
  questions: ShellTrueFalseQuestion[];
}

export interface ShellAnagramPuzzle {
  word: string;
  clue: string;
  clue_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  shell .tsx files don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

// ───────────────────────────────────────────────────────────────
// Crossword — pass-through (shapes match exactly).
// ───────────────────────────────────────────────────────────────
export function adaptCrossword(gen: CrosswordPuzzle): ShellCrosswordPuzzle {
  return {
    size: gen.size,
    words: gen.words.map((w) => ({
      id: w.id,
      dir: w.dir,
      row: w.row,
      col: w.col,
      answer: w.answer,
      clue: w.clue,
      clue_pl: w.clue_pl,
    })),
  };
}

// ───────────────────────────────────────────────────────────────
// Wordsearch — generator emits (row, col, dir); shell wants
// start/end coordinate pairs. Translate via DIR_DELTA.
// ───────────────────────────────────────────────────────────────
const WS_DIR_DELTA: Record<string, [number, number]> = {
  right:            [0, 1],
  down:             [1, 0],
  'diag-down':      [1, 1],
  'diag-up':        [-1, 1],
  left:             [0, -1],
  up:               [-1, 0],
  'diag-down-left': [1, -1],
  'diag-up-left':   [-1, -1],
};

export function adaptWordsearch(gen: WordsearchPuzzle): ShellWordsearchPuzzle {
  return {
    size: gen.size,
    grid: gen.grid,
    words: gen.words.map((w) => {
      const delta = WS_DIR_DELTA[w.dir] ?? [0, 1];
      const [dr, dc] = delta;
      const len = w.word.length;
      const endR = w.row + dr * (len - 1);
      const endC = w.col + dc * (len - 1);
      return {
        word: w.word,
        clue: w.word_pl, // generator carries no English clue — use PL as both
        clue_pl: w.word_pl,
        start: [w.row, w.col],
        end: [endR, endC],
      };
    }),
  };
}

// ───────────────────────────────────────────────────────────────
// GapFill — generator emits prose with [GAPn] markers + a flat bank.
// Shell wants a tokenised `sign` array with { gap: n } slots and per-gap
// option lists. We split the generator's `text` on the [GAPn] markers and
// slice the bank into per-gap option lists (correct + 3 distractors each).
// ───────────────────────────────────────────────────────────────
export function adaptGapFill(gen: GapFillPuzzle): ShellGapFillPuzzle {
  const scenes: ShellGapFillScene[] = gen.scenes.map((sc, sceneIdx) => {
    // Split the gap-fill text on [GAPn] markers, preserving order.
    const parts: Array<string | { gap: number }> = [];
    const re = /\[GAP(\d+)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sc.text)) !== null) {
      if (m.index > last) parts.push(sc.text.slice(last, m.index));
      const idStr = m[1];
      const gapIdx = sc.gaps.findIndex((g) => g.id === `GAP${idStr}`);
      parts.push({ gap: gapIdx >= 0 ? gapIdx : Number(idStr) - 1 });
      last = m.index + m[0].length;
    }
    if (last < sc.text.length) parts.push(sc.text.slice(last));

    // Build per-gap option lists. The generator emits a single shared bank;
    // we hand every gap the full bank as its option pool. The shell already
    // de-dupes drawn words, so multi-gap scenes still play correctly.
    const sharedBank = sc.bank;
    const gaps: ShellGapFillGap[] = sc.gaps.map((g, idx) => ({
      id: idx,
      options: sharedBank,
      answer: g.answer,
      clue: sc.hint ?? 'Pick the right word',
    }));

    return {
      id: `gap-${sceneIdx}`,
      shopName: 'Practice',
      shopName_pl: 'Ćwiczenie',
      sign: parts,
      gaps,
      hint_pl: sc.hint_pl ?? '',
    };
  });

  return { scenes };
}

// ───────────────────────────────────────────────────────────────
// Hangman — generator emits ARRAY of HangmanPuzzle (word/word_pl/hint),
// shell wants ARRAY of {word, clue, clue_pl}. Map across.
// ───────────────────────────────────────────────────────────────
export function adaptHangman(gen: HangmanPuzzle | HangmanPuzzle[]): ShellHangmanPuzzle[] {
  const arr = Array.isArray(gen) ? gen : [gen];
  return arr.map((p) => ({
    word: p.word.toUpperCase().replace(/[^A-Z]/g, ''),
    clue: p.hint ?? `Polish: ${p.word_pl}`,
    clue_pl: p.hint_pl ?? p.word_pl,
  }));
}

// ───────────────────────────────────────────────────────────────
// Matching — pass-through (shapes match exactly).
// ───────────────────────────────────────────────────────────────
export function adaptMatching(gen: MatchingPuzzle): ShellMatchingPuzzle {
  return { pairs: gen.pairs };
}

// ───────────────────────────────────────────────────────────────
// Flashcards — pass-through (shapes match exactly).
// ───────────────────────────────────────────────────────────────
export function adaptFlashcards(gen: FlashcardsPuzzle): ShellFlashcardsPuzzle {
  return { cards: gen.cards };
}

// ───────────────────────────────────────────────────────────────
// DragDrop — generator emits bins/items (sort vocab into compartments);
// shell renders sentence-with-blanks. Build a scene per bin: prompt like
// "By land · lądem: ___ , ___" with the bin's items as answers and the
// full item pool as the option list. Players still drag the right items
// into the right slots.
// ───────────────────────────────────────────────────────────────
export function adaptDragDrop(gen: DragDropPuzzle): ShellDragDropPuzzle {
  const allItems = gen.items.map((it) => it.label);
  const scenes: ShellDragDropScene[] = gen.bins
    .map((bin) => {
      const itemsForBin = gen.items.filter((it) => it.correctBinId === bin.id);
      if (itemsForBin.length === 0) return null;
      // Build "Label · label_pl: [drop0] , [drop1] , ..." sentence.
      const sentence: Array<string | { drop: number }> = [
        `${bin.label} · ${bin.label_pl}:`,
      ];
      itemsForBin.forEach((_, i) => {
        sentence.push({ drop: i });
        if (i < itemsForBin.length - 1) sentence.push(',');
      });
      return {
        sentence,
        answers: itemsForBin.map((it) => it.label),
        pool: allItems,
        hint: `Drop the words that belong to "${bin.label}".`,
        hint_pl: `Wrzuć słowa pasujące do "${bin.label_pl}".`,
      };
    })
    .filter((s): s is ShellDragDropScene => s !== null);

  return { scenes };
}

// ───────────────────────────────────────────────────────────────
// GroupSort — generator emits { categories, items[] } with items[i].label
// + correctCategoryId. Shell wants { title, groups:[{id,name,color}], items:
// [{word, group}] }. Translate, assigning a colour cycle from a fixed palette.
// ───────────────────────────────────────────────────────────────
const GROUPSORT_COLORS = ['#E879F9', '#34D399', '#FBBF24', '#7DD3FC'];

export function adaptGroupSort(gen: GroupSortPuzzle): ShellGroupSortPuzzle {
  return {
    title: 'Sort the words · Posortuj słowa',
    groups: gen.categories.map((c, i) => ({
      id: c.id,
      name: `${c.label.toUpperCase()} · ${c.label_pl}`,
      color: GROUPSORT_COLORS[i % GROUPSORT_COLORS.length],
    })),
    items: gen.items.map((it) => ({ word: it.label, group: it.correctCategoryId })),
  };
}

// ───────────────────────────────────────────────────────────────
// TrueFalse — generator emits { statements:[{id,text,text_pl,answer,
// explanation}] }. Shell wants { questions:[{q,q_pl,ans,fact}] }.
// Translate field-for-field.
// ───────────────────────────────────────────────────────────────
export function adaptTrueFalse(gen: TrueFalsePuzzle): ShellTrueFalsePuzzle {
  return {
    questions: gen.statements.map((s) => ({
      q: s.text,
      q_pl: s.text_pl,
      ans: s.answer,
      fact: s.explanation ?? (s.answer ? 'True.' : 'False.'),
    })),
  };
}

// ───────────────────────────────────────────────────────────────
// Anagram — generator emits ARRAY of {word, word_pl, scrambledLetters, hint}.
// Shell wants ARRAY of {word, clue, clue_pl}. The shell builds its own
// scramble from the word, so we discard scrambledLetters and pass the hint
// fields through.
// ───────────────────────────────────────────────────────────────
export function adaptAnagram(gen: AnagramPuzzle | AnagramPuzzle[]): ShellAnagramPuzzle[] {
  const arr = Array.isArray(gen) ? gen : [gen];
  return arr.map((p) => ({
    word: p.word.toUpperCase().replace(/[^A-Z]/g, ''),
    clue: p.hint ?? `Polish: ${p.word_pl}`,
    clue_pl: p.word_pl,
  }));
}
