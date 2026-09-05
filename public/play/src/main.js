// English Metropolis — bootstrap. Plain ES modules, no build step.
// Fixed-timestep simulation decoupled from rendering; rigged hero with real
// skeletal animation; golden-hour toon lighting with cascaded shadows and a
// time-of-day controller (daylight.js) that can swing to the neon night.
import * as THREE from 'three';
import { makeGLTFLoader } from './loaders.js';
import { makeSky, toonifyGLB, uTime, wrapToonHook, adoptToonMaterials, setBlobShadowsVisible } from './materials.js';
import { Daylight } from './daylight.js';
import { loadMixamoHero } from './hero.js';
import { Trains } from './train.js';
import { Traffic } from './traffic.js';
import { Citizens } from './citizens.js';
import { Minimap } from './minimap.js';
import { World } from './world.js';
import { ZoneManager } from './zones.js';
import { Player, FollowCamera } from './player.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { AudioManager } from './audio.js';
import { VoiceManager } from './voice.js';
import { Quality } from './quality.js';
import { PostFX } from './postfx.js';
import { Crowd } from './crowd.js';
import { Chatter } from './chatter.js';
import { heightAt } from './terrain.js';

const app = document.getElementById('app');
const ui = new UI();
const audio = new AudioManager();
ui.audio = audio;
ui.voice = new VoiceManager();   // Kokoro NPC voices + faster-whisper answers

// ---------- quality budget (decided BEFORE the renderer exists) ----------
// The tier owns every "is this a weak device" decision: the context's
// antialias flag, shadow sizes, post stack, crowd/traffic/citizen counts and
// the world detail that used to hang off navigator flags. lowPowerHint and
// compactTouch survive only as derived aliases for the systems that still
// take them as constructor options.
let crowd = null;
const quality = new Quality({
  onChange: (s, tier, reason) => {
    applyQuality(s);
    console.info(`[EM] quality → ${tier} (${reason})`);
    ui.setQualityTier(tier, quality.manual);
  },
  onScale: () => applySize(),
});
const compactTouch = quality.mobile;
const lowPowerHint = quality.index <= 1;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({
  // Post tiers resolve their own edges (FXAA, or MSAA inside the scene target);
  // only a tier that draws straight to the canvas wants a multisampled backbuffer.
  antialias: quality.s.aa === 'msaa' && !quality.s.postfx,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
// enabled from the very first compile — flipping it later never recompiled the
// materials, which is why "high" shipped without a single cast shadow
renderer.shadowMap.enabled = quality.s.shadows > 0;
renderer.shadowMap.type = THREE.PCFShadowMap;      // 5-tap Vogel disc, radius per tier
const nativePixelRatio = Math.max(1, window.devicePixelRatio || 1);
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xffd0b0, 0.0052);   // colour is re-sampled from the sky horizon

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 3, 14);

// ---------- screen-space finish ----------
const postfx = new PostFX(renderer, scene, camera);

function applyQuality(s) {
  daylight.applyTier(s);
  // real shadow maps on: every blob contact shadow steps aside (one shared material)
  setBlobShadowsVisible(s.shadows === 0);
  daylight.setFogBase(s.fog);
  camera.far = s.far;
  camera.updateProjectionMatrix();
  MAX_PR = Math.min(nativePixelRatio, s.pixelRatio);
  postfx.configure(s);
  daylight.apply();                                 // emissive gain depends on postfx
  applySize();
  crowd?.setCapacity(s.crowd);
  if (crowd && crowd.material.userData.rim !== s.rimLight) {
    crowd.setRimLight(s.rimLight);
    wrapToonHook(crowd.material, { rim: 0.8 });    // the rebuilt material rejoins the shared look
  }
  traffic?.setDensity(s.traffic);
  zoneMgr.quality = s;
  zoneMgr.vertexAO = s.vertexAO;
  world.setDetail?.(s);
}
let MAX_PR = 2;

// ---------- lighting: warm key sun + cool sky fill, driven by daylight.js ----------
const hemi = new THREE.HemisphereLight(0xb9ceff, 0x9a6a52, 0.38);
scene.add(hemi);
// Two suns, one direction: the near cascade is sharp around the player, the
// far one (intensity 0, shadow only) covers the rest of the district. The toon
// hook picks one map per fragment by view depth; nothing is lit twice.
const sun = new THREE.DirectionalLight(0xffdcb8, 2.0);
const sunFar = new THREE.DirectionalLight(0xffdcb8, 0);
sun.castShadow = quality.s.shadows > 0;
sun.shadow.mapSize.set(quality.s.shadows || 1024, quality.s.shadows || 1024);
sunFar.shadow.mapSize.set(2048, 2048);
sunFar.castShadow = false;
scene.add(sun, sun.target);
const sky = makeSky();
scene.add(sky);
const daylight = new Daylight({ scene, renderer, camera, sun, sunFar, hemi, sky, postfx });
daylight.applyTier(quality.s);

// shadow frusta follow the player and snap to their texel grids in light
// space (daylight.js) so edges do not crawl as you walk
function updateSun(playerPos) { daylight.updateSun(playerPos, camera); }

// N flips golden hour ↔ night; the HUD button next to the graphics picker does the same
const dayNightBtn = document.getElementById('daynight');
const refreshDayNight = () => {
  if (!dayNightBtn) return;
  dayNightBtn.textContent = daylight.isNight ? '☀️' : '🌙';
  dayNightBtn.title = daylight.isNight ? 'Switch to golden hour (N)' : 'Switch to night (N)';
  dayNightBtn.setAttribute('aria-label', dayNightBtn.title);
};
daylight.onChange = refreshDayNight;
refreshDayNight();
dayNightBtn?.addEventListener('click', () => { daylight.toggle(); dayNightBtn.blur(); });
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyN' || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  daylight.toggle();
});

// ---------- load ----------
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => ui.setProgress(loaded / Math.max(total, 1));

crowd = new Crowd(scene, { capacity: 360, rimLight: quality.s.rimLight });
crowd.setCapacity(quality.s.crowd);
// the crowd shader keeps its own gait/palette hook; the shared toon core
// (tinted ramp, cloud shadows, height fog, sky rim) layers on top of it
wrapToonHook(crowd.material, { rim: 0.8 });
if (crowd.shadowTex) { crowd.shadowTex.colorSpace = THREE.SRGBColorSpace; crowd.shadowTex.needsUpdate = true; }
// Locals talk in their own district's English — the phrasebook is the reason
// walking two stops down a line sounds different.
const chatter = new Chatter(scene, { pool: 6 });
fetch('src/gamedata/chatter.json')
  .then((r) => r.json())
  .then((lines) => chatter.setLines(lines))
  .catch((err) => console.warn('[EM] chatter unavailable:', err));
const world = new World(scene, manager, { lowPower: lowPowerHint, crowd });
const zoneMgr = new ZoneManager(scene, { lowPower: lowPowerHint, compactTouch, quality: quality.s });
zoneMgr.setCrowd(crowd);
zoneMgr.setRenderer(renderer, camera);   // lets the first streamed district pre-warm the shaders
const heroLoader = makeGLTFLoader(manager);

// zone-entry HUD title card + the objective chip beneath it
const zoneCard = document.getElementById('zone-card');
// Overhear → Talk → Drill → Stamp for the circuit the player stands in, or
// for the local's own district while a dialog is open (the first stop's
// shopfront walk used to read as the hub).
const refreshObjective = (code = null) => {
  ui.renderObjective(zoneMgr, code || (zoneMgr.current ? zoneMgr.current.data.code : 'hub'));
};
// when a dialog closes, circuits that closed a round hand out fresh exercises
ui.onDialogClose = () => { zoneMgr.flushRefresh(); refreshObjective(); };
zoneMgr.onEnter = (z) => {
  const lineEl = zoneCard.querySelector('.line');
  const nameEl = zoneCard.querySelector('.name');
  if (z) {
    lineEl.textContent = `${z.line.label} · ${z.data.dialect.toUpperCase()}`;
    nameEl.textContent = z.data.zoneName;
  } else {
    lineEl.textContent = 'CENTRAL HUB';
    nameEl.textContent = 'Metropolis Central';
  }
  zoneCard.classList.remove('flash');
  void zoneCard.offsetWidth;          // restart CSS animation
  zoneCard.classList.add('flash');
  refreshObjective();
  if (z) { audio.play('ping', { rate: 1.9, volume: 0.22 }); setTimeout(() => audio.play('ping', { rate: 2.4, volume: 0.16 }), 140); }
};

let player = null;
let trains = null, traffic = null, citizens = null;
const pedestrianBuffer = [];
const collisionPeople = [];
const minimap = new Minimap(document.getElementById('minimap'));
ui.minimap = minimap;
document.getElementById('minimap').addEventListener('click', () => {
  if (player) input.pressMap();
});
const followCam = new FollowCamera(camera);
const input = new Input(renderer.domElement);
let started = false;

// touch HUD buttons
for (const [id, fn] of [['tb-jump', 'pressJump'], ['tb-talk', 'pressInteract'],
  ['tb-metro', 'pressMetro'], ['tb-map', 'pressMap'], ['tb-journal', 'pressJournal']]) {
  document.getElementById(id).addEventListener('click', () => input[fn]());
}

// Detailed cast meshes are authored and action-baked in Blender. PRON-3000 is
// an open-book installation, so it intentionally remains a static landmark.
const NPC_ASSETS = [
  { key: 'npc_tutor_conductor', url: 'npc_tutor_conductor_rigged.glb' },
  { key: 'npc_phrase_vendor', url: 'npc_phrase_vendor_rigged.glb' },
  { key: 'npc_bookshop_owner', url: 'npc_bookshop_owner_rigged.glb' },
  { key: 'npc_lost_tourist', url: 'npc_lost_tourist_rigged.glb' },
  { key: 'npc_commuter_rival', url: 'npc_commuter_rival_rigged.glb' },
  { key: 'npc_station_announcer', url: 'npc_station_announcer_rigged.glb' },
  { key: 'npc_ticket_inspector', url: 'npc_ticket_inspector_rigged.glb' },
  { key: 'npc_pronunciation_robot', url: 'npc_pronunciation_robot.glb' },
];
const NPC_HEIGHTS = { npc_pronunciation_robot: 1.9 };

function normalizeModel(root, targetH) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = targetH / Math.max(size.y, 0.001);
  root.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(root);
  const c = new THREE.Vector3(); box2.getCenter(c);
  root.position.set(-c.x, -box2.min.y, -c.z);
  return root;
}

zoneMgr.bindWorld(world);
world.setZones(zoneMgr);
Promise.all([
  zoneMgr.init().then(() => world.build()),   // regions must exist before tinting
  ...NPC_ASSETS.map((asset) => new Promise((res, rej) =>
    heroLoader.load('public/assets/models/' + asset.url, res, undefined, rej))),
]).then(async ([, ...npcGltfs]) => {
  // Preserve each Blender hierarchy: SkeletonUtils clones the armature, mesh,
  // skin and authored actions together for teachers and unique pedestrians.
  const npcBases = npcGltfs.map((g, i) => {
    const { key } = NPC_ASSETS[i];
    const model = toonifyGLB(
      key === 'npc_pronunciation_robot'
        ? normalizeModel(g.scene, NPC_HEIGHTS[key])
        : g.scene,
    );
    // PRON-3000 is a large open-book installation with a small character built
    // into it, not a humanoid body. Keep it anchored in the hub instead of
    // forcing the whole installation through the pedestrian auto-rig.
    if (key === 'npc_pronunciation_robot') {
      return { key, rigged: false, staticModel: model };
    }
    let skinned = null;
    model.traverse((o) => { if (!skinned && o.isSkinnedMesh) skinned = o; });
    const clips = Object.fromEntries(g.animations.map((clip) => [clip.name, clip]));
    const authored = skinned && clips.idle && clips.walk && clips.Wave;
    if (!authored) {
      console.warn(`[EM] authored NPC rig unavailable for ${key}; using static model`);
      return { key, rigged: false, staticModel: model };
    }
    return { key, rigged: true, object: model, mesh: skinned, clips, authored: true };
  });
  zoneMgr.setNPCBases(npcBases.filter((base) => base.rigged));
  world.setNPCBases(npcBases);
  world.placeHubNPCs();
  // hub teachers join the quest system as the 'hub' circuit
  zoneMgr.bindHub(world.npcs.filter((n) => n.zoneCode === 'hub'));
  refreshObjective();

  // Wren with Mixamo mocap rig (real idle/walk/run on an auto-rigged skeleton).
  const rig = await loadMixamoHero(heroLoader);
  player = new Player(rig.object, scene, rig);
  window.__RIG = rig;   // live hand-tuning handle
  // every toon material built outside materials.js (hero, terrain, GLB
  // conversions done elsewhere) joins the shared look before the first compile
  adoptToonMaterials(scene);

  // The city lives: trams on every line and the seven humanoid Meshy townsfolk
  // strolling the boulevards — each body at most once, so no character twins
  trains = new Trains(scene, zoneMgr, audio);
  traffic = new Traffic(scene, { lowPower: lowPowerHint });
  citizens = new Citizens(scene, rig, npcBases, world.colliders);
  citizens.spawn(lowPowerHint ? 5 : 7);                // unique bodies at both quality tiers
  window.__EM = { player, world, zones: zoneMgr, camera: followCam, renderer, scene, camera3: camera, ui, audio, trains, traffic, citizens, daylight };
  // deterministic frame pump for headless verification (background tabs throttle rAF)
  window.__EM.rideTo = rideTo;
  window.__EM.step = (n = 1, dt = 1 / 60) => {
    uTime.value += n * dt;
    for (let i = 0; i < n; i++) { simTick(dt); daylight.update(dt, camera); }
    followCam.update(n * dt, player, { dx: 0, dy: 0, wheel: 0, looking: false }, world.colliders, conversationPartner());
    minimap.update(0.25, player, zoneMgr, world, trains);   // force a redraw
    postfx.setFocus(overlayOpen());
    postfx.render(uTime.value, n * dt);
  };
  // Players on odd hardware get the final say; picking a tier stops the
  // adaptive controller from arguing with them.
  const gfxSelect = document.getElementById('gfx-select');
  if (gfxSelect) {
    gfxSelect.value = quality.manual || '';
    gfxSelect.addEventListener('change', () => quality.setManual(gfxSelect.value || null));
  }
  ui.setQualityTier(quality.tier, quality.manual);
  window.__EM.quality = quality;
  window.__EM.postfx = postfx;
  window.__EM.crowd = crowd;
  applyQuality(quality.s);
  window.__EM.minimap = minimap;
  ui.setProgress(1);
  ui.showBegin(() => {
    started = true;
    audio.start();
    // first visit: the warm paged tour; afterwards H opens the reference guide
    if (!ui.showWelcome()) ui.showGuide(true, { auto: true });
  });
}).catch((err) => {
  console.error('[EM] load failed:', err);
  document.querySelector('#loading .sub').textContent = 'Load error — check console.';
});

// ---------- resize + dynamic resolution ----------
function applySize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  const pr = MAX_PR * quality.renderScale;
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight, pr);
}
window.addEventListener('resize', applySize);

// any panel over the world: the composite pulls focus and saturation
const overlayOpen = () => !!(ui.dialogOpen || ui.guideOpen || ui.welcomeOpen || ui.journalOpen || ui.metroOpen || ui.mapOpen);
// the local Wren is talking to, for the conversation two-shot
const conversationPartner = () => {
  if (!ui.dialogOpen || !player) return null;
  return world.nearestNPC(player.pos, 4.5) || crowd?.nearestSpeaker(player.pos, 4.5) || null;
};

// ---------- simulation (fixed step) / rendering (rAF) split ----------
const SIM_DT = 1 / 60;
let accumulator = 0;
let fpsCount = 0, fpsTime = 0;
let baseFov = 55;

function simTick(dt) {
  if (!player) return;
  collisionPeople.length = 0;
  collisionPeople.push(player.pos);
  if (citizens?.list) collisionPeople.push(...citizens.list);
  if (world.npcs) collisionPeople.push(...world.npcs);
  if (!ui.blocked) {
    player.update(dt, input, -followCam.yaw, world.colliders, collisionPeople);
  }
  world.update(performance.now() / 1000, dt, player.pos);
  zoneMgr.update(player.pos, world.colliders);
  collisionPeople.length = 0;
  collisionPeople.push(player.pos);
  if (citizens?.list) collisionPeople.push(...citizens.list);
  if (world.npcs) collisionPeople.push(...world.npcs);
  citizens?.update(dt, player.pos, world.colliders, collisionPeople);
  // The instanced crowd steps around the player itself rather than joining the
  // pairwise collision lists — that is what keeps hundreds of walkers free.
  crowd?.update(dt, player.pos, heightAt);
  pedestrianBuffer.length = 0;
  if (citizens?.list) pedestrianBuffer.push(...citizens.list);
  trains?.update(dt, player.pos, pedestrianBuffer, world.npcs);
  traffic?.update(dt, player.pos);
  updateSun(player.pos);
}

const clock = new THREE.Clock();
const RIDE_RADIUS = 24;              // covers the whole shopfront walk of a stop
const _proj = new THREE.Vector3();
// Is a world point inside the camera frustum (with a small margin)?
const inFrame = (x, y, z, margin = 0.92) => {
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  _proj.set(x, y, z).project(camera);
  return _proj.z < 1 && Math.abs(_proj.x) < margin && Math.abs(_proj.y) < margin;
};
const canRide = () => {
  if (!player) return false;
  const p = player.pos;
  return Math.hypot(p.x, p.z) < 30 ||
    zoneMgr.zones.some((z) => Math.hypot(p.x - z.stopPos.x, p.z - z.stopPos.y) < RIDE_RADIUS);
};
const rideTo = (dest) => {
  audio.play('ping', { rate: 0.8, volume: 0.5 });
  ui.fadeTravel(() => {
    if (dest) {
      // Arrive just inside the district's sidewalk ring, facing the district
      // centre through the gap in the frontage row, with at least one ❗ local
      // in frame; the dolly's opening wide shot takes in the platform and sign. The yaw is verified by
      // projecting the locals' markers, nudging up to ±40° until one shows.
      const px = dest.perp.x * dest.side, pz = dest.perp.y * dest.side;   // stop → district
      const lx = dest.dir.x, lz = dest.dir.y;                              // along the line
      // 9.5 m in from the stop = 2 m inside the district's own sidewalk ring,
      // at the gap between the two frontage columns (local x = 0)
      const inward = 9.5, along = 0.0;
      const ax = dest.stopPos.x + px * inward + lx * along;
      const az = dest.stopPos.y + pz * inward + lz * along;
      player.pos.set(ax, 0, az);
      player.heading = Math.atan2(px, pz);
      const baseYaw = Math.atan2(-px, -pz);          // camera behind the player
      followCam.pitch = 0.22;
      followCam.dist = 5.4;
      followCam.yaw = baseYaw;
      player.vel.set(0, 0, 0);
      zoneMgr.update(player.pos, world.colliders);   // stream destination immediately
      followCam.snap();
      followCam.update(1 / 60, player, { dx: 0, dy: 0, wheel: 0, looking: false }, world.colliders);
      const locals = world.npcs.filter((n) => n.zoneCode === dest.data.code);
      const score = (yaw) => {
        followCam.yaw = yaw; followCam.snap();
        followCam.update(1 / 60, player, { dx: 0, dy: 0, wheel: 0, looking: false }, world.colliders);
        let s = 0;
        for (const n of locals) if (inFrame(n.obj.position.x, n.obj.position.y + (n.markerY || 2.3) * n.obj.scale.y, n.obj.position.z)) s += n.done ? 1 : 2;
        return s;
      };
      let bestYaw = baseYaw, best = score(baseYaw);
      for (const off of [-0.25, 0.25, -0.5, 0.5, -0.7, 0.7]) {
        if (best >= 2) break;
        const s = score(baseYaw + off);
        if (s > best) { best = s; bestYaw = baseYaw + off; }
      }
      followCam.yaw = bestYaw;
      followCam.snap();
      // establishing shot: high and wide over the district, gliding down
      // into the follow cam over ~1.8 s
      followCam.startDolly({ fromPitch: 0.55, fromDist: 14, toPitch: 0.22, toDist: 5.4, duration: 1.8, fromYaw: bestYaw + 0.45, toYaw: bestYaw });
    } else {
      player.pos.set(4.5, 0, -6);
      player.heading = Math.atan2(-3.5 - 4.5, -9 + 6);
      followCam.yaw = Math.atan2(-(-3.5 - 4.5), -(-9 + 6));  // camera behind Wren, looking at Clara
      followCam.pitch = 0.3;
      player.vel.set(0, 0, 0);
      zoneMgr.update(player.pos, world.colliders);
      followCam.snap();
    }
    audio.fanfare();
  });
};

renderer.setAnimationLoop(() => {
  const frameStart = performance.now();
  const rdt = Math.min(clock.getDelta(), 0.1);
  uTime.value = clock.elapsedTime;           // drives wind sway shaders
  const mouse = input.consume();

  if (mouse.guide) ui.showGuide(!ui.guideOpen);
  if (mouse.journal && started) ui.toggleJournal(zoneMgr);
  if (mouse.metro && started && player) {
    if (canRide()) ui.showMetro(zoneMgr, rideTo);
    else ui.toast('🚇 Find a station platform to ride the metro (T)');
  }
  if (mouse.map && started && player) {
    ui.showCityMap(zoneMgr, player.pos, (dest) => {
      if (canRide()) rideTo(dest);
      else ui.toast('🚇 Walk to a station platform first, then ride from the map');
    });
  }

  if (started && player) {
    // fixed-step simulation
    accumulator = Math.min(accumulator + rdt, 0.25);
    while (accumulator >= SIM_DT) { simTick(SIM_DT); accumulator -= SIM_DT; }

    // render-side: camera follows every frame for smoothness
    const blocked = ui.blocked;
    followCam.update(rdt, player, blocked ? { dx: 0, dy: 0, wheel: 0, looking: false } : mouse, world.colliders, conversationPartner());

    // sprint FOV kick (cinematic juice)
    const targetFov = baseFov + player.speedFrac * (input.sprint ? 8 : 3);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-rdt * 5));
      camera.updateProjectionMatrix();
    }

    minimap.update(rdt, player, zoneMgr, world, trains);
    chatter.update(rdt, crowd, player.pos, quality.s.bubbleRadius);

    // NPC interaction. Quest locals take priority; if none is in reach, a
    // passing local with a street exercise will do. The prompt is keyed on the
    // device (no phone has an E key) and the talk button pulses while a local
    // is in range. Nothing here runs while any overlay is up.
    const near = blocked ? null : world.nearestNPC(player.pos);
    const streetLocal = blocked || near ? null : crowd?.nearestSpeaker(player.pos);
    ui.setTalkReady(!!(near || streetLocal));
    if (streetLocal) {
      const sp = streetLocal.speaker;
      ui.setPrompt(sp.done
        ? ui.promptFor(`${sp.name} <span style="opacity:.65">(✓ already helped)</span>`)
        : ui.promptFor(`${sp.name}, ${sp.role} <span style="color:#ffbe72">✦ quick one</span>`));
      if (mouse.interact) {
        audio.click();
        const code = sp.zoneCode || sp.dialectCode;
        refreshObjective(code);
        ui.openStreetDialog(sp, {
          // one click decides; overheard either way, XP only when right
          onAnswer: (right) => {
            sp.done = true;
            if (right) ui.addXP(sp.exercise?.reward || 8);
            else audio.wrong?.();
            zoneMgr.recordStreetWin(code, sp.slot ?? 0);
            refreshObjective(code);
          },
        });
      }
    } else if (near) {
      ui.setPrompt(near.done
        ? ui.promptFor(`talk to ${near.name} <span style="opacity:.65">(✓ done this round)</span>`)
        : ui.promptFor(`talk to ${near.name} <span style="color:#ffbe72">${near.warmupDone ? '❓ drill' : '❗ exercises'}</span>`));
      if (mouse.interact) {
        near.playOnce?.(near.gestureGreet || 'Wave');
        audio.click();
        const code = near.zoneCode || 'hub';
        refreshObjective(code);
        ui.openDialog(near, {
          status: near.zoneCode ? zoneMgr.roundStatus(near.zoneCode) : null,
          warmupAvailable: zoneMgr.warmupAvailable(near),
          claimWarmup: () => zoneMgr.claimWarmup(near),
          onWarmup: (n, right) => {
            if (right) n.playOnce?.(n.gestureCorrect || 'ThumbsUp');
            n.warmupDone = true;
            n.refreshMarker?.();
            refreshObjective(code);
          },
          onCorrect: (n) => {
            n.playOnce?.(n.gestureCorrect || 'ThumbsUp');
            const r = zoneMgr.recordDone(n);
            if (r?.roundComplete) {
              ui.addXP(r.bonus);
              ui.toast(`🏆 Round ${r.laps} complete at ${r.zoneName} (+${r.bonus} XP) — the locals have new, harder exercises`);
              audio.fanfare();
              if (r.stamp) {
                ui.addXP(r.stampBonus);
                ui.noteStamp(code);
                const z = zoneMgr.zones.find((zz) => zz.data.code === code);
                const all = zoneMgr.zones.map((zz) => zz.data.code);
                ui.celebrate({ kind: 'stamp', zoneName: r.zoneName, dialect: z?.data.dialect, lineKey: z?.lineKey || 'liberty',
                  xp: r.stampBonus, stamps: zoneMgr.progress.stampedCount(all), stampsTotal: all.length });
              }
              if (r.certificate) { ui.addXP(r.certificateBonus); ui.celebrate({ kind: 'certificate', lineKey: r.certificate, xp: r.certificateBonus }); }
              if (r.cityComplete) { ui.addXP(r.cityBonus); ui.celebrate({ kind: 'city', xp: r.cityBonus }); }
            } else if (r && r.remaining > 0) {
              ui.toast(`✦ ${r.remaining} more local${r.remaining > 1 ? 's' : ''} to close the round here — look for the gold ❗`);
            }
            refreshObjective(code);
          },
          onFail: (n) => n.playOnce?.(n.gestureWrong),
          onWrong: (n) => n.playOnce?.(n.gestureWrong),
        });
      }
    } else if (!blocked) {
      ui.setPrompt(null);
    }
  }

  daylight.update(rdt, camera);
  postfx.setFocus(started && overlayOpen());
  postfx.render(clock.elapsedTime, rdt);

  // Headroom-based control (quality.js): the render scale answers short spikes
  // within a tier, the tier moves for sustained pressure — measured as JS busy
  // fraction and rAF interval against the display's own refresh, so vsync at
  // 60 Hz no longer reads as "no headroom" and 30 Hz no longer reads as trouble.
  const busyMs = performance.now() - frameStart;
  quality.update(rdt * 1000, busyMs);
  fpsCount++; fpsTime += rdt;
  if (fpsTime >= 0.5) { ui.setFPS(fpsCount / fpsTime, quality.renderScale); fpsCount = 0; fpsTime = 0; }
});

console.log('%c🚇 ENGLISH METROPOLIS — no-build dev', 'color:#e8a13d; font-size:14px');
