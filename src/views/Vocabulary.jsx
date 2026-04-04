export default function Vocabulary() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow px-5 py-4 sm:px-6 sm:py-4">
        <div className="glass-accent-orb orb-section-violet"></div>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Vocabulary</p>
              <h2 className="font-headline text-4xl text-slate-900 mt-2">Anki Flashcard Viewer</h2>
              <p className="text-slate-500 mt-2 max-w-3xl">Flip through one keyword at a time, switch into shuffled study mode, or browse the full archive in paginated batches without leaving the lesson context.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),220px] xl:min-w-[420px]">
              <label className="block">
                <span className="sr-only">Search flashcards</span>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                  <input 
                    type="search" 
                    className="w-full rounded-2xl border-slate-200 bg-white py-3.5 pl-12 pr-4 text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-400 focus:ring-blue-400" 
                    placeholder="Search words, definitions, examples, or lesson titles"
                  />
                </div>
              </label>
              <label className="block">
                <span className="sr-only">Filter by lesson</span>
                <select className="w-full rounded-2xl border-slate-200 bg-white py-3.5 pl-4 pr-10 text-sm text-slate-800 shadow-sm focus:border-blue-400 focus:ring-blue-400">
                  <option>All Lessons</option>
                </select>
              </label>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),320px]">
            <div className="space-y-4">
              <div className="liquid-glass-card rounded-[1.5rem] border border-slate-200/70 px-4 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Viewer Mode</p>
                    <p className="mt-2 text-sm text-slate-600">Loading flashcards...</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="flashcard-mode-toggle is-active rounded-full border border-slate-200 bg-white/90 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700">Browse All</button>
                    <button className="flashcard-mode-toggle rounded-full border border-slate-200 bg-white/90 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700">Study Mode</button>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {/* Topic filters will be populated here */}
                </div>
              </div>
              <div className="flashcard-stage liquid-glass-card rounded-[1.75rem] border border-slate-200/70 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <button className="flashcard-nav-btn" aria-label="Previous flashcard">
                    <span className="material-symbols-outlined">arrow_back_ios_new</span>
                  </button>
                  <div className="min-w-0 text-center">
                    <p className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">0 of 0</p>
                    <p className="mt-1 text-sm text-slate-500">Lesson title</p>
                  </div>
                  <button className="flashcard-nav-btn" aria-label="Next flashcard">
                    <span className="material-symbols-outlined">arrow_forward_ios</span>
                  </button>
                </div>
                <button className="flashcard-scene mt-4 w-full text-left" aria-pressed="false">
                  <span className="sr-only">Flip flashcard</span>
                  <div className="flashcard-inner">
                    <div className="flashcard-face flashcard-face-front">
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">Front</p>
                      <div className="mt-6">
                        <h3 className="font-headline text-4xl leading-tight text-slate-900 sm:text-5xl">Word</h3>
                        <div className="mt-3 flex items-center gap-3">
                          <p className="font-mono text-sm text-sky-700">/ipa/</p>
                          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-600 transition-colors cursor-pointer" title="Listen to pronunciation">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                            </svg>
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-slate-500 italic">respelling</p>
                        <p className="mt-8 text-sm text-slate-600">Press Space to flip, or click the card.</p>
                      </div>
                    </div>
                    <div className="flashcard-face flashcard-face-back" style="min-height:300px;">
                      <div className="space-y-4">
                        <div>
                          <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em]" style="color:#666;">Definition</p>
                          <p className="mt-2 text-base leading-relaxed" style="color:#1e293b;">Definition</p>
                        </div>
                        <div>
                          <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em]">Polish</p>
                          <p className="mt-2 text-base leading-relaxed" style="color:#1e293b;">Translation</p>
                        </div>
                        <div>
                          <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em]">Example</p>
                          <p className="mt-2 text-sm italic leading-relaxed" style="color:#1e293b;">Example sentence</p>
                        </div>
                        <div>
                          <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em]">Collocations</p>
                          <p className="mt-2 text-sm leading-relaxed" style="color:#1e293b;">Collocations</p>
                        </div>
                        <div>
                          <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em]">Lesson</p>
                          <p className="mt-2 text-sm leading-relaxed" style="color:#1e293b;">Lesson</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-label font-bold uppercase tracking-[0.18em] text-slate-400">
                    <span>Cards Reviewed</span>
                    <span>0%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-400 transition-all duration-500" style="width: 0%"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
