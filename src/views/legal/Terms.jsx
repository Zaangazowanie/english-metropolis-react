import FoundationLegalPage from './FoundationLegalPage.jsx'
import { TERMS_TITLE_PL, TERMS_HTML_PL, TERMS_TITLE_EN, TERMS_HTML_EN } from './foundation-legal-content.js'

export default function Terms() {
  return (
    <FoundationLegalPage
      titlePl={TERMS_TITLE_PL}
      titleEn={TERMS_TITLE_EN}
      docId="EM-LEGAL-03"
      bodyHtml={TERMS_HTML_PL}
      bodyHtmlEn={TERMS_HTML_EN}
    />
  )
}
