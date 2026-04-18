// English Metropolis — design-pass App shell
// Wraps the student app in ThemeProvider + TopNav + ambient background,
// routes between the 6 new views. Matches the Claude Design handoff.

import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { ThemeProvider, useTheme } from './design-system/ThemeContext'
import { TopNav } from './design-system/TopNav'
import { EASE } from './design-system/tokens'
import RouteErrorBoundary from './components/RouteErrorBoundary.jsx'
import useStudentData from './hooks/useStudentData.js'
import { useStudentAuth } from './contexts/StudentAuthContext.jsx'

import Dashboard from './views/design-pass/Dashboard.jsx'
import Vocabulary from './views/design-pass/Vocabulary.jsx'
import Lessons from './views/design-pass/Lessons.jsx'
import Knowledge from './views/design-pass/Knowledge.jsx'
import Practice from './views/design-pass/Practice.jsx'
import Settings from './views/design-pass/Settings.jsx'

function AppInner({ basePath = '' }) {
  const params = useParams()
  const data = useStudentData()
  const { hasStudentAccess, isStudentAuthenticated, resolvedSlug, signOutStudent } = useStudentAuth()
  const { T } = useTheme()
  const slug = params.slug || ''

  // Domain-based auth guard (same as before). staging.englishmetro.com +
  // englishmetro.com both require a real session.
  const IS_ENGLISHMETRO = typeof window !== 'undefined' &&
    /englishmetro\.com/i.test(window.location.hostname)
  if (IS_ENGLISHMETRO && slug) {
    if (!hasStudentAccess) return <Navigate to="/login" replace/>
    if (isStudentAuthenticated && resolvedSlug && resolvedSlug !== slug) {
      return <Navigate to={`/app/${resolvedSlug}/dashboard`} replace/>
    }
  }

  const dashboardPath = slug
    ? `${basePath}/${slug}/dashboard`
    : (basePath ? `${basePath}/dashboard` : '/dashboard')
  const initials = (data?.profile?.initials)
    || (slug ? slug.split('-').map(s => s[0] || '').join('').slice(0, 2).toUpperCase() : 'EM')

  const handleSignOut = () => {
    try { signOutStudent?.() } catch {}
    try { localStorage.removeItem('studentSlug') } catch {}
    window.location.assign('/login')
  }

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh' }}>
      <TopNav studentSlug={slug || 'szymon-karpinski'}
        studentInitials={initials} onSignOut={handleSignOut}/>
      <div key={slug} style={{ animation: `emPageEnter 420ms ${EASE.editorial}` }}>
        <Routes>
          <Route index element={<Navigate to={dashboardPath} replace/>}/>
          <Route path="dashboard" element={
            <RouteErrorBoundary name="Dashboard"><Dashboard data={data}/></RouteErrorBoundary>
          }/>
          <Route path="vocabulary" element={
            <RouteErrorBoundary name="Vocabulary"><Vocabulary data={data}/></RouteErrorBoundary>
          }/>
          <Route path="lessons" element={
            <RouteErrorBoundary name="Lessons"><Lessons data={data}/></RouteErrorBoundary>
          }/>
          <Route path="knowledge" element={
            <RouteErrorBoundary name="Knowledge"><Knowledge data={data}/></RouteErrorBoundary>
          }/>
          <Route path="practice" element={
            <RouteErrorBoundary name="Practice"><Practice data={data}/></RouteErrorBoundary>
          }/>
          <Route path="quiz" element={<Navigate to={`${basePath}/${slug || ''}/practice`.replace('//', '/')} replace/>}/>
          <Route path="settings" element={
            <RouteErrorBoundary name="Settings"><Settings data={data}/></RouteErrorBoundary>
          }/>
          <Route path="*" element={<Navigate to={dashboardPath} replace/>}/>
        </Routes>
      </div>
    </div>
  )
}

export default function App({ basePath = '' }) {
  return (
    <ThemeProvider>
      <AppInner basePath={basePath}/>
    </ThemeProvider>
  )
}
