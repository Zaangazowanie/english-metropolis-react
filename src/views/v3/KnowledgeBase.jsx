import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FONT, G, EASE } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Btn, Glass, Pill, Skeleton } from '../../design/v3/primitives.jsx'
import { useI18n } from '../../i18n'
import { fetchJSONCached } from '../../practice/lib/practice-cache'

// Category registry — ported from the pre-v3 KnowledgeBase.jsx, swapping
// Tailwind colour tokens for v3 palette hexes so the per-card chromatics
// land in the deep-violet aesthetic. `labelKey` resolves the human label
// through i18n at render time so categories localise to PL.
const CATEGORY_META = {
  grammar:                 { labelKey: 'grammar',      icon: 'spellcheck',         color: '#8B5CF6' },
  'grammar-subordination': { labelKey: 'grammar',      icon: 'spellcheck',         color: '#8B5CF6' },
  'grammar-tense':         { labelKey: 'grammarTense', icon: 'schedule',           color: '#8B5CF6' },
  'grammar-article':       { labelKey: 'articles',     icon: 'short_text',         color: '#A855F7' },
  'grammar-modal':         { labelKey: 'modals',       icon: 'stream',             color: '#A855F7' },
  vocabulary:              { labelKey: 'vocabulary',   icon: 'book',               color: '#D946EF' },
  collocation:             { labelKey: 'collocations', icon: 'join',               color: '#C026D3' },
  pronunciation:           { labelKey: 'pronunciation',icon: 'record_voice_over',  color: '#F472B6' },
  register:                { labelKey: 'register',     icon: 'style',              color: '#34D399' },
  pragmatics:              { labelKey: 'pragmatics',   icon: 'chat',               color: '#10B981' },
  preposition:             { labelKey: 'prepositions', icon: 'compare_arrows',     color: '#60A5FA' },
  discourse:               { labelKey: 'discourse',    icon: 'forum',              color: '#FB7185' },
}

// Helper: resolve a category meta entry into the Polish/English label via i18n.
// Each labelKey corresponds to a `knowledge.cat.<labelKey>` dictionary entry.
function categoryLabel(t, meta) {
  return t(`knowledge.cat.${meta.labelKey}`)
}

function getCategoryMeta(cat) {
  if (!cat) return CATEGORY_META.grammar
  if (CATEGORY_META[cat]) return CATEGORY_META[cat]
  for (const [key, meta] of Object.entries(CATEGORY_META)) {
    if (cat.startsWith(key)) return meta
  }
  return CATEGORY_META.grammar
}

// Bilingual-aware normaliser. Reads (lang, englishLevel) from the i18n
// context and returns the right field per the toggle rules:
//   lang=pl → <key>PL fallback to <key>
//   lang=en + englishLevel=simple → <key>ENSimple fallback to <key>
//   lang=en + englishLevel=full → <key> as-is
// All raw fields stay on the entry too so future panels can still access
// the B2-quality original even when we render the simple variant.
function normalizeEntry(e, lang = 'en', englishLevel = 'full') {
  const pick = (baseKey, fallback = '') => {
    const plKey = `${baseKey}PL`
    const simpleKey = `${baseKey}ENSimple`
    if (lang === 'pl' && e[plKey]) return e[plKey]
    if (lang === 'en' && englishLevel === 'simple' && e[simpleKey]) return e[simpleKey]
    return e[baseKey] ?? fallback
  }
  const pickArray = (baseKey, fallback = []) => {
    const plKey = `${baseKey}PL`
    const simpleKey = `${baseKey}ENSimple`
    if (lang === 'pl' && Array.isArray(e[plKey])) return e[plKey]
    if (lang === 'en' && englishLevel === 'simple' && Array.isArray(e[simpleKey])) return e[simpleKey]
    return Array.isArray(e[baseKey]) ? e[baseKey] : fallback
  }
  return {
    id: e.id || '',
    title: pick('title', e.pattern || 'Untitled error pattern'),
    category: e.category || 'grammar',
    level: e.level || e.cefrLevel || '',
    fossilized: Boolean(e.fossilized),
    frequency: e.frequency || '',
    priority: e.priority || '',
    summary: pick('summary'),
    polishInterference:
      (lang === 'pl' && (e.whyPolishSpeakersMakeItPL || e.polishInterferencePL)) ||
      (lang === 'en' && englishLevel === 'simple' && (e.whyPolishSpeakersMakeItENSimple || e.polishInterferenceENSimple)) ||
      e.polishInterference || e.whyPolishSpeakersMakeIt || '',
    ruleExplanation: pick('ruleExplanation'),
    examples: e.examples || e.examplesFromLessons || [],
    fixStrategies:
      pickArray('fixStrategies', e.remediation ? [e.remediation] : []),
    miniDrill: pick('miniDrill', e.miniDrill || null),
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

function StatTile({ label, value, tone = 'brand' }) {
  const { T } = useV3Theme()
  const valueStyle = tone === 'rose'
    ? { color: T.rose }
    : { background: G.brand, WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent', backgroundClip: 'text' }
  return (
    <Glass padding={16} style={{ minWidth: 104, textAlign: 'center' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: T.textDim }}>{label}</div>
      <div style={{ fontFamily: FONT.display, fontSize: 30, fontWeight: 600,
        lineHeight: 1.05, letterSpacing: '-0.02em', marginTop: 4, ...valueStyle }}>
        {value}
      </div>
    </Glass>
  )
}

function CategoryChip({ active, accent, onClick, children }) {
  const { T } = useV3Theme()
  const [hov, setHov] = useState(false)
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
        fontFamily: FONT.body, fontSize: 11, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        background: active ? G.brand : (hov ? T.surfaceHi : T.surface),
        color: active ? '#fff' : T.textSoft,
        border: `1px solid ${active ? 'rgba(255,255,255,0.2)' : T.border}`,
        boxShadow: active ? '0 8px 24px -10px rgba(217,70,239,0.4)' : 'none',
        transition: `all 200ms ${EASE.springFast}`,
        ...(accent && active ? { background: `linear-gradient(135deg, ${accent}, ${accent}cc)` } : {}),
      }}>
      {children}
    </button>
  )
}

function PanelBox({ children, tone = 'panel', icon, label, style = {} }) {
  const { T, mode } = useV3Theme()
  const isDay = mode === 'day'
  const tones = {
    panel: {
      bg: isDay ? 'rgba(139,92,246,0.04)' : 'rgba(255,255,255,0.03)',
      border: T.border, accent: T.textDim,
    },
    violet: {
      bg: isDay ? '#F8F5FF' : 'rgba(139,92,246,0.08)',
      border: isDay ? '#E9D5FF' : 'rgba(139,92,246,0.30)',
      accent: T.violet,
    },
    sky: {
      bg: isDay ? '#EFF6FF' : 'rgba(96,165,250,0.08)',
      border: isDay ? '#BFDBFE' : 'rgba(96,165,250,0.30)',
      accent: T.sky,
    },
    emerald: {
      bg: isDay ? '#ECFDF5' : 'rgba(52,211,153,0.08)',
      border: isDay ? '#A7F3D0' : 'rgba(52,211,153,0.30)',
      accent: T.emerald,
    },
    amber: {
      bg: isDay ? '#FFFBEB' : 'rgba(252,211,77,0.08)',
      border: isDay ? '#FDE68A' : 'rgba(252,211,77,0.30)',
      accent: T.amber,
    },
  }
  const t = tones[tone] || tones.panel
  return (
    <div style={{ padding: 16, borderRadius: 14,
      background: t.bg, border: `1px solid ${t.border}`, ...style }}>
      {label && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: t.accent, fontFamily: FONT.body }}>
          {icon && <span className="material-symbols-outlined"
            style={{ fontSize: 14, color: t.accent }}>{icon}</span>}
          <span>{label}</span>
        </div>
      )}
      <div style={{ color: T.textSoft, fontSize: 14, lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

function EntryCard({ entry, expanded, onToggle, onQuickDrill, onFullDrill }) {
  const { T, mode } = useV3Theme()
  const { t } = useI18n()
  const isDay = mode === 'day'
  const [hov, setHov] = useState(false)
  const meta = getCategoryMeta(entry.category)
  const catLabel = categoryLabel(t, meta)
  const catTint = meta.color + (isDay ? '18' : '33')
  const catBorder = meta.color + (isDay ? '44' : '55')

  return (
    <article
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        background: isDay ? G.glassDay : (hov || expanded ? G.glassHi : G.glass),
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        border: `1px solid ${entry.fossilized
          ? 'rgba(251,113,133,0.45)'
          : (hov || expanded ? T.borderHi : T.border)}`,
        borderLeft: `3px solid ${entry.fossilized ? T.rose : meta.color}`,
        borderRadius: 18, overflow: 'hidden',
        transition: `all 240ms ${EASE.springFast}`,
        boxShadow: hov || expanded ? T.shadow : T.shadowSm,
      }}>
      <button type="button" onClick={onToggle}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 14,
          width: '100%', padding: '18px 20px', textAlign: 'left',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: T.text, fontFamily: FONT.body }}>
        <span style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 12,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: catTint, border: `1px solid ${catBorder}`,
          color: meta.color }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{meta.icon}</span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6,
            flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ padding: '3px 9px', borderRadius: 999,
              background: catTint, border: `1px solid ${catBorder}`,
              color: meta.color, fontSize: 10, fontWeight: 700,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              fontFamily: FONT.body }}>
              {catLabel}
            </span>
            {entry.level && <Pill size="sm" tone="neutral">{entry.level}</Pill>}
            {entry.fossilized && (
              <Pill size="sm" tone="rose" icon="warning">{t('knowledge.badge.fossilised')}</Pill>
            )}
            {entry.priority === 'high' && (
              <Pill size="sm" tone="amber" icon="flag">{t('knowledge.badge.highPriority')}</Pill>
            )}
          </div>
          <h3 style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 600,
            letterSpacing: '-0.01em', margin: 0, lineHeight: 1.3, color: T.text }}>
            {entry.title}
          </h3>
          {entry.summary && !expanded && (
            <p style={{ margin: '6px 0 0', fontSize: 13, color: T.textDim,
              lineHeight: 1.55,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden' }}>
              {entry.summary}
            </p>
          )}
        </div>
        <span className="material-symbols-outlined"
          style={{ flexShrink: 0, color: T.textDim, fontSize: 22,
            transform: expanded ? 'rotate(45deg)' : 'rotate(0deg)',
            transition: `transform 220ms ${EASE.springFast}` }}>
          add
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '4px 20px 22px', display: 'grid', gap: 14,
          borderTop: `1px solid ${T.borderSoft}`, marginTop: 2 }}>
          {entry.summary && (
            <PanelBox tone="panel" label={t('knowledge.section.summary')}>
              {entry.summary}
            </PanelBox>
          )}
          {entry.polishInterference && (
            <PanelBox tone="violet" icon="translate"
              label={t('knowledge.section.polishInterference')}>
              {entry.polishInterference}
            </PanelBox>
          )}
          {entry.ruleExplanation && (
            <PanelBox tone="sky" icon="rule" label={t('knowledge.section.englishRule')}>
              {entry.ruleExplanation}
            </PanelBox>
          )}
          {entry.examples.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
                textTransform: 'uppercase', color: T.textDim, fontFamily: FONT.body }}>
                <span className="material-symbols-outlined"
                  style={{ fontSize: 14 }}>history</span>
                {t('knowledge.section.examples')}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {entry.examples.map((raw, i) => {
                  const ex = getExampleText(raw)
                  return (
                    <div key={i} style={{ padding: 12, borderRadius: 12,
                      background: mode === 'day' ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${T.border}` }}>
                      <p style={{ margin: 0, fontFamily: FONT.mono, fontSize: 12,
                        color: T.rose, fontStyle: 'italic',
                        textDecoration: 'line-through',
                        textDecorationColor: T.rose + '80' }}>
                        "{ex.said}"
                      </p>
                      <p style={{ margin: '6px 0 0', fontFamily: FONT.mono, fontSize: 12,
                        color: T.emerald }}>
                        <span style={{ fontWeight: 700 }}>→</span> "{ex.corrected}"
                      </p>
                      {(ex.lessonDate || ex.context) && (
                        <p style={{ margin: '6px 0 0', fontSize: 10, color: T.textDim,
                          fontFamily: FONT.mono }}>
                          {ex.lessonDate}{ex.context ? ` · ${ex.context}` : ''}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {entry.fixStrategies.length > 0 && (
            <PanelBox tone="emerald" icon="rocket_launch" label={t('knowledge.section.howToFix')}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                {entry.fixStrategies.map((s, i) => (
                  <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start',
                    fontSize: 14, color: T.textSoft, lineHeight: 1.55 }}>
                    <span style={{ color: T.emerald, fontWeight: 700, flexShrink: 0 }}>✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </PanelBox>
          )}
          {entry.miniDrill && (
            <PanelBox tone="amber" icon="fitness_center" label={t('knowledge.section.miniDrill')}>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.text,
                marginBottom: 12, lineHeight: 1.5 }}>
                {entry.miniDrill.prompt}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="ember" icon="play_arrow"
                  onClick={onQuickDrill}>
                  {t('knowledge.button.quickDrill')}
                </Btn>
                <Btn size="sm" variant="primary" icon="all_inclusive"
                  onClick={onFullDrill}>
                  {t('knowledge.button.fullDrillSuite')}
                </Btn>
              </div>
            </PanelBox>
          )}
        </div>
      )}
    </article>
  )
}

function InPlaceDrillModal({ drill, entry, onClose }) {
  const { T, mode, isMobile } = useV3Theme()
  const { t } = useI18n()
  const isDay = mode === 'day'
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function submit() {
    const isCorrect = gradeAnswer(value, drill)
    setCorrect(isCorrect)
    setSubmitted(true)
  }

  function reset() {
    setValue(''); setSubmitted(false); setCorrect(false)
  }

  return (
    <div role="dialog" aria-modal="true"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? 16 : 32,
        background: isDay ? 'rgba(14,10,27,0.55)' : 'rgba(4,2,12,0.75)',
        backdropFilter: 'blur(12px) saturate(140%)',
        WebkitBackdropFilter: 'blur(12px) saturate(140%)' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 620, maxHeight: '88vh', overflow: 'auto',
          borderRadius: 22,
          background: isDay ? '#fff' : '#11092A',
          border: `1px solid ${T.borderHi}`,
          boxShadow: T.shadow,
          padding: isMobile ? 22 : 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.24em',
              textTransform: 'uppercase', color: T.brandInk || T.brand, marginBottom: 6 }}>
              {t('knowledge.modal.kicker')}
            </div>
            <h3 style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600,
              letterSpacing: '-0.02em', margin: 0, lineHeight: 1.25, color: T.text }}>
              {entry.title}
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')}
            style={{ width: 34, height: 34, borderRadius: 10,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: T.textDim, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {entry.polishInterference && (
          <div style={{ padding: 16, borderRadius: 14, marginBottom: 14,
            background: isDay ? '#F8F5FF' : 'rgba(139,92,246,0.08)',
            border: `1px solid ${isDay ? '#E9D5FF' : 'rgba(139,92,246,0.30)'}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: T.violet, marginBottom: 6 }}>
              {t('knowledge.modal.polishInterference')}
            </div>
            <div style={{ fontSize: 14, color: T.textSoft, lineHeight: 1.6 }}>
              {entry.polishInterference}
            </div>
          </div>
        )}

        <div style={{ padding: 20, borderRadius: 16,
          background: isDay ? '#FAF7FF' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: T.textDim, marginBottom: 10 }}>
            {t('knowledge.drill.yourTask')}
          </div>
          <p style={{ margin: 0, marginBottom: 14,
            fontFamily: FONT.display, fontSize: 18, fontWeight: 600,
            letterSpacing: '-0.01em', lineHeight: 1.4, color: T.text }}>
            {drill.prompt}
          </p>
          <input type="text" value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !submitted && submit()}
            disabled={submitted}
            placeholder={t('knowledge.drill.answerPlaceholder')}
            autoFocus
            style={{ width: '100%', padding: '12px 16px', borderRadius: 12,
              background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${T.borderHi}`, color: T.text,
              fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
              outline: 'none' }}/>
          {!submitted ? (
            <div style={{ marginTop: 14 }}>
              <Btn variant="primary" full icon="check_circle"
                onClick={submit} disabled={!value.trim()}>
                {t('knowledge.drill.checkAnswer')}
              </Btn>
            </div>
          ) : (
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <div style={{ padding: 14, borderRadius: 12,
                background: correct
                  ? (isDay ? '#ECFDF5' : 'rgba(52,211,153,0.10)')
                  : (isDay ? '#FEF2F2' : 'rgba(251,113,133,0.10)'),
                border: `1px solid ${correct
                  ? (isDay ? '#A7F3D0' : 'rgba(52,211,153,0.4)')
                  : (isDay ? '#FECACA' : 'rgba(251,113,133,0.4)')}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined"
                    style={{ fontSize: 20,
                      color: correct ? T.emerald : T.rose }}>
                    {correct ? 'check_circle' : 'cancel'}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: correct ? T.emerald : T.rose }}>
                    {correct
                      ? t('knowledge.drill.correct')
                      : t('knowledge.drill.correctAnswerWith', { answer: drill.correctAnswer })}
                  </span>
                </div>
                {drill.explanation && (
                  <p style={{ margin: '10px 0 0', fontSize: 14,
                    color: T.textSoft, lineHeight: 1.55 }}>
                    {drill.explanation}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="secondary" icon="refresh"
                  onClick={reset}>{correct ? t('knowledge.drill.tryAnother') : t('knowledge.drill.tryAgain')}</Btn>
                <Btn size="sm" variant="ghost" icon="arrow_back"
                  onClick={onClose}>{t('knowledge.drill.backToLibrary')}</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function KnowledgeBaseV3({ data, slug: slugProp, basePath = '/app' }) {
  const { T, isMobile } = useV3Theme()
  const { t, lang, englishLevel } = useI18n()
  const params = useParams()
  const navigate = useNavigate()
  const slug = slugProp || params.slug || data?.profile?.slug || 'szymon-karpinski'

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
    // 30s timeout + 5-min cache shared with practice/lib/kb-reader.fetchKB so
    // the same KB JSON isn't re-pulled across the KnowledgeBase view, the
    // practice picker, and the dashboard.
    const url = `/knowledge-base/${slug}.json`
    fetchJSONCached(url, { cacheKey: `kb::${url}` })
      .then(payload => { if (!cancelled) { setKb(payload); setLoading(false) } })
      .catch(() => { if (!cancelled) { setKb(null); setLoading(false) } })
    return () => { cancelled = true }
  }, [slug])

  const errors = useMemo(() => {
    if (!kb) return []
    const raw = Array.isArray(kb)
      ? kb
      : (kb.errors || kb.errorPatterns || kb.patterns || [])
    return raw.map(e => normalizeEntry(e, lang, englishLevel))
  }, [kb, lang, englishLevel])

  // Categories — keyed by labelKey (stable across languages) and resolved to
  // a localised label at render time so the chip strip flips PL/EN cleanly.
  const categories = useMemo(() => {
    const map = new Map()
    errors.forEach(e => {
      const meta = getCategoryMeta(e.category)
      if (!map.has(meta.labelKey)) {
        map.set(meta.labelKey, { key: meta.labelKey, label: categoryLabel(t, meta), accent: meta.color })
      }
    })
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [errors, t])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return errors.filter(e => {
      if (showFossilizedOnly && !e.fossilized) return false
      if (activeCategory !== 'all' && getCategoryMeta(e.category).labelKey !== activeCategory) return false
      if (q) {
        const hay = [e.title, e.summary, e.polishInterference, e.ruleExplanation, ...e.fixStrategies]
          .join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [errors, activeCategory, showFossilizedOnly, search])

  const fossilizedCount = errors.filter(e => e.fossilized).length
  const firstName = data?.profile?.firstName ||
    String(data?.profile?.name || '').split(' ')[0] || ''

  const container = { maxWidth: 1320, margin: '0 auto',
    padding: isMobile ? '24px 18px 80px' : '40px 32px 80px' }

  if (loading) {
    return (
      <div style={container}>
        <Skeleton h={140} style={{ marginBottom: 20 }}/>
        <Skeleton h={64} style={{ marginBottom: 14 }}/>
        <Skeleton h={120}/>
      </div>
    )
  }

  if (!errors.length) {
    return (
      <div style={container}>
        <Glass padding={28} style={{ textAlign: 'center' }}>
          <span className="material-symbols-outlined"
            style={{ fontSize: 40, color: T.textDim, marginBottom: 10 }}>
            library_books
          </span>
          <h2 style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600,
            letterSpacing: '-0.01em', margin: 0, color: T.text }}>
            {t('knowledge.empty.title')}
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: T.textDim,
            fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif" }}>
            {t('knowledge.empty.bodyShort')}
          </p>
        </Glass>
      </div>
    )
  }

  return (
    <div style={container}>
      {/* Hero */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.28em',
              textTransform: 'uppercase', color: T.brandInk || T.brand, marginBottom: 12,
              display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%',
                background: T.brand, boxShadow: `0 0 10px ${T.brand}` }}/>
              {firstName ? t('knowledge.kickerNamed', { name: firstName }) : t('knowledge.kicker')}
            </div>
            <h1 style={{ fontFamily: FONT.display, fontWeight: 600,
              fontSize: isMobile ? 38 : 56, lineHeight: 1.05,
              letterSpacing: '-0.03em', margin: 0, color: T.text }}>
              <span style={{ background: G.brand, WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {t('knowledge.heroTitleCount', { n: errors.length })}
              </span>
              ,{' '}
              <span style={{ fontStyle: 'italic', opacity: 0.6,
                fontFamily: "'Fraunces', Georgia, serif" }}>
                {t('knowledge.heroTitleAside')}
              </span>
            </h1>
            <p style={{ margin: '16px 0 0', fontSize: 15, color: T.textDim,
              lineHeight: 1.55, maxWidth: 680 }}>
              {t('knowledge.heroSubtitle')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <StatTile label={t('knowledge.stat.patterns')} value={errors.length}/>
            <StatTile label={t('knowledge.stat.fossilised')} value={fossilizedCount} tone="rose"/>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <Glass padding={18} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 14, background: T.surface,
          border: `1px solid ${T.border}`, borderRadius: 14,
          padding: '2px 14px' }}>
          <span className="material-symbols-outlined"
            style={{ fontSize: 18, color: T.textDim }}>search</span>
          <input type="search" value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('knowledge.searchPlaceholderShort')}
            style={{ flex: 1, padding: '12px 0', background: 'transparent',
              border: 'none', outline: 'none', color: T.text,
              fontFamily: FONT.body, fontSize: 14 }}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8,
          flexWrap: 'wrap' }}>
          <CategoryChip active={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}>{t('knowledge.filter.allShort')}</CategoryChip>
          {categories.map(c => (
            <CategoryChip key={c.key} active={activeCategory === c.key}
              accent={c.accent}
              onClick={() => setActiveCategory(c.key)}>{c.label}</CategoryChip>
          ))}
          <label style={{ marginLeft: 'auto', display: 'inline-flex',
            alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '6px 12px', borderRadius: 999,
            background: showFossilizedOnly
              ? 'rgba(251,113,133,0.15)' : T.surface,
            border: `1px solid ${showFossilizedOnly
              ? 'rgba(251,113,133,0.45)' : T.border}`,
            transition: `all 200ms ${EASE.springFast}` }}>
            <input type="checkbox" checked={showFossilizedOnly}
              onChange={(e) => setShowFossilizedOnly(e.target.checked)}
              style={{ accentColor: T.rose, cursor: 'pointer' }}/>
            <span style={{ fontSize: 11, fontWeight: 700,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: showFossilizedOnly ? T.rose : T.textSoft }}>
              {t('knowledge.fossilisedOnly')}
            </span>
          </label>
        </div>
      </Glass>

      {/* Entry list */}
      <div style={{ display: 'grid', gap: 14 }}>
        {filtered.map(entry => (
          <EntryCard key={entry.id || entry.title} entry={entry}
            expanded={expandedId === (entry.id || entry.title)}
            onToggle={() => setExpandedId(prev =>
              prev === (entry.id || entry.title) ? null : (entry.id || entry.title))}
            onQuickDrill={() => setActiveDrill({ entry, drill: entry.miniDrill })}
            onFullDrill={() => navigate(
              `${basePath}/${slug}/practice?errorId=${encodeURIComponent(entry.id)}`)}/>
        ))}
        {filtered.length === 0 && (
          <Glass padding={32} style={{ textAlign: 'center' }}>
            <span className="material-symbols-outlined"
              style={{ fontSize: 32, color: T.textDim, marginBottom: 8 }}>
              search_off
            </span>
            <p style={{ margin: 0, fontSize: 14, color: T.textDim }}>
              {t('knowledge.noMatchesShort')}
            </p>
          </Glass>
        )}
      </div>

      {activeDrill && activeDrill.drill && (
        <InPlaceDrillModal entry={activeDrill.entry} drill={activeDrill.drill}
          onClose={() => setActiveDrill(null)}/>
      )}
    </div>
  )
}
