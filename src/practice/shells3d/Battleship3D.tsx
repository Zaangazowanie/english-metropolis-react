// Battleship3D — "Bathtub Fleet", the Little Venice Canals district.
//
// A three.js re-skin of the canonical 2D Battleship shell (src/practice/
// shells/Battleship.tsx). The MECHANIC, scoring, ship placement, round count
// and hint/skip rules are inherited verbatim from the 2D shell — this file
// changes only the stagecraft. Same puzzle in (ArcadePuzzle), same session
// result out (SessionResult). Built on the Fluent City GameKit
// (CityStage + useGameLoop + Bajla + palette).
//
// Fidelity note (binding, from docs/game3d/storyboards/battleship.md): mirror
// the IMPLEMENTATION, not the in-shell instruction copy. The implemented
// mechanic is an 8×8 grid (A–H / 1–8); a strike on empty water is an instant
// MISS (no score impact); a strike on a ship cell opens an MCQ; a correct pick
// is a HIT (the hull cell locks lit), a wrong pick locks that cell as a miss
// and records the wrong attempt; Hint REVEALS a not-yet-sunk ship's cells
// (~3.2s sonar ping, 3 per session); Skip just CLOSES the MCQ with no score
// effect. A ship (round) sinks when all 3 of its hull cells are confirmed, and
// `correctCount` is the count of SUNK ships (sunkRounds), never the raw
// MCQ-correct count.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden);
// all readable English lives in the DOM overlay (never a 3D texture); quality
// tiers + reducedMotion honoured; full keyboard + touch input; procedural
// geometry + vertex/instance colours only (no GLB, no textures, no external
// URLs, no new deps); allocation-free render loop; instanced repeats.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, Object3D, Vector3 } from 'three'
import type { InstancedMesh, Mesh, PerspectiveCamera, PointLight } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult, Vocab3DItem } from './types'
import { generateBattleshipPuzzle } from '../generators/generateBattleship'
import type { ArcadeInput, ArcadePuzzle, ArcadeRound } from '../generators/generateArcade'

// ── Canonical grid + ship sizing (identical to the 2D shell) ─────────────
const COLS = 8 // A-H
const ROWS = 8 // 1-8
const SHIP_LEN = 3 // 3-cell hull per round (matches Battleship.tsx buildShips)
const HINT_MAX = 3
const HINT_MS = 3200 // sonar-ping reveal duration (2D shell: 3200ms)
const HIT_MS = 900 // 2D shell: correct pick closes after 900ms
const WRONG_MS = 1200 // 2D shell: wrong pick locks the cell after 1200ms
const MISS_MS = 600 // 2D shell: empty-water miss flash clears after 600ms

// Harbour palette — canal blues, leaf-green HIT accent, magenta cursor ring
// (mirrors the 2D shell: ACCENT #7DD3FC, cursor #E879F9, hit rose #FB7185).
const ACCENT = '#7DD3FC'
const CURSOR = '#E879F9'
const HIT_COL = '#FB7185'

// World mapping — the 8×8 board laid flat on the water in the XZ plane,
// centred on the origin. Smaller row index = further from camera (-Z).
const CELL = 0.62
const HALF_W = (COLS * CELL) / 2
const HALF_D = (ROWS * CELL) / 2
const worldX = (c: number): number => (c + 0.5) * CELL - HALF_W
const worldZ = (r: number): number => (r + 0.5) * CELL - HALF_D

const TILE_COUNT = COLS * ROWS
const HULL_COUNT = SHIP_LEN * 8 // generous upper bound (4 ships × 3 cells)

type CellResult = 'hit' | 'miss'

interface ShipCell {
  r: number
  c: number
  roundIdx: number
  isHit: boolean
}

interface FiredCell {
  r: number
  c: number
  result: CellResult
}

// ── Built-in demo puzzle — copied verbatim from the 2D shell so anonymous
// home-page play behaves identically (Game3DProps requires a demo when no
// puzzle / vocab is supplied). ───────────────────────────────────────────
const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'bs1', prompt: 'A long platform jutting into the water.', options: ['pier', 'stoop', 'plinth', 'gable'], answerIndex: 0, hint: 'Brighton has a famous one with arcades.', hint_pl: 'molo' },
    { id: 'bs2', prompt: 'A vehicle that carries cargo by sea.', options: ['freighter', 'wagon', 'glider', 'caravan'], answerIndex: 0, hint: 'Ships full of containers.', hint_pl: 'frachtowiec' },
    { id: 'bs3', prompt: 'A wall built to protect a harbour from waves.', options: ['breakwater', 'pavement', 'awning', 'gable'], answerIndex: 0, hint: 'A long stone wall sticking out from the shore.', hint_pl: 'falochron' },
    { id: 'bs4', prompt: 'A loud sound a ship makes in fog.', options: ['horn', 'whistle', 'chime', 'bell'], answerIndex: 0, hint: 'Long, low, mournful sound.', hint_pl: 'syrena, róg' },
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

// Pre-placed ships — deterministic placement copied VERBATIM from the 2D
// shell's buildShips (seed 0xBEEF), so the same puzzle always renders the
// same harbour in both 2D and 3D. Each round = 1 ship of 3 cells.
function buildShips(rounds: number): ShipCell[] {
  const rng = (seed: number) => {
    let s = seed
    return () => {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    }
  }
  const r = rng(0xbeef)
  const ships: ShipCell[] = []
  const used = new Set<string>()
  for (let i = 0; i < rounds; i++) {
    const len = SHIP_LEN
    let attempt = 0
    while (attempt < 200) {
      const horizontal = r() > 0.5
      const startR = Math.floor(r() * (horizontal ? ROWS : ROWS - len + 1))
      const startC = Math.floor(r() * (horizontal ? COLS - len + 1 : COLS))
      const cells: { r: number; c: number }[] = []
      let ok = true
      for (let k = 0; k < len; k++) {
        const cr = startR + (horizontal ? 0 : k)
        const cc = startC + (horizontal ? k : 0)
        if (used.has(`${cr},${cc}`)) { ok = false; break }
        cells.push({ r: cr, c: cc })
      }
      if (ok) {
        cells.forEach((c) => {
          used.add(`${c.r},${c.c}`)
          ships.push({ r: c.r, c: c.c, roundIdx: i, isHit: false })
        })
        break
      }
      attempt++
    }
  }
  return ships
}

const vocabToArcade = (v: Vocab3DItem[]): ArcadeInput[] =>
  v.map((it) => ({ word: it.word, word_pl: it.word_pl ?? '', clue: it.exampleEn, partOfSpeech: it.partOfSpeech, topic: it.topic }))

const colLetter = (c: number): string => String.fromCharCode(65 + c)
const coordLabel = (r: number, c: number): string => `${colLetter(c)}${r + 1}`

// ── Allocation-free scratch objects (single canvas, single game instance) ─
const _obj = new Object3D()
const _col = new Color()
const _pos = new Vector3()
const _colFog = new Color(ACCENT)
const _colCursor = new Color(CURSOR)
const _colHit = new Color(HIT_COL)
const _colMiss = new Color(palette.night)
const _colHint = new Color(palette.leaf)

// =========================================================================
// Scene (inside the Canvas — reads live game state via props)
// =========================================================================
interface SceneProps {
  ships: ShipCell[]
  fired: FiredCell[]
  cursor: { r: number; c: number }
  activeCell: { r: number; c: number } | null
  hintRound: number | null
  shipsByRound: Record<number, ShipCell[]>
  reducedMotion: boolean
  bajla: 'idle' | 'flyby' | 'celebrate'
  onPickCell: (r: number, c: number) => void
}

function CanalScene(props: SceneProps) {
  const { settings, tier } = useStageQuality()
  const highFx = tier === 'high' && !props.reducedMotion

  return (
    <group>
      <CameraRig drift={highFx} reducedMotion={props.reducedMotion} />
      {tier === 'high' && <fog attach="fog" args={[palette.duskHorizon, 11, 24]} />}

      <CanalWater reducedMotion={props.reducedMotion} tier={tier} />
      <CanalBackdrop shadows={settings.shadows} />
      <Lanterns sway={tier !== 'low' && !props.reducedMotion} highFx={highFx} />
      <BrassFrame />
      <Periscope />

      <GridTiles
        fired={props.fired}
        cursor={props.cursor}
        activeCell={props.activeCell}
        hintRound={props.hintRound}
        ships={props.ships}
        reducedMotion={props.reducedMotion}
        onPickCell={props.onPickCell}
      />
      <Hulls ships={props.ships} shipsByRound={props.shipsByRound} reducedMotion={props.reducedMotion} />
      {settings.particles > 0 && <Foam fired={props.fired} density={settings.particles} reducedMotion={props.reducedMotion} />}

      <Bajla
        variant={props.bajla}
        reducedMotion={props.reducedMotion}
        scale={0.42}
        position={[HALF_W + 0.95, 1.55, HALF_D + 0.4]}
      />
    </group>
  )
}

function CameraRig({ drift, reducedMotion }: { drift: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const base = useRef<[number, number, number]>([0, 6.5, 5.5])
  useFrame((state) => {
    const [bx, by, bz] = base.current
    if (drift && !reducedMotion) {
      const t = state.clock.elapsedTime
      // Gentle idle parallax bob (≤0.05 units, ~0.4 Hz) per storyboard.
      cam.position.set(bx + Math.sin(t * 0.4) * 0.05, by + Math.sin(t * 0.32) * 0.04, bz + Math.cos(t * 0.36) * 0.05)
    } else {
      cam.position.set(bx, by, bz)
    }
    cam.lookAt(0, 0, 0)
  })
  return null
}

// Dusk canal water — a flat vertex-coloured plane with a slow UV-free ripple
// on high/medium (vertical bob of the whole sheet), static on low / reduced.
function CanalWater({ reducedMotion, tier }: { reducedMotion: boolean; tier: 'high' | 'medium' | 'low' }) {
  const mesh = useRef<Mesh>(null)
  const animate = tier !== 'low' && !reducedMotion
  useFrame((state) => {
    const m = mesh.current
    if (!m) return
    m.position.y = animate ? -0.06 + Math.sin(state.clock.elapsedTime * 0.6) * 0.012 : -0.06
  })
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
      <planeGeometry args={[COLS * CELL + 6, ROWS * CELL + 6, 1, 1]} />
      <meshStandardMaterial color={palette.duskMid} roughness={0.35} metalness={0.25} />
    </mesh>
  )
}

// Little Venice backdrop — pastel canal-house silhouettes, a small footbridge
// and a couple of moored narrowboats, all procedural low-poly merged shapes.
function CanalBackdrop({ shadows }: { shadows: boolean }) {
  const houses = useRef<InstancedMesh>(null)
  const NUM = 9
  const layout = useMemo(() => {
    const out: { x: number; z: number; h: number; w: number }[] = []
    for (let i = 0; i < NUM; i++) {
      const span = COLS * CELL + 4
      const x = -span / 2 + (i / (NUM - 1)) * span
      out.push({ x, z: -(HALF_D + 1.9), h: 1.0 + ((i * 7) % 5) * 0.22, w: 0.7 + ((i * 3) % 3) * 0.14 })
    }
    return out
  }, [])
  useEffect(() => {
    const m = houses.current
    if (!m) return
    layout.forEach((b, i) => {
      _obj.position.set(b.x, b.h / 2 - 0.06, b.z)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(b.w, b.h, 0.7)
      _obj.updateMatrix()
      m.setMatrixAt(i, _obj.matrix)
      _col.set(i % 2 === 0 ? palette.ink : palette.night)
      m.setColorAt(i, _col)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [layout])
  return (
    <group>
      {/* Pastel canal-house silhouette row */}
      <instancedMesh ref={houses} args={[undefined, undefined, NUM]} frustumCulled={false} castShadow={shadows}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      {/* Small iron footbridge spanning the basin at the far edge */}
      <group position={[0, 0.34, -(HALF_D + 0.65)]}>
        <mesh position={[0, 0.18, 0]}>
          <torusGeometry args={[0.95, 0.06, 8, 20, Math.PI]} />
          <meshStandardMaterial color={palette.brass} roughness={0.5} metalness={0.45} emissive={palette.brass} emissiveIntensity={0.12} />
        </mesh>
        <mesh position={[-0.95, -0.1, 0]}>
          <boxGeometry args={[0.08, 0.4, 0.3]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
        <mesh position={[0.95, -0.1, 0]}>
          <boxGeometry args={[0.08, 0.4, 0.3]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
      </group>
      {/* Two moored narrowboats at the front corners */}
      <MooredBoat position={[-(HALF_W + 0.7), -0.02, HALF_D + 0.5]} flip={false} />
      <MooredBoat position={[HALF_W + 0.4, -0.02, -(HALF_D - 0.3)]} flip />
    </group>
  )
}

function MooredBoat({ position, flip }: { position: [number, number, number]; flip: boolean }) {
  return (
    <group position={position} rotation={[0, flip ? Math.PI * 0.85 : Math.PI * 0.12, 0]}>
      <mesh rotation={[0, 0, 0]}>
        <boxGeometry args={[0.7, 0.16, 0.26]} />
        <meshStandardMaterial color={palette.ink} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <boxGeometry args={[0.4, 0.12, 0.2]} />
        <meshStandardMaterial color={palette.bajlaWing} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0.32, 0.04, 0]} rotation={[0, 0, Math.PI / 2.6]}>
        <coneGeometry args={[0.13, 0.22, 6]} />
        <meshStandardMaterial color={palette.ink} roughness={0.9} flatShading />
      </mesh>
    </group>
  )
}

// Strung paper lanterns overhead pooling warm amber on the water.
function Lanterns({ sway, highFx }: { sway: boolean; highFx: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const light = useRef<PointLight>(null)
  const PER = 5
  const positions = useMemo(() => {
    const out: [number, number, number][] = []
    for (let i = 0; i < PER; i++) {
      const x = -HALF_W + 0.5 + (i / (PER - 1)) * (COLS * CELL - 1.0)
      out.push([x, 2.0, -(HALF_D + 0.2)])
      out.push([x, 2.0, HALF_D + 0.2])
    }
    return out
  }, [])
  useEffect(() => {
    const m = inst.current
    if (!m) return
    positions.forEach((p, i) => {
      _obj.position.set(p[0], p[1], p[2])
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      m.setMatrixAt(i, _obj.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [positions])
  useFrame((state) => {
    if (!sway) return
    const f = 0.6 + Math.sin(state.clock.elapsedTime * 2.4) * 0.12 + Math.sin(state.clock.elapsedTime * 5.0) * 0.05
    const m = inst.current
    if (m) {
      const mat = m.material as { emissiveIntensity?: number }
      if (mat) mat.emissiveIntensity = 0.85 + f * 0.4
    }
    if (light.current) light.current.intensity = 0.55 + f * 0.45
  })
  return (
    <group>
      {/* Gold lantern rope, front + back spans */}
      <mesh position={[0, 2.0, -(HALF_D + 0.2)]}>
        <boxGeometry args={[COLS * CELL + 1.0, 0.015, 0.015]} />
        <meshStandardMaterial color={palette.gold} roughness={0.6} emissive={palette.gold} emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, 2.0, HALF_D + 0.2]}>
        <boxGeometry args={[COLS * CELL + 1.0, 0.015, 0.015]} />
        <meshStandardMaterial color={palette.gold} roughness={0.6} emissive={palette.gold} emissiveIntensity={0.18} />
      </mesh>
      <instancedMesh ref={inst} args={[undefined, undefined, positions.length]} frustumCulled={false}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.9} roughness={0.6} />
      </instancedMesh>
      {highFx && <pointLight ref={light} position={[0, 2.1, 0]} color={palette.lanternAmber} intensity={0.65} distance={11} decay={2} />}
    </group>
  )
}

// Brass coordinate frame ringing the grid (the "Harbour Grid" re-sited).
function BrassFrame() {
  const edgeMat = (
    <meshStandardMaterial color={palette.brass} roughness={0.5} metalness={0.45} emissive={palette.brass} emissiveIntensity={0.12} />
  )
  return (
    <group position={[0, 0.0, 0]}>
      <mesh position={[0, 0.02, -(HALF_D + 0.18)]}>
        <boxGeometry args={[COLS * CELL + 0.5, 0.08, 0.1]} />
        {edgeMat}
      </mesh>
      <mesh position={[0, 0.02, HALF_D + 0.18]}>
        <boxGeometry args={[COLS * CELL + 0.5, 0.08, 0.1]} />
        {edgeMat}
      </mesh>
      <mesh position={[-(HALF_W + 0.18), 0.02, 0]}>
        <boxGeometry args={[0.1, 0.08, ROWS * CELL + 0.5]} />
        {edgeMat}
      </mesh>
      <mesh position={[HALF_W + 0.18, 0.02, 0]}>
        <boxGeometry args={[0.1, 0.08, ROWS * CELL + 0.5]} />
        {edgeMat}
      </mesh>
    </group>
  )
}

// Brass toy periscope at the near corner — Bajla perches on its housing.
function Periscope() {
  return (
    <group position={[HALF_W + 0.95, 0.0, HALF_D + 0.4]}>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 1.1, 14]} />
        <meshStandardMaterial color={palette.brass} roughness={0.45} metalness={0.5} emissive={palette.brass} emissiveIntensity={0.1} />
      </mesh>
      <mesh position={[-0.16, 1.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.09, 0.34, 12]} />
        <meshStandardMaterial color={palette.brass} roughness={0.45} metalness={0.5} />
      </mesh>
      <mesh position={[-0.33, 1.05, 0]}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <meshStandardMaterial color={palette.skyGlow} emissive={palette.lanternCore} emissiveIntensity={0.4} roughness={0.2} />
      </mesh>
    </group>
  )
}

// The 8×8 fog-of-war grid as one InstancedMesh; per-instance colour carries
// fog / hit / miss / cursor / hint state. A single transparent raycast plane
// over the board converts pointer hits into (r,c) fire coordinates.
function GridTiles({
  fired,
  cursor,
  activeCell,
  hintRound,
  ships,
  reducedMotion,
  onPickCell,
}: {
  fired: FiredCell[]
  cursor: { r: number; c: number }
  activeCell: { r: number; c: number } | null
  hintRound: number | null
  ships: ShipCell[]
  reducedMotion: boolean
  onPickCell: (r: number, c: number) => void
}) {
  const inst = useRef<InstancedMesh>(null)

  // Fast lookups for per-frame colouring.
  const firedMap = useMemo(() => {
    const m = new Map<number, CellResult>()
    fired.forEach((f) => m.set(f.r * COLS + f.c, f.result))
    return m
  }, [fired])
  const hintCells = useMemo(() => {
    const s = new Set<number>()
    if (hintRound !== null) {
      ships.forEach((sh) => { if (sh.roundIdx === hintRound && !sh.isHit) s.add(sh.r * COLS + sh.c) })
    }
    return s
  }, [hintRound, ships])

  // Static base matrices (tiles never move).
  useEffect(() => {
    const m = inst.current
    if (!m) return
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c
        _obj.position.set(worldX(c), 0, worldZ(r))
        _obj.rotation.set(0, 0, 0)
        _obj.scale.set(1, 1, 1)
        _obj.updateMatrix()
        m.setMatrixAt(idx, _obj.matrix)
      }
    }
    m.instanceMatrix.needsUpdate = true
  }, [])

  // Per-frame colour pulse for cursor + open cell + hint reveal.
  useFrame((state) => {
    const m = inst.current
    if (!m) return
    const t = reducedMotion ? 0 : state.clock.elapsedTime
    const pulse = 0.5 + Math.sin(t * 4.2) * 0.5
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c
        const res = firedMap.get(idx)
        const isOpen = !!activeCell && activeCell.r === r && activeCell.c === c
        const isCursor = cursor.r === r && cursor.c === c
        if (res === 'hit') {
          _col.copy(_colHit)
        } else if (res === 'miss') {
          _col.copy(_colMiss)
        } else if (isCursor) {
          _col.copy(_colCursor).multiplyScalar(0.55 + pulse * 0.45)
        } else if (isOpen) {
          _col.copy(_colFog).lerp(_colCursor, 0.5).multiplyScalar(0.6 + pulse * 0.4)
        } else if (hintCells.has(idx)) {
          _col.copy(_colHint).multiplyScalar(0.45 + pulse * 0.35)
        } else {
          // Fog-of-war — dim, faintly varied so the basin reads as misty water.
          const tint = 0.16 + (((r * 3 + c * 5) % 4) * 0.015)
          _col.copy(_colFog).multiplyScalar(tint)
        }
        m.setColorAt(idx, _col)
      }
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  // Pointer raycast → grid coordinate. The plane spans exactly the board.
  const onPointerDown = useCallback((e: { stopPropagation: () => void; point: Vector3 }) => {
    e.stopPropagation()
    const px = e.point.x
    const pz = e.point.z
    const c = Math.floor((px + HALF_W) / CELL)
    const r = Math.floor((pz + HALF_D) / CELL)
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return
    onPickCell(r, c)
  }, [onPickCell])

  return (
    <group>
      <instancedMesh ref={inst} args={[undefined, undefined, TILE_COUNT]} frustumCulled={false}>
        <boxGeometry args={[CELL * 0.9, 0.05, CELL * 0.9]} />
        <meshStandardMaterial roughness={0.5} metalness={0.1} transparent opacity={0.92} />
      </instancedMesh>
      {/* Invisible pick plane — converts taps/clicks into (r,c). */}
      <mesh
        position={[0, 0.06, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={onPointerDown}
        visible={false}
      >
        <planeGeometry args={[COLS * CELL, ROWS * CELL]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  )
}

// Hull segments — one InstancedMesh; a confirmed-HIT segment surfaces and is
// tinted leaf/amber, a sunk ship's whole hull keels toward HIT-rose.
function Hulls({
  ships,
  shipsByRound,
  reducedMotion,
}: {
  ships: ShipCell[]
  shipsByRound: Record<number, ShipCell[]>
  reducedMotion: boolean
}) {
  const inst = useRef<InstancedMesh>(null)
  const colorRef = useRef<number>(-1)

  useFrame((state) => {
    const m = inst.current
    if (!m) return
    const t = reducedMotion ? 0 : state.clock.elapsedTime
    let n = 0
    let hitSignature = 0
    for (let i = 0; i < ships.length; i++) {
      const sh = ships[i]
      if (!sh.isHit) continue
      const sunk = (shipsByRound[sh.roundIdx] || []).every((s) => s.isHit)
      const rise = reducedMotion ? 0.14 : 0.12 + Math.sin(t * 3 + i) * 0.02
      _obj.position.set(worldX(sh.c), rise, worldZ(sh.r))
      _obj.rotation.set(0, 0, sunk && !reducedMotion ? Math.sin(t * 1.5 + i) * 0.12 : 0)
      _obj.scale.set(CELL * 0.62, sunk ? 0.1 : 0.16, CELL * 0.62)
      _obj.updateMatrix()
      m.setMatrixAt(n, _obj.matrix)
      _col.copy(sunk ? _colHit : _colHint)
      m.setColorAt(n, _col)
      hitSignature = hitSignature * 31 + i * (sunk ? 2 : 1)
      n++
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor && colorRef.current !== hitSignature) {
      m.instanceColor.needsUpdate = true
      colorRef.current = hitSignature
    }
  })

  return (
    <instancedMesh ref={inst} args={[undefined, undefined, HULL_COUNT]} frustumCulled={false} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.4} metalness={0.15} emissive={palette.leaf} emissiveIntensity={0.25} flatShading />
    </instancedMesh>
  )
}

// Foam / splash ring particles around the most recently fired cell.
function Foam({ fired, density, reducedMotion }: { fired: FiredCell[]; density: number; reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const count = Math.max(0, Math.round(14 * density))
  const last = fired.length > 0 ? fired[fired.length - 1] : null
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({
    ang: (i / Math.max(1, count)) * Math.PI * 2,
    speed: 0.5 + (i % 4) * 0.12,
    phase: (i % 7) / 7,
  })), [count])
  useFrame((state) => {
    const m = inst.current
    if (!m || count === 0) return
    if (!last) { m.count = 0; return }
    const cx = worldX(last.c)
    const cz = worldZ(last.r)
    const base = reducedMotion ? 0.4 : (state.clock.elapsedTime * 0.6) % 1
    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      const phase = (base + s.phase) % 1
      const rad = 0.1 + phase * CELL * 0.9 * s.speed
      _obj.position.set(cx + Math.cos(s.ang) * rad, 0.09, cz + Math.sin(s.ang) * rad)
      const sc = 0.05 * (1 - phase)
      _obj.scale.set(sc, sc, sc)
      _obj.rotation.set(0, 0, 0)
      _obj.updateMatrix()
      m.setMatrixAt(i, _obj.matrix)
      _col.set(last.result === 'hit' ? palette.leaf : ACCENT)
      m.setColorAt(i, _col)
    }
    m.count = count
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  if (count === 0) return null
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.7} transparent opacity={0.85} />
    </instancedMesh>
  )
}

// Projects each grid-frame label's world position to screen px and writes the
// transform onto the DOM coordinate label (English stays crisp DOM).
interface FrameLabel { key: string; world: [number, number, number]; text: string }
function LabelProjector({ labels, labelRefs }: { labels: FrameLabel[]; labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  useFrame(() => {
    for (let i = 0; i < labels.length; i++) {
      const el = labelRefs.current[i]
      if (!el) continue
      _pos.set(labels[i].world[0], labels[i].world[1], labels[i].world[2]).project(cam)
      if (_pos.z > 1) { el.style.opacity = '0'; continue }
      const x = (_pos.x * 0.5 + 0.5) * size.width
      const y = (-_pos.y * 0.5 + 0.5) * size.height
      el.style.opacity = '0.8'
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    }
  })
  return null
}

// =========================================================================
// Battleship3D — the Game3D component (default export)
// =========================================================================
export default function Battleship3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const activePuzzle = useMemo<ArcadePuzzle>(() => {
    const p = puzzle as ArcadePuzzle | undefined
    if (p && Array.isArray(p.rounds) && p.rounds.length > 0) return p
    if (vocab && vocab.length > 0) {
      const gen = generateBattleshipPuzzle(vocabToArcade(vocab), { seed: 7 })
      if (gen && gen.rounds.length > 0) return gen
    }
    return DEMO_PUZZLE
  }, [puzzle, vocab])
  const rounds = activePuzzle.rounds
  const total = rounds.length

  const initialShips = useMemo(() => buildShips(total), [total])

  const [ships, setShips] = useState<ShipCell[]>(initialShips)
  const [fired, setFired] = useState<FiredCell[]>([])
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [pickedIdx, setPickedIdx] = useState<number | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintRound, setHintRound] = useState<number | null>(null)
  const [cursor, setCursor] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const [live, setLive] = useState('')

  const startMs = useRef(performance.now())
  const fired1 = useRef(false)
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const missTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const labelRefs = useRef<(HTMLDivElement | null)[]>([])

  // Group ships by round (mirrors the 2D shell's shipsByRound).
  const shipsByRound = useMemo(() => {
    const map: Record<number, ShipCell[]> = {}
    ships.forEach((s) => { (map[s.roundIdx] ||= []).push(s) })
    return map
  }, [ships])

  const sunkRounds = useMemo(
    () => rounds.map((_, i) => {
      const s = shipsByRound[i] || []
      return s.length > 0 && s.every((c) => c.isHit)
    }),
    [rounds, shipsByRound],
  )
  const completed = total > 0 && sunkRounds.every(Boolean)
  const correctCount = sunkRounds.filter(Boolean).length // SUNK ships, per fidelity note

  const cellShip = useCallback((r: number, c: number): ShipCell | null => ships.find((s) => s.r === r && s.c === c) || null, [ships])
  const cellFired = useCallback((r: number, c: number): FiredCell | null => fired.find((f) => f.r === r && f.c === c) || null, [fired])

  const activeRound: ArcadeRound | null = activeCell ? rounds[(cellShip(activeCell.r, activeCell.c) as ShipCell).roundIdx] : null
  const answerWord = activeRound ? activeRound.options[activeRound.answerIndex] : ''
  const renderedPrompt = useMemo(() => maskAnswerInPrompt(activeRound?.prompt, answerWord), [activeRound?.prompt, answerWord])

  const bajla: 'idle' | 'flyby' | 'celebrate' = completed ? 'celebrate' : hintRound !== null ? 'flyby' : 'idle'

  // fireAt — mirrors the 2D shell exactly.
  const fireAt = useCallback((r: number, c: number): void => {
    if (cellFired(r, c)) return
    if (activeCell) return // can't open another while one's open
    const ship = cellShip(r, c)
    if (!ship) {
      // Empty water — instant miss, no score impact.
      setFired((prev) => [...prev, { r, c, result: 'miss' }])
      setFeedback('wrong')
      setLive(`Miss at ${coordLabel(r, c)}.`)
      if (missTimer.current) clearTimeout(missTimer.current)
      missTimer.current = setTimeout(() => setFeedback(null), MISS_MS)
      return
    }
    // Ship cell — open the question.
    setActiveCell({ r, c })
    setPickedIdx(null)
    setLive(`Firing on ${coordLabel(r, c)}. Answer to confirm the hit.`)
  }, [activeCell, cellFired, cellShip])

  // pick — mirrors the 2D shell exactly.
  const pick = useCallback((oi: number): void => {
    if (!activeCell) return
    const ship = cellShip(activeCell.r, activeCell.c)
    if (!ship) return
    const round = rounds[ship.roundIdx]
    setPickedIdx(oi)
    const correct = oi === round.answerIndex
    if (correct) {
      // HIT — mark the ship cell, count as fired.
      setShips((prev) => prev.map((s) => (s.r === activeCell.r && s.c === activeCell.c) ? { ...s, isHit: true } : s))
      setFired((prev) => [...prev, { r: activeCell.r, c: activeCell.c, result: 'hit' }])
      setFeedback('correct')
      setLive('Hit.')
      if (hitTimer.current) clearTimeout(hitTimer.current)
      hitTimer.current = setTimeout(() => {
        setActiveCell(null)
        setPickedIdx(null)
        setFeedback(null)
      }, HIT_MS)
    } else {
      // Wrong — record the wrong attempt; lock the cell as a miss so the
      // player must strike the ship's other hull cells.
      setFeedback('wrong')
      setLive('Miss.')
      if (wrongTimer.current) clearTimeout(wrongTimer.current)
      wrongTimer.current = setTimeout(() => {
        setFired((prev) => [...prev, { r: activeCell.r, c: activeCell.c, result: 'miss' }])
        setActiveCell(null)
        setPickedIdx(null)
        setFeedback(null)
      }, WRONG_MS)
    }
  }, [activeCell, cellShip, rounds])

  // useHint — reveal a not-yet-sunk round's cells (~3.2s). 3 per session.
  const useHint = useCallback((): void => {
    if (hintsUsed >= HINT_MAX) return
    const rIdx = sunkRounds.findIndex((s) => !s)
    if (rIdx < 0) return
    setHintRound(rIdx)
    setHintsUsed((h) => h + 1)
    setLive(`Sonar ping — a ship is revealed.`)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHintRound(null), HINT_MS)
  }, [hintsUsed, sunkRounds])

  // skip — just closes the MCQ (no score effect), exactly like the 2D shell.
  const skip = useCallback((): void => {
    setActiveCell(null)
    setPickedIdx(null)
    setLive('')
  }, [])

  const onPickCell = useCallback((r: number, c: number) => {
    setCursor({ r, c })
    fireAt(r, c)
  }, [fireAt])

  // Fire the session result exactly once, on completion.
  useEffect(() => {
    if (completed && !fired1.current) {
      fired1.current = true
      setLive('The canal clears. All ships sunk.')
      const result: SessionResult = {
        correctCount,
        totalQuestions: total,
        durationMs: Math.round(performance.now() - startMs.current),
        shellKey: 'battleship',
      }
      onSessionComplete?.(result)
    }
  }, [completed, correctCount, total, onSessionComplete])

  // Keyboard — arrows move the cursor; Space/Enter fires; 1–4 / A–D answer an
  // open MCQ; Enter confirms the highlighted; Esc skips; H hint, S skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (completed) return
      if (activeCell) {
        // MCQ overlay focus: number / letter picks.
        const round = activeRound
        if (!round) return
        const k = e.key.toLowerCase()
        const numIdx = '1234'.indexOf(e.key)
        const letterIdx = 'abcd'.indexOf(k)
        const optIdx = numIdx >= 0 ? numIdx : letterIdx
        if (optIdx >= 0 && optIdx < round.options.length) {
          e.preventDefault()
          if (pickedIdx === null) pick(optIdx)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          skip()
        } else if (k === 's') {
          e.preventDefault()
          skip()
        }
        return
      }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => ({ r: Math.max(0, c.r - 1), c: c.c })) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => ({ r: Math.min(ROWS - 1, c.r + 1), c: c.c })) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setCursor((c) => ({ r: c.r, c: Math.max(0, c.c - 1) })) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setCursor((c) => ({ r: c.r, c: Math.min(COLS - 1, c.c + 1) })) }
      else if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') { e.preventDefault(); fireAt(cursor.r, cursor.c) }
      else if (e.key.toLowerCase() === 'h') { e.preventDefault(); useHint() }
      else if (e.key.toLowerCase() === 's') { e.preventDefault(); skip() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeCell, activeRound, completed, cursor, fireAt, pick, pickedIdx, skip, useHint])

  // Cleanup timers on unmount.
  useEffect(() => () => {
    if (hitTimer.current) clearTimeout(hitTimer.current)
    if (wrongTimer.current) clearTimeout(wrongTimer.current)
    if (missTimer.current) clearTimeout(missTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
  }, [])

  const replay = useCallback(() => {
    if (hitTimer.current) clearTimeout(hitTimer.current)
    if (wrongTimer.current) clearTimeout(wrongTimer.current)
    if (missTimer.current) clearTimeout(missTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    fired1.current = false
    startMs.current = performance.now()
    setShips(initialShips.map((s) => ({ ...s, isHit: false })))
    setFired([])
    setActiveCell(null)
    setPickedIdx(null)
    setFeedback(null)
    setHintsUsed(0)
    setHintRound(null)
    setCursor({ r: 0, c: 0 })
    setLive('')
  }, [initialShips])

  // Coordinate labels along the frame (A–H across the front; 1–8 down the
  // left) — crisp DOM, positioned by the 3D LabelProjector.
  const frameLabels = useMemo<FrameLabel[]>(() => {
    const out: FrameLabel[] = []
    for (let c = 0; c < COLS; c++) out.push({ key: `col-${c}`, world: [worldX(c), 0.06, HALF_D + 0.55], text: colLetter(c) })
    for (let r = 0; r < ROWS; r++) out.push({ key: `row-${r}`, world: [-(HALF_W + 0.55), 0.06, worldZ(r)], text: String(r + 1) })
    return out
  }, [])

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'var(--em-mono, ui-monospace, monospace)', color: '#EDE6FF' }}>
      <style>{`
        @keyframes bs-pop { 0%{transform:translateY(8px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes bs-rise { 0%{transform:translate(-50%,-46%);opacity:0} 100%{transform:translate(-50%,-50%);opacity:1} }
      `}</style>

      {/* Screen-reader live region (canvas is aria-hidden inside CityStage) */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Title eyebrow — pinned top-centre */}
      <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 22, color: ACCENT, textShadow: `0 0 14px ${ACCENT}88`, letterSpacing: '0.04em' }}>Bathtub Fleet</div>
        <div style={{ fontSize: 10, letterSpacing: '0.2em', opacity: 0.8 }}>FIND THE FLEET · LITTLE VENICE CANALS</div>
      </div>

      {/* HUD — fleet tally + hints, top-left (mirrors the 2D shell) */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <HudPill label="SUNK · ZATOPIONE" value={`${correctCount} / ${total}`} accent={HIT_COL} />
        <HudPill label="CURSOR · KURSOR" value={coordLabel(cursor.r, cursor.c)} />
      </div>

      {/* Coordinate labels (A–H / 1–8) — DOM, positioned by LabelProjector */}
      {frameLabels.map((l, i) => (
        <div
          key={l.key}
          ref={(el) => { labelRefs.current[i] = el }}
          style={{
            position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none',
            fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 12, fontWeight: 700,
            color: ACCENT, letterSpacing: '0.08em',
          }}
        >{l.text}</div>
      ))}

      {/* MCQ card — appears on a ship-cell strike ("FIRING ON C5") */}
      {activeCell && activeRound && (
        <div
          role="dialog"
          aria-label={`Firing on ${coordLabel(activeCell.r, activeCell.c)}`}
          style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 'min(440px, 90%)', padding: 20, borderRadius: 14,
            background: 'linear-gradient(180deg, rgba(20,12,38,0.98) 0%, rgba(8,4,20,0.98) 100%)',
            border: `1.5px solid ${ACCENT}88`, boxShadow: `0 20px 48px rgba(0,0,0,0.7), 0 0 36px ${ACCENT}33`,
            animation: 'bs-rise 320ms ease', pointerEvents: 'auto', zIndex: 5,
          }}
          key={`mcq-${activeCell.r}-${activeCell.c}`}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.2em', color: ACCENT }}>FIRING ON</span>
            <span style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 22, color: ACCENT, letterSpacing: '0.1em' }}>{coordLabel(activeCell.r, activeCell.c)}</span>
          </div>
          <div style={{ fontFamily: 'var(--em-decor, var(--em-mono, system-ui))', fontSize: 17, lineHeight: 1.35, marginBottom: 14 }}>{renderedPrompt}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {activeRound.options.map((opt, oi) => {
              const isCorrect = oi === activeRound.answerIndex
              const isPicked = pickedIdx === oi
              const showState = pickedIdx !== null
              const bg = showState && isCorrect ? 'rgba(127,176,105,0.24)' : showState && isPicked ? 'rgba(251,113,133,0.2)' : 'rgba(125,211,252,0.06)'
              const bd = showState && isCorrect ? `${palette.leaf}` : showState && isPicked ? HIT_COL : `${ACCENT}55`
              return (
                <button
                  key={oi}
                  type="button"
                  onClick={() => pickedIdx === null && pick(oi)}
                  disabled={pickedIdx !== null}
                  aria-label={`Option ${colLetter(oi)}: ${opt}`}
                  style={{
                    minHeight: 44, padding: '10px 12px', borderRadius: 8, textAlign: 'left',
                    background: bg, border: `1px solid ${bd}`, color: '#EDE6FF', fontSize: 13,
                    display: 'flex', alignItems: 'center', gap: 8, cursor: pickedIdx === null ? 'pointer' : 'default',
                    touchAction: 'manipulation',
                  }}
                >
                  <span style={{ fontFamily: 'var(--em-mono, monospace)', fontSize: 10, color: ACCENT, opacity: 0.7, minWidth: 12 }}>{colLetter(oi)}</span>
                  <span style={{ flex: 1 }}>{opt}</span>
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={skip} style={btnStyle()} aria-label="Skip this cell">SKIP</button>
          </div>
        </div>
      )}

      {/* Controls — Hint / Skip (≥44px tap targets) */}
      <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={useHint} disabled={hintsUsed >= HINT_MAX} style={btnStyle(hintsUsed >= HINT_MAX)} aria-label={`Hint, ${HINT_MAX - hintsUsed} left`}>HINT {HINT_MAX - hintsUsed}</button>
        <button onClick={skip} style={btnStyle()} aria-label="Skip the open question">SKIP</button>
      </div>

      {/* Touch D-pad + Fire — bottom-right (keyboard-free firing path) */}
      <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 46px)', gridTemplateRows: 'repeat(3, 46px)', gap: 4, pointerEvents: 'auto' }}>
        <span /><button onClick={() => setCursor((c) => ({ r: Math.max(0, c.r - 1), c: c.c }))} style={dpad()} aria-label="Cursor up">↑</button><span />
        <button onClick={() => setCursor((c) => ({ r: c.r, c: Math.max(0, c.c - 1) }))} style={dpad()} aria-label="Cursor left">←</button>
        <button onClick={() => fireAt(cursor.r, cursor.c)} style={{ ...dpad(), background: `${ACCENT}33`, color: ACCENT, fontSize: 12 }} aria-label="Fire">FIRE</button>
        <button onClick={() => setCursor((c) => ({ r: c.r, c: Math.min(COLS - 1, c.c + 1) }))} style={dpad()} aria-label="Cursor right">→</button>
        <span /><button onClick={() => setCursor((c) => ({ r: Math.min(ROWS - 1, c.r + 1), c: c.c }))} style={dpad()} aria-label="Cursor down">↓</button><span />
      </div>

      {/* Fleet status — sunk N / total per ship, bottom-centre strip */}
      <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, pointerEvents: 'none' }}>
        {rounds.map((_, i) => {
          const cells = shipsByRound[i] || []
          const hits = cells.filter((c) => c.isHit).length
          const sunk = sunkRounds[i]
          return (
            <div key={i} style={{ display: 'flex', gap: 2, padding: '5px 7px', borderRadius: 6, background: sunk ? 'rgba(251,113,133,0.14)' : 'rgba(125,211,252,0.08)', border: `1px solid ${sunk ? `${HIT_COL}66` : `${ACCENT}33`}` }} aria-hidden="true">
              {Array.from({ length: SHIP_LEN }).map((_, k) => (
                <span key={k} style={{ width: 8, height: 8, borderRadius: 2, background: k < hits ? HIT_COL : ACCENT, opacity: k < hits ? 1 : 0.3 }} />
              ))}
            </div>
          )
        })}
      </div>

      {/* End card */}
      {completed && (
        <div role="dialog" aria-label="Bathtub Fleet complete" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: `radial-gradient(ellipse, ${ACCENT}22, rgba(10,5,24,0.72))`, backdropFilter: 'blur(6px)', pointerEvents: 'auto', zIndex: 6 }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 34, color: ACCENT, textShadow: `0 0 18px ${ACCENT}aa` }}>The canal clears.</div>
          <div style={{ fontSize: 14 }}>You sank <strong style={{ color: HIT_COL }}>{correctCount}</strong> / {total} ships</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={replay} style={btnStyle()}>Replay</button>
            <button onClick={replay} style={{ ...btnStyle(), background: ACCENT, color: '#06222F', borderColor: ACCENT }}>Next district →</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div
      role="application"
      aria-label="Bathtub Fleet — call coordinates on the canal grid and answer to sink the fleet"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 6.5, 5.5]}
        cameraFov={40}
        overlay={overlay}
      >
        <CanalScene
          ships={ships}
          fired={fired}
          cursor={cursor}
          activeCell={activeCell}
          hintRound={hintRound}
          shipsByRound={shipsByRound}
          reducedMotion={reduce}
          bajla={bajla}
          onPickCell={onPickCell}
        />
        <LabelProjector labels={frameLabels} labelRefs={labelRefs} />
      </CityStage>
    </div>
  )
}

// ── Small DOM helpers ─────────────────────────────────────────────────────
function HudPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = accent ?? ACCENT
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'rgba(14,10,26,0.85)', border: `1px solid ${c}66`, borderRadius: 6 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: c }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: accent ?? '#FFFFFF' }}>{value}</span>
    </div>
  )
}

function btnStyle(disabled = false): React.CSSProperties {
  return {
    minHeight: 44, minWidth: 52, padding: '8px 14px', borderRadius: 8,
    background: 'rgba(125,211,252,0.16)', border: `1px solid ${ACCENT}66`,
    color: ACCENT, fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 12,
    letterSpacing: '0.1em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
    touchAction: 'manipulation',
  }
}

function dpad(): React.CSSProperties {
  return {
    minWidth: 46, minHeight: 46, background: 'rgba(125,211,252,0.18)',
    border: `1px solid ${ACCENT}66`, borderRadius: 8, color: ACCENT,
    fontSize: 18, cursor: 'pointer', touchAction: 'manipulation',
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
