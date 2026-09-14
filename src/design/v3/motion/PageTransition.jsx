import { useState } from 'react'

// <PageTransition routeKey> — fades + rises the page on tab change. The very
// first mount renders without animation so content is never delayed on first
// paint; only later route changes animate (250ms, enter-only, the old page
// leaves instantly so navigation is never slower than the router).
export function PageTransition({ routeKey, children, style }) {
  const [previousKey, setPreviousKey] = useState(routeKey)
  const [animate, setAnimate] = useState(false)
  if (routeKey !== previousKey) {
    setPreviousKey(routeKey)
    setAnimate(true)
  }
  return (
    <div key={routeKey} className={animate ? 'em-page-enter' : undefined} style={style}>
      {children}
    </div>
  )
}
