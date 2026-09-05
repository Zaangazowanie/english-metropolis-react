import { Challenge3D } from './challenge-3d';
import { sentenceIsCorrect } from './challenge-arcade-logic';
import { ChallengeMission, useChallengeArcade } from './challenge-arcade';
// Unjumble shell — "The Puzzle Workshop" district.
// A typesetter's workshop at dusk: wood-block letter blocks scattered on a
// workbench, brass lining gauge across the top of the composing tray, ink
// pots on the shelf. Each sentence's words appear as movable wood-block
// tiles in a tray below; the student drags them up onto the brass lining
// gauge in the correct sentence order. Snap-to-position with a satisfying
// thud animation; misplaced blocks shake.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';

import React, { useState, useEffect } from 'react';
import { Bajla, Progress, Nameplate, SkipButton, HintButton, Confetti, useEndOfShellTip } from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';

// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components';

// Puzzle Workshop · Unjumble — full bilingual instruction copy.
const UNJUMBLE_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A row of wooden type-blocks sits in a tray at the bottom — each block has one word in random order.',
      'Above the tray is a brass lining gauge with empty slots — one slot per block.',
      'Drag the blocks onto the gauge, left to right, to form a grammatically correct English sentence.',
      'When the order matches, the gauge locks and Bajla cheers; if not, the gauge stays open for retries.',
    ],
    pl: [
      'Na tacy na dole leży rząd drewnianych klocków — na każdym jedno słowo w losowej kolejności.',
      'Nad tacą znajduje się mosiężna listwa z pustymi miejscami — po jednym na klocek.',
      'Przeciągnij klocki na listwę, od lewej do prawej, aby ułożyć poprawne gramatycznie zdanie po angielsku.',
      'Gdy kolejność się zgadza, listwa się blokuje i Bajla bije brawo; jeśli nie — listwa pozostaje otwarta do kolejnych prób.',
    ],
  },
  controls: {
    en: [
      'Block tray: shuffled wood blocks at the bottom — drag any block at any time.',
      'Brass lining gauge: ordered slots — left = first word, right = last word.',
      'Hint banner (top): a partial gloss of the meaning, in EN/PL.',
      'Q counter: header tally of solved sentences.',
      'Skip + Hint buttons: Skip jumps to next sentence, Hint locks the first incorrect block into its right place.',
    ],
    pl: [
      'Taca klocków: przemieszane drewniane klocki na dole — przeciągnij dowolny w dowolnym momencie.',
      'Mosiężna listwa: uporządkowane miejsca — lewo = pierwsze słowo, prawo = ostatnie.',
      'Pasek podpowiedzi (góra): częściowa parafraza znaczenia, EN/PL.',
      'Licznik Q: ranga rozwiązanych zdań w nagłówku.',
      'Przyciski Pomiń i Podpowiedź: Pomiń przeskakuje zdanie, Podpowiedź wskakuje pierwszy błędny klocek na właściwe miejsce.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right order: ✓ gauge locks, sentence flashes green, +1 to your tally, "Next sentence" button appears.',
      'Wrong order: ✗ gauge stays open, blocks in the right place glow green and out-of-place blocks flash rose — re-drag.',
      'Skip: counts as wrong — moves to the next sentence.',
      'You can drag a placed block back to the tray or to a different slot before committing.',
    ],
    pl: [
      'Trafna kolejność: ✓ listwa się blokuje, zdanie mignie na zielono, +1 do wyniku, pojawia się przycisk „Next sentence".',
      'Błędna kolejność: ✗ listwa pozostaje otwarta, klocki na właściwych miejscach świecą na zielono, a źle ustawione mignią na różowo — przeciągnij ponownie.',
      'Pomiń: liczy się jako błąd — przejście do następnego zdania.',
      'Przed zatwierdzeniem możesz przeciągnąć klocek z powrotem na tacę lub na inne miejsce.',
    ],
  },
  hintMechanic: {
    en:
      'You have 2 hints per session. Each tap locks the leftmost incorrect block into its correct slot. Save them for sentences with tricky tense agreement (e.g. "had been waiting") or unusual word order.',
    pl:
      'Masz 2 podpowiedzi na sesję. Każde stuknięcie wskakuje najbardziej lewy błędny klocek na właściwe miejsce. Zachowaj je na zdania z trudnym następstwem czasów (np. „had been waiting") lub nietypową kolejnością słów.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each correctly-arranged sentence adds to your session streak. Solving every sentence in the deck unlocks the post-shell review with explanations of any wrong arrangements.',
    pl:
      'Pomiń liczy się jako błąd. Każde poprawnie ułożone zdanie buduje serię w sesji. Rozwiązanie wszystkich zdań w talii odblokowuje przegląd z wyjaśnieniami błędów.',
  },
  l1Pattern: {
    en:
      'Word order + tense agreement. Polish word order is freer than English (subject-object-verb permutations are common); this drill builds the strict English SVO baseline plus auxiliary-verb sequencing (have + past participle, had been + -ing).',
    pl:
      'Kolejność słów + następstwo czasów. Polski szyk wyrazów jest swobodniejszy niż angielski (podmiot-dopełnienie-orzeczenie w różnej kolejności); ten poziom utrwala ścisły angielski szyk SVO oraz układanie czasowników posiłkowych (have + imiesłów, had been + -ing).',
  },
};

export type UnjumbleForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

interface UJSentence {
  id: string;
  /** The words in the order the player sees them (shuffled). */
  words: string[];
  /** correct_order[k] = index into `words` for the kth slot in the answer. */
  correct_order: number[];
  hint: string;
  hint_pl: string;
  translation_pl?: string;
  exerciseId?: string;
}

export interface UnjumblePuzzle {
  items: UJSentence[];
}

export interface UnjumbleShellProps {
  time?: TimeOfDay;
  state?: UnjumbleForcedState;
  puzzle?: UnjumblePuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3 Wave-5 (Ricky 2026-05-02): per-sentence review payload. Fires once
   * the student has worked through every sentence in the puzzle.
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
    puzzle: UnjumblePuzzle;
    /** Per-sentence final word arrangement: id → indices in `words[]`. */
    studentArrangements: Record<string, (number | null)[]>;
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// renderUnjumbleReviewItem — per-sentence locked render for PracticeReview.
// Puzzle Workshop scoreboard: criterion + per-position chip showing student's
// arrangement vs the canonical sentence.
// ─────────────────────────────────────────────────────────────────────────
const UJ_REVIEW_ACCENT = '#E879F9';
export function renderUnjumbleReviewItem(
  sentence: UJSentence,
  number: number,
  studentArrangement: (number | null)[],
): React.ReactNode {
  const correctSentence = sentence.correct_order.map((wi) => sentence.words[wi]).join(' ');
  const studentSentence = studentArrangement.map((wi) => (wi !== null ? sentence.words[wi] : '___')).join(' ');
  const allCorrect = sentenceIsCorrect(sentence.words, sentence.correct_order, studentArrangement);
  const isWrong = !allCorrect;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: isWrong
        ? 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(232,121,249,0.10), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(232,121,249,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${UJ_REVIEW_ACCENT}22`, color: UJ_REVIEW_ACCENT,
          border: `1px solid ${UJ_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          SENTENCE {String(number).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(232,121,249,0.22)',
          color: isWrong ? '#FB7185' : UJ_REVIEW_ACCENT,
        }}>
          {isWrong ? '✗ JUMBLED · POMIESZANE' : '✓ ASSEMBLED · POPRAWNIE'}
        </span>
      </div>
      {/* Per-position chip row. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {studentArrangement.map((wi, slotIdx) => {
          const word = wi !== null ? sentence.words[wi] : '___';
          const isPosCorrect = wi !== null && sentence.words[wi] === sentence.words[sentence.correct_order[slotIdx]];
          return (
            <span key={slotIdx} style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 13,
              background: isPosCorrect ? 'rgba(232,121,249,0.18)' : 'rgba(251,113,133,0.18)',
              border: `1px solid ${isPosCorrect ? '#E879F988' : '#FB718588'}`,
              color: isPosCorrect ? UJ_REVIEW_ACCENT : '#FB7185',
              fontFamily: 'var(--em-decor)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ fontFamily: 'var(--em-mono)', fontSize: 9, opacity: 0.7 }}>{slotIdx + 1}</span>
              <span>{word}</span>
              <span style={{ fontFamily: 'var(--em-mono)', fontSize: 9 }}>{isPosCorrect ? '✓' : '✗'}</span>
            </span>
          );
        })}
      </div>
      {isWrong && (
        <div style={{ color: '#FB7185', fontFamily: 'var(--em-decor)', fontSize: 14 }}>
          ✗ NIE · You assembled: <strong>{studentSentence}</strong>
        </div>
      )}
      <div style={{ color: UJ_REVIEW_ACCENT, fontFamily: 'var(--em-decor)', fontSize: 14 }}>
        ✓ TAK · The sentence: <strong>{correctSentence}</strong>
      </div>
      {sentence.translation_pl && (
        <div style={{ fontFamily: 'var(--em-body)', fontSize: 12, color: 'var(--em-text-muted)', fontStyle: 'italic' }}>
          🇵🇱 {sentence.translation_pl}
        </div>
      )}
    </div>
  );
}

export type { UJSentence as ShellUnjumbleSentence };

const UJ_PUZZLE: UnjumblePuzzle = {
  items: [
    {
      id: 'uj-demo-1',
      words: ['the', 'window.', 'Open'],
      correct_order: [2, 0, 1], // "Open" "the" "window."
      hint: 'Imperative verb first.',
      hint_pl: 'Najpierw czasownik.',
      translation_pl: 'Otwórz okno.',
    },
    {
      id: 'uj-demo-2',
      words: ['please.', 'A', 'coffee,'],
      correct_order: [1, 2, 0],
      hint: '"A" goes first.',
      hint_pl: 'Zacznij od rodzajnika.',
      translation_pl: 'Poproszę kawę.',
    },
    {
      id: 'uj-demo-3',
      words: ['street.', 'on', 'this', 'I', 'live'],
      correct_order: [3, 4, 1, 2, 0],
      hint: 'Subject + verb + place.',
      hint_pl: 'Podmiot + orzeczenie + miejsce.',
      translation_pl: 'Mieszkam na tej ulicy.',
    },
    {
      id: 'uj-demo-4',
      words: ['you.', 'morning', 'Good', 'to'],
      correct_order: [2, 1, 3, 0],
      hint: 'A greeting.',
      hint_pl: 'Pozdrowienie.',
      translation_pl: 'Dzień dobry tobie.',
    },
  ],
};

const ACCENT = '#E879F9';

export const UnjumbleShell: React.FC<UnjumbleShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const arcade = useChallengeArcade();
  const activePuzzle = puzzle && puzzle.items.length > 0 ? puzzle : UJ_PUZZLE;
  const persisted = useShellProgress('unjumble');
  // D3 Wave-5 (Ricky 2026-05-02): per-sentence final arrangement log.
  const [studentArrangements, setStudentArrangements] = useState<Record<string, (number | null)[]>>({});

  const [idx, setIdx] = useState(0);
  // gauge[k] = original word-index placed in slot k, or null.
  const [gauge, setGauge] = useState<(number | null)[]>([]);

  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [seen, setSeen] = useState(0);
  const [solved, setSolved] = useState(0);
  const [questionFinalised, setQuestionFinalised] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const total = activePuzzle.items.length;
  const cur = activePuzzle.items[idx];
  const completed = (solved >= total || (seen >= total && !forcedState));
  useEffect(() => { if (completed && !forcedState) arcade.finish(); }, [completed, forcedState]);
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount: solved,
        totalQuestions: total,
        wrongAttempts,
        puzzle: activePuzzle,
        studentArrangements,
      });
    } : undefined,
  });

  // Reset gauge whenever the current sentence changes.
  useEffect(() => {
    setGauge(Array(cur?.words.length ?? 0).fill(null));
    setFeedback(null);
    setShowTranslation(false);
    setHintShown(false);

  }, [idx, cur?.words.length]);

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
      shellKey: 'unjumble',
      brief: "Build a sentence by moving each word onto the rail.",
      brief_pl: "Zbuduj zdanie, przenosząc słowa na listwę.",
      detail: "Build a sentence by moving each word onto the rail. Choose Launch sentence when every slot is filled. A wrong launch shows which positions to reconsider. Adjust the words and launch again.",
      detail_pl: "Zbuduj zdanie, przenosząc słowa na listwę. Gdy wszystkie miejsca są pełne, wybierz Wyślij zdanie. Po błędzie zobaczysz pozycje wymagające zmiany. Popraw kolejność i wyślij ponownie.",
      fullInstructions: { ...UNJUMBLE_INSTRUCTIONS, whatYouDo: {"en": ["Build a sentence by moving each word onto the rail.", "Choose Launch sentence when every slot is filled.", "A wrong launch shows which positions to reconsider. Adjust the words and launch again."], "pl": ["Zbuduj zdanie, przenosząc słowa na listwę.", "Gdy wszystkie miejsca są pełne, wybierz Wyślij zdanie.", "Po błędzie zobaczysz pozycje wymagające zmiany. Popraw kolejność i wyślij ponownie."]}, controls: {"en": ["Build a sentence by moving each word onto the rail.", "Choose Launch sentence when every slot is filled.", "A wrong launch shows which positions to reconsider. Adjust the words and launch again."], "pl": ["Zbuduj zdanie, przenosząc słowa na listwę.", "Gdy wszystkie miejsca są pełne, wybierz Wyślij zdanie.", "Po błędzie zobaczysz pozycje wymagające zmiany. Popraw kolejność i wyślij ponownie."]}, rightWrongSkip: {"en": ["Correct choices earn arcade points. Mistakes stay available in your session review. Skip moves on without points."], "pl": ["Poprawne wybory dają punkty arcade. Błędy zobaczysz w przeglądzie sesji. Pominięcie przechodzi dalej bez punktów."]} },
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') {
      setIdx(0); setGauge(Array(activePuzzle.items[0].words.length).fill(null));
      setSeen(0); setSolved(0); setFeedback(null);
    }
    if (forcedState === 'active') {
      setIdx(0);
      const partial: (number | null)[] = Array(activePuzzle.items[0].words.length).fill(null);
      partial[0] = activePuzzle.items[0].correct_order[0];
      setGauge(partial);
      setSeen(0); setSolved(0);
    }
    if (forcedState === 'correct') {
      setIdx(1);
      const full = [...activePuzzle.items[1].correct_order];
      setGauge(full);
      setFeedback('correct');
      setSeen(1); setSolved(1);
    }
    if (forcedState === 'wrong') {
      setIdx(1);
      // Reverse correct order = wrong.
      const wrong = [...activePuzzle.items[1].correct_order].reverse();
      setGauge(wrong);
      setFeedback('wrong');
      setSeen(1); setSolved(0);
    }
    if (forcedState === 'complete') {
      setIdx(total - 1);
      setGauge([...activePuzzle.items[total - 1].correct_order]);
      setSeen(total); setSolved(total);
    }
  }, [forcedState, activePuzzle, total]);

  const placeWord = (slotIdx: number, wordIdx: number) => {
    if (forcedState || questionFinalised) return;
    setFeedback(null);
    setGauge((prev) => {
      const next = [...prev];
      // Remove wordIdx from any other slot.
      const oldSlot = next.indexOf(wordIdx);
      if (oldSlot >= 0 && oldSlot !== slotIdx) next[oldSlot] = null;
      // Swap if destination occupied.
      const displaced = next[slotIdx];
      if (displaced !== null && oldSlot >= 0) {
        next[oldSlot] = displaced;
      }
      next[slotIdx] = wordIdx;
      return next;
    });

    setAnnouncement(`Placed ${cur.words[wordIdx]} at position ${slotIdx + 1}.`);
  };

  const removeFromSlot = (slotIdx: number) => {
    if (forcedState || questionFinalised) return;
    setFeedback(null);
    setGauge((prev) => {
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });
  };

  // Submit a complete sentence intentionally; arranging tiles does not reveal answers.
  const launchSentence = () => {
    if (forcedState || questionFinalised) return;
    if (gauge.length === 0) return;
    if (gauge.some((s) => s === null)) {
      // Not full — reset feedback on subsequent moves.
      if (feedback) setFeedback(null);
      return;
    }
    const allCorrect = sentenceIsCorrect(cur.words, cur.correct_order, gauge);
    arcade.decide(allCorrect, cur.id);
    if (allCorrect) {
      setFeedback('correct');
      if (!questionFinalised) {
        setSeen((s) => Math.min(s + 1, total));
        setSolved((s) => Math.min(s + 1, total));
        setQuestionFinalised(true);
      }
      // D3 Wave-5: snapshot the final arrangement for the review screen.
      setStudentArrangements((p) => ({ ...p, [cur.id]: [...gauge] }));
      setAnnouncement('Correct sentence assembled.');
    } else {
      setFeedback('wrong');
      const given = gauge.map((wi) => (wi !== null ? cur.words[wi] : '___')).join(' ');
      const correct = cur.correct_order.map((wi) => cur.words[wi]).join(' ');
      tip.recordWrong({
        questionId: cur.id,
        studentAnswer: given,
        correctAnswer: correct,
        explanationPL: cur.hint_pl,
        exerciseId: cur.exerciseId,
      });
      // D3 Wave-5: snapshot the (wrong) final arrangement.
      setStudentArrangements((p) => ({ ...p, [cur.id]: [...gauge] }));
      setAnnouncement(`Not quite. Re-arrange the blocks.`);
    }
  };

  const next = () => {
    if (forcedState) return;
    if (idx < total - 1) {
      setIdx((i) => i + 1);
      setQuestionFinalised(false);
    }
  };

  const skip = () => {
    if (forcedState) return;
    if (!questionFinalised) {
      setSeen((s) => Math.min(s + 1, total));
      setQuestionFinalised(true);
    }
    // D3 Wave-5: snapshot the (incomplete) arrangement so the review row
    // can render the partial state with empty slots.
    setStudentArrangements((p) => ({ ...p, [cur.id]: [...gauge] }));
    if (idx < total - 1) {
      setIdx((i) => i + 1);
      setQuestionFinalised(false);
    } else {
      setSeen(total);
    }
  };

  const reset = () => {
    setStudentArrangements({});
    arcade.reset();
    setIdx(0); setGauge(Array(activePuzzle.items[0].words.length).fill(null));
    setSeen(0); setSolved(0); setFeedback(null); setHintsUsed(0);
    setHintShown(false); setQuestionFinalised(false);
    tip.reset();
  };

  const useHint = () => {
    if (forcedState || hintsUsed >= 3 || hintShown) return;
    setHintShown(true);
    setHintsUsed((h) => h + 1);
  };

  // Words still in the tray (not on the gauge).

  const grad =
    time === 'day'
      ? 'linear-gradient(180deg, #B49AE0 0%, #6E4FB7 100%)'
      : time === 'night'
      ? 'linear-gradient(180deg, #07041A 0%, #1F0E3A 100%)'
      : 'linear-gradient(180deg, #2A1455 0%, #4A1F6E 60%, #7A2F8A 100%)';

  return (
    <div
      className="em-shell em-shell-unjumble challenge-enhanced"
      role="application"
      aria-label="Unjumble, The Puzzle Workshop"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      {/* Ricky 2026-05-02 (#15 audit pass): zIndex:0 + pointerEvents:none on the
          background gradient — workshop content is zIndex:3, top bar zIndex:4. */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: grad }} />
      {/* shelf silhouette */}
      <svg viewBox="0 0 1200 800" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none' }} aria-hidden="true">
        <line x1="0" y1="120" x2="1200" y2="120" stroke="#FBBF24" strokeWidth="1" />
        <line x1="0" y1="124" x2="1200" y2="124" stroke="#876543" strokeWidth="6" />
        {/* ink pots */}
        {Array.from({ length: 6 }).map((_, i) => (
          <g key={i} transform={`translate(${80 + i * 180}, 80)`}>
            <ellipse cx="0" cy="40" rx="22" ry="6" fill="#0E0A1A" opacity="0.6" />
            <rect x="-18" y="0" width="36" height="40" rx="3" fill="#1A0F2E" stroke="#876543" strokeWidth="1.5" />
            <rect x="-12" y="-6" width="24" height="6" fill="#876543" />
          </g>
        ))}
      </svg>
      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true" />

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
        <AmbientAudioPlayer shellSlug="unjumble" />
        <Nameplate
          district="The Puzzle Workshop"
          subtitle="Unjumble · Ułóż zdanie · arrange the wood blocks"
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="3" y="3" width="6" height="6" stroke={ACCENT} strokeWidth="1.4" />
              <rect x="13" y="3" width="6" height="6" stroke={ACCENT} strokeWidth="1.4" />
              <rect x="3" y="13" width="6" height="6" stroke={ACCENT} strokeWidth="1.4" />
              <rect x="13" y="13" width="6" height="6" stroke={ACCENT} strokeWidth="1.4" />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress current={solved} total={total} seen={seen} accent={ACCENT} />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      <div
        className="challenge-unjumble-layout"
        style={{
          position: 'relative',
          padding: '8px 28px 24px',
          height: 'calc(100% - 92px)',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          zIndex: 3,
        }}
      >
        <ChallengeMission title="Assemble the message. Launch the signal." detail="Build your sentence on the rail, then launch it. Adjust any misplaced words and try again. · Ułóż i wyślij." current={gauge.filter(v => v !== null).length} total={cur.words.length}>
        </ChallengeMission>
        <Challenge3D game="Unjumble" roundKey={cur.id} prompt={cur.translation_pl || 'Build a complete English sentence.'}
          items={cur.words.map((label,i)=>({id:String(i),label,locked:gauge.includes(i)}))}
          slots={gauge.map((wi,i)=>({id:String(i),label:wi===null?`Position ${i+1}`:cur.words[wi],state:feedback==='correct'?'right':feedback==='wrong'?'wrong':'idle'}))}
          onPlace={(slot,id)=>placeWord(Number(slot),Number(id))} onRemove={slot=>removeFromSlot(Number(slot))}
          onAction={launchSentence} actionLabel="Launch sentence · Wyślij" actionDisabled={gauge.some(v=>v===null)}
          locked={questionFinalised || completed || !!forcedState} status={announcement} />

        {/* Sentence info */}
        <div
          className="em-card"
          style={{
            padding: 16,
            background: 'linear-gradient(180deg, #14082A 0%, #08041A 100%)',
            border: `1px solid ${ACCENT}55`,
            borderRadius: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            animation: 'em-rise 540ms var(--em-ease) both',
          }}
        >
          <div>
            <div className="em-eyebrow" style={{ color: ACCENT }}>
              Sentence {idx + 1} of {total} · zdanie
            </div>
            <div style={{ fontFamily: 'var(--em-decor)', fontSize: 18, color: 'var(--em-text)', marginTop: 2 }}>
              Drop the blocks in order on the lining gauge above.
            </div>
          </div>
          {cur.translation_pl && (
            <button
              type="button"
              onClick={() => setShowTranslation((s) => !s)}
              aria-pressed={showTranslation}
              aria-label={showTranslation ? 'Hide Polish translation' : 'Show Polish translation'}
              style={{
                padding: '8px 14px',
                background: showTranslation ? `${ACCENT}22` : 'transparent',
                color: 'var(--em-text)',
                border: `1px solid ${ACCENT}66`,
                borderRadius: 999,
                fontFamily: 'var(--em-mono)',
                fontSize: 11,
                letterSpacing: '0.12em',
                cursor: 'pointer',
                minHeight: 36,
              }}
            >
              🇵🇱 {showTranslation ? 'Hide PL' : 'Show PL'}
            </button>
          )}
        </div>

        {showTranslation && cur.translation_pl && (
          <div
            role="region"
            aria-label="Polish translation"
            style={{
              padding: '8px 12px',
              background: `${ACCENT}14`,
              border: `1px dashed ${ACCENT}66`,
              borderRadius: 8,
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
              fontSize: 13,
              color: 'var(--em-text)',
              animation: 'em-tip-fade 220ms var(--em-ease) both',
            }}
          >
            🇵🇱 {cur.translation_pl}
          </div>
        )}

        {/* The lining gauge — drop targets */}

        {/* The tray of wood blocks */}

        {hintShown && (
          <div
            role="status"
            style={{
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
            <span className="em-eyebrow" style={{ color: ACCENT, marginRight: 8 }}>HINT</span>
            {cur.hint}
            <div style={{ marginTop: 4, color: 'var(--em-text-muted)' }}>🇵🇱 {cur.hint_pl}</div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520 }}>
          </div>
          {feedback === 'correct' && idx < total - 1 && (
            <button
              type="button"
              className="em-btn em-btn-primary"
              onClick={next}
              aria-label="Next sentence"
            >
              Next sentence →
            </button>
          )}
        </div>
      </div>

      {completed && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Puzzle Workshop complete"
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 14, animation: 'em-rise 0.4s var(--em-ease)', zIndex: 12,
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>
            The press is set.
          </div>
          <div className="em-eyebrow">WORKSHOP CLOSED · WARSZTAT ZAMKNIĘTY</div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'baseline', marginTop: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div className="em-decor" style={{ fontSize: 38, color: ACCENT }}>{solved}</div>
              <div className="em-eyebrow" style={{ color: ACCENT }}>SET · UŁOŻONE</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="em-decor" style={{ fontSize: 38, color: '#FB7185' }}>{seen - solved}</div>
              <div className="em-eyebrow" style={{ color: '#FB7185' }}>MISSED · BŁĘDY</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="em-btn em-btn-ghost" onClick={reset} aria-label="Compose another">
              Try another
            </button>
          </div>
        </div>
      )}
      <Confetti show={completed} />
    </div>
  );
};

export default UnjumbleShell;
