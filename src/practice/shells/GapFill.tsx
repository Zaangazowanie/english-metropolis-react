// Gap-fill shell — "Construction Quarter".
// Broken billboards / under-construction shop signs are missing words.
// Players drag letter tiles (or word chips) into the gaps.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import type { ShellGapFillPuzzle } from '../lib/adapters';
import { useState, useEffect, useRef } from 'react';
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
// Mike #7 — expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';

// Construction Quarter · Gap Fill — full bilingual instruction copy.
const GAPFILL_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A sentence appears with one or more empty slots — fresh concrete waiting to be set.',
      'A pool of word tiles sits below, like building blocks on the site.',
      'Tap a tile, then tap a slot to place it (or drag-and-drop on touch).',
      'Fill every slot with the right tile to "complete the build" — wrong tiles get a rose-dashed border.',
    ],
    pl: [
      'Zdanie pojawia się z jednym lub kilkoma pustymi miejscami — świeży beton czeka na ułożenie.',
      'Pula klocków-słów znajduje się poniżej, jak materiały na placu budowy.',
      'Stuknij klocek, potem stuknij miejsce, aby go umieścić (lub przeciągnij na ekranie dotykowym).',
      'Wypełnij każde miejsce właściwym klockiem — błędne kafelki dostają różowe przerywane obramowanie.',
    ],
  },
  controls: {
    en: [
      'Sentence with gaps: the construction-tape rectangle at the centre.',
      'Tile pool: the row of word tiles below — your raw building blocks.',
      'Place / Replace: tap a placed tile to remove it, then place a new one.',
      'Skip button: jumps to the next site (counts as wrong).',
      'Hint button: 3 hints per session — reveals one correct tile.',
    ],
    pl: [
      'Zdanie z lukami: prostokąt z taśmą ostrzegawczą pośrodku.',
      'Pula klocków: rząd kafelków-słów poniżej — Twoje surowe materiały.',
      'Wstaw / Zmień: stuknij umieszczony kafelek, aby go usunąć, potem wstaw nowy.',
      'Przycisk Pomiń: przeskakuje do następnej budowy (liczy się jako błąd).',
      'Przycisk Podpowiedź: 3 podpowiedzi na sesję — odkrywa jeden właściwy klocek.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right placement: tile snaps green, a "NOW OPEN" strip lights, +1 to your tally.',
      'Wrong placement: tile gets a rose-dashed border — tap it to remove and try another.',
      'Skip: counts as wrong and moves to the next sentence.',
      'You can keep trying until you get it right — wrong tries do not auto-fail you.',
    ],
    pl: [
      'Właściwe ułożenie: klocek wskakuje na zielono, zapala się napis „NOW OPEN", +1 do wyniku.',
      'Błędne ułożenie: klocek dostaje różowe przerywane obramowanie — stuknij, aby usunąć i spróbować innym.',
      'Pomiń: liczy się jako błąd i przechodzi do następnego zdania.',
      'Możesz próbować dalej, aż trafisz — błędne próby nie kończą gry automatycznie.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Each hint highlights one correct tile in green for ~2 seconds. Save them for past-participle and preposition slots — that is where Polish learners stumble most.',
    pl:
      'Masz 3 podpowiedzi na sesję. Każda podświetla jeden właściwy klocek na zielono na ~2 sekundy. Zachowaj je na imiesłowy i przyimki — tam Polacy najczęściej się zatrzymują.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each completed sentence raises your construction streak. Finishing all sites in the deck unlocks the post-shell review screen with the why-this-happens for every wrong placement.',
    pl:
      'Pomiń liczy się jako błąd. Każde ukończone zdanie zwiększa Twoją serię budowlaną. Ukończenie wszystkich budów odblokowuje ekran przeglądu z wyjaśnieniami błędów.',
  },
  l1Pattern: {
    en:
      'Polish has no articles (a/the) and uses fewer auxiliaries — so Polish learners often place the wrong tense form or skip a/the entirely. This shell builds the muscle memory.',
    pl:
      'Polski nie ma rodzajników (a/the) i używa mniej czasowników posiłkowych — dlatego Polacy często wstawiają złą formę czasu lub pomijają a/the. Ten poziom buduje pamięć mięśniową.',
  },
};

export type GapFillForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface GapFillShellProps {
  time?: TimeOfDay;
  state?: GapFillForcedState;
  /**
   * When provided (e.g. from StudentPractice's generator + adapter pipeline),
   * the shell renders this puzzle instead of GF_PUZZLE. Omit for the design
   * canvas / fallback to keep the built-in demo.
   */
  puzzle?: ShellGapFillPuzzle;
  /**
   * Layer-4 dynamic-scaffolding hook (Agent A12). Fires when the player
   * fills every gap but at least one is wrong.
   */
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    /** Originating Convex `exercises.exerciseId` for the gap that got the
     *  wrong answer. Optional — sample puzzles (built-in GF_PUZZLE) don't
     *  carry it; only adapter-produced puzzles do. */
    exerciseId?: string;
  }) => void;
  /**
   * D3-GapFill (CD's review-pattern, 2026-05-02): fires once when the student
   * has SEEN every scene (solved or skipped). The host uses this to mount
   * <PracticeReview>. When provided, the shell suppresses its built-in
   * "The sign is fixed." per-scene completion dialog so the review screen
   * is the single completion destination at the END of the deck.
   *
   * Multi-gap notes (CD's three radar items):
   *   - wrongAttempts carries one entry per WRONG GAP, not per scene.
   *     questionId encodes the gap as `${sceneId}:${gapId}` so the review
   *     can show each gap's locked chip + per-gap rule callout.
   *   - skipped scenes record NO wrongAttempts (the review's `stateFor`
   *     fallback shows them as "skipped" in restored mode, "correct" otherwise
   *     — no skipped/correct distinction at the shell layer for now).
   *   - The "See the board →" cue on the last-scene "Next billboard" button
   *     swaps text when this is the LAST seen scene, signalling the review
   *     screen comes next instead of another scene.
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
    puzzle: ShellGapFillPuzzle;
    skippedSceneIds: string[];
  }) => void;
}

interface GFGap {
  id: number;
  options: string[];
  answer: string;
  clue: string;
  /** Originating Convex `exercises.exerciseId`. Optional — built-in GF_PUZZLE
   *  demo gaps don't carry it; adapter-produced gaps may. */
  exerciseId?: string;
  /** Convex `exercises.questions[i].explanationPL` — the post-answer rule
   *  with `<strong>` markup. D3-GapFill (2026-05-02): adapter threads it
   *  through; pick handler reads `gap.explanationPL ?? cur.hint_pl` (same
   *  field-mapping discipline as MC's `cur.explanationPL ?? cur.hint_pl`). */
  explanationPL?: string;
}

interface GFGapMarker {
  gap: number;
}

type GFSignPart = string | GFGapMarker;

interface GFScene {
  id: string;
  shopName: string;
  shopName_pl: string;
  sign: GFSignPart[];
  gaps: GFGap[];
  hint_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — built-in GF_PUZZLE
   *  demo scenes don't carry it; adapter-produced scenes may. Used as a
   *  fallback when the wrong gap itself has no exerciseId. */
  exerciseId?: string;
}

interface GFPuzzle {
  scenes: GFScene[];
}

type GFPicks = Record<number, string>;
type GFFeedback = 'correct' | 'wrong' | null;

const GF_PUZZLE: GFPuzzle = {
  scenes: [
    {
      id: 'cafe',
      shopName: 'Café Latte',
      shopName_pl: 'Kawiarnia',
      sign: ['I would like', { gap: 0 }, 'cup of coffee, please.'],
      gaps: [{ id: 0, options: ['a', 'an', 'the', 'one'], answer: 'a', clue: 'singular, non-specific' }],
      hint_pl: 'Wybierz właściwy rodzajnik (article).',
    },
    {
      id: 'metro',
      shopName: 'Metro Centrum',
      shopName_pl: 'stacja metra',
      sign: ['The train', { gap: 0 }, 'in five minutes.'],
      gaps: [{ id: 0, options: ['leave', 'leaves', 'leaved', 'leaving'], answer: 'leaves', clue: '3rd person singular present' }],
      hint_pl: 'Czas teraźniejszy, trzecia osoba liczby pojedynczej.',
    },
    {
      id: 'bridge',
      shopName: 'Old Bridge',
      shopName_pl: 'Stary Most',
      sign: ['She has been', { gap: 0 }, 'in this city', { gap: 1 }, 'ten years.'],
      gaps: [
        { id: 0, options: ['live', 'lived', 'living', 'lives'], answer: 'living', clue: 'present perfect continuous' },
        { id: 1, options: ['since', 'for', 'during', 'in'], answer: 'for', clue: 'duration of time' },
      ],
      hint_pl: 'Czas Present Perfect Continuous + przyimek czasu.',
    },
  ],
};

function isGap(part: GFSignPart): part is GFGapMarker {
  return typeof part !== 'string';
}

// ─────────────────────────────────────────────────────────────────────────
// GFReviewSign — locked render of a scene's sign for PracticeReview.
// Reconstructs the shop-sign layout that the live shell shows during play,
// but with each gap REPLACED by a static chip showing what the student picked
// (rose-ringed if wrong, gold-ringed if correct, plain if skipped). The
// canonical answer is always shown beside or below the student's chip when
// the student got it wrong, so the review is a "you said X, the answer was Y"
// study-sheet — same intent as MC's locked-poster pattern.
//
// Per-gap rule callouts are owned by PracticeReview itself (it iterates
// wrongAttempts via questionId = `${sceneId}:${gapId}`) — this renderer
// just paints the chips.
// ─────────────────────────────────────────────────────────────────────────
const GF_ACCENT = '#FBBF24';

interface GFChipProps {
  text: string;
  state: 'correct' | 'wrong' | 'skipped' | 'idle';
  showAnswerHint?: string; // when wrong, the canonical answer to show under the student's chip
}
const GFChip: React.FC<GFChipProps> = ({ text, state, showAnswerHint }) => {
  const ring =
    state === 'correct' ? `0 0 0 2px ${GF_ACCENT}, 0 0 14px ${GF_ACCENT}77` :
    state === 'wrong'   ? `0 0 0 2px #FB7185, 0 0 14px #FB718577` :
    state === 'skipped' ? `0 0 0 1px rgba(245,239,255,0.25)` :
                          'none';
  const bg =
    state === 'correct' ? `linear-gradient(180deg, ${GF_ACCENT}, ${GF_ACCENT}cc)` :
    state === 'wrong'   ? 'linear-gradient(180deg, #fdfcf6, #f0e6cd)' :
    state === 'skipped' ? 'rgba(20,16,42,0.6)' :
                          'linear-gradient(180deg, #fffefb, #f4ead0)';
  const color = state === 'skipped' ? 'rgba(245,239,255,0.65)' : '#2A1810';
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, verticalAlign: 'middle', margin: '0 4px' }}>
      <span
        style={{
          padding: '6px 12px', borderRadius: 4,
          fontFamily: 'var(--em-decor)', fontSize: 16,
          background: bg, color, boxShadow: ring,
          minWidth: 54, textAlign: 'center',
          fontStyle: state === 'skipped' ? 'italic' : 'normal',
        }}
      >
        {state === 'skipped' ? '— skipped —' : text || '—'}
      </span>
      {state === 'wrong' && showAnswerHint && (
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.12em',
          color: '#15532A', textAlign: 'center',
        }}>
          ✓ {showAnswerHint}
        </span>
      )}
    </span>
  );
};

/**
 * renderGapFillReviewItem — per-scene locked render for PracticeReview's
 * `renderItem` callback. Reconstructs the sign with chips inline. Reads
 * the wrongAttempts list from the shell's payload (passed via the question's
 * shellPayload) to pick the right state per gap.
 */
export function renderGapFillReviewItem(
  scene: GFScene,
  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string }>,
  isSkipped: boolean,
): React.ReactNode {
  const wrongByGapId = new Map(
    wrongAttempts
      .filter((w) => w.questionId.startsWith(`${scene.id}:`))
      .map((w) => [Number(w.questionId.split(':')[1]), w]),
  );
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 8,
      background: 'linear-gradient(180deg, #2A1B45, #1A1030)',
      border: `1px solid ${GF_ACCENT}33`,
      lineHeight: 2, fontSize: 15, color: '#F4D5BA',
    }}>
      {scene.sign.map((part, i) => {
        if (typeof part === 'string') {
          return <span key={i}>{part}</span>;
        }
        const gap = scene.gaps.find((g) => g.id === part.gap);
        if (!gap) return null;
        if (isSkipped) {
          return <GFChip key={i} text="" state="skipped" />;
        }
        const w = wrongByGapId.get(gap.id);
        if (w) {
          return <GFChip key={i} text={w.studentAnswer} state="wrong" showAnswerHint={w.correctAnswer} />;
        }
        return <GFChip key={i} text={gap.answer} state="correct" />;
      })}
    </div>
  );
}

export const GapFillShell: React.FC<GapFillShellProps> = ({ time = 'day', state: forcedState = null, puzzle, onWrongAnswer, onSessionComplete }) => {
  // Kelly Tier-2 (2026-05-02): defensive props guard.
  const propsInvalid = !forcedState && puzzle !== undefined && (!puzzle.scenes || puzzle.scenes.length === 0);
  const activePuzzle: GFPuzzle = puzzle && puzzle.scenes.length > 0 ? puzzle : GF_PUZZLE;
  const [scene, setScene] = useState(0);
  // Persisted progress (skipped when forcedState is set for design-canvas demos).
  const persisted = useShellProgress('gapfill');
  const [picks, setPicks] = useState<GFPicks>({});
  const [feedback, setFeedback] = useState<GFFeedback>(null);
  const [completed, setCompleted] = useState(false);
  const [draggedOption, setDraggedOption] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  // Gap id whose correct option is highlighted by the latest hint.
  const [hintReveal, setHintReveal] = useState<number | null>(null);
  // EM-041 (Builder 7): track scenes SEEN (solved OR skipped) and scenes
  // SOLVED separately. Progress eyebrow renders `Q seen/total · ✓ solved/total`.
  // Without `seen`, repeated Skips left the counter frozen on the same scene
  // index even as the player advanced through the deck.
  const [scenesSeen, setScenesSeen] = useState(0);
  const [scenesSolved, setScenesSolved] = useState(0);
  // Guard double-counting if `place` finalises a scene more than once before
  // the user moves on (e.g. wrong → correct retry without changing scene).
  const [sceneFinalised, setSceneFinalised] = useState(false);
  // D3-GapFill (2026-05-02): per-gap wrong-attempt accumulator + per-scene
  // skip log. wrongAttemptsRef avoids re-renders on push (mirrors the
  // useEndOfShellTip pattern). sessionFiredRef prevents double-fires.
  const wrongAttemptsRef = useRef<Array<{
    questionId: string; studentAnswer: string; correctAnswer: string;
    explanationPL?: string; exerciseId?: string;
  }>>([]);
  const skippedSceneIdsRef = useRef<string[]>([]);
  const sessionFiredRef = useRef(false);

  const cur = activePuzzle.scenes[scene];

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'gapfill',
      brief: 'Place the right word block into each gap on the sign.',
      brief_pl: 'Wstaw właściwy klocek-słowo w każdą lukę na szyldzie.',
      detail: 'A neon sign has missing letters or words. Drag word blocks from the workshop bench (or tap a block then tap the gap) to fill each slot. Wrong tiles dash rose — tap to remove and try another. The sign lights up when every gap is right.',
      detail_pl: 'Neon ma brakujące litery lub słowa. Przeciągnij klocki ze stołu warsztatu (albo stuknij klocek a potem lukę), aby wypełnić każde miejsce. Błędne kafelki mają różowe obramowanie — stuknij, aby usunąć. Szyld zaświeci, gdy wszystko będzie dobrze.',
      fullInstructions: GAPFILL_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  // D3-GapFill (2026-05-02): fire onSessionComplete ONCE when every scene
  // has been seen (solved or skipped). Distinct from the per-scene `completed`
  // state which the in-shell "The sign is fixed." dialog already uses.
  const sessionComplete = scenesSeen >= activePuzzle.scenes.length;
  useEffect(() => {
    if (forcedState) return;
    if (!sessionComplete) return;
    if (sessionFiredRef.current) return;
    if (!onSessionComplete) return;
    sessionFiredRef.current = true;
    onSessionComplete({
      correctCount: scenesSolved,
      totalQuestions: activePuzzle.scenes.length,
      wrongAttempts: [...wrongAttemptsRef.current],
      puzzle: activePuzzle,
      skippedSceneIds: [...skippedSceneIdsRef.current],
    });
  }, [sessionComplete, forcedState, onSessionComplete, scenesSolved, activePuzzle]);

  useEffect(() => {
    if (forcedState === 'empty') {
      setPicks({});
      setFeedback(null);
      setCompleted(false);
    }
    if (forcedState === 'active') {
      setPicks({ 0: 'a' });
      setFeedback(null);
      setCompleted(false);
    }
    if (forcedState === 'correct') {
      setPicks(Object.fromEntries(cur.gaps.map((g) => [g.id, g.answer])) as GFPicks);
      setFeedback('correct');
    }
    if (forcedState === 'wrong') {
      setPicks({ 0: 'an' });
      setFeedback('wrong');
    }
    if (forcedState === 'complete') {
      setPicks(Object.fromEntries(cur.gaps.map((g) => [g.id, g.answer])) as GFPicks);
      setCompleted(true);
      if (!forcedState) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
    }
  }, [forcedState, cur]);

  const place = (gapId: number, word: string) => {
    const next: GFPicks = { ...picks, [gapId]: word };
    setPicks(next);
    if (cur.gaps.every((g) => next[g.id])) {
      const allRight = cur.gaps.every((g) => next[g.id] === g.answer);
      setFeedback(allRight ? 'correct' : 'wrong');
      if (allRight) setTimeout(() => setCompleted(true), 900);
      // EM-041: count this scene as seen+solved exactly once.
      if (allRight && !forcedState && !sceneFinalised) {
        setScenesSeen((s) => Math.min(s + 1, activePuzzle.scenes.length));
        setScenesSolved((s) => Math.min(s + 1, activePuzzle.scenes.length));
        setSceneFinalised(true);
      }
      if (!forcedState) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
      else setTimeout(() => setFeedback(null), 1400);
      // EM-041 (existing): on a wrong scene fill, count it as seen but not
      // solved so the progress counter still advances when the student moves
      // on without retrying.
      if (!allRight && !forcedState && !sceneFinalised) {
        setScenesSeen((s) => Math.min(s + 1, activePuzzle.scenes.length));
        setSceneFinalised(true);
      }
      // Layer-4 legacy: report the first wrong gap (most-relevant for the
      // single-tip InterferenceTip flow). Kept for any host that still wires
      // onWrongAnswer; the new review-screen flow uses onSessionComplete.
      // Field-mapping discipline (CD audit, post-D2): prefer the FULL rule
      // explanation `gap.explanationPL` over the short pre-answer hint
      // `cur.hint_pl`. The full rule carries D2-augmented `<strong>` markup;
      // hint_pl is the pre-answer Bajla clue and was never targeted by the
      // augmentation pass. Falls back when explanationPL is absent (vocab-
      // generator path).
      if (!allRight && !forcedState && onWrongAnswer) {
        const firstWrong = cur.gaps.find((g) => next[g.id] !== g.answer);
        if (firstWrong) {
          onWrongAnswer({
            questionId: `${cur.id}:${firstWrong.id}`,
            studentAnswer: next[firstWrong.id] ?? '',
            correctAnswer: firstWrong.answer,
            explanationPL: firstWrong.explanationPL ?? cur.hint_pl,
            exerciseId: firstWrong.exerciseId ?? cur.exerciseId,
          });
        }
      }
      // D3-GapFill (2026-05-02): record EVERY wrong gap into the session
      // accumulator. The review screen surfaces per-gap chips + per-gap rule
      // callouts, so we need one WrongAttempt per wrong gap (not just the
      // first). questionId encodes the gap as `${sceneId}:${gapId}`.
      if (!allRight && !forcedState && onSessionComplete) {
        for (const g of cur.gaps) {
          if (next[g.id] === g.answer) continue;
          wrongAttemptsRef.current.push({
            questionId: `${cur.id}:${g.id}`,
            studentAnswer: next[g.id] ?? '',
            correctAnswer: g.answer,
            explanationPL: g.explanationPL ?? cur.hint_pl,
            exerciseId: g.exerciseId ?? cur.exerciseId,
          });
        }
      }
    }
  };

  const reset = () => {
    setPicks({});
    setFeedback(null);
    setCompleted(false);
    setHintReveal(null);
    setSceneFinalised(false);
  };
  // EM-041 (Builder 7): Skip path. If the current scene wasn't already
  // finalised (i.e. solved), bump `scenesSeen` so the counter visibly advances
  // while leaving `scenesSolved` alone.
  const skip = () => {
    if (!sceneFinalised && !forcedState) {
      setScenesSeen((s) => Math.min(s + 1, activePuzzle.scenes.length));
      // D3-GapFill: log the skip so the review can render "skipped" state
      // for this scene (no per-gap chips, just a "you didn't answer this"
      // marker — CD's third radar item).
      skippedSceneIdsRef.current.push(cur.id);
    }
    setScene((s) => (s + 1) % activePuzzle.scenes.length);
    reset();
    setHintsUsed(0);
  };
  // `next` (Next billboard button after solving) doesn't bump seen — `place`
  // already counted this scene when the player got it right.
  const next = () => {
    setScene((s) => (s + 1) % activePuzzle.scenes.length);
    reset();
    setHintsUsed(0);
  };

  // Reveal the correct option for the first empty gap.
  const useHint = () => {
    if (forcedState || hintsUsed >= 3) return;
    const empty = cur.gaps.find((g) => !picks[g.id]);
    if (!empty) return;
    setHintReveal(empty.id);
    setHintsUsed((h) => h + 1);
  };

  // Kelly Tier-2 (2026-05-02): focus-trap refs for the sign-fixed dialog.
  const tryAnotherBtnRef = useRef<HTMLButtonElement | null>(null);
  const nextSceneBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the sign-fixed dialog.
  useEffect(() => {
    if (!completed) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const focusId = window.setTimeout(() => { nextSceneBtnRef.current?.focus(); }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusables = [tryAnotherBtnRef.current, nextSceneBtnRef.current].filter(Boolean) as HTMLButtonElement[];
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
  }, [completed]);

  const accent = '#FBBF24';

  const liveStatus = completed
    ? 'Gap fill complete. The sign is fixed.'
    : feedback === 'correct'
      ? 'All gaps correct.'
      : feedback === 'wrong'
        ? 'Some answers are incorrect. Try again.'
        : '';

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div
      className="em-shell em-shell-gapfill"
      role="application"
      aria-label="Gap fill exercise, Construction Quarter"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {liveStatus}
      </div>
      <div style={{
        position: 'absolute', inset: 0, background: time === 'day'
          ? 'linear-gradient(180deg, #B49AE0 0%, #E8B5C8 60%, #F4D5BA 100%)'
          : time === 'night' ? 'linear-gradient(180deg, #07041A 0%, #170B33 60%, #2F1455 100%)'
            : 'linear-gradient(180deg, #2A1850 0%, #6D3380 50%, #C57195 100%)',
      }} />

      <svg viewBox="0 0 1200 800" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
        <g stroke="#0E0A1A" strokeWidth="2" fill="none" opacity="0.7">
          <line x1="80" y1="0" x2="80" y2="800" />
          <line x1="180" y1="0" x2="180" y2="800" />
          <line x1="80" y1="120" x2="180" y2="120" />
          <line x1="80" y1="280" x2="180" y2="280" />
          <line x1="80" y1="440" x2="180" y2="440" />
          <line x1="80" y1="600" x2="180" y2="600" />
          <line x1="80" y1="120" x2="180" y2="280" />
          <line x1="180" y1="120" x2="80" y2="280" />
          <line x1="80" y1="280" x2="180" y2="440" />
          <line x1="180" y1="280" x2="80" y2="440" />

          <line x1="1020" y1="0" x2="1020" y2="800" />
          <line x1="1120" y1="0" x2="1120" y2="800" />
          <line x1="1020" y1="160" x2="1120" y2="160" />
          <line x1="1020" y1="340" x2="1120" y2="340" />
          <line x1="1020" y1="520" x2="1120" y2="520" />
        </g>
        <g stroke="#FBBF24" strokeWidth="2.5" fill="none" opacity="0.9">
          <line x1="600" y1="40" x2="600" y2="180" />
          <line x1="380" y1="80" x2="820" y2="80" />
          <line x1="380" y1="80" x2="600" y2="40" />
          <line x1="820" y1="80" x2="600" y2="40" />
          <line x1="500" y1="80" x2="500" y2="160" />
          <rect x="490" y="160" width="20" height="14" />
        </g>
      </svg>

      <div style={{
        position: 'absolute', top: 24, left: 0, right: 0, height: 18,
        background: 'repeating-linear-gradient(45deg, #FBBF24 0 18px, #0E0A1A 18px 36px)',
        opacity: 0.85, transform: 'rotate(-1deg)',
      }} />

      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div className="em-gap-layout" style={{ position: 'relative', display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 24, padding: '60px 32px 32px', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <AmbientAudioPlayer shellSlug="gapfill" />
          <Nameplate
            district="Construction Quarter"
            subtitle={`Gap-fill · Uzupełnij · ${cur.shopName} (${cur.shopName_pl})`}
            accent={accent}
            icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 19 L19 19 M5 19 L5 9 L11 5 L17 9 L17 19 M9 13 L13 13 M9 16 L13 16" stroke={accent} strokeWidth="1.5" strokeLinejoin="round" fill="none" /></svg>}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* EM-041: pass `seen` so eyebrow shows Q seen/total · ✓ solved/total. */}
            <Progress current={scenesSolved} total={activePuzzle.scenes.length} seen={Math.min(scene + 1, activePuzzle.scenes.length)} accent={accent} />
            <SkipButton onClick={skip} />
            <HintButton onClick={useHint} used={hintsUsed} total={3} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <div className="em-gap-sign" style={{ position: 'relative', width: '78%', maxWidth: 760 }}>
            <div style={{
              position: 'relative',
              background: 'linear-gradient(180deg, #2A1B45 0%, #1A1030 100%)',
              border: '6px solid #14082A',
              borderRadius: 12,
              padding: '52px 44px',
              boxShadow: '0 30px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset',
              transform: 'rotate(-0.6deg)',
            }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: i < 2 ? 8 : 'auto',
                    bottom: i >= 2 ? 8 : 'auto',
                    left: i % 2 === 0 ? 8 : 'auto',
                    right: i % 2 === 1 ? 8 : 'auto',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#0E0A1A',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.1) inset',
                  }}
                />
              ))}
              <div style={{ position: 'absolute', top: -22, left: 32, padding: '6px 14px', background: accent, color: '#1A0F2E', fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em', fontWeight: 700, transform: 'rotate(-2deg)', boxShadow: '0 6px 14px rgba(0,0,0,0.3)' }}>
                NOW OPEN · OTWARTE
              </div>

              <div className="em-decor" style={{ fontSize: 32, color: accent, textShadow: `0 0 18px ${accent}66`, marginBottom: 18, letterSpacing: '0.02em' }}>{cur.shopName}</div>

              <div style={{ fontSize: 30, lineHeight: 1.7, color: 'var(--em-text)', fontFamily: 'var(--em-display)', fontWeight: 500, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                {cur.sign.map((part, i) => {
                  if (!isGap(part)) return <span key={i}>{part}</span>;
                  const g = cur.gaps.find((gg) => gg.id === part.gap);
                  if (!g) return null;
                  const placed = picks[g.id];
                  const right = placed === g.answer;
                  return (
                    <span
                      key={i}
                      role="region"
                      aria-label={`Gap ${g.id + 1}${placed ? `, current answer ${placed}, ${right ? 'correct' : feedback === 'wrong' ? 'incorrect' : 'pending'}` : ', empty'}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedOption) place(g.id, draggedOption);
                        setDraggedOption(null);
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 140, padding: '6px 16px',
                        borderRadius: 10,
                        border: `2px dashed ${feedback === 'correct' && placed === g.answer ? 'var(--em-mint)' : feedback === 'wrong' && placed && !right ? 'var(--em-coral)' : placed ? accent : 'rgba(255,255,255,0.25)'}`,
                        background: feedback === 'correct' && right ? 'rgba(52,211,153,0.18)' : feedback === 'wrong' && placed && !right ? 'rgba(251,113,133,0.18)' : placed ? `${accent}1c` : 'rgba(0,0,0,0.25)',
                        color: placed ? 'var(--em-text)' : 'rgba(255,255,255,0.3)',
                        fontStyle: placed ? 'normal' : 'italic',
                        animation: feedback === 'wrong' && placed && !right ? 'em-shake 0.4s' : 'none',
                        transition: 'all 220ms',
                      }}
                    >
                      {placed || '____'}
                    </span>
                  );
                })}
              </div>

              <div style={{ position: 'absolute', top: -3, left: 24, right: 24, display: 'flex', justifyContent: 'space-between' }}>
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: i === 3 || i === 9 ? '#3A2A55' : accent,
                    boxShadow: i === 3 || i === 9 ? 'none' : `0 0 12px ${accent}, 0 -10px 30px ${accent}66`,
                    animation: i === 6 ? 'em-flicker 3s infinite' : 'none',
                  }} />
                ))}
              </div>
            </div>

          </div>
        </div>

        <div className="em-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="em-eyebrow">Letter blocks · klocki · drag to fix the sign</div>
            <div className="em-eyebrow" style={{ color: accent }}>{cur.gaps[0].clue}</div>
          </div>
          {hintReveal !== null && (() => {
            const g = cur.gaps.find((gg) => gg.id === hintReveal);
            if (!g) return null;
            return (
              <div
                role="status"
                aria-live="polite"
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(251,191,36,0.14)',
                  border: `1px dashed ${accent}`,
                  fontFamily: 'var(--em-mono)', fontSize: 12, color: 'var(--em-text)',
                  letterSpacing: '0.06em',
                  animation: 'em-tip-fade 220ms var(--em-ease) both',
                }}
              >
                <span className="em-eyebrow" style={{ color: accent, marginRight: 8 }}>HINT</span>
                Gap {g.id + 1} → <strong style={{ color: accent, fontFamily: 'var(--em-display)', fontSize: 16 }}>{g.answer}</strong>
                <span className="em-hint-pl" style={{ marginLeft: 10 }}>🇵🇱 {cur.hint_pl}</span>
              </div>
            );
          })()}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }} role="list" aria-label="Word options">
            {cur.gaps
              .flatMap((g) => g.options.map((o) => ({ word: o, gid: g.id, key: `${g.id}-${o}` })))
              .map((opt) => {
                const placedSomewhere = Object.values(picks).includes(opt.word);
                const isHinted = hintReveal === opt.gid && cur.gaps.find((g) => g.id === opt.gid)?.answer === opt.word;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    tabIndex={placedSomewhere ? -1 : 0}
                    disabled={placedSomewhere}
                    aria-label={`Word ${opt.word}${placedSomewhere ? ', already placed' : ', click or drag to place'}${isHinted ? ', hinted as correct' : ''}`}
                    draggable
                    onDragStart={() => setDraggedOption(opt.word)}
                    onClick={() => {
                      const empty = cur.gaps.find((g) => !picks[g.id]);
                      if (empty) place(empty.id, opt.word);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const empty = cur.gaps.find((g) => !picks[g.id]);
                        if (empty) place(empty.id, opt.word);
                      }
                    }}
                    style={{
                      // Kelly Tier-2 (2026-05-02): native <button> reset.
                      font: 'inherit',
                      margin: 0,
                      WebkitAppearance: 'none',
                      appearance: 'none',
                      cursor: placedSomewhere ? 'default' : 'grab', userSelect: 'none',
                      padding: '14px 22px',
                      background: placedSomewhere ? 'rgba(255,255,255,0.04)' : isHinted ? 'linear-gradient(180deg, #6E4F1A 0%, #3A2A12 100%)' : 'linear-gradient(180deg, #3A2855 0%, #1F1438 100%)',
                      border: isHinted ? `2px solid ${accent}` : '1px solid',
                      borderColor: placedSomewhere ? 'rgba(255,255,255,0.06)' : isHinted ? accent : `${accent}55`,
                      borderRadius: 10,
                      boxShadow: placedSomewhere ? 'none' : isHinted ? `0 0 18px ${accent}aa, 0 4px 0 rgba(0,0,0,0.4)` : '0 4px 0 rgba(0,0,0,0.4), 0 8px 20px rgba(0,0,0,0.3)',
                      color: placedSomewhere ? 'var(--em-text-dim)' : 'var(--em-text)',
                      fontFamily: 'var(--em-display)', fontSize: 18, fontWeight: 600,
                      opacity: placedSomewhere ? 0.4 : 1,
                      transition: 'all 220ms',
                    }}
                  >
                    {opt.word}
                  </button>
                );
              })}
          </div>
        </div>

        {completed && (
          <div
            role="dialog"
            aria-modal="true"
            aria-live="assertive"
            aria-label="Gap fill complete"
            // 2026-05-02: softened from outer 0.92 → 0.62 + added backdrop-blur
            // so the underlying card defocuses behind the success message rather
            // than being covered with a near-opaque dark wash. Mike: "the
            // background is still too strong on the results in this shell".
            style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse, rgba(251,191,36,0.18), rgba(14,10,26,0.62))', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, animation: 'em-rise 0.4s var(--em-ease)' }}
          >
            <Bajla size={84} mood="cheer" decorative />
            <div className="em-decor" style={{ fontSize: 38, color: accent, textShadow: `0 0 20px ${accent}aa` }}>The sign is fixed.</div>
            <div className="em-eyebrow">SHOP REOPENED · SKLEP OTWARTY</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button ref={tryAnotherBtnRef} className="em-btn em-btn-ghost" onClick={() => { reset(); }}>Try another</button>
              {/* D3-GapFill (CD radar item #2, 2026-05-02): on the last scene
                  in a session-tracked deck, swap "Next billboard →" for
                  "See the board →" so the rhythm cues that the review screen
                  is next, not another scene. Matches the MC pattern. */}
              <button ref={nextSceneBtnRef} className="em-btn em-btn-primary" onClick={next}>
                {onSessionComplete && scenesSeen + 1 >= activePuzzle.scenes.length
                  ? 'See the board →'
                  : 'Next billboard →'}
              </button>
            </div>
          </div>
        )}
        <Confetti show={completed} />
      </div>
    </div>
  );
};

export default GapFillShell;
