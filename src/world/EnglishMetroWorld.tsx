// EnglishMetroWorld — WorldKit foundation (W1: world-englishmetro chunk).
//
// The canvas and atmosphere that hosts the English Metro RPG. W1 ships the
// stage: dusk-London plaza, lamp ring, building silhouette, drifting amber
// motes, and the "Enter the City" DOM overlay. No player yet (W2 adds Wren).
//
// CONTRACT compliance (docs/game3d/CONTRACT.md + Addendum A, approved):
//   • Implements Game3DProps → onSessionComplete fires on explicit exit.
//   • Built-in demo for anonymous play (no puzzle/vocab required).
//   • Fullscreen CityStage canvas, aria-hidden. English in DOM overlay only.
//   • Zero new npm deps. All imports from existing three/r3f/drei + GameKit.
//   • Budget: world-englishmetro chunk target ≤ 600 KB gz (Addendum A).
//   • DPR ≤ 1.5, draw calls < 150 (actual: ~8). reducedMotion honored.
//   • No per-frame allocations — scratch objects declared at module scope.
//   • Keyboard (Escape to exit) + pointer (touch/click Begin/Exit buttons).
//   • Canvas aria-hidden; live-region announces state changes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Color,
  FogExp2,
  Object3D,
  Float32BufferAttribute,
  BufferGeometry,
} from 'three'
import type {
  InstancedMesh,
  Mesh,
  Points as ThreePoints,
} from 'three'
import type { Game3DProps, SessionResult } from '../practice/shells3d/types'
import { CityStage, useStageQuality } from '../practice/shells3d/kit/CityStage'
import { palette } from '../practice/shells3d/kit/palette'

// ─── Scratch (no per-frame allocations) ────────────────────────────────────
const _obj = new Object3D()
const _col = new Color()

// ─── Layout constants ────────────────────────────────────────────────────────
const LAMP_COUNT       = 16
const BUILDING_COUNT   = 24
const MOTE_COUNT       = 64
const LAMP_RING_RADIUS = 8.5
const FONT_DISPLAY     = '"Space Grotesk", "Inter", ui-sans-serif, system-ui, sans-serif'

// ─── Fog ──────────────────────────────────────────────────────────────────────
function SceneFog() {
  const { scene } = useThree()
  useEffect(() => {
    scene.fog = new FogExp2(palette.duskMid, 0.028)
    return () => { scene.fog = null }
  }, [scene])
  return null
}

// ─── Ground plane ─────────────────────────────────────────────────────────────
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[120, 120]} />
      <meshToonMaterial color="#2A5560" />
    </mesh>
  )
}

// ─── Lamp ring ────────────────────────────────────────────────────────────────
// 16 instanced posts (brass cylinders) + 16 instanced amber glow caps.
// Draw calls: 2 (one InstancedMesh each).
function LampRing() {
  const postRef  = useRef<InstancedMesh>(null!)
  const glowRef  = useRef<InstancedMesh>(null!)
  const baseRef  = useRef<InstancedMesh>(null!)
  const { settings } = useStageQuality()

  useEffect(() => {
    for (let i = 0; i < LAMP_COUNT; i++) {
      const angle = (i / LAMP_COUNT) * Math.PI * 2
      const x = Math.cos(angle) * LAMP_RING_RADIUS
      const z = Math.sin(angle) * LAMP_RING_RADIUS

      // Post — stand at ground level
      _obj.position.set(x, 1.4, z)
      _obj.scale.setScalar(1)
      _obj.rotation.set(0, 0, 0)
      _obj.updateMatrix()
      postRef.current.setMatrixAt(i, _obj.matrix)

      // Base disc
      _obj.position.set(x, 0.08, z)
      _obj.scale.set(0.3, 1, 0.3)
      _obj.rotation.set(0, 0, 0)
      _obj.updateMatrix()
      baseRef.current.setMatrixAt(i, _obj.matrix)

      // Glow cap — sits on top of the post
      _obj.position.set(x, 2.88, z)
      _obj.scale.setScalar(settings.particles > 0 ? 0.28 : 0.22)
      _obj.rotation.set(0, 0, 0)
      _obj.updateMatrix()
      glowRef.current.setMatrixAt(i, _obj.matrix)
    }
    postRef.current.instanceMatrix.needsUpdate = true
    glowRef.current.instanceMatrix.needsUpdate = true
    baseRef.current.instanceMatrix.needsUpdate  = true
  }, [settings.particles])

  return (
    <>
      {/* Post shaft */}
      <instancedMesh ref={postRef} args={[undefined, undefined, LAMP_COUNT]}
        castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.055, 0.07, 2.8, 6]} />
        <meshToonMaterial color={palette.brass} />
      </instancedMesh>
      {/* Base disc */}
      <instancedMesh ref={baseRef} args={[undefined, undefined, LAMP_COUNT]}
        frustumCulled={false}>
        <cylinderGeometry args={[1, 1.1, 0.15, 8]} />
        <meshToonMaterial color={palette.brass} />
      </instancedMesh>
      {/* Amber glow cap — MeshBasicMaterial so it never goes dark */}
      <instancedMesh ref={glowRef} args={[undefined, undefined, LAMP_COUNT]}
        frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color={palette.lanternAmber} />
      </instancedMesh>
    </>
  )
}

// ─── Point lights for amber glow (only 4 — budget-safe) ─────────────────────
// Covers cardinal lamps; remaining 12 are lit by the shared directional + ambient.
function LampLights() {
  const { settings } = useStageQuality()
  if (!settings.shadows) return null   // skip on medium/low — ambient is enough
  const positions: [number, number, number][] = [
    [LAMP_RING_RADIUS, 2.9, 0],
    [-LAMP_RING_RADIUS, 2.9, 0],
    [0, 2.9, LAMP_RING_RADIUS],
    [0, 2.9, -LAMP_RING_RADIUS],
  ]
  return (
    <>
      {positions.map(([x, y, z], i) => (
        <pointLight key={i} position={[x, y, z]}
          color={palette.lanternAmber} intensity={1.8} distance={10} decay={2} />
      ))}
    </>
  )
}

// ─── Building silhouette ──────────────────────────────────────────────────────
// 24 instanced boxes spread in an arc behind the lamp ring (z = -20 to -55).
// Very dark (palette.night = #0a0418). Draw call: 1.
function BuildingSkyline() {
  const ref = useRef<InstancedMesh>(null!)
  _col.set(palette.night)

  useEffect(() => {
    for (let i = 0; i < BUILDING_COUNT; i++) {
      // Spread across -75° to +75° arc, varying depth
      const t       = i / (BUILDING_COUNT - 1)              // 0..1
      const angle   = (t - 0.5) * 2.6                       // −1.3 to +1.3 rad
      const depth   = 28 + (i % 4) * 7                      // 28..49
      const height  = 3 + ((i * 3.17) % 12)                 // 3..15 units
      const width   = 2 + ((i * 1.97) % 3.5)                // 2..5.5 units
      const x       = Math.sin(angle) * depth * 0.55
      const z       = -depth + Math.cos(angle) * depth * 0.1

      _obj.position.set(x, height / 2, z)
      _obj.scale.set(width, height, 2 + ((i * 0.73) % 3))
      _obj.rotation.set(0, 0, 0)
      _obj.updateMatrix()
      ref.current.setMatrixAt(i, _obj.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, BUILDING_COUNT]}
      frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshToonMaterial color={palette.night} />
    </instancedMesh>
  )
}

// ─── Floating amber motes ─────────────────────────────────────────────────────
// 64 Points that drift upward; reset to base when they reach ceiling.
// Skipped entirely when reducedMotion = true. Draw call: 1.
function FloatingMotes({ active }: { active: boolean }) {
  const geomRef = useRef<BufferGeometry>(null!)
  const ptsRef  = useRef<ThreePoints>(null!)

  // Deterministic initial positions (no Math.random — uses prime multipliers)
  const initPositions = useMemo(() => {
    const arr = new Float32Array(MOTE_COUNT * 3)
    for (let i = 0; i < MOTE_COUNT; i++) {
      const angle   = (i / MOTE_COUNT) * Math.PI * 2 * 3.1 // spiral spread
      const radius  = 2 + (i % 11) * 0.9                   // 2..11.8
      arr[i * 3]     = Math.cos(angle) * radius
      arr[i * 3 + 1] = (i * 1.73) % 5.5                    // staggered heights
      arr[i * 3 + 2] = Math.sin(angle) * radius
    }
    return arr
  }, [])

  useEffect(() => {
    if (!geomRef.current) return
    const attr = new Float32BufferAttribute(initPositions.slice(), 3)
    geomRef.current.setAttribute('position', attr)
  }, [initPositions])

  useFrame((_, delta) => {
    if (!active || !geomRef.current) return
    const attr = geomRef.current.attributes.position as Float32BufferAttribute
    const arr  = attr.array as Float32Array
    const rise = delta * 0.35
    for (let i = 0; i < MOTE_COUNT; i++) {
      arr[i * 3 + 1] += rise
      if (arr[i * 3 + 1] > 6) arr[i * 3 + 1] = 0.05
    }
    attr.needsUpdate = true
  })

  if (!active) return null

  return (
    <points ref={ptsRef}>
      <bufferGeometry ref={geomRef} />
      <pointsMaterial
        color={palette.lanternAmber}
        size={0.14}
        sizeAttenuation
        transparent
        opacity={0.72}
        depthWrite={false}
      />
    </points>
  )
}

// ─── Gentle camera drift (high only, respects reducedMotion) ─────────────────
function CameraDrift({ active }: { active: boolean }) {
  const { camera } = useThree()
  const t = useRef(0)

  useFrame((_, delta) => {
    if (!active) return
    t.current += delta * 0.12
    camera.position.x = Math.sin(t.current) * 0.6
    camera.position.y = 5 + Math.sin(t.current * 0.7) * 0.25
    camera.lookAt(0, 0.5, 0)
  })

  return null
}

// ─── Scene root ──────────────────────────────────────────────────────────────
interface SceneProps {
  motesActive: boolean
  driftActive: boolean
}
function WorldScene({ motesActive, driftActive }: SceneProps) {
  return (
    <>
      <SceneFog />
      <Ground />
      <LampRing />
      <LampLights />
      <BuildingSkyline />
      <FloatingMotes active={motesActive} />
      <CameraDrift active={driftActive} />
    </>
  )
}

// ─── UI states ────────────────────────────────────────────────────────────────
type WorldPhase = 'title' | 'ambient'

// ─── EnglishMetroWorld ────────────────────────────────────────────────────────
export default function EnglishMetroWorld({
  onSessionComplete,
  quality,
  reducedMotion = false,
  // fullscreen intentionally defaults false — GameHome's PlayOverlay already
  // provides the fixed-fullscreen container. Pass fullscreen={true} explicitly
  // when mounting outside PlayOverlay (e.g. a dedicated /world route in W4+).
  fullscreen = false,
}: Game3DProps) {
  const [phase, setPhase]  = useState<WorldPhase>('title')
  const startMs            = useRef(Date.now())
  const announced          = useRef('')

  // ── Exit handler ──────────────────────────────────────────────────────────
  const handleExit = useCallback(() => {
    const result: SessionResult = {
      correctCount:   0,
      totalQuestions: 0,
      durationMs:     Date.now() - startMs.current,
      shellKey:       'world-englishmetro',
    }
    onSessionComplete?.(result)
  }, [onSessionComplete])

  // ── Begin the journey ──────────────────────────────────────────────────────
  const handleBegin = useCallback(() => {
    setPhase('ambient')
    announced.current = 'You have entered the city. Press Escape to leave.'
  }, [])

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleExit])

  // ── Animation flags ────────────────────────────────────────────────────────
  const motesActive = !reducedMotion
  const driftActive = !reducedMotion && phase === 'ambient'

  return (
    <CityStage
      quality={quality}
      reducedMotion={reducedMotion}
      fullscreen={fullscreen}
      onError={handleExit}
      cameraPosition={[0, 5, 18]}
      cameraFov={55}
      overlay={
        <>
          {/* Screen-reader live region */}
          <div aria-live="polite" aria-atomic="true"
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden',
              clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
            {announced.current}
          </div>

          {/* Title screen */}
          {phase === 'title' && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(180deg, rgba(10,4,24,0.55) 0%, rgba(26,35,72,0.4) 100%)',
              pointerEvents: 'none',
            }}>
              <div style={{ textAlign: 'center', pointerEvents: 'auto', padding: '0 24px' }}>
                {/* Logo */}
                <div style={{
                  fontFamily: FONT_DISPLAY, fontWeight: 700,
                  fontSize: 'clamp(36px, 10vw, 88px)',
                  letterSpacing: '-0.04em', lineHeight: 0.95,
                  color: '#F5F0FA', marginBottom: 10,
                  textShadow: '0 0 40px rgba(107,79,160,0.6)',
                }}>
                  ENGLISH{' '}
                  <span style={{ color: palette.lanternAmber, textShadow: `0 0 24px ${palette.lanternAmber}99` }}>
                    METRO
                  </span>
                </div>
                {/* Tagline */}
                <p style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 'clamp(14px, 2.5vw, 20px)',
                  color: 'rgba(245,240,250,0.65)',
                  letterSpacing: '0.08em', margin: '0 0 40px',
                }}>
                  A city that speaks
                </p>
                {/* Begin CTA */}
                <button
                  type="button"
                  onClick={handleBegin}
                  style={{
                    fontFamily: FONT_DISPLAY, fontWeight: 700,
                    fontSize: 'clamp(14px, 2vw, 18px)',
                    color: palette.night,
                    background: palette.lanternAmber,
                    border: 'none', borderRadius: 9999,
                    padding: '14px 36px',
                    cursor: 'pointer', letterSpacing: '0.03em',
                    boxShadow: `0 0 32px ${palette.lanternAmber}88, 0 4px 24px rgba(0,0,0,0.4)`,
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
                  }}
                >
                  Begin the journey →
                </button>
              </div>
            </div>
          )}

          {/* Ambient HUD (after Begin) */}
          {phase === 'ambient' && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'flex-end', alignItems: 'flex-end',
              padding: '24px',
              pointerEvents: 'none',
            }}>
              {/* District label */}
              <div style={{
                position: 'absolute', top: 24, left: '50%',
                transform: 'translateX(-50%)',
                fontFamily: FONT_DISPLAY,
                fontSize: 'clamp(11px, 1.5vw, 14px)',
                letterSpacing: '0.28em', textTransform: 'uppercase',
                color: 'rgba(245,240,250,0.55)',
                textShadow: '0 1px 8px rgba(0,0,0,0.6)',
                whiteSpace: 'nowrap',
              }}>
                Lanterngate · The City
              </div>

              {/* Bajla hint */}
              <div style={{
                position: 'absolute', bottom: 80, left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(10,4,24,0.72)',
                backdropFilter: 'blur(8px)',
                borderRadius: 12,
                padding: '10px 20px',
                fontFamily: FONT_DISPLAY,
                fontSize: 'clamp(12px, 1.6vw, 15px)',
                color: 'rgba(245,240,250,0.78)',
                textAlign: 'center',
                border: '1px solid rgba(107,79,160,0.35)',
                maxWidth: 380,
              }}>
                🦉 &ldquo;The lamps remember every word you learn.&rdquo; — Bajla
              </div>

              {/* Exit button */}
              <button
                type="button"
                onClick={handleExit}
                style={{
                  fontFamily: FONT_DISPLAY, fontWeight: 600,
                  fontSize: 13, color: 'rgba(245,240,250,0.6)',
                  background: 'rgba(10,4,24,0.55)',
                  border: '1px solid rgba(245,240,250,0.18)',
                  borderRadius: 8, padding: '8px 16px',
                  cursor: 'pointer', pointerEvents: 'auto',
                  letterSpacing: '0.06em',
                }}
              >
                Exit city  ⎋
              </button>
            </div>
          )}
        </>
      }
    >
      <WorldScene motesActive={motesActive} driftActive={driftActive} />
    </CityStage>
  )
}
