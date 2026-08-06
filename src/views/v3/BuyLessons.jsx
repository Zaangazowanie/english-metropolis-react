// BuyLessons — the student "buy lesson packages" wizard (2026-07-10).
//
// The Tpay gateway is not integrated yet, so the flow ends with an ORDER:
// the student picks one of the live packages, fills billing details, and
// submits. English Metro invoices manually; once paid, the superadmin
// confirms the order in the console and the lessons are allocated —
// only then can the student book. Three onion steps + an orders list.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FONT, G } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Btn, Glass, Pill } from '../../design/v3/primitives.jsx'
import { useI18n } from '../../i18n'
import { useStudentAuth } from '../../contexts/StudentAuthContext.jsx'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'
import { PRIVATE_PACKAGES, PACKAGE_LESSONS } from '../public/packages.js'
import { PL_CITIES } from '../public/pl-cities.js'

async function convexCall(kind, path, args) {
  const r = await fetchWithTimeout(`/api/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  const payload = await r.json()
  if (payload?.status !== 'success') throw new Error(payload?.errorMessage || `${path} failed`)
  return payload.value
}

const emptyBilling = { fullName: '', email: '', phone: '', addressLine: '', city: '', postalCode: '', country: 'Polska', company: '', nip: '', notes: '' }

export default function BuyLessons({ data, slug, basePath = '' }) {
  const { T, isMobile } = useV3Theme()
  const { t, lang } = useI18n()
  const pl = lang === 'pl'
  const { studentUser } = useStudentAuth()
  const studentId = studentUser?._id

  // ?package=<id> (from the pricing page / signup) preselects and jumps to billing
  const preselect = useMemo(() => {
    if (typeof window === 'undefined') return null
    const id = new URLSearchParams(window.location.search).get('package')
    return PRIVATE_PACKAGES.find(p => p.id === id) || null
  }, [])
  const [step, setStep] = useState(preselect ? 2 : 1)          // 1 pick · 2 billing · 3 review · 4 done
  const [pkg, setPkg] = useState(preselect)
  const [billing, setBilling] = useState(emptyBilling)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [showErrs, setShowErrs] = useState(false)
  const [orders, setOrders] = useState(null)
  const [alloc, setAlloc] = useState(null)

  const reload = () => {
    if (!studentId) return
    convexCall('query', 'orders:listMyOrders', { studentId }).then(setOrders).catch(() => setOrders([]))
    convexCall('query', 'orders:getStudentAllocation', { studentId }).then(setAlloc).catch(() => setAlloc(null))
  }
  useEffect(reload, [studentId])

  useEffect(() => {
    // prefill from the profile where we can
    setBilling(b => ({ ...b,
      fullName: b.fullName || studentUser?.name || '',
      email: b.email || (/@englishmetro\.com$/i.test(studentUser?.email || '') ? '' : studentUser?.email || ''),
    }))
  }, [studentUser?._id])

  async function submit() {
    if (!studentId || !pkg) return
    setBusy(true); setErr('')
    try {
      await convexCall('mutation', 'orders:createOrder', {
        studentId, packageId: pkg.id, packageName: pkg.name,
        lessons: PACKAGE_LESSONS[pkg.id] || 1, priceLabel: pkg.price,
        billing: Object.fromEntries(Object.entries(billing).map(([k, v]) => [k, String(v || '').trim()])),
      })
      setStep(4)
      reload()
    } catch (e) {
      setErr(String(e.message || e))
    } finally { setBusy(false) }
  }

  const L = pl ? {
    title: 'Dokup lekcje', kicker: 'Pakiety lekcji',
    intro: 'Wybierz pakiet, podaj dane do faktury i wyślij zamówienie. Otrzymasz od nas fakturę — po zaksięgowaniu płatności lekcje pojawią się na Twoim koncie i będziesz mógł/mogła je rezerwować.',
    remaining: n => `${n} lekcji do wykorzystania`,
    step1: 'Wybierz pakiet', step2: 'Dane do rozliczenia', step3: 'Podsumowanie', step4: 'Zamówienie wysłane!',
    choose: 'Wybieram', back: 'Wstecz', next: 'Dalej', submit: 'Wyślij zamówienie',
    done: 'Dziękujemy! Twoje zamówienie dotarło do English Metro. Wyślemy Ci fakturę na podany adres e-mail — po opłaceniu lekcje zostaną dodane do Twojego konta (zwykle w ciągu 24h od zaksięgowania).',
    myOrders: 'Twoje zamówienia', statuses: { pending_invoice: 'oczekuje na fakturę / płatność', confirmed: 'opłacone — lekcje przyznane', cancelled: 'anulowane' },
    fields: { fullName: 'Imię i nazwisko *', email: 'E-mail do faktury *', phone: 'Telefon', addressLine: 'Ulica i numer *', city: 'Miejscowość *', postalCode: 'Kod pocztowy *', country: 'Kraj', company: 'Firma (opcjonalnie)', nip: 'NIP (opcjonalnie)', notes: 'Uwagi do zamówienia' },
    reviewNote: 'Płatność: faktura (przelew). Płatność online przez Przelewy24 (BLIK, karta, szybki przelew) jest dostępna przy zakupie pakietu na stronie z pakietami.',
    errors: { fullName: 'Podaj imię i nazwisko.', email: 'Podaj poprawny adres e-mail.',
      phone: 'Numer telefonu wygląda na niepełny (min. 9 cyfr).',
      addressLine: 'Podaj ulicę z numerem domu / mieszkania.', city: 'Podaj miejscowość.',
      postalCode: 'Kod pocztowy w formacie 00-000.' },
  } : {
    title: 'Buy lessons', kicker: 'Lesson packages',
    intro: 'Pick a package, add your billing details and submit the order. We will send you an invoice — once payment clears, the lessons appear on your account and you can book them.',
    remaining: n => `${n} lessons remaining`,
    step1: 'Choose a package', step2: 'Billing details', step3: 'Review', step4: 'Order sent!',
    choose: 'Choose', back: 'Back', next: 'Next', submit: 'Submit order',
    done: 'Thank you! Your order has reached English Metro. We will email your invoice — once paid, the lessons are added to your account (usually within 24h of payment).',
    myOrders: 'Your orders', statuses: { pending_invoice: 'awaiting invoice / payment', confirmed: 'paid — lessons allocated', cancelled: 'cancelled' },
    fields: { fullName: 'Full name *', email: 'Invoice email *', phone: 'Phone', addressLine: 'Street & number *', city: 'City / town *', postalCode: 'Postal code *', country: 'Country', company: 'Company (optional)', nip: 'Tax ID / NIP (optional)', notes: 'Order notes' },
    reviewNote: 'Payment: invoice (bank transfer). Online payment through Przelewy24 (BLIK, card, fast transfer) is available when you buy a package on the packages page.',
    errors: { fullName: 'Enter your full name.', email: 'Enter a valid email address.',
      phone: 'Phone number looks incomplete (min. 9 digits).',
      addressLine: 'Enter a street with a house number.', city: 'Enter your city or town.',
      postalCode: 'Polish postal codes look like 00-000.' },
  }

  // Poland is the default market — postal format + city autocomplete key off it.
  const isPL = /pol|^pl$/i.test((billing.country || '').trim())
  const fieldErrs = (() => {
    const e = {}
    if (billing.fullName.trim().length < 3) e.fullName = L.errors.fullName
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(billing.email.trim())) e.email = L.errors.email
    if (billing.phone && billing.phone.replace(/\D/g, '').length < 9) e.phone = L.errors.phone
    const addr = billing.addressLine.trim()
    if (addr.length < 4 || !/\d/.test(addr)) e.addressLine = L.errors.addressLine
    if (billing.city.trim().length < 2) e.city = L.errors.city
    const pc = billing.postalCode.trim()
    if (isPL ? !/^\d{2}-\d{3}$/.test(pc) : pc.length < 3) e.postalCode = L.errors.postalCode
    return e
  })()
  const canNext2 = Object.keys(fieldErrs).length === 0

  return (
    <div style={{ maxWidth: 1840, margin: '0 auto', padding: isMobile ? '24px 18px 80px' : '40px 32px 80px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase',
          color: T.brandInk || T.brand, marginBottom: 10 }}>{L.kicker}</div>
        <h1 style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: isMobile ? 34 : 48,
          lineHeight: 1.05, letterSpacing: '-0.03em', margin: 0, color: T.text }}>{L.title}</h1>
        <p style={{ marginTop: 14, fontSize: 15, color: T.textDim, maxWidth: 640, lineHeight: 1.55 }}>{L.intro}</p>
        {alloc && (
          <div style={{ marginTop: 12 }}>
            <Pill tone={alloc.remaining > 0 ? 'emerald' : 'amber'} icon="token">
              {L.remaining(alloc.remaining)}
            </Pill>
          </div>
        )}
      </div>

      {/* step indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[L.step1, L.step2, L.step3].map((label, i) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            background: step === i + 1 ? G.brand : step > i + 1 ? 'rgba(52,211,153,0.12)' : T.surface,
            color: step === i + 1 ? '#fff' : step > i + 1 ? T.emerald : T.textDim,
            border: `1px solid ${step > i + 1 ? 'rgba(52,211,153,0.3)' : T.border}` }}>
            {step > i + 1 && <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check</span>}
            {i + 1} · {label}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {PRIVATE_PACKAGES.map(p => (
            <Glass key={p.id} padding={22} hover style={{ display: 'flex', flexDirection: 'column',
              borderColor: pkg?.id === p.id ? 'rgba(217,70,239,0.5)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: FONT.display, fontSize: 19, fontWeight: 600, color: T.text }}>{p.name}</span>
                {p.badge && <Pill tone={p.accent === 'brand' ? 'brand' : 'sky'} size="sm">{p.badge}</Pill>}
              </div>
              <div style={{ marginTop: 8, fontFamily: FONT.display, fontSize: 30, fontWeight: 600,
                background: G.brand, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{p.price}</div>
              <div style={{ fontSize: 12, color: T.textDim }}>{p.pace} · {p.perLesson}</div>
              <p style={{ marginTop: 10, fontSize: 13, color: T.textSoft, lineHeight: 1.5, flex: 1 }}>{p.bestFor}</p>
              <div style={{ marginTop: 14 }}>
                <Btn variant={pkg?.id === p.id ? 'primary' : 'secondary'} size="md"
                  onClick={() => { setPkg(p); setStep(2) }}>
                  {L.choose} →
                </Btn>
              </div>
            </Glass>
          ))}
        </div>
      )}

      {step === 2 && pkg && (
        <Glass padding={26} style={{ maxWidth: 720 }}>
          <div style={{ marginBottom: 14, fontSize: 13, color: T.textDim }}>
            {pkg.name} · <strong style={{ color: T.text }}>{pkg.price}</strong>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            <datalist id="pl-cities">
              {PL_CITIES.map(c => <option key={c} value={c} />)}
            </datalist>
            {['fullName', 'email', 'phone', 'addressLine', 'city', 'postalCode', 'country', 'company', 'nip'].map(k => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.textDim }}>{L.fields[k]}</span>
                <input value={billing[k]}
                  list={k === 'city' && isPL ? 'pl-cities' : undefined}
                  inputMode={k === 'postalCode' ? 'numeric' : k === 'phone' ? 'tel' : undefined}
                  placeholder={k === 'postalCode' && isPL ? '00-000' : undefined}
                  onChange={e => {
                    let v = e.target.value
                    if (k === 'postalCode' && isPL) {
                      const d = v.replace(/\D/g, '').slice(0, 5)
                      v = d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d
                    }
                    setBilling(b => ({ ...b, [k]: v }))
                  }}
                  style={{ padding: '10px 12px', borderRadius: 10, background: T.surfaceLo,
                    border: `1px solid ${showErrs && fieldErrs[k] ? 'rgba(244,63,94,0.65)' : T.border}`,
                    color: T.text, fontSize: 14, outline: 'none' }} />
                {showErrs && fieldErrs[k] && (
                  <span style={{ fontSize: 11.5, color: T.rose || '#fb7185' }}>{fieldErrs[k]}</span>
                )}
              </label>
            ))}
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.textDim }}>{L.fields.notes}</span>
            <textarea rows={2} value={billing.notes} onChange={e => setBilling(b => ({ ...b, notes: e.target.value }))}
              style={{ padding: '10px 12px', borderRadius: 10, background: T.surfaceLo,
                border: `1px solid ${T.border}`, color: T.text, fontSize: 14, outline: 'none', resize: 'vertical' }} />
          </label>
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <Btn variant="ghost" size="md" onClick={() => setStep(1)}>← {L.back}</Btn>
            <Btn variant="primary" size="md"
              onClick={() => { if (!canNext2) { setShowErrs(true); return } setShowErrs(false); setStep(3) }}>
              {L.next} →
            </Btn>
          </div>
        </Glass>
      )}

      {step === 3 && pkg && (
        <Glass padding={26} style={{ maxWidth: 720 }}>
          <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600, color: T.text }}>
            {pkg.name} — {pkg.price}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: T.textDim }}>{pkg.pace} · {pkg.perLesson}</div>
          <div style={{ marginTop: 14, display: 'grid', gap: 6, fontSize: 13, color: T.textSoft }}>
            {Object.entries(L.fields).map(([k]) => billing[k] ? (
              <div key={k}><span style={{ color: T.textDim }}>{L.fields[k].replace(' *', '')}: </span>{billing[k]}</div>
            ) : null)}
          </div>
          <p style={{ marginTop: 14, fontSize: 12, color: T.amber }}>{L.reviewNote}</p>
          {err && <p style={{ marginTop: 10, fontSize: 13, color: T.rose }}>{err}</p>}
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <Btn variant="ghost" size="md" onClick={() => setStep(2)}>← {L.back}</Btn>
            <Btn variant="primary" size="md" icon="shopping_cart_checkout" disabled={busy} onClick={submit}>
              {busy ? '…' : L.submit}
            </Btn>
          </div>
        </Glass>
      )}

      {step === 4 && (
        <Glass padding={30} style={{ maxWidth: 720, textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 44, color: T.emerald }}>order_approve</span>
          <div style={{ marginTop: 10, fontFamily: FONT.display, fontSize: 24, fontWeight: 600, color: T.text }}>{L.step4}</div>
          <p style={{ marginTop: 10, fontSize: 14, color: T.textSoft, lineHeight: 1.6 }}>{L.done}</p>
          <div style={{ marginTop: 16 }}>
            <Link to={`${basePath}/${slug}/calendar`} style={{ textDecoration: 'none' }}>
              <Btn variant="secondary" size="md">→ {pl ? 'Kalendarz' : 'Calendar'}</Btn>
            </Link>
          </div>
        </Glass>
      )}

      {/* orders history */}
      {orders && orders.length > 0 && (
        <div style={{ marginTop: 34 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase',
            color: T.textDim, marginBottom: 10 }}>{L.myOrders}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {orders.map(o => (
              <Glass key={o._id} padding={14} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: 600, color: T.text }}>{o.packageName}</span>
                <span style={{ fontSize: 12, color: T.textDim }}>{o.lessons} × 60 min · {o.priceLabel}</span>
                <Pill tone={o.status === 'confirmed' ? 'emerald' : o.status === 'cancelled' ? 'neutral' : 'amber'} size="sm">
                  {L.statuses[o.status] || o.status}
                </Pill>
              </Glass>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
