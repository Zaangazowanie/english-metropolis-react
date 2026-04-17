import { useState } from 'react'


function SettingsCard({ title, icon, children }) {
  return (
    <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-5 editorial-shadow sm:px-6">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-xl text-sky-700">{icon}</span>
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

export default function AdminSettings() {

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
      <div>
        <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-700">Settings</p>
        <h1 className="mt-2 font-headline text-4xl text-slate-900">Admin preferences</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          Manage your profile, school branding, and notification preferences.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Admin Profile */}
        <SettingsCard title="Admin Profile" icon="account_circle">
          <div className="space-y-4">
            <div className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-4">
              <Label>Name</Label>
              <p className="mt-2 text-base font-semibold text-slate-900">{'Admin User'}</p>
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
                className="mt-2 w-full rounded-xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
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
                className="mt-2 w-full rounded-xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
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
                className="mt-2 w-full rounded-xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                placeholder="Re-enter new password"
              />
            </label>
            {passwordStatus && (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  passwordStatus.type === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-sky-200 bg-sky-50 text-sky-700'
                }`}
              >
                {passwordStatus.message}
              </div>
            )}
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-3 font-label text-xs font-bold uppercase tracking-[0.18em] text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 sm:w-auto"
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
    </div>
  )
}
