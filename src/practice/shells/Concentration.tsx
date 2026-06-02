// Concentration — "The Memory Cellar" district.
// A stone cellar with a wooden card-table and an oil lamp. Each round produces
// two face-down cards: a PROMPT card (the question) and an ANSWER card (the
// correct option). All N pairs are dealt face-down on the felt. Player flips
// two cards at a time, looking for prompt-answer matches.
//
// Visual identity: the only shell with literal 3D card flips. Backface-hidden
// transforms, cellar stone walls, the lamp's warm pool of light. The other
// shells move forward through one question at a time; this one is a board.
//
// Persisted progress — Convex-backed.
import { useShellProgress } from '../lib/convex-stubs';
import React, { useEffect, useMemo, useState } from 'react';
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

// Memory Cellar · Concentration — full bilingual instruction copy.
const CONCENTRATION_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A board of face-down cards is dealt on the cellar table — pairs are scrambled (CLUE card + matching WORD card).',
      'Tap a card to flip it face-up; tap a second card to try a match.',
      'If they pair (clue ↔ word) they stay face-up and lock; if not, both flip back after a brief pause.',
      'Clear the whole board by finding every pair — your job is to remember positions over multiple turns.',
    ],
    pl: [
      'Plansza zakrytych kart leży na stole w piwnicy — pary są pomieszane (karta-PODPOWIEDŹ + pasująca karta-SŁOWO).',
      'Stuknij kartę, aby ją odwrócić; stuknij drugą, aby spróbować pary.',
      'Jeśli się dobierają (podpowiedź ↔ słowo) — zostają odsłonięte i zablokowane; jeśli nie, obie odwracają się po chwili.',
      'Wyczyść całą planszę, znajdując wszystkie pary — Twoim zadaniem jest pamiętać położenia przez wiele tur.',
    ],
  },
  controls: {
    en: [
      'Card grid: face-down cards laid out on cellar felt; magenta sparkle-pin pattern on the backs.',
      'Card faces: CLUE cards show a sentence-with-gap; WORD cards show the candidate word.',
      'Mismatch flip-back: ~1.2 second window before both cards flip face-down again.',
      'Lock state: matched pairs stay face-up with a soft halo so you don\'t re-tap them.',
      'Skip + Hint buttons: Skip burns the active flip pair, Hint briefly previews any one card.',
    ],
    pl: [
      'Siatka kart: zakryte karty leżą na filcu piwnicy; magenta wzór z pinezek-iskier na rewersach.',
      'Awersy kart: karty PODPOWIEDŹ pokazują zdanie z luką; karty SŁOWO pokazują kandydata.',
      'Powrót na rewers: ok. 1,2 sekundy okno, zanim obie karty się odwrócą z powrotem.',
      'Stan zablokowany: dopasowane pary zostają odsłonięte z delikatną aureolą, żebyś ich nie stukał ponownie.',
      'Przyciski Pomiń i Podpowiedź: Pomiń wypala aktywną parę, Podpowiedź krótko podgląda dowolną jedną kartę.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right pair: ✓ green halo on both cards, +1 to your tally, the pair locks face-up.',
      'Wrong pair: ✗ rose flash, both cards flip back after ~1.2 seconds; no penalty beyond the lost turn.',
      'Skip: counts as a wrong pair — the active flip pair flips back without the natural delay.',
      'You can re-attempt any unmatched pair as many times as needed; the round only ends when every pair is locked.',
    ],
    pl: [
      'Trafna para: ✓ zielona aureola na obu kartach, +1 do wyniku, para blokuje się odsłonięta.',
      'Błędna para: ✗ różowy błysk, obie karty wracają na rewers po ok. 1,2 sekundy; bez kary poza utraconą turą.',
      'Pomiń: liczy się jako błędna para — aktywna para wraca na rewers bez naturalnego opóźnienia.',
      'Każdą niedopasowaną parę możesz próbować dowolnie wiele razy; runda kończy się dopiero, gdy wszystkie pary są zablokowane.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Each tap briefly previews any one face-down card (~0.6 seconds). Save them for the last 2–3 unmatched pairs when you need to confirm a position.',
    pl:
      'Masz 3 podpowiedzi na sesję. Każde stuknięcie krótko podgląda dowolną zakrytą kartę (ok. 0,6 sekundy). Zachowaj je na ostatnie 2–3 pary, gdy musisz potwierdzić pozycję.',
  },
  scoring: {
    en:
      'Skip counts as a wrong pair. Each match adds to your session streak. Clearing every pair on the board unlocks the post-shell review with explanations of any tricky pairings.',
    pl:
      'Pomiń liczy się jako błędna para. Każda para buduje serię w sesji. Wyczyszczenie całej planszy odblokowuje przegląd po sesji z wyjaśnieniami trudnych par.',
  },
  l1Pattern: {
    en:
      'Working-memory + vocab-recall drill. Polish learners often confuse word position in a sentence vs the word itself; pairing CLUE ↔ WORD strengthens the association between sentence-context and target lexeme.',
    pl:
      'Trening pamięci roboczej + przypominania słownictwa. Polscy uczniowie mylą pozycję słowa w zdaniu z samym słowem; dopasowywanie PODPOWIEDŹ ↔ SŁOWO wzmacnia związek kontekstu zdania z docelowym leksemem.',
  },
};

// ─────────────────────────────────────────────────────────────
// Local types — mirror of WrapperPuzzle (no adapters.ts changes)
// ─────────────────────────────────────────────────────────────
export interface WrapperRound {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}
export interface WrapperPuzzle { rounds: WrapperRound[]; }

export type ConcentrationForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface ConcentrationShellProps {
  time?: TimeOfDay;
  state?: ConcentrationForcedState;
  puzzle?: WrapperPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3-Concentration (Ricky wave-3, 2026-05-02): fires once when every pair
   * has been matched. Mounts <PracticeReview> at the host. Per item: each
   * card pair becomes one review row showing clue card + word card + status
   * (matched on first try / matched after retries / never matched [unreachable
   * since the round ends only on full board clear]) + count of attempts.
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
    puzzle: WrapperPuzzle;
    /** Per-pair attempt counts so review can render "1 try / N tries". */
    attemptCounts: Record<string, number>;
  }) => void;
}

// ─────────────────────────────────────────────────────────────
// Demo deck
// ─────────────────────────────────────────────────────────────
const CO_DEMO: WrapperPuzzle = {
  rounds: [
    { id: 'cellar', prompt: 'A cool, dark room under a building.', options: ['attic', 'cellar', 'porch', 'roof'], answerIndex: 1, hint: 'Below ground level.', hint_pl: 'Po polsku: piwnica.' },
    { id: 'lamp', prompt: 'A small light fueled by oil.', options: ['mirror', 'kettle', 'lamp', 'shelf'], answerIndex: 2, hint: 'You light it with a match.', hint_pl: 'Po polsku: lampa.' },
    { id: 'memory', prompt: 'The brain\'s ability to recall the past.', options: ['memory', 'hunger', 'shadow', 'roof'], answerIndex: 0, hint: 'You "have a good ___".', hint_pl: 'Po polsku: pamięć.' },
    { id: 'pair', prompt: 'A set of two matching things.', options: ['triple', 'single', 'pair', 'crowd'], answerIndex: 2, hint: 'Two of a kind.', hint_pl: 'Po polsku: para.' },
    { id: 'oak', prompt: 'A heavy hardwood used for furniture.', options: ['silk', 'oak', 'sand', 'glass'], answerIndex: 1, hint: 'Tree with acorns.', hint_pl: 'Po polsku: dąb.' },
    { id: 'shadow', prompt: 'The dark shape behind something blocking the light.', options: ['flame', 'water', 'cloud', 'shadow'], answerIndex: 3, hint: 'Cast by your body in the sun.', hint_pl: 'Po polsku: cień.' },
  ],
};

const ACCENT = '#A78BFA';

// ─────────────────────────────────────────────────────────────────────────
// renderConcentrationReviewItem — per-pair locked render for PracticeReview.
// Shows the clue card + word card side-by-side + attempt count + status
// (matched on first try / matched after retries). The "never matched" branch
// is unreachable here since the round can only end on a full board clear,
// but is kept for defensive rendering when a host pipes in a partial session.
// ─────────────────────────────────────────────────────────────────────────
const CO_REVIEW_ACCENT = '#A78BFA';
export function renderConcentrationReviewItem(
  round: WrapperRound,
  attempts: number,
  matched: boolean,
): React.ReactNode {
  const word = round.options[round.answerIndex];
  const onFirstTry = matched && attempts <= 1;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: matched
        ? `linear-gradient(180deg, ${CO_REVIEW_ACCENT}1c, rgba(20,16,42,0.55))`
        : 'linear-gradient(180deg, rgba(245,239,255,0.04), rgba(20,16,42,0.55))',
      border: `1px solid ${matched ? `${CO_REVIEW_ACCENT}66` : 'rgba(245,239,255,0.18)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: matched
            ? (onFirstTry ? 'rgba(52,211,153,0.18)' : `${CO_REVIEW_ACCENT}22`)
            : 'rgba(245,239,255,0.08)',
          color: matched ? (onFirstTry ? '#34D399' : CO_REVIEW_ACCENT) : 'rgba(245,239,255,0.5)',
        }}>
          {matched
            ? (onFirstTry ? '✓ FIRST TRY · OD RAZU' : `✓ ${attempts} TRIES · ${attempts} PRÓB`)
            : '— UNMATCHED · NIEDOPASOWANE'}
        </span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10,
        alignItems: 'center',
      }}>
        {/* CLUE card */}
        <div style={{
          padding: '10px 12px', borderRadius: 6,
          background: 'linear-gradient(180deg, #F4EFEF 0%, #DCD2D2 100%)',
          color: '#1F0E40',
          border: '1px solid rgba(0,0,0,0.4)',
          minHeight: 72,
        }}>
          <div className="em-eyebrow" style={{ color: '#7A5A2A', fontSize: 8, marginBottom: 4, letterSpacing: '0.18em' }}>
            CLUE · KARTA
          </div>
          <div style={{ fontFamily: 'var(--em-body, serif)', fontSize: 11, lineHeight: 1.4 }}>
            {round.prompt}
          </div>
        </div>
        <div aria-hidden style={{
          fontFamily: 'var(--em-mono)', fontSize: 14,
          color: matched ? CO_REVIEW_ACCENT : 'rgba(245,239,255,0.4)',
        }}>↔</div>
        {/* WORD card */}
        <div style={{
          padding: '10px 12px', borderRadius: 6,
          background: `linear-gradient(180deg, ${CO_REVIEW_ACCENT}33 0%, #1F0E40 100%)`,
          color: '#F4EFEF',
          border: `1px solid ${CO_REVIEW_ACCENT}88`,
          minHeight: 72,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div className="em-eyebrow" style={{ color: CO_REVIEW_ACCENT, fontSize: 8, marginBottom: 4, letterSpacing: '0.18em' }}>
            WORD · SŁOWO
          </div>
          <div style={{ fontFamily: 'var(--em-decor)', fontSize: 18, letterSpacing: '0.04em' }}>
            {word}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CardModel {
  key: string;       // unique board-cell key
  pairId: string;    // which round this card belongs to
  side: 'prompt' | 'answer';
  text: string;
}

// Deterministic seedable shuffle (small — reuse pattern from rng.ts inline).
function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export const ConcentrationShell: React.FC<ConcentrationShellProps> = ({
  time = 'night',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const active: WrapperPuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : CO_DEMO;
  const persisted = useShellProgress('concentration');

  // Build the board — for each round emit a prompt card + the correct answer
  // card; shuffle the whole pile.
  const board = useMemo<CardModel[]>(() => {
    const cards: CardModel[] = [];
    active.rounds.forEach((r) => {
      cards.push({ key: `${r.id}-p`, pairId: r.id, side: 'prompt', text: r.prompt });
      cards.push({ key: `${r.id}-a`, pairId: r.id, side: 'answer', text: r.options[r.answerIndex] });
    });
    return deterministicShuffle(cards, active.rounds.length * 31 + 11);
  }, [active]);

  const [flipped, setFlipped] = useState<string[]>([]);   // currently face-up but unmatched
  const [matched, setMatched] = useState<string[]>([]);   // pairId list, completed
  const [wrongFlash, setWrongFlash] = useState<string[]>([]); // brief mismatch shake
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [hintGlow, setHintGlow] = useState<string | null>(null); // pairId
  const [announcement, setAnnouncement] = useState<string>('');
  // D3-Concentration (Ricky wave-3, 2026-05-02): per-pair attempt counter so
  // the review screen can show "matched on 1st try" vs "matched after N tries".
  // Bumped on every flip-pair attempt for that pairId (via the prompt card's
  // pairId — answer cards mirror it).
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});

  const completed = !forcedState && matched.length === active.rounds.length;

  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount: matched.length,
        totalQuestions: active.rounds.length,
        wrongAttempts,
        puzzle: active,
        attemptCounts,
      });
    } : undefined,
  });

  // Persistence
  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'concentration',
      brief: 'Flip cards two at a time to find clue and word pairs.',
      brief_pl: 'Odwracaj karty po dwie, aby znaleźć pary podpowiedź i słowo.',
      detail: 'Each round has a clue card and a word card hidden in the grid. Tap a card to flip it; flip a second to test the pair. If they match, both stay open; if not, both flip back. Match every pair to clear the cellar.',
      detail_pl: 'Każda runda to karta-podpowiedź i karta-słowo ukryte w siatce. Stuknij kartę, aby ją odwrócić; odwróć drugą, aby sprawdzić parę. Pasujące zostają, niepasujące wracają na rewers. Dopasuj wszystkie pary, by oczyścić piwnicę.',
      fullInstructions: CONCENTRATION_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (forcedState) return;
    const total = active.rounds.length;
    persisted.save({ progress: matched.length / total, lastState: matched.length === total ? 'complete' : 'active' });
    if (matched.length === total) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [matched.length, forcedState, active.rounds.length]);

  // Forced-state previews
  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty')   { setFlipped([]); setMatched([]); }
    if (forcedState === 'active')  { setFlipped([board[0]?.key].filter(Boolean) as string[]); setMatched([]); }
    if (forcedState === 'correct') { setFlipped([]); setMatched([active.rounds[0].id]); }
    if (forcedState === 'wrong')   { setFlipped([board[0]?.key, board[3]?.key].filter(Boolean) as string[]); setWrongFlash([board[0]?.key, board[3]?.key].filter(Boolean) as string[]); }
    if (forcedState === 'complete'){ setFlipped([]); setMatched(active.rounds.map((r) => r.id)); }
  }, [forcedState, active.rounds, board]);

  const onFlip = (key: string): void => {
    if (forcedState) return;
    if (matched.some((pid) => board.find((c) => c.pairId === pid)?.pairId === board.find((c) => c.key === key)?.pairId)) return;
    if (flipped.includes(key)) return;
    if (wrongFlash.length > 0) return;
    if (flipped.length >= 2) return;

    const card = board.find((c) => c.key === key);
    if (!card) return;
    const isMatched = matched.includes(card.pairId);
    if (isMatched) return;

    const next = [...flipped, key];
    setFlipped(next);

    if (next.length === 2) {
      const [a, b] = next.map((k) => board.find((c) => c.key === k)!);
      // valid match = same pairId AND opposite sides
      const isMatch = a.pairId === b.pairId && a.side !== b.side;
      // D3 (2026-05-02): bump attempt counter for the pair the student is
      // trying to land. When a + b are different pairs (a wrong attempt that
      // didn't even involve the right answer card), bump both pairs since the
      // student is searching for either of them. Attempt counter is best-effort
      // for the review's "matched on Nth try" row.
      setAttemptCounts((cnts) => {
        const out = { ...cnts };
        out[a.pairId] = (out[a.pairId] ?? 0) + 1;
        if (a.pairId !== b.pairId) out[b.pairId] = (out[b.pairId] ?? 0) + 1;
        return out;
      });
      if (isMatch) {
        setTimeout(() => {
          setMatched((m) => [...m, a.pairId]);
          setFlipped([]);
          setAnnouncement(`Pair found.`);
        }, 520);
      } else {
        setWrongFlash(next);
        setAnnouncement('Not a pair.');
        // Telemetry — record what they confused.
        const promptCard = a.side === 'prompt' ? a : b.side === 'prompt' ? b : null;
        const answerCard = a.side === 'answer' ? a : b.side === 'answer' ? b : null;
        if (promptCard && answerCard) {
          const round = active.rounds.find((r) => r.id === promptCard.pairId);
          if (round) {
            tip.recordWrong({
              questionId: round.id,
              studentAnswer: answerCard.text,
              correctAnswer: round.options[round.answerIndex],
              explanationPL: round.hint_pl,
              exerciseId: round.exerciseId,
            });
          }
        }
        setTimeout(() => {
          setFlipped([]);
          setWrongFlash([]);
        }, 900);
      }
    }
  };

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 2) return;
    const next = active.rounds.find((r) => !matched.includes(r.id));
    if (!next) return;
    setHintsUsed((h) => h + 1);
    setHintGlow(next.id);
    setTimeout(() => setHintGlow(null), 1800);
  };

  const reset = (): void => {
    setFlipped([]); setMatched([]); setWrongFlash([]);
    setHintsUsed(0); setHintGlow(null);
    setAttemptCounts({});
    tip.reset();
  };

  // Page background — cellar stone, oil-lamp warmth at center.
  const grad = time === 'day'
    ? 'radial-gradient(ellipse at 50% 40%, #5C3A2A 0%, #2D1A14 60%, #14080A 100%)'
    : time === 'dusk'
      ? 'radial-gradient(ellipse at 50% 40%, #4A2C1F 0%, #1F100E 60%, #08040A 100%)'
      : 'radial-gradient(ellipse at 50% 40%, #36211C 0%, #14080A 60%, #02010A 100%)';

  return (
    <div
      className="em-shell em-shell-concentration"
      role="application"
      aria-label="Concentration memory game, The Memory Cellar"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: grad }}
    >
      <style>{`
        @keyframes em-co-flame { 0%, 100% { transform: scale(1) translateY(0); opacity: 0.85; } 50% { transform: scale(1.08) translateY(-1px); opacity: 1; } }
        @keyframes em-co-stone-flicker { 0%, 100% { opacity: 0.16; } 50% { opacity: 0.22; } }
        @keyframes em-co-card-flip { from { transform: rotateY(180deg); } to { transform: rotateY(0); } }
        @keyframes em-co-card-match { 0% { box-shadow: 0 0 0 0 rgba(167,139,250,0.65); } 100% { box-shadow: 0 0 0 24px rgba(167,139,250,0); } }
        @keyframes em-co-shake { 0%, 100% { transform: translateX(0) rotateY(180deg); } 25% { transform: translateX(-6px) rotateY(180deg); } 75% { transform: translateX(6px) rotateY(180deg); } }
        @keyframes em-co-glow-hint { 0%, 100% { box-shadow: 0 0 0 0 rgba(167,139,250,0); } 50% { box-shadow: 0 0 0 6px rgba(167,139,250,0.65), 0 0 28px rgba(167,139,250,0.55); } }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      {/* Stone wall — background pattern */}
      <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.18, pointerEvents: 'none' }}>
        <defs>
          <pattern id="co-stone" x="0" y="0" width="80" height="48" patternUnits="userSpaceOnUse">
            <rect width="80" height="48" fill="#1A0E0A" />
            <rect x="2" y="2" width="36" height="20" rx="3" fill="#3B2418" />
            <rect x="42" y="2" width="36" height="20" rx="3" fill="#33201A" />
            <rect x="-18" y="26" width="36" height="20" rx="3" fill="#33201A" />
            <rect x="22" y="26" width="36" height="20" rx="3" fill="#3F2818" />
            <rect x="62" y="26" width="36" height="20" rx="3" fill="#33201A" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#co-stone)" />
      </svg>

      {/* Oil lamp — top-right */}
      <div aria-hidden="true" style={{ position: 'absolute', top: 60, right: 80, zIndex: 2, pointerEvents: 'none' }}>
        <svg width="74" height="120" viewBox="0 0 74 120">
          {/* hanging chain */}
          <line x1="37" y1="0" x2="37" y2="20" stroke="#7A5A2A" strokeWidth="1.5" strokeDasharray="2 2" />
          {/* lamp body */}
          <ellipse cx="37" cy="56" rx="22" ry="20" fill="#3A2410" stroke="#7A5A2A" strokeWidth="1.5" />
          <rect x="32" y="20" width="10" height="20" fill="#3A2410" stroke="#7A5A2A" strokeWidth="1.2" />
          {/* glass globe */}
          <ellipse cx="37" cy="56" rx="14" ry="12" fill="rgba(251,191,36,0.18)" stroke="#FBBF24" strokeWidth="1" opacity="0.85" />
          {/* flame */}
          <path d="M 37 50 Q 33 56 37 64 Q 41 56 37 50 Z" fill="#FBBF24" style={{ animation: 'em-co-flame 1.6s ease-in-out infinite', transformOrigin: '37px 60px' }} />
        </svg>
      </div>

      {/* Lamp light pool — radial highlight on the table */}
      <div aria-hidden="true" style={{ position: 'absolute', top: '40%', left: '50%', width: 720, height: 460, transform: 'translate(-50%, -50%)', borderRadius: '50%', background: `radial-gradient(ellipse, ${ACCENT}1c 0%, transparent 70%)`, mixBlendMode: 'screen', pointerEvents: 'none', zIndex: 1, animation: 'em-co-stone-flicker 3.2s ease-in-out infinite' }} />

      {/* Top bar — Ricky CD-fix (2026-05-03): pointerEvents:'none' on the
          wrapper so wrapped flex content can't block card clicks below. The
          interactive children (audio toggle, Skip, Hint buttons) re-enable
          pointer events themselves so they remain clickable. CD audit
          reported "Clicked 2 cards (605,175 and 785,175) — neither flipped"
          which traced to topbar wrap overlapping the upper card row. */}
      <div style={{ position: 'absolute', top: 28, left: 28, right: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 6, gap: 12, flexWrap: 'wrap', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}><AmbientAudioPlayer shellSlug="concentration" /></div>
        <div style={{ pointerEvents: 'auto' }}>
          <Nameplate
            district="The Memory Cellar"
            subtitle="Concentration · Pamięć · flip two at a time"
            accent={ACCENT}
            icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="4" width="7" height="10" rx="1.4" stroke={ACCENT} strokeWidth="1.6" /><rect x="12" y="4" width="7" height="10" rx="1.4" stroke={ACCENT} strokeWidth="1.6" /></svg>}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', pointerEvents: 'auto' }}>
          <Progress current={matched.length} total={active.rounds.length} accent={ACCENT} />
          <SkipButton onClick={reset} />
          <HintButton onClick={useHint} used={hintsUsed} total={2} />
        </div>
      </div>

      {/* Wooden card table — centered grid */}
      <div style={{
        position: 'absolute', top: 100, left: 0, right: 0, bottom: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 1200, zIndex: 4,
      }}>
        <div style={{
          padding: 32, borderRadius: 20,
          background: 'linear-gradient(160deg, #2A1810 0%, #1A0F0A 100%)',
          border: '2px solid #5C3A2A', boxShadow: '0 24px 60px rgba(0,0,0,0.6), inset 0 0 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${board.length <= 6 ? 3 : 4}, 110px)`, gap: 14,
          }}>
            {board.map((c) => {
              const isMatched = matched.includes(c.pairId);
              const isFlipped = isMatched || flipped.includes(c.key);
              const isWrong = wrongFlash.includes(c.key);
              const isHinted = hintGlow === c.pairId && !isMatched;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-label={isFlipped ? `${c.side === 'prompt' ? 'Prompt' : 'Answer'}: ${c.text}` : 'Face-down card. Tap to flip.'}
                  aria-pressed={isFlipped}
                  onClick={() => onFlip(c.key)}
                  disabled={!!forcedState}
                  style={{
                    background: 'transparent', border: 'none', padding: 0,
                    width: 110, height: 150,
                    cursor: isMatched || isFlipped || forcedState ? 'default' : 'pointer',
                    perspective: 800,
                  }}
                >
                  <div style={{
                    position: 'relative', width: '100%', height: '100%',
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(0deg)' : 'rotateY(180deg)',
                    transition: 'transform 600ms var(--em-ease)',
                    animation: isWrong ? 'em-co-shake 0.34s var(--em-ease)' : isMatched ? 'em-co-card-match 0.8s var(--em-ease)' : isHinted ? 'em-co-glow-hint 1.6s ease-in-out' : 'none',
                    borderRadius: 10,
                  }}>
                    {/* FRONT — face */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                      borderRadius: 10, padding: 10,
                      background: c.side === 'prompt'
                        ? 'linear-gradient(180deg, #F4EFEF 0%, #DCD2D2 100%)'
                        : `linear-gradient(180deg, ${ACCENT}33 0%, #1F0E40 100%)`,
                      color: c.side === 'prompt' ? '#1F0E40' : '#F4EFEF',
                      border: isMatched ? `2px solid ${ACCENT}` : '1px solid rgba(0,0,0,0.4)',
                      boxShadow: isMatched ? `0 0 18px ${ACCENT}88, 0 6px 14px rgba(0,0,0,0.5)` : '0 6px 14px rgba(0,0,0,0.5)',
                      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                      textAlign: 'center', overflow: 'hidden',
                    }}>
                      <div className="em-eyebrow" style={{ color: c.side === 'prompt' ? '#7A5A2A' : ACCENT, fontSize: 9, marginBottom: 6, letterSpacing: '0.18em' }}>
                        {c.side === 'prompt' ? 'CLUE · KARTA' : 'WORD · SŁOWO'}
                      </div>
                      <div style={{
                        fontFamily: c.side === 'prompt' ? 'var(--em-body)' : 'var(--em-decor)',
                        fontSize: c.side === 'prompt' ? 10 : 18, lineHeight: 1.3,
                      }}>{c.text}</div>
                    </div>
                    {/* BACK — face-down */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)', borderRadius: 10,
                      background: 'repeating-linear-gradient(45deg, #2A0E36 0 6px, #1F0E40 6px 12px)',
                      border: '1px solid #5C3A2A',
                      boxShadow: '0 6px 14px rgba(0,0,0,0.5), inset 0 0 8px rgba(0,0,0,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', border: `1.5px solid ${ACCENT}88`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${ACCENT}22` }}>
                        <span className="em-decor" style={{ color: ACCENT, fontSize: 22 }}>✦</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Instructions modal (full mechanic walkthrough). The centered HintCard
          and decorative Bajla were removed 2026-05-03 — the chat-widget
          speech bubble now carries the per-shell brief. */}
      {!completed && (
        <div style={{ position: 'absolute', bottom: 28, left: 28, right: 200, maxWidth: 460, zIndex: 5 }}>
        </div>
      )}

      {/* Completion overlay — suppressed when host wires onSessionComplete
          (the host's <PracticeReview> takes over). */}
      {completed && !onSessionComplete && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Memory Cellar complete"
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
            animation: 'em-rise 0.4s var(--em-ease)', zIndex: 10,
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>Every pair remembered.</div>
          <div className="em-eyebrow">CELLAR LIT · PIWNICA OŚWIETLONA</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="em-btn em-btn-ghost" onClick={reset}>Try another</button>
            <button className="em-btn em-btn-primary" onClick={reset}>Next district →</button>
          </div>
        </div>
      )}
      <Confetti show={completed} />
    </div>
  );
};

export default ConcentrationShell;
