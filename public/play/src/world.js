// Central Station hub: ground/roads, Meshy GLB placements, instanced skyline,
// trees, NPCs with exercises, colliders. Zones stream in later milestones.
import * as THREE from 'three';
import { makeGLTFLoader } from './loaders.js';
import { PALETTE, toonMat, toonifyGLB, blobShadow, makeDustMotes, makeClouds, addWindSway, addDuskWindows } from './materials.js';
import { makeTerrain, heightAt, hillFactor } from './terrain.js';
import { instanceRig } from './rig.js';
import { attachMarker } from './markers.js';

const MODELS = 'public/assets/models/';

// --- placement table: url, target height (m), position, yaw, collider ---
const BUILDINGS = [
  { url: 'station_mass.glb',     h: 13, pos: [0, -34],   rot: 0,            name: 'Central Station' },
  { url: 'language_academy.glb', h: 11, pos: [-26, -14], rot: Math.PI / 5,  name: 'Language Academy' },
  { url: 'bookshop.glb',         h: 8,  pos: [24, -16],  rot: -Math.PI / 5, name: 'Corner Bookshop' },
  { url: 'listening_lounge.glb', h: 8,  pos: [30, 10],   rot: -Math.PI / 2.4, name: 'Listening Lounge' },
];
const PROPS = [
  { url: 'lesson_kiosk.glb',     h: 2.6, pos: [-8, -6],  rot: 0.6 },
  { url: 'vocab_bench.glb',      h: 1.0, pos: [6, 2],    rot: -1.2 },
  { url: 'vocab_bench.glb',      h: 1.0, pos: [-7, 6],   rot: 1.9 },
  { url: 'street_lamp.glb',      h: 4.2, pos: [10, -10], rot: 0 },
  { url: 'street_lamp.glb',      h: 4.2, pos: [-10, -10],rot: 0 },
  { url: 'street_lamp.glb',      h: 4.2, pos: [10, 10],  rot: 0 },
  { url: 'street_lamp.glb',      h: 4.2, pos: [-10, 10], rot: 0 },
  { url: 'wayfinding_totem.glb', h: 3.4, pos: [2, -12],  rot: 0.2 },
  { url: 'phone_booth.glb',      h: 2.8, pos: [16, -4],  rot: -0.9 },
  { url: 'station_gate.glb',     h: 3.6, pos: [0, -22],  rot: 0, collider: false },
];
const NPCS = [
  {
    url: 'npc_tutor_conductor.glb', h: 1.78, pos: [-3.5, -9], rot: 0.4,
    voiceId: 'hub_clara', barkFam: 'isles',
    name: 'Conductor Clara', role: 'Tutor Conductor',
    greeting: "Welcome to English Metropolis! Every line on this map speaks its own English. Fancy a warm-up before you ride?",
    grammar: { concept: 'articles', level: 'A1', conceptName: 'Articles (a / an / the)' },
    exercise: {
      title: 'All aboard: transport words', type: 'vocabulary', reward: 15,
      prompt: 'You "catch" one of these to travel across the city. Which one?',
      options: ['a train', 'a lamp', 'a bench', 'a bookshop'], answerIndex: 0,
    },
  },
  {
    url: 'npc_pronunciation_robot.glb', h: 1.9, pos: [7, -8], rot: -0.6,
    voiceId: 'hub_pron3000', barkFam: 'liberty',
    name: 'PRON-3000', role: 'Pronunciation Robot',
    greeting: "BEEP. Calibrating vowels. Human, do you know which word does NOT rhyme with the others?",
    grammar: { concept: 'plurals', level: 'A1', conceptName: 'Plurals' },
    exercise: {
      title: 'Rhyme radar', type: 'listening', reward: 20,
      prompt: 'Which word does NOT rhyme with the other three?',
      options: ['though', 'go', 'slow', 'cow'], answerIndex: 3,
    },
  },
  {
    url: 'npc_phrase_vendor.glb', h: 1.75, pos: [-14, 4], rot: 1.4,
    voiceId: 'hub_marek', barkFam: 'liberty',
    name: 'Marek the Phrase Vendor', role: 'Phrase Vendor',
    greeting: "Fresh phrases! Hot idioms! Today only: 'it's raining cats and dogs'. Know what it means?",
    grammar: { concept: 'prepositions', level: 'A2', conceptName: 'Prepositions' },
    exercise: {
      title: 'Idiom stall', type: 'conversation', reward: 15,
      prompt: "If it's 'raining cats and dogs', what should you bring?",
      options: ['an umbrella', 'a pet carrier', 'a sandwich', 'sunglasses'], answerIndex: 0,
    },
  },
  {
    url: 'npc_bookshop_owner.glb', h: 1.72, pos: [20, -10], rot: -2.1,
    voiceId: 'hub_beatrice', barkFam: 'isles',
    name: 'Beatrice Byword', role: 'Bookshop Owner',
    greeting: "Mind the stacks, love. A good book is the cheapest ticket in the Metropolis. Care for a quick grammar riddle?",
    grammar: { concept: 'verb_tense', level: 'B1', conceptName: 'Verb tenses' },
    exercise: {
      title: 'Shelf grammar', type: 'grammar', reward: 20,
      prompt: 'Pick the correct sentence:',
      options: ["She don't like tea.", "She doesn't likes tea.", "She doesn't like tea.", "She not like tea."],
      answerIndex: 2,
    },
  },
];

function normalizeToHeight(root, targetH) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = targetH / Math.max(size.y, 0.001);
  root.scale.setScalar(s);
  // re-measure, sit on ground, center on origin
  const box2 = new THREE.Box3().setFromObject(root);
  const c = new THREE.Vector3(); box2.getCenter(c);
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= box2.min.y;
  return root;
}

export class World {
  constructor(scene, loadingManager) {
    this.scene = scene;
    this.loader = makeGLTFLoader(loadingManager);
    this.colliders = [];
    this.npcs = [];       // { obj, name, role, greeting, exercise, done, baseY }
    this.animated = [];   // objects with userData.update(t)
  }

  async build() {
    this.buildGroundAndRoads();
    this.buildSkyline();
    this.buildSuburbs();
    this.buildTrees();
    const motes = makeDustMotes();
    this.scene.add(motes);
    this.animated.push(motes);
    const clouds = makeClouds();
    this.scene.add(clouds);
    this.animated.push(clouds);
    await Promise.all([this.placeBuildings(), this.placeProps()]);
    // hub NPCs are placed later, once the shared rigged bases are ready
  }

  setNPCBases(bases) {
    this.npcBases = bases;
    this._baseByKey = new Map(bases.map((b) => [b.key, b]));
  }

  setZones(zoneMgr) { this.zoneMgr = zoneMgr; }

  // blend an instance colour toward the dialect region it stands in
  regionTint(col, x, z, amt) {
    const region = this.zoneMgr?.regionAt(x, z);
    if (region) col.lerp(new THREE.Color(region.data.palette.accent), amt);
    return col;
  }

  loadGLB(url) {
    return new Promise((res, rej) =>
      this.loader.load(MODELS + url, (g) => res(g.scene), undefined, rej));
  }

  loadGLTF(url) {
    return new Promise((res, rej) =>
      this.loader.load(MODELS + url, res, undefined, rej));
  }

  addAABBCollider(obj, pad = 0.15) {
    const box = new THREE.Box3().setFromObject(obj);
    this.colliders.push({
      minX: box.min.x - pad, maxX: box.max.x + pad,
      minZ: box.min.z - pad, maxZ: box.max.z + pad,
    });
  }

  async placeBuildings() {
    await Promise.all(BUILDINGS.map(async (b) => {
      const m = toonifyGLB(normalizeToHeight(await this.loadGLB(b.url), b.h));
      const g = new THREE.Group();
      g.add(m);
      g.position.set(b.pos[0], 0, b.pos[1]);
      g.rotation.y = b.rot;
      this.scene.add(g);
      this.addAABBCollider(g, 0.3);
    }));
  }

  async placeProps() {
    // load each unique url once, clone for repeats
    const unique = [...new Set(PROPS.map(p => p.url))];
    const protos = {};
    await Promise.all(unique.map(async (u) => { protos[u] = toonifyGLB(await this.loadGLB(u)); }));
    for (const p of PROPS) {
      const m = normalizeToHeight(protos[p.url].clone(), p.h);
      const g = new THREE.Group();
      g.add(m);
      g.position.set(p.pos[0], 0, p.pos[1]);
      g.rotation.y = p.rot;
      this.scene.add(g);
      if (p.collider !== false && p.h > 1.5) this.addAABBCollider(g, 0.05);
    }
  }

  placeHubNPCs() {
    NPCS.forEach((n, i) => {
      const key = n.url.replace('.glb', '');
      const base = this._baseByKey?.get(key);
      const g = new THREE.Group();
      g.position.set(n.pos[0], 0, n.pos[1]);
      g.rotation.y = n.rot;
      g.add(blobShadow(0.55));

      // hub teachers form their own quest circuit ('hub'); baseGrammar keeps
      // the authored concept so laps can rotate from it
      const entry = { obj: g, ...n, done: false, phase: Math.random() * 6,
        zoneCode: 'hub', npcIdx: i, baseGrammar: n.grammar,
        gestureCorrect: n.gestureCorrect || 'agree',
        gestureWrong: n.gestureWrong || 'headShake',
        gestureGreet: n.gestureGreet || 'Wave' };

      if (base?.rigged) {
        const inst = instanceRig(base.mesh, base.clips);
        g.add(inst.object);
        entry.model = inst.mesh;
        entry.mixer = inst.mixer;
        entry.playOnce = inst.playGesture;
      } else if (base) {
        const m = base.staticModel.clone(true);
        g.add(m);
        entry.model = m;
        entry.playOnce = (name) => { entry.gesture = { name, t: 0 }; };
      } else {
        return;
      }
      attachMarker(entry, n.h + 0.55);
      this.scene.add(g);
      this.npcs.push(entry);
      this.colliders.push({
        minX: n.pos[0] - 0.4, maxX: n.pos[0] + 0.4,
        minZ: n.pos[1] - 0.4, maxZ: n.pos[1] + 0.4,
      });
    });
  }

  buildGroundAndRoads() {
    // rolling-hills terrain (flat along hub/corridors/districts)
    this.scene.add(makeTerrain());

    // central plaza — paved civic square with ring seams (not sand!)
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(20, 40), toonMat(PALETTE.plaza));
    plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    this.scene.add(plaza);
    const plazaRim = new THREE.Mesh(new THREE.RingGeometry(20, 21.2, 40), toonMat(PALETTE.terracotta));
    plazaRim.rotation.x = -Math.PI / 2; plazaRim.position.y = 0.021;
    this.scene.add(plazaRim);
    for (const r of [7, 13]) {                    // paving seams
      const seam = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.28, 40), toonMat(PALETTE.curb));
      seam.rotation.x = -Math.PI / 2; seam.position.y = 0.023;
      this.scene.add(seam);
    }

    // three metro boulevards radiating at 120° — green / blue / orange curbs
    const lines = [
      { angle: Math.PI / 2, curb: PALETTE.sage },        // Isles, north
      { angle: Math.PI / 2 + (2 * Math.PI) / 3, curb: PALETTE.dustyBlue },  // Liberty
      { angle: Math.PI / 2 - (2 * Math.PI) / 3, curb: PALETTE.amber },      // Sunward
    ];
    const roadMat = toonMat(PALETTE.road);
    const walkMat = toonMat(PALETTE.sidewalk);
    const dashMat = toonMat(0xe8dcbb);
    const ROAD_LEN = 400, ROAD_MID = -20 - ROAD_LEN / 2;
    for (const L of lines) {
      const g = new THREE.Group();
      const road = new THREE.Mesh(new THREE.PlaneGeometry(9, ROAD_LEN), roadMat);
      road.rotation.x = -Math.PI / 2; road.position.set(0, 0.015, ROAD_MID);
      g.add(road);
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(2.4, ROAD_LEN), walkMat);
        walk.rotation.x = -Math.PI / 2; walk.position.set(side * 5.7, 0.018, ROAD_MID);
        g.add(walk);
        const curb = new THREE.Mesh(new THREE.PlaneGeometry(0.5, ROAD_LEN),
          toonMat(L.curb));
        curb.rotation.x = -Math.PI / 2; curb.position.set(side * 7.05, 0.02, ROAD_MID);
        g.add(curb);
      }
      // center dashes as one instanced mesh per line
      const nDash = 40;
      const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.35, 3.4), dashMat, nDash);
      const DM = new THREE.Matrix4();
      const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
      for (let d = 0; d < nDash; d++) {
        DM.copy(rot).setPosition(0, 0.019, -26 - d * 9.6);
        dashes.setMatrixAt(d, DM);
      }
      dashes.instanceMatrix.needsUpdate = true;
      g.add(dashes);
      // zebra crossing where the boulevard meets the plaza
      const zebra = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.05, 2.2), dashMat, 7);
      const ZM = new THREE.Matrix4();
      const zrot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
      for (let s = 0; s < 7; s++) {
        ZM.copy(zrot).setPosition(-3.9 + s * 1.3, 0.02, -24.6);
        zebra.setMatrixAt(s, ZM);
      }
      zebra.instanceMatrix.needsUpdate = true;
      g.add(zebra);
      g.rotation.y = L.angle - Math.PI / 2;
      this.scene.add(g);
    }
  }

  buildSkyline() {
    // instanced toon boxes: mid-rise ring + a real skyscraper downtown
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = addDuskWindows(toonMat(0xffffff));   // warm lit windows on facades
    const colors = [0xd9b98a, 0xc9a17a, 0xb98a6a, 0xd9c9a8, 0xc96f4a, 0x9a8f76, 0xb0a284];
    const count = 240;
    const inst = new THREE.InstancedMesh(box, mat, count);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    const col = new THREE.Color();
    let i = 0;
    // districts are human-scale streets — towers stay OUT of them, and get
    // shorter the closer they stand, so nothing bare looms over a street.
    // (The old 46-80m mid-rise ring is gone: dialect districts fill it now.)
    const distToDistrict = (x, z) => {
      let best = Infinity;
      for (const zn of (this.zoneMgr?.zones || [])) {
        const dx = x - zn.center.x, dz = z - zn.center.y;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) best = d2;
      }
      return Math.sqrt(best);
    };
    const place = (r0, r1, n, hMin, hMax, wMin, wMax) => {
      let attempts = 0;
      for (let k = 0; k < n && i < count; k++, i++) {
        if (++attempts > n * 40) break;                 // packed — settle for fewer towers
        const a = Math.random() * Math.PI * 2;
        const r = r0 + Math.random() * (r1 - r0);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        // keep boulevards clear
        const clear = [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 - 2.094]
          .some(ba => Math.abs(((a - ba + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.34);
        const dd = distToDistrict(x, z);
        if (clear || dd < 38) { k--; i--; continue; }
        let h = hMin + Math.random() * (hMax - hMin);
        h = Math.min(h, (dd - 30) * 2.2);               // height falls off near streets
        if (h < hMin * 0.65) { k--; i--; continue; }
        const w = wMin + Math.random() * (wMax - wMin);
        const gy = heightAt(x, z);
        P.set(x, gy + h / 2 - 0.4, z);
        Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
        S.set(w, h, w * (0.7 + Math.random() * 0.6));
        M.compose(P, Q, S);
        inst.setMatrixAt(i, M);
        inst.setColorAt(i, this.regionTint(col.setHex(colors[(Math.random() * colors.length) | 0]), x, z, 0.28));
        if (r < 90) this.colliders.push({ minX: x - w * 0.7, maxX: x + w * 0.7, minZ: z - w * 0.7, maxZ: z + w * 0.7 });
      }
    };
    place(88, 175, 150, 24, 78, 8, 17);    // skyscraper downtown between districts
    inst.count = i;                        // only render what found a legal spot
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.scene.add(inst);
  }

  buildSuburbs() {
    // cozy hillside suburb: little houses (body + pitched roof) on gentle slopes
    const n = 130;
    const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
    // pitched roof: unit prism from a squashed 3-sided cylinder
    const roofGeo = new THREE.CylinderGeometry(0.72, 0.72, 1, 3, 1);
    roofGeo.rotateX(Math.PI / 2);
    roofGeo.rotateY(Math.PI / 2);
    const bodies = new THREE.InstancedMesh(bodyGeo, toonMat(0xffffff), n);
    const roofs = new THREE.InstancedMesh(roofGeo, toonMat(0xffffff), n);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    const col = new THREE.Color();
    const wallCols = [0xf2e3c4, 0xe8d5b0, 0xd9c9a8, 0xf0d9c0, 0xe3c9a3];
    const roofCols = [0xc96f4a, 0xa2707f, 0x8a5a3a, 0xb8452f, 0x7c6f64];
    let placed = 0, guard = 0;
    while (placed < n && guard++ < 4000) {
      const a = Math.random() * Math.PI * 2;
      const r = 150 + Math.random() * 130;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (hillFactor(x, z) < 0.35) continue;               // suburbs live on the hills
      // reject steep sites (house would float/bury)
      const h0 = heightAt(x, z);
      const spread = Math.max(
        Math.abs(heightAt(x + 5, z) - h0), Math.abs(heightAt(x - 5, z) - h0),
        Math.abs(heightAt(x, z + 5) - h0), Math.abs(heightAt(x, z - 5) - h0));
      if (spread > 2.2) continue;
      const w = 5 + Math.random() * 3.5;
      const d = 4.5 + Math.random() * 3;
      const hh = 3 + Math.random() * 1.6;
      const yaw = Math.random() * Math.PI;
      P.set(x, h0 + hh / 2 - 0.25, z);
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      S.set(w, hh, d);
      M.compose(P, Q, S);
      bodies.setMatrixAt(placed, M);
      bodies.setColorAt(placed, this.regionTint(col.setHex(wallCols[(Math.random() * wallCols.length) | 0]), x, z, 0.20));
      P.y = h0 + hh - 0.25 + hh * 0.28;
      S.set(w * 1.12, hh * 0.62, d * 1.12);
      M.compose(P, Q, S);
      roofs.setMatrixAt(placed, M);
      roofs.setColorAt(placed, col.setHex(roofCols[(Math.random() * roofCols.length) | 0]));
      placed++;
    }
    bodies.count = roofs.count = placed;
    bodies.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    bodies.castShadow = roofs.castShadow = true;
    bodies.receiveShadow = true;
    this.scene.add(bodies, roofs);
  }

  buildTrees() {
    const n = 220;
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.6, 6);
    const canopyGeo = new THREE.IcosahedronGeometry(1.15, 1);
    const trunks = new THREE.InstancedMesh(trunkGeo, toonMat(0x8a5a3a), n);
    const canopies = new THREE.InstancedMesh(canopyGeo, addWindSway(toonMat(0xffffff), 0.09), n);
    const M = new THREE.Matrix4(), col = new THREE.Color();
    const greens = [0x7ba05b, 0x93a35e, 0x6b8f4e, 0xa3b06a];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 24 + Math.random() * 230;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const clear = r < 90 && [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 - 2.094]
        .some(ba => Math.abs(((a - ba + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.5);
      if (clear) { i--; continue; }
      const gy = heightAt(x, z);
      const s = 0.8 + Math.random() * 0.9;
      M.makeScale(s, s, s).setPosition(x, gy + 0.8 * s, z);
      trunks.setMatrixAt(i, M);
      M.makeScale(s, s * (0.9 + Math.random() * 0.35), s).setPosition(x, gy + (1.6 + 0.9) * s, z);
      canopies.setMatrixAt(i, M);
      canopies.setColorAt(i, col.setHex(greens[(Math.random() * greens.length) | 0]));
    }
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    trunks.castShadow = canopies.castShadow = true;
    canopies.receiveShadow = true;
    this.scene.add(trunks, canopies);
  }

  update(t, dt, playerPos) {
    for (const a of this.animated) a.userData.update?.(t);
    // NPCs: skeletal mixers advance; unrigged ones get idle bob + gestures
    for (const n of this.npcs) {
      if (n.mixer) n.mixer.update(dt);
      else {
        let y = Math.sin(t * 1.4 + n.phase) * 0.03;
        if (n.gesture) {
          const g = n.gesture; g.t += dt;
          const fade = Math.max(0, 1 - g.t / 0.9);
          if (g.name === 'agree' || g.name === 'ThumbsUp') {
            n.model.rotation.x = Math.sin(g.t * 11) * 0.16 * fade;          // nod
            y += Math.sin(Math.min(g.t * 7, Math.PI)) * 0.22;               // happy hop
          } else if (g.name === 'headShake' || g.name === 'No') {
            n.model.rotation.y = Math.sin(g.t * 13) * 0.28 * fade;          // shake
          } else {                                                           // Wave/greet
            y += Math.sin(Math.min(g.t * 6, Math.PI)) * 0.18;
            n.model.rotation.z = Math.sin(g.t * 9) * 0.08 * fade;
          }
          if (g.t > 0.9) { n.gesture = null; n.model.rotation.set(0, 0, 0); }
        }
        n.model.position.y = y;
      }
      // quest marker: gentle bob; "!" also pulses to catch the eye
      if (n.marker) {
        n.marker.position.y = n.markerY + Math.sin(t * 2.1 + n.phase) * 0.07;
        const pulse = n.done ? 1 : 1 + 0.1 * Math.sin(t * 3.4 + n.phase);
        n.marker.scale.set(0.6 * pulse, 0.8 * pulse, 1);
      }
      const dx = playerPos.x - n.obj.position.x, dz = playerPos.z - n.obj.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 36) {
        const target = Math.atan2(dx, dz);
        let diff = target - n.obj.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        n.obj.rotation.y += diff * Math.min(1, dt * 3);
      }
    }
  }

  nearestNPC(playerPos, maxDist = 2.6) {
    let best = null, bestD = maxDist * maxDist;
    for (const n of this.npcs) {
      const dx = playerPos.x - n.obj.position.x, dz = playerPos.z - n.obj.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = n; }
    }
    return best;
  }
}
