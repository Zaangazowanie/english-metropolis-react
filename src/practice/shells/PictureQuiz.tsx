// Picture Quiz shell — "The Photography Salon" district.
// A gallery wall at dusk. Each question hangs in an ornate gilt frame with
// a cream mat; a brass plaque underneath asks "What is this?" and the
// student picks from four named MCQ options. On a wrong pick, the frame
// shakes; on a correct pick, the frame zooms briefly and the brass plaque
// engraves the right answer.
//
// Persisted progress — Convex-backed, see convex-stubs.ts + convex/practice.ts.
import { useShellProgress } from '../lib/convex-stubs';

import React, { useState, useEffect } from 'react';
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

// Photography Salon · Picture Quiz — full bilingual instruction copy.
// NOTE: asset-fallback fix already shipped — instructions adapt to "use the prompt"
// when image_url is missing instead of telling the user to look at a missing photo.
const PICTUREQUIZ_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A photograph hangs in a gilt frame at the centre of the salon.',
      'Below the frame, four word options are pinned beside the prompt.',
      'Pick the option that names what the photograph shows.',
      'If the photo is unavailable, the frame shows "BRAK ZDJĘCIA · IMAGE UNAVAILABLE" — use the prompt text alone to choose.',
    ],
    pl: [
      'Na środku salonu wisi zdjęcie w złoconej ramie.',
      'Pod ramą, obok pytania, przypięte są cztery opcje słów.',
      'Wybierz opcję, która nazywa to, co widzisz na zdjęciu.',
      'Jeśli zdjęcia nie ma, w ramie pojawia się napis „BRAK ZDJĘCIA · IMAGE UNAVAILABLE" — wybierz tylko na podstawie pytania.',
    ],
  },
  controls: {
    en: [
      'Gilt frame: shows the photograph (or graceful "BRAK ZDJĘCIA · IMAGE UNAVAILABLE" fallback).',
      'Prompt strip: bilingual EN/PL question above the options.',
      'Four option pins: pick one — only one is correct.',
      'Q counter: header tally of progress through the frames.',
      'Skip + Hint buttons: Skip jumps to next frame, Hint dims one wrong option.',
    ],
    pl: [
      'Złocona rama: pokazuje zdjęcie (lub estetyczny zastępnik „BRAK ZDJĘCIA · IMAGE UNAVAILABLE").',
      'Pasek pytania: dwujęzyczne EN/PL pytanie nad opcjami.',
      'Cztery przypinki opcji: wybierz jedną — tylko jedna jest poprawna.',
      'Licznik Q: postęp przez kolejne ramki w nagłówku.',
      'Przyciski Pomiń i Podpowiedź: Pomiń przeskakuje ramkę, Podpowiedź wygasza jedną błędną opcję.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right pick: ✓ frame glows green, +1 to your tally, the "Next frame" button appears.',
      'Wrong pick: ✗ option flashes rose, the correct option highlights so you see what was right.',
      'Skip: counts as a miss — moves to the next frame.',
      'You can\'t change your answer after committing.',
    ],
    pl: [
      'Trafienie: ✓ rama świeci na zielono, +1 do wyniku, pojawia się przycisk „Next frame".',
      'Błąd: ✗ opcja mignie na różowo, a poprawna podświetli się, abyś zobaczył, co było właściwe.',
      'Pomiń: liczy się jako pudło — przejście do następnej ramki.',
      'Po zatwierdzeniu odpowiedzi nie można jej zmienić.',
    ],
  },
  hintMechanic: {
    en:
      'You have 2 hints per session. Each tap dims one wrong option. Save them for tricky frames where two options look very similar (e.g. "alley" vs "lane").',
    pl:
      'Masz 2 podpowiedzi na sesję. Każde stuknięcie wygasza jedną błędną opcję. Zachowaj je na trudne ramki, gdzie dwie opcje wyglądają bardzo podobnie (np. „alley" vs „lane").',
  },
  scoring: {
    en:
      'Skip counts as a miss. Each correct frame adds to your session streak. Tagging every frame in the deck unlocks the post-shell review with explanations of any wrong picks.',
    pl:
      'Pomiń liczy się jako pudło. Każda trafna ramka buduje serię w sesji. Trafienie wszystkich ramek odblokowuje przegląd z wyjaśnieniami błędów.',
  },
  l1Pattern: {
    en:
      'Concrete-noun recognition. Polish learners often have stronger production of abstract nouns than concrete everyday objects (room features, kitchen tools, street furniture); this drill builds visual-to-EN-noun direct mapping.',
    pl:
      'Rozpoznawanie konkretnych rzeczowników. Polscy uczniowie często znają abstrakcyjne słowa lepiej niż codzienne konkretne przedmioty (elementy pokoju, narzędzia kuchenne, mała architektura); ten poziom buduje bezpośrednie skojarzenie obraz → angielski rzeczownik.',
  },
};

export type PictureQuizForcedState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete' | null;
export type TimeOfDay = 'day' | 'dusk' | 'night';

interface PQItem {
  id: string;
  image_url: string;
  fallback_glyph: string;
  prompt: string;
  prompt_pl: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface PictureQuizPuzzle {
  items: PQItem[];
}

export interface PictureQuizShellProps {
  time?: TimeOfDay;
  state?: PictureQuizForcedState;
  puzzle?: PictureQuizPuzzle;
  onWrongAnswer?: (info: {
    questionId: string;
    studentAnswer: string;
    correctAnswer: string;
    explanationPL?: string;
    exerciseId?: string;
  }) => void;
  /**
   * D3 Wave-5 (Ricky 2026-05-02): per-frame review payload. Fires once when
   * every photograph in the salon has been answered or skipped.
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
    puzzle: PictureQuizPuzzle;
    studentPicks: Record<string, string>;
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// renderPictureQuizReviewItem — per-frame locked render for PracticeReview.
// Photography Salon scoreboard: frame thumb (or BRAK ZDJĘCIA) + 4 options
// with student's pick + correct + the engraved caption.
// ─────────────────────────────────────────────────────────────────────────
const PQ_REVIEW_ACCENT = '#E879F9';
export function renderPictureQuizReviewItem(
  item: PQItem,
  number: number,
  studentAnswer: string | undefined,
): React.ReactNode {
  const correct = item.options[item.answerIndex];
  const stu = studentAnswer ?? '';
  const isWrong = stu.length > 0 && stu !== correct;
  const hasImage = !!(item.image_url && item.image_url.trim());
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      background: isWrong
        ? 'linear-gradient(180deg, rgba(251,113,133,0.08), rgba(20,16,42,0.55))'
        : 'linear-gradient(180deg, rgba(232,121,249,0.10), rgba(20,16,42,0.55))',
      border: `1px solid ${isWrong ? 'rgba(251,113,133,0.45)' : 'rgba(232,121,249,0.45)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
          padding: '2px 8px', borderRadius: 4,
          background: `${PQ_REVIEW_ACCENT}22`, color: PQ_REVIEW_ACCENT,
          border: `1px solid ${PQ_REVIEW_ACCENT}66`, fontWeight: 700,
        }}>
          FRAME {String(number).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: 'var(--em-mono)', fontSize: 9, letterSpacing: '0.18em',
          padding: '2px 8px', borderRadius: 999, fontWeight: 700,
          background: isWrong ? 'rgba(251,113,133,0.18)' : 'rgba(232,121,249,0.22)',
          color: isWrong ? '#FB7185' : PQ_REVIEW_ACCENT,
        }}>
          {isWrong ? '✗ MISTITLED · BŁĘDNIE' : '✓ TITLED · POPRAWNIE'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Photo thumb (or BRAK ZDJĘCIA fallback) */}
        <div style={{
          flex: '0 0 88px', height: 66, borderRadius: 4, overflow: 'hidden',
          background: '#1A0F2E', border: '2px solid rgba(245,235,216,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {hasImage ? (
            <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              fontFamily: 'var(--em-mono)', fontSize: 8, letterSpacing: '0.18em',
              color: 'rgba(245,235,216,0.55)', textAlign: 'center', lineHeight: 1.3,
              padding: 4,
            }}>
              <div style={{ fontSize: 18 }} aria-hidden="true">{item.fallback_glyph || '🖼️'}</div>
              BRAK ZDJĘCIA
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontFamily: 'var(--em-decor)', fontSize: 16, color: 'var(--em-text, #EDE6FF)' }}>{item.prompt}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {item.options.map((opt, oi) => {
              const isCorrect = oi === item.answerIndex;
              const wasPicked = stu === opt;
              const showCorrect = isCorrect;
              const showWrong = wasPicked && !isCorrect;
              return (
                <div key={oi} style={{
                  padding: '6px 8px', borderRadius: 4, fontSize: 12,
                  background: showCorrect
                    ? 'rgba(232,121,249,0.18)'
                    : showWrong
                      ? 'rgba(251,113,133,0.18)'
                      : 'rgba(245,239,255,0.04)',
                  border: `1px solid ${showCorrect ? '#E879F988' : showWrong ? '#FB718588' : 'rgba(245,239,255,0.1)'}`,
                  color: showCorrect ? '#E879F9' : showWrong ? '#FB7185' : 'var(--em-text, #EDE6FF)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ fontFamily: 'var(--em-mono)', fontSize: 8, opacity: 0.7 }}>{String.fromCharCode(65 + oi)}</span>
                  <span style={{ flex: 1 }}>{opt}</span>
                  {showCorrect && <span style={{ fontFamily: 'var(--em-mono)', fontSize: 9 }}>✓</span>}
                  {showWrong && <span style={{ fontFamily: 'var(--em-mono)', fontSize: 9 }}>✗</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{
        fontFamily: 'var(--em-mono)', fontSize: 10, letterSpacing: '0.2em',
        color: 'rgba(245,235,216,0.55)', textAlign: 'center',
        padding: '4px 8px', background: 'rgba(245,235,216,0.04)', borderRadius: 2,
      }}>
        TYTUŁ · {correct.toUpperCase()}
      </div>
    </div>
  );
}

export type { PQItem as ShellPictureQuizItem };

const PQ_PUZZLE: PictureQuizPuzzle = {
  items: [
    { id: 'pq-demo-1', image_url: '/practice-images/demo/bread.jpg', fallback_glyph: '🍞', prompt: 'What is shown?', prompt_pl: 'Co jest na obrazku?', options: ['bread', 'cheese', 'apple', 'cake'], answerIndex: 0, hint: 'You bake it in an oven.', hint_pl: 'Pieczywo, podstawa śniadania.' },
    { id: 'pq-demo-2', image_url: '/practice-images/demo/rain.jpg', fallback_glyph: '🌧️', prompt: 'What is shown?', prompt_pl: 'Co jest na obrazku?', options: ['snow', 'wind', 'rain', 'sun'], answerIndex: 2, hint: 'Drops falling from the sky.', hint_pl: 'Krople padające z nieba.' },
    { id: 'pq-demo-3', image_url: '/practice-images/demo/jacket.jpg', fallback_glyph: '🧥', prompt: 'What is shown?', prompt_pl: 'Co jest na obrazku?', options: ['shoe', 'jacket', 'hat', 'bag'], answerIndex: 1, hint: 'You wear it when it is cold.', hint_pl: 'Nosisz to, gdy jest zimno.' },
    { id: 'pq-demo-4', image_url: '/practice-images/demo/bridge.jpg', fallback_glyph: '🌉', prompt: 'What is shown?', prompt_pl: 'Co jest na obrazku?', options: ['tower', 'square', 'street', 'bridge'], answerIndex: 3, hint: 'It crosses a river.', hint_pl: 'Przechodzi nad rzeką.' },
    { id: 'pq-demo-5', image_url: '/practice-images/demo/coffee.jpg', fallback_glyph: '☕', prompt: 'What is shown?', prompt_pl: 'Co jest na obrazku?', options: ['tea', 'water', 'juice', 'coffee'], answerIndex: 3, hint: 'A hot drink in the morning.', hint_pl: 'Gorący napój o poranku.' },
  ],
};

const ACCENT = '#E879F9';
const ACCENT_GLOW = 'rgba(232,121,249,0.55)';

export const PictureQuizShell: React.FC<PictureQuizShellProps> = ({
  time = 'dusk',
  state: forcedState = null,
  puzzle,
  onWrongAnswer,
  onSessionComplete,
}) => {
  const activePuzzle = puzzle && puzzle.items.length > 0 ? puzzle : PQ_PUZZLE;
  const persisted = useShellProgress('picturequiz');

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  // CC-2 fallback chain stage: 0 = primary (loremflickr or curated),
  // 1 = picsum.photos seed (always renders something), 2 = BRAK ZDJĘCIA placeholder.
  // Using a numeric stage instead of a binary flag so a single onError doesn't
  // immediately strip the <img> from the DOM — we get one more attempt against
  // a more reliable CDN before showing the empty-state copy.
  const [imageStage, setImageStage] = useState<0 | 1 | 2>(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [seen, setSeen] = useState(0);
  const [solved, setSolved] = useState(0);
  const [questionFinalised, setQuestionFinalised] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // D3 Wave-5: per-frame student pick log + per-frame wrong-attempt log so
  // the review screen can render one row per photograph.
  const [studentPicks, setStudentPicks] = useState<Record<string, string>>({});
  const [allWrongAttempts, setAllWrongAttempts] = useState<Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>>([]);
  const [completedFired, setCompletedFired] = useState(false);

  const total = activePuzzle.items.length;
  const cur = activePuzzle.items[idx];
  const completed = solved >= total || (seen >= total && !forcedState);

  // Reset image-failed state per question.
  useEffect(() => {
    setImageStage(0);
  }, [idx]);

  // v10 instructional speech-bubble broadcast (Mike directive 2026-05-03).
  useEffect(() => {
    if (forcedState) return;
    if (typeof window === 'undefined') return;
    const detail = {
      shellKey: 'picturequiz',
      brief: 'Pick the word that names what the framed photograph shows.',
      brief_pl: 'Wybierz słowo, które nazywa to, co widać na zdjęciu w ramie.',
      detail: 'Each frame in the salon hangs a photo. Look carefully and tap the chip whose word names what you see. If the photo fails to load, fall back to the prompt text. Right answers light green and advance; wrong ones reveal the correct chip.',
      detail_pl: 'Każda rama w salonie zawiera zdjęcie. Przyjrzyj się i stuknij kafelek, którego słowo nazywa to, co widzisz. Jeśli zdjęcie się nie wczyta, oprzyj się na poleceniu. Poprawne świecą na zielono i przechodzą dalej; błędne pokazują właściwą.',
      fullInstructions: PICTUREQUIZ_INSTRUCTIONS,
    };
    window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('em:shell-instruction', { detail: null }));
    };
  }, [forcedState]);

  // CC-2 (Ricky 2026-05-02, patched 2026-05-03): live image source resolution.
  // Path A originally specified source.unsplash.com but that endpoint was
  // retired by Unsplash in mid-2024 and now returns 503 Heroku Application
  // Error for every request — verified by curl before shipping. Switched to
  // LoremFlickr which is a keyword-driven Flickr Creative Commons proxy:
  //   https://loremflickr.com/<w>/<h>/<keyword>
  // 2026-05-03 fix: live observation showed BRAK ZDJĘCIA in every frame on
  // prod despite the bundle containing the loremflickr URL. Two root causes:
  //   (a) cur.options[cur.answerIndex] occasionally yields a token that the
  //       slug regex strips to "" (Polish chars, punctuation), producing
  //       https://loremflickr.com/400/300/ → 404 → onError → DOM swap.
  //   (b) the previous binary imageFailed→placeholder swap meant a single
  //       network hiccup permanently hid the <img> from the DOM, so devtools
  //       Network tab never saw the loremflickr request and CD's audit
  //       reasonably concluded the URL wasn't being built.
  // Fix: derive a robust slug with multi-source fallback (answer → prompt →
  // first option → "object") so the URL is always non-empty, AND chain
  // loremflickr → picsum.photos/seed → BRAK ZDJĘCIA placeholder so the <img>
  // element stays mounted across the first failure.
  const sluggify = (raw: string): string =>
    raw.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ',');
  const pickSlug = (item: PQItem): string => {
    const candidates = [
      item.options[item.answerIndex],
      item.prompt,
      item.options.find((o) => !!o && o.trim().length > 0) || '',
    ];
    for (const c of candidates) {
      const s = sluggify(c || '');
      if (s.length > 0) return s;
    }
    return 'object';
  };
  const buildLiveImageSrc = (keyword: string): string => {
    const slug = sluggify(keyword);
    const safe = slug.length > 0 ? slug : 'object';
    return `https://loremflickr.com/400/300/${encodeURIComponent(safe)}`;
  };
  // Picsum seed fallback — keyword-stable but returns a generic photo. Always
  // 200s, never CORS-fails, and the seed deterministically picks the same
  // image so review screens are consistent.
  const buildPicsumSrc = (keyword: string): string => {
    const slug = sluggify(keyword);
    const safe = slug.length > 0 ? slug : 'object';
    return `https://picsum.photos/seed/${encodeURIComponent(safe)}/400/300`;
  };
  const curSlug = pickSlug(cur);
  const liveImageSrc = buildLiveImageSrc(curSlug);
  const picsumImageSrc = buildPicsumSrc(curSlug);

  // Curated assets win when present, live source fills the long tail.
  const hasImageUrl = !!(cur.image_url && cur.image_url.trim());
  // Source to feed to the <img> at the current fallback stage.
  // stage 0 = primary (curated or loremflickr)
  // stage 1 = picsum.photos seed (only used when no curated asset is set;
  //           if a curated asset 404s we go straight to placeholder rather
  //           than swap a generic random photo in for a hand-picked one)
  // stage 2 = BRAK ZDJĘCIA placeholder
  const stagedImageSrc =
    imageStage === 0
      ? hasImageUrl
        ? cur.image_url
        : liveImageSrc
      : picsumImageSrc;
  // Preload the next 2 frames' live images so they're warm in the CDN cache
  // by the time the student advances. Cheap — browser fires one HEAD-ish
  // GET per <img>, then caches the result.
  useEffect(() => {
    for (let off = 1; off <= 2; off += 1) {
      const nextItem = activePuzzle.items[idx + off];
      if (!nextItem) break;
      if (nextItem.image_url && nextItem.image_url.trim()) continue;
      const nextSlug = pickSlug(nextItem);
      const preload = new Image();
      preload.src = buildLiveImageSrc(nextSlug);
      // Warm picsum too so the cross-CDN fallback is also instant.
      const preloadPicsum = new Image();
      preloadPicsum.src = buildPicsumSrc(nextSlug);
    }
  }, [idx, activePuzzle]);

  useEffect(() => {
    if (forcedState) return;
    persisted.save({
      progress: solved / Math.max(total, 1),
      lastState: solved >= total ? 'complete' : 'active',
    });
    if (solved >= total) {
      persisted.save({ progress: 1, completed: true, lastState: 'complete' });
    }
  }, [solved, forcedState, total]);

  useEffect(() => {
    if (!forcedState) return;
    if (forcedState === 'empty') { setIdx(0); setPicked(null); setRevealed(false); setSeen(0); setSolved(0); }
    if (forcedState === 'active') { setIdx(1); setPicked(null); setRevealed(false); setSeen(1); setSolved(1); }
    if (forcedState === 'correct') {
      setIdx(1); setPicked(activePuzzle.items[1].answerIndex); setRevealed(true);
      setSeen(2); setSolved(2);
    }
    if (forcedState === 'wrong') {
      const w = (activePuzzle.items[1].answerIndex + 1) % activePuzzle.items[1].options.length;
      setIdx(1); setPicked(w); setRevealed(true);
      setSeen(2); setSolved(1);
    }
    if (forcedState === 'complete') {
      setIdx(total - 1); setPicked(activePuzzle.items[total - 1].answerIndex);
      setRevealed(true); setSeen(total); setSolved(total);
    }
  }, [forcedState, activePuzzle, total]);

  const choose = (optIdx: number) => {
    if (forcedState || revealed) return;
    setPicked(optIdx);
    setRevealed(true);
    const correct = optIdx === cur.answerIndex;
    setAnnouncement(
      correct
        ? `Correct. The frame shows ${cur.options[cur.answerIndex]}.`
        : `Not quite. The frame shows ${cur.options[cur.answerIndex]}.`,
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
    // D3 Wave-5: log per-frame pick + accumulate wrong attempts for review.
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

  // D3 Wave-5 (Ricky 2026-05-02): fire onSessionComplete once every frame
  // has been seen (answered or skipped) so PracticeReview can mount.
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
    setIdx(0); setPicked(null); setRevealed(false); setSeen(0); setSolved(0);
    setHintsUsed(0); setHintShown(false); setQuestionFinalised(false);
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
      : 'linear-gradient(180deg, #2A1455 0%, #571B6E 60%, #823189 100%)';

  return (
    <div
      className="em-shell em-shell-picturequiz"
      role="application"
      aria-label="Picture quiz, The Photography Salon"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      <style>{`
        @keyframes em-pq-frame-rise {
          from { opacity: 0; transform: scale(0.92) translateY(10px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes em-pq-frame-zoom {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.06); }
          100% { transform: scale(1.02); }
        }
        @keyframes em-pq-engrave {
          0%   { letter-spacing: 0.6em; opacity: 0; }
          60%  { letter-spacing: 0.18em; opacity: 1; }
          100% { letter-spacing: 0.18em; opacity: 1; }
        }
        @keyframes em-pq-spotlight {
          0%, 100% { opacity: 0.6; }
          50%      { opacity: 0.9; }
        }
      `}</style>

      <div style={{ position: 'absolute', inset: 0, background: grad }} />
      {/* Picture-rail silhouette behind frames */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '18%',
          left: 0,
          right: 0,
          height: 4,
          background: 'linear-gradient(90deg, transparent, #FBBF2444, transparent)',
        }}
      />
      {/* Spotlight */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-10%',
          left: '50%',
          width: 460,
          height: 460,
          marginLeft: -230,
          background: `radial-gradient(circle, ${ACCENT}55 0%, transparent 65%)`,
          animation: 'em-pq-spotlight 6s var(--em-ease) infinite',
          pointerEvents: 'none',
        }}
      />
      {/* Faint hatch */}
      <div className="em-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true" />

      {/* Top bar */}
      <div
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
        <AmbientAudioPlayer shellSlug="picturequiz" />
        <Nameplate
          district="The Photography Salon"
          subtitle="Picture quiz · Quiz obrazkowy · what is shown?"
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="3" y="5" width="16" height="13" rx="1.5" stroke={ACCENT} strokeWidth="1.5" />
              <circle cx="11" cy="11" r="3" stroke={ACCENT} strokeWidth="1.4" />
              <circle cx="11" cy="11" r="1" fill={ACCENT} />
              <path d="M7 5 L8.5 3 L13.5 3 L15 5" stroke={ACCENT} strokeWidth="1.2" />
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
        className="em-shell-pq-layout"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 32,
          padding: '12px 28px 24px',
          height: 'calc(100% - 92px)',
          boxSizing: 'border-box',
          zIndex: 3,
          alignItems: 'center',
        }}
      >
        {/* GILT FRAME */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
            position: 'relative',
            animation:
              revealed && picked === cur.answerIndex
                ? 'em-pq-frame-zoom 0.6s var(--em-ease) both'
                : revealed && picked !== cur.answerIndex
                ? 'em-shake 0.4s'
                : 'em-pq-frame-rise 540ms var(--em-ease) both',
          }}
        >
          {/* Hanging wire */}
          <svg
            aria-hidden="true"
            viewBox="0 0 240 60"
            style={{ width: 240, height: 60, marginBottom: -8 }}
          >
            <path d="M 30 0 Q 120 60 210 0" fill="none" stroke="#876543" strokeWidth="1" opacity="0.55" />
            <circle cx="30" cy="0" r="2" fill="#876543" />
            <circle cx="210" cy="0" r="2" fill="#876543" />
          </svg>

          {/* Frame */}
          <div
            style={{
              position: 'relative',
              padding: 18,
              background:
                'linear-gradient(135deg, #B89E66 0%, #FBBF24 35%, #E0A33F 65%, #876543 100%)',
              borderRadius: 6,
              boxShadow: '0 32px 60px rgba(0,0,0,0.65), inset 0 0 0 3px #5A4220',
              maxWidth: 380,
              width: '90%',
            }}
          >
            {/* Inner mat */}
            <div
              style={{
                padding: 18,
                background: '#F5EBD8',
                borderRadius: 2,
                boxShadow: 'inset 0 0 30px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.08)',
              }}
            >
              {/* Image (or fallback glyph) */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '4 / 3',
                  background: '#1A0F2E',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  borderRadius: 1,
                }}
              >
                {imageStage < 2 ? (
                  <img
                    // Keying by stage + idx forces the <img> to remount on
                    // fallback transition so React swaps src cleanly and a
                    // second onError can fire against the picsum URL.
                    key={`pq-img-${idx}-${imageStage}`}
                    src={stagedImageSrc}
                    alt={`Photograph for question ${idx + 1}`}
                    onError={() => {
                      // stage 0 → 1: try picsum (only useful if we were on a
                      // live keyword source; if we were on a curated asset
                      // and it 404'd, picsum's random photo would mislead, so
                      // jump straight to the placeholder).
                      setImageStage((s) => {
                        if (s === 0) return hasImageUrl ? 2 : 1;
                        return 2;
                      });
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  // Honest empty state — no fake rectangle masquerading as a
                  // photograph. Bilingual copy + a faint glyph + a CTA-ish
                  // hint so the student knows they can still complete the
                  // question via the prompt + options on the right.
                  <div
                    role="img"
                    aria-label={`Image unavailable for question ${idx + 1}. Brak zdjęcia.`}
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: 16,
                      textAlign: 'center',
                      background: 'linear-gradient(135deg, #1F1238 0%, #2A1455 100%)',
                      color: 'rgba(245,235,216,0.78)',
                    }}
                  >
                    <div style={{ fontSize: 44, opacity: 0.55, lineHeight: 1 }} aria-hidden="true">
                      {cur.fallback_glyph || '🖼️'}
                    </div>
                    <div
                      className="em-eyebrow"
                      style={{ color: 'rgba(245,235,216,0.85)', fontSize: 10, letterSpacing: '0.22em' }}
                    >
                      BRAK ZDJĘCIA · IMAGE UNAVAILABLE
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--em-mono)',
                        fontSize: 10,
                        opacity: 0.6,
                        letterSpacing: '0.04em',
                        marginTop: 2,
                      }}
                    >
                      Use the prompt to choose
                    </div>
                  </div>
                )}
                {/* Frame number bottom-right */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    bottom: 6,
                    right: 8,
                    padding: '2px 6px',
                    background: 'rgba(0,0,0,0.55)',
                    color: '#F5EBD8',
                    fontFamily: 'var(--em-mono)',
                    fontSize: 9,
                    letterSpacing: '0.2em',
                  }}
                >
                  No. {String(idx + 1).padStart(2, '0')}
                </div>
              </div>
            </div>
          </div>

          {/* Brass plaque — only renders when there's a title to engrave.
              Pre-reveal we show a discreet "Bez tytułu · Untitled" eyebrow
              with no em-dash filler; post-reveal the engraved word appears. */}
          <div
            style={{
              padding: '10px 18px',
              background: 'linear-gradient(180deg, #E0A33F 0%, #B89E66 100%)',
              borderRadius: 4,
              boxShadow: '0 6px 14px rgba(0,0,0,0.4), inset 0 -2px 0 rgba(0,0,0,0.2)',
              border: '1px solid #5A4220',
              minWidth: 200,
              textAlign: 'center',
            }}
          >
            <div
              className="em-eyebrow"
              style={{
                color: '#3F2510',
                marginBottom: revealed ? 2 : 0,
                fontSize: 10,
                letterSpacing: '0.22em',
              }}
            >
              {revealed ? 'TITLE · TYTUŁ' : 'Bez tytułu · Untitled'}
            </div>
            {revealed && (
              <div
                style={{
                  fontFamily: 'var(--em-decor)',
                  fontSize: 18,
                  color: '#1A0F08',
                  animation: 'em-pq-engrave 0.7s var(--em-ease) both',
                  letterSpacing: '0.18em',
                }}
              >
                {cur.options[cur.answerIndex].toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* OPTIONS */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minWidth: 0,
          }}
        >
          <div
            className="em-card"
            style={{
              padding: 20,
              background: 'linear-gradient(180deg, #14082A 0%, #08041A 100%)',
              border: `1px solid ${ACCENT}55`,
              borderRadius: 14,
              animation: 'em-rise 540ms var(--em-ease) both',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div className="em-eyebrow" style={{ color: ACCENT }}>
              Frame {idx + 1} of {total} · {cur.prompt_pl}
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

            <div role="radiogroup" aria-label={cur.prompt} style={{ display: 'grid', gap: 8 }}>
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
                        width: 26, height: 26, borderRadius: '50%',
                        border: `1.5px solid ${showCorrect ? ACCENT : showWrong ? '#FB7185' : 'rgba(255,255,255,0.25)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--em-mono)', fontSize: 11,
                        color: showCorrect ? ACCENT : showWrong ? '#FB7185' : 'rgba(255,255,255,0.6)',
                      }}
                    >{String.fromCharCode(65 + oi)}</span>
                    <span style={{ flex: 1 }}>{opt}</span>
                    {showCorrect && <span aria-hidden="true" style={{ color: ACCENT, fontSize: 18 }}>✓</span>}
                    {showWrong && <span aria-hidden="true" style={{ color: '#FB7185', fontSize: 18 }}>✕</span>}
                  </button>
                );
              })}
            </div>

            {hintShown && !revealed && (
              <div
                role="status"
                style={{
                  marginTop: 4, padding: '10px 12px',
                  background: `${ACCENT}14`,
                  border: `1px dashed ${ACCENT}aa`,
                  borderRadius: 8,
                  fontFamily: 'var(--em-mono)', fontSize: 11,
                  color: 'var(--em-text)', letterSpacing: '0.04em',
                  animation: 'em-tip-fade 220ms var(--em-ease) both',
                }}
              >
                <span className="em-eyebrow" style={{ color: ACCENT, marginRight: 8 }}>HINT</span>
                {cur.hint}
                <div style={{ marginTop: 4, color: 'var(--em-text-muted)' }}>🇵🇱 {cur.hint_pl}</div>
              </div>
            )}

            {revealed && idx < total - 1 && (
              <button
                type="button"
                className="em-btn em-btn-primary"
                onClick={next}
                style={{ alignSelf: 'flex-end' }}
                aria-label="Next frame"
              >
                Next frame →
              </button>
            )}
          </div>

        </div>
      </div>

      {completed && (
        <div
          role="dialog"
          aria-live="assertive"
          aria-label="Photography Salon complete"
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
            The salon dims its lights.
          </div>
          <div className="em-eyebrow">EXHIBITION CLOSES · WYSTAWA ZAMYKA</div>
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
            <button className="em-btn em-btn-ghost" onClick={reset} aria-label="Visit again">
              Visit again
            </button>
          </div>
        </div>
      )}
      <Confetti show={completed} />
    </div>
  );
};

export default PictureQuizShell;
