// LabelledDiagram3D — "Light the First Lamp", Lanterngate.
//
// A three.js re-skin of the canonical 2D LabelledDiagram shell
// (src/practice/shells/LabelledDiagram.tsx). The MECHANIC is image→label
// assignment: select a word-card, then tap the matching object to place it.
// No-fail — wrong placement gently re-asks; no red X; no score. Same puzzle
// in (LabelledDiagramPuzzle.hotspots → word/label pairs), same session
// result out (SessionResult). Built on the Fluent City GameKit.
//
// Scene: Lanterngate station arcade at dusk, Beat 2 of the vertical slice.
// Below a tall dark lamp-post sits a wooden crate holding four everyday
// objects (kettle, key, book, cup) in thin shafts of light, each with a
// small empty brass stand beside it. Word-cards slide out of Wren's satchel
// pocket. The player clicks a word-card then clicks the matching object.
// When all four are correctly named, the lamp relights in a slow warm bloom
// — the first light in the city.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden);
// ALL readable English lives in the DOM overlay (word-cards and object
// labels are real <button>s, never 3D textures); quality tiers +
// reducedMotion honoured; keyboard + touch (≥44px); procedural geometry +
// vertex colours only (no GLB, no external URLs, no new deps); instancing
// for repeated props; no per-frame allocations.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Object3D } from 'three'
import type { InstancedMesh, PointLight } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult } from './types'
import type { LabelledDiagramPuzzle } from '../generators/generateLabelledDiagram'

// ── Palette ────────────────────────────────────────────────────────────────────
const CREAM = '#f6efe2'
const AMBER_STR = '#E8920A'
const AMBER_SOFT = '#ffce86'
const INK = '#1f0e3a'
const GREEN = '#34D399'
const SLATE = '#2d4a52'

// ── Demo items — Lanterngate lamp-naming (Beat 2 of the vertical slice) ────────
// Four everyday objects that the first city lamp shines on.
const DEMO_ITEMS: Array<{ id: string; label: string; label_pl: string }> = [
  { id: 'kettle', label: 'KETTLE', label_pl: 'czajnik'   },
  { id: 'key',    label: 'KEY',    label_pl: 'klucz'     },
  { id: 'book',   label: 'BOOK',   label_pl: 'książka'   },
  { id: 'cup',    label: 'CUP',    label_pl: 'kubek'     },
]

// 3D world positions for the four objects in the crate, left-to-right.
const OBJ_POSITIONS: [number, number, number][] = [
  [-1.35, 0.82, 0],
  [-0.45, 0.82, 0],
  [ 0.45, 0.82, 0],
  [ 1.35, 0.82, 0],
]

// Allocation-free scratch objects.
const _obj = new Object3D()
const _col = new Color()

// ── 3D scene ───────────────────────────────────────────────────────────────────
function LanterngateScene({
  named:  namedSet,
  wrongId,
  selectedId,
  lit,
  reducedMotion,
  bajlaVariant,
  items,
}: {
  named: Set<string>
  wrongId: string | null
  selectedId: string | null
  lit: boolean
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
  items: typeof DEMO_ITEMS
}) {
  const { tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion

  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 8, 22]} />}
      <Platform />
      <LampPost lit={lit} highFx={highFx} reducedMotion={reducedMotion} />
      <Crate />
      <Objects items={items} named={namedSet} wrongId={wrongId} selectedId={selectedId} reducedMotion={reducedMotion} highFx={highFx} />
      <Lanterns highFx={highFx} reducedMotion={reducedMotion} />
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.38} position={[2.6, 0.76, 0.5]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.48) * 0.04
    cam.position.set(0, 2.1 + bob, 6.2)
    cam.lookAt(0, 1.0, 0)
  })
  return null
}

function Platform() {
  return (
    <group>
      {/* Victorian tiled floor */}
      <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 8]} />
        <meshStandardMaterial color={SLATE} roughness={0.9} />
      </mesh>
      {/* Arched arcade back wall */}
      <mesh position={[0, 2.0, -3.2]}>
        <boxGeometry args={[14, 5.6, 0.3]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      {/* Station name board */}
      <mesh position={[-3.5, 3.4, -3.0]}>
        <boxGeometry args={[3.6, 0.65, 0.1]} />
        <meshStandardMaterial color="#1a3a4a" roughness={0.8} />
      </mesh>
    </group>
  )
}

// The dark lamp post — its head brightens from dim to amber as the puzzle solves.
function LampPost({ lit, highFx, reducedMotion }: { lit: boolean; highFx: boolean; reducedMotion: boolean }) {
  const headRef = useRef<InstancedMesh>(null)
  const lightRef = useRef<PointLight>(null)
  const bloom = useRef(0) // 0..1
  const bloomTarget = useRef(lit ? 1 : 0)
  useEffect(() => { bloomTarget.current = lit ? 1 : 0 }, [lit])
  useFrame((_, dt) => {
    bloom.current += (bloomTarget.current - bloom.current) * (reducedMotion ? 1 : Math.min(1, dt / 2.2))
    const k = bloom.current
    const m = headRef.current
    if (m) {
      const mat = m.material as { emissiveIntensity?: number; color?: Color }
      if (mat) {
        mat.emissiveIntensity = 0.1 + k * 1.4
        if (mat.color) mat.color.set(k > 0.5 ? '#ffce86' : '#39454c')
      }
    }
    if (lightRef.current) lightRef.current.intensity = k * 1.8
  })
  return (
    <group position={[0, 0, 0.3]}>
      {/* Post */}
      <mesh position={[0, 2.1, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 4.2, 12]} />
        <meshStandardMaterial color="#2f3a40" roughness={0.85} />
      </mesh>
      {/* Lamp head */}
      <instancedMesh ref={headRef} args={[undefined, undefined, 1]} castShadow>
        <sphereGeometry args={[0.38, 14, 12]} />
        <meshStandardMaterial color="#39454c" emissive={AMBER_STR} emissiveIntensity={0.1} roughness={0.5} />
      </instancedMesh>
      <HeadPlacer meshRef={headRef} />
      {highFx && <pointLight ref={lightRef} position={[0, 4.3, 0.5]} color={palette.lanternAmber} intensity={0} distance={14} decay={2} />}
    </group>
  )
}

function HeadPlacer({ meshRef }: { meshRef: React.RefObject<InstancedMesh | null> }) {
  useEffect(() => {
    const m = meshRef.current
    if (!m) return
    _obj.position.set(0, 4.3, 0)
    _obj.rotation.set(0, 0, 0)
    _obj.scale.set(1, 1, 1)
    _obj.updateMatrix()
    m.setMatrixAt(0, _obj.matrix)
    m.instanceMatrix.needsUpdate = true
  }, [meshRef])
  return null
}

// The wooden crate holding the objects.
function Crate() {
  return (
    <group position={[0, 0.3, 0.5]}>
      {/* Crate body */}
      <mesh>
        <boxGeometry args={[3.4, 0.62, 1.1]} />
        <meshStandardMaterial color="#6b4a2e" roughness={0.95} />
      </mesh>
      {/* Slat lines */}
      {[-1.1, 0, 1.1].map((x, i) => (
        <mesh key={i} position={[x, 0.32, 0]}>
          <boxGeometry args={[0.05, 0.64, 1.12]} />
          <meshStandardMaterial color="#3d2a18" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// The four objects in the crate — procedural shapes.
function Objects({
  items,
  named,
  wrongId,
  selectedId,
  reducedMotion,
  highFx,
}: {
  items: typeof DEMO_ITEMS
  named: Set<string>
  wrongId: string | null
  selectedId: string | null
  reducedMotion: boolean
  highFx: boolean
}) {
  const beams = useRef<InstancedMesh>(null)
  const t = useRef(0)
  useEffect(() => {
    const m = beams.current
    if (!m) return
    items.forEach((item, i) => {
      const [x, y, z] = OBJ_POSITIONS[i]
      _obj.position.set(x, y, z)
      _obj.rotation.set(-Math.PI / 2, 0, 0)
      _obj.scale.set(0.4, 0.4, 1)
      _obj.updateMatrix()
      m.setMatrixAt(i, _obj.matrix)
      _col.set(named.has(item.id) ? GREEN : '#bfe0e8')
      m.setColorAt(i, _col)
    })
    m.instanceMatrix.needsUpdate = true
    m.instanceColor!.needsUpdate = true
  }, [items, named])
  useFrame((_, dt) => {
    t.current += dt
    const m = beams.current
    if (!m) return
    items.forEach((item, i) => {
      _col.set(named.has(item.id) ? GREEN : wrongId === item.id ? '#FB7185' : '#bfe0e8')
      m.setColorAt(i, _col)
    })
    m.instanceColor!.needsUpdate = true
  })
  return (
    <group>
      {/* Subtle light beam from above each object */}
      <instancedMesh ref={beams} args={[undefined, undefined, items.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.22, 0.28, 0.9, 10]} />
        <meshStandardMaterial vertexColors transparent opacity={0.2} depthWrite={false} />
      </instancedMesh>
      {/* Object meshes — procedural shapes per object type */}
      {items.map((item, i) => {
        const [x, y, z] = OBJ_POSITIONS[i]
        const isSel = selectedId === item.id
        const isNamed = named.has(item.id)
        const isWrong = wrongId === item.id
        const sc = isSel && !reducedMotion ? 1 + Math.sin(Date.now() * 0.006) * 0.04 : isWrong && !reducedMotion ? 0.96 : 1
        return (
          <group key={item.id} position={[x, y, z]} scale={[sc, sc, sc]}>
            <ObjectMesh kind={item.id} isNamed={isNamed} isSel={isSel} isWrong={isWrong} />
            {/* Brass stand beside each object */}
            <mesh position={[0.28, 0.22, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.44, 8]} />
              <meshStandardMaterial color={palette.brass ?? '#b08d57'} roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0.28, 0.44, 0]}>
              <boxGeometry args={[0.22, 0.05, 0.05]} />
              <meshStandardMaterial color={isNamed ? GREEN : '#8a6e3a'} roughness={0.6} emissive={isNamed ? GREEN : '#000'} emissiveIntensity={isNamed ? 0.4 : 0} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function ObjectMesh({ kind, isNamed, isSel, isWrong }: { kind: string; isNamed: boolean; isSel: boolean; isWrong: boolean }) {
  const col = isNamed ? GREEN : isWrong ? '#FB7185' : isSel ? AMBER_SOFT : '#9aa7ad'
  switch (kind) {
    case 'kettle': return (
      <group>
        <mesh>
          <cylinderGeometry args={[0.22, 0.25, 0.36, 14]} />
          <meshStandardMaterial color={col} roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[0.24, 0.06, 0]} rotation={[0, 0, -0.9]}>
          <coneGeometry args={[0.05, 0.2, 8]} />
          <meshStandardMaterial color={col} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.26, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.1, 0.025, 6, 12]} />
          <meshStandardMaterial color={col} roughness={0.5} />
        </mesh>
      </group>
    )
    case 'key': return (
      <group rotation={[0, 0, 0.4]}>
        <mesh position={[-0.18, 0, 0]}>
          <torusGeometry args={[0.1, 0.035, 6, 14]} />
          <meshStandardMaterial color={col} roughness={0.4} metalness={0.4} />
        </mesh>
        <mesh position={[0.1, -0.02, 0]}>
          <boxGeometry args={[0.42, 0.06, 0.06]} />
          <meshStandardMaterial color={col} roughness={0.4} metalness={0.4} />
        </mesh>
      </group>
    )
    case 'book': return (
      <mesh rotation={[0, 0.25, 0]}>
        <boxGeometry args={[0.36, 0.1, 0.44]} />
        <meshStandardMaterial color={col} roughness={0.8} />
      </mesh>
    )
    default: /* cup */ return (
      <mesh>
        <cylinderGeometry args={[0.14, 0.10, 0.22, 12]} />
        <meshStandardMaterial color={col} roughness={0.6} />
      </mesh>
    )
  }
}

function Lanterns({ highFx, reducedMotion }: { highFx: boolean; reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const N = 5
  const positions = useMemo(() => Array.from({ length: N }, (_, i) => ({ x: -4 + i * 2.0, y: 3.2 + Math.sin(i * 0.8) * 0.12 })), [])
  useEffect(() => {
    const m = inst.current
    if (!m) return
    positions.forEach((p, i) => {
      _obj.position.set(p.x, p.y, -0.6)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1.2, 1)
      _obj.updateMatrix()
      m.setMatrixAt(i, _obj.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [positions])
  useFrame((state) => {
    const m = inst.current
    if (!m || !highFx || reducedMotion) return
    const mat = m.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = 0.6 + Math.sin(state.clock.elapsedTime * 5.2) * 0.12
  })
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, N]} frustumCulled={false}>
      <sphereGeometry args={[0.12, 10, 8]} />
      <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.65} roughness={0.5} />
    </instancedMesh>
  )
}

// ── prefers-reduced-motion ────────────────────────────────────────────────────
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

function btnBase(active = false, disabled = false): React.CSSProperties {
  return {
    minHeight: 44, padding: '9px 16px', borderRadius: 9, fontSize: 14, fontWeight: 700,
    letterSpacing: '0.06em', cursor: disabled ? 'default' : 'pointer',
    touchAction: 'manipulation', fontFamily: 'ui-monospace,monospace',
    background: active ? AMBER_STR : 'rgba(14,10,26,0.88)',
    color: active ? INK : CREAM,
    border: `2px solid ${active ? AMBER_STR : 'rgba(246,239,226,0.30)'}`,
    opacity: disabled ? 0.5 : 1,
    boxShadow: active ? `0 4px 0 #8a5200, 0 8px 18px rgba(232,146,10,0.4)` : '0 3px 0 rgba(0,0,0,0.4)',
    transform: active ? 'translateY(-2px)' : 'none',
    transition: 'all 140ms',
  }
}

// =========================================================================
// LabelledDiagram3D — default export
// =========================================================================
export default function LabelledDiagram3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // ── Resolve items from puzzle or vocab ────────────────────────────────────
  const items = useMemo<typeof DEMO_ITEMS>(() => {
    // Try to use hotspots from a LabelledDiagramPuzzle prop.
    const p = puzzle as LabelledDiagramPuzzle | undefined
    if (p && Array.isArray(p.hotspots) && p.hotspots.length >= 2) {
      return p.hotspots.slice(0, 4).map((h) => ({
        id: h.id,
        label: h.label.toUpperCase(),
        label_pl: h.label_pl,
      }))
    }
    // Try to map vocab items.
    if (vocab && vocab.length >= 2) {
      return vocab.slice(0, 4).map((v) => ({
        id: v.word,
        label: v.word.toUpperCase(),
        label_pl: v.word_pl ?? '',
      }))
    }
    return DEMO_ITEMS
  }, [puzzle, vocab])

  const total = items.length

  // ── Game state ─────────────────────────────────────────────────────────────
  const [named, setNamed] = useState<Set<string>>(() => new Set())
  const [held, setHeld] = useState<string | null>(null)   // which label is "in hand"
  const [wrongTarget, setWrongTarget] = useState<string | null>(null) // object id that shook
  const [live, setLive] = useState('')
  const fired = useRef(false)
  const startMs = useRef(performance.now())
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const done = named.size === total

  // ── Interaction ────────────────────────────────────────────────────────────
  // Pick up a word-card (or put it down if already held).
  const pickCard = useCallback((label: string) => {
    setHeld((h) => h === label ? null : label)
  }, [])

  // Drop the held card onto a target object.
  const dropOn = useCallback((itemId: string) => {
    if (!held) return
    if (named.has(itemId)) return // already named
    const match = items.find((it) => it.id === itemId)
    if (!match) return
    if (match.label === held) {
      // Correct!
      setNamed((s) => new Set(s).add(itemId))
      setHeld(null)
      setLive(`Correct — ${match.label} named.`)
    } else {
      // No-fail: wrong match — gentle shake, card returns.
      setWrongTarget(itemId)
      setLive(`Not quite — look at the shape. Try again. No hurry.`)
      if (wrongTimer.current) clearTimeout(wrongTimer.current)
      wrongTimer.current = setTimeout(() => setWrongTarget(null), 650)
      // Card stays held so the player can try another object.
    }
  }, [held, named, items])

  // Keyboard: 1–4 drop onto that object; Esc deselects.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= items.length) { e.preventDefault(); dropOn(items[n - 1].id); return }
      if (e.key === 'Escape') { e.preventDefault(); setHeld(null) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [items, dropOn])

  // Session complete (single fire).
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('All four named. The lamp remembers.')
    const result: SessionResult = {
      correctCount: total,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'labelleddiagram',
    }
    onSessionComplete?.(result)
  }, [done, total, onSessionComplete])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    setNamed(new Set()); setHeld(null); setWrongTarget(null); setLive('')
  }, [])

  useEffect(() => () => { if (wrongTimer.current) clearTimeout(wrongTimer.current) }, [])

  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : 'idle'

  // ── DOM overlay ─────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>Lanterngate</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: AMBER_SOFT }}>Light the First Lamp</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_STR}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{named.size}</span>
          <span style={{ opacity: 0.6 }}> / {total} named</span>
        </div>
      </div>

      {/* Bajla prompt */}
      {!done && (
        <div style={{ position: 'absolute', top: 64, left: 14, right: 14, textAlign: 'center', fontSize: 13, opacity: 0.82, fontStyle: 'italic' }}>
          {held
            ? `"${held}" — now tap the matching object. (1–${total} to place)`
            : 'Pick a word-card, then tap the matching object below it.'}
        </div>
      )}

      {/* Object target buttons — positioned over the 3D objects */}
      <div style={{
        position: 'absolute', top: '45%', left: 14, right: 14,
        display: 'flex', gap: 8, justifyContent: 'center', pointerEvents: 'auto',
      }}>
        {items.map((item, i) => {
          const isNamed = named.has(item.id)
          const isWrong = wrongTarget === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => dropOn(item.id)}
              disabled={!held || isNamed}
              aria-label={`Object ${i + 1}${isNamed ? ` — ${item.label}, already named` : ''}`}
              style={{
                minHeight: 54, minWidth: 60, borderRadius: 8, padding: '8px 12px',
                background: isNamed ? `${GREEN}22` : 'rgba(14,10,26,0.0)',
                border: `2px solid ${isNamed ? GREEN : isWrong ? '#FB7185' : 'rgba(246,239,226,0.18)'}`,
                color: isNamed ? GREEN : CREAM, fontSize: 11, cursor: (held && !isNamed) ? 'pointer' : 'default',
                touchAction: 'manipulation', transition: 'all 180ms',
                animation: isWrong ? 'ldShake 0.35s ease' : 'none',
                pointerEvents: held && !isNamed ? 'auto' : 'none',
              }}
              aria-keyshortcuts={`${i + 1}`}
            >
              {isNamed ? '✓' : `${i + 1}`}
            </button>
          )
        })}
      </div>

      {/* Word-card bank (the exercise — crisp DOM) */}
      <div style={{
        position: 'absolute', bottom: 64, left: 14, right: 14,
        display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap',
        pointerEvents: 'auto',
      }}>
        {items.map((item) => {
          const isNamed = named.has(item.id)
          const isHeld = held === item.label
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => !isNamed && pickCard(item.label)}
              disabled={isNamed}
              aria-pressed={isHeld}
              aria-label={`Word card: ${item.label}${isNamed ? ', placed' : isHeld ? ', selected' : ''}`}
              style={btnBase(isHeld, isNamed)}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {/* Hint strip */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', fontSize: 10, opacity: 0.55 }}>
          <span style={{ color: AMBER_SOFT }}>BAJLA:</span> {held ? 'Press a number key (1–4) to place the card on that object.' : 'Pick a word-card, then tap the object it names.'}
        </div>
      )}

      {/* Completion card */}
      {done && (
        <div role="dialog" aria-label="All objects named, lamp relit" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_STR}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 30, color: AMBER_SOFT }}>You named them.</div>
          <div style={{ fontSize: 14, opacity: 0.85 }}>They <em>remembered</em>.</div>
          <div style={{ fontSize: 14, opacity: 0.7 }}>+1 light — the lamp remembers.</div>
          <button onClick={reset} style={{ ...btnBase(false, false), background: AMBER_STR, color: INK, border: `2px solid ${AMBER_STR}` }}>Try again →</button>
        </div>
      )}

      <style>{`@keyframes ldShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}`}</style>
    </div>
  )

  return (
    <div
      role="application"
      aria-label="Light the First Lamp — name what the lamp shines on by placing the word-cards"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 2.1, 6.2]}
        cameraFov={46}
        overlay={overlay}
      >
        <LanterngateScene
          named={named}
          wrongId={wrongTarget}
          selectedId={null}
          lit={done}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
          items={items}
        />
      </CityStage>
    </div>
  )
}
