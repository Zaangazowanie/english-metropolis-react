import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'

export default function CookiePolicy() {
  const { t, lang } = useI18n()
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 legal-page">
      <div className="mb-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-sky-700 hover:text-sky-900">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          {t('legal.backToApp')}
        </Link>
      </div>
      <h1 className="font-headline text-3xl sm:text-4xl text-slate-900">{t('legal.cookies.title')}</h1>
      <p className="mt-2 text-sm text-slate-500">{t('legal.cookies.subtitle')} · {t('legal.lastUpdated')}: {t('legal.lastUpdatedDate')}</p>

      {lang === 'pl' ? <PolishBody /> : <EnglishBody />}
    </div>
  )
}

function EnglishBody() {
  return (
    <>
      <div className="mt-6 rounded-[1rem] border-2 border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs font-bold text-amber-900">⚠ Draft — pending legal review</p>
      </div>

      <Section title="What are cookies?">
        <p>
          Cookies are small text files that websites store in your browser. We also use browser
          <strong> localStorage</strong> and <strong>sessionStorage</strong> in the same way. Under Polish law
          (Art. 173 of the Telecommunications Law) and the EU ePrivacy Directive, we must ask your
          permission before storing anything beyond what's strictly necessary.
        </p>
      </Section>

      <Section title="Categories we use">
        <Category
          name="Strictly necessary"
          legalBasis="Art. 173(3) UŚŚU exemption — you cannot use the service without these"
          examples={[
            'em_consent_v1 — your consent choices on this page',
            'tts_voice — the voice you picked for the AI tutor (remembered so you don\'t re-pick each visit)',
            'Authentication session token',
          ]}
          duration="session to 1 year"
        />
        <Category
          name="Functional"
          legalBasis="Consent required"
          examples={[
            'Theme preference (light/dark)',
            'Flashcard shuffle state',
            'Last-viewed lesson',
          ]}
          duration="up to 1 year"
        />
        <Category
          name="Analytics"
          legalBasis="Consent required — opt in"
          examples={[
            'Anonymous bug & error tracking',
            'Page view counts',
            'Aggregate performance metrics',
          ]}
          duration="up to 13 months"
        />
        <Category
          name="Marketing"
          legalBasis="Consent required — opt in"
          examples={['Not currently used. Reserved for future newsletters and announcements.']}
          duration="—"
        />
      </Section>

      <Section title="Third-party cookies">
        <p>We do not set any third-party advertising or tracking cookies. External resources we use:</p>
        <ul>
          <li>Google Fonts — for Inter, Plus Jakarta Sans, and Material Symbols. Google does not receive your account data — only the font request.</li>
          <li>jsDelivr — for the SVG country flag icons. No cookies.</li>
          <li>Cloudflare — for CDN + security. Cloudflare sets cookies for bot filtering (strictly necessary).</li>
        </ul>
      </Section>

      <Section title="How to manage consent">
        <p>
          Click the <button type="button" onClick={() => window.__EM_OPEN_CONSENT && window.__EM_OPEN_CONSENT()} className="underline font-bold text-violet-700">manage cookies</button> link
          at the bottom of any page to change your choices, or clear your browser storage to reset everything.
        </p>
        <p>You can also disable cookies entirely in your browser settings — the app may still work but some preferences will reset every visit.</p>
      </Section>
    </>
  )
}

function PolishBody() {
  return (
    <>
      <div className="mt-6 rounded-[1rem] border-2 border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs font-bold text-amber-900">⚠️ TŁUMACZENIE ROBOCZE — wersja angielska jest wiążąca</p>
        <p className="mt-1 text-[12px] text-amber-800">
          Oczekuje na weryfikację przez polskiego prawnika ds. ochrony danych.
        </p>
      </div>

      <Section title="Czym są pliki cookies?">
        <p>
          Pliki cookies to niewielkie pliki tekstowe, które serwisy internetowe zapisują
          w Twojej przeglądarce. W ten sam sposób korzystamy także z mechanizmów
          <strong> localStorage</strong> oraz <strong>sessionStorage</strong> przeglądarki. Zgodnie
          z polskim prawem (art. 173 Prawa telekomunikacyjnego) oraz unijną dyrektywą o prywatności
          i łączności elektronicznej (ePrivacy) jesteśmy zobowiązani uzyskać Twoją zgodę przed
          zapisaniem jakichkolwiek danych wykraczających poza te ściśle niezbędne.
        </p>
      </Section>

      <Section title="Kategorie, z których korzystamy">
        <Category
          name="Ściśle niezbędne"
          legalBasis="Wyjątek z art. 173 ust. 3 ustawy — bez nich nie można korzystać z serwisu"
          examples={[
            'em_consent_v1 — zapisane wybory zgody na tej stronie',
            'tts_voice — wybrany głos tutora AI (zapamiętany, aby nie trzeba było wybierać go przy każdej wizycie)',
            'Token sesji uwierzytelniającej',
          ]}
          duration="od sesji do 1 roku"
        />
        <Category
          name="Funkcjonalne"
          legalBasis="Wymagana zgoda"
          examples={[
            'Preferencja motywu (jasny/ciemny)',
            'Stan tasowania fiszek',
            'Ostatnio wyświetlona lekcja',
          ]}
          duration="do 1 roku"
        />
        <Category
          name="Analityczne"
          legalBasis="Wymagana zgoda — opcja opt-in"
          examples={[
            'Anonimowe śledzenie błędów i awarii',
            'Liczba wyświetleń stron',
            'Zagregowane wskaźniki wydajności',
          ]}
          duration="do 13 miesięcy"
        />
        <Category
          name="Marketingowe"
          legalBasis="Wymagana zgoda — opcja opt-in"
          examples={['Obecnie nieużywane. Zarezerwowane na potrzeby przyszłych newsletterów i ogłoszeń.']}
          duration="—"
        />
      </Section>

      <Section title="Pliki cookies podmiotów trzecich">
        <p>Nie umieszczamy żadnych plików cookies reklamowych ani śledzących pochodzących od podmiotów trzecich. Korzystamy z następujących zasobów zewnętrznych:</p>
        <ul>
          <li>Google Fonts — dla czcionek Inter, Plus Jakarta Sans oraz Material Symbols. Google nie otrzymuje danych Twojego konta — wyłącznie żądanie pobrania czcionki.</li>
          <li>jsDelivr — dla ikon flag państw w formacie SVG. Bez plików cookies.</li>
          <li>Cloudflare — CDN i bezpieczeństwo. Cloudflare ustawia pliki cookies do filtrowania botów (ściśle niezbędne).</li>
        </ul>
      </Section>

      <Section title="Jak zarządzać zgodą">
        <p>
          Kliknij łącze <button type="button" onClick={() => window.__EM_OPEN_CONSENT && window.__EM_OPEN_CONSENT()} className="underline font-bold text-violet-700">zarządzaj cookies</button> u
          dołu każdej strony, aby zmienić swoje wybory, albo wyczyść pamięć przeglądarki, aby zresetować wszystkie ustawienia.
        </p>
        <p>Możesz również całkowicie wyłączyć obsługę plików cookies w ustawieniach przeglądarki — aplikacja nadal może działać, ale niektóre preferencje będą resetowane przy każdej wizycie.</p>
      </Section>
    </>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="font-headline text-xl text-slate-900 mb-3">{title}</h2>
      <div className="prose prose-sm text-slate-700 space-y-3 max-w-none">{children}</div>
    </section>
  )
}

function Category({ name, legalBasis, examples, duration }) {
  return (
    <div className="rounded-[1rem] border border-slate-200 bg-slate-50/40 px-4 py-3 my-3">
      <p className="font-bold text-slate-900">{name}</p>
      <p className="text-[11px] text-slate-500 mt-0.5"><strong>Legal basis:</strong> {legalBasis}</p>
      <p className="text-[11px] text-slate-500"><strong>Typical duration:</strong> {duration}</p>
      <ul className="mt-2 text-[12px] text-slate-700 list-disc pl-5">
        {examples.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
    </div>
  )
}
