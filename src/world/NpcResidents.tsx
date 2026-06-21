// NpcResidents — the English Metro resident crowd, built INSTANCED-PER-PART so a
// full cast costs a fixed ~12 draw calls regardless of headcount (vs 8+ draw
// calls PER character the naive way). Each body-part type is one InstancedMesh
// (coat / hem / neck / head / hair / eyes / arms / hands / scarf / apron /
// collar / cap) whose per-instance transform + color is composed each frame
// from the character's orbit transform × the part's local offset. Arms swing
// fwd/back at the shoulder (pivot compose) in opposite phase = a walking gait.
//
// 8 canon residents drawn from the Story Bible cast (Flora, Mr. Chen, Tomás,
// Mr. Frank, Posta, Conductor Pell, Ines + a Lanterngate elder), each a fully-
// fleshed person (coat with A-line taper + hem, neck, head, hair cap, two eyes,
// and a character-defining accessory) in distinct dusk-teal-&-amber colors and
// builds. They drift slowly around the plaza on individual orbits.
//
// CONTRACT: zero new deps, no textures/GLBs/URLs. Procedural geometry only.
// Per-frame work is allocation-free (module-scope scratch Object3D/Matrix4);
// reducedMotion → composed once then frozen (arms hang straight). Draw calls:
// 12 (one InstancedMesh per part type). Accessories hide via zero-scale.

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, Matrix4, Color } from 'three'
import type { InstancedMesh } from 'three'
import { ROSTER } from './wardrobe'

const NPC_RADIUS = 12.5
const BASE_SPEED = 0.14

// Allocation-free scratch.
const _parent = new Object3D()
const _child = new Object3D()
const _pivot = new Object3D() // shoulder pivot for the swinging arms
const _mat = new Matrix4()
const _col = new Color()

// Arm geometry (shared; per-instance only transform + colour vary).
const ARM_LEN = 0.55
const ARM_SWING = 0.45 // radians, fwd/back at the shoulder while walking

type Accessory = 'scarf' | 'apron' | 'collar' | 'cap'

interface ResidentDef {
  coat: string; hem: string; skin: string; hair: string; accent: string
  style: Accessory
  initAngle: number; speedMul: number
  girth: number   // coat bottom radius (silhouette build)
  headR: number   // head radius (height/build)
}

// The drifting crowd is now driven by the SAME original 19-character ROSTER as
// the named keepers (src/world/wardrobe.ts) — so the whole cast shares one
// source of truth and we match abeto's ~19 NPC count. Each ROSTER spec maps
// onto this instanced renderer's per-part fields (top→coat, bottom→hem,
// shoes→accent, top-style→accessory) + an evenly-spread orbit. Rendering stays
// instanced-per-part, so 19 residents still cost ~10 draw calls (vs ~150 naive).
const ACCESSORY_FOR: Record<string, Accessory> = {
  apron: 'apron', smock: 'apron',
  uniform: 'collar', coat: 'collar', vest: 'collar',
  shawl: 'scarf', cardigan: 'scarf', raincoat: 'scarf', pullover: 'scarf',
}
const RESIDENTS: ResidentDef[] = ROSTER.map((r, i) => ({
  coat: r.topColor,
  hem: r.bottomColor,
  skin: r.skin,
  hair: r.hairColor,
  accent: r.shoeColor,
  style: ACCESSORY_FOR[r.top] ?? 'scarf',
  initAngle: (i / ROSTER.length) * Math.PI * 2,
  speedMul: 0.80 + (i % 6) * 0.07,        // 0.80 .. 1.15 — varied gaits
  girth: 0.30 + (r.girth - 0.78) * 0.20,  // map roster girth ~0.78..1.18 → ~0.30..0.40
  headR: 0.180 + (r.height - 0.84) * 0.10, // map roster height ~0.84..1.10 → ~0.18..0.206
}))

const N = RESIDENTS.length
const EYE = '#1A1410'

export interface NpcResidentsProps {
  reducedMotion: boolean
}

export function NpcResidents({ reducedMotion }: NpcResidentsProps) {
  const coatRef = useRef<InstancedMesh>(null!)
  const hemRef = useRef<InstancedMesh>(null!)
  const neckRef = useRef<InstancedMesh>(null!)
  const headRef = useRef<InstancedMesh>(null!)
  const hairRef = useRef<InstancedMesh>(null!)
  const eyesRef = useRef<InstancedMesh>(null!)
  const armRef = useRef<InstancedMesh>(null!)
  const handRef = useRef<InstancedMesh>(null!)
  const scarfRef = useRef<InstancedMesh>(null!)
  const apronRef = useRef<InstancedMesh>(null!)
  const collarRef = useRef<InstancedMesh>(null!)
  const capRef = useRef<InstancedMesh>(null!)
  const tRef = useRef(0)
  const doneRef = useRef(false)

  // Per-instance colors — set once.
  useEffect(() => {
    RESIDENTS.forEach((d, c) => {
      _col.set(d.coat);  coatRef.current.setColorAt(c, _col)
      _col.set(d.hem);   hemRef.current.setColorAt(c, _col)
      _col.set(d.skin);  neckRef.current.setColorAt(c, _col)
      _col.set(d.skin);  headRef.current.setColorAt(c, _col)
      _col.set(d.hair);  hairRef.current.setColorAt(c, _col)
      _col.set(d.accent)
      scarfRef.current.setColorAt(c, _col)
      apronRef.current.setColorAt(c, _col)
      collarRef.current.setColorAt(c, _col)
      capRef.current.setColorAt(c, _col)
      // Arms (sleeves) take the coat colour; hands take skin — two per person.
      _col.set(d.coat); armRef.current.setColorAt(c * 2, _col); armRef.current.setColorAt(c * 2 + 1, _col)
      _col.set(d.skin); handRef.current.setColorAt(c * 2, _col); handRef.current.setColorAt(c * 2 + 1, _col)
    })
    for (const r of [coatRef, hemRef, neckRef, headRef, hairRef, scarfRef, apronRef, collarRef, capRef, armRef, handRef]) {
      if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true
    }
  }, [])

  useFrame((_, delta) => {
    if (reducedMotion && doneRef.current) return
    if (!reducedMotion) tRef.current += delta
    const t = tRef.current

    // Compose part instance = parent(orbit) × child(local offset/scale/rot).
    const place = (
      ref: React.MutableRefObject<InstancedMesh>, idx: number,
      px: number, py: number, pz: number,
      sx: number, sy: number, sz: number,
      rx = 0, ry = 0, rz = 0,
    ) => {
      _child.position.set(px, py, pz)
      _child.rotation.set(rx, ry, rz)
      _child.scale.set(sx, sy, sz)
      _child.updateMatrix()
      _mat.multiplyMatrices(_parent.matrix, _child.matrix)
      ref.current.setMatrixAt(idx, _mat)
    }
    const hide = (ref: React.MutableRefObject<InstancedMesh>, idx: number) =>
      place(ref, idx, 0, -100, 0, 0, 0, 0)

    // Swinging limb: pivot at the shoulder (translate + fwd/back swing), the
    // part hangs `childY` below it. matrix = parent × pivot × childLocal.
    const placeArm = (
      ref: React.MutableRefObject<InstancedMesh>, idx: number,
      sx: number, sy: number, side: number, swing: number, childY: number,
    ) => {
      _pivot.position.set(side * sx, sy, 0)
      _pivot.rotation.set(swing, 0, side * 0.12)
      _pivot.updateMatrix()
      _child.position.set(0, childY, 0)
      _child.rotation.set(0, 0, 0)
      _child.scale.set(1, 1, 1)
      _child.updateMatrix()
      _mat.multiplyMatrices(_parent.matrix, _pivot.matrix)
      _mat.multiply(_child.matrix)
      ref.current.setMatrixAt(idx, _mat)
    }

    for (let c = 0; c < N; c++) {
      const d = RESIDENTS[c]
      const angle = d.initAngle + t * BASE_SPEED * d.speedMul
      // Gentle walking bob — a little vertical lilt per resident (frozen under reducedMotion).
      const bob = reducedMotion ? 0 : Math.abs(Math.sin(t * 2.2 * d.speedMul + d.initAngle * 4)) * 0.06
      _parent.position.set(Math.cos(angle) * NPC_RADIUS, bob, Math.sin(angle) * NPC_RADIUS)
      _parent.rotation.set(0, -angle + Math.PI / 2, 0)
      _parent.scale.setScalar(1)
      _parent.updateMatrix()

      const g = d.girth
      const hr = d.headR
      const top = 1.4 // coat top y (height fixed; build varies via girth/headR)

      // Coat (A-line: base taper 0.6:1.0, scaled to girth) + hem band.
      place(coatRef, c, 0, 0.7, 0, g, 1, g)
      place(hemRef, c, 0, 0.03, 0, g + 0.01, 1, g + 0.01)
      // Neck + head + hair cap.
      place(neckRef, c, 0, top + 0.04, 0, 1, 1, 1)
      place(headRef, c, 0, top + 0.18 + hr, 0, hr, hr, hr)
      place(hairRef, c, 0, top + 0.24 + hr, -0.02, hr * 1.06, hr * 1.06, hr * 1.06)
      // Eyes (two per character, front face +Z).
      const eyeY = top + 0.15 + hr
      place(eyesRef, c * 2,     -hr * 0.36, eyeY, hr * 0.9, hr * 0.15, hr * 0.15, hr * 0.15)
      place(eyesRef, c * 2 + 1,  hr * 0.36, eyeY, hr * 0.9, hr * 0.15, hr * 0.15, hr * 0.15)

      // Swinging arms + hands — two per person, opposite phase = a walking gait.
      const sw = reducedMotion ? 0 : Math.sin(t * 2.2 * d.speedMul + d.initAngle * 4) * ARM_SWING
      const shX = 0.6 * g   // shoulders at the coat's top radius
      const shY = top - 0.16
      placeArm(armRef,  c * 2,     shX, shY, -1,  sw, -ARM_LEN / 2)
      placeArm(armRef,  c * 2 + 1, shX, shY,  1, -sw, -ARM_LEN / 2)
      placeArm(handRef, c * 2,     shX, shY, -1,  sw, -ARM_LEN)
      placeArm(handRef, c * 2 + 1, shX, shY,  1, -sw, -ARM_LEN)

      // Accessory — set the matching mesh, hide the others.
      if (d.style === 'scarf') place(scarfRef, c, 0, top + 0.02, 0, g * 0.32, g * 0.32, g * 0.32, Math.PI / 2, 0, 0)
      else hide(scarfRef, c)
      if (d.style === 'apron') place(apronRef, c, 0, 0.74, g * 0.8, g * 0.95, 0.6, 0.04)
      else hide(apronRef, c)
      if (d.style === 'collar') place(collarRef, c, 0, top - 0.04, g * 0.5, g * 1.2, 0.09, 0.04)
      else hide(collarRef, c)
      if (d.style === 'cap') place(capRef, c, 0, top + 0.22 + hr * 2, 0.02, hr * 2.2, 0.1, hr * 2.2)
      else hide(capRef, c)
    }

    for (const r of [coatRef, hemRef, neckRef, headRef, hairRef, eyesRef, armRef, handRef, scarfRef, apronRef, collarRef, capRef]) {
      r.current.instanceMatrix.needsUpdate = true
    }
    doneRef.current = true
  })

  return (
    <group>
      {/* Coat (A-line taper baked into base geometry; scaled to girth) */}
      <instancedMesh ref={coatRef} args={[undefined, undefined, N]} frustumCulled={false} castShadow>
        <cylinderGeometry args={[0.6, 1.0, 1.4, 9]} />
        <meshToonMaterial />
      </instancedMesh>
      {/* Hem shadow band */}
      <instancedMesh ref={hemRef} args={[undefined, undefined, N]} frustumCulled={false}>
        <cylinderGeometry args={[1.0, 1.0, 0.07, 9]} />
        <meshToonMaterial />
      </instancedMesh>
      {/* Neck */}
      <instancedMesh ref={neckRef} args={[undefined, undefined, N]} frustumCulled={false}>
        <cylinderGeometry args={[0.08, 0.09, 0.12, 7]} />
        <meshToonMaterial />
      </instancedMesh>
      {/* Head */}
      <instancedMesh ref={headRef} args={[undefined, undefined, N]} frustumCulled={false} castShadow>
        <sphereGeometry args={[1, 14, 11]} />
        <meshToonMaterial />
      </instancedMesh>
      {/* Hair cap (upper dome) */}
      <instancedMesh ref={hairRef} args={[undefined, undefined, N]} frustumCulled={false}>
        <sphereGeometry args={[1, 11, 9, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        <meshToonMaterial />
      </instancedMesh>
      {/* Eyes (2 per character) */}
      <instancedMesh ref={eyesRef} args={[undefined, undefined, N * 2]} frustumCulled={false}>
        <sphereGeometry args={[1, 7, 6]} />
        <meshToonMaterial color={EYE} />
      </instancedMesh>
      {/* Arms — sleeves (coat colour), 2 per character, swing with the gait */}
      <instancedMesh ref={armRef} args={[undefined, undefined, N * 2]} frustumCulled={false}>
        <cylinderGeometry args={[0.058, 0.046, ARM_LEN, 6]} />
        <meshToonMaterial />
      </instancedMesh>
      {/* Hands — skin, 2 per character, at the wrist end of each arm */}
      <instancedMesh ref={handRef} args={[undefined, undefined, N * 2]} frustumCulled={false}>
        <sphereGeometry args={[0.07, 8, 7]} />
        <meshToonMaterial />
      </instancedMesh>
      {/* Accessory: scarf (torus) */}
      <instancedMesh ref={scarfRef} args={[undefined, undefined, N]} frustumCulled={false}>
        <torusGeometry args={[1, 0.4, 6, 12]} />
        <meshToonMaterial />
      </instancedMesh>
      {/* Accessory: apron (box) */}
      <instancedMesh ref={apronRef} args={[undefined, undefined, N]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshToonMaterial />
      </instancedMesh>
      {/* Accessory: collar (box) */}
      <instancedMesh ref={collarRef} args={[undefined, undefined, N]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshToonMaterial />
      </instancedMesh>
      {/* Accessory: cap (box) */}
      <instancedMesh ref={capRef} args={[undefined, undefined, N]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshToonMaterial />
      </instancedMesh>
    </group>
  )
}
