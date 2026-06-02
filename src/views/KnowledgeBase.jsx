import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { RichInline, Modal } from '../components/analytics/AnalyticsPrimitives.jsx'
import { useI18n } from '../i18n'
import { fetchJSONCached } from '../practice/lib/practice-cache'

/* ============================================================================
   Knowledge Base — per-student error library with Polish-specific explanations
   ============================================================================ */

const CATEGORY_META = {
  grammar: { label: 'Grammar', labelKey: 'knowledge.cat.grammar', icon: 'spellcheck', color: 'violet' },
  'grammar-subordination': { label: 'Grammar', labelKey: 'knowledge.cat.grammar', icon: 'spellcheck', color: 'violet' },
  'grammar-tense': { label: 'Grammar (Tense)', labelKey: 'knowledge.cat.grammarTense', icon: 'schedule', color: 'violet' },
  'grammar-article': { label: 'Articles', labelKey: 'knowledge.cat.articles', icon: 'short_text', color: 'violet' },
  'grammar-modal': { label: 'Modals', labelKey: 'knowledge.cat.modals', icon: 'stream', color: 'violet' },
  vocabulary: { label: 'Vocabulary', labelKey: 'knowledge.cat.vocabulary', icon: 'book', color: 'sky' },
  collocation: { label: 'Collocations', labelKey: 'knowledge.cat.collocations', icon: 'join', color: 'blue' },
  pronunciation: { label: 'Pronunciation', labelKey: 'knowledge.cat.pronunciation', icon: 'record_voice_over', color: 'amber' },
  register: { label: 'Register', labelKey: 'knowledge.cat.register', icon: 'style', color: 'emerald' },
  pragmatics: { label: 'Pragmatics', labelKey: 'knowledge.cat.pragmatics', icon: 'chat', color: 'teal' },
  preposition: { label: 'Prepositions', labelKey: 'knowledge.cat.prepositions', icon: 'compare_arrows', color: 'indigo' },
  discourse: { label: 'Discourse', labelKey: 'knowledge.cat.discourse', icon: 'forum', color: 'rose' },
}

function getCategoryMeta(cat) {
  if (!cat) return CATEGORY_META.grammar
  if (CATEGORY_META[cat]) return CATEGORY_META[cat]
  for (const [key, meta] of Object.entries(CATEGORY_META)) {
    if (cat.startsWith(key)) return meta
  }
  return CATEGORY_META.grammar
}

function normalizeEntry(e) {
  // Support both agent schemas: { title, whyPolishSpeakersMakeIt, ruleExplanation, fixStrategies }
  // and { pattern, polishInterference, remediation }
  return {
    id: e.id || '',
    title: e.title || e.pattern || 'Untitled error pattern',
    category: e.category || 'grammar',
    level: e.level || e.cefrLevel || '',
    fossilized: Boolean(e.fossilized),
    frequency: e.frequency || '',
    priority: e.priority || '',
    summary: e.summary || '',
    polishInterference: e.polishInterference || e.whyPolishSpeakersMakeIt || '',
    ruleExplanation: e.ruleExplanation || '',
    examples: e.examples || e.examplesFromLessons || [],
    fixStrategies: Array.isArray(e.fixStrategies)
      ? e.fixStrategies
      : (e.remediation ? [e.remediation] : []),
    miniDrill: e.miniDrill || null,
  }
}

function getExampleText(ex) {
  return {
    said: ex.said || ex.incorrect || '',
    corrected: ex.corrected || ex.correct || '',
    context: ex.context || '',
    lessonDate: ex.lessonDate || '',
  }
}

export default function KnowledgeBase({ data }) {
  const { t } = useI18n()
  const params = useParams()
  const navigate = useNavigate()
  const slug = params.slug || data?.profile?.slug || 'szymon-karpinski'
  const [kb, setKb] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('all')
  const [showFossilizedOnly, setShowFossilizedOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [activeDrill, setActiveDrill] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // 30s timeout + 5-min cache shared with practice/lib/kb-reader.fetchKB.
    const url = `/knowledge-base/${slug}.json`
    fetchJSONCached(url, { cacheKey: `kb::${url}` })
      .then(data => { if (!cancelled) { setKb(data); setLoading(false) } })
      .catch(() => { if (!cancelled) { setKb(null); setLoading(false) } })
    return () => { cancelled = true }
  }, [slug])

  const errors = useMemo(() => {
    if (!kb) return []
    const raw = Array.isArray(kb)
      ? kb
      : (kb.errors || kb.errorPatterns || kb.patterns || [])
    return raw.map(normalizeEntry)
  }, [kb])

  const categories = useMemo(() => {
    const map = new Map()
    errors.forEach(e => {
      const meta = getCategoryMeta(e.category)
      if (!map.has(meta.label)) {
        map.set(meta.label, { key: meta.label, label: meta.label, labelKey: meta.labelKey })
      }
    })
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [errors])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return errors.filter(e => {
      if (showFossilizedOnly && !e.fossilized) return false
      if (activeCategory !== 'all' && getCategoryMeta(e.category).label !== activeCategory) return false
      if (q) {
        const hay = [e.title, e.summary, e.polishInterference, e.ruleExplanation, ...e.fixStrategies].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [errors, activeCategory, showFossilizedOnly, search])

  const fossilizedCount = errors.filter(e => e.fossilized).length

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-[1.75rem] bg-slate-100 animate-pulse" />
        <div className="h-64 rounded-[1.75rem] bg-slate-100 animate-pulse" />
      </div>
    )
  }

  if (!errors.length) {
    return (
      <div className="rounded-[1.5rem] border-2 border-slate-200 bg-white p-8 text-center">
        <span className="material-symbols-outlined text-4xl text-slate-300">library_books</span>
        <h2 className="mt-3 font-headline text-xl text-slate-900">{t('knowledge.empty.title')}</h2>
        <p className="mt-2 text-sm text-slate-500">{t('knowledge.empty.body')}</p>
      </div>
    )
  }

  const firstName = data?.profile?.firstName || String(data?.profile?.name || '').split(' ')[0] || ''

  return (
    <section className="space-y-4" id="page-knowledge">
      {/* Hero */}
      <div className="rounded-[1.75rem] bg-gradient-to-br from-white via-rose-50/50 to-violet-50/60 border-2 border-white/70 editorial-shadow px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-label text-[11px] font-bold uppercase tracking-[0.24em] text-rose-700">{t('knowledge.kicker')}</p>
            <h1 className="mt-1.5 font-headline text-2xl sm:text-3xl text-slate-900">
              {firstName ? `${firstName} — ` : ''}{t('knowledge.heroTitle')}
            </h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl">
              {t('knowledge.heroBody')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="rounded-[1rem] bg-white border-2 border-slate-200 px-3 py-2 text-center min-w-[72px]">
              <p className="text-[9px] font-label font-bold uppercase tracking-[0.18em] text-slate-400">{t('knowledge.stat.patterns')}</p>
              <p className="mt-0.5 font-headline text-xl text-slate-900">{errors.length}</p>
            </div>
            <div className="rounded-[1rem] bg-gradient-to-br from-rose-50 to-red-50 border-2 border-rose-200 px-3 py-2 text-center min-w-[72px]">
              <p className="text-[9px] font-label font-bold uppercase tracking-[0.18em] text-slate-400">{t('knowledge.stat.fossilised')}</p>
              <p className="mt-0.5 font-headline text-xl text-rose-700">{fossilizedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-[1.5rem] bg-white border-2 border-slate-200 p-4 space-y-3">
        <input
          type="search"
          placeholder={t('knowledge.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`topic-tag ${activeCategory === 'all' ? 'is-active' : ''}`}
          >
            {t('knowledge.filter.all')}
          </button>
          {categories.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveCategory(c.key)}
              className={`topic-tag ${activeCategory === c.key ? 'is-active' : ''}`}
            >
              {c.labelKey ? t(c.labelKey) : c.label}
            </button>
          ))}
          <span className="ml-auto inline-flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showFossilizedOnly}
                onChange={(e) => setShowFossilizedOnly(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-rose-600"
              />
              <span className="text-[11px] font-label font-bold uppercase tracking-[0.14em] text-rose-700">{t('knowledge.fossilisedOnly')}</span>
            </label>
          </span>
        </div>
      </div>

      {/* Error list */}
      <div className="space-y-3">
        {filtered.map(e => {
          const meta = getCategoryMeta(e.category)
          const expanded = expandedId === e.id
          return (
            <article
              key={e.id}
              className={`rounded-[1.5rem] border-2 bg-white overflow-hidden transition-all ${
                e.fossilized ? 'border-rose-300' : 'border-slate-200'
              } hover:shadow-lg hover:-translate-y-0.5`}
            >
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : e.id)}
                className="w-full flex items-start gap-3 px-5 py-4 text-left cursor-pointer hover:bg-slate-50/60 transition"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-${meta.color}-50 border-2 border-${meta.color}-200`}>
                  <span className={`material-symbols-outlined text-${meta.color}-600`}>{meta.icon}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`rounded-full bg-${meta.color}-50 border border-${meta.color}-200 px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-${meta.color}-700`}>
                      {meta.labelKey ? t(meta.labelKey) : meta.label}
                    </span>
                    {e.level && (
                      <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-slate-600">
                        {e.level}
                      </span>
                    )}
                    {e.fossilized && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 border border-rose-300 px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-rose-700">
                        <span className="material-symbols-outlined text-[11px]">warning</span>
                        {t('knowledge.badge.fossilised')}
                      </span>
                    )}
                    {e.priority === 'high' && (
                      <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-amber-700">{t('knowledge.badge.highPriority')}</span>
                    )}
                  </div>
                  <h3 className="font-headline text-base sm:text-lg text-slate-900 leading-snug">{e.title}</h3>
                  {e.summary && !expanded && (
                    <p className="mt-1 text-sm text-slate-600 line-clamp-2">{e.summary}</p>
                  )}
                </div>
                <span className={`material-symbols-outlined text-slate-400 text-sm transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}>expand_more</span>
              </button>
              {expanded && (
                <div className="border-t-2 border-slate-100 px-5 py-5 bg-slate-50/30 space-y-4">
                  {e.summary && (
                    <div>
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-1">{t('knowledge.section.summary')}</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{e.summary}</p>
                    </div>
                  )}
                  {e.polishInterference && (
                    <div className="rounded-[1rem] border-2 border-violet-200 bg-violet-50/40 p-4">
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700 mb-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">translate</span>
                        {t('knowledge.section.polishInterference')}
                      </p>
                      <p className="text-sm text-slate-700 leading-relaxed">{e.polishInterference}</p>
                    </div>
                  )}
                  {e.ruleExplanation && (
                    <div className="rounded-[1rem] border-2 border-sky-200 bg-sky-50/40 p-4">
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700 mb-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">rule</span>
                        {t('knowledge.section.englishRule')}
                      </p>
                      <p className="text-sm text-slate-700 leading-relaxed">{e.ruleExplanation}</p>
                    </div>
                  )}
                  {e.examples.length > 0 && (
                    <div>
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">{t('knowledge.section.examples')}</p>
                      <div className="space-y-2">
                        {e.examples.map((raw, i) => {
                          const ex = getExampleText(raw)
                          return (
                            <div key={i} className="rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2">
                              <p className="font-mono text-xs text-rose-700 italic">"{ex.said}"</p>
                              <p className="mt-1 text-xs text-emerald-700"><span className="font-bold">→</span> "{ex.corrected}"</p>
                              {(ex.lessonDate || ex.context) && (
                                <p className="mt-1 text-[10px] text-slate-400">
                                  {ex.lessonDate}{ex.context ? ` · ${ex.context}` : ''}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {e.fixStrategies.length > 0 && (
                    <div className="rounded-[1rem] border-2 border-emerald-200 bg-emerald-50/40 p-4">
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 mb-2 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">rocket_launch</span>
                        {t('knowledge.section.howToFix')}
                      </p>
                      <ul className="space-y-1.5">
                        {e.fixStrategies.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
                            <span className="text-emerald-600 font-bold">✓</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {e.miniDrill && (
                    <div className="rounded-[1rem] border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 mb-2 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">fitness_center</span>
                        {t('knowledge.section.miniDrill')}
                      </p>
                      <p className="text-sm font-semibold text-slate-800 mb-3">{e.miniDrill.prompt}</p>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setActiveDrill({ error: e, drill: e.miniDrill })}
                          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.16em] text-white hover:from-amber-600 hover:to-orange-700 transition cursor-pointer shadow-md hover:shadow-lg hover:-translate-y-0.5"
                        >
                          <span className="material-symbols-outlined text-base">play_arrow</span>
                          {t('knowledge.button.quickDrill')}
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/app/${slug}/practice?errorId=${encodeURIComponent(e.id)}`)}
                          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-600 to-violet-700 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.16em] text-white hover:from-fuchsia-700 hover:to-violet-800 transition cursor-pointer shadow-md hover:shadow-lg hover:-translate-y-0.5"
                        >
                          <span className="material-symbols-outlined text-base">all_inclusive</span>
                          {t('knowledge.button.fullDrillSuite')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          )
        })}
        {filtered.length === 0 && (
          <div className="rounded-[1.5rem] border-2 border-slate-200 bg-white px-6 py-10 text-center">
            <span className="material-symbols-outlined text-3xl text-slate-300">search_off</span>
            <p className="mt-2 text-sm text-slate-500">{t('knowledge.noMatches')}</p>
          </div>
        )}
      </div>

      {/* In-place drill modal */}
      <Modal
        open={!!activeDrill}
        onClose={() => setActiveDrill(null)}
        title={activeDrill ? `${t('knowledge.modal.drillTitle')}: ${activeDrill.error.title}` : ''}
        widthClass="max-w-2xl"
      >
        {activeDrill && (
          <InPlaceDrill
            errorEntry={activeDrill.error}
            drill={activeDrill.drill}
            onClose={() => setActiveDrill(null)}
          />
        )}
      </Modal>
    </section>
  )
}

/* ============================================================================
   InPlaceDrill — single-question drill launched from a KB entry
   ============================================================================ */

function gradeAnswer(userRaw, drill) {
  const user = String(userRaw || '').trim().toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' ')
  if (!user) return false
  const primary = String(drill?.correctAnswer || '').trim().toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' ')
  const extras = Array.isArray(drill?.acceptedAnswers)
    ? drill.acceptedAnswers.map(a => String(a || '').trim().toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' '))
    : []
  const variants = new Set([primary, ...extras].filter(Boolean))
  if (variants.has(user)) return true
  for (const v of variants) {
    if (v && v.length > 4 && v.length === user.length) {
      let diffs = 0
      for (let i = 0; i < v.length; i++) if (v[i] !== user[i]) diffs++
      if (diffs <= 1) return true
    }
  }
  return false
}

function InPlaceDrill({ errorEntry, drill, onClose }) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect] = useState(false)

  function submit() {
    const isCorrect = gradeAnswer(value, drill)
    setCorrect(isCorrect)
    setSubmitted(true)
  }

  return (
    <div className="space-y-4">
      {errorEntry.polishInterference && (
        <div className="rounded-[1rem] border-2 border-violet-200 bg-violet-50/40 p-4 sm:p-5">
          <p className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700 mb-2">{t('knowledge.drill.context')}</p>
          <p className="text-[15px] text-slate-700 leading-relaxed">{errorEntry.polishInterference}</p>
        </div>
      )}
      <div className="rounded-[1.25rem] border-2 border-slate-200 bg-white p-5">
        <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-2">{t('knowledge.drill.yourTask')}</p>
        <p className="text-lg font-headline text-slate-900 leading-relaxed mb-4">{drill.prompt}</p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !submitted && submit()}
          disabled={submitted}
          placeholder={t('knowledge.drill.answerPlaceholder')}
          className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
          autoFocus
        />
        {!submitted ? (
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            className="mt-3 w-full rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 text-sm font-label font-bold uppercase tracking-[0.16em] text-white disabled:opacity-40 hover:from-sky-600 hover:to-blue-700 transition cursor-pointer"
          >
            {t('knowledge.drill.checkAnswer')}
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <div className={`rounded-[1rem] border-2 px-4 py-3 ${correct ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-xl ${correct ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {correct ? 'check_circle' : 'info'}
                </span>
                <p className={`font-label text-sm font-bold uppercase tracking-[0.14em] ${correct ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {correct ? t('knowledge.drill.correct') : `${t('knowledge.drill.correctAnswerLabel')}: ${drill.correctAnswer}`}
                </p>
              </div>
              {drill.explanation && <p className="mt-2 text-sm text-slate-700 leading-relaxed">{drill.explanation}</p>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setValue(''); setSubmitted(false); setCorrect(false) }}
                className="flex-1 rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:border-sky-300 transition cursor-pointer"
              >
                {t('knowledge.drill.tryAgain')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-white hover:from-sky-600 hover:to-blue-700 transition cursor-pointer"
              >
                {t('knowledge.drill.backToLibrary')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
