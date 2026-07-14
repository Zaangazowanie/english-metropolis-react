// GTA-feel third-person controller: momentum, sprint, jump, collide-and-slide,
// Mixamo animation and a collision-aware spring-arm orbit camera.
import * as THREE from 'three';
import { blobShadow } from './materials.js';
import { heightAt } from './terrain.js';
import { BOULEVARD, TRANSIT_ANGLES } from './transit-layout.js';
import { resolveCircleAgainstPeople } from './collision.js';

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
const TAU = Math.PI * 2;

function wrapAngle(angle) {
  return THREE.MathUtils.euclideanModulo(angle + Math.PI, TAU) - Math.PI;
}

function dampAngle(current, target, rate, dt) {
  return wrapAngle(current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt)));
}

export class Player {
  constructor(heroModel, scene, anim = null) {
    this.root = new THREE.Group();          // world transform (feet at y=0)
    this.model = heroModel;                 // visual child
    this.root.add(heroModel);
    this.root.add(blobShadow(0.62));
    scene.add(this.root);

    this.pos = new THREE.Vector3(0, 0, 8);
    this.pos.collisionRadius = PLAYER_R;
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

  update(dt, input, camYaw, colliders, people = []) {
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
    for (let pass = 0; pass < 3; pass++) {
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
      resolveCircleAgainstPeople(this.pos, this.vel, PLAYER_R, people, this.root);
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
    this.armLength = this.dist;
    this.freeLookTimer = 0;
    this.cur = new THREE.Vector3(0, 3, 14);
    this.curTarget = new THREE.Vector3();
    this.lead = new THREE.Vector3();
    this.leadGoal = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.forceSnap = false;
    this.camera.userData.cameraMode = 'gta-follow';
  }

  snap() {
    this.forceSnap = true;
    this.freeLookTimer = 0;
  }

  update(dt, player, mouse, colliders = []) {
    const playerPos = player.pos || player;
    const velocity = player.vel || this.leadGoal.set(0, 0, 0);
    const planarSpeed = Math.hypot(velocity.x, velocity.z);
    const speedFrac = player.speedFrac ?? Math.min(1, planarSpeed / SPRINT);
    const hasLookDelta = Math.abs(mouse.dx) + Math.abs(mouse.dy) > 0.01;

    this.yaw -= mouse.dx * 0.0026;
    this.pitch = THREE.MathUtils.clamp(this.pitch + mouse.dy * 0.0022, -0.15, 1.15);
    this.dist = THREE.MathUtils.clamp(this.dist + mouse.wheel * 0.6, 2.6, 10);
    this.yaw = wrapAngle(this.yaw);

    if (hasLookDelta) this.freeLookTimer = 1.35;
    else if (mouse.looking) this.freeLookTimer = Math.max(this.freeLookTimer, 0.2);
    else this.freeLookTimer = Math.max(0, this.freeLookTimer - dt);

    // Free-look always wins. Once the player releases it, trail actual motion
    // after a grace period rather than reacting directly to a key or joystick.
    if (planarSpeed > 0.85 && this.freeLookTimer <= 0) {
      const movementHeading = Math.atan2(velocity.x, velocity.z);
      const behindMovement = movementHeading + Math.PI;
      this.yaw = dampAngle(this.yaw, behindMovement, 1.35 + speedFrac * 1.75, dt);
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0.3, 1 - Math.exp(-dt * 0.55));
    }

    if (planarSpeed > 0.2) {
      const leadDistance = Math.min(0.92, planarSpeed * 0.115);
      this.leadGoal.set(
        velocity.x / planarSpeed * leadDistance,
        0,
        velocity.z / planarSpeed * leadDistance,
      );
    } else {
      this.leadGoal.set(0, 0, 0);
    }
    this.lead.lerp(this.leadGoal, 1 - Math.exp(-dt * 4.2));

    this.target.set(
      playerPos.x + this.lead.x,
      playerPos.y + 1.52,
      playerPos.z + this.lead.z,
    );

    const teleported = this.curTarget.distanceToSquared(this.target) > 24 * 24;
    const snapNow = this.forceSnap || teleported;
    if (snapNow) this.curTarget.copy(this.target);
    else this.curTarget.lerp(this.target, 1 - Math.exp(-dt * 10.5));

    const requestedArm = this.dist + speedFrac * 0.52;
    this.offset.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    ).multiplyScalar(requestedArm);

    this.desired.copy(this.curTarget).add(this.offset);
    keepCameraOnSidewalk(this.desired, playerPos);

    let clearFraction = 1;
    for (const box of colliders) {
      if (this.curTarget.x > box.minX && this.curTarget.x < box.maxX && this.curTarget.z > box.minZ && this.curTarget.z < box.maxZ) continue;
      const entry = segmentBoxEntry(this.curTarget, this.desired, box);
      if (entry !== null) clearFraction = Math.min(clearFraction, Math.max(0.2, entry - 0.045));
    }
    // Sample the camera arm against the analytic terrain. Checking only the
    // camera endpoint lets a hill crest cut across the view as a dark polygon.
    for (let step = 2; step <= 12; step++) {
      const fraction = step / 12;
      const x = THREE.MathUtils.lerp(this.curTarget.x, this.desired.x, fraction);
      const z = THREE.MathUtils.lerp(this.curTarget.z, this.desired.z, fraction);
      const rayY = THREE.MathUtils.lerp(this.curTarget.y, this.desired.y, fraction);
      if (heightAt(x, z) + 0.32 > rayY) {
        clearFraction = Math.min(clearFraction, Math.max(0.2, (step - 1) / 12 - 0.035));
        break;
      }
    }
    const fullArmLength = this.desired.distanceTo(this.curTarget);
    const clearArmLength = fullArmLength * clearFraction;
    const contracted = clearArmLength < this.armLength - 0.02;
    if (snapNow || contracted) this.armLength = clearArmLength;
    else this.armLength = THREE.MathUtils.lerp(
      this.armLength,
      clearArmLength,
      1 - Math.exp(-dt * 3.4),
    );

    if (fullArmLength > 0.001) {
      this.desired.sub(this.curTarget).multiplyScalar(this.armLength / fullArmLength).add(this.curTarget);
    }

    const floor = heightAt(this.desired.x, this.desired.z) + 0.4;
    if (this.desired.y < floor) this.desired.y = floor;

    if (snapNow || clearFraction < 0.999) {
      this.cur.copy(this.desired);
      this.forceSnap = false;
    } else {
      const followRate = mouse.looking || hasLookDelta ? 15 : 8.5 + speedFrac * 2.5;
      this.cur.lerp(this.desired, 1 - Math.exp(-dt * followRate));
    }
    this.camera.position.copy(this.cur);
    this.camera.lookAt(this.curTarget);
  }
}
