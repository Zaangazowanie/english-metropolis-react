# Pin the Poster — multiplechoice

**District:** The Bulletin Board
**Base shell:** src/practice/shells/MultipleChoice.tsx — a question appears; four answer posters hang below; commit ONE; a right pick lights green, a wrong pick reveals the correct one.
**Generator:** src/practice/generators/generateMultipleChoice.ts

## Fantasy

The Bulletin Board is the city's community notice-board — a cork panel under the dusk lamps, layered with announcements. Each evening a fresh notice goes up with four candidate answers pinned beneath it. You read the notice and pin the poster you believe is right. One shot per notice: a correct pin lights the poster green; a wrong pin still reveals the right one before the next notice goes up. Fill the board and the lamps warm over it.

## Camera & stage

- **Camera:** fixed three-quarter on the notice-board, FOV 46, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk plaza notice-board. A teal cobbled ground (`#2B5F6E`) under a violet dusk; a wooden cork-board (`#6E5236`) on two posts with a small red-brown pitched roof (`#b5572e`). Four blank poster cards hang in a 2×2 grid on amber push-pins — the readable English lives in the crisp DOM overlay, never baked into a texture (contract rule 9). Two brass lamps with amber cores (`palette.lanternCore`) flank the board and brighten as more notices are pinned. Palette: Dusk Teal `#2B5F6E`, Amber `#ffce86`, cork `#6E5236`, green `#34D399` correct, rose `#FB7185` wrong.
- **Bajla's role:** perches beside the board; idles while you choose; celebrates when the board is full.

## Core loop (beat by beat)

1. **Question presented:** the notice appears on a crisp DOM card (English prompt + Polish gloss). Four option posters (A–D) render as DOM buttons over the 2×2 board. English text is DOM, never baked.
2. **Player action:** commit ONE option — click a poster, or press 1–4 / A–D. Single shot per notice.
3. **Correct feedback:** the chosen poster (and its 3D card) blooms green with a small pop; a green "Correct!" chip; ≤1.5 s.
4. **Wrong feedback (NO-FAIL):** the picked poster goes rose, the correct poster blooms green (3D + DOM); the answer is named. No penalty, no block — the player still advances.
5. **Progression:** Next poster → advances; when every notice is seen → `onSessionComplete(SessionResult)` fires once; "The board is full." completion card with score and replay.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk plaza; cork notice-board with four blank posters on pins; lamps low; Bajla idling |
| 2 | Question up | DOM notice card with prompt + Polish gloss; four A–D option posters; score chip top-right |
| 3 | Verdict revealed | Picked poster green/rose; the correct poster blooms green (3D card pops); answer chip + "Next poster →" |
| 4 | Session end | "The board is full." card; score; lamps fully warm; Bajla celebrating |

## Input map

Desktop: **1–4** or **A–D** = pick an option, **H** = hint (reveals the textual clue, 3 per session), **Enter / Space** = next poster (after reveal), **S** = skip. Full mouse path via the four poster buttons + HINT / SKIP / Next. Fully keyboard-only. Touch: all buttons ≥44px (options ≥54px), `touchAction: manipulation`.

## Quality tiers

high: dusk fog, lamp cores brighten with warmth, correct-poster pop. medium: same minus fog tightening. low: no fog, flat-lit, DPR 1 — posters still recolour on reveal. reducedMotion: poster colour/scale snap to target (no lerp), camera drift locked.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Ground plane | Procedural | 0 KB |
| Notice-board (panel + 2 posts + roof) | Procedural box/cylinder | 0 KB |
| Poster cards ×4 | Procedural box | 0 KB |
| Push-pins ×4 | Procedural (InstancedMesh) | 0 KB |
| Dusk lamps ×2 | Procedural | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Notice / options / hint / HUD | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-MultipleChoice3D` ≈ **5 KB gz** ≪ 250 KB.

## Risks

1. **Four option posters on a 375px viewport** — the 2×2 DOM grid could crowd small screens. The grid is width-capped (`min(560px, 92vw)`) and the option buttons wrap text; the notice card sits above so it is never covered. Test at 375px.
2. **Single-shot commit feels punishing** — mitigated by the no-fail reveal (the correct poster always blooms with the answer named) and the 3-per-session hint clue, so each wrong pick is a micro-lesson, not a dead end.
