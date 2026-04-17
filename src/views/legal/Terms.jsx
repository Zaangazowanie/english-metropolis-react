import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'

export default function Terms() {
  const { t, lang } = useI18n()
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 legal-page">
      <div className="mb-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-sky-700 hover:text-sky-900">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          {t('legal.backToApp')}
        </Link>
      </div>
      <h1 className="font-headline text-3xl sm:text-4xl text-slate-900">{t('legal.terms.title')}</h1>
      <p className="mt-2 text-sm text-slate-500">{t('legal.terms.subtitle')} · {t('legal.lastUpdated')}: {t('legal.lastUpdatedDate')}</p>

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
          These terms are a structured draft and must be reviewed by a Polish commercial lawyer
          before production launch. Polish Ustawa o świadczeniu usług drogą elektroniczną (UŚŚU)
          requires a publicly accessible regulamin for any service provided electronically.
          Consumer-protection rules (Ustawa o prawach konsumenta) and the 14-day withdrawal right
          apply to subscriptions purchased online.
        </p>
      </div>

      <Section title="1. Parties">
        <p>
          These Terms of Service ("Terms") govern your use of <strong>englishmetro.com</strong> (the "Service"),
          operated by <strong>{'{LEGAL_ENTITY_NAME}'}</strong>, a company registered in Poland at {'{REGISTERED_ADDRESS}'},
          NIP {'{NIP}'}. Throughout these Terms "we", "us", "our" means English Metropolis; "you", "your" means
          the student or school administrator using the Service.
        </p>
      </Section>

      <Section title="2. The Service">
        <p>
          English Metropolis provides online English tuition, lesson analysis, personalised drill
          generation, AI-assisted practice, and a voice tutor for students at CEFR levels B1–C2.
          The Service is delivered through the <code>englishmetro.com</code> web application.
        </p>
      </Section>

      <Section title="3. Accounts">
        <p>
          To use the Service you must create an account. You are responsible for keeping your login
          credentials secure. You must be 16 years or older; if under 16, a parent or guardian must
          consent on your behalf and co-sign these Terms.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <ul>
          <li>Don't share your account with others or resell access.</li>
          <li>Don't use the Service to generate or distribute hateful, illegal, or defamatory content.</li>
          <li>Don't reverse-engineer, scrape, or interfere with the Service's systems.</li>
          <li>Don't upload malware, execute attacks, or attempt to access other students' data.</li>
        </ul>
        <p>Violations may result in immediate account suspension.</p>
      </Section>

      <Section title="5. Fees and payment">
        <p>
          Fees for tuition are listed at {'{PRICING_PAGE_URL}'} and billed in PLN. Invoices comply with
          Polish VAT (podatek VAT, 23% unless otherwise noted). Payment is processed via {'{PAYMENT_PROCESSOR}'}.
        </p>
      </Section>

      <Section title="6. Right of withdrawal (Polish consumer law)">
        <p>
          As a consumer (konsument) you have the right to withdraw from a distance contract within
          14 days without giving a reason, under Art. 27 of the Polish Consumer Rights Act
          (Ustawa o prawach konsumenta). To exercise this right, email us at {'{WITHDRAWAL_EMAIL}'} with
          a clear statement of your decision. We refund payments within 14 days of receiving your
          withdrawal notice using the same payment method you used to pay.
        </p>
        <p>
          <strong>Important:</strong> if you explicitly request that tuition begin before the 14-day
          period expires, you agree to pay for services rendered up to the moment of withdrawal.
        </p>
      </Section>

      <Section title="7. Intellectual property">
        <p>
          Lesson materials, AI-generated drills, analyses, and site design are the intellectual property
          of English Metropolis or its licensors, provided to you under a limited, non-exclusive,
          non-transferable licence for personal learning use only.
        </p>
        <p>
          YOU retain ownership of the text you type, the audio you record, and the writing you submit
          for review. By submitting them for AI review you grant us a licence to process them for the
          sole purpose of providing the Service.
        </p>
      </Section>

      <Section title="8. Liability">
        <p>
          We use reasonable care to provide accurate tuition. The AI tutor's outputs are educational
          suggestions — we do not guarantee zero errors. For important decisions (e.g. exam prep),
          please cross-check with your human teacher. Our liability is limited to the amount you
          paid for the Service in the 12 months preceding the claim, except in cases of wilful
          misconduct or gross negligence.
        </p>
      </Section>

      <Section title="9. Termination">
        <p>
          You can close your account at any time by emailing {'{PRIVACY_EMAIL}'}. We may terminate
          your account for violations of these Terms with 14 days' notice (immediately for severe
          breaches).
        </p>
      </Section>

      <Section title="10. Governing law and disputes">
        <p>
          These Terms are governed by Polish law. Disputes are resolved first by informal
          discussion; if that fails, by the courts of the Republic of Poland with jurisdiction over
          the seat of English Metropolis. Consumers retain their statutory right to turn to the
          competent consumer court or use the EU ODR platform at <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noreferrer">ec.europa.eu/consumers/odr</a>.
        </p>
      </Section>

      <Section title="11. Changes">
        <p>
          We may update these Terms. Material changes will be notified via email and a banner on
          the Service at least 14 days before they take effect.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          <a href="mailto:hello@englishmetro.com">hello@englishmetro.com</a> ·
          privacy: <a href="mailto:privacy@englishmetro.com">privacy@englishmetro.com</a>
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
          Oczekuje na weryfikację przez polskiego prawnika ds. ochrony danych. Niniejszy regulamin
          jest ustrukturyzowanym projektem i przed wdrożeniem produkcyjnym musi zostać zweryfikowany
          przez polskiego radcę prawnego specjalizującego się w prawie handlowym. Polska Ustawa
          o świadczeniu usług drogą elektroniczną (UŚUDE) wymaga publicznie dostępnego regulaminu
          dla każdej usługi świadczonej drogą elektroniczną. Stosują się przepisy konsumenckie
          (Ustawa o prawach konsumenta) oraz prawo do odstąpienia od umowy w terminie 14 dni
          w odniesieniu do subskrypcji zakupionych przez Internet.
        </p>
      </div>

      <Section title="1. Strony">
        <p>
          Niniejszy Regulamin świadczenia usług („Regulamin") określa zasady korzystania z serwisu
          <strong> englishmetro.com</strong> („Serwis"), prowadzonego przez <strong>{'{LEGAL_ENTITY_NAME}'}</strong>,
          spółkę zarejestrowaną w Polsce pod adresem {'{REGISTERED_ADDRESS}'}, NIP {'{NIP}'}. W całym
          Regulaminie określenia „my", „nas", „nasz" oznaczają English Metropolis; określenia „Ty",
          „Twój" oznaczają ucznia lub administratora szkoły korzystającego z Serwisu.
        </p>
      </Section>

      <Section title="2. Serwis">
        <p>
          English Metropolis świadczy usługi nauczania języka angielskiego online, analizy lekcji,
          generowania spersonalizowanych ćwiczeń, praktyki wspomaganej sztuczną inteligencją oraz
          tutora głosowego dla uczniów na poziomach CEFR B1–C2. Usługa jest dostarczana za
          pośrednictwem aplikacji webowej <code>englishmetro.com</code>.
        </p>
      </Section>

      <Section title="3. Konta">
        <p>
          Aby korzystać z Serwisu, należy założyć konto. Użytkownik jest odpowiedzialny za
          zachowanie poufności swoich danych logowania. Użytkownik musi mieć ukończone 16 lat;
          osoby poniżej 16. roku życia muszą uzyskać zgodę rodzica lub opiekuna prawnego, który
          współpodpisuje niniejszy Regulamin.
        </p>
      </Section>

      <Section title="4. Dozwolony sposób korzystania">
        <ul>
          <li>Nie udostępniaj swojego konta innym osobom ani nie odsprzedawaj dostępu.</li>
          <li>Nie wykorzystuj Serwisu do tworzenia ani rozpowszechniania treści nawołujących do nienawiści, niezgodnych z prawem lub zniesławiających.</li>
          <li>Nie podejmuj prób inżynierii wstecznej, scrapowania ani zakłócania działania systemów Serwisu.</li>
          <li>Nie wgrywaj złośliwego oprogramowania, nie przeprowadzaj ataków ani nie próbuj uzyskać dostępu do danych innych uczniów.</li>
        </ul>
        <p>Naruszenia mogą skutkować natychmiastowym zawieszeniem konta.</p>
      </Section>

      <Section title="5. Opłaty i płatności">
        <p>
          Opłaty za usługi są podane na stronie {'{PRICING_PAGE_URL}'} i naliczane w PLN. Faktury są
          zgodne z polskimi przepisami o podatku VAT (23%, o ile nie wskazano inaczej). Płatności
          są obsługiwane przez {'{PAYMENT_PROCESSOR}'}.
        </p>
      </Section>

      <Section title="6. Prawo odstąpienia od umowy (polskie prawo konsumenckie)">
        <p>
          Jako konsumentowi przysługuje Ci prawo do odstąpienia od umowy zawartej na odległość
          w terminie 14 dni bez podawania przyczyny, zgodnie z art. 27 ustawy o prawach konsumenta.
          Aby skorzystać z tego prawa, prześlij na adres {'{WITHDRAWAL_EMAIL}'} jednoznaczne oświadczenie
          o swojej decyzji. Zwracamy płatności w terminie 14 dni od otrzymania zawiadomienia
          o odstąpieniu, przy użyciu tej samej metody płatności, którą zastosowano przy zakupie.
        </p>
        <p>
          <strong>Ważne:</strong> jeżeli wyraźnie zażądasz rozpoczęcia świadczenia usług przed upływem
          14-dniowego terminu, zobowiązujesz się do zapłaty za usługi wykonane do chwili odstąpienia
          od umowy.
        </p>
      </Section>

      <Section title="7. Własność intelektualna">
        <p>
          Materiały lekcyjne, ćwiczenia generowane przez AI, analizy oraz projekt graficzny
          serwisu stanowią własność intelektualną English Metropolis lub jej licencjodawców
          i są udostępniane na podstawie ograniczonej, niewyłącznej, nieprzenoszalnej licencji
          wyłącznie do osobistego użytku w celach edukacyjnych.
        </p>
        <p>
          TY zachowujesz prawa do wpisywanych przez siebie tekstów, nagrywanego dźwięku oraz
          przesyłanych do oceny prac pisemnych. Przesyłając je do oceny przez AI, udzielasz nam
          licencji na ich przetwarzanie wyłącznie w celu świadczenia Usługi.
        </p>
      </Section>

      <Section title="8. Odpowiedzialność">
        <p>
          Dokładamy należytej staranności, aby zapewnić rzetelne nauczanie. Wyniki tutora AI są
          sugestiami edukacyjnymi — nie gwarantujemy ich pełnej bezbłędności. W przypadku istotnych
          decyzji (np. przygotowania do egzaminów) prosimy o weryfikację z nauczycielem. Nasza
          odpowiedzialność jest ograniczona do kwoty zapłaconej za Usługę w okresie 12 miesięcy
          poprzedzających zgłoszenie roszczenia, z wyjątkiem przypadków winy umyślnej lub rażącego
          niedbalstwa.
        </p>
      </Section>

      <Section title="9. Rozwiązanie umowy">
        <p>
          Możesz w dowolnej chwili zamknąć swoje konto, wysyłając wiadomość na adres
          {' '}{'{PRIVACY_EMAIL}'}. Możemy rozwiązać Twoje konto z powodu naruszenia Regulaminu
          z zachowaniem 14-dniowego okresu wypowiedzenia (ze skutkiem natychmiastowym
          w przypadku poważnych naruszeń).
        </p>
      </Section>

      <Section title="10. Prawo właściwe i spory">
        <p>
          Niniejszy Regulamin podlega prawu polskiemu. Spory rozwiązywane są w pierwszej
          kolejności w drodze nieformalnych negocjacji; w razie ich niepowodzenia — przez sądy
          Rzeczypospolitej Polskiej właściwe dla siedziby English Metropolis. Konsumentom przysługuje
          ustawowe prawo do skorzystania z właściwego sądu konsumenckiego lub unijnej platformy
          ODR pod adresem <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noreferrer">ec.europa.eu/consumers/odr</a>.
        </p>
      </Section>

      <Section title="11. Zmiany">
        <p>
          Możemy aktualizować niniejszy Regulamin. O zmianach istotnych poinformujemy drogą
          mailową oraz poprzez baner w Serwisie z co najmniej 14-dniowym wyprzedzeniem przed
          ich wejściem w życie.
        </p>
      </Section>

      <Section title="12. Kontakt">
        <p>
          <a href="mailto:hello@englishmetro.com">hello@englishmetro.com</a> ·
          sprawy prywatności: <a href="mailto:privacy@englishmetro.com">privacy@englishmetro.com</a>
        </p>
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
