#!/usr/bin/env node
// Bakes the approved Twój StartUp legal documents (single source:
// src/views/legal/foundation-legal-content.js) into the static
// public/{terms,privacy,cookies,kontakt}/index.html pages, using the shared
// /legal/legal.css shell, and keeps the header/footer shell of the
// hand-written cold pages (public/faq, public/ochrona-dzieci) in sync through
// <!-- em-shell:header --> / <!-- em-shell:footer --> markers.
// Run after editing the content module, the shell, or a hand-written page:
//   node scripts/build-legal-static.mjs
import { writeFileSync, mkdirSync, readFileSync, existsSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TERMS_TITLE_PL, TERMS_HTML_PL, TERMS_HTML_EN,
  PRIVACY_TITLE_PL, PRIVACY_HTML_PL, PRIVACY_HTML_EN,
  COOKIES_TITLE_PL, COOKIES_HTML_PL, COOKIES_HTML_EN,
  CONTACT_TITLE_PL, CONTACT_HTML_PL, CONTACT_HTML_EN,
  FOUNDATION, FOUNDATION_FOOTER_PL, FOUNDATION_FOOTER_EN, BINDING_NOTE_EN,
} from '../src/views/legal/foundation-legal-content.js'
import { prepareLegalDoc, wrapTables } from '../src/views/legal/legal-toc.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ASSET_V = '20260903'
const SITE = 'https://englishmetro.com'
const OG_IMAGE = `${SITE}/brand/em-og-card.jpg?v=1`
// Bajla's official WhatsApp line (src/components/BajlaConnectModal.jsx BAJLA_NUMBER).
const BAJLA_WA = 'https://wa.me/48787126561'
const PAYPRO_PL = 'Operatorem płatności online jest PayPro S.A., ul. Pastelowa 8, 60-198 Poznań, KRS 0000347935, NIP 7792369887, REGON 301345068 (Przelewy24).'
const PAYPRO_EN = 'Online payments are operated by PayPro S.A., ul. Pastelowa 8, 60-198 Poznań, KRS 0000347935, NIP 7792369887, REGON 301345068 (Przelewy24).'

const ICON = {
  menu: '<svg class="ico-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg class="ico-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8Zm-3 4.4c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.5 0 1.7-.7 1.9-1.4.3-.7.3-1.2.2-1.4l-1.9-.9c-.3-.1-.4-.1-.6.1l-.9 1.1c-.2.2-.3.2-.6.1a6.7 6.7 0 0 1-3.4-3c-.2-.4 0-.5.1-.7l.6-.8c.1-.2 0-.4 0-.5l-.9-2c-.2-.5-.4-.4-.5-.4Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/></svg>',
}

const bi = (en, pl) => `<span class="lang-en">${en}</span><span class="lang-pl">${pl}</span>`

// ── Shared shell ─────────────────────────────────────────────────────────────
export function headMeta({ titlePl, titleEn, path, metaDesc, metaDescEn }) {
  const url = `${SITE}${path}`
  return `  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${titlePl} | English Metro.</title>
  <meta name="description" content="${metaDesc}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#A21CAF" />
  <link rel="icon" type="image/x-icon" href="/favicon.ico?v=4" />
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=4" />
  <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png?v=4" />
  <link rel="apple-touch-icon" sizes="180x180" href="/icon-apple-180.png?v=4" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="English Metro." />
  <meta property="og:locale" content="pl_PL" />
  <meta property="og:locale:alternate" content="en_GB" />
  <meta property="og:title" content="${titlePl} | English Metro." />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${titleEn} | English Metro." />
  <meta name="twitter:description" content="${metaDescEn || metaDesc}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />
  <link rel="preload" href="/fonts/fonts.css" as="style" />
  <link href="/fonts/fonts.css" rel="stylesheet" />
  <link href="/legal/legal.css?v=${ASSET_V}" rel="stylesheet" />
  <link href="/legal/foundation-legal.css?v=${ASSET_V}" rel="stylesheet" />
  <script src="/legal/legal.js?v=${ASSET_V}" defer></script>`
}

// Same links as the SPA landing header: home, about, FAQ, pricing, contact,
// sign in, sign up. `current` marks the page we are on.
export function header(current) {
  const cur = (p) => (p === current ? ' aria-current="page"' : '')
  return `<!-- em-shell:header -->
  <header class="legal-topbar">
    <a class="legal-wordmark" href="/">English <em>Metro.</em></a>
    <nav class="legal-topnav" id="site-nav" aria-label="English Metro">
      <a href="/about/"${cur('/about/')}>${bi('About', 'O nas')}</a>
      <a href="/faq/"${cur('/faq/')}>${bi('FAQ', 'Pytania')}</a>
      <a href="/pricing">${bi('Pricing', 'Cennik')}</a>
      <a href="/kontakt/"${cur('/kontakt/')}>${bi('Contact', 'Kontakt')}</a>
      <span class="nav-sep" aria-hidden="true"></span>
      <a href="/login">${bi('Sign in', 'Logowanie')}</a>
      <a class="nav-cta" href="/signup">${bi('Sign up', 'Zapisz się')}</a>
    </nav>
    <div class="legal-topbar-right">
      <span class="lang-toggle" role="group" aria-label="Language">
        <button type="button" data-lang="en" aria-pressed="false">EN</button>
        <button type="button" data-lang="pl" aria-pressed="true">PL</button>
      </span>
      <button type="button" class="legal-menu-btn" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">${ICON.menu}${ICON.close}</button>
    </div>
  </header>
  <!-- /em-shell:header -->`
}

export function footer(current) {
  const cur = (p) => (p === current ? ' aria-current="page"' : '')
  return `<!-- em-shell:footer -->
  <footer class="legal-footer">
    <div class="legal-footer-inner">
      <div class="legal-footer-grid">
        <div class="legal-footer-brand">
          <a class="legal-wordmark" href="/">English <em>Metro.</em></a>
          <p class="lang-en">Live one-to-one English lessons online with your own teacher, from A2 to C1.</p>
          <p class="lang-pl">Lekcje angielskiego jeden na jeden, online i na żywo, z Twoim lektorem, od A2 do C1.</p>
          <div class="legal-footer-contact">
            <a class="is-wa" href="${BAJLA_WA}" target="_blank" rel="noopener">${ICON.wa}${bi('Bajla on WhatsApp', 'Bajla na WhatsAppie')}</a>
            <a href="mailto:${FOUNDATION.email}">${ICON.mail}${FOUNDATION.email}</a>
            <a href="tel:+48662563507">${ICON.phone}${FOUNDATION.phone}</a>
          </div>
        </div>
        <div>
          <h2>${bi('School', 'Szkoła')}</h2>
          <nav aria-label="School">
            <a href="/">${bi('Home', 'Strona główna')}</a>
            <a href="/about/"${cur('/about/')}>${bi('About us', 'O nas')}</a>
            <a href="/faq/"${cur('/faq/')}>${bi('FAQ', 'Najczęstsze pytania')}</a>
            <a href="/pricing">${bi('Pricing', 'Cennik')}</a>
            <a href="/login">${bi('Sign in', 'Logowanie')}</a>
            <a href="/signup">${bi('Sign up', 'Zapisz się')}</a>
          </nav>
        </div>
        <div>
          <h2>${bi('Documents', 'Dokumenty')}</h2>
          <nav aria-label="Legal">
            <a href="/terms/"${cur('/terms/')}>${bi('Terms of Service', 'Regulamin')}</a>
            <a href="/privacy/"${cur('/privacy/')}>${bi('Privacy Policy', 'Polityka prywatności')}</a>
            <a href="/cookies/"${cur('/cookies/')}>${bi('Cookies Policy', 'Polityka cookies')}</a>
            <a href="/ochrona-dzieci/"${cur('/ochrona-dzieci/')}>${bi('Child protection', 'Ochrona dzieci')}</a>
            <a href="/kontakt/"${cur('/kontakt/')}>${bi('Contact and company details', 'Kontakt i dane firmy')}</a>
            <a class="fl-withdraw-cta" href="/withdraw">${bi('Withdraw from a contract', 'Odstąp od umowy')}</a>
          </nav>
        </div>
      </div>
      <div class="legal-footer-legal">
        <p>${bi(FOUNDATION_FOOTER_EN, FOUNDATION_FOOTER_PL)}</p>
        <p>${bi(PAYPRO_EN, PAYPRO_PL)}</p>
      </div>
    </div>
  </footer>
  <!-- /em-shell:footer -->`
}

const tocList = (toc, cls) => `      <ol class="${cls}">
${toc.map((t) => `        <li><a href="#${t.id}">${t.title}</a></li>`).join('\n')}
      </ol>`

// ── Pages ────────────────────────────────────────────────────────────────────
const PAGES = [
  {
    dir: 'terms', docId: 'EM-LEGAL-03',
    effectiveEn: FOUNDATION.effectiveDateEn, effectivePl: FOUNDATION.effectiveDate,
    titlePl: TERMS_TITLE_PL, titleEn: 'Terms of Service (Regulamin)',
    heroPl: 'Regulamin <em>serwisu.</em>', heroEn: 'The rules of the <em>platform.</em>',
    ledePl: 'Regulamin serwisu englishmetro.com prowadzonego przez Fundację Rozwoju Przedsiębiorczości „Twój StartUp”: warunki zamówień, płatności, odstąpienia od umowy i reklamacji. Wersja polska jest wiążąca.',
    ledeEn: 'The Terms of Service (Regulamin) of englishmetro.com, operated by Fundacja Rozwoju Przedsiębiorczości “Twój StartUp”: ordering, payments, withdrawal and complaints. The Polish text is the binding version.',
    metaDesc: 'Regulamin serwisu englishmetro.com: zamówienia, płatności, odwoływanie lekcji, odstąpienie od umowy i reklamacje. Fundacja Rozwoju Przedsiębiorczości „Twój StartUp”, NIP 5213641211.',
    metaDescEn: 'Terms of Service of englishmetro.com: ordering, payments, lesson cancellation, withdrawal and complaints. Polish version binding.',
    body: TERMS_HTML_PL, bodyEn: TERMS_HTML_EN,
  },
  {
    dir: 'privacy', docId: 'EM-LEGAL-01',
    effectiveEn: '23 July 2026', effectivePl: '23 lipca 2026 r.',
    titlePl: PRIVACY_TITLE_PL, titleEn: 'Privacy Policy (Polityka prywatności)',
    heroPl: 'Polityka <em>prywatności.</em>', heroEn: 'Your <em>privacy.</em>',
    ledePl: 'Kto jest administratorem Twoich danych, po co je przetwarzamy i jakie masz prawa (RODO).',
    ledeEn: 'Who controls your personal data, why we process it and your GDPR rights.',
    metaDesc: 'Polityka prywatności serwisu englishmetro.com: administrator danych, cele przetwarzania, odbiorcy, okresy przechowywania i prawa RODO.',
    metaDescEn: 'Privacy Policy of englishmetro.com: data controller, purposes, recipients, retention and your GDPR rights.',
    body: PRIVACY_HTML_PL, bodyEn: PRIVACY_HTML_EN,
  },
  {
    dir: 'cookies', docId: 'EM-LEGAL-02',
    effectiveEn: '23 July 2026', effectivePl: '23 lipca 2026 r.',
    titlePl: COOKIES_TITLE_PL, titleEn: 'Cookies Policy (Polityka Cookies)',
    heroPl: 'Polityka <em>cookies.</em>', heroEn: 'Cookies <em>policy.</em>',
    ledePl: 'Jakie pliki cookies wykorzystuje serwis englishmetro.com i jak możesz nimi zarządzać.',
    ledeEn: 'Which cookies englishmetro.com uses and how you can manage them.',
    metaDesc: 'Polityka cookies serwisu englishmetro.com: rodzaje plików cookies, czas przechowywania i sposoby zarządzania nimi.',
    metaDescEn: 'Cookies Policy of englishmetro.com: cookie types, retention and how to manage them.',
    body: COOKIES_HTML_PL, bodyEn: COOKIES_HTML_EN,
  },
  {
    // A contact page, not a legal instrument: no DOC id (EM-LEGAL-04 is the
    // lesson-analysis notice), no "effective from".
    dir: 'kontakt', contact: true, noEnNotice: true,
    titlePl: CONTACT_TITLE_PL, titleEn: 'Contact and company details',
    heroPl: 'Napisz do <em>nas.</em>', heroEn: 'Get in <em>touch.</em>',
    ledePl: 'E-mail, WhatsApp i telefon, a niżej pełne dane podmiotu prowadzącego englishmetro.com: nazwa, numery rejestrowe i adresy do doręczeń.',
    ledeEn: 'Email, WhatsApp and phone, followed by the full details of the company operating englishmetro.com: name, registration numbers and postal addresses.',
    metaDesc: 'Kontakt z English Metro: support@englishmetro.com, Bajla na WhatsAppie, tel. +48 662 563 507. Dane firmy: Fundacja Rozwoju Przedsiębiorczości „Twój StartUp”, KRS 0000442857, NIP 5213641211.',
    metaDescEn: 'Contact English Metro: support@englishmetro.com, Bajla on WhatsApp, +48 662 563 507. Company details: Fundacja Rozwoju Przedsiębiorczości „Twój StartUp”, KRS 0000442857, NIP 5213641211.',
    body: CONTACT_HTML_PL, bodyEn: CONTACT_HTML_EN,
  },
]

// Contact channels: what each one is for and how fast we answer (the 14-day
// email and complaint promise is the Regulamin's, repeated in CONTACT_HTML).
const channelsHtml = (en) => `
<section class="fl-sec" id="${en ? 'channels' : 'kanaly'}">
<h2>${en ? 'How to reach us' : 'Jak się z nami skontaktować'}</h2>
<div class="legal-channels">
  <a class="legal-channel" href="mailto:${FOUNDATION.email}">
    <span class="label">${en ? 'Email' : 'E-mail'}</span>
    <span class="value">${FOUNDATION.email}</span>
    <span class="hint">${en
      ? 'Bookings, invoices, complaints, anything about your account. Polish or English. We reply within 14 days at the latest, usually much sooner.'
      : 'Rezerwacje, faktury, reklamacje, wszystko o Twoim koncie. Po polsku albo po angielsku. Odpowiadamy najpóźniej w ciągu 14 dni, zwykle znacznie szybciej.'}</span>
  </a>
  <a class="legal-channel is-wa" href="${BAJLA_WA}" target="_blank" rel="noopener">
    <span class="label">WhatsApp</span>
    <span class="value">${en ? 'Bajla, our assistant' : 'Bajla, nasza asystentka'}</span>
    <span class="hint">${en
      ? 'Answers questions about the school around the clock. Students with the AI lesson analysis add-on also book, move and cancel lessons and get their notes here.'
      : 'Odpowiada na pytania o szkole przez całą dobę. Uczniowie z dodatkiem analizy lekcji AI rezerwują, przekładają i odwołują tu lekcje oraz dostają notatki.'}</span>
  </a>
  <a class="legal-channel" href="tel:+48662563507">
    <span class="label">${en ? 'Phone' : 'Telefon'}</span>
    <span class="value">${FOUNDATION.phone}</span>
    <span class="hint">${en ? 'Business days. If nobody picks up, email is the surest route.' : 'W dni robocze. Jeśli nie odbieramy, najpewniejszą drogą jest e-mail.'}</span>
  </a>
</div>
<p>${en
  ? `Complaints and withdrawal statements can also be sent by post to the service address below. The <a href="/withdraw">online withdrawal form</a> needs no sign-in and confirms receipt by email at once.`
  : `Reklamacje i oświadczenia o odstąpieniu od umowy możesz też wysłać pocztą na adres do doręczeń podany niżej. <a href="/withdraw">Formularz odstąpienia online</a> nie wymaga logowania i od razu potwierdza odbiór e-mailem.`}</p>
</section>
`

const heroActions = () => `
      <div class="legal-hero-actions">
        <a class="legal-action is-wa" href="${BAJLA_WA}" target="_blank" rel="noopener">${ICON.wa}${bi('Message Bajla on WhatsApp', 'Napisz do Bajli na WhatsAppie')}</a>
        <a class="legal-action" href="mailto:${FOUNDATION.email}">${ICON.mail}${FOUNDATION.email}</a>
        <a class="legal-action" href="tel:+48662563507">${ICON.phone}${FOUNDATION.phone}</a>
      </div>`

const page = (p) => {
  const path = `/${p.dir}/`
  const pl = prepareLegalDoc(wrapTables((p.contact ? channelsHtml(false) : '') + p.body), '')
  const en = prepareLegalDoc(wrapTables((p.contact ? channelsHtml(true) : '') + p.bodyEn), '-en')
  const meta = p.contact
    ? `        <span class="lang-en">Contact and company details</span>
        <span class="lang-pl">Kontakt i dane firmy</span>
        <span class="lang-en">Applies to <strong>englishmetro.com</strong></span>
        <span class="lang-pl">Dotyczy <strong>englishmetro.com</strong></span>`
    : `        <span>DOC <strong>${p.docId}</strong></span>
        <span class="lang-en">Effective from <strong>${p.effectiveEn}</strong></span>
        <span class="lang-pl">Obowiązuje od <strong>${p.effectivePl}</strong></span>
        <span class="lang-en">Applies to <strong>englishmetro.com</strong></span>
        <span class="lang-pl">Dotyczy <strong>englishmetro.com</strong></span>`
  return `<!DOCTYPE html>
<html class="light" lang="pl" data-lang="pl">
<head>
${headMeta({ titlePl: p.titlePl, titleEn: p.titleEn, path, metaDesc: p.metaDesc, metaDescEn: p.metaDescEn })}
  <!-- Generated by scripts/build-legal-static.mjs from src/views/legal/foundation-legal-content.js. Do not hand-edit. -->
</head>
<body>

${header(path)}

  <div class="legal-hero">
    <div class="legal-hero-inner">
      <div class="legal-doc-meta">
${meta}
      </div>
      <div class="lang-en">
        <h1>${p.heroEn}</h1>
        <p class="lede">${p.ledeEn}</p>${p.contact ? heroActions() : ''}
      </div>
      <div class="lang-pl">
        <h1>${p.heroPl}</h1>
        <p class="lede">${p.ledePl}</p>${p.contact ? heroActions() : ''}
      </div>
    </div>
  </div>

  <div class="legal-body">
    <nav class="legal-toc" aria-label="Contents">
      <div class="toc-label"><span class="lang-en">On this page</span><span class="lang-pl">Na tej stronie</span></div>
${tocList(en.toc, 'lang-en')}
${tocList(pl.toc, 'lang-pl')}
    </nav>
    <main class="legal-content">
      <div class="lang-en">
${p.noEnNotice ? '' : `        <div class="fl-en-notice" role="note">
          <p><strong>Courtesy translation.</strong> ${BINDING_NOTE_EN}
          Questions? Write to <a href="mailto:${FOUNDATION.email}">${FOUNDATION.email}</a>.</p>
        </div>`}
        <article class="fl-doc fl-page" lang="en">
${en.html}
        </article>
      </div>
      <div class="lang-pl">
        <article class="fl-doc fl-page" lang="pl">
${pl.html}
        </article>
      </div>
    </main>
  </div>

${footer(path)}

</body>
</html>
`
}

// Cloudflare Scrape Shield rewrites mailto links and bare addresses into
// /cdn-cgi/l/email-protection, which only resolves once its JS runs. Przelewy24
// verification requires the contact address to be readable in the served HTML,
// so mark every address on these pages with Cloudflare's documented opt-out
// (<!--email_off-->). Obfuscation stays on for the rest of the zone.
const MAILTO_ANCHOR = /<a\b[^>]*href="mailto:[^"]*"[^>]*>[\s\S]*?<\/a>/g
const BARE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const OFF = (s) => `<!--email_off-->${s}<!--/email_off-->`
// The NUL character cannot occur in the source documents, so it is a safe
// sentinel. A bare numeric placeholder would also match section numbers like "§ 3 ".
const NUL = String.fromCharCode(0)
const PLACEHOLDER = new RegExp(`${NUL}(\\d+)${NUL}`, 'g')

function shieldEmails(html) {
  const held = []
  // Strip any earlier opt-out markers first so re-runs never nest them.
  let out = html.replace(/<!--\/?email_off-->/g, '')
  out = out.replace(MAILTO_ANCHOR, (m) => `${NUL}${held.push(m) - 1}${NUL}`)
  out = out.replace(BARE_EMAIL, OFF)
  out = out.replace(PLACEHOLDER, (_, i) => OFF(held[Number(i)]))
  if (out.includes(NUL)) throw new Error('shieldEmails: unrestored placeholder')
  return out
}

for (const p of PAGES) {
  const dir = join(ROOT, 'public', p.dir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), shieldEmails(page(p)))
  console.log(`wrote public/${p.dir}/index.html`)
}

// Hand-written cold pages carry the same shell between markers. Sync it so a
// nav or footer change lands everywhere in one run. /about/ joined the list on
// 2026-09-04 once its header and footer carried the markers.
for (const dir of ['faq', 'ochrona-dzieci', 'about']) {
  const file = join(ROOT, 'public', dir, 'index.html')
  if (!existsSync(file)) continue
  const before = readFileSync(file, 'utf8')
  const path = `/${dir}/`
  let after = before
    .replace(/<!-- em-shell:header -->[\s\S]*?<!-- \/em-shell:header -->/, () => header(path))
    .replace(/<!-- em-shell:footer -->[\s\S]*?<!-- \/em-shell:footer -->/, () => footer(path))
  if (after === before) {
    console.log(`public/${dir}/index.html: no shell markers, left untouched`)
    continue
  }
  after = shieldEmails(after)
  writeFileSync(file, after)
  console.log(`synced shell in public/${dir}/index.html`)
}

// The static pages reference /legal/foundation-legal.css: copy the module CSS
// into public/legal/ so both the SPA bundle and the static shell share it.
copyFileSync(join(ROOT, 'src/views/legal/foundation-legal.css'), join(ROOT, 'public/legal/foundation-legal.css'))
console.log('copied foundation-legal.css to public/legal/')
