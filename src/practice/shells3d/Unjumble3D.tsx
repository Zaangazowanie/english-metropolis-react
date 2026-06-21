// Unjumble3D — "The Puzzle Workshop" district.
//
// A three.js re-skin of the canonical 2D Unjumble shell
// (src/practice/shells/Unjumble.tsx). The MECHANIC is unchanged: a sentence's
// words arrive scrambled as wood-block tiles; the player sets them onto the
// brass lining gauge in the correct order. The gauge stays open on a wrong
// order — blocks in the right place glow green, out-of-place blocks flash rose
// — so the player keeps fixing (no-fail). A hint locks the leftmost incorrect
// block (2 per session); skip advances. Same puzzle in (UnjumblePuzzle.items →
// {words, correct_order, hint, hint_pl, translation_pl}); same SessionResult
// out. Built on the Fluent City GameKit.
//
// Scene: a dusk typesetter's bench. A brass lining gauge holds a row of wooden
// type-blocks that recolour to mirror each slot's state — but the readable
// English (the words themselves) lives in the crisp DOM overlay, never baked
// into a 3D texture (contract rule 9). Tap tray tiles to set the line; Bajla
// cheers when it reads true.
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
const WOOD = '#caa56a'   // placed wood-block
const WOOD_DIM = '#5a4a32' // empty slot
const BRASS = '#b08d57'

// ── Puzzle shape (mirrors the 2D shell's UJSentence) ─────────────────────────
interface UJItem {
  id?: string
  words: string[]
  correct_order: number[]
  hint?: string
  hint_pl?: string
  translation_pl?: string
}
interface UJPuzzle { items: UJItem[] }

// ── Built-in demo — original short city sentences for anonymous play ──────────
const DEMO: UJItem[] = [
  { id: 'u1', words: ['the', 'gap.', 'Mind'], correct_order: [2, 0, 1],
    hint: 'Imperative verb first.', hint_pl: 'Najpierw czasownik.', translation_pl: 'Uważaj na przerwę.' },
  { id: 'u2', words: ['city.', 'to', 'Welcome', 'the'], correct_order: [2, 1, 3, 0],
    hint: 'A greeting opens it.', hint_pl: 'Zacznij od powitania.', translation_pl: 'Witaj w mieście.' },
  { id: 'u3', words: ['next', 'Please', 'train.', 'take', 'the'], correct_order: [1, 3, 4, 0, 2],
    hint: '"Please" + verb + object.', hint_pl: 'Please + czasownik + dopełnienie.', translation_pl: 'Proszę, wsiądź do następnego pociągu.' },
  { id: 'u4', words: ['near', 'the', 'I', 'river.', 'live'], correct_order: [2, 4, 0, 1, 3],
    hint: 'Subject + verb + place.', hint_pl: 'Podmiot + orzeczenie + miejsce.', translation_pl: 'Mieszkam blisko rzeki.' },
  { id: 'u5', words: ['late', 'train', 'The', 'today.', 'is'], correct_order: [2, 1, 4, 0, 3],
    hint: 'The + subject + is + ...', hint_pl: 'The + podmiot + is + ...', translation_pl: 'Pociąg jest dziś spóźniony.' },
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

type BlockState = 'empty' | 'placed' | 'correct' | 'wrong'
const _col = new Color()

// ── 3D scene — the dusk typesetter's bench ────────────────────────────────────
function WorkshopScene({
  blocks, warmth, reducedMotion, bajlaVariant,
}: {
  blocks: BlockState[]
  warmth: number
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
}) {
  const { tier } = useStageQuality()
  const n = blocks.length
  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 11, 28]} />}
      {/* Ground */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshToonMaterial color="#2B5F6E" />
      </mesh>
      {/* Workbench top */}
      <mesh position={[0, 0.85, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[5.2, 0.18, 1.8]} />
        <meshToonMaterial color="#6E5236" />
      </mesh>
      {/* Bench legs */}
      <mesh position={[-2.3, 0.42, 0.4]}><boxGeometry args={[0.16, 0.86, 0.16]} /><meshToonMaterial color="#3A2A1E" /></mesh>
      <mesh position={[2.3, 0.42, 0.4]}><boxGeometry args={[0.16, 0.86, 0.16]} /><meshToonMaterial color="#3A2A1E" /></mesh>
      {/* Brass lining gauge (the slot rail) */}
      <mesh position={[0, 1.06, 0.1]} castShadow>
        <boxGeometry args={[Math.max(2.2, n * 0.64 + 0.5), 0.1, 0.5]} />
        <meshToonMaterial color={BRASS} />
      </mesh>
      {/* Type-blocks on the gauge (one per slot) */}
      {blocks.map((b, k) => (
        <Block key={k} x={(k - (n - 1) / 2) * 0.64} state={b} reducedMotion={reducedMotion} />
      ))}
      {/* Two ink pots on the bench shelf */}
      <mesh position={[-2.1, 1.04, 0.0]}><cylinderGeometry args={[0.12, 0.14, 0.22, 10]} /><meshToonMaterial color={INK} /></mesh>
      <mesh position={[2.1, 1.04, 0.0]}><cylinderGeometry args={[0.12, 0.14, 0.22, 10]} /><meshToonMaterial color={INK} /></mesh>
      {/* Warm dusk lamps that brighten with progress */}
      <Lamp x={-3.4} warmth={warmth} />
      <Lamp x={3.4} warmth={warmth} />
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.4} position={[2.9, 1.3, 0.6]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.04
    cam.position.set(0, 2.3 + bob, 6.0)
    cam.lookAt(0, 1.2, 0)
  })
  return null
}

// A wooden type-block. Lerps toward its slot-state colour + a small lift when
// correct. No per-frame allocations (module-scope _col).
function Block({ x, state, reducedMotion }: { x: number; state: BlockState; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null!)
  const target = state === 'correct' ? GREEN : state === 'wrong' ? ROSE : state === 'placed' ? WOOD : WOOD_DIM
  useFrame((_, dt) => {
    if (!ref.current) return
    const mat = ref.current.material as unknown as { color: Color }
    _col.set(target)
    const k = reducedMotion ? 1 : Math.min(1, dt * 6)
    mat.color.lerp(_col, k)
    const lift = state === 'correct' ? 1.22 : state === 'empty' ? 0.85 : 1
    ref.current.position.y += (1.28 + (lift - 1) * 0.18 - ref.current.position.y) * k
  })
  return (
    <mesh ref={ref} position={[x, 1.28, 0.18]}>
      <boxGeometry args={[0.54, 0.4, 0.42]} />
      <meshToonMaterial color={WOOD_DIM} />
    </mesh>
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
// Unjumble3D — default export
// =========================================================================
export default function Unjumble3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // ── Resolve puzzle (same object the 2D shell receives) ──────────────────────
  const items = useMemo<UJItem[]>(() => {
    const p = puzzle as UJPuzzle | undefined
    if (p && Array.isArray(p.items) && p.items.length > 0) return p.items
    return DEMO
  }, [puzzle])
  const total = items.length

  // ── State ───────────────────────────────────────────────────────────────────
  const [idx, setIdx] = useState(0)
  // slots[k] = original word-index placed in slot k, or null.
  const [slots, setSlots] = useState<(number | null)[]>([])
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [solved, setSolved] = useState(0)
  const [seen, setSeen] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintShown, setHintShown] = useState(false)
  const [live, setLive] = useState('')
  const fired = useRef(false)
  const startMs = useRef(performance.now())

  const cur = items[idx]
  const done = seen >= total

  // Reset the gauge whenever the sentence changes.
  useEffect(() => {
    setSlots(Array(cur?.words.length ?? 0).fill(null))
    setFeedback(null)
    setHintShown(false)
  }, [idx, cur])

  // Auto-evaluate when the gauge is full.
  useEffect(() => {
    if (!cur || feedback !== null) return
    if (slots.length === 0 || slots.some((v) => v === null)) return
    const ok = slots.every((v, k) => v === cur.correct_order[k])
    if (ok) {
      setFeedback('correct')
      setSolved((s) => s + 1)
      setLive('Correct — the line reads true.')
    } else {
      setFeedback('wrong')
      setLive('Not the right order yet — tap the rose blocks to pull them back.')
    }
  }, [slots, cur, feedback])

  // ── Session complete (single fire) ──────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('Every line is set. The workshop is quiet and warm.')
    const result: SessionResult = {
      correctCount: solved,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'unjumble',
    }
    onSessionComplete?.(result)
  }, [done, solved, total, onSessionComplete])

  // Which word-indices are still in the tray (original order, not yet placed).
  const tray = useMemo(() => {
    if (!cur) return [] as number[]
    const placed = new Set(slots.filter((v): v is number => v !== null))
    return cur.words.map((_, i) => i).filter((i) => !placed.has(i))
  }, [cur, slots])

  const place = useCallback((wordIdx: number) => {
    if (feedback === 'correct' || done || !cur) return
    setSlots((prev) => {
      if (prev.includes(wordIdx)) return prev
      const k = prev.indexOf(null)
      if (k < 0) return prev
      const next = prev.slice()
      next[k] = wordIdx
      return next
    })
    if (feedback === 'wrong') setFeedback(null)
  }, [feedback, done, cur])

  const removeSlot = useCallback((k: number) => {
    if (feedback === 'correct' || done) return
    setSlots((prev) => {
      if (prev[k] === null) return prev
      const next = prev.slice()
      next[k] = null
      return next
    })
    setFeedback(null)
  }, [feedback, done])

  const pullLast = useCallback(() => {
    if (feedback === 'correct' || done) return
    setSlots((prev) => {
      for (let k = prev.length - 1; k >= 0; k--) {
        if (prev[k] !== null) { const next = prev.slice(); next[k] = null; return next }
      }
      return prev
    })
    setFeedback(null)
  }, [feedback, done])

  const advance = useCallback(() => {
    setSeen((s) => s + 1)
    setIdx((i) => Math.min(i + 1, total - 1))
  }, [total])

  const skip = useCallback(() => {
    if (done) return
    if (feedback === 'correct') { advance(); return }
    setLive('Skipped — the line waits for another time.')
    setSeen((s) => s + 1)
    setIdx((i) => Math.min(i + 1, total - 1))
  }, [done, feedback, advance])

  // Hint: lock the leftmost incorrect block into its correct slot (2/session).
  const useHint = useCallback(() => {
    if (feedback === 'correct' || done || hintsUsed >= 2 || !cur) return
    setSlots((prev) => {
      const k = prev.findIndex((v, i) => v !== cur.correct_order[i])
      if (k < 0) return prev
      const target = cur.correct_order[k]
      const next = prev.slice()
      const j = next.indexOf(target)
      if (j >= 0) next[j] = null   // pull it from wherever it currently sits
      next[k] = target
      return next
    })
    setHintsUsed((h) => h + 1)
    setHintShown(true)
    setFeedback(null)
    setLive('Hint — one block set into place.')
  }, [feedback, done, hintsUsed, cur])

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
    setIdx(0); setSlots([]); setFeedback(null); setSolved(0); setSeen(0)
    setHintsUsed(0); setHintShown(false); setLive('')
  }, [])

  const warmth = total > 0 ? solved / total : 0
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : feedback === 'correct' ? 'celebrate' : 'idle'

  // 3D block states per slot.
  const blockStates: BlockState[] = useMemo(() => {
    if (!cur) return []
    return slots.map((v, k) => {
      if (v === null) return 'empty'
      if (feedback === 'correct') return 'correct'
      if (feedback === 'wrong') return v === cur.correct_order[k] ? 'correct' : 'wrong'
      return 'placed'
    })
  }, [slots, cur, feedback])

  const correctSentence = cur ? cur.correct_order.map((wi) => cur.words[wi]).join(' ') : ''

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>The Puzzle Workshop</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: AMBER_SOFT }}>Set the line in order</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{solved}</span>
          <span style={{ opacity: 0.6 }}> / {total} set</span>
        </div>
      </div>

      {cur && !done && (
        <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)', width: 'min(620px, 94vw)', textAlign: 'center', pointerEvents: 'auto' }}>
          {/* Clue */}
          {cur.hint && (
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12, color: AMBER_SOFT }}>
              {cur.hint}{cur.hint_pl ? `  ·  ${cur.hint_pl}` : ''}
            </div>
          )}

          {/* Gauge (slots) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
            {slots.map((wi, k) => {
              const word = wi !== null ? cur.words[wi] : ''
              const isCorrect = feedback === 'correct' || (feedback === 'wrong' && wi !== null && wi === cur.correct_order[k])
              const isWrong = feedback === 'wrong' && wi !== null && wi !== cur.correct_order[k]
              const color = wi === null ? `${AMBER_SOFT}55` : isCorrect ? GREEN : isWrong ? ROSE : WOOD
              return (
                <button key={k} onClick={() => removeSlot(k)} disabled={wi === null || feedback === 'correct'}
                  aria-label={wi !== null ? `Slot ${k + 1}: ${word}, tap to remove` : `Slot ${k + 1}: empty`}
                  style={slotBox(color, wi === null)}>
                  {wi !== null ? word : `· ${k + 1} ·`}
                </button>
              )
            })}
          </div>

          {/* Tray (unplaced words) */}
          {feedback !== 'correct' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {tray.length === 0 && <span style={{ fontSize: 11, opacity: 0.5 }}>All blocks set — fix any rose blocks above.</span>}
              {tray.map((wi, n) => (
                <button key={wi} onClick={() => place(wi)} aria-label={`Block: ${cur.words[wi]}`} style={trayTile()}>
                  <span style={{ fontSize: 9, opacity: 0.5, marginRight: 6 }}>{n + 1}</span>{cur.words[wi]}
                </button>
              ))}
            </div>
          )}

          {/* Solved → translation + next */}
          {feedback === 'correct' && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 17, color: GREEN, marginBottom: 6 }}>{correctSentence}</div>
              {cur.translation_pl && <div style={{ fontSize: 12.5, fontStyle: 'italic', opacity: 0.8, marginBottom: 12 }}>{cur.translation_pl}</div>}
              <button onClick={advance} style={nextBtn}>{idx + 1 >= total ? 'Finish the run →' : 'Next sentence →'}</button>
            </div>
          )}
        </div>
      )}

      {/* Footer controls */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={skip} style={skipBtn}>SKIP →</button>
            <button onClick={useHint} disabled={feedback === 'correct' || hintsUsed >= 2} style={hintBtn(feedback === 'correct' || hintsUsed >= 2)}>HINT · {2 - hintsUsed}</button>
          </div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>1–9 place · ⌫ pull · H hint · Enter next · S skip</div>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Workshop complete" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 30, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The lines are set.</div>
          <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            Every sentence composed.<br />
            <strong style={{ color: GREEN }}>{solved}</strong> / {total} set in order.
          </div>
          <button onClick={reset} style={nextBtn}>Set them again →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="Unjumble — set the scrambled words onto the gauge in the correct sentence order"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 2.3, 6.0]} cameraFov={48} overlay={overlay}>
        <WorkshopScene
          blocks={blockStates}
          warmth={warmth}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
        />
      </CityStage>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
function slotBox(color: string, empty: boolean): React.CSSProperties {
  return {
    minHeight: 46, minWidth: 56, padding: '10px 14px', borderRadius: 8,
    background: empty ? 'rgba(14,10,26,0.5)' : `${color}1e`,
    border: `2px ${empty ? 'dashed' : 'solid'} ${color}`,
    color: empty ? `${AMBER_SOFT}99` : CREAM, fontWeight: 600, fontSize: 15,
    fontFamily: 'Georgia, serif', cursor: empty ? 'default' : 'pointer', touchAction: 'manipulation',
  }
}
function trayTile(): React.CSSProperties {
  return {
    minHeight: 46, padding: '10px 14px', borderRadius: 8,
    background: 'rgba(202,165,106,0.16)', border: `2px solid ${WOOD}`, color: CREAM,
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
