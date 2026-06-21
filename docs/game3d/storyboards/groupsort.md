# Sort the Mail — groupsort

**District:** The Post Office
**Base shell:** src/practice/shells/GroupSort.tsx — sort word "envelopes" into the correct category "sorting window" (route); correct drops latch, wrong drops return to sender.
**Generator:** src/practice/generators/generateGroupSort.ts

## Fantasy

The Post Office runs the late shift. A tray of envelopes waits on the counter, each addressed to a grammar route — PLACES, ACTIONS, DESCRIBERS — and the sorting windows behind the counter are lit, one per route. You are the night sorter: route each envelope to its window. A correct drop stamps and latches (the window fills with light); a wrong drop is returned to sender and bounces back to the tray for another try. Clear the counter and the office glows warm.

## Camera & stage

- **Camera:** fixed three-quarter on the counter and sorting windows, FOV 48, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk post office. A teal cobbled floor (`#2B5F6E`); a wood-panel back wall (`#6E5236`) with **wood-framed sorting windows** — one per category, each lit in its route colour and brightening as mail is sorted into it. A dark oak counter, a brass pendant lamp with an amber core (`palette.lanternCore`) that warms with progress. The readable English (route names + the word on each envelope) lives in the crisp DOM overlay, never baked into a texture (contract rule 9). Palette: Dusk Teal `#2B5F6E`, Amber `#ffce86`, wood `#6E5236`, route colours from the puzzle, green `#34D399` progress, rose `#FB7185` return-to-sender.
- **Bajla's role:** the postmaster on a stool to the side; idles while you sort; celebrates when the counter is clear.

## Core loop (beat by beat)

1. **Question presented:** the sorting windows render as DOM drop-targets (route name + count) over the lit 3D windows; the unsorted envelopes render as a DOM tray of word tiles. English text is DOM, never baked.
2. **Player action:** tap an envelope to select it (or press 1–9), then tap its route window (or press Q/W/E/R). The current envelope is always highlighted.
3. **Correct feedback:** the window fills brighter (3D panel glows up), the envelope latches into the route; ≤1.5 s.
4. **Wrong feedback (NO-FAIL):** "return to sender" — the window flashes rose and the envelope bounces back to the tray to retry. No penalty blocks progress; the miss is only noted for the first-time-correct tally.
5. **Progression:** sort every envelope → `onSessionComplete(SessionResult)` fires once; "The mail is sorted." completion card (first-time-correct out of total) + replay.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk post office; three dim route windows; envelopes on the counter; postmaster Bajla |
| 2 | Sorting | DOM route windows (name + count) + DOM tray of envelopes; current envelope highlighted |
| 3 | Right / wrong | A window brightens on a correct stamp; another flashes rose on a return-to-sender |
| 4 | Session end | "The mail is sorted." card; first-time-correct score; lamp warm; Bajla celebrating |

## Input map

Desktop: **1–9** = pick the Nth envelope, **Q / W / E / R** = drop the current envelope in route window 1–4, **H** = hint (flashes the current envelope's correct window, 3 per session), **S** = stamp the rest (auto-route the remainder, counts as missed). Full mouse path via envelope tiles + window buttons + HINT / STAMP REST. Fully keyboard-only. Touch: all tiles/windows ≥44px, `touchAction: manipulation`.

## Quality tiers

high: dusk fog, pendant lamp brightens with warmth, window glow-up + hint bloom. medium: same minus fog tightening. low: no fog, flat-lit, DPR 1 — windows still recolour/fill. reducedMotion: window colour/opacity snap to target (no lerp), camera drift locked.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Floor plane | Procedural | 0 KB |
| Back wall + counter | Procedural box | 0 KB |
| Sorting windows (frame + glow panel, one per route) | Procedural box/plane | 0 KB |
| Pendant lamp | Procedural cylinder/cone/sphere | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Route windows / envelopes / HUD | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-GroupSort3D` ≈ **5 KB gz** ≪ 250 KB.

## Risks

1. **Many envelopes + windows crowd small screens** — at 375px the tray (up to 9 tiles) and 3 windows could wrap. Both are flex-wrap rows inside width-capped containers (`min(680px, 94vw)`), windows sit at the top and the tray at the bottom so they never overlap. Test at 375px.
2. **Tap-to-select-then-drop discoverability** — without true drag, the "current envelope" is always highlighted (selected or the first tray tile) and the windows show their hotkeys, so a single tap on a window always routes the obvious current envelope; the hint names the right window when unsure.
