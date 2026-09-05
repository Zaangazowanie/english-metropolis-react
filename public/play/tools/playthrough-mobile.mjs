// Mobile verification (393x852 touch, then landscape 852x393): Tap 💬 prompt,
// ? help button, labelled two-tap map, no HUD overlaps, every text ≥ 13px,
// 48px answer buttons, controls hidden under a dialog, zero pageerrors.
// Usage: TIER=medium node game-mobile.mjs http://127.0.0.1:4183/play/ prefix
import { chromium } from 'playwright';
import fs from 'node:fs';
const [url = 'http://127.0.0.1:4183/play/', prefix = 'gmm'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.clear();
  localStorage.setItem('em-student-session', JSON.stringify({ sessionToken: 'probe', slug: 'probe-mobile' }));
} catch {} });
const page = await ctx.newPage();
await page.route('**/api/query', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', value: { known: true, verified: true } }) }));
const logs = []; const R = { pass: [], fail: [] };
const check = (name, ok, detail) => { (ok ? R.pass : R.fail).push(name); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
page.on('response', r => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__EM && getComputedStyle(document.querySelector('#begin')).display !== 'none', null, { timeout: 150000 });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const step = (n) => ev((n) => window.__EM.step(n), n);
const frames = async (n = 2) => { const f0 = await ev(() => window.__EM.renderer.info.render.frame); await page.waitForFunction((f) => window.__EM.renderer.info.render.frame >= f, f0 + n, { timeout: 20000 }); };
const shot = async (n) => { await page.screenshot({ path: `${prefix}-${n}.png`, timeout: 120000 }); };
const smallText = () => ev(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length && ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    let p = el, hidden = false; while (p) { const c = getComputedStyle(p); if (c.display === 'none' || c.opacity === '0') { hidden = true; break; } p = p.parentElement; }
    if (hidden) continue;
    const fs = parseFloat(cs.fontSize);
    const txt = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (txt && fs < 13) out.push({ sel: (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]) + (el.closest('[id]') ? ' in #' + el.closest('[id]').id : ''), fs, txt });
  }
  return out;
});
const rects = (ids) => ev((ids) => Object.fromEntries(ids.map(id => { const el = document.getElementById(id); if (!el) return [id, null]; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return [id, cs.display === 'none' || cs.opacity === '0' || !r.width ? null : { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }]; })), ids);
const overlaps = (rs) => { const out = []; const ks = Object.keys(rs).filter(k => rs[k]); for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const a = rs[ks[i]], b = rs[ks[j]]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push(ks[i] + '×' + ks[j]); } return out; };
const HUD = ['zone-card', 'xp', 'rank', 'beta-tag', 'objective', 'prompt', 'minimap', 'stick', 'touch-ui', 'corner', 'toast'];

await page.locator('#begin').tap();
await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none', null, { timeout: 20000 });
await ev((t) => { window.__EM.quality.setManual(t); window.__EM.ui.voice.speak = () => {}; }, process.env.TIER || 'medium');
await frames(2);
check('welcome tour shows on first visit', await ev(() => window.__EM.ui.welcomeOpen));
check('welcome tour text ≥ 13px', (await smallText()).length === 0, await smallText());
await shot('01-welcome');
for (let i = 0; i < 7; i++) { if (!(await ev(() => window.__EM.ui.welcomeOpen))) break; await page.locator('#welcome-next').tap(); await page.waitForTimeout(150); }
check('tour finished', !(await ev(() => window.__EM.ui.welcomeOpen)));
await step(10); await frames(2);
await shot('02-hud-portrait');
let r = await rects(HUD);
check('portrait HUD: no overlaps', overlaps(r).length === 0, overlaps(r));
check('portrait HUD text ≥ 13px', (await smallText()).length === 0, await smallText());
check('? help button present', !!r['touch-ui'] && await ev(() => !!document.getElementById('tb-help') && getComputedStyle(document.getElementById('tb-help')).display !== 'none'));
await page.locator('#tb-help').tap(); await frames(1);
check('? opens the guide', await ev(() => window.__EM.ui.guideOpen));
await shot('03-guide-touch');
check('guide text ≥ 13px', (await smallText()).length === 0, await smallText());
await page.locator('#guide-close').tap(); await frames(1);
// walk to Clara
await ev(() => { const em = window.__EM; const n = em.world.npcs.find(n => n.zoneCode === 'hub' && n.npcIdx === 0); const p = n.obj.position; em.player.pos.set(p.x + 1, 0, p.z + 1); em.player.vel.set(0, 0, 0); em.camera.snap(); em.step(3); });
await frames(2);
const prompt = await ev(() => document.getElementById('prompt').innerText);
check('touch prompt reads "Tap 💬 — …"', /^Tap 💬/.test(prompt), prompt);
check('talk button pulses in range', await ev(() => document.getElementById('tb-talk').classList.contains('pulse')));
r = await rects(HUD);
check('prompt does not overlap the stick', !overlaps(r).some(o => /prompt/.test(o)), overlaps(r));
await shot('04-prompt-touch');
await page.locator('#tb-talk').tap(); await frames(1);
await page.waitForFunction(() => getComputedStyle(document.getElementById('dialog')).display === 'block');
const under = await rects(['stick', 'touch-ui', 'corner', 'prompt']);
check('stick / buttons / prompt hidden under the dialog', Object.values(under).every(v => v === null), under);
await page.locator('#dialog .opts button', { hasText: '❗' }).tap(); await page.waitForTimeout(150);
await page.locator('#dialog .opts button', { hasText: 'Start' }).tap(); await page.waitForTimeout(150);
const btnH = await ev(() => [...document.querySelectorAll('#dialog .opts button')].map(b => Math.round(b.getBoundingClientRect().height)));
check('answer buttons ≥ 48px on touch', btnH.every(h => h >= 48), btnH);
check('dialog text ≥ 13px', (await smallText()).length === 0, await smallText());
await shot('05-drill-touch');
const dr = await ev(() => { const d = document.getElementById('dialog').getBoundingClientRect(); return { top: Math.round(d.top), bottom: Math.round(d.bottom), vh: innerHeight }; });
check('dialog inside the viewport', dr.top >= 0 && dr.bottom <= dr.vh, dr);
await page.locator('#dialog .close').tap(); await frames(1);
// map: two-tap
await page.locator('#tb-map').tap(); await frames(1);
await page.waitForFunction(() => window.__EM.ui.mapOpen);
const cap = await ev(() => document.querySelector('#citymap .caption').innerText);
check('map caption is touch copy', /Tap a station/.test(cap), cap);
const target = await ev(() => { const em = window.__EM; const z = em.zones.zones[0]; const c = document.getElementById('citymap-canvas'); const r = c.getBoundingClientRect(); const W = c.width, C = W / 2, S = W / 920; return { name: z.data.zoneName, x: r.left + (C + z.stopPos.x * S) * (r.width / W), y: r.top + (C + z.stopPos.y * S) * (r.height / W), cssPerCanvas: r.width / W }; });
await page.touchscreen.tap(target.x + 6, target.y + 6); await page.waitForTimeout(200);
await shot('06-map-first-tap');
check('first tap selects (map still open, no ride)', await ev(() => window.__EM.ui.mapOpen) && (await ev(() => window.__EM.zones.current?.data?.code || 'hub')) === 'hub');
// the selected label is drawn on the canvas: sample pixels near the station for the dark label box
const labelled = await ev((t) => { const c = document.getElementById('citymap-canvas'); const ctx = c.getContext('2d'); const r = c.getBoundingClientRect(); const cx = (t.x - r.left) * (c.width / r.width), cy = (t.y - r.top) * (c.height / r.height); let dark = 0; for (let dy = -46; dy < -8; dy += 2) for (let dx = -60; dx < 60; dx += 4) { const p = ctx.getImageData(Math.round(cx + dx), Math.round(cy + dy), 1, 1).data; if (p[0] < 70 && p[1] < 60) dark++; } return dark; }, target);
check('station label drawn above the selected dot', labelled > 40, labelled);
await page.touchscreen.tap(target.x + 6, target.y + 6); await page.waitForTimeout(2500); await step(20); await frames(2);
check('second tap rides (from the hub platform)', (await ev(() => window.__EM.zones.current?.data?.code)) === 'uk_rp' && !(await ev(() => window.__EM.ui.mapOpen)));
await shot('07-arrived-touch');
check('district text ≥ 13px', (await smallText()).length === 0, await smallText());
check('map text ≥ 13px when open', await (async () => { await page.locator('#tb-map').tap(); await frames(1); const s = await smallText(); await page.locator('#citymap-close').tap(); await frames(1); return s.length === 0; })());
await page.locator('#tb-journal').tap(); await frames(1);
check('journal text ≥ 13px', (await smallText()).length === 0, await smallText());
await shot('08-journal-touch');
await page.locator('#journal-close').tap(); await frames(1);
await page.locator('#tb-metro').tap(); await frames(1);
check('metro text ≥ 13px', (await smallText()).length === 0, await smallText());
await page.locator('#metro-close').tap(); await frames(1);

// ---------- landscape ----------
await page.setViewportSize({ width: 852, height: 393 });
await page.waitForTimeout(300); await step(5); await frames(2);
await shot('09-landscape');
r = await rects(HUD);
check('landscape HUD: no overlaps', overlaps(r).length === 0, { overlaps: overlaps(r), r });
check('landscape text ≥ 13px', (await smallText()).length === 0, await smallText());
await ev(() => { const em = window.__EM; const n = em.world.npcs.find(n => n.zoneCode === 'uk_rp' && n.npcIdx === 0); const p = n.obj.position; em.player.pos.set(p.x + 1, 0, p.z + 1); em.player.vel.set(0, 0, 0); em.camera.snap(); em.step(3); });
await frames(2);
await page.locator('#tb-talk').tap(); await frames(1);
await page.waitForFunction(() => getComputedStyle(document.getElementById('dialog')).display === 'block');
await shot('10-landscape-dialog');
const dr2 = await ev(() => { const d = document.getElementById('dialog').getBoundingClientRect(); return { top: Math.round(d.top), bottom: Math.round(d.bottom), vh: innerHeight }; });
check('landscape dialog inside the viewport', dr2.top >= 0 && dr2.bottom <= dr2.vh + 1, dr2);
check('landscape: controls hidden under dialog', Object.values(await rects(['stick', 'touch-ui', 'corner'])).every(v => v === null));
await page.locator('#dialog .close').tap();

const errs = logs.filter(l => /pageerror|\[error\]|http 4|http 5/.test(l));
check('zero pageerrors / console errors / 4xx', errs.length === 0, errs.slice(0, 8));
fs.writeFileSync(`${prefix}-result.json`, JSON.stringify({ pass: R.pass, fail: R.fail, logs: logs.slice(-60) }, null, 2));
console.log(`\n=== ${R.pass.length} passed, ${R.fail.length} failed ===`);
if (R.fail.length) console.log('FAILED: ' + R.fail.join(' | '));
await browser.close();
