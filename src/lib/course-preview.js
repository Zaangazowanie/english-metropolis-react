import { fetchWithTimeout } from '../practice/lib/practice-cache'

export const COURSE_PREVIEW_PATH = '/api/console/student/next-lesson'

export async function fetchCoursePreview(sessionToken) {
  if (!sessionToken) return null
  const response = await fetchWithTimeout(COURSE_PREVIEW_PATH, {
    headers: { Authorization: `Bearer ${sessionToken}` }, cache: 'no-store',
  })
  if (!response.ok) throw new Error('Course preview unavailable')
  return (await response.json()).lesson || null
}
