// 44 dialect zones along the three metro boulevards: layout, procedural district
// architecture tinted from each zone's palette, station signs, streaming, and
// player zone detection. Content comes from src/gamedata/zones.json.
import * as THREE from 'three';
import { toonMat, blobShadow, PALETTE } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assignGrammar, grammarForLap } from './grammar.js';
import { instanceRig } from './rig.js';
import { attachMarker } from './markers.js';

export const LINES = {
  isles:   { angle: Math.PI / 2,                    label: 'THE ISLES LINE',   color: 0x4deeea },
  liberty: { angle: Math.PI / 2 + (2 * Math.PI) / 3, label: 'THE LIBERTY LINE', color: 0x8b7dff },
  sunward: { angle: Math.PI / 2 - (2 * Math.PI) / 3, label: 'THE SUNWARD LINE', color: 0xff6f91 },
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
    const lineColor = new THREE.Color(z.line.color);
    const cPrimary = new THREE.Color(pal.primary).lerp(new THREE.Color(PALETTE.glass), 0.68);
    const cSecondary = new THREE.Color(pal.secondary).lerp(new THREE.Color(0x65718f), 0.58);
    const cAccent = new THREE.Color(pal.accent).lerp(lineColor, 0.64);
    const cRoof = new THREE.Color(pal.roof).lerp(new THREE.Color(PALETTE.ink), 0.66);

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

    // buildings: bigger block — 3×4 grid around a courtyard. Real facades
    // (plinth, window grids, cornices, setbacks, storefronts) merged into a
    // handful of meshes per district — Abeto-grade streets, still cheap.
    const slots = [];
    for (let ix = -1; ix <= 1; ix++) for (let iz = -2; iz <= 1; iz++) {
      if (ix === 0 && (iz === 0 || iz === -1)) continue;   // central courtyard
      if (rng() < 0.18) continue;                           // gaps = alleys
      slots.push([ix, iz]);
    }
    const zoneColliders = this.buildFacadeBlock(g, slots, rng, { cPrimary, cSecondary, cAccent, cRoof });

    // landmark in the courtyard — variant by zone hash
    const lm = this.buildLandmark(hash(z.data.code) % 3, cAccent, cRoof);
    lm.position.set(0, 0, 0);
    g.add(lm);
    zoneColliders.push({ localX: 0, localZ: 0, hw: 1.6, hd: 1.6 });

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

  // ---------- facade architecture ----------
  // Every slot becomes one of four building archetypes so streets read like a
  // grown neighbourhood, not a generator: ROWHOUSE (pitched roof, tall sash
  // windows with sills), BRICK block (floor banding, parapet), SHOP (glass
  // shopfront, fascia sign, awning) and TOWER (setback tier, drainpipes).
  // Everything merges into ~10 meshes per district.
  buildFacadeBlock(g, slots, rng, { cPrimary, cSecondary, cAccent, cRoof }) {
    const CREAM = new THREE.Color(0xcbd7e9);
    const wallTones = [
      cPrimary.clone().lerp(CREAM, 0.52),
      cSecondary.clone().lerp(CREAM, 0.56),
      CREAM.clone().lerp(cPrimary, 0.16),
      cAccent.clone().lerp(CREAM, 0.62),
    ];
    const trimTone = cPrimary.clone().multiplyScalar(0.52).lerp(new THREE.Color(PALETTE.ink), 0.54);
    const bandTone = CREAM.clone().lerp(trimTone, 0.3);      // ground-floor stone
    const roofTone = cRoof.clone().lerp(CREAM, 0.18);

    const B = { wall0: [], wall1: [], wall2: [], wall3: [], trim: [], band: [], roof: [],
      paneLit: [], paneDark: [], accent: [] };
    const boxG = (bucket, w, h, d, x, y, z) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      geo.translate(x, y, z);
      bucket.push(geo);
    };
    const quad = (bucket, w, h, x, y, z, ry) => {
      const geo = new THREE.PlaneGeometry(w, h);
      if (ry) geo.rotateY(ry);
      geo.translate(x, y, z);
      bucket.push(geo);
    };
    const pitchedRoof = (x, z, w, d, yTop, rh) => {
      const geo = new THREE.CylinderGeometry(0.72, 0.72, 1, 3, 1);
      geo.rotateX(Math.PI / 2); geo.rotateY(Math.PI / 2);
      geo.scale(w * 1.14, rh, d * 1.14);
      geo.translate(x, yTop + rh * 0.34, z);
      B.roof.push(geo);
    };

    const FACES = [
      { nx: 0, nz: 1, tx: 1, tz: 0, ry: 0 },
      { nx: 0, nz: -1, tx: -1, tz: 0, ry: Math.PI },
      { nx: 1, nz: 0, tx: 0, tz: -1, ry: Math.PI / 2 },
      { nx: -1, nz: 0, tx: 0, tz: 1, ry: -Math.PI / 2 },
    ];
    // window grid with per-archetype dressing (sills / lintels)
    const addWindows = (bx, bz, w, d, yBase, yTop, skipFace, opts = {}) => {
      const { winW = 1.1, winH = 1.35, sills = false, lintels = false, maxCols = 4 } = opts;
      for (const F of FACES) {
        if (skipFace && F === skipFace) continue;
        const ext = (F.nx ? w : d) / 2;
        const span = F.nx ? d : w;
        const cols = Math.min(maxCols, Math.max(1, Math.floor((span - 1.7) / 2.05)));
        const total = cols * 2.05;
        for (let y = yBase; y <= yTop; y += 2.55) {
          for (let c = 0; c < cols; c++) {
            const u = -total / 2 + 2.05 * (c + 0.5);
            const fx = bx + F.tx * u, fz = bz + F.tz * u;
            quad(B.trim, winW + 0.24, winH + 0.24, fx + F.nx * (ext + 0.03), y, fz + F.nz * (ext + 0.03), F.ry);
            quad(rng() < 0.34 ? B.paneLit : B.paneDark, winW - 0.16, winH - 0.16,
              fx + F.nx * (ext + 0.06), y, fz + F.nz * (ext + 0.06), F.ry);
            const bw = Math.abs(F.tx) * (winW + 0.4) + Math.abs(F.nx) * 0.2;
            const bd = Math.abs(F.tz) * (winW + 0.4) + Math.abs(F.nz) * 0.2;
            if (sills) boxG(B.trim, bw, 0.1, bd, fx + F.nx * (ext + 0.08), y - winH / 2 - 0.07, fz + F.nz * (ext + 0.08));
            if (lintels) boxG(B.trim, bw, 0.13, bd, fx + F.nx * (ext + 0.06), y + winH / 2 + 0.1, fz + F.nz * (ext + 0.06));
          }
        }
      }
    };

    const zoneColliders = [];
    slots.forEach(([ix, iz], i) => {
      const w = 8 + rng() * 4.5, dpt = 7 + rng() * 4;
      let h = 4.5 + rng() * 7.5;
      const x = ix * 15 + (rng() - 0.5) * 2.2;
      const zz = iz * 13 + 6.5 + (rng() - 0.5) * 1.8;
      const wallBucket = B[`wall${i % 4}`];

      // archetype: towers stay tall; the rest split row / brick / shop
      const pick = rng();
      const arch = h > 8.6 ? 'tower' : pick < 0.32 ? 'row' : pick < 0.66 ? 'brick' : 'shop';
      if (arch === 'row') h = Math.min(h, 6.6);

      // face the courtyard (local origin) for the entrance
      let front = FACES[0], best = -Infinity;
      for (const F of FACES) {
        const dot = F.nx * -x + F.nz * -zz;
        if (dot > best) { best = dot; front = F; }
      }
      const ext = (front.nx ? w : dpt) / 2;
      const fpx = (off) => x + front.nx * (ext + off);
      const fpz = (off) => zz + front.nz * (ext + off);

      // plinth + body
      boxG(B.trim, w + 0.18, 0.9, dpt + 0.18, x, 0.45, zz);
      const tall = arch === 'tower';
      const h1 = tall ? h * 0.62 : h;
      boxG(wallBucket, w, h1 - 0.9, dpt, x, 0.9 + (h1 - 0.9) / 2, zz);

      if (arch === 'row') {
        // rowhouse: tall sash windows, sills + lintels, pitched roof, chimney
        addWindows(x, zz, w, dpt, 2.3, h - 1.5, front, { winW: 1.0, winH: 1.5, sills: true, lintels: true, maxCols: 3 });
        boxG(B.trim, w + 0.3, 0.22, dpt + 0.3, x, h + 0.06, zz);           // eave
        pitchedRoof(x, zz, w, dpt, h + 0.1, 1.5 + rng() * 0.7);
        boxG(B.trim, 0.55, 1.5, 0.55, x + w * 0.3, h + 0.9, zz + dpt * 0.18); // chimney
        boxG(B.trim, 1.7, 0.22, 1.0, fpx(0.4), 2.45, fpz(0.4));            // door hood
      } else if (arch === 'brick') {
        // brick block: floor banding, lintels, parapet roof
        addWindows(x, zz, w, dpt, 2.3, h1 - 1.3, front, { winW: 1.15, winH: 1.3, lintels: true });
        for (let yb = 3.55; yb < h1 - 1.1; yb += 2.55)
          boxG(B.band, w + 0.12, 0.16, dpt + 0.12, x, yb, zz);             // string courses
        boxG(B.trim, w + 0.36, 0.28, dpt + 0.36, x, h1 + 0.14, zz);        // cornice
        boxG(B.roof, w - 0.3, 0.22, dpt - 0.3, x, h1 + 0.31, zz);
        if (rng() < 0.5) boxG(B.trim, 1.5, 0.95, 1.3, x + (rng() - 0.5) * w * 0.4, h1 + 0.7, zz);
      } else if (arch === 'shop') {
        // shop: stone ground band, glass shopfront + fascia + awning above
        boxG(B.band, w + 0.08, 2.5, dpt + 0.08, x, 2.15, zz);              // ground floor
        const gw = Math.min(w, dpt) >= 8 ? 3 : 2;
        for (let k = 0; k < gw; k++) {
          const u = (k - (gw - 1) / 2) * 2.1;
          quad(B.paneDark, 1.75, 1.75, x + front.tx * u + front.nx * (ext + 0.1),
            1.95, zz + front.tz * u + front.nz * (ext + 0.1), front.ry);
        }
        quad(B.accent, Math.min(w, dpt) * 0.86, 0.6, fpx(0.1), 3.15, fpz(0.1), front.ry);  // fascia sign
        boxG(B.accent, Math.min(w, dpt) * 0.8, 0.14, 1.1, fpx(0.6), 2.7, fpz(0.6));        // awning
        addWindows(x, zz, w, dpt, 4.9, h1 - 1.2, null, { winW: 1.15, winH: 1.25, sills: true });
        boxG(B.trim, w + 0.36, 0.28, dpt + 0.36, x, h1 + 0.14, zz);
        boxG(B.roof, w - 0.3, 0.22, dpt - 0.3, x, h1 + 0.31, zz);
      } else {
        // tower: banded lower tier, setback upper tier, drainpipes
        addWindows(x, zz, w, dpt, 2.3, h1 - 1.3, front, { winW: 1.2, winH: 1.35 });
        boxG(B.trim, w + 0.36, 0.28, dpt + 0.36, x, h1 + 0.14, zz);
        const wTop = w - 1.6, dTop = dpt - 1.6;
        boxG(wallBucket, wTop, h - h1 - 0.3, dTop, x, h1 + 0.28 + (h - h1 - 0.3) / 2, zz);
        addWindows(x, zz, wTop, dTop, h1 + 1.5, h - 1.2, null, { winW: 1.2, winH: 1.35 });
        boxG(B.trim, wTop + 0.36, 0.28, dTop + 0.36, x, h + 0.14, zz);
        boxG(B.roof, wTop - 0.3, 0.22, dTop - 0.3, x, h + 0.31, zz);
        boxG(B.trim, 1.5, 1.0, 1.3, x + (rng() - 0.5) * wTop * 0.4, h + 0.8, zz);
        if (rng() < 0.6) {
          boxG(B.trim, 0.1, h1 - 0.9, 0.1, x + w / 2 - 0.22, (h1 + 0.9) / 2, zz + dpt / 2 + 0.08);
          boxG(B.trim, 0.1, h1 - 0.9, 0.1, x - w / 2 + 0.22, (h1 + 0.9) / 2, zz + dpt / 2 + 0.08);
        }
      }

      // entrance on the courtyard face (all archetypes)
      quad(B.trim, 1.4, 2.35, fpx(0.04), 1.18, fpz(0.04), front.ry);       // doorway
      quad(B.paneDark, 1.02, 1.45, fpx(0.07), 1.42, fpz(0.07), front.ry);
      boxG(B.band, 1.8, 0.18, 1.1, fpx(0.35), 0.09, fpz(0.35));            // door step
      if (arch !== 'shop') {
        boxG(B.accent, 2.4, 0.15, 1.0, fpx(0.55), 2.6, fpz(0.55));         // awning
        if (rng() < 0.6) quad(B.accent, 1.9, 0.5, fpx(0.05), 3.3, fpz(0.05), front.ry);
      }

      zoneColliders.push({ localX: x, localZ: zz, hw: w / 2 + 0.2, hd: dpt / 2 + 0.2 });
    });

    // merge each bucket into one mesh
    const litMat = toonMat(0x10243c);
    litMat.emissive = cAccent.clone().lerp(new THREE.Color(PALETTE.cyan), 0.35);
    litMat.emissiveIntensity = 1.08;
    const mats = {
      wall0: toonMat(wallTones[0]), wall1: toonMat(wallTones[1]),
      wall2: toonMat(wallTones[2]), wall3: toonMat(wallTones[3]),
      trim: toonMat(trimTone), band: toonMat(bandTone), roof: toonMat(roofTone),
      paneLit: litMat, paneDark: toonMat(0x101a2b), accent: toonMat(cAccent),
    };
    for (const [key, list] of Object.entries(B)) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mats[key]);
      if (key.startsWith('pane')) { mesh.castShadow = false; }
      else { mesh.castShadow = true; mesh.receiveShadow = true; }
      g.add(mesh);
    }
    return zoneColliders;
  }

  buildLandmark(variant, cAccent, cRoof) {
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
    ctx.fillStyle = '#10172b';
    ctx.fillRect(0, 0, 512, 168);
    ctx.fillStyle = '#' + z.line.color.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 512, 26);
    ctx.fillStyle = '#f5f2ff';
    ctx.font = "700 46px 'Space Grotesk', sans-serif";
    ctx.textAlign = 'center';
    const name = z.data.zoneName;
    ctx.font = `700 ${name.length > 16 ? 36 : 46}px 'Space Grotesk', sans-serif`;
    ctx.fillText(name, 256, 88);
    ctx.font = "600 23px 'Space Grotesk', sans-serif";
    ctx.fillStyle = '#79f5ec';
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
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.4), toonMat(new THREE.Color(z.line.color).lerp(new THREE.Color(PALETTE.plaza), 0.68)));
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
