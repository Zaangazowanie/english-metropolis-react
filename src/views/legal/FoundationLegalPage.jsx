import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { FOUNDATION, FOUNDATION_FOOTER_PL, FOUNDATION_FOOTER_EN } from './foundation-legal-content.js'
import './foundation-legal.css'

// Shared shell for the approved Twój StartUp legal documents. The Polish text
// is the binding version; when the UI language is English we show an
// explanatory notice above the (Polish) document rather than an unapproved
// translation.
export default function FoundationLegalPage({ titlePl, titleEn, docId, bodyHtml }) {
  const { lang } = useI18n()
  const isPl = lang === 'pl'
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 legal-page fl-page">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-sky-700 hover:text-sky-900">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          {isPl ? 'Wróć do aplikacji' : 'Back to the app'}
        </Link>
        <nav className="fl-siblings" aria-label="Legal documents">
          <Link to="/terms">{isPl ? 'Regulamin' : 'Terms'}</Link>
          <Link to="/privacy">{isPl ? 'Prywatność' : 'Privacy'}</Link>
          <Link to="/cookies">Cookies</Link>
        </nav>
      </div>

      <h1 className="font-headline text-3xl sm:text-4xl text-slate-900">{isPl ? titlePl : titleEn}</h1>
      <p className="mt-2 text-sm text-slate-500">
        {docId} · {isPl ? 'Obowiązuje od' : 'Effective from'}: {FOUNDATION.effectiveDate}
      </p>

      {!isPl && (
        <div className="fl-en-notice" role="note">
          <p><strong>English summary.</strong> englishmetro.com is operated by {FOUNDATION.name}
          {' '}(Warsaw, Poland — KRS {FOUNDATION.krs}, NIP {FOUNDATION.nip}) through its organised business
          unit EnglishMetro, represented by {FOUNDATION.rep}. The legally binding version of this document
          is the Polish text below, as approved by the Foundation's legal team. If you have any questions,
          write to <a href={`mailto:${FOUNDATION.email}`}>{FOUNDATION.email}</a> and we will gladly explain
          any clause in English.</p>
        </div>
      )}

      <article className="fl-doc" lang="pl" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

      <footer className="fl-foot">
        <p>{isPl ? FOUNDATION_FOOTER_PL : FOUNDATION_FOOTER_EN}</p>
      </footer>
    </div>
  )
}
