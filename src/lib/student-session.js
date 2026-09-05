export const STUDENT_VIEW_KEY = 'em-student-view'

export function isStudentView() {
  return typeof window !== 'undefined' && Boolean(window.location?.pathname?.startsWith('/admin/student-view/'))
}

// A support view belongs to this tab. Never replace the operator's normal
// student login in localStorage or fall back to it while viewing another person.
export function readStudentSession() {
  if (typeof window === 'undefined') return null
  try {
    if (isStudentView()) {
      const view = JSON.parse(window.sessionStorage.getItem(STUDENT_VIEW_KEY) || 'null')
      const slug = decodeURIComponent(window.location.pathname.split('/')[3] || '')
      if (!view?.sessionToken || !Number.isFinite(view.expiresAt) || view.expiresAt <= Date.now() || view.student?.slug !== slug) return null
      return { ...view.student, sessionToken: view.sessionToken }
    }
    return JSON.parse(window.localStorage.getItem('em-student-session') || 'null')
  } catch { return null }
}

export function getStudentSessionToken() {
  return readStudentSession()?.sessionToken || null
}
