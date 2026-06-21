// Fluent City — the arcade colorway. Storybook low-poly London at dusk.
//
// Canonical hexes are from docs/game3d/ORCHESTRATION.md, tuned to harmonise
// with the "Lantern Alley" mood reference (src/practice/shells/Hangman3D.tsx):
// dusk violet-blue sky, warm paper-lantern amber, gold rope, brass fittings,
// park-leaf green, and Bajla the purple owl.
//
// Plain string constants only — no three/react import, so this stays tiny and
// fully tree-shakeable. Build a THREE.Color from a value where you need one
// (e.g. `new THREE.Color(palette.duskTop)`).

export const palette = {
  // ── Dusk sky (top → horizon) — EARLY dusk, Ghibli-luminous ──────────
  // Light still in the sky: a clear evening blue settling into a warm apricot
  // horizon (not deep night). Tuned a touch saturated to match the painted
  // English Metro concept sheets.
  duskTop: '#35588f', // luminous early-dusk blue (zenith)
  duskMid: '#7d93b4', // soft periwinkle haze
  duskHorizon: '#e7a576', // warm apricot horizon band
  skyGlow: '#f8dda6', // pale gold horizon glow

  // ── Warm light ─────────────────────────────────────────────────────
  lanternAmber: '#ffb347', // paper-lantern amber (key warm light)
  lanternCore: '#fff1b8', // hot lantern core / sun-key
  ember: '#ffe9b0', // embers, stars, sparks

  // ── Materials / accents ────────────────────────────────────────────
  brass: '#b08d57', // brass fittings, signage frames
  gold: '#d4a24c', // gold rope / trim
  leaf: '#7fb069', // park foliage, correct-answer green

  // ── Bajla the owl ──────────────────────────────────────────────────
  bajlaPurple: '#8b5fbf', // canonical Bajla purple
  bajlaBelly: '#8b7ba8', // lighter belly / face disc
  bajlaWing: '#5c4a7a', // darker wing / tail / tufts
  bajlaIris: '#22d3ee', // iridescent neck shimmer
  beak: '#fbbf24', // beak + feet

  // ── Night / silhouette ─────────────────────────────────────────────
  night: '#0a0418', // deepest shadow, skyline silhouette
  ink: '#1f0e3a', // dark lantern / shadow violet
} as const

export type PaletteKey = keyof typeof palette

/** Vertical dusk-sky gradient stops (top → bottom). Use for a CSS background
 *  behind the canvas or a vertex-coloured sky dome. */
export const duskSkyStops: readonly string[] = [
  palette.duskTop,
  palette.duskMid,
  palette.duskHorizon,
  palette.skyGlow,
]
