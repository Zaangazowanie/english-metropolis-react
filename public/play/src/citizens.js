// Living city: ambient pedestrians drawn from a POOL of distinct bodies — Wren's
// Mixamo mocap rig plus the 8 code-rigged Meshy townsfolk (tutor, vendor, tourist,
// rival, announcer, inspector, bookshop owner, robot). Tinted + scale-varied and
// streamed around the player, so the crowd reads as many different people.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { instanceRig } from './rig.js';
import { blobShadow } from './materials.js';
import { heightAt } from './terrain.js';
import { LINES } from './zones.js';

const WALK_SPEED = 1.35;
const RESPAWN_DIST = 175, SPAWN_NEAR = 110;
const TINTS = [0xc96f4a, 0x7ba05b, 0x8fb4c9, 0x6b4fa0, 0xe8a13d, 0xa2707f, 0x5e7b54, 0xb8452f];

function randomSidewalkPoint(nearX = 0, nearZ = 0, spread = 999) {
  for (let tries = 0; tries < 12; tries++) {
    let x, z;
    if (Math.random() < 0.25) {                    // plaza ring
      const a = Math.random() * Math.PI * 2;
      const r = 11 + Math.random() * 8;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } else {                                        // boulevard sidewalks
      const L = Object.values(LINES)[(Math.random() * 3) | 0];
      const d = 20 + Math.random() * 380;
      const lat = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 9);
      const dirX = Math.cos(L.angle), dirZ = -Math.sin(L.angle);
      x = dirX * d + -dirZ * lat;
      z = dirZ * d + dirX * lat;
    }
    if (Math.hypot(x - nearX, z - nearZ) < spread) return { x, z };
  }
  return { x: nearX, z: nearZ };
}

export class Citizens {
  constructor(scene, heroRig, npcBases = []) {
    this.scene = scene;
    this.list = [];
    this.density = 12;
    // body pool: Wren (mocap) + every code-rigged Meshy townsperson
    this.bodies = [{ type: 'hero', root: heroRig.root, walkClip: heroRig.actions.walk.getClip() }];
    for (const b of npcBases) {
      if (b.rigged && b.clips?.walk) this.bodies.push({ type: 'meshy', mesh: b.mesh, clips: b.clips });
    }
  }

  spawn(n) { this.density = n; while (this.list.length < n) this.addOne(); }

  setDensity(n) {
    this.density = n;
    while (this.list.length > n) { const c = this.list.pop(); this.scene.remove(c.wrap); }
  }

  addOne(nearX = 0, nearZ = 0) {
    const body = this.bodies[(Math.random() * this.bodies.length) | 0];
    const wrap = new THREE.Group();
    let model, mixer, hands = [], bind = new Map();

    if (body.type === 'hero') {
      // Wren clone — tint hard so identical bodies read as different people
      model = cloneSkinned(body.root);
      const tint = new THREE.Color(TINTS[(Math.random() * TINTS.length) | 0]);
      model.traverse((o) => {
        if (o.isSkinnedMesh) {
          o.material = o.material.clone();
          o.material.color.lerp(tint, 0.5);
          o.castShadow = true; o.frustumCulled = false;
        }
        if (o.isBone && /Hand$/.test(o.name)) { hands.push(o); bind.set(o, o.quaternion.clone()); }
      });
      mixer = new THREE.AnimationMixer(model);
      const walk = mixer.clipAction(body.walkClip);
      walk.timeScale = 0.85 + Math.random() * 0.3;
      walk.play();
      wrap.add(model);
    } else {
      // distinct Meshy townsperson — keep their own texture, light tint only
      const inst = instanceRig(body.mesh, body.clips);
      model = inst.object;
      mixer = inst.mixer;
      const walk = inst.actions.walk;
      walk.timeScale = 0.82 + Math.random() * 0.32;
      walk.play();
      inst.actions.idle?.stop();
      model.traverse((o) => {
        if (o.isSkinnedMesh) {
          o.material = o.material.clone();
          o.material.color.lerp(new THREE.Color(TINTS[(Math.random() * TINTS.length) | 0]), 0.12);
          o.castShadow = true; o.frustumCulled = false;
        }
      });
      wrap.add(model);
    }

    wrap.add(blobShadow(0.5));
    wrap.scale.setScalar(0.9 + Math.random() * 0.2);   // height variance
    const p = randomSidewalkPoint(nearX, nearZ, nearX || nearZ ? SPAWN_NEAR : 999);
    wrap.position.set(p.x, heightAt(p.x, p.z), p.z);
    this.scene.add(wrap);

    mixer.update(Math.random() * 2);                    // desync strides
    const target = randomSidewalkPoint(p.x, p.z, 70);
    this.list.push({ wrap, mixer, hands, bind, target, heading: Math.random() * Math.PI * 2 });
  }

  update(dt, playerPos) {
    for (const c of this.list) {
      const pos = c.wrap.position;
      const dx = c.target.x - pos.x, dz = c.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        c.target = randomSidewalkPoint(pos.x, pos.z, 70);
      } else {
        const want = Math.atan2(dx, dz);
        let diff = want - c.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        c.heading += diff * Math.min(1, dt * 3);
        pos.x += Math.sin(c.heading) * WALK_SPEED * dt;
        pos.z += Math.cos(c.heading) * WALK_SPEED * dt;
        pos.y = heightAt(pos.x, pos.z);
        c.wrap.rotation.y = c.heading;
      }
      c.mixer.update(dt);
      for (const h of c.hands) h.quaternion.copy(c.bind.get(h));   // Wren wrist lock

      const pd = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
      if (pd > RESPAWN_DIST) {
        const p = randomSidewalkPoint(playerPos.x, playerPos.z, SPAWN_NEAR);
        pos.set(p.x, heightAt(p.x, p.z), p.z);
        c.target = randomSidewalkPoint(p.x, p.z, 70);
      }
    }
  }
}
