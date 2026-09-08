import test from 'node:test'
import assert from 'node:assert/strict'
import { requireBookingSession, bookingLoginPath, STUDENT_SESSION_REQUIRED } from '../src/lib/booking-session.js'
import { hasStudentSession, clearStudentLogin, getStudentSessionToken } from '../src/lib/student-session.js'

test('legacy and tokenless profiles do not auto-redirect away from login', () => {
  for (const user of [null, {}, { slug: 'learner' }, { slug: 'learner', sessionToken: '' }, { slug: 'learner', sessionToken: ' ' }]) {
    assert.equal(hasStudentSession(user), false)
  }
  assert.equal(hasStudentSession({ slug: 'learner', sessionToken: 'live-token' }), true)
})

test('missing token takes the sign-in path without querying availability', async () => {
  await assert.rejects(requireBookingSession(() => assert.fail('no request expected'), null, 'student'), new RegExp(STUDENT_SESSION_REQUIRED))
})

test('expired, revoked, and another student session require signing in', async () => {
  for (const result of [null, { _id: 'different-student' }]) {
    await assert.rejects(requireBookingSession(async (kind, path, args) => {
      assert.equal(kind, 'query')
      assert.equal(path, 'studentAuth:resolveStudentSession')
      assert.deepEqual(args, { sessionToken: 'saved-token' })
      return result
    }, 'saved-token', 'student'), new RegExp(STUDENT_SESSION_REQUIRED))
  }
})

test('a live student session proceeds and network failures stay retryable', async () => {
  assert.deepEqual(await requireBookingSession(async () => ({ _id: 'student' }), 'token', 'student'), { _id: 'student' })
  await assert.rejects(requireBookingSession(async () => { throw new Error('Network unavailable') }, 'token', 'student'), /Network unavailable/)
})

test('sign-in recovery clears the token before navigation and preserves the calendar link', () => {
  const data = new Map([['em-student-session', JSON.stringify({ slug: 'learner', sessionToken: 'expired' })], ['studentSlug', 'learner'], ['em.lang.v2', 'pl']])
  globalThis.window = { location: { pathname: '/app/learner/calendar', search: '?month=2026-09', hash: '#lesson-booking' }, localStorage: {
    getItem: key => data.get(key), removeItem: key => data.delete(key),
  } }
  const path = bookingLoginPath(window.location)
  clearStudentLogin()
  assert.equal(getStudentSessionToken(), null)
  assert.equal(data.has('studentSlug'), false)
  assert.equal(data.get('em.lang.v2'), 'pl')
  assert.equal(new URL(path, 'https://englishmetro.com').searchParams.get('next'), '/app/learner/calendar?month=2026-09#lesson-booking')
})
