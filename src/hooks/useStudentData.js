import { useEffect, useState } from 'react'
import {
  ANALYSES_LIMIT,
  CONVEX_URL,
  STUDENT_FIRST_NAME,
  STUDENT_ID,
  STUDENT_INITIALS,
  STUDENT_LEVEL,
  STUDENT_NAME,
} from '../data/studentConfig.js'

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

  return payload
    .map((lesson, index) => {
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
  return lessons.flatMap((lesson) =>
    lesson.keywords.map((keyword, keywordIndex) => {
      const lessonTopics = uniqueList([
        formatTopic(keyword?.topic),
        ...lesson.topics,
      ])

      return {
        id: `${lesson.id}-${keywordIndex}-${String(keyword?.word || 'keyword').toLowerCase()}`,
        lessonId: lesson.id,
        lessonDate: lesson.date,
        lessonTitle: lesson.title,
        lessonTopic: lesson.topic,
        topics: lessonTopics,
        word: String(keyword?.word || '').trim(),
        translation: String(keyword?.translation || '').trim(),
        definition: String(keyword?.definition_en || keyword?.definition_pl || '').trim(),
        definitionPl: String(keyword?.definition_pl || '').trim(),
        example: String(keyword?.example_en || keyword?.example_pl || '').trim(),
        ipa: String(keyword?.ipa || '').trim(),
        cefr_level: String(keyword?.cefr_level || lesson.level || '').trim() || 'C1',
        mastery_level: String(keyword?.mastery_level || 'In Progress').trim(),
        collocations: keyword?.collocations || null,
        searchText: [
          keyword?.word,
          keyword?.translation,
          keyword?.definition_en,
          keyword?.definition_pl,
          keyword?.example_en,
          lesson.title,
          lesson.topic,
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
  const response = await fetch(`${CONVEX_URL}/api/query`, {
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
  level: STUDENT_LEVEL,
}

export default function useStudentData() {
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

      const [lessonsResult, convexLessonsResult, analysesResult] = await Promise.allSettled([
        fetch('/lessons.json').then(async (response) => {
          if (!response.ok) {
            throw new Error(`lessons.json failed with ${response.status}`)
          }
          return response.json()
        }),
        queryConvex('students:listLessons', { studentId: STUDENT_ID }),
        queryConvex('analytics:getStudentAnalyses', { studentId: STUDENT_ID, limit: ANALYSES_LIMIT }),
      ])

      if (cancelled) return

      const lessonsPayload = lessonsResult.status === 'fulfilled' ? lessonsResult.value : []
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

      setState({
        loading: false,
        lessonsError: lessonsResult.status === 'rejected' ? lessonsResult.reason?.message || 'Failed to load lessons.' : '',
        convexError:
          convexLessonsResult.status === 'rejected' || analysesResult.status === 'rejected'
            ? 'Convex progress data is unavailable right now.'
            : '',
        profile: initialProfile,
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
  }, [])

  const lessonCount = state.lessons.length
  const keywordCount = state.keywords.length
  const latestAnalysis = state.analyses[0] || null
  const averageScore = state.analyses.length
    ? Math.round(state.analyses.reduce((total, analysis) => total + Number(analysis?.overallScore || 0), 0) / state.analyses.length)
    : 0

  return {
    ...state,
    lessonCount,
    keywordCount,
    latestAnalysis,
    averageScore,
  }
}
