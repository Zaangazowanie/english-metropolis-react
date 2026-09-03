import { chromium } from '/root/agora-harness/node_modules/playwright/index.mjs'
const BASE='http://127.0.0.1:4173'
let pass=0, fail=0; const out=[]
const ok=(n,c,d='')=>{c?(pass++,out.push('  PASS '+n)):(fail++,out.push('  FAIL '+n+(d?' — '+d:'')))}
const b = await chromium.launch({ args:['--no-sandbox'], executablePath:'/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' })

const CONSENT={version:1,decidedAt:'2026-08-10T00:00:00.000Z',necessary:true,functional:true,analytics:false,marketing:false}
const CART={items:[{id:'momentum',name:'8 lessons',pace:'weekly',pricePLN:880,qty:1}],savedAt:Date.now()}

for (const [label,w,h] of [['desktop',1440,900],['laptop',1280,800],['mobile',390,844],['small',360,780]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h} })
  const p = await ctx.newPage()
  await p.addInitScript(([c,cart]) => {
    localStorage.setItem('em_consent_v1', JSON.stringify(c))
    localStorage.setItem('em.cart.v1', JSON.stringify(cart))
  }, [CONSENT, CART])
  await p.goto(BASE+'/', { waitUntil:'domcontentloaded' })
  await p.waitForTimeout(4000)

  const geo = await p.evaluate(() => {
    const pill = document.querySelector('.emc-pill')
    const fab  = document.querySelector('.bjl-fab') || document.querySelector('.bjl-root')
    if (!pill || !fab) return { missing: { pill: !pill, fab: !fab } }
    const a = pill.getBoundingClientRect(), c = fab.getBoundingClientRect()
    const overlap = !(a.right <= c.left || c.right <= a.left || a.bottom <= c.top || c.bottom <= a.top)
    // what actually receives a click at the pill's centre
    const hit = document.elementFromPoint(a.left + a.width/2, a.top + a.height/2)
    const fabHit = document.elementFromPoint(c.left + c.width/2, c.top + c.height/2)
    return {
      overlap,
      pillVisible: getComputedStyle(pill).opacity !== '0',
      pill: {x:Math.round(a.left), y:Math.round(a.top), w:Math.round(a.width)},
      fab:  {x:Math.round(c.left), y:Math.round(c.top), w:Math.round(c.width)},
      pillHitIsCart: !!hit && !!hit.closest('.emc-pill'),
      fabHitIsWidget: !!fabHit && !!fabHit.closest('.bjl-root'),
      inViewport: a.left >= 0 && a.top >= 0 && a.right <= innerWidth && a.bottom <= innerHeight,
    }
  })
  if (geo.missing) { ok(`${label}: both controls present`, false, JSON.stringify(geo.missing)); await ctx.close(); continue }
  ok(`${label}: cart pill and launcher do not overlap`, geo.overlap === false, JSON.stringify(geo))
  ok(`${label}: clicking the cart hits the CART`, geo.pillHitIsCart, JSON.stringify(geo))
  ok(`${label}: clicking the launcher hits the WIDGET`, geo.fabHitIsWidget)
  ok(`${label}: cart pill fully on screen`, geo.inViewport, JSON.stringify(geo.pill))

  // now open the drawer and confirm the launcher steps aside
  await p.locator('.emc-pill').click()
  await p.waitForTimeout(900)
  const drawer = await p.evaluate(() => {
    const d = document.querySelector('.emc-drawer')
    const r = d.getBoundingClientRect()
    const root = document.querySelector('.bjl-root')
    const vis = root ? getComputedStyle(root).visibility : 'absent'
    // click-test the middle of the drawer: the widget must not be the target
    const hit = document.elementFromPoint(r.left + r.width/2, Math.min(innerHeight-5, r.top + r.height/2))
    return { launcherVisibility: vis, drawerOpen: d.getAttribute('data-open'), hitIsWidget: !!hit && !!hit.closest('.bjl-root') }
  })
  ok(`${label}: drawer opened`, drawer.drawerOpen === 'true')
  ok(`${label}: launcher hidden while drawer open`, drawer.launcherVisibility === 'hidden', JSON.stringify(drawer))
  ok(`${label}: widget never intercepts a click in the drawer`, drawer.hitIsWidget === false, JSON.stringify(drawer))

  // close it again; the launcher must come back
  await p.keyboard.press('Escape')
  await p.waitForTimeout(700)
  const after = await p.evaluate(() => {
    const root = document.querySelector('.bjl-root')
    return { vis: root ? getComputedStyle(root).visibility : 'absent',
             attr: document.body.getAttribute('data-emc-cart-open') }
  })
  ok(`${label}: launcher returns after closing`, after.vis === 'visible', JSON.stringify(after))
  await ctx.close()
}
await b.close()
console.log(out.join('\n')); console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
