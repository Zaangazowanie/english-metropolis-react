import { ChallengeArena, useChallengeArcade } from './challenge-arcade';
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
  const arcade = useChallengeArcade();
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
      brief: "Deal a card, read the challenge and choose its answer.",
      brief_pl: "Rozdaj kartę, przeczytaj wyzwanie i wybierz odpowiedź.",
      detail: "Deal a card, read the challenge and choose its answer. Correct answers join your winning hand. Use a boost before answering for double points. The answer stays visible until you choose Next challenge, then deal another card.",
      detail_pl: "Rozdaj kartę, przeczytaj wyzwanie i wybierz odpowiedź. Poprawne odpowiedzi trafiają do wygranej puli. Włącz premię przed odpowiedzią. Odpowiedź pozostaje widoczna, aż wybierzesz Dalej. Następnie rozdaj kolejną kartę.",
      fullInstructions: { ...RANDOMCARDS_INSTRUCTIONS, whatYouDo: {"en": ["Deal a card, read the challenge and choose its answer.", "Correct answers join your winning hand. Use a boost before answering for double points.", "The answer stays visible until you choose Next challenge, then deal another card."], "pl": ["Rozdaj kartę, przeczytaj wyzwanie i wybierz odpowiedź.", "Poprawne odpowiedzi trafiają do wygranej puli. Włącz premię przed odpowiedzią.", "Odpowiedź pozostaje widoczna, aż wybierzesz Dalej. Następnie rozdaj kolejną kartę."]}, controls: {"en": ["Deal a card, read the challenge and choose its answer.", "Correct answers join your winning hand. Use a boost before answering for double points.", "The answer stays visible until you choose Next challenge, then deal another card."], "pl": ["Rozdaj kartę, przeczytaj wyzwanie i wybierz odpowiedź.", "Poprawne odpowiedzi trafiają do wygranej puli. Włącz premię przed odpowiedzią.", "Odpowiedź pozostaje widoczna, aż wybierzesz Dalej. Następnie rozdaj kolejną kartę."]}, rightWrongSkip: {"en": ["Correct choices earn arcade points. Mistakes stay available in your session review. Skip moves on without points."], "pl": ["Poprawne wybory dają punkty arcade. Błędy zobaczysz w przeglądzie sesji. Pominięcie przechodzi dalej bez punktów."]} },
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
  useEffect(() => { if (completed && !forcedState) arcade.finish(); }, [completed, forcedState]);

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
    if (forcedState || phase !== 'shoe' || shuffling) return;
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
    arcade.decide(right, round.id);
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

  // A real hand ends on the player's choice, leaving time to read feedback.
  const advanceCard = () => {
    setIdx(i => i + 1); setPicked(null); setVerdict(null);
    setRevealedHint(false); setPhase('shoe');
  };
  const skipCard = () => {
    if (forcedState || phase !== 'reveal' || !round) return;
    tip.recordWrong({ questionId: round.id, studentAnswer: '(skipped)', correctAnswer: round.options[round.answerIndex], explanationPL: round.hint_pl, exerciseId: round.exerciseId });
    arcade.decide(false, round.id); advanceCard();
  };

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 2 || !round) return;
    setHintsUsed((h) => h + 1);
    setRevealedHint(true);
  };

  const reset = (): void => {
    arcade.reset();
    setIdx(0); setPhase('shoe'); setPicked(null); setVerdict(null);
    setScore({ right: 0, wrong: 0 }); setHintsUsed(0); setRevealedHint(false);
    tip.reset();
  };



  const grad = time === 'day'
    ? 'radial-gradient(ellipse at 50% 60%, #2D6A4F 0%, #14342B 60%, #08160F 100%)'
    : 'radial-gradient(ellipse at 50% 60%, #1F4836 0%, #0E251A 60%, #02080A 100%)';

  // Stack of cards for the deck — purely cosmetic, count fixed visually.
  const deckStack = useMemo(() => Array.from({ length: 5 }, (_, i) => i), []);

  if (propsInvalid) {
    return <div className="em-shell-host-error">No puzzle data available · Brak danych ćwiczenia</div>;
  }

  return <ChallengeArena variant="dealer" title="The Dealer’s Table" mission="Collect the winning cards. Play your two boosts wisely." prompt={round?.prompt} options={round?.options ?? []} picked={picked} answerIndex={round?.answerIndex ?? -1} revealed={phase === 'verdict'} round={idx} total={active.rounds.length} score={score.right} completed={completed} onPick={onPick} onNext={advanceCard} onSkip={skipCard} onReset={reset} onHint={useHint} hintDisabled={hintsUsed >= 2 || revealedHint || phase !== 'reveal'} hint={phase === 'verdict' ? round?.hint_pl || round?.hint : revealedHint ? round?.hint : undefined} run={arcade} ready={phase !== 'shoe'} onReady={drawCard} />;
};

export default RandomCardsShell;
