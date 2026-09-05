// Keep an already-open student app current without overlapping requests. The
// owner supplies one complete read, so a later student's controller can never
// receive a result from an earlier student's request.
export function createStudentDataRefresh({
  load,
  onData,
  onError,
  windowTarget = window,
  documentTarget = document,
  schedule = setInterval,
  unschedule = clearInterval,
  now = Date.now,
  intervalMs = 60_000,
}) {
  let disposed = false
  let inFlight = null
  let lastStartedAt = -Infinity

  function refresh() {
    if (disposed) return Promise.resolve()
    if (inFlight) return inFlight
    lastStartedAt = now()
    inFlight = Promise.resolve().then(load)
      .then(data => { if (!disposed) onData(data) })
      .catch(error => { if (!disposed) onError(error) })
      .finally(() => { inFlight = null })
    return inFlight
  }

  function refreshWhenVisible() {
    // focus and visibilitychange commonly fire together. Avoid a second read
    // when the first happened to finish between those two events.
    if (!documentTarget.hidden && now() - lastStartedAt >= 15_000) refresh()
  }

  windowTarget.addEventListener('focus', refreshWhenVisible)
  documentTarget.addEventListener('visibilitychange', refreshWhenVisible)
  const timer = schedule(refreshWhenVisible, intervalMs)
  refresh()

  return {
    refresh,
    dispose() {
      disposed = true
      unschedule(timer)
      windowTarget.removeEventListener('focus', refreshWhenVisible)
      documentTarget.removeEventListener('visibilitychange', refreshWhenVisible)
    },
  }
}

// A failed refresh must not turn a previously loaded archive into an empty one.
// A successful empty result is authoritative and must still replace old data.
export function refreshedValue(result, previous) {
  return result.status === 'fulfilled' ? result.value : previous
}
