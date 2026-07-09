import { createContext, useContext, useEffect, useState } from 'react'

const ADMIN_SESSION_KEY = 'em-admin-session'

const AdminAuthContext = createContext(null)

// Stored blob shape: { user, sessionToken }
function readStoredAdminSession() {
  if (typeof window === 'undefined') return null

  try {
    const rawValue = window.sessionStorage.getItem(ADMIN_SESSION_KEY)
    return rawValue ? JSON.parse(rawValue) : null
  } catch {
    return null
  }
}

// Module-level token accessor — usable outside React (e.g. in views that
// call Convex directly). Returns the raw session token or null.
export function getAdminSessionToken() {
  const stored = readStoredAdminSession()
  return stored?.sessionToken || null
}

// Merge the stored session token into args unless the caller already set one.
function withSessionToken(args) {
  const merged = { ...(args || {}) }
  if (merged.sessionToken === undefined) {
    const token = getAdminSessionToken()
    if (token) merged.sessionToken = token
  }
  return merged
}

// nginx rate-limits /api/* with limit_req; an over-burst is rejected with 429/503
// generated LOCALLY, before the request is proxied to Convex — so the upstream
// never ran and a retry is safe even for mutations. Bound the retries so a real
// outage still fails fast. (Pages fan out many parallel queries; a transient
// rate-limit blip should not surface.)
async function postAdminApi(endpoint, body) {
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

export async function queryAdminConvex(path, args) {
  const response = await postAdminApi('/api/query', { path, args: withSessionToken(args) })

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`)
  }

  const payload = await response.json()
  if (payload?.status !== 'success') {
    throw new Error(`${path} returned ${payload?.status || 'unknown status'}`)
  }

  return payload.value
}

export async function mutateAdminConvex(path, args) {
  const response = await postAdminApi('/api/mutation', { path, args: withSessionToken(args) })

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`)
  }

  const payload = await response.json()
  if (payload?.status !== 'success') {
    throw new Error(`${path} returned ${payload?.status || 'unknown status'}: ${payload?.errorMessage || ''}`)
  }

  return payload.value
}

export function AdminAuthProvider({ children }) {
  const [adminSession, setAdminSession] = useState(() => readStoredAdminSession())
  const adminUser = adminSession?.user || null

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (adminSession) {
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(adminSession))
      return
    }

    window.sessionStorage.removeItem(ADMIN_SESSION_KEY)
  }, [adminSession])

  // Validate a restored session on mount — clear it if the server says it's
  // no longer valid (expired / revoked), forcing a fresh login.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!adminSession?.sessionToken) return
    let cancelled = false
    queryAdminConvex('admin:getSession', {})
      .then((user) => {
        if (cancelled) return
        if (!user) setAdminSession(null)
      })
      .catch(() => {
        /* network error — keep the session for now */
      })
    return () => {
      cancelled = true
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function adminLogin(email, password) {
    const payload = await mutateAdminConvex('admin:login', { email, password })

    if (!payload?.success) {
      return payload || { success: false, error: 'Invalid credentials' }
    }

    setAdminSession({ user: payload.user, sessionToken: payload.sessionToken })
    return payload
  }

  async function adminLogout() {
    try {
      await mutateAdminConvex('admin:logout', {})
    } catch {
      /* best-effort — clear local state regardless */
    }
    setAdminSession(null)
  }

  const value = {
    adminUser,
    adminLogin,
    adminLogout,
    isAdminAuthenticated: Boolean(adminUser),
    isSuperadmin: Boolean(adminUser) && adminUser.role === 'super_admin',
  }

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext)

  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider')
  }

  return context
}
