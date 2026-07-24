// CRM → Contacts. People who are not (yet) students: leads, parents, corporate
// buyers, decision makers at companies running a corporate ESL programme.
//
// The screen is built around one fact: under GDPR/RODO nothing may be mailed to
// a person without marketing_consent = 1 AND unsubscribed_at IS NULL (the rule
// the schema itself states in em_business.py). Consent is therefore not a field
// buried in a form — it is a column, a filter, a KPI, and a visible mark on the
// row. A contact you may not email must not look like one you may.
//
// The table is empty until an operator or an import puts someone in it. That is
// the correct state and it is never faked.

import { useState } from 'react'
import {
  ActivityPanel, ConfirmDialog, CountNote, CrmDrawer, Field, FormSection, ListState,
  RelatedList, SelectField, SortTh, TextAreaField, TextField, WriteError,
  dayToEpoch, nz, useBizCount, useBizList, useDebounced, useRefList,
} from './CrmShared.jsx'
import { ConsoleEmpty } from './ConsoleStates.jsx'
import {
  bizCreate, bizDelete, bizUpdate, formatEpoch, formatMoney, nowEpoch,
} from './crmApi.js'

const ENDPOINT = '/api/console/biz/contacts'

const LIFECYCLES = [
  { value: 'subscriber', label: 'Subscriber' },
  { value: 'lead', label: 'Lead' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'customer', label: 'Customer' },
  { value: 'former_customer', label: 'Former customer' },
  { value: 'disqualified', label: 'Disqualified' },
]

const CONSENT_BASES = [
  { value: 'opt_in', label: 'Opt-in (explicit)' },
  { value: 'legitimate_interest', label: 'Legitimate interest' },
  { value: 'contract', label: 'Contract' },
  { value: 'import_legacy', label: 'Legacy import' },
]

// The four consent filters an operator actually works in.
const CONSENT_VIEWS = {
  all: { label: 'Any consent state', params: {} },
  mailable: { label: 'Mailable', params: { marketing_consent: 1, unsubscribed_at__null: 1, bounced_at__null: 1 } },
  none: { label: 'No consent', params: { marketing_consent: 0 } },
  unsubscribed: { label: 'Unsubscribed', params: { unsubscribed_at__null: 0 } },
  bounced: { label: 'Bounced', params: { bounced_at__null: 0 } },
}

// One place decides what may legally be mailed; the badge, the row mark and the
// drawer banner all read from it.
function consentState(row) {
  if (row.unsubscribed_at) {
    return { key: 'unsubscribed', label: 'Unsubscribed', mailable: false, tone: 'bad', icon: 'unsubscribe' }
  }
  if (row.bounced_at) {
    return { key: 'bounced', label: 'Bounced', mailable: false, tone: 'warm', icon: 'error' }
  }
  if (Number(row.marketing_consent) === 1) {
    return { key: 'consented', label: 'Opt-in', mailable: true, tone: 'good', icon: 'verified_user' }
  }
  return { key: 'none', label: 'No consent', mailable: false, tone: 'bad', icon: 'block' }
}

const TONE_STYLE = {
  good: { background: 'var(--sa-good-soft)', color: 'var(--sa-good)' },
  bad: { background: 'var(--sa-bad-soft)', color: 'var(--sa-bad)' },
  warm: { background: 'var(--sa-warm-soft)', color: 'var(--sa-warm-ink)' },
  neutral: { background: 'var(--sa-surface-soft)', color: 'var(--sa-text-muted)' },
}

function ConsentBadge({ row }) {
  const s = consentState(row)
  return (
    <span className="sa-badge" style={TONE_STYLE[s.tone]}>
      <span className="material-symbols-outlined" aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  )
}

const fullName = c => [c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)'

export default function ConsoleContacts() {
  const [qInput, setQInput] = useState('')
  const q = useDebounced(qInput)
  const [lifecycle, setLifecycle] = useState('')
  const [consentView, setConsentView] = useState('all')
  const [companyId, setCompanyId] = useState('')
  const [sort, setSort] = useState('-created_at')
  const [editing, setEditing] = useState(null)   // row | 'new' | null
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const filters = {
    ...CONSENT_VIEWS[consentView].params,
    ...(lifecycle ? { lifecycle } : {}),
    ...(companyId ? { company_id: companyId } : {}),
    ...(q ? { q } : {}),
    sort,
    limit: 50,
  }
  const list = useBizList('contacts', filters)
  const companies = useRefList('companies', { sort: 'name', limit: 200 })
  const team = useRefList('team_members', { sort: 'full_name', limit: 200 })

  const totalAll = useBizCount('contacts', {})
  const totalMailable = useBizCount('contacts', CONSENT_VIEWS.mailable.params)
  const totalUnsub = useBizCount('contacts', CONSENT_VIEWS.unsubscribed.params)

  const companyName = id => companies.find(c => c.id === id)?.name || ''
  const filtersActive = Boolean(q || lifecycle || companyId || consentView !== 'all')

  function clearFilters() {
    setQInput('')
    setLifecycle('')
    setCompanyId('')
    setConsentView('all')
  }

  async function doDelete() {
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await bizDelete('contacts', confirmDelete.id)
      setConfirmDelete(null)
      list.reload()
    } catch (e) {
      setDeleteError(e.message || 'Could not delete this contact')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Contacts</h1>
          <p>
            People behind the business: leads, parents, and the buyers and decision makers at
            companies running corporate courses. Outreach may only touch a contact with recorded
            marketing consent and no unsubscribe.
          </p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing('new')}>
            <span className="material-symbols-outlined" aria-hidden="true">person_add</span>
            New contact
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 12 }}>
        <Kpi label="Contacts" value={totalAll} />
        <Kpi label="Mailable under GDPR" value={totalMailable} tone="good" />
        <Kpi label="Unsubscribed" value={totalUnsub} tone="bad" />
      </div>

      <div className="sa-toolbar">
        <label className="sa-sr-only" htmlFor="contacts-search">Search contacts</label>
        <input
          id="contacts-search"
          type="search"
          className="sa-input"
          placeholder="Search name, email, phone, job title…"
          value={qInput}
          onChange={e => setQInput(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <label className="sa-sr-only" htmlFor="contacts-lifecycle">Lifecycle</label>
        <select
          id="contacts-lifecycle"
          className="sa-select"
          value={lifecycle}
          onChange={e => setLifecycle(e.target.value)}
        >
          <option value="">Any lifecycle</option>
          {LIFECYCLES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <label className="sa-sr-only" htmlFor="contacts-consent">Consent state</label>
        <select
          id="contacts-consent"
          className="sa-select"
          value={consentView}
          onChange={e => setConsentView(e.target.value)}
        >
          {Object.entries(CONSENT_VIEWS).map(([key, v]) => (
            <option key={key} value={key}>{v.label}</option>
          ))}
        </select>
        {companies.length > 0 && (
          <>
            <label className="sa-sr-only" htmlFor="contacts-company">Company</label>
            <select
              id="contacts-company"
              className="sa-select"
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
            >
              <option value="">Any company</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
        {filtersActive && (
          <button type="button" className="sa-btn sa-btn-ghost" onClick={clearFilters}>
            <span className="material-symbols-outlined" aria-hidden="true">filter_alt_off</span>
            Clear filters
          </button>
        )}
        <span className="sa-toolbar-spacer" />
        {list.status === 'ready' && <CountNote shown={list.rows.length} total={list.total} noun="contacts" />}
      </div>

      <div className="sa-card" style={{ marginTop: 12, overflow: 'hidden' }}>
        <ListState status={list.status} error={list.error} endpoint={ENDPOINT} onRetry={list.reload} />

        {list.status === 'ready' && !list.rows.length && (
          filtersActive ? (
            <ConsoleEmpty
              icon="search_off"
              title="No contacts match these filters"
              hint="Nothing in the contact table matches the current search and filter set."
              action={
                <button type="button" className="sa-btn sa-btn-ghost" onClick={clearFilters}>Clear filters</button>
              }
            />
          ) : (
            <ConsoleEmpty
              icon="contacts"
              title="No contacts yet"
              hint={
                <>
                  <p>
                    This is the register of every person English Metro deals with outside the student
                    roster: enquiries from the site, referrals, and the HR and L&amp;D contacts behind
                    corporate courses.
                  </p>
                  <p style={{ marginTop: '0.5rem' }}>
                    Add the first one, and record how consent was obtained at the same time — a contact
                    without a consent basis can be stored, but never mailed.
                  </p>
                </>
              }
              action={
                <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing('new')}>
                  Add the first contact
                </button>
              }
            />
          )
        )}

        {list.status === 'ready' && list.rows.length > 0 && (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <caption className="sa-sr-only">
                Contacts, sortable. Rows that may not be mailed are marked in the consent column.
              </caption>
              <thead>
                <tr>
                  <SortTh column="last_name" label="Name" sort={sort} onSort={setSort} />
                  <SortTh column="email" label="Email" sort={sort} onSort={setSort} />
                  <th>Company</th>
                  <SortTh column="job_title" label="Role" sort={sort} onSort={setSort} />
                  <SortTh column="lifecycle" label="Lifecycle" sort={sort} onSort={setSort} />
                  <SortTh column="marketing_consent" label="Consent" sort={sort} onSort={setSort} />
                  <SortTh column="source" label="Source" sort={sort} onSort={setSort} />
                  <SortTh column="created_at" label="Added" sort={sort} onSort={setSort} align="right" />
                  <th><span className="sa-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map(row => {
                  const state = consentState(row)
                  return (
                    <tr key={row.id} className="is-clickable" onClick={() => setEditing(row)}>
                      <td
                        style={{
                          fontWeight: 600,
                          // The one visual difference that matters: a contact
                          // outreach may not touch carries a red edge for the
                          // whole row, not just a badge two columns over.
                          boxShadow: state.mailable ? undefined : 'inset 3px 0 0 var(--sa-bad)',
                        }}
                      >
                        {fullName(row)}
                      </td>
                      <td style={{ color: row.email ? 'var(--sa-text)' : 'var(--sa-text-muted)' }}>
                        {row.email || '—'}
                      </td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{companyName(row.company_id) || '—'}</td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{row.job_title || '—'}</td>
                      <td><span className="sa-badge">{String(row.lifecycle || '').replace('_', ' ')}</span></td>
                      <td><ConsentBadge row={row} /></td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{row.source || '—'}</td>
                      <td className="sa-num">{formatEpoch(row.created_at)}</td>
                      <td className="sa-td-right" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="sa-icon-btn sa-icon-btn-sm"
                          onClick={() => setEditing(row)}
                          aria-label={`Edit ${fullName(row)}`}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                        </button>
                        <button
                          type="button"
                          className="sa-icon-btn sa-icon-btn-sm"
                          onClick={() => { setConfirmDelete(row); setDeleteError('') }}
                          aria-label={`Delete ${fullName(row)}`}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {list.status === 'ready' && list.cursor && (
          <div style={{ padding: 10, borderTop: '1px solid var(--sa-border)' }}>
            <button type="button" className="sa-btn sa-btn-ghost" onClick={list.loadMore} disabled={list.moreBusy}>
              {list.moreBusy ? 'Loading…' : `Load more (${list.total - list.rows.length} left)`}
            </button>
            {list.moreError && <WriteError error={list.moreError} />}
          </div>
        )}
      </div>

      {editing && (
        <ContactDrawer
          key={editing === 'new' ? 'new' : editing.id}
          row={editing === 'new' ? null : editing}
          companies={companies}
          team={team}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); list.reload() }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this contact?"
          danger
          busy={deleteBusy}
          confirmLabel="Delete contact"
          body={
            <>
              <p>
                <strong>{fullName(confirmDelete)}</strong>
                {confirmDelete.email ? ` (${confirmDelete.email})` : ''} will be soft-deleted: the row
                is stamped as deleted and disappears from every list, and its email address is freed
                for re-use.
              </p>
              <WriteError error={deleteError} />
            </>
          }
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  )
}

function Kpi({ label, value, tone }) {
  return (
    <div className="sa-kpi">
      <span className="sa-kpi-label">{label}</span>
      <span className="sa-kpi-value" style={tone ? { color: `var(--sa-${tone})` } : undefined}>
        {value === null ? '—' : value}
      </span>
    </div>
  )
}

/* ─────────────────────────────── the drawer ────────────────────────────── */

function blank() {
  return {
    first_name: '', last_name: '', email: '', phone: '', job_title: '',
    company_id: '', lifecycle: 'lead', source: '', source_detail: '', owner_id: '',
    country: 'PL', locale: 'pl', timezone: '',
    marketing_consent: 0, consent_basis: '', consent_source: '', consent_at: '',
    unsubscribed_at: null, unsubscribe_reason: '', bounced_at: null,
    notes: '',
  }
}

function toForm(row) {
  if (!row) return blank()
  return {
    ...blank(),
    ...row,
    company_id: row.company_id ?? '',
    owner_id: row.owner_id ?? '',
    consent_at: row.consent_at ? formatEpoch(row.consent_at) : '',
    marketing_consent: Number(row.marketing_consent) === 1 ? 1 : 0,
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    email: row.email || '',
    phone: row.phone || '',
    job_title: row.job_title || '',
    source: row.source || '',
    source_detail: row.source_detail || '',
    country: row.country || '',
    locale: row.locale || 'pl',
    timezone: row.timezone || '',
    consent_basis: row.consent_basis || '',
    consent_source: row.consent_source || '',
    unsubscribe_reason: row.unsubscribe_reason || '',
    notes: row.notes || '',
  }
}

function ContactDrawer({ row, companies, team, onClose, onSaved }) {
  const [form, setForm] = useState(() => toForm(row))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setTouched(true) }

  const emailInvalid = form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())
  const countryInvalid = form.country && !/^[A-Za-z]{2}$/.test(form.country.trim())
  const nameInvalid = touched && !form.first_name.trim()
  const consentIncomplete = Number(form.marketing_consent) === 1 && !form.consent_basis
  const canSave = form.first_name.trim() && !emailInvalid && !countryInvalid && !consentIncomplete && !busy

  const state = consentState({
    marketing_consent: form.marketing_consent,
    unsubscribed_at: form.unsubscribed_at,
    bounced_at: form.bounced_at,
  })

  async function save() {
    if (!canSave) { setTouched(true); return }
    setBusy(true)
    setError('')
    const payload = {
      first_name: form.first_name.trim(),
      last_name: nz(form.last_name),
      email: nz(form.email)?.toLowerCase() ?? null,
      phone: nz(form.phone),
      job_title: nz(form.job_title),
      company_id: form.company_id ? Number(form.company_id) : null,
      lifecycle: form.lifecycle || 'lead',
      source: nz(form.source),
      source_detail: nz(form.source_detail),
      owner_id: form.owner_id ? Number(form.owner_id) : null,
      country: form.country ? form.country.trim().toUpperCase() : null,
      locale: form.locale || 'pl',
      timezone: nz(form.timezone),
      marketing_consent: Number(form.marketing_consent) === 1 ? 1 : 0,
      consent_basis: nz(form.consent_basis),
      consent_source: nz(form.consent_source),
      consent_at: form.consent_at
        ? dayToEpoch(form.consent_at)
        : (Number(form.marketing_consent) === 1 ? nowEpoch() : null),
      unsubscribed_at: form.unsubscribed_at || null,
      unsubscribe_reason: nz(form.unsubscribe_reason),
      notes: nz(form.notes),
    }
    try {
      if (row) await bizUpdate('contacts', row.id, payload)
      else await bizCreate('contacts', payload)
      onSaved()
    } catch (e) {
      setError(e.message || 'Could not save this contact')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CrmDrawer
      title={row ? fullName(row) : 'New contact'}
      subtitle={row ? `Contact #${row.id}` : 'Nothing is stored until you save.'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : row ? 'Save changes' : 'Create contact'}
          </button>
        </>
      }
    >
      <FormSection title="Identity">
        <TextField label="First name" required value={form.first_name} onChange={v => set('first_name', v)}
          error={nameInvalid ? 'A first name is required.' : ''} />
        <TextField label="Last name" value={form.last_name} onChange={v => set('last_name', v)} />
        <TextField label="Email" type="email" value={form.email} onChange={v => set('email', v)}
          error={emailInvalid ? 'That does not look like an email address.' : ''}
          hint="Unique across live contacts; a deleted row releases its address." />
        <TextField label="Phone" value={form.phone} onChange={v => set('phone', v)} />
        <TextField label="Job title" value={form.job_title} onChange={v => set('job_title', v)} />
      </FormSection>

      <FormSection title="Relationship">
        <SelectField
          label="Company"
          value={String(form.company_id ?? '')}
          onChange={v => set('company_id', v)}
          options={companies.map(c => ({ value: String(c.id), label: c.name }))}
          placeholder={companies.length ? 'No company' : 'No companies yet'}
        />
        <SelectField label="Lifecycle" value={form.lifecycle} onChange={v => set('lifecycle', v)}
          options={LIFECYCLES} placeholder="Lead" />
        <SelectField
          label="Owner"
          value={String(form.owner_id ?? '')}
          onChange={v => set('owner_id', v)}
          options={team.map(t => ({ value: String(t.id), label: t.full_name }))}
          placeholder={team.length ? 'Unassigned' : 'No team members yet'}
        />
        <TextField label="Source" value={form.source} onChange={v => set('source', v)}
          hint="Where they came from: form, referral, event, import." />
        <TextField label="Source detail" value={form.source_detail} onChange={v => set('source_detail', v)} />
        <TextField label="Country" value={form.country} onChange={v => set('country', v.toUpperCase())}
          maxLength={2} error={countryInvalid ? 'Two-letter ISO code, e.g. PL.' : ''} />
        <SelectField label="Locale" value={form.locale} onChange={v => set('locale', v)}
          options={[{ value: 'pl', label: 'Polski' }, { value: 'en', label: 'English' }]} placeholder="Polski" />
      </FormSection>

      <FormSection
        title="Consent (GDPR / RODO)"
        note="Outreach may only touch this person with marketing consent recorded and no unsubscribe on file. Both are checked before any send."
      >
        <div
          role="status"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            padding: '8px 10px', borderRadius: 10,
            background: state.mailable ? 'var(--sa-good-soft)' : 'var(--sa-bad-soft)',
            color: state.mailable ? 'var(--sa-good)' : 'var(--sa-bad)',
            fontWeight: 600,
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true">{state.icon}</span>
          {state.mailable ? 'May be contacted by email' : `Must not be emailed — ${state.label.toLowerCase()}`}
        </div>

        <div className="sa-field-row">
          <span className="sa-field-label">Marketing consent</span>
          <label className="sa-checkbox">
            <input
              type="checkbox"
              checked={Number(form.marketing_consent) === 1}
              onChange={e => set('marketing_consent', e.target.checked ? 1 : 0)}
            />
            Consent recorded for marketing email
          </label>
        </div>
        <SelectField
          label="Consent basis"
          value={form.consent_basis}
          onChange={v => set('consent_basis', v)}
          options={CONSENT_BASES}
          placeholder="—"
          error={consentIncomplete ? 'Recorded consent needs a lawful basis.' : ''}
        />
        <TextField label="Consent source" value={form.consent_source} onChange={v => set('consent_source', v)}
          hint="Exactly where it was given: the form, the contract, the event sign-up sheet." />
        <TextField label="Consent date" type="date" value={form.consent_at} onChange={v => set('consent_at', v)}
          hint={form.consent_at ? '' : 'Left empty, today is stamped when consent is recorded.'} />
        {row?.consent_ip && (
          <Field label="Consent IP"><span className="sa-num">{row.consent_ip}</span></Field>
        )}

        <div className="sa-field-row">
          <span className="sa-field-label">Unsubscribed</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {form.unsubscribed_at ? (
              <>
                <span className="sa-badge" style={TONE_STYLE.bad}>
                  {formatEpoch(form.unsubscribed_at, true)}
                </span>
                <button
                  type="button"
                  className="sa-btn sa-btn-ghost sa-btn-sm"
                  onClick={() => { set('unsubscribed_at', null); set('unsubscribe_reason', '') }}
                >
                  Clear (re-opted in)
                </button>
              </>
            ) : (
              <button
                type="button"
                className="sa-btn sa-btn-danger sa-btn-sm"
                onClick={() => { set('unsubscribed_at', nowEpoch()); set('marketing_consent', 0) }}
              >
                Mark unsubscribed
              </button>
            )}
          </div>
        </div>
        {form.unsubscribed_at != null && (
          <TextField label="Unsubscribe reason" value={form.unsubscribe_reason}
            onChange={v => set('unsubscribe_reason', v)} />
        )}
        {form.bounced_at && (
          <Field label="Hard bounce">
            <span className="sa-badge" style={TONE_STYLE.warm}>{formatEpoch(form.bounced_at, true)}</span>
          </Field>
        )}
      </FormSection>

      <FormSection title="Notes">
        <TextAreaField label="Notes" value={form.notes} onChange={v => set('notes', v)} rows={3} />
      </FormSection>

      <WriteError error={error} />

      {row && (
        <>
          <ContactDeals contactId={row.id} />
          <ActivityPanel entityType="contact" entityId={row.id} />
        </>
      )}
    </CrmDrawer>
  )
}

// Split out so the query only exists for a contact that has been saved; a new
// contact has no id to filter on and must not fire a request.
function ContactDeals({ contactId }) {
  const deals = useBizList('deals', { contact_id: contactId, sort: '-created_at', limit: 20 })
  return (
    <RelatedList
      title={`Deals${deals.status === 'ready' && deals.total ? ` · ${deals.total}` : ''}`}
      rows={deals.status === 'ready' ? deals.rows : []}
      emptyHint="No deal is linked to this contact yet. Create one on the Pipeline board and pick this person as the contact."
      render={d => (
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600 }}>{d.title}</span>
          <span className="sa-num">{formatMoney(d.value_minor, d.currency)}</span>
        </span>
      )}
    />
  )
}
