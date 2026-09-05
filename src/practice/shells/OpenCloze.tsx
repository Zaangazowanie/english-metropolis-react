import { lazy as wordLazy, Suspense as WordSuspense } from 'react';
const WordScene3D = wordLazy(() => import('../shells3d/WordOpenCloze3D'));
import { clozeResolved, claimClozeAttempt } from './word-arcade-mechanics';
// Open Cloze — The Vellum Atelier district.
// A scribe's desk at dusk. A sheet of parchment lies under candlelight; the
// student fills the missing words with quill-ink (typed input). Each blank
// is a recessed inkwell on the page. Wrong words wash out; the right word
// "dries" into the parchment. Wax drips around the candle when complete.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { WordMission, useWordArcade } from './word-arcade';
import { useShellProgress } from '../lib/convex-stubs';
import React, { useState, useEffect, useMemo, useRef } from 'react';
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

// Vellum Atelier · Open Cloze — full bilingual instruction copy.
const OPENCLOZE_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A sentence appears with one or more inkwell-shaped gaps to fill.',
      'Click an inkwell to focus it, then type the missing word.',
      'Press Enter to commit; correct words ink in, wrong words wash out so you can retry.',
      'A sentence is solved when every inkwell holds the correct word.',
    ],
    pl: [
      'Pojawia się zdanie z jednym lub kilkoma kałamarzami do uzupełnienia.',
      'Kliknij kałamarz, aby go aktywować, potem wpisz brakujące słowo.',
      'Naciśnij Enter, aby zatwierdzić; trafne słowa wsiąkają, błędne się rozpływają — spróbuj ponownie.',
      'Zdanie jest rozwiązane, gdy każdy kałamarz zawiera właściwe słowo.',
    ],
  },
  controls: {
    en: [
      'Inkwell input: each gap is a typeable input with a small blinking quill cursor when focused.',
      'Enter: commits the current input. Tab: moves focus to the next inkwell.',
      'Backspace on empty input: jumps focus back to the previous inkwell.',
      'Hint button: 3 hints per session — reveals one letter or the first letter of the active inkwell.',
      'Skip button: jumps to the next sentence (counts as wrong).',
    ],
    pl: [
      'Pole kałamarza: każda luka to pole tekstowe z małym mrugającym piórkiem, gdy jest aktywne.',
      'Enter: zatwierdza wpisaną odpowiedź. Tab: przenosi fokus do następnego kałamarza.',
      'Backspace na pustym polu: cofa fokus do poprzedniego kałamarza.',
      'Przycisk Podpowiedź: 3 podpowiedzi na sesję — odkrywa literę lub pierwszą literę aktywnego kałamarza.',
      'Przycisk Pomiń: przeskakuje do następnego zdania (liczy się jako błąd).',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right word: the inkwell fills, the word inks in dark, focus auto-moves to the next gap.',
      'Wrong word: the input washes back to empty with a soft red glow — input stays focused.',
      'Variant tolerance: simple plurals and contractions are accepted (e.g. "it\'s" / "it is").',
      'Skip: counts as wrong; the correct word is revealed in soft amber before the next sentence loads.',
    ],
    pl: [
      'Trafne słowo: kałamarz się napełnia, słowo wsiąka na ciemno, fokus przeskakuje do następnej luki.',
      'Błędne słowo: pole się czyści z miękką czerwoną poświatą — fokus pozostaje.',
      'Tolerancja wariantów: akceptowane są proste liczby mnogie i skróty (np. „it\'s" / „it is").',
      'Pomiń: liczy się jako błąd; poprawne słowo pojawia się w bursztynie, zanim załaduje się następne zdanie.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Tapping the hint button on a focused inkwell reveals its first letter (or next letter if the first is already filled). Save them for prepositions and articles where Polish gives no transfer help.',
    pl:
      'Masz 3 podpowiedzi na sesję. Kliknięcie podpowiedzi na aktywnym kałamarzu odkrywa pierwszą literę (lub następną, jeśli pierwsza jest już wypełniona). Zachowaj je na przyimki i rodzajniki, gdzie polski nie pomaga w przeniesieniu.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each fully solved sentence adds to your session streak. Completing all sentences in the deck unlocks the Atelier completion screen and posts your score back to your timeline.',
    pl:
      'Pomiń liczy się jako błąd. Każde w pełni rozwiązane zdanie zwiększa serię. Ukończenie wszystkich zdań odblokowuje ekran zakończenia Atelier i zapisuje wynik na osi czasu.',
  },
  l1Pattern: {
    en:
      'Polish has no equivalent of "a / an / the", so the gap with no Polish transfer cue is the hardest. Read the sentence twice — definite (the) for known things, indefinite (a/an) for first mentions.',
    pl:
      'Polski nie ma odpowiednika „a / an / the", więc luka bez polskiej kalki jest najtrudniejsza. Przeczytaj zdanie dwa razy — określony („the") dla rzeczy znanych, nieokreślony („a/an") dla pierwszej wzmianki.',
  },
};

// ─────────────────────────────────────────────────────────────
// Types — shell-internal puzzle interface (main session will mirror to
// adapters.ts as ShellOpenClozePuzzle).
// ─────────────────────────────────────────────────────────────
export type OCForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface OCGap {
  id: number;
  answer: string;
  acceptedAnswers?: string[];
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface ShellOpenClozePuzzle {
  passage: string;        // contains [BLANK_n] markers (1-indexed)
  passage_pl?: string;
  gaps: OCGap[];
}

export interface OpenClozeShellProps {
  time?: TimeOfDay;
  state?: OCForcedState;
  puzzle?: ShellOpenClozePuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3 Wave-5 (Ricky 2026-05-02): per-gap review payload. Fires once when
   * every inkwell on the parchment has been filled (right or wrong/skipped).
   * Carries the full puzzle + per-gap student inputs so PracticeReview can
   * show one review row per inkwell (sentence with gap highlighted →
   * student's typed word vs canonical answer).
   */
  onSessionComplete?: (info: {
    correctCount: number;
    totalGaps: number;
    wrongAttempts: Array<{
      questionId: string;
      studentAnswer: string;
      correctAnswer: string;
      explanationPL?: string;
      exerciseId?: string;
    }>;
    puzzle: ShellOpenClozePuzzle;
    studentInputs: Record<number, string>;
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// renderOpenClozeReviewItem — per-gap locked render for PracticeReview.
// Vellum Atelier scoreboard: passage with this gap highlighted (other gaps
// shown filled) + student's typed word vs canonical answer + EN/PL hint.
// ─────────────────────────────────────────────────────────────────────────
const OC_REVIEW_ACCENT = '#F4C77A'; // amber on cream
const OC_REVIEW_DEEP = '#7A4A14';
export function renderOpenClozeReviewItem(
  item: {
    gap: OCGap;
    number: number;
    passage: string;
    allGaps: OCGap[];
    studentInput: string | undefined;
  },
  _idx: number,
): React.ReactNode {
  const { gap, number, passage, allGaps, studentInput } = item;
  const stu = (studentInput ?? '').trim();
  const correct = gap.answer;
  const accepted = [correct, ...(gap.acceptedAnswers ?? [])];
  const variants = (gap.acceptedAnswers ?? []).filter((v) => v && v !== correct);
  const stuNorm = normalise(stu);
  const isCorrect = stu.length > 0 && accepted.map(normalise).includes(stuNorm);
  const isSkipped = stu.length === 0;
  // Inline the passage with all OTHER gaps filled with their canonical
  // answer, and THIS gap highlighted as a wax-amber inkwell.
  const tokens = tokenise(passage);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '14px 16px',
      background: isCorrect
        ? 'linear-gradient(180deg, rgba(244,199,122,0.10), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))',
      border: `1px solid ${isCorrect ? 'rgba(244,199,122,0.45)' : 'rgba(251,113,133,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${OC_REVIEW_ACCENT}22`, color: OC_REVIEW_ACCENT,
          border: `1px solid ${OC_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          INKWELL {String(number).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isCorrect
            ? 'rgba(244,199,122,0.20)'
            : isSkipped
              ? 'rgba(245,239,255,0.10)'
              : 'rgba(251,113,133,0.18)',
          color: isCorrect ? OC_REVIEW_ACCENT : isSkipped ? 'rgba(245,239,255,0.55)' : '#FB7185',
        }}>
          {isCorrect ? '✓ TAK · DRIED' : isSkipped ? '· SKIPPED · POMINIĘTE' : '✗ NIE · WASHED'}
        </span>
      </div>
      {/* Parchment excerpt — quoted reference text with this gap highlighted. */}
      <div style={{
        fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.7,
        color: '#231509',
        padding: '10px 14px',
        background: 'linear-gradient(180deg, #F4E4BC 0%, #E5C98A 100%)',
        borderRadius: 4,
        boxShadow: 'inset 0 0 30px rgba(120,80,30,0.15)',
      }}>
        {tokens.map((t, i) => {
          if (t.kind === 'text') return <span key={i}>{t.value}</span>;
          if (t.id === gap.id) {
            return (
              <span key={i} style={{
                display: 'inline-block', minWidth: 60,
                padding: '1px 8px', margin: '0 2px',
                background: `${OC_REVIEW_ACCENT}66`,
                color: OC_REVIEW_DEEP,
                fontWeight: 700, fontStyle: 'italic',
                border: `1.5px dashed ${OC_REVIEW_DEEP}`,
                borderRadius: 3,
              }}>
                ___ ({t.id})
              </span>
            );
          }
          const otherGap = allGaps.find((g) => g.id === t.id);
          return (
            <span key={i} style={{
              display: 'inline-block',
              padding: '0 4px', margin: '0 2px',
              color: '#5A3F1A', fontStyle: 'italic',
              opacity: 0.85,
            }}>
              {otherGap?.answer ?? '___'}
            </span>
          );
        })}
      </div>
      {!isCorrect && !isSkipped && (
        <div style={{ color: '#FB7185', fontFamily: 'var(--em-decor)', fontSize: 17 }}>
          ✗ NIE · You typed: <strong>{stu}</strong>
        </div>
      )}
      {isSkipped && (
        <div style={{ color: 'rgba(245,239,255,0.55)', fontFamily: 'var(--em-decor)', fontSize: 15, fontStyle: 'italic' }}>
          (no word entered)
        </div>
      )}
      <div style={{ color: OC_REVIEW_ACCENT, fontFamily: 'var(--em-decor)', fontSize: 17 }}>
        ✓ TAK · The word: <strong>{correct}</strong>
        {variants.length > 0 && (
          <span style={{ fontSize: 13, opacity: 0.85, marginLeft: 8, fontStyle: 'italic' }}>
            (also accepted: {variants.join(', ')})
          </span>
        )}
      </div>
      <div style={{ fontFamily: 'var(--em-body)', fontSize: 13, color: 'var(--em-text-muted)' }}>
        {gap.hint}
        <div style={{ opacity: 0.75, fontStyle: 'italic', marginTop: 2 }}>🇵🇱 {gap.hint_pl}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Built-in demo
// ─────────────────────────────────────────────────────────────
export const OC_PUZZLE: ShellOpenClozePuzzle = {
  passage:
    'The old metro station opened [BLANK_1] 1903. It is one [BLANK_2] the oldest in Europe. Many travellers ' +
    'pass through it [BLANK_3] day. They never notice the small inscription [BLANK_4] the marble pillar. ' +
    'It says: "[BLANK_5] who waits, arrives." Some [BLANK_6] them stop and read.',
  passage_pl:
    'Stara stacja metra została otwarta w 1903 roku. To jedna z najstarszych w Europie...',
  gaps: [
    { id: 1, answer: 'in',     hint: 'Preposition for years.',          hint_pl: 'Przyimek dla lat — w (roku).' },
    { id: 2, answer: 'of',     hint: 'Preposition of belonging.',       hint_pl: 'Przyimek przynależności — z, od, ze.' },
    { id: 3, answer: 'every',  hint: 'How often? Każdy.',              hint_pl: 'Jak często? Każdego dnia.' },
    { id: 4, answer: 'on',     hint: 'Preposition of contact.',         hint_pl: 'Przyimek kontaktu — na (filarze).' },
    { id: 5, answer: 'He',     hint: 'Subject pronoun, third person.',  hint_pl: 'Zaimek osobowy — on.' },
    { id: 6, answer: 'of',     hint: 'Same preposition as gap 2.',      hint_pl: 'Ten sam przyimek co w luce 2 — z.' },
  ],
};

const ACCENT = '#7DD3FC';                 // cyan
const ACCENT_DEEP = '#1F73A6';
const PARCHMENT = '#F4E4BC';
const INK = '#231509';

// ─────────────────────────────────────────────────────────────
// Tokeniser — split a passage into text spans + blank slots.
// ─────────────────────────────────────────────────────────────
type Token =
  | { kind: 'text'; value: string }
  | { kind: 'blank'; id: number };

function tokenise(passage: string): Token[] {
  const tokens: Token[] = [];
  const re = /\[BLANK_(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(passage)) !== null) {
    if (m.index > last) tokens.push({ kind: 'text', value: passage.slice(last, m.index) });
    tokens.push({ kind: 'blank', id: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < passage.length) tokens.push({ kind: 'text', value: passage.slice(last) });
  return tokens;
}


// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export const OpenClozeShell: React.FC<OpenClozeShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const arcade = useWordArcade();
  // Kelly Tier-2 (2026-05-02): defensive props guard.
  const propsInvalid = !forcedState && puzzle !== undefined && (!puzzle.gaps || puzzle.gaps.length === 0);
  const activePuzzle: ShellOpenClozePuzzle =
    puzzle && puzzle.gaps.length > 0 ? puzzle : OC_PUZZLE;
  const tokens = useMemo(() => tokenise(activePuzzle.passage), [activePuzzle.passage]);
  const total = activePuzzle.gaps.length;
  const persisted = useShellProgress('opencloze');

  const [values, setValues] = useState<Record<number, string>>({});
  const [locked, setLocked] = useState<Record<number, 'right' | 'wrong'>>({});
  const [activeId, setActiveId] = useState<number>(activePuzzle.gaps[0]?.id ?? 1);
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [revealedHintFor, setRevealedHintFor] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  // Kelly Tier-2 (2026-05-02): focus-trap refs for the ink-dried dialog.
  const tryAnotherBtnRef = useRef<HTMLButtonElement | null>(null);
  const nextDistrictBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const [skippedIds, setSkippedIds] = useState<Set<number>>(new Set());
  const correctCount = Object.values(locked).filter((s) => s === 'right').length;
  const completed = correctCount === total;
  const tip = useEndOfShellTip({ onWrongAnswer, completed, forcedState });

  // D3 Wave-5 (Ricky 2026-05-02): per-deck wrong-attempt log + per-gap final
  // input for the review-screen payload. wrongAttemptsRef avoids re-renders on
  // push (mirrors the useEndOfShellTip pattern). sessionFiredRef prevents
  // double-fires.
  const wrongAttemptsRef = useRef<Array<{
    questionId: string; studentAnswer: string; correctAnswer: string;
    explanationPL?: string; exerciseId?: string;
  }>>([]);
  const studentInputsRef = useRef<Record<number, string>>({});
  const sessionFiredRef = useRef(false);
  const submittedAttemptsRef = useRef(new Map<number, string>());

  // Auto-save.
  useEffect(() => {
    if (forcedState) return;
    persisted.save({
      progress: correctCount / Math.max(1, total),
      lastState: completed ? 'complete' : 'active',
    });
    if (completed) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctCount, total, forcedState]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'opencloze',
      brief: 'Type the missing word into each inkwell, then press Enter.',
      brief_pl: 'Wpisz brakujące słowo w każdy kałamarz i naciśnij Enter.',
      detail: 'A vellum manuscript has gaps — open inkwells where words once stood. Type your guess into each gap and press Enter to test it. Correct words ink in; wrong ones wash out so you can try again. There is no word bank, so think about register and grammar.',
      detail_pl: 'W manuskrypcie z welinu są luki — otwarte kałamarze, w których kiedyś były słowa. Wpisz swój strzał w każdą lukę i naciśnij Enter. Poprawne słowa zostają wpisane atramentem; błędne się rozpływają. Nie ma puli słów, więc zastanów się nad rejestrem i gramatyką.',
      fullInstructions: OPENCLOZE_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  // D3 Wave-5: fire onSessionComplete ONCE when every inkwell on the parchment
  // has been resolved (right OR locked-wrong via Skip). Distinct from the
  // in-shell "ink has dried" overlay which only fires on full success.
  const allResolved = clozeResolved(activePuzzle.gaps, locked, skippedIds);
  useEffect(() => {
    if (forcedState) return;
    if (!allResolved) return;
    if (sessionFiredRef.current) return;
    if (!onSessionComplete) return;
    sessionFiredRef.current = true;
    // Snapshot the per-gap final student input.
    const snapshot: Record<number, string> = {};
    activePuzzle.gaps.forEach((g) => { snapshot[g.id] = values[g.id] ?? ''; });
    studentInputsRef.current = snapshot;
    arcade.complete();
    onSessionComplete({
      correctCount,
      totalGaps: total,
      wrongAttempts: [...wrongAttemptsRef.current],
      puzzle: activePuzzle,
      studentInputs: snapshot,
    });
  }, [allResolved, forcedState, onSessionComplete, correctCount, total, activePuzzle, values]);

  // Forced-state previews.
  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') { setValues({}); setLocked({}); }
    if (forcedState === 'active') {
      setValues({ [activePuzzle.gaps[0].id]: '' });
      setLocked({});
    }
    if (forcedState === 'correct') {
      const g = activePuzzle.gaps[0];
      setValues({ [g.id]: g.answer });
      setLocked({ [g.id]: 'right' });
    }
    if (forcedState === 'wrong') {
      const g = activePuzzle.gaps[0];
      setValues({ [g.id]: 'xxx' });
      setLocked({ [g.id]: 'wrong' });
    }
    if (forcedState === 'complete') {
      const v: Record<number, string> = {};
      const l: Record<number, 'right' | 'wrong'> = {};
      activePuzzle.gaps.forEach((g) => { v[g.id] = g.answer; l[g.id] = 'right'; });
      setValues(v); setLocked(l);
    }
  }, [forcedState, activePuzzle]);

  const setVal = (id: number, v: string): void => {
    setValues((prev) => ({ ...prev, [id]: v }));
    if (locked[id] === 'wrong') {
      // Re-arm — let the player retry.
      setLocked((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const submit = (id: number): void => {
    if (forcedState) return;
    const gap = activePuzzle.gaps.find((g) => g.id === id);
    if (!gap) return;
    if (locked[id] === 'right' || skippedIds.has(id)) return;
    const candidate = normalise(values[id] ?? '');
    if (!claimClozeAttempt(submittedAttemptsRef.current, id, candidate)) return;
    const accepted = [normalise(gap.answer), ...(gap.acceptedAnswers ?? []).map(normalise)];
    const correct = accepted.includes(candidate);
    setLocked((prev) => ({ ...prev, [id]: correct ? 'right' : 'wrong' }));
    arcade.answer(correct);
    if (correct) {
      setAnnouncement(`Inkwell ${id} dries: ${gap.answer}.`);
      // Auto-advance focus to the next un-answered gap.
      const idxNow = activePuzzle.gaps.findIndex((g) => g.id === id);
      const nextGap = activePuzzle.gaps.slice(idxNow + 1).find((g) => locked[g.id] !== 'right');
      if (nextGap) {
        setActiveId(nextGap.id);
        setTimeout(() => inputRefs.current[nextGap.id]?.focus(), 60);
      }
    } else {
      setAnnouncement(`Not quite. The ink ran. Try another word or use a hint.`);
      const wrongPayload = {
        questionId: `gap-${id}`,
        studentAnswer: values[id] ?? '',
        correctAnswer: gap.answer,
        explanationPL: gap.hint_pl,
        exerciseId: gap.exerciseId,
      };
      tip.recordWrong(wrongPayload);
      // D3 Wave-5: also push to per-deck log for the review-screen payload.
      wrongAttemptsRef.current = [...wrongAttemptsRef.current, wrongPayload];
    }
  };

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 3) return;
    // Reveal the hint text for the focused gap. If none focused, pick the
    // first un-answered gap.
    const target = activePuzzle.gaps.find((g) => g.id === activeId && locked[g.id] !== 'right')
      ?? activePuzzle.gaps.find((g) => locked[g.id] !== 'right');
    if (!target) return;
    setRevealedHintFor(target.id);
    setHintsUsed((h) => h + 1);
    setTimeout(() => setRevealedHintFor((prev) => (prev === target.id ? null : prev)), 4500);
  };

  const skip = (): void => {
    if (forcedState) return;
    const target = activePuzzle.gaps.find((g) => locked[g.id] !== 'right' && !skippedIds.has(g.id));
    if (!target) return;
    setSkippedIds(prev => new Set(prev).add(target.id));
    arcade.answer(false);
    setLocked((prev) => ({ ...prev, [target.id]: 'wrong' }));
    setAnnouncement(`Skipped. Correct word: ${target.answer}.`);
    // D3 Wave-5: log the skip as a wrong-attempt with empty student input.
    wrongAttemptsRef.current = [...wrongAttemptsRef.current, {
      questionId: `gap-${target.id}`,
      studentAnswer: values[target.id] ?? '',
      correctAnswer: target.answer,
      explanationPL: target.hint_pl,
      exerciseId: target.exerciseId,
    }];
  };

  const reset = (): void => {
    arcade.restart(); setSkippedIds(new Set());
    setValues({}); setLocked({}); setActiveId(activePuzzle.gaps[0]?.id ?? 1);
    setHintsUsed(0); setRevealedHintFor(null); setAnnouncement('');
    tip.reset();
    // D3 Wave-5: clear per-deck log + re-arm the session-complete fire flag.
    wrongAttemptsRef.current = [];
    studentInputsRef.current = {};
    sessionFiredRef.current = false;
    submittedAttemptsRef.current.clear();
  };

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the ink-dried dialog.
  useEffect(() => {
    if (!completed) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const focusId = window.setTimeout(() => { nextDistrictBtnRef.current?.focus(); }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusables = [tryAnotherBtnRef.current, nextDistrictBtnRef.current].filter(Boolean) as HTMLButtonElement[];
        if (focusables.length === 0) return;
        const idx = focusables.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        if (e.shiftKey) {
          const next2 = idx <= 0 ? focusables[focusables.length - 1] : focusables[idx - 1];
          next2.focus();
        } else {
          const next2 = idx === -1 || idx >= focusables.length - 1 ? focusables[0] : focusables[idx + 1];
          next2.focus();
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        reset();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      window.clearTimeout(focusId);
      document.removeEventListener('keydown', trap);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  // ─── Render ──────────────────────────────────────────────────────────
  const focusedHint = revealedHintFor !== null ? activePuzzle.gaps.find((g) => g.id === revealedHintFor) : null;
  const liveStatus = completed
    ? 'Manuscript complete. Every inkwell dried.'
    : announcement;

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div
      className="em-shell wa-form-game em-shell-opencloze"
      role="application"
      aria-label="Open Cloze, The Vellum Atelier"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {liveStatus}
      </div>

      {/* ─── Header ─── */}
      <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, zIndex: 5, flexWrap: 'wrap' }}>
        <AmbientAudioPlayer shellSlug="opencloze" />
        <Nameplate
          district="The Vellum Atelier"
          subtitle="Open Cloze · Tekst z lukami · fill the parchment"
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M5 18 L13 4 L17 6 L9 20 Z" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
              <path d="M9 20 L7 18" stroke={ACCENT} strokeWidth="1.5" />
              <path d="M3 18 H6" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress current={correctCount} total={total} accent={ACCENT} />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      {/* ─── Parchment ─── */}
      <div className="oc-stage" style={{ position: 'absolute', inset: '110px 24px 220px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', zIndex: 4 }}>
        <WordMission kind="manuscript" current={correctCount} total={total} chain={arcade.chain} reaction={arcade.reaction}/>
        <WordSuspense fallback={<p>Opening the 3D district…</p>}><WordScene3D gaps={activePuzzle.gaps.map(g=>({id:g.id,value:values[g.id]??'',done:locked[g.id]==='right',wrong:locked[g.id]==='wrong',skipped:skippedIds.has(g.id)}))} active={activeId} onSelect={id=>{setActiveId(id);inputRefs.current[id]?.focus();}} onSeal={submit}/></WordSuspense>
        <div className="wa-checklist">{activePuzzle.gaps.map(g=><span key={g.id} className={locked[g.id]==='right'?'is-ready':''}>Seal {g.id} {locked[g.id]==='right'?'✓':skippedIds.has(g.id)?'—':'○'}</span>)}</div>
        <div
          role="region"
          aria-label="Parchment passage"
          style={{
            position: 'relative',
            maxWidth: 720, width: '100%',
            padding: '36px 40px 40px',
            background: `linear-gradient(180deg, ${PARCHMENT} 0%, #E5C98A 100%)`,
            color: INK,
            borderRadius: 4,
            boxShadow: '0 24px 60px -16px rgba(0,0,0,0.6), 0 6px 14px -6px rgba(0,0,0,0.45), inset 0 0 80px rgba(120,80,30,0.18)',
            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='2'/><feColorMatrix values='0 0 0 0 0.45  0 0 0 0 0.30  0 0 0 0 0.10  0 0 0 0.18 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>"), linear-gradient(180deg, ${PARCHMENT}, #E5C98A)`,
            animation: 'em-rise 540ms var(--em-ease) both',
          }}
        >
          {/* Wax seal corner */}
          <div aria-hidden="true" style={{
            position: 'absolute', top: -12, right: 24, width: 38, height: 38, borderRadius: '50%',
            background: `radial-gradient(circle at 30% 30%, #E64560, #8B1A2B 70%, #4a0a1a 100%)`,
            boxShadow: '0 4px 10px rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,235,200,0.7)', fontFamily: 'var(--em-decor)', fontSize: 16,
            transform: 'rotate(-12deg)',
          }}>EM</div>

          <div className="em-eyebrow" style={{ color: '#6B4825', marginBottom: 14, fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.28em' }}>
            MANUSCRIPT · MANUSKRYPT · {correctCount}/{total} INKWELLS
          </div>

          <div style={{ fontSize: 17, lineHeight: 1.85, fontFamily: 'Georgia, serif', color: INK }}>
            {tokens.map((t, i) => {
              if (t.kind === 'text') return <span key={i}>{t.value}</span>;
              const gap = activePuzzle.gaps.find((g) => g.id === t.id);
              if (!gap) return <span key={i} style={{ color: '#aaa' }}>[?]</span>;
              const status = locked[t.id];
              const value = values[t.id] ?? '';
              const width = Math.max(80, Math.min(180, gap.answer.length * 14 + 36));
              const isFocus = activeId === t.id;
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    margin: '0 4px',
                  }}
                >
                  <input
                    ref={(el) => { inputRefs.current[t.id] = el; }}
                    type="text"
                    value={value}
                    onChange={(e) => setVal(t.id, e.target.value)}
                    onFocus={() => setActiveId(t.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(t.id); } }}
                    aria-label={`Blank ${t.id}, ${gap.hint}`}
                    aria-invalid={status === 'wrong'}
                    disabled={status === 'right' || skippedIds.has(t.id) || !!forcedState}
                    placeholder={`(${t.id})`}
                    style={{
                      width,
                      padding: '6px 10px',
                      fontFamily: status === 'right' ? 'Georgia, serif' : 'Georgia, serif',
                      fontStyle: status === 'right' ? 'italic' : 'normal',
                      fontSize: 17,
                      color: status === 'right' ? '#1B5A2A' : status === 'wrong' ? ACCENT_DEEP : INK,
                      background: status === 'right'
                        ? 'rgba(255,255,255,0.0)'
                        : status === 'wrong'
                          ? 'rgba(155,28,46,0.10)'
                          : 'rgba(255,255,255,0.55)',
                      border: 'none',
                      borderBottom: `2px solid ${status === 'right' ? '#1B5A2A' : status === 'wrong' ? ACCENT_DEEP : isFocus ? ACCENT : 'rgba(35,21,9,0.4)'}`,
                      borderRadius: status === 'right' ? 0 : 3,
                      outline: 'none',
                      textAlign: 'center',
                      transition: 'all 220ms var(--em-ease)',
                      animation: status === 'wrong' ? 'em-shake 0.4s var(--em-ease)' : status === 'right' ? 'oc-dry 540ms var(--em-ease)' : 'none',
                      minHeight: 32,
                      boxShadow: status === 'right' ? 'none' : `inset 0 -1px 0 rgba(0,0,0,0.06)`,
                    }}
                  />
                </span>
              );
            })}
          </div>

          {/* Hint reveal — appears as a margin-note */}
          {focusedHint && (
            <div role="status" aria-live="polite" style={{
              marginTop: 16,
              padding: '10px 14px',
              borderLeft: `3px solid ${ACCENT_DEEP}`,
              background: 'rgba(31,115,166,0.06)',
              borderRadius: 4,
              fontSize: 13, color: '#3a2814', fontStyle: 'italic',
              animation: 'em-tip-fade 220ms var(--em-ease) both',
            }}>
              <span className="em-eyebrow" style={{ color: ACCENT_DEEP, marginRight: 8 }}>SCRIBE&apos;S NOTE · {focusedHint.id}</span>
              {focusedHint.hint} <span style={{ opacity: 0.85 }}>· 🇵🇱 {focusedHint.hint_pl}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Instructions modal. HintCard + standalone Bajla removed
          2026-05-03 — chat-widget speech bubble carries the brief. ─── */}
      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, zIndex: 5 }}>
        <div className="em-shell-hint" style={{ flex: 1, maxWidth: 560 }}>
        </div>
      </div>

      {/* ─── Completion overlay (DESIGN.md §4) ─── */}
      {completed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-live="assertive"
          aria-label="Vellum Atelier complete"
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
            The ink has dried.
          </div>
          <div className="em-eyebrow">{total} INKWELLS · {total} INKWELLE · MANUSCRIPT FILED</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button ref={tryAnotherBtnRef} className="em-btn em-btn-ghost" onClick={reset}>Try another</button>
            <button
              ref={nextDistrictBtnRef}
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
        @keyframes oc-candle {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%      { opacity: 1; transform: scale(1.07); }
        }
        @keyframes oc-dry {
          0%   { background-color: rgba(125,211,252,0.45); }
          50%  { background-color: rgba(52,211,153,0.30); }
          100% { background-color: rgba(255,255,255,0.0); }
        }
      `}</style>
    </div>
  );
};

export default OpenClozeShell;
