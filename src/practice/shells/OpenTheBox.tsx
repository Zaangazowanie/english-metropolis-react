import { ActionPlayfield3D } from './action-arcade-three';
import { useActionCompletion } from './action-arcade-completion';
import { useArcadeEvents } from '../lib/arcade-events';
import { useActionTimers } from './action-arcade-timers';
import './action-arcade.css';
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

import React, { useRef, useState, useEffect } from 'react';
import {
  Bajla,

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

// Vault Room · Open the Box — full bilingual instruction copy.
const OPENTHEBOX_INSTRUCTIONS: FullInstructions = {
  "whatYouDo": {
    "en": [
      "Choose a brass safe. Read the clue and set its word dial before turning the key."
    ],
    "pl": [
      "Wybierz mosiężny sejf. Przeczytaj wskazówkę i ustaw słowo na pokrętle, zanim przekręcisz klucz."
    ]
  },
  "controls": {
    "en": [
      "Tap a word or turn the dial with the left/right buttons, then press Unlock. Only one safe can be open at a time."
    ],
    "pl": [
      "Stuknij słowo lub obracaj pokrętło przyciskami lewo/prawo, potem naciśnij Unlock. Otwarty może być tylko jeden sejf."
    ]
  },
  "rightWrongSkip": {
    "en": [
      "A correct combination secures the treasure. Two wrong attempts slam the door; reopen it or try a different safe. All safes remain recoverable."
    ],
    "pl": [
      "Dobra kombinacja zabezpiecza skarb. Dwa błędy zatrzaskują drzwi; otwórz je ponownie lub spróbuj innego sejfu. Każdy sejf można odzyskać."
    ]
  },
  "hintMechanic": {
    "en": "Use the limited Hint button for help with the current clue.",
    "pl": "Użyj ograniczonej liczby podpowiedzi do aktualnej wskazówki."
  },
  "scoring": {
    "en": "First-attempt locks earn 150 arcade points, recovered locks earn 100. Secure every safe.",
    "pl": "Pierwsza próba daje 150 punktów, odzyskany zamek 100. Zabezpiecz każdy sejf."
  },
  "l1Pattern": {
    "en": "Practise English meaning and sentence context before you make your move.",
    "pl": "Ćwicz angielskie znaczenie i kontekst zdania przed wykonaniem ruchu."
  }
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

const ACCENT = '#ffce00';

// ─────────────────────────────────────────────────────────────────────────
// renderOpenTheBoxReviewItem — per-box locked render for PracticeReview.
// Shows the box number + the MC question + student's last pick + correct
// answer + the explanationPL rule callout. Mirrors the live shell's poster
// styling so the review feels like a frozen scoreboard.
// ─────────────────────────────────────────────────────────────────────────
const OTB_REVIEW_ACCENT = '#ffce00';
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
          color: isWrong ? '#ff3871' : '#00eb91',
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
              border: `1px solid ${showCorrect ? '#00eb9188' : showWrong ? '#ff387188' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? '#00eb91' : showWrong ? '#ff3871' : 'var(--em-text, #EDE6FF)',
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
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const activePuzzle: ArcadePuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : DEMO_PUZZLE;
  const persisted = useShellProgress('openthebox');
  const arcadeEvent = useArcadeEvents();
  const { later, cancel: cancelActionTimers } = useActionTimers();

  const initialBoxes = (): BoxState[] => activePuzzle.rounds.map(() => ({ face: 'closed', tries: 0, pickedIndex: null }));
  const [boxes, setBoxes] = useState<BoxState[]>(initialBoxes);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [revealedHint, setRevealedHint] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const [dial, setDial] = useState(0);
  const [loot, setLoot] = useState(0);
  const [lockBusy, setLockBusy] = useState(false);
  const lockRef = useRef(false);
  const recoveredLocks = useRef(new Set<number>());
  const [lastLoot, setLastLoot] = useState('First-attempt locks earn 150. Recover a lock for 100.');

  const sealedCount = boxes.filter(b => b.face === 'sealed').length;
  const total = activePuzzle.rounds.length;
  const completed = sealedCount === total;
  useActionCompletion(completed, Boolean(forcedState), arcadeEvent);
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
      brief: OPENTHEBOX_INSTRUCTIONS.whatYouDo.en[0],
      brief_pl: OPENTHEBOX_INSTRUCTIONS.whatYouDo.pl[0],
      detail: OPENTHEBOX_INSTRUCTIONS.controls.en.join(' ') + ' ' + OPENTHEBOX_INSTRUCTIONS.rightWrongSkip.en.join(' '),
      detail_pl: OPENTHEBOX_INSTRUCTIONS.controls.pl.join(' ') + ' ' + OPENTHEBOX_INSTRUCTIONS.rightWrongSkip.pl.join(' '),
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
      setBoxes(b); setActiveIdx(2); setShake(true); later(() => setShake(false), 380);
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
    if (forcedState || lockRef.current || boxes.some(b => b.face === 'opening')) return;
    if (boxes[i].face === 'sealed') return;
    if (activeIdx !== null && activeIdx !== i) return; // one open at a time
    setDial(0); setActiveIdx(i);
    setBoxes(prev => prev.map((b, j) => j === i ? { ...b, face: 'opening', pickedIndex: null, tries: b.tries >= 2 ? 0 : b.tries } : b));
    later(() => {
      setBoxes(prev => prev.map((b, j) => j === i ? { ...b, face: 'open' } : b));
      setActiveIdx(i);
    }, FLIP_WAIT_MS);
  };

  const closeBox = (i: number): void => {
    setBoxes(prev => prev.map((b, j) => j === i ? { ...b, face: 'slam', pickedIndex: null } : b));
    later(() => {
      setBoxes(prev => prev.map((b, j) => j === i ? { ...b, face: 'closed' } : b));
    }, FLIP_WAIT_MS);
    setActiveIdx(null);
  };

  const pick = (boxIdx: number, optIdx: number): void => {
    if (forcedState || lockRef.current || boxes[boxIdx]?.face !== 'open') return;
    lockRef.current = true; setLockBusy(true);
    const round = activePuzzle.rounds[boxIdx];
    const correct = optIdx === round.answerIndex;
    setBoxes(prev => prev.map((b, j) => j === boxIdx ? { ...b, pickedIndex: optIdx } : b));
    if (correct) {
      const reward = recoveredLocks.current.has(boxIdx) ? 100 : 150; setLoot(n => n + reward); setLastLoot(`SAFE ${String(boxIdx + 1).padStart(2, '0')} CRACKED · +${reward}`); arcadeEvent({ type: 'correct', points: reward });
      later(() => {
        setBoxes(prev => prev.map((b, j) => j === boxIdx ? { ...b, face: 'sealed' } : b));
        setActiveIdx(null); lockRef.current = false; setLockBusy(false);
      }, PICK_WAIT_MS);
    } else {
      recoveredLocks.current.add(boxIdx);
      arcadeEvent({ type: 'incorrect' }); later(() => { lockRef.current = false; setLockBusy(false); }, SLAM_DELAY_MS + FLIP_WAIT_MS);
      setShake(true);
      later(() => setShake(false), 380);
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
        later(() => closeBox(boxIdx), SLAM_DELAY_MS);
      }
    }
  };

  const useHint = (): void => {
    if (hintsUsed >= 3 || activeIdx === null) return;
    setRevealedHint(activeIdx);
    setHintsUsed(h => h + 1);
    later(() => setRevealedHint(null), HINT_PULSE_MS);
  };

  const reset = (): void => {
    cancelActionTimers();
    arcadeEvent({ type: 'reset' });
    lockRef.current = false; recoveredLocks.current.clear(); setLockBusy(false); setLoot(0); setDial(0);
    setBoxes(initialBoxes());
    setActiveIdx(null);
    setHintsUsed(0);
    setRevealedHint(null);
    tip.reset();
  };

  const skipBox = (): void => {
    if (activeIdx === null || lockRef.current) return;
    closeBox(activeIdx);
  };

  const cur = activeIdx !== null ? activePuzzle.rounds[activeIdx] : null;
  const curBox = activeIdx !== null ? boxes[activeIdx] : null;

  // Box grid sizing — 3 columns on desktop, auto on mobile.

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
        @keyframes em-otb-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        @media (max-width: 768px) {
          .em-otb-side { display: none !important; }
          .em-otb-layout { grid-template-columns: 1fr !important; padding: 16px !important; }
        }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{liveStatus}</div>

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
<div className="action-three-vault-slot"><ActionPlayfield3D kind="openthebox" data={{reducedMotion:reduceMotion,dial,onPick:openBox,onDial:()=>{if(cur)setDial(d=>(d+1)%cur.options.length);},actors:boxes.map((b,i)=>({id:i,x:0,y:0,state:b.face,selected:activeIdx===i,enabled:b.face!=='sealed'&&(activeIdx===null||activeIdx===i)}))}} controls={<>{boxes.map((b,i)=><button key={i} disabled={b.face==='sealed'||(activeIdx!==null&&activeIdx!==i)} onClick={()=>openBox(i)}>Safe {i+1}{b.face==='sealed'?' ✓':''}</button>)}</>} /></div>
          </div>

          <div className="action-arcade-hud" style={{ position: 'relative', zIndex: 2 }}><div><strong>VAULT HAUL · {loot}</strong><small>{lastLoot} Pick a safe, set its word dial, then turn the key.</small></div><span>{sealedCount}/{total} safes</span></div>
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
                      onClick={() => setDial(oi)}
                      disabled={lockBusy}
                      aria-pressed={dial === oi}
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
                        outline: dial === oi ? '2px solid #ffce00' : 'none',
                        border: `1px solid ${showRight ? '#00eb9166' : showWrong ? '#ff387166' : hinted ? `${ACCENT}88` : 'rgba(255,255,255,0.1)'}`,
                        color: showRight ? '#00eb91' : showWrong ? '#ff3871' : 'var(--em-text)',
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
              <div className="action-arcade-controls" style={{ marginTop: 14 }}><button disabled={lockBusy} aria-label="Turn dial left" onClick={() => setDial(i => (i - 1 + cur.options.length) % cur.options.length)}>↶</button><button disabled={lockBusy} onClick={() => pick(activeIdx as number, dial)} style={{ background: 'linear-gradient(#fde68a,#dca844)', color: '#311c08', minWidth: 180 }}>{lockBusy ? 'Turning the lock…' : `Unlock with ${String.fromCharCode(65 + dial)}`}</button><button disabled={lockBusy} aria-label="Turn dial right" onClick={() => setDial(i => (i + 1) % cur.options.length)}>↷</button></div>
              {curBox.tries > 0 && (
                <div style={{ marginTop: 10, fontFamily: 'var(--em-mono)', fontSize: 10, color: '#ff3871', letterSpacing: '0.16em' }}>
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
                <button className="em-btn em-btn-ghost" onClick={reset}>Restart run</button>
                <button className="em-btn em-btn-primary" onClick={reset}>Play again →</button>
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
                  border: `1px solid ${b.face === 'sealed' ? '#00eb9133' : 'var(--em-line)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: 4,
                      background: b.face === 'sealed' ? '#00eb9122' : `${ACCENT}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--em-mono)', fontSize: 9,
                      color: b.face === 'sealed' ? '#00eb91' : ACCENT,
                      letterSpacing: '0.06em',
                    }}>{String(i + 1).padStart(2, '0')}</div>
                    <div style={{ fontFamily: 'var(--em-mono)', fontSize: 11, color: 'var(--em-text-muted)' }}>
                      {b.face === 'sealed' ? 'SEALED' : b.face === 'open' || b.face === 'opening' ? 'OPEN' : 'LOCKED'}
                    </div>
                  </div>
                  {b.tries > 0 && b.face !== 'sealed' && (
                    <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, color: '#ff3871' }}>
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
