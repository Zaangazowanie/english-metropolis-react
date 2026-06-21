// RankOrder3D — "The Election Hall" (RankOrder district).
//
// A three.js re-skin of the canonical 2D RankOrder shell
// (src/practice/shells/RankOrder.tsx). The MECHANIC is unchanged: read a
// criterion (e.g. "Order from Monday to Sunday"), then set N ballots onto the
// numbered plinths in the correct order (rank 1 first). A wrong order keeps the
// plinths open — items in the right place glow green, out-of-place flash rose
// — so the player keeps fixing (no-fail). A hint reveals the next plinth's
// ballot (2 per round); skip reveals the full order. Same puzzle in
// (RankOrderPuzzle {criterion, criterion_pl, items:[{id,label,label_pl,
// correctRank}]}); same SessionResult out. Built on the GameKit.
//
// Scene: a dusk election hall. A row of numbered stone plinths on a low dais;
// each recolours to mirror its slot's state — but the readable English (the
// criterion + each ballot's word) lives in the crisp DOM overlay, never baked
// into a 3D texture (contract rule 9). Bajla is the returning officer.
//
// Contract: single CityStage canvas (DPR clamped, aria-hidden); all readable
// English in the DOM overlay; quality tiers + reducedMotion honoured; full
// keyboard (1–9 place · Backspace pull · H hint · Enter next · S skip) + touch
// (≥44px); procedural geometry + basic materials only (no GLB, no external
// URLs, no new deps); no per-frame allocations.

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
const STONE = '#8a8170'      // placed plinth cap
const STONE_DIM = '#4a4536'  // empty plinth cap
const DAIS = '#3A2A1E'

// ── Puzzle shape (mirrors the 2D shell) ──────────────────────────────────────
interface ROItem { id: string; label: string; label_pl?: string; correctRank: number }
interface ROPuzzle { criterion: string; criterion_pl?: string; items: ROItem[] }

// ── Built-in demo — 3 original ranking rounds for anonymous play ──────────────
const DEMO: ROPuzzle[] = [
  {
    criterion: 'Order from Monday to Sunday', criterion_pl: 'Od poniedziałku do niedzieli',
    items: [
      { id: 'd-wed', label: 'Wednesday', label_pl: 'środa', correctRank: 3 },
      { id: 'd-fri', label: 'Friday', label_pl: 'piątek', correctRank: 5 },
      { id: 'd-mon', label: 'Monday', label_pl: 'poniedziałek', correctRank: 1 },
      { id: 'd-sun', label: 'Sunday', label_pl: 'niedziela', correctRank: 7 },
      { id: 'd-tue', label: 'Tuesday', label_pl: 'wtorek', correctRank: 2 },
    ],
  },
  {
    criterion: 'Order from smallest to largest', criterion_pl: 'Od najmniejszego do największego',
    items: [
      { id: 's-horse', label: 'horse', label_pl: 'koń', correctRank: 3 },
      { id: 's-ant', label: 'ant', label_pl: 'mrówka', correctRank: 1 },
      { id: 's-whale', label: 'whale', label_pl: 'wieloryb', correctRank: 4 },
      { id: 's-cat', label: 'cat', label_pl: 'kot', correctRank: 2 },
    ],
  },
  {
    criterion: 'Order alphabetically (A → Z)', criterion_pl: 'Alfabetycznie (A → Z)',
    items: [
      { id: 'a-city', label: 'city', label_pl: 'miasto', correctRank: 3 },
      { id: 'a-apple', label: 'apple', label_pl: 'jabłko', correctRank: 1 },
      { id: 'a-door', label: 'door', label_pl: 'drzwi', correctRank: 4 },
      { id: 'a-bridge', label: 'bridge', label_pl: 'most', correctRank: 2 },
    ],
  },
]

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

type PlinthState = 'empty' | 'placed' | 'correct' | 'wrong'
const _col = new Color()

// ── 3D scene — the dusk election hall ─────────────────────────────────────────
function HallScene({
  plinths, warmth, reducedMotion, bajlaVariant,
}: {
  plinths: PlinthState[]
  warmth: number
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
}) {
  const { tier } = useStageQuality()
  const n = plinths.length
  const span = Math.max(2, n) * 1.1
  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 12, 30]} />}
      {/* Ground */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshToonMaterial color="#2B5F6E" />
      </mesh>
      {/* Low dais the plinths stand on */}
      <mesh position={[0, 0.2, -0.3]} castShadow receiveShadow>
        <boxGeometry args={[span + 1.2, 0.4, 1.5]} />
        <meshToonMaterial color={DAIS} />
      </mesh>
      {/* Numbered plinths in a row (rank 1 → N, left → right) */}
      {plinths.map((p, i) => (
        <Plinth key={i} x={(i - (n - 1) / 2) * 1.1} state={p} reducedMotion={reducedMotion} />
      ))}
      {/* Two warm hall lamps that brighten with progress */}
      <Lamp x={-(span / 2 + 0.7)} warmth={warmth} />
      <Lamp x={span / 2 + 0.7} warmth={warmth} />
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.42} position={[span / 2 + 0.7, 1.2, 0.8]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.04
    cam.position.set(0, 2.5 + bob, 6.6)
    cam.lookAt(0, 1.0, 0)
  })
  return null
}

// A numbered stone plinth. The cap lerps toward its slot-state colour + a small
// lift when correct. No per-frame allocations (module-scope _col).
function Plinth({ x, state, reducedMotion }: { x: number; state: PlinthState; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null!)
  const target = state === 'correct' ? GREEN : state === 'wrong' ? ROSE : state === 'placed' ? STONE : STONE_DIM
  useFrame((_, dt) => {
    if (!ref.current) return
    const mat = ref.current.material as unknown as { color: Color }
    _col.set(target)
    const k = reducedMotion ? 1 : Math.min(1, dt * 6)
    mat.color.lerp(_col, k)
    const lift = state === 'correct' ? 1.16 : 1
    ref.current.position.y += (0.95 + (lift - 1) * 0.4 - ref.current.position.y) * k
  })
  return (
    <group position={[x, 0, 0]}>
      {/* column */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.32, 0.8, 8]} />
        <meshToonMaterial color={DAIS} />
      </mesh>
      {/* cap (state-coloured) */}
      <mesh ref={ref} position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[0.66, 0.18, 0.66]} />
        <meshBasicMaterial color={STONE_DIM} />
      </mesh>
    </group>
  )
}

function Lamp({ x, warmth }: { x: number; warmth: number }) {
  return (
    <group position={[x, 0, -1.2]}>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 2.8, 6]} />
        <meshToonMaterial color={palette.brass} />
      </mesh>
      <mesh position={[0, 2.85, 0]}>
        <sphereGeometry args={[0.18, 10, 8]} />
        <meshBasicMaterial color={palette.lanternCore} transparent opacity={0.55 + warmth * 0.4} />
      </mesh>
    </group>
  )
}

// =========================================================================
// RankOrder3D — default export
// =========================================================================
export default function RankOrder3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // ── Resolve puzzle (single RankOrderPuzzle → 1 round; else demo deck) ────────
  const rounds = useMemo<ROPuzzle[]>(() => {
    const p = puzzle as ROPuzzle | ROPuzzle[] | undefined
    if (Array.isArray(p)) return p.length > 0 ? p : DEMO
    if (p && Array.isArray(p.items) && p.items.length > 0) return [p]
    return DEMO
  }, [puzzle])
  const totalRounds = rounds.length
  const totalItems = useMemo(() => rounds.reduce((s, r) => s + r.items.length, 0), [rounds])

  // ── State ───────────────────────────────────────────────────────────────────
  const [idx, setIdx] = useState(0)
  const [slots, setSlots] = useState<(string | null)[]>([])
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [seen, setSeen] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [live, setLive] = useState('')
  const wrongSet = useRef<Set<string>>(new Set())
  const fired = useRef(false)
  const startMs = useRef(performance.now())

  const cur = rounds[idx]
  const done = seen >= totalRounds
  // Correct order = items sorted by ascending correctRank; plinth p wants sorted[p].
  const sortedIds = useMemo(() => {
    if (!cur) return [] as string[]
    return [...cur.items].sort((a, b) => a.correctRank - b.correctRank).map((it) => it.id)
  }, [cur])
  const labelById = useMemo(() => {
    const m: Record<string, ROItem> = {}
    cur?.items.forEach((it) => { m[it.id] = it })
    return m
  }, [cur])

  // Reset the plinths whenever the round changes.
  useEffect(() => {
    setSlots(Array(cur?.items.length ?? 0).fill(null))
    setFeedback(null)
    wrongSet.current = new Set()
  }, [idx, cur])

  // Auto-evaluate when every plinth is filled.
  useEffect(() => {
    if (!cur || feedback !== null) return
    if (slots.length === 0 || slots.some((v) => v === null)) return
    let allRight = true
    slots.forEach((id, p) => { if (id !== sortedIds[p]) { allRight = false; if (id) wrongSet.current.add(id) } })
    if (allRight) {
      setFeedback('correct')
      setLive('Correct — the order stands.')
    } else {
      setFeedback('wrong')
      setLive('Not the right order yet — tap the rose plinths to lift those ballots back.')
    }
  }, [slots, cur, feedback, sortedIds])

  // ── Session complete (single fire) ──────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('Every order is counted. The hall is warm and still.')
    const result: SessionResult = {
      correctCount,
      totalQuestions: totalItems,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'rankorder',
    }
    onSessionComplete?.(result)
  }, [done, correctCount, totalItems, onSessionComplete])

  // Ballots still in the queue (unplaced), original order.
  const tray = useMemo(() => {
    if (!cur) return [] as string[]
    const placed = new Set(slots.filter((v): v is string => v !== null))
    return cur.items.map((it) => it.id).filter((id) => !placed.has(id))
  }, [cur, slots])

  const place = useCallback((id: string) => {
    if (feedback === 'correct' || done || !cur) return
    setSlots((prev) => {
      if (prev.includes(id)) return prev
      const k = prev.indexOf(null)
      if (k < 0) return prev
      const next = prev.slice(); next[k] = id; return next
    })
    if (feedback === 'wrong') setFeedback(null)
  }, [feedback, done, cur])

  const removeSlot = useCallback((p: number) => {
    if (feedback === 'correct' || done) return
    setSlots((prev) => { if (prev[p] === null) return prev; const next = prev.slice(); next[p] = null; return next })
    setFeedback(null)
  }, [feedback, done])

  const pullLast = useCallback(() => {
    if (feedback === 'correct' || done) return
    setSlots((prev) => {
      for (let k = prev.length - 1; k >= 0; k--) if (prev[k] !== null) { const n = prev.slice(); n[k] = null; return n }
      return prev
    })
    setFeedback(null)
  }, [feedback, done])

  // Bank this round's first-try score, then move on.
  const bankAndAdvance = useCallback((revealWrong: boolean) => {
    if (!cur) return
    const n = cur.items.length
    if (revealWrong) cur.items.forEach((it) => wrongSet.current.add(it.id))
    setCorrectCount((c) => c + Math.max(0, n - wrongSet.current.size))
    setSeen((s) => s + 1)
    setIdx((i) => Math.min(i + 1, totalRounds - 1))
  }, [cur, totalRounds])

  const advance = useCallback(() => { bankAndAdvance(false) }, [bankAndAdvance])

  const skip = useCallback(() => {
    if (done || !cur) return
    if (feedback === 'correct') { advance(); return }
    // Reveal the correct order, count the round as missed, move on.
    setSlots(sortedIds.slice())
    setLive('Revealed — the correct order is shown.')
    bankAndAdvance(true)
  }, [done, cur, feedback, advance, sortedIds, bankAndAdvance])

  // Hint: set the correct ballot on the next empty plinth (2 per round).
  const useHint = useCallback(() => {
    if (feedback === 'correct' || done || hintsUsed >= 2 || !cur) return
    setSlots((prev) => {
      const p = prev.indexOf(null)
      if (p < 0) return prev
      const target = sortedIds[p]
      const next = prev.slice()
      const j = next.indexOf(target)
      if (j >= 0) next[j] = null
      next[p] = target
      return next
    })
    setHintsUsed((h) => h + 1)
    setFeedback(null)
    setLive('Hint — one ballot set on its plinth.')
  }, [feedback, done, hintsUsed, cur, sortedIds])

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return
      const k = e.key.toLowerCase()
      if (feedback === 'correct' && (k === 'enter' || k === ' ')) { e.preventDefault(); advance(); return }
      if (k === 'backspace') { e.preventDefault(); pullLast(); return }
      if (k === 'h') { e.preventDefault(); useHint(); return }
      if (k === 's') { e.preventDefault(); skip(); return }
      const d = parseInt(k, 10)
      if (!Number.isNaN(d) && d >= 1 && d <= tray.length) { e.preventDefault(); place(tray[d - 1]) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [done, feedback, tray, place, pullLast, useHint, skip, advance])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    wrongSet.current = new Set()
    setIdx(0); setSlots([]); setFeedback(null); setCorrectCount(0); setSeen(0); setHintsUsed(0); setLive('')
  }, [])

  const warmth = totalRounds > 0 ? seen / totalRounds : 0
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : feedback === 'correct' ? 'celebrate' : 'idle'

  // 3D plinth states.
  const plinthStates: PlinthState[] = useMemo(() => {
    if (!cur) return []
    return slots.map((id, p) => {
      if (id === null) return 'empty'
      if (feedback === 'correct') return 'correct'
      if (feedback === 'wrong') return id === sortedIds[p] ? 'correct' : 'wrong'
      return 'placed'
    })
  }, [slots, cur, feedback, sortedIds])

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>The Election Hall</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: AMBER_SOFT }}>Rank the ballots in order</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ opacity: 0.6 }}>Round </span><span style={{ color: GREEN }}>{Math.min(idx + 1, totalRounds)}</span>
          <span style={{ opacity: 0.6 }}> / {totalRounds}</span>
        </div>
      </div>

      {cur && !done && (
        <div style={{ position: 'absolute', top: '14%', left: '50%', transform: 'translateX(-50%)', width: 'min(640px, 94vw)', textAlign: 'center', pointerEvents: 'auto' }}>
          {/* Criterion */}
          <div style={{
            background: 'rgba(14,10,26,0.84)', borderRadius: 12, border: `1px solid ${AMBER_SOFT}44`,
            padding: '12px 18px', marginBottom: 14,
          }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 17, color: CREAM }}>{cur.criterion}</div>
            {cur.criterion_pl && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4, color: AMBER_SOFT }}>{cur.criterion_pl}</div>}
          </div>

          {/* Plinths (numbered slots) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
            {slots.map((id, p) => {
              const item = id ? labelById[id] : null
              const isCorrect = feedback === 'correct' || (feedback === 'wrong' && id !== null && id === sortedIds[p])
              const isWrong = feedback === 'wrong' && id !== null && id !== sortedIds[p]
              const color = id === null ? `${AMBER_SOFT}55` : isCorrect ? GREEN : isWrong ? ROSE : STONE
              return (
                <button key={p} onClick={() => removeSlot(p)} disabled={id === null || feedback === 'correct'}
                  aria-label={item ? `Plinth ${p + 1}: ${item.label}, tap to lift` : `Plinth ${p + 1}: empty`}
                  style={plinthBox(color, id === null)}>
                  <span style={{ fontSize: 9, opacity: 0.6, display: 'block', marginBottom: 3 }}>#{p + 1}</span>
                  {item ? item.label : '—'}
                </button>
              )
            })}
          </div>

          {/* Ballot queue (unplaced) */}
          {feedback !== 'correct' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {tray.length === 0 && <span style={{ fontSize: 11, opacity: 0.5 }}>All ballots placed — fix any rose plinths above.</span>}
              {tray.map((id, n) => (
                <button key={id} onClick={() => place(id)} aria-label={`Ballot: ${labelById[id]?.label}`} style={ballotTile()}>
                  <span style={{ fontSize: 9, opacity: 0.5, marginRight: 6 }}>{n + 1}</span>{labelById[id]?.label}
                </button>
              ))}
            </div>
          )}

          {/* Solved → next */}
          {feedback === 'correct' && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 13, color: GREEN, marginBottom: 10, fontWeight: 700, letterSpacing: '0.04em' }}>✓ Order confirmed</div>
              <button onClick={advance} style={nextBtn}>{idx + 1 >= totalRounds ? 'Close the hall →' : 'Next round →'}</button>
            </div>
          )}
        </div>
      )}

      {/* Footer controls */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={skip} style={skipBtn}>REVEAL →</button>
            <button onClick={useHint} disabled={feedback === 'correct' || hintsUsed >= 2} style={hintBtn(feedback === 'correct' || hintsUsed >= 2)}>HINT · {2 - hintsUsed}</button>
          </div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>1–9 place · ⌫ pull · H hint · Enter next · S reveal</div>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Election hall complete" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 30, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The orders are counted.</div>
          <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            Every round ranked.<br />
            <strong style={{ color: GREEN }}>{correctCount}</strong> / {totalItems} placed first time.
          </div>
          <button onClick={reset} style={nextBtn}>Rank again →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="Rank order — read the criterion and set the ballots onto the numbered plinths in order"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 2.5, 6.6]} cameraFov={48} overlay={overlay}>
        <HallScene
          plinths={plinthStates}
          warmth={warmth}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
        />
      </CityStage>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
function plinthBox(color: string, empty: boolean): React.CSSProperties {
  return {
    minHeight: 56, minWidth: 70, padding: '8px 12px', borderRadius: 8,
    background: empty ? 'rgba(14,10,26,0.5)' : `${color}1e`,
    border: `2px ${empty ? 'dashed' : 'solid'} ${color}`,
    color: empty ? `${AMBER_SOFT}99` : CREAM, fontWeight: 600, fontSize: 14,
    fontFamily: 'Georgia, serif', cursor: empty ? 'default' : 'pointer', touchAction: 'manipulation',
  }
}
function ballotTile(): React.CSSProperties {
  return {
    minHeight: 46, padding: '10px 14px', borderRadius: 8,
    background: 'rgba(190,242,100,0.12)', border: `2px solid ${STONE}`, color: CREAM,
    fontWeight: 600, fontSize: 15, fontFamily: 'Georgia, serif', cursor: 'pointer', touchAction: 'manipulation',
  }
}
const nextBtn: React.CSSProperties = {
  minHeight: 44, padding: '10px 22px', borderRadius: 9, background: AMBER_SOFT,
  color: INK, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', touchAction: 'manipulation',
}
const skipBtn: React.CSSProperties = {
  minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)',
  border: `1px solid ${AMBER_SOFT}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.1em',
  cursor: 'pointer', touchAction: 'manipulation',
}
function hintBtn(disabled: boolean): React.CSSProperties {
  return {
    minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)',
    border: `1px solid ${AMBER_SOFT}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.1em',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, touchAction: 'manipulation',
  }
}
