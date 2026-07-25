// Shared look: stepped toon ramps, Miami-after-dark color, sky dome, blob shadows.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PALETTE = {
  cream: 0xf5f2ff, terracotta: 0xff5f7e, sage: 0x36e1c1, amber: 0xffb45f,
  dustyBlue: 0x5cbcff, ink: 0x0a1024, purple: 0x9b63ff, road: 0x10172b,
  sidewalk: 0x59657d, plaza: 0x39445d, grass: 0x246a66, curb: 0x92a4bd,
  cyan: 0x4deeea, pink: 0xff4fa3, coral: 0xff755f, glass: 0x18274a,
};

// One shared gradient ramp drives every toon material (Abeto-style stepped light).
let _ramp = null;
export function toonRamp() {
  if (_ramp) return _ramp;
  const steps = new Uint8Array([110, 160, 215, 255]);
  _ramp = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  _ramp.minFilter = THREE.NearestFilter;
  _ramp.magFilter = THREE.NearestFilter;
  _ramp.needsUpdate = true;
  return _ramp;
}

export function toonMat(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...opts });
}

// A toon material that takes its colour from the vertex stream. Used with
// GeoBatch so dozens of differently-tinted surfaces can share one draw call.
export function toonVertexMat(opts = {}) {
  return new THREE.MeshToonMaterial({
    color: 0xffffff, vertexColors: true, gradientMap: toonRamp(), ...opts,
  });
}

// ---------------------------------------------------------------- GeoBatch
// Collects positioned geometries with a per-geometry colour and merges them
// into ONE mesh. The city was previously spending a draw call on every paving
// stripe, curb quad and sign post; batching by material instead of by object
// is the single largest frame-time saving available to it.
const BATCH_ATTRS = ['position', 'normal', 'uv'];

export class GeoBatch {
  constructor() { this.geos = []; this.tris = 0; }

  get empty() { return this.geos.length === 0; }

  // geometry is consumed (disposed on merge). ao multiplies the colour and is
  // where baked occlusion lands; 1 = unoccluded.
  add(geometry, color, ao = 1) {
    for (const key of Object.keys(geometry.attributes)) {
      if (!BATCH_ATTRS.includes(key)) geometry.deleteAttribute(key);
    }
    if (!geometry.attributes.uv) {
      const n = geometry.attributes.position.count;
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    // three's primitives are a mix of indexed (Box, Cylinder, Sphere) and
    // non-indexed (Icosahedron, Octahedron); mergeGeometries refuses a mix, so
    // give the non-indexed ones a trivial index rather than expanding the rest.
    if (!geometry.index) {
      const count = geometry.attributes.position.count;
      const idx = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
      for (let i = 0; i < count; i++) idx[i] = i;
      geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    const n = geometry.attributes.position.count;
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const arr = new Float32Array(n * 3);
    const r = c.r * ao, g = c.g * ao, b = c.b * ao;
    for (let i = 0; i < n; i++) { arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(geometry);
    return geometry;
  }

  // Returns a single Mesh, or null when nothing was added.
  build(material, { castShadow = true, receiveShadow = true, name = 'batch' } = {}) {
    if (!this.geos.length) return null;
    const merged = this.geos.length === 1 ? this.geos[0] : mergeGeometries(this.geos, false);
    if (this.geos.length > 1) this.geos.forEach((g) => g.dispose());
    this.geos.length = 0;
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
  }
}

// ------------------------------------------------------------- baked vertex AO
// Procedural boxes read as floating cardboard without contact darkening. This
// bakes two cheap terms straight into the colour attribute at merge time, which
// costs nothing at runtime and survives on hardware that could never afford SSAO:
//   * ground contact — everything darkens toward its base
//   * crevice occlusion — vertices near other building footprints darken
// occluders are {x, z, hw, hd} footprints in the same local space as the mesh.
export function bakeVertexAO(geometry, occluders = [], {
  groundHeight = 2.6, groundStrength = 0.42, creviceStrength = 0.34, creviceRange = 2.4,
} = {}) {
  const pos = geometry.attributes.position;
  const col = geometry.attributes.color;
  if (!pos || !col) return geometry;
  const n = pos.count;
  const range2 = creviceRange * creviceRange;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // ground contact: 0 at the pavement, 1 above groundHeight
    const t = Math.min(1, Math.max(0, y / groundHeight));
    let ao = 1 - groundStrength * (1 - t * t);
    // crevice: distance to the nearest OTHER footprint edge
    let near = Infinity;
    for (let k = 0; k < occluders.length; k++) {
      const o = occluders[k];
      const dx = Math.max(Math.abs(x - o.x) - o.hw, 0);
      const dz = Math.max(Math.abs(z - o.z) - o.hd, 0);
      const d2 = dx * dx + dz * dz;
      // d2 === 0 means the vertex belongs to this footprint — skip its own box
      if (d2 > 0.01 && d2 < near) near = d2;
    }
    if (near < range2) {
      const closeness = 1 - Math.sqrt(near) / creviceRange;
      ao *= 1 - creviceStrength * closeness * closeness * (1 - t * 0.55);
    }
    col.setXYZ(i, col.getX(i) * ao, col.getY(i) * ao, col.getZ(i) * ao);
  }
  col.needsUpdate = true;
  return geometry;
}

// Every neon surface in the city registers here so its brightness can be
// retuned when the render path changes. It matters: without post-processing the
// renderer tone-maps and neon opts out with toneMapped:false, so 1.0 is already
// as bright as the screen goes. With the post stack, the scene is rendered
// linear and ACES runs in the composite over EVERYTHING, so neon authored at 1.0
// comes out visibly duller — and never crosses the bloom threshold. Boosting it
// above 1.0 in that mode restores the intent and is what makes signage glow.
const NEON_REGISTRY = new Set();
let neonGain = 1;

export function neonMat(color, opacity = 1) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    toneMapped: false,
  });
  mat.userData.neonBase = mat.color.clone();
  mat.color.multiplyScalar(neonGain);
  NEON_REGISTRY.add(mat);
  return mat;
}

export function setNeonGain(gain) {
  if (gain === neonGain) return;
  neonGain = gain;
  for (const mat of NEON_REGISTRY) {
    const base = mat.userData.neonBase;
    if (base) mat.color.copy(base).multiplyScalar(gain);
  }
}

// Convert a loaded GLB's PBR materials to toon while keeping baked texture maps.
export function toonifyGLB(root, { saturate = 1.08, brighten = 1.05 } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    const mat = new THREE.MeshToonMaterial({
      map: src.map || null,
      color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
      gradientMap: toonRamp(),
    });
    if (mat.map) {
      mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.map.anisotropy = 4;
    }
    // Gentle saturation lift so Meshy bakes sit in the cool neon-city grade.
    const hsl = {};
    mat.color.getHSL(hsl);
    mat.color.setHSL(hsl.h, Math.min(1, hsl.s * saturate), Math.min(1, hsl.l * brighten));
    o.material = mat;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return root;
}

// Shared clock uniform for wind/shader effects (ticked from main loop).
export const uTime = { value: 0 };

// Vertex-shader wind sway for instanced foliage: gentle world-position-phased
// lean, stronger toward the top of each instance.
export function addWindSway(material, amp = 0.09) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float windPhase = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
          float sway = sin(uTime * 1.4 + windPhase) + 0.4 * sin(uTime * 2.7 + windPhase * 1.7);
          float reach = smoothstep(0.0, 1.2, transformed.y);
          transformed.x += sway * ${amp.toFixed(3)} * reach;
          transformed.z += sway * ${(amp * 0.6).toFixed(3)} * reach;
        #endif
      `);
  };
  return material;
}

// Procedural dusk windows for the instanced skyline: world-space grid of neon
// lit windows on facades (skips roofs/floors via normal), stable per cell.
export function addDuskWindows(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmWorldPos;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vEmWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vEmWorldPos;
        float emHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 nrm = normalize(cross(dFdx(vEmWorldPos), dFdy(vEmWorldPos)));
          float facade = 1.0 - abs(nrm.y);                       // walls only
          float hFade = smoothstep(2.6, 5.5, vEmWorldPos.y);
          vec2 grid = vec2((vEmWorldPos.x + vEmWorldPos.z) * 0.55, vEmWorldPos.y * 0.42);
          vec2 cell = floor(grid);
          vec2 f = fract(grid);
          // mullioned panes with real margins so wall reads between windows
          float inWin = step(0.30, f.x) * step(f.x, 0.72) * step(0.34, f.y) * step(f.y, 0.70);
          float win = inWin * facade * hFade;
          // every window is glass — cool dark pane even when nobody's home
          outgoingLight = mix(outgoingLight, outgoingLight * 0.28 + vec3(0.025, 0.075, 0.14), win * 0.9);
          // floor-slab shadow line for structure
          float band = smoothstep(0.93, 1.0, f.y) * facade * hFade;
          outgoingLight *= 1.0 - band * 0.16;
          float lit = step(0.54, emHash(cell));
          float temperature = step(0.54, emHash(cell + vec2(13.0, 7.0)));
          vec3 windowGlow = mix(vec3(0.20, 0.92, 1.0), vec3(1.0, 0.35, 0.68), temperature);
          outgoingLight += windowGlow * win * lit * 0.82;
        }
        #include <opaque_fragment>`);
  };
  return material;
}

// ------------------------------------------------------------- wet streets
// A night city reads as expensive mostly because the ground answers the lights.
// Real screen-space reflections are out of reach on the devices this has to run
// on, so the road shades itself: a world-space puddle mask, a Fresnel term that
// only kicks in at grazing angles, a sky term from the same gradient as the
// dome, and vertical neon smears whose colour is stable per band of street.
// Cost is a couple of dozen ALU ops on surfaces that are already drawn.
export function addWetStreets(material, { strength = 0.85 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uWet = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmWorld;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vEmWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        varying vec3 vEmWorld;
        uniform float uTime;
        uniform float uWet;
        float emH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float emNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(emH(i), emH(i + vec2(1.0, 0.0)), f.x),
                     mix(emH(i + vec2(0.0, 1.0)), emH(i + vec2(1.0, 1.0)), f.x), f.y);
        }
      `)
      .replace('#include <opaque_fragment>', /* glsl */`
        {
          vec3 V = normalize(cameraPosition - vEmWorld);
          float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);

          // where the road is wet at all — broad damp patches, not polka dots
          float damp = emNoise(vEmWorld.xz * 0.075) * 0.65 + emNoise(vEmWorld.xz * 0.21) * 0.35;
          float wet = smoothstep(0.44, 0.78, damp) * uWet;

          // the sky the puddle can see, matched to the dome's own gradient
          vec3 skyRefl = mix(vec3(0.055, 0.075, 0.16), vec3(0.16, 0.10, 0.24),
                             smoothstep(0.0, 0.5, V.y));

          // neon smears: colour is constant across a band of street and streaks
          // along it, which is what a reflected sign actually looks like
          float bandId = floor(vEmWorld.x * 0.21 + vEmWorld.z * 0.06);
          float bandLit = step(0.66, emH(vec2(bandId, 3.0)));
          vec3 neon = mix(vec3(0.16, 0.88, 0.96), vec3(1.0, 0.30, 0.60),
                          step(0.5, emH(vec2(bandId, 7.0))));
          float streak = emNoise(vec2(vEmWorld.x * 1.6, vEmWorld.z * 0.16 + uTime * 0.03));
          streak = smoothstep(0.55, 0.98, streak) * bandLit;

          float mask = wet * mix(0.10, 0.82, fres);
          outgoingLight = mix(outgoingLight, outgoingLight * 0.52 + skyRefl, mask);
          outgoingLight += neon * streak * mask * 0.55;
        }
        #include <opaque_fragment>
      `);
  };
  material.customProgramCacheKey = () => 'em-wet-v1';
  return material;
}

// Gradient sky dome with sun disc — one draw call, no textures.
export function makeSky() {
  const geo = new THREE.SphereGeometry(900, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x050816) },
      midColor: { value: new THREE.Color(0x192953) },
      botColor: { value: new THREE.Color(0xff668d) },
      sunDir: { value: new THREE.Vector3(-0.48, 0.18, -0.8).normalize() },
      sunColor: { value: new THREE.Color(0xffd2c2) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor, midColor, botColor, sunColor;
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.08, 1.0);
        vec3 sky = h < 0.22
          ? mix(botColor, midColor, smoothstep(-0.08, 0.22, h))
          : mix(midColor, topColor, smoothstep(0.22, 0.9, h));
        float horizon = 1.0 - smoothstep(-0.02, 0.18, abs(vDir.y));
        sky += vec3(0.28, 0.05, 0.22) * horizon * 0.42;
        float sun = dot(normalize(vDir), sunDir);
        sky += sunColor * (smoothstep(0.9987, 0.99965, sun) * 0.72
                          + pow(max(sun, 0.0), 34.0) * 0.12);
        gl_FragColor = vec4(sky, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  return sky;
}

// Soft radial blob shadow (shared canvas texture).
let _blobTex = null;
function blobTexture() {
  if (_blobTex) return _blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(4,9,24,0.46)');
  grad.addColorStop(1, 'rgba(4,9,24,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _blobTex = new THREE.CanvasTexture(c);
  return _blobTex;
}

export function blobShadow(radius = 0.6) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: blobTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = 2;
  return m;
}

// Soft toon cloud banks drifting slowly overhead.
export function makeClouds(clusters = 14) {
  const puffsPer = 5;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshToonMaterial({
    color: 0x8b8eb7,
    gradientMap: toonRamp(),
    fog: false,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const inst = new THREE.InstancedMesh(geo, mat, clusters * puffsPer);
  const M = new THREE.Matrix4();
  const seeds = [];
  let i = 0;
  for (let cl = 0; cl < clusters; cl++) {
    const cx = (Math.random() - 0.5) * 900;
    const cz = (Math.random() - 0.5) * 900;
    const cy = 105 + Math.random() * 85;
    const spd = 1.2 + Math.random() * 1.6;
    const baseS = 9 + Math.random() * 14;
    for (let p = 0; p < puffsPer; p++, i++) {
      const ox = (Math.random() - 0.5) * baseS * 1.9;
      const oz = (Math.random() - 0.5) * baseS * 0.9;
      const oy = (Math.random() - 0.5) * baseS * 0.35;
      const s = baseS * (0.45 + Math.random() * 0.6);
      seeds.push({ cx, cz, cy, ox, oz, oy, s: [s * 1.4, s * 0.6, s], spd });
    }
  }
  inst.userData.update = (t) => {
    for (let k = 0; k < seeds.length; k++) {
      const d = seeds[k];
      let x = d.cx + d.ox + t * d.spd;
      x = ((x + 500) % 1000) - 500;             // wrap across the sky
      M.makeScale(d.s[0], d.s[1], d.s[2]).setPosition(x, d.cy + d.oy, d.cz + d.oz);
      inst.setMatrixAt(k, M);
    }
    inst.instanceMatrix.needsUpdate = true;
  };
  inst.userData.update(0);
  return inst;
}

// Floating dust motes — cheap Points cloud around the plaza.
export function makeDustMotes(count = 140, range = 60) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * range;
    pos[i * 3 + 1] = 0.4 + Math.random() * 5.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * range;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x77f7ee, size: 0.06, transparent: true, opacity: 0.5,
    sizeAttenuation: true, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData.update = (t) => { pts.position.y = Math.sin(t * 0.25) * 0.35; pts.rotation.y = t * 0.01; };
  return pts;
}
