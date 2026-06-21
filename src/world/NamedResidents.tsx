// NamedResidents — the four canon English Metro keepers pinned at their
// district landmarks: Flora at her flower stall, Mr. Chen at the café doorway,
// Mr. Frank at the Sorting Office, and Posta at the pier. Each stands still,
// slightly turned to their place of work.
//
// As of the wardrobe-kit migration (2026-06-21) these are rendered through the
// ORIGINAL modular character system (src/world/ModularResident.tsx +
// wardrobe.ts) — our own procedural replacement for abeto's base+hair+top+
// bottom+shoes avatar. Each keeper is looked up from the ROSTER by name, so
// their full outfit (hair / top / bottom / shoes / build) is data-driven and
// shared with the rest of the cast.
//
// CONTRACT: zero new deps, no textures/GLBs/URLs. Procedural geometry only.
// Each keeper has the kit's idle breathing/sway animation (frozen under
// reducedMotion, threaded from the world). 4 figures × ~13 part meshes ≈ 52
// draw calls (well within the <150 budget).

import type { JSX } from 'react'
import { ModularResident } from './ModularResident'
import { ROSTER, type ResidentSpec } from './wardrobe'

const byName = (n: string): ResidentSpec => {
  const found = ROSTER.find((r) => r.name === n)
  if (!found) throw new Error(`NamedResidents: no roster entry "${n}"`)
  return found
}

// Landmark placements (mirror the props in EnglishMetroWorld.tsx). Rotations
// keep each keeper turned toward the plaza / their counter.
const PLACEMENTS: Array<{ name: string; position: [number, number, number]; rotation: [number, number, number] }> = [
  { name: 'Flora',     position: [-5.9, 0, 3.8],  rotation: [0, 2.18 + Math.PI, 0] },
  { name: 'Mr. Chen',  position: [2.85, 0, -6.7], rotation: [0, -0.405 + Math.PI, 0] },
  { name: 'Mr. Frank', position: [-5.6, 0, -3.8], rotation: [0, 0.93 + Math.PI, 0] },
  { name: 'Posta',     position: [2.3, 0, 6.6],   rotation: [0, -2.80 + Math.PI, 0] },
]

/** Renders all four named keepers at their district landmarks, via the kit. */
export function NamedResidents({ reducedMotion = false }: { reducedMotion?: boolean }): JSX.Element {
  return (
    <>
      {PLACEMENTS.map((p) => (
        <ModularResident key={p.name} spec={byName(p.name)} position={p.position} rotation={p.rotation} reducedMotion={reducedMotion} />
      ))}
    </>
  )
}
