# Camden Pop-Up Pigeons — whackamole

**District:** Camden Market (Camden Lock, dusk — timber stalls, canvas awnings, paper-lantern strings over the canal)
**Base shell:** src/practice/shells/WhackAMole.tsx — timed visual-search: tap the figure holding the word that fits the gap-sentence before it ducks back down; wrong taps cost a point and it dives.
**Generator:** src/practice/generators/generateWhackAMole.ts (consumes the same `ArcadePuzzle` = `{ rounds: [{ prompt, options[], answerIndex, hint, hint_pl }] }`; prompt masked via `maskAnswerInPrompt`). Pedagogy unchanged — only the stagecraft is re-skinned (subway moles → Camden pigeons).

## Fantasy (2–3 sentences)
You're loose in Camden Market at dusk, and the lanterns have just come on. Cheeky London pigeons keep popping out of the stall crates, each one clutching a little word-sign in its beak — and exactly one is holding the word that completes the sign over the market. Bop the pigeon with the right word before it ducks back into the crate; shoo the wrong ones and they flap off in a huff.

## Camera & stage
- **Camera:** Fixed three-quarter (near-isometric) framing looking down the stall row at a 3×2 grid of crates; FOV ≈ 38°. No gameplay camera moves (keeps targets stable + readable + cheap). High tier only: a gentle idle parallax sway and a one-time slow dolly-in on the intro flyby; both disabled under reducedMotion.
- **Stage:** Camden Lock at dusk. Six timber market crates under striped canvas awnings sit on a cobbled lane; strings of paper lanterns swag overhead, the canal and a Camden chimney/lock-bridge silhouette sit behind, fading into a vertical dusk-sky gradient. Palette (from kit `palette.ts`): dusk **#1a2348** → **#2d3a6b**, lantern amber **#ffb347**, brass/timber **#b08d57**, leaf-green (correct) **#7fb069**, with a violet **#6f3580** horizon band. Light rig: warm hemisphere ambient + one cheap directional "lantern key" (a single soft shadow on `high` only); vertex-baked AO in the crate openings so depth reads without realtime shadows.
- **Bajla's role:** Intro flyby — she swoops in and perches on the market sign while the prompt loads. Hint-giver — she flutters toward the crate hiding the correct pigeon. Wrong-answer flinch — she startles (mirrors the 2D `bajlaShake`). Session end — `celebrate`/cheer over the score card.

## Core loop (beat by beat)
1. **Question presented.** The gap-fill sentence shows on a crisp DOM/`<Html>` chalkboard sign across the top of the stage (masked with `maskAnswerInPrompt`, RND NN badge) — never baked into a 3D texture. A **START · ROZPOCZNIJ** overlay holds the first round (mirrors the `started` gate) so the prompt is read before any pigeon rises.
2. **Player action.** Pigeons rise from the crates on a staggered timer (first pop after ~250 ms, ~380 ms apart), each carrying a DOM word-placard. Tap/click — or keyboard-select — the pigeon whose word fits the gap. Only a pigeon that is `rising`/`up` is hittable.
3. **Correct feedback (≤1.5 s).** Leaf-green burst (#7fb069), the pigeon tips its head and coos, +1 to the tally; a short feather/petal flourish. Round advances after **1200 ms** (mirrors 2D).
4. **Wrong feedback (forgiving).** Rose/amber fluster — the wrong pigeon squawks and drops back into its crate, miss counter +1, Bajla flinches; the correct pigeon keeps popping. The bopped crate re-pops after **600 ms** (mirrors the 2D slot-reset). A wrong tap never ends the round, and the correct answer is shown on the post-session review.
5. **Progression.** `puzzle.rounds.length` rounds (built-in demo = 5), tracked on a "service board" list with a NOW marker. On completion → `onSessionComplete({ correctCount, totalQuestions, durationMs, shellKey: 'whackamole' })` (the 3D `SessionResult` shape from types.ts; same correct/total scoring the 2D shell counts). Bajla celebrates; replay / next-district CTA.

*Timing parity (mirror exactly):* pigeon stays up `POP_DURATION` 2400 ms; rise 280 ms, fall 260 ms, bop 360 ms, idle bob 1.6 s; recycling re-pops a `down` crate into a free hole every `RESPAWN_INTERVAL` 1800 ms until the round resolves; `ROUND_TIMEOUT` 45000 ms fail-safe; 6 crates; 3 hints/session.

## Shots (4–6 keyframes)
| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Camden stall row at dusk, lanterns lit, canal silhouette; six empty crates in a 3×2 grid; Bajla flyby; START overlay with the prompt + one-line how-to (EN/PL). |
| 2 | Question up | Chalkboard sign shows the masked gap-fill (RND 01); first pigeons rising from crates, word-placards readable as crisp DOM text. |
| 3 | Action moment | Several pigeons up across the grid; keyboard reticle / hover on one crate; service board shows NOW; ✓/✗ tally chip top-right. |
| 4 | Correct burst | Chosen pigeon tips its head, leaf-green feather burst, +1 tally, tick flash. |
| 5 | Wrong fluster | Wrong pigeon squawks and dives, rose flash, miss +1, Bajla flinches; correct pigeon still bobbing. |
| 6 | Session end | Score card (correct/total) + Bajla cheering, lantern confetti, Replay / Next district → CTA. |

## Input map
- **Desktop:** Mouse — click/tap a risen pigeon to bop it. `H` = hint, `S` = skip, `Enter`/`Space` = START and confirm.
- **Keyboard-only (fully playable):** Number keys **1–6** map to the 3×2 crates; Arrow keys move a focus reticle between crates; `Enter`/`Space` bops the focused crate's pigeon if it's up. Focus auto-snaps to a risen pigeon when one exists. State announced via an `aria-live` text region (canvas is `aria-hidden`), reusing the 2D shells' announcement phrasing ("Correct.", "Wrong — the right one is still up.").
- **Touch:** Tap the pigeon directly; hit targets ≥ 64 px (mirrors the 2D `min 64px` mobile rule). Skip/Hint are on-screen buttons; on narrow screens the service-board side panel collapses to a compact top strip (mirrors `.em-wam-side` hiding < 768 px).

## Quality tiers
- **high:** one directional lantern-key shadow; pooled feather-burst particles (≤24) on correct; lantern flicker (light intensity); Bajla idle bob + flyby; subtle camera parallax; instanced lantern string; DPR ≤ 1.5.
- **medium:** realtime shadow → baked contact-shadow blob; fewer particles; lantern flicker via vertex-color pulse (no extra light); no parallax; DPR ≤ 1.25.
- **low:** flat vertex-lit, no shadows, no particles (correct = scale-pop + color flash), static lanterns, DPR 1 — still charming on warm palette + silhouettes. Holds 30 fps floor.
- **reducedMotion:** no rise/fall/bob tweens — pigeons **appear/disappear in discrete steps** on the same 2400 ms cadence (essential "pop" preserved as a state change, not motion); no flyby, parallax, flicker, or particles; Bajla static; feedback is colour/opacity only.

## Asset list (everything, with budget)
| Asset | Source (procedural/GLB/atlas) | Est size (gz) |
|-------|-------------------------------|---------------|
| Crates + awnings + stall row | Procedural box/extrude geometry, vertex colours | 0 (in code chunk) |
| Pigeon (body/head/beak + placard plane) | Procedural low-poly, pooled ×6 / InstancedMesh | 0 (in code chunk) |
| Lantern strings | Procedural, instanced | 0 (in code chunk) |
| Ground (cobbles) + canal/skyline silhouette | Procedural plane + vertex-coloured dome | 0 (in code chunk) |
| Cobble / AO gradient atlas | Single small PNG 256×256 | ~12 KB |
| Shared dusk gradient/spark atlas | PNG 256×256 | ~16 KB |
| SFX (optional) — coo / bop / chime | 3 short mono OGG, same-origin under `public/games/whackamole/` | ≤ 120 KB (or omit; reuse existing `AmbientAudioPlayer`) |
| Word placards + prompt sign | DOM / drei `<Html>` (no texture) | 0 |
| Bajla owl | Shared kit `Bajla` (not counted per-game) | 0 |
**Totals:** static assets ≈ **≤ 0.15 MB** (well under 2.0 MB); code chunk target **≤ 250 KB gz** via procedural geometry + reuse of the shared GameKit (CityStage, useGameLoop, Bajla, palette). No GLB, no external URLs — all assets same-origin under `public/games/whackamole/`.

## Risks
1. **Per-frame allocation in the spawn/recycle loop.** The 2D shell drives pops with many `setTimeout`s + array `.map`s; ported naïvely to rAF that allocates each frame. *Mitigation:* run timing on the kit `useGameLoop` (fixed-step), keep a pre-allocated pool of 6 pigeon instances (InstancedMesh, reused matrices), and pre-allocate scratch vectors — zero per-frame allocations.
2. **Crisp-text overlay cost.** Six word-placards + the prompt as separate drei `<Html>` portals can thrash DOM/layout and inflate draw work on `low`. *Mitigation:* render placards as **one** DOM overlay layer positioned from projected crate coords (single React tree, not 6 portals); the prompt is a plain DOM sign. Text stays crisp DOM, never a baked texture; on `low`, reduce decorative flicker, never text legibility.
3. **Shadow/particle budget on mid-range (Iris Xe / GTX-1050).** *Mitigation:* cap to one directional shadow on `high` only, none below; pool + cap feather particles (≤24) and drop to a scale-pop flash under `medium`/`low`; keep draw calls < 150 via instancing of crates, lanterns, and pigeons.
