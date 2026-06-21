# Flip the Cards — flashcards

**District:** Café Spółdzielnia
**Base shell:** src/practice/shells/Flashcards.tsx — a deck of vocabulary cards; tap to flip (EN front → PL + example back); self-rate KNOWN or REVIEW; REVIEW cards loop back.
**Generator:** src/practice/generators/generateFlashcards.ts

## Fantasy

Café Spółdzielnia is the city's community café, pinned with a cork board of paper notes and vocabulary cards from every district in the metro. Each evening a fresh deck goes up — English on the front, Polish + an example sentence on the back. You stand at the board and work through the deck: flip each card, say the answer in your head, check the back, mark it KNOWN if you got it or REVIEW if you want it to come back later. There is no wrong answer here — just honest self-rating. Work through the deck until every card is known.

## Camera & stage

- **Camera:** fixed angle on the cork board and the counter, FOV 50, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk café corner. A cork board (`#a07848`) on the back wall, pinned with small paper notes; a floating card in front of the board that recolours based on the card's vocabulary hue (EN front) or cream (PL back). A warm brass café lamp (`palette.brass`) brightens as KNOWN count grows. Palette: Dusk Teal `#2B5F6E`, Amber `#ffce86`, cork `#a07848`, card front hue-tinted, card back cream `#e8dcbf`.
- **Bajla's role:** the café owl on the café counter; idles while you flip; celebrates when the full deck is rated.

## Core loop (beat by beat)

1. **Question presented:** the active card shows the English word (front face, hue-tinted). No question is "asked" — the player reads and thinks.
2. **Player action:** tap the card to flip it → Polish + example sentence revealed (back face, cream). Then choose KNOWN or REVIEW.
3. **KNOWN:** card is removed from the active queue. KNOWN count +1.
4. **REVIEW:** card is returned to the back of the queue to reappear later in the session.
5. **Progression:** repeat until every card has been rated KNOWN; session ends → `onSessionComplete(SessionResult)` fires with `correctCount = KNOWN count`.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk café; cork board; floating card (EN front); counter; lamp; Bajla |
| 2 | Front shown | Card showing English word + example sentence |
| 3 | Back flipped | Card showing Polish translation + PL example; KNOWN / REVIEW buttons visible |
| 4 | Session end | "The deck is through." card; KNOWN count; lamp warm; Bajla celebrating |

## Input map

Desktop: **Space / Enter** = flip card, **K** = KNOWN (after flip), **R** = REVIEW (after flip), **← / →** = navigate the deck without rating. Touch: card button (≥170px min-height), KNOWN/REVIEW buttons ≥44px. No keyboard needed for touch; native soft keyboard is never invoked.

## Quality tiers

high: dusk fog, lamp core brightens with KNOWN count, card colour lerp. medium: same minus fog. low: no fog, flat-lit, DPR 1 — card still recolours. reducedMotion: card colour snap (no lerp), camera drift locked.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Floor | Procedural | 0 KB |
| Cork board | Procedural box | 0 KB |
| Paper note decorations (×5) | Procedural box | 0 KB |
| Café counter | Procedural box | 0 KB |
| Floating card (3D, hue-tinted) | Procedural box | 0 KB |
| Café lamp | Procedural cylinder/sphere | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Card face (word, Polish, example, buttons) | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-Flashcards3D` ≈ **4 KB gz** ≪ 250 KB.

## Risks

1. **Self-rating bias** — because there is no external validation, a player can mark everything KNOWN on the first flip. The mechanic acknowledges this: the pedagogy is honest self-pacing, and the session fires `correctCount = KNOWN` which is used only for internal reporting, not blocking progress.
2. **REVIEW loop length** — if many cards are marked REVIEW early, the queue grows long. The current implementation inserts REVIEW cards at the back of the queue (not randomised), so they reappear in first-marked order — predictable and fair.
