import { Routes, Route, Navigate } from 'react-router-dom'
import TabNav from './components/TabNav.jsx'
import Dashboard from './views/Dashboard.jsx'
import Vocabulary from './views/Vocabulary.jsx'
import Lessons from './views/Lessons.jsx'
import Quiz from './views/Quiz.jsx'
import useStudentData from './hooks/useStudentData.js'

function App() {
  const studentData = useStudentData()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Production header shell */}
      <div className="sticky-header-shell px-4 pt-6 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <header className="glass-panel sticky top-0 z-40 rounded-none sm:rounded-[2rem] sm:top-3 border border-white/60 border-t-0 sm:border-t editorial-shadow px-3 py-2.5 sm:px-5 sm:py-3" id="appStickyHeader">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-label text-[13px] font-bold uppercase tracking-[0.26em] text-sky-700 header-brand">English Metropolis</p>
                </div>
                <div className="relative shrink-0" id="voiceSelector">
                  <button id="voiceSelectorBtn" className="flex items-center gap-2 px-4 py-2 bg-white/95 backdrop-blur-xl rounded-2xl border border-white/70 shadow-[0_12px_32px_rgba(15,23,42,0.08)] hover:border-blue-300 transition-all cursor-pointer" type="button" aria-haspopup="true" aria-expanded="false">
                    <span className="material-symbols-outlined text-slate-500 text-lg">settings_voice</span>
                    <span id="currentVoiceLabel" className="font-label text-sm text-slate-700">🇬🇧 bm_fable</span>
                    <span className="material-symbols-outlined text-slate-400 text-sm">expand_more</span>
                  </button>
                  <div id="ttsStatusBadge" className="hidden absolute -top-2 -right-2 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-label font-bold uppercase tracking-[0.18em] text-red-600 shadow-sm" role="status" aria-live="polite">
                    <span className="block h-2 w-2 rounded-full bg-red-500"></span>
                    <span>TTS unavailable</span>
                  </div>
                </div>
              </div>
              <TabNav />
            </div>
          </header>
        </div>
      </div>

      {/* Main content area */}
      <main className="relative px-4 pb-6 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard data={studentData} />} />
            <Route path="/vocabulary" element={<Vocabulary data={studentData} />} />
            <Route path="/lessons" element={<Lessons data={studentData} />} />
            <Route path="/quiz" element={<Quiz />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default App
