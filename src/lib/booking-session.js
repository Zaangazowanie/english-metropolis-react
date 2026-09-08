export const STUDENT_SESSION_REQUIRED = 'STUDENT_SESSION_REQUIRED'

// A stored profile or legacy bookmark is not proof of a live booking session.
// Resolve with the server so expired/revoked tokens get the same recovery path.
export async function requireBookingSession(call, sessionToken, studentId) {
  if (!sessionToken) throw new Error(STUDENT_SESSION_REQUIRED)
  const student = await call('query', 'studentAuth:resolveStudentSession', { sessionToken })
  if (!student || student._id !== studentId) throw new Error(STUDENT_SESSION_REQUIRED)
  return student
}

export function bookingLoginPath(location) {
  const next = `${location.pathname}${location.search || ''}${location.hash || ''}`
  return `/login?next=${encodeURIComponent(next)}`
}
