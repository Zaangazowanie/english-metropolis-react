import FoundationLegalPage from './FoundationLegalPage.jsx'
import { PRIVACY_TITLE_PL, PRIVACY_HTML_PL } from './foundation-legal-content.js'

export default function PrivacyPolicy() {
  return (
    <FoundationLegalPage
      titlePl={PRIVACY_TITLE_PL}
      titleEn="Privacy Policy (Polityka prywatności)"
      docId="EM-LEGAL-01"
      bodyHtml={PRIVACY_HTML_PL}
    />
  )
}
