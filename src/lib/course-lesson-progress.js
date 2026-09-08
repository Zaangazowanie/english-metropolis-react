// Match scheduling.reconcilePastBookings: an elapsed, uncancelled booking is
// taught even before the background reconciliation marks it completed.
export function courseLessonProgress(booking, now = Date.now()) {
  if (!booking || !['scheduled', 'completed'].includes(booking.status)) {
    return { label: 'Not scheduled', icon: 'event_busy', tone: 'queued' }
  }
  if (booking.status === 'completed' || (Number.isFinite(booking.endUtc) && booking.endUtc < now)) {
    return { label: 'Taught', icon: 'check_circle', tone: 'committed' }
  }
  if (Number.isFinite(booking.startUtc) && booking.startUtc <= now) {
    return { label: 'In progress', icon: 'play_circle', tone: 'processing' }
  }
  return { label: 'Scheduled', icon: 'event', tone: 'processing' }
}
