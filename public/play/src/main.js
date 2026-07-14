// English Metropolis — bootstrap. Plain ES modules, no build step.
// Fixed-timestep simulation decoupled from rendering; rigged hero with real
// skeletal animation; cinematic Miami-after-dark lighting with true shadows.
import * as THREE from 'three';
import { makeGLTFLoader } from './loaders.js';
import { makeSky, toonifyGLB, toonRamp, uTime } from './materials.js';
import { rigBase } from './rig.js';
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
  antialias: !lowPowerHint,
  powerPreference: lowPowerHint ? 'default' : 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const MAX_PR = Math.min(window.devicePixelRatio || 1, lowPowerHint ? 1 : 2);
let renderScale = lowPowerHint ? 0.85 : 1; // dynamic resolution 0.55..1
renderer.setPixelRatio(MAX_PR);
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x10172f, 0.0052);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 3, 14);

// ---------- Miami-after-dark lighting (cinematic: real shadows near the player) ----------
const hemi = new THREE.HemisphereLight(0x8fdcff, 0x28183f, 1.08);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xff9b9f, 1.52);
sun.position.set(-38, 36, -58);
sun.castShadow = true;
// Start conservatively on constrained devices; the adaptive tier can still
// shed shadows entirely if sustained frame time remains high.
const SHADOW_RES = lowPowerHint ? 1024 : (screen.width * (window.devicePixelRatio || 1)) >= 1900 ? 4096 : 2048;
sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
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
const SHADOW_TEXEL = (2 * S) / SHADOW_RES;
function updateSun(playerPos) {
  const sx = Math.round(playerPos.x / SHADOW_TEXEL) * SHADOW_TEXEL;
  const sz = Math.round(playerPos.z / SHADOW_TEXEL) * SHADOW_TEXEL;
  sun.target.position.set(sx, 0, sz);
  sun.position.set(sx + SUN_OFF.x, SUN_OFF.y, sz + SUN_OFF.z);
}

// ---------- load ----------
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => ui.setProgress(loaded / Math.max(total, 1));

const world = new World(scene, manager, { lowPower: lowPowerHint });
const zoneMgr = new ZoneManager(scene, { lowPower: lowPowerHint });
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

// Wren — Mike's Meshy hero — is the player. Unrigged, so locomotion is
// procedural (bob/sway/turn-bank) until Wren gets a proper rig (Mixamo pass).
const NPC_BASE_URLS = [
  'npc_tutor_conductor.glb', 'npc_phrase_vendor.glb', 'npc_bookshop_owner.glb',
  'npc_lost_tourist.glb', 'npc_commuter_rival.glb', 'npc_station_announcer.glb',
  'npc_ticket_inspector.glb', 'npc_pronunciation_robot.glb',
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
  ...NPC_BASE_URLS.map((u) => new Promise((res, rej) =>
    heroLoader.load('public/assets/models/' + u, res, undefined, rej))),
]).then(async ([, ...npcGltfs]) => {
  // NPC bases: normalized + toon-shaded Meshy characters, then code-rigged so
  // they idle/gesture with a real skeleton. Bad segmentation → static fallback.
  const npcBases = npcGltfs.map((g, i) => {
    const key = NPC_BASE_URLS[i].replace('.glb', '');
    const model = toonifyGLB(normalizeModel(g.scene, NPC_HEIGHTS[key] || 1.72));
    // PRON-3000 is a large open-book installation with a small character built
    // into it, not a humanoid body. Keep it anchored in the hub instead of
    // forcing the whole installation through the pedestrian auto-rig.
    if (key === 'npc_pronunciation_robot') {
      return { key, rigged: false, staticModel: model };
    }
    let mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp() });
    model.traverse((o) => { if (o.isMesh && o.material) mat = o.material; });
    const r = rigBase(model, mat);
    return r.ok
      ? { key, rigged: true, mesh: r.mesh, clips: r.clips }
      : { key, rigged: false, staticModel: model };
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
  citizens = new Citizens(scene, rig, npcBases);
  citizens.spawn(lowPowerHint ? 5 : 7);                // unique bodies at both quality tiers
  window.__EM = { player, world, zones: zoneMgr, camera: followCam, renderer, scene, camera3: camera, ui, audio, trains, traffic, citizens };
  // deterministic frame pump for headless verification (background tabs throttle rAF)
  window.__EM.step = (n = 1, dt = 1 / 60) => {
    uTime.value += n * dt;
    for (let i = 0; i < n; i++) simTick(dt);
    followCam.update(1 / 60, player.pos, { dx: 0, dy: 0, wheel: 0 }, world.colliders);
    minimap.update(0.25, player, zoneMgr, world, trains);   // force a redraw
    renderer.render(scene, camera);
  };
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
  renderer.setPixelRatio(MAX_PR * renderScale);
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', applySize);

// ---------- simulation (fixed step) / rendering (rAF) split ----------
const SIM_DT = 1 / 60;
let accumulator = 0;
let frameEMA = 16.7, fpsCount = 0, fpsTime = 0, scaleCooldown = 0;
let baseFov = 55;
let potato = false;

function simTick(dt) {
  if (!player) return;
  if (!ui.dialogOpen && !ui.guideOpen) {
    player.update(dt, input, -followCam.yaw, world.colliders);
  }
  world.update(performance.now() / 1000, dt, player.pos);
  zoneMgr.update(player.pos, world.colliders);
  citizens?.update(dt, player.pos);
  pedestrianBuffer.length = 0;
  if (citizens?.list) pedestrianBuffer.push(...citizens.list);
  if (world.cityLife?.people) pedestrianBuffer.push(...world.cityLife.people);
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
    followCam.update(rdt, player.pos, blocked ? { dx: 0, dy: 0, wheel: 0 } : mouse, world.colliders);

    // sprint FOV kick (cinematic juice)
    const targetFov = baseFov + player.speedFrac * (input.sprint ? 8 : 3);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-rdt * 5));
      camera.updateProjectionMatrix();
    }

    minimap.update(rdt, player, zoneMgr, world, trains);

    // NPC interaction
    const near = world.nearestNPC(player.pos);
    if (near && !blocked) {
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

  renderer.render(scene, camera);

  // dynamic resolution: EMA of frame time, adjust every 1.5s
  frameEMA = frameEMA * 0.95 + rdt * 1000 * 0.05;
  scaleCooldown -= rdt;
  if (scaleCooldown <= 0) {
    if (frameEMA > 20 && renderScale > 0.55) { renderScale = Math.max(0.55, renderScale - 0.1); applySize(); scaleCooldown = 1.5; }
    else if (frameEMA < 14 && renderScale < 1) { renderScale = Math.min(1, renderScale + 0.1); applySize(); scaleCooldown = 1.5; }
    // potato tier: min scale still can't hold ~40fps → shed the big GPU costs once
    if (!potato && renderScale <= 0.56 && frameEMA > 24) {
      potato = true;
      sun.castShadow = false;                     // shadows are the #1 cost
      renderer.shadowMap.enabled = false;
      scene.fog.density = 0.0085;                  // pull the horizon in
      camera.far = 700; camera.updateProjectionMatrix();
      citizens?.setDensity(4);                     // fewer skinned pedestrians
      world.cityLife?.setDensity(18);              // retain bustle with cheap instanced silhouettes
      traffic?.setDensity(6);                      // two cars per radial line
      console.info('[EM] potato tier engaged: shadows off, far=700, citizens=4, traffic=6');
    }
  }
  fpsCount++; fpsTime += rdt;
  if (fpsTime >= 0.5) { ui.setFPS(fpsCount / fpsTime, renderScale); fpsCount = 0; fpsTime = 0; }
});

console.log('%c🚇 ENGLISH METROPOLIS — no-build dev', 'color:#e8a13d; font-size:14px');
