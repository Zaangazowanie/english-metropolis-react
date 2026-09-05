// Geometry helpers shared by the city kit. Everything here returns a plain
// BufferGeometry already positioned in the caller's local space, ready to be
// handed to a GeoBatch (which consumes it) — nothing in the kit creates a Mesh
// of its own, so a district's worth of detail still costs a handful of calls.
import * as THREE from 'three';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function box(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (ry) geo.rotateY(ry);
  return geo.translate(x, y, z);
}

export function cyl(rTop, rBot, h, seg, x = 0, y = 0, z = 0) {
  return new THREE.CylinderGeometry(rTop, rBot, h, seg, 1).translate(x, y, z);
}

export function sphere(r, x = 0, y = 0, z = 0, wSeg = 8, hSeg = 6) {
  return new THREE.SphereGeometry(r, wSeg, hSeg).translate(x, y, z);
}

export function cone(r, h, seg, x = 0, y = 0, z = 0) {
  return new THREE.ConeGeometry(r, h, seg).translate(x, y, z);
}

// Outward-facing quad. F = { nx, nz, tx, tz, ry } describes the face plane:
// (nx, nz) is the outward normal, (tx, tz) runs along the face.
export function faceQuad(w, h, cx, cy, cz, F) {
  const geo = new THREE.PlaneGeometry(w, h);
  geo.rotateY(F.ry);
  return geo.translate(cx, cy, cz);
}

// A prism: 2D profile (array of [u, v] in the XY plane, counter-clockwise)
// extruded `length` along Z and centred on the origin before translation.
// Used for kerbs, pitched roofs, mansards, sawtooth roofs, awnings.
export function prism(profile, length, x = 0, y = 0, z = 0, ry = 0) {
  const shape = new THREE.Shape(profile.map(([u, v]) => new THREE.Vector2(u, v)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -length / 2);
  if (ry) geo.rotateY(ry);
  return geo.translate(x, y, z);
}

// Wall slab with real openings: an outer rectangle (span x height) minus the
// given holes, extruded `thick` deep. Holes are { u, v, w, h, arch } where
// (u, v) is the opening centre in face coordinates (u along the face, v up
// from the slab's base) and arch adds a semicircular head. The slab's outer
// face lies on local z = 0 and the body extends toward -z; callers rotate it
// onto the building face with orientFace().
export function wallWithOpenings(span, height, thick, holes) {
  const shape = new THREE.Shape();
  shape.moveTo(-span / 2, 0);
  shape.lineTo(span / 2, 0);
  shape.lineTo(span / 2, height);
  shape.lineTo(-span / 2, height);
  shape.closePath();
  for (const hole of holes) {
    const path = new THREE.Path();
    const x0 = hole.u - hole.w / 2, x1 = hole.u + hole.w / 2;
    const y0 = hole.v - hole.h / 2, y1 = hole.v + hole.h / 2;
    if (hole.arch) {
      const r = hole.w / 2;
      path.moveTo(x0, y0);
      path.lineTo(x1, y0);
      path.lineTo(x1, y1 - r);
      path.absarc(hole.u, y1 - r, r, 0, Math.PI, false);
      path.lineTo(x0, y0);
    } else {
      path.moveTo(x0, y0);
      path.lineTo(x1, y0);
      path.lineTo(x1, y1);
      path.lineTo(x0, y1);
      path.lineTo(x0, y0);
    }
    shape.holes.push(path);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 6 });
  // ExtrudeGeometry extrudes toward +z; flip so the outer face is at z = 0 and
  // the wall body sits behind it (toward the building interior).
  geo.translate(0, 0, -thick);
  return geo;
}

// Rotate a geometry authored on the z = 0 face plane (outward normal +z) onto
// face F and place it so the plane passes through (cx, cz) at height cy.
export function orientFace(geo, cx, cy, cz, F) {
  geo.rotateY(F.ry);
  return geo.translate(cx, cy, cz);
}

// A flat ribbon following a curve — palm fronds, bunting sag, awning valance.
// widthAt(t) gives the half-width at parameter t; the ribbon is a strip of
// quads so it needs a DoubleSide material to read from below.
export function ribbon(curve, segments, widthAt, up = Y_AXIS) {
  const pts = curve.getPoints(segments);
  const pos = [], nrm = [], idx = [];
  const tangent = new THREE.Vector3(), side = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getTangent(t, tangent).normalize();
    side.crossVectors(tangent, up).normalize();
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    n.crossVectors(side, tangent).normalize();
    const hw = widthAt(t);
    const p = pts[i];
    pos.push(p.x - side.x * hw, p.y - side.y * hw, p.z - side.z * hw);
    pos.push(p.x + side.x * hw, p.y + side.y * hw, p.z + side.z * hw);
    nrm.push(n.x, n.y, n.z, n.x, n.y, n.z);
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

// Remap a geometry's UVs into an atlas cell [u0,v0]-[u1,v1].
export function uvCell(geo, u0, v0, u1, v1) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  return geo;
}

// Multi-lobe canopy: a few spheres merged with every normal re-pointed away
// from the canopy centre, so the stepped toon ramp reads one soft rounded
// mass instead of a cluster of faceted balls.
export function lobeCanopy(lobes, centre) {
  const geos = [];
  for (const l of lobes) {
    const g = new THREE.SphereGeometry(l.r, 8, 5).translate(l.x, l.y, l.z);
    geos.push(g);
  }
  const merged = mergeAll(geos);
  const pos = merged.attributes.position, nrm = merged.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i) - centre.x, pos.getY(i) - centre.y, pos.getZ(i) - centre.z);
    // blend toward the centre-based normal (0.75) so lobes still read a little
    v.normalize().multiplyScalar(0.75).add(v.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).multiplyScalar(0.25)).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  return merged;
}

// Per-vertex colour noise for plaster / stone variation. `geo` must already
// carry a color attribute (GeoBatch.add gives it one). Deterministic in the
// vertex position so streaming rebuilds identical walls.
export function jitterColor(geo, amount = 0.06, scale = 0.9) {
  const col = geo.attributes.color, pos = geo.attributes.position;
  if (!col) return geo;
  for (let i = 0; i < col.count; i++) {
    const h = fract(Math.sin(pos.getX(i) * 12.9898 * scale + pos.getY(i) * 78.233 * scale + pos.getZ(i) * 37.719 * scale) * 43758.5453);
    const k = 1 + (h - 0.5) * amount * 2;
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  return geo;
}

// Multiply the colour of vertices above / below a height for floor banding.
export function bandColor(geo, y0, y1, k) {
  const col = geo.attributes.color, pos = geo.attributes.position;
  for (let i = 0; i < col.count; i++) {
    const y = pos.getY(i);
    if (y >= y0 && y < y1) col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  return geo;
}

export function fract(x) { return x - Math.floor(x); }

// Merge a list of geometries (indexed or not), disposing the inputs.
export function mergeAll(geos) {
  const prepared = geos.map((g) => {
    for (const key of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    return g.index ? g : g.toNonIndexed();
  });
  // mergeGeometries wants all-indexed or all-non-indexed; force non-indexed here
  const nonIndexed = prepared.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = nonIndexed.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let off = 0;
  for (const g of nonIndexed) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, off * 3);
    nrm.set(g.attributes.normal.array, off * 3);
    uv.set(g.attributes.uv.array, off * 2);
    off += n;
    g.dispose();
  }
  for (const g of geos) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

// Face table shared by facades and street furniture: outward normal, tangent
// along the face and the yaw that turns a +z-facing quad onto it.
export const FACES = [
  { nx: 0, nz: 1, tx: 1, tz: 0, ry: 0 },
  { nx: 0, nz: -1, tx: -1, tz: 0, ry: Math.PI },
  { nx: 1, nz: 0, tx: 0, tz: -1, ry: Math.PI / 2 },
  { nx: -1, nz: 0, tx: 0, tz: 1, ry: -Math.PI / 2 },
];
