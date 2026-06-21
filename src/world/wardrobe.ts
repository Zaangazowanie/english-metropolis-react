// wardrobe.ts — the English Metro modular character catalog.
//
// This is OUR original, procedural replacement for abeto's binary avatar +
// accessories system (their build ships base + hair1-7 / top1-9 / bottom1-7 /
// shoes1-7 as Draco .drc meshes assembled at runtime by charactergeoworker).
// We match the SAME COUNTS — 7 hair, 9 tops, 7 bottoms, 7 shoes — but author
// every part as procedural geometry (see ModularResident.tsx), so there are
// zero asset bytes, zero new deps, and the whole wardrobe is readable code.
//
// This file is PURE DATA: the style vocabularies, the dusk colour palettes,
// the ResidentSpec shape, and the original 19-character ROSTER (matching
// abeto's ~19 distinct NPCs). ModularResident.tsx turns a spec into meshes.
//
// Canon palette: Dusk Teal #2B5F6E · Amber #E8920A · cream #F6EFE2.

// ── Style vocabularies (counts mirror abeto: 7 / 9 / 7 / 7) ───────────────────
export const HAIR_STYLES = ['crop', 'bun', 'tousled', 'braid', 'curls', 'long', 'fade'] as const
export const TOP_STYLES = ['coat', 'apron', 'vest', 'pullover', 'shawl', 'uniform', 'raincoat', 'cardigan', 'smock'] as const
export const BOTTOM_STYLES = ['trousers', 'skirt', 'shorts', 'longskirt', 'overalls', 'culottes', 'kilt'] as const
export const SHOE_STYLES = ['boots', 'flats', 'clogs', 'sandals', 'hightops', 'loafers', 'wellies'] as const

export type HairStyle = (typeof HAIR_STYLES)[number]
export type TopStyle = (typeof TOP_STYLES)[number]
export type BottomStyle = (typeof BOTTOM_STYLES)[number]
export type ShoeStyle = (typeof SHOE_STYLES)[number]

// ── Dusk colour swatches (cloth / hair / skin) ────────────────────────────────
// Warm dusk-London cloth tones — teals, plums, sages, rusts, ambers, creams.
export const CLOTH = {
  teal: '#2E5C65', tealLt: '#4E7A80', navy: '#34506B', sage: '#5A7A5E',
  plum: '#6B4F70', mauve: '#7A5A6E', rust: '#8A5A3A', bottle: '#3E5E3A',
  clay: '#A8633C', cream: '#D9CDB4', sand: '#CDBA98', amber: '#C2913F',
  rose: '#C57195', slate: '#4A5A66', ink: '#2B2540', wine: '#6E3242',
} as const

export const HAIR_COLOR = {
  black: '#241A16', espresso: '#2E2622', brown: '#4A3B30', auburn: '#7A4A2A',
  grey: '#8A7F7A', silver: '#9A9590', sand: '#9C7A4E', white: '#C8C2BA',
} as const

export const SKIN = {
  fair: '#E8C8A8', warm: '#E0B894', tan: '#D2A77E', deep: '#A9774E', rich: '#7E5436',
} as const

// ── Resident spec — one character's full appearance ───────────────────────────
export interface ResidentSpec {
  /** Canon display name (shown nowhere in 3D — overlay/dialogue only). */
  name: string
  /** Short role note (story canon). */
  role: string
  hair: HairStyle
  top: TopStyle
  bottom: BottomStyle
  shoes: ShoeStyle
  hairColor: string
  topColor: string
  bottomColor: string
  shoeColor: string
  skin: string
  /** Silhouette build: girth 0.8-1.25 (width), height 0.85-1.15 (tall). */
  girth: number
  height: number
}

// ── The original English Metro resident ROSTER (19 — matches abeto's count) ───
// All original designs + names from our Story Bible canon (Flora, Mr. Chen,
// Mr. Frank, Posta, Tomás, Conductor Pell, Ines, Marguerite, Old Quill, The
// Penny, Chef Soup) plus original supporting residents to fill the cast.
export const ROSTER: ResidentSpec[] = [
  { name: 'Flora',            role: 'Saffron Market florist',     hair: 'braid',   top: 'apron',    bottom: 'skirt',     shoes: 'clogs',    hairColor: HAIR_COLOR.auburn,  topColor: CLOTH.sage,   bottomColor: CLOTH.cream, shoeColor: CLOTH.clay,  skin: SKIN.fair, girth: 1.00, height: 1.00 },
  { name: 'Mr. Chen',         role: 'café-keeper, The Still Cup', hair: 'crop',    top: 'uniform',  bottom: 'trousers',  shoes: 'loafers',  hairColor: HAIR_COLOR.grey,    topColor: CLOTH.teal,   bottomColor: CLOTH.slate, shoeColor: CLOTH.ink,   skin: SKIN.tan,  girth: 1.10, height: 1.02 },
  { name: 'Mr. Frank',        role: 'Sorting Office clerk',       hair: 'fade',    top: 'coat',     bottom: 'trousers',  shoes: 'boots',    hairColor: HAIR_COLOR.silver,  topColor: CLOTH.navy,   bottomColor: CLOTH.slate, shoeColor: CLOTH.ink,   skin: SKIN.fair, girth: 1.06, height: 1.05 },
  { name: 'Posta',            role: 'Postcard Pier keeper',       hair: 'long',    top: 'raincoat', bottom: 'longskirt', shoes: 'wellies',  hairColor: HAIR_COLOR.black,   topColor: CLOTH.mauve,  bottomColor: CLOTH.plum,  shoeColor: CLOTH.bottle,skin: SKIN.tan,  girth: 0.96, height: 0.98 },
  { name: 'Tomás',            role: 'young busker',               hair: 'tousled', top: 'pullover', bottom: 'shorts',    shoes: 'hightops', hairColor: HAIR_COLOR.espresso,topColor: CLOTH.rust,   bottomColor: CLOTH.sand,  shoeColor: CLOTH.amber, skin: SKIN.warm, girth: 0.86, height: 0.92 },
  { name: 'Conductor Pell',   role: 'Tannoy Cross conductor',     hair: 'crop',    top: 'coat',     bottom: 'trousers',  shoes: 'boots',    hairColor: HAIR_COLOR.grey,    topColor: CLOTH.bottle, bottomColor: CLOTH.ink,   shoeColor: CLOTH.ink,   skin: SKIN.warm, girth: 1.14, height: 1.06 },
  { name: 'Ines',             role: "lamplighter's kid",          hair: 'curls',   top: 'cardigan', bottom: 'culottes',  shoes: 'flats',    hairColor: HAIR_COLOR.brown,   topColor: CLOTH.tealLt, bottomColor: CLOTH.sand,  shoeColor: CLOTH.clay,  skin: SKIN.fair, girth: 0.80, height: 0.86 },
  { name: 'Marguerite',       role: 'Lanterngate elder',          hair: 'bun',     top: 'shawl',    bottom: 'longskirt', shoes: 'flats',    hairColor: HAIR_COLOR.white,   topColor: CLOTH.plum,   bottomColor: CLOTH.wine,  shoeColor: CLOTH.ink,   skin: SKIN.fair, girth: 1.04, height: 0.94 },
  { name: 'Old Quill',        role: 'Vellum Atelier scribe',      hair: 'long',    top: 'coat',     bottom: 'trousers',  shoes: 'loafers',  hairColor: HAIR_COLOR.silver,  topColor: CLOTH.slate,  bottomColor: CLOTH.ink,   shoeColor: CLOTH.ink,   skin: SKIN.deep, girth: 1.00, height: 1.08 },
  { name: 'The Penny',        role: 'Bulletin Board newsagent',   hair: 'crop',    top: 'vest',     bottom: 'trousers',  shoes: 'loafers',  hairColor: HAIR_COLOR.black,   topColor: CLOTH.wine,   bottomColor: CLOTH.slate, shoeColor: CLOTH.ink,   skin: SKIN.rich, girth: 0.94, height: 0.98 },
  { name: 'Chef Soup',        role: 'Still Cup cook',             hair: 'fade',    top: 'smock',    bottom: 'trousers',  shoes: 'clogs',    hairColor: HAIR_COLOR.espresso,topColor: CLOTH.cream,  bottomColor: CLOTH.slate, shoeColor: CLOTH.clay,  skin: SKIN.warm, girth: 1.18, height: 1.00 },
  { name: 'Dov',              role: 'Mason’s Yard cobbler',       hair: 'tousled', top: 'vest',     bottom: 'overalls',  shoes: 'boots',    hairColor: HAIR_COLOR.brown,   topColor: CLOTH.clay,   bottomColor: CLOTH.navy,  shoeColor: CLOTH.ink,   skin: SKIN.tan,  girth: 1.08, height: 1.02 },
  { name: 'Sable',            role: 'Puzzle Workshop seamstress', hair: 'bun',     top: 'cardigan', bottom: 'skirt',     shoes: 'flats',    hairColor: HAIR_COLOR.black,   topColor: CLOTH.rose,   bottomColor: CLOTH.plum,  shoeColor: CLOTH.wine,  skin: SKIN.deep, girth: 0.92, height: 0.99 },
  { name: 'Bram',             role: 'market greengrocer',         hair: 'crop',    top: 'apron',    bottom: 'trousers',  shoes: 'wellies',  hairColor: HAIR_COLOR.sand,    topColor: CLOTH.sage,   bottomColor: CLOTH.sand,  shoeColor: CLOTH.bottle,skin: SKIN.fair, girth: 1.12, height: 1.04 },
  { name: 'Niamh',            role: 'Clarion Corner busker',      hair: 'curls',   top: 'pullover', bottom: 'culottes',  shoes: 'hightops', hairColor: HAIR_COLOR.auburn,  topColor: CLOTH.teal,   bottomColor: CLOTH.slate, shoeColor: CLOTH.amber, skin: SKIN.warm, girth: 0.88, height: 0.95 },
  { name: 'Otto',             role: 'clockwinder',                hair: 'fade',    top: 'uniform',  bottom: 'trousers',  shoes: 'loafers',  hairColor: HAIR_COLOR.grey,    topColor: CLOTH.navy,   bottomColor: CLOTH.ink,   shoeColor: CLOTH.ink,   skin: SKIN.warm, girth: 1.00, height: 1.10 },
  { name: 'Pim',              role: 'paperboy',                   hair: 'tousled', top: 'cardigan', bottom: 'shorts',    shoes: 'hightops', hairColor: HAIR_COLOR.espresso,topColor: CLOTH.mauve,  bottomColor: CLOTH.sand,  shoeColor: CLOTH.clay,  skin: SKIN.fair, girth: 0.78, height: 0.84 },
  { name: 'Greer',            role: 'Library Bridge keeper',      hair: 'long',    top: 'raincoat', bottom: 'longskirt', shoes: 'wellies',  hairColor: HAIR_COLOR.brown,   topColor: CLOTH.slate,  bottomColor: CLOTH.ink,   shoeColor: CLOTH.bottle,skin: SKIN.deep, girth: 1.02, height: 1.06 },
  { name: 'Wisla',            role: 'Murmur lamplighter',         hair: 'braid',   top: 'coat',     bottom: 'trousers',  shoes: 'boots',    hairColor: HAIR_COLOR.black,   topColor: CLOTH.wine,   bottomColor: CLOTH.ink,   shoeColor: CLOTH.ink,   skin: SKIN.tan,  girth: 0.96, height: 1.00 },
  { name: 'Edda',             role: 'Wander Alley antiquarian',   hair: 'bun',     top: 'shawl',    bottom: 'skirt',     shoes: 'flats',    hairColor: HAIR_COLOR.silver,  topColor: CLOTH.rose,   bottomColor: CLOTH.plum,  shoeColor: CLOTH.wine,  skin: SKIN.fair, girth: 1.00, height: 0.92 },
]

/** A small deterministic pick helper for procedural placement. */
export function pick<T>(arr: readonly T[], i: number): T {
  return arr[((i % arr.length) + arr.length) % arr.length]
}
