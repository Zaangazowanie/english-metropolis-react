# Task: Port Vocabulary HTML to React JSX

Read `vocabulary-slice.html` and convert it to a React component at `src/views/Vocabulary.jsx`.

## Rules (STRICT)
1. **Literal port** — Convert HTML to JSX with minimal changes:
   - `class=` → `className=`
   - `for=` → `htmlFor=`
   - Self-close tags
2. **Preserve ALL class names exactly**
3. **Preserve ALL CSS class references**
4. **Do NOT redesign anything**
5. **Do NOT simplify markup**
6. **Do NOT use placeholder data**

## Specific conversions needed
- `onclick` handlers → React event handlers or state changes
- Static IDs → Keep IDs for now (they'll be needed for JS integration later)
- `document.getElementById` references → These will be converted to React state in Phase 5, for now keep the structure

## Key structure
The vocabulary section contains:
- Search/filter controls
- Keyword cards grid
- Tag/filter chips
- Flashcard viewer
- YouGlish integration area

When done, run `npx vite build` to verify no errors, then commit.
