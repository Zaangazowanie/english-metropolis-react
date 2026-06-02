// generateSpinTheWheel — thin wrapper around `generateArcade`. The Carnival
// Wheel renders 4-8 wedges per round (one per option) and 4-6 rounds is
// the natural session length.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { generateArcade, ArcadeInput, ArcadePuzzle, ArcadeOpts } from './generateArcade';
export type { ArcadePuzzle } from './generateArcade';

export interface SpinTheWheelPuzzle extends ArcadePuzzle {}

export function generateSpinTheWheelPuzzle(
  vocab: ArcadeInput[],
  opts: ArcadeOpts = {},
): SpinTheWheelPuzzle | null {
  // 6 rounds, 4 wedges each — wedge labels stay readable.
  const count = Math.min(6, opts.count ?? 6);
  return generateArcade(vocab, { ...opts, count, optionsPerRound: opts.optionsPerRound ?? 4 });
}
