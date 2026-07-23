import FoundationLegalPage from './FoundationLegalPage.jsx'
import { TERMS_TITLE_PL, TERMS_HTML_PL } from './foundation-legal-content.js'

export default function Terms() {
  return (
    <FoundationLegalPage
      titlePl={TERMS_TITLE_PL}
      titleEn="Terms of Service (Regulamin)"
      docId="EM-LEGAL-03"
      bodyHtml={TERMS_HTML_PL}
    />
  )
}
