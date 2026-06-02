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
    persisted.save({ progress: idx / total, lastState: idx >= total ? 'complete' : 'active' });
    if (idx >= total) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [idx, forcedState, activeQuestions.length]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'truefalse',
      brief: 'Read the sign. Tap green TRUE or red FALSE.',
      brief_pl: 'Przeczytaj znak. Stuknij zielone PRAWDA lub czerwone FAŁSZ.',
      detail: 'A road sign appears with a single statement. Decide whether it is true or false based on the lesson facts. Tap TRUE for green, FALSE for red — you commit immediately. Right answers light up; wrong ones reveal the correct verdict.',
      detail_pl: 'Pojawia się znak drogowy z jednym stwierdzeniem. Zdecyduj, czy jest prawdziwe czy fałszywe na podstawie faktów z lekcji. Stuknij TRUE (zielony) lub FALSE (czerwony) — zatwierdzasz od razu. Trafione świecą; błędne pokazują właściwą odpowiedź.',
      fullInstructions: TRUEFALSE_INSTRUCTIONS,
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

  return (
    <div className="em-shell" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Decorative atmosphere stack — Ricky 2026-05-02 (#15 audit pass).
          Background, zebra-crossing, and grain all forced to zIndex:0 +
          pointerEvents:none so the bottom-edge zebra (which used 3D-perspective
          transform) cannot intercept taps near the Bajla footer / Next-sign
          button at common viewports (375/414/768/1280/1920). */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background:
        time === 'day'
          ? 'linear-gradient(180deg, #4C2F7E 0%, #C58BD9 100%)'
          : time === 'night'
            ? 'linear-gradient(180deg, #06031A 0%, #1F0E3A 100%)'
            : 'linear-gradient(180deg, #1F1240 0%, #4C2570 100%)'
      }}/>
      {/* zebra crossing on the road */}
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, zIndex: 0, pointerEvents: 'none', background:
        'repeating-linear-gradient(90deg, rgba(255,255,255,0.45) 0 28px, transparent 28px 56px)',
        transform: 'perspective(300px) rotateX(40deg)', transformOrigin: 'bottom', opacity: 0.6 }}/>
      <div className="em-grain" aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}/>

      <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', zIndex: 5 }}>
        {/* Kelly Tier-2 audit (2026-05-02): unified district + subtitle to
            "Courthouse" — previous "Crossroads" subtitle conflicted with the
            "Courthouse" district name, splitting the theme. */}
        <AmbientAudioPlayer shellSlug="truefalse" />
        <Nameplate district="The Courthouse" subtitle="True / False · Prawda czy fałsz · weigh the verdict" accent="#34D399"
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="8" y="3" width="6" height="16" rx="2" stroke="#34D399" strokeWidth="1.5"/><circle cx="11" cy="7" r="1.5" fill="#FB7185"/><circle cx="11" cy="11" r="1.5" fill="#FBBF24"/><circle cx="11" cy="15" r="1.5" fill="#34D399"/></svg>}/>
        {/* Kelly Tier-2 audit (2026-05-02): the header had FOUR counters —
            ✓N ✗N + Progress's "Q seen/total · ✓ correct/total" — duplicating
            the ✓ tally. The new shared Progress primitive already shows
            position + completion via the dotted bar; we keep only the
            ✓/✗ tally chips and the position counter, dropping the redundant
            "✓ N / N" mirror. */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="em-eyebrow" style={{ color: '#34D399' }} aria-label={`${score.right} correct`}>✓ {score.right}</span>
          <span className="em-eyebrow" style={{ color: '#FB7185' }} aria-label={`${score.wrong} wrong`}>✕ {score.wrong}</span>
          {streak >= 2 && <span className="em-eyebrow" style={{ color: '#FBBF24' }} aria-label={`${streak} streak`}>🔥 {streak} STREAK</span>}
          {/* Position-only — `current` omitted so Progress shows clean Q seen/total
              and the dotted bar visually conveys completion (filled cells = score.right). */}
          <Progress current={score.right} total={activeQuestions.length} seen={questionsSeen} accent="#34D399"/>
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      <div style={{ position: 'absolute', inset: '110px 32px 80px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 64 }}>
        {/* the question on a street sign */}
        <div style={{ position: 'relative', maxWidth: 380 }} role="region" aria-label="Statement">
          <div style={{
            position: 'relative',
            background: '#F5EBD8',
            color: '#3F2510',
            padding: '32px 28px',
            borderRadius: 8,
            boxShadow: '0 18px 40px rgba(0,0,0,0.5)',
            border: '4px solid #1A0F08',
            fontFamily: 'var(--em-decor)', fontSize: 22, lineHeight: 1.3,
            transition: 'transform 220ms',
          }}>
            <div className="em-eyebrow" style={{ color: '#876543', marginBottom: 8 }}>STREET FACT · FAKT ULICY · No.{idx + 1}</div>
            "{q.q}"
            <div style={{ fontFamily: 'var(--em-body)', fontSize: 13, color: '#876543', marginTop: 12, fontStyle: 'italic' }}>
              🇵🇱 {q.q_pl}
            </div>
            {showHint && !answered && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  background: '#FBBF2422',
                  border: '1px dashed #FBBF24',
                  borderRadius: 6,
                  fontFamily: 'var(--em-body)',
                  fontSize: 12,
                  color: '#3F2510',
                  animation: 'em-tip-fade 220ms var(--em-ease) both',
                }}
              >
                <strong>Hint:</strong> the answer is {q.ans ? 'TRUE' : 'FALSE'}.
                <span className="em-hint-pl" style={{ display: 'block', marginTop: 4, color: '#876543' }}>
                  🇵🇱 odpowiedź to {q.ans ? 'PRAWDA' : 'FAŁSZ'}
                </span>
              </div>
            )}
            {answered && (
              <div style={{ marginTop: 14, padding: '10px 12px', background: verdict === 'right' ? '#34D39922' : '#FB718522', border: `1px solid ${verdict === 'right' ? '#34D399' : '#FB7185'}`, borderRadius: 6, fontFamily: 'var(--em-body)', fontSize: 12, color: '#3F2510', fontStyle: 'italic' }}>
                {q.fact}
              </div>
            )}
            {/* sign post */}
            <div style={{ position: 'absolute', bottom: -120, left: '50%', transform: 'translateX(-50%)', width: 8, height: 120, background: '#1A0F08' }}/>
          </div>
        </div>

        {/* The traffic light verdict */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }} role="group" aria-label="True or false answer">
          <button onClick={() => answer(true)} disabled={answered}
            role="button"
            aria-label="True"
            tabIndex={0}
            style={{
              width: 130, height: 130, borderRadius: '50%',
              background: 'radial-gradient(circle at 30% 30%, #6CFAB8, #34D399)',
              border: '6px solid #14082A',
              boxShadow: (verdict === 'right' && q.ans === true) ? '0 0 60px #34D399, inset 0 -8px 12px rgba(0,0,0,0.3)' : '0 0 30px #34D39988, inset 0 -8px 12px rgba(0,0,0,0.3)',
              cursor: answered ? 'default' : 'pointer',
              color: '#0E2A1F', fontFamily: 'var(--em-decor)', fontSize: 28,
              opacity: answered && q.ans !== true ? 0.4 : 1,
              transition: 'all 220ms var(--em-ease)',
              transform: (verdict && q.ans === true) ? 'scale(1.1)' : 'scale(1)',
            }}>TRUE</button>
          <button onClick={() => answer(false)} disabled={answered}
            role="button"
            aria-label="False"
            tabIndex={0}
            style={{
              width: 130, height: 130, borderRadius: '50%',
              background: 'radial-gradient(circle at 30% 30%, #FFA8B8, #FB7185)',
              border: '6px solid #14082A',
              boxShadow: (verdict === 'right' && q.ans === false) ? '0 0 60px #FB7185, inset 0 -8px 12px rgba(0,0,0,0.3)' : '0 0 30px #FB718588, inset 0 -8px 12px rgba(0,0,0,0.3)',
              cursor: answered ? 'default' : 'pointer',
              color: '#3A0F1A', fontFamily: 'var(--em-decor)', fontSize: 26,
              opacity: answered && q.ans !== false ? 0.4 : 1,
              transition: 'all 220ms var(--em-ease)',
              transform: (verdict && q.ans === false) ? 'scale(1.1)' : 'scale(1)',
            }}>FALSE</button>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24, display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', zIndex: 5 }}>
        {answered && !isDone && (
          <button className="em-btn em-btn-primary" onClick={next} aria-label="Next sign">Next sign →</button>
        )}
      </div>

      {/* Instructions modal — centered HintCard + standalone Bajla removed
          2026-05-03; chat-widget speech bubble carries the brief. */}
      <div style={{ position: 'absolute', bottom: 90, left: 24, maxWidth: 280, zIndex: 4, opacity: answered ? 0 : 1, transition: 'opacity 220ms var(--em-ease)', pointerEvents: answered ? 'none' : 'auto' }}>
      </div>

      {/* Live region for assistive tech */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        {announcement}
      </div>

      {isDone && !onSessionComplete && (
        // D3 Wave-2 (2026-05-02): when the host wires onSessionComplete, the
        // <PracticeReview> overlay takes over the completion experience —
        // suppress this in-shell dialog so we don't double-render. Kept as a
        // fallback for the design canvas + any host that doesn't want review.
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(52,211,153,0.18), rgba(14,10,26,0.9))',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, backdropFilter: 'blur(2px)',
          animation: 'em-rise 0.5s var(--em-ease)', zIndex: 10,
        }} role="region" aria-label="Quiz complete">
          <Bajla size={84} mood="cheer" decorative/>
          <div className="em-decor" style={{ fontSize: 38, color: 'var(--em-text)' }}>Crossing complete.</div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--em-decor)', fontSize: 44, color: '#34D399' }}>{score.right}</div>
              <div className="em-eyebrow" style={{ color: '#34D399' }}>RIGHT · TRAFNE</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--em-decor)', fontSize: 44, color: '#FB7185' }}>{score.wrong}</div>
              <div className="em-eyebrow" style={{ color: '#FB7185' }}>WRONG · BŁĘDY</div>
            </div>
          </div>
          <button className="em-btn em-btn-primary" onClick={reset} aria-label="Walk again">Walk again →</button>
        </div>
      )}
    </div>
  );
};

export default TrueFalseShell;
