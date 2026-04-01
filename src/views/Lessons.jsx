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

export default function Lessons({ data }) {
  const lessons = data?.lessons || []

  return (
    <section className="space-y-4" id="page-lessons">
      <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow px-5 py-4 sm:px-6 sm:py-4">
        <div aria-hidden="true" className="glass-accent-orb orb-section-blue"></div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Lessons</p>
            <h2 className="font-headline text-4xl text-slate-900 mt-2">Lesson Browser</h2>
            <p className="text-slate-500 mt-2 max-w-2xl">This archive now reads directly from `lessons.json`, while score and feedback snapshots come from Convex.</p>
          </div>
          <div id="lessonMobileStrip" className="lesson-mobile-strip flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {lessons.map((lesson) => (
              <a
                key={lesson.id}
                href={`#lesson-card-${lesson.id}`}
                className="lesson-nav-card shrink-0 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-left"
              >
                <span className="block font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{formatDate(lesson.date)}</span>
                <span className="mt-1 block text-sm font-semibold text-slate-900">{lesson.title}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px,minmax(0,1fr)] lg:items-start">
        <aside className="hidden lg:block">
          <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow p-4 xl:sticky xl:top-28">
            <div className="mb-4">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Lesson Navigator</p>
              <p className="mt-2 text-sm text-slate-500">Date, creative title, keyword volume, and CEFR snapshot stay visible here.</p>
            </div>
            <div id="lessonNavSidebar" className="space-y-2">
              {lessons.map((lesson) => (
                <a
                  key={lesson.id}
                  href={`#lesson-card-${lesson.id}`}
                  className="lesson-nav-card block w-full rounded-[1.35rem] border border-slate-200 bg-white/80 px-4 py-3 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{formatDate(lesson.date)}</p>
                      <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">{lesson.title}</p>
                    </div>
                    {lesson.analysis?.cefrBand ? (
                      <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-label font-bold uppercase tracking-[0.16em] text-sky-700">
                        {lesson.analysis.cefrBand}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-label font-bold uppercase tracking-[0.16em]">
                    <span className="text-slate-500">{lesson.keyword_count} keywords</span>
                    <span className="text-slate-400">{lesson.topic}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </aside>
        <div id="lessonsList" className="space-y-4 min-w-0">
          {data?.lessonsError ? (
            <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-5 py-4 text-red-700">
              <p className="font-label text-xs font-bold uppercase tracking-[0.24em]">Archive Error</p>
              <p className="mt-2 text-sm">{data.lessonsError}</p>
            </div>
          ) : lessons.map((lesson) => (
            <article
              key={lesson.id}
              id={`lesson-card-${lesson.id}`}
              className="lesson-card lesson-card-item rounded-[1.75rem] border border-slate-200/80 bg-white/[0.88] shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
            >
              <div className="w-full px-4 py-4 text-left md:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                        {formatDate(lesson.date)}
                      </span>
                      {lesson.analysis?.cefrBand ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-label font-bold uppercase tracking-[0.18em] text-sky-700">
                          {lesson.analysis.cefrBand} {Math.round(Number(lesson.analysis.overallScore || 0))}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-3 font-headline text-[1.35rem] leading-tight md:text-[1.75rem] text-slate-900">{lesson.title}</h3>
                    <p className="mt-2 text-sm text-slate-500">{lesson.topic}</p>
                  </div>
                  <div className="shrink-0">
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-label font-bold uppercase tracking-[0.18em] text-slate-600">
                      {lesson.keyword_count} keywords
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr),minmax(220px,0.7fr)]">
                  <div className="rounded-[1.35rem] border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                    <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Topics</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {lesson.topics.slice(0, 6).map((topic) => (
                        <span
                          key={`${lesson.id}-${topic}`}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[1.35rem] border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                    <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Convex Analysis</p>
                    {lesson.analysis ? (
                      <>
                        <p className="mt-2 text-sm text-slate-700">{lesson.analysis.feedback || 'Feedback available for this lesson.'}</p>
                        <div className="mt-3 space-y-2">
                          {lesson.analysis.strengths.slice(0, 2).map((item) => (
                            <p key={`${lesson.id}-strength-${item}`} className="text-xs text-emerald-700">Strength: {item}</p>
                          ))}
                          {lesson.analysis.improvements.slice(0, 2).map((item) => (
                            <p key={`${lesson.id}-improvement-${item}`} className="text-xs text-amber-700">Improve: {item}</p>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">{data?.convexError || 'No Convex analysis matched this lesson yet.'}</p>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
