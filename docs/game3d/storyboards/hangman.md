# Lantern Alley — hangman

**District:** Lantern Alley (the canonical Fluent City mood — dusk London back-alley strung with paper lanterns)
**Base shell:** src/practice/shells/Hangman.tsx — guess the hidden word letter by letter; each wrong letter costs a life.
**Generator:** src/practice/generators/generateHangman.ts (`generateHangman(input, opts) → HangmanPuzzle[]`)

## Fantasy (2–3 sentences)
You are standing in a lantern-strung London alley at dusk. Each paper lantern is a life; every wrong letter snuffs one out, right to left, and a little shower of embers drifts down. Spell the word before the alley goes dark and Bajla the owl loops a celebratory fly-by overhead.

## Camera & stage
- Camera: fixed three-quarter view of the alley, slight idle parallax only (no travel). FOV 42.
- Stage: a back-alley at dusk. A sagging gold rope is strung wall-to-wall carrying N paper lanterns; a low-poly London skyline silhouette (Big Ben left, St Paul's dome right) sits on the horizon under a violet-to-rose dusk sky with a soft moon. Cobble ground catches warm lantern light. Palette: `#1a2348` dusk top, `#6f3580` violet horizon, `#c57195` rose glow, `#ffb347` lantern amber, `#7fb069` correct green.
- Bajla's role: perches/hovers near the leftmost lantern during play (idle); on a solved word she breaks into a full-arc celebratory fly-by.

## Core loop (beat by beat)
1. The hidden word appears as a row of crisp DOM letter-slots (blanks); the Polish translation + optional hint sit beneath it. English text is always DOM, never a 3D texture.
2. Player picks a letter — tap the on-screen A–Z keyboard or press a physical key.
3. Correct: matching slots flip up and fill (≤0.4s); the next-lit lantern gives a brief bright flash; live region announces "X is in the word."
4. Wrong: the rightmost lit lantern dims with a downward ember burst (≤1.2s); the letter greys out on the keyboard; the correct answer is never hidden once the round ends.
5. Solve the word → round won (lanterns blaze, Bajla fly-by); run out of lanterns → the word is revealed, round lost. After N rounds emit SessionResult.

## Shots (4–6 keyframes)
| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk alley, full lantern row lit, skyline + moon, Bajla idle by the first lantern. |
| 2 | Question up | Word as blank slots, clue beneath, A–Z keyboard docked at the bottom. |
| 3 | Action moment | A wrong guess dims the rightmost lantern; embers fall; keyboard key greys out. |
| 4 | Correct burst | Letters fill across the word; a lit lantern flashes bright; "BRIDGE" half-revealed. |
| 5 | Session end | Score card (solved / total) + Bajla celebrating + Replay / Next district CTAs. |

## Input map
Desktop: A–Z keys guess; H = hint; S = skip; Enter replays on the end card. Touch: on-screen A–Z keyboard (≥44px keys) + Hint/Skip buttons. Keyboard-only: every control is a focusable DOM button; the on-screen keyboard is fully tabbable, so no pointer is ever required.

## Quality tiers
high: lantern point-light + flicker, ember bursts, fog, moon glow, Bajla fly-by. medium: emissive-only lanterns, lighter embers, no fog. low: flat-lit lanterns, DPR 1, no embers/particles, instant state changes — still a legible, charming alley.
reducedMotion: no sway, no embers, no fly-by; lanterns switch lit/dark instantly and Bajla holds a calm resting pose. All feedback also lands in the DOM (slots + live region), so motion is never load-bearing.

## Asset list (everything, with budget)
| Asset | Source | Est size |
|-------|--------|----------|
| Sky / skyline / moon / alley | procedural geometry + vertex/standard colours | 0 (code) |
| Lanterns, rope, embers | procedural geometry, instanced embers | 0 (code) |
| Bajla | shared GameKit `Bajla` (procedural) | 0 (code) |
| Fonts / text | DOM overlay only (no baked text) | 0 |
Total static assets: **0 MB** (no `public/games/hangman/`). Code chunk target ≤ 250 KB gz (procedural only; shares `vendor-three`).

## Risks
- Draw-call creep from the skyline + lanterns → instance the skyline buildings and keep lanterns to N≈6 individual groups (well under the 150 draw-call ceiling).
- Surface-vs-folded letters (e.g. accented vocab) → guess against the ASCII-folded uppercase word (same fold the generator uses) and render that folded word in the slots, so guessing and display always align.
