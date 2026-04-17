import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'

/**
 * EU GDPR + Polish UŚŚU privacy policy.
 *
 * ⚠️  TEMPLATE — THIS IS A STRUCTURED DRAFT, NOT A LEGAL OPINION.
 * Mike (data controller) must review with a Polish data protection lawyer
 * before the site goes live to EU users. All controller-specific fields
 * (company name, registration number, DPO contact, address) are currently
 * placeholders wrapped in {PLACEHOLDER} markers — fill these in before
 * shipping to production.
 */
export default function PrivacyPolicy() {
  const { t, lang } = useI18n()
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 legal-page">
      <div className="mb-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-sky-700 hover:text-sky-900">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          {t('legal.backToApp')}
        </Link>
      </div>
      <h1 className="font-headline text-3xl sm:text-4xl text-slate-900">{t('legal.privacy.title')}</h1>
      <p className="mt-2 text-sm text-slate-500">{t('legal.privacy.subtitle')} · {t('legal.lastUpdated')}: {t('legal.lastUpdatedDate')}</p>

      {lang === 'pl' ? <PolishBody /> : <EnglishBody />}
    </div>
  )
}

function EnglishBody() {
  return (
    <>
      <div className="mt-6 rounded-[1rem] border-2 border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs font-bold text-amber-900">⚠ Draft — pending legal review</p>
        <p className="mt-1 text-[12px] text-amber-800">
          This policy is a structured template. Before production launch it must be reviewed and
          signed off by a Polish data protection lawyer (UODO-registered preferred). Any place marked
          with {'{PLACEHOLDER}'} must be filled in before publication.
        </p>
      </div>

      <Section title="1. Who we are (Data Controller)">
        <p>
          The data controller (administrator danych osobowych) for personal data collected through
          <strong> englishmetro.com</strong> is:
        </p>
        <ul>
          <li><strong>{'{LEGAL_ENTITY_NAME}'}</strong></li>
          <li>Registered office: {'{REGISTERED_ADDRESS}'}, Poland</li>
          <li>NIP: {'{NIP}'} · REGON: {'{REGON}'} · KRS: {'{KRS_IF_APPLICABLE}'}</li>
          <li>Email for privacy matters: <a href="mailto:privacy@englishmetro.com">privacy@englishmetro.com</a></li>
        </ul>
        <p>
          You have the right to contact the Polish supervisory authority (Prezes Urzędu Ochrony
          Danych Osobowych, UODO) at any time: <a href="https://uodo.gov.pl" target="_blank" rel="noreferrer">uodo.gov.pl</a>.
        </p>
      </Section>

      <Section title="2. What data we process">
        <p>When you use English Metropolis, we process the following categories of personal data:</p>
        <ul>
          <li><strong>Account data:</strong> your name, email, student slug, school, language level.</li>
          <li><strong>Lesson data:</strong> transcripts, analyses, strengths, errors, verbatim quotes, lesson dates, PDF exports.</li>
          <li><strong>Learning state:</strong> flashcard mastery, quiz scores, drill attempts, free-write submissions.</li>
          <li><strong>Voice data:</strong> short audio clips you record with the AI tutor are transcribed by our ASR (Whisper) running on our own servers, passed to Kimi K2.5 for coaching, and TTS is synthesized locally with Kokoro. Raw audio is deleted from disk after the response is generated (within minutes).</li>
          <li><strong>Technical data:</strong> IP address, browser type, device model, language, time zone (for security and debugging).</li>
          <li><strong>Cookies / local storage:</strong> session token, voice preference, theme, consent record. See our <Link to="/cookies" className="underline">Cookie Policy</Link>.</li>
        </ul>
      </Section>

      <Section title="3. Why we process it (legal bases under GDPR Art. 6)">
        <ul>
          <li><strong>Contract (Art. 6(1)(b)):</strong> to deliver the English tuition service you signed up for, including grading, analysis, and the AI tutor.</li>
          <li><strong>Legitimate interest (Art. 6(1)(f)):</strong> product improvement, security monitoring, fraud prevention. You can object at any time.</li>
          <li><strong>Consent (Art. 6(1)(a)):</strong> optional analytics, future marketing emails. You can withdraw consent instantly via the banner in the footer.</li>
          <li><strong>Legal obligation (Art. 6(1)(c)):</strong> accounting records (Polish law, 5 years).</li>
        </ul>
      </Section>

      <Section title="4. Who we share data with (processors)">
        <p>We use the following sub-processors. Each has a signed DPA (data processing agreement):</p>
        <ul>
          <li><strong>Convex</strong> (database) — lessons, analyses, keywords, student records. Stored in {'{CONVEX_REGION}'}. DPA: {'{LINK_OR_TBD}'}.</li>
          <li><strong>Cloudflare</strong> (CDN + DNS + WAF) — request routing, bot filtering. Standard Cloudflare DPA applies.</li>
          <li><strong>Kimi (Moonshot AI)</strong> — LLM coaching via api.kimi.com. Your lesson context is sent to generate responses. Kimi does not store prompts for training per our API agreement. {'{VERIFY_CONTRACT_TERMS}'}</li>
          <li><strong>Kokoro TTS</strong> — runs on our own servers. No third party involved.</li>
          <li><strong>Whisper ASR</strong> — runs on our own servers. No third party involved.</li>
          <li><strong>Monexus Media</strong> — infrastructure hosting. EU / {'{HOSTING_LOCATION}'}.</li>
        </ul>
        <p>We do NOT sell your data. We do NOT share it with advertisers. We do NOT use it to train third-party AI models.</p>
      </Section>

      <Section title="5. International transfers">
        <p>
          Some of our sub-processors (Kimi) are based outside the EU/EEA. Transfers are protected by
          Standard Contractual Clauses (SCCs) under Art. 46 GDPR and additional safeguards including
          request minimisation (we send only the specific lesson context needed for the student's query,
          never PII beyond the first name). {'{REVIEW_SCCS}'}
        </p>
      </Section>

      <Section title="6. How long we keep your data">
        <ul>
          <li><strong>Active account data:</strong> for as long as your account is active + 30 days after closure.</li>
          <li><strong>Lesson transcripts & analyses:</strong> 2 years after the lesson date unless you request earlier deletion.</li>
          <li><strong>Voice audio:</strong> deleted within minutes of response generation. Never persisted long-term.</li>
          <li><strong>Server logs:</strong> 30 days.</li>
          <li><strong>Accounting records:</strong> 5 years (Polish tax law requirement).</li>
        </ul>
      </Section>

      <Section title="7. Your rights (GDPR Art. 15-22)">
        <p>You have the right to:</p>
        <ul>
          <li><strong>Access</strong> your personal data (Art. 15) — email privacy@englishmetro.com for a data export.</li>
          <li><strong>Rectification</strong> of incorrect data (Art. 16) — edit your profile or email us.</li>
          <li><strong>Erasure</strong> ("right to be forgotten", Art. 17) — request account deletion.</li>
          <li><strong>Restrict processing</strong> (Art. 18).</li>
          <li><strong>Data portability</strong> (Art. 20) — download your lessons and analyses in JSON format.</li>
          <li><strong>Object</strong> to processing based on legitimate interest (Art. 21).</li>
          <li><strong>Withdraw consent</strong> at any time (Art. 7(3)) — via the cookie banner in the footer.</li>
          <li><strong>Complain</strong> to the Polish supervisory authority (UODO, uodo.gov.pl).</li>
        </ul>
        <p>We respond to rights requests within 30 days as required by Art. 12(3).</p>
      </Section>

      <Section title="8. Children">
        <p>
          Our service is intended for users aged 16+. If a student is under 16, we require verifiable
          parental consent (Art. 8 GDPR) before processing their data. We currently teach students
          who are 17+ with parental oversight, and all minors' data is processed under the guardian's
          active consent.
        </p>
      </Section>

      <Section title="9. Security">
        <p>
          All traffic is encrypted in transit via HTTPS. Data at rest in Convex is encrypted. Access
          to lesson transcripts is restricted to the teacher (Mike), the student, and our engineering
          team. Passwords are never logged. API keys are rotated on staff changes.
        </p>
      </Section>

      <Section title="10. Changes to this policy">
        <p>
          If we materially change this policy, we'll notify you at your registered email and show a
          new consent banner. Minor edits (typos, clarifications) will only update the "Last updated"
          date above.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          Questions about privacy? Email <a href="mailto:privacy@englishmetro.com">privacy@englishmetro.com</a> or write to
          the registered office address above. We aim to respond within 3 working days.
        </p>
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
          Oczekuje na weryfikację przez polskiego prawnika ds. ochrony danych. Niniejsza polityka
          jest ustrukturyzowanym wzorcem. Przed wdrożeniem produkcyjnym musi zostać zweryfikowana
          i zaakceptowana przez polskiego prawnika specjalizującego się w ochronie danych osobowych
          (preferowany prawnik zarejestrowany przy UODO). Każde miejsce oznaczone {'{PLACEHOLDER}'}
          musi zostać uzupełnione przed publikacją.
        </p>
      </div>

      <Section title="1. Kim jesteśmy (Administrator danych)">
        <p>
          Administratorem danych osobowych zbieranych za pośrednictwem
          <strong> englishmetro.com</strong> jest:
        </p>
        <ul>
          <li><strong>{'{LEGAL_ENTITY_NAME}'}</strong></li>
          <li>Siedziba: {'{REGISTERED_ADDRESS}'}, Polska</li>
          <li>NIP: {'{NIP}'} · REGON: {'{REGON}'} · KRS: {'{KRS_IF_APPLICABLE}'}</li>
          <li>Adres e-mail w sprawach ochrony prywatności: <a href="mailto:privacy@englishmetro.com">privacy@englishmetro.com</a></li>
        </ul>
        <p>
          Masz prawo w każdej chwili skontaktować się z polskim organem nadzorczym — Prezesem
          Urzędu Ochrony Danych Osobowych (UODO): <a href="https://uodo.gov.pl" target="_blank" rel="noreferrer">uodo.gov.pl</a>.
        </p>
      </Section>

      <Section title="2. Jakie dane przetwarzamy">
        <p>Podczas korzystania z English Metropolis przetwarzamy następujące kategorie danych osobowych:</p>
        <ul>
          <li><strong>Dane konta:</strong> imię i nazwisko, adres e-mail, identyfikator ucznia, szkoła, poziom językowy.</li>
          <li><strong>Dane lekcji:</strong> transkrypcje, analizy, mocne strony, błędy, cytaty dosłowne, daty lekcji, eksporty PDF.</li>
          <li><strong>Stan nauki:</strong> opanowanie fiszek, wyniki quizów, próby ćwiczeń, prace pisemne typu free-write.</li>
          <li><strong>Dane głosowe:</strong> krótkie nagrania audio wykonywane podczas pracy z tutorem AI są transkrybowane przez nasz system ASR (Whisper) działający na naszych własnych serwerach, przekazywane do modelu Kimi K2.5 w celu udzielenia wskazówek, a synteza mowy (TTS) odbywa się lokalnie przy użyciu Kokoro. Surowe nagrania audio są usuwane z dysku po wygenerowaniu odpowiedzi (w ciągu kilku minut).</li>
          <li><strong>Dane techniczne:</strong> adres IP, typ przeglądarki, model urządzenia, język, strefa czasowa (na potrzeby bezpieczeństwa i diagnostyki).</li>
          <li><strong>Cookies / pamięć lokalna przeglądarki:</strong> token sesji, preferencja głosu, motyw, zapis zgody. Zob. naszą <Link to="/cookies" className="underline">Politykę Cookies</Link>.</li>
        </ul>
      </Section>

      <Section title="3. Cele i podstawy prawne (art. 6 RODO)">
        <ul>
          <li><strong>Umowa (art. 6 ust. 1 lit. b):</strong> świadczenie usług nauczania języka angielskiego, w tym oceny, analizy oraz tutora AI, na które się zapisałeś/aś.</li>
          <li><strong>Prawnie uzasadniony interes (art. 6 ust. 1 lit. f):</strong> rozwój produktu, monitorowanie bezpieczeństwa, zapobieganie oszustwom. W każdej chwili możesz wnieść sprzeciw.</li>
          <li><strong>Zgoda (art. 6 ust. 1 lit. a):</strong> opcjonalna analityka, ewentualne wiadomości marketingowe. Zgodę możesz wycofać w każdej chwili za pomocą banera w stopce serwisu.</li>
          <li><strong>Obowiązek prawny (art. 6 ust. 1 lit. c):</strong> dokumentacja księgowa (przepisy polskie — 5 lat).</li>
        </ul>
      </Section>

      <Section title="4. Komu udostępniamy dane (podmioty przetwarzające)">
        <p>Korzystamy z następujących podmiotów przetwarzających. Z każdym mamy zawartą umowę powierzenia przetwarzania danych (DPA):</p>
        <ul>
          <li><strong>Convex</strong> (baza danych) — lekcje, analizy, słowa kluczowe, rekordy uczniów. Przechowywane w {'{CONVEX_REGION}'}. DPA: {'{LINK_OR_TBD}'}.</li>
          <li><strong>Cloudflare</strong> (CDN + DNS + WAF) — kierowanie ruchu, filtrowanie botów. Obowiązuje standardowa umowa DPA Cloudflare.</li>
          <li><strong>Kimi (Moonshot AI)</strong> — wsparcie LLM przez api.kimi.com. Kontekst lekcji jest wysyłany w celu wygenerowania odpowiedzi. Zgodnie z naszą umową API Kimi nie przechowuje promptów do celów szkoleniowych. {'{VERIFY_CONTRACT_TERMS}'}</li>
          <li><strong>Kokoro TTS</strong> — działa na naszych własnych serwerach. Brak udziału podmiotów trzecich.</li>
          <li><strong>Whisper ASR</strong> — działa na naszych własnych serwerach. Brak udziału podmiotów trzecich.</li>
          <li><strong>Monexus Media</strong> — hosting infrastruktury. UE / {'{HOSTING_LOCATION}'}.</li>
        </ul>
        <p>NIE sprzedajemy Twoich danych. NIE udostępniamy ich reklamodawcom. NIE wykorzystujemy ich do trenowania zewnętrznych modeli AI.</p>
      </Section>

      <Section title="5. Przekazywanie danych poza EOG">
        <p>
          Niektóre podmioty przetwarzające (Kimi) mają siedzibę poza UE/EOG. Przekazywanie danych
          jest zabezpieczone Standardowymi Klauzulami Umownymi (SCC) na podstawie art. 46 RODO oraz
          dodatkowymi środkami, w tym minimalizacją zapytań (przesyłamy wyłącznie konkretny kontekst
          lekcji potrzebny do zapytania ucznia, bez przekazywania danych osobowych poza imieniem).
          {' '}{'{REVIEW_SCCS}'}
        </p>
      </Section>

      <Section title="6. Jak długo przechowujemy Twoje dane">
        <ul>
          <li><strong>Aktywne dane konta:</strong> przez okres aktywności konta + 30 dni po jego zamknięciu.</li>
          <li><strong>Transkrypcje i analizy lekcji:</strong> 2 lata od daty lekcji, chyba że zażądasz wcześniejszego usunięcia.</li>
          <li><strong>Nagrania głosowe:</strong> usuwane w ciągu kilku minut od wygenerowania odpowiedzi. Nigdy nie są przechowywane długoterminowo.</li>
          <li><strong>Logi serwera:</strong> 30 dni.</li>
          <li><strong>Dokumentacja księgowa:</strong> 5 lat (wymóg polskiego prawa podatkowego).</li>
        </ul>
      </Section>

      <Section title="7. Twoje prawa (art. 15–22 RODO)">
        <p>Przysługują Ci następujące prawa:</p>
        <ul>
          <li><strong>Dostęp</strong> do danych osobowych (art. 15) — napisz na privacy@englishmetro.com, aby otrzymać eksport danych.</li>
          <li><strong>Sprostowanie</strong> nieprawidłowych danych (art. 16) — edytuj swój profil lub napisz do nas.</li>
          <li><strong>Usunięcie danych</strong> („prawo do bycia zapomnianym", art. 17) — zażądaj usunięcia konta.</li>
          <li><strong>Ograniczenie przetwarzania</strong> (art. 18).</li>
          <li><strong>Przenoszenie danych</strong> (art. 20) — pobierz swoje lekcje i analizy w formacie JSON.</li>
          <li><strong>Sprzeciw</strong> wobec przetwarzania opartego na prawnie uzasadnionym interesie (art. 21).</li>
          <li><strong>Wycofanie zgody</strong> w każdej chwili (art. 7 ust. 3) — za pomocą banera cookies w stopce.</li>
          <li><strong>Skarga</strong> do polskiego organu nadzorczego (UODO, uodo.gov.pl).</li>
        </ul>
        <p>Na wnioski dotyczące praw odpowiadamy w terminie 30 dni, zgodnie z art. 12 ust. 3 RODO.</p>
      </Section>

      <Section title="8. Dzieci">
        <p>
          Nasza usługa jest przeznaczona dla osób w wieku 16 lat i starszych. W przypadku ucznia
          poniżej 16. roku życia wymagamy weryfikowalnej zgody rodzica lub opiekuna prawnego
          (art. 8 RODO) przed rozpoczęciem przetwarzania danych. Obecnie uczymy uczniów w wieku
          17+ pod nadzorem rodziców, a wszystkie dane małoletnich są przetwarzane na podstawie
          aktywnej zgody opiekuna.
        </p>
      </Section>

      <Section title="9. Bezpieczeństwo">
        <p>
          Cały ruch jest szyfrowany w trakcie transmisji za pomocą HTTPS. Dane spoczynkowe
          w Convex są szyfrowane. Dostęp do transkrypcji lekcji jest ograniczony do nauczyciela
          (Mike), ucznia oraz naszego zespołu inżynieryjnego. Hasła nigdy nie są logowane.
          Klucze API są rotowane przy zmianach kadrowych.
        </p>
      </Section>

      <Section title="10. Zmiany niniejszej polityki">
        <p>
          W przypadku istotnych zmian niniejszej polityki poinformujemy Cię na zarejestrowany
          adres e-mail oraz wyświetlimy nowy baner zgody. Drobne korekty (literówki, doprecyzowania)
          spowodują wyłącznie aktualizację daty „Ostatnia aktualizacja" powyżej.
        </p>
      </Section>

      <Section title="11. Kontakt">
        <p>
          Pytania dotyczące prywatności? Napisz na <a href="mailto:privacy@englishmetro.com">privacy@englishmetro.com</a> lub
          na adres siedziby podany powyżej. Dążymy do udzielenia odpowiedzi w ciągu 3 dni roboczych.
        </p>
      </Section>
    </>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="font-headline text-xl text-slate-900 mb-3">{title}</h2>
      <div className="prose prose-sm text-slate-700 space-y-3 max-w-none">
        {children}
      </div>
    </section>
  )
}
