# Set the Line — unjumble

**District:** The Puzzle Workshop
**Base shell:** src/practice/shells/Unjumble.tsx — a sentence's words arrive scrambled as wood blocks; set them onto the brass lining gauge in the correct order.
**Generator:** src/practice/generators/generateUnjumble.ts

## Fantasy

The Puzzle Workshop is the city's old typesetter's bench. Each evening a sentence comes apart into loose wooden type-blocks, scattered out of order. You are the compositor: set the blocks onto the brass lining gauge, left to right, until the line reads true. Blocks in the right place glow green; blocks out of place flash rose, so you keep adjusting until the whole line locks. Compose every line and the workshop lamps warm over the bench.

## Camera & stage

- **Camera:** fixed three-quarter on the bench and gauge, FOV 48, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk typesetter's workshop. A teal cobbled floor (`#2B5F6E`); a long oak workbench (`#6E5236`) with a **brass lining gauge** rail across it (`#b08d57`). A row of wooden type-blocks sits on the gauge — one per slot — recolouring to mirror each slot's state; two ink pots flank the bench. The readable English (the words) lives in the crisp DOM overlay, never baked into a texture (contract rule 9). Two brass lamps with amber cores (`palette.lanternCore`) brighten as more lines are set. Palette: Dusk Teal `#2B5F6E`, Amber `#ffce86`, wood `#caa56a`, brass `#b08d57`, green `#34D399` correct, rose `#FB7185` out-of-place.
- **Bajla's role:** perches on the bench; idles while you compose; cheers when a line locks and celebrates at the end.

## Core loop (beat by beat)

1. **Question presented:** the scrambled words render as DOM tray tiles below an empty DOM gauge row; a short bilingual clue shows above. The 3D blocks on the gauge mirror the slots. English text is DOM, never baked.
2. **Player action:** tap a tray tile to set it into the next empty slot (or press 1–9 for the Nth tray tile). Tap a placed block to pull it back; Backspace pulls the last one.
3. **Correct feedback:** when the full line matches, every slot locks green (3D blocks lift + glow); the composed sentence + Polish translation reveal; "Next sentence →". ≤1.5 s.
4. **Wrong feedback (NO-FAIL):** when the line is full but wrong, in-place blocks glow green and out-of-place blocks flash rose — the gauge **stays open**; tap the rose blocks to pull them back and re-set. No penalty, no block.
5. **Progression:** Next sentence → advances; when every line is seen → `onSessionComplete(SessionResult)` fires once; "The lines are set." completion card with score and replay.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk workshop; brass gauge with empty (dim) blocks; ink pots; Bajla on the bench |
| 2 | Composing | DOM tray of word tiles + empty gauge slots; clue line above; a few blocks placed (wood) |
| 3 | Wrong order | Gauge full; in-place blocks green, out-of-place rose (3D + DOM); rose tiles invite a re-drag |
| 4 | Session end | "The lines are set." card; score; lamps warm; Bajla celebrating |

## Input map

Desktop: **1–9** = set the Nth tray tile into the next slot, **Backspace** = pull the last placed block, **H** = hint (locks the leftmost incorrect block, 2 per session), **Enter / Space** = next sentence (after a line locks), **S** = skip. Full mouse path via tray tiles + slot blocks + HINT / SKIP / Next. Fully keyboard-only. Touch: all tiles/slots ≥46px, controls ≥44px, `touchAction: manipulation`.

## Quality tiers

high: dusk fog, lamp cores brighten with warmth, correct-block lift. medium: same minus fog tightening. low: no fog, flat-lit, DPR 1 — blocks still recolour per slot. reducedMotion: block colour/position snap to target (no lerp), camera drift locked.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Floor plane | Procedural | 0 KB |
| Workbench (top + 2 legs) | Procedural box | 0 KB |
| Brass lining gauge rail | Procedural box | 0 KB |
| Type-blocks (one per slot, 3–5) | Procedural box | 0 KB |
| Ink pots ×2 | Procedural cylinder | 0 KB |
| Dusk lamps ×2 | Procedural | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Tray / gauge / clue / HUD | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-Unjumble3D` ≈ **6 KB gz** ≪ 250 KB.

## Risks

1. **Long sentences overflow on mobile** — a 5–6 word line could wrap awkwardly at 375px. The gauge and tray are flex-wrap rows inside a `min(620px, 94vw)` column, so blocks wrap cleanly to a second line rather than overflowing. Test at 375px.
2. **Tap-to-place ordering confusion** — without true drag, placement is "into the next empty slot." This is made predictable by always filling the leftmost empty slot, letting any placed block be tapped back to the tray, and providing the leftmost-incorrect hint, so the player can always recover the exact order.
