// English Metropolis — bootstrap. Plain ES modules, no build step.
// Fixed-timestep simulation decoupled from rendering; rigged hero with real
// skeletal animation; cinematic Miami-after-dark lighting with true shadows.
import * as THREE from 'three';
import { makeGLTFLoader } from './loaders.js';
import { makeSky, toonifyGLB, uTime, setNeonGain } from './materials.js';
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
document.getElementById('journal-close').addEventListener('click', () => ui.toggleJournal());

// ---------- renderer ----------
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const compactTouch = window.matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 800;
const lowPowerHint = Boolean(
  connection?.saveData
  || /(^|-)2g$/.test(connection?.effectiveType || '')
  || (navigator.deviceMemory && navigator.deviceMemory <= 4)
  || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
  || compactTouch
);
const renderer = new THREE.WebGLRenderer({
  // The post stack resolves its own edges with FXAA, so a multisampled
  // backbuffer would only cost bandwidth. Weak devices skip post entirely and
  // get real MSAA instead.
  antialias: lowPowerHint || compactTouch,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = !compactTouch;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const nativePixelRatio = Math.max(1, window.devicePixelRatio || 1);
let renderScale = 1;
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x10172f, 0.0052);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 3, 14);

// ---------- quality budget + screen-space finish ----------
const postfx = new PostFX(renderer, scene, camera);
const quality = new Quality(renderer, { onChange: (s, tier, reason) => {
  applyQuality(s);
  console.info(`[EM] quality → ${tier} (${reason})`);
  ui.setQualityTier(tier, quality.manual);
} });
let crowd = null;

function applyQuality(s) {
  renderer.shadowMap.enabled = s.shadows > 0;
  sun.castShadow = s.shadows > 0;
  if (s.shadows > 0 && sun.shadow.mapSize.width !== s.shadows) {
    sun.shadow.mapSize.set(s.shadows, s.shadows);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  scene.fog.density = s.fog;
  camera.far = s.far;
  camera.updateProjectionMatrix();
  MAX_PR = Math.min(nativePixelRatio, s.pixelRatio);
  // Neon has to be authored above white for the composite's ACES pass to leave
  // it looking lit, and for the bloom threshold to find it at all.
  setNeonGain(s.postfx ? 2.15 : 1);
  postfx.configure(s);
  applySize();
  crowd?.setCapacity(s.crowd);
  crowd?.setRimLight(s.rimLight);
  traffic?.setDensity(s.traffic);
  zoneMgr.quality = s;
  zoneMgr.vertexAO = s.vertexAO;
  world.setDetail?.(s);
}
let MAX_PR = 2;

// ---------- Miami-after-dark lighting (cinematic: real shadows near the player) ----------
const hemi = new THREE.HemisphereLight(0x8fdcff, 0x28183f, 1.08);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xff9b9f, 1.52);
sun.position.set(-38, 36, -58);
// Shadow budget comes from the quality tier; applyQuality resizes the map when
// the tier moves, and the texel snap below follows whatever size is current.
sun.castShadow = quality.s.shadows > 0;
sun.shadow.mapSize.set(quality.s.shadows || 1024, quality.s.shadows || 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 170;
const S = 38;
sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x55f2e9, 0.82);
rim.position.set(42, 24, 34);
scene.add(rim);
scene.add(makeSky());

// shadow frustum follows the player so the map covers only ~76m — crisp + cheap.
// Position snaps to shadow-texel-sized steps so edges don't crawl/shimmer.
const SUN_OFF = new THREE.Vector3(-38, 36, -58).normalize().multiplyScalar(90);
function updateSun(playerPos) {
  const texel = (2 * S) / Math.max(256, sun.shadow.mapSize.width);
  const sx = Math.round(playerPos.x / texel) * texel;
  const sz = Math.round(playerPos.z / texel) * texel;
  sun.target.position.set(sx, 0, sz);
  sun.position.set(sx + SUN_OFF.x, SUN_OFF.y, sz + SUN_OFF.z);
}

// ---------- load ----------
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => ui.setProgress(loaded / Math.max(total, 1));

crowd = new Crowd(scene, { capacity: 360, rimLight: quality.s.rimLight });
crowd.setCapacity(quality.s.crowd);
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
const refreshObjective = () => {
  const code = zoneMgr.current ? zoneMgr.current.data.code : 'hub';
  const st = zoneMgr.roundStatus(code);
  ui.setObjective(st.remaining > 0
    ? `❗ Round ${st.round} — help <b>${st.remaining} more local${st.remaining > 1 ? 's' : ''}</b> here (${st.done}/${st.total})`
    : `✓ Round ${st.round} — every local here is helped, ride on!`);
};
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

  // The city lives: trams on every line and the seven humanoid Meshy townsfolk
  // strolling the boulevards — each body at most once, so no character twins
  trains = new Trains(scene, zoneMgr, audio);
  traffic = new Traffic(scene, { lowPower: lowPowerHint });
  citizens = new Citizens(scene, rig, npcBases, world.colliders);
  citizens.spawn(lowPowerHint ? 5 : 7);                // unique bodies at both quality tiers
  window.__EM = { player, world, zones: zoneMgr, camera: followCam, renderer, scene, camera3: camera, ui, audio, trains, traffic, citizens };
  // deterministic frame pump for headless verification (background tabs throttle rAF)
  window.__EM.step = (n = 1, dt = 1 / 60) => {
    uTime.value += n * dt;
    for (let i = 0; i < n; i++) simTick(dt);
    followCam.update(1 / 60, player, { dx: 0, dy: 0, wheel: 0, looking: false }, world.colliders);
    minimap.update(0.25, player, zoneMgr, world, trains);   // force a redraw
    postfx.render(uTime.value);
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
  const pr = MAX_PR * renderScale;
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight, pr);
}
window.addEventListener('resize', applySize);

// ---------- simulation (fixed step) / rendering (rAF) split ----------
const SIM_DT = 1 / 60;
let accumulator = 0;
let frameEMA = 16.7, fpsCount = 0, fpsTime = 0, scaleCooldown = 0;
let baseFov = 55;
const MIN_RENDER_SCALE = 0.62;

function simTick(dt) {
  if (!player) return;
  collisionPeople.length = 0;
  collisionPeople.push(player.pos);
  if (citizens?.list) collisionPeople.push(...citizens.list);
  if (world.npcs) collisionPeople.push(...world.npcs);
  if (!ui.dialogOpen && !ui.guideOpen) {
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
renderer.setAnimationLoop(() => {
  const rdt = Math.min(clock.getDelta(), 0.1);
  uTime.value = clock.elapsedTime;           // drives wind sway shaders
  const mouse = input.consume();

  if (mouse.guide) ui.showGuide(!ui.guideOpen);
  if (mouse.journal && started) ui.toggleJournal(zoneMgr);
  const canRide = () => {
    if (!player) return false;
    const p = player.pos;
    return Math.hypot(p.x, p.z) < 30 ||
      zoneMgr.zones.some((z) => Math.hypot(p.x - z.stopPos.x, p.z - z.stopPos.y) < 12);
  };
  const rideTo = (dest) => {
    audio.play('ping', { rate: 0.8, volume: 0.5 });
    ui.fadeTravel(() => {
      if (dest) {
        // Arrive on the broad shopfront walk, looking outward along the line.
        // The camera faces back toward the city so platform furniture never
        // sits between the spring arm and the player.
        const ax = dest.stopPos.x + (dest.center.x - dest.stopPos.x) * 0.46;
        const az = dest.stopPos.y + (dest.center.y - dest.stopPos.y) * 0.46;
        player.pos.set(ax, 0, az);
        player.heading = Math.atan2(dest.dir.x, dest.dir.y);
        followCam.yaw = Math.atan2(-dest.dir.x, -dest.dir.y);
        followCam.pitch = 0.28;
      } else {
        player.pos.set(0, 0, 8);
        player.heading = Math.PI;
        followCam.yaw = 0;
        followCam.pitch = 0.32;
      }
      player.vel.set(0, 0, 0);
      zoneMgr.update(player.pos, world.colliders);   // stream destination immediately
      followCam.snap();
      audio.fanfare();
    });
  };
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
    const blocked = ui.dialogOpen || ui.guideOpen || ui.welcomeOpen || ui.journalOpen || ui.metroOpen || ui.mapOpen;
    followCam.update(rdt, player, blocked ? { dx: 0, dy: 0, wheel: 0, looking: false } : mouse, world.colliders);

    // sprint FOV kick (cinematic juice)
    const targetFov = baseFov + player.speedFrac * (input.sprint ? 8 : 3);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-rdt * 5));
      camera.updateProjectionMatrix();
    }

    minimap.update(rdt, player, zoneMgr, world, trains);
    chatter.update(rdt, crowd, player.pos, quality.s.bubbleRadius);

    // NPC interaction. Teachers take priority; if none is in reach, a passing
    // local with a street exercise will do.
    const near = world.nearestNPC(player.pos);
    const streetLocal = near ? null : crowd?.nearestSpeaker(player.pos);
    if (streetLocal && !blocked) {
      const sp = streetLocal.speaker;
      ui.setPrompt(sp.done
        ? `Press <b>E</b> — ${sp.name} <span style="opacity:.65">(✓ already helped)</span>`
        : `Press <b>E</b> — ${sp.name}, ${sp.role} <span style="color:#ffc857">✦ quick one</span>`);
      if (mouse.interact) {
        audio.click();
        ui.openStreetDialog(sp, {
          onCorrect: () => {
            sp.done = true;
            ui.addXP(sp.exercise?.reward || 8);
            zoneMgr.recordStreetWin(sp.dialectCode);
          },
          onWrong: () => audio.wrong?.(),
        });
      }
    } else if (near && !blocked) {
      ui.setPrompt(near.done
        ? `Press <b>E</b> — talk to ${near.name} <span style="opacity:.65">(✓ done this round)</span>`
        : `Press <b>E</b> — talk to ${near.name} <span style="color:#ffb84d">❗ exercises</span>`);
      if (mouse.interact) {
        near.playOnce?.(near.gestureGreet || 'Wave');
        audio.click();
        ui.openDialog(near, {
          status: near.zoneCode ? zoneMgr.roundStatus(near.zoneCode) : null,
          warmupAvailable: zoneMgr.warmupAvailable(near),
          claimWarmup: () => zoneMgr.claimWarmup(near),
          onWarmup: (n) => n.playOnce?.(n.gestureCorrect || 'ThumbsUp'),
          onCorrect: (n) => {
            n.playOnce?.(n.gestureCorrect || 'ThumbsUp');
            const r = zoneMgr.recordDone(n);
            if (r?.roundComplete) {
              ui.addXP(r.bonus);
              ui.toast(`🏆 Round ${r.laps} complete at ${r.zoneName}! The locals there have new, harder exercises (+${r.bonus} XP)`);
              audio.fanfare();
            } else if (r && r.remaining > 0) {
              ui.toast(`✦ ${r.remaining} more local${r.remaining > 1 ? 's' : ''} to close the round here — look for the ❗`);
            }
            refreshObjective();
          },
          onWrong: (n) => n.playOnce?.(n.gestureWrong),
        });
      }
    } else if (!blocked) {
      ui.setPrompt(null);
    }
  }

  postfx.render(clock.elapsedTime);

  // Two nested controls: render scale reacts within a tier for short spikes,
  // the quality tier moves for sustained trouble.
  frameEMA = frameEMA * 0.95 + rdt * 1000 * 0.05;
  quality.update(rdt * 1000, rdt);
  scaleCooldown -= rdt;
  if (scaleCooldown <= 0) {
    if (frameEMA > 21 && renderScale > MIN_RENDER_SCALE + 0.001) {
      renderScale = Math.max(MIN_RENDER_SCALE, renderScale - 0.08);
      applySize();
      scaleCooldown = 1.5;
    } else if (frameEMA < 13.5 && renderScale < 1) {
      renderScale = Math.min(1, renderScale + 0.08);
      applySize();
      scaleCooldown = 1.5;
    }
  }
  fpsCount++; fpsTime += rdt;
  if (fpsTime >= 0.5) { ui.setFPS(fpsCount / fpsTime, renderScale); fpsCount = 0; fpsTime = 0; }
});

console.log('%c🚇 ENGLISH METROPOLIS — no-build dev', 'color:#e8a13d; font-size:14px');
