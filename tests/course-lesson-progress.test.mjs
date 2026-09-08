import test from 'node:test'
import assert from 'node:assert/strict'
import { courseLessonProgress } from '../src/lib/course-lesson-progress.js'

const now = Date.UTC(2026, 8, 8, 12)
test('completed and elapsed scheduled bookings are taught', () => {
  assert.equal(courseLessonProgress({ status: 'completed' }, now).label, 'Taught')
  assert.equal(courseLessonProgress({ status: 'scheduled', endUtc: now - 1 }, now).label, 'Taught')
})
test('future and active bookings remain distinct from taught lessons', () => {
  assert.equal(courseLessonProgress({ status: 'scheduled', startUtc: now + 1, endUtc: now + 3600000 }, now).label, 'Scheduled')
  assert.equal(courseLessonProgress({ status: 'scheduled', startUtc: now - 1, endUtc: now + 1 }, now).label, 'In progress')
})
test('missing, cancelled and missed bookings never imply a lesson was taught', () => {
  for (const status of ['cancelled', 'no_show', 'late_cancelled', 'planned']) {
    assert.equal(courseLessonProgress({ status, endUtc: now - 1 }, now).label, 'Not scheduled')
  }
  assert.equal(courseLessonProgress(undefined, now).label, 'Not scheduled')
})
test('missing end times do not imply completion', () => {
  for (const endUtc of [undefined, null, NaN]) {
    assert.notEqual(courseLessonProgress({ status: 'scheduled', endUtc }, now).label, 'Taught')
  }
})
