# Light the First Lamp — labelleddiagram

**District:** Lanterngate
**Base shell:** src/practice/shells/LabelledDiagram.tsx — drag word-labels onto hotspots in a diagram to name each element.
**Generator:** src/practice/generators/generateLabelledDiagram.ts

## Fantasy

The last train has arrived. Wren steps onto the dark Lanterngate platform — everything is quiet under the Hush, every lamp dark. Bajla lands on the old wooden crate beneath the nearest lamp-post and says: *"It wants to shine — but it just forgot what it shines on. Help it remember."* Four everyday objects sit in the crate in thin shafts of light; four word-cards slide out of Wren's satchel. Name each object correctly and the lamp relights in a slow warm bloom — the first light to come back in the city.

## Camera & stage

- **Camera:** fixed three-quarter on the crate and lamp-post, FOV 46, gentle breathing drift (locked under reducedMotion). Dioramic: intimate, everything readable in one frame.
- **Stage:** Lanterngate station arcade at perpetual dusk. Victorian cast-iron arches, teal tiles, a benched platform; most lanterns dark (the Hush). A tall dark lamp-post front-centre; beneath it a wooden crate holding four small objects (kettle, key, book, cup) each caught in a thin shaft of light, each with an empty brass stand beside it. Palette: Dusk Teal `#2B5F6E` ambient, lantern Amber `#E8920A`, brass `#b08d57`, chalk cream `#f6efe2`.
- **Bajla's role:** perches on the crate edge; delivers the intro flyby and names the kettle as a demonstration ("That is a kettle. Good word. Warm word."); nudges after ~10 s idle; celebrates with a wing-flap when the lamp relights.

## Core loop (beat by beat)

1. **Question presented:** four word-cards (KETTLE / KEY / BOOK / CUP) appear in a row at the bottom of the screen as crisp DOM buttons — from Wren's satchel. Each object in the crate has an empty brass stand with a blank card slot. English text is DOM (never baked into 3D).
2. **Player action:** click/tap a word-card to hold it (it lifts), then click the matching object (or press 1–4) to drop the card onto its brass stand.
3. **Correct feedback:** the card settles on the stand with a soft paper-settle sound (on high tier); the object shines amber; Bajla murmurs warmly; the brass stand glows green.
4. **Wrong feedback (NO-FAIL):** no red X, no score. The card stays in hand; the target object shakes briefly. A Bajla whisper-line: "Not quite — look at the shape. Try again. No hurry."
5. **Progression:** all four named → the lamp-head blooms from dark to amber over 2.2 s (warm bloom VFX, high tier) / a single colour cut (low/reducedMotion) → screen: "You named them. They remembered." → "+1 light — the lamp remembers." → `onSessionComplete(SessionResult)` once.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|-----------------|
| 1 | Establishing | Dark platform; lamp unlit; Hush grey; objects in crate; word-cards not yet visible |
| 2 | Errand start | Four word-cards at the bottom; four brass stands empty; objects lit by thin shafts; Bajla on the crate |
| 3 | Action moment | Player holding "KETTLE" card (lifted); hovering over the kettle object; brass-stand ring glows amber |
| 4 | Lamp relight | All four stands glowing green; lamp-head blooming warm amber; Bajla celebrating; "+1 light" |

## Input map

Desktop: click word-card to pick up, click object to place; press **1–4** to place onto the matching object (left-to-right); **Esc** to drop the held card without placing. Touch: tap word-card → tap object (≥44px). Keyboard-only: Tab to cycle the 4 word-card buttons; Enter/Space to pick up; 1–4 to place; Esc to drop.

## Quality tiers

high: lamp bloom animation (2.2 s, warm PointLight), lantern flicker, Hush fog that clears as the lamp relights. medium: no point-light; fog only. low: flat-lit, no fog, instant lamp colour switch. reducedMotion: no shake, no bloom ramp (instantaneous colour change), camera static.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Lamp-post + head (procedural cylinder + sphere) | Procedural | 0 KB |
| Crate + slats (procedural box) | Procedural | 0 KB |
| Four objects (kettle/key/book/cup — procedural shapes) | Procedural | 0 KB |
| Brass stands (procedural cylinder + box) | Procedural, instanced | 0 KB |
| Lanterns (InstancedMesh) | Procedural | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Word-cards / object buttons | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-LabelledDiagram3D` ≈ **5 KB gz** ≪ 250 KB.

## Risks

1. **Mis-click on the 3D object vs the label slot** — the placement target is a DOM `<button>` overlaid at ≥44px over each object, not a 3D raycaster, so hit precision is pixel-exact. No risk.
2. **Puzzle prop mismatch** — the generator's atrium-schematic hotspots (roof/beam/column/arch/floor/staircase) make no sense in the lamp scene. The shell falls back to DEMO_ITEMS (kettle/key/book/cup) when no fitting vocab is found, and maps up to 4 hotspot labels for real puzzles.
