# Ink the Page — opencloze

**District:** The Vellum Atelier
**Base shell:** src/practice/shells/OpenCloze.tsx — a passage with several gaps; type the missing word into each (free typing, no options).
**Generator:** src/practice/generators/generateOpenCloze.ts

## Fantasy

The Vellum Atelier is the city's scribe-room. A sheet of parchment lies under candlelight with several words worn away — function words, prepositions, little hinges of grammar. You are the night scribe: ink the missing word into each gap. A right word dries into the parchment in gold; a wrong word washes out and the true word is shown so you learn it. Fill the page and the parchment warms to gold under the candle.

## Camera & stage

- **Camera:** fixed three-quarter on the scribe's desk, FOV 48, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk scribe's atelier. A teal floor (`#2B5F6E`); a tilted oak desk (`#3A2A1E`); a **parchment sheet** (`#e8dcbf`) that warms toward gold (`#f2d79a`) as gaps are inked; an inkpot + quill; a candle with a warm core (`palette.lanternCore`) that brightens with progress. All readable English (the passage + the typed inputs) lives in the crisp DOM overlay — never baked into a texture (contract rule 9). Palette: Dusk Teal `#2B5F6E`, Amber `#ffce86`, parchment `#e8dcbf`, green `#34D399`, rose `#FB7185`.
- **Bajla's role:** the scribe's owl on the desk; idles while you write; celebrates when the page is sealed.

## Core loop (beat by beat)

1. **Question presented:** the passage renders on a parchment DOM card with an inline text-input at each `[BLANK_n]`. English text is DOM, never baked.
2. **Player action:** type the missing word into a gap and press Enter to ink it (focus moves to the next open gap). A hint (H) reveals the current gap's clue.
3. **Correct feedback:** the gap locks gold-green with the inked word (the parchment warms one step). ≤1 s.
4. **Wrong feedback (NO-FAIL):** the gap locks rose and the **correct word is revealed** in its place — the gap still resolves, no penalty.
5. **Progression:** "Seal the page →" resolves any remaining gaps at once (empty gaps reveal their answer); when every gap is resolved → `onSessionComplete(SessionResult)` fires once; "The page is inked." completion card with inked-right count + a fresh page.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk atelier; candle lit; blank-gapped parchment; inkpot + quill; Bajla |
| 2 | Writing | Parchment DOM card; passage with inline inputs; hint chip; "Seal the page" |
| 3 | Verdict | Some gaps gold-green (correct), some rose with the true word revealed |
| 4 | Session end | "The page is inked." card; inked-right score; parchment warm gold; Bajla celebrating |

## Input map

Desktop: **type** the word into each gap, **Enter** inks the focused gap and advances to the next, **H** = hint (reveals the current gap's clue, 3 per session), **S** = skip the current gap (reveals its word), **Seal the page** button resolves all remaining gaps. Touch: native mobile keyboard for the inputs; SKIP / HINT / Seal buttons ≥44px.

## Quality tiers

high: dusk fog, candle core brightens with warmth, parchment colour lerp. medium: same minus fog tightening. low: no fog, flat-lit, DPR 1 — parchment still warms. reducedMotion: parchment colour snaps to target (no lerp), camera drift locked.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Floor plane | Procedural | 0 KB |
| Desk top + 2 legs | Procedural box | 0 KB |
| Parchment sheet (state-reactive) | Procedural plane | 0 KB |
| Inkpot + quill | Procedural cylinder | 0 KB |
| Candle (stick + flame glow) | Procedural cylinder/sphere | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Passage / inputs / hint / HUD | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-OpenCloze3D` ≈ **5 KB gz** ≪ 250 KB.

## Risks

1. **Multiple inline inputs + mobile keyboard** — a passage with 5–6 inline inputs could be partly covered by the soft keyboard. The parchment card sits in the upper area (`top: 13%`) and the gaps flow within it; the active gap auto-focuses and scrolls into view via the browser. Test at 375×667px.
2. **Answer tolerance for free typing** — comparison is case-insensitive trim against `answer` + `acceptedAnswers` (same as the 2D shell). Function-word gaps (in / of / on) are short and unambiguous in the demo; curriculum puzzles must list accepted variants in `acceptedAnswers`.
