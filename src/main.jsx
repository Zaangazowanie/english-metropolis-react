import { StrictMode, Component, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate, useParams } from 'react-router-dom'
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
import SuperadminCourses from './views/admin/superadmin/SuperadminCourses.jsx'
import SuperadminIngest from './views/admin/superadmin/SuperadminIngest.jsx'
import SuperadminReview from './views/admin/superadmin/SuperadminReview.jsx'
import SuperadminJobs from './views/admin/superadmin/SuperadminJobs.jsx'
import SuperadminStudents from './views/admin/superadmin/SuperadminStudents.jsx'
import SuperadminAudit from './views/admin/superadmin/SuperadminAudit.jsx'
import SuperadminGroups from './views/admin/superadmin/SuperadminGroups.jsx'
import SuperadminAvailability from './views/admin/superadmin/SuperadminAvailability.jsx'
import SuperadminGroupDetail from './views/admin/superadmin/SuperadminGroupDetail.jsx'
import SuperadminLibrary from './views/admin/superadmin/SuperadminLibrary.jsx'
import SuperadminLibraryDetail from './views/admin/superadmin/SuperadminLibraryDetail.jsx'
import SuperadminAssignments from './views/admin/superadmin/SuperadminAssignments.jsx'
import SuperadminPipelines from './views/admin/superadmin/SuperadminPipelines.jsx'
import ConsoleInbox from './views/admin/superadmin/ConsoleInbox.jsx'
import ConsoleSchools from './views/admin/superadmin/ConsoleSchools.jsx'
import ConsoleTeachers from './views/admin/superadmin/ConsoleTeachers.jsx'
import ConsoleSchoolStudents from './views/admin/superadmin/ConsoleSchoolStudents.jsx'
import ConsoleStudentPreview from './views/admin/superadmin/ConsoleStudentPreview.jsx'
import ConsoleTemplates from './views/admin/superadmin/ConsoleTemplates.jsx'
import ConsoleSequences from './views/admin/superadmin/ConsoleSequences.jsx'
import ConsoleRevenue from './views/admin/superadmin/ConsoleRevenue.jsx'
import ConsoleInvoices from './views/admin/superadmin/ConsoleInvoices.jsx'
import ConsolePayroll from './views/admin/superadmin/ConsolePayroll.jsx'
import ConsoleContacts from './views/admin/superadmin/ConsoleContacts.jsx'
import ConsoleCompanies from './views/admin/superadmin/ConsoleCompanies.jsx'
import ConsolePipeline from './views/admin/superadmin/ConsolePipeline.jsx'
import ConsolePages from './views/admin/superadmin/ConsolePages.jsx'
import ConsoleDeploys from './views/admin/superadmin/ConsoleDeploys.jsx'
import ConsoleTeam from './views/admin/superadmin/ConsoleTeam.jsx'
import ConsoleRecruiting from './views/admin/superadmin/ConsoleRecruiting.jsx'
import ConsoleIntegrations from './views/admin/superadmin/ConsoleIntegrations.jsx'
import ConsoleCampaigns from './views/admin/superadmin/growth/ConsoleCampaigns.jsx'
import ConsoleAdverts from './views/admin/superadmin/growth/ConsoleAdverts.jsx'
import ConsoleSeo from './views/admin/superadmin/growth/ConsoleSeo.jsx'
import { ConsoleEmpty } from './views/admin/superadmin/ConsoleStates.jsx'
import StudentHeatmap from './views/admin/teacher/StudentHeatmap.jsx'
import AdminTeachers from './views/admin/Teachers.jsx'
import TeacherLogin from './views/teacher/TeacherLogin.jsx'
import TeacherVerify from './views/teacher/TeacherVerify.jsx'
import TeacherPortal from './views/teacher/TeacherPortal.jsx'
import TeacherSchedule from './views/teacher/TeacherSchedule.jsx'
import TeacherStudents from './views/teacher/TeacherStudents.jsx'
import TeacherStudentDetail from './views/teacher/TeacherStudentDetail.jsx'
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
import Checkout from './views/public/Checkout.jsx'
import PaymentReturn from './views/public/PaymentReturn.jsx'
import WithdrawalPage from './views/public/WithdrawalPage.jsx'
import Signup from './views/v3/Signup.jsx'
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

// <Navigate> cannot interpolate route params, so legacy detail URLs
// (/superadmin/groups/:groupId etc.) need this one-liner to carry them across.
// useParams() hands back DECODED segments, so re-encode on the way out or a
// lesson id containing / # ? or a space would rewrite the path it lands on.
function RedirectWithParams({ to }) {
  const params = useParams()
  return (
    <Navigate
      to={to.replace(/:(\w+)/g, (_, key) => encodeURIComponent(params[key] ?? ''))}
      replace
    />
  )
}

// Any /admin/superadmin/* URL that matches no route. Without this the layout
// renders its chrome around an empty Outlet, which reads as "this screen has
// no data" rather than "this address does not exist".
function ConsoleNotFound() {
  const location = useLocation()
  return (
    <ConsoleEmpty
      icon="wrong_location"
      title="No such console screen"
      hint={
        <p>
          <code>{location.pathname}</code> matches no console route. Sections moved on
          2026-07-24 (docs/console/REVAMP-SPEC.md §3); the sidebar has the current list.
        </p>
      }
      action={<Link to="/admin/superadmin" className="sa-btn sa-btn-primary">Back to Overview</Link>}
    />
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
        <Route path="/withdraw" element={<WithdrawalPage />} />

        {/* englishmetro.com landing - arcade home first.
            Keep the 3D world available explicitly, but do not make it the homepage. */}
        <Route path="/login" element={<LoginComponent />} />
        <Route path="/logout" element={<Logout />} />
        {IS_ENGLISHMETRO && <Route path="/" element={<GameHome />} />}
        {IS_ENGLISHMETRO && <Route path="/arcade" element={<GameHome />} />}
        {IS_ENGLISHMETRO && <Route path="/city" element={<EnglishMetroWorld fullscreen />} />}
        {IS_ENGLISHMETRO && <Route path="/signup" element={<Signup />} />}
        {IS_ENGLISHMETRO && <Route path="/lessons" element={<LessonPricingSignup />} />}
        {IS_ENGLISHMETRO && <Route path="/pricing" element={<LessonPricingSignup />} />}
        {IS_ENGLISHMETRO && <Route path="/checkout" element={<Checkout />} />}
        {IS_ENGLISHMETRO && <Route path="/payment/return" element={<PaymentReturn />} />}
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

          {/* --- ACADEMIC --- */}
          <Route path="academic/students" element={<SuperadminCourses />} />
          <Route path="academic/roster" element={<SuperadminStudents />} />
          <Route path="academic/roster/:slug/heatmap" element={<StudentHeatmap />} />
          <Route path="academic/groups" element={<SuperadminGroups />} />
          <Route path="academic/groups/:groupId" element={<SuperadminGroupDetail />} />
          <Route path="academic/schedule" element={<SuperadminAvailability />} />
          <Route path="academic/assignments" element={<SuperadminAssignments />} />

          {/* --- CURRICULUM --- */}
          <Route path="curriculum/library" element={<SuperadminLibrary />} />
          <Route path="curriculum/library/:lessonId" element={<SuperadminLibraryDetail />} />
          <Route path="curriculum/ingest" element={<SuperadminIngest />} />
          <Route path="curriculum/ingest/:jobId" element={<SuperadminReview />} />
          <Route path="curriculum/queue" element={<SuperadminJobs />} />
          <Route path="curriculum/queue/:jobId" element={<SuperadminReview />} />

          {/* --- SCHOOL --- */}
          <Route path="school" element={<Navigate to="/admin/superadmin/school/schools" replace />} />
          <Route path="school/schools" element={<ConsoleSchools />} />
          <Route path="school/teachers" element={<ConsoleTeachers />} />
          <Route path="school/students" element={<ConsoleSchoolStudents />} />
          <Route path="school/preview" element={<ConsoleStudentPreview />} />

          {/* --- COMMS --- */}
          <Route path="comms/inbox" element={<ConsoleInbox />} />
          <Route path="comms/templates" element={<ConsoleTemplates />} />
          <Route path="comms/sequences" element={<ConsoleSequences />} />

          {/* --- CRM --- */}
          <Route path="crm/contacts" element={<ConsoleContacts />} />
          <Route path="crm/companies" element={<ConsoleCompanies />} />
          <Route path="crm/pipeline" element={<ConsolePipeline />} />

          {/* --- GROWTH --- */}
          <Route path="growth/campaigns" element={<ConsoleCampaigns />} />
          <Route path="growth/adverts" element={<ConsoleAdverts />} />
          <Route path="growth/seo" element={<ConsoleSeo />} />

          {/* --- WEBSITE --- */}
          <Route path="website/pages" element={<ConsolePages />} />
          <Route path="website/deploys" element={<ConsoleDeploys />} />

          {/* --- FINANCE --- */}
          <Route path="finance/revenue" element={<ConsoleRevenue />} />
          <Route path="finance/invoices" element={<ConsoleInvoices />} />
          <Route path="finance/payroll" element={<ConsolePayroll />} />

          {/* --- PEOPLE --- */}
          <Route path="people/team" element={<ConsoleTeam />} />
          <Route path="people/recruiting" element={<ConsoleRecruiting />} />

          {/* --- SYSTEM --- */}
          <Route path="system/pipelines" element={<SuperadminPipelines />} />
          <Route path="system/audit" element={<SuperadminAudit />} />
          <Route path="system/integrations" element={<ConsoleIntegrations />} />

          {/* --- Legacy paths: bookmarks and in-app links keep working --- */}
          <Route path="courses" element={<Navigate to="/admin/superadmin/academic/students" replace />} />
          <Route path="students" element={<Navigate to="/admin/superadmin/academic/roster" replace />} />
          <Route path="students/:slug/heatmap" element={<RedirectWithParams to="/admin/superadmin/academic/roster/:slug/heatmap" />} />
          <Route path="groups" element={<Navigate to="/admin/superadmin/academic/groups" replace />} />
          <Route path="groups/:groupId" element={<RedirectWithParams to="/admin/superadmin/academic/groups/:groupId" />} />
          <Route path="availability" element={<Navigate to="/admin/superadmin/academic/schedule" replace />} />
          <Route path="assignments" element={<Navigate to="/admin/superadmin/academic/assignments" replace />} />
          <Route path="library" element={<Navigate to="/admin/superadmin/curriculum/library" replace />} />
          <Route path="library/:lessonId" element={<RedirectWithParams to="/admin/superadmin/curriculum/library/:lessonId" />} />
          <Route path="ingest" element={<Navigate to="/admin/superadmin/curriculum/ingest" replace />} />
          <Route path="ingest/:jobId" element={<RedirectWithParams to="/admin/superadmin/curriculum/ingest/:jobId" />} />
          <Route path="jobs" element={<Navigate to="/admin/superadmin/curriculum/queue" replace />} />
          <Route path="pipelines" element={<Navigate to="/admin/superadmin/system/pipelines" replace />} />
          <Route path="audit" element={<Navigate to="/admin/superadmin/system/audit" replace />} />
          {/* Salary computed pay from static JSON with hardcoded rates; Payroll replaces it. */}
          <Route path="salary" element={<Navigate to="/admin/superadmin/finance/payroll" replace />} />

          {/* Nothing above matched — a real 404, not empty chrome. */}
          <Route path="*" element={<ConsoleNotFound />} />
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
          <Route path="students/:slug" element={<TeacherStudentDetail />} />
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
                {/* Day-first since 2026-07-23 (Mike: lighter, Preply-like);
                    the sun/moon toggle still stores an explicit choice. */}
                <V3ThemeProvider defaultMode="day">
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
