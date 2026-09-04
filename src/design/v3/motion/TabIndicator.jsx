import { useTabInk } from './useTabInk.js'

export function TabInk({ navRef, activeKey, background, boxShadow }) {
  const ink = useTabInk(navRef, activeKey)
  return (
    <span aria-hidden className="em-tab-ink" data-ready={ink.ready ? '1' : '0'}
      style={{ ...ink.style, background, boxShadow, zIndex: 0 }}/>
  )
}
