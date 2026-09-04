// Word Formation — The Mason's Yard district.
// A stonemason's yard at dusk. A great stone slab waits to be chiselled into
// the right form (noun, verb, adjective, adverb). The base word is stamped
// in capital letters on the raw block; the student types the chiselled form
// to fit the sentence carved into the wall above. Sparks fly when correct;
// chips of stone fall when wrong.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { WordMission, useWordArcade } from './word-arcade';
import { useShellProgress } from '../lib/convex-stubs';
import React, { useState, useEffect, useRef } from 'react';
import {
  Bajla,
  HintCard,
  Progress,
  Nameplate,
  SkipButton,
  HintButton,
  Confetti,
  useEndOfShellTip,
  normalise,
} from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';
// CD audit 2026-05-02: shared POS resolver for the right-rail "Today's
// Formations" preview. Replaces the buggy local heuristic that defaulted to
// NOUN and produced fake "BRAVE NOUN → NOUN" identity displays.
import { posFromBaseWord } from '../lib/suitability';

// Mason's Yard · Word Formation — full bilingual instruction copy.
const WORDFORMATION_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A sentence with a gap appears on the carving stone, and a BASE word is shown next to it.',
      'Derive the right form of the base word (noun, verb, adjective, adverb) so it fits the gap.',
      'Type the derived form in the slot and press chisel (Enter) to commit.',
      'You may need to add prefixes (un-, dis-) or suffixes (-tion, -ness, -ly).',
    ],
    pl: [
      'Na kamieniu pojawia się zdanie z luką, a obok niego słowo BAZOWE.',
      'Wyprowadź właściwą formę słowa bazowego (rzeczownik, czasownik, przymiotnik, przysłówek), żeby pasowała do luki.',
      'Wpisz formę w lukę i naciśnij dłuto (Enter), aby zatwierdzić.',
      'Możesz potrzebować przedrostków (un-, dis-) lub przyrostków (-tion, -ness, -ly).',
    ],
  },
  controls: {
    en: [
      'Carving stone: the sentence with the gap to fill.',
      'BASE chip: the root word you must transform.',
      'Slot input: type the derived form here — Enter commits.',
      'Hint button: 3 hints per session — reveals the first 1-2 letters of the target form.',
      'Skip button: gives up the carving and moves to the next stone (counts as wrong).',
    ],
    pl: [
      'Kamień rzeźbiarski: zdanie z luką do wypełnienia.',
      'Karta BASE: słowo bazowe, które musisz przekształcić.',
      'Pole na formę: tu wpisujesz wyprowadzoną formę — Enter zatwierdza.',
      'Przycisk Podpowiedź: 3 podpowiedzi na sesję — odkrywa pierwsze 1-2 litery docelowej formy.',
      'Przycisk Pomiń: rezygnuje z rzeźby i przechodzi do następnego kamienia (liczy się jako błąd).',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right form: the carving lights amber, +1 to your tally, the next stone slides in.',
      'Wrong form: the slot flashes rose; the right form is shown so you learn the derivation rule.',
      'Skip: counts as wrong; the right form is shown before the next stone loads.',
      'Capitalisation and trailing punctuation are tolerated; spelling is strict.',
    ],
    pl: [
      'Trafna forma: rzeźba świeci na bursztynowo, +1 do wyniku, wsuwa się następny kamień.',
      'Błędna forma: pole błyska na różowo; pojawia się poprawna forma, żebyś poznał regułę derywacji.',
      'Pomiń: liczy się jako błąd; poprawna forma pojawia się przed załadowaniem następnego kamienia.',
      'Wielkość liter i końcowa interpunkcja są tolerowane; pisownia jest ścisła.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. The hint button reveals the first 1-2 letters of the target form so you can see whether it needs a prefix (un-, dis-) or starts straight with the suffix-bearing root.',
    pl:
      'Masz 3 podpowiedzi na sesję. Przycisk podpowiedzi odkrywa pierwsze 1-2 litery docelowej formy, żebyś widział, czy potrzeba przedrostka (un-, dis-), czy zaczyna się od rdzenia z przyrostkiem.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each correct derivation adds to your session streak. Completing every carving in the yard unlocks the Mason\'s Yard completion screen and posts your score.',
    pl:
      'Pomiń liczy się jako błąd. Każda trafna derywacja zwiększa serię. Ukończenie wszystkich rzeźb na placu odblokowuje ekran zakończenia Placu Kamieniarza i zapisuje wynik.',
  },
  l1Pattern: {
    en:
      'Polish does not use derivational morphology the same way English does — Polish often forms a new word with a separate root rather than a suffix. Word Formation drills the English habit of stacking suffixes (-tion, -ness, -ly) onto a single root.',
    pl:
      'Polski nie używa derywacji tak jak angielski — często tworzy nowe słowo z osobnym rdzeniem zamiast przyrostka. Word Formation utrwala angielski nawyk dokładania przyrostków (-tion, -ness, -ly) do jednego rdzenia.',
  },
};

// ─── Types ────────────────────────────────────────────────────────────────
export type WFForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';
export type WFTargetPos = 'noun' | 'verb' | 'adj' | 'adv';

export interface WFItem {
  id: string;
  sentence: string;
  base_word: string;
  target_pos: WFTargetPos;
  answer: string;
  acceptedAnswers?: string[];
  hint?: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface ShellWordFormationPuzzle {
  items: WFItem[];
}

export interface WordFormationShellProps {
  time?: TimeOfDay;
  state?: WFForcedState;
  puzzle?: ShellWordFormationPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3-WordFormation (Ricky wave-3, 2026-05-02): fires once when every base
   * word in the puzzle has been seen. Mounts <PracticeReview> at the host.
   * Per-item: each base word becomes one review row showing target POS +
   * student's answer + correct answer + explanationPL (the derivation rule).
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
    puzzle: ShellWordFormationPuzzle;
  }) => void;
}

// ─── Demo deck ────────────────────────────────────────────────────────────
export const WF_PUZZLE: ShellWordFormationPuzzle = {
  items: [
    {
      id: 'brave-noun',
      sentence: 'Her work shows great ___.',
      base_word: 'BRAVE',
      target_pos: 'noun',
      answer: 'bravery',
      hint: 'Add a noun-forming suffix.',
      hint_pl: 'Dodaj końcówkę tworzącą rzeczownik (-ery).',
    },
    {
      id: 'happy-adv',
      sentence: 'She greeted us ___.',
      base_word: 'HAPPY',
      target_pos: 'adv',
      answer: 'happily',
      hint: 'Adjective → adverb. -y → -ily.',
      hint_pl: 'Przymiotnik → przysłówek. -y → -ily.',
    },
    {
      id: 'create-noun',
      sentence: 'Her latest ___ was a tall iron lamp.',
      base_word: 'CREATE',
      target_pos: 'noun',
      answer: 'creation',
      hint: 'Verb → noun. -te → -tion.',
      hint_pl: 'Czasownik → rzeczownik. -te → -tion.',
    },
    {
      id: 'careful-adv',
      sentence: 'Drive ___ on this road.',
      base_word: 'CAREFUL',
      target_pos: 'adv',
      answer: 'carefully',
      hint: 'Adjective → adverb. + -ly.',
      hint_pl: 'Przymiotnik → przysłówek. + -ly.',
    },
    {
      id: 'inform-noun',
      sentence: 'Please pass this ___ on to the team.',
      base_word: 'INFORM',
      target_pos: 'noun',
      answer: 'information',
      hint: 'Verb → noun. + -ation.',
      hint_pl: 'Czasownik → rzeczownik. + -ation.',
    },
    {
      id: 'use-adj',
      sentence: 'The new tool was very ___.',
      base_word: 'USE',
      target_pos: 'adj',
      answer: 'useful',
      hint: 'Noun → adjective. + -ful.',
      hint_pl: 'Rzeczownik → przymiotnik. + -ful.',
    },
  ],
};

const ACCENT = '#FBBF24';
const ACCENT_DEEP = '#A07300';
const STONE_LIGHT = '#C8B698';
const STONE_DARK = '#5C4D3A';

const POS_LABEL: Record<WFTargetPos, { en: string; pl: string }> = {
  noun: { en: 'NOUN',      pl: 'RZECZOWNIK'  },
  verb: { en: 'VERB',      pl: 'CZASOWNIK'   },
  adj:  { en: 'ADJECTIVE', pl: 'PRZYMIOTNIK' },
  adv:  { en: 'ADVERB',    pl: 'PRZYSŁÓWEK'  },
};

// ─────────────────────────────────────────────────────────────────────────
// renderWordFormationReviewItem — per-base-word locked render for PracticeReview.
// Shows the carved sentence + base + target POS + student's answer + correct
// form, with green/red ring + the explanationPL derivation rule when wrong.
// ─────────────────────────────────────────────────────────────────────────
const WF_REVIEW_ACCENT = '#FBBF24';
export function renderWordFormationReviewItem(
  item: WFItem,
  studentAnswer: string | undefined,
): React.ReactNode {
  const correct = item.answer;
  const stu = (studentAnswer ?? '').trim();
  const isWrong = stu.length > 0 && stu.toLowerCase() !== correct.toLowerCase();
  const wasSkipped = stu.length === 0;
  const pos = POS_LABEL[item.target_pos];
  const tone = isWrong ? '#FB7185' : wasSkipped ? 'rgba(245,239,255,0.45)' : '#34D399';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: isWrong
        ? 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))'
        : wasSkipped
          ? 'linear-gradient(180deg, rgba(245,239,255,0.04), rgba(20,16,42,0.55))'
          : 'linear-gradient(180deg, rgba(52,211,153,0.08), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : wasSkipped ? 'rgba(245,239,255,0.18)' : 'rgba(52,211,153,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-decor)', fontSize: 16, fontWeight: 700,
          color: WF_REVIEW_ACCENT, letterSpacing: '0.06em',
        }}>{item.base_word}</span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999,
          background: `${WF_REVIEW_ACCENT}22`, color: WF_REVIEW_ACCENT,
          border: `1px solid ${WF_REVIEW_ACCENT}66`,
        }}>→ {pos.en} · {pos.pl}</span>
      </div>
      <div style={{
        fontFamily: 'Georgia, serif', fontSize: 14, lineHeight: 1.4,
        color: 'var(--em-text, #EDE6FF)',
      }}>{item.sentence}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        {!wasSkipped && (
          <div style={{ color: tone }}>
            {isWrong ? '✗ NIE · You typed: ' : '✓ TAK · You typed: '}
            <strong style={{ fontFamily: 'var(--em-decor)', letterSpacing: '0.04em' }}>{stu}</strong>
          </div>
        )}
        {(isWrong || wasSkipped) && (
          <div style={{ color: '#34D399' }}>
            ✓ TAK · Correct form: <strong style={{ fontFamily: 'var(--em-decor)', letterSpacing: '0.04em' }}>{correct}</strong>
          </div>
        )}
        {wasSkipped && (
          <div style={{ color: 'rgba(245,239,255,0.5)', fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em' }}>
            POMINIĘTE · SKIPPED
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Component ────────────────────────────────────────────────────────────
export const WordFormationShell: React.FC<WordFormationShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const arcade = useWordArcade();
  const activePuzzle: ShellWordFormationPuzzle =
    puzzle && puzzle.items.length > 0 ? puzzle : WF_PUZZLE;
  const total = activePuzzle.items.length;
  const persisted = useShellProgress('wordformation');

  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [partsOpen, setPartsOpen] = useState(false);
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  const [score, setScore] = useState(0);
  const [questionsSeen, setQuestionsSeen] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [chipFlash, setChipFlash] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const cur = activePuzzle.items[idx % total];
  const completed = idx >= total;
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      arcade.complete();
    onSessionComplete({
        correctCount: score,
        totalQuestions: total,
        wrongAttempts,
        puzzle: activePuzzle,
      });
    } : undefined,
  });

  // Kelly Tier-2 audit (2026-05-02): defensive guard for degenerate exercises
  // where the base word is already the target part-of-speech (e.g. base
  // RESILIENCE → target NOUN, but "resilience" IS already a noun). The
  // suitability-filter agent will reject these upstream eventually; until
  // then we render an empty-state and auto-advance after 1.4s.
  const basePosLooksIdentity = (() => {
    if (!cur || forcedState) return false;
    const base = (cur.base_word ?? '').toLowerCase();
    const ans  = (cur.answer    ?? '').toLowerCase();
    return base.length > 0 && base === ans;
  })();
  useEffect(() => {
    if (!basePosLooksIdentity) return;
    const t = window.setTimeout(() => {
      setQuestionsSeen((q) => q + 1);
      setIdx((i) => i + 1);
      setDraft(''); setVerdict(null); setHintRevealed(false);
    }, 1400);
    return () => window.clearTimeout(t);
  }, [basePosLooksIdentity, cur?.id]);

  useEffect(() => {
    if (forcedState) return;
    persisted.save({
      progress: idx / Math.max(1, total),
      lastState: completed ? 'complete' : 'active',
    });
    if (completed) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, total, forcedState]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'wordformation',
      brief: 'Look at the BASE word, then chisel the right form to fit the gap.',
      brief_pl: 'Spójrz na słowo BAZOWE i wykuj właściwą formę, by pasowała do luki.',
      detail: 'You are in the mason\'s yard. Each carving has one gap and one BASE word displayed below. Form the right derived word — noun, verb, adjective, or adverb — to fit grammatically. Type the form into the gap; right answers chisel into stone, wrong ones brush off.',
      detail_pl: 'Jesteś w kamieniarni. Każda inskrypcja ma jedną lukę i jedno słowo BAZOWE pod spodem. Utwórz właściwą formę pochodną — rzeczownik, czasownik, przymiotnik lub przysłówek — która pasuje gramatycznie. Wpisz formę w lukę; trafione wykuwają się w kamień, błędne się ścierają.',
      fullInstructions: WORDFORMATION_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty')   { setIdx(0); setDraft(''); setVerdict(null); setScore(0); }
    if (forcedState === 'active')  { setIdx(0); setDraft('brav'); setVerdict(null); }
    if (forcedState === 'correct') { setIdx(0); setDraft('bravery'); setVerdict('right'); }
    if (forcedState === 'wrong')   { setIdx(0); setDraft('braveness'); setVerdict('wrong'); }
    if (forcedState === 'complete'){ setIdx(total); setScore(total); }
  }, [forcedState, total]);

  const submit = (): void => {
    if (forcedState || !cur || verdict === 'right' || completed) return;
    const candidate = normalise(draft);
    if (!candidate) return;
    const accepted = [normalise(cur.answer), ...(cur.acceptedAnswers ?? []).map(normalise)];
    const correct = accepted.includes(candidate);
    setVerdict(correct ? 'right' : 'wrong');
    arcade.answer(correct);
    if (correct) {
      setScore((s) => s + 1);
      setAnnouncement(`Chiselled. ${cur.answer}.`);
    } else {
      setChipFlash(true);
      setTimeout(() => setChipFlash(false), 480);
      setAnnouncement(`Not quite. The right form was "${cur.answer}".`);
      tip.recordWrong({
          questionId: cur.id,
          studentAnswer: draft,
          correctAnswer: cur.answer,
          explanationPL: cur.hint_pl,
          exerciseId: cur.exerciseId,
        });
    }
  };

  const advance = (): void => {
    setQuestionsSeen((q) => q + 1);
    setIdx((i) => i + 1);
    setDraft(''); setVerdict(null); setHintRevealed(false);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const skip = (): void => {
    if (forcedState || completed || !cur) return;
    setQuestionsSeen((q) => q + 1);
    setAnnouncement(`Skipped. The right form was "${cur.answer}".`);
    setIdx((i) => i + 1);
    setDraft(''); setVerdict(null); setHintRevealed(false);
  };

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 3 || verdict === 'right') return;
    setHintsUsed((h) => h + 1);
    setHintRevealed(true);
  };

  const reset = (): void => {
    arcade.restart();
    setIdx(0); setDraft(''); setVerdict(null); setScore(0);
    setQuestionsSeen(0); setHintsUsed(0); setHintRevealed(false);
    tip.reset();
  };

  const liveStatus = completed ? `All blocks chiselled. Score ${score}/${total}.` : announcement;

  return (
    <div
      className="em-shell wa-form-game em-shell-wordformation"
      role="application"
      aria-label="Word Formation, The Mason's Yard"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {liveStatus}
      </div>

      {/* Yard scene */}
      <div style={{
        position: 'absolute', inset: 0, background:
          time === 'day'
            ? 'linear-gradient(180deg, #6E5A82 0%, #B58F5A 60%, #5C4D3A 100%)'
            : time === 'dusk'
              ? 'linear-gradient(180deg, #1F1240 0%, #5C3F1A 70%, #2A1810 100%)'
              : 'linear-gradient(180deg, #07041A 0%, #2A1810 70%, #0E0A1A 100%)',
      }} />
      {/* Workshop floor pavers */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(rgba(0,0,0,0.20) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.20) 1px, transparent 1px)`,
        backgroundSize: '110px 110px',
        opacity: 0.4,
        transform: 'perspective(800px) rotateX(58deg) translateY(20vh) scale(2.4)',
        transformOrigin: 'top',
      }} />
      {/* Scaffolding silhouette */}
      <svg viewBox="0 0 1200 600" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.22, pointerEvents: 'none' }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const x = i * 160 + 40;
          return (
            <g key={i} stroke="#3A2C1F" strokeWidth="3" fill="none">
              <line x1={x} y1={520} x2={x} y2={120} />
              <line x1={x + 60} y1={520} x2={x + 60} y2={120} />
              {Array.from({ length: 6 }).map((_, r) => (
                <line key={r} x1={x} y1={150 + r * 70} x2={x + 60} y2={150 + r * 70} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 60%, transparent 35%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, zIndex: 5, flexWrap: 'wrap' }}>
        <AmbientAudioPlayer shellSlug="wordformation" />
        <Nameplate
          district="The Mason's Yard"
          subtitle="Word Formation · Słowotwórstwo · chisel the right form"
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="4" y="9" width="14" height="9" stroke={ACCENT} strokeWidth="1.6" />
              <path d="M2 18 H20" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" />
              <path d="M11 9 L11 4 L8 6 M11 4 L14 6" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress current={score} seen={questionsSeen} total={total} accent={ACCENT} />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      {/* Ricky · 2026-05-02 · audit §4 #8 right-rail: Today's Formations panel.
          Closes universal #0 + #9 (vertical/right dead space) at desktop ≥1280px.
          Surfaces the queue of 6 base words + their POS targets so the student
          sees what's coming. Hidden under 1280px via the scoped CSS at bottom. */}
      <aside className="wf-rail" aria-label="Today's formations queue">
        <div className="em-eyebrow" style={{ color: ACCENT, marginBottom: 12, letterSpacing: '0.22em', fontSize: 10 }}>
          DZIŚ PRZEKSZTAŁCAMY · TODAY&apos;S FORMATIONS
        </div>
        <ol className="wf-rail-list">
          {activePuzzle.items.map((it, i) => {
            const isCur = i === idx;
            const isPast = i < idx;
            const pos = POS_LABEL[it.target_pos];
            // CD audit 2026-05-02: previously a local heuristic that defaulted
            // to NOUN, producing "BRAVE NOUN → NOUN (identity!)" cosmetic bugs.
            // Now uses the shared posFromBaseWord lookup (KNOWN_BASE_POS table
            // + posFromSuffix). For the rare 'unknown' case we render an em-dash
            // so we never falsely advertise an identity transform.
            const fromPosTag = posFromBaseWord(it.base_word);
            const FROM_LABEL: Record<string, string> = {
              noun: 'NOUN', verb: 'VERB', adj: 'ADJ', adv: 'ADV', unknown: '—',
            };
            const fromPos = FROM_LABEL[fromPosTag] ?? '—';
            return (
              <li key={it.id} className={`wf-rail-item${isCur ? ' wf-rail-item-cur' : ''}${isPast ? ' wf-rail-item-past' : ''}`}>
                <span className="wf-rail-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="wf-rail-body">
                  <span className="wf-rail-base">{it.base_word}</span>
                  <span className="wf-rail-arrow">{fromPos} → {pos.en}</span>
                  <span className="wf-rail-pl">{pos.pl}</span>
                </span>
                {isCur && <span className="wf-rail-pin" aria-label="current">●</span>}
                {isPast && <span className="wf-rail-pin wf-rail-pin-done" aria-label="done">✓</span>}
              </li>
            );
          })}
        </ol>
        <div className="wf-rail-foot">
          <span className="wf-rail-foot-icon" aria-hidden>
            {/* Tiny chisel + stone block */}
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="4" y="12" width="11" height="6" stroke={ACCENT} strokeWidth="1.4" fill="rgba(200,182,152,0.2)" />
              <path d="M14 11 L18 5 L20 7 L16 13 Z" stroke={ACCENT} strokeWidth="1.4" fill="rgba(192,152,77,0.4)" />
            </svg>
          </span>
          <span style={{ color: 'var(--em-text-muted)', fontSize: 10, letterSpacing: '0.04em', lineHeight: 1.4 }}>
            <span style={{ color: ACCENT, fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em' }}>SUFFIX TIPS</span><br />
            -tion / -ment / -ness → noun<br />
            -ful / -ous / -ive → adjective<br />
            -ly → adverb
          </span>
        </div>
      </aside>

      {/* Kelly Tier-2 audit (2026-05-02): defensive empty-state for identity
          transformations (e.g. base RESILIENCE → target NOUN where the word
          already IS a noun). Auto-advances after 1.4s via the effect above. */}
      {!completed && cur && basePosLooksIdentity && (
        <div className="wf-stage" style={{ position: 'absolute', inset: '110px 24px 220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 4 }}>
          <WordMission kind="construction" current={idx} total={total} chain={arcade.chain} reaction={arcade.reaction}/><div className="wa-checklist"><span>BASE {cur.base_word}</span><span className={draft.trim()&&normalise(draft)!==normalise(cur.base_word)?'is-ready':''}>New form {draft.trim()&&normalise(draft)!==normalise(cur.base_word)?'✓':'○'}</span><span className={verdict==='right'?'is-ready':''}>Fits the sentence {verdict==='right'?'✓':'○'}</span></div>
          <div className="em-eyebrow" style={{ color: ACCENT, letterSpacing: '0.22em' }}>
            NO TRANSFORMATION NEEDED
          </div>
          <div className="em-decor" style={{ fontSize: 26, color: 'var(--em-text)', textAlign: 'center', maxWidth: 520 }}>
            Brak transformacji do wykonania
          </div>
          <div style={{ fontSize: 14, color: 'var(--em-text-muted)', textAlign: 'center', maxWidth: 480, lineHeight: 1.5 }}>
            "{cur.base_word}" is already a {POS_LABEL[cur.target_pos].en.toLowerCase()}. Skipping to the next block…
          </div>
          <div style={{ width: 120, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
            <div style={{ height: '100%', background: ACCENT, animation: 'wf-skip-bar 1.4s linear forwards' }} />
          </div>
          <style>{`@keyframes wf-skip-bar { from { width: 0%; } to { width: 100%; } }`}</style>
        </div>
      )}

      {/* Main work area */}
      {!completed && cur && !basePosLooksIdentity && (
        <div className="wf-stage" style={{ position: 'absolute', inset: '110px 24px 220px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, zIndex: 4 }}>
          <WordMission kind="construction" current={idx} total={total} chain={arcade.chain} reaction={arcade.reaction}/><div className="wa-checklist"><span>BASE {cur.base_word}</span><span className={draft.trim()&&normalise(draft)!==normalise(cur.base_word)?'is-ready':''}>New form {draft.trim()&&normalise(draft)!==normalise(cur.base_word)?'✓':'○'}</span><span className={verdict==='right'?'is-ready':''}>Fits the sentence {verdict==='right'?'✓':'○'}</span></div>
          {/* Sentence carved on a stone slab */}
          <div
            key={`s-${cur.id}`}
            role="region"
            aria-label="Sentence carved on the wall"
            style={{
              maxWidth: 640, width: '100%',
              padding: '20px 24px',
              background: `linear-gradient(180deg, ${STONE_LIGHT} 0%, ${STONE_DARK} 100%)`,
              color: '#1F1611',
              borderRadius: 4,
              boxShadow: 'inset 0 0 60px rgba(0,0,0,0.45), 0 18px 30px -16px rgba(0,0,0,0.6)',
              fontFamily: 'Georgia, serif',
              fontSize: 22, lineHeight: 1.4,
              textAlign: 'center',
              letterSpacing: '0.02em',
              position: 'relative',
              animation: 'em-rise 540ms var(--em-ease) both',
              backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='3'/><feColorMatrix values='0 0 0 0 0.30  0 0 0 0 0.20  0 0 0 0 0.10  0 0 0 0.30 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>"), linear-gradient(180deg, ${STONE_LIGHT}, ${STONE_DARK})`,
            }}
          >
            <div className="em-eyebrow" style={{ color: '#3A2A18', marginBottom: 8, fontSize: 10, letterSpacing: '0.28em' }}>
              CARVED ABOVE THE GATE · NAPIS NAD BRAMĄ
            </div>
            {cur.sentence.split('___').map((part, i, arr) => (
              <React.Fragment key={i}>
                <span>{part}</span>
                {i < arr.length - 1 && (
                  <span style={{
                    display: 'inline-block', minWidth: 100,
                    margin: '0 6px',
                    borderBottom: `3px solid #1F1611`,
                    color: verdict === 'right' ? '#1B5A2A' : '#1F1611',
                    fontFamily: 'Georgia, serif',
                    fontWeight: 600,
                  }}>{verdict === 'right' ? cur.answer : '_______'}</span>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Block + chisel */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, maxWidth: 700, width: '100%', flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* Raw stone block (BASE word) */}
            <div
              key={`b-${cur.id}`}
              aria-hidden="true"
              style={{
                position: 'relative',
                padding: '24px 28px',
                background: `linear-gradient(180deg, ${STONE_LIGHT}, ${STONE_DARK})`,
                color: '#1F1611',
                borderRadius: 4,
                boxShadow: chipFlash
                  ? `inset 0 0 40px rgba(155,28,46,0.40), 0 10px 24px -10px rgba(0,0,0,0.6)`
                  : `inset 0 0 40px rgba(0,0,0,0.35), 0 10px 24px -10px rgba(0,0,0,0.6)`,
                fontFamily: 'var(--em-decor)',
                fontSize: 36, letterSpacing: '0.06em',
                animation: chipFlash ? 'em-shake 0.4s var(--em-ease)' : 'wf-stone-rise 540ms var(--em-ease) both',
              }}
            >
              {cur.base_word}
              {/* Stone chips falling on wrong answers */}
              {chipFlash && Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  left: `${10 + i * 14}%`, top: '70%',
                  width: 6, height: 6, background: STONE_DARK,
                  borderRadius: 1,
                  animation: `wf-chip-fall ${0.6 + (i % 3) * 0.1}s ease-in ${i * 0.04}s forwards`,
                }} />
              ))}
            </div>

            {/* Chisel arrow + POS target */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div className="em-eyebrow" style={{ color: ACCENT, fontSize: 9, letterSpacing: '0.22em' }}>CHISEL TO</div>
              <svg width="60" height="32" viewBox="0 0 60 32" aria-hidden="true">
                <line x1="2" y1="16" x2="48" y2="16" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" />
                <polyline points="40,8 50,16 40,24" stroke={ACCENT} strokeWidth="2.5" fill="none" strokeLinejoin="round" />
              </svg>
              <div style={{
                padding: '6px 12px',
                background: `linear-gradient(180deg, ${ACCENT}33, ${ACCENT_DEEP}22)`,
                border: `1px solid ${ACCENT}88`, borderRadius: 999,
                fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.18em',
                color: ACCENT,
              }}>
                {POS_LABEL[cur.target_pos].en} · {POS_LABEL[cur.target_pos].pl}
              </div>
            </div>

            {/* Carved input */}
            <div style={{ position: 'relative', minWidth: 220 }}>
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); if (verdict) setVerdict(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                placeholder="chiselled form"
                aria-label="Type the chiselled word form"
                disabled={!!forcedState || verdict === 'right'}
                style={{
                  padding: '18px 18px',
                  fontFamily: 'Georgia, serif',
                  fontSize: 24,
                  background: `linear-gradient(180deg, ${STONE_LIGHT}, #ddc89e)`,
                  color: verdict === 'right' ? '#1B5A2A' : '#1F1611',
                  borderRadius: 4,
                  border: 'none',
                  boxShadow: verdict === 'right'
                    ? `inset 0 0 30px rgba(52,211,153,0.30), 0 0 30px ${ACCENT}66`
                    : verdict === 'wrong'
                      ? `inset 0 0 30px rgba(155,28,46,0.30)`
                      : `inset 0 0 30px rgba(0,0,0,0.35)`,
                  outline: 'none',
                  textAlign: 'center',
                  width: '100%', minWidth: 220,
                  letterSpacing: '0.03em',
                  transition: 'all 220ms var(--em-ease)',
                  animation: verdict === 'right' ? 'wf-spark 0.6s var(--em-ease)' : 'none',
                }}
              />
              {/* Sparks on success */}
              {verdict === 'right' && (
                <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{
                      position: 'absolute',
                      left: `${20 + i * 8}%`, top: '50%',
                      width: 3, height: 3, background: ACCENT,
                      borderRadius: '50%',
                      boxShadow: `0 0 6px ${ACCENT}`,
                      animation: `wf-spark-fly ${0.5 + (i % 3) * 0.1}s ease-out ${i * 0.03}s forwards`,
                    }} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="wa-word-parts"><div className="wa-inline-tools"><button aria-expanded={partsOpen} onClick={()=>setPartsOpen(v=>!v)}>Word-part workbench {partsOpen?'−':'+'}</button><span>Build a form, then adjust its spelling.</span></div>{partsOpen&&verdict!=='right'&&<div className="wa-affixes"><button onClick={()=>setDraft(cur.base_word.toLowerCase())}>BASE: {cur.base_word}</button>{['un','re','dis'].map(part=><button key={part} onClick={()=>setDraft(part+(draft||cur.base_word.toLowerCase()))}>{part}−</button>)}{['ly','ness','ment','tion','ity','ful','less','er'].map(part=><button key={part} onClick={()=>setDraft((draft||cur.base_word.toLowerCase())+part)}>−{part}</button>)}</div>}</div>
          {/* Action row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            {verdict !== 'right' && (
              <button className="em-btn em-btn-ghost" onClick={submit}>
                Strike chisel ↵
              </button>
            )}
            {verdict === 'right' && (
              <button
                className="em-btn em-btn-primary"
                onClick={advance}
                style={{ background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})`, color: '#0E0A1A', borderColor: ACCENT }}
              >
                {idx + 1 >= total ? 'Close yard →' : 'Next block →'}
              </button>
            )}
          </div>

          {hintRevealed && verdict !== 'right' && (
            <div role="status" aria-live="polite" style={{
              maxWidth: 560, padding: '10px 14px',
              background: `${ACCENT}1c`, border: `1px dashed ${ACCENT}88`,
              borderRadius: 6, fontSize: 13, color: 'var(--em-text)',
              animation: 'em-tip-fade 220ms var(--em-ease) both',
            }}>
              <span className="em-eyebrow" style={{ color: ACCENT, marginRight: 6 }}>STONEMASON&apos;S NOTE</span>
              {cur.hint ?? `Form a ${POS_LABEL[cur.target_pos].en.toLowerCase()} from ${cur.base_word}.`}
              <span style={{ display: 'block', marginTop: 4, fontStyle: 'italic', opacity: 0.85 }}>🇵🇱 {cur.hint_pl}</span>
            </div>
          )}

          {verdict === 'wrong' && (
            <div role="status" aria-live="polite" style={{
              maxWidth: 560, padding: '8px 12px',
              background: 'rgba(251,113,133,0.10)',
              border: '1px dashed rgba(251,113,133,0.55)',
              borderRadius: 6, fontSize: 13, color: '#FFD9DD',
              animation: 'em-tip-fade 220ms var(--em-ease) both',
            }}>
              <span className="em-eyebrow" style={{ color: '#FB7185', marginRight: 6 }}>FEEDBACK</span>
              The right form was "<strong>{cur.answer}</strong>". Press chisel to keep going.
            </div>
          )}
        </div>
      )}

      {/* Instructions modal only — HintCard + standalone Bajla removed
          2026-05-03; chat-widget speech bubble carries the brief. */}
      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, zIndex: 5 }}>
        <div className="em-shell-hint" style={{ flex: 1, maxWidth: 560 }}>
        </div>
      </div>

      {/* Completion overlay — suppressed when host wires onSessionComplete
          (the host's <PracticeReview> takes over the completion UI). */}
      {completed && !onSessionComplete && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Mason's Yard complete"
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 14,
            animation: 'em-rise 0.4s var(--em-ease)', zIndex: 20,
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>
            The yard goes quiet.
          </div>
          <div className="em-eyebrow">{score} / {total} BLOCKS · KAMIENIARNIA ZAMKNIĘTA</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="em-btn em-btn-ghost" onClick={reset}>Try another</button>
            <button
              className="em-btn em-btn-primary"
              onClick={reset}
              style={{ background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})`, color: '#0E0A1A', borderColor: ACCENT }}
            >
              Next district →
            </button>
          </div>
        </div>
      )}
      <Confetti show={completed} />

      <style>{`
        @keyframes wf-stone-rise {
          0%   { opacity: 0; transform: translateY(20px) rotate(-1deg); }
          100% { opacity: 1; transform: translateY(0) rotate(0); }
        }
        @keyframes wf-chip-fall {
          0%   { transform: translate(0, 0) rotate(0); opacity: 1; }
          100% { transform: translate(${(Math.random() * 30 - 15) | 0}px, 80px) rotate(180deg); opacity: 0; }
        }
        @keyframes wf-spark {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.04); }
          100% { transform: scale(1); }
        }
        @keyframes wf-spark-fly {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(${(Math.random() * 60 - 30) | 0}px, -40px) scale(0.4); opacity: 0; }
        }
        /* Right-rail (Ricky · 2026-05-02 · audit §4 #8). */
        .em-shell-wordformation .wf-rail { display: none; }
        @media (min-width: 1280px) {
          .em-shell-wordformation .wf-rail {
            display: flex;
            flex-direction: column;
            position: absolute;
            top: 110px;
            right: 24px;
            bottom: 220px;
            width: 280px;
            padding: 18px 18px 16px;
            background: rgba(20, 12, 36, 0.62);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(251, 191, 36, 0.28);
            border-radius: 14px;
            box-shadow: inset 0 0 60px rgba(192, 152, 77, 0.06), 0 18px 40px -16px rgba(0,0,0,0.5);
            z-index: 4;
            color: var(--em-text);
            font-family: var(--em-body);
            overflow-y: auto;
          }
          .em-shell-wordformation .wf-stage {
            inset: 110px 326px 220px 24px !important;
          }
          .em-shell-wordformation .wf-rail-list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex: 1;
          }
          .em-shell-wordformation .wf-rail-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 10px;
            border-radius: 6px;
            background: rgba(0, 0, 0, 0.32);
            border: 1px solid rgba(255, 255, 255, 0.06);
            position: relative;
            transition: background 140ms;
          }
          .em-shell-wordformation .wf-rail-item-cur {
            background: rgba(251, 191, 36, 0.14);
            border-color: rgba(251, 191, 36, 0.55);
            box-shadow: 0 0 14px rgba(251, 191, 36, 0.18);
          }
          .em-shell-wordformation .wf-rail-item-past {
            opacity: 0.55;
          }
          .em-shell-wordformation .wf-rail-num {
            font-family: var(--em-mono);
            font-size: 10px;
            color: rgba(255,255,255,0.4);
            letter-spacing: 0.08em;
            min-width: 18px;
          }
          .em-shell-wordformation .wf-rail-body {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-width: 0;
            gap: 2px;
          }
          .em-shell-wordformation .wf-rail-base {
            font-family: var(--em-decor);
            font-size: 14px;
            letter-spacing: 0.04em;
            color: #C8B698;
          }
          .em-shell-wordformation .wf-rail-arrow {
            font-family: var(--em-mono);
            font-size: 10px;
            letter-spacing: 0.18em;
            color: #FBBF24;
          }
          .em-shell-wordformation .wf-rail-pl {
            font-size: 10px;
            color: rgba(255,255,255,0.45);
            font-style: italic;
          }
          .em-shell-wordformation .wf-rail-pin {
            font-size: 10px;
            color: #FBBF24;
            min-width: 14px;
            text-align: right;
          }
          .em-shell-wordformation .wf-rail-pin-done {
            color: #34D399;
          }
          .em-shell-wordformation .wf-rail-foot {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px dashed rgba(255, 255, 255, 0.14);
          }
          .em-shell-wordformation .wf-rail-foot-icon {
            flex-shrink: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default WordFormationShell;
