// Transform — original sentence on top, 4 rewrite options below. Click one.
// Library question shape:
//   { id, type: 'transform',
//     prompt,          // task instruction (e.g. "Rewrite using present perfect")
//     source,          // the sentence to transform
//     options: [string], correctAnswer: string,
//     explanation?, pl_hint? }

import { useMemo } from 'react'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { FONT } from '../../design/v3/tokens.js'
import MCQ from './MCQ.jsx'

export default function Transform(props) {
  const { T } = useV3Theme()
  const { question } = props
  const source = String(question?.source || '')

  return (
    <div>
      {source && (
        <div style={{
          padding: '14px 18px', borderRadius: 12,
          background: T.surface, border: `1px dashed ${T.border}`,
          fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 18,
          color: T.textSoft, marginBottom: 18,
        }}>
          <span style={{
            fontFamily: FONT.body, fontStyle: 'normal', fontSize: 13, fontWeight: 700,
            letterSpacing: '0.22em', textTransform: 'uppercase', color: T.textDim,
            marginRight: 10,
          }}>Original</span>
          {source}
        </div>
      )}
      <MCQ {...props} />
    </div>
  )
}
