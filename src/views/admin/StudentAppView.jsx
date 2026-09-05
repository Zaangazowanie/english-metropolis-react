import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import App from '../../App.jsx'
import { getAdminSessionToken, mutateAdminConvex, queryAdminConvex } from '../../contexts/AdminAuthContext.jsx'
import { StudentViewAuthProvider } from '../../contexts/StudentAuthContext.jsx'
import { STUDENT_VIEW_KEY } from '../../lib/student-session.js'

const buttonStyle = { border: '1px solid #fff8', borderRadius: 8, padding: '8px 12px', color: '#fff', background: 'transparent', cursor: 'pointer', font: 'inherit' }

function readStoredView() {
  try {
    return JSON.parse(window.sessionStorage.getItem(STUDENT_VIEW_KEY) || 'null')
  } catch { return null }
}

export default function StudentAppView() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [view, setView] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const returnUrl = `/admin/superadmin/school/preview?student=${encodeURIComponent(slug || '')}`

  const revoke = useCallback(async token => {
    if (!token || !getAdminSessionToken()) return
    await mutateAdminConvex('adminStudentView:end', { studentSessionToken: token }).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    let issued = null
    setView(null)
    setError('')
    const previous = readStoredView()
    window.sessionStorage.removeItem(STUDENT_VIEW_KEY)
    async function open() {
      await revoke(previous?.sessionToken)
      if (!getAdminSessionToken()) throw new Error('Sign in as a superadmin to open a student account.')
      // Verify the server's role, not a role copied into browser storage.
      const admin = await queryAdminConvex('admin:getSession', {})
      if (admin?.role !== 'super_admin') throw new Error('An active superadmin login is required.')
      const student = await queryAdminConvex('students:getStudentBySlug', { slug })
      if (!student?._id) throw new Error('Student account not found.')
      if (cancelled) return
      issued = await mutateAdminConvex('adminStudentView:start', { studentId: student._id })
      if (cancelled) { await revoke(issued?.sessionToken); return }
      window.sessionStorage.setItem(STUDENT_VIEW_KEY, JSON.stringify(issued))
      setView(issued)
    }
    open().catch(e => { if (!cancelled) setError(e.message || 'Could not open this student account.') })
    return () => {
      cancelled = true
      if (issued?.sessionToken) {
        const stored = readStoredView()
        if (stored?.sessionToken === issued.sessionToken) window.sessionStorage.removeItem(STUDENT_VIEW_KEY)
        void revoke(issued.sessionToken)
      }
    }
  }, [slug, attempt, revoke])

  useEffect(() => {
    if (!view?.expiresAt) return
    const timer = setTimeout(() => {
      window.sessionStorage.removeItem(STUDENT_VIEW_KEY)
      setView(null)
      setError('Student view has expired. Open it again to continue.')
    }, Math.max(0, view.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [view])

  const exit = async () => {
    window.sessionStorage.removeItem(STUDENT_VIEW_KEY)
    await revoke(view?.sessionToken)
    navigate(returnUrl)
  }

  if (!view || view.student.slug !== slug) {
    return <main style={{ maxWidth: 640, margin: '80px auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Open student app</h1>
      <p role={error ? 'alert' : 'status'}>{error || 'Opening the student’s live account…'}</p>
      {error && <button onClick={() => setAttempt(n => n + 1)}>Try again</button>}
      <p><Link to="/admin">Superadmin sign in</Link> · <Link to={returnUrl}>Back to student preview</Link></p>
    </main>
  }

  return <StudentViewAuthProvider studentUser={{ ...view.student, sessionToken: view.sessionToken }} onExit={exit}>
    <div role="region" aria-label="Superadmin student view" style={{ background: '#251650', color: '#fff', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, font: '14px Inter, sans-serif' }}>
      <div><strong>Viewing {view.student.name}’s account</strong><br />
        <span style={{ fontSize: 12 }}>Live student app · 15-minute session · Changes here affect this student</span>
      </div>
      <button type="button" style={buttonStyle} onClick={exit}>End student view</button>
    </div>
    <App basePath="/admin/student-view" />
  </StudentViewAuthProvider>
}
