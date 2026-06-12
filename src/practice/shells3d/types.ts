// Fluent City 3D game shells — the binding contract (2026-06-12).
// Every game in src/practice/shells3d/ MUST implement Game3DProps and respect
// the budgets in docs/game3d/CONTRACT.md. CI (game3d-gate) enforces them.
//
// A 3D game is a *presentation* of an existing practice shell: same puzzle in,
// same session result out. The 2D shell in src/practice/shells/ remains the
// canonical mechanic and the automatic fallback (WebGL unavailable, reduced
// motion, low-end device). Never fork the pedagogy — only the stagecraft.

import type { ComponentType } from 'react'

/** Same VocabItem the 2D shells consume (src/practice/lib/useStudentVocab). */
export interface Vocab3DItem {
  word: string
  word_pl?: string
  exampleEn?: string
  example_pl?: string
  partOfSpeech?: string
  topic?: string
}

/** Mirrors the 2D shells' onSessionComplete payload — do not extend casually:
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

/** Per-game registry entry. The host (StudentPractice / playable home) lazy-
 *  loads the 3D variant and falls back to the 2D shell on failure. */
export interface Game3DRegistryEntry {
  /** Must equal the 2D shell's route key (e.g. 'snake', 'mazechase'). */
  shellKey: string
  /** Storybook display name, e.g. 'Metro Snake'. */
  title: string
  /** Fluent City district the game lives in (see docs/game3d/CONTRACT.md). */
  district: string
  load: () => Promise<{ default: Game3DComponent }>
}
