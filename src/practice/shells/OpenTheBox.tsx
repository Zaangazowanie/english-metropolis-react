// Open the Box — "The Vault Room" district.
//
// A dimly lit vault wall of brass safe-deposit boxes. The student taps a box
// to flip its door open and reveal a multiple-choice question. A correct
// answer locks the door open with a green seal; a wrong answer slams it
// shut and bumps the wrong-answer counter. All boxes opened correctly →
// the vault is sealed.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { buildSafeHint } from '../lib/safeHint';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
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

// 3D pilot (Ricky, 2026-05-03 — wave after Hangman3D). CSS-3D Vault Room
// scene ported from Mike's prototype. Lazy-loaded so the brass-vault CSS bulk
// only ships when a student opens this shell *and* the feature flag is on.
// Pure-visual swap: the SVG dial grid below is the immediate fallback while
// the 3D chunk downloads + remains the canonical render when the flag is off.
const OpenTheBox3D = React.lazy(() => import('./OpenTheBox3D'));

/**
 * Feature flag for the 3D Vault Room pilot.
 *  - Defaults ON in production (Mike's directive: ship the pilot).
 *  - Defaults OFF in dev so the design canvas + storybooks stay snappy.
 *  - Overridable via `window.__EM_OPENTHEBOX_3D__` for live A/B inside an
 *    open page (devtools toggle without a rebuild).
 */
function isOpenTheBox3DEnabledFn(): boolean {
  // import.meta.env.MODE is provided by Vite at build time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mode: string = (import.meta as unknown as { env?: { MODE?: string } })?.env?.MODE ?? 'production';
  const defaultOn = mode === 'production';
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const override = (window as unknown as { __EM_OPENTHEBOX_3D__?: boolean }).__EM_OPENTHEBOX_3D__;
    if (typeof override === 'boolean') return override;
  }
  return defaultOn;
}
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';

// Vault Room · Open the Box — full bilingual instruction copy.
const OPENTHEBOX_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A grid of brass vault doors lines the wall — each door hides one multiple-choice question.',
      'Tap a door to swing it open and reveal the question inside.',
      'Pick the right answer chip to seal the box (green); a wrong answer marks the box red but moves on.',
      'Goal: open and seal every box on the wall.',
    ],
    pl: [
      'Na ścianie jest siatka mosiężnych drzwi do skrytek — każde drzwi ukrywają pytanie wyboru.',
      'Stuknij drzwi, aby je otworzyć i odsłonić pytanie.',
      'Wybierz właściwą odpowiedź, aby zaplombować skrytkę (zielona); błędna oznacza ją na czerwono, ale przechodzi dalej.',
      'Cel: otworzyć i zaplombować każdą skrytkę na ścianie.',
    ],
  },
  controls: {
    en: [
      'Vault doors: tappable brass squares — each one opens to a question.',
      'Question card (right side): the prompt + answer chips appear when you open a box.',
      'Vault ledger (right side): a running list of which boxes are sealed (green) vs busted (red).',
      'Hint button: 3 hints per session — eliminates one wrong answer chip from the open box.',
      'Skip button: closes the open box without an answer (counts as busted).',
    ],
    pl: [
      'Drzwi skrytek: klikalne mosiężne kwadraty — każde otwiera pytanie.',
      'Karta pytania (po prawej): pytanie + odpowiedzi pojawiają się po otwarciu skrytki.',
      'Księga skrytek (po prawej): lista, które skrytki są zaplombowane (zielone) lub uszkodzone (czerwone).',
      'Przycisk Podpowiedź: 3 podpowiedzi na sesję — usuwa jedną błędną odpowiedź z otwartej skrytki.',
      'Przycisk Pomiń: zamyka otwartą skrytkę bez odpowiedzi (liczy się jako uszkodzona).',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right pick: the door slams shut with a green seal, +1 to your tally, ledger marks the box sealed.',
      'Wrong pick: the door slams shut with a red broken-seal mark; correct answer is shown briefly.',
      'Skip: counts as busted; the correct answer is shown before the next box becomes selectable.',
      'Boxes can be tapped in any order — pick a strategy (corners first, centre first, random).',
    ],
    pl: [
      'Trafny wybór: drzwi się zatrzaskują z zieloną pieczęcią, +1 do wyniku, księga zapisuje skrytkę jako zaplombowaną.',
      'Błędny wybór: drzwi zatrzaskują się ze złamaną czerwoną pieczęcią; pojawia się prawidłowa odpowiedź.',
      'Pomiń: liczy się jako uszkodzona; pojawia się prawidłowa odpowiedź, zanim następna skrytka stanie się klikalna.',
      'Skrytki możesz stukać w dowolnej kolejności — wybierz strategię (rogi, środek, losowo).',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. The hint button on an open box eliminates one wrong answer chip (greys it out). Same drill discipline as Multiple Choice — save them for the trickiest verb-form and false-friend questions.',
    pl:
      'Masz 3 podpowiedzi na sesję. Przycisk podpowiedzi w otwartej skrytce usuwa jedną błędną odpowiedź (wyszarza ją). Ta sama dyscyplina co w Multiple Choice — zachowaj je na najtrudniejsze pytania o formę czasownika i fałszywych przyjaciół.',
  },
  scoring: {
    en:
      'Skip counts as busted. Each sealed box adds to your session streak. Sealing every box on the wall unlocks the Vault Room completion screen and posts your score to your timeline.',
    pl:
      'Pomiń liczy się jako uszkodzona. Każda zaplombowana skrytka zwiększa serię. Zaplombowanie wszystkich skrytek odblokowuje ekran zakończenia Sali Skarbca i zapisuje wynik na osi czasu.',
  },
  l1Pattern: {
    en:
      'Same as Multiple Choice — Polish learners often pick the wrong helping verb (have / has / had) or over-regularize irregular past forms. The vault format adds spatial memory: which box was the false-friend trap?',
    pl:
      'Tak samo jak w Multiple Choice — polscy uczniowie często wybierają złą formę pomocniczą (have / has / had) albo „regularyzują" nieregularne formy przeszłe. Format skarbca dodaje pamięć przestrzenną: w której skrytce była pułapka fałszywego przyjaciela?',
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

export interface OpenTheBoxShellProps {
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
  /**
   * D3-OpenTheBox (Ricky wave-3, 2026-05-02): fires once when every box on
   * the wall has been opened + sealed (the success condition for this shell —
   * skipped boxes still need a return visit). Mounts <PracticeReview> at the
   * host. Per item: each opened vault box becomes one review row showing
   * box number + the MC question + student's pick (the LAST attempt) +
   * correct + explanationPL.
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
    puzzle: ArcadePuzzle;
  }) => void;
}

const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'b1', prompt: 'A safe place to keep money.',
      options: ['vault', 'pavement', 'fountain', 'lantern'], answerIndex: 0,
      hint: "Banks have one — heavy door, lots of locks.", hint_pl: 'sejf, skarbiec' },
    { id: 'b2', prompt: 'You unlock a door with this.',
      options: ['button', 'shelf', 'key', 'mirror'], answerIndex: 2,
      hint: 'Goes in the lock. Turns. Click.', hint_pl: 'klucz' },
    { id: 'b3', prompt: 'Where you put one foot in front of the other on a street.',
      options: ['kitchen', 'pavement', 'ceiling', 'cellar'], answerIndex: 1,
      hint: 'Pedestrians use it; British English.', hint_pl: 'chodnik' },
    { id: 'b4', prompt: 'Bright shop sign at night.',
      options: ['plaster', 'neon', 'gravel', 'beam'], answerIndex: 1,
      hint: 'Glows pink, red, blue — a market staple.', hint_pl: 'neon' },
    { id: 'b5', prompt: 'Underground transit with stations and tunnels.',
      options: ['subway', 'rooftop', 'balcony', 'gallery'], answerIndex: 0,
      hint: 'British call it the Underground; American name here.', hint_pl: 'metro' },
    { id: 'b6', prompt: 'Public square with fountains and benches.',
      options: ['plaza', 'cellar', 'attic', 'mast'], answerIndex: 0,
      hint: 'Spanish-rooted noun for a city open square.', hint_pl: 'plac' },
    { id: 'b7', prompt: 'A small alley between buildings.',
      options: ['lane', 'tower', 'pier', 'court'], answerIndex: 0,
      hint: 'Narrow, often cobbled. Cats love them.', hint_pl: 'uliczka' },
    { id: 'b8', prompt: 'A walkway above the street level.',
      options: ['cellar', 'gutter', 'bridge', 'pit'], answerIndex: 2,
      hint: 'Crosses a road or river — pedestrian or vehicle.', hint_pl: 'most' },
    { id: 'b9', prompt: 'A place to sit outside a café.',
      options: ['terrace', 'cellar', 'spire', 'shaft'], answerIndex: 0,
      hint: 'Open-air seating, often on a roof or upper floor.', hint_pl: 'taras' },
  ],
};

const ACCENT = '#FBBF24';

// ─────────────────────────────────────────────────────────────────────────
// renderOpenTheBoxReviewItem — per-box locked render for PracticeReview.
// Shows the box number + the MC question + student's last pick + correct
// answer + the explanationPL rule callout. Mirrors the live shell's poster
// styling so the review feels like a frozen scoreboard.
// ─────────────────────────────────────────────────────────────────────────
const OTB_REVIEW_ACCENT = '#FBBF24';
export function renderOpenTheBoxReviewItem(
  round: ArcadeRound,
  boxNumber: number,
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
        : 'linear-gradient(180deg, rgba(52,211,153,0.08), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(52,211,153,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${OTB_REVIEW_ACCENT}22`, color: OTB_REVIEW_ACCENT,
          border: `1px solid ${OTB_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          BOX {String(boxNumber).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(52,211,153,0.18)',
          color: isWrong ? '#FB7185' : '#34D399',
        }}>
          {isWrong ? '✗ BUSTED · USZKODZONA' : '✓ SEALED · ZAPLOMBOWANA'}
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
                ? 'rgba(52,211,153,0.18)'
                : showWrong
                  ? 'rgba(251,113,133,0.18)'
                  : 'rgba(245,239,255,0.04)',
              border: `1px solid ${showCorrect ? '#34D39988' : showWrong ? '#FB718588' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? '#34D399' : showWrong ? '#FB7185' : 'var(--em-text, #EDE6FF)',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                fontFamily: 'var(--em-mono)', fontSize: 9,
                color: OTB_REVIEW_ACCENT, opacity: 0.7, minWidth: 14,
              }}>{String.fromCharCode(65 + oi)}</span>
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

type BoxFace = 'closed' | 'opening' | 'open' | 'sealed' | 'slam';

interface BoxState {
  face: BoxFace;
  tries: number;          // wrong attempts on this box
  pickedIndex: number | null;
}

export const OpenTheBoxShell: React.FC<OpenTheBoxShellProps> = ({
  time = 'night',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const activePuzzle: ArcadePuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : DEMO_PUZZLE;
  const persisted = useShellProgress('openthebox');

  const initialBoxes = (): BoxState[] => activePuzzle.rounds.map(() => ({ face: 'closed', tries: 0, pickedIndex: null }));
  const [boxes, setBoxes] = useState<BoxState[]>(initialBoxes);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [revealedHint, setRevealedHint] = useState<number | null>(null);
  const [shake, setShake] = useState(false);

  const sealedCount = boxes.filter(b => b.face === 'sealed').length;
  const total = activePuzzle.rounds.length;
  const completed = sealedCount === total;
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount: sealedCount,
        totalQuestions: total,
        wrongAttempts,
        puzzle: activePuzzle,
      });
    } : undefined,
  });
  // 3D pilot flag — see isOpenTheBox3DEnabledFn() at top of file. Reads the
  // window override / production default on every render (cheap; no need to
  // memoize). When true, the brass-vault CSS-3D scene replaces the SVG dial
  // grid; question popup, hint panel, ledger, header, audio all stay put.
  const is3DEnabled = isOpenTheBox3DEnabledFn();

  // Kelly Tier-2 (2026-05-02): box-flip / slam-shut transitions are CSS, gated
  // to 0.01ms by global media query. Collapse the JS sequencer waits too so the
  // student isn't staring at a static box waiting for the door to "finish".
  const reduceMotion = usePrefersReducedMotion();
  const FLIP_WAIT_MS = reduceMotion ? 16 : 320;
  const PICK_WAIT_MS = reduceMotion ? 16 : 420;
  const SLAM_DELAY_MS = reduceMotion ? 16 : 540;
  const HINT_PULSE_MS = reduceMotion ? 16 : 3200;

  useEffect(() => {
    if (forcedState) return;
    persisted.save({ progress: sealedCount / total, lastState: completed ? 'complete' : 'active' });
    if (completed) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [sealedCount, completed, forcedState]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'openthebox',
      brief: 'Tap a brass door, then answer the question inside to seal the box.',
      brief_pl: 'Stuknij mosiężne drzwi, a potem odpowiedz na pytanie w środku.',
      detail: 'A wall of safe-deposit boxes — each door hides one question. Tap a door to open it; pick the right answer to seal the box. Wrong answers stay open so you can try again. Seal every box to close the vault.',
      detail_pl: 'Ściana skrytek bankowych — za każdymi drzwiami kryje się pytanie. Stuknij drzwi, aby je otworzyć; wybierz dobrą odpowiedź, by zaplombować skrytkę. Błędne pozostają otwarte. Zaplombuj wszystkie, aby zamknąć skarbiec.',
      fullInstructions: OPENTHEBOX_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (forcedState === 'empty') { setBoxes(initialBoxes()); setActiveIdx(null); }
    if (forcedState === 'active') {
      const b = initialBoxes(); b[2] = { face: 'open', tries: 0, pickedIndex: null };
      setBoxes(b); setActiveIdx(2);
    }
    if (forcedState === 'wrong') {
      const b = initialBoxes(); b[2] = { face: 'open', tries: 1, pickedIndex: 0 };
      setBoxes(b); setActiveIdx(2); setShake(true); setTimeout(() => setShake(false), 380);
    }
    if (forcedState === 'correct') {
      const b = initialBoxes(); b[0] = { face: 'sealed', tries: 0, pickedIndex: 0 };
      setBoxes(b);
    }
    if (forcedState === 'complete') {
      setBoxes(activePuzzle.rounds.map(() => ({ face: 'sealed', tries: 0, pickedIndex: 0 })));
    }
  }, [forcedState]);

  const openBox = (i: number): void => {
    if (forcedState) return;
    if (boxes[i].face === 'sealed') return;
    if (activeIdx !== null && activeIdx !== i) return; // one open at a time
    setBoxes(prev => prev.map((b, j) => j === i ? { ...b, face: 'opening' } : b));
    window.setTimeout(() => {
      setBoxes(prev => prev.map((b, j) => j === i ? { ...b, face: 'open' } : b));
      setActiveIdx(i);
    }, FLIP_WAIT_MS);
  };

  const closeBox = (i: number): void => {
    setBoxes(prev => prev.map((b, j) => j === i ? { ...b, face: 'slam', pickedIndex: null } : b));
    window.setTimeout(() => {
      setBoxes(prev => prev.map((b, j) => j === i ? { ...b, face: 'closed' } : b));
    }, FLIP_WAIT_MS);
    setActiveIdx(null);
  };

  const pick = (boxIdx: number, optIdx: number): void => {
    if (forcedState) return;
    const round = activePuzzle.rounds[boxIdx];
    const correct = optIdx === round.answerIndex;
    setBoxes(prev => prev.map((b, j) => j === boxIdx ? { ...b, pickedIndex: optIdx } : b));
    if (correct) {
      window.setTimeout(() => {
        setBoxes(prev => prev.map((b, j) => j === boxIdx ? { ...b, face: 'sealed' } : b));
        setActiveIdx(null);
      }, PICK_WAIT_MS);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 380);
      setBoxes(prev => prev.map((b, j) => j === boxIdx ? { ...b, tries: b.tries + 1 } : b));
      tip.recordWrong({
        questionId: round.id,
        studentAnswer: round.options[optIdx],
        correctAnswer: round.options[round.answerIndex],
        explanationPL: round.hint_pl,
        exerciseId: round.exerciseId,
      });
      // After 2 wrong tries, slam shut so they have to come back to it.
      if (boxes[boxIdx].tries + 1 >= 2) {
        window.setTimeout(() => closeBox(boxIdx), SLAM_DELAY_MS);
      }
    }
  };

  const useHint = (): void => {
    if (hintsUsed >= 3 || activeIdx === null) return;
    setRevealedHint(activeIdx);
    setHintsUsed(h => h + 1);
    window.setTimeout(() => setRevealedHint(null), HINT_PULSE_MS);
  };

  const reset = (): void => {
    setBoxes(initialBoxes());
    setActiveIdx(null);
    setHintsUsed(0);
    setRevealedHint(null);
    tip.reset();
  };

  const skipBox = (): void => {
    if (activeIdx === null) return;
    closeBox(activeIdx);
  };

  const cur = activeIdx !== null ? activePuzzle.rounds[activeIdx] : null;
  const curBox = activeIdx !== null ? boxes[activeIdx] : null;

  // Box grid sizing — 3 columns on desktop, auto on mobile.
  const cols = total >= 9 ? 3 : Math.min(3, total);

  const grad = time === 'day'
    ? 'linear-gradient(180deg, #6E4FB8 0%, #3D2360 100%)'
    : time === 'night'
      ? 'linear-gradient(180deg, #02010C 0%, #120726 60%, #2A1450 100%)'
      : 'linear-gradient(180deg, #1A0E36 0%, #2A1450 60%, #4B1E78 100%)';

  const liveStatus = completed
    ? 'The vault is sealed. All boxes secured.'
    : cur
      ? `Box ${(activeIdx ?? 0) + 1} open. ${cur.prompt}`
      : '';

  return (
    <div
      className="em-shell em-shell-openthebox"
      role="application"
      aria-label="Open the box practice, the Vault Room"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <style>{`
        @keyframes em-otb-rise {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes em-otb-flip-open {
          0% { transform: perspective(900px) rotateY(0deg); }
          100% { transform: perspective(900px) rotateY(-122deg); }
        }
        @keyframes em-otb-slam {
          0% { transform: perspective(900px) rotateY(-122deg); }
          70% { transform: perspective(900px) rotateY(8deg); }
          100% { transform: perspective(900px) rotateY(0deg); }
        }
        @keyframes em-otb-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        @keyframes em-otb-stamp {
          0% { transform: scale(1.6) rotate(-12deg); opacity: 0; }
          60% { transform: scale(0.92) rotate(-12deg); opacity: 1; }
          100% { transform: scale(1) rotate(-12deg); opacity: 1; }
        }
        @keyframes em-otb-vault-light {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.85; }
        }
        .em-otb-box-shell { animation: em-otb-rise 540ms var(--em-ease) both; }
        .em-otb-box-shell:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 4px; border-radius: 6px; }
        @media (max-width: 768px) {
          .em-otb-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 10px !important; }
          .em-otb-side { display: none !important; }
          .em-otb-layout { grid-template-columns: 1fr !important; padding: 16px !important; }
        }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{liveStatus}</div>

      {/* Vault wall scene.
          Ricky 2026-05-02 (#15 audit pass): explicit zIndex:0 + pointerEvents:none
          on the background gradient (em-otb-layout below sits at relative z auto). */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: grad }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.32, pointerEvents: 'none',
        backgroundImage: `repeating-linear-gradient(90deg, rgba(0,0,0,0.45) 0 1px, transparent 1px 110px),
                          repeating-linear-gradient(0deg, rgba(0,0,0,0.5) 0 1px, transparent 1px 80px)` }} />
      {/* Vault overhead lights */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute', top: 0, left: `${10 + i * 16}%`,
          width: 140, height: 220,
          background: `radial-gradient(ellipse at top, ${ACCENT}33 0%, transparent 70%)`,
          animation: `em-otb-vault-light ${3 + (i % 3)}s var(--em-ease) ${i * 0.4}s infinite`,
          pointerEvents: 'none',
        }} />
      ))}
      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div className="em-otb-layout" style={{
        position: 'relative', display: 'grid',
        gridTemplateColumns: '1.4fr 1fr', gap: 24, padding: 32,
        height: '100%', boxSizing: 'border-box',
      }}>

        {/* MAIN — vault wall of boxes */}
        <div className="em-card" style={{
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, #1B0F36 0%, #0A0518 100%)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--em-line)' }}>
            <AmbientAudioPlayer shellSlug="openthebox" />
            <Nameplate
              district="The Vault Room"
              subtitle="Open the box · Otwórz skrytkę · pick the right answer to keep it open"
              accent={ACCENT}
              icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="3" width="16" height="16" rx="2" stroke={ACCENT} strokeWidth="1.6" /><circle cx="11" cy="11" r="3" stroke={ACCENT} strokeWidth="1.6" /><path d="M11 8 V11 M11 14 V14" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" /></svg>}
            />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', gap: 16 }}>
            {/* Kelly Tier-2 audit (2026-05-02): empty first-impression fix.
                Before any box is open, the grid reads as "9 closed doors and
                no question" — students didn't know it was interactive. The
                eyebrow + first-question prompt below invite the tap. */}
            {!cur && !completed && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                animation: 'em-otb-rise 540ms var(--em-ease) both',
              }}>
                <div className="em-eyebrow" style={{
                  color: ACCENT, padding: '6px 14px',
                  background: `${ACCENT}1c`,
                  border: `1px dashed ${ACCENT}66`,
                  borderRadius: 999,
                  letterSpacing: '0.2em', fontSize: 11,
                }}>
                  KLIKNIJ DOWOLNY SEJF · TAP ANY VAULT
                </div>
                {activePuzzle.rounds[0] && (
                  <div style={{
                    fontFamily: 'var(--em-body)', fontSize: 13, color: 'var(--em-text-muted)',
                    fontStyle: 'italic', textAlign: 'center', maxWidth: 420,
                  }}>
                    np. Box 01: <span style={{ color: 'var(--em-text)' }}>"{activePuzzle.rounds[0].prompt}"</span>
                  </div>
                )}
              </div>
            )}
            {/* 3D VAULT ROOM — first 3D Open the Box pilot (Ricky, 2026-05-03,
                following Hangman3D pattern). Lazy-loaded, aria-hidden under
                .em-otb-3d-room (the buttons inside it carry their own labels).
                Suspense fallback is a dark vault-tinted placeholder so the
                shell layout doesn't jump while the chunk downloads. */}
            {is3DEnabled && (
              <div style={{ position: 'absolute', inset: 0 }}>
                <Suspense
                  fallback={
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute', inset: 0,
                        background: 'radial-gradient(ellipse at center, rgba(168,68,122,0.18), rgba(8,4,18,0.85))',
                        border: '1px solid rgba(245,217,122,0.18)',
                        borderRadius: 6,
                      }}
                    />
                  }
                >
                  <OpenTheBox3D
                    boxes={boxes.map((b, i) => ({
                      index: i,
                      // Parent uses 'closed' | 'opening' | 'open' | 'sealed' | 'slam';
                      // 3D layer also accepts 'busted' (visual only, parent never
                      // emits it — slam → closed re-cycle is the parent's design).
                      state: b.face,
                    }))}
                    onBoxClick={openBox}
                    currentRoundIdx={activeIdx}
                    started={(sealedCount > 0) || activeIdx !== null}
                    tweaks={{ shake }}
                  />
                </Suspense>
              </div>
            )}

            {!is3DEnabled && (
            <div className="em-otb-grid" style={{
              display: 'grid', gridTemplateColumns: `repeat(${cols}, 130px)`, gap: 16,
            }}>
              {boxes.map((b, i) => {
                const isFocus = activeIdx === i;
                const flipping = b.face === 'opening' || b.face === 'open' || b.face === 'slam';
                const sealed = b.face === 'sealed';
                const animation = b.face === 'opening' ? 'em-otb-flip-open 320ms var(--em-ease) forwards'
                  : b.face === 'open' ? 'none'
                  : b.face === 'slam' ? 'em-otb-slam 320ms var(--em-ease) forwards'
                  : 'none';
                const pickedRotate = b.face === 'open' ? 'perspective(900px) rotateY(-122deg)' : undefined;
                return (
                  <button
                    key={i}
                    className="em-otb-box-shell"
                    aria-label={sealed ? `Box ${i + 1}, sealed and locked` : isFocus ? `Box ${i + 1}, currently open` : `Box ${i + 1}, tap to open`}
                    aria-pressed={isFocus}
                    onClick={() => openBox(i)}
                    disabled={sealed || (activeIdx !== null && !isFocus)}
                    style={{
                      position: 'relative', width: 130, height: 130,
                      perspective: '900px',
                      background: 'transparent', border: 'none', cursor: sealed ? 'default' : 'pointer', padding: 0,
                      animationDelay: `${i * 60}ms`,
                      opacity: activeIdx !== null && !isFocus && !sealed ? 0.45 : 1,
                      transition: 'opacity 220ms',
                    }}
                  >
                    {/* Cabinet frame (shadow box behind the door) */}
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: 6,
                      background: 'linear-gradient(160deg, #0A0512 0%, #1A0F2E 100%)',
                      boxShadow: 'inset 0 0 24px rgba(0,0,0,0.85), inset 0 2px 4px rgba(255,255,255,0.04)',
                      border: '1px solid rgba(0,0,0,0.6)',
                    }}>
                      {/* The number-stencil reveal area inside the cabinet */}
                      <div style={{
                        position: 'absolute', inset: 8, borderRadius: 4,
                        background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.18) 0%, rgba(0,0,0,0.6) 80%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', gap: 4,
                      }}>
                        <div style={{
                          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.2em',
                          color: `${ACCENT}99`,
                        }}>BOX</div>
                        <div className="em-decor" style={{ fontSize: 26, color: ACCENT, lineHeight: 1 }}>
                          {String(i + 1).padStart(2, '0')}
                        </div>
                        {sealed && (
                          <div style={{
                            position: 'absolute', inset: 0, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'radial-gradient(ellipse at center, rgba(52,211,153,0.32) 0%, transparent 70%)',
                            animation: 'em-otb-stamp 420ms var(--em-ease) both',
                          }}>
                            <div style={{
                              padding: '4px 10px', border: '2px solid #34D399',
                              fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em',
                              color: '#34D399', borderRadius: 4,
                              transform: 'rotate(-12deg)',
                              background: 'rgba(0,0,0,0.45)',
                            }}>SEALED</div>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Brass door with hinge + dial — rotates open on Y-axis */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      transformOrigin: 'left center',
                      transformStyle: 'preserve-3d',
                      transform: pickedRotate,
                      animation,
                      backfaceVisibility: 'hidden',
                      pointerEvents: 'none',
                    }}>
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: 6,
                        background: 'linear-gradient(135deg, #C8932B 0%, #FBBF24 50%, #8C620E 100%)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -1px 2px rgba(0,0,0,0.4)',
                        border: '1px solid #5A3F08',
                      }}>
                        {/* Combination dial */}
                        <div style={{
                          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                          width: 50, height: 50, borderRadius: '50%',
                          background: 'radial-gradient(circle, #FBBF24 0%, #8C620E 80%)',
                          border: '2px solid #5A3F08',
                          boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.3)',
                        }}>
                          <div style={{
                            position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
                            width: 3, height: 14, background: '#0E0A1A', borderRadius: 2,
                          }} />
                          <div style={{
                            position: 'absolute', top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)', width: 8, height: 8,
                            borderRadius: '50%', background: '#0E0A1A',
                          }} />
                        </div>
                        {/* Two hinge rivets on left edge */}
                        <div style={{ position: 'absolute', left: 4, top: 14, width: 6, height: 6, borderRadius: '50%', background: '#5A3F08' }} />
                        <div style={{ position: 'absolute', left: 4, bottom: 14, width: 6, height: 6, borderRadius: '50%', background: '#5A3F08' }} />
                        {/* Box number engraved on door */}
                        <div style={{
                          position: 'absolute', top: 8, right: 10,
                          fontFamily: 'var(--em-mono)', fontSize: 10, color: '#5A3F08',
                          letterSpacing: '0.1em',
                        }}>№ {String(i + 1).padStart(2, '0')}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            )}
          </div>

          {/* Question overlay — appears when a box is open.
              Ricky 2026-05-03 (CD audit, OTB-bug-1): popup was clipping
              options B + D off-screen on narrow viewports because width was
              `min(540px, calc(100% - 48px))` (% of the constrained vault
              column, not viewport). Switch to viewport-bounded max-width
              and guarantee the 2-col option grid cells can shrink (minmax
              + minWidth:0 on each button) so chips never overflow. */}
          {cur && curBox && curBox.face === 'open' && (
            <div
              style={{
                position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)',
                width: 'min(560px, calc(100vw - 32px), calc(100% - 24px))',
                maxWidth: 'calc(100vw - 32px)',
                background: 'linear-gradient(180deg, rgba(20,12,38,0.96) 0%, rgba(8,4,20,0.96) 100%)',
                border: `1px solid ${ACCENT}55`,
                borderRadius: 14, padding: 20,
                boxSizing: 'border-box',
                boxShadow: `0 12px 36px rgba(0,0,0,0.6), 0 0 24px ${ACCENT}22`,
                animation: shake ? 'em-otb-shake 380ms var(--em-ease)' : 'em-otb-rise 320ms var(--em-ease)',
                zIndex: 4,
              }}
              role="region"
              aria-label={`Question for box ${(activeIdx ?? 0) + 1}`}
            >
              <div className="em-eyebrow" style={{ color: ACCENT, marginBottom: 6 }}>BOX {String((activeIdx ?? 0) + 1).padStart(2, '0')} · QUESTION</div>
              <div className="em-decor" style={{ fontSize: 20, lineHeight: 1.25, color: 'var(--em-text)', marginBottom: 14, overflowWrap: 'break-word' }}>{cur.prompt}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                {cur.options.map((opt, oi) => {
                  const picked = curBox.pickedIndex === oi;
                  const isCorrect = oi === cur.answerIndex;
                  const showWrong = picked && !isCorrect;
                  const showRight = picked && isCorrect;
                  const hinted = revealedHint === activeIdx && isCorrect;
                  return (
                    <button
                      key={oi}
                      onClick={() => pick(activeIdx as number, oi)}
                      aria-label={`Option ${String.fromCharCode(65 + oi)}: ${opt}`}
                      style={{
                        minHeight: 44, padding: '10px 14px', borderRadius: 10,
                        minWidth: 0,
                        background: showRight
                          ? 'rgba(52,211,153,0.18)'
                          : showWrong
                            ? 'rgba(251,113,133,0.18)'
                            : hinted
                              ? `${ACCENT}22`
                              : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${showRight ? '#34D39966' : showWrong ? '#FB718566' : hinted ? `${ACCENT}88` : 'rgba(255,255,255,0.1)'}`,
                        color: showRight ? '#34D399' : showWrong ? '#FB7185' : 'var(--em-text)',
                        fontFamily: 'var(--em-body)', fontSize: 14,
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'all 200ms var(--em-ease)',
                        display: 'flex', alignItems: 'center', gap: 10,
                        overflowWrap: 'break-word', wordBreak: 'normal',
                      }}
                    >
                      <span style={{
                        fontFamily: 'var(--em-mono)', fontSize: 10,
                        color: ACCENT, opacity: 0.7, minWidth: 14, flex: '0 0 auto',
                      }}>{String.fromCharCode(65 + oi)}</span>
                      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'break-word' }}>{opt}</span>
                    </button>
                  );
                })}
              </div>
              {curBox.tries > 0 && (
                <div style={{ marginTop: 10, fontFamily: 'var(--em-mono)', fontSize: 10, color: '#FB7185', letterSpacing: '0.16em' }}>
                  TRY {curBox.tries} OF 2 · {curBox.tries >= 2 ? 'BOX SLAMS SHUT' : 'ONE MORE CHANCE'}
                </div>
              )}
            </div>
          )}

          {completed && !onSessionComplete && (
            <div
              role="dialog"
              aria-live="assertive"
              aria-label="Vault complete"
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
              <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa`, textAlign: 'center', padding: '0 16px' }}>The vault is sealed.</div>
              <div className="em-eyebrow">EVERY BOX SECURED · WSZYSTKO ZAMKNIĘTE</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="em-btn em-btn-ghost" onClick={reset}>Try another</button>
                <button className="em-btn em-btn-primary" onClick={reset}>Next district →</button>
              </div>
            </div>
          )}
          <Confetti show={completed} />
        </div>

        {/* SIDE */}
        <div className="em-otb-side" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Progress current={sealedCount} total={total} accent={ACCENT} />
            <div style={{ display: 'flex', gap: 6 }}>
              <SkipButton onClick={skipBox} />
              <HintButton onClick={useHint} used={hintsUsed} total={3} />
            </div>
          </div>

          <div className="em-shell-hint" style={{ minWidth: 0 }}>
          </div>

          {/* Vault ledger card */}
          <div className="em-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--em-line)', display: 'flex', justifyContent: 'space-between' }}>
              <div className="em-eyebrow">Vault ledger · księga skrytek</div>
              <div className="em-eyebrow" style={{ color: ACCENT }}>{sealedCount}/{total}</div>
            </div>
            <div className="em-scroll" style={{ overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {boxes.map((b, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: 8,
                  background: b.face === 'sealed' ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${b.face === 'sealed' ? '#34D39933' : 'var(--em-line)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: 4,
                      background: b.face === 'sealed' ? '#34D39922' : `${ACCENT}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--em-mono)', fontSize: 9,
                      color: b.face === 'sealed' ? '#34D399' : ACCENT,
                      letterSpacing: '0.06em',
                    }}>{String(i + 1).padStart(2, '0')}</div>
                    <div style={{ fontFamily: 'var(--em-mono)', fontSize: 11, color: 'var(--em-text-muted)' }}>
                      {b.face === 'sealed' ? 'SEALED' : b.face === 'open' || b.face === 'opening' ? 'OPEN' : 'LOCKED'}
                    </div>
                  </div>
                  {b.tries > 0 && b.face !== 'sealed' && (
                    <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, color: '#FB7185' }}>
                      {b.tries} miss
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpenTheBoxShell;
