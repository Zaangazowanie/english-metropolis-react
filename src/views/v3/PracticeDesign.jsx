// PracticeDesign — internal route for the Claude Design exhibit.
//
// Shows the full design canvas (Cover artboard, all shell state sequences,
// tweaks panel) at /practice/design. Not student-facing; meant for design
// review and visual QA. StudentPractice owns /practice for actual users.

import PracticeCanvas from '../../practice/PracticeCanvas'

// Claude Design fonts — bundled locally via @fontsource. Same set as /practice.
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

export default function PracticeDesign() {
  return <PracticeCanvas />
}
