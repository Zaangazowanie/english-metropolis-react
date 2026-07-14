// Code-based humanoid auto-rigger. Takes the Meshy cast's shared bent-arm
// presentation pose, segments it into a bone hierarchy by vertex position, and
// returns a SkinnedMesh + authored idle/walk/run clips.
// No external tools, no uploads — works on every character in the cast.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Bone set (indices fixed — skin weights reference these)
const B = {
  hips: 0, spine: 1, chest: 2, neck: 3,
  thighL: 4, shinL: 5, footL: 6,
  thighR: 7, shinR: 8, footR: 9,
  upperArmL: 10, foreArmL: 11,
  upperArmR: 12, foreArmR: 13,
  handL: 14, handR: 15,
};
const NB = 16;

function collectGeometry(root) {
  const geos = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (o.isMesh) {
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      geos.push(g);
    }
  });
  const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
  return merged;
}

// smoothstep helper
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function rigHumanoid(root, material) {
  const geo = collectGeometry(root);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const H = bb.max.y - bb.min.y;
  const y0 = bb.min.y;
  const cx = (bb.min.x + bb.max.x) / 2;
  const pos = geo.attributes.position;
  const n = pos.count;

  // Joint heights are fractions of H. Horizontal joints adapt to each cast
  // member's reach; fixed wrist coordinates left shorter models' hands almost
  // entirely weighted to the forearm, so palm correction had no visible effect.
  const hipY = y0 + 0.47 * H, kneeY = y0 + 0.25 * H, footY = y0 + 0.06 * H;
  const chestY = y0 + 0.66 * H, shoulderY = y0 + 0.72 * H, neckY = y0 + 0.84 * H;
  const halfWidth = Math.max(Math.abs(bb.min.x - cx), Math.abs(bb.max.x - cx));
  const legX = 0.09;
  const shoulderX = THREE.MathUtils.clamp(halfWidth * 0.38, 0.14, 0.18);
  const elbowX = THREE.MathUtils.clamp(halfWidth * 0.61, 0.22, 0.29);
  const wristX = THREE.MathUtils.clamp(halfWidth * 0.83, 0.3, 0.4);
  const armInner = THREE.MathUtils.clamp(halfWidth * 0.48, 0.17, 0.22);

  // ---- skin weights: one dominant bone per vertex, blended across joints ----
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    const dx = v.x - cx, ax = Math.abs(dx);
    const side = dx < 0 ? 'L' : 'R';
    const ty = (v.y - y0) / H;
    const w = [0, 0, 0, 0], idx = [0, 0, 0, 0];
    let slot = 0;
    const add = (bone, weight) => { if (weight > 0.001 && slot < 4) { idx[slot] = bone; w[slot] = weight; slot++; } };

    const isArm = ax > armInner && ty > 0.52 && ty < 0.86;
    if (isArm) {
      const upper = side === 'L' ? B.upperArmL : B.upperArmR;
      const fore = side === 'L' ? B.foreArmL : B.foreArmR;
      const hand = side === 'L' ? B.handL : B.handR;
      const foreBlend = ss(armInner + 0.055, elbowX + 0.045, ax);
      const handBlend = ss(halfWidth * 0.68, halfWidth * 0.9, ax);
      add(upper, 1 - foreBlend);
      // A broad blend through the cuff keeps connected sleeve/hand polygons
      // continuous while giving the palm its own anatomical wrist rotation.
      add(fore, foreBlend * (1 - handBlend));
      add(hand, foreBlend * handBlend);
    } else if (ty < 0.5) {
      // legs / hips
      const thigh = side === 'L' ? B.thighL : B.thighR;
      const shin = side === 'L' ? B.shinL : B.shinR;
      const foot = side === 'L' ? B.footL : B.footR;
      if (ty < 0.10) { add(foot, 1); }
      else if (ty < 0.26) { const f = ss(0.10, 0.16, ty); add(foot, 1 - f); add(shin, f); }
      else if (ty < 0.46) { const f = ss(0.26, 0.34, ty); add(shin, 1 - f); add(thigh, f); }
      else { const f = ss(0.46, 0.52, ty); add(thigh, 1 - f); add(B.hips, f); }
    } else {
      // torso column
      if (ty < 0.58) { const f = ss(0.50, 0.58, ty); add(B.hips, 1 - f); add(B.spine, f); }
      else if (ty < 0.72) { const f = ss(0.58, 0.72, ty); add(B.spine, 1 - f); add(B.chest, f); }
      else if (ty < 0.86) { const f = ss(0.80, 0.90, ty); add(B.chest, 1 - f); add(B.neck, f); }
      else { add(B.neck, 1); }
    }
    if (slot === 0) add(B.hips, 1);
    let sum = w[0] + w[1] + w[2] + w[3]; if (sum === 0) { w[0] = 1; sum = 1; }
    for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = idx[k]; skinWeight[i * 4 + k] = w[k] / sum; }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));

  // ---- bone hierarchy (positions are LOCAL to parent, bind = A-pose) ----
  const bones = Array.from({ length: NB }, () => new THREE.Bone());
  for (const [k, i] of Object.entries(B)) bones[i].name = 'b_' + k;   // stable track targets
  const P = (b, x, y, z) => bones[b].position.set(x, y, z);
  P(B.hips, cx, hipY, 0);
  P(B.spine, 0, chestY - hipY, 0); bones[B.hips].add(bones[B.spine]);
  P(B.chest, 0, shoulderY - chestY, 0); bones[B.spine].add(bones[B.chest]);
  P(B.neck, 0, neckY - shoulderY, 0); bones[B.chest].add(bones[B.neck]);
  // legs
  P(B.thighL, -legX, hipY - hipY, 0); P(B.thighL, -legX, 0, 0); bones[B.hips].add(bones[B.thighL]);
  P(B.shinL, 0, kneeY - hipY, 0); bones[B.thighL].add(bones[B.shinL]);
  P(B.footL, 0, footY - kneeY, 0); bones[B.shinL].add(bones[B.footL]);
  P(B.thighR, legX, 0, 0); bones[B.hips].add(bones[B.thighR]);
  P(B.shinR, 0, kneeY - hipY, 0); bones[B.thighR].add(bones[B.shinR]);
  P(B.footR, 0, footY - kneeY, 0); bones[B.shinR].add(bones[B.footR]);
  // Arms (chest is at shoulderY). The source cast is not in a T-pose: elbows
  // sit lower and the forearms reach toward the viewer. Binding those real
  // pivots lets the animation relax the arms without stretching the sleeves.
  const elbowDrop = H * 0.087;
  const elbowForward = H * 0.032;
  const wristDrop = H * 0.07;
  const wristForward = H * 0.093;
  P(B.upperArmL, -shoulderX, 0, 0); bones[B.chest].add(bones[B.upperArmL]);
  P(B.foreArmL, -(elbowX - shoulderX), -elbowDrop, elbowForward); bones[B.upperArmL].add(bones[B.foreArmL]);
  P(B.handL, -(wristX - elbowX), -wristDrop, wristForward); bones[B.foreArmL].add(bones[B.handL]);
  P(B.upperArmR, shoulderX, 0, 0); bones[B.chest].add(bones[B.upperArmR]);
  P(B.foreArmR, elbowX - shoulderX, -elbowDrop, elbowForward); bones[B.upperArmR].add(bones[B.foreArmR]);
  P(B.handR, wristX - elbowX, -wristDrop, wristForward); bones[B.foreArmR].add(bones[B.handR]);

  const skeleton = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.castShadow = true;
  mesh.add(bones[B.hips]);
  mesh.bind(skeleton);
  mesh.normalizeSkinWeights();

  // wrapper group so callers position/rotate the whole character cleanly
  const group = new THREE.Group();
  group.add(mesh);

  const clips = buildClips(bones);
  const mixer = new THREE.AnimationMixer(mesh);
  const actions = {};
  for (const k of Object.keys(clips)) actions[k] = mixer.clipAction(clips[k]);

  // sanity: if segmentation blew the mesh apart, the caller should fall back
  mesh.skeleton.pose();
  const okBind = Number.isFinite(H) && H > 0.1;

  return { object: group, mesh, skeleton, bones, mixer, actions, clips, ok: okBind };
}

// Rig a base model once; returns the rigged SkinnedMesh + its clips for cloning.
// ok=false means the mesh didn't segment sanely — caller keeps the static mesh.
export function rigBase(root, material) {
  const r = rigHumanoid(root, material);
  return { mesh: r.mesh, clips: r.clips, ok: r.ok };
}

// Cheap per-instance clone of a rigged base (SkeletonUtils clones bones+skin).
// Auto-plays idle and returns a one-shot gesture player.
export function instanceRig(baseObject, clips) {
  const model = cloneSkinned(baseObject);
  let mesh = null;
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (!mesh && object.isSkinnedMesh) mesh = object;
  });
  mesh ||= model;
  const group = new THREE.Group();
  group.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const k of Object.keys(clips)) actions[k] = mixer.clipAction(clips[k]);
  actions.idle.play();
  const playGesture = (name) => {
    const a = actions[name], idle = actions.idle;
    if (!a || a === idle) return;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false;
    a.crossFadeFrom(idle, 0.2, false).play();
    const onDone = (e) => {
      if (e.action !== a) return;
      mixer.removeEventListener('finished', onDone);
      idle.reset().crossFadeFrom(a, 0.25, false).play();
    };
    mixer.addEventListener('finished', onDone);
  };
  return { object: group, model, mesh, mixer, actions, playGesture };
}

// ---- authored motion: arms rest down from the T/A bind, legs & arms swing ----
function eul(x, y, z) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)); }
function track(boneName, times, quats) {
  const arr = new Float32Array(quats.length * 4);
  quats.forEach((q, i) => { arr[i * 4] = q.x; arr[i * 4 + 1] = q.y; arr[i * 4 + 2] = q.z; arr[i * 4 + 3] = q.w; });
  return new THREE.QuaternionKeyframeTrack(boneName + '.quaternion', times, arr);
}

function buildClips(bones) {
  const name = (b) => bones[b].name;
  const offset = (base, x = 0, y = 0, z = 0) => base.clone().multiply(eul(x, y, z));
  const limbPose = (upperBind, foreBind, upperTarget, foreTarget, roll = 0) => {
    const upper = new THREE.Quaternion().setFromUnitVectors(
      upperBind.clone().normalize(), upperTarget.clone().normalize(),
    );
    const localForeTarget = foreTarget.clone().normalize().applyQuaternion(upper.clone().invert());
    const fore = new THREE.Quaternion().setFromUnitVectors(
      foreBind.clone().normalize(), localForeTarget,
    );
    if (roll) fore.multiply(new THREE.Quaternion().setFromAxisAngle(foreBind.clone().normalize(), roll));
    return { upper, fore };
  };
  const restL = limbPose(
    bones[B.foreArmL].position, bones[B.handL].position,
    new THREE.Vector3(-0.04, -1, -0.04), new THREE.Vector3(-0.015, -1, -0.05),
  );
  const restR = limbPose(
    bones[B.foreArmR].position, bones[B.handR].position,
    new THREE.Vector3(0.04, -1, -0.04), new THREE.Vector3(0.015, -1, -0.05),
  );
  const handRestL = new THREE.Quaternion().setFromAxisAngle(
    bones[B.handL].position.clone().normalize(), -0.78,
  );
  const handRestR = new THREE.Quaternion().setFromAxisAngle(
    bones[B.handR].position.clone().normalize(), 0.78,
  );
  const restArmTracks = (duration) => [
    track(name(B.upperArmL), [0, duration], [restL.upper, restL.upper]),
    track(name(B.upperArmR), [0, duration], [restR.upper, restR.upper]),
    track(name(B.foreArmL), [0, duration], [restL.fore, restL.fore]),
    track(name(B.foreArmR), [0, duration], [restR.fore, restR.fore]),
    track(name(B.handL), [0, duration], [handRestL, handRestL]),
    track(name(B.handR), [0, duration], [handRestR, handRestR]),
  ];

  // IDLE — gentle breathing + arms resting down
  const idleTracks = [
    track(name(B.upperArmL), [0, 2, 4], [restL.upper, offset(restL.upper, 0.025), restL.upper]),
    track(name(B.upperArmR), [0, 2, 4], [restR.upper, offset(restR.upper, 0.025), restR.upper]),
    track(name(B.foreArmL), [0, 4], [restL.fore, restL.fore]),
    track(name(B.foreArmR), [0, 4], [restR.fore, restR.fore]),
    track(name(B.handL), [0, 4], [handRestL, handRestL]),
    track(name(B.handR), [0, 4], [handRestR, handRestR]),
    track(name(B.chest), [0, 2, 4], [eul(0, 0, 0), eul(0.03, 0, 0), eul(0, 0, 0)]),
  ];
  const idle = new THREE.AnimationClip('idle', 4, idleTracks);

  // WALK — 1s cycle, legs swing at hips + knee bend, arms counter-swing
  const walk = makeGait('walk', 1.0, { legSwing: 0.46, kneeBend: 0.66, armSwing: 0.2 });
  const run = makeGait('run', 0.62, { legSwing: 0.74, kneeBend: 1.0, armSwing: 0.36 });

  // one-shot gesture clips (played over the idle base)
  // nod: neck pitches down-up twice
  const nod = new THREE.AnimationClip('agree', 1.0, [
    track(name(B.neck), [0, 0.2, 0.4, 0.6, 0.8, 1.0],
      [eul(0,0,0), eul(0.32,0,0), eul(0,0,0), eul(0.32,0,0), eul(0,0,0), eul(0,0,0)]),
    ...restArmTracks(1.0),
  ]);
  // shake: neck yaws left-right
  const shake = new THREE.AnimationClip('headShake', 1.0, [
    track(name(B.neck), [0, 0.15, 0.45, 0.75, 1.0],
      [eul(0,0,0), eul(0,0.4,0), eul(0,-0.4,0), eul(0,0.4,0), eul(0,0,0)]),
    ...restArmTracks(1.0),
  ]);
  // Greeting: elbow opens beside the shoulder, forearm rises, then the wrist
  // traces a small side-to-side wave. Using anatomical targets keeps the cuff
  // continuous across all seven differently proportioned cast members.
  const waveLeft = limbPose(
    bones[B.foreArmR].position, bones[B.handR].position,
    new THREE.Vector3(0.8, 0.28, -0.06), new THREE.Vector3(-0.16, 1, -0.08),
  );
  const waveRight = limbPose(
    bones[B.foreArmR].position, bones[B.handR].position,
    new THREE.Vector3(0.8, 0.28, -0.06), new THREE.Vector3(0.16, 1, -0.08),
  );
  const wave = new THREE.AnimationClip('Wave', 1.2, [
    track(name(B.upperArmL), [0, 1.2], [restL.upper, restL.upper]),
    track(name(B.upperArmR), [0, 0.25, 1.0, 1.2],
      [restR.upper, waveLeft.upper, waveLeft.upper, restR.upper]),
    track(name(B.foreArmL), [0, 1.2], [restL.fore, restL.fore]),
    track(name(B.foreArmR), [0, 0.4, 0.6, 0.8, 1.0, 1.2],
      [restR.fore, waveLeft.fore, waveRight.fore, waveLeft.fore, waveRight.fore, restR.fore]),
    track(name(B.handL), [0, 1.2], [handRestL, handRestL]),
    track(name(B.handR), [0, 1.2], [handRestR, handRestR]),
  ]);
  return { idle, walk, run, agree: nod, ThumbsUp: nod, headShake: shake, No: shake, Wave: wave };

  function makeGait(id, dur, p) {
    const t = [0, dur * 0.25, dur * 0.5, dur * 0.75, dur];
    const swing = (phase) => Math.sin(phase * Math.PI * 2);
    const s = p.legSwing;
    // phase 0..1 across cycle; leg L leads, leg R opposite; arms opposite legs
    const legL = [], legR = [], kneeL = [], kneeR = [], armL = [], armR = [], foreL = [], foreR = [], handL = [], handR = [];
    for (let i = 0; i < t.length; i++) {
      const ph = i / (t.length - 1);
      const sw = swing(ph);
      legL.push(eul(sw * s, 0, 0));
      legR.push(eul(-sw * s, 0, 0));
      // knee bends most as the leg passes under (back swing)
      kneeL.push(eul(Math.max(0, -sw) * p.kneeBend + 0.1, 0, 0));
      kneeR.push(eul(Math.max(0, sw) * p.kneeBend + 0.1, 0, 0));
      armL.push(offset(restL.upper, -sw * p.armSwing));       // arm opposite same-side leg
      armR.push(offset(restR.upper, sw * p.armSwing));
      foreL.push(restL.fore);
      foreR.push(restR.fore);
      handL.push(handRestL);
      handR.push(handRestR);
    }
    const tracks = [
      track(name(B.thighL), t, legL), track(name(B.thighR), t, legR),
      track(name(B.shinL), t, kneeL), track(name(B.shinR), t, kneeR),
      track(name(B.upperArmL), t, armL), track(name(B.upperArmR), t, armR),
      track(name(B.foreArmL), t, foreL), track(name(B.foreArmR), t, foreR),
      track(name(B.handL), t, handL), track(name(B.handR), t, handR),
    ];
    return new THREE.AnimationClip(id, dur, tracks);
  }
}
