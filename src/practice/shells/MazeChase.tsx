import { ActionPlayfield3D } from './action-arcade-three';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { useActionCompletion } from './action-arcade-completion';
import { nextMazeStep } from './action-arcade-logic.mjs';
import { useArcadeEvents } from '../lib/arcade-events';
import { useActionTimers } from './action-arcade-timers';
import './action-arcade.css';
// Maze Chase — "The Backstreets" district.
//
// Cobbled backstreets at night — pools of lamplight on the corners. The
// student moves a small lantern-bearer (a glowing dot) through a fixed
// maze, collecting answer tokens. Each round flashes a prompt; the
// player navigates to the token whose word matches the answer, avoiding
// wrong-answer tokens. Wrong tokens dim the lantern (incrementing miss
// count); the correct token completes the round.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import { maskAnswerInPrompt } from '../lib/exercise-adapters';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bajla,

  Progress,
  Nameplate,
  SkipButton,
  HintButton,
  Confetti,
  useEndOfShellTip,
} from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components';

// Backstreets · Maze Chase — full bilingual instruction copy.
const MAZECHASE_INSTRUCTIONS: FullInstructions = {
  "whatYouDo": {
    "en": [
      "Read the numbered word list and navigate to the token that answers the clue."
    ],
    "pl": [
      "Przeczytaj ponumerowane słowa i dotrzyj do żetonu pasującego do wskazówki."
    ]
  },
  "controls": {
    "en": [
      "Arrows, WASD or the pad move one square. The shadow follows every second step. A streetlamp freezes it for eight steps, so plan a safe route."
    ],
    "pl": [
      "Strzałki, WASD lub pad przesuwają o jedno pole. Cień rusza co drugi krok. Latarnia zatrzymuje go na osiem kroków — zaplanuj trasę."
    ]
  },
  "rightWrongSkip": {
    "en": [
      "Correct tokens clear the clue. Wrong words are logged for review. The shadow sends you back to the entrance without a language penalty. Skip switches to another unsolved clue."
    ],
    "pl": [
      "Dobry żeton zalicza wskazówkę. Błędne słowa trafiają do powtórki. Cień cofa do wejścia bez błędu językowego. Pomiń zmienia nierozwiązane pytanie."
    ]
  },
  "hintMechanic": {
    "en": "Use the limited Hint button for help with the current clue.",
    "pl": "Użyj ograniczonej liczby podpowiedzi do aktualnej wskazówki."
  },
  "scoring": {
    "en": "Shorter routes earn up to 200 arcade points; every solved route earns at least 100.",
    "pl": "Krótsze trasy dają do 200 punktów; każda rozwiązana trasa daje co najmniej 100."
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

// Right-panel HintCard answer-leak guard now lives in ../lib/safeHint
// (Ricky 2026-05-02, CD audit F5; consolidated 2026-05-03). Same contract:
// polish side is ALWAYS structural; english side keeps real multi-word
// definitions, falls back to structural when the EN clue is the PL gloss.

export interface MazeChaseShellProps {
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
  /** D3-MazeChase (Ricky wave-4, 2026-05-02): per-token chase review payload. */
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
  }) => void;
}

const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'mz1', prompt: 'A small narrow street with shops on both sides.',
      options: ['arcade', 'plaza', 'cellar', 'spire'], answerIndex: 0,
      hint: 'Often glass-roofed; Victorian shopping streets.', hint_pl: 'pasaż' },
    { id: 'mz2', prompt: 'Stones laid as paving on an old street.',
      options: ['cobbles', 'pebbles', 'planks', 'tiles'], answerIndex: 0,
      hint: 'Round, rough, hard to walk in heels.', hint_pl: 'kocie łby' },
    { id: 'mz3', prompt: 'A passage between two buildings.',
      options: ['alley', 'attic', 'plinth', 'gable'], answerIndex: 0,
      hint: 'Cats live there; bins are kept there.', hint_pl: 'zaułek' },
    { id: 'mz4', prompt: 'A pool of light from a streetlight.',
      options: ['glow', 'shadow', 'plinth', 'beacon'], answerIndex: 0,
      hint: 'The bright circle on the pavement at night.', hint_pl: 'blask' },
    { id: 'mz5', prompt: 'A wall painted with art.',
      options: ['mural', 'fresco', 'lintel', 'awning'], answerIndex: 0,
      hint: 'Big urban paintings; often political.', hint_pl: 'mural' },
  ],
};

const ACCENT = '#00cfff';
const COLS = 13;
const ROWS = 11;

// Maze layout — 1 = wall, 0 = path. Borders are walls.
// 13 wide x 11 tall. Designed to have multiple corridors and intersections.
const MAZE: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

type Cell = { r: number; c: number };
type Dir = 'up' | 'down' | 'left' | 'right';

interface Token {
  cell: Cell;
  optionIdx: number;
  word: string;
  isAnswer: boolean;
}

const isOpen = (r: number, c: number): boolean => r >= 0 && r < ROWS && c >= 0 && c < COLS && MAZE[r][c] === 0;

// ─────────────────────────────────────────────────────────────────────────
// renderMazeChaseReviewItem — per-round locked render for PracticeReview.
// Maze-chase scoreboard: round number + question + token options with
// student's catch + correct token highlighted.
// ─────────────────────────────────────────────────────────────────────────
const MZ_REVIEW_ACCENT = '#00cfff';
export function renderMazeChaseReviewItem(
  round: ArcadeRound,
  roundNumber: number,
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
          background: `${MZ_REVIEW_ACCENT}22`, color: MZ_REVIEW_ACCENT,
          border: `1px solid ${MZ_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          TOKEN {String(roundNumber).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(125,211,252,0.22)',
          color: isWrong ? '#ff3871' : '#00cfff',
        }}>
          {isWrong ? '✗ LOST · ZGUBIONE' : '✓ CAUGHT · ZŁAPANE'}
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

export const MazeChaseShell: React.FC<MazeChaseShellProps> = ({
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const activePuzzle: ArcadePuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : DEMO_PUZZLE;
  const persisted = useShellProgress('mazechase');
  const arcadeEvent = useArcadeEvents();
  const actionReducedMotion = usePrefersReducedMotion();
  const interactionRef = useRef<HTMLDivElement>(null);
  const { later, cancel: cancelActionTimers } = useActionTimers();

  const [roundIdx, setRoundIdx] = useState(0);
  const [solved, setSolved] = useState<boolean[]>(() => activePuzzle.rounds.map(() => false));
  const [pos, setPos] = useState<Cell>({ r: 1, c: 1 });
  const [tokens, setTokens] = useState<Token[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintActive, setHintActive] = useState(false);
  const [missCount, setMissCount] = useState(0);

  const moveRef = useRef<Cell>({ r: 1, c: 1 });
  const [shadow, setShadow] = useState<Cell>({ r: 9, c: 11 });
  const shadowRef = useRef<Cell>({ r: 9, c: 11 });
  const [steps, setSteps] = useState(0);
  const stepsRef = useRef(0);
  const [shield, setShield] = useState(0);
  const shieldRef = useRef(0);
  const [lamps, setLamps] = useState<Cell[]>([]);
  const roundLocked = useRef(false);

  const cur = activePuzzle.rounds[roundIdx];
  // Belt-and-suspenders gap-mask: if the prompt sentence literally contains
  // the answer-word (or a close morphological variant), substitute with `___`
  // before render. The adapter layer should already do this, but on the
  // word-tile shells (#19) we double-guard inside the shell so a leak here
  // can never reach the learner. See lib/exercise-adapters.ts → maskAnswerInPrompt.
  const safePrompt = cur ? maskAnswerInPrompt(cur.prompt, cur.options[cur.answerIndex]) : '';
  const completed = solved.every(Boolean);
  useActionCompletion(completed, Boolean(forcedState), arcadeEvent);
  const correctCount = solved.filter(Boolean).length;
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount,
        totalQuestions: activePuzzle.rounds.length,
        wrongAttempts,
        puzzle: activePuzzle,
      });
    } : undefined,
  });

  useEffect(() => {
    if (forcedState) return;
    const done = solved.filter(Boolean).length;
    persisted.save({ progress: done / activePuzzle.rounds.length, lastState: completed ? 'complete' : 'active' });
    if (completed) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [solved, completed, forcedState]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'mazechase',
      brief: MAZECHASE_INSTRUCTIONS.whatYouDo.en[0],
      brief_pl: MAZECHASE_INSTRUCTIONS.whatYouDo.pl[0],
      detail: MAZECHASE_INSTRUCTIONS.controls.en.join(' ') + ' ' + MAZECHASE_INSTRUCTIONS.rightWrongSkip.en.join(' '),
      detail_pl: MAZECHASE_INSTRUCTIONS.controls.pl.join(' ') + ' ' + MAZECHASE_INSTRUCTIONS.rightWrongSkip.pl.join(' '),
      fullInstructions: MAZECHASE_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  // Pre-pick scattered open cells across the maze for tokens.
  const openCells = useCallback(() => {
    const cells: Cell[] = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (MAZE[r][c] === 0) cells.push({ r, c });
    return cells;
  }, []);

  const setupRound = useCallback(() => {
    if (forcedState) return;
    if (!cur) return;
    setPos({ r: 1, c: 1 });
    moveRef.current = { r: 1, c: 1 };
     setSteps(0); stepsRef.current = 0; setShield(0); shieldRef.current = 0;
    shadowRef.current = { r: 9, c: 11 }; setShadow(shadowRef.current); roundLocked.current = false;
    setLamps([{ r: 5, c: 1 }, { r: 2, c: 7 }, { r: 8, c: 9 }]);
    const all = openCells();
    // Pick token cells that are far from start.
    const farFromStart = all.filter(c => Math.abs(c.r - 1) + Math.abs(c.c - 1) >= 4);
    // Ricky CD-fix (2026-05-03): seed shuffle from cur.id so token positions
    // are STABLE across re-renders. Previously Math.random() caused tokens
    // to reposition every render — CD audit reported "ALL tokens reposition
    // randomly on every move + 3 of 4 token labels stack at single point".
    let seed = (cur.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 2654435761) >>> 0;
    const detRand = (): number => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Shuffle farFromStart.
    for (let i = farFromStart.length - 1; i > 0; i--) {
      const j = Math.floor(detRand() * (i + 1));
      [farFromStart[i], farFromStart[j]] = [farFromStart[j], farFromStart[i]];
    }
    const placed: Token[] = cur.options.map((opt, oi) => ({
      cell: farFromStart[oi] ?? all[oi + 5] ?? { r: 5, c: 5 },
      optionIdx: oi,
      word: opt,
      isAnswer: oi === cur.answerIndex,
    }));
    setTokens(placed);
    setFeedback(null);
    setMissCount(0);
    // Ricky CD-fix (2026-05-03 hotfix): dep is cur?.id (stable string), NOT
    // cur (object). Parent re-renders can hand us a NEW puzzle.rounds[i]
    // object reference even when the round content is unchanged; depending
    // on the object ref made setupRound re-create every render, which made
    // the useEffect below re-fire setPos({1,1}) every render — visually
    // pinning the lantern-bearer to the start cell so arrow keys appeared
    // to do nothing. cur.id is the canonical round identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, openCells, forcedState]);

  useEffect(() => { setupRound(); }, [roundIdx, setupRound]);

  useEffect(() => {
    if (forcedState === 'empty') { setSolved(activePuzzle.rounds.map(() => false)); setTokens([]); }
    if (forcedState === 'correct') { setFeedback('correct'); }
    if (forcedState === 'wrong') { setFeedback('wrong'); }
    if (forcedState === 'complete') { setSolved(activePuzzle.rounds.map(() => true)); }
  }, [forcedState]);

  // Move + collect.
  const moveOne = useCallback((d: Dir) => {
    if (forcedState || completed || roundLocked.current) return;
    const cur2 = moveRef.current;
    const next: Cell = { r: cur2.r, c: cur2.c };
    if (d === 'up') next.r -= 1;
    if (d === 'down') next.r += 1;
    if (d === 'left') next.c -= 1;
    if (d === 'right') next.c += 1;
    if (!isOpen(next.r, next.c)) return;
    moveRef.current = next;
    setPos(next);

    stepsRef.current += 1; setSteps(stepsRef.current);
    const collectedLamp = lamps.some(p => p.r === next.r && p.c === next.c);
    if (collectedLamp) { shieldRef.current = 8; setLamps(prev => prev.filter(p => p.r !== next.r || p.c !== next.c)); }
    else shieldRef.current = Math.max(0, shieldRef.current - 1);
    setShield(shieldRef.current);
    const enemy = stepsRef.current % 2 === 0 && shieldRef.current === 0
      ? nextMazeStep(MAZE, shadowRef.current, next) : shadowRef.current;
    shadowRef.current = enemy; setShadow(enemy);
    if (enemy.r === next.r && enemy.c === next.c && shieldRef.current === 0) {
      setMissCount(n => n + 1); setFeedback('wrong'); moveRef.current = { r: 1, c: 1 }; setPos(moveRef.current);
      shadowRef.current = { r: 9, c: 11 }; setShadow(shadowRef.current);
      later(() => setFeedback(null), 800); return;
    }
    // Check token at next.
    const t = tokens.find(t => t.cell.r === next.r && t.cell.c === next.c);
    if (!t) return;
    if (t.isAnswer) {
      roundLocked.current = true; arcadeEvent({ type: 'correct', points: Math.max(100, 200 - stepsRef.current) });
      setFeedback('correct');
      setSolved(prev => prev.map((v, i) => i === roundIdx ? true : v));
      setTokens(prev => prev.filter(x => x !== t));
      later(() => {
        const nextRound = solved.findIndex((done, i) => !done && i !== roundIdx); if (nextRound >= 0) setRoundIdx(nextRound);
      }, 1100);
    } else {
      setFeedback('wrong');
      setMissCount(c => c + 1);
      arcadeEvent({ type: 'incorrect' });
      tip.recordWrong({
        questionId: cur.id,
        studentAnswer: t.word,
        correctAnswer: cur.options[cur.answerIndex],
        explanationPL: cur.hint_pl,
        exerciseId: cur.exerciseId,
      });
      setTokens(prev => prev.filter(x => x !== t));
      later(() => setFeedback(null), 700);
    }
    // Ricky CD-fix (2026-05-03 hotfix): dep is cur?.id (stable string), NOT
    // cur (object). When cur's object identity churned across parent
    // re-renders, moveOne kept getting a new reference, the keyboard-listener
    // useEffect kept tearing down + re-attaching, and any in-flight key event
    // could be processed against a stale closure. Stabilising on cur.id keeps
    // the listener attached and the closure reads the latest tokens/cur from
    // the render scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, lamps, roundIdx, cur?.id, activePuzzle.rounds.length, completed, forcedState]);

  // Keyboard.
  useEffect(() => {
    if (forcedState) return;
    const handler = (e: KeyboardEvent) => {
      if (!interactionRef.current?.contains(e.target as Node)) return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const map: Record<string, Dir | undefined> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
        W: 'up', S: 'down', A: 'left', D: 'right',
      };
      if ((e.target as HTMLElement).isContentEditable || (e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')) return;
      const next = map[e.key];
      if (next) { e.preventDefault(); moveOne(next); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [moveOne, forcedState]);

  const useHint = (): void => {
    if (hintsUsed >= 3) return;
    setHintActive(true);
    setHintsUsed(h => h + 1);
    later(() => setHintActive(false), 3000);
  };

  const reset = (): void => {
    cancelActionTimers();
    arcadeEvent({ type: 'reset' });
    roundLocked.current = false; setupRound();
    setRoundIdx(0);
    setSolved(activePuzzle.rounds.map(() => false));
    setFeedback(null);
    setHintsUsed(0);
    setMissCount(0);
    tip.reset();

  };

  const CELL = 38;
  const W = COLS * CELL;

  const liveStatus = completed
    ? 'You found the way out. Backstreets complete.'
    : feedback === 'correct'
      ? 'Correct token collected.'
      : feedback === 'wrong'
        ? 'Wrong token. The lantern dims.'
        : '';

  return (
    <div
      className="em-shell em-shell-mazechase"
      ref={interactionRef}
      tabIndex={0}
      onPointerDown={event => { if (!(event.target as HTMLElement).closest('button,a,input,textarea,select')) interactionRef.current?.focus({ preventScroll: true }); }}
      role="application"
      aria-label="Maze chase practice, the Backstreets"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <style>{`
@keyframes em-mz-rise {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          .em-mz-side { display: none !important; }
          .em-mz-layout { grid-template-columns: 1fr !important; padding: 16px !important; }
          .em-mz-dpad { display: grid !important; }
        }
        .em-mz-dpad { display: none; }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{liveStatus}</div>

      <div className="em-mz-layout" style={{
        position: 'relative', display: 'grid',
        gridTemplateColumns: '1.5fr 1fr', gap: 24, padding: 32,
        height: '100%', boxSizing: 'border-box',
      }}>
        <div className="em-card" style={{
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, rgba(27,15,54,0.85) 0%, rgba(10,5,24,0.95) 100%)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--em-line)' }}>
            <AmbientAudioPlayer shellSlug="mazechase" />
            <Nameplate
              district="The Backstreets"
              subtitle="Maze Chase · Pościg w labiryncie · race through the alleys"
              accent={ACCENT}
              icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="3" width="16" height="16" stroke={ACCENT} strokeWidth="1.6" fill="none" /><path d="M3 11 H8 V7 H14 V15 H19 M11 3 V19" stroke={ACCENT} strokeWidth="1.6" fill="none" /></svg>}
            />
          </div>

          {/* Prompt bar */}
          <div style={{
            margin: '14px 24px 0',
            padding: '12px 18px',
            background: 'linear-gradient(90deg, rgba(125,211,252,0.16), rgba(125,211,252,0.02))',
            border: `1px solid ${ACCENT}55`,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 14,
            animation: 'em-mz-rise 320ms var(--em-ease)',
          }} key={`p-${roundIdx}`}>
            <div style={{
              fontFamily: 'var(--em-mono)', fontSize: 11, color: ACCENT, letterSpacing: '0.18em',
              padding: '4px 8px', border: `1px solid ${ACCENT}66`, borderRadius: 4, flexShrink: 0,
            }}>RND {String(roundIdx + 1).padStart(2, '0')}</div>
            <div className="em-decor" style={{ fontSize: 18, color: 'var(--em-text)', flex: 1, lineHeight: 1.3 }}>{safePrompt}</div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'flex-start', padding: 16, position: 'relative', minWidth: 0 }}>
            <div style={{ width: '100%', maxWidth: W, minHeight: 340, position: 'relative' }}>
              <ActionPlayfield3D kind="mazechase" data={{grid:{rows:ROWS,cols:COLS,walls:MAZE},player:pos,shadow,lamps,shield,reducedMotion:actionReducedMotion,onMove:moveOne,actors:tokens.map(t=>({id:t.optionIdx,x:t.cell.c,y:t.cell.r,label:t.word,selected:hintActive&&t.isAnswer}))}} />

            </div>
            <div className="action-arcade-option-list" aria-label="Token words">{cur.options.map((word, i) => <span key={i} style={{ opacity: tokens.some(t => t.optionIdx === i) ? 1 : .45 }}><b>{i + 1}</b>{word}</span>)}</div>
            <div className="action-arcade-hud"><div><strong>{shield ? `LANTERN SHIELD · ${shield}` : `SHADOW CHASE · ${steps} steps`}</strong><small>The shadow moves once for every two steps you take. Collect a streetlamp to freeze it for 8 steps. Read the numbered words, then plan your route.</small></div><span>{missCount} setbacks</span></div>
            {/* DPad on touch */}
            <div className="em-mz-dpad" style={{
              position: 'absolute', bottom: 16, right: 16,
              gridTemplateColumns: 'repeat(3, 48px)',
              gridTemplateRows: 'repeat(3, 48px)',
              gap: 4,
            }}>
              <div />
              <button onClick={() => moveOne('up')} aria-label="Up" style={mzDpadStyle}>↑</button>
              <div />
              <button onClick={() => moveOne('left')} aria-label="Left" style={mzDpadStyle}>←</button>
              <div />
              <button onClick={() => moveOne('right')} aria-label="Right" style={mzDpadStyle}>→</button>
              <div />
              <button onClick={() => moveOne('down')} aria-label="Down" style={mzDpadStyle}>↓</button>
              <div />
            </div>

            {missCount > 0 && (
              <div style={{
                position: 'absolute', top: 8, left: 24,
                fontFamily: 'var(--em-mono)', fontSize: 10, color: '#ff3871',
                letterSpacing: '0.16em',
                padding: '4px 8px',
                background: 'rgba(251,113,133,0.1)',
                border: '1px solid #ff387155',
                borderRadius: 4,
              }}>{missCount} WRONG TURN{missCount === 1 ? '' : 'S'}</div>
            )}
          </div>

          {completed && !onSessionComplete && (
            <div
              role="dialog"
              aria-live="assertive"
              aria-label="Backstreets complete"
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
              <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa`, textAlign: 'center', padding: '0 16px' }}>You found the way out.</div>
              <div className="em-eyebrow">BACKSTREETS MAPPED · ZAUŁKI POZNANE</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="em-btn em-btn-ghost" onClick={reset}>Restart run</button>
                <button className="em-btn em-btn-primary" onClick={reset}>Play again →</button>
              </div>
            </div>
          )}
          <Confetti show={completed} />
        </div>

        <div className="em-mz-side" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Progress current={solved.filter(Boolean).length} total={activePuzzle.rounds.length} accent={ACCENT} />
            <div style={{ display: 'flex', gap: 6 }}>
              <SkipButton onClick={() => { if (roundLocked.current) return; const next = solved.findIndex((done, i) => !done && i !== roundIdx); if (next >= 0) setRoundIdx(next); }} />
              <HintButton onClick={useHint} used={hintsUsed} total={3} />
            </div>
          </div>

          <div className="em-shell-hint" style={{ minWidth: 0 }}>
          </div>

          <div className="em-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--em-line)', display: 'flex', justifyContent: 'space-between' }}>
              <div className="em-eyebrow">Lantern log · księga światła</div>
              <div className="em-eyebrow" style={{ color: ACCENT }}>{solved.filter(Boolean).length}/{activePuzzle.rounds.length}</div>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
              {activePuzzle.rounds.map((r, i) => {
                const isDone = solved[i];
                const isCurrent = i === roundIdx;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: isDone ? 'rgba(125,211,252,0.08)' : isCurrent ? `${ACCENT}11` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isDone ? `${ACCENT}55` : isCurrent ? `${ACCENT}66` : 'var(--em-line)'}`,
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: isDone ? ACCENT : 'var(--em-text-dim)' }} />
                    <div style={{
                      fontFamily: 'var(--em-body)', fontSize: 12, color: 'var(--em-text)', flex: 1,
                      opacity: isDone ? 0.7 : 1,
                    }}>{r.prompt}</div>
                    {isDone && <div style={{ color: ACCENT, fontFamily: 'var(--em-mono)', fontSize: 10 }}>FOUND</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            fontFamily: 'var(--em-mono)', fontSize: 10,
            color: 'var(--em-text-muted)',
            letterSpacing: '0.1em',
            display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          }}>
            <span>↑ ↓ ← → OR W A S D</span>
            <span style={{ opacity: 0.5 }}>·</span>
            {/* Color-blind safety: pair each colour with a glyph (#22 a11y). */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span aria-hidden="true" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: '50%',
                background: ACCENT, color: '#0E0A1A',
                fontSize: 10, fontWeight: 900, lineHeight: 1,
              }}>✓</span>
              <span style={{ color: ACCENT }}>NUMBER = WORD</span>
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span aria-hidden="true" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: '50%',
                background: '#ff3871', color: '#0E0A1A',
                fontSize: 10, fontWeight: 900, lineHeight: 1,
              }}>✗</span>
              <span style={{ color: '#ff3871' }}>PINK = SHADOW</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const mzDpadStyle: React.CSSProperties = {
  minWidth: 48, minHeight: 48,
  background: 'rgba(125,211,252,0.18)',
  border: `1px solid ${ACCENT}66`,
  borderRadius: 8,
  color: ACCENT,
  fontFamily: 'var(--em-mono)', fontSize: 18,
  cursor: 'pointer',
  touchAction: 'manipulation',
};

export default MazeChaseShell;
