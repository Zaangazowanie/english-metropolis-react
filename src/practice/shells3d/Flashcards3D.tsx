// Flashcards3D — "Café Spółdzielnia" (Flashcards district).
//
// A three.js re-skin of the canonical 2D Flashcards shell
// (src/practice/shells/Flashcards.tsx). The MECHANIC is unchanged: a deck of
// vocabulary cards; tap a card to flip it (EN front → PL + example back); then
// self-rate KNOWN or REVIEW. No right/wrong scoring — the player decides.
// REVIEW cards loop back later. Session ends when every card has been rated.
// correctCount = KNOWN count. Same puzzle in (ShellFlashcardsPuzzle {cards:[
// {en, pl, hue, ex, ex_pl}]}); same SessionResult out. Built on the GameKit.
//
// Scene: a dusk café corner. A cork board with paper notes set in amber lamp
// light; the active card floats in front of it — the readable English (word
// + translation + example) lives in the crisp DOM overlay, never baked into
// a 3D texture (contract rule 9). Bajla the café owl perches on the board.
//
// Contract: single CityStage canvas (DPR clamped, aria-hidden); all readable
// English in the DOM overlay; quality tiers + reducedMotion honoured; full
// keyboard (Space/Enter flip · K known · R review · → next · ← prev) + touch
// (≥44px); procedural geometry + basic materials only; no new deps.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color } from 'three'
import type { Mesh } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult } from './types'

// ── Palette ──────────────────────────────────────────────────────────────────
const CREAM = '#f6efe2'
const AMBER_SOFT = '#ffce86'
const GREEN = '#34D399'
const ROSE = '#FB7185'
const INK = '#1f0e3a'
const CORK = '#a07848'
const PAPER = '#efe3c6'

// ── Puzzle shape ──────────────────────────────────────────────────────────────
interface FCCard { en: string; pl: string; hue?: number; ex?: string; ex_pl?: string; exerciseId?: string }
interface FCPuzzle { cards: FCCard[] }

// ── Built-in demo — original café vocabulary ──────────────────────────────────
const DEMO: FCCard[] = [
  { en: 'morning',  pl: 'rano',     hue: 35,  ex: 'Good morning.',       ex_pl: 'Dzień dobry.' },
  { en: 'coffee',   pl: 'kawa',     hue: 25,  ex: 'A coffee, please.',   ex_pl: 'Poproszę kawę.' },
  { en: 'street',   pl: 'ulica',    hue: 280, ex: 'On the street.',      ex_pl: 'Na ulicy.' },
  { en: 'bridge',   pl: 'most',     hue: 200, ex: 'Across the bridge.',  ex_pl: 'Przez most.' },
  { en: 'evening',  pl: 'wieczór',  hue: 320, ex: 'A quiet evening.',    ex_pl: 'Spokojny wieczór.' },
  { en: 'window',   pl: 'okno',     hue: 60,  ex: 'Open the window.',    ex_pl: 'Otwórz okno.' },
]

type Rating = 'known' | 'review'

// ── Helpers ──────────────────────────────────────────────────────────────────
function usePrefersReducedMotion() {
  const [rm, setRm] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setRm(mq.matches)
    const h = () => setRm(mq.matches)
    mq.addEventListener?.('change', h)
    return () => mq.removeEventListener?.('change', h)
  }, [])
  return rm
}

const _col = new Color()

// ── 3D scene — the dusk café corner ───────────────────────────────────────────
function CafeScene({ cardHue, flipped, warmth, reducedMotion, bajlaVariant }: {
  cardHue: number; flipped: boolean; warmth: number; reducedMotion: boolean; bajlaVariant: 'idle' | 'celebrate'
}) {
  const { tier } = useStageQuality()
  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 10, 24]} />}
      {/* Floor */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshToonMaterial color="#2B5F6E" />
      </mesh>
      {/* Cork board on the back wall */}
      <mesh position={[0, 2.1, -2.2]} castShadow>
        <boxGeometry args={[3.6, 2.4, 0.12]} />
        <meshToonMaterial color={CORK} />
      </mesh>
      {/* Paper notes pinned to the cork (abstract decorative squares) */}
      {[[-0.9, 0.5], [0.7, 0.4], [-0.3, -0.4], [0.5, -0.5], [-0.7, -0.1]].map(([x, y], i) => (
        <mesh key={i} position={[x, 2.1 + y, -2.09]} rotation={[0, 0, ((i * 0.7) % 0.5) - 0.25]}>
          <boxGeometry args={[0.58, 0.42, 0.02]} />
          <meshToonMaterial color="#ddd5b8" />
        </mesh>
      ))}
      {/* Café counter */}
      <mesh position={[0, 0.6, -0.7]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 0.12, 0.9]} />
        <meshToonMaterial color="#3A2A1E" />
      </mesh>
      {/* Active flash card (floating in front of the board) */}
      <FlashCard3D hue={cardHue} flipped={flipped} reducedMotion={reducedMotion} />
      {/* Warm café lamp */}
      <group position={[-1.6, 0, -1.6]}>
        <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.04, 0.06, 2.8, 6]} /><meshToonMaterial color={palette.brass} /></mesh>
        <mesh position={[0, 2.85, 0]}><sphereGeometry args={[0.16, 10, 8]} /><meshBasicMaterial color={palette.lanternCore} transparent opacity={0.6 + warmth * 0.35} /></mesh>
      </group>
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.38} position={[1.55, 0.7, -0.35]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.03
    cam.position.set(0, 2.1 + bob, 5.6)
    cam.lookAt(0, 1.8, 0)
  })
  return null
}

// The 3D card in front of the board. Recolours based on the card's hue and
// whether it's flipped (shows the amber back vs. the hue-tinted front).
function FlashCard3D({ hue, flipped, reducedMotion }: { hue: number; flipped: boolean; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null!)
  useFrame((_, dt) => {
    if (!ref.current) return
    const mat = ref.current.material as unknown as { color: Color }
    const target = flipped ? PAPER : `hsl(${hue ?? 220},40%,80%)`
    _col.set(target)
    const k = reducedMotion ? 1 : Math.min(1, dt * 5)
    mat.color.lerp(_col, k)
  })
  return (
    <mesh ref={ref} position={[0, 2.05, -1.55]} castShadow>
      <boxGeometry args={[1.8, 1.2, 0.06]} />
      <meshBasicMaterial color={PAPER} />
    </mesh>
  )
}

// =========================================================================
// Flashcards3D — default export
// =========================================================================
export default function Flashcards3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const cards = useMemo<FCCard[]>(() => {
    const p = puzzle as FCPuzzle | undefined
    if (p && Array.isArray(p.cards) && p.cards.length > 0) return p.cards
    return DEMO
  }, [puzzle])
  const total = cards.length

  // ── State ───────────────────────────────────────────────────────────────────
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [ratings, setRatings] = useState<Record<number, Rating>>({})
  const [queue, setQueue] = useState<number[]>(() => cards.map((_, i) => i))  // indices to review
  const [live, setLive] = useState('')
  const fired = useRef(false)
  const startMs = useRef(performance.now())

  const rated = Object.keys(ratings).length
  const done = rated >= total

  const cur = cards[queue[idx] ?? 0] ?? cards[0]
  const curIdx = queue[idx] ?? 0

  // ── Session complete ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('Every card rated. The café is warm.')
    const knownCount = Object.values(ratings).filter((r) => r === 'known').length
    const r: SessionResult = {
      correctCount: knownCount,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'flashcards',
    }
    onSessionComplete?.(r)
  }, [done, ratings, total, onSessionComplete])

  const flip = useCallback(() => { setFlipped((f) => !f); setLive(flipped ? `English: ${cur?.en}` : `Polish: ${cur?.pl}`) }, [flipped, cur])

  const rate = useCallback((r: Rating) => {
    if (!flipped) { flip(); return }  // must flip first
    const ci = curIdx
    setRatings((prev) => ({ ...prev, [ci]: r }))
    setFlipped(false)
    setLive(r === 'known' ? `Known — "${cur?.en}"` : `Review — "${cur?.en}" will come back.`)
    // If REVIEW, keep card in the rotation at the back.
    setQueue((prev) => {
      const remaining = prev.filter((_, i) => i !== idx)
      return r === 'review' ? [...remaining, ci] : remaining
    })
    setIdx((i) => 0)  // always restart from top of updated queue
  }, [flipped, curIdx, cur, idx, flip])

  const next = useCallback(() => {
    setFlipped(false)
    setIdx((i) => Math.min(i + 1, queue.length - 1))
  }, [queue.length])

  const prev = useCallback(() => {
    setFlipped(false)
    setIdx((i) => Math.max(0, i - 1))
  }, [])

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return
      const k = e.key
      if (k === ' ' || k === 'Enter') { e.preventDefault(); flip(); return }
      if (k === 'ArrowRight') { e.preventDefault(); next(); return }
      if (k === 'ArrowLeft') { e.preventDefault(); prev(); return }
      if (k === 'k' || k === 'K') { e.preventDefault(); rate('known'); return }
      if (k === 'r' || k === 'R') { e.preventDefault(); rate('review'); return }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [done, flip, next, prev, rate])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    setIdx(0); setFlipped(false); setRatings({}); setQueue(cards.map((_, i) => i)); setLive('')
  }, [cards])

  const knownCount = useMemo(() => Object.values(ratings).filter((r) => r === 'known').length, [ratings])
  const warmth = total > 0 ? knownCount / total : 0
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : 'idle'
  const cardHue = cur?.hue ?? 220

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>Café Spółdzielnia</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: AMBER_SOFT }}>Flip and rate each card</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{knownCount}</span>
          <span style={{ opacity: 0.6 }}> known · </span>
          <span style={{ opacity: 0.6 }}>{queue.length - (flipped ? 0 : 0)} left</span>
        </div>
      </div>

      {!done && cur && (
        <div style={{ position: 'absolute', top: '14%', left: '50%', transform: 'translateX(-50%)', width: 'min(560px, 94vw)', textAlign: 'center', pointerEvents: 'auto' }}>
          {/* Flash card face (DOM) */}
          <button onClick={flip} aria-label={flipped ? `Back: ${cur.pl}. Tap to flip to English.` : `Front: ${cur.en}. Tap to flip to Polish.`}
            style={{
              width: '100%', minHeight: 170, borderRadius: 14, cursor: 'pointer',
              background: flipped
                ? 'rgba(239,227,198,0.94)'
                : `hsla(${cardHue},40%,68%,0.92)`,
              border: `3px solid ${flipped ? AMBER_SOFT : 'rgba(255,255,255,0.4)'}`,
              color: INK, fontFamily: 'Georgia, serif',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              touchAction: 'manipulation', marginBottom: 16,
              boxShadow: '0 8px 28px -10px rgba(0,0,0,0.45)',
              transition: 'background 240ms ease, border-color 240ms ease',
            }}>
            {!flipped ? (
              <>
                <div style={{ fontSize: 10, letterSpacing: '0.2em', opacity: 0.6, textTransform: 'uppercase' }}>English · tap to flip</div>
                <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '0.01em' }}>{cur.en}</div>
                {cur.ex && <div style={{ fontSize: 13, fontStyle: 'italic', opacity: 0.7, marginTop: 2 }}>"{cur.ex}"</div>}
              </>
            ) : (
              <>
                <div style={{ fontSize: 10, letterSpacing: '0.2em', opacity: 0.6, textTransform: 'uppercase' }}>Polish · po polsku</div>
                <div style={{ fontSize: 26, fontWeight: 700 }}>{cur.pl}</div>
                {cur.ex_pl && <div style={{ fontSize: 13, fontStyle: 'italic', opacity: 0.7, marginTop: 2 }}>"{cur.ex_pl}"</div>}
                {/* Self-rating — shown only after flip */}
                <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                  <button onClick={(e) => { e.stopPropagation(); rate('known') }}
                    aria-label="Known (K)"
                    style={rateBtn(GREEN)}>✓ KNOWN · ZNAM (K)</button>
                  <button onClick={(e) => { e.stopPropagation(); rate('review') }}
                    aria-label="Review (R)"
                    style={rateBtn(ROSE)}>↺ REVIEW · POWTÓRZĘ (R)</button>
                </div>
              </>
            )}
          </button>

          {/* Card counter + navigation */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
            <button onClick={prev} disabled={idx === 0} style={navBtn(idx === 0)}>←</button>
            <span style={{ fontSize: 11, opacity: 0.6 }}>
              {idx + 1} / {queue.length}
              {Object.values(ratings).some((r) => r === 'review') && <> · <span style={{ color: ROSE }}>↺ {Object.values(ratings).filter((r) => r === 'review').length}</span> in review</>}
            </span>
            <button onClick={next} disabled={idx >= queue.length - 1} style={navBtn(idx >= queue.length - 1)}>→</button>
          </div>
        </div>
      )}

      {/* Footer hint */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, textAlign: 'right', pointerEvents: 'none' }}>
          <span style={{ fontSize: 10, opacity: 0.45 }}>Space flip · K known · R review · ← → navigate</span>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Flashcard deck complete" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 28, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The deck is through.</div>
          <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            Every card rated.<br />
            <strong style={{ color: GREEN }}>{knownCount}</strong> / {total} marked KNOWN.
          </div>
          <button onClick={reset} style={nextBtn}>Deal again →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="Flashcards — flip each card and self-rate Known or Review"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 2.1, 5.6]} cameraFov={50} overlay={overlay}>
        <CafeScene
          cardHue={cardHue}
          flipped={flipped}
          warmth={warmth}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
        />
      </CityStage>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
function rateBtn(col: string): React.CSSProperties {
  return {
    minHeight: 44, padding: '9px 16px', borderRadius: 9,
    background: `${col}22`, border: `2px solid ${col}`, color: INK,
    fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', cursor: 'pointer', touchAction: 'manipulation',
  }
}
function navBtn(disabled: boolean): React.CSSProperties {
  return {
    minHeight: 40, minWidth: 40, padding: '8px', borderRadius: 8,
    background: 'rgba(255,206,134,0.12)', border: `1px solid ${AMBER_SOFT}44`,
    color: disabled ? `${AMBER_SOFT}44` : AMBER_SOFT, fontSize: 16, cursor: disabled ? 'default' : 'pointer', touchAction: 'manipulation',
  }
}
const nextBtn: React.CSSProperties = {
  minHeight: 44, padding: '10px 22px', borderRadius: 9, background: AMBER_SOFT,
  color: INK, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', touchAction: 'manipulation',
}
