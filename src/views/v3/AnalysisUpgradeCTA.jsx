// The AI-analysis upgrade prompt (2026-08-17).
//
// A student who did not buy the analysis at checkout had no way to buy it
// afterwards. This is that way, and it lives where the absence is actually felt:
// on a lesson card with no analysis on it.
//
// Every price on this component comes from `analysisOffers:myOffer`. Nothing is
// hard-coded here — the server is the price authority, and the quote it writes
// when the student picks an option is what Przelewy24 is registered against.
//
// Who sees it is a SERVER decision (`upgradeOfferState`), not a frontend one.
// In particular a child's account, a student who already has the analysis, a
// student who withdrew consent, and the pre-platform roster whose written
// consent simply has not been transcribed into the database yet all get
// `show: false` and this renders nothing.

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { FONT, G, EASE } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Btn } from '../../design/v3/primitives.jsx'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'

function readSessionToken() {
  try {
    const raw = window.localStorage.getItem('em-student-session')
    return raw ? (JSON.parse(raw)?.sessionToken || null) : null
  } catch { return null }
}

async function callConvex(kind, path, args) {
  const response = await fetchWithTimeout(`/api/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  const payload = await response.json()
  if (payload?.status !== 'success') throw new Error(payload?.errorMessage || `${path} failed`)
  return payload.value
}

/**
 * @param lessonId  Convex id of the lesson this is shown against. Without it the
 *                  single-lesson option cannot be offered — there is no lesson
 *                  to attach the entitlement to — and only the account-wide
 *                  upgrade is shown.
 * @param compact   Card placement (tighter, no bullet list). The full version is
 *                  used inside the lesson detail.
 */
// Lesson ids reaching this component are not all Convex ids. `useStudentData`
// falls back to the date, or to "lesson-3", for students still served from a
// static lessons.json — and `v.id("lessons")` would reject those outright. A
// non-id is treated as "no lesson", which costs only the single-lesson button;
// the account-wide upgrade needs no lesson and is still offered.
function convexLessonId(value) {
  const id = String(value || '')
  return /^[a-z0-9]{25,40}$/.test(id) ? id : null
}

export default function AnalysisUpgradeCTA({ lessonId: rawLessonId, compact = false }) {
  const lessonId = convexLessonId(rawLessonId)
  const { T, mode } = useV3Theme()
  const { lang } = useI18n()
  const isPl = lang === 'pl'
  const t = (en, pl) => (isPl ? pl : en)
  const [offer, setOffer] = useState(null)      // null = unknown, false = not offered
  const [busy, setBusy] = useState(null)        // 'lesson' | 'account'
  const [error, setError] = useState('')

  useEffect(() => {
    const sessionToken = readSessionToken()
    // No student session at all: a teacher or admin looking at the page, or a
    // signed-out visitor. Neither is someone to sell to.
    if (!sessionToken) { setOffer(false); return }
    let cancelled = false
    callConvex('query', 'analysisOffers:myOffer', {
      sessionToken, ...(lessonId ? { lessonId } : {}),
    })
      .then(value => { if (!cancelled) setOffer(value?.show ? value : false) })
      // A failed lookup must not put a sales prompt in front of someone who may
      // already have paid. Unknown means show nothing.
      .catch(() => { if (!cancelled) setOffer(false) })
    return () => { cancelled = true }
  }, [lessonId])

  const buy = useCallback(async (scope) => {
    const sessionToken = readSessionToken()
    if (!sessionToken || busy) return
    setBusy(scope)
    setError('')
    try {
      // The server prices it and writes the quote; we only carry its reference
      // to the checkout, where the ordinary consent and payment flow takes over.
      const quote = await callConvex('mutation', 'analysisOffers:createQuote', {
        sessionToken, scope, lang: isPl ? 'pl' : 'en',
        ...(scope === 'lesson' ? { lessonId } : {}),
      })
      if (!quote?.quoteRef) throw new Error('no quote')
      window.location.assign(`/checkout?quote=${encodeURIComponent(quote.quoteRef)}`)
    } catch {
      setBusy(null)
      setError(t('We could not open that offer. Please try again.',
        'Nie udało się otworzyć tej oferty. Spróbuj ponownie.'))
    }
  }, [busy, isPl, lessonId, t])

  if (!offer) return null

  const single = offer.single || {}
  const bulk = offer.bulk || {}
  const isDay = mode === 'day'

  const bullets = [
    t('Your CEFR level for the lesson, with a score',
      'Twój poziom CEFR dla lekcji wraz z oceną punktową'),
    t('A written summary of what you actually talked about',
      'Pisemne podsumowanie tego, o czym naprawdę rozmawialiście'),
    t('The mistakes you really made, quoted, with the correction',
      'Błędy, które faktycznie popełniłaś/eś — zacytowane, wraz z poprawką'),
    t('What to practise next, linked straight into the drills',
      'Co ćwiczyć dalej — z linkami prosto do ćwiczeń'),
  ]

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        marginTop: 14,
        borderRadius: 18,
        padding: compact ? '14px 16px' : '20px 22px',
        background: isDay ? 'rgba(139,92,246,0.06)' : 'rgba(139,92,246,0.10)',
        border: `1px solid ${isDay ? 'rgba(139,92,246,0.22)' : 'rgba(167,139,250,0.28)'}`,
        transition: `all 280ms ${EASE.springFast}`,
      }}>
      <div style={{
        fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: T.brandInk || T.brand, marginBottom: 8,
      }}>
        {t('Optional paid add-on', 'Płatny dodatek opcjonalny')}
      </div>
      <h4 style={{
        fontFamily: FONT.display, fontSize: compact ? 15 : 18, fontWeight: 600,
        letterSpacing: '-0.02em', margin: 0, color: T.text, lineHeight: 1.25,
      }}>
        {t('This lesson has no AI analysis.', 'Ta lekcja nie ma analizy AI.')}
      </h4>
      <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.6, color: T.textDim }}>
        {t('The analysis is written after the lesson from a transcript of what was said. It is optional, and it is paid.',
          'Analiza powstaje po lekcji na podstawie transkrypcji tego, co zostało powiedziane. Jest opcjonalna i płatna.')}
      </p>

      {!compact && (
        <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {bullets.map(line => (
            <li key={line} style={{
              fontSize: 13, lineHeight: 1.5, color: T.textSoft,
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <span aria-hidden style={{
                marginTop: 6, width: 5, height: 5, borderRadius: 999,
                background: G.brandLine, flexShrink: 0,
              }} />
              {line}
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        {single.available && (
          <Btn variant="secondary" size="sm" disabled={!!busy}
            onClick={() => buy('lesson')}>
            {busy === 'lesson'
              ? t('Opening…', 'Otwieramy…')
              : t(`This lesson · ${single.pricePLN} PLN`, `Ta lekcja · ${single.pricePLN} PLN`)}
          </Btn>
        )}
        {bulk.available && (
          <Btn variant="primary" size="sm" disabled={!!busy}
            onClick={() => buy('account')}>
            {busy === 'account'
              ? t('Opening…', 'Otwieramy…')
              : t(`All my lessons · ${bulk.totalPLN} PLN`, `Wszystkie moje lekcje · ${bulk.totalPLN} PLN`)}
          </Btn>
        )}
      </div>

      {/* What "all my lessons" covers, stated before they click rather than in
          a confirmation afterwards. The backlog count is the server's, and it
          is the number the price was actually worked out from. */}
      {bulk.available && (
        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.55, color: T.textMute }}>
          {t(
            `“All my lessons” covers every lesson already on your account that has no analysis (${bulk.coveredLessons} right now) and every lesson you have from now on, for as long as you study here. That works out at ${bulk.perLessonPLN} PLN a lesson instead of ${single.pricePLN ?? bulk.listTotalPLN / bulk.billableLessons} PLN.`,
            `„Wszystkie moje lekcje” obejmuje każdą lekcję już na Twoim koncie, która nie ma analizy (obecnie ${bulk.coveredLessons}), oraz każdą kolejną lekcję — tak długo, jak się u nas uczysz. To ${bulk.perLessonPLN} PLN za lekcję zamiast ${single.pricePLN ?? bulk.listTotalPLN / bulk.billableLessons} PLN.`,
          )}
          {bulk.coveredLessons < bulk.billableLessons && ' ' + t(
            `The upgrade is billed on a minimum of ${bulk.billableLessons} lessons.`,
            `Ulepszenie jest rozliczane od minimum ${bulk.billableLessons} lekcji.`,
          )}
          {' '}
          {t('Lessons taught before you buy can only be analysed if their recording is still held.',
            'Lekcje przeprowadzone przed zakupem możemy przeanalizować tylko wtedy, gdy nadal mamy ich nagranie.')}
        </p>
      )}

      {error && (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: T.bad }}>{error}</p>
      )}
    </div>
  )
}
