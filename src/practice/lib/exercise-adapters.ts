// exercise-adapters.ts — bridge from Convex `exercises` rows to per-shell puzzles.
// Two flavours of adapter:
//   1. Direct mappings — exercise shape already fits the shell
//      (gapfill / truefalse / matching / flashcards / dragdrop / groupsort).
//   2. Word-extraction mappings — pull `answer` / correct option from every
//      question, feed to existing generator + adapter
//      (crossword / wordsearch / anagram / hangman).
// Adapters return `null` for too-small / wrong-shape input; StudentPractice
// then falls back to the shell's built-in sample. Pure TS — no React/DOM/Convex.
import type {
  ShellCrosswordPuzzle, ShellWordsearchPuzzle, ShellGapFillPuzzle, ShellHangmanPuzzle,
  ShellMatchingPuzzle, ShellFlashcardsPuzzle, ShellDragDropPuzzle, ShellGroupSortPuzzle,
  ShellTrueFalsePuzzle, ShellAnagramPuzzle, ShellGapFillScene, ShellGapFillGap,
  ShellMatchingPair, ShellFlashcard, ShellTrueFalseQuestion, ShellDragDropScene,
} from './adapters';
import { generateCrossword, generateWordsearch, generateAnagram, generateHangman } from '../generators';
import { adaptCrossword, adaptWordsearch, adaptAnagram, adaptHangman } from './adapters';
// ShellKey lives in shell-selector (not shells/keys — that path doesn't exist).
import type { ShellKey } from './shell-selector';
// Suitability filter — gates exercises by content-shape per shell. Root-cause
// fix for Kelly's CC-1 (Picture Quiz / True/False / Word Formation / Sentence
// Correction blockers, audit 2026-05-02). filterExercisesForShell narrows the
// input pool BEFORE adapter dispatch; filterPuzzleForShell sanity-checks the
// adapter's output for shells where the unfitness only shows up on the puzzle.
import { filterExercisesForShell, filterPuzzleForShell } from './suitability';

// ── Public exercise shape (mirrors the Convex `exercises` table) ──
export interface ConvexExerciseQuestion {
  questionId: string;
  type: 'fill-blank' | 'multiple-choice';
  prompt: string;
  answer: string;
  options?: string[];
  instructionEN: string;
  instructionPL: string;
  hintPL?: string;
  explanationPL?: string;
  explanationENSimple?: string;
}

export interface ConvexExercise {
  exerciseId: string;
  category: string;
  subCategory: string;
  cefrLevel: string;
  difficultyTier: number;
  title: string;
  description: string;
  focusArea: string;
  questions: ConvexExerciseQuestion[];
  interferenceTags?: string[];
  polishDifficultyScore?: number;
}

// ── Helpers ──
const MIN_PUZZLE_QUESTIONS = 3;

function flattenQuestions(exercises: ConvexExercise[]): ConvexExerciseQuestion[] {
  const out: ConvexExerciseQuestion[] = [];
  for (const ex of exercises) {
    if (!ex || !Array.isArray(ex.questions)) continue;
    for (const q of ex.questions) {
      if (q && typeof q.prompt === 'string' && typeof q.answer === 'string') {
        out.push(q);
      }
    }
  }
  return out;
}

// Same as flattenQuestions but tags each question with its parent exerciseId,
// so adapters can embed it in shell question slots.
interface TaggedQuestion extends ConvexExerciseQuestion { exerciseId: string }
function flattenQuestionsTagged(exercises: ConvexExercise[]): TaggedQuestion[] {
  const out: TaggedQuestion[] = [];
  for (const ex of exercises) {
    if (!ex || !Array.isArray(ex.questions)) continue;
    for (const q of ex.questions) {
      if (q && typeof q.prompt === 'string' && typeof q.answer === 'string') {
        out.push({ ...q, exerciseId: ex.exerciseId });
      }
    }
  }
  return out;
}

function dedupeBy<T>(items: T[], keyFn: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = keyFn(it).toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

// Picture-Quiz distractor sanitiser. Implementation lives in its own
// module to avoid a circular import (exercise-adapters → generators →
// generatePictureQuiz → concretizeDistractors). Re-exported here for
// discoverability with the rest of the adapter helpers.
export { concretizeDistractors, isAbstractDistractor } from './concretize-distractors';

// Deterministic 0..359 hue for a given string.
function hueFor(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h % 360;
}

// Polish gloss for flashcard back: hintPL > instructionPL > explanationPL.
function pickPolishGloss(q: ConvexExerciseQuestion): string {
  if (q.hintPL) return q.hintPL;
  if (q.instructionPL) return q.instructionPL;
  return q.explanationPL ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// sanitiseHint — strip the answer out of a pre-answer Polish hint.
//
// 2026-05-02 (Kelly's audit, CC-2): the editorial pipeline puts the EN target
// form in `hintPL` for irregular-verb / past-participle drills, e.g.
//   answer: "found",   hintPL: "find → found"
//   answer: "broken",  hintPL: "break → broken"
//   answer: "made",    hintPL: "make → made"
// When that hintPL is rendered as a pre-answer "🇵🇱 hint" in Anagram, Hangman,
// Crossword, Wordsearch (and to a lesser extent GapFill / MultipleChoice), the
// answer is leaked before the student attempts the puzzle.
//
// Rules (in order):
//   1. If the hint matches "X → Y" where Y === answer, return "X (forma docelowa)".
//   2. If the hint contains the answer as a standalone word, replace with "___".
//   3. If neither rule applies, return the hint unchanged.
//   4. If the cleaned hint is empty / only punctuation, fall back to a generic
//      clue: "Forma czasownika." for verbs (heuristic: answer length ≤ 12 +
//      no spaces) else "Słowo z lekcji.".
//
// Pure function — no React/DOM/Convex dependency. Safe to unit-mind.
// NOT applied to `explanationPL` (post-answer rule, leak is intentional).
export function sanitiseHint(hintRaw: string | undefined, answer: string | undefined): string {
  if (!hintRaw) return '';
  if (!answer) return hintRaw;
  const ans = answer.toLowerCase().trim();
  if (!ans) return hintRaw;

  let out = hintRaw;

  // Rule 1: arrow-form "X → Y" where Y matches the answer.
  // Accept →, >, -> as separators; tolerate surrounding whitespace.
  const arrowMatch = hintRaw.match(/^(.+?)\s*(?:→|->|>)\s*(.+?)\s*$/);
  if (arrowMatch && arrowMatch[2].toLowerCase().trim() === ans) {
    out = `${arrowMatch[1].trim()} (forma docelowa)`;
  } else {
    // Rule 2: the answer appears as a standalone word inside the hint.
    const safeAns = ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${safeAns}\\b`, 'gi');
    if (re.test(hintRaw)) {
      out = hintRaw.replace(re, '___');
    }
  }

  // Rule 4: if cleaning emptied the hint (or left only punctuation), fall back.
  if (!/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(out)) {
    const isLikelyVerb = ans.length <= 12 && !/\s/.test(ans);
    return isLikelyVerb ? 'Forma czasownika.' : 'Słowo z lekcji.';
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// maskAnswerInPrompt — replace the answer (and morphological variants of it)
// inside a prompt sentence with `___`.
//
// 2026-05-02 (CD audit, cross-cutting #19): word-tile shells where the user
// must SELECT the answer-word from a set of tiles (Spin the Wheel, Whack-a-Mole,
// Balloon Pop, Snake, Maze Chase, Find the Match, Concentration, Quiz Show,
// Orchard Square / Flying Fruit) currently render prompts where the answer
// literally appears. Aerodrome (Airplane) already gap-masks via the existing
// `blankExample` helper inside generateMultipleChoice — this lifts the same
// idea into a shared, more-tolerant utility so every word-tile adapter can
// apply it consistently and so morphological variants (plurals, past tense,
// derivations like "dependencies" ↔ "dependency") get caught too.
//
// Strategy:
//   1. Sentinel guard: leave `___NO_ERROR___` (and any other underscore-flanked
//      sentinel) alone — those are mechanic markers, not real answers.
//   2. Whole-phrase match (case-insensitive, word-boundary-aware): if the answer
//      is a multi-word phrase like "back on track", mask the full phrase first.
//   3. Whole-word match (case-insensitive) on the canonical answer.
//   4. Inflection variants:
//        • bare-lemma trim: answer ends in -ing / -ed / -es / -s → try lemma
//          (handles "running" answer when prompt has "run", and vice versa)
//        • plural / 3rd-person variants of the answer: try answer + "s" and
//          answer + "es"
//        • -y → -ies derivation: answer "dependency" → "dependencies"
//        • past-tense / participle variants: answer + "d" / "ed"
//   5. Stem-fallback: if the answer is ≥ 5 chars, find any token in the prompt
//      whose first 5 chars share a case-insensitive prefix with the answer's
//      first 5 chars AND whose total length is within ±3 chars of the answer.
//      Mask the matched token. This catches "dependencies" ↔ "dependency",
//      "resilient" ↔ "resilience", etc.
//   6. If nothing matched, return the prompt unchanged. The caller decides
//      whether to drop the question or keep it as-is — the helper does NOT
//      force a blank.
//
// Pure function — no React/DOM/Convex dependency.
const MASK_TOKEN = '___';
const SENTINEL_RE = /^_{2,}[A-Z_]+_{2,}$/;

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build the morphological variants we'll try for a single-word answer.
// Order matters: longer / more-specific variants first so we don't strip a
// shorter prefix when a longer one would match. De-duped, all lower-case.
function buildVariants(answerLower: string): string[] {
  const variants = new Set<string>();
  variants.add(answerLower);

  // -y → -ies (and back).
  if (answerLower.endsWith('y') && answerLower.length >= 3) {
    variants.add(answerLower.slice(0, -1) + 'ies');
  }
  if (answerLower.endsWith('ies') && answerLower.length >= 4) {
    variants.add(answerLower.slice(0, -3) + 'y');
  }

  // Plural / 3rd-person / -es.
  variants.add(answerLower + 's');
  variants.add(answerLower + 'es');

  // Past tense / participle.
  variants.add(answerLower + 'd');
  variants.add(answerLower + 'ed');

  // Forward -ing / -er / -est for short answers (regular conjugation).
  variants.add(answerLower + 'ing');
  variants.add(answerLower + 'er');

  // Doubled-consonant inflections for short CVC verbs (run → running/runned,
  // flag → flagged/flagging, stop → stopped/stopping). Only when the answer
  // ends in a single consonant after a single vowel after a consonant — the
  // classic CVC pattern that triggers consonant-doubling in English.
  if (answerLower.length >= 3) {
    const last = answerLower.slice(-1);
    const mid = answerLower.slice(-2, -1);
    const first = answerLower.slice(-3, -2);
    const isVowel = (c: string) => /[aeiou]/.test(c);
    if (!isVowel(last) && isVowel(mid) && !isVowel(first) && last !== 'y' && last !== 'w') {
      variants.add(answerLower + last + 'ed');
      variants.add(answerLower + last + 'ing');
      variants.add(answerLower + last + 'er');
    }
  }

  // Strip common inflection suffixes to get a candidate lemma.
  // -ing (running → run, biking → bike: handled later by stem fallback)
  if (answerLower.endsWith('ing') && answerLower.length >= 5) {
    variants.add(answerLower.slice(0, -3));
    // doubled-consonant case: running → run
    const stripped = answerLower.slice(0, -3);
    if (stripped.length >= 2 && stripped.charAt(stripped.length - 1) === stripped.charAt(stripped.length - 2)) {
      variants.add(stripped.slice(0, -1));
    }
  }
  if (answerLower.endsWith('ed') && answerLower.length >= 4) {
    variants.add(answerLower.slice(0, -2));
    variants.add(answerLower.slice(0, -1)); // -ed → -e (loved → love)
  }
  if (answerLower.endsWith('es') && answerLower.length >= 4) {
    variants.add(answerLower.slice(0, -2));
    variants.add(answerLower.slice(0, -1));
  }
  if (answerLower.endsWith('s') && answerLower.length >= 3) {
    variants.add(answerLower.slice(0, -1));
  }

  // Drop the original (we'll always test it explicitly first), drop empties,
  // sort by length DESC so longer variants are tried first.
  variants.delete('');
  return Array.from(variants).sort((a, b) => b.length - a.length);
}

export function maskAnswerInPrompt(prompt: string, answer: string): string {
  if (!prompt) return prompt;
  if (!answer) return prompt;

  // 1. Sentinel guard — never mask if the answer itself is a sentinel.
  if (SENTINEL_RE.test(answer.trim())) return prompt;

  const answerTrim = answer.trim();
  const answerLower = answerTrim.toLowerCase();
  if (!answerLower) return prompt;

  // 2. Multi-word phrase: try the full phrase first (whole-word boundaries).
  if (/\s/.test(answerTrim)) {
    const safe = escapeForRegex(answerTrim);
    // Allow flexible internal whitespace.
    const phraseRe = new RegExp(`\\b${safe.replace(/\\?\s+/g, '\\s+')}\\b`, 'i');
    if (phraseRe.test(prompt)) {
      return prompt.replace(phraseRe, MASK_TOKEN);
    }
    // No multi-word match — fall through to single-word logic on first token,
    // which often catches "back on track" → matches "track" alone. Skip if
    // the head word is a stop word (e.g. "back on track" → don't mask "back").
    return prompt;
  }

  // 3 + 4. Whole-word + inflection variants. Try every variant on a single
  // case-insensitive whole-word regex. First match wins (longest variant first).
  const variants = buildVariants(answerLower);
  for (const v of variants) {
    const safe = escapeForRegex(v);
    const re = new RegExp(`\\b${safe}\\b`, 'i');
    if (re.test(prompt)) {
      return prompt.replace(re, MASK_TOKEN);
    }
  }

  // 5. Stem fallback for ≥ 5-char answers — mask the closest token sharing
  // the first 5 chars (case-insensitive) and total length within ±3 chars.
  if (answerLower.length >= 5) {
    const stem = answerLower.slice(0, 5);
    // Tokenise the prompt on word boundaries so we can replace exactly one
    // matched token.
    const tokenRe = /[A-Za-z][A-Za-z'-]*/g;
    const matches: { token: string; index: number; score: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(prompt)) !== null) {
      const tok = m[0];
      const tokLower = tok.toLowerCase();
      if (tokLower === answerLower) continue; // already handled above
      if (tokLower.length < 4) continue;
      if (Math.abs(tokLower.length - answerLower.length) > 4) continue;
      if (!tokLower.startsWith(stem)) continue;
      // Score: closer length wins.
      matches.push({ token: tok, index: m.index, score: Math.abs(tokLower.length - answerLower.length) });
    }
    if (matches.length > 0) {
      matches.sort((a, b) => a.score - b.score);
      const best = matches[0];
      return prompt.slice(0, best.index) + MASK_TOKEN + prompt.slice(best.index + best.token.length);
    }
  }

  // 6. No match — return prompt unchanged. Caller decides whether to drop.
  return prompt;
}

// ── 1. exercisesToGapFill — fill-blank → ShellGapFillPuzzle ──
const FILL_BLANK_TOKEN_RE = /(\[GAP\d+\]|_{2,}|\.{3,}|\bBLANK\b)/i;

function distractorsFromOthers(answer: string, others: string[], n: number): string[] {
  const ans = answer.toLowerCase().trim();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const o of others) {
    const k = o.toLowerCase().trim();
    if (!k || k === ans || seen.has(k)) continue;
    seen.add(k);
    out.push(o);
    if (out.length >= n) break;
  }
  return out;
}

export function exercisesToGapFill(exercises: ConvexExercise[]): ShellGapFillPuzzle | null {
  const fillQs = flattenQuestionsTagged(exercises).filter((q) => q.type === 'fill-blank');
  if (fillQs.length < MIN_PUZZLE_QUESTIONS) return null;
  const allAnswers = fillQs.map((q) => q.answer);

  const scenes: ShellGapFillScene[] = fillQs.map((q, i) => {
    // Replace the first blank-token in the prompt with [GAP1]; if no blank,
    // append one at the end.
    const promptTokenised = FILL_BLANK_TOKEN_RE.test(q.prompt)
      ? q.prompt.replace(FILL_BLANK_TOKEN_RE, '[GAP1]')
      : `${q.prompt.trim()} [GAP1]`;

    const sign: Array<string | { gap: number }> = [];
    const re = /\[GAP1\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(promptTokenised)) !== null) {
      if (m.index > last) sign.push(promptTokenised.slice(last, m.index));
      sign.push({ gap: 0 });
      last = m.index + m[0].length;
    }
    if (last < promptTokenised.length) sign.push(promptTokenised.slice(last));

    // Bank: question's own options if present, else distractors from siblings.
    let bank = q.options && q.options.length > 1
      ? q.options.slice()
      : [q.answer, ...distractorsFromOthers(q.answer, allAnswers, 3)];
    if (!bank.some((b) => b.toLowerCase() === q.answer.toLowerCase())) {
      bank = [q.answer, ...bank];
    }

    return {
      id: `ex-${q.questionId || i}`,
      shopName: 'Practice',
      shopName_pl: 'Ćwiczenie',
      sign,
      gaps: [{ id: 0, options: bank, answer: q.answer, clue: q.instructionEN || 'Fill the gap', exerciseId: q.exerciseId, explanationPL: q.explanationPL } satisfies ShellGapFillGap],
      // 2026-05-02 (CC-2 fix): hint_pl is a pre-answer hint in GapFill;
      // sanitise so "do → done" doesn't reveal the answer.
      hint_pl: sanitiseHint(q.hintPL ?? q.instructionPL ?? '', q.answer),
      exerciseId: q.exerciseId,
    };
  });

  return { scenes };
}

// ── 2. exercisesToTrueFalse — multiple-choice → ShellTrueFalsePuzzle ──
// Per MC question, alternate emitting a TRUE pairing (with the correct option)
// and a FALSE pairing (with a wrong option). Lands near a 50/50 mix.
export function exercisesToTrueFalse(exercises: ConvexExercise[]): ShellTrueFalsePuzzle | null {
  const mcQs = flattenQuestionsTagged(exercises).filter(
    (q) => q.type === 'multiple-choice' && Array.isArray(q.options) && q.options.length >= 2,
  );
  if (mcQs.length < MIN_PUZZLE_QUESTIONS) return null;

  const built: ShellTrueFalseQuestion[] = [];
  for (const q of mcQs) {
    const opts = q.options ?? [];
    const correct = q.answer;
    const wrong = opts.find((o) => o.toLowerCase().trim() !== correct.toLowerCase().trim());
    if (!wrong) continue;

    const baseEN = q.prompt.trim();
    const basePL = q.instructionPL.trim();
    const fact = q.explanationENSimple ?? q.instructionEN ?? '';

    // Alternate TRUE / FALSE pairings to land ~50/50.
    if (built.length % 2 === 0) {
      built.push({
        q: `${baseEN} → "${correct}"`,
        q_pl: basePL ? `${basePL} → „${correct}"` : `"${correct}"`,
        ans: true,
        fact: fact || `Correct: ${correct}.`,
        exerciseId: q.exerciseId,
      });
    } else {
      built.push({
        q: `${baseEN} → "${wrong}"`,
        q_pl: basePL ? `${basePL} → „${wrong}"` : `"${wrong}"`,
        ans: false,
        fact: fact || `Correct answer is "${correct}", not "${wrong}".`,
        exerciseId: q.exerciseId,
      });
    }
  }

  if (built.length < MIN_PUZZLE_QUESTIONS) return null;
  return { questions: built };
}

// ── 3. exercisesToMatching — vocab EN/PL pairs → ShellMatchingPuzzle ──
// Strongest for vocabulary category; non-vocab items only if the EN side is
// short (≤ 4 tokens), otherwise the matching grid gets unreadable.
const MATCHING_LINE_COLORS: Array<ShellMatchingPair['line']> = ['magenta', 'violet', 'amber'];

export function exercisesToMatching(exercises: ConvexExercise[]): ShellMatchingPuzzle | null {
  const candidates: Array<{ en: string; pl: string; exerciseId: string }> = [];
  for (const ex of exercises) {
    const isVocab = (ex.category ?? '').toLowerCase().includes('vocab');
    for (const q of ex.questions ?? []) {
      // EN = prompt; PL = best PL-bearing field. Require *some* PL.
      const en = q.prompt.trim();
      const pl = (q.hintPL ?? q.instructionPL ?? '').trim();
      if (!en || !pl) continue;
      // Skip full-sentence drills outside vocab — matching wants short phrases.
      if (!isVocab && en.split(/\s+/).length > 4) continue;
      // 2026-05-01 (CD re-audit, sprint 3): the prior 14-char filter kept
      // phrasal vocab ("przewlekły ból", "ujemny wpływ") out of Matching,
      // which was a pedagogical loss — multi-word collocations are exactly
      // where Polish→English interference happens most. The Matching shell
      // now has an HTML stacked-grid fallback at ≤768px viewports that
      // wraps long phrases properly, and at desktop the SVG chips auto-
      // scale width with text length. So we let phrasal items through and
      // only block extreme cases (>4 tokens or >24 chars on either side).
      if (en.length > 24 || pl.length > 24) continue;
      if (en.split(/\s+/).length > 4 || pl.split(/\s+/).length > 4) continue;
      candidates.push({ en: en.toLowerCase(), pl, exerciseId: ex.exerciseId });
    }
  }
  const deduped = dedupeBy(candidates, (c) => c.en);
  if (deduped.length < MIN_PUZZLE_QUESTIONS) return null;

  // Take up to 9 (3 per colour group).
  const trimmed = deduped.slice(0, 9);
  const pairs: ShellMatchingPair[] = trimmed.map((p, i) => ({
    en: p.en,
    pl: p.pl,
    line: MATCHING_LINE_COLORS[i % MATCHING_LINE_COLORS.length],
    exerciseId: p.exerciseId,
  }));
  return { pairs };
}

// ── 4. exercisesToFlashcards — front: EN prompt; back: PL gloss + example ──
export function exercisesToFlashcards(exercises: ConvexExercise[]): ShellFlashcardsPuzzle | null {
  const cardsRaw: ShellFlashcard[] = [];
  for (const ex of exercises) {
    for (const q of ex.questions ?? []) {
      const en = q.prompt.trim();
      const pl = pickPolishGloss(q).trim();
      if (!en || !pl) continue;
      cardsRaw.push({
        en: en.toLowerCase(),
        pl,
        hue: hueFor(en),
        ex: q.explanationENSimple ?? q.instructionEN ?? '',
        ex_pl: q.explanationPL ?? q.instructionPL ?? '',
        exerciseId: ex.exerciseId,
      });
    }
  }
  const cards = dedupeBy(cardsRaw, (c) => c.en).slice(0, 12);
  if (cards.length < MIN_PUZZLE_QUESTIONS) return null;
  return { cards };
}

// ── Word extraction — used by crossword / wordsearch / anagram / hangman ──
export interface ExtractedWord {
  word: string;
  word_pl: string;
  clue?: string;
  /** Originating Convex `exercises.exerciseId`. Adapter-only — generators
   *  don't carry this through, so word→exerciseId is re-joined by the
   *  word-extraction adapters below via the lookup map built here. */
  exerciseId: string;
}

export function extractWordList(exercises: ConvexExercise[]): ExtractedWord[] {
  const out: ExtractedWord[] = [];
  for (const ex of exercises) {
    for (const q of ex.questions ?? []) {
      // Target word = the correct answer; reject multi-word strings.
      const target = (q.answer ?? '').trim();
      if (!target) continue;
      if (/\s/.test(target)) continue;
      // 2026-05-02 (CC-2 fix): word_pl renders as "🇵🇱 clue_pl" BEFORE the
      // student answers in Anagram / Hangman / Crossword / Wordsearch.
      // sanitiseHint strips arrow-form leaks ("find → found") and standalone
      // answer-word occurrences, falling back to a generic Polish clue.
      const rawHint = (q.hintPL ?? q.instructionPL ?? target).trim();
      // Filter out generic MCQ-style instructions that leak into the clue
      // when an exercise designed for MCQ gets recycled into Hangman /
      // Anagram / Wordsearch. "Choose the correct answer" etc. is useless
      // as a meaning clue. (2026-05-03, Mike's screenshot.)
      const rawClue = (q.instructionEN ?? '').trim();
      const isGenericClue = /^(choose|pick|select)\b.*\banswer\b/i.test(rawClue)
        || /^(complete the|fill the|gap[\s-]?fill)/i.test(rawClue)
        // 2026-05-03 (Mike screenshot): some Convex content has English instruction
        // = "Polish: <PL text>" — that's a content-pipeline labelling artefact, not
        // a real EN clue. Filter it so the brief doesn't show "Polish: …" inline.
        || /^polish\s*[:.]/i.test(rawClue)
        || /^(write|complete|fill)\s+the\s+/i.test(rawClue)
        || rawClue.length < 6;
      out.push({
        word: target,
        word_pl: sanitiseHint(rawHint, target),
        clue: isGenericClue ? undefined : rawClue,
        exerciseId: ex.exerciseId,
      });
    }
  }
  return dedupeBy(out, (w) => w.word);
}

// Build an A-Z-only word → exerciseId lookup for the word-extraction
// adapters. The generators strip case AND non-ASCII (e.g. `jabłko` → `JABKO`),
// so the map key and lookup key must use the same `[^A-Z]` normalisation.
function normaliseWordKey(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '');
}
function buildWordExerciseMap(words: ExtractedWord[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const w of words) {
    const k = normaliseWordKey(w.word);
    if (!k) continue;
    if (!map.has(k)) map.set(k, w.exerciseId);
  }
  return map;
}

// ── 5. exercisesToCrossword ──
export function exercisesToCrossword(
  exercises: ConvexExercise[],
): ShellCrosswordPuzzle | null {
  const words = extractWordList(exercises).filter(
    (w) => w.word.length >= 3 && w.word.length <= 10,
  );
  if (words.length < 6) return null;
  const wordToEx = buildWordExerciseMap(words);
  const generated = generateCrossword(
    words.map((w) => ({ word: w.word, clue: w.clue ?? w.word, clue_pl: w.word_pl })),
    { seed: 0xC405EE | (words.length * 31) },
  );
  if (!generated.words || generated.words.length === 0) return null;
  const adapted = adaptCrossword(generated);
  adapted.words = adapted.words.map((w) => ({
    ...w,
    exerciseId: wordToEx.get(normaliseWordKey(w.answer)),
  }));
  return adapted;
}

// ── 6. exercisesToWordsearch ──
export function exercisesToWordsearch(
  exercises: ConvexExercise[],
): ShellWordsearchPuzzle | null {
  const words = extractWordList(exercises).filter(
    (w) => w.word.length >= 3 && w.word.length <= 11,
  );
  if (words.length < 5) return null;
  const wordToEx = buildWordExerciseMap(words);
  const generated = generateWordsearch(
    words.map((w) => ({ word: w.word, word_pl: w.word_pl })),
    { seed: 0xCAFE3E | (words.length * 17) },
  );
  if (!generated.words || generated.words.length === 0) return null;
  const adapted = adaptWordsearch(generated);
  adapted.words = adapted.words.map((w) => ({
    ...w,
    exerciseId: wordToEx.get(normaliseWordKey(w.word)),
  }));
  return adapted;
}

// ── 7. exercisesToAnagram ──
export function exercisesToAnagram(
  exercises: ConvexExercise[],
): ShellAnagramPuzzle[] | null {
  const words = extractWordList(exercises).filter(
    (w) => w.word.length >= 5 && w.word.length <= 8,
  );
  if (words.length < MIN_PUZZLE_QUESTIONS) return null;
  const wordToEx = buildWordExerciseMap(words);
  const generated = generateAnagram(
    words.map((w) => ({ word: w.word, word_pl: w.word_pl, clue: w.clue })),
    { seed: 0xA1A777 | (words.length * 7) },
  );
  if (!generated || generated.length === 0) return null;
  return adaptAnagram(generated).map((p) => ({
    ...p,
    exerciseId: wordToEx.get(normaliseWordKey(p.word)),
  }));
}

// ── 8. exercisesToHangman ──
export function exercisesToHangman(
  exercises: ConvexExercise[],
): ShellHangmanPuzzle[] | null {
  const words = extractWordList(exercises).filter((w) => w.word.length >= 4);
  if (words.length < MIN_PUZZLE_QUESTIONS) return null;
  const wordToEx = buildWordExerciseMap(words);
  const generated = generateHangman(
    words.map((w) => ({ word: w.word, word_pl: w.word_pl, clue: w.clue })),
    { seed: 0xA47A77 | (words.length * 11) },
  );
  if (!generated || generated.length === 0) return null;
  return adaptHangman(generated).map((p) => ({
    ...p,
    exerciseId: wordToEx.get(normaliseWordKey(p.word)),
  }));
}

// ── Shared bucket builder for DragDrop + GroupSort ──
// Polish translations for the subCategory keys that show up most in the
// 8K-question dataset. Keys without an entry fall through to the English
// pretty-label (and the bin renders English-only — see prettyBin below).
//
// 2026-05-01 (Mike's screenshot): "Present Perfect · present perfect:" was
// reading as a duplicate because Polish ESL texts borrow the English name
// for these tenses. Switched to "czas Present Perfect" and added entries
// for the other top subCategories from the editorial-pipeline tally
// (past-simple-irregular: 74 fixes, gerund-patterns: 14, etc.).
const DRAGDROP_PL_LABELS: Record<string, string> = {
  'present-simple':            'czas teraźniejszy prosty',
  'past-simple':               'czas przeszły prosty',
  'past-simple-irregular':     'przeszły — nieregularne',
  'future-simple':             'czas przyszły prosty',
  'present-perfect':           'czas Present Perfect',
  'past-perfect':              'czas Past Perfect',
  'present-continuous':        'czas teraźniejszy ciągły',
  'past-continuous':           'czas przeszły ciągły',
  'continuous':                'czas ciągły',
  'gerund-patterns':           'gerundium',
  'infinitive-patterns':       'bezokolicznik',
  'reflexive-pronouns':        'zaimki zwrotne',
  'object-pronouns':           'zaimki dopełnieniowe',
  'subject-pronouns':          'zaimki osobowe',
  'there-is-are':              'there is / there are',
  'reported-speech':           'mowa zależna',
  'present-simple-agreement':  'zgodność podmiotu z orzeczeniem',
  'defining-relative-clauses': 'zdania względne',
  'key-word-transformation':   'przekształcenia',
  'mixed':                     'mieszane',
  'emotions':                  'emocje',
  'feelings-emotions':         'uczucia i emocje',
  'appearance':                'wygląd',
  'to-be':                     'czasownik to be',
  'vocabulary':                'słownictwo',
};
const GROUPSORT_COLORS = ['#E879F9', '#34D399', '#FBBF24', '#7DD3FC'];

function prettyLabel(slug: string): string {
  return slug.split(/[-_]/g).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

interface BucketItem { word: string; exerciseId: string }
function bucketByCategory(
  exercises: ConvexExercise[],
): Array<{ key: string; items: BucketItem[] }> {
  const buckets = new Map<string, BucketItem[]>();
  for (const ex of exercises) {
    const key = (ex.subCategory || ex.category || '').toLowerCase().trim();
    if (!key) continue;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = []; buckets.set(key, bucket); }
    for (const q of ex.questions ?? []) {
      const ans = (q.answer ?? '').trim();
      if (!ans || ans.length > 24) continue;
      bucket.push({ word: ans, exerciseId: ex.exerciseId });
    }
  }
  const usable: Array<{ key: string; items: BucketItem[] }> = [];
  for (const [key, items] of buckets) {
    // Dedupe by word (case-insensitive), preserving the first exerciseId.
    const seen = new Set<string>();
    const deduped: BucketItem[] = [];
    for (const it of items) {
      const k = it.word.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(it);
      if (deduped.length >= 4) break;
    }
    if (deduped.length === 0) continue;
    usable.push({ key, items: deduped });
  }
  return usable;
}

// ── 9. exercisesToDragDrop — bins by subCategory ──
export function exercisesToDragDrop(
  exercises: ConvexExercise[],
): ShellDragDropPuzzle | null {
  const usable = bucketByCategory(exercises);
  if (usable.length < 2) return null;
  const allItems = usable.flatMap((b) => b.items.map((it) => it.word));
  const scenes: ShellDragDropScene[] = usable.map((bin) => {
    const enLabel = prettyLabel(bin.key);
    const plLabel = DRAGDROP_PL_LABELS[bin.key] ?? enLabel;
    // If the EN and PL labels collapse to the same string (case-insensitive),
    // render the bilingual separator only once. Otherwise "Present Perfect ·
    // present perfect:" reads as a redundant duplicate to students.
    const headline =
      enLabel.toLowerCase() === plLabel.toLowerCase()
        ? `${enLabel}:`
        : `${enLabel} · ${plLabel}:`;
    const sentence: Array<string | { drop: number }> = [headline];
    bin.items.forEach((_, i) => {
      sentence.push({ drop: i });
      if (i < bin.items.length - 1) sentence.push(',');
    });
    return {
      sentence,
      answers: bin.items.map((it) => it.word),
      pool: allItems,
      hint: `Drop the words that belong to "${enLabel}".`,
      hint_pl: `Wrzuć słowa pasujące do „${plLabel}".`,
      // First contributing exerciseId for the bin (multiple exercises may
      // share a subCategory; we record the first as the scene's primary).
      exerciseId: bin.items[0]?.exerciseId,
    };
  });
  return { scenes };
}

// ── 10. exercisesToGroupSort ──
export function exercisesToGroupSort(
  exercises: ConvexExercise[],
): ShellGroupSortPuzzle | null {
  const usable = bucketByCategory(exercises);
  if (usable.length < 2) return null;
  const groups = usable.map((b, i) => {
    const enLabel = prettyLabel(b.key).toUpperCase();
    const plLabel = DRAGDROP_PL_LABELS[b.key] ?? prettyLabel(b.key);
    // Skip the bilingual separator when both sides collapse to the same
    // string (case-insensitive). Otherwise GroupSort bins read as e.g.
    // "PRESENT PERFECT · present perfect" — redundant.
    const name =
      enLabel.toLowerCase() === plLabel.toLowerCase()
        ? enLabel
        : `${enLabel} · ${plLabel}`;
    return { id: b.key, name, color: GROUPSORT_COLORS[i % GROUPSORT_COLORS.length] };
  });
  const items = usable.flatMap((b) =>
    b.items.map((it) => ({ word: it.word, group: b.key, exerciseId: it.exerciseId })),
  );
  if (items.length < MIN_PUZZLE_QUESTIONS) return null;
  return { title: 'Sort the words · Posortuj słowa', groups, items };
}

// ── exercisesToMultipleChoice — multiple-choice → ShellMultipleChoicePuzzle ──
// Sprint-2 (CD audit, 2026-05-02): wires convex.exercises[type=multiple-choice]
// directly into the MC shell's puzzle shape, threading explanationPL THROUGH
// so the review screen's rule callouts render with the augmented <strong>
// markup. Skips question-types other than multiple-choice; falls back when
// fewer than MIN_PUZZLE_QUESTIONS usable items.
//
// Distractor handling: if a question has an options[] array (most do), use it
// verbatim. The answerIndex is computed by finding the canonical answer string
// in options. If options is missing or doesn't contain the answer, the question
// is skipped (we don't synthesize fake options for MC — that risks confusing
// students with semantically-wrong distractors from sibling questions).
export interface ShellMultipleChoiceQuestion {
  id: string;
  prompt: string;
  prompt_pl?: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
  /** Augmented post-answer rule explanation — surfaces in the review's callouts. */
  explanationPL?: string;
}
export interface ShellMultipleChoicePuzzleAdapter {
  questions: ShellMultipleChoiceQuestion[];
}
export function exercisesToMultipleChoice(
  exercises: ConvexExercise[],
): ShellMultipleChoicePuzzleAdapter | null {
  const mcQs = flattenQuestionsTagged(exercises).filter((q) => q.type === 'multiple-choice');
  const usable: ShellMultipleChoiceQuestion[] = [];
  for (const q of mcQs) {
    if (!q.options || q.options.length < 2) continue;
    const answerIndex = q.options.findIndex(
      (o) => o.trim().toLowerCase() === q.answer.trim().toLowerCase(),
    );
    if (answerIndex < 0) continue;
    usable.push({
      id: q.questionId || `ex-${q.exerciseId}`,
      // 2026-05-02 (CD audit, cross-cutting #19): when the prompt sentence
      // literally contains the canonical answer (e.g. "Her resilience allowed
      // her to stay focused..." with answer "resilience"), mask it with `___`
      // so the student isn't handed the answer in the question text. The
      // helper also catches morphological variants ("dependencies" when the
      // answer is "dependency", "pickpockets" when the answer is "pickpocket").
      // No-op when the answer doesn't appear in the prompt.
      prompt: maskAnswerInPrompt(q.prompt, q.answer),
      prompt_pl: q.instructionPL,
      options: q.options.slice(),
      answerIndex,
      hint: q.instructionEN || 'Pick the correct option.',
      // 2026-05-02 (CC-2 fix): hint_pl is a pre-answer hint in MultipleChoice;
      // sanitise so the PL gloss doesn't echo the canonical answer string.
      hint_pl: sanitiseHint(q.hintPL ?? q.instructionPL ?? '', q.answer),
      exerciseId: q.exerciseId,
      explanationPL: q.explanationPL,
    });
    if (usable.length >= 12) break; // cap session length
  }
  if (usable.length < MIN_PUZZLE_QUESTIONS) return null;
  return { questions: usable };
}

// ── Master dispatcher ──
export function buildPuzzleForShell(
  shellKey: ShellKey,
  exercises: ConvexExercise[],
): unknown | null {
  if (!exercises || exercises.length === 0) return null;
  // Pre-adapter content-shape gate (Kelly CC-1 fix). Drops exercises whose
  // shape can't be rendered by the shell mechanic. Empty result → adapter
  // returns null → StudentPractice falls back to vocab-path or built-in demo.
  const filtered = filterExercisesForShell(exercises, shellKey);
  if (!filtered || filtered.length === 0) return null;

  let puzzle: unknown | null;
  switch (shellKey) {
    case 'multiplechoice': puzzle = exercisesToMultipleChoice(filtered); break;
    case 'gapfill':    puzzle = exercisesToGapFill(filtered); break;
    case 'truefalse':  puzzle = exercisesToTrueFalse(filtered); break;
    case 'matching':   puzzle = exercisesToMatching(filtered); break;
    case 'flashcards': puzzle = exercisesToFlashcards(filtered); break;
    case 'crossword':  puzzle = exercisesToCrossword(filtered); break;
    case 'wordsearch': puzzle = exercisesToWordsearch(filtered); break;
    case 'anagram':    puzzle = exercisesToAnagram(filtered); break;
    case 'hangman':    puzzle = exercisesToHangman(filtered); break;
    case 'dragdrop':   puzzle = exercisesToDragDrop(filtered); break;
    case 'groupsort':  puzzle = exercisesToGroupSort(filtered); break;
    default:           puzzle = null;
  }
  // Post-adapter sanity gate (e.g. crossword/wordsearch dedupe shared clues,
  // truefalse rejects gap-fill prompts that slipped through).
  return filterPuzzleForShell(shellKey, puzzle);
}

// ── Demo / smoke-test (run with `tsx exercise-adapters.ts --demo`) ──
export function buildDemoSample(): ConvexExercise[] {
  const Q = (id: string, type: 'fill-blank' | 'multiple-choice', prompt: string,
             answer: string, options: string[] | undefined, instructionEN: string,
             instructionPL: string, hintPL?: string): ConvexExerciseQuestion =>
    ({ questionId: id, type, prompt, answer, options, instructionEN, instructionPL, hintPL });
  const mk = (id: string, cat: string, sub: string, qs: ConvexExerciseQuestion[]): ConvexExercise =>
    ({ exerciseId: id, category: cat, subCategory: sub, cefrLevel: 'A2', difficultyTier: 1,
       title: `${sub} demo`, description: 'demo', focusArea: sub, questions: qs });
  return [
    mk('ex-001', 'grammar', 'present-simple', [
      Q('q1', 'fill-blank', 'She ___ to school every day.', 'goes', undefined, 'Present simple.', 'Present simple.', 'idzie'),
      Q('q2', 'multiple-choice', 'He ___ coffee.', 'drinks', ['drink','drinks','drinking','drank'], 'Present simple.', 'Present simple.'),
    ]),
    mk('ex-002', 'grammar', 'past-simple', [
      Q('q1', 'fill-blank', 'Yesterday I ___ home.', 'went', undefined, 'Past of go.', 'Forma przeszła go.', 'poszedłem'),
      Q('q2', 'multiple-choice', 'They ___ a car.', 'bought', ['buy','buyed','bought','buying'], 'Past of buy.', 'Forma przeszła buy.'),
    ]),
    mk('ex-003', 'vocabulary', 'food', [
      Q('q1', 'multiple-choice', 'apple', 'jabłko', ['jabłko','gruszka','śliwka','banan'], 'Translate.', 'Przetłumacz.', 'jabłko'),
      Q('q2', 'fill-blank', 'I eat an ___ every morning.', 'orange', undefined, 'Citrus fruit.', 'Owoc cytrusowy.', 'pomarańcza'),
    ]),
    mk('ex-004', 'vocabulary', 'animals', [
      Q('q1', 'multiple-choice', 'cat', 'kot', ['kot','pies','koń','krowa'], 'Translate.', 'Przetłumacz.', 'kot'),
      Q('q2', 'fill-blank', 'A ___ is a pet.', 'dog', undefined, 'Common pet.', 'Pies.', 'pies'),
    ]),
    mk('ex-005', 'grammar', 'future-simple', [
      Q('q1', 'fill-blank', 'I ___ help you tomorrow.', 'will', undefined, 'Use will.', 'Użyj will.', 'będę'),
      Q('q2', 'multiple-choice', 'She ___ travel.', 'will', ['will','is','has','was'], 'Future simple.', 'Czas przyszły.'),
    ]),
  ];
}

if (typeof process !== 'undefined' && process.argv && process.argv.includes('--demo')) {
  const sample = buildDemoSample();
  const SHELLS: ShellKey[] = ['gapfill','truefalse','matching','flashcards','crossword',
                              'wordsearch','anagram','hangman','dragdrop','groupsort'];
  for (const k of SHELLS) {
    // eslint-disable-next-line no-console
    console.log(`\n── ${k} ──\n${JSON.stringify(buildPuzzleForShell(k, sample), null, 2)}`);
  }
}
