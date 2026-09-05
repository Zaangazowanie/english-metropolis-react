import type { Game3DRegistryEntry } from '../types'
import { loadArcadeEntry } from './arcade-entry'

// One canonical game per district. City errands and practice share gameplay.
export const game3dRegistry: Game3DRegistryEntry[] = [
  { shellKey: 'crossword', title: 'The Grid District', district: 'The Grid District', load: () => loadArcadeEntry('crossword', 'The Grid District', 1, () => import('../../shells/Crossword'), '#00D9FF') },
  { shellKey: 'wordsearch', title: 'The Neon Market', district: 'The Neon Market', load: () => loadArcadeEntry('wordsearch', 'The Neon Market', 2, () => import('../../shells/Wordsearch'), '#FFCC00') },
  { shellKey: 'gapfill', title: 'The Construction Quarter', district: 'The Construction Quarter', load: () => loadArcadeEntry('gapfill', 'The Construction Quarter', 3, () => import('../../shells/GapFill'), '#FF3864') },
  { shellKey: 'hangman', title: 'The Lantern Alley', district: 'The Lantern Alley', load: () => loadArcadeEntry('hangman', 'The Lantern Alley', 4, () => import('../../shells/Hangman'), '#FFCC00') },
  { shellKey: 'matching', title: 'The Bridge District', district: 'The Bridge District', load: () => loadArcadeEntry('matching', 'The Bridge District', 5, () => import('../../shells/Matching'), '#8950FF') },
  { shellKey: 'flashcards', title: 'The Library Tower', district: 'The Library Tower', load: () => loadArcadeEntry('flashcards', 'The Library Tower', 6, () => import('../../shells/Flashcards'), '#00E797') },
  { shellKey: 'dragdrop', title: 'The Sorting Station', district: 'The Sorting Station', load: () => loadArcadeEntry('dragdrop', 'The Sorting Station', 7, () => import('../../shells/DragDrop'), '#00D9FF') },
  { shellKey: 'groupsort', title: 'The Roundabout', district: 'The Roundabout', load: () => loadArcadeEntry('groupsort', 'The Roundabout', 8, () => import('../../shells/GroupSort'), '#BAFF00') },
  { shellKey: 'truefalse', title: 'The Courthouse', district: 'The Courthouse', load: () => loadArcadeEntry('truefalse', 'The Courthouse', 9, () => import('../../shells/TrueFalse'), '#FF3864') },
  { shellKey: 'anagram', title: 'The Letter Workshop', district: 'The Letter Workshop', load: () => loadArcadeEntry('anagram', 'The Letter Workshop', 10, () => import('../../shells/Anagram'), '#FF32C8') },
  { shellKey: 'multiplechoice', title: 'The Bulletin Board', district: 'The Bulletin Board', load: () => loadArcadeEntry('multiplechoice', 'The Bulletin Board', 11, () => import('../../shells/MultipleChoice'), '#FF3864') },
  { shellKey: 'opencloze', title: 'The Vellum Atelier', district: 'The Vellum Atelier', load: () => loadArcadeEntry('opencloze', 'The Vellum Atelier', 12, () => import('../../shells/OpenCloze'), '#00D9FF') },
  { shellKey: 'sentencetransform', title: "The Translator's Booth", district: "The Translator's Booth", load: () => loadArcadeEntry('sentencetransform', "The Translator's Booth", 13, () => import('../../shells/SentenceTransform'), '#8950FF') },
  { shellKey: 'wordformation', title: "The Mason's Yard", district: "The Mason's Yard", load: () => loadArcadeEntry('wordformation', "The Mason's Yard", 14, () => import('../../shells/WordFormation'), '#FFCC00') },
  { shellKey: 'sentencecorrection', title: "The Editor's Office", district: "The Editor's Office", load: () => loadArcadeEntry('sentencecorrection', "The Editor's Office", 15, () => import('../../shells/SentenceCorrection'), '#FF3864') },
  { shellKey: 'spellingbee', title: 'The Concert Hall', district: 'The Concert Hall', load: () => loadArcadeEntry('spellingbee', 'The Concert Hall', 16, () => import('../../shells/SpellingBee'), '#FFCC00') },
  { shellKey: 'typingtest', title: 'The Telegraph Office', district: 'The Telegraph Office', load: () => loadArcadeEntry('typingtest', 'The Telegraph Office', 17, () => import('../../shells/TypingTest'), '#00D9FF') },
  { shellKey: 'openthebox', title: 'The Vault Room', district: 'The Vault Room', load: () => loadArcadeEntry('openthebox', 'The Vault Room', 18, () => import('../../shells/OpenTheBox'), '#FFCC00') },
  { shellKey: 'spinthewheel', title: 'The Carnival Wheel', district: 'The Carnival Wheel', load: () => loadArcadeEntry('spinthewheel', 'The Carnival Wheel', 19, () => import('../../shells/SpinTheWheel'), '#FF32C8') },
  { shellKey: 'whackamole', title: 'The Subway Mole', district: 'The Subway Mole', load: () => loadArcadeEntry('whackamole', 'The Subway Mole', 20, () => import('../../shells/WhackAMole'), '#BAFF00') },
  { shellKey: 'balloonpop', title: 'The Rooftop Garden', district: 'The Rooftop Garden', load: () => loadArcadeEntry('balloonpop', 'The Rooftop Garden', 21, () => import('../../shells/BalloonPop'), '#FF3864') },
  { shellKey: 'snake', title: 'The Park Path', district: 'The Park Path', load: () => loadArcadeEntry('snake', 'The Park Path', 22, () => import('../../shells/Snake'), '#00E797') },
  { shellKey: 'mazechase', title: 'The Backstreets', district: 'The Backstreets', load: () => loadArcadeEntry('mazechase', 'The Backstreets', 23, () => import('../../shells/MazeChase'), '#00D9FF') },
  { shellKey: 'battleship', title: 'The Harbour Grid', district: 'The Harbour Grid', load: () => loadArcadeEntry('battleship', 'The Harbour Grid', 24, () => import('../../shells/Battleship'), '#00D9FF') },
  { shellKey: 'readingcomp', title: 'The Reading Room', district: 'The Reading Room', load: () => loadArcadeEntry('readingcomp', 'The Reading Room', 25, () => import('../../shells/ReadingComp'), '#00E797') },
  { shellKey: 'listeningcomp', title: 'The Listening Booth', district: 'The Listening Booth', load: () => loadArcadeEntry('listeningcomp', 'The Listening Booth', 26, () => import('../../shells/ListeningComp'), '#8950FF') },
  { shellKey: 'picturequiz', title: 'The Photography Salon', district: 'The Photography Salon', load: () => loadArcadeEntry('picturequiz', 'The Photography Salon', 27, () => import('../../shells/PictureQuiz'), '#FF32C8') },
  { shellKey: 'speakingcards', title: 'The Speakeasy', district: 'The Speakeasy', load: () => loadArcadeEntry('speakingcards', 'The Speakeasy', 28, () => import('../../shells/SpeakingCards'), '#FFCC00') },
  { shellKey: 'labelleddiagram', title: 'The Atrium Schematic', district: 'The Atrium Schematic', load: () => loadArcadeEntry('labelleddiagram', 'The Atrium Schematic', 29, () => import('../../shells/LabelledDiagram'), '#00D9FF') },
  { shellKey: 'rankorder', title: 'The Election Hall', district: 'The Election Hall', load: () => loadArcadeEntry('rankorder', 'The Election Hall', 30, () => import('../../shells/RankOrder'), '#BAFF00') },
  { shellKey: 'unjumble', title: 'The Puzzle Workshop', district: 'The Puzzle Workshop', load: () => loadArcadeEntry('unjumble', 'The Puzzle Workshop', 31, () => import('../../shells/Unjumble'), '#FF32C8') },
  { shellKey: 'quizshow', title: 'The Auditorium', district: 'The Auditorium', load: () => loadArcadeEntry('quizshow', 'The Auditorium', 32, () => import('../../shells/QuizShow'), '#FFCC00') },
  { shellKey: 'concentration', title: 'The Memory Cellar', district: 'The Memory Cellar', load: () => loadArcadeEntry('concentration', 'The Memory Cellar', 33, () => import('../../shells/Concentration'), '#8950FF') },
  { shellKey: 'findthematch', title: 'The Lost & Found', district: 'The Lost & Found', load: () => loadArcadeEntry('findthematch', 'The Lost & Found', 34, () => import('../../shells/FindTheMatch'), '#00D9FF') },
  { shellKey: 'randomcards', title: "The Dealer's Table", district: "The Dealer's Table", load: () => loadArcadeEntry('randomcards', "The Dealer's Table", 35, () => import('../../shells/RandomCards'), '#FF3864') },
  { shellKey: 'randomwheel', title: 'The Spinner Stand', district: 'The Spinner Stand', load: () => loadArcadeEntry('randomwheel', 'The Spinner Stand', 36, () => import('../../shells/RandomWheel'), '#FFCC00') },
  { shellKey: 'airplane', title: 'The Aerodrome', district: 'The Aerodrome', load: () => loadArcadeEntry('airplane', 'The Aerodrome', 37, () => import('../../shells/Airplane'), '#00D9FF') },
  { shellKey: 'flyingfruit', title: 'The Orchard Square', district: 'The Orchard Square', load: () => loadArcadeEntry('flyingfruit', 'The Orchard Square', 38, () => import('../../shells/FlyingFruit'), '#00E797') },
  { shellKey: 'city-hub', title: 'City Hub', district: 'The Central Square', load: () => import('../CityHub3D') },
  { shellKey: 'world-englishmetro', title: 'English Metro — Enter the City', district: 'All Districts', load: () => import('../../../world/EnglishMetroWorld') },
  { shellKey: 'world-planet', title: 'English Metro — Tiny Planet (preview)', district: 'All Districts', load: () => import('../../../world/PlanetWorld') },
]

export function findGame3D(shellKey: string): Game3DRegistryEntry | undefined {
  return game3dRegistry.find(entry => entry.shellKey === shellKey)
}
