// Entirely fictional public lesson. These examples never read a learner account.
export const REPORT_CHAPTERS = [
  ['overview', 'insights', 'Skill scores', 'Wyniki umiejętności', 'Five skills. A clearer picture.', 'Pięć umiejętności. Pełniejszy obraz.'],
  ['summary', 'auto_stories', 'Lesson summary', 'Podsumowanie lekcji', 'The conversation, connected.', 'Rozmowa połączona w całość.'],
  ['vocabulary', 'style', 'Vocabulary', 'Słownictwo', 'Your words become something you use.', 'Twoje słowa stają się praktyką.'],
  ['strengths', 'celebration', 'Strengths', 'Mocne strony', 'See what is already working.', 'Zobacz, co już działa.'],
  ['improvements', 'trending_up', 'Improvements', 'Obszary do poprawy', 'Know where to put your effort.', 'Wiesz, nad czym pracować.'],
  ['corrections', 'spellcheck', 'Key errors', 'Najważniejsze błędy', 'Your sentence. A better next attempt.', 'Twoje zdanie. Lepsza kolejna próba.'],
  ['practice', 'exercise', 'Practice advice', 'Plan ćwiczeń', 'Feedback that gives you a next step.', 'Wskazówki, które prowadzą do działania.'],
  ['recommendations', 'auto_awesome', 'Recommendations', 'Rekomendacje', 'More English, in things you enjoy.', 'Więcej angielskiego w tym, co lubisz.'],
  ['progress', 'monitoring', 'Progress over time', 'Postępy w czasie', 'One lesson is part of a longer story.', 'Każda lekcja to część większej historii.'],
  ['notes', 'description', 'Notes & materials', 'Notatki i materiały', 'Take your learning with you.', 'Zabierz swoją naukę ze sobą.'],
]
export const SAMPLE_SCORES = { vocabularyRange: 78, grammaticalAccuracy: 68, fluencyAndCoherence: 76, pronunciation: 72, communicativeEffectiveness: 82 }
export const SAMPLE_PROGRESS = [
  { lessonDate: '2026-07-06', lessonTitle: 'Planning a journey', grammaticalAccuracy: 58, cefrBand: 'B1' },
  { lessonDate: '2026-07-13', lessonTitle: 'Places worth visiting', grammaticalAccuracy: 61, cefrBand: 'B1' },
  { lessonDate: '2026-07-20', lessonTitle: 'A story from a trip', grammaticalAccuracy: 60, cefrBand: 'B1' },
  { lessonDate: '2026-07-27', lessonTitle: 'Talking about art', grammaticalAccuracy: 65, cefrBand: 'B1' },
  { lessonDate: '2026-08-03', lessonTitle: 'Making comparisons', grammaticalAccuracy: 66, cefrBand: 'B2' },
  { lessonDate: '2026-08-10', lessonTitle: 'A weekend in a new city', grammaticalAccuracy: 68, cefrBand: 'B2' },
]
export function nextReportChapter(index, direction = 1) { return (index + direction + REPORT_CHAPTERS.length) % REPORT_CHAPTERS.length }
export const REPORT_STEP_MS = 8500
