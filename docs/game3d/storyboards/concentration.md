# Flip the Pairs — concentration

**District:** The Memory Cellar
**Base shell:** src/practice/shells/Concentration.tsx — N prompt-answer pairs dealt face-down; flip two at a time; match stays lit, mismatch flips back.
**Generator:** src/practice/generators/generateConcentration.ts

## Fantasy

The Memory Cellar is an old stone vault under the city — cool, quiet, and lit by a single amber oil lamp. A wooden card-table in the centre holds a board of face-down cards, each pair a vocabulary word and its definition waiting to be matched. You are the keeper: flip two cards at a time, find the matching pairs, and light them up. Miss a pair and both flip back to the felt after a moment's pause, so you learn what was there before the next try. Clear every pair and the cellar glows warm.

## Camera & stage

- **Camera:** fixed top-down angle on the card-table, FOV 54, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk stone cellar. A dark floor (`#2B3A30`); stone walls at the back (`#4A4036`); a wooden card-table with dark felt (`#1A3A2A`); an amber **oil lamp** on the corner whose glow brightens as more pairs are matched. The interactive cards live in the DOM overlay — never baked into a 3D texture (contract rule 9). Palette: Dusk Teal `#2B3A30`, Amber `#ffce86`, teal `#7DD3FC` found, rose `#FB7185` mismatch.
- **Bajla's role:** the memory-keeper perched on the table; idles while you flip; celebrates when the board is clear.

## Core loop (beat by beat)

1. **Question presented:** 2N face-down cards fill the DOM grid (N CLUE cards + N WORD cards, shuffled). English text is DOM, never baked.
2. **Player action:** tap/click a face-down card → it flips face-up and shows its text. Tap a second card → comparison happens immediately.
3. **Match feedback (NO-FAIL):** both cards lock face-up in teal. "Found: WORD — clue." ≤0.5 s.
4. **Mismatch feedback:** both cards show for ~1.3 s (player reads them), then flip face-down. No penalty — both positions are now memorised. During the pause, further flips are locked.
5. **Progression:** repeat until all pairs matched → `onSessionComplete(SessionResult)` fires once; "All pairs remembered." completion card with first-try count + replay.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Stone cellar; oil lamp low; all cards face-down on the felt; Bajla watching |
| 2 | First flip | One card face-up (CLUE text); all others still face-down |
| 3 | Mismatch | Two unrelated cards face-up (rose tint); both about to flip back |
| 4 | Session end | "All pairs remembered." card; first-try count; lamp fully bright; Bajla celebrating |

## Input map

Desktop: **click/tap** a face-down card to flip it. During the mismatch pause, input is locked (1.3 s). **H** = hint (briefly reveals a random face-down card, ~0.7 s, 3 per session). **S** = flip active card back (cancel a first-tap selection). Touch: all card buttons ≥68px min-height, `touchAction: manipulation`.

## Quality tiers

high: dusk fog, oil lamp brightens with matched-pair count. medium: same minus fog. low: no fog, flat-lit, DPR 1 — cards still flip colour. reducedMotion: mismatch flip-back and hint reveal instant (no delay), camera drift locked.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Floor + stone walls | Procedural | 0 KB |
| Card-table + felt | Procedural | 0 KB |
| Oil lamp (base + glow) | Procedural cylinder/sphere | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Card grid (2N buttons) + labels | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-Concentration3D` ≈ **5 KB gz** ≪ 250 KB.

## Risks

1. **Many cards on a small screen** — 12 cards (6 pairs) in a 4-column grid at 375px is tight (~30px per card). Cell buttons auto-scale; the minimum 68px min-height keeps them tappable; labels truncate if too long (vocab words are short). Test at 375px.
2. **Timing overlap** — if the mismatch timer fires while the player taps a new card, the `isChecking` guard prevents any new flips until the timer resolves and resets.
