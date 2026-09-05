import { lazy as wordLazy, Suspense as WordSuspense } from 'react';
const WordScene3D = wordLazy(() => import('../shells3d/WordTypingTest3D'));
import { typingDispatchStats } from './word-arcade-mechanics';
// Typing Test — The Telegraph Office district.
// A brass-key telegraph at dusk. Paper tape spools out of the receiver as the
// student types; correctly typed characters punch holes in the tape, wrong
// keystrokes "jam" the key with a brief shake. Live WPM + accuracy gauges
// glow on a small brass dial; finishing the phrase clicks the operator's
// brass switch.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { WordMission, useWordArcade } from './word-arcade';
import { useShellProgress } from '../lib/convex-stubs';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import React, { useState, useEffect, useRef } from 'react';
import {
  Bajla,
  HintCard,
  Progress,
  Nameplate,
  SkipButton,
  HintButton,
  Confetti,
  Dial,
  useEndOfShellTip,
} from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';

// Telegraph Office · Typing Test — full bilingual instruction copy.
const TYPINGTEST_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A target dispatch (sentence or paragraph) appears on the typewriter tape.',
      'Type the dispatch exactly — every letter, space, and punctuation mark counts.',
      'The brass dials show your WPM (words per minute) and accuracy in real time.',
      'Finishing the dispatch with high accuracy posts a record to your timeline.',
    ],
    pl: [
      'Na taśmie maszyny do pisania pojawia się depesza (zdanie lub akapit).',
      'Wpisz depeszę dokładnie — każda litera, spacja i znak interpunkcyjny się liczy.',
      'Mosiężne wskaźniki pokazują WPM (słowa na minutę) i dokładność na żywo.',
      'Ukończenie depeszy z wysoką dokładnością zapisuje rekord na osi czasu.',
    ],
  },
  controls: {
    en: [
      'Typewriter tape: the target text — the cursor highlights the next character.',
      'Live input: just type — there is no separate input field. Your keystrokes go straight onto the tape.',
      'WPM dial (left): brass needle showing your current typing speed.',
      'Accuracy dial (right): percent of keystrokes that hit the target letter.',
      'Backspace: corrects the most recent error and recovers accuracy.',
    ],
    pl: [
      'Taśma maszyny: tekst docelowy — kursor podświetla następny znak.',
      'Wejście na żywo: po prostu pisz — nie ma osobnego pola. Klawisze trafiają wprost na taśmę.',
      'Wskaźnik WPM (po lewej): mosiężna wskazówka pokazuje aktualną prędkość.',
      'Wskaźnik dokładności (po prawej): procent klawiszy trafionych w docelowy znak.',
      'Backspace: poprawia ostatni błąd i odzyskuje dokładność.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right keystroke: the cursor advances; the tape ticks forward.',
      'Wrong keystroke: the wrong letter shows in red on the tape; accuracy drops; correct it with Backspace.',
      'Skip: gives up the dispatch and moves to the next one — counts as low accuracy.',
      'Finish dispatch with > 90% accuracy: hall applauds; the wire ticker plays a victory chord.',
    ],
    pl: [
      'Trafny klawisz: kursor przesuwa się; taśma tyka do przodu.',
      'Błędny klawisz: błędna litera pojawia się czerwona na taśmie; dokładność spada; popraw Backspace\'em.',
      'Pomiń: rezygnuje z depeszy i przechodzi do następnej — liczy się jako niska dokładność.',
      'Ukończenie depeszy z > 90% dokładności: sala bije brawo; tickery grają akord zwycięstwa.',
    ],
  },
  hintMechanic: {
    en:
      'No reveal hints in TypingTest — the target text is already visible on the tape. The hint button (when present) plays a metronome tick to help you pace your fingers. Save it for long dispatches where rhythm slips.',
    pl:
      'W TypingTest nie ma podpowiedzi odsłaniających — tekst docelowy już jest na taśmie. Przycisk podpowiedzi (jeśli jest) odtwarza tykanie metronomu, żeby pomóc utrzymać tempo. Zachowaj go na długie depesze, gdy tracisz rytm.',
  },
  scoring: {
    en:
      'Skip counts as low accuracy. Each completed dispatch posts WPM + accuracy to your session log. Finishing every dispatch in the office unlocks the Telegraph Office completion screen and saves your records.',
    pl:
      'Pomiń liczy się jako niska dokładność. Każda ukończona depesza zapisuje WPM + dokładność w logu sesji. Ukończenie wszystkich depesz w biurze odblokowuje ekran zakończenia Biura Telegrafu i zapisuje rekordy.',
  },
  l1Pattern: {
    en:
      'The Polish keyboard places special characters (ą, ę, ż) on right-Alt combinations, which trains a different finger rhythm than the English layout. TypingTest builds the English-layout muscle memory: long flowing sequences without diacritics, more thumb space-bar work, fewer Alt jumps.',
    pl:
      'Polska klawiatura umieszcza znaki specjalne (ą, ę, ż) na kombinacjach z prawym Altem, co trenuje inny rytm palców niż układ angielski. TypingTest buduje pamięć mięśniową dla angielskiego: długie płynne sekwencje bez diakrytyków, więcej spacji kciukiem, mniej skoków Alt.',
  },
};

// ─── Types ────────────────────────────────────────────────────────────────
export type TTForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface TTPhrase {
  id: string;
  target_text: string;
  target_wpm: number;
  hint_pl: string;
  exerciseId?: string;
}

export interface ShellTypingTestPuzzle {
  phrases: TTPhrase[];
}

export interface TypingTestShellProps {
  time?: TimeOfDay;
  state?: TTForcedState;
  puzzle?: ShellTypingTestPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3-TypingTest (Ricky wave-3, 2026-05-02): fires once when every dispatch
   * in the puzzle has been seen. Mounts <PracticeReview> at the host. Per
   * item: each phrase becomes one review row showing target + typed (with
   * matching highlights) + WPM + accuracy + time elapsed.
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
    puzzle: ShellTypingTestPuzzle;
    /** Per-phrase metrics (WPM/accuracy/ok), in display order. */
    phraseLog: Array<{ id: string; wpm: number; acc: number; ok: boolean; typed: string }>;
  }) => void;
}

// ─── Demo deck ────────────────────────────────────────────────────────────
export const TT_PUZZLE: ShellTypingTestPuzzle = {
  phrases: [
    {
      id: 'metro',
      target_text: 'Take the metro to the city centre after work.',
      target_wpm: 28,
      hint_pl: 'Pojedź metrem do centrum po pracy.',
    },
    {
      id: 'bridge',
      target_text: 'We crossed the bridge at sunset and watched the river.',
      target_wpm: 26,
      hint_pl: 'Przeszliśmy mostem o zachodzie słońca i patrzyliśmy na rzekę.',
    },
    {
      id: 'avenue',
      target_text: 'A wide avenue lined with linden trees ran to the square.',
      target_wpm: 26,
      hint_pl: 'Szeroka aleja obsadzona lipami biegła do placu.',
    },
    {
      id: 'kiosk',
      target_text: 'She bought a paper from the kiosk on the corner.',
      target_wpm: 28,
      hint_pl: 'Kupiła gazetę w kiosku na rogu.',
    },
    {
      id: 'tower',
      target_text: 'The clock tower rang twelve times at midnight.',
      target_wpm: 28,
      hint_pl: 'Wieża zegarowa wybiła dwanaście razy o północy.',
    },
  ],
};

const ACCENT = '#7DD3FC';
const ACCENT_DEEP = '#1F73A6';




// ─────────────────────────────────────────────────────────────────────────
// renderTypingTestReviewItem — per-phrase locked render for PracticeReview.
// Shows the target dispatch + the student's typed text (per-char highlighted)
// + WPM + accuracy + ok/jammed badge. Phrases never seen render as "skipped".
// ─────────────────────────────────────────────────────────────────────────
const TT_REVIEW_ACCENT = '#7DD3FC';
export function renderTypingTestReviewItem(
  phrase: TTPhrase,
  log: { wpm: number; acc: number; ok: boolean; typed: string } | undefined,
): React.ReactNode {
  const target = phrase.target_text;
  const typed = log?.typed ?? '';
  const ok = !!log?.ok;
  const skipped = log === undefined;
  const wpm = log?.wpm ?? 0;
  const acc = log?.acc ?? 0;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 14px',
      background: ok
        ? 'linear-gradient(180deg, rgba(52,211,153,0.08), rgba(20,16,42,0.55))'
        : skipped
          ? 'linear-gradient(180deg, rgba(245,239,255,0.04), rgba(20,16,42,0.55))'
          : 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))',
      border: `1px solid ${ok ? 'rgba(52,211,153,0.45)' : skipped ? 'rgba(245,239,255,0.18)' : 'rgba(251,113,133,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: ok ? 'rgba(52,211,153,0.18)' : skipped ? 'rgba(245,239,255,0.08)' : 'rgba(251,113,133,0.18)',
          color: ok ? '#34D399' : skipped ? 'rgba(245,239,255,0.5)' : '#FB7185',
        }}>
          {ok ? '✓ SENT · WYSŁANE' : skipped ? '— SKIPPED · POMINIĘTE' : '✗ JAM · ZACIĘTE'}
        </span>
        {!skipped && (
          <>
            <span style={{ fontFamily: 'var(--em-mono)', fontSize: 11, color: TT_REVIEW_ACCENT }}>
              {wpm} WPM
            </span>
            <span style={{ fontFamily: 'var(--em-mono)', fontSize: 11, color: '#34D399' }}>
              {acc}% ACC
            </span>
            <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10, color: 'rgba(245,239,255,0.45)' }}>
              target {phrase.target_wpm} WPM
            </span>
          </>
        )}
      </div>
      <div style={{ fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'rgba(245,239,255,0.5)' }}>
        DEPESZA · TARGET DISPATCH
      </div>
      <div style={{
        fontFamily: '"Courier New", IBM Plex Mono, monospace',
        fontSize: 13, lineHeight: 1.5,
        background: 'rgba(250,247,232,0.92)', color: '#2A1810',
        padding: '8px 12px', borderRadius: 4,
      }}>{target}</div>
      {!skipped && (
        <>
          <div style={{ fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'rgba(245,239,255,0.5)' }}>
            TWOJA ODPOWIEDŹ · YOUR INPUT
          </div>
          <div style={{
            fontFamily: '"Courier New", IBM Plex Mono, monospace',
            fontSize: 13, lineHeight: 1.5,
            background: 'rgba(20,16,42,0.6)', color: 'var(--em-text, #EDE6FF)',
            padding: '8px 12px', borderRadius: 4,
            border: '1px solid rgba(245,239,255,0.08)',
          }}>
            {target.split('').map((ch, i) => {
              const t = typed[i];
              const matches = t === ch;
              const wrong = t !== undefined && t !== ch;
              return (
                <span key={i} style={{
                  color: matches ? '#34D399' : wrong ? '#FB7185' : 'rgba(245,239,255,0.45)',
                  background: matches ? 'rgba(52,211,153,0.12)' : wrong ? 'rgba(251,113,133,0.16)' : 'transparent',
                  padding: '0 1px',
                }}>
                  {t ?? ch}
                </span>
              );
            })}
            {typed.length > target.length && (
              <span style={{ color: '#FB7185', textDecoration: 'line-through' }}>
                {typed.slice(target.length)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────
export const TypingTestShell: React.FC<TypingTestShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const arcade = useWordArcade();
  const activePuzzle: ShellTypingTestPuzzle =
    puzzle && puzzle.phrases.length > 0 ? puzzle : TT_PUZZLE;
  const total = activePuzzle.phrases.length;
  const persisted = useShellProgress('typingtest');

  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [paceWpm, setPaceWpm] = useState(25);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [score, setScore] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  const [shake, setShake] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // Ricky · 2026-05-02 · audit §4 #8 right-rail: per-phrase results for stats.
  // D3 (2026-05-02): also carries id + typed so the review screen can paint
  // per-phrase rows with the actual student keystrokes.
  const [phraseLog, setPhraseLog] = useState<{ id: string; wpm: number; acc: number; ok: boolean; typed: string }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const cur = activePuzzle.phrases[idx % total];
  const completed = idx >= total;
  const resolvedQuestions = Math.min(total, idx + (verdict === 'right' ? 1 : 0));
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
        phraseLog,
      });
    } : undefined,
  });
  const reduceMotion = usePrefersReducedMotion();

  // Tick — drive live WPM display while typing.
  // Kelly Tier-2 (2026-05-02): the 4Hz dial refresh is cosmetic motion.
  // When reduced-motion is set, skip the interval; `now` still advances on
  // every keystroke (via setStartedAt / onChange) so final WPM is accurate.
  useEffect(() => {
    if (reduceMotion) return;
    if (!startedAt || verdict === 'right' || forcedState) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [startedAt, verdict, forcedState, reduceMotion]);

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
      shellKey: 'typingtest',
      brief: 'Type the dispatch on the tape exactly — letter for letter.',
      brief_pl: 'Wpisz depeszę dokładnie tak jak na taśmie — litera po literze.',
      detail: 'You are at the telegraph key. The tape shows the message you must type, character for character. Brass dials track WPM and accuracy in real time. Wrong characters mark red — fix before moving on. Submit when the line is complete.',
      detail_pl: 'Jesteś przy kluczu telegraficznym. Taśma pokazuje wiadomość do wpisania, znak po znaku. Mosiężne wskaźniki śledzą WPM i dokładność na żywo. Błędne znaki świecą na czerwono — popraw przed przejściem dalej. Zatwierdź, gdy linia jest gotowa.',
      fullInstructions: TYPINGTEST_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty')   { setIdx(0); setDraft(''); setVerdict(null); setStartedAt(null); }
    if (forcedState === 'active')  { setIdx(0); setDraft('Take the metro'); setVerdict(null); setStartedAt(Date.now() - 8000); }
    if (forcedState === 'correct') { setIdx(0); setDraft(activePuzzle.phrases[0].target_text); setVerdict('right'); setStartedAt(Date.now() - 12000); }
    if (forcedState === 'wrong')   { setIdx(0); setDraft('Tahe the metr'); setShake(true); }
    if (forcedState === 'complete'){ setIdx(total); setScore(total); }
  }, [forcedState, total, activePuzzle]);

  // ─── Per-keystroke evaluation ──────────────────────────────────────────
  const target = cur?.target_text ?? '';
  const elapsed = startedAt ? now - startedAt : 0;
  const currentStats = typingDispatchStats(draft, target, elapsed);
  const charsCorrect = currentStats.correct;
  const lastDispatch = phraseLog[phraseLog.length - 1];
  // Keep the finished gauges identical to the stored result and announcement.
  // Both live and final stats use the same one-second floor for instant input.
  const finishedDispatch = verdict === 'right' && lastDispatch?.id === cur.id && lastDispatch.typed === draft
    ? lastDispatch : null;
  const accuracy = finishedDispatch?.acc ?? currentStats.accuracy;
  const liveWpm = finishedDispatch?.wpm ?? currentStats.wpm;

  const onChange = (v: string): void => {
    if (forcedState || verdict === 'right') return;
    if (!startedAt && v.length > 0) {
      setStartedAt(Date.now());
      setNow(Date.now());
    }
    setDraft(v);
    setNow(Date.now());
    setVerdict(null);
    // Per-keystroke jam: if the student types a wrong char where correct is
    // expected, briefly shake the input but keep the character so they see
    // the mismatch and can backspace.
    const lastIdx = v.length - 1;
    if (lastIdx >= 0 && v[lastIdx] !== target[lastIdx]) {
      setShake(true);
      setTimeout(() => setShake(false), 220);
    }
  };

  const dispatch = (): void => {
    if (forcedState || verdict === 'right' || completed || draft.length < target.length) return;
    const v = draft;
    {
      // Commit the full dispatch through the physical lever or Enter.
      const ok = v === target;
      setVerdict(ok ? 'right' : 'wrong');
      arcade.answer(ok, 150);
      const {accuracy:finalAcc,wpm:finalWpm} = typingDispatchStats(v,target,Date.now()-(startedAt??Date.now()));
      if (ok) {
        setScore((s) => s + 1);
      persisted.save({ progress: Math.min(total, idx + 1) / Math.max(1, total), completed: false, lastState: 'active' });
        setPhraseLog((log) => [...log, { id: cur?.id ?? `phrase-${idx}`, wpm: finalWpm, acc: finalAcc, ok: true, typed: v }]);
        setAnnouncement(`Sent. ${finalWpm} WPM. ${finalAcc}% accuracy.`);
      } else {
        setPhraseLog((log) => [...log, { id: cur?.id ?? `phrase-${idx}`, wpm: finalWpm, acc: finalAcc, ok: false, typed: v }]);
        setAnnouncement('Telegraph jammed — characters did not match. Backspace and try again.');
        tip.recordWrong({
          questionId: cur?.id ?? `phrase-${idx}`,
          studentAnswer: v,
          correctAnswer: target,
          explanationPL: cur?.hint_pl,
          exerciseId: cur?.exerciseId,
        });
      }
    }
  };

  // Ricky · 2026-05-02 · audit §4 #8 right-rail: derived session aggregates.


  const avgWpm = phraseLog.length ? Math.round(phraseLog.reduce((s, p) => s + p.wpm, 0) / phraseLog.length) : 0;
  const avgAcc = phraseLog.length ? Math.round(phraseLog.reduce((s, p) => s + p.acc, 0) / phraseLog.length) : 0;

  const advance = (): void => {
    if (forcedState || completed || verdict !== 'right') return;
    setIdx((i) => i + 1);
    setDraft(''); setVerdict(null); setStartedAt(null); setHintRevealed(false);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const skip = (): void => {
    if (forcedState || completed) return;
    if (verdict === 'right') { advance(); return; }
    setAnnouncement('Skipped to the next dispatch.');
    setIdx((i) => i + 1);
    setDraft(''); setVerdict(null); setStartedAt(null); setHintRevealed(false);
  };

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 3 || verdict === 'right') return;
    setHintsUsed((h) => h + 1);
    setHintRevealed(true);
  };

  const reset = (): void => {
    arcade.restart();
    setIdx(0); setDraft(''); setVerdict(null); setScore(0); setStartedAt(null);
    setHintsUsed(0); setHintRevealed(false);
    setPhraseLog([]);
    tip.reset();
  };

  const liveStatus = completed
    ? `All dispatches reviewed. Session average ${avgWpm} WPM, ${avgAcc}% accuracy.`
    : announcement;

  return (
    <div
      className="em-shell wa-form-game em-shell-typingtest"
      role="application"
      aria-label="Typing Test, The Telegraph Office"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {liveStatus}
      </div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, zIndex: 5, flexWrap: 'wrap' }}>
        <AmbientAudioPlayer shellSlug="typingtest" />
        <Nameplate
          district="The Telegraph Office"
          subtitle="Typing Test · Test pisania · key the dispatch verbatim"
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="3" y="9" width="16" height="6" rx="1.5" stroke={ACCENT} strokeWidth="1.6" />
              <circle cx="11" cy="12" r="1.6" fill={ACCENT} />
              <line x1="11" y1="9" x2="11" y2="4" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" />
              <line x1="6" y1="18" x2="16" y2="18" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress current={score} seen={Math.min(total, idx + 1)} total={total} accent={ACCENT} />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>


      {/* Main: paper tape + brass desk */}
      {!completed && cur && (
        <div className="tt-stage" style={{ position: 'absolute', inset: '110px 24px 220px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, zIndex: 4 }}>
          <WordMission kind="dispatch" current={resolvedQuestions} total={total} chain={arcade.chain} reaction={arcade.reaction}/>
          <WordSuspense fallback={<p>Opening the 3D district…</p>}><WordScene3D progress={charsCorrect/Math.max(1,target.length)} ghost={elapsed/60000*paceWpm*5/Math.max(1,target.length)} ready={draft.length>=target.length} done={verdict==='right'} onDispatch={dispatch} onBackspace={()=>onChange(draft.slice(0,-1))} onNext={advance}/></WordSuspense>
          <div className="wa-typing-track">
            <header><span>DISPATCH {idx+1} / {total}</span><span>{Math.round(charsCorrect/Math.max(1,target.length)*100)}% delivered</span></header>

            <div className="wa-inline-tools"><span>Pace train</span>{[15,25,40].map(p=><button key={p} aria-pressed={paceWpm===p} onClick={()=>setPaceWpm(p)}>{p} WPM</button>)}<span>No time limit. Accuracy comes first.</span></div>
          </div>

          {/* Paper tape */}
          <div
            key={`t-${cur.id}`}
            role="region"
            aria-label="Telegraph dispatch"
            style={{
              maxWidth: 760, width: '100%',
              padding: '20px 24px',
              background: 'linear-gradient(180deg, #FAF7E8 0%, #E2D3A5 100%)',
              color: '#2A1810',
              borderRadius: 4,
              boxShadow: '0 18px 40px -16px rgba(0,0,0,0.6), inset 0 0 60px rgba(120,80,30,0.16)',
              backgroundImage: `repeating-linear-gradient(0deg, transparent 0 22px, rgba(0,0,0,0.05) 22px 23px), linear-gradient(180deg, #FAF7E8, #E2D3A5)`,
              animation: 'tt-tape-roll 540ms var(--em-ease) both',
              position: 'relative',
            }}
          >
            {/* CD audit cross-cutting #14 (Ricky 2026-05-02): drop redundant
                "DISPATCH {idx+1} / {total}" — header <Progress> is the
                canonical position counter. Target-WPM stays (informative). */}
            <div className="em-eyebrow" style={{ color: '#7A5520', marginBottom: 10, fontSize: 10, letterSpacing: '0.28em' }}>
              TARGET {cur.target_wpm} WPM
            </div>
            {/* Char-by-char overlay */}
            <div style={{ fontFamily: '"Courier New", IBM Plex Mono, monospace', fontSize: 18, lineHeight: 1.6, letterSpacing: '0.02em', color: '#2A1810' }}>
              {target.split('').map((ch, i) => {
                const typed = draft[i];
                const matches = typed === ch;
                const wrong = typed !== undefined && typed !== ch;
                const pending = typed === undefined;
                return (
                  <span
                    key={i}
                    style={{
                      color: matches ? '#1B5A2A' : wrong ? '#9B1C2E' : '#2A1810',
                      background: matches ? 'rgba(52,211,153,0.12)' : wrong ? 'rgba(155,28,46,0.16)' : 'transparent',
                      borderBottom: pending && i === draft.length ? `2px solid ${ACCENT_DEEP}` : 'none',
                      padding: '0 1px',
                      transition: 'all 90ms',
                    }}
                  >
                    {ch}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Telegraph key + dials */}
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* Brass key */}


            {/* WPM dial */}
            <Dial size={80} label="WPM · TEMPO" value={liveWpm} max={Math.max(60, cur.target_wpm + 30)} target={cur.target_wpm} accent={ACCENT} />
            {/* Accuracy dial */}
            <Dial size={80} label="ACC · DOKŁADNOŚĆ" value={accuracy} max={100} target={95} accent="#34D399" />
          </div>

          {/* Input */}
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();dispatch();}}}
            placeholder={startedAt ? '' : 'click here, then type the dispatch above…'}
            aria-label="Type the dispatch verbatim"
            disabled={!!forcedState || verdict === 'right'}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            style={{
              width: '100%', maxWidth: 760, minHeight: 76,
              background: 'rgba(0,0,0,0.35)',
              border: `1px solid ${verdict === 'right' ? '#34D399' : verdict === 'wrong' ? '#FB7185' : ACCENT}55`,
              borderRadius: 12,
              padding: '12px 16px',
              fontFamily: '"Courier New", IBM Plex Mono, monospace',
              fontSize: 17, lineHeight: 1.4,
              color: 'var(--em-text)',
              outline: 'none', resize: 'vertical',
              transition: 'border-color 220ms',
              animation: shake ? 'em-shake 0.22s var(--em-ease)' : 'none',
            }}
          />

          {verdict !== 'right' && <button className="em-btn em-btn-primary" onClick={dispatch} disabled={draft.length<target.length}>Pull dispatch lever ↵</button>}
          {verdict === 'right' && (
            <button
              className="em-btn em-btn-primary"
              onClick={advance}
              style={{ background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})`, color: '#0E0A1A', borderColor: ACCENT }}
            >
              {idx + 1 >= total ? 'Close the wire →' : 'Next dispatch →'}
            </button>
          )}
          {verdict === 'wrong' && (
            <div role="status" aria-live="polite" style={{
              maxWidth: 560, padding: '8px 12px',
              background: 'rgba(251,113,133,0.10)',
              border: '1px dashed rgba(251,113,133,0.55)',
              borderRadius: 6, fontSize: 13, color: '#FFD9DD',
              animation: 'em-tip-fade 220ms var(--em-ease) both',
            }}>
              <span className="em-eyebrow" style={{ color: '#FB7185', marginRight: 6 }}>JAM</span>
              Backspace to fix the mismatched characters and finish the line.
              <button className="em-btn em-btn-ghost" onClick={() => { setDraft(''); setVerdict(null); setStartedAt(null); }} style={{ marginLeft: 10, padding: '2px 10px' }}>↻ Restart</button>
            </div>
          )}
          {hintRevealed && verdict !== 'right' && (
            <div role="status" aria-live="polite" style={{
              maxWidth: 560, padding: '10px 14px',
              background: `${ACCENT}1c`, border: `1px dashed ${ACCENT}88`,
              borderRadius: 6, fontSize: 13, color: 'var(--em-text)',
              animation: 'em-tip-fade 220ms var(--em-ease) both',
            }}>
              <span className="em-eyebrow" style={{ color: ACCENT, marginRight: 6 }}>OPERATOR&apos;S NOTE</span>
              <span style={{ fontStyle: 'italic' }}>🇵🇱 {cur.hint_pl}</span>
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

      {completed && !onSessionComplete && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Telegraph Office complete"
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
            The wire goes silent.
          </div>
          <div className="em-eyebrow">{score} / {total} DISPATCHES · TELEGRAF ZAMKNIĘTY</div>
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
        @keyframes tt-tape-roll {
          0%   { opacity: 0; transform: translateY(-12px); }
          100% { opacity: 1; transform: translateY(0); }
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
            width: 280px;
            padding: 18px 18px 16px;
            background: rgba(15, 18, 36, 0.62);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(125, 211, 252, 0.28);
            border-radius: 14px;
            box-shadow: inset 0 0 60px rgba(125, 211, 252, 0.06), 0 18px 40px -16px rgba(0,0,0,0.5);
            z-index: 4;
            color: var(--em-text);
            font-family: var(--em-body);
            overflow-y: auto;
          }
           {
            inset: 110px 326px 220px 24px !important;
          }
           {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            margin-bottom: 14px;
          }
           {
            display: flex;
            flex-direction: column;
            padding: 10px;
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.32);
            border: 1px solid rgba(255, 255, 255, 0.06);
          }
           {
            font-family: var(--em-decor);
            font-size: 22px;
            line-height: 1;
          }
           {
            font-family: var(--em-mono);
            font-size: 9px;
            letter-spacing: 0.18em;
            color: rgba(255,255,255,0.65);
            margin-top: 4px;
          }
           {
            font-size: 9px;
            color: rgba(255,255,255,0.4);
            font-style: italic;
            margin-top: 2px;
          }
           {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 10px;
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.28);
            border: 1px solid rgba(255, 255, 255, 0.06);
          }
           {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
           {
            display: grid;
            grid-template-columns: 22px 16px 1fr auto;
            align-items: center;
            gap: 6px;
            font-family: var(--em-mono);
            font-size: 10px;
            letter-spacing: 0.06em;
            padding: 4px 6px;
            border-radius: 4px;
            background: rgba(0, 0, 0, 0.32);
          }
           {
            color: rgba(255,255,255,0.4);
          }
           {
            font-weight: 700;
          }
           {
            font-size: 10px;
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

export default TypingTestShell;
