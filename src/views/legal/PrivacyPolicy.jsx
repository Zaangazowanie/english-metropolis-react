import FoundationLegalPage from './FoundationLegalPage.jsx'
import { PRIVACY_TITLE_PL, PRIVACY_HTML_PL, PRIVACY_TITLE_EN, PRIVACY_HTML_EN } from './foundation-legal-content.js'

export default function PrivacyPolicy() {
  return (
    <FoundationLegalPage
      titlePl={PRIVACY_TITLE_PL}
      titleEn={PRIVACY_TITLE_EN}
      docId="EM-LEGAL-01"
      bodyHtml={PRIVACY_HTML_PL}
      effectivePl={'23 lipca 2026 r.'}
      effectiveEn={'23 July 2026'}
      bodyHtmlEn={PRIVACY_HTML_EN}
    />
  )
}
