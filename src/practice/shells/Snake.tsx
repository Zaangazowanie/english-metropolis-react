import { useActionCompletion } from './action-arcade-completion';
import { snakeStep } from './action-arcade-logic.mjs';
import { useArcadeEvents } from '../lib/arcade-events';
import { useActionTimers } from './action-arcade-timers';
import './action-arcade.css';
// Snake — "The Park Path" district.
//
// A dusk park scene: cobblestone path, hedges, lampposts, drifting leaves.
// The student steers a segmented green snake (arrow keys / WASD / on-screen
// DPad) along the path, where illustrated picnic-item pellets (apple, acorn,
// berry, leaf) carry the answer options as floating nameplates beside them.
// Eat the correct-answer pellet to score and grow; eating a wrong-answer
// pellet shrinks the tail and increments the miss counter.
//
// Wave B revamp (Ricky CC-2, 2026-05-02) — addresses CD audit §5 Snake +
// cross-cutting #18 + #20:
//   1. Snake body — segmented chain (head + linked body + tapered tail) with
//      slithering wave per segment, head→tail green gradient. Was 3 floating
//      circles.
//   2. Pellet nameplates — illustrated picnic items inside the grid + dark
//      pill nameplates rendered OUTSIDE the cell with a dotted connector.
//      Stops the BOTH-ENDS truncation Mike flagged.
//   3. Park theme execution — cobblestone path, grass tufts, lamp posts with
//      yellow glow, drifting leaves animation, dusk gradient.
//   4. SCORE / LENGTH / TARGET HUD top-left of grid.
//   5. Halo on the correct pellet (subtle pulsing yellow ring) so the student
//      knows what to chase even with several nameplates around.
//   6. Per-shell answer-leak guard: if the rendered prompt contains the
//      answer word (case-insensitive whole-word), substitute with `___`.
//   7. Subtitle: "The Park Path · Snake · Wąż · grow your tail with the right
//      words" (canonical district name, Option-C 3-line stack).
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { buildSafeHint } from '../lib/safeHint';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Bajla,
  HintCard,
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

// Park Path · Snake — full bilingual instruction copy.
const SNAKE_INSTRUCTIONS: FullInstructions = {
  "whatYouDo": {
    "en": [
      "Read the clue, choose the matching word and guide your snake to its fruit. The trail grows across rounds."
    ],
    "pl": [
      "Przeczytaj wskazówkę i doprowadź węża do owocu z właściwym słowem. Wąż rośnie między rundami."
    ]
  },
  "controls": {
    "en": [
      "Use arrows, WASD or the pad. Press Resume to move and Space to pause. Cruise is slower; Sprint rewards faster play. Edges wrap."
    ],
    "pl": [
      "Używaj strzałek, WASD lub pada. Resume uruchamia ruch, spacja go wstrzymuje. Cruise jest wolniejszy; Sprint daje więcej punktów. Krawędzie łączą się."
    ]
  },
  "rightWrongSkip": {
    "en": [
      "Correct fruit grows your tail. Wrong words shrink it. Crossing your tail resets your position, without recording a language mistake. Skip revisits another unsolved clue."
    ],
    "pl": [
      "Dobry owoc wydłuża ogon. Złe słowo go skraca. Wejście na ogon cofa pozycję bez błędu językowego. Pomiń przenosi do innej nierozwiązanej wskazówki."
    ]
  },
  "hintMechanic": {
    "en": "Use the limited Hint button for help with the current clue.",
    "pl": "Użyj ograniczonej liczby podpowiedzi do aktualnej wskazówki."
  },
  "scoring": {
    "en": "100 arcade points in Cruise, 140 in Sprint. Finish every clue.",
    "pl": "100 punktów w Cruise, 140 w Sprint. Rozwiąż każdą wskazówkę."
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

export interface SnakeShellProps {
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
  /** D3-Snake (Ricky wave-4, 2026-05-02): per-pellet eaten review payload. */
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
    finalLength: number;
  }) => void;
}

const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 's1', prompt: 'Wide leafy walking street.',
      options: ['avenue', 'cellar', 'gutter', 'spire'], answerIndex: 0,
      hint: 'Tree-lined and wide.', hint_pl: 'aleja' },
    { id: 's2', prompt: 'Tall street light beside the path.',
      options: ['lamppost', 'lantern', 'beacon', 'plinth'], answerIndex: 0,
      hint: 'Cast iron, single bulb at top, Victorian streets.', hint_pl: 'latarnia' },
    { id: 's3', prompt: 'Trimmed wall of bushes.',
      options: ['hedge', 'fence', 'plinth', 'gable'], answerIndex: 0,
      hint: 'Living green wall in a garden.', hint_pl: 'żywopłot' },
    { id: 's4', prompt: 'A long wooden seat in a park.',
      options: ['stool', 'bench', 'pew', 'crate'], answerIndex: 1,
      hint: 'For sitting and feeding pigeons.', hint_pl: 'ławka' },
    { id: 's5', prompt: 'Stone steps going up a slope.',
      options: ['terrace', 'stairway', 'cellar', 'grille'], answerIndex: 1,
      hint: 'A flight of steps.', hint_pl: 'schody' },
  ],
};

const ACCENT = '#22C55E';
const ACCENT_TAIL = '#15803D';
const HALO = '#FBBF24';
const COLS = 16;
const ROWS = 12;
const TICK_MS = 180;

type Cell = { r: number; c: number };
type Dir = 'up' | 'down' | 'left' | 'right';

interface Pellet {
  cell: Cell;
  optionIdx: number;
  word: string;
  isAnswer: boolean;
  sprite: 'apple' | 'acorn' | 'berry' | 'leaf';
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-shell answer-leak guard (Ricky CC-2, 2026-05-02 — Snake revamp).
// Belt-and-suspenders companion to A3's adapter-layer maskAnswerInPrompt.
// If the rendered prompt contains the canonical answer word (case-insensitive
// whole-word), substitute with `___` so the student can't read the answer
// off the prompt while picking a pellet. Tracks #19 cross-cutting fix.
// ─────────────────────────────────────────────────────────────────────────────
function maskAnswerInPrompt(prompt: string | undefined, answer: string | undefined): string {
  if (!prompt) return '';
  if (!answer) return prompt;
  const ans = answer.toLowerCase().trim();
  if (!ans) return prompt;
  const safeAns = ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Whole-word, case-insensitive, global.
  const re = new RegExp(`\\b${safeAns}\\b`, 'gi');
  return prompt.replace(re, '___');
}

// Sprite sheet — small SVG illustrated picnic items rendered inside a cell.
// Each is positioned at (cx, cy), drawn at radius ~CELL*0.36.
function renderSprite(kind: Pellet['sprite'], cx: number, cy: number, size: number): React.ReactElement {
  const s = size;
  switch (kind) {
    case 'apple':
      return (
        <g transform={`translate(${cx}, ${cy})`}>
          <ellipse cx="0" cy="1" rx={s * 0.55} ry={s * 0.6} fill="#EF4444" />
          <ellipse cx={-s * 0.2} cy={-s * 0.15} rx={s * 0.18} ry={s * 0.1} fill="#FCA5A5" opacity="0.7" />
          <path d={`M 0 ${-s * 0.55} Q ${s * 0.2} ${-s * 0.85} ${s * 0.35} ${-s * 0.55}`} stroke="#16A34A" strokeWidth="1.4" fill="none" />
          <rect x={-1} y={-s * 0.7} width="2" height={s * 0.2} fill="#7C2D12" />
        </g>
      );
    case 'acorn':
      return (
        <g transform={`translate(${cx}, ${cy})`}>
          <ellipse cx="0" cy={s * 0.15} rx={s * 0.45} ry={s * 0.5} fill="#D97706" />
          <path d={`M ${-s * 0.5} ${-s * 0.05} Q 0 ${-s * 0.55} ${s * 0.5} ${-s * 0.05} L ${s * 0.5} ${s * 0.1} L ${-s * 0.5} ${s * 0.1} Z`} fill="#7C2D12" />
          <circle cx={-s * 0.2} cy={s * 0.2} r={s * 0.1} fill="#FBBF24" opacity="0.5" />
          <rect x={-1} y={-s * 0.7} width="2" height={s * 0.2} fill="#7C2D12" />
        </g>
      );
    case 'berry':
      return (
        <g transform={`translate(${cx}, ${cy})`}>
          <circle cx={-s * 0.18} cy={-s * 0.05} r={s * 0.28} fill="#7E22CE" />
          <circle cx={s * 0.18} cy={-s * 0.05} r={s * 0.28} fill="#7E22CE" />
          <circle cx="0" cy={s * 0.22} r={s * 0.28} fill="#9333EA" />
          <circle cx={-s * 0.22} cy={-s * 0.15} r={s * 0.08} fill="#E9D5FF" opacity="0.7" />
          <path d={`M -2 ${-s * 0.4} L 0 ${-s * 0.6} L 2 ${-s * 0.4}`} stroke="#16A34A" strokeWidth="1.4" fill="none" />
        </g>
      );
    case 'leaf':
      return (
        <g transform={`translate(${cx}, ${cy})`}>
          <path d={`M 0 ${-s * 0.6} Q ${s * 0.55} ${-s * 0.1} 0 ${s * 0.6} Q ${-s * 0.55} ${-s * 0.1} 0 ${-s * 0.6} Z`} fill="#16A34A" />
          <path d={`M 0 ${-s * 0.55} L 0 ${s * 0.55}`} stroke="#0E7A2E" strokeWidth="1.2" />
          <path d={`M 0 ${-s * 0.2} L ${s * 0.3} ${-s * 0.05}`} stroke="#0E7A2E" strokeWidth="0.8" />
          <path d={`M 0 ${s * 0.05} L ${-s * 0.3} ${s * 0.2}`} stroke="#0E7A2E" strokeWidth="0.8" />
        </g>
      );
  }
}

const SPRITES: Pellet['sprite'][] = ['apple', 'acorn', 'berry', 'leaf'];

// ─────────────────────────────────────────────────────────────────────────
// renderSnakeReviewItem — per-round locked render for PracticeReview.
// Picnic-snake scoreboard: round number + question + pellet options with
// student's eat + correct pellet highlighted.
// ─────────────────────────────────────────────────────────────────────────
const SK_REVIEW_ACCENT = '#22C55E';
export function renderSnakeReviewItem(
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
        : 'linear-gradient(180deg, rgba(34,197,94,0.12), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(34,197,94,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${SK_REVIEW_ACCENT}22`, color: SK_REVIEW_ACCENT,
          border: `1px solid ${SK_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          PELLET {String(roundNumber).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(34,197,94,0.22)',
          color: isWrong ? '#FB7185' : '#22C55E',
        }}>
          {isWrong ? '✗ POISON · TRUCIZNA' : '✓ EATEN · ZJEDZONE'}
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
                ? 'rgba(34,197,94,0.20)'
                : showWrong
                  ? 'rgba(251,113,133,0.18)'
                  : 'rgba(245,239,255,0.04)',
              border: `1px solid ${showCorrect ? '#22C55E88' : showWrong ? '#FB718588' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? '#22C55E' : showWrong ? '#FB7185' : 'var(--em-text, #EDE6FF)',
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

export const SnakeShell: React.FC<SnakeShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const activePuzzle: ArcadePuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : DEMO_PUZZLE;
  const persisted = useShellProgress('snake');
  const arcadeEvent = useArcadeEvents();
  const interactionRef = useRef<HTMLDivElement>(null);
  const { later, cancel: cancelActionTimers } = useActionTimers();
  const reduce = usePrefersReducedMotion();

  const [roundIdx, setRoundIdx] = useState(0);
  const [solved, setSolved] = useState<boolean[]>(() => activePuzzle.rounds.map(() => false));
  const [snake, setSnake] = useState<Cell[]>([]);
  const [dir, setDir] = useState<Dir>('right');
  const dirRef = useRef<Dir>('right');
  const queuedDirRef = useRef<Dir | null>(null);
  const [pellets, setPellets] = useState<Pellet[]>([]);
  // Tick reads pellets from this ref so collision detection is synchronous;
  // calling setPellets((cur) => …) inside the tick can't read state inline,
  // and adding pellets to the tick deps would tear down setInterval per eat.
  const pelletsRef = useRef<Pellet[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintActive, setHintActive] = useState(false);
  const [missCount, setMissCount] = useState(0);
  const [score, setScore] = useState(0);
  const [paused, setPaused] = useState(true);
  const [pace, setPace] = useState<'cruise' | 'sprint'>('cruise');
  const snakeRef = useRef<Cell[]>([]);
  const lengthRef = useRef(5);
  const roundLocked = useRef(false);
  const tickRef = useRef<number | null>(null);
  const [tickN, setTickN] = useState(0); // drives slither wave

  // Belt-and-suspenders: mirror pellets state into the ref every render in
  // case some new code path forgets to update both.
  useEffect(() => { pelletsRef.current = pellets; }, [pellets]);

  const cur = activePuzzle.rounds[roundIdx];
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
        finalLength: snake.length,
      });
    } : undefined,
  });

  // Mask the answer in the rendered prompt as a per-shell guard against #19.
  const answerWord = cur ? cur.options[cur.answerIndex] : '';
  const renderedPrompt = useMemo(() => maskAnswerInPrompt(cur?.prompt, answerWord), [cur?.prompt, answerWord]);

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
      shellKey: 'snake',
      brief: SNAKE_INSTRUCTIONS.whatYouDo.en[0],
      brief_pl: SNAKE_INSTRUCTIONS.whatYouDo.pl[0],
      detail: SNAKE_INSTRUCTIONS.controls.en.join(' ') + ' ' + SNAKE_INSTRUCTIONS.rightWrongSkip.en.join(' '),
      detail_pl: SNAKE_INSTRUCTIONS.controls.pl.join(' ') + ' ' + SNAKE_INSTRUCTIONS.rightWrongSkip.pl.join(' '),
      fullInstructions: SNAKE_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  // Round setup — center snake, scatter pellets randomly avoiding snake.
  const setupRound = useCallback(() => {
    if (forcedState) return;
    if (!cur) return;
    // Wave C (Ricky CC-3, 2026-05-02): boosted initial length 3→5 so the
    // segmented ribbon reads obviously as a snake, not floating dots.
    const startSnake: Cell[] = Array.from({ length: Math.min(lengthRef.current, COLS - 3) }, (_, i) => ({ r: Math.floor(ROWS / 2), c: (6 - i + COLS) % COLS }));
    setSnake(startSnake);
    snakeRef.current = startSnake;
    roundLocked.current = false;
    setPaused(true);
    setDir('right');
    dirRef.current = 'right';
    queuedDirRef.current = null;

    // Place pellets — one per option, in distinct cells far from snake start.
    // Ricky CD-fix (2026-05-03): seed placement from cur.id so positions are
    // STABLE across re-renders. Previously Math.random() meant every call to
    // setupRound (e.g. when React re-evaluates the effect) would teleport
    // pellets — CD audit reported "food teleports randomly between frames".
    let seed = (cur.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 2654435761) >>> 0;
    const detRand = (): number => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const used = new Set(startSnake.map(s => `${s.r},${s.c}`));
    const placed: Pellet[] = [];
    for (let i = 0; i < cur.options.length; i++) {
      let attempt = 0;
      while (attempt < 200) {
        // Pellets occupy interior cells with a 1-cell margin on top/bottom and
        // a 2-cell margin on the right (so nameplate callouts that lean right
        // still have room before the grid edge).
        const r = 1 + Math.floor(detRand() * (ROWS - 2));
        const c = 6 + Math.floor(detRand() * (COLS - 8));
        const key = `${r},${c}`;
        if (!used.has(key)) {
          used.add(key);
          placed.push({
            cell: { r, c },
            optionIdx: i,
            word: cur.options[i],
            isAnswer: i === cur.answerIndex,
            sprite: SPRITES[i % SPRITES.length],
          });
          break;
        }
        attempt++;
      }
    }
    setPellets(placed);
    pelletsRef.current = placed;
    setFeedback(null);
    // Keep total mistakes throughout the route.
    // Ricky CD-fix (2026-05-03 hotfix): dep is cur?.id (stable string), NOT
    // cur (object). Parent re-renders can hand us a NEW puzzle.rounds[i]
    // object reference even when the round content is unchanged; depending
    // on the object ref made setupRound re-create every render, which made
    // the useEffect below re-fire setSnake(startSnake) every render —
    // visually pinning the snake to the start cell so arrow keys appeared
    // to do nothing. cur.id is the canonical round identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, forcedState]);

  useEffect(() => {
    setupRound();
  }, [roundIdx, setupRound]);

  // Game tick — moves snake.
  useEffect(() => {
    if (forcedState) return;
    if (paused || completed) return;
    const tick = () => {
      const prev = snakeRef.current;
      if (!prev.length || roundLocked.current) return;
      const queued = queuedDirRef.current;
      const opposite: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
      if (queued && opposite[queued] !== dirRef.current) { dirRef.current = queued; setDir(queued); }
      queuedDirRef.current = null;
      const step = snakeStep(prev, dirRef.current, ROWS, COLS);
      const eaten = pelletsRef.current.find(p => p.cell.r === step.head.r && p.cell.c === step.head.c);
      if (step.collided) {
        setFeedback('wrong'); setMissCount(n => n + 1); setPaused(true);
        lengthRef.current = Math.max(5, lengthRef.current - 1);
        const resetBody = Array.from({ length: lengthRef.current }, (_, i) => ({ r: 6, c: (6 - i + COLS) % COLS }));
        snakeRef.current = resetBody; setSnake(resetBody); dirRef.current = 'right'; setDir('right');
        // A steering collision affects the trail, never the learner's English accuracy.
        return;
      }
      let moved = step.body;
      if (eaten) {
        pelletsRef.current = pelletsRef.current.filter(p => p !== eaten); setPellets(pelletsRef.current);
        if (eaten.isAnswer) {
          roundLocked.current = true; setFeedback('correct');
          arcadeEvent({ type: 'correct', points: pace === 'sprint' ? 140 : 100 });
          setScore(n => n + (pace === 'sprint' ? 140 : 100));
          lengthRef.current = Math.min(COLS - 3, prev.length + 1);
          moved = [step.head, ...prev];
          setSolved(v => v.map((value, i) => i === roundIdx ? true : value));
          later(() => { const nextRound = solved.findIndex((done, i) => !done && i !== roundIdx); if (nextRound >= 0) setRoundIdx(nextRound); }, 1000);
        } else {
          setFeedback('wrong'); setMissCount(n => n + 1); arcadeEvent({ type: 'incorrect' });
          lengthRef.current = Math.max(3, prev.length - 1); moved = moved.slice(0, lengthRef.current);
          tip.recordWrong({ questionId: cur.id, studentAnswer: eaten.word, correctAnswer: cur.options[cur.answerIndex], explanationPL: cur.hint_pl, exerciseId: cur.exerciseId });
          later(() => setFeedback(null), 700);
        }
      }
      snakeRef.current = moved; setSnake(moved); setTickN(n => (n + 1) % 1024);
    };
    tickRef.current = window.setInterval(tick, pace === 'sprint' ? 150 : 260);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
    // Ricky CD-fix (2026-05-03 hotfix): dep is cur?.id (stable string), NOT
    // cur (object). When the parent re-renders the puzzle prop, cur's object
    // identity churns and was tearing down setInterval before TICK_MS (180ms)
    // elapsed — snake never advanced. The closure still reads the latest cur
    // via the render scope; cur.id stability is enough for correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, pace, completed, forcedState, roundIdx, cur?.id, activePuzzle.rounds.length]);

  useEffect(() => {
    if (forcedState === 'empty') { setSolved(activePuzzle.rounds.map(() => false)); setSnake([]); setPellets([]); pelletsRef.current = []; }
    if (forcedState === 'correct') { setFeedback('correct'); }
    if (forcedState === 'wrong') { setFeedback('wrong'); }
    if (forcedState === 'complete') { setSolved(activePuzzle.rounds.map(() => true)); }
  }, [forcedState]);

  // Keyboard.
  useEffect(() => {
    if (forcedState) return;
    const handler = (e: KeyboardEvent) => {
      if (!interactionRef.current?.contains(e.target as Node)) return;
      const map: Record<string, Dir | undefined> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
        W: 'up', S: 'down', A: 'left', D: 'right',
      };
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      const next = map[e.key];
      if (next) { e.preventDefault(); queuedDirRef.current = next; }
      if (e.key === ' ' && !(e.target as HTMLElement).closest('button,a')) { e.preventDefault(); setPaused(p => !p); }
    };
    const suspend = () => { if (document.hidden) setPaused(true); };
    const blur = () => setPaused(true);
    window.addEventListener('keydown', handler); document.addEventListener('visibilitychange', suspend); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', handler); document.removeEventListener('visibilitychange', suspend); window.removeEventListener('blur', blur); };
  }, [forcedState]);

  const useHint = (): void => {
    if (hintsUsed >= 3) return;
    setHintActive(true);
    setHintsUsed(h => h + 1);
    later(() => setHintActive(false), 3000);
  };

  const skipRound = (): void => {
    const nextRound = solved.findIndex((done, i) => !done && i !== roundIdx); if (nextRound >= 0) setRoundIdx(nextRound);
  };

  const reset = (): void => {
    cancelActionTimers();
    arcadeEvent({ type: 'reset' });
    lengthRef.current = 5; roundLocked.current = false; setPaused(true); setupRound();
    setRoundIdx(0);
    setSolved(activePuzzle.rounds.map(() => false));
    setFeedback(null);
    setHintsUsed(0);
    setMissCount(0);
    setScore(0);
    tip.reset();
  };

  const press = (d: Dir): void => { queuedDirRef.current = d; };

  // Dusk park gradient.
  const grad = time === 'day'
    ? 'linear-gradient(180deg, #4F2A6F 0%, #1F1240 100%)'
    : 'linear-gradient(180deg, #1F1240 0%, #2C1A4A 50%, #382458 100%)';

  // Cell sizing (responsive scaled later via viewBox).
  const CELL = 36;
  const W = COLS * CELL;
  const H = ROWS * CELL;

  // Build snake segment chain — head, body, tail with slither wave per segment.
  // The wave is a small perpendicular sine offset modulated by tick number and
  // segment index so the body undulates as it moves.
  const snakePoints = useMemo(() => {
    return snake.map((seg, i) => {
      const cx = seg.c * CELL + CELL / 2;
      const cy = seg.r * CELL + CELL / 2;
      // Slither offset perpendicular to direction of travel.
      const wave = reduce ? 0 : Math.sin((tickN * 0.6) + (i * 0.9)) * 2.4;
      const isHorizontal = dir === 'left' || dir === 'right';
      const ox = isHorizontal ? 0 : wave;
      const oy = isHorizontal ? wave : 0;
      return { cx: cx + ox, cy: cy + oy, raw: { cx, cy } };
    });
  }, [snake, tickN, dir, reduce]);

  // Smooth body path through segments using a chain of cubic Bezier curves.
  // Anchor at each segment; control points are midpoint-offsets that round
  // the corners. Result: a continuous serpentine ribbon, not 3 floating dots.
  const bodyPath = useMemo(() => {
    if (snakePoints.length < 2) return '';
    const pts = snakePoints;
    let d = `M ${pts[0].cx} ${pts[0].cy}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const cp1x = prev.cx + (cur.cx - prev.cx) * 0.5;
      const cp1y = prev.cy + (cur.cy - prev.cy) * 0.5;
      d += ` Q ${cp1x} ${cp1y} ${cur.cx} ${cur.cy}`;
    }
    return d;
  }, [snakePoints]);

  // Falling leaves (decorative). Pre-generate so each leaf has a stable seed.
  const leaves = useMemo(() => Array.from({ length: 8 }).map((_, i) => ({
    left: `${(i * 13 + 7) % 100}%`,
    delay: `${(i * 1.7) % 8}s`,
    dur: `${10 + (i % 5) * 1.5}s`,
    rot: (i * 47) % 360,
    size: 10 + (i % 3) * 4,
  })), []);

  // Grass tufts in 4 corners (simple SVG pattern).
  const tufts = useMemo(() => ([
    { x: '4%', y: '70%', flip: false },
    { x: '96%', y: '72%', flip: true },
    { x: '12%', y: '85%', flip: false },
    { x: '88%', y: '88%', flip: true },
    { x: '46%', y: '92%', flip: false },
  ]), []);

  const liveStatus = completed
    ? 'The path ends at the gate. Park complete.'
    : feedback === 'correct'
      ? 'Pellet eaten correctly.'
      : feedback === 'wrong'
        ? 'Wrong pellet. Tail shrunk.'
        : '';

  const targetWord = `${roundIdx + 1} / ${activePuzzle.rounds.length}`;

  return (
    <div
      className="em-shell em-shell-snake"
      ref={interactionRef}
      tabIndex={0}
      onPointerDown={event => { if (!(event.target as HTMLElement).closest('button,a,input,textarea,select')) interactionRef.current?.focus({ preventScroll: true }); }}
      role="application"
      aria-label="Snake practice, the Park Path"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <style>{`
        @keyframes em-snake-glow {
          0%, 100% { filter: drop-shadow(0 0 4px ${ACCENT}); }
          50% { filter: drop-shadow(0 0 12px ${ACCENT}) drop-shadow(0 0 4px ${HALO}); }
        }
        @keyframes em-snake-rise {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes em-lamp-flicker {
          0%, 100% { opacity: 0.7; }
          47%, 49% { opacity: 1; }
          48% { opacity: 0.5; }
        }
        @keyframes em-pellet-halo {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(1.18); }
        }
        @keyframes em-leaf-drift {
          0% { transform: translate(0, -20px) rotate(0deg); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.8; }
          100% { transform: translate(40px, 100vh) rotate(360deg); opacity: 0; }
        }
        @keyframes em-tongue-flick {
          0%, 80%, 100% { opacity: 0; }
          40%, 60% { opacity: 1; }
        }
        .em-snake-leaf {
          position: absolute;
          top: 0;
          pointer-events: none;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .em-snake-leaf { animation: none !important; opacity: 0.4 !important; }
        }
        @media (max-width: 768px) {
          .em-snake-side { display: none !important; }
          .em-snake-layout { grid-template-columns: 1fr !important; padding: 16px !important; }
          .em-snake-dpad { display: grid !important; }
        }
        .em-snake-dpad { display: none; }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{liveStatus}</div>

      {/* Park dusk scene */}
      <div style={{ position: 'absolute', inset: 0, background: grad }} />

      {/* Hedges silhouette */}
      <svg viewBox="0 0 1200 200" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '20%', opacity: 0.7 }} aria-hidden="true">
        <path d="M0 200 Q 50 130 100 160 Q 150 100 200 150 Q 250 110 300 150 Q 360 90 420 140 Q 480 100 540 150 Q 600 110 660 140 Q 720 90 780 150 Q 840 110 900 140 Q 960 100 1020 150 Q 1080 110 1140 140 Q 1180 110 1200 130 L1200 200 Z" fill="#0E2A1A" />
      </svg>

      {/* Lampposts — perimeter, with subtle yellow glow */}
      {[14, 38, 62, 86].map((px, pi) => (
        <div key={pi} style={{
          position: 'absolute', left: `${px}%`, bottom: '14%',
          width: 4, height: 80,
          background: '#0E0A1A',
          pointerEvents: 'none',
          zIndex: 1,
        }} aria-hidden="true">
          {/* Cross-arm */}
          <div style={{ position: 'absolute', top: 0, left: -10, width: 24, height: 2, background: '#0E0A1A' }} />
          <div style={{
            position: 'absolute', top: -12, left: -8,
            width: 20, height: 16,
            borderRadius: '50% 50% 50% 50% / 70% 70% 30% 30%',
            background: HALO,
            boxShadow: `0 0 24px ${HALO}aa, 0 0 60px ${HALO}44`,
            animation: reduce ? 'none' : `em-lamp-flicker ${4 + (pi % 3)}s var(--em-ease) infinite`,
          }} />
        </div>
      ))}

      {/* Falling leaves (decorative) */}
      {!reduce && leaves.map((l, i) => (
        <svg
          key={i}
          className="em-snake-leaf"
          width={l.size} height={l.size}
          viewBox="0 0 16 16"
          style={{
            left: l.left,
            animation: `em-leaf-drift ${l.dur} linear ${l.delay} infinite`,
            transform: `rotate(${l.rot}deg)`,
          }}
          aria-hidden="true"
        >
          <path d="M 8 1 Q 14 8 8 15 Q 2 8 8 1 Z" fill="#16A34A" opacity="0.7" />
          <path d="M 8 2 L 8 14" stroke="#0E7A2E" strokeWidth="0.6" />
        </svg>
      ))}

      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div className="em-snake-layout" style={{
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
            <AmbientAudioPlayer shellSlug="snake" />
            <Nameplate
              district="The Park Path"
              subtitle="Snake · Wąż · grow your tail with the right words"
              accent={ACCENT}
              icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 11 Q 7 5 11 11 T 19 11" stroke={ACCENT} strokeWidth="1.6" fill="none" strokeLinecap="round" /><circle cx="19" cy="11" r="1.2" fill={ACCENT} /></svg>}
            />
          </div>

          {/* Prompt + pause */}
          <div style={{
            margin: '14px 24px 0',
            padding: '12px 18px',
            background: 'linear-gradient(90deg, rgba(34,197,94,0.14), rgba(34,197,94,0.02))',
            border: `1px solid ${ACCENT}55`,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 14,
            animation: 'em-snake-rise 320ms var(--em-ease)',
          }} key={`p-${roundIdx}`}>
            <div style={{
              fontFamily: 'var(--em-mono)', fontSize: 11, color: ACCENT, letterSpacing: '0.18em',
              padding: '4px 8px', border: `1px solid ${ACCENT}66`, borderRadius: 4, flexShrink: 0,
            }}>RND {String(roundIdx + 1).padStart(2, '0')}</div>
            <div className="em-decor" style={{ fontSize: 18, color: 'var(--em-text)', flex: 1, lineHeight: 1.3 }}>{renderedPrompt}</div>
            <button
              onClick={() => setPaused(p => !p)}
              aria-label={paused ? 'Resume' : 'Pause'}
              style={{
                minHeight: 36, minWidth: 56, padding: '6px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 6,
                color: 'var(--em-text)',
                fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.1em',
                cursor: 'pointer',
              }}>{paused ? '▶' : '❚❚'}</button>
          </div>

          {/* Game board */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'flex-start', padding: 16, position: 'relative', minWidth: 0 }}>
            <div style={{
              width: '100%', maxWidth: W * 1.4, aspectRatio: `${W} / ${H}`,
              position: 'relative',
            }}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{
                width: '100%', height: '100%',
                background: 'linear-gradient(180deg, #1F1240 0%, #2C1A4A 50%, #382458 100%)',
                borderRadius: 8,
                border: `1px solid ${ACCENT}55`,
                boxShadow: `inset 0 0 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,197,94,0.15)`,
                overflow: 'visible',
              }}>
                {/* Defs — cobblestone pattern, snake gradient */}
                <defs>
                  {/* Wave C (Ricky CC-3, 2026-05-02): boosted cobblestone */}
                  {/* visibility — was rgba(255,255,255,0.06) which read as     */}
                  {/* invisible; bumped to 0.18 so stones actually look like a  */}
                  {/* path, not a flat purple grid.                              */}
                  <pattern id="snake-cobble" width="36" height="36" patternUnits="userSpaceOnUse">
                    <rect width="36" height="36" fill="#2A1A52" />
                    {/* Cobblestone arcs to suggest stone shapes */}
                    <ellipse cx="9" cy="9" rx="8" ry="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,220,180,0.22)" strokeWidth="1" />
                    <ellipse cx="27" cy="9" rx="8" ry="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,220,180,0.22)" strokeWidth="1" />
                    <ellipse cx="9" cy="27" rx="8" ry="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,220,180,0.22)" strokeWidth="1" />
                    <ellipse cx="27" cy="27" rx="8" ry="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,220,180,0.22)" strokeWidth="1" />
                    {/* Stone shadows for depth */}
                    <ellipse cx="9" cy="11" rx="7" ry="4" fill="rgba(0,0,0,0.18)" />
                    <ellipse cx="27" cy="11" rx="7" ry="4" fill="rgba(0,0,0,0.18)" />
                    <ellipse cx="9" cy="29" rx="7" ry="4" fill="rgba(0,0,0,0.18)" />
                    <ellipse cx="27" cy="29" rx="7" ry="4" fill="rgba(0,0,0,0.18)" />
                    {/* Mortar lines */}
                    <path d="M 0 18 L 36 18 M 18 0 L 18 36" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
                  </pattern>
                  <pattern id="snake-grass-edge" width="20" height="12" patternUnits="userSpaceOnUse">
                    <rect width="20" height="12" fill="#0F2A1A" />
                    <path d="M 2 12 L 1 4 M 6 12 L 6 2 M 10 12 L 11 5 M 14 12 L 14 3 M 18 12 L 17 6"
                      stroke="#1E5D2E" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                  </pattern>
                  <linearGradient id="snake-body-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={ACCENT} />
                    <stop offset="100%" stopColor={ACCENT_TAIL} />
                  </linearGradient>
                  <radialGradient id="snake-halo-grad">
                    <stop offset="0%" stopColor={HALO} stopOpacity="0.5" />
                    <stop offset="60%" stopColor={HALO} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={HALO} stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Cobblestone path under everything */}
                <rect width={W} height={H} fill="url(#snake-cobble)" />

                {/* Wave C: Park theme layers INSIDE the SVG — guaranteed to    */}
                {/* render regardless of outer card opacity.                     */}

                {/* Grass border strips (top + bottom) */}
                <rect x="0" y="0" width={W} height="10" fill="url(#snake-grass-edge)" opacity="0.85" />
                <rect x="0" y={H - 10} width={W} height="10" fill="url(#snake-grass-edge)" opacity="0.85" />

                {/* Hedge silhouette across bottom */}
                <path
                  d={`M 0 ${H - 8} Q ${W * 0.08} ${H - 22} ${W * 0.16} ${H - 12} Q ${W * 0.24} ${H - 28} ${W * 0.32} ${H - 14} Q ${W * 0.40} ${H - 24} ${W * 0.48} ${H - 12} Q ${W * 0.56} ${H - 26} ${W * 0.64} ${H - 14} Q ${W * 0.72} ${H - 22} ${W * 0.80} ${H - 12} Q ${W * 0.88} ${H - 26} ${W * 0.96} ${H - 14} L ${W} ${H} L 0 ${H} Z`}
                  fill="#0E2A1A"
                  opacity="0.75"
                />

                {/* Lamp posts INSIDE the SVG — 3 posts with halo glow */}
                {[W * 0.18, W * 0.50, W * 0.82].map((lx, li) => {
                  const ly = H - 28; // base of post
                  const postH = 60;
                  return (
                    <g key={`lamp-${li}`} aria-hidden="true">
                      {/* Halo glow */}
                      <circle
                        cx={lx} cy={ly - postH}
                        r={26}
                        fill={HALO}
                        opacity="0.18"
                        style={{
                          animation: reduce ? 'none' : `em-lamp-flicker ${4 + (li % 3)}s ease-in-out infinite`,
                        }}
                      />
                      <circle cx={lx} cy={ly - postH} r={14} fill={HALO} opacity="0.35"
                        style={{ animation: reduce ? 'none' : `em-lamp-flicker ${4 + (li % 3)}s ease-in-out infinite` }} />
                      {/* Post */}
                      <rect x={lx - 1.5} y={ly - postH} width="3" height={postH} fill="#0E0A1A" />
                      {/* Cross arm */}
                      <rect x={lx - 8} y={ly - postH - 1} width="16" height="2" fill="#0E0A1A" />
                      {/* Lamp head */}
                      <ellipse cx={lx} cy={ly - postH - 4} rx="6" ry="5" fill={HALO} opacity="0.95"
                        style={{ animation: reduce ? 'none' : `em-lamp-flicker ${4 + (li % 3)}s ease-in-out infinite` }} />
                      <ellipse cx={lx} cy={ly - postH - 4} rx="6" ry="5" fill="none" stroke="#0E0A1A" strokeWidth="0.8" />
                      {/* Base */}
                      <rect x={lx - 4} y={ly - 2} width="8" height="3" fill="#0E0A1A" />
                    </g>
                  );
                })}

                {/* Falling leaves drifting across the play area (SVG-native, won't be hidden) */}
                {!reduce && Array.from({ length: 6 }).map((_, li) => {
                  const lx = ((li * 137) % W);
                  const dur = 8 + (li % 4) * 2;
                  const delay = (li * 1.3) % dur;
                  return (
                    <g key={`leaf-${li}`} aria-hidden="true">
                      <path
                        d="M 0 -4 Q 4 0 0 4 Q -4 0 0 -4 Z"
                        fill="#D97706"
                        opacity="0.7"
                        transform={`translate(${lx}, 0)`}
                      >
                        <animateTransform
                          attributeName="transform"
                          type="translate"
                          from={`${lx} -10`}
                          to={`${lx + 30} ${H + 10}`}
                          dur={`${dur}s`}
                          begin={`${delay}s`}
                          repeatCount="indefinite"
                        />
                        <animateTransform
                          attributeName="transform"
                          type="rotate"
                          from="0"
                          to="360"
                          dur={`${dur}s`}
                          begin={`${delay}s`}
                          repeatCount="indefinite"
                          additive="sum"
                        />
                      </path>
                    </g>
                  );
                })}

                {/* Grass tufts at corners (in-grid SVG sprites) */}
                {tufts.map((t, i) => {
                  const tx = parseFloat(t.x) / 100 * W;
                  const ty = parseFloat(t.y) / 100 * H;
                  return (
                    <g key={`tuft-${i}`} transform={`translate(${tx}, ${ty}) ${t.flip ? 'scale(-1, 1)' : ''}`} opacity="0.55">
                      <path d="M 0 0 L -3 -10 M 0 0 L 0 -14 M 0 0 L 3 -10 M 0 0 L -6 -8 M 0 0 L 6 -8" stroke="#16A34A" strokeWidth="1.4" strokeLinecap="round" fill="none" />
                    </g>
                  );
                })}

                {/* Pellets — illustrated picnic items, with halo on the answer */}
                {pellets.map((p, i) => {
                  const cx = p.cell.c * CELL + CELL / 2;
                  const cy = p.cell.r * CELL + CELL / 2;
                  const isAns = p.isAnswer && hintActive;
                  return (
                    <g key={`pel-${i}`}>
                      {/* Pulsing halo on the correct pellet — affordance per audit §5.5 */}
                      {isAns && (
                        <circle
                          cx={cx} cy={cy}
                          r={CELL * 0.7}
                          fill="url(#snake-halo-grad)"
                          style={{
                            transformOrigin: `${cx}px ${cy}px`,
                            animation: reduce ? 'none' : 'em-pellet-halo 1.2s ease-in-out infinite',
                            opacity: reduce ? 0.5 : undefined,
                          }}
                        />
                      )}
                      {isAns && (
                        <circle
                          cx={cx} cy={cy}
                          r={CELL * 0.5}
                          fill="none"
                          stroke={HALO}
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                          opacity="0.6"
                        />
                      )}
                      {/* Hint reveal: extra ring when student spends a hint */}
                      {hintActive && isAns && (
                        <circle cx={cx} cy={cy} r={CELL * 0.85} fill="none" stroke={HALO} strokeWidth="2" style={{ filter: `drop-shadow(0 0 8px ${HALO})` }} />
                      )}
                      {/* The illustrated picnic item */}
                      {renderSprite(p.sprite, cx, cy, CELL * 0.36)}
                    </g>
                  );
                })}

                {/* Snake — segmented chain with slither, head→tail gradient, tapered tail */}
                {snakePoints.length >= 2 && (
                  <>
                    {/* Body ribbon (smooth path, tapered) */}
                    <path
                      d={bodyPath}
                      stroke="url(#snake-body-grad)"
                      strokeWidth={CELL * 0.62}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      opacity="0.95"
                      style={{ filter: `drop-shadow(0 0 6px ${ACCENT}66)` }}
                    />
                    {/* Subtle inner highlight */}
                    <path
                      d={bodyPath}
                      stroke="rgba(255,255,255,0.18)"
                      strokeWidth={CELL * 0.18}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                    {/* Body segment dots — anchors to make it read as a chain of links */}
                    {snakePoints.slice(1).map((pt, i) => {
                      // Taper the tail: smaller radius for later segments.
                      const t = i / Math.max(1, snakePoints.length - 1);
                      const r = Math.max(2, CELL * 0.28 * (1 - t * 0.6));
                      // Color blend head→tail via stop interpolation (approx).
                      const blend = (1 - t);
                      const rC = Math.round(0x22 * blend + 0x15 * (1 - blend));
                      const gC = Math.round(0xC5 * blend + 0x80 * (1 - blend));
                      const bC = Math.round(0x5E * blend + 0x3D * (1 - blend));
                      const col = `rgb(${rC}, ${gC}, ${bC})`;
                      return (
                        <circle
                          key={`seg-${i}`}
                          cx={pt.cx}
                          cy={pt.cy}
                          r={r}
                          fill={col}
                          opacity={0.92}
                        />
                      );
                    })}
                  </>
                )}

                {/* Snake head — triangular SVG with eye + flicking tongue */}
                {snakePoints.length > 0 && (() => {
                  const h = snakePoints[0];
                  // Direction-aware rotation for the head.
                  const rot = dir === 'right' ? 0 : dir === 'down' ? 90 : dir === 'left' ? 180 : 270;
                  const headR = CELL * 0.4;
                  return (
                    <g transform={`translate(${h.cx}, ${h.cy}) rotate(${rot})`}>
                      {/* Head body — ellipse leaning forward */}
                      <ellipse cx="0" cy="0" rx={headR} ry={headR * 0.85} fill={ACCENT} stroke="#0E7A2E" strokeWidth="0.8" />
                      {/* Triangular forward snout */}
                      <path d={`M ${headR * 0.7} ${-headR * 0.5} L ${headR * 1.25} 0 L ${headR * 0.7} ${headR * 0.5} Z`} fill={ACCENT} stroke="#0E7A2E" strokeWidth="0.6" />
                      {/* Tongue (flicks) */}
                      <path
                        d={`M ${headR * 1.2} 0 L ${headR * 1.7} ${-2} M ${headR * 1.2} 0 L ${headR * 1.7} 2`}
                        stroke="#DC2626"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        style={{
                          animation: reduce ? 'none' : 'em-tongue-flick 1.4s ease-in-out infinite',
                          opacity: reduce ? 0.7 : undefined,
                        }}
                      />
                      {/* Eyes */}
                      <circle cx={headR * 0.2} cy={-headR * 0.4} r="2.4" fill="#FFFFFF" />
                      <circle cx={headR * 0.25} cy={-headR * 0.4} r="1.4" fill="#0E0A1A" />
                      {/* Glow */}
                      <circle cx="0" cy="0" r={headR * 1.2} fill="none" opacity="0.0" style={{ animation: reduce ? 'none' : 'em-snake-glow 1.6s ease-in-out infinite' }} />
                    </g>
                  );
                })()}

                {/* Pellet nameplates — drawn LAST (above grid) and OUTSIDE the cell.
                    Stops the truncation issue from putting word labels INSIDE small circles. */}
                {pellets.map((p, i) => {
                  const cx = p.cell.c * CELL + CELL / 2;
                  const cy = p.cell.r * CELL + CELL / 2;
                  // Position nameplate ~30px below the pellet (or above if near bottom edge).
                  const below = cy < H - 60;
                  const ny = below ? cy + 30 : cy - 30;
                  const isAns = p.isAnswer && hintActive;
                  // Auto-fit nameplate: estimate width from char count (mono ~7px per char).
                  const padX = 10;
                  const nw = Math.max(40, p.word.length * 7 + padX * 2);
                  const nh = 18;
                  return (
                    <g key={`np-${i}`} pointerEvents="none">
                      {/* Connector line (1px dotted, low opacity) between pellet and nameplate */}
                      <line
                        x1={cx} y1={cy + (below ? CELL * 0.36 : -CELL * 0.36)}
                        x2={cx} y2={ny + (below ? -nh / 2 : nh / 2)}
                        stroke={isAns ? HALO : 'rgba(255,255,255,0.35)'}
                        strokeWidth="1"
                        strokeDasharray="2 2"
                        opacity="0.7"
                      />
                      {/* Dark pill nameplate */}
                      <rect
                        x={cx - nw / 2}
                        y={ny - nh / 2}
                        width={nw}
                        height={nh}
                        rx={9}
                        ry={9}
                        fill="rgba(14, 10, 26, 0.95)"
                        stroke={isAns ? HALO : 'rgba(255,255,255,0.25)'}
                        strokeWidth={isAns ? 1.2 : 0.8}
                      />
                      <text
                        x={cx}
                        y={ny + 3.5}
                        textAnchor="middle"
                        fontFamily="var(--em-mono)"
                        fontSize="10"
                        fontWeight="700"
                        fill={isAns ? HALO : '#FFFFFF'}
                        style={{ userSelect: 'none' }}
                      >{p.word}</text>
                    </g>
                  );
                })}

                {paused && (
                  <g>
                    <rect width={W} height={H} fill="rgba(0,0,0,0.6)" />
                    <text x={W / 2} y={H / 2} textAnchor="middle" fontFamily="var(--em-decor)" fontSize="32" fill={ACCENT}>{feedback === 'wrong' ? 'TRAIL RESET · RESUME' : 'READY? PRESS RESUME'}</text>
                  </g>
                )}
              </svg>

              {/* HUD overlay — top-left of the play grid */}
              <div style={{
                position: 'absolute', top: 8, left: 8,
                display: 'flex', flexDirection: 'column', gap: 4,
                pointerEvents: 'none',
                zIndex: 2,
              }}>
                <div style={hudPillStyle()}>
                  <span style={hudLabelStyle()}>SCORE · WYNIK</span>
                  <span style={hudValueStyle()}>{score}</span>
                </div>
                <div style={hudPillStyle()}>
                  <span style={hudLabelStyle()}>LENGTH · DŁUGOŚĆ</span>
                  <span style={hudValueStyle()}>{snake.length}</span>
                </div>
                <div style={{ ...hudPillStyle(), borderColor: `${HALO}99` }}>
                  <span style={{ ...hudLabelStyle(), color: HALO }}>ROUND · RUNDA</span>
                  <span style={{ ...hudValueStyle(), color: HALO }}>{targetWord}</span>
                </div>
              </div>
            </div>

            <div className="action-arcade-hud"><div><strong>{snake.length} segments</strong><small>Choose the word, then steer to its fruit. Edges wrap. Crossing your tail resets your position. Each answer grows the next route.</small></div><button aria-pressed={pace === 'sprint'} onClick={() => { setPaused(true); setPace(p => p === 'cruise' ? 'sprint' : 'cruise'); }}>{pace === 'sprint' ? 'Sprint · 140 pts' : 'Cruise · 100 pts'}</button></div>
            {/* DPad on touch */}
            <div className="em-snake-dpad" style={{
              position: 'absolute', bottom: 16, right: 16,
              gridTemplateColumns: 'repeat(3, 48px)',
              gridTemplateRows: 'repeat(3, 48px)',
              gap: 4,
            }}>
              <div />
              <button onClick={() => press('up')} aria-label="Up" style={dpadStyle}>↑</button>
              <div />
              <button onClick={() => press('left')} aria-label="Left" style={dpadStyle}>←</button>
              <div />
              <button onClick={() => press('right')} aria-label="Right" style={dpadStyle}>→</button>
              <div />
              <button onClick={() => press('down')} aria-label="Down" style={dpadStyle}>↓</button>
              <div />
            </div>

            {missCount > 0 && (
              <div style={{
                position: 'absolute', top: 8, right: 24,
                fontFamily: 'var(--em-mono)', fontSize: 10, color: '#FB7185',
                letterSpacing: '0.16em',
                padding: '4px 8px',
                background: 'rgba(251,113,133,0.1)',
                border: '1px solid #FB718555',
                borderRadius: 4,
              }}>{missCount} WRONG PELLET{missCount === 1 ? '' : 'S'}</div>
            )}
          </div>

          {completed && !onSessionComplete && (
            <div
              role="dialog"
              aria-live="assertive"
              aria-label="Park Path complete"
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
              <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa`, textAlign: 'center', padding: '0 16px' }}>The path ends at the gate.</div>
              <div className="em-eyebrow">PARK CLOSING · PARK ZAMYKA</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="em-btn em-btn-ghost" onClick={reset}>Restart run</button>
                <button className="em-btn em-btn-primary" onClick={reset}>Play again →</button>
              </div>
            </div>
          )}
          <Confetti show={completed} />
        </div>

        <div className="em-snake-side" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Progress current={solved.filter(Boolean).length} total={activePuzzle.rounds.length} accent={ACCENT} />
            <div style={{ display: 'flex', gap: 6 }}>
              <SkipButton onClick={() => { if (completed || roundLocked.current) return; const next = solved.findIndex((done, i) => !done && i !== roundIdx); if (next >= 0) setRoundIdx(next); }} />
              <HintButton onClick={useHint} used={hintsUsed} total={3} />
            </div>
          </div>

          <div className="em-shell-hint" style={{ minWidth: 0 }}>
          </div>

          <div className="em-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--em-line)', display: 'flex', justifyContent: 'space-between' }}>
              <div className="em-eyebrow">Trail · ścieżka</div>
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
                    background: isDone ? 'rgba(34,197,94,0.08)' : isCurrent ? `${ACCENT}11` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isDone ? `${ACCENT}55` : isCurrent ? `${ACCENT}66` : 'var(--em-line)'}`,
                  }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: isDone ? ACCENT : 'var(--em-text-dim)',
                    }} />
                    <div style={{
                      fontFamily: 'var(--em-body)', fontSize: 12, color: 'var(--em-text)', flex: 1,
                      opacity: isDone ? 0.7 : 1,
                    }}>{maskAnswerInPrompt(r.prompt, r.options[r.answerIndex])}</div>
                    {isDone && <div style={{ color: ACCENT, fontFamily: 'var(--em-mono)', fontSize: 10 }}>EATEN</div>}
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
          }}>↑ ↓ ← → OR W A S D · SPACE TO PAUSE</div>
        </div>
      </div>
    </div>
  );
};

const dpadStyle: React.CSSProperties = {
  minWidth: 48, minHeight: 48,
  background: 'rgba(34,197,94,0.18)',
  border: `1px solid ${ACCENT}66`,
  borderRadius: 8,
  color: ACCENT,
  fontFamily: 'var(--em-mono)', fontSize: 18,
  cursor: 'pointer',
  touchAction: 'manipulation',
};

function hudPillStyle(): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '4px 10px',
    background: 'rgba(14,10,26,0.85)',
    border: `1px solid ${ACCENT}66`,
    borderRadius: 6,
    fontFamily: 'var(--em-mono)',
  };
}

function hudLabelStyle(): React.CSSProperties {
  return {
    fontSize: 9,
    color: ACCENT,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  };
}

function hudValueStyle(): React.CSSProperties {
  return {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: 700,
  };
}

export default SnakeShell;
