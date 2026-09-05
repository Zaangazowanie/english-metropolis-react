import { lazy as wordLazy, Suspense as WordSuspense } from 'react';
const WordScene3D = wordLazy(() => import('../shells3d/WordMatching3D'));
import { shuffledTranslations } from './word-arcade-mechanics';
// Matching Pairs — Metro Network district.
// Click a station, then click its translation across lines.
// Successful matches glow with a connecting interchange curve.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { Confetti } from '../components/primitives';
import { WordMission, useWordArcade } from './word-arcade';
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
  const arcade = useWordArcade();
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
    const total = allPairs.length;
    const matchedCount = allPairs.filter(p => linesAvailable.indexOf(p.line) < stageIdx).length + Object.keys(matches).length;
    persisted.save({ progress: matchedCount / total, lastState: matchedCount === total ? 'complete' : 'active' });
    if (matchedCount === total) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [Object.keys(matches).length, stageIdx, forcedState]);

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
  const [memoryMode, setMemoryMode] = useState(false);
  const [scanning, setScanning] = useState(false);
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
    arcade.restart();
    sessionFiredRef.current = false;
    setStageIdx(0);
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

    arcade.answer(correct);
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




  const shuffledPL = useMemo(() => shuffledTranslations(activePairs), [activePairs]);

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
    arcade.complete();
    onSessionComplete({
      correctCount: cleanCount,
      totalQuestions: allPairs.length,
      wrongAttempts: [...wrongAttempts],
      puzzle: { pairs: allPairs },
    });
  }, [allMatched, stageIdx, totalStages, forcedState, onSessionComplete, wrongAttempts, allPairs]);

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the all-trains-running dialog.
  useEffect(() => {
    if (!allMatched || onSessionComplete || stageIdx + 1 < totalStages) return;
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

  const matchedTotal = allPairs.filter(p => linesAvailable.indexOf(p.line) < stageIdx).length + Object.keys(matches).length;
  return <div className="em-shell em-shell-matching wa-board">
    <header><AmbientAudioPlayer shellSlug="matching"/><Nameplate district="The Bridge District" subtitle="Signal Control · Połącz znaczenia" accent="#C4A1FF"/><div><Progress current={matchedTotal} total={allPairs.length} accent="#C4A1FF"/><HintButton onClick={useHint} used={hintsUsed} total={3}/></div></header>
    <WordMission kind="signals" current={matchedTotal} total={allPairs.length} chain={arcade.chain} reaction={arcade.reaction}/>
    <div className="wa-switch-stages">{linesAvailable.map((line,i)=><span key={line} className={i<stageIdx?'is-done':i===stageIdx?'is-active':''}>{i<stageIdx?'✓ ':''}Line {i+1} · {allPairs.filter(p=>p.line===line).length} signals</span>)}</div>
    <div className="wa-inline-tools"><button aria-pressed={memoryMode} onClick={()=>{setMemoryMode(v=>!v);setScanning(false);}}>Memory signals {memoryMode?'on':'off'}</button>{memoryMode && <button onClick={()=>setScanning(v=>!v)}>{scanning?'Hide translations':'Scan translations'}</button>}<span>{memoryMode?'Recall the hidden translations; scan whenever you need a reminder.':'Choose a word, then its translation.'}</span></div>
    <WordSuspense fallback={<p>Opening the 3D district…</p>}><WordScene3D key={currentLine} pairs={activePairs} translations={shuffledPL[currentLine]??[]} matches={matches} selected={selected} onPick={onPick} hidden={memoryMode&&!scanning} wrong={wrong?.en&&wrong?.pl?{en:wrong.en,pl:wrong.pl}:null}/></WordSuspense>
    <details><summary>Accessible signal controls</summary><div className="wa-switchboard">
      <div className="wa-signal-column"><small>ENGLISH · DEPARTURES</small>{activePairs.map((p,i)=><button key={p.en} disabled={!!matches[p.en]} aria-pressed={selected?.type==='en'&&selected.value===p.en} className={`wa-signal ${matches[p.en]?'is-matched':''} ${selected?.type==='en'&&selected.value===p.en?'is-selected':''} ${wrong?.en===p.en?'is-wrong':''} ${hintPair?.en===p.en?'is-hint':''}`} onClick={()=>onPick('en',p.en)}><i/><span>{p.en}</span>{matches[p.en]&&<span aria-label="matched">✓</span>}</button>)}</div>

      <div className="wa-signal-column"><small>POLSKI · ARRIVALS</small>{(shuffledPL[currentLine]??[]).map((pl,i)=>{const matched=Object.values(matches).includes(pl);const revealed=!memoryMode||scanning||matched||selected?.type==='pl'&&selected.value===pl||hintPair?.pl===pl;return <button key={pl} disabled={matched} aria-label={revealed?pl:`Hidden translation ${i+1}. Select to reveal.`} aria-pressed={selected?.type==='pl'&&selected.value===pl} className={`wa-signal ${matched?'is-matched':''} ${selected?.type==='pl'&&selected.value===pl?'is-selected':''} ${wrong?.pl===pl?'is-wrong':''} ${hintPair?.pl===pl?'is-hint':''}`} onClick={()=>onPick('pl',pl)}><i/><span>{revealed?pl:`Signal ${String(i+1).padStart(2,'0')} · ?`}</span>{matched&&<span aria-label="matched">✓</span>}</button>;})}</div>
    </div>
    </details><p className="wa-forge-readout" role="status">{allMatched ? stageIdx+1<totalStages?'Line clear. Dispatching the next train…':'Every signal connected. All trains can depart.' : liveStatus || 'Connect every signal on this line to dispatch the train.'}</p>
    {allMatched && stageIdx+1===totalStages && !onSessionComplete && <div className="wa-dialog" role="dialog" aria-modal="true" aria-label="All trains running"><Bajla size={84} mood="cheer" decorative/><h3>Network connected.</h3><p>{allPairs.length} signals restored.</p><button ref={newScheduleBtnRef} className="em-btn em-btn-primary" onClick={reset}>New dispatch →</button></div>}
    <Confetti show={allMatched}/>
  </div>;
};

export default MatchingShell;
