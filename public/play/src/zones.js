// 44 dialect zones along the three metro boulevards: layout, procedural district
// architecture tinted from each zone's palette, station signs, streaming, and
// player zone detection. Content comes from src/gamedata/zones.json.
import * as THREE from 'three';
import { toonMat, addWetStreets, blobShadow, PALETTE } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBuckets, buildBuckets, paverField, kerbRun, tactilePatch, zebra, manhole, bollard, bench, lamp, bin, hydrant, treePit, planter, busShelter, bikeRack, postBox, phoneBox, streetSign, bunting, stringLights, placeInto, countryOf, bakeDistrictAO, CHROME, WOOD } from './kit/street.js';
import { box, cyl, sphere, uvCell, FACES } from './kit/shapes.js';
import { archetypesFor, buildFacade, toneTable, buildingTones } from './kit/facades.js';
import { speciesFor, treeInstances } from './kit/flora.js';
import { landmarkKindFor, emitLandmark } from './kit/landmarks.js';
import { SignAtlas, shopNamesFor } from './kit/signage.js';
import { assignGrammar, grammarForLap } from './grammar.js';
import { instanceRig } from './rig.js';
import { attachMarker } from './markers.js';
import { BOULEVARD } from './transit-layout.js';
import { buildDistrictLife } from './city-life.js';
import { makeRoute } from './crowd.js';
import { accentProfileFor, districtCastFor, streetLocalFor } from './dialects.js';

export const LINES = {
  isles:   { angle: Math.PI / 2,                    label: 'THE ISLES LINE',   color: 0x4deeea },
  liberty: { angle: Math.PI / 2 + (2 * Math.PI) / 3, label: 'THE LIBERTY LINE', color: 0x8b7dff },
  sunward: { angle: Math.PI / 2 - (2 * Math.PI) / 3, label: 'THE SUNWARD LINE', color: 0xff6f91 },
};

const FIRST_STOP = 62, STOP_SPACING = 42, LATERAL = 26;
const R_BUILD = 105, R_DISPOSE = 145, R_INSIDE = 24;
const CHUNK_FADE = 0.6;      // seconds a freshly streamed district takes to fade in
const R_FINE = 46;           // metres within which a district shows its fine dressing
const R_MID = 80;            // metres within which a district shows its street/roof furniture
const BUILD_BUDGET_MS = 8;   // per tick, for the time-sliced chunk builder

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

// bodyTop is the measured top of this local's body: the props were authored
// for a 2.0 m head line and used to float above the shorter Meshy rigs.
function addNpcSignature(wrap, seed, tint, bodyTop = 2.0) {
  const signature = new THREE.Group();
  signature.name = `npc-signature-${seed.toString(16)}`;
  signature.position.y = bodyTop - 2.03;
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
    mesh(new THREE.BoxGeometry(0.09, 0.2, 0.08), accentMat, -0.25, 1.88, 0);
    mesh(new THREE.BoxGeometry(0.09, 0.2, 0.08), accentMat, 0.25, 1.88, 0);
  } else {
    mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.16, 12), darkMat, 0, 2.15, 0);
    mesh(new THREE.BoxGeometry(0.28, 0.04, 0.22), accentMat, 0, 2.12, -0.2);
    mesh(new THREE.BoxGeometry(0.28, 0.36, 0.15), darkMat, -0.3, 1.12, 0.14, 0, 0, 0.1);
  }
  wrap.add(signature);
}

export class ZoneManager {
  constructor(scene, { lowPower = false, compactTouch = false, quality = null } = {}) {
    this.scene = scene;
    this.lowPower = lowPower;
    this.compactTouch = compactTouch;
    this.quality = quality;                 // quality.js settings, may be null
    this.vertexAO = quality ? quality.vertexAO : true;
    this.zones = [];          // computed defs { data, center, stopPos, dir, side, chunk|null }
    this.current = null;      // zone the player stands in
    this.onEnter = null;      // callback(zoneDef)
    this._colliderTag = new Map();
    this._npcTag = new Map(); // zoneCode -> spawned npc entries
    this._crowdTag = new Map(); // zoneCode -> spawned crowd agents
    this.world = null;        // bound World (npc registry lives there)
    this.npcBase = null;      // rigged template { scene, animations } (Xbot)
    this.hubNpcs = [];        // hub teacher entries (their circuit code is 'hub')
    this._fading = [];        // chunks mid fade-in: [{ t, mats: [{ mat, target, transparent }] }]
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
  setCrowd(crowd) { this.crowd = crowd; }
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

  // Streaming. Two passes: everything beyond the dispose radius is released
  // FIRST (so crowd slots and GPU memory are free), then at most one new chunk
  // is built per tick, nearest first. A zone the player is already standing in
  // (a metro arrival) builds immediately so the travel fade lifts on a finished
  // street. Freshly built chunks fade in over CHUNK_FADE seconds.
  update(playerPos, colliders) {
    const p = new THREE.Vector2(playerPos.x, playerPos.z);
    const buildRadius = this.quality?.buildRadius
      ?? (this.compactTouch ? 66 : (this.lowPower ? 84 : R_BUILD));
    const disposeRadius = this.quality?.disposeRadius
      ?? (this.compactTouch ? 98 : (this.lowPower ? 124 : R_DISPOSE));
    for (const z of this.zones) {
      if (!z.chunk) continue;
      const d = p.distanceTo(z.center);
      if (d > disposeRadius) { this.disposeChunk(z, colliders); continue; }
      // fine dressing (frames, mullions, balusters) only within reading range;
      // street and roof furniture a little further out
      const fineOn = d < R_FINE, midOn = d < R_MID;
      if (z.chunk.userData.fine && z.chunk.userData.fine.visible !== fineOn) z.chunk.userData.fine.visible = fineOn;
      if (z.chunk.userData.mid && z.chunk.userData.mid.visible !== midOn) z.chunk.userData.mid.visible = midOn;
    }
    // a build in progress whose zone left the build radius is abandoned
    if (this._pending && p.distanceTo(this._pending.z.center) > buildRadius + 10) this._abandonPending();
    let nearest = null, nearestD = Infinity;
    for (const z of this.zones) {
      if (z.chunk || z === this._pending?.z) continue;
      const d = p.distanceTo(z.center);
      if (d >= buildRadius) continue;
      if (d < R_INSIDE + 6) { if (this._pending?.z === z) this._abandonPending(); this.buildChunk(z, colliders, { fade: false }); continue; }
      if (d < nearestD) { nearestD = d; nearest = z; }
    }
    // time-sliced: resume the pending build, or start the nearest one, and run
    // its steps until this tick's budget is spent
    if (!this._pending && nearest) this._pending = { z: nearest, gen: this._buildSteps(nearest, colliders, { fade: true }) };
    if (this._pending) {
      const t0 = performance.now();
      let done = false;
      do {
        const r = this._pending.gen.next();
        done = r.done;
        if (r.value) this._pending.B = r.value;        // staged buckets, released if abandoned
      } while (!done && performance.now() - t0 < BUILD_BUDGET_MS);
      if (done) this._pending = null;
    }
    this._tickFades(1 / 60);
    // the whole city is dialect turf: HUD names whichever region you stand in
    const inside = this.regionAt(playerPos.x, playerPos.z);
    if (inside !== this.current) {
      this.current = inside;
      this.onEnter?.(inside);
    }
  }

  // main.js hands the renderer over so the first chunk can pre-warm every
  // district shader program once, instead of paying the compile on arrival.
  setRenderer(renderer, camera) { this.renderer = renderer; this.camera = camera; }

  _tickFades(dt) {
    if (!this._fading.length) return;
    for (let i = this._fading.length - 1; i >= 0; i--) {
      const f = this._fading[i];
      f.t = Math.min(1, f.t + dt / CHUNK_FADE);
      const k = f.t * f.t * (3 - 2 * f.t);
      for (const m of f.mats) m.mat.opacity = m.target * k;
      if (f.t >= 1) {
        for (const m of f.mats) { m.mat.opacity = m.target; m.mat.transparent = m.transparent; }
        this._fading.splice(i, 1);
      }
    }
  }

  _beginFade(group) {
    const mats = [];
    group.traverse((o) => {
      const mat = o.material;
      if (!o.isMesh || !mat || mat.userData.shared || mat.userData.fading) return;
      mat.userData.fading = true;
      mats.push({ mat, target: mat.opacity, transparent: mat.transparent });
      mat.transparent = true;
      mat.opacity = 0;
    });
    if (mats.length) this._fading.push({ t: 0, mats });
  }

  _abandonPending() {
    const pend = this._pending;
    this._pending = null;
    if (!pend) return;
    // nothing has reached the scene yet; release whatever geometry was staged
    pend.gen.return();
    const B = pend.B;
    if (B) for (const k of ['shell', 'paneDark', 'paneLit', 'neon', 'glass', 'cone', 'sign', 'fine', 'mid']) { for (const g of B[k]?.geos || []) g.dispose(); }
  }

  // ---------- district construction ----------
  // Synchronous build (metro arrival, headless probes): runs every step now.
  buildChunk(z, colliders, opts = {}) {
    const gen = this._buildSteps(z, colliders, opts);
    while (!gen.next().done) { /* run to completion */ }
  }

  // The build as a generator: each `yield` is a point where the streaming
  // loop may stop for this tick. Nothing touches the scene, colliders or the
  // crowd until the last steps, so an abandoned build leaves no trace.
  *_buildSteps(z, colliders, { fade = true } = {}) {
    const t0 = performance.now();
    const prof = {}; let tMark = t0;
    const mark = (k) => { const now = performance.now(); prof[k] = +(now - tMark).toFixed(1); tMark = now; };
    const rng = mulberry32(hash(z.data.code));
    const g = new THREE.Group();
    g.name = `district-${z.data.code}`;
    const pal = z.data.palette;
    const lineColor = new THREE.Color(z.line.color);
    // The line colour is WAYFINDING, not architecture. Bleeding it 46% into the
    // accent (and from there into every wall tone) turned cream Georgian
    // terraces on the Isles line teal and made all 44 districts converge on
    // three colours. Keep the authored palette on the buildings and save the
    // line colour for signage and lit trim, where it reads as "this is the
    // Isles line" instead of "this is what stone looks like".
    const cPrimary = new THREE.Color(pal.primary).lerp(new THREE.Color(0xdce4e8), 0.18);
    const cSecondary = new THREE.Color(pal.secondary).lerp(new THREE.Color(0xd7b7b0), 0.22);
    const cAccent = new THREE.Color(pal.accent).lerp(lineColor, 0.14);
    const cLine = new THREE.Color(pal.accent).lerp(lineColor, 0.72);   // signage only
    const cRoof = new THREE.Color(pal.roof).lerp(new THREE.Color(PALETTE.ink), 0.52);
    const arch = archetypesFor(z.data);
    const T = toneTable({ cPrimary, cSecondary, cAccent, cLine, cRoof }, arch.flags, rng);
    const B = makeBuckets(T);
    B.detail = this.quality ? !!this.quality.detailProps : !this.lowPower;
    const country = countryOf(z.data.code);

    // Join the district pavement directly to the boulevard curb. Buildings stay
    // farther back, preserving tram clearance without the old dead asphalt moat.
    const nearEdge = BOULEVARD.tramLaneX + 4.2 - LATERAL;
    const farEdge = 28;
    const districtWidth = 40.5;
    const districtHalfWidth = districtWidth / 2;
    const districtDepth = farEdge - nearEdge;
    const districtMid = (farEdge + nearEdge) / 2;
    const ring = districtHalfWidth + 2.6;

    // ---- ground: one paver field for pavement + sidewalk ring, roads on top
    const paveColor = new THREE.Color(PALETTE.plaza).lerp(cPrimary, 0.22);
    paverField(B, -ring, nearEdge - 1.8, ring, farEdge + 2.6, 0.03, {
      slab: 1.35, color: paveColor, grout: paveColor.clone().multiplyScalar(0.7), jitter: 0.06,
      wear: [{ axis: 'z', at: nearEdge - 1.8, range: 1.2, strength: 0.12 }],
    });

    // A compact street hierarchy turns every streamed dialect region into real
    // blocks. The outer parallels, cross streets and diagonal carry two-way
    // traffic; the narrower centre street is a clearly arrowed one-way route.
    // Road paint is raised above the asphalt so it cannot z-fight or flash.
    const roadLayout = {
      twoWayWidth: 6.4,
      oneWayWidth: 4.2,
      outerXs: [-12.2, 12.2],
      centreX: 0,
      crossZs: [-2.8, 12.2],
      diagonalWidth: 6.4,
      laneWidth: 3.2,
      markingClearance: 0.017,
      oneWayDirection: hash(z.data.code) % 2 ? 1 : -1,
    };
    const roadColor = new THREE.Color(0x1b2434).lerp(cPrimary, 0.06);
    const laneColor = new THREE.Color(0xc7d8dd).lerp(cAccent, 0.22);
    const oneWayColor = new THREE.Color(0xffc857).lerp(cAccent, 0.16);
    const shoulderColor = new THREE.Color(PALETTE.sidewalk).lerp(cPrimary, 0.08);
    const kerbColor = new THREE.Color(PALETTE.curb).lerp(cPrimary, 0.12);
    const ROAD_Y = 0.052;
    const MARKING_Y = ROAD_Y + roadLayout.markingClearance;
    const flat = (w, d, x, y, zz, color, yaw = 0) => {
      const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
      if (yaw) geo.rotateY(yaw);
      geo.translate(x, y, zz);
      B.shell.add(geo, color);
    };
    const addRoad = (width, length, x, zz, yaw = 0) => {
      flat(width + 0.72, length + 0.36, x, ROAD_Y - 0.008, zz, shoulderColor, yaw);
      flat(width, length, x, ROAD_Y, zz, roadColor, yaw);
      // lane wear: a darker polished track down each lane
      const lanes = width > 5 ? [-width / 4, width / 4] : [0];
      for (const lx of lanes) {
        const geo = new THREE.PlaneGeometry(0.9, length * 0.96).rotateX(-Math.PI / 2);
        geo.translate(lx, 0, 0);
        if (yaw) geo.rotateY(yaw);
        geo.translate(x, ROAD_Y + 0.008, zz);          // >= 8 mm above the asphalt: no z-fight at range
        B.shell.add(geo, roadColor.clone().multiplyScalar(0.86));
      }
    };
    const addMarking = (width, length, x, zz, yaw = 0, localX = 0, localZ = 0) => {
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const geo = new THREE.BoxGeometry(width, 0.018, length);
      if (yaw) geo.rotateY(yaw);
      geo.translate(x + localX * cos + localZ * sin, MARKING_Y, zz - localX * sin + localZ * cos);
      B.shell.add(geo, laneColor);
    };
    const addDashedCentre = (length, x, zz, yaw = 0) => {
      const spacing = 4.8;
      const usable = Math.max(0, length - 2.4);
      const count = Math.max(1, Math.floor(usable / spacing));
      for (let index = 0; index < count; index++) {
        const localZ = -usable / 2 + (index + 0.5) * (usable / count);
        addMarking(0.13, Math.min(2.35, usable / count * 0.54), x, zz, yaw, 0, localZ);
      }
    };
    const parallelLength = districtDepth - 0.8;
    for (const x of roadLayout.outerXs) {
      addRoad(roadLayout.twoWayWidth, parallelLength, x, districtMid);
      addDashedCentre(parallelLength, x, districtMid);
    }
    addRoad(roadLayout.oneWayWidth, parallelLength, roadLayout.centreX, districtMid, 0);
    for (const edge of [-1, 1]) {
      addMarking(0.1, parallelLength - 1.0, roadLayout.centreX, districtMid, 0,
        edge * (roadLayout.oneWayWidth / 2 - 0.18), 0);
    }
    for (const zz of roadLayout.crossZs) {
      addRoad(roadLayout.twoWayWidth, districtWidth - 0.8, 0, zz, Math.PI / 2);
      addDashedCentre(districtWidth - 0.8, 0, zz, Math.PI / 2);
    }
    const diagonalStart = new THREE.Vector2(-19, nearEdge + 2);
    const diagonalEnd = new THREE.Vector2(19, farEdge - 2);
    const diagonalDelta = diagonalEnd.clone().sub(diagonalStart);
    const diagonalLength = diagonalDelta.length();
    const diagonalMid = diagonalStart.clone().add(diagonalEnd).multiplyScalar(0.5);
    const diagonalYaw = Math.atan2(diagonalDelta.x, diagonalDelta.y);
    addRoad(roadLayout.diagonalWidth, diagonalLength, diagonalMid.x, diagonalMid.y, diagonalYaw);
    addDashedCentre(diagonalLength, diagonalMid.x, diagonalMid.y, diagonalYaw);

    const arrowYaw = roadLayout.oneWayDirection > 0 ? 0 : Math.PI;
    for (const localZ of [-parallelLength * 0.3, 0, parallelLength * 0.3]) {
      const arrowParts = [
        new THREE.BoxGeometry(0.24, 0.022, 1.18).translate(0, 0, -0.2),
        new THREE.BoxGeometry(0.2, 0.022, 0.72).rotateY(0.65).translate(-0.22, 0, 0.52),
        new THREE.BoxGeometry(0.2, 0.022, 0.72).rotateY(-0.65).translate(0.22, 0, 0.52),
      ];
      const arrowGeometry = mergeGeometries(arrowParts, false);
      arrowParts.forEach((part) => part.dispose());
      if (arrowYaw) arrowGeometry.rotateY(arrowYaw);
      arrowGeometry.translate(roadLayout.centreX, MARKING_Y + 0.003, districtMid + localZ);
      B.shell.add(arrowGeometry, oneWayColor);
    }
    for (const [mx, mz] of [[-12.2 + 1.4, 6], [0.9, -8], [12.2 - 1.6, 20]]) manhole(B, mx, mz, { y: ROAD_Y + 0.017 });

    const distanceToDiagonal = (x, zz) => {
      const px = x - diagonalStart.x;
      const pz = zz - diagonalStart.y;
      const t = THREE.MathUtils.clamp((px * diagonalDelta.x + pz * diagonalDelta.y) / diagonalDelta.lengthSq(), 0, 1);
      return Math.hypot(px - diagonalDelta.x * t, pz - diagonalDelta.y * t);
    };
    // is (x, z) on a carriageway (with `pad` clearance)?
    const onRoad = (x, zz, pad = 0.6) => {
      if (Math.abs(zz - districtMid) < parallelLength / 2 + pad) {
        for (const rx of roadLayout.outerXs) if (Math.abs(x - rx) < roadLayout.twoWayWidth / 2 + 0.36 + pad) return true;
        if (Math.abs(x - roadLayout.centreX) < roadLayout.oneWayWidth / 2 + 0.36 + pad) return true;
      }
      if (Math.abs(x) < districtWidth / 2 - 0.4 + pad) {
        for (const rz of roadLayout.crossZs) if (Math.abs(zz - rz) < roadLayout.twoWayWidth / 2 + 0.36 + pad) return true;
      }
      return distanceToDiagonal(x, zz) < roadLayout.diagonalWidth / 2 + 0.36 + pad;
    };

    // ---- kerbs: chamfered stones along every carriageway edge, dropped at the
    // corners where pedestrians cross, with tactile paving on the drop.
    const kerbY = 0.03;
    const kerbSeg = (x0, z0, x1, z1) => {
      // split the run wherever it crosses another road, drop the kerb at each end
      const len = Math.hypot(x1 - x0, z1 - z0);
      const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
      let a = 0;
      const steps = Math.ceil(len / 0.5);
      let open = null;
      for (let i = 0; i <= steps; i++) {
        const t = Math.min(len, i * 0.5);
        const x = x0 + dx * t, zz = z0 + dz * t;
        const blocked = onRoad(x, zz, -0.2);
        if (!blocked && open === null) open = t;
        if ((blocked || i === steps) && open !== null) {
          const end = blocked ? t - 0.5 : t;
          if (end - open > 1.2) {
            kerbRun(B, x0 + dx * open, z0 + dz * open, x0 + dx * end, z0 + dz * end, {
              color: kerbColor, y: kerbY, dropped: [{ at: 0.45, half: 0.45 }, { at: end - open - 0.45, half: 0.45 }],
            });
            if (B.detail) {
              tactilePatch(B, x0 + dx * (open + 0.5), z0 + dz * (open + 0.5), Math.atan2(dx, dz), { y: 0.05 });
              tactilePatch(B, x0 + dx * (end - 0.5), z0 + dz * (end - 0.5), Math.atan2(dx, dz), { y: 0.05 });
            }
          }
          open = null;
          a = t;
        }
      }
    };
    const halfLen = parallelLength / 2;
    for (const rx of roadLayout.outerXs) for (const s of [-1, 1]) {
      const kx = rx + s * (roadLayout.twoWayWidth / 2 + 0.36 + 0.14);
      kerbSeg(kx, districtMid - halfLen, kx, districtMid + halfLen);
    }
    for (const s of [-1, 1]) {
      const kx = roadLayout.centreX + s * (roadLayout.oneWayWidth / 2 + 0.36 + 0.14);
      kerbSeg(kx, districtMid - halfLen, kx, districtMid + halfLen);
    }
    for (const rz of roadLayout.crossZs) for (const s of [-1, 1]) {
      const kz = rz + s * (roadLayout.twoWayWidth / 2 + 0.36 + 0.14);
      kerbSeg(-districtWidth / 2 + 0.4, kz, districtWidth / 2 - 0.4, kz);
    }
    {
      const nx = -diagonalDelta.y / diagonalLength, nz = diagonalDelta.x / diagonalLength;
      const off = roadLayout.diagonalWidth / 2 + 0.36 + 0.14;
      for (const s of [-1, 1]) {
        kerbSeg(diagonalStart.x + nx * off * s, diagonalStart.y + nz * off * s, diagonalEnd.x + nx * off * s, diagonalEnd.y + nz * off * s);
      }
    }

    // ---- building slots (unchanged layout: colliders and locals rely on it)
    const slots = [];
    const rows = [
      { z: nearEdge + 6.2, d: 7.4, frontage: true },
      { z: 4.7, d: 5.3, frontage: false },
      { z: 21.4, d: 7.4, frontage: false },
    ];
    const columns = [
      { x: -17.8, w: 3.7 },
      { x: -5.6, w: 5.5 },
      { x: 5.6, w: 5.5 },
      { x: 17.8, w: 3.7 },
    ];
    for (const row of rows) {
      for (const column of columns) {
        const x = column.x + (rng() - 0.5) * 0.22;
        const zz = row.z + (rng() - 0.5) * 0.24;
        const w = column.w + rng() * 0.24;
        const d = row.d + rng() * 0.28;
        const diagonalClearance = roadLayout.diagonalWidth / 2 + Math.min(w, d) * 0.48 + 0.45;
        if (distanceToDiagonal(x, zz) < diagonalClearance) continue;
        slots.push({ x, z: zz, w, d, frontage: row.frontage });
      }
    }
    // free of buildings and carriageways?
    const footprintHit = (x, zz, r) => slots.some((s) => Math.abs(x - s.x) < s.w / 2 + r && Math.abs(zz - s.z) < s.d / 2 + r);
    const free = (x, zz, r = 0.6) => !footprintHit(x, zz, r) && !onRoad(x, zz, r);

    // ---- signage atlas for this district
    const atlas = new SignAtlas(1024);
    const names = shopNamesFor(z.data);
    let nameI = 0;
    const lineHex = '#' + z.line.color.toString(16).padStart(6, '0');
    const accentHex = '#' + cAccent.getHexString();
    const signs = {
      fascia: () => {
        const n = names[nameI++ % names.length];
        return atlas.fascia({ text: n.text, sub: n.sub, bg: ['#1a1430', '#' + T.fascia.getHexString(), '#f5f2ff'][nameI % 3], fg: nameI % 3 === 2 ? '#1a1430' : '#f5f2ff', accent: accentHex, style: nameI % 3 });
      },
      hanging: () => atlas.hanging({ text: names[(nameI + 3) % names.length].text.split(' ').pop(), glyph: ['☕', '✂', '★', '♪', '❀', '✦'][nameI % 6], accent: accentHex }),
    };
    const plateUV = atlas.nameplate({ name: z.data.zoneName, dialect: z.data.dialect, lineHex });
    const streetUV = atlas.streetPlate({ text: `${z.data.zoneName.split(' ').slice(-1)[0]} ${country === 'us' ? 'St' : country === 'ca' && /quebec/.test(z.data.code) ? 'Rue' : 'Street'}`,
      bg: country === 'us' ? '#1f6b3a' : '#f5f2ff', fg: country === 'us' ? '#f5f2ff' : '#10172b' });

    mark('ground');
    yield B;
    // ---- facades, one building per step
    const zoneColliders = [];
    for (const step of this.facadeSteps(B, slots, rng, T, arch, signs, z)) { zoneColliders.push(...step); yield B; }
    mark('facades');

    // ---- landmark: the vista at the far end of the centre street
    const lmKind = landmarkKindFor(z.data);
    const lmZ = farEdge + 7.5;
    const apron = new THREE.CircleGeometry(7.2, 24).rotateX(-Math.PI / 2).translate(0, 0.032, lmZ);
    B.shell.add(apron, paveColor.clone().lerp(cAccent, 0.15));
    B.shell.add(new THREE.RingGeometry(6.9, 7.2, 24).rotateX(-Math.PI / 2).translate(0, 0.036, lmZ), kerbColor);
    zoneColliders.push(...emitLandmark(B, lmKind, { ...T, treeColours: speciesFor(z.data).includes('jacaranda') ? [0x9b7fd0, 0xa88ad8, 0x6f9a6a] : null }, rng, 0, lmZ, Math.PI));
    for (const s of [-1, 1]) {
      bench(B, s * 5.2, lmZ - 3.2, s > 0 ? -Math.PI / 2 : Math.PI / 2, { wood: T.deck.getHex(), iron: T.iron.getHex() });
      lamp(B, s * 5.8, lmZ + 1.5, { style: 'classic', color: T.iron.getHex() });
      zoneColliders.push({ localX: s * 5.2, localZ: lmZ - 3.2, hw: 0.35, hd: 0.95, source: `${z.data.code}-bench` }, { localX: s * 5.8, localZ: lmZ + 1.5, hw: 0.22, hd: 0.22, source: `${z.data.code}-lamp` });
    }

    // ---- street life (carts, terrace, parked cars) into the same buckets
    const streetLife = buildDistrictLife(rng, {
      accent: cAccent, secondary: cSecondary, nearEdge, code: z.data.zoneName,
      lowPower: this.lowPower, roadLayout, detail: B.detail,
    }, B);
    zoneColliders.push(...(streetLife.colliderBoxes || []));
    z.patronSlots = streetLife.patronSlots || [];

    // ---- furniture on the pavements: lamps, benches, bins, post + phone box,
    // bollards along the shopfront walk, a shelter, a bike rack, planters.
    const furniture = [];
    const tryPlace = (x, zz, r, fn) => { if (free(x, zz, r)) { fn(); furniture.push([x, zz, r]); return true; } return false; };
    const lampSpots = [[-15, nearEdge - 1.1], [-4.5, nearEdge - 1.1], [14.5, nearEdge - 1.1],
      [-20.6, -7], [20.6, -7], [-20.6, 8.5], [20.6, 8.5], [-20.6, 22], [20.6, 22],
      [-9.2, 1.4], [9.2, 1.4], [-9.2, 16.4], [9.2, 16.4], [-14, farEdge + 1.5], [14, farEdge + 1.5]];
    lampSpots.forEach(([x, zz], i) => tryPlace(x, zz, 0.45, () => {
      lamp(B, x, zz, { style: country === 'us' || country === 'ca' ? (i % 2 ? 'modern' : 'classic') : 'classic', color: T.iron.getHex(), cone: B.detail && i % 2 === 0 });
      zoneColliders.push({ localX: x, localZ: zz, hw: 0.2, hd: 0.2, source: `${z.data.code}-lamp` });
    }));
    for (const [x, zz, yaw] of [[-20.6, 2, Math.PI / 2], [20.6, 15, -Math.PI / 2], [-14, farEdge + 1.5, Math.PI], [0, -7.3, 0]]) {
      tryPlace(x, zz, 1.0, () => {
        bench(B, x, zz, yaw, { wood: T.deck.getHex(), iron: T.iron.getHex() });
        zoneColliders.push({ localX: x, localZ: zz, hw: Math.abs(Math.cos(yaw)) * 0.95 + Math.abs(Math.sin(yaw)) * 0.35, hd: Math.abs(Math.sin(yaw)) * 0.95 + Math.abs(Math.cos(yaw)) * 0.35, source: `${z.data.code}-bench` });
      });
    }
    for (const [x, zz] of [[-16.6, nearEdge - 1.0], [16.4, nearEdge - 1.0], [-20.6, 12.5], [20.6, -1.5], [3.2, 8.2]]) {
      tryPlace(x, zz, 0.4, () => { bin(B, x, zz, { lid: T.accent }); zoneColliders.push({ localX: x, localZ: zz, hw: 0.3, hd: 0.3, source: `${z.data.code}-bin` }); });
    }
    tryPlace(-19.4, -7.3, 0.5, () => { postBox(B, -19.4, -7.3, Math.PI / 2, country); zoneColliders.push({ localX: -19.4, localZ: -7.3, hw: 0.35, hd: 0.35, source: `${z.data.code}-post-box` }); });
    tryPlace(19.4, 1.2, 0.7, () => { phoneBox(B, 19.4, 1.2, -Math.PI / 2, country); zoneColliders.push({ localX: 19.4, localZ: 1.2, hw: 0.5, hd: 0.5, source: `${z.data.code}-phone-box` }); });
    if (country === 'us' || country === 'ca') tryPlace(-3.2, 8.2, 0.3, () => hydrant(B, -3.2, 8.2));
    tryPlace(-17.5, 16.4, 1.8, () => {
      busShelter(B, -17.5, 16.4, 0, { accent: z.line.color, seat: T.deck.getHex() });
      zoneColliders.push({ localX: -17.5, localZ: 16.4 - 0.5, hw: 1.7, hd: 0.3, source: `${z.data.code}-shelter` });
    });
    tryPlace(9.8, nearEdge - 1.2, 1.4, () => bikeRack(B, 9.8, nearEdge - 1.2, 0, { n: 3 }));
    for (let i = 0; i < 4; i++) {
      const x = -19 + i * 12.6 + (i > 1 ? 2 : 0), zz = 26.6;
      tryPlace(x, zz, 0.9, () => {
        planter(B, x, zz, 0, { color: T.stone.getHex(), hedge: 0x2f856e });
        zoneColliders.push({ localX: x, localZ: zz, hw: 0.85, hd: 0.35, source: `${z.data.code}-planter` });
      });
    }
    // bollards guard the shopfront walk from the carriageway mouths
    for (const x of [-15.9, -8.4, 8.4, 15.9]) for (const dz of [0, 0.9]) {
      const zz = nearEdge - 0.4 + dz;
      if (free(x, zz, 0.15)) bollard(B, x, zz, { color: T.iron.getHex(), cap: B.detail ? z.line.color : null });
    }
    // street-name plates at two corners
    if (streetUV) {
      tryPlace(-9.0, -6.6, 0.3, () => streetSign(B, -9.0, -6.6, Math.PI, streetUV, { post: T.iron.getHex() }));
      tryPlace(9.0, 8.8, 0.3, () => streetSign(B, 9.0, 8.8, 0, streetUV, { post: T.iron.getHex() }));
    }
    // festive districts string bunting between the frontage pair and lights across the cross street
    if (arch.flags.bunting && B.detail) {
      const fr = slots.filter((s) => s.frontage).sort((a, b) => a.x - b.x);
      for (let i = 0; i + 1 < fr.length; i++) {
        const a = fr[i], b = fr[i + 1];
        bunting(B, a.x + a.w / 2, 6.2, a.z - a.d / 2 - 0.2, b.x - b.w / 2, 6.2, b.z - b.d / 2 - 0.2, [cAccent.getHex(), 0xf5f2ff, z.line.color, 0xffb84d]);
      }
      for (const rz of roadLayout.crossZs) {
        stringLights(B, -20.2, 4.6, rz, 20.2, 4.6, rz, { every: 1.3 });
      }
    } else if (B.detail && rng() < 0.5) {
      stringLights(B, -20.2, 4.6, roadLayout.crossZs[0], 20.2, 4.6, roadLayout.crossZs[0], { every: 1.4 });
    }

    // ---- station platform at the stop, in the district's own frame
    const signPos = { x: z.dir.x * 5.4 * 0 + 5.4, z: -LATERAL + 8.2 };
    // (the platform used to be a separate scene object placed from stopPos; in
    // district-local coordinates that is x=5.4 along the line, z=-17.8)
    zoneColliders.push(...this.buildStationSign(B, z, signPos.x, signPos.z, plateUV));
    // zebra over the boulevard at this stop (drawn by the side>0 zone only so
    // the two districts flanking a station don't stack two crossings)
    if (z.side > 0) zebra(B, 0, -LATERAL, Math.PI / 2, { width: 8.4, y: 0.03 });

    // ---- flora: species from climate keywords, one InstancedMesh per species
    const species = speciesFor(z.data);
    const treeSpots = [[-19, nearEdge - 1.0], [19.2, nearEdge - 1.0],
      [-21.6, -12], [21.6, -12], [-21.6, 3.5], [21.6, 3.5], [-21.6, 18], [21.6, 18],
      [-18.5, farEdge + 1.4], [18.5, farEdge + 1.4], [-6.5, farEdge + 1.4], [6.5, farEdge + 1.4],
      [-3.0, -7.3], [15.5, 1.3], [-14.6, 16.4]];
    const bySpecies = new Map();
    treeSpots.forEach(([x, zz], i) => {
      if (!free(x, zz, 0.7) || furniture.some(([fx, fz, fr]) => Math.hypot(fx - x, fz - zz) < fr + 1.2)) return;
      if (!B.detail && i % 2) return;                    // potato keeps every other tree
      const kind = species[i % species.length];
      if (!bySpecies.has(kind)) bySpecies.set(kind, []);
      const s = 0.85 + rng() * 0.35;
      bySpecies.get(kind).push({ x, z: zz, s, rot: rng() * Math.PI * 2, variant: i % 3 });
      treePit(B, x, zz, { r: 0.75, color: T.iron.getHex() });
      zoneColliders.push({ localX: x, localZ: zz, hw: 0.28, hd: 0.28, source: `${z.data.code}-tree` });
    });
    for (const [kind, list] of bySpecies) {
      const inst = treeInstances(kind, list);
      if (inst) g.add(inst);
    }

    mark('furniture');
    yield B;
    // ---- build the buckets into ≤ 9 meshes
    const occluders = slots.map((s) => ({ x: s.x, z: s.z, hw: s.w / 2, hd: s.d / 2 }));
    const meshes = buildBuckets(B, {
      atlas: atlas.texture(), name: z.data.code,
      litEmissive: new THREE.Color(0xffa050).lerp(cLine, 0.18),
      ao: this.vertexAO ? (geo) => bakeDistrictAO(geo, occluders) : null,
    });
    for (const m of meshes) {
      if (m.name.endsWith('-shell') && this.quality?.wetStreets) addWetStreets(m.material, { strength: 0.55 });
      if (m.userData.fineDetail) { g.userData.fine = m; m.visible = false; }
      if (m.userData.midDetail) { g.userData.mid = m; }
      g.add(m);
    }
    mark('merge+ao');
    yield null;

    // orient district: face the boulevard
    const yaw = Math.atan2(z.perp.x * z.side, z.perp.y * z.side);
    g.rotation.y = yaw;
    g.position.set(z.center.x, 0, z.center.y);
    this.scene.add(g);
    z.chunk = g;
    if (fade) this._beginFade(g);

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
    colliders.push(...tagged);
    this._colliderTag.set(z.data.code, tagged);

    // --- the district's own crowd: neighbours who live and work on this block ---
    this.populateDistrict(z, {
      yaw, cosY, sinY, nearEdge, farEdge, districtHalfWidth, districtMid, roadLayout,
    });

    // --- three accent-matched locals per district, each with a unique body ---
    if (this.npcBases?.length && this.world) {
      const spawned = [];
      const zoneProg = this.progressFor(z.data.code);
      // Sidewalk pockets between facade setbacks and carriageway edges. Keep
      // teachers out of live lanes while leaving a clear approach for players.
      const locals = [[-17.4, -7.3], [5.6, 1.1], [17.4, 16.5]];
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
        const blob = blobShadow(0.5 * s);
        blob.userData.disposeWithNpc = true;             // its PlaneGeometry is per-NPC
        wrap.add(blob);

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
        let bodyTop = 1.8;
        if (base?.rigged) {
          const inst = instanceRig(base.object || base.mesh, base.clips);
          inst.mesh.material = inst.mesh.material.clone();
          inst.mesh.material.color.lerp(tint, 0.22);
          wrap.add(inst.object);
          entry.model = inst.mesh; entry.mixer = inst.mixer; entry.playOnce = inst.playGesture;
          bodyTop = new THREE.Box3().setFromObject(inst.object).max.y;
        } else {
          const model = base.staticModel.clone(true);
          model.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.lerp(tint, 0.22); o.castShadow = true; } });
          wrap.add(model);
          entry.model = model;
          entry.playOnce = (name) => { entry.gesture = { name, t: 0 }; };
          bodyTop = new THREE.Box3().setFromObject(model).max.y;
        }
        // the hat sits on the measured head, not at an authored 2.0 m
        addNpcSignature(wrap, hash(`${z.data.code}:${i}`), tint, Number.isFinite(bodyTop) && bodyTop > 1 ? bodyTop : 1.8);
        // materials the draw-range cross-fade will animate (world.update)
        entry.fadeMats = [];
        wrap.traverse((o) => { if (o.isMesh && o.material && !o.userData.disposeWithNpc && !o.isSprite && o !== blob) entry.fadeMats.push(o.material); });
        this.scene.add(wrap);
        this.world.npcs.push(entry);
        spawned.push(entry);
      });
      this._npcTag.set(z.data.code, spawned);
    }

    // Pre-warm every district shader once, so arriving somewhere later never
    // stalls on program compilation.
    if (!this._prewarmed && this.renderer && this.camera) {
      this._prewarmed = true;
      try { this.renderer.compile(this.scene, this.camera); } catch (err) { console.warn('[EM] shader pre-warm failed:', err); }
    }
    mark('people');
    this.lastBuildMs = performance.now() - t0;
    this.lastBuildProfile = prof;
    this.buildCount = (this.buildCount || 0) + 1;
  }

  // Fill a freshly-streamed district with its own people. Walkers loop the
  // sidewalk ring and the inner streets; patrons stand at the cafe terrace the
  // district published. Everyone here is tagged with the district's dialect so
  // their chatter and their street exercises speak the local English.
  populateDistrict(z, { cosY, sinY, nearEdge, farEdge, districtHalfWidth, districtMid, roadLayout }) {
    if (!this.crowd) return;
    const toWorld = (lx, lz) => ({
      x: z.center.x + lx * cosY + lz * sinY,
      z: z.center.y - lx * sinY + lz * cosY,
    });
    const ring = districtHalfWidth + 1.3;
    const routes = [
      // the sidewalk ring around the whole block
      makeRoute([
        toWorld(-ring, nearEdge - 0.3), toWorld(ring, nearEdge - 0.3),
        toWorld(ring, farEdge + 1.3), toWorld(-ring, farEdge + 1.3),
      ]),
      // an inner beat along the one-way street and the far cross street
      makeRoute([
        toWorld(roadLayout.centreX - 2.9, roadLayout.crossZs[0] + 4.2),
        toWorld(roadLayout.centreX - 2.9, roadLayout.crossZs[1] - 4.2),
        toWorld(roadLayout.outerXs[1] - 4.4, roadLayout.crossZs[1] - 4.2),
        toWorld(roadLayout.outerXs[1] - 4.4, roadLayout.crossZs[0] + 4.2),
      ]),
      // the shopfront walk facing the boulevard, where the teachers stand
      makeRoute([
        toWorld(-ring + 2, nearEdge + 2.4), toWorld(ring - 2, nearEdge + 2.4),
        toWorld(ring - 2, nearEdge + 3.9), toWorld(-ring + 2, nearEdge + 3.9),
      ]),
    ];

    const agents = [];
    const walkers = Math.max(3, Math.round((this.quality?.crowd ?? 220) * 0.075));
    for (let i = 0; i < walkers; i++) {
      const agent = this.crowd.spawn({
        route: routes[i % routes.length],
        speed: 0.85 + Math.random() * 0.7,
        dialect: z.data.code,
      });
      if (!agent) break;
      agents.push(agent);
    }
    // Standing locals at the terrace. A few of them have something to teach —
    // one question each, so a street is worth walking down rather than crossing.
    const street = z.data.streetExercises || [];
    const lap = this.progressFor(z.data.code).laps;
    let taught = 0;
    (z.patronSlots || []).forEach((slot, i) => {
      const w = toWorld(slot.x, slot.z);
      const agent = this.crowd.spawn({
        route: makeRoute([w, { x: w.x + 0.001, z: w.z }]),
        standing: true,
        dialect: z.data.code,
      });
      if (!agent) return;
      agent.heading = slot.heading + Math.atan2(sinY, cosY);
      agents.push(agent);
      if (street.length && taught < 3 && i % 2 === 0) {
        const item = street[(taught + lap) % street.length];
        const who = streetLocalFor(z.data.code, i);
        this.crowd.setSpeaker(agent, {
          name: who.name,
          role: item.role || who.role,
          line: item.line,
          exercise: item,
          dialectCode: z.data.code,
          accentProfile: accentProfileFor(z.data.code, 2 + taught),
          done: false,
        });
        taught++;
      }
    });
    this._crowdTag.set(z.data.code, agents);
  }

  // Street wins are lighter than a teacher's drill: they feed the journal and
  // XP, but they never close a district's round on their own.
  recordStreetWin(code) {
    const p = this._ensure(code);
    p.street = (p.street || 0) + 1;
    this.saveProgress();
    return p.street;
  }

  // ---------- facade architecture ----------
  // Every building is generated by the facade kit from the district's own
  // archetype pool (read from its authored `architecture` text) and palette.
  // Frontage slots face the boulevard; inner slots face their nearest street.
  buildFacadeBlock(B, slots, rng, T, arch, signs, z) {
    const out = [];
    for (const step of this.facadeSteps(B, slots, rng, T, arch, signs, z)) out.push(...step);
    return out;
  }

  // one building per yielded step (its colliders), so the streaming loop can
  // stop between buildings
  *facadeSteps(B, slots, rng, T, arch, signs, z) {
    const nearEdge = BOULEVARD.tramLaneX + 4.2 - LATERAL;
    const roads = { xs: [-12.2, 0, 12.2], zs: [-2.8, 12.2, nearEdge - 3] };
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const pool = slot.frontage ? arch.frontage : arch.inner;
      const kind = pool[(i + ((rng() * pool.length) | 0)) % pool.length];
      // face the nearest carriageway
      let front = FACES[1], best = Infinity;
      if (!slot.frontage) {
        for (const F of FACES) {
          const edge = F.nx ? slot.x + F.nx * slot.w / 2 : slot.z + F.nz * slot.d / 2;
          const list = F.nx ? roads.xs : roads.zs;
          for (const r of list) {
            const dist = (r - edge) * (F.nx || F.nz);
            if (dist > 0 && dist < best) { best = dist; front = F; }
          }
        }
      }
      const tones = buildingTones(T, i, rng, arch.flags);
      const flags = { ...arch.flags, fireEscapes: /fire escape|walk-up|brownstone|tenement|bodega/i.test(z.data.architecture || ''), flowerBoxes: /window box|flower|geranium|bougainvillea/i.test(z.data.architecture || ''), litRatio: 0.34 };
      yield buildFacade(B, { ...slot, front }, kind, rng, tones, signs, flags);
    }
  }

  // kept for API compatibility — landmarks now come from the kit
  buildLandmark(variant, cAccent, cRoof) {
    const B = makeBuckets();
    const kinds = ['clocktower', 'arch', 'obelisk'];
    emitLandmark(B, kinds[variant % kinds.length], { accent: cAccent, roof: cRoof, line: cAccent, stone: new THREE.Color(0xd8b88a) }, mulberry32(variant), 0, 0, 0);
    const mesh = buildBuckets(B, { name: 'district-landmark' })[0];
    if (mesh) mesh.userData.zoneLandmark = true;
    return mesh || new THREE.Group();
  }

  // Station platform in the district's local frame at (sx, sz): nameplate on
  // two posts, a glass shelter with a bench and a lit rail, route board,
  // emergency cabinet, bin. Returns local colliders.
  buildStationSign(B, z, sx, sz, plateUV) {
    const ink = new THREE.Color(PALETTE.ink);
    const lineCol = new THREE.Color(z.line.color);
    const P = { shell: [], neon: [], glass: [], sign: [] };
    const S = (g, c) => P.shell.push([g, c]);
    // platform paving with the line colour bled in, edged
    S(box(7.2, 0.05, 3.6, 0, 0.035, 0), lineCol.clone().lerp(new THREE.Color(PALETTE.plaza), 0.86));
    S(box(7.4, 0.03, 0.12, 0, 0.07, -1.72), lineCol.clone().lerp(new THREE.Color(PALETTE.plaza), 0.4));
    // nameplate posts + double-sided plate
    for (const x of [-1.6, 1.6]) S(cyl(0.07, 0.08, 3.0, 7, x, 1.5, 0), ink);
    S(box(3.7, 1.26, 0.06, 0, 2.9, 0), ink);
    if (plateUV) {
      P.sign.push([uvCell(new THREE.PlaneGeometry(3.6, 1.18), plateUV.u0, plateUV.v0, plateUV.u1, plateUV.v1).translate(0, 2.9, 0.035), 0xffffff]);
      P.sign.push([uvCell(new THREE.PlaneGeometry(3.6, 1.18), plateUV.u0, plateUV.v0, plateUV.u1, plateUV.v1).rotateY(Math.PI).translate(0, 2.9, -0.035), 0xffffff]);
    }
    // shelter: four supports, glass roof, glass back, lit rail, slatted bench
    for (const x of [-1.65, 1.65]) for (const zz of [0.55, 1.65]) S(cyl(0.06, 0.075, 3.55, 7, x, 1.78, zz), CHROME);
    S(box(3.9, 0.08, 1.7, 0, 3.6, 1.1), ink);
    P.glass.push([box(3.8, 0.04, 1.62, 0, 3.66, 1.1), 0xbfe7f0]);
    P.glass.push([box(3.5, 1.9, 0.04, 0, 2.3, 0.1), 0xbfe7f0]);
    P.neon.push([box(3.6, 0.06, 0.06, 0, 3.55, 1.95), lineCol.getHex()]);
    S(box(3.0, 0.08, 0.5, 0, 0.55, 0.55), WOOD);
    for (const x of [-1.3, 1.3]) S(box(0.08, 0.5, 0.5, x, 0.28, 0.55), ink);
    // route board on the back post
    S(box(0.9, 1.3, 0.06, -1.6, 1.6, 1.65 + 0.06), ink);
    P.neon.push([box(0.7, 0.06, 0.02, -1.6, 2.1, 1.65 + 0.1), lineCol.getHex()]);
    for (let i = 0; i < 6; i++) P.neon.push([sphere(0.05, -1.85 + i * 0.1, 1.55, 1.65 + 0.1, 5, 4), 0xf5f2ff]);
    // emergency cabinet (bright by design — infrastructure, not decoration)
    S(cyl(0.055, 0.075, 1.4, 7, 2.7, 0.7, 0.5), CHROME);
    S(box(0.46, 0.86, 0.26, 2.7, 1.2, 0.5), 0xff405f);
    P.neon.push([sphere(0.1, 2.7, 1.25, 0.33, 8, 6), 0xffffff]);
    P.neon.push([cyl(0.08, 0.08, 0.12, 8, 2.7, 1.72, 0.5), 0xff405f]);
    // bin
    S(cyl(0.24, 0.22, 0.8, 10, -2.8, 0.42, 1.2), ink.clone().lerp(lineCol, 0.2));
    S(cyl(0.27, 0.27, 0.07, 10, -2.8, 0.85, 1.2), lineCol);
    placeInto(B.shell, P.shell, sx, sz, 0);
    placeInto(B.neon, P.neon, sx, sz, 0);
    placeInto(B.glass, P.glass, sx, sz, 0);
    placeInto(B.sign, P.sign, sx, sz, 0);
    const cols = [];
    for (const x of [-1.6, 1.6]) cols.push({ localX: sx + x, localZ: sz, hw: 0.11, hd: 0.11, source: `${z.data.code}-station-sign` });
    for (const x of [-1.65, 1.65]) for (const zz of [0.55, 1.65]) cols.push({ localX: sx + x, localZ: sz + zz, hw: 0.11, hd: 0.11, source: `${z.data.code}-shelter-support` });
    cols.push({ localX: sx + 2.7, localZ: sz + 0.5, hw: 0.3, hd: 0.22, source: `${z.data.code}-emergency-stop` });
    cols.push({ localX: sx - 2.8, localZ: sz + 1.2, hw: 0.28, hd: 0.28, source: `${z.data.code}-bin` });
    return cols;
  }

  disposeChunk(z, colliders) {
    if (this._pending?.z === z) this._abandonPending();
    const kill = (root) => root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || m.userData?.shared) continue;
        if (m.map) m.map.dispose();
        m.dispose();
      }
      if (o.isInstancedMesh) o.dispose();      // releases the instance attributes
    });
    if (z.chunk.attachSign) { kill(z.chunk.attachSign); this.scene.remove(z.chunk.attachSign); }
    if (z.chunk.attachZebra) { kill(z.chunk.attachZebra); this.scene.remove(z.chunk.attachZebra); }
    // a chunk still fading in is dropped from the fade list
    const fadeI = this._fading.findIndex((f) => f.mats.some((m) => z.chunk.getObjectByProperty('material', m.mat)));
    if (fadeI >= 0) this._fading.splice(fadeI, 1);
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
      // body geometry is shared with the template — dispose only the per-NPC
      // materials, the blob shadow / hat geometry, and the skeleton clone's
      // bone texture (which used to leak one texture per streamed local)
      n.obj.traverse((o) => {
        if (o.isSkinnedMesh) o.skeleton?.dispose?.();
        if (!o.isMesh) return;
        if (o.userData.disposeWithNpc) o.geometry.dispose();
        if (o.isSprite) return;               // marker sprites share one material
        o.material?.dispose?.();
      });
      this.scene.remove(n.obj);
      const i = this.world.npcs.indexOf(n);
      if (i >= 0) this.world.npcs.splice(i, 1);
    }
    this._npcTag.delete(z.data.code);

    for (const agent of this._crowdTag.get(z.data.code) || []) this.crowd?.despawn(agent);
    this._crowdTag.delete(z.data.code);
  }
}
