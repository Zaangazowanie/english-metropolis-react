// Multiple Choice — The Bulletin Board district.
// A cork-board plastered with announcement posters at dusk. The current
// question is pinned to the centre on a fresh poster; four answer cards
// hang on push-pins below. Picking the right poster lights it like a
// neon sign on the kiosk wall behind. Picking wrong shakes the board and
// rips a paper-tear on the wrong card.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import '../styles/shells/multiplechoice.css';
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
import type { FullInstructions } from '../components/ExpandableInstructions';

// Bulletin Board · Multiple Choice — full bilingual instruction copy.
const MULTIPLECHOICE_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A question appears as a poster pinned to the cork-board.',
      'Four answer chips hang on push-pins below the question.',
      'Tap one chip to commit your answer — pick carefully, you only get one shot per question.',
      'A right pick lights the poster green; a wrong pick rips the chip rose and reveals the correct one.',
    ],
    pl: [
      'Pytanie pojawia się jako plakat przypięty do tablicy korkowej.',
      'Cztery karty odpowiedzi wiszą na pinezkach pod pytaniem.',
      'Stuknij jedną kartę, aby zatwierdzić odpowiedź — wybieraj uważnie, masz jedną próbę na pytanie.',
      'Trafienie podświetla plakat na zielono; błąd rozdziera kartę na różowo i pokazuje poprawną.',
    ],
  },
  controls: {
    en: [
      'Question card: the poster pinned at the top of the board.',
      'Four option chips: A / B / C / D, hung on push-pins below.',
      'Skip button: jumps to the next poster (counts as wrong).',
      'Hint button: 3 hints per session — each eliminates one wrong option.',
      'Counter (top-right): Q current/total — your position in the deck.',
    ],
    pl: [
      'Karta pytania: plakat przypięty u góry tablicy.',
      'Cztery karty odpowiedzi: A / B / C / D, na pinezkach poniżej.',
      'Przycisk Pomiń: przeskakuje do następnego plakatu (liczy się jako błąd).',
      'Przycisk Podpowiedź: 3 podpowiedzi na sesję — każda usuwa jedną błędną opcję.',
      'Licznik (w prawym górnym rogu): Q bieżące/razem — Twoja pozycja w talii.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right pick: ✓ green pin animates, +1 to your tally.',
      'Wrong pick: ✗ rose pin animates, the correct option highlights green, "Why this happens" auto-opens (if enabled).',
      'Skip: counts as wrong — use sparingly.',
      'Once committed, you cannot change your answer for that question — the next poster is queued automatically.',
    ],
    pl: [
      'Trafienie: ✓ zielona pinezka animuje się, +1 do wyniku.',
      'Błąd: ✗ różowa pinezka animuje się, poprawna opcja podświetla się na zielono, „Dlaczego tak jest" otwiera się automatycznie (jeśli włączone).',
      'Pomiń: liczy się jako błąd — używaj oszczędnie.',
      'Po zatwierdzeniu nie możesz zmienić odpowiedzi — następny plakat ładuje się automatycznie.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Each tap of the hint button eliminates one wrong option (greys it out). Save them for the trickiest questions — verb-form choices and false-friend pairs.',
    pl:
      'Masz 3 podpowiedzi na sesję. Każde kliknięcie przycisku usuwa jedną błędną opcję (wyszarza ją). Zachowaj je na najtrudniejsze pytania — wybór formy czasownika i fałszywych przyjaciół.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each correct answer adds to your session streak. Completing all posters in the deck unlocks the post-shell review screen with explanations of every wrong pick.',
    pl:
      'Pomiń liczy się jako błąd. Każda poprawna odpowiedź zwiększa serię w sesji. Ukończenie wszystkich plakatów odblokowuje ekran przeglądu z wyjaśnieniami każdego błędu.',
  },
  l1Pattern: {
    en:
      'Polish learners often pick the wrong helping verb (have / has / had) or over-regularize irregular past forms. This shell drills picking the right form for the context.',
    pl:
      'Polscy uczniowie często wybierają złą formę pomocniczą (have / has / had) albo „regularyzują" nieregularne formy przeszłe. Ten poziom trenuje wybór właściwej formy w kontekście.',
  },
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type MCForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface MCQuestion {
  id: string;
  prompt: string;
  prompt_pl?: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample MC_PUZZLE
   *  doesn't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
  /** Convex `exercises.questions[i].explanationPL` — the post-answer rule
   *  explanation. Surfaces in <PracticeReview> as the rule callout under
   *  each wrong item. Added 2026-05-02 for D3. */
  explanationPL?: string;
}

// Per-shell puzzle interface lives INSIDE the shell file (per agent spec).
// The main session will mirror this into `lib/adapters.ts` as
// `ShellMultipleChoicePuzzle` afterwards.
export interface ShellMultipleChoicePuzzle {
  questions: MCQuestion[];
}

export interface MultipleChoiceShellProps {
  time?: TimeOfDay;
  state?: MCForcedState;
  /**
   * When provided (e.g. from StudentPractice's generator + adapter pipeline),
   * the shell renders this puzzle's questions instead of MC_PUZZLE.
   */
  puzzle?: ShellMultipleChoicePuzzle;
  /** Layer-4 dynamic-scaffolding hook (Agent A12). Fires on each wrong pick. */
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D1 (CD's revised brief, 2026-05-02): fires once when the student finishes
   * the shell, regardless of whether they got everything right. The host uses
   * this to mount a <PracticeReview> overlay with the full set of questions +
   * outcomes. When provided, the shell suppresses its built-in completion
   * overlay (the "Try another / Next district" buttons) — the review screen
   * is the new completion destination.
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
    /** Snapshot of the puzzle that drove the session — for review rendering. */
    puzzle: ShellMultipleChoicePuzzle;
  }) => void;
}

// ─────────────────────────────────────────────────────────────
// Built-in demo puzzle — used by the design canvas + as a fallback
// when no adapter-produced puzzle is mounted.
// ─────────────────────────────────────────────────────────────
export const MC_PUZZLE: ShellMultipleChoicePuzzle = {
  questions: [
    {
      id: 'bridge',
      prompt: 'We crossed the ___ at sunset.',
      options: ['avenue', 'bridge', 'station', 'square'],
      answerIndex: 1,
      hint: 'Something that crosses water.',
      hint_pl: 'Coś, co przechodzi nad wodą — most.',
    },
    {
      id: 'avenue',
      prompt: 'A wide tree-lined ___ ran through the centre.',
      options: ['street', 'tunnel', 'avenue', 'path'],
      answerIndex: 2,
      hint: 'A grand, often tree-lined road.',
      hint_pl: 'Aleja — szeroka droga, często z drzewami.',
    },
    {
      id: 'metro',
      prompt: 'Take the ___ to the city centre.',
      options: ['plane', 'metro', 'ferry', 'tram'],
      answerIndex: 1,
      hint: 'Underground rapid transit.',
      hint_pl: 'Podziemna kolej miejska — metro.',
    },
    {
      id: 'plaza',
      prompt: 'Tourists gathered in the ___ to watch the parade.',
      options: ['plaza', 'alley', 'park', 'lobby'],
      answerIndex: 0,
      hint: 'A wide public square.',
      hint_pl: 'Plac — duża przestrzeń publiczna.',
    },
    {
      id: 'kiosk',
      prompt: 'She bought a paper from the corner ___.',
      options: ['cafe', 'kiosk', 'bench', 'gate'],
      answerIndex: 1,
      hint: 'A small street stand.',
      hint_pl: 'Kiosk — mały punkt na rogu ulicy.',
    },
    {
      id: 'tower',
      prompt: 'The clock ___ rang at midnight.',
      options: ['post', 'gate', 'tower', 'shed'],
      answerIndex: 2,
      hint: 'A tall narrow building.',
      hint_pl: 'Wieża — wysoki wąski budynek.',
    },
  ],
};

const ACCENT = '#FB7185';                 // rose — alert, judgment
const ACCENT_DEEP = '#9B1C2E';
const POSTER_HUES = ['#FBBF24', '#7DD3FC', '#BEF264', '#E879F9']; // option-card paper tints

// Stable rotation for poster jitter — a tiny per-id pseudo-hash so the
// board feels hand-pinned, not algorithmic.
function jitter(seed: string, range = 3): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return (((h % (range * 200)) / 100) - range);
}

// ─────────────────────────────────────────────────────────────
// MCPoster — single answer-poster card. Used both in live play AND inside
// PracticeReview's per-item locked-state render. Same visual primitives so
// the review feels like the live experience frozen at the moment of judgment.
// ─────────────────────────────────────────────────────────────
export interface MCPosterProps {
  letter: string;       // 'A' | 'B' | 'C' | 'D'
  text: string;         // option text
  hue: string;          // POSTER_HUES[i]
  rotation: number;     // jitter angle in degrees
  showCorrect: boolean; // green ring + ✓ TAK
  showWrong: boolean;   // red ring + ✗ NIE
  dim: boolean;         // dim non-correct, non-picked options after reveal
  picked: boolean;      // for aria-checked
  locked: boolean;      // disable click (revealed in play OR review mode)
  onClick?: () => void;
  innerRef?: (el: HTMLButtonElement | null) => void;
  /** Suppress entry animation when rendering in review (already settled). */
  suppressEntryAnimation?: boolean;
  /** Stagger ms (per-card index in the live grid). Default 60ms × index. */
  entryDelayMs?: number;
}

export const MCPoster: React.FC<MCPosterProps> = ({
  letter, text, hue, rotation, showCorrect, showWrong, dim,
  picked, locked, onClick, innerRef, suppressEntryAnimation, entryDelayMs = 0,
}) => {
  const bg = showCorrect
    ? `linear-gradient(180deg, ${hue}, ${hue}cc)`
    : showWrong
      ? `linear-gradient(180deg, #fdfcf6, #f0e6cd)`
      : 'linear-gradient(180deg, #fffefb 0%, #f4ead0 100%)';
  return (
    <button
      ref={innerRef}
      role="radio"
      aria-checked={picked}
      aria-disabled={locked}
      aria-label={`Option ${letter}: ${text}${showCorrect ? ', correct' : showWrong ? ', wrong' : ''}`}
      onClick={locked ? undefined : onClick}
      type="button"
      style={{
        position: 'relative',
        minHeight: 96,
        padding: '18px 14px 14px',
        border: 'none',
        borderRadius: 6,
        cursor: locked ? 'default' : 'pointer',
        background: bg,
        color: '#2A1810',
        transform: `rotate(${rotation}deg) translateY(${showCorrect ? '-4px' : showWrong ? '2px' : '0'})`,
        boxShadow: showCorrect
          ? `0 16px 36px -12px ${hue}cc, 0 0 0 2px ${hue}, 0 0 28px ${hue}88`
          : showWrong
            ? `0 6px 16px -8px rgba(0,0,0,0.5), inset 0 0 0 2px ${ACCENT}99`
            : '0 8px 20px -10px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.4)',
        opacity: dim ? 0.45 : 1,
        fontFamily: 'var(--em-decor)',
        fontSize: 18,
        letterSpacing: '0.005em',
        transition: 'transform 220ms var(--em-ease), box-shadow 220ms var(--em-ease), opacity 220ms var(--em-ease)',
        animation: suppressEntryAnimation ? 'none' : `mc-card-rise 520ms var(--em-ease) ${entryDelayMs}ms both`,
        textAlign: 'left',
      }}
    >
      {/* Pin */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)',
        width: 12, height: 12, borderRadius: '50%',
        background: `radial-gradient(circle at 30% 30%, ${hue}, ${hue}99 70%, rgba(0,0,0,0.4) 100%)`,
        boxShadow: '0 2px 3px rgba(0,0,0,0.4)',
      }} />
      <div className="em-eyebrow" style={{ color: '#8a5a2c', fontFamily: 'var(--em-mono)', fontSize: 13, letterSpacing: '0.14em', marginBottom: 6 }}>
        {letter}
      </div>
      <div style={{ wordBreak: 'break-word' }}>{text}</div>
      {showCorrect && (
        <div aria-hidden="true" style={{ position: 'absolute', bottom: 8, right: 10, fontFamily: 'var(--em-mono)', fontSize: 13, letterSpacing: '0.14em', color: '#15532A', opacity: 0.85 }}>
          ✓ TAK
        </div>
      )}
      {showWrong && (
        <div aria-hidden="true" style={{ position: 'absolute', bottom: 8, right: 10, fontFamily: 'var(--em-mono)', fontSize: 13, letterSpacing: '0.14em', color: ACCENT_DEEP, opacity: 0.85 }}>
          ✗ NIE
        </div>
      )}
      {/* Shimmering gold boundary — Mike's redesign 2026-05-02. Animated
       * gradient sweeps around the perimeter. Only on idle (pre-pick) state;
       * once the option is committed/locked the static ring takes over so
       * the animation doesn't fight the result coloring. Auto-disabled by
       * prefers-reduced-motion guard in the inline style block. */}
      {!locked && !showCorrect && !showWrong && (
        <span className="em-mc-poster-shimmer" aria-hidden="true" />
      )}
    </button>
  );
};

/**
 * renderMCReviewItem — per-question option grid for PracticeReview's
 * `renderItem` callback. The review screen passes back the question and
 * its locked state; this function paints the 4 posters with green/red
 * rings matching what the student saw the moment they committed.
 */
export function renderMCReviewItem(
  question: MCQuestion,
  studentAnswerText: string | undefined,
): React.ReactNode {
  return (
    <div
      role="radiogroup"
      aria-label="Locked answer review"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 14,
        marginTop: 8,
      }}
    >
      {question.options.map((opt, i) => {
        const isCorrect = i === question.answerIndex;
        const wasPicked = studentAnswerText !== undefined && opt === studentAnswerText;
        const showCorrect = isCorrect;
        const showWrong = wasPicked && !isCorrect;
        const dim = !isCorrect && !wasPicked;
        const hue = POSTER_HUES[i % POSTER_HUES.length];
        return (
          <MCPoster
            key={i}
            letter={String.fromCharCode(65 + i)}
            text={opt}
            hue={hue}
            rotation={0}
            showCorrect={showCorrect}
            showWrong={showWrong}
            dim={dim}
            picked={wasPicked}
            locked
            suppressEntryAnimation
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export const MultipleChoiceShell: React.FC<MultipleChoiceShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  // Kelly Tier-2 (2026-05-02): defensive props guard.
  const propsInvalid = !forcedState && puzzle !== undefined && (!puzzle.questions || puzzle.questions.length === 0);
  const activePuzzle: ShellMultipleChoicePuzzle =
    puzzle && puzzle.questions.length > 0 ? puzzle : MC_PUZZLE;
  const total = activePuzzle.questions.length;

  // Persisted progress — skipped when forcedState is set for design-canvas demos.
  const persisted = useShellProgress('multiplechoice');

  const [idx, setIdx] = useState<number>(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [questionsSeen, setQuestionsSeen] = useState<number>(0);
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [hintRevealed, setHintRevealed] = useState<boolean>(false);
  const [shake, setShake] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Kelly Tier-2 (2026-05-02): focus-trap refs for the board-full dialog.
  const tryAnotherBtnRef = useRef<HTMLButtonElement | null>(null);
  const nextDistrictBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Layer-4 (EM-040): accumulate wrong attempts for an end-of-shell summary
  // so the InterferenceTip doesn't interrupt the per-question rhythm.

  const cur = activePuzzle.questions[idx % total];
  const completed = idx >= total;
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    // D1 (2026-05-02): on completion, hand the full session to the host so
    // it can mount <PracticeReview>. We pass score (correct count) directly
    // since useEndOfShellTip only knows about wrong attempts.
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount: score,
        totalQuestions: total,
        wrongAttempts,
        puzzle: activePuzzle,
      });
    } : undefined,
  });

  // Auto-save on advance.
  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'multiplechoice',
      brief: 'Read the question, then tap one of the four answer chips.',
      brief_pl: 'Przeczytaj pytanie, a potem stuknij jedną z czterech kart-odpowiedzi.',
      detail: 'A sentence appears on the cork-board with a gap or a question. Four poster chips show possible answers. Tap the one you think is right; you commit immediately. Right answers light green and advance; wrong ones reveal the correct chip and explain why.',
      detail_pl: 'Na tablicy pojawia się zdanie z luką lub pytanie. Cztery plakaty pokazują możliwe odpowiedzi. Stuknij tę, którą uważasz za poprawną; zatwierdzasz od razu. Poprawne świecą na zielono i przechodzą dalej; błędne pokazują właściwą i wyjaśniają, dlaczego.',
      fullInstructions: MULTIPLECHOICE_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (forcedState) return;
    persisted.save({
      progress: idx / Math.max(1, total),
      lastState: completed ? 'complete' : 'active',
    });
    if (completed) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
    // We deliberately depend on idx, not the full puzzle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, total, forcedState]);

  // Forced state — design canvas previews.
  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') { setIdx(0); setPicked(null); setRevealed(false); setScore(0); setQuestionsSeen(0); }
    if (forcedState === 'active') { setIdx(1); setPicked(null); setRevealed(false); }
    if (forcedState === 'correct') { setIdx(1); setPicked(activePuzzle.questions[1].answerIndex); setRevealed(true); }
    if (forcedState === 'wrong') {
      const ai = activePuzzle.questions[1].answerIndex;
      setIdx(1); setPicked((ai + 1) % 4); setRevealed(true);
    }
    if (forcedState === 'complete') { setIdx(total); setScore(total); }
  }, [forcedState, activePuzzle, total]);

  const pick = (i: number): void => {
    if (forcedState || revealed || completed) return;
    setPicked(i);
    setRevealed(true);
    if (i === cur.answerIndex) {
      setScore((s) => s + 1);
      setAnnouncement(`Correct. The right poster was ${cur.options[i]}.`);
    } else {
      setShake(true);
      setAnnouncement(`Not quite. The correct answer was ${cur.options[cur.answerIndex]}.`);
      setTimeout(() => setShake(false), 480);
      tip.recordWrong({
          questionId: cur.id,
          studentAnswer: cur.options[i],
          correctAnswer: cur.options[cur.answerIndex],
          // 2026-05-02 (CD audit, post-D2): prefer the FULL rule explanation
          // (q.explanationPL) over the short hint (q.hint_pl). The full rule
          // is what carries the D2-augmented <strong> markup; hint_pl is the
          // pre-answer clue and was never targeted by the augmentation pass.
          // Fall back to hint_pl when explanationPL is absent (puzzles built
          // by the vocab generator path don't carry it).
          explanationPL: cur.explanationPL ?? cur.hint_pl,
          exerciseId: cur.exerciseId,
        });
    }
  };

  const advance = (): void => {
    setQuestionsSeen((q) => q + 1);
    setIdx((i) => i + 1);
    setPicked(null);
    setRevealed(false);
    setHintRevealed(false);
  };

  const skip = (): void => {
    if (forcedState || completed) return;
    setQuestionsSeen((q) => q + 1);
    setAnnouncement(`Skipped. The right poster would have been ${cur.options[cur.answerIndex]}.`);
    setIdx((i) => i + 1);
    setPicked(null);
    setRevealed(false);
    setHintRevealed(false);
  };

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 3 || revealed) return;
    setHintsUsed((h) => h + 1);
    setHintRevealed(true);
  };

  const reset = (): void => {
    setIdx(0); setPicked(null); setRevealed(false); setScore(0);
    setQuestionsSeen(0); setHintsUsed(0); setHintRevealed(false);
    tip.reset();
  };

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the board-full dialog.
  // Skipped when the host wires onSessionComplete (host's PracticeReview takes
  // over the completion experience and renders its own focus management).
  useEffect(() => {
    if (!completed) return;
    if (onSessionComplete) return; // host owns the completion UI
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const focusId = window.setTimeout(() => { nextDistrictBtnRef.current?.focus(); }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusables = [tryAnotherBtnRef.current, nextDistrictBtnRef.current].filter(Boolean) as HTMLButtonElement[];
        if (focusables.length === 0) return;
        const idx = focusables.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        if (e.shiftKey) {
          const next2 = idx <= 0 ? focusables[focusables.length - 1] : focusables[idx - 1];
          next2.focus();
        } else {
          const next2 = idx === -1 || idx >= focusables.length - 1 ? focusables[0] : focusables[idx + 1];
          next2.focus();
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        reset();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      window.clearTimeout(focusId);
      document.removeEventListener('keydown', trap);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, onSessionComplete]);

  // Memoised poster rotations so they don't re-jitter on every render.
  const rotations = useMemo(
    () => cur ? cur.options.map((opt, i) => jitter(`${cur.id}:${i}:${opt}`, 2.4)) : [],
    [cur],
  );
  const posterRot = useMemo(() => cur ? jitter(cur.id, 1.6) : 0, [cur]);

  const liveStatus = completed
    ? `All posters answered. Score ${score} of ${total}.`
    : announcement;

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div
      className="em-shell em-shell-multiplechoice"
      role="application"
      aria-label="Multiple choice, The Bulletin Board"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {liveStatus}
      </div>

      {/* ─── Bulletin Board scene (Mike's redesign 2026-05-02) ─────────────
          Magenta-pink radial gradient + animated starfield (the "stars and
          glitter" per his note) + faint paper-grain veil for texture. */}
      <div style={{
        position: 'absolute', inset: 0,
        background:
          time === 'day'
            ? 'radial-gradient(ellipse at 50% 30%, #C5598E 0%, #6A2A8C 50%, #2A1450 100%)'
            : time === 'dusk'
              ? 'radial-gradient(ellipse at 50% 35%, #B85A88 0%, #6E325E 45%, #1F1240 100%)'
              : 'radial-gradient(ellipse at 50% 40%, #5A2D6F 0%, #2A1450 55%, #07041A 100%)',
      }} />
      {/* Animated starfield — three layers at different sizes/speeds for parallax */}
      <svg aria-hidden="true" viewBox="0 0 1200 800" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <defs>
          <radialGradient id="mc-star" cx="0.5" cy="0.5">
            <stop offset="0" stopColor="#FFFEF8" stopOpacity="1" />
            <stop offset="0.5" stopColor="#FBBF24" stopOpacity="0.6" />
            <stop offset="1" stopColor="#FBBF24" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mc-glitter" cx="0.5" cy="0.5">
            <stop offset="0" stopColor="#E879F9" stopOpacity="0.85" />
            <stop offset="1" stopColor="#E879F9" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Far layer — small twinkling stars */}
        {Array.from({ length: 60 }).map((_, i) => {
          const x = (i * 73 + 17) % 1200;
          const y = (i * 41 + 23) % 800;
          const r = 1 + ((i * 7) % 3) * 0.5;
          const dur = 1.6 + ((i * 11) % 5) * 0.4;
          const delay = (i * 0.13) % 3;
          return (
            <circle key={`f${i}`} cx={x} cy={y} r={r} fill="url(#mc-star)" style={{ animation: `mc-twinkle ${dur}s ease-in-out ${delay}s infinite alternate` }} />
          );
        })}
        {/* Mid layer — bigger glitter specks in pink */}
        {Array.from({ length: 22 }).map((_, i) => {
          const x = (i * 137 + 53) % 1200;
          const y = (i * 89 + 31) % 800;
          const r = 2 + (i % 3);
          const dur = 2.4 + ((i * 7) % 6) * 0.4;
          const delay = (i * 0.27) % 4;
          return (
            <circle key={`m${i}`} cx={x} cy={y} r={r} fill="url(#mc-glitter)" style={{ animation: `mc-glitter ${dur}s ease-in-out ${delay}s infinite alternate` }} />
          );
        })}
        {/* Near layer — gold sparkles, slow drift */}
        {Array.from({ length: 14 }).map((_, i) => {
          const x = (i * 211 + 71) % 1200;
          const y = (i * 157 + 41) % 800;
          const dur = 3.6 + ((i * 5) % 4) * 0.5;
          const delay = (i * 0.41) % 5;
          return (
            <g key={`n${i}`} transform={`translate(${x},${y})`} style={{ animation: `mc-twinkle ${dur}s ease-in-out ${delay}s infinite alternate` }}>
              <path d="M0 -6 L1.5 -1.5 L6 0 L1.5 1.5 L0 6 L-1.5 1.5 L-6 0 L-1.5 -1.5 Z" fill="#FBBF24" opacity="0.85" />
            </g>
          );
        })}
      </svg>
      {/* Soft horizontal cord with paper streamer at the top */}
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: 'linear-gradient(90deg, transparent, rgba(251,113,133,0.45), transparent)', boxShadow: '0 1px 8px rgba(251,113,133,0.55)' }} />
      <div aria-hidden="true" style={{ position: 'absolute', top: 8, left: '12%', right: '12%', height: 2, background: 'linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.18), rgba(255,255,255,0.06))', borderRadius: 999 }} />
      {/* Faint paper-grain veil */}
      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      {/* Corner kiosk vignette */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />

      {/* ─── Floating notice slips drifting in the breeze ─────────────────── */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.55 }}>
        {[
          { l: '6%',  t: '14%', txt: 'OPEN MIC FRI', c: '#FBBF24', r: -7 },
          { l: '88%', t: '12%', txt: 'LOST CAT',     c: '#7DD3FC', r: 5 },
          { l: '4%',  t: '76%', txt: 'GIG · 22:00',  c: '#BEF264', r: 4 },
          { l: '90%', t: '78%', txt: 'BUY · SELL',   c: '#E879F9', r: -6 },
        ].map((s, i) => (
          <div key={i} style={{
            position: 'absolute', left: s.l, top: s.t,
            transform: `rotate(${s.r}deg)`,
            padding: '6px 10px',
            fontFamily: 'var(--em-mono)', fontSize: 13, letterSpacing: '0.12em',
            color: s.c, background: 'rgba(0,0,0,0.35)',
            border: `1px dashed ${s.c}55`, borderRadius: 3,
            animation: `mc-flutter ${5 + i}s ease-in-out ${i * 0.4}s infinite alternate`,
          }}>{s.txt}</div>
        ))}
      </div>

      {/* ─── Header bar ───────────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, zIndex: 5, flexWrap: 'wrap' }}>
        <AmbientAudioPlayer shellSlug="multiplechoice" />
        <Nameplate
          district="The Bulletin Board"
          subtitle="Multiple Choice · Wybierz odpowiedź · pin the right poster"
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="3" y="4" width="16" height="14" rx="1.5" stroke={ACCENT} strokeWidth="1.6" />
              <path d="M6 8 H16 M6 11 H14 M6 14 H12" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="11" cy="3.2" r="1.4" fill={ACCENT} />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress
            current={score}
            seen={questionsSeen}
            total={total}
            accent={ACCENT}
          />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      {/* ─── Main poster + answer cards ───────────────────────────────────── */}
      {!completed && cur && (
        <div
          key={cur.id}
          style={{
            position: 'absolute', inset: '110px 24px 220px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'flex-start', gap: 28,
            zIndex: 4,
          }}
        >
          {/* Question poster */}
          <div
            role="region"
            aria-label="Question poster"
            style={{
              position: 'relative',
              maxWidth: 560, width: '100%',
              padding: '24px 26px 22px',
              background: 'linear-gradient(180deg, #FFF8E7 0%, #F2DFB6 100%)',
              color: '#2A1810',
              borderRadius: 6,
              transform: `rotate(${posterRot}deg)`,
              boxShadow: '0 18px 40px -16px rgba(0,0,0,0.55), 0 6px 14px -6px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.4)',
              animation: `mc-poster-rise 540ms var(--em-ease) both, ${shake ? 'em-shake 0.42s var(--em-ease)' : 'none'}`,
            }}
          >
            {/* Push pin */}
            <div aria-hidden="true" style={{
              position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
              width: 18, height: 18, borderRadius: '50%',
              background: `radial-gradient(circle at 30% 30%, ${ACCENT} 0%, ${ACCENT_DEEP} 70%, #4a0a1a 100%)`,
              boxShadow: '0 2px 4px rgba(0,0,0,0.5), 0 6px 14px rgba(251,113,133,0.45)',
            }} />
            {/* CD audit cross-cutting #14 (Ricky 2026-05-02): drop redundant
                "Q {idx+1} / {total}" — the header <Progress> is the single
                canonical position counter. Themed eyebrow stays. */}
            <div className="em-eyebrow" style={{ color: '#A8612C', marginBottom: 6, fontFamily: 'var(--em-mono)', fontSize: 13, letterSpacing: '0.16em' }}>
              NOTICE · OGŁOSZENIE
            </div>
            <div className="em-decor" style={{ fontSize: 22, lineHeight: 1.25, marginBottom: 8, color: '#2A1810' }}>
              {cur.prompt}
            </div>
            {cur.prompt_pl && (
              <div style={{ fontSize: 13.5, fontStyle: 'italic', color: '#6E4825', borderTop: '1px dashed rgba(0,0,0,0.18)', paddingTop: 6 }}>
                🇵🇱 {cur.prompt_pl}
              </div>
            )}
            {/* Hint reveal — spray-painted "tip" stamp */}
            {hintRevealed && (
              <div role="status" aria-live="polite" style={{
                marginTop: 10,
                padding: '7px 11px',
                background: 'rgba(155,28,46,0.10)',
                border: `1px dashed ${ACCENT_DEEP}66`,
                borderRadius: 6,
                fontSize: 13.5, color: ACCENT_DEEP,
                animation: 'em-tip-fade 220ms var(--em-ease) both',
              }}>
                <span className="em-eyebrow" style={{ color: ACCENT_DEEP, marginRight: 6 }}>HINT</span>
                {cur.hint} <span style={{ opacity: 0.75 }}>· 🇵🇱 {cur.hint_pl}</span>
              </div>
            )}
          </div>

          {/* Answer cards */}
          <div
            role="radiogroup"
            aria-label="Choose the answer poster"
            style={{
              display: 'grid',
              // Mike 2026-05-02: lock to 2x2 layout. The previous auto-fit
              // with minmax(150px, 1fr) produced 3-up at desktop widths,
              // leaving an awkward orphan in the bottom row when there are 4
              // options. Mockup specifies a clean 2x2 grid; mobile fallback
              // (also 2 columns via the @media rule below) stays consistent.
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 14,
              width: '100%', maxWidth: 640,
            }}
          >
            {cur.options.map((opt, i) => {
              const isPicked = picked === i;
              const isCorrect = i === cur.answerIndex;
              const showState = revealed;
              const showCorrect = showState && isCorrect;
              const showWrong = showState && isPicked && !isCorrect;
              const dim = showState && !isCorrect && !isPicked;
              const hue = POSTER_HUES[i % POSTER_HUES.length];
              const rot = rotations[i] ?? 0;

              const bg = showCorrect
                ? `linear-gradient(180deg, ${hue}, ${hue}cc)`
                : showWrong
                  ? `linear-gradient(180deg, #fdfcf6, #f0e6cd)`
                  : 'linear-gradient(180deg, #fffefb 0%, #f4ead0 100%)';

              return (
                <button
                  key={i}
                  ref={(el) => { cardRefs.current[i] = el; }}
                  role="radio"
                  aria-checked={isPicked}
                  aria-disabled={revealed}
                  aria-label={`Option ${String.fromCharCode(65 + i)}: ${opt}${showCorrect ? ', correct' : showWrong ? ', wrong' : ''}`}
                  onClick={() => pick(i)}
                  style={{
                    position: 'relative',
                    minHeight: 96,
                    padding: '18px 14px 14px',
                    border: 'none',
                    borderRadius: 6,
                    cursor: revealed ? 'default' : 'pointer',
                    background: bg,
                    color: '#2A1810',
                    transform: `rotate(${rot}deg) translateY(${showCorrect ? '-4px' : showWrong ? '2px' : '0'})`,
                    boxShadow: showCorrect
                      ? `0 16px 36px -12px ${hue}cc, 0 0 0 2px ${hue}, 0 0 28px ${hue}88`
                      : showWrong
                        ? `0 6px 16px -8px rgba(0,0,0,0.5), inset 0 0 0 2px ${ACCENT}99`
                        : '0 8px 20px -10px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.4)',
                    opacity: dim ? 0.45 : 1,
                    fontFamily: 'var(--em-decor)',
                    fontSize: 18,
                    letterSpacing: '0.005em',
                    transition: 'transform 220ms var(--em-ease), box-shadow 220ms var(--em-ease), opacity 220ms var(--em-ease)',
                    animation: `mc-card-rise 520ms var(--em-ease) ${i * 60}ms both`,
                    textAlign: 'left',
                  }}
                >
                  {/* Pin */}
                  <div aria-hidden="true" style={{
                    position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)',
                    width: 12, height: 12, borderRadius: '50%',
                    background: `radial-gradient(circle at 30% 30%, ${hue}, ${hue}99 70%, rgba(0,0,0,0.4) 100%)`,
                    boxShadow: '0 2px 3px rgba(0,0,0,0.4)',
                  }} />
                  <div className="em-eyebrow" style={{ color: '#8a5a2c', fontFamily: 'var(--em-mono)', fontSize: 13, letterSpacing: '0.14em', marginBottom: 6 }}>
                    {String.fromCharCode(65 + i)}
                  </div>
                  <div style={{ wordBreak: 'break-word' }}>{opt}</div>
                  {showCorrect && (
                    <div aria-hidden="true" style={{ position: 'absolute', bottom: 8, right: 10, fontFamily: 'var(--em-mono)', fontSize: 13, letterSpacing: '0.14em', color: '#15532A', opacity: 0.85 }}>
                      ✓ TAK
                    </div>
                  )}
                  {showWrong && (
                    <div aria-hidden="true" style={{ position: 'absolute', bottom: 8, right: 10, fontFamily: 'var(--em-mono)', fontSize: 13, letterSpacing: '0.14em', color: ACCENT_DEEP, opacity: 0.85 }}>
                      ✗ NIE
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Reveal-state next button */}
          {revealed && (
            <button
              className="em-btn em-btn-primary"
              onClick={advance}
              style={{
                marginTop: 4, animation: 'em-rise 320ms var(--em-ease) both',
                background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})`,
                color: '#FFF', borderColor: ACCENT,
              }}
            >
              {idx + 1 >= total ? 'See the board →' : 'Next poster →'}
            </button>
          )}
        </div>
      )}

      {/* ─── Instructions modal (bottom strip). HintCard + standalone Bajla
          removed 2026-05-03 — chat-widget speech bubble carries the brief. */}
      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, zIndex: 5 }}>
        <div className="em-shell-hint" style={{ flex: 1, maxWidth: 560 }}>
        </div>
      </div>

      {/* ─── Completion overlay (DESIGN.md §4 spec exactly) ──────────────── */}
      {completed && !onSessionComplete && (
        // D1 (2026-05-02): when the host wires onSessionComplete, the
        // <PracticeReview> overlay takes over the completion experience —
        // suppress this in-shell dialog so we don't double-render. The shell
        // STILL ships this dialog as a fallback for the design canvas + any
        // host that doesn't want the review pattern.
        <div
          role="dialog"
          aria-modal="true"
          aria-live="assertive"
          aria-label="Bulletin Board complete"
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 14,
            animation: 'em-rise 0.4s var(--em-ease)', zIndex: 20,
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>
            The board is full.
          </div>
          <div className="em-eyebrow">{score} / {total} CORRECT · TABLICA OGŁOSZEŃ ZAMKNIĘTA</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button ref={tryAnotherBtnRef} className="em-btn em-btn-ghost" onClick={reset}>Try another</button>
            <button
              ref={nextDistrictBtnRef}
              className="em-btn em-btn-primary"
              onClick={reset}
              style={{ background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})`, color: '#FFF', borderColor: ACCENT }}
            >
              Next district →
            </button>
          </div>
        </div>
      )}
      <Confetti show={completed} />
      {/* Shell-scoped keyframes/responsive rules → src/practice/styles/shells/multiplechoice.css */}
    </div>
  );
};

export default MultipleChoiceShell;
