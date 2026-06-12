# Bathtub Fleet — battleship

**District:** Little Venice Canals — a fleet of clockwork bath-toy boats afloat on a dusk canal basin (the 2D shell's "Harbour Grid", re-sited to the Little Venice canals for Fluent City).
**Base shell:** src/practice/shells/Battleship.tsx — call coordinates on a fog-of-war grid; a ship-cell strike opens an MCQ, a correct answer confirms the hit, sink every ship to clear the water.
**Generator:** src/practice/generators/generateBattleship.ts (wraps generateArcade → ArcadePuzzle `{ rounds: ArcadeRound[] }`; 4 rounds = 4 ships, 4 options per round).

## Fantasy (2–3 sentences)
You're a child admiral at dusk in Little Venice, commanding a fleet of clockwork bath-toy boats across a lantern-lit canal basin. Peering through a brass toy periscope, you call coordinates on the misty water grid to hunt the fleet hidden beneath the fog-of-war. Each strike on a hull surfaces a word-question — answer it right and the little boat takes the hit; sink them all and the canal settles to calm amber light, with Bajla the owl cheering from the mooring post.

## Camera & stage
- **Camera:** fixed high three-quarter view over the basin (CityStage `cameraPosition ≈ [0, 6.5, 5.5]`, `fov ≈ 40`) framing the whole 8×8 board laid flat on the water in the XZ plane, so every coordinate stays legible. Gentle idle parallax bob (≤0.05 units, ~0.4 Hz) on high/medium; an optional micro-dolly toward a struck cell on a HIT (high only). No orbit, no user zoom — fixed so the grid reads cleanly. All camera motion frozen on `reducedMotion`.
- **Stage:** a rectangular "bathtub" canal basin of dusk water ringed by low-poly Little Venice — pastel canal-house silhouettes, a small iron footbridge, a couple of moored narrowboats, and a string of paper lanterns overhead pooling warm amber on the water. Palette from kit `palette.ts`: sky `duskTop #1a2348 → duskMid #2d3a6b → duskHorizon #6f3580 → skyGlow #c57195` (CityStage gradient); water in dusk blues with `lanternAmber #ffb347` highlights; `brass #b08d57` coordinate frame + periscope; `gold #d4a24c` lantern rope; `leaf #7fb069` as the correct/HIT accent; `night #0a0418` silhouettes. A thin drifting mist (fog-of-war) sits over un-fired cells. Column letters A–H and row numbers 1–8 are **crisp DOM overlay** along the frame — never 3D-textured.
- **Bajla's role:** perched on the brass periscope housing at intro (idle hover); on a Hint she flutters and "points" toward the revealed ship (flyby), a sonar-ping beat; on a cleared canal she does a celebrate spin-and-hop. Uses kit `Bajla.tsx` (`variant: idle | flyby | celebrate`); `reducedMotion` holds her resting pose.

## Core loop (beat by beat)
1. **Board + question presented** — the 8×8 fog-of-war grid floats on the canal; coordinate labels (A–H, 1–8) and, on a strike, the MCQ card live in the DOM overlay (CityStage `overlay` layer), never in a 3D texture.
2. **Player action** — steer the cursor with arrow keys, or hover+click (desktop) / tap (touch) a grid cell to **fire** at that coordinate.
3. **Correct feedback (≤1.5s)** — empty water = instant MISS splash ripple (~0.6s, no score impact). A ship cell opens the MCQ ("FIRING ON C5" + prompt + 4 options); a correct pick = **HIT**: the hull section surfaces and flashes amber/leaf, the fleet tally ticks +1 (~0.9s), the cell stays lit.
4. **Wrong feedback** — a wrong MCQ pick = splash; that cell **locks** as a miss and the correct answer surfaces in the DOM review (forgiving + instructive); you must strike the ship's other hull cells. (Mirrors `Battleship.tsx` `pick()`: wrong marks the cell fired-miss and records the wrong attempt with `explanationPL = hint_pl`.)
5. **Progression** — 4 ships (rounds), 3 hull cells each (12 of 64 cells); all 3 cells of a ship share that round's question. A ship sinks when all 3 hull cells are confirmed. When every ship is sunk → `onSessionComplete({ correctCount: shipsSunk, totalQuestions: rounds.length /* 4 */, durationMs, shellKey: 'battleship' })`. With no `puzzle`/`vocab` prop, the built-in `DEMO_PUZZLE` (pier / freighter / breakwater / horn) plays for anonymous home play.

## Shots (4–6 keyframes)
| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk Little Venice basin, strung paper lanterns, Bajla perched on the periscope; brass-framed 8×8 grid on misty water; DOM title "Bathtub Fleet" + eyebrow "Find the fleet · Little Venice Canals" |
| 2 | Question up | Cursor/hover lands on a cell; a ship-cell strike raises the DOM MCQ card anchored over the board — eyebrow "FIRING ON C5", prompt, 4 options (all crisp DOM text) |
| 3 | Action moment | A clockwork toy-boat charge is lobbed at the cell; the periscope swivels; a concentric water ripple spreads out from the coordinate |
| 4 | Correct burst (HIT) | Hull section surfaces and flashes amber/leaf, a foam ring blooms, the fleet tally ticks +1; completing a ship keels the whole toy boat over with a little splash |
| 5 | Miss / wrong | Blue splash ripple; the cell darkens and locks; the correct answer surfaces in the DOM review; Bajla gives a soft "try the next cell" nudge |
| 6 | Session end | The canal clears: lanterns brighten, Bajla does a celebrate spin; DOM score card "The canal clears." with sunk N / total + Replay / Next district CTA |

## Input map
**Desktop:** mouse hover highlights a cell (raycast); left-click fires. Arrow keys move the grid cursor (magenta ring `#E879F9`, mirroring the 2D shell); Space/Enter fires at the cursor. MCQ overlay: click an option or press 1–4 / A–D, Enter to confirm, Esc to skip/close. Hint = `H`, Skip = `S`.
**Touch:** tap a cell to fire; tap an MCQ option; on-screen Hint and Skip buttons (≥44px targets). Fixed camera — no pinch/pan needed.
**Keyboard-only path:** the overlay is focusable (`tabIndex 0`); arrows + Space/Enter fully drive firing with no pointer; Tab cycles MCQ options + Hint/Skip; the completion card reuses the focus-trap pattern from `Battleship.tsx`. The canvas is `aria-hidden`; "Hit." / "Miss." / "The canal clears. All ships sunk." are announced via an `aria-live="polite"` DOM region.

## Quality tiers
**high:** drifting fog-of-war mist, water caustics + ripple-ring particles on splash, an ember burst on HIT, one cheap directional shadow (Bajla + boats), lantern emissive glow, idle camera bob. DPR ≤ 1.5 (`resolveQuality` high).
**medium:** no shadows, particle density ~0.5, simpler water (gradient + slow UV scroll), no glow, keep the mist + camera bob. DPR ≤ 1.25.
**low:** flat-lit, DPR 1, no particles, static vertex-colored water, no mist drift, no camera bob — still a charming lantern-lit toy basin, with all gameplay intact.
**reducedMotion:** stop water animation, lantern sway, camera bob, fog drift and Bajla's continuous motion (resting pose). Splash / HIT / sink become a single discrete state change (instant tile recolor + a static marker) instead of animated bursts; Bajla flyby/celebrate collapse to a discrete pose. All feedback stays mirrored in the DOM text region. (`useGameLoop` `reducedMotion` caps catch-up to one step.)

## Asset list (everything, with budget)
| Asset | Source (procedural/GLB/atlas) | Est size |
|-------|-------------------------------|----------|
| Dusk sky | CityStage CSS gradient (kit palette) | 0 (kit) |
| Canal water plane + ripple | Procedural plane + 1 gradient atlas 256² PNG | ~24 KB |
| Fog / caustics scroll | 1 grayscale atlas 256² PNG (high/medium only) | ~18 KB |
| 8×8 grid tiles | Procedural InstancedMesh, per-instance color (fog/hit/miss/cursor) | 0 |
| Brass frame + toy periscope | Procedural boxes/cylinders, vertex color | 0 |
| Toy answer-boats (4 × 3 hull segments) | Procedural InstancedMesh, vertex color | 0 |
| Little Venice backdrop (houses, footbridge, moored boats) | Procedural merged low-poly, vertex color | 0 |
| Paper lanterns (strung overhead) | Procedural instanced emissive (kit palette) | 0 |
| Bajla owl (idle/flyby/celebrate) | kit `Bajla.tsx` (procedural) | 0 (kit) |
| Splash / foam / ember particles | Procedural instanced + 1 sprite atlas 128² PNG (high/medium) | ~10 KB |
| SFX one-shots: sonar ping, splash, hull-thunk, sink, win chime | 5 short same-origin `.ogg` in `public/games/battleship/` (optional) | ~260 KB (cuttable) |
| Ambient canal loop | 1 short looping `.ogg` (optional) | ~180 KB (cuttable) |

Total committed assets ≈ **0.49 MB** with audio (≈ **0.05 MB** without) — well under the 2.0 MB cap. Code chunk `game3d-BathtubFleet.js` ≤ 250 KB gz (procedural geometry + selective `three` / `@react-three/fiber` imports; `drei` avoided — readable English uses the CityStage DOM overlay, not drei `<Html>`, so nothing is added to `vendor-three`).

## Risks
1. **Water/fog realtime effects** (caustics, drifting mist, ripple particles) are the top perf/size risk. Fallback: vertex-colored static water + CSS-gradient sky, particles gated by `quality.particles` (0 on low), mist as one cheap scrolling alpha plane dropped on low/`reducedMotion` — no heavy custom shaders are needed to hold the 30fps floor.
2. **Draw-call blow-out** from 64 tiles + 12 hull segments + lanterns. Mitigation: one InstancedMesh for the 64 grid tiles (per-instance color carries fog/hit/miss/cursor state) and one for hull segments; merge the backdrop geometry — keeps draw calls well under 150 on a single canvas.
3. **Chunk size:** import `three`/`@react-three/fiber` selectively and avoid drei barrel grabs; ship zero GLBs (all geometry procedural) so `game3d-BathtubFleet.js` stays inside 250 KB gz and `vendor-three` is untouched.
4. **Readability (contract rule 9):** the MCQ, coordinate labels (A–H / 1–8), tally and CTAs MUST render in the CityStage DOM overlay — never baked into the water or any 3D texture. Baking text into a texture is an automatic gate fail.
5. **Spec-vs-implementation drift:** `Battleship.tsx`'s in-shell instruction copy says 10×10 / A1–J10, "Hint eliminates one wrong option", and "Skip counts as a wrong MCQ" — but the implemented mechanic is **8×8 (A–H / 1–8)**, Hint **reveals a not-yet-sunk ship's cells** (~3.2s sonar ping), and Skip just **closes the MCQ** with no score effect. The build agent must mirror the **implementation** (the code), not the copy, and keep `correctCount = ships sunk` (the `sunkRounds` count), not the raw MCQ-correct count.
