import { useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useI18n } from '../i18n'

/* ============================================================================
   Practice Arena — replaces the old Quiz placeholder
   - Tier progression (10 tiers)
   - 4 skill categories: Grammar / Vocabulary / Pronunciation / Fluency
   - Game-like session UI: single question at a time, instant feedback
   - XP + tier unlock visualization
   - Deep-link support: ?category=grammar or ?focus=... or ?error=...
   ============================================================================ */

const CATEGORY_META = {
  grammar: { label: 'Grammar', icon: 'spellcheck', color: 'violet', tone: 'from-violet-500 to-fuchsia-600' },
  vocabulary: { label: 'Vocabulary', icon: 'book', color: 'sky', tone: 'from-sky-500 to-blue-600' },
  pronunciation: { label: 'Pronunciation', icon: 'record_voice_over', color: 'amber', tone: 'from-amber-500 to-orange-600' },
  fluency: { label: 'Fluency', icon: 'graphic_eq', color: 'emerald', tone: 'from-emerald-500 to-teal-600' },
}

const QUESTION_TYPE_META = {
  'multiple-choice': { label: 'Multiple choice', icon: 'radio_button_checked' },
  'fill-blank': { label: 'Fill the blank', icon: 'edit' },
  'correction': { label: 'Correct the sentence', icon: 'edit_note' },
  'transformation': { label: 'Transform', icon: 'swap_horiz' },
  'word-formation': { label: 'Word formation', icon: 'text_fields' },
  'error-identification': { label: 'Spot the error', icon: 'search' },
  'sentence-combination': { label: 'Combine clauses', icon: 'merge' },
  'gap-fill-contextual': { label: 'Gap-fill paragraph', icon: 'description' },
  'translation-prompt': { label: 'Translation (PL → EN)', icon: 'translate' },
}

function useStudentSlug() {
  const params = useParams()
  return params.slug || 'szymon-karpinski'
}

async function fetchExercise(slug, tier, category, exerciseIdx = 0) {
  const url = `/practice-data/${slug}/tier-${tier}/${category}.json`
  const r = await fetch(url)
  if (!r.ok) return null
  const data = await r.json()
  return Array.isArray(data) ? (data[exerciseIdx] || data[0]) : null
}

async function fetchIndex(slug) {
  const r = await fetch(`/practice-data/${slug}-index.json`)
  if (!r.ok) return null
  return await r.json()
}

async function fetchKbDrill(slug, entryId) {
  if (!entryId) return null
  const r = await fetch(`/practice-data/${slug}/kb-drills/${encodeURIComponent(entryId)}.json`)
  if (!r.ok) return null
  return await r.json()
}

const KB_TYPE_META = {
  'multiple-choice': { label: 'Multiple choice', icon: 'radio_button_checked', tone: 'from-sky-500 to-blue-600' },
  'fill-blank': { label: 'Fill the blank', icon: 'edit', tone: 'from-violet-500 to-fuchsia-600' },
  'correction': { label: 'Correct the sentence', icon: 'edit_note', tone: 'from-rose-500 to-pink-600' },
  'transformation': { label: 'Transform', icon: 'swap_horiz', tone: 'from-emerald-500 to-teal-600' },
  'word-formation': { label: 'Word formation', icon: 'text_fields', tone: 'from-amber-500 to-orange-600' },
  'error-identification': { label: 'Spot the error', icon: 'search', tone: 'from-fuchsia-500 to-pink-600' },
  'sentence-combination': { label: 'Combine clauses', icon: 'merge', tone: 'from-indigo-500 to-violet-600' },
  'gap-fill-contextual': { label: 'Gap-fill paragraph', icon: 'description', tone: 'from-teal-500 to-cyan-600' },
  'translation-prompt': { label: 'Translation (PL → EN)', icon: 'translate', tone: 'from-red-500 to-orange-600' },
}

const STOP_WORDS = new Set(['the','and','with','from','this','that','your','have','been','will','when','what','which','were','their','there','then','than','also','such','very','more','most','some','them','they','these','those','into','onto','upon','about','over','under','after','before','while','between','during','against'])

function tokenize(str) {
  return String(str || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w))
}

function scoreExerciseAgainstFocus(ex, focusTokens) {
  if (!focusTokens.length) return 0
  const hay = `${ex.title} ${ex.description || ''} ${ex.focusArea || ''} ${(ex.tags || []).join(' ')}`.toLowerCase()
  let score = 0
  for (const t of focusTokens) if (hay.includes(t)) score += 1
  return score
}

/**
 * Pick a diverse set of exercises matched to a focus/error:
 *   - score all exercises by keyword overlap
 *   - keep the highest-scoring ones first
 *   - ensure at least 5 entries by padding from the same category or any category
 *   - cap at ~12 so the picker stays scannable
 */
function curateFocusMatches({ exercises, focus, category }) {
  const focusTokens = tokenize(focus)
  const scored = exercises.map(ex => ({
    ex,
    score: scoreExerciseAgainstFocus(ex, focusTokens) + (category && ex.category === category ? 0.5 : 0),
  }))
  const matches = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).map(s => s.ex)
  const needed = 8
  if (matches.length >= needed) return matches.slice(0, 12)
  const fillerPool = exercises.filter(ex => !matches.includes(ex) && (!category || ex.category === category))
  const filler = [...fillerPool].sort(() => Math.random() - 0.5).slice(0, needed - matches.length)
  const combined = [...matches, ...filler]
  if (combined.length < 5) {
    const more = exercises.filter(ex => !combined.includes(ex)).sort(() => Math.random() - 0.5).slice(0, 5 - combined.length)
    combined.push(...more)
  }
  return combined.slice(0, 12)
}

/* ============================================================================
   Question renderer — supports all question types
   ============================================================================ */

function QuestionCard({ question, onAnswer, answered, userAnswer, correct }) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const type = question.type || 'multiple-choice'
  const meta = QUESTION_TYPE_META[type] || QUESTION_TYPE_META['multiple-choice']
  const typeLabel = t(`quiz.qtype.${type}`)

  function submit(val) {
    if (answered) return
    onAnswer(val)
  }

  return (
    <div className="rounded-[1.5rem] bg-white border-2 border-slate-200 p-6 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-sky-600 text-base">{meta.icon}</span>
        <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{typeLabel}</p>
      </div>
      <p className="text-lg font-headline text-slate-900 leading-relaxed mb-5">{question.prompt}</p>

      {type === 'multiple-choice' && question.options && (
        <div className="grid gap-2">
          {question.options.map((opt, i) => {
            const isSelected = userAnswer === opt
            const isCorrect = answered && String(opt).toLowerCase() === String(question.correctAnswer || '').toLowerCase()
            const isWrong = answered && isSelected && !isCorrect
            return (
              <button
                key={i}
                type="button"
                onClick={() => submit(opt)}
                disabled={answered}
                className={`rounded-[1rem] border-2 px-4 py-3 text-left transition-all cursor-pointer ${
                  isCorrect ? 'border-emerald-400 bg-emerald-50 text-emerald-900' :
                  isWrong ? 'border-rose-400 bg-rose-50 text-rose-900' :
                  'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50'
                } ${answered ? 'cursor-default' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm font-bold ${
                    isCorrect ? 'bg-emerald-200 text-emerald-800' :
                    isWrong ? 'bg-rose-200 text-rose-800' :
                    'bg-slate-100 text-slate-600'
                  }`}>{String.fromCharCode(65 + i)}</span>
                  <span className="flex-1 text-sm font-semibold">{opt}</span>
                  {isCorrect && <span className="material-symbols-outlined text-emerald-600">check_circle</span>}
                  {isWrong && <span className="material-symbols-outlined text-rose-600">cancel</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {(type === 'fill-blank' || type === 'correction' || type === 'transformation' || type === 'word-formation' || type === 'error-identification' || type === 'sentence-combination' || type === 'gap-fill-contextual' || type === 'translation-prompt') && (
        <div>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit(value)}
            placeholder={t('quiz.question.placeholder')}
            disabled={answered}
            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-lg font-semibold text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
          />
          {!answered && (
            <button
              type="button"
              onClick={() => submit(value)}
              disabled={!value.trim()}
              className="mt-3 w-full rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 text-sm font-label font-bold uppercase tracking-[0.16em] text-white disabled:opacity-40 hover:from-sky-600 hover:to-blue-700 transition cursor-pointer"
            >
              {t('quiz.question.submit')}
            </button>
          )}
        </div>
      )}

      {answered && (
        <div className={`mt-5 rounded-[1rem] border-2 px-4 py-3 ${correct ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`material-symbols-outlined ${correct ? 'text-emerald-600' : 'text-rose-600'}`}>
              {correct ? 'check_circle' : 'info'}
            </span>
            <p className={`font-label text-xs font-bold uppercase tracking-[0.14em] ${correct ? 'text-emerald-700' : 'text-rose-700'}`}>
              {correct ? t('quiz.question.correctBang') : t('quiz.question.correctAnswer', { answer: question.correctAnswer })}
            </p>
          </div>
          {question.explanation && <p className="text-sm text-slate-700 leading-relaxed">{question.explanation}</p>}
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   Session — full quiz session with scoring
   ============================================================================ */

/**
 * Dialect-aware fuzzy grading.
 * Accepts the primary correct answer, explicit variants (acceptedAnswers array
 * added by our content agents), or common US/UK/AU spelling variants.
 */
function gradeAnswer(userRaw, question) {
  const user = String(userRaw || '').trim().toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' ')
  if (!user) return false
  const primary = String(question?.correctAnswer || '').trim().toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' ')
  const acceptedExtras = Array.isArray(question?.acceptedAnswers)
    ? question.acceptedAnswers.map(a => String(a || '').trim().toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' '))
    : []
  const variants = new Set([primary, ...acceptedExtras].filter(Boolean))

  // Expand with common UK ↔ US ↔ AU spelling variants
  const dialectPairs = [
    ['colour', 'color'], ['favour', 'favor'], ['behaviour', 'behavior'], ['flavour', 'flavor'],
    ['honour', 'honor'], ['humour', 'humor'], ['labour', 'labor'], ['neighbour', 'neighbor'],
    ['centre', 'center'], ['theatre', 'theater'], ['metre', 'meter'], ['litre', 'liter'],
    ['realise', 'realize'], ['organise', 'organize'], ['analyse', 'analyze'], ['recognise', 'recognize'],
    ['practise', 'practice'], ['licence', 'license'], ['defence', 'defense'], ['offence', 'offense'],
    ['travelled', 'traveled'], ['cancelled', 'canceled'], ['modelled', 'modeled'],
    ['grey', 'gray'], ['programme', 'program'], ['cheque', 'check'], ['tyre', 'tire'], ['kerb', 'curb'],
  ]
  for (const v of [...variants]) {
    for (const [uk, us] of dialectPairs) {
      if (v.includes(uk)) variants.add(v.split(uk).join(us))
      if (v.includes(us)) variants.add(v.split(us).join(uk))
    }
  }

  if (variants.has(user)) return true
  // Soft match: allow single char difference (typo tolerance) for answers > 4 chars
  for (const v of variants) {
    if (v && v.length > 4 && levenshteinDistance(user, v) <= 1) return true
  }
  return false
}

function levenshteinDistance(a, b) {
  if (!a.length) return b.length
  if (!b.length) return a.length
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j])
    }
  }
  return dp[a.length][b.length]
}

function ConfettiBurst() {
  const pieces = Array.from({ length: 40 }, (_, i) => {
    const angle = (i / 40) * Math.PI * 2
    const dist = 80 + Math.random() * 100
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist - 50
    const dr = (Math.random() - 0.5) * 720
    const color = ['#0ea5e9', '#7c3aed', '#059669', '#d97706', '#db2777'][i % 5]
    return { dx, dy, dr, color, delay: Math.random() * 100 }
  })
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {pieces.map((p, i) => (
        <div
          key={i}
          className="confetti-piece"
          style={{
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            '--dr': `${p.dr}deg`,
            background: p.color,
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
    </div>
  )
}

function Session({ exercise, category, tier, onComplete, onExit }) {
  const { t } = useI18n()
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [streak, setStreak] = useState(0)
  const [xp, setXp] = useState(0)
  const [xpPops, setXpPops] = useState([])
  const [showConfetti, setShowConfetti] = useState(false)

  const questions = exercise?.questions || []
  const q = questions[idx]
  const userAnswer = answers[idx]?.value
  const answered = userAnswer !== undefined
  const correct = answered && gradeAnswer(userAnswer, q)

  function handleAnswer(val) {
    setAnswers(prev => ({ ...prev, [idx]: { value: val } }))
    const isCorrect = gradeAnswer(val, q)
    if (isCorrect) {
      const newStreak = streak + 1
      setStreak(newStreak)
      const earned = 10 + (newStreak >= 3 ? 5 : 0) + (newStreak >= 5 ? 10 : 0)
      setXp(x => x + earned)
      setXpPops(p => [...p, { id: Date.now(), value: earned }])
      if (newStreak >= 3) {
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 1400)
      }
    } else {
      setStreak(0)
    }
  }

  function next() {
    if (idx < questions.length - 1) {
      setIdx(idx + 1)
    } else {
      const correctCount = Object.entries(answers).filter(([k, v]) =>
        gradeAnswer(v.value, questions[Number(k)])
      ).length
      const score = Math.round((correctCount / questions.length) * 100)
      onComplete({ correct: correctCount, total: questions.length, score })
    }
  }

  // KB-drill suites can pass a category like "articles" that isn't in our 4-way
  // CATEGORY_META — fall back to grammar so Session doesn't crash on undefined.
  const meta = CATEGORY_META[category] || CATEGORY_META.grammar
  const progress = ((idx + (answered ? 1 : 0)) / questions.length) * 100

  return (
    <div className="max-w-3xl mx-auto space-y-4 relative">
      {showConfetti && <ConfettiBurst />}
      {/* Header with live XP + streak */}
      <div className={`rounded-[1.5rem] bg-gradient-to-r ${meta.tone} px-5 py-4 text-white shadow-lg`}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[0.75rem] bg-white/20 backdrop-blur-sm">
              <span className="material-symbols-outlined">{meta.icon}</span>
            </div>
            <div>
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] opacity-85">{t('quiz.session.tierLabel', { tier, label: t(`quiz.cat.${CATEGORY_META[category] ? category : 'grammar'}`) })}</p>
              <h2 className="font-headline text-xl">{exercise?.title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* XP badge */}
            <div className="relative rounded-full bg-white/20 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-yellow-300 text-base">stars</span>
              <span className="font-mono text-sm font-bold tabular-nums score-pop" key={xp}>{t('quiz.session.xp', { xp })}</span>
              {xpPops.map(p => (
                <span key={p.id} className="xp-float" style={{ top: 0, left: '50%' }}>+{p.value}</span>
              ))}
            </div>
            {/* Streak badge */}
            {streak > 0 && (
              <div className="rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-3 py-1.5 flex items-center gap-1">
                <span className="material-symbols-outlined text-yellow-200 text-base streak-flame">local_fire_department</span>
                <span className="font-mono text-sm font-bold">{streak}</span>
              </div>
            )}
            <button type="button" onClick={onExit} className="rounded-full bg-white/20 hover:bg-white/30 p-2 transition cursor-pointer">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-white/20 overflow-hidden">
          <div className="h-2 rounded-full bg-white transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-[11px] opacity-85 font-label">{t('quiz.session.questionOf', { idx: idx + 1, total: questions.length })}</p>
      </div>

      {q && (
        <div
          key={idx}
          className={answered ? (correct ? 'correct-flash rounded-[1.5rem]' : 'wrong-shake rounded-[1.5rem]') : ''}
        >
          <QuestionCard
            question={q}
            onAnswer={handleAnswer}
            answered={answered}
            userAnswer={userAnswer}
            correct={correct}
          />
        </div>
      )}

      {answered && (
        <button
          type="button"
          onClick={next}
          className="w-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-3.5 text-sm font-label font-bold uppercase tracking-[0.18em] text-white hover:from-sky-600 hover:to-blue-700 transition cursor-pointer shadow-md"
        >
          {idx < questions.length - 1 ? t('quiz.session.nextQuestion') : t('quiz.session.finishSession')}
        </button>
      )}
    </div>
  )
}

/* ============================================================================
   BackNav — persistent header with back + shortcut chips
   ============================================================================ */

function BackNav({ slug, label, onBack, extraChips = [] }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const backLabel = label ?? t('quiz.nav.back')
  return (
    <div className="flex items-center gap-2 flex-wrap rounded-[1.25rem] bg-white/90 backdrop-blur-sm border-2 border-slate-200 px-3 py-2 sticky top-2 z-20 editorial-shadow">
      <button
        type="button"
        onClick={onBack || (() => navigate(-1))}
        className="flex items-center gap-1.5 rounded-full bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-white transition cursor-pointer back-btn-pulse"
      >
        <span className="material-symbols-outlined text-[14px]">arrow_back</span>
        {backLabel}
      </button>
      <span className="h-5 w-px bg-slate-200" />
      <div className="flex items-center gap-1.5 flex-wrap">
        {extraChips}
        <Link to={`/app/${slug}/dashboard`} className="rounded-full bg-slate-100 hover:bg-sky-100 border border-slate-200 hover:border-sky-300 px-2.5 py-1 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:text-sky-700 transition cursor-pointer flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">dashboard</span>{t('quiz.nav.dashboard')}
        </Link>
        <Link to={`/app/${slug}/lessons`} className="rounded-full bg-slate-100 hover:bg-violet-100 border border-slate-200 hover:border-violet-300 px-2.5 py-1 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:text-violet-700 transition cursor-pointer flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">menu_book</span>{t('quiz.nav.lessons')}
        </Link>
        <Link to={`/app/${slug}/vocabulary`} className="rounded-full bg-slate-100 hover:bg-emerald-100 border border-slate-200 hover:border-emerald-300 px-2.5 py-1 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:text-emerald-700 transition cursor-pointer flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">library_books</span>{t('quiz.nav.vocab')}
        </Link>
        <Link to={`/app/${slug}/knowledge`} className="rounded-full bg-slate-100 hover:bg-rose-100 border border-slate-200 hover:border-rose-300 px-2.5 py-1 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:text-rose-700 transition cursor-pointer flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">flag</span>{t('quiz.nav.errors')}
        </Link>
      </div>
    </div>
  )
}

/* ============================================================================
   FocusPicker — landing page when arriving from an error/improvement card
   Shows a curated set of ≥5 drills matched to the focus, grouped by type,
   with a "Read aloud with AI" card for pronunciation practice.
   ============================================================================ */

function FocusPicker({ focus, category, matches, onPick, onLaunchPronunciation, slug, onExit }) {
  const { t } = useI18n()
  const byType = useMemo(() => {
    const groups = {}
    for (const ex of matches) {
      const t = ex.primaryQuestionType || ex.questionType || ex.category || 'mixed'
      if (!groups[t]) groups[t] = []
      groups[t].push(ex)
    }
    return groups
  }, [matches])

  const categoryMeta = category ? CATEGORY_META[category] : null
  const categoryLabel = category && CATEGORY_META[category] ? t(`quiz.cat.${category}`) : null
  const titleText = focus
    ? t('quiz.focus.titleWithFocus', { focus })
    : (categoryLabel ? t('quiz.focus.titleWithCategory', { label: categoryLabel }) : t('quiz.focus.titleDefault'))

  return (
    <section className="space-y-4">
      <BackNav slug={slug} label={t('quiz.nav.backToLesson')} onBack={onExit} />

      <div className="rounded-[1.75rem] bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 px-5 py-5 sm:px-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 0%, transparent 40%), radial-gradient(circle at 80% 80%, white 0%, transparent 40%)' }} />
        <div className="relative">
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em] opacity-90">{t('quiz.focus.kicker')}</p>
          <h1 className="mt-1 font-headline text-xl sm:text-2xl leading-tight">{titleText}</h1>
          <p className="mt-2 text-sm opacity-90 max-w-2xl">
            {t('quiz.focus.subtitle')}
          </p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-[11px] font-label font-bold uppercase tracking-[0.14em]">
              {t('quiz.focus.matchedCount', { n: matches.length })}
            </span>
            <span className="rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-[11px] font-label font-bold uppercase tracking-[0.14em]">
              {t('quiz.focus.typesCount', { n: Object.keys(byType).length })}
            </span>
          </div>
        </div>
      </div>

      {/* Read-aloud pronunciation card (AI widget) */}
      <button
        type="button"
        onClick={() => onLaunchPronunciation(focus || (categoryMeta ? categoryMeta.label : ''))}
        className="w-full rounded-[1.5rem] border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-5 text-left hover:border-amber-400 hover:shadow-xl hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
      >
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-200/40 group-hover:scale-110 transition-transform" />
        <div className="relative flex items-start gap-4">
          <div className="shrink-0 flex h-14 w-14 items-center justify-center rounded-[1rem] bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-white text-3xl">record_voice_over</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">{t('quiz.pron.kicker')}</p>
              <span className="rounded-full bg-amber-600 text-white px-2 py-0.5 text-[9px] font-label font-bold uppercase tracking-[0.14em]">{t('quiz.pron.newBadge')}</span>
            </div>
            <h3 className="font-headline text-lg text-slate-900 leading-snug">{t('quiz.pron.headline')}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {t('quiz.pron.body')}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-600 text-white px-3 py-1.5 text-[11px] font-label font-bold uppercase tracking-[0.14em]">
              <span className="material-symbols-outlined text-[14px]">mic</span>
              {t('quiz.pron.cta')}
            </span>
          </div>
        </div>
      </button>

      {/* Grouped drill cards */}
      {Object.entries(byType).map(([type, list]) => {
        const meta = QUESTION_TYPE_META[type] || { label: type.replace(/-/g, ' '), icon: 'fitness_center' }
        const typeLabel = QUESTION_TYPE_META[type] ? t(`quiz.qtype.${type}`) : meta.label
        return (
          <div key={type} className="rounded-[1.5rem] bg-white border-2 border-slate-200 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-violet-600">{meta.icon}</span>
              <p className="font-label text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">{typeLabel}</p>
              <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-label font-bold text-slate-500">{list.length}</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {list.map((ex, i) => {
                const catMeta = CATEGORY_META[ex.category] || CATEGORY_META.grammar
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onPick(ex)}
                    className="rounded-[1.1rem] border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3.5 text-left hover:border-sky-300 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r ${catMeta.tone} text-white px-2 py-0.5 text-[9px] font-label font-bold uppercase tracking-[0.14em]`}>
                        <span className="material-symbols-outlined text-[11px]">{catMeta.icon}</span>
                        {t(`quiz.cat.${CATEGORY_META[ex.category] ? ex.category : 'grammar'}`)}
                      </span>
                      <span className="text-[10px] font-label font-bold text-slate-400">{t('quiz.card.tier', { tier: ex.difficultyTier })}</span>
                    </div>
                    <h4 className="font-headline text-sm text-slate-900 leading-snug line-clamp-2">{ex.title}</h4>
                    <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{ex.description}</p>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="text-[10px] font-label text-slate-400">{t('quiz.card.qsShort', { n: ex.questionCount || 10 })}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-label font-bold text-sky-600">
                        {t('quiz.card.start')}<span className="material-symbols-outlined text-[12px]">arrow_forward</span>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <button
        type="button"
        onClick={onExit}
        className="w-full rounded-[1.25rem] border-2 border-dashed border-slate-300 bg-white/60 px-4 py-3 text-[11px] font-label font-bold uppercase tracking-[0.16em] text-slate-500 hover:text-slate-800 hover:border-slate-400 transition cursor-pointer"
      >
        {t('quiz.focus.browseAll')}
      </button>
    </section>
  )
}

/* ============================================================================
   KbDrillPicker — 9 drill sets for a specific KB entry
   ============================================================================ */

function KbDrillPicker({ drillData, slug, onLaunchSet, onLaunchPronunciation, onExit }) {
  const { t } = useI18n()
  const sets = drillData?.drillSets || []
  const totalQs = sets.reduce((n, s) => n + (s.questions?.length || 0), 0)

  return (
    <section className="space-y-4">
      <BackNav slug={slug} label={t('quiz.nav.backToLesson')} onBack={onExit} />

      <div className="rounded-[1.75rem] bg-gradient-to-br from-rose-600 via-fuchsia-600 to-violet-600 px-5 py-5 sm:px-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, white 0%, transparent 45%), radial-gradient(circle at 70% 80%, white 0%, transparent 45%)' }} />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-base">flag</span>
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em] opacity-90">{t('quiz.kb.kicker')}</p>
            {drillData?.fossilized && <span className="rounded-full bg-amber-400 text-amber-950 px-2 py-0.5 text-[9px] font-label font-bold uppercase tracking-[0.14em]">{t('quiz.kb.fossilized')}</span>}
          </div>
          <h1 className="font-headline text-xl sm:text-2xl leading-tight">{drillData?.entryTitle || t('quiz.kb.drillTitleFallback')}</h1>
          {drillData?.polishInterferenceNote && (
            <p className="mt-2 text-sm opacity-90 max-w-2xl italic">"{drillData.polishInterferenceNote}"</p>
          )}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-[11px] font-label font-bold uppercase tracking-[0.14em]">{t('quiz.kb.drillTypes', { n: sets.length })}</span>
            <span className="rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-[11px] font-label font-bold uppercase tracking-[0.14em]">{t('quiz.kb.totalQuestions', { n: totalQs })}</span>
            {drillData?.category && <span className="rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-[11px] font-label font-bold uppercase tracking-[0.14em]">{drillData.category}</span>}
            {drillData?.cefrLevel && <span className="rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-[11px] font-label font-bold uppercase tracking-[0.14em]">{drillData.cefrLevel}</span>}
          </div>
        </div>
      </div>

      {/* Pronunciation AI card */}
      <button
        type="button"
        onClick={() => onLaunchPronunciation(drillData?.entryTitle || '')}
        className="w-full rounded-[1.5rem] border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-5 text-left hover:border-amber-400 hover:shadow-xl hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
      >
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-200/40 group-hover:scale-110 transition-transform" />
        <div className="relative flex items-start gap-4">
          <div className="shrink-0 flex h-14 w-14 items-center justify-center rounded-[1rem] bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-white text-3xl">record_voice_over</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">{t('quiz.pron.kicker')}</p>
            </div>
            <h3 className="font-headline text-lg text-slate-900 leading-snug">{t('quiz.pron.kbHeadline')}</h3>
            <p className="mt-1 text-sm text-slate-600">{t('quiz.pron.kbBody')}</p>
          </div>
        </div>
      </button>

      {/* 9 drill-type cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sets.map((s, i) => {
          const meta = KB_TYPE_META[s.type] || { label: s.label || s.type, icon: 'fitness_center', tone: 'from-slate-500 to-slate-700' }
          const setLabel = KB_TYPE_META[s.type] ? t(`quiz.qtype.${s.type}`) : (s.label || s.type)
          const n = s.questions?.length || 0
          return (
            <button
              key={i}
              type="button"
              onClick={() => onLaunchSet(s)}
              disabled={!n}
              className="rounded-[1.25rem] border-2 border-slate-200 bg-white p-4 text-left hover:border-fuchsia-300 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-[0.85rem] bg-gradient-to-br ${meta.tone} text-white shadow-md group-hover:scale-110 transition-transform`}>
                  <span className="material-symbols-outlined">{meta.icon}</span>
                </span>
                <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-label font-bold text-slate-600">{t('quiz.card.qsShort', { n })}</span>
              </div>
              <h3 className="font-headline text-sm text-slate-900 leading-snug">{setLabel}</h3>
              <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                {n > 0 ? t('quiz.kb.targetedQs', { n }) : t('quiz.kb.noQs')}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-label font-bold text-fuchsia-600">
                {t('quiz.kb.startDrill')}<span className="material-symbols-outlined text-[13px]">arrow_forward</span>
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onExit}
        className="w-full rounded-[1.25rem] border-2 border-dashed border-slate-300 bg-white/60 px-4 py-3 text-[11px] font-label font-bold uppercase tracking-[0.16em] text-slate-500 hover:text-slate-800 hover:border-slate-400 transition cursor-pointer"
      >
        {t('quiz.focus.browseAll')}
      </button>
    </section>
  )
}

/* ============================================================================
   FreeWriteDrill — the practice-advice free-writing box.
   Opens when the student clicks a practice advice line from a lesson.
   They type an attempt at the task, the AI reviews it (via /chat) and
   responds with grammar/style corrections and applause where deserved.
   ============================================================================ */

// Detect whether a practice-advice instruction is video/audio-centric so we
// can surface watch-source buttons + inline embed for it.
function extractWatchHints(advice) {
  const lower = String(advice || '').toLowerCase()
  const isWatchy = /\b(watch|video|clip|listen|podcast|youtube|rumble|odysee|ted( talk)?|lecture|documentary|episode|tutorial)\b/.test(lower)
  if (!isWatchy) return null
  // Heuristic: pull the most searchable noun-phrase chunks
  // — words in quotes, capitalized phrases, things after "on"/"about"
  let query = String(advice || '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Prefer the portion after "on" or "about" if present
  const m = query.match(/\b(?:on|about)\s+(.{3,120})/i)
  if (m) query = m[1]
  // Cap length, strip common trailing fluff
  query = query.replace(/[.!?].*$/, '').replace(/\s+and focus.*$/i, '').replace(/\s+featuring.*$/i, '').trim()
  if (query.length > 110) {
    const cut = query.slice(0, 110)
    const lastSpace = cut.lastIndexOf(' ')
    query = lastSpace > 40 ? cut.slice(0, lastSpace) : cut
  }
  return { query }
}

// Parse a user-pasted URL into an embeddable iframe src.
function parseVideoUrl(raw) {
  if (!raw) return null
  try {
    const url = new URL(raw.trim())
    const host = url.hostname.replace(/^www\./, '')
    // YouTube
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = url.searchParams.get('v')
      if (v) return { src: `https://www.youtube-nocookie.com/embed/${v}`, source: 'YouTube' }
      // Shorts / embed
      const m1 = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)
      if (m1) return { src: `https://www.youtube-nocookie.com/embed/${m1[1]}`, source: 'YouTube' }
    }
    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\//, '')
      if (id) return { src: `https://www.youtube-nocookie.com/embed/${id}`, source: 'YouTube' }
    }
    // Rumble — embed URL pattern: rumble.com/embed/<id>/
    if (host === 'rumble.com') {
      const m2 = url.pathname.match(/^\/embed\/([\w-]+)/)
      if (m2) return { src: `https://rumble.com/embed/${m2[1]}/`, source: 'Rumble' }
      // A normal Rumble watch page — let the student click the "open externally" link
      return { src: null, source: 'Rumble', externalOnly: true, url: raw }
    }
    // Odysee — pattern: odysee.com/$/embed/<path>
    if (host === 'odysee.com') {
      if (url.pathname.startsWith('/$/embed/')) return { src: `https://odysee.com${url.pathname}`, source: 'Odysee' }
      return { src: `https://odysee.com/$/embed${url.pathname}`, source: 'Odysee' }
    }
  } catch (_) {}
  return null
}

function FreeWriteDrill({ advice, slug, onExit }) {
  const { t } = useI18n()
  const [attempt, setAttempt] = useState('')
  const [status, setStatus] = useState('idle') // idle | grading | reviewed
  const [review, setReview] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoEmbed, setVideoEmbed] = useState(null)
  const [urlError, setUrlError] = useState('')
  const watchHints = useMemo(() => extractWatchHints(advice), [advice])

  function handleLoadVideo() {
    setUrlError('')
    const parsed = parseVideoUrl(videoUrl)
    if (!parsed) {
      setUrlError(t('quiz.free.urlError'))
      setVideoEmbed(null)
      return
    }
    if (parsed.externalOnly) {
      setUrlError(t('quiz.free.externalOnlyError', { source: parsed.source }))
      setVideoEmbed({ ...parsed })
      return
    }
    setVideoEmbed(parsed)
  }

  async function submit() {
    const text = attempt.trim()
    if (!text || status === 'grading') return
    setStatus('grading')
    setReview('')
    try {
      const prompt = (
        `I've just done this practice task: "${advice}"\n\n` +
        `Here is my attempt:\n\n"${text}"\n\n` +
        `Please review it. Tell me what I got right, flag specific mistakes with their corrections, ` +
        `and give me one concrete tip to push this piece of writing from good to great. Be warm and specific.`
      )
      const r = await fetch('/api/conversa/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: slug,
          message: prompt,
          history: [],
          voice: (typeof localStorage !== 'undefined' && localStorage.getItem('tts_voice')) || 'af_heart',
        }),
      })
      const d = await r.json()
      setReview(d?.reply || t('quiz.free.aiUnavailable'))
    } catch (_) {
      setReview(t('quiz.free.networkError'))
    } finally {
      setStatus('reviewed')
    }
  }

  function reset() {
    setAttempt('')
    setReview('')
    setStatus('idle')
  }

  return (
    <section className="space-y-4">
      <BackNav slug={slug} label={t('quiz.nav.backToLesson')} onBack={onExit} />

      <div className="rounded-[1.75rem] bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 px-5 py-5 sm:px-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 0%, transparent 40%), radial-gradient(circle at 80% 80%, white 0%, transparent 40%)' }} />
        <div className="relative">
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em] opacity-90">{t('quiz.free.kicker')}</p>
          <h1 className="mt-1 font-headline text-xl sm:text-2xl leading-tight">{advice}</h1>
          <p className="mt-2 text-sm opacity-90 max-w-2xl">
            {t('quiz.free.body')}
          </p>
        </div>
      </div>

      {watchHints && (
        <div className="rounded-[1.5rem] border-2 border-red-200 bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3 mb-3 flex-wrap">
            <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-[0.9rem] bg-gradient-to-br from-red-500 to-orange-600 shadow-md">
              <span className="material-symbols-outlined text-white text-xl">play_circle</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-red-700 mb-0.5">{t('quiz.free.watchTitle')}</p>
              <p className="text-sm font-semibold text-slate-800">{t('quiz.free.watchSubtitle', { query: watchHints.query })}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <a
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(watchHints.query)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-white shadow-sm transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">search</span>
              {t('quiz.free.searchYoutube')}
            </a>
            <a
              href={`https://rumble.com/search/all?q=${encodeURIComponent(watchHints.query)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-white shadow-sm transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">search</span>
              {t('quiz.free.searchRumble')}
            </a>
            <a
              href={`https://odysee.com/$/search?q=${encodeURIComponent(watchHints.query)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-700 hover:bg-violet-800 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-white shadow-sm transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">search</span>
              {t('quiz.free.searchOdysee')}
            </a>
          </div>
          <div className="rounded-[1rem] bg-white/80 border border-red-100 p-3">
            <p className="font-label text-[9px] font-bold uppercase tracking-[0.16em] text-red-700 mb-2">{t('quiz.free.embedTitle')}</p>
            <p className="text-[11px] text-slate-600 mb-2">{t('quiz.free.embedBody')}</p>
            <div className="flex gap-2 flex-wrap">
              <input
                type="url"
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLoadVideo()}
                placeholder={t('quiz.free.urlPlaceholder')}
                className="flex-1 min-w-[240px] rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
              />
              <button
                type="button"
                onClick={handleLoadVideo}
                className="rounded-xl bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-white cursor-pointer shadow-sm"
              >
                {t('quiz.free.loadVideo')}
              </button>
            </div>
            {urlError && <p className="mt-2 text-[11px] text-red-700">{urlError}</p>}
            {videoEmbed?.src && (
              <div className="mt-3 aspect-video rounded-xl overflow-hidden bg-black border-2 border-red-200 shadow-md">
                <iframe
                  src={videoEmbed.src}
                  className="w-full h-full"
                  title="Embedded clip"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}
            {videoEmbed?.externalOnly && videoEmbed.url && (
              <a
                href={videoEmbed.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-800 hover:bg-slate-900 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                {t('quiz.free.openOn', { source: videoEmbed.source })}
              </a>
            )}
          </div>
        </div>
      )}

      <div className="rounded-[1.5rem] border-2 border-slate-200 bg-white p-5 shadow-sm">
        <label className="block mb-2">
          <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('quiz.free.attemptLabel')}</span>
        </label>
        <textarea
          value={attempt}
          onChange={e => setAttempt(e.target.value)}
          placeholder={t('quiz.free.attemptPlaceholder')}
          disabled={status === 'grading'}
          className="w-full min-h-[220px] rounded-2xl border-2 border-slate-200 bg-slate-50/40 px-4 py-3 text-base text-slate-800 leading-relaxed focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100 resize-y"
        />
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] font-label text-slate-400">{t('quiz.free.wordsCount', { n: attempt.trim().split(/\s+/).filter(Boolean).length })}</span>
          <div className="flex gap-2">
            {status === 'reviewed' && (
              <button
                type="button"
                onClick={reset}
                className="rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:border-slate-400 transition cursor-pointer"
              >
                {t('quiz.free.tryAgain')}
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!attempt.trim() || status === 'grading'}
              className="rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-white disabled:opacity-40 hover:from-amber-600 hover:to-orange-700 transition cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[14px]">{status === 'grading' ? 'hourglass_top' : 'auto_awesome'}</span>
              {status === 'grading' ? t('quiz.free.grading') : t('quiz.free.submit')}
            </button>
          </div>
        </div>
      </div>

      {status === 'reviewed' && review && (
        <div className="rounded-[1.5rem] border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">reviews</span>
            {t('quiz.free.aiReview')}
          </p>
          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{review}</div>
        </div>
      )}
    </section>
  )
}

/* ============================================================================
   Main Practice view
   ============================================================================ */

export default function Quiz({ data }) {
  const { t } = useI18n()
  const slug = useStudentSlug()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [index, setIndex] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState(searchParams.get('category') || 'grammar')
  const [session, setSession] = useState(null)
  const [completed, setCompleted] = useState(null)

  const focusParam = searchParams.get('focus') || searchParams.get('error') || ''
  const categoryParam = searchParams.get('category') || ''
  const errorIdParam = searchParams.get('errorId') || ''
  const adviceParam = searchParams.get('advice') || ''
  const inFocusMode = !!(focusParam || (categoryParam && searchParams.get('error')))
  const inFreeWriteMode = !!adviceParam
  const inKbDrillMode = !!errorIdParam
  const [kbDrillData, setKbDrillData] = useState(null)
  const [kbDrillLoading, setKbDrillLoading] = useState(false)

  useEffect(() => {
    fetchIndex(slug).then(idx => {
      setIndex(idx)
      setLoading(false)
    })
  }, [slug])

  useEffect(() => {
    if (!errorIdParam) { setKbDrillData(null); return }
    setKbDrillLoading(true)
    fetchKbDrill(slug, errorIdParam).then(d => {
      setKbDrillData(d)
      setKbDrillLoading(false)
    })
  }, [slug, errorIdParam])

  function launchKbDrillSet(set) {
    const exercise = {
      title: `${kbDrillData?.entryTitle || t('quiz.kb.drillTitleFallback')} — ${KB_TYPE_META[set.type] ? t(`quiz.qtype.${set.type}`) : (set.label || set.type)}`,
      description: kbDrillData?.polishInterferenceNote || '',
      questions: (set.questions || []).map(q => ({ ...q, type: set.type })),
    }
    // KB entries use fine-grained categories ("articles", "prepositions", etc.).
    // The Session header uses the 4-way CATEGORY_META (grammar/vocabulary/pronunciation/fluency).
    // Map fine-grained → coarse.
    const raw = String(kbDrillData?.category || 'grammar').toLowerCase()
    const coarse =
      raw.includes('pronunc') || raw.includes('phono') ? 'pronunciation' :
      raw.includes('vocab') || raw.includes('lexi') || raw.includes('collocation') ? 'vocabulary' :
      raw.includes('fluenc') || raw.includes('coherenc') || raw.includes('discourse') || raw.includes('hesitat') ? 'fluency' :
      'grammar'
    setSession({
      exercise,
      category: coarse,
      tier: kbDrillData?.cefrLevel || 'C1',
    })
    setCompleted(null)
  }

  function exitFocusMode() {
    setSearchParams({})
  }

  function launchPronunciation(target) {
    // Invoke the English Metropolis AI widget's pronunciation drill mode
    const ev = new CustomEvent('em-ai:pronunciation-drill', {
      detail: { target: String(target || ''), slug, source: 'practice-arena' },
    })
    window.dispatchEvent(ev)
    // Fallback: open the widget if not auto-opened
    if (window.__EM_AI_OPEN) {
      try { window.__EM_AI_OPEN({ mode: 'pronunciation', target }) } catch (_) {}
    }
  }

  const focusMatches = useMemo(() => {
    if (!inFocusMode || !index?.exercises) return []
    return curateFocusMatches({
      exercises: index.exercises,
      focus: focusParam,
      category: categoryParam,
    })
  }, [inFocusMode, index, focusParam, categoryParam])

  const studentName = data?.profile?.firstName || t('quiz.arena.studentFallback')

  const exercisesByCategory = useMemo(() => {
    if (!index?.exercises) return {}
    const out = { grammar: [], vocabulary: [], pronunciation: [], fluency: [] }
    for (const ex of index.exercises) {
      if (out[ex.category]) out[ex.category].push(ex)
    }
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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-[1.75rem] bg-slate-100 animate-pulse" />
        <div className="h-64 rounded-[1.75rem] bg-slate-100 animate-pulse" />
      </div>
    )
  }

  // Session in progress
  if (session && !completed) {
    return (
      <div className="space-y-3">
        <BackNav
          slug={slug}
          label={inFocusMode ? t('quiz.nav.backToDrillList') : t('quiz.nav.backToArena')}
          onBack={() => setSession(null)}
        />
        <Session
          exercise={session.exercise}
          category={session.category}
          tier={session.tier}
          onComplete={(result) => setCompleted(result)}
          onExit={() => setSession(null)}
        />
      </div>
    )
  }

  // Free-write advice drill — student attempts a practice-advice task in a blank box,
  // the AI reviews the attempt and gives targeted feedback.
  if (inFreeWriteMode) {
    return (
      <FreeWriteDrill
        advice={adviceParam}
        slug={slug}
        onExit={exitFocusMode}
      />
    )
  }

  // KB-entry drill suite — 9 drill types for one specific fossilized error
  if (inKbDrillMode) {
    if (kbDrillLoading) {
      return (
        <div className="space-y-3">
          <BackNav slug={slug} label={t('quiz.nav.back')} onBack={exitFocusMode} />
          <div className="h-32 rounded-[1.75rem] bg-slate-100 animate-pulse" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0,1,2,3,4,5].map(i => <div key={i} className="h-36 rounded-[1.25rem] bg-slate-100 animate-pulse" />)}
          </div>
        </div>
      )
    }
    if (!kbDrillData) {
      return (
        <div className="space-y-3">
          <BackNav slug={slug} label={t('quiz.nav.back')} onBack={exitFocusMode} />
          <div className="rounded-[1.25rem] border-2 border-amber-200 bg-amber-50 p-5 text-center">
            <p className="font-label text-xs font-bold uppercase tracking-[0.14em] text-amber-700 mb-2">{t('quiz.kb.notReadyTitle')}</p>
            <p className="text-sm text-slate-700">{t('quiz.kb.notReadyBody')}</p>
            <button type="button" onClick={exitFocusMode} className="mt-3 rounded-full bg-amber-600 hover:bg-amber-700 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-white cursor-pointer">{t('quiz.kb.goToArena')}</button>
          </div>
        </div>
      )
    }
    return (
      <KbDrillPicker
        drillData={kbDrillData}
        slug={slug}
        onLaunchSet={launchKbDrillSet}
        onLaunchPronunciation={launchPronunciation}
        onExit={exitFocusMode}
      />
    )
  }

  // Focus mode landing — curated picker of matched drills
  if (inFocusMode && index) {
    return (
      <FocusPicker
        focus={focusParam}
        category={categoryParam}
        matches={focusMatches}
        onPick={launchSession}
        onLaunchPronunciation={launchPronunciation}
        slug={slug}
        onExit={exitFocusMode}
      />
    )
  }

  // Session completed
  if (completed && session) {
    const ok = completed.score >= 70
    return (
      <div className="max-w-2xl mx-auto">
        <div className={`rounded-[2rem] bg-gradient-to-br ${ok ? 'from-emerald-500 to-teal-600' : 'from-amber-500 to-orange-600'} px-6 py-8 text-white text-center shadow-xl`}>
          <span className="material-symbols-outlined text-6xl mb-2 block">{ok ? 'emoji_events' : 'refresh'}</span>
          <h2 className="font-headline text-4xl">{completed.score}%</h2>
          <p className="font-label text-xs font-bold uppercase tracking-[0.24em] mt-2 opacity-90">{ok ? t('quiz.complete.passed') : t('quiz.complete.tryAgain')}</p>
          <p className="mt-3 text-sm opacity-90">{t('quiz.complete.scoreLine', { correct: completed.correct, total: completed.total })}</p>
          <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { setSession(null); setCompleted(null) }}
              className="rounded-full bg-white/20 hover:bg-white/30 px-5 py-2.5 text-xs font-label font-bold uppercase tracking-[0.14em] transition cursor-pointer backdrop-blur-sm"
            >
              {t('quiz.complete.backToArena')}
            </button>
            <button
              type="button"
              onClick={() => launchSession(currentExercises[0])}
              className="rounded-full bg-white text-slate-800 hover:bg-slate-50 px-5 py-2.5 text-xs font-label font-bold uppercase tracking-[0.14em] transition cursor-pointer"
            >
              {t('quiz.complete.tryAnother')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="space-y-4" id="page-practice">
      <BackNav slug={slug} label={t('quiz.nav.back')} />
      {/* Hero */}
      <div className="rounded-[1.75rem] bg-gradient-to-br from-white via-violet-50/60 to-sky-50/60 border-2 border-white/70 editorial-shadow px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-label text-[11px] font-bold uppercase tracking-[0.24em] text-violet-700">{t('quiz.arena.kicker')}</p>
            <h1 className="mt-1.5 font-headline text-2xl sm:text-3xl text-slate-900">
              {t('quiz.arena.title', { name: studentName })}
            </h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl">
              {t('quiz.arena.subtitle')}
            </p>
          </div>
          {index && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="rounded-[1rem] bg-white border-2 border-slate-200 px-3 py-2 text-center min-w-[72px]">
                <p className="text-[9px] font-label font-bold uppercase tracking-[0.18em] text-slate-400">{t('quiz.arena.statDrills')}</p>
                <p className="mt-0.5 font-headline text-xl text-slate-900">{index.totalExercises}</p>
              </div>
              <div className="rounded-[1rem] bg-white border-2 border-slate-200 px-3 py-2 text-center min-w-[72px]">
                <p className="text-[9px] font-label font-bold uppercase tracking-[0.18em] text-slate-400">{t('quiz.arena.statQuestions')}</p>
                <p className="mt-0.5 font-headline text-xl text-slate-900">{index.totalQuestions}</p>
              </div>
              <div className="rounded-[1rem] bg-gradient-to-br from-emerald-50 to-sky-50 border-2 border-emerald-200 px-3 py-2 text-center min-w-[72px]">
                <p className="text-[9px] font-label font-bold uppercase tracking-[0.18em] text-slate-400">{t('quiz.arena.statLevel')}</p>
                <p className="mt-0.5 font-headline text-xl text-emerald-700">{index.cefrLevel}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="rounded-[1.5rem] bg-white border-2 border-slate-200 p-3">
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          {Object.entries(CATEGORY_META).map(([key, m]) => {
            const active = activeCategory === key
            const count = exercisesByCategory[key]?.length || 0
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveCategory(key)}
                className={`rounded-[1.25rem] px-4 py-3 text-left transition-all cursor-pointer ${
                  active
                    ? `bg-gradient-to-br ${m.tone} text-white shadow-lg scale-[1.02]`
                    : 'bg-white border-2 border-slate-200 hover:border-sky-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined">{m.icon}</span>
                  <div>
                    <p className="font-headline text-base">{t(`quiz.cat.${key}`)}</p>
                    <p className={`text-[10px] font-label uppercase tracking-[0.14em] ${active ? 'opacity-85' : 'text-slate-500'}`}>{t('quiz.arena.categoryDrills', { n: count })}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tier grid */}
      <div className="rounded-[1.5rem] bg-white border-2 border-slate-200 p-5">
        <p className="font-label text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 mb-3">
          {t('quiz.arena.tierHeader', { label: t(`quiz.cat.${activeCategory}`) })}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6,7,8,9,10].map(tier => {
            const tierExercises = currentExercises.filter(ex => ex.difficultyTier === tier)
            if (!tierExercises.length) return null
            const first = tierExercises[0]
            return (
              <button
                key={tier}
                type="button"
                onClick={() => launchSession(first)}
                className="rounded-[1.25rem] border-2 border-slate-200 bg-white p-4 text-left hover:border-sky-300 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-[0.75rem] bg-gradient-to-br ${CATEGORY_META[activeCategory].tone} text-white shadow-sm`}>
                    <span className="font-headline text-sm font-bold">{tier}</span>
                  </span>
                  <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-label font-bold text-slate-600">{first.cefrLevel}</span>
                </div>
                <h3 className="font-headline text-sm text-slate-900 leading-snug line-clamp-2">{first.title}</h3>
                <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{first.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] font-label text-slate-400">{t('quiz.arena.tierQuestions', { n: first.questionCount || 10 })}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 border border-sky-200 px-2 py-0.5 text-[10px] font-label font-bold text-sky-700">
                    <span className="material-symbols-outlined text-[10px]">play_arrow</span>
                    {t('quiz.arena.tierStart')}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
