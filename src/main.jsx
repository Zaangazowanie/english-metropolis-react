import { StrictMode, Component, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './index.css'

import App from './App.jsx'
import AdminLayout from './components/admin/AdminLayout.jsx'
import AdminDashboard from './views/admin/Dashboard.jsx'
import AdminCalendar from './views/admin/Calendar.jsx'
import AdminStudents from './views/admin/Students.jsx'
import AdminCourses from './views/admin/Courses.jsx'
import AdminBilling from './views/admin/Billing.jsx'
import StudentDetail from './views/admin/StudentDetail.jsx'
import AdminSettings from './views/admin/Settings.jsx'
import SuperadminLayout from './views/admin/superadmin/SuperadminLayout.jsx'
import SuperadminDashboard from './views/admin/superadmin/SuperadminDashboard.jsx'
import SuperadminIngest from './views/admin/superadmin/SuperadminIngest.jsx'
import SuperadminReview from './views/admin/superadmin/SuperadminReview.jsx'
import SuperadminJobs from './views/admin/superadmin/SuperadminJobs.jsx'
import SuperadminStudents from './views/admin/superadmin/SuperadminStudents.jsx'
import SuperadminAudit from './views/admin/superadmin/SuperadminAudit.jsx'
import SuperadminSalary from './views/admin/superadmin/SuperadminSalary.jsx'
import SuperadminGroups from './views/admin/superadmin/SuperadminGroups.jsx'
import SuperadminAvailability from './views/admin/superadmin/SuperadminAvailability.jsx'
import SuperadminGroupDetail from './views/admin/superadmin/SuperadminGroupDetail.jsx'
import SuperadminLibrary from './views/admin/superadmin/SuperadminLibrary.jsx'
import SuperadminLibraryDetail from './views/admin/superadmin/SuperadminLibraryDetail.jsx'
import StudentHeatmap from './views/admin/teacher/StudentHeatmap.jsx'
import AdminTeachers from './views/admin/Teachers.jsx'
import TeacherLogin from './views/teacher/TeacherLogin.jsx'
import TeacherVerify from './views/teacher/TeacherVerify.jsx'
import TeacherPortal from './views/teacher/TeacherPortal.jsx'
import TeacherSchedule from './views/teacher/TeacherSchedule.jsx'
import TeacherStudents from './views/teacher/TeacherStudents.jsx'
import TeacherMaterials from './views/teacher/TeacherMaterials.jsx'
import TeacherUpload from './views/teacher/TeacherUpload.jsx'
import TeacherKeywords from './views/teacher/TeacherKeywords.jsx'
import TeacherAvailability from './views/teacher/TeacherAvailability.jsx'
import { TeacherAuthProvider, useTeacherAuth } from './contexts/TeacherAuthContext.jsx'
import { OrgThemeProvider } from './contexts/OrgThemeContext.jsx'
import { AdminAuthProvider } from './contexts/AdminAuthContext.jsx'
import { StudentAuthProvider } from './contexts/StudentAuthContext.jsx'
import ConsentBanner from './components/ConsentBanner.jsx'
import BajlaConnectModal from './components/BajlaConnectModal.jsx'
import PrivacyPolicy from './views/legal/PrivacyPolicy.jsx'
import CookiePolicy from './views/legal/CookiePolicy.jsx'
import Terms from './views/legal/Terms.jsx'
import Login from './views/Login.jsx'
import LoginV3 from './views/v3/Login.jsx'
import GameHome from './views/v3/GameHome.jsx'
import EnglishMetroWorld from './world/EnglishMetroWorld'
import LessonPricingSignup from './views/public/LessonPricingSignup.jsx'
import Logout from './views/Logout.jsx'
import Settings from './views/Settings.jsx'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { V3ThemeProvider } from './design/v3/ThemeProvider.jsx'

// v3 port kill-switch: set window.__EM_LEGACY = true in devtools to fall back to
// the old Midnight Library login. Default is v3.
const USE_V3 = typeof window === 'undefined' || !window.__EM_LEGACY
const LoginComponent = USE_V3 ? LoginV3 : Login

// Domain-based routing: englishmetro.com gets the new marketing/login landing
// at the root; existing lexicon deployment keeps its default student-first flow.
const IS_ENGLISHMETRO = typeof window !== 'undefined'
  && (/englishmetro\.com/i.test(window.location.hostname)
    || /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname))

class RootErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null, info: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('[ROOT ERROR BOUNDARY]', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', padding: '2rem' }}>
          <div style={{ maxWidth: '600px', width: '100%', background: '#fff', border: '2px solid #ef4444', borderRadius: '1rem', padding: '1.5rem' }}>
            <h2 style={{ color: '#dc2626', margin: '0 0 0.5rem' }}>React Error</h2>
            <pre style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', background: '#f8f8f8', padding: '1rem', borderRadius: '0.5rem', maxHeight: '60vh', overflow: 'auto' }}>{this.state.error.toString()}\n\n{this.state.info?.componentStack}</pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// englishmetro.com root: the explorable 3D PLANET city IS the landing (Mike 2026-06-22).
// PlanetWorld — the dense GlbCity planet from #138 — mounted fullscreen as the home
// experience. "Exit city" fires onSessionComplete -> drop the visitor to the arcade list.
const PlanetWorld = lazy(() => import('./world/PlanetWorld'))
const WorldNext = lazy(() => import('./engine/WorldNext'))
function WorldLanding() {
  const navigate = useNavigate()
  return (
    <RootErrorBoundary>
      <Suspense fallback={
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#030208', color: '#9a8fb8',
          fontFamily: 'ui-monospace, monospace', fontSize: 13, letterSpacing: '0.2em' }}>
          ENTERING THE CITY…
        </div>
      }>
        <PlanetWorld fullscreen onSessionComplete={() => navigate('/arcade')} />
      </Suspense>
    </RootErrorBoundary>
  )
}

// Gate the teacher portal: redirect to the magic-link login if no teacher session.
function TeacherGuard({ children }) {
  const { teacher, loading } = useTeacherAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>
  if (!teacher) return <Navigate to="/teacher/login" replace />
  return children
}

function RootRouter() {
  return (
    <>
      <Routes>
        {/* Legal pages — public, no auth, top-level */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/cookies" element={<CookiePolicy />} />
        <Route path="/terms" element={<Terms />} />

        {/* englishmetro.com landing - arcade home first.
            Keep the 3D world available explicitly, but do not make it the homepage. */}
        <Route path="/login" element={<LoginComponent />} />
        <Route path="/logout" element={<Logout />} />
        {IS_ENGLISHMETRO && <Route path="/" element={<GameHome />} />}
        {IS_ENGLISHMETRO && <Route path="/arcade" element={<GameHome />} />}
        {IS_ENGLISHMETRO && <Route path="/city" element={<EnglishMetroWorld fullscreen />} />}
        {IS_ENGLISHMETRO && <Route path="/lessons" element={<LessonPricingSignup />} />}
        {IS_ENGLISHMETRO && <Route path="/pricing" element={<LessonPricingSignup />} />}
        {IS_ENGLISHMETRO && <Route path="/signup" element={<LessonPricingSignup />} />}
        <Route path="/world-next" element={
          <RootErrorBoundary>
            <WorldNext />
          </RootErrorBoundary>
        } />
        <Route path="/admin/login" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/superadmin" element={
          <RootErrorBoundary>
            <SuperadminLayout />
          </RootErrorBoundary>
        }>
          <Route index element={<SuperadminDashboard />} />
          <Route path="ingest" element={<SuperadminIngest />} />
          <Route path="ingest/:jobId" element={<SuperadminReview />} />
          <Route path="jobs" element={<SuperadminJobs />} />
          <Route path="library" element={<SuperadminLibrary />} />
          <Route path="library/:lessonId" element={<SuperadminLibraryDetail />} />
          <Route path="students" element={<SuperadminStudents />} />
          <Route path="students/:slug/heatmap" element={<StudentHeatmap />} />
          <Route path="groups" element={<SuperadminGroups />} />
          <Route path="groups/:groupId" element={<SuperadminGroupDetail />} />
          <Route path="availability" element={<SuperadminAvailability />} />
          <Route path="audit" element={<SuperadminAudit />} />
          <Route path="salary" element={<SuperadminSalary />} />
        </Route>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={
            <RootErrorBoundary>
              <AdminDashboard />
            </RootErrorBoundary>
          } />
          <Route path="calendar" element={
            <RootErrorBoundary>
              <AdminCalendar />
            </RootErrorBoundary>
          } />
          <Route path="students" element={
            <RootErrorBoundary>
              <AdminStudents />
            </RootErrorBoundary>
          } />
          <Route path="courses" element={
            <RootErrorBoundary>
              <AdminCourses />
            </RootErrorBoundary>
          } />
          <Route path="billing" element={
            <RootErrorBoundary>
              <AdminBilling />
            </RootErrorBoundary>
          } />
          <Route path="student/:slug" element={
            <RootErrorBoundary>
              <StudentDetail />
            </RootErrorBoundary>
          } />
          <Route path="teachers" element={
            <RootErrorBoundary>
              <AdminTeachers />
            </RootErrorBoundary>
          } />
          <Route path="settings" element={
            <RootErrorBoundary>
              <AdminSettings />
            </RootErrorBoundary>
          } />
        </Route>

        {/* Teacher portal (magic-link auth) — shell with nested section tabs
            (P2 console buildout, docs/console/BRIEF.md) */}
        <Route path="/teacher/login" element={<TeacherLogin />} />
        <Route path="/teacher/verify" element={<TeacherVerify />} />
        <Route path="/teacher" element={
          <RootErrorBoundary>
            <TeacherGuard><TeacherPortal /></TeacherGuard>
          </RootErrorBoundary>
        }>
          <Route index element={<TeacherSchedule />} />
          <Route path="students" element={<TeacherStudents />} />
          <Route path="materials" element={<TeacherMaterials />} />
          <Route path="upload" element={<TeacherUpload />} />
          <Route path="keywords" element={<TeacherKeywords />} />
          <Route path="availability" element={<TeacherAvailability />} />
        </Route>

        <Route path="/settings" element={<Settings />} />
        <Route path="/app/:slug/settings" element={<Settings />} />
        <Route path="/app/:slug/*" element={<App basePath="/app" />} />
        <Route path="/app/*" element={<App basePath="/app" />} />
        <Route path="/*" element={<App />} />
      </Routes>
      {/* Consent banner rendered once at the root so it's visible everywhere */}
      <ConsentBanner />
      {/* Bajla WhatsApp connect popup — reaches all portals from here */}
      <BajlaConnectModal />
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <OrgThemeProvider>
          <AdminAuthProvider>
            <StudentAuthProvider>
              <TeacherAuthProvider>
                <V3ThemeProvider>
                  <BrowserRouter>
                    <RootRouter />
                  </BrowserRouter>
                </V3ThemeProvider>
              </TeacherAuthProvider>
            </StudentAuthProvider>
          </AdminAuthProvider>
          </OrgThemeProvider>
        </ThemeProvider>
      </I18nProvider>
    </RootErrorBoundary>
  </StrictMode>,
)
