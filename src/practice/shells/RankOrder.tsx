// Rank Order shell — "The Election Hall" district.
// A Senate-style civic hall at dusk: a rostrum and numbered brass voting
// plinths line a podium ladder. Items arrive shuffled in a queue on the
// left; the student drags (or taps to swap) them onto numbered plinths.
// Lime LEDs above the plinths light up green when a plinth holds the
// correct item.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';

import React, { useState, useEffect } from 'react';
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
import { useTouchDragDrop, dropZoneProps } from './useTouchDragDrop';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components';

// Election Hall · Rank Order — full bilingual instruction copy.
const RANKORDER_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A "ballot queue" lists N items along the side of the hall — words, numbers or events.',
      'Brass numbered plinths (1, 2, 3 …) line up across the centre of the hall.',
      'Read the criterion in the subtitle (e.g. "Order alphabetically (A → Z)" or "Order from smallest to largest").',
      'Drag each ballot onto the correct plinth — rank 1 first.',
    ],
    pl: [
      'Po boku sali widać „kolejkę biletów" z N pozycjami — słowa, liczby lub zdarzenia.',
      'Mosiężne ponumerowane mównice (1, 2, 3 …) ustawione są na środku sali.',
      'Przeczytaj kryterium w podtytule (np. „Order alphabetically (A → Z)" lub „Order from smallest to largest").',
      'Przeciągnij każdy bilet na właściwą mównicę — najpierw rangę 1.',
    ],
  },
  controls: {
    en: [
      'Ballot queue (side panel): N items in random order, ready to drag.',
      'Numbered plinths (centre): rank slots 1 through N — each accepts one ballot.',
      'Criterion eyebrow: tells you HOW to order (alphabetical, size, time, etc.).',
      'Q counter: header tally of correctly-ranked ballots.',
      'Skip + Hint buttons: Skip reveals the full order (counts as wrong), Hint highlights the rank-1 ballot.',
    ],
    pl: [
      'Kolejka biletów (panel boczny): N pozycji w losowej kolejności, gotowe do przeciągnięcia.',
      'Ponumerowane mównice (środek): miejsca rangi 1 do N — każda przyjmuje jeden bilet.',
      'Eyebrow z kryterium: mówi JAK ułożyć (alfabetycznie, wg rozmiaru, w czasie, itd.).',
      'Licznik Q: ranga poprawnie ułożonych biletów w nagłówku.',
      'Przyciski Pomiń i Podpowiedź: Pomiń odkrywa pełną kolejność (liczy się jako błąd), Podpowiedź podświetla bilet rangi 1.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right placement: ✓ plinth glows green, ballot snaps in, +1 to your tally.',
      'Wrong placement: ✗ ballot bounces back to the queue, the wrong plinth flashes rose.',
      'Skip: reveals the full correct order so you can memorise it — counts as wrong for this round.',
      'You can re-drag a placed ballot before committing the round.',
    ],
    pl: [
      'Trafienie: ✓ mównica świeci na zielono, bilet wskakuje na miejsce, +1 do wyniku.',
      'Błąd: ✗ bilet wraca do kolejki, błędna mównica mignie na różowo.',
      'Pomiń: pokazuje pełną poprawną kolejność, abyś mógł ją zapamiętać — liczy się jako błąd w tej rundzie.',
      'Przed zatwierdzeniem rundy możesz ponownie przeciągnąć umieszczony bilet.',
    ],
  },
  hintMechanic: {
    en:
      'You have 2 hints per session. Each tap highlights the ballot that should go on the next empty plinth (starting from rank 1). Save them for criteria where two items are very close (e.g. close-in-size or close-in-date).',
    pl:
      'Masz 2 podpowiedzi na sesję. Każde stuknięcie podświetla bilet, który powinien trafić na następną pustą mównicę (zaczynając od rangi 1). Zachowaj je na kryteria, gdzie dwie pozycje są bardzo blisko (np. zbliżony rozmiar lub data).',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each correctly-ranked ballot adds to your session streak. Completing every plinth in a round unlocks the post-shell review with explanations of any wrong placements.',
    pl:
      'Pomiń liczy się jako błąd. Każdy trafnie ułożony bilet buduje serię w sesji. Ułożenie wszystkich mównic w rundzie odblokowuje przegląd z wyjaśnieniami błędów.',
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
// Election Hall scoreboard: criterion + per-position chip showing student's
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
  criterion: 'Order from Monday to Sunday',
  criterion_pl: 'Uporządkuj od poniedziałku do niedzieli',
  items: [
    { id: 'ro-d-1', label: 'Wednesday', label_pl: 'środa',         correctRank: 3 },
    { id: 'ro-d-2', label: 'Friday',    label_pl: 'piątek',        correctRank: 5 },
    { id: 'ro-d-3', label: 'Monday',    label_pl: 'poniedziałek',  correctRank: 1 },
    { id: 'ro-d-4', label: 'Sunday',    label_pl: 'niedziela',     correctRank: 7 },
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
  const activePuzzle = puzzle && puzzle.items.length > 0 ? puzzle : RO_PUZZLE;
  const persisted = useShellProgress('rankorder');

  const N = activePuzzle.items.length;
  // Plinths are slots 1..N. State = array of itemId-or-null per slot.
  const [plinths, setPlinths] = useState<(string | null)[]>(() => Array(N).fill(null));
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintRevealSlot, setHintRevealSlot] = useState<number | null>(null);
  const [revealAll, setRevealAll] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  // When the puzzle changes, re-initialise plinths.
  useEffect(() => {
    setPlinths(Array(N).fill(null));
  }, [N]);

  // What's in the queue = items not yet placed on any plinth.
  const queue = activePuzzle.items.filter((it) => !plinths.includes(it.id));

  const correctlyPlacedCount = plinths.reduce<number>((acc, itemId, slotIdx) => {
    if (!itemId) return acc;
    const item = activePuzzle.items.find((it) => it.id === itemId);
    if (item && item.correctRank === slotIdx + 1) return acc + 1;
    return acc;
  }, 0);
  const allFilled = plinths.every((p) => p !== null);
  const completed = allFilled && correctlyPlacedCount === N && !forcedState;
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount: correctlyPlacedCount,
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
      brief: 'Drag each ballot onto the numbered plinth — rank 1 first.',
      brief_pl: 'Przeciągnij każdy bilet na ponumerowaną mównicę — pierwsza ranga 1.',
      detail: 'The election hall has numbered plinths and a stack of ballots, each with an item to rank. Read the criterion in the subtitle, then drag (or tap-and-place) each ballot onto the plinth where it belongs in order. Wrong drops bounce back; the vote closes when every plinth holds the right ballot.',
      detail_pl: 'Sala wyborcza ma ponumerowane mównice i stos biletów do uszeregowania. Przeczytaj kryterium w podtytule, potem przeciągnij (lub stuknij i postaw) każdy bilet na właściwą mównicę. Błędne rzuty wracają; głosowanie zamyka się, gdy każda mównica ma właściwy bilet.',
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
      setPlinths(sample);
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
    setSelectedItem(null);
    setHoverSlot(null);
    const item = activePuzzle.items.find((it) => it.id === itemId);
    const correct = item?.correctRank === slotIdx + 1;
    setAnnouncement(
      correct
        ? `Correct rank for ${item?.label}.`
        : `${item?.label} placed at rank ${slotIdx + 1}.`,
    );
    if (!correct && item) {
      const correctOwner = activePuzzle.items.find((it) => it.correctRank === slotIdx + 1);
      tip.recordWrong({
        questionId: `slot-${slotIdx + 1}`,
        studentAnswer: item.label,
        correctAnswer: correctOwner?.label ?? `rank ${slotIdx + 1}`,
        explanationPL: activePuzzle.criterion_pl,
        exerciseId: correctOwner?.exerciseId,
      });
    }
  };

  const removeFromSlot = (slotIdx: number) => {
    if (forcedState) return;
    setPlinths((prev) => {
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });
  };

  const reset = () => {
    setPlinths(Array(N).fill(null));
    setSelectedItem(null);
    setHintsUsed(0);
    setHintRevealSlot(null);
    setRevealAll(false);
    tip.reset();
  };

  // Skip = reveal correct order to teach + advance.
  const skip = () => {
    if (forcedState) return;
    setRevealAll(true);
    const correctOrder = Array<string | null>(N).fill(null);
    activePuzzle.items.forEach((it) => { correctOrder[it.correctRank - 1] = it.id; });
    setTimeout(() => setPlinths(correctOrder), 200);
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

  const getTouchHandlers = useTouchDragDrop({
    onDragStart: (sourceId) => setSelectedItem(sourceId),
    onHoverChange: (zoneId) => {
      if (zoneId && zoneId.startsWith('slot-')) {
        setHoverSlot(Number(zoneId.slice(5)));
      } else {
        setHoverSlot(null);
      }
    },
    onDragEnd: () => setHoverSlot(null),
    onDrop: (zoneId, sourceId) => {
      if (zoneId.startsWith('slot-')) {
        const slot = Number(zoneId.slice(5));
        placeItem(slot, sourceId);
      }
    },
  });

  const grad =
    time === 'day'
      ? 'linear-gradient(180deg, #B49AE0 0%, #6E4FB7 100%)'
      : time === 'night'
      ? 'linear-gradient(180deg, #02010C 0%, #100829 60%, #1F1240 100%)'
      : 'linear-gradient(180deg, #1B143E 0%, #3A2B5E 60%, #4A4A2A 100%)';

  return (
    <div
      className="em-shell em-shell-rankorder"
      role="application"
      aria-label="Rank order, The Election Hall"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      <style>{`
        @keyframes em-ro-led-glow {
          0%, 100% { opacity: 0.7; box-shadow: 0 0 6px ${ACCENT}66; }
          50%      { opacity: 1;   box-shadow: 0 0 14px ${ACCENT}, 0 0 24px ${ACCENT}88; }
        }
        @keyframes em-ro-card-rise {
          from { transform: translateY(8px) scale(0.96); opacity: 0; }
          to   { transform: translateY(0)   scale(1);    opacity: 1; }
        }
        @keyframes em-ro-stamp {
          0%   { transform: scale(0.6) rotate(-8deg); opacity: 0; }
          60%  { transform: scale(1.1) rotate(-4deg); opacity: 1; }
          100% { transform: scale(1)   rotate(-4deg); opacity: 0.85; }
        }
      `}</style>

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
      <div
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
          district="The Election Hall"
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
        {/* QUEUE — items waiting in the wings */}
        <div
          className="em-card"
          style={{
            background: 'linear-gradient(180deg, #14082A 0%, #08041A 100%)',
            border: `1px solid ${ACCENT}55`,
            borderRadius: 14,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            animation: 'em-rise 540ms var(--em-ease) both',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div className="em-eyebrow" style={{ color: ACCENT }}>
            BALLOT QUEUE · KOLEJKA
          </div>
          <div className="em-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
            {queue.length === 0 && (
              <div
                style={{
                  padding: '10px 12px',
                  fontFamily: 'var(--em-mono)',
                  fontSize: 11,
                  color: 'var(--em-text-muted)',
                  fontStyle: 'italic',
                }}
              >
                All ballots cast. Check the plinths.
              </div>
            )}
            {queue.map((it) => {
              const isSelected = selectedItem === it.id;
              return (
                <div
                  key={it.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  {...getTouchHandlers(it.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', it.id);
                    setSelectedItem(it.id);
                  }}
                  onClick={() => setSelectedItem((prev) => (prev === it.id ? null : it.id))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedItem((prev) => (prev === it.id ? null : it.id));
                    }
                  }}
                  aria-label={`Ballot: ${it.label} (${it.label_pl}). ${isSelected ? 'Selected — tap a plinth to place.' : 'Tap or drag to place.'}`}
                  aria-pressed={isSelected}
                  style={{
                    cursor: 'grab',
                    userSelect: 'none',
                    padding: '12px 14px',
                    background: isSelected
                      ? `linear-gradient(180deg, ${ACCENT}, #6E8A2F)`
                      : 'linear-gradient(180deg, #F5EBD8 0%, #E0D3B5 100%)',
                    color: '#1A0F08',
                    borderRadius: 4,
                    border: '1px solid #5A4220',
                    boxShadow: isSelected
                      ? `0 0 14px ${ACCENT}aa, 0 4px 8px rgba(0,0,0,0.4)`
                      : '0 4px 8px rgba(0,0,0,0.4)',
                    fontFamily: 'var(--em-display)',
                    fontWeight: 700,
                    fontSize: 14,
                    animation: 'em-ro-card-rise 320ms var(--em-ease) both',
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <span>{it.label}</span>
                  <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10, opacity: 0.55 }}>
                    {it.label_pl}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* PLINTHS */}
        <div
          className="em-card"
          style={{
            background: 'linear-gradient(180deg, #14082A 0%, #08041A 100%)',
            border: `1px solid ${ACCENT}55`,
            borderRadius: 14,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            animation: 'em-rise 620ms var(--em-ease) both',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="em-eyebrow" style={{ color: ACCENT }}>
              PODIUM PLINTHS · MÓWNICE
            </div>
            <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, color: 'var(--em-text-muted)', letterSpacing: '0.08em' }}>
              criterion: {activePuzzle.criterion_pl}
            </div>
          </div>

          <div className="em-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
            {plinths.map((itemId, slotIdx) => {
              const item = itemId ? activePuzzle.items.find((it) => it.id === itemId) : null;
              const correct = item?.correctRank === slotIdx + 1;
              const isHovered = hoverSlot === slotIdx;
              const isHinted = hintRevealSlot === slotIdx;
              const correctItem = activePuzzle.items.find((it) => it.correctRank === slotIdx + 1);
              return (
                <div
                  key={slotIdx}
                  {...dropZoneProps(`slot-${slotIdx}`)}
                  role="region"
                  aria-label={`Plinth rank ${slotIdx + 1}${item ? `, holds ${item.label}, ${correct ? 'correct' : 'incorrect'}` : ', empty'}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setHoverSlot(slotIdx);
                  }}
                  onDragLeave={() => setHoverSlot((h) => (h === slotIdx ? null : h))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const labelId = e.dataTransfer.getData('text/plain');
                    if (labelId) placeItem(slotIdx, labelId);
                    setHoverSlot(null);
                  }}
                  onClick={() => {
                    if (selectedItem) placeItem(slotIdx, selectedItem);
                    else if (item) removeFromSlot(slotIdx);
                  }}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    minHeight: 56,
                    borderRadius: 6,
                    background: item
                      ? correct
                        ? 'linear-gradient(180deg, rgba(190,242,100,0.16), rgba(190,242,100,0.04))'
                        : 'linear-gradient(180deg, rgba(251,113,133,0.12), rgba(251,113,133,0.04))'
                      : isHovered
                      ? 'rgba(190,242,100,0.12)'
                      : 'rgba(255,255,255,0.04)',
                    border: isHinted
                      ? `2px dashed ${ACCENT}`
                      : item
                      ? correct
                        ? `1.5px solid ${ACCENT}`
                        : '1.5px solid #FB7185'
                      : `1px dashed ${ACCENT}55`,
                    transition: 'all 220ms var(--em-ease)',
                    cursor: selectedItem ? 'crosshair' : item ? 'pointer' : 'default',
                  }}
                >
                  {/* LED */}
                  <div
                    aria-hidden="true"
                    style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: correct ? ACCENT : 'rgba(255,255,255,0.18)',
                      boxShadow: correct ? `0 0 14px ${ACCENT}aa` : 'none',
                      animation: correct ? 'em-ro-led-glow 1.6s var(--em-ease) infinite' : 'none',
                      flexShrink: 0,
                    }}
                  />
                  {/* Rank number */}
                  <div
                    style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'linear-gradient(180deg, #E0A33F, #876543)',
                      color: '#1A0F08',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--em-decor)', fontSize: 16, fontWeight: 700,
                      boxShadow: '0 4px 8px rgba(0,0,0,0.35), inset 0 -2px 0 rgba(0,0,0,0.2)',
                      flexShrink: 0,
                    }}
                  >
                    {slotIdx + 1}
                  </div>
                  {/* Item or placeholder */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {item ? (
                      <>
                        <div
                          style={{
                            fontFamily: 'var(--em-decor)',
                            fontSize: 16,
                            color: 'var(--em-text)',
                          }}
                        >
                          {item.label}
                        </div>
                        <div className="em-eyebrow" style={{ color: 'var(--em-text-muted)' }}>
                          {item.label_pl}
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          fontFamily: 'var(--em-mono)',
                          fontSize: 11,
                          color: 'var(--em-text-muted)',
                          fontStyle: 'italic',
                          letterSpacing: '0.08em',
                        }}
                      >
                        Drop a ballot here · {selectedItem ? 'tap to place' : 'rank ' + (slotIdx + 1)}
                      </div>
                    )}
                  </div>
                  {/* Stamp on correct */}
                  {item && correct && (
                    <div
                      aria-hidden="true"
                      style={{
                        fontFamily: 'var(--em-mono)',
                        fontSize: 10,
                        color: ACCENT,
                        letterSpacing: '0.18em',
                        animation: 'em-ro-stamp 0.45s var(--em-ease) both',
                      }}
                    >
                      ✓ FILED
                    </div>
                  )}
                  {/* Hint reveal */}
                  {isHinted && correctItem && (
                    <div
                      role="status"
                      style={{
                        position: 'absolute',
                        right: 8,
                        bottom: -22,
                        padding: '4px 8px',
                        background: `${ACCENT}22`,
                        border: `1px dashed ${ACCENT}`,
                        borderRadius: 4,
                        fontFamily: 'var(--em-mono)',
                        fontSize: 10,
                        color: 'var(--em-text)',
                        animation: 'em-tip-fade 220ms var(--em-ease) both',
                        zIndex: 5,
                      }}
                    >
                      Should be: <span style={{ color: ACCENT }}>{correctItem.label}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {revealAll && !completed && (
            <div
              role="status"
              style={{
                padding: '8px 10px',
                background: `${ACCENT}14`,
                border: `1px dashed ${ACCENT}aa`,
                borderRadius: 6,
                fontFamily: 'var(--em-mono)',
                fontSize: 10,
                color: 'var(--em-text)',
                letterSpacing: '0.04em',
                animation: 'em-tip-fade 220ms var(--em-ease) both',
              }}
            >
              Order revealed. Try again to memorise.
            </div>
          )}
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 24, left: 28, right: 28, display: 'flex', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between', zIndex: 4 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520 }}>
        </div>
      </div>

      {completed && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Election Hall complete"
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
            The vote is in.
          </div>
          <div className="em-eyebrow">SESSION ADJOURNED · POSIEDZENIE ZAKOŃCZONE</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="em-btn em-btn-ghost" onClick={reset} aria-label="Hold another vote">
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
