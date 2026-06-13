// SpinTheWheel3D — "Pier Carnival Wheel", the Brighton Pier Carnival district.
//
// A three.js re-skin of the canonical 2D Spin the Wheel shell (src/practice/
// shells/SpinTheWheel.tsx). The MECHANIC, scoring, round count, hint/skip
// rules and the weighted-random landing are inherited verbatim from the 2D
// shell — this file changes only the stagecraft. Same puzzle in (ArcadePuzzle),
// same session result out (SessionResult). Built on the Fluent City GameKit
// (CityStage + useGameLoop + Bajla + palette).
//
// Fidelity note (binding, from docs/game3d/storyboards/spinthewheel.md):
// the wheel is stagecraft over the existing selection logic only. The player
// never aims the wheel — tap SPIN and the winning wedge is pre-chosen by the
// SAME weighted random (~66% correct, ~34% a random wedge) before the disc
// eases through ~5 turns to seat that wedge under the top pointer. A wrong
// landing is FORGIVING: the correct wedge is revealed in green, the lever
// relabels SPIN AGAIN, and re-spinning the same round is free. SKIP advances
// and counts as wrong. There is NO fail state — only solved / unsolved rounds.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden);
// all readable English lives in the DOM overlay (never a 3D texture — only
// single A/B/C/D glyph markers ride the disc, words live in the DOM legend);
// quality tiers + reducedMotion honoured; full keyboard + touch input;
// procedural geometry + vertex/instance colours only (no GLB, no textures, no
// external URLs, no new deps); allocation-free render loop; instanced repeats.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, MathUtils, Object3D, Vector3 } from 'three'
import type { Group, InstancedMesh, Mesh, PerspectiveCamera, PointLight } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult, Vocab3DItem } from './types'
import { generateSpinTheWheelPuzzle } from '../generators/generateSpinTheWheel'
import type { ArcadeInput, ArcadePuzzle } from '../generators/generateArcade'

// ── Canonical timing (mirrors the 2D shell's SPIN_WAIT / ADVANCE_WAIT) ────
const SPIN_DECEL_MS = 4200 // deceleration window on high/medium (2D: 4.2s)
const ADVANCE_MS = 1400 // auto-advance after a correct landing (2D: 1400ms)
const HINT_GLOW_MS = 3200 // hint highlight window (2D: 3200ms)
const HINT_MAX = 3 // hints per session (2D: 3)
const BASE_TURNS = 5 // full spins before seating the target (2D: 5 * 360)

// Carnival colourway — wedge sectors cycle through the palette, marquee amber.
const WEDGE_COLORS = [palette.gold, palette.lanternAmber, palette.leaf, palette.skyGlow, palette.bajlaPurple, palette.brass, palette.ember, palette.duskHorizon]
const GREEN = '#34D399'
const ROSE = '#FB7185'
const ACCENT = '#E879F9' // carnival magenta (mirrors the 2D ACCENT)

// ── Built-in demo puzzle — copied verbatim from the 2D shell so anonymous
// home-page play behaves identically (Game3DProps requires a demo when no
// puzzle / vocab is supplied). ───────────────────────────────────────────
const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'w1', prompt: 'A spinning fairground ride for children.', options: ['carousel', 'lantern', 'kiosk', 'pavement'], answerIndex: 0, hint: 'Horses go up and down. Music plays.', hint_pl: 'karuzela' },
    { id: 'w2', prompt: 'Sweet spun sugar treat at fairs.', options: ['toffee', 'candyfloss', 'pretzel', 'sherbet'], answerIndex: 1, hint: 'Pink, fluffy, on a stick. British English.', hint_pl: 'wata cukrowa' },
    { id: 'w3', prompt: 'Bright bulbs around a sign or wheel.', options: ['marquee', 'curtain', 'awning', 'chime'], answerIndex: 0, hint: 'Old theatre signs use them.', hint_pl: 'markiza, świecący szyld' },
    { id: 'w4', prompt: 'A small booth where someone sells things.', options: ['kiosk', 'spire', 'gable', 'trough'], answerIndex: 0, hint: 'Newspapers, flowers, fair tokens — sold here.', hint_pl: 'kiosk' },
    { id: 'w5', prompt: 'A row of coloured pennants on a string.', options: ['bunting', 'gutter', 'plinth', 'apron'], answerIndex: 0, hint: 'Strung between poles for festivals.', hint_pl: 'girlanda flag' },
    { id: 'w6', prompt: 'Game where you toss rings onto a peg.', options: ['hoopla', 'cricket', 'darts', 'mahjong'], answerIndex: 0, hint: 'British fairground classic. Throw, hope.', hint_pl: 'gra w obręcze' },
  ],
}

// Per-shell answer-leak guard — belt-and-suspenders with the generator's
// maskAnswerInPrompt. If the rendered prompt contains the answer word
// (case-insensitive, whole word) replace it with `___`. (Mirrors the 2D shell.)
function maskAnswerInPrompt(prompt: string | undefined, answer: string | undefined): string {
  if (!prompt) return ''
  if (!answer) return prompt
  const ans = answer.toLowerCase().trim()
  if (!ans) return prompt
  const safe = ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return prompt.replace(new RegExp(`\\b${safe}\\b`, 'gi'), '___')
}

const wedgeLetter = (i: number): string => String.fromCharCode(65 + i) // A, B, C, D…

const vocabToArcade = (v: Vocab3DItem[]): ArcadeInput[] =>
  v.map((it) => ({ word: it.word, word_pl: it.word_pl ?? '', clue: it.exampleEn, partOfSpeech: it.partOfSpeech, topic: it.topic }))

// ── Allocation-free scratch objects (single canvas, single game instance) ─
const _obj = new Object3D()
const _col = new Color()
const _vWedge = new Color()
const _proj = new Vector3()

// Geometry constants for the disc (XY plane facing camera at +Z).
const WHEEL_R = 1.9
const HUB_R = 0.32
const WHEEL_Z = 0
const POINTER_TOP = WHEEL_R + 0.34

// Disc spin model lives in a ref so the render loop reads it allocation-free.
interface SpinState {
  angle: number // current rotation (radians), grows monotonically
  from: number // angle at the start of the active ease
  to: number // target angle the ease seats at
  startMs: number // performance.now() when the ease began
  durMs: number // ease duration (0 ⇒ snap, for reducedMotion)
  spinning: boolean
}

// =========================================================================
// Scene (inside the Canvas — reads the live spin ref each frame)
// =========================================================================
interface SceneProps {
  spin: React.MutableRefObject<SpinState>
  wedgeCount: number
  landedOn: number | null
  answerIndex: number
  feedback: 'correct' | 'wrong' | null
  hintActive: boolean
  reducedMotion: boolean
  bajla: 'idle' | 'flyby' | 'celebrate'
  letterRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
  onSpinSettle: () => void
}

function CarnivalScene({ spin, wedgeCount, landedOn, answerIndex, feedback, hintActive, reducedMotion, bajla, letterRefs, onSpinSettle }: SceneProps) {
  const { settings, tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion

  return (
    <group>
      <CameraRig drift={highFx} reducedMotion={reducedMotion} />
      {tier === 'high' && <fog attach="fog" args={[palette.duskHorizon, 12, 30]} />}

      <Pier shadows={settings.shadows} />
      <Sea shimmer={highFx} reducedMotion={reducedMotion} />
      <Skyline />
      <Festoon flicker={tier !== 'low' && !reducedMotion} highFx={highFx} />

      <Wheel
        spin={spin}
        wedgeCount={wedgeCount}
        landedOn={landedOn}
        answerIndex={answerIndex}
        feedback={feedback}
        hintActive={hintActive}
        reducedMotion={reducedMotion}
        shadows={settings.shadows}
        onSpinSettle={onSpinSettle}
      />
      <Pointer spin={spin} reducedMotion={reducedMotion} />
      {settings.particles > 0 && feedback === 'correct' && !reducedMotion && (
        <Confetti density={settings.particles} />
      )}
      <LetterProjector wedgeCount={wedgeCount} spin={spin} letterRefs={letterRefs} />

      <Bajla variant={bajla} reducedMotion={reducedMotion} scale={0.5} position={[2.9, -0.35, 1.1]} />
    </group>
  )
}

function CameraRig({ drift, reducedMotion }: { drift: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const base = useRef<[number, number, number]>([0, 1.4, 6.6])
  const dolly = useRef(0)
  useFrame((state, delta) => {
    const [bx, by, bz] = base.current
    // Gentle dolly-in on mount (storyboard: dolly-in + idle parallax bob).
    dolly.current = Math.min(1, dolly.current + delta * 0.5)
    const z = bz + (1 - dolly.current) * 1.2
    if (drift && !reducedMotion) {
      const t = state.clock.elapsedTime
      cam.position.set(bx + Math.sin(t * 0.22) * 0.18, by + Math.sin(t * 0.17) * 0.08, z + Math.cos(t * 0.19) * 0.12)
    } else {
      cam.position.set(bx, by, z)
    }
    cam.lookAt(0, 0.35, 0)
  })
  return null
}

// ── Hero wheel — disc + wedges + hub + rim pegs; letter markers ride the disc
// as procedural geometry only (single A/B/C/D glyphs are projected to the DOM
// via LetterProjector; full words live in the DOM legend, never a texture). ─
function Wheel({ spin, wedgeCount, landedOn, answerIndex, feedback, hintActive, reducedMotion, shadows, onSpinSettle }: {
  spin: React.MutableRefObject<SpinState>
  wedgeCount: number
  landedOn: number | null
  answerIndex: number
  feedback: 'correct' | 'wrong' | null
  hintActive: boolean
  reducedMotion: boolean
  shadows: boolean
  onSpinSettle: () => void
}) {
  const disc = useRef<Group>(null)
  const wedgesMesh = useRef<InstancedMesh>(null)
  const settled = useRef(true)

  const wedgeAngle = (Math.PI * 2) / wedgeCount

  // Wedge sector geometry is a thin cylinder slice; we instance one unit slice
  // and place a coloured highlight ring on top per state. Colours are baked
  // once into instanceColor (state highlights handled by separate meshes).
  useEffect(() => {
    const mesh = wedgesMesh.current
    if (!mesh) return
    for (let i = 0; i < wedgeCount; i++) {
      _obj.position.set(0, 0, 0)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      _col.set(WEDGE_COLORS[i % WEDGE_COLORS.length])
      mesh.setColorAt(i, _col)
    }
    mesh.count = wedgeCount
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [wedgeCount])

  useFrame(() => {
    const g = disc.current
    if (!g) return
    const s = spin.current
    if (s.spinning) {
      settled.current = false
      if (s.durMs <= 0) {
        // reducedMotion — snap to target in ~one frame (mirrors 2D collapse).
        s.angle = s.to
        s.spinning = false
        onSpinSettle()
      } else {
        const p = MathUtils.clamp((performance.now() - s.startMs) / s.durMs, 0, 1)
        // Ease-out cubic — matches the 2D cubic-bezier(.17,.67,.16,1) feel.
        const e = 1 - Math.pow(1 - p, 3)
        s.angle = s.from + (s.to - s.from) * e
        if (p >= 1) {
          s.angle = s.to
          s.spinning = false
          onSpinSettle()
        }
      }
    } else if (!settled.current) {
      settled.current = true
    }
    // Pointer is at top; the disc rotates about +Z. Negative because wedge i is
    // centred clockwise from the top in screen space (mirrors the 2D maths).
    g.rotation.z = -s.angle
  })

  // Highlight wedges for the landed/correct/hint states — separate static
  // overlay sectors (rotate with the disc so they cover the right wedge).
  const highlights = useMemo(() => {
    const out: { i: number; kind: 'landed-wrong' | 'correct' | 'hint' }[] = []
    for (let i = 0; i < wedgeCount; i++) {
      if (hintActive && i === answerIndex) out.push({ i, kind: 'hint' })
      if (feedback && i === answerIndex) out.push({ i, kind: 'correct' })
      if (feedback === 'wrong' && landedOn === i && i !== answerIndex) out.push({ i, kind: 'landed-wrong' })
    }
    return out
  }, [wedgeCount, hintActive, feedback, landedOn, answerIndex])

  return (
    <group position={[0, 0.35, WHEEL_Z]}>
      {/* Back-plate behind the disc — dark lacquer the wedges sit proud of. */}
      <mesh position={[0, 0, -0.14]}>
        <cylinderGeometry args={[WHEEL_R + 0.16, WHEEL_R + 0.16, 0.12, 48]} />
        <meshStandardMaterial color={palette.night} roughness={0.85} metalness={0.2} />
      </mesh>

      {/* Spinning disc group — wedges, letter posts, hub all ride this node. */}
      <group ref={disc} rotation={[Math.PI / 2, 0, 0]}>
        {/* Wedge sectors (instanced thin cylinder slices) */}
        <instancedMesh ref={wedgesMesh} args={[undefined, undefined, Math.max(1, wedgeCount)]} frustumCulled={false} castShadow={shadows}>
          <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.16, 64, 1, false, 0, wedgeAngle]} />
          <meshStandardMaterial roughness={0.55} metalness={0.15} vertexColors />
        </instancedMesh>

        {/* State highlight sectors — green for correct, rose for a wrong
           landing, amber for an active hint. Procedural geometry only. */}
        {highlights.map((h, k) => {
          const col = h.kind === 'landed-wrong' ? ROSE : h.kind === 'hint' ? palette.lanternAmber : GREEN
          return (
            <mesh key={`${h.i}-${h.kind}-${k}`} position={[0, 0.1, 0]} rotation={[0, h.i * wedgeAngle, 0]}>
              <cylinderGeometry args={[WHEEL_R + 0.02, WHEEL_R + 0.02, 0.08, 32, 1, false, 0, wedgeAngle]} />
              <meshStandardMaterial color={col} emissive={col} emissiveIntensity={h.kind === 'hint' ? 0.9 : 0.7} roughness={0.4} transparent opacity={0.92} />
            </mesh>
          )
        })}

        {/* Spoke dividers between wedges */}
        {Array.from({ length: wedgeCount }).map((_, i) => (
          <mesh key={`sp-${i}`} rotation={[0, i * wedgeAngle, 0]} position={[0, 0.09, 0]}>
            <boxGeometry args={[0.03, 0.04, WHEEL_R * 2]} />
            <meshStandardMaterial color={palette.night} roughness={0.7} />
          </mesh>
        ))}

        {/* Hub — brass cap + magenta core */}
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[HUB_R, HUB_R, 0.2, 28]} />
          <meshStandardMaterial color={palette.brass} roughness={0.4} metalness={0.6} emissive={palette.brass} emissiveIntensity={0.15} />
        </mesh>
        <mesh position={[0, 0.24, 0]}>
          <cylinderGeometry args={[HUB_R * 0.45, HUB_R * 0.45, 0.06, 20]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.5} roughness={0.4} />
        </mesh>
      </group>

      {/* Static brass rim around the disc (does not rotate). */}
      <RimGlow feedback={feedback} reducedMotion={reducedMotion} />
    </group>
  )
}

// Brass rim torus that pulses the marquee on a correct landing.
function RimGlow({ feedback, reducedMotion }: { feedback: 'correct' | 'wrong' | null; reducedMotion: boolean }) {
  const ring = useRef<Mesh>(null)
  useFrame((state) => {
    const m = ring.current
    if (!m) return
    const mat = m.material as { emissiveIntensity?: number; color?: Color; emissive?: Color }
    if (!mat) return
    const base = 0.25
    if (reducedMotion) { mat.emissiveIntensity = feedback === 'correct' ? 0.9 : base; return }
    const pulse = Math.sin(state.clock.elapsedTime * (feedback === 'correct' ? 8 : 2.2)) * 0.5 + 0.5
    mat.emissiveIntensity = feedback === 'correct' ? 0.6 + pulse * 0.6 : base + pulse * 0.18
  })
  return (
    <mesh ref={ring} rotation={[0, 0, 0]} position={[0, 0, 0.02]}>
      <torusGeometry args={[WHEEL_R + 0.16, 0.1, 14, 56]} />
      <meshStandardMaterial color={palette.gold} emissive={palette.lanternAmber} emissiveIntensity={0.25} roughness={0.4} metalness={0.5} />
    </mesh>
  )
}

// Top pointer / flapper — bobs at rest, ratchets while spinning.
function Pointer({ spin, reducedMotion }: { spin: React.MutableRefObject<SpinState>; reducedMotion: boolean }) {
  const flap = useRef<Group>(null)
  useFrame((state) => {
    const g = flap.current
    if (!g) return
    const s = spin.current
    if (reducedMotion) { g.rotation.z = 0; g.position.y = POINTER_TOP + 0.35; return }
    if (s.spinning) {
      // Ratchet tick across the pegs — fast small oscillation.
      g.rotation.z = Math.sin(state.clock.elapsedTime * 38) * 0.18
      g.position.y = POINTER_TOP + 0.35
    } else {
      g.rotation.z = 0
      g.position.y = POINTER_TOP + 0.35 + Math.sin(state.clock.elapsedTime * 2.2) * 0.03
    }
  })
  return (
    <group ref={flap} position={[0, POINTER_TOP + 0.35, 0.18]}>
      {/* Downward-pointing flapper triangle */}
      <mesh rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.18, 0.42, 4]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.35} roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <sphereGeometry args={[0.08, 12, 10]} />
        <meshStandardMaterial color={palette.beak} emissive={palette.beak} emissiveIntensity={0.5} />
      </mesh>
    </group>
  )
}

// Procedural pier deck + posts + booth silhouettes flanking the wheel.
function Pier({ shadows }: { shadows: boolean }) {
  const planks = useRef<InstancedMesh>(null)
  const NUM = 9
  useEffect(() => {
    const mesh = planks.current
    if (!mesh) return
    for (let i = 0; i < NUM; i++) {
      _obj.position.set(0, -1.32, -2.2 + i * 0.62)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      _col.set(i % 2 === 0 ? palette.ink : palette.duskTop)
      mesh.setColorAt(i, _col)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])
  return (
    <group>
      {/* Plank deck receding toward the wheel (instanced striped boards). */}
      <instancedMesh ref={planks} args={[undefined, undefined, NUM]} frustumCulled={false} receiveShadow={shadows}>
        <boxGeometry args={[7.4, 0.12, 0.56]} />
        <meshStandardMaterial roughness={0.95} vertexColors />
      </instancedMesh>
      {/* Brass-railed posts flanking the deck */}
      {[-2.6, 2.6].map((x, i) => (
        <group key={i} position={[x, -1.0, 0.6]}>
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 1.1, 10]} />
            <meshStandardMaterial color={palette.brass} roughness={0.5} metalness={0.5} emissive={palette.brass} emissiveIntensity={0.1} />
          </mesh>
          <mesh position={[0, 0.6, 0]}>
            <sphereGeometry args={[0.1, 12, 10]} />
            <meshStandardMaterial color={palette.gold} roughness={0.4} metalness={0.6} emissive={palette.lanternAmber} emissiveIntensity={0.25} />
          </mesh>
        </group>
      ))}
      {/* Booth + helter-skelter silhouettes (night-coloured, set back). */}
      <mesh position={[-3.4, -0.2, -1.4]}>
        <boxGeometry args={[1.1, 1.5, 1.0]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      <mesh position={[-3.4, 0.75, -1.4]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.9, 0.7, 4]} />
        <meshStandardMaterial color={palette.ink} roughness={1} />
      </mesh>
      <mesh position={[3.5, 0.1, -1.7]}>
        <coneGeometry args={[0.7, 2.6, 10]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
    </group>
  )
}

// Warm sea glow band filling the lower third behind the pier.
function Sea({ shimmer, reducedMotion }: { shimmer: boolean; reducedMotion: boolean }) {
  const plane = useRef<Mesh>(null)
  useFrame((state) => {
    const m = plane.current
    if (!m || !shimmer || reducedMotion) return
    const mat = m.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = 0.12 + Math.sin(state.clock.elapsedTime * 1.1) * 0.05
  })
  return (
    <mesh ref={plane} position={[0, -1.7, -4.2]} rotation={[-Math.PI / 2.6, 0, 0]}>
      <planeGeometry args={[26, 10]} />
      <meshStandardMaterial color={palette.duskHorizon} emissive={palette.skyGlow} emissiveIntensity={0.12} roughness={0.7} />
    </mesh>
  )
}

// Far Fluent City skyline silhouette (Big Ben) across the water.
function Skyline() {
  return (
    <group position={[0, -0.7, -5.4]}>
      <mesh position={[-2.4, 0.2, 0]}>
        <boxGeometry args={[0.5, 1.4, 0.3]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      {/* Big Ben tower + cap */}
      <mesh position={[1.8, 0.55, 0]}>
        <boxGeometry args={[0.34, 2.1, 0.34]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      <mesh position={[1.8, 1.75, 0]}>
        <coneGeometry args={[0.28, 0.5, 4]} />
        <meshStandardMaterial color={palette.ink} roughness={1} />
      </mesh>
      <mesh position={[0.2, -0.05, 0]}>
        <boxGeometry args={[2.6, 0.9, 0.25]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
    </group>
  )
}

// Festoon string-lights + marquee bulbs arcing overhead (instanced spheres).
function Festoon({ flicker, highFx }: { flicker: boolean; highFx: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const light = useRef<PointLight>(null)
  const COUNT = 24
  const positions = useMemo(() => {
    const out: [number, number, number][] = []
    for (let i = 0; i < COUNT; i++) {
      const u = i / (COUNT - 1)
      const x = -3.6 + u * 7.2
      const sag = Math.sin(u * Math.PI) * 0.5
      out.push([x, 2.7 - sag, -0.4])
    }
    return out
  }, [])
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    positions.forEach((p, i) => {
      _obj.position.set(p[0], p[1], p[2])
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      _col.set(WEDGE_COLORS[i % 4])
      mesh.setColorAt(i, _col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [positions])
  useFrame((state) => {
    if (!flicker) return
    const f = 0.6 + Math.sin(state.clock.elapsedTime * 6) * 0.12 + Math.sin(state.clock.elapsedTime * 11) * 0.06
    const mesh = inst.current
    if (mesh) {
      const mat = mesh.material as { emissiveIntensity?: number }
      if (mat) mat.emissiveIntensity = 0.7 + f * 0.4
    }
    if (light.current) light.current.intensity = 0.5 + f * 0.4
  })
  return (
    <group>
      <instancedMesh ref={inst} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.075, 10, 8]} />
        <meshStandardMaterial vertexColors emissive={palette.lanternCore} emissiveIntensity={0.8} roughness={0.6} />
      </instancedMesh>
      {highFx && <pointLight ref={light} position={[0, 2.2, 1.5]} color={palette.lanternAmber} intensity={0.6} distance={11} decay={2} />}
    </group>
  )
}

// Ember-confetti burst on a correct landing (instanced, allocation-free).
function Confetti({ density }: { density: number }) {
  const inst = useRef<InstancedMesh>(null)
  const count = Math.max(0, Math.round(48 * density))
  const start = useRef(performance.now())
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({
    ang: (i / Math.max(1, count)) * Math.PI * 2,
    speed: 1.4 + (i % 5) * 0.4,
    spread: 0.6 + (i % 3) * 0.25,
    col: WEDGE_COLORS[i % WEDGE_COLORS.length],
  })), [count])
  useEffect(() => { start.current = performance.now() }, [])
  useFrame(() => {
    const mesh = inst.current
    if (!mesh || count === 0) return
    const t = Math.min(1.2, (performance.now() - start.current) / 1000)
    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      const r = s.speed * t * s.spread
      const x = Math.cos(s.ang) * r
      const y = 0.35 + Math.sin(s.ang) * r - t * t * 1.6
      _obj.position.set(x, y, 0.4)
      const sc = Math.max(0, 0.06 * (1 - t * 0.7))
      _obj.scale.set(sc, sc, sc)
      _obj.rotation.set(t * 6 + i, t * 5, 0)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      _vWedge.set(s.col)
      mesh.setColorAt(i, _vWedge)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  if (count === 0) return null
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 0.4]} />
      <meshStandardMaterial vertexColors emissive={palette.ember} emissiveIntensity={0.5} roughness={0.5} />
    </instancedMesh>
  )
}

// Projects each wedge's letter-marker world position (on the spinning disc) to
// screen px and writes it onto the DOM letter chips. The English option WORDS
// never touch the 3D scene — only single A/B/C/D glyphs ride the disc, exactly
// like the 2D shell's letter-marker + external-legend fix. Allocation-free.
function LetterProjector({ wedgeCount, spin, letterRefs }: { wedgeCount: number; spin: React.MutableRefObject<SpinState>; letterRefs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const wedgeAngle = (Math.PI * 2) / wedgeCount
  useFrame(() => {
    const a = spin.current.angle
    for (let i = 0; i < wedgeCount; i++) {
      const el = letterRefs.current[i]
      if (!el) continue
      // Wedge i centre at the top is angle 0; disc rotates by -a. The marker
      // sits at radius 0.66*R from centre, in the disc's local frame.
      const theta = -(i * wedgeAngle + wedgeAngle / 2) - a + Math.PI / 2
      const rr = WHEEL_R * 0.66
      _proj.set(Math.cos(theta) * rr, 0.35 + Math.sin(theta) * rr, 0.2).project(cam)
      if (_proj.z > 1) { el.style.opacity = '0'; continue }
      const x = (_proj.x * 0.5 + 0.5) * size.width
      const y = (-_proj.y * 0.5 + 0.5) * size.height
      el.style.opacity = '1'
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    }
  })
  return null
}

// =========================================================================
// SpinTheWheel3D — the Game3D component (default export)
// =========================================================================
export default function SpinTheWheel3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const activePuzzle = useMemo<ArcadePuzzle>(() => {
    const p = puzzle as ArcadePuzzle | undefined
    if (p && Array.isArray(p.rounds) && p.rounds.length > 0) return p
    if (vocab && vocab.length > 0) {
      const gen = generateSpinTheWheelPuzzle(vocabToArcade(vocab), { seed: 7 })
      if (gen && gen.rounds.length > 0) return gen
    }
    return DEMO_PUZZLE
  }, [puzzle, vocab])
  const rounds = activePuzzle.rounds
  const total = rounds.length

  const spin = useRef<SpinState>({ angle: 0, from: 0, to: 0, startMs: 0, durMs: 0, spinning: false })
  const letterRefs = useRef<(HTMLDivElement | null)[]>([])
  const startMs = useRef(performance.now())
  const fired = useRef(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [roundIdx, setRoundIdx] = useState(0)
  const [solved, setSolved] = useState<boolean[]>(() => rounds.map(() => false))
  const [spinning, setSpinning] = useState(false)
  const [landedOn, setLandedOn] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintActive, setHintActive] = useState(false)
  const [live, setLive] = useState('')

  const cur = rounds[roundIdx]
  const wedgeCount = cur ? cur.options.length : 4
  const completed = total > 0 && solved.every(Boolean)
  const correctCount = solved.filter(Boolean).length
  const answerWord = cur ? cur.options[cur.answerIndex] : ''
  const renderedPrompt = useMemo(() => maskAnswerInPrompt(cur?.prompt, answerWord), [cur?.prompt, answerWord])
  const bajla: 'idle' | 'flyby' | 'celebrate' = completed ? 'celebrate' : !spinning && roundIdx === 0 && !feedback && solved.every((v) => !v) ? 'flyby' : 'idle'

  // The selection logic, mirrored EXACTLY from the 2D shell. The winning wedge
  // is pre-chosen by the same weighted random (~66% correct). The 3D disc only
  // animates to seat that pre-chosen wedge under the top pointer.
  const launchSpin = useCallback(() => {
    if (!cur || spinning || completed) return
    setLandedOn(null)
    setFeedback(null)
    setSpinning(true)
    setLive('Wheel spinning.')

    const wedgeAngle = (Math.PI * 2) / wedgeCount
    const bias = Math.random() < 0.66 ? cur.answerIndex : Math.floor(Math.random() * wedgeCount)
    const target = bias
    // Seat target's centre under the top pointer. Wedge i centre (clockwise
    // from top) is at i*wedgeAngle + wedgeAngle/2; to land it at the top the
    // disc rotation R must satisfy (centre - R) ≡ 0, i.e. R ≡ centre (mod 2π).
    const targetCenter = target * wedgeAngle + wedgeAngle / 2
    const s = spin.current
    const baseTurns = BASE_TURNS * Math.PI * 2
    const cur0 = s.angle
    const curMod = ((cur0 % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    const finalAngle = cur0 + baseTurns + (((targetCenter - curMod) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    s.from = cur0
    s.to = finalAngle
    s.startMs = performance.now()
    s.durMs = reduce ? 0 : SPIN_DECEL_MS
    s.spinning = true
    // Stash the pre-chosen target so onSpinSettle can resolve it.
    pendingTarget.current = target
  }, [cur, spinning, completed, wedgeCount, reduce])

  const pendingTarget = useRef<number | null>(null)

  // Called by the scene when the disc finishes seating (or snaps under
  // reducedMotion). Resolves the round exactly like the 2D shell's setTimeout.
  const onSpinSettle = useCallback(() => {
    const target = pendingTarget.current
    if (target == null || !cur) return
    pendingTarget.current = null
    setSpinning(false)
    setLandedOn(target)
    const correct = target === cur.answerIndex
    setFeedback(correct ? 'correct' : 'wrong')
    if (correct) {
      setSolved((prev) => prev.map((v, i) => (i === roundIdx ? true : v)))
      setLive('Correct.')
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      advanceTimer.current = setTimeout(() => {
        if (roundIdx + 1 < total) {
          setRoundIdx((i) => i + 1)
          setLandedOn(null)
          setFeedback(null)
        }
      }, reduce ? 16 : ADVANCE_MS)
    } else {
      // Forgiving: reveal correct wedge, allow a free re-spin (no auto-advance).
      setLive(`Landed on ${cur.options[target]} — spin again. The correct answer is ${answerWord}.`)
    }
  }, [cur, roundIdx, total, reduce, answerWord])

  // Fire the session result exactly once, on completion.
  useEffect(() => {
    if (completed && !fired.current) {
      fired.current = true
      setLive('The wheel rests. All rounds complete.')
      const result: SessionResult = {
        correctCount,
        totalQuestions: total,
        durationMs: Math.round(performance.now() - startMs.current),
        shellKey: 'spinthewheel',
      }
      onSessionComplete?.(result)
    }
  }, [completed, correctCount, total, onSessionComplete])

  // Keyboard — Space/Enter spins; H hints; S skips (mirrors the 2D input map).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
        e.preventDefault()
        if (!completed) launchSpin()
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        useHintRef.current()
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        skipRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [launchSpin, completed])

  // Cleanup timers on unmount.
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
  }, [])

  const useHint = useCallback(() => {
    if (hintsUsed >= HINT_MAX || spinning) return
    setHintsUsed((h) => h + 1)
    setHintActive(true)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHintActive(false), reduce ? 16 : HINT_GLOW_MS)
  }, [hintsUsed, spinning, reduce])

  // SKIP advances and counts as wrong (the round is simply left unsolved).
  const skip = useCallback(() => {
    if (spinning) return
    if (roundIdx + 1 < total) {
      setRoundIdx((i) => i + 1)
      setLandedOn(null)
      setFeedback(null)
      setLive('Skipped — next round.')
    }
  }, [spinning, roundIdx, total])

  // Stable refs so the keydown listener always calls the latest closures.
  const useHintRef = useRef(useHint)
  const skipRef = useRef(skip)
  useHintRef.current = useHint
  skipRef.current = skip

  const replay = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    fired.current = false
    startMs.current = performance.now()
    pendingTarget.current = null
    spin.current.spinning = false
    setSolved(rounds.map(() => false))
    setHintsUsed(0)
    setHintActive(false)
    setFeedback(null)
    setLanded(null)
    setSpinning(false)
    setLive('')
    setRoundIdx(0)
  }, [rounds])

  // tiny helper to keep replay tidy
  function setLanded(v: number | null) { setLandedOn(v) }

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'var(--em-mono, ui-monospace, monospace)', color: '#EDE6FF' }}>
      <style>{`
        @keyframes stw-pop { 0%{transform:translateY(8px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes stw-hint { 0%,100%{box-shadow:0 0 0 0 ${palette.lanternAmber}00} 50%{box-shadow:0 0 0 3px ${palette.lanternAmber}cc} }
      `}</style>

      {/* Screen-reader live region (canvas is aria-hidden inside CityStage) */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Prompt panel — pinned top-centre, above the wheel */}
      {cur && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 'min(560px, 90%)', padding: '10px 16px', borderRadius: 12,
          background: 'linear-gradient(90deg, rgba(232,121,249,0.16), rgba(20,12,38,0.82))',
          border: `1px solid ${ACCENT}66`, backdropFilter: 'blur(4px)',
          textAlign: 'center', animation: 'stw-pop 320ms ease',
        }} key={`p-${roundIdx}`}>
          <div style={{ fontSize: 11, letterSpacing: '0.18em', color: ACCENT, marginBottom: 4 }}>ROUND {String(roundIdx + 1).padStart(2, '0')}</div>
          <div style={{ fontFamily: 'var(--em-decor, var(--em-mono, system-ui))', fontSize: 17, lineHeight: 1.3 }}>{renderedPrompt}</div>
        </div>
      )}

      {/* HUD — SCORE / TARGET, top-left (mirrors the 2D side panel tally) */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <HudPill label="SCORE · WYNIK" value={`${correctCount} / ${total}`} />
        <HudPill label="HINTS · PODPOWIEDZI" value={`${HINT_MAX - hintsUsed} / ${HINT_MAX}`} accent={palette.lanternAmber} />
      </div>

      {/* Wedge letter chips — DOM, positioned by the 3D LetterProjector. Single
         A/B/C/D glyphs that track the spinning disc; the WORDS live in the
         legend below (never baked into a 3D texture). */}
      {cur && cur.options.map((_, i) => {
        const isAnswer = i === cur.answerIndex
        const showHint = hintActive && isAnswer
        return (
          <div
            key={`L-${i}`}
            ref={(el) => { letterRefs.current[i] = el }}
            aria-hidden="true"
            style={{
              position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none',
              width: 26, height: 26, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--em-decor, system-ui)', fontSize: 14, fontWeight: 700,
              background: 'rgba(14,10,26,0.9)', color: WEDGE_COLORS[i % WEDGE_COLORS.length],
              border: `1px solid ${showHint ? palette.lanternAmber : 'rgba(255,255,255,0.4)'}`,
              animation: showHint ? 'stw-hint 0.6s ease-in-out 3' : undefined,
            }}
          >{wedgeLetter(i)}</div>
        )
      })}

      {/* External legend — full option words, never rotate, never truncate.
         The learner reads the landed letter at the pointer, then the legend. */}
      {cur && (
        <div
          role="list"
          aria-label="Wheel legend"
          style={{
            position: 'absolute', bottom: 78, left: '50%', transform: 'translateX(-50%)',
            display: 'grid', gridTemplateColumns: `repeat(${Math.min(wedgeCount, 4)}, minmax(0, 1fr))`,
            gap: 8, width: 'min(560px, 92%)',
          }}
        >
          {cur.options.map((opt, i) => {
            const isLanded = landedOn === i
            const isCorrect = i === cur.answerIndex
            const showCorrect = (feedback === 'correct' || feedback === 'wrong') && isCorrect
            const showWrong = feedback === 'wrong' && isLanded && !isCorrect
            return (
              <div
                key={`leg-${i}`}
                role="listitem"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 10, minWidth: 0,
                  background: showCorrect ? 'rgba(52,211,153,0.18)' : showWrong ? 'rgba(251,113,133,0.16)' : 'rgba(20,12,38,0.78)',
                  border: `1px solid ${showCorrect ? `${GREEN}88` : showWrong ? `${ROSE}88` : `${WEDGE_COLORS[i % WEDGE_COLORS.length]}66`}`,
                }}
              >
                <span aria-hidden="true" style={{
                  flex: '0 0 auto', width: 22, height: 22, borderRadius: '50%',
                  background: WEDGE_COLORS[i % WEDGE_COLORS.length], color: '#0E0A1A',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--em-decor, system-ui)', fontSize: 13, fontWeight: 700,
                }}>{wedgeLetter(i)}</span>
                <span title={opt} style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#EDE6FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt}</span>
                {showCorrect && <span style={{ fontSize: 11, color: GREEN }}>✓</span>}
                {showWrong && <span style={{ fontSize: 11, color: ROSE }}>✗</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* SPIN lever — primary CTA (≥48px). Relabels SPIN AGAIN on a wrong land. */}
      <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center', pointerEvents: 'auto' }}>
        <button onClick={() => skip()} style={btnStyle()} aria-label="Skip round (counts as wrong)">SKIP</button>
        <button
          onClick={launchSpin}
          disabled={spinning || completed}
          aria-label={spinning ? 'Wheel spinning' : feedback === 'wrong' ? 'Spin again' : 'Spin the wheel'}
          style={{
            minHeight: 48, minWidth: 132, padding: '12px 28px', borderRadius: 999,
            background: spinning ? `${ACCENT}55` : ACCENT, color: '#0E0A1A', border: 'none',
            fontFamily: 'var(--em-decor, system-ui)', fontSize: 16, letterSpacing: '0.06em',
            cursor: spinning || completed ? 'not-allowed' : 'pointer', opacity: completed ? 0.5 : 1,
            boxShadow: spinning ? 'none' : `0 4px 16px ${ACCENT}66, 0 0 24px ${ACCENT}33`,
            touchAction: 'manipulation',
          }}
        >{spinning ? 'SPINNING…' : feedback === 'wrong' ? 'SPIN AGAIN' : 'SPIN'}</button>
        <button onClick={() => useHint()} disabled={hintsUsed >= HINT_MAX || spinning} style={btnStyle(hintsUsed >= HINT_MAX || spinning)} aria-label={`Hint, ${HINT_MAX - hintsUsed} left`}>HINT {HINT_MAX - hintsUsed}</button>
      </div>

      {/* Wrong-landing readout — mirrors the 2D "LANDED ON · X · TRY AGAIN". */}
      {feedback === 'wrong' && landedOn !== null && cur && (
        <div style={{ position: 'absolute', bottom: 116, left: '50%', transform: 'translateX(-50%)', fontSize: 11, letterSpacing: '0.18em', color: ROSE, textAlign: 'center' }}>
          LANDED ON · {cur.options[landedOn].toUpperCase()} · TRY AGAIN
        </div>
      )}

      {/* End card — DOM score card with Replay / Next CTAs. */}
      {completed && (
        <div role="dialog" aria-label="Pier Carnival Wheel complete" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: `radial-gradient(ellipse, ${ACCENT}22, rgba(10,4,24,0.72))`, backdropFilter: 'blur(6px)', pointerEvents: 'auto' }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 34, color: ACCENT, textShadow: `0 0 18px ${ACCENT}aa` }}>The wheel rests.</div>
          <div style={{ fontSize: 14 }}>You landed <strong style={{ color: GREEN }}>{correctCount}</strong> / {total} answers</div>
          <div style={{ fontSize: 11, letterSpacing: '0.18em', opacity: 0.8 }}>CARNIVAL CLOSING TIME · WESOŁE MIASTECZKO ZAMYKA</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={replay} style={btnStyle()}>Replay</button>
            <button onClick={replay} style={{ ...btnStyle(), background: ACCENT, color: '#0E0A1A', borderColor: ACCENT }}>Next district →</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div
      role="application"
      aria-label="Pier Carnival Wheel — spin to commit your answer"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 1.4, 6.6]}
        cameraFov={45}
        overlay={overlay}
      >
        <CarnivalScene
          spin={spin}
          wedgeCount={wedgeCount}
          landedOn={landedOn}
          answerIndex={cur ? cur.answerIndex : 0}
          feedback={feedback}
          hintActive={hintActive}
          reducedMotion={reduce}
          bajla={bajla}
          letterRefs={letterRefs}
          onSpinSettle={onSpinSettle}
        />
      </CityStage>
    </div>
  )
}

// ── Small DOM helpers ─────────────────────────────────────────────────────
function HudPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = accent ?? ACCENT
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'rgba(20,12,38,0.85)', border: `1px solid ${c}66`, borderRadius: 6 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: c }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>{value}</span>
    </div>
  )
}

function btnStyle(disabled = false): React.CSSProperties {
  return {
    minHeight: 44, minWidth: 52, padding: '8px 14px', borderRadius: 8,
    background: 'rgba(232,121,249,0.16)', border: `1px solid ${ACCENT}66`,
    color: ACCENT, fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 12,
    letterSpacing: '0.1em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
    touchAction: 'manipulation',
  }
}

// Local prefers-reduced-motion probe (no external dep; SSR-safe).
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}
