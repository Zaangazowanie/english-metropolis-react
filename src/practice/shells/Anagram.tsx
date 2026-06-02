// Anagram — The Underpass district.
// Click letter tiles to spell the word. Click filled slots to remove.
// Tiles glow neon when used; brick wall for atmosphere.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import type { ShellAnagramPuzzle } from '../lib/adapters';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bajla, HintButton, Nameplate, Progress, SkipButton } from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';

// Letter Workshop · Anagram — full bilingual instruction copy.
const ANAGRAM_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'Scrambled letter tiles sit on the workshop bench, with empty slots above.',
      'Tap or drag tiles into the slots to spell the target word.',
      'Read the clue first — it tells you the meaning, not the letters.',
      'Tiles you have already used are dimmed; tap a slot again to release the letter.',
    ],
    pl: [
      'Na stole warsztatu leżą pomieszane litery, a nad nimi puste kratki.',
      'Stukaj lub przeciągaj litery do kratek, aby ułożyć słowo docelowe.',
      'Najpierw przeczytaj wskazówkę — mówi o znaczeniu, nie o literach.',
      'Użyte litery są wyszarzone; stuknij kratkę ponownie, aby zwolnić literę.',
    ],
  },
  controls: {
    en: [
      'Letter slots: empty boxes above the bench show how many letters the word has.',
      'Letter tiles: scrambled in a row at the bottom — tap one to drop it into the next free slot.',
      'Clear button: empties all slots and returns every tile to the bench.',
      'Hint button: 3 hints per session — each reveals the next letter in the next empty slot.',
      'Skip button: gives up the current word and moves to the next wall.',
    ],
    pl: [
      'Kratki na litery: puste pudełka nad stołem pokazują, ile liter ma słowo.',
      'Płytki z literami: pomieszane w rzędzie u dołu — stuknij jedną, aby wpadła do następnej wolnej kratki.',
      'Przycisk Wyczyść: opróżnia wszystkie kratki i wraca każdą płytkę na stół.',
      'Przycisk Podpowiedź: 3 podpowiedzi na sesję — każda odkrywa następną literę w pustej kratce.',
      'Przycisk Pomiń: rezygnuje z bieżącego słowa i przechodzi do następnej ściany.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Correct word: the wall lights up green and Bajla cheers — Find another wall →.',
      'Wrong order: nothing breaks; just tap the wrong slot to release the letter and try again.',
      'Skip: counts as a miss for streak purposes — moves to the next word.',
      'There is no wrong-letter penalty — Anagram is about exploration, not punishment.',
    ],
    pl: [
      'Słowo poprawne: ściana świeci na zielono, Bajla się cieszy — Znajdź następną ścianę →.',
      'Zła kolejność: nic się nie psuje; stuknij niepoprawną kratkę, aby zwolnić literę i spróbuj ponownie.',
      'Pomiń: liczy się jako pudło dla serii — przechodzi do następnego słowa.',
      'Nie ma kary za błędną literę — Anagram to eksploracja, a nie karanie.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Each tap reveals the next letter in the next empty slot. Save them for words where the cluster (e.g. "ough", "tion") is what is throwing you off.',
    pl:
      'Masz 3 podpowiedzi na sesję. Każde kliknięcie odkrywa następną literę w pustej kratce. Zachowaj je na słowa, gdzie myli cię klaster (np. „ough", „tion").',
  },
  scoring: {
    en:
      'Skip counts as a miss. Each completed word adds to your session streak. Decoding all walls unlocks the Letter Workshop completion screen and saves your score to your timeline.',
    pl:
      'Pomiń liczy się jako pudło. Każde ukończone słowo zwiększa serię. Rozszyfrowanie wszystkich ścian odblokowuje ekran zakończenia Warsztatu Liter i zapisuje wynik na osi czasu.',
  },
  l1Pattern: {
    en:
      'Polish learners often re-construct irregular past forms by analogy ("teached" instead of "taught"). Anagram drills the surface form so the irregular spelling is in your fingers, not just your head.',
    pl:
      'Polscy uczniowie często składają nieregularne formy przeszłe przez analogię („teached" zamiast „taught"). Anagram utrwala formę powierzchniową, więc nieregularna pisownia mieszka w palcach, a nie tylko w głowie.',
  },
};

// ─────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────
interface AnagramPuzzle {
  word: string;
  clue: string;
  clue_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample AG_PUZZLES
   *  don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

const AG_PUZZLES: AnagramPuzzle[] = [
  { word: 'BRIDGE',   clue: 'It crosses a river.',        clue_pl: 'Przechodzi nad rzeką.' },
  { word: 'METRO',    clue: 'Underground train.',         clue_pl: 'Kolej podziemna.' },
  { word: 'STREET',   clue: 'A road through town.',       clue_pl: 'Droga przez miasto.' },
  { word: 'WINDOW',   clue: 'You look out of it.',        clue_pl: 'Patrzysz przez nie.' },
  { word: 'COFFEE',   clue: 'Morning drink.',             clue_pl: 'Poranny napój.' },
];

const TILE_COLORS = ['#FBBF24', '#FB7185', '#7DD3FC', '#BEF264', '#E879F9', '#A78BFA'];

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type ShellTime = 'day' | 'dusk' | 'night';
export type ShellState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;

export interface AnagramShellProps {
  time?: ShellTime;
  state?: ShellState;
  /**
   * When provided (e.g. from StudentPractice's generator + adapter pipeline),
   * the shell renders this puzzle deck instead of AG_PUZZLES. Accepts either
   * a single puzzle or an array (we always normalise to array internally).
   */
  puzzle?: ShellAnagramPuzzle | ShellAnagramPuzzle[];
  /**
   * Layer-4 dynamic-scaffolding hook (Agent A12). Fires when the player
   * fills every slot but spelled the word wrong.
   */
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3 Wave-5 (Ricky 2026-05-02): per-puzzle review payload. Fires once when
   * the student has worked through every word in the deck. Carries the full
   * puzzle deck + per-puzzle wrong attempts so PracticeReview can show one
   * review row per anagram (scrambled letters → student's guess → correct).
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
    puzzle: { items: AnagramPuzzle[] };
    studentAnswers: Record<string, string>;
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// renderAnagramReviewItem — per-word locked render for PracticeReview.
// Letter Workshop scoreboard: scrambled letters ribbon + student's final
// arrangement vs the correct word + the EN/PL clue.
// ─────────────────────────────────────────────────────────────────────────
const AG_REVIEW_ACCENT = '#BEF264';
export function renderAnagramReviewItem(
  puzzle: AnagramPuzzle,
  number: number,
  studentAnswer: string | undefined,
): React.ReactNode {
  const correct = puzzle.word;
  const stu = studentAnswer ?? '';
  const isWrong = stu.length > 0 && stu !== correct;
  const scrambled = puzzle.word.split('').sort((a, b) => (a.charCodeAt(0) * 7) % 13 - (b.charCodeAt(0) * 7) % 13).join('');
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: isWrong
        ? 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(190,242,100,0.10), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(190,242,100,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${AG_REVIEW_ACCENT}22`, color: AG_REVIEW_ACCENT,
          border: `1px solid ${AG_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          WORD {String(number).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(190,242,100,0.22)',
          color: isWrong ? '#FB7185' : AG_REVIEW_ACCENT,
        }}>
          {isWrong ? '✗ MIXED · POMIESZANE' : '✓ DECODED · ROZSZYFROWANE'}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.3em',
        color: 'rgba(245,239,255,0.55)',
      }}>
        SCRAMBLED · {scrambled.split('').join(' · ')}
      </div>
      {isWrong && (
        <div style={{ color: '#FB7185', fontFamily: 'var(--em-decor)', fontSize: 18 }}>
          ✗ NIE · You spelled: <strong>{stu}</strong>
        </div>
      )}
      <div style={{ color: AG_REVIEW_ACCENT, fontFamily: 'var(--em-decor)', fontSize: 18 }}>
        ✓ TAK · The word: <strong>{correct}</strong>
      </div>
      <div style={{ fontFamily: 'var(--em-body)', fontSize: 13, color: 'var(--em-text-muted)' }}>
        {puzzle.clue}
        <div style={{ opacity: 0.7, fontStyle: 'italic', marginTop: 2 }}>🇵🇱 {puzzle.clue_pl}</div>
      </div>
    </div>
  );
}

export type { AnagramPuzzle as ShellAnagramPuzzleInternal };

interface Tile {
  id: number;
  letter: string;
  color: string;
  rot: number;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export const AnagramShell: React.FC<AnagramShellProps> = ({ time = 'night', state: forcedState = null, puzzle: puzzleProp, onWrongAnswer, onSessionComplete }) => {
  const accent = '#BEF264';
  // Kelly Tier-2 (2026-05-02): defensive props guard.
  const propsInvalid = !forcedState && puzzleProp !== undefined && (
    Array.isArray(puzzleProp) ? puzzleProp.length === 0 : !puzzleProp.word
  );
  // Persisted progress (skipped when forcedState is set for design-canvas demos).
  const persisted = useShellProgress('anagram');

  // Normalise the optional puzzle prop to an array deck. Use the built-in
  // demo deck when no puzzle is supplied (or it's empty).
  const puzzleDeck: AnagramPuzzle[] = (() => {
    if (!puzzleProp) return AG_PUZZLES;
    const arr = Array.isArray(puzzleProp) ? puzzleProp : [puzzleProp];
    return arr.length > 0 ? arr : AG_PUZZLES;
  })();

  const [puzzleIdx, setPuzzleIdx] = useState<number>(0);
  const [slots, setSlots] = useState<number[]>([]);
  const [shake, setShake] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  // Last hint reveal — shown next to the active slot row, fades in.
  const [hintReveal, setHintReveal] = useState<{ slotIdx: number; letter: string } | null>(null);

  // Layer-4 (EM-040): accumulate wrong spell attempts during this puzzle and
  // fire onWrongAnswer ONCE at end-of-puzzle (when `won` becomes true) so
  // the InterferenceTip overlay reads as a summary, not a per-attempt nag.
  // Cleared whenever the puzzle changes (next / clear / forcedState reset).
  type WrongAttempt = {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  };
  const [wrongAttempts, setWrongAttempts] = useState<WrongAttempt[]>([]);
  const [tipFired, setTipFired] = useState(false);

  // D3 Wave-5 (Ricky 2026-05-02): per-deck wrong-attempt log + per-puzzle
  // student final answer for the review-screen payload. Indexed by puzzle.word.
  const [allWrongAttempts, setAllWrongAttempts] = useState<WrongAttempt[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [completedFired, setCompletedFired] = useState(false);

  const puzzle = puzzleDeck[puzzleIdx % puzzleDeck.length];

  // Build deterministic shuffled tile pool
  const tiles: Tile[] = useMemo(() => {
    const letters = puzzle.word.split('');
    const seed = puzzle.word.length * 17 + 5;
    const indexed: Tile[] = letters.map((l, i) => ({
      id: i,
      letter: l,
      color: TILE_COLORS[i % TILE_COLORS.length],
      rot: ((i * seed) % 9) - 4,
    }));
    return indexed.slice().sort((a, b) => ((a.id * seed) % 13) - ((b.id * seed) % 13));
  }, [puzzleIdx, puzzle.word]);

  useEffect(() => {
    setSlots([]);
    // Layer-4 (EM-040): reset accumulated wrong attempts when the puzzle
    // changes, so each puzzle's tip summary stands alone.
    setWrongAttempts([]);
    setTipFired(false);
  }, [puzzleIdx]);

  // Tile ids ordered to spell the target word
  const correctOrder: number[] = useMemo(() => {
    const used = new Set<number>();
    const out: number[] = [];
    for (const letter of puzzle.word.split('')) {
      const t = tiles.find(t => t.letter === letter && !used.has(t.id));
      if (t) {
        used.add(t.id);
        out.push(t.id);
      }
    }
    return out;
  }, [tiles, puzzle.word]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') { setSlots([]); setShake(false); }
    if (forcedState === 'active') {
      setSlots(correctOrder.slice(0, 2));
      setShake(false);
    }
    if (forcedState === 'correct') {
      setSlots(correctOrder);
      setShake(false);
    }
    if (forcedState === 'wrong') {
      const partial = correctOrder.slice(0, correctOrder.length - 1);
      const lastWrong = tiles.find(t => !partial.includes(t.id) && t.id !== correctOrder[correctOrder.length - 1]);
      setSlots(lastWrong ? [...partial, lastWrong.id] : correctOrder);
      setShake(true);
    }
    if (forcedState === 'complete') {
      setSlots(correctOrder);
      setShake(false);
    }
  }, [forcedState, correctOrder, tiles]);

  const inSlots = new Set(slots);
  const built = slots.map(id => tiles.find(t => t.id === id)?.letter ?? '').join('');
  const targetLen = puzzle.word.length;
  const won = built === puzzle.word;

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'anagram',
      brief: 'Tap the scrambled tiles into the slots to spell the word.',
      brief_pl: 'Stukaj pomieszane litery w kratki, aby ułożyć słowo.',
      detail: 'Scrambled letter tiles sit on the workshop bench, with empty slots above. Tap or drag tiles into the slots to spell the target word. Read the clue first — it tells you the meaning, not the letters.',
      detail_pl: 'Na stole warsztatu leżą pomieszane litery, a nad nimi puste kratki. Stukaj lub przeciągaj litery do kratek, aby ułożyć słowo docelowe. Najpierw przeczytaj wskazówkę — mówi o znaczeniu, nie o literach.',
      fullInstructions: ANAGRAM_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  // Auto-save on win or hint use.
  useEffect(() => {
    if (forcedState) return;
    if (won) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [won, forcedState]);

  // Layer-4 (EM-040): when the puzzle is won, surface the first wrong
  // attempt accumulated during play so the InterferenceTip overlay renders
  // as an end-of-puzzle summary. Guarded by tipFired so we only fire once
  // per puzzle (state is cleared when puzzleIdx changes).
  useEffect(() => {
    if (forcedState) return;
    if (!won) return;
    if (tipFired) return;
    if (wrongAttempts.length === 0) return;
    if (!onWrongAnswer) return;
    onWrongAnswer(wrongAttempts[0]);
    setTipFired(true);
  }, [won, tipFired, wrongAttempts, onWrongAnswer, forcedState]);

  const placeTile = (id: number): void => {
    if (forcedState) return;
    if (inSlots.has(id)) return;
    if (slots.length >= targetLen) return;
    const next = [...slots, id];
    setSlots(next);
    const builtNext = next.map(tid => tiles.find(t => t.id === tid)?.letter ?? '').join('');
    if (builtNext.length === targetLen && builtNext !== puzzle.word) {
      setShake(true);
      setAnnouncement('Wrong order. Spróbuj jeszcze raz.');
      setTimeout(() => setShake(false), 500);
      // Layer-4 (EM-040): instead of firing onWrongAnswer immediately on
      // each wrong full-slot attempt (which interrupts iterative tile-by-
      // tile play), accumulate the wrong attempt. We fire ONCE at end-of-
      // puzzle (see won-effect above) so the InterferenceTip overlay
      // reads as a summary.
      const w: WrongAttempt = {
        questionId: puzzle.word,
        studentAnswer: builtNext,
        correctAnswer: puzzle.word,
        explanationPL: puzzle.clue_pl,
        exerciseId: puzzle.exerciseId,
      };
      setWrongAttempts((prev) => [...prev, w]);
      // D3 Wave-5: also push to the per-deck log for review-screen.
      setAllWrongAttempts((prev) => [...prev, w]);
      setStudentAnswers((prev) => ({ ...prev, [puzzle.word]: builtNext }));
    } else if (builtNext === puzzle.word) {
      setAnnouncement(`Correct. ${puzzle.word}.`);
      // D3 Wave-5: record the student's correct final spelling so the review
      // shows "you spelled X" even on first-try wins.
      setStudentAnswers((prev) => ({ ...prev, [puzzle.word]: builtNext }));
      setVisitedIds((prev) => {
        const n = new Set(prev);
        n.add(puzzle.word);
        return n;
      });
    }
  };

  const removeAt = (i: number): void => {
    setSlots(s => s.filter((_, idx) => idx !== i));
    setHintReveal(null);
  };
  const clear = (): void => { setSlots([]); setAnnouncement(''); setHintReveal(null); };
  const next = (): void => {
    // D3 Wave-5: mark the current puzzle as visited (skipped or solved),
    // so the deck's session-complete trigger advances even on Skip.
    setVisitedIds((prev) => {
      const n = new Set(prev);
      n.add(puzzle.word);
      return n;
    });
    setPuzzleIdx(i => (i + 1) % puzzleDeck.length);
    setAnnouncement('');
    setHintReveal(null);
    setHintsUsed(0);
  };

  // D3 Wave-5 (Ricky 2026-05-02): fire onSessionComplete once the student
  // has visited every puzzle in the deck. The completion trigger is
  // visited-set based (not puzzleIdx-based) because next() wraps cyclically.
  useEffect(() => {
    if (forcedState) return;
    if (completedFired) return;
    if (!onSessionComplete) return;
    if (visitedIds.size < puzzleDeck.length) return;
    setCompletedFired(true);
    const wrongIds = new Set(allWrongAttempts.map((w) => w.questionId));
    onSessionComplete({
      correctCount: puzzleDeck.length - wrongIds.size,
      totalQuestions: puzzleDeck.length,
      wrongAttempts: allWrongAttempts,
      puzzle: { items: puzzleDeck },
      studentAnswers,
    });
  }, [visitedIds, completedFired, onSessionComplete, puzzleDeck, allWrongAttempts, studentAnswers, forcedState]);

  // Kelly Tier-2 (2026-05-02): focus-trap refs for the wall-decoded dialog.
  const findAnotherBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Reveal the letter for the next empty slot (if any).
  const useHint = (): void => {
    if (forcedState || hintsUsed >= 3) return;
    const nextSlotIdx = slots.length;
    if (nextSlotIdx >= targetLen) return;
    const letter = puzzle.word[nextSlotIdx];
    setHintReveal({ slotIdx: nextSlotIdx, letter });
    setHintsUsed(h => h + 1);
    setAnnouncement(`Hint: next letter is ${letter}.`);
  };

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the wall-decoded dialog.
  useEffect(() => {
    if (!won) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const focusId = window.setTimeout(() => { findAnotherBtnRef.current?.focus(); }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        findAnotherBtnRef.current?.focus();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        next();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      window.clearTimeout(focusId);
      document.removeEventListener('keydown', trap);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div className="em-shell" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Decorative atmosphere stack — Ricky 2026-05-02 (#15 audit pass).
          All four full-bleed layers below are pure decoration. Force zIndex:0
          and pointerEvents:none so taps never get captured by the brick wall
          or vignette overlays — guarantees the slot row (zIndex:5) and tile
          pool always receive clicks at every viewport. */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background:
        time === 'day'
          ? 'linear-gradient(180deg, #2D1F4A 0%, #4C2570 100%)'
          : time === 'dusk'
            ? 'linear-gradient(180deg, #110A22 0%, #2A1450 100%)'
            : 'linear-gradient(180deg, #07041A 0%, #1F0E3A 100%)'
      }}/>
      {/* brick wall */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.3, backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='40'><rect width='80' height='40' fill='%2329183D'/><rect x='0' y='0' width='40' height='20' stroke='%23120822' stroke-width='2' fill='none'/><rect x='40' y='0' width='40' height='20' stroke='%23120822' stroke-width='2' fill='none'/><rect x='-20' y='20' width='40' height='20' stroke='%23120822' stroke-width='2' fill='none'/><rect x='20' y='20' width='40' height='20' stroke='%23120822' stroke-width='2' fill='none'/><rect x='60' y='20' width='40' height='20' stroke='%23120822' stroke-width='2' fill='none'/></svg>\")",
        backgroundSize: '80px 40px' }}/>
      <div className="em-grain" aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}/>
      {/* low light vignette */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 100%)' }}/>

      <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, zIndex: 5 }}>
        {/* Kelly Tier-2 audit (2026-05-02): unified district + subtitle to
            "Letter Workshop" — previous "Underpass" subtitle conflicted with
            the "Letter Workshop" district name, splitting the theme. */}
        <AmbientAudioPlayer shellSlug="anagram" />
        <Nameplate district="The Letter Workshop" subtitle="Anagram · Anagramy · arrange the letters" accent={accent}
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 18 L11 4 L18 18" stroke={accent} strokeWidth="1.6"/></svg>}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* TODO (EM-041 follow-up): SkipButton calls `next` which advances puzzleIdx,
              so the counter does move on Skip — but it conflates skipped with solved.
              Add `solvedCount` (incremented only when the player completes the anagram
              correctly), then pass current={solvedCount} seen={puzzleIdx} to <Progress>.
              — Builder 7, 2026-04-30 */}
          <Progress current={puzzleIdx + 1} total={puzzleDeck.length} accent={accent}/>
          <SkipButton onClick={next} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      {/* Goal slots */}
      <div style={{ position: 'absolute', top: '32%', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 8 }} role="region" aria-label="Spelling slots">
        {Array.from({ length: targetLen }).map((_, i) => {
          const tileId = slots[i];
          const tile = tileId !== undefined ? tiles.find(t => t.id === tileId) ?? null : null;
          return (
            <button key={i}
              type="button"
              tabIndex={tile ? 0 : -1}
              disabled={!tile}
              aria-label={tile ? `Slot ${i + 1}: ${tile.letter}. Press Enter to remove.` : `Slot ${i + 1}: empty.`}
              onClick={() => tile && removeAt(i)}
              onKeyDown={(e) => { if (tile && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); removeAt(i); } }}
              style={{
                // Kelly Tier-2 (2026-05-02): native <button> reset.
                font: 'inherit',
                margin: 0,
                padding: 0,
                WebkitAppearance: 'none',
                appearance: 'none',
                width: 56, height: 64,
                background: tile ? `${tile.color}22` : 'rgba(0,0,0,0.4)',
                border: `2px ${tile ? 'solid' : 'dashed'} ${tile ? tile.color : 'rgba(255,255,255,0.2)'}`,
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--em-decor)', fontSize: 32,
                color: tile ? tile.color : 'rgba(255,255,255,0.15)',
                textShadow: tile ? `0 0 16px ${tile.color}` : 'none',
                transform: `rotate(${(i % 2 === 0 ? -1 : 1) * 1}deg)`,
                cursor: tile ? 'pointer' : 'default',
                transition: 'all 220ms var(--em-ease)',
                animation: shake ? 'em-shake 0.4s var(--em-ease)' : 'none',
              }}>
              {tile ? tile.letter : '?'}
            </button>
          );
        })}
      </div>

      {/* Built status indicator */}
      <div style={{ position: 'absolute', top: 'calc(32% + 80px)', left: 0, right: 0, textAlign: 'center', fontFamily: 'var(--em-mono)', fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.18em' }}>
        {built.length}/{targetLen} · "{built || '...'}"
      </div>

      {/* Hint reveal — appears just below the slot row, fades in */}
      {hintReveal && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            top: 'calc(32% + 110px)',
            left: 0,
            right: 0,
            textAlign: 'center',
            animation: 'em-tip-fade 220ms var(--em-ease) both',
            zIndex: 5,
          }}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '8px 14px',
            background: 'rgba(190,242,100,0.12)',
            border: `1px solid ${accent}66`,
            borderRadius: 999,
            fontFamily: 'var(--em-mono)', fontSize: 11, color: 'var(--em-text)',
            letterSpacing: '0.12em',
          }}>
            <span className="em-eyebrow" style={{ color: accent }}>HINT</span>
            <span>Slot {hintReveal.slotIdx + 1} → <strong style={{ color: accent, fontFamily: 'var(--em-decor)', fontSize: 16 }}>{hintReveal.letter}</strong></span>
            <span className="em-hint-pl" style={{ marginLeft: 4 }}>🇵🇱 następna litera</span>
          </div>
        </div>
      )}

      {/* Tile pool */}
      <div style={{ position: 'absolute', bottom: 130, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', maxWidth: 600, margin: '0 auto', padding: '0 24px' }} role="region" aria-label="Letter tiles">
        {tiles.map(t => {
          const used = inSlots.has(t.id);
          return (
            <button key={t.id}
              type="button"
              onClick={() => placeTile(t.id)}
              disabled={used || slots.length >= targetLen}
              aria-label={`Letter ${t.letter}${used ? ', already placed' : ''}`}
              tabIndex={used ? -1 : 0}
              style={{
                width: 58, height: 68,
                background: used ? 'rgba(0,0,0,0.5)' : `linear-gradient(180deg, ${t.color}, ${t.color}99)`,
                color: used ? 'rgba(255,255,255,0.2)' : '#0E0A1A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--em-decor)', fontSize: 36,
                border: used ? `2px dashed ${t.color}55` : 'none',
                transform: `rotate(${t.rot}deg)`,
                boxShadow: used ? 'none' : `0 8px 20px ${t.color}66, inset 0 -4px 0 rgba(0,0,0,0.2)`,
                cursor: used ? 'default' : 'pointer',
                transition: 'all 220ms var(--em-ease)',
                opacity: used ? 0.4 : 1,
                padding: 0,
              }}>{t.letter}</button>
          );
        })}
      </div>

      {/* Clue spray-painted on the wall */}
      {(() => {
        // Kelly Tier-2 audit (2026-05-02): belt-and-suspenders answer-leak
        // guard. The PL-hint-leak filter agent is fixing the upstream lib/
        // generator, but this per-shell substitution catches anything that
        // slips through. If either the EN clue or the PL hint contains the
        // answer (case-insensitive substring), we substitute a generic clue.
        const word = puzzle.word.toLowerCase();
        const clueLeak = puzzle.clue.toLowerCase().includes(word);
        const clueLengthFallback = `Słowo o ${puzzle.word.length} literach.`;
        const safeClue = clueLeak
          ? `${puzzle.word.length}-letter word — arrange the tiles.`
          : puzzle.clue;
        const plHintLeak = puzzle.clue_pl.toLowerCase().includes(word);
        const safePlClue = plHintLeak
          ? clueLengthFallback
          : puzzle.clue_pl;
        return (
        <div style={{ position: 'absolute', bottom: 24, left: 24, right: 220 }}>
          <div style={{
            padding: '14px 18px',
            background: 'rgba(190,242,100,0.08)',
            border: `1px dashed ${accent}66`,
            borderRadius: 8,
            maxWidth: 500,
          }}>
            <div className="em-eyebrow" style={{ color: accent, marginBottom: 4 }}>The clue · podpowiedź</div>
            <div className="em-decor" style={{ fontSize: 20, color: 'var(--em-text)' }}>"{safeClue}"</div>
            <div className="em-hint-pl">🇵🇱 {safePlClue}</div>
          </div>
        </div>
        );
      })()}

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 24, right: 24, display: 'flex', gap: 8, alignItems: 'center', zIndex: 5 }}>
        <button className="em-btn" onClick={clear} aria-label="Clear letters">↻ Clear</button>
      </div>

      {/* Live region for assistive tech */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        {announcement}
      </div>

      {won && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse at center, ${accent}33, rgba(7,4,26,0.92))`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, backdropFilter: 'blur(2px)',
          animation: 'em-rise 0.5s var(--em-ease)', zIndex: 10,
        }} role="dialog" aria-modal="true" aria-label="Word complete">
          <Bajla size={84} mood="cheer" decorative/>
          <div className="em-decor" style={{ fontSize: 40, color: 'var(--em-text)', textShadow: `0 0 20px ${accent}` }}>"{puzzle.word}"</div>
          <div style={{ color: 'var(--em-text-muted)', fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.2em' }}>WALL DECODED · ŚCIANA ROZSZYFROWANA</div>
          <button ref={findAnotherBtnRef} className="em-btn em-btn-primary" onClick={next} style={{ marginTop: 8 }} aria-label="Find another wall">Find another wall →</button>
        </div>
      )}
    </div>
  );
};

export default AnagramShell;
