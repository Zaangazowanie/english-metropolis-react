// Student authentication context — mirrors AdminAuthContext shape.
// Students log in with email + password via the studentAuth:studentLogin mutation.
// Session is persisted in localStorage (not sessionStorage) so it survives
// tab closes — students expect persistent "stay logged in" behaviour.
//
// FALLBACK COMPATIBILITY: if localStorage contains 'studentSlug' (set by the
// old link-based flow), we honour that as an unauthenticated slug-only session
// so existing bookmarks keep working. Real auth sessions take priority.

import { createContext, useContext, useEffect, useState } from 'react'
import { fetchWithTimeout } from '../practice/lib/practice-cache'

const STUDENT_SESSION_KEY = 'em-student-session'   // real auth session
const LEGACY_SLUG_KEY = 'studentSlug'               // old link-based fallback

const StudentAuthContext = createContext(null)

function readStoredStudentUser() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STUDENT_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Module-level token accessor — usable outside React (e.g. booking views
// that call Convex directly). Returns the raw student session token or null.
export function getStudentSessionToken() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STUDENT_SESSION_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed?.sessionToken || null
  } catch {
    return null
  }
}

// Call the Convex HTTP API directly (same pattern as AdminAuthContext)
async function mutateConvex(path, args) {
  // 30s AbortController-backed timeout — see practice-cache.ts.
  const response = await fetchWithTimeout('/api/mutation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`)
  }

  const payload = await response.json()
  if (payload?.status !== 'success') {
    throw new Error(
      `${path} returned ${payload?.status || 'unknown status'}: ${payload?.errorMessage || ''}`,
    )
  }

  return payload.value
}

export function StudentAuthProvider({ children }) {
  const [studentUser, setStudentUser] = useState(() => readStoredStudentUser())

  // Persist / clear session on change
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (studentUser) {
      window.localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(studentUser))
    } else {
      window.localStorage.removeItem(STUDENT_SESSION_KEY)
    }
  }, [studentUser])

  // ── studentLogin ──────────────────────────────────────────
  async function studentLogin(email, password) {
    const payload = await mutateConvex('studentAuth:studentLogin', {
      email: email.trim().toLowerCase(),
      password,
    })

    if (!payload?.success) {
      return payload || { success: false, error: 'Invalid credentials' }
    }

    // Store the session token alongside the student object so
    // getStudentSessionToken() can read it back for booking calls.
    setStudentUser({ ...payload.student, sessionToken: payload.sessionToken })
    return payload
  }

  // ── studentLogout ─────────────────────────────────────────
  function studentLogout() {
    setStudentUser(null)
    // Also clear the legacy slug key so the fallback doesn't re-admit them
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LEGACY_SLUG_KEY)
    }
  }

  // ── resolvedSlug ──────────────────────────────────────────
  // Either the slug from a real auth session, or the legacy stored slug.
  // Returns null if neither is present.
  const legacySlug =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(LEGACY_SLUG_KEY) || null
      : null

  const resolvedSlug = studentUser?.slug || legacySlug || null

  const value = {
    studentUser,
    studentLogin,
    studentLogout,
    isStudentAuthenticated: Boolean(studentUser),
    // True for both real sessions and legacy slug-based fallback
    hasStudentAccess: Boolean(studentUser) || Boolean(legacySlug),
    resolvedSlug,
  }

  return (
    <StudentAuthContext.Provider value={value}>
      {children}
    </StudentAuthContext.Provider>
  )
}

export function useStudentAuth() {
  const context = useContext(StudentAuthContext)
  if (!context) {
    throw new Error('useStudentAuth must be used within StudentAuthProvider')
  }
  return context
}
