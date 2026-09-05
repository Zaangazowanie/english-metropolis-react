import { ActionPlayfield3D } from './action-arcade-three';
import { useActionCompletion } from './action-arcade-completion';
import { useArcadeEvents } from '../lib/arcade-events';
import { useActionTimers } from './action-arcade-timers';
import './action-arcade.css';
// FlyingFruit — "The Orchard Square" district.
// An open-air orchard market. Painted wooden baskets at the bottom edge.
// Fruits float across the screen along smooth bezier arcs (parabolas with
// hand-tuned control points so each takes a unique trajectory). Player taps
// the fruit labelled with the correct option BEFORE its arc lands it back in
// the basket on the far side.
//
// Visual identity: continuous CURVED motion. Where Airplane is straight-line
// horizontal, FlyingFruit is parabolic — fruits arc UP and over. The motion
// is the entire game; if you blink you miss it. Green accent, warm orchard
// twilight, basket weave silhouettes.
//
// Persisted progress — Convex-backed.
import { useShellProgress } from '../lib/convex-stubs';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { maskAnswerInPrompt } from '../lib/exercise-adapters';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

// Orchard Square · Flying Fruit — full bilingual instruction copy.
const FLYINGFRUIT_INSTRUCTIONS: FullInstructions = {
  "whatYouDo": {
    "en": [
      "Launch a harvest and slice the fruit with the word that matches the clue."
    ],
    "pl": [
      "Uruchom zbiory i przetnij owoc ze słowem pasującym do wskazówki."
    ]
  },
  "controls": {
    "en": [
      "In Tap mode, tap a fruit or use Tab and Enter. Switch to Blade mode to drag from empty ground across a fruit. Pause to read. Reduced motion keeps the targets still."
    ],
    "pl": [
      "W trybie Tap stuknij owoc lub użyj Tab i Enter. Włącz Blade, by przeciągać z pustej części sadu przez owoc. Możesz wstrzymać ruch, by przeczytać wskazówkę. Ograniczony ruch zatrzymuje cele."
    ]
  },
  "rightWrongSkip": {
    "en": [
      "A slice commits the word. Wrong picks and skipped harvests are recorded for review."
    ],
    "pl": [
      "Cięcie zatwierdza słowo. Złe wybory i pominięcia trafiają do powtórki."
    ]
  },
  "hintMechanic": {
    "en": "Use the limited Hint button for help with the current clue.",
    "pl": "Użyj ograniczonej liczby podpowiedzi do aktualnej wskazówki."
  },
  "scoring": {
    "en": "Correct cuts earn 100 arcade points. Slice near the top of an arc, while its gold ring is visible, for 150.",
    "pl": "Dobre cięcie daje 100 punktów. Traf na szczycie łuku przy złotym pierścieniu, aby zdobyć 150."
  },
  "l1Pattern": {
    "en": "Practise English meaning and sentence context before you make your move.",
    "pl": "Ćwicz angielskie znaczenie i kontekst zdania przed wykonaniem ruchu."
  }
};

export interface WrapperRound {
  id: string; prompt: string; options: string[]; answerIndex: number;
  hint: string; hint_pl: string; exerciseId?: string;
}
export interface WrapperPuzzle { rounds: WrapperRound[]; }

export type FlyingFruitForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface FlyingFruitShellProps {
  time?: TimeOfDay;
  state?: FlyingFruitForcedState;
  puzzle?: WrapperPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3 Wave-5 (Ricky 2026-05-02): per-fruit review payload. Fires once when
   * the orchard has been worked through.
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
    puzzle: WrapperPuzzle;
    studentPicks: Record<string, string>;
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// renderFlyingFruitReviewItem — per-fruit locked render for PracticeReview.
// Orchard scoreboard: prompt + 4 options + ✓ CAUGHT · ✗ MISSED chip.
// ─────────────────────────────────────────────────────────────────────────
const FF_REVIEW_ACCENT = '#34D399';
export function renderFlyingFruitReviewItem(
  round: WrapperRound,
  number: number,
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
        : 'linear-gradient(180deg, rgba(52,211,153,0.10), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(52,211,153,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${FF_REVIEW_ACCENT}22`, color: FF_REVIEW_ACCENT,
          border: `1px solid ${FF_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          FRUIT {String(number).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(52,211,153,0.22)',
          color: isWrong ? '#FB7185' : FF_REVIEW_ACCENT,
        }}>
          {isWrong ? '✗ MISSED · NIE ZŁAPANE' : '✓ CAUGHT · ZŁAPANE'}
        </span>
        <span aria-hidden="true" style={{ marginLeft: 'auto', fontSize: 14, opacity: 0.7 }}>🍎</span>
      </div>
      <div style={{ fontFamily: 'var(--em-decor)', fontSize: 16, lineHeight: 1.3, color: 'var(--em-text, #EDE6FF)' }}>{round.prompt}</div>
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
                ? 'rgba(52,211,153,0.20)'
                : showWrong
                  ? 'rgba(251,113,133,0.18)'
                  : 'rgba(245,239,255,0.04)',
              border: `1px solid ${showCorrect ? '#34D39988' : showWrong ? '#FB718588' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? FF_REVIEW_ACCENT : showWrong ? '#FB7185' : 'var(--em-text, #EDE6FF)',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontFamily: 'var(--em-mono)', fontSize: 9, color: FF_REVIEW_ACCENT, opacity: 0.7, minWidth: 14 }}>{String.fromCharCode(65 + oi)}</span>
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

const FF_DEMO: WrapperPuzzle = {
  rounds: [
    { id: 'apple', prompt: 'A red or green crunchy fruit on a tree.', options: ['lemon', 'apple', 'grape', 'plum'], answerIndex: 1, hint: 'A teacher\'s gift.', hint_pl: 'Po polsku: jabłko.' },
    { id: 'pear', prompt: 'A green or yellow fruit shaped like a teardrop.', options: ['pear', 'plum', 'apple', 'cherry'], answerIndex: 0, hint: 'Soft, sweet flesh.', hint_pl: 'Po polsku: gruszka.' },
    { id: 'plum', prompt: 'A small purple stone fruit, dried into prunes.', options: ['cherry', 'lemon', 'plum', 'pear'], answerIndex: 2, hint: 'Goes into jam.', hint_pl: 'Po polsku: śliwka.' },
    { id: 'cherry', prompt: 'A small bright red fruit on a long stem.', options: ['grape', 'cherry', 'plum', 'apple'], answerIndex: 1, hint: 'Two on one stem.', hint_pl: 'Po polsku: wiśnia.' },
    { id: 'grape', prompt: 'Small round fruits that grow in bunches.', options: ['cherry', 'plum', 'grape', 'pear'], answerIndex: 2, hint: 'Wine is made from these.', hint_pl: 'Po polsku: winogrono.' },
    { id: 'lemon', prompt: 'A bright yellow citrus fruit, very sour.', options: ['lemon', 'apple', 'pear', 'grape'], answerIndex: 0, hint: 'You squeeze it on fish.', hint_pl: 'Po polsku: cytryna.' },
    { id: 'orange', prompt: 'A round citrus fruit, sweet and orange-coloured.', options: ['plum', 'orange', 'pear', 'cherry'], answerIndex: 1, hint: 'Same name as the colour.', hint_pl: 'Po polsku: pomarańcza.' },
    { id: 'peach', prompt: 'A soft, fuzzy stone fruit with pink-orange skin.', options: ['apple', 'lemon', 'plum', 'peach'], answerIndex: 3, hint: 'You can blush like one.', hint_pl: 'Po polsku: brzoskwinia.' },
  ],
};

const ACCENT = '#34D399';
// Fruit colour palette by position for the SVG fill — drawn from English
// metropolis brand colours so the orchard feels part of the city even though
// the subject matter is rural.
const FRUIT_PALETTES = [
  { fill: '#FB7185', leaf: '#34D399' },  // rose-red apple
  { fill: '#FBBF24', leaf: '#34D399' },  // gold lemon
  { fill: '#A78BFA', leaf: '#34D399' },  // violet plum
  { fill: '#E879F9', leaf: '#34D399' },  // magenta cherry
];

interface FruitModel {
  optionIdx: number;
  text: string;
  // Parabolic arc parameters — start/end on the basket line, peak somewhere
  // above. `t` advances 0..1, position computed live from these.
  startX: number;
  endX: number;
  peakX: number;
  peakY: number;
  baseY: number;       // basket-line Y % (around 80)
  duration: number;    // seconds for one full arc
  paletteIdx: number;
  rot0: number;        // base rotation offset
  spin: number;        // degrees per second
  delay: number;       // staggered entry
}

function det(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Quadratic bezier evaluator. Returns position along the curve at t∈[0,1].
function bezier(t: number, p0: number, p1: number, p2: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

export const FlyingFruitShell: React.FC<FlyingFruitShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const active: WrapperPuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : FF_DEMO;
  const persisted = useShellProgress('flyingfruit');
  const arcadeEvent = useArcadeEvents();
  const { later, cancel: cancelActionTimers } = useActionTimers();
  // D3 Wave-5 (Ricky 2026-05-02): per-round student-pick log.
  const [studentPicks, setStudentPicks] = useState<Record<string, string>>({});

  const [idx, setIdx] = useState<number>(0);
  const [harvesting, setHarvesting] = useState(false);
  const [bladeMode, setBladeMode] = useState(false);
  const [harvestPoints, setHarvestPoints] = useState(0);
  const [harvestNotice, setHarvestNotice] = useState('Slice the matching word. A cut at the top of its arc earns +50.');
  const [bladeTrail, setBladeTrail] = useState<{ x: number; y: number }[]>([]);
  const swiping = useRef(false);
  const fruitLocked = useRef(false);
  const elapsedRef = useRef(0);
  const [tElapsed, setTElapsed] = useState<number>(0); // seconds since round started
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  const [pickedOption, setPickedOption] = useState<number | null>(null);
  const [score, setScore] = useState<{ right: number; wrong: number }>({ right: 0, wrong: 0 });
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [revealedHint, setRevealedHint] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  // Kelly Tier-2 (2026-05-02): JS-driven arc motion respects reduced-motion.
  // When true, we skip the rAF loop and freeze each fruit at its arc apex
  // (delay+duration/2) so options are visible, static, and tappable.
  const reduceMotion = usePrefersReducedMotion();

  const round = active.rounds[idx];
  const completed = !forcedState && idx >= active.rounds.length;
  useActionCompletion(idx >= active.rounds.length, Boolean(forcedState), arcadeEvent);
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      const wrongIds = new Set(wrongAttempts.map((w) => w.questionId));
      onSessionComplete({
        correctCount: active.rounds.length - wrongIds.size,
        totalQuestions: active.rounds.length,
        wrongAttempts,
        puzzle: active,
        studentPicks,
      });
    } : undefined,
  });

  // Collision-avoidance constants. Values are in viewport-percent space (the
  // same space the bezier writes to). The fruit graphic is ~76px wide and the
  // nameplate hangs below at roughly the same width — at a 1280px viewport
  // 76px ≈ 6%. A safety margin of ~8% covers both fruit and nameplate width.
  const MIN_SEPARATION_PCT = 8;
  // Small additional buffer above MIN_SEPARATION counted as "collision" beyond
  // the spec's 10px (≈ 0.8% at 1280px) — tracked in pct so devices scale.
  const COLLISION_BUFFER_PCT = 0.8;

  // Sample 12 evenly-spaced phase points along each arc to detect collisions.
  // Two fruits collide if at any shared wallclock moment their (x,y) positions
  // are within MIN_SEPARATION_PCT in either axis. We approximate "shared
  // wallclock moment" by sampling phases for both fruits at the same absolute
  // time t = (delay + phase * duration) and re-evaluating each fruit's true
  // position at that t.
  const SAMPLE_STEPS = 12;
  function fruitPos(f: Pick<FruitModel, 'startX' | 'peakX' | 'endX' | 'baseY' | 'peakY' | 'delay' | 'duration'>, atSec: number) {
    const phase = (atSec - f.delay) / f.duration;
    if (phase < 0 || phase > 1) return null;
    return {
      x: bezier(phase, f.startX, f.peakX, f.endX),
      y: bezier(phase, f.baseY, f.peakY, f.baseY),
    };
  }
  function collides(a: FruitModel, b: FruitModel): boolean {
    const tStart = Math.min(a.delay, b.delay);
    const tEnd = Math.max(a.delay + a.duration, b.delay + b.duration);
    const step = (tEnd - tStart) / SAMPLE_STEPS;
    for (let i = 0; i <= SAMPLE_STEPS; i++) {
      const t = tStart + i * step;
      const pa = fruitPos(a, t);
      const pb = fruitPos(b, t);
      if (!pa || !pb) continue;
      const dx = Math.abs(pa.x - pb.x);
      const dy = Math.abs(pa.y - pb.y);
      // Spec: "any overlap > 10px in either axis" — we treat closeness in BOTH
      // axes simultaneously as the overlap condition (a fruit at a different
      // y is not visually colliding even if x is close).
      if (dx < MIN_SEPARATION_PCT - COLLISION_BUFFER_PCT &&
          dy < MIN_SEPARATION_PCT - COLLISION_BUFFER_PCT) {
        return true;
      }
    }
    return false;
  }
  function minDistance(candidate: FruitModel, others: FruitModel[]): number {
    let minD = Infinity;
    const tStart = candidate.delay;
    const tEnd = candidate.delay + candidate.duration;
    const step = (tEnd - tStart) / SAMPLE_STEPS;
    for (let i = 0; i <= SAMPLE_STEPS; i++) {
      const t = tStart + i * step;
      const pc = fruitPos(candidate, t);
      if (!pc) continue;
      for (const o of others) {
        const po = fruitPos(o, t);
        if (!po) continue;
        const d = Math.hypot(pc.x - po.x, pc.y - po.y);
        if (d < minD) minD = d;
      }
    }
    return minD;
  }

  const fruits = useMemo<FruitModel[]>(() => {
    if (!round) return [];
    const seedBase = round.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 23 + 11;
    const rng = det(seedBase);
    const N_TRIES = 10;
    // Spawn-delay retry budget — if all N geometric tries collide we push the
    // spawn delay back by 0.5s and try again, up to MAX_DELAY_RETRIES times.
    const MAX_DELAY_RETRIES = 4;
    const SPAWN_DELAY_STEP_S = 0.5;

    function buildCandidate(i: number, baseDelay: number): FruitModel {
      const goingRight = i % 2 === 0;
      const startX = goingRight ? -8 + (rng() - 0.5) * 8 : 108 + (rng() - 0.5) * 8;
      const endX = goingRight ? 108 + (rng() - 0.5) * 8 : -8 + (rng() - 0.5) * 8;
      const peakX = (startX + endX) / 2 + (rng() - 0.5) * 18;
      const peakY = 22 + rng() * 18; // higher in viewport = lower y number
      return {
        optionIdx: i,
        text: round.options[i],
        startX,
        endX,
        peakX,
        peakY,
        baseY: 78 + (rng() - 0.5) * 4,
        duration: 6 + rng() * 2.5,
        paletteIdx: i % FRUIT_PALETTES.length,
        rot0: rng() * 360,
        spin: (rng() - 0.5) * 240,
        delay: baseDelay,
      };
    }

    const placed: FruitModel[] = [];
    for (let i = 0; i < round.options.length; i++) {
      let baseDelay = i * 0.6;
      let chosen: FruitModel | null = null;
      let bestFallback: { f: FruitModel; minD: number } | null = null;
      for (let retry = 0; retry <= MAX_DELAY_RETRIES; retry++) {
        bestFallback = null;
        for (let tryN = 0; tryN < N_TRIES; tryN++) {
          const candidate = buildCandidate(i, baseDelay);
          const collidesAny = placed.some((p) => collides(candidate, p));
          if (!collidesAny) { chosen = candidate; break; }
          const md = minDistance(candidate, placed);
          if (!bestFallback || md > bestFallback.minD) {
            bestFallback = { f: candidate, minD: md };
          }
        }
        if (chosen) break;
        // All N tries collided at this delay — push spawn back 500ms and retry.
        baseDelay += SPAWN_DELAY_STEP_S;
      }
      // If still no clean position after all delay-retries, take the best
      // fallback (max minimum-distance).
      placed.push(chosen ?? bestFallback!.f);
    }
    return placed;
  }, [round]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'flyingfruit',
      brief: FLYINGFRUIT_INSTRUCTIONS.whatYouDo.en[0],
      brief_pl: FLYINGFRUIT_INSTRUCTIONS.whatYouDo.pl[0],
      detail: FLYINGFRUIT_INSTRUCTIONS.controls.en.join(' ') + ' ' + FLYINGFRUIT_INSTRUCTIONS.rightWrongSkip.en.join(' '),
      detail_pl: FLYINGFRUIT_INSTRUCTIONS.controls.pl.join(' ') + ' ' + FLYINGFRUIT_INSTRUCTIONS.rightWrongSkip.pl.join(' '),
      fullInstructions: FLYINGFRUIT_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => { setHarvesting(false); elapsedRef.current = 0; setTElapsed(0); setBladeTrail([]); swiping.current = false; fruitLocked.current = false; }, [round?.id]);
  useEffect(() => {
    if (forcedState || verdict !== null || completed || reduceMotion || !harvesting) return;
    let previous = performance.now(); let raf = 0;
    const frame = (now: number) => { elapsedRef.current += Math.min(.04, (now - previous) / 1000); previous = now; setTElapsed(elapsedRef.current); raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame); return () => cancelAnimationFrame(raf);
  }, [verdict, forcedState, completed, reduceMotion, harvesting, round?.id]);
  useEffect(() => {
    if (forcedState) return;
    const total = active.rounds.length;
    persisted.save({ progress: idx / total, lastState: idx >= total ? 'complete' : 'active' });
    if (idx >= total) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [idx, forcedState, active.rounds.length]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty')   { setIdx(0); setVerdict(null); setPickedOption(null); setScore({ right: 0, wrong: 0 }); }
    if (forcedState === 'active')  { setIdx(0); setVerdict(null); setPickedOption(null); }
    if (forcedState === 'correct') { setIdx(1); setVerdict('right'); setPickedOption(active.rounds[1]?.answerIndex ?? 0); }
    if (forcedState === 'wrong')   { setIdx(1); setVerdict('wrong'); setPickedOption((active.rounds[1]?.answerIndex ?? 0) === 0 ? 1 : 0); }
    if (forcedState === 'complete'){ setIdx(active.rounds.length); }
  }, [forcedState, active.rounds]);

  const onTapFruit = (optionIdx: number): void => {
    if (forcedState || verdict !== null || !round || fruitLocked.current || (!harvesting && !reduceMotion)) return;
    fruitLocked.current = true;
    setPickedOption(optionIdx);
    const right = optionIdx === round.answerIndex;
    setVerdict(right ? 'right' : 'wrong');
    const fruit = fruits.find(f => f.optionIdx === optionIdx);
    const phase = fruit ? ((tElapsed - fruit.delay) / fruit.duration) % 1 : 0;
    const perfect = !reduceMotion && phase >= .35 && phase <= .65;
    const earned = perfect ? 150 : 100; arcadeEvent({ type: right ? 'correct' : 'incorrect', points: earned });
    if (right) { setHarvestPoints(n => n + earned); setHarvestNotice(perfect ? 'PERFECT SLICE · +150' : 'CLEAN CUT · +100'); } else setHarvestNotice('Wrong fruit. Check the answer, then try the next harvest.');
    setAnnouncement(right ? 'Caught.' : `Missed. The right one was ${round.options[round.answerIndex]}.`);
    // D3 Wave-5: log per-round pick.
    setStudentPicks((p) => ({ ...p, [round.id]: round.options[optionIdx] }));
    if (right) setScore((s) => ({ ...s, right: s.right + 1 }));
    else {
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
      tip.recordWrong({
        questionId: round.id,
        studentAnswer: round.options[optionIdx],
        correctAnswer: round.options[round.answerIndex],
        explanationPL: round.hint_pl,
        exerciseId: round.exerciseId,
      });
    }
  };

  useEffect(() => {
    if (verdict === null || forcedState) return;
    const t = later(() => {
      setIdx((i) => i + 1);
      setVerdict(null);
      setPickedOption(null);
      setRevealedHint(false);
    }, 1400);
    return () => clearTimeout(t);
  }, [verdict, forcedState]);

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 2) return;
    setHintsUsed((h) => h + 1);
    setRevealedHint(true);
  };

  const reset = (): void => {
    cancelActionTimers();
    arcadeEvent({ type: 'reset' });
    setHarvesting(false); setHarvestPoints(0); setBladeTrail([]); setStudentPicks({}); fruitLocked.current = false; elapsedRef.current = 0;
    setIdx(0); setVerdict(null); setPickedOption(null); setScore({ right: 0, wrong: 0 });
    setHintsUsed(0); setRevealedHint(false); tip.reset();
  };

  const grad = time === 'day'
    ? 'linear-gradient(180deg, #6E4FB7 0%, #FBBF24 70%, #34D399 100%)'
    : time === 'dusk'
      ? 'linear-gradient(180deg, #1F1240 0%, #B85A88 50%, #FBBF24 85%, #34D399 100%)'
      : 'linear-gradient(180deg, #02010C 0%, #2A1450 60%, #34D39933 100%)';

  return (
    <div
      className="em-shell em-shell-flyingfruit"
      role="application"
      aria-label="Flying Fruit, The Orchard Square"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: grad }}
    >
      <style>{`
        @keyframes em-ff-basket-sit { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes em-ff-pop { 0% { transform: translate(-50%, -50%) scale(1); } 60% { transform: translate(-50%, -50%) scale(1.4); } 100% { transform: translate(-50%, -50%) scale(0); opacity: 0; } }
        @keyframes em-ff-splat { 0% { transform: translate(-50%, -50%) scale(1) rotate(0); } 30% { transform: translate(-50%, -50%) scale(1.2) rotate(-12deg); } 100% { transform: translate(-50%, -50%) scale(0.8) rotate(8deg); opacity: 0.5; } }
        @keyframes em-ff-leaf-rustle { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
        @keyframes em-ff-tree-sway { 0%, 100% { transform: rotate(-1deg); } 50% { transform: rotate(1deg); } }
        /* Sunset polish (2026-05-02): orchard ambience — falling leaves drift
           from above the play area down past the baskets, with gentle
           horizontal drift. Each leaf gets its own duration / delay / sway. */
        @keyframes em-ff-fall {
          0%   { transform: translate(0, -10vh) rotate(0deg); opacity: 0; }
          10%  { opacity: 0.7; }
          50%  { transform: translate(-30px, 55vh) rotate(180deg); opacity: 0.7; }
          90%  { opacity: 0.55; }
          100% { transform: translate(20px, 110vh) rotate(360deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .em-ff-falling-leaf { animation: none !important; opacity: 0.4; }
          .em-ff-tree-sway-static { animation: none !important; }
        }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      {/* Distant farmhouse silhouette — sunset polish (2026-05-02). Sits on
          the horizon line, behind the orchard trees, anchored to the right
          third of the canvas so the left side stays clean for the prompt. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 400 160"
        preserveAspectRatio="xMaxYMax meet"
        style={{
          position: 'absolute', bottom: '32%', right: 0,
          width: 'min(360px, 32%)', height: '18%',
          pointerEvents: 'none', opacity: 0.55,
        }}
      >
        {/* hill mound */}
        <ellipse cx="200" cy="170" rx="280" ry="60" fill="#1A0F2E" />
        {/* farmhouse body */}
        <rect x="240" y="100" width="90" height="55" fill="#2A1638" />
        {/* roof */}
        <polygon points="232,100 285,68 338,100" fill="#0E0820" />
        {/* chimney */}
        <rect x="305" y="74" width="10" height="22" fill="#0E0820" />
        {/* warm window glow */}
        <rect x="252" y="118" width="14" height="14" fill="#FBBF24" opacity="0.85" />
        <rect x="278" y="118" width="14" height="14" fill="#FBBF24" opacity="0.7" />
        <rect x="304" y="118" width="14" height="14" fill="#FBBF24" opacity="0.85" />
        {/* fence posts */}
        {Array.from({ length: 5 }).map((_, i) => (
          <rect key={i} x={150 + i * 18} y="148" width="2" height="14" fill="#0E0820" />
        ))}
        <line x1="150" y1="152" x2="232" y2="152" stroke="#0E0820" strokeWidth="1.4" />
      </svg>

      {/* Falling leaves layer — orchard ambience. 8 leaves with varied
          duration / delay / hue. Pointer-events:none so they never intercept
          fruit taps. prefers-reduced-motion freezes them in place. */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1,
      }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const leafColors = ['#FBBF24', '#FB7185', '#A78BFA', '#34D399', '#F97316', '#FCD34D'];
          const colour = leafColors[i % leafColors.length];
          const leftPct = (i * 13 + 7) % 95;
          const dur = 9 + (i % 4) * 2.5;
          const delay = -((i * 1.7) % 9);
          const size = 12 + (i % 3) * 4;
          return (
            <div
              key={i}
              className="em-ff-falling-leaf"
              style={{
                position: 'absolute',
                top: 0,
                left: `${leftPct}%`,
                width: size,
                height: size,
                animation: `em-ff-fall ${dur}s linear ${delay}s infinite`,
                opacity: 0,
              }}
            >
              <svg viewBox="0 0 16 16" width={size} height={size}>
                <path
                  d="M 8 1 Q 14 4 14 8 Q 14 14 8 15 Q 2 14 2 8 Q 2 4 8 1 Z"
                  fill={colour}
                  opacity="0.8"
                />
                <line x1="8" y1="2" x2="8" y2="14" stroke="#3A2410" strokeWidth="0.6" opacity="0.5" />
              </svg>
            </div>
          );
        })}
      </div>

      {/* Distant orchard tree silhouettes */}
      <svg aria-hidden="true" viewBox="0 0 1200 200" preserveAspectRatio="none" style={{ position: 'absolute', bottom: '18%', left: 0, width: '100%', height: '30%', pointerEvents: 'none', opacity: 0.45 }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const x = 60 + i * 150;
          return (
            <g key={i} style={{ transformOrigin: `${x}px 200px`, animation: `em-ff-tree-sway ${4 + (i % 3)}s ease-in-out ${i * 0.4}s infinite` }}>
              <rect x={x - 6} y="120" width="12" height="80" fill="#3A2410" />
              <ellipse cx={x} cy="100" rx="55" ry="48" fill="#0E2A1F" />
              <ellipse cx={x - 22} cy="112" rx="32" ry="28" fill="#0E2A1F" />
              <ellipse cx={x + 22} cy="112" rx="32" ry="28" fill="#0E2A1F" />
            </g>
          );
        })}
      </svg>

      {/* Wooden baskets along the bottom — receiving the fruit */}
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 30, left: 0, right: 0, height: 90, display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', pointerEvents: 'none', zIndex: 2 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            width: 110, height: 64, position: 'relative',
            animation: `em-ff-basket-sit ${2 + (i % 3) * 0.4}s ease-in-out ${i * 0.2}s infinite`,
          }}>
            <svg viewBox="0 0 110 64" width="110" height="64">
              {/* basket body */}
              <path d="M 8 10 L 102 10 L 92 60 L 18 60 Z" fill="#7A5A2A" stroke="#3A2410" strokeWidth="1.5" />
              {/* weave pattern */}
              {Array.from({ length: 6 }).map((_, j) => (
                <line key={j} x1={12 + j * 16} y1="12" x2={12 + j * 16 - 4} y2="58" stroke="#3A2410" strokeWidth="1" opacity="0.6" />
              ))}
              {Array.from({ length: 4 }).map((_, j) => (
                <line key={`h-${j}`} x1="10" y1={20 + j * 11} x2="100" y2={20 + j * 11} stroke="#3A2410" strokeWidth="1" opacity="0.5" />
              ))}
              {/* basket lip */}
              <ellipse cx="55" cy="10" rx="48" ry="6" fill="#A07840" stroke="#3A2410" strokeWidth="1.5" />
            </svg>
          </div>
        ))}
      </div>

      {/* Top bar */}
      <div className="action-flying-header" style={{ position: 'absolute', top: 28, left: 28, right: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 6, gap: 12, flexWrap: 'wrap' }}>
        <AmbientAudioPlayer shellSlug="flyingfruit" />
        <Nameplate
          district="The Orchard Square"
          subtitle="Flying Fruit · Latające owoce · catch the right one"
          accent={ACCENT}
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="13" r="6" stroke={ACCENT} strokeWidth="1.6" /><path d="M11 7 Q 13 3 16 5" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>}
        />
        <div className="action-flying-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Triple counter cleanup (CD audit #14, 2026-05-02): drop the
              CAUGHT/MISSED dual eyebrows; primary counter is the shared
              Progress primitive; ✓/✗ tally collapsed into one small chip. */}
          <Progress
            current={Math.min(idx + 1, active.rounds.length)}
            total={active.rounds.length}
            accent={ACCENT}
          />
          <div
            aria-label={`${score.right} caught, ${score.wrong} missed`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 9px', borderRadius: 999,
              background: 'rgba(14,10,26,0.55)',
              border: '1px solid rgba(255,255,255,0.12)',
              fontFamily: 'var(--em-mono)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            <span style={{ color: '#34D399' }}>✓ {score.right}</span>
            <span style={{ opacity: 0.35 }}>·</span>
            <span style={{ color: '#FB7185' }}>✗ {score.wrong}</span>
          </div>
          <SkipButton onClick={() => { if (verdict !== null || !round) return; arcadeEvent({ type: 'incorrect' }); tip.recordWrong({ questionId: round.id, studentAnswer: 'Skipped', correctAnswer: round.options[round.answerIndex], explanationPL: round.hint_pl, exerciseId: round.exerciseId }); setIdx(i => i + 1); }} />
          <HintButton onClick={useHint} used={hintsUsed} total={2} />
        </div>
      </div>

      {/* Question prompt — pinned top-center */}
      {!completed && round && (
        <div className="action-flying-question" style={{
          position: 'absolute', top: 96, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 'min(620px, 80%)', padding: '12px 22px',
          background: 'linear-gradient(180deg, rgba(20,42,16,0.85) 0%, rgba(8,18,10,0.9) 100%)',
          border: `1px solid ${ACCENT}66`, borderRadius: 14,
          boxShadow: `0 18px 36px rgba(0,0,0,0.4), 0 0 18px ${ACCENT}33`,
          zIndex: 5, textAlign: 'center',
        }}>
          <div className="em-eyebrow" style={{ color: ACCENT, marginBottom: 4 }}>QUESTION · PYTANIE {String(idx + 1).padStart(2, '0')}</div>
          <div className="em-decor" style={{ fontSize: 18, color: 'var(--em-text)', lineHeight: 1.35 }}>
            {/* Per-shell answer-mask (CD audit cross-cutting #19, 2026-05-02):
                strip the literal answer (and morphological variants) from the
                prompt so word-tile selection isn't trivial. No-op when the
                answer doesn't appear — e.g. the FF_DEMO fruit-naming prompts. */}
            {maskAnswerInPrompt(round.prompt, round.options[round.answerIndex])}
          </div>
          {revealedHint && <div style={{ marginTop: 6, fontSize: 12, color: ACCENT, fontStyle: 'italic' }}>💡 {round.hint}</div>}
        </div>
      )}

      {/* Only the fruit art rotates: its circular tap target and separate
          word label stay centered on the same live arc position. */}
      <div className="action-three-fruit-slot"><ActionPlayfield3D kind="flyingfruit" data={{reducedMotion:reduceMotion,running:harvesting,blade:bladeMode,onPick:onTapFruit,actors:fruits.map(f=>{const phase=(tElapsed-f.delay)/f.duration;const t=reduceMotion||!harvesting?.5:phase<0?0:phase>1?phase-Math.floor(phase):phase;const visible=reduceMotion||!harvesting||phase>=0;const word=f.text.toLowerCase();const color=/^lemon/.test(word)?'#facc15':/^lime/.test(word)?'#84cc16':/^apple/.test(word)?'#ef4444':/^pear/.test(word)?'#a3cc40':/^orange/.test(word)?'#fb923c':/^cherr/.test(word)?'#e11d48':FRUIT_PALETTES[f.paletteIdx].fill;return {id:f.optionIdx,x:reduceMotion||!harvesting?18+f.optionIdx*64/Math.max(1,fruits.length-1):bezier(t,f.startX,f.peakX,f.endX),y:reduceMotion||!harvesting?25+(f.optionIdx%2)*34:bezier(t,f.baseY,f.peakY,f.baseY),label:f.text,color,rotation:reduceMotion?0:f.rot0+tElapsed*f.spin,selected:!reduceMotion&&harvesting&&t>=.35&&t<=.65,state:pickedOption===f.optionIdx?verdict??undefined:undefined,hidden:!visible,enabled:visible&&!forcedState&&verdict===null&&!completed&&(harvesting||reduceMotion)};})}} controls={<>{fruits.map(f=><button key={f.optionIdx} disabled={verdict!==null||completed||(!harvesting&&!reduceMotion)} onClick={()=>onTapFruit(f.optionIdx)}>{f.text}</button>)}</>}><div className="action-harvest-field" onPointerDown={e => { if (!bladeMode || (e.target as HTMLElement).closest('button')) return; swiping.current = true; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={() => { swiping.current = false; setBladeTrail([]); }} onPointerCancel={() => { swiping.current = false; setBladeTrail([]); }} onPointerMove={e => {
        if (!bladeMode || !swiping.current || !harvesting || fruitLocked.current) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        setBladeTrail(points => [...points.slice(-7), { x: e.clientX - bounds.left, y: e.clientY - bounds.top }]);
        for (const target of e.currentTarget.querySelectorAll<HTMLElement>('[data-fruit]')) {
          const rect = target.getBoundingClientRect(); const dx = e.clientX - rect.left - rect.width / 2; const dy = e.clientY - rect.top - rect.height / 2;
          if (dx * dx + dy * dy < Math.pow(rect.width * .43, 2)) { onTapFruit(Number(target.dataset.fruit)); break; }
        }
      }} style={{ position: 'relative', height: 390, top: 0, left: 0, right: 0, bottom: 0, zIndex: 4, touchAction: 'none' }}>
        <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 8 }}><polyline points={bladeTrail.map(p => `${p.x},${p.y}`).join(' ')} stroke="#fff3b2" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px #fbbf24)' }} /></svg>

        {fruits.map((f) => {
          // Compute current position from arc parameters + elapsed time.
          const phase = ((tElapsed - f.delay) / f.duration);
          // If pre-delay or post-arc, hide.
          const t = reduceMotion || !harvesting ? .5 : phase < 0 ? 0 : phase > 1 ? phase - Math.floor(phase) : phase;
          const visible = reduceMotion || !harvesting || phase >= 0;
          const x = reduceMotion || !harvesting ? 18 + f.optionIdx * 64 / Math.max(1, fruits.length - 1) : bezier(t, f.startX, f.peakX, f.endX);
          const y = reduceMotion || !harvesting ? 25 + (f.optionIdx % 2) * 34 : bezier(t, f.baseY, f.peakY, f.baseY);
          const rot = reduceMotion ? 0 : f.rot0 + tElapsed * f.spin;
          const isAnswer = f.optionIdx === round?.answerIndex;
          const isPicked = pickedOption === f.optionIdx;
          const showRight = verdict === 'right' && isPicked;
          const showWrong = verdict === 'wrong' && isPicked;
          const dim = verdict !== null && !isAnswer && !isPicked;
          const fruitWord = f.text.toLowerCase().trim();
          const fruitKind = /^(lemon|lime)s?$/.test(fruitWord) ? 'citrus' : /^pears?$/.test(fruitWord) ? 'pear' : /^(cherry|cherries)$/.test(fruitWord) ? 'cherry' : 'round';
          const fruitFill = /^lemons?$/.test(fruitWord) ? '#facc15' : /^limes?$/.test(fruitWord) ? '#84cc16' : /^oranges?$/.test(fruitWord) ? '#fb923c' : /^apples?$/.test(fruitWord) ? '#ef4444' : /^pears?$/.test(fruitWord) ? '#a3cc40' : /^plums?$/.test(fruitWord) ? '#8b5cf6' : /^(cherry|cherries)$/.test(fruitWord) ? '#e11d48' : FRUIT_PALETTES[f.paletteIdx].fill;
          const palette = { fill: fruitFill, leaf: '#4ade80' };
          // Mobile CSS uses 74px, with the same circular target as the artwork.
          const SPRITE = 84;
          return (
            <React.Fragment key={f.optionIdx}>
              <button
                type="button"
                data-fruit={visible ? f.optionIdx : undefined}
                onPointerDown={event => { if (bladeMode) return; event.stopPropagation(); swiping.current = false; onTapFruit(f.optionIdx); }}
                onClick={event => { if (event.detail === 0) onTapFruit(f.optionIdx); }}
                disabled={!visible || !!forcedState || verdict !== null || completed || (!harvesting && !reduceMotion)}
                aria-label={`Fruit labelled ${f.text}`}
                style={{
                  position: 'absolute',
                  left: `${x}%`, top: `${y}%`,
                  transform: 'translate(-50%, -50%)',
                  clipPath: 'circle(50%)',
                  pointerEvents: visible ? 'auto' : 'none',
                  background: 'transparent', border: 'none', padding: 0,
                  cursor: verdict !== null || completed ? 'default' : 'pointer',
                  opacity: visible ? (dim ? 0.35 : 1) : 0,
                  animation: showRight ? 'em-ff-pop 0.55s var(--em-ease) forwards' : showWrong ? 'em-ff-splat 0.55s var(--em-ease) forwards' : 'none',
                  transition: 'opacity 240ms',
                  width: SPRITE, height: SPRITE,
                  minWidth: 44, minHeight: 44,
                }}
              >
                <svg width={SPRITE} height={SPRITE} viewBox="0 0 76 76" style={{ transform: `rotate(${rot}deg)`, pointerEvents: 'none' }}>
                  <defs>
                    <radialGradient id={`fr-grad-${f.optionIdx}`} cx="40%" cy="35%">
                      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
                      <stop offset="40%" stopColor={palette.fill} />
                      <stop offset="100%" stopColor={palette.fill} stopOpacity="0.85" />
                    </radialGradient>
                  </defs>
                  {/* shadow */}
                  <ellipse cx="40" cy="42" rx="28" ry="26" fill="rgba(0,0,0,0.25)" />
                  {!reduceMotion && harvesting && t >= .35 && t <= .65 && <circle cx="38" cy="40" r="35" fill="none" stroke="#fef3c7" strokeWidth="2" strokeDasharray="4 4" />}
                  {/* fruit body */}
                  {fruitKind === 'citrus' ? <path d="M6 40Q10 14 38 16Q65 15 70 40Q64 65 38 65Q11 66 6 40Z" fill={`url(#fr-grad-${f.optionIdx})`} stroke="#805c0b" strokeWidth="1.2"/> : fruitKind === 'pear' ? <path d="M29 18Q38 11 46 20L49 31Q73 56 52 65Q28 75 15 56Q10 42 26 31Z" fill={`url(#fr-grad-${f.optionIdx})`} stroke="#3d6217" strokeWidth="1.2"/> : fruitKind === 'cherry' ? <g><path d="M25 42Q33 18 44 15Q39 35 53 47" fill="none" stroke="#4ade80" strokeWidth="2"/><circle cx="25" cy="47" r="18" fill={`url(#fr-grad-${f.optionIdx})`}/><circle cx="52" cy="49" r="19" fill={`url(#fr-grad-${f.optionIdx})`}/></g> : <ellipse cx="38" cy="40" rx="28" ry="26" fill={`url(#fr-grad-${f.optionIdx})`} stroke="#0E0A1A" strokeWidth="1.2"/>}
                  {f.paletteIdx % 3 === 1 && <path d="M19 38Q38 15 57 38M16 47Q38 24 59 47M22 57Q38 41 53 57" fill="none" stroke="#ffe69b" strokeWidth="2" opacity=".5"/>}
                  {f.paletteIdx % 3 === 2 && <path d="M38 15Q28 40 38 63" fill="none" stroke="#4c1d95" strokeWidth="2" opacity=".45"/>}
                  {/* highlight */}
                  <ellipse cx="30" cy="32" rx="6" ry="8" fill="#FFFFFF" opacity="0.4" />
                  {/* leaf */}
                  <g style={{ transformOrigin: '38px 14px', animation: 'em-ff-leaf-rustle 1.6s ease-in-out infinite' }}>
                    <path d="M 38 14 Q 50 6 56 14 Q 50 16 38 18 Z" fill={palette.leaf} stroke="#0E0A1A" strokeWidth="1" />
                  </g>
                  {/* state ring */}
                  {(showRight || showWrong) && (
                    <circle cx="38" cy="40" r="34" fill="none"
                      stroke={showRight ? '#34D399' : '#FB7185'} strokeWidth="3"
                      style={{ filter: `drop-shadow(0 0 12px ${showRight ? '#34D399' : '#FB7185'})` }} />
                  )}
                </svg>
              </button>
              {/* The label follows the fruit center without rotating or
                  creating an extra transparent hit area. */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: `${x}%`, top: `${y}%`,
                  transform: `translate(-50%, calc(${SPRITE / 2}px + 8px))`,
                  padding: '4px 10px', borderRadius: 10,
                  background: 'rgba(14,10,26,0.85)', color: '#F4EFEF',
                  fontFamily: 'var(--em-mono)', fontSize: 11, fontWeight: 700,
                  border: `1px solid ${palette.fill}88`,
                  boxShadow: `0 4px 8px rgba(0,0,0,0.5)`,
                  whiteSpace: 'nowrap', pointerEvents: 'none',
                  letterSpacing: '0.06em',
                  opacity: visible ? (dim ? 0.35 : 1) : 0,
                  transition: 'opacity 240ms',
                }}
              >
                {f.text}
              </div>
            </React.Fragment>
          );
        })}
      </div></ActionPlayfield3D></div>

      {!completed && <div className="action-flight-control action-arcade-controls"><p><strong>{harvestPoints} POINTS</strong> · {harvestNotice}</p><button disabled={verdict !== null} onClick={() => setHarvesting(v => !v)}>{harvesting ? 'Pause harvest' : 'Launch harvest'}</button><button disabled={verdict !== null} aria-pressed={bladeMode} onClick={() => { swiping.current = false; setBladeTrail([]); setBladeMode(v => !v); }}>{bladeMode ? 'Blade mode' : 'Tap mode'}</button><span style={{ color: '#e8dfbd', font: '11px var(--em-body)' }}>{bladeMode ? 'Start a swipe on empty ground, then slice through a fruit.' : 'Tap a fruit to catch it. Keyboard: Tab + Enter.'}</span></div>}
      {/* Completion */}
      {completed && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Orchard Square complete"
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
            animation: 'em-rise 0.4s var(--em-ease)', zIndex: 10,
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>The harvest is in.</div>
          <div className="em-eyebrow">BASKETS FULL · KOSZE PEŁNE</div>
          <div style={{ display: 'flex', gap: 28, alignItems: 'baseline' }}>
            <div style={{ textAlign: 'center' }}><div className="em-decor" style={{ fontSize: 44, color: '#34D399' }}>{score.right}</div><div className="em-eyebrow" style={{ color: '#34D399' }}>CAUGHT · ZŁAPANE</div></div>
            <div style={{ textAlign: 'center' }}><div className="em-decor" style={{ fontSize: 44, color: '#FB7185' }}>{score.wrong}</div><div className="em-eyebrow" style={{ color: '#FB7185' }}>MISSED · ZGUBIONE</div></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="em-btn em-btn-ghost" onClick={reset}>Restart run</button>
            <button className="em-btn em-btn-primary" onClick={reset}>Play again →</button>
          </div>
        </div>
      )}
      <Confetti show={completed} />
    </div>
  );
};

export default FlyingFruitShell;
