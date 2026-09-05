// GPU-animated instanced crowd.
//
// The old AmbientCrowd posed every limb of every person on the CPU across 27
// InstancedMesh objects and cost ~30 matrix composes per person per frame, which
// capped the city at 52 walkers. Here the whole body is ONE merged geometry
// drawn as ONE InstancedMesh: each vertex carries the two joints it hangs from,
// and the vertex shader swings those joints from a per-instance gait phase. The
// CPU only writes a root matrix per agent, so hundreds of locals cost about what
// a dozen used to.
//
// Agents walk authored routes (closed polylines laid out with the district) and
// never test each other for collision — lanes are offset so they read as a crowd
// without any O(n^2) work. Only the player pushes people aside.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonRamp, uTime } from './materials.js';

// ---------------------------------------------------------------- joint kinds
// Each vertex names up to two joints. The child joint (B) is applied first, then
// the parent (A), which is what gives knees and elbows their hierarchy without
// a real skeleton.
const J = {
  none: 0, hipL: 1, hipR: 2, kneeL: 3, kneeR: 4,
  shoulderL: 5, shoulderR: 6, elbowL: 7, elbowR: 8, spine: 9, head: 10,
};

// tone slots — which per-instance colour a vertex takes
const T = { skin: 0, hair: 1, top: 2, lower: 3, shoes: 4, eyeWhite: 5, eyeDark: 6, mouth: 7, accent: 8, sole: 9 };

const SKIN = [0xf2c9a4, 0xe0a877, 0xc78a5c, 0x9c6039, 0x6f4227, 0x4a2c1a, 0xf7d9bd, 0x8a5334];
const HAIR = [0x191725, 0x2c1c17, 0x4b2f22, 0x6b4431, 0xa8814f, 0xd7c0a5, 0x8d352a, 0x3b3b46];
const CLOTH = [
  0xff5f7e, 0x36e1c1, 0xffb45f, 0x5cbcff, 0x9b63ff, 0xff4fa3, 0x4deeea, 0xff755f,
  0xf5f2ff, 0x2f855a, 0xe8a13d, 0x6b4fa0, 0xc96f4a, 0x7ba05b, 0x8fb4c9, 0xb8452f,
];

// Optional parts are gated per instance so one shared geometry still produces a
// varied street: G_BUN/G_CAP/G_LONG pick one head style out of four (the fourth
// is plain), and G_BAG is rolled independently. A vertex whose gate does not
// match its instance collapses to a point and costs nothing to rasterise.
const G_ALWAYS = 0, G_BUN = 1, G_CAP = 2, G_LONG = 3, G_BAG = 4;

// -------------------------------------------------------------- body geometry
// A canonical 1.0-tall body. Per-instance scale is the person's height in world
// units, and the hero is 1.7, so the crowd must be authored around that or the
// city fills up with people who look like children.
function buildBodyGeometry() {
  const parts = [];

  // add(geometry, tone, jointA, jointB) — geometry must already be positioned.
  const add = (geo, tone, jointA = J.none, jointB = J.none, pivotA = [0, 0, 0], pivotB = [0, 0, 0], gate = G_ALWAYS) => {
    const n = geo.attributes.position.count;
    const aJointA = new Float32Array(n * 4);
    const aJointB = new Float32Array(n * 4);
    const aMeta = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      aJointA[i * 4] = pivotA[0]; aJointA[i * 4 + 1] = pivotA[1];
      aJointA[i * 4 + 2] = pivotA[2]; aJointA[i * 4 + 3] = jointA;
      aJointB[i * 4] = pivotB[0]; aJointB[i * 4 + 1] = pivotB[1];
      aJointB[i * 4 + 2] = pivotB[2]; aJointB[i * 4 + 3] = jointB;
      // tone in the low nibble, gate above it — one attribute instead of two
      aMeta[i] = tone + gate * 16;
    }
    geo.setAttribute('aJointA', new THREE.BufferAttribute(aJointA, 4));
    geo.setAttribute('aJointB', new THREE.BufferAttribute(aJointB, 4));
    geo.setAttribute('aMeta', new THREE.BufferAttribute(aMeta, 1));
    geo.deleteAttribute('uv');
    parts.push(geo);
  };

  const cyl = (rTop, rBot, h, seg, x, y, z) =>
    new THREE.CylinderGeometry(rTop, rBot, h, seg, 1).translate(x, y, z);
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const sph = (r, wSeg, hSeg, x, y, z, phiLen) =>
    new THREE.SphereGeometry(r, wSeg, hSeg, 0, Math.PI * 2, 0, phiLen ?? Math.PI).translate(x, y, z);

  const HIP_Y = 0.47, KNEE_Y = 0.26, SHOULDER_Y = 0.795, ELBOW_Y = 0.62;
  const legX = 0.065, armX = 0.115;

  // trunk
  add(box(0.20, 0.13, 0.13, 0, 0.505, 0), T.lower);
  add(cyl(0.12, 0.105, 0.26, 8, 0, 0.665, 0), T.top, J.spine, J.none, [0, 0.5, 0]);
  add(cyl(0.128, 0.128, 0.028, 8, 0, 0.792, 0), T.top, J.spine, J.none, [0, 0.5, 0]);   // collar
  add(cyl(0.04, 0.046, 0.06, 6, 0, 0.825, 0), T.skin, J.spine, J.none, [0, 0.5, 0]);

  // head — its own gentle counter-bob keeps the walk from looking rigid
  const HEAD = [0, 0.84, 0];
  const head = (geo, tone, gate = G_ALWAYS) => add(geo, tone, J.head, J.none, HEAD, [0, 0, 0], gate);
  head(sph(0.105, 7, 6, 0, 0.905, 0), T.skin);
  head(sph(0.113, 7, 5, 0, 0.912, 0, 1.18), T.hair);   // cap stops above the brow
  head(new THREE.ConeGeometry(0.016, 0.03, 4).rotateX(Math.PI / 2).translate(0, 0.902, 0.101), T.skin);
  // a face reads from surprisingly far away and is what stops a crowd looking
  // like mannequins; all of it rides the head joint, so it costs only vertices
  for (const side of [-1, 1]) {
    head(sph(0.028, 5, 4, side * 0.037, 0.926, 0.088), T.eyeWhite);
    head(sph(0.0125, 4, 3, side * 0.041, 0.925, 0.101), T.eyeDark);
    head(box(0.038, 0.009, 0.012, side * 0.04, 0.945, 0.094), T.hair);          // brow
    head(sph(0.026, 4, 3, side * 0.104, 0.905, 0.004), T.skin);                 // ear
  }
  head(box(0.042, 0.011, 0.011, 0, 0.868, 0.099), T.mouth);
  // one head style per person: bun, cap, long hair, or plain
  head(sph(0.055, 5, 4, 0, 0.972, -0.072), T.hair, G_BUN);
  head(cyl(0.100, 0.113, 0.055, 8, 0, 0.958, 0), T.accent, G_CAP);
  head(box(0.185, 0.015, 0.11, 0, 0.936, 0.10), T.accent, G_CAP);               // cap brim
  head(sph(0.098, 7, 6, 0, 0.858, -0.038), T.hair, G_LONG);                     // long hair

  for (const side of [-1, 1]) {
    const sh = side < 0 ? J.shoulderL : J.shoulderR;
    const el = side < 0 ? J.elbowL : J.elbowR;
    const hp = side < 0 ? J.hipL : J.hipR;
    const kn = side < 0 ? J.kneeL : J.kneeR;
    const shoulderPivot = [side * armX, SHOULDER_Y, 0];
    const elbowPivot = [side * (armX + 0.022), ELBOW_Y, 0];
    const hipPivot = [side * legX, HIP_Y, 0];
    const kneePivot = [side * legX, KNEE_Y, 0];

    add(cyl(0.033, 0.038, 0.175, 6, side * (armX + 0.012), 0.7075, 0), T.top, sh, J.none, shoulderPivot);
    add(sph(0.042, 5, 4, side * armX, 0.788, 0), T.top, sh, J.none, shoulderPivot);   // shoulder cap
    add(cyl(0.029, 0.033, 0.17, 6, side * (armX + 0.032), 0.535, 0), T.top, sh, el, shoulderPivot, elbowPivot);
    add(new THREE.CapsuleGeometry(0.032, 0.05, 3, 5)
      .translate(side * (armX + 0.038), 0.432, 0), T.skin, sh, el, shoulderPivot, elbowPivot);

    add(cyl(0.055, 0.048, 0.21, 6, side * legX, 0.365, 0), T.lower, hp, J.none, hipPivot);
    add(cyl(0.046, 0.04, 0.205, 6, side * legX, 0.1575, 0), T.lower, hp, kn, hipPivot, kneePivot);
    add(box(0.075, 0.048, 0.15, side * legX, 0.036, 0.026), T.shoes, hp, kn, hipPivot, kneePivot);
    add(box(0.079, 0.018, 0.158, side * legX, 0.009, 0.028), T.sole, hp, kn, hipPivot, kneePivot);
  }

  // a shoulder bag on roughly half the crowd — the single cheapest thing that
  // makes walkers read as commuters rather than as a character selection screen
  add(box(0.17, 0.21, 0.085, 0.155, 0.56, 0.02), T.accent, J.spine, J.none, [0, 0.5, 0], [0, 0, 0], G_BAG);
  add(box(0.026, 0.012, 0.19, 0.09, 0.735, 0.0), T.accent, J.spine, J.none, [0, 0.5, 0], [0, 0, 0], G_BAG);

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

// --------------------------------------------------------------- the material
// MeshToon keeps the city's stepped-light look; the injection adds the gait, the
// per-instance palette and a rim term so silhouettes read against dark streets.
function buildCrowdMaterial({ rimLight = true } = {}) {
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp() });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uRim = { value: rimLight ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        uniform float uTime;
        attribute vec4 aJointA;
        attribute vec4 aJointB;
        attribute float aMeta;     // tone + gate*16
        attribute vec4 aGait;       // x phase, y cadence, z walking, w seed
        attribute vec4 aPalette;    // skin, hair, top, lower — each RGB packed in one float
        attribute float aTrim;      // accent (cap / bag), same packing
        varying vec3 vTint;

        // WebGL2 only guarantees 16 vertex attributes and instanceMatrix eats
        // four of them, so the wardrobe travels as packed 8-bit-per-channel
        // floats rather than five separate vec3s. Exceeding the limit does not
        // throw — the program silently fails to link and the crowd vanishes.
        vec3 emUnpack(float v) {
          float r = floor(v / 65536.0);
          float g = floor(mod(v, 65536.0) / 256.0);
          float b = mod(v, 256.0);
          return vec3(r, g, b) / 255.0;
        }

        vec3 emRotX(vec3 p, float a) {
          float c = cos(a), s = sin(a);
          return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
        }
        vec3 emRotY(vec3 p, float a) {
          float c = cos(a), s = sin(a);
          return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
        }

        // gait scalar in [-1,1]; 0 when standing still
        float emGait() {
          return aGait.z * sin(uTime * aGait.y + aGait.x);
        }

        float emJointAngle(float kind, float g) {
          if (kind < 0.5) return 0.0;
          if (kind < 1.5) return  0.62 * g;                 // hip L
          if (kind < 2.5) return -0.62 * g;                 // hip R
          if (kind < 3.5) return -0.95 * max(0.0, -g) - 0.06; // knee L
          if (kind < 4.5) return -0.95 * max(0.0,  g) - 0.06; // knee R
          if (kind < 5.5) return -0.42 * g;                 // shoulder L
          if (kind < 6.5) return  0.42 * g;                 // shoulder R
          if (kind < 7.5) return -0.30 - 0.16 * g;          // elbow L
          if (kind < 8.5) return -0.30 + 0.16 * g;          // elbow R
          return 0.0;
        }

        // returns the transformed point; also rotates a direction when isNormal
        vec3 emApplyJoints(vec3 p, bool isNormal) {
          float g = emGait();
          float kb = aJointB.w, ka = aJointA.w;
          if (kb > 0.5) {
            float ang = emJointAngle(kb, g);
            vec3 base = isNormal ? vec3(0.0) : aJointB.xyz;
            p = emRotX(p - base, ang) + base;
          }
          if (ka > 0.5) {
            if (ka > 8.5 && ka < 9.5) {                     // spine twist
              vec3 base = isNormal ? vec3(0.0) : aJointA.xyz;
              p = emRotY(p - base, 0.10 * g) + base;
            } else if (ka > 9.5) {                          // head counter-bob
              vec3 base = isNormal ? vec3(0.0) : aJointA.xyz;
              p = emRotX(p - base, -0.05 * g) + base;
            } else {
              float ang = emJointAngle(ka, g);
              vec3 base = isNormal ? vec3(0.0) : aJointA.xyz;
              p = emRotX(p - base, ang) + base;
            }
          }
          return p;
        }
      `)
      .replace('#include <beginnormal_vertex>', /* glsl */`
        vec3 objectNormal = normalize(emApplyJoints(normal, true));
      `)
      .replace('#include <begin_vertex>', /* glsl */`
        vec3 transformed = emApplyJoints(position, false);
        // body bob: two steps per gait cycle, plus a breath while standing
        float bob = aGait.z * (0.012 - 0.012 * cos(2.0 * (uTime * aGait.y + aGait.x)));
        float breathe = (1.0 - aGait.z) * 0.004 * sin(uTime * 1.1 + aGait.x);
        transformed.y += bob + breathe;

        float aGate = floor(aMeta / 16.0);
        float aTone = aMeta - aGate * 16.0;

        // per-instance wardrobe: one head style out of four, bag rolled apart
        float emHeadStyle = floor(fract(aGait.w) * 4.0);
        float emHasBag = step(0.52, fract(aGait.w * 37.0));
        if (aGate > 0.5) {
          bool show = aGate > 3.5
            ? emHasBag > 0.5
            : abs(emHeadStyle - (aGate - 1.0)) < 0.5;
          if (!show) transformed = vec3(0.0);   // degenerate — never rasterised
        }

        vec3 emSkin = emUnpack(aPalette.x);
        vec3 emLower = emUnpack(aPalette.w);
        vTint = emUnpack(aPalette.z);
        if (aTone < 0.5) vTint = emSkin;
        else if (aTone < 1.5) vTint = emUnpack(aPalette.y);
        else if (aTone > 2.5 && aTone < 3.5) vTint = emLower;
        else if (aTone > 3.5 && aTone < 4.5) vTint = emLower * 0.42;
        else if (aTone > 4.5 && aTone < 5.5) vTint = vec3(0.93, 0.92, 0.89);   // sclera
        else if (aTone > 5.5 && aTone < 6.5) vTint = vec3(0.07, 0.06, 0.11);   // pupil
        else if (aTone > 6.5 && aTone < 7.5) vTint = emSkin * 0.62;            // mouth
        else if (aTone > 7.5 && aTone < 8.5) vTint = emUnpack(aTrim);          // cap / bag
        else if (aTone > 8.5) vTint = emLower * 0.22;                          // shoe sole
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        uniform float uRim;
        varying vec3 vTint;
      `)
      .replace('#include <color_fragment>', /* glsl */`
        diffuseColor.rgb *= vTint;
      `)
      .replace('#include <opaque_fragment>', /* glsl */`
        {
          // A cool rim keeps hundreds of small bodies legible against the
          // dark asphalt without paying for another light.
          float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
          outgoingLight += vec3(0.24, 0.62, 0.72) * rim * 0.55 * uRim;
        }
        #include <opaque_fragment>
      `);
  };
  // onBeforeCompile bodies are cached by this key; bump it when the shader changes
  mat.customProgramCacheKey = () => 'em-crowd-v2' + (rimLight ? 'r' : '');
  return mat;
}

// ----------------------------------------------------------------- blob shadow
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 3, 32, 32, 31);
  grad.addColorStop(0, 'rgba(4,9,24,0.5)');
  grad.addColorStop(1, 'rgba(4,9,24,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// ------------------------------------------------------------------ the crowd
export class Crowd {
  constructor(scene, { capacity = 340, rimLight = true } = {}) {
    this.scene = scene;
    this.capacity = capacity;
    this.count = 0;
    this.agents = [];
    this.free = [];
    this.dummy = new THREE.Object3D();
    this.time = 0;

    const geo = buildBodyGeometry();
    this.material = buildCrowdMaterial({ rimLight });
    this.material.userData.rim = rimLight;
    this.mesh = new THREE.InstancedMesh(geo, this.material, capacity);
    this.mesh.name = 'em-crowd';
    this.mesh.frustumCulled = false;          // instances span the whole city
    this.mesh.castShadow = false;             // blob shadows instead — 1 extra call
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const inst = (name, size) => {
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, attr);
      return attr;
    };
    this.aGait = inst('aGait', 4);
    this.aPalette = inst('aPalette', 4);
    this.aTrim = inst('aTrim', 1);
    scene.add(this.mesh);

    // one more draw call buys every walker a contact shadow
    this.shadowTex = blobTexture();
    const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(
      quad,
      new THREE.MeshBasicMaterial({
        map: this.shadowTex, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2,
      }),
      capacity,
    );
    this.shadows.name = 'em-crowd-shadows';
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 2;
    this.shadows.count = 0;
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.shadows);

    // Floating markers over the locals who have something to teach. One
    // instanced mesh for all of them, so a district full of street exercises
    // adds a single draw call.
    this.markerCap = 24;
    // A small gold dot — the same gold as the quest locals' ❗ discs in
    // markers.js, so one colour means "someone here has something for you".
    this.markers = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.13, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffbe72, toneMapped: false }),
      this.markerCap,
    );
    this.markers.name = 'em-crowd-markers';
    this.markers.frustumCulled = false;
    this.markers.count = 0;
    this.markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.markers);
    this.speakers = [];

    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
    this.slots = new Array(capacity).fill(null);
  }

  // speaker: { name, role, dialectCode, exercise, done } or null to clear
  setSpeaker(agent, speaker) {
    if (!agent) return;
    const had = !!agent.speaker;
    agent.speaker = speaker;
    if (speaker && !had) this.speakers.push(agent);
    else if (!speaker && had) {
      const i = this.speakers.indexOf(agent);
      if (i >= 0) this.speakers.splice(i, 1);
    }
  }

  // Nearest live street local with an exercise, within range. A despawned
  // agent is never returned, even if its last coordinates match.
  nearestSpeaker(pos, range = 2.9) {
    let best = null, bestD = range * range;
    for (const a of this.speakers) {
      if (!this.isLive(a)) continue;
      const dx = a.x - pos.x, dz = a.z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  get active() { return this.agents.length; }

  setCapacity(n) {
    this.visibleCap = Math.max(0, Math.min(n, this.capacity));
  }

  // Heights are METRES, matched to the cast already in the world: the player rig
  // is normalised to 1.7 and the authored teachers to 1.78. A canonical body is
  // 1.0 tall, so anything passed near 1.0 produces a city of children.
  static adultHeight(rng = Math.random) {
    if (rng() < 0.07) return 1.24 + rng() * 0.22;      // a few kids on the street
    return 1.58 + rng() * 0.28;                        // 1.58 – 1.86
  }

  // route: { points: [{x,z}...], closed, lane }  — agents advance along it
  spawn({ route, speed = 1.15, height = null, dialect = null, standing = false, at = 0 }) {
    const slot = this.free.pop();
    if (slot === undefined) return null;
    const seed = Math.random();
    const agent = {
      slot, route, speed, height: height ?? Crowd.adultHeight(), dialect, standing,
      t: at || Math.random() * routeLength(route),
      x: 0, z: 0, y: 0, heading: 0,
      phase: seed * Math.PI * 2,
      cadence: standing ? 0 : (5.0 + speed * 2.2 + seed * 0.9),
      walking: standing ? 0 : 1,
      lane: (Math.random() - 0.5) * 1.5,
      speaker: null,
      bubbleTimer: 4 + Math.random() * 20,
    };
    this.slots[slot] = agent;
    this.agents.push(agent);

    const pick = (arr) => arr[(Math.random() * arr.length) | 0];
    const c = new THREE.Color();
    const pack = (hex, mul = 1) => {
      c.set(hex).multiplyScalar(mul);
      const q = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
      return q(c.r) * 65536 + q(c.g) * 256 + q(c.b);
    };
    this.aPalette.setXYZW(slot,
      pack(pick(SKIN)), pack(pick(HAIR)), pack(pick(CLOTH)), pack(pick(CLOTH), 0.55));
    this.aPalette.needsUpdate = true;
    this.aTrim.setX(slot, pack(pick(CLOTH), 0.8));
    this.aTrim.needsUpdate = true;
    this.aGait.setXYZW(slot, agent.phase, agent.cadence, agent.walking, seed);
    this.aGait.needsUpdate = true;

    this._advance(agent, 0);
    return agent;
  }

  despawn(agent) {
    if (!agent || this.slots[agent.slot] !== agent) return;
    // a street local leaves the speaker roster with its body — otherwise dead
    // agents keep their marker slot and win the E prompt over empty pavement
    if (agent.speaker) this.setSpeaker(agent, null);
    this.slots[agent.slot] = null;
    this.free.push(agent.slot);
    const i = this.agents.indexOf(agent);
    if (i >= 0) this.agents.splice(i, 1);
    // park the instance under the map until the slot is reused
    this.dummy.position.set(0, -500, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(0.001);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(agent.slot, this.dummy.matrix);
    this.shadows.setMatrixAt(agent.slot, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  setWalking(agent, walking) {
    const w = walking ? 1 : 0;
    if (agent.walking === w) return;
    agent.walking = w;
    this.aGait.setZ(agent.slot, w);
    this.aGait.needsUpdate = true;
  }

  _advance(agent, dt) {
    const route = agent.route;
    if (!route || route.points.length < 2) return;
    const total = routeLength(route);
    if (!agent.standing) agent.t = (agent.t + agent.speed * dt) % total;
    const p = pointAt(route, agent.t);
    agent.x = p.x + p.nx * agent.lane;
    agent.z = p.z + p.nz * agent.lane;
    agent.heading = Math.atan2(p.dx, p.dz);
  }

  // playerPos may be null (e.g. during the loading tour).
  update(dt, playerPos, groundAt) {
    this.time += dt;
    const dummy = this.dummy;
    const cap = this.visibleCap ?? this.capacity;
    let drawn = 0, high = 0;
    const px = playerPos?.x ?? 0, pz = playerPos?.z ?? 0;

    // Nearest-first so the tier's budget is always spent on what the player can
    // actually see, not on whoever happened to spawn first.
    if (this.agents.length > cap && (this.sortTimer = (this.sortTimer || 0) - dt) <= 0) {
      this.sortTimer = 0.5;
      for (const a of this.agents) a._d = (a.x - px) * (a.x - px) + (a.z - pz) * (a.z - pz);
      this.agents.sort((m, n) => m._d - n._d);
    }

    for (const a of this.agents) {
      this._advance(a, dt);
      // only the player displaces people — no agent/agent checks at all
      if (playerPos) {
        const dx = a.x - px, dz = a.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.62 && d2 > 1e-5) {
          const d = Math.sqrt(d2);
          const push = (0.79 - d) / d;
          a.x += dx * push; a.z += dz * push;
        }
      }
      a.y = groundAt ? groundAt(a.x, a.z) : 0;

      if (a.slot + 1 > high) high = a.slot + 1;
      if (drawn >= cap) {
        // over budget for this tier: collapse the instance instead of leaving a
        // stale matrix behind, which would read as a frozen person in the street
        dummy.position.set(a.x, -500, a.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(a.slot, dummy.matrix);
        this.shadows.setMatrixAt(a.slot, dummy.matrix);
        continue;
      }
      dummy.position.set(a.x, a.y, a.z);
      dummy.rotation.set(0, a.heading, 0);
      dummy.scale.setScalar(a.height);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(a.slot, dummy.matrix);
      dummy.position.y = a.y + 0.02;
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.42 * a.height, 1, 0.42 * a.height);
      dummy.updateMatrix();
      this.shadows.setMatrixAt(a.slot, dummy.matrix);
      drawn++;
    }
    this.mesh.count = high;
    this.shadows.count = high;
    this.drawn = drawn;

    let markers = 0;
    for (const a of this.speakers) {
      if (markers >= this.markerCap) break;
      if (a.speaker?.done || !this.isLive(a)) continue;
      dummy.position.set(a.x, a.y + a.height * 1.16 + Math.sin(this.time * 2.2 + a.phase) * 0.09, a.z);
      dummy.rotation.set(0, this.time * 1.5 + a.phase, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.markers.setMatrixAt(markers++, dummy.matrix);
    }
    this.markers.count = markers;
    this.markers.instanceMatrix.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  setRimLight(on) {
    if (this.material.userData.rim === on) return;
    this.material.userData.rim = on;
    this.material.dispose();
    this.material = buildCrowdMaterial({ rimLight: on });
    this.material.userData.rim = on;
    this.mesh.material = this.material;
  }

  // True while this agent is still a live member of the crowd — a bubble or a
  // marker must let go the moment its district streams out.
  isLive(agent) { return !!agent && this.slots[agent.slot] === agent; }
}

// ------------------------------------------------------------------- routes
// A route is a closed polyline plus cached segment lengths. Agents index it by
// arc length so speed is uniform regardless of segment size.
export function makeRoute(points) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return { points, segs, total };
}

function routeLength(route) { return route?.total || 1; }

function pointAt(route, t) {
  const segs = route.segs;
  let s = t % route.total;
  if (s < 0) s += route.total;
  let seg = segs[0];
  for (let i = 0; i < segs.length; i++) {
    if (s >= segs[i].start && s < segs[i].start + segs[i].len) { seg = segs[i]; break; }
    seg = segs[i];
  }
  const local = Math.min(1, Math.max(0, (s - seg.start) / Math.max(seg.len, 1e-4)));
  const dx = (seg.b.x - seg.a.x) / Math.max(seg.len, 1e-4);
  const dz = (seg.b.z - seg.a.z) / Math.max(seg.len, 1e-4);
  return {
    x: seg.a.x + (seg.b.x - seg.a.x) * local,
    z: seg.a.z + (seg.b.z - seg.a.z) * local,
    dx, dz, nx: -dz, nz: dx,
  };
}
