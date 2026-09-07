// Full-screen arcade overlay for the landing catalogue. Lazy: it pulls the
// ArcadeCabinet and the practice stylesheets (~80 KB of CSS), which the
// landing page must not pay for until a game is opened.
import { Suspense, lazy, useEffect, useRef, useState, Component } from 'react'
import { FONT } from '../../design/v3/tokens.js'
import { ArcadeCabinet } from '../../practice/components/ArcadeCabinet'
import '../../practice/styles/system.css'
import '../../practice/styles/global.css'
import '../../practice/styles/arcade.css'
import ActionLink from './ActionLink.jsx'

// The arcade overlay keeps a dark surround for its saturated game materials
// in both site themes.
const DUSK = {
  bg: 'rgba(5, 3, 9, 0.96)',
  text: '#F5F0FA',
  dim: 'rgba(228, 218, 244, 0.62)',
  mute: 'rgba(228, 218, 244, 0.38)',
  line: 'rgba(255,255,255,0.09)',
  pink: '#D946EF',
  amber: '#FFB347',
  emerald: '#34D399',
}

// ── Error boundary around lazy-loaded shells ───────────────────────────────
class ShellBoundary extends Component {
  constructor(props) { super(props); this.state = { broken: false } }
  static getDerivedStateFromError() { return { broken: true } }
  componentDidCatch(err) { console.error('[GameHome shell crashed]', err) }
  render() {
    if (this.state.broken) {
      return (
        <div style={{ padding: 48, textAlign: 'center', color: DUSK.dim, fontFamily: FONT.body }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🛠️</div>
          This station is under maintenance - pick another game.
        </div>
      )
    }
    return this.props.children
  }
}

// ── Full-screen play overlay (kept from v1 — games are dusk-native) ────────
export default function PlayOverlay({ game, games, onClose }) {
  const [LazyShell] = useState(() => lazy(game.load))
  const [doneOnce, setDoneOnce] = useState(false)
  const [showCta, setShowCta] = useState(false)
  const canonicalGame = games.find((entry) => entry.key === (game.key || game.shellKey))
  const finishGame = () => { if (!doneOnce) { setDoneOnce(true); setShowCta(true) } }
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const previousFocusRef = useRef(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    previousFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    const siblingState = [...dialog.parentElement.children]
      .filter((element) => element !== dialog)
      .map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }))
    siblingState.forEach(({ element }) => {
      element.inert = true
      element.setAttribute('aria-hidden', 'true')
    })

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...dialog.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.getClientRects().length > 0)
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus())
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      siblingState.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert
        if (ariaHidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', ariaHidden)
      })
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
    }
  }, [onClose])

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Playing ${game.title}`}
      tabIndex={-1} className="gh-play-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column',
        background: DUSK.bg, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: `1px solid ${DUSK.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: game.color || DUSK.pink, flex: 'none' }}/>
          <div style={{ fontFamily: FONT.display, fontWeight: 700, color: DUSK.text, fontSize: 16,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {game.title}
            <span style={{ color: DUSK.mute, fontWeight: 400, fontSize: 13, marginLeft: 10 }}>{game.venue || game.district}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={() => setShowCta(true)}
            aria-label="Fullscreen (free account)"
            style={{ background: 'transparent', border: `1px solid ${DUSK.line}`, color: DUSK.dim,
              borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>fullscreen</span>
          </button>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close game"
            style={{ background: 'transparent', border: `1px solid ${DUSK.line}`, color: DUSK.dim,
              borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <ShellBoundary>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
              color: DUSK.dim, fontFamily: FONT.mono, fontSize: 13, letterSpacing: '0.2em' }}>
              NEXT TRAIN APPROACHING…
            </div>
          }>
            {canonicalGame ? (
              <div className="em-practice-root" style={{ minHeight: 0, padding: '16px', maxWidth: 1440, margin: '0 auto', boxSizing: 'border-box' }}>
                <ArcadeCabinet title={game.title} accent={game.color || DUSK.pink}
                  number={games.indexOf(canonicalGame) + 1} shellId={canonicalGame.key}
                  onRequestFullscreen={() => setShowCta(true)}>
                  <div className="em-shell-host"><LazyShell onSessionComplete={finishGame}/></div>
                </ArcadeCabinet>
              </div>
            ) : <LazyShell onSessionComplete={finishGame}/>}
          </Suspense>
        </ShellBoundary>

        {showCta && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(5,3,9,0.82)', backdropFilter: 'blur(6px)', padding: 24 }}>
            <div className="gh-rise gh-overlay-card" style={{ maxWidth: 440, width: '100%', textAlign: 'center',
              background: 'linear-gradient(180deg, rgba(30,20,60,0.92) 0%, rgba(15,10,35,0.92) 100%)',
              border: '1px solid rgba(217,70,239,0.35)', borderRadius: 20, padding: '36px 32px',
              boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 60px -20px rgba(217,70,239,0.3)' }}>
              <img src="/brand/em-bajla-icon.webp" alt="" width="72" height="72" style={{ objectFit: 'cover', borderRadius: 16, marginBottom: 10 }}/>
              <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 24, color: DUSK.text, marginBottom: 10 }}>
                {doneOnce ? 'Round complete.' : 'Go full screen?'}
              </div>
              <p style={{ color: DUSK.dim, fontSize: 14, lineHeight: 1.6, margin: '0 0 22px' }}>
                {doneOnce
                  ? 'Create a free account to save your progress, build a streak, and unlock every district of the city.'
                  : 'Full-screen play comes with a free account, along with saved progress and streaks.'}
              </p>
              <ActionLink to="/signup" variant="primary" size="lg" full trailingIcon="arrow_forward">
                Create free account
              </ActionLink>
              <button type="button" onClick={() => setShowCta(false)}
                style={{ marginTop: 14, background: 'transparent', border: 'none', color: DUSK.mute,
                  fontSize: 13, cursor: 'pointer', letterSpacing: '0.06em' }}>
                Keep playing
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
