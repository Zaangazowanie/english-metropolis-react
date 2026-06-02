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
import { buildSafeHint } from '../lib/safeHint';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// Backstreets · Maze Chase — full bilingual instruction copy.
const MAZECHASE_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A prompt sentence with a gap appears at the top above the cobbled backstreets maze.',
      'You move a small lantern-bearer (a glowing dot) through the maze using arrow keys.',
      'Tokens sit in some cells — CYAN means a CORRECT-answer token, ROSE means a WRONG-answer distractor.',
      'Reach a CYAN token to score; bumping a ROSE token dims your lantern (miss counter +1) but the round continues.',
    ],
    pl: [
      'Zdanie z luką pojawia się u góry nad uliczkowym labiryntem.',
      'Strzałkami prowadzisz małego latarnika (świecącą kropkę) przez labirynt.',
      'W niektórych komórkach są żetony — CYJAN = poprawna odpowiedź, RÓŻOWY = pułapka błędnej odpowiedzi.',
      'Dotrzyj do żetonu CYJAN, aby zdobyć punkt; uderzenie w RÓŻOWY przygasza Twoją latarnię (pomyłka +1), ale runda trwa.',
    ],
  },
  controls: {
    en: [
      'Arrow keys (← ↑ → ↓): move the lantern-bearer one cell at a time.',
      'Cobbled backstreets maze: dotted-purple walls block movement; pools of lamplight on corners are decorative.',
      'CYAN tokens: correct-answer pickups (each round has exactly one CYAN target).',
      'ROSE tokens: distractor-word pickups — bumping costs you a miss but the round continues.',
      'Color legend (bottom): CYAN = CORRECT / ROSE = WRONG bilingual reminder.',
      'Skip + Hint buttons: Skip jumps round, Hint pulses the CYAN token for ~1 second.',
    ],
    pl: [
      'Strzałki (← ↑ → ↓): przesuwają latarnika o jedną komórkę naraz.',
      'Brukowany labirynt zaułków: kropkowane fioletowe ściany blokują ruch; światła latarń w narożnikach są dekoracyjne.',
      'Żetony CYJAN: poprawna odpowiedź (każda runda ma dokładnie jeden cel CYJAN).',
      'Żetony RÓŻOWE: słowa-pułapki — uderzenie kosztuje pomyłkę, ale runda trwa.',
      'Legenda kolorów (na dole): CYJAN = POPRAWNE / RÓŻOWY = BŁĘDNE — dwujęzyczne przypomnienie.',
      'Przyciski Pomiń i Podpowiedź: Pomiń przeskakuje rundę, Podpowiedź pulsuje żetonem CYJAN przez ok. 1 sekundę.',
    ],
  },
  rightWrongSkip: {
    en: [
      'CYAN token reached: ✓ green flash, +1 to your tally, next round queues with a fresh maze layout.',
      'ROSE token bumped: ✗ rose flash, lantern dims, miss counter +1; the round continues — keep hunting for CYAN.',
      'Skip: counts as wrong — moves to the next round without finding a CYAN.',
      'You cannot get "stuck" — backtracking through the maze is always allowed; the round only advances on CYAN reach or Skip.',
    ],
    pl: [
      'Dotarcie do CYJAN: ✓ zielony błysk, +1 do wyniku, następna runda ze świeżym układem labiryntu.',
      'Uderzenie w RÓŻOWY: ✗ różowy błysk, latarnia przygasa, pomyłka +1; runda trwa — szukaj CYJAN dalej.',
      'Pomiń: liczy się jako błąd — przeskok do następnej rundy bez znalezienia CYJAN.',
      'Nie możesz „utknąć" — cofanie się po labiryncie jest zawsze dozwolone; runda kończy się tylko po dotarciu do CYJAN lub po Pomiń.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Each tap pulses the CYAN target for ~1 second so you can plan a path. Save them for mazes with many ROSE distractors near the right answer.',
    pl:
      'Masz 3 podpowiedzi na sesję. Każde stuknięcie pulsuje celem CYJAN przez ok. 1 sekundę, abyś mógł zaplanować trasę. Zachowaj je na labirynty z wieloma RÓŻOWYMI pułapkami przy poprawnej odpowiedzi.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each CYAN reach builds your session streak. Reaching CYAN in every round unlocks the post-shell review with explanations of any ROSE bumps.',
    pl:
      'Pomiń liczy się jako błąd. Każde dotarcie do CYJAN buduje serię w sesji. Dotarcie do CYJAN we wszystkich rundach odblokowuje przegląd po sesji z wyjaśnieniami uderzeń w RÓŻOWE.',
  },
  l1Pattern: {
    en:
      'Vocab-speed under spatial pressure. Polish learners often slow on multi-syllable Latin-root distractors that look like Polish cognates ("eventual" vs "ostateczny"); navigating past ROSE tokens trains fast rejection of false friends.',
    pl:
      'Szybkość słownictwa pod presją przestrzeni. Polscy uczniowie zwalniają na wielosylabowych pułapkach łacińskich, podobnych do polskich („eventual" vs „ostateczny"); omijanie RÓŻOWYCH żetonów uczy szybkiego odrzucania fałszywych przyjaciół.',
  },
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

const ACCENT = '#7DD3FC';
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
const MZ_REVIEW_ACCENT = '#7DD3FC';
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
          color: isWrong ? '#FB7185' : '#7DD3FC',
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
              border: `1px solid ${showCorrect ? '#7DD3FC88' : showWrong ? '#FB718588' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? '#7DD3FC' : showWrong ? '#FB7185' : 'var(--em-text, #EDE6FF)',
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
  time = 'night',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const activePuzzle: ArcadePuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : DEMO_PUZZLE;
  const persisted = useShellProgress('mazechase');

  const [roundIdx, setRoundIdx] = useState(0);
  const [solved, setSolved] = useState<boolean[]>(() => activePuzzle.rounds.map(() => false));
  const [pos, setPos] = useState<Cell>({ r: 1, c: 1 });
  const [tokens, setTokens] = useState<Token[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintActive, setHintActive] = useState(false);
  const [missCount, setMissCount] = useState(0);
  const [trail, setTrail] = useState<Cell[]>([]);
  const moveRef = useRef<Cell>({ r: 1, c: 1 });

  const cur = activePuzzle.rounds[roundIdx];
  // Belt-and-suspenders gap-mask: if the prompt sentence literally contains
  // the answer-word (or a close morphological variant), substitute with `___`
  // before render. The adapter layer should already do this, but on the
  // word-tile shells (#19) we double-guard inside the shell so a leak here
  // can never reach the learner. See lib/exercise-adapters.ts → maskAnswerInPrompt.
  const safePrompt = cur ? maskAnswerInPrompt(cur.prompt, cur.options[cur.answerIndex]) : '';
  const completed = solved.every(Boolean);
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
      brief: 'Steer the lantern with arrow keys. Reach the cyan token, dodge the rose ones.',
      brief_pl: 'Strzałkami prowadź latarnię. Dotrzyj do cyjanowego żetonu, omijaj różowe.',
      detail: 'You drive a lantern through cobbled backstreets. Use the arrow keys (or swipe on touch). Each round drops one cyan token (the right answer) and several rose tokens (distractors). Touching cyan solves the round; rose costs a life.',
      detail_pl: 'Prowadzisz latarnię przez brukowane uliczki. Używaj strzałek (lub przesunięć na dotyku). W każdej rundzie pojawia się jeden cyjanowy żeton (poprawna odpowiedź) i kilka różowych (pułapki). Dotknięcie cyjanowego rozwiązuje rundę; różowy kosztuje życie.',
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
    setTrail([]);
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
    if (forcedState || completed) return;
    const cur2 = moveRef.current;
    const next: Cell = { r: cur2.r, c: cur2.c };
    if (d === 'up') next.r -= 1;
    if (d === 'down') next.r += 1;
    if (d === 'left') next.c -= 1;
    if (d === 'right') next.c += 1;
    if (!isOpen(next.r, next.c)) return;
    moveRef.current = next;
    setPos(next);
    setTrail(prev => [next, ...prev.slice(0, 7)]);
    // Check token at next.
    const t = tokens.find(t => t.cell.r === next.r && t.cell.c === next.c);
    if (!t) return;
    if (t.isAnswer) {
      setFeedback('correct');
      setSolved(prev => prev.map((v, i) => i === roundIdx ? true : v));
      setTokens(prev => prev.filter(x => x !== t));
      window.setTimeout(() => {
        if (roundIdx + 1 < activePuzzle.rounds.length) setRoundIdx(i => i + 1);
      }, 1100);
    } else {
      setFeedback('wrong');
      setMissCount(c => c + 1);
      tip.recordWrong({
        questionId: cur.id,
        studentAnswer: t.word,
        correctAnswer: cur.options[cur.answerIndex],
        explanationPL: cur.hint_pl,
        exerciseId: cur.exerciseId,
      });
      setTokens(prev => prev.filter(x => x !== t));
      window.setTimeout(() => setFeedback(null), 700);
    }
    // Ricky CD-fix (2026-05-03 hotfix): dep is cur?.id (stable string), NOT
    // cur (object). When cur's object identity churned across parent
    // re-renders, moveOne kept getting a new reference, the keyboard-listener
    // useEffect kept tearing down + re-attaching, and any in-flight key event
    // could be processed against a stale closure. Stabilising on cur.id keeps
    // the listener attached and the closure reads the latest tokens/cur from
    // the render scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, roundIdx, cur?.id, activePuzzle.rounds.length, completed, forcedState]);

  // Keyboard.
  useEffect(() => {
    if (forcedState) return;
    const handler = (e: KeyboardEvent) => {
      const map: Record<string, Dir | undefined> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
        W: 'up', S: 'down', A: 'left', D: 'right',
      };
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
    window.setTimeout(() => setHintActive(false), 3000);
  };

  const skipRound = (): void => {
    if (roundIdx + 1 < activePuzzle.rounds.length) setRoundIdx(i => i + 1);
  };

  const reset = (): void => {
    setRoundIdx(0);
    setSolved(activePuzzle.rounds.map(() => false));
    setFeedback(null);
    setHintsUsed(0);
    setMissCount(0);
    tip.reset();
    setTrail([]);
  };

  const grad = time === 'day'
    ? 'linear-gradient(180deg, #2A1450 0%, #5B2480 100%)'
    : 'linear-gradient(180deg, #02010C 0%, #0F0824 60%, #1F0E3A 100%)';

  const CELL = 38;
  const W = COLS * CELL;
  const H = ROWS * CELL;

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
      role="application"
      aria-label="Maze chase practice, the Backstreets"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <style>{`
        @keyframes em-mz-glow {
          0%, 100% { filter: drop-shadow(0 0 6px ${ACCENT}); }
          50% { filter: drop-shadow(0 0 16px ${ACCENT}) drop-shadow(0 0 4px #FBBF24); }
        }
        @keyframes em-mz-token-pulse {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.12); opacity: 1; }
        }
        @keyframes em-mz-rise {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes em-mz-collected {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        @media (max-width: 768px) {
          .em-mz-side { display: none !important; }
          .em-mz-layout { grid-template-columns: 1fr !important; padding: 16px !important; }
          .em-mz-dpad { display: grid !important; }
        }
        .em-mz-dpad { display: none; }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{liveStatus}</div>

      {/* Backstreet scene */}
      <div style={{ position: 'absolute', inset: 0, background: grad }} />
      {/* Old building silhouettes */}
      <svg viewBox="0 0 1200 400" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '60%', opacity: 0.45 }}>
        <path d="M0 400 L0 220 L60 220 L60 180 L120 180 L120 240 L180 240 L180 200 L260 200 L260 160 L320 160 L320 220 L380 220 L380 180 L440 180 L440 250 L520 250 L520 200 L580 200 L580 240 L640 240 L640 180 L720 180 L720 220 L800 220 L800 250 L880 250 L880 200 L940 200 L940 240 L1020 240 L1020 200 L1100 200 L1100 240 L1200 240 L1200 400 Z" fill="#0E0A1A" />
        {Array.from({ length: 30 }).map((_, i) => (
          <rect key={i} x={50 + i * 38} y={170 + (i % 3) * 30} width="6" height="8" fill="#FBBF24" opacity={0.5 + (i % 3) * 0.15} />
        ))}
      </svg>
      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

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

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, position: 'relative' }}>
            <div style={{ width: '100%', maxWidth: W, aspectRatio: `${W} / ${H}`, position: 'relative' }}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{
                width: '100%', height: '100%',
                background: '#0A0518',
                borderRadius: 8,
                border: `1px solid ${ACCENT}33`,
                boxShadow: 'inset 0 0 32px rgba(0,0,0,0.85)',
              }}>
                {/* Cobblestones for paths — single subtle dot per cell so the
                    grid stays readable. Previous 4-dot-per-cell pattern read as
                    "dotted purple noise" at viewport scale (CD audit #20). */}
                <defs>
                  <pattern id="mz-cobble" width="38" height="38" patternUnits="userSpaceOnUse">
                    <rect width="38" height="38" fill="#1A1430" />
                    <circle cx="19" cy="19" r="2" fill="#2A1F4A" />
                  </pattern>
                </defs>
                {/* Walls (buildings) — high-contrast outline so the corridor
                    structure is obvious at a glance. Previous stroke
                    rgba(125,211,252,0.06) was effectively invisible. */}
                {MAZE.map((row, r) => row.map((v, c) => (
                  v === 1 ? (
                    <rect
                      key={`${r},${c}`}
                      x={c * CELL} y={r * CELL}
                      width={CELL} height={CELL}
                      fill="#1B0F36"
                      stroke="rgba(125,211,252,0.32)"
                      strokeWidth="1"
                    />
                  ) : (
                    <rect
                      key={`${r},${c}`}
                      x={c * CELL} y={r * CELL}
                      width={CELL} height={CELL}
                      fill="url(#mz-cobble)"
                    />
                  )
                )))}

                {/* Lamplight pools — REMOVED.
                    Previous implementation: 4 yellow circles (#FBBF24) at
                    r=CELL*0.9 (~34px) with mix-blend-mode:screen pulsing to
                    opacity 0.85. Over the dark maze, screen-blend caused them
                    to bloom into the translucent yellow blob artefacts Mike
                    flagged ("looks bad and looks like its glitching"). The
                    art-direction pass (#0) will add proper themed lamp-post
                    sprites; until then the pools are off so the grid reads. */}

                {/* Trail behind player */}
                {trail.map((t, i) => (
                  <circle key={i}
                    cx={t.c * CELL + CELL / 2}
                    cy={t.r * CELL + CELL / 2}
                    r={CELL * 0.18}
                    fill={ACCENT}
                    opacity={(7 - i) * 0.06}
                  />
                ))}

                {/* Tokens — icon-only inside maze cell, label rendered as
                    floating HTML nameplate beside (Orchard-Square pattern, #20).
                    SMART POSITIONING (Ricky 2026-05-03 fix for Mike playtest):
                    label direction (above/below/left/right) is chosen per-token
                    based on which side has at least 1.6 cells of breathing
                    room. Previous implementation always pushed labels DOWN by
                    CELL*1.55, which for tokens in the bottom rows produced
                    nameplates clipped at or pushed below the maze grid. */}
                {tokens.map((t, i) => {
                  const cx = t.cell.c * CELL + CELL / 2;
                  const cy = t.cell.r * CELL + CELL / 2;
                  const showHint = hintActive && t.isAnswer;
                  const labelColor = t.isAnswer ? ACCENT : '#FB7185';
                  // Choose connector direction. Prefer DOWN, then UP, then
                  // RIGHT, then LEFT — but only pick a direction that fits
                  // entirely inside the maze SVG.
                  const NEED = CELL * 1.55;
                  const downOk = cy + NEED < H - 4;
                  const upOk = cy - NEED > 4;
                  const rightOk = cx + NEED < W - 4;
                  const leftOk = cx - NEED > 4;
                  const dir: 'down' | 'up' | 'right' | 'left' =
                    downOk ? 'down' : upOk ? 'up' : rightOk ? 'right' : leftOk ? 'left' : 'down';
                  const lineFrom = {
                    x: cx + (dir === 'right' ? CELL * 0.32 : dir === 'left' ? -CELL * 0.32 : 0),
                    y: cy + (dir === 'down' ? CELL * 0.32 : dir === 'up' ? -CELL * 0.32 : 0),
                  };
                  const lineTo = {
                    x: cx + (dir === 'right' ? NEED - 2 : dir === 'left' ? -(NEED - 2) : 0),
                    y: cy + (dir === 'down' ? NEED - 2 : dir === 'up' ? -(NEED - 2) : 0),
                  };
                  return (
                    <g key={`tok-${i}`}>
                      {/* Dotted connector token → label (subtle, low-alpha) */}
                      <line x1={lineFrom.x} y1={lineFrom.y} x2={lineTo.x} y2={lineTo.y}
                        stroke={labelColor} strokeWidth="0.8"
                        strokeDasharray="1.5 2" opacity="0.55" />
                      {/* Token icon inside the cell */}
                      <g style={{
                        transformOrigin: `${cx}px ${cy}px`,
                        animation: 'em-mz-token-pulse 1.6s var(--em-ease) infinite',
                      }}>
                        {showHint && (
                          <circle cx={cx} cy={cy} r={CELL * 0.5} fill="none" stroke="#FBBF24" strokeWidth="1.6" />
                        )}
                        <circle cx={cx} cy={cy} r={CELL * 0.22} fill={labelColor} />
                        <circle cx={cx} cy={cy} r={CELL * 0.1} fill="#0E0A1A" opacity="0.55" />
                      </g>
                    </g>
                  );
                })}

                {/* Player lantern — halo radius reduced from 0.95 to 0.55 so
                    it no longer blooms across neighbouring cells (same bloom
                    bug class as the removed lamplight pools). */}
                <g style={{ animation: 'em-mz-glow 1.8s var(--em-ease) infinite' }}>
                  <circle
                    cx={pos.c * CELL + CELL / 2}
                    cy={pos.r * CELL + CELL / 2}
                    r={CELL * 0.55}
                    fill={ACCENT}
                    opacity={0.16}
                    style={{ transition: 'cx 200ms var(--em-ease), cy 200ms var(--em-ease)' }}
                  />
                  <circle
                    cx={pos.c * CELL + CELL / 2}
                    cy={pos.r * CELL + CELL / 2}
                    r={CELL * 0.3}
                    fill="#FBBF24"
                    style={{ transition: 'cx 200ms var(--em-ease), cy 200ms var(--em-ease)' }}
                  />
                  <circle
                    cx={pos.c * CELL + CELL / 2}
                    cy={pos.r * CELL + CELL / 2}
                    r={CELL * 0.14}
                    fill="#FFF8E5"
                    style={{ transition: 'cx 200ms var(--em-ease), cy 200ms var(--em-ease)' }}
                  />
                </g>
              </svg>

              {/* Floating nameplate callouts — HTML overlay on top of the SVG.
                  Each nameplate is positioned in % of the maze viewBox so it
                  scales with the responsive grid. Width auto-fits content,
                  whiteSpace:nowrap, no truncation. (#20 Orchard-Square pattern.)
                  SMART POSITIONING (Ricky 2026-05-03 Mike playtest fix):
                  the label direction matches the connector direction chosen
                  in the SVG above. Labels for tokens in bottom rows now go
                  ABOVE; right-edge tokens go LEFT; etc. — guarantees the
                  pill stays inside the maze container. */}
              {tokens.map((t, i) => {
                const cxPx = (t.cell.c + 0.5) * CELL;
                const cyPx = (t.cell.r + 0.5) * CELL;
                const NEED = CELL * 1.55;
                const downOk = cyPx + NEED < H - 4;
                const upOk = cyPx - NEED > 4;
                const rightOk = cxPx + NEED < W - 4;
                const leftOk = cxPx - NEED > 4;
                const dir: 'down' | 'up' | 'right' | 'left' =
                  downOk ? 'down' : upOk ? 'up' : rightOk ? 'right' : leftOk ? 'left' : 'down';
                const labelXPx = cxPx + (dir === 'right' ? NEED : dir === 'left' ? -NEED : 0);
                const labelYPx = cyPx + (dir === 'down' ? NEED : dir === 'up' ? -NEED : 0);
                const cxPct = (labelXPx / W) * 100;
                const cyPct = (labelYPx / H) * 100;
                const labelColor = t.isAnswer ? ACCENT : '#FB7185';
                return (
                  <div
                    key={`np-${i}`}
                    style={{
                      position: 'absolute',
                      left: `${cxPct}%`,
                      top: `${cyPct}%`,
                      transform: 'translate(-50%, -50%)',
                      padding: '3px 8px',
                      background: 'rgba(14,10,26,0.92)',
                      color: '#F4EFEF',
                      fontFamily: 'var(--em-mono)',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      border: `1px solid ${labelColor}aa`,
                      borderRadius: 6,
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.55)',
                      userSelect: 'none',
                    }}
                  >{t.word}</div>
                );
              })}
            </div>

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
                fontFamily: 'var(--em-mono)', fontSize: 10, color: '#FB7185',
                letterSpacing: '0.16em',
                padding: '4px 8px',
                background: 'rgba(251,113,133,0.1)',
                border: '1px solid #FB718555',
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
                <button className="em-btn em-btn-ghost" onClick={reset}>Try another</button>
                <button className="em-btn em-btn-primary" onClick={reset}>Next district →</button>
              </div>
            </div>
          )}
          <Confetti show={completed} />
        </div>

        <div className="em-mz-side" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Progress current={solved.filter(Boolean).length} total={activePuzzle.rounds.length} accent={ACCENT} />
            <div style={{ display: 'flex', gap: 6 }}>
              <SkipButton onClick={skipRound} />
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
              <span style={{ color: ACCENT }}>CYAN = CORRECT</span>
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span aria-hidden="true" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: '50%',
                background: '#FB7185', color: '#0E0A1A',
                fontSize: 10, fontWeight: 900, lineHeight: 1,
              }}>✗</span>
              <span style={{ color: '#FB7185' }}>ROSE = WRONG</span>
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
