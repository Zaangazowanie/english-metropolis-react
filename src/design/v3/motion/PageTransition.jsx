import { useState } from 'react'

// <PageTransition routeKey> — fades + rises the page on tab change. The very
// first mount renders without animation so content is never delayed on first
// paint; only later route changes animate (300ms, enter-only, the old page
// leaves instantly so navigation is never slower than the router).
export function PageTransition({ routeKey, children, style }) {
  const [initialKey] = useState(routeKey)
  const animate = routeKey !== initialKey
  return (
    <div key={routeKey} className={animate ? 'em-page-enter' : undefined} style={style}>
      {children}
    </div>
  )
}
