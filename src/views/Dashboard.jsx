export default function Dashboard() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr),minmax(280px,0.7fr)]">
        <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow px-5 py-4 sm:px-6 sm:py-4">
          <div className="glass-accent-orb orb-section-blue"></div>
          <p className="font-label text-[11px] font-bold uppercase tracking-[0.28em] text-sky-700">Dashboard</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="liquid-glass-card rounded-[1.25rem] px-4 py-3 text-slate-900 cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Lessons</p>
              <p className="mt-2 font-headline text-3xl">0</p>
              <p className="text-[10px] text-sky-600 font-label mt-1">→ View all</p>
            </div>
            <div className="liquid-glass-card rounded-[1.25rem] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)] cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Keywords</p>
              <p className="mt-2 font-headline text-3xl text-slate-900">0</p>
              <p className="text-[10px] text-sky-600 font-label mt-1">→ Flashcard viewer</p>
            </div>
          </div>
          <div className="mt-3 liquid-glass-card rounded-[1.75rem] border border-white/60 px-4 py-3 sm:px-5 sm:py-3">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-400 text-sm">menu_book</span>
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Lesson Navigator</p>
              </div>
            </div>
            <input 
              type="search" 
              className="w-full rounded-xl border border-slate-200/60 bg-white/60 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100 mb-3" 
              placeholder="Search lessons by title, topic, or keyword..."
            />
            <div className="space-y-1.5">
              {/* Lesson navigator content will be populated here */}
            </div>
          </div>
        </div>
        <div className="liquid-glass-panel rounded-[2rem] p-5 sm:p-6 editorial-shadow">
          <div className="glass-accent-orb orb-section-violet"></div>
          <div className="flex items-center gap-3">
            <div className="lesson-profile-avatar h-14 w-14 rounded-2xl border border-white/10 flex items-center justify-center">
              <span className="font-headline text-lg text-white">SK</span>
            </div>
            <div className="min-w-0">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Student Snapshot</p>
              <p className="font-headline text-xl leading-tight text-slate-900">Hey Szymon!</p>
              <p className="mt-1 text-sm text-slate-600 truncate">Szymon Karpiński</p>
              <span className="mt-2 inline-flex items-center rounded-full bg-white/30 px-3 py-1 text-[10px] font-label font-bold uppercase tracking-[0.2em] text-slate-700">C1</span>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-700">
            <p>Your recent lessons show real range and steady progress.</p>
            <p>You covered some fascinating topics - from AI ethics to prohibition-era bootlegging.</p>
            <p>Keep up the excellent work.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
