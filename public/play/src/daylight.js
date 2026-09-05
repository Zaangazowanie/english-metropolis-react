// Time-of-day controller. One sun vector drives everything that has to agree:
// the shadow-casting light(s), the sky-dome disc, the hemisphere fill, the fog
// colour (sampled from the dome's own horizon), exposure, bloom threshold, the
// shared emissive gain, dusk-window probability, wet-street strength and the
// PMREM environment that gives chrome something to reflect.
//
// Presets crossfade (~4 s). Default is golden hour; the site theme
// (localStorage 'em.v3.mode' === 'night') selects night, and N / the HUD
// button toggle between the two. After ~14 min of golden play the light
// drifts toward dusk over six minutes.
import * as THREE from 'three';
import { EM, setNeonGain, skyColorAt } from './materials.js';

const DEG = Math.PI / 180;

// Colours are sRGB hex (THREE.Color converts); everything blends in linear.
const PRESETS = {
  golden: {
    sunColor: 0xffdcb8, sunIntensity: 2.05, sunEl: 43 * DEG, sunAz: -128 * DEG,
    hemiSky: 0xb9ceff, hemiGround: 0x9a6a52, hemiIntensity: 0.5, shadowIntensity: 0.8,
    skyTop: 0x2c5cc4, skyMid: 0x8fb5ee, skyBot: 0xffd2b0, glow: 0xff9a5c, glowStrength: 0.55,
    sunDisc: 1.0, stars: 0,
    fogMul: 1.0, fogHighFloor: 0.30,
    exposure: 1.0, bloomThreshold: 0.92, bloomStrength: 0.55,
    emissiveGain: 1.0, windowLit: 0.06, windowGlow: 0.25, wet: 0.0, cloudShadow: 0.34,
    rimColor: 0xbcd4ff, rimStrength: 0.22,
    ink: 0x3a2a4a, shadowTint: [0.94, 0.95, 1.06], highTint: [1.06, 1.0, 0.94], saturation: 1.08,
    cloudLit: 0xfff1de, cloudShade: 0xa9b3de, mote: 0xffd28a, moteOpacity: 0.55,
  },
  day: {
    sunColor: 0xfff4e4, sunIntensity: 1.95, sunEl: 62 * DEG, sunAz: -150 * DEG,
    hemiSky: 0xbfd8ff, hemiGround: 0x8c7a6a, hemiIntensity: 0.5, shadowIntensity: 0.82,
    skyTop: 0x2a63d8, skyMid: 0x7fb4f5, skyBot: 0xdcecff, glow: 0xffe6c8, glowStrength: 0.25,
    sunDisc: 1.0, stars: 0,
    fogMul: 0.9, fogHighFloor: 0.28,
    exposure: 1.0, bloomThreshold: 0.95, bloomStrength: 0.45,
    emissiveGain: 0.9, windowLit: 0.03, windowGlow: 0.15, wet: 0.0, cloudShadow: 0.30,
    rimColor: 0xc9dcff, rimStrength: 0.18,
    ink: 0x2c2a44, shadowTint: [0.95, 0.96, 1.05], highTint: [1.03, 1.0, 0.97], saturation: 1.06,
    cloudLit: 0xffffff, cloudShade: 0xb6c3e6, mote: 0xfff0c0, moteOpacity: 0.4,
  },
  dusk: {
    sunColor: 0xffa070, sunIntensity: 1.55, sunEl: 13 * DEG, sunAz: -118 * DEG,
    hemiSky: 0x7f74d8, hemiGround: 0x4a3252, hemiIntensity: 0.5, shadowIntensity: 0.85,
    skyTop: 0x1c2a6a, skyMid: 0x8a5fb0, skyBot: 0xff8a6a, glow: 0xff6a3a, glowStrength: 0.75,
    sunDisc: 1.0, stars: 0.25,
    fogMul: 1.1, fogHighFloor: 0.34,
    exposure: 1.02, bloomThreshold: 0.84, bloomStrength: 0.65,
    emissiveGain: 1.65, windowLit: 0.55, windowGlow: 0.5, wet: 0.45, cloudShadow: 0.18,
    rimColor: 0xd7a0ff, rimStrength: 0.26,
    ink: 0x2a1c44, shadowTint: [0.9, 0.9, 1.1], highTint: [1.08, 0.98, 0.94], saturation: 1.1,
    cloudLit: 0xffb08a, cloudShade: 0x6a5aa8, mote: 0xffb090, moteOpacity: 0.5,
  },
  night: {
    sunColor: 0x9fb4ff, sunIntensity: 0.62, sunEl: 36 * DEG, sunAz: -128 * DEG,
    hemiSky: 0x6e7ad6, hemiGround: 0x2a1c44, hemiIntensity: 0.55, shadowIntensity: 0.9,
    skyTop: 0x050816, skyMid: 0x182a56, skyBot: 0x5b3f8a, glow: 0xff5c9a, glowStrength: 0.42,
    sunDisc: 0.35, stars: 1,
    fogMul: 1.0, fogHighFloor: 0.36,
    exposure: 1.06, bloomThreshold: 0.78, bloomStrength: 0.82,
    emissiveGain: 2.15, windowLit: 0.46, windowGlow: 0.82, wet: 0.85, cloudShadow: 0.10,
    rimColor: 0x7fd9ff, rimStrength: 0.3,
    ink: 0x0a0a22, shadowTint: [0.9, 0.93, 1.06], highTint: [1.05, 0.99, 0.96], saturation: 1.06,
    cloudLit: 0x7f86c0, cloudShade: 0x1c1d3f, mote: 0x77f7ee, moteOpacity: 0.5,
  },
};

const COLOR_KEYS = ['sunColor', 'hemiSky', 'hemiGround', 'skyTop', 'skyMid', 'skyBot', 'glow', 'rimColor', 'ink', 'cloudLit', 'cloudShade', 'mote'];
const VEC_KEYS = ['shadowTint', 'highTint'];

function materialise(p) {
  const out = {};
  for (const k of Object.keys(p)) {
    if (COLOR_KEYS.includes(k)) out[k] = new THREE.Color(p[k]);
    else if (VEC_KEYS.includes(k)) out[k] = new THREE.Vector3().fromArray(p[k]);
    else out[k] = p[k];
  }
  return out;
}

function blend(a, b, t, out) {
  for (const k of Object.keys(a)) {
    const va = a[k], vb = b[k];
    if (va instanceof THREE.Color) (out[k] ||= new THREE.Color()).copy(va).lerp(vb, t);
    else if (va instanceof THREE.Vector3) (out[k] ||= new THREE.Vector3()).copy(va).lerp(vb, t);
    else out[k] = va + (vb - va) * t;
  }
  return out;
}

const ease = (t) => t * t * (3 - 2 * t);

export class Daylight {
  // sun: near cascade DirectionalLight; sunFar: second cascade (intensity 0,
  // shadow only); hemi: HemisphereLight; sky: makeSky() mesh; clouds/motes:
  // optional world objects looked up lazily by name.
  constructor({ scene, renderer, camera, sun, sunFar, hemi, sky, postfx = null }) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.sun = sun;
    this.sunFar = sunFar;
    this.hemi = hemi;
    this.sky = sky;
    this.postfx = postfx;
    this.presets = Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, materialise(v)]));
    this.mode = 'golden';
    this.from = this.presets.golden;
    this.to = this.presets.golden;
    this.t = 1;
    this.fade = 4;
    this.cur = blend(this.from, this.to, 1, {});
    this.drift = 0;                  // golden → dusk drift 0..1
    this.playtime = 0;
    this.userPinned = false;
    this.fogBase = 0.0052;
    this.tier = { shadows: 2048, cascades: 1, shadowRadius: 2 };
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.envTimer = 0;
    this.envStage = 0;
    this._warm = new THREE.Color(0xffe9c8);
    this.pmrem = null;
    this.envRT = null;
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(sky.geometry, sky.material));
    this.onChange = null;

    // light-space snapping scratch
    this._basis = new THREE.Matrix4();
    this._inv = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._sunOffset = new THREE.Vector3();

    for (const l of [sun, sunFar]) {
      if (!l) continue;
      l.shadow.camera.near = 1;
      l.shadow.camera.far = 260;
      l.shadow.bias = -0.00035;
      l.shadow.normalBias = 0.045;
    }
    let initial = 'golden';
    try { if (localStorage.getItem('em.v3.mode') === 'night') initial = 'night'; } catch {}
    this.set(initial, 0);
  }

  get isNight() { return this.mode === 'night'; }

  set(name, fadeSeconds = 4, { user = false } = {}) {
    if (!this.presets[name]) return;
    this.from = blend(this.from, this.to, ease(this.t), {});
    this.to = this.presets[name];
    this.mode = name;
    this.fade = Math.max(0.001, fadeSeconds);
    this.t = fadeSeconds <= 0 ? 1 : 0;
    if (user) { this.userPinned = true; this.drift = 0; }
    this.envStage = 0;               // refresh the environment mid-fade and at the end
    this.onChange?.(name);
    if (this.t >= 1) { blend(this.from, this.to, 1, this.cur); this.apply(); }
  }

  toggle() {
    this.set(this.mode === 'night' ? 'golden' : 'night', 4, { user: true });
    return this.mode;
  }

  setFogBase(density) { this.fogBase = density; this.applyFog(); }

  // quality tier moved: shadow map sizes, cascade count, PCF radius
  applyTier(s) {
    this.tier = s;
    const on = s.shadows > 0;
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    const nearSize = s.shadows || 1024;
    if (this.sun.shadow.mapSize.width !== nearSize) {
      this.sun.shadow.mapSize.set(nearSize, nearSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.shadow.radius = s.shadowRadius ?? 2;
    const cascades = on && (s.cascades ?? 1) >= 2;
    if (this.sunFar) {
      const farSize = Math.min(2048, nearSize);
      if (this.sunFar.shadow.mapSize.width !== farSize) {
        this.sunFar.shadow.mapSize.set(farSize, farSize);
        this.sunFar.shadow.map?.dispose();
        this.sunFar.shadow.map = null;
      }
      this.sunFar.castShadow = cascades;
      this.sunFar.shadow.radius = (s.shadowRadius ?? 2) * 1.6;
      // a second light in the scene changes NUM_DIR_LIGHTS for every program,
      // so it only joins the scene when it actually carries a cascade
      if (cascades && !this.sunFar.parent) this.scene.add(this.sunFar, this.sunFar.target);
      if (!cascades && this.sunFar.parent) this.scene.remove(this.sunFar, this.sunFar.target);
    }
    EM.uCsmSplit.value = cascades ? 22 : 1e6;
    this.cascades = cascades;
  }

  applyFog() {
    const c = this.cur;
    if (this.scene.fog) this.scene.fog.density = this.fogBase * (c.fogMul ?? 1);
  }

  // Push the blended parameters into lights, sky, fog, shared uniforms, post.
  apply() {
    const c = this.cur;
    const el = c.sunEl, az = c.sunAz;
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();

    this.sun.color.copy(c.sunColor);
    this.sun.intensity = c.sunIntensity;
    // cel shadows are lifted, not black: a little direct light survives inside them
    this.sun.shadow.intensity = c.shadowIntensity ?? 0.8;
    if (this.sunFar) this.sunFar.shadow.intensity = c.shadowIntensity ?? 0.8;
    if (this.sunFar) { this.sunFar.color.copy(c.sunColor); this.sunFar.intensity = 0; }
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemiIntensity;

    const u = this.sky.material.uniforms;
    u.topColor.value.copy(c.skyTop);
    u.midColor.value.copy(c.skyMid);
    u.botColor.value.copy(c.skyBot);
    u.glowColor.value.copy(c.glow);
    u.glowStrength.value = c.glowStrength;
    u.sunDir.value.copy(this.sunDir);
    u.sunColor.value.copy(c.sunColor);
    u.sunStrength.value = c.sunDisc;
    u.stars.value = c.stars;

    // fog is the horizon the dome shows, so distance dissolves INTO the sky
    if (this.scene.fog) skyColorAt(u, 0.0, this.scene.fog.color);
    this.applyFog();
    EM.uFogHighFloor.value = c.fogHighFloor;
    EM.uSkyHorizon.value.copy(this.scene.fog ? this.scene.fog.color : c.skyBot);
    EM.uSkyZenith.value.copy(c.skyTop);
    EM.uRimColor.value.copy(c.rimColor);
    EM.uRimStrength.value = c.rimStrength;
    EM.uCloudShadow.value = c.cloudShadow;
    EM.uWetGlobal.value = c.wet;
    EM.uWindowLit.value = c.windowLit;
    EM.uWindowGlow.value = c.windowGlow;
    EM.uWindowGlowA.value.copy(c.sunColor).lerp(this._warm, 0.5);
    EM.uWindowGlowB.value.set(c.stars > 0.5 ? 0x33d8ff : 0xffb070);

    // emissive: with the post stack the composite tone-maps everything, so
    // neon needs the full gain; without it the renderer's own ACES already
    // leaves toneMapped:false neon at full brightness.
    const postOn = !!this.postfx?.enabled;
    setNeonGain(postOn ? c.emissiveGain : Math.max(1, c.emissiveGain * 0.5));

    if (this.postfx) {
      this.postfx.setLook({
        exposure: c.exposure, bloomThreshold: c.bloomThreshold, bloomStrength: c.bloomStrength,
        ink: c.ink, shadowTint: c.shadowTint, highTint: c.highTint, saturation: c.saturation,
      });
    }
    this.renderer.toneMappingExposure = 1.04 * c.exposure;

    // clouds + motes live in world.js; find them by name once they exist
    if (!this.clouds || !this.clouds.parent) this.clouds = this.scene.getObjectByName('em-clouds');
    if (!this.motes || !this.motes.parent) this.motes = this.scene.getObjectByName('em-motes');
    if (this.clouds) {
      const cu = this.clouds.material.uniforms;
      cu.uLit.value.copy(c.cloudLit);
      cu.uShade.value.copy(c.cloudShade);
      cu.uHorizon.value.copy(this.scene.fog ? this.scene.fog.color : c.skyBot);
      cu.uSunDir.value.copy(this.sunDir);
    }
    if (this.motes) {
      this.motes.material.color.copy(c.mote);
      this.motes.material.opacity = c.moteOpacity;
    }
  }

  // Cheap PMREM of the dome so metallic materials read as chrome, not charcoal.
  refreshEnvironment() {
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 1, 2000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.65;
    old?.dispose();
  }

  // Both cascade lights share the sun vector; each frustum is centred a little
  // ahead of the player and snapped to its own texel grid IN LIGHT SPACE, so
  // walking never makes the shadow edges crawl. The near box tightens with a
  // high sun and grows when the sun is low and the shadows are long.
  updateSun(playerPos, camera) {
    const el = Math.max(0.12, this.cur.sunEl);
    const stretch = THREE.MathUtils.clamp(1 / Math.sqrt(Math.sin(el)), 1, 1.6);
    const sNear = 24 * stretch;
    const sFar = 78 * stretch;
    camera.getWorldDirection(this._fwd);
    this._basis.lookAt(this.sunDir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    this._inv.copy(this._basis).invert();
    this._place(this.sun, playerPos, this._fwd, 5, sNear, 110);
    if (this.sunFar && this.sunFar.castShadow) {
      this._place(this.sunFar, playerPos, this._fwd, 22, sFar, 160);
      this._sweepFarCasters();
    }
  }

  // The far cascade covers ~190 m and would otherwise re-draw every 25k-triangle
  // local in the district. Its shadow camera lives on layer 1, and only large
  // static casters (batched district shells, terrain, instanced kits, big
  // props) are enabled there; people and small props cast in the near cascade
  // alone, which is the only place their shadow could be read anyway.
  _sweepFarCasters() {
    this._sweepT = (this._sweepT || 0) + 1;
    if (this._sweepT % 90 !== 1) return;
    this.sunFar.shadow.camera.layers.set(1);
    this.scene.traverse((o) => {
      if (!o.isMesh || !o.castShadow || o.isSkinnedMesh || o.userData.emFarChecked) return;
      o.userData.emFarChecked = true;
      const g = o.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const r = g.boundingSphere ? g.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) : 0;
      if (o.isInstancedMesh || r > 2.5) o.layers.enable(1);
    });
  }

  _place(light, playerPos, fwd, lead, S, dist) {
    const cam = light.shadow.camera;
    if (cam.right !== S) {
      cam.left = -S; cam.right = S; cam.top = S; cam.bottom = -S;
      cam.updateProjectionMatrix();
    }
    const texel = (2 * S) / Math.max(256, light.shadow.mapSize.width);
    this._p.set(playerPos.x + fwd.x * lead, 0, playerPos.z + fwd.z * lead);
    this._p.applyMatrix4(this._inv);
    this._p.x = Math.round(this._p.x / texel) * texel;
    this._p.y = Math.round(this._p.y / texel) * texel;
    this._p.applyMatrix4(this._basis);
    light.target.position.copy(this._p);
    light.position.copy(this._p).addScaledVector(this.sunDir, dist);
  }

  update(dt, camera) {
    // crossfade
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.fade);
      blend(this.from, this.to, ease(this.t), this.cur);
      this.apply();
    }
    // slow golden → dusk drift after ~14 minutes of play (paused by a manual pick)
    if (this.mode === 'golden' && !this.userPinned && this.t >= 1) {
      this.playtime += dt;
      const target = THREE.MathUtils.clamp((this.playtime - 14 * 60) / (6 * 60), 0, 1);
      if (target !== this.drift) {
        this.drift = target;
        blend(this.presets.golden, this.presets.dusk, ease(this.drift), this.cur);
        this.apply();
        this.envTimer += dt;
        if (this.envTimer > 20) { this.refreshEnvironment(); this.envTimer = 0; }
      }
    }
    // the dome rides with the camera so it is never far-clipped on any tier
    if (camera) this.sky.position.copy(camera.position);
    // PMREM of the new sky: once mid-fade, once settled (a few ms each)
    if (this.envStage === 0 && this.t >= 0.5) { this.refreshEnvironment(); this.envStage = this.t >= 1 ? 2 : 1; }
    else if (this.envStage === 1 && this.t >= 1) { this.refreshEnvironment(); this.envStage = 2; }
  }
}
