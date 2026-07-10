// Practice (v3) — Practice / Quiz tab in v3 visual language.
// Preserves ALL functionality from legacy Quiz.jsx: 5 render branches
// (session / free-write / KB-drill / focus-picker / arena-home), fuzzy grader
// (UK/US/AU + Levenshtein ≤1 + acceptedAnswers), XP + streak + confetti,
// AI pronunciation launcher, free-write AI review, 9 question types, 10 tiers
// × 4 categories. Inline styles only; uses v3 Glass/Btn/Pill + tokens.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CAT_COLOR, CEFR_COLOR, EASE, FONT, G } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Btn, Glass, Pill, Skeleton } from '../../design/v3/primitives.jsx'
import { useI18n } from '../../i18n'
import { fetchJSONCached, fetchWithTimeout } from '../../practice/lib/practice-cache'

/* ============================================================================
   Static metadata — `labelKey` is resolved through i18n at render time so the
   four category strips and the nine question-type chips localise into PL.
   ============================================================================ */

const CATEGORY_META = {
  grammar:       { labelKey: 'quiz.cat.grammar',       icon: 'spellcheck' },
  vocabulary:    { labelKey: 'quiz.cat.vocabulary',    icon: 'book' },
  pronunciation: { labelKey: 'quiz.cat.pronunciation', icon: 'record_voice_over' },
  fluency:       { labelKey: 'quiz.cat.fluency',       icon: 'graphic_eq' },
}

const QUESTION_TYPE_META = {
  'multiple-choice':      { labelKey: 'quiz.qtype.multiple-choice',      icon: 'radio_button_checked' },
  'fill-blank':           { labelKey: 'quiz.qtype.fill-blank',           icon: 'edit' },
  'correction':           { labelKey: 'quiz.qtype.correction',           icon: 'edit_note' },
  'transformation':       { labelKey: 'quiz.qtype.transformation',       icon: 'swap_horiz' },
  'word-formation':       { labelKey: 'quiz.qtype.word-formation',       icon: 'text_fields' },
  'error-identification': { labelKey: 'quiz.qtype.error-identification', icon: 'search' },
  'sentence-combination': { labelKey: 'quiz.qtype.sentence-combination', icon: 'merge' },
  'gap-fill-contextual':  { labelKey: 'quiz.qtype.gap-fill-contextual',  icon: 'description' },
  'translation-prompt':   { labelKey: 'quiz.qtype.translation-prompt',   icon: 'translate' },
}

// Tier-name flavour keys are not localised — they're poetic English titles
// (Mike's choice). Treat them as branding/atmosphere; if/when we add full PL
// flavour names we'll route them through i18n then.
const TIER_NAMES = {
  1: 'Foundations', 2: 'Groundwork', 3: 'Patterns', 4: 'Flow',
  5: 'Balance',     6: 'Texture',    7: 'Depth',    8: 'Poise',
  9: 'Finesse',    10: 'The rooftop',
}

// Helpers to resolve label/meta lookups via i18n at the call site.
function catLabelOf(t, key) {
  const meta = CATEGORY_META[key] || CATEGORY_META.grammar
  return t(meta.labelKey)
}
function qtypeLabelOf(t, key) {
  const meta = QUESTION_TYPE_META[key]
  if (!meta) return String(key || '').replace(/-/g, ' ')
  return t(meta.labelKey)
}

/* ============================================================================
   Data fetchers — unchanged from Quiz.jsx
   ============================================================================ */

// Wrapped with fetchJSONCached: 30s AbortController-backed timeout + 5-min
// in-memory cache so re-renders / route flips don't re-pull the same static
// /practice-data/*.json files. Per-key cache strings include slug + tier +
// category so different drills don't collide.
async function fetchExercise(slug, tier, category, idx = 0) {
  const url = `/practice-data/${slug}/tier-${tier}/${category}.json`
  try {
    const data = await fetchJSONCached(url, { cacheKey: `practice::${url}` })
    return Array.isArray(data) ? (data[idx] || data[0]) : null
  } catch { return null }
}
async function fetchIndex(slug) {
  const url = `/practice-data/${slug}-index.json`
  try {
    return await fetchJSONCached(url, { cacheKey: `practice::${url}` })
  } catch { return null }
}
async function fetchKbDrill(slug, entryId) {
  if (!entryId) return null
  const url = `/practice-data/${slug}/kb-drills/${encodeURIComponent(entryId)}.json`
  try {
    return await fetchJSONCached(url, { cacheKey: `practice::${url}` })
  } catch { return null }
}

/* ============================================================================
   Focus-match curation — unchanged from Quiz.jsx
   ============================================================================ */

const STOP_WORDS = new Set(['the','and','with','from','this','that','your','have','been','will','when','what','which','were','their','there','then','than','also','such','very','more','most','some','them','they','these','those','into','onto','upon','about','over','under','after','before','while','between','during','against'])
function tokenize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w))
}
function scoreExerciseAgainstFocus(ex, focusTokens) {
  if (!focusTokens.length) return 0
  const hay = `${ex.title} ${ex.description || ''} ${ex.focusArea || ''} ${(ex.tags || []).join(' ')}`.toLowerCase()
  let s = 0
  for (const t of focusTokens) if (hay.includes(t)) s += 1
  return s
}
function curateFocusMatches({ exercises, focus, category }) {
  const tokens = tokenize(focus)
  const scored = exercises.map(ex => ({ ex, score: scoreExerciseAgainstFocus(ex, tokens) + (category && ex.category === category ? 0.5 : 0) }))
  const matches = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).map(s => s.ex)
  const needed = 8
  if (matches.length >= needed) return matches.slice(0, 12)
  const pool = exercises.filter(ex => !matches.includes(ex) && (!category || ex.category === category))
  const filler = [...pool].sort(() => Math.random() - 0.5).slice(0, needed - matches.length)
  const combined = [...matches, ...filler]
  if (combined.length < 5) {
    const more = exercises.filter(ex => !combined.includes(ex)).sort(() => Math.random() - 0.5).slice(0, 5 - combined.length)
    combined.push(...more)
  }
  return combined.slice(0, 12)
}

/* ============================================================================
   Fuzzy grader — copied verbatim (UK/US/AU + Levenshtein ≤1)
   ============================================================================ */

function gradeAnswer(userRaw, q) {
  const user = String(userRaw || '').trim().toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' ')
  if (!user) return false
  const primary = String(q?.correctAnswer || '').trim().toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' ')
  const extras = Array.isArray(q?.acceptedAnswers)
    ? q.acceptedAnswers.map(a => String(a || '').trim().toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' '))
    : []
  const variants = new Set([primary, ...extras].filter(Boolean))
  const pairs = [
    ['colour','color'],['favour','favor'],['behaviour','behavior'],['flavour','flavor'],
    ['honour','honor'],['humour','humor'],['labour','labor'],['neighbour','neighbor'],
    ['centre','center'],['theatre','theater'],['metre','meter'],['litre','liter'],
    ['realise','realize'],['organise','organize'],['analyse','analyze'],['recognise','recognize'],
    ['practise','practice'],['licence','license'],['defence','defense'],['offence','offense'],
    ['travelled','traveled'],['cancelled','canceled'],['modelled','modeled'],
    ['grey','gray'],['programme','program'],['cheque','check'],['tyre','tire'],['kerb','curb'],
  ]
  for (const v of [...variants]) for (const [uk, us] of pairs) {
    if (v.includes(uk)) variants.add(v.split(uk).join(us))
    if (v.includes(us)) variants.add(v.split(us).join(uk))
  }
  if (variants.has(user)) return true
  for (const v of variants) if (v && v.length > 4 && levenshtein(user, v) <= 1) return true
  return false
}
function levenshtein(a, b) {
  if (!a.length) return b.length
  if (!b.length) return a.length
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j])
  }
  return dp[a.length][b.length]
}

/* ============================================================================
   Free-write video helpers
   ============================================================================ */

function extractWatchHints(advice) {
  const lower = String(advice || '').toLowerCase()
  if (!/\b(watch|video|clip|listen|podcast|youtube|rumble|odysee|ted( talk)?|lecture|documentary|episode|tutorial)\b/.test(lower)) return null
  let q = String(advice || '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
  const m = q.match(/\b(?:on|about)\s+(.{3,120})/i)
  if (m) q = m[1]
  q = q.replace(/[.!?].*$/, '').replace(/\s+and focus.*$/i, '').replace(/\s+featuring.*$/i, '').trim()
  if (q.length > 110) { const cut = q.slice(0, 110); const ls = cut.lastIndexOf(' '); q = ls > 40 ? cut.slice(0, ls) : cut }
  return { query: q }
}
function parseVideoUrl(raw) {
  if (!raw) return null
  try {
    const url = new URL(raw.trim())
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = url.searchParams.get('v')
      if (v) return { src: `https://www.youtube-nocookie.com/embed/${v}`, source: 'YouTube' }
      const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)
      if (m) return { src: `https://www.youtube-nocookie.com/embed/${m[1]}`, source: 'YouTube' }
    }
    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\//, '')
      if (id) return { src: `https://www.youtube-nocookie.com/embed/${id}`, source: 'YouTube' }
    }
    if (host === 'rumble.com') {
      const m = url.pathname.match(/^\/embed\/([\w-]+)/)
      if (m) return { src: `https://rumble.com/embed/${m[1]}/`, source: 'Rumble' }
      return { src: null, source: 'Rumble', externalOnly: true, url: raw }
    }
    if (host === 'odysee.com') {
      if (url.pathname.startsWith('/$/embed/')) return { src: `https://odysee.com${url.pathname}`, source: 'Odysee' }
      return { src: `https://odysee.com/$/embed${url.pathname}`, source: 'Odysee' }
    }
  } catch (_) {}
  return null
}

/* ============================================================================
   v3 confetti
   ============================================================================ */

const CONFETTI_COLORS = ['#8B5CF6', '#D946EF', '#F472B6', '#FB923C', '#FCD34D', '#34D399']
function V3Confetti() {
  const pieces = useMemo(() => Array.from({ length: 44 }, (_, i) => {
    const a = (i / 44) * Math.PI * 2 + Math.random() * 0.3
    const d = 110 + Math.random() * 140
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 40, dr: (Math.random() - 0.5) * 840, color: CONFETTI_COLORS[i % 6], size: 8 + Math.random() * 8, delay: Math.random() * 90 }
  }), [])
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {pieces.map((p, i) => (
        <span key={i} style={{
          position: 'absolute', width: p.size, height: p.size, borderRadius: 2,
          background: p.color, boxShadow: `0 0 12px ${p.color}88`,
          animation: 'v3ConfettiBurst 1300ms cubic-bezier(0.2,0.8,0.2,1) forwards',
          animationDelay: `${p.delay}ms`,
          ['--v3cdx']: `${p.dx}px`, ['--v3cdy']: `${p.dy}px`, ['--v3cdr']: `${p.dr}deg`,
        }}/>
      ))}
      <style>{`@keyframes v3ConfettiBurst{0%{transform:translate(0,0) rotate(0) scale(.6);opacity:0}10%{opacity:1}100%{transform:translate(var(--v3cdx),var(--v3cdy)) rotate(var(--v3cdr)) scale(1);opacity:0}}@keyframes v3XpFloat{0%{transform:translateY(0) scale(.85);opacity:0}20%{opacity:1}100%{transform:translateY(-32px) scale(1.1);opacity:0}}@keyframes v3FlameBob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-2px) rotate(2deg)}}`}</style>
    </div>
  )
}

/* ============================================================================
   Shared style snippets
   ============================================================================ */

const EYEBROW = { fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase' }
const MONO_SM = { fontFamily: FONT.mono, fontSize: 11 }

function ActionChip({ href, bg, icon, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ padding: '8px 14px', borderRadius: 999, background: bg, color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>{children}
    </a>
  )
}

/* ============================================================================
   Sticky BackNav
   ============================================================================ */

function BackNav({ slug, basePath = '', label, onBack }) {
  const { T, mode } = useV3Theme()
  const { t } = useI18n()
  const navigate = useNavigate()
  const isDay = mode === 'day'
  const labelText = label || t('quiz.nav.back')
  const chip = {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px',
    fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
    fontFamily: FONT.body, textDecoration: 'none',
    background: T.surface, color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: 999,
  }
  const navChip = (to, icon, text) => (
    <Link to={to} style={chip}>
      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{icon}</span>{text}
    </Link>
  )
  return (
    <div style={{
      position: 'sticky', top: 8, zIndex: 30, margin: '0 auto 18px', maxWidth: 1840, padding: '10px 14px',
      background: isDay ? 'rgba(255,255,255,0.75)' : 'rgba(6,4,16,0.55)',
      backdropFilter: 'blur(14px) saturate(140%)', WebkitBackdropFilter: 'blur(14px) saturate(140%)',
      border: `1px solid ${T.border}`, borderRadius: 16,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <button type="button" onClick={onBack || (() => navigate(-1))} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
        fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        fontFamily: FONT.body, cursor: 'pointer',
        background: G.brand, color: '#fff', border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 999, boxShadow: '0 6px 20px -8px rgba(217,70,239,0.45)',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_back</span>
        {labelText}
      </button>
      <span style={{ width: 1, height: 18, background: T.border }}/>
      {navChip(`${basePath}/${slug}/dashboard`, 'dashboard', t('quiz.nav.dashboard'))}
      {navChip(`${basePath}/${slug}/lessons`, 'menu_book', t('quiz.nav.lessons'))}
      {navChip(`${basePath}/${slug}/vocabulary`, 'library_books', t('quiz.nav.vocab'))}
      {navChip(`${basePath}/${slug}/knowledge`, 'flag', t('quiz.nav.errors'))}
    </div>
  )
}

/* ============================================================================
   QuestionCard — all 9 question types
   ============================================================================ */

// Stable per-question shuffle. Aleksandra (and others) complained that the
// MCQ correct answer was always option A — the practice JSON happens to list
// the correct option first. We hash the question prompt + options to a deterministic
// seed so options re-render in the same order within a session, but reshuffle
// across sessions / questions.
function hashSeed(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function seededShuffle(arr, seed) {
  const a = arr.slice()
  let s = seed || 1
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function QuestionCard({ question, onAnswer, answered, userAnswer, correct, accent }) {
  const { T, mode } = useV3Theme()
  const { t } = useI18n()
  const isDay = mode === 'day'
  const [value, setValue] = useState('')
  const type = question.type || 'multiple-choice'
  const meta = QUESTION_TYPE_META[type] || QUESTION_TYPE_META['multiple-choice']
  const isText = type !== 'multiple-choice'
  const correctLower = String(question?.correctAnswer || '').toLowerCase().trim()
  const prompt = String(question?.prompt || '')
  const hasBlank = /_{2,}|\[\s*blank\s*\]|\[\s*___\s*\]/i.test(prompt)

  // Shuffle MCQ options on a stable seed derived from the question itself.
  // Re-renders within a session don't reshuffle; new questions get a new order.
  const shuffledOptions = useMemo(() => {
    if (type !== 'multiple-choice' || !Array.isArray(question.options)) return question.options
    const seed = hashSeed(String(question.id || '') + '|' + prompt + '|' + question.options.join('|'))
    return seededShuffle(question.options, seed)
  }, [question, type, prompt])

  function submit(val) { if (!answered) onAnswer(val) }

  return (
    <Glass padding={26}>
      <div style={{ ...EYEBROW, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14, color: accent.solid }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{meta.icon}</span>
        {qtypeLabelOf(t, type)}
      </div>
      <h2 style={{
        fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 500, fontStyle: 'italic',
        letterSpacing: '-0.015em', lineHeight: 1.3, margin: '0 0 22px', color: T.text,
      }}>
        {hasBlank
          ? prompt.split(/(_{2,}|\[\s*blank\s*\]|\[\s*___\s*\])/gi).map((chunk, i) => (
              /_{2,}|\[\s*blank\s*\]|\[\s*___\s*\]/i.test(chunk)
                ? <span key={i} style={{ display: 'inline-block', minWidth: 100, height: 4, margin: '0 6px 6px', borderRadius: 4, background: accent.grad }}/>
                : <span key={i}>{chunk}</span>
            ))
          : prompt}
      </h2>

      {type === 'multiple-choice' && Array.isArray(shuffledOptions) && (
        <div style={{ display: 'grid', gap: 10 }}>
          {shuffledOptions.map((opt, i) => {
            const isSelected = userAnswer === opt
            const isCorrect = answered && String(opt).toLowerCase() === correctLower
            const isWrong = answered && isSelected && !isCorrect
            let bg = isDay ? '#fff' : 'rgba(255,255,255,0.04)', border = T.border, color = T.text
            let badgeBg = isDay ? '#F3EEFE' : 'rgba(255,255,255,0.06)', badgeColor = T.textDim
            if (answered) {
              if (isCorrect)      { bg = isDay ? '#F0FDF4' : 'rgba(52,211,153,0.12)'; border = T.good; badgeBg = T.good; badgeColor = '#fff' }
              else if (isWrong)   { bg = isDay ? '#FEF2F2' : 'rgba(251,113,133,0.12)'; border = T.rose; badgeBg = T.rose; badgeColor = '#fff' }
              else                { bg = isDay ? '#FAFAFB' : 'rgba(255,255,255,0.02)'; color = T.textDim }
            }
            return (
              <button key={i} type="button" disabled={answered} onClick={() => submit(opt)}
                onMouseEnter={e => { if (!answered) e.currentTarget.style.borderColor = accent.solid }}
                onMouseLeave={e => { if (!answered) e.currentTarget.style.borderColor = T.border }}
                style={{
                  padding: '14px 18px', borderRadius: 14, background: bg, color,
                  border: `1.5px solid ${border}`, cursor: answered ? 'default' : 'pointer',
                  fontSize: 15, fontFamily: FONT.body, textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 14, transition: 'all 160ms',
                }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 8, background: badgeBg, color: badgeColor,
                  fontFamily: FONT.mono, fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{String.fromCharCode(65 + i)}</span>
                <span style={{ flex: 1 }}>{opt}</span>
                {answered && isCorrect && <span className="material-symbols-outlined" style={{ color: T.good }}>check_circle</span>}
                {answered && isWrong && <span className="material-symbols-outlined" style={{ color: T.rose }}>cancel</span>}
              </button>
            )
          })}
        </div>
      )}

      {isText && (
        <div>
          <input type="text"
            value={answered ? (userAnswer ?? '') : value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(value) }}
            disabled={answered} placeholder={t('quiz.question.placeholder')}
            style={{
              width: '100%', padding: '16px 4px', background: 'transparent', outline: 'none',
              border: 'none', borderBottom: `2px solid ${answered ? (correct ? T.good : T.rose) : T.border}`,
              color: T.text, fontSize: 18, fontFamily: "'Fraunces', serif", fontStyle: 'italic',
              transition: 'border-color 160ms',
            }}
            onFocus={e => { if (!answered) e.currentTarget.style.borderBottomColor = accent.solid }}
            onBlur={e => { if (!answered) e.currentTarget.style.borderBottomColor = T.border }}/>
          {!answered && (
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
              <Btn variant="primary" size="md" trailingIcon="arrow_forward"
                disabled={!value.trim()} onClick={() => submit(value)}>{t('quiz.question.submitAnswer')}</Btn>
            </div>
          )}
        </div>
      )}

      {answered && (
        <div style={{
          marginTop: 22, padding: 18, borderRadius: 14,
          background: correct ? (isDay ? '#F0FDF4' : 'rgba(52,211,153,0.08)')
                              : (isDay ? '#FEF2F2' : 'rgba(251,113,133,0.08)'),
          borderLeft: `4px solid ${correct ? T.good : T.rose}`,
          border: `1px solid ${correct ? (isDay ? '#BBF7D0' : 'rgba(52,211,153,0.25)')
                                        : (isDay ? '#FECACA' : 'rgba(251,113,133,0.25)')}`,
        }}>
          <div style={{ ...EYEBROW, color: correct ? T.good : T.rose, marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{correct ? 'check_circle' : 'info'}</span>
            {correct ? t('quiz.question.cleanSwing') : t('quiz.question.whiskerOff')}
          </div>
          {!correct && question.correctAnswer && (
            <div style={{ fontSize: 14, color: T.text, marginBottom: 8 }}>
              <span style={{ color: T.textDim, marginRight: 6 }}>{t('quiz.question.expected')}</span>
              <span style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontWeight: 500 }}>{question.correctAnswer}</span>
            </div>
          )}
          {question.explanation && (
            <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.55 }}>{question.explanation}</div>
          )}
        </div>
      )}
    </Glass>
  )
}

/* ============================================================================
   Session — header (XP + streak + close) / progress bar / QuestionCard / Next
   ============================================================================ */

function Session({ exercise, category, tier, onComplete, onExit }) {
  const { T, mode, isMobile } = useV3Theme()
  const { t } = useI18n()
  const isDay = mode === 'day'
  const accent = CAT_COLOR[category] || { solid: T.brand, grad: G.brand }
  const meta = CATEGORY_META[category] || CATEGORY_META.grammar
  const catLabel = catLabelOf(t, category)

  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [streak, setStreak] = useState(0)
  const [xp, setXp] = useState(0)
  const [xpPops, setXpPops] = useState([])
  const [showConfetti, setShowConfetti] = useState(false)
  const startedAt = useRef(Date.now())

  const questions = exercise?.questions || []
  const q = questions[idx]
  const userAnswer = answers[idx]?.value
  const answered = userAnswer !== undefined
  const correct = answered && gradeAnswer(userAnswer, q)

  function handleAnswer(val) {
    setAnswers(prev => ({ ...prev, [idx]: { value: val } }))
    if (gradeAnswer(val, q)) {
      const ns = streak + 1
      setStreak(ns)
      const earned = 10 + (ns >= 3 ? 5 : 0) + (ns >= 5 ? 10 : 0)
      setXp(x => x + earned)
      const pop = { id: Date.now() + Math.random(), value: earned }
      setXpPops(p => [...p, pop])
      setTimeout(() => setXpPops(p => p.filter(x => x.id !== pop.id)), 900)
      if (ns >= 3) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 1400) }
    } else {
      setStreak(0)
    }
  }

  function next() {
    if (idx < questions.length - 1) { setIdx(idx + 1); return }
    const correctCount = Object.entries(answers).filter(([k, v]) => gradeAnswer(v.value, questions[Number(k)])).length
    const score = Math.round((correctCount / questions.length) * 100)
    const elapsed = Math.round((Date.now() - startedAt.current) / 1000)
    onComplete({ correct: correctCount, total: questions.length, score, elapsed, xp, streak })
  }

  const progress = ((idx + (answered ? 1 : 0)) / questions.length) * 100

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: isMobile ? '0 4px' : 0, position: 'relative' }}>
      {showConfetti && <V3Confetti/>}

      <div style={{
        padding: isMobile ? '14px 16px' : '18px 22px', marginBottom: 6, borderRadius: 18,
        background: isDay ? 'rgba(255,255,255,0.85)' : 'rgba(11,7,28,0.65)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        border: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...EYEBROW, color: accent.solid, marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{meta.icon}</span>
            {TIER_NAMES[tier]
              ? t('quiz.session.tierLongNamed', { label: catLabel, tier, name: TIER_NAMES[tier] })
              : t('quiz.session.tierLong', { label: catLabel, tier })}
          </div>
          <div style={{ ...MONO_SM, color: T.textDim, fontSize: 12 }}>
            {t('quiz.session.questionOf', { idx: idx + 1, total: questions.length })}
          </div>
        </div>

        <div style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 999, background: G.brand, color: '#fff',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
          boxShadow: '0 6px 20px -8px rgba(217,70,239,0.45)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>stars</span>
          <span style={{ fontFamily: FONT.mono }}>{xp} XP</span>
          {xpPops.map(p => (
            <span key={p.id} style={{
              position: 'absolute', left: '50%', top: -6, transform: 'translateX(-50%)',
              color: '#FCD34D', fontWeight: 800, fontSize: 13, fontFamily: FONT.mono,
              textShadow: '0 0 10px #FCD34D', animation: 'v3XpFloat 900ms ease-out forwards',
              pointerEvents: 'none',
            }}>+{p.value}</span>
          ))}
        </div>

        {streak > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 999, background: G.ember, color: '#fff',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
            boxShadow: '0 6px 20px -8px rgba(251,146,60,0.45)',
          }}>
            <span className="material-symbols-outlined"
              style={{ fontSize: 14, animation: 'v3FlameBob 900ms ease-in-out infinite' }}>local_fire_department</span>
            <span style={{ fontFamily: FONT.mono }}>{streak}</span>
          </div>
        )}

        <button type="button" onClick={onExit} aria-label={t('common.close')} style={{
          width: 34, height: 34, borderRadius: 10, background: 'transparent',
          border: `1px solid ${T.border}`, color: T.textSoft, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div style={{ height: 4, background: T.borderSoft, overflow: 'hidden', borderRadius: 4, margin: '10px 2px 18px' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: accent.grad, transition: `width 520ms ${EASE.editorial}` }}/>
      </div>

      {q && (
        <div key={idx} style={{ animation: 'emFadeIn 280ms ease' }}>
          <QuestionCard question={q} onAnswer={handleAnswer} answered={answered}
            userAnswer={userAnswer} correct={correct} accent={accent}/>
        </div>
      )}

      {answered && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <Btn variant="primary" size="lg" trailingIcon="arrow_forward" onClick={next}>
            {idx < questions.length - 1 ? t('quiz.session.nextPrompt') : t('quiz.session.seeResults')}
          </Btn>
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   Session results screen
   ============================================================================ */

function SessionResults({ completed, category, onBackToArena, onTryAnother }) {
  const { T } = useV3Theme()
  const { t } = useI18n()
  const accent = CAT_COLOR[category] || { solid: T.brand, grad: G.brand }
  const ok = completed.score >= 70
  const scoreColor = completed.score >= 85 ? T.good : completed.score >= 70 ? T.amber : T.rose
  const mm = String(Math.floor((completed.elapsed || 0) / 60)).padStart(2, '0')
  const ss = String((completed.elapsed || 0) % 60).padStart(2, '0')

  return (
    <div style={{ maxWidth: 640, margin: '48px auto 0', textAlign: 'center', animation: 'emFadeIn 380ms ease' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 64, height: 64, borderRadius: 999, background: accent.grad, marginBottom: 18,
        boxShadow: `0 10px 30px -10px ${accent.solid}80`,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#fff' }}>
          {ok ? 'emoji_events' : 'refresh'}
        </span>
      </div>
      <div style={{ ...EYEBROW, color: accent.solid, letterSpacing: '0.28em', marginBottom: 12 }}>
        {t('quiz.complete.drillComplete')}
      </div>
      <div style={{
        fontFamily: "'Fraunces', serif", fontSize: 132, fontWeight: 500, lineHeight: 1,
        letterSpacing: '-0.04em', fontStyle: 'italic', marginBottom: 8,
        background: G.brand, WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent', backgroundClip: 'text',
      }}>
        {completed.score}<span style={{ fontSize: 42, opacity: 0.6 }}>%</span>
      </div>
      <div style={{
        fontFamily: FONT.display, fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em',
        color: scoreColor, marginBottom: 24,
      }}>
        {ok ? t('quiz.complete.promotion') : t('quiz.complete.rerun')}
      </div>

      <Glass padding={18} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 520, margin: '0 auto 28px' }}>
        {[
          [t('quiz.complete.statCorrect'), <span>{completed.correct} <span style={{ fontSize: 13, color: T.textDim, fontFamily: FONT.mono }}>/ {completed.total}</span></span>, FONT.display, 24],
          [t('quiz.complete.statBestStreak'), completed.streak || 0, FONT.display, 24],
          [t('quiz.complete.statTime'), `${mm}:${ss}`, FONT.mono, 22],
        ].map(([label, val, font, fs]) => (
          <div key={label}>
            <div style={{ ...EYEBROW, color: T.textDim, marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: font, fontSize: fs, fontWeight: 600, color: T.text }}>{val}</div>
          </div>
        ))}
      </Glass>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Btn variant="secondary" icon="arrow_back" onClick={onBackToArena}>{t('quiz.nav.backToArena')}</Btn>
        <Btn variant="primary" trailingIcon="refresh" onClick={onTryAnother}>{t('quiz.complete.tryAnotherShort')}</Btn>
      </div>
    </div>
  )
}

/* ============================================================================
   Launcher cards (pronunciation + free-write)
   ============================================================================ */

function PronunciationLauncher({ onClick, headline, body, ctaLabel }) {
  const { t } = useI18n()
  const [hov, setHov] = useState(false)
  const cta = ctaLabel || t('quiz.pron.ctaDefault')
  const headlineText = headline || t('quiz.pron.headlineDefault')
  const bodyText = body || t('quiz.pron.bodyDefault')
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', padding: 22, borderRadius: 20,
        background: G.ember, border: '1px solid rgba(255,255,255,0.18)', color: '#fff',
        position: 'relative', overflow: 'hidden',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hov ? '0 0 40px -6px rgba(251,146,60,0.55), 0 20px 50px -20px rgba(251,146,60,0.4)' : '0 10px 30px -12px rgba(251,146,60,0.4)',
        transition: `all 220ms ${EASE.springFast}`,
      }}>
      <div aria-hidden style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }}/>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px -6px rgba(0,0,0,0.3)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 30, color: '#fff' }}>mic</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ ...EYEBROW, opacity: 0.9, marginBottom: 4 }}>{t('quiz.pron.kickerNew')}</div>
          <div style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 6 }}>{headlineText}</div>
          <div style={{ fontSize: 13, opacity: 0.88, lineHeight: 1.5 }}>{bodyText}</div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.22)', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>record_voice_over</span>{cta}
        </div>
      </div>
    </button>
  )
}

function FreeWriteLauncher({ onClick }) {
  const { t } = useI18n()
  const [hov, setHov] = useState(false)
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', padding: 22, borderRadius: 20,
        background: 'linear-gradient(135deg, #FBEFFF 0%, #E9DCFF 55%, #C4B5FD 100%)',
        border: '1px solid rgba(139,92,246,0.35)', color: '#1D1530',
        position: 'relative', overflow: 'hidden',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hov ? '0 0 40px -6px rgba(139,92,246,0.5), 0 20px 50px -20px rgba(139,92,246,0.35)' : '0 10px 30px -12px rgba(139,92,246,0.35)',
        transition: `all 220ms ${EASE.springFast}`,
      }}>
      <div aria-hidden style={{ position: 'absolute', right: -30, bottom: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(139,92,246,0.18)' }}/>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: G.brand, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px -6px rgba(139,92,246,0.55)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 30, color: '#fff' }}>edit_note</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ ...EYEBROW, color: '#7C3AED', marginBottom: 4 }}>{t('quiz.free.kickerLauncher')}</div>
          <div style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 6 }}>{t('quiz.free.launcherHeadline')}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: '#2B2542' }}>{t('quiz.free.launcherBody')}</div>
        </div>
      </div>
    </button>
  )
}

/* ============================================================================
   Free-write drill screen
   ============================================================================ */

function FreeWriteDrill({ advice, slug }) {
  const { T, mode } = useV3Theme()
  const { t } = useI18n()
  const isDay = mode === 'day'
  const [attempt, setAttempt] = useState('')
  const [status, setStatus] = useState('idle')
  const [review, setReview] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoEmbed, setVideoEmbed] = useState(null)
  const [urlError, setUrlError] = useState('')
  const watchHints = useMemo(() => extractWatchHints(advice), [advice])

  function handleLoadVideo() {
    setUrlError('')
    const parsed = parseVideoUrl(videoUrl)
    if (!parsed) { setUrlError(t('quiz.free.urlErrorShort')); setVideoEmbed(null); return }
    if (parsed.externalOnly) { setUrlError(t('quiz.free.externalOnlyShort', { source: parsed.source })); setVideoEmbed({ ...parsed }); return }
    setVideoEmbed(parsed)
  }

  async function submit() {
    const text = attempt.trim()
    if (!text || status === 'grading') return
    setStatus('grading'); setReview('')
    try {
      const prompt = (
        `I've just done this practice task: "${advice}"\n\n` +
        `Here is my attempt:\n\n"${text}"\n\n` +
        `Please review it. Tell me what I got right, flag specific mistakes with their corrections, ` +
        `and give me one concrete tip to push this piece of writing from good to great. Be warm and specific.`
      )
      // 30s AbortController-backed timeout — see practice-cache.ts. Surfaces
      // as a normal error message rather than a hung "grading…" state.
      const r = await fetchWithTimeout('/api/conversa/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: slug, message: prompt, history: [],
          voice: (typeof localStorage !== 'undefined' && localStorage.getItem('tts_voice')) || 'af_heart',
        }),
      })
      const d = await r.json()
      setReview(d?.reply || t('quiz.free.aiUnavailableShort'))
    } catch (_) {
      setReview(t('quiz.free.networkErrorShort'))
    } finally { setStatus('reviewed') }
  }

  function reset() { setAttempt(''); setReview(''); setStatus('idle') }

  return (
    <section>
      <div style={{
        padding: 26, borderRadius: 22, marginBottom: 18, background: G.ember, color: '#fff',
        position: 'relative', overflow: 'hidden', boxShadow: '0 20px 50px -20px rgba(251,146,60,0.4)',
      }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.2,
          background: 'radial-gradient(circle at 20% 20%, white 0%, transparent 45%), radial-gradient(circle at 80% 80%, white 0%, transparent 45%)' }}/>
        <div style={{ position: 'relative' }}>
          <div style={{ ...EYEBROW, letterSpacing: '0.24em', opacity: 0.9, marginBottom: 8 }}>
            {t('quiz.free.kickerShort')}
          </div>
          <h1 style={{ fontFamily: FONT.display, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0 }}>
            {advice}
          </h1>
          <p style={{ marginTop: 10, fontSize: 14, opacity: 0.9, lineHeight: 1.55, maxWidth: 680 }}>
            {t('quiz.free.bodyShort')}
          </p>
        </div>
      </div>

      {watchHints && (
        <Glass padding={18} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12, background: G.rose,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}>
              <span className="material-symbols-outlined">play_circle</span>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ ...EYEBROW, color: T.rose, marginBottom: 2 }}>{t('quiz.free.needsWatch')}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                {t('quiz.free.findClipAbout', { query: watchHints.query })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <ActionChip href={`https://www.youtube.com/results?search_query=${encodeURIComponent(watchHints.query)}`} bg="#DC2626" icon="search">{t('quiz.free.searchYoutube')}</ActionChip>
            <ActionChip href={`https://rumble.com/search/all?q=${encodeURIComponent(watchHints.query)}`} bg="#047857" icon="search">{t('quiz.free.searchRumble')}</ActionChip>
            <ActionChip href={`https://odysee.com/$/search?q=${encodeURIComponent(watchHints.query)}`} bg="#6D28D9" icon="search">{t('quiz.free.searchOdysee')}</ActionChip>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="url" value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLoadVideo() }}
              placeholder={t('quiz.free.urlPlaceholderShort')}
              style={{
                flex: 1, minWidth: 240, padding: '10px 14px', borderRadius: 12,
                background: T.surface, border: `1px solid ${T.border}`,
                color: T.text, fontSize: 12, fontFamily: FONT.mono, outline: 'none',
              }}/>
            <Btn variant="ember" size="sm" onClick={handleLoadVideo}>{t('quiz.free.loadVideo')}</Btn>
          </div>
          {urlError && <div style={{ marginTop: 8, fontSize: 11, color: T.rose }}>{urlError}</div>}
          {videoEmbed?.src && (
            <div style={{ marginTop: 12, aspectRatio: '16 / 9', borderRadius: 14,
              overflow: 'hidden', background: '#000', border: `1px solid ${T.border}` }}>
              <iframe src={videoEmbed.src} style={{ width: '100%', height: '100%', border: 'none' }}
                title="Embedded clip"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen referrerPolicy="no-referrer-when-downgrade"/>
            </div>
          )}
          {videoEmbed?.externalOnly && videoEmbed.url && (
            <a href={videoEmbed.url} target="_blank" rel="noreferrer" style={{
              marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 999, background: T.text, color: isDay ? '#fff' : '#0E0A1B',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
              {t('quiz.free.openOn', { source: videoEmbed.source })}
            </a>
          )}
        </Glass>
      )}

      <Glass padding={22} style={{ marginBottom: 18 }}>
        <div style={{ ...EYEBROW, color: T.textDim, marginBottom: 10 }}>{t('quiz.free.attemptLabel')}</div>
        <textarea value={attempt} onChange={e => setAttempt(e.target.value)}
          placeholder={t('quiz.free.attemptPlaceholderShort')}
          disabled={status === 'grading'}
          style={{
            width: '100%', minHeight: 240, padding: 16, borderRadius: 14,
            background: T.surface, border: `1px solid ${T.border}`,
            color: T.text, fontSize: 15, lineHeight: 1.6,
            fontFamily: FONT.body, outline: 'none', resize: 'vertical',
          }}/>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ ...MONO_SM, color: T.textDim }}>
            {t('quiz.free.wordsCount', { n: attempt.trim().split(/\s+/).filter(Boolean).length })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {status === 'reviewed' && <Btn variant="secondary" size="sm" onClick={reset}>{t('quiz.free.tryAgain')}</Btn>}
            <Btn variant="ember" size="md"
              icon={status === 'grading' ? 'hourglass_top' : 'auto_awesome'}
              disabled={!attempt.trim() || status === 'grading'} onClick={submit}>
              {status === 'grading' ? t('quiz.free.gradingShort') : t('quiz.free.submitShort')}
            </Btn>
          </div>
        </div>
      </Glass>

      {status === 'reviewed' && review && (
        <Glass padding={22} style={{
          borderLeft: `4px solid ${T.good}`,
          background: isDay ? '#F0FDF4' : 'rgba(52,211,153,0.06)',
        }}>
          <div style={{ ...EYEBROW, color: T.good, marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>reviews</span>{t('quiz.free.aiReview')}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.65, color: T.text, whiteSpace: 'pre-wrap' }}>{review}</div>
        </Glass>
      )}
    </section>
  )
}

/* ============================================================================
   Focus picker — curated drills for a focus/error
   ============================================================================ */

function FocusPicker({ focus, category, matches, onPick, onLaunchPronunciation, onExit }) {
  const { T, isMobile } = useV3Theme()
  const { t } = useI18n()
  const byType = useMemo(() => {
    const groups = {}
    for (const ex of matches) {
      const key = ex.primaryQuestionType || ex.questionType || ex.category || 'mixed'
      if (!groups[key]) groups[key] = []
      groups[key].push(ex)
    }
    return groups
  }, [matches])
  const categoryMeta = category ? CATEGORY_META[category] : null
  const categoryLabel = categoryMeta ? t(categoryMeta.labelKey) : ''
  const title = focus
    ? t('quiz.focus.titleDive', { focus })
    : (categoryMeta ? t('quiz.focus.titleFocus', { label: categoryLabel }) : t('quiz.focus.titleDefault'))

  return (
    <section>
      <div style={{
        padding: 26, borderRadius: 22, marginBottom: 18, background: G.brand, color: '#fff',
        position: 'relative', overflow: 'hidden', boxShadow: '0 20px 50px -20px rgba(217,70,239,0.45)',
      }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.22,
          background: 'radial-gradient(circle at 20% 20%, white 0%, transparent 45%), radial-gradient(circle at 80% 80%, white 0%, transparent 45%)' }}/>
        <div style={{ position: 'relative' }}>
          <div style={{ ...EYEBROW, letterSpacing: '0.24em', opacity: 0.9, marginBottom: 8 }}>{t('quiz.focus.kickerTargeted')}</div>
          <h1 style={{ fontFamily: FONT.display, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0 }}>
            {title}
          </h1>
          <p style={{ marginTop: 10, fontSize: 14, opacity: 0.9, lineHeight: 1.55, maxWidth: 680 }}>
            {t('quiz.focus.subtitleAlt')}
          </p>
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Pill tone="solid">{t('quiz.focus.matched', { n: matches.length })}</Pill>
            <Pill tone="solid">{t('quiz.focus.typesCount', { n: Object.keys(byType).length })}</Pill>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <PronunciationLauncher
          headline={t('quiz.pron.focusHeadline')}
          body={t('quiz.pron.focusBody')}
          onClick={() => onLaunchPronunciation(focus || categoryLabel)}/>
      </div>

      {Object.entries(byType).map(([type, list]) => {
        const meta = QUESTION_TYPE_META[type] || { icon: 'fitness_center' }
        return (
          <Glass key={type} padding={20} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.brandInk || T.brand }}>{meta.icon}</span>
              <div style={{ ...EYEBROW, color: T.textSoft }}>{qtypeLabelOf(t, type)}</div>
              <Pill size="sm" tone="neutral">{list.length}</Pill>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
              {list.map((ex, i) => {
                const catMeta = CAT_COLOR[ex.category] || { solid: T.brand, grad: G.brand }
                const exCatLabel = catLabelOf(t, ex.category)
                return (
                  <button key={i} type="button" onClick={() => onPick(ex)}
                    onMouseEnter={e => e.currentTarget.style.borderColor = catMeta.solid + '88'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                    style={{
                      padding: 16, borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, transition: 'border-color 160ms',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 6 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                        padding: '3px 8px', borderRadius: 999, background: catMeta.grad, color: '#fff',
                      }}>{exCatLabel}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: T.textDim, fontFamily: FONT.mono }}>
                        {t('quiz.card.tierLong', { tier: ex.difficultyTier })}
                      </span>
                    </div>
                    <div style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: 600, lineHeight: 1.3, marginBottom: 4 }}>{ex.title}</div>
                    <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ex.description}</div>
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: T.textDim, fontFamily: FONT.mono }}>{t('quiz.card.qsShortAlt', { n: ex.questionCount || 10 })}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: catMeta.solid, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        {t('quiz.card.start')}<span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </Glass>
        )
      })}

      <button type="button" onClick={onExit} style={{
        width: '100%', padding: '14px 18px', borderRadius: 14,
        background: 'transparent', color: T.textDim, border: `1px dashed ${T.borderHi}`,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
        cursor: 'pointer', fontFamily: FONT.body,
      }}>
        {t('quiz.focus.browseAllShort')}
      </button>
    </section>
  )
}

/* ============================================================================
   KB drill picker — 9 drill types for one fossilised error entry
   ============================================================================ */

function KbDrillPicker({ drillData, onLaunchSet, onLaunchPronunciation, onExit }) {
  const { T, isMobile } = useV3Theme()
  const { t } = useI18n()
  const sets = drillData?.drillSets || []
  const totalQs = sets.reduce((n, s) => n + (s.questions?.length || 0), 0)

  return (
    <section>
      <div style={{
        padding: 26, borderRadius: 22, marginBottom: 18, background: G.brand, color: '#fff',
        position: 'relative', overflow: 'hidden', boxShadow: '0 20px 50px -20px rgba(217,70,239,0.45)',
      }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.22,
          background: 'radial-gradient(circle at 30% 20%, white 0%, transparent 45%), radial-gradient(circle at 70% 80%, white 0%, transparent 45%)' }}/>
        <div style={{ position: 'relative' }}>
          <div style={{ ...EYEBROW, letterSpacing: '0.24em', opacity: 0.9, marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>flag</span>
            {t('quiz.kb.kickerSuite')}
            {drillData?.fossilized && (
              <span style={{ marginLeft: 6, padding: '3px 8px', borderRadius: 999,
                background: '#FBBF24', color: '#78350F', fontSize: 9, letterSpacing: '0.16em', fontWeight: 700 }}>{t('quiz.kb.fossilised')}</span>
            )}
          </div>
          <h1 style={{ fontFamily: FONT.display, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0 }}>
            {drillData?.entryTitle || t('quiz.kb.drillTheError')}
          </h1>
          {drillData?.polishInterferenceNote && (
            <p style={{ marginTop: 10, fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 15, opacity: 0.9, lineHeight: 1.55, maxWidth: 680 }}>
              "{drillData.polishInterferenceNote}"
            </p>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Pill tone="solid">{t('quiz.kb.drillTypes', { n: sets.length })}</Pill>
            <Pill tone="solid">{t('quiz.kb.questions', { n: totalQs })}</Pill>
            {drillData?.category && <Pill tone="solid">{drillData.category}</Pill>}
            {drillData?.cefrLevel && <Pill tone="solid">{drillData.cefrLevel}</Pill>}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <PronunciationLauncher
          headline={t('quiz.pron.kbPatternHeadline')}
          body={t('quiz.pron.kbPatternBody')}
          onClick={() => onLaunchPronunciation(drillData?.entryTitle || '')}/>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        {sets.map((s, i) => {
          const meta = QUESTION_TYPE_META[s.type] || { icon: 'fitness_center' }
          const n = s.questions?.length || 0
          return (
            <button key={i} type="button" disabled={!n} onClick={() => onLaunchSet(s)}
              onMouseEnter={e => { if (n) e.currentTarget.style.borderColor = T.brandInk || T.brand }}
              onMouseLeave={e => { if (n) e.currentTarget.style.borderColor = T.border }}
              style={{
                padding: 16, borderRadius: 16, textAlign: 'left',
                background: T.surface, border: `1px solid ${T.border}`, color: T.text,
                cursor: n ? 'pointer' : 'not-allowed', opacity: n ? 1 : 0.4, transition: 'all 160ms',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{
                  width: 40, height: 40, borderRadius: 12, background: G.brand, color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined">{meta.icon}</span>
                </span>
                <Pill size="sm" tone="neutral">{t('quiz.card.qsShortAlt', { n })}</Pill>
              </div>
              <div style={{ fontFamily: FONT.display, fontSize: 14, fontWeight: 600, lineHeight: 1.3, marginBottom: 6 }}>{qtypeLabelOf(t, s.type)}</div>
              <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.45, marginBottom: 12 }}>
                {n > 0 ? t('quiz.card.targetedQs', { n }) : t('quiz.card.noQsYet')}
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: T.brandInk || T.brand, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {t('quiz.kb.startDrill')}<span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
              </span>
            </button>
          )
        })}
      </div>

      <button type="button" onClick={onExit} style={{
        width: '100%', padding: '14px 18px', borderRadius: 14,
        background: 'transparent', color: T.textDim, border: `1px dashed ${T.borderHi}`,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
        cursor: 'pointer', fontFamily: FONT.body,
      }}>
        {t('quiz.focus.browseAllShort')}
      </button>
    </section>
  )
}

/* ============================================================================
   Arena tiles
   ============================================================================ */

function ArenaStatTile({ icon, label, value, highlight = false }) {
  const { T } = useV3Theme()
  return (
    <Glass padding={18}>
      <div style={{ ...EYEBROW, color: T.textDim, marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>{label}
      </div>
      <div style={{
        fontFamily: FONT.display, fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1,
        color: T.text,
        ...(highlight ? {
          background: G.brand, WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        } : {}),
      }}>
        {value}
      </div>
    </Glass>
  )
}

function CatButton({ cat, meta, active, count, onClick }) {
  const { T, mode } = useV3Theme()
  const { t } = useI18n()
  const isDay = mode === 'day'
  const accent = CAT_COLOR[cat] || { solid: T.brand, grad: G.brand }
  return (
    <button type="button" onClick={onClick} style={{
      padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
      background: active ? accent.grad : (isDay ? '#fff' : 'rgba(255,255,255,0.04)'),
      color: active ? '#fff' : T.textSoft,
      border: `1px solid ${active ? 'transparent' : T.border}`,
      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
      transition: 'all 180ms',
      boxShadow: active ? `0 10px 24px -10px ${accent.solid}80` : 'none',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{meta.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{t(meta.labelKey)}</div>
        <div style={{ fontSize: 11, opacity: active ? 0.85 : 0.55, marginTop: 2 }}>{t('quiz.card.drillCount', { n: count })}</div>
      </div>
    </button>
  )
}

function TierCard({ tier, name, count, questionCount, cefr, best, accent, onStart }) {
  const { T, mode } = useV3Theme()
  const { t } = useI18n()
  const isDay = mode === 'day'
  const [hov, setHov] = useState(false)
  const hasBest = best != null && best > 0
  const bestColor = hasBest ? (best >= 85 ? T.good : best >= 70 ? T.amber : T.rose) : T.textDim
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onStart}
      style={{
        position: 'relative', overflow: 'hidden', padding: 18, borderRadius: 16, cursor: 'pointer',
        background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hov ? accent.solid + '66' : T.border}`,
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov ? T.shadow : T.shadowSm, transition: `all 220ms ${EASE.springFast}`,
      }}>
      <div aria-hidden style={{
        position: 'absolute', top: -6, right: -4, fontFamily: "'Fraunces', serif", fontStyle: 'italic',
        fontWeight: 700, fontSize: 76, lineHeight: 0.85, color: accent.solid,
        opacity: 0.1, letterSpacing: '-0.04em', pointerEvents: 'none',
      }}>{String(tier).padStart(2, '0')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', fontFamily: FONT.mono, color: accent.solid }}>
          {t('quiz.card.tierLong', { tier: String(tier).padStart(2, '0') })}
        </div>
        {cefr && <span style={{
          marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
          background: (CEFR_COLOR[cefr] || T.brand) + '22', color: CEFR_COLOR[cefr] || T.textSoft,
          letterSpacing: '0.16em',
        }}>{cefr}</span>}
      </div>
      <div style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 10, color: T.text, position: 'relative' }}>{name}</div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: T.textDim, fontFamily: FONT.mono, marginBottom: 14, position: 'relative' }}>
        <span>{t('quiz.card.qsShortAlt', { n: questionCount || 10 })}</span><span>·</span>
        <span>{t('quiz.card.tierMinutes', { n: Math.max(4, Math.round((questionCount || 10) * 0.7)) })}</span>
        {count > 1 && <><span>·</span><span>{t('quiz.card.drillCount', { n: count })}</span></>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: `1px solid ${T.borderSoft}`, position: 'relative' }}>
        {hasBest
          ? <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.textDim }}>{t('quiz.card.bestLabel')}</span>
              <span style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: 600, color: bestColor, letterSpacing: '-0.02em' }}>{best}</span>
            </div>
          : <span style={{ fontSize: 11, color: T.textDim, fontStyle: 'italic' }}>{t('quiz.card.notAttempted')}</span>}
        <span className="material-symbols-outlined"
          style={{ fontSize: 18, color: accent.solid, transform: hov ? 'translateX(3px)' : 'none', transition: 'transform 180ms' }}>
          play_arrow
        </span>
      </div>
    </div>
  )
}

/* ============================================================================
   Main view
   ============================================================================ */

function useStudentSlug() {
  const params = useParams()
  return params.slug || 'szymon-karpinski'
}

export default function PracticeV3({ data, basePath = '', legacyBanner = false }) {
  const { T, isMobile } = useV3Theme()
  const { t } = useI18n()
  const slug = useStudentSlug()
  const [searchParams, setSearchParams] = useSearchParams()
  const [index, setIndex] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState(searchParams.get('category') || 'grammar')
  const [session, setSession] = useState(null)
  const [completed, setCompleted] = useState(null)
  const [kbDrillData, setKbDrillData] = useState(null)
  const [kbDrillLoading, setKbDrillLoading] = useState(false)

  const focusParam = searchParams.get('focus') || searchParams.get('error') || ''
  const categoryParam = searchParams.get('category') || ''
  const errorIdParam = searchParams.get('errorId') || ''
  const adviceParam = searchParams.get('advice') || ''
  const inFocusMode = !!(focusParam || (categoryParam && searchParams.get('error')))
  const inFreeWriteMode = !!adviceParam
  const inKbDrillMode = !!errorIdParam

  useEffect(() => {
    fetchIndex(slug).then(idx => { setIndex(idx); setLoading(false) })
  }, [slug])

  useEffect(() => {
    if (!errorIdParam) { setKbDrillData(null); return }
    setKbDrillLoading(true)
    fetchKbDrill(slug, errorIdParam).then(d => { setKbDrillData(d); setKbDrillLoading(false) })
  }, [slug, errorIdParam])

  function launchKbDrillSet(set) {
    const label = qtypeLabelOf(t, set.type) || set.label || set.type
    const exercise = {
      title: `${kbDrillData?.entryTitle || t('quiz.kb.drillTitleFallback')} — ${label}`,
      description: kbDrillData?.polishInterferenceNote || '',
      questions: (set.questions || []).map(q => ({ ...q, type: set.type })),
    }
    const raw = String(kbDrillData?.category || 'grammar').toLowerCase()
    const coarse =
      raw.includes('pronunc') || raw.includes('phono') ? 'pronunciation' :
      raw.includes('vocab') || raw.includes('lexi') || raw.includes('collocation') ? 'vocabulary' :
      raw.includes('fluenc') || raw.includes('coherenc') || raw.includes('discourse') || raw.includes('hesitat') ? 'fluency' :
      'grammar'
    setSession({ exercise, category: coarse, tier: kbDrillData?.cefrLevel || 'C1' })
    setCompleted(null)
  }

  function exitFocusMode() { setSearchParams({}) }

  function launchPronunciation(target) {
    window.dispatchEvent(new CustomEvent('em-ai:pronunciation-drill', {
      detail: { target: String(target || ''), slug, source: 'practice-arena' },
    }))
    if (window.__EM_AI_OPEN) {
      try { window.__EM_AI_OPEN({ mode: 'pronunciation', target }) } catch (_) {}
    }
  }

  const focusMatches = useMemo(() => {
    if (!inFocusMode || !index?.exercises) return []
    return curateFocusMatches({ exercises: index.exercises, focus: focusParam, category: categoryParam })
  }, [inFocusMode, index, focusParam, categoryParam])

  const studentName = data?.profile?.firstName || t('quiz.arena.studentFallback')

  const exercisesByCategory = useMemo(() => {
    if (!index?.exercises) return {}
    const out = { grammar: [], vocabulary: [], pronunciation: [], fluency: [] }
    for (const ex of index.exercises) if (out[ex.category]) out[ex.category].push(ex)
    return out
  }, [index])

  const currentExercises = exercisesByCategory[activeCategory] || []

  async function launchSession(exercise) {
    const ex = await fetchExercise(slug, exercise.difficultyTier, exercise.category, currentExercises.indexOf(exercise))
    if (ex) {
      setSession({ exercise: ex, category: exercise.category, tier: exercise.difficultyTier })
      setCompleted(null)
    }
  }

  const containerStyle = {
    maxWidth: 1840, margin: '0 auto',
    padding: isMobile ? '24px 18px 80px' : '40px 32px 80px',
  }

  // Legacy banner — Mike's directive: keep the old Practice working at
  // /practice-legacy with a notice pointing students at the new UI.
  const LegacyBanner = legacyBanner ? (
    <div style={{
      margin: '0 0 16px', padding: '10px 14px', borderRadius: 12,
      background: 'rgba(252,211,77,0.10)', border: '1px solid rgba(252,211,77,0.35)',
      color: T.text, fontSize: 13, lineHeight: 1.5,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.amber }}>info</span>
      <span style={{ flex: 1 }}>
        This is the old Practice — try the new one at <Link to={`${basePath}/${slug}/practice`} style={{ color: T.brandInk || T.brand, fontWeight: 700 }}>/practice</Link>.
      </span>
    </div>
  ) : null

  /* Loading */
  if (loading) return (
    <div style={containerStyle}>
      {LegacyBanner}
      <Skeleton h={120} style={{ marginBottom: 24 }}/>
      <Skeleton h={90} style={{ marginBottom: 16 }}/>
      <Skeleton h={260}/>
    </div>
  )

  /* Session live */
  if (session && !completed) return (
    <div style={containerStyle}>
      {LegacyBanner}
      <BackNav slug={slug} basePath={basePath}
        label={inFocusMode ? t('quiz.nav.backToDrillList') : t('quiz.nav.backToArena')}
        onBack={() => setSession(null)}/>
      <Session exercise={session.exercise} category={session.category} tier={session.tier}
        onComplete={(r) => setCompleted(r)} onExit={() => setSession(null)}/>
    </div>
  )

  /* Free-write */
  if (inFreeWriteMode) return (
    <div style={containerStyle}>
      {LegacyBanner}
      <BackNav slug={slug} basePath={basePath} label="Back to lesson" onBack={exitFocusMode}/>
      <FreeWriteDrill advice={adviceParam} slug={slug}/>
    </div>
  )

  /* KB drill */
  if (inKbDrillMode) {
    if (kbDrillLoading) return (
      <div style={containerStyle}>
        {LegacyBanner}
        <BackNav slug={slug} basePath={basePath} label={t('quiz.nav.back')} onBack={exitFocusMode}/>
        <Skeleton h={140} style={{ marginBottom: 16 }}/>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12 }}>
          {[0,1,2,3,4,5].map(i => <Skeleton key={i} h={160}/>)}
        </div>
      </div>
    )
    if (!kbDrillData) return (
      <div style={containerStyle}>
        {LegacyBanner}
        <BackNav slug={slug} basePath={basePath} label={t('quiz.nav.back')} onBack={exitFocusMode}/>
        <Glass padding={28} style={{ textAlign: 'center' }}>
          <div style={{ ...EYEBROW, color: T.amber, marginBottom: 8 }}>{t('quiz.kb.notReadyShort')}</div>
          <div style={{ fontSize: 14, color: T.textSoft, marginBottom: 16 }}>
            {t('quiz.kb.notReadyShortBody')}
          </div>
          <Btn variant="primary" onClick={exitFocusMode}>{t('quiz.kb.goToArenaShort')}</Btn>
        </Glass>
      </div>
    )
    return (
      <div style={containerStyle}>
        {LegacyBanner}
        <BackNav slug={slug} basePath={basePath} label={t('quiz.nav.backToLesson')} onBack={exitFocusMode}/>
        <KbDrillPicker drillData={kbDrillData} onLaunchSet={launchKbDrillSet}
          onLaunchPronunciation={launchPronunciation} onExit={exitFocusMode}/>
      </div>
    )
  }

  /* Focus mode */
  if (inFocusMode && index) return (
    <div style={containerStyle}>
      {LegacyBanner}
      <BackNav slug={slug} basePath={basePath} label={t('quiz.nav.backToLesson')} onBack={exitFocusMode}/>
      <FocusPicker focus={focusParam} category={categoryParam} matches={focusMatches}
        onPick={launchSession} onLaunchPronunciation={launchPronunciation} onExit={exitFocusMode}/>
    </div>
  )

  /* Completed */
  if (completed && session) return (
    <div style={containerStyle}>
      {LegacyBanner}
      <BackNav slug={slug} basePath={basePath} label={t('quiz.nav.backToArena')}
        onBack={() => { setSession(null); setCompleted(null) }}/>
      <SessionResults completed={completed} category={session.category}
        onBackToArena={() => { setSession(null); setCompleted(null) }}
        onTryAnother={() => {
          const first = currentExercises[0]
          if (first) launchSession(first); else { setSession(null); setCompleted(null) }
        }}/>
    </div>
  )

  /* Arena home */
  const totalDrills = index?.totalExercises ?? (index?.exercises?.length ?? 0)
  const totalQs = index?.totalQuestions ?? 0
  const cefrRunning = index?.cefrLevel || data?.profile?.level || '—'

  return (
    <div style={containerStyle}>
      {LegacyBanner}
      <BackNav slug={slug} basePath={basePath} label={t('quiz.nav.back')}/>

      {/* Hero */}
      <div style={{ marginBottom: isMobile ? 28 : 36 }}>
        <div style={{ ...EYEBROW, letterSpacing: '0.28em', color: T.brandInk || T.brand, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.brand, boxShadow: `0 0 10px ${T.brand}` }}/>
          {t('quiz.arena.kickerTrainingRoom')}
        </div>
        <h1 style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: isMobile ? 36 : 56, lineHeight: 1.05, letterSpacing: '-0.03em', margin: 0, color: T.text }}>
          {/* Localised version: "Trenuj, <name>." in PL or "Drill, <name>." in EN.
              Split on the {name} placeholder so we can render the gradient span
              without losing the placeholder substitution. */}
          {(() => {
            const phrase = t('quiz.arena.titleDrill', { name: '' })
            const [pre, post] = phrase.split('')
            return (
              <>
                {pre}
                <span style={{ background: G.brand, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{studentName}</span>
                {post}
              </>
            )
          })()}{' '}
          <span style={{ fontStyle: 'italic', opacity: 0.55 }}>{t('quiz.arena.titleAside')}</span>
        </h1>
        <p style={{ marginTop: 18, fontSize: 16, color: T.textDim, lineHeight: 1.55, maxWidth: 720 }}>
          {t('quiz.arena.subtitleShort')}
        </p>
      </div>

      {/* 3 stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        <ArenaStatTile icon="check_circle" label={t('quiz.arena.statDrillsCompleted')} value={totalDrills} highlight/>
        <ArenaStatTile icon="help" label={t('quiz.arena.statQuestions')} value={totalQs}/>
        <ArenaStatTile icon="military_tech" label={t('quiz.arena.statCurrentCefr')} value={cefrRunning}/>
      </div>

      {/* Launchers */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 28 }}>
        <PronunciationLauncher
          onClick={() => launchPronunciation(catLabelOf(t, activeCategory))}/>
        <FreeWriteLauncher onClick={() => setSearchParams({
          advice: searchParams.get('advice') || t('quiz.arena.freeWriteDefaultAdvice'),
        })}/>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        {Object.entries(CATEGORY_META).map(([key, meta]) => (
          <CatButton key={key} cat={key} meta={meta} active={activeCategory === key}
            count={exercisesByCategory[key]?.length || 0} onClick={() => setActiveCategory(key)}/>
        ))}
      </div>

      {/* Tier grid */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ ...EYEBROW, letterSpacing: '0.24em', color: T.textDim, marginBottom: 4 }}>
              {t('quiz.arena.tierHeaderShort', { label: catLabelOf(t, activeCategory) })}
            </div>
            <h2 style={{ fontFamily: FONT.display, fontSize: isMobile ? 22 : 28, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
              {t('quiz.arena.tierHeading')}
            </h2>
          </div>
          <Pill tone="neutral" size="sm">{t('quiz.arena.totalDrills', { n: currentExercises.length })}</Pill>
        </div>

        {currentExercises.length === 0 ? (
          <Glass padding={28} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: T.textDim, lineHeight: 1.55 }}>
              {t('quiz.arena.emptyTrack')}
            </div>
          </Glass>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
          }}>
            {[1,2,3,4,5,6,7,8,9,10].map(tier => {
              const tierExercises = currentExercises.filter(ex => ex.difficultyTier === tier)
              if (!tierExercises.length) return null
              const first = tierExercises[0]
              const accent = CAT_COLOR[activeCategory] || { solid: T.brand, grad: G.brand }
              return (
                <TierCard key={tier} tier={tier}
                  name={first.title || TIER_NAMES[tier] || `Tier ${tier}`}
                  count={tierExercises.length}
                  questionCount={first.questionCount || 10}
                  cefr={first.cefrLevel} best={first.bestScore}
                  accent={accent}
                  onStart={() => launchSession(first)}/>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
