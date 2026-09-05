# Wave 1 — render lane (branch `play/render`, worktree `/root/em-wt-render`)

Owner brief: "graphics extremely professional and luscious like Abeto". This lane owns the light,
the sky, the shared toon shader, the post stack, shadows, the quality controller and the camera.
Everything below was verified headless (SwiftShader, Playwright) against `http://127.0.0.1:4181/play/`
with `window.__EM.step(n)` as the frame pump; every screenshot referenced lives in
`/tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/`.

## What the player now sees

- **Golden hour by default.** A warm key sun (0xffdcb8 @ 2.05, 43° elevation) with a cool sky fill
  (hemi 0xb9ceff / warm ground 0x9a6a52 @ 0.5). Walls have a lit side and a violet-tinted shadow
  side; the district palettes finally read: Queen's Mile cream renders (184,151,117), Dublin
  terracotta (165,122,89), Newfoundland red/yellow (124,73,71) — against the old universal mint
  (39,96,87 / 50,134,118 / 47,139,140).
- **Sky on every tier.** The dome is pinned to the far plane (`gl_Position.z = w`) and re-centred on
  the camera each frame: potato/low sky is blue, not black; no black polygon at the end of the Isles
  line. Sun disc + halo from the same vector the shadows use; stars at night; soft layered billboard
  clouds (1 draw call, parallax drift); additive motes.
- **Shadows that land.** `shadowMap.enabled` from the first compile, PCF (r182's 5-tap Vogel disc)
  with a per-tier radius, normalBias 0.045, light-space texel snapping, frustum size following sun
  elevation, and two cascades on high/ultra (near 0–22 m at 2048, far 22–~130 m at 2048). The far
  cascade skips skinned and small casters (they only ever read up close), which is how it costs
  ~4 draw calls instead of ~120.
- **Toon v2** (one shared `onBeforeCompile`, one program family): RGB gradient ramp with a violet
  dark step, sky-coloured Fresnel rim replacing the cyan rim light, projected scrolling cloud
  shadows on every lit surface, height fog (streets haze, towers stay crisp), shared emissive gain.
  Metallic materials now reflect a PMREM of the sky (`scene.environment`), so chrome is chrome.
- **Composite v2.** FXAA resolves the linear scene first, then bloom, ACES, grade (tints from
  daylight), depth-texture ink outline (2 px near → 1 px far, darkened local colour), vignette,
  soft triangular grain, sRGB. Overlays (dialog, map, journal…) ease in a depth-blended blur +
  desaturation over 0.3 s. Low tier gets a 4× MSAA scene target instead of nothing. The CSS
  `#grade` vignette is hidden while post is on (`body.postfx`).
- **Night still exists** (N key or the 🌙 button next to the graphics picker, and the site theme
  `em.v3.mode === 'night'`): moonlight, neon at 2.15× gain, wet streets, lit windows, stars, all
  crossfading over 4 s. Golden drifts toward dusk after ~14 min of play.
- **Camera.** Pitch to −0.75 rad (you can look up at the skyline) with the arm shortening as the
  camera drops; idle tilt after 3 s; people and poles no longer pull the spring arm in; a
  conversation two-shot while a dialog is open (both faces in the upper half, dialog below);
  metro arrival is a 1.8 s dolly from a wide shot (station sign + platform) into the follow cam,
  landing inside the district ring facing the street with ❗ locals in frame; ride radius 24 m;
  hub spawn beside PRON-3000 facing Conductor Clara with a clear 8.5 m walk to her.
- **Quality controller v2.** Tier decided before the renderer exists (probe context for the GPU
  string; antialias flag follows the tier), phone overrides (medium: 512 shadows, FXAA only, PR cap
  1.25, crowd 90), and a headroom controller: JS busy fraction + rAF interval against the measured
  display interval (snapped to a real refresh rate). Climbs after 10 s under 55% pressure at full
  render scale, drops after 3 s over 90% at minimum scale. Render scale lives in `quality.js`.

## Findings closed (evidence: before → after)

| ID | Before | After |
|---|---|---|
| graphics-01 sky clipped | `g-potato-03-hub-horizon.png` sky (0,0,0); `g-high-19-endofline-lookback.png` black hexagon | `rq-potato-04-lookup-sky.png` sky (22,37,144); `rp3-20-endofline-lookback.png` sky (156,196,228) |
| graphics-02 / walkthrough-03 arrival wall | `g-high-09-district-0-arrival.png` | `rp3-10-arrive-queens-mile-wide.png` (sign + platform), `rp3-11-arrive-queens-mile.png` (2 of 3 locals in frame, projection-verified in `rp3-results.json`) |
| graphics-03 cyan rig, mint palettes | walls 39,96,87 / 50,134,118 / 47,139,140 | 184,151,117 / 165,122,89 / 124,73,71 (`rp3-12-shopfront-*.png`, `rp3-results.json` samples) |
| graphics-04 metallic charcoal | `sceneEnvironment:false` | `env:true` in every metrics row; tram chrome in `rp3-10-arrive-*-wide.png` |
| graphics-05 FXAA dilutes post | mix(col, aa, 0.85) after grade | FXAA first on linear scene (postfx.js), bloom/grade/vignette at full strength on every post tier |
| graphics-06 blob shadows | glowing disc, 3 cm under roads | one shared material, `SRGBColorSpace`, y 0.06, hidden whenever `s.shadows > 0` |
| graphics-08 emissive hierarchy | only neonMat boosted | `EM.uEmissiveGain` shared uniform; `withEmissiveGain(material)` API for screens/tickers/headlights/panes; toon `totalEmissiveRadiance` follows it |
| graphics-09 fog ≠ horizon | navy fog vs pink horizon | fog colour sampled from the dome (`skyColorAt`), height fog in the toon hook |
| graphics-10 acne / stair steps | bias −0.0004, normalBias 0.02, 76 m single box | normalBias 0.045, PCF radius 2.0/2.2, 2 cascades, light-space snapping (`rp3-11-arrive-queens-mile.png`, kerb + hero shadow) |
| graphics-12 pitch clamp | −0.15 | −0.75 with arm shortening (`rq2b-04-lookup-sky.png`, pitch −0.7) |
| graphics-13 no AA on low | `samples: 0` | `rtSamples: 4` on low; `rq-low-06-district-0.png` |
| graphics-14 sheared windows | world-space grid | object-space grid in `addDuskWindows` (`rp3-32-district-night-street.png`) |
| graphics-17 double vignette | CSS + composite | `body.postfx #grade { display:none }` |
| graphics-18 canvas colorSpace | blob '' | blob + mote + cloud canvases SRGB; crowd blob patched at runtime in main.js (markers: game lane) |
| graphics-20 clouds / motes | grey icosahedra, sub-pixel points | billboard clouds + soft additive motes (`rp3-03-hub-lookup.png`) |
| graphics-22 grain | 0.032 white hash | 0.008–0.015 triangular, per tier |
| graphics-24 snapping | world XZ | light space (`Daylight._place`) |
| graphics-26 sun mismatch | 10° vs 27° | one `sunDir` for lights, disc, clouds |
| walkthrough-02 conversation camera | camDist 1.08, NPC off-screen | `rq-mob-03-dialog-twoshot.png`, `rq2b-03-dialog-twoshot.png`; NPC head on screen, camDist ~3.5 |
| walkthrough-04 spawn into slab | 1.9 m then stuck | spawn (4.5, −6); W held 3 s of sim → 8.9 m walked, ends 1.84 m from Clara (`rq-mob` log) |
| walkthrough-05 ride radius | 12 m, arrival at 11.96 m | `RIDE_RADIUS = 24`, arrival at 9.5 m |
| runtime-quality-never-climbs / 30 Hz | frame-ms thresholds | pressure = max(busy fraction, slowness vs display interval); display interval measured (33.3 ms detected under headless 30 Hz rAF) |
| runtime-mobile-medium / two heuristics | MSAA+FXAA+1024 shadows on phones; lowPowerHint vs tier | `MOBILE` overrides; `lowPowerHint`/`compactTouch` derived from the tier; World/Traffic/Citizens counts in `quality.s` |

## Budget (renderer.info with autoReset=false, one full frame incl. shadow passes and post)

| Scene (1440x900 unless noted) | Baseline (review) | Now | Δ |
|---|---|---|---|
| high hub | 454 calls / 1.48 M tris | 439 / 1.43 M (2 cascades, env, outline; `final-high-results.json`) | −3% / −3% |
| high hub night | — | 439 / 1.54 M | |
| high district (Queen's Mile arrival) | 288 / 1.15 M | 344 / 1.18 M | +19% calls / +3% tris — see note |
| high district (Dublin / Newfoundland arrival) | — | 241 / 1.04 M, 203 / 1.00 M | |
| ultra hub (1280x720) | 531 / 1.66 M | 486 / 1.61 M (`rp-ultra-results.json`) | −8% / −3% |
| potato hub | 285 / 0.73 M | 234 / 0.59 M (`final-potato-results.json`) | −18% / −20% |
| potato district (Queen's Mile) | 177 / 0.54 M | 139 / 0.45 M | −21% / −16% |
| low hub (MSAA 4x RT, 1280x720) | 306 / 0.73 M | 159–208 / 0.50–0.52 M (`rq-low-results.json`) | |
| phone medium (393x852, 512 shadows, PR 1.25) | — | 235 / 1.03 M hub, 211 / 0.82 M district (`rq-mobmed-results.json`) | |

Note on the district row: the review's 288 was measured at the old arrival spot (5.7 m gap, camera
into a wall); the new spot looks down the district street with three locals and the crowd in view,
so more of the district is on screen. Dublin and Newfoundland at the same spot sit well under the
old number. Programs stayed at 99–105 (baseline 100–103).

## Not done / known gaps (volunteered)

- The far cascade's caster filter works by wrapping `castShadow` with an accessor on small/skinned
  meshes (three consults the main camera's layers in the shadow pass, so layers cannot do it).
  It is contained in `Daylight._sweepFarCasters` and re-scans every 90 sim ticks for streamed meshes.
- The renderer's `antialias` flag is fixed at creation from the detected tier; a desktop that drops
  to potato at runtime keeps post off and has no AA (rare; low still has MSAA in its RT).
- Ground/paving colours in `terrain.js` and the district ground in `zones.js` are still the old
  navy night values (city lane); only `PALETTE` (materials.js) was retuned. Shopfront windows are
  still flat cyan panes (city lane's facade kit).
- The station sign is behind the player at the final arrival frame; it is in the opening wide shot.
- `Conductor Clara — Tutor Conductor` role string is the city lane's rename.
- `crowd.js` markers still use Georgia; the game lane owns markers.js.
- NPC head look-at during conversation is wave 2.
- Drift golden → dusk after 14 min is implemented but not screenshot-verified (would need 14 min of sim).
