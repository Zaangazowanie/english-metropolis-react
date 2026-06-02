# EnglishMetro Practice Shell — Design Contract

This document is the binding contract for any new practice shell added to `src/practice/shells/`. Read it cover-to-cover before writing code. Every visual decision should derive from a pattern below, not from generic UI taste.

The 10 existing shells (Crossword, Wordsearch, Gap-fill, Hangman, Matching, Flashcards, Drag-drop, Group sort, True/False, Anagram) embody this contract; if a question is unanswered here, look at how those shells answered it and follow.

---

## 1 · The metaphor

EnglishMetro is **a city**. Every shell is **a district** in that city. Bajla — a chubby purple pigeon — is the student's guide. The student's progress is a tour through neighborhoods; each district teaches one type of practice through its own visual idiom (a market, a courthouse, a bridge, a subway).

Two consequences:

1. **Names are themed.** "Wordsearch" → "The Neon Market". "Hangman" → "The Lantern Alley". "Drag-drop" → "The Sorting Station". Never use the technical exercise-type name in user-facing copy. Pick a city-place metaphor that matches the verb of the exercise.
2. **Aesthetics evoke a place at dusk.** Deep purples + magentas + golds, soft window-glow yellow dots, faint diagonal grain, subtle skyline silhouettes. Never flat material design. Never bright daylight. The city is awake at night.

---

## 2 · Tokens — colors, fonts, motion, spacing

These are **NOT options** — pick from this set or you are wrong.

### Brand palette (mirror of `app/_design-system/tokens.ts`)
- `paper` `#F4EFEF` — warm off-white text on dark surfaces
- `ink` `#0E0A1A` — deepest dark for absolute backgrounds
- `magenta` `#E879F9` — primary brand accent (Bajla's collar gem)
- `violet` `#A78BFA` — secondary accent
- `cyan` `#7DD3FC` — tertiary accent (information, structure)
- `gold` `#FBBF24` — highlight, success, lights
- `rose` `#FB7185` — wrong, alert, building-warning red
- `green` `#34D399` — correct, growth, library
- `lime` `#BEF264` — focus, energy, traffic-light green

### Typography
- `--em-decor` = `'Caprasimo', Georgia, serif` — display/headlines (the soft serif feel)
- `--em-body` = body sans (Inter / system)
- `--em-mono` = `'IBM Plex Mono', monospace` — labels, eyebrow caps, stat numbers

Headline sizes scale 38-96px responsive. Eyebrow caps are 11-12px monospace, `letter-spacing: 0.18em`, uppercase, color `rgba(245,239,255,0.6)`.

### Motion vocabulary (defined in `styles/global.css`)
- `em-rise` — entrance lift + fade in (~540-620ms with `var(--em-ease)` both)
- `em-bob` — Bajla's idle bob (2.4s loop), faster when `mood='cheer'` (0.6s)
- `em-pulse` — slow attention pulse (2.4s loop)
- `em-spin` — rotation
- `em-card-select` — 220ms tactile select
- `--em-ease` = `cubic-bezier(0.4, 0, 0.2, 1)` — use it for EVERYTHING

### Spacing
8px grid. Common values: 8, 12, 16, 24, 32, 48, 72px. Card padding: 24-32px desktop, 16-20px mobile.

---

## 3 · Anatomy of a shell

Every shell file is a single React component named `<ShellName>Shell`. The default export pattern:

```tsx
export const FooShell: React.FC<FooShellProps> = ({
  time = 'dusk',           // 'day' | 'dusk' | 'night' — gradient mode
  state = null,             // forced state for design canvas previews
  puzzle,                   // adapter-produced data (optional)
  onWrongAnswer,            // dynamic-scaffolding callback
}) => { ... }
```

Standard layout sections, top-to-bottom:

1. **Nameplate** at top — the district name in `--em-decor` + bilingual subtitle
2. **Progress bar** — questions completed / total
3. **Main interaction area** — the actual puzzle UI
4. **HintCard** (bilingual EN/PL — Bajla's voice)
5. **Action buttons** — `HintButton`, `SkipButton`, primary action
6. **Completion overlay** (absolute-positioned, animated `em-rise`) — Bajla cheer + accent-colored "complete" message + Try Another / Next District buttons
7. **Confetti** (component) on completion

All of those are imports from `components/primitives.tsx`. **Never re-implement them.** If a primitive is missing, add it there, don't inline.

### Standard imports

```tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Bajla, HintCard, Progress, Nameplate, SkipButton, HintButton, Confetti } from '../components/primitives';
import { useShellProgress } from '../lib/convex-stubs';
import type { Shell<Name>Puzzle } from '../lib/adapters';
```

---

## 4 · The completion overlay (standardized)

When the student finishes the shell:

```tsx
{completed && (
  <div
    role="dialog"
    aria-live="assertive"
    aria-label="<District name> complete"
    style={{
      position: 'absolute', inset: 0,
      // SOFT — was 0.92 historically, dropped to 0.62 + blur on Mike feedback
      background: `radial-gradient(ellipse, ${accent}22, rgba(14,10,26,0.62))`,
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      animation: 'em-rise 0.4s var(--em-ease)',
    }}
  >
    <Bajla size={84} mood="cheer" decorative />
    <div className="em-decor" style={{ fontSize: 38, color: accent, textShadow: `0 0 20px ${accent}aa` }}>
      <Themed completion line — e.g. "The market closes." for Wordsearch>
    </div>
    <div className="em-eyebrow"><district-themed bilingual line: EN · PL></div>
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="em-btn em-btn-ghost" onClick={reset}>Try another</button>
      <button className="em-btn em-btn-primary" onClick={next}>Next district →</button>
    </div>
  </div>
)}
<Confetti show={completed} />
```

**Requirements:**
- Outer wash MAX 0.62 alpha (Mike: "the background is too strong")
- ALWAYS include `backdropFilter: blur(6px)`
- Bajla in `mood="cheer"` decorative
- Headline in `--em-decor` with the district's accent color and a 20px text-shadow glow

---

## 5 · The page background

Pick one of three by `time` prop:

```tsx
const grad =
  time === 'day'   ? 'linear-gradient(160deg, #4C2F7E 0%, #C58BD9 100%)' :
  time === 'night' ? 'linear-gradient(160deg, #02010C 0%, #2A1450 70%, #4B1E78 100%)' :
                     'linear-gradient(160deg, #1F1240 0%, #6A2A8C 60%, #C5598E 100%)';  // dusk
```

Plus a subtle **paper-grain class** `em-grain` on the root for the diagonal hatch.

For shells with a strong themed scene (Construction Quarter, Library Tower, etc.), layer one to three of:
- A faux SVG silhouette (skyline, tower, bridge — see PracticeCanvas.tsx for the pattern)
- Floating window-glow yellow dots (`<rect>`s positioned algorithmically)
- A faint vignette (`radial-gradient(ellipse at center, transparent, rgba(0,0,0,0.4))`)

---

## 6 · The themed accent

Every district has ONE accent color from the palette. Use it for:
- The completion message text + glow
- The primary action button (`em-btn-primary` with this accent)
- Active state on interactive elements (selected card, hovered tile, drag preview)
- The Bajla mood-cheer sparkles around the completion overlay

NEVER use 2 accents in the same shell. Pick one and commit.

Color → mood mapping (rough):
- `cyan` `#7DD3FC` — analytical, structural (Crossword, Drag-drop)
- `gold` `#FBBF24` — celebratory, warm (Wordsearch, Hangman, Spin)
- `rose` `#FB7185` — alert, judgment (Gap-fill, True/False)
- `magenta` `#E879F9` — playful, transformative (Anagram)
- `violet` `#A78BFA` — connection, network (Matching)
- `green` `#34D399` — knowledge, growth (Flashcards)
- `lime` `#BEF264` — categorical, energetic (Group sort)

---

## 7 · Bajla cameos

Bajla appears in three ways:

1. **Hero/scene** — large size 120-140px, `mood="wave"`, top-right corner of the cover scene, `decorative` true
2. **HintCard** — small size 36-44px, `mood="idle"`, inline with the bilingual hint text
3. **Completion** — size 84px, `mood="cheer"`, centered above the success line

Bajla's voice for HintCard label: always `"Bajla mówi"` (Polish: "Bajla says"). Never replace this.

---

## 8 · Hint architecture

Every question has a hint. Pattern:

```tsx
<HintCard
  label="Bajla mówi"
  english={cur.clue}        // The English hint
  polish={cur.clue_pl}      // The Polish translation/explanation
/>
```

Hint cards have:
- Small Bajla idle on left
- "Bajla mówi" eyebrow in magenta
- Bold-ish English clue
- Polish translation prefixed with 🇵🇱

Hint **text comes from the puzzle data**, not generated in the shell. If the adapter doesn't provide a hint, fall back to the question text itself.

---

## 9 · Mobile fallback rules

- Tap targets ≥ 44px on mobile (`@media (max-width: 768px)`)
- Drag interactions must have a tap-only fallback (see `useTouchDragDrop.ts`)
- Long content scrolls with `overflow-y: auto` on `em-shell-host`
- SVG-heavy shells (Matching, Crossword) ship a separate stacked-grid fallback for mobile (see `Matching.tsx`'s `em-mp-mobile` block as the pattern)

---

## 10 · Accessibility

- Bajla `<img>` has `aria-label="Bajla, the pigeon — your guide · Bajla — twoja przewodniczka"` when not decorative; `aria-hidden` when decorative
- Completion overlay: `role="dialog"` + `aria-live="assertive"` + `aria-label`
- Buttons: `aria-label` for icon-only, visible label otherwise
- Focus-visible: 2px outline in the district's accent color, 2px offset
- Color is never the only signal — pair every red/green with text or icon

---

## 11 · Shell registration checklist

A new shell `Foo` requires changes in EXACTLY these files:

1. **`src/practice/shells/Foo.tsx`** — the component
2. **`src/practice/lib/shell-selector.ts`** — add `'foo'` to `ShellKey` union; add `foo` mappings to `CATEGORY_TO_SHELLS` (which error categories should suggest this shell)
3. **`src/practice/lib/adapters.ts`** — add `ShellFooPuzzle` interface + `adaptFoo(puzzle)` function
4. **`src/practice/generators/index.ts`** (or new file in `generators/`) — add `generateFooPuzzle(vocab)` that produces the canonical generator output
5. **`src/practice/StudentPractice.tsx`**:
   - `Shells` record: lazy import
   - `SHELL_LABEL` record: human label
   - `DISTRICTS` record: full meta (name, subtitle, subtitle_pl, emoji, accent, accentGlow, gradient)
   - `ALL_SHELLS` array: append the key
   - `buildShellPuzzle` switch: add the case
6. **`src/practice/components/PitchCard.tsx`**: add `[label, key]` to `DISTRICTS` array
7. **`src/practice/PracticeCanvas.tsx`** (mobile registry `MOBILE_SHELLS`): add entry if you want it in the mobile carousel
8. **`src/practice/styles/global.css`** if you need shell-specific CSS — namespace under `.em-shell-foo`

Multiple Choice MUST be **first** in:
- `ALL_SHELLS` array
- `PitchCard.DISTRICTS` array  
- `MOBILE_SHELLS` array

---

## 12 · Adapter contract

Every shell takes a `puzzle` prop. The puzzle shape is defined in `lib/adapters.ts` as `Shell<Name>Puzzle`. The adapter function `adapt<Name>(generatorOutput)` translates the generator's output into that shape.

Generators are pure: `generate<Name>Puzzle(vocab: VocabItem[]): <Name>Puzzle | null`. Returns `null` when there's not enough vocab. The shell falls back to its built-in demo data when puzzle is null/undefined.

`exerciseId` should propagate from generator → adapter → shell so wrong-answer telemetry can attribute to a specific Convex `exercises._id`.

---

## 13 · Themed names — the dictionary

Existing 10 + naming convention reference for new shells:

| Shell type | District name | Accent | One-line scene |
|---|---|---|---|
| Crossword | The Grid District | cyan | grid streets at dusk, station signage |
| Wordsearch | The Neon Market | gold | Shenzhen night market, glowing signs |
| Gap-fill | The Construction Quarter | rose | building under wraps, missing pieces |
| Hangman | The Lantern Alley | gold | red lanterns, one-by-one going out |
| Matching | The Bridge District | violet | suspension bridges connecting islands |
| Flashcards | The Library Tower | green | bookshelves, soft reading light |
| Drag-drop | The Sorting Station | cyan | mail sorting bay, conveyor belts |
| Group sort | The Roundabout | lime | traffic circle, cars rerouting |
| True/False | The Courthouse | rose | civic court, gavel, scales |
| Anagram | The Letter Workshop | magenta | typesetter's bench, brass letter blocks |

Naming rules for new districts:
- Choose a **physical place** in the city (a building, a street, a station, a square)
- Match the verb of the exercise (sort → station, judge → courthouse, find → market)
- Avoid abstractions ("zone", "area"). Pick concrete nouns ("Hall", "Vault", "Pier", "Pavilion", "Roof Garden")
- 2-3 word name in title case, prefixed with "The"

---

## 14 · Per-shell file size & comment density

- Existing shells run 350-650 lines. Match that. Don't ship 80-line stubs.
- Inline comments mark UX decisions ("// drag delay 200ms — under that, click vs drag becomes ambiguous on mobile") not WHAT the code does.
- Top-of-file block comment names the district + describes the interaction in one sentence.

---

## 15 · The "elaborate and flashy" bar

Mike: "as elaborative and as flashy and animated as our current 10 shells so the user experience feels seamless".

Concretely, every new shell must include:
- At least 3 named keyframe animations or CSS transitions on interaction (hover, select, complete)
- A themed scene background (silhouettes, dots, gradients) — not just the page gradient
- An entrance animation on first paint (`em-rise` on the main card)
- A completion celebration (overlay + Bajla cheer + Confetti)
- Sound design hooks (optional but encouraged) via `useShellProgress` callbacks
- At least one tactile micro-interaction (card flip, button press, marquee scroll, etc.)

A shell that "just works" but doesn't feel alive fails this bar.

---

## 16 · Progress persistence

Every shell calls `useShellProgress(shellKey, ...)` from `lib/convex-stubs`. This persists per-question state to Convex so a student who refreshes mid-shell resumes where they were. Don't skip this — it's the difference between a tech demo and a product.

---

## 17 · Wrong-answer telemetry

Every shell accepts an `onWrongAnswer` prop. When the student gets a question wrong, fire it with:

```ts
onWrongAnswer?.({
  questionId: cur.id,
  studentAnswer: <what they entered>,
  correctAnswer: <what was expected>,
  explanationPL: cur.explanation_pl,
  exerciseId: cur.exerciseId,
});
```

Used by Layer-4 dynamic scaffolding (Agent A12) to build a fossilized-error profile.

---

## 18 · Forbidden patterns

- ❌ Material UI / Chakra / Bootstrap components
- ❌ Inline `style` objects > 50 lines (extract to CSS class)
- ❌ Color hex codes outside the palette in §2
- ❌ Sans-serif headlines (use `--em-decor`)
- ❌ Generic alert/dialog roles for completion (always `role="dialog"` + `aria-live="assertive"`)
- ❌ `console.log` in shipped code
- ❌ Untyped `any` props (use `unknown` if truly unknown)
- ❌ Mounting external fonts inside the shell (the global font stack is loaded once)
- ❌ Custom toast libraries (re-use the Confetti + completion overlay pattern)

---

## 19 · The "city is one place" rule

Every district must feel like part of the SAME city. A new shell that introduces, say, a desert backdrop or an ocean breaks the metaphor. Stay urban: alleys, squares, towers, stations, halls, bridges, terminals, gardens, vaults, atria, pavilions, kiosks, podiums, marquees, billboards, balconies, courtyards, cellars.

---

## 20 · When in doubt

Open `src/practice/shells/Wordsearch.tsx` and copy its structure. It's the cleanest reference. The Neon Market is the canonical district.
