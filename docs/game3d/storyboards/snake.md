# Metro Snake — snake

**District:** The Underground — a dusk London tube platform, neon-and-lantern-lit.
**Base shell:** `src/practice/shells/Snake.tsx` — steer a snake around a 16×12 grid to eat the word-token that fills the gap; the right token grows you (+score), a wrong token shrinks you (+miss).
**Generator:** `src/practice/generators/generateSnake.ts`

> 3D re-skin only. The mechanic, scoring, round count, hint/skip rules and the answer-leak guard are inherited verbatim from the 2D shell — this storyboard changes the *stagecraft*, never the pedagogy.

## Fantasy
You are a toy tube train running a dusk platform deep in the Underground. Word-tokens glow along the track like dropped travel cards; thread the train through the one that completes the sentence to couple a new carriage and pull away longer. Touch the wrong token and a carriage uncouples with a derail wobble — Bajla the owl watches from the roundel sign and lights your target when you call for a hint.

## Camera & stage
- **Camera:** Fixed 3/4 high-angle (near-top-down, ~22° tilt) that frames the whole 16×12 board at once — like the 2D shell, the full grid must always be visible, so **no follow cam**. FOV 45 (CityStage default). Only motion is a tiny idle parallax drift on `high` (off when `reducedMotion`); `cameraPosition` ≈ `[0, 7.5, 4.5]` aimed at board centre.
- **Stage:** A low-poly tube platform at dusk. The play grid is a tiled platform floor with vertex-coloured lane stripes in brass `#b08d57`; a curved tunnel mouth with a glowing roundel sign closes the far end; paper lanterns (amber `#ffb347`) string along the platform edge; tiled walls fade up into the dusk-sky gradient (`palette.duskTop #1a2348 → duskMid #2d3a6b → duskHorizon #6f3580 → skyGlow #c57195`). The train is District-line green (head `#22C55E` → tail `#15803D`, echoing the 2D snake). Warm key + cool fill come from CityStage's default dusk rig.
- **Bajla's role:** Intro **flyby** across the platform on load; perches **idle** on the roundel sign during play and **points/pulses** the correct token when a hint is spent; **celebrate** spin on the end card.

## Core loop (beat by beat)
1. **Question up.** The gapped prompt renders in a crisp DOM panel pinned top-centre (drei `<Html>` / overlay layer — never a 3D texture); the canonical answer-leak guard masks any leaked answer word to `___`. HUD pills top-left mirror the 2D shell exactly: **SCORE · WYNIK / LENGTH · DŁUGOŚĆ / TARGET · CEL** (TARGET shows the word to collect). One word-token per option scatters on the track (positions seeded from the round id, so they stay stable across re-renders); the correct token wears a pulsing amber halo ring.
2. **Steer.** The player turns the train with arrows / WASD / D-pad / swipe; it advances one cell every **180 ms** fixed tick and cannot reverse 180°. Edges **wrap** — the train loops through the tunnel and re-enters the opposite side.
3. **Correct token** → ✓ amber-green burst at the head, **+10 score**, the round is marked solved, the train **grows one carriage**; the next round auto-queues after ~1.1 s.
4. **Wrong token** → ✗ rose flash + a short **derail wobble**, miss counter +1, the train **sheds its last carriage** (minimum length 2); the correct token highlights briefly so the learner sees the answer; clears after ~0.7 s.
5. **Progression.** Demo puzzle = 5 rounds (live play uses the generator's puzzle). When every round is solved, the train pulls into the tunnel, Bajla celebrates, and the game calls `onSessionComplete({ correctCount, totalQuestions, durationMs, shellKey: 'snake' })`.

## Shots (keyframes)
| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk platform, glowing roundel over the tunnel mouth, strung amber lanterns; Bajla flyby; title + "press / tap to start". |
| 2 | Question up | DOM prompt panel top-centre; SCORE / LENGTH / TARGET HUD; four word-tokens on the track, the correct one haloed amber; green train idling mid-platform. |
| 3 | Action moment | Train threading between tokens, carriages trailing with a slither offset; touch D-pad bottom-right; TARGET word visible in the HUD. |
| 4 | Correct burst | Token pops into amber sparks, a new carriage couples on, ✓ flash, score ticks +10; the next prompt slides in. |
| 5 | Wrong / derail | Train nudges the wrong token, rose ✗ + wobble, a carriage uncouples; the correct token pulses amber. |
| 6 | Session end | Score card overlay (correct / total), Bajla celebrate spin, **Replay** / **Next district →** CTAs. |

## Input map
- **Desktop:** `← ↑ → ↓` or `W A S D` steer (turns are queued, a 180° reverse is ignored); `Space` pauses; Skip and Hint are buttons (3 hints/session — a hint pulses the correct token for ~1 s). The mouse is only needed for the Skip / Hint / pause buttons.
- **Touch:** an on-screen 3×3 **D-pad** bottom-right (mirrors the 2D `.em-snake-dpad`), plus optional swipe-to-turn on the canvas; Skip / Hint / pause are ≥44 px tap targets.
- **Keyboard-only:** fully playable — steering on arrows/WASD, `Tab` reaches Skip / Hint / pause, `Space` pauses. The canvas is `aria-hidden`; each outcome is announced through an `aria-live` text line ("Correct — train grew to 6 carriages." / "Wrong token — a carriage uncoupled."), mirroring the 2D `liveStatus`.

## Quality tiers
- **high:** one cheap directional shadow (train + Bajla), amber lantern point-light flicker + soft bloom, instanced drifting embers/leaves (`particles: 1`), light tunnel fog, idle camera drift. Target 60 fps on Iris Xe / GTX-1050 class.
- **medium:** no shadows; emissive-only lanterns; half the embers (`particles: 0.5`); no fog; no camera drift.
- **low:** DPR 1, flat hemisphere + ambient lighting only, no particles / shadow / bloom, static lanterns — still a charming dusk platform. 30 fps floor.
- **reducedMotion:** ambient drift, lantern flicker and Bajla's hover stop (she holds the kit's resting pose); the halo becomes a static ring. The train still moves, but `useGameLoop({ reducedMotion: true })` caps catch-up to a single step so motion reads as discrete grid hops, never fast-forward.

## Asset list (everything, with budget)
| Asset | Source (procedural / GLB / atlas) | Est size (gz) |
|-------|-----------------------------------|---------------|
| Train — locomotive head + carriages | Procedural geometry + vertex colours (instanced carriages) | 0 (code) |
| Word-tokens (roundel discs) + correct-token halo | Procedural, instanced | 0 (code) |
| Platform floor / track grid (16×12) | Procedural plane, vertex-coloured lanes | 0 (code) |
| Tunnel mouth, walls, roundel sign | Procedural geometry + vertex colours | 0 (code) |
| Paper lanterns | Procedural, instanced (single draw) | 0 (code) |
| Bajla the owl | GameKit `Bajla` (procedural — nothing to download) | 0 (code) |
| Dusk sky | CityStage CSS gradient from `palette` | 0 (code) |
| Glow / token-shimmer atlas | One small same-origin gradient PNG under `public/games/snake/` | ≤ 32 KB |
| SFX (eat / grow / derail / celebrate) — optional | Same-origin `public/games/snake/*.ogg`; v1 may ship silent | ≤ 300 KB |
| Fonts | Reuse app CSS vars (`--em-mono`, etc.) — none downloaded | 0 |

**Totals:** static assets ≈ **0.03–0.33 MB** (≤ 2.0 MB ✔). Code is procedural + GameKit, comfortably ≤ 250 KB gz; the only drei import is `<Html>` (specific import, no barrel grab) so `vendor-three` stays ≤ 350 KB.

## Risks
1. **Grid legibility in perspective.** A tilted camera can make far cells ambiguous and let DOM nameplates overlap or occlude tokens. *Mitigation:* keep the tilt shallow (near-top-down), clamp/scatter nameplate offsets from cached tick positions, and lean on the amber halo + the HUD TARGET word; if legibility still suffers, flatten toward an orthographic camera.
2. **`<Html>` nameplate cost.** Several drei `<Html>` overlays reflowing every frame would risk layout cost and per-frame allocation. *Mitigation:* cap to the ~4 option tokens, update nameplate transforms only on the 180 ms tick (not per frame), reuse cached vectors, and fall back to a single projected overlay layer of plain HTML if `<Html>` proves heavy — keeping draw calls < 150 and the loop allocation-free.

**Fidelity note (binding):** the canonical 2D Snake *wraps* at the edges and has **no self-collision / wall-crash fail state** — it's a forgiving practice drill, and the in-code instruction copy that mentions "hit a wall = round ends" is stale relative to the implemented tick. Metro Snake mirrors the *implemented* behaviour: the trailing carriages are visual delight, not a lose condition, so the only scored outcomes remain right-token (grow, +10) and wrong-token (shrink, +miss), exactly as the 2D shell.
