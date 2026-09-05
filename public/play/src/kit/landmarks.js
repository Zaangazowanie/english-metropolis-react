// Landmark kit: one hero object per district, picked from the keywords in the
// zone's authored `landmark` line and placed where the arrival camera looks —
// at the far end of the district's centre street, so every stop has a vista.
// Everything goes into the district's buckets (no extra draw calls).
import * as THREE from 'three';
import { box, cyl, sphere, cone, prism, ribbon, faceQuad, FACES } from './shapes.js';
import { placeInto, IRON, CHROME, BRASS, WOOD, STONE, lamp, bench, awning } from './street.js';

const KINDS = [
  [/footbridge|ha'penny|iron bridge|bridge/i, 'footbridge'],
  [/arch\b|arches|viaduct/i, 'arch'],
  [/clock|belfry|bell/i, 'clocktower'],
  [/lighthouse/i, 'lighthouse'],
  [/gazebo|bandstand|pavilion|porch|panyard|bothy|stage|wharf/i, 'gazebo'],
  [/statue|cone|galah|jandal|weathervane|big thing/i, 'statue'],
  [/windmill|mill\b|chimney/i, 'windmill'],
  [/pier|ferris/i, 'pier'],
  [/wharenui|meeting house|pagoda|temple|carved/i, 'pagoda'],
  [/round tower|rotunda|tower/i, 'roundtower'],
  [/oak|tree|jacaranda|braai/i, 'greattree'],
  [/gantry|crane/i, 'gantry'],
  [/diner|bodega|dep\b|store|shack|record|speaker|sound system|hall|ballroom|conservatorium|rink/i, 'diner'],
  [/cross|obelisk|spiral|staircase|wall/i, 'obelisk'],
  [/fountain|urn|tea/i, 'fountain'],
];

export function landmarkKindFor(zoneData) {
  const text = String(zoneData.landmark || '');
  for (const [re, kind] of KINDS) if (re.test(text)) return kind;
  return 'fountain';
}

// Emits the landmark at (x, z) facing `yaw` (+z is the landmark's front).
// Returns collider footprints in the same local frame.
export function emitLandmark(B, kind, tones, rng, x, z, yaw) {
  const P = { shell: [], neon: [], glass: [], paneLit: [] };
  const stone = tones.stone || new THREE.Color(0xd8b88a);
  const accent = tones.accent, roof = tones.roof, line = tones.line || tones.accent;
  const warm = 0xffd9a0;
  const colliders = [];
  const S = (g, c) => P.shell.push([g, c]);
  const N = (g, c) => P.neon.push([g, c]);

  switch (kind) {
    case 'arch': {
      // honey-stone arch with a keystone, wisteria hanging from the spandrels
      for (const s of [-1, 1]) {
        S(box(1.4, 6.2, 1.5, s * 2.9, 3.1, 0), stone);
        S(box(1.7, 0.45, 1.8, s * 2.9, 0.22, 0), new THREE.Color(stone).multiplyScalar(0.85));
        S(box(1.7, 0.35, 1.8, s * 2.9, 6.3, 0), new THREE.Color(stone).multiplyScalar(0.92));
      }
      S(new THREE.TorusGeometry(2.95, 0.7, 6, 14, Math.PI).translate(0, 6.2, 0), stone);
      S(box(7.6, 1.1, 1.7, 0, 8.05, 0), stone);
      S(box(8.0, 0.3, 1.9, 0, 8.7, 0), new THREE.Color(stone).multiplyScalar(0.9));
      S(box(0.7, 0.9, 0.4, 0, 6.9, 0.78), new THREE.Color(stone).multiplyScalar(1.1));       // keystone
      for (let i = 0; i < 9; i++) {                                                         // wisteria
        const u = -3.4 + i * 0.85;
        S(sphere(0.32, u, 8.1 + (i % 2) * 0.2, 0.9, 6, 4), 0x9b7fd0);
        S(sphere(0.2, u + 0.2, 7.3 - (i % 3) * 0.25, 0.95, 5, 4), 0xa88ad8);
      }
      N(box(0.5, 0.12, 0.12, 0, 5.6, 0.9), warm);
      colliders.push({ x: -2.9, z: 0, hw: 0.85, hd: 0.9 }, { x: 2.9, z: 0, hw: 0.85, hd: 0.9 });
      break;
    }
    case 'footbridge': {
      // white cast-iron footbridge over a shallow channel with round lamps
      S(box(12, 0.4, 6.2, 0, -0.05, 0), 0x1c3a55);                                            // water channel
      const deck = prism([[-6.2, 0.4], [-4.8, 1.6], [4.8, 1.6], [6.2, 0.4], [6.2, 0.2], [-6.2, 0.2]], 2.8, 0, 0, 0, 0);
      S(deck, 0xe9edf2);
      for (const s of [-1, 1]) {
        for (let i = -5; i <= 5; i++) S(box(0.06, 1.05, 0.06, i * 1.05, 1.6 + 0.5 - Math.abs(i) * 0.05, s * 1.35), 0xe9edf2);
        S(box(11, 0.08, 0.08, 0, 2.6, s * 1.35), 0xe9edf2);
        for (const u of [-4.2, 0, 4.2]) {
          S(cyl(0.04, 0.05, 1.1, 6, u, 3.1, s * 1.35), IRON);
          N(sphere(0.2, u, 3.75, s * 1.35, 8, 6), warm);
        }
      }
      colliders.push({ x: 0, z: 0, hw: 6.2, hd: 3.1 });
      break;
    }
    case 'clocktower': {
      const dark = new THREE.Color(stone).multiplyScalar(0.72);
      S(box(4.2, 0.6, 4.2, 0, 0.3, 0), dark);
      S(box(3.2, 11, 3.2, 0, 6.1, 0), stone);
      for (let f = 1; f <= 3; f++) S(box(3.4, 0.16, 3.4, 0, 0.6 + f * 2.7, 0), dark);
      S(box(3.7, 0.5, 3.7, 0, 11.8, 0), dark);
      S(box(3.0, 2.2, 3.0, 0, 13.1, 0), stone);                                               // clock stage
      for (const F of FACES) {
        P.neon.push([cyl(0.95, 0.95, 0.06, 16, 0, 0, 0).rotateX(Math.PI / 2).rotateY(F.ry).translate(F.nx * 1.52, 13.1, F.nz * 1.52), 0xfff0c2]);
        S(cyl(1.08, 1.08, 0.08, 16, 0, 0, 0).rotateX(Math.PI / 2).rotateY(F.ry).translate(F.nx * 1.5, 13.1, F.nz * 1.5), IRON);
        S(box(0.08, 0.7, 0.05, 0, 0.3, 0).rotateY(F.ry).translate(F.nx * 1.57, 13.1, F.nz * 1.57), IRON);
        S(box(0.5, 0.07, 0.05, 0.22, 0, 0).rotateY(F.ry).translate(F.nx * 1.57, 13.1, F.nz * 1.57), IRON);
        // arched bell openings below the clock
        P.paneLit.push([faceQuad(0.9, 1.6, F.nx * 1.62, 9.6, F.nz * 1.62, F), 0xffe0b0]);
      }
      S(box(3.4, 0.4, 3.4, 0, 14.4, 0), dark);
      S(cone(2.3, 3.2, 4, 0, 16.2, 0).rotateY(Math.PI / 4), roof);
      S(cyl(0.05, 0.05, 1.6, 5, 0, 18.5, 0), BRASS);
      S(sphere(0.18, 0, 19.3, 0), BRASS);
      colliders.push({ x: 0, z: 0, hw: 2.2, hd: 2.2 });
      break;
    }
    case 'lighthouse': {
      S(cyl(2.4, 2.7, 0.5, 14, 0, 0.25, 0), STONE);
      for (let i = 0; i < 6; i++) S(cyl(1.55 - i * 0.12, 1.65 - i * 0.12, 1.85, 12, 0, 0.5 + i * 1.8 + 0.92, 0), i % 2 ? 0xf4f1ea : accent);
      S(cyl(1.55, 1.2, 0.5, 12, 0, 11.6, 0), IRON);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; S(box(0.06, 0.9, 0.06, Math.cos(a) * 1.3, 12.35, Math.sin(a) * 1.3), IRON); }
      S(box(3.0, 0.06, 0.06, 0, 12.3, 0), IRON);
      P.glass.push([cyl(1.05, 1.05, 1.5, 12, 0, 12.7, 0), 0xbfe7f0]);
      N(cyl(0.45, 0.45, 1.1, 8, 0, 12.7, 0), 0xfff4d6);
      S(cone(1.4, 1.1, 12, 0, 14.0, 0), roof);
      S(box(0.9, 1.9, 0.3, 0, 1.4, 2.5), 0x4a3324);                                             // door
      colliders.push({ x: 0, z: 0, hw: 2.0, hd: 2.0 });
      break;
    }
    case 'gazebo': {
      // octagonal bandstand: stone plinth, 8 posts, lattice rail, tiered roof, string lights
      S(cyl(4.4, 4.7, 0.5, 8, 0, 0.25, 0), STONE);
      S(cyl(4.1, 4.1, 0.15, 8, 0, 0.57, 0), WOOD);
      const posts = [];
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + Math.PI / 8;
        const px = Math.cos(a) * 3.6, pz = Math.sin(a) * 3.6;
        posts.push([px, pz]);
        S(box(0.18, 3.2, 0.18, px, 2.2, pz), 0xf4f1ea);
        if (i !== 0) {                                                                         // rail (gap at the front)
          const [qx, qz] = [Math.cos(a - Math.PI / 4) * 3.6, Math.sin(a - Math.PI / 4) * 3.6];
          const mx = (px + qx) / 2, mz = (pz + qz) / 2, ang = Math.atan2(qx - px, qz - pz);
          S(box(0.06, 0.06, 2.75, mx, 1.55, mz, ang), 0xf4f1ea);
          for (let k = 0; k < 4; k++) {
            const t = (k + 0.5) / 4;
            S(box(0.05, 0.9, 0.05, px + (qx - px) * t, 1.1, pz + (qz - pz) * t), 0xf4f1ea);
          }
        }
      }
      S(cyl(4.6, 4.6, 0.2, 8, 0, 3.9, 0), 0xf4f1ea);
      S(cone(4.9, 1.6, 8, 0, 4.8, 0), roof);
      S(cone(2.2, 1.5, 8, 0, 6.2, 0), roof);
      S(cyl(0.04, 0.04, 1.0, 5, 0, 7.4, 0), BRASS);
      for (let i = 0; i < 8; i++) {
        const [ax, az] = posts[i], [bx, bz] = posts[(i + 1) % 8];
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(ax, 3.7, az), new THREE.Vector3((ax + bx) / 2, 3.3, (az + bz) / 2), new THREE.Vector3(bx, 3.7, bz));
        S(ribbon(curve, 4, () => 0.01), 0x1a1a24);
        for (let k = 0; k < 3; k++) { const p = curve.getPoint((k + 0.5) / 3); N(sphere(0.06, p.x, p.y - 0.07, p.z, 5, 4), warm); }
      }
      colliders.push({ x: 0, z: 0, hw: 4.4, hd: 4.4 });
      break;
    }
    case 'statue': {
      S(box(3.2, 0.5, 3.2, 0, 0.25, 0), STONE);
      S(box(2.2, 2.6, 2.2, 0, 1.8, 0), new THREE.Color(stone).multiplyScalar(0.85));
      S(box(2.6, 0.3, 2.6, 0, 3.25, 0), STONE);
      // a figure on a plinth, arm raised, in verdigris bronze; hat is the accent
      const bronze = 0x4e7d6e;
      S(cyl(0.34, 0.42, 1.3, 8, 0, 4.05, 0), bronze);
      S(sphere(0.45, 0, 5.05, 0, 8, 6), bronze);
      S(sphere(0.28, 0, 5.75, 0, 8, 6), bronze);
      S(cyl(0.34, 0.34, 0.06, 8, 0, 6.0, 0), accent);
      S(cone(0.24, 0.6, 8, 0, 6.3, 0), accent);
      S(box(0.16, 1.1, 0.16, 0.55, 5.6, 0.1).rotateZ(-0.5), bronze);
      S(box(0.16, 0.9, 0.16, -0.5, 4.9, 0.1).rotateZ(0.4), bronze);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; N(sphere(0.06, Math.cos(a) * 1.4, 3.42, Math.sin(a) * 1.4, 5, 4), warm); }
      colliders.push({ x: 0, z: 0, hw: 1.7, hd: 1.7 });
      break;
    }
    case 'windmill': {
      S(cyl(2.0, 2.6, 7.5, 10, 0, 3.75, 0), 0xf4f1ea);
      S(cyl(2.2, 2.2, 0.4, 10, 0, 7.6, 0), IRON);
      S(box(2.4, 1.6, 2.6, 0, 8.5, 0), roof);
      S(cyl(0.12, 0.12, 1.6, 6, 0, 8.5, 0).rotateX(Math.PI / 2).translate(0, 0, 1.2), IRON);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.4;
        const blade = box(0.6, 4.8, 0.08, 0, 2.6, 0).rotateZ(a).translate(0, 8.5, 2.1);
        S(blade, 0xd8d2c4);
      }
      S(box(0.9, 1.9, 0.3, 0, 1.4, 2.5), WOOD);
      colliders.push({ x: 0, z: 0, hw: 2.4, hd: 2.4 });
      break;
    }
    case 'pier': {
      // timber pier deck with a kiosk and a small ferris wheel at the end
      S(box(12, 0.3, 4.6, 0, -0.15, 0), 0x1c3a55);
      S(box(11.5, 0.2, 3.4, 0, 0.55, 0), WOOD);
      for (let i = -5; i <= 5; i += 2) for (const s of [-1, 1]) S(cyl(0.12, 0.14, 0.9, 6, i, 0.1, s * 1.5), 0x5a4030);
      for (const s of [-1, 1]) {
        S(box(11.4, 0.06, 0.06, 0, 1.55, s * 1.62), 0xf4f1ea);
        for (let i = -5; i <= 5; i++) S(box(0.05, 0.9, 0.05, i * 1.05, 1.1, s * 1.62), 0xf4f1ea);
      }
      S(box(2.4, 2.4, 2.0, -3.5, 1.85, 0), accent);
      S(cone(2.0, 1.0, 4, -3.5, 3.55, 0).rotateY(Math.PI / 4), 0xf4f1ea);
      N(box(1.6, 0.3, 0.06, -3.5, 2.6, 1.04), warm);
      // ferris wheel
      S(cyl(0.12, 0.12, 5.0, 6, 3.6, 3.6, 0).rotateZ(0).rotateX(0), IRON);
      S(box(0.16, 5.4, 0.16, 3.6 - 1.1, 3.4, 0).rotateZ(0.42), IRON);
      S(box(0.16, 5.4, 0.16, 3.6 + 1.1, 3.4, 0).rotateZ(-0.42), IRON);
      P.neon.push([new THREE.TorusGeometry(2.9, 0.07, 6, 24).translate(3.6, 6.0, 0), line]);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        S(box(0.05, 2.9, 0.05, 3.6, 6.0 + 1.45, 0).translate(-3.6, -7.45, 0).rotateZ(a).translate(3.6, 6.0, 0), IRON);
        S(box(0.7, 0.6, 0.5, 3.6 + Math.cos(a) * 2.9, 6.0 + Math.sin(a) * 2.9 - 0.3, 0), [accent, 0xf4f1ea, line][i % 3]);
      }
      colliders.push({ x: 0, z: 0, hw: 6, hd: 2.3 });
      break;
    }
    case 'pagoda': {
      // carved timber meeting house / pagoda: red-ochre body, swooping tiered roofs
      const red = tones.pagoda || 0xa8452c;
      S(box(8.4, 0.5, 6.4, 0, 0.25, 0), STONE);
      S(box(7.6, 4.2, 5.6, 0, 2.6, 0), red);
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) S(box(0.32, 4.2, 0.32, s * 3.9, 2.6, -2.5 + i * 1.66), 0x3a1f14);
      S(box(1.6, 2.6, 0.3, 0, 1.8, 2.9), 0x3a1f14);
      const gable = prism([[-4.6, 0], [4.6, 0], [0, 2.4]], 6.6, 0, 4.7, 0, Math.PI / 2);
      S(gable, roof);
      S(box(0.5, 2.6, 0.5, 0, 6.1, 3.4).rotateX(0.15), 0x3a1f14);                               // carved gable figure post
      S(sphere(0.34, 0, 7.6, 3.5, 8, 6), 0xd9b56a);
      for (const s of [-1, 1]) S(box(0.24, 3.4, 0.24, s * 3.6, 5.6, 3.35).rotateZ(-s * 0.55), 0x3a1f14);
      for (let i = 0; i < 6; i++) N(box(0.16, 0.16, 0.16, -3.0 + i * 1.2, 4.5, 2.95), 0x59e6c4);   // paua inlays
      colliders.push({ x: 0, z: 0, hw: 4.2, hd: 3.2 });
      break;
    }
    case 'roundtower': {
      S(cyl(2.9, 3.2, 0.6, 14, 0, 0.3, 0), STONE);
      S(cyl(1.8, 2.3, 12, 12, 0, 6.6, 0), stone);
      S(cyl(2.0, 1.8, 0.4, 12, 0, 12.8, 0), new THREE.Color(stone).multiplyScalar(0.8));
      S(cone(2.1, 2.6, 12, 0, 14.3, 0), roof);
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2;
        P.paneLit.push([box(0.5, 0.9, 0.2, Math.cos(a) * 1.95, 10.5, Math.sin(a) * 1.95), 0xffe0b0]);
      }
      // ivy
      for (let i = 0; i < 12; i++) { const a = i * 1.7, r = 2.1; S(sphere(0.33, Math.cos(a) * r, 1.5 + i * 0.75, Math.sin(a) * r, 5, 4), 0x2f7a4a); }
      S(box(1.0, 2.0, 0.3, 0, 3.2, 2.15), WOOD);
      colliders.push({ x: 0, z: 0, hw: 2.4, hd: 2.4 });
      break;
    }
    case 'greattree': {
      // an ancient tree on a raised bed with ribbons and lanterns
      S(cyl(3.6, 3.9, 0.45, 12, 0, 0.22, 0), STONE);
      S(cyl(3.3, 3.3, 0.2, 12, 0, 0.55, 0), 0x3b2c22);
      S(cyl(0.55, 0.9, 3.2, 9, 0, 2.2, 0), 0x5a4636);
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + 0.4;
        S(cyl(0.18, 0.32, 2.6, 6, 0, 1.3, 0).rotateZ(0.6).rotateY(a).translate(0, 3.6, 0), 0x5a4636);
      }
      const canopy = tones.treeColours || [0x3f9c63, 0x2f8a5e, 0x4aa16a];
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2, d = i ? 2.1 : 0;
        S(sphere(i ? 1.7 : 2.4, Math.cos(a) * d, 5.6 + (i % 2) * 0.6, Math.sin(a) * d, 8, 6), canopy[i % canopy.length]);
      }
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; N(sphere(0.09, Math.cos(a) * 2.6, 3.9 + (i % 2) * 0.5, Math.sin(a) * 2.6, 5, 4), [warm, line][i % 2]); }
      colliders.push({ x: 0, z: 0, hw: 1.2, hd: 1.2 });
      break;
    }
    case 'gantry': {
      const yellow = 0xe8b923;
      for (const s of [-1, 1]) {
        S(box(1.2, 14, 1.2, s * 4.5, 7, 0), yellow);
        S(box(0.5, 13, 0.5, s * 4.5, 6.5, 2.2), yellow);
        S(box(0.5, 13, 0.5, s * 4.5, 6.5, -2.2), yellow);
      }
      S(box(12.5, 1.4, 1.6, 0, 14.6, 0), yellow);
      S(box(11, 0.5, 0.5, 0, 13.3, 1.6), yellow);
      S(box(0.4, 4.5, 0.4, 2.0, 11.6, 0), IRON);
      S(box(1.4, 1.0, 1.0, 2.0, 9.2, 0), IRON);
      for (let i = 0; i < 5; i++) N(box(0.25, 0.25, 0.25, -5 + i * 2.5, 15.4, 0.9), 0xff5a5a);
      colliders.push({ x: -4.5, z: 0, hw: 0.9, hd: 2.6 }, { x: 4.5, z: 0, hw: 0.9, hd: 2.6 });
      break;
    }
    case 'diner': {
      // chrome-and-neon diner / corner store with a glowing rooftop sign
      S(box(11, 0.5, 6.4, 0, 0.25, 0), STONE);
      S(box(10.2, 3.4, 5.6, 0, 2.2, 0), 0xf4f1ea);
      for (let i = 0; i < 6; i++) S(box(10.4, 0.14, 5.8, 0, 0.9 + i * 0.5, 0), CHROME);       // chrome fluting
      P.glass.push([box(9.0, 1.5, 0.08, 0, 2.3, 2.84), 0xbfe7f0]);
      P.paneLit.push([box(9.0, 1.5, 0.04, 0, 2.3, 2.8), 0xfff0c2]);
      S(box(10.6, 0.5, 6.0, 0, 4.15, 0), CHROME);
      S(box(6.0, 1.2, 0.2, 0, 5.2, 2.6), IRON);
      N(box(5.6, 0.3, 0.1, 0, 5.2, 2.72), line);
      N(box(0.2, 3.4, 0.2, -5.15, 2.2, 2.95), accent);
      N(box(0.2, 3.4, 0.2, 5.15, 2.2, 2.95), accent);
      S(box(1.4, 2.6, 0.3, 3.2, 1.8, 2.9), 0x8a3a2a);
      for (let i = 0; i < 3; i++) { S(box(0.15, 0.7, 0.15, -3.6 + i * 1.3, 0.85, 3.6), CHROME); S(cyl(0.34, 0.34, 0.06, 10, -3.6 + i * 1.3, 1.25, 3.6), accent); }
      colliders.push({ x: 0, z: 0, hw: 5.3, hd: 3.0 });
      break;
    }
    case 'obelisk': {
      S(box(3.6, 0.5, 3.6, 0, 0.25, 0), STONE);
      S(box(2.4, 0.8, 2.4, 0, 0.9, 0), new THREE.Color(stone).multiplyScalar(0.85));
      S(cyl(0.45, 0.85, 9, 4, 0, 5.7, 0).rotateY(Math.PI / 4), stone);
      S(cone(0.5, 0.9, 4, 0, 10.65, 0).rotateY(Math.PI / 4), BRASS);
      S(new THREE.TorusGeometry(1.5, 0.12, 8, 18).rotateX(Math.PI / 2).translate(0, 6.6, 0), roof);
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; N(box(0.16, 0.16, 0.16, Math.cos(a) * 1.45, 1.5, Math.sin(a) * 1.45), warm); }
      colliders.push({ x: 0, z: 0, hw: 1.3, hd: 1.3 });
      break;
    }
    default: {                                                                                   // fountain
      S(cyl(4.2, 4.5, 0.55, 16, 0, 0.27, 0), STONE);
      S(cyl(3.7, 3.7, 0.12, 16, 0, 0.6, 0), 0x1c3a55);                                            // water
      S(cyl(0.9, 1.3, 1.6, 10, 0, 1.4, 0), stone);
      S(cyl(2.0, 1.6, 0.25, 12, 0, 2.3, 0), stone);
      S(cyl(1.7, 1.7, 0.08, 12, 0, 2.45, 0), 0x2b5b7c);
      S(cyl(0.35, 0.55, 1.4, 8, 0, 3.15, 0), stone);
      S(cyl(1.0, 0.8, 0.2, 10, 0, 3.95, 0), stone);
      N(sphere(0.32, 0, 4.4, 0, 8, 6), 0xbfe7f0);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        P.glass.push([cyl(0.05, 0.12, 1.6, 5, Math.cos(a) * 1.2, 3.0, Math.sin(a) * 1.2).rotateZ(0), 0xcdeff8]);
      }
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; N(sphere(0.06, Math.cos(a) * 3.9, 0.62, Math.sin(a) * 3.9, 5, 4), 0xbfe7f0); }
      colliders.push({ x: 0, z: 0, hw: 4.3, hd: 4.3 });
      break;
    }
  }
  placeInto(B.shell, P.shell, x, z, yaw);
  placeInto(B.neon, P.neon, x, z, yaw);
  placeInto(B.glass, P.glass, x, z, yaw);
  placeInto(B.paneLit, P.paneLit, x, z, yaw);
  // colliders rotate with the landmark
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  return colliders.map((c) => ({
    localX: x + c.x * cos + c.z * sin, localZ: z - c.x * sin + c.z * cos,
    hw: Math.abs(cos) * c.hw + Math.abs(sin) * c.hd, hd: Math.abs(sin) * c.hw + Math.abs(cos) * c.hd,
    source: `landmark-${kind}`,
  }));
}
