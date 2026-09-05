import { lazy as wordLazy, Suspense as WordSuspense } from 'react';
const WordScene3D = wordLazy(() => import('../shells3d/WordHangman3D'));
// Hangman — The Lantern Alley.
//
// Theme unified (Kelly audit, CC-6, 2026-05-02): we previously dual-named this
// shell "Lantern Alley · Construction Site" — the landing card said one name,
// the inner Nameplate subtitle said the other, and the inline visuals depicted
// scaffolding/hard-hats. Mike's call: pick ONE theme, and the rope-and-hanging
// metaphor of Hangman maps cleanly onto lanterns hanging from an alley. Wrong
// guesses dim individual lanterns; the word is built rung-by-rung on a hung
// rope of glyph plates. The previous EM-031/EM-063 dual-name comment is
// superseded by this Tier-1 cleanup.
//
// Ricky CC-Hangman pass (2026-05-02): post-CD-audit overhaul. Restructured
// from absolute-positioned overlap-prone scene to a flex-column hierarchy:
// (1) lanterns chrome row at top, (2) LARGE word slots, (3) clue card,
// (4) full-width 7-col WCAG keypad, (5) right-side pattern card. Bajla now
// perches on the LEFT lamp post and her speech-cone points DOWN-RIGHT into
// the play area — no longer floats next to the moon. Added cyan trail
// animation key→slot on correct, "−1 LIFE / −1 ŻYCIE" floater on wrong,
// keypad buttons bumped 30→44px (WCAG 2.5.5 Target Size), 7-col grid so
// 26 letters tile in 4 rows (7+7+7+5) and the keypad never overflows 375px.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { WordMission, useWordArcade } from './word-arcade';
import { useShellProgress } from '../lib/convex-stubs';
import type { ShellHangmanPuzzle } from '../lib/adapters';
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';

// 3D pilot (Ricky, 2026-05-03 — CD audit). Lazy-loaded so the r3f bundle
// (~150KB gz) only ships when a student opens this shell, and only when
// the feature flag below is on. The 2D lantern row stays as the immediate
// fallback while the 3D chunk is downloading + as the always-on a11y
// canonical (the Canvas itself is aria-hidden).

/**
 * Feature flag for the 3D Lantern Alley pilot.
 *  - Defaults ON in production (Mike's directive: ship the pilot).
 *  - Defaults OFF in dev so the design canvas + storybooks stay snappy.
 *  - Overridable via `window.__EM_HANGMAN_3D__` for live A/B inside an
 *    open page (e.g. devtools toggle without a rebuild).
 */
function isHangman3DEnabledFn(): boolean {
  // import.meta.env.MODE is provided by Vite at build time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mode: string = (import.meta as unknown as { env?: { MODE?: string } })?.env?.MODE ?? 'production';
  const defaultOn = mode === 'production';
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const override = (window as unknown as { __EM_HANGMAN_3D__?: boolean }).__EM_HANGMAN_3D__;
    if (typeof override === 'boolean') return override;
  }
  return defaultOn;
}
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
// Bilingual instruction copy — broadcast to the chat-widget Bajla bubble
// via em:shell-instruction (DETAILED state renders the rich blocks inside
// the bubble; standalone ExpandableInstructions card removed 2026-05-03).
import { HANGMAN_INSTRUCTIONS } from '../components/ExpandableInstructions';

export type HangmanForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface HangmanShellProps {
  time?: TimeOfDay;
  state?: HangmanForcedState;
  /**
   * When provided (e.g. from StudentPractice's generator + adapter pipeline),
   * the shell renders this puzzle deck instead of HM_PUZZLES. Accepts either
   * a single puzzle or an array (we always normalise to array internally).
   */
  puzzle?: ShellHangmanPuzzle | ShellHangmanPuzzle[];
  /**
   * Layer-4 dynamic-scaffolding hook (Agent A12). Fires when the player
   * exhausts their lives — the L1-interference tip then explains why this
   * particular word's pattern tripped them up.
   */
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3-Hangman (CD's review-pattern, 2026-05-02): fires once when the student
   * has played every puzzle in the deck (each ending in won OR lost). The
   * host uses this to mount <PracticeReview>. When provided, the per-puzzle
   * "The lanterns are lit." / "The alley went dark." dialog shows ONLY the
   * primary CTA which advances to the next puzzle (or, on the last puzzle,
   * suppresses entirely so the review screen takes over).
   *
   * Per-word notes:
   *   - questionId in wrongAttempts is the canonical word string (uppercase),
   *     matching how renderHangmanReviewItem dispatches per-puzzle.
   *   - studentAnswer is the letter sequence the student tried, in order
   *     (e.g. `B-I-Z-C-X-Y-…`), so the review can paint the lantern row
   *     showing how many lives were lost + which letters were guessed.
   *   - playedRecords carries the per-puzzle outcome ('won' | 'lost') so the
   *     review can mark each puzzle's status without needing to re-derive.
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
    puzzleDeck: ShellHangmanPuzzle[];
    playedRecords: Array<{ word: string; outcome: 'won' | 'lost'; guesses: string[]; livesUsed: number }>;
  }) => void;
}

interface HMPuzzle {
  word: string;
  clue: string;
  clue_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  HM_PUZZLES don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
}

type BajlaMood = 'idle' | 'cheer' | 'think' | 'wave';

// ─────────────────────────────────────────────────────────────────────────────
// Per-shell answer-leak guard (Kelly CC-2, 2026-05-02).
// Belt-and-suspenders: lib/exercise-adapters.ts#sanitiseHint already strips
// the answer from hintPL before adapter output reaches the shell, but if a
// new content-pipeline path bypasses the adapter (e.g. an HM_PUZZLES demo
// entry, or a future Convex flow), this guard catches the leak at render time.
// Pure: no DOM/Convex deps. If the rendered hint string contains the answer
// (case-insensitive, whole-word), substitute a generic clue.
// ─────────────────────────────────────────────────────────────────────────────
function maskAnswerInHint(hint: string | undefined, answer: string | undefined): string {
  if (!hint) return '';
  if (!answer) return hint;
  const ans = answer.toLowerCase().trim();
  if (!ans) return hint;
  const safeAns = ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${safeAns}\\b`, 'i');
  if (!re.test(hint)) return hint;
  // Leak detected → replace with a generic clue. Heuristic matches sanitiseHint:
  // short, no-spaces answer is most likely a single word/verb form.
  const isLikelyVerb = ans.length <= 12 && !/\s/.test(ans);
  return isLikelyVerb ? 'Forma czasownika.' : 'Słowo z lekcji.';
}

const HM_PUZZLES: HMPuzzle[] = [
  { word: 'BICYCLE', clue: 'A two-wheeled vehicle.', clue_pl: 'dwukołowy pojazd' },
  { word: 'BRIDGE', clue: 'It crosses a river.', clue_pl: 'przechodzi nad rzeką' },
  { word: 'AVENUE', clue: 'A wide tree-lined street.', clue_pl: 'aleja' },
  { word: 'STATION', clue: 'Where the trains arrive.', clue_pl: 'stacja' },
  { word: 'MARKET', clue: 'Stalls of sellers and goods.', clue_pl: 'targ, rynek' },
];

// History of words played this session (in-memory; resets on shell unmount).
// Surfaces in the right-side "WORDS PLAYED · DZIŚ ZAGRANE" mini-list so the
// student sees what they've covered without having to remember.
type PlayedRecord = {
  word: string;
  outcome: 'won' | 'lost';
  /** Letter sequence the student tried, in order. Used by the review screen
   *  to paint the lantern row + letter-tried strip. D3 (2026-05-02). */
  guesses: string[];
  /** Wrong-letter count at end of game (0..MAX_WRONG). Drives the dimmed-
   *  lanterns row in the review item. */
  livesUsed: number;
  /** Convex exerciseId mirror so the review can dispatch per-attempt. */
  exerciseId?: string;
  /** Polish meaning-only clue mirror so the review's rule callout has copy
   *  even when the puzzle came from sample HM_PUZZLES. */
  cluePL?: string;
};

// ─────────────────────────────────────────────────────────────────────────
// renderHangmanReviewItem — per-word locked render for PracticeReview.
// Shows the word + clue + lantern row (lit/dimmed) + status chip {won · lost}
// + the letter sequence the student tried. Mirrors the live shell's
// LANTERN ROW visual so the review feels like a frozen scoreboard.
// ─────────────────────────────────────────────────────────────────────────
const HM_REVIEW_ACCENT = '#FBBF24';
const HM_MAX_WRONG = 6;
export function renderHangmanReviewItem(
  rec: PlayedRecord,
  cluePL?: string,
): React.ReactNode {
  const litCount = HM_MAX_WRONG - rec.livesUsed;
  const wrongLetters = rec.guesses.filter((l) => !rec.word.includes(l));
  const correctLetters = rec.guesses.filter((l) => rec.word.includes(l));
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: rec.outcome === 'won'
        ? 'linear-gradient(180deg, rgba(52,211,153,0.10), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))',
      border: `1px solid ${rec.outcome === 'won' ? 'rgba(52,211,153,0.45)' : 'rgba(251,113,133,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-decor)', fontSize: 18, fontWeight: 700,
          color: rec.outcome === 'won' ? HM_REVIEW_ACCENT : 'var(--em-text, #EDE6FF)',
          letterSpacing: '0.06em',
        }}>
          {rec.word}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.16em',
          padding: '2px 8px', borderRadius: 999,
          background: rec.outcome === 'won' ? 'rgba(52,211,153,0.18)' : 'rgba(251,113,133,0.18)',
          color: rec.outcome === 'won' ? '#34D399' : '#FB7185',
          fontWeight: 700,
        }}>
          {rec.outcome === 'won' ? '✓ LIT · ROZŚWIETLONE' : '✗ DARK · CIEMNE'}
        </span>
      </div>
      {cluePL ? (
        <div style={{ fontSize: 13, color: 'var(--em-text-dim, rgba(245,239,255,0.65))', fontStyle: 'italic' }}>
          🇵🇱 {cluePL}
        </div>
      ) : null}
      {/* PRÓBY · LIVES — lantern row. Lit lanterns first, then dimmed. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'rgba(245,239,255,0.5)' }}>
          PRÓBY · LIVES · {litCount}/{HM_MAX_WRONG}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: HM_MAX_WRONG }).map((_, i) => {
            const isLit = i < litCount;
            return (
              <span key={i} aria-hidden style={{
                width: 16, height: 18, borderRadius: '50% 50% 4px 4px',
                background: isLit
                  ? `radial-gradient(ellipse at 50% 30%, ${HM_REVIEW_ACCENT}, ${HM_REVIEW_ACCENT}aa 60%, ${HM_REVIEW_ACCENT}33)`
                  : 'rgba(245,239,255,0.08)',
                boxShadow: isLit ? `0 0 6px ${HM_REVIEW_ACCENT}99` : 'none',
                border: `1px solid ${isLit ? HM_REVIEW_ACCENT : 'rgba(245,239,255,0.12)'}`,
              }} />
            );
          })}
        </div>
      </div>
      {/* Letter sequence the student tried */}
      {rec.guesses.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'rgba(245,239,255,0.5)' }}>
            LITERY · LETTERS TRIED
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {rec.guesses.map((l, i) => {
              const wasGood = correctLetters.includes(l);
              return (
                <span key={`${l}-${i}`} style={{
                  minWidth: 20, height: 22, padding: '0 4px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--em-mono)', fontSize: 11, fontWeight: 700,
                  borderRadius: 3,
                  background: wasGood ? 'rgba(52,211,153,0.20)' : 'rgba(251,113,133,0.18)',
                  color: wasGood ? '#34D399' : '#FB7185',
                  border: `1px solid ${wasGood ? 'rgba(52,211,153,0.45)' : 'rgba(251,113,133,0.45)'}`,
                  letterSpacing: '0.06em',
                }}>
                  {l}
                </span>
              );
            })}
          </div>
          {wrongLetters.length > 0 ? (
            <div style={{ fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'rgba(245,239,255,0.4)' }}>
              {correctLetters.length} hit · {wrongLetters.length} miss
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const HangmanShell: React.FC<HangmanShellProps> = ({ time = 'dusk', state: forcedState = null, puzzle, onWrongAnswer, onSessionComplete }) => {
  const arcade = useWordArcade();
  const accent = '#FBBF24';
  const cyan = '#22D3EE';
  // Persisted progress (skipped when forcedState is set for design-canvas demos).
  const persisted = useShellProgress('hangman');
  const MAX_WRONG = 6;
  // 3D pilot flag — see isHangman3DEnabled() at top of file. Reads the
  // build-mode + window override on every render but the value is stable
  // for the lifetime of the page, so the lazy chunk only loads once.
  const is3DEnabled = isHangman3DEnabledFn();
  // Tick that bumps every wrong guess so the 3D scene can fire embers
  // even when wrongCount is the same (e.g. round reset).
  const [wrongTick, setWrongTick] = useState(0);
  const [correctTick, setCorrectTick] = useState(0);

  // Normalise the optional puzzle prop to an array deck. Use the built-in
  // demo deck when no puzzle is supplied (or it's empty).
  const puzzleArr: HMPuzzle[] = (() => {
    if (!puzzle) return HM_PUZZLES;
    const arr = Array.isArray(puzzle) ? puzzle : [puzzle];
    return arr.length > 0 ? arr : HM_PUZZLES;
  })();

  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [guessed, setGuessed] = useState<string[]>([]);
  const [rescueWord, setRescueWord] = useState('');
  const [rescueMisses, setRescueMisses] = useState(0);
  const [rescueMessage, setRescueMessage] = useState('');
  const [shake, setShake] = useState(false);
  const [pulseLetter, setPulseLetter] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [played, setPlayed] = useState<PlayedRecord[]>([]);
  // D3-Hangman (2026-05-02): wrong-attempt accumulator for the review screen.
  // Mirrors the per-shell pattern in Crossword/GapFill — ref-based to avoid
  // re-renders, single-fire guard to prevent double-emits of onSessionComplete.
  const wrongAttemptsRef = useRef<Array<{
    questionId: string; studentAnswer: string; correctAnswer: string;
    explanationPL?: string; exerciseId?: string;
  }>>([]);
  const sessionFiredRef = useRef(false);

  // Wrong-pick floater payload — surfaces above the just-extinguished lantern
  // for ~1100ms before fading. Also doubles as the visual for "-1 LIFE".
  const [lifeFloater, setLifeFloater] = useState<{ id: number; lanternIdx: number } | null>(null);
  const lifeFloaterIdRef = useRef(0);

  // Trail effect — when the player guesses a correct letter, we draw a brief
  // cyan stroke from the keypad button → each filled slot. The animation
  // payload carries the letter + DOM-measured endpoints (computed in a
  // useLayoutEffect after the slot/keypad refs settle).
  const [trail, setTrail] = useState<{
    id: number;
    letter: string;
    paths: { x1: number; y1: number; x2: number; y2: number }[];
  } | null>(null);
  const trailIdRef = useRef(0);

  // Refs into the play surface for measuring trail endpoints.
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const keyRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Game-over dialog focus management — when the win/lose dialog appears we
  // shift focus to the primary "Try a new word →" / "Next site →" button and
  // trap Tab inside the dialog (only one focusable element, so Tab loops
  // back to itself). Restores focus to the previously-active element on close.
  const tryAgainBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const current = puzzleArr[puzzleIdx] ?? puzzleArr[0];
  const word = current.word;
  const wrongLetters = guessed.filter((l) => !word.includes(l));
  const wrongCount = Math.min(MAX_WRONG,wrongLetters.length + rescueMisses*2);
  const display = word.split('').map((l) => (guessed.includes(l) ? l : '_'));
  const won = display.every((c) => c !== '_');
  const lost = wrongCount >= MAX_WRONG;

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  // Publishes the current per-shell instruction context to the Bajla chat
  // widget so it can render the bilingual brief + detail in a speech bubble
  // next to the launcher. The widget caches the latest payload and reacts
  // to state changes (default / shrunk / detailed). On unmount we clear so
  // navigating off the shell hides the bubble. Hangman is the canonical
  // first surface — fan-out to the other 37 shells happens in a follow-up.
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    // Per-round broadcast (Mike 2026-05-03): brief carries the CURRENT
    // word's meaning clue so the speech bubble actually helps the student
    // guess. Key terms get **bold** markdown; the widget renders those as
    // a highlighted .bajla-key-term span (Cormorant Garamond, magenta,
    // underlined, subtle pulse) so the student can spot the clue word(s)
    // at a glance.
    const enClueRaw = (maskAnswerInHint(current?.clue, word) || '').trim();
    const plClueRaw = (maskAnswerInHint(current?.clue_pl, word) || '').trim();
    const enHas = enClueRaw.length > 0 && !/^(choose|pick|select|write|complete|fill)\b/i.test(enClueRaw);
    const lenChip = word ? `${word.length}-letter` : '';
    const lenChipPl = word ? `${word.length}-literowe` : '';
    const detail = {
      shellKey: 'hangman',
      brief: enHas
        ? `Guess this **${lenChip}** word: **${enClueRaw}**`
        : `Guess this **${lenChip}** hidden word, letter by letter.`,
      brief_pl: plClueRaw
        ? `Zgadnij **${lenChipPl}** słowo: **${plClueRaw}**`
        : `Zgadnij **${lenChipPl}** ukryte słowo, litera po literze.`,
      detail: `Tap a key to reveal it. Six wrong picks and the alley goes dark. Use the Hint button to reveal one letter (3 hints total). The **highlighted** part above is your meaning clue — match it to the right **${lenChip}** English word and start with the most common letters (E, A, R, I, O, T, N, S).`,
      detail_pl: `Stuknij klawisz, aby ją odkryć. Sześć błędów i alejka pogrąża się w mroku. Użyj Podpowiedzi, aby odsłonić jedną literę (3 razy). **Podświetlona** część powyżej to wskazówka znaczeniowa — dopasuj ją do właściwego **${lenChipPl}** angielskiego słowa i zacznij od najczęstszych liter (E, A, R, I, O, T, N, S).`,
      fullInstructions: HANGMAN_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState, current?.clue, current?.clue_pl, word]);

  // Auto-save progress as letters are guessed.
  useEffect(() => {
    if (forcedState) return;
    const total = word.length;
    const revealed = display.filter(c => c !== '_').length;
    const coveredBefore = played.filter(result=>result.word!==word).length;
    const sessionDone = coveredBefore + (won||lost?1:0) >= puzzleArr.length;
    const progress = Math.min(1,(coveredBefore + (won||lost?1:revealed/Math.max(1,total))) / puzzleArr.length);
    persisted.save({ progress, completed:sessionDone, lastState:sessionDone?'complete':'active' });
    if (won) {
      setPlayed((p) => p.find(r => r.word === word) ? p : [...p, {
        word, outcome: 'won',
        guesses: [...guessed],
        livesUsed: wrongCount,
        exerciseId: current.exerciseId,
        cluePL: maskAnswerInHint(current.clue_pl, current.word),
      }]);
    }
    if (lost) {
      setPlayed((p) => p.find(r => r.word === word) ? p : [...p, {
        word, outcome: 'lost',
        guesses: [...guessed],
        livesUsed: wrongCount,
        exerciseId: current.exerciseId,
        cluePL: maskAnswerInHint(current.clue_pl, current.word),
      }]);
      // Layer-4: site closed — fire interference tip so the student sees
      // why the word's pattern was hard.
      if (onWrongAnswer) {
        onWrongAnswer({
          questionId: word,
          studentAnswer: display.join(''),
          correctAnswer: word,
          explanationPL: current.clue_pl,
          exerciseId: current.exerciseId,
        });
      }
      // D3-Hangman (2026-05-02): record this lost word into the session
      // accumulator so the review can render its rule callout.
      if (onSessionComplete && !wrongAttemptsRef.current.find((wa) => wa.questionId === word)) {
        wrongAttemptsRef.current.push({
          questionId: word,
          studentAnswer: display.join(''),
          correctAnswer: word,
          explanationPL: maskAnswerInHint(current.clue_pl, current.word),
          exerciseId: current.exerciseId,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guessed.length, rescueMisses, puzzleIdx, forcedState]);

  useEffect(() => {
    if (forcedState === 'empty') {
      setGuessed([]);
      setHintsUsed(0);
    }
    if (forcedState === 'active') {
      setGuessed(['B', 'I', 'C']);
      setHintsUsed(0);
    }
    if (forcedState === 'wrong') {
      setGuessed(['B', 'Z', 'I', 'X']);
      setHintsUsed(0);
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
    if (forcedState === 'correct') {
      setGuessed(['B', 'I', 'C', 'Y']);
      setHintsUsed(0);
      setPulseLetter('Y');
      setTimeout(() => setPulseLetter(null), 800);
    }
    if (forcedState === 'complete') {
      setGuessed([...new Set(word.split(''))]);
      setHintsUsed(0);
    }
  }, [forcedState, word]);

  const guess = useCallback(
    (letter: string) => {
      if (won || lost) return;
      if (guessed.includes(letter)) return;
      arcade.answer(word.includes(letter),35);
      setGuessed((g) => [...g, letter]);
      if (!word.includes(letter)) {
        setShake(true);
        setTimeout(() => setShake(false), 400);
        // Bump the 3D wrongTick so the embers fire on the just-extinguished
        // lantern even if React batches the wrongCount transition.
        setWrongTick((t) => t + 1);
        // Wrong-pick floater — anchored to the lantern that was just dimmed.
        // Lantern that just went out is at index (MAX_WRONG - 1 - newWrongCount)
        // because the row dims right-to-left. We pre-compute newWrongCount.
        const newWrongCount = wrongCount + 1;
        const lanternIdx = MAX_WRONG - newWrongCount;
        const id = ++lifeFloaterIdRef.current;
        setLifeFloater({ id, lanternIdx });
        window.setTimeout(() => {
          setLifeFloater((cur) => (cur && cur.id === id ? null : cur));
        }, 1100);
      } else {
        setPulseLetter(letter);
        setTimeout(() => setPulseLetter(null), 600);
        // Bump the 3D correctTick so a lantern flares brightly per Mike's
        // 2026-05-03 feedback ("every correct letter the lantern should
        // clearly switch on, extremely bright with animation").
        setCorrectTick((t) => t + 1);
      }
    },
    [guessed, won, lost, word, wrongCount, arcade.answer],
  );

  // Cyan trail key→slot — fires on every successful guess. Measured *after*
  // the slot DOM has updated (useLayoutEffect on guessed.length).
  useLayoutEffect(() => {
    if (!pulseLetter) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const surfBox = surface.getBoundingClientRect();
    const keyEl = keyRefs.current.get(pulseLetter);
    if (!keyEl) return;
    const keyBox = keyEl.getBoundingClientRect();
    const x1 = keyBox.left + keyBox.width / 2 - surfBox.left;
    const y1 = keyBox.top + keyBox.height / 2 - surfBox.top;
    // For each filled position holding this letter, draw a stroke.
    const paths: { x1: number; y1: number; x2: number; y2: number }[] = [];
    word.split('').forEach((c, i) => {
      if (c !== pulseLetter) return;
      const slot = slotRefs.current.get(i);
      if (!slot) return;
      const sb = slot.getBoundingClientRect();
      const x2 = sb.left + sb.width / 2 - surfBox.left;
      const y2 = sb.top + sb.height / 2 - surfBox.top;
      paths.push({ x1, y1, x2, y2 });
    });
    if (paths.length === 0) return;
    const id = ++trailIdRef.current;
    setTrail({ id, letter: pulseLetter, paths });
    const t = window.setTimeout(() => {
      setTrail((cur) => (cur && cur.id === id ? null : cur));
    }, 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseLetter]);

  // Kelly Tier 1 (2026-05-02): scope-guard the global keydown so a-z keys
  // typed into the AI tutor pill or any other input/textarea/contenteditable
  // on the page don't get reinterpreted as Hangman guesses.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (forcedState) return;
      const t = e.target as HTMLElement | null;
      if (t && (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable
      )) return;
      if (/^[a-zA-Z]$/.test(e.key)) guess(e.key.toUpperCase());
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [forcedState, guess]);

  // Game-over dialog focus management. When the dialog opens (won/lost), record
  // the previously-focused element, move focus to the primary action button,
  // and trap Tab within the dialog. Restores focus when the dialog closes.
  useEffect(() => {
    const dialogOpen = won || lost;
    if (!dialogOpen) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    // Move focus on the next tick so the button has actually mounted.
    const focusId = window.setTimeout(() => {
      tryAgainBtnRef.current?.focus();
    }, 0);

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      // Only one focusable element in the dialog — keep focus pinned to it.
      if (document.activeElement !== tryAgainBtnRef.current) {
        e.preventDefault();
        tryAgainBtnRef.current?.focus();
        return;
      }
      e.preventDefault();
      tryAgainBtnRef.current?.focus();
    };
    document.addEventListener('keydown', trap);

    return () => {
      window.clearTimeout(focusId);
      document.removeEventListener('keydown', trap);
      // Restore focus to the previously-active element when the dialog closes.
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [won, lost]);

  const next = () => {
    if (forcedState) return;
    if (!won && !lost && !played.some(result=>result.word===word)) {
      arcade.answer(false);
      setPlayed(previous=>[...previous,{word,outcome:'lost',guesses:[...guessed],livesUsed:wrongCount,exerciseId:current.exerciseId,cluePL:maskAnswerInHint(current.clue_pl,current.word)}]);
      wrongAttemptsRef.current.push({questionId:word,studentAnswer:display.join(''),correctAnswer:word,explanationPL:current.clue_pl,exerciseId:current.exerciseId});
    }
    setRescueWord(''); setRescueMisses(0); setRescueMessage('');
    setPuzzleIdx((i) => (i + 1) % puzzleArr.length);
    setGuessed([]);
    setHintsUsed(0);
    setLifeFloater(null);
    setTrail(null);
  };

  // D3-Hangman (2026-05-02): fire onSessionComplete ONCE when every puzzle in
  // the deck has been played (won or lost). Counts unique words via the played
  // log — same dedupe key the existing right-rail "WORDS PLAYED" list uses.
  useEffect(() => {
    if (forcedState) return;
    if (sessionFiredRef.current) return;
    if (!onSessionComplete) return;
    const uniqueWords = new Set(played.map((r) => r.word));
    const deckWords = new Set(puzzleArr.map((p) => p.word));
    let coveredAll = true;
    for (const w of deckWords) if (!uniqueWords.has(w)) { coveredAll = false; break; }
    if (!coveredAll) return;
    sessionFiredRef.current = true;
    const correctCount = played.filter((r) => r.outcome === 'won').length;
    arcade.complete();
    onSessionComplete({
      correctCount,
      totalQuestions: puzzleArr.length,
      wrongAttempts: [...wrongAttemptsRef.current],
      puzzleDeck: puzzleArr,
      playedRecords: [...played],
    });
  }, [played, forcedState, onSessionComplete, puzzleArr]);

  const useHint = () => {
    if (won || lost || hintsUsed >= 2) return;
    const remaining = word.split('').filter((l) => !guessed.includes(l));
    if (!remaining.length) return;
    const letter = remaining[0];
    setGuessed((g) => [...g, letter]);
    setHintsUsed((h) => h + 1);
    setPulseLetter(letter);
    setTimeout(() => setPulseLetter(null), 800);
  };

  const rescue = () => {
    if(forcedState || won || lost || !rescueWord.trim()) return;
    const correct=rescueWord.trim().toUpperCase()===word.toUpperCase();
    arcade.answer(correct,200);
    if(correct){setGuessed([...new Set(word.split(''))]);setCorrectTick(t=>t+1);setRescueMessage('Word rescued!');}
    else{setRescueMisses(n=>n+1);setWrongTick(t=>t+1);setShake(true);setTimeout(()=>setShake(false),400);setRescueMessage('Not this word — two lanterns lost.');}
    setRescueWord('');
  };

  const bajlaMood: BajlaMood =
    won ? 'cheer' :
      lost ? 'think' :
        pulseLetter ? 'cheer' :
          shake ? 'think' :
            'idle';

  const skyByTime: Record<TimeOfDay, string> = {
    day: 'linear-gradient(180deg, #6E4FB8 0%, #C58BD9 60%, #FBBF24 100%)',
    dusk: 'linear-gradient(180deg, #2A1B45 0%, #6F3580 60%, #C57195 100%)',
    night: 'linear-gradient(180deg, #07041A 0%, #1F0E3A 60%, #4A1B5C 100%)',
  };

  const liveStatus = won
    ? `You won. The word was ${word}.`
    : lost
      ? `You lost. The word was ${word}.`
      : pulseLetter
        ? `Correct: ${pulseLetter}`
        : shake && wrongLetters.length > 0
          ? `Wrong letter. ${MAX_WRONG - wrongCount} lanterns remaining.`
          : '';

  // Layout: row/column rebalance.
  // Outer grid (≥1024px): 1fr scene + 240px right rail (pattern + words played)
  // Inner column: lantern row + slots + clue + keypad. All in flow, no
  // overlapping absolute-positioned elements competing for the same band.
  const showRightRail = true; // simple flag so the rail collapses below 1024 via CSS

  return (
    <div
      className="em-shell em-shell-hangman"
      role="application"
      aria-label="Hangman game, Lantern Alley"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <style>{`
        @keyframes em-hm-trail-fade {
          0% { stroke-opacity: 0; stroke-dashoffset: 200; }
          25% { stroke-opacity: 0.95; }
          100% { stroke-opacity: 0; stroke-dashoffset: 0; }
        }
        @keyframes em-hm-life-float {
          0% { transform: translate(-50%, 0); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translate(-50%, -28px); opacity: 0; }
        }
        @keyframes em-hm-lamp-flicker {
          0%, 100% { opacity: 0.85; }
          47% { opacity: 0.85; }
          48% { opacity: 0.55; }
          50% { opacity: 0.95; }
        }
        @keyframes em-hm-bubble-tail {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg); }
        }
        .em-hm-key:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #FBBF24, 0 0 0 4px rgba(251,191,36,0.35);
        }
        .em-hm-key:hover:not(:disabled) {
          filter: brightness(1.12);
        }
        .em-hm-key:active:not(:disabled) {
          transform: scale(0.94);
        }
        .em-hm-rail {
          width: 240px;
          flex-shrink: 0;
        }
        @media (max-width: 1023px) {
          /* !important is required: the rail has an inline display:flex that
             otherwise beats this rule, leaving it visible on mobile — it ate
             240px of the play column and pushed the 7-col keypad off-screen
             left (2026-06-05). Matches the .em-*-side pattern in Snake/Maze. */
          .em-hm-rail { display: none !important; }
          .em-hm-grid { padding-right: 24px !important; }
        }
        @media (max-width: 480px) {
          .em-hm-grid { padding: 88px 12px 12px 12px !important; }
          .em-hm-slots-rect { width: 44px !important; height: 60px !important; font-size: 28px !important; }
          .em-hm-slots-row { gap: 6px !important; }
          .em-hm-key { width: 40px !important; height: 44px !important; font-size: 13px !important; }
          .em-hm-bajla-perch { display: none !important; }
        }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {liveStatus}
      </div>

      {/* Sky + grain backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: skyByTime[time] }} />
      <div className="em-grain" style={{ position: 'absolute', inset: 0 }} />

      {/* Atmospheric scene chrome (decorative, pointer-events:none).
          Twin lamp posts + cross-rope + moon + skyline silhouette. Hidden
          when the 3D scene is on (Mike screenshot 2026-05-03 — the dashed
          cross-rope was slicing through the title subtitle). The 3D scene
          ships its own moon, skyline, and lantern rope. */}
      {!is3DEnabled && (
      <svg
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
      >
        {/* Moon — pushed to far right, tucked under the right rail */}
        <circle cx="700" cy="120" r="50" fill={time === 'night' ? '#A78BFA' : '#F4A989'} opacity={time === 'night' ? 0.28 : 0.32} />
        {/* Distant skyline silhouette — full width, anchors the scene */}
        <g opacity="0.32" fill="#0E0A1A">
          <rect x="0" y="430" width="120" height="170" />
          <rect x="120" y="380" width="80" height="220" />
          <rect x="280" y="450" width="70" height="150" />
          <rect x="350" y="420" width="50" height="180" />
          <rect x="500" y="440" width="60" height="160" />
          <rect x="560" y="410" width="80" height="190" />
          <rect x="650" y="400" width="60" height="200" />
          <rect x="710" y="370" width="90" height="230" />
        </g>
        {/* Cobblestone foreground hint */}
        <g opacity="0.18" fill="#0E0A1A">
          {Array.from({ length: 14 }).map((_, i) => (
            <ellipse key={i} cx={30 + i * 58} cy="585" rx="22" ry="6" />
          ))}
        </g>
        {/* LEFT lamp post — Bajla perches on its finial */}
        <g stroke="#0E0A1A" strokeWidth="2.5" fill="none">
          <line x1="92" y1="600" x2="92" y2="80" />
          <line x1="108" y1="600" x2="108" y2="80" />
          <rect x="88" y="50" width="24" height="30" fill="#0E0A1A" stroke="none" />
          {/* Finial dome where Bajla sits */}
          <ellipse cx="100" cy="50" rx="18" ry="6" fill="#0E0A1A" stroke="none" />
          {/* Lit lamp head */}
          <rect x="84" y="80" width="32" height="40" fill="#3A2855" />
          <circle cx="100" cy="100" r="8" fill="#FFE48A" opacity="0.85" style={{ animation: 'em-hm-lamp-flicker 4s ease-in-out infinite' }} />
        </g>
        {/* RIGHT lamp post — quieter, no perch */}
        <g stroke="#0E0A1A" strokeWidth="2.5" fill="none">
          <line x1="610" y1="600" x2="610" y2="120" />
          <line x1="626" y1="600" x2="626" y2="120" />
          <rect x="606" y="90" width="24" height="30" fill="#0E0A1A" stroke="none" />
          <rect x="602" y="120" width="32" height="40" fill="#3A2855" />
          <circle cx="618" cy="140" r="8" fill="#FFE48A" opacity="0.7" />
        </g>
        {/* Dashed clothesline strung between the posts */}
        <line x1="100" y1="50" x2="618" y2="90" stroke="#FBBF24" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.55" />
        {/* Decorative hanging mini-lanterns along the line */}
        {[0.22, 0.4, 0.58, 0.76].map((t, i) => {
          const x = 100 + (618 - 100) * t;
          const y = 50 + (90 - 50) * t + 18;
          return (
            <g key={i}>
              <line x1={x} y1={y - 18} x2={x} y2={y - 4} stroke="#FBBF24" strokeWidth="1" opacity="0.5" />
              <rect x={x - 5} y={y - 4} width="10" height="14" fill="#3A2855" stroke="#FBBF24" strokeWidth="1" />
              <circle cx={x} cy={y + 3} r="2.5" fill="#FFE48A" opacity="0.8" />
            </g>
          );
        })}
      </svg>
      )}

      {/* Bajla — perched on the LEFT lamp post finial, looking down-right
          into the play area. Speech direction implied by translate offset
          + a small triangle "speech tail" from her bubble pointing at the
          clue card region. (At ≤480px we hide the perch; she returns to
          inline inside the clue card on mobile via HintCard's inner Bajla.) */}
      {/* 2026-05-03 (Mike screenshot): perched-Bajla was meant to sit on the
          OLD lamp-post SVG. With the 3D scene now occupying the play column
          she just floats next to the title (Mike's "remaining bird at top").
          Hidden when 3D is on. */}
      {!is3DEnabled && (
      <div
        className="em-hm-bajla-perch"
        style={{
          position: 'absolute',
          left: 'calc((100% - 800px) / 2 + 60px)',
          top: 'min(8%, 80px)',
          zIndex: 4,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
        }}
      >
        <Bajla size={56} mood={bajlaMood} />
        <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" style={{ marginLeft: -6, marginTop: 18, opacity: 0.55 }}>
          <circle cx="6" cy="6" r="2" fill="#FBBF24" />
          <circle cx="18" cy="18" r="2.5" fill="#FBBF24" />
          <circle cx="30" cy="30" r="3" fill="#FBBF24" />
        </svg>
      </div>
      )}

      {/* Header — district nameplate + counters.
          Ricky 2026-05-03 (CD audit, HM-bug-2a): header used to overflow the
          viewport because Nameplate + Progress/Skip/Hint were inline-justified
          with no max-width and no wrap. Constrain to viewport, allow wrap,
          and bump zIndex above the lantern row so skip/hint can never visually
          collide with the lanterns below them. */}
      <div className="wa-hangman-header" style={{
        position: 'absolute', top: 24, left: 24, right: 24,
        maxWidth: 'calc(100% - 48px)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        flexWrap: 'wrap', zIndex: 6, gap: 12,
        overflowX: 'hidden',
      }}>
        <AmbientAudioPlayer shellSlug="hangman" />
        <div style={{ minWidth: 0, flex: '1 1 auto', maxWidth: '100%' }}>
          <Nameplate
            district="The Lantern Alley"
            subtitle="The Lantern Alley · Hangman · Wisielec"
            accent={accent}
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22">
                <line x1="11" y1="2" x2="11" y2="4" stroke={accent} strokeWidth="1.5" />
                <rect x="7" y="4" width="8" height="2" fill={accent} />
                <rect x="6" y="6" width="10" height="11" fill="none" stroke={accent} strokeWidth="1.5" />
                <rect x="6" y="17" width="10" height="2" fill={accent} />
                <circle cx="11" cy="11.5" r="2.2" fill={accent} opacity="0.8" />
              </svg>
            }
          />
        </div>
        <div className="wa-hangman-controls" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: '0 1 auto', minWidth: 0, maxWidth: '100%' }}>
          <Progress current={puzzleIdx + 1} total={puzzleArr.length} accent={accent} />
          <SkipButton onClick={next} />
          <HintButton onClick={useHint} used={hintsUsed} total={2} />
        </div>
      </div>

      {/* MAIN GRID — restructured flow. Two columns at ≥1024px:
          left = play column, right = pattern + words rail. */}
      <div
        className="em-hm-grid"
        style={{
          position: 'absolute',
          inset: 0,
          paddingTop: 88,         // clears header
          paddingBottom: 24,
          paddingLeft: 24,
          paddingRight: 24,
          display: 'flex',
          gap: 20,
          alignItems: 'stretch',
          justifyContent: 'center',
          zIndex: 2,
        }}
      >
        {/* PLAY COLUMN — slots → clue → keypad in vertical rhythm */}
        <div
          ref={surfaceRef}
          style={{
            flex: '1 1 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            minWidth: 0,
            position: 'relative',
            maxWidth: 720,
          }}
        >
          {/* 3D LANTERN ALLEY — first 3D shell pilot (Mike, 2026-05-03).
              Lazy-loaded, aria-hidden (the lives row below is the a11y
              canonical). Suspense fallback is a slim placeholder so the
              shell layout doesn't jump while the r3f chunk downloads. */}
          <WordSuspense fallback={<p>Opening the 3D district…</p>}><WordScene3D guessed={guessed} display={display} lives={MAX_WRONG-wrongCount} onGuess={guess} done={won||lost}/></WordSuspense>

          {/* LIVES ROW — only renders when 3D is OFF. The 3D lantern alley
              IS the canonical lives indicator when 3D is on; rendering both
              competes for visual hierarchy and was Mike's "looks terrible"
              critique on 2026-05-03. The aria-label still ships via a
              hidden announcer below for screen-reader users. */}
          {!is3DEnabled && (
          <div
            role="img"
            aria-label={`Lives remaining: ${MAX_WRONG - wrongCount} of ${MAX_WRONG}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              position: 'relative',
            }}
          >
            {/* Ricky 2026-05-03 (CD audit, HM-bug-2b): 6 × 28px lanterns +
                gaps were ~218px wide and never wrapped, so the rightmost
                lantern clipped on small viewports. Allow flex-wrap; the
                ≤480px media query already shrinks letter slots/keys, the
                lanterns now wrap into two rows when they truly can't fit. */}
            <div style={{ display: 'flex', gap: 10, position: 'relative', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' }}>
              {Array.from({ length: MAX_WRONG }).map((_, i) => {
                const alive = i < MAX_WRONG - wrongCount;
                const isJustExtinguished = lifeFloater?.lanternIdx === i;
                return (
                  <div key={i} style={{ position: 'relative', width: 28, height: 36 }}>
                    <svg viewBox="0 0 28 36" width="28" height="36" style={{ transition: 'opacity 320ms', opacity: alive ? 1 : 0.3 }}>
                      <line x1="14" y1="0" x2="14" y2="4" stroke="#FBBF24" strokeWidth="1" opacity="0.7" />
                      <rect x="8" y="4" width="12" height="3" fill="#0E0A1A" />
                      <rect x="4" y="7" width="20" height="22" fill={alive ? '#3A2855' : '#1A0E2A'} stroke={alive ? '#FBBF24' : '#3A2855'} strokeWidth="1.5" />
                      {alive
                        ? <circle cx="14" cy="18" r="5" fill="#FFE48A" opacity="0.9" />
                        : <line x1="4" y1="7" x2="24" y2="29" stroke="#FB7185" strokeWidth="1.5" />}
                      <rect x="6" y="29" width="16" height="3" fill="#0E0A1A" />
                    </svg>
                    {/* −1 LIFE floater above the lantern that just died */}
                    {isJustExtinguished && lifeFloater && (
                      <div
                        key={lifeFloater.id}
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: -22,
                          transform: 'translate(-50%, 0)',
                          fontFamily: 'var(--em-mono)',
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#FB7185',
                          letterSpacing: '0.1em',
                          whiteSpace: 'nowrap',
                          background: 'rgba(14,10,26,0.85)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          border: '1px solid #FB7185',
                          animation: 'em-hm-life-float 1.1s ease-out forwards',
                          pointerEvents: 'none',
                        }}
                      >
                        −1 LIFE · −1 ŻYCIE
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#FBBF24', opacity: 0.85 }}>
              PRÓBY · LIVES LEFT · {MAX_WRONG - wrongCount}/{MAX_WRONG}
            </div>
          </div>
          )}

          {/* Screen-reader announcer for lives — kept in DOM so screen
              readers always get the count regardless of 3D/2D rendering. */}
          {is3DEnabled && (
            <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              {`Lives remaining: ${MAX_WRONG - wrongCount} of ${MAX_WRONG}`}
            </div>
          )}

          {/* WORD SLOTS — LARGE letter plates. Pure HTML/flex (was SVG)
              so we can DOM-measure each slot for the cyan trail endpoints
              and they reflow naturally on narrow widths. */}
          <div
            className="em-hm-slots-row"
            style={{
              display: 'flex',
              gap: 10,
              justifyContent: 'center',
              flexWrap: 'wrap',
              padding: '8px 0',
              animation: shake ? 'em-shake 0.4s var(--em-ease)' : 'none',
            }}
          >
            {display.map((c, i) => {
              const isPulsing = c === pulseLetter;
              const filled = c !== '_';
              return (
                <div
                  key={i}
                  ref={(el) => {
                    if (el) slotRefs.current.set(i, el);
                    else slotRefs.current.delete(i);
                  }}
                  className="em-hm-slots-rect"
                  style={{
                    width: 56,
                    height: 76,
                    background: filled ? (isPulsing ? '#34D399' : '#FBBF24') : 'rgba(0,0,0,0.45)',
                    border: `2.5px solid ${filled ? '#0E0A1A' : '#FBBF24'}`,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Space Grotesk, var(--em-sans)',
                    fontWeight: 700,
                    fontSize: 36,
                    color: filled ? '#0E0A1A' : 'rgba(251,191,36,0.5)',
                    position: 'relative',
                    boxShadow: filled
                      ? 'inset 0 4px 0 rgba(0,0,0,0.18), inset 0 -4px 0 rgba(0,0,0,0.18), 0 4px 8px rgba(0,0,0,0.25)'
                      : 'inset 0 0 0 1px rgba(251,191,36,0.25)',
                    transition: 'all 280ms var(--em-ease)',
                    animation: isPulsing ? 'em-glow 0.6s var(--em-ease)' : 'none',
                  }}
                >
                  {filled ? c : (
                    <span style={{ fontFamily: 'JetBrains Mono, var(--em-mono)', fontSize: 16, opacity: 0.7 }}>?</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Centered HintCard + standalone <ExpandableInstructions> mount
              both removed 2026-05-03 (Mike directive — "the detailed
              instructions need to be a part of Bajla's more details and not
              standalone"). The chat-widget Bajla speech bubble is now the
              single instruction surface for every shell; the brief renders
              in DEFAULT state and the full HANGMAN_INSTRUCTIONS bilingual
              blocks render inside the bubble's DETAILED state. The
              em:shell-instruction broadcast useEffect above carries
              fullInstructions through CustomEvent.detail. */}

          {/* KEYPAD — full-width 7-col grid. 26 letters → 4 rows (7+7+7+5).
              Buttons 44×44 minimum (WCAG 2.5.5 Target Size). */}
          <div
            className="em-shell-keypad"
            role="group"
            aria-label="Letter keypad"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(44px, 1fr))',
              gap: 6,
              maxWidth: 520,
              margin: '0 auto',
              width: '100%',
              padding: '8px 0 0',
            }}
          >
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => {
              const used = guessed.includes(l);
              const right = used && word.includes(l);
              const wrong = used && !word.includes(l);
              const stateLabel = right ? 'correct' : wrong ? 'wrong' : 'unused';
              const bg = right
                ? '#0F5C40'
                : wrong
                  ? '#5C1830'
                  : '#1F1138';
              const fg = right ? '#D1FAE5' : wrong ? '#FECDD3' : '#F5F0FF';
              const border = right ? '#34D399' : wrong ? '#FB7185' : '#FBBF24';
              return (
                <button
                  key={l}
                  ref={(el) => {
                    if (el) keyRefs.current.set(l, el);
                    else keyRefs.current.delete(l);
                  }}
                  onClick={() => guess(l)}
                  disabled={used || won || lost}
                  aria-label={`Letter ${l}, ${stateLabel}`}
                  aria-pressed={used}
                  className="em-hm-key"
                  style={{
                    width: '100%',
                    minWidth: 44,
                    height: 44,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: bg,
                    color: fg,
                    border: `1.5px solid ${border}`,
                    fontFamily: 'var(--em-mono)',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: used ? 'default' : 'pointer',
                    opacity: used ? 0.85 : 1,
                    transition: 'all 180ms',
                    outline: 'none',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {l}
                  {wrong && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 22,
                        color: '#FB7185',
                        fontWeight: 900,
                        opacity: 0.5,
                        pointerEvents: 'none',
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="wa-hangman-rescue"><div className="wa-inline-tools"><input value={rescueWord} onChange={e=>setRescueWord(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();rescue();}}} aria-label="Rescue the whole word" placeholder="Know the whole word?" disabled={won||lost}/><button onClick={rescue} disabled={won||lost||!rescueWord.trim()}>Rescue word +200</button></div><p className="wa-forge-readout" role="status">{rescueMessage||'Optional rescue: a wrong full word costs 2 lanterns.'}</p></div>
          {/* CYAN TRAIL OVERLAY — absolute SVG sized to the play column.
              Strokes fade out 450ms; pointer-events:none so it never
              intercepts clicks on slots or keys below it. */}
          {trail && trail.paths.length > 0 && (
            <svg
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 5,
              }}
            >
              {trail.paths.map((p, i) => (
                <line
                  key={`${trail.id}-${i}`}
                  x1={p.x1}
                  y1={p.y1}
                  x2={p.x2}
                  y2={p.y2}
                  stroke={cyan}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="200"
                  style={{
                    animation: 'em-hm-trail-fade 450ms ease-out forwards',
                    filter: `drop-shadow(0 0 4px ${cyan})`,
                  }}
                />
              ))}
            </svg>
          )}
        </div>

        {/* RIGHT RAIL — pattern card + words played list. Justifies the
            right-side void (#8) and adds pedagogical context. Hidden on
            <1024px viewports via the media query above. */}
        {showRightRail && (
          <aside
            className="em-hm-rail"
            aria-label="Lantern Alley side panel"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              alignSelf: 'stretch',
            }}
          >
            {/* POLISH-TRANSFER PATTERN card — explains why this word's
                pattern can be tricky. Static framing for now (drives off
                word length / vowel count); content scheduler (#21 Phase 2)
                will swap in inference-driven copy per keyword later. */}
            <div style={{
              background: 'rgba(14,10,26,0.6)',
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(251,191,36,0.3)',
              borderRadius: 14,
              padding: '14px 14px 16px',
            }}>
              <div className="em-eyebrow" style={{ color: accent, marginBottom: 6, fontSize: 9, letterSpacing: '0.2em' }}>
                WZORZEC · PATTERN
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--em-text)', marginBottom: 6 }}>
                {word.length} letters. {countVowels(word)} vowel{countVowels(word) === 1 ? '' : 's'}, {word.length - countVowels(word)} consonant{(word.length - countVowels(word)) === 1 ? '' : 's'}.
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--em-text-muted)' }}>
                🇵🇱 Zacznij od samogłosek (A, E, I, O, U) — to najszybszy sposób ujawnienia szkieletu słowa.
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--em-text-muted)', marginTop: 4 }}>
                Start with the vowels — the fastest way to reveal a word's skeleton.
              </div>
            </div>

            {/* WORDS PLAYED · DZIŚ ZAGRANE list */}
            <div style={{
              background: 'rgba(14,10,26,0.6)',
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(251,191,36,0.18)',
              borderRadius: 14,
              padding: '14px 14px 12px',
              flex: '1 1 auto',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div className="em-eyebrow" style={{ color: accent, marginBottom: 8, fontSize: 9, letterSpacing: '0.2em' }}>
                DZIŚ ZAGRANE · WORDS PLAYED
              </div>
              {played.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--em-text-muted)', lineHeight: 1.5 }}>
                  Lista pojawi się po pierwszym słowie.<br />
                  Your played words show up here.
                </div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'auto' }}>
                  {played.slice().reverse().map((rec, i) => (
                    <li key={`${rec.word}-${i}`} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '4px 8px',
                      borderRadius: 6,
                      background: rec.outcome === 'won' ? 'rgba(52,211,153,0.12)' : 'rgba(251,113,133,0.12)',
                      border: `1px solid ${rec.outcome === 'won' ? 'rgba(52,211,153,0.35)' : 'rgba(251,113,133,0.35)'}`,
                      fontFamily: 'var(--em-mono)',
                      fontSize: 11,
                    }}>
                      <span style={{ color: 'var(--em-text)', letterSpacing: '0.05em' }}>{rec.word}</span>
                      <span style={{
                        color: rec.outcome === 'won' ? '#34D399' : '#FB7185',
                        fontWeight: 700,
                        fontSize: 10,
                      }}>
                        {rec.outcome === 'won' ? '✓ LIT' : '✗ DARK'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        )}
      </div>

      <Confetti show={won} />

      {/* D3-Hangman (2026-05-02): suppress the per-puzzle dialog when the
          host is wired for review AND every puzzle in the deck has now been
          played (the host's <PracticeReview> overlay takes over the completion
          experience). For mid-deck wins/losses we still surface the dialog
          so the player can advance to the next lantern. */}
      {(won || lost) && !(onSessionComplete && played.length >= puzzleArr.length) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-live="assertive"
          aria-labelledby="em-gameover-title"
          className="em-gameover-dialog"
          style={{
            position: 'absolute', inset: 0,
            background: won
              ? 'radial-gradient(ellipse at center, rgba(52,211,153,0.2), rgba(14,10,26,0.85))'
              : 'radial-gradient(ellipse at center, rgba(251,113,133,0.18), rgba(14,10,26,0.9))',
            backdropFilter: 'blur(2px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
            animation: 'em-rise 0.5s var(--em-ease)',
            zIndex: 10,
          }}
        >
          <Bajla size={84} mood={won ? 'cheer' : 'think'} decorative />
          <div id="em-gameover-title" className="em-decor" style={{ fontSize: 38, color: 'var(--em-text)' }}>
            {won ? 'The lanterns are lit.' : 'The alley went dark.'}
          </div>
          <div style={{ color: 'var(--em-text-muted)', fontFamily: 'var(--em-mono)', fontSize: 11, letterSpacing: '0.2em' }}>
            {won ? `${word} · LIT` : `THE WORD WAS · ${word}`}
          </div>
          <button
            ref={tryAgainBtnRef}
            className="em-btn em-btn-primary"
            onClick={next}
            style={{ marginTop: 8 }}
          >
            {won ? 'Next lantern →' : 'Try a new word →'}
          </button>
        </div>
      )}
    </div>
  );
};

// Small util — vowel counter for the side-rail pattern card.
function countVowels(w: string): number {
  return (w.match(/[AEIOU]/gi) || []).length;
}

export default HangmanShell;
