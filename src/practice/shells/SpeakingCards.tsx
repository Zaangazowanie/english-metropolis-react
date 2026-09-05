import { Challenge3D } from './challenge-3d';
import { ChallengeMission, SpeakingMission, useChallengeArcade } from './challenge-arcade';
// Speaking Cards shell — "The Speakeasy" district.
// A brass-plated speakeasy at dusk: velvet curtain, a vintage tube
// microphone on a brass stand, a flickering EXIT sign. Each card prompts
// the student to say something aloud; the mic-record button captures
// audio so the student can play themselves back, then self-rates "I said
// it well" or "Try again". When mic permission is denied or the API is
// unavailable, the shell degrades to a "skip recording / continue" path.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';

import React, { useState, useEffect, useRef } from 'react';
import { Bajla, Progress, Nameplate, SkipButton, HintButton, Confetti } from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components';

// Speakeasy · Speaking Cards — full bilingual instruction copy.
const SPEAKINGCARDS_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A speaking card sits on a red-velvet table with a prompt — e.g. "Use \'resilience\' in a sentence about today."',
      'Read the prompt and the Polish gloss, then say a sentence aloud.',
      'Tap Record to capture yourself; play it back to check it.',
      'Self-rate honestly: "Try again" if it didn\'t feel right, or "I said it well" if you nailed it.',
    ],
    pl: [
      'Na stoliku z czerwonego aksamitu leży karta z poleceniem — np. „Use \'resilience\' in a sentence about today."',
      'Przeczytaj polecenie i polskie tłumaczenie, potem powiedz zdanie na głos.',
      'Naciśnij Record, by się nagrać; odtwórz, by sprawdzić.',
      'Oceń się uczciwie: „Try again", jeśli nie wyszło, albo „I said it well", jeśli się udało.',
    ],
  },
  controls: {
    en: [
      'Speaking card: prompt + PL gloss + suggested target phrases.',
      'Show model phrases toggle: reveals 2–3 example sentences if you need scaffolding.',
      'Record button: starts/stops microphone capture (your browser asks permission once).',
      'Playback bar: hear yourself back before rating.',
      'Try again / I said it well: honest self-rating — there is no fake speech-recognition judging you.',
    ],
    pl: [
      'Karta mówienia: polecenie + polski opis + sugerowane zwroty docelowe.',
      'Przełącznik Show model phrases: pokazuje 2–3 przykładowe zdania, jeśli potrzebujesz wzoru.',
      'Przycisk Record: zaczyna/kończy nagrywanie mikrofonem (przeglądarka raz poprosi o zgodę).',
      'Pasek odtwarzania: posłuchaj się przed oceną.',
      'Try again / I said it well: uczciwa samoocena — żaden fałszywy „rozpoznawacz mowy" Cię nie ocenia.',
    ],
  },
  rightWrongSkip: {
    en: [
      '"I said it well": ✓ +1 to your tally, the next card flips up.',
      '"Try again": no penalty — you re-record the same prompt as many times as you need.',
      'Skip: marks the card as "not done" — moves to the next card; you can come back.',
      'There is no automatic right/wrong — you are the judge of your own speech.',
    ],
    pl: [
      '„I said it well": ✓ +1 do wyniku, odkrywa się następna karta.',
      '„Try again": bez kary — możesz nagrywać to samo polecenie tyle razy, ile potrzebujesz.',
      'Pomiń: oznacza kartę jako „nie ukończona" — przechodzi dalej; możesz wrócić.',
      'Nie ma automatycznej oceny — sam jesteś sędzią swojej wypowiedzi.',
    ],
  },
  hintMechanic: {
    en:
      'You have unlimited "Show model phrases" peeks. Each tap reveals 2–3 example sentences using the target word. Use them when you can\'t think of a sentence at all — but try once on your own first to build production muscles.',
    pl:
      'Masz nieograniczoną liczbę podejrzeń „Show model phrases". Każde stuknięcie pokazuje 2–3 przykładowe zdania z docelowym słowem. Używaj, gdy zupełnie nie możesz wymyślić zdania — ale najpierw spróbuj raz sam, by ćwiczyć produkcję.',
  },
  scoring: {
    en:
      'Skip leaves the card "not done". Each "I said it well" adds to your session streak. Completing every card unlocks the post-shell review where you can re-listen to all your recordings in order.',
    pl:
      'Pomiń zostawia kartę jako „nie ukończona". Każde „I said it well" buduje serię w sesji. Ukończenie wszystkich kart odblokowuje przegląd, w którym możesz odsłuchać wszystkie nagrania po kolei.',
  },
  l1Pattern: {
    en:
      'Production + self-assessment. Polish learners often have strong receptive vocabulary but freeze on production. The "self-rate" mechanic removes the fear of being wrong by an algorithm and trains the meta-skill of noticing your own pronunciation/grammar slips on playback.',
    pl:
      'Produkcja + samoocena. Polscy uczniowie często mają silne słownictwo bierne, ale blokują się przy produkcji. Mechanizm „samooceny" usuwa lęk przed automatycznym ocenianiem i uczy metaumiejętności zauważania własnych wpadek wymowy/gramatyki podczas odsłuchu.',
  },
};

export type SpeakingCardsForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

interface SCCard {
  id: string;
  prompt: string;
  prompt_pl: string;
  target_phrases: string[];
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface SpeakingCardsPuzzle {
  cards: SCCard[];
}

export interface SpeakingCardsShellProps {
  time?: TimeOfDay;
  state?: SpeakingCardsForcedState;
  puzzle?: SpeakingCardsPuzzle;
  /** Called when the student self-rates "Try again" on a card. */
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3 Wave-5 (Ricky 2026-05-02): per-card review payload. Fires once when
   * the speakeasy deck has been worked through (each card self-rated or
   * skipped).
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
    puzzle: SpeakingCardsPuzzle;
    selfRatings: Record<string, 'well' | 'retry' | 'skipped'>;
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// renderSpeakingCardsReviewItem — per-card locked render for PracticeReview.
// Speakeasy scoreboard: card prompt + self-rating chip + reference model phrase.
// ─────────────────────────────────────────────────────────────────────────
const SC_REVIEW_ACCENT = '#FBBF24';
export function renderSpeakingCardsReviewItem(
  card: SCCard,
  number: number,
  rating: 'well' | 'retry' | 'skipped',
): React.ReactNode {
  const ratingMeta = rating === 'well'
    ? { color: '#34D399', label: '✓ I SAID IT WELL · POWIEDZIAŁEM DOBRZE', bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.45)' }
    : rating === 'retry'
      ? { color: '#FB7185', label: '↻ TRY AGAIN · SPRÓBUJ JESZCZE RAZ', bg: 'rgba(251,113,133,0.10)', border: 'rgba(251,113,133,0.45)' }
      : { color: '#F5EBD8', label: '— SKIPPED · POMINIĘTE', bg: 'rgba(245,235,216,0.06)', border: 'rgba(245,235,216,0.25)' };
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: `linear-gradient(180deg, ${ratingMeta.bg}, rgba(20,16,42,0.55))`,
      border: `1px solid ${ratingMeta.border}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${SC_REVIEW_ACCENT}22`, color: SC_REVIEW_ACCENT,
          border: `1px solid ${SC_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          CARD {String(number).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: `${ratingMeta.color}22`, color: ratingMeta.color,
        }}>
          {ratingMeta.label}
        </span>
        <span aria-hidden="true" style={{ marginLeft: 'auto', fontSize: 14, opacity: 0.7 }}>🎙️</span>
      </div>
      <div style={{ fontFamily: 'var(--em-decor)', fontSize: 16, lineHeight: 1.3, color: 'var(--em-text, #EDE6FF)' }}>{card.prompt}</div>
      <div style={{ fontFamily: 'var(--em-body)', fontSize: 12, color: 'var(--em-text-muted)', fontStyle: 'italic' }}>
        🇵🇱 {card.prompt_pl}
      </div>
      {card.target_phrases && card.target_phrases.length > 0 && (
        <div style={{
          padding: '8px 12px', background: 'rgba(245,235,216,0.04)', borderRadius: 4,
          borderLeft: `2px solid ${SC_REVIEW_ACCENT}66`,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em', color: SC_REVIEW_ACCENT, fontWeight: 700 }}>
            MODEL PHRASES · WZÓR
          </div>
          {card.target_phrases.slice(0, 2).map((p, i) => (
            <div key={i} style={{ fontFamily: 'var(--em-body)', fontSize: 13, color: 'var(--em-text, #EDE6FF)' }}>
              "{p}"
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { SCCard as ShellSpeakingCard };

const SC_PUZZLE: SpeakingCardsPuzzle = {
  cards: [
    {
      id: 'sc-demo-1',
      prompt: 'Tell me about your morning today. Use the word "coffee".',
      prompt_pl: 'Opowiedz o swoim dzisiejszym poranku. Użyj słowa "kawa".',
      target_phrases: ['I had a coffee this morning.', 'In the morning I drink coffee.'],
      hint: 'Start with "This morning…" or "I had…".',
      hint_pl: 'Zacznij od "Dziś rano…" lub "Wypiłem…".',
    },
    {
      id: 'sc-demo-2',
      prompt: 'Describe the street where you live.',
      prompt_pl: 'Opisz ulicę, na której mieszkasz.',
      target_phrases: ['I live on a quiet street.', 'My street is busy.'],
      hint: 'Use one adjective: quiet, busy, narrow, wide.',
      hint_pl: 'Użyj jednego przymiotnika: cicha, ruchliwa, wąska, szeroka.',
    },
    {
      id: 'sc-demo-3',
      prompt: 'Ask a friend if they want to cross the bridge.',
      prompt_pl: 'Zapytaj przyjaciela, czy chce przejść przez most.',
      target_phrases: ['Do you want to cross the bridge?', 'Shall we cross the bridge?'],
      hint: 'Try "Do you want to…" or "Shall we…".',
      hint_pl: 'Spróbuj "Czy chcesz…" lub "Czy przejdziemy…".',
    },
    {
      id: 'sc-demo-4',
      prompt: 'Say two sentences about an evening you remember.',
      prompt_pl: 'Powiedz dwa zdania o wieczorze, który pamiętasz.',
      target_phrases: ['It was a quiet evening.', 'I remember an evening last year.'],
      hint: 'One past sentence + one feeling.',
      hint_pl: 'Jedno zdanie w czasie przeszłym + uczucie.',
    },
  ],
};

const ACCENT = '#FBBF24';

type RecordState = 'idle' | 'recording' | 'recorded' | 'denied' | 'unavailable';

export const SpeakingCardsShell: React.FC<SpeakingCardsShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const arcade = useChallengeArcade();
  const activePuzzle = puzzle && puzzle.cards.length > 0 ? puzzle : SC_PUZZLE;
  const persisted = useShellProgress('speakingcards');
  // D3 Wave-5 (Ricky 2026-05-02): per-card self-rating log + wrong attempts.
  const [selfRatings, setSelfRatings] = useState<Record<string, 'well' | 'retry' | 'skipped'>>({});
  const [allWrongAttempts, setAllWrongAttempts] = useState<Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>>([]);
  const [completedFired, setCompletedFired] = useState(false);

  const [idx, setIdx] = useState(0);
  const [recordState, setRecordState] = useState<RecordState>('idle');
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [showTargets, setShowTargets] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [seen, setSeen] = useState(0);
  const [wellSaid, setWellSaid] = useState(0);
  const [cardFinalised, setCardFinalised] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [recordSeconds, setRecordSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);

  const total = activePuzzle.cards.length;
  const cur = activePuzzle.cards[idx];
  const completed = seen >= total && !forcedState;
  useEffect(() => { if (completed && !forcedState) arcade.finish(); }, [completed, forcedState]);

  useEffect(() => {
    if (forcedState) return;
    persisted.save({
      progress: seen / Math.max(total, 1),
      lastState: seen >= total ? 'complete' : 'active',
    });
    if (seen >= total) {
      persisted.save({ progress: 1, completed: true, lastState: 'complete' });
    }
  }, [seen, forcedState, total]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'speakingcards',
      brief: 'Read the card aloud, record yourself, then self-rate honestly.',
      brief_pl: 'Przeczytaj kartę na głos, nagraj siebie, potem oceń uczciwie.',
      detail: 'Each card carries a phrase to say. Read it through silently, then tap Record and say it aloud. Play your recording back and rate yourself: I said it well or Try again. Honest self-assessment is the practice — there is no auto-grader.',
      detail_pl: 'Każda karta zawiera frazę do wypowiedzenia. Przeczytaj po cichu, potem stuknij Record i powiedz na głos. Odtwórz nagranie i sam się oceń: „Powiedziałem dobrze" lub „Spróbuj ponownie". Uczciwa samoocena to istota ćwiczenia — nie ma auto-oceny.',
      fullInstructions: SPEAKINGCARDS_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') { setIdx(0); setRecordState('idle'); setRecordedUrl(null); setSeen(0); setWellSaid(0); }
    if (forcedState === 'active') { setIdx(1); setRecordState('recording'); setRecordedUrl(null); setSeen(1); setWellSaid(1); }
    if (forcedState === 'correct') { setIdx(1); setRecordState('recorded'); setSeen(2); setWellSaid(2); }
    if (forcedState === 'wrong') { setIdx(1); setRecordState('recorded'); setSeen(2); setWellSaid(1); }
    if (forcedState === 'complete') { setIdx(total - 1); setRecordState('recorded'); setSeen(total); setWellSaid(total); }
  }, [forcedState, total]);

  // Cleanup mic stream when shell unmounts.
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
      }
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mic capture — guarded by feature detection so SSR / older browsers
  // gracefully fall through to the "skip recording" path.
  const startRecording = async () => {
    if (forcedState) return;
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setRecordState('unavailable');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setRecordState('recorded');
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };
      recorder.start();
      setRecordState('recording');
      setRecordSeconds(0);
      tickRef.current = window.setInterval(() => {
        setRecordSeconds((s) => {
          const next = s + 1;
          // Auto-stop after 20s to avoid runaway recordings.
          if (next >= 20 && mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            if (tickRef.current !== null) {
              clearInterval(tickRef.current);
              tickRef.current = null;
            }
          }
          return next;
        });
      }, 1000);
    } catch {
      setRecordState('denied');
    }
  };

  const stopRecording = () => {
    if (forcedState) return;
    const r = mediaRecorderRef.current;
    if (r && r.state === 'recording') r.stop();
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  // Self-rate handlers.
  const rateWell = () => {
    if (forcedState || cardFinalised) return;
    arcade.decide(true, cur.id);
    if (!cardFinalised) {
      setSeen((s) => Math.min(s + 1, total));
      setWellSaid((s) => Math.min(s + 1, total));
      setCardFinalised(true);
    }
    // D3 Wave-5: log self-rating.
    setSelfRatings((p) => ({ ...p, [cur.id]: 'well' }));
    setAnnouncement('Marked "said well". Bajla cheers.');
    advance();
  };

  const rateRetry = () => {
    if (forcedState || cardFinalised) return;
    arcade.decide(false, cur.id);
    if (!cardFinalised) {
      setSeen((s) => Math.min(s + 1, total));
      setCardFinalised(true);
    }
    setAnnouncement('Marked for review. We will revisit this one.');
    if (onWrongAnswer && !forcedState) {
      onWrongAnswer({
        questionId: cur.id,
        studentAnswer: '',
        correctAnswer: cur.target_phrases[0] ?? cur.prompt,
        explanationPL: cur.hint_pl,
        exerciseId: cur.exerciseId,
      });
    }
    // D3 Wave-5: log self-rating + accumulate as a wrong attempt for review.
    setSelfRatings((p) => ({ ...p, [cur.id]: 'retry' }));
    if (!forcedState) {
      setAllWrongAttempts((prev) => [...prev, {
        questionId: cur.id,
        studentAnswer: '',
        correctAnswer: cur.target_phrases[0] ?? cur.prompt,
        explanationPL: cur.hint_pl,
        exerciseId: cur.exerciseId,
      }]);
    }
    advance();
  };

  const advance = () => {
    if (idx < total - 1) {
      setIdx((i) => i + 1);
      setRecordState('idle');
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
        setRecordedUrl(null);
      }
      setShowTargets(false);
      setHintShown(false);
      setCardFinalised(false);
      setRecordSeconds(0);
    } else {
      setSeen(total);
    }
  };

  const skip = () => {
    if (forcedState) return;
    if (!cardFinalised) {
      setSeen((s) => Math.min(s + 1, total));
      setCardFinalised(true);
    }
    // D3 Wave-5: log skip as a self-rating so the review can render
    // SKIPPED chips for cards the student bypassed.
    setSelfRatings((p) => ({ ...p, [cur.id]: 'skipped' }));
    advance();
  };

  // D3 Wave-5: fire onSessionComplete once the deck is fully worked through.
  useEffect(() => {
    if (forcedState) return;
    if (completedFired) return;
    if (!onSessionComplete) return;
    if (!completed) return;
    setCompletedFired(true);
    onSessionComplete({
      correctCount: wellSaid,
      totalQuestions: total,
      wrongAttempts: allWrongAttempts,
      puzzle: activePuzzle,
      selfRatings,
    });
  }, [completed, completedFired, onSessionComplete, wellSaid, total, allWrongAttempts, activePuzzle, selfRatings, forcedState]);

  const reset = () => {
    setSelfRatings({}); setAllWrongAttempts([]); setCompletedFired(false);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    arcade.reset();
    setIdx(0); setSeen(0); setWellSaid(0); setRecordState('idle');
    setRecordedUrl(null); setShowTargets(false); setHintsUsed(0);
    setHintShown(false); setCardFinalised(false); setRecordSeconds(0);
  };

  const useHint = () => {
    if (forcedState || hintsUsed >= 3 || hintShown) return;
    setHintShown(true);
    setHintsUsed((h) => h + 1);
  };

  const grad =
    time === 'day'
      ? 'linear-gradient(180deg, #B49AE0 0%, #6E4FB7 100%)'
      : time === 'night'
      ? 'linear-gradient(180deg, #07041A 0%, #1F0E3A 60%, #2A1450 100%)'
      : 'linear-gradient(180deg, #1A0E2E 0%, #3A1A4A 60%, #5A2A2A 100%)';

  return (
    <div
      className="em-shell em-shell-speakingcards challenge-enhanced"
      role="application"
      aria-label="Speaking cards, The Speakeasy"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      <style>{`
        @keyframes em-sc-mic-glow {
          0%, 100% { box-shadow: 0 0 12px #FB7185aa, 0 0 22px #FB718555; transform: scale(1); }
          50%      { box-shadow: 0 0 28px #FB7185, 0 0 48px #FB7185aa; transform: scale(1.06); }
        }
        @keyframes em-sc-curtain {
          from { transform: scaleX(1.02); }
          to   { transform: scaleX(1); }
        }
        @keyframes em-sc-card-flip {
          from { transform: perspective(800px) rotateX(-12deg); opacity: 0; }
          to   { transform: perspective(800px) rotateX(0deg); opacity: 1; }
        }
        @keyframes em-sc-exit-flicker {
          0%, 47%, 49%, 73%, 75%, 100% { opacity: 1; text-shadow: 0 0 12px #FB7185aa; }
          48%  { opacity: 0.4; text-shadow: none; }
          74%  { opacity: 0.6; text-shadow: none; }
        }
      `}</style>

      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: grad }} />

      {/* velvet curtain on left.
          Ricky 2026-05-02 (#15 audit pass): curtains were missing pointerEvents:none
          AND zIndex. The 80px-wide left curtain visually overlapped the top-bar
          padding (which starts at left:28) on the Nameplate side; without
          pointer-events:none the velvet drape was eating taps along the very
          left edge. Same for the right curtain near the Skip/Hint buttons.
          Now: pointerEvents:none + explicit zIndex:0 (functional layout is
          zIndex:3-4, completion overlay 12). */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0, bottom: 0, left: 0,
          width: 80,
          background:
            'repeating-linear-gradient(90deg, #4A1530 0 12px, #6B1F44 12px 24px)',
          opacity: 0.55,
          transformOrigin: 'left center',
          animation: 'em-sc-curtain 8s var(--em-ease) infinite alternate',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      {/* velvet curtain on right */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0, bottom: 0, right: 0,
          width: 80,
          background:
            'repeating-linear-gradient(-90deg, #4A1530 0 12px, #6B1F44 12px 24px)',
          opacity: 0.55,
          transformOrigin: 'right center',
          animation: 'em-sc-curtain 7s var(--em-ease) infinite alternate-reverse',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* EXIT sign.
          Ricky 2026-05-02 (#15 audit pass): was zIndex:5 (above the top-bar
          which is zIndex:4) AND missing pointerEvents:none — its bounding box
          at top:18 right:110 width≈70px sat directly over the Skip/Hint
          buttons in the top-bar's right cluster on viewports under ~1100px,
          eating taps. Demoted to zIndex:1 (above background, below the
          functional top-bar) + pointerEvents:none + hidden under 480px so
          narrow viewports don't try to render it under the wrapped top-bar.
      */}
      <div
        aria-hidden="true"
        className="em-sc-exit-sign"
        style={{
          position: 'absolute',
          top: 18,
          right: 110,
          padding: '4px 12px',
          background: '#1A0F2E',
          color: '#FB7185',
          fontFamily: 'var(--em-mono)',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '0.3em',
          border: '1px solid #FB7185',
          borderRadius: 2,
          animation: 'em-sc-exit-flicker 4s infinite',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        EXIT
      </div>
      <style>{`
        @media (max-width: 480px) {
          .em-sc-exit-sign { display: none; }
        }
      `}</style>

      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }} aria-hidden="true" />

      {/* Top bar */}
      <div className="challenge-enhanced-toolbar"
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
        <AmbientAudioPlayer shellSlug="speakingcards" />
        <Nameplate
          district="The Speakeasy"
          subtitle="Speaking · Mówienie · prompt cards · say it aloud"
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="8" y="3" width="6" height="9" rx="3" stroke={ACCENT} strokeWidth="1.5" />
              <path d="M5 11 V12 A6 6 0 0 0 17 12 V11" stroke={ACCENT} strokeWidth="1.5" />
              <line x1="11" y1="17" x2="11" y2="20" stroke={ACCENT} strokeWidth="1.5" />
              <line x1="8" y1="20" x2="14" y2="20" stroke={ACCENT} strokeWidth="1.5" />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress current={wellSaid} total={total} seen={seen} accent={ACCENT} />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      <div
        className="em-shell-sc-layout"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)',
          gap: 28,
          padding: '8px 110px 24px 110px',
          height: 'calc(100% - 92px)',
          boxSizing: 'border-box',
          zIndex: 3,
          alignItems: 'center',
        }}
      >
        <ChallengeMission title="Take the mic. Make the scene your own." detail="Use the target phrases in a natural answer, then listen back and self-rate. · Mów, odsłuchaj, oceń." current={seen} total={total} />
        <Challenge3D game="SpeakingCards" roundKey={cur.id} prompt={cur.prompt} signal={recordState==='recording'?recordSeconds/20:0}
          items={[
            {id:'mic',label:recordState==='recording'?`Stop recording · ${recordSeconds}s`:'Record my response',state:recordState==='recording'?'selected':'idle'},
            {id:'targets',label:showTargets?'Hide phrase cues':'Reveal phrase cues'},
            {id:'well',label:'I said it well · Self-rating',locked:recordState==='recording'},
            {id:'retry',label:'Keep this for practice · Self-rating',locked:recordState==='recording'}
          ]} locked={completed || !!forcedState}
          onPick={id=>{if(id==='mic'){if(recordState==='recording')stopRecording();else void startRecording();}else if(id==='targets')setShowTargets(v=>!v);else if(id==='well')rateWell();else rateRetry();}}
          status={recordState==='denied'?'Mic denied. Speak aloud and use honest self-rating.':recordState==='unavailable'?'Recording unavailable. Speak aloud and self-rate.':announcement} />

        {/* PROMPT CARD */}
        <div
          key={cur.id}
          style={{
            position: 'relative',
            background: 'linear-gradient(180deg, #F5EBD8 0%, #ECE0C2 100%)',
            color: '#1A0F08',
            borderRadius: 8,
            padding: '32px 28px',
            boxShadow: '0 32px 60px rgba(0,0,0,0.6), inset 0 0 60px rgba(0,0,0,0.04)',
            border: '6px solid #14082A',
            transform: 'rotate(-1deg)',
            animation: 'em-sc-card-flip 540ms var(--em-ease) both',
            minHeight: 280,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {/* corner decorations */}
          <div aria-hidden="true" style={{ position: 'absolute', top: 8, left: 8, color: ACCENT, fontFamily: 'var(--em-decor)', fontSize: 16 }}>♣</div>
          <div aria-hidden="true" style={{ position: 'absolute', bottom: 8, right: 8, color: ACCENT, fontFamily: 'var(--em-decor)', fontSize: 16, transform: 'rotate(180deg)' }}>♣</div>

          <div className="em-eyebrow" style={{ color: '#876543', marginBottom: 8 }}>
            CARD {String(idx + 1).padStart(2, '0')} of {String(total).padStart(2, '0')} · KARTA
          </div>

          <div
            role="heading"
            aria-level={2}
            style={{
              fontFamily: 'var(--em-decor)',
              fontSize: 24,
              lineHeight: 1.35,
              color: '#1A0F08',
              marginBottom: 14,
            }}
          >
            “{cur.prompt}”
          </div>

          <div style={{ fontFamily: 'Georgia, serif', fontSize: 14, fontStyle: 'italic', color: '#876543', marginBottom: 18 }}>
            🇵🇱 {cur.prompt_pl}
          </div>

          {/* show targets toggle */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowTargets((s) => !s)}
              aria-pressed={showTargets}
              aria-label={showTargets ? 'Hide model phrases' : 'Show model phrases'}
              style={{
                padding: '8px 14px',
                background: showTargets ? `${ACCENT}33` : 'transparent',
                color: '#1A0F08',
                border: `1px solid ${ACCENT}aa`,
                borderRadius: 999,
                fontFamily: 'var(--em-mono)',
                fontSize: 11,
                letterSpacing: '0.12em',
                cursor: 'pointer',
                minHeight: 36,
              }}
            >
              {showTargets ? '▾ Hide model · Ukryj' : '▸ Show model phrases · Pokaż wzór'}
            </button>
          </div>

          {showTargets && (
            <div
              role="region"
              aria-label="Model phrases"
              style={{
                marginTop: 12,
                padding: '10px 12px',
                background: `${ACCENT}1c`,
                border: `1px dashed ${ACCENT}88`,
                borderRadius: 6,
                fontFamily: 'Georgia, serif',
                fontSize: 13,
                color: '#3F2510',
                animation: 'em-tip-fade 220ms var(--em-ease) both',
              }}
            >
              <div className="em-eyebrow" style={{ color: '#876543', marginBottom: 4 }}>MODEL · WZÓR</div>
              {cur.target_phrases.map((p, i) => (
                <div key={i} style={{ marginTop: i === 0 ? 0 : 4 }}>• {p}</div>
              ))}
            </div>
          )}

          {hintShown && (
            <div
              role="status"
              style={{
                marginTop: 10,
                padding: '8px 10px',
                background: 'rgba(251,191,36,0.18)',
                border: '1px dashed #FBBF24',
                borderRadius: 6,
                fontFamily: 'var(--em-mono)',
                fontSize: 11,
                color: '#3F2510',
                letterSpacing: '0.04em',
                animation: 'em-tip-fade 220ms var(--em-ease) both',
              }}
            >
              <strong>Hint:</strong> {cur.hint}
              <div style={{ marginTop: 4, color: '#876543' }}>🇵🇱 {cur.hint_pl}</div>
            </div>
          )}
        </div>

        {/* MIC + CONTROLS */}
        <div className="cm-recording-playback"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 0,
          }}
        >
          {/* The microphone */}

          {/* mic controls */}

          {recordState === 'recording' && (
            <>
              <div
                aria-live="polite"
                style={{
                  fontFamily: 'var(--em-mono)',
                  fontSize: 11,
                  color: '#FB7185',
                  letterSpacing: '0.18em',
                }}
              >
                ● REC {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')} / 00:20
              </div>

            </>
          )}

          {recordState === 'recorded' && recordedUrl && (
            <>
              <audio src={recordedUrl} controls aria-label="Your recording" style={{ width: '100%', maxWidth: 280 }} />
              <button
                type="button"
                onClick={() => {
                  if (recordedUrl) URL.revokeObjectURL(recordedUrl);
                  setRecordedUrl(null);
                  setRecordState('idle');
                }}
                aria-label="Discard and re-record"
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  background: 'transparent',
                  border: `1px solid ${ACCENT}88`,
                  color: 'var(--em-text)',
                  fontFamily: 'var(--em-mono)',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  cursor: 'pointer',
                  minHeight: 36,
                }}
              >
                ↻ Re-record · Nagraj ponownie
              </button>
            </>
          )}

          {recordState === 'denied' && (
            <div
              role="alert"
              style={{
                padding: '10px 14px',
                background: 'rgba(251,113,133,0.16)',
                border: '1px dashed #FB7185',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--em-text)',
                fontFamily: 'var(--em-mono)',
                letterSpacing: '0.04em',
                maxWidth: 280,
                textAlign: 'center',
              }}
            >
              Mic permission denied — you can still mark the card by speaking aloud and rating yourself below.
              <div style={{ marginTop: 4, color: 'var(--em-text-muted)' }}>🇵🇱 Brak dostępu do mikrofonu — powiedz na głos i oceń sam(a).</div>
            </div>
          )}

          {recordState === 'unavailable' && (
            <div
              role="status"
              style={{
                padding: '10px 14px',
                background: 'rgba(167,139,250,0.16)',
                border: '1px dashed #A78BFA',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--em-text)',
                fontFamily: 'var(--em-mono)',
                letterSpacing: '0.04em',
                maxWidth: 280,
                textAlign: 'center',
              }}
            >
              Browser doesn't support recording — say the prompt aloud, then rate yourself.
            </div>
          )}

          <SpeakingMission key={cur.id} phrases={cur.target_phrases} recording={recordState === 'recording'} seconds={recordSeconds} />
          {/* Self-rate buttons — always available, even with no mic */}

        </div>
      </div>

      {completed && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Speakeasy complete"
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
            The mic goes quiet.
          </div>
          <div className="em-eyebrow">SET CLOSES · ZAMYKAMY</div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'baseline', marginTop: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div className="em-decor" style={{ fontSize: 38, color: '#34D399' }}>{wellSaid}</div>
              <div className="em-eyebrow" style={{ color: '#34D399' }}>WELL · DOBRZE</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="em-decor" style={{ fontSize: 38, color: '#FB7185' }}>{seen - wellSaid}</div>
              <div className="em-eyebrow" style={{ color: '#FB7185' }}>RETRY · POWTÓRZ</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="em-btn em-btn-ghost" onClick={reset} aria-label="Encore">
              Encore
            </button>
          </div>
        </div>
      )}
      <Confetti show={completed} />
    </div>
  );
};

export default SpeakingCardsShell;
