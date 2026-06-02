// generateBalloonPop — thin wrapper around `generateArcade`. The Rooftop
// Garden floats one balloon per option; 4 balloons rising at staggered
// heights is the legibility sweet-spot, and 5-6 rounds makes a session.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { generateArcade, ArcadeInput, ArcadePuzzle, ArcadeOpts } from './generateArcade';
export type { ArcadePuzzle } from './generateArcade';

export interface BalloonPopPuzzle extends ArcadePuzzle {}

export function generateBalloonPopPuzzle(
  vocab: ArcadeInput[],
  opts: ArcadeOpts = {},
): BalloonPopPuzzle | null {
  const count = Math.min(6, opts.count ?? 6);
  const optionsPerRound = Math.min(4, opts.optionsPerRound ?? 4);
  return generateArcade(vocab, { ...opts, count, optionsPerRound });
}
