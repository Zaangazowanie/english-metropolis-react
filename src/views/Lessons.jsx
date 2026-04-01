export default function Lessons() {
  return (
    <section className="space-y-4" id="page-lessons">
      <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow px-5 py-4 sm:px-6 sm:py-4">
        <div aria-hidden="true" className="glass-accent-orb orb-section-blue"></div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Lessons</p>
            <h2 className="font-headline text-4xl text-slate-900 mt-2">Lesson Browser</h2>
            <p className="text-slate-500 mt-2 max-w-2xl">Use the timeline to jump between lesson packs. Open any card to compare its analysis, keywords, collocations, and pronunciation tools side by side.</p>
          </div>
          <div id="lessonMobileStrip" className="lesson-mobile-strip flex gap-2 overflow-x-auto pb-1 lg:hidden"></div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px,minmax(0,1fr)] lg:items-start">
        <aside className="hidden lg:block">
          <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow p-4 xl:sticky xl:top-28">
            <div className="mb-4">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Lesson Navigator</p>
              <p className="mt-2 text-sm text-slate-500">Date, creative title, keyword volume, and CEFR snapshot stay visible here.</p>
            </div>
            <div id="lessonNavSidebar" className="space-y-2"></div>
          </div>
        </aside>
        <div id="lessonsList" className="space-y-4 min-w-0"></div>
      </div>
    </section>
  )
}
