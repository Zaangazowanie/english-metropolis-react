// Flora kit: layered multi-lobe broadleaf trees, conical pines, curved-frond
// palms with coconuts, jacarandas, gums, maples, tree ferns, hedges and grass
// tufts. Each species is ONE merged vertex-coloured geometry (trunk + canopy)
// so a district's trees are a single InstancedMesh with the existing wind
// sway. Species mix comes from the district's climate keywords, which is what
// makes a Caribbean lane and a Highland brae read as different countries.
import * as THREE from 'three';
import { GeoBatch, toonVertexMat, addWindSway } from '../materials.js';
import { cyl, sphere, cone, ribbon, lobeCanopy, box, mergeAll } from './shapes.js';

// deterministic tiny rng so cached species geometry is identical every build
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GREENS = [0x2f8a5e, 0x3f9c63, 0x2a7c58, 0x4aa16a, 0x357f52];
const TRUNK = 0x6e4a33;

// Canopy lobes: a main sphere and satellites, normals re-pointed from the
// centre so the toon ramp shades one soft mass.
function blobCanopy(rng, { cy, r, spread, lobes, squash = 1, colours = GREENS, batch }) {
  const centre = new THREE.Vector3(0, cy, 0);
  const specs = [{ x: 0, y: cy, z: 0, r }];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + rng() * 0.8;
    const d = spread * (0.6 + rng() * 0.5);
    specs.push({ x: Math.cos(a) * d, y: cy + (rng() - 0.5) * r * 0.9, z: Math.sin(a) * d, r: r * (0.55 + rng() * 0.3) });
  }
  // each lobe gets its own tint, still one geometry per lobe so tints stay crisp
  for (const s of specs) {
    const g = lobeCanopy([s], centre);
    if (squash !== 1) g.scale(1, squash, 1);
    batch.add(g, new THREE.Color(colours[(rng() * colours.length) | 0]));
  }
}

function trunk(batch, rng, { h, rBase, rTop, colour = TRUNK, lean = 0.06, segments = 3 }) {
  let x = 0, z = 0;
  const step = h / segments;
  const lx = (rng() - 0.5) * lean, lz = (rng() - 0.5) * lean;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments, t1 = (i + 1) / segments;
    const r0 = rBase + (rTop - rBase) * t0, r1 = rBase + (rTop - rBase) * t1;
    const g = new THREE.CylinderGeometry(r1, r0, step * 1.04, 7, 1).translate(x + lx * step / 2, step * (i + 0.5), z + lz * step / 2);
    batch.add(g, new THREE.Color(colour).offsetHSL(0, 0, (i % 2) * 0.02));
    x += lx * step; z += lz * step;
  }
  return { x, z };
}

function buildSpecies(kind, variant) {
  const rng = seeded(0x51ED + variant * 977 + kind.length * 31 + kind.charCodeAt(0) * 7);
  const batch = new GeoBatch();
  switch (kind) {
    case 'oak': case 'apple': case 'rowan': case 'seaalmond': {
      const h = kind === 'apple' ? 1.8 : 2.4;
      const top = trunk(batch, rng, { h, rBase: 0.22, rTop: 0.15 });
      const r = kind === 'apple' ? 1.3 : 1.7;
      blobCanopy(rng, { cy: h + r * 0.75, r, spread: r * 0.75, lobes: 5, batch, colours: kind === 'rowan' ? [0x3d8f5a, 0x4a9a60, 0x357f52] : GREENS });
      if (kind === 'rowan' || kind === 'apple') {
        const fruit = kind === 'rowan' ? 0xe0452e : 0xd93a3a;
        for (let i = 0; i < 10; i++) {
          const a = rng() * Math.PI * 2, d = r * (0.6 + rng() * 0.5);
          batch.add(sphere(0.09, top.x + Math.cos(a) * d, h + r * 0.75 + (rng() - 0.5) * r, top.z + Math.sin(a) * d, 5, 4), fruit);
        }
      }
      break;
    }
    case 'plane': {
      trunk(batch, rng, { h: 3.2, rBase: 0.24, rTop: 0.17, colour: 0x8f7d6b });
      // mottled bark patches
      for (let i = 0; i < 5; i++) batch.add(sphere(0.13, (rng() - 0.5) * 0.3, 0.5 + rng() * 2.3, (rng() - 0.5) * 0.3, 5, 4).scale(1, 1.6, 1), 0xd8cdb6);
      blobCanopy(rng, { cy: 4.6, r: 1.9, spread: 1.6, lobes: 5, squash: 0.82, batch, colours: [0x4d9a58, 0x5aa65e, 0x3f8b52] });
      break;
    }
    case 'liveoak': {
      trunk(batch, rng, { h: 2.2, rBase: 0.34, rTop: 0.24, colour: 0x5a4636 });
      blobCanopy(rng, { cy: 3.4, r: 1.8, spread: 2.4, lobes: 7, squash: 0.62, batch, colours: [0x3a7a48, 0x2f6d42, 0x45824c] });
      // Spanish moss: grey ribbons hanging from the canopy
      for (let i = 0; i < 7; i++) {
        const a = rng() * Math.PI * 2, d = 1.2 + rng() * 1.6;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const curve = new THREE.LineCurve3(new THREE.Vector3(x, 3.1, z), new THREE.Vector3(x + 0.1, 1.9 + rng() * 0.6, z));
        batch.add(ribbon(curve, 3, () => 0.06), 0x9aa79a);
      }
      break;
    }
    case 'jacaranda': {
      trunk(batch, rng, { h: 2.6, rBase: 0.2, rTop: 0.14, colour: 0x6b5a4c });
      blobCanopy(rng, { cy: 4.0, r: 1.7, spread: 1.5, lobes: 6, squash: 0.85, batch, colours: [0x9b7fd0, 0xa88ad8, 0x8a70c4, 0x6f9a6a] });
      break;
    }
    case 'maple': {
      trunk(batch, rng, { h: 2.3, rBase: 0.2, rTop: 0.13 });
      blobCanopy(rng, { cy: 3.8, r: 1.6, spread: 1.2, lobes: 5, batch, colours: [0xd8663a, 0xc94a3a, 0xe8a13d, 0xb84a2e] });
      break;
    }
    case 'gum': {
      trunk(batch, rng, { h: 4.4, rBase: 0.18, rTop: 0.1, colour: 0xd8cbb8, lean: 0.25, segments: 4 });
      for (let i = 0; i < 4; i++) {
        const a = rng() * Math.PI * 2, d = 0.6 + rng() * 1.0;
        batch.add(lobeCanopy([{ x: Math.cos(a) * d, y: 4.2 + rng() * 1.6, z: Math.sin(a) * d, r: 0.7 + rng() * 0.4 }], new THREE.Vector3(0, 4.8, 0)),
          new THREE.Color([0x8aa38a, 0x7d9a7f, 0x97ad8e][i % 3]));
      }
      break;
    }
    case 'pine': {
      trunk(batch, rng, { h: 3.4, rBase: 0.2, rTop: 0.1, colour: 0x5a3f2e, lean: 0.03 });
      const cols = [0x1f5d43, 0x27674b, 0x1a5340];
      for (let i = 0; i < 4; i++) {
        const y = 1.9 + i * 1.25, r = 1.55 - i * 0.32;
        batch.add(cone(r, 1.7, 8, 0, y + 0.85, 0), cols[i % 3]);
      }
      break;
    }
    case 'cypress': {
      trunk(batch, rng, { h: 1.2, rBase: 0.16, rTop: 0.12, colour: 0x5a3f2e });
      batch.add(cone(0.7, 3.2, 7, 0, 2.6, 0), 0x22603f);
      batch.add(cone(0.5, 2.6, 7, 0, 4.3, 0), 0x2a6b45);
      break;
    }
    case 'palm': {
      // curved trunk in 5 stacked segments
      let x = 0, z = 0;
      const lx = (rng() - 0.5) * 0.28, lz = (rng() - 0.5) * 0.28;
      const H = 4.6, n = 5;
      for (let i = 0; i < n; i++) {
        const r0 = 0.2 - i * 0.015, r1 = 0.185 - i * 0.015;
        const g = new THREE.CylinderGeometry(r1, r0, H / n * 1.05, 7, 1).translate(x + lx * (i + 0.5), H / n * (i + 0.5), z + lz * (i + 0.5));
        batch.add(g, new THREE.Color(0x8b6a4e).offsetHSL(0, 0, (i % 2) * 0.025));
        // trunk ring scars (a thin cylinder band, not a torus)
        if (i > 0) batch.add(new THREE.CylinderGeometry(r0 + 0.012, r0 + 0.012, 0.05, 7, 1, true).translate(x + lx * i, H / n * i, z + lz * i), 0x6d5138);
      }
      const tx = lx * n, tz = lz * n;
      batch.add(sphere(0.3, tx, H + 0.05, tz, 7, 5), 0x4d7a3c);
      const fronds = 8 + (variant % 2);
      for (let i = 0; i < fronds; i++) {
        const a = (i / fronds) * Math.PI * 2 + rng() * 0.4;
        const len = 2.1 + rng() * 0.5;
        const dx = Math.cos(a), dz = Math.sin(a);
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(tx, H + 0.1, tz),
          new THREE.Vector3(tx + dx * len * 0.55, H + 0.75, tz + dz * len * 0.55),
          new THREE.Vector3(tx + dx * len, H - 0.55 - rng() * 0.5, tz + dz * len),
        );
        const serr = (t) => (0.34 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.04) * (1 - 0.18 * ((Math.floor(t * 9) % 2)));
        batch.add(ribbon(curve, 7, serr), new THREE.Color([0x3e9a5a, 0x46a862, 0x358a4f][i % 3]));
      }
      for (let i = 0; i < 3; i++) {
        const a = rng() * Math.PI * 2;
        batch.add(sphere(0.14, tx + Math.cos(a) * 0.26, H - 0.12, tz + Math.sin(a) * 0.26, 6, 4), 0x6b4a2a);
      }
      break;
    }
    case 'fern': {
      batch.add(cyl(0.16, 0.2, 1.4, 7, 0, 0.7, 0), 0x5a4636);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rng() * 0.3;
        const dx = Math.cos(a), dz = Math.sin(a);
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(dx * 0.9, 2.0, dz * 0.9), new THREE.Vector3(dx * 1.7, 1.25, dz * 1.7),
        );
        batch.add(ribbon(curve, 7, (t) => 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.02), new THREE.Color([0x3a8a4a, 0x46995a][i % 2]));
      }
      break;
    }
    default:
      return buildSpecies('oak', variant);
  }
  const mesh = batch.build(toonVertexMat());
  const geo = mesh.geometry;
  geo.computeBoundingSphere();
  geo.userData.shared = true;      // cached across districts — never disposed by disposeChunk
  return geo;
}

const CACHE = new Map();
export function speciesGeometry(kind, variant = 0) {
  const key = `${kind}:${variant % 3}`;
  if (!CACHE.has(key)) CACHE.set(key, buildSpecies(kind, variant % 3));
  return CACHE.get(key);
}

export const DOUBLE_SIDED = new Set(['palm', 'fern', 'liveoak']);

let _mats = null;
export function speciesMaterial(kind) {
  if (!_mats) {
    _mats = {
      single: addWindSway(toonVertexMat(), 0.07),
      double: addWindSway(toonVertexMat({ side: THREE.DoubleSide }), 0.09),
    };
    _mats.single.name = 'flora-single';
    _mats.double.name = 'flora-double';
    _mats.single.userData.shared = true;    // shared across districts: never faded or disposed per chunk
    _mats.double.userData.shared = true;
  }
  return DOUBLE_SIDED.has(kind) ? _mats.double : _mats.single;
}

// Species weights per district. Keywords in the authored text win; otherwise
// the country prefix picks a sensible default.
const KEYWORDS = [
  [/palm|coconut|boardwalk|beach|surf|sea[- ]almond|harbour|wharf|island|carnival/i, 'palm'],
  [/pine|spruce|cedar|fir|conifer|forest|ridge|misty|snowy peak|frozen/i, 'pine'],
  [/jacaranda/i, 'jacaranda'], [/gum tree|eucalypt|outback|red[- ]dirt|ochre/i, 'gum'],
  [/maple/i, 'maple'], [/live oak|spanish moss|veranda/i, 'liveoak'],
  [/fern|bach|villa/i, 'fern'], [/plane[- ]tree/i, 'plane'], [/orchard|apple|cider/i, 'apple'],
  [/rowan|heather|moor|brae|croft/i, 'rowan'], [/cypress|stucco|limestone|mesa/i, 'cypress'],
];
const BY_COUNTRY = {
  uk: ['oak', 'plane'], sco: ['pine', 'rowan'], ie: ['oak', 'rowan'], us: ['oak', 'plane'],
  ca: ['maple', 'pine'], au: ['gum', 'palm'], nz: ['fern', 'oak'], za: ['jacaranda', 'palm'], car: ['palm', 'seaalmond'],
};
export function speciesFor(zoneData) {
  const text = `${zoneData.architecture || ''} ${zoneData.landmark || ''}`;
  const picked = [];
  for (const [re, kind] of KEYWORDS) if (re.test(text) && !picked.includes(kind)) picked.push(kind);
  const country = String(zoneData.code || '').split('_')[0];
  for (const kind of BY_COUNTRY[country] || ['oak']) if (!picked.includes(kind)) picked.push(kind);
  return picked.slice(0, 3);
}

// One InstancedMesh per species. placements: [{x, y, z, s, rot, variant}].
export function treeInstances(kind, placements, { castShadow = true } = {}) {
  if (!placements.length) return null;
  const geo = speciesGeometry(kind, placements[0].variant || 0);
  const mesh = new THREE.InstancedMesh(geo, speciesMaterial(kind), placements.length);
  mesh.name = `flora-${kind}`;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  placements.forEach((p, i) => {
    P.set(p.x, p.y || 0, p.z);
    Q.setFromAxisAngle(Y, p.rot || 0);
    S.set(p.s || 1, (p.s || 1) * (p.sy || 1), p.s || 1);
    M.compose(P, Q, S);
    mesh.setMatrixAt(i, M);
    c.setRGB(1, 1, 1).offsetHSL(0, 0, ((i % 5) - 2) * 0.03);
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.userData.floraKind = kind;
  return mesh;
}

// Hedge block: box with a rounded top, for streets and gardens (shared geometry).
let _hedge = null;
export function hedgeGeometry() {
  if (_hedge) return _hedge;
  const parts = [
    box(1, 0.7, 0.5, 0, 0.35, 0),
    new THREE.CylinderGeometry(0.25, 0.25, 1, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0.7, 0),
  ];
  _hedge = mergeAll(parts);
  _hedge.computeBoundingSphere();
  _hedge.userData.shared = true;
  return _hedge;
}

// Grass tufts: two crossed quads with a darker root, instanced by the thousand
// on parkland. Colour variance via instanceColor; wind from addWindSway.
let _tuft = null;
export function tuftGeometry() {
  if (_tuft) return _tuft;
  const quad = (ry) => {
    const g = new THREE.PlaneGeometry(0.55, 0.45, 1, 1);
    g.rotateY(ry).translate(0, 0.225, 0);
    return g;
  };
  const merged = mergeAll([quad(0), quad(Math.PI / 2)]);
  const pos = merged.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 0.45;
    col[i * 3] = 0.62 + 0.38 * t; col[i * 3 + 1] = 0.7 + 0.3 * t; col[i * 3 + 2] = 0.55 + 0.35 * t;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.computeBoundingSphere();
  _tuft = merged;
  _tuft.userData.shared = true;
  return _tuft;
}

let _tuftMat = null;
export function tuftInstances(placements, base = 0x3f9c63) {
  if (!placements.length) return null;
  if (!_tuftMat) {
    _tuftMat = addWindSway(toonVertexMat({ side: THREE.DoubleSide }), 0.05);
    _tuftMat.name = 'flora-tufts';
    _tuftMat.userData.shared = true;
  }
  const mesh = new THREE.InstancedMesh(tuftGeometry(), _tuftMat, placements.length);
  mesh.name = 'flora-grass-tufts';
  const M = new THREE.Matrix4(), c = new THREE.Color();
  placements.forEach((p, i) => {
    M.makeRotationY(p.rot || 0).scale(new THREE.Vector3(p.s || 1, p.s || 1, p.s || 1)).setPosition(p.x, p.y || 0, p.z);
    mesh.setMatrixAt(i, M);
    c.set(p.color || base).offsetHSL(((i * 7) % 11 - 5) * 0.006, 0, ((i * 13) % 7 - 3) * 0.03);
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
