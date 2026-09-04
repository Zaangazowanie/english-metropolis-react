// A small dial drawn on every package card so the packages can be compared at a
// glance: one tick per lesson (48 positions, the largest package) and an inner
// arc that fills in proportion to the validity period (24 months = full).
//
// Deliberately SVG + CSS, not three.js. A 3D object whose only job is "8 lit
// segments" carries no more information than this, costs a WebGL context per
// card (12 cards on this page), cannot be read by a screen reader, and would
// have to be switched off under prefers-reduced-motion anyway. The validity
// months are derived from the SAME label packageValidity() prints next to the
// card, so the arc can never disagree with the legal text.
import { packageValidity } from './packages.js'

const TICKS = 48
const R_TICK = 20
const R_ARC = 12.5
const C = 26

function monthsFromValidity(lessons) {
  const en = packageValidity(lessons).en
  const m = en.match(/(\d+)\s+months/)
  if (m) return Number(m[1])
  const d = en.match(/(\d+)\s+days/)
  return d ? Math.max(1, Math.round(Number(d[1]) / 30)) : 0
}

export default function PackageDial({ lessons, selected = false, lang = 'pl', className = '' }) {
  const n = Math.max(0, Math.min(TICKS, Number(lessons) || 0))
  const months = monthsFromValidity(lessons)
  const frac = Math.min(1, months / 24)
  const circ = 2 * Math.PI * R_ARC
  const label = lang === 'pl'
    ? `${n} ${n === 1 ? 'lekcja' : n >= 2 && n <= 4 ? 'lekcje' : 'lekcji'}, ${packageValidity(lessons).pl.toLowerCase()}`
    : `${n} ${n === 1 ? 'lesson' : 'lessons'}, ${packageValidity(lessons).en.toLowerCase()}`
  return (
    <svg
      className={`lp-dial ${className}`.trim()}
      viewBox="0 0 52 52"
      width="52"
      height="52"
      role="img"
      aria-label={label}
      data-selected={selected}
      style={{ '--dial-arc': circ, '--dial-arc-fill': circ * frac }}
    >
      <g className="lp-dial-ticks">
        {Array.from({ length: TICKS }, (_, i) => {
          const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2
          const x1 = C + Math.cos(a) * (R_TICK - 3.2)
          const y1 = C + Math.sin(a) * (R_TICK - 3.2)
          const x2 = C + Math.cos(a) * R_TICK
          const y2 = C + Math.sin(a) * R_TICK
          return (
            <line
              key={i}
              x1={x1.toFixed(2)} y1={y1.toFixed(2)} x2={x2.toFixed(2)} y2={y2.toFixed(2)}
              className={i < n ? 'is-lit' : ''}
              style={{ '--i': i }}
            />
          )
        })}
      </g>
      <circle className="lp-dial-track" cx={C} cy={C} r={R_ARC} />
      <circle className="lp-dial-arc" cx={C} cy={C} r={R_ARC} transform={`rotate(-90 ${C} ${C})`} />
      <text className="lp-dial-n" x={C} y={C + 0.5} textAnchor="middle" dominantBaseline="middle">{n}</text>
    </svg>
  )
}
