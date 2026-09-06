import { useEffect, useId, useRef, useState } from 'react'

// Traced from em-skyline-outline.png. Native geometry keeps the original brand
// contour crisp on phones and lets the highlight follow the line as it draws.
const CONTOUR = 'M0 401 L32 401 L34 408 L67 408 L69 418 L87 418 L88 476 L105 479 L106 505 L131 505 L134 461 L157 461 L159 448 L192 447 L192 340 L202 339 L204 337 L204 299 L207 298 L218 300 L291 315 L300 318 L300 472 L314 473 L316 471 L317 424 L334 423 L336 419 L336 338 L368 336 L369 301 L375 300 L377 293 L397 293 L399 299 L404 300 L406 288 L408 300 L411 299 L411 291 L414 290 L416 300 L419 300 L421 296 L426 296 L428 300 L434 300 L436 302 L438 335 L467 336 L467 427 L482 430 L482 475 L484 478 L496 477 L497 381 L494 164 L502 163 L502 151 L504 148 L516 148 L518 146 L530 102 L531 2 L533 0 L540 0 L539 101 L553 146 L567 147 L568 161 L583 163 L581 371 L585 373 L597 373 L599 375 L600 448 L651 447 L665 445 L666 333 L681 332 L686 310 L692 300 L700 292 L711 286 L726 285 L736 289 L747 299 L754 312 L757 330 L767 333 L769 481 L787 482 L787 336 L789 334 L796 334 L796 255 L798 253 L807 253 L809 245 L831 244 L834 249 L837 249 L839 235 L841 236 L841 245 L845 247 L850 246 L851 238 L855 239 L857 244 L872 241 L877 242 L875 388 L889 389 L892 391 L889 429 L890 453 L932 453 L934 451 L933 361 L954 360 L956 327 L960 326 L962 322 L973 323 L979 327 L981 314 L984 316 L985 327 L988 327 L991 323 L994 328 L999 329 L999 445 L1022 445 L1021 304 L1029 303 L1031 300 L1047 257 L1048 238 L1054 216 L1057 217 L1057 232 L1062 250 L1063 263 L1073 299 L1075 302 L1082 301 L1090 303 L1090 476 L1096 475 L1097 404 L1102 403 L1103 400 L1107 398 L1121 398 L1121 402 L1126 403 L1128 387 L1131 388 L1132 404 L1136 404 L1138 398 L1144 398'
export default function HeroSilhouette({ reduced = false }) {
  const id = `hero-contour-${useId().replaceAll(':', '')}`
  const host = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.15 })
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={host} className={`gh-hero-silhouette${reduced ? ' gh-hero-silhouette--still' : ''}`}
      data-visible={visible} aria-hidden="true">
      <svg viewBox="-20 -20 1185 585" focusable="false">
        <defs>
          <linearGradient id={`${id}-metal`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="505">
            <stop offset="0" stopColor="var(--gh-contour-high)"/>
            <stop offset=".42" stopColor="var(--gh-contour-mid)"/>
            <stop offset=".5" stopColor="var(--gh-contour-high)"/>
            <stop offset=".58" stopColor="var(--gh-contour-low)"/>
            <stop offset="1" stopColor="var(--gh-contour-mid)"/>
          </linearGradient>
        </defs>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path className="gh-silhouette-reflection" d={CONTOUR} stroke={`url(#${id}-metal)`} strokeWidth="9"
            transform="translate(0 540.35) scale(1 -.07)"/>
          <path className="gh-silhouette-ink" d={CONTOUR} stroke="var(--gh-contour-base)" strokeWidth="2.8"
            vectorEffect="non-scaling-stroke"/>
          <path className="gh-silhouette-draw" d={CONTOUR} pathLength="1000" stroke={`url(#${id}-metal)`} strokeWidth="2.8"
            vectorEffect="non-scaling-stroke"/>
          <path className="gh-silhouette-gloss" d={CONTOUR} pathLength="1000" stroke="var(--gh-contour-gloss)" strokeWidth="3.6"
            vectorEffect="non-scaling-stroke"/>
        </g>
      </svg>
    </div>
  )
}
