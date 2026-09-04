import { ChallengeArena, useChallengeArcade } from './challenge-arcade';
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
  const arcade = useChallengeArcade();
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
  useEffect(() => { if (completed && !forcedState) arcade.finish(); }, [completed, forcedState]);
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
      brief: "Read the poster and choose one answer. Each correct answer lights more of the city.",
      brief_pl: "Przeczytaj plakat i wybierz jedną odpowiedź. Każda poprawna odpowiedź rozświetla miasto.",
      detail: "Read the poster and choose one answer. Each correct answer lights more of the city. Use a double-points boost before a question if you feel confident. Read the feedback, then choose Next challenge.",
      detail_pl: "Przeczytaj plakat i wybierz jedną odpowiedź. Każda poprawna odpowiedź rozświetla miasto. Przed odpowiedzią możesz włączyć premię podwójnych punktów. Przeczytaj informację zwrotną i wybierz Dalej.",
      fullInstructions: { ...MULTIPLECHOICE_INSTRUCTIONS, whatYouDo: {"en": ["Read the poster and choose one answer. Each correct answer lights more of the city.", "Use a double-points boost before a question if you feel confident.", "Read the feedback, then choose Next challenge."], "pl": ["Przeczytaj plakat i wybierz jedną odpowiedź. Każda poprawna odpowiedź rozświetla miasto.", "Przed odpowiedzią możesz włączyć premię podwójnych punktów.", "Przeczytaj informację zwrotną i wybierz Dalej."]}, controls: {"en": ["Read the poster and choose one answer. Each correct answer lights more of the city.", "Use a double-points boost before a question if you feel confident.", "Read the feedback, then choose Next challenge."], "pl": ["Przeczytaj plakat i wybierz jedną odpowiedź. Każda poprawna odpowiedź rozświetla miasto.", "Przed odpowiedzią możesz włączyć premię podwójnych punktów.", "Przeczytaj informację zwrotną i wybierz Dalej."]}, rightWrongSkip: {"en": ["Correct choices earn arcade points. Mistakes stay available in your session review. Skip moves on without points."], "pl": ["Poprawne wybory dają punkty arcade. Błędy zobaczysz w przeglądzie sesji. Pominięcie przechodzi dalej bez punktów."]} },
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
    if (forcedState === 'empty') { setIdx(0); setPicked(null); setRevealed(false); setScore(0); }
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
    arcade.decide(i === cur.answerIndex, cur.id);
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
    setIdx((i) => i + 1);
    setPicked(null);
    setRevealed(false);
    setHintRevealed(false);
  };

  const skip = (): void => {
    if (forcedState || completed) return;
    arcade.decide(false, cur.id);
    tip.recordWrong({questionId:cur.id,studentAnswer:'(skipped)',correctAnswer:cur.options[cur.answerIndex],explanationPL:cur.explanationPL ?? cur.hint_pl,exerciseId:cur.exerciseId});
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
    arcade.reset();
    setIdx(0); setPicked(null); setRevealed(false); setScore(0);
    setHintsUsed(0); setHintRevealed(false);
    tip.reset();
  };



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

  return <ChallengeArena variant="bulletin" title="The Bulletin Board" mission="Restore power, one correct poster at a time." prompt={cur?.prompt} translation={cur?.prompt_pl} options={cur?.options ?? []} picked={picked} answerIndex={cur?.answerIndex ?? -1} revealed={revealed} round={idx} total={total} score={score} completed={completed} onPick={pick} onNext={advance} onSkip={skip} onReset={reset} onHint={useHint} hintDisabled={hintsUsed >= 3 || hintRevealed} hint={revealed ? cur?.hint_pl || cur?.hint : hintRevealed ? cur?.hint : undefined} run={arcade} />;
};

export default MultipleChoiceShell;
