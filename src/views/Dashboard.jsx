import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function formatDate(value) {
  if (!value) return 'Date unavailable'

  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function buildEncouragement(lessons, level) {
  const featuredTopics = [...new Set(lessons.flatMap((lesson) => lesson.topics || []))].slice(0, 3)
  const topicLine = featuredTopics.length >= 3
    ? `You covered some fascinating topics - from ${featuredTopics[0]} to ${featuredTopics[1]} and ${featuredTopics[2]}.`
    : 'Your lesson archive already covers a strong range of topics.'

  return [
    `Your recent lessons show real range and steady progress at ${level}.`,
    topicLine,
    'Keep up the excellent work.',
  ]
}

export default function Dashboard({ data }) {
  const navigate = useNavigate()
  const lessons = data?.lessons || []
  const lessonCount = data?.lessonCount || 0
  const keywordCount = data?.keywordCount || 0
  const profile = data?.profile
  const [lessonNavSearch, setLessonNavSearch] = useState('')
  const filteredLessons = lessons.filter((lesson) => {
    const search = lessonNavSearch.trim().toLowerCase()
    if (!search) return true
    return [
      lesson.title,
      lesson.date,
      lesson.topic,
      ...(lesson.topics || []),
      ...(lesson.keywords || []).map((keyword) => `${keyword.word} ${keyword.definition_en || ''}`),
    ]
      .join(' ')
      .toLowerCase()
      .includes(search)
  })
  const encouragement = buildEncouragement(lessons, profile?.level || 'C1')

  return (
    <>
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr),minmax(280px,0.7fr)]" id="page-dashboard">
        <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow px-5 py-4 sm:px-6 sm:py-4">
          <div aria-hidden="true" className="glass-accent-orb orb-section-blue"></div>
          <p className="font-label text-[11px] font-bold uppercase tracking-[0.28em] text-sky-700">Dashboard</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              className="liquid-glass-card rounded-[1.25rem] px-4 py-3 text-slate-900 cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => navigate('/lessons')}
            >
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Lessons</p>
              <p id="lessonProfileLessonCount" className="mt-2 font-headline text-3xl">{lessonCount}</p>
              <p className="text-[10px] text-sky-600 font-label mt-1">→ View all</p>
            </div>
            <div
              className="liquid-glass-card rounded-[1.25rem] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)] cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => navigate('/vocabulary')}
            >
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Keywords</p>
              <p id="lessonProfileKeywordCount" className="mt-2 font-headline text-3xl text-slate-900">{keywordCount}</p>
              <p className="text-[10px] text-sky-600 font-label mt-1">→ Flashcard viewer</p>
            </div>
          </div>
          <div id="recentLessonCard" className="mt-3 liquid-glass-card rounded-[1.75rem] border border-white/60 px-4 py-3 sm:px-5 sm:py-3">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-400 text-sm">menu_book</span>
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Lesson Navigator</p>
              </div>
            </div>
            <input
              id="lessonNavSearch"
              type="search"
              className="w-full rounded-xl border border-slate-200/60 bg-white/60 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100 mb-3"
              placeholder="Search lessons by title, topic, or keyword..."
              value={lessonNavSearch}
              onChange={(event) => setLessonNavSearch(event.target.value)}
            />
            <div id="dashboardLessonNavigator" className="space-y-1.5">
              {data?.lessonsError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {data.lessonsError}
                </div>
              ) : filteredLessons.length ? (
                filteredLessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    type="button"
                    className="w-full rounded-[1.25rem] border border-slate-200 bg-white/85 px-4 py-3 text-left transition hover:border-sky-200 hover:bg-white"
                    onClick={() => navigate(`/lessons#lesson-card-${lesson.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          {formatDate(lesson.date)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{lesson.title}</p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-label font-bold uppercase tracking-[0.16em] text-slate-600">
                        {lesson.keyword_count}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{lesson.topic}</p>
                  </button>
                ))
              ) : (
                <p className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-500">
                  No lessons available.
                </p>
              )}
            </div>
          </div>
        </div>
        <div id="lessonStudentProfileCard" className="liquid-glass-panel rounded-[2rem] p-5 sm:p-6 editorial-shadow">
          <div aria-hidden="true" className="glass-accent-orb orb-section-violet"></div>
          <div className="flex items-center gap-3">
            <div className="lesson-profile-avatar h-14 w-14 rounded-2xl border border-white/10 flex items-center justify-center">
              <span id="lessonProfileInitials" className="font-headline text-lg text-white">{profile?.initials || 'SK'}</span>
            </div>
            <div className="min-w-0">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Student Snapshot</p>
              <p id="lessonProfileGreeting" className="font-headline text-xl leading-tight text-slate-900">Hey {profile?.firstName || 'Szymon'}!</p>
              <p id="lessonProfileName" className="mt-1 text-sm text-slate-600 truncate">{profile?.name || 'Szymon Karpiński'}</p>
              <span id="lessonProfileLevel" className="mt-2 inline-flex items-center rounded-full bg-white/30 px-3 py-1 text-[10px] font-label font-bold uppercase tracking-[0.2em] text-slate-700">{profile?.level || 'C1'}</span>
            </div>
          </div>
          <div id="lessonProfileEncouragement" className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-700">
            <p id="lessonProfileLineOne">{encouragement[0]}</p>
            <p id="lessonProfileLineTwo">{encouragement[1]}</p>
            <p id="lessonProfileLineThree">{encouragement[2]}</p>
          </div>
        </div>
      </section>

      <section id="cumulativeAnalysisSection" className={data?.analyses?.length ? '' : 'hidden'}>
        <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow px-5 py-4 sm:px-6 sm:py-4">
          <div id="cumulativeAnalysisCard">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="liquid-glass-card rounded-[1.5rem] px-4 py-4">
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Average Score</p>
                <p className="mt-2 font-headline text-3xl text-slate-900">{data?.averageScore || 0}</p>
                <p className="mt-2 text-sm text-slate-500">Pulled from Convex lesson analyses.</p>
              </div>
              <div className="liquid-glass-card rounded-[1.5rem] px-4 py-4">
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Latest Analysis</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{data?.latestAnalysis?.cefrBand || 'Pending'} {Math.round(Number(data?.latestAnalysis?.overallScore || 0)) || ''}</p>
                <p className="mt-2 text-sm text-slate-500">{data?.latestAnalysis?.lessonTitle || 'No analysis linked yet.'}</p>
              </div>
              <div className="liquid-glass-card rounded-[1.5rem] px-4 py-4">
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Feedback Status</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {data?.convexError || data?.latestAnalysis?.feedback || 'Convex analysis feedback is ready when available.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
