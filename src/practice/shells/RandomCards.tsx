// RandomCards — "The Dealer's Table" district.
// A felt-topped card table with a brass card-shoe at the back. Player taps the
// shoe; a card flies out, lands on the felt, and shows its question. Pick
// the right option, the card slides to the won-pile; pick wrong and it slides
// to the discard. Then the deck reshuffles audibly (visually) and the next
// card flies.
//
// Visual identity: cards are constantly in motion. The shoe is a fixed point
// on the right; the discard a fixed point on the left; the active card is
// center-stage. The reshuffle effect (cards fanning, snapping back) is the
// signature beat between rounds.
//
// Persisted progress — Convex-backed.
import { useShellProgress } from '../lib/convex-stubs';
import '../styles/shells/randomcards.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bajla,
  HintCard,
  Progress,
  Nameplate,
  SkipButton,
  HintButton,
  Confetti,
  useEndOfShellTip,
} from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 (CD audit §4): expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components';

// Dealer's Table · Random Cards — full bilingual instruction copy.
const RANDOMCARDS_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A felt-topped table with a brass card-shoe waits at the start of each round.',
      'Tap the SHOE to draw a random card; it flies out and lands in the centre of the table showing its question.',
      'Pick the right option to score — your card slides to the WON pile; pick wrong and it slides to the DISCARD.',
      'After each card, the deck reshuffles audibly and the next card flies — keep drawing until the shoe is empty.',
    ],
    pl: [
      'Filcowy stół z brązowym pojemnikiem na karty czeka na początku każdej rundy.',
      'Stuknij SHOE, aby losować kartę; wylatuje ona i ląduje na środku stołu, pokazując pytanie.',
      'Wybierz właściwą opcję, aby zdobyć punkt — Twoja karta przesuwa się na stos WYGRANE; błąd przesuwa kartę na stos ODRZUCENIA.',
      'Po każdej karcie talia tasuje się słyszalnie, a następna karta wylatuje — losuj, aż „shoe" się opróżni.',
    ],
  },
  controls: {
    en: [
      'Brass card-shoe (right): tap to deal the next random card.',
      'Active card (centre): the question + 3–4 chip options for this round.',
      'WON pile (left of centre): face-up cards you answered correctly.',
      'DISCARD pile (far left): face-down cards you answered wrong or skipped.',
      'Skip + Hint buttons: Skip slides the card to discard, Hint greys one wrong option.',
    ],
    pl: [
      'Brązowy „shoe" (prawa): stuknij, aby rozdać następną losową kartę.',
      'Aktywna karta (środek): pytanie + 3–4 karty opcji dla tej rundy.',
      'Stos WYGRANE (na lewo od środka): odkryte karty, na które odpowiedziałeś poprawnie.',
      'Stos ODRZUCENIA (skrajnie lewy): zakryte karty błędne lub pominięte.',
      'Przyciski Pomiń i Podpowiedź: Pomiń przesuwa kartę do odrzuceń, Podpowiedź wyszarza jedną błędną opcję.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right pick: ✓ green flash, card slides to WON pile, +1 to your tally, deck reshuffles for next draw.',
      'Wrong pick: ✗ rose flash, card slides to DISCARD, correct option highlights green so you see what you missed.',
      'Skip: counts as wrong — card slides to DISCARD without a pick, deck reshuffles.',
      'You cannot re-draw the same card — once dealt, it stays in WON or DISCARD; the deck shrinks each round.',
    ],
    pl: [
      'Trafienie: ✓ zielony błysk, karta przesuwa się na stos WYGRANE, +1 do wyniku, talia tasuje się do następnego losowania.',
      'Błąd: ✗ różowy błysk, karta przesuwa się do ODRZUCENIA, poprawna opcja podświetla się na zielono.',
      'Pomiń: liczy się jako błąd — karta idzie do ODRZUCENIA bez wyboru, talia się tasuje.',
      'Nie możesz wylosować tej samej karty — raz rozdana, zostaje w WYGRANYCH lub ODRZUCENIU; talia kurczy się z każdą rundą.',
    ],
  },
  hintMechanic: {
    en:
      'You have 3 hints per session. Each tap greys out one wrong option on the active card. Save them for cards where two options look equally plausible — the random-deck pacing makes wrong picks expensive.',
    pl:
      'Masz 3 podpowiedzi na sesję. Każde stuknięcie wyszarza jedną błędną opcję na aktywnej karcie. Zachowaj je na karty, w których dwie opcje wyglądają równie prawdopodobnie — losowy rytm talii sprawia, że błędy bolą.',
  },
  scoring: {
    en:
      'Skip counts as wrong. Each correct draw builds your session streak. Drawing every card from the shoe unlocks the post-shell review with explanations of any wrong picks.',
    pl:
      'Pomiń liczy się jako błąd. Każde poprawne losowanie buduje serię w sesji. Wylosowanie wszystkich kart ze „shoe" odblokowuje przegląd po sesji z wyjaśnieniami błędów.',
  },
  l1Pattern: {
    en:
      'Random-recall drill. Polish learners often perform well on predictable practice but stumble on context-switching; the random deal forces decontextualised recall — the way English shows up in real conversation.',
    pl:
      'Trening losowego przypominania. Polscy uczniowie radzą sobie dobrze w przewidywalnych ćwiczeniach, ale gubią się przy zmianie kontekstu; losowe rozdanie wymusza przypominanie pozakontekstowe — tak, jak angielski pojawia się w prawdziwej rozmowie.',
  },
};

export interface WrapperRound {
  id: string; prompt: string; options: string[]; answerIndex: number;
  hint: string; hint_pl: string; exerciseId?: string;
}
export interface WrapperPuzzle { rounds: WrapperRound[]; }

export type RandomCardsForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface RandomCardsShellProps {
  time?: TimeOfDay;
  state?: RandomCardsForcedState;
  puzzle?: WrapperPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /** D3-RandomCards (Ricky wave-4, 2026-05-02): per-card review payload. */
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
    puzzle: WrapperPuzzle;
  }) => void;
}

const RC_DEMO: WrapperPuzzle = {
  rounds: [
    { id: 'dealer', prompt: 'The person who deals the cards is the ___.', options: ['guest', 'host', 'dealer', 'player'], answerIndex: 2, hint: 'They run the table.', hint_pl: 'Po polsku: krupier.' },
    { id: 'shuffle', prompt: 'To mix cards before dealing is to ___ them.', options: ['fold', 'cut', 'shuffle', 'stack'], answerIndex: 2, hint: 'Hands of cards interlocking.', hint_pl: 'Po polsku: tasować.' },
    { id: 'bet', prompt: 'Money you risk on a hand is your ___.', options: ['tip', 'bet', 'fee', 'fare'], answerIndex: 1, hint: 'Three letters.', hint_pl: 'Po polsku: zakład.' },
    { id: 'chip', prompt: 'A small round token used instead of cash is a ___.', options: ['coin', 'chip', 'shell', 'tile'], answerIndex: 1, hint: 'Stacks of them by colour.', hint_pl: 'Po polsku: żeton.' },
    { id: 'draw', prompt: 'To take a card from the deck is to ___ a card.', options: ['lose', 'draw', 'play', 'spend'], answerIndex: 1, hint: 'Same word as "to draw a picture."', hint_pl: 'Po polsku: dobrać kartę.' },
    { id: 'fold', prompt: 'To give up your hand without playing is to ___.', options: ['fold', 'call', 'raise', 'bluff'], answerIndex: 0, hint: 'You set your cards face-down.', hint_pl: 'Po polsku: spasować.' },
    { id: 'house', prompt: 'In a casino, the casino itself is called the ___.', options: ['ring', 'house', 'cellar', 'wheel'], answerIndex: 1, hint: '"The ___ always wins."', hint_pl: 'Po polsku: kasyno.' },
    { id: 'ace', prompt: 'The card with one pip is the ___.', options: ['king', 'jack', 'queen', 'ace'], answerIndex: 3, hint: 'Often the highest card.', hint_pl: 'Po polsku: as.' },
  ],
};

const ACCENT = '#FB7185';

// ─────────────────────────────────────────────────────────────────────────
// renderRandomCardsReviewItem — per-card locked render for PracticeReview.
// Dealer-style scoreboard row: card number + question + dealt options +
// student's pick + correct answer.
// ─────────────────────────────────────────────────────────────────────────
const RC_REVIEW_ACCENT = '#FB7185';
export function renderRandomCardsReviewItem(
  round: WrapperRound,
  cardNumber: number,
  studentAnswer: string | undefined,
): React.ReactNode {
  const correct = round.options[round.answerIndex];
  const stu = studentAnswer ?? '';
  const isWrong = stu.length > 0 && stu !== correct;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: isWrong
        ? 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(52,211,153,0.08), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(52,211,153,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 4,
          background: `${RC_REVIEW_ACCENT}22`, color: RC_REVIEW_ACCENT,
          border: `1px solid ${RC_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          CARD {String(cardNumber).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(52,211,153,0.18)',
          color: isWrong ? '#FB7185' : '#34D399',
        }}>
          {isWrong ? '✗ LOST · PRZEGRANA' : '✓ WON · WYGRANA'}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--em-decor)', fontSize: 16, lineHeight: 1.3,
        color: 'var(--em-text, #EDE6FF)',
      }}>{round.prompt}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {round.options.map((opt, oi) => {
          const isCorrect = oi === round.answerIndex;
          const wasPicked = stu === opt;
          const showCorrect = isCorrect;
          const showWrong = wasPicked && !isCorrect;
          return (
            <div key={oi} style={{
              padding: '8px 12px', borderRadius: 6,
              background: showCorrect
                ? 'rgba(52,211,153,0.18)'
                : showWrong
                  ? 'rgba(251,113,133,0.18)'
                  : 'rgba(245,239,255,0.04)',
              border: `1px solid ${showCorrect ? '#34D39988' : showWrong ? '#FB718588' : 'rgba(245,239,255,0.1)'}`,
              color: showCorrect ? '#34D399' : showWrong ? '#FB7185' : 'var(--em-text, #EDE6FF)',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
            }}>
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

type Phase = 'shoe' | 'reveal' | 'verdict';

export const RandomCardsShell: React.FC<RandomCardsShellProps> = ({
  time = 'night',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  // Kelly Tier-2 (2026-05-02): defensive props guard.
  const propsInvalid = !forcedState && puzzle !== undefined && (!puzzle.rounds || puzzle.rounds.length === 0);
  const active: WrapperPuzzle = puzzle && puzzle.rounds.length > 0 ? puzzle : RC_DEMO;
  const persisted = useShellProgress('randomcards');

  // Kelly Tier-2 (2026-05-02): JS-side prefers-reduced-motion gate. The CSS
  // @media rule freezes keyframes, but our `drawCard` setTimeout (520 ms
  // shuffle pause) and verdict-advance setTimeout (1500 ms) are JS-driven
  // delays that visually depend on the now-frozen animations. With
  // motion-reduce on we collapse the shuffle pause to 0 (cards just appear)
  // — the verdict pause stays so the player can read the result.
  const reducedMotionRef = useRef<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'randomcards',
      brief: 'Tap the shoe to draw a card; pick the right option to win it.',
      brief_pl: 'Stuknij shoe, aby losować kartę; wybierz właściwą opcję, by ją wygrać.',
      detail: 'You are at the dealer\'s table. Tap the brass card shoe to draw a random card; the card carries a question and answer chips. Pick the right one and you win the card; pick wrong and the dealer takes it. Play through the deck to clear the table.',
      detail_pl: 'Jesteś przy stole krupiera. Stuknij brązowy „shoe", aby wylosować kartę; karta ma pytanie i kafelki z odpowiedziami. Wybierz dobrą i wygrywasz kartę; źle — krupier ją bierze. Rozegraj całą talię, aby zamknąć stół.',
      fullInstructions: RANDOMCARDS_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  const [idx, setIdx] = useState<number>(0);
  const [phase, setPhase] = useState<Phase>('shoe');
  const [picked, setPicked] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  const [score, setScore] = useState<{ right: number; wrong: number }>({ right: 0, wrong: 0 });
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [revealedHint, setRevealedHint] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>('');
  // Reshuffle visual flag — drives the brief fan-then-snap animation between rounds.
  const [shuffling, setShuffling] = useState<boolean>(false);
  // Kelly Tier-2 (2026-05-02): focus-trap refs for the completion overlay.
  const tryAnotherBtnRef = useRef<HTMLButtonElement | null>(null);
  const nextDistrictBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const completed = !forcedState && idx >= active.rounds.length;

  const tip = useEndOfShellTip({
    onWrongAnswer,
    completed,
    forcedState,
    onSessionComplete: onSessionComplete ? ({ wrongAttempts }) => {
      onSessionComplete({
        correctCount: score.right,
        totalQuestions: active.rounds.length,
        wrongAttempts,
        puzzle: active,
      });
    } : undefined,
  });
  const round = active.rounds[idx];

  useEffect(() => {
    if (forcedState) return;
    const total = active.rounds.length;
    persisted.save({ progress: idx / total, lastState: idx >= total ? 'complete' : 'active' });
    if (idx >= total) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [idx, forcedState, active.rounds.length]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty')   { setIdx(0); setPhase('shoe'); setPicked(null); setVerdict(null); setScore({ right: 0, wrong: 0 }); }
    if (forcedState === 'active')  { setIdx(0); setPhase('reveal'); setPicked(null); setVerdict(null); }
    if (forcedState === 'correct') { setIdx(1); setPhase('verdict'); setPicked(active.rounds[1].answerIndex); setVerdict('right'); }
    if (forcedState === 'wrong')   { setIdx(1); setPhase('verdict'); setPicked((active.rounds[1].answerIndex + 1) % active.rounds[1].options.length); setVerdict('wrong'); }
    if (forcedState === 'complete'){ setIdx(active.rounds.length); }
  }, [forcedState, active.rounds]);

  const drawCard = (): void => {
    if (forcedState || phase !== 'shoe') return;
    setShuffling(true);
    setAnnouncement('Dealing.');
    // Kelly Tier-2 (2026-05-02): collapse the shuffle pause to ~instant when
    // motion-reduce is on (the underlying CSS keyframe is already frozen by
    // the global @media rule, so a 520 ms pause would just be dead time).
    const delay = reducedMotionRef.current ? 0 : 520;
    setTimeout(() => {
      setShuffling(false);
      setPhase('reveal');
    }, delay);
  };

  const onPick = (i: number): void => {
    if (forcedState || phase !== 'reveal' || !round) return;
    setPicked(i);
    setPhase('verdict');
    const right = i === round.answerIndex;
    setVerdict(right ? 'right' : 'wrong');
    setAnnouncement(right ? 'Correct.' : `Wrong. The card was ${round.options[round.answerIndex]}.`);
    if (right) setScore((s) => ({ ...s, right: s.right + 1 }));
    else {
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
      tip.recordWrong({
        questionId: round.id,
        studentAnswer: round.options[i],
        correctAnswer: round.options[round.answerIndex],
        explanationPL: round.hint_pl,
        exerciseId: round.exerciseId,
      });
    }
  };

  // After verdict, brief pause then re-shuffle and serve next.
  useEffect(() => {
    if (forcedState) return;
    if (phase !== 'verdict') return;
    const t = setTimeout(() => {
      setIdx((i) => i + 1);
      setPicked(null);
      setVerdict(null);
      setRevealedHint(false);
      setPhase('shoe');
    }, 1500);
    return () => clearTimeout(t);
  }, [phase, forcedState]);

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 2 || !round) return;
    setHintsUsed((h) => h + 1);
    setRevealedHint(true);
  };

  const reset = (): void => {
    setIdx(0); setPhase('shoe'); setPicked(null); setVerdict(null);
    setScore({ right: 0, wrong: 0 }); setHintsUsed(0); setRevealedHint(false);
    tip.reset();
  };

  // Kelly Tier-2 (2026-05-02): focus-trap effect for the completion overlay.
  useEffect(() => {
    if (!completed) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const focusId = window.setTimeout(() => { nextDistrictBtnRef.current?.focus(); }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusables = [tryAnotherBtnRef.current, nextDistrictBtnRef.current].filter(Boolean) as HTMLButtonElement[];
        if (focusables.length === 0) return;
        const i = focusables.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        if (e.shiftKey) {
          const next2 = i <= 0 ? focusables[focusables.length - 1] : focusables[i - 1];
          next2.focus();
        } else {
          const next2 = i === -1 || i >= focusables.length - 1 ? focusables[0] : focusables[i + 1];
          next2.focus();
        }
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      window.clearTimeout(focusId);
      document.removeEventListener('keydown', trap);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [completed]);

  const grad = time === 'day'
    ? 'radial-gradient(ellipse at 50% 60%, #2D6A4F 0%, #14342B 60%, #08160F 100%)'
    : 'radial-gradient(ellipse at 50% 60%, #1F4836 0%, #0E251A 60%, #02080A 100%)';

  // Stack of cards for the deck — purely cosmetic, count fixed visually.
  const deckStack = useMemo(() => Array.from({ length: 5 }, (_, i) => i), []);

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return (
    <div
      className="em-shell em-shell-randomcards em-rc-felt"
      role="application"
      aria-label="Random Cards, The Dealer's Table"
      tabIndex={0}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: grad }}
    >
      {/* Shell-scoped keyframes → src/practice/styles/shells/randomcards.css */}

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      {/* Felt grain */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, opacity: 0.5,
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '4px 4px', pointerEvents: 'none',
        animation: 'em-rc-felt-shimmer 6s ease-in-out infinite',
      }} />
      {/* Felt edge ring */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '14%', left: '8%', right: '8%', bottom: '14%',
        borderRadius: '50%', border: `2px solid ${ACCENT}33`,
        boxShadow: `inset 0 0 60px ${ACCENT}1a`, pointerEvents: 'none',
      }} />

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 28, left: 28, right: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 6, gap: 12, flexWrap: 'wrap' }}>
        <AmbientAudioPlayer shellSlug="randomcards" />
        <Nameplate
          district="The Dealer's Table"
          subtitle="Random Cards · Karty losowe · the shoe never sleeps"
          accent={ACCENT}
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="4" y="3" width="10" height="14" rx="1.5" stroke={ACCENT} strokeWidth="1.6" transform="rotate(-8 9 10)" /><rect x="8" y="5" width="10" height="14" rx="1.5" stroke={ACCENT} strokeWidth="1.6" transform="rotate(8 13 12)" /></svg>}
        />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="em-eyebrow" style={{ color: '#34D399' }}>WON {String(score.right).padStart(2, '0')}</div>
          <div className="em-eyebrow" style={{ color: '#FB7185' }}>LOST {String(score.wrong).padStart(2, '0')}</div>
          <Progress current={Math.min(idx, active.rounds.length)} total={active.rounds.length} accent={ACCENT} />
          <SkipButton onClick={() => { if (phase === 'reveal') { setPhase('verdict'); setVerdict(null); setIdx((i) => i + 1); setPhase('shoe'); } }} />
          <HintButton onClick={useHint} used={hintsUsed} total={2} />
        </div>
      </div>

      {/* Discard pile — left.
          Ricky 2026-05-02 (#15 audit pass): aria-hidden cosmetic decoration.
          Was missing pointerEvents:none — at narrow viewports (375/414) the
          left:60 width:90 box could push under the active card / answer
          chips at left ~50%. Now non-blocking + hidden under 480px so the
          center card has the full canvas. Same fix for the WON pile on the
          right (which was also crowding the brass card-shoe at right:80). */}
      <div aria-hidden="true" className="em-rc-pile em-rc-pile-discard" style={{ position: 'absolute', left: 60, top: '40%', zIndex: 1, pointerEvents: 'none' }}>
        <div style={{
          width: 90, height: 130, borderRadius: 8,
          background: 'repeating-linear-gradient(45deg, #2A0E36 0 6px, #1F0E40 6px 12px)',
          border: '1px solid #5C3A2A', boxShadow: '0 6px 14px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0.45, transform: 'rotate(-8deg)',
        }}>
          <span className="em-eyebrow" style={{ color: '#FB7185' }}>DISCARD</span>
        </div>
      </div>

      {/* Won pile — right */}
      <div aria-hidden="true" className="em-rc-pile em-rc-pile-won" style={{ position: 'absolute', right: 60, top: '40%', zIndex: 1, pointerEvents: 'none' }}>
        <div style={{
          width: 90, height: 130, borderRadius: 8,
          background: 'linear-gradient(135deg, #34D399 0%, #1B8060 100%)',
          border: '1px solid rgba(255,255,255,0.25)',
          boxShadow: `0 6px 14px rgba(0,0,0,0.5), 0 0 18px #34D39955`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0.55, transform: 'rotate(6deg)',
        }}>
          <span className="em-eyebrow" style={{ color: '#0E2A1F' }}>WON</span>
        </div>
      </div>
      <style>{`
        @media (max-width: 480px) {
          .em-rc-pile { display: none; }
        }
      `}</style>

      {/* The card-shoe — back-right of the felt */}
      <div style={{ position: 'absolute', top: 110, right: 80, zIndex: 4 }}>
        <button
          type="button"
          onClick={drawCard}
          disabled={!!forcedState || phase !== 'shoe' || completed}
          aria-label={phase === 'shoe' ? 'Draw a card from the shoe' : 'Card in play'}
          style={{
            position: 'relative', width: 130, height: 170, padding: 0,
            background: 'linear-gradient(180deg, #B58943 0%, #6F4818 100%)',
            border: '2px solid #3A2410', borderRadius: 12,
            cursor: phase === 'shoe' && !completed ? 'pointer' : 'default',
            animation: phase === 'shoe' && !completed ? 'em-rc-shoe-pulse 2.4s ease-in-out infinite' : 'none',
          }}
        >
          <div className="em-eyebrow" style={{ position: 'absolute', top: 10, left: 0, right: 0, color: '#FBBF24' }}>BRASS SHOE</div>
          {/* Stack of card edges visible inside the shoe */}
          <div style={{ position: 'absolute', top: 32, left: 12, right: 12, bottom: 24, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {deckStack.map((i) => (
              <div key={i} style={{
                height: 12, borderRadius: 2,
                background: 'repeating-linear-gradient(90deg, #2A0E36 0 4px, #1F0E40 4px 8px)',
                border: '1px solid rgba(0,0,0,0.4)',
                animation: shuffling ? `em-rc-shuffle-fan 0.5s ease-in-out ${i * 0.04}s` : 'none',
              }} />
            ))}
          </div>
          <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, fontFamily: 'var(--em-mono)', fontSize: 9, color: '#FBBF24', letterSpacing: '0.2em' }}>
            {phase === 'shoe' && !completed ? 'TAP · STUKNIJ' : '•••'}
          </div>
        </button>
      </div>

      {/* Center stage — the active card + answer rail */}
      {!completed && round && phase !== 'shoe' && (
        <div style={{
          position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, zIndex: 5,
        }}>
          {/* The card */}
          <div
            key={idx}
            style={{
              width: 280, minHeight: 200, padding: 22,
              background: 'linear-gradient(180deg, #F4EFEF 0%, #DCD2D2 100%)',
              border: `2px solid ${verdict === 'right' ? '#34D399' : verdict === 'wrong' ? '#FB7185' : '#3A2410'}`,
              borderRadius: 12, color: '#1F0E40',
              boxShadow: `0 18px 36px rgba(0,0,0,0.5), 0 0 ${verdict ? '24px' : '0'} ${verdict === 'right' ? '#34D399aa' : verdict === 'wrong' ? '#FB7185aa' : 'transparent'}`,
              animation: verdict === 'right'
                ? 'em-rc-card-win 0.9s var(--em-ease) 0.4s forwards'
                : verdict === 'wrong'
                  ? 'em-rc-card-discard 0.9s var(--em-ease) 0.4s forwards'
                  : 'em-rc-card-fly 0.55s var(--em-ease) both',
              transformStyle: 'preserve-3d', perspective: 800,
            }}
          >
            {/* Suit pip top-left */}
            <div className="em-eyebrow" style={{ position: 'absolute', top: 10, left: 14, color: ACCENT, letterSpacing: '0.2em' }}>♠ {String(idx + 1).padStart(2, '0')}</div>
            <div className="em-eyebrow" style={{ position: 'absolute', bottom: 10, right: 14, color: ACCENT, letterSpacing: '0.2em', transform: 'rotate(180deg)' }}>♠ {String(idx + 1).padStart(2, '0')}</div>
            <div className="em-decor" style={{ fontSize: 18, lineHeight: 1.35, marginTop: 18, textAlign: 'center' }}>{round.prompt}</div>
            {revealedHint && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#7A5A2A', fontStyle: 'italic', textAlign: 'center' }}>
                💡 {round.hint}
              </div>
            )}
          </div>

          {/* Answer chips — small, in a fan below */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {round.options.map((opt, i) => {
              const isPicked = picked === i;
              const isAnswer = i === round.answerIndex;
              const showRight = verdict !== null && isAnswer;
              const showWrong = verdict === 'wrong' && isPicked && !isAnswer;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPick(i)}
                  disabled={!!forcedState || phase !== 'reveal'}
                  aria-label={`Bet on ${opt}`}
                  style={{
                    minWidth: 80, padding: '12px 18px', minHeight: 44,
                    background: showRight
                      ? 'linear-gradient(180deg, #34D399, #1B8060)'
                      : showWrong
                        ? 'linear-gradient(180deg, #FB7185, #BE3A4F)'
                        : isPicked
                          ? `linear-gradient(180deg, ${ACCENT}, #BE3A4F)`
                          : 'linear-gradient(180deg, rgba(244,239,239,0.95), rgba(220,210,210,0.95))',
                    color: showRight || showWrong || isPicked ? '#0E0A1A' : '#1F0E40',
                    border: '2px solid rgba(0,0,0,0.4)', borderRadius: '50%',
                    fontFamily: 'var(--em-decor)', fontSize: 14,
                    cursor: phase === 'reveal' ? 'pointer' : 'default',
                    boxShadow: '0 6px 14px rgba(0,0,0,0.5), inset 0 -3px 6px rgba(0,0,0,0.2)',
                    transition: 'all 220ms var(--em-ease)',
                    transform: isPicked ? 'translateY(-3px)' : 'translateY(0)',
                  }}
                >{opt}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* Instructions modal only — HintCard + standalone Bajla removed
          2026-05-03; chat-widget speech bubble carries the brief. */}
      {!completed && (
        <div style={{ position: 'absolute', bottom: 28, left: 28, maxWidth: 360, zIndex: 5 }}>
        </div>
      )}

      {/* Completion */}
      {completed && !onSessionComplete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-live="assertive"
          aria-label="Dealer's Table complete"
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse, ${ACCENT}22, rgba(14,10,26,0.62))`,
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
            animation: 'em-rise 0.4s var(--em-ease)', zIndex: 10,
          }}
        >
          <Bajla size={84} mood="cheer" decorative />
          <div className="em-decor" style={{ fontSize: 38, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>Last card. House closes.</div>
          <div className="em-eyebrow">DEALER OUT · KRUPIER WYCHODZI</div>
          <div style={{ display: 'flex', gap: 28, alignItems: 'baseline' }}>
            <div style={{ textAlign: 'center' }}><div className="em-decor" style={{ fontSize: 44, color: '#34D399' }}>{score.right}</div><div className="em-eyebrow" style={{ color: '#34D399' }}>WON</div></div>
            <div style={{ textAlign: 'center' }}><div className="em-decor" style={{ fontSize: 44, color: '#FB7185' }}>{score.wrong}</div><div className="em-eyebrow" style={{ color: '#FB7185' }}>LOST</div></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button ref={tryAnotherBtnRef} type="button" className="em-btn em-btn-ghost" onClick={reset}>Try another</button>
            <button ref={nextDistrictBtnRef} type="button" className="em-btn em-btn-primary" onClick={reset}>Next district →</button>
          </div>
        </div>
      )}
      <Confetti show={completed} />
    </div>
  );
};

export default RandomCardsShell;
