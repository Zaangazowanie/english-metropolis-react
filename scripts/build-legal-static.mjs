#!/usr/bin/env node
// Bakes the approved Twój StartUp legal documents (single source:
// src/views/legal/foundation-legal-content.js) into the static
// public/{terms,privacy,cookies}/index.html pages, using the existing
// /legal/legal.css shell. Run after editing the content module:
//   node scripts/build-legal-static.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TERMS_TITLE_PL, TERMS_HTML_PL, TERMS_HTML_EN,
  PRIVACY_TITLE_PL, PRIVACY_HTML_PL, PRIVACY_HTML_EN,
  COOKIES_TITLE_PL, COOKIES_HTML_PL, COOKIES_HTML_EN,
  FOUNDATION, FOUNDATION_FOOTER_PL, FOUNDATION_FOOTER_EN, BINDING_NOTE_EN,
} from '../src/views/legal/foundation-legal-content.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const PAGES = [
  {
    dir: 'terms', docId: 'EM-LEGAL-03',
    effectiveEn: '29 July 2026', effectivePl: FOUNDATION.effectiveDate,
    titlePl: TERMS_TITLE_PL, titleEn: 'Terms of Service (Regulamin)',
    heroPl: 'Regulamin <em>serwisu.</em>', heroEn: 'The rules of the <em>platform.</em>',
    ledePl: 'Regulamin serwisu englishmetro.com prowadzonego przez Fundację Rozwoju Przedsiębiorczości „Twój StartUp” — warunki zamówień, płatności, odstąpienia od umowy i reklamacji.',
    ledeEn: 'The Terms of Service (Regulamin) of englishmetro.com, operated by Fundacja Rozwoju Przedsiębiorczości “Twój StartUp” — ordering, payments, withdrawal and complaints.',
    metaDesc: 'Regulamin serwisu englishmetro.com — Fundacja Rozwoju Przedsiębiorczości „Twój StartUp”, NIP 5213641211.',
    body: TERMS_HTML_PL,
    bodyEn: TERMS_HTML_EN,
  },
  {
    dir: 'privacy', docId: 'EM-LEGAL-01',
    effectiveEn: '23 July 2026', effectivePl: '23 lipca 2026 r.',
    titlePl: PRIVACY_TITLE_PL, titleEn: 'Privacy Policy (Polityka prywatności)',
    heroPl: 'Polityka <em>prywatności.</em>', heroEn: 'Your <em>privacy.</em>',
    ledePl: 'Kto jest administratorem Twoich danych, po co je przetwarzamy i jakie masz prawa (RODO).',
    ledeEn: 'Who controls your personal data, why we process it and your GDPR rights.',
    metaDesc: 'Polityka prywatności serwisu englishmetro.com — administrator: Fundacja Rozwoju Przedsiębiorczości „Twój StartUp”.',
    body: PRIVACY_HTML_PL,
    bodyEn: PRIVACY_HTML_EN,
  },
  {
    dir: 'cookies', docId: 'EM-LEGAL-02',
    effectiveEn: '23 July 2026', effectivePl: '23 lipca 2026 r.',
    titlePl: COOKIES_TITLE_PL, titleEn: 'Cookies Policy (Polityka Cookies)',
    heroPl: 'Polityka <em>cookies.</em>', heroEn: 'Cookies <em>policy.</em>',
    ledePl: 'Jakie pliki cookies wykorzystuje serwis englishmetro.com i jak możesz nimi zarządzać.',
    ledeEn: 'Which cookies englishmetro.com uses and how you can manage them.',
    metaDesc: 'Polityka cookies serwisu englishmetro.com — Fundacja Rozwoju Przedsiębiorczości „Twój StartUp”.',
    body: COOKIES_HTML_PL,
    bodyEn: COOKIES_HTML_EN,
  },
]

const page = (p) => `<!DOCTYPE html>
<html class="light" lang="pl" data-lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>${p.titlePl} — English Metro.</title>
  <meta name="description" content="${p.metaDesc}" />
  <meta name="robots" content="index, follow" />
  <link href="/fonts/fonts.css" rel="stylesheet" />
  <link href="/legal/legal.css?v=20260723" rel="stylesheet" />
  <link href="/legal/foundation-legal.css?v=20260723" rel="stylesheet" />
  <script src="/legal/legal.js" defer></script>
</head>
<body>

  <header class="legal-topbar">
    <a class="legal-wordmark" href="/">English <em>Metro.</em></a>
    <nav class="legal-topnav">
      <a href="/privacy/"${p.dir === 'privacy' ? ' aria-current="page"' : ''}><span class="lang-en">Privacy</span><span class="lang-pl">Prywatność</span></a>
      <a href="/cookies/"${p.dir === 'cookies' ? ' aria-current="page"' : ''}><span class="lang-en">Cookies</span><span class="lang-pl">Cookies</span></a>
      <a href="/terms/"${p.dir === 'terms' ? ' aria-current="page"' : ''}><span class="lang-en">Terms</span><span class="lang-pl">Regulamin</span></a>
      <a href="/withdraw"><span class="lang-en">Withdraw online</span><span class="lang-pl">Odstąp online</span></a>
      <span class="lang-toggle" role="group" aria-label="Language">
        <button type="button" data-lang="en">EN</button>
        <button type="button" data-lang="pl">PL</button>
      </span>
    </nav>
  </header>

  <div class="legal-hero">
    <div class="legal-hero-inner">
      <div class="legal-doc-meta">
        <span>DOC <strong>${p.docId}</strong></span>
        <span class="lang-en">Effective from <strong>${p.effectiveEn}</strong></span>
        <span class="lang-pl">Obowiązuje od <strong>${p.effectivePl}</strong></span>
        <span class="lang-en">Applies to <strong>englishmetro.com</strong></span>
        <span class="lang-pl">Dotyczy <strong>englishmetro.com</strong></span>
      </div>
      <div class="lang-en">
        <h1>${p.heroEn}</h1>
        <p class="lede">${p.ledeEn}</p>
      </div>
      <div class="lang-pl">
        <h1>${p.heroPl}</h1>
        <p class="lede">${p.ledePl}</p>
      </div>
    </div>
  </div>

  <div class="legal-layout">
    <main class="legal-main">
      <div class="lang-en">
        <div class="fl-en-notice" role="note">
          <p><strong>Courtesy translation.</strong> ${BINDING_NOTE_EN}
          Questions? Write to <a href="mailto:${FOUNDATION.email}">${FOUNDATION.email}</a>.</p>
        </div>
        <article class="fl-doc fl-page" lang="en">
${p.bodyEn}
        </article>
      </div>
      <div class="lang-pl">
        <article class="fl-doc fl-page" lang="pl">
${p.body}
        </article>
      </div>
    </main>
  </div>

  <footer class="legal-footer">
    <div class="legal-footer-inner">
      <div>
        <span class="lang-en">${FOUNDATION_FOOTER_EN}</span>
        <span class="lang-pl">${FOUNDATION_FOOTER_PL}</span>
      </div>
      <nav>
        <a href="/"><span class="lang-en">Home</span><span class="lang-pl">Strona główna</span></a>
        <a href="/privacy/"><span class="lang-en">Privacy Policy</span><span class="lang-pl">Polityka prywatności</span></a>
        <a href="/cookies/"><span class="lang-en">Cookies Policy</span><span class="lang-pl">Polityka cookies</span></a>
        <a href="/terms/"><span class="lang-en">Terms of Service</span><span class="lang-pl">Regulamin</span></a>
        <a class="fl-withdraw-cta" href="/withdraw"><span class="lang-en">Withdraw from a contract here</span><span class="lang-pl">Odstąp od umowy tutaj</span></a>
        <a href="mailto:${FOUNDATION.email}">${FOUNDATION.email}</a>
      </nav>
    </div>
  </footer>

  <a class="fl-static-withdraw" href="/withdraw">
    <span class="lang-en">Withdraw from a contract here</span>
    <span class="lang-pl">Odstąp od umowy tutaj</span>
    <small class="lang-en">Online withdrawal function</small>
    <small class="lang-pl">Funkcja odstąpienia online</small>
  </a>

</body>
</html>
`

for (const p of PAGES) {
  const dir = join(ROOT, 'public', p.dir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), page(p))
  console.log(`wrote public/${p.dir}/index.html`)
}
// The static pages reference /legal/foundation-legal.css — copy the module CSS
// into public/legal/ so both the SPA bundle and the static shell share it.
import { copyFileSync } from 'node:fs'
copyFileSync(join(ROOT, 'src/views/legal/foundation-legal.css'), join(ROOT, 'public/legal/foundation-legal.css'))
console.log('copied foundation-legal.css → public/legal/')
