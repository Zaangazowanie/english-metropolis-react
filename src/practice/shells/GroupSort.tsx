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
import { dropZoneProps, useTouchDragDrop } from './useTouchDragDrop';

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
const zoneIdFor = (groupId: string): string => `gs-bin-${groupId}`;
const parseZoneId = (id: string): string | null => {
  const m = /^gs-bin-(.+)$/.exec(id);
  return m ? m[1] : null;
};

// Route-naming helper. If the puzzle's group name already reads as a route
// (e.g. carries " · " bilingual separator from the adapter, or already ends in
// ROUTE), pass it through. Otherwise wrap it as "<NAME> ROUTE · TRASA".
// CD audit (2026-05-02): "BIN A / BIN B" felt generic. Routes evoke the mail
// metaphor and tie the bin to its grammar topic.
const routeLabel = (groupName: string): { en: string; pl: string } => {
  // Already bilingual? Split on the EN · PL separator and keep both halves.
  if (groupName.includes(' · ')) {
    const [en, pl] = groupName.split(' · ');
    const enUp = en.toUpperCase();
    const enLabel = /\b(ROUTE|LINE|RUN|POST)\b/.test(enUp) ? enUp : `${enUp} ROUTE`;
    const plLabel = /\b(TRASA|LINIA|POCZTA)\b/.test(pl.toUpperCase()) ? pl.toUpperCase() : `TRASA ${pl.toUpperCase()}`;
    return { en: enLabel, pl: plLabel };
  }
  const up = groupName.toUpperCase();
  return {
    en: /\bROUTE\b/.test(up) ? up : `${up} ROUTE`,
    pl: `TRASA ${up}`,
  };
};

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
  const [placed, setPlaced] = useState<PlacedMap>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const [shake, setShake] = useState<string | null>(null);
  const [bounce, setBounce] = useState<string | null>(null);
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
    onSessionComplete({
      correctCount,
      totalQuestions,
      wrongAttempts: [...wrongAttempts],
      puzzle,
    });
  }, [completed, forcedState, onSessionComplete, wrongAttempts, puzzle]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') { setPlaced({}); setShake(null); setBounce(null); }
    if (forcedState === 'active') {
      const it = puzzle.items[0];
      setPlaced({ [it.word]: it.group });
      setDragging(puzzle.items[1].word);
      setHoverGroup(puzzle.items[1].group);
    }
    if (forcedState === 'correct') {
      const a = puzzle.items[0], b = puzzle.items[1];
      setPlaced({ [a.word]: a.group, [b.word]: b.group });
      setDragging(null); setHoverGroup(null);
    }
    if (forcedState === 'wrong') {
      const it = puzzle.items[0];
      setPlaced({ [it.word]: it.group });
      const wrongGroup = puzzle.groups.find(g => g.id !== puzzle.items[1].group)?.id || puzzle.groups[0].id;
      setShake(wrongGroup);
      setBounce(puzzle.items[1].word);
    }
    if (forcedState === 'complete') {
      const all: PlacedMap = {};
      puzzle.items.forEach(it => { all[it.word] = it.group; });
      setPlaced(all); setDragging(null); setHoverGroup(null); setShake(null); setBounce(null);
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
    const correct = correctGroup === groupId;
    if (correct) {
      setPlaced(p => ({ ...p, [word]: groupId }));
      setAnnouncement(`Correct. "${word}" sorted.`);
    } else {
      setShake(groupId); setBounce(word);
      setAnnouncement(`Wrong. "${word}" does not belong here.`);
      setTimeout(() => { setShake(null); setBounce(null); }, 500);
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
    setDragging(null); setHoverGroup(null);
  };

  // Touch fallback — discovers drop zone via data-dnd-drop-id attribute.
  const getTouchHandlers = useTouchDragDrop({
    onDragStart: (sourceId) => setDragging(sourceId),
    onHoverChange: (zoneId) => {
      if (zoneId == null) { setHoverGroup(null); return; }
      const groupId = parseZoneId(zoneId);
      setHoverGroup(groupId);
    },
    onDrop: (zoneId, sourceId) => {
      const groupId = parseZoneId(zoneId);
      if (groupId) tryPlace(groupId, sourceId);
    },
    onDragEnd: () => setDragging(null),
  });

  const handleZoneKey = (groupId: string) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (forcedState) return;
    if ((e.key === 'Enter' || e.key === ' ') && dragging) {
      e.preventDefault();
      tryPlace(groupId, dragging);
    }
  };

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

  const unsorted = puzzle.items.filter(it => !placed[it.word]);
  const sortedByGroup = (groupId: string): GroupItem[] =>
    puzzle.items.filter(it => placed[it.word] === groupId);

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div className="em-shell em-shell-groupsort" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Post-office interior: warm wood-panel walls.
          (The previous purple time-of-day sky has been retired — we are now
          INSIDE a building, so the wall gradient + pendant lamp set the
          atmosphere instead.) */}
      <div style={{ position: 'absolute', inset: 0, background:
        time === 'night'
          ? 'linear-gradient(180deg, #1A0F06 0%, #2E1C0C 60%, #1A0F06 100%)'
          : time === 'day'
            ? 'linear-gradient(180deg, #3F2A14 0%, #5A3D1F 60%, #3F2A14 100%)'
            : 'linear-gradient(180deg, #2C1B0C 0%, #4A3318 60%, #2C1B0C 100%)'
      }}/>
      {/* vertical wood plank lines */}
      <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.18, pointerEvents: 'none' }} preserveAspectRatio="none" viewBox="0 0 1000 700">
        {Array.from({ length: 10 }, (_, i) => (
          <line key={i} x1={i * 100 + 50} y1="0" x2={i * 100 + 50} y2="700" stroke="#1A0E04" strokeWidth="1.5"/>
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <line key={`hl-${i}`} x1={i * 100 + 50} y1="0" x2={i * 100 + 50} y2="700" stroke="#7A5028" strokeWidth="0.5" transform="translate(2,0)"/>
        ))}
      </svg>

      {/* Hanging brass pendant lamp — sways on win */}
      <svg aria-hidden="true" style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', transformOrigin: '50% 0', animation: completed ? 'em-lamp-sway 1.4s var(--em-ease) infinite' : 'em-lamp-sway 6s var(--em-ease) infinite', zIndex: 1 }} width="120" height="160" viewBox="0 0 120 160">
        <line x1="60" y1="0" x2="60" y2="60" stroke="#3D2A14" strokeWidth="2"/>
        <ellipse cx="60" cy="68" rx="6" ry="4" fill="#5A3D1F" stroke="#2A1A08" strokeWidth="1"/>
        {/* shade */}
        <path d="M30 70 L90 70 L82 110 L38 110 Z" fill="url(#em-lamp-grad)" stroke="#3D2A14" strokeWidth="1.5"/>
        <path d="M38 110 L82 110 L78 116 L42 116 Z" fill="#8B5A2B" stroke="#3D2A14" strokeWidth="1"/>
        {/* light pool */}
        <ellipse cx="60" cy="135" rx="40" ry="6" fill="#FFD27F" opacity="0.35"/>
        <defs>
          <linearGradient id="em-lamp-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C68A3D"/>
            <stop offset="60%" stopColor="#8B5A2B"/>
            <stop offset="100%" stopColor="#5A3D1F"/>
          </linearGradient>
        </defs>
      </svg>

      {/* Back-wall lanterns + window shutters */}
      <svg aria-hidden="true" style={{ position: 'absolute', top: 70, left: 60, opacity: 0.7, zIndex: 1 }} width="60" height="80" viewBox="0 0 60 80">
        <rect x="10" y="10" width="40" height="50" fill="#2A1A08" stroke="#5A3D1F" strokeWidth="2"/>
        <line x1="30" y1="10" x2="30" y2="60" stroke="#5A3D1F" strokeWidth="1.5"/>
        <line x1="10" y1="35" x2="50" y2="35" stroke="#5A3D1F" strokeWidth="1.5"/>
        {/* glow */}
        <rect x="11" y="11" width="18" height="23" fill="#FFB347" opacity="0.18"/>
        <rect x="31" y="36" width="18" height="23" fill="#FFB347" opacity="0.18"/>
      </svg>
      <svg aria-hidden="true" style={{ position: 'absolute', top: 70, right: 60, opacity: 0.7, zIndex: 1 }} width="60" height="80" viewBox="0 0 60 80">
        <rect x="10" y="10" width="40" height="50" fill="#2A1A08" stroke="#5A3D1F" strokeWidth="2"/>
        <line x1="30" y1="10" x2="30" y2="60" stroke="#5A3D1F" strokeWidth="1.5"/>
        <line x1="10" y1="35" x2="50" y2="35" stroke="#5A3D1F" strokeWidth="1.5"/>
        <rect x="11" y="11" width="18" height="23" fill="#FFB347" opacity="0.18"/>
        <rect x="31" y="36" width="18" height="23" fill="#FFB347" opacity="0.18"/>
      </svg>

      {/* Local keyframes — scoped via inline <style>. We avoid touching the
          global stylesheet so other shells (parallel agents) don't conflict. */}
      <style>{`
        @keyframes em-lamp-sway {
          0%, 100% { transform: translateX(-50%) rotate(-1.5deg); }
          50% { transform: translateX(-50%) rotate(1.5deg); }
        }
        @keyframes em-stamp-down {
          0% { transform: translate(-50%, -120%) rotate(-12deg) scale(0.6); opacity: 0; }
          55% { transform: translate(-50%, -50%) rotate(-12deg) scale(1.4); opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(-12deg) scale(1); opacity: 0.92; }
        }
        @keyframes em-return-float {
          0% { opacity: 0; transform: translate(-50%, 0) scale(0.9); }
          30% { opacity: 1; transform: translate(-50%, -30px) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -64px) scale(1); }
        }
      `}</style>
      <div className="em-grain" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}/>

      <div className="em-shell-header" style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, zIndex: 5 }}>
        <AmbientAudioPlayer shellSlug="groupsort" />
        <Nameplate district="The Post Office" subtitle="Group Sort · Sortowanie · sort the mail by route" accent={accent}
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="6" width="16" height="11" stroke={accent} strokeWidth="1.6"/><path d="M3 6 L11 13 L19 6" stroke={accent} strokeWidth="1.6"/></svg>}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* TODO (EM-041 follow-up): SkipButton calls `next` which clears the puzzle
              and presumably advances. `current` here counts items SORTED (not solved)
              and Skip doesn't advance any counter. Track `puzzlesSolved` and `puzzlesSeen`
              (whole-puzzle level), then pass to <Progress>. — Builder 7, 2026-04-30 */}
          <Progress current={puzzle.items.length - unsorted.length} total={puzzle.items.length} accent={accent}/>
          <SkipButton onClick={next} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      {hintReveal && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute', top: 86, left: '50%', transform: 'translateX(-50%)',
            background: 'linear-gradient(180deg, rgba(190,242,100,0.18), rgba(167,139,250,0.10))',
            border: `1px solid ${accent}55`, borderRadius: 14,
            padding: '10px 18px', color: 'var(--em-text)', fontSize: 13,
            zIndex: 8, boxShadow: `0 18px 36px -18px ${accent}55`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em', color: accent }}>HINT · PODPOWIEDŹ</span>
          <span><strong>{hintReveal.word}</strong> → <strong>{puzzle.groups.find(g => g.id === hintReveal.group)?.name ?? hintReveal.group}</strong></span>
        </div>
      )}

      {/* Bilingual hint card — pinned above the in-tray (which now starts at
          bottom: 24 with ~180px height, so we sit clear of it at bottom: 230).
          Ricky 2026-05-03 (CD re-audit): bumped bottom 230→260 + zIndex 4→6
          so the "Show tutorial · Samouczek" toggle sits clear of the first
          tilted envelope in the in-tray (which renders ~204px from bottom
          and tilts above its container) AND above the dock z-index of 3. */}
      <div className="em-shell-hint" style={{ position: 'absolute', bottom: 260, left: 130, maxWidth: 360, zIndex: 6, pointerEvents: dragging ? 'none' : 'auto', opacity: dragging ? 0 : 1, transition: 'opacity 220ms var(--em-ease)' }}>
      </div>

      {/* Postmaster Bajla + stool removed 2026-05-03 — was standalone
          in-shell decoration (Mike directive). */}

      {/* Counter top with brass ink-stamp + opened ledger book (right). */}
      <svg aria-hidden="true" style={{ position: 'absolute', right: 28, top: 240, zIndex: 2 }} width="180" height="120" viewBox="0 0 180 120">
        {/* counter slab */}
        <rect x="0" y="60" width="180" height="50" fill="#5A3D1F" stroke="#2A1A08" strokeWidth="1.5"/>
        <rect x="0" y="60" width="180" height="6" fill="#7A5028"/>
        {/* ledger book */}
        <g transform="translate(20,30)">
          <rect x="0" y="0" width="60" height="36" fill="#F2E6C9" stroke="#8B5A2B" strokeWidth="1"/>
          <rect x="0" y="0" width="60" height="4" fill="#8B5A2B"/>
          <line x1="30" y1="2" x2="30" y2="34" stroke="#C9B488" strokeWidth="0.6"/>
          {Array.from({ length: 5 }, (_, i) => (
            <line key={i} x1="3" y1={10 + i * 5} x2="27" y2={10 + i * 5} stroke="#7A5028" strokeWidth="0.4"/>
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <line key={`r-${i}`} x1="33" y1={10 + i * 5} x2="57" y2={10 + i * 5} stroke="#7A5028" strokeWidth="0.4"/>
          ))}
        </g>
        {/* brass ink-stamp */}
        <g transform="translate(110,18)">
          <rect x="6" y="0" width="14" height="22" fill="#3D2A14" stroke="#2A1A08" strokeWidth="0.8"/>
          <rect x="2" y="22" width="22" height="6" rx="1" fill="#C68A3D" stroke="#8B5A2B" strokeWidth="0.8"/>
          <rect x="0" y="28" width="26" height="6" rx="1" fill="#7A5028"/>
          <rect x="-2" y="34" width="30" height="3" fill="#FB7185" opacity="0.85"/>
        </g>
        {/* ink pad */}
        <g transform="translate(140,50)">
          <ellipse cx="14" cy="6" rx="14" ry="3" fill="#2A1A08"/>
          <ellipse cx="14" cy="5" rx="13" ry="2.5" fill="#5A2020"/>
        </g>
      </svg>

      {/* Sorting windows row (the "bins"). Wood-framed apertures with brass
          nameplates above — bottom raised from 300 → 280 to make room for
          the dock + counter. */}
      <div style={{ position: 'absolute', top: 130, left: 130, right: 220, bottom: 280, display: 'grid', gridTemplateColumns: `repeat(${puzzle.groups.length}, 1fr)`, gap: 24, zIndex: 2 }}>
        {puzzle.groups.map(g => {
          const isHover = hoverGroup === g.id && dragging !== null;
          const isShaking = shake === g.id;
          const route = routeLabel(g.name);
          const sorted = sortedByGroup(g.id);
          return (
            <div key={g.id}
              role="region"
              tabIndex={0}
              aria-label={`${route.en} sorting window — drop ${puzzle.title.split(' ·')[0].toLowerCase()} here. ${sorted.length} placed.`}
              {...dropZoneProps(zoneIdFor(g.id))}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDragEnter={() => setHoverGroup(g.id)}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setHoverGroup(prev => (prev === g.id ? null : prev));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const data = e.dataTransfer.getData(DRAG_MIME) || dragging || '';
                if (data) tryPlace(g.id, data);
              }}
              onClick={() => dragging && tryPlace(g.id, dragging)}
              onKeyDown={handleZoneKey(g.id)}
              style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column',
                animation: isShaking ? 'em-shake 0.4s var(--em-ease)' : 'none',
                transition: 'all 220ms var(--em-ease)',
                cursor: dragging ? 'pointer' : 'default',
                outline: 'none',
              }}>
              {/* Brass nameplate above the window */}
              <div style={{
                marginBottom: 6,
                padding: '8px 12px',
                background: 'linear-gradient(180deg, #C68A3D 0%, #8B5A2B 60%, #5A3D1F 100%)',
                border: '1.5px solid #2A1A08',
                borderRadius: 4,
                boxShadow: '0 4px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,210,127,0.5)',
                textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'var(--em-decor)', fontSize: 14, color: '#1A0F06', fontWeight: 700, letterSpacing: '0.06em', lineHeight: 1.1 }}>
                  {route.en}
                </div>
                <div style={{ fontFamily: 'var(--em-mono)', fontSize: 9, color: '#3D2A14', letterSpacing: '0.18em', marginTop: 2 }}>
                  {route.pl}
                </div>
              </div>

              {/* Wood window frame containing the drop area */}
              <div style={{
                flex: 1,
                position: 'relative',
                padding: 10,
                background: 'linear-gradient(180deg, #5A3D1F 0%, #3D2A14 100%)',
                border: '3px solid #2A1A08',
                borderRadius: 6,
                boxShadow: isHover
                  ? `0 0 28px ${g.color}88, inset 0 0 0 2px ${g.color}, inset 0 0 24px rgba(255,210,127,0.18)`
                  : 'inset 0 2px 8px rgba(0,0,0,0.6), 0 6px 12px rgba(0,0,0,0.4)',
              }}>
                {/* Window aperture (the actual sortable area) */}
                <div style={{
                  height: '100%',
                  background: isHover
                    ? `linear-gradient(180deg, ${g.color}33, rgba(20,12,4,0.92))`
                    : 'linear-gradient(180deg, rgba(20,12,4,0.78) 0%, rgba(40,24,12,0.92) 100%)',
                  border: `1px solid ${g.color}66`,
                  borderRadius: 3,
                  padding: 12,
                  display: 'flex', flexDirection: 'column', gap: 6,
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  {/* Mail trolley behind the first window (decorative) */}
                  {puzzle.groups.indexOf(g) === 0 && sorted.length === 0 && (
                    <svg aria-hidden="true" style={{ position: 'absolute', bottom: 8, right: 8, opacity: 0.5 }} width="60" height="44" viewBox="0 0 60 44" fill="none">
                      <rect x="6" y="14" width="44" height="22" fill="#3D2A14" stroke="#1A0F06" strokeWidth="1"/>
                      <rect x="10" y="6" width="36" height="10" fill="#F5EBD8" stroke="#8B5A2B" strokeWidth="0.6"/>
                      <rect x="14" y="2" width="28" height="6" fill="#F5EBD8" stroke="#8B5A2B" strokeWidth="0.6"/>
                      <circle cx="14" cy="40" r="4" fill="#1A0F06" stroke="#5A3D1F" strokeWidth="1"/>
                      <circle cx="42" cy="40" r="4" fill="#1A0F06" stroke="#5A3D1F" strokeWidth="1"/>
                    </svg>
                  )}

                  {sorted.length === 0 && (
                    <div style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `2px dashed ${g.color}55`, borderRadius: 4,
                      color: 'rgba(255,210,127,0.45)',
                      fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em', textAlign: 'center',
                      padding: 14,
                    }}>
                      DROP THE MAIL HERE
                      <br/>
                      <span style={{ fontSize: 9, opacity: 0.7 }}>UPUŚĆ LIST TUTAJ</span>
                    </div>
                  )}

                  {sorted.map(it => (
                    <div key={it.word} style={{
                      position: 'relative',
                      padding: '8px 12px 8px 14px',
                      background: '#F5EBD8',
                      borderLeft: `4px solid ${g.color}`,
                      border: '1px solid #8B5A2B',
                      borderRadius: 3,
                      fontFamily: 'var(--em-display)', fontSize: 14, color: '#3F2510',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      animation: 'em-rise 0.3s var(--em-ease)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                      overflow: 'hidden',
                    }}>
                      <span style={{ fontWeight: 500 }}>{it.word}</span>
                      {/* INK STAMP — red rotated rectangular postmark */}
                      <div style={{
                        position: 'absolute', top: '50%', right: 6,
                        transform: 'translate(0, -50%) rotate(-12deg)',
                        animation: 'em-stamp-down 0.5s var(--em-ease)',
                        border: '2px solid #B91C1C', color: '#B91C1C',
                        padding: '2px 6px', borderRadius: 2,
                        fontFamily: 'var(--em-mono)', fontSize: 8, fontWeight: 700, letterSpacing: '0.1em',
                        opacity: 0.92, pointerEvents: 'none',
                        background: 'rgba(245,235,216,0.4)',
                      }}>
                        SORTED
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Unsorted mail dock — illustrated tan envelopes on a wood tray */}
      <div style={{
        position: 'absolute', bottom: 24, left: 32, right: 32,
        display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', alignItems: 'center',
        minHeight: 180, padding: '18px 24px',
        background: 'linear-gradient(180deg, #3D2A14 0%, #2A1A08 100%)',
        border: '2px solid #1A0F06',
        borderRadius: 8,
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6), 0 -4px 12px rgba(0,0,0,0.4)',
        zIndex: 3,
      }} role="region" aria-label="Unsorted mail — drag an envelope to a sorting window">
        {/* Tray label */}
        <div style={{ position: 'absolute', top: -10, left: 18, padding: '2px 10px', background: '#C68A3D', border: '1px solid #2A1A08', borderRadius: 2, fontFamily: 'var(--em-mono)', fontSize: 8, color: '#1A0F06', letterSpacing: '0.18em', fontWeight: 700 }}>
          IN-TRAY · TACA NA POCZTĘ
        </div>

        {unsorted.length === 0 ? (
          <div style={{ color: '#FFD27F', fontStyle: 'italic', fontSize: 13, fontFamily: 'var(--em-decor)' }}>
            The tray is empty. Wszystkie listy posortowane.
          </div>
        ) : unsorted.map((it, i) => {
          const isDrag = dragging === it.word;
          const isBounce = bounce === it.word;
          const touchHandlers = getTouchHandlers(it.word);
          return (
            <button key={it.word}
              type="button"
              tabIndex={0}
              disabled={!!forcedState}
              aria-label={`Envelope: ${it.word}${isDrag ? ', selected' : ''}`}
              aria-pressed={isDrag}
              draggable={!forcedState}
              onDragStart={(e) => {
                if (forcedState) { e.preventDefault(); return; }
                e.dataTransfer.setData(DRAG_MIME, it.word);
                e.dataTransfer.effectAllowed = 'move';
                setDragging(it.word);
              }}
              onDragEnd={() => { setDragging(null); setHoverGroup(null); }}
              onClick={() => {
                if (forcedState) return;
                setDragging(d => d === it.word ? null : it.word);
              }}
              onKeyDown={(e) => {
                if (forcedState) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setDragging(d => d === it.word ? null : it.word);
                }
              }}
              {...(forcedState ? {} : touchHandlers)}
              style={{
                font: 'inherit',
                margin: 0,
                WebkitAppearance: 'none',
                appearance: 'none',
                padding: 0,
                background: 'transparent',
                border: 'none',
                position: 'relative',
                transform: `rotate(${(i - unsorted.length/2) * 1.5}deg) translateY(${isDrag ? -10 : 0}px) scale(${isDrag ? 1.06 : 1})`,
                cursor: 'grab',
                opacity: isDrag ? 0.55 : 1,
                transition: 'transform 220ms var(--em-ease), opacity 220ms',
                animation: isBounce ? 'em-shake 0.5s var(--em-ease)' : 'none',
                outline: isDrag ? '3px solid #FBBF24' : 'none',
                outlineOffset: 6,
                userSelect: 'none',
                touchAction: 'none',
                filter: isDrag ? 'drop-shadow(0 18px 24px rgba(0,0,0,0.7))' : 'drop-shadow(0 6px 10px rgba(0,0,0,0.5))',
              }}>
              {/* Illustrated tan envelope SVG */}
              <svg width="180" height="110" viewBox="0 0 180 110" style={{ display: 'block' }}>
                {/* envelope body */}
                <rect x="2" y="14" width="176" height="92" rx="2" fill="#F2E0B8" stroke="#8B5A2B" strokeWidth="1.5"/>
                {/* paper texture lines (very subtle) */}
                <line x1="2" y1="40" x2="178" y2="40" stroke="#D9C28C" strokeWidth="0.4"/>
                <line x1="2" y1="80" x2="178" y2="80" stroke="#D9C28C" strokeWidth="0.4"/>
                {/* flap (closed) */}
                <path d="M2 14 L90 64 L178 14 Z" fill="#E6D2A0" stroke="#8B5A2B" strokeWidth="1.2"/>
                {/* address label */}
                <rect x="12" y="48" width="120" height="24" fill="#FFFEF7" stroke="#C9B488" strokeWidth="0.6"/>
                <line x1="16" y1="56" x2="50" y2="56" stroke="#C9B488" strokeWidth="0.4"/>
                <line x1="16" y1="62" x2="60" y2="62" stroke="#C9B488" strokeWidth="0.4"/>
                {/* postage stamp top-right */}
                <g transform="translate(140,20)">
                  <rect x="0" y="0" width="28" height="22" fill="#FB7185" stroke="#8B0F1A" strokeWidth="0.8" strokeDasharray="1.5,1.5"/>
                  <text x="14" y="13" textAnchor="middle" fill="#FFFEF7" fontFamily="var(--em-mono)" fontSize="6" letterSpacing="0.1em">POCZTA</text>
                  <text x="14" y="19" textAnchor="middle" fill="#FFFEF7" fontFamily="var(--em-mono)" fontSize="5" letterSpacing="0.1em">EM · 1d</text>
                </g>
                {/* Red wax seal — moved to bottom-left corner so it no longer
                    obscures the centered vocab word. Ricky 2026-05-03 (CD
                    re-audit): previous transform="translate(82,60)" placed
                    the 9-radius red disk over the word text at (72,64),
                    obscuring 4 of 8 labels per CD's audit. Now anchored at
                    (10,80) — small, decorative, off the word's baseline. */}
                <g transform="translate(10,80) rotate(-12)">
                  <circle cx="8" cy="8" r="7" fill="#8B0F1A" stroke="#5A0810" strokeWidth="0.8"/>
                  <circle cx="8" cy="8" r="7" fill="url(#em-wax-grad)" opacity="0.6"/>
                  <text x="8" y="11" textAnchor="middle" fill="#F2E0B8" fontFamily="var(--em-decor)" fontSize="7" fontWeight="700">EM</text>
                </g>
                <defs>
                  <radialGradient id="em-wax-grad" cx="0.3" cy="0.3" r="0.7">
                    <stop offset="0%" stopColor="#E6505F"/>
                    <stop offset="100%" stopColor="#8B0F1A"/>
                  </radialGradient>
                </defs>
                {/* address line — the vocab text */}
                <text x="72" y="64" textAnchor="middle" fill="#3F2510" fontFamily="var(--em-decor)" fontSize="14" fontWeight="500">
                  {it.word}
                </text>
              </svg>
              {/* "RETURN TO SENDER" floater on wrong drop */}
              {isBounce && (
                <div style={{
                  position: 'absolute', top: 0, left: '50%',
                  background: '#B91C1C', color: '#FFFEF7',
                  padding: '4px 10px', borderRadius: 2,
                  fontFamily: 'var(--em-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                  border: '1.5px dashed #FFFEF7',
                  pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5,
                  animation: 'em-return-float 0.9s var(--em-ease)',
                }}>
                  RETURN TO SENDER · ZWROT
                </div>
              )}
            </button>
          );
        })}
      </div>

      {dragging && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -120px)', zIndex: 6, padding: '8px 14px', borderRadius: 999, background: 'rgba(52,211,153,0.95)', color: '#0E2A1F', fontFamily: 'var(--em-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', pointerEvents: 'none' }}>
          NOW TAP A MAILBOX · STUKNIJ SKRZYNKĘ
        </div>
      )}

      {/* Live region for assistive tech */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        {announcement}
      </div>

      {completed && !onSessionComplete && (
        // D3 Wave-2 (2026-05-02): when host wires onSessionComplete, the
        // <PracticeReview> overlay takes over completion — suppress the
        // in-shell dialog. Kept as a fallback for design canvas + hosts
        // that don't want review.
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(255,210,127,0.22), rgba(20,12,4,0.92))',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, backdropFilter: 'blur(2px)',
          animation: 'em-rise 0.5s var(--em-ease)', zIndex: 10,
        }} role="dialog" aria-modal="true" aria-label="All mail sorted">
          {/* Postmaster Bajla cheers — the back-wall lamp is already swinging
              fast (lamp-sway 1.4s) because the `completed` flag is true. */}
          <Bajla size={84} mood="cheer" decorative/>
          <div className="em-decor" style={{ fontSize: 38, color: '#FFD27F' }}>Mail delivered.</div>
          <div style={{ color: '#F5EBD8', fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.2em' }}>
            ALL ROUTES SORTED · WSZYSTKIE TRASY POSORTOWANE
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button ref={reSortBtnRef} className="em-btn" onClick={reset} aria-label="Re-sort">↻ Re-sort</button>
            <button ref={nextRoundBtnRef} className="em-btn em-btn-primary" onClick={next} aria-label="Next round">Next round →</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupSortShell;
