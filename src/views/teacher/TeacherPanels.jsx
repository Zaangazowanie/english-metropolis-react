// TeacherPanels — small shared building blocks for the teacher portal tabs.
//
// Every console-backed section shares one lifecycle: loading skeleton →
// (backend-not-live | auth problem | error | data). These panels keep that
// lifecycle visually identical across tabs — and keep the "not live yet"
// state honest: a labelled waiting card, never mocked rows (KICKOFF.md
// rule 4). Styling follows the portal's Soft Modern language.

export function SectionLoading() {
  return (
    <div className="space-y-2 animate-pulse" aria-hidden>
      <div className="h-12 rounded-[1.25rem] bg-slate-100" />
      <div className="h-12 rounded-[1.25rem] bg-slate-100" />
      <div className="h-12 w-2/3 rounded-[1.25rem] bg-slate-100" />
    </div>
  )
}

// The endpoint is in the contract but Ricky hasn't flipped it live yet — an
// expected state during the console rollout, not an error.
export function BackendNotLive({ endpoint }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed border-sky-300 bg-sky-50/50 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-2xl text-sky-500">construction</span>
        <div>
          <p className="text-sm font-semibold text-slate-800">Backend not live yet</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            This section is wired to{' '}
            <code className="rounded border border-sky-100 bg-white/80 px-1.5 py-0.5 text-[12px] font-semibold text-sky-700">{endpoint}</code>{' '}
            from the console contract. The endpoint isn&apos;t switched on yet — your real data will
            appear here the moment it is. Nothing on this screen is simulated.
          </p>
        </div>
      </div>
    </div>
  )
}

export function SectionError({ error, onRetry }) {
  const isAuth = error?.kind === 'auth'
  return (
    <div className={`rounded-[1.25rem] border px-5 py-4 ${isAuth ? 'border-amber-200 bg-amber-50/70' : 'border-rose-200 bg-rose-50/60'}`}>
      <div className="flex items-start gap-3">
        <span className={`material-symbols-outlined text-2xl ${isAuth ? 'text-amber-500' : 'text-rose-400'}`}>
          {isAuth ? 'lock' : 'error'}
        </span>
        <div>
          <p className={`text-sm font-semibold ${isAuth ? 'text-amber-900' : 'text-rose-900'}`}>
            {isAuth ? 'Session problem' : 'Could not load this section'}
          </p>
          <p className={`mt-1 text-sm leading-relaxed ${isAuth ? 'text-amber-800' : 'text-rose-700'}`}>
            {String(error?.message || 'Unknown error')}
          </p>
          {onRetry && !isAuth && (
            <button
              onClick={onRetry}
              className="mt-3 rounded-full border border-rose-200 bg-white px-4 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 transition cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const LEVEL_STYLES = {
  A0: 'border-teal-200 bg-teal-50 text-teal-700',
  A1: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  A2: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  B1: 'border-sky-200 bg-sky-50 text-sky-700',
  B2: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  C1: 'border-violet-200 bg-violet-50 text-violet-700',
  C2: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
}

export function LevelChip({ level }) {
  if (!level) return null
  const key = String(level).toUpperCase().slice(0, 2)
  const style = LEVEL_STYLES[key] || 'border-slate-200 bg-slate-50 text-slate-600'
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${style}`}>
      {String(level).toUpperCase()}
    </span>
  )
}

const STATUS_STYLES = {
  scheduled: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  completed: 'border-sky-200 bg-sky-50 text-sky-700',
  taught: 'border-sky-200 bg-sky-50 text-sky-700',
  done: 'border-sky-200 bg-sky-50 text-sky-700',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-600',
  canceled: 'border-rose-200 bg-rose-50 text-rose-600',
  missed: 'border-amber-200 bg-amber-50 text-amber-700',
  no_show: 'border-amber-200 bg-amber-50 text-amber-700',
}

export function StatusChip({ status }) {
  if (!status) return null
  const style = STATUS_STYLES[String(status).toLowerCase()] || 'border-slate-200 bg-slate-50 text-slate-600'
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {String(status).replace(/_/g, ' ')}
    </span>
  )
}
