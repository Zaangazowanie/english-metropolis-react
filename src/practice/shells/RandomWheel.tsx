import { ActionPlayfield3D } from './action-arcade-three';
import { useActionCompletion } from './action-arcade-completion';
import { useArcadeEvents } from '../lib/arcade-events';
import { useActionTimers } from './action-arcade-timers';
import './action-arcade.css';
// RandomWheel — "The Spinner Stand" district.
//
// 2026-05-02 (Ricky, post-CD audit §5 Random Wheel):
//   The Spinner Stand was a functional duplicate of the Carnival Wheel
//   (SpinTheWheel) — both were "spin a wheel and answer". CD audit asked for
//   either consolidation OR harder differentiation. Mike's call: differentiate.
//
//   Spinner Stand is now a CATEGORY ROULETTE: each wedge is a difficulty TIER
//   (Easy / Medium / Hard / Bonus / Wild / Lightning). The wedge you land on
//   determines:
//     • which round you answer (one of the N wrapper rounds)
//     • the score multiplier for that round (Easy ×1, Lightning ×3)
//     • the "barker call" Bajla shouts from the right-side panel
//
//   Carnival Wheel remains the casino-table "answer roulette" (you read the
//   question first, then spin to commit one of A/B/C/D as your answer).
//   Spinner Stand is the carnival-stand "category roulette" (you spin first,
//   the wheel picks your category/tier, then you answer that question).
//
//   The data layer doesn't surface real per-question categories through
//   WrapperRound, so tiers are the honest stand-in: they act AS categories
//   visually + mechanically (tier multiplier, tier-themed barker call), and
//   the right-side TONIGHT'S CATEGORIES board lists them with live counts.
//
// Visual identity (carnival-stand aesthetic):
//   Tall wheel mounted on a stand (vs Carnival Wheel's flat roulette table),
//   bunting + bulb-ring + ticket stubs + popcorn bucket on the right.
//   Bajla is the BARKER calling out tier names ("Step right up! LIGHTNING tier!").
//
// Persisted progress — Convex-backed.
import { useShellProgress } from '../lib/convex-stubs';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { maskAnswerInPrompt } from '../lib/exercise-adapters';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

// Spinner Stand · Random Wheel — full bilingual instruction copy.
const RANDOMWHEEL_INSTRUCTIONS: FullInstructions = {
  "whatYouDo": {
    "en": [
      "Spin for a challenge tier, then solve its question to clear that wedge."
    ],
    "pl": [
      "Zakręć po poziom wyzwania i rozwiąż pytanie, aby zaliczyć pole."
    ]
  },
  "controls": {
    "en": [
      "Spin, read and choose. Two rerolls let you exchange a revealed question for another remaining challenge."
    ],
    "pl": [
      "Zakręć, przeczytaj i wybierz. Dwa ponowne losowania pozwalają zamienić odkryte pytanie na inne pozostałe wyzwanie."
    ]
  },
  "rightWrongSkip": {
    "en": [
      "Wrong answers reveal the correction and stay on the wheel for recovery. Skip returns to the wheel without claiming the question as solved."
    ],
    "pl": [
      "Błędne odpowiedzi pokazują poprawkę i zostają na kole do ponownej próby. Pomiń wraca do koła bez zaliczenia pytania."
    ]
  },
  "hintMechanic": {
    "en": "Use the limited Hint button for help with the current clue.",
    "pl": "Użyj ograniczonej liczby podpowiedzi do aktualnej wskazówki."
  },
  "scoring": {
    "en": "Each tier has its own prize multiplier. Solve every wedge to finish the run.",
    "pl": "Każdy poziom ma własny mnożnik nagrody. Rozwiąż wszystkie pola, aby ukończyć rundę."
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

export type RandomWheelForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface RandomWheelShellProps {
  time?: TimeOfDay;
  state?: RandomWheelForcedState;
  puzzle?: WrapperPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3-RandomWheel (Ricky wave-4, 2026-05-02): fires once when every round
   * has been spun + answered. Per item: each round becomes one row showing
   * tier landed + question + student's pick + correct answer.
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
    points: number;
  }) => void;
}

const RW_DEMO: WrapperPuzzle = {
  rounds: [
    { id: 'wheel', prompt: 'A round object that turns to choose a prize is a ___.', options: ['shelf', 'wheel', 'plate', 'frame'], answerIndex: 1, hint: 'Pointer at the top.', hint_pl: 'Po polsku: koło.' },
    { id: 'prize', prompt: 'The thing you win is the ___.', options: ['fee', 'bill', 'prize', 'fine'], answerIndex: 2, hint: 'Reward.', hint_pl: 'Po polsku: nagroda.' },
    { id: 'lucky', prompt: 'When you keep winning, you are ___.', options: ['tired', 'lucky', 'tall', 'clever'], answerIndex: 1, hint: 'Four-leaf clover.', hint_pl: 'Po polsku: szczęściarz.' },
    { id: 'arrow', prompt: 'The pointer at the top of the wheel is the ___.', options: ['arrow', 'tail', 'string', 'loop'], answerIndex: 0, hint: 'Like on a clock.', hint_pl: 'Po polsku: strzałka.' },
    { id: 'kiosk', prompt: 'A small pop-up shop in a square is a ___.', options: ['barn', 'tower', 'kiosk', 'palace'], answerIndex: 2, hint: 'Often round and small.', hint_pl: 'Po polsku: kiosk.' },
    { id: 'crowd', prompt: 'A group of people watching is a ___.', options: ['line', 'crowd', 'pair', 'court'], answerIndex: 1, hint: '"A ___ gathered."', hint_pl: 'Po polsku: tłum.' },
  ],
};

const ACCENT = '#ffce00';
// 6 vivid wedge colours — drawn from the brand palette so the wheel feels
// part of the city even though it's louder than most shells.
const WEDGE_PALETTE = ['#ffcf00', '#ff174f', '#7628ff', '#00cdff', '#00e875', '#ed00ff'];
const SPIN_DURATION_MS = 3200;
const MIN_FULL_TURNS = 4;

// CATEGORY ROULETTE tiers — the wedge you land on determines the difficulty
// tier of that round + a score multiplier + a Bajla barker call. The TIERS
// array is fixed length-6 to match the canonical Spinner Stand wedge count
// (the wheel will only ever render up to 6 wedges; rounds > 6 are paged in
// future spins on the same wheel). The labels are bilingual short — they sit
// outside the wheel rim with thin connector lines, so labels are upright at
// rest (no counter-rotation gymnastics).
interface Tier {
  id: string;
  /** Short EN word that fits on a wedge nameplate (≤9 chars). */
  labelEN: string;
  /** Polish counterpart for the right-side Tonight's Categories panel. */
  labelPL: string;
  /** Score multiplier — Easy ×1, Lightning ×3. */
  mult: number;
  /** Carnival-barker call Bajla shouts when the pointer lands on this tier. */
  barkerEN: string;
  barkerPL: string;
}

export const TIERS: Tier[] = [
  { id: 'easy',      labelEN: 'EASY',      labelPL: 'Łatwy',      mult: 1, barkerEN: 'Easy round! Step right up.',         barkerPL: 'Łatwa runda! Zapraszamy.' },
  { id: 'medium',    labelEN: 'MEDIUM',    labelPL: 'Średni',     mult: 1, barkerEN: 'Medium round — keep your nerve.',     barkerPL: 'Średnia runda — uważaj.' },
  { id: 'hard',      labelEN: 'HARD',      labelPL: 'Trudny',     mult: 2, barkerEN: 'Hard round, double points!',          barkerPL: 'Trudna runda, podwójne punkty!' },
  { id: 'bonus',     labelEN: 'BONUS',     labelPL: 'Bonus',      mult: 2, barkerEN: 'Bonus round, double the prize!',      barkerPL: 'Runda bonusowa, podwójna nagroda!' },
  { id: 'wild',      labelEN: 'WILD',      labelPL: 'Dzika',      mult: 2, barkerEN: 'Wild card, anything goes!',           barkerPL: 'Dzika karta, wszystko gra!' },
  { id: 'lightning', labelEN: 'LIGHTNING', labelPL: 'Błyskawica', mult: 3, barkerEN: 'LIGHTNING round, triple points!',     barkerPL: 'BŁYSKAWICA, potrójne punkty!' },
];

type Phase = 'idle' | 'spinning' | 'reveal' | 'verdict';

// ─────────────────────────────────────────────────────────────────────────
// renderRandomWheelReviewItem — per-round locked render for PracticeReview.
// Carnival roulette scoreboard row: round number + tier + question +
// student's pick + correct answer.
// ─────────────────────────────────────────────────────────────────────────
const RW_REVIEW_ACCENT = '#ffce00';
export function renderRandomWheelReviewItem(
  round: WrapperRound,
  roundNumber: number,
  tierLabel: string,
  tierMult: number,
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
        : 'linear-gradient(180deg, rgba(52,211,153,0.08), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(52,211,153,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 4,
          background: `${RW_REVIEW_ACCENT}22`, color: RW_REVIEW_ACCENT,
          border: `1px solid ${RW_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          ROUND {String(roundNumber).padStart(2, '0')} · {tierLabel} ×{tierMult}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(52,211,153,0.18)',
          color: isWrong ? '#ff3871' : '#00eb91',
        }}>
          {isWrong ? '✗ MISSED · POMINIĘTE' : '✓ POINTS · PUNKTY'}
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
              border: `1px solid ${showCorrect ? '#00eb9188' : showWrong ? '#ff387188' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? '#00eb91' : showWrong ? '#ff3871' : 'var(--em-text, #EDE6FF)',
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

export const RandomWheelShell: React.FC<RandomWheelShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const active: WrapperPuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : RW_DEMO;
  const persisted = useShellProgress('randomwheel');
  const arcadeEvent = useArcadeEvents();
  const { later, cancel: cancelActionTimers } = useActionTimers();

  const N = active.rounds.length;
  const wedgeAngle = 360 / N;

  const [completedRounds, setCompletedRounds] = useState<Set<number>>(new Set());
  // Tier-multiplied points instead of raw right/wrong: a Lightning-tier correct
  // answer is worth 3 points, an Easy correct is 1. Tracked but no longer
  // surfaced in the header counter (per cross-cutting #14 — Q N/M is the
  // only header counter; points appear in the right-side scoreboard).
  const [rerolls, setRerolls] = useState(2);
  const [retryRounds, setRetryRounds] = useState<Set<number>>(new Set());
  const [points, setPoints] = useState<number>(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [wheelRotation, setWheelRotation] = useState<number>(0);
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [revealedHint, setRevealedHint] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>('');
  // Per-tier completion + accuracy counters for the right-side board.
  const [tierStats, setTierStats] = useState<Record<string, { played: number; right: number }>>(
    () => Object.fromEntries(TIERS.map((t) => [t.id, { played: 0, right: 0 }])),
  );
  const seedRef = useRef<number>(0xC0FFEE);
  const rerollExcluded = useRef<number | null>(null);

  const completed = !forcedState && completedRounds.size === N;
  useActionCompletion(completedRounds.size === N, Boolean(forcedState), arcadeEvent);
  // correctCount derived from tier stats (right answers across all tiers).
  const computedCorrect = Object.values(tierStats).reduce((s, t) => s + t.right, 0);

  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount: computedCorrect,
        totalQuestions: N,
        wrongAttempts,
        puzzle: active,
        points,
      });
    } : undefined,
  });
  // Kelly Tier-2 (2026-05-02): the wheel transition is collapsed to 0.01ms
  // by global CSS under reduced-motion, but the JS sequencer still waited
  // 3.2s for an animation that didn't run. Snap straight to reveal/idle.
  const reduceMotion = usePrefersReducedMotion();
  const SPIN_WAIT_MS = reduceMotion ? 16 : SPIN_DURATION_MS;
  const VERDICT_WAIT_MS = reduceMotion ? 16 : 1700;

  useEffect(() => {
    if (forcedState) return;
    persisted.save({ progress: completedRounds.size / N, lastState: completed ? 'complete' : 'active' });
    if (completed) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [completedRounds.size, forcedState, completed, N]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'randomwheel',
      brief: RANDOMWHEEL_INSTRUCTIONS.whatYouDo.en[0],
      brief_pl: RANDOMWHEEL_INSTRUCTIONS.whatYouDo.pl[0],
      detail: RANDOMWHEEL_INSTRUCTIONS.controls.en.join(' ') + ' ' + RANDOMWHEEL_INSTRUCTIONS.rightWrongSkip.en.join(' '),
      detail_pl: RANDOMWHEEL_INSTRUCTIONS.controls.pl.join(' ') + ' ' + RANDOMWHEEL_INSTRUCTIONS.rightWrongSkip.pl.join(' '),
      fullInstructions: RANDOMWHEEL_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty')   { setCompletedRounds(new Set()); setActiveRound(null); setPhase('idle'); setVerdict(null); setPoints(0); setWheelRotation(0); }
    if (forcedState === 'active')  { setCompletedRounds(new Set()); setActiveRound(0); setPhase('reveal'); setVerdict(null); setWheelRotation(360 + 30); }
    if (forcedState === 'correct') { setCompletedRounds(new Set([0])); setActiveRound(1); setPhase('verdict'); setPicked(active.rounds[1].answerIndex); setVerdict('right'); }
    if (forcedState === 'wrong')   { setCompletedRounds(new Set([0])); setActiveRound(1); setPhase('verdict'); setPicked((active.rounds[1].answerIndex + 1) % active.rounds[1].options.length); setVerdict('wrong'); }
    if (forcedState === 'complete'){ setCompletedRounds(new Set(active.rounds.map((_, i) => i))); }
  }, [forcedState, active.rounds]);

  // Pick the next round to spin TO. We bias toward unanswered rounds so the
  // wheel doesn't keep picking the same already-answered wedge over and over.
  const pickNextRoundIdx = (): number => {
    const remaining: number[] = [];
    for (let i = 0; i < N; i++) if (!completedRounds.has(i)) remaining.push(i);
    if (remaining.length === 0) return 0;
    if (remaining.length > 1 && rerollExcluded.current !== null) { const omit = remaining.indexOf(rerollExcluded.current); if (omit >= 0) remaining.splice(omit, 1); }
    rerollExcluded.current = null;
    seedRef.current = (seedRef.current * 9301 + 49297) & 0x7fffffff;
    return remaining[seedRef.current % remaining.length];
  };

  const spin = (): void => {
    if (forcedState || phase !== 'idle' || completed) return;
    const target = pickNextRoundIdx();
    setAnnouncement('Spinning the wheel.');
    // For the pointer to land on wedge `target`, the wheel center of that
    // wedge must end up at angle 0 (top). Wedge centers (in static frame) sit
    // at angle = target * wedgeAngle + wedgeAngle / 2. To rotate that to 0,
    // we rotate by -((target + 0.5) * wedgeAngle), plus a small jitter so the
    // pointer lands somewhere within the wedge rather than dead-center.
    seedRef.current = (seedRef.current * 9301 + 49297) & 0x7fffffff;
    const jitter = ((seedRef.current % 100) / 100 - 0.5) * (wedgeAngle * 0.6);
    const targetAngle = -((target + 0.5) * wedgeAngle) + jitter;
    // Keep adding turns relative to current rotation so the spin always
    // builds forward visually.
    const fullTurns = MIN_FULL_TURNS + Math.floor(seedRef.current % 3);
    const next = wheelRotation + fullTurns * 360 + (targetAngle - (wheelRotation % 360));
    setWheelRotation(next);
    setPhase('spinning');
    setActiveRound(target);
    // After the deceleration ends, reveal the question.
    later(() => {
      setPhase('reveal');
    }, SPIN_WAIT_MS);
  };

  const onPick = (i: number): void => {
    if (forcedState || phase !== 'reveal' || activeRound === null) return;
    const round = active.rounds[activeRound];
    const tier = TIERS[activeRound % TIERS.length];
    setPicked(i);
    setPhase('verdict');
    const right = i === round.answerIndex;
    setVerdict(right ? 'right' : 'wrong');
    setAnnouncement(right ? `Correct. +${tier.mult} points (${tier.labelEN}).` : 'The answer is revealed below. This question stays on the wheel for a recovery round.');
    arcadeEvent({ type: right ? 'correct' : 'incorrect', points: tier.mult * 100 });
    if (right) setPoints((p) => p + tier.mult);
    else {
      tip.recordWrong({
        questionId: round.id,
        studentAnswer: round.options[i],
        correctAnswer: round.options[round.answerIndex],
        explanationPL: round.hint_pl,
        exerciseId: round.exerciseId,
      });
    }
    // Tier stats: increment played always, right only if correct.
    setTierStats((prev) => {
      const cur = prev[tier.id] ?? { played: 0, right: 0 };
      return { ...prev, [tier.id]: { played: cur.played + 1, right: cur.right + (right ? 1 : 0) } };
    });
    if (right) { setCompletedRounds((s) => new Set([...s, activeRound])); setRetryRounds(s => { const next = new Set(s); next.delete(activeRound); return next; }); }
    else setRetryRounds(s => new Set([...s, activeRound]));
    // After verdict pause, return to idle so they can spin again.
    later(() => {
      setPhase('idle');
      setPicked(null);
      setVerdict(null);
      setActiveRound(null);
      setRevealedHint(false);
    }, VERDICT_WAIT_MS);
  };

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 2 || activeRound === null) return;
    setHintsUsed((h) => h + 1);
    setRevealedHint(true);
  };

  const reset = (): void => {
    cancelActionTimers();
    arcadeEvent({ type: 'reset' });
    setRerolls(2); setRetryRounds(new Set());
    setCompletedRounds(new Set()); setPoints(0);
    setTierStats(Object.fromEntries(TIERS.map((t) => [t.id, { played: 0, right: 0 }])));
    setPhase('idle'); setWheelRotation(0); setActiveRound(null); setPicked(null); setVerdict(null);
    setHintsUsed(0); setRevealedHint(false); tip.reset();
  };

  const grad = time === 'day' ? 'linear-gradient(180deg,#241094,#0a0d30)' : 'linear-gradient(180deg,#10082d,#280a56)';

  const wedges = useMemo(() => active.rounds.map((round, i) => ({ color: WEDGE_PALETTE[i % WEDGE_PALETTE.length], tier: TIERS[i % TIERS.length], roundId: round.id, idx: i })), [active.rounds]);

  const round = activeRound !== null ? active.rounds[activeRound] : null;
  const activeTier = activeRound !== null ? TIERS[activeRound % TIERS.length] : null;
  // Mask the answer word inside the displayed prompt so a sentence like
  // "Her resilience allowed her to stay focused..." with `resilience` as the
  // correct option becomes "Her ___ allowed her to stay focused..." — A3's
  // adapter-layer helper, applied per-shell as the audit's #19 universal.
  const safePrompt = round ? maskAnswerInPrompt(round.prompt, round.options[round.answerIndex]) : '';

  return (
    <div
      className="em-shell em-shell-randomwheel"
      role="application"
      aria-label="Random Wheel, The Spinner Stand"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: grad }}
    >
      <style>{`
@keyframes em-rw-card-up { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 1023px) {
          .em-rw-categories-panel { display: none !important; }
        }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      <div className="action-random-header" style={{ position: 'absolute', top: 28, left: 28, right: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 6, gap: 12, flexWrap: 'wrap' }}>
        <AmbientAudioPlayer shellSlug="randomwheel" />
        <Nameplate
          district="The Spinner Stand"
          subtitle="Random Wheel · Koło fortuny · spin to pick the next category"
          accent={ACCENT}
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="8" stroke={ACCENT} strokeWidth="1.6" /><path d="M11 3 L11 11 L17 14" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" /></svg>}
        />
        {/* Single canonical counter — Q N/M position only. WON/LOST removed
            per cross-cutting #14; tier-multiplied points live in the right-side
            scoreboard, not in the header. */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Progress current={completedRounds.size} total={N} accent={ACCENT} />
          <SkipButton onClick={() => { if (phase === 'reveal') { setPhase('idle'); setActiveRound(null); setRevealedHint(false); } }} />
          <HintButton onClick={useHint} used={hintsUsed} total={2} />
        </div>
      </div>

      {/* The wheel — biased LEFT to make room for the right-side TONIGHT'S
          CATEGORIES panel (#9 — kills the ~50% right-side void CD flagged).
          On viewports < 900px the panel collapses below; on ≥1280px both
          align in a balanced two-column composition. The wheel sits on a
          stand-leg pedestal (carnival-stand aesthetic vs Carnival Wheel's
          flat roulette table). */}
      <div className="action-three-random-slot"><ActionPlayfield3D kind="randomwheel" onShortcut={key=>{if(forcedState||completed)return false;if(key===' '&&phase==='idle'){spin();return true;}const option=/^[1-9]$/.test(key)?Number(key)-1:key.length===1?key.charCodeAt(0)-97:-1;if(phase==='reveal'&&activeRound!==null&&option>=0&&option<active.rounds[activeRound].options.length){onPick(option);return true;}return false;}} data={{reducedMotion:reduceMotion,angle:wheelRotation,duration:SPIN_WAIT_MS,running:phase==='spinning',onSpin:phase==='idle'&&!completed&&!forcedState?spin:undefined,actors:wedges.map((w,i)=>({id:i,x:0,y:0,label:w.tier.labelEN,color:w.color,state:completedRounds.has(i)?'done':retryRounds.has(i)?'retry':'ready',selected:activeRound===i}))}} controls={<button disabled={phase!=='idle'||completed||!!forcedState} onClick={spin}>Spin the challenge wheel</button>} /></div>

      <div className="action-random-tier-legend" aria-label="Wheel prize tiers">{TIERS.map(t => <span key={t.id}>{t.labelEN} · ×{t.mult}</span>)}</div>
          <div className="action-arcade-hud action-random-hud" style={{ position: 'absolute', bottom: 16, left: 24, right: 24, zIndex: 7 }}><div><strong>{points} PRIZE POINTS</strong><small>{retryRounds.size ? `${retryRounds.size} recovery question${retryRounds.size === 1 ? '' : 's'} still on the wheel.` : 'Clear every wedge. Each tier carries a different prize.'} A wrong answer stays in play until you solve it.</small></div><button disabled={phase !== 'reveal' || rerolls === 0} onClick={() => { rerollExcluded.current = activeRound; setRerolls(n => n - 1); setPhase('idle'); setActiveRound(null); setRevealedHint(false); setAnnouncement('Reroll ready. Spin for a new challenge.'); }}>Reroll · {rerolls} left</button></div>
      {/* Question kiosk window — appears below the wheel after spin lands */}
      {(phase === 'reveal' || phase === 'verdict') && round && (
        <div
          key={activeRound ?? 'k'}
          className="action-random-question"
          style={{
            position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)',
            width: 'min(640px, 92%)', padding: '20px 24px',
            background: 'linear-gradient(180deg, rgba(20,8,42,0.92) 0%, rgba(8,4,26,0.95) 100%)',
            border: `1.5px solid ${ACCENT}88`, borderRadius: 16,
            boxShadow: `0 24px 48px rgba(0,0,0,0.6), 0 0 24px ${ACCENT}33`,
            animation: 'em-rw-card-up 480ms var(--em-ease) both',
            zIndex: 5,
          }}
        >
          <div className="em-eyebrow" style={{ color: ACCENT, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>WEDGE {String((activeRound ?? 0) + 1).padStart(2, '0')} · WYLOSOWANE</span>
            {activeTier && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '2px 8px', borderRadius: 4,
                background: `${WEDGE_PALETTE[(activeRound ?? 0) % WEDGE_PALETTE.length]}33`,
                border: `1px solid ${WEDGE_PALETTE[(activeRound ?? 0) % WEDGE_PALETTE.length]}`,
                color: WEDGE_PALETTE[(activeRound ?? 0) % WEDGE_PALETTE.length],
                fontFamily: 'Inconsolata, monospace', fontSize: 11, fontWeight: 700,
              }}>{activeTier.labelEN} · ×{activeTier.mult}</span>
            )}
          </div>
          {/* Answer-mask applied per #19 — strips the answer token (and
              morphological variants) from the displayed sentence. */}
          <div className="em-decor" style={{ fontSize: 18, color: 'var(--em-text)', marginBottom: 14, lineHeight: 1.4 }}>{safePrompt}</div>
          {revealedHint && <div style={{ fontSize: 12, color: ACCENT, fontStyle: 'italic', marginBottom: 10 }}>💡 {round.hint}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {round.options.map((opt, i) => {
              const isPicked = picked === i;
              const isAnswer = i === round.answerIndex;
              const showRight = verdict !== null && isAnswer;
              const showWrong = verdict === 'wrong' && isPicked && !isAnswer;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPick(i)}
                  disabled={!!forcedState || phase !== 'reveal'}
                  aria-label={`Option ${String.fromCharCode(65 + i)}: ${opt}`}
                  aria-pressed={isPicked}
                  style={{
                    minHeight: 44, padding: '12px 14px', textAlign: 'left',
                    background: showRight ? '#00eb9133' : showWrong ? '#ff387133' : isPicked ? `${ACCENT}33` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${showRight ? '#00eb91' : showWrong ? '#ff3871' : isPicked ? ACCENT : 'rgba(255,255,255,0.18)'}`,
                    borderRadius: 10, color: 'var(--em-text)',
                    cursor: phase === 'reveal' ? 'pointer' : 'default',
                    fontFamily: 'var(--em-body)', fontSize: 14,
                    transition: 'all 180ms var(--em-ease)',
                  }}
                >
                  <span style={{ color: ACCENT, marginRight: 8, fontFamily: 'var(--em-mono)', fontSize: 11 }}>{String.fromCharCode(65 + i)}</span>
                  {opt}
                  {showRight && <span style={{ float: 'right', color: '#00eb91' }}>✓</span>}
                  {showWrong && <span style={{ float: 'right', color: '#ff3871' }}>✗</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Instructions modal only — HintCard removed 2026-05-03; the
          chat-widget speech bubble carries the brief. */}
      {phase === 'idle' && !completed && (
        <div style={{ position: 'absolute', bottom: 28, left: 28, maxWidth: 360, zIndex: 5 }}>
        </div>
      )}

      {/* RIGHT-SIDE PANEL — TONIGHT'S CATEGORIES + barker call + scoreboard.
          Fills the ~50% right-side void CD's audit flagged as worst-seen (#9).
          Hidden on narrow viewports (<900px) so mobile layout doesn't
          compress; on wide viewports it gives the wheel a balanced two-column
          composition + lets the tier mechanic surface as a visible board. */}
      <div
        aria-label="Tonight's categories scoreboard"
        style={{
          position: 'absolute', top: 110, right: 28, width: 300,
          maxHeight: 'calc(100% - 220px)', overflowY: 'auto',
          padding: '16px 18px', zIndex: 5,
          background: 'linear-gradient(180deg, rgba(20,8,42,0.94) 0%, rgba(8,4,26,0.96) 100%)',
          border: `1.5px solid ${ACCENT}66`, borderRadius: 14,
          boxShadow: `0 16px 32px rgba(0,0,0,0.5), 0 0 18px ${ACCENT}22`,
          display: 'block',
        }}
        className="em-rw-categories-panel"
      >
        {/* Marquee header — bilingual */}
        <div className="em-eyebrow" style={{ color: ACCENT, marginBottom: 4, letterSpacing: '0.08em' }}>TONIGHT'S CATEGORIES</div>
        <div style={{ fontSize: 11, color: 'var(--em-text-muted)', marginBottom: 12, fontStyle: 'italic' }}>Dzisiejsze kategorie</div>

        {/* Live barker call from Bajla — changes when the pointer lands on
            a tier. Default idle copy invites the player to spin. */}
        <div style={{
          padding: '10px 12px', marginBottom: 14, borderRadius: 8,
          background: `${ACCENT}1A`, border: `1px dashed ${ACCENT}88`,
        }}>
          <div className="em-eyebrow" style={{ color: ACCENT, fontSize: 10, marginBottom: 4 }}>BAJLA THE BARKER</div>
          <div style={{ fontSize: 13, color: 'var(--em-text)', lineHeight: 1.35 }}>
            {activeTier ? activeTier.barkerEN : 'Step right up · Zapraszamy'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--em-text-muted)', marginTop: 3, fontStyle: 'italic', lineHeight: 1.35 }}>
            {activeTier ? activeTier.barkerPL : 'Spin to pick tonight’s category.'}
          </div>
        </div>

        {/* Tier list — 6 rows with colour swatch + EN tier + PL gloss + ×mult
            + per-tier played count. The tier with the active wedge gets a
            subtle highlight ring. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TIERS.map((t, i) => {
            const swatch = WEDGE_PALETTE[i % WEDGE_PALETTE.length];
            const stats = tierStats[t.id] ?? { played: 0, right: 0 };
            const isActive = activeTier?.id === t.id;
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 8px', borderRadius: 6,
                background: isActive ? `${swatch}22` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isActive ? swatch : 'rgba(255,255,255,0.08)'}`,
                transition: 'all 200ms var(--em-ease)',
              }}>
                <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 3, background: swatch, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Inconsolata, monospace', fontSize: 11, fontWeight: 700, color: swatch, letterSpacing: '0.05em' }}>{t.labelEN}</div>
                  <div style={{ fontSize: 10, color: 'var(--em-text-muted)', fontStyle: 'italic' }}>{t.labelPL} · ×{t.mult}</div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--em-text-muted)', fontFamily: 'Inconsolata, monospace', textAlign: 'right' }}>
                  {stats.right}/{stats.played || 0}
                </div>
              </div>
            );
          })}
        </div>

        {/* Points totaliser — single secondary metric, surfaced here not in
            the header (per cross-cutting #14 cleanup). */}
        <div style={{
          marginTop: 14, paddingTop: 12,
          borderTop: '1px dashed rgba(255,255,255,0.12)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <div className="em-eyebrow" style={{ color: ACCENT, fontSize: 10 }}>POINTS · PUNKTY</div>
          <div style={{ fontFamily: 'Caprasimo, Georgia, serif', fontSize: 22, color: ACCENT }}>{points}</div>
        </div>

        {/* Decorative ticket-stub strip + popcorn-bucket icon — props for the
            carnival-stand aesthetic, fills remaining vertical space. */}
        <div aria-hidden="true" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          {/* Ticket stubs */}
          {[0, 1, 2].map((k) => (
            <div key={k} style={{
              width: 38, height: 22, borderRadius: '2px',
              background: WEDGE_PALETTE[k % WEDGE_PALETTE.length],
              clipPath: 'polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%, 8% 50%)',
              opacity: 0.85,
              fontFamily: 'Inconsolata, monospace', fontSize: 9, color: '#0E0A1A',
              fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              letterSpacing: '0.04em',
            }}>ADMIT 1</div>
          ))}
          {/* Popcorn bucket */}

        </div>
      </div>

      {/* Standalone Bajla removed 2026-05-03 — chat-widget mascot is the
          canonical presence. */}

      {/* Completion */}
      {completed && !onSessionComplete && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Spinner Stand complete"
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
            animation: 'em-rise 0.4s var(--em-ease)', zIndex: 10,
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>The wheel rests.</div>
          <div className="em-eyebrow">EVERY WEDGE PLAYED · WSZYSTKIE KLINY ZAGRANE</div>
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

export default RandomWheelShell;
