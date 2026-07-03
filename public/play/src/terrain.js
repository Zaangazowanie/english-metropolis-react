// Rolling-hills heightfield. Flat along the hub, the three metro corridors and
// zone districts; scenic hills everywhere else. Deterministic, analytic — the
// same heightAt() drives the mesh, the player, and every placement.
import * as THREE from 'three';
import { toonRamp } from './materials.js';

const LINE_ANGLES = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 - (2 * Math.PI) / 3];
const CORRIDOR_HALF = 56;    // flat band around each boulevard (covers districts)
const CORRIDOR_LEN = 430;
const HUB_R = 58;
const BLEND = 34;            // metres to blend from flat to hilly
const AMP = 15;              // max hill height

function smooth(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

// how "hilly" a point is allowed to be: 0 = flat zone, 1 = open country
export function hillFactor(x, z) {
  let minD = Math.hypot(x, z) - HUB_R;                        // distance past hub edge
  for (const a of LINE_ANGLES) {
    const dx = Math.cos(a), dz = -Math.sin(a);
    const along = x * dx + z * dz;
    const lat = Math.abs(x * -dz + z * dx);
    if (along > -10 && along < CORRIDOR_LEN) {
      minD = Math.min(minD, lat - CORRIDOR_HALF);
    }
  }
  return smooth(minD / BLEND);
}

// cheap deterministic 2-octave value noise (0..1)
function noise(x, z) {
  const n1 = Math.sin(x * 0.021 + 1.7) * Math.cos(z * 0.018 + 0.6);
  const n2 = Math.sin((x + z) * 0.033 + 4.1) * Math.cos((x - z) * 0.027 + 2.2);
  const n3 = Math.sin(x * 0.061 - 0.9) * Math.cos(z * 0.054 + 3.3);
  return 0.5 + 0.5 * (n1 * 0.55 + n2 * 0.3 + n3 * 0.15);
}

export function heightAt(x, z) {
  const f = hillFactor(x, z);
  if (f <= 0) return 0;
  const n = noise(x, z);
  return AMP * f * Math.pow(n, 1.35);
}

export function makeTerrain() {
  const SIZE = 1000, SEG = 220;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x93a35e);
  const lush = new THREE.Color(0x7ba05b);
  const dry = new THREE.Color(0xc9b477);
  const paveA = new THREE.Color(0xb5afa6);   // concrete — the city core is PAVED
  const paveB = new THREE.Color(0xa8a29a);   // subtle slab variation
  const c = new THREE.Color(), p = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const urban = 1 - hillFactor(x, z);      // 1 = flat city fabric, 0 = open country
    // countryside: valley grass → lush mid → sun-dried tops
    const t = Math.min(1, h / AMP);
    if (t < 0.45) c.copy(grass).lerp(lush, t / 0.45);
    else c.copy(lush).lerp(dry, (t - 0.45) / 0.55);
    if (urban > 0) {
      // city: concrete pavement with slab-to-slab variation
      const tile = 0.5 + 0.5 * Math.sin(Math.floor(x / 7) * 12.9898 + Math.floor(z / 7) * 78.233);
      p.copy(paveA).lerp(paveB, tile);
      c.lerp(p, urban);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
