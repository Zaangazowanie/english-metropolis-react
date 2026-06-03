import { useState, useEffect, useCallback } from 'react'
import { useAdminAuth, queryAdminConvex, mutateAdminConvex } from '../../contexts/AdminAuthContext.jsx'

// dayOfWeek is 0=Sunday indexed (matches scheduling.ts warsawParts()).
const DAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
]

function SettingsCard({ title, icon, children }) {
  return (
    <section className="glass-panel relative overflow-hidden rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-7">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[0.875rem] bg-gradient-to-br from-sky-100 to-blue-100 text-sky-700">
          <span className="material-symbols-outlined text-xl">{icon}</span>
        </div>
        <h2 className="font-headline text-2xl text-slate-900">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Label({ children }) {
  return (
    <span className="font-label text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
      {children}
    </span>
  )
}

const availInputCls = 'w-full rounded-[0.875rem] border border-slate-200/70 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100'

function AvailabilityEditor({ organizationId }) {
  const [windows, setWindows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  const load = useCallback(async () => {
    if (!organizationId) { setLoading(false); return }
    setLoading(true)
    try {
      const rows = await queryAdminConvex('scheduling:getWeeklyAvailability', { organizationId })
      setWindows((rows || []).map(r => ({
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        slotMinutes: r.slotMinutes,
        gapMinutes: r.gapMinutes,
      })))
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to load availability.' })
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => { load() }, [load])

  function updateWindow(idx, patch) {
    setWindows(ws => ws.map((w, i) => i === idx ? { ...w, ...patch } : w))
  }

  function addWindow() {
    setWindows(ws => [...ws, { dayOfWeek: 1, startTime: '16:00', endTime: '20:00', slotMinutes: 60, gapMinutes: 10 }])
  }

  function removeWindow(idx) {
    setWindows(ws => ws.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setStatus(null)
    setSaving(true)
    try {
      await mutateAdminConvex('scheduling:setWeeklyAvailability', {
        organizationId,
        windows: windows.map(w => ({
          dayOfWeek: Number(w.dayOfWeek),
          startTime: w.startTime,
          endTime: w.endTime,
          slotMinutes: Number(w.slotMinutes) || 60,
          gapMinutes: Number(w.gapMinutes) || 0,
        })),
      })
      setStatus({ type: 'info', message: 'Availability saved.' })
      await load()
    } catch (err) {
      setStatus({ type: 'error', message: 'Could not save availability.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="font-semibold">Heads up:</span> changing availability affects which slots students can book.
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading availability…</p>
      ) : (
        <div className="space-y-3">
          {windows.length === 0 && (
            <p className="text-sm text-slate-400">No availability windows yet. Add one below.</p>
          )}
          {windows.map((w, idx) => (
            <div key={idx} className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 sm:items-end">
                <label className="block col-span-2 sm:col-span-1">
                  <Label>Day</Label>
                  <select className={availInputCls + ' mt-1.5 cursor-pointer'} value={w.dayOfWeek} onChange={e => updateWindow(idx, { dayOfWeek: Number(e.target.value) })}>
                    {DAY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <Label>Start</Label>
                  <input type="time" className={availInputCls + ' mt-1.5'} value={w.startTime} onChange={e => updateWindow(idx, { startTime: e.target.value })} />
                </label>
                <label className="block">
                  <Label>End</Label>
                  <input type="time" className={availInputCls + ' mt-1.5'} value={w.endTime} onChange={e => updateWindow(idx, { endTime: e.target.value })} />
                </label>
                <label className="block">
                  <Label>Slot min</Label>
                  <input type="number" min="15" step="5" className={availInputCls + ' mt-1.5'} value={w.slotMinutes} onChange={e => updateWindow(idx, { slotMinutes: e.target.value })} />
                </label>
                <label className="block">
                  <Label>Gap min</Label>
                  <input type="number" min="0" step="5" className={availInputCls + ' mt-1.5'} value={w.gapMinutes} onChange={e => updateWindow(idx, { gapMinutes: e.target.value })} />
                </label>
                <button type="button" onClick={() => removeWindow(idx)} title="Remove window" aria-label="Remove window" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer justify-self-start">
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {status && (
        <div className={`rounded-[1rem] border px-4 py-3 text-sm ${status.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
          {status.message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addWindow} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer">
          <span className="material-symbols-outlined text-base">add</span>
          Add window
        </button>
        <button type="button" onClick={handleSave} disabled={saving || loading} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60">
          <span className="material-symbols-outlined text-base">{saving ? 'progress_activity' : 'save'}</span>
          {saving ? 'Saving…' : 'Save availability'}
        </button>
      </div>
    </div>
  )
}

export default function AdminSettings() {
  const { adminUser } = useAdminAuth()

  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' })
  const [passwordStatus, setPasswordStatus] = useState(null)
  const [notifications, setNotifications] = useState({ emailUpdates: true, weeklyReport: true })

  function handlePasswordSubmit(e) {
    e.preventDefault()
    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordStatus({ type: 'error', message: 'New passwords do not match.' })
      return
    }
    if (passwordForm.new.length < 8) {
      setPasswordStatus({ type: 'error', message: 'Password must be at least 8 characters.' })
      return
    }
    // Placeholder: backend mutation not yet wired
    setPasswordStatus({ type: 'info', message: 'Password change coming in the next backend update.' })
    setPasswordForm({ current: '', new: '', confirm: '' })
  }

  return (
    <div className="space-y-6">
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
        <div className="relative">
          <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Administration · Preferences</p>
          <h1 className="mt-3 font-headline text-4xl text-slate-900 leading-[1.05]">
            Account <span className="italic text-sky-600">Settings</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">
            Manage your profile, school branding, and notification preferences.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Admin Profile */}
        <SettingsCard title="Admin Profile" icon="account_circle">
          <div className="space-y-4">
            <div className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-4">
              <Label>Name</Label>
              <p className="mt-2 text-base font-semibold text-slate-900">{adminUser?.name || 'Admin User'}</p>
            </div>
            <div className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-4">
              <Label>Email</Label>
              <p className="mt-2 text-base font-semibold text-slate-900">{adminUser?.email || '—'}</p>
            </div>
            <div className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-4">
              <Label>Role</Label>
              <p className="mt-2 text-base font-semibold text-slate-900">School Administrator</p>
            </div>
          </div>
        </SettingsCard>

        {/* School Info */}
        <SettingsCard title="School Info" icon="apartment">
          <div className="space-y-4">
            <div className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-4">
              <Label>School Name</Label>
              <p className="mt-2 text-base font-semibold text-slate-900">Conversa</p>
            </div>
            <div className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-4">
              <Label>Organization ID</Label>
              <p className="mt-2 break-all font-mono text-sm text-slate-700">js7cb568fpf7qhkqqe55a7jz5s83sadf</p>
            </div>
            <div className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-4">
              <Label>Plan</Label>
              <p className="mt-2 text-base font-semibold text-slate-900">Read-only Admin V1</p>
            </div>
          </div>
        </SettingsCard>

        {/* Change Password */}
        <SettingsCard title="Change Password" icon="lock">
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <label className="block">
              <Label>Current Password</Label>
              <input
                type="password"
                value={passwordForm.current}
                onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))}
                required
                className="mt-2 w-full rounded-[1rem] border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                placeholder="Enter current password"
              />
            </label>
            <label className="block">
              <Label>New Password</Label>
              <input
                type="password"
                value={passwordForm.new}
                onChange={(e) => setPasswordForm((f) => ({ ...f, new: e.target.value }))}
                required
                minLength={8}
                className="mt-2 w-full rounded-[1rem] border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                placeholder="At least 8 characters"
              />
            </label>
            <label className="block">
              <Label>Confirm New Password</Label>
              <input
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))}
                required
                className="mt-2 w-full rounded-[1rem] border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                placeholder="Re-enter new password"
              />
            </label>
            {passwordStatus && (
              <div
                className={`rounded-[1rem] border px-4 py-3 text-sm ${
                  passwordStatus.type === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-sky-200 bg-sky-50 text-sky-700'
                }`}
              >
                {passwordStatus.message}
              </div>
            )}
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-18px_rgba(2,132,199,1)] sm:w-auto"
            >
              <span className="material-symbols-outlined text-base">save</span>
              Update Password
            </button>
          </form>
        </SettingsCard>

        {/* Notification Preferences */}
        <SettingsCard title="Notifications" icon="notifications">
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center justify-between rounded-[1.25rem] border border-white/60 bg-white/70 px-4 py-3 transition hover:bg-white">
              <span className="text-sm font-medium text-slate-700">Email me about product updates</span>
              <input
                type="checkbox"
                checked={notifications.emailUpdates}
                onChange={(e) => setNotifications((n) => ({ ...n, emailUpdates: e.target.checked }))}
                className="h-5 w-5 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between rounded-[1.25rem] border border-white/60 bg-white/70 px-4 py-3 transition hover:bg-white">
              <span className="text-sm font-medium text-slate-700">Weekly progress reports</span>
              <input
                type="checkbox"
                checked={notifications.weeklyReport}
                onChange={(e) => setNotifications((n) => ({ ...n, weeklyReport: e.target.checked }))}
                className="h-5 w-5 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
            </label>
          </div>
          <p className="mt-4 text-xs text-slate-400">Notification delivery will be enabled in a future update.</p>
        </SettingsCard>
      </div>

      {/* Teaching Availability — recurring weekly booking windows */}
      <SettingsCard title="Teaching Availability" icon="event_available">
        <p className="mb-4 max-w-2xl text-sm text-slate-500">
          Define the recurring weekly windows when lessons can be booked. Times are in Europe/Warsaw.
        </p>
        <AvailabilityEditor organizationId={adminUser?.organizationId} />
      </SettingsCard>
    </div>
  )
}
