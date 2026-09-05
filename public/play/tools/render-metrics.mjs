// renderer.info per tier at the hub and in a district, with autoReset off so the
// numbers are truthful with postfx on. Usage: node game-metrics.mjs <url> <out.json>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [url = 'http://127.0.0.1:4183/play/', out = 'game-metrics.json'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('em-student-session', JSON.stringify({ sessionToken: 'probe', slug: 'metrics' })); localStorage.setItem('em_welcome', '1'); localStorage.setItem('em_guide_seen', '1'); } catch {} });
const page = await ctx.newPage();
await page.route('**/api/query', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', value: { known: true, verified: true } }) }));
const logs = []; page.on('pageerror', e => logs.push('[pageerror] ' + e.message)); page.on('console', m => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });
const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__EM && getComputedStyle(document.querySelector('#begin')).display !== 'none', null, { timeout: 150000 });
const loadMs = Date.now() - t0;
await page.locator('#begin').click({ force: true });
await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none', null, { timeout: 20000 });
await page.evaluate(() => { window.__EM.ui.voice.speak = () => {}; window.__EM.renderer.info.autoReset = false; });
const measure = (label) => page.evaluate((label) => {
  const em = window.__EM; const i = em.renderer.info;
  i.reset(); em.step(1);
  return { label, tier: em.quality.tier, calls: i.render.calls, triangles: i.render.triangles, programs: i.programs.length, geometries: i.memory.geometries, textures: i.memory.textures, npcs: em.world.npcs.length, speakers: em.crowd.speakers.length, crowd: em.crowd.agents.length };
}, label);
const results = { loadMs, tiers: {} };
for (const tier of ['potato', 'high']) {
  await page.evaluate((t) => { const em = window.__EM; em.quality.setManual(t); em.player.pos.set(0, 0, 8); em.player.vel.set(0, 0, 0); em.camera.yaw = 0; em.camera.pitch = 0.32; em.zones.update(em.player.pos, em.world.colliders); em.camera.snap(); em.step(20); }, tier);
  await page.waitForTimeout(800);
  const hub = await measure('hub');
  await page.evaluate(() => { const em = window.__EM; const z = em.zones.zones[0]; const ax = z.stopPos.x + (z.center.x - z.stopPos.x) * 0.46; const az = z.stopPos.y + (z.center.y - z.stopPos.y) * 0.46; em.player.pos.set(ax, 0, az); em.player.vel.set(0, 0, 0); em.player.heading = Math.atan2(z.dir.x, z.dir.y); em.camera.yaw = Math.atan2(-z.dir.x, -z.dir.y); em.camera.pitch = 0.28; em.zones.update(em.player.pos, em.world.colliders); em.camera.snap(); em.step(20); });
  await page.waitForTimeout(800);
  const district = await measure('district-0');
  results.tiers[tier] = { hub, district };
  console.log(tier, JSON.stringify({ hub, district }));
}
results.errors = logs;
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log('loadMs', loadMs, 'errors', logs.length);
await browser.close();
