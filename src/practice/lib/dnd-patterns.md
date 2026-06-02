# Drag-and-drop patterns across Practice shells

Audited 2026-05-02 (Tier 3 cleanup pass). Documenting current state — no
code changes recommended unless a touch-first shell is found using HTML5
DnD without a touch fallback.

There are three distinct DnD implementations in `src/practice/shells/`. Each
is appropriate for its own use case; unifying them risks regressions for
no real benefit.

## Pattern 1 — HTML5 DnD + useTouchDragDrop hook (the dominant pattern)

Used by: **DragDrop, Unjumble, GroupSort, RankOrder, LabelledDiagram**.

Combines native HTML5 `onDragStart` / `onDragOver` / `onDrop` props (which
work on desktop mouse only) with the `useTouchDragDrop` hook in
`src/practice/shells/useTouchDragDrop.ts`. The hook attaches
`touchstart` / `touchmove` / `touchend` listeners and uses
`document.elementFromPoint` to discover the drop target under the finger
at touchend, falling back to a `data-dnd-drop-id` attribute convention.

Why appropriate: classic source-to-zone semantics where the user moves a
discrete chip into a discrete bucket. Native DnD is the most efficient on
desktop; the hook patches the iOS-Safari/touch gap. Each shell also wires
keyboard handlers (`onKeyDown`) for accessibility.

## Pattern 2 — HTML5 DnD only, no touch fallback

Used by: **GapFill**.

Same `onDragStart` / `onDrop` / `onDragOver` props as Pattern 1, but
without the `useTouchDragDrop` hook. Touch users fall back to the
keyboard (Enter/Space cycles options) or to tapping the gap directly.

Why appropriate: GapFill is rendered as inline word-bank chips next to
text gaps. The chip-to-gap motion is short and the alternative tap-to-fill
flow is well established. Touch DnD here would be over-engineering. (If
an A/B test ever shows touch users getting stuck, the hook is a 30-line
add — but no one has reported that yet.)

## Pattern 3 — Raw mouse/touch event drag-select over an SVG grid

Used by: **Wordsearch**.

Uses `onMouseDown` / `onMouseMove` / `onMouseUp` plus
`onTouchStart` / `onTouchMove` / `onTouchEnd` directly on the SVG grid to
trace a freehand path across letter cells (not source-to-zone — it's
*selecting a range of cells*). Coordinates are converted to grid indices
via `getBoundingClientRect`.

Why appropriate: this is not really drag-and-drop, it's drag-select. The
output is a path, not a (source, zone) pair, so neither HTML5 DnD nor the
useTouchDragDrop hook fits. Raw pointer tracking is the right tool.

## Follow-ups

- None spotted. Every touch-first arcade shell (Battleship, BalloonPop,
  Snake, etc.) uses tap interactions — not drag — and routes through the
  unified MCQOverlay primitive instead.
- If a shell is added that needs spatial drag (e.g. a freehand paint),
  reach for Pattern 3. For everything else, Pattern 1 is the default.
