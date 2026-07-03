// Living city: ambient pedestrians drawn from the 8 code-rigged Meshy townsfolk.
// EVERY BODY IS USED AT MOST ONCE (no duplicate characters on screen — Mike,
// 2026-07-03), no Wren clones (the player IS Wren), and citizens keep to the
// boulevards so they never loiter next to their hub-teacher twin on the plaza.
import * as THREE from 'three';
import { instanceRig } from './rig.js';
import { blobShadow } from './materials.js';
import { heightAt } from './terrain.js';
import { LINES } from './zones.js';

const WALK_SPEED = 1.35;
const RESPAWN_DIST = 175, SPAWN_NEAR = 110;
const TINTS = [0xc96f4a, 0x7ba05b, 0x8fb4c9, 0x6b4fa0, 0xe8a13d, 0xa2707f, 0x5e7b54, 0xb8452f];

// boulevard sidewalks only — the plaza belongs to the (unique) hub teachers
function randomSidewalkPoint(nearX = 0, nearZ = 0, spread = 999) {
  for (let tries = 0; tries < 12; tries++) {
    const L = Object.values(LINES)[(Math.random() * 3) | 0];
    const d = 45 + Math.random() * 355;
    const lat = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 9);
    const dirX = Math.cos(L.angle), dirZ = -Math.sin(L.angle);
    const x = dirX * d + -dirZ * lat;
    const z = dirZ * d + dirX * lat;
    if (Math.hypot(x - nearX, z - nearZ) < spread) return { x, z };
  }
  return { x: nearX, z: nearZ };
}

export class Citizens {
  constructor(scene, heroRig, npcBases = []) {
    this.scene = scene;
    this.list = [];
    this.density = 8;
    // body pool: the code-rigged Meshy townsfolk, each spawnable ONCE
    this.bodies = [];
    for (const b of npcBases) {
      if (b.rigged && b.clips?.walk) this.bodies.push({ type: 'meshy', mesh: b.mesh, clips: b.clips });
    }
    // shuffled free-list of body indices (assignment without replacement)
    this.free = this.bodies.map((_, i) => i);
    for (let i = this.free.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [this.free[i], this.free[j]] = [this.free[j], this.free[i]];
    }
  }

  spawn(n) {
    this.density = Math.min(n, this.bodies.length);
    while (this.list.length < this.density && this.free.length) this.addOne();
  }

  setDensity(n) {
    this.density = Math.min(n, this.bodies.length);
    while (this.list.length > this.density) {
      const c = this.list.pop();
      this.scene.remove(c.wrap);
      this.free.push(c.bodyIdx);                       // body becomes available again
    }
  }

  addOne(nearX = 0, nearZ = 0) {
    if (!this.free.length) return;                     // every body already walking
    const bodyIdx = this.free.pop();
    const body = this.bodies[bodyIdx];
    const wrap = new THREE.Group();

    // distinct Meshy townsperson — own texture, wardrobe tint to set them
    // apart from their teaching twin working elsewhere in the city
    const inst = instanceRig(body.mesh, body.clips);
    const model = inst.object;
    const mixer = inst.mixer;
    const walk = inst.actions.walk;
    walk.timeScale = 0.82 + Math.random() * 0.32;
    walk.play();
    inst.actions.idle?.stop();
    const tint = new THREE.Color(TINTS[bodyIdx % TINTS.length]);
    model.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.material = o.material.clone();
        o.material.color.lerp(tint, 0.28);
        o.castShadow = true; o.frustumCulled = false;
      }
    });
    wrap.add(model);

    wrap.add(blobShadow(0.5));
    wrap.scale.setScalar(0.9 + Math.random() * 0.2);   // height variance
    const p = randomSidewalkPoint(nearX, nearZ, nearX || nearZ ? SPAWN_NEAR : 999);
    wrap.position.set(p.x, heightAt(p.x, p.z), p.z);
    this.scene.add(wrap);

    mixer.update(Math.random() * 2);                    // desync strides
    const target = randomSidewalkPoint(p.x, p.z, 70);
    this.list.push({ wrap, mixer, bodyIdx, target, heading: Math.random() * Math.PI * 2 });
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

      const pd = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
      if (pd > RESPAWN_DIST) {
        const p = randomSidewalkPoint(playerPos.x, playerPos.z, SPAWN_NEAR);
        pos.set(p.x, heightAt(p.x, p.z), p.z);
        c.target = randomSidewalkPoint(p.x, p.z, 70);
      }
    }
  }
}
