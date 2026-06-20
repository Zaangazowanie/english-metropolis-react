# Posta's Smudged Postcard — gapfill

**District:** Postcard Pier · Tideway Line
**Base shell:** src/practice/shells/GapFill.tsx — fill blank slots in sentences using a word bank of correct answers + distractors.
**Generator:** src/practice/generators/generateGapFill.ts

## Fantasy

Posta has kept a stack of undelivered postcards at the pier for years. Rain has smudged key words from several of them — the sentences now have grey blurs where the words should be. You sit at the writing desk under the warm lamp and restore each word, so the postcards can finally sail home on the evening tide. Every word restored makes the lamp a little warmer and the Hush a little thinner.

## Camera & stage

- **Camera:** fixed three-quarter on the writing desk and pier railing, FOV 46, gentle breathing drift (locked under reducedMotion).
- **Stage:** Postcard Pier at dusk. A worn wooden writing desk with an ink-pot, quill, and stack of postcards, under a warm amber lamp. Beyond the railing: dark teal river water with amber-streak lantern reflections; soft Hush fog drifting in from the water; distant bridge silhouette. Posta in her sea-glass coat stands at the railing. Paper lanterns sway on a faint river wind. Palette: Dusk Teal `#2B5F6E` dominant, Amber `#E8920A` lamp-glow, cream `#f6efe2` postcard surface.
- **Bajla's role:** perches on the desk edge, narrates the first gap gently ("That word belongs here — look at the sentence."), nudges after ~10 s idle, celebrates when the last postcard is restored.

## Core loop (beat by beat)

1. **Question presented:** a cream postcard (the DOM exercise surface) appears under the desk lamp; the sentence is shown in readable serif text (Georgia, high-contrast ink on cream) with blanks marked in a lighter shade. A word bank of buttons sits below the postcard. English text is DOM — never baked into 3D.
2. **Player action:** tap a word-bank button (or press its number key) to fill the next empty blank.
3. **Correct feedback:** the blank fills in with the word in green; a warm lamp-glow pulse on the desk; Bajla murmurs warmly. No score shown.
4. **Wrong feedback (NO-FAIL):** the tapped word shakes briefly; the blank remains empty; a Bajla whisper: "Not quite — look at the sentence again." The player tries another word.
5. **Progression:** all blanks filled → postcard glows, auto-advances after ~0.9 s. Five postcards total. When all are restored, `onSessionComplete(SessionResult)` fires once; pier lamp is fully warm; completion card.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|-----------------|
| 1 | Establishing | Pier desk in Hush fog, dark river, Posta at railing, postcards on desk |
| 2 | Errand start | Cream postcard overlay with sentence + blank slot; word bank below |
| 3 | Correct fill | Blank fills green, desk lamp pulses warm; remaining bank words still available |
| 4 | Session end | "The postcards can sail." card; pier lamp fully warm; Bajla celebrating |

## Input map

Desktop: click a word-bank button to fill the next gap; press **1–N** (number keys) to select from bank; **S** to skip a scene. Touch: tap word-bank buttons (≥44px). Keyboard-only: number keys 1–N for bank words; S skip; Tab/Enter navigates the buttons.

## Quality tiers

high: river shimmer (animated amber streaks), lantern flicker, desk lamp PointLight, Hush fog thins as postcards are restored. medium: fog, no shimmer/point-light. low: flat-lit, no fog, static lanterns, DPR 1. reducedMotion: instant blank-fills, no shake, camera static.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Pier decking + writing desk + railing | Procedural box geometry | 0 KB |
| River water + amber streak reflections (InstancedMesh) | Procedural | 0 KB |
| Pier lanterns (InstancedMesh) | Procedural | 0 KB |
| Bridge silhouette + background | Procedural | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Postcard text / word-bank buttons | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-GapFill3D` ≈ **6 KB gz** ≪ 250 KB.

## Risks

1. **Postcard legibility on top of the 3D scene** — the postcard is a white DOM overlay with high-contrast ink-on-cream text; the 3D scene is dark behind it. Legibility guaranteed at every tier.
2. **Demo vocab mismatch** — the demo uses generic postcard/city words; real puzzles receive vocab from the GapFill generator's sentence-bank. If a real puzzle has no `exampleEn` sentences, the generator synthesises a safe fallback.
3. **Multi-gap scenes** — the generator can produce `[GAP1]` + `[GAP2]` in one sentence. The shell fills sequentially (GAP1 first, then GAP2); the word bank shows all answers + distractors simultaneously.
