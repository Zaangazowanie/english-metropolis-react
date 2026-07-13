// Mixamo-rigged Wren: real mocap idle/walk/run on the auto-rigged skeleton.
// The character was uploaded to Mixamo untextured (OBJ), so we re-apply Wren's
// original toon texture (UVs are preserved 1:1) here.
import * as THREE from 'three';
import { toonRamp } from './materials.js';

const M = 'public/assets/models/';

export async function loadMixamoHero(loader) {
  const load = (u) => new Promise((res, rej) => loader.load(M + u, res, undefined, rej));
  const [walk, idle, run, tex] = await Promise.all([
    load('hero_walk.glb'), load('hero_idle.glb'), load('hero_run.glb'), load('hero.glb'),
  ]);

  const root = walk.scene;
  let skinned = null;
  root.traverse((o) => { if (o.isSkinnedMesh) skinned = o; });

  // Wren's texture from the original GLB (V is flipped by our OBJ export → flipY=false)
  let map = null;
  tex.scene.traverse((o) => { if (o.isMesh && o.material && o.material.map) map = o.material.map; });
  if (map) { map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.needsUpdate = true; }
  skinned.material = new THREE.MeshToonMaterial({ map, color: 0xffffff, gradientMap: toonRamp() });
  skinned.castShadow = true;
  skinned.frustumCulled = false;

  // normalize to 1.7 m tall, feet at origin
  let box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  root.scale.setScalar(1.7 / Math.max(size.y, 0.001));
  box = new THREE.Box3().setFromObject(root);
  const c = new THREE.Vector3(); box.getCenter(c);
  root.position.set(-c.x, -box.min.y, -c.z);

  const wrap = new THREE.Group();
  wrap.add(root);

  const mixer = new THREE.AnimationMixer(root);
  const named = (g, n) => { const clip = g.animations[0]; clip.name = n; return mixer.clipAction(clip); };
  const actions = {
    idle: named(idle, 'idle'),
    walk: named(walk, 'walk'),
    run: named(run, 'run'),
  };

  // The compressed rig keeps its finger chain, but the wrist tracks can still
  // over-rotate at the fastest run keys. Preserve the mocap and soften only those
  // extremes so the hands remain expressive rather than rigid.
  const handL = [], handR = [];
  root.traverse((o) => {
    if (!o.isBone) return;
    if (/LeftHand$/.test(o.name)) handL.push(o);
    if (/RightHand$/.test(o.name)) handR.push(o);
  });
  const bind = new Map();
  for (const b of [...handL, ...handR]) bind.set(b, b.quaternion.clone());
  const inverseBind = new Map();
  const smoothed = new Map();
  for (const b of [...handL, ...handR]) {
    inverseBind.set(b, bind.get(b).clone().invert());
    smoothed.set(b, bind.get(b).clone());
  }
  // Identity by default; retained on __RIG so art-direction tuning remains live.
  const rollL = new THREE.Quaternion();
  const rollR = new THREE.Quaternion();
  const identity = new THREE.Quaternion();
  const delta = new THREE.Quaternion();
  const limited = new THREE.Quaternion();
  const target = new THREE.Quaternion();
  const MAX_WRIST_ANGLE = THREE.MathUtils.degToRad(46);
  const stabilise = (bone, correction, dt) => {
    delta.copy(inverseBind.get(bone)).multiply(bone.quaternion).normalize();
    if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
    const angle = 2 * Math.acos(THREE.MathUtils.clamp(delta.w, -1, 1));
    if (angle > MAX_WRIST_ANGLE) limited.copy(identity).slerp(delta, MAX_WRIST_ANGLE / angle);
    else limited.copy(delta);
    target.copy(bind.get(bone)).multiply(limited).multiply(correction);
    smoothed.get(bone).slerp(target, 1 - Math.exp(-Math.max(dt, 1 / 240) * 18));
    bone.quaternion.copy(smoothed.get(bone));
  };
  const postUpdate = (dt = 1 / 60) => {
    for (const b of handL) stabilise(b, rollL, dt);
    for (const b of handR) stabilise(b, rollR, dt);
  };
  return { object: wrap, mixer, actions, root, postUpdate, bind, rolls: { rollL, rollR }, bones: { handL: handL[0], handR: handR[0] } };
}
