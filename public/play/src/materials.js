// Shared look: toon v2 (tinted RGB ramp, warm key / cool shadow, sky-coloured
// Fresnel rim, projected cloud shadows, height fog, two-cascade shadow pick),
// the camera-anchored sky dome, billboard clouds, motes and blob shadows.
//
// Every toon material in the city goes through ONE onBeforeCompile hook
// (emToonCore) so the whole world shares one program family and one set of
// uniforms (EM) that daylight.js drives per time of day. Extra effects (wind,
// wet streets, dusk windows) are composable hooks layered on top of the core.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Ground tones are daylight albedos now (warm asphalt, stone pavers, real
// grass): the old near-black night values swallowed every cast shadow and read
// as tar under a golden sun. Night still darkens them through the lights.
export const PALETTE = {
  cream: 0xf5f2ff, terracotta: 0xff5f7e, sage: 0x36e1c1, amber: 0xffb45f,
  dustyBlue: 0x5cbcff, ink: 0x0a1024, purple: 0x9b63ff, road: 0x3b3d4e,
  sidewalk: 0x9a95a3, plaza: 0x8b8194, grass: 0x4d9a5e, curb: 0xc9c4cf,
  cyan: 0x4deeea, pink: 0xff4fa3, coral: 0xff755f, glass: 0x18274a,
};

// Shared clock uniform for wind/shader effects (ticked from main loop).
export const uTime = { value: 0 };

// ------------------------------------------------------------ shared uniforms
// One object, referenced by every hooked material, so daylight.js changes a
// value once and the whole city follows on the next frame.
export const EM = {
  uTime,
  uEmissiveGain: { value: 1 },                      // screens, neon, lit panes
  uRimColor: { value: new THREE.Color(0xbcd4ff) },   // sky colour at the rim
  uRimStrength: { value: 0.22 },
  uCloudShadow: { value: 0.32 },                     // 0 = no cloud shadows
  uCloudScale: { value: 0.009 },
  uFogHeight: { value: 3.0 },                        // fog starts thinning above
  uFogFalloff: { value: 0.045 },
  uFogHighFloor: { value: 0.32 },                    // fog fraction kept at altitude
  uWetGlobal: { value: 0 },                          // wet-street strength (night)
  uWindowLit: { value: 0.08 },                       // dusk-window lit probability
  uWindowGlowA: { value: new THREE.Color(0xffd9a0) },
  uWindowGlowB: { value: new THREE.Color(0xffb070) },
  uWindowGlow: { value: 0.35 },
  uCsmSplit: { value: 22 },                          // view depth where cascade 2 takes over
  uSkyHorizon: { value: new THREE.Color(0xffd0b0) }, // what wet puddles reflect
  uSkyZenith: { value: new THREE.Color(0x3d6fd6) },
};

// ----------------------------------------------------------------- toon ramp
// Stepped RGB ramp: the darkest step is TINTED violet, not merely darker, so
// the shadow side of a wall reads as sky-lit rather than as mud. Read as .rgb
// by the patched getGradientIrradiance below (three reads only .r by default).
let _ramp = null;
export function toonRamp() {
  if (_ramp) return _ramp;
  const steps = [
    [0.26, 0.23, 0.42],    // facing away: violet shadow
    [0.58, 0.55, 0.70],    // just past the terminator
    [0.90, 0.89, 0.92],    // lit
    [1.00, 1.00, 1.00],    // full sun
  ];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((s, i) => { data[i * 4] = s[0] * 255; data[i * 4 + 1] = s[1] * 255; data[i * 4 + 2] = s[2] * 255; data[i * 4 + 3] = 255; });
  _ramp = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  _ramp.minFilter = THREE.NearestFilter;
  _ramp.magFilter = THREE.NearestFilter;
  _ramp.needsUpdate = true;
  return _ramp;
}

// ------------------------------------------------------------ toon v2 core
// The lights_fragment_begin chunk with two edits: every directional light is
// modulated by the projected cloud shadow, and when two shadow-casting suns
// exist (the near/far cascades in daylight.js) the fragment picks ONE shadow
// map by view depth instead of receiving light from both.
const LIGHTS_BEGIN_EM = THREE.ShaderChunk.lights_fragment_begin
  .replace('getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= emCloud;')
  .replace(
    /directLight\.color \*= \( directLight\.visible && receiveShadow \) \? getShadow\( directionalShadowMap\[ i \][^;]*;/,
    /* glsl */`
		#if NUM_DIR_LIGHT_SHADOWS > 1
			if ( UNROLLED_LOOP_INDEX == 0 ) {
				float emDepth = -geometryPosition.z;
				float emShadow = 1.0;
				if ( emDepth < uCsmSplit - 2.0 ) {
					emShadow = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
				} else if ( emDepth > uCsmSplit ) {
					emShadow = getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] );
				} else {
					float emNear = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
					float emFar = getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] );
					emShadow = mix( emNear, emFar, ( emDepth - uCsmSplit + 2.0 ) * 0.5 );
				}
				directLight.color *= ( directLight.visible && receiveShadow ) ? emShadow : 1.0;
			}
		#else
			directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif`);

const EM_NOISE_GLSL = /* glsl */`
  float emH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float emNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(emH(i), emH(i + vec2(1.0, 0.0)), f.x),
               mix(emH(i + vec2(0.0, 1.0)), emH(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

function emToonCore(shader) {
  Object.assign(shader.uniforms, EM);
  if (!shader.uniforms.uRimScale) shader.uniforms.uRimScale = { value: 1 };

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vEmWP;')
    .replace('#include <project_vertex>', /* glsl */`#include <project_vertex>
      #ifdef USE_INSTANCING
        vEmWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vEmWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`);

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', /* glsl */`#include <common>
      varying vec3 vEmWP;
      uniform float uEmissiveGain;
      uniform vec3 uRimColor;
      uniform float uRimStrength;
      uniform float uRimScale;
      uniform float uCloudShadow;
      uniform float uCloudScale;
      uniform float uFogHeight;
      uniform float uFogFalloff;
      uniform float uFogHighFloor;
      uniform float uCsmSplit;
      uniform float uTime;
      ${EM_NOISE_GLSL}`)
    // RGB ramp so the dark step carries a hue
    .replace('#include <gradientmap_pars_fragment>', /* glsl */`
      #ifdef USE_GRADIENTMAP
        uniform sampler2D gradientMap;
      #endif
      vec3 getGradientIrradiance(vec3 normal, vec3 lightDirection) {
        float dotNL = dot(normal, lightDirection);
        vec2 coord = vec2(dotNL * 0.5 + 0.5, 0.5);
        #ifdef USE_GRADIENTMAP
          return texture2D(gradientMap, coord).rgb;
        #else
          return mix(vec3(0.3, 0.27, 0.45), vec3(1.0), smoothstep(0.45, 0.55, coord.x));
        #endif
      }`)
    // shared emissive gain: screens, neon, lit panes brighten together
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= uEmissiveGain;')
    // cloud shadow scalar + cascade pick
    .replace('#include <lights_fragment_begin>', /* glsl */`
      float emCloud = 1.0;
      if (uCloudShadow > 0.001) {
        vec2 emCp = vEmWP.xz * uCloudScale;
        float emCn = emNoise(emCp + uTime * vec2(0.011, 0.006)) * 0.62
                   + emNoise(emCp * 2.6 + uTime * vec2(-0.005, 0.012)) * 0.38;
        emCloud = mix(1.0 - uCloudShadow, 1.0, smoothstep(0.40, 0.66, emCn));
      }
      ${LIGHTS_BEGIN_EM}`)
    // sky-coloured Fresnel rim on everything (scaled per material)
    .replace('#include <opaque_fragment>', /* glsl */`
      {
        vec3 emN = normalize(vNormal);
        vec3 emV = normalize(vViewPosition);
        float emRim = pow(1.0 - saturate(dot(emN, emV)), 3.2);
        outgoingLight += uRimColor * emRim * uRimStrength * uRimScale;
      }
      #include <opaque_fragment>`)
    // height fog: streets haze, towers stay crisp
    .replace('#include <fog_fragment>', /* glsl */`
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        #else
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        float emHf = exp(-max(vEmWP.y - uFogHeight, 0.0) * uFogFalloff);
        fogFactor *= mix(uFogHighFloor, 1.0, emHf);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
      #endif`);
}

// Compose hooks: extra effects run first (they inject just before the
// includes they care about), the core runs last so its declarations land
// nearest to <common>, ahead of anything that references them.
function installHook(material) {
  if (material.userData.emToon) return material;
  const prior = material.onBeforeCompile;
  const priorKey = material.customProgramCacheKey?.bind(material);
  material.userData.emToon = true;
  material.userData.emHooks = [];
  material.userData.emRimScale = { value: material.userData.emRimScale?.value ?? 1 };
  material.onBeforeCompile = (shader, renderer) => {
    if (prior && prior !== THREE.Material.prototype.onBeforeCompile) prior(shader, renderer);
    for (const h of material.userData.emHooks) h.fn(shader);
    emToonCore(shader);
    shader.uniforms.uRimScale = material.userData.emRimScale;
  };
  material.customProgramCacheKey = () => {
    const base = priorKey ? priorKey() : '';
    return `em-toon-v2|${base}|${material.userData.emHooks.map((h) => h.name).join('|')}`;
  };
  return material;
}

function pushHook(material, name, fn) {
  installHook(material);
  material.userData.emHooks.push({ name, fn });
  material.needsUpdate = true;
  return material;
}

// Retrofit a MeshToonMaterial made elsewhere (hero, terrain, crowd) so it joins
// the shared look. Safe to call twice.
export function wrapToonHook(material, { rim = 1 } = {}) {
  if (!material || !material.isMeshToonMaterial) return material;
  if (!material.gradientMap) material.gradientMap = toonRamp();
  installHook(material);
  material.userData.emRimScale.value = rim;
  return material;
}

// Sweep a scene for toon materials that skipped the factories below.
export function adoptToonMaterials(root) {
  let n = 0;
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m && m.isMeshToonMaterial && !m.userData.emToon) { wrapToonHook(m, { rim: o.isSkinnedMesh ? 1 : 0.4 }); n++; }
    }
  });
  return n;
}

export function toonMat(color, opts = {}) {
  const { rim = 0.4, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...rest });
  installHook(m);
  m.userData.emRimScale.value = rim;
  return m;
}

// A toon material that takes its colour from the vertex stream. Used with
// GeoBatch so dozens of differently-tinted surfaces can share one draw call.
export function toonVertexMat(opts = {}) {
  const { rim = 0.4, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({
    color: 0xffffff, vertexColors: true, gradientMap: toonRamp(), ...rest,
  });
  installHook(m);
  m.userData.emRimScale.value = rim;
  return m;
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

// ------------------------------------------------------------- emissive gain
// Every emissive surface in the city follows ONE gain so the hierarchy holds
// under the post stack: with postfx on, the scene renders linear and ACES runs
// over everything in the composite, so anything authored at 1.0 comes out dull
// and never crosses the bloom threshold. The gain lifts neon, screens, lit
// panes and headlights together, and daylight.js retunes it by time of day.
//
//   neonMat(color, opacity)     unlit MeshBasicMaterial that follows the gain
//   withEmissiveGain(material)  make any MeshBasic / MeshStandard follow it
//                               (screens, tickers, headlights, lit panes)
//   setNeonGain(g)              legacy name, sets the shared gain
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
  EM.uEmissiveGain.value = gain;
  if (gain === neonGain) return;
  neonGain = gain;
  for (const mat of NEON_REGISTRY) {
    const base = mat.userData.neonBase;
    if (base) mat.color.copy(base).multiplyScalar(gain);
  }
}
export const setEmissiveGain = setNeonGain;
export function emissiveGain() { return neonGain; }

// Shader-side gain for materials that carry textures (screens, tickers) or a
// PBR emissive term (glass, lit panes): the colour cannot simply be scaled.
export function withEmissiveGain(material, { scale = 1 } = {}) {
  if (!material || material.userData.emEmissive) return material;
  material.userData.emEmissive = true;
  const prior = material.onBeforeCompile;
  const priorKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    if (prior && prior !== THREE.Material.prototype.onBeforeCompile) prior(shader, renderer);
    shader.uniforms.uEmissiveGain = EM.uEmissiveGain;
    shader.uniforms.uEmScale = { value: scale };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uEmissiveGain;\nuniform float uEmScale;');
    if (material.isMeshBasicMaterial) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <opaque_fragment>', 'outgoingLight *= uEmissiveGain * uEmScale;\n#include <opaque_fragment>');
    } else {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= uEmissiveGain * uEmScale;');
    }
  };
  material.customProgramCacheKey = () => `${priorKey ? priorKey() : ''}|em-emissive-v1`;
  material.needsUpdate = true;
  return material;
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
    // Gentle saturation lift so Meshy bakes sit in the graded palette.
    const hsl = {};
    mat.color.getHSL(hsl);
    mat.color.setHSL(hsl.h, Math.min(1, hsl.s * saturate), Math.min(1, hsl.l * brighten));
    installHook(mat);
    mat.userData.emRimScale.value = o.isSkinnedMesh ? 1 : 0.6;
    o.material = mat;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return root;
}

// Vertex-shader wind sway for instanced foliage: gentle world-position-phased
// lean, stronger toward the top of each instance.
export function addWindSway(material, amp = 0.09) {
  return pushHook(material, `wind${amp.toFixed(3)}`, (shader) => {
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
  });
}

// Procedural windows for the instanced skyline. The grid is built in the
// tower's OBJECT space (instance-local position), so panes stay aligned on
// randomly rotated towers instead of shearing across them. Lit probability and
// glow colour follow the time of day through the shared uniforms.
export function addDuskWindows(material) {
  return pushHook(material, 'dusk', (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmLocal;\nvarying vec3 vEmScale;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vEmLocal = position;
        #ifdef USE_INSTANCING
          vEmScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #else
          vEmScale = vec3(1.0);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vEmLocal;
        varying vec3 vEmScale;
        uniform float uWindowLit;
        uniform vec3 uWindowGlowA;
        uniform vec3 uWindowGlowB;
        uniform float uWindowGlow;
        float emHashW(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <opaque_fragment>', `
        {
          // object-space metres on the tower's own faces (unit box scaled)
          vec3 om = vEmLocal * vEmScale;
          vec3 nrm = normalize(cross(dFdx(om), dFdy(om)));
          float facade = 1.0 - abs(nrm.y);                       // walls only
          float hFade = smoothstep(2.6, 5.5, vEmWP.y);
          float along = abs(nrm.x) > abs(nrm.z) ? om.z : om.x;
          vec2 grid = vec2(along * 0.55, om.y * 0.42);
          vec2 cell = floor(grid);
          vec2 f = fract(grid);
          float inWin = step(0.30, f.x) * step(f.x, 0.72) * step(0.34, f.y) * step(f.y, 0.70);
          float win = inWin * facade * hFade;
          // every window is glass — cool dark pane even when nobody's home
          outgoingLight = mix(outgoingLight, outgoingLight * 0.34 + vec3(0.03, 0.06, 0.11), win * 0.9);
          float band = smoothstep(0.93, 1.0, f.y) * facade * hFade;
          outgoingLight *= 1.0 - band * 0.16;
          float hsh = emHashW(cell + vec2(floor(nrm.x * 3.0), floor(nrm.z * 3.0)));
          float lit = step(1.0 - uWindowLit, hsh);
          float temperature = step(0.5, emHashW(cell + vec2(13.0, 7.0)));
          vec3 windowGlow = mix(uWindowGlowA, uWindowGlowB, temperature);
          outgoingLight += windowGlow * win * lit * uWindowGlow * uEmissiveGain;
        }
        #include <opaque_fragment>`);
  });
}

// ------------------------------------------------------------- wet streets
// A night city reads as expensive mostly because the ground answers the lights.
// Real screen-space reflections are out of reach on the devices this has to run
// on, so the road shades itself: a world-space puddle mask, a Fresnel term that
// only kicks in at grazing angles, a sky term from the same colours as the
// dome, and vertical neon smears whose colour is stable per band of street.
// Strength is the material's own × the shared uWetGlobal (0 by day).
export function addWetStreets(material, { strength = 0.85 } = {}) {
  return pushHook(material, 'wet', (shader) => {
    shader.uniforms.uWet = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        uniform float uWet;
        uniform float uWetGlobal;
        uniform vec3 uSkyHorizon;
        uniform vec3 uSkyZenith;
      `)
      .replace('#include <opaque_fragment>', /* glsl */`
        if (uWetGlobal > 0.001) {
          vec3 V = normalize(cameraPosition - vEmWP);
          float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);

          // where the road is wet at all — broad damp patches, not polka dots
          float damp = emNoise(vEmWP.xz * 0.075) * 0.65 + emNoise(vEmWP.xz * 0.21) * 0.35;
          float wet = smoothstep(0.44, 0.78, damp) * uWet * uWetGlobal;

          // the sky the puddle can see, matched to the dome's own gradient
          vec3 skyRefl = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.5, V.y)) * 0.55;

          // neon smears: colour is constant across a band of street and streaks
          // along it, which is what a reflected sign actually looks like
          float bandId = floor(vEmWP.x * 0.21 + vEmWP.z * 0.06);
          float bandLit = step(0.66, emH(vec2(bandId, 3.0)));
          vec3 neon = mix(vec3(0.16, 0.88, 0.96), vec3(1.0, 0.30, 0.60),
                          step(0.5, emH(vec2(bandId, 7.0))));
          float streak = emNoise(vec2(vEmWP.x * 1.6, vEmWP.z * 0.16 + uTime * 0.03));
          streak = smoothstep(0.55, 0.98, streak) * bandLit;

          float mask = wet * mix(0.10, 0.82, fres);
          outgoingLight = mix(outgoingLight, outgoingLight * 0.52 + skyRefl, mask);
          outgoingLight += neon * streak * mask * 0.55 * uEmissiveGain;
        }
        #include <opaque_fragment>
      `);
  });
}

// ------------------------------------------------------------------- sky
// Gradient dome with sun disc, horizon glow and stars — one draw call, no
// textures. The vertex shader pins the dome to the far plane (z = w) so it can
// never be far-clipped on any tier, and daylight.js re-centres it on the
// camera every frame so the gradient is always around the viewer.
export const SKY_DEFAULTS = {
  top: 0x2f5fc7, mid: 0x8fb5ee, bot: 0xffd7b8, glow: 0xff9a5c,
};

export function makeSky() {
  const geo = new THREE.SphereGeometry(400, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(SKY_DEFAULTS.top) },
      midColor: { value: new THREE.Color(SKY_DEFAULTS.mid) },
      botColor: { value: new THREE.Color(SKY_DEFAULTS.bot) },
      glowColor: { value: new THREE.Color(SKY_DEFAULTS.glow) },
      glowStrength: { value: 0.55 },
      sunDir: { value: new THREE.Vector3(-0.5, 0.67, -0.5).normalize() },
      sunColor: { value: new THREE.Color(0xffe2c4) },
      sunStrength: { value: 1.0 },
      sunSize: { value: 0.99965 },
      stars: { value: 0 },
      uTime,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // pin to the far plane: the dome is a backdrop, never geometry
        p.z = p.w * 0.99999;
        gl_Position = p;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor, midColor, botColor, glowColor, sunColor;
      uniform vec3 sunDir;
      uniform float glowStrength, sunStrength, sunSize, stars, uTime;
      varying vec3 vDir;
      float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.1, 1.0);
        vec3 sky = mix(mix(botColor, midColor, smoothstep(-0.1, 0.20, h)), topColor, smoothstep(0.20, 0.85, h));
        // warm band along the horizon, strongest toward the sun
        vec2 dxz = normalize(d.xz + vec2(1e-4));
        vec2 sxz = normalize(sunDir.xz + vec2(1e-4));
        float toward = 0.55 + 0.45 * max(dot(dxz, sxz), 0.0);
        float horizon = 1.0 - smoothstep(-0.03, 0.28, abs(d.y));
        sky += glowColor * horizon * glowStrength * toward;
        // sun disc + halo from the SAME vector the shadows use
        float s = dot(d, sunDir);
        float disc = smoothstep(sunSize - 0.0004, sunSize + 0.0001, s);
        float halo = pow(max(s, 0.0), 90.0) * 0.5 + pow(max(s, 0.0), 12.0) * 0.12;
        sky += sunColor * (disc * 2.4 + halo) * sunStrength;
        // stars: point lights on a direction grid, only above the haze
        if (stars > 0.001 && d.y > 0.02) {
          vec3 g = d * 160.0;
          vec3 cell = floor(g);
          vec3 f = fract(g) - 0.5;
          float r = h3(cell);
          float twinkle = 0.75 + 0.25 * sin(uTime * (1.5 + r * 3.0) + r * 40.0);
          float star = smoothstep(0.93, 1.0, r) * (1.0 - smoothstep(0.0, 0.22, length(f))) * twinkle;
          sky += vec3(0.9, 0.93, 1.0) * star * stars * smoothstep(0.02, 0.25, d.y) * 1.6;
        }
        gl_FragColor = vec4(sky, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'em-sky';
  sky.frustumCulled = false;
  sky.renderOrder = 100;          // after the city: only uncovered pixels pay
  sky.matrixAutoUpdate = true;
  return sky;
}

// JS mirror of the dome gradient at a given elevation (unit y), used to set
// the fog colour to exactly what the horizon shows. `out` is a THREE.Color.
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function sstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
export function skyColorAt(uniforms, y, out = new THREE.Color()) {
  const h = Math.min(1, Math.max(-0.1, y));
  _c1.copy(uniforms.botColor.value).lerp(uniforms.midColor.value, sstep(-0.1, 0.2, h));
  out.copy(_c1).lerp(uniforms.topColor.value, sstep(0.2, 0.85, h));
  const horizon = 1 - sstep(-0.03, 0.28, Math.abs(y));
  _c2.copy(uniforms.glowColor.value).multiplyScalar(horizon * uniforms.glowStrength.value * 0.75);
  out.add(_c2);
  return out;
}

// ------------------------------------------------------------ blob shadow
// Soft radial contact shadow. ALL blobs share one material, so the tiers that
// draw real shadow maps hide every blob with a single flag instead of
// carrying two shadows per character.
let _blobTex = null;
function blobTexture() {
  if (_blobTex) return _blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(18,12,40,0.55)');
  grad.addColorStop(1, 'rgba(18,12,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _blobTex = new THREE.CanvasTexture(c);
  _blobTex.colorSpace = THREE.SRGBColorSpace;
  return _blobTex;
}

let _blobMat = null;
export function blobMaterial() {
  if (_blobMat) return _blobMat;
  _blobMat = new THREE.MeshBasicMaterial({
    map: blobTexture(), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  return _blobMat;
}

export function setBlobShadowsVisible(on) {
  blobMaterial().visible = !!on;
}

export function blobShadow(radius = 0.6) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), blobMaterial());
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;             // above every road/paver layer (district ROAD_Y 0.052)
  m.renderOrder = 2;
  m.userData.disposeWithNpc = true;
  m.userData.blobShadow = true;
  return m;
}

// --------------------------------------------------------------- clouds
// Soft layered billboards: one InstancedMesh, one procedural alpha texture,
// lit side toward the sun, shaded side cool. Slow parallax drift; far clouds
// fade toward the horizon colour.
function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 128);
  const puff = (x, y, r, a) => {
    const grad = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${a * 0.75})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  puff(128, 78, 60, 0.95); puff(84, 70, 44, 0.9); puff(176, 66, 46, 0.9);
  puff(56, 86, 30, 0.85); puff(206, 86, 30, 0.85); puff(118, 46, 34, 0.8); puff(156, 44, 30, 0.75);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeClouds(clusters = 14) {
  const layersPer = 3;
  const count = clusters * layersPer;
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      map: { value: cloudTexture() },
      uLit: { value: new THREE.Color(0xfff2e2) },
      uShade: { value: new THREE.Color(0x9aa6d8) },
      uHorizon: { value: new THREE.Color(0xffd7b8) },
      uSunDir: { value: new THREE.Vector3(-0.5, 0.67, -0.5).normalize() },
      uOpacity: { value: 0.92 },
    },
    vertexShader: /* glsl */`
      attribute vec2 aSeed;   // x: layer 0..1 (front→back), y: random
      varying vec2 vUv;
      varying float vLit;
      varying float vFade;
      varying float vSeed;
      uniform vec3 uSunDir;
      void main() {
        vUv = uv;
        vSeed = aSeed.y;
        vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 sx = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), 1.0);
        // camera-facing billboard: offset in view space
        centre.xy += position.xy * sx.xy;
        gl_Position = projectionMatrix * centre;
        // which side of the puff faces the sun (in view space)
        vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
        vLit = clamp(0.5 + 0.9 * dot(normalize(vec3(position.xy, 0.55)), sunV), 0.0, 1.0);
        vFade = smoothstep(900.0, 350.0, -centre.z);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      uniform vec3 uLit, uShade, uHorizon;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vLit, vFade, vSeed;
      void main() {
        float a = texture2D(map, vUv).a;
        // two-tone puff: lit rim toward the sun, cool belly
        vec3 col = mix(uShade, uLit, smoothstep(0.25, 0.85, vLit + (vUv.y - 0.5) * 0.6));
        col = mix(uHorizon, col, vFade * 0.75 + 0.25);
        a = smoothstep(0.02, 0.5, a) * uOpacity * (0.6 + 0.4 * vFade);
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.name = 'em-clouds';
  inst.frustumCulled = false;
  inst.renderOrder = 90;
  const seeds = new Float32Array(count * 2);
  const M = new THREE.Matrix4();
  const defs = [];
  let i = 0;
  for (let cl = 0; cl < clusters; cl++) {
    const cx = (Math.random() - 0.5) * 900;
    const cz = (Math.random() - 0.5) * 900;
    const cy = 110 + Math.random() * 90;
    const spd = 0.9 + Math.random() * 1.3;
    const w = 70 + Math.random() * 90;
    for (let p = 0; p < layersPer; p++, i++) {
      const ox = (Math.random() - 0.5) * w * 0.5;
      const oz = (p - 1) * 26;                   // depth layers for parallax
      const oy = (Math.random() - 0.5) * 12;
      const s = w * (0.55 + Math.random() * 0.5);
      defs.push({ cx, cz, cy, ox, oz, oy, w: s, h: s * 0.42, spd: spd * (1 + p * 0.12) });
      seeds[i * 2] = p / (layersPer - 1);
      seeds[i * 2 + 1] = Math.random();
    }
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 2));
  inst.userData.update = (t) => {
    for (let k = 0; k < defs.length; k++) {
      const d = defs[k];
      let x = d.cx + d.ox + t * d.spd;
      x = ((x + 500) % 1000) - 500;             // wrap across the sky
      M.makeScale(d.w, d.h, 1).setPosition(x, d.cy + d.oy, d.cz + d.oz);
      inst.setMatrixAt(k, M);
    }
    inst.instanceMatrix.needsUpdate = true;
  };
  inst.userData.update(0);
  return inst;
}

// Floating motes — soft additive points drifting around the plaza; the colour
// follows the time of day (warm pollen by day, cyan sparks at night).
function moteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeDustMotes(count = 160, range = 64) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * range;
    pos[i * 3 + 1] = 0.4 + Math.random() * 6.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * range;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffd28a, size: 0.26, transparent: true, opacity: 0.55, map: moteTexture(),
    sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'em-motes';
  pts.userData.update = (t) => { pts.position.y = Math.sin(t * 0.25) * 0.35; pts.rotation.y = t * 0.012; };
  return pts;
}
