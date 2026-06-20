// NpcResidents — the English Metro resident crowd, built INSTANCED-PER-PART so a
// full cast costs a fixed ~10 draw calls regardless of headcount (vs 8 draw
// calls PER character the naive way). Each body-part type is one InstancedMesh
// (coat / hem / neck / head / hair / eyes / scarf / apron / collar / cap) whose
// per-instance transform + color is composed each frame from the character's
// orbit transform × the part's local offset.
//
// 8 canon residents drawn from the Story Bible cast (Flora, Mr. Chen, Tomás,
// Mr. Frank, Posta, Conductor Pell, Ines + a Lanterngate elder), each a fully-
// fleshed person (coat with A-line taper + hem, neck, head, hair cap, two eyes,
// and a character-defining accessory) in distinct dusk-teal-&-amber colors and
// builds. They drift slowly around the plaza on individual orbits.
//
// CONTRACT: zero new deps, no textures/GLBs/URLs. Procedural geometry only.
// Per-frame work is allocation-free (module-scope scratch Object3D/Matrix4);
// reducedMotion → composed once then frozen. Draw calls: 10 (one InstancedMesh
// per part type). Accessory meshes hide non-matching characters via zero-scale.

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, Matrix4, Color } from 'three'
import type { InstancedMesh } from 'three'

const NPC_RADIUS = 12.5
const BASE_SPEED = 0.14

// Allocation-free scratch.
const _parent = new Object3D()
const _child = new Object3D()
const _mat = new Matrix4()
const _col = new Color()

type Accessory = 'scarf' | 'apron' | 'collar' | 'cap'

interface ResidentDef {
  coat: string; hem: string; skin: string; hair: string; accent: string
  style: Accessory
  initAngle: number; speedMul: number
  girth: number   // coat bottom radius (silhouette build)
  headR: number   // head radius (height/build)
}

// 8 canon residents — all original English Metro designs, Dusk-Teal & Amber.
const RESIDENTS: ResidentDef[] = [
  // 0. Lanterngate elder — plum coat, grey hair, amber shawl-scarf, stocky
  { coat: '#6B4F70', hem: '#52305A', skin: '#E8C8A8', hair: '#8A7F7A', accent: '#C2913F', style: 'scarf',  initAngle: 0.20, speedMul: 0.86, girth: 0.44, headR: 0.215 },
  // 1. Flora — sage green coat, auburn hair, cream apron (flower-seller)
  { coat: '#5A7A5E', hem: '#3E5942', skin: '#E8C8A8', hair: '#7A4A2A', accent: '#D9CDB4', style: 'apron',  initAngle: 1.05, speedMul: 1.12, girth: 0.36, headR: 0.190 },
  // 2. Mr. Chen — deep teal coat, grey hair, white collar (café-keeper)
  { coat: '#2E5C65', hem: '#1F4048', skin: '#D2A77E', hair: '#6E6E6E', accent: '#F6EFE2', style: 'collar', initAngle: 1.90, speedMul: 1.02, girth: 0.40, headR: 0.220 },
  // 3. Tomás — rust coat, espresso hair, bright amber scarf (young patron)
  { coat: '#8A5A3A', hem: '#663E22', skin: '#F0D0B0', hair: '#2E2622', accent: '#E8920A', style: 'scarf',  initAngle: 2.70, speedMul: 1.30, girth: 0.30, headR: 0.180 },
  // 4. Mr. Frank — navy-teal coat, grey hair, white collar (sorting clerk)
  { coat: '#34506B', hem: '#243B52', skin: '#E8C8A8', hair: '#9A9590', accent: '#F2E9D6', style: 'collar', initAngle: 3.50, speedMul: 0.94, girth: 0.38, headR: 0.205 },
  // 5. Posta — dusty mauve coat, dark hair, rose scarf (pier-keeper, dreamy)
  { coat: '#7A5A6E', hem: '#5A3E50', skin: '#D2A77E', hair: '#3A2E2A', accent: '#C57195', style: 'scarf',  initAngle: 4.25, speedMul: 1.08, girth: 0.34, headR: 0.195 },
  // 6. Conductor Pell — bottle-green coat, grey hair, peaked cap (Tannoy Cross)
  { coat: '#3E5E3A', hem: '#2A4228', skin: '#E0B894', hair: '#7E7A74', accent: '#2B2540', style: 'cap',    initAngle: 5.00, speedMul: 0.90, girth: 0.42, headR: 0.210 },
  // 7. Ines — soft teal coat, dark-brown hair, amber scarf (lamplighter's kid)
  { coat: '#4E7A80', hem: '#345A60', skin: '#E8C8A8', hair: '#4A3B30', accent: '#E8920A', style: 'scarf',  initAngle: 5.70, speedMul: 1.18, girth: 0.32, headR: 0.185 },
]

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
    })
    for (const r of [coatRef, hemRef, neckRef, headRef, hairRef, scarfRef, apronRef, collarRef, capRef]) {
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

    for (let c = 0; c < N; c++) {
      const d = RESIDENTS[c]
      const angle = d.initAngle + t * BASE_SPEED * d.speedMul
      _parent.position.set(Math.cos(angle) * NPC_RADIUS, 0, Math.sin(angle) * NPC_RADIUS)
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

    for (const r of [coatRef, hemRef, neckRef, headRef, hairRef, eyesRef, scarfRef, apronRef, collarRef, capRef]) {
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
