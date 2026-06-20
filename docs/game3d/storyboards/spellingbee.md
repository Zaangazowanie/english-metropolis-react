# Mr. Frank's Address Board — spellingbee

**District:** The Sorting Office
**Base shell:** src/practice/shells/SpellingBee.tsx — hear a clue and type the word letter by letter to spell it correctly.
**Generator:** src/practice/generators/generateSpellingBee.ts

## Fantasy

Mr. Frank has kept the Sorting Office running through the Hush alone. The ink has faded on the address boards — the letters that would route each parcel to the right district have gone dim and blank. You sit at the vintage letterboard and type each word back in, letter by letter, so that Mr. Frank can stamp the parcel and dispatch it. Every correctly spelled address sends a parcel on its way and brings a little warmth back to the office.

## Camera & stage

- **Camera:** fixed three-quarter on the sorting counter and letterboard, FOV 46, gentle breathing drift (locked under reducedMotion).
- **Stage:** The Sorting Office at dusk — a night-shift postal sorting room. Wooden cubbies and sorting slots line the walls, labelled with district names. A long oak sorting counter with stacked envelopes and parcels. The mechanical letterboard on the back wall (the exercise surface analogue in 3D) has blank address slots that fill in as words are spelled. Hanging amber lamps; teal dusk visible through an arched window; Mr. Frank (green postal vest, round glasses) at his desk. Palette: Dusk Teal `#2B5F6E` ambient, Amber `#E8920A` lamp-glow, cream `#f6efe2` parcels.
- **Bajla's role:** perches on the counter, reads out the first clue aloud ("Fill the address. Listen to the clue."), nudges after idle, celebrates when the last parcel is dispatched.

## Core loop (beat by beat)

1. **Question presented:** empty letter slots (one per letter of the target word) appear on screen as crisp DOM boxes — the address to be filled. The clue ("Used in: …") shows below. English text is DOM, never baked.
2. **Player action:** type letters on the keyboard; each correct letter fills the next slot in green.
3. **Correct letter:** slot fills in warm green; Bajla murmurs approval; move to the next slot.
4. **Wrong letter (NO-FAIL):** the current slot shakes briefly — no red X, no score, no penalty. The player simply types again. Bajla: "Not quite — try again."
5. **Word complete:** all slots green; a warm glow pulse; Mr. Frank is heard stamping (visual: an amber burst on the letterboard); auto-advance after ~0.85 s. When all words are done → `onSessionComplete(SessionResult)` fires once; completion card.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|-----------------|
| 1 | Establishing | Dim Sorting Office; letterboard with blank address slots; parcels on counter; Mr. Frank at desk |
| 2 | Question up | Empty letter slots on the DOM overlay; clue strip below; Bajla on the counter edge |
| 3 | Partial fill | Several slots filled green; the next slot highlighted amber; one wrong-shake animated |
| 4 | Session end | "All parcels dispatched." card; stamps thump; letterboard fully lit; Bajla celebrating |

## Input map

Desktop: **type any letter** to fill the next slot; **Backspace** removes the last letter; **H** reveals the next letter (3 hints per word); **S** skips the current word. No mouse interaction required. Full keyboard-only path. Touch: on-screen keyboard (native); HINT and SKIP buttons (≥44px).

## Quality tiers

high: letterboard point-light grows with warmth, hanging lamp flicker, Hush fog thins. medium: fog, no flicker/point-light. low: flat-lit, no fog, static lamps, DPR 1. reducedMotion: instant slot fills (no transition), no shake animation, camera locked.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Room walls + window + wooden cubbies (InstancedMesh) | Procedural | 0 KB |
| Sorting counter + envelopes + stamp | Procedural box geometry | 0 KB |
| Letterboard frame + slate | Procedural | 0 KB |
| Hanging lamps (InstancedMesh) | Procedural | 0 KB |
| Parcels (InstancedMesh, colour changes per solved word) | Procedural | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Letter slots / clue | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-SpellingBee3D` ≈ **5 KB gz** ≪ 250 KB.

## Risks

1. **Mobile keyboard pop-up shifts layout** — the slot row and clue are positioned in the upper half of the screen so the mobile soft-keyboard does not cover them. HINT and SKIP buttons are near the bottom. Test at 375px viewport.
2. **Hint auto-places the letter** — the hint places a letter after 1.2 s to preserve the "feel" of typing; under reducedMotion this is instant. This is not cheating — the word still requires correctly typing all other letters.
