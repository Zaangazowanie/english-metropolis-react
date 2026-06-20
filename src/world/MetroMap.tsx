// MetroMap — "The Round" (canon Vertical Slice Beat 3): a clock-face line map
// of interconnected districts. Most lines are grey; the districts you've helped
// glow amber. Lanterngate + Saffron Market are the live slice; the rest are
// "arriving". Opens from a HUD button or the M key; closes on M / Escape / tap.
//
// Pure DOM + inline SVG (crisp English, contract rule 9). No three/r3f, no deps.
// Reads the persisted lamp-progress to decide which districts are lit.

import type { CSSProperties } from 'react'
import { palette } from '../practice/shells3d/kit/palette'

const FONT_DISPLAY = '"Space Grotesk", "Inter", ui-sans-serif, system-ui, sans-serif'
const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", monospace'

type DistrictState = 'lit' | 'partial' | 'active' | 'soon'

interface Node {
  id: string
  label: string
  angle: number          // clock angle in degrees (0 = 12 o'clock, clockwise)
  state: DistrictState
}

const CX = 200, CY = 205, R = 132

function polar(angleDeg: number, radius = R): [number, number] {
  const a = (angleDeg - 90) * (Math.PI / 180)
  return [CX + Math.cos(a) * radius, CY + Math.sin(a) * radius]
}

const COLOR: Record<DistrictState, { dot: string; ring: string; text: string }> = {
  lit:     { dot: palette.lanternAmber, ring: palette.lanternCore, text: 'rgba(245,240,250,0.92)' },
  partial: { dot: '#B5772A',            ring: palette.lanternAmber, text: 'rgba(245,240,250,0.78)' },
  active:  { dot: '#5E7E88',            ring: '#7FB0BD',            text: 'rgba(245,240,250,0.6)' },
  soon:    { dot: '#2B2540',            ring: '#3A3358',            text: 'rgba(245,240,250,0.32)' },
}

export interface MetroMapProps {
  completed: Set<string>
  onClose: () => void
  reducedMotion?: boolean
}

export function MetroMap({ completed, onClose, reducedMotion = false }: MetroMapProps) {
  const lanterngate: DistrictState = completed.has('labelleddiagram') ? 'lit' : 'active'
  const saffronLit = completed.has('matching') && completed.has('anagram')
  const saffronAny = completed.has('matching') || completed.has('anagram')
  const saffron: DistrictState = saffronLit ? 'lit' : saffronAny ? 'partial' : 'active'

  // Two live districts (top arc) + four "arriving" nodes around the Round.
  const nodes: Node[] = [
    { id: 'lanterngate', label: 'Lanterngate',   angle: 0,   state: lanterngate },
    { id: 'saffron',     label: 'Saffron Market', angle: 60,  state: saffron },
    { id: 'underground', label: 'The Underground', angle: 120, state: 'soon' },
    { id: 'camden',      label: 'Camden Market',  angle: 180, state: 'soon' },
    { id: 'riverside',   label: 'The Riverside',  angle: 240, state: 'soon' },
    { id: 'pier',        label: 'The Pier',       angle: 300, state: 'soon' },
  ]

  // The Lanterngate → Saffron arc wakes once the player has made progress on
  // that line (the first lamp lit, or any Saffron errand done).
  const litArc = lanterngate === 'lit' || saffron === 'lit' || saffron === 'partial'
  const [ax, ay] = polar(0)
  const [bx, by] = polar(60)

  const backdrop: CSSProperties = {
    position: 'absolute', inset: 0, zIndex: 30,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(6,3,14,0.78)', backdropFilter: 'blur(10px)',
    pointerEvents: 'auto', padding: 20,
    animation: reducedMotion ? 'none' : 'em-map-in 0.3s ease',
  }

  const litCount = nodes.filter((n) => n.state === 'lit').length

  return (
    <div style={backdrop} onClick={onClose} role="dialog" aria-label="The Round — district map">
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: 'min(440px, 94vw)',
          background: 'linear-gradient(180deg, rgba(18,12,38,0.96) 0%, rgba(10,6,24,0.97) 100%)',
          border: `1px solid ${palette.bajlaPurple}44`,
          borderRadius: 20, padding: '20px 20px 24px',
          boxShadow: '0 40px 100px -30px rgba(0,0,0,0.85)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{
            fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '0.34em',
            color: palette.lanternAmber, textTransform: 'uppercase',
          }}>
            The Round
          </div>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: 12,
            color: 'rgba(245,240,250,0.5)', marginTop: 4,
          }}>
            Every line is a connection between people
          </div>
        </div>

        {/* The clock-face map */}
        <svg viewBox="0 0 400 410" style={{ width: '100%', height: 'auto', display: 'block' }} aria-hidden="true">
          {/* faint full ring */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#3A3358" strokeWidth="2" opacity="0.5" />
          {/* lit arc Lanterngate → Saffron */}
          {litArc && (
            <path
              d={`M ${ax} ${ay} A ${R} ${R} 0 0 1 ${bx} ${by}`}
              fill="none" stroke={palette.lanternAmber} strokeWidth="3"
              strokeLinecap="round" opacity="0.85"
            >
              {!reducedMotion && (
                <animate attributeName="opacity" values="0.55;0.95;0.55" dur="3s" repeatCount="indefinite" />
              )}
            </path>
          )}

          {/* spokes to centre hub */}
          {nodes.map((n) => {
            const [x, y] = polar(n.angle)
            return <line key={`s-${n.id}`} x1={CX} y1={CY} x2={x} y2={y}
              stroke={n.state === 'soon' ? '#2A2440' : '#5A4E84'} strokeWidth="1" opacity="0.4" />
          })}

          {/* centre hub */}
          <circle cx={CX} cy={CY} r="6" fill={palette.bajlaPurple} opacity="0.8" />

          {/* district nodes */}
          {nodes.map((n) => {
            const [x, y] = polar(n.angle)
            const c = COLOR[n.state]
            const glow = n.state === 'lit'
            return (
              <g key={n.id}>
                {glow && <circle cx={x} cy={y} r="15" fill={c.dot} opacity="0.18" />}
                <circle cx={x} cy={y} r="8.5" fill={c.dot} stroke={c.ring} strokeWidth="1.5" />
                {glow && !reducedMotion && (
                  <circle cx={x} cy={y} r="8.5" fill="none" stroke={c.ring} strokeWidth="1.5">
                    <animate attributeName="r" values="8.5;15" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.7;0" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* label — placed inside or outside depending on side */}
                <text
                  x={x} y={y + (y < CY ? -16 : 22)}
                  textAnchor="middle"
                  fontFamily={FONT_DISPLAY} fontSize="12.5" fontWeight="600"
                  fill={c.text}
                >
                  {n.label}
                </text>
                {n.state === 'soon' && (
                  <text x={x} y={y + (y < CY ? -30 : 35)} textAnchor="middle"
                    fontFamily={FONT_MONO} fontSize="8" letterSpacing="0.12em" fill="rgba(245,240,250,0.28)">
                    ARRIVING
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 8,
        }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: palette.lanternAmber, letterSpacing: '0.08em' }}>
            🕯 {litCount} districts lit
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13,
              color: palette.night, background: palette.lanternAmber,
              border: 'none', borderRadius: 9, padding: '8px 18px',
              cursor: 'pointer', letterSpacing: '0.04em',
            }}
          >
            Close (M)
          </button>
        </div>
      </div>

      {!reducedMotion && (
        <style>{`@keyframes em-map-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }`}</style>
      )}
    </div>
  )
}
