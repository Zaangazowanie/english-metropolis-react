import { useEffect, useState } from 'react'
import { useAnimatedValue } from './useAnimatedValue.js'

export function AnimatedNumber({ value, decimals = 0, suffix = '', duration, style, className }) {
  const v = useAnimatedValue(value, { duration })
  return <span className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{v.toFixed(decimals)}{suffix}</span>
}

// <ProgressRing value max size stroke color track> — SVG ring that eases to
// its value. Children render centred inside (the number, a label).
export function ProgressRing({ value = 0, max = 100, size = 64, stroke = 6, color = '#D946EF', track = 'rgba(255,255,255,0.10)', children, style, title }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, (Number(value) || 0) / (max || 1)))
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id) }, [])
  const offset = c * (1 - (mounted ? pct : 0))
  return (
    <div role="img" aria-label={title} style={{ position: 'relative', width: size, height: size, flexShrink: 0, ...style }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', display: 'block' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke}/>
        <circle className="em-ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}/>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{children}</div>
    </div>
  )
}

// <ProgressBar value max color h> — scaleX fill (transform, not width).
export function ProgressBar({ value = 0, max = 100, color = '#D946EF', h = 6, track = 'rgba(255,255,255,0.08)', style }) {
  const pct = Math.max(0, Math.min(1, (Number(value) || 0) / (max || 1)))
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id) }, [])
  return (
    <div style={{ width: '100%', height: h, background: track, borderRadius: h, overflow: 'hidden', ...style }}>
      <div className="em-bar-fill" style={{ width: '100%', height: '100%', borderRadius: h,
        background: `linear-gradient(90deg, ${color}80, ${color})`, boxShadow: `0 0 8px ${color}80`,
        transform: `scaleX(${mounted ? pct : 0})` }}/>
    </div>
  )
}
