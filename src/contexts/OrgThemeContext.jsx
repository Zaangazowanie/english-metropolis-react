// Per-organization theming. On a school subdomain (conversa.englishmetro.com)
// we resolve the org and paint its brand colours onto CSS custom properties:
//   --org-primary  --org-accent  --org-dark  --org-logo-url
// The admin shell reads these (with sky/blue fallbacks) so each school gets its
// own colours. On the apex / www host no org resolves and the defaults apply —
// the existing site is visually unchanged.

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { extractSubdomainOrg } from '../utils/subdomain.js'

const OrgThemeContext = createContext({ org: null, theme: null, loading: false })

export function useOrgTheme() {
  return useContext(OrgThemeContext)
}

// Frontend brand presets per school slug. The deployed Convex backend has no
// org-settings mutation, so branding ships here: applied synchronously on load
// (no flash of default blue) and merged under any settings the org record does
// carry. Apex/www never resolves a slug, so presets can't leak there.
const BRAND_PRESETS = {
  conversa: {
    brandingPrimary: '#1863dc',
    brandingSecondary: '#c26af9',
    brandingDark: '#0d2d62',
    logoUrl: '/brand/conversa/logo.png',
    orgDisplayName: 'English School Conversa',
  },
}

// Only set the vars when a school theme actually resolves. On the apex/www host
// the vars stay unset, so the admin shell's CSS-var fallbacks (the exact current
// sky/blue hexes) apply and the existing site is byte-for-byte unchanged.
function applyTheme(theme) {
  if (!theme) return
  const root = document.documentElement
  if (theme.brandingPrimary) root.style.setProperty('--org-primary', theme.brandingPrimary)
  const accent = theme.brandingSecondary || theme.brandingPrimary
  if (accent) root.style.setProperty('--org-accent', accent)
  const dark = theme.brandingDark || theme.brandingPrimary
  if (dark) root.style.setProperty('--org-dark', dark)
  if (theme.logoUrl) root.style.setProperty('--org-logo-url', `url("${theme.logoUrl}")`)
}

export function OrgThemeProvider({ children }) {
  const slug = useMemo(() => (typeof window !== 'undefined' ? extractSubdomainOrg(window.location.hostname) : null), [])
  const preset = slug ? BRAND_PRESETS[slug] || null : null
  const [state, setState] = useState(() => {
    // Apply the preset synchronously so the first paint is already branded,
    // and tag <html> with org classes for scoped CSS theme layers.
    if (slug) {
      document.documentElement.classList.add('org-sub', `org-${slug}`)
      if (preset) applyTheme(preset)
    }
    return { org: null, theme: preset, loading: !!slug }
  })

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      try {
        const resp = await fetch('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: 'students:getOrganizationBySlug', args: { slug }, format: 'json' }),
        })
        const payload = await resp.json()
        const org = payload?.status === 'success' ? payload.value : null
        if (cancelled) return
        // Org settings (if ever set in Convex) win over the frontend preset.
        const theme = preset || org?.settings ? { ...preset, ...(org?.settings || {}) } : null
        applyTheme(theme)
        setState({ org, theme, loading: false })
      } catch {
        if (!cancelled) setState({ org: null, theme: preset, loading: false })
      }
    })()
    return () => { cancelled = true }
  }, [slug])

  return <OrgThemeContext.Provider value={state}>{children}</OrgThemeContext.Provider>
}
