import { createContext, useContext, useEffect, useState } from 'react'

const TEACHER_SESSION_KEY = 'em-teacher-session'

const TeacherAuthContext = createContext(null)

// Stored blob shape: { user, sessionToken }
function readStoredTeacherSession() {
  if (typeof window === 'undefined') return null

  try {
    const rawValue = window.sessionStorage.getItem(TEACHER_SESSION_KEY)
    return rawValue ? JSON.parse(rawValue) : null
  } catch {
    return null
  }
}

// Module-level token accessor — usable outside React (e.g. in views that
// call Convex directly). Returns the raw session token or null.
export function getTeacherSessionToken() {
  const stored = readStoredTeacherSession()
  return stored?.sessionToken || null
}

// Merge the stored token into args unless the caller already set one.
function withSessionToken(args) {
  const merged = { ...(args || {}) }
  if (merged.sessionToken === undefined) {
    const token = getTeacherSessionToken()
    if (token) merged.sessionToken = token
  }
  return merged
}

// nginx rate-limits /api/* with limit_req; an over-burst is rejected with 429/503
// generated LOCALLY, before the request is proxied to Convex — so the upstream
// never ran and a retry is safe even for mutations. Bound the retries so a real
// outage still fails fast.
async function postTeacherApi(endpoint, body) {
  const RETRY_STATUSES = new Set([429, 503])
  const MAX_TRIES = 3
  let response
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!RETRY_STATUSES.has(response.status) || attempt === MAX_TRIES) break
    await new Promise(resolve => setTimeout(resolve, 150 * attempt))
  }
  return response
}

export async function queryTeacherConvex(path, args) {
  const response = await postTeacherApi('/api/query', { path, args: withSessionToken(args), format: 'json' })

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`)
  }

  const payload = await response.json()
  if (payload?.status !== 'success') {
    throw new Error(`${path} returned ${payload?.status || 'unknown status'}`)
  }

  return payload.value
}

export async function mutateTeacherConvex(path, args) {
  const response = await postTeacherApi('/api/mutation', { path, args: withSessionToken(args), format: 'json' })

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`)
  }

  const payload = await response.json()
  if (payload?.status !== 'success') {
    throw new Error(`${path} returned ${payload?.status || 'unknown status'}: ${payload?.errorMessage || ''}`)
  }

  return payload.value
}

export function TeacherAuthProvider({ children }) {
  const [teacherSession, setTeacherSession] = useState(() => readStoredTeacherSession())
  const [loading, setLoading] = useState(true)
  const teacher = teacherSession?.user || null

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (teacherSession) {
      window.sessionStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify(teacherSession))
      return
    }

    window.sessionStorage.removeItem(TEACHER_SESSION_KEY)
  }, [teacherSession])

  // Restore a stored session on mount via teacherMe — clear it if the server
  // says it's no longer valid (expired / revoked), forcing a fresh sign-in.
  // Refresh the stored user with the server's copy so flags like
  // availabilityHandedOff stay current.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!teacherSession?.sessionToken) {
      setLoading(false)
      return
    }
    let cancelled = false
    queryTeacherConvex('teacherAuth:teacherMe', {})
      .then((user) => {
        if (cancelled) return
        if (!user) {
          setTeacherSession(null)
        } else {
          setTeacherSession(prev => (prev ? { ...prev, user: { ...prev.user, ...user } } : prev))
        }
      })
      .catch(() => {
        /* network error — keep the session for now */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function logout() {
    setTeacherSession(null)
  }

  const value = {
    teacher,
    loading,
    logout,
    isTeacherAuthenticated: Boolean(teacher),
  }

  return <TeacherAuthContext.Provider value={value}>{children}</TeacherAuthContext.Provider>
}

export function useTeacherAuth() {
  const context = useContext(TeacherAuthContext)

  if (!context) {
    throw new Error('useTeacherAuth must be used within TeacherAuthProvider')
  }

  return context
}
