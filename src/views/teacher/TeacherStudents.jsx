// TeacherStudents — "My Students": teacher-scoped roster + groups (P2, 2026-07-03).
//
// Renders GET /api/console/teacher/me (fetched once by the TeacherPortal shell
// and shared via Outlet context): students:[{slug,name,level,group}] and
// groups:[...]. The backend scopes the response to the signed-in teacher —
// this view renders exactly what it receives and never filters for scope
// client-side (API-CONTRACT.md, Auth). Group objects beyond {name} are not
// pinned down by the contract yet, so optional fields render defensively.
// Until the endpoint is live: calm "backend not live yet" panel, never mocks.

import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { BackendNotLive, LevelChip, SectionError, SectionLoading } from './TeacherPanels.jsx'

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  const chars = parts.slice(0, 2).map(p => p[0].toUpperCase())
  return chars.join('') || '?'
}

export default function TeacherStudents() {
  const { me, meState, refreshMe } = useOutletContext()
  const [query, setQuery] = useState('')

  const allStudents = useMemo(
    () => (Array.isArray(me?.students) ? [...me.students] : [])
      .sort((a, b) => String(a?.name || a?.slug || '').localeCompare(String(b?.name || b?.slug || ''))),
    [me],
  )

  const students = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return allStudents
    return allStudents.filter(s =>
      `${s?.name || ''} ${s?.slug || ''} ${s?.group || ''} ${s?.level || ''}`.toLowerCase().includes(needle))
  }, [allStudents, query])

  const groups = Array.isArray(me?.groups) ? me.groups : []

  const rosterBody = () => {
    if (meState?.loading) return <SectionLoading />
    if (meState?.error?.kind === 'not-live') return <BackendNotLive endpoint="GET /api/console/teacher/me" />
    if (meState?.error) return <SectionError error={meState.error} onRetry={refreshMe} />
    if (!allStudents.length) {
      return (
        <p className="text-sm text-slate-500 py-2">
          No students are assigned to you yet — once the school assigns you students, your roster appears here.
        </p>
      )
    }
    return (
      <>
        <label className="relative block max-w-sm">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">search</span>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter by name, group or level…"
            className="w-full rounded-full border border-slate-200 bg-white/80 py-2 pl-10 pr-4 text-sm font-semibold text-slate-700 placeholder:font-normal focus:border-sky-400 focus:outline-none"
          />
        </label>
        <div className="mt-4 space-y-2">
          {students.length ? students.map(s => (
            <div
              key={s?.slug || s?.name}
              className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-white/60 bg-white/70 px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_38px_-30px_rgba(2,132,199,0.55)]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sm font-bold text-sky-700">
                {initialsOf(s?.name || s?.slug)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{s?.name || s?.slug}</p>
                {s?.slug && <p className="text-xs text-slate-400">{s.slug}</p>}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {s?.group && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    <span className="material-symbols-outlined text-sm">workspaces</span>
                    {s.group}
                  </span>
                )}
                <LevelChip level={s?.level} />
              </div>
            </div>
          )) : (
            <p className="text-sm text-slate-500 py-2">No students match &ldquo;{query}&rdquo;.</p>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
        <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Roster</p>
        <h2 className="mt-1 font-headline text-3xl text-slate-900">
          My <span className="italic text-sky-600">Students</span>
          {!meState?.loading && !meState?.error && allStudents.length > 0 && (
            <span className="ml-3 align-middle font-sans text-base font-semibold text-slate-400">{allStudents.length}</span>
          )}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Everyone you teach — scoped to you on the server, so this list only ever contains your own students.
        </p>
        <div className="mt-4">{rosterBody()}</div>
      </section>

      {!meState?.loading && !meState?.error && groups.length > 0 && (
        <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
          <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Groups</p>
          <h2 className="mt-1 font-headline text-2xl text-slate-900">My <span className="italic text-sky-600">Groups</span></h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {groups.map((g, i) => {
              const name = g?.name || g?.title || `Group ${g?.id ?? g?._id ?? i + 1}`
              const memberCount = typeof g?.studentCount === 'number' ? g.studentCount
                : typeof g?.memberCount === 'number' ? g.memberCount
                : Array.isArray(g?.members) ? g.members.length
                : Array.isArray(g?.students) ? g.students.length
                : null
              return (
                <div key={g?.id || g?._id || name} className="rounded-[1.25rem] border border-white/60 bg-white/70 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl text-sky-500">workspaces</span>
                    <p className="text-sm font-semibold text-slate-900">{name}</p>
                    <span className="ml-auto"><LevelChip level={g?.level} /></span>
                  </div>
                  {memberCount !== null && (
                    <p className="mt-1.5 text-xs text-slate-500">{memberCount} student{memberCount === 1 ? '' : 's'}</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}
