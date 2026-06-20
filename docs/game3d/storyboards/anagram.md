# Mr. Chen's Chalkboard — anagram

**District:** Saffron Market
**Base shell:** src/practice/shells/Anagram.tsx — tap scrambled letter tiles into slots to spell the target word; forgiving no-fail wrong-order.
**Generator:** src/practice/generators/generateAnagram.ts

## Fantasy (2–3 sentences)

You help **Mr. Chen**, the slow-spoken café-keeper of "The Still Cup," after a gust of wind scrambled the chalk letters of his menu board. Tap the scattered chalk letters back into order, word by word, so the café can open. Each word you restore warms the café lamp and pushes the grey Hush back a half-step.

## Camera & stage

- **Camera:** fixed three-quarter on the chalkboard, FOV 46, gentle breathing drift (locked under reducedMotion). No player traversal — a seated café errand.
- **Stage:** dusk Saffron Market. The café shopfront ("The Still Cup") with a warm doorway whose glow strengthens as words are restored; a slate chalkboard in a wooden frame (pure backing — the readable chalk letters are crisp DOM in front of it); a counter with cups and a teapot; hanging paper lanterns; wet teal cobbles; a night wall behind. Palette: ambient Dusk Teal `#2B5F6E`, lantern/doorway Amber `#E8920A`, chalk cream `#f3ead6`. The Hush is a `FogExp2` overlay that recedes as the café warms.
- **Bajla's role:** perched on the counter; explains the first word, nudges after idle, and gives the celebrate wing-flap when the café opens.

## Core loop (beat by beat)

1. **Question presented:** a clue is shown ("A warm morning drink."); empty slots sit over the chalkboard, scrambled chalk letters wait below. English text is crisp DOM, never baked into the slate.
2. **Player action:** tap a chalk letter (or type it) → it drops into the next empty slot; tap a filled slot (or Backspace) to release a letter.
3. **Correct feedback:** when the slots spell the word, the slot row glows green, Mr. Chen reacts warmly, the café lamp pops brighter and the Hush recedes a half-step; a Metro stamp accrues; auto-advance after ~1.1 s.
4. **Wrong feedback (NO-FAIL):** a full-but-wrong arrangement shakes briefly — no red X, no score, no penalty. A whisper line surfaces ("That is not a word — try a different order. No hurry."); the player releases letters and retries.
5. **Progression:** five café words; visiting (solving or skipping) every word fires `onSessionComplete(SessionResult)` once. No score screen — the open café is the reward.

## Shots (4–6 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk café, dark doorway, Hush fog thick; scrambled chalk letters; one clue lit |
| 2 | Question up | Empty slots over the chalkboard; the clue panel; scrambled chalk tiles below |
| 3 | Action moment | A chalk letter dropping into a slot; built readout "3/6 · COF…" |
| 4 | Correct burst | Slots glow green; café doorway blooms amber; Hush recedes; Bajla cheers |
| 5 | Session end | "The Still Cup is open." card with restored-count + replay CTA |

## Input map

Desktop: tap a chalk tile to place it / tap a slot to remove; **type a letter** to place it; **Backspace** removes the last; **H** hint (reveal next letter); **Esc** clears; Tab cycles the tile + slot buttons, Enter/Space activates. Touch: tap tiles/slots (≥44px targets). Keyboard-only: fully playable (type-to-spell + Backspace + H + Esc).

## Quality tiers

high: Hush fog that recedes with warmth, lantern flicker, café point-light, per-solve relight bloom. medium: fog only (no flicker/point-light). low: flat-lit, no fog, static lanterns, DPR 1 — still charming via chalk-on-slate contrast. reducedMotion: no shake animation (the wrong arrangement simply waits), no camera drift, instant slot placement, lamp warms as a single colour step.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Café facade + awning + sign + counter + cups/teapot | Procedural box/cylinder/sphere geometry, vertex colours | 0 KB (in-chunk) |
| Slate chalkboard + frame + tray | Procedural | 0 KB |
| Lanterns (instanced) | Procedural, 1 InstancedMesh | 0 KB |
| Chalk letters / slots / clue | DOM `<button>` overlay (crisp, legible) | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-Anagram3D` ≈ **5 KB gz** ≪ 250 KB.

## Risks

1. **Readable chalk text vs the slate** — letters are DOM (Georgia serif, high-contrast cream on dark slot), never a 3D texture, so legibility is guaranteed at every tier. No risk.
2. **Answer leak via the clue** — a per-shell `safeClue` guard substitutes a length-only clue if the hint contains the answer word (mirrors the 2D shell).
3. **Letters with duplicates** (e.g. COFFEE) — slot/tile matching is by tile id, not letter, so duplicate letters resolve correctly.
