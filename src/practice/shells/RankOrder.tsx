import { Challenge3D } from './challenge-3d';
import { rankAssessment } from './challenge-arcade-logic';
import { ChallengeMission, useChallengeArcade } from './challenge-arcade';
// Rank Order — load the freight wagons, then dispatch the complete sequence.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';

import React, { useState, useEffect } from 'react';
import { Bajla, Progress, Nameplate, SkipButton, HintButton, Confetti, useEndOfShellTip } from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';

// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components';

// Freight Marshalling Yard · Rank Order — full bilingual instructions.
const RANKORDER_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'Each freight wagon carries a word, number or event.',
      'Read the numbered track sockets from rank 1 onwards.',
      'Read the criterion in the subtitle (e.g. "Order alphabetically (A → Z)" or "Order from smallest to largest").',
      'Choose a wagon, then its track socket. Dispatch the full train to check your order.',
    ],
    pl: [
      'Każdy wagon przewozi słowo, liczbę lub zdarzenie.',
      'Miejsca na torze są ponumerowane od 1.',
      'Przeczytaj kryterium w podtytule (np. „Order alphabetically (A → Z)" lub „Order from smallest to largest").',
      'Wybierz wagon, a potem jego miejsce na torze. Wyślij cały pociąg, aby sprawdzić kolejność.',
    ],
  },
  controls: {
    en: [
      'Wagon shelves hold the items. Use the shelf arrows to reach the rest.',
      'Select a wagon and a numbered socket to load it. Select a filled socket with no wagon selected to unload it.',
      'Dispatch train checks the entire sequence. Correctness is revealed only after dispatch.',
      'The Q counter shows correctly ranked wagons after checking.',
      'Hint reveals the item for the first empty or incorrect position. Skip reveals the complete order.',
    ],
    pl: [
      'Strzałki półek pokazują kolejne wagony i miejsca na torze.',
      'Wybierz wagon i ponumerowane miejsce. Aby usunąć wagon, stuknij zajęte miejsce bez wybranego wagonu.',
      'Sprawdź kolejność ocenia cały pociąg. Podczas układania nie widzisz poprawności.',
      'Licznik Q pokazuje poprawnie ustawione wagony po sprawdzeniu.',
      'Podpowiedź wskazuje element dla pierwszej pustej lub błędnej pozycji. Pomiń odkrywa całą kolejność.',
    ],
  },
  rightWrongSkip: {
    en: [
      'After dispatch, correct wagons glow green and earn arcade points.',
      'Incorrect positions are marked. Move or unload those wagons, then dispatch again.',
      'Skip reveals the full order without awarding points for unanswered positions.',
      'You can rearrange the wagons before dispatching.',
    ],
    pl: [
      'Po wysłaniu poprawne wagony świecą na zielono i dają punkty arcade.',
      'Błędne pozycje są oznaczone. Przestaw lub usuń te wagony i sprawdź ponownie.',
      'Pomiń pokazuje całą kolejność bez punktów za nierozwiązane pozycje.',
      'Przed wysłaniem możesz zmieniać ustawienie wagonów.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per run. Each reveals the item for the first empty or incorrectly filled track socket.',
    pl:
      'Masz 3 podpowiedzi na rundę. Każda wskazuje element dla pierwszego pustego lub błędnie zajętego miejsca na torze.',
  },
  scoring: {
    en:
      'Each correctly ranked wagon builds your streak. Completing the train opens the session review. Rechecking a correct wagon does not award points twice.',
    pl:
      'Każdy poprawnie ustawiony wagon buduje serię. Ukończenie pociągu otwiera przegląd sesji. Ponowne sprawdzenie poprawnego wagonu nie daje punktów drugi raz.',
  },
  l1Pattern: {
    en:
      'Ordering + comprehension. Polish ordering vocabulary (najpierw, potem, na końcu) maps onto English with extra connectors (first, then, after that, finally) — this drill builds the EN sequence-marker vocabulary alongside the ranking task.',
    pl:
      'Porządkowanie + rozumienie. Polskie słownictwo porządkujące (najpierw, potem, na końcu) tłumaczy się na angielskie z większą liczbą łączników (first, then, after that, finally) — ten poziom buduje angielską warstwę markerów sekwencji obok samego porządkowania.',
  },
};

export type RankOrderForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

interface RankItem {
  id: string;
  label: string;
  label_pl: string;
  correctRank: number; // 1-indexed
  exerciseId?: string;
}

export interface RankOrderPuzzle {
  criterion: string;
  criterion_pl: string;
  items: RankItem[];
}

export interface RankOrderShellProps {
  time?: TimeOfDay;
  state?: RankOrderForcedState;
  puzzle?: RankOrderPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3 Wave-5 (Ricky 2026-05-02): per-position review payload. Fires once
   * when every plinth holds the correctly-ranked item.
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
    puzzle: RankOrderPuzzle;
    /** Final ordering: index 0 → slot 1, etc. Each entry is the itemId placed there. */
    finalOrdering: (string | null)[];
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// renderRankOrderReviewItem — full-ordering locked render for PracticeReview.
// Freight yard scoreboard: criterion + per-position chip showing student's
// pick vs canonical pick. Single review item rendering all N positions.
// ─────────────────────────────────────────────────────────────────────────
const RO_REVIEW_ACCENT = '#BEF264';
export function renderRankOrderReviewItem(
  puzzle: RankOrderPuzzle,
  finalOrdering: (string | null)[],
): React.ReactNode {
  const N = puzzle.items.length;
  const correctOrdering = Array<RankItem | null>(N).fill(null);
  puzzle.items.forEach((it) => { if (it.correctRank >= 1 && it.correctRank <= N) correctOrdering[it.correctRank - 1] = it; });
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: 'linear-gradient(180deg, rgba(190,242,100,0.08), rgba(20,16,42,0.55))',
      border: `1px solid rgba(190,242,100,0.45)`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${RO_REVIEW_ACCENT}22`, color: RO_REVIEW_ACCENT,
          border: `1px solid ${RO_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          ELECTION HALL · WYBORY
        </span>
        <span aria-hidden="true" style={{ marginLeft: 'auto', fontSize: 14, opacity: 0.7 }}>🏛️</span>
      </div>
      <div style={{ fontFamily: 'var(--em-decor)', fontSize: 16, lineHeight: 1.3, color: 'var(--em-text, #EDE6FF)' }}>
        {puzzle.criterion}
      </div>
      <div style={{ fontFamily: 'var(--em-body)', fontSize: 12, color: 'var(--em-text-muted)', fontStyle: 'italic' }}>
        🇵🇱 {puzzle.criterion_pl}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {Array.from({ length: N }).map((_, slotIdx) => {
          const studentItemId = finalOrdering[slotIdx];
          const studentItem = studentItemId ? puzzle.items.find((it) => it.id === studentItemId) : null;
          const correctItem = correctOrdering[slotIdx];
          const isCorrect = studentItem && correctItem && studentItem.id === correctItem.id;
          return (
            <div key={slotIdx} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 4,
              background: isCorrect ? 'rgba(190,242,100,0.10)' : 'rgba(251,113,133,0.10)',
              border: `1px solid ${isCorrect ? 'rgba(190,242,100,0.35)' : 'rgba(251,113,133,0.35)'}`,
              fontSize: 13,
            }}>
              <span style={{
                fontFamily: 'var(--em-mono)', fontSize: 10, fontWeight: 700,
                color: RO_REVIEW_ACCENT, minWidth: 24,
              }}>#{slotIdx + 1}</span>
              <span style={{ flex: 1, color: 'var(--em-text)' }}>
                {studentItem ? studentItem.label : <span style={{ opacity: 0.5, fontStyle: 'italic' }}>— empty</span>}
              </span>
              {isCorrect ? (
                <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10, color: RO_REVIEW_ACCENT, fontWeight: 700 }}>✓ TAK</span>
              ) : (
                <>
                  <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10, color: '#FB7185', fontWeight: 700 }}>✗ NIE</span>
                  {correctItem && (
                    <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10, color: RO_REVIEW_ACCENT, opacity: 0.85 }}>
                      → {correctItem.label}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { RankItem as ShellRankOrderItem };

const RO_PUZZLE: RankOrderPuzzle = {
  criterion: 'Order the weekdays from Monday to Friday',
  criterion_pl: 'Uporządkuj dni robocze od poniedziałku do piątku',
  items: [
    { id: 'ro-d-1', label: 'Wednesday', label_pl: 'środa',         correctRank: 3 },
    { id: 'ro-d-2', label: 'Friday',    label_pl: 'piątek',        correctRank: 5 },
    { id: 'ro-d-3', label: 'Monday',    label_pl: 'poniedziałek',  correctRank: 1 },
    { id: 'ro-d-4', label: 'Thursday', label_pl: 'czwartek', correctRank: 4 },
    { id: 'ro-d-5', label: 'Tuesday',   label_pl: 'wtorek',        correctRank: 2 },
  ],
};

const ACCENT = '#BEF264';

export const RankOrderShell: React.FC<RankOrderShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const arcade = useChallengeArcade();
  const activePuzzle = puzzle && puzzle.items.length > 0 ? puzzle : RO_PUZZLE;
  const persisted = useShellProgress('rankorder');

  const N = activePuzzle.items.length;
  // Plinths are slots 1..N. State = array of itemId-or-null per slot.
  const [skippedScore, setSkippedScore] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [plinths, setPlinths] = useState<(string | null)[]>(() => Array(N).fill(null));

  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintRevealSlot, setHintRevealSlot] = useState<number | null>(null);

  const [announcement, setAnnouncement] = useState('');

  // When the puzzle changes, re-initialise plinths.
  useEffect(() => {
    setPlinths(Array(N).fill(null));
  }, [N]);

  // What's in the queue = items not yet placed on any plinth.

  const actualCorrectCount = rankAssessment(activePuzzle.items, plinths).filter(Boolean).length;
  const correctlyPlacedCount = checked ? actualCorrectCount : 0;
  const allFilled = plinths.every((p) => p !== null);
  const completed = allFilled && correctlyPlacedCount === N && !forcedState;
  useEffect(() => { if (completed && !forcedState) arcade.finish(); }, [completed, forcedState]);
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount: skippedScore ?? correctlyPlacedCount,
        totalQuestions: N,
        wrongAttempts,
        puzzle: activePuzzle,
        finalOrdering: plinths,
      });
    } : undefined,
  });

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'rankorder',
      brief: "Load the wagons in the order required by the criterion.",
      brief_pl: "Ustaw wagony zgodnie z podanym kryterium.",
      detail: "Choose a wagon and its numbered track socket. Dispatch the complete train to check the sequence. Adjust any marked positions and dispatch again.",
      detail_pl: "Wybierz wagon i ponumerowane miejsce na torze. Wyślij cały pociąg, aby sprawdzić kolejność. Popraw oznaczone pozycje i sprawdź ponownie.",
      fullInstructions: RANKORDER_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (forcedState) return;
    persisted.save({
      progress: correctlyPlacedCount / Math.max(N, 1),
      lastState: completed ? 'complete' : 'active',
    });
    if (completed) {
      persisted.save({ progress: 1, completed: true, lastState: 'complete' });
    }
  }, [correctlyPlacedCount, completed, forcedState, N]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') {
      setPlinths(Array(N).fill(null));
    }
    if (forcedState === 'active') {
      // First two correctly placed.
      const sample = Array<string | null>(N).fill(null);
      activePuzzle.items.slice(0, 2).forEach((it) => { sample[it.correctRank - 1] = it.id; });
      setPlinths(sample);
    }
    if (forcedState === 'correct') {
      const sample = Array<string | null>(N).fill(null);
      activePuzzle.items.slice(0, 3).forEach((it) => { sample[it.correctRank - 1] = it.id; });
      setPlinths(sample);
    }
    if (forcedState === 'wrong') {
      const sample = Array<string | null>(N).fill(null);
      // Place item 1 in slot 2 (wrong).
      const it = activePuzzle.items[0];
      const wrongSlot = (it.correctRank % N);
      sample[wrongSlot] = it.id;
      setPlinths(sample);
    }
    if (forcedState === 'complete') {
      const sample = Array<string | null>(N).fill(null);
      activePuzzle.items.forEach((it) => { sample[it.correctRank - 1] = it.id; });
      setPlinths(sample); setChecked(true);
    }
  }, [forcedState, activePuzzle.items, N]);

  // Place an item on a slot. If the slot is occupied, swap.
  const placeItem = (slotIdx: number, itemId: string) => {
    if (forcedState) return;
    setPlinths((prev) => {
      const next = [...prev];
      // Remove itemId from any other slot first.
      const oldSlot = next.indexOf(itemId);
      if (oldSlot >= 0 && oldSlot !== slotIdx) next[oldSlot] = null;
      // If destination has something, swap that to the old slot.
      const displaced = next[slotIdx];
      if (displaced && oldSlot >= 0) {
        next[oldSlot] = displaced;
      }
      next[slotIdx] = itemId;
      return next;
    });

    setChecked(false);
    setAnnouncement('Wagon loaded. Dispatch the full train when ready.');
  };

  const checkOrder = () => {
    if (forcedState || !allFilled || checked) return;
    plinths.forEach((id, slotIdx) => {
      const item = activePuzzle.items.find(it => it.id === id);
      if (!item) return;
      const correct = item.correctRank === slotIdx + 1;
      arcade.decide(correct, `rank-${item.id}`);
      if (!correct) {
        const owner = activePuzzle.items.find(it => it.correctRank === slotIdx + 1);
        tip.recordWrong({questionId:`slot-${slotIdx+1}`,studentAnswer:item.label,correctAnswer:owner?.label ?? '',explanationPL:activePuzzle.criterion_pl,exerciseId:owner?.exerciseId});
      }
    });
    setChecked(true);
    setAnnouncement(actualCorrectCount === N
      ? `All ${N} wagons are in order. Train dispatched!`
      : `${actualCorrectCount} of ${N} wagons in order. Adjust the marked positions and dispatch again.`);
  };

  const removeFromSlot = (slotIdx: number) => {
    if (forcedState) return;
    setChecked(false);
    setPlinths((prev) => {
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });
  };

  const reset = () => {
    arcade.reset(); setChecked(false); setSkippedScore(null);
    setPlinths(Array(N).fill(null));

    setHintsUsed(0);
    setHintRevealSlot(null);

    tip.reset();
  };

  // Skip = reveal correct order to teach + advance.
  const skip = () => {
    if (forcedState) return;
    setSkippedScore(correctlyPlacedCount);
    plinths.forEach((id, i) => {
      const owner = activePuzzle.items.find(it => it.correctRank === i + 1);
      if (owner && id !== owner.id) tip.recordWrong({questionId:`slot-${i+1}`,studentAnswer:'(skipped)',correctAnswer:owner.label,explanationPL:activePuzzle.criterion_pl,exerciseId:owner.exerciseId});
    });
     setChecked(true);
    const correctOrder = Array<string | null>(N).fill(null);
    activePuzzle.items.forEach((it) => { correctOrder[it.correctRank - 1] = it.id; });
    setPlinths(correctOrder);
  };

  const useHint = () => {
    if (forcedState || hintsUsed >= 3) return;
    // Reveal the rank of the first wrongly-placed or empty slot.
    const firstWrongSlot = plinths.findIndex((id, slotIdx) => {
      if (!id) return true;
      const item = activePuzzle.items.find((it) => it.id === id);
      return item?.correctRank !== slotIdx + 1;
    });
    if (firstWrongSlot < 0) return;
    setHintRevealSlot(firstWrongSlot);
    setHintsUsed((h) => h + 1);
    setTimeout(() => setHintRevealSlot(null), 3500);
  };

  const grad =
    time === 'day'
      ? 'linear-gradient(180deg, #B49AE0 0%, #6E4FB7 100%)'
      : time === 'night'
      ? 'linear-gradient(180deg, #02010C 0%, #100829 60%, #1F1240 100%)'
      : 'linear-gradient(180deg, #1B143E 0%, #3A2B5E 60%, #4A4A2A 100%)';

  return (
    <div
      className="em-shell em-shell-rankorder challenge-enhanced"
      role="application"
      aria-label="Rank order, The Freight Marshalling Yard"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      {/* Ricky 2026-05-02 (#15 audit pass): zIndex:0 + pointerEvents:none on the
          background gradient — main grid is zIndex:3, top bar zIndex:4. */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: grad }} />
      {/* Senate hall ceiling lines */}
      <svg viewBox="0 0 1200 800" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none' }} aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <line
            key={i}
            x1={0}
            y1={40 + i * 20}
            x2={1200}
            y2={40 + i * 20}
            stroke="#BEF264"
            strokeWidth={i === 0 ? 1.2 : 0.4}
          />
        ))}
        <path d="M 0 760 Q 600 700 1200 760 L 1200 800 L 0 800 Z" fill="#0E0A1A" opacity="0.5" />
      </svg>
      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true" />

      {/* Top bar */}
      <div className="challenge-enhanced-toolbar"
        style={{
          position: 'relative',
          padding: '20px 28px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          zIndex: 4,
        }}
      >
        <AmbientAudioPlayer shellSlug="rankorder" />
        <Nameplate
          district="The Freight Marshalling Yard"
          subtitle={`Rank order · Uporządkuj · ${activePuzzle.criterion}`}
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="3" y="14" width="4" height="6" stroke={ACCENT} strokeWidth="1.4" fill="none" />
              <rect x="9" y="9" width="4" height="11" stroke={ACCENT} strokeWidth="1.4" fill="none" />
              <rect x="15" y="4" width="4" height="16" stroke={ACCENT} strokeWidth="1.4" fill="none" />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress current={correctlyPlacedCount} total={N} accent={ACCENT} />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      <div
        className="em-shell-ro-layout"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 0.85fr) minmax(0, 1.4fr)',
          gap: 24,
          padding: '8px 28px 24px',
          height: 'calc(100% - 92px)',
          boxSizing: 'border-box',
          zIndex: 3,
        }}
      >
        <ChallengeMission title="Load the wagons. Dispatch the train." detail="Build the full sequence before dispatching. Move any misplaced wagon and try again. · Ułóż cały pociąg i sprawdź kolejność." current={checked ? correctlyPlacedCount : plinths.filter(Boolean).length} total={N}>
        </ChallengeMission>
        <Challenge3D game="RankOrder" hint={hintRevealSlot===null?undefined:`Rank ${hintRevealSlot+1}: ${activePuzzle.items.find(it=>it.correctRank===hintRevealSlot+1)?.label}`} prompt={activePuzzle.criterion}
          items={activePuzzle.items.map(it=>({id:it.id,label:it.label}))}
          slots={plinths.map((id,i)=>{const item=activePuzzle.items.find(it=>it.id===id);return {id:String(i),label:item?.label||`Rank ${i+1}`,state:checked && item ? item.correctRank===i+1?'right':'wrong':'idle'};})}
          onPlace={(slot,id)=>placeItem(Number(slot),id)} onRemove={slot=>removeFromSlot(Number(slot))}
          onAction={checkOrder} actionLabel="Dispatch train · Sprawdź kolejność" actionDisabled={!allFilled || checked}
          locked={completed || !!forcedState} status={announcement} />

        {/* QUEUE — items waiting in the wings */}

        {/* PLINTHS */}

      </div>

      <div style={{ position: 'absolute', bottom: 24, left: 28, right: 28, display: 'flex', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between', zIndex: 4 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520 }}>
        </div>
      </div>

      {completed && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Freight train complete"
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 14, animation: 'em-rise 0.4s var(--em-ease)', zIndex: 12,
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>
            The train is ready.
          </div>
          <div className="em-eyebrow">READY FOR DEPARTURE · GOTOWY DO ODJAZDU</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="em-btn em-btn-ghost" onClick={reset} aria-label="Assemble another train">
              Try another
            </button>
          </div>
        </div>
      )}
      <Confetti show={completed} />
    </div>
  );
};

export default RankOrderShell;
