# Task: Port Dashboard HTML to React JSX

## What to do
Convert the production Dashboard HTML (in `dashboard-slice.html`) into a proper React component at `src/views/Dashboard.jsx`.

## Rules (STRICT)
1. **Literal port** — Convert HTML to JSX with minimal changes:
   - `class=` → `className=`
   - `for=` → `htmlFor=`
   - Self-close tags: `<br>`, `<img>`, `<input>` → `<br />`, `<img />`, `<input />`
   - `onclick=` → `onClick=` (use React Router navigate instead of DOM queries)
2. **Preserve ALL class names exactly** — do NOT replace any Tailwind classes
3. **Preserve ALL CSS class references** — `.liquid-glass-card`, `.glass-panel`, `.glass-accent-orb`, `.editorial-shadow`, `.font-label`, `.font-headline`, `.lesson-profile-avatar`, etc.
4. **Do NOT redesign anything**
5. **Do NOT simplify markup**
6. **Do NOT use placeholder data** — use the student data from the production HTML (Szymon Karpiński, C1, SK initials, etc.) as default props/initial state
7. **Do NOT import or use any new CSS framework** — production CSS is already in `src/index.css`

## Specific conversions needed
- `onclick="document.querySelector(...)?.click()"` → Use `useNavigate` from react-router-dom to navigate to `/lessons` or `/vocabulary`
- Elements with IDs like `lessonProfileLessonCount`, `lessonProfileKeywordCount` etc. → Convert to React state variables
- `id="dashboardLessonNavigator"` → Will be populated by JS later, leave as empty div for now
- `id="cumulativeAnalysisSection"` → Leave as hidden section

## Structure
Keep the Dashboard as a single component first. We'll extract sub-components later.
Use React state for the dynamic values (lesson count, keyword count, greeting, etc.) but hardcode Szymon's data as defaults.

## Reference files
- `dashboard-slice.html` — The exact HTML to port
- `src/assets/production-block-1.css` — Production CSS (already loaded)
- `src/assets/production-block-2.css` — Production CSS (already loaded)

## Also create TabNav component
Create `src/components/TabNav.jsx` that renders 4 tab chips matching the production `#topTabNav`:
- Dashboard, Vocabulary, Lessons, Quiz
- Use NavLink from react-router-dom
- Apply the production `.tab-chip` CSS class
- Active tab styling: add `.tab-chip.is-active` class when route matches
- Wrap the 4 chips in a container with `id="topTabNav"` and the same flex layout as production

Then update `src/App.jsx` to include TabNav above the Routes.

## When done
- Ensure `npx vite build` succeeds with no errors
- Commit changes
