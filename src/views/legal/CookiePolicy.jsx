import FoundationLegalPage from './FoundationLegalPage.jsx'
import { COOKIES_TITLE_PL, COOKIES_HTML_PL, COOKIES_TITLE_EN, COOKIES_HTML_EN } from './foundation-legal-content.js'

export default function CookiePolicy() {
  return (
    <FoundationLegalPage
      titlePl={COOKIES_TITLE_PL}
      titleEn={COOKIES_TITLE_EN}
      docId="EM-LEGAL-02"
      bodyHtml={COOKIES_HTML_PL}
      bodyHtmlEn={COOKIES_HTML_EN}
    />
  )
}
