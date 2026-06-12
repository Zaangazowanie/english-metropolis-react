# City Hub — city-hub

> Wave-1 **flagship**. Docs-only storyboard. `city-hub` is a routing/home label,
> **not** a 2D shell key — the Hub re-skins no single mechanic. Written against
> the GameKit's documented contract (ORCHESTRATION.md PR-0 spec +
> `src/practice/shells3d/types.ts`); `kit/` lands in the Foundation PR — see Risks.

**District:** **The Central Square** — a lantern-lit London-at-dusk plaza players
spawn into. The ring of buildings around it are the game districts; a brass
gatehouse folds in the universal sign-in. This screen becomes the public home
page of English Metropolis and the navigation spine for every practice game.

**Base shell:** _None._ The Hub enumerates the Wave-1 games from
`src/practice/shells3d/kit/registry.ts` (`Game3DRegistryEntry[]`: `shellKey`,
`title`, `district`, `load`). On entry it calls `load()` to lazy-load that game's
own 3D shell, with the matching 2D shell in `src/practice/shells/` as the
automatic fallback (host swap, per `types.ts`). Shell route keys come from
`src/practice/lib/shell-selector.ts`. Closest analog to the "host" named in
`types.ts`: _StudentPractice / playable home_.

**Generator:** _None._ The Hub presents no puzzle of its own — pedagogy lives in
the entered game's generator (`src/practice/generators/`). The anonymous landing
plays the featured game using that game's built-in demo puzzle (`Game3DProps`
with no `puzzle`/`vocab`).

## Fantasy (2–3 sentences)
You arrive at blue-hour in a storybook London square: paper lanterns strung
overhead, Big Ben and St Paul's in silhouette, wet cobbles catching the amber
light. Bajla — a small purple owl — swoops down to greet you and sweeps a wing
across the plaza, where each glowing building is a different word-game district.
You pick a lit doorway and the city folds you inside; a brass-and-glass gatehouse
by the entrance is where you sign in to light up the whole metropolis.

## Camera & stage
- **Camera:** a single `PerspectiveCamera`, fixed ¾-isometric framing of the
  square (FOV ~35°, near-ortho feel). Idle = slow orbital drift + clamped
  mouse/gyro parallax. On **enter** = a short dolly-push toward the chosen
  doorway that cross-fades into the loading game. No free user camera (keeps
  culling and draw distance predictable). Drift + parallax disabled under
  `reducedMotion`.
- **Stage:** dusk plaza at blue hour. Ground = low-poly wet cobble with warm
  lantern reflections; a ring of 8 district buildings + a central landmark
  (fountain/lamppost); paper-lantern strings overhead; a London skyline backdrop
  (Big Ben, London Eye, St Paul's — per `Hangman3D.tsx`); deterministic
  twinkling stars + moon. Palette (`kit/palette.ts`, tuned against `Hangman3D`):
  dusk blue `#1a2348`→`#2d3a6b`, lantern amber `#ffb347`, brass `#b08d57`, leaf
  `#7fb069`, Bajla purple `#8b5fbf`. Light rig: vertex/baked ambient + one warm
  hemispheric tint + emissive lantern/window materials; **at most one** cheap
  directional shadow (high tier only).
- **Bajla's role:** intro flyby on spawn (arc across the square, lands on the
  central lamppost); persistent idle guide beside the player; points to the
  featured district; one-line hover hint per building; celebrate loop on return
  from a game with the round score. Uses the kit `Bajla` idle/flyby/celebrate.

## Core loop (beat by beat)
_The Hub's loop is navigation + sign-in; Q&A pedagogy is deferred to the entered
game. Beats below map the template's question→feedback arc onto hub semantics._
1. **Spawn & greet** (establishing) — orbital establishing shot; Bajla flyby; a
   crisp DOM overlay shows the wordmark + "Sign in". All English (district names,
   CTAs, hints) is DOM / drei `<Html>`, never baked into 3D textures.
2. **Choose a district** (the "question") — move focus across buildings:
   Arrow/WASD, pointer hover, or touch tap. The focused building lifts, its
   lantern brightens, and a DOM/`<Html>` tooltip shows the game title + a
   one-line objective.
3. **Enter** (the "correct" commit, ≤1.5s) — Enter / click / tap confirms;
   camera dolly-push + lantern bloom; the game's 3D shell `registry.load()`s.
   DOM announces "Loading <district>…".
4. **Graceful fail** (the "forgiving wrong") — WebGL unavailable, chunk load
   error, or `quality='low'`/`reducedMotion` → `CityStage`'s error boundary
   calls `onError`; the host swaps in the 2D shell. Never a white screen, never a
   dead doorway.
5. **Return, reward & progression** — on the game's
   `onSessionComplete(SessionResult)` the Hub re-establishes; Bajla celebrates;
   the district marquee shows the score (DOM). Anonymous players get the sign-up
   CTA after one completed round. The **diegetic gate**: the gatehouse opens the
   universal login as a DOM overlay — the two `Login.jsx` tabs (student /
   school-admin) collapsed into one form that tries student then admin auth, plus
   the existing Google option; success lights the gate lanterns and unlocks all
   districts + fullscreen. The Hub adds no new backend calls — it reads existing
   auth/progress only.

## Shots (4–6 keyframes)
| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | ¾-iso dusk square: lantern strings, skyline (Big Ben / Eye / St Paul's), twinkling stars, Bajla mid-flyby. DOM: "Fluent City" wordmark + "Sign in" top-right. |
| 2 | District focus | One building lifted + lantern brightened; `<Html>` tooltip "Metro Snake — collect the right word-carriages"; DOM focus ring + arrow-key hint. |
| 3 | Enter / dolly | Camera pushing toward the lit doorway, lantern bloom, skyline softening; DOM "Loading Metro Snake…" with an `aria-live` announcement. |
| 4 | Login gate | Brass gatehouse arch; crisp DOM login card overlaid (one collapsed universal form + Google "continue with"); arch lanterns light on success. |
| 5 | Return / celebrate | Hub re-established, Bajla celebrate loop, district marquee "8 / 10 ★"; CTA — anonymous: "Sign up to save your streak", signed-in: "Next district". |
| 6 | Anonymous landing (opt.) | Contained (non-fullscreen) viewport; featured-game-of-the-day district pulsing; "Play one free round" CTA; fullscreen attempt → sign-up prompt. |

## Input map
**Desktop:** Arrow keys / WASD move district focus; Enter/Space enters; Esc
returns to the Hub from a game. Mouse hover focuses, click enters; `Tab` reaches
the sign-in button and login fields. **Touch:** tap a building to focus, tap
again (or the on-screen "Enter" button) to enter; swipe to rotate focus around
the ring; login as a bottom-sheet. **Keyboard-only path:** full tab order across
all districts + sign-in; a DOM focus ring; `aria-live` announces focus and
actions ("Focused: Museum After Dark. Press Enter to play."). The canvas is
`aria-hidden`; all interactive state lives in the DOM overlay.

## Quality tiers
- **high:** mouse/gyro parallax, lantern bloom + gentle emissive flicker, cobble
  reflection shimmer, sparse light motes, one directional shadow on the central
  landmark, Bajla feather detail.
- **medium:** static gradient reflection, fewer motes, no gyro, cheaper bloom, no
  realtime shadow.
- **low:** flat vertex-lit, DPR 1, no particles/bloom/shadow/parallax, static
  emissive lanterns — still a charming lantern-lit square; holds the 30 fps floor.
- **reducedMotion:** no flyby / drift / parallax / flicker; Bajla is a static
  perched guide; camera transitions become instant cross-fades; "brighten on
  focus" becomes an instant state change; all essential feedback (focus, enter,
  score) is shown as discrete DOM state.

## Asset list (everything, with budget)
Assets are same-origin under `public/games/city-hub/`. Total must be ≤ 2.0 MB gz;
code chunk ≤ 250 KB gz.

| Asset | Source (procedural / GLB / atlas) | Est size (gz) |
|-------|-----------------------------------|---------------|
| District buildings (8) + central landmark | Procedural low-poly, instanced shared shells, vertex colors | 0 KB (geometry in chunk) |
| Skyline backdrop (Big Ben / Eye / St Paul's) | Procedural extruded silhouette **or** one gradient-atlas sprite strip | ≤ 64 KB |
| Gradient ramp atlas (sky / lantern / cobble) | One small WebP/PNG ramp atlas | ≤ 48 KB |
| Lantern-glow + star sprite | One tiny shared sprite (instanced) | ≤ 8 KB |
| Bajla owl | Procedural low-poly (kit `Bajla`) | 0 KB (in GameKit chunk) |
| Ambient SFX (optional) | Same-origin dusk loop + soft chime; cut on `low` | ≤ 120 KB (or omit) |
| Overlay typography | **Existing app DOM fonts** (`design/v3` tokens) — no remote, no 3D-baked text | 0 KB new |
| **Total static assets** | | **≈ ≤ 240 KB** (budget 2.0 MB) |

Code chunk `game3d-CityHub.js` ≤ **250 KB gz** (the Hub lives in
`src/practice/shells3d/`, so `vite.config.js` `manualChunks` maps it to
`game3d-*`); it relies on the shared `vendor-three` (≤ 350 KB) + GameKit
(≤ 80 KB). No new deps; no external URL literals.

## Risks
1. **Draw calls from 8 distinct buildings + lanterns + skyline could exceed the
   <150 ceiling.** Mitigation: instance shared building shells, merge static
   plaza geometry, bake the skyline to one sprite, atlas the lanterns; if pressed,
   show a focused arc and fog the far ring.
2. **District hand-off jank** — lazy-loading a large game chunk can hitch or
   flash. Mitigation: mask the load behind the dolly-push + lantern-dim;
   idle-preload the featured chunk; keep the single canvas alive; `CityStage`
   error boundary → 2D fallback so failure is graceful, never a white screen.
3. **The login overlay must add no deps and no external URLs.** Mitigation: reuse
   the existing `Login.jsx` auth contexts (`studentLogin` / `adminLogin` /
   `googleAuth:googleSignIn`) + `design/v3` primitives as the DOM gate; the Google
   GIS script is already loaded by the app shell, so the Hub introduces no new
   external URL literal, font, or SDK. Do **not** re-implement auth.
4. **`vendor-three` bloat from over-importing drei** (`<Html>`, `<Float>`, bounds
   helpers). Mitigation: import drei members selectively (no barrel grabs that
   defeat tree-shaking); prefer a hand-rolled DOM / CSS2D overlay over heavy drei
   components if the 350 KB ceiling is threatened.
5. **GameKit `kit/` is not yet on `gold-deploy`** (it lands in the Foundation PR).
   This storyboard is written against the kit's documented contract — `CityStage`
   (WebGL detect, quality autodetect → DPR/shadow presets, `onError` boundary),
   `useGameLoop` (fixed-step rAF, pauses on tab blur), `Bajla`
   (idle/flyby/celebrate), `palette.ts`, `registry.ts` — plus `types.ts`. The
   build agent reconciles exact signatures against the merged kit before
   implementing.
