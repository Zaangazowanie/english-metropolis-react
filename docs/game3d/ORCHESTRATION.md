

*(You are sandboxed: no VPS access. Everything you need is in this repo via
your GitHub access — this file, CONTRACT.md, the template, the catalog, the
source. Ricky on the VPS handles merge/deploy; report blockers to Mike.)*
# Mission: EM "Fluent City" 3D Arcade — orchestrate Fable 5 build agents on Hyperagent

You are orchestrating the transformation of English Metropolis's Practice tab
(38 exercise modules, React SPA) into a unified world of high-quality three.js
browser games — **"The Fluent City"**: storybook low-poly London at dusk,
Bajla the purple owl as guide, every game a city district. The practice
experience becomes the public home page. Mike approves direction; Ricky (the
VPS agent) is the integration/merge/deploy gate.

## Ground truth (verified on the VPS 2026-06-12 — do not re-derive)

- **Repo:** `Zaangazowanie/english-metropolis-react`, branch **`gold-deploy`**
  (PRs target it; never push to it directly).
- **The contract is IN the repo** (commit `8dfe21f`) — every agent must read
  these after cloning; they are binding:
  - `docs/game3d/CONTRACT.md` — build rules, budgets, art direction
  - `docs/game3d/STORYBOARD-TEMPLATE.md` — required storyboard format
  - `src/practice/shells3d/types.ts` — the component contract (Game3DProps:
    `puzzle`/`vocab` in → `onSessionComplete(SessionResult)` out)
  - `scripts/game3d-budget-check.mjs` — the budget gate (run it locally before
    opening any PR: `npm ci && npm run build && node scripts/game3d-budget-check.mjs`)
- **The 3D stack is already a dependency**: `three@0.184`,
  `@react-three/fiber`, `@react-three/drei`. **package.json/lockfile must
  never change** — a diff there auto-fails the gate.
- The 40 existing 2D shells in `src/practice/shells/` + their generators in
  `src/practice/generators/` are the canonical mechanics. A 3D game re-skins
  one shell; it never invents new pedagogy, data flows, or backend calls.
  `src/practice/shells/Hangman3D.tsx` is the canonical mood reference
  (lantern alley, dusk, owl).

## Hard constraints (gate-enforced; PRs violating these get closed)

1. No new npm dependencies, ever (security posture — non-negotiable).
2. No external URLs at runtime — no CDNs, no remote fonts/textures/models
   (GDPR/CSP). Assets are committed, same-origin: `public/games/<shellKey>/`.
3. Budgets (gzipped): per-game chunk ≤ 250 KB; shared `vendor-three` ≤ 350 KB;
   per-game static assets ≤ 2.0 MB. Prefer procedural geometry + vertex
   colors + gradient atlases over GLBs; Draco-compress any GLB.
4. Performance: 60 fps on mid-range (Iris Xe / GTX-1050 class), 30 fps floor
   on `quality='low'`; draw calls < 150; DPR ≤ 1.5; no per-frame allocations.
5. Every game playable anonymously (built-in demo puzzle when no
   `puzzle`/`vocab` prop), keyboard + touch input, `reducedMotion` honored,
   canvas `aria-hidden` with text announcements.
6. English text the learner must read = crisp DOM/HTML overlay, never baked
   into 3D textures.
7. Frontend-only: NO Convex schema/function changes, no nginx, no deploy
   scripts, no `.env`. (Server-side tiers/payments are a separate later phase
   that Ricky runs.)
8. One game per PR; branch `game3d/<shellKey>`; PR body links the approved
   storyboard and embeds a screenshot or GIF of real gameplay.

## Your working agreement (orchestrator boundaries)

- You spawn and drive Fable 5 agents via Mike's Hyperagent account (agent
  creation requires HIS account — coordinate with him, don't work around it).
- You may open PRs through agents. **You never merge, never deploy, never
  modify repo settings/permissions, and never request new permission rules or
  classifier bypasses** — if something is blocked, report the blocker to Mike
  and continue other lanes. Ricky merges after gate review and deploys from
  the VPS under the existing deploy discipline.
- If CI (`game3d-gate`) is red on a PR, the building agent fixes it; don't
  hand red PRs to Ricky.

## Pipeline (run it exactly like this)

**PR 0 — Foundation (one Fable 5 agent, first, blocking):**
- Install `.github/workflows/game3d-gate.yml` by copying
  `docs/game3d/game3d-gate.yml.example` verbatim (Ricky's token lacked
  workflow scope; agent tokens via Mike's account can do this).
- Build the shared GameKit in `src/practice/shells3d/kit/`:
  `CityStage` (canvas wrapper: WebGL detect, quality autodetect → DPR/shadow
  presets, error boundary that calls `onError` so hosts fall back to the 2D
  shell), `useGameLoop` (fixed-step rAF, pauses on tab blur), `Bajla`
  (procedural low-poly purple owl: idle/flyby/celebrate), `palette.ts`
  (the Fluent City colorway: dusk blues #1a2348→#2d3a6b, lantern amber
  #ffb347, brass #b08d57, leaf #7fb069, Bajla purple #8b5fbf — tune against
  Hangman3D), and a `registry.ts` exporting `Game3DRegistryEntry[]`.
- Keep the kit itself within one 80 KB gz chunk.

**Per game thereafter — two stages, two agents:**
1. **Storyboard agent (Fable 5):** clone repo, read CONTRACT + the target 2D
   shell + its generator, write `docs/game3d/storyboards/<shellKey>.md` per
   the template. Open a docs-only PR. *Storyboards may fan out for the whole
   wave in parallel — they're cheap.*
2. **Gate:** you review each storyboard against the template's checklist
   (fantasy clarity, asset budget table, quality tiers, input map). Post your
   review on the PR. Mike may veto. Ricky merges approved storyboards.
3. **Build agent (Fable 5):** implements `src/practice/shells3d/<Name>3D.tsx`
   per the merged storyboard + contract, registers it in `registry.ts`, runs
   the budget gate locally until green, opens the build PR with screenshot.
   *Max 4 build agents concurrent* (review capacity, not compute).
4. **Gate:** CI green + your orchestrator review + Ricky's contract review +
   real-browser play test on the VPS. Ricky merges. Deploys batch at wave
   boundaries (Mike's "ship").

## Wave 1 (build in this order)

| shellKey | Title | Fantasy seed (storyboard agent may improve, mechanic may not change) |
|---|---|---|
| — (hub) | **City Hub** | New home page: dusk London map, glowing districts launch games, header universal sign-in, sign-up CTA after one anonymous round, fullscreen requires account |
| snake | Metro Snake | Toy metro train in the Underground collects word-carriages |
| mazechase | Museum After Dark | Moonlit museum maze; statues chase; grab correct exhibit cards |
| balloonpop | Thames Balloon Festival | Pop drifting lantern-balloons carrying the right words |
| whackamole | Camden Pop-Up Pigeons | Bop pigeons holding word signs at market stalls |
| airplane | Paper Plane Post | Fly a paper plane through correct word-clouds over rooftops |
| battleship | Bathtub Fleet | Periscope toy-boat battle on the Serpentine |
| spinthewheel | Pier Carnival Wheel | Golden-hour pier wheel, Bajla as barker |
| openthebox | The Vault Job | Crack brass vault doors in a marble bank hall |

The City Hub is the flagship — assign your strongest storyboard pass there.
It also absorbs the "universal login" requirement (one form, tries student
then admin login — see `src/views/v3/Login.jsx` tabs to collapse).

Waves 2 (12 scene-staged games) and 3 (18 diorama-framed text games) follow
the same pipeline — full catalog: docs/game3d/GAME-CATALOG.md.

## Tier gating (Wave 1 scope only — client-side, soft)

Anonymous: City Hub + featured-game-of-the-day, contained viewport, CTA after
one round, fullscreen → sign-up prompt. Signed-in: all games. That's it for
now — no payments, no server enforcement, no Convex changes. Don't build more
gating than this.

## Reporting

After each wave-1 stage, report to Mike: PRs opened (links), gate status,
budget numbers per game (chunk KB gz / asset MB / measured fps tier), and
blockers. Keep it to one screen.

## Addendum 2026-06-12 — Home page premise + attract video directive

The public home page of englishmetro.com is now the **arcade itself**
(`src/views/v3/GameHome.jsx`, live route `/`): instantly-playable games, a
departures board, and a stations grid. **It is the shop window for everything
you build.** Two standing consequences for your pipeline:

1. **Games land on the home page automatically.** The grid and departures
   board merge `src/practice/shells3d/kit/registry.ts` at render time, and the
   eight Wave-1 titles already show as "ARRIVING SOON · 3D". A build PR that
   appends its registry entry is ALL a game needs to appear on the home page —
   never edit GameHome.jsx from a game PR (it's outside the allowlist anyway).
2. **No student/school/admin framing, ever, in anything user-facing you
   build for the arcade.** Player-first language only. The CI-verified
   wordlist on home: student, school, admin, teacher, booking — all forbidden.

### NEW DELIVERABLE — gameplay attract video (assign one Fable 5 agent)
The hero has a wired, self-disabling video slot: `<AttractVideo>` plays
`public/home/attract.webm` (poster `public/home/attract-poster.jpg`) as an
ambient full-bleed layer the moment those files exist; until then it renders
nothing. Produce them:

- **Content:** a 8–12s seamless loop of REAL gameplay montage — capture the
  actual shells (run the app in your sandbox, record headless via CDP screen-
  cast or screen capture), 3–4 games, quick cuts, dusk-palette grade. As 3D
  games merge, refresh the reel to lead with them.
- **Budget (gate-enforced ideas apply):** webm/VP9, 1280×720, muted, no audio
  track, ≤ 4.0 MB; poster jpg ≤ 150 KB. It's an ambient layer at 26% opacity
  behind text — bitrate can be low.
- **Constraints:** same-origin assets only, no new deps, PR with only
  `public/home/*` files + a docs note. This path is OUTSIDE the current
  allowlist, so the PR will be held for Ricky's manual review — expected.
- Optional follow-up (after Wave 1 merges): per-game 6s clips at
  `public/home/clips/<shellKey>.webm` ≤ 1 MB each for hover previews.
