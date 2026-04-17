import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useI18n } from '../i18n'
import { CONVEX_URL } from '../data/studentConfig.js'

const DEBOUNCE_MS = 300
const EMPTY_RESULTS = {
  lessons: [],
  keywords: [],
  errors: [],
  totalMatches: 0,
  cefrFilter: null,
  categoryFilter: null,
  studentFound: true,
}

async function queryConvex(path, args) {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`)
  const payload = await response.json()
  if (payload?.status !== 'success') {
    throw new Error(`${path} returned ${payload?.status || 'unknown status'}`)
  }
  return payload.value
}

function highlight(text, tokens) {
  if (!text || !tokens || tokens.length === 0) return text || ''
  const escaped = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean)
    .join('|')
  if (!escaped) return text
  try {
    const re = new RegExp(`(${escaped})`, 'ig')
    const parts = String(text).split(re)
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <mark key={i} className="em-search-hl">{part}</mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    )
  } catch {
    return text
  }
}

export default function GlobalSearch() {
  const { t } = useI18n()
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  // Derive student slug from URL pattern /app/:slug/…
  const match = location.pathname.match(/^\/app\/([^\/]+)/)
  const studentSlug = params.slug || (match ? match[1] : '')
  const prefix = match ? `/app/${match[1]}` : (location.pathname.startsWith('/app') ? '/app' : '')

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(EMPTY_RESULTS)
  const [error, setError] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const requestIdRef = useRef(0)

  // Close on outside click + Escape
  useEffect(() => {
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
      // CMD/CTRL + K to focus
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // Debounced search effect
  useEffect(() => {
    const trimmed = query.trim()
    if (!studentSlug || trimmed.length < 2) {
      setResults(EMPTY_RESULTS)
      setLoading(false)
      setError('')
      return
    }

    const rid = ++requestIdRef.current
    setLoading(true)
    setError('')
    const handle = setTimeout(async () => {
      try {
        const value = await queryConvex('search:studentSearch', {
          studentSlug,
          q: trimmed,
        })
        if (rid !== requestIdRef.current) return
        setResults({ ...EMPTY_RESULTS, ...value })
      } catch (err) {
        if (rid !== requestIdRef.current) return
        setError(err?.message || 'search failed')
        setResults(EMPTY_RESULTS)
      } finally {
        if (rid === requestIdRef.current) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(handle)
  }, [query, studentSlug])

  const tokens = useMemo(
    () =>
      query
        .toLowerCase()
        .split(/[^a-z0-9\u00c0-\u024f]+/i)
        .filter((t) => t.length >= 2),
    [query],
  )

  const handleNav = useCallback(
    (path, hash) => {
      setOpen(false)
      setQuery('')
      const url = hash ? `${path}#${hash}` : path
      navigate(url)
    },
    [navigate],
  )

  const showDropdown = open && query.trim().length >= 2
  const hasResults =
    results.lessons.length + results.keywords.length + results.errors.length > 0

  if (!studentSlug) return null

  return (
    <div className="em-search-root" ref={rootRef}>
      <div className={`em-search-input-wrap ${open ? 'is-open' : ''}`}>
        <span
          className="material-symbols-outlined em-search-icon"
          aria-hidden="true"
        >
          search
        </span>
        <input
          ref={inputRef}
          type="search"
          className="em-search-input"
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button
            type="button"
            className="em-search-clear"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            aria-label={t('common.close')}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
        <span className="em-search-hint" aria-hidden="true">
          {typeof navigator !== 'undefined' &&
          /Mac|iPhone|iPad/.test(navigator.platform || '')
            ? '⌘K'
            : 'Ctrl K'}
        </span>
      </div>

      {showDropdown && (
        <div className="em-search-pop" role="listbox">
          {loading && (
            <div className="em-search-loading">
              <span className="material-symbols-outlined animate-spin">
                progress_activity
              </span>
              <span>{t('search.loading')}</span>
            </div>
          )}

          {!loading && error && (
            <div className="em-search-error">{t('search.error')}</div>
          )}

          {!loading && !error && !hasResults && (
            <div className="em-search-empty">
              <span className="material-symbols-outlined">search_off</span>
              <div>
                <strong>{t('search.noResults')}</strong>
                <p>{t('search.noResultsHint')}</p>
              </div>
            </div>
          )}

          {!loading && !error && hasResults && (
            <>
              {(results.cefrFilter || results.categoryFilter) && (
                <div className="em-search-filters">
                  {results.cefrFilter && (
                    <span className="em-search-chip">
                      {t('search.filter.cefr')}: {results.cefrFilter}
                    </span>
                  )}
                  {results.categoryFilter && (
                    <span className="em-search-chip">
                      {t('search.filter.category')}: {results.categoryFilter}
                    </span>
                  )}
                </div>
              )}

              {results.lessons.length > 0 && (
                <section className="em-search-group">
                  <header className="em-search-group-head">
                    <span className="material-symbols-outlined">menu_book</span>
                    <span>{t('search.group.lessons')}</span>
                    <span className="em-search-count">
                      {results.lessons.length}
                    </span>
                  </header>
                  <ul className="em-search-list">
                    {results.lessons.map((l) => (
                      <li key={l._id}>
                        <button
                          type="button"
                          className="em-search-result"
                          onClick={() =>
                            handleNav(`${prefix}/lessons`, `lesson-${l._id}`)
                          }
                        >
                          <div className="em-search-result-title">
                            {highlight(l.title, tokens)}
                          </div>
                          <div className="em-search-result-meta">
                            <span>{l.date}</span>
                            {l.cefrBand && (
                              <span className="em-search-badge">{l.cefrBand}</span>
                            )}
                            {(l.topics || []).slice(0, 2).map((topic) => (
                              <span key={topic} className="em-search-topic">
                                {topic}
                              </span>
                            ))}
                          </div>
                          {l.summary && (
                            <div className="em-search-result-snippet">
                              {highlight(
                                String(l.summary).slice(0, 200) +
                                  (l.summary.length > 200 ? '…' : ''),
                                tokens,
                              )}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {results.keywords.length > 0 && (
                <section className="em-search-group">
                  <header className="em-search-group-head">
                    <span className="material-symbols-outlined">translate</span>
                    <span>{t('search.group.vocabulary')}</span>
                    <span className="em-search-count">
                      {results.keywords.length}
                    </span>
                  </header>
                  <ul className="em-search-list">
                    {results.keywords.map((k) => (
                      <li key={k._id}>
                        <button
                          type="button"
                          className="em-search-result"
                          onClick={() =>
                            handleNav(
                              `${prefix}/vocabulary`,
                              `keyword-${k._id}`,
                            )
                          }
                        >
                          <div className="em-search-result-title">
                            {highlight(k.word, tokens)}
                            <span className="em-search-translation">
                              {' — '}
                              {highlight(k.translation, tokens)}
                            </span>
                          </div>
                          <div className="em-search-result-meta">
                            {k.ipa && (
                              <span className="em-search-ipa">{k.ipa}</span>
                            )}
                            {k.difficulty && (
                              <span className="em-search-badge">
                                {k.difficulty}
                              </span>
                            )}
                          </div>
                          {k.definitionEn && (
                            <div className="em-search-result-snippet">
                              {highlight(k.definitionEn, tokens)}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {results.errors.length > 0 && (
                <section className="em-search-group">
                  <header className="em-search-group-head">
                    <span className="material-symbols-outlined">error</span>
                    <span>{t('search.group.errors')}</span>
                    <span className="em-search-count">
                      {results.errors.length}
                    </span>
                  </header>
                  <ul className="em-search-list">
                    {results.errors.map((e, idx) => (
                      <li key={`${e.analysisId}-${idx}`}>
                        <button
                          type="button"
                          className="em-search-result"
                          onClick={() =>
                            handleNav(
                              `${prefix}/knowledge`,
                              `error-${e.analysisId}-${idx}`,
                            )
                          }
                        >
                          <div className="em-search-result-title">
                            {highlight(e.errorText, tokens)}
                          </div>
                          <div className="em-search-result-meta">
                            {e.date && <span>{e.date}</span>}
                            {e.category && (
                              <span className="em-search-badge em-search-badge--muted">
                                {e.category}
                              </span>
                            )}
                          </div>
                          {e.correction && (
                            <div className="em-search-result-snippet em-search-correction">
                              <span className="material-symbols-outlined">
                                arrow_forward
                              </span>
                              {highlight(e.correction, tokens)}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <footer className="em-search-foot">
                <span>
                  {t('search.totalMatches', {
                    n: results.totalMatches,
                  })}
                </span>
              </footer>
            </>
          )}
        </div>
      )}
    </div>
  )
}
