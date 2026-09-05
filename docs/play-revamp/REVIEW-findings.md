

# LENS: runtime  (33 findings, 9 opportunities)

## Summary
The runtime core is sound: a fixed-step sim decoupled from rendering, a two-level adaptive quality controller, a GPU-instanced crowd and district streaming that does release the heavy geometry. What fails is everything around it, and it fails silently. The signup gate shows a verified student the "Confirm your email" wall whenever /api/query answers with any non-success JSON (a Convex 5xx body, a rate-limit body), and it sits on the critical path with no timeout, so today's Convex upstream timeouts (nginx error.log 22:15Z) mean a 15-20 s blank purple screen before a byte of the game downloads. Loading is all-or-nothing: one 404 or Cloudflare 522 on any of 26 GLBs kills the whole game with "Load error, check console", and a stalled asset leaves the bar at 96% forever; nothing anywhere reports a failure (no onerror, no unhandledrejection, no contextlost, no beacon). Delivery is unhardened: unhashed modules are browser-cached 4 h by Cloudflare against the origin's no-cache, 6.6 MB of GLB/wasm is cf-cache-status DYNAMIC so every visitor pulls it from a VPS at load 10, which is exactly where the observed 522 came from. Inside the game, the 360-slot crowd pool is exhausted at high/ultra and the update order builds arriving districts before releasing departing ones, so destinations stream in with empty streets; despawned street locals are never removed from the speakers list (367 speakers for 360 slots), so new districts lose their exercise markers and ghost prompts appear; and each stream cycle leaks ~17 geometries and ~15 textures (undisposed blob-shadow planes and skeleton bone textures). Mobile gets shadows plus MSAA plus FXAA on the medium tier at 1.3-1.5 M triangles a frame, "Press E" prompts, and a landscape HUD that overlaps itself. Progress lives only in localStorage even though every player has an account. Against the no-babysitting bar the verdict is: the game cannot tell anyone it broke, and several of the ways it breaks are ones a player will hit in the first minute.

## Strengths
- Fixed-timestep simulation decoupled from rAF rendering with a clamped accumulator, plus a deterministic window.__EM.step() pump (main.js:272-278, 316-346) that makes headless verification and CI smoke tests cheap.
- Two nested adaptive controls: render-scale reacts to short spikes, tier moves on sustained trouble, with hysteresis, cooldowns and a persisted manual override that stops the controller arguing with the player (quality.js:97-139, main.js:471-486); the dev fps chip is hidden unless ?debug (ui.js:427-432).
- District streaming tags colliders, NPCs and crowd agents per zone and removes them on dispose (zones.js:1065-1099); the probe shows mesh count, colliders and programs return to steady state after six stream cycles (leak probe rows 1-6: meshes 577, colliders 907, programs 100 constant).
- GPU-instanced crowd with a slot free-list, nearest-first budget sort, per-instance packed palette that respects the 16-attribute limit, and a documented cache key bump (crowd.js:139-281, 393-403).
- Signup gate fails OPEN on network failure by design (index.html:531-535), and the CSP already carries worker-src/blob: for Draco workers and GLB textures (em-security-headers.conf).
- Touch input separates a visible stick, an invisible left-half pad and right-half look, blocks synthetic pointer events, clears keys on blur, uses pointer capture (input.js:16-133); probe confirmed stick forward moves the player, right-half drag orbits, left pad works (mobile probe STICK/LOOK/LEFT-HALF).
- Post stack renders once into a half-float target and folds ACES, grade, vignette, grain and FXAA into one composite; render targets are disposed and rebuilt on resize (postfx.js:256-287, 339-344).
- Fog of war persisted as a 5.4 KB base64 grid with try/catch around every localStorage access (minimap.js:13-55); grammar mastery load is guarded too (grammar.js:49).
- Brotli at the Cloudflare edge brings three.core.js 1.41 MB to 266 KB and zones.json 149 KB to 39 KB (curl -H 'Accept-Encoding: br' size_download); fonts, Draco and all models are self-hosted, so no third-party runtime dependency.
- Quality-tier and low-power paths are documented in code with the reason for each choice (quality.js header, crowd.js header, postfx.js header), which made this review tractable.

## Findings (by severity)

### [CRITICAL] runtime-gate-json-error-shows-confirm-wall — Any non-success JSON from /api/query shows a verified student the "Confirm your email" wall  (gate/auth, effort S)
- where: public/play/index.html:503
- evidence: index.html:501-529: `.then(r => r.json()).then(payload => { if (payload.status==='success' && payload.value.verified) start(); else show('Confirm your email to play', ...) })`. Only a JSON *parse* failure reaches the fail-open catch. Probe err-probe api-500-json (route /api/query -> HTTP 500 body {"code":"InternalServerError"}): state {gate:"flex", gateTitle:"Confirm your email to play", em:false}; screenshot /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/err-api-500-json.png. Convex returns JSON bodies on 4xx/5xx; nginx error.log 2026-09-04 22:15:58 shows 8 consecutive `upstream timed out ... POST /api/query` to convex.cloud, so this path is live today.
- impact: A confirmed student is turned away with a false accusation, offered a "Resend the link" button that also fails, and has no way in. It is the worst of the two mistakes the code comment says it wants to avoid.
- fix: Treat only `payload.status==='success' && payload.value.known===true && payload.value.verified===false` as unverified. Anything else (non-success status, 5xx, missing value) is a lookup failure -> start(). Add an AbortController timeout (5 s) that also falls through to start(). Show a one-line status ("Checking your account…") while the gate runs.

### [HIGH] runtime-no-error-reporting-anywhere — Nothing reports a failure: no onerror, no unhandledrejection, no contextlost, no beacon; the player sees "Load error, check console"  (no-babysitting, effort M)
- where: public/play/src/main.js:299
- evidence: `grep -rn 'onerror|unhandledrejection|sendBeacon|webglcontextlost|visibilitychange' src/*.js index.html` -> only voice.js:133 (SpeechRecognition onerror). main.js:299-302 is the only load-failure handler and writes 'Load error — check console.' into the loading subtitle. Probe err-glb-404: `{bar:'13%', sub:'Load error — check console.'}`, screenshot /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/err-glb-404.png. No analytics or telemetry request appears in the 70-request inventory (leak-probe.json reqs).
- impact: Every failure in this list is discovered by a player, or never. Mike cannot know how many people bounce off the loading screen, which GPU tiers they land on, or that a 522 ate a model at 14:00 on a Tuesday.
- fix: Install window.onerror + unhandledrejection + canvas 'webglcontextlost' handlers that (a) show a player-facing panel with a Retry button and (b) queue a beacon. Ship the lightweight health beacon described in opportunities (BEGIN, every 60 s, pagehide; navigator.sendBeacon to /api/play-beacon). Replace 'check console' with 'Something didn't load. Retry' and log the failing URL + status in the beacon.

### [HIGH] runtime-load-all-or-nothing — One failed or 522'd GLB out of 26 kills the whole game (Promise.all with no retry, no degrade)  (loading, effort M)
- where: public/play/src/main.js:222
- evidence: main.js:222-226: `Promise.all([zoneMgr.init().then(() => world.build()), ...NPC_ASSETS.map(load)])` rejects on the first rejection; world.build (world.js:162) likewise Promise.all over 14 building/prop GLBs; loaders.js has no retry. Probe err-glb-404 (one NPC 404): dead at 13%. err-draco-404 (wasm 404): dead at 47%, pageerror 'fetch for draco_decoder.wasm responded with 404'. Live: `curl -sI https://englishmetro.com/play/public/assets/voice/hub_clara.ogg` returned HTTP/2 522 once, 200 on the next 9 tries; nginx error.log shows origin timeouts at the same hour. Every GLB is cf-cache-status: DYNAMIC (origin hit per visitor).
- impact: Transient origin hiccups, which the VPS produces at load average 10, become a dead game for that visitor. A missing optional NPC body should cost one character, not the city.
- fix: Wrap loader.load in a retry helper (3 attempts, 0.5/1.5/4 s backoff, treat 5xx/network as retryable). Use Promise.allSettled for NPC_ASSETS and PROPS; a failed NPC falls back to `rigged:false` static or is skipped with a beacon. Keep Promise.all only for the truly required set (hero, zones.json, station_mass). Add a LoadingManager watchdog (no onProgress for 20 s -> show Retry).

### [HIGH] runtime-progress-only-in-localstorage — XP, round progress, mastery and fog live only in this browser's localStorage despite the player having an account  (data-loss, effort M)
- where: public/play/src/zones.js:124
- evidence: zones.js:95,124 `this.progress = JSON.parse(localStorage.getItem('em_progress'))` / `saveProgress() { localStorage.setItem('em_progress', ...) }`; ui.js:13,169 em_xp; grammar.js:49-50 em_grammar; minimap.js:17,53 em_fog. No fetch/mutation to /api/mutation anywhere in src/ (grep). The gate already has `session.sessionToken` (index.html:489).
- impact: Switching phone to laptop, clearing site data, or Safari's 7-day ITP eviction for a rarely-visited page silently resets a learner to zero. For a product whose loop is 'complete every district', this is data loss with no warning and no recovery.
- fix: Add a Convex `playProgress` document keyed by student: on BEGIN read it and merge (max of laps, union of done sets, max XP); write-through on every saveProgress/addXP with debounce (2 s) and on pagehide via sendBeacon. Keep localStorage as the offline cache. Show a small 'saved' indicator so players trust it.

### [HIGH] runtime-cf-browser-ttl-stale-modules — Cloudflare rewrites origin no-cache to max-age=14400 on /play/src/*.js; unhashed modules go stale and mix versions for 4 h after every deploy  (delivery/caching, effort S)
- where: /etc/nginx/sites-enabled/englishmetro.com:343
- evidence: Origin block sets `add_header Cache-Control "no-cache" always` for /play/src/ (nginx:343-347). Live: `curl -sI https://englishmetro.com/play/src/main.js` -> `cache-control: max-age=14400`, `cf-cache-status: MISS`. index.html itself is `cache-control: no-cache`, DYNAMIC. The import map (index.html:438-445) and every `import './x.js'` use stable, unhashed URLs. The brain page cloudflare-browser-ttl-overrides-origin.md recorded this as 'still to be done by Mike' on 2026-07-03; it is unchanged on 2026-09-04.
- impact: A returning player gets a fresh index.html plus whichever subset of 30 modules their browser cached in the last 4 hours, each on its own clock. After a deploy that changes a module signature (e.g. Crowd.spawn args) that is a runtime TypeError with no reporter (see runtime-no-error-reporting-anywhere).
- fix: Version at deploy time: rewrite the import map and every intra-src import to `./x.js?v=<git-sha>` (a 20-line node script in the deploy step), or move to a hashed single-bundle build with esbuild (no npm install needed beyond what the repo already has). Independently, set the Cloudflare cache rule for englishmetro.com/play/src/* to 'Respect origin' / Browser TTL 0.

### [HIGH] runtime-glb-not-edge-cached-origin-522 — 6.6 MB of GLB/wasm/ogg has no Cache-Control and is cf-cache-status DYNAMIC: every visitor hits the loaded VPS origin, which is where the 522 came from  (delivery/caching, effort S)
- where: /etc/nginx/sites-enabled/englishmetro.com:373
- evidence: nginx has `expires` only for .html, /assets/index-*, .js (1h) and css/png/jpg/gif/ico/svg/woff/woff2 (nginx:365-380); .glb/.wasm/.ogg/.mp3/.json fall through with no header. Live: station_mass.glb -> no cache-control, `cf-cache-status: DYNAMIC`; draco_decoder.wasm -> DYNAMIC; hub_clara.ogg -> HTTP 522 on first curl, then 200 x9; music.mp3 -> HIT only because Cloudflare's default extension list includes mp3. Host: `uptime` load average 6.83/9.82/9.93 on 8 cores; nginx.conf:8 worker_connections 768; error.log 22:15:58 eight `upstream timed out` lines.
- impact: Roughly 6.6 MB per first visit is served by the origin over Cloudflare's connection, on a box already timing out. Any 522 during load is a dead game (see runtime-load-all-or-nothing). Repeat visits re-download models too (only heuristic caching from Last-Modified).
- fix: Add `location ^~ /play/public/ { expires 30d; add_header Cache-Control "public, max-age=2592000, immutable" always; include em-security-headers.conf; try_files $uri =404; }` above the SPA fallback, and a Cloudflare Cache Rule 'Cache everything, Edge TTL 30d' for /play/public/*. Bust by path when an asset changes (e.g. /play/public/v3/...), which is trivial once the import map is versioned. Raise worker_connections to 4096 and add `worker_rlimit_nofile`.

### [HIGH] runtime-crowd-speakers-never-removed-ghost-markers — Despawned street locals stay in crowd.speakers forever: 367 speakers for 360 slots, ghost prompts, and new districts lose their exercise markers  (correctness/leak, effort S)
- where: public/play/src/crowd.js:443
- evidence: crowd.js:443-458 despawn() clears slot/agents but never calls setSpeaker(agent, null); zones.js:1097 despawns district agents without clearing speakers. Markers loop crowd.js:538-546 draws at most markerCap=24 speakers in array order (oldest first). nearestSpeaker (381-389) iterates this.speakers with stale x/z. rt2 POOL probe walking the Isles line at high: `speakers` 367 -> 373 -> 379 -> 385 -> 391 -> 397 -> 400 while the pool has 360 slots.
- impact: After roughly eight districts the 24 marker slots are all held by dead agents in disposed districts, so every new district shows zero golden markers over its street locals (the 176 street exercises become invisible). Returning to an old district shows markers and 'Press E — <name>' prompts over empty pavement, and openStreetDialog will happily run with the ghost.
- fix: In despawn(): `if (agent.speaker) this.setSpeaker(agent, null); agent.speaker = null;`. In the markers loop and nearestSpeaker, skip `!this.isLive(a)`. Add an invariant check in the beacon (speakers.length <= agents.length).

### [HIGH] runtime-crowd-pool-exhausted-on-arrival — Fixed 360-slot crowd pool cannot cover high/ultra demand, and zones.update builds arriving districts before disposing departing ones, so destinations stream in with empty streets  (coverage/perf-budget, effort M)
- where: public/play/src/zones.js:244
- evidence: main.js:137 `new Crowd(scene, { capacity: 360 })` is fixed; demand = hub round(crowd*0.42) + per district (round(crowd*0.075) walkers + 6 patrons): high 92 + 23 x up to 10 chunks = 322, ultra 143 + 32 x 14 chunks = 591. zones.js:244-248 iterates zones in array order and calls buildChunk before later zones' disposeChunk. zones.js:636-642 `if (!agent) break;` and 651-656 `if (!agent) return;` swallow spawn failure. rt2 probe: ultra district-15/40 `free:0`; POOL walk at high: uk_estuary thisZone 5, uk_geordie thisZone 0 (a district with no crowd and therefore no street exercises), free 217 -> 0 by sco_edinburgh.
- impact: The 'every district is full of people to overhear' premise breaks precisely on the metro ride, which is the main way players arrive somewhere. A district built with zero agents also has zero street exercises until it is disposed and rebuilt. Nothing logs it.
- fix: Size the pool from the tier: capacity = hubShare + perDistrict x ceil(maxSimultaneousChunks) (ultra needs ~600; make Crowd resizeable or allocate 640 once, InstancedMesh cost is negligible). Split update into two passes: dispose everything beyond disposeRadius first, then build. Reserve a per-district minimum (patrons + 3 walkers) before spending on walkers. Count spawn failures and beacon them.

### [HIGH] runtime-quality-never-climbs-under-60hz-vsync — Auto quality can only go down: the climb threshold (12.5 ms) is unreachable at 60 Hz, so 4-core laptops detected as 'low' never get shadows or FXAA  (performance/quality, effort M)
- where: public/play/src/quality.js:127
- evidence: quality.js:127 `else if (this.frameEMA < 12.5 && this.index < TIER_ORDER.length - 1)` where frameEMA is the rAF delta in ms (main.js:474 passes rdt*1000). With vsync at 60 Hz the delta is 16.7 ms even when the GPU is 30% busy. detectTier (quality.js:74) returns 'low' for `cores <= 4 || mem <= 3` (every 4-core Intel MacBook Air/Pro, most Chromebooks); 'low' has shadows:0 and aa:'none' (quality.js:22). The tooltip promises 'Auto adapts to your device as you play' (index.html:262).
- impact: A large class of perfectly capable laptops plays the flat, shadowless, aliased version forever while the HUD claims adaptation. The one-way ladder also means a single 4-second stall (tab switch, shader compile burst) permanently drops a tier for the session.
- fix: Measure headroom, not wall-clock: (a) CPU busy fraction = (sim+render JS ms)/(frame interval) via performance.now around the loop; (b) GPU time via EXT_disjoint_timer_query_webgl2 where available; climb when busy < 55% for 10 s at renderScale 1.0. Detect the display interval (median of 60 idle rAF deltas) and use it for both thresholds. Ignore the first 2 s after visibilitychange.

### [MEDIUM] runtime-gpu-leak-per-stream-cycle — Each district stream in/out leaks ~3 geometries and ~3 textures per district (undisposed blob-shadow planes and skeleton bone textures)  (memory-leak, effort S)
- where: public/play/src/zones.js:1088
- evidence: Leak probe at high, bouncing d0<->d40 six times with steady state after cycle 1 (chunks 7, meshes 577, npcs 25, colliders 907 constant): renderer.info.memory.geometries 429 -> 446 -> 463 -> 480 -> 497 -> 514 (+17/cycle), textures 76 -> 91 -> 106 -> 115 -> 136 -> 151 (+15/cycle); programs stable at 100. zones.js:1086-1090 disposes NPC geometry only when `o.userData.disposeWithNpc`, but zones.js:564 `wrap.add(blobShadow(0.5 * s))` creates an untagged PlaneGeometry per local; the rigged clone's `skeleton` (rig.js:170, SkeletonUtils.clone) is never `.dispose()`d so its boneTexture stays in the renderer.
- impact: Roughly 5-6 GPU objects per district visited, unbounded over a session (44 districts, revisits). Small per object, but WebGL object counts and driver memory grow until a long mobile session loses its context, with no handler to recover.
- fix: In disposeChunk: `n.obj.traverse(o => { if (o.isSkinnedMesh) o.skeleton?.dispose(); if (o.isMesh && (o.userData.disposeWithNpc || o.geometry.type === 'PlaneGeometry')) o.geometry.dispose(); ... })` or tag the blob shadow (`m.userData.disposeWithNpc = true` in blobShadow callers). Add a debug assert in the beacon: geometries/textures should return to baseline after leaving a district.

### [MEDIUM] runtime-loading-stall-no-watchdog — A stalled asset leaves the loading bar at 96% forever with no message, no retry, no timeout  (loading, effort S)
- where: public/play/src/main.js:134
- evidence: main.js:134-135 LoadingManager only wires onProgress; no onError, no timeout anywhere; loaders.js has none. Probe err-glb-stall (station_mass.glb never answers): after 45 s state `{bar:'96%', sub:"It's a big city…", begin:'none'}`, screenshot /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/err-glb-stall.png.
- impact: On a flaky mobile connection a single hung request is indistinguishable from a broken game. The player waits, then leaves; nobody learns why.
- fix: Watchdog: if no manager.onProgress for 15 s, replace the subtitle with 'Still loading… (slow connection)' and after 30 s show a Retry button that reloads with `?nocache`. Beacon the stall with the last URL in flight. Pair with per-request AbortController timeouts (30 s) inside the retry helper.

### [MEDIUM] runtime-gate-on-critical-path-no-preload — The /api/query round trip blocks the first byte of game code; with no timeout an upstream stall means 15-20 s of empty progress bar  (loading, effort S)
- where: public/play/index.html:496
- evidence: index.html:467-472 injects main.js only after the fetch resolves; no `<link rel="modulepreload">`, no AbortController. nginx /api/query: proxy_connect_timeout 5s, proxy_next_upstream_tries 3, proxy_next_upstream_timeout 15s (nginx:140-149). Probe err-api-hang (12 s stall then abort): BEGIN visible after 21.2 s vs 6.0 s baseline. Module waterfall is index -> main.js -> 20 modules -> three.module.js -> three.core.js (5 serial round trips) before any model request.
- impact: Every first visit pays the Convex round trip plus a 5-deep module waterfall before the 7 MB of models even start. During a Convex incident (which happened today) the game looks dead for the duration.
- fix: Add `<link rel="modulepreload" href="./src/main.js">` plus preloads for three.module.js/three.core.js/GLTFLoader (they download and parse but do not execute) so the network works while the gate resolves. Gate only `start()`. Abort the gate fetch after 5 s and fail open. Consider `<link rel="preload" as="fetch">` for zones.json.

### [MEDIUM] runtime-mobile-medium-shadows-msaa-fxaa — Phones land on 'medium' and get 1024 shadows + MSAA backbuffer + FXAA post at 1.5x DPR and 1.3-1.5 M triangles per frame  (mobile/performance, effort M)
- where: public/play/src/main.js:46
- evidence: main.js:46 `antialias: lowPowerHint || compactTouch` (MSAA backbuffer), main.js:52 `shadowMap.enabled = !compactTouch` is then overridden by applyQuality (main.js:75) which enables shadows for medium (quality.js:29 shadows:1024, aa:'fxaa', postfx:true). detectTier returns 'medium' for coarse+small screen (quality.js:75). Mobile probe TIER at medium: `{shadow:true, mapSize:1024, postfx:true, aa:true, pr:1.14}`. rt2 medium: 293-448 draw calls and 1.07-1.53 M triangles per frame; postfx comment says MSAA is only for devices that skip post (main.js:43-45).
- impact: The phone tier pays for two anti-aliasing passes and a shadow pass it was explicitly designed to skip, on the device class with the least headroom. The adaptive controller will then drop it to 'low' (no shadows, no FXAA, blurry) instead of a sane phone budget.
- fix: Derive `antialias` from the chosen tier (`s.aa === 'msaa'`), not navigator flags; make renderer creation wait for detectTier. Add a phone ladder: medium-mobile = shadows 512 or 0, postfx with FXAA, pixelRatio cap 1.25, crowd 90, buildRadius 80. Budget triangles: hide the 25k-tri authored locals past 30 m on coarse pointers, and let world.setDetail react to tier for skyline/suburb counts.

### [MEDIUM] runtime-two-weak-device-heuristics-disagree — lowPowerHint (navigator flags) and Quality tier are two separate 'weak device' decisions that can contradict each other  (architecture/perf, effort M)
- where: public/play/src/main.js:35
- evidence: main.js:35-41 lowPowerHint from saveData/2g/deviceMemory<=4/hardwareConcurrency<=4/compactTouch drives renderer antialias (46), World detail (146: suburbs 56 vs 88, trees 90 vs 160, hub vendors, point lights), Traffic (267), Citizens count (269). quality.js header says systems should read their budget from the tier 'instead of re-deriving is-this-a-weak-device from navigator flags'. A 4-core desktop gets lowPower world detail AND tier 'low' with postfx AND MSAA; a manual 'ultra' pick never restores the lowPower cuts.
- impact: The manual graphics dropdown lies for a large device class: 'ultra' on a 4-core machine still has the sparse suburbs, fewer citizens and no plaza lights. Two heuristics also make perf bugs hard to reproduce.
- fix: Fold lowPowerHint into detectTier (saveData/2g -> potato already there), then make World/Traffic/Citizens read counts from `quality.s` via setDetail like the crowd does. Keep compactTouch only for HUD layout.

### [MEDIUM] runtime-sync-chunk-build-hitch — District construction is synchronous on the main thread: 96-186 ms per zones.update on the VPS, several chunks in one tick, plus O(vertices x footprints) AO baking  (performance, effort L)
- where: public/play/src/zones.js:246
- evidence: zones.js:244-248 builds every zone that crossed buildRadius in the same tick; buildChunk merges hundreds of BufferGeometries (GeoBatch, mergeGeometries) and bakeVertexAO loops every vertex against every footprint (materials.js:107-127). z43 probe (potato, no wet streets): `zones.update` wall time 96 ms (3 chunks), 186 ms (5 chunks), 149 ms, 163 ms measured with performance.now around the call. First frame after arrival took 12.8-15.3 s in SwiftShader from shader compilation of the new materials.
- impact: A 100-200 ms freeze on a fast server CPU becomes a 0.5-1 s freeze on a mid-range phone every time a district streams in, and on real GPUs the first frame also pays shader compilation for the new material variants. This is the 'stutter when the city loads in' a player will report, and rideTo triggers the worst case (several chunks at once).
- fix: Queue chunk builds and build at most one per frame (or time-slice with a 6 ms budget using a generator). Pre-warm shaders once at load with renderer.compile(scene, camera) after the first chunk exists. Precompute AO per archetype in a Worker or cache the baked colour arrays per (arch, size) key. Build the destination district before the fade-out ends in rideTo.

### [MEDIUM] runtime-audio-no-resume-no-visibility — AudioContext is never resumed after suspension/interruption and the game never reacts to tab hide  (audio/lifecycle, effort S)
- where: public/play/src/audio.js:14
- evidence: audio.js:14-43 creates the context once; no check of ctx.state, no resume(); grep for visibilitychange/pagehide across src/ returns nothing. iOS Safari moves the context to 'interrupted'/'suspended' after a call, Siri, or screen lock and requires resume() from a gesture; Chrome autoplay policy suspends contexts created before a gesture (here it is created in the BEGIN click, so the first start is fine). rt2 AUDIO probe: ctx 'running' after BEGIN, buffers ping+music.
- impact: After the first interruption on a phone the music and every SFX stay silent for the rest of the session, with nothing telling the player or Mike. In a hidden tab the music plays on and the sim keeps ticking.
- fix: On document visibilitychange: hidden -> ctx.suspend() and renderer.setAnimationLoop(null); visible -> resume + restart loop and reset clock (avoid the 0.1 s catch-up burst). On any pointerdown/keydown, if ctx.state !== 'running' call ctx.resume(). Beacon the state at each sample.

### [MEDIUM] runtime-voice-html-audio-outside-gesture — NPC voices use HTMLAudioElement.play() from the rAF loop, not a gesture; on iOS this is likely rejected and the speechSynthesis fallback is gesture-bound too, so 3.4 MB of baked Kokoro lines may never play on iPhone  (audio/mobile, effort M)
- where: public/play/src/voice.js:44
- evidence: voice.js:35-47 `new Audio(url).play()` invoked from ui.openDialog (ui.js:180), which main.js:444 calls inside renderer.setAnimationLoop when `mouse.interact` is consumed (input edge-triggered at input.js:95/150), i.e. outside the user-activation callback. `p?.catch(() => this.speakSynth(...))` silently swallows NotAllowedError. speechSynthesis.speak() (voice.js:65) has the same iOS gesture requirement. 107 .ogg files, 3.4 MB (du public/assets/voice). NOT verified on a physical iPhone: this needs an on-device check.
- impact: If confirmed, iPhone players get silent locals and no error, while the asset pipeline and Kokoro generation effort are wasted on the most common student device. The failure is invisible in every desktop test.
- fix: Play voice through the already-unlocked WebAudio context: fetch + ctx.decodeAudioData, cache buffers per id, play via a BufferSource on the sfx bus (AudioManager already has the plumbing). Pre-fetch the two voice ids of each district as it streams in. Report play() rejections via the beacon so the iOS behaviour is measured, not guessed.

### [MEDIUM] runtime-mic-button-without-stt-engine — The 🎤 answer button is always shown, but prod has no STT server and Firefox has no Web Speech, so it fails with a misleading 'Didn't catch that'  (voice/robustness, effort M)
- where: public/play/src/ui.js:389
- evidence: ui.js:389-411 renders the mic button whenever `this.voice` exists (always, main.js:29). voice.js:6 STT_URL = http://localhost:5197; voice.js:20-21 sets sttAvailable=false on any non-localhost origin, so prod always takes listenWebSpeech (voice.js:124-137), which rejects 'no speech recognition' on Firefox -> listen() returns '' -> toast 'Didn't catch that — try again' (ui.js:401). rt2 AUDIO probe on localhost: sttAvailable null (unprobed), SpeechRecognition present in Chromium. CSP Permissions-Policy allows microphone=(self).
- impact: A visible feature that cannot work on the deployed origin for a whole browser family, and on Chrome silently ships the learner's voice to Google's recogniser with no notice. The welcome tour advertises 'answer questions with your voice' (ui.js:99).
- fix: Feature-detect: hide the button when neither an STT endpoint nor SpeechRecognition exists; label the engine ('via your browser'). Ship the Hercules faster-whisper behind `/api/stt` on the VPS (nginx proxy, rate-limited, sessionToken-gated) and probe that instead of localhost. Count listen() failures by engine in the beacon.

### [MEDIUM] runtime-press-e-on-touch-devices — Interaction prompt reads 'Press E' on touch devices that have no E key  (mobile/ux, effort S)
- where: public/play/src/main.js:438
- evidence: main.js:423-440 always formats `Press <b>E</b> — …`; input.js:17 adds body.touch but the prompt never checks it. Mobile probe landscape screenshot shows 'Press E — talk to Conductor Clara ❗ exercises' beside the 💬 button: /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/mob-5-landscape.png.
- impact: First-minute confusion for every phone player at the exact moment the game asks them to do the core action.
- fix: In UI.setPrompt or at the call sites use `document.body.classList.contains('touch') ? 'Tap 💬' : 'Press <b>E</b>'`; same for the metro/map toasts (main.js:389, 394) that say '(T)'.

### [MEDIUM] runtime-landscape-hud-overlap — In landscape the 318 px touch-button column overlaps the XP chip and BETA tag  (mobile/layout, effort S)
- where: public/play/index.html:233
- evidence: index.html:233-239: #touch-ui bottom:12%, 5 buttons x 54 px + 4 x 12 px gap = 318 px; at 393 px viewport height the column's top sits at ~28 px, under #xp (top 10 px). Screenshot /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/mob-5-landscape.png shows the jump button drawn over '0 XP' and 'BETA'. No `(orientation: landscape)` media query exists in index.html.
- impact: The jump button becomes untappable under the XP chip and the HUD reads as broken in the most common phone gaming orientation.
- fix: `@media (orientation: landscape) and (max-height: 500px) { body.touch #touch-ui { flex-direction: row; right: 12px; bottom: 12px; gap: 8px } body.touch #touch-ui button { width: 44px; height: 44px } body.touch #xp { top: 8px } }`, or move XP/BETA left of the column.

### [MEDIUM] runtime-dialog-over-touch-controls — Dialog panel opens on top of the joystick and the touch-button column, which stay visible and half-tappable beneath it  (mobile/layout, effort S)
- where: public/play/index.html:109
- evidence: Mobile probe RECTS: #dialog y 449-801, #stick y 694-826 x 18-150, #touch-ui y 432-750 x 321-375, viewport 393x852; #dialog z-index 25 vs #hud 20. Screenshot /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/mob-3-dialog.png shows the ghosted buttons through the panel; drill option buttons are 39 px tall (DRILL probe), below the 44 px touch target guideline.
- impact: Visual clutter at the most important moment (the exercise) and 39 px answer buttons that invite mis-taps next to the visible-but-covered stick.
- fix: Toggle `body.dialog-open` in openDialog/closeDialog and hide #stick/#touch-ui/#gfx under it; on body.touch give `#dialog .opts button` min-height 48 px and the dialog `bottom: max(6%, env(safe-area-inset-bottom))`.

### [MEDIUM] runtime-em-progress-parse-unguarded — A corrupt em_progress value throws at module top level and the game never boots (bar at 0, no message); progress writes are also unguarded  (robustness/storage, effort S)
- where: public/play/src/zones.js:95
- evidence: zones.js:95 `this.progress = JSON.parse(localStorage.getItem('em_progress') || '{}')` with no try/catch, executed in `new ZoneManager(...)` at main.js:147 during module evaluation, before the load promise and its catch exist. grammar.js:49 and minimap.js:16-22 guard the same pattern. zones.js:124 saveProgress and ui.js:169 addXP call setItem unguarded (QuotaExceededError in restricted storage modes aborts finish() mid-drill at ui.js:330).
- impact: One bad write (a truncated save on a crashing tab, an extension, a future schema change) bricks the game for that browser with a silent purple screen; the player cannot even clear it because nothing tells them what happened.
- fix: Wrap the parse in try/catch, fall back to {} and beacon 'progress_corrupt' with the raw length; validate shape (laps number, d object). Wrap all setItem in a `safeSet` that catches, toasts once, and beacons. This becomes moot once progress syncs to Convex.

### [MEDIUM] runtime-first-visit-9mb-before-begin — First visit downloads 68 requests / ~7.3 MB (brotli) before BEGIN, then 2.2 MB of music; all eight NPC rigs and every hub prop are blocking, and the bar counts files not bytes  (loading/perf, effort M)
- where: public/play/src/main.js:222
- evidence: leak-probe LOAD: nBegin 68 requests, bytesBegin 9,085,748 raw, total 11,284,546 after BEGIN (music.mp3 2,196,292). Live brotli sizes: three.core.js 266 KB, three.module.js 126 KB, zones.json 39 KB, grammar_bank 19 KB; the 26 GLBs (6.6 MB) are incompressible. main.js:224-225 loads all 8 NPC rigs (2.99 MB) before BEGIN although districts need them only when streamed. manager.onProgress (main.js:135) is loaded/total file count, so a 457 KB station and a 21 KB clip move the bar equally. music.mp3 is fetched on BEGIN regardless of saveData.
- impact: Roughly 10 s on a 10 Mbit connection before the button appears, longer on mobile data, with a bar that lurches. The heaviest part (rigs) could arrive while the player reads the welcome tour.
- fix: Phase the load: hero + zones.json + station + plaza first (BEGIN at ~2.5 MB), then NPC rigs and props in the background with `fetchpriority=low`; districts already tolerate npcBases arriving later if setNPCBases is called after. Weight progress by Content-Length. Skip or stream music (use `<audio preload=none>` or a 96 kbps 700 KB Opus). Honour navigator.connection.saveData by skipping music and voice preloads. Consider KTX2 for the Meshy textures inside the GLBs and meshopt for the hub buildings.

### [MEDIUM] runtime-fixed-step-catchup-burst — After a hitch the sim runs up to 15 ticks in one frame, and sim cost does not scale with tier, so weak devices amplify their own stalls  (performance/sim, effort M)
- where: public/play/src/main.js:400
- evidence: main.js:400-401 `accumulator = Math.min(accumulator + rdt, 0.25); while (accumulator >= SIM_DT) simTick(SIM_DT)` -> up to 15 ticks. simTick (322-346) iterates all crowd agents (crowd.js:495 up to 360), 44 zones, 870-1046 colliders x 3 passes for the player (player.js:130-159, rt probe colliders count), citizens x colliders, trains, traffic regardless of tier. rt probe stepMs 1.3-5.2 ms per sim+render step on the VPS CPU.
- impact: A 100 ms GC pause or shader compile on a phone is followed by a 15-tick catch-up frame of tens of milliseconds, which reads as a double stutter and pushes frameEMA over the tier-drop threshold. The controller then lowers the *render* budget for a *sim* problem.
- fix: Cap catch-up at 4 ticks and drop the remainder (`accumulator = Math.min(accumulator, 4*SIM_DT)`); on potato/low run the sim at 30 Hz with interpolated crowd matrices; skip crowd._advance for agents beyond crowdRadius every other tick; spatially hash colliders (grid of 32 m cells) so the player and 7 citizens test ~20 boxes instead of ~900.

### [MEDIUM] runtime-tier-controller-vs-30hz-displays — Fixed 26 ms / 21 ms thresholds misread 30 Hz rAF (iOS Low Power Mode, 30 Hz monitors) as GPU trouble and drop to potato within ~12 s  (performance/quality, effort S)
- where: public/play/src/quality.js:124
- evidence: quality.js:124 `if (this.frameEMA > 26 && this.index > 0)` drops a tier every cooldown (4 s); main.js:477 `frameEMA > 21` lowers render scale by 0.08 every 1.5 s to 0.62. A 30 Hz rAF delivers 33 ms deltas regardless of load. Manual override is the only escape (quality.js:99).
- impact: Players on battery-saver phones or 30 Hz external displays are pushed to the lowest tier at 62% resolution while the GPU idles, and the one-way ladder (see runtime-quality-never-climbs-under-60hz-vsync) never brings them back.
- fix: Estimate the display interval from idle rAF deltas at startup and after visibilitychange; express thresholds as multiples of it (drop when EMA > 1.5 x interval sustained). Prefer the busy-fraction measurement recommended above.

### [MEDIUM] runtime-webgl-context-lost-unhandled — No webglcontextlost/restored handling: a GPU reset leaves a black canvas with a live HUD  (robustness, effort S)
- where: public/play/src/main.js:42
- evidence: grep -rn 'contextlost|contextrestored' src/ returns nothing; renderer created at main.js:42-57 with no listeners on renderer.domElement. Mobile Safari and Android Chrome lose WebGL contexts under memory pressure, which the texture/geometry leak (runtime-gpu-leak-per-stream-cycle) makes likelier over a long session.
- impact: The player sees a frozen black world behind a working HUD, with no message and no recovery, and nothing is reported.
- fix: Add `canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); showPanel('Graphics reset — tap to reload'); beacon('contextlost'); })` and on 'webglcontextrestored' rebuild render targets (postfx.setSize) and re-upload; simplest robust path is a reload with state already in localStorage/Convex.

### [MEDIUM] runtime-nginx-worker-connections-under-load — Origin runs nginx with worker_connections 768 on a box at load average ~10, and the game's assets all bypass the edge  (infra, effort S)
- where: /etc/nginx/nginx.conf:8
- evidence: /etc/nginx/nginx.conf:2 `worker_processes auto`, :8 `worker_connections 768`; `uptime` 22:25:43 load average 6.83, 9.82, 9.93 on nproc 8; `ss -s` 480 established, 1686 timewait; error.log shows `upstream timed out (110)` bursts at 22:15:58. Combined with cf-cache-status DYNAMIC on every .glb/.wasm/.ogg (curl -sI), each visitor is ~30 origin requests. The 522 observed on hub_clara.ogg is Cloudflare's 'origin did not respond' code.
- impact: Peak-hour first visits are served by the least reliable link in the chain, and one timed-out response ends the game for that player.
- fix: Edge-cache /play/public/* (see runtime-glb-not-edge-cached-origin-522), raise worker_connections to 4096 with `worker_rlimit_nofile 8192`, enable `keepalive_requests 1000`, and add a FACTS.md probe for origin 5xx/522 rate on /play/* from the Cloudflare analytics API or a synthetic curl loop.

### [LOW] runtime-unminified-three-and-encoder-in-repo — three.js is shipped unminified (2.04 MB raw, 393 KB brotli) plus a 954 KB Draco encoder nobody loads  (loading/perf, effort S)
- where: public/play/public/vendor/three/three.core.js:1
- evidence: ls -la: three.core.js 1,408,569 B, three.module.js 631,039 B, draco_encoder.js 954,360 B (never requested in the 70-request inventory). Live brotli: 266,424 + 126,485 B. No bundler by design (index.html import map).
- impact: About 200 KB of extra transfer and, more importantly, ~2 MB of JS to parse and compile on every cold start on phones (hundreds of ms). The encoder is repo/deploy bloat only.
- fix: Run esbuild once at deploy over public/play/src/main.js with the import map resolved into a single hashed ESM bundle (tree-shakes three to what is used, typically <700 KB raw), keep source maps; delete draco_encoder.js from the deploy set.

### [LOW] runtime-escape-and-focused-controls — Escape does not close map/metro/journal/welcome, and game keys act while a form control has focus  (keyboard/ux, effort S)
- where: public/play/src/ui.js:28
- evidence: ui.js:28-30 Escape only closes dialog and guide. rt2 probe: `ESCAPE closes map? {mapOpen:true, mapAfterEsc:true}`. input.js:92-100 keydown on window with no target check; rt2 KEYBOARD: with #gfx-select focused, ArrowUp moved the player z 8 -> 6.79 and W to 6.13 while activeElement stayed gfx-select.
- impact: Keyboard players expect Esc to back out of any overlay; arrow keys on the graphics dropdown steer the character behind it. Minor but felt every session.
- fix: Route Escape through one `closeTopmost()` in UI (welcome > map > metro > journal > guide > dialog). In Input.keydown, return early when `e.target` is an input/select/textarea or when any overlay is open.

### [LOW] runtime-journal-total-mismatch — Journal shows districts as n/2 while the round actually needs 3 locals  (correctness/ui, effort S)
- where: public/play/src/ui.js:615
- evidence: ui.js:615 `const total = Math.min(2, z.data.npcs.length)`; zones.json has exactly 2 npcs per zone (probe: `npcs per zone {2}`) but dialects.js:101-112 districtCastFor pads to 3 and zones.js:138 teacherTotal = min(3, cast.length) = 3, which drives the objective chip and recordDone.
- impact: After helping two locals the journal reads '2/2' with an open-round mark, contradicting the HUD's '1 more local'.
- fix: Use `zoneMgr.teacherTotal(z.data.code)` in the journal rows.

### [LOW] runtime-npc-bases-empty-silent — If authored clips are missing on every NPC GLB the districts spawn no locals and the city no citizens, with only console.warn  (no-babysitting, effort S)
- where: public/play/src/main.js:246
- evidence: main.js:245-249 requires clips idle+walk+Wave, else `console.warn` and static; main.js:252 `zoneMgr.setNPCBases(npcBases.filter(rigged))`; zones.js:540 `if (this.npcBases?.length && this.world)` skips district locals entirely when the array is empty; citizens.js:122-126 likewise. A Blender re-export that renames a clip would ship a hollow city that still passes the load.
- impact: A content regression the game cannot detect; the objective chip would say 'help 3 more locals' in districts with none.
- fix: Assert at load: rigged bases >= 3 else surface a visible warning and beacon 'npc_rigs_missing' with the key list; the beacon's per-session `npcs` count would also catch it.

### [LOW] runtime-quality-change-not-applied-to-built-chunks — Changing tier does not re-stream built districts: wet streets, crowd counts and vertexAO stay at the old tier until the player leaves  (quality, effort M)
- where: public/play/src/zones.js:437
- evidence: zones.js:437 `if (this.quality?.wetStreets) addWetStreets(streetMat)` and :634 walkers computed from quality.crowd at build time; applyQuality (main.js:94-95) only updates zoneMgr.quality for future chunks. rt probe: after setManual('ultra') chunks count stayed 9 and agents unchanged until teleport.
- impact: The graphics dropdown appears to do nothing to the street you are standing on; the auto-controller's savings arrive late.
- fix: On tier change, mark built chunks dirty and rebuild the nearest one per frame (reuse the time-sliced queue), or at least despawn/respawn district crowd to the new count.

### [LOW] runtime-gfx-select-on-player-hud — A 19 px tall monospace 'graphics' dropdown sits on the player HUD, bottom-right, on phones too  (mobile/ux, effort S)
- where: public/play/index.html:132
- evidence: index.html:130-135 #gfx fixed bottom 24 px right 10 px, font 11px monospace; mobile RECTS `gfx {x:256,y:809,w:127,h:19, pointerEvents:auto}`; screenshot /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/mob-1-hub.png bottom right.
- impact: Sub-44 px target with developer styling on a product UI that otherwise follows the v3 design system; easy to hit by accident from the metro button column.
- fix: Move quality selection into the H guide/settings panel with the v3 button style; keep the shortcut only under ?debug.

## Opportunities

### Runtime health beacon (the no-babysitting backbone)  (effort M, cost one day; negligible storage)
- why: Today the game cannot say 'I failed'. Every finding above stays invisible until a player complains. A 2 KB beacon turns tier distribution, load time, error rate and asset failures into FACTS.md probes.
- how: Client: collect {sid, ts, ua, gpu (UNMASKED_RENDERER), detectedTier, tier, renderScale, dpr, viewport, loadMs, bytes (PerformanceResourceTiming), fps p50/p95 + longest frame, chunkBuildMs p95, geometries/textures at sample, crowd free slots, speakers/agents, districts visited, xp, audioState, voice failures by engine, errors[] from onerror/unhandledrejection/contextlost/asset(url,status)}. Send via navigator.sendBeacon('/api/play-beacon') at BEGIN, every 60 s, and on pagehide; sample 100% (tiny traffic). Server: nginx location -> a 40-line Python/Node appender to /var/lib/em-play/beacons.ndjson (or a Convex mutation `playTelemetry:record`). Ops: goals.yaml probes -> FACTS.md rows: sessions/24h, load p95, tier histogram, error rate, top failing URL, pool-exhaustion count; alert when error rate > 5% or sessions drop to 0 while the SPA has traffic.

### Versioned, edge-cached delivery with modulepreload  (effort S, cost half a day)
- why: Fixes the 4 h stale-module window, the per-visitor 6.6 MB origin pull and the 522 class in one deploy step; repeat visits become near-instant.
- how: Deploy script rewrites the import map and all relative imports to `?v=<sha>` (or esbuild into one hashed bundle), moves assets under /play/public/<sha>/ with `Cache-Control: public, max-age=31536000, immutable`, adds `<link rel=modulepreload>` for main.js and three, plus a Cloudflare Cache Rule 'cache everything' on /play/public/*. Optional: a Service Worker that precaches the model set so a 522 can never hit a returning player.

### Progressive, prioritised loading and decimated locals  (effort L, cost 2-3 days incl. Blender work)
- why: BEGIN after ~2.5 MB instead of ~7.3 MB; the 25k-triangle authored locals are the biggest remaining triangle block (Renderer-Rebuild open question) and cost ~1.3-1.6 M tris/frame at medium+.
- how: Phase 1 (hero, hub station, zones.json) blocks BEGIN; NPC rigs and props load with fetchpriority=low while the tour plays and slot in via setNPCBases. Bake 2 LODs per local in Blender (25k -> 6k -> 1.5k) and switch with THREE.LOD at 12/30 m; use meshopt + KTX2 (Basis) textures via the already-wired MeshoptDecoder/KTX2Loader to cut GLB bytes ~40%. Byte-weighted progress bar.

### Time-sliced district streaming with shader pre-warm  (effort M, cost 1-2 days)
- why: Removes the 100-200 ms (desktop) / 0.5-1 s (phone) freeze on every stream-in and the first-frame shader compile hitch on arrival.
- how: Build queue: one chunk per frame, or a generator yielding after each GeoBatch stage under a 6 ms budget; renderer.compile() once after the first chunk so toonVertex/wet/lit programs exist; precompute vertex AO per archetype key and cache the colour buffer; in rideTo build the destination during the 480 ms fade.

### Quality controller v2: headroom-based, display-aware, phone ladder  (effort M, cost 2 days)
- why: The current ladder only descends at 60 Hz and mis-tiers 30 Hz displays; phones get the wrong mix of AA and shadows.
- how: Measure CPU busy fraction per frame and GPU time with EXT_disjoint_timer_query_webgl2 (fallback: busy fraction); estimate refresh interval; climb when busy < 55% for 10 s, drop when > 90% for 3 s. Add mobile tiers (no MSAA when postfx; 512/0 shadows; pixelRatio cap 1.25; crowd 90) and let World/Traffic/Citizens read counts from the tier so the dropdown is truthful. Cascaded shadow maps (CSM addon) at high/ultra would also let the sun cover more than 76 m without shimmer.

### Voice through WebAudio and a real /api/stt  (effort M, cost 1 day + STT service hardening)
- why: Guarantees NPC speech on iOS (the likely-silent path today), lets district voice lines pre-fetch on stream-in, and makes spoken answers work on every browser via the VPS faster-whisper instead of a dev-machine localhost.
- how: VoiceManager.speak -> fetch(ogg) -> ctx.decodeAudioData -> BufferSource on AudioManager.sfxGain with a per-id cache and district prefetch; nginx `location /api/stt` -> Hercules :5197 with limit_req and sessionToken check; UI shows the engine and hides the mic when none is available. Beacon success/failure per engine.

### Account-bound progress with offline cache  (effort M, cost 1 day)
- why: Players have accounts but their XP and rounds are trapped in one browser; this is the difference between a game and a demo.
- how: Convex table playProgress {studentId, xp, progress, mastery, fog, updatedAt}; load on BEGIN and merge (max/union), write-through debounced 2 s and on pagehide (sendBeacon to /api/mutation with the token); conflict rule: union of done sets, max laps/xp. Show 'saved' in the journal header.

### Crowd pool and sim scaling by tier  (effort M, cost 1 day)
- why: Empty streets on arrival and sim catch-up bursts both come from budgets that do not follow the tier.
- how: Size Crowd capacity from the tier (or allocate 640 once), dispose-before-build in zones.update, per-district reserved slots, 30 Hz sim with interpolation on potato/low, spatial hash for the ~900 AABB colliders, skip _advance for agents beyond crowdRadius on alternate ticks.

### CI smoke against the deployed URL using window.__EM.step()  (effort S, cost half a day; ~2 min per run)
- why: The deterministic step pump already exists; a 90-second Playwright run can assert budgets (draw calls, triangles, bytes before BEGIN, zero console errors, speakers <= agents, geometries return to baseline after a stream cycle) and post to FACTS.md.
- how: Adapt rt-probe/leak-probe into `tests/play-smoke.mjs`; run from the deploy gate against the local copy before rsync and against https://englishmetro.com/play/ after; write results to /var/lib/brain as a FACTS probe; fail the deploy on budget regression or pageerror.

## Screenshots
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/err-api-500-json.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/err-glb-404.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/err-draco-404.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/err-glb-stall.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/err-api-hang.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/mob-1-hub.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/mob-3-dialog.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/mob-4-drill.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/mob-5-landscape.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/leak-d0-high.png


# LENS: gameplay  (27 findings, 8 opportunities)

## Summary
The loop that exists is a single mechanic wearing three coats: talk to a ❗ local, answer 7 multiple-choice grammar items, repeat for every local in the district to "close a round", which re-rolls concepts one CEFR step harder. That skeleton is sound and the HUD tells you where you are in it, but the probe shows the core gate is not real: a wrong click only greys the option and the eventual right click still scores, so every drill, warm-up and street question ends 7/7 with full XP (a wrong-first run scored 7/7, +57 XP, "Sharp!"), the journal then reports 50% accuracy for the same drill, and the 5/7 pass threshold and the baked "fail" voice barks are dead code. The grammar bank that feeds those drills ships 21 raw transcript fragments as answer options ("Mmm. Okay. For example, the reason is very important…"), one item whose marked answer contradicts its own explanation (articles_36 crowns "I go to the school"), 76 two-option coin-flips and 8 duplicated sets, and the game served articles_36 in the very first drill I played. The product premise, "every district speaks its own English", is carried by the optional warm-up and the street questions (which are well written), while the mandatory quest is positional generic grammar with zero dialect linkage (validIn is populated on 0 of 301 items), so a Dublin fishmonger teaching "Articles B1" is the norm, not an accident. Progression has no server: every number lives in localStorage keyed to nothing (a second student session on the same browser inherits the XP, a fresh context starts at 0, the only API call is the signup check), XP buys nothing, there is no rank, streak, daily goal, summary, mistake review or spaced repetition, and the "City goal" flips a ✅ with no payoff. Rough edges found live: Escape closes only the dialog and guide, so journal, map, metro and welcome pile on top of each other; the XP toast is overwritten in the same tick by the round toast so "+57 XP" is never seen; the hub's 55 m radius swallows the first local and two of three street speakers in all six first-stop districts, so the HUD says "Metropolis Central" while you drill The Queen's Mile; despawned street speakers are never removed from crowd.speakers, so after 11 districts there were 105 speakers for 12 live, the 24-marker cap was exhausted by ghosts, and the nearest-speaker pick returned a dead "already helped" agent standing exactly where the live one was. The journal per-district rows also count to 2 while the round needs 3. Strengths worth keeping: the round/lap structure, objective chip, ❗/✓ markers, mastery persistence, accent-aware voice profiles, and genuinely good dialect micro-lessons in zones.json. The next level is a real scoring and mastery system, server-side saves through the Convex session the wall already validates, a legible rank ladder with district stamps and line certificates, dialect-skinned drills, and a content gate that stops transcript garbage reaching students.

## Strengths
- Round/lap structure is a coherent core: recordDone closes a circuit when every local is helped, laps++ rotates concepts by a stride coprime with the 14 concepts and climbs a CEFR level (zones.js:165-181, grammar.js:27-43); probe confirmed hub round 1 -> round 2 with Clara articles A1 -> pronouns A2, Beatrice verb_tense B1 -> word_choice B2.
- Objective chip + zone card give an always-visible local goal ("Round 1 - help 3 more locals here (0/3)") and update the moment a drill passes (main.js:153-159; gp-7-arrived-queens-mile.png).
- Quest markers are legible RPG idiom (amber ❗ pulses, green ✓ static) and flip immediately on pass (markers.js:43-52; probe npc0 markerIsDone true).
- Dialect warm-ups and street exercises are real, well-written micro-lessons with explanations ("'Half four' means half past four - 4:30. British speakers drop the 'past'") and each of the 44 districts carries 3 warm-ups + 4 street items (zones.json stats).
- Wrong answers reveal a teaching explanation inline before the player retries (ui.js:374-383; gp-drill-wrong-wrongFirst.png).
- Mastery is persisted per concept with unique-correct tracking and unseen-first selection (grammar.js:49-94), and the metro list / map dots surface district completion state (ui.js:557, 474-477).
- Accent-aware speech: baked Kokoro lines for 44x2 locals + 4 hub cast + 15 barks, with a per-dialect speechSynthesis fallback profile (dialects.js, voice.js:29-66, 107 .ogg files present).
- Five-page onboarding tour is warm, device-aware and replayable from the guide (ui.js:59-143).
- Player-facing copy honours the owner rule: every quest string says "local", zero "teacher" hits in zones.json and ui.js.
- Fog-of-war minimap persists across sessions (minimap.js:13-55) and the city map is a hover-to-name, click-to-ride single surface (gp-13-map-hover.png).

## Findings (by severity)

### [CRITICAL] gameplay-01 — No exercise in the game can be failed: a wrong click is free and the eventual right click still scores  (core-loop, effort S)
- where: public/play/src/ui.js:362
- evidence: ui.js:359-368 `if (isRight) { answered = true; ... correct++ }` else `ob.disabled = true` and the question stays open. Probe: wrong-first on all 7 questions -> finish text "You scored 7/7. Sharp!" +57 XP (gp.log 'DRILL wrong-first result'; gp-drill-finish-wrongFirst.png). Warm-up wrong-first still paid +20 XP (ui.js:222-238; gp.log 'warmup wrong-first: xp delta 20'). Street: same pattern ui.js:279-296.
- impact: The 5/7 pass gate (ui.js:310), the 'have another go' branch (ui.js:339-344) and the baked bark_*_fail/pass clips can never trigger; every drill pays the flat 57 XP; a student who guesses by elimination is told they are 'Sharp'. Rounds, laps and 'harder' levels advance on zero demonstrated skill.
- fix: Score on first click only: on a wrong click mark the question failed, show the explanation and the correct option, then advance after 1.2s. Keep recordAnswer as is (it already logs the wrong click). Pay 6 XP per first-try correct, 15 bonus only on pass, and route < PASS to the retry branch. Play bark_*_fail there.

### [CRITICAL] gameplay-02 — Grammar bank ships raw transcript garbage as answer options (21 items)  (content-quality, effort M)
- where: public/play/src/gamedata/grammar_bank.js:1
- evidence: Scan of the 301 exercises: 21 items whose options are disfluent transcript fragments, e.g. articles_4 ['Mmm. Okay. For example, the reason is very important to a poor country', 'Mmm sentence. Okay. For example, and The reason is very important for…'], articles_30 ['Yes. Yes, you hear about the mouse control right now, the fighting.', …], verb_tense_13 ["I don't hear about it. No.", "For a living. I don't know. I don't hear about in No."], verb_tense_14/16/19 'Oh yes. We called. Make a mistake. And by not original products.', subject_verb_21/22, word_order_11/20, plurals_7/16, modals_11, word_choice_10/15/27/32, verb_tense_12/15/24/31. Live file hash equals repo (abc13ed98b92).
- impact: A paying student is asked 'Which sentence is correct?' between two pieces of nonsense; the brain doc claimed a disfluency gate rejected these. Verb tenses (41 items) is the concept most affected and is the default drill for Beatrice at the hub.
- fix: Regenerate with a hard gate in scripts/build-grammar-bank.mjs: reject any option with >1 sentence terminator, a leading 'Mmm|Oh|Yes|Okay|No.', length > 80 chars, lowercase first letter, or token-overlap < 0.5 with the answer; hand-author replacements for verb_tense to keep the pool >= 30. Add a unit test that fails the build on any of those.

### [CRITICAL] gameplay-03 — articles_36 marks the wrong sentence correct and contradicts its own explanation; it was served in the first drill  (content-quality, effort S)
- where: public/play/src/gamedata/grammar_bank.js:1
- evidence: articles_36 options ['I go to school', 'I go to the school', 'She works in office.'] answerIndex 1, explain "'I go to school' is actually correct idiomatic English for attending school; the correction changes meaning…". Probe run 3 drew it as Q1 of Conductor Clara's drill (gp.log DRILL wrong-first qs articles_36/A1/3opt; afterWrong text shows the explanation).
- impact: Teaches a Polish learner that 'I go to the school' is the correct form, exactly the error the concept is meant to fix; the explanation shown on a wrong click tells the opposite of the scoring.
- fix: Set answerIndex to 0 or delete the item; add a build-time check that any explain beginning with "'X' is (actually) correct" names the option at answerIndex.

### [CRITICAL] gameplay-04 — All progress is client-only localStorage; the account the signup wall verifies is never used to save it  (persistence, effort L)
- where: public/play/src/ui.js:169
- evidence: Keys em_xp, em_progress, em_grammar, em_fog, em_welcome, em_guide_seen, em_quality are the only persistence (grep localStorage across src). Probe: after 405 XP, a fresh context with a different sessionToken shows xp 0 / progress null, and the only API call the game makes is studentAuth:myVerification (gp.log 'fresh context xp', 'api calls made by game'). Two students on one browser share the same keys.
- impact: A student who clears storage, switches device, or shares a family laptop loses or inherits everything; no leaderboard, rank or teacher visibility is possible; the owner cannot see who plays.
- fix: Add Convex functions play:getProgress / play:saveProgress keyed by the student behind sessionToken (already sent by the gate). Load on BEGIN, merge (max laps, union done, max xp), debounce-save 2s after any write, flush on visibilitychange. Keep localStorage as offline cache namespaced by student id.

### [HIGH] gameplay-05 — Despawned street speakers are never removed from crowd.speakers: ghost markers, marker starvation and dead agents win the E prompt  (correctness, effort S)
- where: public/play/src/crowd.js:443
- evidence: crowd.despawn (crowd.js:443-458) frees the slot but never touches this.speakers; nearestSpeaker (380-389) and the marker loop (537-547, cap 24) iterate speakers unfiltered. Probe: speakers 24/live 15 at start -> 105/live 12 after 11 districts, markersDrawn pinned at 24 = markerCap; ghostsHere for uk_rp had done=true at (10,-44) while the live Wiremu Taylor at the same slot had done=false; nearestSpeaker returned the ghost and the HUD read 'Press E - Wiremu Taylor (✓ already helped)' (gp.log GHOST SPEAKERS; gp-12-ghost-slot.png).
- impact: Returning to a district you already visited shows the street local as done when they are fresh (or fresh when done), pressing E opens a dead agent's dialog and pays XP to a ghost; after ~8 districts no new street markers render at all; ghost markers float over unloaded ground.
- fix: In despawn(): `this.setSpeaker(agent, null)` and chatter.clearAgent; in nearestSpeaker skip `!this.isLive(a)`; persist street done state in em_progress[code].streetDone[slotIdx] and re-apply on populateDistrict.

### [HIGH] gameplay-06 — The hub's 55 m radius swallows the first local and two street speakers of every first-stop district  (correctness, effort S)
- where: public/play/src/zones.js:228
- evidence: regionAt returns null (hub) when hypot(x,z) < 55 (zones.js:228). For stopIdx 0 (d=62, LATERAL 26) local #0 at local (-17.4,-7.3) resolves to ~(18.7,-44.6), |p|=48; patron slots x=-17,-9 resolve to |p|=46 and 54 (zones.js:545, city-life.js:543). Probe screenshots at those spots show 'CENTRAL HUB / Metropolis Central' and the hub objective 'Round 2 - help 4 more locals here (0/4)' while talking to Mrs. Pemberton-Smythe and Wiremu Taylor of The Queen's Mile (gp-8-district-dialog.png, gp-10-street-dialog.png); journal YOUR MISSION would read Metropolis Central there.
- impact: Six districts (uk_rp, uk_cockney, us_general, us_southern, au_australian, au_broad) show the wrong name, line and round status for a third of their content; the zone-card flash fires repeatedly as the player crosses the 55 m ring.
- fix: Make regionAt a true Voronoi including the hub as a site at (0,0) with a radius weight (e.g. hub wins only if |p| < 40 AND no zone centre within 34 m), or compute district membership from the rotated district rectangle (nearEdge..farEdge x ±22).

### [HIGH] gameplay-07 — Journal per-district rows count to 2 while the round needs 3 locals  (ui-truth, effort S)
- where: public/play/src/ui.js:615
- evidence: ui.js:615 `const total = Math.min(2, z.data.npcs.length)` (every zone has 2 authored npcs); zones.js:138 teacherTotal = min(3, districtCastFor(...).length) = 3 because dialects.js:101-113 pads a third generated local. Probe roundStatus after two drills: done 2, total 3, remaining 1 (gp.log 'district round status after 2/3').
- impact: The line list shows 'R1 · 2/2' with ◔ for a district that is not complete, contradicting the objective chip '2/3'; a player hunting the last local is told there is none.
- fix: Use zoneMgr.roundStatus(code).total in the line list (one-line change) and share the same helper for mission, chip and list.

### [HIGH] gameplay-08 — Dialect and grammar are bolted together: the mandatory quest is positional generic grammar, the dialect lesson is the optional side dish  (design-coherence, effort L)
- where: public/play/src/grammar.js:30
- evidence: assignGrammar picks concept/level from stopIndex, npcIdx, line offset and laps only (grammar.js:27-33, called zones.js:571); drill text is always 'Which sentence is correct?' (ui.js:351). validIn is set on 0/301 bank items so the localValid hint (grammar.js:91, ui.js:382) never fires. The warm-up 'exercise' is the dialect item but pays once and does not complete the local (ui.js:212-244). hi-5-dialog.png: Máire Malone, Dublin fishmonger -> 'Articles (a / an / the) - 7 questions · B1'.
- impact: The premise (every district speaks its own English) is not what the player is rewarded for; 44 districts play identically apart from the greeting; the 176 authored dialect items are the thing a player can skip.
- fix: Make the district quest a 3-beat chain: overhear (3 street items) -> talk (warm-up) -> drill; skin the drill with district sentences by adding `dialect` and `validIn` tags to bank items and preferring items tagged for the district; show the concept hint (grammar.js:46, currently unused) as a one-line pre-teach; let the warm-up count as question 1 of the drill.

### [HIGH] gameplay-09 — Escape closes only the dialog and guide; journal, map, metro and welcome ignore it and stack on top of each other  (ux-rough-edge, effort S)
- where: public/play/src/ui.js:28
- evidence: ui.js:28-30 keydown Escape -> closeDialog + showGuide(false) only. Probe: journal after Escape flex, map after Escape flex, metro after Escape flex, welcome after Escape flex, guide after Escape none; journal+map both flex (gp-5-journal-plus-map.png), dialog block + journal flex (gp-6-dialog-plus-journal.png shows metro over journal); tour screenshots hi-7-journal.png / hi-8-metro.png show the map stuck over the journal with a toast bleeding through.
- impact: Players expect Esc to back out; the journal opens behind the map (z 38 < 40) and looks broken; a stuck metro overlay silently blocks E for every NPC (probe 'pressE: dialog never opened' while metro was open).
- fix: Single overlay stack in UI: openOverlay(id) closes any other; Escape pops the top; J/M/T toggle their own; block journal/map/metro while a drill is mid-session or auto-close the dialog first.

### [HIGH] gameplay-11 — Content depth cannot support the round structure: 301 items for 924 drill questions per city round, three concepts have a pool <= 10, 25% are two-option coin flips  (content-depth, effort L)
- where: public/play/src/grammar.js:73
- evidence: Bank per concept: conditionals 7, comparatives 8, pronouns 10, gerund_infinitive 11 (DRILL_N = 7, ui.js:4); 76/301 items have 2 options; 8 option sets duplicated across concepts (e.g. word_order_1 = questions_negation_1; modals_16 'I done it/I did it' filed under modals). 44 districts x 3 locals x 7 = 924 questions in round 1 alone; buildSession only prefers unseen (grammar.js:83-87) and then repeats.
- impact: A conditionals drill is the entire pool in random order every time; by the second line a student has seen every articles item; 'harder' laps redraw the same items.
- fix: Target >= 40 items per concept x level band, three parallel options each; add an authored core for conditionals/comparatives/pronouns; add item-level `dialect` tags so districts draw distinct subsets; cap repeats with a per-item cooldown in em_grammar.

### [HIGH] gameplay-15 — XP buys nothing: no level, rank, unlock, badge or leaderboard exists  (progression, effort M)
- where: public/play/src/index.html:217
- evidence: The only consumer of ui.xp is the chip text '✦ N XP' (ui.js:167-172) and the journal header (ui.js:579). No thresholds, ranks or unlock checks anywhere in src (grep for level/rank/badge returns only CEFR 'level' in grammar.js). Welcome tour page 3 says 'That's how you level up' (ui.js:91-92) but no level exists.
- impact: A student cannot say what they are working toward or how far they are; the number grows with no meaning and the onboarding promises a system that is absent.
- fix: Rank ladder driven by XP with thresholds (see opportunities), rank chip next to XP with a progress ring, rank-up fanfare distinct from round fanfare, and district stamps as collectibles.

### [MEDIUM] gameplay-10 — XP gains are never shown: the +XP toast is overwritten in the same tick, and toast sits on top of the objective chip  (reward-legibility, effort S)
- where: public/play/src/ui.js:159
- evidence: Single #toast element with clearTimeout (ui.js:159-165); finish() calls addXP (toast '+57 XP') then hooks.onCorrect -> ui.toast('✦ N more locals…') or addXP(bonus)+toast('🏆 …') in the same call stack (ui.js:330-333, main.js:449-458). Probe toast log after each of 4 drills shows only the 'N more locals' / '🏆' text, never '+57 XP' or '+35 XP'. Rects: toast [363,96,474,39] and objective [451,96,298,33] share top 96 (index.html:91,104).
- impact: The only reward feedback in the game (a number) is invisible at the moments it changes most; the round-complete toast covers the objective chip that just updated.
- fix: Queue toasts (array + 1.6s each) or render XP gains as a separate floating '+57' chip near #xp with a count-up; move #toast below the objective (top 136px).

### [MEDIUM] gameplay-12 — The level ladder is cosmetic: no C1 items exist, 13 B2, and Liberty/Sunward never leave B1 on lap 0  (progression, effort M)
- where: public/play/src/grammar.js:31
- evidence: level = LEVELS[min(4, floor(stopIndex/3) + laps)] (grammar.js:31); Isles has 9 stops (A1-B1), Liberty/Sunward 7 stops (A1-B1). Bank levels: A1 58, A2 132, B1 98, B2 13, C1 0. buildSession sorts by |levelIdx - target| so a 'C1' drill silently serves B1/A2 items while the button says '· C1' (ui.js:205). Probe: hub lap 1 gave Beatrice 'word_choice B2' where the bank has 2 B2 word_choice items.
- impact: The promised 'harder exercises' after a round are mostly the same A2/B1 pool relabelled; the CEFR label on the drill button is not truthful.
- fix: Label the drill with the level actually served (max level in the picked set) until B2/C1 content exists; author B2/C1 items or cap the ladder at B1 with 'mastery' laps that instead shrink time/retries.

### [MEDIUM] gameplay-13 — Both districts flanking a station get identical concept/level sets, and adjacent stops overlap  (progression, effort S)
- where: public/play/src/zones.js:571
- evidence: assignGrammar(z.stopIdx, i, z.lineKey, laps) (zones.js:571) uses stopIdx, which is shared by the side +1 and side -1 zones of a stop (zones.js:212-213); concept index = stopIndex*2 + npcIdx with npcIdx 0..2, so npc 2 of stop k equals npc 0 of stop k+1 (grammar.js:30).
- impact: 22 of 44 districts are grammar clones of their neighbour across the boulevard; a player riding one stop meets the same three concepts twice.
- fix: Use zoneIndex (unique 0..43) in place of stopIndex*2 and stride 3 per zone, or hand-author a concept per district in zones.json alongside its dialect.

### [MEDIUM] gameplay-14 — Street-exercise completion is not persisted; streaming a district out and back in makes the same 8 XP farmable forever  (economy, effort S)
- where: public/play/src/zones.js:670
- evidence: populateDistrict sets speaker `done: false` on every build (zones.js:662-670); main.js:429-432 sets sp.done = true in memory and recordStreetWin only increments a counter p.street that no UI reads (zones.js:679-684). Probe: after leaving and returning, liveHereDone shows Wiremu Taylor done=false again while em_progress.uk_rp.street = 1.
- impact: Riding the metro away and back (or walking 145 m) resets every street question; XP inflates without learning; the journal never shows street progress.
- fix: Store streetDone per district slot in em_progress and pass it into setSpeaker; surface 'Street: 2/3 overheard' in the journal mission block.

### [MEDIUM] gameplay-16 — No mistake review or spaced repetition: wrong answers are recorded and never resurfaced; concept hints are authored but never shown  (learning-design, effort M)
- where: public/play/src/grammar.js:83
- evidence: recordAnswer stores seen/correct/done (grammar.js:56-62); buildSession only penalises done items (+2) and otherwise randomises (83-87); no due dates, no wrong list. conceptHint (grammar.js:46) has 14 authored Polish-aware hints ('Polish has no articles…') and no caller in src.
- impact: The item a student got wrong is the one least likely to come back (it is not in done, but neither is anything else), and the one line of pre-teaching that would frame each drill is dead data.
- fix: Add em_grammar[concept].wrong = {id: {n, due}} with Leitner intervals; buildSession takes up to 2 due items first; show conceptHint under the drill button and as the first screen of the drill.

### [MEDIUM] gameplay-17 — The City goal and line completion have no payoff, and round bonuses barely escalate  (rewards, effort M)
- where: public/play/src/ui.js:594
- evidence: toggleJournal computes cleared/44 and prints ✅ when 44 (ui.js:594-600); nothing in main.js or zones.js checks city or per-line completion; the only escalating reward is bonus = 20 + 15*laps (zones.js:177), i.e. 35, 50, 65 against a flat 57 per drill.
- impact: Finishing a metro line (18 districts of work) produces no event, sound, unlock or record; the round bonus is smaller than a single drill so 'closing a round' feels like an admin state, not a win.
- fix: Line certificate on all districts of a line at laps>=1 (fanfare, journal badge, map line turns solid), city completion cinematic; bonus = 40 + 30*laps plus a first-time district stamp of 60.

### [MEDIUM] gameplay-18 — Journal mastery contradicts the drill result (50% accuracy after a '7/7 Sharp!' drill)  (reward-legibility, effort S)
- where: public/play/src/ui.js:325
- evidence: finish() reports correct/N where correct counts eventual right clicks (ui.js:325-327); recordAnswer logs the wrong clicks too, so em_grammar articles = seen 14 / correct 7 after one wrong-first drill (gp.log 'em_grammar after drill') and the journal shows 'Articles 7/39 · 50% acc' (gp-4-journal.png) against gp-drill-finish-wrongFirst.png '7/7'.
- impact: Two screens, two truths about the same seven questions; a student cannot trust either number.
- fix: Falls out of gameplay-01: score first clicks; show 'first-try 4/7' in finish and use the same figure in mastery.

### [MEDIUM] gameplay-19 — Low-power and touch devices get 1 street exercise per district instead of 3  (coverage, effort S)
- where: public/play/src/city-life.js:543
- evidence: patronSlots = lowPower ? [-7.5, 7.5] : [-17,-9,-4,4,9,17] (city-life.js:543); populateDistrict assigns exercises only to `i % 2 === 0 && taught < 3` (zones.js:659) -> slot 0 only on lowPower. lowPowerHint includes compactTouch and <=4 cores (main.js:35-41).
- impact: Phone players (the likely majority for a student audience) lose two-thirds of the dialect content the brain doc advertises as '176 street exercises'.
- fix: Decouple teaching slots from patron count: always place 3 speaker slots per district and vary only decorative patrons by tier.

### [LOW] gameplay-20 — 'Tutor Conductor' role reads as teacher framing in player-facing text  (owner-rule, effort S)
- where: public/play/src/world.js:66
- evidence: world.js:66 role 'Tutor Conductor' rendered as 'Conductor Clara — Tutor Conductor' in the dialog header (gp-1-hub-dialog.png). The ratified rule is 'locals, never teachers'; no literal 'teacher' appears, but 'Tutor' carries the same meaning.
- impact: The first NPC a new player meets is labelled as staff, undercutting the 'locals teach you how they talk' framing.
- fix: Rename to 'Station Conductor' or 'Metro Conductor'.

### [LOW] gameplay-21 — The 'Press E' prompt stays visible under open dialogs and overlays  (ux-rough-edge, effort S)
- where: public/play/src/main.js:464
- evidence: Prompt is only cleared `else if (!blocked) ui.setPrompt(null)` (main.js:464-466); with a dialog open, blocked is true so the last prompt persists. hi-5-dialog.png and hi-6-map.png show 'Press E — talk to Máire Malone ❗ exercises' bleeding through the dialog buttons and the map panel.
- impact: Text collides with the answer buttons and suggests an action that does nothing while a dialog is open.
- fix: ui.setPrompt(null) when any overlay opens; restore on close.

### [LOW] gameplay-22 — After a round closes, warm-up questions do not rotate until the district re-streams  (correctness, effort S)
- where: public/play/src/zones.js:197
- evidence: refreshTeachers reassigns n.grammar and n.done but not n.exercise (zones.js:194-199); exercise index (i + laps) is only computed at spawn (zones.js:570). Probe hub round status shows the same warm-up titles after lap 1 ('All aboard: transport words', 'Rhyme radar', …).
- impact: The toast promises 'new, harder exercises' but the dialect question is unchanged until the player leaves and returns.
- fix: Reassign n.exercise = sampleExercises[(i + laps) % len] inside refreshTeachers.

### [LOW] gameplay-23 — The just-passed local flips back to ❗ in the same frame the round closes, while the dialog still says 'helped'  (ux-rough-edge, effort S)
- where: public/play/src/zones.js:172
- evidence: recordDone resets p.d and calls refreshTeachers, which sets every local's done=false and refreshMarker (zones.js:171-199) synchronously from finish(); probe hub round status right after the 4th drill: all four npcs done=false, objective '0/4'.
- impact: The reward beat (✓ appearing) is skipped for the local who closed the round; the player sees ❗ reappear instantly and may think the drill did not register.
- fix: Defer refreshTeachers until the dialog closes (or after the fanfare), and show a per-local 'Round 2 ready' badge for 3s before the marker flips.

### [LOW] gameplay-24 — Riding the metro is a 0.48 s fade-teleport; the trains are decorative and the map click closes before it refuses  (experience, effort M)
- where: public/play/src/main.js:362
- evidence: rideTo sets player.pos and snaps the camera inside ui.fadeTravel (main.js:362-386); Trains.update only avoids people (train.js:255). Map onclick hides the panel then calls onPick, which toasts 'Walk to a station platform first' (ui.js:525-528, main.js:391-396; gp.log 'map ride off-platform').
- impact: The signature verb of the product ('ride three metro lines') has no experience attached, and a refused ride throws the player out of the map they were reading.
- fix: Keep the map open on refusal; make the ride a short boarded sequence (see opportunities).

### [LOW] gameplay-25 — Touch HUD has no help/guide button, so H is unreachable on phones  (onboarding, effort S)
- where: public/play/index.html:224
- evidence: #touch-ui contains jump/talk/metro/map/journal only (index.html:224-230); guide toggle is KeyH (input.js:96) with no pressGuide counterpart (input.js:150-154).
- impact: A phone player who skipped the tour can never reopen the controls reference.
- fix: Add a '?' touch button wired to guideToggled, or a 'How to play' row in the journal.

### [LOW] gameplay-26 — Mastery denominators are the whole bank per concept, which makes the ✅ threshold unreachable and unexplained  (reward-legibility, effort S)
- where: public/play/src/ui.js:605
- evidence: bar = correctUnique/total where total is the bank size (ui.js:604-608, grammar.js:63-70), so 'Articles 7/39', '✅' at 80% needs 32 unique correct items; the journal never explains the fraction (gp-4-journal.png).
- impact: A student sees 7/39 after a perfect drill and no path to the tick.
- fix: Show mastery as first-try accuracy over the last 20 items plus a 3-tier badge (Bronze 60%, Silver 80%, Gold 95% with >= 15 seen).

### [LOW] gameplay-27 — Only 92 of 132 district locals have a baked voice; every generated third local and every bark for 'fail' is dead audio  (content-coverage, effort M)
- where: public/play/src/zones.js:573
- evidence: voiceId = i < 2 ? `${code}_${i}` : null (zones.js:573); assets/voice has 44x2 zone files + 4 hub + 15 barks = 107 (ls). bark_*_fail can never play because drills cannot fail (gameplay-01).
- impact: One in three district locals speaks in the browser's generic TTS voice, breaking the accent premise mid-district.
- fix: Bake the third local's greeting (dialects.js:108 template) per district; once scoring is fixed the fail barks become live.

## Opportunities

### Real scoring, pass gates and a spaced-repetition review loop  (effort M, cost ~2 days; touches ui.js openDrill, grammar.js buildSession/recordAnswer, zones.json for hub review copy.)
- why: Right now no question can be failed and wrong answers vanish; a learning game needs the drill to measure something and to bring mistakes back. This is the single change that makes every other reward honest.
- how: First-click scoring (one attempt, explanation on miss, auto-advance). Pass 5/7 unlocks the local; fail sends the player to 'help another local first' with the two missed items queued. em_grammar gains wrong:{id:{n,due}} using Leitner boxes (10 min, 1 day, 4 days, 2 weeks); buildSession seeds up to 2 due items per drill. Add a Review board at the hub (Beatrice's bookshop) that serves only due items and pays double XP. Show conceptHint as the drill's first card.

### Server-side progress and a weekly leaderboard through the existing Convex session  (effort L, cost ~3 days including Convex schema + auth guard (F1/F3 anonymous-read issue noted in memory must be respected: the save must be keyed by the verified session, never by a client-supplied id).)
- why: The signup wall already proves the student and holds a sessionToken; nothing about the game reaches the server, so there is no continuity across devices, no cohort visibility, and no social ranking.
- how: Convex mutations play:save({sessionToken, xp, progress, grammar, streak}) and query play:load; client debounce 2s, flush on visibilitychange and on rideTo; merge = max laps / union done / max xp so an old device never regresses a newer one. play:leaderboard returns top 20 by weekly XP plus the caller's rank; render as a Journal tab and a rank badge in the metro hub sign. Client-only fallback if the API fails: 'Personal bests' (best session XP, longest streak) from localStorage, clearly labelled offline.

### Rank ladder, district stamps and line certificates as the visible progression track  (effort M, cost ~2 days UI + data; reuse buildLandmark meshes with emissive flip for the 'landmark lights up' beat.)
- why: XP has no meaning and the city goal has no payoff; students need a one-sentence system: 'collect a stamp in every district, earn your line certificate, climb from Newcomer to Local'.
- how: Ranks by XP: Newcomer 0, Commuter 250, Regular 700, Local 1500, Old Hand 3000, Cosmopolitan 6000 (a full round of the city at honest scoring is roughly 44x(3x~50 + 40 + 24) + line bonuses ≈ 9-10k, so Cosmopolitan lands around city completion). District stamp on first round close (+60 XP, stamp animation on the map station and a passport page in the journal, parchment allowed as an in-world prop). Line certificate when all 13/18 districts of a line are stamped (+300 XP, the map line turns solid, a certificate card in the journal). City completion +1000 and a hub statue that lights up. HUD: rank chip with a progress ring beside the XP chip; objective chip shows 'Stamp 12/44 · 2/3 locals here'.

### Per-district quest chain that puts dialect first: Overhear -> Talk -> Drill -> Stamp  (effort XL, cost ~1 week including content authoring for 44 districts.)
- why: The product promise is dialect, but the mandatory path is positional grammar with no local flavour, and the dialect items are skippable.
- how: Each district exposes three beats in the objective chip: (1) Overhear: the 3 street speakers (persist streetDone); (2) Talk: warm-up with the local whose exercise is unlocked by the overheard phrases; (3) Drill: grammar drill skinned with district sentences: add dialect/validIn tags to bank items and author 8-10 sentences per district that reuse the phrasebook (chatter.json) as carriers for the grammar point; the localValid hint finally fires. Beat completion drives the marker (❗ -> 👂 -> 💬 -> ✓) and the final beat awards the stamp. Fix regionAt so the chip always names the right district.

### Daily goal, streak and session summary  (effort M, cost ~1.5 days.)
- why: Professional learning games retain through a daily target and a summary of what was learned; the game currently ends when the tab closes with no recap.
- how: em_daily {date, xp, drills, streak}; HUD ring on the XP chip fills toward a 120 XP daily goal; on hitting it, a distinct 'Goal met' fanfare and +40 bonus. On J or after a district stamp, show a Session summary card: XP earned, first-try accuracy, 3 items to review tomorrow, dialect words learned (from street explain fields). Toast queue replaces the single #toast so every reward is seen.

### Board the tram: make 'ride the metro' an actual ride that pre-teaches the destination  (effort M, cost ~2 days; train.js positioning API + a new transit card in ui.js.)
- why: Riding three lines is the brand, yet the ride is a 0.48 s fade; a short boarded sequence turns travel time into learning time and makes the trains matter.
- how: On pick, walk-to-door (2 s), attach the player to the nearest Trains car, camera on a fixed interior mount, 5-6 s transit with fog raised; overlay an 'Arriving at The Queen's Mile' card with 3 dialect words and IPA from the district's phrasebook and the concept hint of the local you have not helped yet; doors open at the platform (train.js already has setDoors). Distances are ~42 m per stop so the visual is cheap.

### Content quality gate and authored top-up for the grammar bank  (effort M, cost ~2 days scripting + ~1 day authoring.)
- why: 21 transcript-garbage items, an inverted answer and 76 coin-flip items are what students are graded on; a build gate is the only way this stays fixed as the miner runs again.
- how: In scripts/build-grammar-bank.mjs: reject options with more than one sentence terminator, leading disfluency tokens, length > 80, lowercase initial, distractor token-overlap < 0.5 with the answer, answer named in explain that is not options[answerIndex], duplicate option sets across concepts; require 3 options. Hand-author 20 items each for conditionals, comparatives, pronouns, gerund_infinitive and B2 across concepts. Emit a QA report the deploy gate fails on.

### Unify the overlay stack and HUD truth  (effort S, cost ~1 day.)
- why: Escape, stacking, toast-over-chip, prompt bleed and the 2-vs-3 journal count are all small, but together they make the HUD feel untrustworthy at the exact moments it reports rewards.
- how: One OverlayManager (open/close/top/Escape pops), toast queue, prompt cleared on any overlay, journal rows read roundStatus, objective chip becomes the 3-beat breadcrumb, journal gets tabs Mission · Passport · Mastery · Review.

## Screenshots
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-drill-q1-wrongFirst.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-drill-wrong-wrongFirst.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-drill-finish-wrongFirst.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-1-hub-dialog.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-4-journal.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-5-journal-plus-map.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-6-dialog-plus-journal.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-7-arrived-queens-mile.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-8-district-dialog.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-9-journal-district.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-10-street-dialog.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-11-street-correct.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-12-ghost-slot.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-13-map-hover.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/hi-5-dialog.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/hi-7-journal.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/hi-8-metro.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp.log
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-result.json
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gp-probe.mjs


# LENS: graphics  (28 findings, 10 opportunities)

## Summary
The renderer has a genuinely good engine skeleton (GeoBatch merging, a one-draw-call GPU crowd, a linear half-float pipeline with dual-Kawase bloom, baked vertex AO, wet-street injection, a five-tier quality ladder) but the image it produces is far from the Abeto/Messenger ceiling and is currently broken in several visible ways. The sky dome is a 900 m sphere fixed at the origin, so on the potato and low tiers (far 620/780) there is no sky at all (pure black, sampled 0,0,0) and on high a black polygon appears above the hub when you look back from the end of a line. Every metro ride lands the player in a 5.7 m gap between two frontage buildings with the camera looking straight into a texture-less wall 2.85 m away (reproduced in all three probed districts). The lighting rig (cyan hemisphere at 1.08 plus a cyan rim directional plus a pink sun through a 4-step ramp whose darkest step is 43%) produces irradiance of roughly (0.89, 1.34, 1.46) on walls, which turns cream, terracotta and yellow district palettes into the same mint (rendered 39,96,87 / 50,134,118 / 47,139,140) and removes value contrast, which is exactly why the city reads flat. Sixty-five to ninety materials use metalness 0.76-0.9 with no environment map, so every chrome bench, rail, frame and car reads as charcoal. The composite's FXAA branch mixes 85% of an un-bloomed, un-graded resample back in, so bloom, vignette, grain and the travel flash run at 15% on medium/high/ultra while the low tier gets them at full strength (measured beacon ring 115 vs 91 mean). Contact blob shadows are sampled without a colour space, sit 3 cm under district roads and duplicate the shadow map, so they glow on the boulevard, vanish in districts and double up on the plaza. Facades are flat boxes with 3-6 cm floating window quads, no insets, no texture, dotted shadow acne on the trims and stair-stepped shadow edges even at 4096. Taken together the fix list is mostly parameter and shader work with near-zero draw-call cost, and the opportunity list below is achievable in vanilla r182.

## Strengths
- GeoBatch (materials.js:43-90) collapses whole districts into a handful of vertex-coloured meshes; a streamed district costs ~4 draw calls for its shell, streets, zebra and props.
- The GPU crowd (crowd.js) is one InstancedMesh with vertex-shader gait, packed 8-bit palettes to stay under the 16-attribute limit, and faces that read at distance; 204-340 walkers are drawn for one call plus one for blob shadows and one for markers.
- PostFX (postfx.js) is a clean hand-rolled linear pipeline: half-float scene target, 13-tap Jimenez downsample with soft-knee threshold, tent upsample, single composite with ACES, grade, vignette, grain and sRGB encode, no EffectComposer overhead.
- The wet-street injection (materials.js:258-311) is a smart, cheap answer to a night city: world-space puddle mask, grazing-angle Fresnel, per-band stable neon smears.
- Baked vertex AO at merge time (materials.js:99-130) gives ground-contact darkening for free at runtime and survives on hardware that cannot afford SSAO.
- Deterministic per-zone mulberry32 seeding (zones.js:25-38) means districts rebuild identically after streaming out and back in.
- The hero (Mixamo rig, hero.js) animates convincingly; face, hoodie and hands read well at 2.6 m (g-high-03-hub-horizon.png), and wrist over-rotation is clamped.
- Canvas-textured signage (media.js, buildStationSign) with SRGBColorSpace set and anisotropy 4 stays legible and native to the world; station names and campaign screens are readable in every shot.
- The quality ladder (quality.js) has hysteresis, a manual override that stops auto-adaptation, and a nested render-scale controller for short spikes.
- Shadow frustum follows the player and attempts texel snapping (main.js:124-131); shadow bias/normalBias are set rather than left default.

## Findings (by severity)

### [CRITICAL] graphics-01 — Sky dome is clipped by camera.far: black sky on potato/low, black polygon in the sky on high  (sky-atmosphere, effort S)
- where: public/play/src/materials.js:315
- evidence: materials.js:315 `new THREE.SphereGeometry(900, 24, 16)` added at origin (main.js:120, never re-centred on the camera); quality.js:17 potato `far: 620`, :24 low `far: 780`, :38 high `far: 1200`. Potato hub shot g-potato-03-hub-horizon.png: sky pixel (720,60) = (0,0,0); low g-low-02-hub-raw.png and g-low-19-endofline-lookback.png also solid black sky. High tier at the last Isles stop looking back: g-high-19-endofline-lookback.png shows a black hexagonal void above the hub, pixel (720,250) = (3,3,3) vs sky (10,24,80); ultra (far 1300) g-ultra-19 has no hole (900 + 356 m stop distance = 1256 < 1300).
- impact: Every weak device (detectTier sends WEAK_GPU phones to potato and low) plays under a solid black sky with the pink-horizon shader never visible; on the default desktop tier the sky tears open at the end of every line.
- fix: Re-centre the dome on the camera each frame (sky.position.copy(camera.position)) and shrink it to ~0.8*camera.far, or render it with depthTest off / camera-space projection (set gl_Position.z = gl_Position.w) so it is never far-clipped; keep fog:false.

### [HIGH] graphics-02 — Metro arrival frames a texture-less wall in every district  (camera-framing, effort S)
- where: public/play/src/main.js:369
- evidence: main.js:369-374 places the player at 46% from stopPos to center (local z = -26 + 0.46*26 = -14.0) with camera yaw along the line. zones.js:409 frontage row z = nearEdge + 6.2 = -12.3, d 7.4 (spans -16.0..-8.6), columns at x = -5.6 and 5.6 with w 5.5 (zones.js:413-418), so the player stands in the 5.7 m gap and the camera looks along ±x into the neighbour 2.85 m away. Screenshots: g-high-09-district-0-arrival.png, g-high-12-district-15-arrival.png, g-high-15-district-30-arrival.png and the earlier tour's hi-3-district-0.png all show a flat wall filling 60-90% of the frame.
- impact: The first image of every one of 44 districts, the moment the game should sell 'a new neighbourhood', is a blank box; the station sign, shopfronts and locals are off-screen.
- fix: Arrive on the platform side of the sidewalk ring (local z ≈ nearEdge - 1.5) facing +z into the district with the camera pulled back along -z toward the boulevard, and add an arrival dolly (2 s yaw sweep from the sign to the shopfront row) using FollowCamera.snap plus a scripted yaw lerp.

### [HIGH] graphics-03 — Lighting rig is cyan-dominant with a 43% ramp floor: flat shading and all 44 palettes converge on mint  (lighting, effort M)
- where: public/play/src/main.js:101
- evidence: main.js:101 HemisphereLight(0x8fdcff, 0x28183f, 1.08), :103 DirectionalLight(0xff9b9f, 1.52), :117 rim DirectionalLight(0x55f2e9, 0.82). materials.js:16 ramp [110,160,215,255] with r182 `coord = dotNL*0.5+0.5` (three.module.js:378) means a face pointing away from the sun still receives 110/255 = 43% of direct light. Wall irradiance ≈ (0.89, 1.34, 1.46) linear. Authored palettes (zones.json): uk_rp primary #F4E8CE cream, ie_dublin #C77052 terracotta, ca_newfoundland #E9B44C yellow; rendered walls sampled in g-high-10 (39,96,87), g-high-13 (50,134,118), g-high-16 (47,139,140). Language Academy albedo mean (223,222,198) renders mint in g-high-05-hero-close.png. Luminance stats g-high-02-hub-raw.png: median 43/255, 1.2% of pixels above 200.
- impact: This is the direct answer to 'why does it look flat': there is no dark side, both fill lights are the same hue, and the district identity (the product premise) is erased by the light colour. Contradicts the 07-25 note that the palette collapse was fixed.
- fix: Warm-white key sun (~0xffe2c4, 2.0) at 40-50° elevation; hemisphere down to ~0.35 with a warm ground colour; delete the cyan rim directional and replace it with a view-dependent Fresnel rim injected once into a shared toon onBeforeCompile; ramp with a real shadow step (e.g. [55,120,200,255]) stored as an RGB texture so the shadow step can be tinted violet rather than just darker.

### [HIGH] graphics-04 — 65-90 metallic MeshStandardMaterials with no environment map render as charcoal  (materials, effort S)
- where: public/play/src/world.js:14
- evidence: world.js:14 STREET_CHROME metalness 0.84; :410 chromeMat 0.86; zones.js:956 metal 0.76, :1048 chrome 0.86; media.js:48/:123 frames 0.88/0.9; train.js:25 trimMat 0.82; traffic.js:124 chromeMat 0.88, :119 bodyMat 0.54; city-life.js:155 beaconChrome 0.9. scene.environment is never set (grep 'environment|envMap|PMREM' returns nothing); probe metrics `sceneEnvironment:false, metallicNoEnv: 65` at hub (high), 85-90 with a district loaded. g-high-06-chrome-bench.png: cart shelf and bench seats are flat black slabs; g-high-21-train-close.png: 'chrome' roof and trim read as dark teal; g-high-20: cars are black boxes.
- impact: In PBR, metalness removes diffuse and relies on reflected environment; with none, every 'chrome' accent the art direction leans on (benches, rails, frames, tram trim, bollards, cars) becomes a dark hole instead of a highlight.
- fix: Build one PMREM from the procedural sky (PMREMGenerator.fromScene on a small scene containing makeSky(), ~2 ms once) and set scene.environment with environmentIntensity ~0.6, or drop metalness to ≤0.2 and express chrome as a toon material with a light colour and a specular step.

### [HIGH] graphics-05 — FXAA branch dilutes bloom, vignette, grain and travel flash to 15% on medium/high/ultra  (postfx, effort S)
- where: public/play/src/postfx.js:175
- evidence: postfx.js:155-176 recomputes `aa` from tScene with aces+toSRGB only (no bloom, no grade tints, no vignette, no grain, no uFlash) then `col = mix(col, aa + bloom * uBloom * 0.0, 0.85)`. quality.js: aa 'fxaa' on medium/high/ultra, 'none' on low. Measured beacon-ring mean in hub-raw: low (115,89,108) vs high (91,92,112) vs ultra (91,91,111); flat-road grain stddev low 5.87 vs high 1.55.
- impact: The tiers are inverted: the cheapest post tier is the bloomiest and grainiest, while the tiers the art was tuned on show ~12% effective bloom (0.82*0.15) and ~5% vignette; neon never 'glows' where most players see it.
- fix: Run FXAA on the graded image by sampling a single post-grade buffer, or apply FXAA to the linear scene first and then add bloom/grade/vignette/grain once; at minimum move bloom addition and grade after the mix.

### [HIGH] graphics-06 — Blob contact shadows glow on dark asphalt, vanish under district roads, and double the shadow map  (shadows, effort S)
- where: public/play/src/materials.js:357
- evidence: materials.js:357-369 CanvasTexture rgba(4,9,24) with no colorSpace (follow-up probe: blob.material.map.colorSpace === '') sampled as linear (0.016,0.035,0.094) is brighter than the lit boulevard road 0x10172b; blobShadow y = 0.02 (:380) while district ROAD_Y = 0.052 (zones.js:332). g-high-19/g-high-20 and g-potato-19: bright disc under the hero, pixel (700,655) = (159,178,198) vs road (4,7,24). fu-A1-street-with-blob.png vs fu-A2-street-no-blob.png on a district street are pixel-identical (blob culled). g-high-04-hub-skyup.png shows both the dark blob and the PCF shadow under the hero on the plaza. Same construction in crowd.js:284-295 and citizens.js:181.
- impact: The hero appears to stand on a light puddle on every boulevard, has no grounding at all inside districts, and carries two shadows on the plaza.
- fix: Set tex.colorSpace = SRGBColorSpace on the blob canvases, raise the quad to groundY + 0.06 (or sample the surface height per district), and hide blob shadows whenever the tier has shadow maps enabled (applyQuality already knows s.shadows).

### [HIGH] graphics-07 — Facades are texture-less boxes with floating window quads: the 'box city' the owner named as the anti-goal  (facade-detail, effort L)
- where: public/play/src/zones.js:751
- evidence: zones.js:751-753 windows are PlaneGeometry quads placed 0.03/0.06 m in front of the wall with a flat 0x101a2b pane (:937); walls are single-colour BoxGeometry (:793); no texture, no reveal, no interior. g-high-09/10/13 and g-low-10: black rectangles on flat two-tone walls; hub towers world.js:411-433 are boxes with neon window slabs; suburbs world.js:1066-1076 same.
- impact: At the distances the camera actually sits (2-8 m) the entire built environment is flat colour fields; nothing reads as hand-crafted.
- fix: Recess windows as real geometry (dark inset box 0.25 m into the wall plus a protruding frame) inside the same GeoBatch (zero extra calls); add a procedural facade shader on the shell material (brick/plaster noise, floor bands, grime gradient) and an interior-mapping trick on paneLit for parallax rooms; put rooftop furniture (tanks, AC, aerials) and shop signage textures from the district phrasebook in the batch.

### [MEDIUM] graphics-08 — Registered neon is boosted 2.15x but screens, tickers, street neon, headlights, markers and lit panes are not: emissive hierarchy is inconsistent  (postfx, effort S)
- where: public/play/src/materials.js:139
- evidence: materials.js:139-163 NEON_REGISTRY only covers neonMat(); main.js:88 setNeonGain(2.15). Not registered: media.js:116-122 campaign/ticker/rooftop MeshBasicMaterial toneMapped:false; city-life.js:526-528 street neon, :457-458 head/tail lights; traffic.js:126-127; crowd.js:354 markers; zones.js:931-933 litMat emissiveIntensity 1.08. With postfx on, renderer.toneMapping = NoToneMapping (postfx.js:247) so toneMapped:false is inert and these all pass through ACES at ≤1.0. Probe: 99 materials with toneMapped:false. g-high-08-hub-media-facade.png: campaign screens read dull grey-blue next to glowing strips.
- impact: The Times-Square intent fails: the biggest emissive surfaces in the hub are the dullest, and only thin strips bloom.
- fix: Route every emissive material through the registry (or a shared `emissiveGain` uniform) so gain applies uniformly; author screens at ~1.6, lit windows at ~1.3, neon at ~2.2 so bloom threshold 0.78 catches them in that order.

### [MEDIUM] graphics-09 — Fog colour does not match the sky horizon; world edge and hard horizon line visible  (sky-atmosphere, effort S)
- where: public/play/src/main.js:60
- evidence: main.js:60 FogExp2(0x10172f) navy; materials.js:323 botColor 0xff668d pink plus horizon glow (:342-343), sky fog:false. g-high-22-parkland-suburbs.png: flat green terrain meets a saturated pink band with a hard edge and no haze; g-high-20-endofline-outward.png: boulevard terminates into pink void; g-high-03: distant towers fade to navy silhouettes against pink.
- impact: Distance reads as cut-out silhouettes instead of atmosphere; the edge of the world is visible from the last stop.
- fix: Drive fog colour from the same horizon uniform as the sky (sample sky colour at vDir.y = 0) and add height fog in the toon onBeforeCompile (density falls with world y) so towers stay crisp while streets haze; pull the terrain SIZE beyond far/2 or fade to sky with a horizon plane.

### [MEDIUM] graphics-10 — Shadow acne on facade trims and stair-stepped shadow edges even at 4096  (shadows, effort M)
- where: public/play/src/main.js:111
- evidence: main.js:111-115 single 76 m ortho frustum (S=38), bias -0.0004, normalBias 0.02, PCFSoftShadowMap; zones.js:751 trim quads 3 cm off the wall. g-high-09-district-0-arrival.png and hi-3-district-0.png: dotted moiré across window trims and sills; g-high-22: dotted pattern on red pitched roofs; g-high-11-district-0-facade.png and g-high-16: hero shadow with ~10 px stair steps; g-ultra-11-district-0-facade.png: sawtooth along the kerb shadow at 4096.
- impact: Shadows, the main cue for softness in the Messenger look, read as noise and jaggies close to the player.
- fix: Two cascades (0-22 m at 2048, 22-90 m at 2048) via three's CSM addon (vendor from r182 addons, no npm) or two DirectionalLights with separate frusta; raise normalBias to ~0.05 for the thin quads; snap in light space (see graphics-24); consider VSM for soft penumbra.

### [MEDIUM] graphics-11 — Quest NPC bodies pop out at 44 m while their markers stay; districts pop in at 74% fog visibility  (lod-pops, effort M)
- where: public/play/src/world.js:1292
- evidence: world.js:1292-1302 DRAW_RANGE 44 m hard toggle of model.visible; follow-up probe: 42 m visible:true, 46 m visible:false with markerVisible:true (fu-D-npc-42m.png / fu-D-npc-46m.png). Fog 0.0052 gives exp(-(0.0052*44)^2) = 0.95 visibility at 44 m. zones.js:246 buildChunk at buildRadius 105 m where visibility is exp(-(0.0052*105)^2) = 0.74.
- impact: Locals appear and disappear in plain sight; whole blocks with signs and three NPCs materialise at three-quarters visibility.
- fix: Cross-fade NPC materials over 6 m (transparent + opacity lerp, or dither) and swap to a crowd-slot proxy beyond; build chunks at 130 m (or raise fog to make 105 m ≤ 0.5 visibility) and fade the shell in via a per-chunk opacity uniform over 0.6 s.

### [MEDIUM] graphics-12 — Camera cannot look up: pitch clamped to -0.15 rad  (camera-framing, effort S)
- where: public/play/src/player.js:256
- evidence: player.js:256 `clamp(this.pitch + mouse.dy * 0.0022, -0.15, 1.15)`; skyline crowns at 24-78 m (world.js:853), clouds at 105-190 m (materials.js:404), rooftop signs (media.js:165-170). No probe shot at any pitch shows more than the bottom third of the towers; g-high-04 at pitch 1.1 is top-down.
- impact: Half of the authored city (skyline, rooftop signage, clouds, sun disc) is effectively never on screen; the world feels like a corridor.
- fix: Allow pitch to about -0.75 rad with the spring arm shortening as the camera drops, plus an auto-tilt when the player stands still for 3 s.

### [MEDIUM] graphics-13 — No anti-aliasing on the low tier or on desktop potato fallback  (aliasing, effort S)
- where: public/play/src/main.js:46
- evidence: main.js:46 `antialias: lowPowerHint || compactTouch` fixed at context creation; quality.js:22 low: postfx true, aa 'none'; postfx.js:271 sceneRT `samples: 0`. Probe metrics on all desktop tiers: `contextAA:false`. g-low-10-district-0-shopfront.png: hard jagged edges on every kerb and window plus grain stddev 5.87.
- impact: The tier meant for weak laptops has the worst edges in the ladder; a desktop that drops to potato at runtime also loses AA because the context flag cannot change.
- fix: Give sceneRT `samples: 4` on low (MSAA in the RT is cheap at 0.25 bloom scale) or enable FXAA there; create the context with antialias:true always and let the tier decide the RT samples.

### [MEDIUM] graphics-14 — Skyline dusk windows are world-aligned so they shear across randomly rotated towers  (materials, effort S)
- where: public/play/src/materials.js:230
- evidence: materials.js:230 `grid = vec2((vEmWorldPos.x + vEmWorldPos.z) * 0.55, y * 0.42)`; world.js:829 towers get `Q.setFromAxisAngle(Y, Math.random() * PI)`. g-high-08-hub-media-facade.png and g-high-05-hero-close.png: diagonal streaks of pink/cyan dots on the dark towers instead of aligned window grids.
- impact: Background towers read as glitchy static rather than lit offices.
- fix: Build the grid in object space (pass instance-local position from the vertex stage and scale by the instance's box size from instanceMatrix columns) or pick x vs z by the dominant normal axis.

### [MEDIUM] graphics-15 — Quest '!' / '✓' markers use Georgia serif with a brown parchment outline  (design-system, effort S)
- where: public/play/src/markers.js:17
- evidence: markers.js:17 `ctx.font = '900 84px Georgia, serif'`, :22 stroke 'rgba(42,30,18,0.95)', :32 fill '#ffb84d'. Owner rule (EM-Play-World-Launch.md): game UI follows v3 (Space Grotesk, violet glass), parchment only for in-world props. Visible in g-high-07-hub-local-close.png and g-high-18-district-local-close.png.
- impact: The most-seen HUD affordance in the world is still in the retired parchment style and clashes with the v3 speech bubbles next to it.
- fix: Redraw the glyph in Space Grotesk 700 with a violet-glass disc and brand-gradient fill; set the CanvasTexture colorSpace to SRGB.

### [MEDIUM] graphics-16 — Synchronous district build on the main thread: ~30 ms JS per chunk plus first-frame upload/compile stall  (streaming, effort M)
- where: public/play/src/zones.js:246
- evidence: zones.js:246 buildChunk runs inside ZoneManager.update in simTick; follow-up probe: building 10 chunks took 300.5 ms JS (≈30 ms each) and the first rendered frame after took 7680 ms under SwiftShader (shader compile + geometry upload); programs count 100-103 shader programs.
- impact: A visible hitch every time a district streams in while walking or riding, worst on the phones that need the ladder.
- fix: Spread buildChunk over frames (build shell one frame, streets next, NPCs next), pre-warm the ~6 shared programs at load with renderer.compile, and upload geometry via renderer.initTexture/compile before adding to the scene.

### [MEDIUM] graphics-21 — Ground is the largest screen area and has no surface language  (ground-shading, effort M)
- where: public/play/src/terrain.js:51
- evidence: terrain.js:51-76 flat vertex colours, no texture/normal; world.js:306 plaza is a single-colour CircleGeometry; zones.js:295 district ground one lerped colour; kerbs are flat planes at y 0.02-0.034. Luminance stats: 40% of the g-high-05 bottom band below 40/255; g-high-22-parkland-suburbs.png is a flat green field.
- impact: Half of every frame is featureless navy or green; the Messenger look depends on ground that shows paving, grass tufts and light.
- fix: Procedural paving in the street shader (grout lines from fract(worldPos.xz), per-slab tint hash, wear gradient at kerbs), real 12 cm kerb boxes in the same batch, grass/flower instanced detail on parkland (InstancedMesh of a 2-quad tuft, ~4k instances, 1 call).

### [LOW] graphics-17 — Vignette is applied twice (CSS overlay plus composite) on post tiers  (postfx, effort S)
- where: public/play/index.html:197
- evidence: index.html:197-200 `#grade` radial-gradient to rgba(4,7,23,0.46) at the corners over the canvas; postfx.js:145 `col *= 1.0 - uVignette * smoothstep(0.15, 0.72, r2)` with uVignette 0.34 (:214). Compare g-high-01-hub-hud.png (with #grade) vs g-high-02-hub-raw.png (hidden).
- impact: Corners are crushed on high tiers and the CSS layer also tints the HUD region.
- fix: Remove the CSS gradient when postfx is enabled (toggle a body class from applyQuality).

### [LOW] graphics-18 — Canvas textures for bubbles, markers and blob shadows have no colorSpace, so they render lighter than authored  (colour-management, effort S)
- where: public/play/src/citizens.js:107
- evidence: citizens.js:107-108, chatter.js:79-82, markers.js:26-28, materials.js:367, crowd.js:293 create CanvasTexture without `colorSpace = SRGBColorSpace`; media.js:66 and zones.js:1009 do set it. Follow-up probe confirms blob map colorSpace ''.
- impact: Bubble text (#1b1030) and marker outlines lose contrast; this is also the root of the glowing blob (graphics-06).
- fix: Set colorSpace = THREE.SRGBColorSpace on every canvas texture at creation.

### [LOW] graphics-19 — District locals' hat props float above their heads  (character, effort S)
- where: public/play/src/zones.js:57
- evidence: zones.js:57-70 signature props authored at fixed y 2.02-2.2 while bodies are un-normalised Meshy rigs. Follow-up probe measured bodyTop vs prop min y: Mrs. Pemberton-Smythe 1.783 vs 1.904 (gap +0.12 m), Theo Mercer 1.884 vs 2.011 (+0.127 m); g-high-18-district-local-close.png shows a dark disc hovering above the local's head.
- impact: A third of sampled locals wear a levitating hat, breaking the character read at talk distance.
- fix: Compute the body bounding box after instanceRig and place the prop at bodyTop - 0.03; parent the hat to the neck bone.

### [LOW] graphics-20 — Clouds are grey icosahedron blobs; dust motes are sub-pixel  (atmosphere, effort S)
- where: public/play/src/materials.js:386
- evidence: materials.js:386-396 IcosahedronGeometry(1,1) MeshToon 0x8b8eb7 opacity 0.72 at 105-190 m; g-high-03-hub-horizon.png and g-high-19 show a faceted grey rock in the sky. materials.js:440 PointsMaterial size 0.06 with sizeAttenuation and no map; motes are not discernible in any hub shot.
- impact: The two 'painterly atmosphere' elements either read as debris or are invisible.
- fix: Cloud billboards: 3-4 layered soft alpha sprites (procedural canvas) per cluster with additive rim and slow parallax; motes as a Points cloud with a soft radial map, size 0.18-0.3, AdditiveBlending, 1 draw call each.

### [LOW] graphics-22 — Grain is un-filtered on low and on mobile medium  (postfx, effort S)
- where: public/play/src/postfx.js:148
- evidence: postfx.js:148-149 grain 0.032 at uv*1024 per frame; low has no FXAA to soften it. Flat road patch luminance stddev: potato 0.0, low 5.87, high 1.55. g-low-10 and g-mob-10-district-0-shopfront.png show visible speckle over walls.
- impact: Small screens and the low tier look dirty rather than filmic.
- fix: Scale grain by tier (0.012 on low/mobile) and use a blue-noise texture instead of white hash.

### [LOW] graphics-23 — Wet-street shader applies only to district streets, not the hub or boulevards  (materials, effort S)
- where: public/play/src/zones.js:437
- evidence: zones.js:437 `if (this.quality?.wetStreets) addWetStreets(streetMat)` on the district batch only; world.js:337-339 boulevard road/walk use plain toonMat; world.js:306 plaza plain. g-high-02 plaza vs g-high-16 district road show different ground finish.
- impact: The signature night-city look switches on and off at district borders.
- fix: Apply addWetStreets to the boulevard road and plaza materials too (they are already separate materials, zero extra draws).

### [LOW] graphics-24 — Shadow texel snapping is done in world XZ, not light space, so edges still shimmer  (shadows, effort S)
- where: public/play/src/main.js:126
- evidence: main.js:126-130 rounds playerPos.x/z to `texel = 2S / mapSize` and moves both target and light; the light is tilted (36 up over 69.4 horizontal), so world-XZ steps are not integer multiples of the ortho camera's texel grid.
- impact: Shadow edges crawl as the player walks even though snapping was intended.
- fix: Transform the desired target into the shadow camera's view space, round to texel there, and transform back (standard CSM snapping), or use the CSM addon which does this.

### [LOW] graphics-25 — Ground layers separated by 2-5 mm risk z-fighting beyond ~50 m  (z-fighting, effort S)
- where: public/play/src/world.js:345
- evidence: world.js:345-353 road y 0.015, walk 0.018, dashes 0.019, curb 0.02, zebra 0.02; camera near 0.1 far 1200 (main.js:62). 24-bit depth precision at 60 m with near 0.1 is roughly 2-4 mm, equal to the layer gaps. Not captured in a still; predicted by depth math (PLAUSIBLE).
- impact: Distant lane paint and kerbs flicker on some GPUs.
- fix: Raise near to 0.3 and use logarithmic depth or 8-10 mm layer offsets; or bake paint as vertex colour on the road mesh like the district batch does.

### [LOW] graphics-26 — Sky sun disc and shadow-casting sun disagree by ~17° elevation and in colour  (lighting, effort S)
- where: public/play/src/materials.js:324
- evidence: materials.js:324 sunDir (-0.48,0.18,-0.8) → 10° elevation, colour 0xffd2c2; main.js:104 sun position (-38,36,-58) → 27° elevation, colour 0xff9b9f.
- impact: Shadows do not point away from the visible sun; small but exactly the kind of coherence the Abeto look has.
- fix: Derive both from one sun vector/colour uniform and drive it from a time-of-day value.

### [LOW] graphics-27 — High-tier hub costs 454 draw calls / 1.48 M triangles for the look delivered  (budget, effort M)
- where: public/play/src/quality.js:36
- evidence: Follow-up probe (renderer.info with autoReset off across the full post stack): hub 454 calls, 1,481,157 triangles, 101 programs; district 288 calls, 1.15 M tris; ultra hub 531 calls, 1.66 M tris. EM-Play-Renderer-Rebuild.md claimed 373 at high on 07-25. 35 skinned meshes at hub.
- impact: Budget has drifted up ~20% since the rebuild while the image stayed flat; every upgrade below must be paid from this.
- fix: Merge the 7-8 traffic fleets into one InstancedMesh per part, decimate the 25k-tri Meshy NPCs (open question in the rebuild doc), and share programs by unifying the toon onBeforeCompile variants.

### [LOW] graphics-28 — Palm leaves are 3-sided cones and park trees are icosahedra  (vegetation, effort M)
- where: public/play/src/world.js:534
- evidence: world.js:534 ConeGeometry(0.18, 2.7, 3) leaves; :873 and :1245 IcosahedronGeometry canopies. g-high-06-chrome-bench.png shows spiky green triangles on the palms; g-high-22 shows faceted blob trees.
- impact: Vegetation is where 'lush' lives in the reference; here it reads as low-poly placeholders.
- fix: Multi-lobe canopies (4-6 spheres merged with normals re-pointed from the tree centre for soft toon shading) plus 2-quad leaf cards with a procedural alpha texture; keep the existing wind sway.

## Opportunities

### Relight to a warm key / cool fill with a tinted shadow ramp (the single biggest move toward Messenger)  (effort M, cost 0 draw calls, ~4 ALU per fragment; one shared program variant)
- why: Finding graphics-03 shows the current rig erases value contrast and palette; Abeto's look is warm light, cool violet shadows, saturated-but-harmonious mid-tones.
- how: main.js:101-119: sun 0xffe2c4 @ 2.0 at ~45° elevation, hemi 0.35 with sky 0xa9c8ff / ground 0x6b4a3a, remove the rim DirectionalLight. materials.js:16: ramp as a 4x1 RGB DataTexture with steps [(0.28,0.24,0.42),(0.62,0.6,0.7),(0.9,0.88,0.9),(1,1,1)] and read .rgb in a patched getGradientIrradiance via onBeforeCompile on a shared toon factory; add a Fresnel rim term (pow(1-NdotV, 3) * 0.35 * skyColour) in the same hook so hero, NPCs and buildings all get it.

### Depth/normal Sobel outline pass folded into the existing composite  (effort M, cost 0 extra draw calls, ~0.3-0.5 ms at 1080p, +8 texture taps in the composite)
- why: Thick readable silhouettes are the Messenger signature and the cheapest way to make procedural boxes look hand-drawn.
- how: postfx.js:263-273: add `depthTexture: new THREE.DepthTexture(w,h)` to sceneRT (zero extra pass), reconstruct linear depth in COMPOSITE_FRAG, Sobel over depth plus a cheap normal-from-depth estimate, darken by a distance-scaled line width (2 px near, 1 px far) with the line colour taken from a darkened version of the local pixel rather than black.

### Sky dome with sun, time-of-day and a matched height-fog  (effort M, cost 0 draw calls, ~6 ALU per fragment)
- why: Fixes graphics-01/-09/-26 and gives the world a mood arc (dusk on arrival, night in the far districts) instead of one static gradient.
- how: materials.js makeSky: camera-following dome or gl_Position.z=w trick; one `uSun` vec3 + `uTime` drives sky gradient, sun disc, DirectionalLight direction/colour, hemisphere colours and scene.fog.color (sampled at horizon). Height fog in the shared toon hook: `fogFactor *= exp(-max(worldY-2,0)*0.06)`.

### Two-cascade shadows with light-space snapping and a soft filter  (effort M, cost +1 shadow pass (~1-2 ms on integrated GPU at 2048), +1 shadow map texture)
- why: Finding graphics-10: one 76 m cascade gives 3.7 cm texels near the player and acne on thin quads; soft, stable shadows are what makes the reference feel painterly.
- how: Vendor three r182 addons/csm (CSM.js, CSMFrustum.js, CSMShadow) into public/vendor/three/addons (part of three, no npm); 2 cascades (0-22 m, 22-90 m) at 2048 each, `fade: true`, normalBias 0.04; or hand-roll two DirectionalLights with snapping done in light view space.

### Projected cloud shadows and foliage-driven light dapple  (effort S, cost 0 draw calls, ~12 ALU per fragment)
- why: Cloud shadows moving over streets are the most recognisable Messenger motion cue and cost almost nothing.
- how: Shared toon onBeforeCompile: `float cloud = noise(worldPos.xz * 0.008 + uTime * vec2(0.012, 0.007))`; multiply directLight by `mix(0.55, 1.0, smoothstep(0.35, 0.65, cloud))`; reuse the emNoise already in addWetStreets.

### Facade upgrade: inset windows, interior mapping, rooftop furniture, phrasebook signage  (effort L, cost +0 to +1 draw call per district (signage atlas), +~4k triangles per district)
- why: Finding graphics-07: the built environment is the box city the owner rejected; districts must look distinct at 2-8 m.
- how: zones.js buildFacadeBlock: replace `quad(B.paneDark…)` with an inset box 0.25 m into the wall plus a 0.08 m frame (same GeoBatch); paneLit gets an interior-mapping fragment (room grid from fract(uv*rooms), random warm colour, depth parallax from view vector) ~25 ALU; add per-archetype roof props (tanks, AC, aerials, parapet lights) and one canvas signage texture per shop using zones.json phrases (Space Grotesk) via an atlas so it stays one material.

### Ground language: procedural paving, real kerbs, detail-prop instancing  (effort M, cost +2 draw calls total, ~20 ALU on ground fragments, ~16k triangles)
- why: Finding graphics-21: the ground is 40-50% of every frame and currently a flat colour.
- how: Extend addWetStreets into a full street shader: slab grid `fract(worldPos.xz / 1.2)` grout darkening, per-slab hash tint ±6%, kerb-side wear gradient; 12 cm kerb BoxGeometry in the district batch; parkland gets an InstancedMesh of 2-quad grass tufts (4k instances, wind from addWindSway) and flower dots.

### Half-resolution SSAO/GTAO from the existing depth buffer, blended with the baked vertex AO  (effort M, cost +2 half-res passes (~1.5-2.5 ms at 1080p on integrated GPU), gate to high/ultra)
- why: Contact darkening under props, at wall bases and between crowd feet is what separates 'placed objects' from 'a place'; the vertex bake cannot reach dynamic objects.
- how: postfx.js: with the sceneRT DepthTexture (from the outline pass) run an 8-sample hemisphere AO at 0.5x into a new RT, 4-tap blur, multiply into the composite before bloom. Alternatively vendor addons/postprocessing/GTAOPass and drive it from the same depth.

### Better bloom/grade pipeline order and exposure-aware threshold  (effort S, cost 0 extra passes, small ALU change)
- why: Finding graphics-05/-08: bloom is diluted on the main tiers and the emissive hierarchy is inconsistent; a correct order makes neon glow and screens read.
- how: postfx.js: FXAA the linear scene first (or after grade on one buffer), then bloom (threshold applied after exposure), then grade, vignette, grain, flash, encode; single `uEmissiveGain` shared by all emissive materials; add a subtle warm highlight tint and a 3x3 dither before sRGB.

### Motion quality: crowd variety, NPC LOD cross-fade, arrival dolly  (effort M, cost 0 draw calls; NPC fade requires transparent sorting for ~3 meshes during the fade)
- why: Pops (graphics-11), identical gaits, and the wall-facing arrival (graphics-02) undercut the sense of a living city more than any texture would.
- how: crowd.js vertex shader: per-instance arm-swing amplitude, stride length and a 'phone' pose from aGait.w bits; head yaw toward the player within 6 m (one uniform). world.js:1292: 6 m opacity cross-fade using a shared `uFade` per NPC material, then swap to a crowd proxy slot. main.js rideTo: scripted 2 s yaw/pitch sweep from station sign to shopfront row.

## Screenshots
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-01-hub-hud.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-02-hub-raw.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-03-hub-horizon.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-04-hub-skyup.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-05-hero-close.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-06-chrome-bench.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-07-hub-local-close.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-08-hub-media-facade.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-09-district-0-arrival.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-10-district-0-shopfront.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-11-district-0-facade.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-12-district-15-arrival.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-13-district-15-shopfront.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-15-district-30-arrival.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-16-district-30-shopfront.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-18-district-local-close.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-19-endofline-lookback.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-20-endofline-outward.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-21-train-close.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-22-parkland-suburbs.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-potato-02-hub-raw.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-potato-03-hub-horizon.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-potato-10-district-0-shopfront.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-potato-19-endofline-lookback.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-low-02-hub-raw.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-low-10-district-0-shopfront.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-low-19-endofline-lookback.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-ultra-02-hub-raw.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-ultra-11-district-0-facade.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-ultra-19-endofline-lookback.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-mob-02-hub-raw.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-mob-10-district-0-shopfront.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/fu-A1-street-with-blob.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/fu-A2-street-no-blob.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/fu-D-npc-42m.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/fu-D-npc-46m.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/language_academy-tex.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-high-metrics.json
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-potato-metrics.json
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-ultra-metrics.json
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/g-low-metrics.json
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/fu-results.json
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gfx-probe.mjs
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gfx-followup.mjs


# LENS: content  (32 findings, 9 opportunities)

## Summary
The dialect layer of English Metropolis is the real asset: 44 districts with authentic regional lexis (bostin, dreich, haar, mauzy, bunny chow, koesister, doubles, cou-cou), 176 street exercises that each teach one real word with a correct one-line explanation, and Polish-contrastive explanations on 94 of 301 grammar items. The grammar drill that carries the quest loop, however, is broken at three levels. Mechanically, a drill cannot be failed: ui.js counts a question correct whenever the right button is eventually clicked, so clicking every wrong option first still produced "You scored 7/7" and +57 XP in the live probe (content-04-drill-result.png), the pass threshold and fail bark are unreachable, and mastery marks guessed items as mastered. Content-wise, the bank is polluted: two items have an inverted answer key ("I go to the school" marked correct), roughly 18 items mark perfectly good English as wrong, about 40 items are raw lesson-transcript fragments complete with real first names and "Truskovsky"/"Britney" chit-chat, 9 explanations are pipeline meta-commentary ("This entry's suggested correction is incorrect"), 9 are placeholders, and 38 items share a correct sentence with another concept so one 7-question drill served "He is an engineer" twice. Structurally, the concept ladder promises B2/C1 but the bank has 13 B2 and zero C1 items, conditionals has exactly 7 items so a "fresh set" is the same set, both districts at a station receive identical concept/level assignments, and the only mechanic that ties grammar to dialect (validIn/localValid) is dead because no item carries the field. Presentation issues compound this: 85% of street answers sit at option 0 with no shuffling, warm-ups give no explanation on a wrong answer, the third local in every district is a template-greeting, voiceless generated character, and standing at the very first district's quest local the HUD and journal say you are in Metropolis Central. Owner-rule check: "Tutor Conductor" is the displayed role of a hub local; UI typography and locals wording are otherwise compliant. Fixing finding 01 is a one-line change; the bank needs a purge-and-regate pass before the drills teach anything reliably.

## Strengths
- Street exercises (zones.json streetExercises, 176 items) are genuinely good pedagogy: one overheard line, one comprehension question, one accurate explanation in real regional lexis (Geordie 'canny' as quite/nice, Cork 'massive' = gorgeous, Newfoundland 'where you're to', Quebec 'close the light', Cape Flats 'koesister' vs Afrikaner 'koeksister' distinction is right).
- Dialect content is respectful and linguistically literate where it matters most: us_aave teaches habitual 'be' and stressed BEEN as grammatical systems, us_southern 'might could' is framed as a double modal, car_trinidadian teaches dummy-subject drop; no ethnic jokes, no mock accents in the exercise lines themselves.
- Polish-speaker contrast is real, not decorative: 94/301 bank explanations name the Polish trigger (ważne dla, zależeć od, mieć 25 lat, aktualnie/actually, ewentualnie/eventually, sympatyczny/sympathetic), and concept hints carry the L1 framing ('Polish has no articles').
- NPC names, roles and greetings match their districts in all 88 authored cases (Pearly Queen Vera, Big Norm the stottie baker, Gogo Thandi's spaza, Boeta Achmat's gatsby shop, Uncle Boyo's doubles) and every one of the 88 has a baked Kokoro clip that loads (200 on /play/public/assets/voice/uk_rp_0.ogg).
- Chatter phrasebooks give each district an audible identity with translation 'think' bubbles (dog and bone = phone, dinnae ken = don't know), and the bubble pool design keeps 44 phrasebooks cheap.
- The quest loop design (warm-up that does not complete the local, 7-question drill that does, rounds that rotate concept + level) is a sound spine; the persistence and migration code around em_progress is careful.
- The drill UI reveals the explanation on a wrong answer and lets the learner retry, which is the right instructional shape (the scoring bug is separate from the shape).

## Findings (by severity)

### [CRITICAL] content-01 — Grammar drill cannot be failed: wrong clicks never count, every drill ends N/N  (drill-mechanics, effort S)
- where: public/play/src/ui.js:362
- evidence: ui.js:359-368 — on click, `if (isRight) { answered = true; ob.classList.add('right'); correct++; ... }` with no check that a wrong option was already clicked; the wrong branch (369-383) only disables that one button. Probe clicked a wrong option first on all 7 questions: result text "You scored 7/7. Sharp! You've helped this local for the round. ✓ / +57 XP" (content-04-drill-result.png), while the journal from the same run shows "Articles 7/39 · 50% acc" (content-09-journal.png). grammar.js:60 also pushes the id into `done` on that eventual correct click.
- impact: The pass threshold (ui.js:310 PASS 5/7), the 'You need 5/7' text, the retry button and bark_*_fail clips are unreachable; XP is a flat 57 per drill; mastery 'done' inflates with guesses so buildSession's unseen-first ordering exhausts after one pass; the level ladder rises for every player regardless of ability.
- fix: Set `answered = true` on the first click of any option and score `correct++` only when that first click is right (keep the explanation reveal and let the player see the right answer highlighted, but do not award it). Record mastery from the first attempt. Add a unit-ish probe that clicks wrong-then-right and asserts the score is 0/N.

### [CRITICAL] content-02 — Inverted answer keys: 'I go to the school' marked correct, 'I go to school' marked wrong  (exercise-correctness, effort S)
- where: public/play/src/gamedata/grammar_bank.json:1
- evidence: articles_36 [A1]: options ['I go to school','I go to the school','She works in office.'] answerIndex=1, explain literally says "I go to school' is actually correct idiomatic English…". prepositions_2 [A2]: answer 'I go to the school', explain 'Note: original is often correct idiomatically'. 'I go to school' additionally appears as a WRONG distractor in articles_17 and articles_37, both of which were served in the live probe drill (content-log.json drill.questions).
- impact: A1 learners are told the idiomatic form is an error and rewarded for the unidiomatic one; the live probe served this to the first district's first local.
- fix: Delete articles_36 and prepositions_2; remove 'I go to school' from all distractor pools; add a lint that rejects any item whose explain contains 'actually correct'/'often correct'.

### [CRITICAL] content-03 — About 18 items mark perfectly correct English as the wrong answer  (exercise-correctness, effort M)
- where: public/play/src/gamedata/grammar_bank.json:1
- evidence: word_choice_25 marks 'I agree with him about this' wrong (only 'on this' accepted). collocation_1 and collocation_13 mark 'I'm absolutely sure' wrong; collocation_13's explain admits 'not strictly wrong'. collocation_3 and word_choice_9 (both B2) mark 'I feel sympathy for him' wrong in favour of 'compassion'. word_choice_29/35 mark 'The lecture was very comprehensible' wrong. word_choice_12/14 mark 'I need to adapt to this situation' wrong. word_choice_31/36 mark 'Actually, I'm very tired' wrong (explain: 'translation from Romance languages'). plurals_15 marks 'I need advice.' wrong. articles_23 marks 'I love the music' wrong. subject_verb_1 marks BrE 'My family live in Warsaw' wrong (padded with 'here'). word_order_3/18/19 and questions_negation_8 mark grammatical emphatic orders 'She also is happy', 'She never is late', 'He very much likes it' wrong (questions_negation_8's explain concedes natives say it).
- impact: Teaches false rules to Polish learners who cannot tell; 'wrong' feedback on correct English is the most damaging error a language drill can make.
- fix: Hand-review every item where a distractor parses as grammatical; delete or rewrite with unambiguous distractors; add a native-speaker acceptability gate (LLM + human) that rejects items whose distractors score as acceptable.

### [CRITICAL] content-04 — Raw lesson-transcript fragments (with real first names) shipped as drill items  (content-provenance, effort M)
- where: public/play/src/gamedata/grammar_bank.json:1
- evidence: Scripted scan: 17 items match transcript noise, 20 have an option over 80 chars; by hand ~40 items are transcript-derived: verb_tense_12 'Did you hear about? New President Truskovsky in to, he was a president in by two hours.', verb_tense_19 'didn't hear about this situation with Britney. So it's good to have this lesson.', articles_30 'Yes. Yes, you hear about the mouse control right now, the fighting.', plurals_16 '…please do not use swear words', verb_tense_22 'I can say Me. I, I talk with you.', articles_7 'I have the same problem as Kinga', verb_tense_15 '…what Patricia says, and I agree with her', word_order_20 'I don't really dream, so I think that anywhere is important to me', plus verb_tense_13/14/16/24/31/34, articles_4/32, subject_verb_14/21/22, prepositions_4/22/23/25/28, word_order_11, plurals_7, pronouns_4/7, modals_3/10/11, conditionals_6, comparatives_2/5, gerund_infinitive_7/8/10, collocation_7, word_choice_1/10/15/27/32/33. Live UI: content2-02-transcript-item.png; the natural first question for hub local Beatrice was verb_tense_34 (also transcript). grammar.js:1 documents the source as 'Mike & Kelly's ESL research corpus'.
- impact: Unreadable 'correct' sentences, no single right answer, and private lesson chatter (student/third-party first names, political jokes) published on a public URL; the World-Launch doc claimed disfluency gates, which these items passed.
- fix: Purge every item whose any option exceeds ~70 chars, contains a proper noun not in a whitelist, or contains disfluency tokens (Mmm, Okay, Yes. Yes, Oh no, you know); re-mine only into a staging bank that a human approves; strip names at ingest.

### [HIGH] content-05 — Explanations leak pipeline meta-commentary or are placeholders  (exercise-correctness, effort S)
- where: public/play/src/gamedata/grammar_bank.json:1
- evidence: 9 meta explains: prepositions_2, prepositions_27 ('Correct error identified:'), articles_30 ('This entry's suggested correction is incorrect…'), verb_tense_19 and plurals_7 ('WHY this error occurs for Polish speakers + grammar rule:'), verb_tense_24 ('The entry incorrectly identifies…'), prepositions_28 ('The original correction suggesting hear from appears erroneous'), pronouns_7, collocation_7. 9 placeholder explains equal to the concept hint: verb_tense_3/5/6/9/28/30/36 ('Time + aspect: simple, continuous, perfect.'), word_order_10/24 ('English loves Subject–Verb–Object.'). Rendered live: content2-03-meta-explain.png (ui.js:381 prints q.explain verbatim).
- impact: The 💡 teaching moment, the only instruction in the drill, tells the learner about a data-entry dispute or a generic slogan instead of the rule.
- fix: Lint: reject explains matching /entry|correction|WHY this error/ or equal to any concept hint; rewrite the 18 by hand.

### [HIGH] content-06 — Owner rule: hub local's displayed role is 'Tutor Conductor'; two district roles say 'tutor'  (owner-rule, effort S)
- where: public/play/src/world.js:66
- evidence: world.js:66 `name: 'Conductor Clara', role: 'Tutor Conductor'` rendered by ui.js:178 as 'Conductor Clara — Tutor Conductor'. zones.json:4213 Rangi 'master carver and kapa haka tutor', zones.json:5058 Anisa 'steelpan tutor'. Ratified rule (EM-Play-World-Launch.md): quest NPCs are locals, never teachers, in every player-facing string. No literal 'teacher' string remains in player-facing text (index.html, ui.js, chatter.json checked).
- impact: The first local most players meet is labelled as staff of a language school, undercutting the 'locals teach you how they talk' fiction; the two diegetic 'tutor' roles are borderline but read as the same word.
- fix: Rename Clara's role ('Station Conductor'); consider 'kapa haka leader' and 'steelpan arranger' to keep the diegetic job without the school word.

### [HIGH] content-07 — 38 bank items duplicate another item's correct sentence; one live drill served 'He is an engineer' twice  (duplication, effort M)
- where: public/play/src/gamedata/grammar_bank.json:1
- evidence: Scripted dedupe on normalised correct answers: 38 collisions. 'I went yesterday' is the answer of subject_verb_7, word_order_25, modals_5, word_choice_4, verb_tense_26 (5 concepts); 'I did it' ×5 (subject_verb_23, word_choice_7, verb_tense_38, word_order_23, modals_16); 'I am working now' ×5; 'I will go' ×5; 'He doesn't know' ×3; 'What do you want?' ×3. Mis-filed concepts: modals_0 is an articles item, modals_5/16 and word_choice_4/7 are past-tense items, plurals_0 is word choice, plurals_17 is a preposition item. Live probe articles drill (content-log.json) contained articles_19 and articles_26, both 'He is an engineer', plus articles_2 and articles_38 'She is a teacher'.
- impact: A player touring three districts meets the same sentence under three concept names; concept mastery percentages are meaningless when the item belongs to another concept.
- fix: Dedupe by normalised answer across the whole bank, keep one home concept per sentence, re-classify the fragment items or delete them (most are 2-option fragments anyway).

### [HIGH] content-08 — Bank cannot serve the level ladder: 0 C1 items, 13 B2, conditionals has exactly 7  (content-coverage, effort L)
- where: public/play/src/grammar.js:31
- evidence: Per-concept counts (scripted): conditionals 7 (A2 2, B1 3, B2 2), comparatives 8, pronouns 10, gerund_infinitive 11; levels overall A1 58 / A2 143 / B1 87 / B2 13 / C1 0. grammar.js:31 `LEVELS[min(4, floor(stopIndex/3)+laps)]` targets B2 from stop 3 lap 1 and C1 from stop 6 lap 2 (names_check.mjs output); the drill button prints that level (ui.js:205). Probe in-page: assignGrammar(8,0,'isles',2) → level 'C1', buildSession('collocation','C1',7) → [B2,B2,B1,B1,B1,B1,B1]; buildSession('comparatives','C1') → B1/A2 items; two consecutive conditionals sessions overlap 7/7. DRILL_N=7 (ui.js:4).
- impact: The round loop promises 'new, harder exercises' (ui.js:590, toast main.js:454) but lap 2 re-serves the same seven conditionals; 'C1' on the button is false advertising; advanced students hit a ceiling at B1 content.
- fix: Author at least 25 items per concept per CEFR band (14 concepts × 5 bands × 25 = 1,750) or cap the displayed level at what the pool actually holds; make buildSession refuse to show a level it cannot fill and say so.

### [HIGH] content-09 — 'important to' vs 'important for' dominates 11% of the bank and is applied inconsistently  (exercise-correctness, effort S)
- where: public/play/src/gamedata/grammar_bank.json:1
- evidence: 32 of 301 items contain 'important to/for' (scripted count), filed under articles (7/10/20/4), comparatives (2/5), pronouns (4/9), gerund_infinitive (7/10), collocation (7), subject_verb (14/21), word_order (20), prepositions (1/20/27), word_choice (27/32). The rule is applied inconsistently: word_choice_15's correct answer is 'important for our brain' while subject_verb_14 marks 'important for a government' wrong and subject_verb_21 marks 'important for her' wrong.
- impact: One teacher's pet correction (a contested one: 'important for' is standard in many contexts) is presented as a universal rule across nine unrelated concept headings, crowding out real content.
- fix: Keep at most 2 items on this point, both under prepositions, with contexts where 'to' is unambiguous (personal value); delete the rest.

### [HIGH] content-10 — Answer position bias with no shuffling: 85% of street answers are option 1  (drill-mechanics, effort S)
- where: public/play/src/ui.js:276
- evidence: zones.json streetExercises answerIndex distribution {0:149, 1:27} of 176; sampleExercises {0:66, 1:46, 2:18, 3:2}; bank {0:95, 1:130, 2:76}. ui.js:276 (street), :219 (warm-up), :355 (drill) all render `options.forEach` in authored order with no shuffle. Live: content-08-street.png shows '4:30' first and correct.
- impact: A player learns to tap the top button; street exercises stop measuring comprehension.
- fix: Shuffle option order at render time and map the answer index (one helper used by all three renderers); rebalance authored indices in the JSON as a lint target.

### [HIGH] content-11 — Warm-up exercises have no explanation: a wrong answer teaches nothing  (pedagogy, effort M)
- where: public/play/src/ui.js:233
- evidence: sampleExercises field set is {title,type,prompt,options,answerIndex,reward} (scripted; 0 of 132 have 'explain'). ui.js:233-238 wrong branch: `ob.classList.add('wrong'); ob.disabled = true; audio.wrong(); hooks.onWrong` — no text. ui.js:224-232 right branch: closes the dialog after 900ms with a toast, no teaching. Screenshot content-06-warmup-wrong.png: red button, no message.
- impact: The dialect vocabulary layer, the product's differentiator, is quizzed without ever being explained; the player who guesses wrong gets a red button and can keep guessing.
- fix: Add `explain` to all 132 sampleExercises (the street items already model the format) and render it on both outcomes like openStreetDialog does (ui.js:284).

### [HIGH] content-12 — Both districts at a station get identical concept and level; concept coverage per platform is 3 of 14  (pedagogy, effort S)
- where: public/play/src/zones.js:212
- evidence: zones.js:212 `stopIdx = Math.floor(i / 2)` gives paired zones the same stopIdx; grammar.js:30 derives concept from stopIndex*2+npcIdx, so names_check.mjs shows uk_rp and uk_cockney both 'A1: articles/subject_verb/plurals' at lap 0, us_general and us_southern both 'A1: prepositions/questions/pronouns', etc. for all 22 pairs. The third local at stop s (npcIdx 2) has the same concept as the first local at stop s+1.
- impact: Six locals visible from one platform teach three concepts twice from the same pool; the sense that each district has its own thing to teach is lost.
- fix: Derive the concept from the zone index rather than the stop (`zoneIndex*3+npcIdx`), or better, author a per-district learning objective (see opportunities) so concept follows the dialect content.

### [HIGH] content-15 — At the first district's quest locals the HUD and journal say you are in Metropolis Central  (mission-clarity, effort S)
- where: public/play/src/zones.js:228
- evidence: zones.js:228 `if (Math.hypot(x, z) < 55) return null` (hub). Probe standing next to uk_rp local 0 (Mrs. Pemberton-Smythe): `hudZoneAtNpc0 = { current: 'hub(null)', dist: 47.8 }`. Screenshots content-01-greeting.png and content-04-drill-result.png show 'CENTRAL HUB · Metropolis Central' and 'Round 1 — help 4 more locals here (0/4)' while drilling a Queen's Mile local; content-08-street.png shows the same over a Queen's Mile street local; content-09-journal.png 'YOUR MISSION: Metropolis Central — 0/4 locals helped'. Objective chip and roundStatus use zoneMgr.current (ui.js:582-588, main.js refreshObjective).
- impact: The very first stop on every line has its boulevard-side locals inside the hub radius, so the mission UI and district banner contradict the dialog for the first thing a new player does after the tutorial.
- fix: Make regionAt prefer a zone whenever the point is within that zone's district footprint (or shrink the hub radius to ~40 and test all six first-stop locals), and drive the objective chip from the NPC's zoneCode while a dialog is open.

### [HIGH] content-17 — Every district's third quest local is a template character with no voice and a generic role  (cast-quality, effort M)
- where: public/play/src/dialects.js:108
- evidence: dialects.js:101-111 pads casts under 3 with `Welcome to ${zoneName}. I'm ${first}; listen for the ${dialect} rhythm while you explore the neighbourhood.` and a role from a global 8-item list; zones.js:550 slices the cast to 3 and :573 sets voiceId only for i<2. Live: content-07-third-local.png 'Amara Clarke — cafe regular: Welcome to The Queen's Mile. I'm Amara; listen for the Received Pronunciation rhythm…'. This yields 'listen for the Black South African English rhythm' (za_black), 'the NZ Maori English rhythm' (nz_maori); names_check.mjs shows 'Naledi Mokoena' as the third local of the district labelled White South African English. 44 of 132 quest locals (33%) are this template.
- impact: One in three quest givers is visibly generated, silent (falls to browser speechSynthesis, voice.js:49), and their greeting is a meta-instruction rather than dialect speech, which is exactly the flavour the product sells.
- fix: Author a third npc per district in zones.json (name, in-dialect greeting, role) and bake 44 more Kokoro clips; until then, drop to 2 quest locals per district and set teacherTotal accordingly.

### [HIGH] content-19 — Voice coverage: 107 clips cover 92 characters; 176 street speakers, all questions and 13 southern-hemisphere districts are not really voiced  (voice, effort L)
- where: public/play/src/dialects.js:13
- evidence: ls public/assets/voice: 88 district (44×2) + 4 hub + 15 barks = 107. Street speakers call `voice.speak(null, line)` (ui.js:263) → speechSynthesis only; generated third locals voiceId null (zones.js:573); drill questions, explanations and warm-ups are never spoken. dialects.js:13 sunward family kokoroVoices = ['bf_emma','am_michael','bf_isabella','am_adam'] (British/American) for AU/NZ/ZA/Caribbean, so those 26 baked clips cannot carry the district's accent. bark_*_correct and bark_*_wrong (6 files) are never referenced (ui.js:321 uses perfect/pass/fail only) and bark_*_fail is unreachable (finding 01).
- impact: The premise 'hear how every district talks' is delivered for 88 greetings only; the street layer, the drill and a third of the map sound like the browser's default voice or a Londoner.
- fix: Bake street lines (176) and warm-up prompts with per-district voices; for AU/NZ/ZA/Caribbean either source a TTS with those accents (e.g. Azure/ElevenLabs regional voices) or record humans; wire correct/wrong barks or delete the files.

### [MEDIUM] content-13 — CEFR tags and prompt do not fit the items: A1 fragments tagged B1, non-sentences under 'Which sentence is correct?'  (exercise-correctness, effort M)
- where: public/play/src/ui.js:351
- evidence: B1-tagged: verb_tense_3 'She can swim', verb_tense_5 'She works here', verb_tense_28 'I am working now', word_order_10 'I don't know', prepositions_9 'Good at English', modals_8 'I will go'. Non-sentence answers under the fixed prompt ui.js:351 'Which sentence is correct?': prepositions_9 'Good at English', prepositions_33 'discuss political reality', word_choice_34 'The factory' vs 'The fabric' (no context, unanswerable), pronouns_9 'that can be important to me' vs 'What can be important for me', word_choice_33 'their root cause—it's important to us'.
- impact: Level labels mislead; unanswerable items are guessed.
- fix: Re-tag by a CEFR rubric (sentence length, structure) at build time; give every item its own prompt field (default the current one) and delete context-free fragments.

### [MEDIUM] content-14 — Template-padded distractors: junk words appended to make sentences wrong  (template-nonsense, effort M)
- where: public/play/src/gamedata/grammar_bank.json:1
- evidence: subject_verb_1 'My family live in Warsaw here', word_order_4 'She gave to me the book there', prepositions_5 'We waited on the bus stop it', prepositions_12 'She is good with maths always', pronouns_2 'Everybody brought his own lunches all', comparatives_7 'She is the better student in the class of all', gerund_infinitive_4 'He stopped to smoke last year finally', verb_tense_20 'I already saw that film just now yes', verb_tense_2 'This time next week I will lie on a beach now', modals_1 'You mustn't come if you're busy okay', articles_38 'She is the teacher of.', word_order_2 'Always she drinks morning tea in the.'
- impact: Distractors are recognisable as machine padding, so the item is solved by pattern-matching the tidy option rather than by grammar; it also reads as low quality to a B1 adult.
- fix: Rewrite distractors to contain exactly one plausible learner error each (the hand-authored core items such as prepositions_10-13 already do this).

### [MEDIUM] content-16 — Journal per-district counter says /2 while the round requires 3 locals  (mission-clarity, effort S)
- where: public/play/src/ui.js:615
- evidence: ui.js:615 `const total = Math.min(2, z.data.npcs.length)` vs zones.js:138 teacherTotal `Math.min(3, districtCastFor(...).length)` = 3 (probe: teacherTotal('uk_rp') → 3). After one drill the journal lists 'The Queen's Mile — Received Pronunciation — R1 · 1/2' (content-log.json journalText) while the objective chip says '(1/3)' (content-06-warmup-wrong.png).
- impact: Player believes one more local closes the round; two are needed.
- fix: Use zoneMgr.teacherTotal(z.data.code) in the journal loop.

### [MEDIUM] content-18 — Street local names are hashed from a global list: Māori and Zulu names as Queen's Mile tearoom regulars, duplicates within a district  (cast-quality, effort S)
- where: public/play/src/dialects.js:93
- evidence: dialects.js:93-99 streetLocalFor picks LOCAL_GUIDES[hash % 44]. names_check.mjs: uk_rp street speakers 'Wiremu Taylor, Thabo Dlamini, Ayesha Daniels' (confirmed live in content-log.json street.speakers and content-08-street.png 'Wiremu Taylor — tearoom regular'); au_cultivated 'Lachlan Wright, Tessa Doyle, Lachlan Wright' (same name twice); ie_irish, ie_belfast, us_midwestern, ca_canadian have a street local with the same name as their third quest local.
- impact: Cosmopolitan names are fine in a metropolis, but the same person as quest local and passer-by, or two Lachlan Wrights on one terrace, breaks the 'same person outside the same shop' promise the code comments make.
- fix: Give each district its own 4-name street roster in zones.json (matching the streetExercise roles) and exclude the third-local name.

### [MEDIUM] content-20 — Eye-dialect spellings break the stated 'no phonetic caricature' rule  (dialect-authenticity, effort S)
- where: public/play/src/gamedata/chatter.json:96
- evidence: chatter.json:2 _note: 'Flavour comes from real regional vocabulary and idiom, not from phonetic caricature'. Yet chatter.json:96 us_boston 'Pahk the cah and we'll walk from heah', :92 us_nyc 'Fuhgeddaboudit', :168 car_caribbean 'Everyt'ing criss', :180 car_barbadian 'Wuh gine on, muh friend', :128 ca_newfoundland 'Whadda y'at', :24 uk_geordie 'gannin' hyem'. zones.json:2704 street exercise us_boston T0 uses 'Pahk the cah' as the line and teaches non-rhoticity purely through spelling, with no audio.
- impact: Boston and Caribbean districts slide into the tourist-T-shirt register the rule was written to avoid; a Polish learner also cannot map 'heah' to 'here' without hearing it.
- fix: Keep lexis (wicked, frappe, bubbler, criss, liming) and spell standardly; make pronunciation points audio-first (see opportunities: listen-and-pick).

### [MEDIUM] content-21 — Station signs read 'White South African English' and 'Black South African English'  (sensitivity, effort S)
- where: public/play/src/gamedata/zones.json:4315
- evidence: zones.json:4315 dialect 'White South African English' (Howzit Heights), :4436 'Black South African English' (Kasi Crossing). The dialect string is painted on the platform nameplate (zones.js:1007 fillText(z.data.dialect)), the HUD banner, the metro list (ui.js:557) and the journal (content-log.json journalText).
- impact: These are real sociolinguistic labels, but as neighbourhood signage in a Polish school product they read as racial zoning and invite complaint; the content inside both districts is warm and accurate, so the label is the only problem.
- fix: Rename the displayed dialect to place-anchored forms ('South African English (Cape Dutch)' / 'Township English (Kasi)') and keep the code names internal; same review for 'Cape Flats' and 'South African Indian English' (the latter is fine as a community name).

### [MEDIUM] content-23 — The only grammar-to-dialect link (validIn / localValid) is dead code  (pedagogy, effort M)
- where: public/play/src/grammar.js:91
- evidence: grammar.js:91 `localValid: dialect && ex.validIn && ex.validIn.includes(dialect)`; scripted count of bank items with validIn: 0 of 301. ui.js:382 renders '(Heads up: locals here might actually say the other one!)' only when localValid is true, so it never renders. Drills draw from the same bank regardless of district (buildSession ignores dialect otherwise).
- impact: The grammar drill, the quest-completing task, is identical in Kingston Yard and The Queen's Mile; the product's premise never reaches the graded exercise.
- fix: Populate validIn for the items where a district's grammar differs (Southern double modals, AAVE habitual be, Scots 'I'm no wanting', Newfoundland 'I comes', NZ/AU 'yeah nah') and let those districts serve them as dialect-contrast items rather than as errors.

### [MEDIUM] content-24 — Polish-speaker framing stops at the explanation text: hints never shown, warm-ups and street items have no L1 scaffolding  (pedagogy, effort S)
- where: public/play/src/grammar.js:46
- evidence: grammar.js:46 conceptHint() is exported but never called (grep across src). ui.js drill flow shows the concept name only (ui.js:205, :349). sampleExercises and streetExercises contain no Polish glosses (fields list). Only the hub's 'Marek the Phrase Vendor' (world.js:88) acknowledges the audience.
- impact: The bank's best asset, contrastive L1 explanations, appears only after a mistake and never as a pre-drill orientation; dialect words are never anchored to a Polish equivalent (e.g. 'fortnight' = dwa tygodnie).
- fix: Show the concept hint as the drill's first card; add an optional `pl` gloss field to street and warm-up items and render it under the explanation.

### [MEDIUM] content-25 — 76 of 301 bank items are two-option: coin-flip difficulty  (drill-mechanics, effort M)
- where: public/play/src/gamedata/grammar_bank.json:1
- evidence: Scripted option-count distribution: {2: 76, 3: 225}; no 4-option items. Examples served live: articles_12 ['I read book','I read a book'], articles_26 ['He is engineer','He is an engineer'] (content-log.json).
- impact: Even after finding 01 is fixed, a quarter of questions are 50% guessable; combined with 01 they are trivially 100%.
- fix: Require 3-4 options per item at build time; generate a third distractor from a catalogued Polish-transfer error for each concept.

### [MEDIUM] content-31 — Explanations with wrong or off-target grammar claims  (exercise-correctness, effort S)
- where: public/play/src/gamedata/grammar_bank.json:1
- evidence: word_order_18 explain calls 'She never is late' a 'double negative construction'; word_order_6 explain says always is 'incorrectly placed before verb - should be before main verb' (self-contradictory); word_choice_36 attributes actually/currently confusion to 'translation from Romance languages' in a Polish-learner product; plurals_0 explains 'comprehensive teacher' via 'Polish kompromisowy'; articles_26 says 'vowel-sound consonant'; articles_9 (an article item) explains the Polish preposition 'w'.
- impact: Explanations are the teaching payload; wrong metalanguage confuses B1 adults who know the terms.
- fix: Hand-edit these six; add the explanation to the human review pass in the authoring pipeline.

### [MEDIUM] content-32 — Street exercise completion is not persisted; only 4 items per district, 3 shown per lap  (progression, effort S)
- where: public/play/src/zones.js:679
- evidence: main.js:428 sets `sp.done = true` on the in-memory speaker; zones.js:679-684 recordStreetWin only increments a counter; zones.js:659-660 selects `street[(taught + lap) % street.length]` with taught<3 and street.length = 4 for all 44 districts (stCount {4: 44}). Re-streaming the district (disposeChunk zones.js:1065) or reloading re-spawns the same three speakers undone.
- impact: Street XP is farmable by walking out and back; each lap reveals one new street item, then the cycle repeats.
- fix: Persist done street item indices per district in em_progress; author 8-12 street items per district so laps rotate meaningfully.

### [MEDIUM] content-34 — Spoken-answer matcher picks the wrong option on a tie for two-option article items  (voice, effort S)
- where: public/play/src/voice.js:161
- evidence: voice.js:150-164: score = hits/max(2, optionTokens); `if (s > bestScore)` keeps the earlier option on ties. For articles_12 options ['I read book','I read a book'], a learner who says the correct 'I read a book' scores option 0 at 3/3 = 1.0 and option 1 at 4/4 = 1.0, so index 0 (the wrong one) is returned and ui.js:405 clicks it. Same shape for articles_26, articles_6 ('I have cat'/'I have a cat'), articles_22 and every article item whose wrong form is a strict token subset.
- impact: The mic path, the most interesting input mode, marks a correctly spoken article sentence wrong on exactly the concept where the article is the point.
- fix: Break ties toward the option with the higher exact-match or longer common token sequence; prefer full-string equality first, then Levenshtein.

### [LOW] content-22 — 'langer' used as friendly address in Cork chatter  (sensitivity, effort S)
- where: public/play/src/gamedata/chatter.json:76
- evidence: chatter.json:76 ie_cork say: 'That's savage, langer.' In Cork 'langer' is a vulgar insult (idiot / penis) used jocularly between friends.
- impact: A student who looks the word up finds a vulgarity in the school's game; the exercise layer avoids it, only the ambient bubble uses it.
- fix: Replace with 'boy' or 'girl', which the district already teaches.

### [LOW] content-27 — Some sample exercises are trivia, not language; hub 'listening' item has no audio  (pedagogy, effort S)
- where: public/play/src/gamedata/zones.json:3991
- evidence: zones.json:3978 au_cultivated 'Know Your Accent' asks how the accent is 'best described'; :3991 'Famous Voices' asks which actors speak it (Cate Blanchett and Geoffrey Rush vs 'Steve Irwin and Crocodile Dundee'). world.js:82 PRON-3000 'Rhyme radar' is type 'listening' (though/go/slow/cow) but is presented as text only.
- impact: Low-value items in the highest-reward slot (+15/+20) and a listening exercise that tests spelling.
- fix: Replace the two trivia items with Cultivated-Australian usage items (e.g. 'rather', 'frightful'); bake the four rhyme words and play them.

### [LOW] content-28 — Line colour language disagrees: chatter says Liberty is purple, UI labels it blue, Isles is cyan in-world and green in menus  (consistency, effort S)
- where: public/play/src/gamedata/chatter.json:4
- evidence: chatter.json:4 'The Isles line's that way, Liberty's the purple one.'; ui.js:539/610 labels '🟢 THE ISLES LINE', '🔵 THE LIBERTY LINE', '🟠 THE SUNWARD LINE'; zones.js:16-18 LINES colours isles 0x4deeea (cyan), liberty 0x8b7dff (purple), sunward 0xff6f91 (pink); ui.js:450 citymap lineColors isles '#7ba05b' green, liberty '#8fb4c9' blue-grey, sunward '#e8a13d' orange.
- impact: A learner told 'take the purple one' finds a blue emoji in the metro menu and a pink line on the map.
- fix: Pick one palette per line and use it in signage, menus, map and chatter.

### [LOW] content-26 — Street prompts are generic and repeated across districts  (exercise-quality, effort S)
- where: public/play/src/gamedata/zones.json:1
- evidence: Scripted: 'What is he asking?' ×6, 'What is being asked?' ×4, 'How far is it?' ×4, 'What is this?' ×4, 'What is he saying?' ×3, 'What is she saying?' ×3 across districts; sco_edinburgh T2 'What does she mean?' and several others have the correct option as the only long/specific one (e.g. car_caribbean T2 'Perfect / brand new' vs 'Broken', 'Expensive').
- impact: Mild: the items still work, but the pattern (longest option wins) is learnable.
- fix: Equalise option lengths and vary prompts to reference the situation ('When should you turn up?').

### [LOW] content-30 — buildSession sorts with Math.random inside the comparator and never fills a short pool  (drill-mechanics, effort S)
- where: public/play/src/grammar.js:84
- evidence: grammar.js:83-87 comparator adds Math.random() per comparison (inconsistent comparator; engine-dependent ordering); grammar.js:75-79 falls back to another concept only when the pool is empty, so conditionals (7) and comparatives (8) serve their entire pool every time and `N` can silently drop below DRILL_N (ui.js:309).
- impact: Order is not truly shuffled and the same small pools repeat; see finding 08 for the content side.
- fix: Shuffle once (Fisher-Yates) then stable-sort by (unseen, level distance); top up from the adjacent concept when the pool is short and say so in the header.

## Opportunities

### Per-district learning objective that drives both layers  (effort M, cost 44 objectives to author; small code change in grammar.js/zones.js)
- why: Today the dialect layer (warm-ups, street) and the graded grammar layer are unrelated; the paired-station assignment makes districts interchangeable. An authored objective per district ('Cockney: rhyming slang + question tags', 'Soul Boulevard: aspect — habitual be vs progressive', 'The Dep Steps: French-calque verbs open/close', 'Scrumpy Hollow: pronoun case us/we') gives each stop one thing to master and makes the round completion meaningful.
- how: Add `objective: {concept, dialectPoint, canDo}` to each zones.json entry; assignGrammar reads objective.concept for lap 0 and rotates from it; the objective chip and the station sign subtitle show the can-do statement ('I can understand times like half seven').

### Listen-and-pick exercise type (audio first, text second)  (effort M, cost ~200 clips (3-5 MB OGG at current bitrate) plus a small ui.js renderer)
- why: The product promise is hearing 44 Englishes, but no exercise plays audio; the Boston non-rhotic item resorts to eye dialect. Listening comprehension is also the CEFR skill Polish B1 learners most lack.
- how: New item type `listen`: play a baked clip (Kokoro for GB/US; a regional-voice TTS or recorded humans for AU/NZ/ZA/Caribbean), show the question only, reveal the transcript after answering; re-use the 176 street lines as the first 176 listening items; use Web Audio with a 'replay' button and a slower second play.

### Dialect-swap and 'which district said this?' items  (effort S, cost Content already exists; ~150 lines of generation script + one renderer)
- why: Cross-district contrast is the unique mechanic this world can offer and nothing else on the market does: 'Rewrite the Cockney line in standard English', 'Which district would say sweet as?', 'Same meaning, two cities: bostin / boss / mint / deadly'.
- how: Generate from existing chatter.json + streetExercises pairs by shared gloss (the think-bubble glosses already encode 'X = excellent'); render as MCQ now, as drag-to-match later; reward with a 'collector' journal page of dialect words mastered per city.

### Fill-the-gap and reorder (word-order) types with typed or dragged input  (effort M, cost Two renderers in ui.js, a derivation step in build-grammar-bank)
- why: The bank's word_order, prepositions and articles concepts are exactly the ones MCQ tests badly (recognition, not production); Polish learners' article errors are production errors.
- how: For articles/prepositions: gap items rendered as chips (a / an / the / —) inserted into the sentence; for word_order: shuffled word chips the player orders, checked against one or more accepted orders; both derive automatically from the existing correct sentences (mask the article; tokenize the sentence) so the bank grows without new authoring.

### Escalation per lap that changes the task, not just the label  (effort M, cost Depends on the new renderers above; scheduling logic is small)
- why: Currently lap n only rotates the concept and raises a level tag the bank cannot serve. Real escalation is in exercise type and time pressure.
- how: Lap 0: recognition MCQ 3-4 options. Lap 1: same objective as gap-fill with the explanation hidden until the end. Lap 2: listen-and-pick without transcript plus a 12-second timer. Lap 3: production — say the sentence (existing mic path) with the tie-break fix. Store per-district lap type in em_progress; show the next lap's format on the round-complete toast.

### Exercise-authoring pipeline with gates that actually reject  (effort L, cost One build script plus a review UI page; a day of human review for ~300 items)
- why: The current bank shows exactly which gates were missing: inverted keys, transcript fragments, meta explanations, duplicates, correct-English distractors. The World-Launch doc's gates (token overlap, disfluency, mojibake) let all of these through.
- how: A staging JSON per source with mandatory fields {prompt, options[3-4], answer, explain, level, concept, source, pl_gloss, validIn[]}; automated lints: normalised-answer dedupe across concepts, option length <= 70, no proper nouns outside a whitelist, no disfluency tokens, explain not matching /entry|correction|WHY/, explain != concept hint, answerIndex balance per concept, no distractor that an LLM acceptability judge rates acceptable; then a human approve/reject queue (the console the EM stack already has) before an item can reach public/play. Keep the miner off Windows-only: the World-Launch doc's open question about the unbacked-up game repo still stands.

### Polish gloss and L1-contrast card at drill start  (effort S, cost 132 + 176 short glosses; trivial UI)
- why: 94 explanations already know the Polish trigger; students never see it before they err, and dialect words have no Polish anchor.
- how: Render conceptHint as the drill's first card ('Polish has no articles — English marks every countable noun. 7 questions.'); add `pl` to street/warm-up items ('a fortnight = dwa tygodnie'); optional 'PL' toggle in settings for the glosses.

### Spaced review: a 'Metro Pass' card that resurfaces missed items across districts  (effort S, cost Small: grammar.js queue + one ui.js entry point)
- why: Mastery is stored but nothing uses it except ordering within one drill; there is no return path to items the player got wrong.
- how: Keep a wrong-item queue in em_grammar; every third drill injects 2 review items from other concepts (labelled 'review'); the journal's mastery bars become tappable to launch a 5-item review of that concept anywhere in the city.

### Third local per district, authored and voiced, replacing the template  (effort M, cost 44 greetings + 44 clips)
- why: A third of quest givers are template characters with a meta greeting and no voice; the fix is authoring, not code.
- how: Write 44 npcs[2] entries in the same voice as the existing pairs (the street roles already suggest them: the Yorkshire pub landlord, the Cork publican, the Bo-Kaap fish seller), bake 44 clips, drop districtCastFor's padding branch.

## Screenshots
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content-01-greeting.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content-02-drill-q1.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content-03-drill-q1-wrong.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content-04-drill-result.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content-05-warmup.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content-06-warmup-wrong.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content-07-third-local.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content-08-street.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content-09-journal.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content2-01-hub-beatrice.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content2-02-transcript-item.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content2-03-meta-explain.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content-log.json
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/content2-log.json
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/bank_dump.txt
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/zones_dump.txt
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/names_check.mjs


# LENS: walkthrough  (31 findings, 8 opportunities)

## Summary
I played the live beta as a brand-new player on desktop (1440x900) and phone (393x852 touch, plus landscape), driving the real code at 127.0.0.1:4175 with fresh localStorage, the real 5-page tour, real clicks/taps, and DOM/state checks after every step (scripts: scratchpad/wt-probe.mjs, wt-supp.mjs, wt-persist.mjs; 60+ screenshots wt-*.png, wtm-*.png, supp-*.png). The bones are sound: loading to BEGIN in ~5 s locally, zero console errors, the tour copy is warm and consistent with the owner's "locals" rule, the round/objective loop is legible, XP/helped-state/fog persist across reload, and the drill explanations (Polish L1 contrast) are genuinely good teaching. But the first ten minutes are undermined by a chain of rough edges that compound: you spawn facing a slab 2 m away so "take a stroll" ends in 1.9 m; the spring-arm camera treats the NPC's own collider as a wall so many conversations play as a close-up of the back of Wren's head with the local out of frame (mobile especially); a drill can be brute-forced to 7/7 because wrong clicks never count, so the ratified 5/7 pass gate is void; the metro drops you 11.96 m from the stop with a 12 m ride radius facing a blank wall with all three locals offscreen, and one step later T says "find a station platform"; the journal says a district has 2 locals while the objective says 3; the "+57 XP" toast is overwritten instantly and every toast sits exactly on top of the objective chip; hotkeys stack journal+map+metro+guide over an open dialog and Escape closes none of them; and the 55 m hub radius makes the HUD claim you are in Metropolis Central while you talk to a Queen's Mile local. Mobile adds "Press E" prompts on a touch device, no help access, a station map with no names, and landscape overlaps. None of it is deep engineering; almost all of it is S-effort fixes to gates, radii, and a modal manager, plus one real feature (a conversation camera) that would change how the whole game feels.

## Strengths
- Zero console errors or failed requests across desktop, mobile and reload runs (wt-desktop.log, wt-mobile.log --- logs --- sections).
- Persistence works end to end: after reload XP shows 57, Clara stays helped with the green marker (opacity 0.85), objective reads 1/4, welcome tour does not reappear, quality and fog remembered (wt-persist.log 'after').
- Player-facing copy honours the ratified rule: no 'teacher' string anywhere in index.html, ui.js, zones.json or grammar_bank options; tour, guide, objective and toasts all say 'locals'.
- Drill explanations are real teaching: e.g. 'Polish super wazne dla mnie maps to important for me, but English prefers to for personal statements' (wt-13-drill-q1-wrong.png), and the street line 'half four' is explained with the dialect fact (wt-30).
- The round loop is legible at a glance: objective chip updates instantly from 0/4 to 1/4 after a pass, marker flips to green, the done-state dialog points you to the other locals (wt-16, wt-17).
- Onboarding tour is warm, five short pages, skippable, replayable from the guide, adapts its key names to touch (joystick/buttons) (wt-01-welcome-p1..p5, wtm-01-welcome-p*).
- Metro travel has a proper fade, zone-card flash and audio cue; arrival correctly switches the zone card and objective to the district (ride.arrival_hud).
- Collision is solid: buildings, benches, kiosks all stop the player cleanly (collide.building: Language Academy), cars brake for the player (traffic.stand_in_car speed 0).
- Street exercises give the crowd purpose: a passer-by with a dialect line, one question, an explanation, +8 XP, and the prompt honestly reads '(already helped)' afterwards (wt-28..30).
- Portrait phone HUD is well partitioned: joystick bottom-left, action column right, minimap top-left, no overlaps in portrait (hud.overlaps [] on mobile).

## Findings (by severity)

### [CRITICAL] walkthrough-01 — Wrong answers never count: a drill can be brute-forced to 7/7, so the 5/7 pass gate is void  (learning-integrity, effort S)
- where: public/play/src/ui.js:359
- evidence: ui.js:359-383: on a wrong click the button is disabled and the explanation shown, but `correct++` only fires when the right option is eventually clicked, with no penalty. Probe: clicked two wrong options on Q1 then the right one (drill.q1_after_two_wrong [[wrong,true],[,false],[wrong,true],[,false]]); result screen said 'You scored 7/7. Sharp!' and paid the full 6*7+15 = 57 XP while em_grammar recorded seen 9 / correct 7 (drill.result, drill.xp in wt-desktop.log; wt-13-drill-q1-wrong.png, wt-15-drill-result.png). Same on mobile (wt-mobile.log drill.result 7/7).
- impact: Every local can be 'helped' by clicking every option; the round system, XP economy and mastery percentages in the journal all rest on a score that cannot go below 7/7 if the player persists. A learner learns nothing from being unable to fail.
- fix: Score first attempts only: on a wrong click mark the item missed (do not increment correct), reveal the answer and explanation, then auto-advance after ~1.2 s. Keep PASS at ceil(0.7*N) of first attempts; show 'first try' dots (green/red) in the header so the 7/7 reveal is honest.

### [HIGH] walkthrough-02 — Conversation camera collapses into the back of Wren's head: NPC colliders are treated as camera walls  (camera, effort M)
- where: public/play/src/player.js:307
- evidence: world.js:293-297 pushes a 0.8 m AABB per hub local into world.colliders; player.js:307-311 shortens the spring arm against every collider in that list. Probe with the dialog open next to Beatrice: camDist 1.08 m, NPC head projected to screen y = -261 (above the viewport), onscreen false (supp-results dialog.npc_on_screen); supp-03-dialog-camera.png shows Wren's face filling the frame and no NPC. Mobile: wtm-09-hub-local-prompt.png, wtm-10-dialog-greeting.png, wtm-15-drill-result.png, wtm-28-street-prompt.png are all face close-ups with the local out of frame; desktop wt-10/wt-12 show the dialog covering Wren and Marek clipped at the left edge.
- impact: The core loop (talk to a local, do their drill) is played looking at the hero's hair. The player never sees the character who is supposedly speaking, and the baked Kokoro voice comes from nowhere.
- fix: Tag people colliders (source = npc name) and skip them in FollowCamera's occlusion pass. Add a dialog camera: when ui.dialogOpen, lerp to an over-the-shoulder two-shot (camera behind and to the side of Wren, target = midpoint of the two heads, arm ~3.2 m, pitch ~0.12) and have the NPC lookAt the player; restore on close.

### [HIGH] walkthrough-03 — Metro arrival faces a blank wall with every local offscreen  (wayfinding, effort S)
- where: public/play/src/main.js:366
- evidence: main.js:366-374 places the player at stop+0.46*(center-stop) and sets yaw to look 'outward along the line'. Probe after riding to The Queen's Mile: camFwd [0.00,-0.96], distToStop 11.96, all three district locals 'offscreen' (Mrs Pemberton-Smythe 18.7 m, Rupert Fothergill 16.1 m, Amara Clarke 35.1 m), objective says 'help 3 more locals here (0/3)' (ride.arrival_view). wt-22-arrival-queens-mile.png is a flat teal wall with two black windows; wtm-22 the same on mobile; wt-22b looking back is another wall.
- impact: The first ride, the moment the game should sell '44 neighbourhoods', shows a wall. The objective asks for three locals and none is visible; the district description ('cream Georgian terraces, wrought-iron railings') is nowhere in frame.
- fix: Arrive on the platform edge looking toward the district centre (yaw = atan2 of center-stop, pitch 0.22), with the station sign in the left third and at least one ❗ in frame (verify with a projection test at spawn time and rotate until true). Optionally a 1.5 s dolly from the tram doors.

### [HIGH] walkthrough-04 — Spawn faces a slab 2 m away: holding W from the start moves 1.9 m and stops; the path to the nearest ❗ is blocked  (first-minute, effort S)
- where: public/play/src/player.js:71
- evidence: Spawn (0,0,8) facing -z (player.js:71-74). Colliders ahead: 'world-object' x -1.2..1.2, z 4.8..5.7 and 'central-language-beacon' at the origin (supp spawn.colliders_ahead). Holding W for 180 frames moved 0.00 m after the first 1.87 m (walk.3s, welcome.walk_while_open); the straight line to Marek crosses vocab_bench, plaza-bench and liberty-buffer-stop (spawn.path_to_marek_blockers); hub.reached_by_walking false. wt-02-hud-first-view.png shows Wren nose-to-slab; the tour's last tip is 'Take a stroll around the plaza first'.
- impact: The very first input a new player gives does nothing visible. Combined with the pillar directly ahead, the plaza reads as a pen, not an open city.
- fix: Spawn on the plaza ring at radius ~9 m facing an open radial toward Conductor Clara (she is the designed first contact), and move or remove the slab collider at z 4.8-5.7. Add a 2 s 'follow the glow' ground trail to the first ❗.

### [HIGH] walkthrough-05 — Ride radius is 12 m and arrival is at 11.96 m: one step later T says 'Find a station platform'  (wayfinding, effort S)
- where: public/play/src/main.js:359
- evidence: canRide requires hypot(player-stop) < 12 (main.js:359-360); rideTo lands at 0.46 of the 26 m stop-to-centre offset = 11.96 m (main.js:369-370). Probe: T at arrival opens the metro; after 60 frames of W, T shows toast '🚇 Find a station platform to ride the metro (T)' at distToStop 12.17 (ride.T_after_1s_walk; wt-23-T-after-walk.png), and a map click from the district centre is refused with 'Walk to a station platform first' (wt-23b-map-click-refused.png). Nothing on the ground marks where the platform zone ends.
- impact: The tour promises 'ride the metro from any platform' but the platform is an invisible 12 m circle you are already at the edge of. Players will believe the metro is broken.
- fix: Raise the radius to ~24 m (covers the shopfront walk), draw the platform zone on the ground (the station sign already exists), and when out of range offer 'Walk me to the platform' (auto-path) instead of a refusal.

### [HIGH] walkthrough-06 — Journal says a district has 2 locals while the objective and round logic say 3  (lies, effort S)
- where: public/play/src/ui.js:615
- evidence: ui.js:615 `Math.min(2, z.data.npcs.length)` vs zones.js:138 teacherTotal `Math.min(3, districtCastFor(...).length)` (districtCastFor pads every district to 3, dialects.js:101-112). Probe: journal row 'The Queen's Mile Received Pronunciation — R1 · 0/2' (journal.text, wt-18-journal.png) while the arrival objective reads 'help 3 more locals here (0/3)' (ride.arrival_hud).
- impact: A player who helps two locals sees the journal say the district is complete while the round never closes.
- fix: Use zoneMgr.teacherTotal(code) in the journal loop.

### [HIGH] walkthrough-07 — 55 m hub radius swallows the first stop: HUD says 'Metropolis Central' while you talk to a Queen's Mile local  (lies, effort S)
- where: public/play/src/zones.js:228
- evidence: regionAt returns null (hub) for hypot < 55 (zones.js:228); first stops sit at d = 62 with the shopfront walk at ~44-48 m. Probe: 3 district locals (Mrs Pemberton-Smythe uk_rp, Patty Melton us_general, Bazza au_australian at r = 48.4) and 6 street speakers (Wiremu Taylor r 45.9, Thabo Dlamini 53.9, ...) are inside the hub radius (region.district_actors_inside_hub_radius). wt-28..30 show the street exercise with zone card 'CENTRAL HUB · Metropolis Central' and objective '(1/4)' while the speaker's dialect is uk_rp.
- impact: The one thing the product promises, 'every district speaks its own English', is contradicted by the HUD at the first three stops; the objective chip counts the wrong circuit.
- fix: Shrink the hub region to ~36 m (plaza + station platforms) or classify by nearest district footprint rectangle rather than Voronoi-with-hub-disc.

### [HIGH] walkthrough-08 — Toasts clobber each other and sit exactly on top of the objective chip  (feedback, effort S)
- where: public/play/src/ui.js:159
- evidence: ui.toast replaces textContent with no queue (ui.js:159-165); addXP toasts '+57 XP ✦' (ui.js:171) and onCorrect immediately toasts '3 more locals...' (main.js:454-457), so the XP toast is never seen: right after finish the toast reads '✦ 3 more locals to close the round here' (drill.xp). #objective and #toast both have top:96px (index.html:91,104); hud.rects shows objective y96 and toast y96 overlapping. wt-02-hud-first-view.png: welcome toast hides 'Round 1 — help 4 more locals'; wt-23b: 'Walk to a station platform' hides the objective; wt-30: '+8 XP' hides the objective.
- impact: The player never sees the reward for their first drill, and every system message hides the one line that tells them what to do next.
- fix: Toast queue (2.2 s each, max 2 stacked) rendered below the objective chip; XP gains as a counter tween on #xp plus a small '+57' rising label next to it rather than a toast.

### [HIGH] walkthrough-09 — Overlays stack: journal + map + metro + guide open simultaneously over a dialog, and over the welcome tour  (ui-state, effort S)
- where: public/play/src/main.js:354
- evidence: J/M/T/H handlers are not gated by `blocked` (main.js:354-396). Probe: with Marek's dialog open, J M T H gave guide flex, dialog block, journal flex, citymap flex, metro flex all at once (stack.after_JMTH_over_dialog; wt-11-overlay-stack.png shows the guide over the metro list over the map). During the welcome tour, H opened the guide on top (welcome.H_stacks_guide) and M T J opened map, metro and journal under the tour (welcome.MTJ_stack).
- impact: A curious first-timer who taps keys during the tour ends up with four panels layered, three of which Escape cannot close (see walkthrough-10).
- fix: One modal manager: `ui.openPanel(name)` closes any other panel; hotkeys ignored while welcome or dialog is open; Escape closes the topmost.

### [HIGH] walkthrough-10 — Escape closes only the dialog and guide; journal, city map, metro and welcome tour ignore it  (ui-state, effort S)
- where: public/play/src/ui.js:28
- evidence: ui.js:28-30 keydown Escape calls closeDialog and showGuide(false) only. Probe: journal.escape_closes 'flex', map.escape_closes 'flex', metro.escape_closes 'flex', welcome.escape_closes 'flex' (wt-desktop.log). After two Escapes with everything stacked, journal/citymap/metro remained flex (stack.after_escape2).
- impact: The universal 'get me out' key does nothing on 4 of 6 overlays; players hunt for the small ✕.
- fix: Single Escape handler that closes whichever overlay is on top (welcome -> dialog -> metro -> map -> journal -> guide).

### [HIGH] walkthrough-12 — Mobile prompt says 'Press E' on a touch device  (mobile, effort S)
- where: public/play/src/main.js:423
- evidence: Prompt strings are hard-coded 'Press <b>E</b> — ...' (main.js:423-425, 438-440) regardless of body.touch. Mobile probe: street.prompt 'Press E — Wiremu Taylor, tearoom regular ✦ quick one', hub.prompt 'Press E — talk to Marek' (wt-mobile.log); wtm-09-hub-local-prompt.png, wtm-28-street-prompt.png. The tour page 2 correctly says '💬 button talk to them' so the game contradicts its own tutorial.
- impact: The single most important instruction in the game names a key that does not exist on the device.
- fix: When document.body.classList.contains('touch') render 'Tap 💬 — talk to ...' and pulse the #tb-talk button while a local is in range.

### [MEDIUM] walkthrough-11 — Player keeps walking while the welcome tour, journal, map or metro is open  (ui-state, effort S)
- where: public/play/src/main.js:328
- evidence: simTick gates movement only on ui.dialogOpen and ui.guideOpen (main.js:328); render-side `blocked` (main.js:404) includes welcome/journal/metro/map but is only used for the camera and E. Probe: holding W with the welcome tour open moved the player 1.87 m (welcome.walk_while_open p0 z 8.00 -> p1 z 6.13).
- impact: Reading the tour or journal while resting a hand on WASD walks Wren into things behind a blurred overlay; on a phone the joystick still drives under the journal.
- fix: Gate player.update on the same `blocked` predicate.

### [MEDIUM] walkthrough-13 — Mobile has no way to open help or replay the tour  (mobile, effort S)
- where: public/play/index.html:224
- evidence: The guide is bound to KeyH only (input.js:96, main.js:354); touch HUD buttons are jump/talk/metro/map/journal (index.html:224-230; guide.mobile_access anyHelpButton false). The tour's last page tells phone players 'Press H any time for the full how-to guide' (welcome.page5 body in wt-mobile.log).
- impact: A phone player who skips or forgets the tour has no reference for what the buttons or markers mean.
- fix: Add a ? button to #touch-ui that calls ui.showGuide(true); make the tour text conditional on touch.

### [MEDIUM] walkthrough-14 — Mobile city map has no station names and desktop-only instructions; tap target ~19 px radius  (mobile, effort M)
- where: public/play/src/ui.js:492
- evidence: Station labels are drawn only for the hovered station (ui.js:492-505, canvas.onmousemove); the caption reads 'Hover a station · click to ride the metro from a platform' (index.html:301). On the 322 px canvas the 30-canvas-px pick radius is ~18.6 CSS px (map.touch_pick_radius_px). wtm-19-map.png shows 44 unlabeled dots.
- impact: On a phone the map is 44 anonymous dots; a first tap on the wrong dot teleports you to an unknown district (if you happen to be on a platform).
- fix: On touch: first tap selects and labels the station (name + dialect + line), second tap or a 'Ride' button confirms; increase pick radius to 22 CSS px; caption text conditional on touch.

### [MEDIUM] walkthrough-15 — Mobile layout collisions: landscape XP/BETA under the jump button, prompt over the joystick, graphics select over the dialog  (mobile, effort S)
- where: public/play/index.html:233
- evidence: Landscape 852x393: overlaps xp×touch-ui and beta-tag×touch-ui (resize.landscape.overlaps; wtm-31-landscape.png shows the ⤒ button over '75 XP' and 'BETA'). Portrait: prompt×stick (dialog.overlaps in wt-mobile.log; wtm-28 shows the prompt across the joystick), and with a dialog open dialog×stick, dialog×touch-ui, gfx×dialog (wtm-10, wtm-31b). #touch-ui is anchored bottom:12% with 5 buttons (index.html:233-240) so on short viewports it climbs into the top-right HUD.
- impact: In landscape the jump button hides the score; in portrait the interaction prompt sits on the movement control.
- fix: Landscape media query: place #touch-ui as a 2x3 grid bottom-right and move #xp/#beta-tag left of it; raise #prompt above the stick (bottom: 26%) on touch; hide #gfx behind a settings entry.

### [MEDIUM] walkthrough-16 — Text below the 13 px floor throughout the HUD and every panel  (typography, effort S)
- where: public/play/index.html:103
- evidence: Computed sizes from the probe (hud.small_text, journal.small_text, metro.small_text, map.small_text, welcome.small_text): #hint 12px (index.html:103), zone-card .line 11px desktop / 9px mobile (index.html:74,144), #beta-tag 10px / 8px (89,148), #objective 11px on touch (97), #gfx 11px monospace (133-134), journal .jline and em 12px, .jnote 12.5px (289-293), metro .tip/.jline/em 12px (336-341), map caption 12px (315), #welcome-eyebrow 11.9px (367), #welcome-skip 12.9px (391), #guide-replay 12.5px (434), .explain i 12.5px (129).
- impact: The controls hint, every metro dialect label and every journal count are below the readable floor, on the one screen where a learner reads a foreign language.
- fix: Raise all of the above to >=13px (hint 13, eyebrows 13 with letter-spacing, em labels 13); on phones set .line to 11px only if the card is widened, otherwise 13.

### [MEDIUM] walkthrough-17 — 'Press E' prompt ghosts through the translucent dialog, journal and map panels  (visual-clutter, effort S)
- where: public/play/index.html:98
- evidence: #prompt (z 20, bottom 15%) stays display:block while overlays are open (overlays: prompt 'block' under map/metro/journal in wt-desktop.log; dialog.overlaps ['prompt×dialog']). wt-10-dialog-greeting.png: 'Press E — talk to Marek the Phrase Vendor' readable through the Warm-up button; wt-18-journal.png and wtm-18/wtm-19: 'Press E — talk to Marek (✓ done this round)' visible through the panel.
- impact: Two layers of text in the same spot; on mobile it reads as garbage under the journal rows.
- fix: Hide #prompt whenever any overlay is open (set in setPrompt when blocked) and raise panel background alpha to 0.92.

### [MEDIUM] walkthrough-18 — First-drill content quality: 2-option coin flips, recycled distractors, unparallel options  (content, effort L)
- where: public/play/src/gamedata/grammar_bank.js:1
- evidence: Bank stats: 76 of 301 items have only 2 options; 139 of 301 share an option string with another item (e.g. 'I am working now' in 5 items); 45 options start lowercase. Probe drill (drill.session): Q1 options 'In the morning I wake' / 'it's super important to me personally' / 'it's super important for me personally' — the first is an unrelated sentence from another item; Q4 reuses 'it's super important for me personally' as a distractor next to 'explain me / explain to me'; Q3 and Q6 are 2-option. wt-12-drill-q1.png.
- impact: A learner sees the same sentence recycled as a wrong answer in two questions and can pass half the items by elimination; it reads as auto-generated rather than authored.
- fix: Bank lint in scripts/build-grammar-bank.mjs: require >=3 options that vary only in the target feature, forbid option strings appearing in other items, normalise capitalisation/punctuation; hand-author the 14 first-contact concepts used at the hub and stop 0.

### [MEDIUM] walkthrough-19 — Two different ❗ languages and markers floating over invisible bodies  (iconography, effort S)
- where: public/play/src/crowd.js:352
- evidence: Quest locals use a Georgia-serif '!' sprite (markers.js:17-32); street locals use a plain yellow octahedron (crowd.js:352-355) the tour never mentions (wt-28-street-prompt.png shows the diamond). Bodies are hidden past 44 m but their markers stay visible (world.js:1298-1302): from spawn, 6 district locals' ❗ are on screen at 56-97 m with model.visible false (supp markers.visible_over_hidden_bodies).
- impact: The tour teaches 'golden ❗' and then shows a diamond; from the plaza players see exclamation marks hanging over empty pavement and walk toward nothing.
- fix: One marker family (same glyph, gold for drill locals, small gold dot for street ones); fade marker opacity with body visibility or replace beyond 44 m with a minimap-only dot.

### [MEDIUM] walkthrough-20 — Despawned crowd speakers are never removed, leaking into nearestSpeaker and the 24-marker cap  (correctness, effort S)
- where: public/play/src/crowd.js:443
- evidence: crowd.despawn (crowd.js:443-458) frees the slot but does not call setSpeaker(null); zones.disposeChunk only calls despawn (zones.js:1097). Probe: after streaming The Queen's Mile out and back in, crowd.speakers held 6 entries for uk_rp: the three old ones (one done=true) plus three new done=false (street.reset_on_restream 'after'). At spawn speakers already equal the markerCap: 24/24 with 8 districts resident (markers.speakers_vs_cap); build/dispose hysteresis 105/145 m (quality.js:38) keeps up to 10-12 districts alive.
- impact: Ghost speakers at stale coordinates can trigger 'Press E — <name>' over empty ground and consume marker slots so real street locals show no marker; the street win also resets on every restream (done is in-memory only) so +8 XP is farmable by walking away and back.
- fix: In despawn: if (agent.speaker) this.setSpeaker(agent, null). Persist street done per (zoneCode, slotIndex) in em_progress and honour it on spawn. Raise markerCap to 48 or assign markers nearest-first.

### [MEDIUM] walkthrough-21 — 🎤 button is always offered and can sit on 'listening…' with no timeout or honest fallback  (voice, effort S)
- where: public/play/src/ui.js:389
- evidence: The mic button is appended whenever this.voice exists (ui.js:389-411). listenWebSpeech has no timeout (voice.js:124-137) and on production sttAvailable is forced false (voice.js:20-21) so everything depends on webkitSpeechRecognition. Probe: 1.5 s after clicking, the button still read '🎤 listening…' with no toast (mic.after_click); when recognition rejects, the message is 'Didn't catch that — try again' (ui.js:401) even where no recogniser exists (Firefox/Safari).
- impact: A learner who tries the voice feature promised on tour page 4 may wait indefinitely, or be told they were not heard when the browser cannot hear at all.
- fix: Only render the mic when SpeechRecognition exists and mic permission is grantable; add an 8 s timeout that resets the button; distinct messages for 'no microphone access' vs 'didn't catch that'.

### [LOW] walkthrough-22 — Guide table wraps 'W A S D' onto two lines; hint wraps at 800 px  (layout, effort S)
- where: public/play/index.html:399
- evidence: wt-03-guide.png shows 'W A S / D' broken across two lines in the first table cell (td has no white-space:nowrap, index.html:399,426). At 800x500 the #hint wraps to two lines ('J / journal · H help', wt-31-resize-800x500.png, hint h 32).
- impact: The first thing a player reads in the how-to looks broken.
- fix: td:first-child { white-space: nowrap; } and hide or shorten #hint under 900 px.

### [LOW] walkthrough-23 — Player can stand inside a car; vehicles have no colliders  (collision, effort M)
- where: public/play/src/traffic.js:160
- evidence: traffic.update only brakes for the player (traffic.js:165-170); no collider is registered for vehicles. Probe: teleported into vehicle 0, car speed 0.00, carMovedAway 0.00, colliders [] (traffic.stand_in_car); wt-08-standing-in-car.png shows Wren waist-deep in a car body.
- impact: Breaks the illusion the moment a curious player steps onto the boulevard.
- fix: Push the player out of the nearest vehicle's oriented footprint in simTick (cheap 2D OBB test on the active vehicles), or make cars honk and reroute.

### [LOW] walkthrough-24 — 9.1 MB / 68 requests before BEGIN behind a bare bar; load failure tells a learner to 'check console' with no retry  (loading, effort M)
- where: public/play/src/main.js:299
- evidence: load.bytes_before_begin: 9,085,748 bytes, 68 requests (three.core.js 1.41 MB, three.module.js 0.63 MB, 8 NPC GLBs 0.37-0.44 MB each); ~5 s to BEGIN on localhost. On failure the sub-line becomes 'Load error — check console.' (main.js:299-302) and BEGIN never appears (err-probe.log glb-404 case). wt-00-loading-begin.png: title, bar, no tips or expectation setting.
- impact: On a Polish 4G phone this is a long silent wait, and any CDN hiccup dead-ends the player.
- fix: Show rotating 'what you will do' tips and a percent under the bar; a Retry button and plain-language error; defer the 7 district NPC GLBs until after BEGIN (only Clara/PRON-3000/Marek/Beatrice are needed for the plaza).

### [LOW] walkthrough-25 — Zone-card flash animation scales the name 1.35x with 0.3em tracking so it spills over the objective chip  (animation, effort S)
- where: public/play/index.html:78
- evidence: @keyframes zonein starts at scale(1.35) letter-spacing 0.3em (index.html:78-82). Screenshots caught mid-flash: wt-08-standing-in-car.png ('W u t h e r i n g  R i s e' overflowing the card) and wtm-28-street-prompt.png ('M e t r o p o l i s  C e n t r a l' wider than the phone).
- impact: Every zone change momentarily breaks the HUD, most visibly on phones.
- fix: Animate opacity and translateY only, or clip with overflow hidden and start at scale 1.08.

### [LOW] walkthrough-26 — Metro list is 45 flat rows (1542 px of scroll) with no 'you are here', distance or line-change context  (wayfinding, effort M)
- where: public/play/src/ui.js:535
- evidence: metro.rows n 45, panelH 702, scrollH 1542 (desktop), 665/1578 on mobile; rows show only name + dialect (ui.js:548-561; wt-21-metro.png, wtm-21). The current station is not marked and the hub row is identical whether you are there or not.
- impact: A first-timer picks a random name; nothing suggests 'next stop on your line'.
- fix: Pin 'You are here' and 'Next stop' rows at the top, collapse other lines, show stop count and dialect family per line.

### [LOW] walkthrough-27 — Developer graphics dropdown ('graphics auto') always visible in the player HUD, including phones  (hud, effort S)
- where: public/play/index.html:261
- evidence: #gfx with a <select> is fixed bottom-right (index.html:132-135, 261-270), 11px monospace, visible in every screenshot including wtm-02 and wtm-31b where it overlaps the dialog corner (gfx×dialog).
- impact: Looks like a debug leftover and steals the corner from a proper settings entry.
- fix: Move quality into a settings sheet opened from an icon button; keep auto by default.

### [LOW] walkthrough-28 — Drill level labels climb to B2/C1 but the bank has 13 B2 and zero C1 items  (lies, effort S)
- where: public/play/src/grammar.js:31
- evidence: LEVELS includes C1 and level = LEVELS[min(4, floor(stopIdx/3)+laps)] (grammar.js:19,31,41); the bank has A1 58, A2 132, B1 98, B2 13, C1 0 (bank stats), with conditionals holding only 7 items total. buildSession falls back to the closest level (grammar.js:83-87), so a 'C1' drill after two rounds serves A2/B1 sentences.
- impact: Round 3 promises 'new, harder exercises' and delivers the same difficulty with a false label.
- fix: Cap the label at the highest level actually present for that concept and say 'Round 3 mix' instead of C1 until content exists.

### [LOW] walkthrough-29 — Third local in every district is template filler with no voice  (content, effort M)
- where: public/play/src/dialects.js:101
- evidence: zones.json has exactly 2 authored npcs per district (npc counts {2: 44}); districtCastFor pads to 3 with 'Welcome to X. I'm Y; listen for the <dialect> rhythm while you explore the neighbourhood.' (dialects.js:101-112) and voiceId is null for i=2 (zones.js:573), falling to browser TTS. Probe local Amara Clarke in uk_rp is such a fill (hub.npcs_onscreen).
- impact: One third of the required locals per round are identical greeters, visible in the very first district.
- fix: Author the third local per district (name, role, one-line greeting) in zones.json and bake their line; until then, make the round total 2.

### [LOW] walkthrough-30 — Viewport meta disables pinch zoom  (accessibility, effort S)
- where: public/play/index.html:5
- evidence: index.html:5 `maximum-scale=1, user-scalable=no`.
- impact: Low-vision learners cannot zoom the 9-12 px HUD text on phones.
- fix: Drop user-scalable=no and handle gesture conflicts on the canvas with touch-action instead.

### [LOW] walkthrough-31 — 'Tutor Conductor' role uses the teacher synonym the owner ruled out  (owner-rule, effort S)
- where: public/play/src/world.js:65
- evidence: world.js:65 role 'Tutor Conductor' is rendered in the dialog header ('Conductor Clara — Tutor Conductor', ui.js:178) and prompt. No other player-facing 'teacher' string exists (grep of index.html, src/*.js, zones.json).
- impact: The first local a player meets is labelled with a teacher word.
- fix: Rename to 'Station Conductor'.

## Opportunities

### Script the first ten minutes as a guided arrival, not five text pages  (effort L, cost 3-5 days)
- why: Today: BEGIN -> 5 text cards -> toast -> you stand nose-to-slab with 4 ❗ somewhere behind you, the nearest 15 m away past benches. A professional opener would be: (0:00) tram pulls into Central, doors open, Wren steps onto the platform with the camera on a slow orbit over the plaza; (0:10) Conductor Clara walks up to you (locals can approach, not just wait) and the first dialog uses the two-shot camera; her warm-up is framed as your ticket check; (1:00) her drill teaches the first-attempt scoring with 3 questions, not 7, and the +XP lands as a counter tween; (1:45) the objective chip appears for the first time with a ground trail to Marek; (3:00) after Marek, a street local on the way to the Isles platform gives the one-question 'quick one' so the crowd is introduced by doing; (4:30) the platform zone glows, T is prompted, the tram arrives and the ride is a 4 s dolly along the line; (5:00) arrival on the Queen's Mile platform looking down the terrace with Mrs Pemberton-Smythe's ❗ in frame and her greeting voice playing; (6:00-9:00) two locals, one street exercise, first district round closes with the fanfare and a journal reveal; (10:00) the map opens itself once with 'you have unlocked 1 of 44' and the next stop highlighted. The gap: every beat exists as a system but none is sequenced, framed or timed.
- how: A tiny scripted-event layer (array of steps with predicates: distance to NPC, dialog closed, ride done) that drives camera targets, prompt text, objective chip and one highlight trail; store `em_onboarded` when done. Reuse existing FollowCamera by adding a `target override` and `arm override`.

### Conversation camera and NPC attention  (effort M, cost 1 day)
- why: Every conversation currently frames the back of Wren's head (walkthrough-02); the locals have baked voices and idle/wave clips nobody sees.
- how: On dialog open: exclude people colliders, lerp camera to an over-the-shoulder two-shot with a slight dutch, dolly the arm to 3.2 m; NPC mixer plays Wave then idle with head lookAt(player). On close, ease back over 0.4 s. In three.js this is just a second target/offset pair fed to FollowCamera plus Object3D.lookAt on the head bone.

### Wayfinding that never lets the player be lost  (effort M, cost 2 days)
- why: Objective says 'help 3 more locals' but arrival shows a wall and markers float over hidden bodies; the platform zone is invisible; the map has no names on phones.
- how: Screen-edge indicator for the nearest unhelped ❗ (project to NDC, clamp to screen edge with a chevron), a faint ground trail (instanced quads along a straight path, fading with distance) toggled by the objective chip, a glowing platform disc mesh at each stop, and always-on labels on the paper map for visited stations.

### A feedback layer worth the effort the learner puts in  (effort S, cost half a day)
- why: The +57 XP toast is never seen; the pass/fail reveal is a text line; sounds are the same ping at different pitches.
- how: Toast queue below the objective; XP counter tween with an easing pop; per-question first-try dots turning green/red; on pass a 0.6 s confetti burst (InstancedMesh of 120 quads with gravity) around the local and their ThumbsUp clip; distinct correct/wrong/round-complete samples.

### Touch-native interaction  (effort M, cost 1-2 days)
- why: Phones get 'Press E', no help, an unlabelled map and a dialog that covers the joystick.
- how: Raycast taps on NPC markers/bodies to talk (no button needed); prompt copy keyed on body.touch; ? help button; two-tap station selection with a label card; landscape grid layout; move prompt above the stick.

### Author the first-contact content by hand  (effort L, cost 3-4 days of ESL authoring)
- why: The hub and stop-0 drills are the game's audition; today they mix recycled distractors and 2-option items (walkthrough-18) and the third local in each district is a template greeter.
- how: Hand-write the 4 hub concepts and the 6 first-stop concepts (articles, plurals, prepositions, verb_tense, subject_verb, questions) as 10 items each with 3-4 parallel options and L1-contrast explanations; write the third local for the 6 first-stop districts and bake Kokoro lines; add a bank lint to the build script so the mined items cannot regress.

### Close the gap to the Messenger look on the arrival shot  (effort L, cost 1 week art-direction pass)
- why: The one frame every player sees after their first ride is a flat teal facade back in FogExp2 murk; the district descriptions promise cream Georgian terraces and wisteria.
- how: Per-district facade language (the palette exists; add 2-3 silhouette presets per line so Queen's Mile gets sash windows, railings and a pillar box prop), a projected cloud-shadow texture scrolling over the ground (one extra multiply in the toon fragment), inverted-hull outlines on locals and hero, and a warmer key light in districts than the hub's Miami neon so each stop feels like a different time of day.

### State hygiene: one modal manager, one Escape, one blocked predicate  (effort S, cost half a day)
- why: Stacking, Escape and walk-while-reading bugs (walkthrough-09/10/11) share one cause: overlay state lives in six places.
- how: ui.openPanel(name)/closeTop() with a stack; `ui.blocked` getter used by simTick, camera, hotkeys and prompt; Escape pops the stack.

## Screenshots
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-00-loading-begin.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-01-welcome-p1.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-01-welcome-p3.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-02-hud-first-view.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-02b-hud-toast-gone.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-03-guide.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-04-after-walk.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-08-standing-in-car.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-09-hub-local-prompt.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-10-dialog-greeting.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-11-overlay-stack.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-12-drill-q1.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-13-drill-q1-wrong.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-15-drill-result.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-16-after-drill-hud.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-17-dialog-done-state.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-18-journal.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-19-map.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-20-map-hover.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-21-metro.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-22-arrival-queens-mile.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-22b-arrival-lookback.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-23-T-after-walk.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-23b-map-click-refused.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-24-district-local.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-25-district-dialog.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-27-district-warmup-done.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-28-street-prompt.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-29-street-dialog.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-30-street-answered.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-31-resize-800x500.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/supp-01-markers-from-spawn.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/supp-02-markers-close.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/supp-03-dialog-camera.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-01-welcome-p1.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-02-hud-first-view.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-04-after-walk.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-09-hub-local-prompt.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-10-dialog-greeting.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-12-drill-q1.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-15-drill-result.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-18-journal.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-19-map.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-21-metro.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-22-arrival-queens-mile.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-28-street-prompt.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-31-landscape.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wtm-31b-landscape-dialog.png
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-desktop.log
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-mobile.log
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-supp.log
- /tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/wt-persist.log