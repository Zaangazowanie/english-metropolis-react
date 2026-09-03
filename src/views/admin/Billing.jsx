import { useEffect, useState, useMemo, useCallback } from 'react'
import { queryAdminConvex, mutateAdminConvex, useAdminAuth } from '../../contexts/AdminAuthContext.jsx'
import { CefrBadge, Modal } from '../../components/analytics/AnalyticsPrimitives.jsx'
import { downloadStatementPdf, downloadCertificatePdf } from '../../utils/billing-pdf.js'

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

const EMPTY_CONTACT = { name: '', email: '', phone: '', address: '', taxId: '', notes: '' }
const EMPTY_PACKAGE = { studentId: '', name: '', totalLessons: 10, notes: '' }
const EMPTY_CERT = { studentId: '', cefrLevel: 'B1' }

function Label({ children }) {
  return <span className="font-label text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{children}</span>
}

const inputCls = 'mt-2 w-full rounded-[1rem] border border-slate-200/70 bg-white/90 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100'

function monthLabel(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number)
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return `${names[(m || 1) - 1]} ${y}`
}

export default function AdminBilling() {
  const { adminUser } = useAdminAuth()
  const [state, setState] = useState({
    loading: true, error: '',
    org: null, stats: null, packages: [], certificates: [], students: [],
  })
  const [selectedMonth, setSelectedMonth] = useState('')

  // Modals
  const [contactOpen, setContactOpen] = useState(false)
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT)
  const [packageOpen, setPackageOpen] = useState(false)
  const [packageForm, setPackageForm] = useState(EMPTY_PACKAGE)
  const [certOpen, setCertOpen] = useState(false)
  const [certForm, setCertForm] = useState(EMPTY_CERT)
  const [cancelTarget, setCancelTarget] = useState(null)   // package to cancel
  const [revokeTarget, setRevokeTarget] = useState(null)   // certificate to revoke
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [busy, setBusy] = useState('')                     // per-row async actions (pdf downloads)

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: '' }))
    try {
      const orgArg = { organizationId: adminUser?.organizationId }
      const [org, stats, packages, certificates, students] = await Promise.all([
        queryAdminConvex('billing:getOrganizationBilling', orgArg),
        queryAdminConvex('scheduling:getMonthlyLessonStats', orgArg),
        queryAdminConvex('billing:listPackages', orgArg),
        queryAdminConvex('billing:listCertificates', orgArg),
        queryAdminConvex('students:listStudents', orgArg),
      ])
      setState({
        loading: false, error: '',
        org, stats, packages: packages || [], certificates: certificates || [], students: students || [],
      })
    } catch {
      setState(s => ({ ...s, loading: false, error: 'Failed to load billing data.' }))
    }
  }, [adminUser?.organizationId])

  useEffect(() => { load() }, [load])

  // Months available in the statement picker (current month always present)
  const months = useMemo(() => {
    if (!state.stats) return []
    const list = state.stats.months || []
    const keys = list.map(m => m.month)
    if (state.stats.currentMonth && !keys.includes(state.stats.currentMonth.month)) {
      return [state.stats.currentMonth, ...list]
    }
    return list
  }, [state.stats])

  const activeMonth = useMemo(() => {
    if (!months.length) return null
    return months.find(m => m.month === selectedMonth) || months[0]
  }, [months, selectedMonth])

  const activeStudents = useMemo(
    () => state.students.filter(s => s.status !== 'archived').sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [state.students],
  )

  const statementRows = useMemo(() => {
    if (!activeMonth) return []
    return Object.values(activeMonth.perStudent || {})
      .map(s => ({ ...s, billable: (s.completed || 0) + (s.lateCancellations || 0) }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [activeMonth])

  // ── Handlers ──────────────────────────────────────────────────

  function openContactEdit() {
    const bc = state.org?.billingContact || {}
    setContactForm({ ...EMPTY_CONTACT, ...Object.fromEntries(Object.entries(bc).filter(([, v]) => v != null)) })
    setModalError('')
    setContactOpen(true)
  }

  async function handleContactSave(e) {
    e.preventDefault()
    setSaving(true)
    setModalError('')
    try {
      const billingContact = Object.fromEntries(
        Object.entries(contactForm).map(([k, v]) => [k, v.trim() || undefined]),
      )
      await mutateAdminConvex('billing:updateBillingContact', { billingContact })
      setContactOpen(false)
      await load()
    } catch {
      setModalError('Could not save the billing contact.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePackageCreate(e) {
    e.preventDefault()
    setModalError('')
    if (!packageForm.studentId) { setModalError('Pick a student.'); return }
    if (!packageForm.name.trim()) { setModalError('Package name is required.'); return }
    const total = Number(packageForm.totalLessons)
    if (!Number.isFinite(total) || total <= 0) { setModalError('Lessons must be a positive number.'); return }
    setSaving(true)
    try {
      await mutateAdminConvex('billing:createPackage', {
        studentId: packageForm.studentId,
        name: packageForm.name.trim(),
        totalLessons: total,
        notes: packageForm.notes.trim() || undefined,
      })
      setPackageOpen(false)
      await load()
    } catch {
      setModalError('Could not create the package.')
    } finally {
      setSaving(false)
    }
  }

  // Regulamin § 5 ust. 3: extensions are granted by moving expiresAt, never by
  // booking past it (the credit gate applies to admins too since 2026-09-03).
  async function extendPackage(pkg, months = 6) {
    try {
      const base = new Date(Math.max(Number(pkg.expiresAt) || 0, Date.now()))
      base.setUTCMonth(base.getUTCMonth() + months)
      await mutateAdminConvex('billing:updatePackageMetadata', { packageId: pkg._id, expiresAt: base.getTime() })
      await load()
    } catch {
      setState(s => ({ ...s, error: 'Failed to extend the package.' }))
    }
  }

  async function handlePackageCancel() {
    if (!cancelTarget) return
    try {
      await mutateAdminConvex('billing:cancelPackage', { packageId: cancelTarget._id })
      setCancelTarget(null)
      await load()
    } catch {
      setCancelTarget(null)
      setState(s => ({ ...s, error: 'Failed to cancel the package.' }))
    }
  }

  async function handleCertIssue(e) {
    e.preventDefault()
    setModalError('')
    if (!certForm.studentId) { setModalError('Pick a student.'); return }
    setSaving(true)
    try {
      const cert = await mutateAdminConvex('billing:issueCertificate', {
        studentId: certForm.studentId,
        cefrLevel: certForm.cefrLevel,
      })
      setCertOpen(false)
      await load()
      // Immediately hand the admin the PDF
      if (cert) await downloadCertificatePdf(state.org, cert)
    } catch {
      setModalError('Could not issue the certificate.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCertRevoke() {
    if (!revokeTarget) return
    try {
      await mutateAdminConvex('billing:revokeCertificate', { certificateId: revokeTarget._id })
      setRevokeTarget(null)
      await load()
    } catch {
      setRevokeTarget(null)
      setState(s => ({ ...s, error: 'Failed to revoke the certificate.' }))
    }
  }

  async function handleStatementPdf() {
    if (!activeMonth) return
    setBusy('statement')
    try { await downloadStatementPdf(state.org, activeMonth) } finally { setBusy('') }
  }

  async function handleCertPdf(cert) {
    setBusy(`cert-${cert._id}`)
    try { await downloadCertificatePdf(state.org, cert) } finally { setBusy('') }
  }

  // ── Render ────────────────────────────────────────────────────

  if (state.loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="glass-panel rounded-[2rem] border border-white/50 px-6 py-6 editorial-shadow animate-pulse">
            <div className="h-4 w-32 rounded bg-slate-200" />
            <div className="mt-4 h-8 w-48 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    )
  }

  if (state.error && !state.org) {
    return (
      <div className="glass-panel rounded-[2rem] border border-rose-200 bg-rose-50/50 px-6 py-6 editorial-shadow">
        <span className="material-symbols-outlined text-3xl text-rose-400">error</span>
        <h2 className="mt-3 font-headline text-2xl text-rose-900">Unable to load billing</h2>
        <p className="mt-2 text-sm text-rose-700">{state.error}</p>
        <button onClick={load} className="mt-4 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 transition cursor-pointer">Retry</button>
      </div>
    )
  }

  const bc = state.org?.billingContact

  return (
    <div className="space-y-6">
      {/* ── Editorial hero ─────────────────────────────────────── */}
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
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Administration · Client &amp; Billing</p>
            <h1 className="mt-3 font-headline text-4xl sm:text-5xl text-slate-900 leading-[1.05]">
              Billing<span className="italic text-sky-600">.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">
              Monthly statements, prepaid lesson packages and CEFR certificates for {state.org?.name || 'your school'}.
            </p>
          </div>
        </div>
      </section>

      {/* ── Client / billing contact ───────────────────────────── */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8" data-testid="billing-contact">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Client</p>
            <h2 className="mt-1 font-headline text-2xl text-slate-900">{state.org?.name}</h2>
          </div>
          <button
            onClick={openContactEdit}
            data-testid="edit-billing-contact"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-sky-700 hover:bg-sky-50 transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">edit</span>
            {bc ? 'Edit Billing Contact' : 'Add Billing Contact'}
          </button>
        </div>
        {bc ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['person', 'Contact', bc.name],
              ['mail', 'Email', bc.email],
              ['call', 'Phone', bc.phone],
              ['location_on', 'Address', bc.address],
              ['badge', 'Tax ID (NIP)', bc.taxId],
              ['notes', 'Notes', bc.notes],
            ].filter(([, , v]) => v).map(([icon, label, value]) => (
              <div key={label} className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-3">
                <p className="flex items-center gap-1.5 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  <span className="material-symbols-outlined text-sm">{icon}</span>{label}
                </p>
                <p className="mt-1 text-sm text-slate-800 break-words">{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No billing contact on file yet — add one so statements carry the right invoicing details.</p>
        )}
      </section>

      {/* ── Monthly statement ──────────────────────────────────── */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8" data-testid="billing-statement">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Consolidated Statement</p>
            <h2 className="mt-1 font-headline text-2xl text-slate-900">
              {activeMonth ? monthLabel(activeMonth.month) : 'No activity yet'}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {months.length > 0 && (
              <select
                value={activeMonth?.month || ''}
                onChange={e => setSelectedMonth(e.target.value)}
                data-testid="statement-month-select"
                className="rounded-full border border-slate-200/70 bg-white/80 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 cursor-pointer"
              >
                {months.map(m => <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>)}
              </select>
            )}
            <button
              onClick={handleStatementPdf}
              disabled={!activeMonth || busy === 'statement'}
              data-testid="statement-pdf"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-base">{busy === 'statement' ? 'progress_activity' : 'picture_as_pdf'}</span>
              {busy === 'statement' ? 'Generating…' : 'Download PDF'}
            </button>
          </div>
        </div>

        {activeMonth ? (
          <>
            {/* Summary tiles */}
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                ['Lessons taught', activeMonth.completedLessons, 'school'],
                ['Late cancellations', activeMonth.lateCancellations, 'event_busy'],
                ['Billable total', activeMonth.billableTotal, 'receipt_long'],
              ].map(([label, value, icon], i) => (
                <div key={label} className={`liquid-glass-card rounded-[1.5rem] border px-5 py-4 ${i === 2 ? 'border-sky-200 bg-sky-50/50' : 'border-white/60'}`}>
                  <p className="flex items-center gap-1.5 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    <span className="material-symbols-outlined text-sm">{icon}</span>{label}
                  </p>
                  <p className={`mt-2 font-headline text-3xl ${i === 2 ? 'text-sky-700' : 'text-slate-900'}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Per-student table */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm" data-testid="statement-table">
                <thead>
                  <tr className="text-left">
                    <th className="pb-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Student</th>
                    <th className="pb-3 text-right font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Lessons</th>
                    <th className="pb-3 text-right font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Late Canc.</th>
                    <th className="pb-3 text-right font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Billable</th>
                  </tr>
                </thead>
                <tbody>
                  {statementRows.map((s, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-3 text-slate-800">{s.name}</td>
                      <td className="py-3 text-right text-slate-600">{s.completed || 0}</td>
                      <td className="py-3 text-right text-slate-600">{s.lateCancellations || 0}</td>
                      <td className="py-3 text-right font-semibold text-slate-900">{s.billable}</td>
                    </tr>
                  ))}
                  {!statementRows.length && (
                    <tr><td colSpan={4} className="py-6 text-center text-slate-400">No per-student activity this month.</td></tr>
                  )}
                </tbody>
                {statementRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200">
                      <td className="pt-3 font-semibold text-slate-900">Total</td>
                      <td className="pt-3 text-right font-semibold text-slate-900">{activeMonth.completedLessons}</td>
                      <td className="pt-3 text-right font-semibold text-slate-900">{activeMonth.lateCancellations}</td>
                      <td className="pt-3 text-right font-headline text-lg text-sky-700">{activeMonth.billableTotal}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Statements appear automatically once lessons are taught or bookings are made.</p>
        )}
      </section>

      {/* ── Prepaid packages ───────────────────────────────────── */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8" data-testid="billing-packages">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Prepaid</p>
            <h2 className="mt-1 font-headline text-2xl text-slate-900">Lesson Packages</h2>
          </div>
          <button
            onClick={() => { setPackageForm(EMPTY_PACKAGE); setModalError(''); setPackageOpen(true) }}
            data-testid="add-package"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 hover:-translate-y-0.5"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Package
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {state.packages.length ? state.packages.map(pkg => {
            const cancelled = pkg.status === 'cancelled'
            const pct = cancelled || pkg.totalLessons === 0 ? 0 : Math.round(((pkg.remainingLessons ?? 0) / pkg.totalLessons) * 100)
            return (
              <div
                key={pkg._id}
                data-testid="package-row"
                className={`liquid-glass-card rounded-[1.5rem] border px-5 py-4 ${cancelled ? 'border-slate-200 opacity-60' : 'border-white/60'}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-headline text-lg text-slate-900 truncate">{pkg.studentName}</p>
                    <p className="text-xs text-slate-400">{pkg.name} · purchased {new Date(pkg.purchasedAt).toISOString().slice(0, 10)}{pkg.expiresAt ? ` · valid until ${new Date(pkg.expiresAt).toISOString().slice(0, 10)}` : ' · no expiry set'}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {cancelled ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-label font-bold uppercase tracking-[0.14em] text-slate-500">Cancelled</span>
                    ) : (
                      <>
                        <div className="w-36">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">{pkg.remainingLessons} left</span>
                            <span className="text-slate-400">of {pkg.totalLessons}</span>
                          </div>
                          <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pkg.depleted ? 'bg-slate-300' : pkg.lowBalance ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-sky-500 to-blue-600'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        {pkg.expiresAt && pkg.expiresAt <= Date.now() && (
                          <span data-testid="expired-flag" className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-label font-bold uppercase tracking-[0.14em] text-rose-700">
                            <span className="block h-1.5 w-1.5 rounded-full bg-rose-500" />Expired
                          </span>
                        )}
                        {pkg.depleted && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-label font-bold uppercase tracking-[0.14em] text-slate-600">
                            <span className="block h-1.5 w-1.5 rounded-full bg-slate-400" />Depleted
                          </span>
                        )}
                        {pkg.lowBalance && (
                          <span data-testid="low-balance-flag" className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-label font-bold uppercase tracking-[0.14em] text-amber-700">
                            <span className="block h-1.5 w-1.5 rounded-full bg-amber-500" />Low Balance
                          </span>
                        )}
                        <button
                          type="button"
                          title="Extend validity by 6 months"
                          aria-label="Extend validity by 6 months"
                          onClick={() => extendPackage(pkg)}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/80 text-slate-500 transition cursor-pointer hover:bg-sky-50 hover:text-sky-700"
                        >
                          <span className="material-symbols-outlined text-lg">more_time</span>
                        </button>
                        <button
                          type="button"
                          title="Cancel package"
                          aria-label="Cancel package"
                          onClick={() => setCancelTarget(pkg)}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/80 text-slate-500 transition cursor-pointer hover:bg-rose-50 hover:text-rose-600"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          }) : (
            <div className="liquid-glass-card rounded-[1.5rem] border border-white/60 px-4 py-8 text-center">
              <span className="material-symbols-outlined text-3xl text-slate-300">package_2</span>
              <p className="mt-2 text-sm text-slate-500">No prepaid packages yet. Add one to start tracking a student's lesson balance.</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Certificates ───────────────────────────────────────── */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8" data-testid="billing-certificates">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.22em] text-slate-400">CEFR</p>
            <h2 className="mt-1 font-headline text-2xl text-slate-900">Certificates</h2>
          </div>
          <button
            onClick={() => { setCertForm(EMPTY_CERT); setModalError(''); setCertOpen(true) }}
            data-testid="issue-certificate"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 hover:-translate-y-0.5"
          >
            <span className="material-symbols-outlined text-base">workspace_premium</span>
            Issue Certificate
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {state.certificates.length ? state.certificates.map(cert => (
            <div
              key={cert._id}
              data-testid="certificate-row"
              className={`liquid-glass-card rounded-[1.5rem] border px-5 py-4 ${cert.status === 'revoked' ? 'border-slate-200 opacity-60' : 'border-white/60'}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <CefrBadge band={cert.cefrLevel} />
                  <div className="min-w-0">
                    <p className="font-headline text-lg text-slate-900 truncate">{cert.studentName}</p>
                    <p className="text-xs text-slate-400">
                      {cert.lessonsCompleted} lessons · {cert.hoursCompleted}h · issued {new Date(cert.issuedAt).toISOString().slice(0, 10)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <code className="rounded-full border border-slate-200/70 bg-white/80 px-3 py-1 font-mono text-xs text-slate-600">{cert.verificationId}</code>
                  {cert.status === 'revoked' ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-label font-bold uppercase tracking-[0.14em] text-rose-600">Revoked</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleCertPdf(cert)}
                        disabled={busy === `cert-${cert._id}`}
                        data-testid="certificate-pdf"
                        title="Download PDF"
                        aria-label="Download PDF"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/80 text-slate-500 transition cursor-pointer hover:bg-sky-50 hover:text-sky-700 disabled:opacity-60"
                      >
                        <span className="material-symbols-outlined text-lg">{busy === `cert-${cert._id}` ? 'progress_activity' : 'download'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevokeTarget(cert)}
                        title="Revoke"
                        aria-label="Revoke"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/80 text-slate-500 transition cursor-pointer hover:bg-rose-50 hover:text-rose-600"
                      >
                        <span className="material-symbols-outlined text-lg">block</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )) : (
            <div className="liquid-glass-card rounded-[1.5rem] border border-white/60 px-4 py-8 text-center">
              <span className="material-symbols-outlined text-3xl text-slate-300">workspace_premium</span>
              <p className="mt-2 text-sm text-slate-500">No certificates issued yet.</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Billing contact modal ──────────────────────────────── */}
      <Modal open={contactOpen} onClose={() => setContactOpen(false)} title="Billing Contact" widthClass="max-w-2xl">
        <form onSubmit={handleContactSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <Label>Contact Name</Label>
              <input className={inputCls} value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder="Aleksandra Trejda" autoFocus />
            </label>
            <label className="block">
              <Label>Email</Label>
              <input type="email" className={inputCls} value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="billing@conversa.edu.pl" />
            </label>
            <label className="block">
              <Label>Phone</Label>
              <input className={inputCls} value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} placeholder="+48 …" />
            </label>
            <label className="block">
              <Label>Tax ID (NIP)</Label>
              <input className={inputCls} value={contactForm.taxId} onChange={e => setContactForm(f => ({ ...f, taxId: e.target.value }))} placeholder="000-000-00-00" />
            </label>
            <label className="block sm:col-span-2">
              <Label>Address</Label>
              <input className={inputCls} value={contactForm.address} onChange={e => setContactForm(f => ({ ...f, address: e.target.value }))} placeholder="Street, City" />
            </label>
            <label className="block sm:col-span-2">
              <Label>Notes</Label>
              <textarea className={inputCls} rows={2} value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} placeholder="Invoicing notes" />
            </label>
          </div>
          {modalError && <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{modalError}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setContactOpen(false)} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60">
              <span className="material-symbols-outlined text-base">{saving ? 'progress_activity' : 'save'}</span>
              {saving ? 'Saving…' : 'Save Contact'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Add package modal ──────────────────────────────────── */}
      <Modal open={packageOpen} onClose={() => setPackageOpen(false)} title="Add Lesson Package" widthClass="max-w-xl">
        <form onSubmit={handlePackageCreate} className="space-y-4">
          <label className="block">
            <Label>Student *</Label>
            <select className={inputCls + ' cursor-pointer'} data-testid="package-student-select" value={packageForm.studentId} onChange={e => setPackageForm(f => ({ ...f, studentId: e.target.value }))}>
              <option value="">Pick a student…</option>
              {activeStudents.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <Label>Package Name *</Label>
              <input className={inputCls} data-testid="package-name-input" value={packageForm.name} onChange={e => setPackageForm(f => ({ ...f, name: e.target.value }))} placeholder="10-lesson block" />
            </label>
            <label className="block">
              <Label>Lessons *</Label>
              <input type="number" min="1" step="1" className={inputCls} data-testid="package-lessons-input" value={packageForm.totalLessons} onChange={e => setPackageForm(f => ({ ...f, totalLessons: e.target.value }))} />
            </label>
          </div>
          <label className="block">
            <Label>Notes</Label>
            <textarea className={inputCls} rows={2} value={packageForm.notes} onChange={e => setPackageForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment reference, invoice number…" />
          </label>
          {modalError && <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{modalError}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setPackageOpen(false)} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">Cancel</button>
            <button type="submit" disabled={saving} data-testid="package-save" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60">
              <span className="material-symbols-outlined text-base">{saving ? 'progress_activity' : 'add'}</span>
              {saving ? 'Creating…' : 'Create Package'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Cancel package confirm ─────────────────────────────── */}
      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel Package" widthClass="max-w-md">
        <p className="text-sm text-slate-600">
          Cancel <span className="font-semibold text-slate-900">{cancelTarget?.name}</span> for <span className="font-semibold text-slate-900">{cancelTarget?.studentName}</span>? Its balance stops counting; the record is kept for the books.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={() => setCancelTarget(null)} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">Keep It</button>
          <button onClick={handlePackageCancel} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(225,29,72,0.9)] hover:-translate-y-0.5 transition-all duration-300">
            <span className="material-symbols-outlined text-base">delete</span>
            Cancel Package
          </button>
        </div>
      </Modal>

      {/* ── Issue certificate modal ────────────────────────────── */}
      <Modal open={certOpen} onClose={() => setCertOpen(false)} title="Issue CEFR Certificate" widthClass="max-w-xl">
        <form onSubmit={handleCertIssue} className="space-y-4">
          <p className="text-sm text-slate-600">
            The certificate records the student's completed lessons and hours at the moment of issue, with a public verification ID.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <Label>Student *</Label>
              <select className={inputCls + ' cursor-pointer'} data-testid="certificate-student-select" value={certForm.studentId} onChange={e => setCertForm(f => ({ ...f, studentId: e.target.value }))}>
                <option value="">Pick a student…</option>
                {activeStudents.map(s => <option key={s._id} value={s._id}>{s.name} ({s.level})</option>)}
              </select>
            </label>
            <label className="block">
              <Label>CEFR Level *</Label>
              <select className={inputCls + ' cursor-pointer'} data-testid="certificate-level-select" value={certForm.cefrLevel} onChange={e => setCertForm(f => ({ ...f, cefrLevel: e.target.value }))}>
                {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          </div>
          {modalError && <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{modalError}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setCertOpen(false)} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">Cancel</button>
            <button type="submit" disabled={saving} data-testid="certificate-save" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60">
              <span className="material-symbols-outlined text-base">{saving ? 'progress_activity' : 'workspace_premium'}</span>
              {saving ? 'Issuing…' : 'Issue & Download'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Revoke certificate confirm ─────────────────────────── */}
      <Modal open={!!revokeTarget} onClose={() => setRevokeTarget(null)} title="Revoke Certificate" widthClass="max-w-md">
        <p className="text-sm text-slate-600">
          Revoke certificate <code className="font-mono text-xs">{revokeTarget?.verificationId}</code> for <span className="font-semibold text-slate-900">{revokeTarget?.studentName}</span>? Verification lookups will show it as revoked.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={() => setRevokeTarget(null)} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">Keep It</button>
          <button onClick={handleCertRevoke} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(225,29,72,0.9)] hover:-translate-y-0.5 transition-all duration-300">
            <span className="material-symbols-outlined text-base">block</span>
            Revoke
          </button>
        </div>
      </Modal>
    </div>
  )
}
