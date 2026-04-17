import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'

import App from './App.jsx'
import AdminLayout from './components/admin/AdminLayout.jsx'
import AdminDashboard from './views/admin/Dashboard.jsx'
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
import SuperadminGroupDetail from './views/admin/superadmin/SuperadminGroupDetail.jsx'
import { AdminAuthProvider } from './contexts/AdminAuthContext.jsx'
import { StudentAuthProvider } from './contexts/StudentAuthContext.jsx'
import ConsentBanner from './components/ConsentBanner.jsx'
import PrivacyPolicy from './views/legal/PrivacyPolicy.jsx'
import CookiePolicy from './views/legal/CookiePolicy.jsx'
import Terms from './views/legal/Terms.jsx'
import Login from './views/Login.jsx'
import Settings from './views/Settings.jsx'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './contexts/ThemeContext.jsx'

// Domain-based routing: englishmetro.com gets the new marketing/login landing
// at the root; existing lexicon deployment keeps its default student-first flow.
const IS_ENGLISHMETRO = typeof window !== 'undefined' && /englishmetro\.com/i.test(window.location.hostname)

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

function RootRouter() {
  return (
    <>
      <Routes>
        {/* Legal pages — public, no auth, top-level */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/cookies" element={<CookiePolicy />} />
        <Route path="/terms" element={<Terms />} />

        {/* englishmetro.com landing */}
        <Route path="/login" element={<Login />} />
        {IS_ENGLISHMETRO && <Route path="/" element={<Login />} />}

        <Route path="/admin/login" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/students" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/superadmin" element={
          <RootErrorBoundary>
            <SuperadminLayout />
          </RootErrorBoundary>
        }>
          <Route index element={<SuperadminDashboard />} />
          <Route path="ingest" element={<SuperadminIngest />} />
          <Route path="ingest/:jobId" element={<SuperadminReview />} />
          <Route path="jobs" element={<SuperadminJobs />} />
          <Route path="students" element={<SuperadminStudents />} />
          <Route path="groups" element={<SuperadminGroups />} />
          <Route path="groups/:groupId" element={<SuperadminGroupDetail />} />
          <Route path="audit" element={<SuperadminAudit />} />
          <Route path="salary" element={<SuperadminSalary />} />
        </Route>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={
            <RootErrorBoundary>
              <AdminDashboard />
            </RootErrorBoundary>
          } />
          <Route path="student/:slug" element={
            <RootErrorBoundary>
              <StudentDetail />
            </RootErrorBoundary>
          } />
          <Route path="settings" element={
            <RootErrorBoundary>
              <AdminSettings />
            </RootErrorBoundary>
          } />
        </Route>
        <Route path="/settings" element={<Settings />} />
        <Route path="/app/:slug/settings" element={<Settings />} />
        <Route path="/app/:slug/*" element={<App basePath="/app" />} />
        <Route path="/app/*" element={<App basePath="/app" />} />
        <Route path="/*" element={<App />} />
      </Routes>
      {/* Consent banner rendered once at the root so it's visible everywhere */}
      <ConsentBanner />
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <AdminAuthProvider>
            <StudentAuthProvider>
              <BrowserRouter>
                <RootRouter />
              </BrowserRouter>
            </StudentAuthProvider>
          </AdminAuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </RootErrorBoundary>
  </StrictMode>,
)
