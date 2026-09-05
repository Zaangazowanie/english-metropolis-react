import { Challenge3D } from './challenge-3d';
import { ChallengeMission, EvidenceScanner, SpeakingMission, useChallengeArcade } from './challenge-arcade';
// Listening Comprehension shell — "The Listening Booth" district.
// A vintage glass-fronted recording cabin: a vinyl spins on the turntable,
// the ON-AIR sign glows when audio plays, and a violet oscilloscope wave
// rolls across the booth window. Plays are limited to maxPlays (default 2)
// to encourage attentive listening; a "Show transcript" toggle is always
// available for accessibility.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
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
} from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components';

// Listening Booth · Listening Comprehension — full bilingual instruction copy.
const LISTENINGCOMP_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A vinyl record sits in the centre of the booth, with an animated waveform overhead and an "ON AIR" eyebrow.',
      'Tap Play to hear the recording — you have a limited number of plays per question (shown as "Plays left: N").',
      'Listen carefully, then answer the multiple-choice question on the right.',
      'Use "Show transcript · Pokaż" if you really need to read the words — but try to listen first.',
    ],
    pl: [
      'Pośrodku kabiny leży płyta winylowa, nad nią animowana fala dźwięku i napis „ON AIR".',
      'Naciśnij Play, by posłuchać nagrania — masz ograniczoną liczbę odtworzeń na pytanie (widoczna jako „Plays left: N").',
      'Słuchaj uważnie, potem odpowiedz na pytanie wielokrotnego wyboru po prawej.',
      'Użyj „Show transcript · Pokaż", jeśli naprawdę musisz zobaczyć tekst — ale najpierw spróbuj posłuchać.',
    ],
  },
  controls: {
    en: [
      'Vinyl + waveform: visual cue that the audio is playing.',
      'Play button + "Plays left" counter: limited replays per question — use them deliberately.',
      'Show transcript toggle: reveals the spoken text if you really need it.',
      'Question card + 4 options: pick one — every answer is in the audio.',
      'Skip + Hint buttons: Skip jumps to next question, Hint dims one wrong option.',
    ],
    pl: [
      'Winyl + fala: sygnał wizualny, że audio gra.',
      'Przycisk Play + licznik „Plays left": ograniczone odtworzenia na pytanie — używaj świadomie.',
      'Przełącznik Show transcript: pokazuje tekst nagrania, jeśli naprawdę potrzebujesz.',
      'Karta pytania + 4 opcje: wybierz jedną — każda odpowiedź jest w nagraniu.',
      'Przyciski Pomiń i Podpowiedź: Pomiń przeskakuje pytanie, Podpowiedź wygasza jedną błędną opcję.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right pick: ✓ option glows green, +1 to your tally, "Next question" appears.',
      'Wrong pick: ✗ option flashes rose, the right option highlights — Bajla offers a transcript line you may have missed.',
      'Skip: counts as wrong — moves to the next question.',
      'You can\'t change your answer after committing — but you can replay the audio (if plays remain) before answering.',
    ],
    pl: [
      'Trafienie: ✓ opcja świeci na zielono, +1 do wyniku, pojawia się „Next question".',
      'Błąd: ✗ opcja mignie na różowo, a poprawna podświetli się — Bajla podpowie linijkę z transkrypcji, którą mogłeś przegapić.',
      'Pomiń: liczy się jako błąd — przejście do następnego pytania.',
      'Po zatwierdzeniu odpowiedzi nie można jej zmienić — ale przed udzieleniem odpowiedzi możesz odtworzyć audio (jeśli zostały odtworzenia).',
    ],
  },
  hintMechanic: {
    en:
      'You have 2 hints per session. Each tap dims one wrong option AND surfaces the relevant transcript line. Save them for fast or noisy passages where two options seem equally plausible.',
    pl:
      'Masz 2 podpowiedzi na sesję. Każde stuknięcie wygasza jedną błędną opcję ORAZ pokazuje pasującą linijkę transkrypcji. Zachowaj je na szybkie lub zaszumione fragmenty, gdzie dwie opcje wydają się równie sensowne.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each correct answer adds to your session streak. Answering every question in the recording unlocks the post-shell review with transcript-anchored explanations of any wrong picks.',
    pl:
      'Pomiń liczy się jako błąd. Każda poprawna odpowiedź buduje serię w sesji. Odpowiedzenie na wszystkie pytania odblokowuje przegląd z wyjaśnieniami zakotwiczonymi w transkrypcji.',
  },
  l1Pattern: {
    en:
      'Listening + transcript-comprehension. Polish learners often hear English connected speech as a single blur (e.g. "wanna" instead of "want to") and miss function words. The limited-replays drill trains active listening rather than passive transcript-reading.',
    pl:
      'Słuchanie + rozumienie transkrypcji. Polscy uczniowie często słyszą angielską mowę ciągłą jako jeden zlepiony dźwięk (np. „wanna" zamiast „want to") i gubią słowa funkcyjne. Ograniczone odtworzenia uczą aktywnego słuchania zamiast pasywnego czytania transkrypcji.',
  },
};

export type ListeningCompForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

interface LCQuestion {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface ListeningCompPuzzle {
  audio_url: string;
  audio_url_alt?: string;
  transcript: string;
  transcript_pl?: string;
  title: string;
  title_pl: string;
  maxPlays: number;
  questions: LCQuestion[];
}

export interface ListeningCompShellProps {
  time?: TimeOfDay;
  state?: ListeningCompForcedState;
  puzzle?: ListeningCompPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3 Wave-5 (Ricky 2026-05-02): per-question review payload. Fires once
   * when the student has worked through every question in the recording.
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
    puzzle: ListeningCompPuzzle;
    studentPicks: Record<string, string>;
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// renderListeningCompReviewItem — per-question locked render for PracticeReview.
// Listening Booth scoreboard: audio replay button + transcript snippet + 4 options.
// ─────────────────────────────────────────────────────────────────────────
const LC_REVIEW_ACCENT = '#A78BFA';
export function renderListeningCompReviewItem(
  q: LCQuestion,
  number: number,
  audioUrl: string | undefined,
  transcriptSnippet: string,
  studentAnswer: string | undefined,
): React.ReactNode {
  const correct = q.options[q.answerIndex];
  const stu = studentAnswer ?? '';
  const isWrong = stu.length > 0 && stu !== correct;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: isWrong
        ? 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(167,139,250,0.10), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(167,139,250,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${LC_REVIEW_ACCENT}22`, color: LC_REVIEW_ACCENT,
          border: `1px solid ${LC_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          Q {String(number).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(167,139,250,0.22)',
          color: isWrong ? '#FB7185' : LC_REVIEW_ACCENT,
        }}>
          {isWrong ? '✗ MISHEARD · BŁĘDNIE' : '✓ HEARD · POPRAWNIE'}
        </span>
        {audioUrl && (
          <a
            href={audioUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginLeft: 'auto', fontFamily: 'var(--em-mono)', fontSize: 10,
              padding: '4px 10px', borderRadius: 999, textDecoration: 'none',
              background: `${LC_REVIEW_ACCENT}22`, color: LC_REVIEW_ACCENT,
              border: `1px solid ${LC_REVIEW_ACCENT}66`, letterSpacing: '0.12em',
            }}
            aria-label={`Replay recording for question ${number}`}
          >▶ REPLAY</a>
        )}
      </div>
      {transcriptSnippet && (
        <div style={{
          fontFamily: 'var(--em-body)', fontSize: 12, fontStyle: 'italic',
          color: 'rgba(245,235,216,0.65)',
          padding: '6px 10px', borderLeft: `2px solid ${LC_REVIEW_ACCENT}66`,
          background: 'rgba(245,235,216,0.04)', borderRadius: 2,
        }}>
          "…{transcriptSnippet}…"
        </div>
      )}
      <div style={{ fontFamily: 'var(--em-decor)', fontSize: 16, lineHeight: 1.3, color: 'var(--em-text, #EDE6FF)' }}>{q.prompt}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {q.options.map((opt, oi) => {
          const isCorrect = oi === q.answerIndex;
          const wasPicked = stu === opt;
          const showCorrect = isCorrect;
          const showWrong = wasPicked && !isCorrect;
          return (
            <div key={oi} style={{
              padding: '8px 12px', borderRadius: 6,
              background: showCorrect
                ? 'rgba(167,139,250,0.20)'
                : showWrong
                  ? 'rgba(251,113,133,0.18)'
                  : 'rgba(245,239,255,0.04)',
              border: `1px solid ${showCorrect ? '#A78BFA88' : showWrong ? '#FB718588' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? LC_REVIEW_ACCENT : showWrong ? '#FB7185' : 'var(--em-text, #EDE6FF)',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontFamily: 'var(--em-mono)', fontSize: 9, color: LC_REVIEW_ACCENT, opacity: 0.7, minWidth: 14 }}>{String.fromCharCode(65 + oi)}</span>
              <span style={{ flex: 1 }}>{opt}</span>
              {showCorrect && <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10 }}>✓ TAK</span>}
              {showWrong && <span style={{ fontFamily: 'var(--em-mono)', fontSize: 10 }}>✗ NIE</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function pickListeningCompTranscriptSnippet(transcript: string, q: LCQuestion): string {
  if (!transcript) return '';
  const correct = q.options[q.answerIndex] ?? '';
  // No lookbehind: iOS Safari < 16.4 SyntaxErrors on `(?<=...)` at parse time.
  const sentences = transcript.replace(/([.!?])\s+/g, '$1\x00').split('\x00');
  if (correct) {
    const word = correct.toLowerCase().split(/\s+/)[0];
    const hit = sentences.find((s) => s.toLowerCase().includes(word));
    if (hit) return hit.trim().slice(0, 220);
  }
  return transcript.slice(0, 140).trim();
}

const LC_PUZZLE: ListeningCompPuzzle = {
  audio_url: '/practice-audio/demo/booth.mp3',
  audio_url_alt: '/practice-audio/demo/booth.ogg',
  transcript:
    'Welcome to the Listening Booth. The morning train arrived at the central station. A traveller crossed the bridge into the city and ordered a coffee at the small café on the corner.',
  transcript_pl:
    'Witamy w Kabinie Słuchania. Poranny pociąg przybył na dworzec centralny. Podróżnik przeszedł przez most do miasta i zamówił kawę w małej kawiarni na rogu.',
  title: 'Booth Recording',
  title_pl: 'Nagranie z kabiny',
  maxPlays: 2,
  questions: [
    {
      id: 'lc-demo-1',
      prompt: 'What time of day did the train arrive?',
      options: ['evening', 'afternoon', 'night', 'morning'],
      answerIndex: 3,
      hint: '"The ___ train arrived at the central station."',
      hint_pl: 'Posłuchaj pierwszego zdania nagrania.',
    },
    {
      id: 'lc-demo-2',
      prompt: 'What did the traveller cross?',
      options: ['a river', 'a bridge', 'a square', 'a tunnel'],
      answerIndex: 1,
      hint: 'Crossed the ___ into the city.',
      hint_pl: 'Co znajduje się nad rzeką?',
    },
    {
      id: 'lc-demo-3',
      prompt: 'What did the traveller order?',
      options: ['tea', 'water', 'coffee', 'juice'],
      answerIndex: 2,
      hint: 'Ordered a ___ at the café.',
      hint_pl: 'Co najczęściej pije się w kawiarni?',
    },
    {
      id: 'lc-demo-4',
      prompt: 'Where was the café?',
      options: ['on the corner', 'in the station', 'on the bridge', 'in the park'],
      answerIndex: 0,
      hint: 'The small café on the ___.',
      hint_pl: 'Gdzie spotykają się dwie ulice?',
    },
  ],
};

const ACCENT = '#A78BFA';
const ACCENT_GLOW = 'rgba(167,139,250,0.55)';

export const ListeningCompShell: React.FC<ListeningCompShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const arcade = useChallengeArcade();
  const activePuzzle = puzzle && puzzle.questions.length > 0 ? puzzle : LC_PUZZLE;
  const persisted = useShellProgress('listeningcomp');
  // D3 Wave-5 (Ricky 2026-05-02): per-question pick log + wrong-attempt log.
  const [studentPicks, setStudentPicks] = useState<Record<string, string>>({});
  const [allWrongAttempts, setAllWrongAttempts] = useState<Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>>([]);
  const [completedFired, setCompletedFired] = useState(false);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showPolish, setShowPolish] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [seen, setSeen] = useState(0);
  const [solved, setSolved] = useState(0);
  const [questionFinalised, setQuestionFinalised] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [audioFailed, setAudioFailed] = useState(false);
  const [playsRemaining, setPlaysRemaining] = useState(activePuzzle.maxPlays ?? 2);
  const [hasListened, setHasListened] = useState(false);
  const [slowPlayback, setSlowPlayback] = useState(false);
  const [audioPosition, setAudioPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const total = activePuzzle.questions.length;
  const cur = activePuzzle.questions[idx];
  const completed = solved >= total || (seen >= total && !forcedState);
  useEffect(() => { if (completed && !forcedState) arcade.finish(); }, [completed, forcedState]);

  // Persist progress.
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
      shellKey: 'listeningcomp',
      brief: 'Tap Play, listen carefully, then answer the questions.',
      brief_pl: 'Naciśnij Play, posłuchaj uważnie, potem odpowiedz na pytania.',
      detail: 'You get a limited number of replays per recording — listen as actively as you can. Every answer is in the audio. If you really need to see the words, use Show transcript (it counts as a replay). Pick the right answer to advance.',
      detail_pl: 'Masz ograniczoną liczbę odtworzeń — słuchaj jak najuważniej. Każda odpowiedź jest w nagraniu. Jeśli naprawdę musisz zobaczyć tekst, użyj Pokaż transkrypt (liczy się jak odtworzenie). Wybierz dobrą odpowiedź, aby przejść dalej.',
      fullInstructions: LISTENINGCOMP_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  // Force-state for canvas previews.
  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') {
      setIdx(0); setPicked(null); setRevealed(false); setSeen(0); setSolved(0);
    }
    if (forcedState === 'active') {
      setIdx(1); setPicked(null); setRevealed(false); setSeen(1); setSolved(1);
    }
    if (forcedState === 'correct') {
      setIdx(1); setPicked(activePuzzle.questions[1].answerIndex); setRevealed(true);
      setSeen(2); setSolved(2);
    }
    if (forcedState === 'wrong') {
      const wrongIdx = (activePuzzle.questions[1].answerIndex + 1) % activePuzzle.questions[1].options.length;
      setIdx(1); setPicked(wrongIdx); setRevealed(true);
      setSeen(2); setSolved(1);
    }
    if (forcedState === 'complete') {
      setIdx(total - 1); setPicked(activePuzzle.questions[total - 1].answerIndex);
      setRevealed(true); setSeen(total); setSolved(total);
    }
  }, [forcedState, activePuzzle, total]);

  // Audio control.
  const playAudio = () => {
    if (forcedState) return;
    if (playsRemaining <= 0) return;
    if (audioFailed) {
      // Surface transcript fallback.
      setShowTranscript(true);
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = slowPlayback ? 0.8 : 1;
    el.currentTime = 0;
    void el.play().then(() => {
      setIsPlaying(true); setHasListened(true);
      setPlaysRemaining((p) => Math.max(0, p - 1));
    }).catch(() => {
      setAudioFailed(true);
      setShowTranscript(true);
    });
  };

  const choose = (optIdx: number) => {
    if (forcedState || revealed) return;
    setPicked(optIdx);
    setRevealed(true);
    const correct = optIdx === cur.answerIndex;
    arcade.decide(correct, cur.id, hasListened && !showTranscript && !audioFailed ? 150 : 100);
    setAnnouncement(
      correct
        ? 'Correct. The recording confirms it.'
        : `Not quite. The recording said "${cur.options[cur.answerIndex]}".`,
    );
    if (!questionFinalised) {
      setSeen((s) => Math.min(s + 1, total));
      if (correct) setSolved((s) => Math.min(s + 1, total));
      setQuestionFinalised(true);
    }
    if (!correct && onWrongAnswer && !forcedState) {
      onWrongAnswer({
        questionId: cur.id,
        studentAnswer: cur.options[optIdx],
        correctAnswer: cur.options[cur.answerIndex],
        explanationPL: cur.hint_pl,
        exerciseId: cur.exerciseId,
      });
    }
    // D3 Wave-5: log per-question pick + accumulate wrong attempts.
    setStudentPicks((p) => ({ ...p, [cur.id]: cur.options[optIdx] }));
    if (!correct && !forcedState) {
      setAllWrongAttempts((prev) => [...prev, {
        questionId: cur.id,
        studentAnswer: cur.options[optIdx],
        correctAnswer: cur.options[cur.answerIndex],
        explanationPL: cur.hint_pl,
        exerciseId: cur.exerciseId,
      }]);
    }
  };

  // D3 Wave-5: fire onSessionComplete once the recording is fully worked through.
  useEffect(() => {
    if (forcedState) return;
    if (completedFired) return;
    if (!onSessionComplete) return;
    if (!completed) return;
    setCompletedFired(true);
    onSessionComplete({
      correctCount: solved,
      totalQuestions: total,
      wrongAttempts: allWrongAttempts,
      puzzle: activePuzzle,
      studentPicks,
    });
  }, [completed, completedFired, onSessionComplete, solved, total, allWrongAttempts, activePuzzle, studentPicks, forcedState]);

  const next = () => {
    if (forcedState) return;
    if (idx < total - 1) {
      setIdx((i) => i + 1);
      setPicked(null);
      setRevealed(false);
      setHintShown(false);
      setQuestionFinalised(false);
    }
  };

  const skip = () => {
    if (forcedState) return;
    if (!questionFinalised) {
      setSeen((s) => Math.min(s + 1, total));
      setQuestionFinalised(true);
    }
    if (idx < total - 1) {
      setIdx((i) => i + 1);
      setPicked(null);
      setRevealed(false);
      setHintShown(false);
      setQuestionFinalised(false);
    } else {
      setSeen(total);
    }
  };

  const reset = () => {
    setStudentPicks({}); setAllWrongAttempts([]); setCompletedFired(false);
    audioRef.current?.pause(); setIsPlaying(false); setAudioPosition(0); setShowTranscript(false); setHasListened(false);
    arcade.reset();
    setIdx(0); setPicked(null); setRevealed(false); setSeen(0); setSolved(0);
    setHintsUsed(0); setHintShown(false); setQuestionFinalised(false);
    setPlaysRemaining(activePuzzle.maxPlays ?? 2);
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
      ? 'linear-gradient(180deg, #06031A 0%, #1F0E3A 100%)'
      : 'linear-gradient(180deg, #2A1450 0%, #4F2A8E 60%, #6A3FB0 100%)';

  return (
    <div
      className="em-shell em-shell-listeningcomp challenge-enhanced"
      role="application"
      aria-label="Listening comprehension, The Listening Booth"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      <style>{`
        @keyframes em-lc-vinyl {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes em-lc-onair {
          0%, 100% { box-shadow: 0 0 12px ${ACCENT}aa, 0 0 22px ${ACCENT}55; opacity: 0.95; }
          50%      { box-shadow: 0 0 26px ${ACCENT}, 0 0 42px ${ACCENT}88; opacity: 1; }
        }
        @keyframes em-lc-wave {
          from { transform: translateX(0); }
          to   { transform: translateX(-200px); }
        }
        @keyframes em-lc-correct-tick {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>

      <div style={{ position: 'absolute', inset: 0, background: grad }} />

      {/* Skyline silhouette */}
      <svg
        viewBox="0 0 1200 800"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <path
          d="M0 800 L0 560 L80 560 L80 480 L160 480 L160 540 L240 540 L240 460 L320 460 L320 520 L420 520 L420 440 L520 440 L520 500 L620 500 L620 420 L720 420 L720 480 L820 480 L820 460 L920 460 L920 520 L1020 520 L1020 480 L1120 480 L1120 540 L1200 540 L1200 800 Z"
          fill="#0E0A1A"
          opacity="0.6"
        />
      </svg>
      {/* Window dots */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none' }} aria-hidden="true">
        {Array.from({ length: 36 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${(i * 13.7) % 100}%`,
              bottom: `${5 + ((i * 17) % 35)}%`,
              width: 2,
              height: 2,
              background: i % 4 === 0 ? '#FBBF24' : '#A78BFA',
              opacity: 0.8,
              animation: i % 6 === 0 ? `em-flicker ${3 + (i % 3)}s infinite` : 'none',
            }}
          />
        ))}
      </div>
      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true" />

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
        <AmbientAudioPlayer shellSlug="listeningcomp" />
        <Nameplate
          district="The Listening Booth"
          subtitle={`Listening · Słuchanie · ${activePuzzle.title}`}
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="8" stroke={ACCENT} strokeWidth="1.5" />
              <circle cx="11" cy="11" r="2.5" stroke={ACCENT} strokeWidth="1.2" />
              <circle cx="11" cy="11" r="0.8" fill={ACCENT} />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress current={solved} total={total} seen={seen} accent={ACCENT} />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      <div
        className="em-shell-lc-layout"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)',
          gap: 24,
          padding: '8px 28px 24px',
          height: 'calc(100% - 92px)',
          boxSizing: 'border-box',
          zIndex: 3,
        }}
      >
        <ChallengeMission title="Catch the signal. Decode the message." detail="Correct answers without the transcript earn 150 base points. Use slower playback whenever you need it." current={solved} total={total}>
          <button type="button" aria-pressed={slowPlayback} disabled={isPlaying} onClick={() => setSlowPlayback(v => !v)}>{slowPlayback ? '0.8× · Slower playback' : '1× · Normal playback'}</button>
        </ChallengeMission>
        {/* BOOTH — vinyl + on-air + waveform */}
        <div
          className="em-card"
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              'linear-gradient(180deg, #1B0E36 0%, #2D1556 100%)',
            border: `1px solid ${ACCENT}44`,
            borderRadius: 18,
            padding: 24,
            gap: 18,
            boxShadow: `inset 0 0 80px ${ACCENT}22, 0 24px 40px rgba(0,0,0,0.55)`,
            animation: 'em-rise 540ms var(--em-ease) both',
            overflow: 'hidden',
          }}
        >
          {/* ON AIR sign */}
          <div
            role="status"
            aria-label={isPlaying ? 'Now playing' : 'Idle'}
            style={{
              position: 'absolute',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '6px 18px',
              borderRadius: 4,
              background: isPlaying ? ACCENT : `${ACCENT}33`,
              color: isPlaying ? '#1A0F2E' : ACCENT,
              fontFamily: 'var(--em-mono)',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '0.3em',
              border: `2px solid ${ACCENT}`,
              animation: isPlaying ? 'em-lc-onair 1.6s var(--em-ease) infinite' : 'none',
            }}
          >
            ON AIR
          </div>

          {/* Vinyl */}
          <div
            aria-hidden="true"
            style={{
              position: 'relative',
              width: 220,
              height: 220,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #2C1A4E 0%, #08041A 70%)',
              border: '4px solid #14082A',
              boxShadow: '0 12px 32px rgba(0,0,0,0.6), inset 0 0 30px rgba(0,0,0,0.5)',
              animation: isPlaying ? 'em-lc-vinyl 4s linear infinite' : 'none',
              marginTop: 28,
            }}
          >
            {/* grooves */}
            {[0.85, 0.7, 0.55, 0.4].map((s, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  inset: '50%',
                  width: 220 * s,
                  height: 220 * s,
                  marginLeft: -(220 * s) / 2,
                  marginTop: -(220 * s) / 2,
                  borderRadius: '50%',
                  border: `1px solid ${ACCENT}22`,
                }}
              />
            ))}
            {/* center label */}
            <div
              style={{
                position: 'absolute',
                inset: '50%',
                width: 70,
                height: 70,
                marginLeft: -35,
                marginTop: -35,
                borderRadius: '50%',
                background: ACCENT,
                color: '#1A0F2E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--em-mono)',
                fontSize: 9,
                letterSpacing: '0.18em',
                textAlign: 'center',
                boxShadow: 'inset 0 -4px 8px rgba(0,0,0,0.3)',
              }}
            >
              EM<br />BOOTH
            </div>
            {/* spindle */}
            <div
              style={{
                position: 'absolute',
                inset: '50%',
                width: 6,
                height: 6,
                marginLeft: -3,
                marginTop: -3,
                borderRadius: '50%',
                background: '#08041A',
              }}
            />
          </div>

          {/* Oscilloscope wave */}
          <div
            aria-hidden="true"
            style={{
              width: '100%',
              maxWidth: 380,
              height: 56,
              background: 'rgba(0,0,0,0.4)',
              border: `1px solid ${ACCENT}33`,
              borderRadius: 6,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <svg
              viewBox="0 0 800 56"
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                width: 800,
                height: 56,
                animation: isPlaying ? 'em-lc-wave 3s linear infinite' : 'none',
              }}
            >
              <path
                d="M 0 28 Q 20 8 40 28 T 80 28 T 120 28 T 160 28 T 200 28 T 240 28 T 280 28 T 320 28 T 360 28 T 400 28 T 440 28 T 480 28 T 520 28 T 560 28 T 600 28 T 640 28 T 680 28 T 720 28 T 760 28 T 800 28"
                fill="none"
                stroke={ACCENT}
                strokeWidth="1.5"
                opacity="0.85"
              />
              <path
                d="M 0 28 Q 30 48 60 28 T 120 28 T 180 28 T 240 28 T 300 28 T 360 28 T 420 28 T 480 28 T 540 28 T 600 28 T 660 28 T 720 28 T 800 28"
                fill="none"
                stroke={ACCENT}
                strokeWidth="1"
                opacity="0.45"
              />
            </svg>
          </div>

          <div className={`challenge-wave ${isPlaying ? 'is-playing' : ''}`} aria-hidden="true">{Array.from({length:32},(_,i)=><i key={i} style={{height:`${14+i*19%36}px`,animationDelay:`${i*-.08}s`,background:i/32 < audioPosition ? '#f1d68a' : '#869acd'}} />)}</div>
          {/* Audio element + play/transcript controls */}
          <audio
            ref={audioRef}
            onTimeUpdate={e => setAudioPosition(Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0 ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
            preload="none"
            onEnded={() => setIsPlaying(false)}
            onError={() => setAudioFailed(true)}
            aria-label="Listening booth recording"
          >
            <source src={activePuzzle.audio_url} type="audio/mpeg" />
            {activePuzzle.audio_url_alt && (
              <source src={activePuzzle.audio_url_alt} type="audio/ogg" />
            )}
          </audio>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={playAudio}
              disabled={playsRemaining <= 0 || isPlaying || !!forcedState}
              aria-label={`Play recording, ${playsRemaining} plays remaining`}
              style={{
                padding: '12px 22px',
                borderRadius: 999,
                background:
                  playsRemaining > 0 && !isPlaying
                    ? `linear-gradient(180deg, ${ACCENT}, #6F4FBF)`
                    : 'rgba(255,255,255,0.06)',
                color: playsRemaining > 0 ? '#1A0F2E' : 'var(--em-text-muted)',
                border: `1px solid ${ACCENT}66`,
                fontFamily: 'var(--em-display)',
                fontWeight: 700,
                fontSize: 14,
                cursor: playsRemaining > 0 && !isPlaying ? 'pointer' : 'not-allowed',
                opacity: playsRemaining <= 0 ? 0.5 : 1,
                minHeight: 44,
                boxShadow: playsRemaining > 0 ? `0 6px 18px ${ACCENT}66` : 'none',
              }}
            >
              ▶ {isPlaying ? 'Playing…' : playsRemaining > 0 ? `Play (${playsRemaining} left)` : 'No plays left'}
            </button>
            <button
              type="button"
              onClick={() => setShowTranscript((s) => !s)}
              aria-pressed={showTranscript}
              aria-label={showTranscript ? 'Hide transcript' : 'Show transcript'}
              style={{
                padding: '12px 18px',
                borderRadius: 999,
                background: showTranscript ? `${ACCENT}22` : 'transparent',
                color: 'var(--em-text)',
                border: `1px solid ${ACCENT}66`,
                fontFamily: 'var(--em-mono)',
                fontSize: 11,
                letterSpacing: '0.12em',
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              {showTranscript ? '▾ Hide transcript · Ukryj' : '▸ Show transcript · Pokaż'}
            </button>
          </div>

          {audioFailed && (
            <div
              role="alert"
              style={{
                padding: '8px 12px',
                background: 'rgba(251,113,133,0.12)',
                border: '1px dashed #FB7185',
                borderRadius: 6,
                fontSize: 11,
                color: 'var(--em-text-muted)',
                fontFamily: 'var(--em-mono)',
                letterSpacing: '0.04em',
                textAlign: 'center',
              }}
            >
              Audio could not load — transcript shown below for accessibility.
            </div>
          )}

          {showTranscript && (
            <div
              className="em-scroll"
              style={{
                width: '100%',
                maxHeight: 140,
                overflowY: 'auto',
                padding: '12px 14px',
                background: 'rgba(0,0,0,0.35)',
                border: `1px solid ${ACCENT}44`,
                borderRadius: 8,
                fontFamily: 'Georgia, serif',
                fontSize: 13,
                lineHeight: 1.55,
                color: 'var(--em-text)',
                animation: 'em-tip-fade 220ms var(--em-ease) both',
              }}
              aria-label="Transcript"
            >
              <div className="em-eyebrow" style={{ color: ACCENT, marginBottom: 6 }}>
                TRANSCRIPT · TRANSKRYPCJA
              </div>
              {activePuzzle.transcript}
              {activePuzzle.transcript_pl && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${ACCENT}33`, fontStyle: 'italic', color: 'var(--em-text-muted)' }}>
                  🇵🇱 {activePuzzle.transcript_pl}
                </div>
              )}
            </div>
          )}
        </div>

        {/* QUESTIONS */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <div
            className="em-card"
            style={{
              padding: 20,
              background: 'linear-gradient(180deg, #14082A 0%, #08041A 100%)',
              border: `1px solid ${ACCENT}55`,
              borderRadius: 14,
              animation: 'em-rise 620ms var(--em-ease) both',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div className="em-eyebrow" style={{ color: ACCENT }}>
              Question {idx + 1} of {total} · Pytanie
            </div>
            <div
              role="heading"
              aria-level={2}
              style={{
                fontFamily: 'var(--em-decor)',
                fontSize: 22,
                lineHeight: 1.3,
                color: 'var(--em-text)',
              }}
            >
              {cur.prompt}
            </div>

            <Challenge3D game="ListeningComp" items={cur.options.map((label,i)=>({id:String(i),label,state:revealed && i===cur.answerIndex?'right':revealed && i===picked?'wrong':'idle'}))} roundKey={cur.id} locked={revealed || completed || !!forcedState} onPick={id=>choose(Number(id))} signal={isPlaying ? audioPosition : 0} onAction={playAudio} actionLabel={audioFailed ? "Read transcript" : "Tune in · Play recording"} actionDisabled={playsRemaining <= 0 || isPlaying} />
            <div className="cm-legacy-answers" role="radiogroup" aria-label={cur.prompt} style={{ display: 'grid', gap: 8 }}>
              {cur.options.map((opt, oi) => {
                const isPicked = picked === oi;
                const isCorrect = oi === cur.answerIndex;
                const showCorrect = revealed && isCorrect;
                const showWrong = revealed && isPicked && !isCorrect;
                return (
                  <button
                    key={oi}
                    type="button"
                    role="radio"
                    aria-checked={isPicked}
                    onClick={() => choose(oi)}
                    disabled={revealed}
                    aria-label={`Option ${oi + 1}: ${opt}${
                      revealed
                        ? isCorrect
                          ? ', correct answer'
                          : isPicked
                          ? ', your answer (incorrect)'
                          : ''
                        : ''
                    }`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 16px',
                      borderRadius: 10,
                      background: showCorrect
                        ? `${ACCENT}22`
                        : showWrong
                        ? 'rgba(251,113,133,0.18)'
                        : isPicked
                        ? `${ACCENT}11`
                        : 'rgba(255,255,255,0.04)',
                      border: showCorrect
                        ? `2px solid ${ACCENT}`
                        : showWrong
                        ? '2px solid #FB7185'
                        : isPicked
                        ? `1px solid ${ACCENT}88`
                        : '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--em-text)',
                      fontFamily: 'var(--em-display)',
                      fontSize: 15,
                      cursor: revealed ? 'default' : 'pointer',
                      transition: 'all 220ms var(--em-ease)',
                      animation: showWrong ? 'em-shake 0.4s' : 'none',
                      textAlign: 'left',
                      minHeight: 48,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        border: `1.5px solid ${
                          showCorrect ? ACCENT : showWrong ? '#FB7185' : 'rgba(255,255,255,0.25)'
                        }`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--em-mono)',
                        fontSize: 11,
                        color: showCorrect ? ACCENT : showWrong ? '#FB7185' : 'rgba(255,255,255,0.6)',
                      }}
                    >
                      {String.fromCharCode(65 + oi)}
                    </span>
                    <span style={{ flex: 1 }}>{opt}</span>
                    {showCorrect && (
                      <span
                        aria-hidden="true"
                        style={{
                          color: ACCENT,
                          fontSize: 18,
                          animation: 'em-lc-correct-tick 0.5s var(--em-ease) both',
                        }}
                      >
                        ✓
                      </span>
                    )}
                    {showWrong && (
                      <span aria-hidden="true" style={{ color: '#FB7185', fontSize: 18 }}>
                        ✕
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {hintShown && !revealed && (
              <div
                role="status"
                style={{
                  marginTop: 4,
                  padding: '10px 12px',
                  background: `${ACCENT}14`,
                  border: `1px dashed ${ACCENT}aa`,
                  borderRadius: 8,
                  fontFamily: 'var(--em-mono)',
                  fontSize: 11,
                  color: 'var(--em-text)',
                  letterSpacing: '0.04em',
                  animation: 'em-tip-fade 220ms var(--em-ease) both',
                }}
              >
                <span className="em-eyebrow" style={{ color: ACCENT, marginRight: 8 }}>
                  HINT
                </span>
                {cur.hint}
                <div style={{ marginTop: 4, color: 'var(--em-text-muted)' }}>🇵🇱 {cur.hint_pl}</div>
              </div>
            )}

            {revealed && idx < total - 1 && (
              <button
                type="button"
                className="em-btn em-btn-primary"
                onClick={next}
                style={{ alignSelf: 'flex-end', marginTop: 4 }}
                aria-label="Next question"
              >
                Next question →
              </button>
            )}
          </div>

        </div>
      </div>

      {completed && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Listening Booth complete"
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            animation: 'em-rise 0.4s var(--em-ease)',
            zIndex: 12,
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>
            The recording stops.
          </div>
          <div className="em-eyebrow">BOOTH CLOSED · KABINA ZAMKNIĘTA</div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'baseline', marginTop: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div className="em-decor" style={{ fontSize: 38, color: ACCENT }}>{solved}</div>
              <div className="em-eyebrow" style={{ color: ACCENT }}>RIGHT · TRAFNE</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="em-decor" style={{ fontSize: 38, color: '#FB7185' }}>{seen - solved}</div>
              <div className="em-eyebrow" style={{ color: '#FB7185' }}>MISSED · BŁĘDY</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="em-btn em-btn-ghost" onClick={reset} aria-label="Try another recording">
              Try another
            </button>
          </div>
        </div>
      )}
      <Confetti show={completed} />
    </div>
  );
};

export default ListeningCompShell;
