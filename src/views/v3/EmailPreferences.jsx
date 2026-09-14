import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { MARKETING_NOTICE } from '../../../shared/marketingNotice'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'

async function call(kind, path, args) {
  const response = await fetchWithTimeout(`/api/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  const result = await response.json()
  if (!response.ok || result.status !== 'success') throw new Error('REQUEST_FAILED')
  return result.value
}

export default function EmailPreferences() {
  const { T } = useV3Theme()
  const { lang, setLang } = useI18n()
  const locale = lang === 'pl' ? 'pl' : 'en'
  const pl = locale === 'pl'
  const location = useLocation()
  const token = new URLSearchParams(location.hash.slice(1)).get('unsubscribe') || ''
  const [sessionToken] = useState(() => {
    try { return JSON.parse(localStorage.getItem('em-student-session') || '{}').sessionToken || '' }
    catch { return '' }
  })
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(!token && !!sessionToken)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (token || !sessionToken) return
    let active = true
    call('query', 'emailPreferences:mine', { sessionToken }).then(result => {
      if (active) { setSubscribed(result.subscribed); setLoaded(true) }
    }).catch(() => { if (active) setError('load') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, sessionToken])

  async function save(e) {
    e.preventDefault()
    if (busy || (!token && !loaded)) return
    setBusy(true); setError(''); setDone(false)
    try {
      if (token) {
        const result = await call('mutation', 'emailPreferences:unsubscribe', { token })
        if (!result.success) { setError('link'); return }
      } else {
        await call('mutation', 'emailPreferences:setMine', { sessionToken, subscribed, locale })
      }
      setDone(true)
    } catch { setError('save') }
    finally { setBusy(false) }
  }

  return (
    <main style={{ minHeight: '100vh', background: T.bg || '#faf7fc', color: T.text, padding: '48px 18px', fontFamily: 'Inter, Arial, sans-serif' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: '28px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <Link to="/" style={{ color: T.brandInk || T.brand, fontWeight: 800, fontSize: 22 }}>EnglishMetro</Link>
          <button type="button" onClick={() => setLang(pl ? 'en' : 'pl')} style={{ color: T.text, background: 'transparent', border: `1px solid ${T.border}`, padding: '8px 12px', borderRadius: 8 }}>{pl ? 'EN' : 'PL'}</button>
        </div>
        <h1 style={{ fontSize: 28, lineHeight: 1.2, marginTop: 30 }}>{pl ? 'Wiadomości od EnglishMetro' : 'Emails from EnglishMetro'}</h1>
        <p style={{ lineHeight: 1.65, color: T.textDim }}>{pl ? 'Ty decydujesz, czy chcesz otrzymywać oferty lekcji, rabaty i aktualności. Zmiana nie wpływa na Twoje konto, lekcje ani ważne wiadomości dotyczące rezerwacji i płatności.' : 'You choose whether to receive lesson offers, discounts and news. Your account, lessons and essential booking and payment emails are unaffected.'}</p>
        {loading && <p role="status">{pl ? 'Wczytywanie…' : 'Loading…'}</p>}
        {done ? <p role="status" style={{ padding: 16, border: `1px solid ${T.border}`, borderRadius: 12 }}>{token ? (pl ? 'Gotowe — nie będziemy wysyłać Ci ofert e-mailem.' : "You're unsubscribed. We won't send you promotional emails.") : (pl ? 'Zapisano Twoje ustawienia.' : 'Your preferences are saved.')}</p>
          : (token || loaded) && <form onSubmit={save}>
            {!token && <label style={{ display: 'flex', gap: 12, lineHeight: 1.65, margin: '24px 0' }}>
              <input type="checkbox" checked={subscribed} onChange={e => setSubscribed(e.target.checked)} disabled={busy} style={{ width: 20, height: 20, flexShrink: 0, marginTop: 4, accentColor: '#8126aa' }} />
              <span>{MARKETING_NOTICE[locale]}</span>
            </label>}
            <button type="submit" disabled={busy} style={{ width: '100%', padding: 15, background: '#7424a5', color: '#fff', border: 0, borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: busy ? .6 : 1 }}>{busy ? (pl ? 'Zapisywanie…' : 'Saving…') : token ? (pl ? 'Wypisz mnie z ofert' : 'Unsubscribe from offers') : (pl ? 'Zapisz ustawienia' : 'Save preferences')}</button>
          </form>}
        {!token && !sessionToken && <Link to="/login?next=%2Femail-preferences" style={{ color: T.brandInk || T.brand, fontWeight: 700 }}>{pl ? 'Zaloguj się, aby zmienić ustawienia' : 'Sign in to manage your preferences'}</Link>}
        {error && <p role="alert" style={{ lineHeight: 1.6 }}>{error === 'link' ? (pl ? 'Ten link jest nieprawidłowy. Zaloguj się, aby zmienić ustawienia, lub napisz na support@englishmetro.com.' : 'This link is invalid. Sign in to manage your preferences or email support@englishmetro.com.') : (pl ? 'Nie udało się wczytać lub zapisać ustawień. Odśwież stronę i spróbuj ponownie. Możesz też napisać na support@englishmetro.com.' : 'We could not load or save your preferences. Refresh and try again, or email support@englishmetro.com.')}</p>}
        <p style={{ fontSize: 12, lineHeight: 1.6, marginTop: 28, color: T.textDim }}>EnglishMetro · Fundacja „Twój StartUp”<br /><Link to="/privacy" style={{ color: T.brandInk || T.brand }}>{pl ? 'Polityka prywatności' : 'Privacy policy'}</Link></p>
      </div>
    </main>
  )
}
