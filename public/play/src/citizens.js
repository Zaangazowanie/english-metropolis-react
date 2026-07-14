// Living city: ambient pedestrians drawn from the seven code-rigged Meshy townsfolk.
// EVERY BODY IS USED AT MOST ONCE (no duplicate characters on screen — Mike,
// 2026-07-03), no Wren clones (the player IS Wren), and citizens keep to the
// boulevards so they never loiter next to their hub-teacher twin on the plaza.
import * as THREE from 'three';
import { instanceRig } from './rig.js';
import { blobShadow } from './materials.js';
import { heightAt } from './terrain.js';
import { LINES } from './zones.js';
import { BOULEVARD } from './transit-layout.js';
import { circleHitsAABB, resolveCircleAgainstPeople } from './collision.js';

const WALK_SPEED = 1.35;
const RESPAWN_DIST = 175, SPAWN_NEAR = 110;
const TINTS = [0xc96f4a, 0x7ba05b, 0x8fb4c9, 0x6b4fa0, 0xe8a13d, 0xa2707f, 0x5e7b54, 0xb8452f];
const LINE_LIST = Object.values(LINES);

function sidewalkPoint(lineIndex, d, side, lat) {
  const line = LINE_LIST[lineIndex];
  const dirX = Math.cos(line.angle), dirZ = -Math.sin(line.angle);
  return {
    x: dirX * d + -dirZ * lat,
    z: dirZ * d + dirX * lat,
    lineIndex, d, side, lat,
  };
}

// boulevard sidewalks only — the plaza belongs to the (unique) hub teachers.
// minDist keeps (re)spawns OUT OF SIGHT: nobody may pop into existence in
// front of the player (Mike, 2026-07-03). Returns null when no legal point
// exists — callers must handle it, never dump a citizen at the fallback spot.
function randomSidewalkPoint(nearX = 0, nearZ = 0, spread = 999, minDist = 0, colliders = []) {
  for (let tries = 0; tries < 16; tries++) {
    const lineIndex = (Math.random() * LINE_LIST.length) | 0;
    const d = 45 + Math.random() * (BOULEVARD.carEndD - 45);
    const side = Math.random() < 0.5 ? -1 : 1;
    const point = sidewalkPoint(lineIndex, d, side, side * (5.35 + Math.random() * 0.8));
    const dist = Math.hypot(point.x - nearX, point.z - nearZ);
    if (dist < spread && dist >= minDist && !circleHitsAABB(point.x, point.z, 0.34, colliders)) return point;
  }
  return null;
}

function nextSidewalkPoint(from, range = 70, colliders = []) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const direction = attempt < 6 ? (Math.random() < 0.5 ? -1 : 1) : (attempt % 2 ? -1 : 1);
    let d = THREE.MathUtils.clamp(
      from.d + direction * (24 + Math.random() * Math.max(12, range - 24)),
      45,
      BOULEVARD.carEndD,
    );
    if (Math.abs(d - from.d) < 10) {
      d = THREE.MathUtils.clamp(from.d - direction * 32, 45, BOULEVARD.carEndD);
    }
    const lat = from.side * (5.35 + Math.random() * 0.8);
    const point = sidewalkPoint(from.lineIndex, d, from.side, lat);
    if (!circleHitsAABB(point.x, point.z, 0.34, colliders)) return point;
  }
  return sidewalkPoint(from.lineIndex, from.d, from.side, from.lat);
}

// ── ambient chatter: speech + thought bubbles over strolling citizens ──────
const SAY = [
  'Lovely evening, innit?', 'Mind the gap!', 'Which way to Kingston Yard?',
  'Two stops on the Sunward line.', "Y'alright, love?", 'Cracking sunset tonight.',
  'The bookshop had one copy left!', 'Fancy a cuppa after this?',
  'I missed the last train. Again.', 'New round of drills, they say.',
];
const THINK = [
  '…coffee…', 'left at the station… no, right…', '♪ ♫',
  'did I lock the flat?', '…that word again…', 'tickets… tickets…',
  'nearly rush hour…', '…one more drill…',
];
const bubbleCache = new Map();
function bubbleMaterial(text, thought) {
  const key = (thought ? 'T:' : 'S:') + text;
  if (bubbleCache.has(key)) return bubbleCache.get(key);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 224;
  const ctx = c.getContext('2d');
  const r = 26, x0 = 14, y0 = 12, w = 484, h = 132;
  ctx.fillStyle = 'rgba(250,248,255,0.96)';
  ctx.strokeStyle = 'rgba(139,92,246,0.55)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, r);
  ctx.fill(); ctx.stroke();
  if (thought) {           // trailing thought dots
    for (const [cx, cy, cr] of [[150, 168, 15], [118, 196, 9]]) {
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else {                 // speech tail
    ctx.beginPath();
    ctx.moveTo(150, y0 + h - 3); ctx.lineTo(122, 200); ctx.lineTo(196, y0 + h - 3);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(150, y0 + h - 2); ctx.lineTo(122, 200); ctx.lineTo(196, y0 + h - 2); ctx.stroke();
  }
  ctx.fillStyle = '#1b1030';
  ctx.font = `${thought ? 'italic ' : ''}600 34px 'Space Grotesk', sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // naive two-line wrap
  const words = text.split(' ');
  let l1 = '', l2 = '';
  for (const wd of words) ((l1 + wd).length <= 24 && !l2 ? (l1 += wd + ' ') : (l2 += wd + ' '));
  if (l2) { ctx.fillText(l1.trim(), x0 + w / 2, y0 + h / 2 - 22); ctx.fillText(l2.trim(), x0 + w / 2, y0 + h / 2 + 22); }
  else ctx.fillText(l1.trim(), x0 + w / 2, y0 + h / 2);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  bubbleCache.set(key, mat);
  return mat;
}

export class Citizens {
  constructor(scene, heroRig, npcBases = [], colliders = []) {
    this.scene = scene;
    this.list = [];
    this.density = 8;
    this.colliders = colliders;
    this.candidate = new THREE.Vector3();
    // body pool: the code-rigged Meshy townsfolk, each spawnable ONCE
    this.bodies = [];
    for (const b of npcBases) {
      if (b.rigged && b.clips?.walk) {
        this.bodies.push({ type: 'meshy', object: b.object || b.mesh, clips: b.clips });
      }
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
    const fallback = sidewalkPoint(0, 120, 1, 5.8);
    const p = randomSidewalkPoint(nearX, nearZ, nearX || nearZ ? SPAWN_NEAR : 999, 0, this.colliders)
      || (!circleHitsAABB(fallback.x, fallback.z, 0.34, this.colliders) ? fallback : null);
    if (!p) {
      this.free.push(bodyIdx);
      return;
    }
    const wrap = new THREE.Group();

    // distinct Meshy townsperson — own texture, wardrobe tint to set them
    // apart from their teaching twin working elsewhere in the city
    const inst = instanceRig(body.object, body.clips);
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

    // chatter bubble (hidden until this citizen has something to say)
    const bubble = new THREE.Sprite(bubbleMaterial(SAY[0], false));
    bubble.scale.set(2.3, 1.0, 1);
    bubble.position.y = 2.5;
    bubble.visible = false;
    wrap.add(bubble);

    wrap.position.set(p.x, heightAt(p.x, p.z), p.z);
    wrap.position.collisionRadius = 0.34;
    this.scene.add(wrap);

    mixer.update(Math.random() * 2);                    // desync strides
    const target = nextSidewalkPoint(p, 70, this.colliders);
    this.list.push({
      wrap, mixer, bodyIdx, route: p, target, heading: Math.random() * Math.PI * 2,
      bubble, bubbleTimer: 6 + Math.random() * 16, bubbleShow: 0, collisionRadius: 0.34,
    });
  }

  update(dt, playerPos, colliders = this.colliders, people = []) {
    this.colliders = colliders;
    for (const c of this.list) {
      const pos = c.wrap.position;
      const dx = c.target.x - pos.x, dz = c.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        c.route = c.target;
        c.target = nextSidewalkPoint(c.route, 70, colliders);
      } else {
        const want = Math.atan2(dx, dz);
        let diff = want - c.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        c.heading += diff * Math.min(1, dt * 3);
        this.candidate.set(
          pos.x + Math.sin(c.heading) * WALK_SPEED * dt,
          pos.y,
          pos.z + Math.cos(c.heading) * WALK_SPEED * dt,
        );
        resolveCircleAgainstPeople(this.candidate, null, c.collisionRadius, people, c.wrap);
        if (!circleHitsAABB(this.candidate.x, this.candidate.z, c.collisionRadius, colliders)) {
          pos.x = this.candidate.x;
          pos.z = this.candidate.z;
        } else {
          c.route = { ...c.route, x: pos.x, z: pos.z };
          c.target = nextSidewalkPoint(c.route, 52, colliders);
          c.heading += Math.PI * 0.55;
        }
        pos.y = heightAt(pos.x, pos.z);
        c.wrap.rotation.y = c.heading;
      }
      c.mixer.update(dt);

      const pd = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);

      // ambient chatter: nearby citizens occasionally speak or muse
      if (c.bubbleShow > 0) {
        c.bubbleShow -= dt;
        c.bubble.position.y = 2.5 + Math.sin(c.bubbleShow * 3) * 0.03;
        if (c.bubbleShow <= 0) c.bubble.visible = false;
      } else {
        c.bubbleTimer -= dt;
        if (c.bubbleTimer <= 0) {
          c.bubbleTimer = 9 + Math.random() * 18;
          if (pd < 38) {                               // only worth saying if seen
            const thought = Math.random() < 0.3;
            const pool = thought ? THINK : SAY;
            c.bubble.material = bubbleMaterial(pool[(Math.random() * pool.length) | 0], thought);
            c.bubble.visible = true;
            c.bubbleShow = 3.6;
          }
        }
      }

      // drifted out of range: move them back OUT OF SIGHT (50-110m ring),
      // never into view — if no legal point exists this frame, wait.
      if (pd > RESPAWN_DIST) {
        const p = randomSidewalkPoint(playerPos.x, playerPos.z, SPAWN_NEAR, 50, colliders);
        if (p) {
          pos.set(p.x, heightAt(p.x, p.z), p.z);
          c.route = p;
          c.target = nextSidewalkPoint(p, 70, colliders);
          c.bubble.visible = false; c.bubbleShow = 0;
        }
      }
    }
  }
}
