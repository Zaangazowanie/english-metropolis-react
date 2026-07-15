import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let playwright;
try {
  playwright = await import('playwright-core');
} catch {
  const playwrightEntry = process.env.EM_PLAYWRIGHT_ENTRY || path.join(
    os.tmpdir(), 'englishmetro-browser-qa', 'node_modules', 'playwright-core', 'index.mjs',
  );
  playwright = await import(pathToFileURL(playwrightEntry).href);
}
const { chromium } = playwright;
const chromeCandidates = [
  process.env.EM_CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
let chrome = null;
for (const candidate of chromeCandidates) {
  try {
    await fs.access(candidate);
    chrome = candidate;
    break;
  } catch { /* try the next browser */ }
}
if (!chrome) throw new Error('Chrome not found; set EM_CHROME_PATH before running runtime QA.');
const baseUrl = process.argv[2] || 'http://127.0.0.1:4175/play/';
const outputDir = path.join(os.tmpdir(), 'englishmetro-runtime-qa');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: [
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});

async function collectMetrics(page) {
  return page.evaluate(() => {
    const em = window.__EM;
    const canvas = em.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const gl = em.renderer.getContext();
    em.renderer.render(em.scene, em.camera3);
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const stride = Math.max(1, Math.floor((canvas.width * canvas.height) / 50000));
    let samples = 0;
    let nonBlack = 0;
    let minLuma = 255;
    let maxLuma = 0;
    let sumLuma = 0;
    const palette = new Set();
    for (let pixel = 0; pixel < canvas.width * canvas.height; pixel += stride) {
      const i = pixel * 4;
      const luma = Math.round(pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722);
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
      sumLuma += luma;
      if (luma > 3) nonBlack++;
      palette.add(`${pixels[i] >> 4}:${pixels[i + 1] >> 4}:${pixels[i + 2] >> 4}`);
      samples++;
    }

    let objectCount = 0;
    let meshCount = 0;
    let skinnedCount = 0;
    em.scene.traverse((object) => {
      objectCount++;
      if (object.isMesh) meshCount++;
      if (object.isSkinnedMesh) skinnedCount++;
    });

    const hubNpcs = em.world.npcs
      .filter((npc) => npc.zoneCode === 'hub')
      .map((npc) => ({
        name: npc.name,
        clips: [...new Set((npc.mixer?._actions || []).map((action) => action._clip?.name).filter(Boolean))],
        skinned: Boolean(npc.model?.isSkinnedMesh),
      }));
    const rigResources = performance.getEntriesByType('resource')
      .filter((entry) => entry.name.includes('_rigged.glb'))
      .map((entry) => ({ name: entry.name.split('/').pop(), bytes: entry.transferSize || entry.decodedBodySize }));

    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      touch: {
        coarse: matchMedia('(pointer: coarse)').matches,
        points: navigator.maxTouchPoints,
        touchHud: document.body.classList.contains('touch'),
      },
      canvas: {
        cssWidth: Math.round(rect.width),
        cssHeight: Math.round(rect.height),
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        effectivePixelRatio: Number((canvas.width / Math.max(1, rect.width)).toFixed(3)),
        antialias: gl.getContextAttributes()?.antialias,
      },
      pixels: {
        samples,
        nonBlackRatio: Number((nonBlack / Math.max(1, samples)).toFixed(4)),
        minLuma,
        maxLuma,
        meanLuma: Number((sumLuma / Math.max(1, samples)).toFixed(2)),
        quantizedColors: palette.size,
      },
      scene: { objectCount, meshCount, skinnedCount },
      renderer: {
        calls: em.renderer.info.render.calls,
        triangles: em.renderer.info.render.triangles,
        geometries: em.renderer.info.memory.geometries,
        textures: em.renderer.info.memory.textures,
        shadowsEnabled: em.renderer.shadowMap.enabled,
      },
      heroActions: Object.keys(window.__RIG?.actions || {}),
      npcBases: (em.zones.npcBases || []).map((base) => ({ key: base.key, clips: Object.keys(base.clips || {}) })),
      hubNpcs,
      citizens: em.citizens?.list?.length || 0,
      traffic: em.traffic?.vehicles?.length || 0,
      rigResources,
      player: {
        x: Number(em.player.pos.x.toFixed(3)),
        z: Number(em.player.pos.z.toFixed(3)),
      },
      camera: {
        yaw: Number((em.camera.yaw || 0).toFixed(4)),
        pitch: Number((em.camera.pitch || 0).toFixed(4)),
      },
    };
  });
}

async function verifyDistrict(page, label) {
  await page.evaluate(() => {
    const em = window.__EM;
    const zone = em.zones.zones[0];
    const yaw = Math.atan2(zone.perp.x * zone.side, zone.perp.y * zone.side);
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const localZ = -8;
    const x = zone.center.x + localZ * sinY;
    const z = zone.center.y + localZ * cosY;
    const targetX = zone.center.x + 18 * sinY;
    const targetZ = zone.center.y + 18 * cosY;
    const viewX = targetX - x;
    const viewZ = targetZ - z;
    em.player.pos.set(x, 0, z);
    em.player.vel.set(0, 0, 0);
    em.camera.yaw = Math.atan2(-viewX, -viewZ);
    em.camera.pitch = 0.28;
    em.zones.update(em.player.pos, em.world.colliders);
    em.camera.snap();
    em.step(30);
  });
  await page.waitForTimeout(2400);
  await page.evaluate(() => window.__EM.step(30));

  const summary = await page.evaluate(() => {
    const em = window.__EM;
    const zone = em.zones.zones[0];
    const code = zone.data.code;
    const districtNpcs = em.world.npcs
      .filter((npc) => npc.zoneCode === code)
      .map((npc) => ({
        name: npc.name,
        role: npc.role,
        exercise: npc.exercise?.title,
        accent: npc.accentProfile?.lang,
        synthesizedVoice: !npc.voiceId,
      }));
    const streetGrid = em.scene.getObjectByName(`${code}-street-grid`);
    const colliders = em.zones._colliderTag.get(code) || [];
    const original = em.player.pos.clone();
    const input = {
      forward: false, back: false, left: false, right: false,
      sprint: false, jump: false,
    };
    const collisionChecks = [];
    for (const marker of ['building', 'parked-car', 'vendor-cart', 'emergency-stop']) {
      const collider = colliders.find((entry) => entry.source?.includes(marker));
      if (!collider) {
        collisionChecks.push({ marker, found: false, blocked: false });
        continue;
      }
      em.player.pos.set(
        (collider.minX + collider.maxX) / 2,
        0,
        (collider.minZ + collider.maxZ) / 2,
      );
      em.player.vel.set(0, 0, 0);
      em.player.update(1 / 60, input, -em.camera.yaw, em.world.colliders, []);
      const stillInside = em.player.pos.x > collider.minX && em.player.pos.x < collider.maxX
        && em.player.pos.z > collider.minZ && em.player.pos.z < collider.maxZ;
      collisionChecks.push({ marker, found: true, blocked: !stillInside, source: collider.source });
    }

    const npc = districtNpcs.length ? em.world.npcs.find((entry) => entry.zoneCode === code) : null;
    if (npc) {
      em.player.pos.copy(npc.obj.position);
      em.player.vel.set(0, 0, 0);
      em.player.update(1 / 60, input, -em.camera.yaw, em.world.colliders, [npc]);
      collisionChecks.push({
        marker: 'npc',
        found: true,
        blocked: em.player.pos.distanceTo(npc.obj.position) >= 0.7,
        source: npc.name,
      });
    }
    em.player.pos.copy(original);
    em.player.vel.set(0, 0, 0);
    em.player.root.position.copy(original);
    em.step(2);

    return {
      code,
      zoneName: zone.data.zoneName,
      currentZone: em.zones.current?.data?.code,
      localCount: districtNpcs.length,
      uniqueExercises: new Set(districtNpcs.map((npc) => npc.exercise)).size,
      districtNpcs,
      streetGridPieces: streetGrid?.children?.length || 0,
      roadLayout: streetGrid?.userData?.roadLayout || null,
      raisedMarkings: streetGrid?.getObjectByName('raised-road-markings')?.count || 0,
      oneWayArrows: streetGrid?.getObjectByName('one-way-direction-arrows')?.count || 0,
      colliderCount: colliders.length,
      collisionChecks,
    };
  });
  const screenshot = path.join(outputDir, `${label}-district.png`);
  await page.screenshot({ path: screenshot });
  return { ...summary, screenshot };
}

async function verify(label, contextOptions) {
  const context = await browser.newContext(contextOptions);
  await context.addInitScript(() => {
    localStorage.setItem('em_welcome', '1');
    localStorage.setItem('em_guide_seen', '1');
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => failedRequests.push({
    url: request.url(),
    error: request.failure()?.errorText || 'unknown',
  }));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForFunction(
      () => window.__EM && getComputedStyle(document.querySelector('#begin')).display !== 'none',
      null,
      { timeout: 90000 },
    );
  } catch (error) {
    const screenshot = path.join(outputDir, `${label}-load-failure.png`);
    await page.screenshot({ path: screenshot });
    const loadState = await page.evaluate(() => ({
      sub: document.querySelector('#loading .sub')?.textContent,
      beginDisplay: getComputedStyle(document.querySelector('#begin')).display,
      hasGame: Boolean(window.__EM),
      bodyClasses: document.body.className,
    }));
    await context.close();
    return {
      label,
      screenshot,
      loadError: error.message,
      loadState,
      pageErrors,
      consoleErrors,
      failedRequests,
    };
  }
  await page.locator('#begin').click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none');
  await page.evaluate(() => window.__EM.step(30));

  const beforeInteraction = await collectMetrics(page);
  if (label === 'desktop') {
    const canvas = page.locator('#app canvas');
    const box = await canvas.boundingBox();
    if (box) {
      const x = box.x + box.width * 0.55;
      const y = box.y + box.height * 0.48;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 150, y - 35, { steps: 8 });
      await page.mouse.up();
      await page.keyboard.down('w');
      await page.waitForTimeout(850);
      await page.keyboard.up('w');
      await page.evaluate(() => window.__EM.step(12));
    }
  }
  const afterInteraction = await collectMetrics(page);
  const screenshot = path.join(outputDir, `${label}.png`);
  await page.screenshot({ path: screenshot });
  const district = await verifyDistrict(page, label);
  await context.close();
  return {
    label,
    screenshot,
    beforeInteraction,
    afterInteraction,
    district,
    pageErrors,
    consoleErrors,
    failedRequests,
  };
}

try {
  const desktop = await verify('desktop', {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const mobile = await verify('mobile', {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  for (const result of [desktop, mobile]) {
    const district = result.district;
    if (result.loadError) throw new Error(`${result.label}: game did not finish loading`);
    if (result.pageErrors.length || result.consoleErrors.length || result.failedRequests.length) {
      throw new Error(`${result.label}: browser errors detected during runtime QA`);
    }
    if (!district?.roadLayout || district.roadLayout.twoWayWidth < 6.2) {
      throw new Error(`${result.label}: district two-way roads are below the two-lane clearance`);
    }
    if (district.roadLayout.oneWayWidth < 4 || district.oneWayArrows < 3) {
      throw new Error(`${result.label}: one-way roads are not wide or clearly marked enough`);
    }
    if (district.roadLayout.markingClearance < 0.01 || district.raisedMarkings < 20) {
      throw new Error(`${result.label}: road paint is not safely raised above the asphalt`);
    }
  }
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
} finally {
  await browser.close();
}
