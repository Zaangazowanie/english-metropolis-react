import { lazy as wordLazy, Suspense as WordSuspense } from 'react';
const WordScene3D = wordLazy(() => import('../shells3d/WordWordsearch3D'));
// Wordsearch shell — "Neon Market" district.
// Players drag across glowing neon signs to find words hidden in the marquee.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { WordMission, useWordArcade } from './word-arcade';
import { useShellProgress } from '../lib/convex-stubs';
import type { ShellWordsearchPuzzle } from '../lib/adapters';



import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Bajla,
  HintCard,
  Progress,
  Nameplate,
  SkipButton,
  HintButton,
  Confetti,
} from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 — expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';

// Neon Market · Wordsearch — full bilingual instruction copy.
const WORDSEARCH_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A glowing letter grid lights the night market — words are hidden in any direction.',
      'Drag (or arrow-key + Space) across letters that line up to "switch on" the sign.',
      'Words can run horizontally, vertically, or diagonally — forwards or backwards.',
      'The list of words to find sits beside the grid; each found word lights up cyan.',
    ],
    pl: [
      'Świecąca siatka liter rozświetla nocny targ — słowa są ukryte we wszystkich kierunkach.',
      'Przeciągnij (lub strzałki + Spacja) po literach w jednej linii, aby „zaświecić" szyld.',
      'Słowa mogą biec poziomo, pionowo lub po skosie — w przód lub wstecz.',
      'Lista słów do znalezienia jest obok siatki; każde znalezione zapala się na cyjan.',
    ],
  },
  controls: {
    en: [
      'Letter grid: the central marquee — every cell is a letter on a neon sign.',
      'Word list: the panel at the right — each item is a target word with its bilingual hint.',
      'Cyan dashed cursor: marks where your selection cursor is when using arrow keys.',
      'Amber anchor marker: the first letter you locked in for the current selection (Space anchors).',
      'Skip button: jumps to the next puzzle. Hint button: 3 hints — pulses the first letter of an unfound word.',
    ],
    pl: [
      'Siatka liter: centralny szyld — każda komórka to litera na neonie.',
      'Lista słów: panel po prawej — każda pozycja to docelowe słowo z dwujęzyczną wskazówką.',
      'Cyjanowy przerywany kursor: pokazuje pozycję kursora przy nawigacji strzałkami.',
      'Bursztynowy marker kotwicy: pierwsza litera zatwierdzona dla bieżącego zaznaczenia (Spacja kotwiczy).',
      'Pomiń: przeskakuje do następnej zagadki. Podpowiedź: 3 sztuki — pulsuje pierwszą literę nieznalezionego słowa.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right line: the word lights cyan, the list item ticks, the marquee plays a brief glow.',
      'Wrong line: the selection clears with no penalty — try a different angle.',
      'Skip: counts as wrong and loads the next grid.',
      'Found words stay lit on the grid as a visual record of what you have already hunted.',
    ],
    pl: [
      'Trafiona linia: słowo zapala się na cyjan, pozycja na liście otrzymuje haczyk, szyld lśni.',
      'Błędna linia: zaznaczenie znika bez kary — spróbuj innego kąta.',
      'Pomiń: liczy się jako błąd i ładuje następną siatkę.',
      'Znalezione słowa pozostają zapalone na siatce jako wizualny zapis tego, co już upolowałeś.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Each hint pulses the first letter of an unfound word for ~2 seconds. Save them when the grid is mostly noise and you have nothing to grab onto.',
    pl:
      'Masz 3 podpowiedzi na sesję. Każda pulsuje pierwszą literą nieznalezionego słowa przez ~2 sekundy. Zachowaj je, gdy siatka jest hałasem i nie masz się czego chwycić.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Finding every word in the list opens the next market grid. Completing all grids unlocks the post-shell review screen.',
    pl:
      'Pomiń liczy się jako błąd. Znalezienie wszystkich słów otwiera następną siatkę targu. Ukończenie wszystkich siatek odblokowuje ekran przeglądu.',
  },
  l1Pattern: {
    en:
      'Wordsearch builds letter-pattern recognition — useful because Polish spelling is more phonetic than English. This shell builds your eye for English\'s irregular vowel-consonant clusters.',
    pl:
      'Wordsearch buduje rozpoznawanie wzorów liter — przydatne, bo polska pisownia jest bardziej fonetyczna niż angielska. Ten poziom trenuje Twoje oko na nieregularne układy samogłosek i spółgłosek.',
  },
};

export type WordsearchForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface WordsearchShellProps {
  time?: TimeOfDay;
  state?: WordsearchForcedState;
  /**
   * When provided (e.g. from StudentPractice's generator + adapter pipeline),
   * the shell renders this puzzle instead of WS_PUZZLE. Omit for the design
   * canvas / fallback to keep the built-in demo.
   */
  puzzle?: ShellWordsearchPuzzle;
  /** Layer-4 dynamic-scaffolding hook (Agent A12). Fires on a wrong drag. */
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles
     *  (built-in WS_PUZZLE) don't carry it; only adapter-produced puzzles do. */
    exerciseId?: string;
  }) => void;
  /**
   * D3-Wordsearch (CD's review-pattern, 2026-05-02): fires once when the
   * student has finished the puzzle (every word found OR the player surrenders
   * via Skip — currently the only completion path is "all words found", but
   * the host treats this as the canonical session-complete signal). When
   * provided, the shell suppresses its built-in "All neon signs lit." dialog.
   *
   * Per-word notes:
   *   - questionId in wrongAttempts is the canonical word string (uppercase),
   *     so the review can dispatch back to renderWordsearchReviewItem(word,…).
   *   - studentAnswer encodes the path the student dragged (`r1,c1→r2,c2`).
   *   - foundWordIndices lists which words the student found (so the review
   *     can paint the per-word status: found · missed).
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
    puzzle: ShellWordsearchPuzzle;
    foundWordIndices: number[];
  }) => void;
}

interface WSWord {
  word: string;
  clue: string;
  clue_pl: string;
  start: [number, number];
  end: [number, number];
  /** Originating Convex `exercises.exerciseId`. Optional — sample WS_PUZZLE
   *  doesn't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

interface WSPuzzle {
  size: number;
  words: WSWord[];
}

type WSGrid = string[][];
type WSCellWords = number[][][];
type WSFeedback = 'correct' | 'wrong' | null;

interface WSDrag {
  start: [number, number];
  current: [number, number];
}

// Kelly Tier-2 (2026-05-02) — per-shell hint guard.
//
// Item 7 / CC-2 in /tmp/em-kelly-audit-findings.md: every Wordsearch hint on
// englishmetro.com leaked the answer ("break → broken", "make → made", etc.)
// or carried the wrong shell's instruction copy ("Wybierz odpowiedni czasownik
// modalny." — Multiple Choice copy bleeding into Wordsearch).
//
// `lib/exercise-adapters.ts::sanitiseHint` handles arrow-form leaks at the
// adapter layer for adapter-produced puzzles. This per-shell guard is the
// safety net for: (a) sample WS_PUZZLE-shaped puzzles that bypass the lib
// filter, (b) cross-shell instruction leaks the lib filter doesn't recognise,
// and (c) any clue_pl that still slips through containing the literal answer.
//
// Returns a Wordsearch-appropriate Polish hint of the shape
//   "Forma z lekcji · N liter"   (when stripped to nothing)
//   "Znajdź słowo w siatce: <hint>"   (when MCQ-directive prefix detected)
//   "<PL meaning> · N liter"    (when arrow-form "PL → EN" detected)
//   "<original>"                  (when safe)
function safeWordsearchHint(rawHint: string | undefined, word: string): string {
  const w = (word || '').trim();
  const len = w.length;
  const fallback = len > 0
    ? `Forma z lekcji · ${len} liter`
    : 'Forma z lekcji.';
  if (!rawHint) return fallback;
  let hint = rawHint.trim();
  if (!hint) return fallback;

  // (a) Arrow-form leaks: "X → Y" where Y matches the target word.
  // Strip the answer half ("→ broken") and keep just the meaning side.
  // Run BEFORE the MCQ-directive check so "choose → chosen" is recognised
  // as a leak (with leading "choose"), not a Multiple-Choice directive.
  const arrowMatch = hint.match(/^(.+?)\s*(?:→|->|>)\s*(.+?)\s*$/);
  if (arrowMatch && arrowMatch[2].toLowerCase().trim() === w.toLowerCase()) {
    const meaning = arrowMatch[1].trim();
    return meaning
      ? `${meaning} · ${len} liter`
      : fallback;
  }
  // PL→EN form (e.g. "łamać → break" where the EN side IS the answer): strip
  // the EN side as well, keep the PL meaning.
  if (arrowMatch) {
    // If RHS contains the answer as a substring, the leak is still real.
    if (arrowMatch[2].toLowerCase().includes(w.toLowerCase())) {
      const meaning = arrowMatch[1].trim();
      return meaning ? `${meaning} · ${len} liter` : fallback;
    }
  }

  // (b) Cross-shell instruction prefix — "Wybierz..." / "Choose..." is MCQ
  // copy. Reframe it for Wordsearch so the learner is told to LOOK for the
  // word in the grid, not pick from a list. Tightened to require a space
  // (so verbs like "choose" inside an arrow-form aren't false-positives —
  // those are handled above).
  if (/^(wybierz|choose|select|pick)\s/i.test(hint)) {
    return `Znajdź słowo w siatce · ${len} liter`;
  }

  // (c) Standalone-word leak: hint contains the answer as a word.
  // Replace with the generic prompt rather than masking with ___ (which
  // looks like a Hangman fragment in a Wordsearch context).
  const safeAns = w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRe = new RegExp(`\\b${safeAns}\\b`, 'i');
  if (wordRe.test(hint)) {
    return `Słowo na ${len} liter · forma z lekcji`;
  }

  return hint;
}

const WS_PUZZLE: WSPuzzle = {
  size: 11,
  words: [
    { word: 'NEON', clue: 'Glowing tube light', clue_pl: 'rurka jarzeniowa', start: [1, 1], end: [1, 4] },
    { word: 'STALL', clue: 'A market booth', clue_pl: 'stoisko', start: [3, 1], end: [3, 5] },
    { word: 'NIGHT', clue: 'Dark hours', clue_pl: 'noc', start: [0, 6], end: [4, 6] },
    { word: 'DUMPLING', clue: 'Filled dough pocket', clue_pl: 'pieróg', start: [5, 2], end: [5, 9] },
    { word: 'STREET', clue: 'A road through town', clue_pl: 'ulica', start: [7, 3], end: [7, 8] },
    { word: 'GLOW', clue: 'Soft light', clue_pl: 'blask', start: [2, 0], end: [5, 0] },
    { word: 'VENDOR', clue: 'Person who sells', clue_pl: 'sprzedawca', start: [9, 1], end: [9, 6] },
    { word: 'SIGN', clue: 'A board with letters', clue_pl: 'znak', start: [0, 9], end: [3, 9] },
  ],
};

function buildWSGrid(p: WSPuzzle): { grid: WSGrid; cellWords: WSCellWords } {
  const N = p.size;
  const grid: WSGrid = Array.from({ length: N }, () => Array.from({ length: N }, () => ''));
  const cellWords: WSCellWords = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => [] as number[]),
  );
  p.words.forEach((w, wi) => {
    const [r1, c1] = w.start;
    const [r2, c2] = w.end;
    const len = w.word.length;
    const dr = (r2 - r1) / (len - 1);
    const dc = (c2 - c1) / (len - 1);
    for (let i = 0; i < len; i++) {
      const r = r1 + Math.round(dr * i);
      const c = c1 + Math.round(dc * i);
      grid[r][c] = w.word[i];
      cellWords[r][c].push(wi);
    }
  });
  let seed = 1337;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const letters = 'ETAOINSRHLDCUMWFGYPBVKJXQZ';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!grid[r][c]) grid[r][c] = letters[Math.floor(rng() * letters.length)];
    }
  }
  return { grid, cellWords };
}

// ─────────────────────────────────────────────────────────────────────────
// renderWordsearchReviewItem — per-word locked render for PracticeReview.
// Shows the word + meaning-only clue + status chip {found · missed} + a tiny
// 6×3 thumb of the marquee with the word's path highlighted in neon.
// ─────────────────────────────────────────────────────────────────────────
const WS_REVIEW_ACCENT = '#FBBF24';
export function renderWordsearchReviewItem(
  word: WSWord,
  status: 'found' | 'missed',
): React.ReactNode {
  const safeClue = safeWordsearchHint(word.clue_pl, word.word);
  // Mini-thumb: render a tiny grid showing the word's start→end as a glowing
  // line (don't bother with full grid letters — too dense at thumb size).
  const [r1, c1] = word.start;
  const [r2, c2] = word.end;
  const padded = (n: number) => String(n).padStart(2, '0');
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '88px 1fr', gap: 12,
      padding: '12px 14px',
      background: status === 'found'
        ? `linear-gradient(180deg, rgba(251,191,36,0.10), rgba(20,16,42,0.55))`
        : `linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))`,
      border: `1px solid ${status === 'found' ? `${WS_REVIEW_ACCENT}55` : '#FB718555'}`,
      borderRadius: 8,
    }}>
      {/* Mini-thumb: 80x80, dark grid + glowing path stroke */}
      <svg viewBox="0 0 80 80" width={80} height={80} style={{ borderRadius: 6, background: 'rgba(7,4,26,0.9)', border: '1px solid rgba(245,239,255,0.08)' }} aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={`h${i}`} x1={0} y1={(80 / 6) * (i + 1) - 0.5} x2={80} y2={(80 / 6) * (i + 1) - 0.5} stroke="rgba(125,211,252,0.10)" strokeWidth={0.5} />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={`v${i}`} x1={(80 / 6) * (i + 1) - 0.5} y1={0} x2={(80 / 6) * (i + 1) - 0.5} y2={80} stroke="rgba(125,211,252,0.10)" strokeWidth={0.5} />
        ))}
        <line
          x1={(c1 + 0.5) * (80 / 11)}
          y1={(r1 + 0.5) * (80 / 11)}
          x2={(c2 + 0.5) * (80 / 11)}
          y2={(r2 + 0.5) * (80 / 11)}
          stroke={status === 'found' ? WS_REVIEW_ACCENT : '#FB7185'}
          strokeWidth={4}
          strokeLinecap="round"
          opacity={status === 'found' ? 0.9 : 0.55}
          style={{ filter: status === 'found' ? `drop-shadow(0 0 6px ${WS_REVIEW_ACCENT})` : 'none' }}
        />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--em-decor)', fontSize: 18, fontWeight: 700,
            color: status === 'found' ? WS_REVIEW_ACCENT : 'var(--em-text, #EDE6FF)',
            letterSpacing: '0.06em',
          }}>
            {word.word}
          </span>
          <span style={{
            fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.16em',
            padding: '2px 8px', borderRadius: 999,
            background: status === 'found' ? 'rgba(52,211,153,0.18)' : 'rgba(251,113,133,0.18)',
            color: status === 'found' ? '#34D399' : '#FB7185',
            fontWeight: 700,
          }}>
            {status === 'found' ? '✓ FOUND · ZNALEZIONE' : '✗ MISSED · POMINIĘTE'}
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--em-text-dim, rgba(245,239,255,0.65))', lineHeight: 1.4 }}>
          {safeClue}
        </div>
        <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, color: 'rgba(245,239,255,0.4)', letterSpacing: '0.10em' }}>
          PATH · ŚCIEŻKA · [{padded(r1)},{padded(c1)}] → [{padded(r2)},{padded(c2)}] · {word.word.length} liter
        </div>
      </div>
    </div>
  );
}

export const WordsearchShell: React.FC<WordsearchShellProps> = ({ time = 'night', state: forcedState = null, puzzle, onWrongAnswer, onSessionComplete }) => {
  const arcade = useWordArcade();
  const [clueHunt, setClueHunt] = useState(false);
  // Kelly Tier-2 (2026-05-02): defensive props guard.
  const propsInvalid = !forcedState && puzzle !== undefined && (!puzzle.words || puzzle.words.length === 0);
  const activePuzzle: WSPuzzle = puzzle && puzzle.words.length > 0
    ? { size: puzzle.size, words: puzzle.words }
    : WS_PUZZLE;
  const { grid } = useMemo(() => {
    // If the generator/adapter handed us a pre-built grid (with noise letters
    // baked in), use it directly. Otherwise fall back to the shell's own
    // grid-build helper.
    if (puzzle && puzzle.grid && puzzle.grid.length === puzzle.size) {
      return { grid: puzzle.grid };
    }
    return buildWSGrid(activePuzzle);
  }, [activePuzzle, puzzle]);
  // Persisted progress (skipped when forcedState is set for design-canvas demos).
  const persisted = useShellProgress('wordsearch');
  const N = activePuzzle.size;
  const CELL = 42;

  const [found, setFound] = useState<number[]>([]);

  // Layer-4 (EM-040): accumulate wrong drag attempts during the session.
  // We fire onWrongAnswer ONCE at end-of-shell (in the completion effect
  // below) instead of per-mistake, so the InterferenceTip overlay renders
  // as an end-of-session summary rather than mid-play.
  type WrongAttempt = {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  };
  const [wrongAttempts, setWrongAttempts] = useState<WrongAttempt[]>([]);
  const [tipFired, setTipFired] = useState(false);
  // D3-Wordsearch (2026-05-02): single-fire guard for onSessionComplete.
  const sessionFiredRef = useRef(false);

  // Auto-save progress when words are found or shell completes.
  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  React.useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'wordsearch',
      brief: 'Drag across letters in any line to light a hidden word.',
      brief_pl: 'Przeciągnij po literach w dowolnej linii, aby zaświecić ukryte słowo.',
      detail: 'A grid of letters hides the words listed beside it. Drag from the first letter to the last along any straight line — horizontal, vertical, or diagonal — to highlight a word. Found words light up; mistakes simply release. The list shows clues to keep you reading the meaning, not just hunting letter-by-letter.',
      detail_pl: 'Siatka liter ukrywa słowa z listy obok. Przeciągnij od pierwszej litery do ostatniej po linii prostej — poziomo, pionowo lub po skosie — aby podświetlić słowo. Znalezione świecą; błędy po prostu się resetują. Lista pokazuje wskazówki, żebyś czytał znaczenia, a nie tylko szukał liter.',
      fullInstructions: WORDSEARCH_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  React.useEffect(() => {
    if (forcedState) return;
    const total = activePuzzle.words.length;
    persisted.save({ progress: found.length / total, lastState: found.length === total ? 'complete' : 'active' });
    if (found.length === total) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [found.length, forcedState]);
  const [drag, setDrag] = useState<WSDrag | null>(null);
  const [feedback, setFeedback] = useState<WSFeedback>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  // Kelly Tier-2 (2026-05-02): focus-trap refs for the signs-lit dialog.
  const continueBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  // Word index whose start cell is highlighted by the latest hint.
  const [hintReveal, setHintReveal] = useState<number | null>(null);

  // Kelly Tier 1 (2026-05-02): keyboard cursor for non-mouse users.
  // - Arrow keys move the cursor cell.
  // - Space (or Enter) on the cursor cell drops an anchor (start of selection).
  //   With an anchor set, arrow keys extend the selection; the live drag
  //   preview reuses the same `drag` state the mouse handler writes to.
  //   A second Space/Enter commits the selection (same word-match path as
  //   onUp). Escape clears the anchor and abandons the in-progress selection.
  const [kbCursor, setKbCursor] = useState<[number, number]>([0, 0]);
  const [kbAnchor, setKbAnchor] = useState<[number, number] | null>(null);

  // Reveal the start cell of the first not-yet-found word.
  const useHint = (): void => {
    if (forcedState || hintsUsed >= 3) return;
    const idx = activePuzzle.words.findIndex((_, i) => !found.includes(i));
    if (idx < 0) return;
    setHintReveal(idx);
    setHintsUsed((h) => h + 1);
  };

  useEffect(() => {
    if (forcedState === 'empty') {
      setFound([]);
      setFeedback(null);
    }
    if (forcedState === 'active') {
      setFound([0]);
      setDrag({ start: [3, 1], current: [3, 5] });
      setFeedback(null);
    }
    if (forcedState === 'correct') {
      setFound([0, 1]);
      setFeedback('correct');
    }
    if (forcedState === 'wrong') {
      setFound([0]);
      setFeedback('wrong');
      setDrag({ start: [9, 1], current: [9, 3] });
    }
    if (forcedState === 'complete') {
      setFound([0, 1, 2, 3, 4, 5, 6, 7]);
      setFeedback(null);
    }
  }, [forcedState]);

  const pickCell = (e: React.MouseEvent | React.TouchEvent): [number, number] | null => {
    const r = gridRef.current?.getBoundingClientRect();
    if (!r) return null;
    const me = e as React.MouseEvent;
    const te = e as React.TouchEvent;
    const cx = me.clientX ?? te.touches?.[0]?.clientX;
    const cy = me.clientY ?? te.touches?.[0]?.clientY;
    if (cx === undefined || cy === undefined) return null;
    const x = cx - r.left;
    const y = cy - r.top;
    const c = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    if (row < 0 || row >= N || c < 0 || c >= N) return null;
    return [row, c];
  };

  const onDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (forcedState) return;
    const cell = pickCell(e);
    if (!cell) return;
    setDrag({ start: cell, current: cell });
  };
  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drag) return;
    const cell = pickCell(e);
    if (!cell) return;
    const [sr, sc] = drag.start;
    const dr = cell[0] - sr;
    const dc = cell[1] - sc;
    let snapped: [number, number] = cell;
    if (Math.abs(dr) > 0 || Math.abs(dc) > 0) {
      const adr = Math.abs(dr);
      const adc = Math.abs(dc);
      const ratio = adc === 0 ? Infinity : adr / adc;
      if (ratio < 0.4) snapped = [sr, cell[1]];
      else if (ratio > 2.5) snapped = [cell[0], sc];
      else {
        const m = Math.max(adr, adc);
        snapped = [sr + Math.sign(dr) * m, sc + Math.sign(dc) * m];
      }
      snapped = [Math.max(0, Math.min(N - 1, snapped[0])), Math.max(0, Math.min(N - 1, snapped[1]))];
    }
    setDrag({ ...drag, current: snapped });
  };
  const finishSelection = (selection: WSDrag | null) => {
    if (!selection || forcedState) return;
    const [r1, c1] = selection.start;
    const [r2, c2] = selection.current;
    const matchIdx = activePuzzle.words.findIndex(
      (w) =>
        (w.start[0] === r1 && w.start[1] === c1 && w.end[0] === r2 && w.end[1] === c2) ||
        (w.start[0] === r2 && w.start[1] === c2 && w.end[0] === r1 && w.end[1] === c1),
    );
    if (matchIdx >= 0 && !found.includes(matchIdx)) {
      arcade.answer(true,150);
      setFound((f) => [...f, matchIdx]);
      setFeedback('correct');
      setTimeout(() => setFeedback(null), 1000);
      // If the hint was on this word, clear the reveal — it's done its job.
      if (hintReveal === matchIdx) setHintReveal(null);
    } else if (matchIdx < 0 && (r1 !== r2 || c1 !== c2)) {
      arcade.answer(false);
      setFeedback('wrong');
      setTimeout(() => setFeedback(null), 800);
      // Layer-4 (EM-040): instead of firing onWrongAnswer immediately on
      // each mis-drag (which would interrupt iterative play), accumulate
      // the wrong attempt. We fire ONCE at end-of-shell (see completion
      // effect below) so the InterferenceTip overlay reads as a summary.
      if (!forcedState) {
        const firstUnfound = activePuzzle.words.find(
          (_, i) => !found.includes(i),
        );
        if (firstUnfound) {
          setWrongAttempts((prev) => [
            ...prev,
            {
              questionId: firstUnfound.word,
              studentAnswer: `${r1},${c1}→${r2},${c2}`,
              correctAnswer: firstUnfound.word,
              explanationPL: firstUnfound.clue_pl,
              exerciseId: firstUnfound.exerciseId,
            },
          ]);
        }
      }
    }
    setDrag(null);
  };

  const onUp = () => finishSelection(drag);

  // Kelly Tier 1 (2026-05-02): keyboard handler. Reuses onUp's match logic
  // by building the same `drag` shape from anchor + cursor and calling onUp().
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (forcedState) return;
    const k = e.key;
    if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      setKbCursor(([r, c]) => {
        const nr = r + (k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0);
        const nc = c + (k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0);
        const next: [number, number] = [
          Math.max(0, Math.min(N - 1, nr)),
          Math.max(0, Math.min(N - 1, nc)),
        ];
        if (kbAnchor) setDrag({ start: kbAnchor, current: next });
        return next;
      });
      return;
    }
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (!kbAnchor) {
        setKbAnchor(kbCursor);
        setDrag({ start: kbCursor, current: kbCursor });
      } else {
        // Commit using existing match logic.
        finishSelection({start:kbAnchor,current:kbCursor});
        setKbAnchor(null);
      }
      return;
    }
    if (k === 'Escape') {
      e.preventDefault();
      setKbAnchor(null);
      setDrag(null);
    }
  };

  const drawLine = (
    start: [number, number],
    end: [number, number],
    color: string,
    opacity = 1,
    glow = true,
    key: string | null = null,
  ) => {
    const [r1, c1] = start;
    const [r2, c2] = end;
    const x1 = c1 * CELL + CELL / 2;
    const y1 = r1 * CELL + CELL / 2;
    const x2 = c2 * CELL + CELL / 2;
    const y2 = r2 * CELL + CELL / 2;
    return (
      <line
        key={key ?? undefined}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={CELL * 0.7}
        strokeLinecap="round"
        opacity={opacity}
        style={{ filter: glow ? `drop-shadow(0 0 12px ${color})` : 'none' }}
      />
    );
  };

  const neonColors = ['#E879F9', '#FBBF24', '#34D399', '#7DD3FC', '#FB7185', '#A78BFA', '#BEF264', '#F472B6'];

  const completed = found.length === activePuzzle.words.length;

  // Layer-4 (EM-040): when the shell completes, surface the first wrong
  // attempt accumulated during play so the InterferenceTip overlay renders
  // as an end-of-shell summary. Guarded by tipFired so we only fire once.
  useEffect(() => {
    if (forcedState) return;
    if (!completed) return;
    if (tipFired) return;
    if (wrongAttempts.length === 0) return;
    if (!onWrongAnswer) return;
    onWrongAnswer(wrongAttempts[0]);
    setTipFired(true);
  }, [completed, tipFired, wrongAttempts, onWrongAnswer, forcedState]);

  // D3-Wordsearch (2026-05-02): fire onSessionComplete ONCE when every word
  // is found. Wordsearch has no skip-an-individual-word path today (the Skip
  // button isn't wired here yet), so completion only fires on full clear.
  // foundWordIndices lets the review render per-word found/missed status; we
  // include all puzzle.words and let the renderer mark non-found as "missed".
  useEffect(() => {
    if (forcedState) return;
    if (!completed) return;
    if (sessionFiredRef.current) return;
    if (!onSessionComplete) return;
    sessionFiredRef.current = true;
    arcade.complete();
    onSessionComplete({
      correctCount: found.length,
      totalQuestions: activePuzzle.words.length,
      wrongAttempts: [...wrongAttempts],
      puzzle: activePuzzle,
      foundWordIndices: [...found],
    });
  }, [completed, forcedState, onSessionComplete, found, wrongAttempts, activePuzzle]);

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the signs-lit dialog.
  useEffect(() => {
    if (!completed) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const focusId = window.setTimeout(() => { continueBtnRef.current?.focus(); }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        continueBtnRef.current?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      window.clearTimeout(focusId);
      document.removeEventListener('keydown', trap);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [completed]);

  const liveStatus = completed
    ? 'All neon signs lit. Wordsearch complete.'
    : feedback === 'correct'
      ? `Word found.`
      : feedback === 'wrong'
        ? `Not a word. Try a different line.`
        : '';

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div
      className="em-shell em-shell-wordsearch"
      role="application"
      aria-label="Wordsearch puzzle, Neon Market"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {liveStatus}
      </div>

      {/* Decorative neon corner-signs.
          Ricky 2026-05-02 (#15 fix): "24h" was at left:78%/top:8% — directly under the
          right column's HintCard area at every common viewport (375/414/768/1280/1920),
          partially occluding "Bajla mówi" copy. Repositioned to far top-right edge
          (left:92%/top:2%) so it sits in the unused page-margin band above the right
          column's padding. Also: explicit zIndex:0 on this layer + pointerEvents:none
          on each sign (parent already has it, but belt-and-braces) + zIndex:3 on the
          functional layout container below — guarantees taps always hit cards/grid. */}

      {/* Idle ambient layer (Ricky 2026-05-02, audit #9 right-side dead-space win):
          distant cityscape silhouette + 3 flickering background micro-signs. Pure
          decoration — pointer-events:none, zIndex:0, behind the functional layout. */}





      <div className="em-shell-ws-layout" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24, padding: 32, height: '100%', boxSizing: 'border-box', zIndex: 3 }}>

        <div className="em-card" style={{ display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #14082A 0%, #08041A 100%)' }}>
          <div style={{ position: 'relative', padding: '24px 28px', borderBottom: '1px solid var(--em-line)' }}>
            <AmbientAudioPlayer shellSlug="wordsearch" />
            <Nameplate
              district="Neon Market"
              subtitle="Wordsearch · Wykreślanka · find what's lit up"
              accent="#FBBF24"
              icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 2 L11 7 M11 15 L11 20 M2 11 L7 11 M15 11 L20 11 M5 5 L8 8 M14 14 L17 17 M5 17 L8 14 M14 8 L17 5" stroke="#FBBF24" strokeWidth="1.6" strokeLinecap="round" /><circle cx="11" cy="11" r="3" stroke="#FBBF24" strokeWidth="1.6" /></svg>}
            />
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, display: 'flex', gap: 12, padding: '4px 24px', overflow: 'hidden' }}>
              {Array.from({ length: 28 }).map((_, i) => (
                <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#FBBF24', boxShadow: '0 0 8px #FBBF24', animation: `em-flicker ${2 + (i % 4)}s ${i * 0.1}s infinite` }} />
              ))}
            </div>
          </div>

          <WordSuspense fallback={<p>Opening the 3D district…</p>}><WordScene3D grid={grid} routes={found.map(i=>activePuzzle.words[i])} onTrail={(start,end)=>finishSelection({start,current:end})}/></WordSuspense>
          <details><summary>Flat grid and keyboard route controls</summary>          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, position: 'relative' }}>
            <div
              ref={gridRef}
              role="grid"
              aria-label="Wordsearch letter grid. Drag across letters in a line to select a word, or use arrow keys to move and Space to start and end a selection."
              tabIndex={0}
              onKeyDown={onGridKeyDown}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onMouseLeave={onUp}
              onTouchStart={onDown}
              onTouchMove={onMove}
              onTouchEnd={onUp}
              style={{ position: 'relative', width: N * CELL, height: N * CELL, userSelect: 'none', touchAction: 'none' }}
            >
              <svg style={{ position: 'absolute', inset: 0, width: N * CELL, height: N * CELL, pointerEvents: 'none' }}>
                {found.map((idx) => drawLine(activePuzzle.words[idx].start, activePuzzle.words[idx].end, neonColors[idx], 0.55, true, `found-${idx}`))}
                {drag && drawLine(drag.start, drag.current, feedback === 'wrong' ? '#FB7185' : '#FBBF24', 0.7, true, 'drag')}
                {/* Keyboard cursor — only visible when grid has focus, drawn via :focus-visible
                    on the grid container can't reach into the SVG, so we render unconditionally
                    and rely on the grid container's focus outline to signal "the grid is focused". */}
                <rect
                  x={kbCursor[1] * CELL + 2}
                  y={kbCursor[0] * CELL + 2}
                  width={CELL - 4}
                  height={CELL - 4}
                  fill="none"
                  stroke="#7DD3FC"
                  strokeWidth={kbAnchor ? 2.5 : 1.5}
                  strokeDasharray={kbAnchor ? '0' : '4 3'}
                  opacity={0.7}
                  rx={6}
                />
                {kbAnchor && (
                  <rect
                    x={kbAnchor[1] * CELL + 4}
                    y={kbAnchor[0] * CELL + 4}
                    width={CELL - 8}
                    height={CELL - 8}
                    fill="none"
                    stroke="#FBBF24"
                    strokeWidth={2}
                    opacity={0.9}
                    rx={4}
                  />
                )}
                {hintReveal !== null && (() => {
                  const w = activePuzzle.words[hintReveal];
                  if (!w) return null;
                  const [hr, hc] = w.start;
                  const cx = hc * CELL + CELL / 2;
                  const cy = hr * CELL + CELL / 2;
                  return (
                    <g key="hint-pulse" style={{ animation: 'em-tip-fade 220ms var(--em-ease) both' }}>
                      <circle cx={cx} cy={cy} r={CELL * 0.55} fill="none" stroke="#FBBF24" strokeWidth="3" opacity="0.95" style={{ filter: 'drop-shadow(0 0 12px #FBBF24)' }} />
                      <circle cx={cx} cy={cy} r={CELL * 0.85} fill="none" stroke="#FBBF24" strokeWidth="1.5" opacity="0.6" />
                    </g>
                  );
                })()}
              </svg>

              {grid.map((row, r) =>
                row.map((letter, c) => {
                  const inFound = found.some((idx) => {
                    const w = activePuzzle.words[idx];
                    const len = w.word.length;
                    const [r1, c1] = w.start;
                    const [r2, c2] = w.end;
                    const dr = (r2 - r1) / (len - 1);
                    const dc = (c2 - c1) / (len - 1);
                    for (let i = 0; i < len; i++) {
                      const rr = r1 + Math.round(dr * i);
                      const cc = c1 + Math.round(dc * i);
                      if (rr === r && cc === c) return true;
                    }
                    return false;
                  });
                  return (
                    <div
                      key={`${r},${c}`}
                      role="gridcell"
                      aria-label={`Letter ${letter} at row ${r + 1} column ${c + 1}${inFound ? ', part of a found word' : ''}`}
                      style={{
                        position: 'absolute',
                        left: c * CELL,
                        top: r * CELL,
                        width: CELL,
                        height: CELL,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--em-display)',
                        fontWeight: 600,
                        fontSize: 18,
                        color: inFound ? '#0E0A1A' : 'rgba(245,239,255,0.78)',
                        textShadow: inFound ? 'none' : '0 0 6px rgba(232,121,249,0.2)',
                        pointerEvents: 'none',
                        transition: 'color 220ms',
                        zIndex: 2,
                      }}
                    >
                      {letter}
                    </div>
                  );
                }),
              )}
            </div>
          </div>

          </details>{completed && !onSessionComplete && (
            <div
              role="dialog"
              aria-modal="true"
              aria-live="assertive"
              aria-label="Wordsearch complete"
              style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse, rgba(251,191,36,0.18), rgba(8,4,26,0.9))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, animation: 'em-rise 0.5s var(--em-ease)' }}
            >
              <Bajla size={84} mood="cheer" decorative />
              <div className="em-decor" style={{ fontSize: 38, color: '#FBBF24', textShadow: '0 0 20px #FBBF24aa' }}>The signs are all lit.</div>
              <div className="em-eyebrow">MARKET CLOSED · TARG ZAMKNIĘTY</div>
              <button ref={continueBtnRef} className="em-btn em-btn-primary" style={{ marginTop: 8 }}>Continue your stroll →</button>
            </div>
          )}
          <Confetti show={completed} />
        </div>

        <div className="em-shell-ws-side" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* TODO (EM-041 follow-up): add `seen` counter — track skipped words separately
                from `found.length`, pass `seen={found.length + skippedCount}` to <Progress>
                so the eyebrow shows Q seen/total · ✓ found/total. SkipButton currently has
                no onClick; wire it to a `skip()` that bumps skippedCount and (optionally)
                reveals the next unfound word's first letter. — Builder 7, 2026-04-30 */}
            <Progress current={found.length} total={activePuzzle.words.length} accent="#FBBF24" />
            <div style={{ display: 'flex', gap: 6 }}>
              <SkipButton />
              <HintButton onClick={useHint} used={hintsUsed} total={3} />
            </div>
          </div>

<WordMission kind="search" current={found.length} total={activePuzzle.words.length} chain={arcade.chain} reaction={arcade.reaction}/>
          <div className="wa-inline-tools"><button aria-pressed={clueHunt} onClick={()=>setClueHunt(v=>!v)}>Clue hunt {clueHunt?'on':'off'}</button><span>{clueHunt?'Use the meaning to find the hidden English word.':'See the words or switch to a harder clue hunt.'}</span></div>
          <div className="em-shell-hint" style={{ minWidth: 0 }}>
          </div>

          <div className="em-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--em-line)', display: 'flex', justifyContent: 'space-between' }}>
              <div className="em-eyebrow">Words to find · do znalezienia</div>
              <div className="em-eyebrow" style={{ color: '#FBBF24' }}>{found.length}/{activePuzzle.words.length}</div>
            </div>
            <div className="em-scroll" role="list" aria-label="Words to find" style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 12 }}>
              {activePuzzle.words.map((w, i) => {
                const got = found.includes(i);
                // Kelly Tier-2 (2026-05-02 / CC-2): per-shell hint guard.
                // Words found are revealed (got === true) so we can show the
                // raw hint then; pre-find we surface a sanitised version.
                const displayHint = got ? w.clue_pl : safeWordsearchHint(w.clue_pl, w.word);
                return (
                  <div
                    key={i}
                    role="listitem"
                    aria-label={`${clueHunt&&!got?`${w.word.length} letters`:w.word}, ${displayHint}${got ? ', found' : ', not yet found'}`}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: got ? `${neonColors[i]}1f` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${got ? neonColors[i] + '66' : 'var(--em-line)'}`,
                      transition: 'all 220ms',
                      position: 'relative',
                    }}
                  >
                    <div style={{
                      fontFamily: 'var(--em-decor)',
                      fontSize: 18,
                      color: got ? neonColors[i] : 'var(--em-text-muted)',
                      textShadow: got ? `0 0 10px ${neonColors[i]}` : 'none',
                      letterSpacing: '0.06em',
                      textDecorationLine: got ? 'line-through' : 'none',
                      textDecorationColor: `${neonColors[i]}66`,
                    }}>{clueHunt&&!got?`${w.word.length} letters · ?`:w.word}</div>
                    <div style={{ fontSize: 11, color: 'var(--em-text-dim)', marginTop: 2 }}>{displayHint}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WordsearchShell;
