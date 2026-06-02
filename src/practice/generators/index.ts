// Barrel export for the puzzle generators.
// Each generator is pure, deterministic given a `seed`, and has no React /
// DOM / Convex client dependencies. They run server-side (Convex actions)
// or as data-prep scripts.
export { generateCrossword } from './generateCrossword';
export type { CrosswordPuzzle, CrosswordWord } from './generateCrossword';

export { generateWordsearch } from './generateWordsearch';
export type { WordsearchPuzzle, WSDir } from './generateWordsearch';

export { generateAnagram } from './generateAnagram';
export type { AnagramPuzzle } from './generateAnagram';

export { generateMatching } from './generateMatching';
export type { MatchingPuzzle, LineColor } from './generateMatching';

export { generateFlashcards } from './generateFlashcards';
export type { FlashcardsPuzzle } from './generateFlashcards';

export { generateGapFill } from './generateGapFill';
export type { GapFillPuzzle, GapFillScene, GapFillGap, GapFillInput } from './generateGapFill';

export { generateHangman } from './generateHangman';
export type { HangmanPuzzle, HangmanInput } from './generateHangman';

export { generateGroupSort } from './generateGroupSort';
export type {
  GroupSortPuzzle,
  GroupSortCategory,
  GroupSortItem,
  GroupSortInput,
} from './generateGroupSort';

export { generateTrueFalse } from './generateTrueFalse';
export type { TrueFalsePuzzle, TrueFalseStatement, TrueFalseInput } from './generateTrueFalse';

export { generateDragDrop } from './generateDragDrop';
export type {
  DragDropPuzzle,
  DragDropBin,
  DragDropItem,
  DragDropInput,
} from './generateDragDrop';

// ─── Selection / exam-standard (Agent 1, 2026-05-02) ─────────────────────
export { generateMultipleChoice } from './generateMultipleChoice';
export type {
  MultipleChoicePuzzle,
  MultipleChoiceQuestion,
  MultipleChoiceInput,
} from './generateMultipleChoice';

export { generateOpenCloze } from './generateOpenCloze';
export type { OpenClozePuzzle, OpenClozeGap, OpenClozeInput } from './generateOpenCloze';

export { generateSentenceTransform } from './generateSentenceTransform';
export type {
  SentenceTransformPuzzle,
  SentenceTransformItem,
  SentenceTransformInput,
} from './generateSentenceTransform';

export { generateWordFormation } from './generateWordFormation';
export type {
  WordFormationPuzzle,
  WordFormationItem,
  WordFormationInput,
  TargetPos,
} from './generateWordFormation';

export { generateSentenceCorrection } from './generateSentenceCorrection';
export type {
  SentenceCorrectionPuzzle,
  SentenceCorrectionItem,
  SentenceCorrectionInput,
} from './generateSentenceCorrection';

export { generateSpellingBee } from './generateSpellingBee';
export type { SpellingBeePuzzle, SpellingBeeWord, SpellingBeeInput } from './generateSpellingBee';

export { generateTypingTest } from './generateTypingTest';
export type { TypingTestPuzzle, TypingTestPhrase, TypingTestInput } from './generateTypingTest';

// ─── Arcade / game-feel (Agent 2, 2026-05-02) ────────────────────────────
export { generateArcade } from './generateArcade';
export type { ArcadePuzzle, ArcadeRound, ArcadeInput, ArcadeOpts } from './generateArcade';

export { generateOpenTheBoxPuzzle } from './generateOpenTheBox';
export type { OpenTheBoxPuzzle } from './generateOpenTheBox';

export { generateSpinTheWheelPuzzle } from './generateSpinTheWheel';
export type { SpinTheWheelPuzzle } from './generateSpinTheWheel';

export { generateWhackAMolePuzzle } from './generateWhackAMole';
export type { WhackAMolePuzzle } from './generateWhackAMole';

export { generateBalloonPopPuzzle } from './generateBalloonPop';
export type { BalloonPopPuzzle } from './generateBalloonPop';

export { generateSnakePuzzle } from './generateSnake';
export type { SnakePuzzle } from './generateSnake';

export { generateMazeChasePuzzle } from './generateMazeChase';
export type { MazeChasePuzzle } from './generateMazeChase';

export { generateBattleshipPuzzle } from './generateBattleship';
export type { BattleshipPuzzle } from './generateBattleship';

// ─── Reading / listening / ordering (Agent 3, 2026-05-02) ────────────────
export { generateReadingCompPuzzle } from './generateReadingComp';
export type {
  ReadingCompPuzzle,
  ReadingCompQuestion,
  ReadingCompInput,
} from './generateReadingComp';

export { generateListeningCompPuzzle } from './generateListeningComp';
export type {
  ListeningCompPuzzle,
  ListeningCompQuestion,
  ListeningCompInput,
} from './generateListeningComp';

export { generatePictureQuizPuzzle } from './generatePictureQuiz';
export type {
  PictureQuizPuzzle,
  PictureQuizItem,
  PictureQuizInput,
} from './generatePictureQuiz';

export { generateSpeakingCardsPuzzle } from './generateSpeakingCards';
export type {
  SpeakingCardsPuzzle,
  SpeakingCard,
  SpeakingCardsInput,
} from './generateSpeakingCards';

export { generateLabelledDiagramPuzzle } from './generateLabelledDiagram';
export type {
  LabelledDiagramPuzzle,
  LabelledHotspot,
  LabelledDiagramInput,
} from './generateLabelledDiagram';

export { generateRankOrderPuzzle } from './generateRankOrder';
export type { RankOrderPuzzle, RankItem, RankOrderInput } from './generateRankOrder';

export { generateUnjumblePuzzle } from './generateUnjumble';
export type { UnjumblePuzzle, UnjumbleSentence, UnjumbleInput } from './generateUnjumble';

// ─── MCQ-wrapper variety (Agent 4, 2026-05-02) ───────────────────────────
export { generateWrapperPuzzle } from './wrapperPuzzle';
export type { WrapperPuzzle, WrapperRound, WrapperInput } from './wrapperPuzzle';

export { generateQuizShow } from './generateQuizShow';
export { generateConcentration } from './generateConcentration';
export { generateFindTheMatch } from './generateFindTheMatch';
export { generateRandomCards } from './generateRandomCards';
export { generateRandomWheel } from './generateRandomWheel';
export { generateAirplane } from './generateAirplane';
export { generateFlyingFruit } from './generateFlyingFruit';

export { makeRng, hashString, shuffle, isDirectRun } from './rng';
