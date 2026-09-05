import { ActionPlayfield3D } from './action-arcade-three';
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
const AP_REVIEW_ACCENT = '#00cfff';
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
          color: isWrong ? '#ff3871' : AP_REVIEW_ACCENT,
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
              border: `1px solid ${showCorrect ? '#00cfff88' : showWrong ? '#ff387188' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? AP_REVIEW_ACCENT : showWrong ? '#ff3871' : 'var(--em-text, #EDE6FF)',
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

const ACCENT = '#00cfff';
const PLANE_X_PCT = 12; // plane sits at this % from left

interface CloudModel {
  optionIdx: number;
  text: string;
  yPct: number;       // vertical position 18..68
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
  const [clouds, setClouds] = useState<CloudModel[]>([]);

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

  // Each cloud is a flight gate. Steering changes altitude; crossing a gate commits the answer.
  const laneY = (i: number) => 14 + i * 70 / Math.max(1, (round?.options.length ?? 4) - 1);
  useEffect(() => {
    if (!round) return;
    setClouds(round.options.map((text, optionIdx) => ({ optionIdx, text, yPct: laneY(optionIdx) })));
    setFlying(false); setGateX(82); gateRef.current = 82; flightResolved.current = false;
    setLane(0); laneRef.current = 0;
  }, [round?.id]);
  const steer = (next: number) => {
    if (!round || verdict !== null || forcedState || completed) return;
    const bounded = Math.max(0, Math.min(round.options.length - 1, next));
     laneRef.current = bounded; setLane(bounded);

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
    if (forcedState === 'empty')   { setIdx(0); setVerdict(null);  setScore({ right: 0, wrong: 0 }); }
    if (forcedState === 'active')  { setIdx(0); setVerdict(null);  }
    if (forcedState === 'correct') { setIdx(1); setVerdict('right');  }
    if (forcedState === 'wrong')   { setIdx(1); setVerdict('wrong');  }
    if (forcedState === 'complete'){ setIdx(active.rounds.length); }
  }, [forcedState, active.rounds]);

  const onTapCloud = (optionIdx: number): void => {
    if (forcedState || verdict !== null || !round) return;

    const right = optionIdx === round.answerIndex;
    setVerdict(right ? 'right' : 'wrong');
    arcadeEvent({ type: right ? 'correct' : 'incorrect', points: flightPace === 'jet' ? 150 : 100 });

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
    setFlying(false); setGateX(82); gateRef.current = 82; flightResolved.current = false; setStudentPicks({});
    setIdx(0); setVerdict(null);  setScore({ right: 0, wrong: 0 });
    setHintsUsed(0); setRevealedHint(false); tip.reset();
  };

  const grad = time === 'day' ? 'linear-gradient(180deg,#14359b,#060c31)' : 'linear-gradient(180deg,#071332,#081c4c)';

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

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

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
            <span style={{ color: '#00eb91' }}>✓ {score.right}</span>
            <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
            <span style={{ color: '#ff3871' }}>✗ {score.wrong}</span>
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
      <div className="action-three-flight-slot"><ActionPlayfield3D kind="airplane" data={{reducedMotion:reduceMotion,running:flying,selected:lane,onPick:steer,actors:clouds.map(c=>({id:c.optionIdx,x:gateX,y:c.yPct,label:c.text,selected:c.optionIdx===lane,enabled:!forcedState&&verdict===null&&!completed}))}} /></div>

      {!completed && <div className="action-flight-control action-arcade-controls"><p>{flying ? 'STEER THROUGH THE RIGHT WORD · ↑ / ↓ or W / S' : gateX < 82 ? 'Flight paused. Choose a lane, then resume.' : 'Read the clue. Choose a lane, then launch.'}</p><span role="status" aria-live="polite">Selected gate {String.fromCharCode(65 + lane)}: {round?.options[lane]}</span><button aria-label="Climb one lane" onClick={() => steer(laneRef.current - 1)}>↑ Climb</button><button aria-label="Descend one lane" onClick={() => steer(laneRef.current + 1)}>↓ Descend</button><button disabled={verdict !== null} onClick={() => { if (reduceMotion) onTapCloud(laneRef.current); else setFlying(v => !v); }}>{reduceMotion ? 'Fly through selected gate' : flying ? 'Pause flight' : gateX < 82 ? 'Resume flight' : 'Launch flight'}</button><button disabled={flying} onClick={() => setFlightPace(p => p === 'cruise' ? 'jet' : 'cruise')}>{flightPace === 'jet' ? 'Jet · 150 pts' : 'Cruise · 100 pts'}</button></div>}
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
            <div style={{ textAlign: 'center' }}><div className="em-decor" style={{ fontSize: 44, color: '#00eb91' }}>{score.right}</div><div className="em-eyebrow" style={{ color: '#00eb91' }}>HIT · TRAFIONE</div></div>
            <div style={{ textAlign: 'center' }}><div className="em-decor" style={{ fontSize: 44, color: '#ff3871' }}>{score.wrong}</div><div className="em-eyebrow" style={{ color: '#ff3871' }}>MISS · CHYBIONE</div></div>
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
