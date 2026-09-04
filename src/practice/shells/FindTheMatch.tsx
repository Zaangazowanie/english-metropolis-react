import { PairArena, useChallengeArcade } from './challenge-arcade';
// FindTheMatch — "The Lost & Found" district.
// A municipal lost-and-found office: items scattered across a counter and a
// pegboard wall behind. All cards visible from the start. Player taps a clue
// card, then taps the word card that matches. Same data as Concentration but
// no flipping — visibility is the difference.
//
// Visual identity: this is the only shell where everything is OUT IN THE OPEN.
// Where Concentration hides, this one reveals. Cyan accent. Item silhouettes
// (umbrella, glove, key) on the pegboard. Cards drift slightly on hover like
// they're sitting loose on a counter.
//
// Persisted progress — Convex-backed.
import { useShellProgress } from '../lib/convex-stubs';
import { maskAnswerInPrompt } from '../lib/exercise-adapters';
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

// Lost & Found · Find the Match — full bilingual instruction copy.
const FINDTHEMATCH_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A counter and pegboard show every clue card and every word card all face-up — nothing is hidden.',
      'Tap a CLUE card (the sentence-with-gap), then tap the WORD card it matches.',
      'Right pair locks both cards together with a tag-link animation; wrong pair shakes and de-selects.',
      'Pair every clue to its word to clear the lost-and-found counter.',
    ],
    pl: [
      'Lada i tablica korkowa pokazują wszystkie karty-podpowiedzi i karty-słowa odsłonięte — nic nie jest ukryte.',
      'Stuknij kartę PODPOWIEDŹ (zdanie z luką), potem stuknij pasującą kartę SŁOWO.',
      'Trafna para łączy obie karty animacją „przywieszki"; błędna para potrząsa się i odznacza.',
      'Sparuj każdą podpowiedź z jej słowem, aby wyczyścić ladę biura rzeczy znalezionych.',
    ],
  },
  controls: {
    en: [
      'Counter (left): clue cards laid out with luggage-tag numbers.',
      'Pegboard (right): word cards hung by item silhouettes (umbrella, glove, key — decorative).',
      'Selection state: tapped clue card highlights with a cyan ring until you commit a word.',
      'Lock state: matched pairs gain a "tag-link" line connecting them — locked, not re-tappable.',
      'Skip + Hint buttons: Skip drops the current selection, Hint highlights the word that pairs with the active clue.',
    ],
    pl: [
      'Lada (lewa): karty-podpowiedzi z numerami przywieszek bagażowych.',
      'Tablica korkowa (prawa): karty-słowa zawieszone przy sylwetkach przedmiotów (parasol, rękawiczka, klucz — dekoracyjne).',
      'Stan wybrania: stuknięta karta-podpowiedź podświetla się cyjanową obwódką, aż zatwierdzisz słowo.',
      'Stan zablokowany: dopasowane pary łączy linia „przywieszki" — zablokowane, nie da się ponownie stuknąć.',
      'Przyciski Pomiń i Podpowiedź: Pomiń zrzuca bieżący wybór, Podpowiedź podświetla słowo pasujące do aktywnej podpowiedzi.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right pair: ✓ green flash + tag-link line, +1 to your tally, both cards lock.',
      'Wrong pair: ✗ rose shake on both cards, selection clears, no penalty beyond the lost guess.',
      'Skip: counts as a wrong pair — clears the active clue selection without locking anything.',
      'You can re-attempt any unmatched pair as many times as needed — no limit on guesses per pair.',
    ],
    pl: [
      'Trafna para: ✓ zielony błysk + linia „przywieszki", +1 do wyniku, obie karty się blokują.',
      'Błędna para: ✗ różowe potrząśnięcie na obu kartach, wybór się czyści, bez kary poza utraconym strzałem.',
      'Pomiń: liczy się jako błędna para — czyści wybraną podpowiedź bez blokowania niczego.',
      'Każdą niedopasowaną parę możesz próbować dowolnie wiele razy — bez limitu strzałów na parę.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. With a clue selected, tap Hint to briefly highlight its matching word card. Save them for the last 2–3 unmatched pairs when distractor words look similar.',
    pl:
      'Masz 3 podpowiedzi na sesję. Z wybraną podpowiedzią stuknij Podpowiedź, aby krótko podświetlić pasującą kartę-słowo. Zachowaj je na ostatnie 2–3 pary, gdy słowa-pułapki wyglądają podobnie.',
  },
  scoring: {
    en:
      'Skip counts as a wrong pair. Each match adds to your session streak. Pairing every clue unlocks the post-shell review with explanations of any tricky pairings.',
    pl:
      'Pomiń liczy się jako błędna para. Każde dopasowanie buduje serię w sesji. Sparowanie wszystkich podpowiedzi odblokowuje przegląd po sesji z wyjaśnieniami trudnych par.',
  },
  l1Pattern: {
    en:
      'Comprehension + matching drill. Polish learners often confuse near-synonyms in collocation contexts ("make a decision" vs "do a decision"); pairing CLUE ↔ WORD trains lexical chunking by context, not literal translation.',
    pl:
      'Trening rozumienia + dopasowania. Polscy uczniowie mylą bliskoznaczne słowa w kolokacjach („make a decision" vs „do a decision"); dopasowywanie PODPOWIEDŹ ↔ SŁOWO uczy „chunkingu" leksykalnego z kontekstu, a nie dosłownego tłumaczenia.',
  },
};

// 2026-05-02 (Ricky, FindTheMatch belt-and-suspenders for CD audit §5 Lost & Found):
// 3 of 6 clue cards were leaking the answer literally via a broken
// "{sentence} → fits 'X'?" fallback template (sourced from
// generateMultipleChoice.blankExample when the example sentence holds an
// inflected form like "pickpockets" / "flagged" / "dependencies" that the
// strict whole-word regex doesn't catch). This rewriter rips the leaking
// template out before the maskAnswerInPrompt morphology pass runs, so neither
// the literal lemma nor the "fits 'X'?" instruction-leak survive into the
// rendered clue card.
function rewriteFitsTemplate(clue: string, answer: string): string {
  if (!clue || !answer) return clue;
  const fitsRe = /→\s*fits\s*['"`]?([^'"`?]+)['"`]?\?/i;
  if (fitsRe.test(clue)) {
    const stripped = clue.replace(fitsRe, '→ which option fits?');
    // Also strip the literal answer that the broken template parked in the
    // sentence body. maskAnswerInPrompt handles morphology after this returns.
    const safe = answer.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return stripped.replace(new RegExp(`\\b${safe}\\b`, 'i'), '___');
  }
  return clue;
}

function sanitiseClue(clue: string, answer: string): string {
  // Order matters: kill the broken "fits 'X'?" template first, then run the
  // morphology-aware mask so any lingering inflected form of the answer in
  // the sentence body (pickpocket → pickpockets, flag → flagged) is caught.
  return maskAnswerInPrompt(rewriteFitsTemplate(clue, answer), answer);
}

export interface WrapperRound {
  id: string; prompt: string; options: string[]; answerIndex: number;
  hint: string; hint_pl: string; exerciseId?: string;
}
export interface WrapperPuzzle { rounds: WrapperRound[]; }

export type FindTheMatchForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface FindTheMatchShellProps {
  time?: TimeOfDay;
  state?: FindTheMatchForcedState;
  puzzle?: WrapperPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /** D3-FindTheMatch (Ricky wave-4, 2026-05-02): per-pair review payload. */
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
    wrongAttemptCounts: Record<string, number>;
  }) => void;
}

const FM_DEMO: WrapperPuzzle = {
  rounds: [
    { id: 'umbrella', prompt: 'You open this when it rains.', options: ['shovel', 'umbrella', 'fan', 'kettle'], answerIndex: 1, hint: 'Pull the handle.', hint_pl: 'Po polsku: parasol.' },
    { id: 'glove', prompt: 'You wear this on your hand in winter.', options: ['scarf', 'belt', 'glove', 'sock'], answerIndex: 2, hint: 'One per hand.', hint_pl: 'Po polsku: rękawiczka.' },
    { id: 'wallet', prompt: 'Small folding case for cards and cash.', options: ['wallet', 'briefcase', 'satchel', 'crate'], answerIndex: 0, hint: 'Fits in a back pocket.', hint_pl: 'Po polsku: portfel.' },
    { id: 'scarf', prompt: 'Long fabric you wrap around your neck.', options: ['hat', 'scarf', 'tie', 'sleeve'], answerIndex: 1, hint: 'Wool in winter, silk for show.', hint_pl: 'Po polsku: szalik.' },
    { id: 'key', prompt: 'Small metal object that opens a lock.', options: ['ring', 'screw', 'pin', 'key'], answerIndex: 3, hint: 'Cuts and grooves.', hint_pl: 'Po polsku: klucz.' },
    { id: 'phone', prompt: 'Pocket device used for calls and messages.', options: ['radio', 'lamp', 'phone', 'fan'], answerIndex: 2, hint: 'Rings.', hint_pl: 'Po polsku: telefon.' },
  ],
};

const ACCENT = '#7DD3FC';

interface FMCard {
  key: string;
  pairId: string;
  side: 'prompt' | 'answer';
  text: string;
  // Pre-computed scattered offset & rotation so the layout is stable.
  offsetX: number;
  offsetY: number;
  rotate: number;
}

function det(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// renderFindTheMatchReviewItem — per-pair locked render for PracticeReview.
// Lost-and-Found scoreboard: prompt card (clue) ↔ answer card with attempt
// count badge ("first try" / "N tries").
// ─────────────────────────────────────────────────────────────────────────
const FM_REVIEW_ACCENT = '#7DD3FC';
export function renderFindTheMatchReviewItem(
  round: WrapperRound,
  pairNumber: number,
  wrongAttemptCount: number,
): React.ReactNode {
  const correct = round.options[round.answerIndex];
  const firstTry = wrongAttemptCount === 0;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: firstTry
        ? 'linear-gradient(180deg, rgba(52,211,153,0.10), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(251,191,36,0.06), rgba(20,16,42,0.55))',
      border: `1px solid ${firstTry ? 'rgba(52,211,153,0.45)' : 'rgba(251,191,36,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 4,
          background: `${FM_REVIEW_ACCENT}22`, color: FM_REVIEW_ACCENT,
          border: `1px solid ${FM_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          PAIR {String(pairNumber).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: firstTry ? 'rgba(52,211,153,0.18)' : 'rgba(251,191,36,0.18)',
          color: firstTry ? '#34D399' : '#FBBF24',
        }}>
          {firstTry ? '✓ FIRST TRY · ZA PIERWSZYM RAZEM' : `↺ ${wrongAttemptCount + 1} TRIES · PRÓBY`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          flex: 1, padding: '10px 12px', borderRadius: 6,
          background: 'rgba(245,239,255,0.04)',
          border: '1px solid rgba(245,239,255,0.1)',
          fontFamily: 'var(--em-decor)', fontSize: 14, lineHeight: 1.3,
          color: 'var(--em-text, #EDE6FF)',
        }}>{round.prompt}</div>
        <span style={{ fontFamily: 'var(--em-mono)', fontSize: 16, color: FM_REVIEW_ACCENT }}>↔</span>
        <div style={{
          flex: 1, padding: '10px 12px', borderRadius: 6,
          background: 'rgba(52,211,153,0.18)',
          border: '1px solid #34D39988',
          fontFamily: 'var(--em-decor)', fontSize: 14, fontWeight: 700,
          color: '#34D399', textAlign: 'center',
        }}>{correct}</div>
      </div>
    </div>
  );
}

export const FindTheMatchShell: React.FC<FindTheMatchShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const arcade = useChallengeArcade();
  const active: WrapperPuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : FM_DEMO;
  const persisted = useShellProgress('findthematch');

  // Build cards with deterministic scatter — the layout looks "messy" but is
  // stable across renders so animations don't jump.
  const cards = useMemo<FMCard[]>(() => {
    const rng = det(active.rounds.length * 73 + 5);
    const all: FMCard[] = [];
    active.rounds.forEach((r) => {
      const answer = r.options[r.answerIndex];
      const cluePrompt = sanitiseClue(r.prompt, answer);
      all.push({ key: `${r.id}-p`, pairId: r.id, side: 'prompt', text: cluePrompt, offsetX: 0, offsetY: 0, rotate: 0 });
      all.push({ key: `${r.id}-a`, pairId: r.id, side: 'answer', text: answer, offsetX: 0, offsetY: 0, rotate: 0 });
    });
    // Shuffle then assign offsets within a grid cell.
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.map((c) => ({
      ...c,
      offsetX: (rng() - 0.5) * 16,
      offsetY: (rng() - 0.5) * 14,
      rotate: (rng() - 0.5) * 8,
    }));
  }, [active]);

  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]); // pairIds
  const [wrongFlash, setWrongFlash] = useState<string[]>([]); // card keys
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [hintGlow, setHintGlow] = useState<string | null>(null); // pairId
  const [announcement, setAnnouncement] = useState<string>('');

  const completed = !forcedState && matched.length === active.rounds.length;
  useEffect(() => { if (completed && !forcedState) arcade.finish(); }, [completed, forcedState]);

  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      // Group wrong attempts per pair to surface "N tries" badge in the review.
      const counts: Record<string, number> = {};
      for (const w of wrongAttempts) counts[w.questionId] = (counts[w.questionId] ?? 0) + 1;
      onSessionComplete({
        correctCount: matched.length,
        totalQuestions: active.rounds.length,
        wrongAttempts,
        puzzle: active,
        wrongAttemptCounts: counts,
      });
    } : undefined,
  });

  useEffect(() => {
    if (forcedState) return;
    const total = active.rounds.length;
    persisted.save({ progress: matched.length / total, lastState: matched.length === total ? 'complete' : 'active' });
    if (matched.length === total) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [matched.length, forcedState, active.rounds.length]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'findthematch',
      brief: 'Tap a clue card, then tap the word card it pairs with.',
      brief_pl: 'Stuknij kartę-podpowiedź, potem kartę-słowo, z którą się łączy.',
      detail: 'Every card in the Lost and Found is face-up — clues on one side, items on the other. Tap a clue to select it, then tap the matching item card. No flipping, no memory work — just look and pair them off.',
      detail_pl: 'Każda karta w Biurze Rzeczy Znalezionych jest na wierzchu — z jednej strony podpowiedzi, z drugiej rzeczy. Stuknij podpowiedź, aby ją wybrać, potem stuknij pasującą kartę-rzecz. Żadnego odwracania ani zapamiętywania — po prostu patrz i paruj.',
      fullInstructions: FINDTHEMATCH_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty')   { setSelected(null); setMatched([]); }
    if (forcedState === 'active')  { setSelected(cards[0]?.key ?? null); setMatched([]); }
    if (forcedState === 'correct') { setSelected(null); setMatched([active.rounds[0].id]); }
    if (forcedState === 'wrong')   { setSelected(null); setWrongFlash([cards[0]?.key, cards[3]?.key].filter(Boolean) as string[]); }
    if (forcedState === 'complete'){ setSelected(null); setMatched(active.rounds.map((r) => r.id)); }
  }, [forcedState, active.rounds, cards]);

  const onTap = (key: string): void => {
    if (forcedState || wrongFlash.length) return;
    const card = cards.find((c) => c.key === key);
    if (!card || matched.includes(card.pairId)) return;
    if (selected === key) { setSelected(null); return; }
    if (!selected) { setSelected(key); return; }

    const sel = cards.find((c) => c.key === selected);
    if (!sel) return;
    // Same side? Switch selection.
    if (sel.side === card.side) { setSelected(key); return; }

    const priorityId = active.rounds.find(r => !matched.includes(r.id))?.id;
    arcade.decide(sel.pairId === card.pairId, sel.side === 'prompt' ? sel.pairId : card.pairId, card.pairId === priorityId ? 150 : 100);
    if (sel.pairId === card.pairId) {
      setMatched((m) => [...m, card.pairId]);
      setAnnouncement('Pair found.');
      setSelected(null);
    } else {
      setWrongFlash([selected, key]);
      setAnnouncement('Not a pair.');
      const promptCard = sel.side === 'prompt' ? sel : card;
      const answerCard = sel.side === 'answer' ? sel : card;
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
      setTimeout(() => { setWrongFlash([]); setSelected(null); }, 700);
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
    arcade.reset();
    setSelected(null); setMatched([]); setWrongFlash([]);
    setHintsUsed(0); setHintGlow(null); tip.reset();
  };

  const grad = time === 'day'
    ? 'linear-gradient(180deg, #4C2F7E 0%, #B0A3D8 100%)'
    : time === 'dusk'
      ? 'linear-gradient(180deg, #1F1240 0%, #1B3A5C 100%)'
      : 'linear-gradient(180deg, #06031A 0%, #08222F 100%)';

  const priorityId = active.rounds.find(r => !matched.includes(r.id))?.id;
  return <PairArena title="The Lost & Found" memory={false} cards={cards} matched={matched} selected={selected} wrong={wrongFlash} hintGlow={hintGlow} onPick={onTap} onHint={useHint} hintDisabled={hintsUsed >= 2} onReset={reset} priority={cards.find(c => c.pairId === priorityId && c.side === 'prompt')?.text} />;
};

export default FindTheMatchShell;
