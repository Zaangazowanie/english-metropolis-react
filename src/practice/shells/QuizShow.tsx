// QuizShow — "The Auditorium" district.
// A TV gameshow in the city's grand theatre. Single question center stage,
// dramatic countdown timer, spotlight beam, velvet curtains, audience hush.
// Wrong answer: buzzer + spotlight rims rose. Correct: chime + gold confetti.
//
// Visual identity: this is the only shell that makes you feel WATCHED. The
// curtain frames everything. The countdown ticks. The spotlight tracks.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import { maskAnswerInPrompt } from '../lib/exercise-adapters';
import type { FullInstructions } from '../components/ExpandableInstructions';
import '../styles/shells/quizshow.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';

const QUIZSHOW_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A spotlit MC question appears centre-stage with 4 lettered options (A/B/C/D).',
      'Tap the option you think fits — the spotlight tracks your choice.',
      'A countdown timer pressures you to commit before time runs out.',
      'Buzzer on wrong, gold-confetti chime on correct.',
    ],
    pl: [
      'Pytanie wielokrotnego wyboru pojawia się na środku sceny z 4 opcjami (A/B/C/D).',
      'Stuknij opcję, która pasuje — reflektor podąża za Twoim wyborem.',
      'Odliczanie naciska, byś zdążył.',
      'Brzęczyk przy błędzie, dzwonek + złote konfetti przy poprawnej.',
    ],
  },
  controls: {
    en: [
      'Question card (centre stage)',
      '4 option chips A/B/C/D (below)',
      'Countdown ring (top-right) — gold = time left, rose = running out',
      'Skip button + Hint button (under the question)',
      'Score chip + ✓/✗ tally (header)',
    ],
    pl: [
      'Karta pytania (środek sceny)',
      '4 opcje A/B/C/D (pod pytaniem)',
      'Pierścień odliczania (prawy górny róg) — złoty = czas pozostały, różowy = kończy się',
      'Pomiń + Podpowiedź (pod pytaniem)',
      'Wynik + bilans ✓/✗ (nagłówek)',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right: ✓ chime, gold-confetti burst, +1 to your tally.',
      'Wrong: ✗ buzzer, correct option highlighted, "Why this happens" auto-opens (if enabled).',
      'Skip: counts as wrong; the timer resets for the next question.',
      'Time-out: counts as wrong, like a Skip.',
    ],
    pl: [
      'Dobrze: ✓ dzwonek, złote konfetti, +1 do bilansu.',
      'Źle: ✗ brzęczyk, podświetlona poprawna opcja, "Dlaczego" auto-otwiera (jeśli włączone).',
      'Pomiń: liczy się jak źle; odliczanie resetuje na następne pytanie.',
      'Koniec czasu: liczy się jak źle, jak Pomiń.',
    ],
  },
  hintMechanic: {
    en: 'Each hint eliminates one wrong option (50/50 style). 2 hints per session — use them on toss-ups.',
    pl: 'Każda podpowiedź eliminuje jedną złą opcję (styl 50/50). 2 podpowiedzi na sesję — użyj na pytaniach, gdzie się wahasz.',
  },
  scoring: {
    en: 'Each correct = +1. End-of-show review screen lists every question with your pick + the correct + the rule callout.',
    pl: 'Każda poprawna = +1. Po sesji ekran przeglądu z każdym pytaniem, Twoim wyborem, poprawną odpowiedzią i wyjaśnieniem.',
  },
  l1Pattern: {
    en: 'Polish learners under time pressure often default to the most familiar-looking option. This shell trains decisive vocab/grammar selection without overthinking.',
    pl: 'Polacy pod presją czasu często wybierają najbardziej znajomo wyglądającą opcję. Ten shell uczy zdecydowanego wyboru słownictwa/gramatyki bez nadmiernego myślenia.',
  },
};
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
// ─────────────────────────────────────────────────────────────
// Types — local mirror of WrapperPuzzle (no adapters.ts changes per agent contract)
// ─────────────────────────────────────────────────────────────
export interface WrapperRound {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}
export interface WrapperPuzzle {
  rounds: WrapperRound[];
}

export type QuizShowForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface QuizShowShellProps {
  time?: TimeOfDay;
  state?: QuizShowForcedState;
  puzzle?: WrapperPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /** D3-QuizShow (Ricky wave-4, 2026-05-02): per-round MC review payload. */
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
  }) => void;
}

// ─────────────────────────────────────────────────────────────
// Built-in demo deck — themed to the gameshow itself
// ─────────────────────────────────────────────────────────────
const QS_DEMO: WrapperPuzzle = {
  rounds: [
    { id: 'host', prompt: 'The person who runs a TV quiz show is called the ___.', options: ['guest', 'host', 'audience', 'judge'], answerIndex: 1, hint: 'They greet contestants and read the questions.', hint_pl: 'Po polsku: gospodarz programu.' },
    { id: 'spotlight', prompt: 'A bright beam aimed at one spot on stage is a ___.', options: ['shadow', 'curtain', 'spotlight', 'balcony'], answerIndex: 2, hint: 'Singular focus of light.', hint_pl: 'Po polsku: reflektor punktowy.' },
    { id: 'applause', prompt: 'When the audience claps loudly, that is ___.', options: ['silence', 'applause', 'whisper', 'lecture'], answerIndex: 1, hint: 'Many hands together.', hint_pl: 'Po polsku: oklaski.' },
    { id: 'curtain', prompt: 'The fabric that opens and closes the stage is the ___.', options: ['carpet', 'mirror', 'curtain', 'ceiling'], answerIndex: 2, hint: 'Heavy red velvet, usually.', hint_pl: 'Po polsku: kurtyna.' },
    { id: 'prize', prompt: 'Winners take home a ___.', options: ['fine', 'prize', 'penalty', 'lecture'], answerIndex: 1, hint: 'Reward for victory.', hint_pl: 'Po polsku: nagroda.' },
    { id: 'final', prompt: 'The very last round of a tournament is the ___.', options: ['warm-up', 'rehearsal', 'final', 'opener'], answerIndex: 2, hint: 'Nothing comes after it.', hint_pl: 'Po polsku: finał.' },
  ],
};

const ACCENT = '#FBBF24';
const ROUND_TIME_MS = 18_000;

type Verdict = 'right' | 'wrong' | null;

// ─────────────────────────────────────────────────────────────────────────
// renderQuizShowReviewItem — per-round locked render for PracticeReview.
// Quiz-Show stage scoreboard row: round number + question + student's
// pick + correct answer chip.
// ─────────────────────────────────────────────────────────────────────────
const QS_REVIEW_ACCENT = '#FBBF24';
export function renderQuizShowReviewItem(
  round: WrapperRound,
  roundNumber: number,
  studentAnswer: string | undefined,
): React.ReactNode {
  const correct = round.options[round.answerIndex];
  const stu = studentAnswer ?? '';
  const isTimeout = stu === '(timeout)';
  const isWrong = (stu.length > 0 && stu !== correct) || isTimeout;
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
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${QS_REVIEW_ACCENT}22`, color: QS_REVIEW_ACCENT,
          border: `1px solid ${QS_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          Q{String(roundNumber).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(52,211,153,0.18)',
          color: isWrong ? '#FB7185' : '#34D399',
        }}>
          {isTimeout ? '⏱ TIMEOUT · CZAS UPŁYNĄŁ' : isWrong ? '✗ BUZZER · BŁĄD' : '✓ APPLAUSE · BRAWA'}
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
                color: QS_REVIEW_ACCENT, opacity: 0.7, minWidth: 14,
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

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export const QuizShowShell: React.FC<QuizShowShellProps> = ({
  time = 'night',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  // Kelly Tier-2 (2026-05-02): defensive props guard.
  const propsInvalid = !forcedState && puzzle !== undefined && (!puzzle.rounds || puzzle.rounds.length === 0);
  const rawActive: WrapperPuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : QS_DEMO;

  // Ricky 2026-05-02 (CD audit §5 Quiz Show, cross-cutting #19):
  // Q1 was the anomalous "fits 'X'?" template — tautological because the
  // answer-word and a morphological variant both appear literally in the
  // prompt. Defensively gap-mask every round so the answer word (and its
  // morphological variants) is replaced with `___` before render. Also
  // detect the broken "→ fits 'X'?" template specifically and rewrite it
  // to "→ which option fits the gap?". If after masking the prompt becomes
  // empty/meaningless, fall back to the gap-fill template.
  const FITS_TEMPLATE_RE = /\s*[—–\->→]+\s*fits\s+['"`’‘]?[A-Za-z][A-Za-z'-]*['"`’‘]?\s*\?\s*$/i;
  const GAP_FALLBACK_PROMPT = 'Tap the option that fits in the gap. · Wybierz opcję pasującą do luki.';
  const active: WrapperPuzzle = useMemo(() => ({
    rounds: rawActive.rounds.map((r) => {
      const answer = r.options?.[r.answerIndex] ?? '';
      // Strip the "→ fits 'X'?" tail first — it leaks the answer root.
      const detemplated = r.prompt.replace(FITS_TEMPLATE_RE, '').trim();
      // Apply the shared gap-mask helper (handles morphology variants).
      let masked = maskAnswerInPrompt(detemplated, answer);
      // If after masking we have nothing meaningful (empty, only the mask, or
      // shorter than ~6 chars), fall back to the canonical gap-fill template.
      const meaningful = masked.replace(/[_\s.,;:!?'"`’‘”“]/g, '');
      if (!meaningful || meaningful.length < 4) masked = GAP_FALLBACK_PROMPT;
      return masked === r.prompt ? r : { ...r, prompt: masked };
    }),
  }), [rawActive]);

  const persisted = useShellProgress('quizshow');

  const [idx, setIdx] = useState<number>(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [score, setScore] = useState<{ right: number; wrong: number }>({ right: 0, wrong: 0 });
  const [timeLeft, setTimeLeft] = useState<number>(ROUND_TIME_MS);
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [revealedHint, setRevealedHint] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const tickRef = useRef<number | null>(null);
  // Kelly Tier-2 (2026-05-02): focus-trap refs for the completion overlay.
  const tryAnotherBtnRef = useRef<HTMLButtonElement | null>(null);
  const nextDistrictBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const q = active.rounds[idx];
  const completed = !forcedState && idx >= active.rounds.length;
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount: score.right,
        totalQuestions: active.rounds.length,
        wrongAttempts,
        puzzle: active,
      });
    } : undefined,
  });

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'quizshow',
      brief: 'Read the question, pick the option that fits — there is a clock.',
      brief_pl: 'Przeczytaj pytanie, wybierz odpowiedź pasującą do sensu — czas leci.',
      detail: 'You are on stage in a quiz show. Each round shows a question and four lettered options; the timer counts down. Pick the answer that fits the meaning before time runs out. Time-outs count as wrong; right answers extend the streak.',
      detail_pl: 'Stoisz na scenie teleturnieju. Każda runda pokazuje pytanie i cztery opcje z literami; zegar odlicza. Wybierz odpowiedź pasującą do sensu, zanim czas się skończy. Przegapienie liczy się jako błąd; trafione przedłużają passę.',
      fullInstructions: QUIZSHOW_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  // Timer — ticks every 100ms while a question is on stage. Hits zero =
  // count as wrong, advance.
  useEffect(() => {
    if (forcedState) return;
    if (completed) return;
    if (verdict !== null) return;
    setTimeLeft(ROUND_TIME_MS);
    const start = performance.now();
    const tick = (): void => {
      const elapsed = performance.now() - start;
      const left = Math.max(0, ROUND_TIME_MS - elapsed);
      setTimeLeft(left);
      if (left <= 0) {
        // Time's up — count as wrong, mark, advance after the buzzer.
        setVerdict('wrong');
        setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
        setAnnouncement('Time is up. Buzzer.');
        if (q) {
          tip.recordWrong({
            questionId: q.id,
            studentAnswer: '(timeout)',
            correctAnswer: q.options[q.answerIndex],
            explanationPL: q.hint_pl,
            exerciseId: q.exerciseId,
          });
        }
        return;
      }
      tickRef.current = requestAnimationFrame(tick);
    };
    tickRef.current = requestAnimationFrame(tick);
    return () => { if (tickRef.current) cancelAnimationFrame(tickRef.current); };
  }, [idx, verdict, forcedState, completed, q]);

  // Persist progress.
  useEffect(() => {
    if (forcedState) return;
    const total = active.rounds.length;
    persisted.save({ progress: idx / total, lastState: idx >= total ? 'complete' : 'active' });
    if (idx >= total) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [idx, forcedState, active.rounds.length]);

  // Forced-state previews for design canvas.
  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty')    { setIdx(0); setPicked(null); setVerdict(null); setScore({ right: 0, wrong: 0 }); }
    if (forcedState === 'active')   { setIdx(0); setPicked(null); setVerdict(null); }
    if (forcedState === 'correct')  { setIdx(1); setPicked(active.rounds[1]?.answerIndex ?? 0); setVerdict('right'); }
    if (forcedState === 'wrong')    { setIdx(1); setPicked((active.rounds[1]?.answerIndex ?? 0) === 0 ? 1 : 0); setVerdict('wrong'); }
    if (forcedState === 'complete') { setIdx(active.rounds.length); setVerdict(null); setScore({ right: active.rounds.length - 1, wrong: 1 }); }
  }, [forcedState, active.rounds]);

  const onPick = (i: number): void => {
    if (forcedState || verdict !== null || !q) return;
    setPicked(i);
    const right = i === q.answerIndex;
    setVerdict(right ? 'right' : 'wrong');
    setAnnouncement(right ? 'Correct.' : 'Wrong. The buzzer sounds.');
    if (right) {
      setScore((s) => ({ ...s, right: s.right + 1 }));
    } else {
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
      tip.recordWrong({
        questionId: q.id,
        studentAnswer: q.options[i],
        correctAnswer: q.options[q.answerIndex],
        explanationPL: q.hint_pl,
        exerciseId: q.exerciseId,
      });
    }
  };

  // Advance after the verdict has been on screen ~1.4s.
  useEffect(() => {
    if (verdict === null) return;
    if (forcedState) return;
    const t = setTimeout(() => {
      setIdx((i) => i + 1);
      setPicked(null);
      setVerdict(null);
      setRevealedHint(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [verdict, forcedState]);

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 2 || !q) return;
    setHintsUsed((h) => h + 1);
    setRevealedHint(true);
  };

  const reset = (): void => {
    setIdx(0); setPicked(null); setVerdict(null); setScore({ right: 0, wrong: 0 });
    setHintsUsed(0); setRevealedHint(false); tip.reset();
  };

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the completion overlay.
  useEffect(() => {
    if (!completed) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const focusId = window.setTimeout(() => { nextDistrictBtnRef.current?.focus(); }, 0);
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
  }, [completed]);

  const timerPct = useMemo(() => Math.max(0, Math.min(100, (timeLeft / ROUND_TIME_MS) * 100)), [timeLeft]);
  const timerColor = timerPct > 50 ? ACCENT : timerPct > 20 ? '#FB7185' : '#FF4D6D';

  // Page background — the auditorium house lights are dimmed to dusk.
  const grad = time === 'day'
    ? 'linear-gradient(180deg, #4C2F7E 0%, #220F4D 100%)'
    : time === 'dusk'
      ? 'linear-gradient(180deg, #2A0E36 0%, #100726 100%)'
      : 'linear-gradient(180deg, #11041A 0%, #02010A 100%)';

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div
      className="em-shell em-shell-quizshow"
      role="application"
      aria-label="Quiz Show, The Auditorium"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: grad }}
    >
      {/* Inline keyframes scoped to this shell (avoid touching global.css). */}
      {/* Shell-scoped keyframes → src/practice/styles/shells/quizshow.css */}

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      {/* Stage floor — receding perspective lines */}
      <svg viewBox="0 0 1000 200" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '32%', pointerEvents: 'none', opacity: 0.55 }}>
        <defs>
          <linearGradient id="qs-floor" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#2A0E36" />
            <stop offset="1" stopColor="#0E0418" />
          </linearGradient>
        </defs>
        <polygon points="-100,200 1100,200 720,0 280,0" fill="url(#qs-floor)" />
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={i} x1={`${280 + i * 37}`} y1={0} x2={`${-100 + i * 100}`} y2={200} stroke="#FBBF24" strokeWidth="0.6" opacity="0.18" />
        ))}
      </svg>

      {/* Velvet curtains — left + right, animated open on mount */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: '18%',
        background: 'repeating-linear-gradient(90deg, #5A0F1E, #5A0F1E 18px, #4A0918 18px, #4A0918 36px, #6E1226 36px, #6E1226 54px)',
        boxShadow: 'inset -28px 0 56px rgba(0,0,0,0.7)',
        animation: 'em-qs-curtain-l 1.2s var(--em-ease) both',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: '18%',
        background: 'repeating-linear-gradient(270deg, #5A0F1E, #5A0F1E 18px, #4A0918 18px, #4A0918 36px, #6E1226 36px, #6E1226 54px)',
        boxShadow: 'inset 28px 0 56px rgba(0,0,0,0.7)',
        animation: 'em-qs-curtain-r 1.2s var(--em-ease) both',
      }} />

      {/* Curtain swag — gold rope across the top */}
      <svg aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 56, width: '100%', pointerEvents: 'none' }}>
        <path d="M 0 8 Q 50 36 100 8 Q 150 36 200 8 Q 250 36 300 8 Q 350 36 400 8 Q 450 36 500 8 Q 550 36 600 8 Q 650 36 700 8 Q 750 36 800 8 Q 850 36 900 8 Q 950 36 1000 8" stroke="#FBBF24" strokeWidth="2" fill="none" opacity="0.6" />
      </svg>

      {/* Spotlight beam — sweeps slowly */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: '50%', width: 380, height: '70%',
        transformOrigin: 'top center', transform: 'translateX(-50%)',
        background: `conic-gradient(from -8deg at 50% 0%, transparent 168deg, ${ACCENT}1f 178deg, ${ACCENT}38 180deg, ${ACCENT}1f 182deg, transparent 192deg)`,
        filter: 'blur(2px)', animation: 'em-qs-spotlight-sweep 7s ease-in-out infinite',
        pointerEvents: 'none', mixBlendMode: 'screen',
      }} />

      {/* Marquee strip — the row of bulbs across the top frame */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: '20%', right: '20%', height: 18,
        background: `repeating-linear-gradient(90deg, ${ACCENT} 0 6px, transparent 6px 18px)`,
        boxShadow: `0 0 14px ${ACCENT}cc, inset 0 0 8px rgba(0,0,0,0.7)`,
        animation: 'em-qs-marquee 1.2s linear infinite',
        opacity: 0.85,
      }} />

      {/* Top bar — district nameplate + score.
          Ricky 2026-05-02 (CD audit §5 Quiz Show + cross-cutting #14):
          - Subtitle canonicalized to "Quiz Show · Show Quizowy · take the
            spotlight" per audit directive.
          - Triple counter (✓ / ✗ / Q) collapsed: the shared <Progress>
            primitive remains the single primary "Q N/M" position counter,
            and the right/wrong tally moves to ONE compact chip beside it
            instead of two separate eyebrow lines that read like extra
            counters. (#14 — pick Q N/M as canonical, ✓/✗ as a small chip.) */}
      <div style={{ position: 'absolute', top: 28, left: 28, right: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 5, gap: 12 }}>
        <AmbientAudioPlayer shellSlug="quizshow" />
        <Nameplate
          district="The Auditorium"
          subtitle="Quiz Show · Show Quizowy · take the spotlight"
          accent={ACCENT}
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 18 L19 18 M5 18 L5 8 L11 4 L17 8 L17 18" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" /><circle cx="11" cy="11" r="2" fill={ACCENT} /></svg>}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Progress current={Math.min(idx, active.rounds.length)} total={active.rounds.length} accent={ACCENT} />
          <div
            className="em-eyebrow"
            aria-label={`Tally: ${score.right} correct, ${score.wrong} wrong`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 999,
              background: 'rgba(20,8,42,0.55)',
              border: '1px solid rgba(255,255,255,0.12)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span style={{ color: '#34D399' }}>✓ {score.right}</span>
            <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>
            <span style={{ color: '#FB7185' }}>✗ {score.wrong}</span>
          </div>
          <SkipButton onClick={() => { setVerdict(null); setIdx((i) => i + 1); setPicked(null); }} />
          <HintButton onClick={useHint} used={hintsUsed} total={2} />
        </div>
      </div>

      {/* Center stage — question card + countdown ring.
          Kelly Tier-2 (2026-05-02): tabbable wrapper so keyboard users can
          land focus on the stage; from there Tab moves through the four
          A/B/C/D answer buttons (which are already native <button> with
          Space/Enter activation — that IS the tap-equivalent). No custom
          arrow-key handler is needed beyond browser defaults. */}
      {!completed && q && (
        <div
          className="em-qs-stage"
          tabIndex={0}
          role="group"
          aria-label={`Question ${idx + 1} of ${active.rounds.length}. Tab to move to answer A B C or D, Space or Enter to choose.`}
          style={{
            position: 'absolute', top: '22%', left: '22%', right: '22%', bottom: '18%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
            zIndex: 4,
          }}
        >
          {/* Countdown ring around the question number */}
          <div style={{ position: 'relative', width: 160, height: 160, marginBottom: -12 }}>
            <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
              <circle cx="80" cy="80" r="72" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
              <circle
                cx="80" cy="80" r="72" fill="none"
                stroke={timerColor} strokeWidth="6" strokeLinecap="round"
                strokeDasharray="452"
                strokeDashoffset={452 * (1 - timerPct / 100)}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '80px 80px', filter: `drop-shadow(0 0 12px ${timerColor})`, transition: 'stroke-dashoffset 80ms linear, stroke 320ms' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="em-decor" style={{ fontSize: 64, color: ACCENT, lineHeight: 1, textShadow: `0 0 18px ${ACCENT}aa` }}>{idx + 1}</div>
              <div className="em-eyebrow" style={{ color: 'rgba(245,239,255,0.6)' }}>OF {String(active.rounds.length).padStart(2, '0')}</div>
            </div>
          </div>

          {/* Question podium */}
          <div
            key={idx}
            style={{
              padding: '22px 32px', minWidth: 320, maxWidth: 600, textAlign: 'center',
              background: 'linear-gradient(180deg, rgba(20,8,42,0.85) 0%, rgba(8,4,26,0.9) 100%)',
              border: `1px solid ${ACCENT}55`,
              boxShadow: `0 24px 48px rgba(0,0,0,0.6), 0 0 24px ${ACCENT}33, inset 0 1px 0 ${ACCENT}55`,
              borderRadius: 18,
              animation: 'em-qs-prompt-rise 540ms var(--em-ease) both',
            }}
          >
            <div className="em-eyebrow" style={{ color: ACCENT, marginBottom: 8 }}>QUESTION · PYTANIE</div>
            <div className="em-decor" style={{ fontSize: 24, color: 'var(--em-text)', lineHeight: 1.35 }}>{q.prompt}</div>
            {revealedHint && (
              <div style={{ marginTop: 10, fontSize: 13, color: ACCENT, fontStyle: 'italic' }}>
                💡 {q.hint}
              </div>
            )}
          </div>

          {/* Answer buttons — A/B/C/D */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, width: '100%', maxWidth: 720, marginTop: 8 }}>
            {q.options.map((opt, i) => {
              const isPicked = picked === i;
              const isAnswer = i === q.answerIndex;
              const showRight = verdict !== null && isAnswer;
              const showWrong = verdict === 'wrong' && isPicked && !isAnswer;
              const baseAccent = showRight ? '#34D399' : showWrong ? '#FB7185' : ACCENT;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPick(i)}
                  disabled={verdict !== null || !!forcedState}
                  aria-label={`Option ${String.fromCharCode(65 + i)}: ${opt}`}
                  aria-pressed={isPicked}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', minHeight: 60,
                    background: showRight
                      ? 'linear-gradient(180deg, rgba(52,211,153,0.22), rgba(8,4,26,0.85))'
                      : showWrong
                        ? 'linear-gradient(180deg, rgba(251,113,133,0.22), rgba(8,4,26,0.85))'
                        : isPicked
                          ? `linear-gradient(180deg, ${ACCENT}33, rgba(8,4,26,0.85))`
                          : 'linear-gradient(180deg, rgba(20,8,42,0.78), rgba(8,4,26,0.85))',
                    border: `1px solid ${baseAccent}${showRight || showWrong || isPicked ? 'cc' : '55'}`,
                    borderRadius: 14, color: 'var(--em-text)', cursor: verdict !== null ? 'default' : 'pointer',
                    fontFamily: 'var(--em-decor)', fontSize: 18, textAlign: 'left',
                    boxShadow: showRight
                      ? `0 0 24px #34D399aa, 0 8px 20px rgba(0,0,0,0.4)`
                      : showWrong
                        ? `0 0 24px #FB7185aa, 0 8px 20px rgba(0,0,0,0.4)`
                        : `0 8px 18px rgba(0,0,0,0.4)`,
                    animation: showWrong ? 'em-qs-buzzer 0.34s var(--em-ease)' : showRight ? 'em-qs-chime 0.6s var(--em-ease)' : 'none',
                    transition: 'all 220ms var(--em-ease)',
                  }}
                >
                  <span aria-hidden="true" style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: showRight ? '#34D399' : showWrong ? '#FB7185' : `${baseAccent}26`,
                    border: `1.5px solid ${baseAccent}`, color: showRight || showWrong ? '#0E0A1A' : baseAccent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--em-mono)', fontSize: 14, fontWeight: 700, flex: '0 0 36px',
                    boxShadow: `0 0 8px ${baseAccent}77`,
                  }}>{String.fromCharCode(65 + i)}</span>
                  <span style={{ flex: 1 }}>{opt}</span>
                  {showRight && <span aria-hidden="true" style={{ color: '#34D399', fontSize: 22 }}>✓</span>}
                  {showWrong && <span aria-hidden="true" style={{ color: '#FB7185', fontSize: 22 }}>✗</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* HintCard pinned bottom-left.
          Ricky 2026-05-02 (CD audit §5 Quiz Show, #15 — Mike's screenshot):
          The Bajla MÓWI hint card was overlapping option C "bottleneck" at
          his viewport because the bottom-left absolute card extended into
          the answer grid. Two fixes:
            1. `pointer-events: none` on the wrapper so even at viewports
               where visual overlap remains, taps still hit the option
               buttons through the card. Inner controls (none here) would
               re-enable pointer-events explicitly.
            2. zIndex 2 (below the answer grid which sits at zIndex 4) so
               there's no visual layering on top of the buttons either.
            3. Tighter maxWidth + responsive bottom offset so on narrower
               viewports the card sits above the answer grid floor instead
               of underneath it. */}
      {!completed && q && (
        <div
          style={{
            position: 'absolute',
            bottom: 'max(28px, env(safe-area-inset-bottom, 0px))',
            left: 28,
            maxWidth: 'min(320px, 28vw)',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>
          </div>
        </div>
      )}

      {/* Audience silhouette + applause dots — bottom-center */}
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4, opacity: verdict === 'right' ? 0.95 : 0.5, transition: 'opacity 320ms', zIndex: 3 }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} style={{
            width: 12, height: 18, borderRadius: '6px 6px 2px 2px',
            background: '#1A0830', border: '1px solid rgba(251,191,36,0.35)',
            animation: verdict === 'right' ? `em-qs-applause-dot 0.4s ease-in-out ${i * 0.04}s 4` : 'none',
          }} />
        ))}
      </div>

      {/* Standalone Bajla on the curtain removed 2026-05-03 — chat-widget
          mascot is the canonical presence. */}

      {/* Completion overlay (DESIGN.md §4) */}
      {completed && !onSessionComplete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-live="assertive"
          aria-label="Quiz Show complete"
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
            animation: 'em-rise 0.4s var(--em-ease)', zIndex: 10,
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>The curtain falls.</div>
          <div className="em-eyebrow">FINAL SCORE · WYNIK KOŃCOWY</div>
          <div style={{ display: 'flex', gap: 28, alignItems: 'baseline' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="em-decor" style={{ fontSize: 44, color: '#34D399' }}>{score.right}</div>
              <div className="em-eyebrow" style={{ color: '#34D399' }}>RIGHT · DOBRZE</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="em-decor" style={{ fontSize: 44, color: '#FB7185' }}>{score.wrong}</div>
              <div className="em-eyebrow" style={{ color: '#FB7185' }}>WRONG · ŹLE</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button ref={tryAnotherBtnRef} type="button" className="em-btn em-btn-ghost" onClick={reset}>Try another</button>
            <button ref={nextDistrictBtnRef} type="button" className="em-btn em-btn-primary" onClick={reset}>Next district →</button>
          </div>
        </div>
      )}
      <Confetti show={completed} />
    </div>
  );
};

export default QuizShowShell;
