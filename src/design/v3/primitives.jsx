import { useEffect, useRef, useState } from 'react'
import { useV3Theme } from './ThemeProvider.jsx'
import { EASE, FONT, G } from './tokens.js'

export function AuroraBG({ intensity = 1, children, style = {} }) {
  const { T, mode } = useV3Theme()
  return (
    <div style={{
      position: 'relative', minHeight: '100vh',
      background: T.pageBg, color: T.text, fontFamily: FONT.body,
      overflow: 'hidden', ...style,
    }}>
      <div aria-hidden style={{
        position: 'absolute', inset: '-20%', pointerEvents: 'none',
        background: mode === 'day' ? G.auroraDay : G.aurora,
        opacity: intensity, filter: 'blur(40px)',
        animation: 'emAurora 22s ease-in-out infinite alternate',
      }}/>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.4 0 0 0 0 0.6 0 0 0 0.4 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        opacity: mode === 'day' ? 0.03 : 0.06,
        mixBlendMode: 'overlay',
      }}/>
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  )
}

export function Glass({ children, style = {}, hover = false, padding = 24, ...rest }) {
  const { T, mode } = useV3Theme()
  const [hov, setHov] = useState(false)
  return (
    <div {...rest}
      onMouseEnter={hover ? () => setHov(true) : undefined}
      onMouseLeave={hover ? () => setHov(false) : undefined}
      style={{
        background: mode === 'day' ? G.glassDay : (hov ? G.glassHi : G.glass),
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        border: `1px solid ${hov ? T.borderHi : T.border}`,
        borderRadius: 20,
        padding,
        transition: `all 280ms ${EASE.springFast}`,
        boxShadow: hov ? T.shadow : T.shadowSm,
        ...style,
      }}>{children}</div>
  )
}

export function Btn({ children, variant = 'ghost', size = 'md', onClick, icon, trailingIcon, disabled, full, style = {}, type = 'button' }) {
  const { T } = useV3Theme()
  const [hov, setHov] = useState(false)
  const sizes = {
    sm: { py: 8, px: 14, fs: 12, gap: 6 },
    md: { py: 12, px: 20, fs: 13, gap: 8 },
    lg: { py: 16, px: 28, fs: 14, gap: 10 },
  }
  const s = sizes[size]
  const variants = {
    primary: { bg: G.brand, color: '#fff', border: '1px solid rgba(255,255,255,0.18)',
      shadow: hov ? T.ringBrand : '0 8px 24px -10px rgba(217,70,239,0.4)' },
    secondary: { bg: hov ? T.surfaceHi : T.surface, color: T.text,
      border: `1px solid ${T.borderHi}`, shadow: 'none' },
    ghost: { bg: hov ? T.surface : 'transparent', color: T.textSoft,
      border: '1px solid transparent', shadow: 'none' },
    danger: { bg: hov ? 'rgba(251,113,133,0.18)' : 'rgba(251,113,133,0.10)',
      color: T.bad, border: `1px solid ${T.bad}`, shadow: 'none' },
    ember: { bg: G.ember, color: '#fff', border: '1px solid rgba(255,255,255,0.18)',
      shadow: hov ? '0 0 40px -6px rgba(251,146,60,0.5)' : '0 8px 24px -10px rgba(251,146,60,0.4)' },
  }
  const v = variants[variant] || variants.ghost
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative', overflow: 'hidden',
        padding: `${s.py}px ${s.px}px`, fontSize: s.fs,
        fontFamily: FONT.body, fontWeight: 600,
        letterSpacing: variant === 'primary' || variant === 'ember' ? '0.06em' : '0.02em',
        color: v.color, background: v.bg, border: v.border,
        borderRadius: 999, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
        width: full ? '100%' : undefined,
        boxShadow: v.shadow,
        transform: hov && !disabled ? 'translateY(-1px)' : 'translateY(0)',
        transition: `all 220ms ${EASE.springFast}`,
        ...style,
      }}>
      {(variant === 'primary' || variant === 'ember') && (
        <span aria-hidden style={{ position: 'absolute', inset: 0,
          background: G.sheen, borderRadius: 999, pointerEvents: 'none' }}/>
      )}
      {icon && <span className="material-symbols-outlined" style={{ fontSize: s.fs + 4, zIndex: 1 }}>{icon}</span>}
      <span style={{ zIndex: 1 }}>{children}</span>
      {trailingIcon && <span className="material-symbols-outlined" style={{ fontSize: s.fs + 4, zIndex: 1 }}>{trailingIcon}</span>}
    </button>
  )
}

export function Pill({ children, tone = 'neutral', icon, size = 'md', style = {} }) {
  const { T } = useV3Theme()
  const tones = {
    neutral: { bg: T.surface, color: T.textSoft, border: T.border },
    brand: { bg: 'rgba(217,70,239,0.14)', color: T.brandInk || T.brand, border: 'rgba(217,70,239,0.35)' },
    emerald: { bg: 'rgba(52,211,153,0.12)', color: T.emerald, border: 'rgba(52,211,153,0.35)' },
    rose: { bg: 'rgba(251,113,133,0.12)', color: T.rose, border: 'rgba(251,113,133,0.35)' },
    amber: { bg: 'rgba(252,211,77,0.12)', color: T.amber, border: 'rgba(252,211,77,0.35)' },
    sky: { bg: 'rgba(96,165,250,0.12)', color: T.sky, border: 'rgba(96,165,250,0.35)' },
    violet: { bg: 'rgba(139,92,246,0.14)', color: T.violet, border: 'rgba(139,92,246,0.35)' },
    ember: { bg: 'rgba(251,146,60,0.14)', color: T.ember, border: 'rgba(251,146,60,0.35)' },
    solid: { bg: G.brand, color: '#fff', border: 'transparent' },
  }
  const t = tones[tone] || tones.neutral
  const sz = size === 'sm' ? { fs: 10, py: 3, px: 8 } : { fs: 11, py: 4, px: 10 }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: `${sz.py}px ${sz.px}px`, fontSize: sz.fs, fontWeight: 600,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      fontFamily: FONT.body, whiteSpace: 'nowrap',
      background: t.bg, color: t.color, border: `1px solid ${t.border}`,
      borderRadius: 999, ...style,
    }}>
      {icon && <span className="material-symbols-outlined" style={{ fontSize: sz.fs + 2 }}>{icon}</span>}
      {children}
    </span>
  )
}

export function Field({ label, value, onChange, type = 'text', placeholder, icon, trailing, autoComplete, required, style = {} }) {
  const { T } = useV3Theme()
  const [focus, setFocus] = useState(false)
  return (
    <div style={{ marginBottom: 14, ...style }}>
      {label && (
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: T.textDim, marginBottom: 8 }}>{label}</div>
      )}
      <div style={{ position: 'relative',
        background: T.surface,
        border: `1px solid ${focus ? 'rgba(217,70,239,0.5)' : T.border}`,
        borderRadius: 999, padding: '2px 4px 2px 18px',
        display: 'flex', alignItems: 'center', gap: 8,
        boxShadow: focus ? '0 0 0 3px rgba(217,70,239,0.15)' : 'none',
        transition: `all 200ms ${EASE.springFast}` }}>
        {icon && <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.textDim }}>{icon}</span>}
        <input type={type} value={value} onChange={e => onChange && onChange(e.target.value)}
          placeholder={placeholder} autoComplete={autoComplete} required={required}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none',
            // 16px (not 14): iOS Safari auto-zooms — and horizontally overflows
            // the page — when a focused input's font-size is under 16px.
            padding: '13px 14px 13px 0', fontSize: 16, fontFamily: FONT.body,
            color: T.text, width: '100%' }}/>
        {trailing}
      </div>
    </div>
  )
}

export function Avatar({ initials = 'AG', size = 36, onClick, ring = true }) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius: '50%',
      background: G.brand, color: '#fff',
      fontFamily: FONT.display, fontWeight: 700, fontSize: size * 0.38,
      letterSpacing: '0.02em',
      border: ring ? '2px solid rgba(255,255,255,0.14)' : 'none',
      boxShadow: ring ? '0 0 0 2px rgba(217,70,239,0.35), 0 8px 20px -8px rgba(217,70,239,0.5)' : 'none',
      cursor: onClick ? 'pointer' : 'default',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {initials}
    </button>
  )
}

export function Skyline({ size = 28, style = {} }) {
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 80 50" style={style} aria-hidden>
      <defs>
        <linearGradient id="v3skyg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8B5CF6"/>
          <stop offset="55%" stopColor="#D946EF"/>
          <stop offset="100%" stopColor="#F472B6"/>
        </linearGradient>
      </defs>
      <g fill="url(#v3skyg)">
        <rect x="2" y="28" width="5" height="22"/>
        <rect x="9" y="20" width="6" height="30"/>
        <rect x="17" y="24" width="5" height="26"/>
        <rect x="24" y="10" width="7" height="40"/>
        <polygon points="27.5,2 24,10 31,10"/>
        <rect x="33" y="18" width="6" height="32"/>
        <rect x="41" y="12" width="8" height="38"/>
        <rect x="51" y="22" width="5" height="28"/>
        <rect x="58" y="16" width="7" height="34"/>
        <rect x="67" y="26" width="5" height="24"/>
        <rect x="74" y="30" width="4" height="20"/>
      </g>
    </svg>
  )
}

export function Wordmark({ size = 22, dim = false, skyline = false }) {
  const { T } = useV3Theme()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6,
      fontFamily: FONT.display, fontWeight: 600, fontSize: size,
      letterSpacing: '-0.02em', color: dim ? T.textDim : T.text, lineHeight: 1 }}>
      {skyline && <Skyline size={size * 1.1}/>}
      <span>English</span>
      <span style={{ background: G.brand, WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Metro</span>
      <span style={{ color: T.ember }}>.</span>
      <span style={{ fontSize: size * 0.6, color: T.textDim, marginLeft: -4 }}>com</span>
    </span>
  )
}

export function Skeleton({ h = 80, w = '100%', style = {} }) {
  return (
    <div style={{ height: h, width: w, borderRadius: 12,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%)',
      backgroundSize: '200% 100%',
      animation: 'emShimmer 1.6s ease-in-out infinite', ...style }}/>
  )
}

export function MetricBar({ value, max = 100, color = '#D946EF', h = 6 }) {
  return (
    <div style={{ width: '100%', height: h,
      background: 'rgba(255,255,255,0.06)', borderRadius: h,
      overflow: 'hidden' }}>
      <div style={{ width: `${(value/max) * 100}%`, height: '100%',
        background: `linear-gradient(90deg, ${color}80, ${color})`,
        borderRadius: h,
        boxShadow: `0 0 8px ${color}80`,
        transition: `width 720ms ${EASE.editorial}` }}/>
    </div>
  )
}

export function useNumberFlow(target, { duration = 1400 } = {}) {
  const [val, setVal] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    const start = performance.now()
    const to = Number(target) || 0
    const ease = (t) => 1 - Math.pow(1 - t, 4)
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration)
      setVal(Math.round(to * ease(p) * 10) / 10)
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else setVal(to)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  return val
}
