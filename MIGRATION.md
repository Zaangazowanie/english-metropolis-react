# English Metropolis React Migration — Phase 1: Reference

## Project Setup
- **Framework:** Vite + React + Tailwind CSS v4 + React Router
- **Dev server:** `http://localhost:5174` (or 5173)
- **Source of truth:** `/var/www/englishmetropolis/students/SzymonKarpiński/index.html`
- **Reference copy:** `reference-production.html`
- **Production CSS:** `src/assets/production-block-1.css` (26K) + `production-block-2.css` (27K)

## Architecture (from production)

### Tab Navigation
4 tabs using `data-section-target` attributes:
- `page-dashboard` — Student dashboard, progress charts, lesson navigator
- `page-vocabulary` — Keyword library with search, flashcards, YouGlish
- `page-lessons` — Lesson browser, content viewer, navigation
- `page-quiz` — Interactive quiz component

### Data Sources
- `lessons.json` — Lesson data (static fetch)
- Convex API (`wooden-manatee-881.convex.cloud`) — Analyses, progress
- `/api/tts/` — Kokoro TTS
- `/api/conversa/` — Conversa/Kimi AI
- `/api/youglish/` — YouGlish video examples
- `window.__VERBATIM_QUOTES` — 128K inline JSON (embedded in production)

### Inline JS Scripts
- Script 5 (129K): `__VERBATIM_QUOTES` data + tailwind config + progress graph/feedback component
- Script 9 (66K): Core app logic (lesson nav, flashcards, vocabulary, quiz)
- Script 10 (181K): Remaining app logic (likely charts, interactions, TTS, Conversa)

### CSS
- Tailwind CDN utility classes throughout HTML
- Block 1 (26K): CSS variables, glass effects, card styles, animations
- Block 2 (27K): Tab chips, progress section, lesson styles, responsive rules

## Migration Order
1. ✅ Project scaffolded (Vite + React + Router + Tailwind)
2. ⬜ Tab navigation component
3. ⬜ Dashboard view (progress, charts, lesson nav)
4. ⬜ Vocabulary view (library, flashcards, YouGlish)
5. ⬜ Lessons view (browser, content, navigation)
6. ⬜ Quiz view
7. ⬜ Integration layer (Convex, TTS, Conversa, YouGlish)
8. ⬜ Parity validation

## Safety
- Production at `englishmetropolis.monexusmedia.uk` — UNTOUCHED
- Staging at `em-spa.monexusmedia.uk` — for testing
- Dev at `localhost:5174` — isolated development
- No proxy changes needed until deploy
