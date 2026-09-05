import { lazy as wordLazy, Suspense as WordSuspense } from 'react';
const WordScene3D = wordLazy(() => import('../shells3d/WordCrossword3D'));
// Crossword shell — "The Grid District" — city blueprint metaphor.
// Streets are words. Intersections are clue crossings.
import { WordMission, useWordArcade } from './word-arcade';
import { createStreetAdvance } from './word-arcade-crossword';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Bajla,
  SkylineBackdrop,
  HintCard,
  Progress,
  Nameplate,
  SkipButton,
  HintButton,
  Confetti,
} from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
import { useShellProgress } from '../lib/convex-stubs';
import type { ShellCrosswordPuzzle } from '../lib/adapters';
// Mike #7 — expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';

// Grid District · Crossword — full bilingual instruction copy.
const CROSSWORD_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A city-blueprint grid sits at the centre — every "street" is a word to fill in.',
      'Tap a cell to focus a street; the active street highlights and the matching clue lights up.',
      'Type letters with your keyboard, or tap a cell and use the on-screen letter input.',
      'Crossings are shared cells — solving one street helps decode the crossing one.',
    ],
    pl: [
      'Plan miasta znajduje się pośrodku — każda „ulica" to słowo do uzupełnienia.',
      'Stuknij komórkę, aby aktywować ulicę; aktywna ulica i pasująca wskazówka się podświetlają.',
      'Wpisuj litery klawiaturą lub stuknij komórkę i użyj ekranowego pola.',
      'Skrzyżowania to wspólne komórki — rozwiązanie jednej ulicy pomaga w drugiej.',
    ],
  },
  controls: {
    en: [
      'Grid: the blueprint at the centre — empty cells are streets, dark cells are blocks.',
      'Active cell: highlighted with a magenta border — your current letter target.',
      'Clue list: numbered "Across · W poprzek" + "Down · W dół" panel beside the grid.',
      '"Check this street" button: validates the active street; correct streets lock cyan.',
      'Skip button: jumps to the next street. Hint button: 3 hints — reveals one letter in the active street.',
    ],
    pl: [
      'Siatka: plan pośrodku — puste komórki to ulice, ciemne to bloki.',
      'Aktywna komórka: podświetlona magentowym obramowaniem — Twoja bieżąca litera.',
      'Lista wskazówek: ponumerowany panel „W poprzek" + „W dół" obok siatki.',
      'Przycisk „Sprawdź tę ulicę": waliduje aktywną ulicę; trafione ulice blokują się na cyjan.',
      'Przycisk Pomiń: przeskakuje do następnej ulicy. Podpowiedź: 3 sztuki — odkrywa jedną literę.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right street: cells lock cyan, the clue dims (solved), the district progress counter ticks up.',
      'Wrong street: cells flash rose briefly, then return to editable so you can fix the wrong letter.',
      'Skip: counts as wrong and moves focus to the next unsolved street.',
      'You can edit any unlocked cell freely — only "Check this street" commits a guess.',
    ],
    pl: [
      'Trafiona ulica: komórki blokują się na cyjan, wskazówka przygasa (rozwiązana), licznik postępu rośnie.',
      'Błędna ulica: komórki migają na różowo, potem wracają do edycji — możesz poprawić błędną literę.',
      'Pomiń: liczy się jako błąd i przesuwa fokus na następną nierozwiązaną ulicę.',
      'Możesz swobodnie edytować każdą odblokowaną komórkę — tylko „Sprawdź tę ulicę" zatwierdza odpowiedź.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Each hint reveals ONE letter in the active street (the next empty cell). Save them for streets where the clue is the verb root and you can\'t derive the past participle.',
    pl:
      'Masz 3 podpowiedzi na sesję. Każda odkrywa JEDNĄ literę w aktywnej ulicy (następną pustą komórkę). Zachowaj je na ulice, gdzie wskazówka to rdzeń czasownika, a nie znasz formy nieregularnej.',
  },
  scoring: {
    en:
      'Skip counts as wrong. The "District progress · Postęp dystryktu" counter shows how many streets you have solved out of the total. Solving every street unlocks the post-shell review screen.',
    pl:
      'Pomiń liczy się jako błąd. Licznik „Postęp dystryktu" pokazuje, ile ulic rozwiązałeś z całości. Rozwiązanie wszystkich odblokowuje ekran przeglądu.',
  },
  l1Pattern: {
    en:
      'Polish word-building rules differ from English (no helping verbs, different past-participle suffixes). Crossings force you to commit to a specific letter pattern, exposing those L1 transfer mistakes.',
    pl:
      'Polskie reguły budowania słów różnią się od angielskich (brak czasowników posiłkowych, inne końcówki imiesłowów). Skrzyżowania zmuszają do wyboru konkretnego wzoru liter, odsłaniając te błędy.',
  },
};

export type CrosswordForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface CrosswordShellProps {
  time?: TimeOfDay;
  state?: CrosswordForcedState;
  /**
   * When provided (e.g. from StudentPractice's generator + adapter pipeline),
   * the shell renders this puzzle instead of CW_PUZZLE. Omit for the design
   * canvas / fallback to keep the built-in demo.
   */
  puzzle?: ShellCrosswordPuzzle;
  /**
   * Layer-4 dynamic-scaffolding hook (Agent A12). Called when the shell
   * detects a wrong answer so the host can render an InterferenceTip overlay
   * with the L1-interference explanation. Optional — when omitted the shell
   * behaves exactly as before (sample-data demos still work).
   */
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles
     *  (built-in CW_PUZZLE) don't carry it; only adapter-produced puzzles do. */
    exerciseId?: string;
  }) => void;
  /**
   * D3-Crossword (CD's review-pattern, 2026-05-02): fires once when every
   * word in the puzzle has been SEEN (solved or skipped). The host uses this
   * to mount <PracticeReview>. When provided, the shell suppresses its built-in
   * "The city is mapped." dialog so the review screen is the single completion
   * destination at the end of the deck.
   *
   * Per-word notes:
   *   - questionId in wrongAttempts is `String(word.id)` so the review can
   *     dispatch back to renderCrosswordReviewItem(word, attempt).
   *   - studentAnswer is the typed letters at the moment of judgment (Check),
   *     padded with `_` for unfilled cells so the review can paint per-letter
   *     green/red chips.
   *   - The full review uses ALL puzzle.words (correct + wrong + skipped),
   *     rendered in board order.
   */
  onSessionComplete?: (info: {
    correctCount: number;
    totalQuestions: number;
    wrongAttempts: Array<{
      questionId: string;
      studentAnswer: string;
      correctAnswer: string;
      explanationPL?: string;
      exerciseId?: string;
    }>;
    puzzle: ShellCrosswordPuzzle;
    /** Word IDs the student skipped (counts as wrong but with no studentAnswer). */
    skippedWordIds: number[];
  }) => void;
}

interface CWWord {
  id: number;
  dir: 'across' | 'down';
  row: number;
  col: number;
  answer: string;
  clue: string;
  clue_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample CW_PUZZLE
   *  doesn't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

interface CWPuzzle {
  size: number;
  words: CWWord[];
}

interface CWCell {
  letter: string;
  num: number | null;
  words: { id: number; dir: 'across' | 'down'; idx: number }[];
}

type CWCellMap = Record<string, CWCell>;
type CWEntries = Record<string, string>;
type CWFeedback = 'correct' | 'wrong' | null;

interface CWActive {
  r: number;
  c: number;
  dir: 'across' | 'down';
}

const CW_PUZZLE: CWPuzzle = {
  size: 12,
  words: [
    { id: 1, dir: 'across', row: 1, col: 1, answer: 'METRO', clue: 'Underground city train', clue_pl: 'kolej podziemna' },
    { id: 2, dir: 'down', row: 8, col: 6, answer: 'TRAM', clue: 'Vehicle on rails along the street', clue_pl: 'pojazd szynowy' },
    { id: 3, dir: 'across', row: 5, col: 2, answer: 'BRIDGE', clue: 'Crosses a river', clue_pl: 'most' },
    { id: 4, dir: 'across', row: 8, col: 4, answer: 'GATE', clue: 'Entrance, often grand', clue_pl: 'brama' },
    { id: 5, dir: 'down', row: 3, col: 7, answer: 'AVENUE', clue: 'A wide tree-lined street', clue_pl: 'aleja' },
    { id: 6, dir: 'across', row: 6, col: 7, answer: 'NIGHT', clue: 'When the city glows', clue_pl: 'noc' },
    { id: 7, dir: 'across', row: 3, col: 5, answer: 'PLAZA', clue: 'Open public square', clue_pl: 'plac' },
    { id: 8, dir: 'down', row: 1, col: 3, answer: 'TOWER', clue: 'Tall structure on the skyline', clue_pl: 'wieża' },
    { id: 9, dir: 'down', row: 1, col: 11, answer: 'MARKET', clue: 'Where vendors sell', clue_pl: 'targ, rynek' },
  ],
};

// CC-2 belt-and-suspenders (Ricky, 2026-05-02): per-shell guard against
// hint copy that leaks the answer. The shared sanitiser in lib/ should
// handle this for all shells, but if an edge case slips through we
// substitute the answer with `<word> (forma czasownika)` so the student
// never sees the literal target word inside the clue or PL hint.
function sanitiseHintAgainstAnswer(hint: string | undefined, answer: string): string {
  if (!hint) return '';
  if (!answer) return hint;
  const a = answer.trim();
  if (!a) return hint;
  // Case-insensitive whole-word match. Word boundary uses a permissive
  // regex (letters/diacritics) because clue_pl can contain Polish chars.
  const safe = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^\\p{L}])(${safe})(?=$|[^\\p{L}])`, 'giu');
  if (!re.test(hint)) return hint;
  return hint.replace(re, (_m, lead) => `${lead}${a} (forma czasownika)`);
}

// CC-6 (Ricky, 2026-05-02): when multiple words share an identical clue
// (e.g. "Write the past participle." for 1→ 2↓ 3↓ 7↓) we derive a
// per-word disambiguator so the student can tell them apart. We only
// append the disambiguator when the clue is duplicated within the puzzle.
function buildClueDisambiguators(words: CWWord[]): Record<number, string> {
  const counts = new Map<string, number>();
  words.forEach((w) => {
    const key = (w.clue || '').trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const out: Record<number, string> = {};
  words.forEach((w) => {
    const key = (w.clue || '').trim().toLowerCase();
    if ((counts.get(key) ?? 0) > 1) {
      const len = w.answer.length;
      const last = w.answer.slice(-2).toLowerCase();
      // Compose a hint that gives shape, not the word itself.
      out[w.id] = `${len} letters, ends in -${last}`;
    }
  });
  return out;
}

function buildCells(p: CWPuzzle): CWCellMap {
  const cells: CWCellMap = {};
  p.words.forEach((w) => {
    const len = w.answer.length;
    for (let i = 0; i < len; i++) {
      const r = w.dir === 'across' ? w.row : w.row + i;
      const c = w.dir === 'across' ? w.col + i : w.col;
      const key = `${r},${c}`;
      if (!cells[key]) cells[key] = { letter: w.answer[i], words: [], num: null };
      cells[key].words.push({ id: w.id, dir: w.dir, idx: i });
    }
  });
  let n = 1;
  const sorted = Object.keys(cells).sort((a, b) => {
    const [ar, ac] = a.split(',').map(Number);
    const [br, bc] = b.split(',').map(Number);
    return ar - br || ac - bc;
  });
  sorted.forEach((k) => {
    if (cells[k].words.some((w) => w.idx === 0)) {
      cells[k].num = n++;
    }
  });
  return cells;
}

// ─────────────────────────────────────────────────────────────────────────
// renderCrosswordReviewItem — per-word locked render for PracticeReview.
// Paints the clue + correct answer, with the student's typed letters as
// per-letter chips coloured green/red against the canonical answer. Skipped
// words show the canonical answer in a muted "you skipped this street" chip.
// ─────────────────────────────────────────────────────────────────────────
const CW_REVIEW_ACCENT = '#7DD3FC';
export function renderCrosswordReviewItem(
  word: CWWord,
  studentAnswer: string | undefined,
  isSkipped: boolean,
): React.ReactNode {
  const ans = word.answer.toUpperCase();
  const typed = (studentAnswer ?? '').toUpperCase();
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 14px',
      background: 'linear-gradient(180deg, rgba(125,211,252,0.06), rgba(20,16,42,0.55))',
      border: `1px solid ${CW_REVIEW_ACCENT}33`, borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.14em',
          color: CW_REVIEW_ACCENT, fontWeight: 700,
        }}>
          {word.id} {word.dir === 'across' ? '→ ACROSS · POZIOMO' : '↓ DOWN · PIONOWO'}
        </span>
        <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10, color: 'rgba(245,239,255,0.55)' }}>
          {ans.length} letters
        </span>
      </div>
      <div style={{ fontSize: 14, color: 'var(--em-text, #EDE6FF)', lineHeight: 1.4 }}>
        {sanitiseHintAgainstAnswer(word.clue, word.answer)}
      </div>
      {word.clue_pl ? (
        <div style={{ fontSize: 12, color: 'rgba(245,239,255,0.6)', fontStyle: 'italic' }}>
          🇵🇱 {sanitiseHintAgainstAnswer(word.clue_pl, word.answer)}
        </div>
      ) : null}
      {/* Per-letter chip row — green when student got it right, rose when wrong,
          muted dash when blank. Skipped words show the canonical answer in
          neutral chips so the student can still study the spelling. */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
        {ans.split('').map((ch, i) => {
          const stuChar = typed[i] ?? '';
          const isCorrect = !isSkipped && stuChar === ch;
          const isBlank = isSkipped || stuChar === '' || stuChar === '_';
          const bg = isSkipped
            ? 'rgba(245,239,255,0.06)'
            : isCorrect
              ? 'linear-gradient(180deg, #34D399, #15532A)'
              : isBlank
                ? 'rgba(20,16,42,0.6)'
                : 'linear-gradient(180deg, #FB7185, #9B1C2E)';
          const color = isCorrect || (!isBlank && !isSkipped) ? '#FFF' : 'rgba(245,239,255,0.65)';
          return (
            <span key={i} style={{
              minWidth: 28, height: 32, padding: '0 6px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--em-decor)', fontSize: 16, fontWeight: 700,
              borderRadius: 4, background: bg, color,
              boxShadow: isCorrect
                ? '0 0 0 1px #34D399, 0 0 8px rgba(52,211,153,0.5)'
                : (!isBlank ? '0 0 0 1px #FB7185' : '0 0 0 1px rgba(245,239,255,0.15)'),
            }}>
              {isSkipped ? ch : (stuChar || '·')}
            </span>
          );
        })}
      </div>
      {isSkipped ? (
        <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,239,255,0.55)' }}>
          — skipped · pominięto — Answer: <strong style={{ color: '#34D399' }}>{ans}</strong>
        </div>
      ) : typed && typed.replace(/_/g, '') !== ans ? (
        <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.14em', color: '#34D399' }}>
          ✓ Answer: <strong>{ans}</strong>
        </div>
      ) : null}
    </div>
  );
}

export const CrosswordShell: React.FC<CrosswordShellProps> = ({ time = 'dusk', state: forcedState = null, puzzle, onWrongAnswer, onSessionComplete }) => {
  const arcade = useWordArcade();
  // Kelly Tier-2 (2026-05-02): defensive props guard.
  const propsInvalid = !forcedState && puzzle !== undefined && (!puzzle.words || puzzle.words.length === 0);
  const activePuzzle: CWPuzzle = puzzle && puzzle.words.length > 0 ? puzzle : CW_PUZZLE;
  const cells = useMemo<CWCellMap>(() => buildCells(activePuzzle), [activePuzzle]);
  // CC-6: precompute per-word disambiguators for any clue text repeated
  // across multiple words in this puzzle.
  const clueDisambiguators = useMemo(
    () => buildClueDisambiguators(activePuzzle.words),
    [activePuzzle],
  );
  const [entries, setEntries] = useState<CWEntries>({});
  const firstWord = activePuzzle.words[0];
  const [active, setActive] = useState<CWActive>({
    r: firstWord?.row ?? 1,
    c: firstWord?.col ?? 1,
    dir: firstWord?.dir ?? 'across',
  });
  const streetAdvance = useRef<ReturnType<typeof createStreetAdvance> | null>(null);
  if (streetAdvance.current === null) streetAdvance.current = createStreetAdvance(setActive);
  const cancelStreetAdvance = useCallback(() => streetAdvance.current?.cancel(), []);
  useEffect(() => cancelStreetAdvance, [cancelStreetAdvance, forcedState, activePuzzle]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [feedback, setFeedback] = useState<CWFeedback>(null);
  const [completed, setCompleted] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  // Kelly Tier-2 (2026-05-02): focus-trap refs for the city-mapped dialog.
  const continueBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // EM-041 (Builder 7): track which words have been SEEN (solved or skipped)
  // and which have been SOLVED. Crossword has no fixed "current question",
  // so we count by word.id. Skip advances activeWord to the next unseen word.
  const [seenWordIds, setSeenWordIds] = useState<Set<number>>(new Set());
  const [solvedWordIds, setSolvedWordIds] = useState<Set<number>>(new Set());
  // D3-Crossword (2026-05-02): per-word wrong-attempt accumulator + skipped
  // word log. wrongAttemptsRef avoids re-renders on push (mirrors GapFill's
  // pattern). sessionFiredRef prevents double-fires of onSessionComplete.
  const wrongAttemptsRef = useRef<Array<{
    questionId: string; studentAnswer: string; correctAnswer: string;
    explanationPL?: string; exerciseId?: string;
  }>>([]);
  const skippedWordIdsRef = useRef<number[]>([]);
  const sessionFiredRef = useRef(false);

  // Persisted per-shell progress — Convex-backed via convex-stubs.ts +
  // convex/practice.ts. Kept inert in forced-state demos so the design
  // canvas's state showcase doesn't write bogus rows. The same wiring is
  // mirrored in every other shell (`useShellProgress(<shellId>)`).
  const persisted = useShellProgress('crossword');


  // Force-state controls (for canvas state showcase)
  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'crossword',
      brief: 'Tap a cell, type a letter, fill the street.',
      brief_pl: 'Stuknij komórkę, wpisz literę, wypełnij ulicę.',
      detail: 'Walk the crossword one street at a time. Tap a cell to set the active word, then type letters with your keyboard. Crossings reuse the same cell — solving one word reveals letters in the others. Use Check this street to verify the active word.',
      detail_pl: 'Spaceruj po krzyżówce, ulica po ulicy. Stuknij komórkę, aby aktywować słowo, a potem wpisuj litery klawiaturą. Skrzyżowania dzielą tę samą komórkę — rozwiązanie jednego słowa odsłania litery w innych. Użyj Sprawdź ulicę, aby zweryfikować aktywne słowo.',
      fullInstructions: CROSSWORD_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (forcedState === 'empty') {
      setEntries({});
      setFeedback(null);
      setCompleted(false);
      setSeenWordIds(new Set());
      setSolvedWordIds(new Set());
    }
    if (forcedState === 'active') {
      setEntries({ '1,1': 'M', '1,2': 'E', '1,3': 'T' });
      setActive({ r: 1, c: 4, dir: 'across' });
      setFeedback(null);
      setCompleted(false);
    }
    if (forcedState === 'correct') {
      setEntries({ '1,1': 'M', '1,2': 'E', '1,3': 'T', '1,4': 'R', '1,5': 'O' });
      setFeedback('correct');
      setCompleted(false);
    }
    if (forcedState === 'wrong') {
      setEntries({ '1,1': 'M', '1,2': 'A', '1,3': 'P', '1,4': 'P', '1,5': 'S' });
      setFeedback('wrong');
      setCompleted(false);
    }
    if (forcedState === 'complete') {
      const all: CWEntries = {};
      Object.entries(cells).forEach(([k, c]) => {
        all[k] = c.letter;
      });
      setEntries(all);
      setCompleted(true);
      const allIds = new Set(activePuzzle.words.map((w) => w.id));
      setSeenWordIds(allIds);
      setSolvedWordIds(allIds);
    }
  }, [forcedState, cells, activePuzzle.words]);

  const activeWord = useMemo<CWWord | null>(() => {
    const cell = cells[`${active.r},${active.c}`];
    if (!cell) return null;
    const w = cell.words.find((x) => x.dir === active.dir) || cell.words[0];
    return activePuzzle.words.find((x) => x.id === w.id) ?? null;
  }, [active, cells, activePuzzle]);

  // D3-Crossword (2026-05-02): fire onSessionComplete ONCE when every word
  // has been seen (solved OR skipped) OR the puzzle is fully completed. The
  // host then mounts <PracticeReview> over the shell area.
  const sessionComplete = completed || seenWordIds.size >= activePuzzle.words.length;
  useEffect(() => {
    if (forcedState) return;
    if (!sessionComplete) return;
    if (sessionFiredRef.current) return;
    if (!onSessionComplete) return;
    sessionFiredRef.current = true;
    arcade.complete();
    onSessionComplete({
      correctCount: solvedWordIds.size,
      totalQuestions: activePuzzle.words.length,
      wrongAttempts: [...wrongAttemptsRef.current],
      puzzle: activePuzzle,
      skippedWordIds: [...skippedWordIdsRef.current],
    });
  }, [sessionComplete, forcedState, onSessionComplete, solvedWordIds.size, activePuzzle]);

  const checkCompletion = useCallback(
    (e: CWEntries) => {
      const all = Object.keys(cells).every((k) => e[k] === cells[k].letter);
      if (all) {
        setCompleted(true);
        setFeedback('correct');
        // Don't persist forced-state demos — only real plays.
        if (!forcedState) {
          persisted.save({ progress: 1, completed: true, lastState: 'complete' });
        }
      }
    },
    [cells, forcedState, persisted],
  );

  const handleType = useCallback(
    (key: string) => {
      if (completed) return;
      if (key === 'Backspace' || /^[a-zA-Z]$/.test(key)) cancelStreetAdvance();
      if (/^[a-zA-Z]$/.test(key)) {
        const k = `${active.r},${active.c}`;
        if (!cells[k]) return;
        // Solved streets are physical, locked roads; crossing edits cannot undo them.
        if (!cells[k].words.some(word => solvedWordIds.has(word.id))) {
          setEntries((prev) => ({ ...prev, [k]: key.toUpperCase() }));
        }
        const w = activeWord;
        if (!w) return;
        const idx = w.dir === 'across' ? active.c - w.col : active.r - w.row;
        if (idx < w.answer.length - 1) {
          setActive((a) =>
            w.dir === 'across' ? { ...a, c: a.c + 1 } : { ...a, r: a.r + 1 },
          );
        }
        // A street is committed by Check; typing the last letter must not finish before grading.
      }
      if (key === 'Backspace') {
        const k = `${active.r},${active.c}`;
        setEntries((prev) => {
          const n = { ...prev };
          if (!cells[k]?.words.some(word => solvedWordIds.has(word.id))) delete n[k];
          return n;
        });
        const w = activeWord;
        if (!w) return;
        const idx = w.dir === 'across' ? active.c - w.col : active.r - w.row;
        if (idx > 0)
          setActive((a) =>
            w.dir === 'across' ? { ...a, c: a.c - 1 } : { ...a, r: a.r - 1 },
          );
      }
    },
    [active, cells, activeWord, completed, solvedWordIds, cancelStreetAdvance],
  );

  const checkWord = () => {
    cancelStreetAdvance();
    if (!activeWord || forcedState || solvedWordIds.has(activeWord.id)) return;
    const w = activeWord;
    const typedWord = Array.from({ length: w.answer.length })
      .map((_, i) => {
        const r = w.dir === 'across' ? w.row : w.row + i;
        const c = w.dir === 'across' ? w.col + i : w.col;
        return entries[`${r},${c}`] ?? '';
      })
      .join('');
    if (typedWord.length < w.answer.length) { setFeedback('wrong'); setTimeout(()=>setFeedback(null),1200); return; }
    const correct = typedWord === w.answer;
    arcade.answer(correct,150);
    setFeedback(correct ? 'correct' : 'wrong');
    setTimeout(() => setFeedback(null), 1600);
    if (correct) {
      if (solvedWordIds.size + 1 === activePuzzle.words.length) checkCompletion(entries);
      // Report in the answer event so the cabinet and city counters advance together.
      const nextSeen = new Set(seenWordIds).add(w.id);
      persisted.save({ progress: nextSeen.size / activePuzzle.words.length, completed: nextSeen.size >= activePuzzle.words.length, lastState: nextSeen.size >= activePuzzle.words.length ? 'complete' : 'active' });
      // EM-041: mark this word as both seen and solved.
      setSeenWordIds(nextSeen);
      setSolvedWordIds((s) => new Set(s).add(w.id));
      const nextStreet = activePuzzle.words.find(street => street.id !== w.id && !solvedWordIds.has(street.id) && !skippedWordIdsRef.current.includes(street.id));
      if (nextStreet) streetAdvance.current?.schedule({ r: nextStreet.row, c: nextStreet.col, dir: nextStreet.dir });
    }
    // Layer-4: fire wrong-answer callback so the host can show an
    // InterferenceTip overlay. Skip for forced-state demos.
    if (!correct && !forcedState && onWrongAnswer) {
      onWrongAnswer({
        questionId: String(w.id),
        studentAnswer: typedWord,
        correctAnswer: w.answer,
        exerciseId: w.exerciseId,
      });
    }
    // D3-Crossword (2026-05-02): record EVERY wrong word into the session
    // accumulator so PracticeReview can render a per-word locked chip row +
    // rule callout. Mark the word as seen-but-not-solved so the session-
    // complete trigger fires once every word has been attempted at least once.
    if (!correct && !forcedState && onSessionComplete) {
      // Avoid duplicate entries if the same word is rechecked.
      const existing = wrongAttemptsRef.current.findIndex((wa) => wa.questionId === String(w.id));
      const entry = {
        questionId: String(w.id),
        studentAnswer: typedWord,
        correctAnswer: w.answer,
        explanationPL: sanitiseHintAgainstAnswer(w.clue_pl, w.answer),
        exerciseId: w.exerciseId,
      };
      if (existing >= 0) wrongAttemptsRef.current[existing] = entry;
      else wrongAttemptsRef.current.push(entry);
    }
  };

  // EM-041 (Builder 7): Skip the active word. Marks it as seen (so the
  // counter advances) without marking it solved, and jumps focus to the next
  // unseen word in the puzzle so the player keeps making forward progress.
  const skip = () => {
    cancelStreetAdvance();
    if (!activeWord || forcedState) return;
    const w = activeWord;
    setSeenWordIds((s) => new Set(s).add(w.id));
    // D3-Crossword: log the skip so the review can render the canonical answer
    // in muted chips for words the student didn't attempt.
    if (onSessionComplete && !skippedWordIdsRef.current.includes(w.id)) {
      skippedWordIdsRef.current.push(w.id);
    }
    // Find the next word that hasn't been seen yet.
    const idx = activePuzzle.words.findIndex((x) => x.id === w.id);
    const nextSeen = new Set(seenWordIds).add(w.id);
    persisted.save({ progress: nextSeen.size / activePuzzle.words.length, completed: nextSeen.size >= activePuzzle.words.length, lastState: nextSeen.size >= activePuzzle.words.length ? 'complete' : 'active' });
    const nextWord =
      activePuzzle.words.slice(idx + 1).find((x) => !nextSeen.has(x.id)) ??
      activePuzzle.words.find((x) => !nextSeen.has(x.id));
    if (nextWord) {
      setActive({ r: nextWord.row, c: nextWord.col, dir: nextWord.dir });
    }
  };

  const useHint = () => {
    cancelStreetAdvance();
    if (!activeWord || hintsUsed >= 3) return;
    const w = activeWord;
    for (let i = 0; i < w.answer.length; i++) {
      const r = w.dir === 'across' ? w.row : w.row + i;
      const c = w.dir === 'across' ? w.col + i : w.col;
      const k = `${r},${c}`;
      if (entries[k] !== w.answer[i]) {
        setEntries((prev) => ({ ...prev, [k]: w.answer[i] }));
        setActive({ r, c, dir: w.dir });
        setHintsUsed((h) => h + 1);
        if (!forcedState) {
          persisted.save({ hintsUsed: hintsUsed + 1, lastState: 'active' });
        }
        return;
      }
    }
  };

  // Keyboard handler — preserved as window listener so cell focus isn't required,
  // but each cell button also gets onKeyDown for direct keyboard interaction.
  // Kelly Tier 1 (2026-05-02): bail out if the user is typing into another
  // input/textarea/contenteditable elsewhere on the page (e.g. the AI tutor
  // chat box, search fields). Without this guard, arrow keys typed into those
  // inputs would still steer the crossword cursor.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (forcedState) return;
      const t = e.target as HTMLElement | null;
      if (t && (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable
      )) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        cancelStreetAdvance();
        setActive((a) => {
          const n = { ...a };
          if (e.key === 'ArrowUp') {
            n.r--;
            n.dir = 'down';
          }
          if (e.key === 'ArrowDown') {
            n.r++;
            n.dir = 'down';
          }
          if (e.key === 'ArrowLeft') {
            n.c--;
            n.dir = 'across';
          }
          if (e.key === 'ArrowRight') {
            n.c++;
            n.dir = 'across';
          }
          if (cells[`${n.r},${n.c}`]) return n;
          return a;
        });
      } else {
        handleType(e.key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cells, forcedState, handleType, cancelStreetAdvance]);

  const onCell = (r: number, c: number) => {
    cancelStreetAdvance();
    if (!cells[`${r},${c}`]) return;
    setActive((a) => {
      if (a.r === r && a.c === c) {
        const cell = cells[`${r},${c}`];
        const otherDir: 'across' | 'down' = a.dir === 'across' ? 'down' : 'across';
        if (cell.words.some((w) => w.dir === otherDir)) return { r, c, dir: otherDir };
      }
      const directions = cells[`${r},${c}`].words;
      return { r, c, dir: directions.some(word => word.dir === a.dir) ? a.dir : directions[0].dir };
    });
  };

  const isInActiveWord = (r: number, c: number) => {
    if (!activeWord) return false;
    const w = activeWord;
    if (w.dir === 'across') return r === w.row && c >= w.col && c < w.col + w.answer.length;
    return c === w.col && r >= w.row && r < w.row + w.answer.length;
  };

  // Ricky CC-CRIT (2026-05-02): bidirectional clue↔grid highlight. Build the
  // set of word IDs whose run passes through the active cell so we can mark
  // BOTH the across-clue and down-clue containing the cursor in the side list.
  const cluesAtActiveCell = useMemo<Set<number>>(() => {
    const cell = cells[`${active.r},${active.c}`];
    if (!cell) return new Set();
    return new Set(cell.words.map((w) => w.id));
  }, [active, cells]);

  // Ricky CC-CRIT (2026-05-02): grid sizing. The previous fixed CELL = 44 with
  // a 12×12 puzzle rendered at ~528px square inside a flex column that on
  // realistic viewports left the grid at ~15% of canvas (per CD audit screenshot).
  // We now compute the cell pitch off the live container so the grid always
  // fills 50–60% of available width while staying square (aspect-ratio: 1).
  const N = activePuzzle.size;
  const gridStageRef = useRef<HTMLDivElement | null>(null);
  const [gridPx, setGridPx] = useState(560);
  useEffect(() => {
    const el = gridStageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      // Fit the largest square that fits the stage (with a little breathing room).
      const side = Math.max(280, Math.min(rect.width, rect.height) - 16);
      setGridPx(side);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const CELL = Math.max(28, Math.floor(gridPx / N));

  const blueprintColor = time === 'day' ? '#7DD3FC' : time === 'night' ? '#A78BFA' : '#E879F9';

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the city-mapped dialog.
  useEffect(() => {
    if (!completed) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const focusId = window.setTimeout(() => { continueBtnRef.current?.focus(); }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        continueBtnRef.current?.focus();
      }
      // No Escape handler — completion is irreversible (puzzle is solved).
    };
    document.addEventListener('keydown', trap);
    return () => {
      window.clearTimeout(focusId);
      document.removeEventListener('keydown', trap);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [completed]);

  // Live a11y status
  const liveStatus = completed
    ? 'Crossword complete. The city is mapped.'
    : feedback === 'correct'
      ? `Correct: ${activeWord?.answer ?? ''}`
      : feedback === 'wrong'
        ? `Incorrect entry. Try again.`
        : '';

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div
      className="em-shell em-shell-crossword"
      role="application"
      aria-label="Crossword puzzle, The Grid District"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--em-ink)' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {liveStatus}
      </div>
      <SkylineBackdrop hue={290} time={time} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 40%, rgba(232,121,249,0.08), transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(125,211,252,0.06), transparent 65%)', pointerEvents: 'none' }} />

      <div className="em-shell-crossword-grid" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, padding: 32, height: '100%', boxSizing: 'border-box' }}>

        <div className="em-card em-grain" style={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `linear-gradient(${blueprintColor}22 1px, transparent 1px), linear-gradient(90deg, ${blueprintColor}22 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
            opacity: 0.55,
            pointerEvents: 'none',
          }} aria-hidden="true" />

          <div style={{ position: 'relative', padding: '20px 24px', borderBottom: '1px solid var(--em-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <AmbientAudioPlayer shellSlug="crossword" />
            <Nameplate
              district="The Grid District"
              subtitle="Crossword · Krzyżówka"
              accent={blueprintColor}
              icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="3" width="6" height="6" stroke={blueprintColor} strokeWidth="1.5" /><rect x="13" y="3" width="6" height="6" stroke={blueprintColor} strokeWidth="1.5" opacity="0.5" /><rect x="3" y="13" width="6" height="6" stroke={blueprintColor} strokeWidth="1.5" opacity="0.5" /><rect x="13" y="13" width="6" height="6" stroke={blueprintColor} strokeWidth="1.5" /></svg>}
            />
            <div className="em-eyebrow" style={{ color: blueprintColor }}>SHEET 03 · CITY PLAN</div>
          </div>

          <WordSuspense fallback={<p>Opening the 3D district…</p>}><WordScene3D size={N} cells={Object.entries(cells).map(([key,cell])=>{const [r,c]=key.split(',').map(Number);return {r,c,label:entries[key]??'',route:isInActiveWord(r,c),ariaLabel:`Row ${r+1}, column ${c+1}: ${entries[key]||'empty'}. ${active.dir}. ${isInActiveWord(r,c)&&activeWord?sanitiseHintAgainstAnswer(activeWord.clue,activeWord.answer):'Select this city block'}`,active:active.r===r&&active.c===c,done:cell.words.some(w=>solvedWordIds.has(w.id)),wrong:feedback==='wrong'&&isInActiveWord(r,c)};})} active={[active.r,active.c]} onPick={onCell} onType={handleType} onCheck={checkWord}/></WordSuspense>
          <details><summary>Flat grid and keyboard controls</summary><div ref={gridStageRef} style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 0 }}>
            <div
              ref={gridRef}
              role="grid"
              aria-label="Crossword grid"
              style={{ position: 'relative', width: N * CELL, height: N * CELL, aspectRatio: '1 / 1' }}
            >
              <div style={{ position: 'absolute', top: -8, right: -8, fontFamily: 'var(--em-mono)', fontSize: 9, color: blueprintColor, opacity: 0.6, letterSpacing: '0.2em' }}>N ↑</div>
              <div style={{ position: 'absolute', bottom: -16, left: 0, fontFamily: 'var(--em-mono)', fontSize: 9, color: blueprintColor, opacity: 0.5, letterSpacing: '0.2em' }}>SCALE 1:5000</div>

              {Array.from({ length: N }, (_, r) =>
                Array.from({ length: N }, (_, c) => {
                  const cell = cells[`${r},${c}`];
                  if (!cell) return null;
                  const k = `${r},${c}`;
                  const isActive = active.r === r && active.c === c;
                  const inWord = isInActiveWord(r, c);
                  const value = entries[k] || '';
                  const isCorrect = feedback === 'correct' && inWord;
                  const isWrong = feedback === 'wrong' && inWord;
                  const stateLabel = isCorrect ? 'correct' : isWrong ? 'incorrect' : isActive ? 'selected' : inWord ? 'in active word' : 'empty';
                  // Ricky CC-CRIT v2 (2026-05-02): warm cream fills for empty
                  // cells give black-on-cream letters ~17:1 contrast vs the
                  // dark canvas. Bumped CREAM_IDLE brighter so non-active
                  // streets read as parchment-beige rather than dim blue-purple
                  // (CD audit follow-up). Active = brightest cream; in-word =
                  // warm parchment; idle = soft parchment (still high
                  // contrast). Correct/wrong overlays still tint mint/coral.
                  const CREAM_ACTIVE = '#FFF8E2';
                  const CREAM_IN_WORD = '#F5EFD9';
                  const CREAM_IDLE = '#EFE6CC';
                  const fontPx = Math.max(14, Math.floor(CELL * 0.5));
                  const numPx = Math.max(8, Math.floor(CELL * 0.22));
                  const bg = isCorrect
                    ? '#B6F2D8'
                    : isWrong
                      ? '#FFD0D6'
                      : isActive
                        ? CREAM_ACTIVE
                        : inWord
                          ? CREAM_IN_WORD
                          : CREAM_IDLE;
                  const txt = isCorrect
                    ? '#0B3F2D'
                    : isWrong
                      ? '#7A0E1F'
                      : '#0E0A1A';
                  return (
                    <button
                      key={k}
                      role="gridcell"
                      tabIndex={isActive ? 0 : -1}
                      aria-label={`Row ${r + 1} column ${c + 1}${cell.num ? `, clue ${cell.num}` : ''}, ${value ? `letter ${value}` : 'empty'}, ${stateLabel}`}
                      aria-selected={isActive}
                      onClick={() => onCell(r, c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onCell(r, c);
                        }
                      }}
                      style={{
                        position: 'absolute',
                        left: c * CELL, top: r * CELL,
                        width: CELL, height: CELL,
                        background: bg,
                        // Ricky CC-CRIT v2 (2026-05-02): visible cursor — 3px
                        // magenta border + thicker glow on the active cell.
                        // CD audit follow-up: bumped active glow from `${...}cc`
                        // to a layered drop+inner-shadow with longer spread, so
                        // the active cell pops against the parchment grid and
                        // the in-word ring is rendered via a stronger inset
                        // shadow rather than a thin outline (which CD called
                        // "faint blue-purple grid").
                        border: isActive ? `3px solid ${blueprintColor}` : '1px solid rgba(14,10,26,0.45)',
                        outline: 'none',
                        outlineOffset: 0,
                        boxShadow: isActive
                          ? `0 0 0 2px #ffffff inset, 0 0 24px ${blueprintColor}, 0 0 4px ${blueprintColor}, 0 4px 12px rgba(0,0,0,0.35)`
                          : inWord
                            ? `0 0 0 2px ${blueprintColor}aa inset, 0 0 6px ${blueprintColor}55`
                            : 'none',
                        color: txt,
                        fontFamily: 'var(--em-display)',
                        fontSize: fontPx,
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'background 180ms var(--em-ease), border-color 180ms var(--em-ease)',
                        animation: isWrong ? 'em-shake 0.4s var(--em-ease)' : 'none',
                        zIndex: isActive ? 2 : inWord ? 1 : 0,
                      }}
                    >
                      {cell.num && (
                        <span style={{ position: 'absolute', top: 2, left: 3, fontFamily: 'var(--em-mono)', fontSize: numPx, color: '#5D2E89', fontWeight: 700, opacity: 0.95 }}>{cell.num}</span>
                      )}
                      {value || (isActive ? (
                        <span aria-hidden="true" style={{
                          display: 'inline-block',
                          // Ricky CC-CRIT v2 (2026-05-02): caret bumped from
                          // 2px to 3px wide + magenta with glow so CD's
                          // "no blinking caret detected" stops being a thing.
                          width: 3,
                          height: Math.floor(CELL * 0.6),
                          background: blueprintColor,
                          boxShadow: `0 0 6px ${blueprintColor}, 0 0 2px ${blueprintColor}`,
                          borderRadius: 1,
                          animation: 'em-cw-caret-blink 1s steps(2, start) infinite',
                        }} />
                      ) : '')}
                    </button>
                  );
                })
              )}
              {/* Caret keyframes — scoped <style> so we don't depend on the
                  global stylesheet shipping em-cw-caret-blink. */}
              <style>{`@keyframes em-cw-caret-blink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }`}</style>
            </div>
          </div>

          </details>{/* Ricky CC-CRIT (2026-05-02): keyboard prompt pill. Tells the user
              the grid takes typed letters AND lands the system soft-keyboard
              on mobile by surfacing a focused hidden input. */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: '8px 16px 18px' }}>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '8px 14px', borderRadius: 999,
              background: 'rgba(245,239,217,0.92)', color: '#0E0A1A',
              border: `1px solid ${blueprintColor}`,
              fontFamily: 'var(--em-mono)', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
              boxShadow: `0 0 12px ${blueprintColor}33`,
              cursor: 'text',
            }}>
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">
                <rect x="0.5" y="0.5" width="15" height="11" rx="2" stroke="#0E0A1A" strokeWidth="1" />
                <rect x="2" y="2" width="2" height="2" fill="#0E0A1A" />
                <rect x="5" y="2" width="2" height="2" fill="#0E0A1A" />
                <rect x="8" y="2" width="2" height="2" fill="#0E0A1A" />
                <rect x="11" y="2" width="3" height="2" fill="#0E0A1A" />
                <rect x="2" y="5" width="5" height="2" fill="#0E0A1A" />
                <rect x="8" y="5" width="6" height="2" fill="#0E0A1A" />
                <rect x="3" y="8" width="10" height="2" fill="#0E0A1A" />
              </svg>
              Type letters · Wpisuj litery
              {/* Hidden input lets mobile/tap-then-type users summon the
                  system keyboard without us shipping our own A-Z grid. */}
              <input
                aria-label="Type a letter"
                inputMode="text"
                autoCapitalize="characters"
                value=""
                onChange={(e) => {
                  const ch = e.target.value.slice(-1);
                  if (ch) handleType(ch);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace') handleType('Backspace');
                }}
                style={{
                  width: 1, height: 1, opacity: 0, padding: 0, margin: 0, border: 0,
                  position: 'absolute', pointerEvents: 'none',
                }}
              />
            </label>
          </div>

          <Confetti show={completed} />

          {completed && !onSessionComplete && (
            <div
              role="dialog"
              aria-modal="true"
              aria-live="assertive"
              aria-label="Crossword complete"
              style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(ellipse at center, rgba(52,211,153,0.18), rgba(14,10,26,0.85))',
                backdropFilter: 'blur(2px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
                animation: 'em-rise 0.5s var(--em-ease)',
              }}
            >
              <Bajla size={84} mood="cheer" decorative />
              <div className="em-decor" style={{ fontSize: 40, color: 'var(--em-text)' }}>The city is mapped.</div>
              <div style={{ color: 'var(--em-text-muted)', fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.2em' }}>BLUEPRINT COMPLETE · PLAN ZAKOŃCZONY</div>
              <button ref={continueBtnRef} className="em-btn em-btn-primary" style={{ marginTop: 8 }}>Continue to next district →</button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* EM-041: live counters — was hardcoded current=3 / total=9. */}
            <Progress
              current={solvedWordIds.size}
              total={activePuzzle.words.length}
              seen={seenWordIds.size}
              accent={blueprintColor}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <SkipButton onClick={skip} />
              <HintButton onClick={useHint} used={hintsUsed} total={3} />
            </div>
          </div>

<WordMission kind="crossword" current={solvedWordIds.size} total={activePuzzle.words.length} chain={arcade.chain} reaction={arcade.reaction}/>
          <div className="em-card" style={{ padding: 20, background: `linear-gradient(160deg, ${blueprintColor}1a, var(--em-card))`, border: `1px solid ${blueprintColor}44` }}>
            <div className="em-eyebrow" style={{ color: blueprintColor, marginBottom: 8 }}>
              {activeWord?.id} · {activeWord?.dir === 'across' ? 'ACROSS · POZIOMO' : 'DOWN · PIONOWO'} · {activeWord?.answer.length} letters
            </div>
            {/* CC-2 + CC-6 (Ricky, 2026-05-02): apply per-shell answer-leak
                guard AND append a per-word disambiguator when this puzzle's
                clue text is shared across multiple entries. */}
            <div style={{ fontSize: 22, color: 'var(--em-text)', lineHeight: 1.3, fontFamily: 'var(--em-display)', fontWeight: 500, marginBottom: 8 }}>
              {activeWord ? sanitiseHintAgainstAnswer(activeWord.clue, activeWord.answer) : ''}
              {activeWord && clueDisambiguators[activeWord.id] ? (
                <span style={{ display: 'block', fontSize: 13, color: 'var(--em-text-muted)', fontFamily: 'var(--em-mono)', marginTop: 6, letterSpacing: '0.04em' }}>
                  ({clueDisambiguators[activeWord.id]})
                </span>
              ) : null}
            </div>
            <div className="em-hint-pl">🇵🇱 {activeWord ? sanitiseHintAgainstAnswer(activeWord.clue_pl, activeWord.answer) : ''}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                className="em-btn em-btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={checkWord}
                aria-label="Check the active word"
              >
                Check this street
              </button>
            </div>
          </div>

          {/* Standalone <ExpandableInstructions> mount removed 2026-05-03 —
              the chat-widget Bajla bubble's DETAILED state now renders the
              full bilingual blocks (CROSSWORD_INSTRUCTIONS broadcast via
              em:shell-instruction). */}

          <div className="em-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--em-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="em-eyebrow">District progress · Postęp dystryktu</div>
              {/* CC-5 fix (Ricky, 2026-05-02): the old chip counted FILLED CELLS
                  ("0/50") which is a third unrelated metric next to the header's
                  Q-of-N. The list below is one row per WORD, so this chip now
                  counts solved words and is explicitly labelled as a long-term
                  district-level metric (per Kelly's 2026-05-02 brief) so it's
                  read as cumulative district progress, not the active-puzzle
                  position counter. */}
              <div className="em-eyebrow" style={{ color: blueprintColor }} aria-label={`District progress: ${solvedWordIds.size} of ${activePuzzle.words.length} streets solved`}>
                {solvedWordIds.size}/{activePuzzle.words.length} ulic
              </div>
            </div>
            <div className="em-scroll" role="list" aria-label="All clues" style={{ overflowY: 'auto', padding: '4px 0' }}>
              {activePuzzle.words.map((w) => {
                const isCurrent = activeWord?.id === w.id;
                // Ricky CC-CRIT (2026-05-02): a clue is "linked" when the
                // active grid cell is part of its run — that's how the user
                // sees BOTH the across-clue AND the down-clue under the cursor
                // light up at once (bidirectional clue↔grid highlight).
                const isLinked = cluesAtActiveCell.has(w.id);
                const filled = Array.from({ length: w.answer.length }).every((_, i) => {
                  const r = w.dir === 'across' ? w.row : w.row + i;
                  const c = w.dir === 'across' ? w.col + i : w.col;
                  return entries[`${r},${c}`];
                });
                // CC-2 + CC-6: render sanitised clue + disambiguator suffix
                // when the same clue text repeats elsewhere in this puzzle.
                const safeClue = sanitiseHintAgainstAnswer(w.clue, w.answer);
                const dis = clueDisambiguators[w.id];
                const displayClue = dis ? `${safeClue} (${dis})` : safeClue;
                const CYAN = '#7DD3FC';
                return (
                  <button
                    key={w.id}
                    role="listitem"
                    aria-label={`${w.id} ${w.dir}, clue: ${displayClue}${filled ? ', filled' : ''}${isCurrent ? ', currently selected' : isLinked ? ', crosses the active cell' : ''}`}
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => { cancelStreetAdvance(); setActive({ r: w.row, c: w.col, dir: w.dir }); }}
                    style={{
                      width: '100%', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12,
                      // Active word (clicked by the user) gets the brand-magenta
                      // wash. Other clues whose run passes through the active
                      // cell get a cyan wash so the user can SEE both
                      // across+down clue cards highlight together.
                      background: isCurrent
                        ? `${blueprintColor}26`
                        : isLinked
                          ? `${CYAN}26`
                          : 'transparent',
                      border: 'none',
                      borderLeft: `3px solid ${isCurrent ? blueprintColor : isLinked ? CYAN : 'transparent'}`,
                      color: 'var(--em-text)', cursor: 'pointer', textAlign: 'left',
                      transition: 'background 180ms',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--em-mono)', fontSize: 11, color: isLinked && !isCurrent ? CYAN : blueprintColor, width: 36, fontWeight: isLinked || isCurrent ? 700 : 500 }}>
                      {w.id} {w.dir === 'across' ? '→' : '↓'}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: filled ? 'var(--em-text-dim)' : 'var(--em-text)', textDecoration: filled ? 'line-through' : 'none', fontWeight: isCurrent || isLinked ? 700 : 400 }}>
                      {displayClue}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CrosswordShell;
