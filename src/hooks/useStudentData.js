import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ANALYSES_LIMIT,
  CONVEX_URL,
  STUDENT_FIRST_NAME,
  STUDENT_ID,
  STUDENT_INITIALS,
  STUDENT_LEVEL,
  STUDENT_NAME,
} from '../data/studentConfig.js'
import { fetchWithTimeout } from '../practice/lib/practice-cache'

function normalizeDateKey(value) {
  return String(value || '').trim().slice(0, 10)
}

function getLessonTimestamp(date) {
  const parsed = Date.parse(date)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatTopic(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeLessons(payload) {
  if (!Array.isArray(payload)) return []

  // First pass: normalize each lesson
  const normalized = payload.map((lesson, index) => {
    const keywords = Array.isArray(lesson?.keywords) ? lesson.keywords : []
    const topics = uniqueList((lesson?.topics || []).map(formatTopic))

    return {
      ...lesson,
      id: String(lesson?.id || lesson?.date || `lesson-${index + 1}`),
      date: normalizeDateKey(lesson?.date),
      keyword_count: Number(lesson?.keyword_count) || keywords.length,
      keywords,
      topics,
      topic: topics[0] || 'General English',
    }
  })

  // Sort ascending by date to assign lesson numbers (lesson 1 = oldest)
  const sortedAsc = [...normalized].sort((a, b) => getLessonTimestamp(a.date) - getLessonTimestamp(b.date))
  const numberByDate = {}
  sortedAsc.forEach((l, i) => { numberByDate[l.date] = i + 1 })

  // Return sorted descending (newest first) with lesson numbers attached
  return sortedAsc.map(l => ({ ...l, lessonNumber: numberByDate[l.date] }))
    .sort((a, b) => getLessonTimestamp(b.date) - getLessonTimestamp(a.date))
}

function normalizeConvexLessons(payload) {
  if (!Array.isArray(payload)) return {}

  return Object.fromEntries(
    payload
      .filter((lesson) => lesson?._id)
      .map((lesson) => [
        String(lesson._id),
        {
          ...lesson,
          date: normalizeDateKey(lesson?.date),
          topics: uniqueList((lesson?.topics || []).map(formatTopic)),
        },
      ]),
  )
}

function pickList(values, fallbackKey) {
  if (Array.isArray(values) && values.length) {
    return values.map((value) => String(value || '').trim()).filter(Boolean)
  }

  const fallback = String(fallbackKey || '').trim()
  return fallback ? [fallback] : []
}

function normalizeAnalyses(payload, convexLessonsById) {
  if (!Array.isArray(payload)) return []

  return payload
    .filter(Boolean)
    .map((analysis, index) => {
      const convexLesson = convexLessonsById[String(analysis?.lessonId || '')] || null
      return {
        ...analysis,
        id: String(analysis?._id || analysis?.lessonId || `analysis-${index + 1}`),
        date: normalizeDateKey(convexLesson?.date || analysis?.date),
        lessonTitle: analysis?.lessonTitle || convexLesson?.title || '',
        topics: uniqueList([...(convexLesson?.topics || []), ...(analysis?.topics || [])].map(formatTopic)),
        overallScore: Number(analysis?.overallScore) || 0,
        strengths: pickList(analysis?.strengths, analysis?.strengthSummary),
        improvements: pickList(analysis?.improvements, analysis?.improvementsSummary),
        feedback: String(analysis?.feedback || analysis?.lessonSummary || '').trim(),
      }
    })
    .sort((a, b) => {
      const dateDiff = getLessonTimestamp(b.date) - getLessonTimestamp(a.date)
      if (dateDiff !== 0) return dateDiff
      return Number(b?.createdAt || 0) - Number(a?.createdAt || 0)
    })
}

function flattenKeywords(lessons) {
  return lessons.flatMap((lesson, lessonIndex) =>
    (lesson.keywords || []).map((keyword, keywordIndex) => {
      const lessonTopics = uniqueList([
        formatTopic(keyword?.topic),
        ...lesson.topics,
      ])

      return {
        id: `${lesson.id}-${keywordIndex}-${String(keyword?.word || 'keyword').toLowerCase()}`,
        lessonId: String(lesson.id),
        lessonDate: lesson.date,
        lessonTitle: lesson.title,
        lessonNumber: lessonIndex + 1,
        lessonTopic: lesson.topic,
        topics: lessonTopics,
        word: String(keyword?.word || '').trim(),
        translation: String(keyword?.translation || '').trim(),
        definition: String(keyword?.definition_en || keyword?.definition_pl || '').trim(),
        definitionEn: String(keyword?.definition_en || '').trim(),
        definitionPl: String(keyword?.definition_pl || '').trim(),
        example: String(keyword?.example_en || keyword?.example_pl || '').trim(),
        exampleEn: String(keyword?.example_en || '').trim(),
        examplePl: String(keyword?.example_pl || '').trim(),
        ipa: String(keyword?.ipa || '').trim(),
        stressUK: String(keyword?.stressUK || '').trim(),
        stressUS: String(keyword?.stressUS || '').trim(),
        cefr_level: String(keyword?.cefr_level || lesson.level || '').trim() || 'C1',
        mastery_level: String(keyword?.mastery_level || 'In Progress').trim(),
        collocations: keyword?.collocations || null,
        synonyms: keyword?.synonyms || null,
        learnerNotes: keyword?.learnerNotes || null,
        topicContexts: keyword?.topic_contexts || null,
        searchText: [
          keyword?.word,
          keyword?.translation,
          keyword?.definition_en,
          keyword?.definition_pl,
          keyword?.example_en,
          lesson.title,
          lesson.topic,
          ...lessonTopics,
        ]
          .join(' ')
          .toLowerCase(),
      }
    }),
  )
}

function getAnalysisForLesson(lesson, analyses) {
  if (!lesson || !analyses?.length) return null

  const lessonDate = normalizeDateKey(lesson?.date)

  // Primary: date match (stable when dates are unique)
  const dateMatch = analyses.find((a) => normalizeDateKey(a?.date) === lessonDate)
  if (dateMatch) return dateMatch

  // Secondary: title substring match (fallback for date collisions or drift)
  const lessonTitle = String(lesson?.title || '').toLowerCase().trim()
  if (lessonTitle.length > 5) {
    const titleMatch = analyses.find((a) => {
      const summary = String(a?.lessonSummary || a?.lessonTitle || '').toLowerCase()
      return summary.includes(lessonTitle)
    })
    if (titleMatch) return titleMatch
  }

  return null
}

async function queryConvex(path, args) {
  // 30s AbortController-backed timeout — see practice-cache.ts.
  const response = await fetchWithTimeout(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`)
  }

  const payload = await response.json()
  if (payload?.status !== 'success') {
    throw new Error(`${path} returned ${payload?.status || 'unknown status'}`)
  }

  return payload.value
}

const initialProfile = {
  id: STUDENT_ID,
  firstName: STUDENT_FIRST_NAME,
  name: STUDENT_NAME,
  initials: STUDENT_INITIALS,
  slug: 'szymon-karpinski',
  level: STUDENT_LEVEL,
}

// Build a lessons.json-compatible shape from Convex queries for non-Szymon students
function buildLessonsFromConvex(convexLessons, convexKeywords) {
  const keywordsByLesson = {}
  for (const kw of convexKeywords || []) {
    const lid = String(kw.lessonId || '')
    if (!keywordsByLesson[lid]) keywordsByLesson[lid] = []
    keywordsByLesson[lid].push({
      word: kw.word,
      translation: kw.translation,
      definition_en: kw.definitionEn,
      definition_pl: kw.definitionPl,
      example_en: kw.exampleEn,
      example_pl: kw.examplePl,
      ipa: kw.ipa,
      stressUK: kw.stressUK,
      stressUS: kw.stressUS,
      topic: (kw.topics || [])[0],
      topics: kw.topics || [],
      collocations: kw.collocations,
      cefr_level: kw.difficulty,
    })
  }
  return (convexLessons || []).map(l => ({
    id: String(l._id),
    date: l.date,
    title: l.title,
    student: '',
    level: '',
    keywords: keywordsByLesson[String(l._id)] || [],
    keyword_count: (keywordsByLesson[String(l._id)] || []).length,
    conversation_notes: l.summary || '',
    topics: l.topics || [],
    summary: l.summary,
    status: l.status || '',
    lessonType: l.lessonType || '',
    duration: l.duration,
  }))
}

// Extract the next upcoming (status="planned") lesson, preferring lessons
// whose scheduled date+time is still in the future. Returns null if none.
function pickNextUpcomingLesson(lessons) {
  const now = Date.now()
  const candidates = (lessons || [])
    .filter((l) => l && l.status === 'planned' && l.date)
    .map((l) => {
      const summary = String(l.summary || '')
      const startTime = (summary.match(/Scheduled\s+(\d\d:\d\d)/i) || [])[1] || ''
      const meetingUrl = (summary.match(/https?:\/\/meet\.google\.com\/[a-z0-9-]+/i) || [])[0] || ''
      const [y, m, d] = String(l.date).split('-').map(Number)
      const [hh, mm] = (startTime || '00:00').split(':').map(Number)
      // Parse as Europe/Warsaw — CEST (UTC+2) Apr-Oct, CET (UTC+1) otherwise.
      // Approximation, matches Calendar.jsx logic.
      const offsetHours = m >= 4 && m <= 10 ? 2 : 1
      const startAtMs = Number.isFinite(y)
        ? Date.UTC(y, (m || 1) - 1, d || 1, (hh || 0) - offsetHours, mm || 0)
        : 0
      return { ...l, startTime, meetingUrl, startAtMs }
    })
    // Hide lessons that ended >60min ago — Calendar.jsx uses the same window.
    .filter((l) => !l.startAtMs || l.startAtMs + 60 * 60_000 > now)
    .sort((a, b) => (a.startAtMs || 0) - (b.startAtMs || 0))

  return candidates[0] || null
}

export default function useStudentData() {
  const params = useParams()
  const urlSlug = params.slug || 'szymon-karpinski'
  const [state, setState] = useState({
    loading: true,
    lessonsError: '',
    convexError: '',
    profile: initialProfile,
    lessons: [],
    keywords: [],
    analyses: [],
    convexLessonsById: {},
  })

  useEffect(() => {
    let cancelled = false

    async function loadStudentData() {
      setState((current) => ({
        ...current,
        loading: true,
        lessonsError: '',
        convexError: '',
      }))

      // First resolve student from slug
      let student = null
      try {
        student = await queryConvex('students:getStudentBySlug', { slug: urlSlug })
      } catch (err) {
        if (!cancelled) setState(s => ({ ...s, loading: false, convexError: `Student "${urlSlug}" not found.` }))
        return
      }
      if (!student) {
        if (!cancelled) setState(s => ({ ...s, loading: false, convexError: `Student "${urlSlug}" not found.` }))
        return
      }

      const studentId = String(student._id)

      const fetches = [
        queryConvex('students:listLessons', { studentId }),
        queryConvex('analytics:getStudentAnalyses', { studentId, limit: ANALYSES_LIMIT }),
        queryConvex('students:listKeywords', { studentId, limit: 2000 }),
      ]
      const [convexLessonsResult, analysesResult, keywordsResult] =
        await Promise.allSettled(fetches)
      const lessonsResult = convexLessonsResult

      if (cancelled) return

      const convexLessons = convexLessonsResult.status === 'fulfilled' ? convexLessonsResult.value : []
      const convexKeywords = keywordsResult.status === 'fulfilled' ? keywordsResult.value : []
      const lessonsPayload = buildLessonsFromConvex(convexLessons, convexKeywords)
      const convexLessonsById = normalizeConvexLessons(
        convexLessonsResult.status === 'fulfilled' ? convexLessonsResult.value : [],
      )
      const lessons = normalizeLessons(lessonsPayload)
      const analyses = normalizeAnalyses(
        analysesResult.status === 'fulfilled' ? analysesResult.value : [],
        convexLessonsById,
      )
      const mergedLessons = lessons.map((lesson) => ({
        ...lesson,
        analysis: getAnalysisForLesson(lesson, analyses),
      }))

      const profileFromStudent = {
        id: studentId,
        name: student.name || STUDENT_NAME,
        firstName: String(student.name || '').split(' ')[0] || STUDENT_FIRST_NAME,
        initials: String(student.name || '').split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || STUDENT_INITIALS,
        slug: student.slug || urlSlug,
        level: student.level || STUDENT_LEVEL,
        targetLevel: student.targetLevel,
      }

      setState({
        loading: false,
        lessonsError: lessonsResult.status === 'rejected' ? lessonsResult.reason?.message || 'Failed to load lessons.' : '',
        convexError:
          convexLessonsResult.status === 'rejected' || analysesResult.status === 'rejected'
            ? 'Convex progress data is unavailable right now.'
            : '',
        profile: profileFromStudent,
        lessons: mergedLessons,
        keywords: flattenKeywords(mergedLessons),
        analyses,
        convexLessonsById,
      })
    }

    loadStudentData()

    return () => {
      cancelled = true
    }
  }, [urlSlug])

  // Lessons-on-file count should reflect *completed* lessons only — planned
  // lessons are upcoming, not on file yet. lessonCountTotal is the raw size.
  const completedLessons = state.lessons.filter(l => (l.status || '') !== 'planned')
  const lessonCount = completedLessons.length
  const keywordCount = state.keywords.length
  const latestAnalysis = state.analyses[0] || null
  const averageScore = state.analyses.length
    ? Math.round(state.analyses.reduce((total, analysis) => total + Number(analysis?.overallScore || 0), 0) / state.analyses.length)
    : 0
  const upcomingLesson = pickNextUpcomingLesson(state.lessons)

  return {
    ...state,
    lessonCount,
    keywordCount,
    latestAnalysis,
    averageScore,
    upcomingLesson,
  }
}
