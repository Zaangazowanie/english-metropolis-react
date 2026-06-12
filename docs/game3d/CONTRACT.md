# Fluent City 3D Games — Build Contract

Binding rules for every agent building a 3D game shell in this repo.
Authored 2026-06-12 by Ricky (VPS integration gate). CI workflow
`game3d-gate.yml` enforces the mechanical parts; the merge gate (Ricky)
enforces the rest. PRs that violate this contract are closed, not fixed.

## What a 3D game IS here

A **three.js presentation layer over an existing practice shell**. The 40 2D
shells in `src/practice/shells/` are the canonical mechanics, wired into vocab
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
5. **Contract types.** Implement `Game3DProps` from
   `src/practice/shells3d/types.ts`. Must render a built-in demo puzzle when
   `puzzle`/`vocab` are absent (anonymous home play), and call
   `onSessionComplete` with the same result shape the 2D shell emits.

## Hard rules (gate-enforced)

6. **Graceful degrade, always:** WebGL context failure, `quality='low'`,
   `reducedMotion=true` must all leave the game playable or cleanly hand back
   to the 2D shell (the host handles the swap — your job is to fail loudly via
   an `onError` boundary, never a white screen).
7. **Performance floor:** 60 fps on mid-range (Intel Iris Xe / GTX-1050
   class) at `high`, 30 fps minimum on low tier. Practical means: draw calls
   < 150, single canvas, DPR clamped ≤ 1.5, no per-frame allocations in the
   loop, instancing for repeats, baked/vertex lighting over realtime shadows
   (one cheap directional shadow max on `high`).
8. **Art direction — "The Fluent City":** storybook low-poly London at dusk.
   Painterly gradient palettes, warm lantern light, the existing brand kit
   (skyline, Big Ben silhouette, paper lanterns — see
   `src/practice/shells/Hangman3D.tsx` for the canonical mood) and **Bajla the
   purple owl** as recurring guide. Prefer procedural geometry + vertex colors
   + small gradient-atlas textures over imported GLBs; if you ship a GLB keep
   it Draco-compressed and inside the asset budget.
9. **Readability is pedagogy:** English words/sentences render as crisp DOM/
   HTML overlay (or drei `<Html>`), never as blurry 3D textures. The learner
   must always be able to read the language content.
10. **A11y:** canvas `aria-hidden`; interaction state announced via the same
    text patterns the 2D shells use; full keyboard + touch input paths.
11. **No backend changes.** No Convex schema/function edits, no nginx, no
    deploy scripts. Frontend-only PRs.

## Workflow

- Branch `game3d/<shellKey>` from `gold-deploy`; PR targets `gold-deploy`.
- PR body must link the approved storyboard
  (`docs/game3d/storyboards/<shellKey>.md`) and include a screenshot/GIF.
- One game per PR. Storyboard PRs and build PRs are separate.
- Merge + deploy happen on the VPS (Ricky) after gate review; cloud agents
  never merge, never deploy, never request permission changes.
