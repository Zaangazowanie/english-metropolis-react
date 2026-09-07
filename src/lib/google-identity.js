// Google Identity Services, loaded on demand. Until 2026-09-07 index.html
// pulled https://accounts.google.com/gsi/client (~100 KB) on every page,
// including the landing, for a button that only /login, /signup and /checkout
// render. Call ensureGoogleIdentity() before polling window.google.
let pending = null
export function ensureGoogleIdentity() {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.google?.accounts?.id) return Promise.resolve(true)
  if (pending) return pending
  pending = new Promise((resolve) => {
    const existing = document.querySelector('script[data-em-gsi]')
    if (existing) { existing.addEventListener('load', () => resolve(true)); existing.addEventListener('error', () => resolve(false)); return }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.emGsi = '1'
    script.addEventListener('load', () => resolve(true))
    script.addEventListener('error', () => { pending = null; resolve(false) })
    document.head.appendChild(script)
  })
  return pending
}
