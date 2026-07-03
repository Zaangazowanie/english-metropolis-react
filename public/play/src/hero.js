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

  // Wren's hands are modelled splayed-open (welcoming pose) with no finger bones,
  // so Mixamo's wrist mocap twists them into odd shapes. Lock each wrist to its
  // neutral rest orientation every frame — the shoulders/elbows still swing, but
  // the hands stop twisting. An extra inward roll settles the palms toward the body.
  const handL = [], handR = [];
  root.traverse((o) => {
    if (!o.isBone) return;
    if (/LeftHand$/.test(o.name)) handL.push(o);
    if (/RightHand$/.test(o.name)) handR.push(o);
  });
  const bind = new Map();
  for (const b of [...handL, ...handR]) bind.set(b, b.quaternion.clone());
  // neutral by default (exact modelled hand pose, no twist); tunable via __RIG.rolls
  const rollL = new THREE.Quaternion();
  const rollR = new THREE.Quaternion();
  const postUpdate = () => {
    for (const b of handL) b.quaternion.copy(bind.get(b)).multiply(rollL);
    for (const b of handR) b.quaternion.copy(bind.get(b)).multiply(rollR);
  };
  return { object: wrap, mixer, actions, root, postUpdate, bind, rolls: { rollL, rollR }, bones: { handL: handL[0], handR: handR[0] } };
}
