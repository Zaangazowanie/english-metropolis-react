import { useActionCompletion } from './action-arcade-completion';
import { selectedWheelRotation } from './action-arcade-logic.mjs';
import { useArcadeEvents } from '../lib/arcade-events';
import { useActionTimers } from './action-arcade-timers';
import './action-arcade.css';
// Spin the Wheel — "The Carnival Wheel" district.
//
// A carnival booth at dusk: marquee bulbs around a wheel of options. Tap
// SPIN to send the wheel into a deceleration curve — when it stops, the
// pointer lands on one of the option wedges. Correct answer scores; wrong
// answer + Bajla nudges the right one. After N rounds the wheel rests.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
// CD audit 2026-05-02 (#19): word-tile shells must mask the answer in the
// rendered prompt as a belt-and-suspenders pass over the adapter layer.
import { maskAnswerInPrompt } from '../lib/exercise-adapters';
import { buildSafeHint } from '../lib/safeHint';

import React, { useState, useEffect, useRef, useMemo } from 'react';
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

// Carnival Wheel · Spin the Wheel — full bilingual instruction copy.
const SPINTHEWHEEL_INSTRUCTIONS: FullInstructions = {
  "whatYouDo": {
    "en": [
      "Choose the word that fits the clue, then spin to lock your answer."
    ],
    "pl": [
      "Wybierz słowo pasujące do wskazówki i zakręć kołem, aby je zatwierdzić."
    ]
  },
  "controls": {
    "en": [
      "Tap a word in the fixed legend. Choose Bank or Double before spinning. The wheel always lands on your selected word."
    ],
    "pl": [
      "Stuknij słowo w nieruchomej legendzie. Wybierz Bank lub Double. Koło zawsze zatrzymuje się na wybranym słowie."
    ]
  },
  "rightWrongSkip": {
    "en": [
      "Correct answers clear the clue. Wrong picks reveal the answer and let you retry. Skip returns to another unsolved clue; chance never grades your English."
    ],
    "pl": [
      "Dobre odpowiedzi zaliczają wskazówkę. Błędy pokazują odpowiedź i pozwalają próbować ponownie. Pomiń zmienia nierozwiązane pytanie; los nie ocenia Twojego angielskiego."
    ]
  },
  "hintMechanic": {
    "en": "Use the limited Hint button for help with the current clue.",
    "pl": "Użyj ograniczonej liczby podpowiedzi do aktualnej wskazówki."
  },
  "scoring": {
    "en": "Bank: 100 tickets on success. Double: 200 on success, lose 100 on a wrong answer, never below zero.",
    "pl": "Bank: 100 biletów za sukces. Double: 200 za sukces, utrata 100 przy błędzie, nigdy poniżej zera."
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

export interface SpinTheWheelShellProps {
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
  /**
   * D3-SpinTheWheel (Ricky wave-4, 2026-05-02): fires once when every round
   * has been spun + answered. Mounts <PracticeReview> at the host. Per item:
   * each round becomes one row showing prompt + student's pick + correct
   * answer + explanationPL. Mirrors the OpenTheBox pattern.
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
    puzzle: ArcadePuzzle;
  }) => void;
}

const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'w1', prompt: 'A spinning fairground ride for children.',
      options: ['carousel', 'lantern', 'kiosk', 'pavement'], answerIndex: 0,
      hint: 'Horses go up and down. Music plays.', hint_pl: 'karuzela' },
    { id: 'w2', prompt: 'Sweet spun sugar treat at fairs.',
      options: ['toffee', 'candyfloss', 'pretzel', 'sherbet'], answerIndex: 1,
      hint: 'Pink, fluffy, on a stick. British English.', hint_pl: 'wata cukrowa' },
    { id: 'w3', prompt: 'Bright bulbs around a sign or wheel.',
      options: ['marquee', 'curtain', 'awning', 'chime'], answerIndex: 0,
      hint: 'Old theatre signs use them.', hint_pl: 'markiza, świecący szyld' },
    { id: 'w4', prompt: 'A small booth where someone sells things.',
      options: ['kiosk', 'spire', 'gable', 'trough'], answerIndex: 0,
      hint: 'Newspapers, flowers, fair tokens — sold here.', hint_pl: 'kiosk' },
    { id: 'w5', prompt: 'A row of coloured pennants on a string.',
      options: ['bunting', 'gutter', 'plinth', 'apron'], answerIndex: 0,
      hint: 'Strung between poles for festivals.', hint_pl: 'girlanda flag' },
    { id: 'w6', prompt: 'Game where you toss rings onto a peg.',
      options: ['hoopla', 'cricket', 'darts', 'mahjong'], answerIndex: 0,
      hint: 'British fairground classic. Throw, hope.', hint_pl: 'gra w obręcze' },
  ],
};

const ACCENT = '#E879F9';

// ─────────────────────────────────────────────────────────────────────────
// renderSpinTheWheelReviewItem — per-round locked render for PracticeReview.
// Carnival scoreboard row: round number + question + 4 wedge options with
// the student's pick + correct answer highlighted.
// ─────────────────────────────────────────────────────────────────────────
const STW_REVIEW_ACCENT = '#E879F9';
export function renderSpinTheWheelReviewItem(
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
        : 'linear-gradient(180deg, rgba(52,211,153,0.08), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(52,211,153,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${STW_REVIEW_ACCENT}22`, color: STW_REVIEW_ACCENT,
          border: `1px solid ${STW_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          ROUND {String(roundNumber).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(52,211,153,0.18)',
          color: isWrong ? '#FB7185' : '#34D399',
        }}>
          {isWrong ? '✗ MISSED · POMINIĘTE' : '✓ LANDED · TRAFIONE'}
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
              <span style={{
                fontFamily: 'var(--em-mono)', fontSize: 9,
                color: STW_REVIEW_ACCENT, opacity: 0.7, minWidth: 14,
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

export const SpinTheWheelShell: React.FC<SpinTheWheelShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const activePuzzle: ArcadePuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : DEMO_PUZZLE;
  const persisted = useShellProgress('spinthewheel');
  const arcadeEvent = useArcadeEvents();
  const { later, cancel: cancelActionTimers } = useActionTimers();

  const [roundIdx, setRoundIdx] = useState(0);
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [landedOn, setLandedOn] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [solved, setSolved] = useState<boolean[]>(() => activePuzzle.rounds.map(() => false));
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showHintGlow, setShowHintGlow] = useState(false);
  const angleRef = useRef(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [tickets, setTickets] = useState(0);
  const [risk, setRisk] = useState(false);

  const cur = activePuzzle.rounds[roundIdx];
  // CD audit 2026-05-02 (#19): mask the answer-word in the prompt so the
  // student is never shown the exact word they're meant to spin to. Belt-and-
  // suspenders pass over A3's adapter-layer maskAnswerInPrompt — if the
  // adapter already masked it, this is a no-op; if the prompt slipped through
  // (e.g. demo content, raw KB rounds), this catches it before render.
  const safePrompt = useMemo(
    () => (cur ? maskAnswerInPrompt(cur.prompt, cur.options[cur.answerIndex]) : ''),
    [cur?.prompt, cur?.options, cur?.answerIndex]
  );
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
  const wedgeCount = cur.options.length;
  const wedgeAngle = 360 / wedgeCount;
  // Kelly Tier-2 (2026-05-02): wheel spin is the entire visual mechanic.
  // CSS already collapses the rotation transition to 0.01ms under reduced-
  // motion, but the JS sequencer waited 4.2s for a spin that never visually
  // happened. Collapse the wait + nested advance delays to one frame so the
  // student isn't staring at a static wheel waiting for "magic" to finish.
  const reduceMotion = usePrefersReducedMotion();
  const SPIN_WAIT_MS = reduceMotion ? 16 : 4200;
  const ADVANCE_WAIT_MS = reduceMotion ? 16 : 1400;
  const HINT_GLOW_MS = reduceMotion ? 16 : 3200;

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
      shellKey: 'spinthewheel',
      brief: SPINTHEWHEEL_INSTRUCTIONS.whatYouDo.en[0],
      brief_pl: SPINTHEWHEEL_INSTRUCTIONS.whatYouDo.pl[0],
      detail: SPINTHEWHEEL_INSTRUCTIONS.controls.en.join(' ') + ' ' + SPINTHEWHEEL_INSTRUCTIONS.rightWrongSkip.en.join(' '),
      detail_pl: SPINTHEWHEEL_INSTRUCTIONS.controls.pl.join(' ') + ' ' + SPINTHEWHEEL_INSTRUCTIONS.rightWrongSkip.pl.join(' '),
      fullInstructions: SPINTHEWHEEL_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (forcedState === 'empty') { setSolved(activePuzzle.rounds.map(() => false)); setRoundIdx(0); setLandedOn(null); }
    if (forcedState === 'correct') { setLandedOn(cur.answerIndex); setFeedback('correct'); }
    if (forcedState === 'wrong') { setLandedOn((cur.answerIndex + 1) % wedgeCount); setFeedback('wrong'); }
    if (forcedState === 'complete') { setSolved(activePuzzle.rounds.map(() => true)); }
  }, [forcedState]);

  const spin = (): void => {
    if (spinning || forcedState || completed || selected === null || feedback === 'correct') return;
    setLandedOn(null);
    setFeedback(null);
    setSpinning(true);
    const target = selected;
    const finalAngle = selectedWheelRotation(angleRef.current, target, wedgeCount);
    angleRef.current = finalAngle;
    setAngle(finalAngle);
    later(() => {
      setSpinning(false);
      setLandedOn(target);
      const correct = target === cur.answerIndex;
      setFeedback(correct ? 'correct' : 'wrong');
      if (correct) {
        const won = risk ? 200 : 100; setTickets(n => n + won); arcadeEvent({ type: 'correct', points: won });
        setSolved(prev => prev.map((v, i) => i === roundIdx ? true : v));
        later(() => {
          const nextRound = solved.findIndex((done, i) => !done && i !== roundIdx);
          if (nextRound >= 0) {
            setSelected(null); setRoundIdx(nextRound);
            setLandedOn(null);
            setFeedback(null);
          }
        }, ADVANCE_WAIT_MS);
      } else {
        if (risk) setTickets(n => Math.max(0, n - 100)); arcadeEvent({ type: 'incorrect' });
        tip.recordWrong({
          questionId: cur.id,
          studentAnswer: cur.options[target],
          correctAnswer: cur.options[cur.answerIndex],
          explanationPL: cur.hint_pl,
          exerciseId: cur.exerciseId,
        });
      }
    }, SPIN_WAIT_MS);
  };

  const skipRound = (): void => {
    if (spinning) return;
    if (roundIdx + 1 < activePuzzle.rounds.length) {
      setRoundIdx(i => i + 1);
      setLandedOn(null);
      setFeedback(null);
    }
  };

  const useHint = (): void => {
    if (hintsUsed >= 3 || spinning) return;
    setShowHintGlow(true);
    setHintsUsed(h => h + 1);
    later(() => setShowHintGlow(false), HINT_GLOW_MS);
  };

  const reset = (): void => {
    cancelActionTimers();
    arcadeEvent({ type: 'reset' });
    setSelected(null); setTickets(0); setRisk(false);
    setRoundIdx(0);
    setSolved(activePuzzle.rounds.map(() => false));
    setLandedOn(null);
    setFeedback(null);
    setSpinning(false);
    setHintsUsed(0);
    tip.reset();
    angleRef.current = 0;
    setAngle(0);
  };

  // Wedge palette derived from accent — alternating saturation.
  const wedgeColors = ['#E879F9', '#A78BFA', '#FBBF24', '#7DD3FC', '#34D399', '#FB7185', '#BEF264', '#F472B6'];

  const grad = time === 'day'
    ? 'linear-gradient(180deg, #6E4FB8 0%, #C58BD9 100%)'
    : time === 'night'
      ? 'linear-gradient(180deg, #02010C 0%, #1F0E3A 60%, #3E1A60 100%)'
      : 'linear-gradient(180deg, #1F1240 0%, #5B2480 60%, #9C3D8E 100%)';

  // Build SVG wedge paths.
  const RADIUS = 150;
  const CENTER = 170;
  // CD audit 2026-05-02 (#20): wedge text used to live INSIDE each wedge with
  // `transform: rotate(labelAngle + 90)` — that rotates with the wheel, so at
  // rest the labels are sideways (Q2/Q4) or upside-down (Q3/Q5), and once the
  // wheel spins they smear. They also truncated ("self-discip…"). Option A
  // (Orchard Square nameplate-callout pattern): the wedge keeps the colored
  // sector + a single bold LETTER marker inside (A/B/C/D), and the full word
  // labels float OUTSIDE the wheel rim in a fixed legend that never rotates
  // and never truncates. The pointer at top shows the landed letter; the
  // legend tells the student what that letter means.
  const wedgeLetter = (i: number): string => String.fromCharCode(65 + i); // A, B, C, D…
  const wedges = cur.options.map((opt, i) => {
    const startAngle = i * wedgeAngle - 90;
    const endAngle = (i + 1) * wedgeAngle - 90;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = CENTER + RADIUS * Math.cos(startRad);
    const y1 = CENTER + RADIUS * Math.sin(startRad);
    const x2 = CENTER + RADIUS * Math.cos(endRad);
    const y2 = CENTER + RADIUS * Math.sin(endRad);
    const large = wedgeAngle > 180 ? 1 : 0;
    const path = `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x2} ${y2} Z`;
    const labelAngle = startAngle + wedgeAngle / 2;
    const labelRad = (labelAngle * Math.PI) / 180;
    // Letter marker sits closer to the rim so it's readable even with thin
    // wedges (8 options would otherwise crowd the centre).
    const letterX = CENTER + RADIUS * 0.66 * Math.cos(labelRad);
    const letterY = CENTER + RADIUS * 0.66 * Math.sin(labelRad);
    return {
      opt, path, letterX, letterY, labelAngle,
      color: wedgeColors[i % wedgeColors.length],
      letter: wedgeLetter(i),
      i,
    };
  });

  const liveStatus = completed
    ? 'The wheel rests. All rounds complete.'
    : spinning
      ? 'Wheel spinning.'
      : feedback === 'correct'
        ? 'Correct.'
        : feedback === 'wrong'
          ? `Landed on ${cur.options[landedOn ?? 0]}. Spin again.`
          : '';

  return (
    <div
      className="em-shell em-shell-spinthewheel"
      role="application"
      aria-label="Spin the wheel practice, the Carnival Wheel"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <style>{`
        @keyframes em-stw-rise {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes em-stw-marquee {
          0%, 100% { opacity: 0.45; box-shadow: 0 0 8px ${ACCENT}aa; }
          50% { opacity: 1; box-shadow: 0 0 18px ${ACCENT}, 0 0 30px ${ACCENT}66; }
        }
        @keyframes em-stw-pointer-bob {
          0%, 100% { transform: translate(-50%, 0) scale(1); }
          50% { transform: translate(-50%, -3px) scale(1.05); }
        }
        @keyframes em-stw-pointer-tick {
          0% { transform: translate(-50%, 0) rotate(0deg); }
          50% { transform: translate(-50%, 0) rotate(-8deg); }
          100% { transform: translate(-50%, 0) rotate(0deg); }
        }
        @keyframes em-stw-burst {
          0% { transform: scale(0.4); opacity: 0; }
          40% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes em-stw-confetti-shake {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-2px); }
          75% { transform: translateY(2px); }
        }
        .em-stw-bulb { animation: em-stw-marquee 2.4s var(--em-ease) infinite; }
        @media (max-width: 768px) {
          .em-stw-side { display: none !important; }
          .em-stw-layout { grid-template-columns: 1fr !important; padding: 16px !important; }
          .em-stw-wheel-svg { max-width: 100%; height: auto; }
        }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{liveStatus}</div>

      {/* Carnival booth scene */}
      <div style={{ position: 'absolute', inset: 0, background: grad }} />
      {/* Booth striped awning at top */}
      <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 80, pointerEvents: 'none' }} preserveAspectRatio="none" viewBox="0 0 1200 80">
        {Array.from({ length: 24 }).map((_, i) => (
          <polygon key={i}
            points={`${i * 50},0 ${(i + 1) * 50},0 ${(i + 1) * 50 - 25},80`}
            fill={i % 2 === 0 ? '#E879F9' : '#FBBF24'}
            opacity={0.55}
          />
        ))}
      </svg>
      {/* Bunting — Ricky 2026-05-03 (CD audit, STW-bug-3b): bunting decoration
          was overlapping the skip/hint buttons in the side panel because it
          had default z-index. Pin to z-index 0 so all interactive controls
          (which sit inside the layout grid below) stack above it. The
          em-grain layer also stays purely decorative below z:1. */}
      <svg style={{ position: 'absolute', top: 60, left: 0, width: '100%', height: 40, pointerEvents: 'none', zIndex: 0 }} preserveAspectRatio="none" viewBox="0 0 1200 40">
        {Array.from({ length: 18 }).map((_, i) => (
          <g key={i} transform={`translate(${i * 70 + 20}, 0)`}>
            <line x1={0} y1={0} x2={50} y2={6} stroke={ACCENT} strokeWidth="0.8" opacity="0.6" />
            <polygon points="10,4 30,4 20,28" fill={['#FBBF24', '#7DD3FC', '#34D399', '#FB7185'][i % 4]} opacity="0.7" />
          </g>
        ))}
      </svg>
      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div className="em-stw-layout" style={{
        position: 'relative', display: 'grid',
        gridTemplateColumns: '1.4fr 1fr', gap: 24, padding: 32,
        height: '100%', boxSizing: 'border-box',
        zIndex: 1,
      }}>
        <div className="em-card" style={{
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, #1B0F36 0%, #0A0518 100%)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--em-line)' }}>
            <AmbientAudioPlayer shellSlug="spinthewheel" />
            <Nameplate
              district="The Carnival Wheel"
              subtitle="Spin the Wheel · Zakręć kołem · spin to commit your answer"
              accent={ACCENT}
              icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="8" stroke={ACCENT} strokeWidth="1.6" /><path d="M11 3 V11 L17 11" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" /><circle cx="11" cy="11" r="1.5" fill={ACCENT} /></svg>}
            />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', gap: 18 }}>
            {/* Question prompt above */}
            <div style={{
              maxWidth: 460, textAlign: 'center',
              padding: '12px 18px',
              background: 'rgba(20,12,38,0.7)',
              borderRadius: 12,
              border: `1px solid ${ACCENT}33`,
              animation: 'em-stw-rise 320ms var(--em-ease)',
            }} key={`q-${roundIdx}`}>
              <div className="em-eyebrow" style={{ color: ACCENT }}>ROUND {String(roundIdx + 1).padStart(2, '0')}</div>
              <div className="em-decor" style={{ fontSize: 18, color: 'var(--em-text)', lineHeight: 1.3 }}>{safePrompt}</div>
            </div>

            {/* Wheel + marquee */}
            <div style={{ position: 'relative', width: 360, height: 360 }}>
              {/* Marquee bulbs ring */}
              {Array.from({ length: 24 }).map((_, i) => {
                const a = (i / 24) * Math.PI * 2;
                const r = 178;
                const x = 180 + r * Math.cos(a) - 5;
                const y = 180 + r * Math.sin(a) - 5;
                return (
                  <div key={i} className="em-stw-bulb" style={{
                    position: 'absolute', left: x, top: y,
                    width: 10, height: 10, borderRadius: '50%',
                    background: ACCENT,
                    animationDelay: `${(i % 6) * 0.2}s`,
                  }} />
                );
              })}
              {/* Wheel SVG */}
              <svg
                viewBox="0 0 340 340"
                className="em-stw-wheel-svg"
                style={{
                  position: 'absolute', inset: 10, width: 340, height: 340,
                  transform: `rotate(${angle}deg)`,
                  transition: spinning ? 'transform 4.2s cubic-bezier(0.17, 0.67, 0.16, 1.0)' : 'none',
                  filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.6))',
                }}
              >
                <defs>
                  <radialGradient id="wheelShine" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,0.0)" />
                  </radialGradient>
                </defs>
                <circle cx={CENTER} cy={CENTER} r={RADIUS + 6} fill="#0E0A1A" />
                {wedges.map(w => {
                  const isHinted = showHintGlow && w.i === cur.answerIndex;
                  return (
                    <g key={w.i}>
                      <path d={w.path} fill={w.color} stroke="#0E0A1A" strokeWidth="2" opacity={isHinted ? 1 : 0.92} />
                      {isHinted && (
                        <path d={w.path} fill="none" stroke="#FBBF24" strokeWidth="3" style={{ filter: 'drop-shadow(0 0 8px #FBBF24)' }} />
                      )}
                      {/* Letter marker — single glyph stays readable at any
                         rotation, no truncation. Full word label lives in
                         the external legend so it never rotates. */}
                      <circle
                        cx={w.letterX} cy={w.letterY} r={15}
                        fill="rgba(14,10,26,0.85)"
                        stroke={isHinted ? '#FBBF24' : '#0E0A1A'}
                        strokeWidth={isHinted ? 2 : 1.2}
                      />
                      <text
                        x={w.letterX}
                        y={w.letterY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontFamily="var(--em-decor)"
                        fontSize="18"
                        fontWeight="700"
                        fill={w.color}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >{w.letter}</text>
                    </g>
                  );
                })}
                <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="url(#wheelShine)" pointerEvents="none" />
                {/* Hub */}
                <circle cx={CENTER} cy={CENTER} r={28} fill="#0E0A1A" stroke={ACCENT} strokeWidth="2" />
                <circle cx={CENTER} cy={CENTER} r={10} fill={ACCENT} />
              </svg>

              {/* Pointer at top */}
              <div style={{
                position: 'absolute', top: -2, left: '50%',
                width: 28, height: 38,
                animation: spinning ? 'em-stw-pointer-tick 0.18s var(--em-ease) infinite' : 'em-stw-pointer-bob 2.2s var(--em-ease) infinite',
                transformOrigin: 'top center',
                pointerEvents: 'none',
                zIndex: 3,
              }}>
                <svg viewBox="0 0 28 38" width={28} height={38}>
                  <polygon points="14,38 0,4 28,4" fill={ACCENT} stroke="#0E0A1A" strokeWidth="1.5" />
                  <circle cx="14" cy="6" r="3" fill="#FBBF24" stroke="#0E0A1A" strokeWidth="1" />
                </svg>
              </div>

              {/* Burst feedback overlay */}
              {feedback === 'correct' && landedOn !== null && (
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontFamily: 'var(--em-decor)',
                  color: '#34D399',
                  fontSize: 32,
                  textShadow: '0 0 20px #34D39988',
                  animation: 'em-stw-burst 540ms var(--em-ease)',
                  pointerEvents: 'none',
                }}>✓</div>
              )}
              {feedback === 'wrong' && landedOn !== null && (
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontFamily: 'var(--em-decor)',
                  color: '#FB7185',
                  fontSize: 28,
                  textShadow: '0 0 20px #FB718588',
                  animation: 'em-stw-burst 540ms var(--em-ease)',
                  pointerEvents: 'none',
                }}>×</div>
              )}
            </div>

            {/* External nameplate-callout legend (CD audit Option A, #20).
               Wedges only carry single-letter markers — the full word labels
               live OUT here, never rotate, never truncate. The student reads
               the landed letter at the pointer, then crosses to the legend. */}
            <div
              className="action-wheel-choices"
              role="group"
              aria-label="Choose your answer before spinning"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(wedgeCount, 4)}, minmax(0, 1fr))`,
                gap: 8,
                width: '100%',
                maxWidth: 460,
              }}
            >
              {wedges.map(w => {
                const isLanded = landedOn === w.i;
                const isCorrect = w.i === cur.answerIndex;
                const showCorrectGlow = (feedback === 'correct' || feedback === 'wrong') && isCorrect;
                const showLandedWrong = feedback === 'wrong' && isLanded;
                return (
                  <button
                    type="button"
                    key={w.i}
                    disabled={spinning || completed || feedback === 'correct'}
                    onClick={() => { setSelected(w.i); setFeedback(null); setLandedOn(null); }}
                    aria-pressed={selected === w.i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 10,
                      background: showCorrectGlow ? 'rgba(52,211,153,0.16)' : showLandedWrong ? 'rgba(251,113,133,0.14)' : 'rgba(20,12,38,0.7)',
                      border: `1px solid ${showCorrectGlow ? '#34D39988' : showLandedWrong ? '#FB718588' : `${w.color}55`}`,
                      transition: 'all 240ms var(--em-ease)',
                      minWidth: 0,
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        flex: '0 0 auto',
                        width: 22, height: 22, borderRadius: '50%',
                        background: w.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--em-decor)', fontSize: 13, fontWeight: 700,
                        color: '#0E0A1A',
                        boxShadow: showCorrectGlow ? '0 0 12px #34D399aa' : 'none',
                      }}
                    >{w.letter}</div>
                    <div
                      style={{
                        flex: 1, minWidth: 0,
                        fontFamily: 'var(--em-body)', fontSize: 13,
                        color: 'var(--em-text)',
                        // Ricky 2026-05-03 (CD audit, STW-bug-3a): previous
                        // `wordBreak: 'break-word'` was breaking long single
                        // words (e.g. "skyrocketing") MID-LETTER into
                        // "skyrocke ting". Switch to keep-all + normal wrap
                        // so words stay whole; if the wedge label can't fit
                        // its column, ellipsis-truncate (full text remains
                        // available via the `title` tooltip + the answer
                        // reveal panel below).
                        wordBreak: 'keep-all',
                        whiteSpace: 'normal',
                        overflowWrap: 'anywhere',
                        lineHeight: 1.2,
                      }}
                      title={w.opt}
                    >{w.opt}</div>
                  </button>
                );
              })}
            </div>

            <div className="action-arcade-hud"><div><strong>{tickets} TICKETS</strong><small>Pick the word, then spin to lock your answer. Bank 100 tickets, or play Double for 200; a wrong Double costs 100.</small></div><button disabled={spinning} aria-pressed={risk} onClick={() => setRisk(v => !v)}>{risk ? 'Double · 200 / −100' : 'Bank · 100'}</button></div>
            {/* Spin button */}
            <button
              className="em-btn em-btn-primary"
              onClick={spin}
              disabled={spinning || completed || selected === null || feedback === 'correct'}
              aria-label={spinning ? 'Wheel spinning' : 'Spin the wheel'}
              style={{
                minHeight: 48, padding: '12px 32px',
                fontSize: 16, letterSpacing: '0.06em',
                background: spinning ? `${ACCENT}55` : ACCENT,
                color: '#0E0A1A',
                border: 'none', borderRadius: 999,
                cursor: spinning ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--em-decor)',
                boxShadow: spinning ? 'none' : `0 4px 16px ${ACCENT}66, 0 0 24px ${ACCENT}33`,
                transition: 'all 220ms var(--em-ease)',
              }}
            >
              {spinning ? 'LOCKING IN…' : selected === null ? 'CHOOSE A WORD' : 'SPIN & LOCK ANSWER'}
            </button>

            {feedback === 'wrong' && landedOn !== null && (
              <div style={{
                fontFamily: 'var(--em-mono)', fontSize: 11, color: '#FB7185',
                letterSpacing: '0.18em', textAlign: 'center',
              }}>
                LANDED ON · {cur.options[landedOn].toUpperCase()} · TRY AGAIN
              </div>
            )}
          </div>

          {completed && !onSessionComplete && (
            <div
              role="dialog"
              aria-live="assertive"
              aria-label="Carnival Wheel complete"
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
              <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa`, textAlign: 'center', padding: '0 16px' }}>The wheel rests.</div>
              <div className="em-eyebrow">CARNIVAL CLOSING TIME · WESOŁE MIASTECZKO ZAMYKA</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="em-btn em-btn-ghost" onClick={reset}>Restart run</button>
                <button className="em-btn em-btn-primary" onClick={reset}>Play again →</button>
              </div>
            </div>
          )}
          <Confetti show={completed} />
        </div>

        <div className="em-stw-side" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Progress current={solved.filter(Boolean).length} total={activePuzzle.rounds.length} accent={ACCENT} />
            <div style={{ display: 'flex', gap: 6 }}>
              <SkipButton onClick={() => { if (spinning || feedback === 'correct' || completed) return; const next = solved.findIndex((done, i) => !done && i !== roundIdx); if (next >= 0) { setSelected(null); setFeedback(null); setLandedOn(null); setRoundIdx(next); } }} />
              <HintButton onClick={useHint} used={hintsUsed} total={3} />
            </div>
          </div>

          <div className="em-shell-hint" style={{ minWidth: 0 }}>
          </div>

          {/* Tonight's Carnival — fills the right-side dead space (#9) with
             a themed booth scene + run summary instead of duplicating the
             wheel legend (now lives below the wheel as nameplate-callouts). */}
          <div className="em-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--em-line)', display: 'flex', justifyContent: 'space-between' }}>
              <div className="em-eyebrow">Tonight&apos;s Carnival · Dzisiejszy karnawał</div>
              <div className="em-eyebrow" style={{ color: ACCENT }}>{activePuzzle.rounds.length} rounds</div>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
              {/* Bajla on the ticket booth, pointing at the wheel. Decorative. */}
              <div style={{
                position: 'relative',
                height: 120,
                borderRadius: 10,
                background: 'linear-gradient(180deg, #2A1850 0%, #0E0A1A 100%)',
                border: `1px solid ${ACCENT}33`,
                overflow: 'hidden',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              }}>
                {/* Booth roof bunting */}
                <svg style={{ position: 'absolute', top: 4, left: 0, width: '100%', height: 22 }} preserveAspectRatio="none" viewBox="0 0 200 22">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <polygon key={i}
                      points={`${i * 25 + 4},2 ${i * 25 + 22},2 ${i * 25 + 13},18`}
                      fill={['#FBBF24', '#7DD3FC', '#34D399', '#FB7185'][i % 4]}
                      opacity={0.85}
                    />
                  ))}
                </svg>
                {/* Ticket booth silhouette */}
                <svg style={{ position: 'absolute', bottom: 0, right: 14, width: 70, height: 80 }} viewBox="0 0 70 80">
                  <rect x="6" y="20" width="58" height="58" fill="#1B0F36" stroke={ACCENT} strokeWidth="1.4" />
                  <polygon points="0,20 35,2 70,20" fill="#3E1A60" stroke={ACCENT} strokeWidth="1.4" />
                  <rect x="18" y="32" width="34" height="22" fill="#0E0A1A" stroke={ACCENT} strokeWidth="1" />
                  <text x="35" y="46" textAnchor="middle" fontFamily="var(--em-mono)" fontSize="6" fill={ACCENT} letterSpacing="0.1em">TICKETS</text>
                  <rect x="22" y="60" width="26" height="18" fill="#1B0F36" stroke={ACCENT} strokeWidth="0.8" />
                </svg>
                {/* Standalone Bajla beside the booth removed 2026-05-03 —
                    chat-widget mascot is the canonical presence. */}
              </div>

              {/* Run breakdown — wedge count + hint usage so the right panel
                 carries real information instead of duplicating the legend. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="em-eyebrow" style={{ color: ACCENT, fontSize: 10 }}>WHEEL CONFIG · KONFIGURACJA KOŁA</div>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                }}>
                  <div style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--em-line)',
                  }}>
                    <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, color: 'var(--em-muted)', letterSpacing: '0.12em' }}>WEDGES</div>
                    <div className="em-decor" style={{ fontSize: 22, color: ACCENT, lineHeight: 1.1 }}>{wedgeCount}</div>
                    <div style={{ fontSize: 11, color: 'var(--em-muted)' }}>options per round</div>
                  </div>
                  <div style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--em-line)',
                  }}>
                    <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, color: 'var(--em-muted)', letterSpacing: '0.12em' }}>HINTS</div>
                    <div className="em-decor" style={{ fontSize: 22, color: '#FBBF24', lineHeight: 1.1 }}>{3 - hintsUsed}<span style={{ fontSize: 14, color: 'var(--em-muted)' }}> / 3</span></div>
                    <div style={{ fontSize: 11, color: 'var(--em-muted)' }}>left tonight</div>
                  </div>
                </div>
              </div>

              {/* Reveal the correct option only AFTER the spin commits — keeps
                 the side panel useful without spoiling the answer up-front. */}
              {(feedback === 'correct' || feedback === 'wrong') && (
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(52,211,153,0.08)',
                  border: '1px solid #34D39955',
                  display: 'flex', alignItems: 'center', gap: 10,
                  animation: 'em-stw-rise 320ms var(--em-ease)',
                }}>
                  <div aria-hidden="true" style={{
                    flex: '0 0 auto',
                    width: 24, height: 24, borderRadius: '50%',
                    background: wedgeColors[cur.answerIndex % wedgeColors.length],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--em-decor)', fontSize: 13, fontWeight: 700,
                    color: '#0E0A1A',
                  }}>{wedgeLetter(cur.answerIndex)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="em-eyebrow" style={{ fontSize: 9, color: '#34D399' }}>ANSWER · ODPOWIEDŹ</div>
                    <div style={{ fontFamily: 'var(--em-body)', fontSize: 14, color: 'var(--em-text)' }}>{cur.options[cur.answerIndex]}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpinTheWheelShell;
