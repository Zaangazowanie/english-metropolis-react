import { ChallengeArena, useChallengeArcade } from './challenge-arcade';
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
  const arcade = useChallengeArcade();
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

  const [roundStarted, setRoundStarted] = useState(false);
  const [relaxed, setRelaxed] = useState(false);
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
  useEffect(() => { if (completed && !forcedState) arcade.finish(); }, [completed, forcedState]);
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
      brief: "Choose Start round when you are ready. The clock starts only then.",
      brief_pl: "Wybierz Rozpocznij rundę, gdy jesteś gotów. Dopiero wtedy rusza zegar.",
      detail: "Choose Start round when you are ready. The clock starts only then. Choose the correct answer before time runs out; faster correct answers earn a bonus. Use Relaxed mode to play without a time limit. Read feedback and press Next challenge.",
      detail_pl: "Wybierz Rozpocznij rundę, gdy jesteś gotów. Dopiero wtedy rusza zegar. Wybierz poprawną odpowiedź przed końcem czasu. Szybkie trafienia dają premię. Włącz tryb bez limitu czasu, jeśli wolisz. Przeczytaj wyjaśnienie i wybierz Dalej.",
      fullInstructions: { ...QUIZSHOW_INSTRUCTIONS, whatYouDo: {"en": ["Choose Start round when you are ready. The clock starts only then.", "Choose the correct answer before time runs out; faster correct answers earn a bonus.", "Use Relaxed mode to play without a time limit. Read feedback and press Next challenge."], "pl": ["Wybierz Rozpocznij rundę, gdy jesteś gotów. Dopiero wtedy rusza zegar.", "Wybierz poprawną odpowiedź przed końcem czasu. Szybkie trafienia dają premię.", "Włącz tryb bez limitu czasu, jeśli wolisz. Przeczytaj wyjaśnienie i wybierz Dalej."]}, controls: {"en": ["Choose Start round when you are ready. The clock starts only then.", "Choose the correct answer before time runs out; faster correct answers earn a bonus.", "Use Relaxed mode to play without a time limit. Read feedback and press Next challenge."], "pl": ["Wybierz Rozpocznij rundę, gdy jesteś gotów. Dopiero wtedy rusza zegar.", "Wybierz poprawną odpowiedź przed końcem czasu. Szybkie trafienia dają premię.", "Włącz tryb bez limitu czasu, jeśli wolisz. Przeczytaj wyjaśnienie i wybierz Dalej."]}, rightWrongSkip: {"en": ["Correct choices earn arcade points. Mistakes stay available in your session review. Skip moves on without points."], "pl": ["Poprawne wybory dają punkty arcade. Błędy zobaczysz w przeglądzie sesji. Pominięcie przechodzi dalej bez punktów."]} },
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
    if (verdict !== null || !roundStarted || relaxed) return;
    setTimeLeft(ROUND_TIME_MS);
    const start = performance.now();
    const tick = (): void => {
      const elapsed = performance.now() - start;
      const left = Math.max(0, ROUND_TIME_MS - elapsed);
      setTimeLeft(left);
      if (left <= 0) {
        // Time's up — count as wrong, mark, advance after the buzzer.
        arcade.decide(false, `quiz-${idx}`);
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
  }, [idx, verdict, forcedState, completed, q, roundStarted, relaxed]);

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
    arcade.decide(right, q.id, relaxed ? 100 : 100 + Math.floor(timeLeft / ROUND_TIME_MS * 50));
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

  // Keep the answer and explanation visible until the learner continues.
  const advanceRound = () => {
    setIdx(i => i + 1); setPicked(null); setVerdict(null);
    setRevealedHint(false); setRoundStarted(false); setTimeLeft(ROUND_TIME_MS);
  };
  const skipRound = () => {
    if (forcedState || !q || verdict !== null) return;
    tip.recordWrong({ questionId: q.id, studentAnswer: '(skipped)', correctAnswer: q.options[q.answerIndex], explanationPL: q.hint_pl, exerciseId: q.exerciseId });
    arcade.decide(false, q.id); advanceRound();
  };

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 2 || !q) return;
    setHintsUsed((h) => h + 1);
    setRevealedHint(true);
  };

  const reset = (): void => {
    arcade.reset(); setRoundStarted(false);
    setIdx(0); setPicked(null); setVerdict(null); setScore({ right: 0, wrong: 0 });
    setHintsUsed(0); setRevealedHint(false); tip.reset();
  };



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

  return <ChallengeArena variant="quiz" title="The Auditorium" mission="Win the spotlight. Fast, accurate answers earn bonus points." prompt={q?.prompt} options={q?.options ?? []} picked={picked} answerIndex={q?.answerIndex ?? -1} revealed={verdict !== null} round={idx} total={active.rounds.length} score={score.right} completed={completed} onPick={onPick} onNext={advanceRound} onSkip={skipRound} onReset={reset} onHint={useHint} hintDisabled={hintsUsed >= 2 || revealedHint} hint={verdict !== null ? q?.hint_pl || q?.hint : revealedHint ? q?.hint : undefined} run={arcade} ready={roundStarted || verdict !== null} onReady={() => setRoundStarted(true)} seconds={relaxed ? undefined : String(Math.ceil(timeLeft / 1000))} timeFraction={relaxed ? undefined : timeLeft / ROUND_TIME_MS}>
    {!roundStarted && !completed && <label className="challenge-relaxed"><input type="checkbox" checked={relaxed} onChange={e => setRelaxed(e.target.checked)} /> Relaxed mode · Bez limitu czasu</label>}
  </ChallengeArena>;
};

export default QuizShowShell;
