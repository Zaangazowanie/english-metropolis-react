# The Crossroads — truefalse

**District:** Tannoy Cross
**Base shell:** src/practice/shells/TrueFalse.tsx — a bilingual statement appears; commit TRUE or FALSE; the verdict is revealed with a short teaching fact.
**Generator:** src/practice/generators/generateTrueFalse.ts

## Fantasy

Tannoy Cross is the junction where every announcement in the city is posted — a tall signpost under the dusk lamps, plastered with claims about how English works. Some are true, some are crossed wires. You stand at the crossroads and pass judgement on each sign: is it TRUE or FALSE? A correct verdict lights the way; a wrong one still teaches you the right answer before you move on. Read every sign and the crossroads glows warm again.

## Camera & stage

- **Camera:** fixed three-quarter on the signpost, FOV 46, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk crossroads. A teal cobbled ground (`#2B5F6E`) under a violet dusk; a blank wooden signpost stands centre (the readable statement lives in the crisp DOM overlay, never baked into a texture — contract rule 9). Two glowing verdict orbs flank it on short posts — a green TRUE orb (`#34D399`) and a rose FALSE orb (`#FB7185`). Two warm brass lamps with amber cores (`palette.lanternCore`) sit behind, brightening as more signs are read correctly. Palette: Dusk Teal `#2B5F6E` ground, Amber `#ffce86` HUD, green `#34D399` TRUE, rose `#FB7185` FALSE.
- **Bajla's role:** perches beside the signpost; idles while you decide; celebrates with a hop when the last sign is read.

## Core loop (beat by beat)

1. **Question presented:** the statement appears on a crisp DOM sign-card (English line + Polish gloss). English text is DOM, never baked into 3D.
2. **Player action:** commit a verdict — click TRUE / FALSE, or press T / ← (true) and F / → (false).
3. **Correct feedback:** the correct orb blooms bright with a gentle pulse; a green "Correct!" chip; the teaching fact shows. ≤1.5 s.
4. **Wrong feedback (NO-FAIL):** the correct orb still blooms and the wrong side dims; a rose chip reveals "It's TRUE/FALSE" plus the same teaching fact. No penalty, no block — the player still advances.
5. **Progression:** Next sign → advances; when every sign is seen → `onSessionComplete(SessionResult)` fires once; "The crossroads is bright." completion card with score and replay.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk crossroads; blank signpost; dim green/rose orbs; warm lamps low; Bajla idling |
| 2 | Question up | DOM sign-card with the statement + Polish gloss; TRUE / FALSE buttons; score chip top-right |
| 3 | Verdict revealed | The correct orb blooms bright, the other dims; verdict chip + italic teaching fact; "Next sign →" |
| 4 | Session end | "The crossroads is bright." card; score; lamps fully warm; Bajla celebrating |

## Input map

Desktop: **T / ←** = TRUE, **F / →** = FALSE, **Enter / Space** = next sign, **S** = skip. Full mouse path via TRUE/FALSE/Next/Skip buttons. Fully keyboard-only. Touch: TRUE / FALSE / Next / Skip buttons, all ≥44px, `touchAction: manipulation`.

## Quality tiers

high: dusk fog, orb bloom pulse, lamp cores brighten with warmth. medium: same minus fog tightening. low: no fog, flat-lit, DPR 1 — orbs still bloom on reveal. reducedMotion: orb opacity/scale snap to target (no pulse), camera drift locked, no per-frame easing.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Ground plane | Procedural | 0 KB |
| Signpost (post + board) | Procedural box/cylinder | 0 KB |
| Verdict orbs + posts (×2) | Procedural sphere/cylinder | 0 KB |
| Dusk lamps (×2) | Procedural | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Sign-card / verdict / fact / HUD | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-TrueFalse3D` ≈ **4 KB gz** ≪ 250 KB.

## Risks

1. **Sign-card length on mobile** — long statements could crowd a 375px viewport. The card is width-capped (`min(540px, 90vw)`), centred in the upper third, with the buttons below; the Polish gloss is smaller secondary text. Test at 375px.
2. **Binary guessing** — TRUE/FALSE is a coin-flip if rushed, so the teaching fact is always revealed on both correct and wrong verdicts, turning every sign into a micro-lesson rather than a gamble.
