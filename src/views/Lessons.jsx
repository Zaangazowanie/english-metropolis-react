import { useParams } from 'react-router-dom';

export default function Lessons() {
  const { slug } = useParams();

  return (
    <div className="max-w-6xl mx-auto py-6">
      <div className="space-y-4">
        <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow px-5 py-4 sm:px-6 sm:py-4">
          <div className="glass-accent-orb orb-section-blue"></div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Lessons</p>
              <h2 className="font-headline text-4xl text-slate-900 mt-2">Lesson Browser</h2>
              <p className="text-slate-500 mt-2 max-w-2xl">Use the timeline to jump between lesson packs. Open any card to compare its analysis, keywords, collocations, and pronunciation tools side by side.</p>
            </div>
            <div className="lesson-mobile-strip flex gap-2 overflow-x-auto pb-1 lg:hidden scrollbar-hide">
              <p className="text-xs text-slate-400 py-2">Scroll lesson timeline →</p>
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
              <div className="space-y-2">
                <p className="text-sm text-slate-400 text-center py-6">No lessons loaded yet. Connect to the API to see your lesson timeline.</p>
              </div>
            </div>
          </aside>
          <div className="space-y-4 min-w-0">
            <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow p-6 text-center">
              <span className="material-symbols-outlined text-slate-300 text-5xl mb-3 block" aria-hidden="true">menu_book</span>
              <p className="font-headline text-xl text-slate-700 mb-2">No lessons available</p>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Your lesson library will appear here once connected to the backend API.
                Lessons include vocabulary, pronunciation guides, collocations, and quiz exercises.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
