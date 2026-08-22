import FoundationLegalPage from './FoundationLegalPage.jsx'
import { ANALYSIS_TITLE_PL, ANALYSIS_HTML_PL, ANALYSIS_TITLE_EN, ANALYSIS_HTML_EN } from './foundation-legal-content.js'

export default function LessonAnalysisNotice() {
  return (
    <FoundationLegalPage
      titlePl={ANALYSIS_TITLE_PL}
      titleEn={ANALYSIS_TITLE_EN}
      docId="EM-LEGAL-04"
      bodyHtml={ANALYSIS_HTML_PL}
      bodyHtmlEn={ANALYSIS_HTML_EN}
    />
  )
}
