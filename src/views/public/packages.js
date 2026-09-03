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
        pacePl: '1 lekcja na żywo',
    bestForPl: 'Jedno skoncentrowane spotkanie z jasnym planem na dalszą naukę',
    badgePl: 'Jednorazowo',
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
        pacePl: '4 lekcje na żywo',
    bestForPl: 'Kompaktowy pierwszy miesiąc regularnej pracy nad mówieniem',
    badgePl: 'Zacznij tutaj',
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
        pacePl: '8 lekcji na żywo',
    bestForPl: 'Najmocniejsza rutyna dla stałych postępów w płynności',
    badgePl: 'Najczęściej wybierany',
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
        pacePl: '16 lekcji na żywo',
    bestForPl: 'Głębszy program dla widocznych postępów w mówieniu',
    badgePl: 'Najlepszy rytm',
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
        pacePl: '24 lekcje na żywo',
    bestForPl: 'Najlepsza cena przy długofalowym indywidualnym coachingu',
    badgePl: 'Najlepsza cena',
    accent: 'sky',
  },
  {
    id: 'fluency-48',
    name: 'Fluency Complete',
    pace: '48 live lessons',
    price: '3,840 PLN',
    perLesson: '80 PLN / lesson',
    bestFor: 'The lowest private lesson rate for a complete year of steady progress',
    features: ['Placement and goal check', 'Personal CEFR plan', '48 x 60 min 1:1 lessons', 'Lesson notes and monthly reviews'],
    badge: 'Lowest lesson rate',
    pacePl: '48 lekcji na żywo',
    bestForPl: 'Najniższa cena lekcji przy pełnym roku regularnej nauki',
    badgePl: 'Najniższa cena lekcji',
    accent: 'brand',
  },
]

export const SPECIALIST_PACKAGES = [
  {
    id: 'specialist',
    name: 'Specialist Sprint',
    pace: '6 specialist lessons',
    price: '900 PLN',
    perLesson: '150 PLN / lesson',
    bestFor: 'Interview, exam, relocation, and business pressure',
    features: ['Diagnostic placement call', 'Specialist CEFR outcome plan', '6 x 60 min specialist lessons', 'Review notes after each session'],
    badge: 'Focused',
    accent: 'ember',
  },
  {
    id: 'specialist-12',
    name: 'Specialist Track',
    pace: '12 specialist lessons',
    price: '1,560 PLN',
    perLesson: '130 PLN / lesson',
    bestFor: 'A focused plan for exam, interview, or business outcomes',
    features: ['Diagnostic placement call', 'Specialist CEFR outcome plan', '12 x 60 min specialist lessons', 'Two writing or speaking reviews'],
    badge: 'Deeper focus',
    accent: 'ember',
  },
  {
    id: 'specialist-24',
    name: 'Specialist Mastery',
    pace: '24 specialist lessons',
    price: '2,640 PLN',
    perLesson: '110 PLN / lesson',
    bestFor: 'The best value for long-term specialist coaching',
    features: ['Diagnostic placement call', 'Specialist CEFR outcome plan', '24 x 60 min specialist lessons', 'Monthly review and lesson notes'],
    badge: 'Best specialist value',
    accent: 'ember',
  },
]

// Group courses. Fixed timetable, never self-booked: a group runs at set times
// Mon-Thu and the student joins it. August and the two-month bundle were
// withdrawn 2026-08-10 — September only, twice weekly, at the current price.
export const GROUP_COURSES = [
  {
    id: 'september',
    name: 'September Group Course',
    namePl: 'Kurs wrześniowy',
    pace: '8 group lessons',
    pacePl: '8 lekcji grupowych',
    price: '400 PLN',
    perLesson: '50 PLN / lesson',
    bestFor: 'Two lessons a week for the month, in a group of up to 4 at your level',
    bestForPl: 'Dwie lekcje w tygodniu przez miesiąc, w grupie do 4 osób na Twoim poziomie',
    badge: 'September',
    badgePl: 'Wrzesień',
    accent: 'sky',
  },
]

export const COMPANY_PACKAGES = [
  {
    id: 'company-24',
    name: 'Company Team 24',
    pace: '24 live company group lessons',
    price: '4,800 PLN',
    calculation: '24 x 200 PLN = 4,800 PLN',
    perLesson: '200 PLN / group lesson',
    perStudentPackage: '960 PLN / employee / package',
    perStudent: '40 PLN / employee / lesson',
    bestFor: 'A focused 24-lesson programme for one team of up to 5 employees',
    features: ['Level and goal check for up to 5 employees', 'CEFR plan aligned with company goals', '24 x 60 min online group lessons', 'Monthly progress summary for the company'],
    badge: 'Up to 5 employees',
    accent: 'brand',
  },
  {
    id: 'company-48',
    name: 'Company Team 48',
    pace: '48 live company group lessons',
    price: '6,080 PLN',
    calculation: '7,600 PLN - 20% = 6,080 PLN',
    perLesson: '126.67 PLN / group lesson',
    perStudentPackage: '1,216 PLN / employee / package',
    perStudent: '25.33 PLN / employee / lesson',
    bestFor: 'A 20% saving on the 7,600 PLN calculation for a 48-lesson programme',
    features: ['Level and goal check for up to 5 employees', 'CEFR plan aligned with company goals', '48 x 60 min online group lessons', 'Monthly progress summary for the company'],
    badge: 'Save 20%',
    accent: 'brand',
  },
]

// Package validity shown next to every package (Regulamin § 5 ust. 2, revision 5,
// 2026-09-03). MUST match convex/billing.ts packageValidity, which is what the
// backend writes to lessonPackages.expiresAt at purchase.
export function packageValidity(lessons) {
  const n = Number(lessons) || 0
  if (n <= 1) return { en: 'Valid 90 days from purchase', pl: 'Ważność: 90 dni od zakupu' }
  if (n <= 8) return { en: 'Valid 6 months from purchase', pl: 'Ważność: 6 miesięcy od zakupu' }
  if (n <= 24) return { en: 'Valid 12 months from purchase', pl: 'Ważność: 12 miesięcy od zakupu' }
  return { en: 'Valid 24 months from purchase', pl: 'Ważność: 24 miesiące od zakupu' }
}

export const PACKAGE_LESSONS = {
  single: 1,
  'private-core': 4,
  momentum: 8,
  'fluency-16': 16,
  'fluency-24': 24,
  'fluency-48': 48,
  specialist: 6,
  'specialist-12': 12,
  'specialist-24': 24,
  september: 8,
  'company-24': 24,
  'company-48': 48,
}
