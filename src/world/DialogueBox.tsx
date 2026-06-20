// DialogueBox — the visual-novel overlay: a coloured name-tag chip + a cream
// text panel + an amber advance arrow. Pure DOM (crisp English per contract
// rule 9). Click / tap anywhere on the box advances; the parent also binds
// Enter/Space. aria-live announces each line for screen readers.

import type { CSSProperties } from 'react'
import { SPEAKERS } from './dialogue'
import type { SpeakerId } from './dialogue'

const FONT_DISPLAY = '"Space Grotesk", "Inter", ui-sans-serif, system-ui, sans-serif'

export interface DialogueBoxProps {
  speaker: SpeakerId
  text: string          // revealed-so-far text
  isTyping: boolean
  index: number
  total: number
  onAdvance: () => void
  onSkip?: () => void
}

export function DialogueBox({ speaker, text, isTyping, index, total, onAdvance, onSkip }: DialogueBoxProps) {
  const sp = SPEAKERS[speaker]

  const wrap: CSSProperties = {
    position: 'absolute', left: '50%', bottom: 28,
    transform: 'translateX(-50%)',
    width: 'min(680px, calc(100% - 48px))',
    pointerEvents: 'auto',
    fontFamily: FONT_DISPLAY,
    animation: 'em-dlg-in 0.26s ease',
  }
  const panel: CSSProperties = {
    position: 'relative',
    background: 'linear-gradient(180deg, #FBF6EC 0%, #F2E9D6 100%)',
    color: '#241a10',
    borderRadius: 16,
    padding: '22px 24px 20px',
    boxShadow: '0 24px 60px -18px rgba(0,0,0,0.75), 0 0 0 1px rgba(0,0,0,0.06)',
    cursor: 'pointer',
    minHeight: 92,
  }
  const chip: CSSProperties = {
    position: 'absolute', top: -15, left: 20,
    background: sp.color, color: sp.ink,
    fontWeight: 700, fontSize: 13, letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '5px 14px', borderRadius: 9,
    boxShadow: `0 6px 18px -6px ${sp.color}`,
  }

  return (
    <div style={wrap}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${sp.name} says: ${text}. Click or press Enter to continue.`}
        onClick={onAdvance}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdvance() } }}
        style={panel}
      >
        <span style={chip}>{sp.name}</span>

        <p aria-live="polite" style={{
          margin: '6px 0 0', fontSize: 'clamp(15px, 2vw, 18px)',
          lineHeight: 1.55, fontWeight: 500, minHeight: 28,
        }}>
          {text}
          {isTyping && <span className="em-dlg-caret" style={{ opacity: 0.5 }}>▍</span>}
        </p>

        {/* Advance arrow (pulses once the line is fully revealed) */}
        <div style={{
          position: 'absolute', right: 16, bottom: 12,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {!isTyping && (
            <span style={{
              fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: '0.1em',
              color: '#8a6f3e', opacity: 0.8,
            }}>
              {index + 1} / {total}
            </span>
          )}
          <span style={{
            color: '#C97A12', fontSize: 18, lineHeight: 1,
            animation: isTyping ? 'none' : 'em-dlg-bounce 1.1s ease-in-out infinite',
          }}>▶</span>
        </div>
      </div>

      {/* Skip control */}
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          style={{
            position: 'absolute', right: 4, top: -34,
            background: 'rgba(10,4,24,0.5)', border: '1px solid rgba(245,240,250,0.18)',
            color: 'rgba(245,240,250,0.7)', borderRadius: 8,
            fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: '0.06em',
            padding: '5px 12px', cursor: 'pointer',
          }}
        >
          Skip ⏭
        </button>
      )}

      <style>{`
        @keyframes em-dlg-in { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes em-dlg-bounce { 0%,100% { transform: translateX(0); } 50% { transform: translateX(4px); } }
        .em-dlg-caret { animation: em-dlg-blink 0.7s step-end infinite; }
        @keyframes em-dlg-blink { 50% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .em-dlg-caret { animation: none; }
        }
      `}</style>
    </div>
  )
}
