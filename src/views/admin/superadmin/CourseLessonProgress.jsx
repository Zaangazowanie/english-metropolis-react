import { courseLessonProgress } from '../../../lib/course-lesson-progress.js'

export default function CourseLessonProgress({ booking, loading = false, error = false }) {
  const progress = loading
    ? { label: 'Loading status…', icon: 'hourglass_top', tone: 'queued' }
    : error
      ? { label: 'Status unavailable', icon: 'error_outline', tone: 'awaiting_review' }
      : courseLessonProgress(booking)
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-2 sm:w-60" aria-live="polite">
      <span className={`sa-badge sa-badge-${progress.tone}`}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 14 }}>{progress.icon}</span>
        {progress.label}
      </span>
      {!loading && !error && booking && (
        <span className="text-xs font-medium" style={{ color: 'var(--sa-text)' }}>
          {booking.dateWarsaw}{booking.timeWarsaw ? ` · ${booking.timeWarsaw}` : ''}
        </span>
      )}
    </span>
  )
}
