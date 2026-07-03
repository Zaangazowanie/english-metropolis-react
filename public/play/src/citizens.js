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

// boulevard sidewalks only — the plaza belongs to the (unique) hub teachers.
// minDist keeps (re)spawns OUT OF SIGHT: nobody may pop into existence in
// front of the player (Mike, 2026-07-03). Returns null when no legal point
// exists — callers must handle it, never dump a citizen at the fallback spot.
function randomSidewalkPoint(nearX = 0, nearZ = 0, spread = 999, minDist = 0) {
  for (let tries = 0; tries < 16; tries++) {
    const L = Object.values(LINES)[(Math.random() * 3) | 0];
    const d = 45 + Math.random() * 355;
    const lat = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 9);
    const dirX = Math.cos(L.angle), dirZ = -Math.sin(L.angle);
    const x = dirX * d + -dirZ * lat;
    const z = dirZ * d + dirX * lat;
    const dist = Math.hypot(x - nearX, z - nearZ);
    if (dist < spread && dist >= minDist) return { x, z };
  }
  return null;
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

    // chatter bubble (hidden until this citizen has something to say)
    const bubble = new THREE.Sprite(bubbleMaterial(SAY[0], false));
    bubble.scale.set(2.3, 1.0, 1);
    bubble.position.y = 2.5;
    bubble.visible = false;
    wrap.add(bubble);

    const p = randomSidewalkPoint(nearX, nearZ, nearX || nearZ ? SPAWN_NEAR : 999)
      || { x: 60, z: -120 };                            // safe far default
    wrap.position.set(p.x, heightAt(p.x, p.z), p.z);
    this.scene.add(wrap);

    mixer.update(Math.random() * 2);                    // desync strides
    const target = randomSidewalkPoint(p.x, p.z, 70) || { x: p.x, z: p.z };
    this.list.push({
      wrap, mixer, bodyIdx, target, heading: Math.random() * Math.PI * 2,
      bubble, bubbleTimer: 6 + Math.random() * 16, bubbleShow: 0,
    });
  }

  update(dt, playerPos) {
    for (const c of this.list) {
      const pos = c.wrap.position;
      const dx = c.target.x - pos.x, dz = c.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        c.target = randomSidewalkPoint(pos.x, pos.z, 70) || c.target;
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
        const p = randomSidewalkPoint(playerPos.x, playerPos.z, SPAWN_NEAR, 50);
        if (p) {
          pos.set(p.x, heightAt(p.x, p.z), p.z);
          c.target = randomSidewalkPoint(p.x, p.z, 70) || c.target;
          c.bubble.visible = false; c.bubbleShow = 0;
        }
      }
    }
  }
}
