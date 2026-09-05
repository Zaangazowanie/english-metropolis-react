// City host and registry contracts. Practice scenes consume their canonical
// controller's typed state and callbacks; registry adapters implement
// Game3DProps. All scenes respect docs/game3d/CONTRACT.md budgets.
//
// A 3D game is a *presentation* of an existing practice shell: same puzzle in,
// same session result out. Controllers in src/practice/shells/ retain the
// canonical mechanics and compact playable WebGL fallbacks.

import type { ComponentType } from 'react'

/** Vocabulary consumed by practice controllers (lib/useStudentVocab). */
export interface Vocab3DItem {
  word: string
  word_pl?: string
  exampleEn?: string
  example_pl?: string
  partOfSpeech?: string
  topic?: string
}

/** Normalized practice onSessionComplete payload — do not extend casually:
 *  practiceProgress/Convex and the scheduler consume this shape. */
export interface SessionResult {
  correctCount: number
  totalQuestions: number
  durationMs?: number
  shellKey: string
}

export type QualityTier = 'high' | 'medium' | 'low'

export interface Game3DProps {
  /** Prebuilt puzzle from the shell's existing generator (same object the 2D
   *  shell receives). When absent the game MUST render its built-in demo
   *  puzzle — anonymous home-page play depends on this. */
  puzzle?: unknown
  /** Raw vocab as an alternative input; run it through the same generator the
   *  2D shell uses (src/practice/generators/). */
  vocab?: Vocab3DItem[]
  onSessionComplete?: (result: SessionResult) => void
  /** Host-decided quality tier (DPR clamp, shadows, particle counts). Games
   *  must be playable at 'low'. */
  quality?: QualityTier
  /** When true (prefers-reduced-motion or host override) all non-essential
   *  animation stops; gameplay-essential motion is reduced to discrete steps. */
  reducedMotion?: boolean
  /** Render in the contained card (home/practice grid) vs fullscreen stage. */
  fullscreen?: boolean
}

export type Game3DComponent = ComponentType<Game3DProps>

/** City registry entry. Practice entries lazy-load the canonical controller
 *  through the local-demo adapter; World entries load their own scenes. */
export interface Game3DRegistryEntry {
  /** Must equal the canonical route key (e.g. 'snake', 'mazechase'). */
  shellKey: string
  /** Current catalogue display name. */
  title: string
  /** Fluent City district the game lives in (see docs/game3d/CONTRACT.md). */
  district: string
  load: () => Promise<{ default: Game3DComponent }>
}
