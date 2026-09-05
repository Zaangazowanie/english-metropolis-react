import { ActionPlayfield3D } from './action-arcade-three';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { useActionCompletion } from './action-arcade-completion';
import { sonarCount } from './action-arcade-logic.mjs';
import { useArcadeEvents } from '../lib/arcade-events';
import { useActionTimers } from './action-arcade-timers';
import './action-arcade.css';
// Battleship — "The Harbour Grid" district.
//
// Harbour at night. The student calls out coordinates (B7, F4…) on a grid
// to "fire". Selecting a cell flips it open and reveals an MCQ. Answer
// correctly → it's a HIT (a ship's hull section flashes red). Wrong →
// MISS (a splash). Sink all 4 ships' worth of cells to clear the harbour.
//
// Each ship corresponds to a round; the round has N cells of "hull" the
// player must hit. Ship cells are pre-placed; non-ship cells are SEA and
// only render an empty fog-of-war reveal when fired upon.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import '../styles/shells/battleship.css';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Bajla,

  Progress,
  Nameplate,
  SkipButton,
  HintButton,
  Confetti,
  useEndOfShellTip,
  MCQOverlay,
} from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components';

// Harbour Grid · Battleship — full bilingual instruction copy.
const BATTLESHIP_INSTRUCTIONS: FullInstructions = {
  "whatYouDo": {
    "en": [
      "Search the harbour for ships. Solve a ship’s question to sink its entire hull."
    ],
    "pl": [
      "Szukaj okrętów w porcie. Rozwiąż pytanie, aby zatopić cały kadłub."
    ]
  },
  "controls": {
    "en": [
      "Tap a coordinate, or use arrows and Enter on the grid. Numbers in empty water show adjacent unhit hull squares, including diagonals."
    ],
    "pl": [
      "Stuknij współrzędne lub użyj strzałek i Enter na siatce. Liczby na wodzie pokazują sąsiednie nietrafione fragmenty kadłubów, także po skosie."
    ]
  },
  "rightWrongSkip": {
    "en": [
      "Correct answers sink the vessel. A wrong answer closes the question but leaves the ship available to retry. Empty-water sonar pings are not English mistakes."
    ],
    "pl": [
      "Dobra odpowiedź zatapia okręt. Zła zamyka pytanie, ale pozwala próbować ponownie. Pusta woda nie jest błędem językowym."
    ]
  },
  "hintMechanic": {
    "en": "Use the limited Hint button for help with the current clue.",
    "pl": "Użyj ograniczonej liczby podpowiedzi do aktualnej wskazówki."
  },
  "scoring": {
    "en": "150 arcade points per ship. Sink the whole fleet.",
    "pl": "150 punktów za okręt. Zatop całą flotę."
  },
  "l1Pattern": {
    "en": "Practise English meaning and sentence context before you make your move.",
    "pl": "Ćwicz angielskie znaczenie i kontekst zdania przed wykonaniem ruchu."
  }
};

export type ArcadeForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface ArcadeRound {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface ArcadePuzzle {
  rounds: ArcadeRound[];
}

export interface BattleshipShellProps {
  time?: TimeOfDay;
  state?: ArcadeForcedState;
  puzzle?: ArcadePuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /** D3-Battleship (Ricky wave-4, 2026-05-02): per-ship review payload. */
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
    puzzle: ArcadePuzzle;
    firedCount: number;
  }) => void;
}

const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'bs1', prompt: 'A long platform jutting into the water.',
      options: ['pier', 'stoop', 'plinth', 'gable'], answerIndex: 0,
      hint: 'Brighton has a famous one with arcades.', hint_pl: 'molo' },
    { id: 'bs2', prompt: 'A vehicle that carries cargo by sea.',
      options: ['freighter', 'wagon', 'glider', 'caravan'], answerIndex: 0,
      hint: 'Ships full of containers.', hint_pl: 'frachtowiec' },
    { id: 'bs3', prompt: 'A wall built to protect a harbour from waves.',
      options: ['breakwater', 'pavement', 'awning', 'gable'], answerIndex: 0,
      hint: 'A long stone wall sticking out from the shore.', hint_pl: 'falochron' },
    { id: 'bs4', prompt: 'A loud sound a ship makes in fog.',
      options: ['horn', 'whistle', 'chime', 'bell'], answerIndex: 0,
      hint: 'Long, low, mournful sound.', hint_pl: 'syrena, róg' },
  ],
};

const ACCENT = '#00cfff';
const COLS = 8;   // A-H
const ROWS = 8;   // 1-8

interface ShipCell {
  r: number;
  c: number;
  roundIdx: number;
  isHit: boolean;
}

interface FiredCell {
  r: number;
  c: number;
  result: 'hit' | 'miss';
}

// Pre-placed ships. Each round = 1 ship of N cells. Total cells = round.options.length
// is NOT the ship size — ship size is fixed (3 cells per round) so play feels balanced.
function buildShips(rounds: number): ShipCell[] {
  // Deterministic placement so the same puzzle always renders the same harbour.
  const rng = (seed: number) => {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  };
  const r = rng(0xBEEF);
  const ships: ShipCell[] = [];
  const used = new Set<string>();
  for (let i = 0; i < rounds; i++) {
    const len = 3;  // 3-cell ship per round
    let attempt = 0;
    while (attempt < 200) {
      const horizontal = r() > 0.5;
      const startR = Math.floor(r() * (horizontal ? ROWS : ROWS - len + 1));
      const startC = Math.floor(r() * (horizontal ? COLS - len + 1 : COLS));
      const cells: { r: number; c: number }[] = [];
      let ok = true;
      for (let k = 0; k < len; k++) {
        const cr = startR + (horizontal ? 0 : k);
        const cc = startC + (horizontal ? k : 0);
        if (used.has(`${cr},${cc}`)) { ok = false; break; }
        cells.push({ r: cr, c: cc });
      }
      if (ok) {
        cells.forEach(c => {
          used.add(`${c.r},${c.c}`);
          ships.push({ r: c.r, c: c.c, roundIdx: i, isHit: false });
        });
        break;
      }
      attempt++;
    }
  }
  return ships;
}

// ─────────────────────────────────────────────────────────────────────────
// renderBattleshipReviewItem — per-ship locked render for PracticeReview.
// Harbour-grid scoreboard: ship number + question + 4 cell-options with
// student's pick + correct option highlighted.
// ─────────────────────────────────────────────────────────────────────────
const BS_REVIEW_ACCENT = '#00cfff';
export function renderBattleshipReviewItem(
  round: ArcadeRound,
  shipNumber: number,
  studentAnswer: string | undefined,
): React.ReactNode {
  const correct = round.options[round.answerIndex];
  const stu = studentAnswer ?? '';
  const isWrong = stu.length > 0 && stu !== correct;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: isWrong
        ? 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(125,211,252,0.10), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(125,211,252,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${BS_REVIEW_ACCENT}22`, color: BS_REVIEW_ACCENT,
          border: `1px solid ${BS_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          SHIP {String(shipNumber).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(125,211,252,0.22)',
          color: isWrong ? '#ff3871' : '#00cfff',
        }}>
          {isWrong ? '✗ MISS · CHYBIONY' : '✓ SUNK · ZATOPIONY'}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--em-decor)', fontSize: 16, lineHeight: 1.3,
        color: 'var(--em-text, #EDE6FF)',
      }}>{round.prompt}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {round.options.map((opt, oi) => {
          const isCorrect = oi === round.answerIndex;
          const wasPicked = stu === opt;
          const showCorrect = isCorrect;
          const showWrong = wasPicked && !isCorrect;
          return (
            <div key={oi} style={{
              padding: '8px 12px', borderRadius: 6,
              background: showCorrect
                ? 'rgba(125,211,252,0.20)'
                : showWrong
                  ? 'rgba(251,113,133,0.18)'
                  : 'rgba(245,239,255,0.04)',
              border: `1px solid ${showCorrect ? '#00cfff88' : showWrong ? '#ff387188' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? '#00cfff' : showWrong ? '#ff3871' : 'var(--em-text, #EDE6FF)',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                fontFamily: 'var(--em-mono)', fontSize: 9,
                color: BS_REVIEW_ACCENT, opacity: 0.7, minWidth: 14,
              }}>{String.fromCharCode(65 + oi)}</span>
              <span style={{ flex: 1 }}>{opt}</span>
              {showCorrect && <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10 }}>✓ TAK</span>}
              {showWrong && <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10 }}>✗ NIE</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const BattleshipShell: React.FC<BattleshipShellProps> = ({
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  // Kelly Tier-2 (2026-05-02): defensive props guard.
  const propsInvalid = !forcedState && puzzle !== undefined && (!puzzle.rounds || puzzle.rounds.length === 0);
  const activePuzzle: ArcadePuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : DEMO_PUZZLE;
  const persisted = useShellProgress('battleship');
  const arcadeEvent = useArcadeEvents();
  const actionReducedMotion = usePrefersReducedMotion();
  const { later, cancel: cancelActionTimers } = useActionTimers();

  const initialShips = useMemo(() => buildShips(activePuzzle.rounds.length), [activePuzzle]);
  const [ships, setShips] = useState<ShipCell[]>(initialShips);
  const [fired, setFired] = useState<FiredCell[]>([]);
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintShipRound, setHintShipRound] = useState<number | null>(null);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  // Kelly Tier-2 (2026-05-02): keyboard navigation cursor on the harbour
  // grid. Defaults to A1 (top-left); arrow keys move it; Space/Enter fires.
  const [cursor, setCursor] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  // Kelly Tier-2 (2026-05-02): focus-trap refs for the completion overlay.
  const tryAnotherBtnRef = useRef<HTMLButtonElement | null>(null);
  const nextDistrictBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Group ships by round.
  const shipsByRound = useMemo(() => {
    const map: Record<number, ShipCell[]> = {};
    ships.forEach(s => { (map[s.roundIdx] ||= []).push(s); });
    return map;
  }, [ships]);

  const sunkRounds = activePuzzle.rounds.map((_, i) => {
    const s = shipsByRound[i] || [];
    return s.length > 0 && s.every(c => c.isHit);
  });
  const completed = sunkRounds.every(Boolean);
  useActionCompletion(completed, Boolean(forcedState), arcadeEvent);
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount: sunkRounds.filter(Boolean).length,
        totalQuestions: activePuzzle.rounds.length,
        wrongAttempts,
        puzzle: activePuzzle,
        firedCount: fired.length,
      });
    } : undefined,
  });
  const totalShips = activePuzzle.rounds.length;
  const sunkCount = sunkRounds.filter(Boolean).length;

  useEffect(() => {
    if (forcedState) return;
    persisted.save({ progress: sunkCount / totalShips, lastState: completed ? 'complete' : 'active' });
    if (completed) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [sunkCount, completed, forcedState]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'battleship',
      brief: BATTLESHIP_INSTRUCTIONS.whatYouDo.en[0],
      brief_pl: BATTLESHIP_INSTRUCTIONS.whatYouDo.pl[0],
      detail: BATTLESHIP_INSTRUCTIONS.controls.en.join(' ') + ' ' + BATTLESHIP_INSTRUCTIONS.rightWrongSkip.en.join(' '),
      detail_pl: BATTLESHIP_INSTRUCTIONS.controls.pl.join(' ') + ' ' + BATTLESHIP_INSTRUCTIONS.rightWrongSkip.pl.join(' '),
      fullInstructions: BATTLESHIP_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (forcedState === 'empty') { setShips(initialShips); setFired([]); }
    if (forcedState === 'correct') { setFeedback('correct'); }
    if (forcedState === 'wrong') { setFeedback('wrong'); }
    if (forcedState === 'complete') { setShips(initialShips.map(s => ({ ...s, isHit: true }))); }
  }, [forcedState, initialShips]);

  const cellShip = (r: number, c: number): ShipCell | null => ships.find(s => s.r === r && s.c === c) || null;
  const cellFired = (r: number, c: number): FiredCell | null => fired.find(f => f.r === r && f.c === c) || null;

  const fireAt = (r: number, c: number): void => {
    if (forcedState || completed) return;
    if (cellFired(r, c)) return;
    if (activeCell) return; // can't open another while one's open
    const ship = cellShip(r, c);
    if (!ship) {
      // Empty water — instant miss.
      setFired(prev => [...prev, { r, c, result: 'miss' }]);
      setFeedback('wrong');
      later(() => setFeedback(null), 600);
      return;
    }
    // Ship cell — open the question.
    setActiveCell({ r, c });
    setPickedIdx(null);
  };

  const pick = (oi: number): void => {
    if (forcedState || !activeCell || pickedIdx !== null) return;
    const round = activePuzzle.rounds[cellShip(activeCell.r, activeCell.c)!.roundIdx];
    setPickedIdx(oi);
    const correct = oi === round.answerIndex;
    if (correct) {
      // A solved question sinks its whole ship: no repeated question for every hull tile.
      const targetRound = cellShip(activeCell.r, activeCell.c)!.roundIdx;
      arcadeEvent({ type: 'correct', points: 150 });
      setShips(prev => prev.map(s => s.roundIdx === targetRound ? { ...s, isHit: true } : s));
      setFired(prev => [...prev.filter(f => !ships.some(s => s.roundIdx === targetRound && s.r === f.r && s.c === f.c)), ...ships.filter(s => s.roundIdx === targetRound).map(s => ({ r: s.r, c: s.c, result: 'hit' as const }))]);
      setFeedback('correct');
      later(() => {
        setActiveCell(null);
        setPickedIdx(null);
        setFeedback(null);
      }, 900);
    } else {
      setFeedback('wrong');
      arcadeEvent({ type: 'incorrect' });
      tip.recordWrong({
        questionId: round.id,
        studentAnswer: round.options[oi],
        correctAnswer: round.options[round.answerIndex],
        explanationPL: round.hint_pl,
        exerciseId: round.exerciseId,
      });
      // Mark the cell as missed (water splash) so we don't re-prompt the same cell,
      // and the player has to fire at another cell of the same ship.
      later(() => {
        // Keep the hull available: a wrong English answer must never make a ship impossible to sink.
        setActiveCell(null);
        setPickedIdx(null);
        setFeedback(null);
      }, 1200);
    }
  };

  const useHint = (): void => {
    if (hintsUsed >= 3) return;
    // Pick a not-yet-sunk round and reveal the column letter of one of its cells.
    const rIdx = sunkRounds.findIndex(s => !s);
    if (rIdx < 0) return;
    setHintShipRound(rIdx);
    setHintsUsed(h => h + 1);
    later(() => setHintShipRound(null), 3200);
  };

  const skipCell = (): void => {
    setActiveCell(null);
    setPickedIdx(null);
  };

  const reset = (): void => {
    cancelActionTimers();
    arcadeEvent({ type: 'reset' });
    setShips(initialShips);
    setFired([]);
    setActiveCell(null);
    setPickedIdx(null);
    setFeedback(null);
    setHintsUsed(0);
    setHintShipRound(null);
    tip.reset();
  };

  // Active question round.
  const activeRound = activeCell ? activePuzzle.rounds[cellShip(activeCell.r, activeCell.c)!.roundIdx] : null;

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the completion overlay.
  useEffect(() => {
    if (!completed || onSessionComplete) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const focusId = later(() => { nextDistrictBtnRef.current?.focus(); }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusables = [tryAnotherBtnRef.current, nextDistrictBtnRef.current].filter(Boolean) as HTMLButtonElement[];
        if (focusables.length === 0) return;
        const i = focusables.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        if (e.shiftKey) {
          const next2 = i <= 0 ? focusables[focusables.length - 1] : focusables[i - 1];
          next2.focus();
        } else {
          const next2 = i === -1 || i >= focusables.length - 1 ? focusables[0] : focusables[i + 1];
          next2.focus();
        }
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      window.clearTimeout(focusId);
      document.removeEventListener('keydown', trap);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [completed, onSessionComplete]);

  // Kelly Tier-2 (2026-05-02): keyboard navigation on the focused canvas.
  // Arrow keys move the cursor across the 8×8 grid; Space/Enter fires at
  // the cursor cell (equivalent to a tap). Only active while the canvas
  // wrapper has focus, so global keypresses (chat boxes etc.) are unaffected.
  const onCanvasKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).matches('.action-three-playfield')) return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (forcedState || completed) return;
    if (activeCell) return; // a question is open — don't move while answering
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => ({ r: Math.max(0, c.r - 1), c: c.c })); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => ({ r: Math.min(ROWS - 1, c.r + 1), c: c.c })); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setCursor(c => ({ r: c.r, c: Math.max(0, c.c - 1) })); }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); setCursor(c => ({ r: c.r, c: Math.min(COLS - 1, c.c + 1) })); }
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      fireAt(cursor.r, cursor.c);
    }
  };

  const liveStatus = completed
    ? 'The harbour clears. All ships sunk.'
    : feedback === 'correct'
      ? 'Hit.'
      : feedback === 'wrong'
        ? 'Miss.'
        : '';

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div
      className="em-shell em-shell-battleship"
      role="application"
      aria-label="Battleship practice, the Harbour Grid"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {/* Shell-scoped keyframes/responsive rules → src/practice/styles/shells/battleship.css */}

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{liveStatus}</div>

      <div className="em-bs-layout" style={{
        position: 'relative', display: 'grid',
        gridTemplateColumns: '1.4fr 1fr', gap: 24, padding: 32,
        height: '100%', boxSizing: 'border-box',
      }}>
        <div className="em-card" style={{
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, rgba(15,8,36,0.95) 0%, rgba(8,4,20,0.98) 100%)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--em-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <AmbientAudioPlayer shellSlug="battleship" />
            <Nameplate
              district="The Harbour Grid"
              subtitle="Battleship · Bitwa morska · call coordinates, sink ships with right answers"
              accent={ACCENT}
              icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 14 L19 14 L17 18 L5 18 Z" fill="none" stroke={ACCENT} strokeWidth="1.6" /><path d="M11 4 L11 14 M7 8 L15 8" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" /></svg>}
            />
            {/* Mini radar */}
            <div style={{ width: 36, height: 36, borderRadius: '50%', position: 'relative', background: 'rgba(125,211,252,0.08)', border: `1px solid ${ACCENT}55` }}>
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 1, height: '50%',
                background: `linear-gradient(180deg, ${ACCENT}, transparent)`,
                transformOrigin: 'top center',
                animation: 'em-bs-radar 4s linear infinite',
              }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px dashed ${ACCENT}33` }} />
            </div>
          </div>

          <div className="action-arcade-hud"><div><strong>SONAR HUNT · {sunkCount}/{totalShips}</strong><small>Search the harbour. A number in empty water counts nearby hull squares. Find a ship, then solve its question to sink the entire vessel.</small></div><span>{fired.filter(f => f.result === 'miss').length} sonar pings</span></div>
          {/* Kelly Tier-2 (2026-05-02): tabbable canvas wrapper. Keyboard
              users land focus here, then use arrow keys + Space/Enter as a
              "fire at coordinate" tap equivalent. The cursor cell renders
              with a magenta ring so it's visibly distinguishable from open
              + hinted cells. */}
          <div
            ref={canvasRef}
            className="em-bs-canvas"
            tabIndex={0}
            role="grid"
            aria-label={`Harbour grid, 8 columns A to H, 8 rows. Arrow keys move the cursor, Space or Enter fires. Cursor at ${String.fromCharCode(65 + cursor.c)}${cursor.r + 1}.`}
            onKeyDown={onCanvasKeyDown}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, position: 'relative' }}
          >
            <div className="action-bs-board" style={{ position: 'relative', width: '100%' }}>
              <ActionPlayfield3D kind="battleship" data={{player:cursor,lamps:hintShipRound===null?[]:ships.filter(s=>s.roundIdx===hintShipRound),reducedMotion:actionReducedMotion,onPick:id=>{const r=Math.floor(id/8),c=id%8;setCursor({r,c});fireAt(r,c);},actors:fired.map(f=>({id:f.r*8+f.c,x:f.c,y:f.r,state:f.result,value:sonarCount(ships,f.r,f.c)}))}} controls={<><button onClick={()=>canvasRef.current?.focus()}>Keyboard: arrows + Enter</button><button disabled={!!activeCell||completed} onClick={()=>fireAt(cursor.r,cursor.c)}>Ping {String.fromCharCode(65+cursor.c)}{cursor.r+1}</button>{hintShipRound!==null&&<span role="status">Search column {String.fromCharCode(65+(ships.find(s=>s.roundIdx===hintShipRound)?.c??0))}</span>}</>} />
              {/* Question modal — appears anchored above grid */}
              {activeCell && activeRound && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 'min(440px, 90%)',
                    background: 'linear-gradient(180deg, rgba(20,12,38,0.98) 0%, rgba(8,4,20,0.98) 100%)',
                    border: `1.5px solid ${ACCENT}88`,
                    borderRadius: 14, padding: 20,
                    boxShadow: `0 20px 48px rgba(0,0,0,0.7), 0 0 36px ${ACCENT}33`,
                    animation: 'em-bs-rise 320ms var(--em-ease)',
                    zIndex: 5,
                  }}
                >
                  <MCQOverlay
                    bare
                    accent={ACCENT}
                    prompt={activeRound.prompt}
                    options={activeRound.options}
                    answerIndex={activeRound.answerIndex}
                    pickedIndex={pickedIdx}
                    state={pickedIdx === null ? 'idle' : (feedback === 'correct' ? 'correct' : 'wrong')}
                    onAnswer={pick}
                    onClose={skipCell}
                    eyebrow={
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <div className="em-eyebrow" style={{ color: ACCENT }}>FIRING ON</div>
                        <div className="em-decor" style={{ fontSize: 22, color: ACCENT, letterSpacing: '0.1em' }}>
                          {String.fromCharCode(65 + activeCell.c)}{activeCell.r + 1}
                        </div>
                      </div>
                    }
                  />
                </div>
              )}
            </div>
          </div>

          {completed && !onSessionComplete && (
            <div
              role="dialog"
              aria-modal="true"
              aria-live="assertive"
              aria-label="Harbour Grid complete"
              style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
                backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 14,
                animation: 'em-rise 0.4s var(--em-ease)',
                zIndex: 6,
              }}
            >
              <Bajla size={84} mood="cheer" decorative />
              <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa`, textAlign: 'center', padding: '0 16px' }}>The harbour clears.</div>
              <div className="em-eyebrow">ALL SHIPS DOWN · WSZYSTKIE OKRĘTY ZATOPIONE</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button ref={tryAnotherBtnRef} type="button" className="em-btn em-btn-ghost" onClick={reset}>Restart run</button>
                <button ref={nextDistrictBtnRef} type="button" className="em-btn em-btn-primary" onClick={reset}>Play again →</button>
              </div>
            </div>
          )}
          <Confetti show={completed} />
        </div>

        <div className="em-bs-side" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Progress current={sunkCount} total={totalShips} accent={ACCENT} />
            <div style={{ display: 'flex', gap: 6 }}>
              <SkipButton onClick={skipCell} />
              <HintButton onClick={useHint} used={hintsUsed} total={3} />
            </div>
          </div>

          <div className="em-shell-hint" style={{ minWidth: 0 }}>
          </div>

          <div className="em-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--em-line)', display: 'flex', justifyContent: 'space-between' }}>
              <div className="em-eyebrow">Fleet status · stan floty</div>
              <div className="em-eyebrow" style={{ color: ACCENT }}>{sunkCount}/{totalShips}</div>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
              {activePuzzle.rounds.map((r, i) => {
                const sunk = sunkRounds[i];
                const cells = shipsByRound[i] || [];
                const hits = cells.filter(c => c.isHit).length;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: sunk ? 'rgba(251,113,133,0.08)' : 'rgba(125,211,252,0.04)',
                    border: `1px solid ${sunk ? '#ff387155' : `${ACCENT}33`}`,
                  }}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {Array.from({ length: 3 }).map((_, k) => (
                        <div key={k} style={{
                          width: 10, height: 10, borderRadius: 2,
                          background: k < hits ? '#ff3871' : ACCENT,
                          opacity: k < hits ? 1 : 0.3,
                        }} />
                      ))}
                    </div>
                    <div style={{
                      fontFamily: 'var(--em-body)', fontSize: 12, color: 'var(--em-text)', flex: 1,
                      opacity: sunk ? 0.7 : 1,
                    }}>{r.prompt.length > 32 ? r.prompt.slice(0, 31) + '…' : r.prompt}</div>
                    {sunk && <div style={{ color: '#ff3871', fontFamily: 'var(--em-mono)', fontSize: 10 }}>SUNK</div>}
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

export default BattleshipShell;
