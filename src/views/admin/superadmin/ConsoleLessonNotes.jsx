// ConsoleLessonNotes — "does the student actually see her lesson notes?"
//
// Built 2026-09-02 after a lesson was reported as published that the student
// could not see. The rule this screen is built on:
//
//   ⛔ NOTHING HERE IS THIS CONSOLE'S OPINION. Every green state is a fact the
//      backend proved over the PUBLIC internet a moment ago — /lesson-pdfs.json
//      fetched over HTTPS (not read off disk), the PDF fetched over HTTPS and
//      its first bytes checked for %PDF. If a browser would not get the file,
//      this screen cannot show green.
//
// It therefore separates two things that were previously conflated:
//   "the PDF is uploaded"   — a fact about our server
//   "SHE can see it"        — a fact about her page, which also depends on
//                             whether her lesson is still filed as Upcoming
// A lesson dated today with no AI analysis is Upcoming on her page and shows no
// Raw-notes button until tomorrow. That is the exact trap this screen exists to
// make visible instead of letting someone claim "published".

import { useCallback, useEffect, useRef, useState } from 'react'
import { consoleGet, consolePostBytes } from './consoleApi.js'
import { ConsoleErrorPanel, ConsoleSkeleton } from './ConsoleStates.jsx'

const fmtBytes = n => (n == null ? '—' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

function StateBadge({ state }) {
  const map = {
    yes: ['is-good', 'check_circle', 'She sees it'],
    no: ['is-bad', 'visibility_off', 'She does NOT see it'],
    broken: ['is-bad', 'error', 'Button shown, file broken'],
  }
  const [cls, icon, label] = map[state] || ['is-neutral', 'help', 'Unknown']
  return (
    <span className={`ops-status ${cls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">{icon}</span>
      {label}
    </span>
  )
}

const PROV_LABEL = {
  'planned-keyword': ['Planned', 'from the deck keyword table'],
  'added-in-lesson': ['In lesson', 'typed into OneNote as a Word: block — the auto-publisher owns and rewrites these'],
  pronunciation: ['Pronunciation', 'marked "(pronunciation)" on the page; deliberately NOT tagged added-in-lesson so the 5-minute publisher cannot delete it'],
}

// The vocabulary IS the card. A working Raw-notes button on a card with no
// keywords, blank Polish, or a YouGlish control that opens to nothing is still a
// broken lesson for her — and none of that was visible here before 2026-09-02.
function KeywordTable({ keywords }) {
  if (!keywords?.length) return <p className="sa-muted" style={{ fontSize: 13 }}>No keywords on this card.</p>
  return (
    <div style={{ overflowX: 'auto', marginTop: 10 }}>
      <table className="sa-table" style={{ width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Word</th>
            <th style={{ textAlign: 'left' }}>IPA</th>
            <th style={{ textAlign: 'left' }}>Polish</th>
            <th style={{ textAlign: 'left' }}>Example she reads</th>
            <th style={{ textAlign: 'left' }}>Clips</th>
            <th style={{ textAlign: 'left' }}>Source</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map(k => {
            const yg = k.youglish || {}
            const bad = !!k.emptyFields
            return (
              <tr key={k.word} style={bad ? { background: 'var(--sa-bad-bg, #fef2f2)' } : undefined}>
                <td><strong>{k.word}</strong>
                  {bad && <div style={{ color: 'var(--sa-bad, #b91c1c)', fontSize: 11 }}>
                    blank on her card: {k.emptyFields.join(', ')}</div>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{k.ipa || <span className="sa-muted">—</span>}</td>
                <td>{k.translation || <span className="sa-muted">—</span>}</td>
                <td style={{ maxWidth: 340 }}>{k.exampleEn || <span className="sa-muted">—</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {yg.error
                    ? <span style={{ color: 'var(--sa-bad, #b91c1c)' }}>{yg.error}</span>
                    : yg.clips > 0
                      ? <span style={{ color: 'var(--sa-good, #15803d)' }}>{yg.clips}</span>
                      : <span style={{ color: 'var(--sa-bad, #b91c1c)' }} title="the control appears and opens to nothing">0</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {(k.provenance || ['untagged']).map(t => {
                    const [label, why] = PROV_LABEL[t] || [t, 'no known owner rewrites this row']
                    return <span key={t} className="sa-chip" title={why} style={{ marginRight: 4 }}>{label}</span>
                  })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function LessonRow({ row, slug, onUploaded }) {
  const [open, setOpen] = useState(false)
  const [vocab, setVocab] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null)
  const live = row.live || {}
  const c = row.keywordCounts
  const entry = row.registryEntry
  const pdfHref = entry ? (entry.url.startsWith('http') ? entry.url : entry.url) : null

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/\.pdf$/i.test(file.name)) return setMsg({ bad: true, text: 'Choose a .pdf file.' })
    if (file.size > 24 * 1024 * 1024) {
      return setMsg({ bad: true, text: `That file is ${fmtBytes(file.size)}. The limit on this route is 24 MB.` })
    }
    const verb = entry ? 'REPLACE' : 'upload'
    const warn = entry
      ? `Replace the notes for ${row.date}?\n\nCurrent: ${entry.filename}\nNew: ${file.name} (${fmtBytes(file.size)})\n\nThe file being replaced is backed up first.`
      : `Upload notes for ${row.date}?\n\n${file.name} (${fmtBytes(file.size)})`
    if (!window.confirm(warn)) return
    setBusy(true); setMsg(null)
    try {
      const out = await consolePostBytes('/api/console/lesson-notes/upload',
        { slug, date: row.date, filename: file.name }, file)
      setMsg(out.ok
        ? { text: `${verb === 'REPLACE' ? 'Replaced' : 'Uploaded'} — verified live: ${out.filename}, ${fmtBytes(out.bytes)}${out.pages ? `, ${out.pages} pages` : ''}.` }
        : { bad: true, text: `Saved, but the live check FAILED: ${out.live?.error || 'unknown'}. Do not treat this as published.` })
      onUploaded()
    } catch (err) {
      setMsg({ bad: true, text: err.message })
    } finally { setBusy(false) }
  }

  return (
    <article className="ops-alert" style={{ display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 96 }}>
          <strong style={{ fontSize: 15 }}>{row.date}</strong>
          <div className="sa-muted" style={{ fontSize: 12 }}>
            {row.sheSeesCard ? 'card visible' : 'filed as Upcoming'}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{row.title || '(no title)'}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>{row.reason}</p>
          {!!c && (
            <p className="sa-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              {c.total} keyword{c.total === 1 ? '' : 's'} on her card
              {` — ${c.planned} planned, ${c.inLesson} added in the lesson`}
              {c.pronunciation ? `, ${c.pronunciation} pronunciation` : ''}
              {c.withClips != null && ` · ${c.withClips}/${c.total} have YouGlish clips`}
            </p>
          )}
          {row.cardWarnings?.map(w => (
            <p key={w} style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--sa-bad, #b91c1c)' }}>{w}</p>
          ))}
          {entry && (
            <p className="sa-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              {entry.filename} · {fmtBytes(row.disk?.bytes ?? live.bytes)}
              {row.disk?.pages ? ` · ${row.disk.pages} pages` : ''}
              {' · live '}
              {/* 206 is the backend asking for only the first bytes with a Range header
                  so it does not download every PDF; both mean she gets the file. */}
              {live.ok
                ? <strong style={{ color: 'var(--sa-good, #15803d)' }}>{live.status} real PDF</strong>
                : <strong style={{ color: 'var(--sa-bad, #b91c1c)' }}>{live.error || 'not checked'}</strong>}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <StateBadge state={row.rawNotesState} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!!c && (
              <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setVocab(v => !v)}>
                <span className="material-symbols-outlined" aria-hidden="true">spellcheck</span>
                {vocab ? 'Hide vocabulary' : `Vocabulary (${c.total})`}
              </button>
            )}
            {pdfHref && (
              <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setOpen(o => !o)}>
                <span className="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>
                {open ? 'Hide' : 'Preview'}
              </button>
            )}
            {pdfHref && (
              <a className="sa-btn sa-btn-ghost sa-btn-sm" href={pdfHref} target="_blank" rel="noreferrer">
                <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>Open
              </a>
            )}
            <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" disabled={busy}
              onClick={() => fileRef.current?.click()}>
              <span className="material-symbols-outlined" aria-hidden="true">upload_file</span>
              {busy ? 'Uploading…' : entry ? 'Replace PDF' : 'Upload PDF'}
            </button>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={pick} />
          </div>
        </div>
      </div>
      {msg && (
        <div className={`ops-banner ${msg.bad ? 'ops-banner-bad' : 'ops-banner-good'}`} style={{ marginTop: 10 }}>
          {msg.text}
        </div>
      )}
      {vocab && <KeywordTable keywords={row.keywords} />}
      {open && pdfHref && (
        // The same public URL her browser would request. If this frame is blank,
        // her download is blank too — that is the point of previewing it here.
        <iframe title={`Raw notes ${row.date}`} src={pdfHref}
          style={{ width: '100%', height: 620, marginTop: 12, border: '1px solid var(--sa-border, #e5e7eb)', borderRadius: 10, background: '#fff' }} />
      )}
    </article>
  )
}

export default function ConsoleLessonNotes({ slug }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      setData(await consoleGet('/api/console/lesson-notes', { slug }))
      setError(null)
    } catch (e) { setError(e) } finally { setLoading(false) }
  }, [slug])

  useEffect(() => { load() }, [load])

  if (loading && !data) return <ConsoleSkeleton rows={5} label="Checking what the student can actually see" />
  if (error) return <ConsoleErrorPanel error={error} onRetry={load} />
  if (!data) return null

  const visible = data.lessons.filter(l => l.rawNotesState === 'yes').length
  const broken = data.lessons.filter(l => l.rawNotesState === 'broken').length
  const hidden = data.lessons.filter(l => l.rawNotesState === 'no').length
  const kwTotal = data.lessons.reduce((n, l) => n + (l.keywordCounts?.total || 0), 0)
  const kwBad = data.lessons.reduce((n, l) => n + (l.keywordCounts?.withEmptyFields || 0), 0)
  const noClips = data.lessons.flatMap(l => l.keywordCounts?.noClips || [])
  const pub = data.publisher
  const missingFields = Object.keys(pub?.missingRosterFields || {})
  const skipped = Object.keys(pub?.skippedStages || {})

  return (
    <section className="ops-section">
      <div className="ops-section-head">
        <div>
          <h2>Lesson notes — what {data.studentName || slug} actually sees</h2>
          <p>
            Checked live a moment ago, not from our database. The index and every PDF were
            fetched over <code>https://englishmetro.com</code> exactly as her browser fetches
            them, and each file was confirmed to really be a PDF.
          </p>
        </div>
        <div className="ops-header-actions">
          <a className="sa-btn sa-btn-ghost" href={data.studentUrl} target="_blank" rel="noreferrer">
            <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>Her lessons page
          </a>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={load}>
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>Re-check
          </button>
        </div>
      </div>

      <section className="ops-stat-grid ops-stat-grid-3">
        <div className="ops-stat"><span className="ops-stat-label">She can open</span><strong>{visible}</strong><span>lessons with working notes</span></div>
        <div className="ops-stat"><span className="ops-stat-label">Hidden from her</span><strong>{hidden}</strong><span>no button on her page</span></div>
        <div className="ops-stat"><span className="ops-stat-label">Broken</span><strong>{broken}</strong><span>button shown, file fails</span></div>
      </section>

      <section className="ops-stat-grid ops-stat-grid-3">
        <div className="ops-stat"><span className="ops-stat-label">Vocabulary</span><strong>{kwTotal}</strong><span>keywords across her cards</span></div>
        <div className="ops-stat"><span className="ops-stat-label">Blank fields</span><strong>{kwBad}</strong><span>keywords she sees a gap on</span></div>
        <div className="ops-stat"><span className="ops-stat-label">No clips</span><strong>{noClips.length}</strong><span>YouGlish opens to nothing</span></div>
      </section>

      {/* "No analysis" is normal for a student who never bought the 20 PLN add-on.
          Saying only "no analysis" made a correct state look like a failed publish. */}
      {data.analysis?.verdict && (
        <div className={`ops-banner ${data.analysis.eligibility?.allowed ? 'ops-banner-good' : 'ops-banner-info'}`}>
          {/* one child: .ops-banner is a flex row, so separate elements become columns */}
          <span><strong>AI analysis:</strong> {data.analysis.verdict}
            {data.analysis.eligibility?.reason === 'no_consent' && (
              <> — she has not bought the 20 PLN add-on, so publishing one would be charging
              for a product she did not buy. Bajla also cannot personalise for her until then,
              because the tutor builds its learner model from analyses.</>
            )}
          </span>
        </div>
      )}

      {/* Will this keep working with nobody watching? */}
      {pub && (
        <div className={`ops-banner ${pub.rostered === false || skipped.length ? 'ops-banner-warn' : 'ops-banner-good'}`}>
          <span>
            <strong>Runs by itself:</strong>{' '}
            {pub.rostered === false ? (
              <>this student has NO entry in the publisher roster, so every stage needing a roster
              field is skipped on every lesson and someone has to publish her by hand.</>
            ) : skipped.length ? (
              <>the auto-publisher carries her, except <em>{skipped.join(', ')}</em>, which
              {skipped.length === 1 ? ' is' : ' are'} skipped for a missing roster field
              ({missingFields.join(', ')}). Everything else publishes unattended.</>
            ) : (
              <>every stage runs unattended for this student.</>
            )}
            {pub.lastRun?.stages && (
              <div className="sa-muted" style={{ fontSize: 12, marginTop: 6 }}>
                Last automatic run ({pub.lastRun.lessonKey}):{' '}
                {Object.entries(pub.lastRun.stages)
                  .map(([k, v]) => `${k}=${v.status}`).join(' · ')}
              </div>
            )}
          </span>
        </div>
      )}

      {!data.slugPresentInRegistry && (
        <div className="ops-banner ops-banner-bad">
          <strong>{slug}</strong> has no entry at all in <code>/lesson-pdfs.json</code>. Her page looks
          the index up by SLUG, so every Raw-notes button is missing. Filing PDFs under the folder
          name instead of the slug is the usual cause.
        </div>
      )}
      {data.registryError && (
        <div className="ops-banner ops-banner-bad">
          Could not fetch the public index: {data.registryError}. Until that is fixed nobody sees any notes.
        </div>
      )}
      {!!data.orphanEntries?.length && (
        <div className="ops-banner ops-banner-warn">
          {data.orphanEntries.length} PDF entr{data.orphanEntries.length === 1 ? 'y is' : 'ies are'} registered
          for a date with no lesson ({data.orphanEntries.map(o => o.date).join(', ')}) — nobody can reach
          {data.orphanEntries.length === 1 ? ' it' : ' them'}.
        </div>
      )}

      <div className="ops-alert-list">
        {data.lessons.map(row => (
          <LessonRow key={row.lessonId || row.date} row={row} slug={slug} onUploaded={load} />
        ))}
        {!data.lessons.length && <p className="sa-muted">This student has no lesson cards yet.</p>}
      </div>

      <p className="sa-muted" style={{ fontSize: 12, marginTop: 12 }}>
        Visibility rule mirrored from <code>{data.studentViewSource}</code>: a lesson dated today or
        later with no AI analysis is shown to her as <em>Upcoming</em>, and an Upcoming lesson has no
        Raw-notes button. Today is {data.today}. Notes upload fine before then — she just cannot open
        them until the lesson stops being Upcoming.
      </p>
    </section>
  )
}
