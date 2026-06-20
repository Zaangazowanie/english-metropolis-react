// GapFill3D — "Posta's Smudged Postcard", Postcard Pier.
//
// A three.js re-skin of the canonical 2D GapFill shell
// (src/practice/shells/GapFill.tsx). The MECHANIC, gap matching, word-bank
// selection, scene progression, and single-fire onSessionComplete are
// inherited from the 2D shell — this file changes only the stagecraft.
// Same puzzle in (GapFillPuzzle.scenes), same session result out
// (SessionResult). Built on the Fluent City GameKit.
//
// Scene: Postcard Pier at dusk. Posta holds rain-smudged postcards; some
// words have washed away. A warm desk lamp illuminates a cream postcard on
// the writing desk — the missing words are the gaps. The player taps a word
// from the bank to fill each blank; tapping the wrong word wobbles the slot
// gently. Every restored postcard makes the pier lamp a little warmer.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden);
// all readable English lives in the DOM overlay (postcard text + word-bank
// buttons, never baked into a 3D texture); quality tiers + reducedMotion
// honoured; keyboard + touch (≥44px); procedural geometry + vertex colours
// only (no GLB, no external URLs, no new deps); no per-frame allocations.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Object3D } from 'three'
import type { InstancedMesh, PointLight } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult } from './types'
import { generateGapFill } from '../generators/generateGapFill'
import type { GapFillPuzzle, GapFillScene } from '../generators/generateGapFill'

// ── Palette ────────────────────────────────────────────────────────────────────
const CREAM = '#f6efe2'
const AMBER_STR = '#E8920A'
const AMBER_SOFT = '#ffce86'
const INK = '#1f0e3a'
const ROSE = '#FB7185'
const GREEN = '#34D399'
const TEAL_WATER = '#1c4a58'

// ── Demo puzzle — postcard-themed sentences for Postcard Pier ─────────────────
const DEMO_INPUT = [
  { word: 'weather',  word_pl: 'pogoda',          exampleEn: 'The weather here is cold and grey.' },
  { word: 'journey',  word_pl: 'podróż',           exampleEn: 'My journey to the city was wonderful.' },
  { word: 'bridge',   word_pl: 'most',             exampleEn: 'We crossed the old bridge at sunset.' },
  { word: 'sunset',   word_pl: 'zachód słońca',    exampleEn: 'The sunset painted the sky amber and gold.' },
  { word: 'lantern',  word_pl: 'latarnia',         exampleEn: 'A paper lantern lit the path home.' },
  { word: 'letter',   word_pl: 'list',             exampleEn: 'She wrote a letter to her sister every Sunday.' },
]
const DEMO: GapFillPuzzle = generateGapFill(DEMO_INPUT, { sceneCount: 5, seed: 0xC0DE })

// Allocation-free scratch objects.
const _obj = new Object3D()
const _col = new Color()

// ── 3D Scene — Postcard Pier at dusk ─────────────────────────────────────────
function PierScene({
  solvedCount,
  total,
  reducedMotion,
  bajlaVariant,
}: {
  solvedCount: number
  total: number
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
}) {
  const { tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion
  const warmth = total > 0 ? solvedCount / total : 0

  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 8 + warmth * 5, 22 + warmth * 6]} />}
      <River shimmer={highFx} />
      <Pier />
      <WritingDesk warmth={warmth} highFx={highFx} reducedMotion={reducedMotion} />
      <Railing />
      <PierLanterns flicker={tier !== 'low' && !reducedMotion} warmth={warmth} />
      <Background />
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.38} position={[2.4, 0.9, -0.5]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.44) * 0.04
    cam.position.set(0, 2.6 + bob, 7.0)
    cam.lookAt(0, 1.0, 0)
  })
  return null
}

function River({ shimmer }: { shimmer: boolean }) {
  const streaks = useRef<InstancedMesh>(null)
  const N = 9
  useEffect(() => {
    const m = streaks.current; if (!m) return
    for (let i = 0; i < N; i++) {
      _obj.position.set(-5 + i * 1.2, -0.44, -1.5 - (i % 3) * 0.9)
      _obj.rotation.set(-Math.PI / 2, 0, 0)
      _obj.scale.set(0.16, 1.4 + (i % 3) * 0.3, 1)
      _obj.updateMatrix()
      streaks.current!.setMatrixAt(i, _obj.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }, [])
  useFrame((state) => {
    const m = streaks.current; if (!m || !shimmer) return
    const t = state.clock.elapsedTime
    for (let i = 0; i < N; i++) {
      _obj.position.set(-5 + i * 1.2 + Math.sin(t * 0.6 + i) * 0.18, -0.44, -1.5 - (i % 3) * 0.9)
      _obj.rotation.set(-Math.PI / 2, 0, 0)
      _obj.scale.set(0.16, 1.4 + Math.sin(t * 1.1 + i) * 0.25, 1)
      _obj.updateMatrix()
      m.setMatrixAt(i, _obj.matrix)
      _col.set(AMBER_STR)
      m.setColorAt(i, _col)
    }
    m.instanceMatrix.needsUpdate = true
    m.instanceColor!.needsUpdate = true
    const mat = m.material as { opacity?: number }
    if (mat) mat.opacity = 0.28 + Math.sin(state.clock.elapsedTime * 2.2) * 0.09
  })
  return (
    <group>
      <mesh position={[0, -0.48, -1.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 12]} />
        <meshStandardMaterial color={TEAL_WATER} roughness={0.3} metalness={0.5} />
      </mesh>
      <instancedMesh ref={streaks} args={[undefined, undefined, N]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial vertexColors transparent opacity={0.3} emissive={AMBER_STR} emissiveIntensity={0.5} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}

function Pier() {
  return (
    <group>
      {/* Pier decking */}
      <mesh position={[0, -0.1, 0.5]} receiveShadow>
        <boxGeometry args={[9, 0.18, 4.5]} />
        <meshStandardMaterial color="#4a3220" roughness={0.95} />
      </mesh>
      {/* Plank lines */}
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={i} position={[-2.4 + i * 1.2, 0.0, 0.5]}>
          <boxGeometry args={[0.05, 0.19, 4.5]} />
          <meshStandardMaterial color="#2e1e10" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// The writing desk with a glowing postcard under a lamp.
function WritingDesk({ warmth, highFx, reducedMotion }: { warmth: number; highFx: boolean; reducedMotion: boolean }) {
  const lampRef = useRef<PointLight>(null)
  useFrame((state, dt) => {
    if (!lampRef.current) return
    const base = 0.4 + warmth * 1.0
    lampRef.current.intensity = highFx && !reducedMotion
      ? base + Math.sin(state.clock.elapsedTime * 5.5) * 0.12
      : base
  })
  return (
    <group position={[-0.4, 0, 0.8]}>
      {/* Desk surface */}
      <mesh position={[0, 0.68, 0]} receiveShadow>
        <boxGeometry args={[2.4, 0.1, 1.4]} />
        <meshStandardMaterial color="#6b4a2e" roughness={0.9} />
      </mesh>
      {/* Desk legs */}
      {[[-1.0, -0.6], [-1.0, 0.6], [1.0, -0.6], [1.0, 0.6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.35, z]}>
          <boxGeometry args={[0.08, 0.7, 0.08]} />
          <meshStandardMaterial color="#3d2010" roughness={1} />
        </mesh>
      ))}
      {/* The postcard — a warm cream rect on the desk */}
      <mesh position={[0, 0.74, -0.1]}>
        <boxGeometry args={[1.8, 0.02, 1.0]} />
        <meshStandardMaterial color={CREAM} roughness={0.7} emissive={CREAM} emissiveIntensity={0.1 + warmth * 0.25} />
      </mesh>
      {/* Ink-pot + quill */}
      <mesh position={[0.9, 0.8, 0.3]}>
        <cylinderGeometry args={[0.08, 0.10, 0.18, 10]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.5} />
      </mesh>
      {/* Lamp post */}
      <mesh position={[1.0, 1.1, -0.5]}>
        <cylinderGeometry args={[0.04, 0.04, 0.9, 8]} />
        <meshStandardMaterial color="#2f3a40" roughness={0.8} />
      </mesh>
      <mesh position={[1.0, 1.58, -0.5]}>
        <sphereGeometry args={[0.16, 12, 10]} />
        <meshStandardMaterial color={AMBER_SOFT} emissive={AMBER_STR} emissiveIntensity={0.6 + warmth * 0.8} roughness={0.5} />
      </mesh>
      {highFx && <pointLight ref={lampRef} position={[1.0, 1.4, -0.5]} color={palette.lanternAmber} intensity={0.5} distance={6} decay={2} />}
    </group>
  )
}

function Railing() {
  return (
    <group position={[0, 0, -1.8]}>
      {/* Top rail */}
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[8.8, 0.1, 0.1]} />
        <meshStandardMaterial color={palette.brass ?? '#b08d57'} roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Railing posts */}
      {Array.from({ length: 9 }).map((_, i) => (
        <mesh key={i} position={[-4.0 + i * 1.0, 0.55, 0]}>
          <boxGeometry args={[0.06, 1.1, 0.06]} />
          <meshStandardMaterial color="#3a2810" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function PierLanterns({ flicker, warmth }: { flicker: boolean; warmth: number }) {
  const inst = useRef<InstancedMesh>(null)
  const N = 5
  const positions = useMemo(() => Array.from({ length: N }, (_, i) => ({ x: -3 + i * 1.5, y: 2.9 + Math.sin(i * 0.7) * 0.1 })), [])
  useEffect(() => {
    const m = inst.current; if (!m) return
    positions.forEach((p, i) => {
      _obj.position.set(p.x, p.y, -0.4)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1.2, 1)
      _obj.updateMatrix()
      m.setMatrixAt(i, _obj.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [positions])
  useFrame((state) => {
    const m = inst.current; if (!m || !flicker) return
    const mat = m.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = 0.45 + warmth * 0.45 + Math.sin(state.clock.elapsedTime * 5.3) * 0.12
  })
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, N]} frustumCulled={false}>
      <sphereGeometry args={[0.12, 10, 8]} />
      <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.55} roughness={0.5} />
    </instancedMesh>
  )
}

function Background() {
  return (
    <group>
      {/* Night sky wall far back */}
      <mesh position={[0, 2.4, -4.5]}>
        <boxGeometry args={[18, 6, 0.2]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      {/* Distant bridge silhouette */}
      <mesh position={[0, 0.6, -4.0]}>
        <boxGeometry args={[12, 0.6, 0.2]} />
        <meshStandardMaterial color={palette.ink} roughness={1} />
      </mesh>
      <mesh position={[0, 1.1, -4.0]}>
        <cylinderGeometry args={[0.28, 0.28, 1.0, 8]} />
        <meshStandardMaterial color={palette.ink} roughness={1} />
      </mesh>
    </group>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
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

function bankBtn(active = false, disabled = false, shake = false, reduce = false): React.CSSProperties {
  return {
    minHeight: 44, padding: '9px 16px', borderRadius: 9, fontSize: 13,
    fontWeight: 700, letterSpacing: '0.04em', cursor: disabled ? 'default' : 'pointer',
    touchAction: 'manipulation', fontFamily: 'Georgia, serif',
    background: disabled ? 'rgba(14,10,26,0.45)' : active ? AMBER_STR : 'rgba(14,10,26,0.85)',
    color: disabled ? 'rgba(246,239,226,0.35)' : active ? INK : CREAM,
    border: `2px solid ${disabled ? 'rgba(246,239,226,0.14)' : active ? AMBER_STR : 'rgba(246,239,226,0.28)'}`,
    opacity: disabled ? 0.5 : 1,
    boxShadow: active ? '0 4px 0 #8a5200' : '0 3px 0 rgba(0,0,0,0.45)',
    transform: active ? 'translateY(-2px)' : 'none',
    animation: shake && !reduce ? 'gfShake 0.35s ease' : 'none',
    transition: reduce ? 'none' : 'all 140ms',
  }
}

// Render the postcard text, replacing [GAP1]/[GAP2] with styled blanks.
function renderText(scene: GapFillScene, filled: Record<string, string>, nextGap: string | null, shakeGap: string | null, reduce: boolean) {
  const parts: React.ReactNode[] = []
  let rest = scene.text
  let i = 0
  const gapIds = scene.gaps.map((g) => g.id)
  for (const gid of gapIds) {
    const marker = `[${gid}]`
    const idx = rest.indexOf(marker)
    if (idx < 0) continue
    if (idx > 0) parts.push(<span key={`t${i++}`}>{rest.slice(0, idx)}</span>)
    const value = filled[gid]
    const isNext = gid === nextGap
    const isShaking = gid === shakeGap
    parts.push(
      <span
        key={gid}
        style={{
          display: 'inline-block', minWidth: 80, textAlign: 'center',
          borderBottom: `2px solid ${value ? GREEN : isNext ? AMBER_STR : 'rgba(246,239,226,0.5)'}`,
          color: value ? GREEN : isNext ? AMBER_SOFT : 'rgba(246,239,226,0.45)',
          fontStyle: value ? 'normal' : 'italic', fontWeight: value ? 700 : 400,
          padding: '0 4px', margin: '0 2px',
          animation: isShaking && !reduce ? 'gfShake 0.35s ease' : 'none',
          transition: reduce ? 'none' : 'all 160ms',
        }}
      >
        {value ?? '___'}
      </span>,
    )
    rest = rest.slice(idx + marker.length)
    i++
  }
  if (rest) parts.push(<span key={`t${i}`}>{rest}</span>)
  return parts
}

// =========================================================================
// GapFill3D — default export
// =========================================================================
export default function GapFill3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // ── Resolve puzzle ─────────────────────────────────────────────────────────
  const activePuzzle = useMemo<GapFillPuzzle>(() => {
    const p = puzzle as GapFillPuzzle | undefined
    if (p && Array.isArray(p.scenes) && p.scenes.length > 0) return p
    if (vocab && vocab.length >= 3) {
      const gen = generateGapFill(
        vocab.map((v) => ({ word: v.word, word_pl: v.word_pl ?? '', exampleEn: v.exampleEn })),
        { sceneCount: 5, seed: 0xD057 },
      )
      if (gen.scenes.length > 0) return gen
    }
    return DEMO
  }, [puzzle, vocab])

  const scenes = activePuzzle.scenes
  const total = scenes.length

  // ── State ─────────────────────────────────────────────────────────────────
  const [sceneIdx, setSceneIdx] = useState(0)
  const [filled, setFilled] = useState<Record<string, string>>({}) // gapId → answer
  const [shakeGap, setShakeGap] = useState<string | null>(null)
  const [shakeWord, setShakeWord] = useState<string | null>(null)
  const [solvedScenes, setSolvedScenes] = useState<number>(0)
  const [live, setLive] = useState('')
  const fired = useRef(false)
  const startMs = useRef(performance.now())
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cur: GapFillScene | undefined = scenes[sceneIdx]
  const allGapsFilled = cur ? cur.gaps.every((g) => !!filled[g.id]) : false
  const nextGap = cur ? (cur.gaps.find((g) => !filled[g.id])?.id ?? null) : null
  const done = solvedScenes >= total

  // Reset per scene.
  useEffect(() => { setFilled({}); setShakeGap(null); setShakeWord(null); setLive('') }, [sceneIdx])

  // Auto-advance when all gaps filled correctly.
  useEffect(() => {
    if (!allGapsFilled || !cur) return
    const id = window.setTimeout(() => {
      setSolvedScenes((s) => s + 1)
      setSceneIdx((i) => Math.min(i + 1, total - 1))
      setLive('Postcard restored — it can sail now.')
    }, 900)
    return () => clearTimeout(id)
  }, [allGapsFilled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Single-fire session complete.
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('All postcards restored. They can all sail home now.')
    const result: SessionResult = {
      correctCount: solvedScenes,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'gapfill',
    }
    onSessionComplete?.(result)
  }, [done, solvedScenes, total, onSessionComplete])

  // ── Interaction ─────────────────────────────────────────────────────────────
  const tapWord = useCallback((word: string) => {
    if (!cur || !nextGap) return
    const gap = cur.gaps.find((g) => g.id === nextGap)
    if (!gap) return
    const correct = word.toLowerCase() === gap.answer.toLowerCase() ||
      (gap.acceptedAnswers ?? []).includes(word.toLowerCase())
    if (correct) {
      setFilled((f) => ({ ...f, [nextGap]: word }))
      setLive(`Correct — ${word}.`)
    } else {
      setShakeGap(nextGap)
      setShakeWord(word)
      setLive(`Not quite — look at the sentence again. Try another word.`)
      if (shakeTimer.current) clearTimeout(shakeTimer.current)
      shakeTimer.current = setTimeout(() => { setShakeGap(null); setShakeWord(null) }, 600)
    }
  }, [cur, nextGap])

  const skip = useCallback(() => {
    setSolvedScenes((s) => s + 1)
    setSceneIdx((i) => Math.min(i + 1, total - 1))
  }, [total])

  // Keyboard: 1-N selects from bank; S skips; Esc if anything.
  useEffect(() => {
    if (!cur) return
    const h = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= cur.bank.length) { e.preventDefault(); tapWord(cur.bank[n - 1]); return }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); skip() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [cur, tapWord, skip])

  useEffect(() => () => { if (shakeTimer.current) clearTimeout(shakeTimer.current) }, [])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    setSceneIdx(0); setFilled({}); setShakeGap(null); setShakeWord(null)
    setSolvedScenes(0); setLive('')
  }, [])

  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : 'idle'

  // ── DOM overlay ─────────────────────────────────────────────────────────────
  const overlay = cur ? (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>Postcard Pier · Tideway Line</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: AMBER_SOFT }}>Posta&apos;s Smudged Postcard</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_STR}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{solvedScenes}</span>
          <span style={{ opacity: 0.6 }}> / {total} restored</span>
        </div>
      </div>

      {/* The postcard — the exercise surface */}
      <div style={{
        position: 'absolute', top: '22%', left: '50%', transform: 'translateX(-50%)',
        width: 'min(540px,86vw)',
        background: 'rgba(246,239,226,0.96)', borderRadius: 6,
        padding: '22px 26px 20px', boxShadow: '0 18px 48px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(0,0,0,0.1)',
        pointerEvents: 'none',
      }}>
        {/* Postcard stamp area */}
        <div style={{ position: 'absolute', top: 10, right: 14, width: 32, height: 38, background: 'rgba(43,95,110,0.18)', border: '1px solid rgba(43,95,110,0.4)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 7, color: '#2B5F6E', letterSpacing: '0.08em', fontFamily: 'Georgia, serif' }}>METRO POST</span>
        </div>
        {/* Rain-smudge effect — faint grey horizontal lines */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 6, background: 'repeating-linear-gradient(180deg, rgba(180,170,160,0.0) 0px, rgba(180,170,160,0.0) 17px, rgba(180,170,160,0.07) 17px, rgba(180,170,160,0.07) 18px)', pointerEvents: 'none' }} />

        {/* Posta's label */}
        <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#2B5F6E', marginBottom: 10, fontFamily: 'ui-monospace, monospace' }}>
          POSTCARD · POSTA &amp; WREN
        </div>

        {/* The gap-fill sentence */}
        <div style={{ fontSize: 19, lineHeight: 1.65, color: INK, fontFamily: 'Georgia, serif' }}>
          {renderText(cur, filled, nextGap, shakeGap, reduce)}
        </div>

        {/* Hint / clue */}
        <div style={{ marginTop: 12, fontSize: 11, fontStyle: 'italic', color: '#5a4a3a', opacity: 0.8, fontFamily: 'Georgia, serif' }}>
          {cur.hint}
        </div>
      </div>

      {/* Word bank */}
      <div style={{
        position: 'absolute', bottom: 68, left: 14, right: 14,
        display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
        pointerEvents: 'auto',
      }}>
        {cur.bank.map((word, i) => {
          const isUsed = Object.values(filled).includes(word)
          const isShaking = word === shakeWord
          return (
            <button
              key={word}
              type="button"
              onClick={() => !isUsed && tapWord(word)}
              disabled={isUsed || allGapsFilled}
              aria-label={`Word: ${word}${isUsed ? ', already placed' : ''}`}
              aria-keyshortcuts={String(i + 1)}
              style={bankBtn(false, isUsed, isShaking, reduce)}
            >
              {word}
            </button>
          )
        })}
      </div>

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 14, left: 14, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button
          onClick={skip}
          style={{ minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)', border: '1px solid rgba(232,146,10,0.4)', color: AMBER_SOFT, fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer', touchAction: 'manipulation' }}
          aria-label="Skip this postcard"
        >SKIP →</button>
      </div>
      <div style={{ position: 'absolute', bottom: 20, right: 14, fontSize: 10, opacity: 0.5 }}>
        Press 1–{cur.bank.length} to pick a word · S to skip
      </div>

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="All postcards restored" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_STR}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 30, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The postcards can sail.</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}><strong style={{ color: GREEN }}>{solvedScenes}</strong> / {total} restored</div>
          <div style={{ fontSize: 12, opacity: 0.65, fontStyle: 'italic', maxWidth: 280, textAlign: 'center' }}>Posta watches them drift out on the water, amber-lit.</div>
          <button onClick={reset} style={{ ...bankBtn(false, false, false, false), background: AMBER_STR, color: INK, border: `2px solid ${AMBER_STR}` }}>Restore again →</button>
        </div>
      )}

      <style>{`@keyframes gfShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}`}</style>
    </div>
  ) : null

  return (
    <div
      role="application"
      aria-label="Posta's Smudged Postcard — fill in the missing words to restore the postcard"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 2.6, 7.0]}
        cameraFov={46}
        overlay={overlay}
      >
        <PierScene
          solvedCount={solvedScenes}
          total={total}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
        />
      </CityStage>
    </div>
  )
}
