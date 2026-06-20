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

export type SpeakerId = 'BAJLA' | 'WREN' | 'FLORA' | 'MR_CHEN'

export interface Speaker {
  name: string
  /** Name-tag chip colour. */
  color: string
  /** Readable text colour for the chip label (on the coloured chip). */
  ink: string
}

export const SPEAKERS: Record<SpeakerId, Speaker> = {
  BAJLA:   { name: 'Bajla',    color: palette.bajlaPurple, ink: '#0a0418' },
  WREN:    { name: 'Wren',     color: palette.lanternAmber, ink: '#0a0418' },
  // Canon NPCs (Vertical Slice Script §4):
  //   Flora — warm, brisk flower-market keeper ("fond, brisk")
  FLORA:   { name: 'Flora',    color: '#C8764A', ink: '#0a0418' },
  //   Mr. Chen — quiet, considered café-keeper ("slow, considered speech")
  MR_CHEN: { name: 'Mr. Chen', color: '#4A8BA8', ink: '#0a0418' },
}

// ── Intro cold-open (canon Vertical Slice Beat 1, condensed) ─────────────────
export const INTRO_SCRIPT: DialogueLine[] = [
  { speaker: 'BAJLA', text: 'Hello.' },
  { speaker: 'BAJLA', text: 'That satchel is yours now. The last courier left it.' },
  { speaker: 'WREN',  text: 'You… talk.' },
  { speaker: 'BAJLA', text: 'Mm. So do you. That is how we found each other.' },
  { speaker: 'BAJLA', text: 'Come. One lamp first. Then the rest will remember.' },
]

// ── Per-portal NPC intros (W7) ────────────────────────────────────────────────
// Each plays ONCE per device before the corresponding errand opens. All lines
// are verbatim or minimally condensed from the Vertical Slice Script.
// Key = shellKey from the portal definition.
export const PORTAL_INTROS: Record<string, DialogueLine[]> = {
  // Beat 2 — Lanterngate: "Light the First Lamp" (Bajla at the dark lamp)
  labelleddiagram: [
    { speaker: 'BAJLA', text: 'Here. This one.' },
    { speaker: 'BAJLA', text: 'It wants to shine. It just does not remember what it is shining on.' },
    { speaker: 'BAJLA', text: 'Help it remember.' },
  ],
  // Beat 4a — Saffron Market: "Flora's Bouquet Gift-Tags"
  matching: [
    { speaker: 'FLORA', text: 'Oh. A new face. Good.' },
    { speaker: 'FLORA', text: 'I have four bouquets ready. Four people waiting. But the gift-tags fell.' },
    { speaker: 'FLORA', text: 'You are the delivery person, yes? Put the right tag on the right flowers.' },
  ],
  // Beat 4b — Saffron Market: "The Wind-Scattered Café Chalkboard"
  anagram: [
    { speaker: 'MR_CHEN', text: 'The board. The wind is very unkind today.' },
    { speaker: 'MR_CHEN', text: 'I cannot open until the board is correct. People need to see the menu.' },
    { speaker: 'MR_CHEN', text: 'Without the menu… they do not know they are welcome.' },
  ],
}

// ── "Intro seen" persistence — cold-open (per-device, plays once) ────────────
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

// ── Per-portal intro persistence (each plays once, then goes straight to game) ─
function portalKey(shellKey: string): string {
  return `em-portal-intro-${shellKey}`
}

export function hasSeenPortalIntro(shellKey: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(portalKey(shellKey)) === '1'
  } catch {
    return false
  }
}

export function markPortalIntroSeen(shellKey: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(portalKey(shellKey), '1')
  } catch { /* private mode / quota — silent */ }
}
