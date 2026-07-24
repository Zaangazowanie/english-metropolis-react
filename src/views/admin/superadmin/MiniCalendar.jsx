// MiniCalendar — Metropolis-styled month grid used by the scheduler and the
// console month overview. Controlled: value 'YYYY-MM-DD' (or ''), onPick(date).
// Optional `marks` = { 'YYYY-MM-DD': count } renders booking dots.

import { useState } from 'react'

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function ymd(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function MiniCalendar({ value, onPick, marks = {}, minToday = true }) {
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate())
  const init = value ? new Date(`${value}T12:00:00`) : today
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() })

  const first = new Date(view.y, view.m, 1)
  const startPad = (first.getDay() + 6) % 7          // Monday-first
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const nav = (dir) => setView(v => {
    const m = v.m + dir
    return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }
  })

  return (
    <div style={{ width: 252, borderRadius: 'var(--sa-radius-card)', border: '1px solid var(--sa-border)',
      background: 'var(--sa-surface)', padding: 10, boxShadow: 'var(--sa-shadow)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <button type="button" onClick={() => nav(-1)} className="sa-icon-btn sa-icon-btn-sm">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--sa-text)' }}>
          {MONTHS[view.m]} {view.y}
        </span>
        <button type="button" onClick={() => nav(1)} className="sa-icon-btn sa-icon-btn-sm">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {DOW.map(d => (
          <span key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.1em', color: 'var(--sa-text-muted)', padding: '2px 0' }}>{d}</span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`p${i}`} />
          const dateStr = ymd(view.y, view.m, d)
          const isPast = minToday && dateStr < todayStr
          const isSel = value === dateStr
          const isToday = dateStr === todayStr
          const mark = marks[dateStr]
          return (
            <button key={dateStr} type="button" disabled={isPast}
              onClick={() => onPick && onPick(dateStr)}
              style={{
                position: 'relative', height: 30, borderRadius: 8, fontSize: 12,
                fontWeight: isSel ? 800 : 500, cursor: isPast ? 'default' : 'pointer',
                border: isToday && !isSel ? '1px solid var(--sa-violet-600)' : '1px solid transparent',
                background: isSel ? 'var(--sa-violet-600)' : 'transparent',
                color: isSel ? 'var(--sa-surface)' : isPast ? 'var(--sa-text-muted)' : 'var(--sa-text)',
              }}>
              {d}
              {mark ? (
                <span style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                  width: 4, height: 4, borderRadius: '50%',
                  background: isSel ? 'var(--sa-surface)' : 'var(--sa-good)' }} />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
