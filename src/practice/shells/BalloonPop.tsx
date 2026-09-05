import { ActionPlayfield3D } from './action-arcade-three';
import { useActionCompletion } from './action-arcade-completion';
import { maskAnswerInPrompt } from '../lib/exercise-adapters';
import { useArcadeEvents } from '../lib/arcade-events';
import { useActionTimers } from './action-arcade-timers';
import './action-arcade.css';
// Balloon Pop — "The Rooftop Garden" district.
//
// Rooftop garden at dusk, city lights below. Balloons drift upward from
// the railing, each carrying an answer chip. The student is shown a
// prompt; tap the balloon with the correct answer before it floats off
// the top of the screen. Balloons gently wobble side-to-side as they
// rise; correct → confetti burst, wrong → balloon deflates with a hiss.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import { buildSafeHint } from '../lib/safeHint';
import '../styles/shells/balloonpop.css';

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

// Rooftop Garden · Balloon Pop — full bilingual instruction copy.
const BALLOONPOP_INSTRUCTIONS: FullInstructions = {
  "whatYouDo": {
    "en": [
      "Read the clue and launch the balloons. Pop the balloon holding the matching word."
    ],
    "pl": [
      "Przeczytaj wskazówkę i wypuść balony. Przebij balon z właściwym słowem."
    ]
  },
  "controls": {
    "en": [
      "Tap a balloon or focus it with Tab and press Enter. Pause any time. Three wind freezes hold balloons for four seconds each."
    ],
    "pl": [
      "Stuknij balon albo wybierz go Tab i naciśnij Enter. Możesz zatrzymać grę. Trzy zamrożenia wiatru zatrzymują balony na cztery sekundy."
    ]
  },
  "rightWrongSkip": {
    "en": [
      "Wrong words deflate. Unanswered balloons return, so the clue remains solvable. Skip switches to another unsolved clue."
    ],
    "pl": [
      "Złe słowa tracą powietrze. Balony bez odpowiedzi wracają. Pomiń przenosi do innej nierozwiązanej wskazówki."
    ]
  },
  "hintMechanic": {
    "en": "Use the limited Hint button for help with the current clue.",
    "pl": "Użyj ograniczonej liczby podpowiedzi do aktualnej wskazówki."
  },
  "scoring": {
    "en": "100 arcade points per correct pop; 150 inside the golden bonus band while the wind is moving.",
    "pl": "100 punktów za dobre przebicie; 150 w złotej strefie, gdy wiatr jest w ruchu."
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

export interface BalloonPopShellProps {
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
  /** D3-BalloonPop (Ricky wave-4, 2026-05-02): per-balloon pop review. */
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
    { id: 'bp1', prompt: 'A garden on top of a building.',
      options: ['rooftop', 'cellar', 'basement', 'pavement'], answerIndex: 0,
      hint: "Where you'd grow herbs above the city.", hint_pl: 'dach' },
    { id: 'bp2', prompt: 'A small platform you can stand on outside a flat.',
      options: ['balcony', 'gutter', 'spire', 'stoop'], answerIndex: 0,
      hint: 'You step outside but stay high up.', hint_pl: 'balkon' },
    { id: 'bp3', prompt: 'Twinkly tiny lights strung overhead.',
      options: ['fairy lights', 'lanterns', 'beacons', 'spotlights'], answerIndex: 0,
      hint: 'Wedding patios and Christmas trees use them.', hint_pl: 'lampki choinkowe' },
    { id: 'bp4', prompt: 'A railing along the edge of a roof.',
      options: ['gable', 'parapet', 'plinth', 'awning'], answerIndex: 1,
      hint: 'Low wall stopping you from falling off.', hint_pl: 'attyka' },
    { id: 'bp5', prompt: 'A potted shrub placed on a terrace.',
      options: ['planter', 'fender', 'gable', 'lintel'], answerIndex: 0,
      hint: 'Big container for plants.', hint_pl: 'donica' },
    { id: 'bp6', prompt: 'View of city lights from above.',
      options: ['vista', 'cellar', 'cabinet', 'attic'], answerIndex: 0,
      hint: 'A scenic outlook.', hint_pl: 'widok' },
  ],
};

const ACCENT = '#FB7185';
const BALLOON_PALETTE = ['#FB7185', '#FBBF24', '#7DD3FC', '#A78BFA', '#34D399', '#E879F9'];

interface Balloon {
  id: number;
  optionIdx: number;
  word: string;
  isAnswer: boolean;
  // % positions
  x: number;        // horizontal start (0-100)
  bottom: number;   // current % from bottom
  speed: number;    // % per tick
  wobble: number;   // px wobble amplitude
  phase: number;    // wobble phase offset
  color: string;
  state: 'rising' | 'popped' | 'deflated' | 'escaped';
}

// ─────────────────────────────────────────────────────────────────────────
// renderBalloonPopReviewItem — per-round locked render for PracticeReview.
// Rooftop scoreboard: round number + question + balloon options with
// student's pop + correct balloon highlighted.
// ─────────────────────────────────────────────────────────────────────────
const BP_REVIEW_ACCENT = '#FB7185';
export function renderBalloonPopReviewItem(
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
        ? 'linear-gradient(180deg, rgba(251,113,133,0.10), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(52,211,153,0.08), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(52,211,153,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${BP_REVIEW_ACCENT}22`, color: BP_REVIEW_ACCENT,
          border: `1px solid ${BP_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          BALLOON {String(roundNumber).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(52,211,153,0.18)',
          color: isWrong ? '#FB7185' : '#34D399',
        }}>
          {isWrong ? '✗ ESCAPED · UCIEKŁ' : '✓ POPPED · TRZASK'}
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
                ? 'rgba(52,211,153,0.18)'
                : showWrong
                  ? 'rgba(251,113,133,0.18)'
                  : 'rgba(245,239,255,0.04)',
              border: `1px solid ${showCorrect ? '#34D39988' : showWrong ? '#FB718588' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? '#34D399' : showWrong ? '#FB7185' : 'var(--em-text, #EDE6FF)',
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

export const BalloonPopShell: React.FC<BalloonPopShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  // Kelly Tier-2 (2026-05-02): defensive props guard.
  const propsInvalid = !forcedState && puzzle !== undefined && (!puzzle.rounds || puzzle.rounds.length === 0);
  const activePuzzle: ArcadePuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : DEMO_PUZZLE;
  const persisted = useShellProgress('balloonpop');
  const arcadeEvent = useArcadeEvents();
  const { later, cancel: cancelActionTimers } = useActionTimers();

  // Kelly Tier-2 (2026-05-02): JS-side prefers-reduced-motion gate. The
  // CSS @media rule (global.css §1395) freezes keyframe-driven animation,
  // but our requestAnimationFrame loop in `tick` keeps physically moving
  // the balloons up the canvas — that's a JS state change CSS can't reach.
  // When motion-reduce is on, we still spawn the balloons (so the player
  // can tap them) but we skip the rAF loop entirely; the round respawn is
  // also skipped since balloons don't drift off.
  const reducedMotionRef = useRef<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'balloonpop',
      brief: BALLOONPOP_INSTRUCTIONS.whatYouDo.en[0],
      brief_pl: BALLOONPOP_INSTRUCTIONS.whatYouDo.pl[0],
      detail: BALLOONPOP_INSTRUCTIONS.controls.en.join(' ') + ' ' + BALLOONPOP_INSTRUCTIONS.rightWrongSkip.en.join(' '),
      detail_pl: BALLOONPOP_INSTRUCTIONS.controls.pl.join(' ') + ' ' + BALLOONPOP_INSTRUCTIONS.rightWrongSkip.pl.join(' '),
      fullInstructions: BALLOONPOP_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  const [roundIdx, setRoundIdx] = useState(0);
  const [solved, setSolved] = useState<boolean[]>(() => activePuzzle.rounds.map(() => false));
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintBalloonId, setHintBalloonId] = useState<number | null>(null);
  const [missCount, setMissCount] = useState(0);
  const balloonIdSeed = useRef(1);
  const [launched, setLaunched] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [freezeCharges, setFreezeCharges] = useState(3);
  const [points, setPoints] = useState(0);
  const [reward, setReward] = useState('Pop in the golden band for a +50 skill bonus.');
  const roundLocked = useRef(false);
  const tickRef = useRef<number | null>(null);
  const spawnRoundRef = useRef<() => void>(() => {});
  const respawnTimerRef = useRef<number | null>(null);
  // Kelly Tier-2 (2026-05-02): focus-trap refs for the completion overlay.
  const tryAnotherBtnRef = useRef<HTMLButtonElement | null>(null);
  const nextDistrictBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

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
      });
    } : undefined,
  });

  useEffect(() => {
    if (forcedState) return;
    const done = solved.filter(Boolean).length;
    persisted.save({ progress: done / activePuzzle.rounds.length, lastState: completed ? 'complete' : 'active' });
    if (completed) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [solved, completed, forcedState]);

  // Spawn balloons for this round.
  const spawnRound = useCallback(() => {
    if (forcedState) return;
    if (!cur) return;
    const opts = cur.options;
    // Lay out options across horizontal positions.
    const positions = opts.map((_, i) => 12 + (i * 78) / Math.max(1, opts.length - 1));
    // Kelly Tier-2 (2026-05-02): reduced-motion → freeze balloons mid-canvas
    // (no upward drift, no wobble) so the player still has visible targets.
    const reduce = reducedMotionRef.current;
    const newBalloons: Balloon[] = opts.map((opt, oi) => ({
      id: balloonIdSeed.current++,
      optionIdx: oi,
      word: opt,
      isAnswer: oi === cur.answerIndex,
      x: positions[oi],
      bottom: reduce ? 35 + (oi % 2) * 18 : -8 - oi * 8,
      speed: reduce ? 0 : 0.18 + Math.random() * 0.08,
      wobble: reduce ? 0 : 6 + Math.random() * 6,
      phase: Math.random() * Math.PI * 2,
      color: BALLOON_PALETTE[oi % BALLOON_PALETTE.length],
      state: 'rising',
    }));
    roundLocked.current = false; setLaunched(false);
    setBalloons(newBalloons.map(b => ({ ...b, bottom: reduce ? b.bottom : 3 + b.optionIdx * 7 })));
    setFeedback(null);
  }, [cur, forcedState]);

  // Keep latest spawnRound reachable from stable effects/timers without
  // re-subscribing them on every identity change (which would otherwise
  // tear down the rAF loop and reset balloons to spawn position each render).
  useEffect(() => { spawnRoundRef.current = spawnRound; }, [spawnRound]);

  useEffect(() => {
    spawnRoundRef.current();
  }, [roundIdx]);

  // Animation tick — moves balloons upward.
  useEffect(() => {
    if (forcedState || !launched || frozen || completed || roundLocked.current) return;
    // Kelly Tier-2 (2026-05-02): JS-side reduced-motion gate. CSS can't stop
    // requestAnimationFrame; we skip the entire physics loop when the user
    // has motion-reduce set. Balloons remain frozen at their spawn position
    // so the player can still tap them at their leisure.
    if (reducedMotionRef.current) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(3, (now - last) / 16.67);
      last = now;
      setBalloons(prev => {
        const next = prev.map(b => {
          if (b.state !== 'rising') {
            return b;
          }
          const newBottom = b.bottom + b.speed * dt;
          if (newBottom > 105) {
            if (b.isAnswer) {
              // The answer escaped — mark missed (round still solvable on respawn).
              return { ...b, state: 'escaped' as const, bottom: 110 };
            }
            return { ...b, state: 'escaped' as const, bottom: 110 };
          }
          return { ...b, bottom: newBottom };
        });
        // If all balloons in this round have escaped/popped/deflated, respawn.
        const stillRising = next.some(b => b.state === 'rising');
        if (!stillRising && next.length > 0 && respawnTimerRef.current === null) {
          // Round not yet solved — respawn after brief pause. Guard against
          // queueing a fresh timer every frame (which would reset balloons
          // to their spawn position dozens of times in a row).
          respawnTimerRef.current = later(() => {
            respawnTimerRef.current = null;
            spawnRoundRef.current();
          }, 600);
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    tickRef.current = raf;
    return () => {
      cancelAnimationFrame(raf);
      if (respawnTimerRef.current !== null) {
        window.clearTimeout(respawnTimerRef.current);
        respawnTimerRef.current = null;
      }
    };
  }, [forcedState, launched, frozen, completed, feedback]);

  useEffect(() => {
    if (forcedState === 'empty') { setSolved(activePuzzle.rounds.map(() => false)); setBalloons([]); }
    if (forcedState === 'active') {
      setBalloons(cur.options.map((opt, oi) => ({
        id: oi + 1, optionIdx: oi, word: opt, isAnswer: oi === cur.answerIndex,
        x: 14 + oi * 24, bottom: 30 + oi * 12, speed: 0, wobble: 4, phase: oi,
        color: BALLOON_PALETTE[oi % BALLOON_PALETTE.length], state: 'rising',
      })));
    }
    if (forcedState === 'correct') { setFeedback('correct'); }
    if (forcedState === 'wrong') { setFeedback('wrong'); }
    if (forcedState === 'complete') { setSolved(activePuzzle.rounds.map(() => true)); }
  }, [forcedState]);

  const pop = (id: number): void => {
    if (forcedState || roundLocked.current || (!launched && !reducedMotionRef.current)) return;
    const b = balloons.find(b => b.id === id);
    if (!b || b.state !== 'rising') return;
    if (b.isAnswer) {
      roundLocked.current = true; const bonus = b.bottom >= 28 && b.bottom <= 60 && !frozen && !reducedMotionRef.current;
      const earned = bonus ? 150 : 100; setPoints(p => p + earned); setReward(bonus ? 'GOLDEN BAND! +150 points' : '+100 points · rooftop cleared'); arcadeEvent({ type: 'correct', points: earned });
      setBalloons(prev => prev.map(x => x.id === id ? { ...x, state: 'popped' } : x));
      setFeedback('correct');
      setSolved(prev => prev.map((v, i) => i === roundIdx ? true : v));
      later(() => {
        const nextRound = solved.findIndex((done, i) => !done && i !== roundIdx);
        if (nextRound >= 0) {
          setRoundIdx(nextRound);
        }
      }, 1200);
    } else {
      arcadeEvent({ type: 'incorrect' });
      setBalloons(prev => prev.map(x => x.id === id ? { ...x, state: 'deflated' } : x));
      setFeedback('wrong');
      setMissCount(c => c + 1);
      tip.recordWrong({
        questionId: cur.id,
        studentAnswer: b.word,
        correctAnswer: cur.options[cur.answerIndex],
        explanationPL: cur.hint_pl,
        exerciseId: cur.exerciseId,
      });
      later(() => setFeedback(null), 800);
    }
  };

  const useHint = (): void => {
    if (hintsUsed >= 3) return;
    const ans = balloons.find(b => b.isAnswer && b.state === 'rising');
    if (!ans) return;
    setHintBalloonId(ans.id);
    setHintsUsed(h => h + 1);
    later(() => setHintBalloonId(null), 2400);
  };

  const skipRound = (): void => {
    const nextRound = solved.findIndex((done, i) => !done && i !== roundIdx); if (nextRound >= 0) setRoundIdx(nextRound);
  };

  const reset = (): void => {
    cancelActionTimers();
    arcadeEvent({ type: 'reset' });
    roundLocked.current = false; setFreezeCharges(3); setFrozen(false); setLaunched(false); setPoints(0); spawnRoundRef.current();
    setRoundIdx(0);
    setSolved(activePuzzle.rounds.map(() => false));
    setBalloons([]); later(() => spawnRoundRef.current(), 0);
    setFeedback(null);
    setHintsUsed(0);
    setMissCount(0);
    tip.reset();
  };

  const grad = time === 'day'
    ? 'linear-gradient(180deg, #2A1450 0%, #6E4FB8 60%, #C58BD9 100%)'
    : time === 'night'
      ? 'linear-gradient(180deg, #02010C 0%, #1F0E3A 50%, #4B1E78 100%)'
      : 'linear-gradient(180deg, #1F1240 0%, #5B2480 60%, #C5598E 100%)';

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the completion overlay.
  // Two focusable buttons (Try another / Next district →) — Tab cycles
  // forward, Shift+Tab cycles backward, focus restored on close.
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

  const liveStatus = completed
    ? 'The garden settles. All balloons popped.'
    : feedback === 'correct'
      ? 'Correct balloon popped.'
      : feedback === 'wrong'
        ? `Wrong balloon. ${cur.options[cur.answerIndex]} is the answer.`
        : '';

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div
      className="em-shell em-shell-balloonpop"
      role="application"
      aria-label="Balloon pop practice, the Rooftop Garden"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {/* Shell-scoped keyframes/responsive rules → src/practice/styles/shells/balloonpop.css */}

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{liveStatus}</div>

      {/* Sky scene — Ricky 2026-05-02 (#15 audit pass): every decorative layer
          below gets pointerEvents:none + zIndex:0. The functional layout
          (top bar / canvas / side panel) lives at relative z-index inside the
          em-bp-layout grid (zIndex implicit auto > 0), so the city silhouette
          and 60 twinkle dots no longer sit between taps and the balloon-pop
          buttons. */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: grad }} />
      {/* Distant city silhouette at bottom */}
      <svg aria-hidden="true" viewBox="0 0 1200 200" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 80, left: 0, width: '100%', height: '24%', opacity: 0.55, zIndex: 0, pointerEvents: 'none' }}>
        <path
          d="M0 200 L0 100 L80 100 L80 60 L120 60 L120 90 L180 90 L180 40 L240 40 L240 70 L300 70 L300 30 L340 30 L340 60 L400 60 L400 80 L460 80 L460 50 L520 50 L520 90 L580 90 L580 60 L640 60 L640 30 L700 30 L700 70 L760 70 L760 50 L820 50 L820 90 L880 90 L880 60 L940 60 L940 100 L1000 100 L1000 70 L1060 70 L1060 90 L1120 90 L1120 110 L1200 110 L1200 200 Z"
          fill="#0E0A1A"
        />
      </svg>
      {/* City lights twinkling */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {Array.from({ length: 60 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${(i * 7.13) % 100}%`,
            bottom: `${20 + ((i * 11) % 18)}%`,
            width: 2, height: 2,
            background: i % 4 === 0 ? '#FBBF24' : '#F4E4A1',
            borderRadius: '50%',
            opacity: 0.5,
            animation: `em-bp-twinkle ${2.5 + (i % 3)}s var(--em-ease) ${(i * 0.07)}s infinite`,
          }} />
        ))}
      </div>
      {/* Fairy lights string at top */}
      <svg style={{ position: 'absolute', top: 50, left: 0, width: '100%', height: 60, pointerEvents: 'none', opacity: 0.85 }} preserveAspectRatio="none" viewBox="0 0 1200 60">
        <path d="M0 4 Q 300 30 600 12 T 1200 8" stroke={ACCENT} strokeWidth="0.6" fill="none" opacity="0.6" />
        {Array.from({ length: 24 }).map((_, i) => {
          const x = i * 50 + 20;
          const y = 4 + Math.sin(i * 0.4) * 14;
          return (
            <circle key={i} cx={x} cy={y} r="3" fill={['#FBBF24', '#FB7185', '#7DD3FC'][i % 3]} style={{ filter: `drop-shadow(0 0 6px ${['#FBBF24', '#FB7185', '#7DD3FC'][i % 3]})` }} opacity={0.85} />
          );
        })}
      </svg>
      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div className="em-bp-layout" style={{
        position: 'relative', display: 'grid',
        gridTemplateColumns: '1.5fr 1fr', gap: 24, padding: 32,
        height: '100%', boxSizing: 'border-box',
      }}>
        <div className="em-card" style={{
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, rgba(27,15,54,0.7) 0%, rgba(10,5,24,0.85) 100%)',
          backdropFilter: 'blur(2px)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--em-line)', position: 'relative', zIndex: 3 }}>
            <AmbientAudioPlayer shellSlug="balloonpop" />
            <Nameplate
              district="The Rooftop Garden"
              subtitle="Balloon pop · Łap balon · catch the right answer before it floats away"
              accent={ACCENT}
              icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><ellipse cx="11" cy="9" rx="6" ry="7" stroke={ACCENT} strokeWidth="1.6" /><path d="M11 16 L11 20 M9 21 L13 21" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" /></svg>}
            />
          </div>

          {/* Prompt bar */}
          <div style={{
            margin: '14px 24px 0',
            padding: '12px 18px',
            background: 'linear-gradient(90deg, rgba(251,113,133,0.16), rgba(251,113,133,0.02))',
            border: `1px solid ${ACCENT}55`,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 14,
            position: 'relative', zIndex: 3,
            animation: 'em-bp-rise 320ms var(--em-ease)',
          }} key={`p-${roundIdx}`}>
            <div style={{
              fontFamily: 'var(--em-mono)', fontSize: 11, color: ACCENT, letterSpacing: '0.18em',
              padding: '4px 8px', border: `1px solid ${ACCENT}66`, borderRadius: 4, flexShrink: 0,
            }}>RND {String(roundIdx + 1).padStart(2, '0')}</div>
            <div className="em-decor" style={{ fontSize: 18, color: 'var(--em-text)', flex: 1, lineHeight: 1.3 }}>{maskAnswerInPrompt(cur.prompt, cur.options[cur.answerIndex])}</div>
          </div>

          <div className="action-arcade-hud" style={{ margin: '12px 24px 0' }}><div><strong>{points} POINTS</strong><small>{reward}</small></div><button disabled={completed || roundLocked.current} onClick={() => setLaunched(v => !v)}>{launched ? 'Pause' : 'Launch balloons'}</button><button disabled={!launched || frozen || freezeCharges === 0 || completed || roundLocked.current} onClick={() => { setFreezeCharges(n => n - 1); setFrozen(true); later(() => setFrozen(false), 4000); }}>{frozen ? 'Wind frozen · 4s' : `Freeze wind · ${freezeCharges}`}</button></div>
          {/* Garden floor area (where balloons fly through).
              Kelly Tier-2 (2026-05-02): made keyboard-focusable so non-mouse
              users can at least land focus here and Tab into the per-balloon
              <button> elements (each balloon is already a real button with
              an aria-label).
              No Space/Enter "tap at focused position" fallback: balloons
              physically drift across the canvas, so there's no stable
              "focused position" to fire at — the per-balloon buttons (which
              do receive focus on Tab) ARE the keyboard interaction. */}
          <ActionPlayfield3D kind="balloonpop" data={{reducedMotion:reducedMotionRef.current,running:launched&&!frozen,onPick:pop,actors:balloons.map(b=>({id:b.id,x:b.x,y:b.bottom,label:b.word,color:b.color,state:b.state,selected:hintBalloonId===b.id,enabled:b.state==='rising'&&(launched||reducedMotionRef.current)&&!roundLocked.current}))}} controls={<>{balloons.filter(b=>b.state==='rising').map(b=><button key={b.id} disabled={(!launched&&!reducedMotionRef.current)||roundLocked.current} onClick={()=>pop(b.id)}>{b.word}</button>)}</>}><div
            className="em-bp-canvas"
            tabIndex={0}
            role="group"
            aria-label="Rooftop garden canvas — balloons rise from the railing; Tab to move between balloon buttons, Space or Enter to pop the focused balloon"
            style={{ flex: 1, position: 'relative', overflow: 'hidden', margin: '14px 0 0' }}
          >
            <div aria-hidden="true" style={{ position: 'absolute', bottom: '28%', height: '32%', left: 0, right: 0, borderTop: '1px dashed #fbbf2480', borderBottom: '1px dashed #fbbf2480', background: 'linear-gradient(90deg,#fbbf2400,#fbbf2414,#fbbf2400)', pointerEvents: 'none' }}><span style={{ position: 'absolute', right: 12, top: 5, color: '#fde68a', font: '10px var(--em-mono)' }}>BONUS AIRSPACE +50</span></div>
            {/* Railing/parapet */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: 56,
              background: 'linear-gradient(180deg, rgba(251,113,133,0.05), rgba(0,0,0,0.4))',
              borderTop: `2px solid ${ACCENT}44`,
              pointerEvents: 'none',
            }} />
            {/* Planter pots along the railing */}
            {[15, 38, 62, 85].map((px, pi) => (
              <div key={pi} style={{
                position: 'absolute', bottom: 24, left: `${px}%`, transform: 'translateX(-50%)',
                width: 28, height: 22,
                pointerEvents: 'none',
              }}>
                <svg viewBox="0 0 28 22" width="100%" height="100%">
                  <path d="M 4 6 L 24 6 L 22 22 L 6 22 Z" fill="#3D2A18" />
                  <ellipse cx="14" cy="6" rx="10" ry="2" fill="#1A1208" />
                  <ellipse cx="9" cy="3" rx="4" ry="3" fill="#34D399" opacity="0.8" />
                  <ellipse cx="17" cy="2" rx="5" ry="3" fill="#34D399" opacity="0.7" />
                </svg>
              </div>
            ))}

            {balloons.map(b => {
              if (b.state === 'escaped') return null;
              const wobX = reducedMotionRef.current || !launched || frozen ? 0 : Math.sin(performance.now() / 800 + b.phase) * b.wobble;
              const isHinted = hintBalloonId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => pop(b.id)}
                  aria-label={`Balloon with answer ${b.word}, tap to pop`}
                  disabled={b.state !== 'rising' || (!launched && !reducedMotionRef.current) || roundLocked.current}
                  style={{
                    position: 'absolute',
                    left: `clamp(48px, calc(${b.x}% + ${wobX}px), calc(100% - 48px))`,
                    bottom: `${b.bottom}%`,
                    transform: 'translateX(-50%)',
                    width: 90, height: 130,
                    background: 'transparent', border: 'none',
                    cursor: b.state === 'rising' ? 'pointer' : 'default',
                    padding: 0,
                    minWidth: 44, minHeight: 44,
                    animation:
                      b.state === 'popped' ? 'em-bp-pop 360ms var(--em-ease) forwards'
                        : b.state === 'deflated' ? 'em-bp-deflate 480ms var(--em-ease) forwards'
                        : 'em-bp-wobble 2.4s var(--em-ease) infinite',
                    touchAction: 'manipulation',
                    // No CSS transition: rAF already drives `bottom` every
                    // frame, and a 60ms tween between rAF updates fights the
                    // state churn and produces visible micro-jitter.
                    willChange: 'transform, bottom',
                  } as React.CSSProperties}
                >
                  <svg viewBox="0 0 90 130" width="100%" height="100%" style={{ display: 'block', filter: isHinted ? `drop-shadow(0 0 12px ${ACCENT})` : `drop-shadow(0 6px 12px rgba(0,0,0,0.4))` }}>
                    {/* Balloon body */}
                    <ellipse cx="45" cy="50" rx="38" ry="46" fill={b.color} opacity={isHinted ? 1 : 0.95} />
                    <ellipse cx="35" cy="35" rx="10" ry="14" fill="rgba(255,255,255,0.35)" />
                    {/* Tie */}
                    <polygon points="42,94 48,94 45,102" fill={b.color} />
                    {/* String */}
                    <path d="M 45 102 Q 42 115 45 130" stroke="rgba(255,255,255,0.5)" strokeWidth="1" fill="none" />
                    {/* Word card */}
                    <rect x="14" y="44" width="62" height="20" rx="4" fill="rgba(14,10,26,0.85)" stroke={isHinted ? '#FBBF24' : 'rgba(0,0,0,0.4)'} strokeWidth="1" />
                    <text x="45" y="58" textAnchor="middle"
                      fontFamily="var(--em-decor)" fontSize="11" fontWeight="600"
                      fill="#FFF8E5">{b.word.length > 11 ? b.word.slice(0, 10) + '…' : b.word}</text>
                  </svg>
                  {b.state === 'popped' && (
                    <div style={{
                      position: 'absolute', top: '38%', left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 60, height: 60,
                      borderRadius: '50%',
                      background: `radial-gradient(circle, ${b.color}aa 0%, transparent 70%)`,
                      animation: 'em-bp-pop-burst 360ms var(--em-ease) forwards',
                      pointerEvents: 'none',
                    }} />
                  )}
                </button>
              );
            })}

            {missCount > 0 && (
              <div style={{
                position: 'absolute', top: 8, right: 12,
                fontFamily: 'var(--em-mono)', fontSize: 10, color: '#FB7185',
                letterSpacing: '0.16em',
                padding: '4px 8px',
                background: 'rgba(251,113,133,0.1)',
                border: '1px solid #FB718555',
                borderRadius: 4,
                zIndex: 3,
              }}>{missCount} POPPED WRONG</div>
            )}
          </div></ActionPlayfield3D>

          {completed && !onSessionComplete && (
            <div
              role="dialog"
              aria-modal="true"
              aria-live="assertive"
              aria-label="Rooftop Garden complete"
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
              <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa`, textAlign: 'center', padding: '0 16px' }}>The garden settles.</div>
              <div className="em-eyebrow">EVERY BALLOON POPPED · WSZYSTKO PĘKŁO</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button ref={tryAnotherBtnRef} type="button" className="em-btn em-btn-ghost" onClick={reset}>Restart run</button>
                <button ref={nextDistrictBtnRef} type="button" className="em-btn em-btn-primary" onClick={reset}>Play again →</button>
              </div>
            </div>
          )}
          <Confetti show={completed} />
        </div>

        <div className="em-bp-side" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
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
              <div className="em-eyebrow">Balloon log · dziennik balonów</div>
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
                    background: isDone ? 'rgba(251,113,133,0.08)' : isCurrent ? `${ACCENT}11` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isDone ? `${ACCENT}55` : isCurrent ? `${ACCENT}66` : 'var(--em-line)'}`,
                  }}>
                    <div style={{
                      width: 14, height: 18, borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
                      background: BALLOON_PALETTE[i % BALLOON_PALETTE.length], opacity: isDone ? 1 : 0.4,
                    }} />
                    <div style={{
                      fontFamily: 'var(--em-body)', fontSize: 12, color: 'var(--em-text)', flex: 1,
                      opacity: isDone ? 0.7 : 1,
                    }}>{r.prompt}</div>
                    {isDone && <div style={{ color: ACCENT, fontFamily: 'var(--em-mono)', fontSize: 10 }}>POP</div>}
                    {isCurrent && !isDone && <div style={{ color: ACCENT, fontFamily: 'var(--em-mono)', fontSize: 10 }}>NOW</div>}
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

export default BalloonPopShell;
