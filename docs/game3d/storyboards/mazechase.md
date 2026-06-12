# Museum After Dark — mazechase

**District:** Museum After Dark — a lantern-lit London museum the night after closing (3D re-skin of "The Backstreets").
**Base shell:** `src/practice/shells/MazeChase.tsx` — steer a lantern one maze cell at a time; reach the one CYAN answer-token, dodge the ROSE distractor-tokens (a wrong bump dims the lantern, the round continues).
**Generator:** `src/practice/generators/generateMazeChase.ts` — `generateMazeChasePuzzle(vocab, opts)` (wraps `generateArcade`; caps at 5 rounds × 4 options).

## Fantasy (2–3 sentences)
The great hall has shut for the night and the exhibits have begun to stir. You carry the last warden's lantern through the gallery maze, hunting the one true word-artifact each round while ghost-curators drift the aisles and marble statues watch from their plinths. Bajla the purple owl rides the rafters as your guide — light the right exhibits and find the way out before the museum's shadows close the case.

## Camera & stage
- **Camera:** Fixed 3/4 isometric (≈35° tilt, low-FOV ~32° / near-orthographic) framing the **entire 13×11 gallery floor in one shot** — no scrolling, the whole maze is always visible (path-planning legibility is the pedagogy, same as the 2D top-down board). One gentle intro push-in settles to the play angle; no per-frame camera moves during play (micro-parallax only on `high`). Single canvas, DPR ≤ 1.5.
- **Stage:** Low-poly museum great hall after closing. The maze grid becomes a **marble corridor floor** walled by **brass-railed vitrines and partition walls** (the `1` cells); **word-artifacts sit on small glass plinths** in open cells (the tokens). **Paper lanterns** strung overhead pool warm amber light (baked/vertex, never realtime); cool dusk-blue moonlight falls from tall arched windows with the **London skyline + Big Ben silhouette** beyond (brand kit). Palette (5): `night #0a0418` floor-shadow/silhouette · `duskTop #1a2348`→`duskMid #2d3a6b` moonlight/ambient · `lanternAmber #ffb347` key warm light · `brass #b08d57` vitrine frames. Token affordance colours are carried **verbatim from the 2D shell** — `#7DD3FC` CYAN = correct, `#FB7185` ROSE = wrong (each paired with a ✓/✗ glyph for colour-blind safety) — plus `bajlaPurple #8b5fbf` for the owl. Light rig: one hemispheric ambient (cool top / warm amber bottom) + a few cheap baked lantern glows; at most one soft directional shadow on `high`.
- **Bajla's role:** Intro flyby — swoops the entrance arch and perches on a marble bust to "open" the museum. Hint-giver — on Hint (3/session) she flutters over to circle the correct plinth (~1s cyan pulse) then returns to perch. Celebration — takes wing over the hall in a `cheer` for the end score card.

## Core loop (beat by beat)
1. **Question up:** the round's definition/gap sentence appears in a crisp **DOM/HTML overlay prompt bar** at the top (English never baked into 3D), gap-masked via `maskAnswerInPrompt`; a "RND 01/05" counter sits beside it. Four artifact-plinths reveal across the gallery (one CYAN, three ROSE), each labelled with its option word on a **DOM nameplate callout** (smart-positioned HTML overlay, never a 3D texture).
2. **Player action:** steer the lantern-bearer **one maze cell per input** — Arrow keys / WASD (desktop), on-screen DPad or swipe (touch). Movement is grid-locked, walls block, and backtracking is always allowed (you can never get stuck) — identical to the 2D shell.
3. **Correct (≤1.5s):** reaching the CYAN artifact lifts and illuminates the exhibit under its glass — a cyan-green burst + soft chime, tally **+1**, the word card shines; after ~1.1s the next round queues with a fresh token layout. Announced: "Correct token collected."
4. **Wrong (forgiving, instructive):** bumping a ROSE artifact gives a rose flash, the lantern **dims one notch**, the miss counter **+1**, and a nearby ghost-curator lunges then recedes (drama only). The token is consumed and **the round continues** — keep hunting CYAN. The correct answer is surfaced via the round hint and again in the end-of-session review. Announced: "Wrong token. The lantern dims."
5. **Progression:** 5 rounds (generator caps `count=5`, `optionsPerRound=4`). When every round is solved or skipped, emit `onSessionComplete(SessionResult { correctCount, totalQuestions: 5, durationMs, shellKey: 'mazechase' })` — the same tally the 2D shell reports. 3 hints/session; **Skip** advances the round and counts it unsolved.

> **Pedagogy lock (binding for the build PR):** the 2D MazeChase has **no catch-you pursuer** — the only failure is bumping a wrong token. The ghost-curators / statues here are **stagecraft**: they patrol fixed loops and react to a wrong bump, but they **never collide-to-penalise, never end a round, and never alter `correctCount`/`totalQuestions`**. Scoring, round resolution, hint count, Skip behaviour, deterministic token placement (open cells Manhattan ≥ 4 from the start cell, seeded by round id) and the fixed 13×11 maze topology (start cell `{r:1,c:1}`) are mirrored exactly. Real pursuer pressure would be new pedagogy → out of scope (it would require a 2D-shell change + Mike/Ricky sign-off first).

## Shots (4–6 keyframes)
| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Camera glides over the moonlit great hall; lanterns flicker on; Bajla swoops the entrance arch and perches; the gallery maze laid out below, Big Ben at dusk through the arched windows. |
| 2 | Question up | DOM prompt bar drops in with the gap sentence + "RND 01/05"; four plinths reveal (1 CYAN / 3 ROSE) with DOM word-nameplates; lantern-bearer waiting at the start cell. |
| 3 | Action moment | Lantern-bearer threads a marble corridor cell-by-cell, light-trail behind it; a ghost-curator drifts across an adjacent aisle; Bajla circling the CYAN plinth on a Hint pulse. |
| 4 | Correct burst | Lantern reaches the CYAN artifact; the exhibit lifts and glows, cyan-green burst + chime, tally ticks to 1/5, the word card shines; brief beat → next round. |
| 5 | Wrong feedback | Lantern bumps a ROSE artifact; rose flash, lantern dims a notch, a "+1 WRONG TURN" pill appears, a curator lunges then recedes; the round continues with the correct answer hinted. |
| 6 | Session end | DOM score card: `correctCount`/5 + per-round review (caught vs lost), Bajla in `cheer` over the hall, confetti; "Try another / Next district →" CTAs. |

## Input map
**Desktop:** Arrow keys ← ↑ → ↓ (and W A S D) move one cell; the mouse drives the DOM Hint / Skip / replay buttons. **Touch:** an on-screen DPad (four buttons, shown ≤ 768px as in the 2D shell) and directional swipe both move one cell; tap the DOM buttons for Hint / Skip. **Keyboard-only path:** fully playable — arrows/WASD to move, Tab to reach Hint / Skip / replay, Enter or Space to activate. The canvas is `aria-hidden`; every state change is announced through an `aria-live="polite"` region using the 2D shell's exact phrasings ("Correct token collected." / "Wrong token. The lantern dims." / "You found the way out."). A pointer is never required.

## Quality tiers
**high:** warm lantern light-pools + additive glow sprites, one soft directional shadow, floating dust motes in the moonlight, translucent drifting ghost-curators, Bajla feather wobble, subtle glow on lanterns/tokens, micro camera parallax. Target 60 fps on Iris Xe / GTX-1050 class.
**medium:** drop dust motes, the directional shadow and the glow bloom; vertex/baked lighting only; fewer lanterns lit; ghost-curators flat-translucent with simpler drift; reduced particle counts.
**low:** flat vertex-lit, DPR clamped to 1, no particles/shadow/glow, ghost-curators static (or omitted), token pulse via a cheap scale only — the whole maze stays readable and fully playable; 30 fps floor.
**reducedMotion:** all ambient drift stops (no patrolling motion, no dust, no idle bob, no light-trail); pursuers freeze as statues; the token pulse becomes a static highlight ring; the lantern snaps cell-to-cell with no tween; correct/wrong feedback becomes a discrete state change (no animated burst) but is still announced and colour+glyph coded.

## Asset list (everything, with budget)
| Asset | Source (procedural/GLB/atlas) | Est size (gz) |
|-------|-------------------------------|---------------|
| Floor tiles, vitrine/partition walls, artifact plinths | procedural geometry, instanced + vertex colours | 0 (code) |
| Lantern-bearer, lantern glow, exhibit "shine" | procedural + reused atlas sprite | 0 (code) |
| Ghost-curator / statue pursuers | procedural low-poly, instanced, vertex alpha | 0 (code) |
| Bajla (idle / flyby / cheer) | shared kit `Bajla` (procedural) — no per-game asset | 0 |
| Dusk sky, moonlight backdrop, Big Ben / skyline silhouette | procedural sky dome + vertex-coloured silhouette | 0 (code) |
| Gradient atlas (lantern glow, marble tint ramp, vignette, dust) | single small same-origin PNG under `public/games/mazechase/` | ~40–80 KB |
| SFX — footstep tick, collect chime, wrong thud, win sting (optional, cuttable) | short mono audio, same-origin | ~80–150 KB |
| Code chunk `game3d-MazeChase.js` (`src/practice/shells3d/MazeChase3D.tsx`, default export; registry `shellKey: 'mazechase'`, title "Museum After Dark") | TSX on shared kit (`CityStage`, `useGameLoop`, `Bajla`, `palette`) | ≤ 250 KB (budget) |

**Total static assets ≈ 0.12–0.23 MB gz** (well under the 2.0 MB ceiling); per-game code chunk ≤ 250 KB gz; the three / fiber / drei stack rides shared `vendor-three` (≤ 350 KB) — selective imports only, no barrel grabs.

## Risks
1. **Overdraw from translucent ghost-curators + lantern glow** could threaten the 60 fps target and tempt realtime shadows / post-bloom (contract-banned). *Fallback:* cap pursuers at 2–3, render them as instanced low-poly with cheap vertex-alpha and fake glow via the additive atlas sprite (no post-processing), and drop them entirely at `low` / `reducedMotion`. They are cosmetic, so cutting them never touches pedagogy or score.
2. **Draw calls > 150** if every wall / plinth / tile is its own mesh. *Fallback:* `InstancedMesh` for floor tiles, walls and plinths and merge static geometry, so the full set renders in a handful of draw calls — single canvas, DPR ≤ 1.5.
3. **Fantasy-vs-pedagogy drift** — the "chase" framing could tempt a real catch-mechanic during the build. *Fallback:* the Pedagogy-lock note above is binding; `SessionResult` and round resolution stay byte-for-byte the 2D shell's, or the gate closes the PR.
