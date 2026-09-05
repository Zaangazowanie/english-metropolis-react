import { acceptsWordShortcut } from '../lib/word-keyboard';
import { lazy as wordLazy, Suspense as WordSuspense } from 'react';
const WordScene3D = wordLazy(() => import('../shells3d/WordGroupSort3D'));
// Group sort — The Post Office district.
// Drag mail (envelopes) into the correct sorting window (route).
// Wrong drops bounce back; correct drops latch with an ink-stamp animation.
//
// 2026-05-02 (Ricky): Mike "graphics terrible" CRITICAL revamp. Replaced
// flat outlined bin rectangles + flat 2D paper letter envelopes with a
// hand-crafted post-office interior:
//   - warm wood-panel walls + hanging brass pendant lamp (sways on win)
//   - two/three SORTING WINDOWS framed in wood with brass nameplates
//   - postmaster Bajla on a wooden stool (left) — idle/cheer/think
//   - counter top with brass ink-stamp + opened ledger book
//   - mail trolley behind a window with stacked envelopes
//   - shutters / lanterns along the back wall
//   - bin labels = grammar-route names ("PRESENT PERFECT ROUTE" etc.)
//   - envelopes = tan paper SVG with red wax seal "EM" monogram + address line
//   - correct drop: red INK STAMP appears on the envelope
//   - wrong drop: shake + "RETURN TO SENDER · ZWROT" floater
// Theme unification: "The Post Office" district + "Group Sort · Sortowanie ·
// sort the mail by route" subtitle. Dropped "Roundabout".
//
// Real HTML5 drag-and-drop: source items declare draggable, set
// dataTransfer.setData('text/plain', word) on dragstart; mailbox drop zones
// call e.preventDefault() in onDragOver to enable drop, light up on dragenter,
// and read the data on drop. A touch fallback (useTouchDragDrop) and a
// click+Enter/Space keyboard fallback both converge on the same onDrop().
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { Confetti } from '../components/primitives';
import { WordMission, useWordArcade } from './word-arcade';
import { useShellProgress } from '../lib/convex-stubs';
import type { ShellGroupSortPuzzle } from '../lib/adapters';

import React, { useEffect, useRef, useState } from 'react';
import { Bajla, HintButton, HintCard, Nameplate, Progress, SkipButton } from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 — expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';

// Post Office · Group Sort — full bilingual instruction copy.
const GROUPSORT_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'Letters arrive in the in-tray — each envelope carries a word that belongs to one of two routes.',
      'Drag (or tap then tap) each envelope into the matching sorting window above.',
      'A correct drop locks the envelope into the bin; a wrong drop returns it to the in-tray.',
      'Sort every envelope to clear the in-tray and complete the round.',
    ],
    pl: [
      'Listy przybywają do skrzynki nadawczej — każda koperta zawiera słowo należące do jednej z dwóch tras.',
      'Przeciągnij (lub stuknij i stuknij) każdą kopertę w pasujące okienko sortujące u góry.',
      'Trafny rzut blokuje kopertę w pojemniku; błędny rzut wraca do skrzynki nadawczej.',
      'Posortuj wszystkie koperty, aby opróżnić skrzynkę i ukończyć rundę.',
    ],
  },
  controls: {
    en: [
      'In-tray (bottom): the row of envelopes waiting to be sorted.',
      'Sorting windows (top): the labelled bins, one per category (e.g. Present Perfect / Modal Verb).',
      'Postmaster Bajla (left): cheers when a sort is correct, frowns when wrong.',
      'Tap-then-tap also works — useful for touch screens or when dragging is awkward.',
      'Skip / Hint buttons: 3 hints per session — each reveals one envelope\'s correct route.',
    ],
    pl: [
      'Skrzynka nadawcza (na dole): rząd kopert czekających na sortowanie.',
      'Okienka sortujące (u góry): opisane pojemniki, po jednym na kategorię (np. Present Perfect / Modal Verb).',
      'Postmaster Bajla (po lewej): cieszy się, gdy sortujesz dobrze, marszczy brwi przy błędach.',
      'Stuknij i stuknij też działa — przydatne na ekranach dotykowych lub gdy przeciąganie jest niewygodne.',
      'Pomiń / Podpowiedź: 3 podpowiedzi na sesję — każda odkrywa właściwą trasę dla jednej koperty.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right drop: envelope locks into the bin with a stamp pop, postmaster Bajla cheers.',
      'Wrong drop: envelope flies back to the in-tray, postmaster Bajla shakes her head — try again.',
      'Skip: counts as wrong and loads the next batch of mail.',
      'You can keep re-dropping wrong envelopes — the mechanic is forgiving until the round ends.',
    ],
    pl: [
      'Trafny rzut: koperta blokuje się w pojemniku z efektem stempla, postmaster Bajla się cieszy.',
      'Błędny rzut: koperta wraca do skrzynki nadawczej, postmaster Bajla kręci głową — spróbuj ponownie.',
      'Pomiń: liczy się jako błąd i ładuje następną partię poczty.',
      'Możesz wielokrotnie próbować z błędnymi kopertami — mechanika jest wyrozumiała do końca rundy.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Each hint flashes one envelope\'s correct bin label for ~2 seconds. Save them for tense-vs-aspect calls (Present Perfect vs Past Simple) — the hardest L1-transfer category.',
    pl:
      'Masz 3 podpowiedzi na sesję. Każda błyska właściwą etykietą pojemnika dla jednej koperty na ~2 sekundy. Zachowaj je na decyzje czas-vs-aspekt (Present Perfect vs Past Simple) — najtrudniejszą kategorię transferu z L1.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Sorting every envelope completes the round and unlocks the post-shell review screen with rule explanations for each category.',
    pl:
      'Pomiń liczy się jako błąd. Posortowanie wszystkich kopert kończy rundę i odblokowuje ekran przeglądu z wyjaśnieniami reguł dla każdej kategorii.',
  },
  l1Pattern: {
    en:
      'Polish has no Present Perfect tense — it\'s the single biggest grammatical gap for Polish learners. This shell drills the boundary between "have done" (PP) and "did" (PS) by sorting on aspect cues.',
    pl:
      'Polski nie ma czasu Present Perfect — to największa luka gramatyczna dla Polaków. Ten poziom trenuje granicę między „have done" (PP) a „did" (PS) poprzez sortowanie na podstawie wskazówek aspektowych.',
  },
};


// ─────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────
interface GroupSpec {
  id: string;
  name: string;
  color: string;
}

interface GroupItem {
  word: string;
  group: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  GS_PUZZLES don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

interface GroupSortPuzzle {
  title: string;
  groups: GroupSpec[];
  items: GroupItem[];
}

const GS_PUZZLES: GroupSortPuzzle[] = [
  {
    title: 'Parts of speech · Części mowy',
    groups: [
      { id: 'noun', name: 'NOUNS · rzeczowniki',     color: '#E879F9' },
      { id: 'verb', name: 'VERBS · czasowniki',      color: '#34D399' },
      { id: 'adj',  name: 'ADJECTIVES · przymiotniki', color: '#FBBF24' },
    ],
    items: [
      { word: 'bridge',     group: 'noun' },
      { word: 'tower',      group: 'noun' },
      { word: 'square',     group: 'noun' },
      { word: 'walk',       group: 'verb' },
      { word: 'cross',      group: 'verb' },
      { word: 'climb',      group: 'verb' },
      { word: 'ancient',    group: 'adj'  },
      { word: 'beautiful',  group: 'adj'  },
      { word: 'narrow',     group: 'adj'  },
    ],
  },
  {
    title: 'Verb tenses · Czasy',
    groups: [
      { id: 'past',    name: 'PAST · przeszły',     color: '#A78BFA' },
      { id: 'present', name: 'PRESENT · teraźniejszy', color: '#34D399' },
      { id: 'future',  name: 'FUTURE · przyszły',   color: '#FBBF24' },
    ],
    items: [
      { word: 'walked',     group: 'past' },
      { word: 'said',       group: 'past' },
      { word: 'was',        group: 'past' },
      { word: 'walks',      group: 'present' },
      { word: 'is',         group: 'present' },
      { word: 'sees',       group: 'present' },
      { word: 'will go',    group: 'future' },
      { word: 'shall meet', group: 'future' },
      { word: 'will be',    group: 'future' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type ShellTime = 'day' | 'dusk' | 'night';
export type ShellState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;

export interface GroupSortShellProps {
  time?: ShellTime;
  state?: ShellState;
  /**
   * When provided (e.g. from StudentPractice's generator + adapter pipeline),
   * the shell renders this puzzle deck instead of GS_PUZZLES. Accepts either
   * a single puzzle or an array (we always normalise to array internally).
   */
  puzzle?: ShellGroupSortPuzzle | ShellGroupSortPuzzle[];
  /** Layer-4 dynamic-scaffolding hook (Agent A12). Fires on each mis-sort. */
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles
     *  (built-in GS_PUZZLES) don't carry it; only adapter-produced puzzles do. */
    exerciseId?: string;
  }) => void;
  /**
   * D3-GroupSort Wave-2 (Ricky 2026-05-02): fires once when the whole sort
   * session is solved (all items placed in their correct bin) — group sort
   * is a single-shot puzzle (N items into K bins), so the review surfaces a
   * per-item breakdown showing each item's student-bin vs correct-bin.
   *
   * The host uses this to mount <PracticeReview>. Per-item review payload:
   *   - questionId   = the item's word (stable inside the puzzle)
   *   - studentAnswer = the bin name the student dropped into LAST (when
   *     they finally got it right, this is the correct bin; the per-item
   *     wrong attempts that preceded it are recorded too — first wrong
   *     attempt per item is what the review surfaces)
   *   - correctAnswer = the canonical bin name
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
    puzzle: ShellGroupSortPuzzle;
  }) => void;
}

type PlacedMap = Record<string, string>;

const DRAG_MIME = 'text/plain';



// Route-naming helper. If the puzzle's group name already reads as a route
// (e.g. carries " · " bilingual separator from the adapter, or already ends in
// ROUTE), pass it through. Otherwise wrap it as "<NAME> ROUTE · TRASA".
// CD audit (2026-05-02): "BIN A / BIN B" felt generic. Routes evoke the mail
// metaphor and tie the bin to its grammar topic.


// ─────────────────────────────────────────────────────────────
// renderGroupSortReviewItem — per-item locked render for PracticeReview's
// `renderItem` callback. Shows the EN word, the bin chip the student finally
// dropped it into vs the canonical correct bin. When the student got it on
// the first try (no wrong attempt for this item), only the correct chip is
// shown with a green ✓; when they tried wrong bin(s), the first wrong
// attempt is shown crossed-out with the correct bin chip beside it.
// ─────────────────────────────────────────────────────────────
export interface GroupSortReviewItem {
  word: string;
  /** The canonical bin name (already includes EN · PL when present). */
  correctBinName: string;
  /** First-wrong bin the student tried, when applicable. undefined = solved
   *  on first attempt. */
  firstWrongBinName?: string;
  /** Color of the correct bin (matches the live shell ring color). */
  correctBinColor: string;
}
export function renderGroupSortReviewItem(rec: GroupSortReviewItem): React.ReactNode {
  const wasWrong = rec.firstWrongBinName !== undefined;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 14px',
      background: 'linear-gradient(180deg, rgba(255,210,127,0.05), rgba(20,12,4,0.55))',
      border: `1px solid ${wasWrong ? '#FB7185' : '#34D399'}33`,
      borderRadius: 8,
    }}>
      <div style={{ fontFamily: 'var(--em-display)', fontSize: 16, color: 'var(--em-text, #EDE6FF)', fontWeight: 500 }}>
        {rec.word}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {wasWrong ? (
          <span style={{
            padding: '4px 10px', borderRadius: 4,
            background: 'linear-gradient(180deg, #FB7185, #9B1C2E)',
            color: '#FFF',
            fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.06em', fontWeight: 700,
            textDecoration: 'line-through', textDecorationColor: 'rgba(255,255,255,0.7)',
            boxShadow: '0 0 0 1px #FB7185',
          }}>
            ✗ {rec.firstWrongBinName}
          </span>
        ) : null}
        <span style={{
          padding: '4px 10px', borderRadius: 4,
          background: `linear-gradient(180deg, ${rec.correctBinColor}, ${rec.correctBinColor}cc)`,
          color: '#0E0A1A',
          fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.06em', fontWeight: 700,
          boxShadow: `0 0 0 1px ${rec.correctBinColor}, 0 0 8px ${rec.correctBinColor}55`,
        }}>
          ✓ {rec.correctBinName}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export const GroupSortShell: React.FC<GroupSortShellProps> = ({ time = 'day', state: forcedState = null, puzzle: puzzleProp, onWrongAnswer, onSessionComplete }) => {
  const arcade = useWordArcade();
  const accent = '#34D399';
  // Kelly Tier-2 (2026-05-02): defensive props guard. We compute it here and
  // early-return inside the JSX block so React's hook-call order stays stable.
  const propsInvalid = !forcedState && puzzleProp !== undefined && (
    Array.isArray(puzzleProp) ? puzzleProp.length === 0 : !puzzleProp.groups || puzzleProp.groups.length === 0
  );
  // Persisted progress (skipped when forcedState is set for design-canvas demos).
  const persisted = useShellProgress('groupsort');

  // Normalise the optional puzzle prop to an array deck. Use the built-in
  // demo deck when no puzzle is supplied (or it's empty).
  const puzzleDeck: GroupSortPuzzle[] = (() => {
    if (!puzzleProp) return GS_PUZZLES;
    const arr = Array.isArray(puzzleProp) ? puzzleProp : [puzzleProp];
    return arr.length > 0 ? arr : GS_PUZZLES;
  })();

  const [puzzleIdx, setPuzzleIdx] = useState<number>(0);
  const [expressMode, setExpressMode] = useState(true);
  const [placed, setPlaced] = useState<PlacedMap>({});
  const [dragging, setDragging] = useState<string | null>(null);

  const [shake, setShake] = useState<string | null>(null);

  const [announcement, setAnnouncement] = useState<string>('');

  // Layer-4 (EM-040): accumulate wrong sorts during the session and fire
  // onWrongAnswer ONCE at end-of-shell (in the completion effect below) so
  // the InterferenceTip overlay reads as a summary, not a per-drop nag.
  type WrongAttempt = {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  };
  const [wrongAttempts, setWrongAttempts] = useState<WrongAttempt[]>([]);
  const [tipFired, setTipFired] = useState(false);
  // D3-GroupSort Wave-2 (2026-05-02): session-fired guard so onSessionComplete
  // doesn't fire twice when React re-renders.
  const sessionFiredRef = useRef(false);

  // EM-020 (Reviewer 1, 2026-04-30): hint reveals the correct mailbox for the
  // first unsorted item — temporarily flashes the group ring + announces.
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [hintReveal, setHintReveal] = useState<{ word: string; group: string } | null>(null);

  const puzzle = puzzleDeck[puzzleIdx % puzzleDeck.length];

  const useHint = () => {
    if (forcedState || hintsUsed >= 3) return;
    const next = puzzle.items.find((it) => placed[it.word] !== it.group);
    if (!next) return;
    setHintsUsed((h) => h + 1);
    setHintReveal({ word: next.word, group: next.group });
    setTimeout(() => setHintReveal(null), 2000);
  };

  // Auto-save progress as items are sorted.
  useEffect(() => {
    if (forcedState) return;
    const total = puzzle.items.length;
    const sorted = puzzle.items.filter(it => placed[it.word] === it.group).length;
    persisted.save({ progress: sorted / total, lastState: sorted === total ? 'complete' : 'active' });
    if (sorted === total) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [Object.keys(placed).length, forcedState, puzzle]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'groupsort',
      brief: 'Drag each envelope to its category bin.',
      brief_pl: 'Przeciągnij każdą kopertę do pojemnika kategorii.',
      detail: 'The in-tray holds tilted envelopes; the sorting windows behind the counter are labelled with categories. Drag (or tap-and-place) each envelope onto its matching window. Wrong drops bounce back to the in-tray; sort every envelope to clear the post.',
      detail_pl: 'Skrzynka mieści przekrzywione koperty; okienka za ladą są opisane kategoriami. Przeciągnij (albo stuknij i postaw) każdą kopertę na pasujące okienko. Błędne rzuty wracają do skrzynki; posortuj wszystkie, aby zamknąć pocztę.',
      fullInstructions: GROUPSORT_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);
  const completed = puzzle.items.every(it => placed[it.word] === it.group);

  // Layer-4 (EM-040): when the shell completes, surface the first wrong
  // attempt accumulated during play so the InterferenceTip overlay renders
  // as an end-of-shell summary. Guarded by tipFired so we only fire once.
  useEffect(() => {
    if (forcedState) return;
    if (!completed) return;
    if (tipFired) return;
    if (wrongAttempts.length === 0) return;
    if (!onWrongAnswer) return;
    onWrongAnswer(wrongAttempts[0]);
    setTipFired(true);
  }, [completed, tipFired, wrongAttempts, onWrongAnswer, forcedState]);

  // D3-GroupSort Wave-2 (2026-05-02): fire onSessionComplete ONCE when the
  // single-shot sort puzzle is solved. The host then mounts <PracticeReview>.
  // correctCount = items.length - wrongAttempts.length, but we cap at 0
  // (multiple attempts on the same item don't multi-deduct).
  useEffect(() => {
    if (forcedState) return;
    if (!completed) return;
    if (sessionFiredRef.current) return;
    if (!onSessionComplete) return;
    sessionFiredRef.current = true;
    // Distinct items the student got wrong AT LEAST ONCE.
    const itemsWithAnyWrong = new Set(wrongAttempts.map((w) => w.questionId));
    const totalQuestions = puzzle.items.length;
    const correctCount = Math.max(0, totalQuestions - itemsWithAnyWrong.size);
    arcade.complete();
    onSessionComplete({
      correctCount,
      totalQuestions,
      wrongAttempts: [...wrongAttempts],
      puzzle,
    });
  }, [completed, forcedState, onSessionComplete, wrongAttempts, puzzle]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') { setPlaced({}); setShake(null);  }
    if (forcedState === 'active') {
      const it = puzzle.items[0];
      setPlaced({ [it.word]: it.group });
      setDragging(puzzle.items[1].word);

    }
    if (forcedState === 'correct') {
      const a = puzzle.items[0], b = puzzle.items[1];
      setPlaced({ [a.word]: a.group, [b.word]: b.group });
      setDragging(null);
    }
    if (forcedState === 'wrong') {
      const it = puzzle.items[0];
      setPlaced({ [it.word]: it.group });
      const wrongGroup = puzzle.groups.find(g => g.id !== puzzle.items[1].group)?.id || puzzle.groups[0].id;
      setShake(wrongGroup);

    }
    if (forcedState === 'complete') {
      const all: PlacedMap = {};
      puzzle.items.forEach(it => { all[it.word] = it.group; });
      setPlaced(all); setDragging(null);  setShake(null);
    }
  }, [forcedState, puzzleIdx, puzzle]);

  // Kelly Tier-2 (2026-05-02): focus-trap refs for the mail-delivered dialog.
  const reSortBtnRef = useRef<HTMLButtonElement | null>(null);
  const nextRoundBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const reset = (): void => {
    setPlaced({}); setDragging(null); setAnnouncement('');
    setWrongAttempts([]); setTipFired(false); setHintsUsed(0); setHintReveal(null);
    sessionFiredRef.current = false;
  };
  const next = (): void => { setPuzzleIdx(i => (i + 1) % puzzleDeck.length); reset(); };

  // Single source of truth for placing a word into a group. Mouse-DnD,
  // touch-DnD and keyboard-fallback all funnel through here.
  const tryPlace = (groupId: string, word: string): void => {
    if (forcedState) return;
    const misplacedItem = puzzle.items.find(it => it.word === word);
    const correctGroup = misplacedItem?.group;
    if (placed[word] === correctGroup || completed || !misplacedItem) return;
    const correct = correctGroup === groupId;
    arcade.answer(correct);
    if (correct) {
      setPlaced(p => ({ ...p, [word]: groupId }));
      setAnnouncement(`Correct. "${word}" sorted.`);
    } else {
      setShake(groupId);
      setAnnouncement(`Wrong. "${word}" does not belong here.`);
      setTimeout(() => { setShake(null);  }, 500);
      // Layer-4 (EM-040): instead of firing onWrongAnswer immediately on
      // each mis-sort (which interrupts iterative drag-and-build play),
      // accumulate the wrong attempt. We fire ONCE at end-of-shell (see
      // completion effect above) so the InterferenceTip overlay reads as
      // a summary.
      if (correctGroup) {
        const correctName = puzzle.groups.find(g => g.id === correctGroup)?.name ?? correctGroup;
        const pickedName = puzzle.groups.find(g => g.id === groupId)?.name ?? groupId;
        setWrongAttempts((prev) => [
          ...prev,
          {
            questionId: word,
            studentAnswer: pickedName,
            correctAnswer: correctName,
            exerciseId: misplacedItem?.exerciseId,
          },
        ]);
      }
    }
    setDragging(null);
  };

  // Touch fallback — discovers drop zone via data-dnd-drop-id attribute.




  // Kelly Tier-2 (2026-05-02): focus-trap effect for the mail-delivered dialog.
  useEffect(() => {
    if (!completed) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const focusId = window.setTimeout(() => { nextRoundBtnRef.current?.focus(); }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusables = [reSortBtnRef.current, nextRoundBtnRef.current].filter(Boolean) as HTMLButtonElement[];
        if (focusables.length === 0) return;
        const idx = focusables.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        if (e.shiftKey) {
          const next = idx <= 0 ? focusables[focusables.length - 1] : focusables[idx - 1];
          next.focus();
        } else {
          const next = idx === -1 || idx >= focusables.length - 1 ? focusables[0] : focusables[idx + 1];
          next.focus();
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




  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  const waiting = puzzle.items.filter(it => placed[it.word] !== it.group);
  const activeParcel = dragging ?? (expressMode ? waiting[0]?.word : null);
  return <div className="em-shell em-shell-groupsort wa-board wa-postal" tabIndex={0} onKeyDown={e=>{
    if (acceptsWordShortcut(e) && /^[1-9]$/.test(e.key) && activeParcel && !forcedState) {const group=puzzle.groups[Number(e.key)-1];if(group){e.preventDefault();tryPlace(group.id,activeParcel);e.currentTarget?.focus({preventScroll:true});}}
  }}>
    <header><AmbientAudioPlayer shellSlug="groupsort"/><Nameplate district="The Roundabout" subtitle="Express Sorting · Sortownia ekspresowa" accent={accent}/><div><Progress current={puzzle.items.length-waiting.length} total={puzzle.items.length} accent={accent}/><HintButton onClick={useHint} used={hintsUsed} total={3}/></div></header>
    <WordMission kind="sorting" current={puzzle.items.length-waiting.length} total={puzzle.items.length} chain={arcade.chain} reaction={arcade.reaction}/>
    <div className="wa-inline-tools"><button aria-pressed={expressMode} onClick={()=>{setExpressMode(v=>!v);setDragging(null);}}>Express conveyor {expressMode?'on':'off'}</button><span>{expressMode?'Route the next parcel. Press a destination number or tap a chute.':'Choose any parcel, then tap its destination.'}</span></div>
    <div className="wa-postal-objective"><small>TODAY’S ROUTE</small><h3>{puzzle.title}</h3></div>
    <WordSuspense fallback={<p>Opening the 3D district…</p>}><WordScene3D key={puzzleIdx} groups={puzzle.groups} items={puzzle.items} placed={placed} active={activeParcel??null} express={expressMode} onSelect={setDragging} onRoute={tryPlace}/></WordSuspense>
    <details><summary>Accessible parcel controls</summary><div className="wa-mail-chutes" style={{gridTemplateColumns:`repeat(${Math.min(puzzle.groups.length,4)},minmax(0,1fr))`}}>
      {puzzle.groups.map((group,i)=>{const count=puzzle.items.filter(it=>placed[it.word]===group.id).length;return <button key={group.id} className={`wa-chute ${shake===group.id?'is-wrong':''} ${hintReveal?.group===group.id?'is-hint':''}`} style={{'--wa-route':group.color} as React.CSSProperties} onClick={()=>activeParcel&&tryPlace(group.id,activeParcel)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const word=e.dataTransfer.getData(DRAG_MIME)||activeParcel;if(word)tryPlace(group.id,word);}} aria-label={`Destination ${i+1}: ${group.name}. ${count} delivered.`}>
        <span className="wa-route-number">{String(i+1).padStart(2,'0')}</span><strong>{group.name}</strong><small>{count} delivered · dostarczono</small>
      </button>;})}
    </div>
    <div className="wa-conveyor" role="region" aria-label="Unsorted mail">

      {(expressMode?waiting.slice(0,4):waiting).map((it,i)=><button key={it.word} className={`wa-parcel ${activeParcel===it.word?'is-active':''}`} disabled={expressMode&&i>0} draggable={!forcedState} onDragStart={e=>{setDragging(it.word);e.dataTransfer.setData(DRAG_MIME,it.word);}} onClick={()=>setDragging(it.word)} aria-label={`Parcel ${it.word}. Select to route.`}><span>{it.word}</span>{expressMode&&i===0&&<small>NEXT TO ROUTE</small>}</button>)}
    </div>
    </details><p className="wa-forge-readout" role="status">{hintReveal?`Route “${hintReveal.word}” to ${puzzle.groups.find(g=>g.id===hintReveal.group)?.name}`:announcement||`${waiting.length} parcels waiting · Select a destination for ${activeParcel?`“${activeParcel}”`:'your parcel'}.`}</p>
    {completed && !onSessionComplete && <div className="wa-dialog" role="dialog" aria-modal="true" aria-label="All mail sorted"><Bajla size={84} mood="cheer" decorative/><h3>Route complete.</h3><p>Every parcel has reached its destination.</p><div className="wa-inline-tools"><button ref={reSortBtnRef} className="em-btn" onClick={()=>{arcade.restart();reset();}}>Re-sort</button><button ref={nextRoundBtnRef} className="em-btn em-btn-primary" onClick={next}>Next route →</button></div></div>}
    <Confetti show={completed}/>
  </div>;
};

export default GroupSortShell;
