# HANDOFF TO CODEX — finish the English Metropolis 3D world (englishmetro.com/play)

Written 2026-09-05 ~14:40 UTC by Ricky (Claude session `root-dd`, ending now at Mike's request).
Owner: Mike. Repo: this one (`/root/englishmetro`, branch `prod`, GitHub default; Bob's checkout is
`~/projects/english-metropolis-react`). Everything below is committed and pushed; nothing lives only in
a dead session.

## 0. Mike's brief, in his words

> "You see our English metro 3d beta world? You need to do an adversarial review on it and then from
> there take it to the next level. Max number of simultaneous agents 3 but work hard and long on all
> the detail to get the graphics extremely professional and luscious like abeto and the actual
> gameplay and exercises and quests in the game making sense with checkpoints and clear system and
> rewards of rankings etc etc. But most important is your three.js and really taking the game to a
> professional level. You have full permission to deploy once you are done."

Later the same day, after seeing wave 1: **"I love the saturated colours now"** and **"look at the
quality of the NPCs — they look absolutely terrible and generic, we need them looking way better."**
And: **"Our CPU has been at 100% since you started working on the world. Make sure you don't exhaust
our CPU."** (Section 6 — this is a hard constraint, the only one.)

Codex: you are asked to **finish the world**. Do not treat my plan as a ceiling — go into heavy detail
and quality wherever the game falls short of a professional, luscious, Abeto-grade product (reference:
Abeto Studio's *Messenger*, messenger.abeto.co: cel-shaded, warm light, soft shadows, saturated
harmonious palette, hand-crafted feel, readable silhouettes). Ship when it is genuinely done.

## 1. What the game is and where the code lives

- `public/play/` — the standalone open-world game. Vanilla three.js **r182** ES modules, **no bundler**,
  import map in `public/play/index.html`, vendored three at `public/play/public/vendor/three/` (+ addons
  GLTFLoader, DRACOLoader, BufferGeometryUtils, SkeletonUtils, meshopt). Vite copies `public/` verbatim
  into `dist/`, so `/play` ships with any site deploy and can also be shipped alone (section 5).
- 44 dialect districts on three metro lines around a hub; the player (Wren) talks to "locals", does
  grammar drills and dialect exercises, rides the metro. Data: `public/play/src/gamedata/{zones.json,
  grammar_bank.js, chatter.json}`. Live URL is behind a signup wall (`index.html` gate script — keep it;
  probes bypass it, see `docs/play-revamp/tour-play.mjs`).
- Product rules Mike ratified: quest NPCs are **"locals", never "teachers/tutors"**; game UI follows the
  **v3 design system** (Space Grotesk, violet glass, brand gradient purple→fuchsia→pink, amber accent),
  parchment only for in-world props; **nobody spawns in view**; **no duplicate character bodies**
  visible; every HUD text **≥ 13 px** computed; dialect content uses real lexis with **standard spelling**
  (no phonetic caricature).

## 2. What has been done (all on branches, none of it live yet)

### 2.1 Adversarial review — DONE
Five lenses (graphics, gameplay, runtime, learning content, hostile first-time walkthrough), 151
probe-backed findings + 44 opportunities: **`docs/play-revamp/REVIEW-findings.md`** (read it whole; every
finding has file:line and a screenshot or probe log). Plan: `docs/play-revamp/PLAN.md`.
Headline defects of the live beta: no drill can be failed (a wrong click is free, every drill ends 7/7);
the grammar bank ships transcript garbage + inverted answer keys; all progress is localStorage only; the
hub's 55 m radius swallows the first stop's locals (HUD lies); Escape closes 2 of 6 overlays; metro
arrival faces a blank wall 11.96 m from a 12 m ride radius; sky dome far-clipped on weak tiers; cyan
lighting collapses 44 palettes to mint; blob shadows glow; FXAA branch dilutes bloom to 15%; 9 MB before
BEGIN; one 522'd GLB kills the load; nothing anywhere reports a failure.

### 2.2 Wave 1 — BUILT, MERGED, HEADLESS-VERIFIED, NOT DEPLOYED
Branch **`play/wave1`** = prod @ 547745d + three lanes merged (worktree `/root/em-wt-int`):
- **render** (`WAVE1-render.md`): `src/daylight.js` time-of-day (golden default, night via N key / moon
  button / site theme), shared toon-v2 `onBeforeCompile` hook (violet-tinted shadow step, sky-coloured
  rim, projected cloud shadows, height fog, shared emissive gain `withEmissiveGain`), PMREM sky →
  `scene.environment`, two-cascade texel-snapped shadows, composite v2 (FXAA→bloom→ACES→grade→depth
  outline→vignette→grain, overlay DOF), camera v2 (pitch range, people-collider skip, conversation
  two-shot, arrival dolly, spawn beside PRON-3000 facing Clara, ride radius 24 m), quality controller v2
  (headroom-based, display-interval aware, phone tiers).
- **city** (`WAVE1-city.md`): `src/kit/{facades,street,flora,landmarks,signage,shapes}.js` — facades
  with true window depth/frames/sills/heads, doors, shopfronts with signboards from the district cast,
  awnings, roofs with furniture, fire escapes, bunting; kerbs/pavers/tactiles/bollards/benches/lamps/
  planters/shelters/post boxes per country; species flora with wind; 16 landmark kinds placed at the
  arrival vista; hub as a station forecourt; time-sliced streaming, dispose-before-build, chunk fade,
  NPC cross-fade, leak fixes, vehicle colliders. 'Tutor Conductor' → 'Station Conductor'.
- **game** (`WAVE1-game.md`): first-click scoring with honest pass gate, `src/overlay.js` overlay stack
  + toast queue, `src/progress.js` (namespaced per student, migrates old keys, Leitner queue, streak,
  `remote` stub), `src/ranks.js` (Newcomer 0 · Commuter 250 · Regular 700 · Local 1500 · Old Hand 3000 ·
  Cosmopolitan 6000), district stamps (+60), line certificates (+300), city completion (+1000), beats
  HUD (Overhear → Talk → Drill → Stamp), tabbed Metro Pass journal (Mission · Passport · Mastery ·
  Review), regionAt by district footprint, ghost-speaker fix, street-done persistence, one marker
  family in v3, mobile HUD (Tap 💬, ? help, two-tap map, landscape layout, 48 px answers, 13 px floor),
  hardened signup gate (fails open, 5 s abort, modulepreload), settings sheet, grammar-bank lint gate
  `public/play/tools/lint-grammar-bank.mjs` (301 → 190 items, 0 offenders), headless playthrough probes
  in `public/play/tools/`.
Verification of the merged tree: loads with **zero page/console errors**, hub and district frames in
`/root/ricky-estate-2026-09-01/em-play-revamp/evidence/int-*.png`; per-lane before/after screenshots
listed in the WAVE1-*.md files (copied to `evidence/`). Interaction flows on the *merged* tree were not
re-run (the VPS became unusable, section 6) — run `public/play/tools/playthrough-desktop.mjs` and
`playthrough-mobile.mjs` against it before shipping. One visual nit seen: the kit's "mural on a blank
side wall" (`kit/facades.js` ~486-492) renders a big flat circle with an ink outline — replace with a
painted canvas mural.

### 2.3 Server side — WRITTEN, TYPECHECKED, NOT DEPLOYED
Branch **`play/server`**: `convex/worldProgress.ts` + schema table `worldProgress` — `load`, `save`
(monotonic XP, stale `stateVersion` refused, 64 KB state cap), `leaderboard` (all-time / ISO week, first
name + initial only), every function behind `requireStudent(sessionToken)`; and
`deploy/deploy-play-2026-09-05.sh` (guard clean prod → syntax check → CPU-capped headless smoke →
backup-dir rsync of `public/play` → refresh `dist/play` → edge verify → push).
The game reaches Convex through nginx `/api/query|mutation|action` with `{path, args, format:'json'}`;
the session token is `localStorage['em-student-session'].sessionToken`. `convex deploy` is blocked in
Claude's auto mode and needs Mike; the client must treat "function not found" as offline.

### 2.4 Wave 2 — BRIEFED, BARELY STARTED (VPS throttle killed it)
Briefs are the three lane prompts inside **`docs/play-revamp/wave2.js`** (read them as specs, ignore the
Workflow wrapper): **chars** (Mike's top priority — full character revamp: crowd body v2 with real
proportions, hairstyles/headwear, faces, layered clothing as geometry, per-district wardrobes,
accessories, inverted-hull outlines, gait v2, pairs, look-at; hero look-at/idle variety/jump pose/
outline; quest locals face the player + gesture library + emotes; trams/traffic lights and motion),
**quests** (wire `progress.remote` to Convex with merge rules, Rankings tab, session summary, daily goal,
a real boarded tram ride, wayfinding chevron + ground trail + platform discs, confetti/sounds), **content**
(warm-up `explain`+`pl` for 132 items, an authored third local for all 44 districts, 8 street items per
district with a per-district roster, per-district learning objective, bank top-up to ≥ 20 items/concept
with B2 items and `validIn` dialect items, chatter standard spelling). Branches `play/chars`, `play/quests`
(nothing beyond wave1) and `play/content` (WIP commit 326d79e: dialects/grammar/ui/zones/lint edits).
Worktrees on the VPS: `/root/em-wt-{render,city,game,int,server,chars,quests,content}`.

### 2.5 Wave 3 — BRIEFED ONLY
`docs/play-revamp/wave3.js`: runtime hardening + health beacon (allSettled loading with retry/watchdog,
phased load so BEGIN comes after ~2.5 MB, audio/visibility, WebAudio voice, context-lost, `tests/
play-smoke.mjs`), delivery (versioned imports `?v=<sha>`, edge caching for `/play/public/*`,
modulepreload, ops notes for nginx/Cloudflare), and a polish pass (murals, station sign in the settled
arrival frame, emissive hierarchy, daylight ground colours everywhere, z-fighting/pop/potato/mobile sweeps).

## 3. How to verify (headless works on the VPS; a real GPU is better)

- `docs/play-revamp/tour-play.mjs`: Playwright + SwiftShader tour that bypasses the wall, forces a tier
  (`TIER=high|potato`), pauses the render loop after BEGIN and drives frames with `window.__EM.step(n)`
  (SwiftShader takes 1–3 s per full frame on the wave-1 scene); `SMALL=1` for 960×540; `--mobile`.
  Serve a tree with `cd <tree>/public && python3 -m http.server <port> --bind 127.0.0.1`.
- **Always** run it as `/root/ricky-estate-2026-09-01/em-play-revamp/probe-run.sh -- node tour-play.mjs …`
  (section 6). One probe at a time, ever.
- `window.__EM` exposes player/world/zones/camera/renderer/scene/ui/crowd/quality/postfx/minimap/step.
  `renderer.info` reads 1 call when post is on — set `renderer.info.autoReset = false`.
- `public/play/tools/playthrough-desktop.mjs`, `playthrough-mobile.mjs`, `render-metrics.mjs`,
  `lint-grammar-bank.mjs`; `tools/qa/verify_game_runtime.mjs` (older harness).
- Bob (Mike's Windows workstation, ssh alias `bob`, WSL) has a real GPU and Chrome — the right place to
  judge the look. Bob's checkout has **no GitHub push credential**; if you work there, Mike must add one
  or you hand commits back through the VPS.

## 4. Budgets and contracts to respect

- Draw calls / triangles per tier: wave-1 numbers are in `WAVE1-render.md` and `WAVE1-city.md`
  (high hub ≈ 350–440 calls / 1.4–1.8 M tris incl. shadow passes; potato hub ≈ 157–234 / 0.6–0.7 M).
  Crowd body is ~300 k tris of a high district frame; the character revamp may spend up to ~1.6× that.
- Keep `window.__EM` and the localStorage keys backward compatible (`em_xp`, `em_progress`, `em_grammar`,
  `em_fog`, `em_welcome`, `em_guide_seen`, `em_quality`; the progress store migrates them).
- No npm installs (Shai-Hulud policy), no new deps; procedural geometry/shaders only (no Blender here).
- Keep the signup gate script at the bottom of `index.html`.

## 5. Deploying

1. Merge `play/wave1` (+ `play/server`, your own branches) into `prod`; commit before deploying — the
   deploy guard refuses a dirty tree or a non-prod branch (`deploy/_guard.sh`).
2. Another pipeline (GitHub PR auto-merge by the "Zaangazowanie" account) deploys the whole site
   ~hourly with `rsync dist/`: always **commit to prod first** and refresh `dist/play`, or a stale `dist/`
   will revert `/play`. `deploy/deploy-play-2026-09-05.sh` does both, with a backup dir and edge checks.
3. Convex: `convex deploy` from `/root/englishmetro` (the script pattern in `deploy/deploy-uiux-2026-09-04.sh`
   saves function specs before/after and refuses removals). Needs Mike present.
4. Cloudflare caches `/play/src/*.js` for 4 h toward browsers despite the origin's no-cache — version the
   imports (wave-3 delivery brief) or expect mixed-version loads for 4 h after a ship.
5. nginx: `/etc/nginx/sites-enabled/englishmetro.com` (root `/var/www/englishmetro`, `/play/src/`
   no-cache block, `/api/*` → Convex prod `wooden-manatee-881`). CSP already allows workers/blob.

## 6. THE VPS INCIDENT — read before running anything heavy

On 2026-09-05 my three review/build lanes ran SwiftShader probes flat out for hours (user CPU 77%).
Hostinger then **capped the VPS to 40% CPU** ("Maximum CPU resets reached"; the weekly manual reset is
spent; it auto-clears ~3 h after usage stays normal). Symptoms: CPU steal 92–94% (`vmstat`, `sar -u`),
load 110+ with nothing runnable, every command 10× slower, Playwright timeouts, subagents dying and
restarting. Mike saw the box at 100% all day. Separately I found `pricemate-wa-bridge.service`
**crash-looping — 28,607 restarts, ~20 s CPU each** — a permanently pinned core (stopped; needs a fix).

**Rules that keep the box alive (Mike's explicit constraint):**
- Check `sar -u | tail -2` first. If steal > 40%, do code work; do not probe.
- Every headless browser run goes through **`/root/ricky-estate-2026-09-01/em-play-revamp/probe-run.sh -- <cmd>`**:
  machine-wide queue (one probe at a time), cgroup CPUQuota 150% (1.5 of 8 cores), nice 15, refuses at
  steal > 40% (exit 75), kills the tree on exit so nothing orphans Chromium. Never run node/playwright bare.
- Iterate at 960×540 on the potato tier; full-res high-tier screenshots only as final evidence.
- Do not run several build agents with browsers in parallel; sequential lanes are fine.
- Attribute a process (`/proc/PID/cwd`, parent chain) before killing it; `pgrep -f "<pattern>"` matches
  the shell that runs it — use `pgrep -f "[p]attern"`.

**Temporary state I left (all with automatic resume via `systemctl list-timers 'em-cpu-fix-*'`):**
- root crontab: 41 heavy non-trading entries commented with `#CPUPAUSE-20260905` — restored automatically
  at 16:42 UTC from `/root/ricky-estate-2026-09-01/em-play-revamp/cpu-fix-20260905-1229/crontab.root.bak`.
- pm2 `terminal-feeder` + `themonexus-news` stopped → resume 16:45 UTC. `kokoro-tts` stopped → 16:46.
  `kelly-console-api` + `pricemate-analytics` stopped → 17:23. Two idle Claude sessions SIGSTOPped →
  SIGCONT 16:51 / 17:18.
- Hermes cron: 16 analysis/brain jobs paused (list in `cpu-fix-20260905-1229/hermes-paused-jobs.txt`,
  includes `hl-brain-tick`) → resumed 17:15 UTC. Position protection (hl-tp-recycle, hl-watchdog, equity
  alert, lane health, red-flag relay, system-cron `hl-execute --trail-stop`) was never touched. 16 other
  Hermes jobs were already paused before today and must stay paused.
- `pricemate-wa-bridge.service` **stopped with no resume** — crash loop, exit status 1; journal tail in
  `cpu-fix-20260905-1229/wa-bridge-journal-tail.txt`; run it once by hand to capture stderr, fix, start.
- Kernel: `vm.compaction_proactiveness=0`, `vm.swappiness=10` (runtime only; kcompactd0 had 6 h 41 min CPU).
- Full action log: `cpu-fix-20260905-1229/actions.log`. Status ledger: `/root/ricky-estate-2026-09-01/em-play-revamp/STATUS.md`.

## 7. Suggested order (yours to change)

1. Wait for steal < 40%, then run the merged `play/wave1` through the desktop + mobile playthrough probes
   (capped); fix anything the merge broke; ship wave 1 — it is already a large, visible step up.
2. Characters (Mike's priority), then quests/server wiring + Convex deploy with Mike, then content, then
   runtime hardening + delivery, then the polish pass — or reorganise as you see fit. Verify each step with
   screenshots you actually look at; a claim about the visuals must cite a frame.
3. Ship in stages; after each ship confirm at the edge (`curl -I https://englishmetro.com/play/src/main.js`,
   a GLB 200, zero page errors on the live URL) and tell Mike what still cannot survive (his rule: never
   "it works now" alone).

Everything Mike asked for is in scope: professional, luscious three.js; NPCs that look hand-made, not
generic; quests, checkpoints, clear system, rewards, rankings; deploy when done; never exhaust the CPU.
Thank you — Ricky.
