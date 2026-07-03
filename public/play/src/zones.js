// 44 dialect zones along the three metro boulevards: layout, procedural district
// architecture tinted from each zone's palette, station signs, streaming, and
// player zone detection. Content comes from src/gamedata/zones.json.
import * as THREE from 'three';
import { toonMat, blobShadow, PALETTE } from './materials.js';
import { assignGrammar, grammarForLap } from './grammar.js';
import { instanceRig } from './rig.js';
import { attachMarker } from './markers.js';

export const LINES = {
  isles:   { angle: Math.PI / 2,                    label: 'THE ISLES LINE',   color: 0x7ba05b },
  liberty: { angle: Math.PI / 2 + (2 * Math.PI) / 3, label: 'THE LIBERTY LINE', color: 0x8fb4c9 },
  sunward: { angle: Math.PI / 2 - (2 * Math.PI) / 3, label: 'THE SUNWARD LINE', color: 0xe8a13d },
};

const FIRST_STOP = 62, STOP_SPACING = 42, LATERAL = 26;
const R_BUILD = 150, R_DISPOSE = 190, R_INSIDE = 24;

// deterministic per-zone rng so streaming rebuilds identical districts
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export class ZoneManager {
  constructor(scene) {
    this.scene = scene;
    this.zones = [];          // computed defs { data, center, stopPos, dir, side, chunk|null }
    this.current = null;      // zone the player stands in
    this.onEnter = null;      // callback(zoneDef)
    this._colliderTag = new Map();
    this._npcTag = new Map(); // zoneCode -> spawned npc entries
    this.world = null;        // bound World (npc registry lives there)
    this.npcBase = null;      // rigged template { scene, animations } (Xbot)
    this.hubNpcs = [];        // hub teacher entries (their circuit code is 'hub')
    // Round-based progress per circuit code: { laps, d: {npcIdx:done}, w: {npcIdx:warmup} }.
    // Complete every teacher in a circuit → laps++, d/w reset, everyone gets
    // fresh (harder) exercises. Migrates the old flat {idx:true,_bonused} shape.
    this.progress = JSON.parse(localStorage.getItem('em_progress') || '{}');
    let migrated = false;
    for (const [code, p] of Object.entries(this.progress)) {
      if (p && typeof p === 'object' && !('d' in p)) {
        const d = {};
        for (const k of Object.keys(p)) if (k !== '_bonused') d[k] = true;
        this.progress[code] = p._bonused ? { laps: 1, d: {}, w: {} } : { laps: 0, d, w: {} };
        migrated = true;
      }
    }
    if (migrated) this.saveProgress();
  }

  bindWorld(world) { this.world = world; }
  setNPCBase(gltf) { this.npcBase = gltf; }              // legacy (rigged single base)
  setNPCBases(models) { this.npcBases = models; }        // array of Meshy character scenes

  // hub teachers join the quest system as their own circuit ('hub')
  bindHub(entries) {
    this.hubNpcs = entries;
    const p = this.progressFor('hub');
    entries.forEach((n) => {
      n.done = !!p.d[n.npcIdx];
      n.grammar = grammarForLap(n.baseGrammar || n.grammar, p.laps);
      n.refreshMarker?.();
    });
  }

  saveProgress() { localStorage.setItem('em_progress', JSON.stringify(this.progress)); }

  progressFor(code) { return this.progress[code] || { laps: 0, d: {}, w: {} }; }
  _ensure(code) {
    return this.progress[code] || (this.progress[code] = { laps: 0, d: {}, w: {} });
  }

  circuitName(code) {
    if (code === 'hub') return 'Metropolis Central';
    return this.zones.find((z) => z.data.code === code)?.data.zoneName || code;
  }
  teacherTotal(code) {
    if (code === 'hub') return Math.max(1, this.hubNpcs.length || 4);
    const z = this.zones.find((zz) => zz.data.code === code);
    return z ? Math.min(2, z.data.npcs.length) : 2;
  }
  // { round, laps, done, total, remaining } for the journal / objective HUD
  roundStatus(code) {
    const p = this.progressFor(code);
    const total = this.teacherTotal(code);
    const done = Object.keys(p.d).length;
    return { laps: p.laps, round: p.laps + 1, done, total, remaining: total - done };
  }

  // dialect warm-up question: rewards XP once per teacher per round
  warmupAvailable(npc) {
    if (!npc.zoneCode) return true;
    return !this.progressFor(npc.zoneCode).w[npc.npcIdx];
  }
  claimWarmup(npc) {
    if (!npc.zoneCode) return true;
    const p = this._ensure(npc.zoneCode);
    if (p.w[npc.npcIdx]) return false;
    p.w[npc.npcIdx] = true;
    this.saveProgress();
    return true;
  }

  // teacher passed their drill. Returns round bookkeeping:
  //  { roundComplete, laps, nextRound, bonus, zoneName } when the circuit closed,
  //  { roundComplete: false, remaining, total } otherwise.
  recordDone(npc) {
    if (!npc.zoneCode) return null;
    const p = this._ensure(npc.zoneCode);
    if (!p.d[npc.npcIdx]) { p.d[npc.npcIdx] = true; this.saveProgress(); }
    const total = this.teacherTotal(npc.zoneCode);
    const done = Object.keys(p.d).length;
    if (done >= total) {
      p.laps++; p.d = {}; p.w = {};
      this.saveProgress();
      this.refreshTeachers(npc.zoneCode);
      return {
        roundComplete: true, laps: p.laps, nextRound: p.laps + 1,
        bonus: 20 + 15 * p.laps, zoneName: this.circuitName(npc.zoneCode),
      };
    }
    return { roundComplete: false, remaining: total - done, total, done };
  }

  // a circuit's round closed: hand every spawned teacher there a fresh set
  refreshTeachers(code) {
    const p = this.progressFor(code);
    if (code === 'hub') {
      for (const n of this.hubNpcs) {
        n.done = false;
        n.grammar = grammarForLap(n.baseGrammar || n.grammar, p.laps);
        n.refreshMarker?.();
      }
      return;
    }
    const z = this.zones.find((zz) => zz.data.code === code);
    for (const n of this._npcTag.get(code) || []) {
      n.done = false;
      if (z) n.grammar = assignGrammar(z.stopIdx, n.npcIdx, z.lineKey, p.laps);
      n.refreshMarker?.();
    }
  }

  async init() {
    const { zones } = await (await fetch('src/gamedata/zones.json')).json();
    const perLine = { isles: [], liberty: [], sunward: [] };
    for (const z of zones) perLine[z.line]?.push(z);
    for (const [lineKey, list] of Object.entries(perLine)) {
      const L = LINES[lineKey];
      const dir = new THREE.Vector2(Math.cos(L.angle), -Math.sin(L.angle)); // world xz along line
      const perp = new THREE.Vector2(-dir.y, dir.x);
      list.forEach((data, i) => {
        const stopIdx = Math.floor(i / 2);
        const side = i % 2 === 0 ? 1 : -1;
        const d = FIRST_STOP + stopIdx * STOP_SPACING;
        const stop = new THREE.Vector2(dir.x * d, dir.y * d);
        const center = stop.clone().addScaledVector(perp, side * LATERAL);
        this.zones.push({
          data, lineKey, line: L, side, stopIdx,
          dir: new THREE.Vector2(dir.x, dir.y), perp,
          stopPos: stop, center, chunk: null,
        });
      });
    }
  }

  // nearest dialect region (Voronoi by zone center); null = the central hub
  regionAt(x, z) {
    if (Math.hypot(x, z) < 55) return null;
    let best = null, bestD = Infinity;
    for (const zn of this.zones) {
      const dx = x - zn.center.x, dz = z - zn.center.y;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = zn; }
    }
    return best;
  }

  update(playerPos, colliders) {
    const p = new THREE.Vector2(playerPos.x, playerPos.z);
    for (const z of this.zones) {
      const d = p.distanceTo(z.center);
      if (!z.chunk && d < R_BUILD) this.buildChunk(z, colliders);
      else if (z.chunk && d > R_DISPOSE) this.disposeChunk(z, colliders);
    }
    // the whole city is dialect turf: HUD names whichever region you stand in
    const inside = this.regionAt(playerPos.x, playerPos.z);
    if (inside !== this.current) {
      this.current = inside;
      this.onEnter?.(inside);
    }
  }

  // ---------- district construction ----------
  buildChunk(z, colliders) {
    const rng = mulberry32(hash(z.data.code));
    const g = new THREE.Group();
    const pal = z.data.palette;
    const cPrimary = new THREE.Color(pal.primary);
    const cSecondary = new THREE.Color(pal.secondary);
    const cAccent = new THREE.Color(pal.accent);
    const cRoof = new THREE.Color(pal.roof);

    // district ground: concrete pavement with only a hint of the zone's colour
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 56),
      toonMat(new THREE.Color(PALETTE.plaza).lerp(cPrimary, 0.15))
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.03;
    ground.receiveShadow = true;
    g.add(ground);
    // sidewalk ring + curb line around the block
    const walkMat = toonMat(PALETTE.sidewalk);
    const curbMat = toonMat(PALETTE.curb);
    for (const [w, d, x, zz] of [[50, 2.6, 0, -29.3], [50, 2.6, 0, 29.3], [2.6, 56, -26.3, 0], [2.6, 56, 26.3, 0]]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(w, d), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(x, 0.032, zz);
      g.add(walk);
      const curb = new THREE.Mesh(new THREE.PlaneGeometry(w === 50 ? 50 : 0.45, w === 50 ? 0.45 : 56), curbMat);
      curb.rotation.x = -Math.PI / 2;
      curb.position.set(x * 1.045, 0.034, zz * 1.045);
      g.add(curb);
    }

    // buildings: bigger block — 3×4 grid around a courtyard, walls + roofs
    const slots = [];
    for (let ix = -1; ix <= 1; ix++) for (let iz = -2; iz <= 1; iz++) {
      if (ix === 0 && (iz === 0 || iz === -1)) continue;   // central courtyard
      if (rng() < 0.18) continue;                           // gaps = alleys
      slots.push([ix, iz]);
    }
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toonMat(0xffffff), slots.length);
    const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toonMat(0xffffff), slots.length);
    const M = new THREE.Matrix4(), col = new THREE.Color();
    const zoneColliders = [];
    slots.forEach(([ix, iz], i) => {
      const w = 8 + rng() * 4.5, dpt = 7 + rng() * 4;
      const h = 4.5 + rng() * 7.5;
      const x = ix * 15 + (rng() - 0.5) * 2.2;
      const zz = iz * 13 + 6.5 + (rng() - 0.5) * 1.8;
      M.makeScale(w, h, dpt).setPosition(x, h / 2, zz);
      walls.setMatrixAt(i, M);
      walls.setColorAt(i, col.copy(rng() < 0.5 ? cPrimary : cSecondary));
      M.makeScale(w + 0.7, 0.55, dpt + 0.7).setPosition(x, h + 0.27, zz);
      roofs.setMatrixAt(i, M);
      roofs.setColorAt(i, col.copy(cRoof));
      zoneColliders.push({ localX: x, localZ: zz, hw: w / 2 + 0.2, hd: dpt / 2 + 0.2 });
    });
    walls.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    walls.castShadow = walls.receiveShadow = true;
    roofs.castShadow = true;
    g.add(walls, roofs);

    // landmark in the courtyard — variant by zone hash
    const lm = this.buildLandmark(hash(z.data.code) % 3, cAccent, cRoof, rng);
    lm.position.set(0, 0, 0);
    g.add(lm);
    zoneColliders.push({ localX: 0, localZ: 0, hw: 1.6, hd: 1.6 });

    // awning accents on courtyard-facing walls
    for (let k = 0; k < 4; k++) {
      const aw = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 1.2), toonMat(cAccent));
      const ang = rng() * Math.PI * 2;
      aw.position.set(Math.cos(ang) * 6.5, 2.4 + rng() * 1.2, Math.sin(ang) * 5.5);
      aw.rotation.y = -ang;
      aw.rotation.z = 0.18;
      g.add(aw);
    }

    // orient district: face the boulevard
    const yaw = Math.atan2(z.perp.x * z.side, z.perp.y * z.side);
    g.rotation.y = yaw;
    g.position.set(z.center.x, 0, z.center.y);

    // station sign + platform at the stop
    const sign = this.buildStationSign(z);
    sign.position.set(z.stopPos.x + z.perp.x * z.side * 8.2, 0, z.stopPos.y + z.perp.y * z.side * 8.2);
    sign.rotation.y = yaw;
    // zebra crossing over the boulevard at this stop
    const zebra = new THREE.Group();
    const stripeMat = toonMat(0xe8dcbb);
    for (let s = 0; s < 7; s++) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 2.2), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(-3.9 + s * 1.3, 0.022, 0);
      zebra.add(stripe);
    }
    zebra.position.set(z.stopPos.x, 0, z.stopPos.y);
    zebra.rotation.y = Math.atan2(z.dir.x, z.dir.y);   // stripes span the road width
    this.scene.add(zebra);
    g.attachZebra = zebra;
    g.attachSign = sign;
    this.scene.add(sign);

    this.scene.add(g);
    z.chunk = g;

    // world-space colliders (district rotated — transform local offsets)
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const tagged = zoneColliders.map((c) => {
      const wx = z.center.x + c.localX * cosY + c.localZ * sinY;
      const wz = z.center.y - c.localX * sinY + c.localZ * cosY;
      const r = Math.max(c.hw, c.hd);      // conservative square after rotation
      return { minX: wx - r, maxX: wx + r, minZ: wz - r, maxZ: wz + r };
    });
    colliders.push(...tagged);
    this._colliderTag.set(z.data.code, tagged);

    // --- zone NPCs (2 per zone, from zones.json) — Mike's Meshy cast ---
    if (this.npcBases?.length && this.world) {
      const spawned = [];
      const zoneProg = this.progressFor(z.data.code);
      const locals = [[-5.5, 4.5], [5.5, -4.5]];
      // body assignment is unique PER STOP: the two zones flanking a station
      // (side ±1) draw four consecutive pool slots, so no two teachers you can
      // see from one platform share a body
      const stopSlot = hash(`${z.lineKey}:${z.stopIdx}`);
      z.data.npcs.slice(0, 2).forEach((npcData, i) => {
        const base = this.npcBases[(stopSlot + (z.side > 0 ? 0 : 2) + i) % this.npcBases.length];
        const tint = new THREE.Color(i === 0 ? z.data.palette.accent : z.data.palette.secondary);
        const s = 0.95 + rng() * 0.12;
        const wrap = new THREE.Group();
        const [lx, lz] = locals[i];
        wrap.position.set(
          z.center.x + lx * cosY + lz * sinY, 0,
          z.center.y - lx * sinY + lz * cosY
        );
        wrap.rotation.y = yaw + (i === 0 ? 0.6 : -2.2);
        wrap.scale.setScalar(s);
        wrap.add(blobShadow(0.5 * s));

        const entry = {
          obj: wrap,
          name: npcData.name, role: npcData.role, greeting: npcData.greeting,
          // warm-up question rotates with the round so repeat visits stay fresh
          exercise: z.data.sampleExercises[(i + zoneProg.laps) % z.data.sampleExercises.length],
          grammar: assignGrammar(z.stopIdx, i, z.lineKey, zoneProg.laps),
          dialectCode: z.data.code,
          voiceId: `${z.data.code}_${i}`, barkFam: z.lineKey,
          done: !!zoneProg.d[i],
          zoneCode: z.data.code, npcIdx: i, phase: rng() * 6,
          gestureCorrect: 'agree', gestureWrong: 'headShake', gestureGreet: 'Wave',
        };
        attachMarker(entry, 2.3);   // local units — wrap scale applies on top
        if (base?.rigged) {
          const inst = instanceRig(base.mesh, base.clips);
          inst.mesh.material = inst.mesh.material.clone();
          inst.mesh.material.color.lerp(tint, 0.22);
          wrap.add(inst.object);
          entry.model = inst.mesh; entry.mixer = inst.mixer; entry.playOnce = inst.playGesture;
        } else {
          const model = base.staticModel.clone(true);
          model.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.lerp(tint, 0.22); o.castShadow = true; } });
          wrap.add(model);
          entry.model = model;
          entry.playOnce = (name) => { entry.gesture = { name, t: 0 }; };
        }
        this.scene.add(wrap);
        this.world.npcs.push(entry);
        spawned.push(entry);
      });
      this._npcTag.set(z.data.code, spawned);
    }
  }

  buildLandmark(variant, cAccent, cRoof, rng) {
    const g = new THREE.Group();
    if (variant === 0) {           // clock-ish tower
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.45, 9, 8), toonMat(cAccent));
      base.position.y = 4.5;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.4, 8), toonMat(cRoof));
      cap.position.y = 10.2;
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), toonMat(0xfff0c2));
      finial.position.y = 11.6;
      g.add(base, cap, finial);
    } else if (variant === 1) {    // arch
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.1, 6.5, 1.1), toonMat(cAccent));
      const r = l.clone();
      l.position.set(-2.5, 3.25, 0); r.position.set(2.5, 3.25, 0);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.2, 1.4), toonMat(cRoof));
      lintel.position.y = 7.1;
      g.add(l, r, lintel);
    } else {                        // obelisk + ring
      const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.05, 8, 4), toonMat(cAccent));
      ob.position.y = 4;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.16, 8, 20), toonMat(cRoof));
      ring.position.y = 6.2; ring.rotation.x = Math.PI / 2;
      g.add(ob, ring);
    }
    g.traverse((o) => { if (o.isMesh) o.userData.zoneLandmark = true; });
    return g;
  }

  buildStationSign(z) {
    const g = new THREE.Group();
    // canvas nameplate
    const c = document.createElement('canvas');
    c.width = 512; c.height = 168;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f6ead2';
    ctx.fillRect(0, 0, 512, 168);
    ctx.fillStyle = '#' + z.line.color.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 512, 26);
    ctx.fillStyle = '#4a3826';
    ctx.font = 'bold 46px Georgia';
    ctx.textAlign = 'center';
    const name = z.data.zoneName;
    ctx.font = `bold ${name.length > 16 ? 36 : 46}px Georgia`;
    ctx.fillText(name, 256, 88);
    ctx.font = 'italic 24px Georgia';
    ctx.fillStyle = '#8a6f4d';
    ctx.fillText(z.data.dialect, 256, 132);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.18),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    panel.position.y = 2.9;
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), toonMat(PALETTE.ink));
    const post2 = post1.clone();
    post1.position.set(-1.6, 1.5, 0); post2.position.set(1.6, 1.5, 0);
    // platform pad
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.4), toonMat(new THREE.Color(z.line.color).lerp(new THREE.Color(0xf2e3c4), 0.6)));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.035;
    g.add(panel, post1, post2, pad);
    g.userData.tex = tex;
    return g;
  }

  disposeChunk(z, colliders) {
    const kill = (root) => root.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    if (z.chunk.attachSign) { kill(z.chunk.attachSign); this.scene.remove(z.chunk.attachSign); }
    if (z.chunk.attachZebra) { kill(z.chunk.attachZebra); this.scene.remove(z.chunk.attachZebra); }
    kill(z.chunk);
    this.scene.remove(z.chunk);
    z.chunk = null;
    const tagged = this._colliderTag.get(z.data.code) || [];
    for (const t of tagged) {
      const i = colliders.indexOf(t);
      if (i >= 0) colliders.splice(i, 1);
    }
    this._colliderTag.delete(z.data.code);

    // despawn this zone's NPCs
    const npcs = this._npcTag.get(z.data.code) || [];
    for (const n of npcs) {
      n.mixer?.stopAllAction();
      // geometry is shared with the template — dispose only the per-NPC materials
      n.obj.traverse((o) => { if (o.isMesh && o.material?.dispose) o.material.dispose(); });
      this.scene.remove(n.obj);
      const i = this.world.npcs.indexOf(n);
      if (i >= 0) this.world.npcs.splice(i, 1);
    }
    this._npcTag.delete(z.data.code);
  }
}
