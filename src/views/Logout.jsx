import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useStudentAuth } from '../contexts/StudentAuthContext'
import { useAdminAuth } from '../contexts/AdminAuthContext'

/**
 * /logout — clears both student and admin sessions, then redirects to /login.
 *
 * Previously the <Link to="/logout"> in SettingsMenu had no matching route,
 * so it fell through to the /* wildcard that renders the student App with
 * the szymon-karpinski fallback slug — meaning logout effectively handed
 * you another student's dashboard. Now it explicitly clears state and
 * sends you to the login screen.
 */
export default function Logout() {
  const { studentLogout } = useStudentAuth()
  const { adminLogout } = useAdminAuth()

  useEffect(() => {
    try { studentLogout?.() } catch {}
    try { adminLogout?.() } catch {}
    // Belt-and-braces: purge any remaining auth-adjacent keys that earlier
    // builds may have set under different names.
    try {
      if (typeof window !== 'undefined') {
        const prefix = ['em_student_', 'em_admin_', 'em_auth_', 'student_']
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i)
          if (k && prefix.some(p => k.startsWith(p))) {
            window.localStorage.removeItem(k)
          }
        }
      }
    } catch {}
  }, [studentLogout, adminLogout])

  return <Navigate to="/login" replace />
}
