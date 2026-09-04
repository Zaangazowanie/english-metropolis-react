import { useActionCompletion } from './action-arcade-completion';
import { useArcadeEvents } from '../lib/arcade-events';
import { useActionTimers } from './action-arcade-timers';
import './action-arcade.css';
// Airplane — "The Aerodrome" district.
// Twilight sky over the city. A small biplane flies left across the screen,
// trailing a contrail. Four clouds drift in from the right, each marked with
// a small icon and connected to a floating nameplate-callout pill that holds
// the option text. Player taps the cloud bearing the correct answer before
// the plane reaches it. Wrong cloud = lightning flash, plane dips. Right
// cloud = the plane bursts through it (cloud puff dissolves), then a new
// round begins.
//
// Visual identity: continuous LATERAL motion. The sky is alive — clouds drift
// at slightly different speeds (parallax). The plane is the player's avatar.
// The contrail is the progress trail across the sky.
//
// 2026-05-02 (Ricky) — Aerodrome revamp pass per CD audit §5:
//   1. Cloud spawn-zone bounded so nameplate labels never clip viewport edge
//   2. Detailed biplane SVG (fuselage + twin wings + struts + propeller +
//      cockpit Bajla + engine smoke trail + banked-turn animation)
//   3. Three cloud variants (cumulus / cirrus / nimbus) with parallax drift
//   4. Nameplate-callout pattern (label is a separate dark pill BELOW the
//      cloud, connected via dashed line) — replaces in-cloud text that
//      truncated at viewport edge
//   5. Triple counter cleanup — drop HIT/MISS from header, keep Q N/M only;
//      tally surfaces in completion screen
//   6. Theme + subtitle: "The Aerodrome" / "Airplane · Samolot · navigate
//      the skies — pick the right cloud"
//
// Persisted progress — Convex-backed.
import { useShellProgress } from '../lib/convex-stubs';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import React, { useEffect, useRef, useState } from 'react';
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

// Aerodrome · Airplane — full bilingual instruction copy.
const AIRPLANE_INSTRUCTIONS: FullInstructions = {
  "whatYouDo": {
    "en": [
      "Launch the plane and fly through the gate carrying the word that fits the clue."
    ],
    "pl": [
      "Wystartuj i przeleć przez bramkę ze słowem pasującym do wskazówki."
    ]
  },
  "controls": {
    "en": [
      "Up/Down, W/S, on-screen buttons or tapping a gate change altitude. Crossing the gate commits your lane. Pause any flight. Reduced motion uses a static gate-confirm button."
    ],
    "pl": [
      "Strzałki góra/dół, W/S, przyciski lub stuknięcie bramki zmieniają wysokość. Przelot zatwierdza pas. Lot można wstrzymać. Przy ograniczonym ruchu zatwierdź nieruchomą bramkę."
    ]
  },
  "rightWrongSkip": {
    "en": [
      "The gate crossing records your answer and moves to the next flight. Wrong answers and skipped flights appear in review."
    ],
    "pl": [
      "Przelot zapisuje odpowiedź i przechodzi do kolejnego lotu. Błędy i pominięcia trafiają do powtórki."
    ]
  },
  "hintMechanic": {
    "en": "Use the limited Hint button for help with the current clue.",
    "pl": "Użyj ograniczonej liczby podpowiedzi do aktualnej wskazówki."
  },
  "scoring": {
    "en": "Cruise earns 100 arcade points, Jet earns 150 for a correct gate.",
    "pl": "Cruise daje 100 punktów, Jet 150 za dobrą bramkę."
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

export type AirplaneForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface AirplaneShellProps {
  time?: TimeOfDay;
  state?: AirplaneForcedState;
  puzzle?: WrapperPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3 Wave-5 (Ricky 2026-05-02): per-cloud review payload. Fires once when
   * the student has worked through every cloud-round in the deck.
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
// renderAirplaneReviewItem — per-cloud locked render for PracticeReview.
// Aerodrome scoreboard: cloud-label option grid + ✓ HIT · ✗ MISS chip.
// ─────────────────────────────────────────────────────────────────────────
const AP_REVIEW_ACCENT = '#7DD3FC';
export function renderAirplaneReviewItem(
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
        : 'linear-gradient(180deg, rgba(125,211,252,0.10), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(125,211,252,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${AP_REVIEW_ACCENT}22`, color: AP_REVIEW_ACCENT,
          border: `1px solid ${AP_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          CLOUD {String(number).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(125,211,252,0.22)',
          color: isWrong ? '#FB7185' : AP_REVIEW_ACCENT,
        }}>
          {isWrong ? '✗ MISS · CHYBIONY' : '✓ HIT · TRAFIONY'}
        </span>
        {/* Biplane bank-angle indicator (decorative). */}
        <span aria-hidden="true" style={{ marginLeft: 'auto', fontSize: 14, opacity: 0.7, transform: isWrong ? 'rotate(8deg)' : 'rotate(-6deg)', display: 'inline-block' }}>✈️</span>
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
                ? 'rgba(125,211,252,0.20)'
                : showWrong
                  ? 'rgba(251,113,133,0.18)'
                  : 'rgba(245,239,255,0.04)',
              border: `1px solid ${showCorrect ? '#7DD3FC88' : showWrong ? '#FB718588' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? AP_REVIEW_ACCENT : showWrong ? '#FB7185' : 'var(--em-text, #EDE6FF)',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontFamily: 'var(--em-mono)', fontSize: 9, color: AP_REVIEW_ACCENT, opacity: 0.7, minWidth: 14 }}>{String.fromCharCode(65 + oi)}</span>
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

const AP_DEMO: WrapperPuzzle = {
  rounds: [
    { id: 'cloud', prompt: 'A puff of water vapour in the sky is a ___.', options: ['fog', 'cloud', 'mist', 'storm'], answerIndex: 1, hint: 'You can see one from below.', hint_pl: 'Po polsku: chmura.' },
    { id: 'wing', prompt: 'A part that lets a plane fly is its ___.', options: ['wing', 'wheel', 'tail', 'door'], answerIndex: 0, hint: 'There are two — one each side.', hint_pl: 'Po polsku: skrzydło.' },
    { id: 'runway', prompt: 'The long strip a plane uses to take off is the ___.', options: ['platform', 'pier', 'runway', 'avenue'], answerIndex: 2, hint: 'Numbered with big letters.', hint_pl: 'Po polsku: pas startowy.' },
    { id: 'takeoff', prompt: 'The moment a plane leaves the ground is ___.', options: ['descent', 'landing', 'takeoff', 'taxi'], answerIndex: 2, hint: 'Opposite of landing.', hint_pl: 'Po polsku: start.' },
    { id: 'altitude', prompt: 'How high above the ground you are is your ___.', options: ['speed', 'pressure', 'altitude', 'mass'], answerIndex: 2, hint: 'Measured in feet or metres.', hint_pl: 'Po polsku: wysokość.' },
    { id: 'descent', prompt: 'When a plane goes down toward the airport it is in ___.', options: ['descent', 'climb', 'cruise', 'taxi'], answerIndex: 0, hint: 'The opposite of climb.', hint_pl: 'Po polsku: opadanie.' },
  ],
};

const ACCENT = '#7DD3FC';
const PLANE_X_PCT = 12; // plane sits at this % from left

// Cloud variant catalog — three shapes drift at three speeds for parallax.
type CloudVariant = 'cumulus' | 'cirrus' | 'nimbus';
const CLOUD_VARIANTS: CloudVariant[] = ['cumulus', 'cirrus', 'nimbus'];

interface CloudModel {
  optionIdx: number;
  text: string;
  variant: CloudVariant;
  yPct: number;       // vertical position 18..68
  xPct: number;       // current horizontal position
  speedPct: number;   // % of width to drift per second
  scale: number;
  hue: number;
}

// Approximate label width: text length × 8px + 24px pill padding + 4px
// borders. The cloud body is ~160px wide and the nameplate sits centred
// under it, so the wider of (cloud, label) defines the safe spawn band.
function approxLabelWidthPx(text: string): number {
  return Math.max(60, text.length * 8 + 28);
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

export const AirplaneShell: React.FC<AirplaneShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const active: WrapperPuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : AP_DEMO;
  const persisted = useShellProgress('airplane');
  const arcadeEvent = useArcadeEvents();
  const interactionRef = useRef<HTMLDivElement>(null);
  const { later, cancel: cancelActionTimers } = useActionTimers();
  // D3 Wave-5 (Ricky 2026-05-02): per-round student-pick log so the review
  // shows what the student tapped per cloud (last-pick semantics).
  const [studentPicks, setStudentPicks] = useState<Record<string, string>>({});

  const [idx, setIdx] = useState<number>(0);
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  const [pickedOption, setPickedOption] = useState<number | null>(null);
  const [score, setScore] = useState<{ right: number; wrong: number }>({ right: 0, wrong: 0 });
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [revealedHint, setRevealedHint] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const [lane, setLane] = useState(0);
  const laneRef = useRef(0);
  const [flying, setFlying] = useState(false);
  const [gateX, setGateX] = useState(82);
  const gateRef = useRef(82);
  const flightResolved = useRef(false);
  const [flightPace, setFlightPace] = useState<'cruise' | 'jet'>('cruise');
  const [planeBob, setPlaneBob] = useState<number>(0); // for hit/miss reaction
  const [planeBank, setPlaneBank] = useState<number>(0); // banked-turn rotation degrees
  const [clouds, setClouds] = useState<CloudModel[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const skyRef = useRef<HTMLDivElement | null>(null);
  const [skyWidth, setSkyWidth] = useState<number>(1200);
  // Kelly Tier-2 (2026-05-02): JS-driven cloud drift respects OS reduced-motion.
  // When true, clouds spawn at static distributed positions inside the visible
  // area so the player can pick at leisure with zero lateral motion.
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

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'airplane',
      brief: AIRPLANE_INSTRUCTIONS.whatYouDo.en[0],
      brief_pl: AIRPLANE_INSTRUCTIONS.whatYouDo.pl[0],
      detail: AIRPLANE_INSTRUCTIONS.controls.en.join(' ') + ' ' + AIRPLANE_INSTRUCTIONS.rightWrongSkip.en.join(' '),
      detail_pl: AIRPLANE_INSTRUCTIONS.controls.pl.join(' ') + ' ' + AIRPLANE_INSTRUCTIONS.rightWrongSkip.pl.join(' '),
      fullInstructions: AIRPLANE_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  // Track sky width so the spawn-zone math has a real px target rather than
  // a guess. ResizeObserver keeps it accurate on viewport changes.
  useEffect(() => {
    const el = skyRef.current;
    if (!el) return;
    const update = (): void => setSkyWidth(el.clientWidth || 1200);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [round]);

  // Each cloud is a flight gate. Steering changes altitude; crossing a gate commits the answer.
  const laneY = (i: number) => 14 + i * 70 / Math.max(1, (round?.options.length ?? 4) - 1);
  useEffect(() => {
    if (!round) return;
    setClouds(round.options.map((text, optionIdx) => ({ optionIdx, text, variant: CLOUD_VARIANTS[optionIdx % CLOUD_VARIANTS.length], yPct: laneY(optionIdx), xPct: 82, speedPct: 12, scale: 1, hue: 205 + optionIdx * 12 })));
    setFlying(false); setGateX(82); gateRef.current = 82; flightResolved.current = false;
    setLane(0); laneRef.current = 0;
  }, [round?.id]);
  const steer = (next: number) => {
    if (!round || verdict !== null || forcedState || completed) return;
    const bounded = Math.max(0, Math.min(round.options.length - 1, next));
    setPlaneBank(bounded > laneRef.current ? 10 : -10); laneRef.current = bounded; setLane(bounded);
    later(() => setPlaneBank(0), 240);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!interactionRef.current?.contains(event.target as Node)) return;
      if ((event.target as HTMLElement)?.closest('input,textarea,select') || completed) return;
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') { event.preventDefault(); steer(laneRef.current - 1); }
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') { event.preventDefault(); steer(laneRef.current + 1); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [round?.id, verdict, completed]);
  useEffect(() => {
    if (!flying || verdict !== null || completed || forcedState || reduceMotion) return;
    let previous = performance.now(); let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(.04, (now - previous) / 1000); previous = now;
      gateRef.current -= dt * (flightPace === 'jet' ? 22 : 12);
      setGateX(gateRef.current);
      if (gateRef.current <= PLANE_X_PCT + 3 && !flightResolved.current) {
        flightResolved.current = true; setFlying(false); onTapCloud(laneRef.current); return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame); return () => cancelAnimationFrame(raf);
  }, [flying, verdict, completed, forcedState, reduceMotion, flightPace]);

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

  const onTapCloud = (optionIdx: number): void => {
    if (forcedState || verdict !== null || !round) return;
    setPickedOption(optionIdx);
    const right = optionIdx === round.answerIndex;
    setVerdict(right ? 'right' : 'wrong');
    arcadeEvent({ type: right ? 'correct' : 'incorrect', points: flightPace === 'jet' ? 150 : 100 });
    setPlaneBob(right ? -8 : 12);
    setAnnouncement(right ? 'Correct.' : `Wrong. The right one was ${round.options[round.answerIndex]}.`);
    // D3 Wave-5: log per-round pick so review can show last student pick.
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

  // After verdict pause, advance to next round.
  useEffect(() => {
    if (verdict === null || forcedState) return;
    const t = later(() => {
      setIdx((i) => i + 1);
      setVerdict(null);
      setPickedOption(null);
      setRevealedHint(false);
      setPlaneBob(0);
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
    setFlying(false); setGateX(82); gateRef.current = 82; flightResolved.current = false; setStudentPicks({});
    setIdx(0); setVerdict(null); setPickedOption(null); setScore({ right: 0, wrong: 0 });
    setHintsUsed(0); setRevealedHint(false); tip.reset(); setPlaneBob(0);
  };

  const grad = time === 'day'
    ? 'linear-gradient(180deg, #6E4FB7 0%, #C58BD9 50%, #F4D5BA 100%)'
    : time === 'dusk'
      ? 'linear-gradient(180deg, #1F1240 0%, #4F1E78 30%, #B85A88 70%, #FBBF24 100%)'
      : 'linear-gradient(180deg, #02010C 0%, #100829 50%, #2A1450 100%)';

  // Distant skyline silhouette
  const skylineFill = time === 'night' ? '#080418' : '#1A0B30';

  return (
    <div
      className="em-shell em-shell-airplane"
      ref={interactionRef}
      tabIndex={0}
      onPointerDown={event => { if (!(event.target as HTMLElement).closest('button,a,input,textarea,select')) interactionRef.current?.focus({ preventScroll: true }); }}
      role="application"
      aria-label="Airplane, The Aerodrome"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: grad }}
    >
      <style>{`
        @keyframes em-ap-plane-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes em-ap-plane-dive { 0% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(18px) rotate(8deg); } 100% { transform: translateY(0) rotate(0deg); } }
        @keyframes em-ap-plane-rise { 0% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-14px) rotate(-6deg); } 100% { transform: translateY(0) rotate(0deg); } }
        @keyframes em-ap-cloud-puff { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(1.6); } }
        @keyframes em-ap-flash { 0%, 100% { opacity: 0; } 50% { opacity: 0.6; } }
        @keyframes em-prop-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes em-ap-trail-fade { from { opacity: 0.7; } to { opacity: 0; } }
        @keyframes em-ap-star-twinkle { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.9; } }
        @keyframes em-smoke-rise {
          0%   { transform: translate(0, 0) scale(1);   opacity: 0.55; }
          100% { transform: translate(-22px, -18px) scale(1.6); opacity: 0; }
        }
        @keyframes em-cirrus-drift {
          0%, 100% { transform: translate(-50%, -50%) translateX(0px); }
          50%      { transform: translate(-50%, -50%) translateX(8px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .em-ap-prop-blade, .em-ap-smoke { animation: none !important; }
        }
        /* Mike playtest fix (Ricky 2026-05-03): replace browser default focus
           rectangle on cloud buttons with a designed soft-glow ring. The
           default UA outline produced a dark grey rectangle that read as a
           debug placeholder. Now: outline removed by default, custom glow
           shown on focus-visible (keyboard nav) — pointer-clicks no longer
           leave a stuck rectangle. */
        .em-ap-cloud-btn { outline: none; -webkit-tap-highlight-color: transparent; }
        .em-ap-cloud-btn:focus { outline: none; }
        .em-ap-cloud-btn:focus-visible {
          outline: none;
          filter: drop-shadow(0 0 12px ${ACCENT}cc) drop-shadow(0 0 4px ${ACCENT});
        }
        .em-ap-cloud-btn::-moz-focus-inner { border: 0; }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      {/* Stars (only at dusk/night) */}
      {time !== 'day' && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${(i * 13.7) % 100}%`,
              top: `${(i * 7.3) % 50}%`,
              width: 2, height: 2, borderRadius: '50%',
              background: '#F4EFEF', opacity: 0.5,
              animation: `em-ap-star-twinkle ${2 + (i % 4) * 0.5}s ease-in-out ${i * 0.07}s infinite`,
            }} />
          ))}
        </div>
      )}

      {/* Distant skyline silhouette */}
      <svg aria-hidden="true" viewBox="0 0 1200 200" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '24%', pointerEvents: 'none', opacity: 0.7 }}>
        <path d="M0 200 L0 140 L80 140 L80 100 L120 100 L120 130 L180 130 L180 80 L220 80 L220 110 L280 110 L280 60 L320 60 L320 100 L380 100 L380 130 L440 130 L440 80 L490 80 L490 50 L540 50 L540 90 L600 90 L600 120 L660 120 L660 80 L720 80 L720 40 L770 40 L770 90 L830 90 L830 130 L890 130 L890 80 L950 80 L950 110 L1010 110 L1010 70 L1070 70 L1070 110 L1130 110 L1130 140 L1200 140 L1200 200 Z" fill={skylineFill} />
      </svg>

      {/* Lit windows on skyline */}
      {time !== 'day' && Array.from({ length: 36 }).map((_, i) => (
        <div key={`win-${i}`} aria-hidden="true" style={{
          position: 'absolute',
          left: `${(i * 11.3) % 100}%`,
          bottom: `${4 + (i * 5) % 16}%`,
          width: 2, height: 2,
          background: i % 5 === 0 ? '#FBBF24' : '#F4E4A1',
          opacity: 0.6,
        }} />
      ))}

      {/* Top bar — single canonical Q N/M counter (CD audit #14 cleanup). */}
      {/* HIT/MISS tally moved to a small chip pair beside Progress; no longer */}
      {/* a redundant counter, and surfaces fully on the completion screen. */}
      <div className="action-flying-header" style={{ position: 'absolute', top: 28, left: 28, right: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 6, gap: 12, flexWrap: 'wrap' }}>
        <AmbientAudioPlayer shellSlug="airplane" />
        <Nameplate
          district="The Aerodrome"
          subtitle="Airplane · Samolot · navigate the skies — pick the right cloud"
          accent={ACCENT}
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M2 12 L20 6 L18 12 L20 18 Z" stroke={ACCENT} strokeWidth="1.6" strokeLinejoin="round" /></svg>}
        />
        <div className="action-flying-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Progress current={Math.min(idx + 1, active.rounds.length)} total={active.rounds.length} accent={ACCENT} />
          {/* Compact tally chip — single inline element, not a duplicate counter. */}
          <div
            aria-label={`Score: ${score.right} hit, ${score.wrong} miss`}
            style={{
              display: 'inline-flex', gap: 6, alignItems: 'center',
              padding: '4px 10px', borderRadius: 999,
              background: 'rgba(14,10,26,0.55)',
              border: '1px solid rgba(125,211,252,0.25)',
              fontFamily: 'var(--em-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
            }}
          >
            <span style={{ color: '#34D399' }}>✓ {score.right}</span>
            <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
            <span style={{ color: '#FB7185' }}>✗ {score.wrong}</span>
          </div>
          <SkipButton onClick={() => { if (verdict !== null || !round) return; setFlying(false); arcadeEvent({ type: 'incorrect' }); tip.recordWrong({ questionId: round.id, studentAnswer: 'Skipped', correctAnswer: round.options[round.answerIndex], explanationPL: round.hint_pl, exerciseId: round.exerciseId }); setIdx(i => i + 1); }} />
          <HintButton onClick={useHint} used={hintsUsed} total={2} />
        </div>
      </div>

      {/* Question prompt — pinned top-center */}
      {!completed && round && (
        <div className="action-flying-question" style={{
          position: 'absolute', top: 96, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 'min(620px, 80%)', padding: '12px 22px',
          background: 'linear-gradient(180deg, rgba(20,8,42,0.85) 0%, rgba(8,4,26,0.9) 100%)',
          border: `1px solid ${ACCENT}66`, borderRadius: 14,
          boxShadow: `0 18px 36px rgba(0,0,0,0.4), 0 0 18px ${ACCENT}33`,
          zIndex: 5, textAlign: 'center',
        }}>
          <div className="em-eyebrow" style={{ color: ACCENT, marginBottom: 4 }}>QUESTION · PYTANIE {String(idx + 1).padStart(2, '0')}</div>
          <div className="em-decor" style={{ fontSize: 18, color: 'var(--em-text)', lineHeight: 1.35 }}>{round.prompt}</div>
          {revealedHint && <div style={{ marginTop: 6, fontSize: 12, color: ACCENT, fontStyle: 'italic' }}>💡 {round.hint}</div>}
        </div>
      )}

      {/* Sky play area — clouds drift across, plane sits left */}
      <div ref={skyRef} className="action-flight-sky" style={{ position: 'absolute', top: 200, left: 0, right: 0, bottom: 130, zIndex: 3 }}>
        {round?.options.map((word, i) => <div key={i} className="action-flight-lane" style={{ top: `${laneY(i)}%` }}><span>{i + 1}</span></div>)}
        {/* Plane contrail — fixed strip behind plane */}
        <div aria-hidden="true" style={{
          position: 'absolute', left: `${PLANE_X_PCT + 4}%`, right: 0, top: `${laneY(lane)}%`, height: 6,
          transform: 'translateY(-50%)',
          background: `linear-gradient(90deg, ${ACCENT}aa 0%, transparent 60%)`,
          filter: 'blur(2px)', opacity: 0.6,
        }} />

        {/* Plane — detailed biplane: fuselage + twin wings + struts +    */}
        {/* propeller (CSS spin) + cockpit Bajla + engine smoke trail.    */}
        {/* Banked-turn rotation set via planeBank state when answer-cloud */}
        {/* altitude changes round-to-round.                              */}
        <div aria-hidden="true" style={{
          position: 'absolute', left: `${PLANE_X_PCT}%`, top: `${laneY(lane)}%`,
          transform: `translate(-50%, calc(-50% + ${planeBob}px)) rotate(${planeBank}deg)`,
          transition: reduceMotion ? 'none' : 'top 240ms ease, transform 240ms ease',
          zIndex: 5,
          transformOrigin: 'center center',
        }}>
          {/* Engine smoke trail — 5 small grey puffs behind the prop. */}
          <div style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, pointerEvents: 'none' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={`smoke-${i}`}
                className="em-ap-smoke"
                style={{
                  position: 'absolute',
                  right: -8 - i * 6, top: -3 + (i % 2) * 4,
                  width: 7 + i, height: 7 + i, borderRadius: '50%',
                  background: 'rgba(220,220,235,0.45)',
                  filter: 'blur(1px)',
                  animation: `em-smoke-rise ${1.4 + i * 0.18}s ease-out ${i * 0.18}s infinite`,
                }}
              />
            ))}
          </div>

          <svg width="130" height="80" viewBox="0 0 130 80">
            <defs>
              <linearGradient id="ap-fuselage" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#A0521D" />
                <stop offset="40%" stopColor="#8B4513" />
                <stop offset="100%" stopColor="#5A2D0C" />
              </linearGradient>
              <linearGradient id="ap-cream-stripe" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#F4EFEF" />
                <stop offset="100%" stopColor="#D4C4A8" />
              </linearGradient>
              <radialGradient id="ap-cockpit-glass" cx="40%" cy="35%">
                <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#1F0E40" stopOpacity="0.85" />
              </radialGradient>
            </defs>

            {/* Tail wing (vertical stabiliser) — back of plane */}
            <polygon points="14,40 26,28 30,40 26,52" fill="#A0521D" stroke="#0E0A1A" strokeWidth="1.4" strokeLinejoin="round" />
            {/* Tail horizontal stabiliser */}
            <ellipse cx="22" cy="40" rx="14" ry="3" fill="#8B4513" stroke="#0E0A1A" strokeWidth="1.2" />

            {/* Lower wing (biplane bottom) */}
            <ellipse cx="68" cy="50" rx="32" ry="4" fill="#7DD3FC" stroke="#0E0A1A" strokeWidth="1.4" />
            {/* Lower wing detail line */}
            <line x1="40" y1="50" x2="96" y2="50" stroke="#1F0E40" strokeWidth="0.6" opacity="0.4" />

            {/* Fuselage (main body — wood-tone with cream stripe band) */}
            <ellipse cx="68" cy="40" rx="42" ry="10" fill="url(#ap-fuselage)" stroke="#0E0A1A" strokeWidth="1.5" />
            {/* Cream stripe band along fuselage */}
            <rect x="32" y="38" width="76" height="3" fill="url(#ap-cream-stripe)" opacity="0.85" />
            {/* Side rivet/window dots */}
            {[44, 52, 60].map((x, i) => (
              <circle key={`rv-${i}`} cx={x} cy="40" r="0.8" fill="#0E0A1A" opacity="0.5" />
            ))}

            {/* Strut connectors between upper + lower wings */}
            <line x1="50" y1="30" x2="50" y2="50" stroke="#0E0A1A" strokeWidth="1.4" />
            <line x1="86" y1="30" x2="86" y2="50" stroke="#0E0A1A" strokeWidth="1.4" />
            <line x1="68" y1="30" x2="68" y2="50" stroke="#0E0A1A" strokeWidth="1" opacity="0.6" />
            {/* Diagonal bracing wire */}
            <line x1="50" y1="30" x2="86" y2="50" stroke="#F4EFEF" strokeWidth="0.5" opacity="0.4" />
            <line x1="86" y1="30" x2="50" y2="50" stroke="#F4EFEF" strokeWidth="0.5" opacity="0.4" />

            {/* Upper wing (biplane top) */}
            <ellipse cx="68" cy="30" rx="34" ry="4" fill="#7DD3FC" stroke="#0E0A1A" strokeWidth="1.4" />
            <line x1="38" y1="30" x2="98" y2="30" stroke="#1F0E40" strokeWidth="0.6" opacity="0.4" />

            {/* Cockpit canopy with Bajla — open biplane cockpit */}
            <ellipse cx="82" cy="36" rx="9" ry="6" fill="url(#ap-cockpit-glass)" stroke="#0E0A1A" strokeWidth="1.2" />
            {/* Bajla face — small head with goggles + scarf */}
            <g>
              {/* Scarf trailing back */}
              <path d="M 78 38 Q 70 40 64 42 Q 68 39 76 37 Z" fill="#FB7185" stroke="#0E0A1A" strokeWidth="0.6" />
              {/* Head */}
              <circle cx="82" cy="35" r="4" fill="#F4D5BA" stroke="#0E0A1A" strokeWidth="0.8" />
              {/* Leather pilot cap (top dome) */}
              <path d="M 78 33 Q 82 30 86 33 L 86 35 L 78 35 Z" fill="#5A2D0C" stroke="#0E0A1A" strokeWidth="0.6" />
              {/* Goggles — two small circles connected by strap */}
              <circle cx="80" cy="34.5" r="1.4" fill="#1F0E40" stroke="#F4EFEF" strokeWidth="0.5" />
              <circle cx="84" cy="34.5" r="1.4" fill="#1F0E40" stroke="#F4EFEF" strokeWidth="0.5" />
              <line x1="81.4" y1="34.5" x2="82.6" y2="34.5" stroke="#5A2D0C" strokeWidth="0.5" />
              {/* Goggle reflection sparkle */}
              <circle cx="80.4" cy="34.2" r="0.4" fill="#7DD3FC" />
              <circle cx="84.4" cy="34.2" r="0.4" fill="#7DD3FC" />
              {/* Smile */}
              <path d="M 80.5 36.5 Q 82 37.4 83.5 36.5" fill="none" stroke="#0E0A1A" strokeWidth="0.5" strokeLinecap="round" />
            </g>

            {/* Engine cowling — front cap of plane */}
            <ellipse cx="108" cy="40" rx="6" ry="9" fill="#5A2D0C" stroke="#0E0A1A" strokeWidth="1.2" />
            <ellipse cx="110" cy="40" rx="3" ry="6" fill="#3A1A06" />

            {/* Propeller hub */}
            <circle cx="114" cy="40" r="2.5" fill="#0E0A1A" />
            {/* Propeller blades — spin via em-prop-spin (linear 0.15s infinite) */}
            <g
              className="em-ap-prop-blade"
              style={{ transformOrigin: '114px 40px', animation: 'em-prop-spin 0.15s linear infinite' }}
            >
              <ellipse cx="114" cy="26" rx="1.6" ry="14" fill="#1F0E40" opacity="0.55" />
              <ellipse cx="114" cy="54" rx="1.6" ry="14" fill="#1F0E40" opacity="0.55" />
              {/* Centre cap shine */}
              <circle cx="114" cy="40" r="1" fill="#F4EFEF" opacity="0.6" />
            </g>

            {/* Landing gear — small wheels under fuselage */}
            <line x1="58" y1="50" x2="58" y2="58" stroke="#0E0A1A" strokeWidth="1.2" />
            <line x1="78" y1="50" x2="78" y2="58" stroke="#0E0A1A" strokeWidth="1.2" />
            <circle cx="58" cy="60" r="3" fill="#1F0E40" stroke="#0E0A1A" strokeWidth="0.8" />
            <circle cx="78" cy="60" r="3" fill="#1F0E40" stroke="#0E0A1A" strokeWidth="0.8" />
          </svg>
        </div>

        {/* Lightning flash on wrong answer */}
        {verdict === 'wrong' && (
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0, background: 'rgba(251,113,133,0.4)',
            animation: 'em-ap-flash 0.5s var(--em-ease)', pointerEvents: 'none', zIndex: 8,
          }} />
        )}

        {/* Clouds — each is a tappable target. Three SVG variants            */}
        {/* (cumulus / cirrus / nimbus) chosen by index modulo 3 with         */}
        {/* parallax drift speeds set in the cloud model. Cloud body holds    */}
        {/* only a small ICON; option text lives in a separate dark pill      */}
        {/* nameplate floating ~12px below, connected by a 1px dashed white   */}
        {/* line. Nameplate width auto-fits — no clip.                        */}
        {clouds.map((c) => {
          const isAnswer = c.optionIdx === round?.answerIndex;
          const isPicked = pickedOption === c.optionIdx;
          const showRight = verdict === 'right' && isPicked;
          const showWrong = verdict === 'wrong' && isPicked;
          const dim = verdict !== null && !isAnswer && !isPicked;
          // Position offsets per variant: nimbus rides lower, cirrus floats higher.
          const yOffset = c.variant === 'nimbus' ? 8 : c.variant === 'cirrus' ? -6 : 0;
          const cloudIcon = String.fromCharCode(65 + c.optionIdx); // A, B, C, D
          return (
            <button
              key={c.optionIdx}
              type="button"
              className="em-ap-cloud-btn"
              onClick={() => steer(c.optionIdx)}
              aria-pressed={lane === c.optionIdx}
              disabled={!!forcedState || verdict !== null || completed}
              aria-label={`Cloud labelled ${c.text}`}
              style={{
                position: 'absolute',
                left: `${gateX}%`, top: `${c.yPct}%`,
                transform: `translate(-50%, -50%) scale(${c.scale})`,
                background: 'transparent', border: 'none', padding: 0,
                cursor: verdict !== null || completed ? 'default' : 'pointer',
                opacity: dim ? 0.35 : 1,
                animation: showRight ? 'em-ap-cloud-puff 0.7s var(--em-ease) forwards' : 'none',
                transition: 'opacity 320ms',
                width: 180, height: 160,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                // Defensive: guarantee no UA-default focus rectangle even if
                // the stylesheet failed to attach. The class above is the
                // primary mechanism; this is a belt-and-suspenders.
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <svg width="180" height="100" viewBox="0 0 180 100" style={{ display: 'block' }}>
                <defs>
                  <radialGradient id={`cloud-grad-${c.optionIdx}`} cx="50%" cy="40%">
                    <stop offset="0%" stopColor="#F4EFEF" stopOpacity="0.95" />
                    <stop offset="100%" stopColor={
                      c.variant === 'nimbus'
                        ? `hsl(${c.hue}, 18%, 58%)`
                        : `hsl(${c.hue}, 35%, 78%)`
                    } stopOpacity="0.92" />
                  </radialGradient>
                  <filter id={`cloud-soft-${c.optionIdx}`}>
                    <feGaussianBlur stdDeviation="0.4" />
                  </filter>
                </defs>

                {/* Variant: cumulus — rounded puffy stack of overlapping ellipses */}
                {c.variant === 'cumulus' && (
                  <g filter={`url(#cloud-soft-${c.optionIdx})`}>
                    <ellipse cx="50" cy="62" rx="30" ry="22" fill={`url(#cloud-grad-${c.optionIdx})`} />
                    <ellipse cx="86" cy="42" rx="38" ry="30" fill={`url(#cloud-grad-${c.optionIdx})`} />
                    <ellipse cx="124" cy="58" rx="32" ry="26" fill={`url(#cloud-grad-${c.optionIdx})`} />
                    <ellipse cx="150" cy="68" rx="22" ry="18" fill={`url(#cloud-grad-${c.optionIdx})`} />
                    {/* Underside shadow band */}
                    <ellipse cx="92" cy="78" rx="60" ry="6" fill="rgba(31,14,64,0.18)" />
                  </g>
                )}

                {/* Variant: cirrus — wispy stretched horizontal streaks */}
                {c.variant === 'cirrus' && (
                  <g filter={`url(#cloud-soft-${c.optionIdx})`} style={{ animation: 'em-cirrus-drift 6s ease-in-out infinite' }}>
                    <ellipse cx="60" cy="48" rx="40" ry="6" fill={`url(#cloud-grad-${c.optionIdx})`} opacity="0.85" />
                    <ellipse cx="100" cy="42" rx="55" ry="8" fill={`url(#cloud-grad-${c.optionIdx})`} opacity="0.9" />
                    <ellipse cx="140" cy="50" rx="32" ry="5" fill={`url(#cloud-grad-${c.optionIdx})`} opacity="0.8" />
                    <ellipse cx="80" cy="56" rx="28" ry="4" fill={`url(#cloud-grad-${c.optionIdx})`} opacity="0.7" />
                  </g>
                )}

                {/* Variant: nimbus — darker, denser, lower-position storm cloud */}
                {c.variant === 'nimbus' && (
                  <g filter={`url(#cloud-soft-${c.optionIdx})`}>
                    <ellipse cx="55" cy="60" rx="34" ry="24" fill={`url(#cloud-grad-${c.optionIdx})`} />
                    <ellipse cx="92" cy="48" rx="42" ry="32" fill={`url(#cloud-grad-${c.optionIdx})`} />
                    <ellipse cx="130" cy="60" rx="36" ry="28" fill={`url(#cloud-grad-${c.optionIdx})`} />
                    {/* Heavier underside shadow */}
                    <ellipse cx="92" cy="80" rx="68" ry="9" fill="rgba(14,10,26,0.32)" />
                    {/* A few rain dashes */}
                    <line x1="70" y1="86" x2="68" y2="92" stroke="#7DD3FC" strokeWidth="1" opacity="0.5" />
                    <line x1="92" y1="88" x2="90" y2="94" stroke="#7DD3FC" strokeWidth="1" opacity="0.5" />
                    <line x1="114" y1="86" x2="112" y2="92" stroke="#7DD3FC" strokeWidth="1" opacity="0.5" />
                  </g>
                )}

                {/* State ring (correct/wrong commit feedback) */}
                {(showRight || showWrong) && (
                  <ellipse cx="90" cy="56" rx="70" ry="38"
                    fill="none" stroke={showRight ? '#34D399' : '#FB7185'} strokeWidth="3"
                    style={{ filter: `drop-shadow(0 0 12px ${showRight ? '#34D399' : '#FB7185'})` }} />
                )}

                {/* Small icon badge in cloud body — A/B/C/D, not the option text */}
                <circle cx="90" cy="48" r="14" fill="rgba(14,10,26,0.78)" stroke="#F4EFEF" strokeWidth="1.4" />
                <text x="90" y="48" textAnchor="middle" dominantBaseline="central"
                  fontFamily="var(--em-mono), monospace" fontSize="14" fill="#F4EFEF" fontWeight="700">
                  {cloudIcon}
                </text>
              </svg>

              {/* Connector line — 1px dashed white between cloud body and nameplate */}
              <svg width="2" height="14" viewBox="0 0 2 14" aria-hidden="true" style={{ display: 'block', marginTop: -6 }}>
                <line x1="1" y1="0" x2="1" y2="14" stroke="#F4EFEF" strokeWidth="1" strokeDasharray="2 2" opacity="0.7" />
              </svg>

              {/* Nameplate-callout pill — dark background, auto-fit width, no clip. */}
              <div style={{
                marginTop: 2,
                padding: '6px 14px', borderRadius: 12,
                background: 'rgba(14,10,26,0.88)',
                color: '#F4EFEF',
                fontFamily: 'var(--em-decor), Caprasimo, Georgia, serif',
                fontSize: 14, fontWeight: 700,
                border: showRight ? '1.5px solid #34D399' : showWrong ? '1.5px solid #FB7185' : `1px solid ${ACCENT}66`,
                boxShadow: '0 6px 12px rgba(0,0,0,0.45)',
                whiteSpace: 'nowrap', letterSpacing: '0.02em',
                pointerEvents: 'none',
              }}>{c.text}</div>
            </button>
          );
        })}
      </div>

      {!completed && <div className="action-flight-control action-arcade-controls"><p>{flying ? 'STEER THROUGH THE RIGHT WORD · ↑ / ↓ or W / S' : 'Read the clue. Choose a lane, then launch.'}</p><button aria-label="Climb one lane" onClick={() => steer(laneRef.current - 1)}>↑ Climb</button><button aria-label="Descend one lane" onClick={() => steer(laneRef.current + 1)}>↓ Descend</button><button disabled={verdict !== null} onClick={() => { if (reduceMotion) onTapCloud(laneRef.current); else setFlying(v => !v); }}>{reduceMotion ? 'Fly through selected gate' : flying ? 'Pause flight' : gateX < 82 ? 'Resume flight' : 'Launch flight'}</button><button disabled={flying} onClick={() => setFlightPace(p => p === 'cruise' ? 'jet' : 'cruise')}>{flightPace === 'jet' ? 'Jet · 150 pts' : 'Cruise · 100 pts'}</button></div>}
      {/* Completion */}
      {completed && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Aerodrome complete"
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
            animation: 'em-rise 0.4s var(--em-ease)', zIndex: 10,
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>Wheels down. Safe landing.</div>
          <div className="em-eyebrow">RUNWAY CLEAR · LĄDOWANIE UDANE</div>
          <div style={{ display: 'flex', gap: 28, alignItems: 'baseline' }}>
            <div style={{ textAlign: 'center' }}><div className="em-decor" style={{ fontSize: 44, color: '#34D399' }}>{score.right}</div><div className="em-eyebrow" style={{ color: '#34D399' }}>HIT · TRAFIONE</div></div>
            <div style={{ textAlign: 'center' }}><div className="em-decor" style={{ fontSize: 44, color: '#FB7185' }}>{score.wrong}</div><div className="em-eyebrow" style={{ color: '#FB7185' }}>MISS · CHYBIONE</div></div>
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

export default AirplaneShell;
