# Paper Plane Post — airplane

**District:** Royal Mail Sky Route — a paper plane glides over the dusk London skyline, threading the cloud-ring that carries the right word.
**Base shell:** src/practice/shells/Airplane.tsx — gap-fill MCQ: pick the word-cloud that fits the gap before it drifts past the plane.
**Generator:** src/practice/generators/generateAirplane.ts (delegates to generateWrapperPuzzle → generateMultipleChoice; default 8 rounds, each a prompt + 4 options + answerIndex + hint/hint_pl).

> **Re-skin note (binding):** this is a *presentation* of the Airplane shell. The graded act is **selecting** one of four word-bearing targets — identical to the 2D "tap the cloud" verb. The plane is on autopilot and **auto-threads the chosen ring**; "steering / collision" is the cosmetic expression of a discrete selection, **not** a skill-based dodge. Scoring, rounds, hints, skip and the wrong-answer review payload mirror Airplane.tsx exactly. Pedagogy is not changed.

## Fantasy (2–3 sentences)
You are a folded paper plane carrying the evening post over a storybook London at dusk — Bajla the purple owl flying point as your guide. Four word-clouds drift in over the rooftops; you read the gap-fill note pinned to the sky and pick the cloud whose word completes it, and the plane banks and threads that ring. Right ring: you punch through in a burst of amber sparks; wrong ring: a puff of vapour and a dip, and the correct ring lights up so you see the word you missed.

## Camera & stage
- **Camera:** fixed 3/4 chase — locked just behind and slightly above the paper plane, looking *forward* over the rooftops at the oncoming rings. No free orbit (perf + a11y). FOV ~50°. Gentle idle sway on high/medium only; a short dolly-in as the plane threads the chosen ring. Rings approach from depth (toward camera) — the 2D right-to-left drift mapped onto the forward axis, so the lateral-parallax feel is preserved as rooftops/lanterns/clouds slide past.
- **Stage:** dusk London, storybook low-poly. A vertex-coloured sky dome runs duskTop `#1a2348` → duskMid `#2d3a6b` → duskHorizon `#6f3580` → skyGlow `#c57195`, with a warm `#ffb347` lantern-amber band on the horizon. Below: instanced low-poly rooftops and chimney pots, an extruded Big Ben / dome silhouette on the skyline (`#0a0418`), paper lanterns and bunting strung between roofs glowing amber, plus instanced twinkling stars and lit windows. Light rig: one warm directional "lantern key" raking from the horizon (amber), low dusk-blue ambient fill; on `high`, a single cheap directional shadow under the plane. Palette: `#1a2348`, `#2d3a6b`, `#ffb347`, `#b08d57`, `#8b5fbf` — ring/selection accent `#7DD3FC` (mirrors the 2D ACCENT), correct-green `#7fb069`/`#34D399`, wrong-pink `#FB7185`.
- **Bajla's role:** *intro* — Bajla flyby leads the plane onto the route (mail-satchel nod); *during play* — she flies just off the wingtip as the guide, and on **Hint** she wheels toward and dims one wrong ring while the textual hint surfaces in the DOM overlay; *celebration* — she loops and cheers on the completion card. Uses the shared GameKit `Bajla` (purple `#8b5fbf`).

## Core loop (beat by beat)
1. **Question presented** — the gap-fill sentence appears in a crisp DOM/HTML overlay strip pinned top-centre (eyebrow `QUESTION · PYTANIE 0N`, then the prompt with its `___` gap). English text is DOM, never a 3D texture.
2. **Player action (verb: select)** — four word-clouds, each ringed and carrying its option word on a DOM nameplate pill, drift in from depth across a shallow fan (slight vertical stagger, echoing the 2D 22–68% spread). The player selects the ring whose word fills the gap: tap/click the ring, or arrow-keys to move a highlight + Enter/Space to commit.
3. **Correct feedback (≤1.5s)** — the plane banks toward the chosen ring and threads it; ring bursts into amber sparks + confetti; green ring flash (`#34D399`); plane noses up (mirrors `em-ap-plane-rise`); live region announces "Correct."; hit tally +1.
4. **Wrong feedback (forgiving, instructive)** — the chosen ring puffs to vapour; brief pink flash (`#FB7185`) + the plane dips (mirrors `em-ap-plane-dive`); **the correct ring flashes green and holds its word a beat** so the learner sees the answer; live region announces "Wrong. The right one was &lt;word&gt;."; records the wrong attempt `{ questionId, studentAnswer, correctAnswer, explanationPL: hint_pl, exerciseId }` for the post-session review; miss tally +1.
5. **Progression** — 1400ms verdict pause → next round (mirrors the 2D timeout). After all rounds (production 8 via the generator; built-in demo 6), fire `onSessionComplete({ correctCount: total − distinct-wrong-questionIds, totalQuestions: total, durationMs, shellKey: 'airplane' })` (the `SessionResult` shape from shells3d/types.ts). Completion card: "Wheels down. Safe landing." with ✓ HIT / ✗ MISS tally, Bajla cheering, and Try-another / Next-district CTAs.

## Shots (4–6 keyframes)
| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk London skyline; paper plane glides in over lantern-lit rooftops; Bajla flyby leading; no prompt yet. |
| 2 | Question up | Top-centre DOM prompt strip with the gap-fill sentence; four ringed word-clouds drifting in from depth across a fan, each with its DOM nameplate; plane low-centre. |
| 3 | Action moment | One ring highlighted (keyboard) or under cursor/finger; plane banking toward it; rooftops + lanterns parallax past. |
| 4 | Correct burst | Plane threads the ring; amber sparks + confetti; green ring flash; plane noses up; ✓ and hit tally tick. |
| 5 | Wrong beat | Chosen ring puffs to vapour; pink flash; plane dips; the correct ring flashes green holding its word; PL hint surfaces in the overlay. |
| 6 | Session end | "Wheels down. Safe landing." card — HIT / MISS tally, Bajla cheering, replay / next-district CTA over a dimmed dusk sky. |

## Input map
**Desktop:** Mouse — hover a ring to preview-highlight, click to commit. Keyboard — ←/→ (↑/↓ also accepted) cycle the highlighted ring, Enter or Space commits; `H` use hint; `S` skip; the host owns Esc / fullscreen.
**Touch:** tap a ring to commit; bottom-anchored on-screen **Skip** + **Hint** buttons, thumb-reachable; rings carry generous invisible hit-padding (≥44px targets).
**Keyboard-only path:** fully playable — a visible focus-highlight ring (mirrors the 2D `focus-visible` soft glow) tracks the arrow keys, Enter commits, every control sits in tab order, nothing needs pointer precision. The canvas is `aria-hidden`; a polite live region announces the prompt and the verdict text verbatim from the 2D shell ("Correct." / "Wrong. The right one was &lt;word&gt;.").

## Quality tiers
**high:** amber directional lantern-key + one cheap directional shadow under the plane; ring-burst spark particles (instanced, ≤ ~60) + confetti; plane contrail ribbon; animated parallax cloud/lantern layers; twinkling stars + lit windows; subtle camera idle-sway. DPR ≤ 1.5.
**medium:** drop the realtime shadow (vertex/baked light only); ~24 particles; static cloud layer; keep contrail + twinkle. DPR ≤ 1.25.
**low:** flat vertex-lit only, DPR 1, no particles, no contrail, no shadow, fewer decorative props, slower ring drift — still charming via the gradient sky, silhouettes and lanterns. Holds the 30fps floor on Iris Xe.
**reducedMotion:** mirrors the 2D `usePrefersReducedMotion` path — no drift: the four rings appear **static**, distributed across the fan inside the safe band; no plane bob/bank/prop-spin, no parallax, no particles; correct/wrong is shown as an instant discrete state change (no dive/rise tween) and the correct-ring reveal is a static green highlight; camera fixed. The selection commit becomes a discrete swap — gameplay fully intact.

## Asset list (everything, with budget)
| Asset | Source (procedural/GLB/atlas) | Est size (gz) |
|-------|-------------------------------|----------|
| Paper plane mesh | procedural folded-paper geometry (flat tris) + vertex colours | 0 (code) |
| Word-rings ×4 | procedural torus, instanced; accent material | 0 (code) |
| Rooftops / chimneys / skyline | instanced low-poly boxes + extruded Big Ben/dome silhouette, vertex colours | 0 (code) |
| Paper lanterns + bunting | instanced spheres/teardrops, emissive amber | 0 (code) |
| Stars / lit windows | instanced points/sprites | 0 (code) |
| Bajla owl guide | shared GameKit `Bajla` (procedural) | 0 (shared kit chunk) |
| Dusk sky dome | vertex-coloured from `palette.duskSkyStops` (no texture) | 0 (code) |
| Spark/confetti sprite | one 64×64 soft-dot PNG atlas (alpha) | ≤ 6 KB |
| SFX (optional) | short same-origin OGG (whoosh / ding / puff) in `public/games/airplane/`, or reuse the existing `AmbientAudioPlayer('airplane')` | ≤ ~250 KB (else 0) |

Total static assets: ~6 KB (no SFX) to ~256 KB (with SFX) — well under the **2.0 MB** cap. Code chunk target **≤ 250 KB gz** (procedural-only; reuse CityStage / useGameLoop / Bajla / palette so the three stack stays in `vendor-three` ≤ 350 KB).

## Risks
1. **Pedagogy drift → reflex game (highest).** The "steer through rings" fantasy tempts a skill-based dodge/physics mechanic, which would change the pedagogy the CONTRACT forbids. Guardrail: the graded act is **selection** (tap / arrow+Enter); the plane auto-banks and threads the chosen ring (collision is a cosmetic commit). Keep `correctCount = total − distinct wrong questionIds`. Fallback if it ever feels like a dodge game: revert to a near-side-on framing that reads exactly like the 2D shell.
2. **DOM/`<Html>` word labels over a 3D scene (legibility + perf).** Perspective scaling, z-fighting, and many `<Html>` nodes can hurt readability and FPS. Guardrail: cap to 4 labels, billboarded fixed-pixel `<Html>` (no distance scaling), drawn above the scene; if `<Html>` is janky, fall back to a thin DOM overlay positioned at each ring's projected screen coords. Text is always crisp DOM, never baked to texture.
3. **Draw calls / GPU on Iris Xe (perf budget).** Buildings + lanterns + stars + particles add up. Guardrail: instance every repeated prop, single canvas, DPR ≤ 1.5, one directional shadow max (high only), reuse one ring geometry, zero per-frame allocations (preallocate vectors/colours). Target < 150 draw calls.
4. **drei barrel imports inflating `vendor-three` (size budget).** Guardrail: import only the specific drei modules used (`Html`, `Instances`/`Instance`); lean on the GameKit for CityStage/Bajla/loop so shared cost lives once in `vendor-three` ≤ 350 KB.
