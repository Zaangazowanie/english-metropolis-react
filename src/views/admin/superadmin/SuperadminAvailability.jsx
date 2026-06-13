// SuperadminAvailability — set a teacher's weekly availability from the superadmin
// console (built 2026-06-06). Mike teaches the lessons himself but had nowhere in
// superadmin to set when he's bookable; his own teacher record had no availability
// while slots were coming from a test teacher + legacy org-wide rows.
//
// Model: edit ONE teacher's own rows at a time. We load every availability row for
// the org (each carries its teacherId), let the user pick a teacher, and edit only
// that teacher's own rows — superadmin setWeeklyAvailability with that teacherId
// replaces just those rows. Everything else currently bookable is shown read-only
// so nothing is hidden (Bajla offers the union of all of it).
//
// Same windows→slots editor as the TeacherPortal, restyled for the dark theme.

import { useEffect, useState, useCallback } from 'react'
import { queryAdminConvex, mutateAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

const DOW_OPTIONS = [
  { v: 1, label: 'Monday' }, { v: 2, label: 'Tuesday' }, { v: 3, label: 'Wednesday' },
  { v: 4, label: 'Thursday' }, { v: 5, label: 'Friday' }, { v: 6, label: 'Saturday' },
  { v: 0, label: 'Sunday' },
]
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const blankWindow = () => ({ dayOfWeek: 1, startTime: '17:00', endTime: '18:00', slotMinutes: 50, gapMinutes: 10 })
function timeToMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }

function previewSlots(w) {
  const start = timeToMin(w.startTime), end = timeToMin(w.endTime)
  const slot = Number(w.slotMinutes), gap = Number(w.gapMinutes)
  if (!slot || start + slot > end) return []
  const out = []
  for (let t = start; t + slot <= end && out.length < 24; t += slot + gap) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  }
  return out
}

export default function SuperadminAvailability() {
  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgId] = useState('')
  const [teachers, setTeachers] = useState([])
  const [teacherId, setTeacherId] = useState('')
  const [allRows, setAllRows] = useState([])   // every availability row for the org
  const [draft, setDraft] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  // Org list once; default to Conversa (Bajla's org) when present.
  useEffect(() => {
    let alive = true
    queryAdminConvex('students:listOrganizations', {})
      .then(list => {
        if (!alive) return
        setOrgs(list || [])
        const conversa = (list || []).find(o => (o.slug || '').toLowerCase() === 'conversa')
        setOrgId(conversa?._id || list?.[0]?._id || '')
      })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [])

  // Teachers + all availability rows for the selected org.
  const loadOrg = useCallback(async (id) => {
    if (!id) return
    setLoading(true); setNotice(null); setError(null)
    try {
      const [tList, rows] = await Promise.all([
        queryAdminConvex('teachers:listTeachers', { organizationId: id, includeRemoved: false }),
        queryAdminConvex('scheduling:getWeeklyAvailability', { organizationId: id }),
      ])
      setTeachers(tList || [])
      setAllRows(rows || [])
      // Prefer a real (non-test) teacher; fall back to the first teacher.
      const real = (tList || []).find(t => !/test/i.test(t.name || '') && !/\.test$/i.test(t.email || ''))
      setTeacherId(prev => (tList || []).some(t => t._id === prev) ? prev : (real?._id || tList?.[0]?._id || ''))
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (orgId) loadOrg(orgId) }, [orgId, loadOrg])

  // Seed the editor with the selected teacher's OWN rows (never the legacy fallback).
  useEffect(() => {
    setDraft(allRows
      .filter(r => String(r.teacherId ?? '') === String(teacherId))
      .map(w => ({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime, slotMinutes: w.slotMinutes, gapMinutes: w.gapMinutes })))
  }, [allRows, teacherId])

  const updateWindow = (i, patch) => setDraft(d => d.map((w, idx) => idx === i ? { ...w, ...patch } : w))
  const removeWindow = (i) => setDraft(d => d.filter((_, idx) => idx !== i))
  const addWindow = () => setDraft(d => [...d, blankWindow()])

  const save = async () => {
    if (busy || !orgId || !teacherId) return
    for (const w of draft) {
      if (timeToMin(w.startTime) + Number(w.slotMinutes) > timeToMin(w.endTime)) {
        setNotice({ kind: 'err', text: 'Each window must fit at least one lesson — its end must be at least one slot after the start.' })
        return
      }
    }
    setBusy(true); setNotice(null)
    try {
      const windows = draft.map(w => ({
        dayOfWeek: Number(w.dayOfWeek), startTime: w.startTime, endTime: w.endTime,
        slotMinutes: Number(w.slotMinutes), gapMinutes: Number(w.gapMinutes),
      }))
      await mutateAdminConvex('scheduling:setWeeklyAvailability', { organizationId: orgId, teacherId, windows })
      setNotice({ kind: 'ok', text: `Saved — ${windows.length} weekly window${windows.length === 1 ? '' : 's'} for ${teacherName}. These open slots are now bookable (and offered by Bajla).` })
      await loadOrg(orgId)
    } catch (err) {
      setNotice({ kind: 'err', text: String(err?.message || 'Could not save.').replace(/^.*Error: /, '') })
    } finally { setBusy(false) }
  }

  const teacherName = teachers.find(t => t._id === teacherId)?.name || 'this teacher'
  const teacherById = (id) => teachers.find(t => t._id === id)?.name
  // Rows that belong to someone OTHER than the selected teacher (incl. legacy).
  const otherRows = allRows.filter(r => String(r.teacherId ?? '') !== String(teacherId))

  return (
    <div className="space-y-5">
      <div className="sa-card">
        <div className="sa-card-header" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2>Teaching availability</h2>
          <div className="flex items-center gap-2">
            <select className="sa-input" value={orgId} onChange={e => setOrgId(e.target.value)} style={{ maxWidth: 220 }}>
              {orgs.map(o => <option key={o._id} value={o._id}>{o.name}</option>)}
            </select>
            <select className="sa-input" value={teacherId} onChange={e => setTeacherId(e.target.value)} style={{ maxWidth: 220 }}>
              {teachers.length === 0 && <option value="">No teachers</option>}
              {teachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="sa-card-body">
          <p style={{ color: 'rgba(203,213,225,0.75)', fontSize: '0.85rem', lineHeight: 1.6, maxWidth: '46rem' }}>
            Editing <strong style={{ color: '#f1f5f9' }}>{teacherName}</strong>’s own weekly availability. Each window
            is split into bookable slots — a 17:00–20:00 window at 50-minute lessons with a 10-minute gap opens
            17:00, 18:00 and 19:00. Times are Europe/Warsaw. Saving replaces only this teacher’s rows; Bajla offers
            every teacher’s open slots.
          </p>

          {error && <p className="mt-4" style={{ color: '#fca5a5' }}>Error: {error}</p>}

          {notice && (
            <div className="mt-4" style={{
              borderRadius: '0.9rem', padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600,
              border: `1px solid ${notice.kind === 'ok' ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.35)'}`,
              background: notice.kind === 'ok' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
              color: notice.kind === 'ok' ? '#86efac' : '#fca5a5',
            }}>{notice.text}</div>
          )}

          <div className="mt-5 space-y-3">
            {loading ? (
              <p style={{ color: 'rgba(203,213,225,0.6)' }}>Loading…</p>
            ) : draft.length === 0 ? (
              <p style={{ borderRadius: '0.9rem', padding: '0.75rem 1rem', fontSize: '0.85rem', border: '1px dashed rgba(148,163,184,0.3)', color: 'rgba(203,213,225,0.7)' }}>
                {teacherName} has no availability yet — add a weekly window below.
              </p>
            ) : draft.map((w, i) => {
              const slots = previewSlots(w)
              return (
                <div key={i} style={{ borderRadius: '1rem', padding: '0.85rem 1rem', border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(15,23,42,0.45)' }}>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="sa-stat-label">Day</span>
                      <select className="sa-input" value={w.dayOfWeek} onChange={e => updateWindow(i, { dayOfWeek: Number(e.target.value) })}>
                        {DOW_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="sa-stat-label">From</span>
                      <input type="time" className="sa-input" value={w.startTime} onChange={e => updateWindow(i, { startTime: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="sa-stat-label">To</span>
                      <input type="time" className="sa-input" value={w.endTime} onChange={e => updateWindow(i, { endTime: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="sa-stat-label">Lesson (min)</span>
                      <input type="number" min="15" step="5" className="sa-input" style={{ width: '6rem' }} value={w.slotMinutes} onChange={e => updateWindow(i, { slotMinutes: Number(e.target.value) })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="sa-stat-label">Gap (min)</span>
                      <input type="number" min="0" step="5" className="sa-input" style={{ width: '6rem' }} value={w.gapMinutes} onChange={e => updateWindow(i, { gapMinutes: Number(e.target.value) })} />
                    </label>
                    <button onClick={() => removeWindow(i)} title="Remove window" className="sa-btn sa-btn-ghost ml-auto">
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="sa-stat-label">Opens</span>
                    {slots.length ? slots.map(s => <span key={s} className="sa-badge sa-badge-processing">{s}</span>)
                      : <span style={{ color: '#fca5a5', fontSize: '0.75rem' }}>No slots — the window is too short for one lesson.</span>}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={addWindow} disabled={!teacherId} className="sa-btn sa-btn-ghost">
              <span className="material-symbols-outlined text-lg">add</span>Add a window
            </button>
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
            <p style={{ color: 'rgba(203,213,225,0.7)', fontSize: '0.82rem', lineHeight: 1.6, maxWidth: '46rem' }}>
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
