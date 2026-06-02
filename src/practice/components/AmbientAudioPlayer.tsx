// AmbientAudioPlayer — toggleable background audio bed for practice shells.
//
// Mike asked: "why don't I hear the ambient audio?" — the answer was that the
// 38 procedurally-generated ambient.mp3 files lived at
// /root/em-shell-art-output/<slug>/ambient.mp3 but no shell ever requested
// them. This component plugs that gap.
//
// Design contract:
//   • Single prop `shellSlug` matches a *shellKey* (compactcase, e.g.
//     "multiplechoice"). A small map below converts to the kebab-case
//     directory name actually present on disk ("multiple-choice").
//   • Default state is muted — browsers block autoplay-with-sound, so we
//     never start audio without explicit user consent.
//   • Once a student opts in, the choice persists in
//     localStorage["em.ambientAudioOn"]. Subsequent shell entries auto-play
//     at the saved volume so the bed feels continuous across shells.
//   • Volume is clamped to 0.3 — it's a background bed, not foreground.
//   • <audio loop> handles seamless looping; the procedural files are
//     designed for it (uniform amplitude, no fade-in / fade-out).
//   • Only the procedural ambient.mp3 is referenced. The MiniMax music
//     variants (ambient-minimax.mp3) have non-loop-friendly intros/outros.
//   • Cleanup on unmount: pause + null the audio element ref.

import React, { useEffect, useRef, useState } from 'react';

// shellKey (compactcase, what shells already pass to useShellProgress) →
// on-disk directory under /practice-shell-audio/ (kebab-case).
const SLUG_TO_DIR: Record<string, string> = {
  multiplechoice: 'multiple-choice',
  gapfill: 'gap-fill',
  opencloze: 'open-cloze',
  crossword: 'crossword',
  wordsearch: 'wordsearch',
  hangman: 'hangman',
  matching: 'matching',
  anagram: 'anagram',
  flashcards: 'flashcards',
  dragdrop: 'drag-drop',
  groupsort: 'group-sort',
  truefalse: 'true-false',
  picturequiz: 'picture-quiz',
  sentencetransform: 'sentence-transformation',
  wordformation: 'word-formation',
  sentencecorrection: 'sentence-correction',
  spellingbee: 'spelling-bee',
  typingtest: 'typing-test',
  openthebox: 'open-the-box',
  spinthewheel: 'spin-the-wheel',
  whackamole: 'whack-a-mole',
  balloonpop: 'balloon-pop',
  snake: 'snake',
  mazechase: 'maze-chase',
  battleship: 'battleship',
  readingcomp: 'reading-comprehension',
  listeningcomp: 'listening-comprehension',
  speakingcards: 'speaking-cards',
  labelleddiagram: 'labelled-diagram',
  rankorder: 'rank-order',
  unjumble: 'unjumble',
  quizshow: 'quiz-show',
  concentration: 'concentration',
  findthematch: 'find-the-match',
  randomcards: 'random-cards',
  randomwheel: 'random-wheel',
  airplane: 'airplane',
  flyingfruit: 'flying-fruit',
};

const STORAGE_KEY = 'em.ambientAudioOn';
const VOLUME = 0.3;

export interface AmbientAudioPlayerProps {
  shellSlug: string;
}

const readPersistedOn = (): boolean => {
  // Default ON unless the student has explicitly disabled it. Browsers block
  // autoplay-with-sound, so the on-state alone won't actually start the bed —
  // see the document-click resume listener below.
  try {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
};

const writePersistedOn = (on: boolean): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* localStorage may be disabled — fail silent */
  }
};

export const AmbientAudioPlayer: React.FC<AmbientAudioPlayerProps> = ({ shellSlug }) => {
  const dir = SLUG_TO_DIR[shellSlug] ?? shellSlug;
  // ?v=<build hash> busts Cloudflare's cache when we replace the audio file
  // on the origin (e.g. after Mike drops in a new Suno track).
  const src = `/practice-shell-audio/${dir}/ambient.mp3?v=20260503-suno`;

  // Default ON (per Mike 2026-05-03). Autoplay still requires a user gesture,
  // so a document-click listener resumes playback on the first tap.
  const [on, setOn] = useState<boolean>(() => readPersistedOn());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Drive audio element from `on` state. Autoplay rejection no longer flips
  // the UI off — we keep `on=true` and rely on the resume listener below to
  // start playback after the first user interaction.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = VOLUME;
    if (on) {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* will resume on first click */ });
    } else {
      el.pause();
    }
  }, [on]);

  // Resume on first user gesture if autoplay was blocked.
  useEffect(() => {
    if (!on) return;
    const tryResume = () => {
      const el = audioRef.current;
      if (!el || !el.paused) return;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* still blocked, retry on next click */ });
    };
    document.addEventListener('click', tryResume);
    document.addEventListener('touchstart', tryResume, { passive: true });
    return () => {
      document.removeEventListener('click', tryResume);
      document.removeEventListener('touchstart', tryResume);
    };
  }, [on]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  const toggle = () => {
    setOn((prev) => {
      const next = !prev;
      writePersistedOn(next);
      return next;
    });
  };

  return (
    <>
      <audio ref={audioRef} src={src} loop preload="none" aria-hidden="true" />
      <button
        type="button"
        onClick={toggle}
        aria-label="Toggle ambient sound · Włącz/wyłącz dźwięk tła"
        aria-pressed={on}
        title="Toggle ambient sound · Włącz/wyłącz dźwięk tła"
        style={{
          position: 'fixed',
          // Bottom-left, lifted above the mobile tab bar (~76px tall) and the
          // iPhone safe-area inset; keeps clear of Bajla in the bottom-right.
          bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
          left: 16,
          width: 44,
          height: 44,
          borderRadius: 22,
          border: '1px solid rgba(255,255,255,0.18)',
          background: on ? 'rgba(99, 102, 241, 0.85)' : 'rgba(15, 23, 42, 0.78)',
          color: '#fff',
          fontSize: 20,
          lineHeight: '44px',
          cursor: 'pointer',
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          padding: 0,
          transition: 'background 160ms ease',
        }}
      >
        <span aria-hidden="true">{on ? '🔊' : '🔇'}</span>
      </button>
    </>
  );
};

export default AmbientAudioPlayer;
