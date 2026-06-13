// OpenTheBox3D — "The Vault Job", The Bank Vault district.
//
// A three.js re-skin of the canonical 2D Open the Box shell (src/practice/
// shells/OpenTheBox.tsx). The MECHANIC, scoring, round count, hint/skip rules
// and the forgiving two-try no-fail behaviour are inherited verbatim from the
// 2D shell — this file changes only the stagecraft. Same puzzle in
// (ArcadePuzzle), same session result out (SessionResult). Built on the Fluent
// City GameKit (CityStage + useGameLoop + Bajla + palette).
//
// Fidelity note (binding, from docs/game3d/storyboards/openthebox.md): a 3×3
// wall of brass safe-deposit boxes in an underground bank vault at dusk. Tap a
// closed box → its door swings open on the left hinge and a DOM card with the
// MCQ chips renders beside it (one box open at a time). A correct chip flushes
// green, a wax "SEALED" stamp presses on, the door locks shut, tally ticks up.
// A wrong chip shakes the box, flashes the correct chip, and shows "TRY 1 OF
// 2"; a second miss slams the door shut (busted) so the box must be revisited.
// 3 hints per session spotlight the correct chip; skip closes the open box
// unanswered (busted). Seal every box → the vault is sealed (session done).
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden); all
// readable English lives in the DOM overlay (never a 3D texture) — boxes,
// prompt, chips, HUD, ledger and CTAs are real DOM, the box hotspots projected
// from their 3D world positions (camera.project) exactly like Snake3D's
// LabelProjector; quality tiers + reducedMotion honoured; procedural geometry +
// vertex/instance colours only (no GLB, no textures, no external link literals,
// no extra render helpers, no new deps); allocation-free loop; instanced repeats.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, MathUtils, Object3D, Vector3 } from 'three'
import type { Group, InstancedMesh, Mesh, PerspectiveCamera, PointLight } from 'three'
import { Bajla, CityStage, palette, useGameLoop, useStageQuality } from './kit'
import type { Game3DProps, SessionResult, Vocab3DItem } from './types'
import { generateOpenTheBoxPuzzle } from '../generators/generateOpenTheBox'
import type { ArcadeInput, ArcadePuzzle, ArcadeRound } from '../generators/generateArcade'

// ── Canonical mechanic constants (identical to the 2D shell) ───────────────
const HINT_MAX = 3
const MAX_TRIES = 2 // second miss slams the door shut (busted), must revisit
const COLS = 3 // 3×3 vault wall (generator caps at 9 boxes)

// District palette — brass cabinet, gold trim, leaf-green seal, rose busted.
const SEAL = '#7fb069' // palette.leaf — sealed / correct green
const ROSE = '#fb7185' // busted / wrong red
const AMBER = palette.lanternAmber // hint halo + accent

// Door animation timing (storyboard: seal beat ≈ 420 ms; 16 ms reducedMotion).
const SLAM_MS = 380 // door slams shut on a second miss / skip
const HINT_MS = 3200 // hint spotlights the correct chip for ~3.2s
const ADVANCE_MS = 700 // seal beat before the door locks shut

// ── Vault wall world layout — boxes laid out on a grid in the XY plane,
// centred on the origin, facing the camera down +Z. ────────────────────────
const CELL = 1.18
const GAP = 0.06
const STRIDE = CELL + GAP
const gridX = (col: number, cols: number): number => (col - (cols - 1) / 2) * STRIDE
const gridY = (row: number, rows: number): number => ((rows - 1) / 2 - row) * STRIDE + 0.25
const WALL_Z = 0
const DOOR_HALF = CELL / 2

type BoxFace = 'closed' | 'open' | 'sealed' | 'busted'

interface BoxView {
  face: BoxFace
  tries: number
  pickedIndex: number | null
}

interface BoxLayout {
  row: number
  col: number
  x: number
  y: number
}

// ── Built-in demo puzzle — copied verbatim from the 2D shell so anonymous
// home-page play behaves identically (Game3DProps requires a demo when no
// puzzle / vocab is supplied). ─────────────────────────────────────────────
const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'b1', prompt: 'A safe place to keep money.', options: ['vault', 'pavement', 'fountain', 'lantern'], answerIndex: 0, hint: 'Banks have one — heavy door, lots of locks.', hint_pl: 'sejf, skarbiec' },
    { id: 'b2', prompt: 'You unlock a door with this.', options: ['button', 'shelf', 'key', 'mirror'], answerIndex: 2, hint: 'Goes in the lock. Turns. Click.', hint_pl: 'klucz' },
    { id: 'b3', prompt: 'Where you put one foot in front of the other on a street.', options: ['kitchen', 'pavement', 'ceiling', 'cellar'], answerIndex: 1, hint: 'Pedestrians use it; British English.', hint_pl: 'chodnik' },
    { id: 'b4', prompt: 'Bright shop sign at night.', options: ['plaster', 'neon', 'gravel', 'beam'], answerIndex: 1, hint: 'Glows pink, red, blue — a market staple.', hint_pl: 'neon' },
    { id: 'b5', prompt: 'Underground transit with stations and tunnels.', options: ['subway', 'rooftop', 'balcony', 'gallery'], answerIndex: 0, hint: 'British call it the Underground; American name here.', hint_pl: 'metro' },
    { id: 'b6', prompt: 'Public square with fountains and benches.', options: ['plaza', 'cellar', 'attic', 'mast'], answerIndex: 0, hint: 'Spanish-rooted noun for a city open square.', hint_pl: 'plac' },
    { id: 'b7', prompt: 'A small alley between buildings.', options: ['lane', 'tower', 'pier', 'court'], answerIndex: 0, hint: 'Narrow, often cobbled. Cats love them.', hint_pl: 'uliczka' },
    { id: 'b8', prompt: 'A walkway above the street level.', options: ['cellar', 'gutter', 'bridge', 'pit'], answerIndex: 2, hint: 'Crosses a road or river — pedestrian or vehicle.', hint_pl: 'most' },
    { id: 'b9', prompt: 'A place to sit outside a café.', options: ['terrace', 'cellar', 'spire', 'shaft'], answerIndex: 0, hint: 'Open-air seating, often on a roof or upper floor.', hint_pl: 'taras' },
  ],
}

// Per-shell answer-leak guard — belt-and-suspenders with the generator's
// maskAnswerInPrompt. If the rendered prompt contains the answer word
// (case-insensitive, whole word) replace it with `___`.
function maskAnswerInPrompt(prompt: string | undefined, answer: string | undefined): string {
  if (!prompt) return ''
  if (!answer) return prompt
  const ans = answer.toLowerCase().trim()
  if (!ans) return prompt
  const safe = ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return prompt.replace(new RegExp(`\\b${safe}\\b`, 'gi'), '___')
}

const vocabToArcade = (v: Vocab3DItem[]): ArcadeInput[] =>
  v.map((it) => ({ word: it.word, word_pl: it.word_pl ?? '', clue: it.exampleEn, partOfSpeech: it.partOfSpeech, topic: it.topic }))

// ── Allocation-free scratch objects (single canvas, single game instance) ──
const _pos = new Vector3()
const _obj = new Object3D()
const _col = new Color()
const _colBrass = new Color(palette.brass)

// =========================================================================
// Scene (inside the Canvas — reads the live box state each frame)
// =========================================================================
interface SceneProps {
  layout: BoxLayout[]
  rows: number
  boxesRef: React.MutableRefObject<BoxView[]>
  activeIdx: number | null
  hintActive: boolean
  shakeAt: React.MutableRefObject<number>
  reducedMotion: boolean
  bajla: 'idle' | 'flyby' | 'celebrate'
  hotspotRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>
}

function VaultScene({ layout, rows, boxesRef, activeIdx, hintActive, shakeAt, reducedMotion, bajla, hotspotRefs }: SceneProps) {
  const { settings, tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion
  const wallTop = gridY(0, rows) + DOOR_HALF + 1.1

  return (
    <group>
      <CameraRig layout={layout} activeIdx={activeIdx} reducedMotion={reducedMotion} fullFraming={settings.tier !== 'low'} />
      {tier === 'high' && <fog attach="fog" args={[palette.night, 8, 22]} />}

      <VaultRoom rows={rows} shadows={settings.shadows} highFx={highFx} reducedMotion={reducedMotion} />
      <Lantern flicker={tier !== 'low' && !reducedMotion} highFx={highFx} y={wallTop} />
      <Boxes
        layout={layout}
        rows={rows}
        boxesRef={boxesRef}
        activeIdx={activeIdx}
        hintActive={hintActive}
        shakeAt={shakeAt}
        reducedMotion={reducedMotion}
        shadows={settings.shadows}
      />
      <HotspotProjector layout={layout} hotspotRefs={hotspotRefs} />
      {settings.particles > 0 && bajla === 'celebrate' && <Banknotes density={settings.particles} reducedMotion={reducedMotion} rows={rows} />}

      <Bajla
        variant={bajla}
        reducedMotion={reducedMotion}
        scale={0.42}
        position={[gridX(COLS - 1, COLS) + 1.5, wallTop - 0.2, 0.6]}
      />
    </group>
  )
}

// One gentle ≤0.4s dolly-push + slight tilt toward the active box; easing back
// on seal / slam. The only "travel" in the scene (storyboard camera note).
function CameraRig({ layout, activeIdx, reducedMotion, fullFraming }: { layout: BoxLayout[]; activeIdx: number | null; reducedMotion: boolean; fullFraming: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const base = useMemo<[number, number, number]>(() => (fullFraming ? [0, 0.4, 7.4] : [0, 0.3, 6.7]), [fullFraming])
  const target = useRef(new Vector3(0, 0.25, 0))
  useFrame((_, delta) => {
    const [bx, by, bz] = base
    let dx = 0
    let dz = 0
    let tx = 0
    let ty = 0.25
    if (activeIdx != null && layout[activeIdx]) {
      const b = layout[activeIdx]
      dx = b.x * 0.16
      dz = -0.6 // gentle push-in
      tx = b.x * 0.35
      ty = b.y * 0.35 + 0.1
    }
    const k = reducedMotion ? 1 : MathUtils.clamp(delta * 4, 0, 1)
    cam.position.x += (bx + dx - cam.position.x) * k
    cam.position.y += (by - cam.position.y) * k
    cam.position.z += (bz + dz - cam.position.z) * k
    target.current.x += (tx - target.current.x) * k
    target.current.y += (ty - target.current.y) * k
    cam.lookAt(target.current)
  })
  return null
}

// Ink-violet stone wall, gold rope barrier, polished floor sheen + a high
// dusk grille leaking pink glow. All procedural; vertex/standard colours.
function VaultRoom({ rows, shadows, highFx, reducedMotion }: { rows: number; shadows: boolean; highFx: boolean; reducedMotion: boolean }) {
  const grille = useRef<Mesh>(null)
  const wallW = COLS * STRIDE + 2.6
  const wallH = rows * STRIDE + 2.6
  const floorY = gridY(rows - 1, rows) - DOOR_HALF - 0.5
  useFrame((state) => {
    const m = grille.current
    if (!m) return
    const mat = m.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = reducedMotion ? 0.5 : 0.5 + Math.sin(state.clock.elapsedTime * 0.7) * 0.12
  })
  return (
    <group>
      {/* Stone vault wall behind the cabinets */}
      <mesh position={[0, 0.25, WALL_Z - 0.32]} receiveShadow={shadows}>
        <boxGeometry args={[wallW, wallH, 0.5]} />
        <meshStandardMaterial color={palette.ink} roughness={1} />
      </mesh>
      {/* Darker recessed border framing the box grid */}
      <mesh position={[0, 0.25, WALL_Z - 0.18]}>
        <boxGeometry args={[COLS * STRIDE + 0.5, rows * STRIDE + 0.5, 0.2]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      {/* High grille leaking dusk glow */}
      <mesh ref={grille} position={[0, wallH / 2 - 0.2, WALL_Z - 0.28]}>
        <boxGeometry args={[wallW * 0.55, 0.34, 0.06]} />
        <meshStandardMaterial color={palette.duskHorizon} emissive={palette.skyGlow} emissiveIntensity={0.5} roughness={0.8} />
      </mesh>
      {/* Polished floor with a faint sheen */}
      <mesh position={[0, floorY, 1.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[wallW + 3, 6]} />
        <meshStandardMaterial color={palette.night} roughness={highFx ? 0.32 : 0.7} metalness={highFx ? 0.5 : 0.15} />
      </mesh>
      {/* Gold rope barrier — two posts + a slung rope, in front of the wall */}
      <GoldRope floorY={floorY} wallW={wallW} />
    </group>
  )
}

function GoldRope({ floorY, wallW }: { floorY: number; wallW: number }) {
  const half = wallW / 2 - 0.4
  return (
    <group position={[0, floorY, 2.3]}>
      {[-half, half].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 0.42, 0]}>
            <cylinderGeometry args={[0.05, 0.06, 0.84, 12]} />
            <meshStandardMaterial color={palette.gold} roughness={0.4} metalness={0.6} emissive={palette.brass} emissiveIntensity={0.12} />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <sphereGeometry args={[0.09, 12, 10]} />
            <meshStandardMaterial color={palette.gold} roughness={0.35} metalness={0.7} emissive={palette.brass} emissiveIntensity={0.2} />
          </mesh>
        </group>
      ))}
      {/* Slung rope — a thin shallow arc box between the posts */}
      <mesh position={[0, 0.66, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[half * 2, 0.05, 0.05]} />
        <meshStandardMaterial color={palette.gold} roughness={0.5} metalness={0.5} emissive={palette.brass} emissiveIntensity={0.14} />
      </mesh>
    </group>
  )
}

// Caged paper lantern overhead — warm key light. Fake bloom = additive glow
// sprite + emissive flicker (no postprocessing — protects vendor-three budget).
function Lantern({ flicker, highFx, y }: { flicker: boolean; highFx: boolean; y: number }) {
  const core = useRef<Mesh>(null)
  const glow = useRef<Mesh>(null)
  const light = useRef<PointLight>(null)
  useFrame((state) => {
    if (!flicker) return
    const f = 0.55 + Math.sin(state.clock.elapsedTime * 7.0) * 0.12 + Math.sin(state.clock.elapsedTime * 13.0) * 0.06
    const c = core.current
    if (c) {
      const mat = c.material as { emissiveIntensity?: number }
      if (mat) mat.emissiveIntensity = 0.85 + f * 0.45
    }
    if (glow.current) glow.current.scale.setScalar(1 + f * 0.12)
    if (light.current) light.current.intensity = 0.7 + f * 0.5
  })
  return (
    <group position={[0, y, 0.8]}>
      {/* Hook + cord */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 1.1, 6]} />
        <meshStandardMaterial color={palette.brass} roughness={0.6} />
      </mesh>
      {/* Lantern shade */}
      <mesh>
        <cylinderGeometry args={[0.26, 0.3, 0.42, 14, 1, true]} />
        <meshStandardMaterial color={palette.lanternAmber} emissive={palette.lanternAmber} emissiveIntensity={0.4} roughness={0.7} side={2} transparent opacity={0.92} />
      </mesh>
      {/* Hot core */}
      <mesh ref={core}>
        <sphereGeometry args={[0.14, 14, 12]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.95} roughness={0.5} />
      </mesh>
      {/* Additive glow sprite (fake bloom) */}
      <mesh ref={glow}>
        <sphereGeometry args={[0.44, 12, 10]} />
        <meshBasicMaterial color={palette.lanternAmber} transparent opacity={0.16} depthWrite={false} blending={2} />
      </mesh>
      {/* Cage bars */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} rotation={[0, (i / 4) * Math.PI * 2, 0]} position={[0, 0, 0]}>
          <torusGeometry args={[0.3, 0.012, 6, 18, Math.PI]} />
          <meshStandardMaterial color={palette.brass} roughness={0.5} metalness={0.4} />
        </mesh>
      ))}
      {highFx && <pointLight ref={light} position={[0, -0.2, 0.4]} color={palette.lanternAmber} intensity={0.8} distance={11} decay={2} />}
    </group>
  )
}

// The 3×3 wall of brass safe-deposit boxes. Each box = a recessed cabinet
// (static) + a swinging brass door (left-edge hinge) + dial + the green seal
// stamp. Only the active door animates; the loop is allocation-free.
function Boxes({ layout, rows, boxesRef, activeIdx, hintActive, shakeAt, reducedMotion, shadows }: { layout: BoxLayout[]; rows: number; boxesRef: React.MutableRefObject<BoxView[]>; activeIdx: number | null; hintActive: boolean; shakeAt: React.MutableRefObject<number>; reducedMotion: boolean; shadows: boolean }) {
  const doorRefs = useRef<(Group | null)[]>([])
  const sealRefs = useRef<(Mesh | null)[]>([])
  const haloRefs = useRef<(Mesh | null)[]>([])
  const cabinets = useRef<InstancedMesh>(null)

  // Static recessed cabinet boxes (instanced) — set once.
  useEffect(() => {
    const mesh = cabinets.current
    if (!mesh) return
    layout.forEach((b, i) => {
      _obj.position.set(b.x, b.y, WALL_Z - 0.08)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      _col.copy(_colBrass).multiplyScalar(0.34)
      mesh.setColorAt(i, _col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [layout])

  useFrame((state) => {
    const now = performance.now()
    const boxes = boxesRef.current
    for (let i = 0; i < layout.length; i++) {
      const b = boxes[i]
      const door = doorRefs.current[i]
      if (door) {
        // Door swing — open doors rotate on the left hinge to ~ -115°.
        const wantOpen = b.face === 'open'
        const targetYaw = wantOpen ? -1.95 : 0
        if (reducedMotion) {
          door.rotation.y = targetYaw
        } else {
          door.rotation.y += (targetYaw - door.rotation.y) * 0.18
        }
        // Shake the active open box on a wrong pick.
        const since = now - shakeAt.current
        if (i === activeIdx && b.face === 'open' && since < 360 && !reducedMotion) {
          door.position.x = Math.sin(since * 0.06) * 0.05
        } else {
          door.position.x = 0
        }
      }
      // Seal stamp scale-in on a sealed box.
      const seal = sealRefs.current[i]
      if (seal) {
        const want = b.face === 'sealed' ? 1 : 0
        if (reducedMotion) seal.scale.setScalar(want)
        else seal.scale.x += (want - seal.scale.x) * 0.2
        seal.scale.y = seal.scale.x
        seal.visible = seal.scale.x > 0.02
      }
      // Hint halo pulse around the active open box's correct chip anchor.
      const halo = haloRefs.current[i]
      if (halo) {
        const show = hintActive && i === activeIdx && b.face === 'open'
        halo.visible = show
        if (show) {
          const pulse = reducedMotion ? 1 : 1 + Math.sin(state.clock.elapsedTime * 4.2) * 0.12
          halo.scale.set(pulse, pulse, 1)
          const mat = halo.material as { emissiveIntensity?: number }
          if (mat) mat.emissiveIntensity = reducedMotion ? 1 : 1 + Math.sin(state.clock.elapsedTime * 4.2) * 0.4
        }
      }
    }
  })

  return (
    <group>
      {/* Recessed cabinet interiors (instanced, dark brass) */}
      <instancedMesh ref={cabinets} args={[undefined, undefined, layout.length]} frustumCulled={false}>
        <boxGeometry args={[CELL * 0.92, CELL * 0.92, 0.16]} />
        <meshStandardMaterial roughness={0.85} metalness={0.2} />
      </instancedMesh>

      {layout.map((b, i) => (
        <group key={i} position={[b.x, b.y, WALL_Z]}>
          {/* Box number plate inside the cabinet (no English — numerals only,
              and the readable label lives in the DOM hotspot anyway) */}
          <mesh position={[0, 0, -0.02]}>
            <planeGeometry args={[CELL * 0.5, CELL * 0.3]} />
            <meshStandardMaterial color={palette.ink} emissive={AMBER} emissiveIntensity={0.12} roughness={0.9} />
          </mesh>

          {/* Green wax SEALED stamp — scales in when the box is sealed */}
          <mesh ref={(el) => { sealRefs.current[i] = el }} position={[0, 0, 0.12]} rotation={[0, 0, -0.2]} visible={false}>
            <cylinderGeometry args={[0.26, 0.26, 0.04, 18]} />
            <meshStandardMaterial color={SEAL} emissive={SEAL} emissiveIntensity={0.45} roughness={0.5} />
          </mesh>

          {/* Hint halo — amber ring around the open box */}
          <mesh ref={(el) => { haloRefs.current[i] = el }} position={[0, 0, 0.06]} visible={false}>
            <ringGeometry args={[DOOR_HALF * 0.82, DOOR_HALF * 0.98, 30]} />
            <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={1} transparent opacity={0.85} side={2} />
          </mesh>

          {/* Swinging brass door — pivots about the left edge (hinge) */}
          <group ref={(el) => { doorRefs.current[i] = el }} position={[-DOOR_HALF, 0, 0.1]}>
            <BoxDoor shadows={shadows} />
          </group>
        </group>
      ))}
    </group>
  )
}

// A single brass door, modelled so its hinge sits at the group origin (left
// edge): all geometry is offset +X by DOOR_HALF.
function BoxDoor({ shadows }: { shadows: boolean }) {
  return (
    <group position={[DOOR_HALF, 0, 0]}>
      {/* Door slab */}
      <mesh castShadow={shadows}>
        <boxGeometry args={[CELL * 0.92, CELL * 0.92, 0.1]} />
        <meshStandardMaterial color={palette.brass} roughness={0.45} metalness={0.55} emissive={palette.brass} emissiveIntensity={0.1} />
      </mesh>
      {/* Bevel frame (slightly larger, behind) */}
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[CELL * 0.96, CELL * 0.96, 0.06]} />
        <meshStandardMaterial color={palette.gold} roughness={0.5} metalness={0.5} />
      </mesh>
      {/* Combination dial */}
      <mesh position={[CELL * 0.16, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.06, 20]} />
        <meshStandardMaterial color={palette.gold} roughness={0.4} metalness={0.65} emissive={palette.brass} emissiveIntensity={0.14} />
      </mesh>
      <mesh position={[CELL * 0.16, 0.12, 0.1]}>
        <boxGeometry args={[0.02, 0.07, 0.02]} />
        <meshStandardMaterial color={palette.night} />
      </mesh>
      {/* Hinge rivets on the left edge */}
      <mesh position={[-CELL * 0.4, CELL * 0.3, 0.06]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color={palette.night} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[-CELL * 0.4, -CELL * 0.3, 0.06]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color={palette.night} roughness={0.6} metalness={0.4} />
      </mesh>
    </group>
  )
}

// Projects each box's world position to screen px and writes it onto the DOM
// hotspot button transforms (English / interaction stays crisp DOM, never a 3D
// texture). Mirrors Snake3D's LabelProjector pattern.
function HotspotProjector({ layout, hotspotRefs }: { layout: BoxLayout[]; hotspotRefs: React.MutableRefObject<(HTMLButtonElement | null)[]> }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  useFrame(() => {
    // Project the box footprint to derive an on-screen size for the hotspot.
    for (let i = 0; i < layout.length; i++) {
      const el = hotspotRefs.current[i]
      if (!el) continue
      const b = layout[i]
      _pos.set(b.x, b.y, WALL_Z + 0.1).project(cam)
      if (_pos.z > 1) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; continue }
      const cx = (_pos.x * 0.5 + 0.5) * size.width
      const cy = (-_pos.y * 0.5 + 0.5) * size.height
      // Edge sample to size the square hotspot in screen px.
      _pos.set(b.x + DOOR_HALF, b.y, WALL_Z + 0.1).project(cam)
      const ex = (_pos.x * 0.5 + 0.5) * size.width
      const px = Math.max(44, Math.abs(ex - cx) * 2)
      el.style.opacity = '1'
      el.style.pointerEvents = 'auto'
      el.style.width = `${px.toFixed(1)}px`
      el.style.height = `${px.toFixed(1)}px`
      el.style.transform = `translate(-50%, -50%) translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`
    }
  })
  return null
}

// Banknote confetti on completion — instanced gold/leaf planes drifting down.
function Banknotes({ density, reducedMotion, rows }: { density: number; reducedMotion: boolean; rows: number }) {
  const inst = useRef<InstancedMesh>(null)
  const count = Math.max(0, Math.round(60 * density))
  const top = gridY(0, rows) + 2
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: ((Math.sin(i * 12.9898) * 43758.5453) % 1) * (COLS * STRIDE + 3),
    z: ((Math.sin(i * 78.233) * 12543.123) % 1) * 2 + 0.3,
    speed: 0.6 + (i % 5) * 0.16,
    phase: (i / Math.max(1, count)) * 5,
    spin: 1 + (i % 4) * 0.5,
    gold: i % 2 === 0,
  })), [count, rows])
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    seeds.forEach((s, i) => {
      _col.set(s.gold ? palette.gold : SEAL)
      mesh.setColorAt(i, _col)
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [seeds])
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh || count === 0) return
    const t = reducedMotion ? 0 : state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      const y = top - (((t * s.speed + s.phase) % 5) * 1.0)
      _obj.position.set(s.x - (COLS * STRIDE + 3) / 2, y, s.z)
      _obj.rotation.set(t * s.spin, t * s.spin * 0.7, 0.4)
      _obj.scale.set(0.18, 0.09, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  if (count === 0) return null
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial roughness={0.6} metalness={0.2} side={2} emissive={palette.brass} emissiveIntensity={0.08} />
    </instancedMesh>
  )
}

// =========================================================================
// OpenTheBox3D — the Game3D component (default export)
// =========================================================================
export default function OpenTheBox3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const activePuzzle = useMemo<ArcadePuzzle>(() => {
    const p = puzzle as ArcadePuzzle | undefined
    if (p && Array.isArray(p.rounds) && p.rounds.length > 0) return p
    if (vocab && vocab.length > 0) {
      const gen = generateOpenTheBoxPuzzle(vocabToArcade(vocab), { seed: 7 })
      if (gen && gen.rounds.length > 0) return gen
    }
    return DEMO_PUZZLE
  }, [puzzle, vocab])
  const rounds = activePuzzle.rounds
  const total = rounds.length

  // Grid layout — 3 columns, ceil rows (mirrors the 2D shell's cols logic).
  const layout = useMemo<BoxLayout[]>(() => {
    const rows = Math.max(1, Math.ceil(total / COLS))
    return rounds.map((_, i) => {
      const row = Math.floor(i / COLS)
      const col = i % COLS
      return { row, col, x: gridX(col, COLS), y: gridY(row, rows) }
    })
  }, [rounds, total])
  const rows = Math.max(1, Math.ceil(total / COLS))

  const initialBoxes = useCallback((): BoxView[] => rounds.map(() => ({ face: 'closed' as BoxFace, tries: 0, pickedIndex: null })), [rounds])

  const boxesRef = useRef<BoxView[]>(initialBoxes())
  const hotspotRefs = useRef<(HTMLButtonElement | null)[]>([])
  const shakeAt = useRef(0)
  const startMs = useRef(performance.now())
  const fired = useRef(false)
  const slamTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [boxes, setBoxes] = useState<BoxView[]>(initialBoxes)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [focusIdx, setFocusIdx] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintActive, setHintActive] = useState(false)
  const [live, setLive] = useState('')

  // Keep the scene's live ref in sync with React state.
  useEffect(() => { boxesRef.current = boxes }, [boxes])

  const sealedCount = boxes.filter((b) => b.face === 'sealed').length
  const completed = total > 0 && sealedCount === total
  const cur = activeIdx != null ? rounds[activeIdx] : null
  const curBox = activeIdx != null ? boxes[activeIdx] : null
  const answerWord = cur ? cur.options[cur.answerIndex] : ''
  const renderedPrompt = useMemo(() => maskAnswerInPrompt(cur?.prompt, answerWord), [cur?.prompt, answerWord])
  const bajla: 'idle' | 'flyby' | 'celebrate' = completed ? 'celebrate' : (sealedCount === 0 && activeIdx == null) ? 'flyby' : 'idle'

  // useGameLoop kept for parity with the GameKit contract — the scene reads
  // boxesRef every frame via useFrame; the loop drives the live-region cadence
  // without per-frame React churn. (No fixed-step simulation here — the box
  // mechanic is event-driven, exactly like the 2D shell.)
  const noop = useCallback(() => {}, [])
  useGameLoop(noop, undefined, { stepMs: 1000 / 30, running: !completed, reducedMotion: reduce })

  // ── Mechanic (mirrors the 2D shell exactly) ──────────────────────────────
  const openBox = useCallback((i: number): void => {
    setBoxes((prev) => {
      if (prev[i].face === 'sealed') return prev
      if (activeIdx != null && activeIdx !== i) return prev // one open at a time
      const next = prev.map((b, j) => (j === i ? { ...b, face: 'open' as BoxFace } : b))
      return next
    })
    setBoxes((prev) => {
      if (prev[i].face !== 'open') return prev
      setActiveIdx(i)
      setFocusIdx(i)
      const r = rounds[i]
      setLive(`Box ${i + 1} open. ${maskAnswerInPrompt(r.prompt, r.options[r.answerIndex])}`)
      return prev
    })
  }, [activeIdx, rounds])

  const closeBoxBusted = useCallback((i: number): void => {
    setBoxes((prev) => prev.map((b, j) => (j === i ? { ...b, face: 'busted' as BoxFace, pickedIndex: null } : b)))
    if (slamTimer.current) clearTimeout(slamTimer.current)
    slamTimer.current = setTimeout(() => {
      setBoxes((prev) => prev.map((b, j) => (j === i ? { ...b, face: 'closed' as BoxFace } : b)))
    }, reduce ? 16 : SLAM_MS)
    setActiveIdx(null)
    setLive(`Box ${i + 1} slammed shut. The correct answer was "${rounds[i].options[rounds[i].answerIndex]}". Open it again to try.`)
  }, [reduce, rounds])

  const pick = useCallback((boxIdx: number, optIdx: number): void => {
    const round = rounds[boxIdx]
    const correct = optIdx === round.answerIndex
    setBoxes((prev) => prev.map((b, j) => (j === boxIdx ? { ...b, pickedIndex: optIdx } : b)))
    if (correct) {
      if (sealTimer.current) clearTimeout(sealTimer.current)
      sealTimer.current = setTimeout(() => {
        setBoxes((prev) => prev.map((b, j) => (j === boxIdx ? { ...b, face: 'sealed' as BoxFace } : b)))
        setActiveIdx(null)
      }, reduce ? 16 : ADVANCE_MS)
      setLive(`Correct — box ${boxIdx + 1} sealed.`)
    } else {
      shakeAt.current = performance.now()
      setBoxes((prev) => {
        const tries = prev[boxIdx].tries + 1
        const next = prev.map((b, j) => (j === boxIdx ? { ...b, tries } : b))
        // After MAX_TRIES wrong, slam shut (busted) — must revisit.
        if (tries >= MAX_TRIES) {
          if (slamTimer.current) clearTimeout(slamTimer.current)
          slamTimer.current = setTimeout(() => closeBoxBusted(boxIdx), reduce ? 16 : SLAM_MS)
        }
        return next
      })
      setLive(`Not quite. The correct answer is "${round.options[round.answerIndex]}".`)
    }
  }, [rounds, reduce, closeBoxBusted])

  const useHint = useCallback((): void => {
    if (hintsUsed >= HINT_MAX || activeIdx == null) return
    setHintsUsed((h) => h + 1)
    setHintActive(true)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHintActive(false), reduce ? 16 : HINT_MS)
  }, [hintsUsed, activeIdx, reduce])

  const skip = useCallback((): void => {
    if (activeIdx == null) return
    closeBoxBusted(activeIdx)
  }, [activeIdx, closeBoxBusted])

  const replay = useCallback((): void => {
    if (slamTimer.current) clearTimeout(slamTimer.current)
    if (sealTimer.current) clearTimeout(sealTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    fired.current = false
    startMs.current = performance.now()
    setBoxes(initialBoxes())
    setActiveIdx(null)
    setFocusIdx(0)
    setHintsUsed(0)
    setHintActive(false)
    setLive('')
  }, [initialBoxes])

  // Fire the session result exactly once, on completion.
  useEffect(() => {
    if (completed && !fired.current) {
      fired.current = true
      setLive('The vault is sealed. All boxes secured.')
      const result: SessionResult = {
        correctCount: sealedCount,
        totalQuestions: total,
        durationMs: Math.round(performance.now() - startMs.current),
        shellKey: 'openthebox',
      }
      onSessionComplete?.(result)
    }
  }, [completed, sealedCount, total, onSessionComplete])

  // Keyboard — Tab handled natively; arrows move focus across the grid,
  // Enter/Space opens the focused box; once open, 1–4 / A–D pick a chip;
  // H = hint, S = skip (mirrors the storyboard input map).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key
      if (activeIdx != null) {
        const r = rounds[activeIdx]
        let optIdx = -1
        if (/^[1-9]$/.test(key)) optIdx = parseInt(key, 10) - 1
        else if (/^[a-dA-D]$/.test(key)) optIdx = key.toLowerCase().charCodeAt(0) - 97
        if (optIdx >= 0 && optIdx < r.options.length && curBox?.face === 'open') {
          e.preventDefault()
          pick(activeIdx, optIdx)
          return
        }
        if (key === 'Escape') { e.preventDefault(); skip(); return }
      }
      if (key === 'h' || key === 'H') { e.preventDefault(); useHint(); return }
      if (key === 's' || key === 'S') { e.preventDefault(); skip(); return }
      if (activeIdx == null) {
        if (key === 'ArrowRight') { e.preventDefault(); setFocusIdx((f) => Math.min(total - 1, f + 1)) }
        else if (key === 'ArrowLeft') { e.preventDefault(); setFocusIdx((f) => Math.max(0, f - 1)) }
        else if (key === 'ArrowDown') { e.preventDefault(); setFocusIdx((f) => Math.min(total - 1, f + COLS)) }
        else if (key === 'ArrowUp') { e.preventDefault(); setFocusIdx((f) => Math.max(0, f - COLS)) }
        else if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
          e.preventDefault()
          if (boxes[focusIdx]?.face !== 'sealed') openBox(focusIdx)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeIdx, rounds, curBox, total, boxes, focusIdx, pick, skip, useHint, openBox])

  // Move DOM focus to the focused hotspot when navigating with the keyboard.
  useEffect(() => {
    if (activeIdx == null) hotspotRefs.current[focusIdx]?.focus?.()
  }, [focusIdx, activeIdx])

  // Cleanup timers on unmount.
  useEffect(() => () => {
    if (slamTimer.current) clearTimeout(slamTimer.current)
    if (sealTimer.current) clearTimeout(sealTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
  }, [])

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'var(--em-mono, ui-monospace, monospace)', color: '#EDE6FF' }}>
      <style>{`
        @keyframes otb-pop { 0%{transform:translateY(8px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes otb-hint { 0%,100%{box-shadow:0 0 0 0 ${AMBER}00} 50%{box-shadow:0 0 0 3px ${AMBER}cc} }
        @keyframes otb-shake { 0%,100%{transform:translateX(-50%) translateX(0)} 25%{transform:translateX(-50%) translateX(-6px)} 75%{transform:translateX(-50%) translateX(6px)} }
      `}</style>

      {/* Screen-reader live region (canvas is aria-hidden inside CityStage) */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Eyebrow — invites the first tap (mirrors the 2D shell's empty-state) */}
      {!cur && !completed && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', animation: 'otb-pop 540ms ease both' }}>
          <div style={{ color: AMBER, padding: '6px 14px', background: `${AMBER}1c`, border: `1px dashed ${AMBER}66`, borderRadius: 999, letterSpacing: '0.2em', fontSize: 11 }}>
            TAP ANY VAULT · KLIKNIJ DOWOLNY SEJF
          </div>
        </div>
      )}

      {/* HUD — SEALED tally + district, top-left */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <HudPill label="SEALED · ZAPLOMBOWANE" value={`${sealedCount}/${total}`} accent={SEAL} />
        <HudPill label="DISTRICT · DZIELNICA" value="The Bank Vault" accent={AMBER} />
      </div>

      {/* Box hotspots — DOM buttons, positioned by the 3D HotspotProjector.
          Each box's readable label, focus ring and tap target live here. */}
      {layout.map((_, i) => {
        const b = boxes[i]
        const sealed = b.face === 'sealed'
        const isActive = activeIdx === i
        const disabled = sealed || (activeIdx != null && !isActive)
        return (
          <button
            key={i}
            ref={(el) => { hotspotRefs.current[i] = el }}
            onClick={() => { if (!disabled) openBox(i) }}
            disabled={disabled}
            aria-label={sealed ? `Box ${i + 1}, sealed and locked` : isActive ? `Box ${i + 1}, currently open` : `Box ${i + 1}, tap to open`}
            aria-pressed={isActive}
            style={{
              position: 'absolute', top: 0, left: 0, opacity: 0,
              minWidth: 44, minHeight: 44, padding: 0,
              borderRadius: 8, background: 'transparent', cursor: disabled ? 'default' : 'pointer',
              border: isActive ? `2px solid ${AMBER}` : sealed ? `2px solid ${SEAL}66` : '2px solid transparent',
              touchAction: 'manipulation', pointerEvents: 'none',
            }}
          >
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{`Box ${String(i + 1).padStart(2, '0')}`}</span>
          </button>
        )
      })}

      {/* Question card — appears beside the open box (anchored bottom-centre,
          same pattern as the 2D shell's popup). All English lives here. */}
      {cur && curBox && curBox.face === 'open' && (
        <div
          key={`q-${activeIdx}`}
          role="region"
          aria-label={`Question for box ${(activeIdx ?? 0) + 1}`}
          style={{
            position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)',
            width: 'min(560px, calc(100% - 24px))', maxWidth: 'calc(100% - 24px)', boxSizing: 'border-box',
            background: 'linear-gradient(180deg, rgba(20,12,38,0.96) 0%, rgba(8,4,20,0.96) 100%)',
            border: `1px solid ${AMBER}55`, borderRadius: 14, padding: 18,
            boxShadow: `0 12px 36px rgba(0,0,0,0.6), 0 0 24px ${AMBER}22`,
            pointerEvents: 'auto', zIndex: 4,
            animation: (curBox.pickedIndex != null && curBox.pickedIndex !== cur.answerIndex) ? 'otb-shake 380ms ease' : 'otb-pop 320ms ease',
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: '0.18em', color: AMBER, marginBottom: 6 }}>BOX {String((activeIdx ?? 0) + 1).padStart(2, '0')} · QUESTION</div>
          <div style={{ fontFamily: 'var(--em-decor, var(--em-mono, system-ui))', fontSize: 18, lineHeight: 1.3, color: '#EDE6FF', marginBottom: 14, overflowWrap: 'break-word' }}>{renderedPrompt}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {cur.options.map((opt, oi) => {
              const picked = curBox.pickedIndex === oi
              const isCorrect = oi === cur.answerIndex
              const showWrong = picked && !isCorrect
              const showRight = picked && isCorrect
              const hinted = hintActive && isCorrect
              return (
                <button
                  key={oi}
                  onClick={() => pick(activeIdx as number, oi)}
                  aria-label={`Option ${String.fromCharCode(65 + oi)}: ${opt}`}
                  style={{
                    minHeight: 44, padding: '10px 14px', borderRadius: 10, minWidth: 0,
                    background: showRight ? 'rgba(127,176,105,0.2)' : showWrong ? 'rgba(251,113,133,0.18)' : hinted ? `${AMBER}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${showRight ? `${SEAL}aa` : showWrong ? `${ROSE}88` : hinted ? `${AMBER}88` : 'rgba(255,255,255,0.1)'}`,
                    color: showRight ? SEAL : showWrong ? ROSE : '#EDE6FF',
                    fontFamily: 'var(--em-body, system-ui)', fontSize: 14, cursor: 'pointer', textAlign: 'left',
                    transition: 'all 180ms ease', display: 'flex', alignItems: 'center', gap: 10,
                    overflowWrap: 'break-word', touchAction: 'manipulation',
                    animation: hinted ? 'otb-hint 0.8s ease-in-out 3' : undefined,
                  }}
                >
                  <span style={{ fontFamily: 'var(--em-mono, monospace)', fontSize: 10, color: AMBER, opacity: 0.7, minWidth: 14, flex: '0 0 auto' }}>{String.fromCharCode(65 + oi)}</span>
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: 'break-word' }}>{opt}</span>
                </button>
              )
            })}
          </div>
          {curBox.tries > 0 && (
            <div style={{ marginTop: 10, fontFamily: 'var(--em-mono, monospace)', fontSize: 10, color: ROSE, letterSpacing: '0.16em' }}>
              TRY {curBox.tries} OF {MAX_TRIES} · {curBox.tries >= MAX_TRIES ? 'BOX SLAMS SHUT' : 'ONE MORE CHANCE'}
            </div>
          )}
        </div>
      )}

      {/* Controls — Skip / Hint (≥44px tap targets), bottom-left */}
      <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={skip} disabled={activeIdx == null} style={btnStyle(activeIdx == null)} aria-label="Skip the open box (counts as busted)">SKIP</button>
        <button onClick={useHint} disabled={hintsUsed >= HINT_MAX || activeIdx == null} style={btnStyle(hintsUsed >= HINT_MAX || activeIdx == null)} aria-label={`Hint, ${HINT_MAX - hintsUsed} left`}>HINT {HINT_MAX - hintsUsed}</button>
      </div>

      {/* Vault ledger — running sealed/busted list, bottom-right (mirrors the
          2D shell's ledger card). Hidden on very narrow widths via CSS. */}
      <div className="otb-ledger" style={{ position: 'absolute', bottom: 12, right: 12, width: 168, maxHeight: '52%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(14,10,26,0.82)', border: `1px solid ${AMBER}44`, borderRadius: 8, padding: 8, pointerEvents: 'auto' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', color: AMBER, textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
          <span>Ledger · Księga</span><span>{sealedCount}/{total}</span>
        </div>
        {boxes.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderRadius: 6, background: b.face === 'sealed' ? 'rgba(127,176,105,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${b.face === 'sealed' ? `${SEAL}33` : 'rgba(255,255,255,0.08)'}` }}>
            <span style={{ fontFamily: 'var(--em-mono, monospace)', fontSize: 9, color: b.face === 'sealed' ? SEAL : AMBER }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ fontFamily: 'var(--em-mono, monospace)', fontSize: 9, color: b.face === 'sealed' ? SEAL : b.face === 'open' ? AMBER : 'rgba(237,230,255,0.6)' }}>
              {b.face === 'sealed' ? 'SEALED' : b.face === 'open' ? 'OPEN' : 'LOCKED'}
            </span>
          </div>
        ))}
      </div>

      {/* End card */}
      {completed && (
        <div role="dialog" aria-label="The Vault Job complete" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: `radial-gradient(ellipse, ${AMBER}22, rgba(10,5,24,0.72))`, backdropFilter: 'blur(6px)', pointerEvents: 'auto' }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 34, color: SEAL, textShadow: `0 0 18px ${SEAL}aa`, textAlign: 'center', padding: '0 16px' }}>The vault is sealed.</div>
          <div style={{ fontSize: 14 }}>You sealed <strong style={{ color: AMBER }}>{sealedCount}</strong> / {total} boxes</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={replay} style={btnStyle()}>Try another</button>
            <button onClick={replay} style={{ ...btnStyle(), background: SEAL, color: '#06210F', borderColor: SEAL }}>Next district →</button>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 560px) { .otb-ledger { display: none !important; } }`}</style>
    </div>
  )

  return (
    <div
      role="application"
      aria-label="The Vault Job — open each brass box and pick the right word to seal it"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 0.4, 7.4]}
        cameraFov={38}
        overlay={overlay}
      >
        <VaultScene
          layout={layout}
          rows={rows}
          boxesRef={boxesRef}
          activeIdx={activeIdx}
          hintActive={hintActive}
          shakeAt={shakeAt}
          reducedMotion={reduce}
          bajla={bajla}
          hotspotRefs={hotspotRefs}
        />
      </CityStage>
    </div>
  )
}

// ── Small DOM helpers ───────────────────────────────────────────────────────
function HudPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = accent ?? AMBER
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'rgba(14,10,26,0.85)', border: `1px solid ${c}66`, borderRadius: 6 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: c }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>{value}</span>
    </div>
  )
}

function btnStyle(disabled = false): React.CSSProperties {
  return {
    minHeight: 44, minWidth: 52, padding: '8px 14px', borderRadius: 8,
    background: `${AMBER}22`, border: `1px solid ${AMBER}66`,
    color: AMBER, fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 12,
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
