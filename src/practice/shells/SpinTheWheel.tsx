import { ActionPlayfield3D } from './action-arcade-three';
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

import React, { useState, useEffect, useRef, useMemo } from 'react';
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

const ACCENT = '#ef22ff';

// ─────────────────────────────────────────────────────────────────────────
// renderSpinTheWheelReviewItem — per-round locked render for PracticeReview.
// Carnival scoreboard row: round number + question + 4 wedge options with
// the student's pick + correct answer highlighted.
// ─────────────────────────────────────────────────────────────────────────
const STW_REVIEW_ACCENT = '#ef22ff';
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
          color: isWrong ? '#ff3871' : '#00eb91',
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
              border: `1px solid ${showCorrect ? '#00eb9188' : showWrong ? '#ff387188' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? '#00eb91' : showWrong ? '#ff3871' : 'var(--em-text, #EDE6FF)',
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
  const wedgeColors = ['#ed00ff', '#7628ff', '#ffcf00', '#00cdff', '#00e875', '#ff174f', '#9aff00', '#ff008e'];

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
  const wedges = cur.options.map((opt, i) => ({ opt, i, letter: wedgeLetter(i), color: wedgeColors[i % wedgeColors.length] }));

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
        @media (max-width: 768px) {
          .em-stw-side { display: none !important; }
          .em-stw-layout { grid-template-columns: 1fr !important; padding: 16px !important; }
        }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{liveStatus}</div>

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
            <ActionPlayfield3D kind="spinthewheel" data={{reducedMotion:reduceMotion,angle, duration:SPIN_WAIT_MS,running:spinning,onSpin:spin,onPick:i=>{if(!completed&&feedback!=='correct'){setSelected(i);setFeedback(null);setLandedOn(null);}},actors:wedges.map(w=>({id:w.i,x:0,y:0,label:cur.options[w.i],color:w.color,selected:selected===w.i}))}} />

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
                const showCorrectGlow = (feedback === 'correct' || feedback === 'wrong' || showHintGlow) && isCorrect;
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
                      border: `1px solid ${showCorrectGlow ? '#00eb9188' : showLandedWrong ? '#ff387188' : `${w.color}55`}`,
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
                        boxShadow: showCorrectGlow ? '0 0 12px #00eb91aa' : 'none',
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
                fontFamily: 'var(--em-mono)', fontSize: 11, color: '#ff3871',
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

                {/* Ticket booth silhouette */}

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
                    <div className="em-decor" style={{ fontSize: 22, color: '#ffce00', lineHeight: 1.1 }}>{3 - hintsUsed}<span style={{ fontSize: 14, color: 'var(--em-muted)' }}> / 3</span></div>
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
                  border: '1px solid #00eb9155',
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
                    <div className="em-eyebrow" style={{ fontSize: 9, color: '#00eb91' }}>ANSWER · ODPOWIEDŹ</div>
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
