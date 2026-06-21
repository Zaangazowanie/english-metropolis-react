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

export type SpeakerId =
  | 'BAJLA' | 'WREN' | 'FLORA' | 'MR_CHEN'
  | 'MR_FRANK' | 'POSTA' | 'PELL' | 'PENNY' | 'SABLE' | 'GREER'
  | 'OLD_QUILL' | 'DOV' | 'MARGUERITE' | 'OTTO' | 'BRAM'

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
  // District keepers (from the ROSTER — colours echo each one's coat):
  MR_FRANK:   { name: 'Mr. Frank',       color: '#34506B', ink: '#0a0418' }, // Sorting Office clerk
  POSTA:      { name: 'Posta',           color: '#7A5A6E', ink: '#0a0418' }, // Postcard Pier keeper
  PELL:       { name: 'Conductor Pell',  color: '#3E5E3A', ink: '#f6efe2' }, // Tannoy Cross
  PENNY:      { name: 'The Penny',       color: '#6E3242', ink: '#f6efe2' }, // Bulletin Board newsagent
  SABLE:      { name: 'Sable',           color: '#C57195', ink: '#0a0418' }, // Puzzle Workshop seamstress
  GREER:      { name: 'Greer',           color: '#4A5A66', ink: '#f6efe2' }, // Library Bridge / Election Hall
  OLD_QUILL:  { name: 'Old Quill',       color: '#5B6B74', ink: '#f6efe2' }, // Vellum Atelier scribe
  DOV:        { name: 'Dov',             color: '#A8633C', ink: '#0a0418' }, // Mason's Yard cobbler
  MARGUERITE: { name: 'Marguerite',      color: '#6B4F70', ink: '#f6efe2' }, // Memory Cellar elder
  OTTO:       { name: 'Otto',            color: '#2E5C65', ink: '#f6efe2' }, // clockwinder / telegraph
  BRAM:       { name: 'Bram',            color: '#5A7A5E', ink: '#0a0418' }, // Neon Market greengrocer
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

  // ── Districts arc — every district now has a keeper who greets you ──────────
  // The Sorting Office — Mr. Frank's faded address boards.
  spellingbee: [
    { speaker: 'MR_FRANK', text: 'Ah — the new courier. The night shift is long and the ink is older.' },
    { speaker: 'MR_FRANK', text: 'These addresses have gone dim. Spell each one back and I can stamp it.' },
    { speaker: 'MR_FRANK', text: 'One letter at a time. The parcels are patient.' },
  ],
  // Postcard Pier — Posta's rain-smudged cards.
  gapfill: [
    { speaker: 'POSTA', text: 'They never sailed, these ones. The rain took a word from each.' },
    { speaker: 'POSTA', text: 'Fill the blanks and they can finally go home on the tide.' },
    { speaker: 'BAJLA', text: 'She has waited a long time. Be gentle with them.' },
  ],
  // Tannoy Cross — Conductor Pell at the signpost junction.
  truefalse: [
    { speaker: 'PELL', text: 'Mind the crossing. Every sign here makes a claim.' },
    { speaker: 'PELL', text: 'Some are true. Some are crossed wires. Call it — true, or false.' },
    { speaker: 'PELL', text: 'No penalty for a wrong call. The crossing only wants you sure.' },
  ],
  // The Bulletin Board — The Penny's notices.
  multiplechoice: [
    { speaker: 'PENNY', text: 'Fresh notices up tonight. Read one, pin the right answer.' },
    { speaker: 'PENNY', text: 'Four posters, one good pin. Pick careful — but a miss just shows you the right one.' },
  ],
  // The Puzzle Workshop — Sable's typesetting bench.
  unjumble: [
    { speaker: 'SABLE', text: 'The sentence came apart on the bench. Loose blocks, no order.' },
    { speaker: 'SABLE', text: 'Set them on the rail, left to right, until the line reads true.' },
  ],
  // The Post Office — sorting the outgoing mail by route.
  groupsort: [
    { speaker: 'MR_FRANK', text: 'The late post is in. Every envelope wants its right window.' },
    { speaker: 'MR_FRANK', text: 'Route each by its kind. A wrong drop just comes back to you — no harm done.' },
  ],
  // The Election Hall — Greer at the ballot plinths.
  rankorder: [
    { speaker: 'GREER', text: 'Welcome to the count. Tonight we rank, not vote.' },
    { speaker: 'GREER', text: 'Read the order asked for, then set each ballot on its plinth, first to last.' },
  ],
  // The Editor's Office — The Penny on the night desk.
  sentencecorrection: [
    { speaker: 'PENNY', text: 'Wire copy, hot off the ticker — and every line has one slip in it.' },
    { speaker: 'PENNY', text: 'Find the wrong word, fix it, file it. Catch it before it goes to press.' },
  ],
  // The Mason's Yard — Dov at the chisel bench.
  wordformation: [
    { speaker: 'DOV', text: 'A raw block, a root word stamped on it. The sentence above needs the right shape.' },
    { speaker: 'DOV', text: 'Chisel the form to fit the gap. Take your time; the stone keeps.' },
  ],
  // The Memory Cellar — Marguerite by the card table.
  concentration: [
    { speaker: 'MARGUERITE', text: 'Down here it is cool and the lamp is kind. Sit. Turn the cards two at a time.' },
    { speaker: 'MARGUERITE', text: 'Match the clue to its word. The pairs are shy, but they remember you.' },
  ],
  // The Vellum Atelier — Old Quill at the scribe's desk.
  opencloze: [
    { speaker: 'OLD_QUILL', text: 'The page lost a few small words to the years. Ink them back in.' },
    { speaker: 'OLD_QUILL', text: 'The little hinges — in, of, on — hold the whole sentence upright.' },
  ],
  // Café Spółdzielnia — Mr. Chen's vocabulary deck.
  flashcards: [
    { speaker: 'MR_CHEN', text: 'A quiet corner, a deck of cards. No score here.' },
    { speaker: 'MR_CHEN', text: 'Read the front, say it, then turn it. Known, or come-back-later. Only you decide.' },
  ],
  // The Translator's Booth — Otto on the night wire.
  sentencetransform: [
    { speaker: 'OTTO', text: 'Two screens, one meaning. A line comes in; you send it on, rebuilt.' },
    { speaker: 'OTTO', text: 'Keep the key word, keep the sense, change the shape. The booth lights gold when it holds.' },
  ],
  // Neon Market — Bram among the glowing signs.
  wordsearch: [
    { speaker: 'BRAM', text: 'The market signs hide more than they sell. Words tucked in the letters.' },
    { speaker: 'BRAM', text: 'Find each one — tap its first letter, then its last. They light up cyan when caught.' },
  ],
  // The Telegraph Office — Otto on the brass key.
  typingtest: [
    { speaker: 'OTTO', text: 'Dispatches off the wire, one after another. Tap them out clean.' },
    { speaker: 'OTTO', text: 'A wrong key just jams a moment — no penalty. Find your rhythm; the tape will follow.' },
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
