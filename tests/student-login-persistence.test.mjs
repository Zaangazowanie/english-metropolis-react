import test from 'node:test'
import assert from 'node:assert/strict'
import { saveStudentLogin, getStudentSessionToken } from '../src/lib/student-session.js'

test('password/Google login token is readable immediately, before React effects or navigation', () => {
  const data = new Map()
  globalThis.window = { location: { pathname: '/login' }, localStorage: {
    setItem: (key, value) => data.set(key, value), getItem: key => data.get(key),
  } }
  for (const sessionToken of ['password-session', 'google-session']) {
    const user = saveStudentLogin({student: {slug: 'learner'}, sessionToken})
    assert.equal(user.sessionToken, sessionToken)
    assert.equal(getStudentSessionToken(), sessionToken)
    window.location.pathname = '/app/learner/calendar'
    assert.equal(getStudentSessionToken(), sessionToken)
  }
})
test('storage failure blocks login success instead of navigating without a session', () => {
  globalThis.window = { localStorage: { setItem() { throw new Error('Storage unavailable') } } }
  assert.throws(() => saveStudentLogin({student: {slug: 'learner'}, sessionToken: 'token'}), /Storage unavailable/)
})
test('malformed successful responses never overwrite an existing login', () => {
  globalThis.window = { localStorage: { setItem() { assert.fail('must not write') } } }
  for (const value of [null, {}, {student: {slug: 'learner'}}, {sessionToken: 'token'}]) {
    assert.throws(() => saveStudentLogin(value), /student session/)
  }
})
