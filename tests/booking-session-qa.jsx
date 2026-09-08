import React from 'react'
import { createRoot } from 'react-dom/client'
import { StudentAuthProvider } from '../src/contexts/StudentAuthContext.jsx'
import { V3ThemeProvider } from '../src/design/v3/ThemeProvider.jsx'
import { I18nProvider } from '../src/i18n/index.jsx'
import LessonBooking from '../src/views/v3/LessonBooking.jsx'

// Local-only browser fixture; never calls a production API or creates bookings.
const scenario = new URLSearchParams(location.search).get('scenario') || 'tokenless'
const user = { _id: 'fixture-student', slug: 'fixture-student', name: 'Test Learner', organizationId: 'fixture-org' }
if (scenario !== 'tokenless' && scenario !== 'legacy') user.sessionToken = 'fixture-session'
localStorage.setItem('em.lang.v2', new URLSearchParams(location.search).get('lang') || 'en')
localStorage.setItem('em.v3.mode', 'day')
localStorage.setItem('studentSlug', user.slug)
if (scenario === 'legacy') localStorage.removeItem('em-student-session')
else localStorage.setItem('em-student-session', JSON.stringify(user))
window.fetch = async (url, options) => {
  if (!String(url).includes('/api/query')) throw new Error('The booking fixture allows queries only')
  const { path } = JSON.parse(options.body)
  if (scenario === 'network-error') throw new Error('Connection unavailable')
  const slots = [{ dateWarsaw: '2026-09-10', timeWarsaw: '18:00', startUtc: Date.UTC(2026, 8, 10, 16) }]
  const values = {
    'studentAuth:resolveStudentSession': scenario === 'expired' ? null : user,
    'scheduling:listBookings': [],
    'scheduling:getOpenSlots': slots,
    'orders:getStudentAllocation': { remaining: 4 },
    'scheduling:getWeeklyAvailability': [],
  }
  if (!(path in values)) throw new Error(`Unexpected fixture query: ${path}`)
  return new Response(JSON.stringify({ status: 'success', value: values[path] }), { headers: { 'Content-Type': 'application/json' } })
}
createRoot(document.getElementById('root')).render(<V3ThemeProvider defaultMode="day"><I18nProvider><StudentAuthProvider><LessonBooking /></StudentAuthProvider></I18nProvider></V3ThemeProvider>)
