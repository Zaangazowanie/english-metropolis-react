// Fluent City GameKit — the shared foundation every src/practice/shells3d game
// builds on. Import only what you need; these modules are side-effect-free so
// unused exports tree-shake away.
//
//   import { CityStage, Bajla, useGameLoop, palette } from './kit'

export { CityStage, resolveQuality, hasWebGL, useStageQuality } from './CityStage'
export type { CityStageProps, QualitySettings, StageQuality } from './CityStage'

export { useGameLoop } from './useGameLoop'
export type { GameLoopOptions, GameLoopApi } from './useGameLoop'

export { Bajla } from './Bajla'
export type { BajlaProps, BajlaVariant } from './Bajla'

export { palette, duskSkyStops } from './palette'
export type { PaletteKey } from './palette'

export { game3dRegistry, findGame3D } from './registry'

// Wave-2 shared "Hand-Drawn Pastel Pipeline" — toon + ink outlines + painted
// sky + the single PaperPost pass. Theme-agnostic; pass a PaperTheme.
export { PaperPost, PastelSky, InkOutline, makeGradientMap, toonRamp } from './paper'
export type { PaperTheme } from './paper'
