# Key-Word Rewrite — sentencetransform

**District:** The Translator's Booth
**Base shell:** src/practice/shells/SentenceTransform.tsx — Cambridge key-word transformation: rewrite a sentence to the same meaning using a given key word.
**Generator:** src/practice/generators/generateSentenceTransform.ts

## Fantasy

The Translator's Booth is the city's UN-style interpreter cabin. Two angled screens face each other across a narrow desk — the left screen carries an incoming sentence, the right screen is dark until the interpreter's slip is sent. You are the night interpreter: read the source, note the key word stamped in amber, and rewrite the sentence to the same meaning using that key word unchanged. The right screen warms gold when the rewrite matches; the mic shifts violet to gold. Send every dispatch and the booth falls quiet.

## Camera & stage

- **Camera:** fixed three-quarter on the interpretation desk, FOV 48, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk interpreter's booth. A dark desk (`#2A2030`) with two angled screens (left source = violet, right output = warms to gold on correct), a mic whose glow shifts violet → gold → rose per verdict, headphones on the desk, a warm brass lamp. All readable English (source sentence, key-word chip, the typed transform) lives in the DOM overlay — never baked into a texture (contract rule 9). Palette: Dusk Teal `#2B5F6E`, Amber `#ffce86`, violet `#A78BFA`, green `#34D399`, rose `#FB7185`.
- **Bajla's role:** the interpreter owl perched on the desk; idles while the player writes; celebrates on a correct transform.

## Core loop (beat by beat)

1. **Question presented:** the source sentence + a KEY WORD chip appear in the DOM. English text is DOM, never baked.
2. **Player action:** type the rewritten sentence into the inline input and press Enter / "Send →". The key word must appear unchanged in the rewrite.
3. **Correct feedback:** the right screen warms gold (3D); "Correct — the meaning holds." Next dispatch. ≤1 s.
4. **Wrong feedback (NO-FAIL):** the right screen flashes rose; the model answer is revealed ("Model: …") before advancing. No penalty — always educational.
5. **Progression:** Next dispatch → advances; when every dispatch is seen → `onSessionComplete(SessionResult)` fires once; "The booth falls quiet." completion card with score + replay.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk booth; two dim screens; mic; headphones; lamp; Bajla interpreter |
| 2 | Question up | Source sentence card + key-word chip (amber); inline input; hint chip |
| 3 | Verdict | Right screen warm gold (correct) or rose (wrong + model shown); "Next dispatch →" |
| 4 | Session end | "The booth falls quiet." card; score; lamp warm; Bajla celebrating |

## Input map

Desktop: **type** the rewrite into the inline input, **Enter** to send. **H** = hint (reveals the first ~3 words of the model, 3 per session). **S** = skip (shows the model, auto-advances after ~1.9 s). **Enter** after verdict = next dispatch. Touch: native mobile keyboard for the input; Send / Skip / Hint buttons ≥44px.

## Quality tiers

high: dusk fog, right screen + mic colour lerp, lamp brightens with correct count. medium: same minus fog. low: no fog, flat-lit, DPR 1 — screens still recolour. reducedMotion: screen/mic colour snap, camera drift locked.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Floor | Procedural | 0 KB |
| Booth desk + back wall | Procedural box | 0 KB |
| Left screen (source, violet) | Procedural box | 0 KB |
| Right screen (output, state-reactive) | Procedural box | 0 KB |
| Mic (post + head, state-reactive) | Procedural cylinder/sphere | 0 KB |
| Headphones (band + 2 cups) | Procedural box/sphere | 0 KB |
| Booth lamp | Procedural | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Source / key-word chip / input / model / HUD | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-SentenceTransform3D` ≈ **4 KB gz** ≪ 250 KB.

## Risks

1. **Mobile keyboard covers the input** — the inline input and source sentence are positioned in the upper portion of the overlay (`top: 15%`); the native keyboard on iOS/Android pops from the bottom. Test at 375×667px.
2. **Answer tolerance** — comparison is case-insensitive, trims whitespace, strips trailing punctuation, then checks against `target_form` + `acceptedAnswers`. Curriculum puzzles should list all valid transformations in `acceptedAnswers` (e.g. contracted forms like "I'm not" alongside "I am not").
