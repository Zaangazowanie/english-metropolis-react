export default function Quiz() {
  return (
    <section className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow px-5 py-4 sm:px-6 sm:py-4" id="page-quiz">
      <div aria-hidden="true" className="glass-accent-orb orb-section-violet"></div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(260px,0.7fr)]">
        <div>
          <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Quiz</p>
          <h2 className="font-headline text-4xl text-slate-900 mt-2">Quiz Snapshot</h2>
          <p className="text-slate-500 mt-2 max-w-2xl">Quiz tracking is still placeholder-only, but this section keeps quiz readiness visible without affecting the lesson and vocabulary flows.</p>
        </div>
        <div className="liquid-glass-card rounded-[1.75rem] border border-slate-200/70 p-5 space-y-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div id="lessonQuizProgressCard" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-label text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Quiz Progress</p>
                <p className="text-sm text-slate-500 mt-1">Ready for lesson-linked quiz tracking.</p>
              </div>
              <span className="material-symbols-outlined text-slate-300">trophy</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-50 px-3 py-3">
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Completed</p>
                <p id="lessonQuizCompleted" className="font-headline text-2xl text-slate-900 mt-2">0</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-3">
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Average</p>
                <p id="lessonQuizAverage" className="font-headline text-2xl text-slate-900 mt-2">0%</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-3">
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Best</p>
                <p id="lessonQuizBest" className="font-headline text-2xl text-slate-900 mt-2">0%</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-label font-bold uppercase tracking-[0.18em] text-slate-400">
                <span>Tracking Readiness</span>
                <span id="lessonQuizProgressPercent">0%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div id="lessonQuizProgressBar" className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-400 transition-all duration-500" style={{ width: '0%' }}></div>
              </div>
              <p id="lessonQuizProgressNote" className="text-xs leading-relaxed text-slate-500">Quiz stats will populate here once lesson quiz tracking is enabled.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
