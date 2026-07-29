'use strict'

const crypto = require('crypto')
const fs = require('fs')

const RELAY_PORTAL = 'http://127.0.0.1:3007'
const hitsByIp = new Map()

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ))
}

function clip(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function allowed(ip) {
  const now = Date.now()
  const windowMs = 10 * 60 * 1000
  const hits = (hitsByIp.get(ip) || []).filter(time => now - time < windowMs)
  if (hits.length >= 5) return false
  hits.push(now)
  hitsByIp.set(ip, hits)
  if (hitsByIp.size > 5000) hitsByIp.clear()
  return true
}

function portalPassword() {
  const text = fs.readFileSync('/root/.openclaw/secrets/mail-portal-login.txt', 'utf8')
  for (let line of text.split('\n')) {
    line = line.trim()
    if (line && !line.endsWith(':') && !line.includes(' ') && line.length > 12) return line
  }
  throw new Error('could not parse portal password')
}

async function portalSend(to, subject, text, html) {
  const login = await fetch(`${RELAY_PORTAL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: portalPassword() }),
  })
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0]
  if (!cookie) throw new Error('portal login failed')
  const response = await fetch(`${RELAY_PORTAL}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      from: 'support@englishmetro.com',
      fromName: 'English Metro',
      to: [to],
      subject,
      text,
      html,
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!result.ok) throw new Error(`portal send failed: ${JSON.stringify(result)}`)
}

function shell(heading, body) {
  return `<!doctype html><html><body style="margin:0;background:#eef1f6;padding:28px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
        <tr><td style="padding:28px 34px 12px;font:700 20px/1.2 Georgia,serif;color:#172033;">English <span style="color:#6d28d9;">Metro.</span></td></tr>
        <tr><td style="padding:12px 34px 34px;font:14px/1.65 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;color:#334155;">
          <div style="color:#6d28d9;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;">Odstąpienie od umowy · Contract withdrawal</div>
          <h1 style="margin:0 0 20px;color:#172033;font:700 27px/1.2 Georgia,serif;">${heading}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:20px 34px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font:11px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;">
          Fundacja Rozwoju Przedsiębiorczości „Twój StartUp”, Atlas Tower, Al. Jerozolimskie 123a, 18 piętro, 02-017 Warszawa<br>
          EnglishMetro – Moemedi Michael Poncana<br>
          Adres do doręczeń: ul. Ignacego Daszyńskiego 1/132, 05-300 Mińsk Mazowiecki · KRS 0000442857 · NIP 5213641211
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`
}

function detailTable(data) {
  const rows = [
    ['Numer potwierdzenia / Receipt', data.receiptRef],
    ['Data i godzina / Date and time', data.submittedWarsaw],
    ['Imię i nazwisko / Name', data.fullName],
    ['E-mail', data.email],
    ['Umowa / zamówienie', data.orderRef],
    ['Zakres / Scope', data.scope === 'whole' ? 'Cała umowa / Entire contract' : 'Wybrane usługi lub produkty / Selected services or products'],
    ['Szczegóły / Details', data.details || '—'],
  ]
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-top:1px solid #e2e8f0;">${
    rows.map(([label, value]) => `<tr><td style="width:180px;padding:9px 10px 9px 0;border-bottom:1px solid #e2e8f0;color:#64748b;vertical-align:top;">${esc(label)}</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;color:#172033;font-weight:600;">${esc(value)}</td></tr>`).join('')
  }</table>`
}

async function submitWithdrawal(body, meta = {}) {
  const ip = clip(meta.ip, 100)
  if (!allowed(ip || 'unknown')) return { status: 429, payload: { ok: false, error: 'slow down' } }
  if (body && body.website) return { status: 200, payload: { ok: true, receiptRef: 'EM-WD-RECEIVED', submittedAt: new Date().toISOString() } }

  const fullName = clip(body && body.fullName, 120)
  const email = clip(body && body.email, 160).toLowerCase()
  const orderRef = clip(body && body.orderRef, 120)
  const scope = body && body.scope === 'selected' ? 'selected' : 'whole'
  const details = clip(body && body.details, 1000)
  const lang = body && body.lang === 'en' ? 'en' : 'pl'
  if (
    fullName.length < 2
    || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    || orderRef.length < 2
    || (scope === 'selected' && details.length < 2)
  ) return { status: 400, payload: { ok: false, error: 'invalid withdrawal statement' } }

  const submittedAt = new Date()
  const receiptRef = `EM-WD-${submittedAt.toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const submittedWarsaw = new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'long',
    timeStyle: 'long',
    timeZone: 'Europe/Warsaw',
  }).format(submittedAt)
  const data = { fullName, email, orderRef, scope, details, lang, receiptRef, submittedWarsaw }
  const table = detailTable(data)
  const statementPl = scope === 'whole'
    ? `Niniejszym odstępuję od całej umowy oznaczonej jako ${orderRef}.`
    : `Niniejszym odstępuję od wskazanych usług lub produktów w ramach umowy oznaczonej jako ${orderRef}: ${details}.`
  const statementEn = scope === 'whole'
    ? `I hereby withdraw from the entire contract identified as ${orderRef}.`
    : `I hereby withdraw from the identified services or products under contract ${orderRef}: ${details}.`

  const studentBody = `<p>Potwierdzamy otrzymanie Twojego oświadczenia o odstąpieniu od umowy.</p>
    <blockquote style="margin:18px 0;padding:14px 16px;border-left:3px solid #6d28d9;background:#f7f5ff;color:#172033;">${esc(statementPl)}</blockquote>
    ${table}
    <p>Zachowaj tę wiadomość jako potwierdzenie na trwałym nośniku. Otrzymanie oświadczenia nie przesądza o jego ustawowych skutkach, które zależą od rodzaju i etapu realizacji umowy.</p>
    <p style="margin-top:24px;color:#64748b;">We confirm receipt of your contract-withdrawal statement.</p>
    <blockquote style="margin:18px 0;padding:14px 16px;border-left:3px solid #94a3b8;background:#f8fafc;color:#334155;">${esc(statementEn)}</blockquote>
    <p style="color:#64748b;">Keep this email as durable-medium confirmation. Acknowledgement does not predetermine the statutory effect of withdrawal, which depends on the contract type and performance stage.</p>`
  const studentText = `Potwierdzenie odstąpienia od umowy / Contract withdrawal confirmation\n\n${statementPl}\n${statementEn}\n\nNumer potwierdzenia: ${receiptRef}\nData i godzina: ${submittedWarsaw}\nImię i nazwisko: ${fullName}\nE-mail: ${email}\nUmowa / zamówienie: ${orderRef}\nZakres: ${scope}\nSzczegóły: ${details || '—'}\n\nZachowaj tę wiadomość jako potwierdzenie na trwałym nośniku.`

  // Withdrawal acknowledgements are a legal durable-medium delivery and must
  // never inherit the booking service's test-mode rerouting. Tests opt in only
  // through a direct, internal module call.
  const testMode = Boolean(meta.testMode)
  const testTo = clip(meta.testRecipient, 160) || process.env.BOOKING_TEST_RECIPIENT || 'mmponcana@gmail.com'
  const customerTo = testMode ? testTo : email
  const customerSubject = `${testMode ? '[TEST FOR CUSTOMER] ' : ''}Potwierdzenie odstąpienia ${receiptRef} — English Metro`
  await portalSend(customerTo, customerSubject, studentText, shell('Potwierdzenie otrzymania oświadczenia', studentBody))
  if (meta.skipInternal) {
    console.log('[em-report] withdrawal receipt sent', receiptRef, '(isolated test)')
    return { status: 200, payload: { ok: true, receiptRef, submittedAt: submittedAt.toISOString() } }
  }

  const internalBody = `<p>Otrzymano nowe oświadczenie o odstąpieniu od umowy.</p>
    <blockquote style="margin:18px 0;padding:14px 16px;border-left:3px solid #6d28d9;background:#f7f5ff;color:#172033;">${esc(statementPl)}</blockquote>
    ${table}
    <p>Odpowiedz klientowi na <a href="mailto:${encodeURIComponent(email)}">${esc(email)}</a> po weryfikacji umowy i etapu jej realizacji.</p>`
  const internalText = `Nowe odstąpienie ${receiptRef}\n${statementPl}\n${fullName} <${email}>\nData: ${submittedWarsaw}\nSzczegóły: ${details || '—'}`
  for (const recipient of ['hello@englishmetro.com', 'mmponcana@gmail.com']) {
    const to = testMode ? testTo : recipient
    try {
      await portalSend(to, `${testMode ? '[TEST FOR INTERNAL] ' : ''}ODSTĄPIENIE ${receiptRef} — ${fullName}`, internalText, shell('Nowe oświadczenie o odstąpieniu', internalBody))
    } catch (error) {
      console.error('[em-report] withdrawal internal email failed', error.message)
    }
  }
  console.log('[em-report] withdrawal receipt sent', receiptRef, testMode ? '(test mode)' : '')
  return { status: 200, payload: { ok: true, receiptRef, submittedAt: submittedAt.toISOString() } }
}

module.exports = { submitWithdrawal }
