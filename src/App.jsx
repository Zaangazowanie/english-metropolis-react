import { useEffect } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import TabNav from './components/TabNav.jsx'
import VoiceSelector from './components/VoiceSelector.jsx'
import RouteErrorBoundary from './components/RouteErrorBoundary.jsx'
import SettingsMenu from './components/SettingsMenu.jsx'
import GlobalSearch from './components/GlobalSearch.jsx'
import Dashboard from './views/Dashboard.jsx'
import Calendar from './views/Calendar.jsx'
import Vocabulary from './views/Vocabulary.jsx'
import Lessons from './views/Lessons.jsx'
import Quiz from './views/Quiz.jsx'
import KnowledgeBase from './views/KnowledgeBase.jsx'
import useStudentData from './hooks/useStudentData.js'
import { useI18n } from './i18n'
import { useStudentAuth } from './contexts/StudentAuthContext.jsx'
import DashboardV3 from './views/v3/Dashboard.jsx'
import CalendarV3 from './views/v3/Calendar.jsx'
import VocabularyV3 from './views/v3/Vocabulary.jsx'
import LessonsV3 from './views/v3/Lessons.jsx'
import KnowledgeBaseV3 from './views/v3/KnowledgeBase.jsx'
import PracticeV3 from './views/v3/Practice.jsx'
import PracticeNew from './views/v3/PracticeNew.jsx'
import PracticeDesign from './views/v3/PracticeDesign.jsx'
import Chrome from './design/v3/Chrome.jsx'

const IS_ENGLISHMETRO = typeof window !== 'undefined' && /englishmetro\.com/i.test(window.location.hostname)
const USE_V3 = typeof window === 'undefined' || !window.__EM_LEGACY

function App({ basePath = '' }) {
  const { t, lang, setLang, englishLevel, setEnglishLevel } = useI18n()
  const params = useParams()
  const studentData = useStudentData()
  const { hasStudentAccess, isStudentAuthenticated, resolvedSlug } = useStudentAuth()
  const slug = params.slug || ''
  const dashboardPath = slug ? `${basePath}/${slug}/dashboard` : (basePath ? `${basePath}/dashboard` : '/dashboard')

  // Auto-default to Polish for A1/A2/B1 students on first load. Polish
  // students at lower CEFR want the instructional layer in their L1 — Mike's
  // explicit rule: "for all profiles A1 - B1, set the language on their pages
  // to Polish". Once the student has manually toggled the EN/PL switch, we
  // record `em.lang.userExplicit` and never override again.
  // The `level` field on the student profile is the canonical CEFR
  // ('A1'|'A2'|'B1'|'B2'|'C1'|'C2').
  const studentLevel = String(studentData?.profile?.level || studentData?.level || '').toUpperCase()
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!studentLevel) return
    const langExplicit = window.localStorage.getItem('em.lang.userExplicit') === 'true'
    const levelExplicit = window.localStorage.getItem('em.englishLevel.userExplicit') === 'true'
    const lowerCEFR = ['A1', 'A2', 'B1'].includes(studentLevel)
    // Auto-default: A1/A2/B1 → Polish UI + simplified English
    if (!langExplicit && lowerCEFR && lang !== 'pl') setLang('pl')
    if (!levelExplicit && lowerCEFR && englishLevel !== 'simple') setEnglishLevel('simple')
  }, [studentLevel, lang, setLang, englishLevel, setEnglishLevel])

  if (IS_ENGLISHMETRO && slug) {
    if (!hasStudentAccess) {
      return <Navigate to="/login" replace />
    }
    if (isStudentAuthenticated && resolvedSlug && resolvedSlug !== slug) {
      return <Navigate to={`/app/${resolvedSlug}/dashboard`} replace />
    }
  }

  // v3 shell — englishmetro.com only. Wraps everything in AuroraBG + TopBar chrome.
  // Dashboard gets the full v3 port; other tabs still render the legacy views
  // inside the v3 shell for now. Tabs light up incrementally in Phase 2 pushes.
  if (IS_ENGLISHMETRO && USE_V3) {
    const firstName = studentData?.profile?.firstName
      || (slug ? slug.split('-')[0].replace(/\b\w/g, c => c.toUpperCase()) : 'Student')

    return (
      <Chrome slug={slug} basePath={basePath} firstName={firstName}>
        <Routes>
          <Route index element={<Navigate to={dashboardPath} replace />} />
          <Route path="dashboard" element={
            <RouteErrorBoundary name="Dashboard">
              <DashboardV3 data={studentData} slug={slug} basePath={basePath}/>
            </RouteErrorBoundary>
          }/>
          <Route path="calendar" element={
            <RouteErrorBoundary name="Calendar">
              <CalendarV3 data={studentData}/>
            </RouteErrorBoundary>
          }/>
          <Route path="vocabulary" element={
            <RouteErrorBoundary name="Vocabulary">
              <VocabularyV3 data={studentData} slug={slug} basePath={basePath}/>
            </RouteErrorBoundary>
          }/>
          <Route path="lessons" element={
            <RouteErrorBoundary name="Lessons">
              <LessonsV3 data={studentData} slug={slug} basePath={basePath}/>
            </RouteErrorBoundary>
          }/>
          <Route path="knowledge" element={
            <RouteErrorBoundary name="KnowledgeBase">
              <KnowledgeBaseV3 data={studentData} slug={slug} basePath={basePath}/>
            </RouteErrorBoundary>
          }/>
          <Route path="practice" element={
            <RouteErrorBoundary name="Practice">
              <PracticeNew data={studentData} basePath={basePath}/>
            </RouteErrorBoundary>
          }/>
          <Route path="practice/design" element={
            <RouteErrorBoundary name="PracticeDesign">
              <PracticeDesign/>
            </RouteErrorBoundary>
          }/>
          <Route path="practice-legacy" element={
            <RouteErrorBoundary name="PracticeLegacy">
              <PracticeV3 data={studentData} basePath={basePath} legacyBanner/>
            </RouteErrorBoundary>
          }/>
          <Route path="quiz" element={<Navigate to={`${basePath}/${params.slug || ''}/practice`.replace('//', '/')} replace/>}/>
          <Route path="*" element={<Navigate to={dashboardPath} replace/>}/>
        </Routes>
      </Chrome>
    )
  }

  // Legacy shell — non-englishmetro hosts + __EM_LEGACY kill-switch.
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
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
            <Route path="calendar" element={
              <RouteErrorBoundary name="Calendar">
                <Calendar data={studentData} />
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
