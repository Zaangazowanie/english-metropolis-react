import { lazy as wordLazy, Suspense as WordSuspense } from 'react';
const WordScene3D = wordLazy(() => import('../shells3d/WordSentenceTransform3D'));
// Sentence Transformation — The Translator's Booth district.
// A two-screen UN interpreter's booth. The left screen shows the source
// sentence; the right screen is dim until the student rewrites it using
// the key word. The headphones LED pulses on focus; the booth's mic glow
// shifts violet → gold when the rewrite matches.
//
// This is a Cambridge "key-word transformation" exercise — keep the meaning,
// keep the key word, change the form.
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

// Translator's Booth · Sentence Transform — full bilingual instruction copy.
const SENTENCETRANSFORM_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A source sentence appears at the top of the booth, with a key word and a maximum word count below.',
      'Rewrite the source sentence so it keeps the same meaning AND uses the key word.',
      'Type your transform into the booth slip; press Enter to commit.',
      'You must use the key word EXACTLY as given — no morphological changes.',
    ],
    pl: [
      'Na górze kabiny pojawia się zdanie źródłowe, a poniżej słowo-klucz i maksymalna liczba słów.',
      'Przekształć zdanie tak, aby zachowało to samo znaczenie I zawierało słowo-klucz.',
      'Wpisz przekształcenie w kartkę kabiny; naciśnij Enter, aby zatwierdzić.',
      'Słowa-klucza musisz użyć DOKŁADNIE jak podano — bez zmian formy.',
    ],
  },
  controls: {
    en: [
      'Source card: the original sentence at the top of the booth.',
      'Key word chip: the word you must include unchanged in your transform.',
      'Word counter: shows how many words you have typed vs the cap (default 6).',
      'Booth slip: the input where you type your transform — Enter commits.',
      'Hint, Skip: same pattern as the other shells.',
    ],
    pl: [
      'Karta źródłowa: oryginalne zdanie na górze kabiny.',
      'Karta słowa-klucza: słowo, które musisz zawrzeć w niezmienionej formie.',
      'Licznik słów: pokazuje, ile słów wpisałeś w stosunku do limitu (domyślnie 6).',
      'Kartka kabiny: pole tekstowe, gdzie wpisujesz przekształcenie — Enter zatwierdza.',
      'Podpowiedź, Pomiń: ten sam wzorzec co w innych ćwiczeniach.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right transform: the slip lights amber, +1 to your tally, the next source card slides in.',
      'Wrong transform: the slip flashes rose, the model answer is shown, and the slip clears for the next sentence.',
      'Skip: counts as wrong; the model answer is shown so you still learn the structure.',
      'Word-cap exceeded: the slip will not commit until you trim — Bajla nudges you.',
    ],
    pl: [
      'Trafne przekształcenie: kartka świeci na bursztynowo, +1 do wyniku, wsuwa się następna karta źródłowa.',
      'Błędne przekształcenie: kartka błyska na różowo, pojawia się wzorcowa odpowiedź, kartka się czyści.',
      'Pomiń: liczy się jako błąd; pojawia się wzorcowa odpowiedź, żebyś poznał strukturę.',
      'Przekroczony limit słów: kartka nie zatwierdzi się, dopóki nie skrócisz — Bajla podpowiada.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. The hint button reveals the first 2-3 words of the model transform so you have a frame to work in. Save them for prompts where you cannot see how the key word should slot in.',
    pl:
      'Masz 3 podpowiedzi na sesję. Przycisk podpowiedzi odkrywa pierwsze 2-3 słowa wzorcowego przekształcenia, żebyś miał ramę. Zachowaj je na zdania, gdzie nie widzisz, jak wstawić słowo-klucz.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each correct transform adds to your session streak. Completing all sentences in the booth unlocks the Translator\'s Booth completion screen and posts your score.',
    pl:
      'Pomiń liczy się jako błąd. Każde trafne przekształcenie zwiększa serię. Ukończenie wszystkich zdań w kabinie odblokowuje ekran zakończenia Kabiny Tłumacza i zapisuje wynik.',
  },
  l1Pattern: {
    en:
      'Polish word order is freer than English SVO — Polish learners often produce English sentences in Polish order ("To my brother gave I the book"). The transform discipline drills strict English SVO with the key word as the anchor.',
    pl:
      'Szyk wyrazów w polskim jest swobodniejszy niż angielski SVO — polscy uczniowie często składają angielskie zdania w polskim szyku („To my brother gave I the book"). Dyscyplina przekształcenia trenuje ścisłe SVO ze słowem-kluczem jako kotwicą.',
  },
};

// ─── Types (per-shell — main session mirrors to adapters.ts later) ────────
export type STForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface STItem {
  id: string;
  original: string;
  key_word: string;
  target_form: string;        // canonical reference rewrite (lowercased compare)
  acceptedAnswers?: string[];
  hint_pl: string;
  hint?: string;
  exerciseId?: string;
}

export interface ShellSentenceTransformPuzzle {
  items: STItem[];
}

export interface SentenceTransformShellProps {
  time?: TimeOfDay;
  state?: STForcedState;
  puzzle?: ShellSentenceTransformPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3-SentenceTransform Wave-2 (Ricky 2026-05-02): fires once when every
   * transformation prompt has been seen (filed or skipped). The host uses
   * this to mount <PracticeReview> with per-prompt cards showing the source
   * sentence + key word + the student's transform vs the reference accepted
   * variants.
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
    puzzle: ShellSentenceTransformPuzzle;
    /** Item ids the student skipped — review marks them with a SKIPPED chip. */
    skippedItemIds: string[];
  }) => void;
}

// ─── Demo deck ────────────────────────────────────────────────────────────
export const ST_PUZZLE: ShellSentenceTransformPuzzle = {
  items: [
    {
      id: 'tall-as',
      original: 'My brother is taller than me.',
      key_word: 'as',
      target_form: 'I am not as tall as my brother.',
      acceptedAnswers: ["i'm not as tall as my brother."],
      hint: 'Rewrite using "as ... as" in the negative.',
      hint_pl: 'Przekształć używając konstrukcji "as ... as" w przeczeniu.',
    },
    {
      id: 'must-should',
      original: 'You must wear a helmet here.',
      key_word: 'should',
      target_form: 'You should wear a helmet here.',
      hint: 'Rewrite using "should" instead of "must".',
      hint_pl: 'Użyj "should" zamiast "must" — to słabsza forma.',
    },
    {
      id: 'might-possible',
      original: 'It might rain tomorrow.',
      key_word: 'possible',
      target_form: 'It is possible that it will rain tomorrow.',
      acceptedAnswers: ['it is possible it will rain tomorrow.'],
      hint: 'Begin with "It is possible that ...".',
      hint_pl: 'Zacznij od "It is possible that ...".',
    },
    {
      id: 'wrote-passive',
      original: 'Shakespeare wrote Hamlet.',
      key_word: 'was',
      target_form: 'Hamlet was written by Shakespeare.',
      hint: 'Rewrite in the passive voice using "was".',
      hint_pl: 'Przekształć w stronę bierną z "was".',
    },
    {
      id: 'so-such',
      original: 'The film was so good that I watched it twice.',
      key_word: 'such',
      target_form: 'It was such a good film that I watched it twice.',
      hint: 'Rewrite using "such a ... that".',
      hint_pl: 'Użyj konstrukcji "such a ... that".',
    },
  ],
};

const ACCENT = '#A78BFA';
const ACCENT_DEEP = '#5C3FB7';
const SUCCESS = '#FBBF24';


function containsKeyword(s: string, key: string): boolean {
  const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(s);
}

// ─── Review-item renderer ────────────────────────────────────────────────
// renderSentenceTransformReviewItem — per-prompt locked render for
// PracticeReview's `renderItem` callback. Shows the source sentence, the key
// word chip, the canonical reference answer, accepted variants when present,
// and the student's transform (with red strikethrough when wrong, green when
// right). SKIPPED prompts surface the reference + a muted SKIPPED tag.
export interface STReviewRecord {
  item: STItem;
  /** The student's typed transform (from the wrong attempt). undefined when
   *  they got it right on the first try. */
  studentTransform?: string;
  isSkipped: boolean;
}
export function renderSentenceTransformReviewItem(rec: STReviewRecord): React.ReactNode {
  const { item, studentTransform, isSkipped } = rec;
  const wasWrong = isSkipped || studentTransform !== undefined;
  const accentRight = '#FBBF24';
  const accentWrong = '#FB7185';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: 'linear-gradient(180deg, rgba(167,139,250,0.05), rgba(20,16,42,0.55))',
      border: `1px solid ${wasWrong ? accentWrong : accentRight}33`,
      borderRadius: 8,
    }}>
      {/* Source + key word strip */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em', color: '#A78BFA' }}>
          EN · ORIGINAL · CHANNEL 1
        </div>
        <div style={{ fontFamily: 'var(--em-display)', fontSize: 15, color: 'var(--em-text, #EDE6FF)', lineHeight: 1.4 }}>
          "{item.original}"
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em', color: '#A78BFA' }}>
          KEY WORD
        </span>
        <span style={{
          padding: '4px 12px', borderRadius: 999,
          background: 'linear-gradient(180deg, rgba(167,139,250,0.18), rgba(92,63,183,0.18))',
          border: '1px solid #A78BFA88',
          fontFamily: 'var(--em-decor)', fontSize: 14, color: 'var(--em-text, #EDE6FF)',
        }}>
          {item.key_word}
        </span>
        {isSkipped ? (
          <span style={{
            padding: '3px 10px', borderRadius: 999,
            background: 'rgba(245,239,255,0.06)', color: 'rgba(245,239,255,0.55)',
            fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em',
          }}>— SKIPPED · POMINIĘTO</span>
        ) : null}
      </div>
      {/* Student's transform (when applicable) */}
      {!isSkipped && studentTransform ? (
        <div style={{
          fontFamily: 'Georgia, serif', fontSize: 14, color: '#FB7185',
          padding: '8px 12px', borderRadius: 6,
          background: 'rgba(251,113,133,0.08)', border: '1px dashed rgba(251,113,133,0.45)',
          textDecoration: 'line-through', textDecorationColor: 'rgba(251,113,133,0.55)',
        }}>
          ✗ Your rewrite: "{studentTransform}"
        </div>
      ) : null}
      {/* Reference */}
      <div style={{
        fontFamily: 'Georgia, serif', fontSize: 14, color: '#FBBF24',
        padding: '8px 12px', borderRadius: 6,
        background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)',
      }}>
        ✓ Reference: "{item.target_form}"
      </div>
      {item.acceptedAnswers && item.acceptedAnswers.length > 0 ? (
        <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.06em', color: 'rgba(245,239,255,0.55)' }}>
          ALSO ACCEPTED · DOPUSZCZALNE: {item.acceptedAnswers.map((a) => `"${a}"`).join(', ')}
        </div>
      ) : null}
      {item.hint_pl ? (
        <div style={{ fontSize: 12, color: 'rgba(245,239,255,0.6)', fontStyle: 'italic' }}>
          🇵🇱 {item.hint_pl}
        </div>
      ) : null}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────
export const SentenceTransformShell: React.FC<SentenceTransformShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const arcade = useWordArcade();
  const activePuzzle: ShellSentenceTransformPuzzle =
    puzzle && puzzle.items.length > 0 ? puzzle : ST_PUZZLE;
  const total = activePuzzle.items.length;
  const persisted = useShellProgress('sentencetransform');

  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  const [score, setScore] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const cur = activePuzzle.items[idx % total];
  const completed = idx >= total;
  const resolvedQuestions = Math.min(total, idx + (verdict === 'right' ? 1 : 0));
  // D3-ST Wave-2 (2026-05-02): skipped item ids surface as muted SKIPPED chips
  // in the review screen. wrongAttempts come back from useEndOfShellTip.
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
      shellKey: 'sentencetransform',
      brief: 'Rewrite the sentence so it keeps the meaning AND uses the key word.',
      brief_pl: 'Przekształć zdanie tak, by miało to samo znaczenie i zawierało słowo-klucz.',
      detail: 'You are in the translator\'s booth. The original sentence appears at the top with a key word locked below it. Type a new sentence that means the same thing AND contains the key word in its given form. The hint bar shows the rough length expected.',
      detail_pl: 'Jesteś w kabinie tłumacza. Oryginalne zdanie pojawia się u góry, a poniżej zablokowane słowo-klucz. Wpisz nowe zdanie, które znaczy to samo I zawiera słowo-klucz w podanej formie. Pasek wskazówki pokazuje przybliżoną długość.',
      fullInstructions: SENTENCETRANSFORM_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') { setIdx(0); setDraft(''); setVerdict(null); setScore(0); }
    if (forcedState === 'active') { setIdx(0); setDraft('I am not as tall'); setVerdict(null); }
    if (forcedState === 'correct') { setIdx(0); setDraft('I am not as tall as my brother.'); setVerdict('right'); }
    if (forcedState === 'wrong')   { setIdx(0); setDraft('Tall as me brother is.'); setVerdict('wrong'); }
    if (forcedState === 'complete'){ setIdx(total); setScore(total); }
  }, [forcedState, total]);

  const submit = (): void => {
    if (forcedState || !cur || verdict === 'right' || completed) return;
    const candidate = normalise(draft);
    if (!candidate) return;
    const accepted = [normalise(cur.target_form), ...(cur.acceptedAnswers ?? []).map(normalise)];
    const usesKeyWord = containsKeyword(draft, cur.key_word);
    const correct = usesKeyWord && accepted.includes(candidate);
    setVerdict(correct ? 'right' : 'wrong');
    arcade.answer(correct);
    if (correct) {
      setScore((s) => s + 1);
      persisted.save({ progress: Math.min(total, idx + 1) / Math.max(1, total), completed: false, lastState: 'active' });
      setAnnouncement('Translation accepted.');
    } else {
      setAnnouncement(usesKeyWord
        ? `Close — but the wording differs. Reference: "${cur.target_form}"`
        : `You must use the key word "${cur.key_word}". Reference: "${cur.target_form}"`);
      tip.recordWrong({
          questionId: cur.id,
          studentAnswer: draft,
          correctAnswer: cur.target_form,
          explanationPL: cur.hint_pl,
          exerciseId: cur.exerciseId,
        });
    }
  };

  const advance = (): void => {
    if (forcedState || completed || verdict !== 'right') return;
    setIdx((i) => i + 1);
    setDraft(''); setVerdict(null); setHintRevealed(false);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const skip = (): void => {
    if (forcedState || completed || !cur) return;
    if (verdict === 'right') { advance(); return; }
    setAnnouncement(`Skipped. Reference: "${cur.target_form}"`);
    // D3 Wave-2: log the skip so the review can render the muted SKIPPED chip.
    if (onSessionComplete && !skippedItemIdsRef.current.includes(cur.id)) {
      skippedItemIdsRef.current.push(cur.id);
    }
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
    setHintsUsed(0); setHintRevealed(false);
    tip.reset();
    skippedItemIdsRef.current = [];
  };

  const liveStatus = completed ? `All translations filed. Score ${score}/${total}.` : announcement;

  return (
    <div
      className="em-shell wa-form-game em-shell-sentencetransform"
      role="application"
      aria-label="Sentence Transformation, The Translator's Booth"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {liveStatus}
      </div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, zIndex: 5, flexWrap: 'wrap' }}>
        <AmbientAudioPlayer shellSlug="sentencetransform" />
        <Nameplate
          district="The Translator's Booth"
          subtitle="Sentence Transformation · Przekształcenie zdania · same meaning, key word"
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M3 11 H8 M14 11 H19 M11 4 V18" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="11" cy="4" r="1.4" fill={ACCENT} />
              <circle cx="11" cy="18" r="1.4" fill={ACCENT} />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress current={score} seen={Math.min(total, idx + 1)} total={total} accent={ACCENT} />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>


      {/* Two-screen booth */}
      {!completed && cur && (
        <div
          className="st-stage"
          style={{
            position: 'absolute', inset: '110px 24px 220px',
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            gap: 18, alignItems: 'center',
            zIndex: 4,
          }}
        >
          <WordMission kind="translation" current={resolvedQuestions} total={total} chain={arcade.chain} reaction={arcade.reaction}/>
          <WordSuspense fallback={<p>Opening the 3D district…</p>}><WordScene3D key={cur.id} keyword={cur.key_word} ready={containsKeyword(draft,cur.key_word)} words={draft.trim()?draft.trim().split(/\s+/).length:0} done={verdict==='right'} onKeyword={()=>{if(!forcedState&&verdict!=='right'){setDraft(v=>v+(v.trim()?' ':'')+cur.key_word);inputRef.current?.focus();}}} onSubmit={submit} onNext={advance}/></WordSuspense>
          <div className="wa-checklist"><span className={containsKeyword(draft,cur.key_word)?'is-ready':''}>Key word: {cur.key_word} {containsKeyword(draft,cur.key_word)?'✓':'○'}</span><span className={draft.trim()?'is-ready':''}>{draft.trim()?draft.trim().split(/\s+/).length:0} words written</span><span className={verdict==='right'?'is-ready':''}>Same meaning {verdict==='right'?'✓':'○'}</span></div>
          {/* Source screen */}
          <div
            key={`src-${cur.id}`}
            role="region"
            aria-label="Source sentence"
            style={{
              padding: '24px 24px 20px',
              background: 'linear-gradient(180deg, rgba(31,18,64,0.85), rgba(20,8,42,0.95))',
              border: `1px solid ${ACCENT}55`,
              borderRadius: 14,
              minHeight: 220,
              boxShadow: `0 18px 40px -16px rgba(0,0,0,0.6), inset 0 0 60px rgba(167,139,250,0.10)`,
              animation: 'st-screen-on 540ms var(--em-ease) both',
              position: 'relative',
            }}
          >
            <div className="em-eyebrow" style={{ color: ACCENT, marginBottom: 10 }}>
              EN · ORIGINAL · CHANNEL 1
            </div>
            <div className="em-decor" style={{ fontSize: 22, lineHeight: 1.35, color: 'var(--em-text)' }}>
              "{cur.original}"
            </div>
            {/* LED row */}
            <div aria-hidden="true" style={{ position: 'absolute', bottom: 14, left: 24, display: 'flex', gap: 6 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: ACCENT,
                  boxShadow: `0 0 6px ${ACCENT}`,
                  animation: `em-pulse ${1.5 + (i % 3) * 0.4}s ${i * 0.12}s ease-in-out infinite`,
                }} />
              ))}
            </div>
          </div>

          {/* Center mic + key word */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 110 }}>
            <div aria-hidden="true" style={{
              width: 38, height: 60,
              background: `linear-gradient(180deg, ${ACCENT_DEEP}, #1c0e3e)`,
              borderRadius: 10,
              boxShadow: `0 0 24px ${verdict === 'right' ? SUCCESS : ACCENT}66, inset 0 -6px 0 rgba(0,0,0,0.4)`,
              border: `1px solid ${verdict === 'right' ? SUCCESS : ACCENT}88`,
              position: 'relative',
              animation: 'st-mic-bob 2.4s ease-in-out infinite',
            }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: 6, right: 6, top: 8 + i * 9, height: 2, background: 'rgba(255,255,255,0.18)', borderRadius: 1 }} />
              ))}
            </div>
            <div style={{ width: 1, height: 18, background: ACCENT, opacity: 0.5 }} />
            <div className="em-eyebrow" style={{ color: ACCENT, fontSize: 9, letterSpacing: '0.22em' }}>KEY WORD</div>
            <div style={{
              padding: '6px 12px', borderRadius: 999,
              background: `linear-gradient(180deg, ${ACCENT}26, ${ACCENT_DEEP}26)`,
              border: `1px solid ${ACCENT}88`,
              fontFamily: 'var(--em-decor)', fontSize: 18, color: 'var(--em-text)',
              boxShadow: `0 0 14px ${ACCENT}44`,
            }}>{cur.key_word}</div>
          </div>

          {/* Target screen */}
          <div
            key={`tgt-${cur.id}`}
            role="region"
            aria-label="Your translation"
            style={{
              padding: '24px 24px 20px',
              background: verdict === 'right'
                ? `linear-gradient(180deg, rgba(251,191,36,0.16), rgba(20,8,42,0.95))`
                : verdict === 'wrong'
                  ? `linear-gradient(180deg, rgba(251,113,133,0.14), rgba(20,8,42,0.95))`
                  : 'linear-gradient(180deg, rgba(31,18,64,0.85), rgba(20,8,42,0.95))',
              border: `1px solid ${verdict === 'right' ? SUCCESS : verdict === 'wrong' ? '#FB7185' : ACCENT}55`,
              borderRadius: 14,
              minHeight: 220,
              boxShadow: verdict === 'right'
                ? `0 0 32px ${SUCCESS}44, inset 0 0 60px ${SUCCESS}1f`
                : `0 18px 40px -16px rgba(0,0,0,0.6), inset 0 0 60px rgba(167,139,250,0.10)`,
              transition: 'all 320ms var(--em-ease)',
              animation: verdict === 'wrong' ? 'em-shake 0.4s var(--em-ease)' : 'st-screen-on 540ms var(--em-ease) both',
              position: 'relative',
            }}
          >
            <div className="em-eyebrow" style={{ color: verdict === 'right' ? SUCCESS : ACCENT, marginBottom: 10 }}>
              EN · YOUR REWRITE · CHANNEL 2
            </div>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); if (verdict) setVerdict(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
              placeholder={`Type the rewrite using "${cur.key_word}" — Cmd/Ctrl + Enter to submit.`}
              aria-label="Type your transformation"
              disabled={!!forcedState || verdict === 'right'}
              style={{
                width: '100%', minHeight: 84,
                background: 'rgba(0,0,0,0.32)',
                border: `1px solid ${verdict === 'right' ? SUCCESS : ACCENT}44`,
                borderRadius: 8,
                padding: '12px 14px',
                fontFamily: 'Georgia, serif',
                fontSize: 17, lineHeight: 1.4,
                color: 'var(--em-text)',
                outline: 'none',
                resize: 'vertical',
                transition: 'border-color 220ms',
              }}
            />
            <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {verdict !== 'right' && (
                <button className="em-btn em-btn-ghost" onClick={submit} aria-label="Test the rewrite">
                  Test rewrite ↵
                </button>
              )}
              {verdict === 'right' && (
                <button
                  className="em-btn em-btn-primary"
                  onClick={advance}
                  style={{ background: `linear-gradient(180deg, ${SUCCESS}, #B8810D)`, color: '#0E0A1A', borderColor: SUCCESS }}
                >
                  {idx + 1 >= total ? 'Close booth →' : 'Next channel →'}
                </button>
              )}
            </div>
            {verdict === 'wrong' && (
              <div role="status" aria-live="polite" style={{
                marginTop: 10, padding: '8px 12px',
                background: 'rgba(251,113,133,0.10)',
                border: '1px dashed rgba(251,113,133,0.55)',
                borderRadius: 6, fontSize: 13, color: '#FFD9DD',
                animation: 'em-tip-fade 220ms var(--em-ease) both',
              }}>
                <span className="em-eyebrow" style={{ color: '#FB7185', marginRight: 6 }}>FEEDBACK</span>
                Reference: "{cur.target_form}"
              </div>
            )}
            {hintRevealed && verdict !== 'right' && (
              <div role="status" aria-live="polite" style={{
                marginTop: 10, padding: '8px 12px',
                background: `${ACCENT}1c`, border: `1px dashed ${ACCENT}88`,
                borderRadius: 6, fontSize: 13, color: 'var(--em-text)',
                animation: 'em-tip-fade 220ms var(--em-ease) both',
              }}>
                <span className="em-eyebrow" style={{ color: ACCENT, marginRight: 6 }}>HINT</span>
                {cur.hint ?? `Use "${cur.key_word}" naturally in the new sentence.`}
                <span style={{ display: 'block', marginTop: 4, fontStyle: 'italic', opacity: 0.85 }}>
                  🇵🇱 {cur.hint_pl}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instructions modal only — HintCard + standalone Bajla removed
          2026-05-03; chat-widget speech bubble carries the brief. */}
      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, zIndex: 5 }}>
        <div className="em-shell-hint" style={{ flex: 1, maxWidth: 560 }}>
        </div>
      </div>

      {/* Completion overlay */}
      {completed && !onSessionComplete && (
        // D3 Wave-2 (2026-05-02): when host wires onSessionComplete the
        // <PracticeReview> overlay takes over completion — suppress the
        // in-shell dialog. Kept as a fallback for design canvas + hosts that
        // don't want review.
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Translator's Booth complete"
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
            The booth signs off.
          </div>
          <div className="em-eyebrow">{score} / {total} CHANNELS · KABINA ZAMKNIĘTA</div>
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
        @keyframes st-screen-on {
          0%   { opacity: 0; filter: brightness(0.4); }
          100% { opacity: 1; filter: brightness(1); }
        }
        @keyframes st-mic-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        @media (max-width: 768px) {
          .em-shell-sentencetransform > div[style*="grid-template-columns: 1fr auto 1fr"] {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto auto auto !important;
            inset: 110px 16px 230px !important;
          }
        }
         { display: none; }
        @media (min-width: 1280px) {
           {
            display: flex;
            flex-direction: column;
            position: absolute;
            top: 110px;
            right: 24px;
            bottom: 220px;
            width: 300px;
            padding: 18px 18px 16px;
            background: rgba(20, 12, 40, 0.62);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(167, 139, 250, 0.32);
            border-radius: 14px;
            box-shadow: inset 0 0 60px rgba(167, 139, 250, 0.06), 0 18px 40px -16px rgba(0,0,0,0.5);
            z-index: 4;
            color: var(--em-text);
            font-family: var(--em-body);
            overflow-y: auto;
          }
           {
            inset: 110px 346px 220px 24px !important;
          }
           {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex: 1;
          }
           {
            display: flex;
            flex-direction: column;
            gap: 3px;
            padding: 10px 12px;
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.32);
            border: 1px solid rgba(167, 139, 250, 0.18);
          }
           {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
          }
           {
            font-family: var(--em-display);
            font-size: 12px;
            color: #F5EFFF;
            letter-spacing: 0.02em;
          }
           {
            color: #A78BFA;
            font-family: var(--em-mono);
            font-weight: 700;
          }
           {
            font-size: 10px;
            color: rgba(255,255,255,0.5);
            font-style: italic;
          }
           {
            font-family: 'Georgia', serif;
            font-size: 11px;
            color: #FBBF24;
            line-height: 1.4;
          }
           {
            font-family: var(--em-mono);
            font-size: 9px;
            letter-spacing: 0.12em;
            color: rgba(255,255,255,0.55);
          }
           {
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px dashed rgba(255, 255, 255, 0.14);
          }
        }
      `}</style>
    </div>
  );
};

export default SentenceTransformShell;
