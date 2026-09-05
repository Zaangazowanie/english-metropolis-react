# English Metropolis /play — full revamp plan (draft v1, 2026-09-04)

Target: englishmetro.com/play (vanilla three.js r182 ES modules, no bundler, `public/play/`).
Owner brief: "graphics extremely professional and luscious like Abeto; gameplay, exercises and
quests making sense with checkpoints, a clear system, rewards and rankings; three.js is the
priority; full revamp of characters, gestures, buildings, everything." Max 3 agents at once.

Verified baseline (headless SwiftShader, TIER=high, 2026-09-04 22:19Z, scratchpad hi-*.png):
- Box city: facades are flat slabs with painted black window rectangles; no trims read at distance.
- No cast shadows visible on the ground at "high" (2048 map) — either the shadow toggle never
  recompiles materials (shadowMap.enabled flipped after first compile) or the sun/bias kills it.
- Palms are flat green triangles; trees are blobs; ground is one flat colour with lane paint.
- Locals stand in one idle pose; hero has idle/walk/run only (no jump clip, no turn/lean/look-at).
- Metro arrival puts the camera against the station-side wall; T at the arrival spot says
  "find a station platform" (arrival point sits at the 12 m ride radius).
- Escape closes only dialog + guide; map/journal/metro overlays stack on top of each other.
- Progress is 100% localStorage (em_xp, em_progress, em_grammar, em_fog); no server, no rank,
  no leaderboard, no session summary, no checkpoints beyond "round complete" per district.
- Drills are generic grammar MCQs bolted onto dialect NPCs (Dublin fishmonger → "Articles B1").

## A. Render + art direction ("Abeto golden hour")   [owner: lane A]
Files: materials.js, postfx.js, main.js (lighting block), NEW daylight.js, quality.js (tier fields),
world.js sky/clouds, crowd.js (outline + rim), rig/hero (outline hulls).
1. `daylight.js`: time-of-day controller with presets {golden (default), day, dusk, night}; drives
   sun dir/colour/intensity, hemi sky/ground, fog colour/density, sky dome uniforms (top/mid/bot,
   horizon glow, sun disc, stars), exposure, bloom threshold, neon gain, dusk-window lit
   probability, wet-street strength. Smooth crossfade (≈4 s). HUD sun/moon toggle; initial state
   from `em.v3.mode` (site theme) else golden. Slow drift golden→dusk over ~20 min of play.
2. Toon v2 via onBeforeCompile on MeshToonMaterial: soft 3-band ramp, warm-lit / cool-shadow
   split (shadow side tinted by sky colour), rim/fresnel on characters, cloud-shadow projection
   (world-space scrolling noise modulating light on ground + facades), subtle specular on glass.
3. Shadows that actually land: keep `renderer.shadowMap.enabled` true from the first compile
   (gate cost with `sun.castShadow` + map size), PCFSoft radius per tier, normalBias tuned,
   shadow frustum size follows sun elevation so golden-hour long shadows are not clipped.
4. Composite v2: depth-edge outline (sceneRT.depthTexture, Sobel, ink tint per daylight), DOF
   blur when a dialog/overlay is open (blend the bloom mip chain by depth), grade keyed to daylight.
   Inverted-hull outlines on hero + rigged locals (SkinnedMesh clone bound to same skeleton).
5. Sky: gradient dome + sun disc + stars at night + drifting toon clouds (already) + distant haze.
Verification: TIER=high/ultra/potato screenshots of hub + 3 districts in golden + night; shadows
visible under hero; renderer.info with autoReset=false shows calls/tris per tier ≤ baseline +15%.

## B. City kit v2 — buildings, streets, vegetation   [owner: lane B]
Files: zones.js (buildChunk/buildFacadeBlock/buildLandmark/buildStationSign), city-life.js,
world.js (hub, boulevards, trees, parkland, suburbs), NEW kit/{facades,street,flora,landmarks}.js.
1. Facade generator with real depth: walls built as piers + spandrels leaving true openings;
   recessed glass + frame + sill + lintel/keystone per window; doors with fanlights/steps; cornices,
   string courses, parapets, pitched/mansard/flat roofs with chimneys, water tanks, AC units,
   antennas; balconies with railings; drainpipes; shopfronts with mullions, fascia signboard,
   scalloped awnings, hanging signs; fire escapes on brick blocks; curtain-wall towers with
   setbacks and crowns; sawtooth industrial. Per-archetype dressing keyed off zones.json
   `architecture` text (keyword → archetype + trims) and palette. Back/station side dressed too.
2. Street kit: chamfered kerbs, paver-grid sidewalks (shader), tactile crossings, bollards,
   benches, lamps with night light cones, bins, hydrants, tree pits with grates, planters with
   flowers, café tables + umbrellas, bus shelters, bike racks, district-specific mail boxes/phone
   boxes, street signs, bunting/flags/string lights, manholes, puddles (night).
3. Flora: layered blob trees (3–4 icosahedra, colour variance), conical pines, palms with 7–9
   curved fronds (TubeGeometry along curves) and coconuts, hedges, flower beds, grass tufts —
   all InstancedMesh with wind sway; per-district species mix from palette/climate keywords.
4. Landmark kit (arch, clock tower, fountain, statue plinth, gazebo, market hall, lighthouse,
   pagoda, bridge, obelisk…) chosen by keywords in zones.json `landmark`.
5. Ground: terrain vertex colour (grass/dirt/sand) + gentle noise; road wear; sidewalk pavers.
6. Hub (world.js): same kit applied to the art-deco plaza; arrival plaza framed for the camera.
Constraints: everything through GeoBatch/InstancedMesh; per-district ≤ 12 draw calls for statics;
triangles per district ≤ 120k at high; potato tier gets the same silhouettes minus trims.
Verification: screenshots at arrival + street level in ≥4 districts (different archetypes) and hub;
collider list still blocks walking through walls (verify_game_runtime.mjs district checks pass).

## C. Characters + motion   [owner: lane C, wave 2]
Files: hero.js, rig.js, player.js, citizens.js, crowd.js (gait), zones.js (local placement), NEW
gestures.js.
1. Hero: turn-in-place + lean into turns (exists), landing squash, sprint lean, idle variations
   (weight shift, look-around every 6–10 s), head look-at toward nearest local / camera, jump
   pose from idle, footstep dust puffs, outline hull.
2. Locals (rigged GLBs + auto-rig): gesture library as keyframe clips on the humanoid bones —
   talk loop (hands + head), point, shrug, nod, shake, clap, cheer, thinking, wave; face the
   player on approach (turn), look-at head; emote sprites (✓ ✗ ✦ ❤) above head on results;
   idle sway/breathing for every standing local.
3. Crowd shader gait v2: arm counter-swing, head bob, torso lean, stride variance; phone-holding
   and bag-carrying poses; pairs walking together; sit on benches; stop-and-look when the player
   sprints past.
4. Traffic/trains: headlights + tail lights at night, wheel spin, suspension bob, doors open at
   platforms, interior lights, arrival chime + "mind the gap" bubble.

## D. Camera + cinematics   [lane A or C, wave 2]
Metro arrival dolly (1.5 s from high wide shot to follow-cam, facing the district main street),
dialog two-shot framing + DOF, zone-entry pulse, idle orbit after 8 s, screen shake on landing.

## E. Gameplay system "Metro Pass"   [owner: lane G]
Files: zones.js (progress → NEW progress.js), grammar.js, ui.js, index.html (HUD/overlays/CSS),
minimap.js, markers.js, NEW ranks.js, NEW quests.js, convex/worldProgress.ts + schema.
One-sentence system: "Help every local in a district to stamp it in your Metro Pass; stamp every
station on a line to earn the line badge; earn XP for a rank; complete all three lines to
graduate the city."
1. Quests per local: 3 beats — Listen (dialect line + comprehension), Drill (5–7 grammar items
   framed in that local's context), Use it (pick the right local phrase in a mini-scene). Street
   locals keep the quick one-shots. Round/lap escalation stays (concept stride + level up).
2. Checkpoints: district stamp (persisted), line badge, city graduation; resume at last station;
   session summary card on exit/idle (XP earned, stamps, mistakes to review).
3. XP → rank ladder with thresholds (Newcomer 0 · Commuter 150 · Regular 400 · Local 900 ·
   Native 1800 · Citizen 3200 · Legend 6000); rank-up ceremony; HUD rank chip + progress bar.
4. Rewards: XP, stamps, badges, daily streak, Wren wardrobe colours (material swap), titles.
5. Rankings: Convex `worldProgress` (studentId, xp, rank, stamps, badges, streak, updatedAt)
   written via sessionToken-gated mutation (requireStudent); `leaderboard` query returns first
   name + initial + xp + rank only (no emails, no ids) — top 50 + your position. Client keeps
   localStorage as offline cache and merges on login (max of the two).
6. Fixes: Escape closes every overlay (single overlay stack), map labels + hover, arrival ride
   radius, marker refresh, toast truthfulness, 13 px type floor on every HUD element.

## F. Content   [lane G wave 2 / content agent]
Contextual framing per district (NPC role + dialect line wraps each drill); exercise types beyond
MCQ (listen-and-pick, gap, reorder, dialect-swap); per-district learning objective in the journal;
authoring pipeline notes; voice coverage map.

## G. Runtime / no-babysitting   [lane R, wave 3]
Health beacon (load ok / GL context lost / asset 404 / avg frame time / tier) posted to a tiny
endpoint or Convex; visible "load error" card with retry; 522 retry on asset fetch; dispose audit
on district stream-out; mobile HUD pass; FACTS probe for /play (index 200 + main.js 200 + a GLB 200
+ render smoke via SwiftShader nightly).

## Waves (≤3 agents in flight)
Wave 1: A (render), B (city kit), G (gameplay system + Convex) — worktrees, disjoint files as far as
possible; main.js/index.html/zones.js touch points listed per lane; I merge + resolve.
Wave 2: C (characters), D (camera), F (content) after wave 1 lands and is screenshot-verified.
Wave 3: R (runtime), perf pass across tiers, mobile, deploy via deploy/deploy-play-<date>.sh
(guard clean prod, backup dir, edge verification, push).
Every wave ends with: TIER=high + potato + --mobile tours, screenshots reviewed by me, verify_game_runtime
district checks, zero pageerrors, calls/tris within budget.
