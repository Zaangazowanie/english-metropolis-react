// Central Station hub: ground/roads, Meshy GLB placements, instanced skyline,
// trees, NPCs with exercises, colliders. Zones stream in later milestones.
import * as THREE from 'three';
import { makeGLTFLoader } from './loaders.js';
import { PALETTE, toonMat, neonMat, toonifyGLB, blobShadow, makeDustMotes, makeClouds, addWindSway, addDuskWindows } from './materials.js';
import { makeTerrain, heightAt, hillFactor } from './terrain.js';
import { instanceRig } from './rig.js';
import { attachMarker } from './markers.js';
import { buildMediaFacades } from './media.js';
import { BOULEVARD } from './transit-layout.js';
import { CityLife } from './city-life.js';

const MODELS = 'public/assets/models/';
const STREET_CHROME = new THREE.MeshStandardMaterial({ color: 0xaabbd2, metalness: 0.84, roughness: 0.24 });
function chromeMatForStreet() { return STREET_CHROME; }

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
  constructor(scene, loadingManager, { lowPower = false } = {}) {
    this.scene = scene;
    this.loader = makeGLTFLoader(loadingManager);
    this.lowPower = lowPower;
    this.colliders = [];
    this.npcs = [];       // { obj, name, role, greeting, exercise, done, baseY }
    this.animated = [];   // objects with userData.update(t)
  }

  async build() {
    this.buildGroundAndRoads();
    this.buildArtDecoHub();
    this.media = buildMediaFacades(this.scene, this.animated, HUB_TOWERS, { lowPower: this.lowPower });
    this.buildPlazaLife();
    this.cityLife = new CityLife(this.scene, { lowPower: this.lowPower });
    for (const object of this.cityLife.colliderObjects) this.addAABBCollider(object, 0.12);
    this.buildBoulevardDetail();
    this.buildStreetTrees();
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

  addAABBCollider(obj, pad = 0.15, source = obj.name || 'world-object') {
    const box = new THREE.Box3().setFromObject(obj);
    this.colliders.push({
      minX: box.min.x - pad, maxX: box.max.x + pad,
      minZ: box.min.z - pad, maxZ: box.max.z + pad,
      source,
    });
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
        source: n.name,
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
    const innerPlaza = new THREE.Mesh(new THREE.CircleGeometry(6.1, 32), toonMat(0x273754));
    innerPlaza.rotation.x = -Math.PI / 2;
    innerPlaza.position.y = 0.026;
    this.scene.add(innerPlaza);
    const inlayMat = [neonMat(PALETTE.coral, 0.7), neonMat(PALETTE.cyan, 0.7), neonMat(0xffb84d, 0.7)];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 5.3), inlayMat[i % inlayMat.length]);
      inlay.position.set(Math.sin(angle) * 9.4, 0.04, Math.cos(angle) * 9.4);
      inlay.rotation.y = angle;
      this.scene.add(inlay);
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
    const laneDividerX = (BOULEVARD.carLanes[0] + BOULEVARD.carLanes[1]) / 2;
    for (const L of lines) {
      const g = new THREE.Group();
      g.name = 'protected-transit-boulevard';
      const road = new THREE.Mesh(new THREE.PlaneGeometry(9, BOULEVARD.length), roadMat);
      road.rotation.x = -Math.PI / 2; road.position.set(0, 0.015, BOULEVARD.midZ);
      g.add(road);
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(2.4, BOULEVARD.length), walkMat);
        walk.rotation.x = -Math.PI / 2; walk.position.set(side * 5.7, 0.018, BOULEVARD.midZ);
        g.add(walk);
        const curb = new THREE.Mesh(new THREE.PlaneGeometry(0.5, BOULEVARD.length),
          toonMat(L.curb));
        curb.rotation.x = -Math.PI / 2; curb.position.set(side * 7.05, 0.02, BOULEVARD.midZ);
        g.add(curb);
      }
      // Dashed centerline separates two car lanes; the tram reservation begins
      // at the solid line farther right and never shares this carriageway.
      const nDash = 40;
      const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.35, 3.4), dashMat, nDash);
      const DM = new THREE.Matrix4();
      const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
      for (let d = 0; d < nDash; d++) {
        DM.copy(rot).setPosition(laneDividerX, 0.019, -32 - d * 9.3);
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

      const stopBar = new THREE.Mesh(new THREE.PlaneGeometry(6.1, 0.36), dashMat);
      stopBar.rotation.x = -Math.PI / 2;
      stopBar.position.set(-1.36, 0.024, -28.2);
      g.add(stopBar);

      const arrows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.025, 1.35), dashMat, 6);
      const arrowDummy = new THREE.Object3D();
      let arrowIndex = 0;
      for (const [lane, heading] of [[BOULEVARD.carLanes[0], -1], [BOULEVARD.carLanes[1], 1]]) {
        arrowDummy.position.set(lane, 0.035, -42);
        arrowDummy.rotation.set(0, 0, 0);
        arrowDummy.updateMatrix();
        arrows.setMatrixAt(arrowIndex++, arrowDummy.matrix);
        for (const side of [-1, 1]) {
          arrowDummy.position.set(lane + side * 0.38, 0.035, -42 + heading * 0.9);
          arrowDummy.rotation.set(0, side * heading * 0.58, 0);
          arrowDummy.updateMatrix();
          arrows.setMatrixAt(arrowIndex++, arrowDummy.matrix);
        }
      }
      arrows.instanceMatrix.needsUpdate = true;
      g.add(arrows);
      g.rotation.y = L.angle - Math.PI / 2;
      this.scene.add(g);
    }
  }

  buildArtDecoHub() {
    const sites = HUB_TOWERS;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.54 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xaebed6, metalness: 0.86, roughness: 0.2 });
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMat, sites.length * 2);
    const balconies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), chromeMat, sites.length * 4);
    const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), neonMat(PALETTE.pink), sites.length * 2);
    const crowns = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10), chromeMat, sites.length);
    const tierWindowCount = (width, depth, yStart, yEnd) => {
      const frontCols = Math.max(3, Math.floor((width - 1.2) / 1.65));
      const sideCols = Math.max(2, Math.floor((depth - 1.2) / 1.7));
      let floors = 0;
      for (let y = yStart; y < yEnd; y += 2.05) floors++;
      return floors * (frontCols + sideCols * 2);
    };
    const windowCapacity = sites.reduce((total, site) => {
      const lowerH = site.h * 0.58;
      return total
        + tierWindowCount(site.w, site.d, 1.65, lowerH - 0.7)
        + tierWindowCount(site.w * 0.72, site.d * 0.74, lowerH + 1.05, site.h - 0.45);
    }, 0);
    const cyanWindows = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1), neonMat(PALETTE.cyan, 0.92), windowCapacity,
    );
    const pinkWindows = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1), neonMat(PALETTE.pink, 0.9), windowCapacity,
    );
    const dummy = new THREE.Object3D();
    const point = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    let blockI = 0, balconyI = 0, finI = 0, crownI = 0, cyanI = 0, pinkI = 0;
    const place = (mesh, index, site, lx, ly, lz, sx, sy, sz, extraYaw = 0) => {
      point.set(lx, ly, lz).applyAxisAngle(yAxis, site.yaw);
      dummy.position.set(site.x + point.x, point.y, site.z + point.z);
      dummy.rotation.set(0, site.yaw + extraYaw, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    };
    const addWindow = (site, lx, ly, lz, sx, sy, extraYaw, pink) => {
      if (pink) place(pinkWindows, pinkI++, site, lx, ly, lz, sx, sy, 0.08, extraYaw);
      else place(cyanWindows, cyanI++, site, lx, ly, lz, sx, sy, 0.08, extraYaw);
    };

    sites.forEach((site, siteIndex) => {
      const lowerH = site.h * 0.58;
      const upperH = site.h - lowerH;
      const upperW = site.w * 0.72;
      const upperD = site.d * 0.74;
      place(blocks, blockI, site, 0, lowerH / 2, 0, site.w, lowerH, site.d);
      blocks.setColorAt(blockI++, new THREE.Color(site.color));
      place(blocks, blockI, site, 0, lowerH + upperH / 2, 0, upperW, upperH, upperD);
      blocks.setColorAt(blockI++, new THREE.Color(site.color).offsetHSL(0.02, 0.03, 0.07));

      for (let band = 0; band < 4; band++) {
        const y = 2.9 + band * ((site.h - 4.4) / 4);
        const tier = y > lowerH ? 0.78 : 1.03;
        place(balconies, balconyI++, site, 0, y, 0, site.w * tier, 0.13, site.d * tier);
      }
      place(fins, finI++, site, 0, site.h * 0.56, site.d * 0.505, 0.18, site.h * 0.72, 0.1);
      place(fins, finI++, site, 0, 2.55, site.d * 0.54, site.w * 0.48, 0.22, 0.12);
      place(crowns, crownI++, site, 0, site.h + 0.72, 0, site.w * 0.22, 1.44, site.d * 0.22);

      const addTierWindows = (tierW, tierD, yStart, yEnd) => {
        const frontCols = Math.max(3, Math.floor((tierW - 1.2) / 1.65));
        const sideCols = Math.max(2, Math.floor((tierD - 1.2) / 1.7));
        let floor = 0;
        for (let y = yStart; y < yEnd; y += 2.05, floor++) {
          for (let col = 0; col < frontCols; col++) {
            const x = (col - (frontCols - 1) / 2) * 1.62;
            addWindow(site, x, y, tierD / 2 + 0.055, 0.9, 1.05, 0, (siteIndex + floor + col) % 5 === 0);
          }
          for (const side of [-1, 1]) {
            for (let col = 0; col < sideCols; col++) {
              const z = (col - (sideCols - 1) / 2) * 1.65;
              addWindow(site, side * (tierW / 2 + 0.055), y, z, 0.9, 1.05,
                side > 0 ? Math.PI / 2 : -Math.PI / 2, (siteIndex + floor + col + 2) % 6 === 0);
            }
          }
        }
      };
      addTierWindows(site.w, site.d, 1.65, lowerH - 0.7);
      addTierWindows(upperW, upperD, lowerH + 1.05, site.h - 0.45);
      const cos = Math.abs(Math.cos(site.yaw));
      const sin = Math.abs(Math.sin(site.yaw));
      const halfX = (site.w * cos + site.d * sin) / 2 + 0.35;
      const halfZ = (site.w * sin + site.d * cos) / 2 + 0.35;
      this.colliders.push({
        minX: site.x - halfX, maxX: site.x + halfX,
        minZ: site.z - halfZ, maxZ: site.z + halfZ,
        source: `hub-tower-${siteIndex + 1}`,
      });
    });

    blocks.count = blockI;
    balconies.count = balconyI;
    fins.count = finI;
    crowns.count = crownI;
    cyanWindows.count = cyanI;
    pinkWindows.count = pinkI;
    for (const mesh of [blocks, balconies, fins, crowns, cyanWindows, pinkWindows]) mesh.instanceMatrix.needsUpdate = true;
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
    blocks.castShadow = blocks.receiveShadow = true;
    balconies.castShadow = true;
    this.scene.add(blocks, balconies, fins, crowns, cyanWindows, pinkWindows);
  }

  buildPlazaLife() {
    const poolMat = new THREE.MeshStandardMaterial({
      color: 0x0b4d68, emissive: 0x062944, emissiveIntensity: 0.72,
      metalness: 0.72, roughness: 0.16, transparent: true, opacity: 0.88, depthWrite: false,
    });
    for (const [x, z, color] of [[-11.5, 12.5, PALETTE.cyan], [11.5, 12.5, PALETTE.pink]]) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(4.2, 32), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.055, z);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.08, 8, 48), neonMat(color));
      edge.rotation.x = Math.PI / 2;
      edge.position.set(x, 0.09, z);
      this.scene.add(pool, edge);
    }

    const palms = 12;
    const planterGeo = new THREE.CylinderGeometry(0.82, 0.96, 0.56, 10);
    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.22, 1, 8);
    const crownGeo = new THREE.SphereGeometry(0.42, 8, 6);
    const leafGeo = new THREE.ConeGeometry(0.18, 2.7, 3);
    const planters = new THREE.InstancedMesh(planterGeo, toonMat(0xffffff), palms);
    const trunks = new THREE.InstancedMesh(trunkGeo, toonMat(0x7d4f48), palms);
    const crowns = new THREE.InstancedMesh(crownGeo, toonMat(0x1f8a78), palms);
    const leaves = new THREE.InstancedMesh(leafGeo, addWindSway(toonMat(0x36b89a), 0.06), palms * 7);
    const dummy = new THREE.Object3D();
    let leafI = 0;
    for (let i = 0; i < palms; i++) {
      const angle = (i / palms) * Math.PI * 2 + 0.13;
      const radius = i % 2 ? 18.4 : 17.4;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      dummy.position.set(x, 0.3, z); dummy.rotation.set(0, angle, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      planters.setMatrixAt(i, dummy.matrix);
      planters.setColorAt(i, new THREE.Color(i % 2 ? PALETTE.coral : PALETTE.cyan));
      const height = 3.4 + (i % 3) * 0.28;
      dummy.position.set(x, 0.58 + height / 2, z); dummy.scale.set(1, height, 1); dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 0.58 + height, z); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      for (let leaf = 0; leaf < 7; leaf++) {
        const yaw = angle + (leaf / 7) * Math.PI * 2;
        dummy.position.set(x + Math.sin(yaw) * 0.92, 0.58 + height + 0.02, z + Math.cos(yaw) * 0.92);
        dummy.rotation.set(Math.PI / 2 + 0.24, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        leaves.setMatrixAt(leafI++, dummy.matrix);
      }
    }
    for (const mesh of [planters, trunks, crowns, leaves]) mesh.instanceMatrix.needsUpdate = true;
    if (planters.instanceColor) planters.instanceColor.needsUpdate = true;
    trunks.castShadow = crowns.castShadow = leaves.castShadow = true;

    const benchCount = 8;
    const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.16, 0.62), chromeMatForStreet(), benchCount);
    const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.78, 0.12), toonMat(0x263b58), benchCount);
    for (let i = 0; i < benchCount; i++) {
      const angle = (i / benchCount) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(angle) * 11.2, z = Math.sin(angle) * 11.2;
      dummy.position.set(x, 0.66, z); dummy.rotation.set(0, -angle, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x - Math.cos(angle) * 0.28, 1.02, z - Math.sin(angle) * 0.28); dummy.updateMatrix();
      backs.setMatrixAt(i, dummy.matrix);
    }
    seats.instanceMatrix.needsUpdate = backs.instanceMatrix.needsUpdate = true;
    seats.castShadow = backs.castShadow = true;
    this.scene.add(planters, trunks, crowns, leaves, seats, backs);
  }

  buildBoulevardDetail() {
    const lines = [
      { key: 'isles', angle: Math.PI / 2, color: PALETTE.cyan },
      { key: 'liberty', angle: Math.PI / 2 + (2 * Math.PI) / 3, color: PALETTE.dustyBlue },
      { key: 'sunward', angle: Math.PI / 2 - (2 * Math.PI) / 3, color: PALETTE.coral },
    ];
    const bedMat = toonMat(0x202940);
    const sleeperMat = toonMat(0x3e4960);
    const railMat = chromeMatForStreet();
    const poleMat = toonMat(0x16223a);
    const emergencyMat = new THREE.MeshStandardMaterial({
      color: 0xff405f, emissive: 0x8a102d, emissiveIntensity: 1.6,
      metalness: 0.46, roughness: 0.3,
    });
    const signalMat = toonMat(0x0b1220);
    const glass = new THREE.MeshStandardMaterial({
      color: 0x5bc8e8, emissive: 0x173d66, emissiveIntensity: 0.7,
      metalness: 0.68, roughness: 0.18, transparent: true, opacity: 0.72, depthWrite: false,
    });
    for (const line of lines) {
      const g = new THREE.Group();
      g.name = `${line.key}-track-infrastructure`;

      const trackBed = new THREE.Mesh(new THREE.PlaneGeometry(2.72, BOULEVARD.length), bedMat);
      trackBed.name = `${line.key}-reserved-track-bed`;
      trackBed.rotation.x = -Math.PI / 2;
      trackBed.position.set(BOULEVARD.tramLaneX, 0.036, BOULEVARD.midZ);
      trackBed.receiveShadow = true;
      g.add(trackBed);

      for (const edgeX of [BOULEVARD.reservationInnerX, 4.43]) {
        const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.14, BOULEVARD.length), neonMat(line.color, 0.9));
        ribbon.rotation.x = -Math.PI / 2;
        ribbon.position.set(edgeX, 0.048, BOULEVARD.midZ);
        g.add(ribbon);
      }

      const railGeometry = new THREE.BoxGeometry(0.085, 0.075, BOULEVARD.length);
      const rails = new THREE.InstancedMesh(railGeometry, railMat, 2);
      rails.name = `${line.key}-steel-rails`;
      const railDummy = new THREE.Object3D();
      for (const [index, side] of [-1, 1].entries()) {
        railDummy.position.set(
          BOULEVARD.tramLaneX + side * BOULEVARD.railHalfGauge,
          0.09,
          BOULEVARD.midZ,
        );
        railDummy.updateMatrix();
        rails.setMatrixAt(index, railDummy.matrix);
      }
      rails.instanceMatrix.needsUpdate = true;
      g.add(rails);

      const sleeperSpacing = 3;
      const sleeperCount = Math.floor(BOULEVARD.length / sleeperSpacing) + 1;
      const sleepers = new THREE.InstancedMesh(
        new THREE.BoxGeometry(2.52, 0.055, 0.2), sleeperMat, sleeperCount,
      );
      sleepers.name = `${line.key}-sleepers`;
      const sleeperDummy = new THREE.Object3D();
      for (let index = 0; index < sleeperCount; index++) {
        sleeperDummy.position.set(BOULEVARD.tramLaneX, 0.06, -BOULEVARD.startD - index * sleeperSpacing);
        sleeperDummy.updateMatrix();
        sleepers.setMatrixAt(index, sleeperDummy.matrix);
      }
      sleepers.instanceMatrix.needsUpdate = true;
      g.add(sleepers);

      // Rubberized panels keep the pedestrian crossing obvious without hiding rails.
      const crossingPanels = new THREE.InstancedMesh(
        new THREE.BoxGeometry(2.42, 0.055, 0.62), toonMat(0x737f92), 3,
      );
      for (let index = 0; index < 3; index++) {
        sleeperDummy.position.set(BOULEVARD.tramLaneX, 0.065, -23.8 - index * 0.72);
        sleeperDummy.updateMatrix();
        crossingPanels.setMatrixAt(index, sleeperDummy.matrix);
      }
      crossingPanels.instanceMatrix.needsUpdate = true;
      g.add(crossingPanels);

      const wire = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, BOULEVARD.length), railMat);
      wire.position.set(BOULEVARD.tramLaneX, 4.55, BOULEVARD.midZ);
      g.add(wire);

      const catenaryCount = 12;
      const catenaryPoles = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.07, 0.1, 4.65, 7), poleMat, catenaryCount,
      );
      const catenaryArms = new THREE.InstancedMesh(
        new THREE.BoxGeometry(3.55, 0.07, 0.07), railMat, catenaryCount,
      );
      for (let index = 0; index < catenaryCount; index++) {
        const z = -34 - index * 32;
        railDummy.position.set(6.78, 2.32, z);
        railDummy.updateMatrix();
        catenaryPoles.setMatrixAt(index, railDummy.matrix);
        railDummy.position.set(5.04, 4.52, z);
        railDummy.updateMatrix();
        catenaryArms.setMatrixAt(index, railDummy.matrix);
      }
      catenaryPoles.instanceMatrix.needsUpdate = true;
      catenaryArms.instanceMatrix.needsUpdate = true;
      g.add(catenaryPoles, catenaryArms);

      const lampCount = 36;
      const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.08, 3.6, 7), poleMat, lampCount);
      const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.13, 0.18), neonMat(line.color), lampCount);
      const dummy = new THREE.Object3D();
      let index = 0;
      for (let n = 0; n < lampCount / 2; n++) {
        const d = 23 + n * 18;
        for (const side of [-1, 1]) {
          dummy.position.set(side * 7.7, 1.8, -d); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          poles.setMatrixAt(index, dummy.matrix);
          dummy.position.set(side * 7.45, 3.58, -d); dummy.updateMatrix();
          heads.setMatrixAt(index, dummy.matrix);
          index++;
        }
      }
      poles.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
      poles.castShadow = true;
      g.add(poles, heads);

      const platform = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 28), toonMat(0x69758b));
      platform.name = `${line.key}-boarding-platform`;
      platform.position.set(5.7, 0.08, -27.5);
      platform.receiveShadow = true;
      g.add(platform);
      const boardingEdge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 27.2), neonMat(line.color));
      boardingEdge.position.set(4.64, 0.19, -27.5);
      g.add(boardingEdge);

      const canopyRoof = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.16, 9.5), glass);
      canopyRoof.position.set(5.78, 3.42, -21.5);
      g.add(canopyRoof);
      const columns = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.08, 0.11, 3.35, 8), railMat, 4,
      );
      let columnIndex = 0;
      for (const x of [5.05, 6.5]) for (const z of [-25.4, -17.7]) {
        railDummy.position.set(x, 1.7, z);
        railDummy.updateMatrix();
        columns.setMatrixAt(columnIndex++, railDummy.matrix);
      }
      columns.instanceMatrix.needsUpdate = true;
      g.add(columns);

      const bufferBar = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.14, 0.18), railMat);
      bufferBar.position.set(BOULEVARD.tramLaneX, 0.52, -14.35);
      g.add(bufferBar);
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), railMat);
        post.position.set(BOULEVARD.tramLaneX + side * 0.92, 0.45, -14.35);
        post.rotation.x = side * 0.28;
        g.add(post);
      }

      // Passenger emergency stop/call cabinet: deliberately bright and repeated
      // at every line so it reads as infrastructure, not decoration.
      const emergency = new THREE.Group();
      emergency.name = `${line.key}-emergency-stop`;
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.05, 0.28), emergencyMat);
      cabinet.position.y = 1.02;
      const callButton = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), neonMat(0xffffff));
      callButton.position.set(0, 1.12, -0.17);
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 8), neonMat(0xff405f));
      beacon.position.y = 1.64;
      const emergencyPost = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.25, 7), railMat);
      emergencyPost.position.y = 0.62;
      emergency.add(emergencyPost, cabinet, callButton, beacon);
      emergency.position.set(6.52, 0, -31.5);
      g.add(emergency);

      // Compact red/amber/green signals stop road traffic at the platform throat.
      const signal = new THREE.Group();
      signal.name = `${line.key}-road-signal`;
      const signalPole = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.09, 3.2, 7), poleMat);
      signalPole.position.y = 1.6;
      const signalHead = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.18, 0.34), signalMat);
      signalHead.position.set(0, 3.02, 0);
      signal.add(signalPole, signalHead);
      for (const [index, color] of [0xff405f, 0xffb84d, 0x43e6aa].entries()) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), neonMat(color, index === 0 ? 1.2 : 0.34));
        lamp.position.set(0, 3.34 - index * 0.32, -0.19);
        signal.add(lamp);
      }
      signal.position.set(-4.05, 0, -28.6);
      g.add(signal);

      g.rotation.y = line.angle - Math.PI / 2;
      this.scene.add(g);
    }
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

  buildStreetTrees() {
    const lines = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 - (2 * Math.PI) / 3];
    const slots = [];
    for (let d = 41; d <= 377; d += 42) {
      for (const angle of lines) for (const side of [-1, 1]) slots.push({ d, angle, side });
    }
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.11, 0.18, 2.3, 7), toonMat(0x7b5548), slots.length,
    );
    const canopies = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.82, 1), addWindSway(toonMat(0xffffff), 0.055), slots.length,
    );
    const grates = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.72, 0.72, 0.055, 12), toonMat(0x26344a), slots.length,
    );
    const uplights = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.07, 8), neonMat(PALETTE.coral, 0.82), slots.length,
    );
    const dummy = new THREE.Object3D();
    const local = new THREE.Vector3();
    const axis = new THREE.Vector3(0, 1, 0);
    const colors = [0x2b8d78, 0x3ca883, 0x26756f, 0x4c9978];
    slots.forEach((slot, index) => {
      local.set(slot.side * 8.25, 0, -slot.d).applyAxisAngle(axis, slot.angle - Math.PI / 2);
      dummy.position.set(local.x, 1.18, local.z);
      dummy.rotation.set(0, slot.angle + (index % 5) * 0.12, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);
      dummy.position.y = 2.75;
      dummy.scale.set(1.15 + (index % 3) * 0.08, 1 + (index % 4) * 0.06, 1.15);
      dummy.updateMatrix();
      canopies.setMatrixAt(index, dummy.matrix);
      canopies.setColorAt(index, new THREE.Color(colors[index % colors.length]));
      dummy.position.set(local.x, 0.045, local.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      grates.setMatrixAt(index, dummy.matrix);
      dummy.position.set(local.x + slot.side * 0.62, 0.075, local.z);
      dummy.updateMatrix();
      uplights.setMatrixAt(index, dummy.matrix);
    });
    for (const mesh of [trunks, canopies, grates, uplights]) mesh.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    trunks.castShadow = canopies.castShadow = true;
    canopies.receiveShadow = true;
    this.scene.add(trunks, canopies, grates, uplights);
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
    const wallCols = [0x435c78, 0x526b82, 0x60547e, 0x3d6877, 0x56627a];
    const roofCols = [0xff5f7e, 0x7e68c9, 0x24445c, 0x31bca5, 0x27334f];
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
    const n = this.lowPower ? 90 : 160;
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.6, 6);
    const canopyGeo = new THREE.IcosahedronGeometry(1.15, 1);
    const trunks = new THREE.InstancedMesh(trunkGeo, toonMat(0x8a5a3a), n);
    const canopies = new THREE.InstancedMesh(canopyGeo, addWindSway(toonMat(0xffffff), 0.09), n);
    const M = new THREE.Matrix4(), col = new THREE.Color();
    const greens = [0x1e7b6d, 0x2d927c, 0x1f6e66, 0x36a486];
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
    this.cityLife?.update(t, dt);
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
