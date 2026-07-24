// CRM → Companies. The B2B side: organisations that buy corporate ESL.
//
// Poland-first, so the tax identifier is not an afterthought. A Polish company
// is identified by its NIP, every invoice must carry it, and a wrong one is a
// wrong invoice — so NIP has its own column, its own filter, and a checksum
// validation on the way in (shape only: this proves the number could exist, not
// that it is registered on the white list).
//
// The table ships empty and stays empty until a real account is entered.

import { useState } from 'react'
import {
  ActivityPanel, ConfirmDialog, CountNote, CrmDrawer, FormSection, ListState,
  RelatedList, SelectField, SortTh, TextAreaField, TextField, WriteError,
  nz, useBizCount, useBizList, useDebounced, useRefList,
} from './CrmShared.jsx'
import { ConsoleEmpty } from './ConsoleStates.jsx'
import {
  bizCreate, bizDelete, bizUpdate, formatEpoch, formatMoney, formatNip, isValidNip, nipDigits,
} from './crmApi.js'

const ENDPOINT = '/api/console/biz/companies'

const STATUSES = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'active', label: 'Active' },
  { value: 'churned', label: 'Churned' },
  { value: 'disqualified', label: 'Disqualified' },
]

const SIZE_BANDS = ['1-9', '10-49', '50-249', '250-999', '1000+'].map(v => ({ value: v, label: `${v} staff` }))

const TAX_ID_TYPES = [
  { value: 'nip', label: 'NIP (Poland)' },
  { value: 'vat_eu', label: 'EU VAT' },
  { value: 'vat', label: 'VAT (other)' },
  { value: 'ein', label: 'EIN (US)' },
  { value: 'other', label: 'Other' },
]

const STATUS_TONE = {
  active: { background: 'var(--sa-good-soft)', color: 'var(--sa-good)' },
  prospect: { background: 'var(--sa-violet-100)', color: 'var(--sa-violet-600)' },
  churned: { background: 'var(--sa-warm-soft)', color: 'var(--sa-warm-ink)' },
  disqualified: { background: 'var(--sa-bad-soft)', color: 'var(--sa-bad)' },
}

// A tax id is displayed as the country expects, and a Polish one that fails its
// checksum is called out where the operator will see it: in the table.
function TaxIdCell({ row }) {
  if (!row.tax_id) {
    return <span style={{ color: 'var(--sa-text-muted)' }}>— no NIP</span>
  }
  const isNip = (row.tax_id_type || 'nip') === 'nip'
  const bad = isNip && !isValidNip(row.tax_id)
  return (
    <span className="sa-num" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {isNip ? formatNip(row.tax_id) : row.tax_id}
      {bad && (
        <span
          className="material-symbols-outlined"
          title="NIP checksum does not validate"
          style={{ fontSize: 15, color: 'var(--sa-bad)' }}
        >
          report
        </span>
      )}
      {bad && <span className="sa-sr-only">NIP checksum does not validate</span>}
    </span>
  )
}

export default function ConsoleCompanies() {
  const [qInput, setQInput] = useState('')
  const q = useDebounced(qInput)
  const [status, setStatus] = useState('')
  const [country, setCountry] = useState('')
  const [size, setSize] = useState('')
  const [sort, setSort] = useState('name')
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const filters = {
    ...(status ? { status } : {}),
    ...(country ? { country } : {}),
    ...(size ? { size_band: size } : {}),
    ...(q ? { q } : {}),
    sort,
    limit: 50,
  }
  const list = useBizList('companies', filters)
  const team = useRefList('team_members', { sort: 'full_name', limit: 200 })

  const totalAll = useBizCount('companies', {})
  const totalActive = useBizCount('companies', { status: 'active' })
  const totalNoTax = useBizCount('companies', { tax_id__null: 1 })

  const filtersActive = Boolean(q || status || country || size)

  function clearFilters() {
    setQInput('')
    setStatus('')
    setCountry('')
    setSize('')
  }

  async function doDelete() {
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await bizDelete('companies', confirmDelete.id)
      setConfirmDelete(null)
      list.reload()
    } catch (e) {
      setDeleteError(e.message || 'Could not delete this company')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Companies</h1>
          <p>
            Corporate accounts for business English programmes. Polish buyers are identified by NIP,
            which every invoice has to carry, so it is validated here before it can reach an invoice.
          </p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing('new')}>
            <span className="material-symbols-outlined" aria-hidden="true">domain_add</span>
            New company
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 12 }}>
        <Kpi label="Companies" value={totalAll} />
        <Kpi label="Active accounts" value={totalActive} tone="good" />
        <Kpi label="Missing tax id" value={totalNoTax} />
      </div>

      <div className="sa-toolbar">
        <label className="sa-sr-only" htmlFor="companies-search">Search companies</label>
        <input
          id="companies-search"
          type="search"
          className="sa-input"
          placeholder="Search name, NIP, city, industry…"
          value={qInput}
          onChange={e => setQInput(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <label className="sa-sr-only" htmlFor="companies-status">Status</label>
        <select id="companies-status" className="sa-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <label className="sa-sr-only" htmlFor="companies-size">Size</label>
        <select id="companies-size" className="sa-select" value={size} onChange={e => setSize(e.target.value)}>
          <option value="">Any size</option>
          {SIZE_BANDS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <label className="sa-sr-only" htmlFor="companies-country">Country</label>
        <input
          id="companies-country"
          className="sa-input"
          placeholder="Country (PL)"
          maxLength={2}
          value={country}
          onChange={e => setCountry(e.target.value.toUpperCase())}
          style={{ width: 120, minWidth: 0 }}
        />
        {filtersActive && (
          <button type="button" className="sa-btn sa-btn-ghost" onClick={clearFilters}>
            <span className="material-symbols-outlined" aria-hidden="true">filter_alt_off</span>
            Clear filters
          </button>
        )}
        <span className="sa-toolbar-spacer" />
        {list.status === 'ready' && <CountNote shown={list.rows.length} total={list.total} noun="companies" />}
      </div>

      <div className="sa-card" style={{ marginTop: 12, overflow: 'hidden' }}>
        <ListState status={list.status} error={list.error} endpoint={ENDPOINT} onRetry={list.reload} />

        {list.status === 'ready' && !list.rows.length && (
          filtersActive ? (
            <ConsoleEmpty
              icon="search_off"
              title="No companies match these filters"
              hint="Nothing in the company table matches the current search and filter set."
              action={<button type="button" className="sa-btn sa-btn-ghost" onClick={clearFilters}>Clear filters</button>}
            />
          ) : (
            <ConsoleEmpty
              icon="domain"
              title="No companies yet"
              hint={
                <>
                  <p>
                    Corporate ESL is a core segment: an employer buys a programme, HR signs it, and the
                    invoice goes to the company, not to the learner. This is where those accounts live.
                  </p>
                  <p style={{ marginTop: '0.5rem' }}>
                    Add the first account with its legal name and NIP, then attach the people you deal
                    with as contacts and the opportunity as a deal.
                  </p>
                </>
              }
              action={
                <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing('new')}>
                  Add the first company
                </button>
              }
            />
          )
        )}

        {list.status === 'ready' && list.rows.length > 0 && (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <caption className="sa-sr-only">Companies, sortable.</caption>
              <thead>
                <tr>
                  <SortTh column="name" label="Company" sort={sort} onSort={setSort} />
                  <SortTh column="tax_id" label="NIP / tax id" sort={sort} onSort={setSort} />
                  <SortTh column="industry" label="Industry" sort={sort} onSort={setSort} />
                  <SortTh column="size_band" label="Size" sort={sort} onSort={setSort} />
                  <SortTh column="city" label="City" sort={sort} onSort={setSort} />
                  <SortTh column="country" label="Country" sort={sort} onSort={setSort} />
                  <SortTh column="status" label="Status" sort={sort} onSort={setSort} />
                  <SortTh column="created_at" label="Added" sort={sort} onSort={setSort} align="right" />
                  <th><span className="sa-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map(row => (
                  <tr key={row.id} className="is-clickable" onClick={() => setEditing(row)}>
                    <td style={{ fontWeight: 600 }}>
                      {row.name}
                      {row.legal_name && row.legal_name !== row.name && (
                        <span style={{ color: 'var(--sa-text-muted)', fontWeight: 400 }}> · {row.legal_name}</span>
                      )}
                    </td>
                    <td><TaxIdCell row={row} /></td>
                    <td style={{ color: 'var(--sa-text-muted)' }}>{row.industry || '—'}</td>
                    <td className="sa-num">{row.size_band || '—'}</td>
                    <td style={{ color: 'var(--sa-text-muted)' }}>{row.city || '—'}</td>
                    <td className="sa-num">{row.country || '—'}</td>
                    <td>
                      <span className="sa-badge" style={STATUS_TONE[row.status]}>{row.status}</span>
                    </td>
                    <td className="sa-num">{formatEpoch(row.created_at)}</td>
                    <td className="sa-td-right" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="sa-icon-btn sa-icon-btn-sm"
                        onClick={() => setEditing(row)}
                        aria-label={`Edit ${row.name}`}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                      </button>
                      <button
                        type="button"
                        className="sa-icon-btn sa-icon-btn-sm"
                        onClick={() => { setConfirmDelete(row); setDeleteError('') }}
                        aria-label={`Delete ${row.name}`}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
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
        <CompanyDrawer
          key={editing === 'new' ? 'new' : editing.id}
          row={editing === 'new' ? null : editing}
          team={team}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); list.reload() }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this company?"
          danger
          busy={deleteBusy}
          confirmLabel="Delete company"
          body={
            <>
              <p>
                <strong>{confirmDelete.name}</strong> will be soft-deleted. Contacts and deals that point
                at it keep existing; their company link is cleared.
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
    name: '', legal_name: '', tax_id: '', tax_id_type: 'nip', registry_id: '',
    country: 'PL', industry: '', size_band: '', website: '', email: '', phone: '',
    address_line1: '', address_line2: '', city: '', postcode: '',
    currency: 'PLN', locale: 'pl', status: 'prospect', owner_id: '', source: '', notes: '',
  }
}

function toForm(row) {
  if (!row) return blank()
  return {
    name: row.name || '',
    legal_name: row.legal_name || '',
    tax_id: row.tax_id || '',
    tax_id_type: row.tax_id_type || 'nip',
    registry_id: row.registry_id || '',
    country: row.country || 'PL',
    industry: row.industry || '',
    size_band: row.size_band || '',
    website: row.website || '',
    email: row.email || '',
    phone: row.phone || '',
    address_line1: row.address_line1 || '',
    address_line2: row.address_line2 || '',
    city: row.city || '',
    postcode: row.postcode || '',
    currency: row.currency || 'PLN',
    locale: row.locale || 'pl',
    status: row.status || 'prospect',
    owner_id: row.owner_id ?? '',
    source: row.source || '',
    notes: row.notes || '',
  }
}

function CompanyDrawer({ row, team, onClose, onSaved }) {
  const [form, setForm] = useState(() => toForm(row))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setTouched(true) }

  const isNip = form.tax_id_type === 'nip'
  const taxDigits = nipDigits(form.tax_id)
  const nipError = isNip && form.tax_id.trim()
    ? (taxDigits.length !== 10
      ? 'A NIP is exactly 10 digits.'
      : (!isValidNip(taxDigits) ? 'Checksum fails — this cannot be a real NIP.' : ''))
    : ''
  const nameInvalid = touched && !form.name.trim()
  const countryInvalid = !/^[A-Za-z]{2}$/.test(String(form.country || '').trim())
  const canSave = form.name.trim() && !nipError && !countryInvalid && !busy

  async function save() {
    if (!canSave) { setTouched(true); return }
    setBusy(true)
    setError('')
    // A NIP is stored as its ten digits: the unique index is (country, tax_id),
    // so "526-000-12-46" and "5260001246" must not be able to coexist.
    const taxId = isNip ? (taxDigits || null) : nz(form.tax_id)
    const payload = {
      name: form.name.trim(),
      legal_name: nz(form.legal_name),
      tax_id: taxId,
      tax_id_type: taxId ? form.tax_id_type : null,
      registry_id: nz(form.registry_id),
      country: form.country.trim().toUpperCase(),
      industry: nz(form.industry),
      size_band: nz(form.size_band),
      website: nz(form.website),
      email: nz(form.email)?.toLowerCase() ?? null,
      phone: nz(form.phone),
      address_line1: nz(form.address_line1),
      address_line2: nz(form.address_line2),
      city: nz(form.city),
      postcode: nz(form.postcode),
      currency: (form.currency || 'PLN').toUpperCase(),
      locale: form.locale || 'pl',
      status: form.status || 'prospect',
      owner_id: form.owner_id ? Number(form.owner_id) : null,
      source: nz(form.source),
      notes: nz(form.notes),
    }
    try {
      if (row) await bizUpdate('companies', row.id, payload)
      else await bizCreate('companies', payload)
      onSaved()
    } catch (e) {
      setError(e.message || 'Could not save this company')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CrmDrawer
      title={row ? row.name : 'New company'}
      subtitle={row ? `Company #${row.id}` : 'Nothing is stored until you save.'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : row ? 'Save changes' : 'Create company'}
          </button>
        </>
      }
    >
      <FormSection title="Identity">
        <TextField label="Trading name" required value={form.name} onChange={v => set('name', v)}
          error={nameInvalid ? 'A name is required.' : ''} />
        <TextField label="Legal name" value={form.legal_name} onChange={v => set('legal_name', v)}
          hint="As it must appear on an invoice, e.g. “… sp. z o.o.”" />
      </FormSection>

      <FormSection
        title="Tax and registry"
        note="Poland-first: a NIP is ten digits with a weighted checksum. It is stored digits-only and unique per country, so the same company cannot be entered twice under two spellings."
      >
        <SelectField label="Tax id type" value={form.tax_id_type} onChange={v => set('tax_id_type', v)}
          options={TAX_ID_TYPES} placeholder="NIP (Poland)" />
        <TextField
          label={isNip ? 'NIP' : 'Tax id'}
          value={form.tax_id}
          onChange={v => set('tax_id', v)}
          error={nipError}
          hint={isNip && !nipError && taxDigits.length === 10
            ? `Valid · stored as ${taxDigits}, shown as ${formatNip(taxDigits)}`
            : 'Dashes and spaces are fine; they are stripped on save.'}
          inputMode={isNip ? 'numeric' : undefined}
        />
        <TextField label="KRS / REGON" value={form.registry_id} onChange={v => set('registry_id', v)} />
        <TextField label="Country" value={form.country} onChange={v => set('country', v.toUpperCase())}
          maxLength={2} required error={countryInvalid ? 'Two-letter ISO code, e.g. PL.' : ''} />
      </FormSection>

      <FormSection title="Profile">
        <TextField label="Industry" value={form.industry} onChange={v => set('industry', v)} />
        <SelectField label="Size" value={form.size_band} onChange={v => set('size_band', v)}
          options={SIZE_BANDS} placeholder="Unknown" />
        <SelectField label="Status" value={form.status} onChange={v => set('status', v)}
          options={STATUSES} placeholder="Prospect" />
        <SelectField
          label="Owner"
          value={String(form.owner_id ?? '')}
          onChange={v => set('owner_id', v)}
          options={team.map(t => ({ value: String(t.id), label: t.full_name }))}
          placeholder={team.length ? 'Unassigned' : 'No team members yet'}
        />
        <TextField label="Source" value={form.source} onChange={v => set('source', v)} />
      </FormSection>

      <FormSection title="Reaching them">
        <TextField label="Website" value={form.website} onChange={v => set('website', v)} placeholder="https://" />
        <TextField label="Email" type="email" value={form.email} onChange={v => set('email', v)} />
        <TextField label="Phone" value={form.phone} onChange={v => set('phone', v)} />
        <TextField label="Address" value={form.address_line1} onChange={v => set('address_line1', v)} />
        <TextField label="Address line 2" value={form.address_line2} onChange={v => set('address_line2', v)} />
        <TextField label="Postcode" value={form.postcode} onChange={v => set('postcode', v)} />
        <TextField label="City" value={form.city} onChange={v => set('city', v)} />
      </FormSection>

      <FormSection title="Billing defaults">
        <TextField label="Currency" value={form.currency} onChange={v => set('currency', v.toUpperCase())}
          maxLength={3} hint="ISO code. Deals and invoices for this account default to it." />
        <SelectField label="Locale" value={form.locale} onChange={v => set('locale', v)}
          options={[{ value: 'pl', label: 'Polski' }, { value: 'en', label: 'English' }]} placeholder="Polski" />
      </FormSection>

      <FormSection title="Notes">
        <TextAreaField label="Notes" value={form.notes} onChange={v => set('notes', v)} rows={3} />
      </FormSection>

      <WriteError error={error} />

      {row && (
        <>
          <CompanyPeople companyId={row.id} />
          <CompanyDeals companyId={row.id} />
          <ActivityPanel entityType="company" entityId={row.id} />
        </>
      )}
    </CrmDrawer>
  )
}

function CompanyPeople({ companyId }) {
  const contacts = useBizList('contacts', { company_id: companyId, sort: 'last_name', limit: 25 })
  return (
    <RelatedList
      title={`Contacts${contacts.status === 'ready' && contacts.total ? ` · ${contacts.total}` : ''}`}
      rows={contacts.status === 'ready' ? contacts.rows : []}
      emptyHint="Nobody at this company is on file yet. Add them under Contacts and pick this company."
      render={c => (
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600 }}>{[c.first_name, c.last_name].filter(Boolean).join(' ')}</span>
          <span style={{ color: 'var(--sa-text-muted)' }}>{c.job_title || c.email || ''}</span>
        </span>
      )}
    />
  )
}

function CompanyDeals({ companyId }) {
  const deals = useBizList('deals', { company_id: companyId, sort: '-created_at', limit: 25 })
  return (
    <RelatedList
      title={`Deals${deals.status === 'ready' && deals.total ? ` · ${deals.total}` : ''}`}
      rows={deals.status === 'ready' ? deals.rows : []}
      emptyHint="No opportunity is on the board for this account yet."
      render={d => (
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600 }}>{d.title}</span>
          <span className="sa-num">{formatMoney(d.value_minor, d.currency)}</span>
        </span>
      )}
    />
  )
}
