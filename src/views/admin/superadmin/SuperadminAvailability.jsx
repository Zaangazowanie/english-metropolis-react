// SuperadminAvailability — set a teacher's weekly availability from the superadmin
// console. Redesigned 2026-07-09 (Mike): grouped BY DAY (one card per weekday, a
// day's time ranges live together), and the lesson cadence is a FIXED GLOBAL
// POLICY — 60-minute lessons with 15-minute breaks — no per-row inputs.
//
// Model: edit ONE teacher's own rows at a time. Superadmin setWeeklyAvailability
// with that teacherId replaces just those rows; everything else currently bookable
// is shown read-only so nothing is hidden (Bajla offers the union of all of it).

import { useEffect, useState, useCallback } from 'react'
import { queryAdminConvex, mutateAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

// Global lesson cadence — Mike's platform-wide policy (2026-07-09).
const LESSON_MIN = 60
const GAP_MIN = 15
const STRIDE = LESSON_MIN + GAP_MIN

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DOW_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function timeToMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }
function minToTime(t) { return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }

function windowSlots(w) {
  const start = timeToMin(w.startTime), end = timeToMin(w.endTime)
  if (start + LESSON_MIN > end) return []
  const out = []
  for (let t = start; t + LESSON_MIN <= end && out.length < 24; t += STRIDE) out.push(t)
  return out
}

// Where the last lesson of a window actually ends — used to spot (and snap away)
// dangling minutes that can never hold a lesson.
function lastLessonEnd(w) {
  const slots = windowSlots(w)
  return slots.length ? slots[slots.length - 1] + LESSON_MIN : null
}

// Global scope = Mike teaches once, both orgs mirror (Conversa per-teacher rows
// + English Metropolis PVT legacy org-wide rows — same model Bajla writes).
const GLOBAL = 'global'
const ORG_CONVERSA = 'js7cb568fpf7qhkqqe55a7jz5s83sadf'
const ORG_PVT = 'js779cs2vjwb2c9yjc3a7t619n84zcp8'
const ORG_EXCLUDED = ['js75nwh5xaac0450bpgdhn5vhx84znf4']   // English Line (departed client)

export default function SuperadminAvailability() {
  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgId] = useState(GLOBAL)
  const [teachers, setTeachers] = useState([])
  const [teacherId, setTeacherId] = useState('')
  const [allRows, setAllRows] = useState([])   // every availability row for the org
  const [draft, setDraft] = useState([])       // flat window list (mutation shape)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let alive = true
    queryAdminConvex('students:listOrganizations', {})
      .then(list => {
        if (!alive) return
        setOrgs((list || []).filter(o => !ORG_EXCLUDED.includes(o._id)))
      })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [])

  const loadOrg = useCallback(async (id) => {
    if (!id) return
    const realOrg = id === GLOBAL ? ORG_CONVERSA : id
    setLoading(true); setNotice(null); setError(null)
    try {
      const [tList, rows] = await Promise.all([
        queryAdminConvex('teachers:listTeachers', { organizationId: realOrg, includeRemoved: false }),
        queryAdminConvex('scheduling:getWeeklyAvailability', { organizationId: realOrg }),
      ])
      setTeachers(tList || [])
      setAllRows(rows || [])
      const real = (tList || []).find(t => !/test/i.test(t.name || '') && !/\.test$/i.test(t.email || ''))
      setTeacherId(prev => (tList || []).some(t => t._id === prev) ? prev : (real?._id || tList?.[0]?._id || ''))
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (orgId) loadOrg(orgId) }, [orgId, loadOrg])

  useEffect(() => {
    setDraft(allRows
      .filter(r => String(r.teacherId ?? '') === String(teacherId))
      .map(w => ({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime })))
  }, [allRows, teacherId])

  const updateWindow = (i, patch) => setDraft(d => d.map((w, idx) => idx === i ? { ...w, ...patch } : w))
  const removeWindow = (i) => setDraft(d => d.filter((_, idx) => idx !== i))
  const addWindowFor = (dow) => setDraft(d => [...d, { dayOfWeek: dow, startTime: '17:00', endTime: '20:30' }])

  const save = async () => {
    if (busy || !orgId || !teacherId) return
    for (const w of draft) {
      if (timeToMin(w.startTime) + LESSON_MIN > timeToMin(w.endTime)) {
        setNotice({ kind: 'err', text: `Each block must fit at least one ${LESSON_MIN}-minute lesson.` })
        return
      }
    }
    setBusy(true); setNotice(null)
    try {
      const windows = draft.map(w => ({
        dayOfWeek: Number(w.dayOfWeek), startTime: w.startTime, endTime: w.endTime,
        slotMinutes: LESSON_MIN, gapMinutes: GAP_MIN,
      }))
      if (orgId === GLOBAL) {
        // Mirror to every org Mike teaches in: Conversa per-teacher rows +
        // EM PVT legacy org-wide rows (that org has no teacher user rows).
        await mutateAdminConvex('scheduling:setWeeklyAvailability', { organizationId: ORG_CONVERSA, teacherId, windows })
        await mutateAdminConvex('scheduling:setWeeklyAvailability', { organizationId: ORG_PVT, windows })
        setNotice({ kind: 'ok', text: `Saved GLOBALLY — ${windows.length} weekly block${windows.length === 1 ? '' : 's'} mirrored to Conversa and English Metropolis PVT at ${LESSON_MIN}-minute lessons / ${GAP_MIN}-minute breaks.` })
      } else {
        await mutateAdminConvex('scheduling:setWeeklyAvailability', { organizationId: orgId, teacherId, windows })
        setNotice({ kind: 'ok', text: `Saved — ${windows.length} weekly block${windows.length === 1 ? '' : 's'} for ${teacherName} in this organisation only.` })
      }
      await loadOrg(orgId)
    } catch (err) {
      setNotice({ kind: 'err', text: String(err?.message || 'Could not save.').replace(/^.*Error: /, '') })
    } finally { setBusy(false) }
  }

  const teacherName = teachers.find(t => t._id === teacherId)?.name || 'this teacher'
  const teacherById = (id) => teachers.find(t => t._id === id)?.name
  const otherRows = allRows.filter(r => String(r.teacherId ?? '') !== String(teacherId))

  // Group the flat draft by weekday, remembering each window's index in the
  // flat list so edits/removals stay simple.
  const byDay = DOW_ORDER.map(dow => ({
    dow,
    windows: draft.map((w, i) => ({ ...w, i })).filter(w => Number(w.dayOfWeek) === dow),
  }))
  const totalSlots = draft.reduce((n, w) => n + windowSlots(w).length, 0)

  return (
    <div className="space-y-5">
      <div className="sa-card">
        <div className="sa-card-header" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2>Teaching availability</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="sa-badge sa-badge-committed" title="Global lesson cadence — applies to every block">
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>timer</span>
              {LESSON_MIN}-min lessons · {GAP_MIN}-min breaks
            </span>
            <select className="sa-input" value={orgId} onChange={e => setOrgId(e.target.value)} style={{ maxWidth: 260 }}>
              <option value={GLOBAL}>🌍 Global (all my teaching)</option>
              {orgs.map(o => <option key={o._id} value={o._id}>{o.name} only</option>)}
            </select>
            <select className="sa-input" value={teacherId} onChange={e => setTeacherId(e.target.value)} style={{ maxWidth: 220 }}>
              {teachers.length === 0 && <option value="">No teachers</option>}
              {teachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="sa-card-body">
          <p style={{ fontSize: '0.85rem', lineHeight: 1.6, maxWidth: '52rem' }}>
            Editing <strong>{teacherName}</strong>’s weekly hours, one card per day. Lesson length and breaks are a
            global policy — <strong>{LESSON_MIN}-minute lessons, {GAP_MIN}-minute breaks</strong> — so you only set
            <em> when</em> each day starts and ends. A 17:00–20:30 block opens 17:00, 18:15 and 19:30. Times are
            Europe/Warsaw. Saving replaces only this teacher’s rows; Bajla offers every teacher’s open slots.
          </p>

          {error && <p className="mt-4" style={{ color: '#FB7185' }}>Error: {error}</p>}

          {notice && (
            <div className="mt-4" style={{
              borderRadius: '0.9rem', padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600,
              border: `1px solid ${notice.kind === 'ok' ? 'rgba(52,211,153,0.35)' : 'rgba(251,113,133,0.35)'}`,
              background: notice.kind === 'ok' ? 'rgba(52,211,153,0.10)' : 'rgba(251,113,133,0.10)',
              color: notice.kind === 'ok' ? '#34D399' : '#FB7185',
            }}>{notice.text}</div>
          )}

          {loading ? (
            <p className="mt-5" style={{ color: '#8A83AE' }}>Loading…</p>
          ) : (
            <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
              {byDay.map(({ dow, windows }) => {
                const daySlots = windows
                  .flatMap(w => windowSlots(w))
                  .sort((a, b) => a - b)
                return (
                  <div key={dow} style={{
                    borderRadius: '1rem', padding: '0.9rem 1rem',
                    border: `1px solid ${windows.length ? 'rgba(217,70,239,0.22)' : 'rgba(255,255,255,0.07)'}`,
                    background: windows.length ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.015)',
                  }}>
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                        fontSize: '0.78rem', color: windows.length ? '#F4F0FF' : '#5E567C' }}>
                        {DOW_LABEL[dow]}
                      </span>
                      <div className="flex items-center gap-2">
                        {windows.length > 0 && (
                          <span className="sa-badge sa-badge-processing">{daySlots.length} lesson{daySlots.length === 1 ? '' : 's'}</span>
                        )}
                        <button onClick={() => addWindowFor(dow)} title={`Add hours on ${DOW_LABEL[dow]}`}
                          className="sa-btn sa-btn-ghost" style={{ padding: '0.3rem 0.7rem' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                        </button>
                      </div>
                    </div>

                    {windows.length === 0 ? (
                      <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#5E567C' }}>Off — no hours set.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {windows.map(w => {
                          const endsAt = lastLessonEnd(w)
                          const wasted = endsAt !== null ? timeToMin(w.endTime) - endsAt : 0
                          return (
                            <div key={w.i} className="flex flex-wrap items-center gap-2">
                              <input type="time" className="sa-input" style={{ width: '7.2rem' }}
                                value={w.startTime} onChange={e => updateWindow(w.i, { startTime: e.target.value })} />
                              <span style={{ color: '#8A83AE' }}>–</span>
                              <input type="time" className="sa-input" style={{ width: '7.2rem' }}
                                value={w.endTime} onChange={e => updateWindow(w.i, { endTime: e.target.value })} />
                              {wasted > 0 && (
                                <button onClick={() => updateWindow(w.i, { endTime: minToTime(endsAt) })}
                                  title={`The last lesson ends ${minToTime(endsAt)} — trim the dangling ${wasted} min`}
                                  className="sa-badge sa-badge-awaiting_review" style={{ cursor: 'pointer', border: 'none' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>content_cut</span>
                                  snap to {minToTime(endsAt)}
                                </button>
                              )}
                              {windowSlots(w).length === 0 && (
                                <span style={{ color: '#FB7185', fontSize: '0.72rem' }}>too short for one lesson</span>
                              )}
                              <button onClick={() => removeWindow(w.i)} title="Remove these hours"
                                className="sa-btn sa-btn-ghost ml-auto" style={{ padding: '0.3rem 0.6rem' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                              </button>
                            </div>
                          )
                        })}
                        <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: '0.6rem' }}>
                          <span className="sa-stat-label">Opens</span>
                          {daySlots.map(s => <span key={s} className="sa-badge sa-badge-processing">{minToTime(s)}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span style={{ fontSize: '0.8rem', color: '#8A83AE' }}>
              {totalSlots} bookable lesson{totalSlots === 1 ? '' : 's'} per week
            </span>
            <button onClick={save} disabled={busy || loading || !teacherId} className="sa-btn sa-btn-primary">
              <span className="material-symbols-outlined text-lg">save</span>{busy ? 'Saving…' : 'Save availability'}
            </button>
          </div>
        </div>
      </div>

      {/* Everything else Bajla currently offers — read-only, so nothing is hidden. */}
      {!loading && otherRows.length > 0 && (
        <div className="sa-card">
          <div className="sa-card-header"><h2>Also bookable now</h2></div>
          <div className="sa-card-body">
            <p style={{ fontSize: '0.82rem', lineHeight: 1.6, maxWidth: '46rem' }}>
              These slots belong to other teachers or to legacy org-wide rows and are <em>also</em> offered by Bajla.
              Switch the teacher above to edit any of them; legacy rows are managed under the teacher who owns them.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {otherRows.slice().sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((r, i) => (
                <span key={i} className="sa-badge sa-badge-queued" style={{ fontSize: '0.72rem' }}>
                  {DOW_SHORT[r.dayOfWeek]} {r.startTime}–{r.endTime} · {teacherById(r.teacherId) || (r.teacherId ? 'teacher' : 'org-wide')}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
