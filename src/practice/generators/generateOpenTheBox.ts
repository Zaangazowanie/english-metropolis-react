// generateOpenTheBox — thin wrapper around the shared `generateArcade` MCQ
// generator. The Vault Room renders one box per round (3-9 boxes is a
// good visual fit; we cap at 9).
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { generateArcade, ArcadeInput, ArcadePuzzle, ArcadeOpts } from './generateArcade';
export type { ArcadePuzzle } from './generateArcade';

export interface OpenTheBoxPuzzle extends ArcadePuzzle {}

export function generateOpenTheBoxPuzzle(
  vocab: ArcadeInput[],
  opts: ArcadeOpts = {},
): OpenTheBoxPuzzle | null {
  // Vault wall reads cleanest at 6-9 boxes. Cap aggressively.
  const count = Math.min(9, opts.count ?? 9);
  return generateArcade(vocab, { ...opts, count, optionsPerRound: opts.optionsPerRound ?? 4 });
}
