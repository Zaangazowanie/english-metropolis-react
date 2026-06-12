# Pier Carnival Wheel — spinthewheel

**District:** Brighton Pier Carnival — a lacquered prize wheel at the end of a dusk-lit pier.
**Base shell:** `src/practice/shells/SpinTheWheel.tsx` — tap SPIN; the wheel decelerates and the top pointer commits whichever option wedge it lands on.
**Generator:** `src/practice/generators/generateSpinTheWheel.ts` (wraps `generateArcade`; 6 rounds × 4 wedges, `ArcadePuzzle { rounds[] }`).
**Build target:** `src/practice/shells3d/SpinTheWheel3D.tsx` (default export) → register in `registry.ts` as `{ shellKey: 'spinthewheel', title: 'Pier Carnival Wheel', district: 'Brighton Pier Carnival' }`.

## Fantasy (2–3 sentences)
You're the punter at the end of Brighton Pier as the sun sinks into the sea. A great lacquered prize wheel stands under a canopy of festoon lights, and Bajla the purple owl works the booth as carnival barker, calling the crowd. You pull the brass lever, the wheel clatters round, and wherever the pointer settles is your answer — read the word it lands on and find out whether the night's luck favoured you.

## Camera & stage
- **Camera:** fixed 3/4 hero framing on the wheel, ≈`[0, 1.4, 6.6]`, FOV 45 (CityStage default). Gentle dolly-in + idle parallax bob on `high`; static on `low`/`reducedMotion`. No orbit — the wheel always faces the player so the top pointer reads cleanly.
- **Stage:** the end of a low-poly pier at golden-hour dusk. A weathered plank deck recedes toward the hero wheel; brass-railed posts and two booth / helter-skelter silhouettes flank it; festoon string-lights and paper lanterns arc overhead; the sea fills the lower third with a warm glow band on the horizon and the Fluent City skyline (Big Ben silhouette) far across the water. Palette (from `kit/palette.ts`): sky duskTop `#1a2348` → duskMid `#2d3a6b` → duskHorizon `#6f3580` → skyGlow `#c57195`; key light lanternAmber `#ffb347` / lanternCore `#fff1b8`; brass `#b08d57` + gold `#d4a24c` fittings; wedge sectors cycle gold / lanternAmber / leaf `#7fb069` / skyGlow / bajlaPurple `#8b5fbf`; night `#0a0418` silhouettes.
- **Bajla's role:** `flyby` intro sweeping in to "present" the wheel; perched on the booth at `idle` during play; points a wing toward the correct wedge on a Hint and on a wrong landing; `celebrate` spin-hop over the end-of-session card. Procedural (kit `Bajla`) — zero asset cost.

## Core loop (beat by beat)
1. **Question up** — the English prompt renders in a crisp DOM overlay card pinned above the wheel (drei `<Html>` or the CityStage `overlay` layer), with a `ROUND NN` eyebrow; the four options appear as an A / B / C / D DOM legend below the wheel. The answer word is masked in the prompt (`maskAnswerInPrompt`). No English is ever baked into a 3D texture.
2. **Action (one verb: SPIN)** — pull the brass lever (click / tap / Space / Enter). The player does *not* aim the wheel.
3. **Landing + selection** — mirrors the 2D shell exactly: the winning wedge is pre-chosen by the same weighted random (≈66% the correct answer, ≈34% a random wedge), then the disc eases through ~5 turns to seat that wedge under the top pointer while the flapper ratchets across the pegs. Deceleration ≈4.2s on high/medium.
4. **Correct (≤1.5s)** — the landed wedge flashes leaf-green, the marquee bulbs pulse, a short ember-confetti burst fires, a win chime plays, Bajla cheers, and the DOM tally bumps +1; after ≈1.4s the next round auto-loads.
5. **Wrong (forgiving, instructive)** — the landed wedge glows rose, the **correct** wedge highlights green so the learner sees the right answer, a soft buzzer rings, Bajla points to it, and the lever relabels **SPIN AGAIN**. Re-spinning the same round is free. **SKIP** advances and counts as wrong.
6. **Progression** — 6 rounds (generator yields 4–8 wedges; 4 typical). When every round is resolved the wheel rests, Bajla celebrates, and a DOM score card shows `correctCount / totalQuestions` with Replay / Next CTAs; the game calls `onSessionComplete({ correctCount, totalQuestions, durationMs, shellKey: 'spinthewheel' })`. With no `puzzle`/`vocab` prop it runs the built-in 6-round carnival demo (anonymous home play).

## Shots (4–6 keyframes)
| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Pier at dusk, hero wheel under festoon lights, Bajla flyby, sea + skyline silhouette behind. |
| 2 | Question up | DOM prompt card + A/B/C/D legend pinned to the wheel; wheel idle; brass SPIN lever lit. |
| 3 | Action moment | Wheel mid-spin, flapper ticking, bulbs streaking, pointer bobbing; live region reads "Wheel spinning." |
| 4 | Correct burst | Pointer on the green wedge, marquee pulse, ember confetti, Bajla cheer, tally +1. |
| 5 | Wrong reveal | Landed wedge rose, correct wedge green-highlighted, Bajla's wing pointing, lever reads SPIN AGAIN. |
| 6 | Session end | DOM score card (`correctCount`/total) + Bajla celebrate spin-hop + Replay / Next district CTA. |

## Input map
**Desktop:** SPIN = click the lever or Space/Enter; HINT = click pill or `H`; SKIP = click pill or `S`. `Tab` cycles the DOM controls; Enter/Space activate. The mouse never needs to aim the wheel.
**Touch:** tap the SPIN lever (≥48px target); tap the HINT / SKIP pills; tap Replay/Next on the end card. No drag or multi-touch gesture required.
**Keyboard-only path:** every control is a real focusable DOM button in the overlay; the canvas is `aria-hidden`; an `aria-live="polite"` region announces state changes ("Wheel spinning", "Landed on candyfloss — spin again", "Correct", "The wheel rests"), mirroring the 2D shell's status patterns. Fully playable with no pointer.

## Quality tiers
**high:** DPR ≤1.5; one cheap directional shadow under the wheel; lit marquee bulbs + festoon glow (additive sprites); ember-confetti on correct; faint sea shimmer; spin motion-streaks. Target 60fps on Iris Xe / GTX-1050.
**medium:** DPR ≤1.25; no shadow; bulbs lit but no additive bloom; particle density ~0.5; flat sea gradient; no motion-streaks.
**low:** DPR 1; flat vertex-lit, no shadow, no particles, static festoon; scene trimmed to wheel + pointer + deck + sky gradient. The wheel still spins (essential). 30fps floor — still charming.
**reducedMotion:** the long decel is replaced by discrete steps — the disc snaps to the chosen wedge in ~1 frame (mirrors the 2D collapse of the spin/advance/hint delays), bulbs hold static, Bajla holds her resting pose, and confetti becomes a static ✓ / ✗ stamp. Which wedge won and what is correct are always shown as a clear discrete state.

## Asset list (everything, with budget)
| Asset | Source (procedural/GLB/atlas) | Est size (gz) |
|-------|-------------------------------|---------------|
| Wheel disc, wedges, hub, spokes, pointer/flapper | Procedural geometry + vertex colors | 0 KB (code) |
| Marquee bulbs (24) + festoon string-lights | Instanced spheres / lines | 0 KB (code) |
| Pier deck, posts, rails, booth & helter-skelter silhouettes | Procedural low-poly + vertex colors | 0 KB (code) |
| Sea plane + dusk sky | CityStage dusk gradient + vertex-colored plane | 0 KB (code) |
| Bajla (barker) | Kit procedural owl | 0 KB (code) |
| A/B/C/D wedge glyphs | Small same-origin glyph atlas (256², A–H) **or** drei `<Html>` markers | ≤ 16 KB |
| Glow + ember sprite atlas | One 128² radial-glow / spark ramp | ≤ 12 KB |
| SFX: ratchet tick, win chime, buzzer | Procedural WebAudio (preferred → 0 B) **or** tiny same-origin OGG | 0–30 KB |
| Optional seaside ambience loop | Same-origin OGG, ≤8s mono (optional) under `public/games/spinthewheel/` | ≤ 250 KB |

Total ≈ 0.3 MB worst case — must be ≤ **2.0 MB**; code chunk ≤ **250 KB gz**; shared `vendor-three` ≤ **350 KB gz**.

## Risks
1. **Audio is the only real budget threat** (audio bytes don't gzip). Mitigation: synthesize the tick/chime/buzzer with WebAudio (0 bytes); keep any ambience optional, same-origin under `public/games/spinthewheel/`, hard-capped ≤250 KB; never a CDN/remote URL. Fallback: silent play.
2. **Per-frame cost of the 4.2s decel.** Drive the disc from a single eased angle value inside `useGameLoop`/`useFrame`, reuse vectors (no per-frame allocations), instance the 24 bulbs, keep the scene under ~40 draw calls (well below the 150 cap). Fallback: `low` drops bulbs + particles.
3. **Readable-English regression.** Never bake words onto the disc — they would rotate and blur (the exact bug the 2D shell fixed by moving to letter markers + an external legend). Keep wheel markers to single A/B/C/D glyphs; all words live in the DOM prompt + legend, and the pointer reports the landed letter. If drei `<Html>` is used for words, keep it off the spinning node to avoid transform cost.
4. **Pedagogy drift.** The weighted-random landing (≈66/34) and the "re-spin until correct, skip = wrong" scoring are canonical; the 3D layer must not let the player aim the wheel or change the odds. The wheel is stagecraft over the existing selection logic only — same puzzle in, same `SessionResult` out.
