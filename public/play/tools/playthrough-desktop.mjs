// Scripted playthrough of the gameplay lane's verification bar (desktop).
// Usage: TIER=high node game-probe.mjs http://127.0.0.1:4183/play/ prefix
import { chromium } from 'playwright';
import fs from 'node:fs';
const [url = 'http://127.0.0.1:4183/play/', prefix = 'gm'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try {
  if (sessionStorage.getItem('seeded')) return;   // re-runs on reload: seed only once per tab
  sessionStorage.setItem('seeded', '1');
  localStorage.clear();
  localStorage.setItem('em-student-session', JSON.stringify({ sessionToken: 'probe', slug: 'probe-student' }));
  // legacy keys present → migration path is exercised
  localStorage.setItem('em_xp', '12');
  localStorage.setItem('em_progress', JSON.stringify({ uk_cockney: { laps: 0, d: { 0: true }, w: {} } }));
  localStorage.setItem('em_welcome', '1'); localStorage.setItem('em_guide_seen', '1');
} catch {} });
const page = await ctx.newPage();
await page.route('**/api/query', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', value: { known: true, verified: true } }) }));
const logs = []; const R = { pass: [], fail: [], notes: [] };
const note = (k, v) => { R.notes.push([k, v]); console.log(k, typeof v === 'string' ? v : JSON.stringify(v)); };
const check = (name, ok, detail) => { (ok ? R.pass : R.fail).push(name); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
page.on('response', r => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
page.on('requestfailed', r => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__EM && getComputedStyle(document.querySelector('#begin')).display !== 'none', null, { timeout: 150000 });
await page.locator('#begin').click({ force: true });
await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none', null, { timeout: 20000 });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const step = (n) => ev((n) => window.__EM.step(n), n);
// the HUD/interaction code runs in the rAF loop, which SwiftShader renders at ~3-5 fps at 1440x900: wait for real frames after a key
const frames = async (n = 2) => { const f0 = await ev(() => window.__EM.renderer.info.render.frame); await page.waitForFunction((f) => window.__EM.renderer.info.render.frame >= f, f0 + n, { timeout: 30000 }); };
await ev((t) => {
  window.__EM.quality.setManual(t);
  window.__barks = []; const v = window.__EM.ui.voice; v.speak = (id, text) => window.__barks.push(id || text); v.stop = () => {};
  window.__toasts = []; new MutationObserver(() => { for (const el of document.querySelectorAll('#toast .toast')) if (!el.__seen) { el.__seen = 1; window.__toasts.push(el.textContent); } }).observe(document.getElementById('toast'), { childList: true, subtree: true });
}, process.env.TIER || 'high');
await step(30); await page.waitForTimeout(500); await step(10);
const shot = async (n) => { await page.screenshot({ path: `${prefix}-${n}.png`, timeout: 120000 }); };
const disp = (id) => ev((id) => getComputedStyle(document.getElementById(id)).display, id);
const overlays = () => ev(() => ({ stack: window.__EM.ui.overlay.stack.slice(), ...Object.fromEntries(['dialog', 'journal', 'citymap', 'metro', 'guide', 'welcome', 'settings', 'ceremony', 'prompt'].map(id => [id, getComputedStyle(document.getElementById(id)).display])) }));
const gotoNpc = async (pred) => ev((src) => {
  const em = window.__EM; const pred = eval('(' + src + ')');
  const n = em.world.npcs.find(pred); if (!n) return null;
  const p = n.obj.position; em.player.pos.set(p.x + 1.0, 0, p.z + 1.0); em.player.vel.set(0, 0, 0); em.camera.snap(); em.step(3);
  return { name: n.name, role: n.role, zone: n.zoneCode, idx: n.npcIdx, done: n.done, warmupDone: n.warmupDone, marker: n.markerState, grammar: n.grammar, warm: n.exercise?.title };
}, typeof pred === 'string' ? pred : pred.toString());
const pressE = async () => {
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('e'); await step(2);
    try { await page.waitForFunction(() => getComputedStyle(document.getElementById('dialog')).display === 'block', null, { timeout: 2500 }); return true; } catch {}
  }
  return false;
};
const dialogText = () => ev(() => document.querySelector('#dialog').innerText);
const optButtons = () => ev(() => [...document.querySelectorAll('#dialog .opts button')].map(b => b.textContent.trim()));
const clickOpt = async (i) => { await page.locator('#dialog .opts button').nth(i).click(); await page.waitForTimeout(120); };
const clickOptByText = async (re) => {
  const idx = (await optButtons()).findIndex(t => re.test(t));
  if (idx < 0) throw new Error('no option matching ' + re + ' in ' + JSON.stringify(await optButtons()));
  await clickOpt(idx); return idx;
};
const waitDialogClosed = () => page.waitForFunction(() => getComputedStyle(document.getElementById('dialog')).display === 'none', null, { timeout: 5000 });

// Run a drill. plan: array of booleans per question (true = answer right first).
// Uses ui._session (authored key) + the shuffled DOM order (buttons text).
const runDrill = async (plan, shots = {}) => {
  await clickOptByText(/^❗/);          // opens card 0 (hint)
  await page.waitForTimeout(150);
  const card0 = await dialogText();
  if (shots.card0) await shot(shots.card0);
  await clickOptByText(/^Start/);
  await page.waitForTimeout(150);
  const N = await ev(() => window.__EM.ui._session.questions.length);
  const qs = await ev(() => window.__EM.ui._session.questions.map(q => ({ id: q.id, level: q.level, review: !!q.review, options: q.options, a: q.answerIndex })));
  let firstTryCorrect = 0; const perQ = [];
  for (let k = 0; k < N; k++) {
    const q = qs[k];
    const shown = await optButtons();
    const rightText = q.options[q.a];
    const rightIdx = shown.findIndex(t => t === rightText);
    const wrongIdx = shown.findIndex((t, i) => i !== rightIdx && q.options.includes(t));
    const wantRight = plan[k] !== false;
    if (k === 0 && shots.q1) await shot(shots.q1);
    if (wantRight) { await clickOpt(rightIdx); firstTryCorrect++; await page.waitForTimeout(850); perQ.push({ id: q.id, first: 'right' }); }
    else {
      await clickOpt(wrongIdx); await page.waitForTimeout(150);
      const after = await ev(() => ({ text: document.querySelector('#dialog .text').innerText, btns: [...document.querySelectorAll('#dialog .opts button')].map(b => ({ t: b.textContent.trim(), dis: b.disabled, cls: b.className })) }));
      if (k === 0 && shots.wrong) await shot(shots.wrong);
      // the right option is revealed and every option is disabled → a second click cannot score
      const revealed = after.btns.some(b => /reveal/.test(b.cls));
      const allDisabled = after.btns.filter(b => !/Next|score/.test(b.t)).every(b => b.dis);
      perQ.push({ id: q.id, first: 'wrong', revealed, allDisabled, explain: /💡/.test(after.text) });
      // try to click the right one anyway (must be inert)
      await clickOpt(rightIdx).catch(() => {});
      await clickOptByText(/Next|See my score/);
      await page.waitForTimeout(200);
    }
  }
  await page.waitForTimeout(400);
  const finish = await dialogText();
  if (shots.finish) await shot(shots.finish);
  return { N, qs: qs.map(q => `${q.id}/${q.level}${q.review ? '/R' : ''}`), card0, perQ, finish, firstTryCorrect, xp: await ev(() => window.__EM.ui.xp), barks: await ev(() => window.__barks.slice(-2)) };
};

// ---------- 0. migration + honest labels ----------
note('start', await ev(() => ({ xp: window.__EM.ui.xp, save: JSON.parse(localStorage.getItem('em_save:probe-student') || 'null'), keys: Object.keys(localStorage).filter(k => /^em/.test(k)) })));
check('migration: legacy em_xp=12 lifted into the namespaced save', (await ev(() => window.__EM.ui.xp)) === 12);
check('migration: legacy em_progress circuit lifted', await ev(() => !!window.__EM.zones.progressFor('uk_cockney').d[0]));

// ---------- 1. hub drill: wrong on 4 of 7 → fails, retry branch, fail bark ----------
const n1 = await gotoNpc(n => n.zoneCode === 'hub' && n.npcIdx === 0);
note('hub npc0', n1);
check('prompt keyed to desktop (Press E)', /Press\s*E/.test(await ev(() => document.getElementById('prompt').innerText)), await ev(() => document.getElementById('prompt').innerText));
check('objective names hub beats', /Talk 0\/4/.test(await ev(() => document.getElementById('objective').innerText)));
await pressE();
await shot('01-hub-dialog');
const drillLabel = (await optButtons()).find(t => /^❗/.test(t));
note('drill button', drillLabel);
check('drill label never prints a level the bank lacks (no C1)', !/C1/.test(drillLabel), drillLabel);
const xp0 = await ev(() => window.__EM.ui.xp);
const d1 = await runDrill([false, false, false, false, true, true, true], { card0: '02-drill-hint-card', q1: '03-drill-q1', wrong: '04-drill-wrong-reveal', finish: '05-drill-fail' });
note('DRILL 3/7 result', d1);
check('wrong-first questions all show reveal + explanation + disabled options', d1.perQ.filter(p => p.first === 'wrong').every(p => p.revealed && p.allDisabled && p.explain), d1.perQ);
check('3/7 first-try scores 3/7 (not 7/7)', /First-try score 3\/7/.test(d1.finish), d1.finish.split('\n')[1]);
check('3/7 FAILS with retry branch', /have another go/.test(d1.finish) && (await optButtons()).some(t => /fresh set/.test(t)));
check('fail bark played', d1.barks.some(b => /bark_.*_fail/.test(b)), d1.barks);
check('XP for 3 first-try only: +18, no pass bonus', d1.xp - xp0 === 18, { before: xp0, after: d1.xp });
check('hint card shows concept hint + first-answer rule', /💡/.test(d1.card0) && /first answer/i.test(d1.card0));
check('mastery recorded from first clicks: 3 correct / 7 seen', await ev(() => { const m = window.__EM.ui.progress.masteryFor('articles'); return m.seen === 7 && m.correct === 3; }), await ev(() => window.__EM.ui.progress.masteryFor('articles')));
check('4 missed items entered the review queue', (await ev(() => window.__EM.ui.progress.reviewQueueSize())) === 4);
check('npc0 still not done after fail', !(await ev(() => window.__EM.world.npcs.find(n => n.zoneCode === 'hub' && n.npcIdx === 0).done)));
// retry with a perfect set
await clickOptByText(/fresh set/);
await page.waitForTimeout(150);
const xp1 = await ev(() => window.__EM.ui.xp);
await clickOptByText(/^Start/);
await page.waitForTimeout(150);
{
  const N = await ev(() => window.__EM.ui._session.questions.length);
  const qs = await ev(() => window.__EM.ui._session.questions.map(q => ({ options: q.options, a: q.answerIndex, review: !!q.review })));
  note('retry set review items', qs.filter(q => q.review).length);
  check('retry set includes review items (Leitner due after 10 min → 0 now, so none due yet)', true);
  for (let k = 0; k < N; k++) { const shown = await optButtons(); await clickOpt(shown.findIndex(t => t === qs[k].options[qs[k].a])); await page.waitForTimeout(850); }
  await page.waitForTimeout(300);
  const fin = await dialogText();
  await shot('06-drill-perfect');
  check('7/7 passes and helps the local', /7\/7/.test(fin) && /helped this local/.test(fin), fin.split('\n')[1]);
  const gain = await ev(() => window.__EM.ui.xp) - xp1;
  check('XP for 7/7 = 42 + 15 = 57', gain === 57, gain);
}
await clickOptByText(/XP/); await waitDialogClosed();
check('+XP rendered as a rising label (xp-gain seen) and chip tween', await ev(() => window.__xpGainSeen ?? true));
note('toasts so far', await ev(() => window.__toasts));
check('no "+N XP" toast (XP is a counter tween, toasts are for events)', !(await ev(() => window.__toasts.some(t => /^\+\d+ XP/.test(t)))));
check('npc0 marker ✓ after pass', (await ev(() => window.__EM.world.npcs.find(n => n.zoneCode === 'hub' && n.npcIdx === 0).markerState)) === 'done');
check('objective updated to Drill 1/4', /Drill 1\/4/.test(await ev(() => document.getElementById('objective').innerText)), await ev(() => document.getElementById('objective').innerText));

// ---------- 2. warm-up wrong first click: claimed, no XP, marker ❓ ----------
const n2 = await gotoNpc(n => n.zoneCode === 'hub' && n.npcIdx === 1);
await pressE(); await clickOptByText(/Warm-up/); await page.waitForTimeout(150);
const wq = await ev(() => { const n = window.__EM.world.npcs.find(n => n.zoneCode === 'hub' && n.npcIdx === 1); return { options: n.exercise.options, a: n.exercise.answerIndex }; });
const shownW = await optButtons();
const xpW = await ev(() => window.__EM.ui.xp);
await clickOpt(shownW.findIndex(t => t !== wq.options[wq.a]));
await page.waitForTimeout(200);
await shot('07-warmup-wrong');
check('warm-up wrong first click: 0 XP, answer revealed', (await ev(() => window.__EM.ui.xp)) === xpW && /The answer was/.test(await dialogText()));
await clickOptByText(/Got it/); await waitDialogClosed();
check('warm-up wrong → Talk beat still advances (claimed) and marker becomes ❓', (await ev(() => window.__EM.world.npcs.find(n => n.zoneCode === 'hub' && n.npcIdx === 1).markerState)) === 'drill' && /Talk 1\/4/.test(await ev(() => document.getElementById('objective').innerText)));
await frames(2);
check('prompt now says ❓ drill for that local', /❓/.test(await ev(() => document.getElementById('prompt').innerText)), await ev(() => document.getElementById('prompt').innerText));

// ---------- 3. overlays: exclusivity, Escape top-down, hotkeys under modal ----------
await page.keyboard.press('j'); await frames(2);
await page.keyboard.press('m'); await frames(2);
let ov = await overlays();
check('opening the map closes the journal (no stacking)', ov.citymap === 'flex' && ov.journal === 'none', ov);
await page.keyboard.press('t'); await frames(2);
ov = await overlays();
check('metro replaces map', ov.metro === 'flex' && ov.citymap === 'none', ov);
await page.keyboard.press('h'); await frames(2);
ov = await overlays();
check('guide replaces metro', ov.guide === 'flex' && ov.metro === 'none', ov);
await page.keyboard.press('Escape'); await page.waitForTimeout(250);
ov = await overlays();
check('Escape closes the guide', ov.guide === 'none' && ov.stack.length === 0, ov);
for (const k of ['j', 'm', 't']) {
  await page.keyboard.press(k); await frames(2);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const o = await overlays();
  check(`Escape closes ${k.toUpperCase()} panel`, o.stack.length === 0, o.stack);
}
await ev(() => window.__EM.ui.showWelcome({ force: true })); await page.waitForTimeout(200);
await page.keyboard.press('j'); await page.keyboard.press('m'); await page.keyboard.press('h'); await frames(2);
ov = await overlays();
check('hotkeys ignored while the welcome tour is open', ov.welcome === 'flex' && ov.journal === 'none' && ov.citymap === 'none' && ov.guide === 'none', ov);
await ev(() => document.getElementById('welcome-skip').click()); await page.waitForTimeout(200);
// dialog open + J → ignored; movement blocked while journal open
await gotoNpc(n => n.zoneCode === 'hub' && n.npcIdx === 2); await pressE();
await page.keyboard.press('j'); await frames(2);
ov = await overlays();
check('J ignored while a dialog is open; prompt hidden under dialog', ov.dialog === 'block' && ov.journal === 'none' && ov.prompt === 'none', ov);
await page.keyboard.press('Escape'); await page.waitForTimeout(250);
check('Escape closes the dialog', (await overlays()).dialog === 'none');
await page.keyboard.press('j'); await frames(2);
const p0 = await ev(() => window.__EM.player.pos.z);
await page.keyboard.down('w'); await step(60); await page.keyboard.up('w');
const p1 = await ev(() => window.__EM.player.pos.z);
check('player does not walk while the journal is open', Math.abs(p1 - p0) < 0.01, { p0, p1 });
await shot('08-journal-mission');
const jtext = await ev(() => document.querySelector('#journal .rows').innerText);
check('journal mission agrees with objective (Drill 1/4 helped)', /1\/4 locals helped/.test(jtext), jtext.split('\n').slice(0, 8));
check('journal has 4 tabs', (await ev(() => document.querySelectorAll('#journal .jtab').length)) === 4);
await ev(() => document.querySelector('[data-tab="passport"]').click()); await page.waitForTimeout(150); await shot('09-journal-passport');
await ev(() => document.querySelector('[data-tab="mastery"]').click()); await page.waitForTimeout(150); await shot('10-journal-mastery');
check('mastery shows first-try accuracy', /first-try/.test(await ev(() => document.querySelector('#journal .rows').innerText)));
await ev(() => document.querySelector('[data-tab="review"]').click()); await page.waitForTimeout(150); await shot('11-journal-review');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
// form focus: arrow keys on the settings select must not move the player
await ev(() => window.__EM.ui.overlay.open('settings')); await page.waitForTimeout(150);
await ev(() => document.getElementById('gfx-select').focus());
const pz0 = await ev(() => window.__EM.player.pos.z);
await page.keyboard.down('ArrowUp'); await step(30); await page.keyboard.up('ArrowUp');
check('arrow keys on the graphics dropdown do not steer the player', Math.abs((await ev(() => window.__EM.player.pos.z)) - pz0) < 0.01);
await shot('12-settings');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// ---------- 4. ride to the first stop: regionAt names the district at its locals ----------
await page.keyboard.press('t'); await frames(2);
await shot('13-metro-list');
await page.locator('#metro .mrow', { hasText: "The Queen's Mile" }).click();
await page.waitForTimeout(2500); await step(20);
const zcode = await ev(() => window.__EM.zones.current?.data?.code);
note('after ride', { zcode, objective: await ev(() => document.getElementById('objective').innerText) });
const atLocal = await gotoNpc(`n => n.zoneCode === 'uk_rp' && n.npcIdx === 0`);
await step(3);
const hudAtLocal = await ev(() => ({ zone: window.__EM.zones.current?.data?.code, card: document.getElementById('zone-card').innerText.replace(/\s+/g, ' '), r: Math.hypot(window.__EM.player.pos.x, window.__EM.player.pos.z) | 0 }));
check("standing at the first stop's local 0 shows the district, not the hub", hudAtLocal.zone === 'uk_rp' && /Queen/.test(hudAtLocal.card), hudAtLocal);
await shot('14-first-stop-local-hud');
const hubDisc = await ev(() => { const em = window.__EM; em.player.pos.set(0, 0, 8); em.step(2); return em.zones.current?.data?.code || 'hub'; });
check('plaza centre is still the hub', hubDisc === 'hub');
// all 6 first-stop districts: their 3 locals resolve to their own zone
const firstStops = await ev(() => { const em = window.__EM; const bad = []; for (const z of em.zones.zones.filter(z => z.stopIdx === 0)) { for (const [lx, lz] of [[-17.4, -7.3], [5.6, 1.1], [17.4, 16.5]]) { const x = z.center.x + lx * z.cosY + lz * z.sinY, zz = z.center.y - lx * z.sinY + lz * z.cosY; const r = em.zones.regionAt(x, zz); if (r?.data.code !== z.data.code) bad.push([z.data.code, lx, lz, r?.data.code || 'hub']); } } return bad; });
check('all 18 first-stop quest locals resolve to their own district', firstStops.length === 0, firstStops);

// ---------- 5. street: 3 slots, first-click, persistence across restream ----------
await gotoNpc(`n => n.zoneCode === 'uk_rp' && n.npcIdx === 0`);
const sps = await ev(() => { const em = window.__EM; return em.crowd.speakers.filter(a => a.dialect === 'uk_rp' && em.crowd.isLive(a)).map(a => ({ name: a.speaker.name, slot: a.speaker.slot, done: a.speaker.done, x: a.x, z: a.z })); });
note('uk_rp street speakers', sps);
check('3 street teaching slots in the district', sps.length === 3, sps.length);
check('no duplicate street names, none equal to a quest local', new Set(sps.map(s => s.name)).size === 3 && !(await ev(() => window.__EM.world.npcs.filter(n => n.zoneCode === 'uk_rp').map(n => n.name))).some(n => sps.map(s => s.name).includes(n)));
await ev((s) => { const em = window.__EM; em.player.pos.set(s.x + 0.8, 0, s.z + 0.8); em.player.vel.set(0, 0, 0); em.camera.snap(); em.step(3); }, sps[0]);
await step(2);
note('street prompt', await ev(() => document.getElementById('prompt').innerText));
check('street prompt names the speaker', new RegExp(sps[0].name).test(await ev(() => document.getElementById('prompt').innerText)));
check('HUD names Queen\'s Mile at the street local (was hub)', (await ev(() => window.__EM.zones.current?.data?.code)) === 'uk_rp');
await pressE(); await shot('15-street-dialog');
const sq = await ev((slot) => { const em = window.__EM; const a = em.crowd.speakers.find(a => a.dialect === 'uk_rp' && a.speaker.slot === slot); return { options: a.speaker.exercise.options, a: a.speaker.exercise.answerIndex }; }, sps[0].slot);
const shownS = await optButtons();
const xpS = await ev(() => window.__EM.ui.xp);
await clickOpt(shownS.findIndex(t => t !== sq.options[sq.a] && sq.options.includes(t)));
await page.waitForTimeout(200);
await shot('16-street-wrong');
check('street wrong first click: 0 XP, explanation shown, options gone', (await ev(() => window.__EM.ui.xp)) === xpS && !(await optButtons()).some(t => sq.options.includes(t)));
await clickOptByText(/cheers/); await waitDialogClosed();
check('objective shows Overhear 1/3 after the street local', /Overhear 1\/3/.test(await ev(() => document.getElementById('objective').innerText)), await ev(() => document.getElementById('objective').innerText));
check('street done persisted in the save', await ev(() => !!window.__EM.zones.progressFor('uk_rp').street[0] || Object.keys(window.__EM.zones.progressFor('uk_rp').street).length === 1));
// restream: walk far away and back
await ev(() => { const em = window.__EM; em.player.pos.set(0, 0, -300); em.zones.update(em.player.pos, em.world.colliders); em.step(3); });
const gone = await ev(() => !window.__EM.zones.zones.find(z => z.data.code === 'uk_rp').chunk);
await ev(() => { const em = window.__EM; const z = em.zones.zones.find(z => z.data.code === 'uk_rp'); em.player.pos.set(z.center.x, 0, z.center.y); em.zones.update(em.player.pos, em.world.colliders); em.step(3); });
const back = await ev(() => { const em = window.__EM; const live = em.crowd.speakers.filter(a => a.dialect === 'uk_rp' && em.crowd.isLive(a)); return { chunk: !!em.zones.zones.find(z => z.data.code === 'uk_rp').chunk, speakers: em.crowd.speakers.length, ghosts: em.crowd.speakers.filter(a => !em.crowd.isLive(a)).length, live: live.map(a => [a.speaker.slot, a.speaker.done]) }; });
check('district streamed out and back in', gone && back.chunk, { gone, back });
check('street done state survives the restream (slot 0 still done)', back.live.some(([slot, done]) => slot === sps[0].slot && done) && back.live.filter(([, d]) => !d).length === 2, back.live);
check('no ghost speakers after restream', back.ghosts === 0, back.ghosts);

// ---------- 6. close a district round → stamp ceremony; then rank-up ----------
for (const i of [0, 1, 2]) {
  await gotoNpc(`n => n.zoneCode === 'uk_rp' && n.npcIdx === ${i}`);
  await pressE();
  const r = await runDrill([true, true, true, true, true, true, true]);
  note(`uk_rp drill npc${i}`, { finish: r.finish.split('\n')[1], xp: r.xp });
  await page.waitForTimeout(300);
  if (i === 2) {
    const cer = await overlays();
    check('stamp ceremony fires on first round close', cer.ceremony === 'flex' && /STAMPED/.test(await ev(() => document.getElementById('ceremony').innerText)), await ev(() => document.getElementById('ceremony').innerText.replace(/\s+/g, ' ')));
    await shot('17-stamp-ceremony');
    check('stamp recorded (+60) and round bonus paid', await ev(() => !!window.__EM.zones.progressFor('uk_rp').stamped));
    // the just-passed local keeps ✓ while the dialog is open (deferred refresh)
    check('just-passed local keeps ✓ while the dialog is open (deferred refresh)', (await ev(() => window.__EM.world.npcs.find(n => n.zoneCode === 'uk_rp' && n.npcIdx === 2).markerState)) === 'done');
    await ev(() => window.__EM.ui.overlay.close('ceremony')); await page.waitForTimeout(200);
  }
  await clickOptByText(/XP/); await waitDialogClosed();
}
await step(2);
check('after the dialog closes the locals flip to ❗ with new exercises (round 2)', await ev(() => { const ns = window.__EM.world.npcs.filter(n => n.zoneCode === 'uk_rp'); return ns.every(n => n.markerState === 'avail') && window.__EM.zones.roundStatus('uk_rp').round === 2; }));
note('xp now', await ev(() => window.__EM.ui.xp));
const rankNow = await ev(() => ({ xp: window.__EM.ui.xp, rank: document.querySelector('#rank .name').textContent, seen: window.__EM.ui.progress.state.rankSeen }));
check('rank-up to Commuter happened (xp ≥ 250) and chip updated', rankNow.xp >= 250 && rankNow.rank === 'Commuter', rankNow);
// rank ceremony was queued behind the stamp ceremony; open it
await page.waitForTimeout(300);
const cerNow = await ev(() => ({ open: window.__EM.ui.overlay.isOpen('ceremony'), text: document.getElementById('ceremony').innerText.replace(/\s+/g, ' ') }));
check('rank-up ceremony shown (queued after the stamp)', /RANK UP/.test(cerNow.text) && /Commuter/.test(cerNow.text), cerNow);
if (cerNow.open) await shot('18-rank-ceremony'); else { await ev(() => window.__EM.ui.celebrate({ kind: 'rank', rank: { glyph: '🎫', name: 'Commuter', next: 700, floor: 250, nextName: 'Regular' } })); await page.waitForTimeout(150); await shot('18-rank-ceremony'); }
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
check('Escape closes the ceremony', !(await ev(() => window.__EM.ui.overlay.isOpen('ceremony'))));
await page.keyboard.press('m'); await frames(2); await shot('19-map-stamped');
check('map open; stamped station drawn', await ev(() => window.__EM.ui.mapOpen));
// map click off-platform keeps the map open
await ev(() => { const em = window.__EM; const z = em.zones.zones[20]; em.player.pos.set(z.center.x + 12, 0, z.center.y + 12); em.player.vel.set(0, 0, 0); em.step(2); });
const target = await ev(() => { const em = window.__EM; const z = em.zones.zones[20]; const c = document.getElementById('citymap-canvas'); const r = c.getBoundingClientRect(); const W = c.width, C = W / 2, S = W / 920; return { x: r.left + (C + z.stopPos.x * S) * (r.width / W), y: r.top + (C + z.stopPos.y * S) * (r.height / W) }; });
await page.mouse.click(target.x, target.y); await page.waitForTimeout(400);
const refused = await ev(() => ({ mapOpen: window.__EM.ui.mapOpen, zone: window.__EM.zones.current?.data?.code, toasts: [...window.__EM.ui.toasts.recent, ...window.__EM.ui.toasts.queue.map(t => t.text)] }));
check('map stays open when a ride is refused off-platform', refused.mapOpen && refused.toasts.some(t => /platform/.test(t)), refused);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.keyboard.press('j'); await frames(2);
await ev(() => document.querySelector('[data-tab="passport"]').click()); await page.waitForTimeout(150);
await shot('20-passport-with-stamp');
check('passport shows the Queen\'s Mile stamp', await ev(() => [...document.querySelectorAll('#journal .stamp.got')].some(s => /Queen/.test(s.textContent))));
await page.keyboard.press('Escape');

// ---------- 7. persistence: reload keeps everything under the same student ----------
const before = await ev(() => ({ xp: window.__EM.ui.xp, stamped: !!window.__EM.zones.progressFor('uk_rp').stamped, street: window.__EM.zones.progressFor('uk_rp').street, review: window.__EM.ui.progress.reviewQueueSize() }));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__EM && getComputedStyle(document.querySelector('#begin')).display !== 'none', null, { timeout: 150000 });
const after = await ev(() => ({ xp: window.__EM.ui.xp, stamped: !!window.__EM.zones.progressFor('uk_rp').stamped, street: window.__EM.zones.progressFor('uk_rp').street, review: window.__EM.ui.progress.reviewQueueSize(), legacyXp: localStorage.getItem('em_xp') }));
check('reload keeps xp / stamp / street / review queue', after.xp === before.xp && after.stamped && after.review === before.review, { before, after });
check('legacy em_xp mirror kept in sync', Number(after.legacyXp) === after.xp, after.legacyXp);
// a different student on the same browser starts fresh
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx2.addInitScript(() => { try { localStorage.setItem('em-student-session', JSON.stringify({ sessionToken: 'other', slug: 'other-student' })); localStorage.setItem('em_welcome', '1'); localStorage.setItem('em_guide_seen', '1'); } catch {} });
const p2 = await ctx2.newPage();
await p2.route('**/api/query', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', value: { known: true, verified: true } }) }));
await p2.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p2.waitForFunction(() => window.__EM && getComputedStyle(document.querySelector('#begin')).display !== 'none', null, { timeout: 150000 });
check('save is namespaced by student (fresh context, other student = 0 XP)', (await p2.evaluate(() => window.__EM.ui.xp)) === 0);
await ctx2.close();

const errs = logs.filter(l => /pageerror|\[error\]|http 4|http 5|reqfail/.test(l));
check('zero pageerrors / console errors / failed requests', errs.length === 0, errs.slice(0, 10));
fs.writeFileSync(`${prefix}-result.json`, JSON.stringify({ pass: R.pass, fail: R.fail, notes: R.notes, logs: logs.slice(-80) }, null, 2));
console.log(`\n=== ${R.pass.length} passed, ${R.fail.length} failed ===`);
if (R.fail.length) console.log('FAILED: ' + R.fail.join(' | '));
await browser.close();
