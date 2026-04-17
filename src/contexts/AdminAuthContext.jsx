import { createContext, useContext, useEffect, useState } from 'react'

const ADMIN_SESSION_KEY = 'conversa-admin-session'

const AdminAuthContext = createContext(null)

function readStoredAdminUser() {
  if (typeof window === 'undefined') return null

  try {
    const rawValue = window.sessionStorage.getItem(ADMIN_SESSION_KEY)
    return rawValue ? JSON.parse(rawValue) : null
  } catch {
    return null
  }
}

export async function queryAdminConvex(path, args) {
  const response = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })

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
  const response = await fetch('/api/mutation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })

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
  const [adminUser, setAdminUser] = useState(() => readStoredAdminUser())

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (adminUser) {
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(adminUser))
      return
    }

    window.sessionStorage.removeItem(ADMIN_SESSION_KEY)
  }, [adminUser])

  async function adminLogin(email, password) {
    const payload = await queryAdminConvex('admin:login', { email, password })

    if (!payload?.success) {
      return payload || { success: false, error: 'Invalid credentials' }
    }

    setAdminUser(payload.user)
    return payload
  }

  function adminLogout() {
    setAdminUser(null)
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


