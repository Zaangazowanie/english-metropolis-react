import assert from 'node:assert/strict'
import test from 'node:test'
import { createStudentDataRefresh, refreshedValue } from '../src/hooks/studentDataRefresh.js'

function environment() {
  const windowTarget = new EventTarget()
  const documentTarget = new EventTarget()
  documentTarget.hidden = false
  let clock = 0
  let tick
  let cleared = false
  return {
    options: {
      windowTarget, documentTarget,
      now: () => clock,
      schedule: callback => { tick = callback; return 1 },
      unschedule: () => { cleared = true },
    },
    advance: () => { clock += 60_000 },
    tick: () => tick(),
    get cleared() { return cleared },
    windowTarget, documentTarget,
  }
}

test('a student app left open picks up a newly published lesson on return, without a reload', async () => {
  const env = environment()
  let published = [{ date: '2026-08-26', status: 'completed' }]
  let displayed = []
  let reads = 0
  const controller = createStudentDataRefresh({ ...env.options,
    load: async () => { reads++; return [...published] },
    onData: lessons => { displayed = lessons },
    onError: error => assert.fail(error),
  })
  await controller.refresh()
  assert.equal(displayed.length, 1)

  // Publication happens while this existing tab is in the background.
  env.documentTarget.hidden = true
  published.push({ date: '2026-09-02', status: 'completed' })
  env.advance()
  env.tick()
  await Promise.resolve()
  assert.equal(reads, 1, 'hidden tabs must not poll')
  env.documentTarget.hidden = false
  env.documentTarget.dispatchEvent(new Event('visibilitychange'))
  env.windowTarget.dispatchEvent(new Event('focus'))
  await controller.refresh()
  assert.deepEqual(displayed.map(lesson => lesson.date), ['2026-08-26', '2026-09-02'])
  assert.equal(reads, 2, 'focus and visibility must share a request')
  controller.dispose()
})

test('visible polling and route/manual refresh recover data after a transient failure', async () => {
  const env = environment()
  let displayed = []
  let nextResult = { status: 'fulfilled', value: ['first lesson'] }
  const controller = createStudentDataRefresh({ ...env.options,
    load: async () => nextResult,
    onData: result => { displayed = refreshedValue(result, displayed) },
    onError: error => assert.fail(error),
  })
  await controller.refresh()
  nextResult = { status: 'rejected', reason: new Error('temporary network outage') }
  env.advance()
  env.tick()
  await controller.refresh()
  assert.deepEqual(displayed, ['first lesson'], 'failed reads must keep previously loaded materials')

  nextResult = { status: 'fulfilled', value: ['first lesson', 'new lesson'] }
  await controller.refresh() // the callback used by route navigation / Retry
  assert.deepEqual(displayed, ['first lesson', 'new lesson'])
  nextResult = { status: 'fulfilled', value: [] }
  await controller.refresh()
  assert.deepEqual(displayed, [], 'an authoritative empty result must replace old data')
  controller.dispose()
})

test('changing students discards the old request and removes its refresh listeners', async () => {
  const env = environment()
  let resolveOld
  let reads = 0
  const displayed = []
  const old = createStudentDataRefresh({ ...env.options,
    load: () => { reads++; return new Promise(resolve => { resolveOld = resolve }) },
    onData: value => displayed.push(value),
    onError: error => assert.fail(error),
  })
  const pending = old.refresh()
  await Promise.resolve()
  old.dispose()
  assert.equal(env.cleared, true)
  resolveOld('Ines private materials')
  await pending
  env.advance()
  env.windowTarget.dispatchEvent(new Event('focus'))
  env.documentTarget.dispatchEvent(new Event('visibilitychange'))
  await old.refresh()
  assert.deepEqual(displayed, [], 'a response from the previous student must not be applied')
  assert.equal(reads, 1)
})

test('failed student lookup is reported and a later refresh can recover', async () => {
  const env = environment()
  let unavailable = true
  let shown = 'previous lesson'
  const errors = []
  const controller = createStudentDataRefresh({ ...env.options,
    load: async () => { if (unavailable) throw new Error('offline'); return 'current lesson' },
    onData: value => { shown = value },
    onError: error => errors.push(error.message),
  })
  await controller.refresh()
  assert.equal(shown, 'previous lesson')
  assert.deepEqual(errors, ['offline'])
  unavailable = false
  await controller.refresh()
  assert.equal(shown, 'current lesson')
  controller.dispose()
})
