// 44 dialect zones along the three metro boulevards: layout, procedural district
// architecture tinted from each zone's palette, station signs, streaming, and
// player zone detection. Content comes from src/gamedata/zones.json.
import * as THREE from 'three';
import { toonMat, blobShadow, PALETTE } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assignGrammar, grammarForLap } from './grammar.js';
import { instanceRig } from './rig.js';
import { attachMarker } from './markers.js';
import { BOULEVARD } from './transit-layout.js';
import { buildDistrictLife } from './city-life.js';
import { accentProfileFor, districtCastFor } from './dialects.js';

export const LINES = {
  isles:   { angle: Math.PI / 2,                    label: 'THE ISLES LINE',   color: 0x4deeea },
  liberty: { angle: Math.PI / 2 + (2 * Math.PI) / 3, label: 'THE LIBERTY LINE', color: 0x8b7dff },
  sunward: { angle: Math.PI / 2 - (2 * Math.PI) / 3, label: 'THE SUNWARD LINE', color: 0xff6f91 },
};

const FIRST_STOP = 62, STOP_SPACING = 42, LATERAL = 26;
const R_BUILD = 105, R_DISPOSE = 145, R_INSIDE = 24;

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

function addNpcSignature(wrap, seed, tint) {
  const signature = new THREE.Group();
  signature.name = `npc-signature-${seed.toString(16)}`;
  const ink = new THREE.Color(0x152038).lerp(tint, 0.18);
  const accent = tint.clone().offsetHSL(((seed % 9) - 4) * 0.018, 0.08, 0.04);
  const mesh = (geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(x, y, z);
    item.rotation.set(rx, ry, rz);
    item.castShadow = true;
    item.userData.disposeWithNpc = true;
    signature.add(item);
    return item;
  };
  const darkMat = toonMat(ink);
  const accentMat = toonMat(accent);
  const style = seed % 4;
  if (style === 0) {
    mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.22, 12), accentMat, 0, 2.17, 0);
    mesh(new THREE.TorusGeometry(0.17, 0.045, 6, 16), darkMat, 0, 1.72, 0, Math.PI / 2);
  } else if (style === 1) {
    mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.055, 14), darkMat, 0, 2.11, 0);
    mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.2, 12), accentMat, 0, 2.2, 0);
    mesh(new THREE.BoxGeometry(0.3, 0.42, 0.16), accentMat, 0.29, 1.16, 0.13, 0, 0, -0.08);
  } else if (style === 2) {
    mesh(new THREE.TorusGeometry(0.25, 0.035, 6, 18, Math.PI), darkMat, 0, 2.02, 0, 0, 0, Math.PI / 2);
    mesh(new THREE.BoxGeometry(0.09, 0.2, 0.08), accentMat, -0.25, 2.0, 0);
    mesh(new THREE.BoxGeometry(0.09, 0.2, 0.08), accentMat, 0.25, 2.0, 0);
  } else {
    mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.16, 12), darkMat, 0, 2.15, 0);
    mesh(new THREE.BoxGeometry(0.28, 0.04, 0.22), accentMat, 0, 2.12, -0.2);
    mesh(new THREE.BoxGeometry(0.28, 0.36, 0.15), darkMat, -0.3, 1.12, 0.14, 0, 0, 0.1);
  }
  wrap.add(signature);
}

export class ZoneManager {
  constructor(scene, { lowPower = false, compactTouch = false } = {}) {
    this.scene = scene;
    this.lowPower = lowPower;
    this.compactTouch = compactTouch;
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
    return z ? Math.min(3, districtCastFor(z.data, z.zoneIndex).length) : 3;
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
    const zoneOrder = new Map(zones.map((zone, index) => [zone.code, index]));
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
          data, lineKey, line: L, side, stopIdx, zoneIndex: zoneOrder.get(data.code),
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
    const buildRadius = this.compactTouch ? 66 : (this.lowPower ? 84 : R_BUILD);
    const disposeRadius = this.compactTouch ? 98 : (this.lowPower ? 124 : R_DISPOSE);
    for (const z of this.zones) {
      const d = p.distanceTo(z.center);
      if (!z.chunk && d < buildRadius) this.buildChunk(z, colliders);
      else if (z.chunk && d > disposeRadius) this.disposeChunk(z, colliders);
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
    const cPrimary = new THREE.Color(pal.primary).lerp(new THREE.Color(0xdce4e8), 0.38);
    const cSecondary = new THREE.Color(pal.secondary).lerp(new THREE.Color(0xd7b7b0), 0.28);
    const cAccent = new THREE.Color(pal.accent).lerp(lineColor, 0.46);
    const cRoof = new THREE.Color(pal.roof).lerp(new THREE.Color(PALETTE.ink), 0.52);

    // district ground: concrete pavement with only a hint of the zone's colour
    // Join the district pavement directly to the boulevard curb. Buildings stay
    // farther back, preserving tram clearance without the old dead asphalt moat.
    const nearEdge = BOULEVARD.tramLaneX + 4.2 - LATERAL;
    const farEdge = 28;
    const districtWidth = 40.5;
    const districtHalfWidth = districtWidth / 2;
    const districtDepth = farEdge - nearEdge;
    const districtMid = (farEdge + nearEdge) / 2;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(districtWidth, districtDepth),
      toonMat(new THREE.Color(PALETTE.plaza).lerp(cPrimary, 0.15))
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0.03, districtMid);
    ground.receiveShadow = true;
    g.add(ground);
    for (let stripe = -2; stripe <= 2; stripe++) {
      const pavingLine = new THREE.Mesh(
        new THREE.PlaneGeometry(0.11, districtDepth - 1.2),
        toonMat(stripe % 2 ? cAccent.clone().multiplyScalar(0.72) : new THREE.Color(PALETTE.curb)),
      );
      pavingLine.rotation.x = -Math.PI / 2;
        pavingLine.position.set(stripe * 8, 0.041, districtMid);
      g.add(pavingLine);
    }
    // sidewalk ring + curb line around the block
    const walkMat = toonMat(PALETTE.sidewalk);
    const curbMat = toonMat(PALETTE.curb);
    for (const [w, d, x, zz] of [
      [districtWidth, 3.0, 0, nearEdge - 0.3],
      [districtWidth, 2.6, 0, farEdge + 1.3],
      [2.6, districtDepth, -(districtHalfWidth + 1.3), districtMid],
      [2.6, districtDepth, districtHalfWidth + 1.3, districtMid],
    ]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(w, d), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(x, 0.032, zz);
      g.add(walk);
      const curb = new THREE.Mesh(new THREE.PlaneGeometry(w === districtWidth ? districtWidth : 0.45, w === districtWidth ? 0.45 : districtDepth), curbMat);
      curb.rotation.x = -Math.PI / 2;
      curb.position.set(x, 0.034, zz);
      g.add(curb);
    }

    // A compact street network turns every streamed dialect region into real
    // blocks: three parallel one-way streets, two cross streets and a diagonal
    // promenade. Lots are generated around the roads, never through them.
    const streets = new THREE.Group();
    streets.name = `${z.data.code}-street-grid`;
    const roadMat = toonMat(new THREE.Color(0x15243a).lerp(cPrimary, 0.08));
    const laneMat = toonMat(new THREE.Color(0xc7d8dd).lerp(cAccent, 0.22));
    const edgeMat = toonMat(cAccent.clone().multiplyScalar(0.72));
    const addRoad = (width, length, x, zz, yaw = 0, material = roadMat) => {
      const geometry = new THREE.PlaneGeometry(width, length);
      geometry.rotateX(-Math.PI / 2);
      if (yaw) geometry.rotateY(yaw);
      const road = new THREE.Mesh(geometry, material);
      road.position.set(x, 0.047, zz);
      road.receiveShadow = true;
      streets.add(road);
      return road;
    };
    for (const x of [-10, 0, 10]) {
      addRoad(2.9, districtDepth - 0.8, x, districtMid);
      addRoad(0.09, districtDepth - 2.2, x, districtMid, 0, laneMat);
    }
    for (const zz of [-3.1, 11.7]) {
      addRoad(districtWidth - 0.8, 3.5, 0, zz);
      addRoad(districtWidth - 2.2, 0.09, 0, zz, 0, laneMat);
    }
    const diagonalStart = new THREE.Vector2(-19, nearEdge + 2);
    const diagonalEnd = new THREE.Vector2(19, farEdge - 2);
    const diagonalDelta = diagonalEnd.clone().sub(diagonalStart);
    const diagonalLength = diagonalDelta.length();
    const diagonalMid = diagonalStart.clone().add(diagonalEnd).multiplyScalar(0.5);
    const diagonalYaw = Math.atan2(diagonalDelta.x, diagonalDelta.y);
    addRoad(3.15, diagonalLength, diagonalMid.x, diagonalMid.y, diagonalYaw);
    addRoad(0.12, diagonalLength - 1.2, diagonalMid.x, diagonalMid.y, diagonalYaw, edgeMat);
    g.add(streets);

    const distanceToDiagonal = (x, zz) => {
      const px = x - diagonalStart.x;
      const pz = zz - diagonalStart.y;
      const t = THREE.MathUtils.clamp(
        (px * diagonalDelta.x + pz * diagonalDelta.y) / diagonalDelta.lengthSq(),
        0,
        1,
      );
      return Math.hypot(px - diagonalDelta.x * t, pz - diagonalDelta.y * t);
    };
    const slots = [];
    const rows = [nearEdge + 8.1, 4.2, 19.2];
    for (let row = 0; row < rows.length; row++) {
      for (const column of [-15, -5, 5, 15]) {
        const x = column + (rng() - 0.5) * 0.45;
        const zz = rows[row] + (rng() - 0.5) * 0.4;
        if (distanceToDiagonal(x, zz) < 4.25) continue;
        slots.push({
          x,
          z: zz,
          w: 7.0 + rng() * 0.7,
          d: 6.8 + rng() * 0.8,
          frontage: row === 0,
        });
      }
    }
    const zoneColliders = this.buildFacadeBlock(g, slots, rng, { cPrimary, cSecondary, cAccent, cRoof });

    // Every stop gets an inhabited ground floor: compact food/coffee/flower
    // sellers, outdoor tables and a bright local venue sign. The whole set is
    // owned by the streamed chunk, so distant districts still cost nothing.
    const streetLife = buildDistrictLife(rng, {
      accent: cAccent,
      secondary: cSecondary,
      nearEdge,
      code: z.data.zoneName,
      lowPower: this.lowPower,
    });
    g.add(streetLife);
    zoneColliders.push(...(streetLife.userData.colliderBoxes || []));

    // landmark in the courtyard — variant by zone hash
    const lm = this.buildLandmark(hash(z.data.code) % 3, cAccent, cRoof);
    lm.position.set(-15.5, 0, 25.2);
    g.add(lm);
    zoneColliders.push({ localX: -15.5, localZ: 25.2, hw: 1.6, hd: 1.6 });

    // orient district: face the boulevard
    const yaw = Math.atan2(z.perp.x * z.side, z.perp.y * z.side);
    g.rotation.y = yaw;
    g.position.set(z.center.x, 0, z.center.y);

    // station sign + platform at the stop
    const sign = this.buildStationSign(z);
    sign.position.set(
      z.stopPos.x + z.perp.x * z.side * 8.2 + z.dir.x * 5.4,
      0,
      z.stopPos.y + z.perp.y * z.side * 8.2 + z.dir.y * 5.4,
    );
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
      const extentX = Math.abs(cosY) * c.hw + Math.abs(sinY) * c.hd;
      const extentZ = Math.abs(sinY) * c.hw + Math.abs(cosY) * c.hd;
      return {
        minX: wx - extentX, maxX: wx + extentX,
        minZ: wz - extentZ, maxZ: wz + extentZ,
        source: c.source || `${z.data.code}-building`,
      };
    });
    const addSignCollider = (localX, localZ, halfX, halfZ, source) => {
      const wx = sign.position.x + localX * cosY + localZ * sinY;
      const wz = sign.position.z - localX * sinY + localZ * cosY;
      const extentX = Math.abs(cosY) * halfX + Math.abs(sinY) * halfZ;
      const extentZ = Math.abs(sinY) * halfX + Math.abs(cosY) * halfZ;
      tagged.push({
        minX: wx - extentX, maxX: wx + extentX,
        minZ: wz - extentZ, maxZ: wz + extentZ,
        source,
      });
    };
    for (const x of [-1.65, 1.65]) {
      addSignCollider(x, 0, 0.11, 0.11, `${z.data.code}-station-sign`);
      for (const localZ of [0.55, 1.65]) {
        addSignCollider(x, localZ, 0.11, 0.11, `${z.data.code}-shelter-support`);
      }
    }
    addSignCollider(2.7, 0.5, 0.3, 0.22, `${z.data.code}-emergency-stop`);
    colliders.push(...tagged);
    this._colliderTag.set(z.data.code, tagged);

    // --- three accent-matched locals per district, each with a unique body ---
    if (this.npcBases?.length && this.world) {
      const spawned = [];
      const zoneProg = this.progressFor(z.data.code);
      const locals = [[-10, -10], [0, 4], [10, 19]];
      // body assignment is unique PER STOP: the two zones flanking a station
      // (side ±1) draw six consecutive pool slots, so no two teachers you can
      // see from one platform share a body
      const stopSlot = hash(`${z.lineKey}:${z.stopIdx}`);
      districtCastFor(z.data, z.zoneIndex).slice(0, 3).forEach((npcData, i) => {
        const base = this.npcBases[(stopSlot + (z.side > 0 ? 0 : 3) + i) % this.npcBases.length];
        const tint = new THREE.Color(i === 0
          ? z.data.palette.accent
          : i === 1 ? z.data.palette.secondary : z.data.palette.primary);
        const s = 0.95 + rng() * 0.12;
        const wrap = new THREE.Group();
        const [lx, lz] = locals[i];
        wrap.position.set(
          z.center.x + lx * cosY + lz * sinY, 0,
          z.center.y - lx * sinY + lz * cosY
        );
        wrap.rotation.y = yaw + [0.6, -2.2, 2.65][i];
        wrap.scale.setScalar(s);
        wrap.add(blobShadow(0.5 * s));

        const entry = {
          obj: wrap,
          name: npcData.name, role: npcData.role, greeting: npcData.greeting,
          // warm-up question rotates with the round so repeat visits stay fresh
          exercise: z.data.sampleExercises[(i + zoneProg.laps) % z.data.sampleExercises.length],
          grammar: assignGrammar(z.stopIdx, i, z.lineKey, zoneProg.laps),
          dialectCode: z.data.code,
          voiceId: i < 2 ? `${z.data.code}_${i}` : null,
          accentProfile: accentProfileFor(z.data.code, i), barkFam: z.lineKey,
          done: !!zoneProg.d[i],
          zoneCode: z.data.code, npcIdx: i, phase: rng() * 6,
          gestureCorrect: 'agree', gestureWrong: 'headShake', gestureGreet: 'Wave',
        };
        attachMarker(entry, 2.3);   // local units — wrap scale applies on top
        addNpcSignature(wrap, hash(`${z.data.code}:${i}`), tint);
        if (base?.rigged) {
          const inst = instanceRig(base.object || base.mesh, base.clips);
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
  // Six silhouette families, merged by material, keep districts authored at
  // street level without multiplying draw calls per building.
  buildFacadeBlock(g, slots, rng, { cPrimary, cSecondary, cAccent, cRoof }) {
    const CREAM = new THREE.Color(0xe7e3dc);
    const WARM = new THREE.Color(0xe3b2a5);
    const MINT = new THREE.Color(0xaed8cf);
    const wallTones = [
      cPrimary.clone().lerp(CREAM, 0.12),
      cSecondary.clone().lerp(WARM, 0.12),
      WARM.clone().lerp(cAccent, 0.34),
      MINT.clone().lerp(cPrimary, 0.34),
    ];
    const trimTone = cPrimary.clone().multiplyScalar(0.52).lerp(new THREE.Color(PALETTE.ink), 0.54);
    const bandTone = CREAM.clone().lerp(trimTone, 0.3);      // ground-floor stone
    const roofTone = cRoof.clone().lerp(CREAM, 0.18);

    const B = { wall0: [], wall1: [], wall2: [], wall3: [], trim: [], band: [], roof: [],
      paneLit: [], paneDark: [], accent: [], metal: [] };
    const boxG = (bucket, w, h, d, x, y, z) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      geo.translate(x, y, z);
      bucket.push(geo);
    };
    const boxR = (bucket, w, h, d, x, y, z, rz = 0) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      if (rz) geo.rotateZ(rz);
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
    const addWindows = (bx, bz, w, d, yBase, yTop, entranceFace, opts = {}) => {
      const { winW = 1.1, winH = 1.35, sills = false, lintels = false, maxCols = 4 } = opts;
      for (const F of FACES) {
        const ext = (F.nx ? w : d) / 2;
        const span = F.nx ? d : w;
        const cols = Math.min(maxCols, Math.max(1, Math.floor((span - 1.7) / 2.05)));
        const total = cols * 2.05;
        for (let y = yBase; y <= yTop; y += 2.55) {
          for (let c = 0; c < cols; c++) {
            const u = -total / 2 + 2.05 * (c + 0.5);
            if (entranceFace === F && y < 3.7 && Math.abs(u) < 1.15) continue;
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
    slots.forEach((slot, i) => {
      const { x, z: zz, w, d: dpt, frontage } = slot;
      const frontPool = ['shop', 'brick', 'deco', 'shop'];
      const innerPool = ['tower', 'brick', 'industrial', 'deco', 'row'];
      const pool = frontage ? frontPool : innerPool;
      const arch = pool[(i + ((rng() * pool.length) | 0)) % pool.length];
      const heightRanges = {
        row: [10, 14], shop: [13, 18], brick: [17, 25],
        tower: [24, 36], deco: [21, 32], industrial: [10, 16],
      };
      const [minH, maxH] = heightRanges[arch];
      const h = minH + rng() * (maxH - minH);
      const wallBucket = B[`wall${i % 4}`];

      // Streetfront entrances address the boulevard. Rear buildings face the
      // nearest shared court, producing coherent blocks instead of random boxes.
      let front = frontage ? FACES[1] : FACES[0], best = -Infinity;
      if (!frontage) for (const F of FACES) {
        const dot = F.nx * -x + F.nz * -zz;
        if (dot > best) { best = dot; front = F; }
      }
      const ext = (front.nx ? w : dpt) / 2;
      const fpx = (off) => x + front.nx * (ext + off);
      const fpz = (off) => zz + front.nz * (ext + off);

      // plinth + body
      boxG(B.trim, w + 0.18, 0.9, dpt + 0.18, x, 0.45, zz);
      const tall = arch === 'tower' || arch === 'deco';
      const h1 = tall ? h * (arch === 'deco' ? 0.68 : 0.62) : h;
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
        if (frontage) {
          const fireX = x + w * 0.23;
          for (let fy = 4.2; fy < h1 - 1; fy += 3.0) {
            boxG(B.metal, 2.6, 0.1, 0.9, fireX, fy, zz - dpt / 2 - 0.48);
            boxG(B.metal, 0.08, 0.72, 0.08, fireX - 1.15, fy + 0.4, zz - dpt / 2 - 0.86);
            boxG(B.metal, 0.08, 0.72, 0.08, fireX + 1.15, fy + 0.4, zz - dpt / 2 - 0.86);
            boxR(B.metal, 2.75, 0.1, 0.12, fireX, fy - 1.15, zz - dpt / 2 - 0.85, -0.58);
          }
        }
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
        if (frontage) {
          boxG(B.metal, 0.12, 2.5, 0.12, x + w / 2 - 0.65, 4.5, zz - dpt / 2 - 0.7);
          quad(B.accent, 1.15, 2.2, x + w / 2 - 0.65, 4.5, zz - dpt / 2 - 0.78, Math.PI);
        }
      } else if (arch === 'tower') {
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
        for (let by = 4.4; by < h1 - 1.2; by += 4.6) {
          boxG(B.metal, w * 0.58, 0.12, 0.8, x, by, zz - dpt / 2 - 0.35);
        }
        const tank = new THREE.CylinderGeometry(0.9, 1.05, 1.6, 10);
        tank.translate(x, h + 1.25, zz);
        B.metal.push(tank);
      } else if (arch === 'deco') {
        addWindows(x, zz, w, dpt, 2.4, h1 - 1.2, front, { winW: 1.05, winH: 1.55, maxCols: 4 });
        const wTop = w - 2.2, dTop = dpt - 1.7;
        boxG(wallBucket, wTop, h - h1, dTop, x, h1 + (h - h1) / 2, zz + 0.25);
        addWindows(x, zz + 0.25, wTop, dTop, h1 + 1.3, h - 1.1, null, { winW: 0.95, winH: 1.45, maxCols: 3 });
        for (const fx of [-0.32, 0, 0.32]) {
          boxG(B.accent, 0.13, h * 0.72, 0.16, x + fx * w, h * 0.52, zz - dpt / 2 - 0.1);
        }
        boxG(B.trim, w + 0.4, 0.24, dpt + 0.38, x, h1 + 0.12, zz);
        boxG(B.roof, wTop + 0.3, 0.28, dTop + 0.3, x, h + 0.14, zz + 0.25);
        boxG(B.trim, wTop * 0.62, 1.25, dTop * 0.62, x, h + 0.8, zz + 0.25);
        boxG(B.accent, wTop * 0.22, 2.2, dTop * 0.22, x, h + 2.5, zz + 0.25);
      } else {
        // Industrial studios use sawtooth roofs, ribbon glazing, and a stack.
        addWindows(x, zz, w, dpt, 2.5, h - 1.4, front, { winW: 1.8, winH: 1.45, maxCols: 3 });
        for (let roofPart = -1; roofPart <= 1; roofPart++) {
          pitchedRoof(x + roofPart * (w / 3), zz, w / 3.15, dpt, h + 0.06, 1.15);
        }
        boxG(B.band, w * 0.88, 0.32, 1.35, x, 3.45, zz - dpt / 2 - 0.65);
        quad(B.accent, w * 0.72, 0.72, x, 4.15, zz - dpt / 2 - 0.04, Math.PI);
        const stack = new THREE.CylinderGeometry(0.34, 0.48, 3.8, 8);
        stack.translate(x + w * 0.32, h + 1.7, zz + dpt * 0.16);
        B.metal.push(stack);
      }

      // entrance on the courtyard face (all archetypes)
      quad(B.trim, 1.4, 2.35, fpx(0.04), 1.18, fpz(0.04), front.ry);       // doorway
      quad(B.paneDark, 1.02, 1.45, fpx(0.07), 1.42, fpz(0.07), front.ry);
      boxG(B.band, 1.8, 0.18, 1.1, fpx(0.35), 0.09, fpz(0.35));            // door step
      if (arch !== 'shop') {
        if (frontage) {
          const glassSpan = Math.min(w, dpt) * 0.78;
          for (let pane = -1; pane <= 1; pane++) {
            const u = pane * glassSpan * 0.3;
            if (pane !== 0) quad(
              B.paneLit, glassSpan * 0.26, 1.72,
              fpx(0.09) + front.tx * u, 1.72,
              fpz(0.09) + front.tz * u, front.ry,
            );
          }
          quad(B.accent, glassSpan, 0.58, fpx(0.11), 3.2, fpz(0.11), front.ry);
          boxG(B.accent, Math.abs(front.tx) * glassSpan + Math.abs(front.nx) * 1.2, 0.15,
            Math.abs(front.tz) * glassSpan + Math.abs(front.nz) * 1.2,
            fpx(0.55), 2.65, fpz(0.55));
        } else {
          boxG(B.accent, 2.4, 0.15, 1.0, fpx(0.55), 2.6, fpz(0.55));
          if (rng() < 0.6) quad(B.accent, 1.9, 0.5, fpx(0.05), 3.3, fpz(0.05), front.ry);
        }
      }

      // A repeated vertical lightblade ties dissimilar architecture into the
      // same commercial district language without flattening its silhouette.
      if (frontage || i % 3 === 0) {
        const bladeU = Math.min(w, dpt) * (i % 2 ? 0.34 : -0.34);
        quad(
          B.accent, 0.18, Math.min(7.5, h1 * 0.56),
          fpx(0.12) + front.tx * bladeU, Math.min(5.4, h1 * 0.48),
          fpz(0.12) + front.tz * bladeU, front.ry,
        );
      }

      if ((arch === 'brick' || arch === 'tower') && i % 2 === 0) {
        const signY = h1 + 1.25;
        boxG(B.metal, 0.08, 1.8, 0.08, x - 1.45, signY, zz);
        boxG(B.metal, 0.08, 1.8, 0.08, x + 1.45, signY, zz);
        quad(B.accent, 3.2, 1.15, x, signY + 0.65, zz - dpt / 2 - 0.09, Math.PI);
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
      metal: new THREE.MeshStandardMaterial({ color: 0x8195aa, metalness: 0.76, roughness: 0.3 }),
    };
    for (const [key, list] of Object.entries(B)) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((geometry) => geometry.dispose());
      const mesh = new THREE.Mesh(merged, mats[key]);
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
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide })
    );
    panel.position.y = 2.9;
    const panelBack = panel.clone();
    panelBack.rotation.y = Math.PI;
    panelBack.position.set(0, 2.9, -0.02);
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), toonMat(PALETTE.ink));
    const post2 = post1.clone();
    post1.position.set(-1.6, 1.5, 0); post2.position.set(1.6, 1.5, 0);
    // platform pad
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.4), toonMat(new THREE.Color(z.line.color).lerp(new THREE.Color(PALETTE.plaza), 0.68)));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.035;
    const shelterGlass = new THREE.MeshStandardMaterial({
      color: 0x77dce2, emissive: 0x102c45, emissiveIntensity: 0.72,
      metalness: 0.54, roughness: 0.2, transparent: true, opacity: 0.72,
    });
    const shelter = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.14, 1.65), shelterGlass);
    shelter.position.set(0, 3.72, 1.15);
    const chrome = new THREE.MeshStandardMaterial({ color: 0xaabbd2, metalness: 0.86, roughness: 0.22 });
    const supports = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.075, 3.55, 7), chrome, 4);
    const dummy = new THREE.Object3D();
    let supportIndex = 0;
    for (const x of [-1.65, 1.65]) for (const zz of [0.55, 1.65]) {
      dummy.position.set(x, 1.78, zz);
      dummy.updateMatrix();
      supports.setMatrixAt(supportIndex++, dummy.matrix);
    }
    supports.instanceMatrix.needsUpdate = true;

    const emergency = new THREE.Group();
    emergency.name = `${z.data.code}-emergency-stop`;
    const emergencyPost = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.4, 7), chrome);
    emergencyPost.position.y = 0.7;
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.86, 0.26),
      new THREE.MeshStandardMaterial({ color: 0xff405f, emissive: 0x851027, emissiveIntensity: 1.5, metalness: 0.4, roughness: 0.3 }),
    );
    cabinet.position.y = 1.2;
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toonMat(0xffffff));
    button.position.set(0, 1.25, -0.17);
    emergency.add(emergencyPost, cabinet, button);
    emergency.position.set(2.7, 0, 0.5);

    const arrival = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 0.48),
      new THREE.MeshBasicMaterial({ color: 0x10172b, side: THREE.DoubleSide }),
    );
    arrival.position.set(0, 2.12, 1.82);
    const arrivalLine = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 0.08), toonMat(z.line.color));
    arrivalLine.position.set(0, 2.12, 1.79);
    g.add(panel, panelBack, post1, post2, pad, shelter, supports, emergency, arrival, arrivalLine);
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
      n.obj.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.disposeWithNpc) o.geometry.dispose();
        o.material?.dispose?.();
      });
      this.scene.remove(n.obj);
      const i = this.world.npcs.indexOf(n);
      if (i >= 0) this.world.npcs.splice(i, 1);
    }
    this._npcTag.delete(z.data.code);
  }
}
