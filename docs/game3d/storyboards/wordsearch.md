# Hunt the Word — wordsearch

**District:** Neon Market
**Base shell:** src/practice/shells/Wordsearch.tsx — words hidden in an N×N letter grid in any of 8 directions; find each word by selecting its first and last letters.
**Generator:** src/practice/generators/generateWordsearch.ts

## Fantasy

The Neon Market blazes at dusk — glowing amber and teal sign-boards advertising stalls in eight languages, but the letters on each marquee hide something more. The night market keeps a puzzle board at the entrance: a glowing letter grid where the city's vocabulary words are hidden in straight lines, running across, up, down, and diagonal. You are the word-hunter: find each word and light it up in the grid. Find them all and the market blazes in celebration.

## Camera & stage

- **Camera:** fixed top-front angle on the market stall area, FOV 54, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk neon market. A dark market wall (`#181424`) with **instanced glowing neon sign boards** (amber `#E8920A` + teal `#2B8FA0`, alternating, `instanceColor`); a market counter; two brass lamps that warm with found-word count. All grid letters and the word list live in the DOM overlay — never baked into a texture (contract rule 9). Palette: Dusk Teal `#1A2C30`, Amber `#ffce86`, teal `#7DD3FC` found.
- **Bajla's role:** the night-market owl on the market stall; idles while you scan; celebrates when the grid is cleared.

## Core loop (beat by beat)

1. **Question presented:** an N×N letter grid (typically 11×11) and a word list with clues appear in the DOM. English text is DOM, never baked.
2. **Player action:** tap/click the **first letter** of a word → it highlights amber (selection start). Tap/click the **last letter** → the straight-line path between them is checked.
3. **Correct feedback:** the word lights teal across the grid; it is struck from the word list. ≤0.3 s.
4. **Wrong feedback (NO-FAIL):** the selection flashes rose briefly, then clears. No words are lost — scan and try again.
5. **Progression:** find every word → `onSessionComplete(SessionResult)` fires once; "The market blazes." completion card with found-count + replay.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dark neon market; glowing sign boards; market counter; Bajla on the stall |
| 2 | Scanning | DOM grid of letters (dark background, cream letters); word list to the right with clues |
| 3 | Word found | A diagonal run of cells lights teal; the word is struck from the list |
| 4 | Session end | "The market blazes." card; found-count score; lamps bright; Bajla celebrating |

## Input map

Desktop: **click** the first letter (it highlights amber), then **click** the last letter of the word (the line between them is validated). **H** = hint (briefly pulses amber on the first letter of an unfound word, ~1.6 s, 3 per session). **"Reveal All"** = expose all remaining words (counts them as missed). Touch: each letter cell is a button; tapping works identically to clicking.

## Quality tiers

high: dusk fog, lamp cores brighten with found-word count, neon boards glow. medium: same minus fog. low: no fog, flat-lit, DPR 1 — found-cell teal still renders. reducedMotion: mismatch flash and hint reveal instant, camera drift locked.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Floor + market back wall | Procedural | 0 KB |
| Neon sign boards (7, instanced + `instanceColor`) | Procedural box | 0 KB |
| Market counter | Procedural | 0 KB |
| Dusk lamps ×2 | Procedural | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Letter grid (N² buttons) + word list | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-Wordsearch3D` ≈ **4 KB gz** ≪ 250 KB.

## Risks

1. **Cell size on small screens** — an 11×11 grid at 375px gives ≈32px cells, below the 44px touch target guideline. Wordsearch cells are traditionally small (letter + click); we use 34px minimum, which is accepted practice for grid puzzles. Users with motor difficulties should use keyboard navigation.
2. **Tap-first-then-last discoverability** — users accustomed to drag-selection may not intuitively discover the two-tap mechanic. The placeholder text "tap first letter · tap last letter" in the footer hint and the amber first-tap highlight together communicate the pattern within 1-2 tries.
