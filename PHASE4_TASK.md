# Phase 4 Task: Wire Real Data into React SPA

## Data Sources (CONFIRMED)
1. **lessons.json** (public/lessons.json) — 13 lessons, 312 keywords total
   - Fields per lesson: id, title, date, student, level, keywords[], keyword_count, conversation_notes, exercises, topics, source, pdfFile
   - Keywords: word, translation, definition_en, definition_pl, context_sentence, pronunciation, part_of_speech, cefr_level, mastery_level, collocations[], examples[], synonyms[], antonyms[], lesson_ref, tags[]

2. **Convex API** (wooden-manatee-881.convex.cloud)
   - POST /api/query with {"path":"...", "args":{...}}
   - `students:listLessons` → lessons with: _id, title, date, order, topics, createdAt, updatedAt
   - `analytics:getStudentAnalyses` → per-lesson analysis: scores, feedback, strengths, improvements
   - Student ID: k17e3mg4ksckdena7ta8r2qndx83s1n9

## Source of Truth (DO NOT VIOLATE)
- Lesson content + keywords → lessons.json
- Progress / analysis / scores → Convex
- Do NOT let these overlap or blend

## Scope (STOP after these — no TTS, no YouGlish, no Conversa)

### Step 1: Dashboard Data
- Load lessons.json on app mount
- Show real lesson count (13) in dashboard cards
- Show real keyword count (312) in dashboard cards
- Show student name "Szymon Karpiński" instead of placeholder
- Populate lesson navigator with real lesson titles + dates

### Step 2: Lessons View
- Render lesson cards from lessons.json in #lessonsList
- Show title, date, topic, keyword_count per lesson
- Sidebar navigator with lesson links

### Step 3: Vocabulary View
- Flatten all keywords from lessons.json into a searchable list
- Render keyword cards with word, translation, definition, cefr_level, mastery_level
- Wire search input to filter keywords by word/definition

## Rules
- Do NOT modify App.jsx header shell or CSS loading
- Do NOT add Tailwind build-time dependencies
- Do NOT touch TTS/YouGlish/Conversa wiring
- Use fetch() to load /lessons.json from public/
- Use useState/useEffect for React state management
- Keep IDs and class names from Phase 3 unchanged
- Run `npx vite build` to verify, then commit

## File Structure
- Create `src/hooks/useStudentData.js` for data fetching
- Create `src/data/studentConfig.js` for constants (studentId, name, etc.)
- Update existing view components (Dashboard.jsx, Lessons.jsx, Vocabulary.jsx)
