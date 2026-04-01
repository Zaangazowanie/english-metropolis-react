# English Metropolis — React SPA Migration

## Quick Start
```bash
npm install
npx vite --host 0.0.0.0 --port 5173
```

## Source of Truth
Production reference: `reference-production.html` (SzymonKarpiński's page)

## Reference Artifacts (DO NOT MODIFY)
- `src/assets/production-block-1.css` — Production CSS block 1 (26K chars)
- `src/assets/production-block-2.css` — Production CSS block 2 (27K chars)  
- `src/assets/production-script-{1..10}.js` — All 10 inline JS scripts extracted
- `reference-production.html` — Full production HTML snapshot

## Key Architecture
- 4 views: Dashboard, Vocabulary, Lessons, Quiz
- Tab switching via `data-section-target` attributes in production
- Routes: `/dashboard`, `/vocabulary`, `/lessons`, `/quiz`
- Tailwind CDN utility classes throughout + custom CSS blocks
- 379K inline JS across 10 scripts

## Script Inventory
| Script | Size | Purpose |
|--------|------|---------|
| 5 | 129K | `__VERBATIM_QUOTES` data + tailwind config + progress graph |
| 9 | 66K | Core app: lesson nav, flashcards, vocabulary, quiz |
| 10 | 181K | Charts, interactions, TTS, Conversa |

## Dashboard Boundaries
- Start: `<section id="page-dashboard">` (line ~924)
- Contains: student name header, lesson profile, progress charts, lesson navigator
- CSS class: `.tab-chip` for nav, `.liquid-glass-card` for cards
