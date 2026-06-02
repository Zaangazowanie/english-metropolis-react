// Matching Pairs — Metro Network district.
// Click a station, then click its translation across lines.
// Successful matches glow with a connecting interchange curve.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import type { ShellMatchingPuzzle } from '../lib/adapters';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Bajla,
  HintCard,
  Progress,
  Nameplate,
  SkipButton,
  HintButton,
} from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 — expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';

// Bridge District · Matching — full bilingual instruction copy.
const MATCHING_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'Two columns of "stations" sit on the metro map: English on one side, Polish on the other.',
      'Tap an English station, then tap its Polish translation — a metro line connects them.',
      'Wrong matches shake briefly and don\'t lock — the chips reset for another try.',
      'Match every pair to complete the bridge — solved lines stay lit on the map.',
    ],
    pl: [
      'Dwie kolumny „stacji" leżą na mapie metra: angielska po jednej stronie, polska po drugiej.',
      'Stuknij angielską stację, potem polską — linia metra je połączy.',
      'Błędne dopasowania trzęsą się krótko i nie blokują — pary resetują się do kolejnej próby.',
      'Połącz wszystkie pary, aby ukończyć most — rozwiązane linie pozostają zapalone na mapie.',
    ],
  },
  controls: {
    en: [
      'Left column: English chips (the "departure" stations).',
      'Right column: Polish chips (the "arrival" stations).',
      'Active selection: the first tapped chip pulses until you tap its pair.',
      'Reset button (bottom right): clears all matches and starts the puzzle over.',
      'Hint button: 3 hints — flashes one correct EN↔PL pair briefly.',
    ],
    pl: [
      'Lewa kolumna: angielskie kafelki („odjazd").',
      'Prawa kolumna: polskie kafelki („przyjazd").',
      'Aktywne zaznaczenie: pierwszy stuknięty kafelek pulsuje, aż stukniesz jego parę.',
      'Przycisk Reset (prawy dolny róg): czyści wszystkie pary i zaczyna od nowa.',
      'Podpowiedź: 3 sztuki — błyska jedną poprawną parą EN↔PL na chwilę.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right pair: a coloured metro line draws between the two chips and locks them.',
      'Wrong pair: both chips shake rose, then deselect — try again.',
      'No skip on this shell — keep trying until the network is complete.',
      'Reset is always available if you want to start fresh without finishing.',
    ],
    pl: [
      'Trafiona para: kolorowa linia metra rysuje się między kafelkami i blokuje je.',
      'Błędna para: oba kafelki trzęsą się na różowo, potem znikają z zaznaczenia — spróbuj ponownie.',
      'Tu nie ma przycisku Pomiń — próbuj, aż sieć będzie kompletna.',
      'Reset jest zawsze dostępny, jeśli chcesz zacząć od nowa bez kończenia.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Each hint flashes one correct EN↔PL pair for ~1.5 seconds. Save them for false-friend pairs (e.g. "actual" ≠ "aktualny") where the L1 transfer is misleading.',
    pl:
      'Masz 3 podpowiedzi na sesję. Każda błyska jedną poprawną parą EN↔PL przez ~1,5 sekundy. Zachowaj je na fałszywych przyjaciół (np. „actual" ≠ „aktualny"), gdzie transfer z L1 zwodzi.',
  },
  scoring: {
    en:
      'No skip penalty. Matching every pair completes the metro network and unlocks the post-shell review screen with notes on any tricky pairs.',
    pl:
      'Brak kary za Pomiń. Połączenie wszystkich par kończy sieć metra i odblokowuje ekran przeglądu z notatkami o trudnych parach.',
  },
  l1Pattern: {
    en:
      'False friends — Polish words that look like English but mean something different ("eventually" / "ewentualnie", "sympathy" / "sympatia"). This shell drills the real-meaning mapping.',
    pl:
      'Fałszywi przyjaciele — polskie słowa, które wyglądają jak angielskie, ale znaczą co innego („eventually" / „ewentualnie", „sympathy" / „sympatia"). Ten poziom utrwala prawdziwe znaczenia.',
  },
};

export type MatchingForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface MatchingShellProps {
  time?: TimeOfDay;
  state?: MatchingForcedState;
  /**
   * When provided, the shell renders this puzzle's pairs instead of MP_PAIRS.
   */
  puzzle?: ShellMatchingPuzzle;
  /** Layer-4 dynamic-scaffolding hook (Agent A12). Fires on wrong pairings. */
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3-Matching (CD's review-pattern, 2026-05-02): fires once when every
   * pair has been matched. The host uses this to mount <PracticeReview>.
   * When provided, the shell suppresses its built-in "All trains running."
   * dialog so the review screen is the single completion destination.
   *
   * Per-pair notes:
   *   - questionId in wrongAttempts is the canonical EN word, so the review
   *     can dispatch back to renderMatchingReviewItem(pair, attempt).
   *   - studentAnswer is the LAST wrong PL the student tried (a multi-attempt
   *     wrong path collapses to the most-recent miss for display).
   *   - The full review uses ALL puzzle.pairs; pairs the student got right
   *     on the first try render with no wrong-attempt overlay.
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
    puzzle: ShellMatchingPuzzle;
  }) => void;
}

type LineColor = 'magenta' | 'violet' | 'amber';

interface MPPair {
  en: string;
  pl: string;
  line: LineColor;
  /** Originating Convex `exercises.exerciseId`. Present on adapter-produced
   *  puzzles; absent on the static MP_PAIRS demo deck. */
  exerciseId?: string;
}

type MPMatches = Record<string, string>;

interface MPSelected {
  type: 'en' | 'pl';
  value: string;
}

interface MPWrong {
  en?: string;
  pl?: string;
}

const MP_PAIRS: MPPair[] = [
  { en: 'apple', pl: 'jabłko', line: 'magenta' },
  { en: 'bread', pl: 'chleb', line: 'magenta' },
  { en: 'water', pl: 'woda', line: 'magenta' },
  { en: 'morning', pl: 'rano', line: 'violet' },
  { en: 'evening', pl: 'wieczór', line: 'violet' },
  { en: 'street', pl: 'ulica', line: 'amber' },
  { en: 'square', pl: 'plac', line: 'amber' },
  { en: 'bridge', pl: 'most', line: 'amber' },
];

const LINE_COLORS: Record<LineColor, string> = {
  magenta: '#E879F9',
  violet: '#A78BFA',
  amber: '#FBBF24',
};

// ─────────────────────────────────────────────────────────────────────────
// renderMatchingReviewItem — per-pair locked render for PracticeReview.
// Shows EN word + correct PL + the student's final attempted PL (with
// strikethrough if it was wrong) + a line-color/pattern marker on the left
// matching the metro-line categorisation in the live shell.
// ─────────────────────────────────────────────────────────────────────────
const MP_LINE_PATTERNS: Record<LineColor, string> = {
  magenta: 'solid',
  violet: 'dashed',
  amber: 'dotted',
};
export function renderMatchingReviewItem(
  pair: MPPair,
  wrongAttempt: { studentAnswer: string; correctAnswer: string } | undefined,
): React.ReactNode {
  const lineColor = LINE_COLORS[pair.line];
  const wasWrong = !!wrongAttempt;
  const studentPL = wrongAttempt?.studentAnswer;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '6px 1fr', gap: 12,
      padding: '12px 14px',
      background: wasWrong
        ? 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(167,139,250,0.06), rgba(20,16,42,0.55))',
      border: `1px solid ${wasWrong ? 'rgba(251,113,133,0.35)' : `${lineColor}55`}`,
      borderRadius: 8,
      position: 'relative',
    }}>
      {/* Metro line color/pattern marker — left rail, full height */}
      <div aria-hidden style={{
        background: lineColor,
        borderRadius: 3,
        // Express the dash pattern as a vertical-repeating gradient so it
        // mirrors the live-shell line styling without a literal SVG.
        backgroundImage:
          MP_LINE_PATTERNS[pair.line] === 'dashed'
            ? `repeating-linear-gradient(180deg, ${lineColor} 0 6px, transparent 6px 10px)`
            : MP_LINE_PATTERNS[pair.line] === 'dotted'
              ? `repeating-linear-gradient(180deg, ${lineColor} 0 3px, transparent 3px 7px)`
              : `linear-gradient(180deg, ${lineColor}, ${lineColor})`,
        boxShadow: `0 0 6px ${lineColor}66`,
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--em-decor)', fontSize: 17, fontWeight: 700,
            color: 'var(--em-text, #EDE6FF)',
            letterSpacing: '0.04em',
          }}>
            {pair.en}
          </span>
          <span style={{
            fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
            color: lineColor, textTransform: 'uppercase',
          }}>
            {pair.line} · {MP_LINE_PATTERNS[pair.line]}
          </span>
          <span style={{
            fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.16em',
            padding: '2px 8px', borderRadius: 999,
            background: wasWrong ? 'rgba(251,113,133,0.18)' : 'rgba(52,211,153,0.18)',
            color: wasWrong ? '#FB7185' : '#34D399',
            fontWeight: 700,
          }}>
            {wasWrong ? '✗ MISMATCHED · NIE' : '✓ PAIRED · TAK'}
          </span>
        </div>
        {/* Student's final attempt — strikethrough if wrong */}
        {wasWrong && studentPL ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(245,239,255,0.5)' }}>
              YOUR PICK · TWÓJ WYBÓR
            </span>
            <span style={{
              color: '#FB7185', textDecoration: 'line-through',
              fontFamily: 'var(--em-decor)', fontWeight: 600,
            }}>
              {studentPL}
            </span>
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(245,239,255,0.5)' }}>
            ✓ ANSWER · ODPOWIEDŹ
          </span>
          <span style={{ color: '#34D399', fontFamily: 'var(--em-decor)', fontWeight: 700 }}>
            {pair.pl}
          </span>
        </div>
      </div>
    </div>
  );
}

export const MatchingShell: React.FC<MatchingShellProps> = ({ time = 'night', state: forcedState = null, puzzle, onWrongAnswer, onSessionComplete }) => {
  // Kelly Tier-2 (2026-05-02): defensive props guard.
  const propsInvalid = !forcedState && puzzle !== undefined && (!puzzle.pairs || puzzle.pairs.length === 0);
  const allPairs: MPPair[] = puzzle && puzzle.pairs.length > 0 ? puzzle.pairs : MP_PAIRS;
  // Mike 2026-05-03: matching is a metro-line-at-a-time game. Each line is its
  // own STAGE; player matches that line's 3 pairs → auto-advances to the next
  // line. Previously activePairs = ALL 9 pairs across 3 lines, which made
  // "stage" complete confusing — magenta line lit up but violet + amber were
  // off-screen and the round never appeared to advance.
  const linesAvailable = useMemo(() => {
    const seen = new Set<string>();
    const out: LineColor[] = [];
    for (const p of allPairs) {
      if (!seen.has(p.line)) { seen.add(p.line); out.push(p.line); }
    }
    return out;
  }, [allPairs]);
  const [stageIdx, setStageIdx] = useState(0);
  const currentLine = linesAvailable[stageIdx] ?? linesAvailable[0];
  const activePairs: MPPair[] = useMemo(
    () => allPairs.filter((p) => p.line === currentLine),
    [allPairs, currentLine],
  );
  const totalStages = linesAvailable.length;
  const [matches, setMatches] = useState<MPMatches>({});

  // Auto-save progress as pairs are matched.
  useEffect(() => {
    if (forcedState) return;
    const total = activePairs.length;
    const matchedCount = Object.keys(matches).length;
    persisted.save({ progress: matchedCount / total, lastState: matchedCount === total ? 'complete' : 'active' });
    if (matchedCount === total) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [Object.keys(matches).length, forcedState]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'matching',
      brief: 'Tap an English chip, then tap its Polish translation.',
      brief_pl: 'Stuknij angielski kafelek, potem polskie tłumaczenie.',
      detail: 'Two columns of chips wait at the platform — English on one side, Polish on the other. Tap one chip to select it, then tap its translation. A correct pair locks together; a wrong pair shakes and unlocks. Match every pair to start every train.',
      detail_pl: 'Dwie kolumny kafelków czekają na peronie — angielski po jednej stronie, polski po drugiej. Stuknij jeden kafelek, aby go zaznaczyć, potem stuknij jego tłumaczenie. Poprawna para się łączy; błędna trzęsie i odblokowuje. Dopasuj wszystkie pary, aby ruszyły wszystkie pociągi.',
      fullInstructions: MATCHING_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);
  // Persisted progress (skipped when forcedState is set for design-canvas demos).
  const persisted = useShellProgress('matching');
  const [selected, setSelected] = useState<MPSelected | null>(null);
  const [wrong, setWrong] = useState<MPWrong | null>(null);

  // Layer-4 (EM-040): accumulate wrong pairings during the session and fire
  // onWrongAnswer ONCE at end-of-shell (in the completion effect below) so
  // the InterferenceTip overlay reads as a summary, not a mid-play nag.
  type WrongAttempt = {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  };
  const [wrongAttempts, setWrongAttempts] = useState<WrongAttempt[]>([]);
  const [tipFired, setTipFired] = useState(false);
  // D3-Matching (2026-05-02): single-fire guard for onSessionComplete.
  const sessionFiredRef = useRef(false);

  // EM-020 (Reviewer 1, 2026-04-30): real hint plumbing — reveal the first
  // unmatched pair for ~1.6s so the user sees the connection, then clears.
  // Counter increments only on actual reveals; disabled state once exhausted.
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [hintPair, setHintPair] = useState<{ en: string; pl: string } | null>(null);

  // Kelly Tier-2 (2026-05-02): focus-trap refs for the all-trains-running dialog.
  const newScheduleBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const useHint = () => {
    if (forcedState || hintsUsed >= 3) return;
    const next = activePairs.find((p) => !matches[p.en]);
    if (!next) return;
    setHintsUsed((h) => h + 1);
    setHintPair({ en: next.en, pl: next.pl });
    setTimeout(() => setHintPair(null), 1600);
  };

  const reset = () => {
    setMatches({});
    setSelected(null);
    setWrong(null);
    setWrongAttempts([]);
    setTipFired(false);
    setHintsUsed(0);
    setHintPair(null);
  };

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') {
      setMatches({});
      setSelected(null);
      setWrong(null);
    }
    if (forcedState === 'active') {
      const first = activePairs[0];
      setMatches({ [first.en]: first.pl });
      setSelected({ type: 'en', value: activePairs[1].en });
      setWrong(null);
    }
    if (forcedState === 'correct') {
      const a = activePairs[0];
      const b = activePairs[1];
      setMatches({ [a.en]: a.pl, [b.en]: b.pl });
      setSelected(null);
      setWrong(null);
    }
    if (forcedState === 'wrong') {
      setMatches({});
      setSelected(null);
      setWrong({ en: activePairs[0].en, pl: activePairs[2].pl });
    }
    if (forcedState === 'complete') {
      const all: MPMatches = {};
      activePairs.forEach((p) => {
        all[p.en] = p.pl;
      });
      setMatches(all);
      setSelected(null);
      setWrong(null);
    }
  }, [forcedState]);

  const onPick = (type: 'en' | 'pl', value: string) => {
    if (forcedState) return;
    if (matches[value] || Object.values(matches).includes(value)) return;

    if (!selected) {
      setSelected({ type, value });
      return;
    }
    if (selected.type === type) {
      setSelected({ type, value });
      return;
    }

    const en = type === 'en' ? value : selected.value;
    const pl = type === 'pl' ? value : selected.value;
    const correct = activePairs.find((p) => p.en === en)?.pl === pl;

    if (correct) {
      setMatches((m) => ({ ...m, [en]: pl }));
      setSelected(null);
    } else {
      setWrong({ en, pl });
      setSelected(null);
      setTimeout(() => setWrong(null), 700);
      // Layer-4 (EM-040): instead of firing onWrongAnswer immediately on
      // each mis-pair (which interrupts iterative play), accumulate the
      // wrong attempt. We fire ONCE at end-of-shell so the InterferenceTip
      // overlay reads as a summary.
      const correctPair = activePairs.find((p) => p.en === en);
      if (correctPair) {
        setWrongAttempts((prev) => {
          // D3-Matching (2026-05-02): when the same EN gets multiple wrong
          // PL picks, keep only the most-recent one so the review shows the
          // student's last (closest-to-correct) attempt, not their first.
          const idx = prev.findIndex((w) => w.questionId === en);
          const next = {
            questionId: en,
            studentAnswer: pl,
            correctAnswer: correctPair.pl,
            explanationPL: `${correctPair.en} = ${correctPair.pl}`,
            exerciseId: correctPair.exerciseId,
          };
          if (idx >= 0) {
            const out = [...prev];
            out[idx] = next;
            return out;
          }
          return [...prev, next];
        });
      }
    }
  };

  const lines: LineColor[] = ['magenta', 'violet', 'amber'];
  const lineY: Record<LineColor, number> = { magenta: 110, violet: 240, amber: 370 };

  const shuffledPL = useMemo<Record<LineColor, string[]>>(() => {
    const out: Record<LineColor, string[]> = { magenta: [], violet: [], amber: [] };
    lines.forEach((line) => {
      const pls = activePairs.filter((p) => p.line === line).map((p) => p.pl);
      const seed = line.length * 7 + 3;
      const r = pls.slice().sort((a, b) => ((a.charCodeAt(0) * seed) % 97) - ((b.charCodeAt(0) * seed) % 97));
      out[line] = r;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allMatched = Object.keys(matches).length === activePairs.length;

  // Layer-4 (EM-040): when the shell completes, surface the first wrong
  // attempt accumulated during play so the InterferenceTip overlay renders
  // as an end-of-shell summary. Guarded by tipFired so we only fire once.
  useEffect(() => {
    if (forcedState) return;
    if (!allMatched) return;
    if (tipFired) return;
    if (wrongAttempts.length === 0) return;
    if (!onWrongAnswer) return;
    onWrongAnswer(wrongAttempts[0]);
    setTipFired(true);
  }, [allMatched, tipFired, wrongAttempts, onWrongAnswer, forcedState]);

  // Mike 2026-05-03: when current line is fully matched, AUTO-ADVANCE to the
  // next line after a brief celebration window. Final line → fire session-
  // complete. Previously the shell waited for ALL 9 pairs across 3 lines
  // before any advance, which made the "round 3 of 9" progress look stuck
  // even after matching everything visible on the magenta line.
  useEffect(() => {
    if (forcedState) return;
    if (!allMatched) return;
    if (stageIdx + 1 < totalStages) {
      const id = window.setTimeout(() => {
        setStageIdx((i) => i + 1);
        setMatches({});
        setSelected(null);
        setWrong(null);
      }, 1200);
      return () => window.clearTimeout(id);
    }
  }, [allMatched, stageIdx, totalStages, forcedState]);

  // D3-Matching (2026-05-02): fire onSessionComplete ONCE when every pair on
  // EVERY stage is matched. Matching has no per-pair skip path (Skip is
  // destructive), so the only completion route is "all stages cleared."
  useEffect(() => {
    if (forcedState) return;
    if (!allMatched) return;
    if (stageIdx + 1 < totalStages) return; // not on final stage yet
    if (sessionFiredRef.current) return;
    if (!onSessionComplete) return;
    sessionFiredRef.current = true;
    const wrongIds = new Set(wrongAttempts.map((w) => w.questionId));
    const cleanCount = allPairs.filter((p) => !wrongIds.has(p.en)).length;
    onSessionComplete({
      correctCount: cleanCount,
      totalQuestions: allPairs.length,
      wrongAttempts: [...wrongAttempts],
      puzzle: { pairs: allPairs },
    });
  }, [allMatched, stageIdx, totalStages, forcedState, onSessionComplete, wrongAttempts, allPairs]);

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the all-trains-running dialog.
  useEffect(() => {
    if (!allMatched) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const focusId = window.setTimeout(() => { newScheduleBtnRef.current?.focus(); }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        newScheduleBtnRef.current?.focus();
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
  }, [allMatched]);

  const stationX = (idx: number, total: number) => 110 + (idx + 1) * (700 / (total + 1));

  const liveStatus = allMatched
    ? 'All matches complete. Every train is running.'
    : wrong
      ? 'Mismatched pair. Try again.'
      : selected
        ? `Selected ${selected.value}. Now choose its match.`
        : '';

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div
      className="em-shell em-shell-matching"
      role="application"
      aria-label="Matching pairs game, Metro Network"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {liveStatus}
      </div>
      <div style={{
        position: 'absolute', inset: 0, background:
          time === 'day'
            ? 'linear-gradient(180deg, #2D1F4A 0%, #6E4FB8 100%)'
            : time === 'dusk'
              ? 'linear-gradient(180deg, #110A22 0%, #2A1450 100%)'
              : 'linear-gradient(180deg, #06031A 0%, #110828 100%)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.06, backgroundImage:
          'linear-gradient(0deg, #fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
        backgroundSize: '60px 30px',
      }} />
      <div className="em-grain" style={{ position: 'absolute', inset: 0 }} />

      <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, zIndex: 5 }}>
        <AmbientAudioPlayer shellSlug="matching" />
        <Nameplate
          district="The Bridge District"
          subtitle="The Metro · Matching pairs · Pary"
          accent="#E879F9"
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="6" cy="11" r="3" stroke="#E879F9" strokeWidth="1.6" /><circle cx="16" cy="11" r="3" stroke="#7DD3FC" strokeWidth="1.6" /><line x1="9" y1="11" x2="13" y2="11" stroke="#fff" strokeWidth="1.6" /></svg>}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* TODO (EM-041 follow-up): SkipButton currently calls `reset` (wipes matches),
              which is destructive — a Skip should advance, not undo. And `current` only
              reflects correct matches, so users can't tell skipped pairs apart. Add a
              `seenCount` state for matches that were either correctly paired OR explicitly
              skipped, then pass seen={seenCount} to <Progress>. Probably also rename the
              SkipButton handler to a `revealAndSkip()` that fills in one correct pair and
              counts it as skipped. — Builder 7, 2026-04-30 */}
          <Progress current={Object.keys(matches).length} total={activePairs.length} accent="#E879F9" />
          <SkipButton onClick={reset} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      {/* 2026-05-01 (CD re-audit): mobile fallback. The SVG metro layout
          compresses to ~50% scale at 400px viewport and chips collide.
          We render an HTML stacked grid alongside; CSS toggles which one
          is visible per breakpoint (.em-mp-desktop default, .em-mp-mobile
          shown at ≤768px). Both share the same React state so onPick,
          matches, selected, hint reveal etc. all work in either view. */}
      <div className="em-mp-mobile" role="region" aria-label="Matching pairs (stacked)" style={{ position: 'absolute', top: 90, left: 16, right: 16, bottom: 110, overflowY: 'auto', display: 'none' }}>
        {lines.map((line) => {
          const enList = activePairs.filter((p) => p.line === line).map((p) => p.en);
          const plList = shuffledPL[line];
          const color = LINE_COLORS[line];
          if (enList.length === 0) return null;
          return (
            <div key={line} className="em-mp-mline" style={{ marginBottom: 18 }}>
              <div className="em-eyebrow" style={{ color, marginBottom: 8, fontSize: 10, letterSpacing: '0.18em' }}>
                {line.toUpperCase()} LINE · {enList.length} STATIONS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {enList.map((en) => {
                    const matched = !!matches[en];
                    const isSel = selected?.type === 'en' && selected.value === en;
                    const isWrong = wrong?.en === en;
                    return (
                      <button
                        key={en}
                        type="button"
                        onClick={() => !matched && onPick('en', en)}
                        aria-pressed={isSel}
                        aria-disabled={matched}
                        aria-label={`English: ${en}${matched ? ', matched' : isSel ? ', selected' : ''}`}
                        style={{
                          background: matched ? color : isSel ? color : 'transparent',
                          border: `2px solid ${color}${matched || isSel ? '' : '88'}`,
                          color: matched || isSel ? '#0E0A1A' : '#EDE6FF',
                          padding: '10px 14px', minHeight: 44, flex: '1 1 30%',
                          fontFamily: 'var(--em-mono)', fontSize: 12,
                          letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase',
                          cursor: matched ? 'default' : 'pointer', borderRadius: 8,
                          opacity: matched ? 0.85 : 1,
                          animation: isWrong ? 'em-shake 0.4s var(--em-ease)' : 'none',
                          transition: 'all 200ms var(--em-ease)',
                        }}
                      >{en}</button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {plList.map((pl) => {
                    const matched = Object.values(matches).includes(pl);
                    const isSel = selected?.type === 'pl' && selected.value === pl;
                    const isWrong = wrong?.pl === pl;
                    return (
                      <button
                        key={pl}
                        type="button"
                        onClick={() => !matched && onPick('pl', pl)}
                        aria-pressed={isSel}
                        aria-disabled={matched}
                        aria-label={`Polish: ${pl}${matched ? ', matched' : isSel ? ', selected' : ''}`}
                        style={{
                          background: matched ? `${color}33` : isSel ? color : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${color}${isSel ? '' : '55'}`,
                          color: matched ? color : isSel ? '#0E0A1A' : '#EDE6FF',
                          // Kelly Tier-2 audit (2026-05-02): chip texts like
                          // "odporność, wytrzymałość," and "przewlekły b"
                          // were truncated. Allow wrap, set min-width 110px,
                          // remove max-width clipping, fall back to natural
                          // height instead of a fixed minHeight.
                          padding: '10px 14px', minHeight: 44, minWidth: 110,
                          maxWidth: 'none', flex: '1 1 auto',
                          whiteSpace: 'normal', wordBreak: 'break-word',
                          lineHeight: 1.25,
                          fontFamily: 'var(--em-body)', fontSize: 13, fontStyle: 'italic',
                          cursor: matched ? 'default' : 'pointer', borderRadius: 8,
                          textAlign: 'center',
                          animation: isWrong ? 'em-shake 0.4s var(--em-ease)' : 'none',
                          transition: 'all 200ms var(--em-ease)',
                        }}
                      >{pl}</button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <svg
        className="em-mp-desktop"
        viewBox="0 0 800 500"
        preserveAspectRatio="xMidYMid meet"
        role="grid"
        aria-label="Metro line stations. Click an English station then a Polish station to match them."
        style={{ position: 'absolute', top: 90, left: 24, right: 'calc(min(280px, 22%) + 12px)', bottom: 100, width: 'calc(100% - 48px - min(280px, 22%) - 12px)', height: 'calc(100% - 190px)' }}
      >
        {/* Kelly Tier-2 (2026-05-02): color-blind safe — each metro line gets
            both a unique colour AND a unique stroke-dasharray pattern so users
            with red-green colour deficiency can still tell the lines apart.
            Pattern cycle (mod 4): solid → dashed → dotted → long-dash. */}
        {lines.map((line, lineIdx) => {
          const dashPatterns = ['0', '6 4', '2 3', '10 4 2 4'];
          const dash = dashPatterns[lineIdx % 4];
          return (
            <path
              key={line}
              d={`M 80 ${lineY[line]} L 720 ${lineY[line]}`}
              stroke={LINE_COLORS[line]}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity="0.75"
            />
          );
        })}

        {Object.entries(matches).map(([en, pl]) => {
          const pair = activePairs.find((p) => p.en === en);
          if (!pair) return null;
          const line = pair.line;
          const enList = activePairs.filter((p) => p.line === line).map((p) => p.en);
          const enX = stationX(enList.indexOf(en), enList.length);
          const plX = stationX(shuffledPL[line].indexOf(pl), shuffledPL[line].length);
          const yTop = lineY[line];
          const yBottom = yTop + 60;
          // Kelly Tier-2 (2026-05-02): match the parent line's dash pattern
          // so the connection inherits the same colour-blind cue.
          const dashPatterns = ['0', '6 4', '2 3', '10 4 2 4'];
          const dash = dashPatterns[lines.indexOf(line) % 4];
          return (
            <path
              key={en}
              d={`M ${enX} ${yTop + 14} Q ${(enX + plX) / 2} ${yTop + 50} ${plX} ${yBottom - 14}`}
              stroke={LINE_COLORS[line]}
              strokeWidth="2.5"
              strokeDasharray={dash}
              fill="none"
              opacity="0.85"
              style={{ animation: 'em-rise 0.4s var(--em-ease)' }}
            />
          );
        })}

        {lines.map((line) => {
          const enList = activePairs.filter((p) => p.line === line).map((p) => p.en);
          const plList = shuffledPL[line];
          return (
            <g key={line}>
              {enList.map((en, i) => {
                const x = stationX(i, enList.length);
                const y = lineY[line];
                const matched = !!matches[en];
                const isSel = selected?.type === 'en' && selected.value === en;
                const isWrong = wrong?.en === en;
                const color = LINE_COLORS[line];
                const stateLabel = matched ? 'matched' : isSel ? 'selected' : isWrong ? 'wrong attempt' : 'unmatched';
                return (
                  <g
                    key={en}
                    role="button"
                    tabIndex={matched ? -1 : 0}
                    aria-label={`English station ${en}, ${stateLabel}`}
                    aria-pressed={isSel}
                    aria-disabled={matched}
                    style={{
                      cursor: matched ? 'default' : 'pointer',
                      animation: isWrong ? 'em-shake 0.4s var(--em-ease)' : 'none',
                    }}
                    onClick={() => !matched && onPick('en', en)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !matched) {
                        e.preventDefault();
                        onPick('en', en);
                      }
                    }}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r="18"
                      fill={matched ? color : isSel ? color : '#0E0A1A'}
                      stroke={color}
                      strokeWidth={isSel ? 4 : 3}
                      style={{
                        filter: isSel || matched ? `drop-shadow(0 0 12px ${color})` : 'none',
                        transition: 'all 220ms',
                      }}
                    />
                    {matched && <circle cx={x} cy={y} r="6" fill="#0E0A1A" />}
                    <text x={x} y={y - 32} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="11" letterSpacing="0.1em" fontWeight="700" fill={matched ? color : '#EDE6FF'}>
                      {en.toUpperCase()}
                    </text>
                  </g>
                );
              })}
              {plList.map((pl, i) => {
                const x = stationX(i, plList.length);
                const y = lineY[line] + 60;
                const matched = Object.values(matches).includes(pl);
                const isSel = selected?.type === 'pl' && selected.value === pl;
                const isWrong = wrong?.pl === pl;
                const color = LINE_COLORS[line];
                const stateLabel = matched ? 'matched' : isSel ? 'selected' : isWrong ? 'wrong attempt' : 'unmatched';
                // Ricky 2026-05-02: SVG <text> + <rect> truncation fix —
                // CD's audit caught "przewlekły b...", "odporność, wytrzymałość, zd...",
                // "szkoda, ujemny w..." mid-word cuts at desktop. Switched to
                // <foreignObject> with HTML div: auto width, word-wrap, no
                // dependence on character-counting heuristics.
                // Ricky 2026-05-03 (CD re-audit): "przewlekły ból, chroniczny b"
                // STILL truncating — bumped FO_W 200→260 and FO_H 56→72 to
                // accommodate two-line wrap of comma-separated PL alternatives,
                // and added explicit -webkit-line-clamp:2 + overflow:hidden on
                // the inner span so any third line is hidden cleanly with an
                // ellipsis instead of bleeding through to the next chip.
                const FO_W = 260;
                const FO_H = 72;
                return (
                  <g
                    key={pl}
                    role="button"
                    tabIndex={matched ? -1 : 0}
                    aria-label={`Polish station ${pl}, ${stateLabel}`}
                    aria-pressed={isSel}
                    aria-disabled={matched}
                    style={{
                      cursor: matched ? 'default' : 'pointer',
                      animation: isWrong ? 'em-shake 0.4s var(--em-ease)' : 'none',
                    }}
                    onClick={() => !matched && onPick('pl', pl)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !matched) {
                        e.preventDefault();
                        onPick('pl', pl);
                      }
                    }}
                  >
                    <foreignObject
                      x={x - FO_W / 2}
                      y={y - FO_H / 2}
                      width={FO_W}
                      height={FO_H}
                      style={{ overflow: 'visible' }}
                    >
                      <div
                        // @ts-expect-error xmlns on div inside foreignObject
                        xmlns="http://www.w3.org/1999/xhtml"
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <span
                          style={{
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 2,
                            maxWidth: '100%',
                            background: matched ? color : isSel ? color : '#0E0A1A',
                            border: `${isSel ? 2.5 : 1.5}px solid ${color}`,
                            borderRadius: 6,
                            padding: '4px 10px',
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontSize: 12,
                            fontStyle: 'italic',
                            fontWeight: 500,
                            lineHeight: 1.2,
                            color: matched ? '#0E0A1A' : isSel ? '#0E0A1A' : '#EDE6FF',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            textAlign: 'center',
                            boxShadow: isSel ? `0 0 8px ${color}` : 'none',
                            transition: 'all 220ms',
                            cursor: matched ? 'default' : 'pointer',
                          }}
                        >
                          {pl}
                        </span>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Ricky 2026-05-02 (audit #8): right-side dead-space killer.
          Desktop-only feature panel — "Today's metro lines" preview that
          surfaces line composition (count + matched/total per line) so the
          ~30% rectangular void Mike flagged is replaced by useful chrome.
          Mirrors the `.em-mp-desktop` visibility rule (hidden ≤768px). */}
      <aside
        className="em-mp-desktop"
        aria-label="Today's metro lines"
        style={{
          position: 'absolute',
          top: 90,
          right: 24,
          bottom: 100,
          width: 'min(280px, 22%)',
          padding: 16,
          background: 'linear-gradient(180deg, rgba(232,121,249,0.06), rgba(14,10,26,0.55))',
          border: '1px solid rgba(232,121,249,0.22)',
          borderRadius: 14,
          backdropFilter: 'blur(2px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          zIndex: 4,
          overflowY: 'auto',
        }}
      >
        <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#E879F9' }}>
          DZIŚ · TODAY · {activePairs.length} STATIONS
        </div>
        <div className="em-decor" style={{ fontSize: 18, color: 'var(--em-text)', lineHeight: 1.1 }}>
          Metro lines
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          {lines.map((line) => {
            const enList = activePairs.filter((p) => p.line === line).map((p) => p.en);
            if (enList.length === 0) return null;
            const matchedOnLine = enList.filter((en) => !!matches[en]).length;
            const color = LINE_COLORS[line];
            const dashPatterns: Record<LineColor, string> = { magenta: 'solid', violet: 'dashed', amber: 'dotted' };
            const pattern = dashPatterns[line];
            return (
              <div key={line} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.14em', color, textTransform: 'uppercase' }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}88` }} />
                    {line}
                  </span>
                  <span style={{ fontFamily: 'var(--em-mono)', fontSize: 11, color: 'var(--em-text-muted)' }}>
                    {matchedOnLine}/{enList.length}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(matchedOnLine / Math.max(1, enList.length)) * 100}%`, background: color, transition: 'width 320ms var(--em-ease)' }} />
                </div>
                <div style={{ fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--em-text-muted)', opacity: 0.8 }}>
                  {pattern} line · {enList.length} stations
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid rgba(232,121,249,0.18)', fontFamily: 'var(--em-body)', fontSize: 11, color: 'var(--em-text-muted)', lineHeight: 1.4 }}>
          Każda linia łączy stacje EN ze stacjami PL. Skojarz wszystkie pary, żeby uruchomić metro.
        </div>
      </aside>

      {hintPair && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute', top: 96, left: '50%', transform: 'translateX(-50%)',
            background: 'linear-gradient(180deg, rgba(232,121,249,0.18), rgba(167,139,250,0.10))',
            border: '1px solid rgba(232,121,249,0.45)', borderRadius: 14,
            padding: '10px 18px', color: 'var(--em-text)', fontSize: 13,
            zIndex: 8, boxShadow: '0 18px 36px -18px rgba(232,121,249,0.55)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em', color: '#E879F9' }}>HINT · PODPOWIEDŹ</span>
          <span><strong>{hintPair.en}</strong> ↔ <strong>{hintPair.pl}</strong></span>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, zIndex: 5 }}>
        <div style={{ flex: 1, maxWidth: 560 }}>
        </div>
        <button className="em-btn" onClick={reset} aria-label="Reset all matches">↻ Reset</button>
      </div>

      {allMatched && !onSessionComplete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-live="assertive"
          aria-label="Matching complete"
          style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at center, rgba(232,121,249,0.2), rgba(14,10,26,0.9))',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
            backdropFilter: 'blur(2px)', animation: 'em-rise 0.5s var(--em-ease)',
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 40, color: 'var(--em-text)' }}>All trains running.</div>
          <div style={{ color: 'var(--em-text-muted)', fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.2em' }}>
            {activePairs.length} STATIONS · {activePairs.length} PAIRS · WSZYSTKIE LINIE
          </div>
          <button ref={newScheduleBtnRef} className="em-btn em-btn-primary" onClick={reset} style={{ marginTop: 8 }}>Run a new schedule →</button>
        </div>
      )}
    </div>
  );
};

export default MatchingShell;
