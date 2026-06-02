// generateBattleship — thin wrapper around `generateArcade`. The Harbour
// Grid places one ship per round on an 8x8 grid (3 cells per ship). 4
// rounds (4 ships) is a balanced session — 12 hull cells with the rest
// of the 64 cells being water.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { generateArcade, ArcadeInput, ArcadePuzzle, ArcadeOpts } from './generateArcade';
export type { ArcadePuzzle } from './generateArcade';

export interface BattleshipPuzzle extends ArcadePuzzle {}

export function generateBattleshipPuzzle(
  vocab: ArcadeInput[],
  opts: ArcadeOpts = {},
): BattleshipPuzzle | null {
  const count = Math.min(4, opts.count ?? 4);
  const optionsPerRound = Math.min(4, opts.optionsPerRound ?? 4);
  return generateArcade(vocab, { ...opts, count, optionsPerRound });
}
