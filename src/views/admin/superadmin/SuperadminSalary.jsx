import { useEffect, useState, useMemo } from 'react'

// ── Pay rates (PLN) ──
const RATE_FLEXIBLE = 60
const RATE_COMPANY_IND = 70
const RATE_GROUP = 90

// ── Panel lessons data is fetched from a static JSON on the server ──
// For now we embed the logic to fetch from the VPS-hosted file.
// In production this would be a Convex query.

const MONTHS = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
}

function parseDayHeader(dh) {
  if (!dh) return null
  const m = dh.match(/\w+,\s+(\w+)\s+(\d+)/)
  if (!m) return null
  const month = MONTHS[m[1]]
  const day = parseInt(m[2])
  if (!month) return null
  const year = month >= 10 ? 2025 : 2026
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getDurationMins(startTime, endTime) {
  if (!startTime || !endTime) return 60
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

function classifyLesson(lesson) {
  const badges = lesson.badges || []
  const students = lesson.students_text || ''
  const groupName = lesson.group_name || ''
  const isIndividual = groupName.toLowerCase().startsWith('ind.') || students === '1 student'
  const isFlexible = badges.includes('Flexible')
  const isCanceled = badges.includes('Canceled')
  const isTimeOff = badges.includes('Time off')
  const isSekretariat = groupName.toLowerCase().includes('sekretariat')
  const status = (lesson.status || [])

  // Time off is unpaid, but Availability + Sekretariat is still a real lesson
  if (isCanceled || (isTimeOff && !isSekretariat)) return { type: 'skip', rate: 0 }
  if (!status.includes('Completed') && !status.includes('Confirmed')) return { type: 'skip', rate: 0 }

  // Sekretariat: always billed as 45 min at group rate (90 PLN/60min)
  if (isSekretariat) {
    return { type: 'Sekretariat', rate: 67.5 }
  }

  if (isIndividual && isFlexible) return { type: 'Flexible', rate: RATE_FLEXIBLE }
  if (isIndividual) return { type: 'Company Ind.', rate: RATE_COMPANY_IND }
  return { type: 'Group', rate: RATE_GROUP }
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function getMonthKey(dateStr) {
  return dateStr.slice(0, 7) // "2025-10"
}

function formatPLN(n) {
  return n.toLocaleString('pl-PL') + ' zł'
}

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function SuperadminSalary() {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('month') // 'month' | 'week' | 'day'

  useEffect(() => {
    async function load() {
      try {
        // Load both panel scrapes
        const [r1, r2] = await Promise.all([
          fetch('/data/lessons_raw.json').then(r => r.ok ? r.json() : []),
          fetch('/data/lessons_catchup.json').then(r => r.ok ? r.json() : []),
        ])
        setLessons([...r1, ...r2])
      } catch (e) {
        console.error('Failed to load lessons:', e)
      }
      setLoading(false)
    }
    load()
  }, [])

  const processed = useMemo(() => {
    const rows = []
    for (const l of lessons) {
      const date = parseDayHeader(l.day_header)
      if (!date) continue
      const { type, rate } = classifyLesson(l)
      if (type === 'skip') continue
      rows.push({
        date,
        time: l.start_time,
        group: l.group_name || '?',
        type,
        rate,
        students: l.students_text,
        badges: l.badges,
      })
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
    return rows
  }, [lessons])

  const totals = useMemo(() => {
    const grand = { lessons: 0, amount: 0, byType: {} }
    const months = {}
    const weeks = {}
    const days = {}

    for (const r of processed) {
      grand.lessons++
      grand.amount += r.rate
      grand.byType[r.type] = (grand.byType[r.type] || 0) + 1

      const mk = getMonthKey(r.date)
      if (!months[mk]) months[mk] = { lessons: 0, amount: 0, flexible: 0, company: 0, group: 0 }
      months[mk].lessons++
      months[mk].amount += r.rate
      if (r.type === 'Flexible') months[mk].flexible++
      else if (r.type === 'Company Ind.') months[mk].company++
      else months[mk].group++

      const wk = getWeekKey(r.date)
      if (!weeks[wk]) weeks[wk] = { lessons: 0, amount: 0 }
      weeks[wk].lessons++
      weeks[wk].amount += r.rate

      if (!days[r.date]) days[r.date] = { lessons: 0, amount: 0, items: [] }
      days[r.date].lessons++
      days[r.date].amount += r.rate
      days[r.date].items.push(r)
    }

    return { grand, months, weeks, days }
  }, [processed])

  if (loading) return <div className="sa-card" style={{ padding: 32 }}>Loading salary data…</div>

  const { grand, months, weeks, days } = totals

  return (
    <div className="space-y-6">
      <div className="sa-card">
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>English Line Salary Calculator</h2>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
          Oct 2025 – present · Rates: Flexible {RATE_FLEXIBLE} zł · Company Ind. {RATE_COMPANY_IND} zł · Group {RATE_GROUP} zł
        </p>

        {/* Grand totals */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
          <div className="sa-card" style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#38bdf8' }}>{formatPLN(grand.amount)}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total earned</div>
          </div>
          <div className="sa-card" style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{grand.lessons}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Lessons</div>
          </div>
          <div className="sa-card" style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{grand.byType['Group'] || 0}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Group (90zł)</div>
          </div>
          <div className="sa-card" style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{grand.byType['Company Ind.'] || 0}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Company (70zł)</div>
          </div>
          <div className="sa-card" style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{grand.byType['Flexible'] || 0}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Flexible (60zł)</div>
          </div>
        </div>

        {/* View selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['month', 'week', 'day'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`sa-btn ${view === v ? 'sa-btn-primary' : ''}`}
              style={{ textTransform: 'capitalize', fontSize: 13 }}
            >{v}</button>
          ))}
        </div>

        {/* Monthly view */}
        {view === 'month' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8' }}>Month</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>Lessons</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>Group</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>Company</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>Flexible</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#38bdf8', fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([mk, m]) => {
                const [y, mo] = mk.split('-')
                return (
                  <tr key={mk} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px 12px' }}>{MONTH_NAMES[parseInt(mo)]} {y}</td>
                    <td style={{ textAlign: 'right', padding: '8px 12px' }}>{m.lessons}</td>
                    <td style={{ textAlign: 'right', padding: '8px 12px', color: '#a78bfa' }}>{m.group}</td>
                    <td style={{ textAlign: 'right', padding: '8px 12px', color: '#34d399' }}>{m.company}</td>
                    <td style={{ textAlign: 'right', padding: '8px 12px', color: '#fbbf24' }}>{m.flexible}</td>
                    <td style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700, color: '#38bdf8' }}>{formatPLN(m.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Weekly view */}
        {view === 'week' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8' }}>Week</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>Lessons</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#38bdf8', fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).map(([wk, w]) => (
                <tr key={wk} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '8px 12px' }}>{wk}</td>
                  <td style={{ textAlign: 'right', padding: '8px 12px' }}>{w.lessons}</td>
                  <td style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700, color: '#38bdf8' }}>{formatPLN(w.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Daily view */}
        {view === 'day' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8' }}>Date</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>Lessons</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#38bdf8', fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(days).sort(([a], [b]) => b.localeCompare(a)).map(([dk, d]) => (
                <tr key={dk} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                    title={d.items.map(i => `${i.time} ${i.group} (${i.type} ${i.rate}zł)`).join('\n')}>
                  <td style={{ padding: '8px 12px' }}>{dk}</td>
                  <td style={{ textAlign: 'right', padding: '8px 12px' }}>{d.lessons}</td>
                  <td style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700, color: '#38bdf8' }}>{formatPLN(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
