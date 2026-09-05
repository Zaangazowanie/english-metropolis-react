// Whether the signed-in student has confirmed their e-mail address.
//
// One hook, one query (studentAuth:myVerification), so every gated surface
// agrees about who is confirmed. Starts as `null` = not known yet: a surface
// must not flash its gate at a confirmed student while the answer is in flight,
// and must not flash its content at an unconfirmed one either.
import { useCallback, useEffect, useState } from 'react'
import { fetchWithTimeout } from '../practice/lib/practice-cache'
import { getStudentSessionToken } from '../lib/student-session.js'

export function useEmailVerified() {
  const [verified, setVerified] = useState(null)   // null | true | false
  // Whether the paid AI add-on is active. Gates the lesson analysis.
  const [analysisAllowed, setAnalysisAllowed] = useState(null)
  // Bajla separately: the paid add-on switches her on for anyone who signed up
  // from 2026-08-10, but the earlier roster keeps her free once they consent.
  // The server owns that rule (studentAuth:myVerification) — do not re-derive
  // it from analysisAllowed here or the grandfathered students go dark.
  const [bajlaAllowed, setBajlaAllowed] = useState(null)
  const [bajlaReason, setBajlaReason] = useState(null)
  // Whether a student session exists at all. `verified` cannot answer this:
  // it resolves to true for a signed-OUT visitor by design, so that a page
  // never gates someone who simply has no account yet on the grounds that
  // their address is unconfirmed. A surface that must tell "sign up" from
  // "confirm your address" needs both flags.
  const [signedIn, setSignedIn] = useState(() => !!getStudentSessionToken())
  const [email, setEmail] = useState(null)
  const [resent, setResent] = useState('')         // '' | 'sending' | 'sent' | 'error'

  const load = useCallback(async () => {
    const sessionToken = getStudentSessionToken()
    setSignedIn(!!sessionToken)
    // signed out
    if (!sessionToken) {
      setVerified(true); setAnalysisAllowed(false)
      setBajlaAllowed(false); setBajlaReason('signed_out')
      return
    }
    try {
      const response = await fetchWithTimeout('/api/query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'studentAuth:myVerification', args: { sessionToken } }),
      })
      const payload = await response.json()
      if (payload?.status !== 'success') throw new Error('lookup failed')
      setVerified(!!payload.value?.verified)
      setAnalysisAllowed(!!payload.value?.analysisAllowed)
      setBajlaAllowed(!!payload.value?.bajlaAllowed)
      setBajlaReason(payload.value?.bajlaReason || null)
      setEmail(payload.value?.email || null)
    } catch {
      // A failed lookup must not lock anyone out of a page they paid for. The
      // paid feature is the exception: unknown means not-yet-bought, never
      // granted, because guessing "yes" would hand it out for free.
      setVerified(true)
      setAnalysisAllowed(false)
      setBajlaAllowed(false)
      setBajlaReason(null)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const resend = useCallback(async () => {
    const sessionToken = getStudentSessionToken()
    if (!sessionToken) return
    setResent('sending')
    try {
      const response = await fetchWithTimeout('/api/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'studentAuth:resendVerification', args: { sessionToken } }),
      })
      const payload = await response.json()
      if (payload?.status !== 'success') throw new Error('resend failed')
      if (payload.value?.alreadyVerified) { setVerified(true); setResent('') ; return }
      setResent('sent')
    } catch { setResent('error') }
  }, [])

  return { verified, signedIn, analysisAllowed, bajlaAllowed, bajlaReason, email, resend, resent, refresh: load }
}


