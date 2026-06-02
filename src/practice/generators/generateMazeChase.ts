// generateMazeChase — thin wrapper around `generateArcade`. The Backstreets
// scatter one token per option through the maze; the maze has a fixed
// layout so 4 tokens is the legibility limit.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { generateArcade, ArcadeInput, ArcadePuzzle, ArcadeOpts } from './generateArcade';
export type { ArcadePuzzle } from './generateArcade';

export interface MazeChasePuzzle extends ArcadePuzzle {}

export function generateMazeChasePuzzle(
  vocab: ArcadeInput[],
  opts: ArcadeOpts = {},
): MazeChasePuzzle | null {
  const count = Math.min(5, opts.count ?? 5);
  const optionsPerRound = Math.min(4, opts.optionsPerRound ?? 4);
  return generateArcade(vocab, { ...opts, count, optionsPerRound });
}
