// PracticeNew — wired to the new EM Practice Shell (em-practice-shell-prod port).
//
// 2026-05-01 (Shadow's audit): always render StudentPractice. The previous
// no-session fallback dumped the internal PracticeCanvas (Claude Design exhibit)
// to students, which read as a broken page. StudentPractice handles both
// states gracefully — recommended picks when signed in, all 10 districts as
// explorable cards otherwise. The design canvas now lives at /practice/design.
//
// Original (pre-Agent 8) version preserved at PracticeNew.jsx.preshell.bak.

import { StudentPractice } from '../../practice/StudentPractice'

// Claude Design fonts — bundled locally via @fontsource so the brand register
// (Caprasimo display + Space Grotesk display + Inter body + JetBrains Mono mono)
// actually renders, instead of falling through to system fallbacks.
import '@fontsource/caprasimo/400.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'

import '../../practice/styles/system.css'
import '../../practice/styles/global.css'
import '../../practice/styles/arcade.css'

export default function PracticeNew() {
  return <StudentPractice />
}
