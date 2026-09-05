// Headless SwiftShader tour of /play: hub, district, map, dialog. Writes PNGs + metrics JSON.
// Usage: node tour-play.mjs <url> <outPrefix> [--mobile]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [url = 'https://englishmetro.com/play/', prefix = 'tour', flag = ''] = process.argv.slice(2);
const mobile = flag === '--mobile';
// SMALL=1 iterates at 960x540 (cheap on the shared CPU); default 1440x900 for evidence shots.
const small = process.env.SMALL === '1';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext(mobile
  ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
  : { viewport: small ? { width: 960, height: 540 } : { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try {
  localStorage.setItem('em-student-session', JSON.stringify({ sessionToken: 'probe' }));
  localStorage.setItem('em_welcome', '1'); localStorage.setItem('em_guide_seen', '1');
} catch {} });
const page = await ctx.newPage();
await page.route('**/api/query', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', value: { verified: true } }) }));
const logs = [];
process.on('uncaughtException', async (e) => { console.error('FATAL', e.message); console.log('--- logs ---\n' + logs.filter(l => !l.startsWith('[bar]')).slice(-40).join('\n')); try { await browser.close(); } catch {} process.exit(1); });
process.on('SIGTERM', async () => { try { await browser.close(); } catch {} process.exit(143); });   // `timeout` must not orphan Chromium
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
page.on('response', r => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
page.on('requestfailed', r => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__EM && getComputedStyle(document.querySelector('#begin')).display !== 'none', null, { timeout: 150000 });
console.log('loaded in', Date.now() - t0, 'ms');
await page.evaluate(() => document.getElementById('begin').click());   // evaluate: a pulsing BEGIN is never 'stable' for Playwright
await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none', null, { timeout: 180000, polling: 500 });
// SwiftShader renders a full frame in 1-3 s: pause the continuous loop and drive frames with step() so probes are deterministic.
await page.evaluate(() => { window.__EM.renderer.setAnimationLoop(null); });
const step = (n) => page.evaluate((n) => window.__EM.step(n), n);
// SwiftShader is classed as a weak GPU → potato. Force the tier a real laptop gets so the
// screenshots show shadows + post stack. TIER env overrides (potato|low|medium|high|ultra).
const tier = process.env.TIER || 'high';
await page.evaluate((t) => { window.__EM.quality.setManual(t); }, tier);
await step(30); await page.waitForTimeout(800); await step(10);
const metrics = async (label) => page.evaluate((label) => { const em = window.__EM; const i = em.renderer.info; let meshes = 0, skinned = 0, lights = 0; em.scene.traverse(o => { if (o.isMesh) meshes++; if (o.isSkinnedMesh) skinned++; if (o.isLight) lights++; }); return { label, tier: em.quality?.tier, calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length, meshes, skinned, lights, crowd: em.crowd?.count ?? em.crowd?.capacity, citizens: em.citizens?.list?.length, npcs: em.world?.npcs?.length, zone: em.zones?.current?.data?.code || 'hub', xp: em.ui?.xp, pos: [em.player.pos.x.toFixed(1), em.player.pos.z.toFixed(1)] }; }, label);
const out = [];
await page.screenshot({ path: `${prefix}-1-hub.png`, timeout: 180000 }); out.push(await metrics('hub'));
// look around the hub
await page.evaluate(() => { const em = window.__EM; em.camera.yaw += 2.2; em.camera.pitch = 0.18; em.camera.snap(); em.step(10); });
await page.screenshot({ path: `${prefix}-2-hub-turn.png`, timeout: 180000 });
// teleport to zone 0 and zone 10 (different lines)
for (const [k, zi] of [[3, 0], [4, 15]]) {
  await page.evaluate((zi) => { const em = window.__EM; const z = em.zones.zones[zi]; const ax = z.stopPos.x + (z.center.x - z.stopPos.x) * 0.46; const az = z.stopPos.y + (z.center.y - z.stopPos.y) * 0.46; em.player.pos.set(ax, 0, az); em.player.vel.set(0, 0, 0); em.player.heading = Math.atan2(z.dir.x, z.dir.y); em.camera.yaw = Math.atan2(-z.dir.x, -z.dir.y); em.camera.pitch = 0.28; em.zones.update(em.player.pos, em.world.colliders); em.camera.snap(); em.step(40); }, zi);
  await page.waitForTimeout(1500); await step(30);
  await page.screenshot({ path: `${prefix}-${k}-district-${zi}.png`, timeout: 180000 }); out.push(await metrics(`district-${zi}`));
}
// walk toward an NPC in the current district and open the dialog
const npcInfo = await page.evaluate(() => { const em = window.__EM; const code = em.zones.current?.data?.code; const n = em.world.npcs.find(x => x.zoneCode === code) || em.world.npcs[0]; if (!n) return null; const p = n.obj?.position || n.pos; em.player.pos.set(p.x + 1.2, 0, p.z + 1.2); em.player.vel.set(0, 0, 0); em.camera.snap(); em.step(5); return { name: n.name, role: n.role, zone: n.zoneCode, grammar: n.grammar, exercise: n.exercise?.title }; });
console.log('npc:', JSON.stringify(npcInfo));
await page.keyboard.press('e'); await page.waitForTimeout(800); await step(5);
await page.screenshot({ path: `${prefix}-5-dialog.png`, timeout: 180000 });
const dialogText = await page.evaluate(() => document.querySelector('#dialog')?.innerText?.slice(0, 1500) || document.body.innerText.slice(0, 1200));
fs.writeFileSync(`${prefix}-dialog.txt`, dialogText);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
// map + journal + metro
await page.keyboard.press('m'); await page.waitForTimeout(800); await page.screenshot({ path: `${prefix}-6-map.png`, timeout: 180000 }); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.keyboard.press('j'); await page.waitForTimeout(800); await page.screenshot({ path: `${prefix}-7-journal.png`, timeout: 180000 }); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.keyboard.press('t'); await page.waitForTimeout(800); await page.screenshot({ path: `${prefix}-8-metro.png`, timeout: 180000 }); await page.keyboard.press('Escape');
fs.writeFileSync(`${prefix}-metrics.json`, JSON.stringify({ metrics: out, logs: logs.slice(-80) }, null, 2));
console.log(JSON.stringify(out, null, 1));
console.log('--- logs ---\n' + logs.filter(l => !l.startsWith('[bar]')).slice(-40).join('\n'));
await browser.close();
