import { lazy as wordLazy, Suspense as WordSuspense } from 'react';
const WordScene3D = wordLazy(() => import('../shells3d/WordFlashcards3D'));
// Flashcards — memory recall, archive grading and a semantic text fallback.
import { WordMission, useWordArcade } from './word-arcade';
import { useShellProgress } from '../lib/convex-stubs';
import type { ShellFlashcardsPuzzle } from '../lib/adapters';

import React, { useEffect, useState, useRef } from 'react';
import {
  Bajla,
  Confetti,
  HintButton,
  HintCard,
  Nameplate,
  Progress,
  SkipButton,
} from '../components/primitives';
import { AmbientAudioPlayer } from '../components/AmbientAudioPlayer';
// Mike #7 — expandable full-mechanic instructions panel.
import type { FullInstructions } from '../components/ExpandableInstructions';

// Memory Vault — full bilingual instruction copy.
const FLASHCARDS_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'Each vault card holds an English word or prompt. Recall its meaning before opening it.',
      'Look at the front, say the answer aloud (or think it), then tap to flip and reveal the Polish.',
      'After flipping, mark the card "Known" if you recalled it, or "Review" if you need it again.',
      'Route the opened card to Mastered or Review. Use Previous to revisit a card.',
    ],
    pl: [
      'Każda karta w sejfie zawiera angielskie słowo lub polecenie. Przypomnij sobie znaczenie, zanim ją otworzysz.',
      'Spójrz na przód, powiedz odpowiedź na głos (lub pomyśl), potem stuknij, aby odwrócić i pokazać polski.',
      'Po odwróceniu zaznacz kartę „Znam", jeśli przypomniałeś sobie, lub „Powtórz", jeśli potrzebujesz jeszcze raz.',
      'Wyślij otwartą kartę do archiwum Znam lub Powtórz. Przycisk Previous wraca do poprzedniej karty.',
    ],
  },
  controls: {
    en: [
      'Active card: the word capsule in the centre of the vault.',
      'Tap card: flips between English (front) and Polish (back).',
      '"Known" button: marks the card as remembered and removes it from review.',
      '"Review" button: keeps the card in the active queue for another pass.',
      'Hint opens the card. Two hints are available. Skip moves on without marking it Known.',
    ],
    pl: [
      'Aktywna karta: kapsuła ze słowem w środku sejfu.',
      'Stuknij kartę: odwraca między angielskim (przód) a polskim (tył).',
      'Przycisk „Znam": oznacza kartę jako zapamiętaną i usuwa z powtórek.',
      'Przycisk „Powtórz": utrzymuje kartę w aktywnej kolejce na kolejną rundę.',
      'Podpowiedź otwiera kartę. Masz dwie podpowiedzi. Pomiń przechodzi dalej bez oznaczania jako Znam.',
    ],
  },
  rightWrongSkip: {
    en: [
      'There is no "wrong" on flashcards — you self-rate after the flip.',
      '"Known" advances to the next card and adds to your KNOWN tally.',
      '"Review" advances and re-queues the card later in the session.',
      'Skip behaves like Review — moves on without scoring KNOWN.',
    ],
    pl: [
      'Na fiszkach nie ma „błędu" — sam oceniasz się po odwróceniu.',
      '„Znam" przesuwa do następnej karty i dodaje do licznika ZNAM.',
      '„Powtórz" przesuwa i kolejkuje kartę ponownie w sesji.',
      'Pomiń działa jak „Powtórz" — przesuwa dalej bez liczenia jako ZNAM.',
    ],
  },
  hintMechanic: {
    en:
      'You have two hints per session. A hint opens the card so you can study the answer. The text controls also include its example sentence and image when available.',
    pl:
      'Masz dwie podpowiedzi na sesję. Podpowiedź otwiera kartę i pokazuje odpowiedź. W widoku tekstowym znajdziesz też przykładowe zdanie i obrazek, jeśli jest dostępny.',
  },
  scoring: {
    en:
      'No right/wrong scoring — KNOWN vs REVIEW is your honest self-rating. Marking every card KNOWN at least once unlocks the post-shell summary, plus the deck saves to your spaced-repetition queue for tomorrow.',
    pl:
      'Brak punktów trafione/błędne — ZNAM kontra POWTÓRZ to Twoja uczciwa samoocena. Oznaczenie każdej karty jako ZNAM przynajmniej raz odblokowuje podsumowanie, a talia trafia do kolejki powtórek na jutro.',
  },
  l1Pattern: {
    en:
      'Self-rated recall is the strongest evidence-based learning method (Karpicke testing effect). Polish learners benefit from the bilingual flip — the L1 anchor is your safety net while you build the L2 retrieval pathway.',
    pl:
      'Samoocena przypomnienia to najsilniejsza metoda nauki potwierdzona badaniami (efekt testowania Karpickego). Polacy korzystają z dwujęzycznego odwrócenia — kotwica L1 to bezpieczna sieć, podczas gdy budujesz ścieżkę przypomnienia L2.',
  },
};

// ─────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────
interface FlashCard {
  en: string;
  pl: string;
  hue: number;
  ex: string;
  ex_pl: string;
  /** Originating Convex `exercises.exerciseId`. Optional — sample puzzles in
   *  shell .tsx files don't carry it; only adapter-produced puzzles do. */
  exerciseId?: string;
  /** Optional image URL. When absent or empty, the front of the card hides
   *  the image slot entirely (no fake "PHOTO · X" placeholder) and the
   *  Bajla copy switches to "Read the prompt, say the answer aloud" — see
   *  Kelly's audit item #10 (Ricky 2026-05-02). */
  image_url?: string;
}

const FC_DECK: FlashCard[] = [
  { en: 'morning', pl: 'rano',     hue: 35,  ex: 'Good morning.', ex_pl: 'Dzień dobry.' },
  { en: 'coffee',  pl: 'kawa',     hue: 25,  ex: 'A coffee, please.', ex_pl: 'Poproszę kawę.' },
  { en: 'street',  pl: 'ulica',    hue: 280, ex: 'On the street.', ex_pl: 'Na ulicy.' },
  { en: 'bridge',  pl: 'most',     hue: 200, ex: 'Across the bridge.', ex_pl: 'Przez most.' },
  { en: 'evening', pl: 'wieczór',  hue: 320, ex: 'A quiet evening.', ex_pl: 'Spokojny wieczór.' },
  { en: 'window',  pl: 'okno',     hue: 60,  ex: 'Open the window.', ex_pl: 'Otwórz okno.' },
];

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type ShellTime = 'day' | 'dusk' | 'night';
export type ShellState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;

export interface FlashcardsShellProps {
  time?: ShellTime;
  state?: ShellState;
  /**
   * When provided, the shell renders this card deck instead of FC_DECK.
   */
  puzzle?: ShellFlashcardsPuzzle;
  /**
   * Layer-4 dynamic-scaffolding hook (Agent A12). Fires when the student
   * marks a card "review" (their self-reported proxy for "I got this wrong").
   */
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3 Wave-5 (Ricky 2026-05-02): per-deck review payload. Fires once when
   * the student has marked every card in the deck (KNOWN/REVIEW/SKIPPED).
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
    puzzle: { cards: FlashCard[] };
    marks: Record<number, 'known' | 'review' | 'skipped'>;
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// renderFlashcardsReviewItem — per-card locked render for PracticeReview.
// Cork-board pin styling: card number + EN/PL pair + KNOWN/REVIEW/SKIPPED status.
// ─────────────────────────────────────────────────────────────────────────
const FC_REVIEW_ACCENT = '#FBBF24';
export function renderFlashcardsReviewItem(
  card: FlashCard,
  number: number,
  status: 'known' | 'review' | 'skipped',
): React.ReactNode {
  const statusMeta = status === 'known'
    ? { color: '#34D399', label: '✓ KNOWN · ZNANE', bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.45)' }
    : status === 'review'
      ? { color: '#FB7185', label: '↻ REVIEW · POWTÓRZ', bg: 'rgba(251,113,133,0.10)', border: 'rgba(251,113,133,0.45)' }
      : { color: '#F5EBD8', label: '— SKIPPED · POMINIĘTE', bg: 'rgba(245,235,216,0.06)', border: 'rgba(245,235,216,0.25)' };
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 14px',
      background: `linear-gradient(180deg, ${statusMeta.bg}, rgba(63,37,16,0.55))`,
      border: `1px solid ${statusMeta.border}`,
      borderRadius: 4,
      // Cork-board pin: tiny dot in top-right.
      position: 'relative',
    }}>
      <div aria-hidden="true" style={{
        position: 'absolute', top: 6, right: 8, width: 10, height: 10, borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #FCA5A5 0%, #DC2626 60%, #7F1D1D 100%)',
        boxShadow: '0 2px 3px rgba(0,0,0,0.4)',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${FC_REVIEW_ACCENT}22`, color: FC_REVIEW_ACCENT,
          border: `1px solid ${FC_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          CARD {String(number).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: `${statusMeta.color}22`, color: statusMeta.color,
        }}>
          {statusMeta.label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--em-decor)', fontSize: 22, color: 'var(--em-text, #EDE6FF)' }}>{card.en}</span>
        <span style={{ fontFamily: 'var(--em-decor)', fontSize: 18, color: 'var(--em-text-muted, #BAB0D6)', fontStyle: 'italic' }}>· {card.pl}</span>
      </div>
      {(card.ex || card.ex_pl) && (
        <div style={{ fontFamily: 'var(--em-body)', fontSize: 13, color: 'var(--em-text-muted)' }}>
          {card.ex && <div>"{card.ex}"</div>}
          {card.ex_pl && <div style={{ opacity: 0.7, fontStyle: 'italic' }}>🇵🇱 {card.ex_pl}</div>}
        </div>
      )}
    </div>
  );
}

export type { FlashCard as ShellFlashcardsCard };

type Mark = 'known' | 'review' | 'skipped';
type MarkMap = Record<number, Mark>;


// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export const FlashcardsShell: React.FC<FlashcardsShellProps> = ({ time = 'dusk', state: forcedState = null, puzzle, onWrongAnswer, onSessionComplete }) => {
  const arcade = useWordArcade();
  const accent = '#FBBF24';
  const activeDeck: FlashCard[] = puzzle && puzzle.cards.length > 0 ? puzzle.cards : FC_DECK;
  // Persisted progress (skipped when forcedState is set for design-canvas demos).
  const persisted = useShellProgress('flashcards');
  const [idx, setIdx] = useState<number>(0);
  const [flipped, setFlipped] = useState<boolean>(false);
  const [recallMode, setRecallMode] = useState(false);
  const [recall, setRecall] = useState('');
  const [recallResult, setRecallResult] = useState<'right'|'wrong'|null>(null);
  const advancingRef = useRef(false);
  const [marks, setMarks] = useState<MarkMap>({});

  // Auto-save progress when cards are marked.
  useEffect(() => {
    if (forcedState) return;
    const total = activeDeck.length;
    const marked = Object.keys(marks).length;
    persisted.save({ progress: marked / total, lastState: marked === total ? 'complete' : 'active' });
    if (marked === total) persisted.save({ progress: 1, completed: true, lastState: 'complete' });
  }, [Object.keys(marks).length, forcedState]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'flashcards',
      brief: 'Tap the card to flip. Self-rate Known or Review.',
      brief_pl: 'Stuknij kartę, aby odwrócić. Sam oceń „Znam" lub „Powtórz".',
      detail: 'Each pinned card hides the answer on the back. Read the prompt, say the answer aloud, then tap to flip and check. Mark Known if you got it; Review if you want it to come back later in the session.',
      detail_pl: 'Każda przypięta karta kryje odpowiedź na rewersie. Przeczytaj polecenie, powiedz odpowiedź na głos, potem stuknij, aby odwrócić i sprawdzić. Oznacz „Znam" jeśli wiedziałeś; „Powtórz" jeśli chcesz, aby karta wróciła później w sesji.',
      fullInstructions: FLASHCARDS_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);
  // D3 Wave-5 (Ricky 2026-05-02): once the deck is exhausted, fire the
  // session-complete callback with the per-card status map so PracticeReview
  // can render one row per card with KNOWN/REVIEW/SKIPPED chips.
  const [completedFired, setCompletedFired] = useState(false);
  useEffect(() => {
    if (forcedState) return;
    if (completedFired) return;
    if (!onSessionComplete) return;
    if (Object.keys(marks).length < activeDeck.length) return;
    setCompletedFired(true);
    const wrongAttempts = activeDeck
      .map((c, i) => ({ c, i, m: marks[i] }))
      .filter((x) => x.m === 'review')
      .map((x) => ({
        questionId: x.c.en,
        studentAnswer: '',
        correctAnswer: x.c.en,
        explanationPL: x.c.ex_pl,
        exerciseId: x.c.exerciseId,
      }));
    const knownN = activeDeck.reduce((acc, _c, i) => acc + (marks[i] === 'known' ? 1 : 0), 0);
    arcade.complete();
    onSessionComplete({
      correctCount: knownN,
      totalQuestions: activeDeck.length,
      wrongAttempts,
      puzzle: { cards: activeDeck },
      marks,
    });
  }, [marks, completedFired, onSessionComplete, activeDeck, forcedState]);
  const [hintsUsed, setHintsUsed] = useState<number>(0);

  const [announcement, setAnnouncement] = useState<string>('');




  // Forced state for canvas state sequence — matches Crossword vocab.
  useEffect(() => {
    if (forcedState === 'empty')   { setIdx(0); setFlipped(false); setMarks({}); setHintsUsed(0); }
    if (forcedState === 'active')  { setIdx(1); setFlipped(false); setMarks({ 0: 'known' }); setHintsUsed(0); }
    if (forcedState === 'wrong')   { setIdx(2); setFlipped(true);  setMarks({ 0: 'known', 1: 'review' }); setHintsUsed(0);  }
    if (forcedState === 'correct') { setIdx(3); setFlipped(true);  setMarks({ 0: 'known', 1: 'review', 2: 'known' }); setHintsUsed(0);  }
    if (forcedState === 'complete'){ setIdx(activeDeck.length - 1); setFlipped(false);
      setMarks({ 0: 'known', 1: 'review', 2: 'known', 3: 'known', 4: 'review', 5: 'known' }); setHintsUsed(0); }

    return undefined;
  }, [forcedState]);

  const card = activeDeck[idx];
  const knownCount = Object.values(marks).filter(v => v === 'known').length;
  const reviewCount = Object.values(marks).filter(v => v === 'review').length;
  const completed = !forcedState && Object.keys(marks).length === activeDeck.length;

  // Per-card image presence (Kelly audit item #10, Ricky 2026-05-02).
  // Drives both the image-slot reflow on the front of the card AND the
  // Bajla copy gating so we don't tell the student "look at the photo"
  // when there is no photo.


  const advance = (mark: Mark | null): void => {
    if (forcedState || advancingRef.current || completed) return;
    advancingRef.current = true;
    if (!marks[idx]) arcade.answer(mark === 'known');
    setRecall(''); setRecallResult(null);
    // D3 Wave-5: skip path now marks the card as 'skipped' so completion
    // fires on a fully-skipped deck. Pulse stays nil for skipped to not
    // overload the visual signal.
    const effective: Mark = mark ?? 'skipped';
    setMarks(m => ({ ...m, [idx]: effective }));
    if (mark) {

      setAnnouncement(mark === 'known' ? `Marked ${card.en} known. Znane.` : `Marked ${card.en} for review. Do powtórzenia.`);

      // Layer-4: a "review" mark = student admits this one tripped them up.
      if (mark === 'review' && onWrongAnswer) {
        onWrongAnswer({
          questionId: card.en,
          studentAnswer: '',
          correctAnswer: card.en,
          explanationPL: card.ex_pl,
          exerciseId: card.exerciseId,
        });
      }
    }
    setFlipped(false);
    setTimeout(() => { setIdx(i => (i + 1) % activeDeck.length); advancingRef.current = false; }, 220);
  };

  const back = (): void => {
    if (forcedState) return;
    setFlipped(false);
    setIdx(i => (i - 1 + activeDeck.length) % activeDeck.length);
  };

  const useHint = (): void => {
    if (forcedState || hintsUsed >= 2) return;
    setFlipped(true);
    setHintsUsed(h => h + 1);


  };

  const reshuffle = (): void => { arcade.restart(); setMarks({}); setIdx(0); setFlipped(false); setRecall(''); setRecallResult(null); setCompletedFired(false); };
  const checkRecall = () => {
    if (!recall.trim() || recallResult === 'right') return;
    const normaliseRecall = (value: string) => value.toLocaleLowerCase().trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
    const right = normaliseRecall(recall) === normaliseRecall(card.en);
    setRecallResult(right ? 'right' : 'wrong');
    setAnnouncement(right ? 'Recall verified! Reveal the card to check the example.' : 'Keep going, or reveal the answer and mark it for review.');
    if (right) setFlipped(true);
  };



  return (
    <div className="em-shell wa-flashcards" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', zIndex: 5 }}>
        <AmbientAudioPlayer shellSlug="flashcards" />
        <Nameplate district="The Memory Vault" subtitle="Flashcards · Fiszki · recall, reveal, remember" accent={accent}
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="5" width="16" height="12" rx="1.5" stroke={accent} strokeWidth="1.6" transform="rotate(-3 11 11)"/></svg>}/>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* CD audit fix (Ricky 2026-05-02): triple-counter (KNOWN/REVIEW/Q)
              dropped per cross-cutting #14. Single canonical Q N/M position chip
              kept. KNOWN/REVIEW counts surface in the post-shell complete screen. */}
          <Progress current={idx + 1} total={activeDeck.length} accent={accent}/>
          <HintButton onClick={useHint} used={hintsUsed} total={2} />
        </div>
      </div>

      <div className="wa-memory-console">
        <WordMission kind="memory" current={Object.keys(marks).length} total={activeDeck.length} chain={arcade.chain} reaction={arcade.reaction}/>
        <WordSuspense fallback={<p>Opening the 3D district…</p>}><WordScene3D key={idx} front={recallMode?card.pl:card.en} back={recallMode?card.en:card.pl} flipped={flipped} onFlip={()=>!forcedState&&setFlipped(v=>!v)} onMark={mark=>flipped&&advance(mark)}/></WordSuspense>
        <div className="wa-inline-tools"><button aria-pressed={recallMode} onClick={()=>{setRecallMode(v=>!v);setFlipped(false);setRecall('');setRecallResult(null);}}>Recall challenge {recallMode?'on':'off'}</button><span>{recallMode?'Translate the Polish prompt from memory.':'Think of the meaning before you reveal.'}</span></div>
      </div>

      <details className="wa-memory-fallback"><summary>Card text and keyboard controls</summary><button className="wa-memory-flip" onClick={()=>!forcedState&&setFlipped(value=>!value)} disabled={!!forcedState} aria-label="Flip memory card">{flipped?(recallMode?card.en:card.pl):(recallMode?card.pl:card.en)}<small>{flipped?"Tap to see the prompt":"Tap to reveal the answer"}</small></button>{card.image_url&&<img src={card.image_url} alt={card.en} loading="lazy"/>}{flipped&&<div className="wa-memory-example"><p>{card.ex}</p><p lang="pl">{card.ex_pl}</p></div>}</details>




      {/* Live region for assistive tech */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        {announcement}
      </div>

      {recallMode && <div className="wa-recall-controls"><div className="wa-inline-tools"><input aria-label="Your English recall answer" value={recall} onChange={e=>{setRecall(e.target.value);setRecallResult(null);}} onKeyDown={e=>{if(e.key==='Enter')checkRecall();}} disabled={recallResult==='right'} placeholder="Type the English word or phrase…"/><button onClick={checkRecall} disabled={!recall.trim()||recallResult==='right'}>Check recall ↵</button></div><p role="status" className="wa-forge-readout">{recallResult==='right'?'Recall verified. Now rate your memory.':recallResult==='wrong'?'Not quite — try again or flip to learn it.':'Recall it before you turn the card.'}</p></div>}
      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 6 }}>
        <button className="em-btn" onClick={back} disabled={!!forcedState} aria-label="Previous card">← Previous</button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => advance('review')} disabled={!!forcedState || !flipped}
            aria-label="Mark for review"
            style={{
              padding: '12px 22px', borderRadius: 999,
              background: 'linear-gradient(180deg, #FB7185, #BE3A4F)',
              color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
              fontFamily: 'var(--em-display)', fontWeight: 600, fontSize: 14,
              cursor: forcedState ? 'default' : 'pointer', boxShadow: '0 8px 20px rgba(251,113,133,0.35)',
            }}>↻ Review again</button>
          <button onClick={() => advance('known')} disabled={!!forcedState || !flipped}
            aria-label="I know this"
            style={{
              padding: '12px 22px', borderRadius: 999,
              background: 'linear-gradient(180deg, #34D399, #1B8060)',
              color: '#0E2A1F', border: '1px solid rgba(255,255,255,0.2)',
              fontFamily: 'var(--em-display)', fontWeight: 700, fontSize: 14,
              cursor: forcedState ? 'default' : 'pointer', boxShadow: '0 8px 20px rgba(52,211,153,0.35)',
            }}>✓ I know this</button>
        </div>
        <SkipButton onClick={() => advance(null)} />
      </div>

      <Confetti show={completed} />

      {completed && !onSessionComplete && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.18), rgba(63,37,16,0.9))',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, backdropFilter: 'blur(2px)',
          animation: 'em-rise 0.5s var(--em-ease)',
          zIndex: 10,
        }} role="region" aria-label="Deck complete">
          <Bajla size={84} mood="cheer" decorative/>
          <div className="em-decor" style={{ fontSize: 38, color: '#F5EBD8' }}>The whole deck reviewed.</div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--em-decor)', fontSize: 44, color: '#34D399' }}>{knownCount}</div>
              <div className="em-eyebrow" style={{ color: '#34D399' }}>KNOWN · ZNANE</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--em-decor)', fontSize: 44, color: '#FB7185' }}>{reviewCount}</div>
              <div className="em-eyebrow" style={{ color: '#FB7185' }}>REVIEW · DO POWTÓRZENIA</div>
            </div>
          </div>
          <button className="em-btn em-btn-primary" onClick={reshuffle} style={{ marginTop: 8 }} aria-label="Shuffle deck">Shuffle deck →</button>
        </div>
      )}
    </div>
  );
};

export default FlashcardsShell;
