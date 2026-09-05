import { lazy as wordLazy, Suspense as WordSuspense } from 'react';
const WordScene3D = wordLazy(() => import('../shells3d/WordSentenceCorrection3D'));
import { expandErrorSelection, insertionPointMatches } from './word-arcade-mechanics';
// Sentence Correction — The Editor's Office district.
// A newspaper editor's room at midnight. Each sentence comes off the wire
// onto a typewriter sheet pinned to a clipboard. The student clicks (or
// drag-selects) the wrong word(s), then types the correction. A red proof-
// reader's pencil marks the edit; the page stamps "FILED" when correct.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { WordMission, useWordArcade } from './word-arcade';
import { useShellProgress } from '../lib/convex-stubs';
import React, { useState, useEffect, useRef, useMemo } from 'react';
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

// Editor's Office · Sentence Correction — full bilingual instruction copy.
const SENTENCECORRECTION_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A sentence appears on the editor\'s desk; some sentences contain exactly one wrong word, others have no errors.',
      'Tap the word you think is wrong — it highlights and an input opens below.',
      'Type the correction in the input and press Enter to commit.',
      'If the sentence has no errors, press the "No errors · Bez błędów" button instead of tapping a word.',
    ],
    pl: [
      'Na biurku redaktora pojawia się zdanie; niektóre zdania mają dokładnie jeden błąd, inne są bezbłędne.',
      'Stuknij słowo, które uważasz za błędne — podświetli się i otworzy pole poniżej.',
      'Wpisz poprawkę w pole i naciśnij Enter, aby zatwierdzić.',
      'Jeśli zdanie nie ma błędów, naciśnij przycisk „No errors · Bez błędów" zamiast stukać słowo.',
    ],
  },
  controls: {
    en: [
      'Sentence card: each word is individually tappable.',
      'Correction input: appears below the sentence once you have tapped the wrong word.',
      'No errors button: commit "no errors" verdict — only correct on bug-free sentences.',
      'Hint button: 3 hints per session — highlights the wrong word\'s zone in soft amber.',
      'Skip button: gives up and moves to the next sentence (counts as wrong).',
    ],
    pl: [
      'Karta zdania: każde słowo jest klikalne osobno.',
      'Pole poprawki: pojawia się pod zdaniem, gdy stukniesz błędne słowo.',
      'Przycisk No errors: zatwierdza werdykt „brak błędów" — poprawny tylko dla bezbłędnych zdań.',
      'Przycisk Podpowiedź: 3 podpowiedzi na sesję — podświetla strefę błędnego słowa na bursztyn.',
      'Przycisk Pomiń: rezygnuje i przechodzi do następnego zdania (liczy się jako błąd).',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right pick + right correction: card lights amber, +1 to your tally, the next sheet slides in.',
      'Wrong pick OR wrong correction: the right edit is shown so you learn the rule.',
      'No errors verdict on a sentence with errors: counts as wrong; the correct fix is shown.',
      'Skip: counts as wrong; the correct edit (or "no errors") is shown.',
    ],
    pl: [
      'Trafny wybór + trafna poprawka: karta świeci na bursztyn, +1 do wyniku, wsuwa się następna kartka.',
      'Błędny wybór LUB błędna poprawka: pojawia się prawidłowa edycja, żebyś poznał regułę.',
      'Werdykt „No errors" na zdaniu z błędem: liczy się jako błąd; pojawia się prawidłowa poprawka.',
      'Pomiń: liczy się jako błąd; pojawia się prawidłowa edycja (lub „no errors").',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. The hint button highlights the column-zone where the wrong word is, narrowing your search. Save them for sentences where you cannot tell whether the error is in tense, article, or preposition.',
    pl:
      'Masz 3 podpowiedzi na sesję. Przycisk podpowiedzi podświetla strefę z błędnym słowem, zawężając poszukiwania. Zachowaj je na zdania, gdzie nie wiesz, czy błąd jest w czasie, rodzajniku czy przyimku.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each correctly edited sentence adds to your session streak. Closing every sheet on the desk unlocks the Editor\'s Office completion screen and posts your score.',
    pl:
      'Pomiń liczy się jako błąd. Każde trafnie zredagowane zdanie zwiększa serię. Zamknięcie wszystkich kartek na biurku odblokowuje ekran zakończenia Biura Redaktora i zapisuje wynik.',
  },
  l1Pattern: {
    en:
      'Polish learners frequently drop articles ("I went to school" → "I went to the school" / vice-versa) and mix tense (present-perfect vs simple past). Editor\'s Office drills the audit habit: read once for sense, once for grammar, once for articles.',
    pl:
      'Polscy uczniowie często gubią rodzajniki („I went to school" ↔ „I went to the school") i mylą czasy (present perfect vs simple past). Biuro Redaktora utrwala nawyk audytu: jeden raz dla sensu, jeden dla gramatyki, jeden dla rodzajników.',
  },
};

// ─── Types ────────────────────────────────────────────────────────────────
export type SCForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

// Kelly Tier-2 audit (2026-05-02): bilingual error-type taxonomy. Lets the
// shell render a "Look for: [errorType]" chip above the sentence so the
// student knows what category of mistake to hunt for.
export type SCErrorType =
  | 'tense' | 'agreement' | 'article' | 'preposition' | 'word-choice'
  | 'plural' | 'spelling' | 'missing-word' | 'no-error' | 'other';

export const SC_ERROR_TYPE_LABEL: Record<SCErrorType, { en: string; pl: string }> = {
  tense:         { en: 'Tense',           pl: 'Czas'                 },
  agreement:     { en: 'Subject-verb agreement', pl: 'Zgodność podmiot-orzeczenie' },
  article:       { en: 'Article (a/an/the)', pl: 'Rodzajnik (a/an/the)' },
  preposition:   { en: 'Preposition',     pl: 'Przyimek'             },
  'word-choice': { en: 'Word choice',     pl: 'Wybór słowa'          },
  plural:        { en: 'Plural form',     pl: 'Liczba mnoga'         },
  spelling:      { en: 'Spelling',        pl: 'Pisownia'             },
  'missing-word':{ en: 'Missing word',    pl: 'Brakujące słowo'      },
  'no-error':    { en: 'No error',        pl: 'Bez błędu'            },
  other:         { en: 'Mistake',         pl: 'Błąd'                 },
};

export interface SCItem {
  id: string;
  sentence_with_error: string;
  error_span: [number, number];   // [start, endExclusive]
  correction: string;
  acceptedAnswers?: string[];
  hint?: string;
  hint_pl: string;
  /** Kelly Tier-2 audit: category of error to hunt for (chip above sentence). */
  errorType?: SCErrorType;
  exerciseId?: string;
}

export interface ShellSentenceCorrectionPuzzle {
  items: SCItem[];
}

export interface SentenceCorrectionShellProps {
  time?: TimeOfDay;
  state?: SCForcedState;
  puzzle?: ShellSentenceCorrectionPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3-SentenceCorrection Wave-2 (Ricky 2026-05-02): fires once when every
   * sentence in the puzzle has been seen (filed or skipped). The host uses
   * this to mount <PracticeReview> with per-sentence cards showing the
   * original sentence + the wrong word the student tapped (or "no errors")
   * + the correct fix + the inferred error type.
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
    puzzle: ShellSentenceCorrectionPuzzle;
    /** Item ids the student skipped — review marks them with a SKIPPED chip. */
    skippedItemIds: string[];
  }) => void;
}

// ─── Demo deck ────────────────────────────────────────────────────────────
export const SC_PUZZLE: ShellSentenceCorrectionPuzzle = {
  items: [
    {
      id: 'tower-the',
      sentence_with_error: 'tower lights up at night.',
      error_span: [0, 5],
      correction: 'The tower',
      hint: 'A definite article is missing.',
      hint_pl: 'Brakuje rodzajnika "the" przed "tower".',
    },
    {
      id: 'walk-3rd',
      sentence_with_error: 'She walk to school every morning.',
      error_span: [4, 8],
      correction: 'walks',
      hint: 'Third-person singular needs -s.',
      hint_pl: 'Trzecia osoba l. poj. wymaga końcówki -s.',
    },
    {
      id: 'book-plural',
      sentence_with_error: 'I bought two book at the market.',
      error_span: [14, 18],
      correction: 'books',
      hint: 'Two of something — plural.',
      hint_pl: 'Dwa egzemplarze — liczba mnoga.',
    },
    {
      id: 'arrive-prep',
      sentence_with_error: 'He arrived on work at nine.',
      error_span: [11, 13],
      correction: 'at',
      hint: 'Wrong preposition with "work".',
      hint_pl: 'Zły przyimek z "work" — używamy "at work".',
    },
    {
      id: 'past-tense',
      sentence_with_error: 'Yesterday I go to the cinema.',
      error_span: [12, 14],
      correction: 'went',
      hint: 'Past time → past tense.',
      hint_pl: 'Wczoraj — czas przeszły.',
    },
    {
      id: 'a-an',
      sentence_with_error: 'She is a honest woman.',
      error_span: [7, 8],
      correction: 'an',
      hint: 'Article before a vowel SOUND.',
      hint_pl: 'Rodzajnik przed dźwiękiem samogłoski.',
    },
  ],
};

const ACCENT = '#FB7185';
const ACCENT_DEEP = '#9B1C2E';

// Kelly Tier-2 audit: sentinel value the shell submits when the student
// taps the "No errors" affordance (correct-as-is sentences).
const NO_ERROR_SENTINEL = '__NO_ERROR__';

// Heuristic — when SCItem.errorType isn't supplied, infer a plausible
// category from the correction shape so the chip still renders something
// useful to the student. The suitability-filter agent will eventually
// populate errorType upstream and make this fall-through obsolete.
function inferErrorType(item: SCItem): SCErrorType {
  if (item.errorType) return item.errorType;
  const corr = (item.correction || '').toLowerCase().trim();
  const orig = (item.sentence_with_error || '').toLowerCase();
  const errSlice = orig.slice(item.error_span[0], item.error_span[1]).trim();
  if (!errSlice) return 'missing-word';
  if (/^(a|an|the)$/.test(corr) || /^(a|an|the)$/.test(errSlice)) return 'article';
  if (/^(in|on|at|to|for|of|with|by|from|about)$/.test(corr) || /^(in|on|at|to|for|of|with|by|from|about)$/.test(errSlice)) return 'preposition';
  if (corr.endsWith('s') && !errSlice.endsWith('s') && corr.length === errSlice.length + 1) return 'plural';
  // Common irregular-past words → tense.
  if (/^(went|ran|saw|did|came|took|gave|got|made|said|knew|thought|found|brought|bought|caught|taught)$/.test(corr)) return 'tense';
  if (/walks|works|goes|does|has|is|was|were/.test(corr)) return 'agreement';
  return 'word-choice';
}


// ─── Review-item renderer ────────────────────────────────────────────────
// renderSentenceCorrectionReviewItem — per-item locked render for
// PracticeReview's `renderItem` callback. Replays the original sentence with
// the wrong span struck-through, prints the canonical correction, the
// inferred error type, and the student's actual pick (which word they tapped
// + their attempted correction, or "No errors" when they used that affordance,
// or "SKIPPED" when applicable).
export interface SCReviewRecord {
  item: SCItem;
  /** Encoded as `[s,e] → text` from submit() / submitNoError(); '__NO_ERROR__'
   *  when the student tapped the No-errors affordance. undefined when they
   *  got it right on the first try (no wrong attempt for this id). */
  studentEncoded?: string;
  isSkipped: boolean;
}
export function renderSentenceCorrectionReviewItem(rec: SCReviewRecord): React.ReactNode {
  const { item, studentEncoded, isSkipped } = rec;
  const errType = inferErrorType(item);
  const errLabel = SC_ERROR_TYPE_LABEL[errType];
  const usedNoError = studentEncoded === NO_ERROR_SENTINEL;
  // Decode `[s,e] → text` from the submit() sentinel, when present.
  let stuSpan: [number, number] | null = null;
  let stuText: string | undefined;
  if (studentEncoded && !usedNoError) {
    const m = /^\[(\d+),(\d+)\]\s*→\s*(.*)$/s.exec(studentEncoded);
    if (m) {
      stuSpan = [Number(m[1]), Number(m[2])];
      stuText = m[3];
    }
  }
  const wasWrong = isSkipped || studentEncoded !== undefined;
  const orig = item.sentence_with_error;
  const before = orig.slice(0, item.error_span[0]);
  const errPiece = orig.slice(item.error_span[0], item.error_span[1]);
  const after = orig.slice(item.error_span[1]);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: 'linear-gradient(180deg, rgba(251,113,133,0.05), rgba(20,16,42,0.55))',
      border: `1px solid ${wasWrong ? '#FB7185' : '#34D399'}33`,
      borderRadius: 8,
      fontFamily: '"Courier New", IBM Plex Mono, monospace',
    }}>
      {/* Error-type chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          padding: '3px 10px', borderRadius: 999,
          background: 'rgba(251,113,133,0.18)', border: '1px dashed rgba(251,113,133,0.55)',
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.16em',
          color: '#FB7185',
        }}>
          LOOK FOR · {errLabel.en} · {errLabel.pl}
        </span>
        {isSkipped ? (
          <span style={{
            padding: '3px 10px', borderRadius: 999,
            background: 'rgba(245,239,255,0.06)', color: 'rgba(245,239,255,0.55)',
            fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em',
          }}>— SKIPPED · POMINIĘTO</span>
        ) : null}
      </div>
      {/* Original sentence with wrong span struck-through and the canonical fix beside it. */}
      <div style={{ fontSize: 15, color: 'var(--em-text, #EDE6FF)', lineHeight: 1.6 }}>
        <span>{before}</span>
        <span style={{ background: 'rgba(251,113,133,0.18)', color: '#FB7185', textDecoration: 'line-through wavy', textDecorationColor: '#FB7185', padding: '0 4px', borderRadius: 3 }}>
          {errPiece || '∅'}
        </span>
        <span style={{ color: '#34D399', padding: '0 4px', fontWeight: 700 }}>
          → {item.correction}
        </span>
        <span>{after}</span>
      </div>
      {/* Student's pick (when they tried something) */}
      {!isSkipped && studentEncoded ? (
        usedNoError ? (
          <div style={{ fontFamily: 'var(--em-mono)', fontSize: 11, color: '#FB7185', letterSpacing: '0.04em' }}>
            ✗ You said: <strong>NO ERRORS · BEZ BŁĘDÓW</strong>
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--em-mono)', fontSize: 11, color: '#FB7185', letterSpacing: '0.04em' }}>
            ✗ You tapped:{' '}
            <strong>"{stuSpan ? orig.slice(stuSpan[0], stuSpan[1]) : '?'}"</strong>{' '}
            → typed <strong>"{stuText || '—'}"</strong>
          </div>
        )
      ) : null}
      {item.hint_pl ? (
        <div style={{ fontFamily: 'var(--em-body, serif)', fontSize: 12, color: 'rgba(245,239,255,0.65)', fontStyle: 'italic' }}>
          🇵🇱 {item.hint_pl}
        </div>
      ) : null}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────
export const SentenceCorrectionShell: React.FC<SentenceCorrectionShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const arcade = useWordArcade();
  const activePuzzle: ShellSentenceCorrectionPuzzle =
    puzzle && puzzle.items.length > 0 ? puzzle : SC_PUZZLE;
  const total = activePuzzle.items.length;
  const persisted = useShellProgress('sentencecorrection');

  const [idx, setIdx] = useState(0);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [draft, setDraft] = useState('');
  const [extendSelection, setExtendSelection] = useState(false);
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  const [score, setScore] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const cur = activePuzzle.items[idx % total];
  const completed = idx >= total;
  const resolvedQuestions = Math.min(total, idx + (verdict === 'right' ? 1 : 0));
  // D3-SC Wave-2 (2026-05-02): track skipped item ids so the review can
  // surface SKIPPED chips. wrongAttempts come back from useEndOfShellTip via
  // its onSessionComplete callback (richer than the legacy onWrongAnswer).
  const skippedItemIdsRef = useRef<string[]>([]);
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
        skippedItemIds: [...skippedItemIdsRef.current],
      });
    } : undefined,
  });

  // ─── Tokenise sentence into character-indexed words for click-selection ─
  const tokens = useMemo(() => {
    if (!cur) return [];
    const out: { text: string; start: number; end: number; kind: 'word' | 'space' }[] = [];
    const re = /\S+|\s+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cur.sentence_with_error)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      out.push({ text: m[0], start, end, kind: /\S/.test(m[0]) ? 'word' : 'space' });
    }
    return out;
  }, [cur]);

  useEffect(() => {
    if (forcedState) return;
    persisted.save({
      progress: Math.min(idx, total) / Math.max(1, total),
      completed,
      lastState: completed ? 'complete' : 'active',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, total, forcedState]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'sentencecorrection',
      brief: 'Tap the wrong word, then type the correction below.',
      brief_pl: 'Stuknij błędne słowo, potem wpisz poprawkę poniżej.',
      detail: 'You are at the editor\'s desk. Each line has exactly one mistake — a wrong tense, a wrong preposition, a misagreement. Tap the offending word to mark it, type the corrected version into the box, then submit. Keep the rest of the sentence as it is.',
      detail_pl: 'Jesteś przy biurku redaktora. W każdej linii jest dokładnie jeden błąd — zły czas, zły przyimek, brak zgody. Stuknij błędne słowo, aby je zaznaczyć, wpisz poprawioną wersję w pole i zatwierdź. Nie zmieniaj reszty zdania.',
      fullInstructions: SENTENCECORRECTION_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') { setIdx(0); setSelection(null); setDraft(''); setVerdict(null); setScore(0); }
    if (forcedState === 'active') { setIdx(0); setSelection([0, 5]); setDraft(''); setVerdict(null); }
    if (forcedState === 'correct') { setIdx(0); setSelection([0, 5]); setDraft('The tower'); setVerdict('right'); }
    if (forcedState === 'wrong') { setIdx(0); setSelection([0, 5]); setDraft('A tower'); setVerdict('wrong'); }
    if (forcedState === 'complete') { setIdx(total); setScore(total); }
  }, [forcedState, total]);

  // Check overlap between selection and the actual error span.
  const selectionMatches = (sel: [number, number] | null): boolean => {
    if (!sel || !cur) return false;
    const [s, e] = sel;
    const [es, ee] = cur.error_span;
    if (es===ee) return s===e && insertionPointMatches(cur.sentence_with_error,es,s);
    // Accept any overlap that covers at least the error span centre.
    return s <= es && e >= ee;
  };

  const pickToken = (i: number): void => {
    if (forcedState || verdict === 'right') return;
    const t = tokens[i];
    if (!t || t.kind !== 'word') return;
    setSelection(previous => expandErrorSelection(previous,[t.start,t.end],extendSelection));
    setVerdict(null);
    if (!extendSelection || selection) setTimeout(() => inputRef.current?.focus(), 60);
  };

  // Kelly Tier-2 audit (2026-05-02): one-tap "No errors / Bez błędów" path.
  // Wires through the existing answer-submit pipeline using a sentinel so the
  // host's onWrongAnswer + scoring flow doesn't need a separate code path.
  const submitNoError = (): void => {
    if (forcedState || !cur || verdict === 'right' || completed) return;
    const isNoErrorSentence = cur.errorType === 'no-error';
    setVerdict(isNoErrorSentence ? 'right' : 'wrong');
    arcade.answer(isNoErrorSentence);
    if (isNoErrorSentence) {
      setScore((s) => s + 1);
      persisted.save({ progress: Math.min(total, idx + 1) / Math.max(1, total), completed: false, lastState: 'active' });
      setAnnouncement('Filed. Correctly identified as error-free.');
    } else {
      setAnnouncement(`Not quite — there is an error. Look for "${cur.correction}".`);
      tip.recordWrong({
        questionId: cur.id,
        studentAnswer: NO_ERROR_SENTINEL,
        correctAnswer: `[${cur.error_span.join(',')}] → ${cur.correction}`,
        explanationPL: cur.hint_pl,
        exerciseId: cur.exerciseId,
      });
    }
  };

  const submit = (): void => {
    if (forcedState || !cur || verdict === 'right' || completed) return;
    if (!selection) {
      setAnnouncement('Tap the wrong word(s) first.');
      return;
    }
    const candidate = normalise(draft);
    if (!candidate) return;
    const accepted = [normalise(cur.correction), ...(cur.acceptedAnswers ?? []).map(normalise)];
    const spanRight = selectionMatches(selection);
    const correct = spanRight && accepted.includes(candidate);
    setVerdict(correct ? 'right' : 'wrong');
    arcade.answer(correct);
    if (correct) {
      setScore((s) => s + 1);
      persisted.save({ progress: Math.min(total, idx + 1) / Math.max(1, total), completed: false, lastState: 'active' });
      setAnnouncement('Filed. Correction stands.');
    } else {
      setAnnouncement(spanRight
        ? `Right span — wrong correction. Reference: "${cur.correction}".`
        : `Wrong span. Re-read the sentence and try again.`);
      tip.recordWrong({
          questionId: cur.id,
          studentAnswer: `[${selection.join(',')}] → ${draft}`,
          correctAnswer: `[${cur.error_span.join(',')}] → ${cur.correction}`,
          explanationPL: cur.hint_pl,
          exerciseId: cur.exerciseId,
        });
    }
  };

  const advance = (): void => {
    if (forcedState || completed || verdict !== 'right') return;
    setIdx((i) => i + 1);
    setSelection(null); setDraft(''); setVerdict(null); setHintRevealed(false);
  };

  const skip = (): void => {
    if (forcedState || completed || !cur) return;
    if (verdict === 'right') { advance(); return; }
    setAnnouncement(`Skipped. The fix was "${cur.correction}".`);
    // D3 Wave-2: log the skip so the review can render the muted SKIPPED chip.
    if (onSessionComplete && !skippedItemIdsRef.current.includes(cur.id)) {
      skippedItemIdsRef.current.push(cur.id);
    }
    setIdx((i) => i + 1);
    setSelection(null); setDraft(''); setVerdict(null); setHintRevealed(false);
  };

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 3 || verdict === 'right') return;
    setHintsUsed((h) => h + 1);
    setHintRevealed(true);
  };

  const reset = (): void => {
    arcade.restart();
    setIdx(0); setSelection(null); setDraft(''); setVerdict(null); setScore(0);
    setHintsUsed(0); setHintRevealed(false);
    tip.reset();
    skippedItemIdsRef.current = [];
  };

  const liveStatus = completed ? `All copy filed. Score ${score}/${total}.` : announcement;

  return (
    <div
      className="em-shell wa-form-game em-shell-sentencecorrection"
      role="application"
      aria-label="Sentence Correction, The Editor's Office"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {liveStatus}
      </div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, zIndex: 5, flexWrap: 'wrap' }}>
        <AmbientAudioPlayer shellSlug="sentencecorrection" />
        <Nameplate
          district="The Editor's Office"
          subtitle="Sentence Correction · Korekta zdania · find the mistake, file the fix"
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M3 19 L8 13 L17 4 L19 6 L10 15 L4 20 Z" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
              <path d="M16 5 L18 7" stroke={ACCENT} strokeWidth="1.5" />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress current={score} seen={Math.min(total, idx + 1)} total={total} accent={ACCENT} />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>


      {/* Main: typewriter sheet + correction line */}
      {!completed && cur && (() => {
        const errType = inferErrorType(cur);
        const errLabel = SC_ERROR_TYPE_LABEL[errType];
        const isMissingWord = errType === 'missing-word';
        const isNoError = errType === 'no-error';
        return (
        <div className="sc-stage" style={{ position: 'absolute', inset: '124px 24px 220px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, zIndex: 4, overflowY: 'auto' }}>
          <WordMission kind="scanner" current={resolvedQuestions} total={total} chain={arcade.chain} reaction={arcade.reaction}/>
          <WordSuspense fallback={<p>Opening the 3D district…</p>}><WordScene3D key={cur.id} tokens={tokens.map((t,index)=>({...t,index})).filter(t=>t.kind==='word')} selection={selection} missing={isMissingWord} onPick={pickToken} onInsert={at=>{if(!forcedState&&verdict!=='right'){setSelection([at,at]);setVerdict(null);inputRef.current?.focus();}}} onSubmit={submit} onNoError={submitNoError} end={cur.sentence_with_error.length} done={verdict==='right'}/></WordSuspense>

          <div className="wa-inline-tools"><button aria-pressed={extendSelection} onClick={()=>setExtendSelection(v=>!v)}>Select phrase {extendSelection?'on':'off'}</button><button onClick={()=>setSelection(null)}>Clear selection</button><span>{extendSelection?'Tap the first and last words in the phrase.':'Tap the word that needs repairing.'}</span></div>
          {/* Kelly Tier-2 audit (2026-05-02): error-type chip — tells the
              student what category of mistake to hunt for, so the shell
              isn't a guessing game. */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px',
            background: `${ACCENT}1c`,
            border: `1px dashed ${ACCENT}88`,
            borderRadius: 999,
            fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.18em',
            color: ACCENT,
          }} aria-label={`Look for: ${errLabel.en}`}>
            <span className="em-eyebrow" style={{ color: ACCENT }}>SZUKAJ · LOOK FOR</span>
            <span style={{ color: 'var(--em-text)', letterSpacing: '0.12em' }}>{errLabel.pl} · {errLabel.en}</span>
          </div>

          {/* Kelly Tier-2 audit: missing-word banner. The "tap wrong word"
              mechanic doesn't fit when the error is a missing element; we
              show a banner + skip affordance so the student isn't stuck. */}
          {isMissingWord && (
            <div role="status" aria-live="polite" style={{
              maxWidth: 640, padding: '10px 14px',
              background: 'rgba(251,191,36,0.12)',
              border: '1px dashed rgba(251,191,36,0.6)',
              borderRadius: 8, fontSize: 13, color: 'var(--em-text)',
              textAlign: 'center',
            }}>
              <span className="em-eyebrow" style={{ color: '#FBBF24', marginRight: 8 }}>BRAK ELEMENTU · MISSING ELEMENT</span>
              Choose a + insertion point, then type the missing word. · Wybierz + i wpisz brakujące słowo.
            </div>
          )}

          {/* Clipboard sheet */}
          <div
            key={`s-${cur.id}`}
            role="region"
            aria-label="Press copy with errors"
            style={{
              maxWidth: 720, width: '100%',
              padding: '40px 36px 28px',
              background: 'linear-gradient(180deg, #FAF6E8 0%, #E9DDB8 100%)',
              color: '#2A1810',
              borderRadius: 4,
              boxShadow: '0 24px 50px -16px rgba(0,0,0,0.6), inset 0 0 60px rgba(120,80,30,0.12)',
              fontFamily: '"Courier New", IBM Plex Mono, monospace',
              fontSize: 17, lineHeight: 1.85,
              animation: 'sc-sheet-in 540ms var(--em-ease) both',
              position: 'relative',
            }}
          >
            {/* Clipboard clip */}
            <div aria-hidden="true" style={{
              position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)',
              width: 80, height: 28,
              background: 'linear-gradient(180deg, #6B6E78, #383B44)',
              borderRadius: '6px 6px 2px 2px',
              boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
            }} />
            <div className="em-eyebrow" style={{ color: '#7A5520', marginBottom: 10, fontSize: 10, letterSpacing: '0.28em' }}>
              WIRE COPY · KORESPONDENCJA · LINE {idx + 1} / {total}
            </div>

            {isMissingWord && <div className="wa-insertion-points" role="group" aria-label="Choose where to insert the missing word">{tokens.filter(t=>t.kind==='word').map((t,i)=><button key={t.start} className={selection?.[0]===t.start&&selection?.[1]===t.start?'is-selected':''} onClick={()=>{setSelection([t.start,t.start]);setVerdict(null);inputRef.current?.focus();}}>+ before {t.text}</button>)}<button onClick={()=>{const end=cur.sentence_with_error.length;setSelection([end,end]);setVerdict(null);inputRef.current?.focus();}}>+ at end</button></div>}
            {/* Tokenised sentence */}
            <div style={{ display: 'inline-block', userSelect: 'none' }}>
              {tokens.map((t, i) => {
                if (t.kind === 'space') return <span key={i}>{t.text}</span>;
                const inSel = selection && t.start >= selection[0] && t.end <= selection[1];
                const isErrSpan = verdict === 'right' && t.start >= cur.error_span[0] && t.end <= cur.error_span[1];
                return (
                  <span
                    key={i}
                    role="button"
                    tabIndex={0}
                    aria-label={`Word "${t.text}". Click to mark as the error.`}
                    onClick={() => pickToken(i)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickToken(i); } }}
                    style={{
                      cursor: 'pointer',
                      padding: '1px 3px',
                      borderRadius: 3,
                      background: inSel ? `${ACCENT}55` : 'transparent',
                      textDecoration: isErrSpan ? 'line-through' : inSel ? 'underline wavy' : 'none',
                      textDecorationColor: ACCENT_DEEP,
                      color: isErrSpan ? '#9B1C2E' : '#2A1810',
                      transition: 'background 180ms',
                    }}
                  >
                    {t.text}
                  </span>
                );
              })}
            </div>

            {/* Pencil margin note when correct */}
            {verdict === 'right' && (
              <div style={{
                marginTop: 12, paddingLeft: 16,
                borderLeft: `3px solid ${ACCENT}`,
                fontFamily: '"Courier New", monospace', fontSize: 15, color: '#1B5A2A',
                animation: 'sc-stamp 480ms var(--em-ease) both',
              }}>
                <span style={{ color: ACCENT_DEEP, marginRight: 8 }}>↳</span>
                {cur.correction}
              </div>
            )}

            {/* "FILED" stamp on correct */}
            {verdict === 'right' && (
              <div aria-hidden="true" style={{
                position: 'absolute', top: 36, right: 28,
                padding: '6px 12px',
                border: `2px solid ${ACCENT_DEEP}`,
                color: ACCENT_DEEP,
                fontFamily: 'var(--em-mono)', fontSize: 14,
                letterSpacing: '0.28em', fontWeight: 700,
                transform: 'rotate(-12deg)',
                animation: 'sc-stamp 480ms var(--em-ease) both',
                opacity: 0.85,
              }}>FILED</div>
            )}
          </div>

          {/* Correction line — input + submit */}
          {verdict !== 'right' && (
            <div style={{
              maxWidth: 640, width: '100%',
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
              padding: '14px 16px',
              background: 'rgba(0,0,0,0.32)',
              border: `1px solid ${ACCENT}55`,
              borderRadius: 12,
              boxShadow: 'inset 0 0 30px rgba(251,113,133,0.08)',
            }}>
              <span className="em-eyebrow" style={{ color: ACCENT, fontSize: 10, letterSpacing: '0.22em' }}>
                CORRECTION ·
              </span>
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); if (verdict) setVerdict(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                placeholder={selection ? 'type the correction…' : 'first tap the wrong word above'}
                aria-label="Type your correction"
                disabled={!!forcedState}
                style={{
                  flex: 1, minWidth: 200,
                  background: 'transparent', border: 'none', outline: 'none',
                  fontFamily: '"Courier New", monospace', fontSize: 16,
                  color: 'var(--em-text)',
                  borderBottom: `1px dashed ${ACCENT}88`,
                  padding: '6px 4px',
                }}
              />
              <button
                className="em-btn em-btn-ghost"
                onClick={submit}
                aria-label="Submit correction"
                style={{ background: `${ACCENT}26`, borderColor: ACCENT }}
              >
                File ↵
              </button>
            </div>
          )}
          {verdict === 'right' && (
            <button
              className="em-btn em-btn-primary"
              onClick={advance}
              style={{ background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})`, color: '#FFF', borderColor: ACCENT }}
            >
              {idx + 1 >= total ? 'Send to print →' : 'Next dispatch →'}
            </button>
          )}

          {/* Kelly Tier-2 audit (2026-05-02): "No errors" tap affordance for
              correct-as-is sentences. Routes through submitNoError which
              reuses the existing answer pipeline (sentinel: NO_ERROR_SENTINEL). */}
          {verdict !== 'right' && !isMissingWord && (
            <button
              className="em-btn em-btn-ghost"
              onClick={submitNoError}
              aria-label={`Mark sentence as having no errors. ${NO_ERROR_SENTINEL}`}
              style={{
                background: 'rgba(52,211,153,0.12)',
                borderColor: 'rgba(52,211,153,0.55)',
                color: '#34D399',
                fontSize: 13, padding: '8px 14px',
              }}
            >
              ✓ {isNoError ? 'Sentence is correct' : 'No errors'} · Bez błędów
            </button>
          )}

          {hintRevealed && verdict !== 'right' && (
            <div role="status" aria-live="polite" style={{
              maxWidth: 560, padding: '10px 14px',
              background: `${ACCENT}1c`, border: `1px dashed ${ACCENT}88`,
              borderRadius: 6, fontSize: 13, color: 'var(--em-text)',
              animation: 'em-tip-fade 220ms var(--em-ease) both',
            }}>
              <span className="em-eyebrow" style={{ color: ACCENT, marginRight: 6 }}>SUB-EDITOR&apos;S NOTE</span>
              {cur.hint ?? `Re-read the sentence carefully — one word is wrong.`}
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
              {announcement}
            </div>
          )}
        </div>
        );
      })()}

      {/* Instructions modal only — HintCard + standalone Bajla removed
          2026-05-03; chat-widget speech bubble carries the brief. */}
      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, zIndex: 5 }}>
        <div className="em-shell-hint" style={{ flex: 1, maxWidth: 560 }}>
        </div>
      </div>

      {completed && !onSessionComplete && (
        // D3 Wave-2 (2026-05-02): when host wires onSessionComplete the
        // <PracticeReview> overlay takes over completion — suppress the
        // in-shell dialog. Kept as a fallback for design canvas + hosts that
        // don't want review.
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Editor's Office complete"
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
            The page is set.
          </div>
          <div className="em-eyebrow">{score} / {total} CORRECTIONS · WYDANIE GOTOWE</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="em-btn em-btn-ghost" onClick={reset}>Try another</button>
            <button
              className="em-btn em-btn-primary"
              onClick={reset}
              style={{ background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})`, color: '#FFF', borderColor: ACCENT }}
            >
              Next district →
            </button>
          </div>
        </div>
      )}
      <Confetti show={completed} />

      <style>{`
        @keyframes sc-sheet-in {
          0%   { opacity: 0; transform: translateY(-12px) rotate(-0.6deg); }
          100% { opacity: 1; transform: translateY(0) rotate(0); }
        }
        @keyframes sc-stamp {
          0%   { opacity: 0; transform: rotate(-12deg) scale(1.4); }
          60%  { opacity: 1; transform: rotate(-12deg) scale(0.95); }
          100% { opacity: 0.85; transform: rotate(-12deg) scale(1); }
        }
         { display: none; }
        @media (min-width: 1280px) {
           {
            display: flex;
            flex-direction: column;
            position: absolute;
            top: 124px;
            right: 24px;
            bottom: 220px;
            width: 280px;
            padding: 18px 18px 16px;
            background: rgba(20, 8, 18, 0.62);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(251, 113, 133, 0.28);
            border-radius: 14px;
            box-shadow: inset 0 0 60px rgba(251, 113, 133, 0.06), 0 18px 40px -16px rgba(0,0,0,0.5);
            z-index: 4;
            color: var(--em-text);
            font-family: var(--em-body);
            overflow-y: auto;
          }
           {
            inset: 124px 326px 220px 24px !important;
          }
           {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;
          }
           {
            display: flex;
            flex-direction: column;
            gap: 1px;
            padding: 8px 10px;
            border-radius: 6px;
            background: rgba(0, 0, 0, 0.32);
            border: 1px solid rgba(255, 255, 255, 0.06);
            transition: all 180ms;
          }
           {
            background: rgba(251, 113, 133, 0.16);
            border-color: rgba(251, 113, 133, 0.6);
            box-shadow: 0 0 14px rgba(251, 113, 133, 0.18);
          }
           {
            font-family: var(--em-display);
            font-size: 13px;
            color: #FB7185;
            letter-spacing: 0.02em;
          }
           {
            font-size: 11px;
            color: rgba(255,255,255,0.55);
            font-style: italic;
          }
           {
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px dashed rgba(255, 255, 255, 0.14);
          }
        }
      `}</style>
    </div>
  );
};

export default SentenceCorrectionShell;
