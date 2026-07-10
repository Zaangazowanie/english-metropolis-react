// The live lesson packages sold on englishmetro.com — SINGLE SOURCE OF TRUTH
// for the pricing page, the student buy-lessons wizard and order records.
// `lessons` = how many lessons a confirmed order allocates.

export const PRIVATE_PACKAGES = [
  {
    id: 'single',
    name: 'One-off 1:1',
    pace: '1 live lesson',
    price: '135 PLN',
    perLesson: '135 PLN / lesson',
    bestFor: 'A focused first session with a clear next-step plan',
    features: ['Placement and goal check', '1 x 60 min 1:1 lesson', 'Personal CEFR snapshot', 'Lesson notes and practice path'],
    badge: 'Once off',
    accent: 'sky',
  },
  {
    id: 'private-core',
    name: 'Private Core',
    pace: '4 live lessons',
    price: '480 PLN',
    perLesson: '120 PLN / lesson',
    bestFor: 'A compact first month for regular speaking progress',
    features: ['Placement and goal check', 'Personal CEFR plan', '4 x 60 min 1:1 lessons', 'Lesson notes after each session'],
    badge: 'Start here',
    accent: 'sky',
  },
  {
    id: 'momentum',
    name: 'Fluency Momentum',
    pace: '8 live lessons',
    price: '880 PLN',
    perLesson: '110 PLN / lesson',
    bestFor: 'The strongest routine for steady fluency work',
    features: ['Placement and goal check', 'Personal CEFR plan', '8 x 60 min 1:1 lessons', 'Lesson notes and weekly targets'],
    badge: 'Most chosen',
    accent: 'brand',
  },
  {
    id: 'fluency-16',
    name: 'Fluency Builder',
    pace: '16 live lessons',
    price: '1,600 PLN',
    perLesson: '100 PLN / lesson',
    bestFor: 'A deeper programme for visible speaking progress',
    features: ['Placement and goal check', 'Personal CEFR plan', '16 x 60 min 1:1 lessons', 'Lesson notes and progress reviews'],
    badge: 'Best rhythm',
    accent: 'brand',
  },
  {
    id: 'fluency-24',
    name: 'Fluency Mastery',
    pace: '24 live lessons',
    price: '2,160 PLN',
    perLesson: '90 PLN / lesson',
    bestFor: 'The best value for sustained private coaching',
    features: ['Placement and goal check', 'Personal CEFR plan', '24 x 60 min 1:1 lessons', 'Lesson notes and monthly reviews'],
    badge: 'Best value',
    accent: 'sky',
  },
]

export const PACKAGE_LESSONS = {
  single: 1,
  'private-core': 4,
  momentum: 8,
  'fluency-16': 16,
  'fluency-24': 24,
}
