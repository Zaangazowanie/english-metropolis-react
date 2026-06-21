// Concentration3D — "The Memory Cellar" (Concentration district).
//
// A three.js re-skin of the canonical 2D Concentration shell
// (src/practice/shells/Concentration.tsx). The MECHANIC is unchanged: N
// prompt-answer pairs are dealt face-down on the cellar table (2N cards total);
// the player flips two at a time looking for a PROMPT ↔ ANSWER match; a wrong
// flip shows both cards for ~1.3 s then flips them back; a match locks both
// cards face-up in green. All N pairs matched → session complete. Hint briefly
// previews one face-down card; skip costs an attempt pair. Same puzzle in
// (WrapperPuzzle.rounds → {prompt, options, answerIndex, hint, hint_pl});
// same SessionResult out. Built on the GameKit.
//
// Scene: a dusk stone cellar. A wood card-table with a warm amber oil lamp
// and a grid of felt-backed card tiles that recolour per state — but all card
// text lives in the crisp DOM overlay, never baked into a texture (rule 9).
// Bajla the memory-keeper perches on the table.
//
// Contract: single CityStage canvas (DPR clamped, aria-hidden); all readable
// English in the DOM overlay; quality tiers + reducedMotion honoured; full
// keyboard (number keys 1–12 flip a card · Enter when done · H hint · S skip)
// + touch (≥44px card buttons); procedural geometry + basic materials only;
// no per-frame allocations; no new deps.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Object3D } from 'three'
import type { InstancedMesh, Mesh } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult } from './types'

// ── Palette ──────────────────────────────────────────────────────────────────
const CREAM = '#f6efe2'
const AMBER_SOFT = '#ffce86'
const GREEN = '#34D399'
const ROSE = '#FB7185'
const INK = '#1f0e3a'
const FELT = '#1A3A2A'      // table felt
const CARD_BACK = '#1e2e24' // face-down card
const STONE_WALL = '#4A4036'

// ── Puzzle shape (mirrors the 2D shell) ──────────────────────────────────────
interface WRound { id: string; prompt: string; options: string[]; answerIndex: number; hint?: string; hint_pl?: string }
interface WPuzzle { rounds: WRound[] }

// ── Built-in demo — original vocabulary pairs for anonymous play ──────────────
const DEMO: WRound[] = [
  { id: 'cellar', prompt: 'A cool dark room under a building.', options: ['attic', 'cellar', 'porch', 'roof'], answerIndex: 1,
    hint: 'Below ground level.', hint_pl: 'Po polsku: piwnica.' },
  { id: 'lamp', prompt: 'A small light fueled by oil.', options: ['mirror', 'kettle', 'lamp', 'shelf'], answerIndex: 2,
    hint: 'You light it with a match.', hint_pl: 'Po polsku: lampa.' },
  { id: 'memory', prompt: "The brain's ability to recall the past.", options: ['memory', 'hunger', 'shadow', 'roof'], answerIndex: 0,
    hint: 'You "have a good ___".', hint_pl: 'Po polsku: pamięć.' },
  { id: 'pair', prompt: 'A set of two matching things.', options: ['triple', 'single', 'pair', 'crowd'], answerIndex: 2,
    hint: 'Two of a kind.', hint_pl: 'Po polsku: para.' },
  { id: 'shadow', prompt: 'The dark shape behind something blocking the light.', options: ['flame', 'water', 'cloud', 'shadow'], answerIndex: 3,
    hint: 'Cast by your body in the sun.', hint_pl: 'Po polsku: cień.' },
  { id: 'oak', prompt: 'A heavy hardwood tree used for furniture.', options: ['silk', 'oak', 'sand', 'glass'], answerIndex: 1,
    hint: 'Tree with acorns.', hint_pl: 'Po polsku: dąb.' },
]

// ── Card model ────────────────────────────────────────────────────────────────
type CardFace = 'down' | 'up' | 'matched'
interface Card { id: string; type: 'prompt' | 'answer'; roundId: string; label: string }

function buildCards(rounds: WRound[]): Card[] {
  const cards: Card[] = []
  rounds.forEach((r) => {
    cards.push({ id: `${r.id}-P`, type: 'prompt', roundId: r.id, label: r.prompt })
    cards.push({ id: `${r.id}-A`, type: 'answer', roundId: r.id, label: r.options[r.answerIndex] })
  })
  // Fisher-Yates shuffle (deterministic seed via round-id hashes for a stable demo)
  for (let i = cards.length - 1; i > 0; i--) {
    const h = cards.slice(0, i + 1).reduce((acc, c) => (acc * 31 + c.id.charCodeAt(0)) | 0, 7)
    const j = Math.abs(h) % (i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

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

// ── 3D scene — the dusk memory cellar ─────────────────────────────────────────
const _o = new Object3D()
const _c = new Color()

function CellarScene({
  cardStates, warmth, reducedMotion, bajlaVariant, totalCards,
}: {
  cardStates: CardFace[]
  warmth: number
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
  totalCards: number
}) {
  const { tier } = useStageQuality()
  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 10, 24]} />}
      {/* Stone cellar floor */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshToonMaterial color="#2B3A30" />
      </mesh>
      {/* Stone walls at the back */}
      <mesh position={[0, 2.4, -4.8]}>
        <boxGeometry args={[10, 4.8, 0.4]} />
        <meshToonMaterial color={STONE_WALL} />
      </mesh>
      {/* Card table */}
      <mesh position={[0, 0.62, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[4.8, 0.12, 2.6]} />
        <meshToonMaterial color="#3A2A1E" />
      </mesh>
      {/* Felt surface */}
      <mesh position={[0, 0.69, -0.2]}>
        <boxGeometry args={[4.4, 0.02, 2.2]} />
        <meshToonMaterial color={FELT} />
      </mesh>
      {/* Decorative card tiles on the felt (instanced) */}
      <CardTiles cardStates={cardStates} reducedMotion={reducedMotion} totalCards={totalCards} />
      {/* Oil lamp on the corner */}
      <group position={[2.0, 0.74, -0.8]}>
        <mesh position={[0, 0.28, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 0.56, 8]} />
          <meshToonMaterial color="#5C4A30" />
        </mesh>
        <mesh position={[0, 0.6, 0]}>
          <sphereGeometry args={[0.12, 8, 6]} />
          <meshBasicMaterial color={palette.lanternCore} transparent opacity={0.65 + warmth * 0.33} />
        </mesh>
      </group>
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.38}
        position={[-2.1, 0.85, 0.6]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.03
    cam.position.set(0, 3.6 + bob, 5.4)
    cam.lookAt(0, 0.8, 0)
  })
  return null
}

// Instanced card tiles on the felt — state drives instanceColor.
function CardTiles({ cardStates, totalCards }: { cardStates: CardFace[]; reducedMotion: boolean; totalCards: number }) {
  const ref = useRef<InstancedMesh>(null!)
  const cols = totalCards <= 6 ? 3 : totalCards <= 8 ? 4 : totalCards <= 12 ? 4 : 4
  const rows = Math.ceil(totalCards / cols)
  const W = 0.84; const H = 0.58; const GX = 0.12; const GY = 0.1
  const totalW = cols * W + (cols - 1) * GX
  const totalH = rows * H + (rows - 1) * GY

  useEffect(() => {
    if (!ref.current) return
    cardStates.forEach((face, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = -totalW / 2 + col * (W + GX) + W / 2
      const z = -totalH / 2 + row * (H + GY) + H / 2
      _o.position.set(x, 0.72, z - 0.2)
      _o.rotation.set(-Math.PI / 2, 0, 0)
      _o.scale.setScalar(1)
      _o.updateMatrix()
      ref.current.setMatrixAt(i, _o.matrix)
      _c.set(face === 'matched' ? GREEN : face === 'up' ? CREAM : CARD_BACK)
      ref.current.setColorAt(i, _c)
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [cardStates, totalCards, cols, rows, totalW, totalH])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(totalCards, 1)]} frustumCulled={false}>
      <planeGeometry args={[W, H]} />
      <meshBasicMaterial vertexColors />
    </instancedMesh>
  )
}

// =========================================================================
// Concentration3D — default export
// =========================================================================
export default function Concentration3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const rounds = useMemo<WRound[]>(() => {
    const p = puzzle as WPuzzle | undefined
    if (p && Array.isArray(p.rounds) && p.rounds.length > 0) return p.rounds
    return DEMO
  }, [puzzle])

  // Build and shuffle the card deck — stable across re-renders.
  const deck = useMemo(() => buildCards(rounds), [rounds])
  const total = deck.length // 2 * rounds.length
  const totalPairs = rounds.length

  // ── State ───────────────────────────────────────────────────────────────────
  const [faces, setFaces] = useState<CardFace[]>(() => Array(total).fill('down'))
  const [flipped, setFlipped] = useState<number[]>([])   // 0–2 indices currently face-up (not matched)
  const [isChecking, setIsChecking] = useState(false)    // locked during mismatch pause
  const [matchedRounds, setMatchedRounds] = useState<Set<string>>(new Set())
  const [firstTry, setFirstTry] = useState<Set<string>>(new Set())   // matched on attempt 1
  const [attempts, setAttempts] = useState<Map<string, number>>(new Map()) // roundId → flip attempts
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintCard, setHintCard] = useState<number | null>(null)
  const [live, setLive] = useState('')
  const mismatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const startMs = useRef(performance.now())

  const done = matchedRounds.size >= totalPairs

  // Cleanup timers on unmount.
  useEffect(() => () => {
    if (mismatchTimer.current) clearTimeout(mismatchTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
  }, [])

  // ── Session complete ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('All pairs matched. The Memory Cellar is bright.')
    const result: SessionResult = {
      correctCount: firstTry.size,
      totalQuestions: totalPairs,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'concentration',
    }
    onSessionComplete?.(result)
  }, [done, firstTry.size, totalPairs, onSessionComplete])

  const flipCard = useCallback((i: number) => {
    if (isChecking || done) return
    if (faces[i] !== 'down') return
    if (flipped.includes(i)) return

    const newFlipped = [...flipped, i]
    setFaces((prev) => { const next = [...prev]; next[i] = 'up'; return next })
    setFlipped(newFlipped)

    if (newFlipped.length < 2) return  // wait for second card

    // Two cards flipped — check for match.
    const [a, b] = newFlipped
    const cA = deck[a]; const cB = deck[b]
    const isMatch = cA.roundId === cB.roundId && cA.type !== cB.type

    setIsChecking(true)
    // Track attempts for this round.
    const roundId = cA.roundId === cB.roundId ? cA.roundId : cA.roundId  // safe; we track both
    const att1 = attempts.get(cA.roundId) ?? 0
    const att2 = attempts.get(cB.roundId) ?? 0

    if (isMatch) {
      const rid = cA.roundId
      const att = (attempts.get(rid) ?? 0) + 1
      setAttempts((m) => new Map(m).set(rid, att))
      setMatchedRounds((s) => new Set(s).add(rid))
      if (att === 1) setFirstTry((s) => new Set(s).add(rid))
      setFaces((prev) => {
        const next = [...prev]; next[a] = 'matched'; next[b] = 'matched'; return next
      })
      setFlipped([])
      setIsChecking(false)
      setLive(`Matched — "${cB.type === 'answer' ? cB.label : cA.label}"`)
    } else {
      // Mismatch: show for 1.3 s then flip back.
      setAttempts((m) => {
        const nm = new Map(m)
        nm.set(cA.roundId, (m.get(cA.roundId) ?? 0) + 1)
        if (cA.roundId !== cB.roundId) nm.set(cB.roundId, (m.get(cB.roundId) ?? 0) + 1)
        return nm
      })
      setLive('No match — both cards flip back.')
      mismatchTimer.current = setTimeout(() => {
        setFaces((prev) => {
          const next = [...prev]
          if (next[a] === 'up') next[a] = 'down'
          if (next[b] === 'up') next[b] = 'down'
          return next
        })
        setFlipped([])
        setIsChecking(false)
      }, reduce ? 0 : 1300)
    }
  }, [isChecking, done, faces, flipped, deck, attempts, reduce])

  const useHint = useCallback(() => {
    if (isChecking || done || hintsUsed >= 3) return
    // Pick a random face-down card to briefly reveal.
    const candidates = deck.map((_, i) => i).filter((i) => faces[i] === 'down' && !flipped.includes(i))
    if (candidates.length === 0) return
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    setHintsUsed((h) => h + 1)
    setHintCard(pick)
    setFaces((prev) => { const next = [...prev]; next[pick] = 'up'; return next })
    setLive(`Hint — ${deck[pick].label}`)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => {
      setFaces((prev) => { const next = [...prev]; if (next[pick] === 'up') next[pick] = 'down'; return next })
      setHintCard(null)
    }, reduce ? 0 : 700)
  }, [isChecking, done, hintsUsed, deck, faces, flipped, reduce])

  const skip = useCallback(() => {
    if (done || isChecking) return
    if (flipped.length === 0) return
    // Flip the current card(s) back down.
    setFaces((prev) => {
      const next = [...prev]
      flipped.forEach((i) => { if (next[i] === 'up') next[i] = 'down' })
      return next
    })
    setFlipped([])
    setLive('Skipped — cards flipped back.')
  }, [done, isChecking, flipped])

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return
      const k = e.key
      if (k === 'h' || k === 'H') { e.preventDefault(); useHint(); return }
      if (k === 's' || k === 'S') { e.preventDefault(); skip(); return }
      const n = parseInt(k, 10)
      if (!Number.isNaN(n) && n >= 1 && n <= Math.min(9, total)) { e.preventDefault(); flipCard(n - 1) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [done, flipCard, useHint, skip, total])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    if (mismatchTimer.current) clearTimeout(mismatchTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    setFaces(Array(total).fill('down'))
    setFlipped([]); setIsChecking(false); setMatchedRounds(new Set()); setFirstTry(new Set())
    setAttempts(new Map()); setHintsUsed(0); setHintCard(null); setLive('')
  }, [total])

  const warmth = totalPairs > 0 ? matchedRounds.size / totalPairs : 0
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : 'idle'

  // Layout for DOM card grid.
  const cols = total <= 6 ? 3 : total <= 8 ? 4 : 4
  const rows = Math.ceil(total / cols)

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>The Memory Cellar</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: AMBER_SOFT }}>Flip and match the pairs</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{matchedRounds.size}</span>
          <span style={{ opacity: 0.6 }}> / {totalPairs} pairs</span>
        </div>
      </div>

      {/* Card grid */}
      {!done && (
        <div style={{
          position: 'absolute', top: '12%', left: '50%', transform: 'translateX(-50%)',
          width: 'min(680px, 96vw)', pointerEvents: 'auto',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 8, justifyItems: 'stretch',
          }}>
            {deck.map((card, i) => {
              const face = faces[i]
              const isFlipped = face !== 'down'
              const isHighlit = flipped.includes(i)
              const bg = face === 'matched' ? `${GREEN}22`
                : face === 'up' ? (card.type === 'prompt' ? 'rgba(255,206,134,0.14)' : 'rgba(246,239,226,0.14)')
                : 'rgba(14,10,26,0.7)'
              const border = face === 'matched' ? `2px solid ${GREEN}`
                : isHighlit ? `2px solid ${AMBER_SOFT}`
                : face === 'up' ? `2px solid ${CREAM}66`
                : `2px solid rgba(255,255,255,0.12)`
              const col = face === 'matched' ? GREEN : face === 'up' ? CREAM : `${CREAM}55`
              return (
                <button key={card.id}
                  onClick={() => flipCard(i)}
                  disabled={face !== 'down' || isChecking}
                  aria-label={face !== 'down' ? `Card: ${card.label}` : `Card ${i + 1}: face down`}
                  aria-pressed={face === 'matched'}
                  style={{
                    minHeight: 68, padding: '8px 8px', borderRadius: 8,
                    background: bg, border, color: col,
                    fontSize: face === 'up' || face === 'matched' ? (card.type === 'prompt' ? 11 : 14) : 18,
                    fontFamily: card.type === 'answer' ? 'Georgia, serif' : undefined,
                    fontWeight: card.type === 'answer' ? 700 : 400,
                    cursor: face === 'down' && !isChecking ? 'pointer' : 'default',
                    touchAction: 'manipulation', lineHeight: 1.3,
                    transition: 'background 180ms ease, border-color 180ms ease',
                  }}>
                  {face === 'down' ? '?' : (
                    <>
                      {card.type === 'prompt' && <span style={{ fontSize: 8, letterSpacing: '0.2em', opacity: 0.6, display: 'block', marginBottom: 3 }}>CLUE</span>}
                      {card.type === 'answer' && <span style={{ fontSize: 8, letterSpacing: '0.2em', opacity: 0.6, display: 'block', marginBottom: 3 }}>WORD</span>}
                      {card.label}
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Footer controls */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={skip} disabled={flipped.length === 0} style={skipBtn(flipped.length === 0)}>FLIP BACK</button>
            <button onClick={useHint} disabled={isChecking || hintsUsed >= 3}
              style={hintBtnStyle(isChecking || hintsUsed >= 3)}>HINT · {3 - hintsUsed}</button>
          </div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>1–9 flip a card · H hint · S flip back</div>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Memory cellar complete" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 28, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>All pairs remembered.</div>
          <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            Every card matched.<br />
            <strong style={{ color: GREEN }}>{firstTry.size}</strong> / {totalPairs} matched first try.
          </div>
          <button onClick={reset} style={nextBtn}>Deal again →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="Memory card matching — flip two cards at a time to find prompt-answer pairs"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 3.6, 5.4]} cameraFov={54} overlay={overlay}>
        <CellarScene
          cardStates={faces}
          warmth={warmth}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
          totalCards={total}
        />
      </CityStage>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
function skipBtn(disabled: boolean): React.CSSProperties {
  return {
    minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)',
    border: `1px solid ${AMBER_SOFT}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.1em',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, touchAction: 'manipulation',
  }
}
function hintBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)',
    border: `1px solid ${AMBER_SOFT}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.1em',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, touchAction: 'manipulation',
  }
}
const nextBtn: React.CSSProperties = {
  minHeight: 44, padding: '10px 22px', borderRadius: 9, background: AMBER_SOFT,
  color: INK, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', touchAction: 'manipulation',
}
