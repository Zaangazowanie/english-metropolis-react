// Central Station hub: ground/roads, Meshy GLB placements, instanced skyline,
// trees, NPCs with exercises, colliders. Zones stream in later milestones.
//
// Everything static around the hub — plaza paving, colonnade, boulevards,
// kerbs, track infrastructure, lamps, benches, planters — is authored with the
// city kit into a few vertex-coloured batches, the same way a streamed district
// is. The hub used to spend ~150 draw calls on this; it now spends about ten.
import * as THREE from 'three';
import { makeGLTFLoader } from './loaders.js';
import { PALETTE, toonMat, neonMat, toonifyGLB, blobShadow, makeDustMotes, makeClouds, addWindSway, addDuskWindows, addWetStreets } from './materials.js';
import { makeTerrain, heightAt, hillFactor } from './terrain.js';
import { instanceRig } from './rig.js';
import { attachMarker } from './markers.js';
import { buildMediaFacades } from './media.js';
import { BOULEVARD } from './transit-layout.js';
import { CityLife } from './city-life.js';
import { makeBuckets, buildBuckets, kerbRun, tactilePatch, zebra, manhole, bollard, bench, lamp, bin, planter, bikeRack, flagpole, treePit, chromeToon, glassToon, emissiveMat, CHROME, IRON, WOOD, STONE } from './kit/street.js';
import { box, cyl, sphere, cone, prism, mergeAll } from './kit/shapes.js';
import { buildFacade, toneTable } from './kit/facades.js';
import { speciesFor, treeInstances, tuftInstances, hedgeGeometry } from './kit/flora.js';
import { emitLandmark } from './kit/landmarks.js';

const MODELS = 'public/assets/models/';
// What used to be metalness 0.84 with no environment map (rendered charcoal):
// a light toon "brushed metal" reads as chrome under the stepped ramp.
const STREET_CHROME = chromeToon();
function chromeMatForStreet() { return STREET_CHROME; }

function pitchedRoofGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, -0.5, 0.5, 0, -0.5,
    -0.5, 0, 0.5, 0.5, 0, 0.5,
    -0.5, 1, 0, 0.5, 1, 0,
  ], 3));
  geometry.setIndex([
    0, 1, 5, 0, 5, 4,
    2, 4, 5, 2, 5, 3,
    0, 4, 2, 1, 3, 5,
    0, 2, 3, 0, 3, 1,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

const HUB_TOWERS = [
  { x: -46, z: -27, w: 10, d: 12, h: 22, color: 0x27436c },
  { x: 46, z: -28, w: 11, d: 10, h: 25, color: 0x3c3b72 },
  { x: -49, z: 7, w: 12, d: 10, h: 19, color: 0x2e5870 },
  { x: -19, z: 39, w: 11, d: 12, h: 24, color: 0x433b78 },
  { x: 19, z: 40, w: 12, d: 11, h: 21, color: 0x28566c },
  { x: 49, z: 7, w: 10, d: 12, h: 23, color: 0x4b3c72 },
].map((site) => ({ ...site, yaw: Math.atan2(-site.x, -site.z) }));

// --- placement table: url, target height (m), position, yaw, collider ---
const BUILDINGS = [
  { url: 'station_mass.glb',     h: 13, pos: [-21, -34], rot: 0,            name: 'Central Station' },
  { url: 'language_academy.glb', h: 11, pos: [-26, -14], rot: Math.PI / 5,  name: 'Language Academy' },
  { url: 'bookshop.glb',         h: 8,  pos: [24, -16],  rot: -Math.PI / 5, name: 'Corner Bookshop' },
  { url: 'listening_lounge.glb', h: 8,  pos: [38, 0],    rot: -Math.PI / 2.4, name: 'Listening Lounge' },
];
const PROPS = [
  { url: 'lesson_kiosk.glb',     h: 2.6, pos: [-8, -6],  rot: 0.6 },
  { url: 'vocab_bench.glb',      h: 1.0, pos: [6, 2],    rot: -1.2 },
  { url: 'vocab_bench.glb',      h: 1.0, pos: [-7, 6],   rot: 1.9 },
  { url: 'street_lamp.glb',      h: 4.2, pos: [10, -10], rot: 0 },
  { url: 'street_lamp.glb',      h: 4.2, pos: [-10, -10],rot: 0 },
  { url: 'street_lamp.glb',      h: 4.2, pos: [10, 10],  rot: 0 },
  { url: 'street_lamp.glb',      h: 4.2, pos: [-10, 10], rot: 0 },
  { url: 'wayfinding_totem.glb', h: 3.4, pos: [8, -8],   rot: 0.2 },
  { url: 'phone_booth.glb',      h: 2.8, pos: [16, -4],  rot: -0.9 },
  { url: 'station_gate.glb',     h: 3.6, pos: [0, -22],  rot: 0, collider: false },
];
// Quest NPCs are LOCALS, never staff of a language school (product rule,
// 2026-07-03): Clara is the station's conductor, not a tutor.
const NPCS = [
  {
    url: 'npc_tutor_conductor.glb', h: 1.78, pos: [-3.5, -9], rot: 0.4,
    voiceId: 'hub_clara', barkFam: 'isles',
    name: 'Conductor Clara', role: 'Station Conductor',
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

// Move every geometry in a temporary bucket set into the main one under a
// transform — how the kit's axis-aligned facade builder produces a rotated tower.
function transferBuckets(from, to, matrix) {
  for (const key of ['shell', 'paneDark', 'paneLit', 'neon', 'glass', 'cone', 'sign']) {
    for (const geo of from[key].geos) { geo.applyMatrix4(matrix); to[key].geos.push(geo); }
    from[key].geos.length = 0;
  }
}

const HUB_LINES = [
  { key: 'isles', angle: Math.PI / 2, color: PALETTE.cyan, curb: PALETTE.sage },
  { key: 'liberty', angle: Math.PI / 2 + (2 * Math.PI) / 3, color: PALETTE.dustyBlue, curb: PALETTE.dustyBlue },
  { key: 'sunward', angle: Math.PI / 2 - (2 * Math.PI) / 3, color: PALETTE.coral, curb: PALETTE.amber },
];

export class World {
  constructor(scene, loadingManager, { lowPower = false, crowd = null } = {}) {
    this.scene = scene;
    this.loader = makeGLTFLoader(loadingManager);
    this.lowPower = lowPower;
    this.crowd = crowd;
    this.colliders = [];
    this.npcs = [];       // { obj, name, role, greeting, exercise, done, baseY }
    this.animated = [];   // objects with userData.update(t)
    // hub statics: ground (wet-street capable) and furniture buckets. The
    // boulevards get their own bucket sets so each 400 m run is frustum-culled
    // on its own instead of riding along in one city-wide mesh.
    this.hubGround = makeBuckets();
    this.hubKit = makeBuckets();
    this.lineKits = HUB_LINES.map(() => ({ ground: makeBuckets(), kit: makeBuckets() }));
    this.hubGround.detail = this.hubKit.detail = !lowPower;
    for (const lk of this.lineKits) lk.ground.detail = lk.kit.detail = !lowPower;
  }

  async build() {
    this.buildGroundAndRoads();
    this.buildArtDecoHub();
    this.media = buildMediaFacades(this.scene, this.animated, HUB_TOWERS, { lowPower: this.lowPower });
    this.buildPlazaLife();
    this.cityLife = new CityLife(this.scene, { lowPower: this.lowPower, crowd: this.crowd });
    for (const object of this.cityLife.colliderObjects) this.addAABBCollider(object, 0.12);
    for (const box of this.cityLife.colliderBoxes) {
      this.addBoxCollider(box.x, box.z, box.hw, box.hd, box.source);
    }
    this.cityLife.setColliders(this.colliders);
    this.buildBoulevardDetail();
    this.buildStreetTrees();
    this.buildSkyline();
    this.buildParkland();
    this.buildSuburbs();
    this.buildTrees();
    this.finishHubBatches();
    const motes = makeDustMotes();
    this.scene.add(motes);
    this.animated.push(motes);
    const clouds = makeClouds();
    this.scene.add(clouds);
    this.animated.push(clouds);
    await Promise.all([this.placeBuildings(), this.placeProps()]);
    // hub NPCs are placed later, once the shared rigged bases are ready
  }

  // Everything the hub builders pushed into the two bucket sets becomes ~10
  // meshes here. The ground batch carries the wet-street shader; its strength
  // is a uniform so the quality tier can switch it without a rebuild.
  finishHubBatches() {
    this._wetUniforms = [];
    const ground = (B, name) => {
      for (const m of buildBuckets(B, { name })) {
        if (m.name === `${name}-shell`) {
          addWetStreets(m.material, { strength: 0.75 });
          const inner = m.material.onBeforeCompile;
          m.material.onBeforeCompile = (shader, renderer) => { inner(shader, renderer); this._wetUniforms.push(shader.uniforms.uWet); if (this._wetWanted !== undefined) shader.uniforms.uWet.value = this._wetWanted; };
          m.castShadow = false;
        }
        this.scene.add(m);
      }
    };
    ground(this.hubGround, 'hub-ground');
    for (const m of buildBuckets(this.hubKit, { name: 'hub-kit', litEmissive: new THREE.Color(0xffc98a) })) this.scene.add(m);
    this.lineKits.forEach((lk, i) => {
      ground(lk.ground, `${HUB_LINES[i].key}-ground`);
      for (const m of buildBuckets(lk.kit, { name: `${HUB_LINES[i].key}-kit`, litEmissive: new THREE.Color(0xffc98a) })) this.scene.add(m);
    });
  }

  setNPCBases(bases) {
    this.npcBases = bases;
    this._baseByKey = new Map(bases.map((b) => [b.key, b]));
  }

  setZones(zoneMgr) { this.zoneMgr = zoneMgr; }

  // Quality tier moved: the hub keeps a share of the crowd budget, the streamed
  // districts get the rest as they build.
  setDetail(s) {
    this.cityLife?.setDensity(Math.round(s.crowd * 0.42));
    this._wetWanted = s.wetStreets ? 0.75 : 0;
    for (const u of this._wetUniforms || []) u.value = this._wetWanted;
    if (this.tufts) this.tufts.visible = !!s.detailProps;
  }

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

  addAABBCollider(obj, pad = 0.15, source = obj.name || 'world-object') {
    const box = new THREE.Box3().setFromObject(obj);
    this.colliders.push({
      minX: box.min.x - pad, maxX: box.max.x + pad,
      minZ: box.min.z - pad, maxZ: box.max.z + pad,
      source,
    });
  }

  addBoxCollider(x, z, halfX, halfZ, source = 'world-object') {
    this.colliders.push({
      minX: x - halfX, maxX: x + halfX,
      minZ: z - halfZ, maxZ: z + halfZ,
      source,
    });
  }

  addRotatedBoxCollider(x, z, halfX, halfZ, yaw, source = 'world-object') {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const extentX = Math.abs(cos) * halfX + Math.abs(sin) * halfZ;
    const extentZ = Math.abs(sin) * halfX + Math.abs(cos) * halfZ;
    this.addBoxCollider(x, z, extentX, extentZ, source);
  }

  addLocalRotatedCollider(localX, localZ, halfX, halfZ, yaw, source) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const x = localX * cos + localZ * sin;
    const z = -localX * sin + localZ * cos;
    this.addRotatedBoxCollider(x, z, halfX, halfZ, yaw, source);
  }

  async placeBuildings() {
    await Promise.all(BUILDINGS.map(async (b) => {
      const m = toonifyGLB(normalizeToHeight(await this.loadGLB(b.url), b.h));
      const g = new THREE.Group();
      g.name = b.name;
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
      g.name = p.url.replace('.glb', '');
      g.add(m);
      g.position.set(p.pos[0], 0, p.pos[1]);
      g.rotation.y = p.rot;
      this.scene.add(g);
      if (p.collider !== false) this.addAABBCollider(g, 0.05);
    }
  }

  placeHubNPCs() {
    NPCS.forEach((n, i) => {
      const key = n.url.replace('.glb', '');
      const base = this._baseByKey?.get(key);
      const g = new THREE.Group();
      g.position.set(n.pos[0], 0, n.pos[1]);
      g.rotation.y = n.rot;
      const blob = blobShadow(0.55);
      blob.userData.disposeWithNpc = true;
      g.add(blob);

      // hub teachers form their own quest circuit ('hub'); baseGrammar keeps
      // the authored concept so laps can rotate from it
      const entry = { obj: g, ...n, done: false, phase: Math.random() * 6,
        zoneCode: 'hub', npcIdx: i, baseGrammar: n.grammar,
        gestureCorrect: n.gestureCorrect || 'agree',
        gestureWrong: n.gestureWrong || 'headShake',
        gestureGreet: n.gestureGreet || 'Wave' };

      if (base?.rigged) {
        const inst = instanceRig(base.object || base.mesh, base.clips);
        inst.mesh.material = inst.mesh.material.clone();     // per-NPC so the range fade can touch it
        g.add(inst.object);
        entry.model = inst.mesh;
        entry.mixer = inst.mixer;
        entry.playOnce = inst.playGesture;
      } else if (base) {
        const m = base.staticModel.clone(true);
        m.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
        g.add(m);
        entry.model = m;
        entry.playOnce = (name) => { entry.gesture = { name, t: 0 }; };
      } else {
        return;
      }
      entry.fadeMats = [];
      g.traverse((o) => { if (o.isMesh && o.material && o !== blob) entry.fadeMats.push(o.material); });
      attachMarker(entry, n.h + 0.55);
      this.scene.add(g);
      this.npcs.push(entry);
      this.colliders.push({
        minX: n.pos[0] - 0.4, maxX: n.pos[0] + 0.4,
        minZ: n.pos[1] - 0.4, maxZ: n.pos[1] + 0.4,
        source: n.name,
      });
    });
  }

  buildGroundAndRoads() {
    // rolling-hills terrain (flat along hub/corridors/districts)
    this.scene.add(makeTerrain());
    const G = this.hubGround, K = this.hubKit;

    // ---- plaza: a grand station forecourt. Concentric rings of paving slabs
    // (per-slab tint) over a grout disc, a darker inner medallion with the
    // three line colours inlaid, a terracotta rim and a real kerb at the edge.
    const paveA = new THREE.Color(PALETTE.plaza), paveB = new THREE.Color(0x46536d);
    G.shell.add(new THREE.CircleGeometry(21.4, 48).rotateX(-Math.PI / 2).translate(0, 0.02, 0), paveA.clone().multiplyScalar(0.7));
    const c = new THREE.Color();
    for (let r = 6.2; r < 20.0; r += 1.4) {
      const segs = Math.max(16, Math.round(r * 2.6));
      const step = (Math.PI * 2) / segs;
      for (let sgi = 0; sgi < segs; sgi++) {
        const a0 = sgi * step + 0.012, a1 = (sgi + 1) * step - 0.012;
        const h = 0.5 + 0.5 * Math.sin(sgi * 12.9898 + r * 78.233);
        c.copy(paveA).lerp(paveB, h * 0.9);
        if (Math.round((r - 6.2) / 1.4) % 3 === 2) c.lerp(new THREE.Color(PALETTE.curb), 0.35);   // every third ring a lighter band
        G.shell.add(new THREE.RingGeometry(r + 0.03, r + 1.37, 2, 1, a0, a1 - a0).rotateX(-Math.PI / 2).translate(0, 0.03, 0), c);
      }
    }
    // every layer sits >= 8 mm above the one under it (graphics-25)
    G.shell.add(new THREE.RingGeometry(19.9, 21.2, 48).rotateX(-Math.PI / 2).translate(0, 0.041, 0), PALETTE.terracotta);
    G.shell.add(new THREE.CircleGeometry(6.1, 32).rotateX(-Math.PI / 2).translate(0, 0.03, 0), 0x273754);
    G.shell.add(new THREE.RingGeometry(5.9, 6.25, 32).rotateX(-Math.PI / 2).translate(0, 0.042, 0), PALETTE.curb);
    const inlay = [PALETTE.coral, PALETTE.cyan, 0xffb84d];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const g = new THREE.BoxGeometry(0.13, 0.025, 5.3);
      g.rotateY(angle);
      g.translate(Math.sin(angle) * 9.4, 0.045, Math.cos(angle) * 9.4);
      G.neon.add(g, inlay[i % inlay.length]);
    }
    // plaza kerb: a 48-gon of chamfered stones with drops at the three exits
    const exits = HUB_LINES.map((L) => -L.angle);
    for (let i = 0; i < 48; i++) {
      const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      if (exits.some((e) => Math.abs(Math.atan2(Math.sin(mid - e), Math.cos(mid - e))) < 0.24)) continue;
      kerbRun(G, Math.cos(a0) * 21.35, Math.sin(a0) * 21.35, Math.cos(a1) * 21.35, Math.sin(a1) * 21.35, { color: PALETTE.curb, y: 0.02 });
    }

    // ---- three metro boulevards radiating at 120°: asphalt with lane wear,
    // sidewalks in pavers, chamfered kerbs in the line colour, dashes, arrows,
    // zebra + stop bar at the plaza mouth. One batch for all three.
    const roadColor = new THREE.Color(PALETTE.road);
    const walkColor = new THREE.Color(PALETTE.sidewalk);
    const laneDividerX = (BOULEVARD.carLanes[0] + BOULEVARD.carLanes[1]) / 2;
    HUB_LINES.forEach((L, li) => {
      const G = this.lineKits[li].ground;
      const yaw = L.angle - Math.PI / 2;
      const M = new THREE.Matrix4().makeRotationY(yaw);
      const add = (bucket, geo, color) => bucket.add(geo.applyMatrix4(M), color);
      add(G.shell, new THREE.PlaneGeometry(9, BOULEVARD.length).rotateX(-Math.PI / 2).translate(0, 0.02, BOULEVARD.midZ), roadColor);
      for (const lane of BOULEVARD.carLanes) {
        add(G.shell, new THREE.PlaneGeometry(0.9, BOULEVARD.length * 0.98).rotateX(-Math.PI / 2).translate(lane, 0.029, BOULEVARD.midZ), roadColor.clone().multiplyScalar(0.84));
      }
      for (const side of [-1, 1]) {
        // sidewalk as a paver strip: slabs 1.6 m along, tinted per slab
        const nSlab = Math.floor(BOULEVARD.length / 1.6);
        for (let k = 0; k < nSlab; k++) {
          const zc = -BOULEVARD.startD - (k + 0.5) * 1.6;
          const h = 0.5 + 0.5 * Math.sin(k * 12.9898 + side * 3.1 + L.angle * 7.7);
          add(G.shell, new THREE.PlaneGeometry(2.4, 1.55).rotateX(-Math.PI / 2).translate(side * 5.7, 0.03, zc), walkColor.clone().multiplyScalar(0.92 + h * 0.16));
        }
        add(G.shell, new THREE.PlaneGeometry(2.4, BOULEVARD.length).rotateX(-Math.PI / 2).translate(side * 5.7, 0.021, BOULEVARD.midZ), walkColor.clone().multiplyScalar(0.7));
        // kerb along the carriageway edge, dropped at the plaza zebra
        const k0 = -BOULEVARD.startD - 8.5, k1 = -BOULEVARD.endD;
        kerbRun(G, ...rot(yaw, side * 4.62, k0), ...rot(yaw, side * 4.62, k1), { color: new THREE.Color(L.curb).lerp(new THREE.Color(PALETTE.curb), 0.55), y: 0.02 });
        // outer edging stone between sidewalk and the city fabric
        add(G.shell, new THREE.BoxGeometry(0.28, 0.07, BOULEVARD.length).translate(side * 7.05, 0.05, BOULEVARD.midZ), L.curb);
      }
      for (let d = 0; d < 40; d++) add(G.shell, new THREE.BoxGeometry(0.35, 0.012, 3.4).translate(laneDividerX, 0.038, -32 - d * 9.3), 0xe8dcbb);
      for (let s = 0; s < 7; s++) add(G.shell, new THREE.BoxGeometry(1.05, 0.012, 2.2).translate(-3.9 + s * 1.3, 0.03, -24.6), 0xe8dcbb);
      add(G.shell, new THREE.BoxGeometry(6.1, 0.012, 0.36).translate(-1.36, 0.03, -28.2), 0xe8dcbb);
      for (const [lane, heading] of [[BOULEVARD.carLanes[0], -1], [BOULEVARD.carLanes[1], 1]]) {
        add(G.shell, new THREE.BoxGeometry(0.16, 0.014, 1.35).translate(lane, 0.04, -42), 0xe8dcbb);
        for (const side of [-1, 1]) {
          const g = new THREE.BoxGeometry(0.16, 0.014, 1.0).rotateY(side * heading * 0.58).translate(lane + side * 0.38, 0.04, -42 + heading * 0.9);
          add(G.shell, g, 0xe8dcbb);
        }
      }
      for (const z of [-60, -150, -240, -330]) add(G.shell, cyl(0.36, 0.36, 0.012, 12, laneDividerX + 1.2, 0.038, z), 0x27303f);
      if (this.hubKit.detail) for (const side of [-1, 1]) tactilePatch(G, ...rot(yaw, side * 5.7, -23.2), yaw, { y: 0.04 });
    });
    function rot(yaw, x, z) { return [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)]; }
  }

  // The six art-deco hub towers become kit curtain-wall towers: real glass
  // bands and spandrels, mullions, setback, crown — merged into the hub buckets
  // (they were 6 InstancedMeshes with ~500 neon window instances).
  buildArtDecoHub() {
    const rng = mulberry(0xdec0);
    const tones = toneTable({
      cPrimary: new THREE.Color(0x35507a), cSecondary: new THREE.Color(0x4a3f7a), cAccent: new THREE.Color(PALETTE.pink),
      cLine: new THREE.Color(PALETTE.cyan), cRoof: new THREE.Color(0x1c2338),
    }, {}, rng);
    HUB_TOWERS.forEach((site, i) => {
      const T = { ...tones, wall: new THREE.Color(site.color), spandrel: new THREE.Color(site.color).lerp(new THREE.Color(0x0a1024), 0.35), door: tones.accent };
      const tmp = makeBuckets(T);
      tmp.detail = this.hubKit.detail;
      buildFacade(tmp, { x: 0, z: 0, w: site.w, d: site.d, frontage: false, front: null }, 'tower', rng, T, null, { litRatio: 0.45 }, { height: site.h });
      const M = new THREE.Matrix4().compose(new THREE.Vector3(site.x, 0, site.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), site.yaw), new THREE.Vector3(1, 1, 1));
      transferBuckets(tmp, this.hubKit, M);
      const cos = Math.abs(Math.cos(site.yaw)), sin = Math.abs(Math.sin(site.yaw));
      const halfX = (site.w * cos + site.d * sin) / 2 + 0.35;
      const halfZ = (site.w * sin + site.d * cos) / 2 + 0.35;
      this.colliders.push({ minX: site.x - halfX, maxX: site.x + halfX, minZ: site.z - halfZ, maxZ: site.z + halfZ, source: `hub-tower-${i + 1}` });
    });
  }

  // Plaza life: two fountains (kit landmark) where the reflecting pools were,
  // twelve kit palms in planters, a colonnade in the four free sectors with a
  // station clock, benches, planters, bins, bike racks and flagpoles.
  buildPlazaLife() {
    const K = this.hubKit;
    const rng = mulberry(0x9142);
    const stone = new THREE.Color(0xd8cfbf);
    const tones = { accent: new THREE.Color(PALETTE.coral), roof: new THREE.Color(0x3a3f52), line: new THREE.Color(PALETTE.cyan), stone };
    for (const [x, z, color] of [[-11.5, 12.5, PALETTE.cyan], [11.5, 12.5, PALETTE.pink]]) {
      emitLandmark(K, 'fountain', { ...tones, line: new THREE.Color(color) }, rng, x, z, 0);
      this.addBoxCollider(x, z, 3.92, 3.92, 'plaza-fountain');
    }

    // palms in planters on the outer ring
    const palms = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + 0.13;
      const radius = i % 2 ? 18.4 : 17.4;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      this.addBoxCollider(x, z, 0.92, 0.92, 'plaza-palm-planter');
      K.shell.add(cyl(0.82, 0.96, 0.56, 10, x, 0.3, z), i % 2 ? PALETTE.coral : PALETTE.cyan);
      K.shell.add(cyl(0.86, 0.86, 0.06, 10, x, 0.6, z), stone);
      K.shell.add(cyl(0.7, 0.7, 0.04, 10, x, 0.6, z), 0x3b2c22);
      palms.push({ x, y: 0.6, z, s: 0.95 + (i % 3) * 0.08, rot: angle, variant: i % 3 });
    }
    const palmMesh = treeInstances('palm', palms);
    this.scene.add(palmMesh);

    // colonnade segments in the sectors the boulevards and venues leave free
    const clockAt = 312;
    for (const centreDeg of [60, 120, 228, 312]) {
      const centre = THREE.MathUtils.degToRad(centreDeg);
      const r = 20.4, n = 5, spacing = 3.0;
      const arc = spacing * (n - 1) / r;
      const cols = [];
      for (let i = 0; i < n; i++) {
        const a = centre - arc / 2 + (arc / (n - 1)) * i;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        cols.push([x, z]);
        K.shell.add(cyl(0.5, 0.56, 0.5, 8, x, 0.25, z), stone.clone().multiplyScalar(0.85));
        K.shell.add(cyl(0.3, 0.34, 4.9, 12, x, 2.95, z), stone);
        K.shell.add(cyl(0.42, 0.34, 0.28, 12, x, 5.5, z), stone.clone().multiplyScalar(0.92));
        this.addBoxCollider(x, z, 0.4, 0.4, 'plaza-colonnade');
      }
      for (let i = 0; i + 1 < cols.length; i++) {
        const [ax, az] = cols[i], [bx, bz] = cols[i + 1];
        const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
        K.shell.add(box(0.7, 0.7, len + 0.7, 0, 0, 0).rotateY(yaw).translate((ax + bx) / 2, 6.0, (az + bz) / 2), stone.clone().multiplyScalar(0.95));
        K.shell.add(box(0.9, 0.16, len + 0.9, 0, 0, 0).rotateY(yaw).translate((ax + bx) / 2, 6.45, (az + bz) / 2), stone.clone().multiplyScalar(0.88));
        K.neon.add(box(0.06, 0.06, len - 0.4, 0, 0, 0).rotateY(yaw).translate((ax + bx) / 2, 5.62, (az + bz) / 2), PALETTE.cyan);
      }
      if (centreDeg === clockAt) {
        // station clock on a pylon above the middle column
        const [cx, cz] = cols[2];
        K.shell.add(box(1.6, 3.2, 1.6, cx, 8.1, cz), stone);
        K.shell.add(box(1.9, 0.3, 1.9, cx, 9.85, cz), stone.clone().multiplyScalar(0.9));
        K.shell.add(cone(1.2, 1.4, 4, cx, 10.7, cz).rotateY(Math.PI / 4).translate(0, 0, 0), 0x3a3f52);
        for (const F of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const face = cyl(0.62, 0.62, 0.05, 20, 0, 0, 0).rotateX(Math.PI / 2);
          face.rotateY(Math.atan2(F[0], F[1])).translate(cx + F[0] * 0.82, 8.3, cz + F[1] * 0.82);
          K.neon.add(face, 0xfff0c2);
          const rim = cyl(0.7, 0.7, 0.06, 20, 0, 0, 0).rotateX(Math.PI / 2);
          rim.rotateY(Math.atan2(F[0], F[1])).translate(cx + F[0] * 0.8, 8.3, cz + F[1] * 0.8);
          K.shell.add(rim, IRON);
          const hand = box(0.06, 0.5, 0.03, 0, 0.22, 0).rotateY(Math.atan2(F[0], F[1])).translate(cx + F[0] * 0.86, 8.3, cz + F[1] * 0.86);
          K.shell.add(hand, IRON);
          const hand2 = box(0.36, 0.05, 0.03, 0.15, 0, 0).rotateY(Math.atan2(F[0], F[1])).translate(cx + F[0] * 0.86, 8.3, cz + F[1] * 0.86);
          K.shell.add(hand2, IRON);
        }
        K.neon.add(sphere(0.12, cx, 11.5, cz, 6, 4), PALETTE.pink);
      }
      // planters between the columns' feet, a bench facing the plaza
      const mid = cols[2];
      const inAngle = Math.atan2(-mid[0], -mid[1]);
      bench(K, mid[0] * 0.9, mid[1] * 0.9, inAngle, { wood: WOOD, iron: IRON });
      this.addRotatedBoxCollider(mid[0] * 0.9, mid[1] * 0.9, 0.95, 0.35, inAngle, 'plaza-bench');
      for (const k of [0, 4]) {
        const [px, pz] = cols[k];
        planter(K, px * 0.93, pz * 0.93, inAngle, { w: 1.4, d: 0.6, color: 0x4a5569, hedge: 0x2f856e });
        this.addRotatedBoxCollider(px * 0.93, pz * 0.93, 0.75, 0.35, inAngle, 'plaza-planter');
      }
    }

    // benches on the inner ring (kit slats, cast-iron ends), bins beside them
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(angle) * 11.2, z = Math.sin(angle) * 11.2;
      const yaw = Math.atan2(-x, -z);                    // face the beacon
      bench(K, x, z, yaw, { wood: WOOD, iron: IRON });
      this.addRotatedBoxCollider(x, z, 1.0, 0.36, yaw, 'plaza-bench');
      if (i % 2 === 0) {
        const bx = Math.cos(angle + 0.14) * 11.8, bz = Math.sin(angle + 0.14) * 11.8;
        bin(K, bx, bz, { lid: PALETTE.coral });
        this.addBoxCollider(bx, bz, 0.3, 0.3, 'plaza-bin');
      }
    }
    // bike racks and flagpoles flank the station exit (north, -z)
    bikeRack(K, -9, -19.5, Math.PI / 2, { n: 4 });
    this.addBoxCollider(-9, -19.5, 0.5, 1.6, 'plaza-bike-rack');
    for (const [x, colour] of [[-14, PALETTE.cyan], [14, PALETTE.coral]]) {
      flagpole(K, x, -16.5, { h: 7, flag: colour });
      this.addBoxCollider(x, -16.5, 0.15, 0.15, 'plaza-flagpole');
    }
    for (const [mx, mz] of [[3, 15], [-6, -15.5], [15, -3]]) manhole(K, mx, mz, { y: 0.034 });
  }

  // Track infrastructure per line into the hub buckets: bed, rails, sleepers,
  // catenary, lamps with light cones, platform, canopy, buffer stop,
  // emergency cabinet, signal. Colliders as before.
  buildBoulevardDetail() {
    const bedColor = 0x202940, sleeper = 0x3e4960, pole = 0x16223a;
    HUB_LINES.forEach((line, li) => {
      const K = this.lineKits[li].kit, G = this.lineKits[li].ground;
      const infrastructureYaw = line.angle - Math.PI / 2;
      const M = new THREE.Matrix4().makeRotationY(infrastructureYaw);
      const add = (bucket, geo, color) => bucket.add(geo.applyMatrix4(M), color);
      const lineColor = line.color;

      add(G.shell, new THREE.PlaneGeometry(2.72, BOULEVARD.length).rotateX(-Math.PI / 2).translate(BOULEVARD.tramLaneX, 0.036, BOULEVARD.midZ), bedColor);
      for (const edgeX of [BOULEVARD.reservationInnerX, 4.43]) {
        add(G.neon, new THREE.PlaneGeometry(0.14, BOULEVARD.length).rotateX(-Math.PI / 2).translate(edgeX, 0.048, BOULEVARD.midZ), lineColor);
      }
      for (const side of [-1, 1]) {
        add(K.shell, new THREE.BoxGeometry(0.085, 0.075, BOULEVARD.length).translate(BOULEVARD.tramLaneX + side * BOULEVARD.railHalfGauge, 0.09, BOULEVARD.midZ), CHROME);
      }
      const sleeperSpacing = 3;
      const sleeperCount = Math.floor(BOULEVARD.length / sleeperSpacing) + 1;
      for (let index = 0; index < sleeperCount; index++) {
        add(G.shell, new THREE.BoxGeometry(2.52, 0.055, 0.2).translate(BOULEVARD.tramLaneX, 0.06, -BOULEVARD.startD - index * sleeperSpacing), sleeper);
      }
      for (let index = 0; index < 3; index++) {
        add(G.shell, new THREE.BoxGeometry(2.42, 0.055, 0.62).translate(BOULEVARD.tramLaneX, 0.065, -23.8 - index * 0.72), 0x737f92);
      }
      add(K.shell, new THREE.BoxGeometry(0.045, 0.045, BOULEVARD.length).translate(BOULEVARD.tramLaneX, 4.55, BOULEVARD.midZ), CHROME);
      for (let index = 0; index < 12; index++) {
        const z = -34 - index * 32;
        this.addLocalRotatedCollider(6.78, z, 0.13, 0.13, infrastructureYaw, `${line.key}-catenary-pole`);
        add(K.shell, cyl(0.07, 0.1, 4.65, 7, 6.78, 2.32, z), pole);
        add(K.shell, new THREE.BoxGeometry(3.55, 0.07, 0.07).translate(5.04, 4.52, z), CHROME);
        add(K.shell, new THREE.BoxGeometry(0.06, 0.4, 0.06).translate(3.3, 4.75, z), CHROME);
      }
      // street lamps on both sidewalks: classic kit lamp, cone on every other
      const lampCount = 13;
      for (let n = 0; n < lampCount; n++) {
        const d = 23 + n * 26;
        for (const side of [-1, 1]) {
          this.addLocalRotatedCollider(side * 7.7, -d, 0.16, 0.16, infrastructureYaw, `${line.key}-street-light`);
          const tmp = makeBuckets(); tmp.detail = K.detail;
          lamp(tmp, side * 7.7, -d, { style: 'classic', color: pole, light: 0xffd9a0, h: 4.4, cone: K.detail && n % 2 === 0 });
          transferBuckets(tmp, K, M);
        }
      }
      // boarding platform + lit edge + glass canopy on chrome columns
      add(K.shell, new THREE.BoxGeometry(2.2, 0.16, 28).translate(5.7, 0.08, -27.5), 0x69758b);
      add(K.neon, new THREE.BoxGeometry(0.16, 0.04, 27.2).translate(4.64, 0.19, -27.5), lineColor);
      add(K.glass, new THREE.BoxGeometry(2.55, 0.1, 9.5).translate(5.78, 3.42, -21.5), 0x9fd8e8);
      add(K.shell, new THREE.BoxGeometry(2.7, 0.08, 9.7).translate(5.78, 3.5, -21.5), IRON);
      add(K.neon, new THREE.BoxGeometry(2.3, 0.05, 0.05).translate(5.78, 3.36, -21.5), 0xffe0b0);
      for (const x of [5.05, 6.5]) for (const z of [-25.4, -17.7]) {
        this.addLocalRotatedCollider(x, z, 0.14, 0.14, infrastructureYaw, `${line.key}-canopy-column`);
        add(K.shell, cyl(0.08, 0.11, 3.35, 8, x, 1.7, z), CHROME);
      }
      // a bench and a bin on the platform
      { const tmp = makeBuckets(); tmp.detail = K.detail; bench(tmp, 6.3, -30.5, -Math.PI / 2, { wood: WOOD, iron: IRON }); bin(tmp, 6.4, -33.4, { lid: lineColor }); transferBuckets(tmp, K, M); }
      this.addLocalRotatedCollider(6.3, -30.5, 0.35, 0.95, infrastructureYaw, `${line.key}-platform-bench`);
      // buffer stop
      add(K.shell, new THREE.BoxGeometry(2.28, 0.14, 0.18).translate(BOULEVARD.tramLaneX, 0.52, -14.35), CHROME);
      this.addLocalRotatedCollider(BOULEVARD.tramLaneX, -14.35, 1.18, 0.2, infrastructureYaw, `${line.key}-buffer-stop`);
      for (const side of [-1, 1]) {
        add(K.shell, new THREE.BoxGeometry(0.12, 0.85, 0.12).rotateX(side * 0.28).translate(BOULEVARD.tramLaneX + side * 0.92, 0.45, -14.35), CHROME);
      }
      // Passenger emergency stop/call cabinet: deliberately bright and repeated
      // at every line so it reads as infrastructure, not decoration.
      add(K.shell, cyl(0.055, 0.07, 1.25, 7, 6.52, 0.62, -31.5), CHROME);
      add(K.shell, new THREE.BoxGeometry(0.5, 1.05, 0.28).translate(6.52, 1.02, -31.5), 0xff405f);
      add(K.neon, sphere(0.11, 6.52, 1.12, -31.67, 8, 6), 0xffffff);
      add(K.neon, cyl(0.09, 0.09, 0.16, 8, 6.52, 1.64, -31.5), 0xff405f);
      this.addLocalRotatedCollider(6.52, -31.5, 0.34, 0.26, infrastructureYaw, `${line.key}-emergency-stop`);
      // Compact red/amber/green signals stop road traffic at the platform throat.
      add(K.shell, cyl(0.065, 0.09, 3.2, 7, -4.05, 1.6, -28.6), pole);
      add(K.shell, new THREE.BoxGeometry(0.42, 1.18, 0.34).translate(-4.05, 3.02, -28.6), 0x0b1220);
      [0xff405f, 0xffb84d, 0x43e6aa].forEach((color, index) => {
        add(K.neon, sphere(0.115, -4.05, 3.34 - index * 0.32, -28.79, 8, 6), index === 0 ? color : new THREE.Color(color).multiplyScalar(0.3));
      });
      this.addLocalRotatedCollider(-4.05, -28.6, 0.17, 0.17, infrastructureYaw, `${line.key}-road-signal`);
    });
  }

  buildSkyline() {
    // Layered towers: podium, setback crown and rooftop beacon in three batches.
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = addDuskWindows(toonMat(0xffffff));
    const colors = [0x21395f, 0x2d4e70, 0x343767, 0x405d78, 0x4a3b72, 0x285967, 0x334c6c];
    const count = 240;
    const inst = new THREE.InstancedMesh(box, mat, count);
    const setbacks = new THREE.InstancedMesh(box, mat, count);
    const crowns = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), neonMat(PALETTE.pink, 0.78), count);
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
        const towerColor = this.regionTint(col.setHex(colors[(Math.random() * colors.length) | 0]), x, z, 0.28).clone();
        inst.setColorAt(i, towerColor);
        const topH = Math.max(3.4, h * (0.16 + Math.random() * 0.08));
        const topW = w * (0.5 + Math.random() * 0.2);
        P.set(x, gy + h - topH * 0.45, z);
        S.set(topW, topH, topW * (0.7 + Math.random() * 0.4));
        M.compose(P, Q, S);
        setbacks.setMatrixAt(i, M);
        setbacks.setColorAt(i, towerColor.clone().offsetHSL(0.01, 0.02, 0.06));
        P.set(x, gy + h + 1.0, z);
        S.set(Math.max(0.14, w * 0.035), 2.2, Math.max(0.14, w * 0.035));
        M.compose(P, Q, S);
        crowns.setMatrixAt(i, M);
        if (r < 90) this.colliders.push({
          minX: x - w * 0.7, maxX: x + w * 0.7,
          minZ: z - w * 0.7, maxZ: z + w * 0.7,
          source: 'skyline-tower',
        });
      }
    };
    place(88, 175, 150, 24, 78, 8, 17);    // skyscraper downtown between districts
    inst.count = setbacks.count = crowns.count = i;
    inst.instanceMatrix.needsUpdate = setbacks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    if (setbacks.instanceColor) setbacks.instanceColor.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    setbacks.castShadow = setbacks.receiveShadow = true;
    this.scene.add(inst, setbacks, crowns);
  }

  // Boulevard street trees: kit species chosen from the district each tree
  // stands beside, in tree pits, with an uplight. One InstancedMesh per species.
  buildStreetTrees() {
    const lines = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 - (2 * Math.PI) / 3];
    const local = new THREE.Vector3();
    const axis = new THREE.Vector3(0, 1, 0);
    const bySpecies = new Map();
    let index = 0;
    for (let d = 41; d <= 377; d += 42) {
      for (const [li, angle] of lines.entries()) for (const side of [-1, 1]) {
        const K = this.lineKits[li].kit;
        local.set(side * 8.25, 0, -d).applyAxisAngle(axis, angle - Math.PI / 2);
        this.addBoxCollider(local.x, local.z, 0.28, 0.28, 'boulevard-tree');
        const region = this.zoneMgr?.regionAt(local.x, local.z);
        const species = region ? speciesFor(region.data) : ['plane', 'oak'];
        const kind = species[index % species.length];
        if (!bySpecies.has(kind)) bySpecies.set(kind, []);
        bySpecies.get(kind).push({ x: local.x, z: local.z, s: 1.0 + (index % 3) * 0.1, rot: angle + (index % 5) * 0.12, variant: index % 3 });
        treePit(K, local.x, local.z, { r: 0.75, color: 0x26344a });
        K.neon.add(cyl(0.11, 0.13, 0.07, 8, local.x + side * Math.cos(angle - Math.PI / 2) * 0.62, 0.075, local.z - side * Math.sin(angle - Math.PI / 2) * 0.62), PALETTE.coral);
        index++;
      }
    }
    for (const [kind, list] of bySpecies) this.scene.add(treeInstances(kind, list));
  }

  buildParkland() {
    const K = this.hubKit;
    const sectorAngles = [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6];
    const paths = [];
    const benchSites = [];
    const lightSites = [];
    const bedSites = [];
    for (const [sectorIndex, angle] of sectorAngles.entries()) {
      const points = [];
      const segmentCount = this.lowPower ? 14 : 19;
      for (let index = 0; index <= segmentCount; index++) {
        const radius = 70 + index * 9.2;
        const bend = Math.sin(index * 0.62 + sectorIndex * 1.7) * 5.2;
        const radialX = Math.cos(angle), radialZ = Math.sin(angle);
        const sideX = -radialZ, sideZ = radialX;
        const x = radialX * radius + sideX * bend;
        const z = radialZ * radius + sideZ * bend;
        points.push(new THREE.Vector3(x, heightAt(x, z) + 0.08, z));
        if (index > 1 && index < segmentCount && index % 5 === 2) {
          lightSites.push({ point: points[index], angle, side: index % 2 ? -1 : 1 });
        }
        if (index > 3 && index < segmentCount && index % 6 === 4) {
          benchSites.push({ point: points[index], angle, side: index % 2 ? 1 : -1 });
        }
      }
      for (let index = 0; index < points.length - 1; index++) paths.push([points[index], points[index + 1]]);
      for (const [bedIndex, radius] of [112, 178].entries()) {
        const side = bedIndex ? -8.5 : 8.5;
        const x = Math.cos(angle) * radius - Math.sin(angle) * side;
        const z = Math.sin(angle) * radius + Math.cos(angle) * side;
        bedSites.push({ x, z, colorIndex: sectorIndex + bedIndex });
      }
    }
    this.parkPaths = paths;

    const pathMaterial = toonMat(0x718093);
    const pathMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pathMaterial, paths.length);
    pathMesh.name = 'terrain-following-park-promenade';
    const dummy = new THREE.Object3D();
    const direction = new THREE.Vector3();
    const localForward = new THREE.Vector3(0, 0, 1);
    paths.forEach(([from, to], index) => {
      direction.subVectors(to, from);
      const length = direction.length();
      dummy.position.copy(from).add(to).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(localForward, direction.normalize());
      dummy.scale.set(2.65, 0.08, length + 0.45);
      dummy.updateMatrix();
      pathMesh.setMatrixAt(index, dummy.matrix);
    });
    pathMesh.instanceMatrix.needsUpdate = true;
    pathMesh.receiveShadow = true;
    this.scene.add(pathMesh);

    // park furniture from the kit, terrain-following, into the hub buckets
    const tmp = makeBuckets(); tmp.detail = K.detail;
    const T = new THREE.Matrix4();
    const emit = (fn, x, z) => { fn(); T.makeTranslation(0, heightAt(x, z), 0); transferBuckets(tmp, K, T); };
    benchSites.forEach((site) => {
      const radialX = Math.cos(site.angle), radialZ = Math.sin(site.angle);
      const sideX = -radialZ, sideZ = radialX;
      const x = site.point.x + sideX * site.side * 2.35;
      const z = site.point.z + sideZ * site.side * 2.35;
      const yaw = Math.atan2(-sideX * site.side, -sideZ * site.side);
      emit(() => bench(tmp, x, z, yaw, { wood: WOOD, iron: 0x28516a }), x, z);
      this.addRotatedBoxCollider(x, z, 1.02, 0.38, yaw, 'park-bench');
    });
    lightSites.forEach((site) => {
      const sideX = -Math.sin(site.angle), sideZ = Math.cos(site.angle);
      const x = site.point.x + sideX * site.side * 2.65;
      const z = site.point.z + sideZ * site.side * 2.65;
      emit(() => lamp(tmp, x, z, { style: 'globe', color: 0x26344a, light: 0xffc77d, h: 3.2, cone: K.detail }), x, z);
      this.addBoxCollider(x, z, 0.13, 0.13, 'park-light');
    });
    const bedColors = [PALETTE.coral, PALETTE.cyan, 0xffb84d, 0xe961c2, 0x43c59e];
    bedSites.forEach((site) => {
      emit(() => {
        tmp.shell.add(cyl(1.28, 1.42, 0.42, 14, site.x, 0.21, site.z), 0x40536d);
        tmp.shell.add(cyl(1.2, 1.2, 0.06, 14, site.x, 0.44, site.z), 0x3b2c22);
        for (let flower = 0; flower < 16; flower++) {
          const a = flower * 2.399, radius = 0.28 + (flower % 4) * 0.2;
          tmp.shell.add(cyl(0.02, 0.02, 0.4, 4, site.x + Math.cos(a) * radius, 0.62, site.z + Math.sin(a) * radius), 0x2a8d69);
          tmp.shell.add(new THREE.IcosahedronGeometry(0.13, 0).scale(0.78 + (flower % 4) * 0.08, 0.78 + (flower % 4) * 0.08, 0.78 + (flower % 4) * 0.08).translate(site.x + Math.cos(a) * radius, 0.86 + (flower % 3) * 0.05, site.z + Math.sin(a) * radius), bedColors[(flower + site.colorIndex) % bedColors.length]);
        }
      }, site.x, site.z);
      this.addBoxCollider(site.x, site.z, 1.35, 1.35, 'park-flower-bed');
    });

    // grass tufts: thousands of two-quad instances over the open parkland,
    // clear of paths, roads and districts. One draw call, wind-swayed.
    const tuftCount = this.lowPower ? 1200 : 3000;
    const tufts = [];
    const rng = mulberry(0x6a55);
    let tries = 0;
    while (tufts.length < tuftCount && tries++ < tuftCount * 6) {
      const a = rng() * Math.PI * 2, r = 60 + rng() * 190;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (hillFactor(x, z) < 0.25) continue;
      if (paths.some(([p, q]) => segDist(x, z, p.x, p.z, q.x, q.z) < 1.9)) continue;
      const y = heightAt(x, z);
      tufts.push({ x, y, z, s: 0.7 + rng() * 0.9, rot: rng() * Math.PI, color: y > 9 ? 0x6f9a5a : 0x3f9c63 });
    }
    this.tufts = tuftInstances(tufts);
    if (this.tufts) { this.tufts.visible = !this.lowPower; this.scene.add(this.tufts); }
    function segDist(x, z, ax, az, bx, bz) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    }
  }

  buildSuburbs() {
    // Detailed neighbourhoods flank the three park promenades. The roof mesh
    // shares the house footprint, so no detached triangular prisms can float
    // above the terrain as the old low-detail batch did.
    const n = this.lowPower ? 56 : 88;
    const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
    const bodies = new THREE.InstancedMesh(bodyGeo, toonMat(0xffffff), n);
    const foundations = new THREE.InstancedMesh(bodyGeo, toonMat(0x4a5569), n);
    const roofs = new THREE.InstancedMesh(pitchedRoofGeometry(), toonMat(0xffffff), n);
    const trims = new THREE.InstancedMesh(bodyGeo, toonMat(0xdfe4e5), n * 2);
    const doors = new THREE.InstancedMesh(bodyGeo, toonMat(0xffffff), n);
    const windows = new THREE.InstancedMesh(
      bodyGeo,
      toonMat(0xbdebf0, { emissive: 0xffb070, emissiveIntensity: 0.9 }),
      n * 6,
    );
    windows.material.name = 'paneLit';
    const awnings = new THREE.InstancedMesh(bodyGeo, toonMat(0xffffff), n);
    const steps = new THREE.InstancedMesh(bodyGeo, toonMat(0x738094), n);
    const chimneys = new THREE.InstancedMesh(bodyGeo, toonMat(0x4b5365), n);
    const gutters = new THREE.InstancedMesh(bodyGeo, chromeMatForStreet(), n * 2);
    const hedges = new THREE.InstancedMesh(hedgeGeometry(), addWindSway(toonMat(0x2f856e), 0.035), n * 2);
    const porchLights = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.11, 8, 6), neonMat(0xffc77d, 0.82), n,
    );
    const walkways = new THREE.InstancedMesh(bodyGeo, toonMat(0x77869a), n);
    bodies.name = 'suburb-house-bodies';
    foundations.name = 'suburb-house-foundations';
    roofs.name = 'suburb-pitched-roofs';
    trims.name = 'suburb-house-trim';
    doors.name = 'suburb-house-doors';
    windows.name = 'suburb-house-windows';
    awnings.name = 'suburb-house-awnings';
    steps.name = 'suburb-house-steps';
    chimneys.name = 'suburb-house-chimneys';
    gutters.name = 'suburb-house-gutters';
    hedges.name = 'suburb-house-hedges';
    porchLights.name = 'suburb-house-porch-lights';
    walkways.name = 'suburb-house-walkways';
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3();
    const P = new THREE.Vector3();
    const Y_AXIS = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const wallCols = [0x7399a7, 0xb28198, 0x77a18c, 0x8d8fba, 0xc08e76, 0x688fa2];
    const roofCols = [0xc04f72, 0x6556a2, 0x274c5f, 0x278c7e, 0x894b64, 0x5b647d];
    const doorCols = [0xffb84d, 0x4deeea, 0xff6f91, 0xe9e2d0, 0x43c59e];
    const neighbourhoodAngles = [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6];
    const setLocal = (mesh, index, site, localX, worldY, localZ, sx, sy, sz, extraYaw = 0) => {
      const cos = Math.cos(site.yaw);
      const sin = Math.sin(site.yaw);
      P.set(
        site.x + localX * cos + localZ * sin,
        worldY,
        site.z - localX * sin + localZ * cos,
      );
      Q.setFromAxisAngle(Y_AXIS, site.yaw + extraYaw);
      S.set(sx, sy, sz);
      M.compose(P, Q, S);
      mesh.setMatrixAt(index, M);
    };
    const localWorld = (site, localX, localZ) => ({
      x: site.x + localX * Math.cos(site.yaw) + localZ * Math.sin(site.yaw),
      z: site.z - localX * Math.sin(site.yaw) + localZ * Math.cos(site.yaw),
    });

    const candidates = [];
    for (let lane = 0; lane < 18; lane++) {
      for (const [sector, pathAngle] of neighbourhoodAngles.entries()) {
        for (const side of [-1, 1]) {
          const radius = 124 + lane * 9.4 + (Math.random() - 0.5) * 1.8;
          const lateral = side * (12.8 + Math.random() * 2.4);
          candidates.push({
            sector,
            pathAngle,
            side,
            radius,
            x: Math.cos(pathAngle) * radius - Math.sin(pathAngle) * lateral,
            z: Math.sin(pathAngle) * radius + Math.cos(pathAngle) * lateral,
          });
        }
      }
    }
    const houseSites = [];
    let placed = 0;
    for (const candidate of candidates) {
      if (placed >= n) break;
      const { sector, pathAngle, radius, x, z } = candidate;
      if (hillFactor(x, z) < 0.32) continue;
      if ((this.zoneMgr?.zones || []).some((zone) => Math.hypot(x - zone.center.x, z - zone.center.y) < 45)) continue;
      const h0 = heightAt(x, z);
      const spread = Math.max(
        Math.abs(heightAt(x + 4, z) - h0), Math.abs(heightAt(x - 4, z) - h0),
        Math.abs(heightAt(x, z + 4) - h0), Math.abs(heightAt(x, z - 4) - h0),
      );
      if (spread > 1.65) continue;

      const w = 5.4 + Math.random() * 2.8;
      const d = 4.8 + Math.random() * 2.2;
      const hh = 3.2 + Math.random() * 1.15;
      const roofH = 1.2 + Math.random() * 0.58;
      const lotRadius = Math.max(w, d) * 0.58;
      if (houseSites.some((other) => Math.hypot(x - other.x, z - other.z) < lotRadius + other.radius + 0.8)) continue;
      const pathX = Math.cos(pathAngle) * radius;
      const pathZ = Math.sin(pathAngle) * radius;
      const yaw = Math.atan2(pathX - x, pathZ - z) + (Math.random() - 0.5) * 0.1;
      const site = { x, z, yaw };
      houseSites.push({ x, z, radius: lotRadius });
      const wallColor = this.regionTint(
        col.setHex(wallCols[(placed + sector) % wallCols.length]), x, z, 0.16,
      ).clone();
      const roofColor = new THREE.Color(roofCols[(placed * 3 + sector) % roofCols.length]);
      const doorColor = new THREE.Color(doorCols[(placed + 2) % doorCols.length]);
      const eaveY = h0 + hh;

      setLocal(foundations, placed, site, 0, h0 + 0.12, 0, w * 1.04, 0.62, d * 1.04);
      setLocal(bodies, placed, site, 0, h0 + hh / 2 - 0.02, 0, w, hh, d);
      bodies.setColorAt(placed, wallColor);
      setLocal(roofs, placed, site, 0, eaveY - 0.04, 0, w * 1.14, roofH, d * 1.16);
      roofs.setColorAt(placed, roofColor);
      for (const [trimIndex, trimY] of [h0 + 0.5, eaveY - 0.2].entries()) {
        setLocal(trims, placed * 2 + trimIndex, site, 0, trimY, 0, w * 1.025, 0.12, d * 1.025);
      }

      const doorX = placed % 2 ? -w * 0.2 : w * 0.2;
      setLocal(doors, placed, site, doorX, h0 + 0.9, d / 2 + 0.065, 0.88, 1.75, 0.1);
      doors.setColorAt(placed, doorColor);
      setLocal(awnings, placed, site, doorX, h0 + 2.05, d / 2 + 0.4, 1.34, 0.11, 0.78);
      awnings.setColorAt(placed, roofColor.clone().offsetHSL(0, 0, 0.08));
      setLocal(steps, placed, site, doorX, h0 + 0.08, d / 2 + 0.52, 1.12, 0.2, 0.92);
      const walkwayLength = 4.6;
      const walkwayZ = d / 2 + 1 + walkwayLength / 2;
      const walkwayWorld = localWorld(site, doorX, walkwayZ);
      setLocal(
        walkways, placed, site, doorX, heightAt(walkwayWorld.x, walkwayWorld.z) + 0.045,
        walkwayZ, 1.08, 0.07, walkwayLength,
      );
      setLocal(porchLights, placed, site, doorX + (doorX > 0 ? -0.62 : 0.62), h0 + 1.82, d / 2 + 0.14, 1, 1, 1);

      let windowIndex = placed * 6;
      const windowW = Math.min(0.92, w * 0.16);
      for (const rowY of [h0 + 1.08, h0 + 2.35]) {
        for (const windowX of [-w * 0.25, w * 0.25]) {
          setLocal(windows, windowIndex++, site, windowX, rowY, d / 2 + 0.075, windowW, 0.72, 0.09);
        }
      }
      for (const windowZ of [-d * 0.22, d * 0.22]) {
        setLocal(windows, windowIndex++, site, w / 2 + 0.075, h0 + 1.48, windowZ, 0.09, 0.78, 0.82);
      }

      setLocal(chimneys, placed, site, w * 0.27, eaveY + roofH * 0.62, -d * 0.08, 0.42, 1.18, 0.42);
      for (const [gutterIndex, gutterZ] of [-d * 0.58, d * 0.58].entries()) {
        setLocal(gutters, placed * 2 + gutterIndex, site, 0, eaveY + 0.025, gutterZ, w * 1.15, 0.075, 0.075);
      }
      for (const hedgeSide of [-1, 1]) {
        const hedgeX = hedgeSide * w * 0.34;
        const hedgeZ = d / 2 + 1.05;
        const hedgeIndex = placed * 2 + (hedgeSide > 0 ? 1 : 0);
        setLocal(hedges, hedgeIndex, site, hedgeX, h0, hedgeZ, 1.9, 1.0, 1.1);
        const hedgeWorld = localWorld(site, hedgeX, hedgeZ);
        this.addRotatedBoxCollider(hedgeWorld.x, hedgeWorld.z, 0.5, 0.3, yaw, 'suburb-hedge');
      }

      this.addRotatedBoxCollider(x, z, w / 2 + 0.2, d / 2 + 0.2, yaw, 'suburb-house');
      placed++;
    }

    const singleMeshes = [bodies, foundations, roofs, doors, awnings, steps, chimneys, porchLights, walkways];
    for (const mesh of singleMeshes) mesh.count = placed;
    trims.count = gutters.count = hedges.count = placed * 2;
    windows.count = placed * 6;
    const all = [...singleMeshes, trims, windows, gutters, hedges];
    for (const mesh of all) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = mesh === bodies || mesh === foundations || mesh === roofs;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(...all);
  }

  // Park trees: kit species mixed by sector (the three promenades run toward
  // the three lines, so the parkland borrows each line's climate).
  buildTrees() {
    const n = this.lowPower ? 90 : 160;
    const sectorSpecies = [['oak', 'plane', 'rowan'], ['pine', 'maple', 'oak'], ['palm', 'jacaranda', 'gum']];
    const bySpecies = new Map();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 24 + Math.random() * 230;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // The full boulevard and district strips are intentionally urban. Random
      // park trees belong beyond them, never inside rails, roads or facades.
      const clear = [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 - 2.094]
        .some((ba) => {
          const dirX = Math.cos(ba), dirZ = -Math.sin(ba);
          const d = x * dirX + z * dirZ;
          const lateral = x * -dirZ + z * dirX;
          return d > 12 && d < 430 && Math.abs(lateral) < 45;
        });
      if (clear) { i--; continue; }
      if (this.parkPaths?.some(([p, q]) => { const dx = q.x - p.x, dz = q.z - p.z, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / l2)); return Math.hypot(x - (p.x + dx * t), z - (p.z + dz * t)) < 2.6; })) { i--; continue; }
      const gy = heightAt(x, z);
      const s = 0.8 + Math.random() * 0.9;
      this.addBoxCollider(x, z, 0.24 * s, 0.24 * s, 'park-tree');
      // sector by angle: north → isles, south-west → liberty, south-east → sunward
      const deg = ((Math.atan2(z, x) * 180 / Math.PI) + 360) % 360;
      const sector = deg > 210 && deg < 330 ? 0 : deg >= 90 && deg <= 210 ? 1 : 2;
      const list = sectorSpecies[sector];
      const kind = list[(Math.random() * list.length) | 0];
      if (!bySpecies.has(kind)) bySpecies.set(kind, []);
      bySpecies.get(kind).push({ x, y: gy, z, s, sy: 0.9 + Math.random() * 0.3, rot: Math.random() * Math.PI * 2, variant: i % 3 });
    }
    for (const [kind, list] of bySpecies) this.scene.add(treeInstances(kind, list));
  }

  update(t, dt, playerPos) {
    for (const a of this.animated) a.userData.update?.(t);
    this.cityLife?.update(t, dt);
    // NPCs: skeletal mixers advance; unrigged ones get idle bob + gestures.
    // A skinned mixer is the most expensive thing per character in the scene, so
    // teachers in districts you can see but are not standing in stop ticking —
    // at 40m their idle breathing is not something anyone can perceive.
    // Each authored teacher is a ~25k-triangle Meshy bake, so a dozen streamed
    // districts put over a million triangles on screen for characters nobody is
    // close enough to read. Past the horizon the body CROSS-FADES out over 6 m
    // (44 → 50 m) instead of popping; the quest marker above it stays visible.
    const MIXER_RANGE = 42 * 42;
    const FADE_NEAR = 44, FADE_FAR = 50;
    for (const n of this.npcs) {
      const dx = n.obj.position.x - playerPos.x;
      const dz = n.obj.position.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      const dist = Math.sqrt(d2);
      const fade = dist <= FADE_NEAR ? 1 : dist >= FADE_FAR ? 0 : 1 - (dist - FADE_NEAR) / (FADE_FAR - FADE_NEAR);
      // a 24k-triangle body only casts a shadow while it is close enough for
      // that shadow to read; past 22 m it would double its cost for nothing
      const castNear = d2 < 22 * 22;
      if (n.model && n.castNear !== castNear) {
        n.castNear = castNear;
        n.model.traverse((o) => { if (o.isMesh && !o.userData.disposeWithNpc) o.castShadow = castNear; });
      }
      if (n.model && n.fade !== fade) {
        n.fade = fade;
        const visible = fade > 0;
        if (n.model.visible !== visible) n.model.visible = visible;
        if (n.model.parent && n.model.parent !== n.obj && n.model.parent.visible !== visible) n.model.parent.visible = visible;
        for (const m of n.fadeMats || []) {
          const mid = fade > 0 && fade < 1;
          if (m.transparent !== mid) { m.transparent = mid; m.needsUpdate = false; }
          m.opacity = fade;
        }
      }
      if (n.mixer) {
        if (d2 < MIXER_RANGE) n.mixer.update(dt);
      } else {
        let y = Math.sin(t * 1.4 + n.phase) * 0.03;
        if (n.gesture) {
          const g = n.gesture; g.t += dt;
          const fadeK = Math.max(0, 1 - g.t / 0.9);
          if (g.name === 'agree' || g.name === 'ThumbsUp') {
            n.model.rotation.x = Math.sin(g.t * 11) * 0.16 * fadeK;          // nod
            y += Math.sin(Math.min(g.t * 7, Math.PI)) * 0.22;               // happy hop
          } else if (g.name === 'headShake' || g.name === 'No') {
            n.model.rotation.y = Math.sin(g.t * 13) * 0.28 * fadeK;          // shake
          } else {                                                           // Wave/greet
            y += Math.sin(Math.min(g.t * 6, Math.PI)) * 0.18;
            n.model.rotation.z = Math.sin(g.t * 9) * 0.08 * fadeK;
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
      if (d2 < 36) {
        const target = Math.atan2(-dx, -dz);
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

// deterministic rng for the hub kit so every load builds the same forecourt
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
