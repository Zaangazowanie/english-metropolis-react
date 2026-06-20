// Pager — Wren's chunky vintage pager (canon: "a chunky vintage rectangle on
// the strap"). Collects a round stamp seal after each completed errand:
// a lamp, a bouquet, a café. Reads the persisted lamp-progress set; when a new
// stamp lands it pulses + rings (the visual "soft chime" — audio is a separate
// piece) and shows the canon microcopy.
//
// Pure DOM (contract rule 9). No three/r3f import, no new deps. reducedMotion
// → no pulse/ring (the seal simply appears).

import type { CSSProperties } from 'react'
import { palette } from '../practice/shells3d/kit/palette'

const FONT_DISPLAY = '"Space Grotesk", "Inter", ui-sans-serif, system-ui, sans-serif'
const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", monospace'

// shellKey → seal glyph + short label (canon seals: lamp, flower, chalkboard).
const STAMPS: Record<string, { glyph: string; label: string }> = {
  labelleddiagram: { glyph: '🏮', label: 'Lamp' },
  matching:        { glyph: '🌻', label: 'Bouquet' },
  anagram:         { glyph: '🍵', label: 'Café' },
  spellingbee:     { glyph: '📮', label: 'Address' },
  gapfill:         { glyph: '💌', label: 'Postcard' },
}

export interface PagerProps {
  /** Ordered shellKeys that have stamp slots (portal order). */
  order: string[]
  /** Set of completed shellKeys. */
  completed: Set<string>
  /** The shellKey just earned this beat (animates), or null. */
  justEarned: string | null
  reducedMotion?: boolean
}

export function Pager({ order, completed, justEarned, reducedMotion = false }: PagerProps) {
  const total = order.length
  const lit = order.filter((k) => completed.has(k)).length

  const caption = justEarned
    ? '+1 light — the lamp remembers'
    : lit >= total && total > 0
      ? 'good errand'
      : `${lit} / ${total} lit`

  const wrap: CSSProperties = {
    position: 'absolute', right: 24, bottom: 24,
    width: 'fit-content', maxWidth: 'min(92vw, 340px)', pointerEvents: 'none',
    fontFamily: FONT_DISPLAY,
    background: 'linear-gradient(180deg, rgba(22,34,40,0.92) 0%, rgba(12,20,26,0.94) 100%)',
    border: '1px solid rgba(176,141,87,0.45)',
    borderRadius: 14,
    padding: '12px 14px 13px',
    boxShadow: '0 18px 44px -18px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
  }

  return (
    <div style={wrap} aria-hidden="true">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: palette.brass,
          boxShadow: `0 0 8px ${palette.brass}`,
        }} />
        <span style={{
          fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '0.22em',
          color: 'rgba(245,240,250,0.55)', textTransform: 'uppercase',
        }}>
          Metro Pager
        </span>
      </div>

      {/* Stamp row */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        {order.map((key) => {
          const earned = completed.has(key)
          const isNew = justEarned === key && !reducedMotion
          const stamp = STAMPS[key] ?? { glyph: '•', label: '' }
          return (
            <div key={key} style={{ position: 'relative', textAlign: 'center' }}>
              <div style={{
                position: 'relative',
                width: 38, height: 38, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, lineHeight: 1,
                background: earned
                  ? `radial-gradient(circle at 40% 35%, ${palette.lanternCore}, ${palette.lanternAmber})`
                  : 'transparent',
                border: earned
                  ? `1px solid ${palette.lanternAmber}`
                  : '1.5px dashed rgba(245,240,250,0.28)',
                boxShadow: earned ? `0 0 14px ${palette.lanternAmber}88` : 'none',
                filter: earned ? 'none' : 'grayscale(1) opacity(0.5)',
                animation: isNew ? 'em-stamp-pop 0.5s ease' : 'none',
              }}>
                <span style={{ filter: earned ? 'none' : 'grayscale(1)' }}>{stamp.glyph}</span>
                {/* chime ring on the newly-earned seal */}
                {isNew && (
                  <span style={{
                    position: 'absolute', inset: -4, borderRadius: '50%',
                    border: `2px solid ${palette.lanternAmber}`,
                    animation: 'em-stamp-ring 0.7s ease-out forwards',
                  }} />
                )}
              </div>
              <div style={{
                marginTop: 4, fontSize: 9, letterSpacing: '0.04em',
                color: earned ? 'rgba(245,240,250,0.7)' : 'rgba(245,240,250,0.32)',
              }}>
                {stamp.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Caption */}
      <div style={{
        marginTop: 11, textAlign: 'center',
        fontSize: 11, letterSpacing: '0.03em',
        color: justEarned ? palette.lanternAmber : 'rgba(245,240,250,0.5)',
        textShadow: justEarned ? `0 0 10px ${palette.lanternAmber}66` : 'none',
        transition: 'color 0.4s ease',
        minHeight: 14,
      }}>
        {caption}
      </div>

      <style>{`
        @keyframes em-stamp-pop {
          0% { transform: scale(0.4) rotate(-12deg); opacity: 0; }
          60% { transform: scale(1.15) rotate(4deg); }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes em-stamp-ring {
          0% { transform: scale(0.8); opacity: 0.9; }
          100% { transform: scale(2.1); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="em-stamp-pop"], [style*="em-stamp-ring"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
