# Tap the Dispatch — typingtest

**District:** The Telegraph Office
**Base shell:** src/practice/shells/TypingTest.tsx — type a target phrase exactly; live WPM + accuracy; wrong keys jam without penalty.
**Generator:** src/practice/generators/generateTypingTest.ts

## Fantasy

The Telegraph Office is the city's old wire room. Paper tape spools off the receiver each evening carrying dispatches — city announcements, weather bulletins, the last train times. You are the night operator: type each dispatch as it comes off the wire. Every correct keystroke punches a hole in the tape; a wrong key jams the brass key for a half-second (no penalty, no lost progress) — you simply type the right letter and move on. Finish all dispatches and the office lamp glows warm and golden.

## Camera & stage

- **Camera:** fixed three-quarter on the telegraph desk, FOV 48, gentle breathing drift (locked under reducedMotion).
- **Stage:** a dusk telegraph office. A dark desk with a **brass telegraph key** that flashes rose on a wrong keystroke and snaps back to brass; a **paper tape strip** that lengthens (3D scale along X-axis) as the phrase is typed; a **brass WPM dial** with a warm glow that brightens with accuracy; a warm office lamp. All readable English (the target text + the live typing overlay) lives in the DOM overlay — never baked into a texture (contract rule 9). Palette: Dusk Teal `#2B5F6E`, Amber `#ffce86`, brass `#b08d57`, paper tape `#e8dcbf`.
- **Bajla's role:** the telegraph owl perched on the desk; idles while you type; celebrates when a dispatch completes and at the end.

## Core loop (beat by beat)

1. **Question presented:** the target dispatch appears on a paper-tape DOM card; the cursor highlights the next character. English text is DOM, never baked.
2. **Player action:** type the phrase exactly. Correct characters advance the cursor and extend the 3D tape; wrong keystrokes **jam** the brass key briefly (no penalty — the character is not accepted, so the player types the correct letter immediately).
3. **Correct dispatch:** phrase complete — a verdict chip shows WPM + accuracy vs the target WPM. "Next dispatch →" button. ≤0.5 s.
4. **Wrong key (NO-FAIL):** key flashes rose, no progress; the player types the right letter. This is the only shell where the "wrong answer" is an individual keystroke, not a question-level verdict.
5. **Progression:** Next dispatch → advances; when every phrase is seen → `onSessionComplete(SessionResult)` fires once; "The wire falls quiet." completion card with phrases-at-target-WPM count + replay.

## Shots (4 keyframes)

| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk office; brass key; short paper tape; WPM dial dim; Bajla waiting |
| 2 | Typing | Target phrase card (typed prefix green, next char amber cursor); tape extending; live WPM |
| 3 | Dispatch sent | Verdict chip (WPM + accuracy + "Sent"); paper tape at full length; "Next dispatch →" |
| 4 | Session end | "The wire falls quiet." card; phrases-at-target-WPM count; lamp warm; Bajla celebrating |

## Input map

Desktop: **type normally** — the controlled input captures all keystrokes. **Enter** after a phrase completes advances to the next dispatch. **S** = skip (advance without completing the phrase; counts as not-at-target). Touch: native mobile keyboard via a focused text input; the "Send" state shows a "Next dispatch →" button ≥44px.

## Quality tiers

high: dusk fog, WPM dial glow brightens with accuracy, brass key + tape colour lerp. medium: same minus fog. low: no fog, flat-lit, DPR 1 — key still flashes. reducedMotion: key colour snap, tape length snap (no lerp), camera drift locked, jam window immediate.

## Asset list (everything, with budget)

| Asset | Source | Est size |
|-------|--------|----------|
| Floor | Procedural | 0 KB |
| Telegraph desk + legs | Procedural box | 0 KB |
| Telegraph base + brass key (state-reactive) | Procedural box/cylinder | 0 KB |
| Paper tape spool (grows with progress) | Procedural box, scale-x lerp | 0 KB |
| WPM dial (disc + glow) | Procedural cylinder/sphere | 0 KB |
| Office lamp | Procedural | 0 KB |
| Bajla | GameKit (shared) | 0 KB |
| Target text / typed overlay / WPM/accuracy / HUD | DOM overlay | 0 KB |
| **Total static assets** | | **0 KB ≪ 2.0 MB** |

Code chunk: `game3d-TypingTest3D` ≈ **4 KB gz** ≪ 250 KB.

## Risks

1. **Mobile autocorrect / autocapitalize** — the input is rendered with `autoCorrect="off" autoCapitalize="off" autoComplete="off" spellCheck={false}` to prevent the soft keyboard from substituting or capitalising characters the target doesn't expect. Test on iOS Safari.
2. **Jam timer cleanup** — the 240 ms jam timer is stored in a ref and cleared on unmount. If the component remounts mid-jam (e.g. quality change), a stale timer could clear a fresh jam state. The ref guard handles this.
3. **WPM tracking** — the phrase timer starts on the first correct keystroke (not on mount), so idle time before the player begins typing does not inflate the measured WPM.
