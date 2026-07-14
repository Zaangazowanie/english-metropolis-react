// GTA-feel third-person controller: momentum, sprint, jump, collide-and-slide,
// spring-arm orbit camera, procedural animation for the (static) Meshy hero mesh.
import * as THREE from 'three';
import { blobShadow } from './materials.js';
import { heightAt } from './terrain.js';
import { BOULEVARD, TRANSIT_ANGLES } from './transit-layout.js';

function segmentBoxEntry(start, end, box, padding = 0.34) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  let near = 0;
  let far = 1;
  for (const [origin, delta, min, max] of [
    [start.x, dx, box.minX - padding, box.maxX + padding],
    [start.z, dz, box.minZ - padding, box.maxZ + padding],
  ]) {
    if (Math.abs(delta) < 1e-6) {
      if (origin < min || origin > max) return null;
      continue;
    }
    let a = (min - origin) / delta;
    let b = (max - origin) / delta;
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return null;
  }
  return near >= 0 && near <= 1 ? near : null;
}

function keepCameraOnSidewalk(desired, playerPos) {
  const safeLateral = BOULEVARD.tramLaneX + 1.75;
  for (const angle of TRANSIT_ANGLES) {
    const dirX = Math.cos(angle);
    const dirZ = -Math.sin(angle);
    const along = playerPos.x * dirX + playerPos.z * dirZ;
    if (along < BOULEVARD.startD - 8 || along > BOULEVARD.endD + 8) continue;
    const perpX = -dirZ;
    const perpZ = dirX;
    const playerLateral = playerPos.x * perpX + playerPos.z * perpZ;
    if (Math.abs(playerLateral) < safeLateral) continue;
    const cameraLateral = desired.x * perpX + desired.z * perpZ;
    if (Math.sign(cameraLateral) === Math.sign(playerLateral) && Math.abs(cameraLateral) >= safeLateral) continue;
    const corrected = Math.sign(playerLateral) * safeLateral;
    desired.x += perpX * (corrected - cameraLateral);
    desired.z += perpZ * (corrected - cameraLateral);
  }
}

const WALK = 4.3, SPRINT = 7.6, ACCEL = 26, FRICTION = 14, TURN_LERP = 11;
const GRAVITY = -22, JUMP_V = 7.2, PLAYER_R = 0.42;

export class Player {
  constructor(heroModel, scene, anim = null) {
    this.root = new THREE.Group();          // world transform (feet at y=0)
    this.model = heroModel;                 // visual child
    this.root.add(heroModel);
    this.root.add(blobShadow(0.62));
    scene.add(this.root);

    this.pos = new THREE.Vector3(0, 0, 8);
    this.vel = new THREE.Vector3();
    this.heading = Math.PI;                 // model facing
    this.grounded = true;
    this.animT = 0;
    this.speedFrac = 0;

    // skeletal animation: { mixer, actions: {idle, walk, run} }
    this.anim = anim;
    this.currentAction = null;
    if (anim) this.fadeTo('idle', 0);
  }

  fadeTo(name, dur = 0.24) {
    const next = this.anim?.actions[name];
    if (!next || next === this.currentAction) return;
    next.reset().fadeIn(dur).play();
    this.currentAction?.fadeOut(dur);
    this.currentAction = next;
  }

  update(dt, input, camYaw, colliders) {
    // --- camera-relative wish direction ---
    let wx = 0, wz = 0;
    if (input.forward) wz -= 1;
    if (input.back) wz += 1;
    if (input.left) wx -= 1;
    if (input.right) wx += 1;
    const wishLen = Math.hypot(wx, wz);
    let ax = 0, az = 0;
    if (wishLen > 0) {
      wx /= wishLen; wz /= wishLen;
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      ax = wx * cos - wz * sin;
      az = wx * sin + wz * cos;
    }

    const maxSpeed = input.sprint ? SPRINT : WALK;
    // accelerate toward wish, friction otherwise
    if (wishLen > 0) {
      this.vel.x += ax * ACCEL * dt;
      this.vel.z += az * ACCEL * dt;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > maxSpeed) { const k = maxSpeed / sp; this.vel.x *= k; this.vel.z *= k; }
    } else {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const drop = Math.max(0, sp - FRICTION * dt * Math.max(sp, 2));
      const k = sp > 0.001 ? drop / sp : 0;
      this.vel.x *= k; this.vel.z *= k;
    }

    // --- jump & gravity ---
    if (this.grounded && input.jump) { this.vel.y = JUMP_V; this.grounded = false; }
    if (!this.grounded) this.vel.y += GRAVITY * dt;

    // --- integrate + collide-and-slide (circle vs AABB, two passes) ---
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        const insideX = this.pos.x > c.minX && this.pos.x < c.maxX;
        const insideZ = this.pos.z > c.minZ && this.pos.z < c.maxZ;
        if (insideX && insideZ) {
          const exits = [
            { d: this.pos.x - c.minX, axis: 'x', value: c.minX - PLAYER_R },
            { d: c.maxX - this.pos.x, axis: 'x', value: c.maxX + PLAYER_R },
            { d: this.pos.z - c.minZ, axis: 'z', value: c.minZ - PLAYER_R },
            { d: c.maxZ - this.pos.z, axis: 'z', value: c.maxZ + PLAYER_R },
          ];
          exits.sort((a, b) => a.d - b.d);
          const exit = exits[0];
          this.pos[exit.axis] = exit.value;
          this.vel[exit.axis] = 0;
          continue;
        }
        const nx = Math.max(c.minX, Math.min(this.pos.x, c.maxX));
        const nz = Math.max(c.minZ, Math.min(this.pos.z, c.maxZ));
        const dx = this.pos.x - nx, dz = this.pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < PLAYER_R * PLAYER_R) {
          const d = Math.sqrt(d2) || 0.0001;
          const push = PLAYER_R - d;
          this.pos.x += (dx / d) * push;
          this.pos.z += (dz / d) * push;
        }
      }
    }
    // world bounds (soft)
    const B = 430;
    this.pos.x = Math.max(-B, Math.min(B, this.pos.x));
    this.pos.z = Math.max(-B, Math.min(B, this.pos.z));

    // terrain grounding: hills lift the walkable floor outside the flat city
    const ground = heightAt(this.pos.x, this.pos.z);
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= ground) { this.pos.y = ground; this.vel.y = 0; this.grounded = true; }
    else if (this.grounded) {
      // walked off/onto a slope while grounded — follow it smoothly
      if (this.pos.y - ground < 0.9) this.pos.y = ground;
      else this.grounded = false;
    }

    // --- model heading + procedural animation ---
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.speedFrac = THREE.MathUtils.lerp(this.speedFrac, Math.min(1, sp / SPRINT), dt * 6);
    if (sp > 0.4) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, TURN_LERP * dt);
      // bank into turns, GTA-ish weight
      this.model.rotation.z = THREE.MathUtils.lerp(this.model.rotation.z, -d * 0.35, dt * 8);
    } else {
      this.model.rotation.z = THREE.MathUtils.lerp(this.model.rotation.z, 0, dt * 8);
    }

    if (this.anim) {
      // real skeletal animation: state by speed, timeScale follows stride
      if (!this.grounded) this.fadeTo('idle', 0.12);
      else if (sp > 5.0) this.fadeTo('run');
      else if (sp > 0.4) this.fadeTo('walk');
      else this.fadeTo('idle');
      if (this.currentAction) {
        this.currentAction.timeScale = sp > 0.4 ? Math.max(0.7, sp / (sp > 5 ? SPRINT : WALK)) : 1;
      }
      this.anim.mixer.update(dt);
      this.anim.postUpdate?.(dt);        // wrist constraints after the clips
    } else {
      // procedural fallback for unrigged meshes
      this.animT += dt * (1 + this.speedFrac * 7);
      const stride = Math.sin(this.animT * 2.4);
      if (sp > 0.4 && this.grounded) {
        this.model.position.y = Math.abs(stride) * 0.085 * this.speedFrac;
        this.model.rotation.x = stride * 0.055 * this.speedFrac;
        this.model.rotation.y = stride * 0.06 * this.speedFrac;
      } else if (this.grounded) {
        this.model.position.y = Math.sin(this.animT * 0.9) * 0.015;
        this.model.rotation.x = THREE.MathUtils.lerp(this.model.rotation.x, 0, dt * 6);
        this.model.rotation.y = THREE.MathUtils.lerp(this.model.rotation.y, 0, dt * 6);
      } else {
        this.model.position.y = 0.06;
        this.model.rotation.x = THREE.MathUtils.lerp(this.model.rotation.x, -0.12, dt * 6);
      }
    }

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
  }
}

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;                // camera south of spawn, looking at the station
    this.pitch = 0.32;
    this.dist = 5.4;
    this.cur = new THREE.Vector3(0, 3, 14);
    this.curTarget = new THREE.Vector3();
    this.forceSnap = false;
  }

  snap() { this.forceSnap = true; }

  update(dt, playerPos, mouse, colliders = []) {
    this.yaw -= mouse.dx * 0.0026;
    this.pitch = THREE.MathUtils.clamp(this.pitch + mouse.dy * 0.0022, -0.15, 1.15);
    this.dist = THREE.MathUtils.clamp(this.dist + mouse.wheel * 0.6, 2.6, 10);

    const target = new THREE.Vector3(playerPos.x, playerPos.y + 1.62, playerPos.z);
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    ).multiplyScalar(this.dist);

    const desired = target.clone().add(off);
    keepCameraOnSidewalk(desired, playerPos);

    let clearFraction = 1;
    for (const box of colliders) {
      if (target.x > box.minX && target.x < box.maxX && target.z > box.minZ && target.z < box.maxZ) continue;
      const entry = segmentBoxEntry(target, desired, box);
      if (entry !== null) clearFraction = Math.min(clearFraction, Math.max(0.2, entry - 0.045));
    }
    if (clearFraction < 1) desired.lerpVectors(target, desired, clearFraction);

    const floor = heightAt(desired.x, desired.z) + 0.4;
    if (desired.y < floor) desired.y = floor;

    const teleported = this.curTarget.distanceToSquared(target) > 24 * 24;
    if (this.forceSnap || teleported) {
      this.cur.copy(desired);
      this.curTarget.copy(target);
      this.forceSnap = false;
    } else {
      const k = 1 - Math.exp(-dt * 9);
      this.cur.lerp(desired, k);
      this.curTarget.lerp(target, 1 - Math.exp(-dt * 14));
    }
    this.camera.position.copy(this.cur);
    this.camera.lookAt(this.curTarget);
  }
}
