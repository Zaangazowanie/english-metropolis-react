# Thames Balloon Festival — balloonpop

**District:** Thames Balloon Festival — the riverside embankment at dusk during a paper-lantern hot-air-balloon festival, the lantern-lit London skyline (Big Ben, a bridge) across the water.
**Base shell:** src/practice/shells/BalloonPop.tsx — read the gap-fill prompt, pop the rising balloon whose word fits before it drifts off-screen; 4 options, ≤6 rounds, a wrong pop is forgiving (round continues).
**Generator:** src/practice/generators/generateBalloonPop.ts — `generateBalloonPopPuzzle()` wraps `generateArcade`, capped to 6 rounds × 4 options. Pedagogy unchanged; the 3D layer only re-skins the loop.

## Fantasy (2–3 sentences)
You stand on a moored festival barge on the Thames at dusk while the city floats its lantern-balloons up into the amber sky. Each balloon carries one English word; read the prompt strip and pop the balloon whose word fills the gap before it rises past the rooftops, leaving the decoy balloons to drift on. Bajla the purple owl banks in over the river to open the festival and cheers each clean pop.

## Camera & stage
- **Camera:** fixed three-quarter perspective looking across the river at the skyline, locked (no orbit, no follow). FOV ~45°. Balloons travel up a shallow Z-band of 4 lanes so every word reads flat-on. Only move: an optional 0.4s round-start micro-dolly on **high** tier; otherwise static. Single canvas.
- **Stage:** dusk Thames. Foreground — festival barge railing/parapet strung with paper lanterns and planters (brand kit, instanced). Midground — the river as a vertex-colored plane with a few scrolling specular lantern-reflection streaks. Background — low-poly London skyline + Big Ben silhouette as one extruded vertex-colored band against a gradient sky. Palette (kit `palette.ts`): dusk blues `#1a2348`→`#2d3a6b`, lantern amber `#ffb347`, brass `#b08d57`, leaf `#7fb069`, Bajla purple `#8b5fbf`. Light rig: vertex/ambient + one warm hemispheric tint; at most one cheap directional "last-light" shadow on **high** only.
- **Bajla's role:** intro flyby (banks across the skyline trailing a festival banner, settles on the railing as guide), hint-giver (flutters to the correct balloon and haloes it when a hint is spent), celebration (loop + lantern-release on session complete). Under `reducedMotion` she appears as static poses at the same beats — no flight tweens.

## Core loop (beat by beat)
1. **Question presented** — the gap-fill sentence + `RND xx` badge render in a crisp DOM/HTML overlay strip pinned top-center (never baked into a 3D texture). Each of the 4 rising balloons carries its word on an upright, billboarded DOM/`<Html>` chip — also crisp text, never a blurry texture.
2. **Player action** — *aim & pop*: point at the balloon whose word fits and tap/click to pop it (keyboard: Tab to the balloon, Enter/Space to pop). Balloons rise from the railing and wobble gently side-to-side as they ascend (mirrors 2D: rise speed `0.18 + rand*0.08` per ~16.67ms step, wobble amplitude ~6–12, escape above the top of frame).
3. **Correct feedback (≤1.5s)** — the balloon bursts into an amber lantern-spark puff + green flash + soft pop chime; tally +1; the next round queues after **1200ms** (mirrors 2D).
4. **Wrong feedback (forgiving)** — a popped decoy deflates with a hiss and sinks; miss counter +1; the correct balloon briefly haloes green so the learner sees the answer; the cue clears after **800ms** and the round continues (remaining balloons keep rising; if all leave frame, a fresh batch respawns after **600ms**). A wrong pop never ends the round.
5. **Progression** — up to **6 rounds × 4 options** (`generateBalloonPopPuzzle`). A round advances only on a correct pop or **Skip** (Skip counts as wrong and leaves the round unsolved). The session completes — and `onSessionComplete(SessionResult{ correctCount, totalQuestions, durationMs, shellKey: 'balloonpop' })` fires — only when every round is solved. With no `puzzle`/`vocab` prop the game runs the built-in demo puzzle (the 2D `DEMO_PUZZLE`, 6 rounds) for anonymous home play.

## Shots (4–6 keyframes)
| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk Thames: skyline + Big Ben silhouette, lantern-strung barge railing, gradient sky; Bajla banks in on her flyby. DOM title card. |
| 2 | Question up | DOM prompt strip top-center (`RND 01` + gap sentence); four lantern-balloons begin rising from the railing, each with an upright DOM word-chip; balloon-log panel at the side. |
| 3 | Action moment | Balloons mid-ascent over the river, wobbling; aim reticle hovering one; the correct word clearly legible; lantern reflections shimmer on the water. |
| 4 | Correct burst | Chosen balloon erupts in amber sparks + green flash; tally ticks +1; decoys drift on; Bajla bobs approvingly. |
| 5 | Wrong (forgiving) | A decoy deflates and sinks with a hiss; "1 POPPED WRONG" badge; the correct balloon haloes green; round still live. |
| 6 | Session end | DOM score card — "The river settles." — `correctCount/total`, Bajla celebrate loop + lantern release, **Replay** / **Next district →** CTAs. |

## Input map
**Desktop:** move mouse to aim a reticle, left-click to pop the balloon under it; number keys **1–4** pop the balloon in that lane (left→right); **H** = hint, **S** = skip. **Touch:** tap a balloon to pop (targets ≥44px); on-screen **Hint** and **Skip** buttons. **Keyboard-only path:** every balloon is a real focusable target (mirrors the 2D per-balloon `<button>`), so **Tab** cycles balloons and **Enter/Space** pops the focused one — fully playable without aiming. The canvas is `aria-hidden`; interaction state is announced through an `aria-live` region using the 2D shell's text patterns ("Correct balloon popped." / "Wrong balloon. *X* is the answer.").

## Quality tiers
- **high:** instanced balloons with warm amber rim light; river lantern-reflection shimmer; pooled spark/confetti particles on pop; one cheap directional shadow; DPR ≤1.5; Bajla flight tweens; 0.4s round-start micro-dolly.
- **medium:** drop the directional shadow and reflection shimmer to a static gradient; halve particle counts; DPR ≤1.25; keep wobble + Bajla flight.
- **low:** flat vertex-lit, DPR 1, no particles (pop = instant scale-out + flash), no shadow, static skyline, Bajla as a still sprite — still charming; holds the 30fps floor.
- **reducedMotion:** balloons do **not** drift or wobble — they spawn at staggered fixed heights and hold (mirrors 2D: speed 0, no rAF drift, no respawn), so there is no time pressure; pop = a discrete flash with no particles; round changes are cuts, not tweens; Bajla static; ambient drift and confetti suppressed.

## Asset list (everything, with budget)
| Asset | Source (procedural/GLB/atlas) | Est size (gz) |
|-------|-------------------------------|----------------|
| Balloons (body + tie + string) | Procedural lathe/sphere, instanced, vertex colors | 0 KB (code) |
| Lantern glow + spark/confetti sprites | One small gradient atlas (PNG) | ~24 KB |
| London skyline + Big Ben silhouette | Procedural extruded vertex-colored band (or tiny silhouette atlas) | ~0–16 KB |
| Barge railing, paper lanterns, planters | Procedural, instanced (brand kit) | 0 KB (code) |
| River plane + reflection ramp | Procedural plane + tiny gradient ramp texture | ~12 KB |
| Bajla the owl | Shared kit `Bajla` (procedural low-poly, vertex colors) | 0 KB (kit) |
| Sky gradient backdrop | Vertex-colored / 2-stop ramp | ~2 KB |
| SFX: pop chime, deflate hiss | WebAudio-synthesized, or tiny same-origin clips | ~0–60 KB |
| Optional festival ambience loop | Short (~20–30s) low-bitrate mono, same-origin under `public/games/balloonpop/` | ~0–500 KB |
| Word chips / prompt / score card | DOM/HTML overlay (drei `<Html>`) | 0 KB (no texture) |

Total assets ≈ **0.1–0.6 MB gz** (well under the 2.0 MB cap; the optional ambience loop is the only sizable item). Code chunk `game3d-BalloonPop.js` stays well under **250 KB gz** via procedural geometry + kit reuse and selective `three`/drei imports.

## Risks
1. **Per-balloon overlay text vs. draw calls / layout thrash.** drei `<Html>` mounts a DOM node per balloon; fine at 4 balloons but the chips must track wobbling balloons each frame. Fallback: project the 4 balloon positions in a single rAF write to one absolutely-positioned overlay layer (no per-node React churn); the generator already caps options at 4, so labels never exceed 4 and draw calls stay <150.
2. **Audio is the only thing that can approach the asset budget.** No external URLs are allowed, so any ambience must be committed same-origin and counts against 2.0 MB. Fallback: WebAudio-synthesized pop/hiss (0 bytes) and ship the ambience either as a short low-bitrate mono loop or omit it entirely — never stream from a CDN.
