import { PairArena, useChallengeArcade } from './challenge-arcade';
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
  const arcade = useChallengeArcade();
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

  const [scouting, setScouting] = useState(false);
  const [scoutUsed, setScoutUsed] = useState(false);
  useEffect(() => {
    if (!scouting) return;
    const timer = window.setTimeout(() => setScouting(false), 3000);
    return () => window.clearTimeout(timer);
  }, [scouting]);
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
  useEffect(() => { if (completed && !forcedState) arcade.finish(); }, [completed, forcedState]);

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
    if (forcedState || scouting) return;
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
      arcade.decide(isMatch, a.pairId);
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
    arcade.reset(); setScouting(false); setScoutUsed(false);
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

  return <PairArena title="The Memory Cellar" memory cards={board} matched={matched} flipped={flipped} wrong={wrongFlash} hintGlow={hintGlow} onPick={onFlip} onHint={useHint} hintDisabled={hintsUsed >= 2 || scouting} onReset={reset} scouting={scouting} scoutUsed={scoutUsed} onScout={() => { if (scoutUsed || flipped.length || wrongFlash.length || forcedState) return; setScoutUsed(true); setScouting(true); }} />;
};

export default ConcentrationShell;
