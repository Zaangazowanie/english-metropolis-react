// Student config — reads from environment variables at build time,
// then from window globals (set in index.html), then falls back to defaults.
export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL
  || 'https://wooden-manatee-881.convex.cloud'

export const STUDENT_ID = import.meta.env.VITE_STUDENT_ID
  || (typeof window !== 'undefined' && window.__STUDENT_ID)
  || 'k17e3mg4ksckdena7ta8r2qndx83s1n9'

export const STUDENT_NAME = import.meta.env.VITE_STUDENT_NAME
  || (typeof window !== 'undefined' && window.__STUDENT_NAME)
  || 'Szymon Karpiński'

export const STUDENT_FIRST_NAME = import.meta.env.VITE_STUDENT_FIRST_NAME
  || (typeof window !== 'undefined' && window.__STUDENT_FIRST_NAME)
  || 'Szymon'

export const STUDENT_INITIALS = import.meta.env.VITE_STUDENT_INITIALS
  || (typeof window !== 'undefined' && window.__STUDENT_INITIALS)
  || 'SK'

export const STUDENT_LEVEL = import.meta.env.VITE_STUDENT_LEVEL
  || (typeof window !== 'undefined' && window.__STUDENT_LEVEL)
  || 'C1'

export const ANALYSES_LIMIT = 50
