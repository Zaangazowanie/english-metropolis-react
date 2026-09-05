import test from 'node:test'
import assert from 'node:assert/strict'
import { readStudentSession, getStudentSessionToken, STUDENT_VIEW_KEY } from '../src/lib/student-session.js'

function windowFor(path, view) {
  const original = JSON.stringify({ slug: 'ordinary-student', sessionToken: 'ordinary-token' })
  globalThis.window = {
    location: { pathname: path },
    localStorage: { getItem: () => original },
    sessionStorage: { getItem: key => key === STUDENT_VIEW_KEY ? view : null },
  }
}
test('student view reads only its selected tab session and leaves the ordinary login intact', () => {
  const view = JSON.stringify({ student: { slug: 'ines-smolkowska' }, sessionToken: 'view-token', expiresAt: Date.now() + 10000 })
  windowFor('/admin/student-view/ines-smolkowska/lessons', view)
  assert.equal(getStudentSessionToken(), 'view-token')
  assert.equal(readStudentSession().slug, 'ines-smolkowska')
  window.location.pathname = '/app/ordinary-student/lessons'
  assert.equal(getStudentSessionToken(), 'ordinary-token')
})
test('expired, mismatched, malformed and absent views never inherit a different student login', () => {
  for (const view of [null, '{invalid', JSON.stringify({student: {slug:'other'},sessionToken:'wrong',expiresAt:Date.now()+10000}),
    JSON.stringify({student:{slug:'ines-smolkowska'},sessionToken:'expired',expiresAt:Date.now()-1}),
    JSON.stringify({student:{slug:'ines-smolkowska'},sessionToken:'no-expiry'})]) {
    windowFor('/admin/student-view/ines-smolkowska/lessons', view)
    assert.equal(readStudentSession(), null)
  }
})
