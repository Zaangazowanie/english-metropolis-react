# File the Proof — sentencecorrection

**District:** The Editor's Office
**Base shell:** src/practice/shells/SentenceCorrection.tsx — a sentence with one grammatical error appears; tap the wrong word, type the correction, and file the sheet; or press "No errors" for a clean sentence.
**Generator:** src/practice/generators/generateSentenceCorrection.ts

## Fantasy

The Editor's Office receives the city's news wire at dusk. Each sheet off the ticker has exactly one grammatical slip — a missing article, the wrong verb form, a bad preposition — and it's your job as the night proofreader to catch it before it goes to press. Tap the wrong word on the sheet, type the correction, and file it. Miss the word or get the fix wrong and the correct edit is shown before the next sheet drops — no sheet is ever held back.

## Camera & stage

- **Camera:** fixed three-quarter on the editor's desk, FOV 46, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk newspaper editor's office. A teal cobbled floor (`#2B5F6E`); a dark oak desk (`#3A2A1E`) carrying a stack of proof sheets, an active proof sheet (cream `#efe3c6`) that recolours to amber-green on a correct filing and rose on a wrong pick, and a brass desk lamp (`palette.brass`) with a warm amber core (`palette.lanternCore`). A typewriter silhouette sits at the back. All readable English lives in the crisp DOM overlay — never baked into a texture (contract rule 9). The lamp brightens as more sheets are correctly filed. Palette: Dusk Teal `#2B5F6E`, Amber `#ffce86`, cream paper `#efe3c6`, green `#34D399` correct, rose `#FB7185` wrong.
- **Bajla's role:** the chief proofreader perched on the desk edge; idles while you read; celebrates when a sheet is correctly filed and at the end.

## Core loop (beat by beat)

1. **Question presented:** the sentence with a deliberate error appears as a DOM card of clickable word tokens; a subtle hint chip is available (H key). English text is DOM, never baked.
2. **Player action:** tap the word they think is wrong (it highlights, an inline text-input opens pre-filled with that word); type the correction and press Enter/✓ to commit. OR press "No errors" (N key) if they believe the sentence is clean.
3. **Correct feedback:** the proof sheet glows green (3D); "✓ Correct — filed!" in the DOM; the correct fix is named. Next sheet.
4. **Wrong feedback (NO-FAIL):** the sheet flashes rose; the error word and correct replacement are revealed explicitly ("tap X → correction Y") — always educational, never punishing. Auto-advance after ~1.8 s for skips so flow stays smooth.
5. **Progression:** Next sheet → advances; when every sheet is seen → `onSessionComplete(SessionResult)` fires once; "The desk is clear." completion card with filed-correctly count + replay.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk office; desk lamp warm; stack of proof sheets; Bajla on the edge |
| 2 | Reading | DOM sentence card with clickable word tokens; hint chip above; score top-right |
| 3 | Verdict | Selected word highlighted; inline input with correction typed; submit ✓ button |
| 4 | Session end | "The desk is clear." card; filed-correctly score; lamp fully warm; Bajla celebrating |

## Input map

Desktop: **tap/click a word** to select it (the word highlights and the correction input opens pre-filled); **type** the correction; **Enter** to commit. **N** = "no errors" verdict. **H** = hint (shows the error category hint, 3 per session). **S** = skip (counts as wrong, auto-advances). **Enter** after verdict = next sheet. Touch: all word token buttons ≥44px min-height; input field uses native mobile keyboard; all CTA buttons ≥44px.

## Quality tiers

high: dusk fog, lamp core brightens with warmth, proof-sheet colour lerp. medium: same minus fog tightening. low: no fog, flat-lit, DPR 1 — sheet still recolours. reducedMotion: sheet colour snaps to target (no lerp), camera drift locked.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Floor plane | Procedural | 0 KB |
| Desk top + 2 legs | Procedural box | 0 KB |
| Proof-sheet stack | Procedural box | 0 KB |
| Active proof sheet (state-reactive) | Procedural box | 0 KB |
| Desk lamp (post + shade + glow) | Procedural cylinder/cone/sphere | 0 KB |
| Typewriter silhouette | Procedural box/cylinder | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Sentence tokens / input / verdict / HUD | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-SentenceCorrection3D` ≈ **5 KB gz** ≪ 250 KB.

## Risks

1. **Mobile keyboard shifting the layout** — the correction input triggers a native soft-keyboard on iOS/Android; the sentence card and word tokens are positioned in the upper half (`top: 14%`) so they stay above the keyboard. Test at 375×667px with a soft keyboard open.
2. **Correction matching too strict** — punctuation at the end of a token (e.g. `"night."`) could confuse the comparison. The `tokenize` function splits on whitespace so trailing punctuation stays attached to the word; the `isCorrection` check does case-insensitive trim comparison against `correction` and `acceptedAnswers`, which is the same tolerance the 2D shell uses.
