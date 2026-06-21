# Rank the Ballots — rankorder

**District:** The Election Hall
**Base shell:** src/practice/shells/RankOrder.tsx — read a criterion, then set N items onto numbered plinths in the correct order (rank 1 first).
**Generator:** src/practice/generators/generateRankOrder.ts

## Fantasy

The Election Hall counts more than votes — it ranks everything in the city. A criterion is posted ("Order from Monday to Sunday", "smallest to largest", "alphabetically A → Z") and a queue of ballots waits to be ranked. You are the returning officer: set each ballot onto its numbered plinth, rank 1 first. Ballots in the right place glow green; ones out of place flash rose, so you keep adjusting until the whole order stands. Count every round and the hall lamps warm over the dais.

## Camera & stage

- **Camera:** fixed three-quarter on the dais of plinths, FOV 48, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk election hall. A teal cobbled floor (`#2B5F6E`); a low dark dais (`#3A2A1E`) carrying a **row of numbered stone plinths** — one per rank, each cap recolouring to mirror its slot's state and lifting when correct. The readable English (the criterion + each ballot's word + the plinth numbers) lives in the crisp DOM overlay, never baked into a texture (contract rule 9). Two brass lamps with amber cores (`palette.lanternCore`) brighten as rounds are counted. Palette: Dusk Teal `#2B5F6E`, Amber `#ffce86`, stone `#8a8170`, green `#34D399` correct, rose `#FB7185` out-of-place.
- **Bajla's role:** the returning officer beside the dais; idles while you rank; celebrates when an order stands and at the final count.

## Core loop (beat by beat)

1. **Question presented:** the criterion shows on a DOM card; the numbered plinths render as DOM slots over the 3D plinths; the ballots render as a DOM queue of word tiles. English text is DOM, never baked.
2. **Player action:** tap a ballot to set it on the next empty plinth (or press 1–9 for the Nth queued ballot). Tap a placed plinth to lift its ballot back; Backspace lifts the last.
3. **Correct feedback:** when the full order matches, every plinth cap locks green and lifts (3D); "✓ Order confirmed"; "Next round →". ≤1.5 s.
4. **Wrong feedback (NO-FAIL):** when all plinths are full but the order is wrong, in-place caps glow green and out-of-place caps flash rose — the plinths **stay open**; tap the rose plinths to lift those ballots and re-rank. No penalty, no block.
5. **Progression:** Next round → advances through the criteria; when every round is seen → `onSessionComplete(SessionResult)` fires once; "The orders are counted." completion card with the first-time-correct tally + replay.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk hall; row of dim numbered plinths on the dais; lamps low; returning-officer Bajla |
| 2 | Ranking | DOM criterion card + numbered plinth slots + DOM ballot queue; some plinths filled (stone) |
| 3 | Wrong order | Plinths full; in-place caps green, out-of-place rose (3D + DOM); rose ballots invite a re-rank |
| 4 | Session end | "The orders are counted." card; first-time-correct score; lamps warm; Bajla celebrating |

## Input map

Desktop: **1–9** = set the Nth queued ballot onto the next plinth, **Backspace** = lift the last placed ballot, **H** = hint (sets the correct ballot on the next empty plinth, 2 per round), **Enter / Space** = next round (after an order stands), **S** = reveal the full order (counts the round as missed). Full mouse path via ballot tiles + plinth slots + HINT / REVEAL / Next. Fully keyboard-only. Touch: all tiles/plinths ≥46px, controls ≥44px, `touchAction: manipulation`.

## Quality tiers

high: dusk fog, lamp cores brighten with progress, correct-cap lift. medium: same minus fog tightening. low: no fog, flat-lit, DPR 1 — caps still recolour per slot. reducedMotion: cap colour/position snap to target (no lerp), camera drift locked.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Floor plane | Procedural | 0 KB |
| Dais | Procedural box | 0 KB |
| Numbered plinths (column + state cap, one per rank) | Procedural cylinder/box | 0 KB |
| Dusk lamps ×2 | Procedural | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Criterion / plinths / ballots / HUD | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-RankOrder3D` ≈ **5 KB gz** ≪ 250 KB.

## Risks

1. **Many ballots/plinths on a 375px viewport** — a 5-item round could wrap. Both the plinth row and the ballot queue are flex-wrap rows inside a `min(640px, 94vw)` column, so they wrap cleanly to a second line rather than overflowing. Test at 375px.
2. **Criterion comprehension is the actual skill** — placement is easy once the ordering rule is understood, so the criterion card is always visible (EN + PL), the hint sets the next correct ballot to model the rule, and REVEAL shows the full order to study when stuck — turning a hard round into a lesson rather than a wall.
