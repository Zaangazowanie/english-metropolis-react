import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import TabNav from './components/TabNav.jsx'
import VoiceSelector from './components/VoiceSelector.jsx'
import ConsentBanner from './components/ConsentBanner.jsx'
import RouteErrorBoundary from './components/RouteErrorBoundary.jsx'
import SettingsMenu from './components/SettingsMenu.jsx'
import GlobalSearch from './components/GlobalSearch.jsx'
import Dashboard from './views/Dashboard.jsx'
import Vocabulary from './views/Vocabulary.jsx'
import Lessons from './views/Lessons.jsx'
import Quiz from './views/Quiz.jsx'
import KnowledgeBase from './views/KnowledgeBase.jsx'
import useStudentData from './hooks/useStudentData.js'
import { useI18n } from './i18n'
import { useStudentAuth } from './contexts/StudentAuthContext.jsx'

function App({ basePath = '' }) {
  const { t } = useI18n()
  const params = useParams()
  const studentData = useStudentData()
  const { hasStudentAccess, isStudentAuthenticated, resolvedSlug } = useStudentAuth()
  const slug = params.slug || ''
  const dashboardPath = slug ? `${basePath}/${slug}/dashboard` : (basePath ? `${basePath}/dashboard` : '/dashboard')

  // Auth guard: on englishmetro.com, require either a real session or a
  // legacy studentSlug in localStorage. The slug in the URL must also
  // match the session slug (prevents URL-guessing another student's data).
  const IS_ENGLISHMETRO = typeof window !== 'undefined' && /englishmetro\.com/i.test(window.location.hostname)
  if (IS_ENGLISHMETRO && slug) {
    // If there's no access at all, redirect to login
    if (!hasStudentAccess) {
      return <Navigate to="/login" replace />
    }
    // If there IS a real auth session but the URL slug doesn't match, redirect
    // to their own dashboard (prevents slug-guessing other students' data)
    if (isStudentAuthenticated && resolvedSlug && resolvedSlug !== slug) {
      return <Navigate to={`/app/${resolvedSlug}/dashboard`} replace />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Production header shell */}
      <div className="sticky-header-shell px-4 pt-6 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <header className="glass-panel sticky top-0 z-40 rounded-none sm:rounded-[2rem] sm:top-3 border border-white/60 border-t-0 sm:border-t editorial-shadow px-3 py-2.5 sm:px-5 sm:py-3" id="appStickyHeader">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="min-w-0 flex items-center gap-2 shrink-0">
                  <span className="em-brand-skyline" role="img" aria-label="" />
                  <p className="font-label text-[13px] font-bold uppercase tracking-[0.18em] text-sky-700 header-brand hidden sm:block">
                    EnglishMetro<span className="text-fuchsia-500">.com</span>
                  </p>
                </div>
                <GlobalSearch />
                <VoiceSelector />
                <SettingsMenu userName={slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Student'} />
              </div>
              <TabNav />
            </div>
          </header>
        </div>
      </div>

      {/* Main content area */}
      <main className="relative px-4 pb-6 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {studentData.loading && (
            <div className="glass-panel p-8 text-center animate-pulse">
              <span className="material-symbols-outlined text-3xl text-primary/40 mb-2 block">hourglass_top</span>
              <p className="font-label text-sm text-on-surface-variant">{t('common.loading')}</p>
            </div>
          )}
          <Routes>
            <Route index element={<Navigate to={dashboardPath} replace />} />
            <Route path="dashboard" element={
              <RouteErrorBoundary name="Dashboard">
                <Dashboard data={studentData} />
              </RouteErrorBoundary>
            } />
            <Route path="vocabulary" element={
              <RouteErrorBoundary name="Vocabulary">
                <Vocabulary data={studentData} />
              </RouteErrorBoundary>
            } />
            <Route path="lessons" element={
              <RouteErrorBoundary name="Lessons">
                <Lessons data={studentData} />
              </RouteErrorBoundary>
            } />
            <Route path="knowledge" element={
              <RouteErrorBoundary name="KnowledgeBase">
                <KnowledgeBase data={studentData} />
              </RouteErrorBoundary>
            } />
            <Route path="practice" element={
              <RouteErrorBoundary name="Practice">
                <Quiz data={studentData} />
              </RouteErrorBoundary>
            } />
            <Route path="quiz" element={<Navigate to={`${basePath}/${params.slug || ''}/practice`.replace('//', '/')} replace />} />
            <Route path="*" element={<Navigate to={dashboardPath} replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default App
