// Whack-a-Mole — "The Subway Mole" district.
//
// A subway platform at night. From the round station holes (manhole/access
// pits) pop up moles in conductor caps, each holding a word-card. The
// student is shown a prompt at the top and must tap the mole holding the
// matching answer before it ducks back down. Wrong tap → that mole dives.
//
// Rounds drive the prompt; per round the moles cycle their words from the
// round.options list, and one mole holds the answer.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import { maskAnswerInPrompt } from '../lib/exercise-adapters';
import { buildSafeHint } from '../lib/safeHint';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import type { FullInstructions } from '../components';

// Subway Mole · Whack-a-Mole — full bilingual instruction copy.
const WHACKAMOLE_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A sentence with a gap appears at the top — read it before any moles pop.',
      'Tap START to begin the round. Six subway access pits will start producing moles, each holding a word card.',
      'Tap the mole whose word fits the gap before it ducks back down — moles only stay up for ~1.5 seconds.',
      'Tap the wrong mole and it dives with a hiss; the round continues until you whack the right one or run out of pops.',
    ],
    pl: [
      'Zdanie z luką pojawia się u góry — przeczytaj je, zanim wyskoczą krety.',
      'Stuknij START, aby rozpocząć rundę. Z sześciu otworów będą wyskakiwać krety, każdy trzyma kartę ze słowem.',
      'Stuknij kreta, którego słowo pasuje do luki, zanim się schowa — krety są na wierzchu tylko ok. 1,5 sekundy.',
      'Stukniesz złego kreta — z syknięciem zniknie; runda trwa, aż trafisz właściwego lub skończą się wyskoki.',
    ],
  },
  controls: {
    en: [
      'Prompt strip: gap-fill sentence at the top of the platform.',
      'Six holes: numbered access pits arranged in a 3×2 grid; moles pop from each.',
      'START button: launches the mole-pop loop for the round.',
      'Service board (right panel): queued sentences with a NOW indicator showing your position.',
      'Skip + Hint buttons: Skip jumps round, Hint greys one wrong mole when it next pops.',
    ],
    pl: [
      'Pasek pytania: zdanie z luką u góry peronu.',
      'Sześć otworów: numerowane pułapki ułożone w siatce 3×2; z każdej wyskakują krety.',
      'Przycisk START: uruchamia pętlę wyskakiwania kretów dla rundy.',
      'Tablica serwisowa (panel z prawej): kolejka zdań ze wskaźnikiem NOW, pokazująca Twoją pozycję.',
      'Przyciski Pomiń i Podpowiedź: Pomiń przeskakuje rundę, Podpowiedź wyszarza jednego błędnego kreta przy następnym wyskoku.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right whack: ✓ green flash, mole tips its hat, +1 to your tally, next round queues.',
      'Wrong whack: ✗ rose flash, that mole dives, miss counter +1; the right mole keeps popping until you find it.',
      'Skip: counts as wrong — moves to the next round without a whack.',
      'If the round ends without a correct whack (rare), the answer reveals and the next round queues.',
    ],
    pl: [
      'Trafienie: ✓ zielony błysk, kret unosi czapkę, +1 do wyniku, następna runda w kolejce.',
      'Pudło: ✗ różowy błysk, ten kret się chowa, licznik pomyłek +1; właściwy kret wyskakuje dalej, aż go znajdziesz.',
      'Pomiń: liczy się jako błąd — przeskok do następnej rundy bez trafienia.',
      'Jeśli runda kończy się bez trafienia (rzadko), odpowiedź się ujawnia, a następna runda staje w kolejce.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Each tap greys out one wrong mole the next time it pops, so you can focus on the remaining options. Save them for fast rounds where moles cycle quickly.',
    pl:
      'Masz 3 podpowiedzi na sesję. Każde stuknięcie wyszarza jednego błędnego kreta przy następnym wyskoku, abyś skupił się na pozostałych opcjach. Zachowaj je na szybkie rundy, w których krety wyskakują często.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each correct whack adds to your session streak. Completing every round on the service board unlocks the post-shell review with explanations of any wrong picks.',
    pl:
      'Pomiń liczy się jako błąd. Każde celne trafienie buduje serię w sesji. Ukończenie wszystkich rund na tablicy odblokowuje przegląd po sesji z wyjaśnieniami błędów.',
  },
  l1Pattern: {
    en:
      'Visual-search + reading-speed drill. Polish learners often slow down on cognates that look similar but mean different things ("eventually" vs "ostatecznie"); the time-pressure forces fast, correct recognition.',
    pl:
      'Trening wzrokowo-językowy: szybkie czytanie i wybór. Polscy uczniowie zwalniają na pozornych podobieństwach („eventually" vs „ostatecznie"); presja czasu wymusza szybkie i trafne rozpoznanie.',
  },
};

export type ArcadeForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface ArcadeRound {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface ArcadePuzzle {
  rounds: ArcadeRound[];
}

// Right-panel HintCard answer-leak guard now lives in ../lib/safeHint
// (Ricky 2026-05-02, CD audit F5; consolidated 2026-05-03). Same contract:
// polish side is ALWAYS structural; english side keeps real multi-word
// definitions, falls back to structural when the EN clue is the PL gloss.

export interface WhackAMoleShellProps {
  time?: TimeOfDay;
  state?: ArcadeForcedState;
  puzzle?: ArcadePuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /** D3-WhackAMole (Ricky wave-4, 2026-05-02): per-round mole-hit review. */
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
    puzzle: ArcadePuzzle;
  }) => void;
}

const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'm1', prompt: 'Underground transit train',
      options: ['subway', 'bus', 'taxi', 'tram'], answerIndex: 0,
      hint: 'Runs through tunnels below the city.', hint_pl: 'metro' },
    { id: 'm2', prompt: 'Where you wait to board the train',
      options: ['platform', 'lobby', 'aisle', 'rooftop'], answerIndex: 0,
      hint: 'A long, raised walkway alongside the tracks.', hint_pl: 'peron' },
    { id: 'm3', prompt: 'A small ticket machine',
      options: ['kiosk', 'turnstile', 'cellar', 'spire'], answerIndex: 1,
      hint: 'Bars rotate after you tap your ticket.', hint_pl: 'kołowrót, bramka' },
    { id: 'm4', prompt: 'Stairway leading down to the trains',
      options: ['attic', 'staircase', 'cupola', 'balcony'], answerIndex: 1,
      hint: 'Steps going down. Often tiled.', hint_pl: 'schody' },
    { id: 'm5', prompt: 'Map of the train lines',
      options: ['ledger', 'menu', 'diagram', 'scroll'], answerIndex: 2,
      hint: 'Coloured lines, named stations.', hint_pl: 'schemat' },
  ],
};

const ACCENT = '#BEF264';
const HOLES = 6;
const POP_DURATION = 2400;   // ms a mole stays up (gives time to read + tap)
const ROUND_TIMEOUT = 45000; // ms before round auto-fails (long — recycling keeps spawning)
// Mike playtest fix (Ricky 2026-05-02): without recycling, after the first
// wave of moles ducks (~2.5s) the platform goes empty for ~6.5s waiting on
// ROUND_TIMEOUT. Mike's screenshot showed all 6 holes empty — exactly that
// dead window. Add an interval that re-pops the SAME options in (possibly
// new) holes every RESPAWN_INTERVAL ms until the round resolves.
const RESPAWN_INTERVAL = 1800; // ms between consecutive mole pops once recycling
const FIRST_POP_DELAY = 250;   // ms before the very first mole rises after START

interface MoleSlot {
  holeIdx: number;
  word: string;
  isAnswer: boolean;
  state: 'down' | 'rising' | 'up' | 'falling' | 'whacked' | 'missed';
  spawnedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────
// renderWhackAMoleReviewItem — per-round locked render for PracticeReview.
// Mole-arcade scoreboard: round number + question + 4 mole tiles with
// student's hit + correct mole highlighted.
// ─────────────────────────────────────────────────────────────────────────
const WAM_REVIEW_ACCENT = '#BEF264';
export function renderWhackAMoleReviewItem(
  round: ArcadeRound,
  roundNumber: number,
  studentAnswer: string | undefined,
): React.ReactNode {
  const correct = round.options[round.answerIndex];
  const stu = studentAnswer ?? '';
  const isWrong = stu.length > 0 && stu !== correct;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: isWrong
        ? 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(190,242,100,0.06), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(190,242,100,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${WAM_REVIEW_ACCENT}22`, color: WAM_REVIEW_ACCENT,
          border: `1px solid ${WAM_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          MOLE {String(roundNumber).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(190,242,100,0.22)',
          color: isWrong ? '#FB7185' : '#BEF264',
        }}>
          {isWrong ? '✗ MISSED · CHYBIONE' : '✓ WHACKED · TRAFIONE'}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--em-decor)', fontSize: 16, lineHeight: 1.3,
        color: 'var(--em-text, #EDE6FF)',
      }}>{round.prompt}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {round.options.map((opt, oi) => {
          const isCorrect = oi === round.answerIndex;
          const wasPicked = stu === opt;
          const showCorrect = isCorrect;
          const showWrong = wasPicked && !isCorrect;
          return (
            <div key={oi} style={{
              padding: '8px 12px', borderRadius: 6,
              background: showCorrect
                ? 'rgba(190,242,100,0.20)'
                : showWrong
                  ? 'rgba(251,113,133,0.18)'
                  : 'rgba(245,239,255,0.04)',
              border: `1px solid ${showCorrect ? '#BEF26488' : showWrong ? '#FB718588' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? '#BEF264' : showWrong ? '#FB7185' : 'var(--em-text, #EDE6FF)',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ flex: 1 }}>{opt}</span>
              {showCorrect && <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10 }}>✓ TAK</span>}
              {showWrong && <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10 }}>✗ NIE</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const WhackAMoleShell: React.FC<WhackAMoleShellProps> = ({
  time = 'night',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const activePuzzle: ArcadePuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : DEMO_PUZZLE;
  const persisted = useShellProgress('whackamole');

  const [roundIdx, setRoundIdx] = useState(0);
  const [solved, setSolved] = useState<boolean[]>(() => activePuzzle.rounds.map(() => false));
  const [moles, setMoles] = useState<MoleSlot[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintHole, setHintHole] = useState<number | null>(null);
  const [missCount, setMissCount] = useState(0);
  const [bajlaShake, setBajlaShake] = useState(false);
  // First-impression fix (Ricky 2026-05-02, CD audit §5 Subway Mole):
  // moles spawn on staggered timers, so on first mount the platform reads as
  // 6 empty holes for ~220ms+ — confusing first-impression. We gate spawn
  // behind an explicit START overlay that shows the prompt + a one-line
  // explainer so the user knows what to do BEFORE the first mole rises.
  const [started, setStarted] = useState(false);
  const roundTimerRef = useRef<number | null>(null);
  const moleTimersRef = useRef<number[]>([]);

  const cur = activePuzzle.rounds[roundIdx];
  const completed = solved.every(Boolean);
  const correctCount = solved.filter(Boolean).length;
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount,
        totalQuestions: activePuzzle.rounds.length,
        wrongAttempts,
        puzzle: activePuzzle,
      });
    } : undefined,
  });

  // Per-shell answer-leak guard (Ricky 2026-05-02, CD audit §5 #19).
  // Whack-a-Mole is a word-tile shell — the answer literally appears on a
  // mole-card, so the prompt must mask the answer (and morphological
  // variants) so the student can't read it off the prompt. Belt-and-
  // suspenders alongside A3's adapter pass.
  const maskedPrompt = useMemo(
    () => (cur ? maskAnswerInPrompt(cur.prompt, cur.options[cur.answerIndex]) : ''),
    [cur],
  );

  useEffect(() => {
    if (forcedState) return;
    const done = solved.filter(Boolean).length;
    persisted.save({ progress: done / activePuzzle.rounds.length, lastState: completed ? 'complete' : 'active' });
    if (completed) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [solved, completed, forcedState]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'whackamole',
      brief: 'Tap the mole holding the right word before it ducks back down.',
      brief_pl: 'Stuknij kreta z właściwym słowem, zanim schowa się z powrotem.',
      detail: 'Moles pop up from the subway platform, each holding a word. Read the prompt, then tap only the mole carrying the right answer. Wrong taps cost a point; let the right mole duck and you miss the round. Watch every mole — the right one isn\'t always first up.',
      detail_pl: 'Krety wyskakują z peronu metra, każdy z innym słowem. Przeczytaj polecenie, a potem stuknij TYLKO kreta z poprawną odpowiedzią. Złe stuknięcia kosztują punkt; jeśli właściwy kret zniknie, runda przepada. Patrz na wszystkich kretów — właściwy nie zawsze wyskakuje pierwszy.',
      fullInstructions: WHACKAMOLE_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  const cleanup = useCallback(() => {
    if (roundTimerRef.current) window.clearTimeout(roundTimerRef.current);
    moleTimersRef.current.forEach(t => window.clearTimeout(t));
    moleTimersRef.current = [];
    roundTimerRef.current = null;
  }, []);

  // Mike playtest fix (Ricky 2026-05-02): popOnce schedules a single mole's
  // rise → up → fall → down lifecycle, then auto-clears its 'down' state so
  // the recycling loop can re-pop the same slot. Extracted so both the
  // initial wave AND the recurring respawn-interval call it.
  const popOneMole = useCallback((slotIdx: number) => {
    setMoles(prev => prev.map((s, idx) => {
      if (idx !== slotIdx) return s;
      if (s.state !== 'down') return s; // skip: already up / whacked / falling
      return { ...s, state: 'rising', spawnedAt: Date.now() };
    }));
    const upT = window.setTimeout(() => {
      setMoles(prev => prev.map((s, idx) => idx === slotIdx && s.state === 'rising' ? { ...s, state: 'up' } : s));
    }, 280);
    moleTimersRef.current.push(upT);

    // After POP_DURATION, duck back down (unless whacked).
    const downT = window.setTimeout(() => {
      setMoles(prev => prev.map((s, idx) => {
        if (idx !== slotIdx) return s;
        if (s.state === 'whacked') return s;
        return { ...s, state: 'falling' };
      }));
      const hideT = window.setTimeout(() => {
        setMoles(prev => prev.map((s, idx) => idx === slotIdx && s.state === 'falling' ? { ...s, state: 'down' } : s));
      }, 260);
      moleTimersRef.current.push(hideT);
    }, POP_DURATION);
    moleTimersRef.current.push(downT);
  }, []);

  const spawnMoles = useCallback(() => {
    cleanup();
    if (forcedState) return;
    if (!cur) return;
    const opts = cur.options;
    // Build a list: every option appears at most once, randomly placed in
    // distinct holes, including the answer.
    const indices = Array.from({ length: HOLES }, (_, i) => i);
    // Shuffle holes.
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const placements: MoleSlot[] = opts.map((opt, oi) => ({
      holeIdx: indices[oi % HOLES],
      word: opt,
      isAnswer: oi === cur.answerIndex,
      state: 'down',
      spawnedAt: 0,
    }));
    setMoles(placements);
    setFeedback(null);
    setMissCount(0);

    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[WhackAMole] spawnMoles round', cur.id, 'placements', placements.length);
    }

    // Initial wave — stagger first pop-ups so the platform fills smoothly.
    placements.forEach((_, i) => {
      const popDelay = FIRST_POP_DELAY + i * 380 + Math.random() * 180;
      const popT = window.setTimeout(() => popOneMole(i), popDelay);
      moleTimersRef.current.push(popT);
    });

    // Recycling interval — every RESPAWN_INTERVAL ms, find a slot that's
    // currently 'down' and re-pop it. This keeps the platform alive after
    // the initial wave ducks back down. Reshuffles the holeIdx on each
    // re-pop so the same word doesn't always emerge from the same hole.
    const initialWaveLastDelay = FIRST_POP_DELAY + (placements.length - 1) * 380 + 180;
    const recycleStart = initialWaveLastDelay + POP_DURATION + 400;
    const recycleT = window.setTimeout(() => {
      const tick = (): void => {
        // Bail if cleaned up.
        if (moleTimersRef.current.length === 0 && roundTimerRef.current === null) return;
        // Re-shuffle holes for the next slot to vary placement.
        setMoles(prev => {
          // Find the first slot that's 'down' and has not been whacked.
          const downIdx = prev.findIndex(s => s.state === 'down');
          if (downIdx < 0) return prev;
          // Pick a hole different from currently-occupied ones.
          const occupied = new Set(prev.filter(s => s.state !== 'down').map(s => s.holeIdx));
          const free = Array.from({ length: HOLES }, (_, h) => h).filter(h => !occupied.has(h));
          const newHole = free.length > 0
            ? free[Math.floor(Math.random() * free.length)]
            : prev[downIdx].holeIdx;
          // Schedule the actual pop on the next microtask so the holeIdx
          // commit lands first (avoids a frame where two moles share a hole).
          window.setTimeout(() => popOneMole(downIdx), 0);
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.log('[WhackAMole] recycle slot', downIdx, 'word', prev[downIdx].word, 'newHole', newHole);
          }
          return prev.map((s, i) => i === downIdx ? { ...s, holeIdx: newHole } : s);
        });
        const nextT = window.setTimeout(tick, RESPAWN_INTERVAL);
        moleTimersRef.current.push(nextT);
      };
      tick();
    }, recycleStart);
    moleTimersRef.current.push(recycleT);

    // Round-level fail-safe (very long — recycling normally keeps moles
    // popping until the student answers or skips).
    roundTimerRef.current = window.setTimeout(() => {
      setMoles(prev => prev.map(s => s.state === 'up' || s.state === 'rising' ? { ...s, state: 'missed' } : s));
      setBajlaShake(true);
      window.setTimeout(() => setBajlaShake(false), 480);
    }, ROUND_TIMEOUT);
  }, [cur, cleanup, forcedState, popOneMole]);

  // Spawn moles when round changes — but ONLY after the user taps START
  // (first-impression fix, see `started` declaration above). Once started,
  // each subsequent round auto-spawns as before.
  // Mike playtest fix (Ricky 2026-05-03): deps deliberately exclude
  // `spawnMoles`/`cleanup` — both are useCallbacks whose references churn
  // when parent passes a freshly-built puzzle prop (vocabPuzzle useMemo
  // recomputes when freshSentenceMap async-resolves), which was tearing
  // the spawn loop down every parent re-render. Trigger only on the real
  // state transitions: round change or START.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (forcedState) return;
    if (!started) return;
    spawnMoles();
    return cleanup;
  }, [roundIdx, started, forcedState]);

  useEffect(() => () => cleanup(), [cleanup]);

  useEffect(() => {
    if (forcedState === 'empty') { setSolved(activePuzzle.rounds.map(() => false)); setMoles([]); }
    if (forcedState === 'active') {
      setMoles(cur.options.map((opt, oi) => ({
        holeIdx: oi % HOLES, word: opt,
        isAnswer: oi === cur.answerIndex,
        state: 'up', spawnedAt: 0,
      })));
    }
    if (forcedState === 'correct') { setFeedback('correct'); }
    if (forcedState === 'wrong') { setFeedback('wrong'); }
    if (forcedState === 'complete') { setSolved(activePuzzle.rounds.map(() => true)); }
  }, [forcedState]);

  const whack = (moleIdx: number): void => {
    if (forcedState) return;
    const m = moles[moleIdx];
    if (!m || (m.state !== 'up' && m.state !== 'rising')) return;
    const isCorrect = m.isAnswer;
    setMoles(prev => prev.map((s, i) => i === moleIdx ? { ...s, state: 'whacked' } : s));
    if (isCorrect) {
      setFeedback('correct');
      setSolved(prev => prev.map((v, i) => i === roundIdx ? true : v));
      cleanup();
      window.setTimeout(() => {
        if (roundIdx + 1 < activePuzzle.rounds.length) {
          setRoundIdx(i => i + 1);
        }
      }, 1200);
    } else {
      setFeedback('wrong');
      setMissCount(c => c + 1);
      setBajlaShake(true);
      window.setTimeout(() => setBajlaShake(false), 480);
      tip.recordWrong({
        questionId: cur.id,
        studentAnswer: m.word,
        correctAnswer: cur.options[cur.answerIndex],
        explanationPL: cur.hint_pl,
        exerciseId: cur.exerciseId,
      });
      window.setTimeout(() => setFeedback(null), 800);
      // Mike playtest fix (Ricky 2026-05-02): reset the wrong-tapped mole's
      // slot to 'down' after the whack animation, so the recycling loop can
      // re-pop it (possibly the SAME word, possibly the answer) without the
      // slot being permanently "whacked"-locked.
      window.setTimeout(() => {
        setMoles(prev => prev.map((s, i) => i === moleIdx && s.state === 'whacked' ? { ...s, state: 'down' } : s));
      }, 600);
    }
  };

  const useHint = (): void => {
    if (hintsUsed >= 3) return;
    const answerMole = moles.find(m => m.isAnswer);
    if (!answerMole) return;
    setHintHole(answerMole.holeIdx);
    setHintsUsed(h => h + 1);
    window.setTimeout(() => setHintHole(null), 2400);
  };

  const skipRound = (): void => {
    cleanup();
    if (roundIdx + 1 < activePuzzle.rounds.length) setRoundIdx(i => i + 1);
  };

  const reset = (): void => {
    setRoundIdx(0);
    setSolved(activePuzzle.rounds.map(() => false));
    setMoles([]);
    setFeedback(null);
    setHintsUsed(0);
    setMissCount(0);
    setStarted(false);
    tip.reset();
  };

  const grad = time === 'day'
    ? 'linear-gradient(180deg, #4F2A6F 0%, #1A0E36 100%)'
    : 'linear-gradient(180deg, #02010C 0%, #0F0824 50%, #1F0E3A 100%)';

  // Hole grid layout — 2 rows x 3 holes for desktop.
  const holePositions: { x: number; y: number }[] = [
    { x: 18, y: 30 }, { x: 50, y: 22 }, { x: 82, y: 30 },
    { x: 18, y: 70 }, { x: 50, y: 78 }, { x: 82, y: 70 },
  ];

  const liveStatus = completed
    ? 'The platform clears. All rounds done.'
    : feedback === 'correct'
      ? 'Correct mole.'
      : feedback === 'wrong'
        ? 'Wrong mole. The right one is still up.'
        : '';

  return (
    <div
      className="em-shell em-shell-whackamole"
      role="application"
      aria-label="Whack-a-mole practice, the Subway Mole"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <style>{`
        @keyframes em-mole-rise {
          0% { transform: translateY(100%) scaleY(0.7); }
          70% { transform: translateY(-10%) scaleY(1.08); }
          100% { transform: translateY(0%) scaleY(1); }
        }
        @keyframes em-mole-fall {
          0% { transform: translateY(0%) scaleY(1); }
          100% { transform: translateY(100%) scaleY(0.7); }
        }
        @keyframes em-mole-whacked {
          0% { transform: translateY(0%) scaleY(1) scaleX(1); }
          30% { transform: translateY(-8%) scaleY(0.6) scaleX(1.4); }
          100% { transform: translateY(120%) scaleY(0.4) scaleX(1.2); opacity: 0.4; }
        }
        @keyframes em-mole-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes em-hole-pulse {
          0%, 100% { box-shadow: inset 0 6px 20px rgba(0,0,0,0.95), 0 0 0px ${ACCENT}00; }
          50% { box-shadow: inset 0 6px 20px rgba(0,0,0,0.95), 0 0 24px ${ACCENT}aa; }
        }
        @keyframes em-mole-rise-anim {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes em-train-go {
          0% { transform: translateX(-200%); opacity: 0; }
          25% { opacity: 0.45; }
          75% { opacity: 0.45; }
          100% { transform: translateX(0%); opacity: 0; }
        }
        @keyframes em-bajla-shake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-6deg); }
          75% { transform: rotate(6deg); }
        }
        @media (max-width: 768px) {
          .em-wam-side { display: none !important; }
          .em-wam-layout { grid-template-columns: 1fr !important; padding: 16px !important; }
          .em-wam-hole { min-width: 64px !important; min-height: 64px !important; }
        }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{liveStatus}</div>

      {/* Subway scene */}
      <div style={{ position: 'absolute', inset: 0, background: grad }} />
      {/* Subway-tile pattern back wall — staggered cream brick (Ricky 2026-05-02,
          CD audit §5.5 quick-win): the previous thin-grid was indistinguishable
          from a generic dark gradient. Real subway tiling = wide cream-coloured
          rectangles offset row-by-row with darker grout lines, evoking metro
          station walls. Keeps opacity low so foreground holes remain readable. */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.22, pointerEvents: 'none',
        backgroundImage: `
          repeating-linear-gradient(90deg,
            rgba(255,248,229,0.10) 0 72px,
            rgba(0,0,0,0.45) 72px 74px),
          repeating-linear-gradient(0deg,
            transparent 0 30px,
            rgba(0,0,0,0.45) 30px 32px)`,
        backgroundSize: '74px 64px, 100% 64px',
      }} />
      {/* Half-row offset second layer to give the brick a staggered pattern */}
      <div style={{ position: 'absolute', inset: 0, top: 32, opacity: 0.22, pointerEvents: 'none',
        backgroundImage: `repeating-linear-gradient(90deg,
            transparent 0 36px,
            rgba(0,0,0,0.45) 36px 38px,
            transparent 38px 110px)`,
        backgroundSize: '110px 64px',
      }} />
      {/* Track tunnel light streak */}
      <div style={{
        position: 'absolute', bottom: '8%', left: 0, right: 0, height: 4,
        background: `linear-gradient(90deg, transparent 0%, ${ACCENT}55 50%, transparent 100%)`,
        animation: 'em-train-go 7s linear infinite',
        pointerEvents: 'none',
      }} />
      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div className="em-wam-layout" style={{
        position: 'relative', display: 'grid',
        gridTemplateColumns: '1.5fr 1fr', gap: 24, padding: 32,
        height: '100%', boxSizing: 'border-box',
      }}>
        <div className="em-card" style={{
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, #1B0F36 0%, #0A0518 100%)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--em-line)' }}>
            <AmbientAudioPlayer shellSlug="whackamole" />
            <Nameplate
              district="The Subway Mole"
              subtitle="Whack-a-Mole · Trafiaj krety · catch the right answer"
              accent={ACCENT}
              icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="14" r="6" stroke={ACCENT} strokeWidth="1.6" /><circle cx="9" cy="13" r="1" fill={ACCENT} /><circle cx="13" cy="13" r="1" fill={ACCENT} /><path d="M11 5 L11 8" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" /></svg>}
            />
          </div>

          {/* Prompt strip — like a station signboard */}
          <div style={{
            margin: '14px 24px 0',
            padding: '12px 18px',
            background: 'linear-gradient(90deg, rgba(190,242,100,0.14), rgba(190,242,100,0.02))',
            border: `1px solid ${ACCENT}55`,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 14,
            animation: 'em-mole-rise-anim 320ms var(--em-ease)',
          }} key={`prompt-${roundIdx}`}>
            <div style={{
              fontFamily: 'var(--em-mono)', fontSize: 11, color: ACCENT, letterSpacing: '0.18em',
              padding: '4px 8px', border: `1px solid ${ACCENT}66`, borderRadius: 4,
              flexShrink: 0,
            }}>RND {String(roundIdx + 1).padStart(2, '0')}</div>
            <div className="em-decor" style={{ fontSize: 18, color: 'var(--em-text)', flex: 1, lineHeight: 1.3 }}>{maskedPrompt}</div>
          </div>

          {/* Platform with mole holes */}
          <div style={{ flex: 1, position: 'relative', margin: '20px 24px', overflow: 'hidden' }}>
            {/* Tile floor (lighter band at bottom) */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
              background: 'linear-gradient(180deg, transparent 0%, rgba(190,242,100,0.05) 100%)',
              pointerEvents: 'none',
            }} />
            {/* Holes */}
            {holePositions.map((pos, hi) => {
              const mole = moles.find(m => m.holeIdx === hi && m.state !== 'down');
              const isHinted = hintHole === hi;
              return (
                <div
                  key={hi}
                  style={{
                    position: 'absolute',
                    left: `${pos.x}%`, top: `${pos.y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 110, height: 110,
                  }}
                >
                  {/* Hole ellipse */}
                  <div className="em-wam-hole" style={{
                    position: 'absolute', inset: 0,
                    background: 'radial-gradient(ellipse at center, #02010C 0%, #08041A 60%, #14082A 100%)',
                    borderRadius: '50% / 38%',
                    border: '2px solid #1F0E3A',
                    boxShadow: 'inset 0 6px 20px rgba(0,0,0,0.95)',
                    overflow: 'hidden',
                    animation: isHinted ? `em-hole-pulse 0.8s var(--em-ease) infinite` : 'none',
                  }}>
                    {/* Mole rendered inside hole */}
                    {mole && mole.state !== 'down' && (
                      <button
                        onClick={() => whack(moles.findIndex(m => m === mole))}
                        aria-label={`Mole holding ${mole.word}, tap to choose`}
                        style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          minHeight: 80, padding: 0,
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          animation:
                            mole.state === 'rising' ? 'em-mole-rise 280ms var(--em-ease) forwards'
                              : mole.state === 'falling' ? 'em-mole-fall 260ms var(--em-ease) forwards'
                              : mole.state === 'whacked' ? 'em-mole-whacked 360ms var(--em-ease) forwards'
                              : 'em-mole-bob 1.6s var(--em-ease) infinite',
                          transformOrigin: 'bottom center',
                          touchAction: 'manipulation',
                        }}
                      >
                        <svg viewBox="0 0 80 90" width="100%" height="100%" style={{ display: 'block' }}>
                          {/* Mole body */}
                          <ellipse cx="40" cy="60" rx="28" ry="30" fill="#3D2A18" stroke="#1A1208" strokeWidth="1.5" />
                          <ellipse cx="40" cy="50" rx="20" ry="14" fill="#5C3F22" />
                          {/* Conductor cap */}
                          <path d="M 18 38 Q 40 18 62 38 L 62 42 L 18 42 Z" fill="#0E0A1A" stroke={ACCENT} strokeWidth="1.5" />
                          <rect x="18" y="40" width="44" height="5" fill={ACCENT} opacity="0.85" />
                          <circle cx="40" cy="32" r="3.5" fill={ACCENT} stroke="#0E0A1A" strokeWidth="1" />
                          {/* Eyes */}
                          <circle cx="32" cy="50" r="3.2" fill="#FFF8E5" />
                          <circle cx="48" cy="50" r="3.2" fill="#FFF8E5" />
                          <circle cx="32" cy="51" r="1.6" fill="#0E0A1A" />
                          <circle cx="48" cy="51" r="1.6" fill="#0E0A1A" />
                          {/* Nose */}
                          <ellipse cx="40" cy="58" rx="3" ry="2" fill="#FB7185" />
                          {/* Word card */}
                          <rect x="8" y="68" width="64" height="18" rx="3" fill="#FFF8E5" stroke="#0E0A1A" strokeWidth="1.2" />
                          <text x="40" y="80" textAnchor="middle"
                            fontFamily="var(--em-decor)"
                            fontSize="10"
                            fontWeight="600"
                            fill="#0E0A1A">{mole.word.length > 11 ? mole.word.slice(0, 10) + '…' : mole.word}</text>
                        </svg>
                      </button>
                    )}
                  </div>
                  {/* Hole rim shadow underneath */}
                  <div style={{
                    position: 'absolute', bottom: -6, left: '15%', right: '15%', height: 8,
                    background: 'radial-gradient(ellipse at top, rgba(0,0,0,0.5), transparent)',
                    borderRadius: '50%',
                    pointerEvents: 'none',
                  }} />
                  {/* Hint glow ring */}
                  {isHinted && (
                    <div style={{
                      position: 'absolute', inset: -8, borderRadius: '50% / 40%',
                      border: `2px dashed ${ACCENT}`,
                      pointerEvents: 'none',
                      animation: 'em-hole-pulse 0.8s var(--em-ease) infinite',
                    }} />
                  )}
                </div>
              );
            })}

            {/* Standalone Bajla on platform removed 2026-05-03 — chat-widget
                mascot is the canonical presence. */}

            {/* MISS chip removed (Ricky CC-cleanup, 2026-05-02 — CD audit §5.5
                Whack-a-Mole counter cleanup): keep a single position-based
                Q N/M counter via the shared Progress primitive in the sidebar,
                with a small ✓/✗ tally chip beside it. The play-area MISS chip
                duplicated that tally and crowded the scene. */}
          </div>

          {/* START · ROZPOCZNIJ overlay (Ricky 2026-05-02, CD audit §5.5
              Whack-a-Mole first-impression fix). The shell spawns moles on a
              staggered timer, so on first mount the platform reads as 6 empty
              holes for ~220ms+ before the first mole rises — confusing
              first-impression CD flagged. We gate spawning behind an explicit
              START affordance so the user sees the prompt + a one-line
              instruction BEFORE the timer kicks in, then the moles rise on
              the regular cadence. Subsequent rounds auto-spawn (started
              stays true). Forced-state previews bypass this overlay. */}
          {!started && !completed && !forcedState && (
            <div
              role="dialog"
              aria-live="polite"
              aria-label="Subway Mole — ready to start"
              style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(ellipse at center, rgba(15,8,36,0.78), rgba(2,1,12,0.92))`,
                backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 16,
                padding: '0 24px',
                zIndex: 7,
                animation: 'em-rise 0.36s var(--em-ease)',
              }}
            >
              <div className="em-eyebrow" style={{ color: ACCENT, opacity: 0.85 }}>
                READY · GOTOWY
              </div>
              <div className="em-decor" style={{
                fontSize: 32, color: 'var(--em-text)',
                textAlign: 'center', lineHeight: 1.15,
                textShadow: `0 0 20px ${ACCENT}55`,
              }}>
                The Subway Mole
              </div>
              <div style={{
                maxWidth: 420, textAlign: 'center',
                fontFamily: 'var(--em-body)', fontSize: 14, lineHeight: 1.5,
                color: 'var(--em-text-muted)',
              }}>
                Tap the mole whose word fits the gap. Wait for the right one — wrong taps cost you.
                <br />
                <span style={{ opacity: 0.75 }}>
                  Stuknij kreta, którego słowo pasuje do luki. Poczekaj na właściwego — błędne stuknięcia kosztują.
                </span>
              </div>
              <button
                className="em-btn em-btn-primary"
                onClick={() => setStarted(true)}
                autoFocus
                style={{
                  marginTop: 8,
                  fontFamily: 'var(--em-mono)',
                  letterSpacing: '0.18em',
                  fontSize: 13,
                  padding: '12px 28px',
                  background: ACCENT,
                  color: '#0A0518',
                  border: `1px solid ${ACCENT}`,
                  boxShadow: `0 0 24px ${ACCENT}66`,
                }}
              >
                START · ROZPOCZNIJ
              </button>
            </div>
          )}

          {completed && !onSessionComplete && (
            <div
              role="dialog"
              aria-live="assertive"
              aria-label="Subway Mole complete"
              style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
                backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 14,
                animation: 'em-rise 0.4s var(--em-ease)',
                zIndex: 6,
              }}
            >
              <Bajla size={84} mood="cheer" decorative />
              <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa`, textAlign: 'center', padding: '0 16px' }}>The platform clears.</div>
              <div className="em-eyebrow">LAST TRAIN AWAY · OSTATNI POCIĄG ODJECHAŁ</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="em-btn em-btn-ghost" onClick={reset}>Try another</button>
                <button className="em-btn em-btn-primary" onClick={reset}>Next district →</button>
              </div>
            </div>
          )}
          <Confetti show={completed} />
        </div>

        <div className="em-wam-side" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Progress
                current={solved.filter(Boolean).length}
                total={activePuzzle.rounds.length}
                accent={ACCENT}
                seen={Math.min(roundIdx + 1, activePuzzle.rounds.length)}
              />
              {/* Small ✓/✗ tally chip beside the canonical Q N/M counter
                  (Ricky CC-cleanup, 2026-05-02 — CD audit §5.5). Replaces the
                  in-play MISS chip and the implicit HIT/MISS doubled-counter
                  pattern called out in cross-cutting #14. */}
              {(solved.filter(Boolean).length > 0 || missCount > 0) && (
                <div
                  aria-label={`${solved.filter(Boolean).length} correct, ${missCount} miss${missCount === 1 ? '' : 'es'}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.12em',
                    padding: '3px 8px', borderRadius: 4,
                    border: '1px solid var(--em-line)',
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  <span style={{ color: ACCENT }}>✓ {solved.filter(Boolean).length}</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span style={{ color: '#FB7185' }}>✗ {missCount}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <SkipButton onClick={skipRound} />
              <HintButton onClick={useHint} used={hintsUsed} total={3} />
            </div>
          </div>

          <div className="em-shell-hint" style={{ minWidth: 0 }}>
          </div>

          <div className="em-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--em-line)', display: 'flex', justifyContent: 'space-between' }}>
              <div className="em-eyebrow">Service board · tablica</div>
              <div className="em-eyebrow" style={{ color: ACCENT }}>{solved.filter(Boolean).length}/{activePuzzle.rounds.length}</div>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activePuzzle.rounds.map((r, i) => {
                const isDone = solved[i];
                const isCurrent = i === roundIdx;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: isDone ? 'rgba(190,242,100,0.08)' : isCurrent ? `${ACCENT}11` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isDone ? `${ACCENT}55` : isCurrent ? `${ACCENT}66` : 'var(--em-line)'}`,
                  }}>
                    <div style={{
                      fontFamily: 'var(--em-mono)', fontSize: 10,
                      color: isDone ? ACCENT : isCurrent ? ACCENT : 'var(--em-text-muted)',
                      letterSpacing: '0.1em',
                      minWidth: 26,
                    }}>{String(i + 1).padStart(2, '0')}</div>
                    <div style={{
                      fontFamily: 'var(--em-body)', fontSize: 12, color: 'var(--em-text)', flex: 1,
                      opacity: isDone ? 0.7 : 1,
                    }}>{maskAnswerInPrompt(r.prompt, r.options[r.answerIndex])}</div>
                    {isDone && <div style={{ color: ACCENT, fontFamily: 'var(--em-mono)', fontSize: 10 }}>✓</div>}
                    {isCurrent && !isDone && <div style={{ color: ACCENT, fontFamily: 'var(--em-mono)', fontSize: 10 }}>NOW</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhackAMoleShell;
