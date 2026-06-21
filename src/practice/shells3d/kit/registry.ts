import type { Game3DRegistryEntry } from '../types'

/**
 * The Fluent City arcade registry — the list of available 3D games.
 *
 * Empty in PR 0: the foundation ships the GameKit only. Each Wave-1 build PR
 * appends exactly ONE entry (its `shellKey` MUST equal the 2D shell's route
 * key, e.g. 'snake', 'mazechase'). The host lazy-loads `load()` and falls back
 * to the canonical 2D shell on any failure.
 *
 * Example entry a future game PR would add:
 *   {
 *     shellKey: 'snake',
 *     title: 'Metro Snake',
 *     district: 'The Underground',
 *     load: () => import('../Snake3D'),
 *   }
 */
export const game3dRegistry: Game3DRegistryEntry[] = [
  {
    shellKey: 'city-hub',
    title: 'City Hub',
    district: 'The Central Square',
    load: () => import('../CityHub3D'),
  },
  {
    shellKey: 'airplane',
    title: 'Paper Plane Post',
    district: 'Royal Mail Sky Route',
    load: () => import('../Airplane3D'),
  },
  {
    shellKey: 'balloonpop',
    title: 'Thames Balloon Festival',
    district: 'Thames Balloon Festival',
    load: () => import('../BalloonPop3D'),
  },
  {
    shellKey: 'battleship',
    title: 'Bathtub Fleet',
    district: 'Little Venice Canals',
    load: () => import('../Battleship3D'),
  },
  {
    shellKey: 'mazechase',
    title: 'Museum After Dark',
    district: 'Museum After Dark',
    load: () => import('../MazeChase3D'),
  },
  {
    shellKey: 'openthebox',
    title: 'The Vault Job',
    district: 'The Bank Vault',
    load: () => import('../OpenTheBox3D'),
  },
  {
    shellKey: 'snake',
    title: 'Metro Snake',
    district: 'The Underground',
    load: () => import('../Snake3D'),
  },
  {
    shellKey: 'spinthewheel',
    title: 'Pier Carnival Wheel',
    district: 'Brighton Pier Carnival',
    load: () => import('../SpinTheWheel3D'),
  },
  {
    shellKey: 'whackamole',
    title: 'Camden Pop-Up Pigeons',
    district: 'Camden Market',
    load: () => import('../WhackAMole3D'),
  },
  {
    shellKey: 'matching',
    title: "Flora's Bouquets",
    district: 'Saffron Market',
    load: () => import('../Matching3D'),
  },
  {
    shellKey: 'anagram',
    title: "Mr. Chen's Chalkboard",
    district: 'Saffron Market',
    load: () => import('../Anagram3D'),
  },
  {
    shellKey: 'labelleddiagram',
    title: 'Light the First Lamp',
    district: 'Lanterngate',
    load: () => import('../LabelledDiagram3D'),
  },
  {
    shellKey: 'gapfill',
    title: "Posta's Smudged Postcard",
    district: 'Postcard Pier',
    load: () => import('../GapFill3D'),
  },
  {
    shellKey: 'spellingbee',
    title: "Mr. Frank's Address Board",
    district: 'The Sorting Office',
    load: () => import('../SpellingBee3D'),
  },
  {
    shellKey: 'truefalse',
    title: 'The Crossroads',
    district: 'Tannoy Cross',
    load: () => import('../TrueFalse3D'),
  },
  {
    shellKey: 'multiplechoice',
    title: 'Pin the Poster',
    district: 'The Bulletin Board',
    load: () => import('../MultipleChoice3D'),
  },
  {
    shellKey: 'unjumble',
    title: 'Set the Line',
    district: 'The Puzzle Workshop',
    load: () => import('../Unjumble3D'),
  },
  {
    shellKey: 'groupsort',
    title: 'Sort the Mail',
    district: 'The Post Office',
    load: () => import('../GroupSort3D'),
  },
  {
    shellKey: 'rankorder',
    title: 'Rank the Ballots',
    district: 'The Election Hall',
    load: () => import('../RankOrder3D'),
  },
  {
    shellKey: 'sentencecorrection',
    title: 'File the Proof',
    district: "The Editor's Office",
    load: () => import('../SentenceCorrection3D'),
  },
  {
    shellKey: 'wordformation',
    title: 'Chisel the Form',
    district: "The Mason's Yard",
    load: () => import('../WordFormation3D'),
  },
  // ── English Metro WorldKit (Addendum A, approved 2026-06-20) ─────────────
  // The explorable dusk-London hub. "shellKey" intentionally uses the world
  // prefix so GameHome renders it as an "Enter the City" hero entry above
  // the per-game departures board. Budget: world-englishmetro ≤ 600 KB gz.
  {
    shellKey: 'world-englishmetro',
    title: 'English Metro — Enter the City',
    district: 'All Districts',
    load: () => import('../../../world/EnglishMetroWorld'),
  },
]

/** Look up a registered 3D game by its 2D shell route key. */
export function findGame3D(shellKey: string): Game3DRegistryEntry | undefined {
  return game3dRegistry.find((entry) => entry.shellKey === shellKey)
}
