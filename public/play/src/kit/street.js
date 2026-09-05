// Street kit: the buckets every district and the hub batch their statics into,
// plus kerbs, pavers, crossings and the furniture that makes a pavement read
// as a place — bollards, benches, lamps with light cones, bins, hydrants, tree
// pits, planters, café terraces, bus shelters, bike racks, national post and
// phone boxes, street-name plates, bunting, string lights, manholes.
//
// Nothing here is a Mesh. Every function pushes positioned geometry into a
// bucket; `buildBuckets` turns the whole district into ≤ 8 draw calls.
import * as THREE from 'three';
import * as M from '../materials.js';
import { GeoBatch, toonMat, toonVertexMat, PALETTE } from '../materials.js';
import { box, cyl, sphere, cone, prism, ribbon, faceQuad, uvCell, jitterColor, FACES } from './shapes.js';

// ------------------------------------------------------------- emissive hook
// The render lane owns the emissive-gain API. Until it lands, this shim routes
// every lit surface through the neon registry so setNeonGain still scales it,
// with a per-material authored gain on top (screens ~1.6, windows ~1.3, neon
// ~2.2 per the graphics review's hierarchy).
function maxChan(c) { return Math.max(c.r, c.g, c.b, 1e-6); }
export const emissiveMat = M.emissiveMat || function emissiveMatShim(color, gain = 1, opts = {}) {
  const mat = M.neonMat(color, opts.opacity ?? 1);
  const base = mat.userData.neonBase;
  const current = maxChan(mat.color) / maxChan(base);
  base.multiplyScalar(gain);
  mat.color.copy(base).multiplyScalar(current);
  if (opts.vertexColors) mat.vertexColors = true;
  if (opts.map) mat.map = opts.map;
  if (opts.side !== undefined) mat.side = opts.side;
  if (opts.blending !== undefined) { mat.blending = opts.blending; mat.transparent = true; mat.depthWrite = false; }
  mat.userData.emissiveGain = gain;
  mat.needsUpdate = true;
  return mat;
};

// Toon stand-ins for what used to be metalness 0.8-0.9 with no environment
// map (rendered as charcoal). A light, slightly cool toon colour reads as
// brushed metal under the stepped ramp and costs nothing.
export const CHROME = 0xcfd9e6;
export const IRON = 0x1f2536;
export const BRASS = 0xd9b56a;
export const WOOD = 0x8a5a3a;
export const STONE = 0x9aa3b1;
export function chromeToon(opts = {}) { return toonMat(CHROME, opts); }
export function glassToon(color = 0x9fd8e8, opacity = 0.55, opts = {}) {
  return new THREE.MeshToonMaterial({
    color, gradientMap: M.toonRamp(), transparent: true, opacity, depthWrite: false,
    emissive: 0x0e2a3e, emissiveIntensity: 0.6, ...opts,
  });
}

export function countryOf(code = '') { return String(code).split('_')[0]; }

// ------------------------------------------------------------------ buckets
export function makeBuckets(tones = {}) {
  return {
    shell: new GeoBatch(),      // opaque toon, vertex coloured (walls, trims, kerbs, furniture)
    paneDark: new GeoBatch(),   // recessed unlit window glass
    paneLit: new GeoBatch(),    // lit window glass (render lane's dusk hook finds the material name)
    neon: new GeoBatch(),       // emissive vertex-coloured (lamp heads, neon, headlights)
    glass: new GeoBatch(),      // transparent glass (shelters, awnings, shop glass)
    cone: new GeoBatch(),       // additive light cones
    sign: new GeoBatch(),       // atlas-textured lettering
    fine: new GeoBatch(),       // small dressing (frames, mullions, balusters, quoins): hidden past ~60 m
    tones,
    detail: true,
  };
}
// fine detail goes to its own bucket when one exists, so distant districts
// can drop it without losing their silhouettes
export const fine = (B) => B.fine || B.shell;

// Build the buckets into meshes. Returns the meshes (in render order) plus the
// materials so the caller can fade the chunk in and dispose it later.
export function buildBuckets(B, { atlas = null, wet = false, name = 'kit', litEmissive = null, ao = null } = {}) {
  const meshes = [];
  const shellMat = toonVertexMat();
  shellMat.name = 'kit-shell';
  const shell = B.shell.build(shellMat, { name: `${name}-shell` });
  if (shell) { if (ao) ao(shell.geometry); meshes.push(shell); }

  const darkMat = toonVertexMat({ emissive: 0x06101c, emissiveIntensity: 0.35 });
  darkMat.name = 'paneDark';
  const dark = B.paneDark.build(darkMat, { name: `${name}-panes-dark`, castShadow: false });
  if (dark) meshes.push(dark);

  // Lit panes: a dark warm glass with a warm emissive so a lit room reads as
  // amber behind the frame, not as a blank white card (the render lane's dusk
  // hook scales this by material name).
  const litMat = toonMat(0x1a140c);
  litMat.name = 'paneLit';
  litMat.emissive = litEmissive ? litEmissive.clone() : new THREE.Color(0xffa050);
  litMat.emissiveIntensity = 0.5;
  const lit = B.paneLit.build(litMat, { name: `${name}-panes-lit`, castShadow: false });
  if (lit) meshes.push(lit);

  const neonM = emissiveMat(0xffffff, 1.6, { vertexColors: true });
  neonM.name = 'kit-neon';
  const neon = B.neon.build(neonM, { name: `${name}-neon`, castShadow: false, receiveShadow: false });
  if (neon) meshes.push(neon);

  if (atlas) {
    const signM = emissiveMat(0xffffff, 1.35, { map: atlas });
    signM.name = 'kit-sign';
    const sign = B.sign.build(signM, { name: `${name}-signage`, castShadow: false, receiveShadow: false });
    if (sign) meshes.push(sign);
  }

  const glassM = glassToon(0xffffff, 0.5, { vertexColors: true });
  glassM.name = 'kit-glass';
  const glass = B.glass.build(glassM, { name: `${name}-glass`, castShadow: false, receiveShadow: false });
  if (glass) { glass.renderOrder = 3; meshes.push(glass); }

  const coneM = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.055, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: true, side: THREE.DoubleSide,
  });
  coneM.name = 'kit-lightcone';
  const cones = B.cone.build(coneM, { name: `${name}-lightcones`, castShadow: false, receiveShadow: false });
  if (cones) { cones.renderOrder = 4; meshes.push(cones); }
  const fineMat = toonVertexMat();
  fineMat.name = 'kit-fine';
  const fineMesh = B.fine.build(fineMat, { name: `${name}-fine`, castShadow: false });
  if (fineMesh) { fineMesh.userData.fineDetail = true; meshes.push(fineMesh); }
  return meshes;
}

// -------------------------------------------------------------------- ground
// A field of paving slabs: a darker grout plane with per-slab tinted quads
// 10 mm above it. Slab tint is hashed from position so streaming rebuilds the
// same pavement, and `wear` darkens slabs toward the given kerb lines.
export function paverField(B, x0, z0, x1, z1, y, { slab = 1.2, color, grout, wear = [], jitter = 0.05 } = {}) {
  const w = x1 - x0, d = z1 - z0;
  const base = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  base.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  B.shell.add(base, grout || new THREE.Color(color).multiplyScalar(0.62));
  const nx = Math.max(1, Math.round(w / slab)), nz = Math.max(1, Math.round(d / slab));
  const sw = w / nx, sd = d / nz;
  const c = new THREE.Color();
  const geos = [];
  const cols = [];
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const px = x0 + (i + 0.5) * sw, pz = z0 + (k + 0.5) * sd;
    const h = fract2(px * 12.9898 + pz * 78.233);
    c.set(color).multiplyScalar(1 + (h - 0.5) * jitter * 2);
    let wearK = 1;
    for (const wl of wear) {
      const dist = Math.abs((wl.axis === 'x' ? px : pz) - wl.at);
      if (dist < wl.range) wearK *= 1 - wl.strength * (1 - dist / wl.range);
    }
    c.multiplyScalar(wearK);
    const q = new THREE.PlaneGeometry(sw - 0.05, sd - 0.05).rotateX(-Math.PI / 2);
    q.translate(px, y + 0.01, pz);
    geos.push(q); cols.push(c.clone());
  }
  for (let i = 0; i < geos.length; i++) B.shell.add(geos[i], cols[i]);
}
function fract2(x) { const s = Math.sin(x) * 43758.5453; return s - Math.floor(s); }

// Chamfered kerb stone run between two points (12 cm tall, 28 cm wide). The
// profile is a box with the top outer edge cut, extruded along the run.
const KERB_PROFILE = [[-0.14, 0], [0.14, 0], [0.14, 0.09], [0.11, 0.12], [-0.11, 0.12], [-0.14, 0.09]];
export function kerbRun(B, x0, z0, x1, z1, { color = PALETTE.curb, height = 1, y = 0.02, dropped = [] } = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.2) return;
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  const segs = [];
  // split the run around dropped kerbs (crossings): those get a 3 cm stone
  let t = 0;
  const drops = dropped.map((d) => ({ a: Math.max(0, d.at - d.half), b: Math.min(len, d.at + d.half) })).sort((p, q) => p.a - q.a);
  for (const d of drops) {
    if (d.a > t) segs.push({ a: t, b: d.a, h: height });
    segs.push({ a: d.a, b: d.b, h: 0.25 });
    t = d.b;
  }
  if (t < len) segs.push({ a: t, b: len, h: height });
  const dirX = Math.sin(yaw), dirZ = Math.cos(yaw);
  for (const s of segs) {
    const l = s.b - s.a;
    if (l < 0.05) continue;
    const profile = KERB_PROFILE.map(([u, v]) => [u, v * s.h]);
    const mid = s.a + l / 2;
    const geo = prism(profile, l, x0 + dirX * mid, y, z0 + dirZ * mid, yaw);
    B.shell.add(geo, color);
  }
}

// Tactile crossing patch: a buff/red panel with blister dots at a dropped kerb.
export function tactilePatch(B, x, z, yaw, { w = 1.2, d = 0.9, y = 0.04, color = 0xc9a45a } = {}) {
  const pad = new THREE.BoxGeometry(w, 0.02, d);
  pad.rotateY(yaw); pad.translate(x, y, z);
  B.shell.add(pad, color);
  if (!B.detail) return;
  const c = new THREE.Color(color).multiplyScalar(0.8);
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
    const g = cyl(0.045, 0.045, 0.02, 6, i * w * 0.3, 0.02, k * d * 0.3);
    g.rotateY(yaw); g.translate(x, y, z);
    fine(B).add(g, c);
  }
}

// Zebra crossing bars (merged into the same ground batch).
export function zebra(B, x, z, yaw, { width = 8, bar = 1.05, len = 2.2, y = 0.03, color = 0xe8dcbb } = {}) {
  const n = Math.floor(width / (bar * 1.25));
  for (let s = 0; s < n; s++) {
    const u = -((n - 1) * bar * 1.25) / 2 + s * bar * 1.25;
    const g = new THREE.BoxGeometry(bar, 0.012, len);
    g.translate(u, 0, 0); g.rotateY(yaw); g.translate(x, y, z);
    B.shell.add(g, color);
  }
}

export function manhole(B, x, z, { y = 0.035, color = 0x27303f } = {}) {
  B.shell.add(cyl(0.36, 0.36, 0.012, 12, x, y, z), color);
  if (B.detail) B.shell.add(cyl(0.3, 0.3, 0.006, 12, x, y + 0.012, z), new THREE.Color(color).multiplyScalar(1.3));
}

// ---------------------------------------------------------------- furniture
export function bollard(B, x, z, { color = IRON, cap = null, h = 0.85 } = {}) {
  B.shell.add(cyl(0.085, 0.11, h, 8, x, h / 2, z), color);
  B.shell.add(cyl(0.11, 0.11, 0.05, 8, x, h + 0.02, z), color);
  if (cap) B.neon.add(cyl(0.06, 0.06, 0.04, 8, x, h + 0.06, z), cap);
}

// Slatted bench with cast-iron ends. yaw: direction the seat faces.
export function bench(B, x, z, yaw, { wood = WOOD, iron = IRON, len = 1.8 } = {}) {
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push([box(len, 0.04, 0.09, 0, 0.46, -0.16 + i * 0.11), wood]);
  for (let i = 0; i < 3; i++) parts.push([box(len, 0.09, 0.035, 0, 0.7 + i * 0.12, -0.24 - i * 0.03), wood]);
  for (const s of [-1, 1]) {
    parts.push([box(0.06, 0.44, 0.42, s * (len / 2 - 0.08), 0.22, 0), iron]);
    parts.push([box(0.06, 0.5, 0.08, s * (len / 2 - 0.08), 0.72, -0.28), iron]);
    parts.push([box(0.06, 0.05, 0.5, s * (len / 2 - 0.08), 0.46, -0.02), iron]);
  }
  place(B, parts, x, z, yaw);
}

// Lamp post: fluted column, ladder bar, lantern head (neon) + a soft cone.
export function lamp(B, x, z, { style = 'classic', color = IRON, light = 0xffd9a0, h = 4.2, cone: withCone = true } = {}) {
  B.shell.add(cyl(0.16, 0.2, 0.45, 8, x, 0.22, z), color);
  B.shell.add(cyl(0.05, 0.08, h - 0.45, 7, x, 0.45 + (h - 0.45) / 2, z), color);
  if (style === 'classic') {
    B.shell.add(box(0.06, 0.06, 0.34, x, h - 0.3, z), color);                 // ladder bar
    B.shell.add(box(0.4, 0.04, 0.4, x, h + 0.02, z), color);                  // lantern base
    B.neon.add(box(0.3, 0.42, 0.3, x, h + 0.25, z), light);
    B.shell.add(cone(0.3, 0.22, 4, x, h + 0.56, z), color);
    for (const s of [-1, 1]) {
      fine(B).add(box(0.03, 0.44, 0.03, x + s * 0.16, h + 0.25, z + 0.16), color);
      fine(B).add(box(0.03, 0.44, 0.03, x + s * 0.16, h + 0.25, z - 0.16), color);
    }
  } else if (style === 'modern') {
    B.shell.add(box(0.06, 0.06, 1.1, x, h + 0.05, z + 0.45), color);          // arm
    B.neon.add(box(0.5, 0.08, 0.28, x, h + 0.02, z + 0.95), light);
  } else {                                                                   // globe
    B.neon.add(sphere(0.22, x, h + 0.2, z), light);
    B.shell.add(cyl(0.12, 0.12, 0.05, 8, x, h, z), color);
  }
  if (withCone && B.detail) {
    const lz = style === 'modern' ? z + 0.95 : z;
    const c = new THREE.ConeGeometry(1.35, h - 0.6, 10, 1, true);
    c.translate(x, (h - 0.6) / 2 + 0.3, lz);
    B.cone.add(c, new THREE.Color(light).multiplyScalar(0.7));
  }
}

export function bin(B, x, z, { color = 0x2c3648, lid = null } = {}) {
  B.shell.add(cyl(0.26, 0.24, 0.85, 10, x, 0.43, z), color);
  B.shell.add(cyl(0.29, 0.29, 0.08, 10, x, 0.9, z), lid || new THREE.Color(color).multiplyScalar(0.7));
  B.shell.add(box(0.36, 0.14, 0.05, x, 0.72, z + 0.25), new THREE.Color(color).multiplyScalar(0.55));
}

export function hydrant(B, x, z, { color = 0xd94a3a } = {}) {
  B.shell.add(cyl(0.12, 0.14, 0.62, 8, x, 0.31, z), color);
  B.shell.add(sphere(0.13, x, 0.68, z), color);
  const arm = box(0.4, 0.09, 0.09, x, 0.42, z);
  B.shell.add(arm, new THREE.Color(color).multiplyScalar(0.8));
  B.shell.add(cyl(0.07, 0.07, 0.06, 8, x, 0.85, z), CHROME);
}

// Tree pit: cast-iron grate ring flush with the pavement, kerb edging.
export function treePit(B, x, z, { r = 0.8, y = 0.035, color = 0x2a3346 } = {}) {
  B.shell.add(cyl(r, r, 0.015, 14, x, y, z), color);
  B.shell.add(cyl(r * 0.45, r * 0.45, 0.02, 10, x, y + 0.01, z), 0x3b2c22);          // soil
  if (B.detail) {
    for (let i = 0; i < 4; i++) {
      const g = box(r * 1.7, 0.012, 0.03, x, y + 0.012, z);
      g.translate(-x, 0, -z); g.rotateY(i * Math.PI / 4); g.translate(x, 0, z);
      fine(B).add(g, new THREE.Color(color).multiplyScalar(1.4));
    }
  }
}

// Planter box with soil, a hedge of foliage and dotted flowers.
export function planter(B, x, z, yaw, { w = 1.6, d = 0.6, h = 0.55, color = 0x4a5569, hedge = 0x2f856e, flowers = [0xff6f91, 0xffb84d, 0xe961c2, 0xf4e5a3] } = {}) {
  const parts = [
    [box(w, h, d, 0, h / 2, 0), color],
    [box(w + 0.08, 0.06, d + 0.08, 0, h - 0.03, 0), new THREE.Color(color).multiplyScalar(1.2)],
    [box(w - 0.12, 0.04, d - 0.12, 0, h + 0.02, 0), 0x3b2c22],
  ];
  const n = Math.max(2, Math.round(w / 0.4));
  const blooms = [];
  for (let i = 0; i < n; i++) {
    const u = -w / 2 + 0.2 + i * (w - 0.4) / Math.max(1, n - 1);
    parts.push([sphere(0.22 + (i % 2) * 0.05, u, h + 0.2, 0, 6, 4), new THREE.Color(hedge).offsetHSL(0, 0, ((i % 3) - 1) * 0.03)]);
    if (B.detail) for (let f = 0; f < 3; f++) {
      const fx = u + ((f - 1) * 0.12), fz = (f % 2 ? 0.12 : -0.1);
      blooms.push([new THREE.IcosahedronGeometry(0.055, 0).translate(fx, h + 0.4, fz), flowers[(i + f) % flowers.length]]);
    }
  }
  place(B, parts, x, z, yaw);
  placeInto(fine(B), blooms, x, z, yaw);
}

// Café terrace: round table, umbrella (glass bucket so it reads as canvas), two chairs.
export function cafeTable(B, x, z, yaw, { canvas = 0xffb84d, iron = 0x1b2941, top = 0xd8e1e6 } = {}) {
  const parts = [
    [cyl(0.42, 0.42, 0.04, 12, 0, 0.74, 0), top],
    [cyl(0.03, 0.05, 0.72, 6, 0, 0.37, 0), iron],
    [cyl(0.24, 0.24, 0.03, 8, 0, 0.02, 0), iron],
    [cyl(0.03, 0.03, 1.6, 6, 0, 1.55, 0), iron],
  ];
  const canopy = new THREE.ConeGeometry(1.05, 0.42, 8).translate(0, 2.42, 0);
  parts.push([canopy, canvas]);
  const valance = [];
  if (B.detail) for (let i = 0; i < 8; i++) {           // scalloped valance
    const a = (i + 0.5) / 8 * Math.PI * 2;
    valance.push([sphere(0.13, Math.cos(a) * 1.0, 2.2, Math.sin(a) * 1.0, 5, 3), new THREE.Color(canvas).multiplyScalar(0.9)]);
  }
  placeInto(fine(B), valance, x, z, yaw);
  for (const s of [-1, 1]) {
    parts.push([box(0.42, 0.04, 0.42, s * 0.74, 0.45, 0), iron]);
    parts.push([box(0.42, 0.4, 0.04, s * 0.74 + s * 0.19, 0.67, 0), iron]);
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) parts.push([box(0.03, 0.44, 0.03, s * 0.74 + lx * 0.18, 0.22, lz * 0.18), iron]);
  }
  place(B, parts, x, z, yaw);
}

// Bus / tram shelter: frame, glass back + roof, a bench inside, route board.
export function busShelter(B, x, z, yaw, { frame = IRON, glass = 0x9fd8e8, accent = 0x4deeea, seat = WOOD, len = 3.6 } = {}) {
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push([box(0.09, 2.5, 0.09, s * (len / 2 - 0.1), 1.25, 0.65), frame]);
    parts.push([box(0.09, 2.5, 0.09, s * (len / 2 - 0.1), 1.25, -0.65), frame]);
  }
  parts.push([box(len + 0.1, 0.08, 1.5, 0, 2.52, 0), frame]);
  parts.push([box(len - 0.3, 0.06, 0.06, 0, 2.6, 0.7), accent]);                      // lit rail
  parts.push([box(len - 0.6, 0.08, 0.5, 0, 0.5, -0.35), seat]);
  parts.push([box(0.08, 0.5, 0.5, -(len / 2 - 0.4), 0.25, -0.35), frame]);
  parts.push([box(0.08, 0.5, 0.5, (len / 2 - 0.4), 0.25, -0.35), frame]);
  place(B, parts, x, z, yaw);
  const glassParts = [
    [box(len - 0.3, 2.1, 0.03, 0, 1.3, -0.66), glass],
    [box(len + 0.1, 0.03, 1.4, 0, 2.5, 0), glass],
    [box(0.03, 2.1, 1.2, -(len / 2 - 0.1), 1.3, 0), glass],
  ];
  placeInto(B.glass, glassParts, x, z, yaw);
  B.neon && placeInto(B.neon, [[box(len - 0.3, 0.06, 0.06, 0, 2.6, 0.7), accent]], x, z, yaw);
}

export function bikeRack(B, x, z, yaw, { color = CHROME, n = 3 } = {}) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const u = (i - (n - 1) / 2) * 0.9;
    parts.push([new THREE.TorusGeometry(0.34, 0.03, 6, 10, Math.PI).translate(u, 0.42, 0), color]);
    parts.push([box(0.06, 0.42, 0.06, u - 0.34, 0.21, 0), color]);
    parts.push([box(0.06, 0.42, 0.06, u + 0.34, 0.21, 0), color]);
  }
  place(B, parts, x, z, yaw);
}

// National post box by country prefix of the zone code.
export function postBox(B, x, z, yaw, country) {
  const parts = [];
  if (country === 'uk' || country === 'sco' || country === 'au' || country === 'nz' || country === 'za') {
    const red = country === 'za' ? 0xc8352e : 0xb8231f;
    parts.push([cyl(0.28, 0.3, 1.25, 12, 0, 0.62, 0), red]);
    parts.push([cyl(0.31, 0.31, 0.06, 12, 0, 1.28, 0), 0x1a1a22]);
    parts.push([sphere(0.3, 0, 1.3, 0, 12, 6).scale(1, 0.45, 1), red]);
    parts.push([box(0.28, 0.04, 0.04, 0, 1.0, 0.29), 0x1a1a22]);                   // slot
    parts.push([box(0.2, 0.14, 0.02, 0, 0.72, 0.3), 0xd9d2b8]);                    // notice
  } else if (country === 'ie') {
    parts.push([cyl(0.28, 0.3, 1.25, 12, 0, 0.62, 0), 0x2f7d4f]);
    parts.push([sphere(0.3, 0, 1.28, 0, 12, 6).scale(1, 0.45, 1), 0x2f7d4f]);
    parts.push([box(0.28, 0.04, 0.04, 0, 1.0, 0.29), 0x1a1a22]);
  } else if (country === 'us') {
    parts.push([box(0.62, 0.7, 0.55, 0, 0.9, 0), 0x2b4a9c]);
    parts.push([cyl(0.31, 0.31, 0.62, 12, 0, 1.25, 0).rotateZ(Math.PI / 2), 0x2b4a9c]);
    parts.push([box(0.5, 0.5, 0.5, 0, 0.28, 0), 0x2b4a9c]);
    parts.push([box(0.34, 0.12, 0.03, 0, 1.12, 0.29), 0x1a1a22]);
  } else if (country === 'ca') {
    parts.push([box(0.6, 0.72, 0.5, 0, 0.9, 0), 0xc8352e]);
    parts.push([cyl(0.28, 0.28, 0.6, 12, 0, 1.26, 0).rotateZ(Math.PI / 2), 0xc8352e]);
    parts.push([box(0.4, 0.4, 0.4, 0, 0.27, 0), 0xc8352e]);
  } else {                                                                            // Caribbean: small red box on a post
    parts.push([box(0.08, 0.9, 0.08, 0, 0.45, 0), IRON]);
    parts.push([box(0.42, 0.5, 0.32, 0, 1.15, 0), 0xc8352e]);
    parts.push([box(0.3, 0.04, 0.03, 0, 1.25, 0.17), 0x1a1a22]);
  }
  place(B, parts, x, z, yaw);
}

// Phone box: UK K6 (red, domed) or a glass booth elsewhere.
export function phoneBox(B, x, z, yaw, country) {
  const uk = country === 'uk' || country === 'sco';
  const body = uk ? 0xb8231f : IRON;
  const parts = [
    [box(0.95, 0.12, 0.95, 0, 0.06, 0), body],
    [box(0.95, 0.2, 0.95, 0, 2.3, 0), body],
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push([box(0.09, 2.3, 0.09, sx * 0.43, 1.15, sz * 0.43), body]);
  if (uk) {
    parts.push([sphere(0.5, 0, 2.38, 0, 10, 6).scale(1, 0.5, 1), body]);
    parts.push([box(0.95, 0.06, 0.95, 0, 2.42, 0), body]);
    for (let i = 0; i < 2; i++) parts.push([box(0.86, 0.03, 0.03, 0, 1.2 + i * 0.45, 0.46), body]);
  } else {
    parts.push([box(1.0, 0.08, 1.0, 0, 2.44, 0), body]);
  }
  place(B, parts, x, z, yaw);
  const glassParts = [];
  for (const F of FACES) {
    const g = new THREE.PlaneGeometry(0.78, 2.1); g.rotateY(F.ry); g.translate(F.nx * 0.45, 1.2, F.nz * 0.45);
    glassParts.push([g, 0xbfe7f0]);
  }
  placeInto(B.glass, glassParts, x, z, yaw);
  if (uk) placeInto(B.neon, [[box(0.7, 0.12, 0.02, 0, 2.15, 0.48), 0xfff0c2]], x, z, yaw);
}

// Street-name plate on a post (atlas cell) — uv = SignAtlas cell.
export function streetSign(B, x, z, yaw, uv, { post = IRON, w = 0.9 } = {}) {
  place(B, [[cyl(0.035, 0.045, 2.4, 6, 0, 1.2, 0), post]], x, z, yaw);
  if (!uv) return;
  const plate = uvCell(new THREE.PlaneGeometry(w, w / 4), uv.u0, uv.v0, uv.u1, uv.v1);
  plate.translate(w / 2 + 0.05, 2.25, 0.03);
  placeInto(B.sign, [[plate, 0xffffff]], x, z, yaw);
  placeInto(B.shell, [[box(w, w / 4 + 0.02, 0.02, w / 2 + 0.05, 2.25, 0.015), post]], x, z, yaw);
}

// Bunting: a sagging line of triangular flags between two points.
export function bunting(B, ax, ay, az, bx, by, bz, colours = [0xff6f91, 0x4deeea, 0xffb84d, 0xf5f2ff]) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(3, Math.floor(len / 0.55));
  const mid = new THREE.Vector3((ax + bx) / 2, Math.min(ay, by) - 0.5 - len * 0.04, (az + bz) / 2);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(ax, ay, az), mid, new THREE.Vector3(bx, by, bz));
  B.shell.add(ribbon(curve, n * 2, () => 0.012), 0x2a2a3a);
  const dir = new THREE.Vector3(bx - ax, 0, bz - az).normalize();
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    curve.getPoint((i + 0.5) / n, p);
    const flag = new THREE.BufferGeometry();
    const hw = 0.16, h = 0.28;
    flag.setAttribute('position', new THREE.Float32BufferAttribute([
      p.x - dir.x * hw, p.y, p.z - dir.z * hw,
      p.x + dir.x * hw, p.y, p.z + dir.z * hw,
      p.x, p.y - h, p.z,
    ], 3));
    flag.setIndex([0, 1, 2]);
    flag.computeVertexNormals();
    B.shell.add(flag, colours[i % colours.length]);
  }
}

// String lights: a sagging cable with warm bulbs (neon bucket).
export function stringLights(B, ax, ay, az, bx, by, bz, { bulb = 0xffd9a0, every = 0.7 } = {}) {
  const len = Math.hypot(bx - ax, bz - az);
  const mid = new THREE.Vector3((ax + bx) / 2, Math.min(ay, by) - 0.4 - len * 0.035, (az + bz) / 2);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(ax, ay, az), mid, new THREE.Vector3(bx, by, bz));
  B.shell.add(ribbon(curve, Math.max(4, Math.floor(len)), () => 0.01), 0x1a1a24);
  const n = Math.max(2, Math.floor(len / every));
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    curve.getPoint((i + 0.5) / n, p);
    B.neon.add(sphere(0.055, p.x, p.y - 0.06, p.z, 6, 4), bulb);
  }
}

export function flagpole(B, x, z, { h = 6, flag = 0xff6f91, pole = CHROME } = {}) {
  B.shell.add(cyl(0.04, 0.06, h, 6, x, h / 2, z), pole);
  B.shell.add(sphere(0.07, x, h + 0.04, z), BRASS);
  B.shell.add(box(1.2, 0.7, 0.02, x + 0.62, h - 0.45, z), flag);
}

// Awning: sloped canvas with a scalloped valance, mounted on a face.
export function awning(B, cx, cy, cz, F, { width = 3, depth = 1.1, color = 0xc04f72, stripe = null } = {}) {
  const parts = [];
  // prism extrudes along its local z; -PI/2 turns that onto the face tangent
  // (x) and sends the profile's depth axis out of the face along +z.
  const slab = prism([[0, 0.0], [depth, -0.32], [depth, -0.26], [0, 0.06]], width, 0, 0, 0, -Math.PI / 2);
  parts.push([slab, color]);
  if (stripe !== null) {
    for (let i = 0; i < Math.floor(width / 0.6); i++) {
      if (i % 2) continue;
      parts.push([box(0.3, 0.02, depth * 0.96, -width / 2 + 0.3 + i * 0.6, 0.01 - depth * 0.16, depth * 0.5).rotateX(-0.29).translate(0, 0.02, 0), stripe]);
    }
  }
  const scallops = [];
  if (B.detail) for (let i = 0; i < Math.floor(width / 0.42); i++) {
    const u = -width / 2 + 0.21 + i * 0.42;
    scallops.push([sphere(0.12, u, -0.36, depth - 0.02, 5, 3).scale(1, 0.75, 0.5), color]);
  }
  for (const s of [-1, 1]) parts.push([box(0.04, 0.04, depth, s * (width / 2 - 0.05), -0.02, depth / 2), IRON]);
  // author on the +z face then rotate onto F
  for (const [g, c] of parts) { g.rotateY(F.ry); g.translate(cx, cy, cz); B.shell.add(g, c); }
  for (const [g, c] of scallops) { g.rotateY(F.ry); g.translate(cx, cy, cz); fine(B).add(g, c); }
}

// ------------------------------------------------------------------ helpers
// Author parts around the origin (facing +z), then yaw + translate into place.
export function place(B, parts, x, z, yaw = 0, y = 0) { placeInto(B.shell, parts, x, z, yaw, y); }
export function placeInto(batch, parts, x, z, yaw = 0, y = 0) {
  for (const [g, c] of parts) {
    if (yaw) g.rotateY(yaw);
    g.translate(x, y, z);
    batch.add(g, c);
  }
}

// Rotate a point authored in a district's local frame into world space.
export function localToWorld(cx, cz, yaw, lx, lz) {
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  return { x: cx + lx * cosY + lz * sinY, z: cz - lx * sinY + lz * cosY };
}

export { jitterColor, faceQuad };

// ------------------------------------------------------------- district AO
// Contact darkening baked into the shell's colour attribute. Walls darken
// toward the pavement; pavement darkens in a ring around each footprint; any
// vertex close to another footprint's edge darkens (crevices). The old bake
// applied the ground term to everything below 2.6 m, which would have turned
// the whole paver field grey now that the ground shares the shell batch.
export function bakeDistrictAO(geometry, occluders = [], {
  groundHeight = 2.4, groundStrength = 0.36, creviceStrength = 0.32, creviceRange = 2.2, ringRange = 1.4, ringStrength = 0.28,
} = {}) {
  const pos = geometry.attributes.position, col = geometry.attributes.color;
  if (!pos || !col) return geometry;
  const range2 = creviceRange * creviceRange, ring2 = ringRange * ringRange;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let ao = 1;
    let near = Infinity;
    for (let k = 0; k < occluders.length; k++) {
      const o = occluders[k];
      const dx = Math.max(Math.abs(x - o.x) - o.hw, 0);
      const dz = Math.max(Math.abs(z - o.z) - o.hd, 0);
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.02 && d2 < near) near = d2;
    }
    if (y > 0.2) {
      const t = Math.min(1, (y - 0.2) / groundHeight);
      ao *= 1 - groundStrength * (1 - t * t);
      if (near < range2) {
        const closeness = 1 - Math.sqrt(near) / creviceRange;
        ao *= 1 - creviceStrength * closeness * closeness * (1 - t * 0.55);
      }
    } else if (near < ring2) {
      const closeness = 1 - Math.sqrt(near) / ringRange;
      ao *= 1 - ringStrength * closeness * closeness;
    }
    if (ao < 1) col.setXYZ(i, col.getX(i) * ao, col.getY(i) * ao, col.getZ(i) * ao);
  }
  col.needsUpdate = true;
  return geometry;
}
