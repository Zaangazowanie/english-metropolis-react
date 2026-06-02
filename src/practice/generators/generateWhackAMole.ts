// generateWhackAMole — thin wrapper around `generateArcade`. The Subway Mole
// platform has 6 holes; with 4-option rounds two holes stay empty per round
// which keeps the platform feeling alive but uncluttered. 5 rounds = a
// natural session.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { generateArcade, ArcadeInput, ArcadePuzzle, ArcadeOpts } from './generateArcade';
export type { ArcadePuzzle } from './generateArcade';

export interface WhackAMolePuzzle extends ArcadePuzzle {}

export function generateWhackAMolePuzzle(
  vocab: ArcadeInput[],
  opts: ArcadeOpts = {},
): WhackAMolePuzzle | null {
  const count = Math.min(5, opts.count ?? 5);
  // Cap options at 4 — more than 4 moles popping at once is overwhelming.
  const optionsPerRound = Math.min(4, opts.optionsPerRound ?? 4);
  return generateArcade(vocab, { ...opts, count, optionsPerRound });
}
