import { useState } from 'react'
import { useTheme } from './ThemeContext'
import { FONTS, EASE } from './tokens'

// ─── Skyline (architectural line art) ─────────────────────────────
export function Skyline({ color, strokeWidth = 1, opacity = 0.28 }) {
  return (
    <svg viewBox="0 0 1440 220" preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', opacity }}>
      <path d="M 0 200 L 80 200 L 80 140 L 120 140 L 120 170 L 180 170 L 180 90 L 210 90 L 210 120 L 260 120 L 260 60 L 290 60 L 290 30 L 310 30 L 310 120 L 360 120 L 360 150 L 420 150 L 420 80 L 470 80 L 470 130 L 530 130 L 530 100 L 580 100 L 580 160 L 640 160 L 640 110 L 690 110 L 690 140 L 750 140 L 750 180 L 810 180 L 810 120 L 870 120 L 870 150 L 930 150 L 930 90 L 980 90 L 980 130 L 1040 130 L 1040 170 L 1100 170 L 1100 140 L 1160 140 L 1160 100 L 1220 100 L 1220 180 L 1280 180 L 1280 150 L 1340 150 L 1340 170 L 1440 170 L 1440 220 L 0 220 Z"
        fill="none" stroke={color} strokeWidth={strokeWidth}/>
    </svg>
  )
}

// ─── EM monogram + wordmark ───────────────────────────────────────
export function Monogram({ size = 28 }) {
  const { T } = useTheme()
  return (
    <div style={{
      width: size, height: size, background: T.brand, color: T.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 500,
      fontSize: size * 0.55, lineHeight: 1, letterSpacing: -0.5,
    }}>EM</div>
  )
}

export function Wordmark({ size = 22 }) {
  const { T } = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Monogram size={size + 6}/>
      <div style={{
        fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: size,
        color: T.text, letterSpacing: -0.3, lineHeight: 1,
      }}>
        English <span style={{ color: T.brand }}>Metropolis</span>
        <span style={{ color: T.accent }}>.</span>
      </div>
    </div>
  )
}

// ─── Section eyebrow ───
export function Eyebrow({ children, color, sub }) {
  const { T } = useTheme()
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ display: 'inline-block', width: 16, height: 1,
          background: color || T.brand }}/>
        <div style={{ fontFamily: FONTS.label, fontSize: 10, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: color || T.brand, fontWeight: 600 }}>
          {children}
        </div>
        {sub && <span style={{ fontFamily: FONTS.mono, fontSize: 10,
          color: T.textMute }}>· {sub}</span>}
      </div>
    </div>
  )
}

// ─── Pills + buttons ───
export function Pill({ children, color, kind = 'outline', size = 'md' }) {
  const { T } = useTheme()
  const c = color || T.brand
  const styles = {
    outline: { bg: 'transparent', fg: c, border: `1px solid ${c}40` },
    solid:   { bg: c, fg: T.bg, border: `1px solid ${c}` },
    ghost:   { bg: T.chipBg, fg: c, border: `1px solid transparent` },
  }[kind]
  const sizes = { sm: { p: '2px 8px', fs: 9 }, md: { p: '3px 10px', fs: 10 } }[size]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: sizes.p, background: styles.bg, color: styles.fg,
      border: styles.border,
      fontFamily: FONTS.label, fontSize: sizes.fs, fontWeight: 600,
      letterSpacing: '0.18em', textTransform: 'uppercase',
    }}>{children}</span>
  )
}

export function Btn({ children, kind = 'primary', size = 'md', onClick, type = 'button', disabled, icon }) {
  const { T } = useTheme()
  const styles = {
    primary: { bg: T.brand, fg: T.bg, border: T.brand, hb: T.brandSoft },
    ghost:   { bg: 'transparent', fg: T.text, border: T.ruleSoft, hb: T.panel },
    outline: { bg: 'transparent', fg: T.brand, border: T.brand, hb: T.chipBg },
    danger:  { bg: 'transparent', fg: T.accent, border: T.accent, hb: T.chipBg },
  }[kind]
  const sizes = { sm: '8px 14px', md: '12px 20px', lg: '16px 24px' }[size]
  const fs = { sm: 10, md: 11, lg: 12 }[size]
  const [hover, setHover] = useState(false)
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        padding: sizes, background: hover && !disabled ? styles.hb : styles.bg,
        border: `1px solid ${styles.border}`, color: styles.fg,
        fontFamily: FONTS.label, fontSize: fs, letterSpacing: '0.22em',
        textTransform: 'uppercase', fontWeight: kind === 'primary' ? 700 : 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 10,
        transition: `background 200ms ${EASE.springFast}`,
      }}>
      {children}
      {icon && <span style={{ fontFamily: FONTS.serif, fontSize: fs + 6 }}>{icon}</span>}
    </button>
  )
}

// ─── Charts ───
export function Radar({ metrics, size = 320 }) {
  const { T } = useTheme()
  if (!metrics || metrics.length < 3) return null
  const r = size / 2 - 36
  return (
    <svg viewBox={`-${size/2} -${size/2} ${size} ${size}`}
      style={{ width: size, height: size }}>
      {[0.3, 0.55, 0.8, 1].map((rr, i) => (
        <polygon key={i}
          points={metrics.map((_, j) => {
            const a = -Math.PI/2 + j * (Math.PI*2/metrics.length)
            return `${Math.cos(a)*r*rr},${Math.sin(a)*r*rr}`
          }).join(' ')}
          fill="none" stroke={T.ruleSoft} strokeWidth="0.5"/>
      ))}
      {metrics.map((_, j) => {
        const a = -Math.PI/2 + j * (Math.PI*2/metrics.length)
        return <line key={j} x1="0" y1="0" x2={Math.cos(a)*r} y2={Math.sin(a)*r}
          stroke={T.ruleSoft} strokeWidth="0.5"/>
      })}
      {/* avg ring */}
      {metrics.some(m => m.avg != null) && (
        <polygon
          points={metrics.map((m, j) => {
            const a = -Math.PI/2 + j * (Math.PI*2/metrics.length)
            const v = ((m.avg ?? m.score) / 100) * r
            return `${Math.cos(a)*v},${Math.sin(a)*v}`
          }).join(' ')}
          fill="none" stroke={T.textMute} strokeWidth="0.7" strokeDasharray="2 3"/>
      )}
      {/* current */}
      <polygon
        points={metrics.map((m, j) => {
          const a = -Math.PI/2 + j * (Math.PI*2/metrics.length)
          const v = (m.score / 100) * r
          return `${Math.cos(a)*v},${Math.sin(a)*v}`
        }).join(' ')}
        fill={T.brand} fillOpacity="0.16"
        stroke={T.brand} strokeWidth="1.6"/>
      {metrics.map((m, j) => {
        const a = -Math.PI/2 + j * (Math.PI*2/metrics.length)
        const v = (m.score / 100) * r
        return <circle key={j} cx={Math.cos(a)*v} cy={Math.sin(a)*v} r="3.5"
          fill={T.bg} stroke={T.brand} strokeWidth="1.5"/>
      })}
      {metrics.map((m, j) => {
        const a = -Math.PI/2 + j * (Math.PI*2/metrics.length)
        return (
          <g key={`l-${j}`}>
            <text x={Math.cos(a)*(r+18)} y={Math.sin(a)*(r+18)-3}
              textAnchor="middle" dominantBaseline="middle"
              fontFamily={FONTS.label} fontSize="8" letterSpacing="1.5"
              fill={T.textMute}>
              {(m.label || '').toUpperCase().slice(0, 6)}
            </text>
            <text x={Math.cos(a)*(r+18)} y={Math.sin(a)*(r+18)+10}
              textAnchor="middle" dominantBaseline="middle"
              fontFamily={FONTS.serif} fontStyle="italic" fontSize="13"
              fill={T.text}>{m.score}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function Sparkline({ data, color, w = 160, h = 36 }) {
  const { T } = useTheme()
  if (!data || data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / (max - min || 1)) * (h - 6) - 3
    return `${x},${y}`
  })
  const c = color || T.brand
  const [lastX, lastY] = pts[pts.length - 1].split(',')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }}>
      <polyline points={pts.join(' ')} fill="none" stroke={c} strokeWidth="1.5"/>
      <circle cx={lastX} cy={lastY} r="2.5" fill={c}/>
    </svg>
  )
}

export function MetricBar({ m }) {
  const { T } = useTheme()
  const avg = m.avg ?? Math.max(0, m.score - 6)
  return (
    <div style={{
      padding: '14px 0',
      display: 'grid', gridTemplateColumns: '160px 1fr 70px 50px', gap: 16,
      alignItems: 'center', borderTop: `1px solid ${T.ruleHair}`,
    }}>
      <div style={{
        fontFamily: FONTS.label, fontSize: 10, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: T.textSoft,
      }}>{m.label}</div>
      <div style={{ height: 2, background: T.ruleSoft, position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${avg}%`, background: T.textFade,
          borderRight: `2px solid ${T.textMute}`,
        }}/>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${m.score}%`, background: T.brand,
          transition: `width 800ms ${EASE.editorial}`,
        }}/>
        <div style={{
          position: 'absolute', left: `${m.score}%`, top: -3,
          width: 2, height: 8, background: T.brandSoft, transform: 'translateX(-1px)',
        }}/>
      </div>
      <div style={{
        fontFamily: FONTS.serif, fontStyle: 'italic',
        fontSize: 24, color: T.text, textAlign: 'right',
      }}>{m.score}</div>
      <div style={{
        fontFamily: FONTS.mono, fontSize: 10,
        color: (m.delta ?? 0) >= 0 ? T.green : T.accent, textAlign: 'right',
      }}>{(m.delta ?? 0) >= 0 ? '+' : ''}{m.delta ?? 0}</div>
    </div>
  )
}

// ─── Number theatre ───
export function NumberTheatre({ items, big = false }) {
  const { T } = useTheme()
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      border: `1px solid ${T.rule}`, background: T.panel,
    }}>
      {items.map((x, i) => (
        <div key={i} style={{
          padding: big ? '32px 24px' : '22px 18px',
          borderLeft: i ? `1px solid ${T.ruleSoft}` : 'none',
        }}>
          <div style={{
            fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.24em',
            textTransform: 'uppercase', color: T.textMute, marginBottom: 8,
          }}>{x.label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{
              fontFamily: FONTS.serif,
              fontSize: big ? 78 : 56, fontWeight: 400,
              lineHeight: 0.95, letterSpacing: -2, color: T.brand,
            }}>{x.value}</span>
            {x.suffix && (
              <span style={{
                fontFamily: FONTS.mono, fontSize: 11, color: T.green,
              }}>{x.suffix}</span>
            )}
          </div>
          {x.sub && (
            <div style={{
              marginTop: 6, fontFamily: FONTS.label, fontSize: 10,
              letterSpacing: '0.18em', color: T.textMute, textTransform: 'uppercase',
            }}>{x.sub}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// Field (label + underlined input) for editorial forms
export function Field({ label, value, onChange, type = 'text', placeholder, autoComplete }) {
  const { T } = useTheme()
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.28em',
        textTransform: 'uppercase', color: T.textMute, marginBottom: 8,
      }}>{label}</div>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '12px 0', background: 'transparent',
          border: 'none', borderBottom: `1px solid ${T.rule}`,
          fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 18,
          color: T.text, outline: 'none',
        }}/>
    </div>
  )
}
