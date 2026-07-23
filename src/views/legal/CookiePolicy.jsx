import FoundationLegalPage from './FoundationLegalPage.jsx'
import { COOKIES_TITLE_PL, COOKIES_HTML_PL } from './foundation-legal-content.js'

export default function CookiePolicy() {
  return (
    <FoundationLegalPage
      titlePl={COOKIES_TITLE_PL}
      titleEn="Cookies Policy (Polityka Cookies)"
      docId="EM-LEGAL-02"
      bodyHtml={COOKIES_HTML_PL}
    />
  )
}
