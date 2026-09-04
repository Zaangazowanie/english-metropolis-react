// StudentPractice.tsx — per-student practice page.
//
// E2E flow (matches Agent 8 / Phase B brief, last-mile wired by FIX-A 2026-04-30):
//   1. Student logs in → StudentAuthContext writes `em-student-session` to localStorage.
//   2. Student navigates to /practice → PracticeNew mounts this component.
//   3. usePracticeSession() reads the slug, fetches /knowledge-base/<slug>.json,
//      normalises via readKB(), and runs pickShellsForStudent() to get 3 picks.
//   4. The user picks ANY of the 10 cards (3 hero + 7 secondary) → useStudentVocab()
//      fetches keywords via practice:getKeywordsByStudentSlug, the matching generator
//      runs, the adapter coerces the output into the shell's internal shape, and the
//      shell renders the GENERATED puzzle (not its built-in sample).
//   5. While playing, useShellProgress(shellKey, exerciseId) saves to Convex
//      practiceProgress on every state change.
//
// REDESIGN (Design Agent / 2026-04-30):
//   The dashboard view is now a tiered "district atlas" — the 3 hook-recommended
//   shells render as hero cards (large, gradient-backed, glass-morphic) and the
//   remaining 7 sit beneath a section divider as compact secondary cards. Every
//   shell is reachable from this page; the recommendation just shapes hierarchy.
//
// This component is a Lexicon thin shell — it intentionally shares no state
// with the design canvas's PracticeCanvas exhibit (still mounted at /practice
// when no student session exists).

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { usePracticeSession } from './lib/usePracticeSession';
import { useStudentVocab, type VocabItem } from './lib/useStudentVocab';
import { useShellProgress } from './lib/convex-stubs';
// InterferenceTip mount removed 2026-05-02 (CD's revised D1). The component
// file is preserved for reuse inside <PracticeReview>'s per-wrong rule callouts.
//
// REWIRED 2026-05-02 (Ricky, CD's revised D1 §4 #10 finding): the auto-open
// "Why this happens" overlay is BACK on per-wrong-attempt — wait for the shell's
// color-state animation (~em-med 320ms), then mount InterferenceTip. The
// review-screen end-of-shell flow stays as-is; the per-wrong tip is a layered
// signal during play, not a replacement for the summary review.
import { InterferenceTip } from './components/InterferenceTip';
import { SessionModal } from './components/SessionModal';
import { useSessionState } from './lib/useSessionState';
import { PracticeReview, type PracticeReviewQuestion } from './components/PracticeReview';
import { renderMCReviewItem, type ShellMultipleChoicePuzzle } from './shells/MultipleChoice';
import { renderGapFillReviewItem } from './shells/GapFill';
// D3 Wave-2 (2026-05-02, Ricky): review-screen renderers for the next 4 shells.
import { renderCrosswordReviewItem } from './shells/Crossword';
import { renderWordsearchReviewItem } from './shells/Wordsearch';
import { renderHangmanReviewItem } from './shells/Hangman';
import { renderMatchingReviewItem } from './shells/Matching';
// D3 Wave-2 (2026-05-02, Ricky — second batch): review-screen renderers for
// the form-shell cluster (DragDrop, GroupSort, TrueFalse, SentenceCorrection,
// SentenceTransform).
import { renderDragDropReviewItem } from './shells/DragDrop';
import { renderGroupSortReviewItem } from './shells/GroupSort';
import { renderTrueFalseReviewItem } from './shells/TrueFalse';
import { renderSentenceCorrectionReviewItem } from './shells/SentenceCorrection';
import { renderSentenceTransformReviewItem } from './shells/SentenceTransform';
// D3 Wave-3 (Ricky 2026-05-02): WordFormation, SpellingBee, TypingTest,
// OpenTheBox, Concentration review-item renderers + payload puzzle types.
import { renderWordFormationReviewItem, type ShellWordFormationPuzzle, type WFItem } from './shells/WordFormation';
import { renderSpellingBeeReviewItem, type ShellSpellingBeePuzzle, type SBWord } from './shells/SpellingBee';
import { renderTypingTestReviewItem, type ShellTypingTestPuzzle, type TTPhrase } from './shells/TypingTest';
import { renderOpenTheBoxReviewItem, type ArcadePuzzle, type ArcadeRound } from './shells/OpenTheBox';
import { renderConcentrationReviewItem, type WrapperPuzzle as ConcentrationPuzzle, type WrapperRound as ConcentrationRound } from './shells/Concentration';
// D3 Wave-4 (Ricky 2026-05-02): arcade-shell review-item renderers. Each
// arcade shell exports the same ArcadeRound/ArcadePuzzle shape so we alias
// per-import to avoid collision with OpenTheBox's exports above.
import { renderSpinTheWheelReviewItem } from './shells/SpinTheWheel';
import { renderRandomWheelReviewItem, TIERS as RW_TIERS } from './shells/RandomWheel';
import { renderRandomCardsReviewItem } from './shells/RandomCards';
import { renderQuizShowReviewItem } from './shells/QuizShow';
import { renderFindTheMatchReviewItem } from './shells/FindTheMatch';
import { renderWhackAMoleReviewItem } from './shells/WhackAMole';
import { renderBalloonPopReviewItem } from './shells/BalloonPop';
import { renderSnakeReviewItem } from './shells/Snake';
import { renderMazeChaseReviewItem } from './shells/MazeChase';
import { renderBattleshipReviewItem } from './shells/Battleship';
// D3 Wave-5 (Ricky 2026-05-02 — FINAL): the last 11 shells. After this all
// 38 shells have review screens.
import { renderAnagramReviewItem } from './shells/Anagram';
import { renderOpenClozeReviewItem, type ShellOpenClozePuzzle, type OCGap } from './shells/OpenCloze';
import { renderFlashcardsReviewItem, type ShellFlashcardsCard } from './shells/Flashcards';
import { renderPictureQuizReviewItem, type ShellPictureQuizItem, type PictureQuizPuzzle } from './shells/PictureQuiz';
import { renderAirplaneReviewItem, type WrapperPuzzle as AirplanePuzzle, type WrapperRound as AirplaneRound } from './shells/Airplane';
import { renderFlyingFruitReviewItem, type WrapperPuzzle as FlyingFruitPuzzle, type WrapperRound as FlyingFruitRound } from './shells/FlyingFruit';
import { renderReadingCompReviewItem, pickReadingCompExcerpt, type ReadingCompPuzzle } from './shells/ReadingComp';
import { renderListeningCompReviewItem, pickListeningCompTranscriptSnippet, type ListeningCompPuzzle } from './shells/ListeningComp';
import { renderSpeakingCardsReviewItem, type ShellSpeakingCard, type SpeakingCardsPuzzle } from './shells/SpeakingCards';
import { renderLabelledDiagramReviewItem, type ShellLabelledDiagramHotspot, type LabelledDiagramPuzzle } from './shells/LabelledDiagram';
import { renderRankOrderReviewItem, type ShellRankOrderItem, type RankOrderPuzzle } from './shells/RankOrder';
import { renderUnjumbleReviewItem, type ShellUnjumbleSentence, type UnjumblePuzzle } from './shells/Unjumble';
import type {
  ShellGapFillPuzzle, ShellGapFillScene,
  ShellCrosswordPuzzle, ShellWordsearchPuzzle,
  ShellHangmanPuzzle, ShellMatchingPuzzle,
  ShellDragDropPuzzle, ShellGroupSortPuzzle, ShellTrueFalsePuzzle,
} from './lib/adapters';
// SentenceCorrection / SentenceTransform shell-side puzzle types live in
// their respective shell .tsx files (per-shell convention).
import type { ShellSentenceCorrectionPuzzle, SCItem } from './shells/SentenceCorrection';
import type { ShellSentenceTransformPuzzle, STItem } from './shells/SentenceTransform';
import { PitchCard } from './components/PitchCard';
import type { ShellKey } from './lib/shell-selector';
import type { PickedShell } from './lib/shell-selector';
import { ErrorBoundary, ShellSpinner } from './components/ErrorBoundary';
// 2026-05-02 (Ricky, post-CD audit §5 Battleship A4 / Bulletin Board A4):
// chrome-immediate scaffolds for the two shells that bore the worst chrome-
// less load (~9-12s of raw "MULTIPLE CHOICE (LOADING EXERCISES)" text). These
// render Nameplate + Bajla + counter shell + scene background + skeleton
// while the lazy chunk + exercises hook resolve. Word Formation's 12s→4s
// recovery earlier today is the model.
import { MultipleChoiceChrome, BattleshipChrome } from './components/ShellChromeScaffolds';
// Sprint-2 (2026-05-02): topic-grouping pages + in-shell context plumbing.
import PracticeGroups from './PracticeGroups';
import GroupDetail from './GroupDetail';
import { GroupContextProvider, type GroupContextValue } from './lib/groupContext';
import { GroupingPill } from './components/GroupingPill';
// A8 (2026-04-30): exercise-bank wiring — when the student picks a shell, we
// first try the personalised exercise bank (KB-enhanced > warm > cold-start
// per useStudentExercises). If exercises produce a usable puzzle we render
// that; otherwise we fall back to the original vocab-derived puzzle, and
// failing that the shell renders its built-in sample.
import { useStudentExercises, type ExerciseDeliveryMode } from './hooks/useStudentExercises';
import { buildPuzzleForShell } from './lib/exercise-adapters';
// Suitability filter — gates vocab/puzzles by content-shape per shell. Root-
// cause fix for Kelly's CC-1 (Picture Quiz / TrueFalse / Word Formation /
// Sentence Correction blockers). Filters BEFORE the generator + sanity-checks
// the generator output. Empty result is fine — buildShellPuzzle returns null
// and the shell renders its built-in demo. See lib/suitability.ts.
import { filterVocabForShell, filterPuzzleForShell } from './lib/suitability';
// Phase 1.1 of the §4-#21 content scheduler (Mike CRITICAL, Ricky 2026-05-02).
// useStudentExposure logs every exercise/keyword the student is shown into
// the Convex `practiceExposure` table so downstream agents (G2 variety guard,
// G3 Leitner spaced-rep, G4 modal) can de-prioritise recently-seen items and
// stop the "same 5-6 sentences across every shell" recycling Mike flagged.
import {
  useStudentExposure,
  useSessionShellHistory,
  extractExerciseItemIds,
  extractKeywordItemIds,
  type ExposureRow,
} from './lib/exposure';
// Phase 1.2 + 1.3 + 1.5 of the §4-#21 content scheduler (Mike CRITICAL,
// Ricky 2026-05-02). Per-keyword exposure budget + Leitner spaced-rep +
// cross-shell variety guard. All three are pure helpers consumed by
// buildShellPuzzle below.
import {
  scheduleVocab,
  type SessionShellHistory,
} from './lib/scheduler';
// Phase 2 of the §4-#21 content scheduler (Mike CRITICAL, Ricky 2026-05-02).
// Sentence-freshness — when a keyword has been recycled across multiple
// shells in the last week, swap its static `exampleEn` with a freshly
// generated Qwen sentence (cached in Convex `sentenceFreshnessCache`).
// The map below is consulted by buildShellPuzzle BEFORE the generators
// run, so every downstream shell gets the fresh sentence transparently.
import { refreshSentencesForVocab } from './lib/sentenceFreshness';
import {
  AccuracyAtSpeed,
  AccuracyAtSpeedChoice,
  AccuracyAtSpeedLauncher,
  type RoundId as AccuracyRoundId,
} from './lessonPractice/AccuracyAtSpeed';

// Generators (deterministic, pure).
import {
  // Original 10
  generateCrossword,
  generateWordsearch,
  generateGapFill,
  generateHangman,
  generateMatching,
  generateFlashcards,
  generateDragDrop,
  generateGroupSort,
  generateTrueFalse,
  generateAnagram,
  // Selection / exam-standard (Agent 1, 2026-05-02)
  generateMultipleChoice,
  generateOpenCloze,
  generateSentenceTransform,
  generateWordFormation,
  generateSentenceCorrection,
  generateSpellingBee,
  generateTypingTest,
  // Arcade / game-feel (Agent 2, 2026-05-02)
  generateOpenTheBoxPuzzle,
  generateSpinTheWheelPuzzle,
  generateWhackAMolePuzzle,
  generateBalloonPopPuzzle,
  generateSnakePuzzle,
  generateMazeChasePuzzle,
  generateBattleshipPuzzle,
  // Reading / listening / ordering (Agent 3, 2026-05-02)
  generateReadingCompPuzzle,
  generateListeningCompPuzzle,
  generatePictureQuizPuzzle,
  generateSpeakingCardsPuzzle,
  generateLabelledDiagramPuzzle,
  generateRankOrderPuzzle,
  generateUnjumblePuzzle,
  // MCQ-wrapper variety (Agent 4, 2026-05-02)
  generateQuizShow,
  generateConcentration,
  generateFindTheMatch,
  generateRandomCards,
  generateRandomWheel,
  generateAirplane,
  generateFlyingFruit,
} from './generators';

// Adapters (generator → shell-internal shape).
import {
  adaptCrossword,
  adaptWordsearch,
  adaptGapFill,
  adaptHangman,
  adaptMatching,
  adaptFlashcards,
  adaptDragDrop,
  adaptGroupSort,
  adaptTrueFalse,
  adaptAnagram,
} from './lib/adapters';

// Reuse the same lazy shells the design canvas does. With FIX-A wired, each
// shell now accepts an optional `puzzle` prop — when supplied, the shell
// renders that data instead of its built-in sample.
//
// We type the lazy components as `ComponentType<any>` so a single Record
// covers all 10 shells (each one has a distinct `puzzle` prop type, but the
// per-key Shell renderer below picks the right one and casts at the boundary).
// 2026-05-02 (Ricky): every shell now has a `default` export that re-exports
// its <Name>Shell. This lets `lazy(() => import('./shells/<Name>'))` resolve
// without a `.then(m => ({ default: m.<Name>Shell }))` wrapper. The wrapper
// was forcing Rollup to emit a tiny stub chunk PER shell in addition to the
// real `shell-<Name>-<hash>.js` chunk emitted by manualChunks — 38 extra
// HTTP requests per session and one of those stubs was the chunk CD's audit
// caught with a missing-on-disk reference. With direct default imports the
// stubs disappear and manualChunks now produces exactly ONE chunk per shell.
const Shells: Record<ShellKey, React.LazyExoticComponent<React.ComponentType<any>>> = {
  // ── Original 10 ────────────────────────────────────────────────────
  crossword:          lazy(() => import('./shells/Crossword')),
  wordsearch:         lazy(() => import('./shells/Wordsearch')),
  gapfill:            lazy(() => import('./shells/GapFill')),
  hangman:            lazy(() => import('./shells/Hangman')),
  matching:           lazy(() => import('./shells/Matching')),
  flashcards:         lazy(() => import('./shells/Flashcards')),
  dragdrop:           lazy(() => import('./shells/DragDrop')),
  groupsort:          lazy(() => import('./shells/GroupSort')),
  truefalse:          lazy(() => import('./shells/TrueFalse')),
  anagram:            lazy(() => import('./shells/Anagram')),
  // ── Selection / exam-standard (Agent 1, 2026-05-02) ────────────────
  multiplechoice:     lazy(() => import('./shells/MultipleChoice')),
  opencloze:          lazy(() => import('./shells/OpenCloze')),
  sentencetransform:  lazy(() => import('./shells/SentenceTransform')),
  wordformation:      lazy(() => import('./shells/WordFormation')),
  sentencecorrection: lazy(() => import('./shells/SentenceCorrection')),
  spellingbee:        lazy(() => import('./shells/SpellingBee')),
  typingtest:         lazy(() => import('./shells/TypingTest')),
  // ── Arcade / game-feel (Agent 2, 2026-05-02) ────────────────────────
  openthebox:         lazy(() => import('./shells/OpenTheBox')),
  spinthewheel:       lazy(() => import('./shells/SpinTheWheel')),
  whackamole:         lazy(() => import('./shells/WhackAMole')),
  balloonpop:         lazy(() => import('./shells/BalloonPop')),
  snake:              lazy(() => import('./shells/Snake')),
  mazechase:          lazy(() => import('./shells/MazeChase')),
  battleship:         lazy(() => import('./shells/Battleship')),
  // ── Reading / listening / ordering (Agent 3, 2026-05-02) ────────────
  readingcomp:        lazy(() => import('./shells/ReadingComp')),
  listeningcomp:      lazy(() => import('./shells/ListeningComp')),
  picturequiz:        lazy(() => import('./shells/PictureQuiz')),
  speakingcards:      lazy(() => import('./shells/SpeakingCards')),
  labelleddiagram:    lazy(() => import('./shells/LabelledDiagram')),
  rankorder:          lazy(() => import('./shells/RankOrder')),
  unjumble:           lazy(() => import('./shells/Unjumble')),
  // ── MCQ-wrapper variety (Agent 4, 2026-05-02) ───────────────────────
  quizshow:           lazy(() => import('./shells/QuizShow')),
  concentration:      lazy(() => import('./shells/Concentration')),
  findthematch:       lazy(() => import('./shells/FindTheMatch')),
  randomcards:        lazy(() => import('./shells/RandomCards')),
  randomwheel:        lazy(() => import('./shells/RandomWheel')),
  airplane:           lazy(() => import('./shells/Airplane')),
  flyingfruit:        lazy(() => import('./shells/FlyingFruit')),
};

const SHELL_LABEL: Record<ShellKey, string> = {
  // Original 10
  crossword:          'Crossword',
  wordsearch:         'Wordsearch',
  gapfill:            'Gap-fill',
  hangman:            'Hangman',
  matching:           'Matching',
  flashcards:         'Flashcards',
  dragdrop:           'Drag-drop',
  groupsort:          'Group sort',
  truefalse:          'True / False',
  anagram:            'Anagram',
  // Selection / exam
  multiplechoice:     'Multiple choice',
  opencloze:          'Open cloze',
  sentencetransform:  'Sentence transformation',
  wordformation:      'Word formation',
  sentencecorrection: 'Sentence correction',
  spellingbee:        'Spelling bee',
  typingtest:         'Typing test',
  // Arcade
  openthebox:         'Open the box',
  spinthewheel:       'Spin the wheel',
  whackamole:         'Whack-a-mole',
  balloonpop:         'Balloon pop',
  snake:              'Snake',
  mazechase:          'Maze chase',
  battleship:         'Battleship',
  // Reading / listening / ordering
  readingcomp:        'Reading comprehension',
  listeningcomp:      'Listening comprehension',
  picturequiz:        'Picture quiz',
  speakingcards:      'Speaking cards',
  labelleddiagram:    'Labelled diagram',
  rankorder:          'Rank order',
  unjumble:           'Unjumble',
  // MCQ-wrappers
  quizshow:           'Quiz show',
  concentration:      'Concentration',
  findthematch:       'Find the match',
  randomcards:        'Random cards',
  randomwheel:        'Random wheel',
  airplane:           'Airplane',
  flyingfruit:        'Flying fruit',
};

// ─────────────────────────────────────────────────────────────────────────────
// District metadata — every shell gets a name, bilingual subtitle, emoji, and
// accent color. Used by both hero and secondary cards. The gradients are
// hand-tuned to feel like neighborhoods at dusk in a fictional metropolis.
// ─────────────────────────────────────────────────────────────────────────────
interface DistrictMeta {
  name: string;
  subtitle: string;
  subtitle_pl: string;
  emoji: string;
  accent: string;
  accentGlow: string;
  gradient: string;
}

const DISTRICTS: Record<ShellKey, DistrictMeta> = {
  crossword: {
    name: 'The Grid District',
    subtitle: 'Plan the city — letter by letter',
    subtitle_pl: 'Krzyżówka — buduj miasto literami',
    emoji: '🔲',
    accent: '#7DD3FC',
    accentGlow: 'rgba(125, 211, 252, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #2D1F4A 50%, #4C2F7E 100%)',
  },
  wordsearch: {
    name: 'The Neon Market',
    subtitle: 'Find the words in the lights',
    subtitle_pl: 'Wykreślanka — znajdź słowa wśród neonów',
    emoji: '🔍',
    accent: '#FBBF24',
    accentGlow: 'rgba(251, 191, 36, 0.55)',
    gradient: 'linear-gradient(135deg, #2A1450 0%, #4A2270 50%, #6A2A8C 100%)',
  },
  gapfill: {
    name: 'The Construction Quarter',
    subtitle: 'Fill the missing pieces',
    subtitle_pl: 'Uzupełnianka — dopełnij brakujące słowa',
    emoji: '🏗️',
    accent: '#FB7185',
    accentGlow: 'rgba(251, 113, 133, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #6E325E 55%, #B85A88 100%)',
  },
  hangman: {
    name: 'The Lantern Alley',
    subtitle: 'Guess before the lights go out',
    subtitle_pl: 'Wisielec — zgadnij, zanim zgasną latarnie',
    emoji: '🏮',
    accent: '#FBBF24',
    accentGlow: 'rgba(251, 191, 36, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #2A1450 50%, #4C1F70 100%)',
  },
  matching: {
    name: 'The Bridge District',
    subtitle: 'Connect the meanings',
    subtitle_pl: 'Łączenie par — buduj mosty znaczeń',
    emoji: '🌉',
    accent: '#A78BFA',
    accentGlow: 'rgba(167, 139, 250, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #251847 55%, #2A1B45 100%)',
  },
  flashcards: {
    name: 'The Library Tower',
    subtitle: 'Memorize, then recall',
    subtitle_pl: 'Fiszki — zapamiętaj i przypomnij',
    emoji: '📚',
    accent: '#34D399',
    accentGlow: 'rgba(52, 211, 153, 0.5)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #1A1538 55%, #1F1240 100%)',
  },
  dragdrop: {
    name: 'The Sorting Station',
    subtitle: 'Drag each piece home',
    subtitle_pl: 'Przenoszenie — uporządkuj elementy',
    emoji: '📦',
    accent: '#7DD3FC',
    accentGlow: 'rgba(125, 211, 252, 0.55)',
    gradient: 'linear-gradient(135deg, #1B1132 0%, #34225C 55%, #4C2F7E 100%)',
  },
  groupsort: {
    name: 'The Roundabout',
    subtitle: 'Sort by category',
    subtitle_pl: 'Sortowanie — pogrupuj słowa',
    emoji: '🔄',
    accent: '#BEF264',
    accentGlow: 'rgba(190, 242, 100, 0.5)',
    gradient: 'linear-gradient(135deg, #110A22 0%, #1E1238 55%, #2A1450 100%)',
  },
  truefalse: {
    name: 'The Courthouse',
    subtitle: 'Spot the truth from the trick',
    subtitle_pl: 'Prawda/Fałsz — odróżnij prawdę od podstępu',
    emoji: '⚖️',
    accent: '#FB7185',
    accentGlow: 'rgba(251, 113, 133, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #2A1450 55%, #4C1F70 100%)',
  },
  anagram: {
    name: 'The Letter Workshop',
    subtitle: 'Rearrange the letters',
    subtitle_pl: 'Anagram — przestaw litery',
    emoji: '🔤',
    accent: '#E879F9',
    accentGlow: 'rgba(232, 121, 249, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #4A2270 55%, #6A2A8C 100%)',
  },
  // ── Selection / exam-standard (Agent 1, 2026-05-02) ─────────────────
  multiplechoice: {
    name: 'The Bulletin Board',
    subtitle: 'Pin the right answer',
    subtitle_pl: 'Tablica ogłoszeń — przypnij właściwą odpowiedź',
    emoji: '📌',
    accent: '#FB7185',
    accentGlow: 'rgba(251, 113, 133, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #4C2755 55%, #7A3960 100%)',
  },
  opencloze: {
    name: 'The Vellum Atelier',
    subtitle: 'Fill the missing words by hand',
    subtitle_pl: 'Pracownia pergaminu — uzupełnij brakujące słowa',
    emoji: '🕯️',
    accent: '#7DD3FC',
    accentGlow: 'rgba(125, 211, 252, 0.55)',
    gradient: 'linear-gradient(135deg, #1A1438 0%, #2D2050 55%, #4A357A 100%)',
  },
  sentencetransform: {
    name: "The Translator's Booth",
    subtitle: 'Rewrite the sentence using the key word',
    subtitle_pl: 'Kabina tłumacza — przepisz zdanie z kluczowym słowem',
    emoji: '🎙️',
    accent: '#A78BFA',
    accentGlow: 'rgba(167, 139, 250, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #251847 55%, #3A2466 100%)',
  },
  wordformation: {
    name: "The Mason's Yard",
    subtitle: 'Carve the right form',
    subtitle_pl: 'Kamieniarski plac — wykuj właściwą formę',
    emoji: '⛏️',
    accent: '#FBBF24',
    accentGlow: 'rgba(251, 191, 36, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #3A2255 55%, #5C3470 100%)',
  },
  sentencecorrection: {
    name: "The Editor's Office",
    subtitle: 'Find the slip, fix the line',
    subtitle_pl: 'Biuro redaktora — znajdź potknięcie, popraw linię',
    emoji: '✏️',
    accent: '#FB7185',
    accentGlow: 'rgba(251, 113, 133, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #4C2755 55%, #7A3960 100%)',
  },
  spellingbee: {
    name: 'The Concert Hall',
    subtitle: 'Listen, then spell to the spotlight',
    subtitle_pl: 'Sala koncertowa — wsłuchaj się i przeliteruj',
    emoji: '🎤',
    accent: '#FBBF24',
    accentGlow: 'rgba(251, 191, 36, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #2A1450 55%, #4C2A70 100%)',
  },
  typingtest: {
    name: 'The Telegraph Office',
    subtitle: 'Speed-type the dispatch',
    subtitle_pl: 'Biuro telegrafu — wystukaj wiadomość na czas',
    emoji: '⚡',
    accent: '#7DD3FC',
    accentGlow: 'rgba(125, 211, 252, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #1F2050 55%, #2D3070 100%)',
  },
  // ── Arcade / game-feel (Agent 2, 2026-05-02) ────────────────────────
  openthebox: {
    name: 'The Vault Room',
    subtitle: 'Open a box, answer to keep it',
    subtitle_pl: 'Skarbiec — otwórz skrytkę, odpowiedz, by zachować',
    emoji: '🗄️',
    accent: '#FBBF24',
    accentGlow: 'rgba(251, 191, 36, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #2A1838 55%, #4A2855 100%)',
  },
  spinthewheel: {
    name: 'The Carnival Wheel',
    subtitle: 'Spin and answer where it lands',
    subtitle_pl: 'Karnawałowe koło — zakręć i odpowiedz',
    emoji: '🎡',
    accent: '#E879F9',
    accentGlow: 'rgba(232, 121, 249, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #5A2A78 55%, #8C3CA0 100%)',
  },
  whackamole: {
    name: 'The Subway Mole',
    subtitle: 'Tap the matching mole before it ducks',
    subtitle_pl: 'Kret na peronie — stuknij właściwego, zanim zniknie',
    emoji: '🔨',
    accent: '#BEF264',
    accentGlow: 'rgba(190, 242, 100, 0.5)',
    gradient: 'linear-gradient(135deg, #110A22 0%, #1E1238 55%, #2C1850 100%)',
  },
  balloonpop: {
    name: 'The Rooftop Garden',
    subtitle: 'Pop the right balloon before it drifts',
    subtitle_pl: 'Ogród na dachu — przebij właściwy balon, zanim odleci',
    emoji: '🎈',
    accent: '#FB7185',
    accentGlow: 'rgba(251, 113, 133, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #6E325E 55%, #B85A88 100%)',
  },
  snake: {
    name: 'The Park Path',
    subtitle: 'Eat the right pellet, avoid the wrong',
    subtitle_pl: 'Ścieżka w parku — zjedz właściwą kulkę, omiń błędną',
    emoji: '🐍',
    accent: '#34D399',
    accentGlow: 'rgba(52, 211, 153, 0.5)',
    gradient: 'linear-gradient(135deg, #0E1A14 0%, #1A2C24 55%, #2A4A38 100%)',
  },
  mazechase: {
    name: 'The Backstreets',
    subtitle: 'Navigate the alleys, collect the answers',
    subtitle_pl: 'Boczne uliczki — przejdź zaułki i zbierz odpowiedzi',
    emoji: '🗺️',
    accent: '#7DD3FC',
    accentGlow: 'rgba(125, 211, 252, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #1F2048 55%, #2D2D6A 100%)',
  },
  battleship: {
    name: 'The Harbour Grid',
    subtitle: 'Call a coordinate, answer the question',
    subtitle_pl: 'Siatka portu — podaj współrzędną, odpowiedz na pytanie',
    emoji: '⚓',
    accent: '#7DD3FC',
    accentGlow: 'rgba(125, 211, 252, 0.55)',
    gradient: 'linear-gradient(135deg, #0E1428 0%, #1A2548 55%, #2A3A6A 100%)',
  },
  // ── Reading / listening / ordering (Agent 3, 2026-05-02) ────────────
  readingcomp: {
    name: 'The Reading Room',
    subtitle: 'Read the passage, answer the questions',
    subtitle_pl: 'Czytelnia — przeczytaj fragment, odpowiedz na pytania',
    emoji: '📖',
    accent: '#34D399',
    accentGlow: 'rgba(52, 211, 153, 0.5)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #1F2050 55%, #34386E 100%)',
  },
  listeningcomp: {
    name: 'The Listening Booth',
    subtitle: 'Listen, then answer',
    subtitle_pl: 'Kabina słuchania — wsłuchaj się i odpowiedz',
    emoji: '🎧',
    accent: '#A78BFA',
    accentGlow: 'rgba(167, 139, 250, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #251847 55%, #3A2466 100%)',
  },
  picturequiz: {
    name: 'The Photography Salon',
    subtitle: 'See the picture, name the thing',
    subtitle_pl: 'Salon fotografii — zobacz zdjęcie, nazwij rzecz',
    emoji: '🖼️',
    accent: '#E879F9',
    accentGlow: 'rgba(232, 121, 249, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #4A2270 55%, #6A2A8C 100%)',
  },
  speakingcards: {
    name: 'The Speakeasy',
    subtitle: 'Read the prompt aloud',
    subtitle_pl: 'Mówiące karty — przeczytaj na głos',
    emoji: '🗣️',
    accent: '#FBBF24',
    accentGlow: 'rgba(251, 191, 36, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #2A1838 55%, #4C2A50 100%)',
  },
  labelleddiagram: {
    name: 'The Atrium Schematic',
    subtitle: 'Drag each label to its place',
    subtitle_pl: 'Schemat atrium — dopasuj etykiety do miejsc',
    emoji: '📐',
    accent: '#7DD3FC',
    accentGlow: 'rgba(125, 211, 252, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #1F2050 55%, #2D3070 100%)',
  },
  rankorder: {
    name: 'The Election Hall',
    subtitle: 'Drag the ballots into priority order',
    subtitle_pl: 'Sala wyborcza — uszereguj według ważności',
    emoji: '🗳️',
    accent: '#BEF264',
    accentGlow: 'rgba(190, 242, 100, 0.5)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #1E2438 55%, #2D3D55 100%)',
  },
  unjumble: {
    name: 'The Puzzle Workshop',
    subtitle: 'Reorder the words into the sentence',
    subtitle_pl: 'Pracownia układanek — ułóż słowa w zdanie',
    emoji: '🧩',
    accent: '#E879F9',
    accentGlow: 'rgba(232, 121, 249, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #3A1F55 55%, #5C2D70 100%)',
  },
  // ── MCQ-wrapper variety (Agent 4, 2026-05-02) ───────────────────────
  quizshow: {
    name: 'The Auditorium',
    subtitle: 'Centre stage. Cameras rolling.',
    subtitle_pl: 'Audytorium — światła, kamery, odpowiedź',
    emoji: '🎭',
    accent: '#FBBF24',
    accentGlow: 'rgba(251, 191, 36, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #2A1450 55%, #4C2A70 100%)',
  },
  concentration: {
    name: 'The Memory Cellar',
    subtitle: 'Flip pairs, hold them in mind',
    subtitle_pl: 'Piwnica pamięci — odkrywaj pary i zapamiętuj',
    emoji: '🃏',
    accent: '#A78BFA',
    accentGlow: 'rgba(167, 139, 250, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #1F1A38 55%, #2D2855 100%)',
  },
  findthematch: {
    name: 'The Lost & Found',
    subtitle: 'Pair the cards on the table',
    subtitle_pl: 'Biuro rzeczy znalezionych — sparuj karty',
    emoji: '🔎',
    accent: '#7DD3FC',
    accentGlow: 'rgba(125, 211, 252, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #1F2048 55%, #2D2D6A 100%)',
  },
  randomcards: {
    name: "The Dealer's Table",
    subtitle: 'Draw a card. Answer it.',
    subtitle_pl: 'Stół krupiera — pociągnij kartę, odpowiedz',
    emoji: '🎴',
    accent: '#FB7185',
    accentGlow: 'rgba(251, 113, 133, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #4C2755 55%, #7A3960 100%)',
  },
  randomwheel: {
    name: 'The Spinner Stand',
    subtitle: 'Spin the vendor wheel',
    subtitle_pl: 'Stoisko z kołem fortuny — zakręć, by wybrać',
    emoji: '🎯',
    accent: '#FBBF24',
    accentGlow: 'rgba(251, 191, 36, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #5A2A78 55%, #8C3CA0 100%)',
  },
  airplane: {
    name: 'The Aerodrome',
    subtitle: 'Fly through the right cloud',
    subtitle_pl: 'Lotnisko — leć przez właściwą chmurę',
    emoji: '✈️',
    accent: '#7DD3FC',
    accentGlow: 'rgba(125, 211, 252, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #1F2548 55%, #2D386A 100%)',
  },
  flyingfruit: {
    name: 'The Orchard Square',
    subtitle: 'Pluck the right fruit on the wing',
    subtitle_pl: 'Sad na placu — złap właściwy owoc w locie',
    emoji: '🍎',
    accent: '#34D399',
    accentGlow: 'rgba(52, 211, 153, 0.5)',
    gradient: 'linear-gradient(135deg, #0E1A14 0%, #1F2C24 55%, #2D4A38 100%)',
  },
};

// Order matters — this array drives the order in user-facing lists. Per Mike
// (2026-05-02): Multiple Choice MUST be #1 because it's the most popular and
// the universal-fallback shell every grouping can render into.
const ALL_SHELLS: ShellKey[] = [
  // ── #1 (Mike's directive) ──
  'multiplechoice',
  // ── Original 10 (preserved order) ──
  'crossword', 'wordsearch', 'gapfill', 'hangman', 'matching',
  'flashcards', 'dragdrop', 'groupsort', 'truefalse', 'anagram',
  // ── New selection / exam ──
  'opencloze', 'sentencetransform', 'wordformation', 'sentencecorrection',
  'spellingbee', 'typingtest',
  // ── New arcade ──
  'openthebox', 'spinthewheel', 'whackamole', 'balloonpop', 'snake',
  'mazechase', 'battleship',
  // ── New reading / listening / ordering ──
  'readingcomp', 'listeningcomp', 'picturequiz', 'speakingcards',
  'labelleddiagram', 'rankorder', 'unjumble',
  // ── New MCQ-wrappers ──
  'quizshow', 'concentration', 'findthematch', 'randomcards',
  'randomwheel', 'airplane', 'flyingfruit',
];

// ─────────────────────────────────────────────────────────────────────────────
// Generator + adapter dispatch — given a shell key + vocab list, build the
// matching puzzle in the shape the shell expects. Returns null when there's
// not enough vocab to feed the generator; the caller falls back to the
// shell's built-in demo in that case (so the page is never blank).
// ─────────────────────────────────────────────────────────────────────────────
// Deterministic seed constant (mixed with vocab length for per-student
// reproducibility — same student gets the same crossword today, fresh one
// tomorrow when they have new keywords).
const EM_PRACTICE_SEED = 0xC1A0BABE;

function buildShellPuzzle(
  shell: ShellKey,
  vocabRaw: VocabItem[],
  // Phase 2 (§4 #21, Ricky 2026-05-02): per-keyword fresh-sentence
  // overlay. Map<lowercased word, fresh sentence>. When a keyword
  // appears in this map AND it has 2+ recent exposures, we replace
  // its static `exampleEn` with the fresh sentence BEFORE the shell-
  // specific generator runs, so every downstream generator (gapfill,
  // multiplechoice, hangman, anagram, crossword, etc.) consumes the
  // fresh text without needing per-generator changes. Empty / missing
  // map → exact same behaviour as before this sprint.
  freshSentenceMap: ReadonlyMap<string, string> = new Map(),
  // Phase 1.2 + 1.3 + 1.5 (§4 #21, Ricky 2026-05-02): rolling-window
  // exposures from `practiceExposure` + the prior-shell history for
  // THIS session. Both default to empty arrays — the scheduler is
  // failure-safe and degrades to the pre-sprint behaviour when neither
  // signal is available (anonymous student, cold cache, network error).
  recent: ReadonlyArray<ExposureRow> = [],
  sessionShells: SessionShellHistory = [],
  // Mike playtest fix (Ricky 2026-05-02): freshnessToken bumps every time
  // the student asks for "New questions" via the SessionModal. Mixed into
  // the generator seed so the deterministic per-vocab-length seed actually
  // yields a different puzzle. Defaults to 0 → pre-fix behaviour.
  freshnessToken: number = 0,
): unknown | null {
  if (!vocabRaw || vocabRaw.length < 3) return null;

  // Pre-generator content-shape gate (Kelly CC-1 fix). Drops vocab items
  // whose shape can't be rendered by the shell mechanic (eg. abstract
  // idioms in Picture Quiz). Empty result → return null and let the shell
  // render its built-in demo puzzle. Most shells pass-through unchanged.
  const vocabFiltered = filterVocabForShell(vocabRaw, shell);
  if (!vocabFiltered || vocabFiltered.length < 3) return null;

  // ── Phase 1.2/1.3/1.5: scheduler pass ────────────────────────────
  // Apply the budget + Leitner + variety-guard chain. scheduleVocab is
  // failure-safe — when `recent` and `sessionShells` are empty (the
  // common case for first-of-day load), it returns vocabFiltered in
  // its original order with weight 1.0 across the board. We keep the
  // post-scheduler pool ≥3 long enough to feed any generator; if the
  // scheduler emptied us out (eg. every keyword is muted), fall back
  // to the pre-scheduler vocabFiltered so the shell still renders.
  let vocabScheduled: VocabItem[] = scheduleVocab(
    vocabFiltered,
    recent,
    shell,
    sessionShells,
  );
  if (vocabScheduled.length < 3) {
    // All keywords are budget-muted or Leitner-not-due. Rather than
    // ship a broken puzzle, drop back to the unscheduled pool — the
    // student gets a slight repeat, but the shell isn't blank. The
    // exposure budget will still log this round, so the next session
    // gets a clean variety pass.
    vocabScheduled = vocabFiltered;
  }

  // Apply the fresh-sentence overlay. Non-mutating — we construct a
  // shallow copy so the upstream `vocabState.vocab` reference stays
  // stable for React.memo / useEffect deps. The cost is one Array.map
  // per puzzle build (negligible vs the generator workloads).
  let vocab: VocabItem[] = freshSentenceMap.size === 0
    ? vocabScheduled
    : vocabScheduled.map((v) => {
        const fresh = freshSentenceMap.get((v.word ?? '').toLowerCase());
        if (!fresh || fresh === v.exampleEn) return v;
        return { ...v, exampleEn: fresh };
      });

  // Mike playtest fix (Ricky 2026-05-02): when freshnessToken > 0 the
  // student explicitly asked for "New questions". Some generators only
  // consume the first N items of vocab (e.g. picturequiz takes 6,
  // multiplechoice takes 8) — so even with a re-rolled seed, identical
  // input order can yield identical puzzles. Shuffle vocab here using a
  // freshnessToken-derived LCG so the first-N slice differs run-to-run.
  if (freshnessToken > 0) {
    const arr = vocab.slice();
    let s = ((freshnessToken | 0) * 1103515245 + 12345) >>> 0;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) >>> 0;
      const j = s % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    vocab = arr;
  }

  // Mike playtest fix (Ricky 2026-05-02): mix freshnessToken into the seed
  // so re-rolls actually produce a different puzzle. The 0x9E3779B9 mixer
  // (golden-ratio prime) avoids low-bit collisions when freshnessToken is
  // small (1, 2, 3...).
  const baseSeed = ((vocab.length * 33) ^ EM_PRACTICE_SEED ^ ((freshnessToken | 0) * 0x9E3779B9)) >>> 0;

  switch (shell) {
    case 'crossword': {
      const input = vocab.map((v) => ({
        word: v.word,
        clue: v.exampleEn ?? `Polish: ${v.word_pl}`,
        clue_pl: v.word_pl,
      }));
      return adaptCrossword(generateCrossword(input, { seed: baseSeed }));
    }
    case 'wordsearch': {
      const input = vocab.map((v) => ({ word: v.word, word_pl: v.word_pl }));
      return adaptWordsearch(generateWordsearch(input, { seed: baseSeed }));
    }
    case 'gapfill': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        exampleEn: v.exampleEn,
      }));
      return adaptGapFill(generateGapFill(input, { seed: baseSeed }));
    }
    case 'hangman': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        clue: v.exampleEn,
      }));
      return adaptHangman(generateHangman(input, { seed: baseSeed }));
    }
    case 'matching': {
      const input = vocab.map((v) => ({ word: v.word, word_pl: v.word_pl }));
      return adaptMatching(generateMatching(input, { seed: baseSeed }));
    }
    case 'flashcards': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        exampleEn: v.exampleEn,
        example_pl: v.example_pl,
      }));
      return adaptFlashcards(generateFlashcards(input, { seed: baseSeed }));
    }
    case 'dragdrop': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        partOfSpeech: v.partOfSpeech,
        topic: v.topic,
      }));
      return adaptDragDrop(generateDragDrop(input, { seed: baseSeed }));
    }
    case 'groupsort': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        partOfSpeech: v.partOfSpeech,
        topic: v.topic,
        category: v.category,
      }));
      return adaptGroupSort(generateGroupSort(input, { seed: baseSeed }));
    }
    case 'truefalse': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        falseFriends: v.falseFriends,
        commonMistakes: v.commonMistakes,
        usageTip: v.usageTip,
      }));
      return adaptTrueFalse(generateTrueFalse(input, { seed: baseSeed }));
    }
    case 'anagram': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        clue: v.exampleEn,
      }));
      return adaptAnagram(generateAnagram(input, { seed: baseSeed }));
    }
    // ── 28 NEW shells (2026-05-02) — Sprint-2 generator wiring (Agent C) ──
    // Each shell ships with its own built-in demo puzzle constant (e.g.
    // MC_PUZZLE in MultipleChoice.tsx). When the generator returns null
    // (insufficient vocab, no template match, etc.), `null` here makes
    // the shell render its demo. When the generator yields a usable
    // puzzle, we return it directly — every shell's puzzle prop is
    // structurally identical to the corresponding generator's output
    // shape, so no adapter is needed in the typical case.

    // ── Selection / exam-standard ─────────────────────────────────────
    case 'multiplechoice': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        partOfSpeech: v.partOfSpeech,
        exampleEn: v.exampleEn,
        exampleEn_pl: v.example_pl,
      }));
      return generateMultipleChoice(input, { seed: baseSeed });
    }
    case 'opencloze': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        partOfSpeech: v.partOfSpeech,
        exampleEn: v.exampleEn,
      }));
      return generateOpenCloze(input, { seed: baseSeed });
    }
    case 'sentencetransform': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        partOfSpeech: v.partOfSpeech,
        exampleEn: v.exampleEn,
      }));
      return generateSentenceTransform(input, { seed: baseSeed });
    }
    case 'wordformation': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        partOfSpeech: v.partOfSpeech,
        exampleEn: v.exampleEn,
      }));
      return generateWordFormation(input, { seed: baseSeed });
    }
    case 'sentencecorrection': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        partOfSpeech: v.partOfSpeech,
        exampleEn: v.exampleEn,
      }));
      return generateSentenceCorrection(input, { seed: baseSeed });
    }
    case 'spellingbee': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        partOfSpeech: v.partOfSpeech,
        exampleEn: v.exampleEn,
        // TODO: generators need media-asset URLs from the asset pipeline
        // (per-word audio_url for the spelling bell). When absent the shell
        // falls back to browser SpeechSynthesis.
      }));
      return generateSpellingBee(input, { seed: baseSeed });
    }
    case 'typingtest': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        exampleEn: v.exampleEn,
        exampleEn_pl: v.example_pl,
      }));
      return generateTypingTest(input, { seed: baseSeed });
    }

    // ── Arcade — all 7 share generateArcade's MCQ-rounds shape ────────
    case 'openthebox':
    case 'spinthewheel':
    case 'whackamole':
    case 'balloonpop':
    case 'snake':
    case 'mazechase':
    case 'battleship': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        clue: v.clue ?? v.exampleEn,
        partOfSpeech: v.partOfSpeech,
        topic: v.topic,
      }));
      switch (shell) {
        case 'openthebox':   return generateOpenTheBoxPuzzle(input, { seed: baseSeed });
        case 'spinthewheel': return generateSpinTheWheelPuzzle(input, { seed: baseSeed });
        case 'whackamole':   return generateWhackAMolePuzzle(input, { seed: baseSeed });
        case 'balloonpop':   return generateBalloonPopPuzzle(input, { seed: baseSeed });
        case 'snake':        return generateSnakePuzzle(input, { seed: baseSeed });
        case 'mazechase':    return generateMazeChasePuzzle(input, { seed: baseSeed });
        case 'battleship':   return generateBattleshipPuzzle(input, { seed: baseSeed });
      }
      return null;
    }

    // ── Reading / listening / ordering ────────────────────────────────
    case 'readingcomp': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        // ReadingComp generator reads from `example` (not `exampleEn`).
        example: v.exampleEn,
        example_pl: v.example_pl,
        partOfSpeech: v.partOfSpeech,
        topic: v.topic,
      }));
      return generateReadingCompPuzzle(input, { seed: baseSeed });
    }
    case 'listeningcomp': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        example: v.exampleEn,
        example_pl: v.example_pl,
        partOfSpeech: v.partOfSpeech,
      }));
      // TODO: generators need media-asset URLs from the asset pipeline.
      // The generator currently emits /practice-audio/<vocabSetId>/<seed>.mp3
      // — until the TTS batch script populates that path the shell will
      // surface its onError fallback (transcript-only mode).
      return generateListeningCompPuzzle(input, { seed: baseSeed, vocabSetId: 'student' });
    }
    case 'picturequiz': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        example: v.exampleEn,
        example_pl: v.example_pl,
        topic: v.topic,
      }));
      // TODO: generators need media-asset URLs from the asset pipeline.
      // The generator emits /practice-images/<vocabSetId>/<slug>.jpg —
      // until the image batch script populates that path the shell will
      // render its emoji fallback glyph per item.
      return generatePictureQuizPuzzle(input, { seed: baseSeed, vocabSetId: 'student' });
    }
    case 'speakingcards': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        example: v.exampleEn,
        example_pl: v.example_pl,
        partOfSpeech: v.partOfSpeech,
      }));
      return generateSpeakingCardsPuzzle(input, { seed: baseSeed });
    }
    case 'labelleddiagram': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        topic: v.topic,
      }));
      // TODO: generators need media-asset URLs from the asset pipeline.
      // The generator emits an inline atrium-schematic SVG fallback PLUS a
      // /practice-diagrams/<vocabSetId>/atrium.svg URL — the inline SVG
      // means the shell is always playable even without the hosted asset.
      return generateLabelledDiagramPuzzle(input, { seed: baseSeed, vocabSetId: 'student' });
    }
    case 'rankorder': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        topic: v.topic,
      }));
      return generateRankOrderPuzzle(input, { seed: baseSeed });
    }
    case 'unjumble': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        example: v.exampleEn,
        example_pl: v.example_pl,
        partOfSpeech: v.partOfSpeech,
      }));
      return generateUnjumblePuzzle(input, { seed: baseSeed });
    }

    // ── MCQ-wrappers — all 7 share wrapperPuzzle's WrapperPuzzle shape ─
    case 'quizshow':
    case 'concentration':
    case 'findthematch':
    case 'randomcards':
    case 'randomwheel':
    case 'airplane':
    case 'flyingfruit': {
      const input = vocab.map((v) => ({
        word: v.word,
        word_pl: v.word_pl,
        partOfSpeech: v.partOfSpeech,
        exampleEn: v.exampleEn,
        exampleEn_pl: v.example_pl,
      }));
      switch (shell) {
        case 'quizshow':      return generateQuizShow(input, { seed: baseSeed });
        case 'concentration': return generateConcentration(input, { seed: baseSeed });
        case 'findthematch':  return generateFindTheMatch(input, { seed: baseSeed });
        case 'randomcards':   return generateRandomCards(input, { seed: baseSeed });
        case 'randomwheel':   return generateRandomWheel(input, { seed: baseSeed });
        case 'airplane':      return generateAirplane(input, { seed: baseSeed });
        case 'flyingfruit':   return generateFlyingFruit(input, { seed: baseSeed });
      }
      return null;
    }

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HeroCard — the large, recommended-pick card. Rank stripe at top, big district
// emoji, district name in Caprasimo, bilingual subtitles, and a why-pick reason
// with the selector weight at the bottom. CSS handles all hover/animation.
// ─────────────────────────────────────────────────────────────────────────────
interface HeroCardProps {
  pick: PickedShell;
  index: number;
  onSelect: (shell: ShellKey) => void;
}

const HeroCard: React.FC<HeroCardProps> = ({ pick, index, onSelect }) => {
  const meta = DISTRICTS[pick.shell];
  const progress = useShellProgress(pick.shell);
  const [selecting, setSelecting] = useState(false);

  const handleClick = () => {
    setSelecting(true);
    // Pulse, then navigate. 200ms keyframe matches em-card-select.
    window.setTimeout(() => onSelect(pick.shell), 220);
  };

  const cardStyle: React.CSSProperties = {
    // Custom properties consumed by the CSS rules (--card-grad, --accent, etc.)
    ['--card-grad' as string]: meta.gradient,
    ['--accent' as string]: meta.accent,
    ['--accent-glow' as string]: meta.accentGlow,
    ['--stagger' as string]: `${index * 80}ms`,
  };

  const stampLabel = pick.shell.slice(0, 3).toUpperCase();

  return (
    <button
      type="button"
      className={`em-hero-card${selecting ? ' is-selecting' : ''}`}
      style={cardStyle}
      onClick={handleClick}
      aria-label={`${meta.name} — ${SHELL_LABEL[pick.shell]}`}
    >
      <div className="em-hero-stamp" aria-hidden>{stampLabel}</div>

      <div className="em-hero-top">
        <div className="em-rank">
          <span className="em-rank-num">{String(index + 1).padStart(2, '0')}</span>
          <span>Recommended · Polecane</span>
        </div>
        {progress.completed && (
          <div className="em-done-badge">Done · Gotowe</div>
        )}
      </div>

      <div className="em-hero-emoji" aria-hidden>{meta.emoji}</div>

      <h3 className="em-district-name">{meta.name}</h3>
      <p className="em-district-sub">{meta.subtitle}</p>
      <p className="em-district-sub-pl">{meta.subtitle_pl}</p>

      <div className="em-hero-foot">
        <div className="em-hero-reason">{pick.reason}</div>
        <div className="em-hero-weight">
          <strong>{pick.weight}</strong>
          weight
        </div>
      </div>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SecondaryCard — compact card for the 7 non-recommended districts. Same
// design vocabulary as the hero, scaled down. Still tappable on mobile.
// ─────────────────────────────────────────────────────────────────────────────
interface SecondaryCardProps {
  shellKey: ShellKey;
  index: number;
  onSelect: (shell: ShellKey) => void;
}

const SecondaryCard: React.FC<SecondaryCardProps> = ({ shellKey, index, onSelect }) => {
  const meta = DISTRICTS[shellKey];
  const progress = useShellProgress(shellKey);
  const [selecting, setSelecting] = useState(false);

  const handleClick = () => {
    setSelecting(true);
    window.setTimeout(() => onSelect(shellKey), 220);
  };

  const cardStyle: React.CSSProperties = {
    ['--card-grad' as string]: meta.gradient,
    ['--accent' as string]: meta.accent,
    ['--accent-glow' as string]: meta.accentGlow,
    ['--stagger' as string]: `${index * 60}ms`,
  };

  return (
    <button
      type="button"
      className={`em-secondary-card${selecting ? ' is-selecting' : ''}`}
      style={cardStyle}
      onClick={handleClick}
      aria-label={`${meta.name} — ${SHELL_LABEL[shellKey]}`}
    >
      {progress.completed && (
        <div className="em-done-badge" aria-label="Completed">Done</div>
      )}

      <div className="em-secondary-emoji" aria-hidden>{meta.emoji}</div>

      <h3 className="em-district-name">{meta.name}</h3>
      <p className="em-district-sub">{meta.subtitle}</p>
      <p className="em-district-sub-pl">{meta.subtitle_pl}</p>

      <div className="em-secondary-foot">
        <span className="em-secondary-tag">{SHELL_LABEL[shellKey]}</span>
        <span className="em-secondary-arrow" aria-hidden>→</span>
      </div>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ModeBanner — A8 (2026-04-30). Tiny ribbon above the active shell showing
// which delivery mode picked the puzzle. Mode A (cold-start), Mode B (warm),
// Mode C (KB-enhanced). Reason text comes from useStudentExercises.reasonString.
//
// Visual: subtle eyebrow row, mono caps tag + reason. Inline-styled so we
// don't spread CSS across files for a one-line element.
// ─────────────────────────────────────────────────────────────────────────────
const MODE_TAG: Record<ExerciseDeliveryMode, { label: string; accent: string }> = {
  'cold-start':  { label: 'MODE A · COLD START',     accent: '#7DD3FC' },
  'warm':        { label: 'MODE B · ADAPTIVE',       accent: '#FBBF24' },
  'kb-enhanced': { label: 'MODE C · PERSONALISED',   accent: '#E879F9' },
};

const ModeBanner: React.FC<{ mode: ExerciseDeliveryMode; reasonString: string }> = ({
  mode,
  reasonString,
}) => {
  const tag = MODE_TAG[mode];
  return (
    <div
      role="status"
      aria-label={`Practice source: ${tag.label}. ${reasonString}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 14px',
        marginBottom: 12,
        borderRadius: 999,
        border: `1px solid ${tag.accent}33`,
        background: `${tag.accent}0F`,
        color: 'var(--em-text, #EDE6FF)',
        fontFamily: 'var(--em-mono, monospace)',
        fontSize: 13,
        letterSpacing: '0.12em',
        lineHeight: 1.4,
        maxWidth: 'fit-content',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: tag.accent,
          boxShadow: `0 0 8px ${tag.accent}99`,
          flexShrink: 0,
        }}
      />
      <span style={{ color: tag.accent, fontWeight: 600 }}>{tag.label}</span>
      <span
        style={{
          color: 'var(--em-text-muted, #9A8FB8)',
          textTransform: 'none',
          letterSpacing: '0.01em',
          fontSize: 13,
        }}
      >
        {reasonString}
      </span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// StudentPractice — main entry. Three states:
//   - loading        → minimal placeholder
//   - error (real)   → error card
//   - activeShell    → render the lazy shell with generated puzzle
//   - default        → the district atlas dashboard
// ─────────────────────────────────────────────────────────────────────────────
// Layer-4 wrong-answer info shape — mirrors the optional callback prop the
// shells now expose. Kept inline (not exported) since only StudentPractice
// renders the InterferenceTip today.
interface WrongAnswerInfo {
  questionId: string;
  studentAnswer: string;
  correctAnswer: string;
  explanationPL?: string;
  exerciseId?: string;
  /**
   * Optional prompt/context string forwarded to the v4 correction adapter
   * as `context`. When the shell doesn't pass an explicit prompt we fall
   * back to questionId. Added 2026-05-02 for the /api/correction wiring.
   */
  prompt?: string;
}

export function StudentPractice(): React.ReactElement {
  const { slug: routeSlug } = useParams<{ slug?: string }>();
  const session = usePracticeSession(routeSlug);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeShell, setActiveShell] = useState<ShellKey | null>(null);
  const [accuracySelection, setAccuracySelection] = useState<AccuracyRoundId | 'all' | null>(null);
  const [accuracyMode, setAccuracyMode] = useState<'choice' | 'speech' | null>(null);
  const accuracyProgress = useShellProgress(
    'accuracy-at-speed',
    'aleksandra-accuracy-at-speed-2026-07-29',
  );

  const openAccuracyChoice = useCallback(() => {
    setAccuracyMode('choice');
    setAccuracySelection(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('activity', 'accuracy-at-speed');
      next.set('mode', 'choice');
      next.delete('round');
      return next;
    });
  }, [setSearchParams]);

  const openAccuracySpeech = useCallback((round: AccuracyRoundId | 'all' = 'all') => {
    setAccuracyMode('speech');
    setAccuracySelection(round);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('activity', 'accuracy-at-speed');
      next.set('mode', 'speech');
      next.set('round', round);
      return next;
    });
  }, [setSearchParams]);

  const closeAccuracy = useCallback(() => {
    setAccuracyMode(null);
    setAccuracySelection(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('activity');
      next.delete('mode');
      next.delete('round');
      return next;
    });
  }, [setSearchParams]);

  useEffect(() => {
    if (session.studentSlug !== 'aleksandra-gorska') return;
    if (searchParams.get('activity') !== 'accuracy-at-speed') return;
    if (searchParams.get('mode') === 'speech') {
      const requested = searchParams.get('round');
      const supported: Array<AccuracyRoundId | 'all'> = ['all', 'P', 'A', 'B', 'C', 'D', 'D2'];
      const round = supported.includes(requested as AccuracyRoundId | 'all')
        ? requested as AccuracyRoundId | 'all'
        : 'all';
      setAccuracyMode('speech');
      setAccuracySelection(round);
    } else {
      setAccuracyMode('choice');
      setAccuracySelection(null);
    }
  }, [searchParams, session.studentSlug]);
  // ── Sprint-2 (2026-05-02): topic-grouping nav state ────────────────────
  // currentView toggles between the atlas (default), the topic-groups card
  // grid, and a per-group detail page. activeGroup carries the context that
  // gets propagated INTO any shell launched from a group, so the shell can
  // render the GroupingPill + filter exercises to that grouping's pool.
  const [currentView, setCurrentView] = useState<'atlas' | 'groups' | 'group-detail'>('atlas');
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<GroupContextValue | null>(null);

  // Layer-4 D1 auto-open (Ricky, 2026-05-02 — CD's audit §4 #10):
  //   wrong answer → wait for color-state animation (--em-med, 0.32s) →
  //   mount InterferenceTip with aria-modal=true, focus-trapped, dismissable
  //   via Esc / backdrop / Got it.
  //
  // Skip path: shells don't fire onWrongAnswer on skip — current behavior
  // preserved. Correct path: same — onWrongAnswer never fires on correct.
  //
  // Opt-out: localStorage `em.d1AutoOpen` (default 'true'). When 'false',
  // wrong answers are dropped on the floor at this layer and the student
  // gets the original behavior (no per-wrong overlay; only the review
  // screen at end-of-shell). A future "Why?" button hook can read the
  // pref and surface the same tip on demand.
  const D1_AUTOOPEN_KEY = 'em.d1AutoOpen';
  const D1_ANIM_MS = 320; // matches --em-med in styles/global.css
  const [tipInfo, setTipInfo] = useState<WrongAnswerInfo | null>(null);
  // Mirrors `localStorage.em.d1AutoOpen === 'false'`. Default false (i.e.
  // auto-open ON). Hydrated on mount from localStorage; toggling the checkbox
  // both updates state AND persists to localStorage so future sessions honor it.
  const [d1OptOut, setD1OptOut] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const pref = window.localStorage.getItem(D1_AUTOOPEN_KEY);
      if (pref === 'false') setD1OptOut(true);
    } catch { /* ignore */ }
  }, []);
  const handleAutoOpenOptOutChange = useCallback((optOut: boolean) => {
    setD1OptOut(optOut);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(D1_AUTOOPEN_KEY, optOut ? 'false' : 'true');
      } catch { /* ignore */ }
    }
  }, []);
  const wrongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleWrongAnswer = useCallback((info: WrongAnswerInfo) => {
    // Respect the opt-out preference. Default: auto-open ON.
    if (typeof window !== 'undefined') {
      try {
        const pref = window.localStorage.getItem(D1_AUTOOPEN_KEY);
        if (pref === 'false') return;
      } catch { /* localStorage unavailable — proceed with default-on */ }
    }
    // Cancel any in-flight timer (handles back-to-back wrongs cleanly).
    if (wrongTimerRef.current !== null) {
      clearTimeout(wrongTimerRef.current);
      wrongTimerRef.current = null;
    }
    // Wait for the shell's wrong-state color animation to play, THEN open.
    // setTimeout is intentional — it lets the inline shake/red-flash land
    // before the modal pulls focus. Matches CD's directive verbatim.
    wrongTimerRef.current = setTimeout(() => {
      wrongTimerRef.current = null;
      setTipInfo(info);
    }, D1_ANIM_MS);
  }, []);
  const handleTipDismiss = useCallback(() => {
    setTipInfo(null);
  }, []);
  // Cleanup the pending timer on unmount so we don't open the tip on a
  // detached host (e.g. the user navigates back to the atlas mid-animation).
  useEffect(() => {
    return () => {
      if (wrongTimerRef.current !== null) {
        clearTimeout(wrongTimerRef.current);
        wrongTimerRef.current = null;
      }
    };
  }, []);

  // D3 (2026-05-02): end-of-shell review screen state. When a shell that
  // implements the new onSessionComplete contract finishes, it hands the
  // session payload up; <PracticeReview> then mounts on top of the shell
  // area until the student picks Try another / Next district.
  //
  // Blocker-3 (CD's audit, same date): the review must survive a tab refresh.
  // sessionId goes into the URL as ?review=<id>; on mount we scan localStorage
  // for the matching `em:practice:review:*:<id>` key and rehydrate.
  const [reviewSession, setReviewSession] = useState<{
    districtId: ShellKey;
    sessionId: string;
    payload: unknown;
  } | null>(null);

  // ── URL ↔ reviewSession sync ─────────────────────────────────────────
  // Read the URL once on mount + restore from localStorage if a session is
  // pinned via ?review=...
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const sid = url.searchParams.get('review');
    if (!sid) return;
    // Find the localStorage entry that matches this sessionId.
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k || !k.startsWith('em:practice:review:')) continue;
        if (!k.endsWith(`:${sid}`)) continue;
        const raw = window.localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as {
          districtId: string;
          sessionId: string;
          totalQuestions: number;
          correctCount: number;
          wrongAttempts: unknown[];
          questionIds: string[];
        };
        // Need the puzzle data to render — we don't persist that, so the
        // restored review uses degraded mode (just the summary + questionIds).
        // Better than dropping the user back at /practice. Mark as 'restored'
        // by setting payload as a partial.
        setActiveShell(parsed.districtId as ShellKey);
        setReviewSession({
          districtId: parsed.districtId as ShellKey,
          sessionId: parsed.sessionId,
          payload: { ...parsed, _restored: true },
        });
        break;
      }
    } catch { /* localStorage unavailable — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push/clear the URL param when reviewSession changes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (reviewSession) {
      url.searchParams.set('review', reviewSession.sessionId);
    } else {
      url.searchParams.delete('review');
    }
    window.history.replaceState(null, '', url.toString());
  }, [reviewSession]);
  // ── Phase 1.8 §4 #21 (Mike's add-on): mid-shell session snapshot +
  // resume modal. The hook owns the Convex round-trips against the
  // `practiceSession` table; this component just mounts <SessionModal />
  // when there's a pendingSession and routes the user's choice back into
  // the hook. See SessionModal.tsx + useSessionState.ts.
  //
  // shellSession is keyed on activeShell so switching districts re-keys
  // the hook (independent prompt per shell). Anonymous students get a
  // no-op hook (pendingSession === null), so the modal renders nothing.
  const shellSession = useSessionState(activeShell);
  // resumeHydration is the saved state blob the student opted to resume.
  // The shell consumes it via the new `resumeState` prop (shells that
  // don't yet honor the prop still get the modal — they just always
  // fresh-start, which preserves today's behavior).
  const [resumeHydration, setResumeHydration] = useState<unknown | null>(null);
  // reuseQuestionIds is the snapshot's question set when the student
  // picked Repeat same. Shells that consume it pass it to the puzzle
  // generator so the same questions resurface.
  const [reuseQuestionIds, setReuseQuestionIds] = useState<string[] | null>(null);
  // Mike playtest fix (Ricky 2026-05-02): freshnessToken bumps every time
  // the student asks for "New questions" from the SessionModal. The seed
  // computation in buildShellPuzzle mixes this in, forcing a different
  // shuffle / pick each time even when the underlying vocab pool hasn't
  // changed. Without this, generators are deterministic on (vocab.length,
  // EM_PRACTICE_SEED) — so "New questions" returned the IDENTICAL puzzle.
  // Also tracks the prior session's questionIds so the puzzle generator
  // can EXCLUDE them from the next selection when the pool is large enough.
  const [freshnessToken, setFreshnessToken] = useState<number>(0);
  const [excludeQuestionIds, setExcludeQuestionIds] = useState<string[] | null>(null);

  // Mid-shell snapshot: subscribe to the same useShellProgress row the
  // shell writes to, then funnel state changes into the debounced
  // snapshot. This is observability — the hook coalesces 10s of
  // changes into one Convex write per the spec.
  // Note: this is a SECOND useShellProgress mount alongside the shell's
  // own. Both hit the same Convex row; the optimistic local state is
  // independent but the source of truth is shared.
  const shellProgressMirror = useShellProgress(activeShell ?? 'crossword');
  useEffect(() => {
    if (!activeShell) return;
    if (!shellSession) return;
    // Skip the initial empty mount — only snapshot once we have meaningful
    // state to persist. lastState !== undefined OR meta defined OR progress > 0
    // is the heuristic for "the shell has actually started writing".
    const hasMeaningfulState =
      (shellProgressMirror.progress ?? 0) > 0 ||
      shellProgressMirror.lastState !== undefined ||
      shellProgressMirror.meta !== undefined;
    if (!hasMeaningfulState) return;
    // questionIds is best-effort — the shell may stash them under
    // `meta.questionIds` (convention) so we extract them when present.
    const meta = shellProgressMirror.meta as { questionIds?: string[] } | undefined;
    const qids = Array.isArray(meta?.questionIds) ? meta.questionIds : [];
    shellSession.snapshot(
      {
        progress: shellProgressMirror.progress,
        completed: shellProgressMirror.completed,
        hintsUsed: shellProgressMirror.hintsUsed,
        lastState: shellProgressMirror.lastState,
        meta: shellProgressMirror.meta,
      },
      qids,
    );
  }, [
    activeShell,
    shellSession,
    shellProgressMirror.progress,
    shellProgressMirror.completed,
    shellProgressMirror.hintsUsed,
    shellProgressMirror.lastState,
    shellProgressMirror.meta,
  ]);

  const handleSessionContinue = useCallback(() => {
    const blob = shellSession.continueSession();
    setResumeHydration(blob);
    setReuseQuestionIds(null);
  }, [shellSession]);
  const handleSessionStartFreshNew = useCallback(async () => {
    // Capture the prior questionIds BEFORE startFresh consumes them, so we
    // can exclude them from the next pick when the pool is large enough.
    // The hook returns reuseQuestionIds=null on newQuestions=true — but
    // pendingSession still has the prior list right now (the modal hasn't
    // unmounted yet from the user's perspective).
    const priorIds = shellSession.pendingSession?.questionIds ?? null;
    const r = await shellSession.startFresh({ newQuestions: true });
    setResumeHydration(r.state);
    setReuseQuestionIds(null);
    // Bump the freshness token so the seed re-rolls and the generator
    // produces a different shuffle even if the vocab pool is unchanged.
    setFreshnessToken((t) => t + 1);
    // Exclude the prior session's questionIds — buildShellPuzzle / the
    // memoised vocabPool path will skip them when the resulting pool is
    // still big enough (>= 2x the prior session size). When the pool is
    // shallow, exclude is treated as a soft hint (re-shuffle only).
    setExcludeQuestionIds(priorIds && priorIds.length > 0 ? priorIds : null);
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[SessionModal] New questions — excluding prior IDs:', priorIds);
    }
  }, [shellSession]);
  const handleSessionStartFreshSame = useCallback(async () => {
    const r = await shellSession.startFresh({ newQuestions: false });
    setResumeHydration(r.state);
    setReuseQuestionIds(r.reuseQuestionIds);
    setExcludeQuestionIds(null);
    // Don't bump freshnessToken — same questions, same seed → same puzzle.
  }, [shellSession]);

  // Reset resume hints when leaving the shell.
  useEffect(() => {
    if (!activeShell) {
      setResumeHydration(null);
      setReuseQuestionIds(null);
      setExcludeQuestionIds(null);
      // freshnessToken intentionally NOT reset — it's a monotonic counter
      // that mixes into the seed; resetting would risk repeating an old
      // puzzle if the student bounces between shells.
    }
  }, [activeShell]);

  const handleSessionComplete = useCallback((info: unknown) => {
    if (!activeShell) return;
    // Mark the row complete so the next entry doesn't re-prompt resume.
    void shellSession.markComplete();
    setReviewSession({
      districtId: activeShell,
      sessionId: `${activeShell}-${Date.now().toString(36)}`,
      payload: info,
    });
  }, [activeShell, shellSession]);
  const reviewTryAnother = useCallback(() => {
    setReviewSession(null);
    // staying on the same shell triggers a fresh session via the shell's reset
  }, []);
  const reviewNextDistrict = useCallback(() => {
    setReviewSession(null);
    setActiveShell(null);
  }, []);

  // Vocab fetch is keyed on the student slug. We fetch eagerly (not lazily on
  // shell-pick) so the puzzle is ready the instant the user clicks a card.
  const vocabState = useStudentVocab(session.studentSlug, { limit: 60 });

  // ── A8 (2026-04-30): exercise-bank fetch ────────────────────────────────
  // Hooks must run unconditionally, so we always invoke useStudentExercises.
  // When activeShell is null we pass a stable placeholder ('crossword') —
  // the result is ignored until activeShell becomes truthy.
  const exerciseState = useStudentExercises({
    shellKey: activeShell ?? 'crossword',
    studentSlug: session.studentSlug,
    // Sprint-2 Finding 2 fix (CD audit, 2026-05-02): when the shell was
    // launched from a topic-grouping card, scope the puzzle pool to that
    // group's exercises via the by_groupId index. Falls back to the broad
    // CEFR-window pool when activeGroup is null (ad-hoc 38-pill catalog).
    groupId: activeGroup?.groupId,
  });

  // Exercise-derived puzzle (preferred). null when:
  //   - no shell is active
  //   - the exercise hook hasn't returned data yet (loading / idle / error)
  //   - the exercise list is empty
  //   - the per-shell adapter returned null (not enough data of the right type)
  //
  // G3 (Mike, 2026-05-02): when the student picked "Repeat same" from the
  // SessionModal, reuseQuestionIds carries the prior snapshot's questionIds.
  // Filter the source exercise list down to that set before handing to the
  // adapter so the regenerated puzzle is the same questions as before.
  // Falls back gracefully when the intersection is empty (e.g. exercises
  // were unpublished between sessions) — the unfiltered list is used so
  // the student still gets a playable puzzle.
  const exercisePuzzle = useMemo(() => {
    if (!activeShell) return null;
    if (exerciseState.status !== 'ready') return null;
    if (!exerciseState.exercises || exerciseState.exercises.length === 0) return null;
    let pool = exerciseState.exercises;
    if (reuseQuestionIds && reuseQuestionIds.length > 0) {
      const want = new Set(reuseQuestionIds);
      const filtered = pool.filter((ex) => want.has(String((ex as { _id?: unknown })._id ?? '')));
      if (filtered.length > 0) pool = filtered;
    } else if (excludeQuestionIds && excludeQuestionIds.length > 0) {
      // Mike playtest fix (Ricky 2026-05-02): "New questions" should EXCLUDE
      // prior IDs when the pool is large enough (≥ 2× prior session size).
      // Otherwise, just shuffle (handled implicitly by the freshnessToken-
      // mixed seed inside buildPuzzleForShell when supported).
      const skip = new Set(excludeQuestionIds);
      const remaining = pool.filter((ex) => !skip.has(String((ex as { _id?: unknown })._id ?? '')));
      if (remaining.length >= excludeQuestionIds.length * 2) {
        pool = remaining;
      } else {
        // Pool too shallow to fully exclude — shuffle to at least vary
        // ordering. Fisher-Yates with a freshnessToken-derived seed.
        const seed = (freshnessToken * 9301 + 49297) % 233280;
        const shuffled = pool.slice();
        let s = seed;
        for (let i = shuffled.length - 1; i > 0; i--) {
          s = (s * 9301 + 49297) % 233280;
          const j = Math.floor((s / 233280) * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        pool = shuffled;
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      const ids = pool.slice(0, 8).map((ex) => String((ex as { _id?: unknown })._id ?? ''));
      // eslint-disable-next-line no-console
      console.log('[exercisePuzzle] freshness=' + freshnessToken,
        'reuse=' + (reuseQuestionIds?.length ?? 0),
        'exclude=' + (excludeQuestionIds?.length ?? 0),
        'first8 ids:', ids);
    }
    return buildPuzzleForShell(activeShell, pool);
  }, [activeShell, exerciseState.status, exerciseState.exercises, reuseQuestionIds, excludeQuestionIds, freshnessToken]);

  // ── Phase 1.1 + Phase 2 content scheduler (Ricky, audit §4 #21) ────────
  // Phase 1.1: useStudentExposure logs every exercise/keyword shown to the
  // student into Convex `practiceExposure`. Both this Phase-2 freshness
  // effect AND the puzzle-recording effect below depend on it, so the
  // hook must be declared up-front. (Was lower in the file before Phase 2
  // landed — moved up 2026-05-02 by Ricky.)
  const exposure = useStudentExposure();
  // Phase 1.5 (variety guard): localStorage-backed list of itemIds shown
  // in each prior shell THIS session (1h rollover). Read in buildShellPuzzle
  // to demote keywords that already appeared in another shell this hour;
  // appended to in the per-shell exposure-recording effect below. Pure
  // additive — empty history degrades to weight 1.0 across the board.
  const sessionShellHistory = useSessionShellHistory();

  // ── Phase 2 (§4 #21, Ricky 2026-05-02): sentence-freshness overlay ─────
  // When the variety guard sees a keyword with ≥2 recent exposures,
  // refreshSentencesForVocab returns a Map<word, freshSentence> sourced
  // from the Convex sentenceFreshnessCache (or kicks off a background
  // Qwen warm if cold). The map is consulted by buildShellPuzzle below
  // BEFORE the per-shell generators run — so all 38 shells benefit from
  // the freshness layer with zero per-shell wiring.
  //
  // Conservative semantics: if the map is empty (anonymous student,
  // network error, model down, cache cold), the puzzle build is
  // identical to the pre-Phase-2 behaviour. Never breaks an existing
  // flow — this is purely additive.
  const [freshSentenceMap, setFreshSentenceMap] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    if (!vocabState.vocab || vocabState.vocab.length === 0) return;
    let cancelled = false;
    // Build a per-item exposure count summary from the Phase 1.1 hook.
    const counts = exposure.recentExposures.reduce<Map<string, number>>(
      (acc, row) => {
        acc.set(row.itemId, (acc.get(row.itemId) ?? 0) + 1);
        return acc;
      },
      new Map(),
    );
    const exposureCounts = Array.from(counts.entries()).map(([itemId, count]) => ({
      itemId,
      count,
    }));
    // Heuristic: Aleksandra is B1 in CD's audit but B2 in earlier records.
    // We pick the student's CEFR off the first vocab row that carries
    // `difficulty`, falling back to "B2" (the most-common bucket).
    const cefr = vocabState.vocab.find((v) => v.difficulty)?.difficulty ?? 'B2';
    void refreshSentencesForVocab(
      vocabState.vocab.map((v) => ({
        word: v.word,
        exampleEn: v.exampleEn,
        topic: v.topic ?? (v.topics ?? [])[0],
      })),
      cefr,
      exposureCounts,
    ).then((map) => {
      if (cancelled) return;
      // Replace if non-empty — empty results mean every keyword's cache
      // was cold, which is fine; we just don't shadow `exampleEn`.
      if (map.size > 0) setFreshSentenceMap(map);
    });
    return () => {
      cancelled = true;
    };
    // Re-run when vocab or recent-exposures change. We deliberately
    // exclude `exposure` itself (the hook return) — only the data
    // matters, not the function-identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vocabState.vocab, exposure.recentExposures]);

  // Vocab-derived puzzle (fallback). Same semantics as before A8 — except
  // the vocab is overlaid with the Phase 2 freshness map first.
  // Sanity-check the generator output via filterPuzzleForShell — drops e.g.
  // word-formation identity transforms (RESILIENCE → NOUN), sentence-correction
  // missing-word errors (no wrong word to tap), TF gap-fill prompts that slip
  // through, and crossword/wordsearch entries with duplicate clues.
  const vocabPuzzle = useMemo(() => {
    if (!activeShell) return null;
    // G3 (Mike, 2026-05-02): "Repeat same" gates the vocab pool to the
    // saved snapshot's questionIds. The snapshot stores keyword ids as
    // `kw:<lowercase>` (see the recordExposures effect below), so we
    // strip the prefix and match on lowercased word.
    let vocabPool = vocabState.vocab;
    if (reuseQuestionIds && reuseQuestionIds.length > 0) {
      const want = new Set<string>();
      for (const qid of reuseQuestionIds) {
        if (qid.startsWith('kw:')) {
          want.add(qid.slice(3).toLowerCase());
        } else {
          want.add(qid.toLowerCase());
        }
      }
      const filtered = vocabPool.filter((v) => want.has((v.word ?? '').toLowerCase()));
      if (filtered.length > 0) vocabPool = filtered;
    } else if (excludeQuestionIds && excludeQuestionIds.length > 0) {
      // Mike playtest fix (Ricky 2026-05-02): "New questions" should
      // EXCLUDE the prior session's keywords from the next pool when
      // there's room to do so. Decode kw:<word> ids → lowercased words.
      const skip = new Set<string>();
      for (const qid of excludeQuestionIds) {
        if (qid.startsWith('kw:')) skip.add(qid.slice(3).toLowerCase());
        else skip.add(qid.toLowerCase());
      }
      const remaining = vocabPool.filter((v) => !skip.has((v.word ?? '').toLowerCase()));
      if (remaining.length >= excludeQuestionIds.length * 2) {
        vocabPool = remaining;
      }
      // Else pool is too shallow — keep all words but rely on the
      // freshnessToken-mixed seed inside buildShellPuzzle to reshuffle.
    }
    const raw = buildShellPuzzle(
      activeShell,
      vocabPool,
      freshSentenceMap,
      // Phase 1.2 + 1.3 + 1.5: scheduler inputs. Both default to []
      // inside buildShellPuzzle, so an empty exposure log + empty session
      // history degrades to the pre-sprint behaviour.
      exposure.recentExposures,
      sessionShellHistory.sessionShells,
      // Mike playtest fix (Ricky 2026-05-02): freshnessToken bumps when the
      // student picks "New questions" — buildShellPuzzle mixes it into the
      // generator seed so the same vocab pool yields a DIFFERENT puzzle.
      freshnessToken,
    );
    if (process.env.NODE_ENV !== 'production') {
      const sample = vocabPool.slice(0, 8).map((v) => v.word);
      // eslint-disable-next-line no-console
      console.log('[vocabPuzzle] freshness=' + freshnessToken,
        'reuse=' + (reuseQuestionIds?.length ?? 0),
        'exclude=' + (excludeQuestionIds?.length ?? 0),
        'first8 words:', sample);
    }
    return filterPuzzleForShell(activeShell, raw);
  }, [
    activeShell,
    vocabState.vocab,
    freshSentenceMap,
    exposure.recentExposures,
    sessionShellHistory.sessionShells,
    reuseQuestionIds,
    excludeQuestionIds,
    freshnessToken,
  ]);

  // Final puzzle: prefer exercise-derived → vocab-derived → undefined
  // (shells render their built-in sample on undefined).
  const generatedPuzzle = exercisePuzzle ?? vocabPuzzle;

  // ── Phase 1.1 content scheduler (Ricky, audit §4 #21) ─────────────────
  // Once the puzzle is materialised for the current shell, log every
  // exercise/keyword visible in it to the `practiceExposure` Convex
  // table. Fire-and-forget — the hook handles dedupe + anonymous no-op.
  // This is observability only; the variety-guard / Leitner / modal
  // consumers are separate agents (G2 / G3 / G4).
  // (`exposure` declared earlier at the Phase 1.1+2 block — see above.)
  useEffect(() => {
    if (!activeShell) return;
    // Prefer the exercise-derived path — exerciseIds are stable across
    // sessions. When the puzzle came from the vocab fallback, fall
    // back to keyword-word ids (kw:<lowercase>).
    let items: ReturnType<typeof extractExerciseItemIds> = [];
    if (exercisePuzzle && exerciseState.status === 'ready') {
      items = extractExerciseItemIds(exerciseState.exercises);
    } else if (vocabPuzzle && vocabState.vocab && vocabState.vocab.length > 0) {
      items = extractKeywordItemIds(vocabState.vocab);
    }
    if (items.length === 0) return;
    exposure.recordExposureBatch(items, activeShell);
    // Phase 1.5: append the itemIds shown in this shell to the session
    // history so the NEXT shell's variety-guard pass demotes anything
    // that already appeared here. Cheap synchronous localStorage write.
    sessionShellHistory.pushShell(
      activeShell,
      items.map((it) => it.itemId),
    );
    // We deliberately DON'T await refreshRecentExposures here — the
    // freshly-recorded batch will appear on the next manual refresh
    // (or on next mount). G2 reads on mount; that's enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShell, exercisePuzzle, vocabPuzzle, exerciseState.status]);

  // Recommended-shell keys for fast lookup when filtering the secondary grid.
  // Fix-4 (2026-04-30): we cap picks at 3 (the picker contract) and dedupe
  // defensively before building the Set so the secondary grid always renders
  // exactly `ALL_SHELLS.length - 3 = 7` cards, even if a future picker
  // regression smuggles in a duplicate or a 4th pick. We also log a dev-mode
  // warning if the contract is violated so the bug doesn't get silently
  // re-introduced. Invariant under healthy data:
  //   ALL_SHELLS.length === 10, picks.length === 3, otherShells.length === 7.
  const recommendedKeys = useMemo(() => {
    const uniq = new Set<ShellKey>();
    for (const p of session.picks) {
      if (ALL_SHELLS.includes(p.shell)) uniq.add(p.shell);
      if (uniq.size >= 3) break;
    }
    return uniq;
  }, [session.picks]);
  const otherShells = useMemo(
    () => ALL_SHELLS.filter((k) => !recommendedKeys.has(k)),
    [recommendedKeys],
  );
  // Dev-only sanity check — surfaces any regression where picks ≠ 3 or
  // otherShells ≠ 7. Vite's tree-shaker drops this in production.
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production' && session.picks.length > 0) {
    const expectedOthers = ALL_SHELLS.length - recommendedKeys.size;
    if (otherShells.length !== expectedOthers) {
      // eslint-disable-next-line no-console
      console.warn(
        '[StudentPractice] secondary-grid count mismatch:',
        { picks: session.picks.length, recommended: recommendedKeys.size, others: otherShells.length, expected: expectedOthers },
      );
    }
  }

  // All branches share an outer .em-practice-root wrapper so the practice
  // theme (global.css) only applies inside this route.
  let inner: React.ReactNode;

  if (session.status === 'loading') {
    inner = (
      <div className="em-dash">
        <div className="em-dash-inner">
          <div className="em-dash-eyebrow">Loading · Wczytywanie</div>
          <h2 className="em-dash-title">Building your <em>practice plan</em></h2>
          <p className="em-dash-sub">One moment — Bajla is checking which districts you should visit today.</p>
        </div>
      </div>
    );
  } else if (session.status === 'error' && session.error !== 'no-session') {
    inner = (
      <div className="em-dash">
        <div className="em-dash-inner">
          <div className="em-dash-eyebrow">Error · Błąd</div>
          <h2 className="em-dash-title">Couldn't load your <em>practice plan</em></h2>
          <p className="em-dash-sub">{session.error}</p>
        </div>
      </div>
    );
  } else if (accuracyMode === 'choice' && session.studentSlug === 'aleksandra-gorska') {
    inner = (
      <AccuracyAtSpeedChoice
        onExit={closeAccuracy}
        onSpeak={() => openAccuracySpeech('P')}
      />
    );
  } else if (accuracyMode === 'speech' && accuracySelection && session.studentSlug === 'aleksandra-gorska') {
    inner = (
      <AccuracyAtSpeed
        studentSlug={session.studentSlug}
        initialRound={accuracySelection}
        onExit={closeAccuracy}
      />
    );
  } else if (currentView === 'groups' && !activeShell) {
    // Sprint-2: topic atlas
    inner = (
      <PracticeGroups
        studentLevel={session.studentLevel}
        onOpenGroup={(id: string) => {
          setCurrentGroupId(id);
          setCurrentView('group-detail');
        }}
        onBack={() => setCurrentView('atlas')}
      />
    );
  } else if (currentView === 'group-detail' && currentGroupId && !activeShell) {
    // Sprint-2: per-group page with compatible-shell tabs
    inner = (
      <GroupDetail
        groupId={currentGroupId}
        onBack={() => setCurrentView('groups')}
        onOpenGroup={(id: string) => setCurrentGroupId(id)}
        onLaunchShell={(shell, group) => {
          // GroupDetail passes the full GroupDetailExtended — propagate every
          // field into GroupContextValue so the in-shell GroupingPill renders
          // its title + Polish translation + category accent + compatible-shell
          // dropdown without needing a second Convex round-trip.
          setActiveGroup({
            groupId: group.groupId,
            topicEn: group.topicEn,
            topicPl: group.topicPl,
            category: group.category,
            cefrLevel: group.cefrLevel,
            compatibleShells: group.compatibleShells,
            onBackToGroup: () => {
              setActiveShell(null);
              setActiveGroup(null);
              setCurrentGroupId(group.groupId);
              setCurrentView('group-detail');
            },
            onSwitchShell: (next: ShellKey) => setActiveShell(next),
          });
          setActiveShell(shell);
          setCurrentView('atlas');
        }}
      />
    );
  } else if (activeShell) {
    const Shell = Shells[activeShell];
    const isExerciseLoading = exerciseState.status === 'loading';
    const isVocabLoading = vocabState.status === 'loading';
    // While exercises are still loading, show that spinner — it's the
    // preferred data source. Only fall back to "loading vocab" if exercises
    // aren't available (status === 'idle' or 'error') AND vocab is loading.
    const showExerciseSpinner = isExerciseLoading;
    const showVocabSpinner =
      !showExerciseSpinner && isVocabLoading && !exercisePuzzle;
    inner = (
      <div className="em-dash">
        <div className="em-dash-inner" style={{ paddingTop: 32, paddingBottom: 32 }}>
          <button
            type="button"
            onClick={() => {
              setActiveShell(null);
            }}
            className="em-back-btn"
          >
            <span className="em-back-arrow" aria-hidden>←</span>
            Back · Wszystkie dzielnice
          </button>
          {/* A8 mode-source ribbon — surfaces WHY this puzzle was picked.
              Renders only when exercises returned a usable puzzle (otherwise
              we'd be misattributing the source). Subtle eyebrow above the
              shell, never a giant banner.
              P0 2026-05-02: gated to dev-only — internal SLA jargon
              ("MODE C · PERSONALISED · fossilized · N occurrences") was
              leaking to learners in prod. Vite strips this branch from prod
              bundles via import.meta.env.DEV dead-code elimination. */}
          {import.meta.env.DEV && exercisePuzzle != null && exerciseState.status === 'ready' ? (
            <ModeBanner mode={exerciseState.mode} reasonString={exerciseState.reasonString} />
          ) : null}
          <div className="em-shell-host">
            {activeGroup ? (
              <GroupingPill currentShell={activeShell} />
            ) : null}
            {/* D3 (2026-05-02): review screen — covers the shell area when a
                shell finishes via onSessionComplete. Per-shell renderItem
                lookup based on districtId. localStorage-persisted. */}
            {reviewSession && reviewSession.districtId === activeShell ? (() => {
              const sess = reviewSession;
              const districtMeta = DISTRICTS[sess.districtId];
              // District-themed completion emoji (CD's D3 refinement, 2026-05-02)
              const emojiByShell: Partial<Record<ShellKey, string>> = {
                multiplechoice: '📌',
                gapfill: '🔨',
                opencloze: '📜',
                // D3 Wave-2 (Ricky 2026-05-02): district-themed completion
                // emoji for the 4 new shells.
                crossword: '🔲',
                wordsearch: '🔍',
                hangman: '🏮',
                matching: '🌉',
                // D3 Wave-2 second batch (Ricky 2026-05-02): district emoji
                // for the form-shell cluster.
                dragdrop: '📦',
                groupsort: '✉️',
                truefalse: '🚦',
                sentencecorrection: '✏️',
                sentencetransform: '🎙️',
                // D3 Wave-3 (Ricky 2026-05-02): district emoji for the
                // 5-shell wave-3 batch.
                wordformation: '🔨',
                spellingbee: '🎤',
                typingtest: '📡',
                openthebox: '🔐',
                concentration: '🃏',
                // D3 Wave-4 (Ricky 2026-05-02): arcade-shell district emoji.
                spinthewheel: '🎰',
                randomwheel: '🎡',
                randomcards: '🎴',
                quizshow: '🎬',
                findthematch: '🧥',
                whackamole: '🔨',
                balloonpop: '🎈',
                snake: '🐍',
                mazechase: '🏃',
                battleship: '⚓',
                // D3 Wave-5 (Ricky 2026-05-02 — FINAL): district emoji for
                // the last 11 shells.
                anagram: '🧱',
                flashcards: '📝',
                picturequiz: '🖼️',
                airplane: '✈️',
                flyingfruit: '🍎',
                readingcomp: '📖',
                listeningcomp: '🎧',
                speakingcards: '🎙️',
                labelleddiagram: '🏛️',
                rankorder: '🏛️',
                unjumble: '🧩',
              };
              if (sess.districtId === 'multiplechoice') {
                // Two payload shapes: live (has full puzzle) vs restored from
                // localStorage (only summary fields + questionIds — puzzle is
                // not persisted because it can be 30+ KB and reconstructing
                // requires the live generator). Restored mode renders the
                // summary card + skeleton items so refresh doesn't crash.
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellMultipleChoicePuzzle;
                  questionIds?: string[];
                  _restored?: boolean;
                };
                let reviewQs: PracticeReviewQuestion[];
                let renderItemFn: (q: PracticeReviewQuestion, st: { studentAnswer?: string }) => React.ReactNode;
                if (p.puzzle && p.puzzle.questions) {
                  // Live path — full puzzle in memory, render the locked posters.
                  reviewQs = p.puzzle.questions.map((q) => ({
                    id: q.id,
                    prompt: q.prompt,
                    prompt_pl: q.prompt_pl,
                    hint: q.hint,
                    hint_pl: q.hint_pl,
                    shellPayload: q,
                    explanationPL: q.explanationPL,
                  }));
                  renderItemFn = (q, st) => renderMCReviewItem(
                    q.shellPayload as Parameters<typeof renderMCReviewItem>[0],
                    st.studentAnswer,
                  );
                } else {
                  // Restored path — synthesize minimal questions from questionIds.
                  // Wrong attempts still carry studentAnswer + correctAnswer so the
                  // review can show "you said X, the answer was Y" per item even
                  // without the original puzzle's option grid.
                  const ids = p.questionIds ?? p.wrongAttempts.map((w) => w.questionId);
                  reviewQs = ids.map((id, i) => ({
                    id,
                    prompt: `Question ${i + 1}`,
                    shellPayload: { id, options: [], answerIndex: 0 } as unknown,
                    explanationPL: undefined,
                  }));
                  renderItemFn = (q, st) => {
                    const w = p.wrongAttempts.find((wa) => wa.questionId === q.id);
                    if (!w) {
                      return (
                        <div style={{ fontFamily: 'var(--em-mono)', fontSize: 13, color: 'var(--em-correct, #34D399)', padding: '8px 12px' }}>
                          ✓ TAK · CORRECT
                        </div>
                      );
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                        <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                          ✗ NIE · You said: <strong>{st.studentAnswer ?? w.studentAnswer}</strong>
                        </div>
                        <div style={{ color: 'var(--em-correct, #34D399)' }}>
                          ✓ TAK · Answer: <strong>{w.correctAnswer}</strong>
                        </div>
                      </div>
                    );
                  };
                }
                return (
                  <PracticeReview
                    districtId={sess.districtId}
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell[sess.districtId] ?? '🎯'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={renderItemFn}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }
              if (sess.districtId === 'gapfill') {
                // D3-GapFill (CD's review-pattern, 2026-05-02). Multi-gap
                // scenes: questionId in wrongAttempts is `${sceneId}:${gapId}`.
                // Skipped scenes carry no wrongAttempts (renderer marks them
                // as 'skipped' visually).
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellGapFillPuzzle;
                  skippedSceneIds?: string[];
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.scenes) {
                  // Restored mode: no full puzzle in localStorage. Show a
                  // degraded skeleton — same approach as MC restored mode.
                  return (
                    <PracticeReview
                      districtId="gapfill"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.gapfill ?? '🔨'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Gap ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You said: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Answer: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const skippedSet = new Set(p.skippedSceneIds ?? []);
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.scenes.map((sc) => ({
                  id: sc.id,
                  prompt: sc.shopName,
                  prompt_pl: sc.shopName_pl,
                  hint: sc.hint_pl,
                  hint_pl: sc.hint_pl,
                  shellPayload: sc,
                  // Per-scene rule explanation: the shell's wrongAttempts
                  // already carry per-gap explanationPL. PracticeReview's
                  // explanationFor() helper prefers wrongAttempt over
                  // q.explanationPL, so this scene-level fallback only fires
                  // for correct/skipped scenes (which don't render callouts
                  // anyway). Leave undefined.
                  explanationPL: undefined,
                }));
                return (
                  <PracticeReview
                    districtId="gapfill"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.gapfill ?? '🔨'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q, _st) => renderGapFillReviewItem(
                      q.shellPayload as ShellGapFillScene,
                      p.wrongAttempts,
                      skippedSet.has(q.id),
                    )}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }
              // D3 Wave-2 (Ricky, 2026-05-02): Crossword review screen.
              // Lists every word in the puzzle in board order, painting per-
              // letter chips green/red and marking skipped words with the
              // canonical answer in muted chips for study.
              if (sess.districtId === 'crossword') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellCrosswordPuzzle;
                  skippedWordIds?: number[];
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.words) {
                  // Restored mode — minimal review from wrong attempts only.
                  return (
                    <PracticeReview
                      districtId="crossword"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.crossword ?? '🔲'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Street ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You typed: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Answer: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const skippedSet = new Set(p.skippedWordIds ?? []);
                const wrongById = new Map(p.wrongAttempts.map((w) => [w.questionId, w]));
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.words.map((w) => ({
                  id: String(w.id),
                  prompt: `${w.id} ${w.dir === 'across' ? '→' : '↓'} ${w.clue}`,
                  prompt_pl: w.clue_pl ? `🇵🇱 ${w.clue_pl}` : undefined,
                  shellPayload: w,
                  explanationPL: undefined,
                }));
                return (
                  <PracticeReview
                    districtId="crossword"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.crossword ?? '🔲'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const w = q.shellPayload as Parameters<typeof renderCrosswordReviewItem>[0];
                      const wa = wrongById.get(String(w.id));
                      return renderCrosswordReviewItem(
                        w,
                        wa?.studentAnswer,
                        skippedSet.has(w.id),
                      );
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }
              // D3 Wave-2: Wordsearch review. Per-word card with a tiny
              // grid-thumb showing the path drawn for found words.
              if (sess.districtId === 'wordsearch') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellWordsearchPuzzle;
                  foundWordIndices?: number[];
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.words) {
                  return (
                    <PracticeReview
                      districtId="wordsearch"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.wordsearch ?? '🔍'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={[]}
                      renderItem={() => null}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const foundSet = new Set(p.foundWordIndices ?? []);
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.words.map((w, i) => ({
                  id: w.word,
                  prompt: w.word,
                  prompt_pl: w.clue_pl ? `🇵🇱 ${w.clue_pl}` : undefined,
                  shellPayload: { word: w, idx: i },
                  explanationPL: undefined,
                }));
                return (
                  <PracticeReview
                    districtId="wordsearch"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.wordsearch ?? '🔍'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { word: Parameters<typeof renderWordsearchReviewItem>[0]; idx: number };
                      const status: 'found' | 'missed' = foundSet.has(payload.idx) ? 'found' : 'missed';
                      return renderWordsearchReviewItem(payload.word, status);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }
              // D3 Wave-2: Hangman review. Per-puzzle card with lantern row
              // (lit/dimmed) + letter sequence the student tried.
              if (sess.districtId === 'hangman') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzleDeck?: ShellHangmanPuzzle[];
                  playedRecords?: Array<{ word: string; outcome: 'won' | 'lost'; guesses: string[]; livesUsed: number; exerciseId?: string; cluePL?: string }>;
                  _restored?: boolean;
                };
                if (!p.playedRecords || p.playedRecords.length === 0) {
                  return (
                    <PracticeReview
                      districtId="hangman"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.hangman ?? '🏮'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={[]}
                      renderItem={() => null}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const reviewQs: PracticeReviewQuestion[] = p.playedRecords.map((rec) => ({
                  id: rec.word,
                  prompt: rec.word,
                  prompt_pl: rec.cluePL ? `🇵🇱 ${rec.cluePL}` : undefined,
                  shellPayload: rec,
                  explanationPL: rec.cluePL,
                }));
                return (
                  <PracticeReview
                    districtId="hangman"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.hangman ?? '🏮'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const rec = q.shellPayload as Parameters<typeof renderHangmanReviewItem>[0];
                      return renderHangmanReviewItem(rec, rec.cluePL);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }
              // D3 Wave-2: Matching review. Per-pair card with line color/
              // pattern marker + EN word + correct PL + student's wrong PL
              // (strikethrough) when applicable.
              if (sess.districtId === 'matching') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellMatchingPuzzle;
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.pairs) {
                  return (
                    <PracticeReview
                      districtId="matching"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.matching ?? '🌉'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={[]}
                      renderItem={() => null}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const wrongByEn = new Map(p.wrongAttempts.map((w) => [w.questionId, w]));
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.pairs.map((pair) => ({
                  id: pair.en,
                  prompt: pair.en,
                  prompt_pl: `🇵🇱 ${pair.pl}`,
                  shellPayload: pair,
                  explanationPL: undefined,
                }));
                return (
                  <PracticeReview
                    districtId="matching"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.matching ?? '🌉'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const pair = q.shellPayload as Parameters<typeof renderMatchingReviewItem>[0];
                      const wa = wrongByEn.get(pair.en);
                      return renderMatchingReviewItem(pair, wa);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }
              // ─── D3 Wave-2 second batch (Ricky 2026-05-02) ──────────────
              // Form-shell cluster: DragDrop, GroupSort, TrueFalse,
              // SentenceCorrection, SentenceTransform. Each shell's session
              // payload includes its puzzle (live mode) so the review can
              // replay the exact question set; restored mode (post-refresh)
              // surfaces a degraded skeleton from wrongAttempts only.

              // DragDrop — per-scene card with the sentence + per-gap chips
              // showing student tile vs canonical tile.
              if (sess.districtId === 'dragdrop') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellDragDropPuzzle;
                  skippedSceneIndices?: number[];
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.scenes) {
                  return (
                    <PracticeReview
                      districtId="dragdrop"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.dragdrop ?? '📦'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Gap ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You dropped: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Answer: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const skippedSet = new Set(p.skippedSceneIndices ?? []);
                // Build a sceneIdx → { gapIdx → studentAnswer } map from the
                // wrongAttempts so the review chip can paint the student's
                // last drop per gap. Right gaps stay empty (gap shows correct
                // tile inline). questionId encoding: `${sceneIdx}:${gapIdx}`.
                const studentByScene: Record<number, Record<number, string>> = {};
                for (const w of p.wrongAttempts) {
                  const m = /^(\d+):(\d+)$/.exec(w.questionId);
                  if (!m) continue;
                  const si = Number(m[1]); const gi = Number(m[2]);
                  if (!studentByScene[si]) studentByScene[si] = {};
                  studentByScene[si][gi] = w.studentAnswer;
                }
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.scenes.map((sc, sceneIdx) => ({
                  id: String(sceneIdx),
                  // Build a plain-text prompt of the source sentence (drops
                  // become ___ ) so the review header reads naturally.
                  prompt: sc.sentence.map((part) => typeof part === 'string' ? part : '___').join(' '),
                  shellPayload: { sceneIdx, scene: sc, studentByGap: studentByScene[sceneIdx] ?? {}, isSkipped: skippedSet.has(sceneIdx) },
                  explanationPL: sc.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="dragdrop"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.dragdrop ?? '📦'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const rec = q.shellPayload as Parameters<typeof renderDragDropReviewItem>[0];
                      return renderDragDropReviewItem(rec);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // GroupSort — single-shot session, per-item card with
              // student-bin (line-through when wrong) + correct-bin.
              if (sess.districtId === 'groupsort') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellGroupSortPuzzle;
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.items) {
                  return (
                    <PracticeReview
                      districtId="groupsort"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.groupsort ?? '✉️'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w) => ({
                        id: w.questionId,
                        prompt: w.questionId,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You sorted into: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Correct route: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                // Build per-item review records — for each item, find the
                // FIRST wrong attempt (if any) so the review surfaces what
                // the student tried before getting it right.
                const groupById = new Map(p.puzzle.groups.map((g) => [g.id, g] as const));
                const firstWrongByWord = new Map<string, string>();
                for (const w of p.wrongAttempts) {
                  if (!firstWrongByWord.has(w.questionId)) {
                    firstWrongByWord.set(w.questionId, w.studentAnswer);
                  }
                }
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.items.map((it) => {
                  const correctGroup = groupById.get(it.group);
                  const correctBinName = correctGroup?.name ?? it.group;
                  const correctBinColor = correctGroup?.color ?? '#34D399';
                  return {
                    id: it.word,
                    prompt: it.word,
                    shellPayload: {
                      word: it.word,
                      correctBinName,
                      correctBinColor,
                      firstWrongBinName: firstWrongByWord.get(it.word),
                    },
                    explanationPL: undefined,
                  };
                });
                return (
                  <PracticeReview
                    districtId="groupsort"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.groupsort ?? '✉️'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const rec = q.shellPayload as Parameters<typeof renderGroupSortReviewItem>[0];
                      return renderGroupSortReviewItem(rec);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // TrueFalse — per-statement card with TRUE/FALSE chip pair +
              // q.fact rule explanation; SKIPPED marker when applicable.
              if (sess.districtId === 'truefalse') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellTrueFalsePuzzle;
                  skippedQuestionIds?: string[];
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.questions) {
                  return (
                    <PracticeReview
                      districtId="truefalse"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.truefalse ?? '🚦'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: w.questionId.length > 80 ? `Statement ${i + 1}` : w.questionId,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You said: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Answer: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const skippedSet = new Set(p.skippedQuestionIds ?? []);
                const studentByQ = new Map(p.wrongAttempts.map((w) => [w.questionId, w.studentAnswer] as const));
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.questions.map((q) => ({
                  id: q.q,
                  prompt: q.q,
                  prompt_pl: q.q_pl ? `🇵🇱 ${q.q_pl}` : undefined,
                  shellPayload: q,
                  explanationPL: q.fact ?? q.q_pl,
                }));
                return (
                  <PracticeReview
                    districtId="truefalse"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.truefalse ?? '🚦'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const tfQ = q.shellPayload as Parameters<typeof renderTrueFalseReviewItem>[0];
                      return renderTrueFalseReviewItem(
                        tfQ,
                        studentByQ.get(q.id),
                        skippedSet.has(q.id),
                      );
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // SentenceCorrection — per-sentence card showing the original
              // with the wrong span struck-through + correction inline + the
              // student's tap (or "no errors") + the inferred error type.
              if (sess.districtId === 'sentencecorrection') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellSentenceCorrectionPuzzle;
                  skippedItemIds?: string[];
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.items) {
                  return (
                    <PracticeReview
                      districtId="sentencecorrection"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.sentencecorrection ?? '✏️'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Sentence ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · Your edit: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Correct: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const skippedSet = new Set(p.skippedItemIds ?? []);
                const studentByItem = new Map(p.wrongAttempts.map((w) => [w.questionId, w.studentAnswer] as const));
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.items.map((it: SCItem) => ({
                  id: it.id,
                  prompt: it.sentence_with_error,
                  shellPayload: { item: it, studentEncoded: studentByItem.get(it.id), isSkipped: skippedSet.has(it.id) },
                  explanationPL: it.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="sentencecorrection"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.sentencecorrection ?? '✏️'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const rec = q.shellPayload as Parameters<typeof renderSentenceCorrectionReviewItem>[0];
                      return renderSentenceCorrectionReviewItem(rec);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // SentenceTransform — per-prompt card with source + key word
              // chip + reference + accepted variants + student's transform.
              if (sess.districtId === 'sentencetransform') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellSentenceTransformPuzzle;
                  skippedItemIds?: string[];
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.items) {
                  return (
                    <PracticeReview
                      districtId="sentencetransform"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.sentencetransform ?? '🎙️'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Prompt ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · Your rewrite: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Reference: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const skippedSet = new Set(p.skippedItemIds ?? []);
                const studentByItem = new Map(p.wrongAttempts.map((w) => [w.questionId, w.studentAnswer] as const));
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.items.map((it: STItem) => ({
                  id: it.id,
                  prompt: it.original,
                  shellPayload: { item: it, studentTransform: studentByItem.get(it.id), isSkipped: skippedSet.has(it.id) },
                  explanationPL: it.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="sentencetransform"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.sentencetransform ?? '🎙️'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const rec = q.shellPayload as Parameters<typeof renderSentenceTransformReviewItem>[0];
                      return renderSentenceTransformReviewItem(rec);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // ─── D3 Wave-3 (Ricky 2026-05-02) ──────────────────────────
              // WordFormation, SpellingBee, TypingTest, OpenTheBox, Concentration.
              // Each shell's session payload includes its puzzle (live mode) so
              // the review can re-render the canonical question set; restored
              // mode (post-refresh) surfaces a degraded skeleton from
              // wrongAttempts only.

              // WordFormation — per-base-word card with sentence + base + POS
              // chip + student's typed form vs correct derivation.
              if (sess.districtId === 'wordformation') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellWordFormationPuzzle;
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.items) {
                  return (
                    <PracticeReview
                      districtId="wordformation"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.wordformation ?? '🔨'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Block ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You typed: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Form: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const wrongById = new Map(p.wrongAttempts.map((w) => [w.questionId, w]));
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.items.map((it) => ({
                  id: it.id,
                  prompt: it.sentence,
                  shellPayload: it,
                  explanationPL: it.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="wordformation"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.wordformation ?? '🔨'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const it = q.shellPayload as WFItem;
                      const wa = wrongById.get(it.id);
                      return renderWordFormationReviewItem(it, wa?.studentAnswer);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // SpellingBee — per-word card with audio replay button + per-letter
              // ✓/✗ tiles aligned against the canonical spelling.
              if (sess.districtId === 'spellingbee') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellSpellingBeePuzzle;
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.words) {
                  return (
                    <PracticeReview
                      districtId="spellingbee"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.spellingbee ?? '🎤'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Cue ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You spelled: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Spelling: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const wrongById = new Map(p.wrongAttempts.map((w) => [w.questionId, w]));
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.words.map((w) => ({
                  id: w.id,
                  prompt: w.word,
                  shellPayload: w,
                  explanationPL: w.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="spellingbee"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.spellingbee ?? '🎤'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const w = q.shellPayload as SBWord;
                      const wa = wrongById.get(w.id);
                      return renderSpellingBeeReviewItem(w, wa?.studentAnswer);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // TypingTest — per-phrase card with target dispatch + student's
              // typed text (per-char highlighted) + WPM + accuracy + status.
              if (sess.districtId === 'typingtest') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellTypingTestPuzzle;
                  phraseLog?: Array<{ id: string; wpm: number; acc: number; ok: boolean; typed: string }>;
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.phrases) {
                  return (
                    <PracticeReview
                      districtId="typingtest"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.typingtest ?? '📡'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Dispatch ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You typed: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Target: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const logById = new Map((p.phraseLog ?? []).map((l) => [l.id, l] as const));
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.phrases.map((ph) => ({
                  id: ph.id,
                  prompt: ph.target_text,
                  shellPayload: ph,
                  explanationPL: ph.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="typingtest"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.typingtest ?? '📡'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const ph = q.shellPayload as TTPhrase;
                      const log = logById.get(ph.id);
                      return renderTypingTestReviewItem(ph, log);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // OpenTheBox — per-vault-box card with the MC question + student
              // pick + correct answer chip + the explanationPL rule callout.
              if (sess.districtId === 'openthebox') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ArcadePuzzle;
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.rounds) {
                  return (
                    <PracticeReview
                      districtId="openthebox"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.openthebox ?? '🔐'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Box ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You picked: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Answer: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                // Surface the LAST wrong attempt per box (matches the live
                // shell's "tries 1 of 2" rhythm — the most recent miss is the
                // one the student remembers). Boxes that never had a wrong
                // attempt render as sealed.
                const lastWrongByBox = new Map<string, string>();
                for (const w of p.wrongAttempts) lastWrongByBox.set(w.questionId, w.studentAnswer);
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.rounds.map((r, i) => ({
                  id: r.id,
                  prompt: r.prompt,
                  shellPayload: { round: r, boxNumber: i + 1 },
                  explanationPL: r.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="openthebox"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.openthebox ?? '🔐'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { round: ArcadeRound; boxNumber: number };
                      return renderOpenTheBoxReviewItem(
                        payload.round,
                        payload.boxNumber,
                        lastWrongByBox.get(payload.round.id),
                      );
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // Concentration — per-pair card with clue-card ↔ word-card +
              // attempt count ("first try" / "N tries") + matched/unmatched.
              if (sess.districtId === 'concentration') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ConcentrationPuzzle;
                  attemptCounts?: Record<string, number>;
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.rounds) {
                  return (
                    <PracticeReview
                      districtId="concentration"
                      sessionId={sess.sessionId}
                      summaryEmoji={emojiByShell.concentration ?? '🃏'}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Pair ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You paired with: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Match: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const attempts = p.attemptCounts ?? {};
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.rounds.map((r) => ({
                  id: r.id,
                  prompt: r.prompt,
                  shellPayload: r,
                  explanationPL: r.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="concentration"
                    sessionId={sess.sessionId}
                    summaryEmoji={emojiByShell.concentration ?? '🃏'}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const r = q.shellPayload as ConcentrationRound;
                      const n = attempts[r.id] ?? 0;
                      // The round only ends when matched.length === total, so
                      // every pair listed here is matched. The defensive
                      // `matched=false` branch is unreachable in normal play.
                      return renderConcentrationReviewItem(r, n, true);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // ── D3 Wave-4 (Ricky 2026-05-02): arcade shells ─────────────────
              // Eight of these (SpinTheWheel, RandomCards, QuizShow, WhackAMole,
              // BalloonPop, Snake, MazeChase, Battleship) share the same
              // ArcadeRound/ArcadePuzzle payload shape (id+prompt+options+
              // answerIndex+hints). RandomWheel + FindTheMatch carry one extra
              // payload field each (tier-ladder, attempt counts) and are
              // handled separately. Each branch follows the OpenTheBox pattern:
              // surface the LAST wrong attempt per round so the review reads
              // as one row per round, not one row per miss.
              const arcadeDispatch: Partial<Record<ShellKey, {
                emoji: string;
                renderRow: (round: ArcadeRound, num: number, stu: string | undefined) => React.ReactNode;
                fallbackLabel: string;
              }>> = {
                spinthewheel: { emoji: emojiByShell.spinthewheel ?? '🎰', renderRow: renderSpinTheWheelReviewItem, fallbackLabel: 'Round' },
                randomcards:  { emoji: emojiByShell.randomcards  ?? '🎴', renderRow: renderRandomCardsReviewItem,  fallbackLabel: 'Card' },
                quizshow:     { emoji: emojiByShell.quizshow     ?? '🎬', renderRow: renderQuizShowReviewItem,     fallbackLabel: 'Question' },
                whackamole:   { emoji: emojiByShell.whackamole   ?? '🔨', renderRow: renderWhackAMoleReviewItem,   fallbackLabel: 'Mole' },
                balloonpop:   { emoji: emojiByShell.balloonpop   ?? '🎈', renderRow: renderBalloonPopReviewItem,   fallbackLabel: 'Balloon' },
                snake:        { emoji: emojiByShell.snake        ?? '🐍', renderRow: renderSnakeReviewItem,        fallbackLabel: 'Pellet' },
                mazechase:    { emoji: emojiByShell.mazechase    ?? '🏃', renderRow: renderMazeChaseReviewItem,    fallbackLabel: 'Token' },
                battleship:   { emoji: emojiByShell.battleship   ?? '⚓', renderRow: renderBattleshipReviewItem,   fallbackLabel: 'Ship' },
              };
              const arcadeMeta = arcadeDispatch[sess.districtId];
              if (arcadeMeta) {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ArcadePuzzle;
                  _restored?: boolean;
                };
                if (!p.puzzle || !p.puzzle.rounds) {
                  // Restored from localStorage — no full puzzle. Show degraded
                  // skeleton so a refresh during review still surfaces summary.
                  return (
                    <PracticeReview
                      districtId={sess.districtId}
                      sessionId={sess.sessionId}
                      summaryEmoji={arcadeMeta.emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `${arcadeMeta.fallbackLabel} ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You picked: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Answer: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                // Map round.id → student's LAST wrong pick (for ✗ rows).
                const lastWrongByRound = new Map<string, string>();
                for (const w of p.wrongAttempts) lastWrongByRound.set(w.questionId, w.studentAnswer);
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.rounds.map((r, i) => ({
                  id: r.id,
                  prompt: r.prompt,
                  shellPayload: { round: r, number: i + 1 },
                  explanationPL: r.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId={sess.districtId}
                    sessionId={sess.sessionId}
                    summaryEmoji={arcadeMeta.emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { round: ArcadeRound; number: number };
                      return arcadeMeta.renderRow(
                        payload.round,
                        payload.number,
                        lastWrongByRound.get(payload.round.id),
                      );
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // RandomWheel — same shape as the arcade-dispatch above but with
              // tier annotation per round (TIERS[i % 6]).
              if (sess.districtId === 'randomwheel') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ArcadePuzzle;
                  points?: number;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.randomwheel ?? '🎡';
                if (!p.puzzle || !p.puzzle.rounds) {
                  return (
                    <PracticeReview
                      districtId="randomwheel"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Round ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You picked: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Answer: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const lastWrongByRound = new Map<string, string>();
                for (const w of p.wrongAttempts) lastWrongByRound.set(w.questionId, w.studentAnswer);
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.rounds.map((r, i) => ({
                  id: r.id,
                  prompt: r.prompt,
                  shellPayload: { round: r, number: i + 1, tier: RW_TIERS[i % RW_TIERS.length] },
                  explanationPL: r.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="randomwheel"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { round: ArcadeRound; number: number; tier: { labelEN: string; mult: number } };
                      return renderRandomWheelReviewItem(
                        payload.round,
                        payload.number,
                        payload.tier.labelEN,
                        payload.tier.mult,
                        lastWrongByRound.get(payload.round.id),
                      );
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // FindTheMatch — same shape but the per-pair render needs the
              // attempt count (firstTry vs N tries) which the shell hands up
              // via `wrongAttemptCounts`.
              if (sess.districtId === 'findthematch') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ArcadePuzzle;
                  wrongAttemptCounts?: Record<string, number>;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.findthematch ?? '🧥';
                if (!p.puzzle || !p.puzzle.rounds) {
                  return (
                    <PracticeReview
                      districtId="findthematch"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Pair ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You paired with: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Match: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const counts = p.wrongAttemptCounts ?? {};
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.rounds.map((r, i) => ({
                  id: r.id,
                  prompt: r.prompt,
                  shellPayload: { round: r, number: i + 1 },
                  explanationPL: r.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="findthematch"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { round: ArcadeRound; number: number };
                      const n = counts[payload.round.id] ?? 0;
                      return renderFindTheMatchReviewItem(payload.round, payload.number, n);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // ── D3 Wave-5 (Ricky 2026-05-02 — FINAL) ──────────────────────
              // The last 11 shells. After this all 38 shells have review
              // screens. Each branch follows the established pattern: build
              // PracticeReviewQuestion[] from the shell's payload, render via
              // the shell's exported renderItem function. Restored-from-
              // localStorage paths fall back to a wrong-attempt summary card.

              // Anagram — Letter Workshop. Per-puzzle row: scrambled tiles +
              // student spelling vs correct.
              if (sess.districtId === 'anagram') {
                type AnagramPuzzleItem = { word: string; clue: string; clue_pl: string; exerciseId?: string };
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: { items: AnagramPuzzleItem[] };
                  studentAnswers?: Record<string, string>;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.anagram ?? '🧱';
                if (!p.puzzle || !p.puzzle.items) {
                  return (
                    <PracticeReview
                      districtId="anagram"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Word ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You spelled: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Word: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const studentAnswers = p.studentAnswers ?? {};
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.items.map((it, i) => ({
                  id: it.word,
                  prompt: it.clue,
                  shellPayload: { item: it, number: i + 1 },
                  explanationPL: it.clue_pl,
                }));
                return (
                  <PracticeReview
                    districtId="anagram"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { item: AnagramPuzzleItem; number: number };
                      return renderAnagramReviewItem(payload.item, payload.number, studentAnswers[payload.item.word]);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // Flashcards — Café Spółdzielnia. Per-card row: EN→PL pair +
              // KNOWN/REVIEW/SKIPPED chip.
              if (sess.districtId === 'flashcards') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: { cards: ShellFlashcardsCard[] };
                  marks?: Record<number, 'known' | 'review' | 'skipped'>;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.flashcards ?? '📝';
                if (!p.puzzle || !p.puzzle.cards) {
                  return (
                    <PracticeReview
                      districtId="flashcards"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Card ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ fontFamily: 'var(--em-body, serif)', fontSize: 14, color: 'var(--em-wrong, #FB7185)' }}>
                          ↻ REVIEW · {(st as { correctAnswer?: string }).correctAnswer ?? '—'}
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const marks = p.marks ?? {};
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.cards.map((c, i) => ({
                  id: `${i}-${c.en}`,
                  prompt: c.en,
                  shellPayload: { card: c, number: i + 1, status: marks[i] ?? 'skipped' as const },
                  explanationPL: c.ex_pl,
                }));
                return (
                  <PracticeReview
                    districtId="flashcards"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { card: ShellFlashcardsCard; number: number; status: 'known' | 'review' | 'skipped' };
                      return renderFlashcardsReviewItem(payload.card, payload.number, payload.status);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // PictureQuiz — Photography Salon. Per-frame row.
              if (sess.districtId === 'picturequiz') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: PictureQuizPuzzle;
                  studentPicks?: Record<string, string>;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.picturequiz ?? '🖼️';
                if (!p.puzzle || !p.puzzle.items) {
                  return (
                    <PracticeReview
                      districtId="picturequiz"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Frame ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You picked: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Title: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const studentPicks = p.studentPicks ?? {};
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.items.map((it, i) => ({
                  id: it.id,
                  prompt: it.prompt,
                  shellPayload: { item: it, number: i + 1 },
                  explanationPL: it.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="picturequiz"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { item: ShellPictureQuizItem; number: number };
                      return renderPictureQuizReviewItem(payload.item, payload.number, studentPicks[payload.item.id]);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // Airplane — Aerodrome. Per-cloud row.
              if (sess.districtId === 'airplane') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: AirplanePuzzle;
                  studentPicks?: Record<string, string>;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.airplane ?? '✈️';
                if (!p.puzzle || !p.puzzle.rounds) {
                  return (
                    <PracticeReview
                      districtId="airplane"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Cloud ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ MISS · You picked: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ HIT · Answer: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const studentPicks = p.studentPicks ?? {};
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.rounds.map((r, i) => ({
                  id: r.id,
                  prompt: r.prompt,
                  shellPayload: { round: r, number: i + 1 },
                  explanationPL: r.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="airplane"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { round: AirplaneRound; number: number };
                      return renderAirplaneReviewItem(payload.round, payload.number, studentPicks[payload.round.id]);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // FlyingFruit — Orchard Square. Per-fruit row.
              if (sess.districtId === 'flyingfruit') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: FlyingFruitPuzzle;
                  studentPicks?: Record<string, string>;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.flyingfruit ?? '🍎';
                if (!p.puzzle || !p.puzzle.rounds) {
                  return (
                    <PracticeReview
                      districtId="flyingfruit"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Fruit ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ MISSED · You picked: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ CAUGHT · Answer: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const studentPicks = p.studentPicks ?? {};
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.rounds.map((r, i) => ({
                  id: r.id,
                  prompt: r.prompt,
                  shellPayload: { round: r, number: i + 1 },
                  explanationPL: r.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="flyingfruit"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { round: FlyingFruitRound; number: number };
                      return renderFlyingFruitReviewItem(payload.round, payload.number, studentPicks[payload.round.id]);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // ReadingComp — Reading Room. Per-question row + passage excerpt.
              if (sess.districtId === 'readingcomp') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ReadingCompPuzzle;
                  studentPicks?: Record<string, string>;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.readingcomp ?? '📖';
                if (!p.puzzle || !p.puzzle.questions) {
                  return (
                    <PracticeReview
                      districtId="readingcomp"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Question ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You picked: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Answer: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const studentPicks = p.studentPicks ?? {};
                const passage = p.puzzle.passage;
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.questions.map((q, i) => ({
                  id: q.id,
                  prompt: q.prompt,
                  shellPayload: { q, number: i + 1, excerpt: pickReadingCompExcerpt(passage, q) },
                  explanationPL: q.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="readingcomp"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(qq) => {
                      const payload = qq.shellPayload as { q: Parameters<typeof renderReadingCompReviewItem>[0]; number: number; excerpt: string };
                      return renderReadingCompReviewItem(payload.q, payload.number, payload.excerpt, studentPicks[payload.q.id]);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // ListeningComp — Listening Booth. Per-question row + audio
              // replay button + transcript snippet.
              if (sess.districtId === 'listeningcomp') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ListeningCompPuzzle;
                  studentPicks?: Record<string, string>;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.listeningcomp ?? '🎧';
                if (!p.puzzle || !p.puzzle.questions) {
                  return (
                    <PracticeReview
                      districtId="listeningcomp"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Question ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You heard: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Answer: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const studentPicks = p.studentPicks ?? {};
                const transcript = p.puzzle.transcript;
                const audioUrl = p.puzzle.audio_url;
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.questions.map((q, i) => ({
                  id: q.id,
                  prompt: q.prompt,
                  shellPayload: { q, number: i + 1, snippet: pickListeningCompTranscriptSnippet(transcript, q) },
                  explanationPL: q.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="listeningcomp"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(qq) => {
                      const payload = qq.shellPayload as { q: Parameters<typeof renderListeningCompReviewItem>[0]; number: number; snippet: string };
                      return renderListeningCompReviewItem(payload.q, payload.number, audioUrl, payload.snippet, studentPicks[payload.q.id]);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // SpeakingCards — Speakeasy. Per-card row + self-rating + model phrase.
              if (sess.districtId === 'speakingcards') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: SpeakingCardsPuzzle;
                  selfRatings?: Record<string, 'well' | 'retry' | 'skipped'>;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.speakingcards ?? '🎙️';
                if (!p.puzzle || !p.puzzle.cards) {
                  return (
                    <PracticeReview
                      districtId="speakingcards"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Card ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ fontFamily: 'var(--em-body, serif)', fontSize: 14, color: 'var(--em-wrong, #FB7185)' }}>
                          ↻ TRY AGAIN · {(st as { correctAnswer?: string }).correctAnswer ?? '—'}
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const ratings = p.selfRatings ?? {};
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.cards.map((c, i) => ({
                  id: c.id,
                  prompt: c.prompt,
                  shellPayload: { card: c, number: i + 1, rating: ratings[c.id] ?? 'skipped' as const },
                  explanationPL: c.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="speakingcards"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { card: ShellSpeakingCard; number: number; rating: 'well' | 'retry' | 'skipped' };
                      return renderSpeakingCardsReviewItem(payload.card, payload.number, payload.rating);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // LabelledDiagram — Atrium Schematic. Per-hotspot row.
              if (sess.districtId === 'labelleddiagram') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: LabelledDiagramPuzzle;
                  placement?: Record<string, string>;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.labelleddiagram ?? '🏛️';
                if (!p.puzzle || !p.puzzle.hotspots) {
                  return (
                    <PracticeReview
                      districtId="labelleddiagram"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Hotspot ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You labelled: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Label: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const placement = p.placement ?? {};
                const diagramSvg = p.puzzle.diagram_svg ?? '';
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.hotspots.map((h, i) => ({
                  id: h.id,
                  prompt: h.label,
                  shellPayload: { hotspot: h, number: i + 1 },
                  explanationPL: h.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="labelleddiagram"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { hotspot: ShellLabelledDiagramHotspot; number: number };
                      // placement[hotspotId] = labelId placed there. Map labelId → label string.
                      const placedLabelId = placement[payload.hotspot.id];
                      const placedHs = placedLabelId ? p.puzzle!.hotspots.find((h) => h.id === placedLabelId) : null;
                      return renderLabelledDiagramReviewItem(
                        payload.hotspot,
                        payload.number,
                        diagramSvg,
                        placedHs?.label,
                        placedHs?.label_pl,
                      );
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // RankOrder — Election Hall. Single review row showing the
              // full ordering vs canonical with per-position chips.
              if (sess.districtId === 'rankorder') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: RankOrderPuzzle;
                  finalOrdering?: (string | null)[];
                  _restored?: boolean;
                };
                const emoji = emojiByShell.rankorder ?? '🏛️';
                if (!p.puzzle || !p.puzzle.items) {
                  return (
                    <PracticeReview
                      districtId="rankorder"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Position ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You placed: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Belongs: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const finalOrdering = p.finalOrdering ?? Array(p.puzzle.items.length).fill(null);
                // RankOrder is a single-question shell — one review row showing
                // the full ordering. Synthesize one PracticeReviewQuestion.
                const reviewQs: PracticeReviewQuestion[] = [{
                  id: 'rankorder-final',
                  prompt: p.puzzle.criterion,
                  shellPayload: { puzzle: p.puzzle, ordering: finalOrdering },
                  explanationPL: p.puzzle.criterion_pl,
                }];
                return (
                  <PracticeReview
                    districtId="rankorder"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { puzzle: RankOrderPuzzle; ordering: (string | null)[] };
                      return renderRankOrderReviewItem(payload.puzzle, payload.ordering);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // Unjumble — Puzzle Workshop. Per-sentence row.
              if (sess.districtId === 'unjumble') {
                const p = sess.payload as {
                  correctCount: number;
                  totalQuestions: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: UnjumblePuzzle;
                  studentArrangements?: Record<string, (number | null)[]>;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.unjumble ?? '🧩';
                if (!p.puzzle || !p.puzzle.items) {
                  return (
                    <PracticeReview
                      districtId="unjumble"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalQuestions}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Sentence ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You assembled: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Sentence: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const arrangements = p.studentArrangements ?? {};
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.items.map((s, i) => ({
                  id: s.id,
                  prompt: s.correct_order.map((wi) => s.words[wi]).join(' '),
                  shellPayload: { sentence: s, number: i + 1 },
                  explanationPL: s.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="unjumble"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalQuestions}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q) => {
                      const payload = q.shellPayload as { sentence: ShellUnjumbleSentence; number: number };
                      const arr = arrangements[payload.sentence.id] ?? Array(payload.sentence.words.length).fill(null);
                      return renderUnjumbleReviewItem(payload.sentence, payload.number, arr);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              // Open Cloze — Vellum Atelier. Per-inkwell row: parchment with
              // gap highlighted, student's typed word vs canonical answer +
              // accepted variants + EN/PL hint. (D3 Wave-5 closes 38/38.)
              if (sess.districtId === 'opencloze') {
                const p = sess.payload as {
                  correctCount: number;
                  totalGaps: number;
                  wrongAttempts: Array<{ questionId: string; studentAnswer: string; correctAnswer: string; explanationPL?: string; exerciseId?: string }>;
                  puzzle?: ShellOpenClozePuzzle;
                  studentInputs?: Record<number, string>;
                  _restored?: boolean;
                };
                const emoji = emojiByShell.opencloze ?? '📜';
                if (!p.puzzle || !p.puzzle.gaps) {
                  return (
                    <PracticeReview
                      districtId="opencloze"
                      sessionId={sess.sessionId}
                      summaryEmoji={emoji}
                      accent={districtMeta.accent}
                      totalQuestions={p.totalGaps}
                      correctCount={p.correctCount}
                      wrongAttempts={p.wrongAttempts}
                      questions={p.wrongAttempts.map((w, i) => ({
                        id: w.questionId,
                        prompt: `Inkwell ${i + 1}`,
                        shellPayload: w,
                        explanationPL: w.explanationPL,
                      }))}
                      renderItem={(_q, st) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--em-body, serif)', fontSize: 14 }}>
                          <div style={{ color: 'var(--em-wrong, #FB7185)' }}>
                            ✗ NIE · You typed: <strong>{st.studentAnswer ?? '—'}</strong>
                          </div>
                          <div style={{ color: 'var(--em-correct, #34D399)' }}>
                            ✓ TAK · Word: <strong>{(st as { correctAnswer?: string }).correctAnswer ?? '—'}</strong>
                          </div>
                        </div>
                      )}
                      onTryAnother={reviewTryAnother}
                      onNextDistrict={reviewNextDistrict}
                    />
                  );
                }
                const studentInputs = p.studentInputs ?? {};
                const reviewQs: PracticeReviewQuestion[] = p.puzzle.gaps.map((g, i) => ({
                  id: `gap-${g.id}`,
                  prompt: g.hint,
                  prompt_pl: g.hint_pl,
                  hint: g.hint,
                  hint_pl: g.hint_pl,
                  shellPayload: { gap: g, number: i + 1, passage: p.puzzle!.passage, allGaps: p.puzzle!.gaps, studentInput: studentInputs[g.id] },
                  explanationPL: g.hint_pl,
                }));
                return (
                  <PracticeReview
                    districtId="opencloze"
                    sessionId={sess.sessionId}
                    summaryEmoji={emoji}
                    accent={districtMeta.accent}
                    totalQuestions={p.totalGaps}
                    correctCount={p.correctCount}
                    wrongAttempts={p.wrongAttempts}
                    questions={reviewQs}
                    renderItem={(q, _st) => {
                      const payload = q.shellPayload as { gap: OCGap; number: number; passage: string; allGaps: OCGap[]; studentInput: string | undefined };
                      return renderOpenClozeReviewItem(payload, payload.number);
                    }}
                    onTryAnother={reviewTryAnother}
                    onNextDistrict={reviewNextDistrict}
                  />
                );
              }

              return null; // (no remaining shells to dispatch)
            })() : null}
            {/* 2026-05-02 (Ricky, post-CD audit): per-shell chrome-immediate
                scaffolds. For shells with the chrome-less-load issue
                (Battleship A4 ~12s, MultipleChoice A4 ~9s) we mount a small
                statically-imported chrome component as the Suspense fallback
                AND in place of the data-loading spinner. The chrome
                (Nameplate + Bajla + counter + scene background) appears
                instantly; only the play area shows a skeleton until the
                lazy chunk + exercises arrive. Other shells keep the legacy
                ShellSpinner until they get a per-shell scaffold of their own. */}
            {(() => {
              const Scaffold =
                activeShell === 'multiplechoice' ? MultipleChoiceChrome :
                activeShell === 'battleship'     ? BattleshipChrome :
                null;
              const fallback = Scaffold
                ? <Scaffold />
                : <ShellSpinner shellName={SHELL_LABEL[activeShell]} />;
              const dataLoadingNode = Scaffold
                ? <Scaffold />
                : (showExerciseSpinner
                    ? <ShellSpinner shellName={`${SHELL_LABEL[activeShell]} (loading exercises)`} />
                    : <ShellSpinner shellName={`${SHELL_LABEL[activeShell]} (loading vocab)`} />);
              return (
            <ErrorBoundary shellName={SHELL_LABEL[activeShell]}>
              <Suspense fallback={fallback}>
                {showExerciseSpinner || showVocabSpinner ? (
                  dataLoadingNode
                ) : (
                  // generatedPuzzle is null when neither exercises nor vocab
                  // produce a usable puzzle — pass undefined so the shell
                  // falls back to its built-in sample instead of crashing.
                  // onWrongAnswer (Layer-4 / Agent A12) is wired up so the
                  // shell can request a Polish-interference tip overlay.
                  //
                  // F1 fix (Ricky 2026-05-03, CD audit): include freshnessToken
                  // in the React key so picking "New questions" from <SessionModal>
                  // forces the shell to REMOUNT — discarding stale internal state
                  // (idx, started, recordState, completion overlays, persisted
                  // refs) and consuming the freshly-generated puzzle from a clean
                  // slate. The 11 narrative-driven shells (Crossword/Wordsearch/
                  // OpenCloze/Reading/Listening/WordFormation/RandomWheel/
                  // FindTheMatch/SpinTheWheel/Airplane/FlyingFruit) already showed
                  // fresh content on prop change because their visible surface
                  // is derived from puzzle directly. The 6 action shells
                  // (WhackAMole/Snake/MazeChase/BalloonPop/TrueFalse/
                  // SpeakingCards) each carry an internal cursor (roundIdx /
                  // idx / cardFinalised / completed) that survived prop change,
                  // so the user landed back on the SAME completion overlay
                  // even though `puzzle` was new. A keyed remount fixes all
                  // 6 in one shot without per-shell touchpoints. Continue /
                  // Repeat-same don't bump freshnessToken → no remount → state
                  // and resumeHydration flow unchanged.
                  <Shell
                    key={`${activeShell}-${freshnessToken}`}
                    time="dusk"
                    puzzle={generatedPuzzle ?? undefined}
                    onWrongAnswer={handleWrongAnswer}
                    // D3 (2026-05-02): only the 3 in-scope shells consume
                    // onSessionComplete today (MC, GapFill, OpenCloze). Other
                    // shells ignore the prop and keep their built-in completion
                    // overlays. Passing it to all shells is safe — it's optional.
                    onSessionComplete={handleSessionComplete}
                    // Phase 1.8 §4 #21 (Mike's add-on, 2026-05-02): when the
                    // student picked Continue from <SessionModal>, hand the
                    // saved blob to the shell to hydrate from. When they
                    // picked Start fresh + Repeat same, hand the prior
                    // questionIds so the generator re-runs the same set.
                    // Shells that don't yet read these props ignore them
                    // and start fresh, which preserves today's behavior.
                    resumeState={resumeHydration ?? undefined}
                    reuseQuestionIds={reuseQuestionIds ?? undefined}
                  />
                )}
              </Suspense>
            </ErrorBoundary>
              );
            })()}
          </div>
        </div>
      </div>
    );
  } else {
    inner = (
      <div className="em-dash">
        <div className="em-dash-inner">
          {session.studentSlug === 'aleksandra-gorska' ? (
            <div id="accuracy-at-speed">
              <AccuracyAtSpeedLauncher
                completed={accuracyProgress.completed}
                onStartChoice={openAccuracyChoice}
                onStartSpeech={openAccuracySpeech}
              />
            </div>
          ) : null}
          <PitchCard
            time="dusk"
            onSelectShell={setActiveShell}
            onBrowseByTopic={() => setCurrentView('groups')}
            studentSlug={session.studentSlug}
          />
          <header className="em-dash-head">
            <div>
              <div className="em-dash-eyebrow">
                {session.picks.length === 0
                  ? 'Practice · Ćwiczenia'
                  : 'Today\'s practice · Twoja dzisiejsza praktyka'}
              </div>
              <h2 className="em-dash-title">
                {session.picks.length === 0 ? (
                  <>Ten <em>districts</em>, one city</>
                ) : (
                  <>Your three <em>districts</em></>
                )}
              </h2>
              <p className="em-dash-sub">
                {session.picks.length === 0
                  ? <>Every game is open. Pick a district and Bajla will be there.{' '}<span style={{ opacity: 0.7 }}>Każda gra jest otwarta. Wybierz dzielnicę.</span></>
                  : <>We picked three games based on your last lessons. Pick one — Bajla will be there.{' '}<span style={{ opacity: 0.7 }}>Wybraliśmy trzy gry na podstawie Twoich ostatnich lekcji.</span></>
                }
              </p>
            </div>
            <div className="em-level-chip">
              <span className="em-level-chip-dot" aria-hidden />
              Level · Poziom {session.studentLevel}
            </div>
          </header>

          {session.picks.length === 0 ? (
            session.error === 'no-session' ? (
              <div className="em-signin-banner">
                <span className="em-signin-icon" aria-hidden>✦</span>
                <div>
                  <strong>Sign in for personalised picks</strong>
                  <span style={{ opacity: 0.7 }}>{' '}· Zaloguj się po spersonalizowane ćwiczenia</span>
                  <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.7 }}>
                    Without a session we show all ten districts. With one, we pick the three that drill what your recent lessons surfaced.
                  </p>
                </div>
              </div>
            ) : null
          ) : (
            <section aria-label="Recommended districts">
              <div className="em-section-head">
                <div>
                  <div className="em-eyebrow" style={{ color: 'var(--em-amber)' }}>
                    Hero picks · Polecane dzielnice
                  </div>
                  <h2>Three districts, one short walk.</h2>
                </div>
                <div className="em-section-note">
                  Tap a card to enter the district. Each one drills a pattern
                  Bajla spotted in your recent lessons.
                </div>
              </div>

              <div className="em-hero-grid">
                {session.picks.map((pick, i) => (
                  <HeroCard
                    key={pick.shell}
                    pick={pick}
                    index={i}
                    onSelect={setActiveShell}
                  />
                ))}
              </div>
            </section>
          )}

          <hr className="em-section-divider" aria-hidden />

          <section id="em-all-districts" aria-label="All districts" style={{ scrollMarginTop: 80 }}>
            <div className="em-section-head">
              <div>
                <div className="em-eyebrow" style={{ color: 'var(--em-violet)' }}>
                  All districts · Wszystkie dzielnice
                </div>
                <h2>Explore at your own pace.</h2>
              </div>
              <div className="em-section-note">
                Every game is open — practise anything you like, anytime.
                Twoje postępy zapisują się automatycznie.
              </div>
            </div>

            <div className="em-secondary-grid">
              {otherShells.map((shellKey, i) => (
                <SecondaryCard
                  key={shellKey}
                  shellKey={shellKey}
                  index={i}
                  onSelect={setActiveShell}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <GroupContextProvider value={activeGroup}>
      <div className="em-practice-root">
        {inner}
        {/*
          D1 auto-open overlay (Ricky 2026-05-02). Mounted at the root so it
          survives view changes and so its backdrop covers the whole practice
          surface, not just the shell card. tipInfo is set by handleWrongAnswer
          after a 320ms delay (see the callback definition above).
        */}
        {tipInfo ? (
          <InterferenceTip
            exerciseId={tipInfo.exerciseId}
            studentAnswer={tipInfo.studentAnswer}
            correctAnswer={tipInfo.correctAnswer}
            explanationPL={tipInfo.explanationPL}
            onDismiss={handleTipDismiss}
            showAutoOpenOptOut
            autoOpenOptOut={d1OptOut}
            onAutoOpenOptOutChange={handleAutoOpenOptOutChange}
            // v4 ESL correction context (Ricky 2026-05-02). Prefer the
            // shell-supplied prompt (e.g. cloze sentence), fall back to
            // questionId for shells that don't yet pass it. The adapter
            // only uses this for logging + future model conditioning,
            // never as part of the correction signal itself.
            promptContext={tipInfo.prompt ?? tipInfo.questionId}
          />
        ) : null}
        {/*
          Phase 1.8 §4 #21 (Mike's add-on, Ricky 2026-05-02). Two-stage
          run-control modal — only mounts visibly when shellSession.pendingSession
          is non-null (i.e., student left a snapshot >10min ago). On any other
          shell entry it's a transparent passthrough and renders nothing.
        */}
        {activeShell ? (
          <SessionModal
            pendingSession={
              shellSession.pendingSession
                ? {
                    questionIds: shellSession.pendingSession.questionIds,
                    updatedAt: shellSession.pendingSession.updatedAt,
                    startedAt: shellSession.pendingSession.startedAt,
                  }
                : null
            }
            onContinue={handleSessionContinue}
            onStartFreshNew={handleSessionStartFreshNew}
            onStartFreshSame={handleSessionStartFreshSame}
            totalQuestions={shellSession.pendingSession?.questionIds?.length}
          />
        ) : null}
      </div>
    </GroupContextProvider>
  );
}
