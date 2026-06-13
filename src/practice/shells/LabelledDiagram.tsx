// Labelled Diagram shell — "The Atrium Schematic" district.
// A blueprint chamber: an architectural drafting paper grid with the
// atrium silhouette laid over it. Hotspots are pinpoints (small cyan
// rings) on the diagram; labels arrive in a tray as brass nameplates
// the student drags onto the right pinpoint. Mobile: tap a label, then
// tap a hotspot.
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

// Atrium Schematic · Labelled Diagram — full bilingual instruction copy.
const LABELLEDDIAGRAM_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'An architectural blueprint of the atrium fills the screen with a grid and an N-compass.',
      'Several pinpoints (small circles) mark named features of the building — beam, column, arch, staircase, etc.',
      'Brass labels float in a tray on the side, each with the EN word and PL translation.',
      'Drag a label and drop it onto the matching pinpoint. On a phone: tap a label, then tap a pinpoint.',
    ],
    pl: [
      'Plan architektoniczny atrium wypełnia ekran z siatką i kompasem N.',
      'Kilka punktów (małe kółka) oznacza nazwane elementy budynku — belka, kolumna, łuk, schody itd.',
      'Mosiężne etykiety pływają w tacy z boku, każda z angielskim słowem i polskim tłumaczeniem.',
      'Przeciągnij etykietę na pasujący punkt. Na telefonie: stuknij etykietę, potem stuknij punkt.',
    ],
  },
  controls: {
    en: [
      'Schematic blueprint: grid + N-compass + named pinpoints.',
      'Label tray: brass-rim chips with EN/PL pairs (e.g. "beam · belka").',
      'Pinpoints: small circles on the diagram — each accepts exactly one label.',
      'Q counter: header tally of labels placed correctly.',
      'Skip + Hint buttons: Skip jumps the round, Hint reveals one label\'s pinpoint with a glow.',
    ],
    pl: [
      'Schematyczny plan: siatka + kompas N + nazwane punkty.',
      'Taca etykiet: mosiężne plakietki z parami EN/PL (np. „beam · belka").',
      'Punkty: małe kółka na diagramie — każdy przyjmuje dokładnie jedną etykietę.',
      'Licznik Q: ranga poprawnie umieszczonych etykiet w nagłówku.',
      'Przyciski Pomiń i Podpowiedź: Pomiń przeskakuje rundę, Podpowiedź podświetla punkt jednej etykiety.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right placement: ✓ pinpoint glows green, label snaps into place, +1 to your tally.',
      'Wrong placement: ✗ label bounces back to the tray, the wrong pinpoint flashes rose — try again.',
      'Skip: counts as wrong — moves to the next diagram.',
      'You can pick up a placed label and re-drop it before committing the round.',
    ],
    pl: [
      'Trafienie: ✓ punkt świeci na zielono, etykieta wskakuje na miejsce, +1 do wyniku.',
      'Błąd: ✗ etykieta wraca do tacy, błędny punkt mignie na różowo — spróbuj ponownie.',
      'Pomiń: liczy się jako błąd — przejście do następnego diagramu.',
      'Możesz podnieść umieszczoną etykietę i upuścić ją ponownie, zanim zatwierdzisz rundę.',
    ],
  },
  hintMechanic: {
    en:
      'You have 2 hints per session. Each tap reveals one label\'s correct pinpoint with a glow + the EN/PL hint text. Save them for diagrams with very similar architectural features (e.g. "beam" vs "lintel").',
    pl:
      'Masz 2 podpowiedzi na sesję. Każde stuknięcie podświetla poprawny punkt jednej etykiety + tekst EN/PL podpowiedzi. Zachowaj je na diagramy z bardzo podobnymi elementami (np. „beam" vs „lintel").',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each correctly-placed label adds to your session streak. Completing all hotspots in a diagram unlocks the post-shell review with explanations of any wrong placements.',
    pl:
      'Pomiń liczy się jako błąd. Każda trafnie umieszczona etykieta buduje serię w sesji. Ukończenie wszystkich punktów na diagramie odblokowuje przegląd z wyjaśnieniami błędów.',
  },
  l1Pattern: {
    en:
      'Spatial vocabulary. Polish architectural terms map onto English ones with subtle differences (PL "belka" can mean both "beam" and "girder"; PL "schody" covers both "stairs" and "staircase"). This drill builds precise EN-side distinctions.',
    pl:
      'Słownictwo przestrzenne. Polskie terminy architektoniczne tłumaczą się na angielskie z subtelnymi różnicami (PL „belka" to „beam" lub „girder"; PL „schody" to „stairs" lub „staircase"). Ten poziom uczy precyzyjnych rozróżnień po angielsku.',
  },
};

export type LabelledDiagramForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

interface LDHotspot {
  id: string;
  x: number; // 0-100 percent of viewBox
  y: number;
  label: string;
  label_pl: string;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface LabelledDiagramPuzzle {
  diagram_svg: string;
  diagram_url?: string;
  title: string;
  title_pl: string;
  hotspots: LDHotspot[];
}

export interface LabelledDiagramShellProps {
  time?: TimeOfDay;
  state?: LabelledDiagramForcedState;
  puzzle?: LabelledDiagramPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3 Wave-5 (Ricky 2026-05-02): per-hotspot review payload. Fires once
   * when every hotspot in the diagram has been correctly labelled.
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
    puzzle: LabelledDiagramPuzzle;
    placement: Record<string, string>;
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// renderLabelledDiagramReviewItem — per-hotspot locked render for PracticeReview.
// Atrium Schematic scoreboard: diagram-thumb hotspot dot + student's label
// guess + correct label.
// ─────────────────────────────────────────────────────────────────────────
const LD_REVIEW_ACCENT = '#7DD3FC';
export function renderLabelledDiagramReviewItem(
  hotspot: LDHotspot,
  number: number,
  diagramSvg: string,
  studentLabel: string | undefined,
  studentLabelPl: string | undefined,
): React.ReactNode {
  const correct = hotspot.label;
  const stu = studentLabel ?? '';
  const isWrong = stu.length > 0 && stu !== correct;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: isWrong
        ? 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(125,211,252,0.10), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(125,211,252,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${LD_REVIEW_ACCENT}22`, color: LD_REVIEW_ACCENT,
          border: `1px solid ${LD_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          HOTSPOT {String(number).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(125,211,252,0.22)',
          color: isWrong ? '#FB7185' : LD_REVIEW_ACCENT,
        }}>
          {isWrong ? '✗ MISLABELLED · BŁĘDNIE' : '✓ LABELLED · POPRAWNIE'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Diagram thumb with the hotspot dot circled. */}
        <div style={{
          flex: '0 0 96px', height: 76, borderRadius: 4,
          border: '1px solid rgba(125,211,252,0.35)', background: '#06031A',
          position: 'relative', overflow: 'hidden',
        }}>
          <div
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, opacity: 0.55 }}
            dangerouslySetInnerHTML={{ __html: diagramSvg }}
          />
          {/* Hotspot dot at hotspot.x/y%. */}
          <div aria-hidden="true" style={{
            position: 'absolute',
            left: `${hotspot.x}%`, top: `${hotspot.y}%`,
            width: 12, height: 12, marginLeft: -6, marginTop: -6,
            borderRadius: '50%',
            background: isWrong ? '#FB7185' : LD_REVIEW_ACCENT,
            border: '2px solid rgba(245,235,216,0.85)',
            boxShadow: `0 0 8px ${isWrong ? '#FB7185' : LD_REVIEW_ACCENT}aa`,
          }} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isWrong && (
            <div style={{ color: '#FB7185', fontFamily: 'var(--em-decor)', fontSize: 16 }}>
              ✗ NIE · You labelled: <strong>{stu}</strong>
              {studentLabelPl && <span style={{ opacity: 0.7, fontStyle: 'italic' }}> ({studentLabelPl})</span>}
            </div>
          )}
          <div style={{ color: LD_REVIEW_ACCENT, fontFamily: 'var(--em-decor)', fontSize: 16 }}>
            ✓ TAK · The label: <strong>{correct}</strong>
            <span style={{ opacity: 0.7, fontStyle: 'italic' }}> ({hotspot.label_pl})</span>
          </div>
          {hotspot.hint_pl && (
            <div style={{ fontFamily: 'var(--em-body)', fontSize: 12, color: 'var(--em-text-muted)', fontStyle: 'italic' }}>
              🇵🇱 {hotspot.hint_pl}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type { LDHotspot as ShellLabelledDiagramHotspot };

// Built-in atrium fallback used when no puzzle is supplied.
const FALLBACK_SVG = `<svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
  <defs>
    <pattern id="atriumGrid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#7DD3FC" stroke-width="0.4" opacity="0.35"/>
    </pattern>
  </defs>
  <rect width="400" height="320" fill="url(#atriumGrid)"/>
  <path d="M 60 60 L 200 24 L 340 60" fill="none" stroke="#7DD3FC" stroke-width="2"/>
  <line x1="80" y1="80" x2="320" y2="80" stroke="#7DD3FC" stroke-width="2"/>
  <rect x="62"  y="80"  width="14" height="190" fill="none" stroke="#7DD3FC" stroke-width="2"/>
  <rect x="324" y="80"  width="14" height="190" fill="none" stroke="#7DD3FC" stroke-width="2"/>
  <path d="M 130 270 Q 200 100 270 270" fill="none" stroke="#7DD3FC" stroke-width="2"/>
  <line x1="40" y1="280" x2="360" y2="280" stroke="#7DD3FC" stroke-width="2.5"/>
  <path d="M 290 280 L 290 256 L 310 256 L 310 232 L 330 232 L 330 208" fill="none" stroke="#7DD3FC" stroke-width="2"/>
</svg>`;

const LD_PUZZLE: LabelledDiagramPuzzle = {
  diagram_svg: FALLBACK_SVG,
  title: 'Atrium Schematic',
  title_pl: 'Schemat atrium',
  hotspots: [
    { id: 'roof',      x: 50, y: 14, label: 'roof',      label_pl: 'dach',     hint: 'Above the beams.', hint_pl: 'Nad belkami.' },
    { id: 'beam',      x: 50, y: 28, label: 'beam',      label_pl: 'belka',    hint: 'Horizontal structural member.', hint_pl: 'Pozioma belka konstrukcyjna.' },
    { id: 'column',    x: 18, y: 60, label: 'column',    label_pl: 'kolumna',  hint: 'Vertical support on the left.', hint_pl: 'Pionowe podparcie po lewej.' },
    { id: 'arch',      x: 50, y: 50, label: 'arch',      label_pl: 'łuk',      hint: 'Curved span in the middle.', hint_pl: 'Łukowate przejście pośrodku.' },
    { id: 'floor',     x: 50, y: 88, label: 'floor',     label_pl: 'podłoga',  hint: 'Below it all.', hint_pl: 'Pod wszystkim.' },
    { id: 'staircase', x: 82, y: 70, label: 'staircase', label_pl: 'schody',   hint: 'Steps rising to the right.', hint_pl: 'Stopnie po prawej.' },
  ],
};

const ACCENT = '#7DD3FC';

export const LabelledDiagramShell: React.FC<LabelledDiagramShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const activePuzzle = puzzle && puzzle.hotspots.length > 0 ? puzzle : LD_PUZZLE;
  const persisted = useShellProgress('labelleddiagram');

  // placement[hotspotId] = labelId currently dropped on it (correct or not).
  const [placement, setPlacement] = useState<Record<string, string>>({});
  // Tap-to-place: when a label is selected, the next hotspot tap places it.
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [hoverHotspot, setHoverHotspot] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean } | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintReveal, setHintReveal] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [showAllLabels, setShowAllLabels] = useState(false);

  // Total = number of hotspots; solved = correctly placed labels.
  const total = activePuzzle.hotspots.length;
  const solved = activePuzzle.hotspots.filter((h) => placement[h.id] === h.id).length;
  const completed = solved >= total && !forcedState;
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount: solved,
        totalQuestions: total,
        wrongAttempts,
        puzzle: activePuzzle,
        placement,
      });
    } : undefined,
  });

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'labelleddiagram',
      brief: 'Drag each brass label onto its matching pinpoint on the diagram.',
      brief_pl: 'Przeciągnij każdą mosiężną etykietę na właściwy punkt na diagramie.',
      detail: 'The diagram has numbered hotspots; the label tray below carries one brass tag per hotspot. Drag each label onto its matching point. On a phone, tap a label to pick it up, then tap a pinpoint. Wrong drops bounce back to the tray.',
      detail_pl: 'Diagram ma numerowane punkty; taca poniżej zawiera jedną mosiężną etykietę dla każdego punktu. Przeciągnij każdą etykietę na właściwy punkt. Na telefonie: stuknij etykietę, aby ją podnieść, potem stuknij punkt. Błędne rzuty wracają na tacę.',
      fullInstructions: LABELLEDDIAGRAM_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (forcedState) return;
    persisted.save({
      progress: solved / Math.max(total, 1),
      lastState: solved >= total ? 'complete' : 'active',
    });
    if (solved >= total) {
      persisted.save({ progress: 1, completed: true, lastState: 'complete' });
    }
  }, [solved, forcedState, total]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') { setPlacement({}); setSelectedLabelId(null); }
    if (forcedState === 'active') {
      const first = activePuzzle.hotspots[0];
      setPlacement({ [first.id]: first.id });
      setSelectedLabelId(activePuzzle.hotspots[1]?.id ?? null);
    }
    if (forcedState === 'correct') {
      const map: Record<string, string> = {};
      activePuzzle.hotspots.slice(0, 3).forEach((h) => { map[h.id] = h.id; });
      setPlacement(map);
    }
    if (forcedState === 'wrong') {
      const first = activePuzzle.hotspots[0];
      const second = activePuzzle.hotspots[1];
      setPlacement(second ? { [first.id]: second.id } : {});
      setFeedback({ id: first.id, ok: false });
    }
    if (forcedState === 'complete') {
      const map: Record<string, string> = {};
      activePuzzle.hotspots.forEach((h) => { map[h.id] = h.id; });
      setPlacement(map);
    }
  }, [forcedState, activePuzzle.hotspots]);

  // Place a label onto a hotspot. Validates correctness.
  const placeLabel = (hotspotId: string, labelId: string) => {
    if (forcedState) return;
    setPlacement((prev) => {
      // If this label is currently placed elsewhere, remove it from there first.
      const cleaned: Record<string, string> = {};
      Object.entries(prev).forEach(([h, l]) => {
        if (l !== labelId) cleaned[h] = l;
      });
      cleaned[hotspotId] = labelId;
      return cleaned;
    });
    const correct = labelId === hotspotId;
    setFeedback({ id: hotspotId, ok: correct });
    setSelectedLabelId(null);
    setHoverHotspot(null);
    const hs = activePuzzle.hotspots.find((h) => h.id === hotspotId);
    setAnnouncement(
      correct
        ? `Correct. ${hs?.label} placed.`
        : `Not quite. That label belongs elsewhere.`,
    );
    if (!correct) {
      const wantedHotspot = activePuzzle.hotspots.find((h) => h.id === hotspotId);
      tip.recordWrong({
        questionId: hotspotId,
        studentAnswer: labelId,
        correctAnswer: wantedHotspot?.label ?? hotspotId,
        explanationPL: wantedHotspot?.hint_pl,
        exerciseId: wantedHotspot?.exerciseId,
      });
    }
    setTimeout(() => setFeedback(null), 900);
  };

  const removePlacement = (hotspotId: string) => {
    if (forcedState) return;
    setPlacement((prev) => {
      const next = { ...prev };
      delete next[hotspotId];
      return next;
    });
  };

  const reset = () => {
    setPlacement({});
    setFeedback(null);
    setSelectedLabelId(null);
    setHoverHotspot(null);
    setHintsUsed(0);
    setHintReveal(null);
    tip.reset();
  };

  const skip = () => {
    // No "next question" — Skip auto-fills the first un-placed label as a "give up" gesture
    // that visibly advances the seen counter without solving (counts as a wrong attempt).
    if (forcedState) return;
    const unplaced = activePuzzle.hotspots.find((h) => !placement[h.id]);
    if (!unplaced) return;
    // Place the wrong label (the first available wrong one) so the counter ticks but solved doesn't.
    const wrongLabel = activePuzzle.hotspots.find((h) => h.id !== unplaced.id && !Object.values(placement).includes(h.id));
    if (wrongLabel) {
      setPlacement((prev) => ({ ...prev, [unplaced.id]: wrongLabel.id }));
    }
  };

  const useHint = () => {
    if (forcedState || hintsUsed >= 3) return;
    const unplaced = activePuzzle.hotspots.find((h) => !placement[h.id]);
    if (!unplaced) return;
    setHintReveal(unplaced.id);
    setHintsUsed((h) => h + 1);
    setTimeout(() => setHintReveal(null), 3000);
  };

  // Touch DnD: when finger lifts on a hotspot, place that label.
  const getTouchHandlers = useTouchDragDrop({
    onDragStart: (sourceId) => setSelectedLabelId(sourceId),
    onHoverChange: (zoneId) => setHoverHotspot(zoneId),
    onDragEnd: () => setHoverHotspot(null),
    onDrop: (zoneId, sourceId) => {
      placeLabel(zoneId, sourceId);
    },
  });

  // Pool of labels still to be placed (in the tray).
  const trayLabels = activePuzzle.hotspots.filter((h) => !Object.values(placement).includes(h.id));

  const grad =
    time === 'day'
      ? 'linear-gradient(180deg, #B49AE0 0%, #6E4FB7 100%)'
      : time === 'night'
      ? 'linear-gradient(180deg, #02010C 0%, #100829 60%, #1F1240 100%)'
      : 'linear-gradient(180deg, #14123E 0%, #1F2D58 60%, #29466E 100%)';

  return (
    <div
      className="em-shell em-shell-labelleddiagram"
      role="application"
      aria-label="Labelled diagram, The Atrium Schematic"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      <style>{`
        @keyframes em-ld-pin-pulse {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50%      { transform: scale(1.3); opacity: 1; }
        }
        @keyframes em-ld-snap-correct {
          0%   { transform: scale(0.85); }
          50%  { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        @keyframes em-ld-tape-rise {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        /* Mobile (2026-06-05, Phase-2 ticket #4): the desktop 2-column grid
           (diagram | tray) squeezed the diagram to ~180px, so the hotspots
           bunched up and were hard to tap in portrait. Stack to a single
           column — diagram on top at full width (its SVG + hotspot overlay
           are width:100%, so they scale up and spread the pinpoints), tray
           below with its own scroll. !important beats the inline
           grid-template-columns. No landscape prompt needed. */
        @media (max-width: 768px) {
          .em-shell-ld-layout {
            grid-template-columns: 1fr !important;
            grid-template-rows: minmax(0, 1.6fr) minmax(0, 1fr) !important;
            gap: 12px !important;
            padding: 8px 14px 14px !important;
          }
          .em-ld-tray { min-height: 0; }
          .em-ld-tray > .em-card { overflow-y: auto; }
        }
      `}</style>

      <div style={{ position: 'absolute', inset: 0, background: grad }} />
      {/* drafting board paper */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, transparent 0 39px, rgba(125,211,252,0.06) 39px 40px), repeating-linear-gradient(90deg, transparent 0 39px, rgba(125,211,252,0.06) 39px 40px)',
          pointerEvents: 'none',
        }}
      />
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
        <AmbientAudioPlayer shellSlug="labelleddiagram" />
        <Nameplate
          district="The Atrium Schematic"
          subtitle={`Labelled Diagram · Etykietowanie · trace the architectural plan`}
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="3" y="3" width="16" height="16" stroke={ACCENT} strokeWidth="1.4" fill="none" />
              <line x1="3" y1="8" x2="19" y2="8" stroke={ACCENT} strokeWidth="0.8" />
              <line x1="3" y1="13" x2="19" y2="13" stroke={ACCENT} strokeWidth="0.8" />
              <line x1="8" y1="3" x2="8" y2="19" stroke={ACCENT} strokeWidth="0.8" />
              <line x1="13" y1="3" x2="13" y2="19" stroke={ACCENT} strokeWidth="0.8" />
              <circle cx="13" cy="8" r="1.5" fill={ACCENT} />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress current={solved} total={total} accent={ACCENT} />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      <div
        className="em-shell-ld-layout"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 24,
          padding: '8px 28px 24px',
          height: 'calc(100% - 92px)',
          boxSizing: 'border-box',
          zIndex: 3,
        }}
      >
        {/* DIAGRAM PANE */}
        <div
          className="em-card"
          style={{
            position: 'relative',
            background: 'linear-gradient(180deg, #14082A 0%, #08041A 100%)',
            border: `1px solid ${ACCENT}55`,
            borderRadius: 14,
            padding: 18,
            animation: 'em-rise 540ms var(--em-ease) both',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* SVG diagram (inline, rendered via dangerouslySetInnerHTML — generator-supplied,
              never user-supplied — so the XSS surface is the same as our generator code). */}
          <div
            aria-hidden="true"
            style={{ position: 'absolute', inset: 18, opacity: 0.85, pointerEvents: 'none' }}
            dangerouslySetInnerHTML={{ __html: activePuzzle.diagram_svg }}
          />

          {/* Hotspots overlay */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 560,
              aspectRatio: '5 / 4',
            }}
            role="group"
            aria-label="Diagram hotspots"
          >
            {activePuzzle.hotspots.map((h) => {
              const placedLabelId = placement[h.id];
              const placed = activePuzzle.hotspots.find((hh) => hh.id === placedLabelId);
              const isCorrect = placedLabelId === h.id;
              const isHovered = hoverHotspot === h.id;
              const isHinted = hintReveal === h.id;
              const fb = feedback?.id === h.id ? feedback : null;

              return (
                <div
                  key={h.id}
                  {...dropZoneProps(h.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Hotspot ${h.label}${
                    placed
                      ? `, currently labelled "${placed.label}"${isCorrect ? ' (correct)' : ' (incorrect)'}`
                      : ', empty — drop a label here'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setHoverHotspot(h.id);
                  }}
                  onDragLeave={() => setHoverHotspot(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const labelId = e.dataTransfer.getData('text/plain');
                    if (labelId) placeLabel(h.id, labelId);
                    setHoverHotspot(null);
                  }}
                  onClick={() => {
                    if (selectedLabelId) {
                      placeLabel(h.id, selectedLabelId);
                    } else if (placedLabelId) {
                      removePlacement(h.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (selectedLabelId) placeLabel(h.id, selectedLabelId);
                      else if (placedLabelId) removePlacement(h.id);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    left: `${h.x}%`,
                    top: `${h.y}%`,
                    transform: 'translate(-50%, -50%)',
                    minWidth: 44,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: selectedLabelId ? 'crosshair' : placedLabelId ? 'pointer' : 'crosshair',
                  }}
                >
                  {/* pinpoint */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      width: placedLabelId ? 16 : 12,
                      height: placedLabelId ? 16 : 12,
                      borderRadius: '50%',
                      background: isCorrect
                        ? '#34D399'
                        : placedLabelId && !isCorrect
                        ? '#FB7185'
                        : isHovered
                        ? ACCENT
                        : 'rgba(125,211,252,0.85)',
                      boxShadow: isCorrect
                        ? '0 0 14px #34D399'
                        : placedLabelId && !isCorrect
                        ? '0 0 14px #FB7185'
                        : isHovered || isHinted
                        ? `0 0 14px ${ACCENT}`
                        : `0 0 6px ${ACCENT}88`,
                      animation: !placedLabelId
                        ? 'em-ld-pin-pulse 2.2s var(--em-ease) infinite'
                        : isHinted
                        ? 'em-ld-pin-pulse 0.8s var(--em-ease) infinite'
                        : 'none',
                      border: '1.5px solid rgba(255,255,255,0.4)',
                    }}
                  />
                  {/* placed label as brass nameplate */}
                  {placed && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '4px 10px',
                        background: isCorrect
                          ? 'linear-gradient(180deg, #E0A33F, #B89E66)'
                          : 'rgba(251,113,133,0.65)',
                        color: '#1A0F08',
                        fontFamily: 'var(--em-display)',
                        fontWeight: 700,
                        fontSize: 12,
                        borderRadius: 3,
                        border: '1px solid #5A4220',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
                        whiteSpace: 'nowrap',
                        animation: fb?.ok ? 'em-ld-snap-correct 0.4s var(--em-ease) both' : fb && !fb.ok ? 'em-shake 0.4s' : 'none',
                      }}
                    >
                      {placed.label}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* TRAY */}
        <div
          className="em-ld-tray"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minWidth: 0,
          }}
        >
          <div
            className="em-card"
            style={{
              padding: 18,
              background: 'linear-gradient(180deg, #14082A 0%, #08041A 100%)',
              border: `1px solid ${ACCENT}55`,
              borderRadius: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              animation: 'em-rise 620ms var(--em-ease) both',
            }}
          >
            <div className="em-eyebrow" style={{ color: ACCENT }}>
              Labels · etykiety · drag onto the pinpoints
            </div>
            <div
              role="list"
              aria-label="Available labels"
              style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
            >
              {trayLabels.length === 0 && (
                <div
                  style={{
                    padding: '10px 12px',
                    fontFamily: 'var(--em-mono)',
                    fontSize: 11,
                    color: 'var(--em-text-muted)',
                    fontStyle: 'italic',
                  }}
                >
                  All labels placed.
                </div>
              )}
              {trayLabels.map((h) => {
                const isSelected = selectedLabelId === h.id;
                return (
                  <div
                    key={h.id}
                    role="listitem"
                    tabIndex={0}
                    draggable
                    {...getTouchHandlers(h.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', h.id);
                      setSelectedLabelId(h.id);
                    }}
                    onClick={() =>
                      setSelectedLabelId((prev) => (prev === h.id ? null : h.id))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedLabelId((prev) => (prev === h.id ? null : h.id));
                      }
                    }}
                    aria-label={`Label "${h.label}" (${h.label_pl}). ${isSelected ? 'Selected — tap a pinpoint to place.' : 'Tap to select, or drag to a pinpoint.'}`}
                    aria-pressed={isSelected}
                    style={{
                      cursor: 'grab',
                      userSelect: 'none',
                      padding: '10px 14px',
                      background: isSelected
                        ? `linear-gradient(180deg, ${ACCENT}, #4A8AA8)`
                        : 'linear-gradient(180deg, #E0A33F 0%, #B89E66 100%)',
                      color: '#1A0F08',
                      borderRadius: 4,
                      border: '1px solid #5A4220',
                      boxShadow: isSelected
                        ? `0 0 12px ${ACCENT}aa, 0 4px 8px rgba(0,0,0,0.4)`
                        : '0 4px 8px rgba(0,0,0,0.4)',
                      fontFamily: 'var(--em-display)',
                      fontWeight: 700,
                      fontSize: 14,
                      letterSpacing: '0.04em',
                      transition: 'all 220ms var(--em-ease)',
                      animation: 'em-ld-tape-rise 320ms var(--em-ease) both',
                      minHeight: 44,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      <circle cx="5" cy="5" r="2" fill="#1A0F08" />
                    </svg>
                    {h.label}
                    <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10, opacity: 0.6, marginLeft: 4 }}>
                      {h.label_pl}
                    </span>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowAllLabels((s) => !s)}
              aria-pressed={showAllLabels}
              aria-label={showAllLabels ? 'Hide label legend' : 'Show full label legend'}
              style={{
                alignSelf: 'flex-start',
                padding: '6px 12px',
                background: 'transparent',
                color: 'var(--em-text)',
                border: `1px solid ${ACCENT}55`,
                borderRadius: 999,
                fontFamily: 'var(--em-mono)',
                fontSize: 10,
                letterSpacing: '0.12em',
                cursor: 'pointer',
                marginTop: 4,
              }}
            >
              {showAllLabels ? '▾ Hide legend · Ukryj' : '▸ Show legend · Pokaż'}
            </button>

            {showAllLabels && (
              <div
                role="region"
                aria-label="Full label legend"
                style={{
                  padding: '8px 10px',
                  background: 'rgba(125,211,252,0.08)',
                  border: `1px dashed ${ACCENT}66`,
                  borderRadius: 6,
                  fontFamily: 'var(--em-mono)',
                  fontSize: 10,
                  color: 'var(--em-text-muted)',
                  letterSpacing: '0.04em',
                  animation: 'em-tip-fade 220ms var(--em-ease) both',
                  display: 'grid',
                  gap: 4,
                }}
              >
                {activePuzzle.hotspots.map((h) => (
                  <div key={h.id}>
                    <span style={{ color: ACCENT }}>{h.label}</span> · {h.label_pl}
                  </div>
                ))}
              </div>
            )}

            {hintReveal && (
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
                <span className="em-eyebrow" style={{ color: ACCENT, marginRight: 6 }}>HINT</span>
                {activePuzzle.hotspots.find((h) => h.id === hintReveal)?.hint}
                <div style={{ marginTop: 2, color: 'var(--em-text-muted)' }}>
                  🇵🇱 {activePuzzle.hotspots.find((h) => h.id === hintReveal)?.hint_pl}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {completed && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Atrium Schematic complete"
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
            The blueprint is complete.
          </div>
          <div className="em-eyebrow">SCHEMATIC FILED · SCHEMAT ZAARCHIWIZOWANY</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="em-btn em-btn-ghost" onClick={reset} aria-label="Try another diagram">
              Try another
            </button>
          </div>
        </div>
      )}
      <Confetti show={completed} />
    </div>
  );
};

export default LabelledDiagramShell;
