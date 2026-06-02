// generateSnake — thin wrapper around `generateArcade`. The Park Path
// scatters one pellet per option per round across the grid; 4 options
// is the sweet spot (more pellets crowd the board and reduce the
// navigation challenge).
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { generateArcade, ArcadeInput, ArcadePuzzle, ArcadeOpts } from './generateArcade';
export type { ArcadePuzzle } from './generateArcade';

export interface SnakePuzzle extends ArcadePuzzle {}

export function generateSnakePuzzle(
  vocab: ArcadeInput[],
  opts: ArcadeOpts = {},
): SnakePuzzle | null {
  const count = Math.min(5, opts.count ?? 5);
  const optionsPerRound = Math.min(4, opts.optionsPerRound ?? 4);
  return generateArcade(vocab, { ...opts, count, optionsPerRound });
}
