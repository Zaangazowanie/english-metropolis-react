# Fluent City 3D Games — Build Contract

Build requirements for the practice arcade, updated for the user's
5 September 2026 redesign. See `PRACTICE-ARCADE.md` for the current catalogue.
The repository-root `AGENTS.md` controls production routing and deployment.

## What a 3D game IS here

A **functional Three.js scene driven by its canonical practice controller**.
The 38 controllers in `src/practice/shells/` are wired into vocab
(`useStudentVocab` → `practice:getKeywordsByStudentSlug`), generators
(`src/practice/generators/`), progress (`practiceProgress`), spaced repetition
and anonymous play. Your game re-skins one shell's loop in 3D. You do NOT
invent new pedagogy, new data flows, or new backend calls.

## Hard rules (CI-enforced)

1. **No new dependencies.** `package.json` / lockfile must be byte-identical
   to base. The 3D stack is already installed: `three@0.184`,
   `@react-three/fiber`, `@react-three/drei`. Import only from these + existing
   deps. (Registry-install ban is a security posture — Shai-Hulud.)
2. **No external URLs at runtime.** All assets same-origin (GDPR/CSP). No
   CDNs, no Google Fonts, no remote textures/models/audio. Assets live in
   `public/games/<shellKey>/`, code in `src/practice/shells3d/`.
3. **Budgets** (gzipped, enforced post-build):
   - per-game chunk `game3d-<Name>.js` ≤ **250 KB**
   - shared `vendor-three.js` ≤ **350 KB** (import three/fiber selectively;
     drei imports must be specific — no barrel grabs that defeat tree-shaking)
   - static assets per game (`public/games/<key>/`) ≤ **2.0 MB** total
4. **One game = one chunk.** File `src/practice/shells3d/<Name>3D.tsx`
   (default export = the game component). `vite.config.js` manualChunks
   already maps `shells3d/*` → `game3d-*` and the three stack → `vendor-three`.
5. **Contract types.** Scenes consume typed state and callbacks from the
   canonical controller. Controllers retain their puzzle and session-result
   types and supply built-in demos when no lesson puzzle is given. The city
   adapter implements `Game3DProps` and normalizes its session result.

## Hard rules (gate-enforced)

6. **Graceful degrade, always:** WebGL context failure must leave compact,
   playable controls connected to the canonical controller. Low quality and
   reduced motion must preserve gameplay. Handle failures through the scene
   error boundary; never show a white screen or load a retired implementation.
7. **Performance floor:** 60 fps on mid-range (Intel Iris Xe / GTX-1050
   class) at `high`, 30 fps minimum on low tier. Practical means: draw calls
   < 150, single canvas, DPR clamped ≤ 1.5, no per-frame allocations in the
   loop, instancing for repeats, baked/vertex lighting over realtime shadows
   (one cheap directional shadow max on `high`).
8. **Practice art direction (user update, 2026-09-05):** richly detailed arcade
   districts with saturated cobalt, cyan, magenta, jade and gold enamel,
   deep ink contrast, luminous rails, and distinct functional machinery.
   Use neutral arcade lighting to preserve material colour. Muted pastel
   prototypes and duplicate legacy practice implementations are retired.
   The separate explorable World retains its own dusk art direction.
   Keep language on readable DOM plaques and build repeated architectural
   details with instancing. Prefer procedural geometry over imported GLBs.
9. **Readability is pedagogy:** English words/sentences render as crisp DOM/
   HTML overlay (or drei `<Html>`), never as blurry 3D textures. The learner
   must always be able to read the language content.
10. **A11y:** canvas `aria-hidden`; interaction state announced through the
    controller's text feedback; full keyboard + touch input paths.
11. **Frontend-only gameplay.** Do not change Convex schemas/functions or
    nginx for a visual redesign. Use the approved frontend release script
    and validate its calls against the existing backend contract.

## Workflow

- Follow root `AGENTS.md`: use a `codex/` branch and a PR into `prod`.
- Include relevant mechanics tests, build/bundle checks and browser evidence.
- Deploy only from the clean canonical VPS checkout using the release script.
- Keep obsolete implementations out of the source tree. Git preserves history.
