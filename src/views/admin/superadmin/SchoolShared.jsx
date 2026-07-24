// SchoolShared — the school (organization) context every School screen hangs off,
// plus the confirm-before-write dialog those screens are required to use.
//
// WHY A CONTEXT AT ALL: teachers, students and courses are all org-scoped in
// Convex, and a super_admin has organizationId: null. Without an explicit
// selection every one of those reads either throws (teachers) or silently
// returns a different school's rows (students). Selecting a school is therefore
// a precondition, not a filter, and the screens say so rather than rendering an
// empty table that looks like "no data".

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ConfirmModal } from './CommsShared.jsx'
import { listSchools } from './schoolApi.js'

const KEY = 'sa.school.selected'
const SchoolCtx = createContext(null)

export function SchoolProvider({ children }) {
  const [schools, setSchools] = useState(null)      // null = loading
  const [error, setError] = useState(null)
  const [token, setToken] = useState(0)
  const [selectedId, setSelectedId] = useState(() => {
    try { return localStorage.getItem(KEY) || '' } catch { return '' }
  })

  useEffect(() => {
    let alive = true
    listSchools()
      .then(rows => { if (alive) { setSchools(rows || []); setError(null) } })
      .catch(err => { if (alive) { setSchools([]); setError(err) } })
    return () => { alive = false }
  }, [token])

  // A stored id from a deleted school would scope every read to nothing, so the
  // selection is validated against what actually came back before it is used.
  const valid = schools?.some(s => s._id === selectedId) ? selectedId : ''
  const effectiveId = valid || (schools?.length === 1 ? schools[0]._id : '')

  const select = useCallback(id => {
    setSelectedId(id)
    try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY) } catch { /* private mode */ }
  }, [])

  const value = useMemo(() => ({
    schools, error, loading: schools === null,
    schoolId: effectiveId,
    school: schools?.find(s => s._id === effectiveId) || null,
    select,
    reload: () => setToken(v => v + 1),
  }), [schools, error, effectiveId, select])

  return <SchoolCtx.Provider value={value}>{children}</SchoolCtx.Provider>
}

export function useSchool() {
  const ctx = useContext(SchoolCtx)
  if (!ctx) throw new Error('useSchool must be used inside <SchoolProvider>')
  return ctx
}

/* ─────────────────────────────────────────────────────────── switcher ───── */

export function SchoolSwitcher({ compact }) {
  const { schools, schoolId, select, loading } = useSchool()
  if (loading) return <span className="sa-muted">Loading schools…</span>
  if (!schools?.length) return <span className="sa-muted">No schools</span>
  return (
    <label className={compact ? 'sa-school-switch is-compact' : 'sa-school-switch'}>
      <span className="sa-sr-only">School</span>
      <span className="material-symbols-outlined" aria-hidden="true">apartment</span>
      <select className="sa-select" value={schoolId} onChange={e => select(e.target.value)}>
        <option value="">All schools…</option>
        {schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
      </select>
    </label>
  )
}

// Screens that cannot function without a school render this instead of an empty
// table, so "pick a school" never reads as "this school has nothing".
export function NeedSchool({ what }) {
  return (
    <div className="sa-empty">
      <span className="material-symbols-outlined" aria-hidden="true">apartment</span>
      <p className="sa-empty-title">Pick a school first</p>
      <p>{what} are stored per school. Choose one from the switcher above to load them.</p>
      <div style={{ marginTop: 12 }}><SchoolSwitcher /></div>
    </div>
  )
}

/* ────────────────────────────────────────────────── confirm-before-write ── */

// Every create/update/delete in the School screens goes through this. It shows
// the EXACT payload that is about to be written, names the school, and says the
// database is live — because these mutations land straight on the production
// Convex holding real students, and an admin tool should never make that
// ambiguous.
export function ConfirmWrite({ open, title, verb = 'Save', school, rows, warning, busy, onConfirm, onClose }) {
  return (
    <ConfirmModal
      open={open}
      title={title}
      confirmLabel={busy ? `${verb}…` : verb}
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
      body={
        <div className="sa-confirm-write">
          {school && (
            <p className="sa-confirm-scope">
              School: <strong>{school.name}</strong>
            </p>
          )}
          <dl className="sa-kv">
            {(rows || []).filter(r => r && r.value !== '' && r.value != null).map(r => (
              <div key={r.label} className="sa-kv-row">
                <dt>{r.label}</dt>
                <dd>{String(r.value)}</dd>
              </div>
            ))}
          </dl>
          {warning && <p className="sa-confirm-warning">{warning}</p>}
          <p className="sa-confirm-live">
            <span className="material-symbols-outlined" aria-hidden="true">database</span>
            This writes to the live database straight away.
          </p>
        </div>
      }
    />
  )
}

/* ──────────────────────────────────────────────────────── data helper ───── */

// One loader shape for every School screen: rows | null (loading) | error, with
// a reload token. Deliberately tiny — these lists are small and org-scoped, so
// there is nothing to paginate.
export function useConvexList(loader, deps, enabled = true) {
  const [state, setState] = useState({ rows: null, error: null })
  const [token, setToken] = useState(0)
  useEffect(() => {
    if (!enabled) { setState({ rows: null, error: null }); return undefined }
    let alive = true
    setState({ rows: null, error: null })
    Promise.resolve()
      .then(loader)
      .then(rows => { if (alive) setState({ rows: rows || [], error: null }) })
      .catch(err => { if (alive) setState({ rows: [], error: err }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, token, enabled])
  return { ...state, reload: useCallback(() => setToken(v => v + 1), []) }
}
