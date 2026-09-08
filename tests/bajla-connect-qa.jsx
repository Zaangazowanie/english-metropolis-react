import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { StudentAuthProvider } from '../src/contexts/StudentAuthContext.jsx'
import { TeacherAuthProvider } from '../src/contexts/TeacherAuthContext.jsx'
import { AdminAuthProvider } from '../src/contexts/AdminAuthContext.jsx'
import { I18nProvider } from '../src/i18n/index.jsx'
import BajlaConnectModal from '../src/components/BajlaConnectModal.jsx'

// Local browser fixture: all API calls and WhatsApp navigation are captured.
const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') || 'returning'
const user = { _id: 'synthetic-student', slug: 'synthetic-student', name: 'Test Learner', sessionToken: 'synthetic-session' }
localStorage.setItem('em.lang.v2', params.get('lang') || 'en')
localStorage.setItem('em.bajla.popupSeen.v2.synthetic-student', '1')
if (scenario === 'signed-out') localStorage.removeItem('em-student-session')
else localStorage.setItem('em-student-session', JSON.stringify(user))
sessionStorage.removeItem('em-admin-session')
sessionStorage.removeItem('em-teacher-session')
window.open = (url) => {
  document.getElementById('qa-status').textContent = 'Captured WhatsApp link: ' + url
  return null
}
window.fetch = async (url, options) => {
  if (!String(url).startsWith('/api/')) throw new Error('External network blocked')
  const { path, args } = JSON.parse(options.body)
  const values = {
    'studentAuth:myVerification': { verified: true, bajlaAllowed: true },
    'bajla:getMyPhone': { phone: scenario === 'change-number' ? '+48 111 111 111' : null },
    'orders:getStudentAllocation': { remaining: 4 },
  }
  if (path === 'bajla:setMyPhone') {
    if (args.sessionToken !== user.sessionToken) throw new Error('Wrong fixture session')
    document.getElementById('qa-saved').textContent = 'Captured authenticated save: ' + args.phone
    return new Response(JSON.stringify({ status: 'success', value: { ok: true, phone: args.phone } }))
  }
  if (!(path in values)) throw new Error('Unexpected fixture API: ' + path)
  return new Response(JSON.stringify({ status: 'success', value: values[path] }))
}
createRoot(document.getElementById('root')).render(
  <BrowserRouter><I18nProvider><StudentAuthProvider><TeacherAuthProvider><AdminAuthProvider>
    <main><h1>Local Bajla connection test</h1><p id="qa-saved">No account changes made</p><p id="qa-status">No messages sent</p></main>
    <BajlaConnectModal />
  </AdminAuthProvider></TeacherAuthProvider></StudentAuthProvider></I18nProvider></BrowserRouter>
)
