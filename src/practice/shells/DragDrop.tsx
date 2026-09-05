import { lazy as wordLazy, Suspense as WordSuspense } from 'react';
const WordScene3D = wordLazy(() => import('../shells3d/WordDragDrop3D'));
// Drag-drop — The Docks district.
// Drag cargo containers (words) into sentence drop zones.
// Wrong drops bounce back; correct drops latch in place.
//
// Real HTML5 drag-and-drop: source items declare draggable, set
// dataTransfer.setData('text/plain', word) on dragstart; drop zones call
// e.preventDefault() in onDragOver to enable drop, light up on dragenter, and
// read the data on drop. A touch fallback (useTouchDragDrop) and a
// click+Enter/Space keyboard fallback both converge on the same handleDrop().
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { WordMission, useWordArcade } from './word-arcade';
import { useShellProgress } from '../lib/convex-stubs';
import type { ShellDragDropPuzzle } from '../lib/adapters';

import React, { useEffect, useRef, useState } from 'react';
import { Bajla, HintButton, HintCard, Nameplate, Progress, SkipButton } from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 — expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';

// Sorting Station · Drag Drop — full bilingual instruction copy.
const DRAGDROP_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A sentence with one or more empty slots sits at the top — like a dock manifest with missing cargo.',
      'A pool of word tiles waits at the bottom — your cargo crates ready to load.',
      'Drag (or tap then tap) each tile into its correct slot to complete the manifest.',
      'A correct sentence lights Bajla green; wrong placements get a rose-dashed border.',
    ],
    pl: [
      'Zdanie z pustymi miejscami u góry — jak deklaracja portowa z brakującym ładunkiem.',
      'Pula klocków-słów czeka na dole — kontenery gotowe do załadunku.',
      'Przeciągnij (lub stuknij i stuknij) każdy klocek na właściwe miejsce, aby uzupełnić deklarację.',
      'Poprawne zdanie podświetla Bajlę na zielono; błędne ułożenia mają różowe przerywane obramowanie.',
    ],
  },
  controls: {
    en: [
      'Sentence slots: the labelled empty rectangles at the top.',
      'Tile pool: the row of draggable word tiles at the bottom.',
      'Tap-tile then tap-slot also works (touch-friendly alternative to drag).',
      'Tap a placed tile to remove it back to the pool.',
      'Skip / Hint buttons: 3 hints per session — each highlights one correct tile briefly.',
    ],
    pl: [
      'Miejsca w zdaniu: opisane puste prostokąty u góry.',
      'Pula klocków: rząd przeciąganych kafelków-słów na dole.',
      'Stuknięcie kafelka, a potem miejsca, też działa (dotykowa alternatywa do przeciągania).',
      'Stuknij umieszczony kafelek, aby usunąć go z powrotem do puli.',
      'Pomiń / Podpowiedź: 3 podpowiedzi na sesję — każda podświetla jeden właściwy klocek na chwilę.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right placement: tile snaps green into the slot and locks; Bajla cheers when the sentence completes.',
      'Wrong placement: tile gets a rose-dashed border — tap to remove and try the right slot.',
      'Skip: counts as wrong and loads the next manifest.',
      'You can keep rearranging until every slot is correct — wrong tries do not auto-fail.',
    ],
    pl: [
      'Właściwe ułożenie: klocek wskakuje na zielono i blokuje się; Bajla cieszy się, gdy zdanie się kończy.',
      'Błędne ułożenie: klocek dostaje różowe przerywane obramowanie — stuknij, aby usunąć i spróbować w innym miejscu.',
      'Pomiń: liczy się jako błąd i ładuje następną deklarację.',
      'Możesz przestawiać dalej, aż każde miejsce będzie poprawne — błędne próby nie kończą gry automatycznie.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Each hint highlights one correct tile-to-slot pair in green for ~2 seconds. Save them for word-order questions where Polish syntax pulls you the wrong way.',
    pl:
      'Masz 3 podpowiedzi na sesję. Każda podświetla jedną właściwą parę klocek-miejsce na zielono na ~2 sekundy. Zachowaj je na pytania o szyk wyrazów, gdzie polska składnia ciągnie w złą stronę.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each completed manifest raises your sorting streak. Finishing the deck unlocks the post-shell review screen with explanations for any wrong placements.',
    pl:
      'Pomiń liczy się jako błąd. Każda ukończona deklaracja zwiększa Twoją serię. Ukończenie talii odblokowuje ekran przeglądu z wyjaśnieniami błędów.',
  },
  l1Pattern: {
    en:
      'English word order is fixed (Subject-Verb-Object); Polish reorders freely with cases. This shell drills English\'s strict order — especially adjective placement and adverb position.',
    pl:
      'Angielski szyk wyrazów jest stały (podmiot-orzeczenie-dopełnienie); polski swobodnie przestawia dzięki przypadkom. Ten poziom trenuje sztywny angielski porządek — zwłaszcza pozycję przymiotnika i przysłówka.',
  },
};
import { dropZoneProps, useTouchDragDrop } from './useTouchDragDrop';

// ─────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────
type SentenceToken = string | { drop: number };

interface DragDropPuzzle {
  sentence: SentenceToken[];
  answers: string[];
  pool: string[];
  hint: string;
  hint_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  this file's DD_PUZZLES don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

const DD_PUZZLES: DragDropPuzzle[] = [
  {
    sentence: ['Yesterday', { drop: 0 }, 'walked', { drop: 1 }, 'the', { drop: 2 }, 'avenue.'],
    answers: ['I', 'down', 'old'],
    pool: ['old', 'quietly', 'down', 'I', 'through'],
    hint: 'Past tense narration. Subject + adverb + adjective.',
    hint_pl: 'Czas przeszły. Podmiot + przysłówek + przymiotnik.',
  },
  {
    sentence: ['She', { drop: 0 }, 'coffee', { drop: 1 }, 'the', { drop: 2 }, 'every', 'morning.'],
    answers: ['drinks', 'in', 'café'],
    pool: ['drink', 'drinks', 'on', 'in', 'café', 'street'],
    hint: 'Present simple. 3rd person + preposition + noun.',
    hint_pl: 'Czas teraźniejszy prosty. Trzecia osoba + przyimek + rzeczownik.',
  },
  {
    sentence: ['The', { drop: 0 }, 'bridge', { drop: 1 }, 'over', 'the', { drop: 2 }, '.'],
    answers: ['old', 'stretches', 'river'],
    pool: ['young', 'old', 'stretches', 'jumps', 'sky', 'river'],
    hint: 'Adjective + verb + place noun.',
    hint_pl: 'Przymiotnik + czasownik + nazwa miejsca.',
  },
];

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type ShellTime = 'day' | 'dusk' | 'night';
export type ShellState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;

export interface DragDropShellProps {
  time?: ShellTime;
  state?: ShellState;
  /**
   * When provided, the shell renders this scene deck instead of DD_PUZZLES.
   */
  puzzle?: ShellDragDropPuzzle;
  /** Layer-4 dynamic-scaffolding hook (Agent A12). Fires on each wrong drop. */
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3-DragDrop Wave-2 (Ricky 2026-05-02): fires once when every scene in the
   * deck has been seen (solved or skipped). The host uses this to mount
   * <PracticeReview>. Per-gap review payload:
   *   - questionId in wrongAttempts is `${sceneIdx}:${gapIdx}`
   *   - studentAnswer = the tile the student dropped
   *   - correctAnswer = the canonical tile for that gap
   *   - explanationPL falls back to the scene-level hint_pl when no per-gap
   *     explanation is plumbed (the demo deck doesn't carry per-gap rules).
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
    puzzle: ShellDragDropPuzzle;
    /** Scene indices the student skipped — surfaces as muted chips in review. */
    skippedSceneIndices: number[];
  }) => void;
}

type FilledMap = Record<number, string>;

const DRAG_MIME = 'text/plain';
const zoneIdFor = (gap: number): string => `dd-gap-${gap}`;
const parseZoneId = (id: string): number | null => {
  const m = /^dd-gap-(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
};

// ─────────────────────────────────────────────────────────────
// renderDragDropReviewItem — per-scene locked render for PracticeReview's
// `renderItem` callback. Reconstructs the sentence with each gap shown as a
// chip: green when the student's tile matched, rose with the canonical
// correct tile underneath when wrong, dim/dashed when the scene was skipped.
// ─────────────────────────────────────────────────────────────
const DD_REVIEW_ACCENT = '#7DD3FC';
const DD_REVIEW_RIGHT = '#34D399';
const DD_REVIEW_WRONG = '#FB7185';
export interface DragDropReviewScene {
  sceneIdx: number;
  scene: DragDropPuzzle;
  /** Per-gap: the tile the student dropped (when they finalised the scene). */
  studentByGap: Record<number, string | undefined>;
  isSkipped: boolean;
}
export function renderDragDropReviewItem(rec: DragDropReviewScene): React.ReactNode {
  const { scene, studentByGap, isSkipped } = rec;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: 'linear-gradient(180deg, rgba(125,211,252,0.05), rgba(20,16,42,0.55))',
      border: `1px solid ${isSkipped ? 'rgba(245,239,255,0.2)' : DD_REVIEW_ACCENT}33`,
      borderRadius: 8,
      lineHeight: 2, fontSize: 15, color: 'var(--em-text, #EDE6FF)',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {scene.sentence.map((part, i) => {
          if (typeof part === 'string') return <span key={i}>{part}</span>;
          const gapIdx = part.drop;
          const correct = scene.answers[gapIdx];
          const stu = studentByGap[gapIdx];
          if (isSkipped) {
            return (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 4,
                border: '1px dashed rgba(245,239,255,0.35)',
                background: 'rgba(245,239,255,0.04)',
                color: 'rgba(245,239,255,0.65)',
                fontFamily: 'var(--em-mono)', fontSize: 12, letterSpacing: '0.04em',
              }}>{correct}</span>
            );
          }
          const isRight = stu !== undefined && stu === correct;
          return (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 6,
              padding: '3px 10px', borderRadius: 4,
              background: isRight
                ? 'linear-gradient(180deg, #34D399, #15532A)'
                : 'linear-gradient(180deg, #FB7185, #9B1C2E)',
              color: '#FFF',
              fontFamily: 'var(--em-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
              boxShadow: isRight
                ? '0 0 0 1px #34D399, 0 0 8px rgba(52,211,153,0.4)'
                : '0 0 0 1px #FB7185',
            }}>
              {stu || '—'}
              {!isRight ? (
                <span style={{
                  fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.08em',
                  opacity: 0.92, color: '#FFF',
                }}>
                  → <strong>{correct}</strong>
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
      {isSkipped ? (
        <div style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.14em',
          color: 'rgba(245,239,255,0.55)',
        }}>— SKIPPED · POMINIĘTO</div>
      ) : null}
      {scene.hint_pl ? (
        <div style={{ fontSize: 12, color: 'rgba(245,239,255,0.6)', fontStyle: 'italic' }}>
          🇵🇱 {scene.hint_pl}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export const DragDropShell: React.FC<DragDropShellProps> = ({ time = 'dusk', state: forcedState = null, puzzle: puzzleProp, onWrongAnswer, onSessionComplete }) => {
  const arcade = useWordArcade();
  const accent = '#7DD3FC';
  // Kelly Tier-2 (2026-05-02): defensive props guard. When the host hands us
  // an explicitly-empty puzzle and we're not in a forced-state demo, flag it
  // for early-return BELOW so React's hook-call order stays consistent.
  const propsInvalid = !forcedState && puzzleProp !== undefined && (!puzzleProp.scenes || puzzleProp.scenes.length === 0);
  // Persisted progress (skipped when forcedState is set for design-canvas demos).
  const persisted = useShellProgress('dragdrop');
  // Use generator-driven scenes when supplied, otherwise the design-canvas
  // demo deck. We coerce to the same internal DragDropPuzzle shape.
  const activeDeck: DragDropPuzzle[] =
    puzzleProp && puzzleProp.scenes.length > 0 ? puzzleProp.scenes : DD_PUZZLES;
  const [puzzleIdx, setPuzzleIdx] = useState<number>(0);
  const [filled, setFilled] = useState<FilledMap>({});
  const awardedGaps = useRef(new Set<string>());

  const puzzle = activeDeck[puzzleIdx] ?? activeDeck[0];

  // Auto-save progress as gaps are filled.
  useEffect(() => {
    if (forcedState) return;
    const total = puzzle.answers.length;
    const correct = puzzle.answers.filter((a, i) => filled[i] === a).length;
    const progress = Math.min(1,(puzzleIdx + correct / Math.max(1,total)) / activeDeck.length);
    persisted.save({ progress, completed:progress===1, lastState:progress===1?'complete':'active' });
  }, [Object.keys(filled).length, puzzleIdx, forcedState]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'dragdrop',
      brief: 'Drag word tiles from the pool into the sentence slots.',
      brief_pl: 'Przeciągnij klocki-słowa z puli na miejsca w zdaniu.',
      detail: 'Word tiles wait at the bottom; gaps wait in the sentence above. Drag (or tap-and-place on touch) each tile into the slot it belongs in. Tap a placed tile to send it back to the pool. The sentence lights up when every slot is right.',
      detail_pl: 'Klocki ze słowami leżą u dołu; w zdaniu wyżej widać luki. Przeciągnij (lub na dotyku stuknij i postaw) każdy klocek na właściwe miejsce. Stuknij postawiony klocek, aby wrócił do puli. Zdanie zaświeci, gdy wszystkie luki będą dobrze.',
      fullInstructions: DRAGDROP_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverGap, setHoverGap] = useState<number | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const [bounce, setBounce] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');
  const [showHint, setShowHint] = useState<boolean>(false);
  const [hintsUsed, setHintsUsed] = useState<number>(0);

  // Layer-4 (EM-040): accumulate wrong drops during the session and fire
  // onWrongAnswer ONCE at end-of-shell (in the completion effect below) so
  // the InterferenceTip overlay reads as a summary, not a per-drop nag.
  type WrongAttempt = {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  };
  const [wrongAttempts, setWrongAttempts] = useState<WrongAttempt[]>([]);
  const [tipFired, setTipFired] = useState(false);

  // D3-DragDrop Wave-2 (2026-05-02): session-level accumulators. The shell
  // already runs the deck via puzzleIdx; we layer scene-level tracking on top.
  //   - scenesSeenRef        — count of scenes finalised (solved or skipped)
  //   - scenesSolvedRef      — count of scenes where every answer matched
  //   - sceneFinaliseRef     — guard so re-fills inside the same scene don't
  //                            double-count seen.
  //   - sessionWrongRef      — per-gap WrongAttempts across the whole deck
  //                            (uses `${sceneIdx}:${gapIdx}` as questionId)
  //   - sceneSnapshotsRef    — final filled-map per sceneIdx, so the review
  //                            screen can replay what the student typed.
  //   - skippedSceneIdxRef   — scene indices the player skipped without
  //                            completing.
  //   - sessionFiredRef      — fire onSessionComplete exactly once.
  const scenesSeenRef = useRef(0);
  const scenesSolvedRef = useRef(0);
  const sceneFinaliseRef = useRef(false);
  const sessionWrongRef = useRef<WrongAttempt[]>([]);
  const sceneSnapshotsRef = useRef<Record<number, FilledMap>>({});
  const skippedSceneIdxRef = useRef<number[]>([]);
  const sessionFiredRef = useRef(false);
  const [, setSessionRev] = useState(0);  // forces a re-render after session-complete

  const usedWords = new Set(Object.values(filled));
  const allCorrect = puzzle.answers.every((a, i) => filled[i] === a);
  // Session is over once every scene has been seen exactly once. We don't
  // cycle past the deck length when the host wires onSessionComplete — see
  // the `next` shim below.
  const sessionComplete = scenesSeenRef.current >= activeDeck.length;

  // Layer-4 (EM-040): when the puzzle completes, surface the first wrong
  // attempt accumulated during play so the InterferenceTip overlay renders
  // as an end-of-shell summary. Guarded by tipFired so we only fire once.
  useEffect(() => {
    if (forcedState) return;
    if (!allCorrect) return;
    if (tipFired) return;
    if (wrongAttempts.length === 0) return;
    if (!onWrongAnswer) return;
    onWrongAnswer(wrongAttempts[0]);
    setTipFired(true);
  }, [allCorrect, tipFired, wrongAttempts, onWrongAnswer, forcedState]);

  // D3-DragDrop Wave-2 (2026-05-02): on per-scene completion, record this
  // scene as SEEN + SOLVED + snapshot the filled map. Guarded by
  // sceneFinaliseRef so multiple re-renders inside the same scene don't
  // double-increment.
  useEffect(() => {
    if (forcedState) return;
    if (!allCorrect) return;
    if (sceneFinaliseRef.current) return;
    sceneFinaliseRef.current = true;
    if (!skippedSceneIdxRef.current.includes(puzzleIdx)) {
      scenesSeenRef.current = Math.min(scenesSeenRef.current + 1, activeDeck.length);
      scenesSolvedRef.current = Math.min(scenesSolvedRef.current + 1, activeDeck.length);
      sceneSnapshotsRef.current[puzzleIdx] = { ...filled };
      setSessionRev((r) => r + 1);
    }
  }, [allCorrect, puzzleIdx, activeDeck.length, forcedState, filled]);

  // D3-DragDrop Wave-2: fire onSessionComplete ONCE when every scene has been
  // seen. Distinct from the per-scene `allCorrect` flag the in-shell dialog uses.
  useEffect(() => {
    if (forcedState) return;
    if (!sessionComplete) return;
    if (sessionFiredRef.current) return;
    if (!onSessionComplete) return;
    sessionFiredRef.current = true;
    arcade.complete();
    onSessionComplete({
      correctCount: scenesSolvedRef.current,
      totalQuestions: activeDeck.length,
      wrongAttempts: [...sessionWrongRef.current],
      puzzle: { scenes: activeDeck },
      skippedSceneIndices: [...skippedSceneIdxRef.current],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionComplete, forcedState, onSessionComplete, activeDeck]);

  // D3-DragDrop Wave-2: with onSessionComplete wired, when a scene finishes
  // (allCorrect === true) we auto-advance to the next scene after a short
  // celebration window so the player isn't stuck on the in-shell completion
  // dialog (which is suppressed below). Skipped when the host doesn't want
  // review (in-shell dialog handles next).
  useEffect(() => {
    if (forcedState) return;
    if (!onSessionComplete) return;
    if (!allCorrect) return;
    if (sessionComplete) return;
    const t = window.setTimeout(() => { next(); }, 1100);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCorrect, sessionComplete, forcedState, onSessionComplete]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') { setFilled({}); setShake(null); setBounce(null); }
    if (forcedState === 'active') {
      setFilled({ 0: puzzle.answers[0] });
      setDragging(puzzle.answers[1]);
      setHoverGap(1);
    }
    if (forcedState === 'correct') {
      setFilled({ 0: puzzle.answers[0], 1: puzzle.answers[1] });
      setDragging(null); setHoverGap(null);
    }
    if (forcedState === 'wrong') {
      setFilled({ 0: puzzle.answers[0] });
      setShake(1);
      setBounce(puzzle.pool.find(w => !puzzle.answers.includes(w)) || puzzle.pool[0]);
    }
    if (forcedState === 'complete') {
      const all: FilledMap = {};
      puzzle.answers.forEach((a, i) => { all[i] = a; });
      setFilled(all);
      setDragging(null); setHoverGap(null); setShake(null); setBounce(null);
    }
  }, [forcedState, puzzleIdx, puzzle]);

  // Kelly Tier-2 (2026-05-02): focus-trap refs for the cargo-loaded completion
  // dialog. previouslyFocusedRef restores keyboard focus when the dialog
  // dismisses; reloadBtnRef is the primary action button we move focus to.
  const reloadBtnRef = useRef<HTMLButtonElement | null>(null);
  const nextBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const reset = (): void => {
    setFilled({}); setDragging(null); setAnnouncement(''); setShowHint(false);
    setWrongAttempts([]); setTipFired(false);
    sceneFinaliseRef.current = false;
  };
  // `next` advances the deck. With onSessionComplete wired, scene N's
  // skip/advance bumps scenesSeen so the session-complete effect can fire.
  // We DON'T modulo-cycle past activeDeck.length when in session mode — that
  // way the in-shell completion overlay (kept as fallback) doesn't fight the
  // <PracticeReview> overlay the host mounts on top.
  const next = (): void => {
    // If the player is finishing a scene that wasn't completed, count it as
    // a skip for review purposes.
    if (onSessionComplete && !sceneFinaliseRef.current && !skippedSceneIdxRef.current.includes(puzzleIdx)) {
      skippedSceneIdxRef.current.push(puzzleIdx);
      scenesSeenRef.current = Math.min(scenesSeenRef.current + 1, activeDeck.length);
      sceneSnapshotsRef.current[puzzleIdx] = { ...filled };
    }
    if (onSessionComplete) {
      // Linear advance — last scene's "next" leaves puzzleIdx == length so
      // the JSX's `cur` lookup defaults to activeDeck[0] but the overlay
      // suppresses rendering anyway because sessionFiredRef is true.
      setPuzzleIdx(i => Math.min(i + 1, activeDeck.length));
    } else {
      setPuzzleIdx(i => (i + 1) % activeDeck.length);
    }
    reset();
  };

  // Single source of truth for placing a word into a gap. Mouse-DnD,
  // touch-DnD and keyboard-fallback all funnel through here.
  const tryPlace = (gapIdx: number, word: string): void => {
    if (forcedState) return;
    if (filled[gapIdx] === word || allCorrect) return;
    const awardKey = `${puzzleIdx}:${gapIdx}`;
    if (puzzle.answers[gapIdx] !== word) arcade.answer(false);
    else if (!awardedGaps.current.has(awardKey)) { arcade.answer(true); awardedGaps.current.add(awardKey); }
    if (puzzle.answers[gapIdx] === word) {
      setFilled(f => ({ ...f, [gapIdx]: word }));
      setAnnouncement(`Correct. "${word}" placed.`);
    } else {
      setShake(gapIdx); setBounce(word);
      setAnnouncement(`Wrong. "${word}" does not fit here.`);
      setTimeout(() => { setShake(null); setBounce(null); }, 500);
      // Layer-4 (EM-040): instead of firing onWrongAnswer immediately on
      // each mis-drop (which interrupts iterative drag-and-build play),
      // accumulate the wrong attempt. We fire ONCE at end-of-shell (see
      // completion effect above) so the InterferenceTip overlay reads as
      // a summary, not a per-drop nag.
      setWrongAttempts((prev) => [
        ...prev,
        {
          questionId: `gap-${gapIdx}`,
          studentAnswer: word,
          correctAnswer: puzzle.answers[gapIdx],
          explanationPL: puzzle.hint_pl,
          exerciseId: puzzle.exerciseId,
        },
      ]);
      // D3-DragDrop Wave-2: also push a session-level WrongAttempt scoped to
      // the current scene + gap, so the review screen can paint the right gap
      // chip rose with the canonical correct tile underneath.
      if (onSessionComplete) {
        sessionWrongRef.current.push({
          questionId: `${puzzleIdx}:${gapIdx}`,
          studentAnswer: word,
          correctAnswer: puzzle.answers[gapIdx],
          explanationPL: puzzle.hint_pl,
          exerciseId: puzzle.exerciseId,
        });
      }
    }
    setDragging(null); setHoverGap(null);
  };

  const removeFromGap = (gapIdx: number): void => {
    setFilled(f => { const n = { ...f }; delete n[gapIdx]; return n; });
  };

  // Touch fallback — discovers drop zone via data-dnd-drop-id attribute.
  const getTouchHandlers = useTouchDragDrop({
    onDragStart: (sourceId) => setDragging(sourceId),
    onHoverChange: (zoneId) => {
      if (zoneId == null) { setHoverGap(null); return; }
      const gap = parseZoneId(zoneId);
      setHoverGap(gap);
    },
    onDrop: (zoneId, sourceId) => {
      const gap = parseZoneId(zoneId);
      if (gap != null) tryPlace(gap, sourceId);
    },
    onDragEnd: () => setDragging(null),
  });

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the cargo-loaded dialog.
  // Records the previously-focused element when the dialog opens, moves focus
  // to the primary "Next shipment →" button, traps Tab so focus cycles
  // between Reload ↔ Next, and restores focus on close. Mirrors Hangman's
  // pattern but with two focusable buttons.
  useEffect(() => {
    if (!allCorrect) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const focusId = window.setTimeout(() => { nextBtnRef.current?.focus(); }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusables = [reloadBtnRef.current, nextBtnRef.current].filter(Boolean) as HTMLButtonElement[];
        if (focusables.length === 0) return;
        const idx = focusables.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        if (e.shiftKey) {
          const next = idx <= 0 ? focusables[focusables.length - 1] : focusables[idx - 1];
          next.focus();
        } else {
          const next = idx === -1 || idx >= focusables.length - 1 ? focusables[0] : focusables[idx + 1];
          next.focus();
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        reset();
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
  }, [allCorrect]);

  // Keyboard fallback for dropping into a gap.
  const handleZoneKey = (gapIdx: number) => (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (forcedState) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (dragging) {
        tryPlace(gapIdx, dragging);
      } else if (filled[gapIdx]) {
        removeFromGap(gapIdx);
      }
    }
  };

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div className="em-shell em-shell-dragdrop" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>


      <div className="em-shell-header" style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 5 }}>
        {/* Ricky 2026-05-02: theme unification — drop "The Docks" split,
            canonicalize on Sorting Station with bilingual Option-C stack. */}
        <AmbientAudioPlayer shellSlug="dragdrop" />
        <Nameplate district="The Sorting Station" subtitle="Drag & Drop · Przeciągnij i upuść · sort the cargo into place" accent={accent}
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="9" width="6" height="6" stroke={accent} strokeWidth="1.6"/><rect x="13" y="9" width="6" height="6" stroke={accent} strokeWidth="1.6"/></svg>}/>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* TODO (EM-041 follow-up): track puzzles SOLVED separately from index.
              `puzzleIdx + 1` advances on Skip and on completion alike, so the
              counter today shows position-in-deck, not correctness. Add a
              `solvedCount` (incremented on full-correct submit), then pass
              current={solvedCount} seen={puzzleIdx} to <Progress>. — Builder 7, 2026-04-30 */}
          <Progress current={puzzleIdx + 1} total={activeDeck.length} accent={accent}/>
          <SkipButton onClick={next} />
          <HintButton onClick={() => { if (!showHint) setHintsUsed(h => h + 1); setShowHint(true); }} used={hintsUsed} total={3} />
        </div>
      </div>

      <div className="em-shell-body" style={{ position: 'absolute', inset: '108px 32px 28px', display: 'flex', flexDirection: 'column', gap: 14, zIndex: 4 }}>
        <WordMission kind="cargo" current={Object.keys(filled).length} total={puzzle.answers.length} chain={arcade.chain} reaction={arcade.reaction}/>
        <WordSuspense fallback={<p>Opening the 3D district…</p>}><WordScene3D key={puzzleIdx} pool={puzzle.pool} filled={filled} count={puzzle.answers.length} selected={dragging} onSelect={setDragging} onPlace={tryPlace} onRemove={removeFromGap}/></WordSuspense>
        {/* Ricky 2026-05-02 layout restructure:
            1. Sticky tense/grammar chip ABOVE the sentence (was floating bin label
               mid-canvas at "Present Perfect · czas Present Perfect")
            2. Sentence with inline integrated drop slots (large, central)
            3. Subtle dotted guide line linking sentence → tile pool
            4. Compact bilingual hint
            5. Tile pool: smaller tiles (60-72px tall, 14px text), no PORT-XXX
               cargo-invoice labels, divider between active and future-set tiles. */}

        {/* Sticky tense chip — surfaces the grammar focus instead of the
            floating mid-canvas "Present Perfect" bin label. We derive it from
            the puzzle hint when it begins with a tense name; otherwise we
            fall back to a generic "Sort the cargo" tag. */}
        {(() => {
          const tenseMatch = /(Present Perfect|Past Simple|Present Simple|Past Perfect|Future|Conditional|Modal)/i.exec(puzzle.hint);
          const label = tenseMatch ? tenseMatch[0].toUpperCase() : 'SORT THE CARGO';
          const labelPL = tenseMatch ? `czas ${tenseMatch[0]}` : 'posortuj ładunek';
          return (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 14px', borderRadius: 999,
                background: 'rgba(125,211,252,0.12)', border: `1px solid ${accent}55`,
                fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.18em',
                color: accent, textTransform: 'uppercase',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: accent, boxShadow: `0 0 10px ${accent}` }}/>
                {label} <span style={{ opacity: 0.55 }}>· {labelPL}</span>
              </span>
            </div>
          );
        })()}

        {/* Sentence with inline drop slots — slots ARE part of the sentence,
            not floating above. Larger central type, tighter line-height. */}
        <div style={{ fontSize: 28, fontFamily: 'var(--em-display)', color: 'var(--em-text)',
          display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', maxWidth: 820, margin: '4px auto 0', lineHeight: 1.45 }}>
          {puzzle.sentence.map((p, i) => {
            if (typeof p === 'string') return <span key={i}>{p}</span>;
            const gap = p.drop;
            const word = filled[gap];
            const isHover = hoverGap === gap && dragging !== null;
            const isShaking = shake === gap;
            return (
              <span key={i}
                role="region"
                aria-label={`Gap ${gap + 1}${word ? `, filled with ${word}. Press Enter to remove.` : ', empty. Drop a word here or press Enter after selecting one.'}`}
                tabIndex={0}
                {...dropZoneProps(zoneIdFor(gap))}
                onClick={() => {
                  if (forcedState) return;
                  if (dragging) tryPlace(gap, dragging);
                  else if (word) removeFromGap(gap);
                }}
                onKeyDown={handleZoneKey(gap)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDragEnter={() => setHoverGap(gap)}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  setHoverGap(prev => (prev === gap ? null : prev));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const data = e.dataTransfer.getData(DRAG_MIME) || dragging || '';
                  if (data) tryPlace(gap, data);
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 96, padding: '6px 14px',
                  border: `2px dashed ${word ? accent : isHover ? '#FBBF24' : 'rgba(255,255,255,0.35)'}`,
                  outline: isHover ? `2px solid ${accent}` : 'none',
                  outlineOffset: 2,
                  borderRadius: 8,
                  background: word ? `${accent}26` : isHover ? 'rgba(251,191,36,0.15)' : 'rgba(0,0,0,0.28)',
                  color: word ? 'var(--em-text)' : 'rgba(255,255,255,0.35)',
                  fontStyle: word ? 'normal' : 'italic',
                  fontSize: 22,
                  cursor: word || dragging ? 'pointer' : 'default',
                  transition: 'all 220ms var(--em-ease)',
                  animation: isShaking ? 'em-shake 0.4s var(--em-ease)' : 'none',
                  boxShadow: word ? `0 0 16px ${accent}55` : 'none',
                  verticalAlign: 'middle',
                }}>
                {word || '____'}
              </span>
            );
          })}
        </div>

        {/* Centered HintCard removed 2026-05-03 — the chat-widget speech
            bubble carries the per-shell brief. ExpandableInstructions stays
            as the in-app full-mechanic walkthrough. */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 560, width: '100%' }}>
          </div>
        </div>

        {/* Subtle dotted guide rail linking sentence → tile pool. Replaces
            the previous undifferentiated vertical void. Decorative only;
            pointer-events disabled so it never blocks clicks. */}
        <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', pointerEvents: 'none', marginTop: 2 }}>
          <svg width="120" height="22" viewBox="0 0 120 22" fill="none" style={{ opacity: 0.55 }}>
            <line x1="60" y1="2" x2="60" y2="14" stroke={accent} strokeWidth="1.4" strokeDasharray="2 4"/>
            <path d="M52 13 L60 20 L68 13" stroke={accent} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Tightened Q1/Q2 visual scoping (Ricky 2026-05-02):
            - eyebrow now reads sharper, includes hover hint
            - active set + future set will be visually divided (see render below)
            Active-question tiles: full opacity + magenta accent border.
            Future-question tiles: 25% opacity + greyscale filter. */}
        {(() => {
          const currentAnswers = new Set(puzzle.answers);
          const otherSceneOnly = new Set<string>();
          activeDeck.forEach((sc, sIdx) => {
            if (sIdx === puzzleIdx) return;
            sc.answers.forEach((a) => { if (!currentAnswers.has(a)) otherSceneOnly.add(a); });
          });
          const hasUpcoming = puzzle.pool.some((w) => otherSceneOnly.has(w));
          if (hasUpcoming && activeDeck.length > 1) {
            return (
              <div style={{ textAlign: 'center' }}>
                <span className="em-eyebrow" style={{ color: '#FBBF24', fontSize: 10, letterSpacing: '0.2em', padding: '4px 10px', background: 'rgba(251,191,36,0.10)', border: '1px dashed rgba(251,191,36,0.45)', borderRadius: 999 }}>
                  Q{puzzleIdx + 1} OF {activeDeck.length} · TILES IN FOCUS · POZOSTAŁE PRZYGASZONE
                </span>
              </div>
            );
          }
          return null;
        })()}

        {/* Crate dock — single horizontal row, smaller tiles, no cargo-invoice
            labels. Active-set tiles render first; a vertical divider then the
            future-set group. */}
        {(() => {
          const isFutureOnlyOf = (w: string): boolean =>
            !puzzle.answers.includes(w) && activeDeck.some((sc, sIdx) => sIdx !== puzzleIdx && sc.answers.includes(w));
          // Stable order: active-set tiles first (in original order), then
          // future-set tiles. Words that belong to the active set OR neither
          // group (pure distractors) render in the active group.
          const indexed = puzzle.pool.map((w, i) => ({ w, i, future: isFutureOnlyOf(w) }));
          const activeTiles = indexed.filter((t) => !t.future);
          const futureTiles = indexed.filter((t) => t.future);
          const renderTile = ({ w, i, future }: { w: string; i: number; future: boolean }) => {
            const used = usedWords.has(w);
            const isDrag = dragging === w;
            const isBounce = bounce === w;
            const touchHandlers = getTouchHandlers(w);
            const tooltipPL = future ? 'Q2 · zostaw na później' : '';
            const tooltipEN = future ? 'Q2 · save for later' : '';
            return (
              <button key={w + i}
                type="button"
                tabIndex={used ? -1 : 0}
                disabled={used || !!forcedState}
                aria-label={`Cargo word: ${w}${used ? ', already placed' : isDrag ? ', selected' : future ? ', save for later' : ''}`}
                aria-pressed={isDrag}
                title={future ? `${tooltipEN} · ${tooltipPL}` : undefined}
                draggable={!used && !forcedState}
                onDragStart={(e) => {
                  if (used || forcedState) { e.preventDefault(); return; }
                  e.dataTransfer.setData(DRAG_MIME, w);
                  e.dataTransfer.effectAllowed = 'move';
                  setDragging(w);
                }}
                onDragEnd={() => { setDragging(null); setHoverGap(null); }}
                onClick={() => {
                  if (used || forcedState) return;
                  setDragging(d => d === w ? null : w);
                }}
                onKeyDown={(e) => {
                  if (used || forcedState) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDragging(d => d === w ? null : w);
                  }
                }}
                {...(used || forcedState ? {} : touchHandlers)}
                style={{
                  font: 'inherit',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  // Smaller tiles per Ricky 2026-05-02 brief: 60-72px tall.
                  padding: '12px 18px',
                  minHeight: 60,
                  margin: 0,
                  background: used
                    ? 'linear-gradient(180deg, #2A1B45 0%, #1A1030 100%)'
                    : 'linear-gradient(180deg, #6E4F1A 0%, #3A2A12 100%)',
                  // Active-set tiles get a magenta accent border to read as
                  // "in focus"; future-set tiles keep the muted amber outline.
                  border: future
                    ? '2px solid rgba(251,191,36,0.45)'
                    : `2px solid ${used ? '#3A2855' : isDrag ? '#FBBF24' : 'var(--em-magenta, #E94B9C)'}`,
                  borderRadius: 4,
                  boxShadow: used
                    ? '0 2px 0 #1A0F08'
                    : future
                      ? '0 3px 0 #1A0F08, 0 6px 12px rgba(0,0,0,0.3)'
                      : '0 5px 0 #1A0F08, 0 10px 20px rgba(0,0,0,0.4), inset 0 0 0 2px rgba(0,0,0,0.4)',
                  fontFamily: 'var(--em-mono)', fontSize: 15, fontWeight: 700, letterSpacing: '0.06em',
                  color: used ? '#5B4F8C' : '#FBBF24',
                  textTransform: 'uppercase',
                  transform: `translateY(${isDrag ? -8 : 0}px) scale(${isDrag ? 1.05 : 1})`,
                  cursor: used ? 'default' : 'grab',
                  // Tightened scoping: future tiles 25% opacity (was 32%) +
                  // greyscale to read clearly as "not for this question".
                  opacity: isDrag ? 0.6 : (used ? 0.45 : future ? 0.25 : 1),
                  filter: future ? 'grayscale(100%)' : 'none',
                  transition: 'transform 220ms var(--em-ease), opacity 220ms, filter 220ms',
                  animation: isBounce ? 'em-shake 0.5s var(--em-ease)' : 'none',
                  userSelect: 'none',
                  touchAction: used ? 'auto' : 'none',
                  outline: isDrag ? '2px solid #FBBF24' : 'none',
                  outlineOffset: 4,
                }}>
                {w}
              </button>
            );
          };
          return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 4 }}
                 role="region" aria-label="Word pool — drag a crate to a gap">
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                {activeTiles.map(renderTile)}
              </div>
              {futureTiles.length > 0 && (
                <>
                  <div aria-hidden="true" style={{
                    width: 1, alignSelf: 'stretch', minHeight: 56,
                    background: 'linear-gradient(180deg, transparent, rgba(251,191,36,0.45), transparent)',
                    margin: '0 6px',
                  }}/>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {futureTiles.map(renderTile)}
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* Click-to-fill mode hint */}
      {dragging && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, 60px)', zIndex: 6, padding: '8px 14px', borderRadius: 999, background: 'rgba(251,191,36,0.95)', color: '#0E0A1A', fontFamily: 'var(--em-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', pointerEvents: 'none' }}>
          NOW TAP A GAP · STUKNIJ LUKĘ
        </div>
      )}

      {/* Live region for assistive tech */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        {announcement}
      </div>

      {allCorrect && !onSessionComplete && (
        // D3 Wave-2 (2026-05-02): when host wires onSessionComplete, the
        // <PracticeReview> overlay takes over completion — suppress the
        // in-shell dialog. Kept as fallback for design canvas + hosts that
        // don't want review.
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(125,211,252,0.18), rgba(14,10,26,0.9))',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, backdropFilter: 'blur(2px)',
          animation: 'em-rise 0.5s var(--em-ease)', zIndex: 10,
        }} role="dialog" aria-modal="true" aria-label="Cargo loaded — sentence complete">
          <Bajla size={84} mood="cheer" decorative/>
          <div className="em-decor" style={{ fontSize: 38, color: 'var(--em-text)' }}>Cargo loaded.</div>
          <div style={{ color: 'var(--em-text-muted)', fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.2em' }}>
            SHIP READY TO SAIL · STATEK GOTOWY DO REJSU
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button ref={reloadBtnRef} className="em-btn" onClick={reset} aria-label="Reload puzzle">↻ Reload</button>
            <button ref={nextBtnRef} className="em-btn em-btn-primary" onClick={next} aria-label="Next shipment">Next shipment →</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DragDropShell;
