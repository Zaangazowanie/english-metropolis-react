import { Challenge3D } from './challenge-3d';
import { ChallengeMission, EvidenceScanner, SpeakingMission, useChallengeArcade } from './challenge-arcade';
// Reading Comprehension shell — "The Reading Room" district.
// A library reading nook at dusk: a parchment passage glows under a brass
// reading lamp; the student answers comprehension MCQs underneath. The
// passage can be hidden or revealed via a "Show passage" toggle for
// accessibility (and for a quick re-read between questions).
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Bajla,
  HintCard,
  Progress,
  Nameplate,
  SkipButton,
  HintButton,
  Confetti,
} from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components';

// Reading Room · Reading Comprehension — full bilingual instruction copy.
const READINGCOMP_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A short passage appears on a parchment scroll at the top of the reading room.',
      'Below the passage, multiple-choice questions probe what you read — both literal facts and inferences.',
      'Read the passage first, then answer each question in order.',
      'You can hide the passage with "Hide passage · Ukryj" to test yourself from memory, or peek again with "Show passage".',
    ],
    pl: [
      'Na górze sali pojawia się krótki tekst na pergaminowym zwoju.',
      'Pod tekstem zadania wielokrotnego wyboru sprawdzają, co przeczytałeś — fakty wprost i wnioski.',
      'Najpierw przeczytaj cały tekst, potem odpowiadaj na pytania po kolei.',
      'Tekst możesz ukryć przyciskiem „Hide passage · Ukryj", aby sprawdzić się z pamięci, i podejrzeć ponownie przyciskiem „Show passage".',
    ],
  },
  controls: {
    en: [
      'Parchment passage: the source text — your single source of truth for every answer.',
      'Hide / Show passage toggle: hides the parchment so you can self-test from memory.',
      'Show PL toggle: 🇵🇱 shows a Polish translation of the passage when you need a parallel-text crutch.',
      'Question card + 4 options: pick one — every answer is supported by the passage.',
      'Skip + Hint buttons: Skip jumps to next question, Hint dims one wrong option.',
    ],
    pl: [
      'Pergaminowy tekst: tekst źródłowy — jedyna podstawa każdej odpowiedzi.',
      'Przełącznik Hide / Show passage: chowa pergamin, byś mógł sprawdzić się z pamięci.',
      'Przełącznik Show PL: 🇵🇱 pokazuje polskie tłumaczenie tekstu, gdy potrzebujesz porównania.',
      'Karta pytania + 4 opcje: wybierz jedną — każda odpowiedź jest poparta tekstem.',
      'Przyciski Pomiń i Podpowiedź: Pomiń przeskakuje pytanie, Podpowiedź wygasza jedną błędną opcję.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right pick: ✓ option glows green, +1 to your tally, "Next question" appears.',
      'Wrong pick: ✗ option flashes rose, the right option highlights — Bajla gives a quick "look here in the passage" pointer.',
      'Skip: counts as wrong — moves to the next question.',
      'You can\'t change your answer after committing — but you can re-read the passage before the next question.',
    ],
    pl: [
      'Trafienie: ✓ opcja świeci na zielono, +1 do wyniku, pojawia się „Next question".',
      'Błąd: ✗ opcja mignie na różowo, a poprawna podświetli się — Bajla pokaże, gdzie w tekście znaleźć odpowiedź.',
      'Pomiń: liczy się jako błąd — przejście do następnego pytania.',
      'Po zatwierdzeniu odpowiedzi nie można jej zmienić — ale przed następnym pytaniem możesz przeczytać tekst ponownie.',
    ],
  },
  hintMechanic: {
    en:
      'You have 2 hints per session. Each tap dims one wrong option AND highlights the sentence in the passage that supports the right answer. Save them for inference questions where two options seem equally plausible.',
    pl:
      'Masz 2 podpowiedzi na sesję. Każde stuknięcie wygasza jedną błędną opcję ORAZ podświetla zdanie w tekście, które wspiera poprawną odpowiedź. Zachowaj je na pytania wnioskujące, gdzie dwie opcje wydają się równie sensowne.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each correct answer adds to your session streak. Answering every question in the passage unlocks the post-shell review with passage-anchored explanations of any wrong picks.',
    pl:
      'Pomiń liczy się jako błąd. Każda poprawna odpowiedź buduje serię w sesji. Odpowiedzenie na wszystkie pytania odblokowuje przegląd z wyjaśnieniami zakotwiczonymi w tekście.',
  },
  l1Pattern: {
    en:
      'Scanning + inference. Polish learners often translate the passage word-for-word in their head, which slows scanning. This drill builds the EN reading habit of locating key sentences ("the part that says X") without an internal Polish round-trip.',
    pl:
      'Przeszukiwanie + wnioskowanie. Polscy uczniowie często tłumaczą tekst słowo po słowie w głowie, co spowalnia czytanie. Ten poziom buduje angielski nawyk znajdowania kluczowych zdań („fragment, który mówi X") bez wewnętrznego objazdu przez polski.',
  },
};

export type ReadingCompForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

interface RCQuestion {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface ReadingCompPuzzle {
  passage: string;
  passage_pl?: string;
  title: string;
  title_pl: string;
  questions: RCQuestion[];
}

export interface ReadingCompShellProps {
  time?: TimeOfDay;
  state?: ReadingCompForcedState;
  puzzle?: ReadingCompPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3 Wave-5 (Ricky 2026-05-02): per-question review payload. Fires once
   * when the student has worked through every question in the passage.
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
    puzzle: ReadingCompPuzzle;
    studentPicks: Record<string, string>;
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// renderReadingCompReviewItem — per-question locked render for PracticeReview.
// Reading Room scoreboard: passage excerpt + question + 4 options + reference.
// ─────────────────────────────────────────────────────────────────────────
const RC_REVIEW_ACCENT = '#34D399';
export function renderReadingCompReviewItem(
  q: RCQuestion,
  number: number,
  passageExcerpt: string,
  studentAnswer: string | undefined,
): React.ReactNode {
  const correct = q.options[q.answerIndex];
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
          background: `${RC_REVIEW_ACCENT}22`, color: RC_REVIEW_ACCENT,
          border: `1px solid ${RC_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          Q {String(number).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(52,211,153,0.22)',
          color: isWrong ? '#FB7185' : RC_REVIEW_ACCENT,
        }}>
          {isWrong ? '✗ MISREAD · BŁĘDNIE' : '✓ READ · POPRAWNIE'}
        </span>
      </div>
      {/* Passage excerpt — quoted reference text. */}
      <div style={{
        fontFamily: 'var(--em-body)', fontSize: 12, fontStyle: 'italic',
        color: 'rgba(245,235,216,0.65)',
        padding: '6px 10px', borderLeft: `2px solid ${RC_REVIEW_ACCENT}66`,
        background: 'rgba(245,235,216,0.04)', borderRadius: 2,
      }}>
        "…{passageExcerpt}…"
      </div>
      <div style={{ fontFamily: 'var(--em-decor)', fontSize: 16, lineHeight: 1.3, color: 'var(--em-text, #EDE6FF)' }}>{q.prompt}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {q.options.map((opt, oi) => {
          const isCorrect = oi === q.answerIndex;
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
              color: showCorrect ? RC_REVIEW_ACCENT : showWrong ? '#FB7185' : 'var(--em-text, #EDE6FF)',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontFamily: 'var(--em-mono)', fontSize: 9, color: RC_REVIEW_ACCENT, opacity: 0.7, minWidth: 14 }}>{String.fromCharCode(65 + oi)}</span>
              <span style={{ flex: 1 }}>{opt}</span>
              {showCorrect && <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10 }}>✓ TAK</span>}
              {showWrong && <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10 }}>✗ NIE</span>}
            </div>
          );
        })}
      </div>
      {q.hint_pl && (
        <div style={{ fontFamily: 'var(--em-body)', fontSize: 12, color: 'var(--em-text-muted)', fontStyle: 'italic' }}>
          🇵🇱 {q.hint_pl}
        </div>
      )}
    </div>
  );
}

// Helper — best-effort excerpt selection: find the first sentence in the
// passage that contains a content word from the question's correct answer.
// Falls back to the first 140 characters when no overlap is found.
export function pickReadingCompExcerpt(passage: string, q: RCQuestion): string {
  if (!passage) return '';
  const correct = q.options[q.answerIndex] ?? '';
  // No lookbehind: iOS Safari < 16.4 SyntaxErrors on `(?<=...)` at parse time.
  const sentences = passage.replace(/([.!?])\s+/g, '$1\x00').split('\x00');
  if (correct) {
    const word = correct.toLowerCase().split(/\s+/)[0];
    const hit = sentences.find((s) => s.toLowerCase().includes(word));
    if (hit) return hit.trim().slice(0, 220);
  }
  return passage.slice(0, 140).trim();
}

// Built-in demo passage — used when no puzzle is supplied (design canvas).
const RC_PUZZLE: ReadingCompPuzzle = {
  title: 'A Letter in the Pages',
  title_pl: 'List między stronami',
  passage:
    'In the Reading Room, an old letter was found tucked between the pages of a book. It was written one quiet evening by a traveller who had crossed the bridge into the city. He wrote about the morning rain and a small café where he had ordered a coffee.',
  passage_pl:
    'W Czytelni znaleziono stary list ukryty między stronami książki. Napisał go cichym wieczorem podróżnik, który przeszedł przez most do miasta. Pisał o porannym deszczu i małej kawiarni, w której zamówił kawę.',
  questions: [
    {
      id: 'rc-demo-1',
      prompt: 'Which word means "a small place to drink coffee"?',
      options: ['café', 'bridge', 'evening', 'letter'],
      answerIndex: 0,
      hint: 'The traveller ordered a coffee there.',
      hint_pl: 'Podróżnik zamówił tam kawę.',
    },
    {
      id: 'rc-demo-2',
      prompt: 'When did the traveller write the letter?',
      options: ['one quiet morning', 'one quiet evening', 'one rainy afternoon', 'one cold night'],
      answerIndex: 1,
      hint: '"It was written one ___ evening".',
      hint_pl: 'Pierwsze zdanie listu.',
    },
    {
      id: 'rc-demo-3',
      prompt: 'What did the traveller cross to reach the city?',
      options: ['a river', 'a tunnel', 'a bridge', 'a square'],
      answerIndex: 2,
      hint: 'He had crossed the ___ into the city.',
      hint_pl: 'Co znajduje się między rzeką a miastem?',
    },
    {
      id: 'rc-demo-4',
      prompt: 'What was the morning weather?',
      options: ['snow', 'fog', 'sun', 'rain'],
      answerIndex: 3,
      hint: 'He wrote about the morning ___.',
      hint_pl: 'Co pada z nieba rano?',
    },
  ],
};

const ACCENT = '#34D399';
const ACCENT_GLOW = 'rgba(52,211,153,0.55)';

export const ReadingCompShell: React.FC<ReadingCompShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const arcade = useChallengeArcade();
  const activePuzzle = puzzle && puzzle.questions.length > 0 ? puzzle : RC_PUZZLE;
  const persisted = useShellProgress('readingcomp');
  // D3 Wave-5 (Ricky 2026-05-02): per-question pick log + wrong attempts.
  const [studentPicks, setStudentPicks] = useState<Record<string, string>>({});
  const [allWrongAttempts, setAllWrongAttempts] = useState<Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>>([]);
  const [completedFired, setCompletedFired] = useState(false);

  const [evidenceMarked, setEvidenceMarked] = useState(false);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showPassage, setShowPassage] = useState(true);
  const [showPolish, setShowPolish] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  // EM-041: track seen vs solved separately for skip-aware progress.
  const [seen, setSeen] = useState(0);
  const [solved, setSolved] = useState(0);
  const [questionFinalised, setQuestionFinalised] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => setEvidenceMarked(false), [idx]);
  const total = activePuzzle.questions.length;
  const cur = activePuzzle.questions[idx];
  const completed = solved >= total || (seen >= total && !forcedState);
  useEffect(() => { if (completed && !forcedState) arcade.finish(); }, [completed, forcedState]);

  // Persist progress whenever solved count changes.
  useEffect(() => {
    if (forcedState) return;
    persisted.save({
      progress: seen / Math.max(total, 1),
      lastState: seen >= total ? 'complete' : 'active',
    });
    if (seen >= total) {
      persisted.save({ progress: 1, completed: true, lastState: 'complete' });
    }
  }, [seen, forcedState, total]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'readingcomp',
      brief: 'Read the passage, then answer the questions.',
      brief_pl: 'Przeczytaj tekst, potem odpowiedz na pytania.',
      detail: 'A parchment passage sits on the desk. Read it through, then work the questions on the right. Every answer is supported by the text — re-read as often as you need. Use Hide passage to test yourself from memory, Show passage to peek again.',
      detail_pl: 'Na biurku leży pergamin z tekstem. Przeczytaj go, potem odpowiadaj na pytania po prawej. Każda odpowiedź jest poparta tekstem — wracaj do niego ile razy chcesz. Użyj „Hide passage", aby sprawdzić się z pamięci, „Show passage", aby zerknąć ponownie.',
      fullInstructions: READINGCOMP_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  // Forced-state handling for design-canvas previews.
  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') {
      setIdx(0); setPicked(null); setRevealed(false); setSeen(0); setSolved(0);
    }
    if (forcedState === 'active') {
      setIdx(1); setPicked(null); setRevealed(false); setSeen(1); setSolved(1);
    }
    if (forcedState === 'correct') {
      setIdx(1); setPicked(activePuzzle.questions[1].answerIndex); setRevealed(true);
      setSeen(2); setSolved(2);
    }
    if (forcedState === 'wrong') {
      const wrongIdx = (activePuzzle.questions[1].answerIndex + 1) % activePuzzle.questions[1].options.length;
      setIdx(1); setPicked(wrongIdx); setRevealed(true);
      setSeen(2); setSolved(1);
    }
    if (forcedState === 'complete') {
      setIdx(total - 1); setPicked(activePuzzle.questions[total - 1].answerIndex);
      setRevealed(true); setSeen(total); setSolved(total);
    }
  }, [forcedState, activePuzzle, total]);

  const choose = (optIdx: number) => {
    if (forcedState || revealed) return;
    setPicked(optIdx);
    setRevealed(true);
    const correct = optIdx === cur.answerIndex;
    arcade.decide(correct, cur.id, evidenceMarked ? 150 : 100);
    setAnnouncement(
      correct
        ? 'Correct. The passage backs you up.'
        : `Not quite. The right word is "${cur.options[cur.answerIndex]}".`,
    );
    if (!questionFinalised) {
      setSeen((s) => Math.min(s + 1, total));
      if (correct) setSolved((s) => Math.min(s + 1, total));
      setQuestionFinalised(true);
    }
    if (!correct && onWrongAnswer && !forcedState) {
      onWrongAnswer({
        questionId: cur.id,
        studentAnswer: cur.options[optIdx],
        correctAnswer: cur.options[cur.answerIndex],
        explanationPL: cur.hint_pl,
        exerciseId: cur.exerciseId,
      });
    }
    // D3 Wave-5: log per-question pick + accumulate wrong attempts.
    setStudentPicks((p) => ({ ...p, [cur.id]: cur.options[optIdx] }));
    if (!correct && !forcedState) {
      setAllWrongAttempts((prev) => [...prev, {
        questionId: cur.id,
        studentAnswer: cur.options[optIdx],
        correctAnswer: cur.options[cur.answerIndex],
        explanationPL: cur.hint_pl,
        exerciseId: cur.exerciseId,
      }]);
    }
  };

  // D3 Wave-5: fire onSessionComplete once the passage is fully worked through.
  useEffect(() => {
    if (forcedState) return;
    if (completedFired) return;
    if (!onSessionComplete) return;
    if (!completed) return;
    setCompletedFired(true);
    onSessionComplete({
      correctCount: solved,
      totalQuestions: total,
      wrongAttempts: allWrongAttempts,
      puzzle: activePuzzle,
      studentPicks,
    });
  }, [completed, completedFired, onSessionComplete, solved, total, allWrongAttempts, activePuzzle, studentPicks, forcedState]);

  const next = () => {
    if (forcedState) return;
    if (idx < total - 1) {
      setIdx((i) => i + 1);
      setPicked(null);
      setRevealed(false);
      setHintShown(false);
      setQuestionFinalised(false);
    }
  };

  const skip = () => {
    if (forcedState) return;
    if (!questionFinalised) {
      setSeen((s) => Math.min(s + 1, total));
      setQuestionFinalised(true);
    }
    if (idx < total - 1) {
      setIdx((i) => i + 1);
      setPicked(null);
      setRevealed(false);
      setHintShown(false);
      setQuestionFinalised(false);
    } else {
      // last question — bump completion via the seen-counter effect.
      setSeen(total);
    }
  };

  const reset = () => {
    setStudentPicks({}); setAllWrongAttempts([]); setCompletedFired(false); setEvidenceMarked(false);
    arcade.reset();
    setIdx(0); setPicked(null); setRevealed(false); setSeen(0); setSolved(0);
    setHintsUsed(0); setHintShown(false); setQuestionFinalised(false);
  };

  const useHint = () => {
    if (forcedState || hintsUsed >= 3 || hintShown) return;
    setHintShown(true);
    setHintsUsed((h) => h + 1);
  };

  // Background gradient by time of day.
  const grad =
    time === 'day'
      ? 'linear-gradient(180deg, #B49AE0 0%, #6E4FB7 100%)'
      : time === 'night'
      ? 'linear-gradient(180deg, #04020F 0%, #100829 60%, #1F1240 100%)'
      : 'linear-gradient(180deg, #1F1240 0%, #3F1E66 60%, #2A1450 100%)';

  // Drop-cap for the first letter of the passage (decorative serif).
  const passageBody = activePuzzle.passage;
  const firstChar = passageBody.charAt(0);
  const restOfPassage = passageBody.slice(1);

  return (
    <div
      className="em-shell em-shell-readingcomp challenge-enhanced"
      role="application"
      aria-label="Reading comprehension, The Reading Room"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {/* live region */}
      <div
        role="status"
        aria-live="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
      >
        {announcement}
      </div>

      {/* Inline keyframes — scoped via a unique class so they don't collide
          with global.css (which doesn't define em-page-rise / em-lamp-glow). */}
      <style>{`
        @keyframes em-rc-page-rise {
          from { opacity: 0; transform: translateY(14px) rotate(-1deg); }
          to   { opacity: 1; transform: translateY(0)   rotate(-1deg); }
        }
        @keyframes em-rc-lamp-pulse {
          0%, 100% { opacity: 0.62; filter: blur(18px); }
          50%      { opacity: 0.92; filter: blur(22px); }
        }
        @keyframes em-rc-quill {
          0%   { transform: translateY(0)   rotate(-12deg); }
          50%  { transform: translateY(-3px) rotate(-9deg); }
          100% { transform: translateY(0)   rotate(-12deg); }
        }
        @keyframes em-rc-correct {
          0%   { transform: scale(1);    box-shadow: 0 0 0 ${ACCENT_GLOW}; }
          50%  { transform: scale(1.04); box-shadow: 0 0 32px ${ACCENT_GLOW}; }
          100% { transform: scale(1);    box-shadow: 0 0 12px ${ACCENT_GLOW}; }
        }
      `}</style>

      {/* Background — dusk library.
          Ricky 2026-05-02 (#15 audit pass): explicit zIndex:0 + pointerEvents:none
          so the gradient never captures taps from the top bar / question column. */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: grad }} />

      {/* Soft brass-lamp hotspot upper-right */}
      <div
        style={{
          position: 'absolute',
          top: '-8%',
          right: '6%',
          width: 320,
          height: 320,
          background: `radial-gradient(circle, ${ACCENT}55 0%, transparent 60%)`,
          animation: 'em-rc-lamp-pulse 6s var(--em-ease) infinite',
          pointerEvents: 'none',
        }}
      />
      {/* Bookshelf silhouette behind */}
      <svg
        viewBox="0 0 1200 800"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, opacity: 0.22, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {Array.from({ length: 14 }).map((_, i) => (
          <g key={i} transform={`translate(${30 + i * 84}, 60)`}>
            <rect width={70} height={680} fill="#0E0A1A" opacity="0.55" />
            {/* book spines */}
            {Array.from({ length: 18 }).map((__, j) => (
              <rect
                key={j}
                x={6}
                y={20 + j * 36}
                width={58}
                height={28}
                fill={['#34D39955', '#A78BFA55', '#FBBF2455', '#7DD3FC55', '#FB718555'][((i * 7) + j) % 5]}
              />
            ))}
          </g>
        ))}
      </svg>
      {/* paper grain */}
      <div
        className="em-grain"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      />

      {/* Top bar */}
      <div className="challenge-enhanced-toolbar"
        style={{
          position: 'relative',
          padding: '20px 28px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          zIndex: 4,
        }}
      >
        <AmbientAudioPlayer shellSlug="readingcomp" />
        <Nameplate
          district="The Reading Room"
          subtitle={`Reading · Czytanie ze zrozumieniem · ${activePuzzle.title}`}
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path
                d="M3 5 L11 7 L19 5 L19 17 L11 19 L3 17 Z"
                stroke={ACCENT}
                strokeWidth="1.5"
                strokeLinejoin="round"
                fill="none"
              />
              <path d="M11 7 L11 19" stroke={ACCENT} strokeWidth="1.2" />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress current={solved} total={total} seen={seen} accent={ACCENT} />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      {/* Main grid: passage on the left, MCQ on the right */}
      <div
        className="em-shell-rc-layout"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
          gap: 24,
          padding: '8px 28px 24px',
          height: 'calc(100% - 92px)',
          boxSizing: 'border-box',
          zIndex: 3,
        }}
      >
        <ChallengeMission title="Collect the evidence. Solve the case." detail="Mark a supporting sentence before a correct answer for 150 base points. · Znajdź dowód w tekście." current={solved} total={total} />
        {/* PASSAGE — parchment under spotlight */}
        <div
          className="em-card em-rc-page"
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            background:
              'linear-gradient(180deg, #F5EBD8 0%, #ECE0C2 100%)',
            color: '#3F2510',
            border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: 6,
            padding: '24px 28px',
            boxShadow:
              '0 24px 40px rgba(0,0,0,0.55), inset 0 0 60px rgba(0,0,0,0.06)',
            transform: 'rotate(-1deg)',
            animation: 'em-rc-page-rise 620ms var(--em-ease) both',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {/* Dog-eared corner */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 36,
              height: 36,
              background: 'linear-gradient(225deg, transparent 49%, #D4C190 50%, #B89E66 100%)',
              boxShadow: '-2px 2px 4px rgba(0,0,0,0.2)',
            }}
          />
          {/* Title */}
          <div
            style={{
              fontFamily: 'var(--em-decor)',
              fontSize: 22,
              color: '#3F2510',
              marginBottom: 4,
            }}
          >
            {activePuzzle.title}
          </div>
          <div
            className="em-eyebrow"
            style={{ color: '#876543', marginBottom: 14 }}
          >
            {activePuzzle.title_pl} · czytanka
          </div>

          <EvidenceScanner key={cur.id} passage={activePuzzle.passage} onMark={() => setEvidenceMarked(true)} />
          {/* Passage toggle + Polish toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowPassage((s) => !s)}
              aria-pressed={showPassage}
              aria-label={showPassage ? 'Hide passage' : 'Show passage'}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: `1px solid ${ACCENT}88`,
                color: '#3F2510',
                borderRadius: 999,
                fontFamily: 'var(--em-mono)',
                fontSize: 11,
                letterSpacing: '0.12em',
                cursor: 'pointer',
                minHeight: 36,
              }}
            >
              {showPassage ? '▾ Hide passage · Ukryj' : '▸ Show passage · Pokaż'}
            </button>
            {activePuzzle.passage_pl && (
              <button
                type="button"
                onClick={() => setShowPolish((s) => !s)}
                aria-pressed={showPolish}
                aria-label={showPolish ? 'Hide Polish translation' : 'Show Polish translation'}
                style={{
                  padding: '8px 14px',
                  background: showPolish ? `${ACCENT}22` : 'transparent',
                  border: `1px solid ${ACCENT}88`,
                  color: '#3F2510',
                  borderRadius: 999,
                  fontFamily: 'var(--em-mono)',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  cursor: 'pointer',
                  minHeight: 36,
                }}
              >
                🇵🇱 {showPolish ? 'Hide PL' : 'Show PL'}
              </button>
            )}
          </div>

          {showPassage && (
            <div
              className="em-scroll"
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 16,
                lineHeight: 1.7,
                color: '#3F2510',
                overflowY: 'auto',
                paddingRight: 6,
                flex: 1,
                minHeight: 0,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--em-decor)',
                  fontSize: 56,
                  lineHeight: 0.9,
                  float: 'left',
                  paddingRight: 8,
                  color: ACCENT,
                  textShadow: `0 0 12px ${ACCENT}66`,
                }}
              >
                {firstChar}
              </span>
              {restOfPassage}
              {showPolish && activePuzzle.passage_pl && (
                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 14,
                    borderTop: '1px dashed #87654366',
                    fontFamily: 'Georgia, serif',
                    fontSize: 14,
                    fontStyle: 'italic',
                    color: '#876543',
                  }}
                >
                  🇵🇱 {activePuzzle.passage_pl}
                </div>
              )}
            </div>
          )}
          {!showPassage && (
            <div
              role="status"
              style={{
                fontFamily: 'var(--em-mono)',
                fontSize: 11,
                color: '#876543',
                fontStyle: 'italic',
                padding: '24px 0',
                textAlign: 'center',
              }}
            >
              Passage hidden. Tap "Show passage" to read.
            </div>
          )}

          {/* Quill in the corner */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              bottom: 8,
              right: 12,
              fontSize: 28,
              transformOrigin: 'bottom right',
              animation: 'em-rc-quill 3.2s var(--em-ease) infinite',
            }}
          >
            🪶
          </div>
        </div>

        {/* QUESTION COLUMN */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <div
            className="em-card"
            style={{
              padding: 20,
              background: 'linear-gradient(180deg, #14082A 0%, #08041A 100%)',
              border: `1px solid ${ACCENT}55`,
              borderRadius: 14,
              animation: 'em-rise 540ms var(--em-ease) both',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div className="em-eyebrow" style={{ color: ACCENT }}>
              Question {idx + 1} of {total} · Pytanie
            </div>
            <div
              style={{
                fontFamily: 'var(--em-decor)',
                fontSize: 22,
                lineHeight: 1.3,
                color: 'var(--em-text)',
              }}
              role="heading"
              aria-level={2}
            >
              {cur.prompt}
            </div>

            <Challenge3D game="ReadingComp" evidence={activePuzzle.passage.split(/(?<=[.!?])\s+/).filter(Boolean)} onEvidence={() => setEvidenceMarked(true)} items={cur.options.map((label,i)=>({id:String(i),label,state:revealed && i===cur.answerIndex?'right':revealed && i===picked?'wrong':'idle'}))} roundKey={cur.id} locked={revealed || completed || !!forcedState} onPick={id=>choose(Number(id))} />
            <div className="cm-legacy-answers" role="radiogroup" aria-label={cur.prompt} style={{ display: 'grid', gap: 8 }}>
              {cur.options.map((opt, oi) => {
                const isPicked = picked === oi;
                const isCorrect = oi === cur.answerIndex;
                const showCorrect = revealed && isCorrect;
                const showWrong = revealed && isPicked && !isCorrect;
                return (
                  <button
                    key={oi}
                    type="button"
                    role="radio"
                    aria-checked={isPicked}
                    onClick={() => choose(oi)}
                    disabled={revealed}
                    aria-label={`Option ${oi + 1}: ${opt}${
                      revealed
                        ? isCorrect
                          ? ', correct answer'
                          : isPicked
                          ? ', your answer (incorrect)'
                          : ''
                        : ''
                    }`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 16px',
                      borderRadius: 10,
                      background: showCorrect
                        ? `${ACCENT}22`
                        : showWrong
                        ? 'rgba(251,113,133,0.18)'
                        : isPicked
                        ? `${ACCENT}11`
                        : 'rgba(255,255,255,0.04)',
                      border: showCorrect
                        ? `2px solid ${ACCENT}`
                        : showWrong
                        ? '2px solid #FB7185'
                        : isPicked
                        ? `1px solid ${ACCENT}88`
                        : '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--em-text)',
                      fontFamily: 'var(--em-display)',
                      fontSize: 15,
                      cursor: revealed ? 'default' : 'pointer',
                      transition: 'all 220ms var(--em-ease)',
                      animation: showCorrect
                        ? 'em-rc-correct 0.6s var(--em-ease) both'
                        : showWrong
                        ? 'em-shake 0.4s'
                        : 'none',
                      textAlign: 'left',
                      minHeight: 48,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        border: `1.5px solid ${showCorrect ? ACCENT : showWrong ? '#FB7185' : 'rgba(255,255,255,0.25)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--em-mono)',
                        fontSize: 11,
                        color: showCorrect ? ACCENT : showWrong ? '#FB7185' : 'rgba(255,255,255,0.6)',
                      }}
                    >
                      {String.fromCharCode(65 + oi)}
                    </span>
                    <span style={{ flex: 1 }}>{opt}</span>
                    {showCorrect && (
                      <span aria-hidden="true" style={{ color: ACCENT, fontSize: 18 }}>
                        ✓
                      </span>
                    )}
                    {showWrong && (
                      <span aria-hidden="true" style={{ color: '#FB7185', fontSize: 18 }}>
                        ✕
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {hintShown && !revealed && (
              <div
                role="status"
                style={{
                  marginTop: 4,
                  padding: '10px 12px',
                  background: `${ACCENT}14`,
                  border: `1px dashed ${ACCENT}aa`,
                  borderRadius: 8,
                  fontFamily: 'var(--em-mono)',
                  fontSize: 11,
                  color: 'var(--em-text)',
                  letterSpacing: '0.04em',
                  animation: 'em-tip-fade 220ms var(--em-ease) both',
                }}
              >
                <span className="em-eyebrow" style={{ color: ACCENT, marginRight: 8 }}>
                  HINT
                </span>
                {cur.hint}
                <div style={{ marginTop: 4, color: 'var(--em-text-muted)' }}>🇵🇱 {cur.hint_pl}</div>
              </div>
            )}

            {revealed && idx < total - 1 && (
              <button
                type="button"
                className="em-btn em-btn-primary"
                onClick={next}
                style={{
                  alignSelf: 'flex-end',
                  marginTop: 4,
                }}
                aria-label="Next question"
              >
                Next question →
              </button>
            )}
          </div>

        </div>
      </div>

      {completed && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Reading Room complete"
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            animation: 'em-rise 0.4s var(--em-ease)',
            zIndex: 12,
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>
            The page is yours.
          </div>
          <div className="em-eyebrow">CHAPTER CLOSED · ROZDZIAŁ ZAMKNIĘTY</div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'baseline', marginTop: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div className="em-decor" style={{ fontSize: 38, color: ACCENT }}>{solved}</div>
              <div className="em-eyebrow" style={{ color: ACCENT }}>RIGHT · TRAFNE</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="em-decor" style={{ fontSize: 38, color: '#FB7185' }}>{seen - solved}</div>
              <div className="em-eyebrow" style={{ color: '#FB7185' }}>MISSED · BŁĘDY</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="em-btn em-btn-ghost" onClick={reset} aria-label="Try another passage">
              Try another
            </button>
          </div>
        </div>
      )}
      <Confetti show={completed} />
    </div>
  );
};

export default ReadingCompShell;
