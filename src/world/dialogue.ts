// dialogue.ts — English Metro's visual-novel script data + speaker registry.
//
// The VN system is the canonical abeto feature: a name-tag chip + text box +
// advance arrow overlaid on the 3D world. Learner-facing English lives in the
// DOM (contract rule 9), never baked into a texture.
//
// Pure data + tiny localStorage helpers. No three/react import.

import { palette } from '../practice/shells3d/kit/palette'

export interface DialogueLine {
  speaker: SpeakerId
  text: string
}

export type SpeakerId = 'BAJLA' | 'WREN'

export interface Speaker {
  name: string
  /** Name-tag chip colour. */
  color: string
  /** Readable text colour for the chip label (on the coloured chip). */
  ink: string
}

export const SPEAKERS: Record<SpeakerId, Speaker> = {
  BAJLA: { name: 'Bajla', color: palette.bajlaPurple, ink: '#0a0418' },
  WREN:  { name: 'Wren',  color: palette.lanternAmber, ink: '#0a0418' },
}

// ── Intro cold-open (canon Vertical Slice Beat 1, condensed for the VN box) ──
export const INTRO_SCRIPT: DialogueLine[] = [
  { speaker: 'BAJLA', text: 'Hello.' },
  { speaker: 'BAJLA', text: 'That satchel is yours now. The last courier left it.' },
  { speaker: 'WREN',  text: 'You… talk.' },
  { speaker: 'BAJLA', text: 'Mm. So do you. That is how we found each other.' },
  { speaker: 'BAJLA', text: 'Come. One lamp first. Then the rest will remember.' },
]

// ── "Intro seen" persistence (per-device; onboarding plays once) ─────────────
const INTRO_KEY = 'em-intro-seen'

export function hasSeenIntro(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(INTRO_KEY) === '1'
  } catch {
    return false
  }
}

export function markIntroSeen(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(INTRO_KEY, '1')
  } catch { /* private mode / quota — silent */ }
}
