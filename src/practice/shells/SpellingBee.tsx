// Spelling Bee — The Concert Hall district.
// A single microphone in a pool of gold spotlight on a dark proscenium stage.
// The audience is silent; the curtain hangs heavy. The word is spoken (audio
// + text-to-speech fallback) and the student types the spelling letter by
// letter. The mic glows brighter as each correct letter lands; on completion
// the spotlight bursts and the curtain rises a touch.
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
  useEndOfShellTip,
  normalise,
} from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';

// Concert Hall · Spelling Bee — full bilingual instruction copy.
const SPELLINGBEE_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A word is spoken aloud through the speakers (Kokoro TTS) — listen carefully.',
      'Type the word, letter by letter, into the spelling slots on stage.',
      'Press "Hear again" to replay the word, or use a hint to play it at half speed.',
      'Press Enter to commit your spelling.',
    ],
    pl: [
      'Z głośników odtwarzane jest słowo (Kokoro TTS) — słuchaj uważnie.',
      'Wpisuj słowo, litera po literze, w kratki na scenie.',
      'Naciśnij „Hear again", aby odtworzyć ponownie, albo użyj podpowiedzi, by usłyszeć na pół szybciej.',
      'Naciśnij Enter, aby zatwierdzić pisownię.',
    ],
  },
  controls: {
    en: [
      'Letter slots: 6 slots on stage that fill in as you type.',
      '"Hear again" button: replays the word at normal speed (no penalty).',
      'Hint button: 3 hints per session — plays the word at half speed AND reveals the first letter.',
      'Skip button: gives up the cue and moves to the next word (counts as wrong).',
      'Enter or microphone-confirm icon: commits the spelling for judgment.',
    ],
    pl: [
      'Kratki na litery: 6 kratek na scenie, które wypełniają się, gdy piszesz.',
      'Przycisk „Hear again": odtwarza słowo w normalnym tempie (bez kary).',
      'Przycisk Podpowiedź: 3 podpowiedzi na sesję — odtwarza słowo wolniej I odkrywa pierwszą literę.',
      'Przycisk Pomiń: rezygnuje z cue i przechodzi do następnego słowa (liczy się jako błąd).',
      'Enter lub ikona mikrofonu: zatwierdza pisownię do oceny.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right spelling: the hall applauds (audio cheer), +1 to your tally, the next cue plays.',
      'Wrong spelling: the slots flash rose, the correct spelling is shown highlighted, you can hear it once more.',
      'Skip: counts as wrong; the correct spelling is shown before the next cue.',
      'Capitalisation does not matter; trailing punctuation is stripped.',
    ],
    pl: [
      'Trafna pisownia: sala bije brawo (audio cheer), +1 do wyniku, leci następne cue.',
      'Błędna pisownia: kratki błyskają na różowo, poprawna pisownia pokazuje się podświetlona, można usłyszeć jeszcze raz.',
      'Pomiń: liczy się jako błąd; poprawna pisownia pojawia się przed następnym cue.',
      'Wielkość liter nie ma znaczenia; końcowa interpunkcja jest usuwana.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. The hint button plays the word at half speed AND reveals the first letter, so you can map sound to spelling on the trickiest English words (silent letters, doubled consonants, "-ough" clusters).',
    pl:
      'Masz 3 podpowiedzi na sesję. Przycisk podpowiedzi odtwarza słowo wolniej I odkrywa pierwszą literę, żebyś mógł zmapować dźwięk na pisownię w najtrudniejszych słowach (nieme litery, podwojone spółgłoski, klastry „-ough").',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each correctly spelled cue adds to your session streak. Spelling every cue in the recital unlocks the Concert Hall completion screen and posts your score.',
    pl:
      'Pomiń liczy się jako błąd. Każdy trafnie wpisany cue zwiększa serię. Wpisanie wszystkich cue w recitalu odblokowuje ekran zakończenia Sali Koncertowej i zapisuje wynik.',
  },
  l1Pattern: {
    en:
      'Polish reads (almost) like-it-is-spelled — every letter has one sound. English doesn\'t: silent letters ("knee", "psychology"), doubled consonants you can\'t hear ("committee"), and the "-ough" cluster ("though", "through", "thought") all need memorisation. Spelling Bee builds that ear-to-finger habit.',
    pl:
      'Polski czyta się (prawie) tak, jak się pisze — każda litera ma jeden dźwięk. Angielski nie: nieme litery („knee", „psychology"), podwojone spółgłoski („committee") i klaster „-ough" („though", „through", „thought") wymagają zapamiętania. Spelling Bee buduje nawyk od ucha do palca.',
  },
};

// ─── Types ────────────────────────────────────────────────────────────────
export type SBForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface SBWord {
  id: string;
  word: string;
  audio_url?: string;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface ShellSpellingBeePuzzle {
  words: SBWord[];
}

export interface SpellingBeeShellProps {
  time?: TimeOfDay;
  state?: SBForcedState;
  puzzle?: ShellSpellingBeePuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3-SpellingBee (Ricky wave-3, 2026-05-02): fires once when every dictated
   * word in the puzzle has been seen. Mounts <PracticeReview> at the host.
   * Per-item: each word becomes one review row showing the word + audio
   * replay button + per-letter ✓/✗ on the student's typed letters.
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
    puzzle: ShellSpellingBeePuzzle;
  }) => void;
}

// ─── Demo deck ────────────────────────────────────────────────────────────
export const SB_PUZZLE: ShellSpellingBeePuzzle = {
  words: [
    { id: 'rhythm',     word: 'rhythm',     hint: 'A regular repeated pattern.',         hint_pl: 'Po polsku: rytm.' },
    { id: 'definitely', word: 'definitely', hint: 'Used to confirm strongly.',           hint_pl: 'Po polsku: zdecydowanie.' },
    { id: 'separate',   word: 'separate',   hint: 'Apart, divided.',                     hint_pl: 'Po polsku: oddzielny.' },
    { id: 'occasion',   word: 'occasion',   hint: 'A special event.',                    hint_pl: 'Po polsku: okazja.' },
    { id: 'embarrass',  word: 'embarrass',  hint: 'To make someone feel awkward.',       hint_pl: 'Po polsku: zawstydzić.' },
    { id: 'restaurant', word: 'restaurant', hint: 'Where you eat out.',                  hint_pl: 'Po polsku: restauracja.' },
  ],
};

const ACCENT = '#FBBF24';
const ACCENT_DEEP = '#A07300';

// ─────────────────────────────────────────────────────────────────────────
// renderSpellingBeeReviewItem — per-word locked render for PracticeReview.
// Shows the word + an audio replay button + the student's typed letters with
// per-letter ✓/✗ tiles aligned against the canonical spelling. Skipped words
// show the canonical spelling in muted tiles for study.
// ─────────────────────────────────────────────────────────────────────────
const SB_REVIEW_ACCENT = '#FBBF24';
export function renderSpellingBeeReviewItem(
  word: SBWord,
  studentAnswer: string | undefined,
): React.ReactNode {
  const target = word.word;
  const stu = (studentAnswer ?? '').toLowerCase();
  const wasSkipped = stu.length === 0;
  const isWrong = !wasSkipped && stu !== target.toLowerCase();
  const replay = (): void => {
    if (typeof window === 'undefined') return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(target);
      u.rate = 0.85; u.pitch = 1.0; u.lang = 'en-GB';
      window.speechSynthesis.speak(u);
    } catch { /* policy may block */ }
  };
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
        <button
          type="button"
          onClick={replay}
          aria-label={`Replay the word ${target}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999,
            background: `${SB_REVIEW_ACCENT}1c`,
            border: `1px solid ${SB_REVIEW_ACCENT}66`,
            color: SB_REVIEW_ACCENT, cursor: 'pointer',
            fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 2 L7 6 L11 4 Z" stroke={SB_REVIEW_ACCENT} strokeWidth="1.5" strokeLinejoin="round" fill={SB_REVIEW_ACCENT} />
            <path d="M2 7 a5 5 0 0 0 10 0" stroke={SB_REVIEW_ACCENT} strokeWidth="1.5" fill="none" />
          </svg>
          PLAY
        </button>
        <span style={{
          fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 600,
          color: SB_REVIEW_ACCENT, letterSpacing: '0.04em',
        }}>{target}</span>
      </div>
      {/* Per-letter chip row — green when matching, rose when typed but wrong,
          muted dash when blank. Skipped words show all canonical letters
          neutrally so the spelling can be studied. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'rgba(245,239,255,0.5)' }}>
          {wasSkipped ? 'POPRAWNE LITERY · CANONICAL LETTERS' : 'TWOJE LITERY · YOUR LETTERS'}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {target.split('').map((targetCh, i) => {
            const stuCh = stu[i] ?? '';
            const isCorrect = !wasSkipped && stuCh === targetCh.toLowerCase();
            const isBlank = wasSkipped || stuCh === '';
            const bg = wasSkipped
              ? 'rgba(245,239,255,0.06)'
              : isCorrect
                ? 'linear-gradient(180deg, #34D399, #15532A)'
                : isBlank
                  ? 'rgba(20,16,42,0.6)'
                  : 'linear-gradient(180deg, #FB7185, #9B1C2E)';
            const color = isCorrect || (!isBlank && !wasSkipped) ? '#FFF' : 'rgba(245,239,255,0.65)';
            const showLetter = wasSkipped ? targetCh : (stuCh || '·');
            return (
              <span key={i} style={{
                minWidth: 24, height: 28, padding: '0 6px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--em-decor)', fontSize: 14,
                background: bg, color,
                borderRadius: 4,
                border: `1px solid ${isCorrect ? '#34D39988' : (!isBlank && !wasSkipped) ? '#FB718588' : 'rgba(245,239,255,0.12)'}`,
              }}>
                {showLetter.toUpperCase()}
              </span>
            );
          })}
        </div>
      </div>
      {(isWrong || wasSkipped) && (
        <div style={{ fontSize: 12, color: '#34D399' }}>
          ✓ TAK · Correct spelling: <strong style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.02em' }}>{target}</strong>
        </div>
      )}
    </div>
  );
}


// Browser TTS fallback when no audio_url is supplied AND the EM TTS endpoint
// is unreachable. Used as a last-resort.
function speakWord(word: string): void {
  if (typeof window === 'undefined') return;
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.rate = 0.85;
    u.pitch = 1.0;
    u.lang = 'en-GB';
    window.speechSynthesis.speak(u);
  } catch {
    // No-op: TTS may be blocked by browser policy.
  }
}

// Kelly Tier-2 audit (2026-05-02): the Spelling Bee shell previously rendered
// a <audio> element with src="" and never wired it. Fix: POST the word to the
// EM TTS endpoint (same one Conversa uses, see conversa-widget-v4h.js) which
// returns binary WAV. We blob-URL the result and stash it in a per-word cache
// so "Hear again" replays don't re-fetch.
const TTS_BLOB_CACHE: Record<string, string> = {};

async function fetchTtsBlobUrl(word: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const cached = TTS_BLOB_CACHE[word];
  if (cached) return cached;
  try {
    const res = await fetch('/api/tts/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: word, voice: 'af_heart', lang_code: 'a', speed: 0.9 }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    TTS_BLOB_CACHE[word] = url;
    return url;
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────
export const SpellingBeeShell: React.FC<SpellingBeeShellProps> = ({
  time = 'night',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const activePuzzle: ShellSpellingBeePuzzle =
    puzzle && puzzle.words.length > 0 ? puzzle : SB_PUZZLE;
  const total = activePuzzle.words.length;
  const persisted = useShellProgress('spellingbee');

  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  const [score, setScore] = useState(0);
  const [questionsSeen, setQuestionsSeen] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [revealedFirst, setRevealedFirst] = useState<string>('');
  const [announcement, setAnnouncement] = useState('');
  // Ricky · 2026-05-02 · audit §4 #8 right-rail: running list of words this
  // session, with verdict per word. Drives the desktop-only sidebar.
  const [history, setHistory] = useState<{ word: string; verdict: 'right' | 'wrong' | 'skip' }[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const cur = activePuzzle.words[idx % total];
  const completed = idx >= total;
  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount: score,
        totalQuestions: total,
        wrongAttempts,
        puzzle: activePuzzle,
      });
    } : undefined,
  });

  // Live letter reveal — show typed letters as glowing tiles.
  const targetChars = useMemo(() => (cur ? cur.word.split('') : []), [cur]);
  const draftChars = draft.toLowerCase().split('');

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'spellingbee',
      brief: 'The word plays through the speakers — spell it letter by letter, then Enter.',
      brief_pl: 'Słowo brzmi z głośników — wpisz literę po literze i naciśnij Enter.',
      detail: 'You are on the spelling-bee stage. Tap the speaker to play the word; tap Hear again to replay (limited replays). Type the spelling letter by letter and press Enter to commit. Right answers light green; wrong ones reveal the correct spelling.',
      detail_pl: 'Stoisz na scenie konkursu literowania. Stuknij głośnik, aby usłyszeć słowo; „Hear again" odtwarza ponownie (ograniczone). Wpisz literę po literze i naciśnij Enter, aby zatwierdzić. Trafione świecą na zielono; błędne pokazują właściwą pisownię.',
      fullInstructions: SPELLINGBEE_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  useEffect(() => {
    if (forcedState) return;
    persisted.save({
      progress: idx / Math.max(1, total),
      lastState: completed ? 'complete' : 'active',
    });
    if (completed) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, total, forcedState]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty')   { setIdx(0); setDraft(''); setVerdict(null); setScore(0); }
    if (forcedState === 'active')  { setIdx(0); setDraft('rhy'); setVerdict(null); }
    if (forcedState === 'correct') { setIdx(0); setDraft('rhythm'); setVerdict('right'); }
    if (forcedState === 'wrong')   { setIdx(0); setDraft('rythm'); setVerdict('wrong'); }
    if (forcedState === 'complete'){ setIdx(total); setScore(total); }
  }, [forcedState, total]);

  // Kelly Tier-2 audit (2026-05-02): wire the audio element to either the
  // exercise's prebuilt audio_url OR the EM TTS endpoint. The previous code
  // path called `speakWord` (browser SpeechSynthesis) when no audio_url was
  // present — but speechSynthesis is blocked by autoplay policy on first
  // interaction in Chrome/Safari, so the bee was effectively silent. The
  // fetched WAV blob is cached per-word so replays are instant.
  const wireAudioForCurrent = async (autoplay: boolean): Promise<void> => {
    if (!cur || !audioRef.current) return;
    let src = cur.audio_url ?? '';
    if (!src) {
      const blobUrl = await fetchTtsBlobUrl(cur.word);
      if (blobUrl) src = blobUrl;
    }
    if (src) {
      audioRef.current.src = src;
      if (autoplay) {
        audioRef.current.play().catch(() => speakWord(cur.word));
      }
    } else if (autoplay) {
      // Last-resort: browser TTS.
      speakWord(cur.word);
    }
  };

  // Auto-speak the word when it changes (one-shot per question). Note we
  // also pre-load the src on mount so "Hear again" → audioRef.current.play()
  // fires against a populated source.
  useEffect(() => {
    if (forcedState || !cur || completed) return;
    const t = setTimeout(() => { void wireAudioForCurrent(true); }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, cur?.id, forcedState, completed]);

  const replay = (): void => {
    if (!cur || !audioRef.current) return;
    if (audioRef.current.src && audioRef.current.src !== window.location.href) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => speakWord(cur.word));
    } else {
      // Source not yet wired (e.g. user clicked Hear again before auto-speak
      // fired) — fetch + play.
      void wireAudioForCurrent(true);
    }
  };

  const submit = (): void => {
    if (forcedState || !cur) return;
    const candidate = normalise(draft);
    if (!candidate) return;
    const correct = candidate === normalise(cur.word);
    setVerdict(correct ? 'right' : 'wrong');
    if (correct) {
      setScore((s) => s + 1);
      setHistory((h) => [...h, { word: cur.word, verdict: 'right' }]);
      setAnnouncement(`Spelled ${cur.word}. Bravo.`);
    } else {
      setHistory((h) => [...h, { word: cur.word, verdict: 'wrong' }]);
      setAnnouncement(`Almost. The right spelling is "${cur.word}".`);
      tip.recordWrong({
          questionId: cur.id,
          studentAnswer: draft,
          correctAnswer: cur.word,
          explanationPL: cur.hint_pl,
          exerciseId: cur.exerciseId,
        });
    }
  };

  const advance = (): void => {
    setQuestionsSeen((q) => q + 1);
    setIdx((i) => i + 1);
    setDraft(''); setVerdict(null); setHintRevealed(false); setRevealedFirst('');
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const skip = (): void => {
    if (forcedState || completed || !cur) return;
    setQuestionsSeen((q) => q + 1);
    setHistory((h) => [...h, { word: cur.word, verdict: 'skip' }]);
    setAnnouncement(`Skipped. The word was "${cur.word}".`);
    setIdx((i) => i + 1);
    setDraft(''); setVerdict(null); setHintRevealed(false); setRevealedFirst('');
  };

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 3 || verdict === 'right' || !cur) return;
    setHintsUsed((h) => h + 1);
    if (!hintRevealed) {
      // First hint = clue.
      setHintRevealed(true);
    } else if (!revealedFirst) {
      // Second hint = first letter.
      setRevealedFirst(cur.word[0]);
    } else {
      // Third hint = first two letters.
      setRevealedFirst(cur.word.slice(0, 2));
    }
  };

  const reset = (): void => {
    setIdx(0); setDraft(''); setVerdict(null); setScore(0);
    setQuestionsSeen(0); setHintsUsed(0); setHintRevealed(false); setRevealedFirst('');
    setHistory([]);
    tip.reset();
  };

  const liveStatus = completed ? `All cues sung. Score ${score}/${total}.` : announcement;

  return (
    <div
      className="em-shell em-shell-spellingbee"
      role="application"
      aria-label="Spelling Bee, The Concert Hall"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {liveStatus}
      </div>

      {/* Stage scene */}
      <div style={{
        position: 'absolute', inset: 0, background:
          time === 'day'
            ? 'linear-gradient(180deg, #2D1F4A 0%, #110A22 100%)'
            : 'linear-gradient(180deg, #02010C 0%, #110828 60%, #1F0F40 100%)',
      }} />
      {/* Stage curtain — heavy red drapes either side */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: '14%',
        background: `linear-gradient(90deg, ${ACCENT_DEEP} 0%, #5C0A1A 60%, transparent 100%)`,
        backgroundImage: `repeating-linear-gradient(90deg, transparent 0 22px, rgba(0,0,0,0.30) 22px 24px), linear-gradient(90deg, ${ACCENT_DEEP}, #5C0A1A)`,
        opacity: 0.85,
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, bottom: 0, right: 0, width: '14%',
        background: `linear-gradient(270deg, ${ACCENT_DEEP} 0%, #5C0A1A 60%, transparent 100%)`,
        backgroundImage: `repeating-linear-gradient(90deg, transparent 0 22px, rgba(0,0,0,0.30) 22px 24px), linear-gradient(270deg, ${ACCENT_DEEP}, #5C0A1A)`,
        opacity: 0.85,
      }} />
      {/* Spotlight */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 480,
        background: `radial-gradient(ellipse at center, ${ACCENT}55 0%, ${ACCENT}22 30%, transparent 70%)`,
        animation: 'sb-spotlight 6s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      {/* Floor reflection */}
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%',
        background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.65))',
        pointerEvents: 'none',
      }} />
      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, zIndex: 5, flexWrap: 'wrap' }}>
        <AmbientAudioPlayer shellSlug="spellingbee" />
        <Nameplate
          district="The Concert Hall"
          subtitle="Spelling Bee · Konkurs ortograficzny · spell what you hear"
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="9" y="3" width="4" height="10" rx="2" stroke={ACCENT} strokeWidth="1.6" />
              <path d="M6 11 a5 5 0 0 0 10 0" stroke={ACCENT} strokeWidth="1.6" />
              <line x1="11" y1="16" x2="11" y2="20" stroke={ACCENT} strokeWidth="1.6" />
              <line x1="8" y1="20" x2="14" y2="20" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Progress current={score} seen={questionsSeen} total={total} accent={ACCENT} />
          <SkipButton onClick={skip} />
          <HintButton onClick={useHint} used={hintsUsed} total={3} />
        </div>
      </div>

      {/* Ricky · 2026-05-02 · audit §4 #8 right-rail: Words Dictated panel.
          Closes the vertical/right dead space at desktop ≥1280px. Surfaces a
          running list of words attempted this session, color-coded by verdict.
          Hidden under 1280px via the scoped CSS at the bottom. */}
      <aside className="sb-rail" aria-label="Words dictated this session">
        <div className="em-eyebrow" style={{ color: ACCENT, marginBottom: 12, letterSpacing: '0.22em', fontSize: 10 }}>
          DYKTOWANE SŁOWA · DICTATED
        </div>
        {history.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--em-text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
            Słowa pojawią się tutaj po każdej próbie.<br />
            <span style={{ opacity: 0.7 }}>Words appear here after each attempt.</span>
          </div>
        ) : (
          <ol className="sb-rail-list">
            {history.map((h, i) => {
              const tone = h.verdict === 'right' ? ACCENT : h.verdict === 'wrong' ? '#FB7185' : 'rgba(255,255,255,0.4)';
              const mark = h.verdict === 'right' ? '✓' : h.verdict === 'wrong' ? '✗' : '–';
              return (
                <li key={i} className="sb-rail-item">
                  <span className="sb-rail-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="sb-rail-word" style={{ color: tone }}>{h.word}</span>
                  <span className="sb-rail-mark" style={{ color: tone, borderColor: `${tone}55` }}>{mark}</span>
                </li>
              );
            })}
          </ol>
        )}
        <div className="sb-rail-foot">
          <span style={{ color: ACCENT, fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.18em' }}>
            CHÓR · CHORUS
          </span>
          <span style={{ color: 'var(--em-text-muted)', fontSize: 10, letterSpacing: '0.06em', marginTop: 4, display: 'block' }}>
            5 chars = 1 word · standard typing convention
          </span>
        </div>
      </aside>

      {/* Stage centrepiece */}
      {!completed && cur && (
        <div className="sb-stage" style={{ position: 'absolute', inset: '110px 24px 220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 28, zIndex: 4 }}>
          {/* Microphone */}
          <div
            key={`m-${cur.id}`}
            aria-hidden="true"
            role="presentation"
            style={{
              position: 'relative',
              width: 76, height: 110,
              animation: 'sb-mic-rise 540ms var(--em-ease) both, sb-mic-bob 3.2s ease-in-out 0.6s infinite',
            }}
          >
            <div style={{
              position: 'absolute', top: 0, left: 12, width: 52, height: 64,
              background: `linear-gradient(180deg, #E5E7EB, #6B7280)`,
              borderRadius: '26px 26px 14px 14px',
              boxShadow: `0 0 30px ${ACCENT}66, inset 0 -8px 0 rgba(0,0,0,0.4)`,
              border: '1px solid rgba(255,255,255,0.32)',
            }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: 8, right: 8, top: 10 + i * 10, height: 2, background: 'rgba(0,0,0,0.45)', borderRadius: 1 }} />
              ))}
            </div>
            <div style={{
              position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
              width: 4, height: 48,
              background: 'linear-gradient(180deg, #C0C0C0, #4A4A4A)',
              borderRadius: 2,
            }} />
            <div style={{
              position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
              width: 50, height: 12,
              background: 'radial-gradient(ellipse, #2A2A2A, #0F0F0F)',
              borderRadius: '50%',
            }} />
          </div>

          {/* Replay + clue card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="em-btn em-btn-ghost"
              onClick={replay}
              aria-label="Hear the word again"
              style={{
                padding: '10px 16px', borderColor: ACCENT,
                background: `${ACCENT}1c`,
                color: ACCENT, fontFamily: 'var(--em-mono)', letterSpacing: '0.18em',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: -2, marginRight: 6 }}>
                <path d="M7 2 L7 6 L11 4 Z" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round" fill={ACCENT} />
                <path d="M2 7 a5 5 0 0 0 10 0" stroke={ACCENT} strokeWidth="1.5" fill="none" />
              </svg>
              Hear again
            </button>
            <div style={{
              padding: '8px 14px',
              border: `1px dashed ${ACCENT}66`, borderRadius: 999,
              fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.18em',
              color: 'var(--em-text-muted)',
            }}>
              {/* CD audit cross-cutting #14 (Ricky 2026-05-02): drop redundant
                  "WORD {idx+1} / {total}" — header <Progress> is the canonical
                  position counter. Letter-count is kept (a useful hint). */}
              LETTER COUNT: {cur.word.length}
            </div>
          </div>

          {/* Letter tile row */}
          <div role="region" aria-label="Letters typed so far" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 560 }}>
            {targetChars.map((target, i) => {
              const typed = draftChars[i];
              const matches = typed === target;
              const reveal = revealedFirst[i];
              const showLetter = matches ? typed : reveal ? reveal : (typed ? typed : '');
              const tone = matches
                ? { bg: `${ACCENT}33`, border: ACCENT, color: ACCENT }
                : typed
                  ? { bg: 'rgba(155,28,46,0.18)', border: '#FB7185', color: '#FB7185' }
                  : reveal
                    ? { bg: `${ACCENT}1c`, border: `${ACCENT}88`, color: ACCENT }
                    : { bg: 'rgba(0,0,0,0.45)', border: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.4)' };
              return (
                <div key={i} style={{
                  width: 36, height: 48,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: tone.bg,
                  border: `2px solid ${tone.border}`,
                  borderRadius: 6,
                  fontFamily: 'var(--em-decor)', fontSize: 24,
                  color: tone.color,
                  textShadow: matches ? `0 0 10px ${ACCENT}` : 'none',
                  transition: 'all 220ms var(--em-ease)',
                  animation: typed ? 'sb-tile-pop 220ms var(--em-ease) both' : 'none',
                }}>
                  {showLetter ? showLetter.toUpperCase() : ''}
                </div>
              );
            })}
          </div>

          {/* Spelling input */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <input
              ref={inputRef}
              type="text"
              autoFocus
              value={draft}
              onChange={(e) => { setDraft(e.target.value); if (verdict) setVerdict(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
              placeholder="spell it out…"
              aria-label="Spell the word you heard"
              disabled={!!forcedState || verdict === 'right'}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              style={{
                width: 280, padding: '12px 16px',
                background: 'rgba(0,0,0,0.32)',
                border: `1px solid ${verdict === 'right' ? ACCENT : verdict === 'wrong' ? '#FB7185' : 'rgba(255,255,255,0.18)'}`,
                borderRadius: 999,
                fontFamily: 'var(--em-decor)', fontSize: 18,
                color: 'var(--em-text)',
                outline: 'none',
                textAlign: 'center',
                letterSpacing: '0.04em',
                animation: verdict === 'wrong' ? 'em-shake 0.4s var(--em-ease)' : 'none',
              }}
            />
            {verdict !== 'right' && (
              <button className="em-btn em-btn-ghost" onClick={submit}>Submit ↵</button>
            )}
            {verdict === 'right' && (
              <button
                className="em-btn em-btn-primary"
                onClick={advance}
                style={{ background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})`, color: '#0E0A1A', borderColor: ACCENT }}
              >
                {idx + 1 >= total ? 'Bow out →' : 'Next cue →'}
              </button>
            )}
          </div>

          {/* Hidden audio el for cur.audio_url playback */}
          <audio ref={audioRef} preload="auto" aria-hidden="true" />

          {hintRevealed && verdict !== 'right' && (
            <div role="status" aria-live="polite" style={{
              maxWidth: 560, padding: '10px 14px',
              background: `${ACCENT}1c`, border: `1px dashed ${ACCENT}88`,
              borderRadius: 6, fontSize: 13, color: 'var(--em-text)',
              animation: 'em-tip-fade 220ms var(--em-ease) both',
            }}>
              <span className="em-eyebrow" style={{ color: ACCENT, marginRight: 6 }}>STAGE WHISPER</span>
              {cur.hint}
              {revealedFirst && (
                <span style={{ display: 'block', marginTop: 4 }}>
                  Starts with: <strong style={{ color: ACCENT, fontFamily: 'var(--em-decor)', letterSpacing: '0.06em' }}>
                    {revealedFirst.toUpperCase()}…
                  </strong>
                </span>
              )}
              <span style={{ display: 'block', marginTop: 4, fontStyle: 'italic', opacity: 0.85 }}>🇵🇱 {cur.hint_pl}</span>
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
          aria-label="Concert Hall complete"
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
            The hall stands and applauds.
          </div>
          <div className="em-eyebrow">{score} / {total} CUES · KONCERT ZAKOŃCZONY</div>
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
        @keyframes sb-spotlight {
          0%, 100% { opacity: 0.9; transform: translateX(-50%) scale(1); }
          50%      { opacity: 1; transform: translateX(-50%) scale(1.08); }
        }
        @keyframes sb-mic-rise {
          0%   { opacity: 0; transform: translateY(28px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes sb-mic-bob {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50%      { transform: translateY(-3px) rotate(1deg); }
        }
        @keyframes sb-tile-pop {
          0%   { transform: scale(0.85); }
          50%  { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        /* Right-rail (Ricky · 2026-05-02 · audit §4 #8). Hidden by default. */
        .em-shell-spellingbee .sb-rail { display: none; }
        @media (min-width: 1280px) {
          .em-shell-spellingbee .sb-rail {
            display: block;
            position: absolute;
            top: 110px;
            right: 24px;
            bottom: 220px;
            width: 280px;
            padding: 18px 18px 16px;
            background: rgba(15, 7, 36, 0.62);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(251, 191, 36, 0.28);
            border-radius: 14px;
            box-shadow: inset 0 0 60px rgba(251, 191, 36, 0.06), 0 18px 40px -16px rgba(0,0,0,0.5);
            z-index: 4;
            color: var(--em-text);
            font-family: var(--em-body);
            overflow-y: auto;
            display: flex;
            flex-direction: column;
          }
          .em-shell-spellingbee .sb-stage {
            inset: 110px 326px 220px 24px !important;
          }
          .em-shell-spellingbee .sb-rail-list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex: 1;
            overflow-y: auto;
          }
          .em-shell-spellingbee .sb-rail-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 8px;
            border-radius: 6px;
            background: rgba(0, 0, 0, 0.32);
            border: 1px solid rgba(255, 255, 255, 0.06);
          }
          .em-shell-spellingbee .sb-rail-num {
            font-family: var(--em-mono);
            font-size: 10px;
            color: rgba(255,255,255,0.4);
            letter-spacing: 0.08em;
            min-width: 22px;
          }
          .em-shell-spellingbee .sb-rail-word {
            flex: 1;
            font-family: 'Georgia', serif;
            font-size: 14px;
            letter-spacing: 0.02em;
          }
          .em-shell-spellingbee .sb-rail-mark {
            font-family: var(--em-mono);
            font-size: 12px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 4px;
            border: 1px solid;
            min-width: 24px;
            text-align: center;
          }
          .em-shell-spellingbee .sb-rail-foot {
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px dashed rgba(255, 255, 255, 0.14);
          }
        }
      `}</style>
    </div>
  );
};

export default SpellingBeeShell;
