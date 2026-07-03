// TeacherPortal — the shell of the teacher cockpit (rebuilt 2026-07-03).
//
// From 2026-06-04 this file was a single page: availability editor + upcoming
// lessons. The P2 console buildout (docs/console/BRIEF.md) grows /teacher into
// a multi-tab portal, so this file is now the CHROME: header + tab nav +
// <Outlet/>. The sections live as nested routes (see src/main.jsx):
//   /teacher               → TeacherSchedule     (upcoming + console schedule)
//   /teacher/students      → TeacherStudents     (my roster + my groups)
//   /teacher/availability  → TeacherAvailability (weekly windows editor)
//
// The shell fetches GET /api/console/teacher/me ONCE (API-CONTRACT.md, P2)
// and shares it with every tab via Outlet context: the roster tab renders it,
// the schedule tab uses it to resolve student slugs / group ids to names.
// Scoping is SERVER-side — the bearer token identifies the teacher and the
// backend only ever returns their own students/groups; the UI never filters.
// Until that endpoint is live the tabs show calm "backend not live yet"
// panels (never mocked rows).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTeacherAuth } from '../../contexts/TeacherAuthContext.jsx'
import { ConsoleApiError, getTeacherMe } from './consoleApi.js'

const TABS = [
  { to: '/teacher', end: true, icon: 'calendar_month', label: 'Schedule' },
  { to: '/teacher/students', end: false, icon: 'group', label: 'My Students' },
  { to: '/teacher/availability', end: false, icon: 'edit_calendar', label: 'Availability' },
]

export default function TeacherPortal() {
  const { teacher, logout } = useTeacherAuth()

  // ── GET /api/console/teacher/me — fetched once, shared with all tabs ──
  const [meState, setMeState] = useState({ loading: true, error: null, data: null })
  const refreshMe = useCallback(async () => {
    setMeState(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await getTeacherMe()
      setMeState({ loading: false, error: null, data })
    } catch (err) {
      const error = err instanceof ConsoleApiError ? err : new ConsoleApiError('http', 0, String(err?.message || err))
      setMeState({ loading: false, error, data: null })
    }
  }, [])
  useEffect(() => { refreshMe() }, [refreshMe])

  // Lookup maps for the tabs (slug → student, group id → group).
  const { studentBySlug, groupById } = useMemo(() => {
    const students = Array.isArray(meState.data?.students) ? meState.data.students : []
    const groups = Array.isArray(meState.data?.groups) ? meState.data.groups : []
    const bySlug = {}
    for (const s of students) if (s?.slug) bySlug[s.slug] = s
    const byId = {}
    for (const g of groups) {
      const id = g?.id ?? g?._id ?? g?.groupId
      if (id !== undefined && id !== null) byId[String(id)] = g
    }
    return { studentBySlug: bySlug, groupById: byId }
  }, [meState.data])

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">

      {/* ── Header ── */}
      <section className="glass-panel relative overflow-hidden rounded-[2rem] border border-white/50 px-6 py-8 sm:px-10 editorial-shadow">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 50% 70% at 95% 0%, rgba(14,165,233,0.10), transparent 60%),
              radial-gradient(ellipse 40% 50% at 5% 100%, rgba(37,99,235,0.07), transparent 55%)`,
          }}
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Teacher Portal</p>
            <h1 className="mt-3 font-headline text-4xl text-slate-900 leading-[1.05]">
              {teacher?.name || 'Teacher'}<span className="italic text-sky-600">.</span>
            </h1>
            {teacher?.email && <p className="mt-2 text-sm text-slate-500">{teacher.email}</p>}
          </div>
          <button
            onClick={() => logout?.()}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/80 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700 transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            Sign out
          </button>
        </div>
      </section>

      {/* ── Tab nav ── */}
      <nav aria-label="Teacher portal sections" className="flex flex-wrap gap-2">
        {TABS.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition cursor-pointer ${
                isActive
                  ? 'border-sky-300 bg-white text-sky-700 shadow-[0_14px_30px_-22px_rgba(2,132,199,0.8)]'
                  : 'border-slate-200 bg-white/60 text-slate-500 hover:border-sky-200 hover:text-sky-600'
              }`
            }
          >
            <span className="material-symbols-outlined text-lg">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {/* ── Active tab ── */}
      <Outlet context={{ teacher, me: meState.data, meState, refreshMe, studentBySlug, groupById }} />
    </div>
  )
}
