import { ChallengeArena, useChallengeArcade } from './challenge-arcade';
// True / False — The Crossroads district.
// Statements about English grammar/facts arrive on a street sign.
// Players slap the green TRUE light or red FALSE light. Streak builds.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import type { ShellTrueFalsePuzzle } from '../lib/adapters';

import React, { useEffect, useRef, useState } from 'react';
import { Bajla, HintButton, HintCard, Nameplate, Progress, SkipButton } from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';

// Courthouse · True / False — full bilingual instruction copy.
const TRUEFALSE_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A statement about English grammar or a fact lights up on a street sign.',
      'Decide whether the statement is true or false.',
      'Slap the green TRUE orb if it is correct, or the red FALSE orb if it is wrong.',
      'Bajla announces the verdict and lights up the correct answer with a small fact.',
    ],
    pl: [
      'Na znaku ulicznym pojawia się stwierdzenie o gramatyce lub faktach z angielskiego.',
      'Zdecyduj, czy stwierdzenie jest prawdziwe, czy fałszywe.',
      'Stuknij zieloną kulę PRAWDA, jeśli jest poprawne, albo czerwoną kulę FAŁSZ, jeśli błędne.',
      'Bajla ogłasza werdykt i podświetla właściwą odpowiedź wraz z krótkim faktem.',
    ],
  },
  controls: {
    en: [
      'Sign card: the bilingual statement under the lamps.',
      'TRUE orb (green) and FALSE orb (red): tap one to commit your verdict.',
      'Skip button: jumps to the next sign — no verdict, no streak boost.',
      'Counter (top-right): score and crossings completed.',
    ],
    pl: [
      'Karta znaku: dwujęzyczne stwierdzenie pod lampami.',
      'Kula PRAWDA (zielona) i FAŁSZ (czerwona): stuknij jedną, aby zatwierdzić werdykt.',
      'Przycisk Pomiń: przeskakuje do następnego znaku — brak werdyktu, brak premii do serii.',
      'Licznik (w prawym górnym rogu): wynik i ukończone przejścia.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right verdict: the chosen orb glows, +1 to your score, fact pops up.',
      'Wrong verdict: chosen orb dims, the correct orb pulses, fact still pops up so you learn.',
      'Skip: moves to the next sign and counts as a miss for streak purposes — no fire.',
      'Once committed you cannot change the verdict — Next sign loads in.',
    ],
    pl: [
      'Trafny werdykt: wybrana kula świeci, +1 do wyniku, pojawia się fakt.',
      'Błędny werdykt: wybrana kula gaśnie, poprawna pulsuje, fakt i tak się pojawia — uczysz się.',
      'Pomiń: przeskakuje do następnego znaku i liczy się jako pudło dla serii — bez ognia.',
      'Po zatwierdzeniu nie zmieniasz werdyktu — ładuje się następny znak.',
    ],
  },
  hintMechanic: {
    en:
      'No reveal hints in TRUE / FALSE — there are only two options, so a hint would be the answer. Read the bilingual sign carefully and trust your instinct.',
    pl:
      'W PRAWDA / FAŁSZ nie ma podpowiedzi odsłaniających — są tylko dwie opcje, więc podpowiedź byłaby odpowiedzią. Przeczytaj uważnie dwujęzyczny znak i zaufaj instynktowi.',
  },
  scoring: {
    en:
      'Skip counts as a miss. Each correct verdict adds to your session streak. Crossing all signs unlocks the Crossroads completion screen and posts your score back to your timeline.',
    pl:
      'Pomiń liczy się jako pudło. Każdy trafny werdykt zwiększa serię. Przejście przez wszystkie znaki odblokowuje ekran zakończenia Skrzyżowania i zapisuje wynik na osi czasu.',
  },
  l1Pattern: {
    en:
      'Polish learners often over-extend "the" to abstract nouns ("the love is important"). Many TRUE / FALSE prompts test article placement — read the article slot first, then judge.',
    pl:
      'Polscy uczniowie często nadużywają „the" przy rzeczownikach abstrakcyjnych („the love is important"). Wiele zdań PRAWDA / FAŁSZ testuje miejsce rodzajnika — najpierw popatrz na rodzajnik, potem oceń.',
  },
};

// ─────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────
interface TFQuestion {
  q: string;
  q_pl: string;
  ans: boolean;
  fact: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  TF_QUESTIONS don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

const TF_QUESTIONS: TFQuestion[] = [
  { q: "London's Tower Bridge is the same as London Bridge.",        q_pl: 'To ten sam most.',                ans: false, fact: 'Different bridges — Tower Bridge has the towers.' },
  { q: "In English, 'I am going' is the present continuous tense.",  q_pl: 'Czas teraźniejszy ciągły.',       ans: true,  fact: 'Yes — be + verb-ing.' },
  { q: "The plural of 'foot' is 'foots'.",                           q_pl: "Liczba mnoga 'foot' to 'foots'.", ans: false, fact: "It's 'feet' — irregular." },
  { q: "'Their' shows possession.",                                  q_pl: "'Their' oznacza posiadanie.",     ans: true,  fact: 'Yes — their car, their idea.' },
  { q: "'Run' uses the same form for past and present.",             q_pl: 'Ten sam czas teraźniejszy i przeszły.', ans: false, fact: 'Past: ran. Past participle: run.' },
  { q: "'A' is used before consonant sounds, 'an' before vowels.",   q_pl: "'A' przed spółgłoskami, 'an' przed samogłoskami.", ans: true, fact: 'An apple, a banana, an hour (sound, not letter).' },
];

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type ShellTime = 'day' | 'dusk' | 'night';
export type ShellState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;

export interface TrueFalseShellProps {
  time?: ShellTime;
  state?: ShellState;
  /**
   * When provided (e.g. from StudentPractice's generator + adapter pipeline),
   * the shell renders this question set instead of TF_QUESTIONS.
   */
  puzzle?: ShellTrueFalsePuzzle;
  /** Layer-4 dynamic-scaffolding hook (Agent A12). Fires on each wrong slap. */
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3-TrueFalse Wave-2 (Ricky 2026-05-02): fires once when every statement has
   * been seen (judged or skipped). The host uses this to mount <PracticeReview>
   * over the shell area. Per-question payload mirrors other Wave-2 shells:
   *   - questionId   = q.q (the EN statement, stable inside the puzzle)
   *   - studentAnswer = 'TRUE' | 'FALSE' | 'SKIPPED'
   *   - correctAnswer = q.ans ? 'TRUE' : 'FALSE'
   *   - explanationPL is set from q.q_pl + q.fact when provided, so the
   *     review's rule callout shows the bilingual reasoning.
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
    puzzle: ShellTrueFalsePuzzle;
    /** Statement ids the student skipped — surfaces as muted chips in review. */
    skippedQuestionIds: string[];
  }) => void;
}

type Verdict = 'right' | 'wrong' | null;
interface Score { right: number; wrong: number; }

// ─────────────────────────────────────────────────────────────
// renderTrueFalseReviewItem — per-statement locked render for PracticeReview's
// `renderItem` callback. Renders the bilingual statement on a dim-paper sign,
// shows the student's TRUE/FALSE pick + the correct verdict + the q.fact
// explanation. Skipped statements render with a muted "SKIPPED" tag.
// ─────────────────────────────────────────────────────────────
const TF_REVIEW_RIGHT = '#34D399';
const TF_REVIEW_WRONG = '#FB7185';
export function renderTrueFalseReviewItem(
  question: TFQuestion,
  studentAnswer: string | undefined,
  isSkipped: boolean,
): React.ReactNode {
  const correctVerdict: 'TRUE' | 'FALSE' = question.ans ? 'TRUE' : 'FALSE';
  const studentVerdict = studentAnswer === 'TRUE' || studentAnswer === 'FALSE' ? studentAnswer : null;
  const wasRight = !isSkipped && studentVerdict === correctVerdict;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: 'linear-gradient(180deg, rgba(52,211,153,0.05), rgba(20,16,42,0.55))',
      border: `1px solid ${wasRight ? TF_REVIEW_RIGHT : TF_REVIEW_WRONG}33`,
      borderRadius: 8,
    }}>
      {/* Verdict chips row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['TRUE', 'FALSE'] as const).map((v) => {
          const isCorrect = v === correctVerdict;
          const wasPicked = studentVerdict === v && !isSkipped;
          return (
            <span key={v} style={{
              padding: '4px 12px', borderRadius: 999,
              fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.16em', fontWeight: 700,
              background: isCorrect
                ? 'linear-gradient(180deg, #34D399, #15532A)'
                : wasPicked
                  ? 'linear-gradient(180deg, #FB7185, #9B1C2E)'
                  : 'rgba(20,16,42,0.6)',
              color: isCorrect || wasPicked ? '#FFF' : 'rgba(245,239,255,0.45)',
              boxShadow: isCorrect
                ? '0 0 0 1px #34D399, 0 0 8px rgba(52,211,153,0.5)'
                : wasPicked ? '0 0 0 1px #FB7185' : '0 0 0 1px rgba(245,239,255,0.15)',
            }}>
              {v === 'TRUE' ? '✓ TRUE · PRAWDA' : '✗ FALSE · FAŁSZ'}
              {isCorrect ? ' ← correct' : wasPicked ? ' ← you' : ''}
            </span>
          );
        })}
        {isSkipped ? (
          <span style={{
            padding: '4px 10px', borderRadius: 999,
            fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em',
            background: 'rgba(245,239,255,0.06)', color: 'rgba(245,239,255,0.55)',
          }}>— SKIPPED · POMINIĘTO</span>
        ) : null}
      </div>
      {/* Fact line — q.fact carries the rule explanation */}
      {question.fact ? (
        <div style={{ fontSize: 13, color: 'var(--em-text, #EDE6FF)', lineHeight: 1.45, fontStyle: 'italic' }}>
          {question.fact}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export const TrueFalseShell: React.FC<TrueFalseShellProps> = ({ time = 'dusk', state: forcedState = null, puzzle, onWrongAnswer, onSessionComplete }) => {
  const arcade = useChallengeArcade();
  // Use the supplied puzzle (when StudentPractice mounts the shell with vocab-
  // generated questions); otherwise fall back to the built-in demo set.
  const activeQuestions: TFQuestion[] = puzzle && puzzle.questions.length > 0 ? puzzle.questions : TF_QUESTIONS;
  // D3-TrueFalse Wave-2 (2026-05-02): per-question wrong-attempt accumulator
  // + skipped log. Refs avoid re-renders on push (mirrors GapFill's pattern).
  // sessionFiredRef prevents double-fires of onSessionComplete.
  const wrongAttemptsRef = useRef<Array<{
    questionId: string; studentAnswer: string; correctAnswer: string;
    explanationPL?: string; exerciseId?: string;
  }>>([]);
  const skippedQuestionIdsRef = useRef<string[]>([]);
  const sessionFiredRef = useRef(false);

  const [idx, setIdx] = useState<number>(0);
  // EM-041 (Builder 7): track questions SEEN (correct OR skipped) separately
  // from `score.right` so the Progress eyebrow shows skip-aware advancement
  // (Q 05/09 · ✓ 03/09). Skip increments `questionsSeen` only; correct answers
  // increment both. Without this, repeated Skips left the counter frozen.
  const [questionsSeen, setQuestionsSeen] = useState<number>(0);

  // Persisted progress (skipped when forcedState is set for design-canvas demos).
  const persisted = useShellProgress('truefalse');

  // Auto-save progress as questions are answered.
  useEffect(() => {
    if (forcedState) return;
    const total = activeQuestions.length;
    persisted.save({ progress: questionsSeen / total, lastState: questionsSeen >= total ? 'complete' : 'active' });
    if (questionsSeen >= total) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [questionsSeen, forcedState, activeQuestions.length]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'truefalse',
      brief: "Read the statement and choose TRUE or FALSE to open the crossing.",
      brief_pl: "Przeczytaj stwierdzenie i wybierz PRAWDA lub FAŁSZ.",
      detail: "Read the statement and choose TRUE or FALSE to open the crossing. A wrong verdict reveals the correct answer and the explanation. Use T / F or tap the answer. Continue when you have read the feedback.",
      detail_pl: "Przeczytaj stwierdzenie i wybierz PRAWDA lub FAŁSZ. Po błędzie zobaczysz poprawny werdykt i wyjaśnienie. Użyj T / F lub stuknij odpowiedź. Kontynuuj po przeczytaniu wyjaśnienia.",
      fullInstructions: { ...TRUEFALSE_INSTRUCTIONS, whatYouDo: {"en": ["Read the statement and choose TRUE or FALSE to open the crossing.", "A wrong verdict reveals the correct answer and the explanation.", "Use T / F or tap the answer. Continue when you have read the feedback."], "pl": ["Przeczytaj stwierdzenie i wybierz PRAWDA lub FAŁSZ.", "Po błędzie zobaczysz poprawny werdykt i wyjaśnienie.", "Użyj T / F lub stuknij odpowiedź. Kontynuuj po przeczytaniu wyjaśnienia."]}, controls: {"en": ["Read the statement and choose TRUE or FALSE to open the crossing.", "A wrong verdict reveals the correct answer and the explanation.", "Use T / F or tap the answer. Continue when you have read the feedback."], "pl": ["Przeczytaj stwierdzenie i wybierz PRAWDA lub FAŁSZ.", "Po błędzie zobaczysz poprawny werdykt i wyjaśnienie.", "Użyj T / F lub stuknij odpowiedź. Kontynuuj po przeczytaniu wyjaśnienia."]}, rightWrongSkip: {"en": ["Correct choices earn arcade points. Mistakes stay available in your session review. Skip moves on without points."], "pl": ["Poprawne wybory dają punkty arcade. Błędy zobaczysz w przeglądzie sesji. Pominięcie przechodzi dalej bez punktów."]} },
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);
  const [streak, setStreak] = useState<number>(0);
  const [score, setScore] = useState<Score>({ right: 0, wrong: 0 });
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [answered, setAnswered] = useState<boolean>(false);
  // Polite live region announcement.
  const [announcement, setAnnouncement] = useState<string>('');
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  // When set, the active sign reveals the True/False answer (one-shot).
  const [showHint, setShowHint] = useState<boolean>(false);

  const q = activeQuestions[idx % activeQuestions.length];

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') {
      setIdx(0); setVerdict(null); setAnswered(false);
      setScore({ right: 0, wrong: 0 }); setStreak(0); setQuestionsSeen(0);
    }
    if (forcedState === 'active') {
      setIdx(2); setVerdict(null); setAnswered(false);
      setScore({ right: 2, wrong: 0 }); setStreak(2); setQuestionsSeen(2);
    }
    if (forcedState === 'correct') {
      setIdx(2); setVerdict('right'); setAnswered(true);
      setScore({ right: 3, wrong: 0 }); setStreak(3); setQuestionsSeen(3);
    }
    if (forcedState === 'wrong') {
      setIdx(2); setVerdict('wrong'); setAnswered(true);
      setScore({ right: 2, wrong: 1 }); setStreak(0); setQuestionsSeen(3);
    }
    if (forcedState === 'complete') {
      setIdx(activeQuestions.length - 1); setVerdict('right'); setAnswered(true);
      setScore({ right: activeQuestions.length, wrong: 0 }); setStreak(activeQuestions.length);
      setQuestionsSeen(activeQuestions.length);
    }
  }, [forcedState]);

  const answer = (val: boolean): void => {
    if (forcedState) return;
    if (answered) return;
    const correct = val === q.ans;
    arcade.decide(correct, `verdict-${idx}`);

    // Fix-2 (Opus 4.7): Layer-4 InterferenceTip overlay — fire the parent
    // callback FIRST, before any local state mutation, so the parent's
    // `wrongAnswer` state is set in the same React event-batch as the
    // shell's inline reveal. This guarantees the overlay mounts on the
    // same flush as the inline-reveal box and the inline reveal cannot
    // gate or short-circuit it.
    if (!correct && onWrongAnswer) {
      onWrongAnswer({
        questionId: q.q,
        studentAnswer: val ? 'TRUE' : 'FALSE',
        correctAnswer: q.ans ? 'TRUE' : 'FALSE',
        explanationPL: q.q_pl,
        exerciseId: q.exerciseId,
      });
    }
    // D3 Wave-2: record into the session accumulator for the review screen.
    if (!correct && onSessionComplete) {
      wrongAttemptsRef.current.push({
        questionId: q.q,
        studentAnswer: val ? 'TRUE' : 'FALSE',
        correctAnswer: q.ans ? 'TRUE' : 'FALSE',
        // Prefer the q.fact rule explanation; fall back to the bilingual q_pl
        // when fact is absent (vocab-generator path).
        explanationPL: q.fact ?? q.q_pl,
        exerciseId: q.exerciseId,
      });
    }

    setVerdict(correct ? 'right' : 'wrong');
    setScore(s => ({ right: s.right + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) }));
    setStreak(st => correct ? st + 1 : 0);
    setAnswered(true);
    // EM-041: bump seen counter exactly once per question regardless of right/wrong.
    setQuestionsSeen(s => Math.min(s + 1, activeQuestions.length));
    setAnnouncement(correct ? 'Correct. Dobrze.' : `Wrong. Źle. ${q.fact}`);
  };

  // EM-041 (Builder 7): Skip handler. Bumps `questionsSeen` so the Progress
  // counter advances; leaves `score.right` alone so ✓ count stays honest.
  const skip = (): void => {
    if (forcedState) return;
    if (!answered) {
      setQuestionsSeen(s => Math.min(s + 1, activeQuestions.length));
      // D3 Wave-2: log the skip so the review can render the muted SKIPPED chip.
      if (onSessionComplete && !skippedQuestionIdsRef.current.includes(q.q)) {
        skippedQuestionIdsRef.current.push(q.q);
      }
    }
    setVerdict(null); setAnswered(false);
    setIdx(i => (i + 1) % activeQuestions.length);
    setAnnouncement('');
    setShowHint(false);
  };

  // D3-TrueFalse Wave-2 (2026-05-02): fire onSessionComplete ONCE when every
  // statement has been seen (judged or skipped). The host then mounts
  // <PracticeReview> over the shell area and suppresses the in-shell dialog.
  const sessionComplete = questionsSeen >= activeQuestions.length;
  useEffect(() => { if (sessionComplete && !forcedState) arcade.finish(); }, [sessionComplete, forcedState]);
  useEffect(() => {
    if (forcedState) return;
    if (!sessionComplete) return;
    if (sessionFiredRef.current) return;
    if (!onSessionComplete) return;
    sessionFiredRef.current = true;
    onSessionComplete({
      correctCount: score.right,
      totalQuestions: activeQuestions.length,
      wrongAttempts: [...wrongAttemptsRef.current],
      puzzle: { questions: activeQuestions },
      skippedQuestionIds: [...skippedQuestionIdsRef.current],
    });
  }, [sessionComplete, forcedState, onSessionComplete, score.right, activeQuestions]);

  // `next` is used after a confirmed answer (Next sign button); doesn't bump
  // questionsSeen because answering already did.
  const next = (): void => {
    setVerdict(null); setAnswered(false);
    setIdx(i => (i + 1) % activeQuestions.length);
    setAnnouncement('');
    setShowHint(false);
  };

  const reset = (): void => {
    arcade.reset();
    setIdx(0);
    setScore({ right: 0, wrong: 0 });
    setStreak(0);
    setAnswered(false);
    setVerdict(null);
    setAnnouncement('');
    setShowHint(false);
    setHintsUsed(0);
    setQuestionsSeen(0);
    // D3 Wave-2: clear the session accumulators so a Try-another run
    // doesn't carry stale wrongs/skips.
    wrongAttemptsRef.current = [];
    skippedQuestionIdsRef.current = [];
    sessionFiredRef.current = false;
  };

  // Reveal the answer (one hint per question; persists until next).
  const useHint = (): void => {
    if (forcedState || answered || hintsUsed >= 3 || showHint) return;
    setShowHint(true);
    setHintsUsed(h => h + 1);
    setAnnouncement(`Hint: the answer is ${q.ans ? 'TRUE · prawda' : 'FALSE · fałsz'}.`);
  };

  const isDone = idx === activeQuestions.length - 1 && answered;

  return <ChallengeArena variant="verdict" title="The Courthouse" mission="Light every crossing with a sound verdict." prompt={q.q} translation={q.q_pl} options={['TRUE · PRAWDA', 'FALSE · FAŁSZ']} picked={answered ? (verdict === 'right' ? (q.ans ? 0 : 1) : (q.ans ? 1 : 0)) : null} answerIndex={q.ans ? 0 : 1} revealed={answered} round={idx} total={activeQuestions.length} score={score.right} completed={sessionComplete} onPick={i => answer(i === 0)} onNext={next} onSkip={skip} onReset={reset} hint={answered ? q.fact : undefined} run={arcade} />;
};

export default TrueFalseShell;
