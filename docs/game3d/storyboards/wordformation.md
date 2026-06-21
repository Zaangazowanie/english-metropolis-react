# Chisel the Form — wordformation

**District:** The Mason's Yard
**Base shell:** src/practice/shells/WordFormation.tsx — derive the right form (noun / verb / adjective / adverb) of a base word to fit the gap in a sentence.
**Generator:** src/practice/generators/generateWordFormation.ts

## Fantasy

The Mason's Yard shapes the city's words in stone. A raw block arrives stamped with a BASE word in capitals — BRAVE, CREATE, HAPPY — and a sentence is carved on the wall above with a gap. You are the night mason: chisel the base into the right form (add a suffix like -tion or -ness, a prefix like un-, shift it to a noun / verb / adjective / adverb) so it fits the gap. Chisel it right and the block flashes amber-gold; get it wrong and the correct form is shown before the next block arrives — no block is ever wasted.

## Camera & stage

- **Camera:** fixed three-quarter on the stone workbench, FOV 46, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk stonemason's yard. A teal cobbled floor (`#2B5F6E`); a stone plinth (`#5C4D3A`) carrying the **raw block** (`#C8B698`) that recolours green when chiselled right and rose when wrong; a chisel + mallet rest on the bench; offcut blocks lie around the yard; a brass yard lamp (`palette.brass`) with an amber core (`palette.lanternCore`) warms with progress. All readable English (the base word, the sentence, the input) lives in the crisp DOM overlay — never baked into a texture (contract rule 9). Palette: Dusk Teal `#2B5F6E`, Amber `#ffce86`, stone `#C8B698`, green `#34D399`, rose `#FB7185`.
- **Bajla's role:** the mason's owl on the bench; idles while you chisel; celebrates on a correct form and at the end.

## Core loop (beat by beat)

1. **Question presented:** the BASE word shows on a stone chip + the target part-of-speech chip; the sentence renders with an inline text-input where the gap is. English text is DOM, never baked.
2. **Player action:** type the derived form into the inline input and press Enter (or "Chisel it →"). A hint (H) reveals the first 1–2 letters of the target form.
3. **Correct feedback:** the block glows green + pops (3D); the typed form locks green in the sentence; "Correct". Next block.
4. **Wrong feedback (NO-FAIL):** the block flashes rose; the typed word shows struck-through and the correct form is revealed ("The form is X") — educational, never punishing. Skip auto-advances with the answer shown.
5. **Progression:** Next block → advances; when every block is seen → `onSessionComplete(SessionResult)` fires once; "The blocks are carved." completion card with carved-right count + replay.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk yard; raw block on the plinth; chisel + mallet; offcuts; yard lamp; Bajla |
| 2 | Question up | BASE chip + target-POS chip; sentence card with inline input at the gap |
| 3 | Verdict | Block green/rose; the form locked into the sentence (green) or struck-through with the fix shown |
| 4 | Session end | "The blocks are carved." card; carved-right score; lamp warm; Bajla celebrating |

## Input map

Desktop: **type** the derived form into the inline input, **Enter** to chisel/commit, **H** = hint (reveals the first 1–2 letters, 3 per session), **S** = skip (counts as wrong, auto-advances), **Enter** after verdict = next block. Touch: native mobile keyboard for the input; all CTA buttons ≥44px.

## Quality tiers

high: dusk fog, yard lamp brightens with warmth, block colour lerp + pop. medium: same minus fog tightening. low: no fog, flat-lit, DPR 1 — block still recolours. reducedMotion: block colour/scale snap to target (no lerp), camera drift locked.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Floor plane | Procedural | 0 KB |
| Stone plinth / workbench | Procedural box | 0 KB |
| Raw block (state-reactive) | Procedural box | 0 KB |
| Chisel + mallet | Procedural cylinder/box | 0 KB |
| Offcut blocks ×2 | Procedural box | 0 KB |
| Yard lamp | Procedural | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Base / sentence / input / HUD | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-WordFormation3D` ≈ **5 KB gz** ≪ 250 KB.

## Risks

1. **Mobile keyboard covering the sentence** — the inline input is in the upper third (`top: 15%`), and the base/POS chips sit above it, so the native soft-keyboard does not obscure the active gap. Test at 375×667px with the keyboard open.
2. **Answer tolerance** — the comparison is case-insensitive trim against `answer` + `acceptedAnswers` (same tolerance as the 2D shell). Spelling variants the curriculum accepts must be listed in `acceptedAnswers` on the puzzle item; the demo answers are single canonical forms.
