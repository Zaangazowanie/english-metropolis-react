import { useReveal } from './useReveal.js'

// Convenience wrapper: <Reveal style={...}>{(item) => ...}</Reveal>
export function Reveal({ stagger, cap, style, children, ...rest }) {
  const rv = useReveal({ stagger, cap })
  return (
    <div {...rest} {...rv.container} style={style}>
      {typeof children === 'function' ? children(rv.item) : children}
    </div>
  )
}

// One-off item for content that appears after a skeleton: fades in without
// layout shift. Pair with <Skeleton/> so loading -> loaded is a crossfade.
export function ContentIn({ className = '', ...rest }) {
  return <div className={`em-content-in ${className}`.trim()} {...rest}/>
}
